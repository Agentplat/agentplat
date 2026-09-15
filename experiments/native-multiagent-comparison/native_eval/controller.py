"""Linux trial controller and hook endpoint (stdlib).

All processes live in the same Harbor container/cgroup. There is no model here.
"""
import argparse
import concurrent.futures
import ctypes
import http.server
import json
import os
import pty
import queue
import signal
import subprocess
import sys
import threading
import time
import urllib.request
import uuid
from pathlib import Path

ACTORS = ('coordinator', 'worker-1', 'worker-2')
MODEL = 'claude-sonnet-4-6'


def become_subreaper():
    # Linux retains orphaned descendants here, even after setsid/double-fork.
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.prctl(36, 1, 0, 0, 0) != 0:  # PR_SET_CHILD_SUBREAPER
        raise OSError(ctypes.get_errno(), 'Cannot supervise orphaned team processes')


def process_tree(root, include_root=True):
    if not Path('/proc/self/stat').is_file(): raise RuntimeError('Linux procfs is required to verify cleanup')
    parents, states = {}, {}
    for path in Path('/proc').glob('[0-9]*/stat'):
        try: fields = path.read_text().rsplit(')', 1)[1].split()
        except FileNotFoundError: continue
        if fields[0] != 'Z':
            pid = int(path.parent.name)
            parents[pid], states[pid] = int(fields[1]), fields[0]
    found = {root}
    while children := {pid for pid, parent in parents.items() if parent in found} - found:
        found.update(children)
    return {pid: states[pid] for pid in found & parents.keys() if include_root or pid != root}


def stop_tree(root, include_root=True):
    # Freeze parents before killing: descendants cannot escape by forking during shutdown.
    frozen = set()
    deadline = time.monotonic() + 5
    while current := process_tree(root, include_root):
        if time.monotonic() >= deadline: raise RuntimeError('Could not freeze team processes')
        if set(current) <= frozen and all(state in ('T', 't') for state in current.values()): break
        for pid in current.keys() - frozen:
            try: os.kill(pid, signal.SIGSTOP)
            except ProcessLookupError: pass
        frozen.update(current)
        time.sleep(.01)
    for pid in frozen:
        try: os.kill(pid, signal.SIGKILL)
        except ProcessLookupError: pass
    while any(process_tree(pid) for pid in frozen):
        if time.monotonic() >= deadline: raise RuntimeError('Team processes still running')
        time.sleep(.05)


def cleanup(root):
    root = Path(root)
    pid = int((root / 'controller.pid').read_text())
    if process_tree(pid):
        try: os.kill(pid, signal.SIGTERM)
        except ProcessLookupError: pass
    deadline = time.monotonic() + 30
    while process_tree(pid):
        if time.monotonic() >= deadline: raise RuntimeError('Controller did not stop; discard environment')
        time.sleep(.1)
    proof = json.loads((root / 'cleanup.json').read_text())
    if proof != dict(controller_pid=pid, forced=False, remaining=[]):
        raise RuntimeError('Missing clean shutdown proof; discard environment')


