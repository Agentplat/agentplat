'use client';

import { useRef, useState } from 'react';
import {
  createSessionEventReducer,
  type MultiAgentSessionEvent,
} from '@agentplat/framework';
import { subscribeAgentSse } from '@agentplat/streaming';

const reducer = createSessionEventReducer();

export default function Home() {
  const [scenario, setScenario] = useState(
    'Negotiate the price of a used car.'
  );
  const [state, setState] = useState(reducer.initialState);
  const [error, setError] = useState<string>();
  const controller = useRef<AbortController | null>(null);

  async function simulate() {
    controller.current?.abort();
    const signalController = new AbortController();
    controller.current = signalController;
    setState(reducer.initialState);
    setError(undefined);
    try {
      const response = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario }),
        signal: signalController.signal,
      });
      await subscribeAgentSse<MultiAgentSessionEvent>(response, {
        signal: signalController.signal,
        onEvent: (envelope) =>
          setState((current) => reducer.reduce(current, envelope)),
      });
    } catch (caught) {
      if (!signalController.signal.aborted) {
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
        <button onClick={simulate} disabled={state.status === 'running'}>
          Run simulation
        </button>
        <button
          onClick={() => controller.current?.abort()}
          disabled={state.status !== 'running'}
        >
          Cancel
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
    </main>
  );
}
