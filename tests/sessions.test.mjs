import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAgentplat,
  createPersonaInputBuilder,
  createSessionEventReducer,
  sessionMetrics,
} from '@agentplat/framework';
import { MockAgentProvider } from '@agentplat/runtime-mock';
import {
  encodeSseEvent,
  parseAgentSseStream,
  streamToSSE,
  subscribeAgentSse,
  toNextSseResponse,
} from '@agentplat/streaming';

const speakers = [
  {
    id: 'buyer',
    name: 'Buyer',
    instructions: 'Negotiate the lowest price.',
    platform: 'mock',
  },
  {
    id: 'seller',
    name: 'Seller',
    instructions: 'Protect the sale price.',
    platform: 'mock',
  },
];

function platformWith(options) {
  return createAgentplat({
    provider: new MockAgentProvider(options),
    platform: 'mock',
    tenant: { tenantId: 'tenant-a' },
  });
}

test('MultiAgentSession runs deterministic round-robin turns and aggregates reported usage', async () => {
  const platform = platformWith({
    responsesByAgent: {
      buyer: [
        {
          output: 'Buyer 1',
          completion: {
            model: 'mock-buyer',
            finishReason: 'stop',
            latencyMs: 2,
            usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 },
          },
        },
        {
          output: 'Buyer 2',
          completion: {
            usage: { inputTokens: 12, outputTokens: 2, totalTokens: 14 },
          },
        },
      ],
      seller: [
        {
          output: 'Seller 1',
          completion: {
            usage: { inputTokens: 11, outputTokens: 2, totalTokens: 13 },
          },
        },
        {
          output: 'Seller 2',
          completion: {
            usage: { inputTokens: 13, outputTokens: 2, totalTokens: 15 },
          },
        },
      ],
    },
  });
  const session = platform.createSession({ speakers, maxRounds: 2 });

  const result = await session.run({
    sessionId: 'session-a',
    input: 'Negotiate a used car.',
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.stopReason, 'max_rounds');
  assert.equal(result.roundsCompleted, 2);
  assert.equal(result.turnsCompleted, 4);
  assert.deepEqual(
    result.history.map(({ speakerId, content, round, turn }) => ({
      speakerId,
      content,
      round,
      turn,
    })),
    [
      { speakerId: 'buyer', content: 'Buyer 1', round: 1, turn: 1 },
      { speakerId: 'seller', content: 'Seller 1', round: 1, turn: 2 },
      { speakerId: 'buyer', content: 'Buyer 2', round: 2, turn: 3 },
      { speakerId: 'seller', content: 'Seller 2', round: 2, turn: 4 },
    ]
  );
  assert.deepEqual(result.usage, {
    inputTokens: 46,
    outputTokens: 8,
    totalTokens: 54,
    reportedTurns: 4,
  });
});

test('MultiAgentSession emits typed orchestration events and stops on content markers', async () => {
  const session = platformWith({
    responsesByAgent: {
      buyer: ['I can offer 80.'],
      seller: ['ACCEPTED at 80.'],
    },
  }).createSession({ speakers, maxRounds: 5, stopMarkers: ['accepted'] });
  const events = [];

  for await (const event of session.stream({
    sessionId: 'session-marker',
    input: 'Reach an agreement.',
  })) {
    events.push(event);
  }

  assert.equal(events[0].type, 'session_started');
  assert.deepEqual(
    events
      .filter((event) => event.type === 'speaker_changed')
      .map((event) => [
        event.payload.speaker.id,
        event.payload.round,
        event.payload.turn,
      ]),
    [
      ['buyer', 1, 1],
      ['seller', 1, 2],
    ]
  );
  const stop = events.find((event) => event.type === 'stop_reason');
  assert.deepEqual(
    { reason: stop.payload.reason, marker: stop.payload.marker },
    { reason: 'marker', marker: 'accepted' }
  );
  const completed = events.at(-1);
  assert.equal(completed.type, 'session_completed');
  assert.equal(completed.payload.stopReason, 'marker');
  assert.equal(completed.payload.turnsCompleted, 2);
});

test('MultiAgentSession bounds transcript context and supports a custom stop predicate', async () => {
  const observedHistory = [];
  const initialHistory = ['old-1', 'old-2', 'old-3'].map((content, index) => ({
    speakerId: 'seed',
    speakerName: 'Seed',
    content,
    round: 0,
    turn: index + 1,
    createdAt: new Date(index).toISOString(),
  }));
  const session = platformWith({
    responsesByAgent: { buyer: ['Buyer turn'], seller: ['Seller turn'] },
  }).createSession({
    speakers,
    maxRounds: 5,
    historyLimit: 2,
    buildInput(context) {
      observedHistory.push(context.history.map((message) => message.content));
      return { input: `Turn ${context.turn}` };
    },
    stopWhen(context) {
      return context.speaker.id === 'seller'
        ? { stop: true, detail: 'Seller completed the example' }
        : false;
    },
  });

  const result = await session.run({
    input: 'Bound the context.',
    history: initialHistory,
  });

  assert.deepEqual(observedHistory, [
    ['old-2', 'old-3'],
    ['old-3', 'Buyer turn'],
  ]);
  assert.deepEqual(
    result.history.map((message) => message.content),
    ['Buyer turn', 'Seller turn']
  );
  assert.equal(result.stopReason, 'predicate');
  assert.equal(result.stopDetail, 'Seller completed the example');
});

