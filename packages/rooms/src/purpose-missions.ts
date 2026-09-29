import { AgentPlatError } from "@agentplat/core";
import type { JsonObject, JsonValue } from "@agentplat/core";
import type {
  AgentRoomPlan,
  AgentRoomPlanStore,
  AgentRoomPlannerBridge,
} from "./planner-bridge.js";
import type { RoomService } from "./service.js";
import type { AgentInceptionStoreV1 } from "./agent-inception.js";
import type { AttentionSignalStoreV1 } from "./attention-signals.js";
import type {
  AgentExecutionBindingV1,
  AgentExecutionStoreV1,
} from "./agent-execution.js";
import { agentRoomTaskExecutionDigestV1 } from "./agent-execution.js";
import {
  governanceDigestV1,
  type AgentGovernanceStoreV1,
  type AgentGovernanceHeadV1,
  type AgentGovernancePrincipalV1,
} from "./agent-governance.js";
import {
  agentPurposeWorkFenceMatchesV1,
  type AgentPurposeControlPortV1,
  type AgentPurposeExecutionProjectionV1,
} from "./purpose-control.js";

export type PurposeMissionTriggerV1 =
  | { kind: "inception"; inceptionId: string; assessmentId: string }
  | { kind: "signal"; definitionId: string; wakeupId: string }
  | { kind: "review"; reason: string };
