# Multi-agent sessions

`@agentplat/sessions` provides deterministic, ephemeral multi-agent turn
orchestration over the public `AgentRuntime`. It covers interactive simulations,
debates and negotiations without making applications own the round scheduler,
transcript assembly, stopping logic or event normalization.

It is deliberately smaller than an Agent Room. A session uses bounded in-memory
history and does not claim durable audit, approvals, memory or authorization.
Use `RoomService` when those guarantees are required.

## Choose the smallest correct abstraction

| Need                                            | API                 |
| ----------------------------------------------- | ------------------- |
| One model generation, no persistence            | `quickRun`          |
| Interactive multi-speaker turns, no persistence | `MultiAgentSession` |
| Durable work, policies, approvals and audit     | Agent Rooms         |

Sessions and Rooms share `AgentRuntime`, so the same provider registration can
serve both. Moving from a session to a Room is an explicit governance decision,
not an automatic claim that an ephemeral transcript was audited.

## Create a session

```ts
import { createAgentplat } from '@agentplat/framework';
import { openAICompatible } from '@agentplat/model-openai-compatible';

const agentplat = createAgentplat({
  adapter: openAICompatible({
    apiKey: process.env.OPENAI_API_KEY,
    defaultModel: process.env.OPENAI_MODEL,
  }),
  platform: 'chat',
  tenant: { tenantId: 'acme' },
});

const session = agentplat.createSession({
  speakers: [
    {
      id: 'buyer',
      name: 'Buyer',
      instructions: 'Negotiate the lowest fair price.',
      platform: 'chat',
    },
    {
      id: 'seller',
      name: 'Seller',
      instructions: 'Protect the sale price while seeking agreement.',
      platform: 'chat',
    },
  ],
  maxRounds: 6,
  historyLimit: 30,
  stopMarkers: ['DEAL AGREED'],
  stopWhen: ({ latest }) => latest.content.includes('END SIMULATION'),
});
```

A configured single-agent facade can add a fallback or test platform without
repeating its live provider setup:

```ts
const configured = AgentPlat.configure({
  provider: 'openai',
  apiKey,
  model,
  instructions,
});
configured.withPlatform('mock', { provider: mockProvider });

const session = configured.createSession({
  speakers,
  platformOverrides: { reviewer: 'mock' },
});
```

Speakers run in fixed array order for every round. `maxRounds` and
`historyLimit` are mandatory safety bounds with conservative defaults. Session
execution supplies a deny-oriented policy context for tools and external
writes; the provider and host remain responsible for enforcing their own
capabilities.

## Typed event stream

`MultiAgentSessionEvent` is a discriminated union. Turn-scoped events always
carry `payload.speaker`, `payload.round`, `payload.turn` and `payload.turnId`.
The stream emits:

```text
session_started
  speaker_changed → turn_started → token* → turn_completed
  speaker_changed → turn_started → token* → turn_completed
  ...
stop_reason → session_completed
```

`turn_completed.payload` preserves provider-reported `usage`, `model`,
`finishReason` and `latencyMs`; it also contains cumulative session usage.
`session_completed.payload` contains the final usage and stop reason. Do not
replace these events with token-only events when composing another stream.

## Next.js App Router with cancellation

The helper passes `request.signal` both to session generation and to the SSE
transport. A disconnected browser therefore stops the active provider when it
honors `RuntimeExecutionContext.signal`.

```ts
// app/api/simulate/route.ts
import type { MultiAgentSessionEvent } from '@agentplat/framework';
import { toNextSseResponse } from '@agentplat/streaming';

export async function POST(request: Request) {
  const { scenario } = await request.json();

  return toNextSseResponse<MultiAgentSessionEvent>(
    request,
    (signal) => session.stream({ input: scenario, signal }),
    { exposeErrors: process.env.NODE_ENV === 'development' }
  );
}
```

## Typed browser parser

The parser understands the AgentPlat envelope v1, arbitrary network chunk
boundaries, multi-line SSE data and contiguous sequence validation.

```ts
import type { MultiAgentSessionEvent } from '@agentplat/framework';
import { parseAgentSseStream } from '@agentplat/streaming';

const controller = new AbortController();
const response = await fetch('/api/simulate', {
  method: 'POST',
  body: JSON.stringify({ scenario }),
  signal: controller.signal,
});
if (!response.ok || !response.body) throw new Error('Simulation failed');

for await (const envelope of parseAgentSseStream<MultiAgentSessionEvent>(
  response.body,
  { signal: controller.signal }
)) {
  if (envelope.type === 'token') {
    appendToken(envelope.payload.speaker.id, envelope.content);
  }
  if (envelope.type === 'session_completed') {
    showUsage(envelope.payload.usage);
  }
}

// A Stop button can call controller.abort().
```

