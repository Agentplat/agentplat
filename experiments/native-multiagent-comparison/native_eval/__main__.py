"""Run from the experiment directory: uv run python -m native_eval --help."""
import argparse
import asyncio
import json
import platform
import subprocess
import time
import fcntl
from pathlib import Path

from harbor.job import Job
from harbor.models.job.config import JobConfig
from harbor.models.task.config import TaskConfig

from . import bundle
from .agent import stage_runtime
from .gateway import Ledger
from .results import read_json
from .study import ROOT, TASKS, ARMS, PILOT, MODEL, CLAUDE_VERSION, COMMIT, SEED, prepare, schedule, digest, write_json


def fingerprint():
    files = [ROOT / p for p in ('benchmark.lock.json', 'schedule.json', 'amd64.yaml', 'pyproject.toml', 'uv.lock', 'runtime/package-lock.json')]
    files += list((ROOT / 'native_eval').glob('*.py')) + list((ROOT / 'runtime').glob('*.ts')) + list((ROOT / 'prompts').glob('*.txt'))
    files += list((ROOT / 'runtime/dist').glob('*.js'))
    for name in ('rooms.js', 'mcp.js'):
        if not (ROOT / 'runtime/dist' / name).is_file(): raise ValueError('Build the experiment runtime before freezing a plan')
    hashes = {p.relative_to(ROOT).as_posix(): digest(p.read_bytes()) for p in sorted(files)}
    from .agent import PACKAGES
    for package in PACKAGES:
        if not (ROOT.parents[1] / 'packages' / package / 'dist/index.js').is_file():
            raise ValueError('Build the public AgentPlat packages before freezing a plan')
        for path in sorted((ROOT.parents[1] / 'packages' / package / 'dist').rglob('*.js')):
            hashes[path.relative_to(ROOT.parents[1]).as_posix()] = digest(path.read_bytes())
    return dict(files=hashes, sha256=digest(json.dumps(hashes, sort_keys=True).encode()))


def plan(destination):
    destination.mkdir(parents=True, exist_ok=False)
    write_json(destination / 'campaign.json', dict(protocol='rooms-vs-native-teams-v1',
        benchmark_commit=COMMIT, harbor='0.20.0', claude_code=CLAUDE_VERSION,
        model=MODEL, effort='high', seed=SEED, schedule=schedule(),
        benchmark_lock=read_json(ROOT / 'benchmark.lock.json'),
        implementation=fingerprint(), results_status='not_run'))


def check_images(task_names):
    lock = read_json(ROOT / 'benchmark.lock.json')
    evidence = {}
    for name in task_names:
        config = TaskConfig.model_validate(__import__('tomllib').loads((ROOT / '.cache/tasks' / name / 'task.toml').read_text()))
        image = config.environment.docker_image
        if not image: raise ValueError('Official task must declare a prebuilt image')
        subprocess.run(['docker', 'pull', '--platform', 'linux/amd64', image], check=True, capture_output=True)
        inspect = json.loads(subprocess.check_output(['docker', 'image', 'inspect', image]))[0]
        if inspect['Architecture'] != 'amd64': raise ValueError('Expected Linux AMD64 image')
        expected = lock.get('images', {}).get(name, {}).get('digest')
        digests = inspect.get('RepoDigests', [])
        if expected and not any(d.endswith('@' + expected) for d in digests):
            raise ValueError('Official image digest changed')
        if not digests: raise ValueError('Image has no immutable repository digest')
        (ROOT / '.cache' / f'{name}.yaml').write_text('services:\n  main:\n    image: ' + digests[0] + '\n')
        evidence[name] = dict(digests=digests, architecture=inspect['Architecture'],
                             image_id=inspect['Id'], resources=config.environment.model_dump(mode='json'))
    return evidence


def job_config(task, agent, name, directory):
    return JobConfig.model_validate(dict(job_name=name, jobs_dir=str(directory),
        n_attempts=1, n_concurrent_trials=1, retry={'max_retries': 0},
        environment={'type': 'docker', 'delete': True,
                     'extra_docker_compose': [str(ROOT / 'amd64.yaml'), str(ROOT / '.cache' / f'{task}.yaml')]},
        agents=[agent], tasks=[{'path': str(ROOT / '.cache/tasks' / task)}]))


async def controls(directory):
    prepare()
    images = check_images(TASKS)
    directory.mkdir(parents=True, exist_ok=False)
    evidence = dict(implementation=fingerprint(), images=images,
                    host=dict(system=platform.system(), machine=platform.machine()), attempts=[])
    for task in TASKS:
        for control in ('oracle', 'nop'):
            name = f'{task}--{control}'
            result = await (await Job.create(job_config(task, {'name': control}, name, directory))).run()
            trial = result.trial_results[0]
            ctrf_path = directory / name / trial.trial_name / 'verifier/ctrf.json'
            ctrf = read_json(ctrf_path, {})
            reward = trial.verifier_result.rewards.get('reward') if trial.verifier_result else None
            evidence['attempts'].append(dict(task=task, control=control, reward=reward,
                verifier_executed=bool(ctrf.get('results', {}).get('tests')),
                exception=trial.exception_info is not None,
                result_sha256=digest((directory / name / 'result.json').read_bytes())))
            write_json(directory / 'validation.json', evidence)
    evidence['passed'] = all(a['verifier_executed'] and not a['exception'] and
        a['reward'] == (1 if a['control'] == 'oracle' else 0) for a in evidence['attempts'])
    write_json(directory / 'validation.json', evidence)
    return evidence


