import { AgentPlatError } from "@agentplat/core";
import type { JsonObject } from "@agentplat/core";
import type { HumanContributionCoordinator } from "./human-contribution.js";
import type {
  AgentRoomHandoffCoordinator,
  ProposeRoomHandoffInput,
} from "./room-handoff.js";
import type { RoomService } from "./service.js";

/** One typed, dependency-aware step in an AgentPlat Agent Room plan. */
export type AgentRoomPlanStep =
  | {
      stepId: string;
      kind: "agent_task";
      participantId: string;
      instruction: string;
      expectedOutput: string;
      expectedArtifactKind: string;
      dependencies?: string[];
      actionLevel?: "read" | "draft" | "execute" | "external_write";
      toolIds?: string[];
    }
  | {
      stepId: string;
      kind: "human_contribution";
      requestedByParticipantId: string;
      assignedParticipantId?: string;
      instruction: string;
      expectedOutput: string;
      dependencies?: string[];
      blocking?: boolean;
    }
  | {
      stepId: string;
      kind: "approval";
      targetType: "room" | "task" | "artifact" | "action";
      targetStepId?: string;
      targetId?: string;
      action?: string;
      requestedBy?: string;
      dependencies?: string[];
    }
  | ({ stepId: string; kind: "handoff"; dependencies?: string[] } & Omit<
      ProposeRoomHandoffInput,
      "tenantId" | "roomId" | "handoffId"
    >);

/** Revisioned plan projection with materialized identities and step progress. */
export interface AgentRoomPlan {
  tenantId: string;
  roomId: string;
  planId: string;
  planVersion: number;
  predecessorPlanId?: string;
  replanTrigger?: { eventId: string; eventType: string };
  objective: string;
  steps: AgentRoomPlanStep[];
  status:
    | "draft"
    | "materializing"
    | "active"
    | "waiting_for_human"
    | "completed"
    | "failed";
  revision: number;
  materialized: Record<string, string>;
  stepStatuses: Record<
    string,
    "pending" | "active" | "waiting_for_human" | "completed" | "failed"
  >;
  createdAt: string;
  updatedAt: string;
}

/** Compare-and-set persistence and Room-scoped discovery for plans. */
export interface AgentRoomPlanStore {
  load(
    tenantId: string,
    roomId: string,
    planId: string,
  ): Promise<AgentRoomPlan | undefined>;
  list(tenantId: string, roomId: string): Promise<AgentRoomPlan[]>;
  compareAndSet(input: {
    expectedRevision: number | null;
    state: AgentRoomPlan;
  }): Promise<boolean>;
}

/** Test-oriented in-memory Agent Room plan store. */
export class InMemoryAgentRoomPlanStore implements AgentRoomPlanStore {
  private readonly states = new Map<string, AgentRoomPlan>();
  async load(tenantId: string, roomId: string, planId: string) {
    const state = this.states.get(`${tenantId}\u0000${roomId}\u0000${planId}`);
    return state ? structuredClone(state) : undefined;
  }
  async list(tenantId: string, roomId: string) {
    return [...this.states.values()]
      .filter((state) => state.tenantId === tenantId && state.roomId === roomId)
      .map((state) => structuredClone(state));
  }
  async compareAndSet(input: {
    expectedRevision: number | null;
    state: AgentRoomPlan;
  }) {
    const key = `${input.state.tenantId}\u0000${input.state.roomId}\u0000${input.state.planId}`;
    const current = this.states.get(key);
    if (input.expectedRevision === null) {
      if (current || input.state.revision !== 0) return false;
    } else if (
      !current ||
      current.revision !== input.expectedRevision ||
      input.state.revision !== input.expectedRevision + 1
    ) {
      return false;
    }
    this.states.set(key, structuredClone(input.state));
    return true;
  }
}

/**
 * Progressively materializes dependency-complete plan steps into governed Room
 * tasks, contributions, approvals and Handoffs.
 */
export class AgentRoomPlannerBridge {
  private readonly clock: () => Date;
  constructor(
    private readonly store: AgentRoomPlanStore,
    private readonly rooms: Pick<
      RoomService,
      "getRoomState" | "createTask" | "requestApproval"
    >,
    private readonly contributions: HumanContributionCoordinator,
    private readonly handoffs: AgentRoomHandoffCoordinator,
    options: { clock?: () => Date } = {},
  ) {
    this.clock = options.clock ?? (() => new Date());
  }