The generic parameter preserves event-specific payload types after parsing.
The parser validates the common envelope; applications can provide `validate`
for additional runtime validation at a trust boundary.

For a reusable client path, pair `subscribeAgentSse` with the pure
`createSessionEventReducer` helper. Neither package requires React; the reducer
returns speaker-correlated turn bubbles, aggregate usage, stop reason and
duration for any UI framework.

When consuming an SSE envelope, remove transport metadata before passing it to
the domain reducer:

```ts
import { envelopeToEvent, subscribeAgentSse } from '@agentplat/streaming';

await subscribeAgentSse(response, {
  onEvent: (envelope) =>
    setState((state) => reducer.reduce(state, envelopeToEvent(envelope))),
});
```

For browser applications that do not want to repeat AbortController ownership,
parsing and reducer dispatch, use the browser-only subpath:

```ts
import { createSessionStreamController } from '@agentplat/framework/browser';

const controller = createSessionStreamController({ onState: setState });
await controller.start('/api/simulate', { method: 'POST', body });
controller.abort(); // hard cancellation
```

## Audit trail without a Room

Sessions stay ephemeral, but an application may attach an append-only
`SessionEventSink`. Every yielded event is wrapped in a `SessionEventRecord`
with a deterministic `eventId`, sequence and timestamp. `best_effort` is the
default; use `sinkFailureMode: 'required'` when continuing without a recorded
event is unacceptable.

```ts
import { InMemoryAuditSink, createSessionAuditSink } from '@agentplat/audit';

const session = agentplat.createSession({
  speakers,
  eventSink: createSessionAuditSink({ audit: new InMemoryAuditSink() }),
  sinkFailureMode: 'required',
});
```

`SessionAuditSink` applies the same recursive secret redaction as
`@agentplat/audit`. This records an event trail; it does not create a Room or
claim approvals, durable artifacts or Room lifecycle governance.

## Multi-platform sessions and controls

Register all adapters/providers explicitly without adding vendor SDKs to the
framework:

```ts
const agentplat = createAgentplat({
  platform: 'chat',
  platforms: {
    mock: { provider: mockProvider },
    chat: { adapter: compatibleAdapter },
  },
});
```

`createSession` rejects a speaker whose platform is not registered when the
runtime can report its registry. Use `turnTimeoutMs` or `sessionTimeoutMs` for
typed `timeout` stop reasons. `stopSignal` is cooperative: it finishes the
active turn and stops before the next one. Hard cancellation remains
`signal`/`AbortController`.

## Product controls: abort, stop and resume

- **Hard abort:** pass an `AbortSignal` as `signal`. It cancels the active
  provider request and closes the SSE response; use it for a Cancel button.
- **Soft stop:** pass a distinct `stopSignal`. Abort that signal to finish the
  current speaker turn, emit `stop_reason: stopped`, and avoid starting the
  next turn. In HTTP applications, keep the stop controller server-side and
  expose a separately authenticated stop action keyed by the session ID.
- **Resume:** persist the reducer's completed turn messages in application
  state, then start a fresh session invocation with `history`. A resumed
  stream is deliberately a new SSE response and never reuses an old transport.

```ts
const stop = new AbortController();
const result = await session.run({ input: scenario, stopSignal: stop.signal });

const resumed = await session.run({
  input: scenario,
  history: result.history,
});
```

`SessionViewState` now exposes `activeTurnId`, `totalLatencyMs`, and each
turn's reported `model` and `finishReason` for operational dashboards.

## Deterministic multi-speaker tests

Response tapes can be keyed by agent, so changing speaker order does not consume
another speaker's scripted answer.

```ts
import { MockAgentProvider } from '@agentplat/runtime-mock';

const provider = new MockAgentProvider({
  responsesByAgent: {
    buyer: ['Offer 1', 'Offer 2'],
    seller: ['Counter 1', 'Counter 2'],
  },
});
```

Each tape has its own invocation counter and reuses its final response after it
is exhausted. `streamEventsByAgent` supports exact per-invocation event tapes
for UI and transport tests.

## Current boundary

The first public scheduler is fixed round-robin. Dynamic routing, parallel
speakers, Room-backed audit sinks and prompt-persona helpers are intentionally
outside this primitive until their contracts can be designed without coupling
sessions to a model vendor or persistence adapter.

The architectural boundary is recorded in
[ADR 0002](./adr/0002-ephemeral-multi-agent-sessions.md) and
[ADR 0003](./adr/0003-observable-session-integrations.md).
