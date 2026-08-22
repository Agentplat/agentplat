import type { ISODateTime, JsonObject } from "@agentplat/core";

/** One ordered transition emitted transactionally from Room-scoped state. */
export interface AgentRoomOperationalEvent {
  sequence: number;
  tenantId: string;
  roomId: string;
  source: string;
  sourceId: string;
  sourceRevision?: number;
  eventType: string;
  payload: JsonObject;
  occurredAt: ISODateTime;
}

/** Reads ordered operational transitions without granting domain authority. */
export interface AgentRoomOperationalEventReader {
  listAfter(input: {
    tenantId: string;
    roomId: string;
    afterSequence: number;
    limit: number;
  }): Promise<AgentRoomOperationalEvent[]>;
  listScopes?(
    limit?: number,
  ): Promise<Array<{ tenantId: string; roomId: string }>>;
}