def post(url, body, timeout=30):
    request = urllib.request.Request(url, json.dumps(body).encode(),
                                     {'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.load(response)


class Session:
    def __init__(self, command, env, directory):
        self.id = env['STUDY_SESSION_ID']
        master, slave = pty.openpty()
        self.fd = master
        self.process = subprocess.Popen(command, stdin=slave, stdout=slave, stderr=slave,
                                        env=env, start_new_session=True)
        os.close(slave)
        self.lock = threading.Lock()
        self.thread = threading.Thread(target=self.drain, args=(directory,), daemon=True)
        self.thread.start()

    def drain(self, directory):
        with (directory / 'terminal.log').open('wb') as log:
            try:
                while data := os.read(self.fd, 65536):
                    log.write(data)
                    log.flush()
            except OSError:
                pass

    def send(self, text):
        with self.lock:
            # Bracketed paste preserves multiline assignments as one user turn.
            os.write(self.fd, b'\x1b[200~' + text.encode() + b'\x1b[201~')
            os.write(self.fd, b'\r')

    def stop(self):
        stop_tree(self.process.pid)
        self.process.wait(timeout=3)
        self.thread.join(timeout=2)
        os.close(self.fd)


class Controller:
    def __init__(self, config):
        self.config = config
        self.root = Path(config['directory'])
        self.root.mkdir(parents=True, exist_ok=True)
        self.finished = threading.Event()
        self.sessions, self.pending, self.reports = {}, {}, {}
        self.inbox = {actor: queue.Queue() for actor in ACTORS}
        self.idle = {actor: False for actor in ACTORS}
        self.events, self.incidents = [], []
        self.lock = threading.RLock()
        self.rpc_pending, self.rpc_lock = {}, threading.Lock()
        self.bridge = None
        self.started = None
        self.native_names = set()
        self.finish_requested = False
        self.coordinator_id = None

    def event(self, kind, **data):
        with self.lock:
            event = dict(time=time.time(), kind=kind, **data)
            self.events.append(event)
            with (self.root / 'events.jsonl').open('a') as stream:
                stream.write(json.dumps(event) + '\n')

    def room(self, timeout=30, **body):
        request_id = str(uuid.uuid4())
        future = concurrent.futures.Future()
        with self.rpc_lock:
            self.rpc_pending[request_id] = future
            self.bridge.stdin.write(json.dumps(dict(id=request_id, **body)) + '\n')
            self.bridge.stdin.flush()
        return future.result(timeout=timeout)

    def read_bridge(self):
        for line in self.bridge.stdout:
            result = json.loads(line)
            with self.rpc_lock:
                future = self.rpc_pending.pop(result['id'])
            if result.get('error'):
                future.set_exception(ValueError(result['error']))
            else:
                future.set_result(result['result'])

    def start_session(self, actor, instruction):
        if self.finished.is_set(): raise ValueError('Trial cancelled')
        home = self.root / actor
        home.mkdir(mode=0o700)
        session_id = str(uuid.uuid4())
        if actor == 'coordinator': self.coordinator_id = session_id
        config_dir = home / 'config'
        config_dir.mkdir()
        (home / '.claude.json').write_text(json.dumps({'hasCompletedOnboarding': True}))
        (config_dir / '.claude.json').write_text(json.dumps({'hasCompletedOnboarding': True}))
        hook_command = f'{sys.executable} /opt/native-eval/controller.py hook'
        settings = {'effortLevel': 'high', 'autoUpdatesChannel': 'stable',
                    'hooks': {event: [{'hooks': [{'type': 'command', 'command': hook_command}]}]
                              for event in ('SessionStart', 'PreToolUse', 'PostToolUse', 'Stop', 'SubagentStart', 'SubagentStop', 'TeammateIdle', 'TaskCompleted')}}
        (home / 'settings.json').write_text(json.dumps(settings))
        mcp = {'mcpServers': {'study': {'command': 'node',
              'args': ['/opt/native-eval/mcp.js']}}}
        (home / 'mcp.json').write_text(json.dumps(mcp))
        env = {k: os.environ[k] for k in ('PATH', 'LANG', 'TERM') if k in os.environ}
        env.update(HOME=str(home), CLAUDE_CONFIG_DIR=str(config_dir), IS_SANDBOX='1',
                   ANTHROPIC_API_KEY=self.config['gateway_token'],
                   ANTHROPIC_BASE_URL=self.config['gateway_url'],
                   ANTHROPIC_MODEL=MODEL, ANTHROPIC_DEFAULT_SONNET_MODEL=MODEL,
                   ANTHROPIC_DEFAULT_HAIKU_MODEL=MODEL, ANTHROPIC_DEFAULT_OPUS_MODEL=MODEL,
                   CLAUDE_CODE_SUBAGENT_MODEL=MODEL, CLAUDE_CODE_EFFORT_LEVEL='high',
                   CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC='1', DISABLE_AUTOUPDATER='1',
                   CLAUDE_CODE_DISABLE_AUTO_MEMORY='1', CLAUDE_CODE_MAX_OUTPUT_TOKENS='8192',
                   STUDY_ACTOR=actor, STUDY_ARM=self.config['arm'],
                   STUDY_SESSION_ID=session_id, STUDY_CONTROLLER=self.url,
                   TERM='xterm-256color', ANTHROPIC_CUSTOM_HEADERS=f'x-study-actor: {actor}')
        if self.config['arm'] == 'agent-teams':
            env['CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS'] = '1'
            env['CLAUDE_CODE_TEAMMATE_MODE'] = 'in-process'
        command = [self.config['claude_binary'], '--model', MODEL, '--effort', 'high', '--session-id', session_id,
                   '--setting-sources', '', '--settings', str(home / 'settings.json'),
                   '--strict-mcp-config', '--mcp-config', str(home / 'mcp.json'),
                   '--disable-slash-commands', '--no-chrome', '--dangerously-skip-permissions',
                   '--append-system-prompt', self.config['system_prompt'] + f'\nYour participant identity is {actor}.', instruction]
        if self.config['arm'] == 'agentplat':
            command += ['--disallowed-tools', 'Agent,Task,TeamCreate,TeamDelete,SendMessage,TaskCreate,TaskUpdate,TaskList,TaskGet,WebSearch']
        else:
            command += ['--disallowed-tools', 'WebSearch']
        session = Session(command, env, home)
        self.sessions[actor] = session
        self.event('participant_started', actor=actor, session_id=session.id, pid=session.process.pid)
        return session

    def deliver(self, actor, text):
        with self.lock:
            if self.idle[actor] and actor in self.sessions:
                self.idle[actor] = False
                self.sessions[actor].send(text)
            else:
                self.inbox[actor].put(text)

    def provider(self, body):
        if 'incident' in body:
            self.incidents.append(body)
            self.event('incident', **body)
            self.finished.set()
            return {}
        if 'message' in body:
            self.deliver(body['recipient'], json.dumps({'room_message': body['message']}))
            return {}
        actor = body['actor']
        if actor not in ACTORS[1:]:
            raise ValueError('Only the two persistent workers are provider targets')
        done = threading.Event()
        with self.lock:
            if actor in self.pending:
                raise ValueError('Worker already running')
            self.pending[actor] = done
            self.reports.pop(actor, None)
        assignment = json.dumps({'assignment': body['task']})
        with self.lock:
            if actor not in self.sessions:
                self.start_session(actor, self.config['instruction'] + '\n\n' + assignment)
            else:
                self.deliver(actor, assignment)
        while not done.wait(0.2):
            if self.finished.is_set():
                raise ValueError('Trial cancelled')
        with self.lock:
            self.pending.pop(actor)
            return dict(output=self.reports.pop(actor), session_id=self.sessions[actor].id)

    def hook(self, body):
        hook, actor = body['hook'], body['actor']
        session_id = hook.get('session_id')
        event = hook.get('hook_event_name')
        if self.config['arm'] == 'agent-teams':
            target = self.root / 'native-members.json'
            members = json.loads(target.read_text()) if target.exists() else {}
            for path in self.root.glob('coordinator/config/teams/*/config.json'):
                for member in json.loads(path.read_text()).get('members', []):
                    if member.get('name') in ACTORS[1:]:
                        for key in ('agentId', 'sessionId'):
                            if member.get(key): members[member[key]] = member['name']
            if members:
                target.write_text(json.dumps(members))
            # Teammates can share the parent's session/env; explicit child identity wins.
            agent_id, name = hook.get('agent_id'), hook.get('teammate_name')
            actor = members.get(agent_id) if agent_id else (
                members.get(session_id) if session_id != self.coordinator_id else None)
            if name:
                actor = name if name in self.native_names and actor in (None, name) else None
            if not agent_id and not name and not actor and session_id == self.coordinator_id and session_id:
                actor = 'coordinator'
        self.event('hook', actor=actor, hook=hook)
        if event == 'PreToolUse':
            tool, args = hook['tool_name'], hook.get('tool_input', {})
            reason = None
            if tool in ('Agent', 'Task'):
                if self.config['arm'] != 'agent-teams' or actor != 'coordinator':
                    reason = 'Subdelegation is disabled'
                elif not args.get('team_name') or args.get('name') not in ACTORS[1:]:
                    reason = 'Create named native teammates worker-1 and worker-2 in one team'
                elif args['name'] in self.native_names or len(self.native_names) >= 2:
                    reason = 'Exactly two native teammates; no replacement participants'
                elif args.get('model') not in (None, MODEL, 'sonnet'):
                    reason = 'Model is frozen'
                else:
                    self.native_names.add(args['name'])
            if tool == 'mcp__study__finish' and actor != 'coordinator':
                reason = 'Only the coordinator can finish the trial'
            if reason:
                return {'hookSpecificOutput': {'hookEventName': 'PreToolUse',
                        'permissionDecision': 'deny', 'permissionDecisionReason': reason}}
        if event == 'Stop' and actor in ACTORS:
            if actor == 'coordinator' and self.finish_requested:
                self.finished.set()
            with self.lock:
                if actor in self.pending and actor in self.reports:
                    self.pending[actor].set()
                if not self.inbox[actor].empty():
                    return {'decision': 'block', 'reason': self.inbox[actor].get()}
                self.idle[actor] = True
        return {}

    def tool(self, body):
        actor, op, args = body['actor'], body['name'], body.get('arguments', {})
        if actor not in ACTORS:
            raise ValueError('Unknown actor')
        self.event('coordination', actor=actor, operation=op, arguments=args)
        if op == 'finish':
            if actor != 'coordinator':
                raise ValueError('Only coordinator can finish')
            self.event('coordinator_finished', actor=actor)
            self.finish_requested = True
            return {'finished': True}
        if self.config['arm'] != 'agentplat':
            raise ValueError('Use native team coordination tools')
        if op == 'report':
            if actor not in self.pending:
                raise ValueError('No assigned task')
            self.reports[actor] = args['content']
            return {'reported': True}
        if op not in ('assign', 'message', 'state'):
            raise ValueError('Unknown operation')
        return self.room(op=op, actor=actor, **args)

    def run(self):
        become_subreaper()
        owner = self
        class Handler(http.server.BaseHTTPRequestHandler):
            def log_message(self, *args): pass
            def do_POST(self):
                try:
                    body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                    handler = {'/provider': owner.provider, '/hook': owner.hook, '/tool': owner.tool}[self.path]
                    if self.path == '/hook':
                        with owner.lock: result = handler(body)
                    else: result = handler(body)
                    self.send_response(200)
                except Exception as error:
                    result = {'error': str(error)}
                    self.send_response(400)
                self.end_headers()
                self.wfile.write(json.dumps(result).encode())
        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.url = f'http://127.0.0.1:{server.server_port}'
        threading.Thread(target=server.serve_forever, daemon=True).start()
        (self.root / 'controller.pid').write_text(str(os.getpid()))
        signal.signal(signal.SIGTERM, lambda *_: self.finished.set())
        signal.signal(signal.SIGINT, lambda *_: self.finished.set())
        self.started = time.time()
        self.event('instruction_delivered')
        try:
            if self.config['arm'] == 'agentplat':
                self.bridge = subprocess.Popen(['node', '/opt/native-eval/rooms.js'],
                    stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                    stderr=(self.root / 'rooms.stderr').open('w'), text=True,
                    env={**os.environ, 'STUDY_CONTROLLER': self.url,
                         'STUDY_TIMEOUT_MS': str(self.config['timeout_sec'] * 1000)})
                threading.Thread(target=self.read_bridge, daemon=True).start()
                self.room(op='init', goal=self.config['instruction'])
            self.start_session('coordinator', self.config['instruction'])
            while not self.finished.wait(0.2):
                if time.time() - self.started >= self.config['timeout_sec']:
                    self.incidents.append({'reason': 'timeout'})
                    break
                if any(s.process.poll() is not None for s in self.sessions.values()):
                    self.incidents.append({'reason': 'participant_exited'})
                    break
        finally:
            self.finished.set()
            if self.bridge:
                try: (self.root / 'room.json').write_text(json.dumps(self.room(op='snapshot', timeout=2)))
                except Exception: self.incidents.append({'reason': 'room_snapshot_missing'})
            with self.lock:
                stop_tree(os.getpid(), include_root=False)
                for session in list(self.sessions.values()): session.stop()
                if self.bridge: self.bridge.wait(timeout=3)
            self.event('team_stopped')
            (self.root / 'completion.json').write_text(json.dumps(dict(
                started=self.started, stopped=time.time(), timeout_sec=self.config['timeout_sec'], incidents=self.incidents,
                coordinator_finished=any(e['kind'] == 'coordinator_finished' for e in self.events),
                participants={a: s.id for a, s in self.sessions.items()},
                native_names=sorted(self.native_names))))
            server.shutdown()
            server.server_close()
            (self.root / 'cleanup.json').write_text(json.dumps(dict(
                controller_pid=os.getpid(), forced=False, remaining=[])))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['run', 'hook', 'cleanup'])
    parser.add_argument('config', nargs='?')
    args = parser.parse_args()
    if args.mode == 'run': Controller(json.loads(Path(args.config).read_text())).run()
    elif args.mode == 'cleanup': cleanup(args.config)
    else:
        try:
            print(json.dumps(post(os.environ['STUDY_CONTROLLER'] + '/hook',
                {'actor': os.environ['STUDY_ACTOR'], 'hook': json.load(sys.stdin)})))
        except Exception:
            print('Study hook unavailable; stopping for audit', file=sys.stderr)
            sys.exit(2)
