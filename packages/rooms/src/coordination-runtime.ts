import { AgentPlatError } from "@agentplat/core";
import type { ISODateTime } from "@agentplat/core";
import type {
  AgentRoomCoordinator,
  RoomRoutingDecision,
} from "./coordination.js";
import type {
  AgentRoomHandoffCoordinator,
  RoomHandoff,
} from "./room-handoff.js";
import type { RoomRepository } from "./repository.js";

/** Aggregate lifecycle of one Room coordination inbox. */
export type AgentRoomCoordinationStatus =
  | "idle"
  | "routing"
  | "executing"
  | "waiting_for_human"
  | "completed"
  | "failed";

/** Durable, leased and replay-safe unit of Room coordination work. */
export interface AgentRoomCoordinationItem {
  itemId: string;
  kind: "message" | "handoff";
  referenceId: string;
  status: "pending" | "processing" | "completed" | "failed";
  operationId: string;
  attempts: number;
  leaseToken?: string;
  leaseExpiresAt?: ISODateTime;
  runIds: string[];
  errorMessage?: string;
  errorCode?: string;
  errorCategory?:
    "transient" | "policy" | "configuration" | "validation" | "internal";
  retryable?: boolean;
  nextAttemptAt?: ISODateTime;
  contributionIds?: string[];
}

