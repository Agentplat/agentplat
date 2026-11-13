import { canonicalPlannerJson } from "./planner-json.js";
import { RoomPlannerCallError } from "./room-planner-contracts.js";
import { AgentPlatError } from "@agentplat/core";
import {
  conversationReference,
  validateConversationReference,
} from "./conversations.js";
import type { RoomConversationReference } from "./conversations.js";
import type {
  RoomPlannerScope,
  RoomPlannerState,
  RoomPlannerStore,
  RoomPlannerPorts,
  RoomPlannerOperation,
  RoomPlannerProposal,
  RoomPlannerObjective,
  RoomPlannerTask,
  RoomPlannerUsage,
  RoomPlannerCall,
  RoomPlannerEvent,
  PlannerInitiativeAdmissionV1,
  PlannerInitiativeObservationV1,
} from "./room-planner-contracts.js";
export * from "./room-planner-contracts.js";

function fail(message: string): never {
  throw new AgentPlatError("VALIDATION_ERROR", message);
}
function repairable(message: string): never {
  throw new AgentPlatError("VALIDATION_ERROR", message, {
    details: { plannerRepair: "fresh_task_identity" },
  });
}
function conflict(): never {
  throw new AgentPlatError(
    "CONFLICT",
    "Planner state changed; retry the operation",
  );
}
function integer(n: number, positive = false) {
  if (!Number.isSafeInteger(n) || n < (positive ? 1 : 0))
    fail("Expected bounded integer");
}
function text(s: string) {
  if (
    typeof s !== "string" ||
    !s.trim() ||
    s.length > 32_000 ||
    /[\uD800-\uDFFF]/u.test(s)
  )
    fail("Expected bounded nonempty text");
}
function same(a: unknown, b: unknown) {
  return canonicalPlannerJson(a) === canonicalPlannerJson(b);
}
function responseConversation(
  event: RoomPlannerEvent,
): RoomConversationReference {
  return event.kind === "message" && event.threadId && event.messageId
    ? { threadId: event.threadId, replyToMessageId: event.messageId }
    : conversationReference(event);
}
export function roomPlannerBudget(state: RoomPlannerState) {
  const spentMicros = state.operations.reduce(
    (n, op) => n + (op.usage?.costMicros ?? 0),
    0,
  );
  const reservedMicros = state.operations
    .filter((op) => op.status === "running" || op.status === "uncertain")
    .reduce((n, op) => n + op.reservedMicros, 0);
  return {
    spentMicros,
    reservedMicros,
    availableMicros: state.budgetLimitMicros - spentMicros - reservedMicros,
  };
}
export class InMemoryRoomPlannerStore implements RoomPlannerStore {
  private states = new Map<string, RoomPlannerState>();
  private key(s: RoomPlannerScope) {
    return JSON.stringify([s.tenantId, s.roomId]);
  }
  async load(scope: RoomPlannerScope) {
    const s = this.states.get(this.key(scope));
    return s && structuredClone(s);
  }
  async compareAndSet(expected: number | null, state: RoomPlannerState) {
    const old = this.states.get(this.key(state));
    if (
      (old?.revision ?? null) !== expected ||
      state.revision !== (expected === null ? 0 : expected + 1)
    )
      return false;
    this.states.set(this.key(state), structuredClone(state));
    return true;
  }
  async list() {
    return [...this.states.values()].map(({ tenantId, roomId }) => ({
      tenantId,
      roomId,
    }));
  }
}

