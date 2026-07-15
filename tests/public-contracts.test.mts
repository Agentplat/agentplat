import type {
  AgentSseEnvelope,
  AgentStreamEvent,
  MultiAgentSessionEvent,
  QuickRunInput,
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

void consumeSessionEnvelope;
void consumeRuntimeEnvelope;
void quickRunInput;
void parserOptions;