test('MultiAgentSession propagates abort to the active model stream', async () => {
  const controller = new AbortController();
  const session = platformWith({
    responsesByAgent: { buyer: ['several token chunks'], seller: ['unused'] },
    tokenDelayMs: 2,
  }).createSession({ speakers, maxRounds: 3 });
  const events = [];

  for await (const event of session.stream({
    input: 'Abort after the first token.',
    signal: controller.signal,
  })) {
    events.push(event);
    if (event.type === 'token') controller.abort(new Error('Client left'));
  }

  assert.equal(events.filter((event) => event.type === 'token').length, 1);
  const stop = events.find((event) => event.type === 'stop_reason');
  assert.equal(stop.payload.reason, 'aborted');
  assert.equal(stop.payload.detail, 'Client left');
  assert.equal(events.at(-1).payload.status, 'aborted');
});

test('MockAgentProvider keeps exact stream tapes independent per agent invocation', async () => {
  const completed = (content) => [{ type: 'completed', content }];
  const session = platformWith({
    streamEventsByAgent: {
      buyer: [completed('Buyer exact 1'), completed('Buyer exact 2')],
      seller: [completed('Seller exact 1'), completed('Seller exact 2')],
    },
  }).createSession({ speakers, maxRounds: 2 });

  const result = await session.run({ input: 'Use exact event tapes.' });

  assert.deepEqual(
    result.history.map((message) => message.content),
    ['Buyer exact 1', 'Seller exact 1', 'Buyer exact 2', 'Seller exact 2']
  );
});

test('MultiAgentSession reports the failed speaker without starting another turn', async () => {
  const session = platformWith({ failAtCall: 1 }).createSession({
    speakers,
    maxRounds: 2,
  });
  const events = [];

  for await (const event of session.stream({
    input: 'Fail deterministically.',
  })) {
    events.push(event);
  }

  const failed = events.find((event) => event.type === 'session_failed');
  assert.equal(failed.payload.speaker.id, 'buyer');
  assert.equal(failed.payload.round, 1);
  assert.equal(failed.payload.turn, 1);
  assert.equal(
    events.some((event) => event.payload?.speaker?.id === 'seller'),
    false
  );
  assert.equal(events.at(-1).payload.status, 'failed');
});

test('MultiAgentSession records ordered event records and can require a sink', async () => {
  const records = [];
  const session = platformWith({
    responsesByAgent: { buyer: ['Buyer'], seller: ['Seller'] },
  }).createSession({
    speakers,
    maxRounds: 1,
    eventSink: {
      async append(record) {
        records.push(record);
      },
    },
    sinkFailureMode: 'required',
  });

  const result = await session.run({
    sessionId: 'audit-session',
    input: 'Audit.',
  });

  assert.equal(records.length > 4, true);
  assert.deepEqual(
    records.map((record) => record.sequence),
    Array.from({ length: records.length }, (_, index) => index + 1)
  );
  assert.equal(records[0].eventId, 'audit-session:1');
  assert.equal(records[0].tenantId, 'tenant-a');
  assert.equal(records.at(-1).event.type, 'session_completed');
  assert.equal(sessionMetrics(result).turnsCompleted, 2);

  const failing = platformWith({
    responsesByAgent: { buyer: ['Buyer'] },
  }).createSession({
    speakers,
    eventSink: {
      async append() {
        throw new Error('storage unavailable');
      },
    },
    sinkFailureMode: 'required',
  });
  await assert.rejects(failing.run({ input: 'Fail closed.' }), /sink failed/);
});

test('MultiAgentSession supports cooperative stop and typed turn timeouts', async () => {
  const stopController = new AbortController();
  const cooperative = platformWith({
    responsesByAgent: { buyer: ['Buyer speaks'], seller: ['Seller unused'] },
  }).createSession({ speakers, maxRounds: 3 });
  const cooperativeEvents = [];
  for await (const event of cooperative.stream({
    input: 'Stop after a turn.',
    stopSignal: stopController.signal,
  })) {
    cooperativeEvents.push(event);
    if (event.type === 'token')
      stopController.abort(new Error('Stop requested'));
  }
  assert.equal(
    cooperativeEvents.find((event) => event.type === 'stop_reason').payload
      .reason,
    'stopped'
  );
  assert.equal(
    cooperativeEvents.some((event) => event.payload?.speaker?.id === 'seller'),
    false
  );

  const timeout = platformWith({
    responsesByAgent: { buyer: ['Slow answer'], seller: ['Unused'] },
    tokenDelayMs: 10,
  }).createSession({ speakers, turnTimeoutMs: 1 });
  const result = await timeout.run({ input: 'Time out the first turn.' });
  assert.equal(result.stopReason, 'timeout');
  assert.equal(result.status, 'failed');
  assert.equal(result.turnsCompleted, 0);
});