export interface PurposeMissionDecisionV1 {
  disposition:
    "act" | "wait" | "needs_evidence" | "escalate" | "replan" | "complete";
  explanation: string;
  uncertainty: string;
}
export interface PurposeMissionOutcomeV1 {
  criteria: Array<{ criterionId: string; status: "met" | "unmet" | "unknown" }>;
  coverage: "sufficient" | "insufficient" | "stale";
  purposeContribution: "supported" | "unsupported" | "uncertain";
  causalAttribution: "supported" | "not_established";
  explanation: string;
}
export interface PurposeMissionAssessorsV1 {
  assessorId: string;
  outcomeAssessorId: string;
  align(input: JsonObject): Promise<{
    verdict: "aligned" | "uncertain" | "conflicting";
    explanation: string;
  }>;
  /** Ports must deduplicate evaluationId and return the same judgment on retry. */
  evaluate(input: JsonObject): Promise<PurposeMissionDecisionV1>;
  review(input: JsonObject): Promise<PurposeMissionOutcomeV1>;
}
export interface PurposeMissionReceiptV1 {
  schemaVersion: 1;
  operationId: string;
  requestDigest: string;
  actorId: string;
  kind: string;
  revision: number;
  recordedAt: string;
  result: JsonObject;
}
export interface PurposeMissionStateV1 extends AgentPurposeExecutionProjectionV1 {
  workInceptionMessageId?: string;
  roomId: string;
  participantId: string;
  planVersion: number;
  planDigest: string;
  criteria: Array<{ criterionId: string; description: string }>;
  revision: number;
  issuedBy: string;
  alignment: { verdict: "aligned"; explanation: string };
  assessmentProfile: {
    controlDigest: string;
    assessorId: string;
    outcomeAssessorId: string;
  };
  previousPlanIds: string[];
  materializationStarted: boolean;
  receipts: PurposeMissionReceiptV1[];
  pending: {
    operationId: string;
    requestDigest: string;
    actorId: string;
    kind: "evaluate" | "review";
    generation: number;
    leaseUntil: string;
    input: JsonObject;
  } | null;
  latestOutcome: {
    digest: string;
    review: PurposeMissionOutcomeV1;
    planDigest: string;
    tasksComplete: boolean;
    effectsSettled: boolean;
    evidenceCount: number;
  } | null;
  updatedAt: string;
}
export interface PurposeMissionStoreV1 {
  load(
    t: string,
    a: string,
    id: string,
  ): Promise<PurposeMissionStateV1 | undefined>;
  byPlan(
    t: string,
    a: string,
    planId: string,
  ): Promise<PurposeMissionStateV1 | undefined>;
  history(
    t: string,
    a: string,
    id: string,
    afterRevision: number,
    limit: number,
  ): Promise<PurposeMissionStateV1[]>;
  /** Serialize with the same governance row used by task/effect admission. */
  commit(
    state: PurposeMissionStateV1,
    expectedRevision: number | null,
  ): Promise<boolean>;
}
export interface PurposeMissionAccessV1<Context> {
  authenticate(context: Context): Promise<AgentGovernancePrincipalV1 | null>;
  authorize(
    p: AgentGovernancePrincipalV1,
    input: {
      agentId: string;
      missionId: string;
      operation:
        "issue" | "revise" | "cancel" | "evaluate" | "review" | "work" | "read";
    },
  ): Promise<boolean>;
}
export class InMemoryPurposeMissionStoreV1 implements PurposeMissionStoreV1 {
  private states = new Map<string, PurposeMissionStateV1>();
  private plans = new Map<string, string>();
  private histories = new Map<string, PurposeMissionStateV1[]>();
  constructor(
    private readonly governance: {
      executionHead(t: string, a: string): AgentGovernanceHeadV1 | undefined;
    },
  ) {}
  executionMission(t: string, a: string, id: string) {
    return clone(this.states.get(key(t, a, id)));
  }
  async load(t: string, a: string, id: string) {
    return this.executionMission(t, a, id);
  }
  async byPlan(t: string, a: string, p: string) {
    const id = this.plans.get(key(t, a, p));
    return id ? this.executionMission(t, a, id) : undefined;
  }
  async history(
    t: string,
    a: string,
    id: string,
    after: number,
    limit: number,
  ) {
    page(after, limit);
    return clone(
      (this.histories.get(key(t, a, id)) ?? [])
        .filter((s) => s.revision > after)
        .slice(0, limit),
    );
  }
  async commit(s: PurposeMissionStateV1, expected: number | null) {
    validatePurposeMissionCommitV1(s, expected);
    const h = this.governance.executionHead(s.tenantId, s.agentId),
      k = key(s.tenantId, s.agentId, s.missionId),
      old = this.states.get(k);
    if (
      !purposeMissionGovernanceMatchesV1(h, s) ||
      (old?.revision ?? null) !== expected
    )
      return false;
    const planKey = key(s.tenantId, s.agentId, s.planId),
      owner = this.plans.get(planKey);
    if (owner && owner !== s.missionId) return false;
    this.states.set(k, clone(s));
    this.plans.set(planKey, s.missionId);
    this.histories.set(k, [...(this.histories.get(k) ?? []), clone(s)]);
    return true;
  }
}
export class PurposeMissionServiceV1<Context> {
  constructor(
    private readonly store: PurposeMissionStoreV1,
    private readonly governance: Pick<AgentGovernanceStoreV1, "load">,
    private readonly plans: AgentRoomPlanStore,
    private readonly rooms: Pick<RoomService, "getRoomState">,
    private readonly inceptions: AgentInceptionStoreV1,
    private readonly signals: AttentionSignalStoreV1,
    private readonly effects: Pick<
      AgentExecutionStoreV1,
      "effectsForRun" | "taskBinding" | "delegationsForRun"
    >,
    private readonly assessors: PurposeMissionAssessorsV1,
    private readonly access: PurposeMissionAccessV1<Context>,
    private readonly clock: () => Date = () => new Date(),
    private readonly evaluationLeaseMs = 30000,
  ) {
    id(assessors.assessorId);
    id(assessors.outcomeAssessorId);
    if (
      !Number.isSafeInteger(evaluationLeaseMs) ||
      evaluationLeaseMs < 1000 ||
      evaluationLeaseMs > 300000
    )
      invalid();
    if (
      ![assessors.align, assessors.evaluate, assessors.review].every(
        (f) => typeof f === "function",
      )
    )
      invalid();
    this.assessors = Object.freeze({
      ...assessors,
      align: assessors.align.bind(assessors),
      evaluate: assessors.evaluate.bind(assessors),
      review: assessors.review.bind(assessors),
    });
  }
  async get(context: Context, input: { agentId: string; missionId: string }) {
    const r = clone(input);
    exact(r, ["agentId", "missionId"]);
    const p = await this.principal(context, r, "read");
    return this.require(p, r);
  }
  async history(
    context: Context,
    input: { agentId: string; missionId: string },
    after = -1,
    limit = 100,
  ) {
    page(after, limit);
    const s = await this.get(context, input);
    return this.store.history(s.tenantId, s.agentId, s.missionId, after, limit);
  }
  async issue(
    context: Context,
    input: {
      agentId: string;
      missionId: string;
      operationId: string;
      roomId: string;
      planId: string;
      participantId: string;
      criteria: Array<{ criterionId: string; description: string }>;
      expiresAt: string;
      expectedGovernanceRevision: number;
    },
  ): Promise<PurposeMissionReceiptV1> {
    const r = clone(input);
    exact(r, [
      "agentId",
      "missionId",
      "operationId",
      "roomId",
      "planId",
      "participantId",
      "criteria",
      "expiresAt",
      "expectedGovernanceRevision",
    ]);
    validateMissionInput(r);
    const p = await this.principal(context, r, "issue"),
      requestDigest = await digest({ principal: p, input: r }),
      existing = await this.store.load(p.tenantId, r.agentId, r.missionId);
    if (existing) {
      const prior = this.replay(existing, r.operationId, requestDigest);
      if (prior) return prior;
      conflict();
    }
    const h = await this.head(p, r.agentId);
    this.issuer(p, h, r.expectedGovernanceRevision, r.expiresAt);
    if (r.expiresAt <= this.now()) invalid();
    const plan = await this.plan(p.tenantId, r.roomId, r.planId),
      room = await this.rooms.getRoomState(p.tenantId, r.roomId);
    this.participant(room.participants, r.participantId, r.agentId, p.tenantId);
    this.planScope(plan, r.participantId);
    const alignment = await this.assessors.align(
      json({
        evaluationId: await digest({
          tenantId: p.tenantId,
          agentId: r.agentId,
          missionId: r.missionId,
          operationId: r.operationId,
          kind: "alignment",
        }),
        requestDigest,
        purpose: h.configuration.purpose,
        configurationDigest: h.configurationDigest,
        plan: planContent(plan),
        criteria: r.criteria,
      }),
    );
    validateAlignment(alignment);
    await this.recheck(context, r, "issue", p);
    this.issuer(
      p,
      await this.head(p, r.agentId),
      r.expectedGovernanceRevision,
      r.expiresAt,
    );
    if (alignment.verdict !== "aligned")
      throw new AgentPlatError(
        "CONFLICT",
        "Mission alignment requires evidence or correction",
      );
    const s: PurposeMissionStateV1 = {
      schemaVersion: 1,
      tenantId: p.tenantId,
      agentId: r.agentId,
      missionId: r.missionId,
      roomId: r.roomId,
      participantId: r.participantId,
      planId: r.planId,
      planVersion: plan.planVersion,
      planDigest: await digest(planContent(plan)),
      criteria: r.criteria,
      expiresAt: r.expiresAt,
      governanceRevision: h.revision,
      configurationDigest: h.configurationDigest,
      revision: 0,
      workEpoch: 0,
      workDecisionDigest: null,
      status: "awaiting_evaluation",
      issuedBy: p.subjectId,
      alignment: { verdict: "aligned", explanation: alignment.explanation },
      assessmentProfile: {
        controlDigest: h.executionAdmission!.purposeControlDigest!,
        assessorId: this.assessors.assessorId,
        outcomeAssessorId: this.assessors.outcomeAssessorId,
      },
      previousPlanIds: [],
      materializationStarted: false,
      receipts: [],
      pending: null,
      latestOutcome: null,
      updatedAt: this.now(),
    };
    const receipt = this.receipt(
      s,
      r.operationId,
      requestDigest,
      p.subjectId,
      "issue",
      { planId: r.planId },
    );
    s.receipts.push(receipt);
    if (!(await this.store.commit(s, null))) {
      const raced = await this.require(p, r),
        prior = this.replay(raced, r.operationId, requestDigest);
      if (prior) return prior;
      conflict();
    }
    return clone(receipt);
  }
  async revise(
    context: Context,
    input: {
      agentId: string;
      missionId: string;
      operationId: string;
      expectedRevision: number;
      expectedGovernanceRevision: number;
      planId: string;
    },
  ): Promise<PurposeMissionReceiptV1> {
    const r = clone(input);
    exact(r, [
      "agentId",
      "missionId",
      "operationId",
      "expectedRevision",
      "expectedGovernanceRevision",
      "planId",
    ]);
    ids(r.agentId, r.missionId, r.operationId, r.planId);
    integer(r.expectedRevision);
    integer(r.expectedGovernanceRevision);
    const p = await this.principal(context, r, "revise"),
      d = await digest({ principal: p, input: r }),
      s = await this.require(p, r);
    const prior = this.replay(s, r.operationId, d);
    if (prior) return prior;
    const h = await this.head(p, r.agentId);
    this.issuer(p, h, r.expectedGovernanceRevision, s.expiresAt);
    this.live(s);
    if (s.revision !== r.expectedRevision) conflict();
    if (!(await this.workEvidence(s)).effectsSettled) conflict();
    const plan = await this.plan(p.tenantId, s.roomId, r.planId);
    this.planScope(plan, s.participantId);
    if (
      plan.predecessorPlanId !== s.planId ||
      plan.planVersion !== s.planVersion + 1
    )
      conflict();
    const alignment = await this.assessors.align(
      json({
        evaluationId: await digest({
          tenantId: p.tenantId,
          agentId: r.agentId,
          missionId: r.missionId,
          operationId: r.operationId,
          kind: "alignment",
        }),
        requestDigest: d,
        purpose: h.configuration.purpose,
        configurationDigest: h.configurationDigest,
        plan: planContent(plan),
        criteria: s.criteria,
      }),
    );
    validateAlignment(alignment);
    await this.recheck(context, r, "revise", p);
    this.issuer(
      p,
      await this.head(p, r.agentId),
      r.expectedGovernanceRevision,
      s.expiresAt,
    );
    if (alignment.verdict !== "aligned") conflict();
    s.previousPlanIds.push(s.planId);
    s.planId = plan.planId;
    s.planVersion = plan.planVersion;
    s.planDigest = await digest(planContent(plan));
    s.governanceRevision = h.revision;
    s.configurationDigest = h.configurationDigest;
    s.assessmentProfile = {
      controlDigest: h.executionAdmission!.purposeControlDigest!,
      assessorId: this.assessors.assessorId,
      outcomeAssessorId: this.assessors.outcomeAssessorId,
    };
    s.workEpoch++;
    s.workDecisionDigest = null;
    s.status = "awaiting_evaluation";
    s.materializationStarted = false;
    s.pending = null;
    s.latestOutcome = null;
    delete s.workInceptionMessageId;
    s.alignment = { verdict: "aligned", explanation: alignment.explanation };
    return this.saveReceipt(s, p, r.operationId, d, "revise", {
      planId: s.planId,
    });
  }
  async cancel(
    context: Context,
    input: {
      agentId: string;
      missionId: string;
      operationId: string;
      expectedRevision: number;
    },
  ): Promise<PurposeMissionReceiptV1> {
    const r = clone(input);
    exact(r, ["agentId", "missionId", "operationId", "expectedRevision"]);
    integer(r.expectedRevision);
    const p = await this.principal(context, r, "cancel"),
      d = await digest({ principal: p, input: r }),
      s = await this.require(p, r);
    const old = this.replay(s, r.operationId, d);
    if (old) return old;
    const h = await this.governance.load(p.tenantId, r.agentId);
    if (!h) missing();
    this.issuer(p, h, h.revision);
    if (
      s.revision !== r.expectedRevision ||
      ["completed", "canceled"].includes(s.status)
    )
      conflict();
    s.governanceRevision = h.revision;
    s.configurationDigest = h.configurationDigest;
    s.status = "canceled";
    s.workEpoch++;
    s.workDecisionDigest = null;
    s.pending = null;
    return this.saveReceipt(s, p, r.operationId, d, "cancel", {});
  }
  async evaluate(
    context: Context,
    input: {
      agentId: string;
      missionId: string;
      operationId: string;
      expectedRevision: number;
      trigger: PurposeMissionTriggerV1;
    },
  ): Promise<PurposeMissionReceiptV1 | { pending: true; operationId: string }> {
    const r = clone(input);
    exact(r, [
      "agentId",
      "missionId",
      "operationId",
      "expectedRevision",
      "trigger",
    ]);
    validateTrigger(r.trigger);
    integer(r.expectedRevision);
    const p = await this.principal(context, r, "evaluate"),
      d = await digest({ principal: p, input: r });
    let s = await this.require(p, r);
    const old = this.replay(s, r.operationId, d);
    if (old) return old;
    const h = await this.current(p, s);
    const trigger = await this.trigger(s, r.trigger, h);
    const prepared = await this.prepare(
      s,
      p,
      r.operationId,
      d,
      r.expectedRevision,
      "evaluate",
      json({
        evaluationId: await digest({
          tenantId: p.tenantId,
          agentId: r.agentId,
          missionId: r.missionId,
          operationId: r.operationId,
          kind: "evaluate",
        }),
        requestDigest: d,
        purpose: h.configuration.purpose,
        mission: this.summary(s),
        plan: planContent(await this.checkedPlan(s)),
        trigger: trigger.data,
        latestOutcome: s.latestOutcome,
      }),
    );
    if (!prepared) return { pending: true, operationId: r.operationId };
    const decision = await this.assessors.evaluate(
      clone(prepared.pending!.input),
    );
    validateDecision(decision);
    await this.recheck(context, r, "evaluate", p);
    s = await this.finishState(p, r, prepared.pending!);
    await this.current(p, s);
    await this.checkedPlan(s);
    const currentTrigger = await this.trigger(s, r.trigger, h);
    let result = clone(decision);
    if (result.disposition === "act" && !currentTrigger.actionable)
      result = {
        disposition: "needs_evidence",
        explanation:
          "Trigger evidence is stale, incomplete or does not support adoption",
        uncertainty: decision.uncertainty,
      };
    if (result.disposition === "complete" && !(await this.canComplete(s)))
      result = {
        disposition: "needs_evidence",
        explanation:
          "Completed tasks or proxy changes do not establish mission success",
        uncertainty: decision.uncertainty,
      };
    if (result.disposition === "act") {
      if (s.materializationStarted && s.status !== "runnable")
        result = {
          disposition: "replan",
          explanation:
            "Previously fenced materialized work requires a successor plan",
          uncertainty: decision.uncertainty,
        };
      else if (s.status !== "runnable") {
        if (r.trigger.kind === "inception") {
          const source = await this.inceptions.get(
            s.tenantId,
            s.agentId,
            r.trigger.inceptionId,
          );
          s.workInceptionMessageId = source?.sourceMessageId;
        }
        s.workEpoch++;
        s.workDecisionDigest = await digest({
          requestDigest: d,
          decision: result,
          planDigest: s.planDigest,
          governanceRevision: s.governanceRevision,
        });
      }
    }
    const status = {
      act: "runnable",
      wait: "waiting",
      needs_evidence: "needs_evidence",
      escalate: "escalated",
      replan: "requires_replan",
      complete: "completed",
    }[result.disposition];
    if (status !== "runnable" && s.status === "runnable") {
      s.workEpoch++;
      s.workDecisionDigest = null;
    }
    s.status = status;
    s.pending = null;
    return this.saveReceipt(s, p, r.operationId, d, "evaluate", json(result));
  }
  async review(
    context: Context,
    input: {
      agentId: string;
      missionId: string;
      operationId: string;
      expectedRevision: number;
      evidence: Array<{ artifactId: string; versionId: string }>;
    },
  ): Promise<PurposeMissionReceiptV1 | { pending: true; operationId: string }> {
    const r = clone(input);
    exact(r, [
      "agentId",
      "missionId",
      "operationId",
      "expectedRevision",
      "evidence",
    ]);
    integer(r.expectedRevision);
    if (!Array.isArray(r.evidence) || r.evidence.length > 32) invalid();
    for (const e of r.evidence) {
      exact(e, ["artifactId", "versionId"]);
      ids(e.artifactId, e.versionId);
    }
    if (
      new Set(
        r.evidence.map((e) => JSON.stringify([e.artifactId, e.versionId])),
      ).size !== r.evidence.length
    )
      invalid();
    const p = await this.principal(context, r, "review"),
      d = await digest({ principal: p, input: r });
    let s = await this.require(p, r);
    const old = this.replay(s, r.operationId, d);
    if (old) return old;
    const h = await this.current(p, s);
    const work = await this.workEvidence(s),
      room = await this.rooms.getRoomState(p.tenantId, s.roomId),
      evidence = [];
    for (const ref of r.evidence) {
      const a = room.artifacts.find(
        (a) =>
          a.id === ref.artifactId &&
          a.tenantId === p.tenantId &&
          a.roomId === s.roomId,
      );
      const v = a?.versions.find(
        (v) =>
          v.id === ref.versionId &&
          v.tenantId === p.tenantId &&
          v.artifactId === a.id,
      );
      if (!v) missing();
      evidence.push({
        reference: ref,
        content: v.content,
        digest: await digest(v),
      });
    }
    const prepared = await this.prepare(
      s,
      p,
      r.operationId,
      d,
      r.expectedRevision,
      "review",
      json({
        evaluationId: await digest({
          tenantId: p.tenantId,
          agentId: r.agentId,
          missionId: r.missionId,
          operationId: r.operationId,
          kind: "review",
        }),
        requestDigest: d,
        purpose: h.configuration.purpose,
        mission: this.summary(s),
        work,
        evidence,
      }),
    );
    if (!prepared) return { pending: true, operationId: r.operationId };
    const result = await this.assessors.review(clone(prepared.pending!.input));
    validateOutcome(result, s.criteria);
    await this.recheck(context, r, "review", p);
    s = await this.finishState(p, r, prepared.pending!);
    await this.current(p, s);
    await this.checkedPlan(s);
    const originalWork = prepared.pending!.input.work as unknown as {
      tasksComplete: boolean;
      effectsSettled: boolean;
    };
    const final = clone(result);
    if (
      !originalWork.tasksComplete ||
      !originalWork.effectsSettled ||
      !(prepared.pending!.input.evidence as JsonValue[]).length
    )
      final.coverage = "insufficient";
    s.latestOutcome = {
      digest: await digest({ requestDigest: d, result: final }),
      review: final,
      planDigest: s.planDigest,
      tasksComplete: originalWork.tasksComplete,
      effectsSettled: originalWork.effectsSettled,
      evidenceCount: (prepared.pending!.input.evidence as JsonValue[]).length,
    };
    s.pending = null;
    return this.saveReceipt(
      s,
      p,
      r.operationId,
      d,
      "review",
      json(s.latestOutcome),
    );
  }
  async abandonEvaluation(
    context: Context,
    input: {
      agentId: string;
      missionId: string;
      operationId: string;
      expectedRevision: number;
      abandonedOperationId: string;
    },
  ): Promise<PurposeMissionReceiptV1> {
    const r = clone(input);
    exact(r, [
      "agentId",
      "missionId",
      "operationId",
      "expectedRevision",
      "abandonedOperationId",
    ]);
    ids(r.operationId, r.abandonedOperationId);
    integer(r.expectedRevision);
    const p = await this.principal(context, r, "evaluate"),
      d = await digest({ principal: p, input: r }),
      s = await this.require(p, r);
    const old = this.replay(s, r.operationId, d);
    if (old) return old;
    await this.current(p, s);
    if (
      s.revision !== r.expectedRevision ||
      s.pending?.operationId !== r.abandonedOperationId ||
      s.pending.leaseUntil > this.now()
    )
      conflict();
    s.pending = null;
    return this.saveReceipt(s, p, r.operationId, d, "abandon_evaluation", {
      abandonedOperationId: r.abandonedOperationId,
    });
  }
  /** Existing Planner owns materialization; deterministic plan/step IDs provide recovery. */
  async materialize(
    context: Context,
    input: { agentId: string; missionId: string; operationId: string },
    planner: Pick<AgentRoomPlannerBridge, "materialize">,
  ) {
    const r = clone(input);
    exact(r, ["agentId", "missionId", "operationId"]);
    ids(r.operationId);
    const p = await this.principal(context, r, "work"),
      d = await digest({ principal: p, input: r });
    let s = await this.require(p, r);
    const old = this.replay(s, r.operationId, d);
    if (old) return old;
    await this.current(p, s);
    if (s.status !== "runnable") conflict();
    if (!s.materializationStarted) {
      const expected = s.revision;
      s.materializationStarted = true;
      s.revision++;
      s.updatedAt = this.now();
      if (!(await this.store.commit(s, expected))) conflict();
    }
    const plan = await this.checkedPlan(s);
    await planner.materialize({
      tenantId: p.tenantId,
      roomId: s.roomId,
      planId: s.planId,
      expectedRevision: plan.revision,
    });
    s = await this.require(p, r);
    const raced = this.replay(s, r.operationId, d);
    if (raced) return raced;
    await this.current(p, s);
    if (s.status !== "runnable") conflict();
    return this.saveReceipt(s, p, r.operationId, d, "materialize", {
      planId: s.planId,
    });
  }
  /** One bounded step. Running/failed work is retained for reconciliation, never blindly retried. */
  async runOne(
    context: Context,
    input: { agentId: string; missionId: string },
    owner: {
      rooms: Pick<RoomService, "runTask">;
      runOptions?: Parameters<RoomService["runTask"]>[3];
      planner: Pick<AgentRoomPlannerBridge, "reconcileFromEvent">;
    },
  ) {
    const r = clone(input);
    exact(r, ["agentId", "missionId"]);
    const p = await this.principal(context, r, "work"),
      s = await this.require(p, r);
    await this.current(p, s);
    if (s.status !== "runnable") conflict();
    let room = await this.rooms.getRoomState(p.tenantId, s.roomId);
    if (room.events.length)
      await owner.planner.reconcileFromEvent({
        tenantId: p.tenantId,
        roomId: s.roomId,
        triggerEventId: room.events.at(-1)!.id,
        planId: s.planId,
      });
    const plan = await this.checkedPlan(s);
    room = await this.rooms.getRoomState(p.tenantId, s.roomId);
    const tasks = plan.steps.map((step) =>
      room.tasks.find((t) => t.id === plan.materialized[step.stepId]),
    );
    const ready = tasks.find(
      (t) =>
        t?.status === "pending" &&
        t.dependencies.every((id) =>
          room.tasks.some(
            (other) => other.id === id && other.status === "completed",
          ),
        ),
    );
    if (!ready)
      return {
        status: tasks.every((t) => t?.status === "completed")
          ? "tasks_completed"
          : "waiting_or_reconciliation_required",
      };
    await this.recheck(context, r, "work", p);
    const run = await owner.rooms.runTask(
      p.tenantId,
      s.roomId,
      ready.id,
      owner.runOptions,
    );
    return { status: "ran", taskId: ready.id, runId: run.id };
  }
  control(): AgentPurposeControlPortV1 {
    const configurationDigest = () =>
      digest({
        protocol: "agentplat.room-purpose-mission.v1",
        assessorId: this.assessors.assessorId,
        outcomeAssessorId: this.assessors.outcomeAssessorId,
        maximumSteps: 16,
        maximumReceipts: 64,
        evaluationLeaseMs: this.evaluationLeaseMs,
      });
    const checked = async (b: AgentExecutionBindingV1) => {
      const s = b.purposeWork
        ? await this.store.load(b.tenantId, b.agentId, b.purposeWork.missionId)
        : undefined;
      if (!agentPurposeWorkFenceMatchesV1(s, b, this.now())) return undefined;
      try {
        await this.checkedPlan(s!);
      } catch {
        return undefined;
      }
      return s;
    };
    return {
      configurationDigest,
      admit: async (h) => {
        if (
          h.configuration.interactionMode !== "purpose" ||
          h.status !== "transitioning"
        )
          denied();
        await this.store.load(h.tenantId, h.agentId, "readiness-probe");
        await this.effects.effectsForRun(
          h.tenantId,
          h.agentId,
          "readiness-probe",
        );
      },
      bindTask: async ({ binding, participant, task }) => {
        if (
          typeof task.metadata?.planId !== "string" ||
          typeof task.metadata.planStepId !== "string"
        )
          denied();
        const s = await this.store.byPlan(
          binding.tenantId,
          binding.agentId,
          task.metadata.planId,
        );
        if (!s || !s.workDecisionDigest) denied();
        const work = {
          missionId: s.missionId,
          workEpoch: s.workEpoch,
          decisionDigest: s.workDecisionDigest,
          planId: s.planId,
          stepId: task.metadata.planStepId,
        };
        if (!(await checked({ ...binding, purposeWork: work }))) denied();
        const plan = await this.checkedPlan(s);
        const step = plan.steps.find((x) => x.stepId === work.stepId);
        if (
          !step ||
          step.kind !== "agent_task" ||
          participant.id !== s.participantId ||
          step.participantId !== participant.id ||
          task.id !== `plan:${plan.planId}:${step.stepId}` ||
          task.instruction !== step.instruction ||
          task.expectedOutput !== step.expectedOutput ||
          task.expectedArtifactKind !== step.expectedArtifactKind ||
          task.actionLevel !== (step.actionLevel ?? "execute") ||
          JSON.stringify(task.toolIds) !== JSON.stringify(step.toolIds ?? []) ||
          JSON.stringify(task.dependencies) !==
            JSON.stringify(
              (step.dependencies ?? []).map(
                (id) => `plan:${plan.planId}:${id}`,
              ),
            )
        )
          denied();
        if (!s.materializationStarted) {
          const expected = s.revision;
          s.materializationStarted = true;
          s.revision++;
          s.updatedAt = this.now();
          if (!(await this.store.commit(s, expected))) conflict();
        }
        return work;
      },
      checkDelegation: async (b, messageId, contentDigest) => {
        const s = await checked(b);
        if (
          !s ||
          s.workInceptionMessageId !== messageId ||
          (await this.checkedPlan(s)).steps.length !== 1
        )
          return false;
        const m = (
          await this.rooms.getRoomState(s.tenantId, s.roomId)
        ).messages.find((m) => m.id === messageId);
        return (
          !!m &&
          (await governanceDigestV1({
            domain: "agent-handoff-content-v1",
            content: m.content,
          })) === contentDigest
        );
      },
      checkWork: async (b) => !!(await checked(b)),
      checkEffect: async (b, e) => {
        const s = await checked(b);
        if (!s) return false;
        const plan = await this.checkedPlan(s),
          step = plan.steps.find((x) => x.stepId === b.purposeWork!.stepId);
        const room = await this.rooms.getRoomState(s.tenantId, s.roomId);
        return (
          step?.kind === "agent_task" &&
          (step.toolIds ?? []).includes(e.toolId) &&
          room.runs.some(
            (r) =>
              r.id === e.runId &&
              r.taskId === `plan:${s.planId}:${step.stepId}` &&
              r.participantId === s.participantId &&
              r.status === "running",
          )
        );
      },
      context: async (b) => {
        const s = await checked(b);
        if (!s) denied();
        const h = await this.governance.load(b.tenantId, b.agentId);
        if (!h) denied();
        return json({
          purpose: h.configuration.purpose,
          mission: this.summary(s),
          plan: planContent(await this.checkedPlan(s)),
          governanceRevision: b.revision,
        });
      },
    };
  }
  private async prepare(
    s: PurposeMissionStateV1,
    p: AgentGovernancePrincipalV1,
    op: string,
    d: string,
    expected: number,
    kind: "evaluate" | "review",
    input: JsonObject,
  ) {
    ids(op);
    this.live(s);
    const now = this.now();
    let generation = 1;
    if (s.receipts.length >= 64) conflict();
    if (s.pending) {
      if (s.pending.operationId !== op || s.pending.requestDigest !== d)
        conflict();
      if (s.pending.leaseUntil > now) return null;
      generation = s.pending.generation + 1;
      input = s.pending.input;
    } else if (s.revision !== expected) conflict();
    const previous = s.revision;
    s.pending = {
      operationId: op,
      requestDigest: d,
      actorId: p.subjectId,
      kind,
      generation,
      leaseUntil: new Date(
        Date.parse(now) + this.evaluationLeaseMs,
      ).toISOString(),
      input,
    };
    s.revision++;
    s.updatedAt = now;
    if (!(await this.store.commit(s, previous))) conflict();
    return s;
  }
  private async finishState(
    p: AgentGovernancePrincipalV1,
    r: { agentId: string; missionId: string },
    pending: NonNullable<PurposeMissionStateV1["pending"]>,
  ) {
    const s = await this.require(p, r);
    if (
      !s.pending ||
      s.pending.operationId !== pending.operationId ||
      s.pending.generation !== pending.generation ||
      s.pending.requestDigest !== pending.requestDigest ||
      s.pending.leaseUntil <= this.now()
    )
      conflict();
    return s;
  }
  private async saveReceipt(
    s: PurposeMissionStateV1,
    p: AgentGovernancePrincipalV1,
    op: string,
    d: string,
    kind: string,
    result: JsonObject,
  ) {
    const previous = s.revision;
    s.revision++;
    s.updatedAt = this.now();
    const receipt = this.receipt(s, op, d, p.subjectId, kind, result);
    s.receipts.push(receipt);
    if (!(await this.store.commit(s, previous))) conflict();
    return clone(receipt);
  }
  private receipt(
    s: PurposeMissionStateV1,
    op: string,
    d: string,
    actorId: string,
    kind: string,
    result: JsonObject,
  ): PurposeMissionReceiptV1 {
    ids(op);
    if (s.receipts.length >= 64) conflict();
    return {
      schemaVersion: 1,
      operationId: op,
      requestDigest: d,
      actorId,
      kind,
      revision: s.revision,
      recordedAt: this.now(),
      result,
    };
  }
  private replay(s: PurposeMissionStateV1, op: string, d: string) {
    const old = s.receipts.find((x) => x.operationId === op);
    if (old && old.requestDigest !== d) conflict();
    return clone(old);
  }
  private async trigger(
    s: PurposeMissionStateV1,
    t: PurposeMissionTriggerV1,
    h: AgentGovernanceHeadV1,
  ): Promise<{ data: JsonObject; actionable: boolean }> {
    if (t.kind === "review") return { data: json(t), actionable: true };
    if (t.kind === "inception") {
      const inception = await this.inceptions.get(
          s.tenantId,
          s.agentId,
          t.inceptionId,
        ),
        assessment = await this.inceptions.assessment(
          s.tenantId,
          s.agentId,
          t.inceptionId,
          t.assessmentId,
        ),
        latest = await this.inceptions.latest(
          s.tenantId,
          s.agentId,
          t.inceptionId,
        );
      if (
        !inception ||
        inception.roomId !== s.roomId ||
        !assessment ||
        latest?.assessmentDigest !== assessment.assessmentDigest ||
        assessment.governance.revision !== h.revision
      )
        conflict();
      return {
        data: json({ inception, assessment }),
        actionable: ["adopted", "reformulated"].includes(
          assessment.disposition,
        ),
      };
    }
    const definition = await this.signals.catalog(
        s.tenantId,
        s.agentId,
        t.definitionId,
      ),
      stream = await this.signals.load(s.tenantId, s.agentId, t.definitionId),
      w = stream?.deliveries.find(
        (x) => x.wakeup.wakeupId === t.wakeupId,
      )?.wakeup;
    if (
      !definition ||
      definition.type !== "definition" ||
      !w ||
      w.governance.revision !== h.revision ||
      !h.configuration.signalRefs.includes(t.definitionId)
    )
      conflict();
    const observations = w.observationIds
      .map((id) => stream!.observations.find((o) => o.observationId === id))
      .filter((o) => !!o);
    const actionable =
      !w.contradictory &&
      w.coverage.every((c) => {
        const o = observations.find((o) => o.observationId === c.observationId);
        return (
          c.status === "fresh" &&
          !!o &&
          o.availability === "observed" &&
          this.clock().getTime() - Date.parse(o.observedAt) <=
            definition.content.freshnessMs
        );
      });
    return { data: json({ wakeup: w, observations }), actionable };
  }
  private async workEvidence(s: PurposeMissionStateV1) {
    const plan = await this.checkedPlan(s),
      room = await this.rooms.getRoomState(s.tenantId, s.roomId),
      tasks = plan.steps.map((step) =>
        room.tasks.find((t) => t.id === plan.materialized[step.stepId]),
      );
    const runs = room.runs.filter((r) => tasks.some((t) => t?.id === r.taskId)),
      effects = [];
    for (const run of runs)
      effects.push(
        ...(await this.effects.effectsForRun(s.tenantId, s.agentId, run.id)),
      );
    const delegations = [];
    for (const run of runs)
      delegations.push(
        ...((await this.effects.delegationsForRun?.(
          s.tenantId,
          s.agentId,
          run.id,
        )) ?? []),
      );
    let taskExecutionVerified = tasks.length > 0;
    for (const task of tasks) {
      if (!task) {
        taskExecutionVerified = false;
        continue;
      }
      const binding = await this.effects.taskBinding(
        s.tenantId,
        s.roomId,
        task.id,
      );
      if (
        !binding ||
        binding.binding.agentId !== s.agentId ||
        binding.binding.revision !== s.governanceRevision ||
        binding.binding.configurationDigest !== s.configurationDigest ||
        binding.binding.purposeWork?.missionId !== s.missionId ||
        binding.binding.purposeWork.planId !== s.planId ||
        binding.taskDigest !== (await agentRoomTaskExecutionDigestV1(task))
      )
        taskExecutionVerified = false;
    }
    return {
      tasks: tasks.map((t) => t ?? null),
      runs,
      effects,
      delegations,
      tasksComplete:
        delegations.every((d) => d.status === "completed") &&
        taskExecutionVerified &&
        tasks.every((t) => t?.status === "completed"),
      taskExecutionVerified,
      effectsSettled:
        delegations.every((d) =>
          ["completed", "failed", "rejected"].includes(d.status),
        ) &&
        effects.every(
          (e) => e.status === "succeeded" || e.status === "not_applied",
        ),
    };
  }
  private async canComplete(s: PurposeMissionStateV1) {
    const o = s.latestOutcome;
    if (
      !o ||
      o.planDigest !== s.planDigest ||
      o.review.coverage !== "sufficient" ||
      o.review.purposeContribution !== "supported" ||
      o.review.causalAttribution !== "supported" ||
      !o.review.criteria.every((c) => c.status === "met") ||
      o.evidenceCount === 0
    )
      return false;
    const work = await this.workEvidence(s);
    return (
      work.tasksComplete &&
      work.effectsSettled &&
      o.tasksComplete &&
      o.effectsSettled
    );
  }
  private async checkedPlan(s: PurposeMissionStateV1) {
    const p = await this.plan(s.tenantId, s.roomId, s.planId);
    if ((await digest(planContent(p))) !== s.planDigest) conflict();
    return p;
  }
  private async plan(t: string, r: string, idValue: string) {
    const p = await this.plans.load(t, r, idValue);
    if (!p || p.tenantId !== t || p.roomId !== r) missing();
    return p;
  }
  private planScope(p: AgentRoomPlan, participantId: string) {
    text(p.objective);
    if (
      !Number.isSafeInteger(p.planVersion) ||
      p.planVersion < 1 ||
      new Set(p.steps.map((s) => s.stepId)).size !== p.steps.length
    )
      invalid();
    if (p.status !== "draft" || Object.keys(p.materialized).length) conflict();
    if (
      p.steps.length < 1 ||
      p.steps.length > 16 ||
      p.steps.some(
        (s) => s.kind !== "agent_task" || s.participantId !== participantId,
      )
    )
      invalid();
    for (const step of p.steps)
      if (step.kind === "agent_task") {
        text(step.instruction);
        text(step.expectedOutput);
        text(step.expectedArtifactKind);
      }
  }
  private participant(
    ps: Array<{
      id: string;
      tenantId: string;
      type: string;
      metadata?: Record<string, unknown>;
    }>,
    pid: string,
    a: string,
    t: string,
  ) {
    if (
      !ps.some(
        (p) =>
          p.id === pid &&
          p.tenantId === t &&
          p.type === "agent" &&
          (p.metadata?.agentId ?? p.id) === a,
      )
    )
      denied();
  }
  private async head(p: AgentGovernancePrincipalV1, a: string) {
    const h = await this.governance.load(p.tenantId, a);
    if (
      !h ||
      h.status !== "active" ||
      h.configuration.interactionMode !== "purpose" ||
      !h.executionAdmission?.purposeControlDigest ||
      h.executionAdmission.purposeControlDigest !==
        (await this.control().configurationDigest())
    )
      denied();
    return h;
  }
  private async current(
    p: AgentGovernancePrincipalV1,
    s: PurposeMissionStateV1,
  ) {
    this.live(s);
    const h = await this.head(p, s.agentId);
    if (
      h.revision !== s.governanceRevision ||
      h.configurationDigest !== s.configurationDigest ||
      this.now() < s.updatedAt
    )
      conflict();
    return h;
  }
  private issuer(
    p: AgentGovernancePrincipalV1,
    h: AgentGovernanceHeadV1,
    expected: number,
    expiresAt?: string,
  ) {
    if (h.revision !== expected) conflict();
    if (
      h.configuration.ownerId !== p.subjectId &&
      !h.configuration.delegations.some(
        (d) =>
          d.subjectId === p.subjectId &&
          d.operation === "missions" &&
          d.expiresAt > this.now() &&
          (!expiresAt || d.expiresAt >= expiresAt),
      )
    )
      denied();
  }
  private live(s: PurposeMissionStateV1) {
    if (
      ["completed", "canceled"].includes(s.status) ||
      s.expiresAt <= this.now()
    )
      conflict();
  }
  private async require(
    p: AgentGovernancePrincipalV1,
    r: { agentId: string; missionId: string },
  ) {
    const s = await this.store.load(p.tenantId, r.agentId, r.missionId);
    if (!s) missing();
    return s;
  }
  private summary(s: PurposeMissionStateV1) {
    return json({
      missionId: s.missionId,
      planId: s.planId,
      planDigest: s.planDigest,
      criteria: s.criteria,
      status: s.status,
      expiresAt: s.expiresAt,
      governanceRevision: s.governanceRevision,
    });
  }
  private now() {
    return this.clock().toISOString();
  }
  private async principal(
    context: Context,
    r: { agentId: string; missionId: string },
    operation: Parameters<
      PurposeMissionAccessV1<Context>["authorize"]
    >[1]["operation"],
  ) {
    ids(r.agentId, r.missionId);
    try {
      const p = clone(await this.access.authenticate(context));
      if (!p) denied();
      ids(p.tenantId, p.subjectId);
      if (
        !(await this.access.authorize(clone(p), {
          agentId: r.agentId,
          missionId: r.missionId,
          operation,
        }))
      )
        denied();
      return p;
    } catch {
      return denied();
    }
  }
  private async recheck(
    context: Context,
    r: { agentId: string; missionId: string },
    operation: Parameters<
      PurposeMissionAccessV1<Context>["authorize"]
    >[1]["operation"],
    previous: AgentGovernancePrincipalV1,
  ) {
    const current = await this.principal(context, r, operation);
    if (
      current.tenantId !== previous.tenantId ||
      current.subjectId !== previous.subjectId
    )
      denied();
  }
}
export function purposeMissionGovernanceMatchesV1(
  h: AgentGovernanceHeadV1 | undefined,
  s: PurposeMissionStateV1,
) {
  return (
    !!h &&
    h.tenantId === s.tenantId &&
    h.agentId === s.agentId &&
    (s.status === "canceled" ||
      (h.status === "active" &&
        h.configuration.interactionMode === "purpose" &&
        !!h.executionAdmission?.purposeControlDigest &&
        h.executionAdmission.purposeControlDigest ===
          s.assessmentProfile?.controlDigest)) &&
    h.revision === s.governanceRevision &&
    h.configurationDigest === s.configurationDigest
  );
}
export function validatePurposeMissionCommitV1(
  s: PurposeMissionStateV1,
  expected: number | null,
) {
  if (
    s.schemaVersion !== 1 ||
    s.revision !== (expected === null ? 0 : expected + 1) ||
    s.revision > 256 ||
    s.receipts.length > 64 ||
    new TextEncoder().encode(JSON.stringify(s)).length > 1048576 ||
    ![
      "awaiting_evaluation",
      "runnable",
      "waiting",
      "needs_evidence",
      "escalated",
      "requires_replan",
      "completed",
      "canceled",
    ].includes(s.status)
  )
    invalid();
  integer(s.revision);
}
function planContent(p: AgentRoomPlan) {
  return {
    planId: p.planId,
    planVersion: p.planVersion,
    predecessorPlanId: p.predecessorPlanId ?? null,
    objective: p.objective,
    steps: p.steps,
  };
}
function validateMissionInput(r: {
  agentId: string;
  missionId: string;
  operationId: string;
  roomId: string;
  planId: string;
  participantId: string;
  criteria: Array<{ criterionId: string; description: string }>;
  expiresAt: string;
  expectedGovernanceRevision: number;
}) {
  ids(
    r.agentId,
    r.missionId,
    r.operationId,
    r.roomId,
    r.planId,
    r.participantId,
  );
  integer(r.expectedGovernanceRevision);
  timestamp(r.expiresAt);
  if (
    !Array.isArray(r.criteria) ||
    !r.criteria.length ||
    r.criteria.length > 16 ||
    r.criteria.some((c) => !c || typeof c !== "object") ||
    new Set(r.criteria.map((c) => c.criterionId)).size !== r.criteria.length
  )
    invalid();
  for (const c of r.criteria) {
    exact(c, ["criterionId", "description"]);
    ids(c.criterionId);
    text(c.description);
  }
}
function validateTrigger(t: PurposeMissionTriggerV1) {
  if (t?.kind === "review") {
    exact(t, ["kind", "reason"]);
    text(t.reason);
  } else if (t?.kind === "inception") {
    exact(t, ["kind", "inceptionId", "assessmentId"]);
    ids(t.inceptionId, t.assessmentId);
  } else if (t?.kind === "signal") {
    exact(t, ["kind", "definitionId", "wakeupId"]);
    ids(t.definitionId, t.wakeupId);
  } else invalid();
}
function validateAlignment(a: { verdict: string; explanation: string }) {
  exact(a, ["verdict", "explanation"]);
  if (!["aligned", "uncertain", "conflicting"].includes(a.verdict)) invalid();
  text(a.explanation);
}
function validateDecision(d: PurposeMissionDecisionV1) {
  exact(d, ["disposition", "explanation", "uncertainty"]);
  if (
    ![
      "act",
      "wait",
      "needs_evidence",
      "escalate",
      "replan",
      "complete",
    ].includes(d.disposition)
  )
    invalid();
  text(d.explanation);
  text(d.uncertainty);
}
function validateOutcome(
  o: PurposeMissionOutcomeV1,
  criteria: Array<{ criterionId: string }>,
) {
  exact(o, [
    "criteria",
    "coverage",
    "purposeContribution",
    "causalAttribution",
    "explanation",
  ]);
  if (
    !["sufficient", "insufficient", "stale"].includes(o.coverage) ||
    !["supported", "unsupported", "uncertain"].includes(
      o.purposeContribution,
    ) ||
    !["supported", "not_established"].includes(o.causalAttribution) ||
    !Array.isArray(o.criteria) ||
    o.criteria.length !== criteria.length ||
    o.criteria.some((c) => !c || typeof c !== "object") ||
    new Set(o.criteria.map((c) => c.criterionId)).size !== criteria.length
  )
    invalid();
  for (const c of o.criteria) {
    exact(c, ["criterionId", "status"]);
    if (
      !criteria.some((x) => x.criterionId === c.criterionId) ||
      !["met", "unmet", "unknown"].includes(c.status)
    )
      invalid();
  }
  text(o.explanation);
}
function page(a: number, l: number) {
  if (
    !Number.isSafeInteger(a) ||
    a < -1 ||
    !Number.isSafeInteger(l) ||
    l < 1 ||
    l > 256
  )
    invalid();
}
function integer(n: number) {
  if (!Number.isSafeInteger(n) || n < 0) invalid();
}
function timestamp(v: string) {
  if (
    typeof v !== "string" ||
    !Number.isFinite(Date.parse(v)) ||
    new Date(v).toISOString() !== v
  )
    invalid();
}
function ids(...v: string[]) {
  for (const s of v)
    if (
      typeof s !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,511}$/u.test(s)
    )
      invalid();
}
function id(v: string) {
  ids(v);
}
function text(v: string) {
  if (typeof v !== "string" || !v.trim() || v.length > 16000) invalid();
}
function exact(v: object, k: string[]) {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).sort().join(",") !== k.sort().join(",")
  )
    invalid();
}
function json(v: unknown): JsonObject {
  return JSON.parse(JSON.stringify(v));
}
function clone<T>(v: T): T {
  return structuredClone(v);
}
function key(...v: string[]) {
  return JSON.stringify(v);
}
function digest(v: unknown) {
  return governanceDigestV1({
    domain: "purpose-mission-v1",
    value: json(v) as JsonValue,
  });
}
function invalid(): never {
  throw new AgentPlatError(
    "VALIDATION_ERROR",
    "Purpose mission input is invalid",
  );
}
function denied(): never {
  throw new AgentPlatError(
    "FORBIDDEN",
    "Purpose mission authority or work denied",
  );
}
function conflict(): never {
  throw new AgentPlatError(
    "CONFLICT",
    "Purpose mission state, evidence or governance conflict",
  );
}
function missing(): never {
  throw new AgentPlatError(
    "NOT_FOUND",
    "Purpose mission or scoped evidence not found",
  );
}

/** Ordinary messages become durable inceptions only; this adapter never creates a task. */
export function createPurposeRoomInputPortV1<Context>(
  tenantId: string,
  context: Context,
  inceptions: Pick<
    import("./agent-inception.js").AgentInceptionServiceV1<Context>,
    "submit"
  >,
  governance: Pick<AgentGovernanceStoreV1, "load">,
): import("./coordination-execution.js").PurposeRoomInputPortV1 {
  return {
    async submit(input) {
      if (input.tenantId !== tenantId) denied();
      const h = await governance.load(tenantId, input.agentId);
      if (!h || h.configuration.interactionMode !== "purpose") denied();
      await inceptions.submit(context, {
        agentId: input.agentId,
        roomId: input.roomId,
        inceptionId: await digest({
          roomId: input.roomId,
          messageId: input.messageId,
          agentId: input.agentId,
        }),
        sourceMessageId: input.messageId,
        expectedGovernanceRevision: h.revision,
      });
    },
  };
}
