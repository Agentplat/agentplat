import { AgentPlatError } from "@agentplat/core";
import type { RoomMessage } from "./models.js";

/** Host-verified identity; never construct from model arguments or request body. */
export interface RoomActorAccess {
  readonly tenantId: string;
  readonly actorId: string;
  readonly roomId: string;
}
export type RoomAccessAction = "read" | "write" | "execute";
/** Resolve current membership and permission on each call. Room ownership is not an override. */
export type RoomAccessPolicy = (
  access: RoomActorAccess,
  action: RoomAccessAction,
) => Promise<boolean>;
export interface PrivateRoomMessage {
  readonly id: string;
  readonly role: "human" | "agent";
  readonly authorId: string;
  readonly content: string;
  readonly replyTo?: string;
  readonly references: readonly string[];
  readonly createdAt: string;
}
export interface RoomConversation {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly tenantId: string;
  readonly roomId: string;
  readonly actorId: string;
  readonly revision: number;
  readonly messages: readonly PrivateRoomMessage[];
  readonly migrationSource?: "legacy-room-messages-v1";
}
/** Trusted persistence port, not an authorization API. Writes must atomically enforce CAS. */
export interface RoomConversationStore {
  load(
    tenantId: string,
    roomId: string,
    id: string,
  ): Promise<RoomConversation | undefined>;
  list(
    tenantId: string,
    roomId: string,
    actorId: string,
  ): Promise<RoomConversation[]>;
  compareAndSet(
    document: RoomConversation,
    expectedRevision: number | null,
  ): Promise<boolean>;
}
const clone = <T>(value: T): T => structuredClone(value);
const deny = (): never => {
  throw new AgentPlatError("FORBIDDEN", "Conversation access denied");
};
export class InMemoryRoomConversationStore implements RoomConversationStore {
  private readonly documents = new Map<string, RoomConversation>();
  private key(t: string, r: string, id: string) {
    return JSON.stringify([t, r, id]);
  }
  async load(t: string, r: string, id: string) {
    const d = this.documents.get(this.key(t, r, id));
    return d ? clone(d) : undefined;
  }
  async list(t: string, r: string, a: string) {
    return [...this.documents.values()]
      .filter((d) => d.tenantId === t && d.roomId === r && d.actorId === a)
      .map(clone);
  }
  async compareAndSet(d: RoomConversation, expected: number | null) {
    const key = this.key(d.tenantId, d.roomId, d.id);
    const current = this.documents.get(key);
    if (
      expected === null
        ? current || d.revision !== 0
        : !current ||
          current.revision !== expected ||
          current.actorId !== d.actorId ||
          d.revision !== expected + 1
    )
      return false;
    this.documents.set(key, clone(d));
    return true;
  }
}
export interface ActorConversationContext {
  readonly access: RoomActorAccess;
  readonly conversationId: string;
  readonly messages: readonly PrivateRoomMessage[];
}
/** Authorized application surface. All private execution uses a fresh audience-bound context. */
export class ActorRoomConversations {
  constructor(
    private readonly store: RoomConversationStore,
    private readonly policy: RoomAccessPolicy,
    private readonly options: { id?: () => string; now?: () => Date } = {},
  ) {}
  private id() {
    return this.options.id?.() ?? globalThis.crypto.randomUUID();
  }
  private async authorize(a: RoomActorAccess, action: RoomAccessAction) {
    if (
      !a.tenantId ||
      !a.roomId ||
      !a.actorId ||
      !(await this.policy(clone(a), action))
    )
      return deny();
  }
  async create(access: RoomActorAccess): Promise<RoomConversation> {
    const a = clone(access);
    await this.authorize(a, "write");
    const d: RoomConversation = {
      schemaVersion: 1,
      id: this.id(),
      tenantId: a.tenantId,
      roomId: a.roomId,
      actorId: a.actorId,
      revision: 0,
      messages: [],
    };
    if (!(await this.store.compareAndSet(d, null)))
      throw new AgentPlatError("CONFLICT", "Conversation exists");
    return clone(d);
  }
  async list(access: RoomActorAccess) {
    const a = clone(access);
    await this.authorize(a, "read");
    return (await this.store.list(a.tenantId, a.roomId, a.actorId))
      .filter(
        (d) =>
          d.tenantId === a.tenantId &&
          d.roomId === a.roomId &&
          d.actorId === a.actorId,
      )
      .map(clone);
  }
  async read(access: RoomActorAccess, id: string): Promise<RoomConversation> {
    const a = clone(access);
    await this.authorize(a, "read");
    const d = await this.store.load(a.tenantId, a.roomId, id);
    if (
      !d ||
      !d.actorId ||
      d.actorId !== a.actorId ||
      d.tenantId !== a.tenantId ||
      d.roomId !== a.roomId
    )
      return deny();
    return clone(d);
  }
  /** Safe replacement for an application Room-state endpoint. No raw events, memory, runs or snapshots. */
  async getRoomState(access: RoomActorAccess) {
    const a = clone(access);
    return {
      tenantId: a.tenantId,
      roomId: a.roomId,
      actorId: a.actorId,
      conversations: await this.list(a),
    };
  }
  async resolveReferences(
    access: RoomActorAccess,
    id: string,
    ids: readonly string[],
  ) {
    const d = await this.read(access, id);
    return ids.map((ref) => {
      const m = d.messages.find((m) => m.id === ref);
      if (!m) return deny();
      return clone(m);
    });
  }
  async append(
    access: RoomActorAccess,
    id: string,
    input: {
      content: string;
      replyTo?: string;
      references?: readonly string[];
    },
  ) {
    const a = clone(access);
    const i = clone(input);
    const d = await this.read(a, id);
    await this.authorize(a, "write");
    return this.appendTo(d, i, "human", a.actorId);
  }
  private async appendTo(
    d: RoomConversation,
    input: {
      content: string;
      replyTo?: string;
      references?: readonly string[];
    },
    role: "human" | "agent",
    authorId: string,
  ) {
    if (typeof input.content !== "string" || !input.content.trim())
      throw new AgentPlatError("VALIDATION_ERROR", "Message content required");
    const refs = [
      ...(input.references ?? []),
      ...(input.replyTo ? [input.replyTo] : []),
    ];
    if (refs.some((ref) => !d.messages.some((m) => m.id === ref)))
      return deny();
    const message: PrivateRoomMessage = {
      id: this.id(),
      role,
      authorId,
      content: input.content,
      references: [...(input.references ?? [])],
      replyTo: input.replyTo,
      createdAt: (this.options.now?.() ?? new Date()).toISOString(),
    };
    const updated = {
      ...d,
      revision: d.revision + 1,
      messages: [...d.messages, message],
    };
    if (!(await this.store.compareAndSet(updated, d.revision)))
      throw new AgentPlatError("CONFLICT", "Conversation changed");
    return clone(message);
  }
  async search(access: RoomActorAccess, query: string) {
    return (await this.list(access)).flatMap((d) =>
      d.messages
        .filter((m) => m.content.includes(query))
        .map((message) => ({ conversationId: d.id, message })),
    );
  }
  async context(
    access: RoomActorAccess,
    id: string,
    limit = 20,
  ): Promise<ActorConversationContext> {
    if (!Number.isSafeInteger(limit) || limit < 0)
      throw new AgentPlatError("VALIDATION_ERROR", "Invalid context limit");
    const a = clone(access);
    const d = await this.read(a, id);
    return {
      access: a,
      conversationId: d.id,
      messages: limit === 0 ? [] : d.messages.slice(-limit),
    };
  }
  /** Trusted host callback only. Agent ID is host-selected, never client-authorized by this method. */
  async execute(
    access: RoomActorAccess,
    id: string,
    input: {
      agentId: string;
      replyTo?: string;
      references?: readonly string[];
    },
    run: (context: ActorConversationContext) => Promise<string>,
  ) {
    const a = clone(access);
    const i = clone(input);
    const d = await this.read(a, id);
    await this.authorize(a, "execute");
    await this.authorize(a, "write");
    if (
      !i.agentId ||
      [...(i.references ?? []), ...(i.replyTo ? [i.replyTo] : [])].some(
        (ref) => !d.messages.some((m) => m.id === ref),
      )
    )
      return deny();
    const content = await run({
      access: clone(a),
      conversationId: id,
      messages: clone(d.messages),
    });
    await this.authorize(a, "execute");
    await this.authorize(a, "write");
    return this.appendTo(d, { ...i, content }, "agent", i.agentId);
  }
  /** Trusted migration API: owner mapping must be verified by the host; never expose as a route. */
  async backfill(input: {
    tenantId: string;
    roomId: string;
    conversationId: string;
    ownerActorId: string | undefined;
    humanParticipantIds: readonly string[];
    messages: readonly RoomMessage[];
  }) {
    const i = clone(input);
    if (
      !i.ownerActorId ||
      !i.tenantId ||
      !i.roomId ||
      !i.conversationId ||
      i.messages.some(
        (m) =>
          m.tenantId !== i.tenantId ||
          m.roomId !== i.roomId ||
          !m.authorParticipantId ||
          !["human", "agent"].includes(m.role) ||
          (m.role === "human" &&
            !i.humanParticipantIds.includes(m.authorParticipantId)),
      ) ||
      new Set(i.messages.map((m) => m.id)).size !== i.messages.length
    )
      return deny();
    const d: RoomConversation = {
      schemaVersion: 1,
      id: i.conversationId,
      tenantId: i.tenantId,
      roomId: i.roomId,
      actorId: i.ownerActorId,
      revision: 0,
      migrationSource: "legacy-room-messages-v1",
      messages: i.messages.map((m) => ({
        id: m.id,
        role: m.role as "human" | "agent",
        authorId: m.authorParticipantId!,
        content: m.content,
        references: [],
        createdAt: m.createdAt,
      })),
    };
    if (!(await this.store.compareAndSet(d, null)))
      throw new AgentPlatError("CONFLICT", "Conversation already migrated");
    return clone(d);
  }
}