/** Durable Room coordination. Every external call is reserved and journaled before invocation. */
export class AgentRoomPlanner {
  constructor(private readonly ports: RoomPlannerPorts) {
    for (const value of Object.values(ports.reservationMicros))
      integer(value, true);
    integer(ports.leaseMs ?? 300_000, true);
  }
  private now() {
    return (this.ports.clock?.() ?? new Date()).toISOString();
  }
  async get(scope: RoomPlannerScope) {
    await this.ports.authorize(scope, "read");
    const state = await this.ports.store.load(scope);
    if (!state)
      throw new AgentPlatError("NOT_FOUND", "Planner is not configured");
    return state;
  }
  /** Use this same fence from workflow heartbeats and every protected effect sink. */
  async assertCurrent(scope: RoomPlannerScope, operationId: string) {
    let current = await this.get(scope),
      operation = current.operations.find((op) => op.id === operationId);
    if (!operation) conflict();
    await this.ports.authorize(scope, "execute", operation.objectiveId);
    await this.assertConversation(scope, operation);
    if (operation.initiativeId)
      await this.assertInitiative(
        scope,
        this.initiative(current, operation.initiativeId),
        "call",
      );
    this.assertBudgetBinding(current);
    if (operation.sharedBudget)
      await this.ports.sharedBudget!.assertCurrent(scope, operation);
    current = await this.get(scope);
    operation = current.operations.find((op) => op.id === operationId);
    this.assertBudgetBinding(current);
    if (
      !operation ||
      operation.status !== "running" ||
      operation.expiresAt <= this.now() ||
      current.mode === "drain" ||
      (operation.admissionMode && current.mode !== operation.admissionMode) ||
      (current.sharedBudgetBinding &&
        (!operation.sharedBudget || operation.sharedBudgetPending)) ||
      (operation.kind !== "reason" && current.mode !== "execute")
    )
      conflict();
    if (operation.objectiveId) {
      const objective = this.objective(current, operation.objectiveId);
      if (
        objective.status !== "active" ||
        objective.controlRevision !== operation.controlRevision ||
        objective.activePlanId !== operation.planId
      )
        conflict();
    }
  }
  /** Zero-inference observation. No event is enqueued until explicit cohort selection. */
  async observeInitiative(scope: RoomPlannerScope, id: string) {
    await this.ports.authorize(scope, "observeInitiative", id);
    text(id);
    if (!this.ports.initiatives) fail("Initiative host port is required");
    const existing = await this.get(scope);
    // ID-only replays return the original authority snapshot. Reconnecting a source must not mint a new grant.
    if (existing.initiatives?.some((item) => item.id === id)) return existing;
    const input = structuredClone(
      await this.ports.initiatives.resolve(scope, id),
    );
    if (input.id !== id) fail("Initiative identity mismatch");
    text(input.reason);
    if (typeof input.eligible !== "boolean")
      fail("Invalid initiative eligibility");
    this.validateInitiative(scope, input.admission);
    return this.change(scope, (state) => {
      const prior = state.initiatives?.find((item) => item.id === id);
      if (prior) return; // A concurrent ID-only observation already owns the immutable snapshot.
      const items = (state.initiatives ??= []);
      for (const older of items) {
        if (
          older.status === "eligible" &&
          older.admission.ownerId === input.admission.ownerId &&
          older.admission.subject.id === input.admission.subject.id &&
          older.admission.subject.revision < input.admission.subject.revision
        ) {
          older.status = "suppressed";
          older.stopReason = "superseded_revision";
        }
      }
      items.push({
        ...input,
        observedAt: this.now(),
        status: input.eligible ? "eligible" : "suppressed",
        readClaims: [],
      });
    });
  }
  /** Explicitly select a recorded eligible cohort; changing Planner mode never selects history. */
  async selectInitiative(scope: RoomPlannerScope, id: string) {
    await this.ports.authorize(scope, "selectInitiative", id);
    const state = await this.get(scope);
    const item = state.initiatives?.find((candidate) => candidate.id === id);
    if (!item) fail("Initiative observation is required");
    if (item.status === "selected") return state;
    if (item.status !== "eligible" || !item.eligible) return state;
    if (state.mode !== "execute")
      fail("Initiative selection requires execute mode");
    try {
      await this.assertInitiative(scope, item, "admit");
    } catch (error) {
      return this.change(scope, (current) => {
        const blocked = current.initiatives!.find(
          (candidate) => candidate.id === id,
        )!;
        if (blocked.status !== "eligible") return;
        blocked.status = "suppressed";
        blocked.stopReason =
          blocked.admission.scope.expiresAt <= this.now()
            ? "expired_trigger"
            : error instanceof Error
              ? error.message
              : "Initiative admission denied";
      });
    }
    const event = structuredClone(
      await this.ports.resolveEvent(scope, item.admission.trigger.eventId),
    );
    if (
      !event ||
      event.id !== item.admission.trigger.eventId ||
      !["external", "timer"].includes(event.kind) ||
      !event.provenance ||
      event.initiativeId ||
      event.targetParticipantIds?.length ||
      (event.objectiveId && event.objectiveId !== `initiative:${id}`)
    )
      fail(
        "Initiatives require a host-resolved external or timer event without authority",
      );
    text(event.actorId);
    text(event.content);
    text(event.provenance.source);
    text(event.provenance.eventId);
    if (!Number.isFinite(Date.parse(event.provenance.occurredAt)))
      fail("Invalid event occurrence time");
    validateConversationReference(event);
    await this.assertConversation(scope, event);
    event.initiativeId = id;
    event.objectiveId = `initiative:${id}`;
    return this.change(scope, (current) => {
      const selected = current.initiatives?.find(
        (candidate) => candidate.id === id,
      )!;
      if (selected.status === "selected") return;
      if (
        selected.status !== "eligible" ||
        current.mode !== "execute" ||
        selected.admission.scope.expiresAt <= this.now()
      )
        conflict();
      const prior = current.events.find(
        (candidate) => candidate.id === event.id,
      );
      if (prior && !same(prior, event))
        fail(
          "Initiative event identity already belongs to another inbox record",
        );
      if (!prior) current.events.push(event);
      selected.status = "selected";
      selected.selectedAt = this.now();
    });
  }
  /** Publication fence for versioned host artifacts after durable result persistence. */
  async assertInitiativePublication(scope: RoomPlannerScope, id: string) {
    await this.ports.authorize(scope, "publishInitiative", id);
    const state = await this.get(scope);
    if (state.mode !== "execute")
      fail("Initiative publication requires execute mode");
    const item = this.initiative(state, id);
    await this.assertInitiative(scope, item, "publish");
    return structuredClone(item.admission);
  }
  private validateInitiative(
    scope: RoomPlannerScope,
    admission: PlannerInitiativeAdmissionV1,
  ) {
    text(admission.ownerId);
    text(admission.policyRef);
    integer(admission.policyRevision, true);
    text(admission.subject.id);
    integer(admission.subject.revision, true);
    text(admission.trigger.eventId);
    if (
      !["new", "changed", "deadline", "blocked"].includes(
        admission.trigger.kind,
      ) ||
      admission.output !== "evidence_and_action_draft"
    )
      fail("Invalid initiative admission");
    if (admission.trigger.milestone !== undefined)
      text(admission.trigger.milestone);
    for (const list of [
      admission.evidenceRefs,
      admission.scope.roomIds,
      admission.scope.allowedReadTools,
    ]) {
      if (
        !Array.isArray(list) ||
        list.length > 64 ||
        new Set(list).size !== list.length
      )
        fail("Invalid initiative scope list");
      list.forEach(text);
    }
    if (
      !admission.scope.roomIds.includes(scope.roomId) ||
      !admission.evidenceRefs.length
    )
      fail("Initiative requires Room scope and persisted evidence");
    integer(admission.scope.maximumCalls, true);
    integer(admission.scope.maximumReadCalls);
    integer(admission.scope.maximumCostMicros, true);
    integer(admission.scope.maximumDurationMs, true);
    if (
      admission.scope.maximumCalls > 64 ||
      admission.scope.maximumReadCalls > 64 ||
      admission.scope.maximumDurationMs > 86_400_000 ||
      !Number.isFinite(Date.parse(admission.scope.expiresAt))
    )
      fail("Invalid initiative ceilings");
    // Require canonical UTC timestamps because all journal expiry comparisons are lexical.
    if (
      new Date(admission.scope.expiresAt).toISOString() !==
      admission.scope.expiresAt
    )
      fail("Initiative expiry must be canonical UTC");
    canonicalPlannerJson(admission);
  }
  private async assertInitiative(
    scope: RoomPlannerScope,
    item: PlannerInitiativeObservationV1,
    phase: "admit" | "call" | "read" | "publish",
  ) {
    if (!this.ports.initiatives)
      fail("The persisted initiative host port must remain connected");
    const state = await this.get(scope);
    const objective = state.objectives.find(
      (candidate) => candidate.initiativeId === item.id,
    );
    if (state.mode !== "execute")
      fail("Initiative execution and publication require execute mode");
    if (objective && ["paused", "canceled"].includes(objective.status))
      fail("Initiative objective was paused or canceled by its owner");
    if (phase !== "publish" && objective?.status === "waiting")
      fail("Initiative objective is waiting for an owner decision");
    if (item.status === "suppressed" || item.stopReason)
      fail(item.stopReason ?? "Initiative suppressed");
    if (
      item.executionExpiresAt
        ? item.executionExpiresAt <= this.now()
        : item.admission.scope.expiresAt <= this.now()
    )
      fail("Initiative expired; explicit renewal is required");
    await this.ports.initiatives.assertCurrent(
      scope,
      structuredClone(item.admission),
      phase,
    );
  }
  private stopInitiative(state: RoomPlannerState, id: string, reason: string) {
    const item = this.initiative(state, id);
    item.stopReason ??= reason;
    const objective = state.objectives.find((o) => o.initiativeId === id);
    if (objective?.status === "active") {
      objective.status = "waiting";
      objective.revision++;
      objective.controlRevision++;
    }
    for (const event of state.events)
      if (
        event.initiativeId === id &&
        !state.handledEventIds?.includes(event.id)
      )
        (state.handledEventIds ??= []).push(event.id);
  }
  private initiative(state: RoomPlannerState, id: string) {
    const item = state.initiatives?.find((candidate) => candidate.id === id);
    if (!item || item.status !== "selected")
      fail("Missing selected initiative binding");
    return item;
  }
  /** Rebind persisted authority at durable workflow/effect boundaries; never deserialize a grant from payload. */
  async operationCall(
    scope: RoomPlannerScope,
    operationId: string,
    signal?: AbortSignal,
  ): Promise<RoomPlannerCall> {
    await this.assertCurrent(scope, operationId);
    const state = await this.get(scope);
    const operation = state.operations.find((op) => op.id === operationId)!;
    const item = operation.initiativeId
      ? this.initiative(state, operation.initiativeId)
      : undefined;
    return {
      operationId,
      ...conversationReference(operation),
      signal,
      ...(item
        ? {
            initiative: structuredClone(item.admission),
            assertRead: (tool: string, roomId: string) =>
              this.claimRead(scope, operationId, tool, roomId),
            assertModelCall: () => this.claimModel(scope, operationId),
          }
        : {}),
      assertCurrent: async () => {
        if (signal?.aborted) throw new Error("Planner interrupted");
        await this.assertCurrent(scope, operationId);
      },
    };
  }
  private async claimModel(scope: RoomPlannerScope, operationId: string) {
    await this.assertCurrent(scope, operationId);
    await this.change(scope, (state) => {
      const operation = state.operations.find((op) => op.id === operationId)!;
      if (
        !operation.initiativeId ||
        operation.status !== "running" ||
        operation.modelClaimedAt
      )
        fail("Initiative model dispatch already claimed or unavailable");
      const item = this.initiative(state, operation.initiativeId);
      if (item.stopReason || item.executionExpiresAt! <= this.now())
        fail("Initiative expired or stopped");
      operation.modelClaimedAt = this.now();
    });
    await this.assertCurrent(scope, operationId);
  }
  private async claimRead(
    scope: RoomPlannerScope,
    operationId: string,
    tool: string,
    roomId: string,
  ) {
    text(tool);
    text(roomId);
    await this.assertCurrent(scope, operationId);
    const state = await this.get(scope);
    const operation = state.operations.find((op) => op.id === operationId)!;
    if (!operation.initiativeId)
      fail("Source-read claim requires an initiative operation");
    await this.assertInitiative(
      scope,
      this.initiative(state, operation.initiativeId),
      "read",
    );
    let denied = false;
    await this.change(
      scope,
      (current) => {
        const op = current.operations.find(
          (candidate) => candidate.id === operationId,
        )!;
        const item = this.initiative(current, op.initiativeId!);
        if (
          op.status !== "running" ||
          item.stopReason ||
          item.executionExpiresAt! <= this.now() ||
          !item.admission.scope.roomIds.includes(roomId) ||
          !item.admission.scope.allowedReadTools.includes(tool)
        )
          fail("Initiative source read exceeds its current grant or allowance");
        if (item.readClaims.length >= item.admission.scope.maximumReadCalls) {
          this.stopInitiative(current, item.id, "read_call_ceiling");
          denied = true;
          return;
        }
        item.readClaims.push({ operationId, tool, roomId, at: this.now() });
      },
      () => {
        denied = false;
      },
    );
    if (denied) fail("Initiative source read exceeds its allowance");
    // A revocation racing the atomic claim still prevents dispatch. Its claim is retained.
    await this.assertCurrent(scope, operationId);
  }
  async configure(
    scope: RoomPlannerScope,
    input: {
      mode: RoomPlannerState["mode"];
      budgetLimitMicros: number;
      concurrency?: number;
    },
  ) {
    await this.ports.authorize(scope, "configure");
    text(scope.tenantId);
    text(scope.roomId);
    integer(input.budgetLimitMicros, true);
    const concurrency = input.concurrency ?? 2;
    integer(concurrency, true);
    if (
      concurrency > 16 ||
      !["observe", "execute", "drain"].includes(input.mode)
    )
      fail("Invalid Planner configuration");
    const old = await this.ports.store.load(scope);
    if (this.ports.sharedBudget) text(this.ports.sharedBudget.bindingId);
    if (
      old?.sharedBudgetBinding &&
      old.sharedBudgetBinding !== this.ports.sharedBudget?.bindingId
    )
      fail("The persisted shared budget binding must remain connected");
    if (
      old &&
      !old.sharedBudgetBinding &&
      this.ports.sharedBudget &&
      old.operations.some((op) => ["running", "uncertain"].includes(op.status))
    )
      fail("Reconcile existing calls before attaching a shared budget");
    if (old) {
      return this.change(scope, (state) => {
        // Recheck on every CAS retry: a legacy call can start after the initial read.
        if (
          state.sharedBudgetBinding &&
          state.sharedBudgetBinding !== this.ports.sharedBudget?.bindingId
        )
          fail("The persisted shared budget binding must remain connected");
        if (
          !state.sharedBudgetBinding &&
          this.ports.sharedBudget &&
          state.operations.some((op) =>
            ["running", "uncertain"].includes(op.status),
          )
        )
          fail("Reconcile existing calls before attaching a shared budget");
        const budget = roomPlannerBudget(state);
        if (
          input.budgetLimitMicros <
          budget.spentMicros + budget.reservedMicros
        )
          fail("Budget cannot discard committed usage or reservations");
        state.mode = input.mode;
        state.budgetLimitMicros = input.budgetLimitMicros;
        state.concurrency = concurrency;
        if (this.ports.sharedBudget)
          state.sharedBudgetBinding = this.ports.sharedBudget.bindingId;
      });
    }
    const state: RoomPlannerState = {
      ...scope,
      schemaVersion: 1,
      revision: 0,
      mode: input.mode,
      concurrency,
      budgetLimitMicros: input.budgetLimitMicros,
      ...(this.ports.sharedBudget
        ? { sharedBudgetBinding: this.ports.sharedBudget.bindingId }
        : {}),
      objectives: [],
      events: [],
      operations: [],
      decisions: [],
      notifications: [],
    };
    if (!(await this.ports.store.compareAndSet(null, state))) conflict();
    return state;
  }
  async acceptEvent(scope: RoomPlannerScope, eventId: string) {
    await this.ports.authorize(scope, "acceptEvent");
    const event = structuredClone(
      await this.ports.resolveEvent(scope, eventId),
    );
    if (event.id !== eventId) fail("Event identity mismatch");
    if (event.initiativeId !== undefined)
      fail("Initiative authority cannot be supplied in an event");
    text(event.id);
    text(event.actorId);
    text(event.content);
    if (
      ![
        "message",
        "result",
        "specialist",
        "resume",
        "external",
        "timer",
      ].includes(event.kind)
    )
      fail("Invalid Planner event kind");
    validateConversationReference(event);
    if (event.messageId !== undefined) text(event.messageId);
    if (event.kind === "message" && event.threadId && !event.messageId)
      fail("Threaded messages require a persisted messageId");
    if (event.targetParticipantIds !== undefined) {
      if (
        !Array.isArray(event.targetParticipantIds) ||
        (event.kind !== "message" && event.targetParticipantIds.length > 0) ||
        event.targetParticipantIds.length > 16 ||
        new Set(event.targetParticipantIds).size !==
          event.targetParticipantIds.length
      )
        fail("Only owner messages can directly address participants");
      event.targetParticipantIds.forEach(text);
    }
    if (["external", "timer"].includes(event.kind) && !event.provenance)
      fail("External and timer events require provenance");
    if (event.provenance) {
      text(event.provenance.source);
      text(event.provenance.eventId);
      if (
        typeof event.provenance.occurredAt !== "string" ||
        !Number.isFinite(Date.parse(event.provenance.occurredAt))
      )
        fail("Invalid event occurrence time");
    }
    await this.assertConversation(scope, event);
    if (event.kind === "message" && event.threadId && event.messageId)
      await this.assertConversation(scope, {
        threadId: event.threadId,
        replyToMessageId: event.messageId,
      });
    return this.change(scope, (state) => {
      // An event referencing an existing initiative inherits its engine-owned grant;
      // it cannot reach generic reasoning and acquire fresh interactive allowance.
      const objective = event.objectiveId
        ? state.objectives.find(
            (candidate) => candidate.id === event.objectiveId,
          )
        : undefined;
      if (objective?.initiativeId && event.targetParticipantIds?.length)
        fail(
          "Initiative objective events cannot use unrestricted direct routing",
        );
      const boundEvent = objective?.initiativeId
        ? { ...event, initiativeId: objective.initiativeId }
        : event;
      const prior = state.events.find((e) => e.id === event.id);
      if (prior && !same(prior, boundEvent))
        fail("Event identity reused with different content");
      if (!prior) state.events.push(structuredClone(boundEvent));
    });
  }
  private async assertConversation(
    scope: RoomPlannerScope,
    reference: RoomConversationReference,
  ) {
    if (!reference.threadId && !reference.replyToMessageId) return;
    if (!reference.threadId)
      fail("Planner conversations require an explicit threadId");
    if (!this.ports.resolveConversation)
      fail("Planner conversation resolver is required");
    const resolved = await this.ports.resolveConversation(
      scope,
      conversationReference(reference),
    );
    if (
      resolved.threadId !== reference.threadId ||
      (reference.replyToMessageId &&
        resolved.replyToMessageId !== reference.replyToMessageId)
    )
      fail("Planner conversation reference does not match persisted messages");
  }
  async recordSpecialistProposal(scope: RoomPlannerScope, eventId: string) {
    const event = await this.ports.resolveEvent(scope, eventId);
    if (event.kind !== "specialist")
      fail("Expected a persisted specialist contribution");
    await this.ports.authorize(scope, "specialist", event.actorId);
    return this.acceptEvent(scope, eventId);
  }
  async intervene(
    scope: RoomPlannerScope,
    input: {
      objectiveId: string;
      expectedRevision: number;
      action: "pause" | "resume" | "cancel" | "priority";
      priority?: number;
    },
  ) {
    await this.ports.authorize(scope, "intervene", input.objectiveId);
    if (!["pause", "resume", "cancel", "priority"].includes(input.action))
      fail("Invalid intervention action");
    const state = await this.change(scope, (s) => {
      const o = this.objective(s, input.objectiveId);
      if (o.revision !== input.expectedRevision) conflict();
      if (o.status === "completed" || o.status === "canceled")
        fail("Terminal objective");
      if (input.action === "priority") {
        integer(input.priority!);
        o.priority = input.priority!;
      } else if (input.action === "resume") {
        o.status = "active";
        o.noProgressCycles = 0;
        o.reviewFailures = 0;
      } else o.status = input.action === "pause" ? "paused" : "canceled";
      o.revision++;
      if (input.action !== "priority") o.controlRevision++;
      if (input.action === "resume")
        s.events.push({
          id: `resume:${o.id}:${o.revision}`,
          kind: "resume",
          ...(o.initiativeId ? { initiativeId: o.initiativeId } : {}),
          actorId: "owner",
          objectiveId: o.id,
          ...conversationReference(o),
          content:
            "Resume the existing objective; reconcile prior work and revise only if necessary.",
        });
    });
    for (const op of state.operations.filter(
      (op) =>
        input.action !== "priority" &&
        op.objectiveId === input.objectiveId &&
        op.status === "running",
    )) {
      await this.ports.cancel?.(scope, op);
    }
    return state;
  }
  /** One bounded scheduling pass. Hosts call repeatedly from an always-on worker. */
  async runOnce(scope: RoomPlannerScope, signal?: AbortSignal) {
    await this.ports.authorize(scope, "advance");
    let state = await this.get(scope);
    this.assertBudgetBinding(state);
    // Recovery never silently repeats an ambiguous model/tool call.
    for (const op of state.operations.filter(
      (op) =>
        op.status === "uncertain" ||
        (op.status === "running" && op.expiresAt <= this.now()),
    )) {
      const recovered = await this.ports.reconcile?.(scope, op);
      if (recovered) await this.settle(scope, op.id, recovered);
      else {
        if (op.sharedBudget || op.sharedBudgetPending)
          await this.ports.sharedBudget!.uncertain(scope, op);
        // Retain uncertainty without appending a full-state history revision on
        // every recovery poll. Reconciliation still runs on subsequent ticks.
        if (op.status === "running")
          await this.change(scope, (s) => {
            const current = s.operations.find((x) => x.id === op.id)!;
            if (current.status === "running") current.status = "uncertain";
          });
      }
    }
    state = await this.get(scope);
    // Persist terminal permission/expiry stops, rather than throwing on every worker tick.
    for (const item of state.initiatives ?? []) {
      if (
        item.status !== "selected" ||
        state.mode !== "execute" ||
        item.stopReason ||
        state.objectives.some(
          (objective) =>
            objective.initiativeId === item.id &&
            ["completed", "paused"].includes(objective.status),
        )
      )
        continue;
      try {
        await this.assertInitiative(scope, item, "call");
      } catch (error) {
        await this.change(scope, (current) =>
          this.stopInitiative(
            current,
            item.id,
            error instanceof Error
              ? error.message
              : "Initiative no longer authorized",
          ),
        );
      }
    }
    state = await this.get(scope);
    for (const note of state.notifications.filter((n) => !n.delivered)) {
      if (note.initiativeId) {
        try {
          await this.assertInitiative(
            scope,
            this.initiative(await this.get(scope), note.initiativeId),
            "publish",
          );
        } catch (error) {
          await this.change(scope, (current) => {
            const stored = current.notifications.find((n) => n.id === note.id)!;
            stored.delivered = true;
            stored.suppressedReason =
              error instanceof Error
                ? error.message
                : "Initiative publication denied";
          });
          continue;
        }
      }
      await this.ports.authorize(scope, "deliver");
      await this.ports.deliver(scope, note);
      await this.change(scope, (s) => {
        s.notifications.find((n) => n.id === note.id)!.delivered = true;
      });
    }
    if (state.mode === "drain" || signal?.aborted) return this.get(scope);
    const pending = state.events.find((event) => {
      if (state.handledEventIds?.includes(event.id)) return false;
      if (event.initiativeId && state.mode !== "execute") return false;
      if (
        event.initiativeId &&
        state.objectives.some(
          (objective) =>
            objective.initiativeId === event.initiativeId &&
            objective.status === "paused",
        )
      )
        return false;
      if (event.targetParticipantIds?.length)
        return event.targetParticipantIds.some(
          (id) =>
            !state.operations.some(
              (operation) =>
                operation.id ===
                `direct:${encodeURIComponent(event.id)}:${encodeURIComponent(id)}`,
            ),
        );
      const previous = state.operations.filter(
        (operation) => operation.eventId === event.id,
      );
      if (!previous.length) return true;
      const attempts = previous.filter(
        (operation) => operation.kind === "reason",
      );
      const last = attempts.at(-1);
      return (
        !!last &&
        last.status === "rejected" &&
        last.retryablePlan === true &&
        attempts.length < 3
      );
    });
    // Serialize decision generation per Room, including reservations after a crashed reasoner.
    if (
      pending &&
      pending.kind !== "message" &&
      pending.objectiveId &&
      state.objectives.some(
        (o) =>
          o.id === pending.objectiveId &&
          ["completed", "canceled"].includes(o.status),
      )
    ) {
      await this.change(scope, (current) => {
        if (!current.handledEventIds?.includes(pending.id))
          (current.handledEventIds ??= []).push(pending.id);
      });
    } else if (pending) {
      const targets = await this.ports.route(scope, structuredClone(pending));
      if (
        !Array.isArray(targets) ||
        targets.length > 16 ||
        new Set(targets).size !== targets.length
      )
        fail("Invalid direct route");
      targets.forEach(text);
      if (targets.length && pending.kind !== "message")
        fail("External and specialist events cannot use direct routing");
      for (const id of targets) await this.ports.authorize(scope, "direct", id);
      if (targets.length && state.mode === "observe") {
        await this.change(scope, (s) => {
          for (const participantId of targets) {
            const id = `direct:${encodeURIComponent(pending!.id)}:${encodeURIComponent(participantId)}`;
            if (s.operations.some((op) => op.id === id)) continue;
            s.operations.push({
              id,
              kind: "direct",
              status: "completed",
              admissionMode: "observe",
              eventId: pending!.id,
              participantId,
              ...responseConversation(pending),
              reservedMicros: 0,
              usage: { costMicros: 0, inputTokens: 0, outputTokens: 0 },
              startedAt: this.now(),
              expiresAt: this.now(),
            });
            s.decisions.push({
              id,
              eventId: pending!.id,
              proposal: {
                kind: "respond",
                content: "Explicit reference preserved",
              },
              disposition: "observed",
            });
          }
        });
      } else if (targets.length) {
        // Explicit references bypass planning. Each selected agent retains its identity.
        await Promise.all(
          targets.map(async (participantId) => {
            const task: RoomPlannerTask = {
              id: `direct:${encodeURIComponent(pending.id)}:${encodeURIComponent(participantId)}`,
              participantId,
              instruction: pending.content,
              expectedOutput: "Answer the user directly",
              dependencies: [],
              actionLevel: "draft",
              ...responseConversation(pending),
            };
            await this.call(
              scope,
              {
                id: task.id,
                kind: "direct",
                eventId: pending.id,
                participantId,
                ...responseConversation(pending),
              },
              signal,
              (call) => this.ports.execute(scope, task, undefined, call),
            );
          }),
        );
      } else if (
        !state.operations.some(
          (op) =>
            op.kind === "reason" &&
            ["running", "uncertain"].includes(op.status),
        )
      ) {
        if (pending.initiativeId)
          await this.assertInitiative(
            scope,
            this.initiative(state, pending.initiativeId),
            "call",
          );
        const context = await this.ports.context(scope, pending);
        const reasonObjectives = pending.initiativeId
          ? state.objectives.filter(
              (objective) => objective.initiativeId === pending.initiativeId,
            )
          : state.objectives;
        await this.call(
          scope,
          {
            id: `reason:${encodeURIComponent(pending.id)}:attempt:${state.operations.filter((op) => op.kind === "reason" && op.eventId === pending.id).length + 1}`,
            kind: "reason",
            ...(pending.initiativeId
              ? { initiativeId: pending.initiativeId }
              : {}),
            eventId: pending.id,
            ...responseConversation(pending),
            objectiveBindings: reasonObjectives.map((o) => ({
              objectiveId: o.id,
              revision: o.revision,
              controlRevision: o.controlRevision,
              planId: o.activePlanId,
            })),
          },
          signal,
          (call) =>
            (pending.initiativeId
              ? this.ports.initiatives!.propose.bind(this.ports.initiatives!)
              : this.ports.reasoner.propose.bind(this.ports.reasoner))(
              {
                scope,
                event: pending!,
                objectives: reasonObjectives,
                authorizedContext: context,
                reviews: state.operations
                  .filter(
                    (operation) =>
                      operation.kind === "review" &&
                      (!pending.initiativeId ||
                        operation.initiativeId === pending.initiativeId) &&
                      operation.status === "completed" &&
                      operation.review,
                  )
                  .slice(-8)
                  .map((operation) => ({
                    objectiveId: operation.objectiveId!,
                    planId: operation.planId!,
                    review: operation.review!,
                  })),
                progress: reasonObjectives.flatMap((o) =>
                  o.plans
                    .find((p) => p.id === o.activePlanId)!
                    .tasks.map((task) => {
                      const operation = this.taskOperation(
                        state,
                        o.id,
                        task.id,
                      );
                      return {
                        objectiveId: o.id,
                        planId: o.activePlanId,
                        taskId: task.id,
                        status: operation?.status ?? "pending",
                        resultKind: operation?.result?.kind,
                        evidence: operation?.result?.evidence,
                        error: operation?.error,
                      };
                    }),
                ),
                feedback: state.operations
                  .filter(
                    (op) =>
                      op.kind === "reason" &&
                      op.eventId === pending.id &&
                      op.status === "rejected" &&
                      op.error,
                  )
                  .slice(-2)
                  .map((op) => ({ proposal: op.proposal, reason: op.error! })),
              },
              call,
            ),
        );
      }
    }
    state = await this.get(scope);
    if (state.mode !== "execute" || signal?.aborted) return state;
    const objectives = state.objectives
      .filter((o) => o.status === "active")
      .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
    // Rotate equal-priority objectives while retaining the user's explicit priorities.
    const last = objectives.findIndex(
      (o) => o.id === state.lastScheduledObjectiveId,
    );
    if (
      last >= 0 &&
      objectives.every((o) => o.priority === objectives[0].priority)
    )
      objectives.push(...objectives.splice(0, last + 1));
    const jobs: Promise<void>[] = [];
    for (const o of objectives) {
      if (
        state.operations.some(
          (op) =>
            op.objectiveId === o.id &&
            ["running", "uncertain"].includes(op.status),
        )
      )
        continue;
      const plan = o.plans.find((p) => p.id === o.activePlanId)!;
      const tasks = plan.tasks;
      const results = tasks.map((t) => this.taskOperation(state, o.id, t.id));
      if (
        tasks.length &&
        results.every(
          (op) => op?.status === "completed" && op.result?.kind === "result",
        )
      ) {
        if (
          state.operations.some(
            (operation) =>
              operation.kind === "review" &&
              operation.objectiveId === o.id &&
              operation.planId === plan.id &&
              operation.controlRevision === o.controlRevision,
          )
        )
          continue;
        const reviewId = `review:${encodeURIComponent(o.id)}:${encodeURIComponent(plan.id)}:${o.revision}`;
        if (!state.operations.some((op) => op.id === reviewId))
          jobs.push(
            this.call(
              scope,
              {
                id: reviewId,
                kind: "review",
                ...(o.initiativeId ? { initiativeId: o.initiativeId } : {}),
                objectiveId: o.id,
                planId: plan.id,
                controlRevision: o.controlRevision,
                objectiveRevision: o.revision,
                ...conversationReference(o),
              },
              signal,
              (call) =>
                (o.initiativeId
                  ? this.ports.initiatives!.verify.bind(this.ports.initiatives!)
                  : this.ports.verify.bind(this.ports))(
                  scope,
                  o,
                  results as RoomPlannerOperation[],
                  call,
                ),
            ),
          );
      } else {
        for (const task of tasks) {
          if (this.taskOperation(state, o.id, task.id)) continue;
          if (
            !task.dependencies.every((id) => {
              const op = this.taskOperation(state, o.id, id);
              return op?.status === "completed" && op.result?.kind === "result";
            })
          )
            continue;
          jobs.push(
            this.call(
              scope,
              {
                id: `task:${encodeURIComponent(o.id)}:${encodeURIComponent(task.id)}`,
                kind: "task",
                ...(o.initiativeId ? { initiativeId: o.initiativeId } : {}),
                objectiveId: o.id,
                planId: plan.id,
                taskId: task.id,
                participantId: task.participantId,
                controlRevision: o.controlRevision,
                objectiveRevision: o.revision,
                ...conversationReference(task),
              },
              signal,
              async (call) => {
                if (!o.initiativeId)
                  await this.ports.materialize?.(
                    scope,
                    o,
                    plan,
                    tasks.map((t) => ({
                      stepId: t.id,
                      kind: "agent_task",
                      participantId: t.participantId,
                      instruction: t.instruction,
                      expectedOutput: t.expectedOutput,
                      expectedArtifactKind: "report",
                      dependencies: t.dependencies,
                      actionLevel: t.actionLevel,
                      ...conversationReference(t),
                    })),
                  );
                return o.initiativeId
                  ? this.ports.initiatives!.execute(scope, task, o, call)
                  : this.ports.execute(scope, task, o, call);
              },
            ),
          );
          // One task per objective per pass gives other objectives access to the shared slots.
          break;
        }
      }
    }
    await Promise.all(jobs);
    return this.get(scope);
  }
  private taskOperation(
    state: RoomPlannerState,
    objectiveId: string,
    taskId: string,
  ) {
    return state.operations.find(
      (op) =>
        op.kind === "task" &&
        op.objectiveId === objectiveId &&
        op.taskId === taskId,
    );
  }
  private async call(
    scope: RoomPlannerScope,
    input: Omit<
      RoomPlannerOperation,
      "status" | "reservedMicros" | "startedAt" | "expiresAt"
    >,
    signal: AbortSignal | undefined,
    invoke: (call: RoomPlannerCall) => Promise<{
      usage: RoomPlannerUsage;
      result?: RoomPlannerOperation["result"];
      proposal?: RoomPlannerProposal;
      review?: RoomPlannerOperation["review"];
      error?: string;
      retryableReasoning?: boolean;
    }>,
  ) {
    this.assertBudgetBinding(await this.get(scope));
    let claimed = false;
    await this.change(
      scope,
      (s) => {
        if (s.operations.some((op) => op.id === input.id) || s.mode === "drain")
          return;
        if (s.mode === "observe" && input.kind !== "reason") return;
        if (input.initiativeId && s.mode !== "execute") return;
        if (
          s.operations.filter((op) =>
            ["running", "uncertain"].includes(op.status),
          ).length >= s.concurrency
        )
          return;
        if (
          input.kind === "reason" &&
          s.operations.some(
            (op) =>
              op.kind === "reason" &&
              ["running", "uncertain"].includes(op.status),
          )
        )
          return;
        if (input.objectiveId) {
          const o = this.objective(s, input.objectiveId);
          if (
            o.status !== "active" ||
            o.controlRevision !== input.controlRevision ||
            o.activePlanId !== input.planId
          )
            return;
        }
        const reserve = this.ports.reservationMicros[input.kind];
        if (input.initiativeId) {
          const item = this.initiative(s, input.initiativeId);
          const operations = s.operations.filter(
            (op) => op.initiativeId === item.id,
          );
          const ceiling = item.admission.scope;
          const committed = operations.reduce(
            (total, op) =>
              total +
              (op.usage?.costMicros ?? 0) +
              (["running", "uncertain"].includes(op.status)
                ? op.reservedMicros
                : 0),
            0,
          );
          let reason = item.stopReason;
          if (
            !reason &&
            (item.executionExpiresAt ?? ceiling.expiresAt) <= this.now()
          )
            reason = "expired";
          if (!reason && operations.length >= ceiling.maximumCalls)
            reason = "model_call_ceiling";
          if (!reason && committed + reserve > ceiling.maximumCostMicros)
            reason = "cost_ceiling";
          if (reason) {
            this.stopInitiative(s, item.id, reason);
            return;
          }
          // One investigation per Room, including another replica's ambiguous provider dispatch.
          if (
            s.operations.some(
              (op) =>
                op.initiativeId &&
                op.initiativeId !== item.id &&
                ["running", "uncertain"].includes(op.status),
            ) ||
            s.initiatives?.some(
              (other) =>
                other.id !== item.id &&
                other.startedAt &&
                !other.stopReason &&
                s.objectives.some(
                  (o) => o.initiativeId === other.id && o.status === "active",
                ),
            )
          )
            return;
        }
        if (roomPlannerBudget(s).availableMicros < reserve) {
          if (input.initiativeId) return;
          const id = `budget:${s.budgetLimitMicros}`;
          if (
            !s.operations.some((op) => op.status === "running") &&
            !s.notifications.some((n) => n.id === id)
          )
            s.notifications.push({
              id,
              content:
                "The shared Room budget is insufficient for another call. Work is saved; increase the total budget to continue.",
              delivered: false,
            });
          return;
        }
        s.operations.push({
          ...input,
          admissionMode: s.mode as "observe" | "execute",
          status: "running",
          reservedMicros: reserve,
          startedAt: this.now(),
          expiresAt: new Date(
            Date.parse(this.now()) + (this.ports.leaseMs ?? 300_000),
          ).toISOString(),
          ...(this.ports.sharedBudget ? { sharedBudgetPending: true } : {}),
        });
        if (input.objectiveId) s.lastScheduledObjectiveId = input.objectiveId;
        claimed = true;
      },
      () => {
        claimed = false;
      },
    );
    if (!claimed) return;
    try {
      if (this.ports.sharedBudget) {
        const local = (await this.get(scope)).operations.find(
          (op) => op.id === input.id,
        )!;
        const admitted = await this.ports.sharedBudget.admit(scope, local);
        if (!admitted.admitted) {
          await this.change(scope, (s) => {
            const op = s.operations.find((op) => op.id === input.id)!;
            if (op.status !== "running" || !op.sharedBudgetPending) return;
            if (admitted.reason === "already_admitted") {
              op.status = "uncertain";
              op.error = "Shared admission already exists; recover its result";
              if (admitted.reservation) op.sharedBudget = admitted.reservation;
            } else {
              // No shared admission exists and this invocation has not reached any effect.
              s.operations = s.operations.filter((op) => op.id !== input.id);
              s.sharedBudgetBlock = { reason: admitted.reason, at: this.now() };
            }
          });
          return;
        }
        await this.change(scope, (s) => {
          const op = s.operations.find((op) => op.id === input.id)!;
          if (op.status !== "running" || !op.sharedBudgetPending) conflict();
          op.sharedBudget = admitted.reservation;
          op.sharedBudgetPending = false;
          delete s.sharedBudgetBlock;
        });
      }
      if (input.initiativeId) {
        await this.change(scope, (current) => {
          const item = this.initiative(current, input.initiativeId!);
          if (!item.startedAt) {
            if (item.admission.scope.expiresAt <= this.now())
              fail("Initiative trigger expired before admission");
            item.startedAt = this.now();
            item.executionExpiresAt = new Date(
              Date.parse(item.startedAt) +
                item.admission.scope.maximumDurationMs,
            ).toISOString();
          }
        });
      }
      const initiative = input.initiativeId
        ? this.initiative(await this.get(scope), input.initiativeId)
        : undefined;
      const call: RoomPlannerCall = {
        operationId: input.id,
        ...(initiative
          ? {
              initiative: structuredClone(initiative.admission),
              assertRead: (tool: string, roomId: string) =>
                this.claimRead(scope, input.id, tool, roomId),
              assertModelCall: () => this.claimModel(scope, input.id),
            }
          : {}),
        ...conversationReference(input),
        signal,
        assertCurrent: async () => {
          if (signal?.aborted) throw new Error("Planner interrupted");
          await this.assertCurrent(scope, input.id);
        },
      };
      await call.assertCurrent();
      await this.settle(scope, input.id, await invoke(call));
    } catch (error) {
      if (error instanceof RoomPlannerCallError) {
        await this.settle(scope, input.id, {
          usage: error.usage,
          error: error.message,
          retryableReasoning:
            input.kind === "reason" && error.retryableReasoning,
        });
        return;
      }
      const operation = (await this.get(scope)).operations.find(
        (op) => op.id === input.id,
      );
      if (
        operation &&
        (operation.sharedBudget || operation.sharedBudgetPending)
      )
        await this.ports.sharedBudget!.uncertain(scope, operation);
      await this.change(scope, (s) => {
        const op = s.operations.find((op) => op.id === input.id)!;
        if (op.status === "running") {
          op.status = "uncertain";
          op.error =
            error instanceof Error ? error.message : "Uncertain execution";
        }
      });
    }
  }
  private async settle(
    scope: RoomPlannerScope,
    id: string,
    output: {
      usage: RoomPlannerUsage;
      result?: RoomPlannerOperation["result"];
      proposal?: RoomPlannerProposal;
      review?: RoomPlannerOperation["review"];
      error?: string;
      retryableReasoning?: boolean;
    },
  ) {
    for (const key of ["costMicros", "inputTokens", "outputTokens"] as const)
      integer(output.usage?.[key]);
    const operation = (await this.get(scope)).operations.find(
      (op) => op.id === id,
    )!;
    if (operation.sharedBudget || operation.sharedBudgetPending) {
      this.assertBudgetBinding(await this.get(scope));
      await this.ports.sharedBudget!.settle(scope, operation, output.usage);
    }
    let admissionError: string | undefined;
    if (operation.initiativeId) {
      try {
        await this.assertInitiative(
          scope,
          this.initiative(await this.get(scope), operation.initiativeId),
          "publish",
        );
      } catch (error) {
        admissionError =
          error instanceof Error ? error.message : "Initiative result is stale";
      }
    }
    let retryablePlan = output.retryableReasoning === true;
    if (output.proposal?.kind === "plan") {
      try {
        for (const task of output.proposal.tasks)
          await this.ports.authorize(scope, "assign", task.participantId);
        const admitted = await this.ports.admitPlan?.(scope, output.proposal);
        if (admitted && !admitted.allowed) {
          admissionError = admitted.reason;
          retryablePlan = admitted.retryable;
        }
      } catch (error) {
        admissionError =
          error instanceof Error ? error.message : "Assignment denied";
      }
    }
    if (output.review) {
      try {
        await this.ports.authorize(
          scope,
          "review",
          output.review.reviewerParticipantId,
        );
      } catch (error) {
        admissionError =
          error instanceof Error ? error.message : "Review authority denied";
      }
    }
    await this.change(scope, (s) => {
      const previousNotes = new Set(s.notifications.map((note) => note.id));
      const op = s.operations.find((op) => op.id === id)!;
      if (op.status === "completed" || op.status === "rejected") return;
      op.usage = output.usage;
      op.status = "completed";
      op.result = output.result;
      op.review = output.review;
      op.proposal = output.proposal;
      op.retryablePlan = retryablePlan;
      try {
        if (output.usage.costMicros > op.reservedMicros) {
          s.mode = "drain";
          fail(
            "Usage exceeded the reserved upper bound; new admissions stopped",
          );
        }
        if (output.error) fail(output.error);
        if (admissionError) fail(admissionError);
        if (op.kind === "task" || op.kind === "direct") {
          const result = output.result;
          if (
            !result ||
            !["result", "blocked", "proposal", "challenge"].includes(
              result.kind,
            ) ||
            !Array.isArray(result.evidence)
          )
            fail("Missing or invalid specialist result");
          text(result.content);
          if (result.evidence.length > 32) fail("Too many evidence references");
          for (const e of result.evidence) {
            text(e.reference);
            text(e.version);
            if (!Array.isArray(e.sourceIds) || e.sourceIds.length > 64)
              fail("Invalid evidence sources");
            e.sourceIds.forEach(text);
          }
        }
        if (s.mode !== op.admissionMode)
          fail("Planner mode changed after admission");
        if (op.kind === "reason") {
          if (!output.proposal) fail("Missing proposal");
          const draft = structuredClone(s);
          this.apply(draft, op, output.proposal);
          Object.assign(s, draft);
        } else if (op.objectiveId) {
          const o = this.objective(s, op.objectiveId);
          if (
            o.controlRevision !== op.controlRevision ||
            o.activePlanId !== op.planId ||
            o.status !== "active"
          ) {
            op.status = "rejected";
            op.error = "Late result requires explicit readmission";
            return;
          }
          if (op.kind === "review") {
            const review = output.review;
            const tasks = o.plans.find((p) => p.id === o.activePlanId)!.tasks;
            if (
              !review ||
              tasks.some(
                (t) => t.participantId === review.reviewerParticipantId,
              )
            )
              fail("Review must be performed by another specialist");
            if (
              !review.evidence.sourceIds.length ||
              !review.evidence.reference ||
              !review.evidence.version
            )
              fail("Review requires versioned source evidence");
            const evidence = tasks.flatMap(
              (t) => this.taskOperation(s, o.id, t.id)?.result?.evidence ?? [],
            );
            if (!evidence.some((e) => same(e, review.evidence)))
              fail(
                "Review must bind an exact current result version and its sources",
              );
            if (
              review.criteria.length !== o.criteria.length ||
              o.criteria.some(
                (c) =>
                  review.criteria.filter((r) => r.criterionId === c.id)
                    .length !== 1,
              )
            )
              fail("Review must cover every criterion exactly once");
            if (
              review.criteria.some(
                (r) => !["met", "unmet", "unknown"].includes(r.verdict),
              )
            )
              fail("Invalid review verdict");
            const passed = review.criteria.every((r) => r.verdict === "met");
            const uncertain = review.criteria.some(
              (r) => r.verdict === "unknown",
            );
            o.reviewFailures = passed ? 0 : (o.reviewFailures ?? 0) + 1;
            const canRepair = !passed && !uncertain && o.reviewFailures < 3;
            o.status = passed ? "completed" : canRepair ? "active" : "waiting";
            o.revision++;
            if (canRepair)
              s.events.push({
                id: `review-result:${id}`,
                ...conversationReference(op),
                kind: "result",
                ...(op.initiativeId ? { initiativeId: op.initiativeId } : {}),
                actorId: review.reviewerParticipantId,
                objectiveId: o.id,
                review,
                content: JSON.stringify({
                  kind: "review_unmet",
                  requiredAction:
                    "Correct the output with fresh work and a new report version, preserving owner requirements",
                  review,
                }),
                references: [review.evidence.reference],
              });
            if (!canRepair)
              s.notifications.push({
                id: `notice:${id}`,
                objectiveId: o.id,
                content:
                  o.status === "completed"
                    ? `Completed: ${o.title}`
                    : `Review needs attention: ${o.title}`,
                delivered: false,
                ...conversationReference(o),
              });
          } else if (
            output.result?.kind === "result" &&
            output.result.evidence.length > 0
          ) {
            o.noProgressCycles = 0;
          } else {
            o.noProgressCycles++;
            if (o.noProgressCycles >= 3) o.status = "waiting";
          }
          if (output.result)
            s.events.push({
              id: `result:${id}`,
              ...conversationReference(op),
              kind: "result",
              ...(op.initiativeId ? { initiativeId: op.initiativeId } : {}),
              actorId: op.participantId ?? "specialist",
              objectiveId: o.id,
              content: JSON.stringify(output.result),
              references: output.result.evidence.map((e) => e.reference),
            });
        } else if (output.result)
          s.notifications.push({
            id: `notice:${id}`,
            ...conversationReference(op),
            content: output.result.content,
            participantId: op.participantId,
            delivered: false,
          });
      } catch (error) {
        op.status = "rejected";
        op.error = error instanceof Error ? error.message : "Invalid output";
        if (
          op.kind === "reason" &&
          error instanceof AgentPlatError &&
          (error.details as { plannerRepair?: string })?.plannerRepair ===
            "fresh_task_identity"
        )
          op.retryablePlan = true;
        if (output.proposal)
          s.decisions.push({
            id,
            eventId: op.eventId!,
            proposal: output.proposal,
            disposition: "rejected",
            reason: op.error,
          });
        if (op.objectiveId && op.kind === "review") {
          const objective = s.objectives.find((o) => o.id === op.objectiveId);
          if (objective?.status === "active") {
            objective.status = "waiting";
            objective.revision++;
          }
        }
        if (op.objectiveId && op.kind === "task") {
          const objective = s.objectives.find((o) => o.id === op.objectiveId);
          if (objective?.status === "active") {
            objective.noProgressCycles++;
            if (objective.noProgressCycles >= 3) objective.status = "waiting";
            s.events.push({
              id: `rejected:${id}`,
              ...conversationReference(op),
              kind: "result",
              ...(op.initiativeId ? { initiativeId: op.initiativeId } : {}),
              actorId: op.participantId ?? "specialist",
              objectiveId: op.objectiveId,
              content: `Work needs revision: ${op.error}`,
            });
          }
        }
        const attempts = s.operations.filter(
          (candidate) =>
            candidate.kind === "reason" && candidate.eventId === op.eventId,
        ).length;
        const sourceEvent = s.events.find((event) => event.id === op.eventId);
        if (attempts >= 3 && sourceEvent?.review && sourceEvent.objectiveId) {
          const objective = s.objectives.find(
            (o) => o.id === sourceEvent.objectiveId,
          );
          if (objective?.status === "active") {
            objective.status = "waiting";
            objective.revision++;
          }
        }
        if (!op.retryablePlan || attempts >= 3)
          s.notifications.push({
            id: `rejected:${id}`,
            ...conversationReference(op),
            content: `Planner needs attention: ${op.error}`,
            objectiveId: op.objectiveId,
            delivered: false,
          });
      } finally {
        if (op.initiativeId) {
          for (const note of s.notifications)
            if (!previousNotes.has(note.id))
              note.initiativeId = op.initiativeId;
        }
      }
    });
  }
  private apply(
    s: RoomPlannerState,
    op: RoomPlannerOperation,
    proposal: RoomPlannerProposal,
  ) {
    validateRoomPlannerProposal(proposal);
    const event = s.events.find((e) => e.id === op.eventId)!;
    proposal = structuredClone(proposal);
    const target = proposal.objectiveId
      ? s.objectives.find((o) => o.id === proposal.objectiveId)
      : undefined;
    if (target?.initiativeId && target.initiativeId !== op.initiativeId)
      fail(
        "An initiative objective cannot become an unrestricted owner objective",
      );
    if (op.initiativeId) {
      this.initiative(s, op.initiativeId);
      if (
        proposal.objectiveId &&
        proposal.objectiveId !== `initiative:${op.initiativeId}`
      )
        fail("Initiative cannot create or redirect another objective");
      if (
        proposal.kind === "plan" &&
        proposal.tasks.some((task) => task.actionLevel !== "read")
      )
        fail("Initiative tasks are restricted to authorized reads");
    }
    if (proposal.kind === "plan") {
      const prior = s.objectives.find((o) => o.id === proposal.objectiveId);
      if (prior && prior.threadId !== op.threadId)
        fail("An objective cannot be redirected into another conversation");
      proposal.tasks = proposal.tasks.map((task) => {
        const old = prior?.plans
          .flatMap((plan) => plan.tasks)
          .find((t) => t.id === task.id);
        // Conversation bindings are host-owned. The model cannot widen or redirect a task.
        const {
          threadId: ignoredThread,
          replyToMessageId: ignoredReply,
          ...definition
        } = task;
        void ignoredThread;
        void ignoredReply;
        return { ...definition, ...conversationReference(old ?? op) };
      });
    }
    if (s.mode === "observe") {
      s.decisions.push({
        id: op.id,
        eventId: event.id,
        proposal,
        disposition: "observed",
      });
      return;
    }
    const targetObjectiveId =
      proposal.objectiveId ?? (event.review ? event.objectiveId : undefined);
    if (targetObjectiveId) {
      const current = s.objectives.find((o) => o.id === targetObjectiveId);
      if (current) {
        if (current.threadId !== op.threadId)
          fail("An objective cannot be controlled from another conversation");
        const binding = op.objectiveBindings?.find(
          (b) => b.objectiveId === current.id,
        );
        if (
          !binding ||
          binding.revision !== current.revision ||
          binding.controlRevision !== current.controlRevision ||
          binding.planId !== current.activePlanId
        ) {
          if (
            event.kind === "message" &&
            proposal.kind === "plan" &&
            binding &&
            binding.controlRevision === current.controlRevision
          )
            repairable(
              "The objective progressed while interpreting this owner request. Re-read its current revision and preserve the owner correction.",
            );
          fail("Reasoning used a stale objective or control revision");
        }
      }
    }
    if (
      event.review?.criteria.some((c) => c.verdict === "unmet") &&
      !["plan", "wait", "clarify"].includes(proposal.kind)
    )
      repairable(
        "The current review rejected the output. Create corrective work with a new artifact version, or wait/clarify only when real information is missing",
      );
    if (proposal.kind === "plan") {
      let o = s.objectives.find((o) => o.id === proposal.objectiveId);
      if ((o?.revision ?? null) !== proposal.expectedObjectiveRevision)
        conflict();
      if (
        o &&
        (o.status === "canceled" ||
          (o.status === "completed" && event.kind !== "message") ||
          o.status === "paused")
      )
        fail("Objective cannot be replanned in this state");
      if (
        event.kind !== "message" &&
        (!o || event.objectiveId !== o.id) &&
        !(
          op.initiativeId &&
          event.initiativeId === op.initiativeId &&
          proposal.objectiveId === `initiative:${op.initiativeId}`
        )
      )
        fail(
          "Specialist and internal events cannot create or redirect user objectives",
        );
      if (!o) {
        o = {
          id: proposal.objectiveId,
          ...(op.initiativeId ? { initiativeId: op.initiativeId } : {}),
          ...conversationReference(op),
          revision: 0,
          controlRevision: 0,
          originalRequest: event.content,
          title: proposal.title,
          criteria: proposal.criteria,
          constraints: proposal.constraints,
          priority: 0,
          status: "active",
          plans: [],
          activePlanId: "",
          corrections: [],
          noProgressCycles: 0,
        };
        s.objectives.push(o);
      } else {
        const failedReview = [...s.operations]
          .reverse()
          .find(
            (operation) =>
              operation.kind === "review" &&
              operation.objectiveId === o!.id &&
              operation.status === "completed" &&
              operation.review?.criteria.some((c) => c.verdict === "unmet"),
          );
        if (
          event.kind !== "message" &&
          failedReview &&
          proposal.tasks.every(
            (task) => !!this.taskOperation(s, o!.id, task.id),
          )
        )
          repairable(
            "Corrective replanning must add fresh production work and a new report version; repeating verification of unchanged work is not progress",
          );
        for (const task of proposal.tasks) {
          const old = o.plans
            .flatMap((p) => p.tasks)
            .find((t) => t.id === task.id);
          if (old && !same(old, task))
            repairable(
              "Changed work requires a new logical task identity; retain the objective and assign fresh IDs to the changed tasks",
            );
          const prior = this.taskOperation(s, o.id, task.id);
          if (
            prior &&
            (prior.status !== "completed" || prior.result?.kind !== "result")
          )
            fail(
              "Unresolved work requires reconciliation and a fresh task identity",
            );
        }
        o.revision++;
        Object.assign(o, conversationReference(op));
        o.controlRevision++;
        if (event.kind === "message")
          o.corrections.push({ eventId: event.id, instruction: event.content });
        if (event.kind === "message") {
          o.noProgressCycles = 0;
          o.reviewFailures = 0;
        } else o.noProgressCycles++;
      }
      const predecessorId = o.activePlanId || undefined;
      const plan = {
        id: `${o.id}:v${o.plans.length + 1}`,
        version: o.plans.length + 1,
        predecessorId,
        tasks: structuredClone(proposal.tasks),
        sourceEventId: event.id,
        ...conversationReference(op),
      };
      o.plans.push(plan);
      o.activePlanId = plan.id;
      o.title = proposal.title;
      o.criteria = proposal.criteria;
      o.constraints = proposal.constraints;
      o.status =
        o.noProgressCycles >= 3 || (o.reviewFailures ?? 0) >= 3
          ? "waiting"
          : "active";
    } else if (proposal.kind === "complete") {
      const o = this.objective(s, proposal.objectiveId);
      if (
        o.revision !== proposal.expectedObjectiveRevision ||
        o.status !== "completed"
      )
        fail("Completion requires a successful current review");
    } else if (
      proposal.kind === "clarify" &&
      event.review &&
      targetObjectiveId
    ) {
      const o = this.objective(s, targetObjectiveId);
      if (o.status === "active") {
        o.status = "waiting";
        o.revision++;
      }
    } else if (proposal.kind === "wait" && proposal.objectiveId) {
      const o = this.objective(s, proposal.objectiveId);
      if (o.status === "active") {
        const plan = o.plans.find((p) => p.id === o.activePlanId)!;
        const success = (id: string) => {
          const operation = this.taskOperation(s, o.id, id);
          return (
            operation?.status === "completed" &&
            operation.result?.kind === "result"
          );
        };
        const hasReadyTask = plan.tasks.some(
          (task) =>
            !this.taskOperation(s, o.id, task.id) &&
            task.dependencies.every(success),
        );
        const hasReview = s.operations.some(
          (operation) =>
            operation.kind === "review" &&
            operation.objectiveId === o.id &&
            operation.planId === o.activePlanId,
        );
        const readyForReview =
          !hasReview && plan.tasks.every((task) => success(task.id));
        if (event.kind !== "message" && (hasReadyTask || readyForReview)) {
          // An internal acknowledgement cannot stall work already admitted by the engine.
          s.decisions.push({
            id: op.id,
            eventId: event.id,
            proposal,
            disposition: "applied",
            reason:
              "Ready execution or verification continues under the existing authorization",
          });
          return;
        }
        o.status = "waiting";
        o.revision++;
      }
    }
    s.decisions.push({
      id: op.id,
      eventId: event.id,
      proposal,
      disposition: "applied",
    });
    if (proposal.content)
      s.notifications.push({
        id: `notice:${op.id}`,
        ...conversationReference(op),
        content: proposal.content,
        objectiveId: proposal.objectiveId,
        delivered: false,
      });
  }
  private objective(state: RoomPlannerState, id: string) {
    const o = state.objectives.find((o) => o.id === id);
    if (!o) fail("Objective not found");
    return o;
  }
  private assertBudgetBinding(state: RoomPlannerState) {
    if (state.sharedBudgetBinding !== this.ports.sharedBudget?.bindingId)
      fail(
        "Shared budget configuration is missing or changed; configure the Planner before execution",
      );
  }
  private async change(
    scope: RoomPlannerScope,
    mutate: (state: RoomPlannerState) => void,
    retry?: () => void,
  ) {
    for (let attempt = 0; attempt < 16; attempt++) {
      retry?.();
      const state = await this.ports.store.load(scope);
      if (!state)
        throw new AgentPlatError("NOT_FOUND", "Planner not configured");
      const revision = state.revision;
      mutate(state);
      state.revision++;
      if (await this.ports.store.compareAndSet(revision, state)) return state;
    }
    conflict();
  }
}
export function createAgentRoomPlanner(ports: RoomPlannerPorts) {
  return new AgentRoomPlanner(ports);
}

