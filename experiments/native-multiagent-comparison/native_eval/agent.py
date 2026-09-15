"""Harbor installed-agent adapter. Paid execution is gated by the study CLI."""
import asyncio
import json
import os
import shutil
from pathlib import Path

from harbor.agents.installed.claude_code import ClaudeCode

from .gateway import Ledger, gateway
from .study import ROOT, MODEL, CLAUDE_VERSION, digest, fetch, write_json

NODE_ARCHIVE = 'node-v24.18.0-linux-x64.tar.xz'
NODE_SHA256 = '55aa7153f9d88f28d765fcdad5ae6945b5c0f98a36881703817e4c450fa76742'
PACKAGES = ('core', 'events', 'model', 'tools', 'workflows', 'runtime', 'streaming', 'sessions', 'rooms')


def stage_runtime():
    """Copy built public packages, excluding tests, solutions and developer config."""
    stage = ROOT / '.cache/runner'
    if stage.exists(): shutil.rmtree(stage)
    stage.mkdir(parents=True, exist_ok=True)
    shutil.copytree(ROOT / 'runtime/node_modules', stage / 'node_modules', dirs_exist_ok=True)
    for name in PACKAGES:
        source = ROOT.parents[1] / 'packages' / name
        target = stage / 'node_modules/@agentplat' / name
        shutil.copytree(source / 'dist', target / 'dist', dirs_exist_ok=True)
        shutil.copy2(source / 'package.json', target / 'package.json')
    shutil.copy2(ROOT / 'runtime/dist/rooms.js', stage / 'rooms.js')
    shutil.copy2(ROOT / 'runtime/dist/mcp.js', stage / 'mcp.js')
    shutil.copy2(ROOT / 'native_eval/controller.py', stage / 'controller.py')
    (stage / 'package.json').write_text('{"type":"module"}\n')
    node = ROOT / '.cache' / NODE_ARCHIVE
    if not node.is_file() or digest(node.read_bytes()) != NODE_SHA256:
        archive = fetch('https://nodejs.org/dist/v24.18.0/' + NODE_ARCHIVE)
        if digest(archive) != NODE_SHA256:
            raise ValueError('Node archive hash mismatch')
        node.write_bytes(archive)
    shutil.copy2(node, stage / NODE_ARCHIVE)
    return stage


