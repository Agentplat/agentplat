"""Strict reconciliation and content-free operational ATIF. Raw traces stay local."""
import json
from datetime import datetime, timezone
from pathlib import Path

from harbor.models.trajectories.trajectory import Trajectory

from .gateway import usage_cost
from .study import MODEL, CLAUDE_VERSION, digest, write_json

USAGE = ('input_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens', 'output_tokens')
COORDINATION = {'Agent', 'Task', 'TeamCreate', 'TeamDelete', 'SendMessage', 'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet'}


def read_json(path, default=None):
    return json.loads(path.read_text()) if path.is_file() else default


def json_lines(path, incidents):
    rows = []
    if not path.is_file(): return rows
    for line in path.read_text().splitlines():
        try: rows.append(json.loads(line))
        except json.JSONDecodeError: incidents.append({'reason': 'malformed_trace', 'file': path.name})
    return rows


def messages_from_transcripts(native, arm, incidents):
    messages, native_members = {}, {}
    for path in native.rglob('teams/*/config.json'):
        for member in read_json(path, {}).get('members', []):
            if member.get('name') in ('worker-1', 'worker-2'):
                for key in ('agentId', 'sessionId'):
                    if member.get(key): native_members[member[key]] = member['name']
    native_members.update(read_json(native / 'native-members.json', {}))
    completion = read_json(native / 'completion.json', {})
    coordinator = completion.get('participants', {}).get('coordinator')
    for path in native.rglob('*.jsonl'):
        if 'projects' not in path.parts: continue
        actor_home = path.relative_to(native).parts[0]
        for event in json_lines(path, incidents):
            message = event.get('message', {})
            if event.get('type') != 'assistant' or not message.get('id'): continue
            actor = actor_home
            if arm == 'agent-teams':
                child = event.get('agentId') or (path.stem.removeprefix('agent-') if 'subagents' in path.parts else None)
                actor = native_members.get(child) or native_members.get(event.get('sessionId'))
                if not child and event.get('sessionId') == coordinator: actor = 'coordinator'
            record = messages.setdefault(message['id'], dict(actor=actor, session_id=event.get('sessionId'),
                usage={}, tools={}, version=event.get('version'), model=message.get('model')))
            if record['actor'] != actor: incidents.append({'reason': 'response_identity_conflict'})
            record['usage'].update(message.get('usage', {}))
            for block in message.get('content', []):
                if block.get('type') == 'tool_use': record['tools'][block['id']] = block
    return messages


