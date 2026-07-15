import { createAgentplat } from '@agentplat/framework';
import { MockAgentProvider } from '@agentplat/runtime-mock';
import { toNextSseResponse } from '@agentplat/streaming';

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
  const body = (await request.json()) as { scenario?: unknown };
  const scenario = body.scenario;
  if (typeof scenario !== 'string' || !scenario.trim()) {
    return Response.json({ error: 'scenario is required' }, { status: 400 });
  }
  const session = agentplat.createSession({
    speakers,
    maxRounds: 4,
    stopMarkers: ['DEAL AGREED'],
  });
  return toNextSseResponse(request, (signal) =>
    session.stream({ input: scenario, signal })
  );
}
