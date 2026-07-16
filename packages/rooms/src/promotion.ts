import type { AgentPlatID, Metadata } from '@agentplat/core';
import type {
  MultiAgentSessionResult,
  SessionMessage,
  SessionSpeaker,
} from '@agentplat/sessions';
import type { Participant, Room, RoomMessage } from './models.js';
import type { RoomService } from './service.js';

export interface PromoteSessionToRoomInput {
  tenantId: AgentPlatID;
  session: MultiAgentSessionResult;
  speakers: readonly SessionSpeaker[];
  room: {
    id?: AgentPlatID;
    title: string;
    goal: string;
    metadata?: Metadata;
    createdBy?: AgentPlatID;
  };
  /** Failed or aborted simulations require an explicit opt-in. */
  allowIncomplete?: boolean;
  participantId?: (speaker: SessionSpeaker, roomId: AgentPlatID) => AgentPlatID;
  messageId?: (message: SessionMessage, roomId: AgentPlatID) => AgentPlatID;
}

export interface SessionRoomPromotion {
  room: Room;
  participants: Participant[];
  messages: RoomMessage[];
  sourceSessionId: AgentPlatID;
}

/**
 * Atomically materialize an ephemeral transcript through existing Room models.
 * Speakers become participants and SessionMessage values become RoomMessage
 * values; no parallel durable simulation model is introduced.
 */
export function promoteSessionToRoom(
  service: RoomService,
  input: PromoteSessionToRoomInput
): Promise<SessionRoomPromotion> {
  return service.promoteSessionToRoom(input);
}