test('persona builder and event reducer produce UI-ready bounded state', async () => {
  const observed = [];
  const session = platformWith({
    responsesByAgent: { buyer: ['Offer'], seller: ['Counter'] },
  }).createSession({
    speakers,
    maxRounds: 1,
    buildInput: createPersonaInputBuilder({
      personas: { buyer: { role: 'Budget owner', goals: ['Pay less'] } },
    }),
  });
  const reducer = createSessionEventReducer();
  let state = reducer.initialState;
  for await (const event of session.stream({ input: 'Negotiate.' })) {
    observed.push(event);
    state = reducer.reduce(state, event);
  }

  assert.equal(state.status, 'completed');
  assert.equal(state.turnOrder.length, 2);
  assert.equal(state.turns[state.turnOrder[0]].content, 'Offer');
  assert.equal(state.stopReason, 'max_rounds');
  assert.equal(
    observed.some((event) => event.type === 'turn_completed'),
    true
  );
});

test('parseAgentSseStream handles arbitrary chunks and validates sequence continuity', async () => {
  const wire = [
    encodeSseEvent({ type: 'session_started', runId: 'session-a' }, 1),
    encodeSseEvent({ type: 'token', runId: 'turn-a', content: 'hello' }, 2),
  ].join('');
  const bytes = new TextEncoder().encode(wire);
  const readable = new ReadableStream({
    start(controller) {
      for (let index = 0; index < bytes.length; index += 7) {
        controller.enqueue(bytes.slice(index, index + 7));
      }
      controller.close();
    },
  });
  const envelopes = [];
  for await (const envelope of parseAgentSseStream(readable)) {
    envelopes.push(envelope);
  }
  assert.deepEqual(
    envelopes.map(({ sequence, type, content }) => ({
      sequence,
      type,
      content,
    })),
    [
      { sequence: 1, type: 'session_started', content: undefined },
      { sequence: 2, type: 'token', content: 'hello' },
    ]
  );

  const invalid = new ReadableStream({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode(
          encodeSseEvent({ type: 'completed', content: 'done' }, 2)
        )
      );
      controller.close();
    },
  });
  await assert.rejects(async () => {
    for await (const _event of parseAgentSseStream(invalid)) {
      // Drain the parser to surface validation errors.
    }
  }, /expected 1/);
});

test('subscribeAgentSse dispatches validated envelopes and surfaces transport failures', async () => {
  async function* events() {
    yield { type: 'token', runId: 'turn-a', content: 'Hello' };
    yield { type: 'completed', runId: 'turn-a', content: 'Hello' };
  }
  const response = streamToSSE(events());
  const received = [];
  await subscribeAgentSse(response, {
    onEvent(envelope) {
      received.push(envelope.type);
    },
  });
  assert.deepEqual(received, ['token', 'completed']);

  let error;
  await assert.rejects(
    subscribeAgentSse(new Response(null, { status: 503 }), {
      onEvent() {},
      onError(receivedError) {
        error = receivedError;
      },
    }),
    /503/
  );
  assert.match(error.message, /503/);
});

test('toNextSseResponse passes the request signal to generation and transport', async () => {
  const request = new Request('http://localhost/simulate');
  let receivedSignal;
  async function* events(signal) {
    receivedSignal = signal;
    yield { type: 'completed', runId: 'run-a', content: 'done' };
  }

  const response = toNextSseResponse(request, (signal) => events(signal));
  const body = await response.text();

  assert.equal(receivedSignal, request.signal);
  assert.match(response.headers.get('content-type'), /^text\/event-stream/);
  assert.match(body, /agentplat\.completed/);
});

test('toNextSseResponse does not emit an event completed after client abort', async () => {
  const controller = new AbortController();
  const request = new Request('http://localhost/simulate', {
    signal: controller.signal,
  });
  let releaseGeneration;
  let generationStarted;
  const started = new Promise((resolve) => {
    generationStarted = resolve;
  });
  const response = toNextSseResponse(request, async function* () {
    generationStarted();
    await new Promise((resolve) => {
      releaseGeneration = resolve;
    });
    yield { type: 'completed', content: 'too late' };
  });
  const reader = response.body.getReader();
  const pendingRead = reader.read();

  await started;
  controller.abort();
  releaseGeneration();

  assert.deepEqual(await pendingRead, { value: undefined, done: true });
});
