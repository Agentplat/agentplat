"""Credential-free, hash-verified bundles. Export only allowlisted operational data."""
import csv
import os
import shutil
import stat
import tempfile
import zipfile
from pathlib import Path

from .results import read_json
from .study import ROOT, digest, verify_files, write_json

COLUMNS = ['slot_id', 'task', 'arm', 'repetition', 'block', 'reward', 'protocol_ok',
           'success', 'accounting_complete', 'input_tokens', 'cache_read_tokens',
           'cache_write_tokens', 'output_tokens', 'model_steps', 'provider_calls',
           'task_tools', 'coordination_tools', 'wall_seconds', 'cost_usd', 'known_cost_usd', 'incident_count']


def collect(campaign, output):
    campaign, output = Path(campaign), Path(output)
    output.mkdir(parents=True, exist_ok=False)
    rows, calls, events, incidents = [], [], [], []
    manifest = read_json(campaign / 'campaign.json')
    if manifest is None: raise ValueError('Missing campaign manifest')
    for attempt in sorted((campaign / 'attempts').glob('*.json')):
        info = read_json(attempt)
        slot = info['slot']
        job = campaign / 'jobs' / slot['slot_id']
        result = read_json(job / 'result.json', {})
        trials = result.get('trial_results', [])
        if not trials:
            trials = [read_json(p) for p in job.glob('*/result.json')]
        if len(trials) > 1: raise ValueError('Expected exactly one attempt per slot')
        trial = trials[0] if trials else {}
        trial_path = job / trial.get('trial_name', 'missing')
        operational = trial_path / 'agent/operational'
        summary = read_json(operational / 'summary.json', {})
        reward = (trial.get('verifier_result') or {}).get('rewards', {}).get('reward')
        faults = summary.get('incidents', []) + info.get('incidents', [])
        if trial.get('exception_info'): faults.append({'reason': 'harbor_exception'})
        if not read_json(trial_path / 'verifier/ctrf.json', {}).get('results', {}).get('tests'):
            faults.append({'reason': 'verifier_not_executed'})
        if not summary: faults.append({'reason': 'missing_reconciliation'})
        row = {key: summary.get(key) for key in COLUMNS}
        row.update({key: slot[key] for key in ('slot_id', 'task', 'arm', 'repetition', 'block')})
        row.update(reward=reward, protocol_ok=summary.get('protocol_ok', False) and not faults,
                   success=reward == 1 and summary.get('protocol_ok', False) and not faults,
                   incident_count=len(faults))
        rows.append(row)
        for filename, target in [('calls.json', calls), ('events.json', events)]:
            target.extend(dict(slot_id=slot['slot_id'], **r) for r in read_json(operational / filename, []))
        incidents.extend(dict(slot_id=slot['slot_id'], **fault) for fault in faults)
        trajectory = operational / 'trajectory.json'
        if trajectory.is_file():
            target = output / 'traces' / f'{slot["slot_id"]}.json'
            target.parent.mkdir(exist_ok=True)
            shutil.copy2(trajectory, target)
        environment = operational / 'environment.json'
        if environment.is_file():
            target = output / 'environments' / f'{slot["slot_id"]}.json'
            target.parent.mkdir(exist_ok=True)
            shutil.copy2(environment, target)
    with (output / 'runs.csv').open('w') as stream:
        writer = csv.DictWriter(stream, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    for name, value in [('campaign.json', manifest), ('calls.json', calls), ('events.json', events), ('incidents.json', incidents)]:
        write_json(output / name, value)
    for name in ('images.json', 'authorization.json'):
        if (campaign / name).is_file(): shutil.copy2(campaign / name, output / name)
    return output


def seal(directory):
    directory = Path(directory)
    files = {}
    for path in sorted(directory.rglob('*')):
        if path.is_symlink(): raise ValueError('Symlinks are forbidden in bundles')
        if path.is_file() and path.name != 'manifest.json':
            files[path.relative_to(directory).as_posix()] = {'sha256': digest(path.read_bytes()), 'size': path.stat().st_size}
    write_json(directory / 'manifest.json', {'format': 'agentplat-native-eval-v1', 'files': files})


def verify_bundle(directory):
    directory = Path(directory)
    manifest = read_json(directory / 'manifest.json')
    if not manifest or manifest.get('format') != 'agentplat-native-eval-v1':
        raise ValueError('Unsupported or missing bundle manifest')
    verify_files(directory, manifest['files'])
    actual = {p.relative_to(directory).as_posix() for p in directory.rglob('*') if p.is_file()}
    if actual != set(manifest['files']) | {'manifest.json'}:
        raise ValueError('Undeclared files in bundle')
    return manifest


def export_zip(directory, archive):
    directory, archive = Path(directory), Path(archive)
    verify_bundle(directory)
    with zipfile.ZipFile(archive, 'x', compression=zipfile.ZIP_DEFLATED) as handle:
        for path in sorted(directory.rglob('*')):
            if path.is_file(): handle.write(path, path.relative_to(directory))
    return digest(archive.read_bytes())


def import_zip(archive, destination, expected_sha256):
    archive, destination = Path(archive), Path(destination)
    if digest(archive.read_bytes()) != expected_sha256: raise ValueError('ZIP hash mismatch')
    if destination.exists(): raise ValueError('Import requires a new directory')
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=destination.parent) as tmp:
        root = Path(tmp)
        with zipfile.ZipFile(archive) as handle:
            names = set()
            if sum(i.file_size for i in handle.infolist()) > 512 * 1024 * 1024:
                raise ValueError('Bundle exceeds 512 MiB limit')
            for entry in handle.infolist():
                name = entry.filename
                if (name in names or Path(name).is_absolute() or '..' in Path(name).parts
                        or '\\' in name or entry.is_dir()
                        or stat.S_ISLNK(entry.external_attr >> 16)):
                    raise ValueError('Unsafe ZIP entry')
                names.add(name)
                target = root / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(handle.read(entry))
        verify_bundle(root)
        os.rename(root, destination)


def reports(bundle):
    """Execute the study notebook against the supplied bundle, with no credentials."""
    import nbformat
    from nbclient import NotebookClient
    from nbconvert import HTMLExporter
    bundle = Path(bundle).resolve()
    target = bundle / 'reports'
    target.mkdir(exist_ok=True)
    source = ROOT / 'notebooks/study.ipynb'
    notebook = nbformat.read(source, as_version=4)
    notebook.cells.insert(0, nbformat.v4.new_code_cell(f'BUNDLE = {str(bundle)!r}'))
    NotebookClient(notebook, timeout=180, kernel_name='python3').execute(cwd=str(ROOT))
    html, _ = HTMLExporter(exclude_input=True).from_notebook_node(notebook)
    (target / f'{source.stem}.html').write_text(html)


def comparison(runs):
    """Costs include failed attempts; any unknown total makes cost/success unknown."""
    import pandas as pd
    if runs.empty: return pd.DataFrame()
    rows = []
    for (task, arm), frame in runs.groupby(['task', 'arm']):
        successes = int(frame['success'].eq(True).sum())
        known = frame['cost_usd'].notna().all()
        total = frame['cost_usd'].sum() if known else None
        rows.append(dict(task=task, arm=arm, attempts=len(frame), successes=successes,
            cost_usd=total, cost_per_success=total / successes if known and successes else None))
    return pd.DataFrame(rows)
