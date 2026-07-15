# @agentplat/streaming

Server-Sent Events helpers for normalized `AgentStreamEvent` streams. The
package depends on Web Standards and small structural Node response types; it
does not depend on Next.js, Express or Hono.

## Next.js App Router

```ts
import { toNextSseResponse } from '@agentplat/streaming';

return toNextSseResponse(request, (signal) =>
  session.stream({ input: scenario, signal })
);
```

## Web `Response` (Hono and other Fetch-compatible frameworks)

```ts
import { streamToSSE } from '@agentplat/streaming';

return streamToSSE(runtime.stream(agent, input, context), {
  signal: request.signal,
});
```

## Express-style response

```ts
import { pipeSSE } from '@agentplat/streaming';

await pipeSSE(runtime.stream(agent, input, context), response);
```

## Browser parser

```ts
import type { MultiAgentSessionEvent } from '@agentplat/framework';
import { parseAgentSseStream } from '@agentplat/streaming';

for await (const envelope of parseAgentSseStream<MultiAgentSessionEvent>(
  response.body,
  { signal }
)) {
  // Envelope v1 is parsed and its sequence is validated.
}
```

The wire envelope is versioned and includes a monotonic sequence number. Do
not send credentials or secrets in runtime stream event payloads.
