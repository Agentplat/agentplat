'use client';

import { useRef, useState } from 'react';
import { createSessionEventReducer } from '@agentplat/framework';
import { createSessionStreamController } from '@agentplat/framework/browser';

const reducer = createSessionEventReducer();

export default function Home() {
  const [scenario, setScenario] = useState(
    'Negotiate the price of a used car.'
  );
  const [state, setState] = useState(reducer.initialState);
  const [error, setError] = useState<string>();
  const controller = useRef<ReturnType<
    typeof createSessionStreamController
  > | null>(null);
  if (!controller.current) {
    controller.current = createSessionStreamController({
      reducer,
      onState: setState,
      onError: (caught) =>
        setError(caught instanceof Error ? caught.message : 'Stream failed'),
      stop: async (sessionId) => {
        const response = await fetch(`/api/sessions/${sessionId}/stop`, {
          method: 'POST',
        });
        if (!response.ok) throw new Error('Soft stop request failed');
      },
    });
  }

  async function simulate(history = controller.current?.exportHistory()) {
    controller.current?.reset();
    setError(undefined);
    try {
      await controller.current?.start('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario,
          ...(history?.length ? { history } : {}),
        }),
      });
    } catch (caught) {
      if (controller.current?.state.status !== 'aborted') {
        setError(caught instanceof Error ? caught.message : 'Stream failed');
      }
    }
  }

  return (
    <main>
      <h1>AgentPlat multi-agent SSE</h1>
      <p>Mock-backed Next.js reference with typed events and cancellation.</p>
      <textarea
        value={scenario}
        onChange={(event) => setScenario(event.target.value)}
      />
      <p>
        <button
          onClick={() => simulate([])}
          disabled={state.status === 'running'}
        >
          Run simulation
        </button>
        <button
          onClick={() => controller.current?.abort()}
          disabled={state.status !== 'running'}
        >
          Cancel
        </button>
        <button
          onClick={() => void controller.current?.stop()}
          disabled={state.status !== 'running'}
        >
          Stop after turn
        </button>
        <button
          onClick={() => simulate()}
          disabled={state.turnOrder.length === 0 || state.status === 'running'}
        >
          Continue
        </button>
      </p>
      {error && <p role="alert">{error}</p>}
      <p>
        Status: {state.status} {state.stopReason ? `(${state.stopReason})` : ''}
      </p>
      <ol>
        {state.turnOrder.map((turnId) => {
          const turn = state.turns[turnId];
          return (
            <li key={turnId}>
              <strong>{turn.speaker.name}:</strong> {turn.content}
            </li>
          );
        })}
      </ol>
      <p>
        Usage: {state.usage.totalTokens} tokens across{' '}
        {state.usage.reportedTurns} reported turns.
      </p>
      <p>Turn latency: {state.totalLatencyMs}ms.</p>
    </main>
  );
}
