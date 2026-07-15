import {
  createPersonaInputBuilder,
  createSessionEventReducer,
} from '@agentplat/framework';
import type {
  AgentSseEnvelope,
  AgentStreamEvent,
  MultiAgentSessionEvent,
  QuickRunInput,
  SessionEventRecord,
} from '@agentplat/framework';
import type { ParseAgentSseOptions } from '@agentplat/streaming';

// This file is compiled, not executed. It protects facade-only consumer imports
// and discriminated payload narrowing across the serialized SSE boundary.
function consumeSessionEnvelope(
  envelope: AgentSseEnvelope<MultiAgentSessionEvent>
): void {
  if (envelope.type === 'token') {
    const content: string = envelope.content;
    const speakerId: string = envelope.payload.speaker.id;
    void content;
    void speakerId;
  }
  if (envelope.type === 'session_completed') {
    const totalTokens: number = envelope.payload.usage.totalTokens;
    void totalTokens;
  }
}

function consumeRuntimeEnvelope(
  envelope: AgentSseEnvelope<AgentStreamEvent>
): void {
  if (envelope.type === 'token') {
    const content: string = envelope.content;
    void content;
  }
  if (envelope.type === 'completed' && envelope.payload?.usage) {
    const totalTokens: number | undefined = envelope.payload.usage.totalTokens;
    void totalTokens;
  }
}

const quickRunInput: QuickRunInput = {
  instructions: 'Be concise.',
  input: 'Hello',
};
const parserOptions: ParseAgentSseOptions<MultiAgentSessionEvent> = {
  strictSequence: true,
};
const personaBuilder = createPersonaInputBuilder();
const sessionReducer = createSessionEventReducer();
const sessionRecord: SessionEventRecord = {
  eventId: 'session-a:1',
  tenantId: 'tenant-a',
  sessionId: 'session-a',
  sequence: 1,
  occurredAt: '2026-07-15T00:00:00.000Z',
  event: {
    type: 'session_started',
    payload: {
      sessionId: 'session-a',
      speakers: [],
      maxRounds: 1,
      historyLimit: 1,
    },
  },
};

void consumeSessionEnvelope;
void consumeRuntimeEnvelope;
void quickRunInput;
void parserOptions;
void personaBuilder;
void sessionReducer;
void sessionRecord;
