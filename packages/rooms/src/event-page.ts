import { AgentPlatError } from "@agentplat/core";
import type { DomainEvent } from "./models.js";

/** Optional opaque cursor and bounded limit for Room event pagination. */
export interface RoomEventPageInput {
  cursor?: string;
  limit?: number;
}

/** Ordered Room event page and its resumable opaque cursor. */
export interface RoomEventPage {
  events: DomainEvent[];
  nextCursor?: string;
  hasMore: boolean;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** Applies stable cursor pagination to an ordered Room event sequence. */
export function roomEventPage(
  roomId: string,
  events: DomainEvent[],
  input: RoomEventPageInput = {},
): RoomEventPage {
  const limit = input.limit ?? DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new AgentPlatError(
      "VALIDATION_ERROR",
      `Room event page limit must be an integer between 1 and ${MAX_LIMIT}`,
    );
  }
  const offset = input.cursor ? decodeCursor(input.cursor, roomId) : 0;
  if (offset > events.length) {
    throw new AgentPlatError(
      "VALIDATION_ERROR",
      "Room event cursor is ahead of the current event stream",
    );
  }
  const page = events.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  const hasMore = nextOffset < events.length;
  return {
    events: page,
    nextCursor:
      page.length > 0 ? encodeCursor(roomId, nextOffset) : input.cursor,
    hasMore,
  };
}

function encodeCursor(roomId: string, offset: number): string {
  return `v1:${encodeURIComponent(roomId)}:${offset}`;
}

function decodeCursor(cursor: string, roomId: string): number {
  try {
    const match = /^v1:([^:]+):(\d+)$/.exec(cursor);
    const decodedRoomId = match?.[1] ? decodeURIComponent(match[1]) : undefined;
    const offset = match?.[2] ? Number(match[2]) : Number.NaN;
    if (decodedRoomId !== roomId || !Number.isSafeInteger(offset)) {
      throw new Error("invalid cursor fields");
    }
    return offset;
  } catch {
    throw new AgentPlatError(
      "VALIDATION_ERROR",
      "Room event cursor is invalid for this Room",
    );
  }
}
