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
    if (old) {
      return this.change(scope, (state) => {
        const budget = roomPlannerBudget(state);
        if (
          input.budgetLimitMicros <
          budget.spentMicros + budget.reservedMicros
        )
          fail("Budget cannot discard committed usage or reservations");
        state.mode = input.mode;
        state.budgetLimitMicros = input.budgetLimitMicros;
        state.concurrency = concurrency;
      });
    }
    const state: RoomPlannerState = {
      ...scope,
      schemaVersion: 1,
      revision: 0,
      mode: input.mode,
      concurrency,
      budgetLimitMicros: input.budgetLimitMicros,
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
      const prior = state.events.find((e) => e.id === event.id);
      if (prior && !same(prior, event))
        fail("Event identity reused with different content");
      if (!prior) state.events.push(structuredClone(event));
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
    // Recovery never silently repeats an ambiguous model/tool call.
    for (const op of state.operations.filter(
      (op) =>
        op.status === "uncertain" ||
        (op.status === "running" && op.expiresAt <= this.now()),
    )) {
      const recovered = await this.ports.reconcile?.(scope, op);
      if (recovered) await this.settle(scope, op.id, recovered);
      else
        await this.change(scope, (s) => {
          const current = s.operations.find((x) => x.id === op.id)!;
          if (current.status === "running") current.status = "uncertain";
        });
    }
    state = await this.get(scope);
    for (const note of state.notifications.filter((n) => !n.delivered)) {
      await this.ports.authorize(scope, "deliver");
      await this.ports.deliver(scope, note);
      await this.change(scope, (s) => {
        s.notifications.find((n) => n.id === note.id)!.delivered = true;
      });
    }
    if (state.mode === "drain" || signal?.aborted) return this.get(scope);
    const pending = state.events.find((event) => {
      if (state.handledEventIds?.includes(event.id)) return false;
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
        const context = await this.ports.context(scope, pending);
        await this.call(
          scope,
          {
            id: `reason:${encodeURIComponent(pending.id)}:attempt:${state.operations.filter((op) => op.kind === "reason" && op.eventId === pending.id).length + 1}`,
            kind: "reason",
            eventId: pending.id,
            ...responseConversation(pending),
            objectiveBindings: state.objectives.map((o) => ({
              objectiveId: o.id,
              revision: o.revision,
              controlRevision: o.controlRevision,
              planId: o.activePlanId,
            })),
          },
          signal,
          (call) =>
            this.ports.reasoner.propose(
              {
                scope,
                event: pending!,
                objectives: state.objectives,
                authorizedContext: context,
                reviews: state.operations
                  .filter(
                    (operation) =>
                      operation.kind === "review" &&
                      operation.status === "completed" &&
                      operation.review,
                  )
                  .slice(-8)
                  .map((operation) => ({
                    objectiveId: operation.objectiveId!,
                    planId: operation.planId!,
                    review: operation.review!,
                  })),
                progress: state.objectives.flatMap((o) =>
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
                objectiveId: o.id,
                planId: plan.id,
                controlRevision: o.controlRevision,
                objectiveRevision: o.revision,
                ...conversationReference(o),
              },
              signal,
              (call) =>
                this.ports.verify(
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
                return this.ports.execute(scope, task, o, call);
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
    let claimed = false;
    await this.change(
      scope,
      (s) => {
        if (s.operations.some((op) => op.id === input.id) || s.mode === "drain")
          return;
        if (s.mode === "observe" && input.kind !== "reason") return;
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
        if (roomPlannerBudget(s).availableMicros < reserve) {
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
      const call: RoomPlannerCall = {
        operationId: input.id,
        ...conversationReference(input),
        signal,
        assertCurrent: async () => {
          if (signal?.aborted) throw new Error("Planner interrupted");
          await this.ports.authorize(scope, "execute", input.objectiveId);
          await this.assertConversation(scope, input);
          const current = await this.get(scope),
            op = current.operations.find((op) => op.id === input.id)!;
          if (
            current.mode !==
              (input.kind === "reason" ? current.mode : "execute") ||
            current.mode === "drain" ||
            op.status !== "running"
          )
            conflict();
          if (input.objectiveId) {
            const o = this.objective(current, input.objectiveId);
            if (
              o.status !== "active" ||
              o.controlRevision !== input.controlRevision ||
              o.activePlanId !== input.planId
            )
              conflict();
          }
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
    let admissionError: string | undefined;
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
      if (event.kind !== "message" && (!o || event.objectiveId !== o.id))
        fail(
          "Specialist and internal events cannot create or redirect user objectives",
        );
      if (!o) {
        o = {
          id: proposal.objectiveId,
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