def reconcile(logs, arm):
    logs = Path(logs)
    native, private = logs / 'native', logs / 'provider-private'
    completion = read_json(native / 'completion.json', {})
    calls = read_json(private / 'calls.json', [])
    ledger = read_json(private / 'ledger.json', {})
    incidents = list(completion.get('incidents', []))
    cleanup = read_json(native / 'cleanup.json', {})
    if not cleanup or cleanup.get('forced') or cleanup.get('remaining'):
        incidents.append({'reason': 'forced_cleanup'})
    events = json_lines(native / 'events.jsonl', incidents)
    messages = messages_from_transcripts(native, arm, incidents)
    seen, actors, steps, tools = set(), set(), [], {}
    totals = {k: 0 for k in USAGE}
    known_cost = 0
    public_calls = []
    for call in calls:
        response_id, usage = call.get('response_id'), call.get('usage')
        row = {k: call.get(k) for k in ('call_id', 'started', 'ended', 'status', 'response_id',
               'requested_model', 'effective_model', 'effort', 'retry_of', 'cost_nano_usd', 'http_status')}
        transcript = messages.get(response_id, {})
        row.update(actor=transcript.get('actor'), usage=usage)
        public_calls.append(row)
        if call.get('cost_nano_usd') is not None: known_cost += call['cost_nano_usd']
        if call.get('status') in ('rejected', 'provider_error') and call.get('cost_nano_usd') == 0:
            incidents.append({'reason': 'call_not_admitted', 'call_id': call['call_id']})
            continue
        if not response_id or response_id in seen or call['status'] != 'completed':
            incidents.append({'reason': 'incomplete_or_duplicate_call', 'call_id': call['call_id']})
            continue
        seen.add(response_id)
        if transcript.get('actor') not in ('coordinator', 'worker-1', 'worker-2'):
            incidents.append({'reason': 'unmapped_participant', 'response_id': response_id})
        else: actors.add(transcript['actor'])
        if (call.get('effective_model') != MODEL or call.get('effort') != 'high'
                or transcript.get('version') != CLAUDE_VERSION or transcript.get('model') != MODEL):
            incidents.append({'reason': 'model_effort_or_version_mismatch', 'response_id': response_id})
        try:
            if usage_cost(usage) != call['cost_nano_usd']: raise ValueError('Cost mismatch')
            for key in USAGE:
                if transcript.get('usage', {}).get(key) != usage[key]: raise ValueError('Usage mismatch')
                totals[key] += usage[key]
        except (ValueError, KeyError, TypeError):
            incidents.append({'reason': 'usage_not_reconciled', 'response_id': response_id})
        tool_calls = []
        for tool_id, tool in transcript.get('tools', {}).items():
            tools[tool_id] = tool['name']
            tool_calls.append(dict(tool_call_id=tool_id, function_name=tool['name'], arguments={},
                                   extra={'arguments_sha256': digest(json.dumps(tool.get('input', {}), sort_keys=True).encode())}))
        metrics = None
        if usage and all(type(usage.get(k)) is int for k in USAGE):
            metrics = dict(prompt_tokens=sum(usage[k] for k in USAGE[:3]),
                completion_tokens=usage['output_tokens'], cached_tokens=usage['cache_read_input_tokens'],
                cost_usd=call['cost_nano_usd'] / 1e9, extra={'provider_usage': usage})
        steps.append(dict(step_id=len(steps) + 1, source='agent', message='[Content retained locally]',
            timestamp=datetime.fromtimestamp(call['started'], timezone.utc).isoformat(),
            model_name=call.get('effective_model'), reasoning_effort=call.get('effort'), llm_call_count=1,
            metrics=metrics, tool_calls=tool_calls or None,
            extra={'response_id': response_id, 'call_id': call['call_id'], 'participant': transcript.get('actor')}))
    if set(messages) != seen: incidents.append({'reason': 'provider_transcript_response_sets_differ'})
    if actors != {'coordinator', 'worker-1', 'worker-2'}: incidents.append({'reason': 'three_participants_not_proven'})
    if arm == 'agent-teams' and set(completion.get('native_names', [])) != {'worker-1', 'worker-2'}:
        incidents.append({'reason': 'two_native_teammates_not_proven'})
    if not calls or not ledger.get('complete') or ledger.get('pending'):
        incidents.append({'reason': 'incomplete_ledger'})
    if ledger.get('spent_nano_usd') != known_cost:
        incidents.append({'reason': 'ledger_cost_mismatch'})
    if completion.get('stopped') and completion['stopped'] - completion['started'] > completion['timeout_sec']:
        incidents.append({'reason': 'official_deadline_exceeded'})
    protocol_only = {'three_participants_not_proven', 'two_native_teammates_not_proven',
                     'official_deadline_exceeded', 'timeout', 'participant_exited', 'forced_cleanup',
                     'call_not_admitted'}
    accounting_complete = not any(i.get('reason') not in protocol_only for i in incidents)
    stopped = bool(completion.get('stopped'))
    protocol_ok = accounting_complete and not incidents and stopped and completion.get('coordinator_finished', False)
    if not completion.get('coordinator_finished'): incidents.append({'reason': 'no_explicit_completion'})
    result = dict(accounting_complete=accounting_complete, protocol_ok=bool(protocol_ok),
        participants=sorted(actors), incidents=incidents,
        model_steps=len(seen), provider_calls=sum(c.get('reservation_nano_usd') is not None for c in calls),
        tool_calls=len(tools), coordination_tools=sum(t in COORDINATION or t.startswith('mcp__study__') for t in tools.values()),
        task_tools=sum(t not in COORDINATION and not t.startswith('mcp__study__') for t in tools.values()),
        wall_seconds=(completion['stopped'] - completion['started']) if stopped else None,
        cost_usd=known_cost / 1e9 if accounting_complete else None, known_cost_usd=known_cost / 1e9,
        input_tokens=totals['input_tokens'] if accounting_complete else None,
        cache_read_tokens=totals['cache_read_input_tokens'] if accounting_complete else None,
        cache_write_tokens=totals['cache_creation_input_tokens'] if accounting_complete else None,
        total_input_tokens=sum(totals[k] for k in USAGE[:3]) if accounting_complete else None,
        output_tokens=totals['output_tokens'] if accounting_complete else None)
    if not accounting_complete:
        for key in ('model_steps', 'provider_calls', 'tool_calls', 'coordination_tools', 'task_tools'):
            result[key] = None
    public = logs / 'operational'
    write_json(public / 'environment.json', dict(
        runtime_versions=(logs / 'runtime-versions.txt').read_text() if (logs / 'runtime-versions.txt').is_file() else None,
        resources=read_json(logs / 'resources.json'), cleanup=cleanup))
    write_json(public / 'calls.json', public_calls)
    write_json(public / 'summary.json', result)
    operational_events = []
    for event in events:
        hook = event.get('hook', {})
        operational_events.append(dict(time=event['time'], kind=event['kind'], actor=event.get('actor'),
            operation=event.get('operation') or hook.get('tool_name') or hook.get('hook_event_name'),
            recipient=event.get('arguments', {}).get('recipient'),
            content_sha256=digest(json.dumps(event, sort_keys=True).encode())))
    write_json(public / 'events.json', operational_events)
    if steps:
        trajectory = Trajectory.model_validate(dict(schema_version='ATIF-v1.7', session_id=logs.parent.name,
            agent={'name': arm, 'version': CLAUDE_VERSION, 'model_name': MODEL}, steps=steps,
            notes='Content-free operational trajectory. Model steps are distinct provider response IDs. Original conversation logs remain local.',
            final_metrics={'total_steps': len(steps), 'total_cost_usd': result['cost_usd']},
            extra={'accounting_complete': accounting_complete}))
        write_json(public / 'trajectory.json', trajectory.to_json_dict())
    return result