async def attempt(campaign, slot, budget, gateway_host):
    marker = campaign / 'attempts' / f'{slot["slot_id"]}.json'
    if marker.exists(): raise ValueError('Attempt already exists; automatic retries are disabled')
    marker.parent.mkdir(parents=True, exist_ok=True)
    info = dict(slot=slot, started=time.time(), incidents=[])
    write_json(marker, info)
    timeout = TaskConfig.model_validate(__import__('tomllib').loads((ROOT / '.cache/tasks' / slot['task'] / 'task.toml').read_text())).agent.timeout_sec
    agent = dict(import_path='native_eval.agent:NativeTeam', model_name=MODEL,
                 kwargs=dict(arm=slot['arm'], budget_usd=budget, timeout_sec=timeout, gateway_host=gateway_host))
    try:
        result = await (await Job.create(job_config(slot['task'], agent, slot['slot_id'], campaign / 'jobs'))).run()
        trial = result.trial_results[0]
        summary = read_json(campaign / 'jobs' / slot['slot_id'] / trial.trial_name / 'agent/operational/summary.json', {})
        ctrf = read_json(campaign / 'jobs' / slot['slot_id'] / trial.trial_name / 'verifier/ctrf.json', {})
        if trial.exception_info or not summary.get('protocol_ok') or not ctrf.get('results', {}).get('tests'):
            raise ValueError('Trial has an incident; campaign stopped for inspection')
    except Exception as error:
        info['incidents'].append({'reason': type(error).__name__})
        raise
    finally:
        info['ended'] = time.time()
        write_json(marker, info)


def paid_preflight():
    import os
    if not os.environ.get('ANTHROPIC_API_KEY'): raise ValueError('Executor API key is missing')
    docker = json.loads(subprocess.check_output(['docker', 'info', '--format', '{{json .}}']))
    if platform.system() != 'Linux' or docker['Architecture'] not in ('x86_64', 'amd64'):
        raise ValueError('Paid pilot and campaign require a native Linux AMD64 host')
    prepare()
    stage_runtime()


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('prepare')
    p = sub.add_parser('plan'); p.add_argument('directory', type=Path)
    p = sub.add_parser('controls'); p.add_argument('directory', type=Path)
    p = sub.add_parser('pilot'); p.add_argument('directory', type=Path)
    p.add_argument('--arm', choices=ARMS, required=True); p.add_argument('--budget-usd', required=True)
    p.add_argument('--gateway-host', default='host.docker.internal')
    p = sub.add_parser('run'); p.add_argument('directory', type=Path)
    p.add_argument('--budget-usd', required=True); p.add_argument('--trial-budget-usd', required=True)
    p.add_argument('--validation', type=Path, required=True); p.add_argument('--pilots', type=Path, nargs=2, required=True)
    p.add_argument('--gateway-host', default='host.docker.internal')
    p = sub.add_parser('export'); p.add_argument('directory', type=Path); p.add_argument('archive', type=Path)
    p = sub.add_parser('import'); p.add_argument('archive', type=Path); p.add_argument('directory', type=Path)
    p.add_argument('--sha256', required=True)
    p = sub.add_parser('reports'); p.add_argument('directory', type=Path)
    args = parser.parse_args()
    if args.command in ('controls', 'pilot', 'run'):
        (ROOT / '.cache').mkdir(exist_ok=True)
        execution_lock = (ROOT / '.cache/execution.lock').open('w')
        fcntl.flock(execution_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    if args.command == 'prepare':
        print(prepare()); print(stage_runtime())
    elif args.command == 'plan': plan(args.directory)
    elif args.command == 'controls': print(json.dumps(await controls(args.directory), indent=2))
    elif args.command == 'pilot':
        Ledger(args.budget_usd)
        paid_preflight()
        plan(args.directory)
        write_json(args.directory / 'images.json', check_images([PILOT]))
        slot = dict(slot_id=f'pilot--{args.arm}', task=PILOT, arm=args.arm, repetition=0, block=0)
        await attempt(args.directory, slot, args.budget_usd, args.gateway_host)
        write_json(args.directory / 'pilot.json', dict(arm=args.arm, passed=True, implementation=fingerprint()))
    elif args.command == 'run':
        campaign = read_json(args.directory / 'campaign.json')
        if not campaign or campaign['implementation'] != fingerprint(): raise ValueError('Implementation changed; freeze a new plan')
        if Ledger(args.budget_usd).limit < 12 * Ledger(args.trial_budget_usd).limit:
            raise ValueError('Campaign authorization must cover the same explicit budget for all 12 trials')
        validation = read_json(args.validation)
        if not validation or not validation.get('passed') or validation.get('implementation') != fingerprint():
            raise ValueError('Original oracle/nop controls have not passed for this implementation')
        pilots = [read_json(p / 'pilot.json', {}) for p in args.pilots]
        if {p.get('arm') for p in pilots} != set(ARMS) or not all(p.get('passed') and p.get('implementation') == fingerprint() for p in pilots):
            raise ValueError('Both real paid pilot proofs are required for this exact implementation')
        paid_preflight()
        write_json(args.directory / 'images.json', check_images(TASKS))
        write_json(args.directory / 'authorization.json', dict(budget_usd=args.budget_usd, trial_budget_usd=args.trial_budget_usd))
        for slot in schedule(): await attempt(args.directory, slot, args.trial_budget_usd, args.gateway_host)
    elif args.command == 'export':
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            directory = bundle.collect(args.directory, Path(tmp) / 'bundle')
            bundle.seal(directory)
            bundle.reports(directory)
            bundle.seal(directory)
            print(bundle.export_zip(directory, args.archive))
    elif args.command == 'import': bundle.import_zip(args.archive, args.directory, args.sha256)
    elif args.command == 'reports':
        bundle.verify_bundle(args.directory)
        bundle.reports(args.directory)
        bundle.seal(args.directory)


if __name__ == '__main__':
    asyncio.run(main())