/** Revisioned Room-scoped coordination inbox and its operational status. */
export interface AgentRoomCoordinationState {
  tenantId: string;
  roomId: string;
  coordinationId: string;
  revision: number;
  status: AgentRoomCoordinationStatus;
  items: AgentRoomCoordinationItem[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** Compare-and-set persistence with optional ready and Room-scoped discovery. */
export interface AgentRoomCoordinationStore {
  load(
    tenantId: string,
    roomId: string,
    coordinationId: string,
  ): Promise<AgentRoomCoordinationState | undefined>;
  compareAndSet(input: {
    expectedRevision: number | null;
    state: AgentRoomCoordinationState;
  }): Promise<boolean>;
  listReady?(input?: {
    tenantId?: string;
    now?: ISODateTime;
    limit?: number;
  }): Promise<AgentRoomCoordinationState[]>;
  list?(
    tenantId: string,
    roomId: string,
  ): Promise<AgentRoomCoordinationState[]>;
}

/** Test-oriented in-memory coordination store with ready-state discovery. */
export class InMemoryAgentRoomCoordinationStore implements AgentRoomCoordinationStore {
  private readonly states = new Map<string, AgentRoomCoordinationState>();
  async load(tenantId: string, roomId: string, coordinationId: string) {
    return clone(this.states.get(key(tenantId, roomId, coordinationId)));
  }
  async compareAndSet(input: {
    expectedRevision: number | null;
    state: AgentRoomCoordinationState;
  }) {
    const stateKey = key(
      input.state.tenantId,
      input.state.roomId,
      input.state.coordinationId,
    );
    const current = this.states.get(stateKey);
    if (input.expectedRevision === null) {
      if (current || input.state.revision !== 0) return false;
    } else if (
      !current ||
      current.revision !== input.expectedRevision ||
      input.state.revision !== input.expectedRevision + 1
    ) {
      return false;
    }
    this.states.set(stateKey, clone(input.state)!);
    return true;
  }
  async listReady(
    input: { tenantId?: string; now?: string; limit?: number } = {},
  ) {
    const now = new Date(input.now ?? new Date().toISOString()).getTime();
    return [...this.states.values()]
      .filter((state) => !input.tenantId || state.tenantId === input.tenantId)
      .filter((state) => state.items.some((item) => readyItem(item, now)))
      .slice(0, input.limit ?? 100)
      .map((state) => clone(state)!);
  }
  async list(tenantId: string, roomId: string) {
    return [...this.states.values()]
      .filter((state) => state.tenantId === tenantId && state.roomId === roomId)
      .map((state) => clone(state)!);
  }
}

/** Adapts transactional RoomRepository coordination persistence to the store API. */
export class RepositoryAgentRoomCoordinationStore implements AgentRoomCoordinationStore {
  constructor(private readonly repository: RoomRepository) {}
  async load(tenantId: string, roomId: string, coordinationId: string) {
    if (!this.repository.getAgentRoomCoordinationState) {
      throw new AgentPlatError(
        "ADAPTER_ERROR",
        "Room repository does not support coordination state",
      );
    }
    return this.repository.getAgentRoomCoordinationState(
      tenantId,
      roomId,
      coordinationId,
    );
  }
  async compareAndSet(input: {
    expectedRevision: number | null;
    state: AgentRoomCoordinationState;
  }) {
    return this.repository.transaction(
      input.state.tenantId,
      async (transaction) => {
        if (!transaction.saveAgentRoomCoordinationState) {
          throw new AgentPlatError(
            "ADAPTER_ERROR",
            "Room repository transaction does not support coordination state",
          );
        }
        return transaction.saveAgentRoomCoordinationState(
          input.state,
          input.expectedRevision,
        );
      },
    );
  }
  async listReady(
    input: { tenantId?: string; now?: string; limit?: number } = {},
  ) {
    if (!this.repository.listAgentRoomCoordinationStates) {
      throw new AgentPlatError(
        "ADAPTER_ERROR",
        "Room repository does not support coordination discovery",
      );
    }
    const now = new Date(input.now ?? new Date().toISOString()).getTime();
    return (
      await this.repository.listAgentRoomCoordinationStates(input.tenantId)
    )
      .filter((state) => state.items.some((item) => readyItem(item, now)))
      .slice(0, input.limit ?? 100);
  }
  async list(tenantId: string, roomId: string) {
    if (!this.repository.listAgentRoomCoordinationStates) {
      throw new AgentPlatError(
        "ADAPTER_ERROR",
        "Room repository does not support coordination discovery",
      );
    }
    return (
      await this.repository.listAgentRoomCoordinationStates(tenantId)
    ).filter((state) => state.roomId === roomId);
  }
}

/** Provider-neutral effect boundary used after routing and Handoff validation. */
export interface AgentRoomCoordinationExecutionPort {
  dispatchMessage(input: {
    tenantId: string;
    roomId: string;
    messageId: string;
    participantIds: string[];
    routing: Extract<RoomRoutingDecision, { kind: "assigned" }>;
    operationId: string;
  }): Promise<{
    status: "executing" | "waiting_for_human" | "completed";
    runIds?: string[];
  }>;
  dispatchHandoff(input: {
    handoff: RoomHandoff;
    operationId: string;
  }): Promise<{
    status: "executing" | "waiting_for_human" | "completed";
    runIds?: string[];
  }>;
}

/**
 * Claims, routes, dispatches and reconciles coordination items under revision
 * and lease fencing while retaining stable operation identities.
 */
export class AgentRoomCoordinationRuntime {
  private readonly clock: () => Date;
  constructor(
    private readonly store: AgentRoomCoordinationStore,
    private readonly routing: AgentRoomCoordinator,
    private readonly handoffs: AgentRoomHandoffCoordinator,
    private readonly execution: AgentRoomCoordinationExecutionPort,
    private readonly options: {
      clock?: () => Date;
      humanContributions?: {
        get(input: {
          tenantId: string;
          roomId: string;
          contributionId: string;
        }): Promise<{ status: string; blocking: boolean }>;
      };
      maximumAttempts?: number;
      baseRetryMs?: number;
    } = {},
  ) {
    this.clock = options.clock ?? (() => new Date());
  }

  async initialize(input: {
    tenantId: string;
    roomId: string;
    coordinationId: string;
  }) {
    const now = this.now();
    const state: AgentRoomCoordinationState = {
      ...input,
      revision: 0,
      status: "idle",
      items: [],
      createdAt: now,
      updatedAt: now,
    };
    if (!(await this.store.compareAndSet({ expectedRevision: null, state }))) {
      const existing = await this.requireState(input);
      return existing;
    }
    return clone(state)!;
  }

  async enqueue(input: {
    tenantId: string;
    roomId: string;
    coordinationId: string;
    expectedRevision: number;
    itemId: string;
    kind: "message" | "handoff";
    referenceId: string;
  }) {
    const current = await this.requireState(input);
    if (current.items.some((item) => item.itemId === input.itemId))
      return current;
    if (current.revision !== input.expectedRevision) conflict();
    const next: AgentRoomCoordinationState = {
      ...current,
      revision: current.revision + 1,
      status: "idle",
      items: [
        ...current.items,
        {
          itemId: input.itemId,
          kind: input.kind,
          referenceId: input.referenceId,
          status: "pending",
          operationId: `${current.coordinationId}:${input.kind}:${input.itemId}`,
          attempts: 0,
          runIds: [],
        },
      ],
      updatedAt: this.now(),
    };
    await this.commit(current.revision, next);
    return clone(next)!;
  }

  async runNext(input: {
    tenantId: string;
    roomId: string;
    coordinationId: string;
    expectedRevision: number;
    leaseToken: string;
    leaseMs?: number;
    onClaimed?(input: {
      state: AgentRoomCoordinationState;
      itemId: string;
    }): Promise<void> | void;
  }) {
    const current = await this.requireState(input);
    if (current.revision !== input.expectedRevision) conflict();
    const now = this.clock();
    const item = current.items.find(
      (candidate) =>
        candidate.status === "pending" ||
        (candidate.status === "failed" &&
          candidate.retryable === true &&
          candidate.attempts < (this.options.maximumAttempts ?? 8) &&
          new Date(candidate.nextAttemptAt ?? 0).getTime() <= now.getTime()) ||
        (candidate.status === "processing" &&
          candidate.leaseExpiresAt !== undefined &&
          new Date(candidate.leaseExpiresAt).getTime() <= now.getTime()),
    );
    if (!item) return current;
    const leaseMs = input.leaseMs ?? 30_000;
    if (!Number.isSafeInteger(leaseMs) || leaseMs < 1 || leaseMs > 300_000) {
      throw new AgentPlatError(
        "VALIDATION_ERROR",
        "Coordination leaseMs is invalid",
      );
    }
    const claimed: AgentRoomCoordinationState = {
      ...current,
      revision: current.revision + 1,
      status: item.kind === "message" ? "routing" : "executing",
      items: current.items.map((candidate) =>
        candidate.itemId === item.itemId
          ? {
              ...candidate,
              status: "processing",
              attempts: candidate.attempts + 1,
              leaseToken: input.leaseToken,
              leaseExpiresAt: new Date(now.getTime() + leaseMs).toISOString(),
              errorMessage: undefined,
              errorCode: undefined,
              errorCategory: undefined,
              retryable: undefined,
              nextAttemptAt: undefined,
            }
          : candidate,
      ),
      updatedAt: now.toISOString(),
    };
    await this.commit(current.revision, claimed);
    await input.onClaimed?.({ state: clone(claimed)!, itemId: item.itemId });

    let outcome: {
      status: "executing" | "waiting_for_human" | "completed";
      runIds?: string[];
    };
    try {
      if (item.kind === "message") {
        const decision = await this.routing.routeMessage({
          tenantId: input.tenantId,
          roomId: input.roomId,
          messageId: item.referenceId,
        });
        if (decision.kind === "unassigned") {
          outcome = { status: "waiting_for_human" };
        } else {
          outcome = await this.execution.dispatchMessage({
            tenantId: input.tenantId,
            roomId: input.roomId,
            messageId: item.referenceId,
            participantIds: decision.participantIds,
            routing: decision,
            operationId: item.operationId,
          });
        }
      } else {
        const handoff = await this.handoffs.get({
          tenantId: input.tenantId,
          roomId: input.roomId,
          handoffId: item.referenceId,
        });
        if (handoff.status !== "accepted") {
          throw new AgentPlatError(
            "CONFLICT",
            "Coordination requires an accepted Handoff",
          );
        }
        outcome = await this.execution.dispatchHandoff({
          handoff,
          operationId: item.operationId,
        });
      }
    } catch (error) {
      const latest = await this.requireState(input);
      const owned = latest.items.find(
        (candidate) => candidate.itemId === item.itemId,
      );
      if (owned?.leaseToken !== input.leaseToken) throw error;
      const classified = classifyCoordinationError(error);
      const retryable =
        classified.retryable &&
        owned.attempts < (this.options.maximumAttempts ?? 8);
      const nextAttemptAt = new Date(
        this.clock().getTime() +
          Math.min(
            300_000,
            (this.options.baseRetryMs ?? 1_000) *
              2 ** Math.max(0, owned.attempts - 1),
          ),
      ).toISOString();
      const failed: AgentRoomCoordinationState = {
        ...latest,
        revision: latest.revision + 1,
        status: "failed",
        items: latest.items.map((candidate) =>
          candidate.itemId === item.itemId
            ? {
                ...candidate,
                status: "failed",
                leaseToken: undefined,
                leaseExpiresAt: undefined,
                errorMessage: classified.message,
                errorCode: classified.code,
                errorCategory: classified.category,
                retryable,
                nextAttemptAt: retryable ? nextAttemptAt : undefined,
              }
            : candidate,
        ),
        updatedAt: this.now(),
      };
      await this.commit(latest.revision, failed);
      return clone(failed)!;
    }
    const latest = await this.requireState(input);
    const owned = latest.items.find(
      (candidate) => candidate.itemId === item.itemId,
    );
    if (owned?.leaseToken !== input.leaseToken) {
      throw new AgentPlatError(
        "CONFLICT",
        "Coordination lease ownership was lost",
      );
    }
    const finished: AgentRoomCoordinationState = {
      ...latest,
      revision: latest.revision + 1,
      status: outcome.status,
      items: latest.items.map((candidate) =>
        candidate.itemId === item.itemId
          ? {
              ...candidate,
              status:
                outcome.status === "completed" ? "completed" : "processing",
              runIds: outcome.runIds ?? [],
              leaseToken: undefined,
              leaseExpiresAt: undefined,
            }
          : candidate,
      ),
      updatedAt: this.now(),
    };
    await this.commit(latest.revision, finished);
    return clone(finished)!;
  }

  async renewLease(input: {
    tenantId: string;
    roomId: string;
    coordinationId: string;
    expectedRevision: number;
    itemId: string;
    leaseToken: string;
    leaseMs: number;
  }) {
    const current = await this.requireState(input);
    if (current.revision !== input.expectedRevision) conflict();
    const item = current.items.find(
      (candidate) => candidate.itemId === input.itemId,
    );
    if (item?.status !== "processing" || item.leaseToken !== input.leaseToken) {
      throw new AgentPlatError(
        "CONFLICT",
        "Coordination lease ownership was lost",
      );
    }
    const next: AgentRoomCoordinationState = {
      ...current,
      revision: current.revision + 1,
      items: current.items.map((candidate) =>
        candidate.itemId === input.itemId
          ? {
              ...candidate,
              leaseExpiresAt: new Date(
                this.clock().getTime() + input.leaseMs,
              ).toISOString(),
            }
          : candidate,
      ),
      updatedAt: this.now(),
    };
    await this.commit(current.revision, next);
    return next;
  }

  async resolveItem(input: {
    tenantId: string;
    roomId: string;
    coordinationId: string;
    expectedRevision: number;
    itemId: string;
    outcome: "completed" | "failed" | "waiting_for_human";
    errorMessage?: string;
  }) {
    const current = await this.requireState(input);
    if (current.revision !== input.expectedRevision) conflict();
    const item = current.items.find(
      (candidate) => candidate.itemId === input.itemId,
    );
    if (!item || item.status !== "processing") {
      throw new AgentPlatError(
        "CONFLICT",
        "Coordination item is not processing",
      );
    }
    const terminal =
      input.outcome === "completed" || input.outcome === "failed";
    const itemStatus: AgentRoomCoordinationItem["status"] = terminal
      ? input.outcome === "completed"
        ? "completed"
        : "failed"
      : "processing";
    const next: AgentRoomCoordinationState = {
      ...current,
      revision: current.revision + 1,
      status: input.outcome,
      items: current.items.map((candidate) =>
        candidate.itemId === input.itemId
          ? {
              ...candidate,
              status: itemStatus,
              errorMessage: input.errorMessage,
            }
          : candidate,
      ),
      updatedAt: this.now(),
    };
    await this.commit(current.revision, next);
    return clone(next)!;
  }

  async resumeFromHumanContribution(input: {
    tenantId: string;
    roomId: string;
    coordinationId: string;
    expectedRevision: number;
    itemId: string;
    contributionId: string;
  }) {
    if (!this.options.humanContributions) {
      throw new AgentPlatError(
        "ADAPTER_ERROR",
        "Human contribution coordinator is not configured",
      );
    }
    const contribution = await this.options.humanContributions.get(input);
    if (contribution.status !== "completed") {
      throw new AgentPlatError(
        "CONFLICT",
        "Human contribution is not completed",
      );
    }
    const current = await this.requireState(input);
    if (
      current.revision !== input.expectedRevision ||
      current.status !== "waiting_for_human"
    ) {
      conflict();
    }
    const item = current.items.find(
      (candidate) => candidate.itemId === input.itemId,
    );
    if (!item || item.status !== "processing") {
      throw new AgentPlatError("CONFLICT", "Coordination item is not waiting");
    }
    const next: AgentRoomCoordinationState = {
      ...current,
      revision: current.revision + 1,
      status: "idle",
      items: current.items.map((candidate) =>
        candidate.itemId === input.itemId
          ? {
              ...candidate,
              status: "pending",
              contributionIds: [
                ...new Set([
                  ...(candidate.contributionIds ?? []),
                  input.contributionId,
                ]),
              ],
            }
          : candidate,
      ),
      updatedAt: this.now(),
    };
    await this.commit(current.revision, next);
    return clone(next)!;
  }

  private async requireState(input: {
    tenantId: string;
    roomId: string;
    coordinationId: string;
  }) {
    const state = await this.store.load(
      input.tenantId,
      input.roomId,
      input.coordinationId,
    );
    if (!state)
      throw new AgentPlatError(
        "NOT_FOUND",
        "Agent Room coordination state not found",
      );
    return state;
  }

  private async commit(
    expectedRevision: number,
    state: AgentRoomCoordinationState,
  ) {
    if (!(await this.store.compareAndSet({ expectedRevision, state })))
      conflict();
  }

  private now() {
    return this.clock().toISOString();
  }
}

function conflict(): never {
  throw new AgentPlatError(
    "CONFLICT",
    "Agent Room coordination revision conflict",
  );
}
function key(tenantId: string, roomId: string, coordinationId: string) {
  return `${tenantId}\u0000${roomId}\u0000${coordinationId}`;
}
function clone<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : structuredClone(value);
}

/** Maps an unknown failure to a bounded, redacted retry classification. */
export function classifyCoordinationError(error: unknown): {
  code: string;
  category:
    "transient" | "policy" | "configuration" | "validation" | "internal";
  retryable: boolean;
  message: string;
} {
  const code = error instanceof AgentPlatError ? error.code : "INTERNAL_ERROR";
  const category =
    code === "FORBIDDEN" || code === "UNAUTHORIZED"
      ? "policy"
      : code === "VALIDATION_ERROR" || code === "BAD_REQUEST"
        ? "validation"
        : code === "ADAPTER_ERROR"
          ? "transient"
          : code === "NOT_FOUND"
            ? "configuration"
            : code === "CONFLICT"
              ? "transient"
              : "internal";
  return {
    code,
    category,
    retryable: category === "transient" || category === "internal",
    message: redactError(
      error instanceof Error ? error.message : "Coordination failed",
    ),
  };
}

function redactError(message: string) {
  return message
    .replace(
      /(api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/giu,
      "$1=[REDACTED]",
    )
    .slice(0, 500);
}

function readyItem(item: AgentRoomCoordinationItem, now: number) {
  return (
    item.status === "pending" ||
    (item.status === "failed" &&
      item.retryable === true &&
      new Date(item.nextAttemptAt ?? 0).getTime() <= now) ||
    (item.status === "processing" &&
      item.leaseExpiresAt !== undefined &&
      new Date(item.leaseExpiresAt).getTime() <= now)
  );
}
