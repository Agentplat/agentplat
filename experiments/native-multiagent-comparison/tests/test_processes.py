"""Linux-only process checks; stdlib only, runnable in an unmodified task image."""
import json
import os
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

from native_eval.controller import Session, become_subreaper, cleanup, process_tree, stop_tree


@unittest.skipUnless(sys.platform == 'linux', 'Run in the documented Linux Docker check')
class ProcessContracts(unittest.TestCase):
    def test_controller_absolute_binary_isolated_home_finish_and_cancellation(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            binary = root / 'installed bin/claude'
            binary.parent.mkdir()
            binary.write_text(f'#!{sys.executable}\n' + '''
import json, os, subprocess, time, urllib.request
from pathlib import Path
child = subprocess.Popen(['sleep','60'],start_new_session=True,env={})
Path(os.environ['HOME'],'observed.json').write_text(json.dumps(dict(child=child.pid,home=os.environ['HOME'])))
if Path(os.environ['HOME']).parent.name == 'finish':
    for route, body in [('/tool',dict(actor='coordinator',name='finish')),
                        ('/hook',dict(actor='coordinator',hook=dict(session_id=os.environ['STUDY_SESSION_ID'],hook_event_name='Stop')))]:
        request=urllib.request.Request(os.environ['STUDY_CONTROLLER']+route,json.dumps(body).encode(),{'Content-Type':'application/json'})
        urllib.request.urlopen(request,timeout=3).close()
time.sleep(60)
''')
            binary.chmod(0o700)
            for mode in ('finish', 'cancel'):
                directory = root / mode
                config = root / 'config.json'
                config.write_text(json.dumps(dict(directory=str(directory), arm='agent-teams', timeout_sec=10,
                    gateway_token='fixture', gateway_url='http://127.0.0.1:1', instruction='fixture',
                    system_prompt='fixture', claude_binary=str(binary))))
                process = subprocess.Popen([sys.executable, '-m', 'native_eval.controller', 'run', str(config)],
                                           env={**os.environ, 'PATH':'/usr/bin:/bin'})
                try:
                    observed = directory / 'coordinator/observed.json'
                    deadline = time.monotonic() + 5
                    while not observed.exists():
                        if time.monotonic() >= deadline: self.fail('Controller did not launch the absolute binary')
                        time.sleep(.02)
                    if mode == 'cancel': process.send_signal(signal.SIGTERM)
                    self.assertEqual(process.wait(timeout=10), 0)
                    cleanup(directory)
                    data = json.loads(observed.read_text())
                    self.assertEqual(data['home'], str(directory / 'coordinator'))
                    self.assertFalse(process_tree(data['child']))
                    completion = json.loads((directory / 'completion.json').read_text())
                    self.assertEqual(completion['coordinator_finished'], mode == 'finish')
                finally:
                    if process.poll() is None: stop_tree(process.pid); process.wait()

    def test_detached_descendants_and_orphans_stop_without_touching_other_processes(self):
        become_subreaper()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            bystander = subprocess.Popen(['sleep', '60'])
            # Separate session and empty environment defeat process-group/env-marker cleanup.
            code = "import subprocess,sys,time; p=subprocess.Popen(['sleep','60'], start_new_session=True, env={}); print(p.pid,flush=True); time.sleep(60)"
            session = Session([sys.executable, '-c', code],
                              {'PATH':'/usr/bin:/bin', 'STUDY_SESSION_ID':'fixture'}, root)
            try:
                deadline = time.monotonic() + 5
                while not (root / 'terminal.log').exists() or not (root / 'terminal.log').read_text().strip():
                    if time.monotonic() >= deadline: self.fail('Child failed to start')
                    time.sleep(.02)
                child = int((root / 'terminal.log').read_text().strip())
                session.stop()
                self.assertFalse(process_tree(child))
                self.assertIsNone(bystander.poll())
                orphan = subprocess.run([sys.executable, '-c',
                    "import subprocess; print(subprocess.Popen(['sleep','60'],start_new_session=True,env={},stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).pid)"],
                    stdout=subprocess.PIPE, text=True, check=True).stdout
                orphan = int(orphan)
                self.assertIn(orphan, process_tree(os.getpid(), include_root=False))
                stop_tree(os.getpid(), include_root=False)
                self.assertFalse(process_tree(orphan))
            finally:
                stop_tree(os.getpid(), include_root=False)
                session.process.wait()
                bystander.wait()
                try:
                    while os.waitpid(-1, os.WNOHANG)[0]: pass
                except ChildProcessError: pass

    def test_cleanup_requires_proof_when_controller_is_dead(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            process = subprocess.Popen(['sleep', '60'])
            process.kill(); process.wait()
            (root / 'controller.pid').write_text(str(process.pid))
            with self.assertRaises(FileNotFoundError): cleanup(root)
            proof = dict(controller_pid=process.pid, forced=False, remaining=[])
            (root / 'cleanup.json').write_text(json.dumps(proof))
            cleanup(root)
            proof['remaining'] = [123]
            (root / 'cleanup.json').write_text(json.dumps(proof))
            with self.assertRaises(RuntimeError): cleanup(root)
