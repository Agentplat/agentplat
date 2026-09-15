"""Software contract fixtures only; these never enter scientific result bundles."""
import json
import os
import tempfile
import unittest
import zipfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from native_eval.bundle import seal, export_zip, import_zip, verify_bundle, comparison
from native_eval.controller import Controller, Session
from native_eval.results import messages_from_transcripts, reconcile
from native_eval.study import digest, write_json


class RuntimeContracts(unittest.TestCase):
    def test_stream_fragments_deduplicate_and_malformed_traces_are_visible(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            path = root / 'worker-1/config/projects/app/session.jsonl'
            path.parent.mkdir(parents=True)
            event = dict(type='assistant', sessionId='fixture-session', version='2.1.236',
                message=dict(id='fixture-response', model='claude-sonnet-4-6', usage={'output_tokens': 1},
                content=[dict(type='tool_use', id='fixture-tool', name='Read', input={})]))
            path.write_text(json.dumps(event) + '\n' + json.dumps(event) + '\n' + '{broken\n')
            faults = []
            messages = messages_from_transcripts(root, 'agentplat', faults)
            self.assertEqual(len(messages), 1)
            self.assertEqual(len(messages['fixture-response']['tools']), 1)
            self.assertEqual(faults[0]['reason'], 'malformed_trace')

    def test_missing_logs_never_become_zero_cost_or_eligible(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = reconcile(Path(tmp), 'agentplat')
            self.assertIsNone(result['cost_usd'])
            self.assertIsNone(result['input_tokens'])
            self.assertFalse(result['accounting_complete'])
            self.assertFalse(result['protocol_ok'])

    def test_native_children_cannot_delegate_or_finish(self):
        with tempfile.TemporaryDirectory() as tmp:
            c = Controller(dict(directory=tmp, arm='agent-teams'))
            c.coordinator_id = 'root'
            def hook(tool, session, args):
                return c.hook({'actor':'coordinator', 'hook':dict(session_id=session,
                    hook_event_name='PreToolUse', tool_name=tool, tool_input=args)})
            for tool in ['Agent','Task','mcp__study__finish']:
                result = hook(tool, 'child', {'team_name':'team','name':'worker-1'})
                self.assertEqual(result['hookSpecificOutput']['permissionDecision'], 'deny')
            self.assertEqual(hook('Agent','root', {'team_name':'team','name':'worker-1'}), {})
            self.assertIn('hookSpecificOutput', hook('Agent','root', {'team_name':'team','name':'worker-1'}))
            self.assertIn('hookSpecificOutput', hook('Agent','root', {'name':'worker-2'}))

    def test_sessions_use_clean_environment_and_explicit_pty(self):
        captured = {}
        def session(command, env, directory):
            captured.update(command=command, env=env)
            return SimpleNamespace(id=env['STUDY_SESSION_ID'], process=SimpleNamespace(pid=123))
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ,
            {'PONYTAIL_DEFAULT_MODE':'full', 'ANTHROPIC_API_KEY':'fixture-host-key', 'CLAUDE_CONFIG_DIR':'fixture-global'}), \
                patch('native_eval.controller.Session', side_effect=session):
            c = Controller(dict(directory=tmp, arm='agentplat', gateway_token='fixture-trial-token',
                           gateway_url='http://fixture', system_prompt='fixture'))
            c.url = 'http://127.0.0.1:1'
            c.start_session('coordinator', 'fixture instruction')
            self.assertNotIn('PONYTAIL_DEFAULT_MODE', captured['env'])
            self.assertEqual(captured['env']['ANTHROPIC_API_KEY'], 'fixture-trial-token')
            self.assertNotIn('--print', captured['command'])
            self.assertNotIn('CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS', captured['env'])

    def test_cancellation_reaps_the_process_group(self):
        with tempfile.TemporaryDirectory() as tmp:
            session = Session(['/bin/sh', '-c', 'sleep 60'],
                              {'PATH':os.environ['PATH'], 'STUDY_SESSION_ID':'fixture'}, Path(tmp))
            session.stop()
            self.assertIsNotNone(session.process.poll())
            with self.assertRaises(ProcessLookupError): os.killpg(session.process.pid, 0)

    def test_bundle_roundtrip_hashes_and_path_traversal(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); source = root / 'source'; source.mkdir()
            write_json(source / 'runs.json', [])
            seal(source)
            archive = root / 'bundle.zip'
            checksum = export_zip(source, archive)
            import_zip(archive, root / 'imported', checksum)
            verify_bundle(root / 'imported')
            (root / 'imported/runs.json').write_text('changed')
            with self.assertRaises(ValueError): verify_bundle(root / 'imported')
            malicious = root / 'malicious.zip'
            with zipfile.ZipFile(malicious, 'w') as handle: handle.writestr('../escape', 'fixture')
            with self.assertRaises(ValueError): import_zip(malicious, root/'bad', digest(malicious.read_bytes()))
            self.assertFalse((root / 'escape').exists())

    def test_cost_per_success_includes_failures_and_unknown_is_not_zero(self):
        import pandas as pd
        fixture = pd.DataFrame([dict(task='fixture', arm='fixture', success=False, cost_usd=2),
                                dict(task='fixture', arm='fixture', success=True, cost_usd=3)])
        self.assertEqual(comparison(fixture).iloc[0].cost_per_success, 5)
        fixture['success'] = False
        self.assertTrue(pd.isna(comparison(fixture).iloc[0].cost_per_success))
        fixture.loc[0, 'cost_usd'] = None
        self.assertTrue(pd.isna(comparison(fixture).iloc[0].cost_usd))
