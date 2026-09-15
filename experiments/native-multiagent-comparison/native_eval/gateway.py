"""One reservation ledger for every participant. Amounts are integer nano-USD."""
from decimal import Decimal
from threading import RLock
import contextlib
import json
import secrets
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import httpx

from .study import MODEL, digest, write_json


def integer(value):
    if type(value) is not int or value < 0:
        raise ValueError('Missing or invalid usage')
    return value


def usage_cost(usage):
    """Standard Sonnet 4.6 pricing; cache tokens are distinct from input_tokens."""
    if not isinstance(usage, dict):
        raise ValueError('Missing usage')
    inp, out, read, write = [integer(usage.get(k)) for k in (
        'input_tokens', 'output_tokens', 'cache_read_input_tokens',
        'cache_creation_input_tokens')]
    cache = usage.get('cache_creation')
    if cache is None and write == 0:
        five = hour = 0
    elif isinstance(cache, dict):
        five = integer(cache.get('ephemeral_5m_input_tokens'))
        hour = integer(cache.get('ephemeral_1h_input_tokens'))
    else:
        raise ValueError('Cache write duration is unknown')
    if five + hour != write:
        raise ValueError('Cache usage does not reconcile')
    return inp * 3000 + out * 15000 + read * 300 + five * 3750 + hour * 6000


class Ledger:
    def __init__(self, budget_usd):
        amount = Decimal(str(budget_usd)) * 1_000_000_000
        if not amount.is_finite() or amount <= 0 or amount != amount.to_integral_value():
            raise ValueError('An explicit positive USD budget is required')
        self.limit = int(amount)
        self.spent = 0
        self.pending = {}
        self.complete = True
        self.lock = RLock()

    @property
    def available(self):
        with self.lock:
            return self.limit - self.spent - sum(self.pending.values())

    def reserve(self, call_id, maximum):
        maximum = integer(maximum)
        with self.lock:
            if not self.complete or call_id in self.pending or maximum > self.available:
                raise ValueError('Budget exhausted or unresolved provider call')
            self.pending[call_id] = maximum

    def settle(self, call_id, actual):
        actual = integer(actual)
        with self.lock:
            maximum = self.pending.pop(call_id)
            self.spent += actual
            if actual > maximum:
                self.complete = False
                raise ValueError('Provider exceeded reservation; campaign must stop')

    def uncertain(self, call_id):
        with self.lock:
            if call_id not in self.pending:
                raise ValueError('No reservation for uncertain call')
            self.complete = False


