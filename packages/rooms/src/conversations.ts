import { AgentPlatError } from "@agentplat/core";
import type { RoomMessage } from "./models.js";
import type { RoomRepositoryReader } from "./repository.js";

/** A thread is rooted in an immutable message, not a separate execution grant. */
export interface RoomConversationReference {
  threadId?: string;
  replyToMessageId?: string;
}

export interface RoomMessagePageInput {
  threadId?: string;
  rootsOnly?: boolean;
  limit?: number;
  cursor?: string;
}

export interface RoomMessagePage {
  messages: RoomMessage[];
  nextCursor?: string;
  hasMore: boolean;
}

export function conversationReference(
  value: RoomConversationReference,
): RoomConversationReference {
  return {
    ...(value.threadId !== undefined ? { threadId: value.threadId } : {}),
    ...(value.replyToMessageId !== undefined
      ? { replyToMessageId: value.replyToMessageId }
      : {}),
  };
}

export function validateConversationReference(
  value: RoomConversationReference,
): void {
  for (const key of ["threadId", "replyToMessageId"] as const) {
    if (
      value[key] !== undefined &&
      (typeof value[key] !== "string" ||
        !value[key]!.trim() ||
        value[key]!.length > 1024)
    )
      throw new AgentPlatError("VALIDATION_ERROR", `Invalid ${key}`);
  }
}

/** Resolve a reply using server-owned storage; never trust a client-selected root. */
export async function resolveRoomConversation(
  reader: RoomRepositoryReader,
  tenantId: string,
  roomId: string,
  input: RoomConversationReference,
  root?: { id: string; startThread?: boolean },
): Promise<RoomConversationReference> {
  validateConversationReference(input);
  if (root?.startThread !== undefined && typeof root.startThread !== "boolean")
    throw new AgentPlatError("VALIDATION_ERROR", "Invalid startThread");
  if (!input.threadId && !input.replyToMessageId && !root?.startThread)
    return {};
  if (reader.conversationVersion !== 1 || !reader.getMessage)
    throw new AgentPlatError(
      "ADAPTER_ERROR",
      "Repository does not support Room conversations",
    );
  if (root?.startThread) {
    if (input.threadId || input.replyToMessageId)
      throw new AgentPlatError(
        "VALIDATION_ERROR",
        "A new thread cannot also reply to an existing message",
      );
    validateConversationReference({ threadId: root.id });
    return { threadId: root.id };
  }
  const get = async (id: string) => {
    const message = await reader.getMessage!(tenantId, roomId, id);
    if (!message || message.tenantId !== tenantId || message.roomId !== roomId)
      throw new AgentPlatError(
        "NOT_FOUND",
        "Conversation message not found in this Room",
      );
    return message;
  };
  const parent = input.replyToMessageId
    ? await get(input.replyToMessageId)
    : undefined;
  if (root && parent?.id === root.id)
    throw new AgentPlatError(
      "VALIDATION_ERROR",
      "A message cannot reply to itself",
    );
  const threadId = input.threadId ?? parent?.threadId ?? parent?.id;
  if (!threadId)
    throw new AgentPlatError("VALIDATION_ERROR", "Conversation has no root");
  const thread = await get(threadId);
  if (
    thread.replyToMessageId ||
    (thread.threadId && thread.threadId !== thread.id)
  )
    throw new AgentPlatError(
      "VALIDATION_ERROR",
      "Thread reference is not a root message",
    );
  if (parent && (parent.threadId ?? parent.id) !== threadId)
    throw new AgentPlatError(
      "VALIDATION_ERROR",
      "Reply belongs to another thread",
    );
  if (root?.id === threadId)
    throw new AgentPlatError(
      "VALIDATION_ERROR",
      "A reply cannot replace its thread root",
    );
  return { threadId, replyToMessageId: parent?.id ?? threadId };
}

/** Portable cursor contract shared by memory and indexed SQL adapters. */
export function prepareRoomMessagePage(
  tenantId: string,
  roomId: string,
  input: RoomMessagePageInput = {},
) {
  validateConversationReference(input);
  const limit = input.limit ?? 50;
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 200 ||
    (input.rootsOnly !== undefined && typeof input.rootsOnly !== "boolean") ||
    (input.threadId !== undefined && input.rootsOnly)
  )
    throw new AgentPlatError(
      "VALIDATION_ERROR",
      "Invalid message page options",
    );
  const binding = {
    tenantId,
    roomId,
    threadId: input.threadId ?? null,
    rootsOnly: input.rootsOnly ?? false,
  };
  let after: { createdAt: string; id: string } | undefined;
  if (input.cursor !== undefined) {
    try {
      if (typeof input.cursor !== "string" || input.cursor.length > 16_000)
        throw Error();
      const cursor = JSON.parse(decodeURIComponent(input.cursor));
      if (
        cursor.version !== 1 ||
        Object.entries(binding).some(([k, v]) => cursor[k] !== v) ||
        typeof cursor.id !== "string" ||
        !cursor.id ||
        cursor.id.length > 1024 ||
        typeof cursor.createdAt !== "string" ||
        new Date(cursor.createdAt).toISOString() !== cursor.createdAt
      )
        throw Error();
      after = { id: cursor.id, createdAt: cursor.createdAt };
    } catch {
      throw new AgentPlatError(
        "VALIDATION_ERROR",
        "Message cursor does not match this query",
      );
    }
  }
  return { ...binding, limit, after };
}

export function compareRoomMessages(
  a: Pick<RoomMessage, "createdAt" | "id">,
  b: Pick<RoomMessage, "createdAt" | "id">,
): number {
  const time = Date.parse(a.createdAt) - Date.parse(b.createdAt);
  if (time) return time;
  // PostgreSQL COLLATE "C" uses UTF-8 byte order, unlike localeCompare.
  const left = new TextEncoder().encode(a.id),
    right = new TextEncoder().encode(b.id);
  for (let i = 0; i < Math.min(left.length, right.length); i++)
    if (left[i] !== right[i]) return left[i] - right[i];
  return left.length - right.length;
}

export function roomMessagePage(
  tenantId: string,
  roomId: string,
  messages: RoomMessage[],
  input: RoomMessagePageInput = {},
): RoomMessagePage {
  const query = prepareRoomMessagePage(tenantId, roomId, input);
  const rows = messages
    .filter(
      (message) =>
        message.tenantId === tenantId &&
        message.roomId === roomId &&
        (!query.threadId ||
          (message.threadId ?? message.id) === query.threadId) &&
        (!query.rootsOnly ||
          (!message.replyToMessageId &&
            (!message.threadId || message.threadId === message.id))) &&
        (!query.after || compareRoomMessages(message, query.after) > 0),
    )
    .sort(compareRoomMessages);
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  return {
    messages: page,
    hasMore: rows.length > query.limit,
    nextCursor: last
      ? encodeURIComponent(
          JSON.stringify({
            version: 1,
            tenantId,
            roomId,
            threadId: query.threadId,
            rootsOnly: query.rootsOnly,
            createdAt: last.createdAt,
            id: last.id,
          }),
        )
      : input.cursor,
  };
}