  async create(input: {
    tenantId: string;
    roomId: string;
    planId: string;
    planVersion?: number;
    predecessorPlanId?: string;
    replanTrigger?: { eventId: string; eventType: string };
    objective: string;
    steps: AgentRoomPlanStep[];
  }) {
    validateSteps(input.steps);
    if (input.predecessorPlanId) {
      const predecessor = await this.get({
        tenantId: input.tenantId,
        roomId: input.roomId,
        planId: input.predecessorPlanId,
      });
      if ((input.planVersion ?? 1) !== predecessor.planVersion + 1) {
        throw new AgentPlatError(
          "CONFLICT",
          "Replan version does not extend its predecessor",
        );
      }
    }
    const now = this.clock().toISOString();
    const state: AgentRoomPlan = {
      ...input,
      planVersion: input.planVersion ?? 1,
      status: "draft",
      revision: 0,
      materialized: {},
      stepStatuses: Object.fromEntries(
        input.steps.map((step) => [step.stepId, "pending" as const]),
      ),
      createdAt: now,
      updatedAt: now,
    };
    if (!(await this.store.compareAndSet({ expectedRevision: null, state }))) {
      const existing = await this.get(input);
      if (JSON.stringify(existing.steps) === JSON.stringify(state.steps))
        return existing;
      throw new AgentPlatError("CONFLICT", "Agent Room plan already exists");
    }
    return structuredClone(state);
  }

  async materialize(input: {
    tenantId: string;
    roomId: string;
    planId: string;
    expectedRevision: number;
  }) {
    let current = await this.get(input);
    if (current.revision !== input.expectedRevision) conflict();
    if (current.status === "completed" || current.status === "failed")
      return current;
    current = await this.save(current, "materializing");
    const room = await this.rooms.getRoomState(input.tenantId, input.roomId);
    const materialized = { ...current.materialized };
    for (const step of current.steps) {
      if (materialized[step.stepId]) continue;
      if (
        !(step.dependencies ?? []).every(
          (dependency) => current.stepStatuses[dependency] === "completed",
        )
      )
        continue;
      const id = `plan:${current.planId}:${step.stepId}`;
      if (step.kind === "agent_task") {
        const existing = room.tasks.find((task) => task.id === id);
        const task =
          existing ??
          (await this.rooms.createTask(input.tenantId, input.roomId, {
            id,
            stepId: id,
            assignedParticipantId: step.participantId,
            instruction: step.instruction,
            expectedOutput: step.expectedOutput,
            expectedArtifactKind: step.expectedArtifactKind,
            dependencies: (step.dependencies ?? [])
              .filter(
                (dependency) =>
                  current.steps.find(
                    (candidate) => candidate.stepId === dependency,
                  )?.kind === "agent_task",
              )
              .map((dependency) => materialized[dependency])
              .filter((value): value is string => Boolean(value)),
            actionLevel: step.actionLevel,
            toolIds: step.toolIds,
            metadata: { planId: current.planId, planStepId: step.stepId },
          }));
        materialized[step.stepId] = task.id;
      } else if (step.kind === "human_contribution") {
        const contribution = await this.contributions.request({
          tenantId: input.tenantId,
          roomId: input.roomId,
          contributionId: id,
          requestedByParticipantId: step.requestedByParticipantId,
          assignedParticipantId: step.assignedParticipantId,
          instruction: step.instruction,
          expectedOutput: step.expectedOutput,
          dependencies: (step.dependencies ?? [])
            .filter(
              (dependency) =>
                current.steps.find(
                  (candidate) => candidate.stepId === dependency,
                )?.kind === "human_contribution",
            )
            .map((dependency) => materialized[dependency])
            .filter((value): value is string => Boolean(value)),
          blocking: step.blocking,
        });
        materialized[step.stepId] = contribution.contributionId;
      } else if (step.kind === "approval") {
        const targetId =
          step.targetId ??
          (step.targetStepId ? materialized[step.targetStepId] : undefined);
        if (!targetId)
          throw new AgentPlatError(
            "VALIDATION_ERROR",
            "Approval plan step has no target",
          );
        const existing = room.approvals.find((approval) => approval.id === id);
        const approval =
          existing ??
          (await this.rooms.requestApproval(input.tenantId, input.roomId, {
            id,
            targetType: step.targetType,
            targetId,
            action: step.action,
            requestedBy: step.requestedBy,
          }));
        materialized[step.stepId] = approval.id;
      } else {
        const handoff = await this.handoffs.propose({
          ...step,
          tenantId: input.tenantId,
          roomId: input.roomId,
          handoffId: id,
        });
        materialized[step.stepId] = handoff.handoffId;
      }
      current = await this.save(current, "materializing", materialized);
    }
    const waiting = current.steps.some(
      (step) =>
        Boolean(materialized[step.stepId]) &&
        step.kind === "human_contribution" &&
        (step.blocking ?? true) &&
        current.stepStatuses[step.stepId] !== "completed",
    );
    return this.save(
      current,
      waiting ? "waiting_for_human" : "active",
      materialized,
    );
  }

  async replanFromEvent(input: {
    tenantId: string;
    roomId: string;
    planId: string;
    predecessorPlanId: string;
    triggerEventId: string;
    objective: string;
    steps: AgentRoomPlanStep[];
  }) {
    const predecessor = await this.get({
      tenantId: input.tenantId,
      roomId: input.roomId,
      planId: input.predecessorPlanId,
    });
    const room = await this.rooms.getRoomState(input.tenantId, input.roomId);
    const event = room.events.find(
      (candidate) => candidate.id === input.triggerEventId,
    );
    if (!event) {
      throw new AgentPlatError(
        "NOT_FOUND",
        "Replan trigger event was not found in the Room",
      );
    }
    return this.create({
      tenantId: input.tenantId,
      roomId: input.roomId,
      planId: input.planId,
      planVersion: predecessor.planVersion + 1,
      predecessorPlanId: predecessor.planId,
      replanTrigger: { eventId: event.id, eventType: event.type },
      objective: input.objective,
      steps: input.steps,
    });
  }

