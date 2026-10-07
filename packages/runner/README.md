# @agentplat/runner

Portable client for AgentPlat Edge Runner Hub. Source capability; registry publication is a separate release step. No Node or PostgreSQL imports in this package.

```ts
import { AgentPlatRunnerClient } from '@agentplat/runner';
const runner = new AgentPlatRunnerClient({
  url: 'wss://your-host/ws/runners', tenantId: 'tenant-a', token: connectionToken,
  runnerId: 'local-worker', name: 'Local worker',
  capabilities: ['browser'], concurrencyLimit: 2,
  onError: console.error,
});
runner.registerHandler('execute', async payload => ({ received: payload }));
runner.connect();
// runner.disconnect() stops automatic reconnect.
```

Browsers and Chrome Extension Service Workers use their global WebSocket. Node versions without a global WebSocket can inject `socketFactory: url => new WebSocket(url)` using a compatible implementation. Host suspension can interrupt timers and sockets; reconnect occurs when the host resumes execution. The SDK cannot keep a suspended extension alive.

The client answers application ping messages, reconnects with exponential backoff and jitter (500ms–30s), resets backoff after registration and limits local handler concurrency. Payloads/results are JSON values. Missing handlers or handler errors send a failed receipt. Handler execution is application logic.

Delivery is **at least once**. A disconnected or timed out handler may still finish its external effects while the task is reassigned. Use task/application idempotency for external effects; a lease fence protects persisted results, not external systems. Responses are sent only through the socket that issued the task. A result from an earlier connection is never sent on a new connection.

Browser credentials travel in handshake query parameters because browsers cannot set arbitrary WebSocket headers. Use TLS and redact query strings in proxy logs. The Hub must verify the token's authorization for the requested tenant.

## Candidate verification

From the repository root, run `pnpm run verify:runner-consumer` (set `RUNNER_TEST_DATABASE_URL` to also run real database and WebSocket scenarios). The verifier installs the exact packed runner, Hub and PostgreSQL adapter artifacts into a clean application, and checks Node and browser TypeScript consumers. The 1.3.0 candidate is not a registry publication claim. Registry distribution requires the protected release workflow and first-package npm registration.