@contextlib.contextmanager
def gateway(budget_usd, api_key, directory, upstream='https://api.anthropic.com'):
    """A trial-scoped Anthropic gateway; the real credential never enters Docker.

    Reserve the full model context at the highest standard cache-write rate,
    plus maximum output. Count Tokens is approximate, so cannot bound spending.
    Unknown/partial responses keep their reservation and close admission.
    Rejections and provider error responses cost zero, answer 400 (which SDKs
    never auto-retry) and leave admission open; only unknown in-flight spend,
    a settled overrun or an off-contract price closes it.
    """
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    ledger, token = Ledger(budget_usd), secrets.token_urlsafe(32)
    calls, calls_lock, requests_seen = [], threading.Lock(), {}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_POST(self):
            if self.headers.get('x-api-key') != token:
                self.send_error(403)
                return
            route = self.path.split('?')[0]
            if route not in ('/v1/messages', '/v1/messages/count_tokens'):
                self.send_error(404)
                return
            call_id = str(uuid.uuid4())
            record = dict(call_id=call_id, started=time.time(), status='not_sent',
                          actor_hint=self.headers.get('x-study-actor'), usage=None,
                          response_id=None, cost_nano_usd=None, retry_of=None)
            sent_headers = False
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if length < 1 or length > 32 * 1024 * 1024:
                    raise ValueError('Invalid request size')
                body = json.loads(self.rfile.read(length))
                if body.get('model') != MODEL:
                    raise ValueError('Model differs from frozen protocol')
                if any(t.get('type', 'custom') != 'custom' for t in body.get('tools', [])):
                    raise ValueError('Server tools have separate billing and are outside this budget contract')
                if (body.get('speed') == 'fast' or body.get('inference_geo') not in (None, 'global')
                        or body.get('service_tier') not in (None, 'auto', 'standard_only')):
                    raise ValueError('Unsupported pricing tier')
                record['request_sha256'] = digest(json.dumps(body, sort_keys=True).encode())
                record['client_retry_count'] = int(self.headers.get('x-stainless-retry-count', '0'))
                with calls_lock:
                    record['retry_of'] = requests_seen.get(record['request_sha256'])
                    requests_seen[record['request_sha256']] = call_id
                if record['client_retry_count']:
                    raise ValueError('Automatic provider retries are disabled')
                record['requested_model'] = body['model']
                record['effort'] = body.get('output_config', {}).get('effort')
                if route == '/v1/messages' and record['effort'] != 'high':
                    raise ValueError('Every model call must use high effort')
                headers = {'x-api-key': api_key, 'anthropic-version': '2023-06-01',
                           'content-type': 'application/json'}
                if self.headers.get('anthropic-beta'):
                    if 'context-1m' in self.headers['anthropic-beta']:
                        raise ValueError('Long-context beta pricing is outside the frozen contract')
                    headers['anthropic-beta'] = self.headers['anthropic-beta']
                with httpx.Client(timeout=180, transport=httpx.HTTPTransport(retries=0)) as client:
                    if route.endswith('count_tokens'):
                        # Pure transport: no inference, no ledger; the provider status passes through.
                        response = client.post(upstream + route, headers=headers, json=body)
                        self.send_response(response.status_code)
                        self.send_header('Content-Type', response.headers.get('content-type', 'application/json'))
                        self.end_headers()
                        self.wfile.write(response.content)
                        return
                    output_limit = integer(body.get('max_tokens'))
                    if not 1 <= output_limit <= 8192:
                        raise ValueError('Output limit differs from protocol')
                    maximum = 1_000_000 * 6000 + output_limit * 15000
                    ledger.reserve(call_id, maximum)
                    record['reservation_nano_usd'] = maximum
                    record['status'] = 'sent'
                    write_json(directory / f'{call_id}.request.json', body)
                    usage, model, response_id, stopped = {}, None, None, False
                    with client.stream('POST', upstream + '/v1/messages', headers=headers, json=body) as response:
                        record['http_status'] = response.status_code
                        if response.is_error:
                            # Error responses are not billed; settle zero and answer a non-retried 400.
                            (directory / f'{call_id}.error.body').write_bytes(response.read())
                            ledger.settle(call_id, 0)
                            record.update(status='provider_error', cost_nano_usd=0)
                            self.send_error(400, 'Provider error; raw body retained locally')
                            return
                        self.send_response(response.status_code)
                        self.send_header('Content-Type', response.headers.get('content-type', 'application/json'))
                        self.end_headers()
                        sent_headers = True
                        if body.get('stream'):
                            with (directory / f'{call_id}.sse').open('w') as raw:
                                for line in response.iter_lines():
                                    raw.write(line + '\n')
                                    self.wfile.write((line + '\n').encode())
                                    self.wfile.flush()
                                    if not line.startswith('data: '):
                                        continue
                                    event = json.loads(line[6:])
                                    if event['type'] == 'message_start':
                                        message = event['message']
                                        model, response_id = message['model'], message['id']
                                        usage.update(message.get('usage', {}))
                                    elif event['type'] == 'message_delta':
                                        usage.update(event.get('usage', {}))
                                    elif event['type'] == 'message_stop':
                                        stopped = True
                        else:
                            payload = response.read()
                            self.wfile.write(payload)
                            message = json.loads(payload)
                            write_json(directory / f'{call_id}.response.json', message)
                            model, response_id, usage = message['model'], message['id'], message.get('usage', {})
                            stopped = True
                    record.update(response_id=response_id, effective_model=model, usage=usage)
                    if not stopped or not response_id:
                        raise ValueError('Incomplete provider response')
                    actual = usage_cost(usage)
                    if usage.get('service_tier') not in (None, 'standard'):
                        raise ValueError('Effective service tier differs from the frozen standard pricing')
                    if sum(usage[k] for k in ('input_tokens', 'cache_read_input_tokens',
                                              'cache_creation_input_tokens')) > 200_000:
                        raise ValueError('Long-context premium pricing; standard settlement would undercount')
                    ledger.settle(call_id, actual)
                    record.update(cost_nano_usd=actual, status='completed')
                    if model != MODEL:
                        ledger.complete = False
                        raise ValueError('Effective model differs from protocol')
            except Exception as error:
                if call_id in ledger.pending:
                    ledger.uncertain(call_id)  # unknown in-flight spend keeps its reservation and closes admission
                status = 'incident' if not ledger.complete or record['cost_nano_usd'] else 'rejected'
                if status == 'rejected':
                    record['cost_nano_usd'] = 0
                record.update(status=status, error=type(error).__name__, detail=str(error))
                if not sent_headers:
                    self.send_error(400, 'Call not admitted; inspect the local incident record')
            finally:
                if route == '/v1/messages':
                    record['ended'] = time.time()
                    with calls_lock:
                        calls.append(record)
                        write_json(directory / 'calls.json', calls)

    server = ThreadingHTTPServer(('0.0.0.0', 0), Handler)
    server.daemon_threads = False  # server_close waits for in-flight reservations to settle.
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield dict(port=server.server_port, token=token, ledger=ledger, calls=calls)
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
        write_json(directory / 'ledger.json', dict(limit_nano_usd=ledger.limit,
                   spent_nano_usd=ledger.spent, pending=ledger.pending,
                   complete=ledger.complete and not ledger.pending))