  async reconcileFromEvent(input: {
    tenantId: string;
    roomId: string;
    triggerEventId: string;
  }) {
    const room = await this.rooms.getRoomState(input.tenantId, input.roomId);
    if (!room.events.some((event) => event.id === input.triggerEventId)) {
      throw new AgentPlatError(
        "NOT_FOUND",
        "Plan progress trigger event was not found",
      );
    }
    const plans = await this.store.list(input.tenantId, input.roomId);
    const updated: AgentRoomPlan[] = [];
    for (const plan of plans.filter((candidate) =>
      ["active", "waiting_for_human", "materializing"].includes(
        candidate.status,
      ),
    )) {
      const stepStatuses = { ...plan.stepStatuses };
      for (const step of plan.steps) {
        const targetId = plan.materialized[step.stepId];
        if (!targetId) continue;
        if (step.kind === "agent_task") {
          const status = room.tasks.find(
            (task) => task.id === targetId,
          )?.status;
          stepStatuses[step.stepId] =
            status === "completed"
              ? "completed"
              : status === "failed" || status === "canceled"
                ? "failed"
                : "active";
        } else if (step.kind === "human_contribution") {
          const status = (
            await this.contributions.get({
              tenantId: input.tenantId,
              roomId: input.roomId,
              contributionId: targetId,
            })
          ).status;
          stepStatuses[step.stepId] =
            status === "completed"
              ? "completed"
              : status === "canceled" || status === "expired"
                ? "failed"
                : "waiting_for_human";
        } else if (step.kind === "approval") {
          const status = room.approvals.find(
            (approval) => approval.id === targetId,
          )?.status;
          stepStatuses[step.stepId] =
            status === "approved"
              ? "completed"
              : status === "rejected"
                ? "failed"
                : "waiting_for_human";
        } else {
          const status = (
            await this.handoffs.get({
              tenantId: input.tenantId,
              roomId: input.roomId,
              handoffId: targetId,
            })
          ).status;
          stepStatuses[step.stepId] =
            status === "completed"
              ? "completed"
              : status === "failed" || status === "rejected"
                ? "failed"
                : "active";
        }
      }
      const statuses = Object.values(stepStatuses);
      const status: AgentRoomPlan["status"] = statuses.includes("failed")
        ? "failed"
        : statuses.length === 0 ||
            statuses.every((value) => value === "completed")
          ? "completed"
          : statuses.includes("waiting_for_human")
            ? "waiting_for_human"
            : "active";
      const reconciled = await this.save(
        { ...plan, stepStatuses },
        status,
        plan.materialized,
      );
      const hasReadyStep = reconciled.steps.some(
        (step) =>
          !reconciled.materialized[step.stepId] &&
          (step.dependencies ?? []).every(
            (dependency) => reconciled.stepStatuses[dependency] === "completed",
          ),
      );
      updated.push(
        hasReadyStep && status !== "failed" && status !== "completed"
          ? await this.materialize({
              tenantId: input.tenantId,
              roomId: input.roomId,
              planId: reconciled.planId,
              expectedRevision: reconciled.revision,
            })
          : reconciled,
      );
    }
    return updated;
  }

  async get(input: { tenantId: string; roomId: string; planId: string }) {
    const state = await this.store.load(
      input.tenantId,
      input.roomId,
      input.planId,
    );
    if (!state)
      throw new AgentPlatError("NOT_FOUND", "Agent Room plan not found");
    return state;
  }

  private async save(
    current: AgentRoomPlan,
    status: AgentRoomPlan["status"],
    materialized = current.materialized,
  ) {
    const next: AgentRoomPlan = {
      ...current,
      revision: current.revision + 1,
      status,
      materialized: { ...materialized },
      updatedAt: this.clock().toISOString(),
    };
    if (
      !(await this.store.compareAndSet({
        expectedRevision: current.revision,
        state: next,
      }))
    )
      conflict();
    return next;
  }
}

function validateSteps(steps: AgentRoomPlanStep[]) {
  const ids = new Set<string>();
  for (const step of steps) {
    if (!step.stepId.trim() || ids.has(step.stepId)) {
      throw new AgentPlatError(
        "VALIDATION_ERROR",
        "Plan step IDs must be unique",
      );
    }
    for (const dependency of step.dependencies ?? []) {
      if (!ids.has(dependency)) {
        throw new AgentPlatError(
          "VALIDATION_ERROR",
          "Plan dependencies must reference earlier steps",
        );
      }
    }
    ids.add(step.stepId);
  }
}
function conflict(): never {
  throw new AgentPlatError("CONFLICT", "Agent Room plan revision conflict");
}
