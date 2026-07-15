import { createAgentplat } from '@agentplat/framework';
import { MockAgentProvider } from '@agentplat/runtime-mock';

const agentplat = createAgentplat({
  platform: 'mock',
  provider: new MockAgentProvider({
    responsesByAgent: {
      buyer: ['I can offer $18,000.', 'DEAL AGREED at $19,000.'],
      seller: ['I can move to $20,000.', 'I accept $19,000.'],
    },
  }),
});

const session = agentplat.createSession({
  speakers: [
    {
      id: 'buyer',
      name: 'Buyer',
      instructions: 'Negotiate a fair price for the buyer.',
      platform: 'mock',
    },
    {
      id: 'seller',
      name: 'Seller',
      instructions: 'Negotiate a fair price for the seller.',
      platform: 'mock',
    },
  ],
  maxRounds: 4,
  stopMarkers: ['DEAL AGREED'],
});

for await (const event of session.stream({
  input: 'Negotiate the price of a used car.',
})) {
  if (event.type === 'turn_completed') {
    console.log(`${event.payload.speaker.name}: ${event.content}`);
  }
  if (event.type === 'stop_reason') {
    console.log(`Stopped: ${event.payload.reason}`);
  }
}
