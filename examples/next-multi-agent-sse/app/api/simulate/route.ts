import { createAgentplat } from '@agentplat/framework';
import {
  createConsoleAuditSink,
  createSessionAuditSink,
} from '@agentplat/audit';
import { MockAgentProvider } from '@agentplat/runtime-mock';
import { toRegisteredSessionSseResponse } from '@agentplat/sessions/http';

import { sessionRegistry } from './registry';

const audit = createConsoleAuditSink();

const agentplat = createAgentplat({
  platform: 'mock',
  provider: new MockAgentProvider({
    responsesByAgent: {
      buyer: ['I can offer $18,000.', 'DEAL AGREED at $19,000.'],
      seller: ['I can move to $20,000.', 'I accept $19,000.'],
    },
  }),
});

const speakers = [
  {
    id: 'buyer',
    name: 'Buyer',
    instructions: 'Negotiate the lowest fair price.',
    platform: 'mock',
  },
  {
    id: 'seller',
    name: 'Seller',
    instructions: 'Protect the sale price while seeking agreement.',
    platform: 'mock',
  },
];

export async function POST(request: Request) {
  const body = (await request.json()) as {
    scenario?: unknown;
    history?: unknown;
  };
  const scenario = body.scenario;
  if (typeof scenario !== 'string' || !scenario.trim()) {
    return Response.json({ error: 'scenario is required' }, { status: 400 });
  }
  const history = Array.isArray(body.history) ? body.history : undefined;
  return toRegisteredSessionSseResponse(
    request,
    sessionRegistry,
    ({ sessionId, signal, stopSignal }) => {
      const session = agentplat.createSession({
        speakers,
        maxRounds: 4,
        stopMarkers: ['DEAL AGREED'],
        eventSink: createSessionAuditSink({ audit }),
      });
      return session.stream({
        input: scenario,
        ...(history ? { history } : {}),
        sessionId,
        signal,
        stopSignal,
      });
    }
  );
}
