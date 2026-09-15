"""Gateway proven against a local fake upstream; zero provider calls, zero credentials."""
import json
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import httpx

from native_eval.gateway import gateway, usage_cost
from native_eval.study import MODEL

USAGE = dict(input_tokens=10, output_tokens=5,
             cache_read_input_tokens=0, cache_creation_input_tokens=0)


class Upstream(BaseHTTPRequestHandler):
    responses = []

    def log_message(self, *args):
        pass

    def do_POST(self):
        self.rfile.read(int(self.headers.get('Content-Length', 0)))
        status, payload = self.responses.pop(0)
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(body)


def message(usage):
    return dict(id=f'resp-{len(Upstream.responses)}', model=MODEL, usage=usage)


def body(**overrides):
    payload = dict(model=MODEL, max_tokens=100, output_config={'effort': 'high'}, messages=[])
    payload.update(overrides)
    return payload


class GatewayContract(unittest.TestCase):
    def setUp(self):
        self.upstream = ThreadingHTTPServer(('127.0.0.1', 0), Upstream)
        threading.Thread(target=self.upstream.serve_forever, daemon=True).start()
        self.addCleanup(self.upstream.server_close)
        self.addCleanup(self.upstream.shutdown)
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def call(self, proxy, payload, headers=None):
        return httpx.post(f'http://127.0.0.1:{proxy["port"]}/v1/messages', json=payload,
                          headers={'x-api-key': proxy['token'], **(headers or {})}, timeout=10)

    def proxy(self):
        return gateway('10', 'fixture-key', self.tmp.name,
                       upstream=f'http://127.0.0.1:{self.upstream.server_port}')

    def test_settlement_rejections_and_provider_errors_leave_admission_open(self):
        with self.proxy() as proxy:
            Upstream.responses = [(200, message(USAGE))]
            self.assertEqual(self.call(proxy, body()).status_code, 200)
            self.assertEqual(proxy['ledger'].spent, usage_cost(USAGE))
            self.assertEqual(proxy['ledger'].pending, {})
            # Validation rejection: 400, never retried by SDKs, admission stays open.
            self.assertEqual(self.call(proxy, body(model='other')).status_code, 400)
            self.assertTrue(proxy['ledger'].complete)
            # Long-context beta rejected before any reservation.
            self.assertEqual(self.call(proxy, body(), {'anthropic-beta': 'context-1m-2025-08-07'}).status_code, 400)
            # Provider error: settled at zero, 400 to the client, admission stays open.
            Upstream.responses = [(429, {'error': 'overloaded'})]
            self.assertEqual(self.call(proxy, body()).status_code, 400)
            self.assertTrue(proxy['ledger'].complete)
            # Admission provably still open after every failure above.
            Upstream.responses = [(200, message(USAGE))]
            self.assertEqual(self.call(proxy, body()).status_code, 200)
        statuses = [c['status'] for c in proxy['calls']]
        self.assertEqual(statuses, ['completed', 'rejected', 'rejected', 'provider_error', 'completed'])
        self.assertEqual(proxy['ledger'].spent, 2 * usage_cost(USAGE))

    def test_off_contract_pricing_keeps_reservation_and_closes_admission(self):
        with self.proxy() as proxy:
            Upstream.responses = [(200, message(dict(USAGE, input_tokens=250_000)))]
            self.call(proxy, body())
            self.assertFalse(proxy['ledger'].complete)
            self.assertEqual(len(proxy['ledger'].pending), 1)
            self.assertEqual(self.call(proxy, body()).status_code, 400)


if __name__ == '__main__':
    unittest.main()