/** Validate model data before any authoritative projection. */
export function validateRoomPlannerProposal(
  value: unknown,
): asserts value is RoomPlannerProposal {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("Invalid proposal");
  const p = value as RoomPlannerProposal;
  text(p.content);
  const keys =
    p.kind === "plan"
      ? [
          "kind",
          "objectiveId",
          "expectedObjectiveRevision",
          "title",
          "criteria",
          "constraints",
          "tasks",
          "content",
        ]
      : p.kind === "complete"
        ? ["kind", "objectiveId", "expectedObjectiveRevision", "content"]
        : ["kind", "content", "objectiveId"];
  if (Object.keys(value).some((key) => !keys.includes(key)))
    fail("Unknown proposal fields");
  if (p.objectiveId !== undefined) text(p.objectiveId);
  if (
    !["respond", "clarify", "wait", "suggest", "plan", "complete"].includes(
      p.kind,
    )
  )
    fail("Invalid proposal kind");
  if (p.kind === "complete") {
    text(p.objectiveId);
    integer(p.expectedObjectiveRevision);
  }
  if (p.kind !== "plan") return;
  text(p.objectiveId);
  text(p.title);
  if (p.expectedObjectiveRevision !== null)
    integer(p.expectedObjectiveRevision);
  if (
    !Array.isArray(p.criteria) ||
    !p.criteria.length ||
    p.criteria.length > 32
  )
    fail("Expected bounded success criteria");
  const criteria = new Set<string>();
  for (const c of p.criteria) {
    text(c.id);
    text(c.description);
    if (criteria.has(c.id)) fail("Duplicate criterion");
    criteria.add(c.id);
  }
  if (!Array.isArray(p.constraints) || p.constraints.length > 32)
    fail("Invalid constraints");
  p.constraints.forEach(text);
  if (!Array.isArray(p.tasks) || !p.tasks.length || p.tasks.length > 32)
    fail("Expected bounded tasks");
  const ids = new Set<string>();
  for (const t of p.tasks) {
    text(t.id);
    text(t.participantId);
    text(t.instruction);
    text(t.expectedOutput);
    if (
      ids.has(t.id) ||
      !["read", "draft"].includes(t.actionLevel) ||
      !Array.isArray(t.dependencies) ||
      !t.dependencies.every((id) => ids.has(id))
    )
      fail("Invalid task graph");
    ids.add(t.id);
  }
}