class NativeTeam(ClaudeCode):
    """One adapter, two explicit coordination arms, same installer and controller."""
    def __init__(self, logs_dir, arm, budget_usd, timeout_sec, gateway_host='host.docker.internal', **kwargs):
        if arm not in ('agentplat', 'agent-teams'):
            raise ValueError('Unknown study arm')
        Ledger(budget_usd)
        self.arm, self.budget, self.timeout = arm, str(budget_usd), int(timeout_sec)
        self.gateway_host = gateway_host
        self.summary = None
        kwargs.pop('version', None)
        kwargs.pop('model_name', None)
        super().__init__(logs_dir=logs_dir, version=CLAUDE_VERSION, model_name=MODEL, **kwargs)

    @staticmethod
    def name():
        return 'agentplat-native-study'

    async def setup(self, environment):
        await super().setup(environment)
        result = await environment.exec(command='apt-get update && apt-get install -y python3 xz-utils', user='root')
        if result.return_code:
            raise RuntimeError('Common controller setup failed; inspect APT, do not change task files')
        await environment.upload_dir(source_dir=stage_runtime(), target_dir='/opt/native-eval')
        result = await environment.exec(command=(
            f'tar -xJf /opt/native-eval/{NODE_ARCHIVE} -C /usr/local --strip-components=1 && '
            'claude --version && node --version && python3 --version'), user='root')
        if result.return_code or CLAUDE_VERSION not in result.stdout or 'v24.18.0' not in result.stdout:
            raise RuntimeError('Installed runtimes differ from protocol')
        (self.logs_dir / 'runtime-versions.txt').write_text(result.stdout)
        result = await environment.exec(command='test ! -e /tests && test ! -e /solution', user='root')
        if result.return_code:
            raise RuntimeError('Verifier or solution visible before solving')
        result = await environment.exec(command="python3 -c \"import json; from pathlib import Path; print(json.dumps({k:Path('/sys/fs/cgroup/'+k).read_text().strip() for k in ('cpu.max','memory.max')}))\"", user='root')
        if result.return_code:
            raise RuntimeError('Cannot verify cgroup v2 resource limits')
        resources = json.loads(result.stdout)
        quota, period = resources['cpu.max'].split()
        if (quota == 'max' or int(quota) / int(period) != environment.task_env_config.cpus
                or int(resources['memory.max']) != environment.task_env_config.memory_mb * 1024 * 1024):
            raise RuntimeError('Effective CPU/RAM differs from official task limits')
        write_json(self.logs_dir / 'resources.json', resources)

    async def run(self, instruction, environment, context):
        api_key = os.environ.get('ANTHROPIC_API_KEY')
        if not api_key:
            raise ValueError('The executor must supply their own ANTHROPIC_API_KEY')
        native = self.logs_dir / 'native'
        private = self.logs_dir / 'provider-private'
        system_prompt = (ROOT / 'prompts' / f'{self.arm}.txt').read_text()
        with gateway(self.budget, api_key, private) as proxy:
            config = dict(arm=self.arm, directory='/logs/agent/native', timeout_sec=self.timeout,
                gateway_url=f'http://{self.gateway_host}:{proxy["port"]}', gateway_token=proxy['token'],
                instruction=instruction, system_prompt=system_prompt)
            config_path = self.logs_dir / 'controller.private.json'
            write_json(config_path, config)
            config_path.chmod(0o600)
            await environment.upload_file(source_path=config_path, target_path='/opt/native-eval/config.json')
            try:
                await environment.exec(command='python3 /opt/native-eval/controller.py run /opt/native-eval/config.json',
                                       timeout_sec=self.timeout + 20, user='root')
            finally:
                # Stop synchronously before Harbor starts its verifier, including cancellation.
                async def cleanup():
                    command = """python3 - <<'PY'
import json, os, signal, time
from pathlib import Path
root=Path('/logs/agent/native')
def live(pid):
 path=Path(f'/proc/{pid}/stat')
 try: return path.read_text().rsplit(')', 1)[1].split()[0] != 'Z'
 except FileNotFoundError: return False
def stop(pid, sig):
 try: os.kill(pid, sig)
 except ProcessLookupError: pass
pids=[int(p.read_text()) for p in (root/'controller.pid', root/'bridge.pid') if p.exists()]
if pids: stop(pids[0], signal.SIGTERM)
deadline=time.monotonic()+30
while any(live(pid) for pid in pids) and time.monotonic()<deadline: time.sleep(.1)
forced=any(live(pid) for pid in pids)
groups=root/'processes.json'
if groups.exists():
 for group in json.loads(groups.read_text()):
  try: os.killpg(group, signal.SIGKILL)
  except ProcessLookupError: pass
for pid in pids: stop(pid, signal.SIGKILL)
time.sleep(.1)
remaining=[pid for pid in pids if live(pid)]
if groups.exists():
 for path in Path('/proc').glob('[0-9]*/stat'):
  try: fields=path.read_text().rsplit(')', 1)[1].split()
  except FileNotFoundError: continue
  if fields[0] != 'Z' and int(fields[2]) in json.loads(groups.read_text()): remaining.append(int(path.parent.name))
(root/'cleanup.json').write_text(json.dumps(dict(forced=forced, remaining=remaining)))
if remaining: raise RuntimeError('Team processes still running')
PY"""
                    try:
                        result = await environment.exec(command=command, user='root', timeout_sec=35)
                        if result.return_code:
                            raise RuntimeError('Could not verify team termination')
                    except BaseException:
                        await environment.stop(delete=True)
                        raise
                    await environment.download_dir(source_dir='/logs/agent/native', target_dir=native)
                await asyncio.shield(cleanup())
        from .results import reconcile
        self.summary = reconcile(self.logs_dir, self.arm)
        write_json(self.logs_dir / 'study-summary.json', self.summary)
        self.populate_context_post_run(context)

    def populate_context_post_run(self, context):
        # Harbor invokes this after timeout too. Never use its character/token fallback.
        if self.summary is None:
            from .results import reconcile
            self.summary = reconcile(self.logs_dir, self.arm)
        context.metadata = {'study': self.summary}
        if self.summary['accounting_complete']:
            for field, key in [('n_input_tokens', 'total_input_tokens'), ('n_cache_tokens', 'cache_read_tokens'),
                               ('n_output_tokens', 'output_tokens'), ('cost_usd', 'cost_usd')]:
                setattr(context, field, self.summary[key])
