import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import type { AgentPlatID, JsonObject } from "@agentplat/core";
import {
  createProcessDefinitionV1,
  createTaskDefinitionV1,
  digestWorkflowJsonV1,
  type GateProviderPortV1,
  type ProcessDefinitionV1,
  type ProcessGateRequestV1,
  type ProcessGateResultV1,
  type ProcessStageDependencyV1,
  type ProcessStageV1,
  type TaskDefinitionV1,
  type TaskExecutionBindingInputV1,
  type TaskExecutionBindingResolverV1,
  type TaskExecutorPortV1,
  type ProcessTaskExecutionRequestV1,
  type ProcessTaskExecutionResultV1,
} from "@agentplat/workflows";

import {
  MORPHOGENESIS_CATALOG_LIFECYCLE_PROCESS_ID_V1,
  MORPHOGENESIS_CATALOG_LIFECYCLE_PROCESS_VERSION_V1,
  type MorphogenesisDecisionRouteV1,
} from "./morphogenesis-contracts.js";
import {
  type MorphogenesisDecisionBindingV1,
  type MorphogenesisDecisionCandidateV1,
  type MorphogenesisDecisionRuntimeV1,
} from "./morphogenesis-decision.js";
import {
  type MorphogenesisExecutionRecordV1,
  type MorphogenesisExecutionRuntimeV1,
} from "./morphogenesis-execution.js";

export const MORPHOGENESIS_DECISION_GATE_TYPE_V1 =
  "agentplat.morphogenesis.decision.v1" as const;

export interface MorphogenesisProcessBindingV1 {
  readonly schemaVersion: 1;
  readonly tenantId: AgentPlatID;
  readonly runId: AgentPlatID;
  readonly executionStateKey: AgentPlatID;
  readonly processDefinitionDigest: `sha256:${string}`;
  readonly scopeDigest: PlanningDigestV1;
  readonly proposalDigest: PlanningDigestV1;
  readonly targetDigest: PlanningDigestV1;
  readonly candidateDigest: PlanningDigestV1;
  readonly policyDigest: PlanningDigestV1;
  readonly morphologyEpoch: number;
  readonly boundAtLogicalMs: number;
  readonly bindingDigest: PlanningDigestV1;
}

export function createMorphogenesisProcessBindingV1(
  input: Omit<MorphogenesisProcessBindingV1, "schemaVersion" | "bindingDigest">,
): MorphogenesisProcessBindingV1 {
  const body = Object.freeze({
    schemaVersion: 1 as const,
    tenantId: identifier(input.tenantId, "process tenant ID"),
    runId: identifier(input.runId, "process run ID"),
    executionStateKey: identifier(
      input.executionStateKey,
      "process execution state key",
    ),
    processDefinitionDigest: digestValue(
      input.processDefinitionDigest,
      "process definition digest",
    ),
    scopeDigest: digestValue(input.scopeDigest, "process scope digest"),
    proposalDigest: digestValue(
      input.proposalDigest,
      "process proposal digest",
    ),
    targetDigest: digestValue(input.targetDigest, "process target digest"),
    candidateDigest: digestValue(
      input.candidateDigest,
      "process candidate digest",
    ),
    policyDigest: digestValue(input.policyDigest, "process policy digest"),
    morphologyEpoch: positiveInteger(
      input.morphologyEpoch,
      "process morphology epoch",
    ),
    boundAtLogicalMs: nonNegativeInteger(
      input.boundAtLogicalMs,
      "process binding time",
    ),
  });
  return Object.freeze({
    ...body,
    bindingDigest: digestPlanningJsonV1(
      "morphogenesis-process-binding",
      body as unknown as PlanningJson,
    ),
  });
}

export function validateMorphogenesisProcessBindingV1(
  input: unknown,
): MorphogenesisProcessBindingV1 {
  if (!input || typeof input !== "object" || Array.isArray(input))
    fail("Morphogenesis process binding must be an object");
  const value = input as Record<string, unknown>;
  const expected = [
    "bindingDigest",
    "boundAtLogicalMs",
    "candidateDigest",
    "executionStateKey",
    "morphologyEpoch",
    "policyDigest",
    "processDefinitionDigest",
    "proposalDigest",
    "runId",
    "schemaVersion",
    "scopeDigest",
    "targetDigest",
    "tenantId",
  ].sort();
  if (Object.keys(value).sort().join(",") !== expected.join(","))
    fail("Morphogenesis process binding fields are invalid");
  if (value.schemaVersion !== 1)
    fail("Morphogenesis process binding schema is invalid");
  const result = createMorphogenesisProcessBindingV1({
    tenantId: value.tenantId as AgentPlatID,
    runId: value.runId as AgentPlatID,
    executionStateKey: value.executionStateKey as AgentPlatID,
    processDefinitionDigest: value.processDefinitionDigest as `sha256:${string}`,
    scopeDigest: value.scopeDigest as PlanningDigestV1,
    proposalDigest: value.proposalDigest as PlanningDigestV1,
    targetDigest: value.targetDigest as PlanningDigestV1,
    candidateDigest: value.candidateDigest as PlanningDigestV1,
    policyDigest: value.policyDigest as PlanningDigestV1,
    morphologyEpoch: value.morphologyEpoch as number,
    boundAtLogicalMs: value.boundAtLogicalMs as number,
  });
  if (value.bindingDigest !== result.bindingDigest)
    fail("Morphogenesis process binding digest is invalid");
  return result;
}

export interface MorphogenesisDecisionCandidateResolutionPortV1 {
  resolve(
    candidateDigest: PlanningDigestV1,
  ): Promise<MorphogenesisDecisionCandidateV1 | null>;
}

export interface MorphogenesisProcessBindingResolutionPortV1 {
  resolve(input: {
    readonly tenantId: string;
    readonly runId: string;
  }): Promise<MorphogenesisProcessBindingV1 | null>;
}

export interface MorphogenesisExecutionLogicalClockV1 {
  read(input: ProcessTaskExecutionRequestV1): number;
}

export interface MorphogenesisEvaluationPortV1 {
  evaluate(input: {
    readonly binding: MorphogenesisProcessBindingV1;
    readonly logicalTimeMs: number;
  }): Promise<{
    readonly disposition:
      | "success"
      | "partial_success"
      | "failure"
      | "indeterminate"
      | "successor_recovery_required";
    readonly outcomeEvidenceDigests: readonly PlanningDigestV1[];
  }>;
}

export interface MorphogenesisWorkflowCompensationPortV1 {
  compensate(input: {
    readonly stageId: string;
    readonly execution: MorphogenesisExecutionRecordV1;
    readonly workflowTaskId: string;
    readonly idempotencyKey: string;
    readonly logicalTimeMs: number;
    readonly signal: AbortSignal;
  }): Promise<{ readonly receiptDigest: PlanningDigestV1 }>;
}

/** Protected Workflow executor for the concrete Morphogenesis effect stages. */
export class MorphogenesisExecutionTaskExecutorV1
  implements TaskExecutorPortV1
{
  constructor(
    readonly options: {
      readonly execution: MorphogenesisExecutionRuntimeV1;
      readonly bindings: MorphogenesisProcessBindingResolutionPortV1;
      readonly clock: MorphogenesisExecutionLogicalClockV1;
      readonly evaluation?: MorphogenesisEvaluationPortV1;
      readonly compensation?: MorphogenesisWorkflowCompensationPortV1;
    },
  ) {}

  async execute(
    input: ProcessTaskExecutionRequestV1,
  ): Promise<ProcessTaskExecutionResultV1> {
    const binding = await this.options.bindings.resolve({
      tenantId: input.tenantId,
      runId: input.runId,
    });
    if (!binding) return { status: "failed", reasonCode: "morphogenesis_process_binding_unavailable" };
    const verified = validateMorphogenesisProcessBindingV1(binding);
    if (
      verified.tenantId !== input.tenantId ||
      verified.runId !== input.runId
    )
      return { status: "failed", reasonCode: "morphogenesis_process_binding_mismatch" };
    const logicalTimeMs = this.options.clock.read(input);
    if (input.stage.stageId.startsWith("compensate_")) {
      const current = await this.options.execution.required(
        verified.executionStateKey,
      );
      if (current.activation)
        return {
          status: "failed",
          reasonCode: "morphogenesis_post_commit_compensation_prohibited",
        };
      if (!this.options.compensation)
        return {
          status: "failed",
          reasonCode: "morphogenesis_compensation_port_unavailable",
        };
      const compensated = await this.options.compensation.compensate({
        stageId: input.stage.stageId,
        execution: current,
        workflowTaskId: input.taskRunId,
        idempotencyKey: input.idempotencyKey,
        logicalTimeMs,
        signal: input.signal,
      });
      if (!/^sha256:[0-9a-f]{64}$/u.test(compensated.receiptDigest))
        return {
          status: "indeterminate",
          reasonCode: "morphogenesis_compensation_receipt_invalid",
        };
      return {
        status: "completed",
        resultDigest: compensated.receiptDigest,
      };
    }
    let record;
    switch (input.stage.stageId) {
      case "prepare":
        record = await this.options.execution.required(
          verified.executionStateKey,
        );
        break;
      case "provision":
        record = await this.options.execution.resolveAgent({
          stateKey: verified.executionStateKey,
          logicalTimeMs,
          signal: input.signal,
        });
        break;
      case "attest":
        record = await this.options.execution.attest({
          stateKey: verified.executionStateKey,
          logicalTimeMs,
          signal: input.signal,
        });
        break;
      case "enroll":
        record = await this.options.execution.verifyEnrollment({
          stateKey: verified.executionStateKey,
          logicalTimeMs,
        });
        break;
      case "activate":
        record = await this.options.execution.activateTeam({
          stateKey: verified.executionStateKey,
          logicalTimeMs,
        });
        break;
      case "commit_morphology":
        record = await this.options.execution.commitMorphology({
          stateKey: verified.executionStateKey,
          logicalTimeMs,
        });
        break;
      case "checkpoint":
        record = await this.options.execution.checkpoint({
          stateKey: verified.executionStateKey,
          logicalTimeMs,
        });
        break;
      case "fence":
        record = await this.options.execution.fenceAuthority({
          stateKey: verified.executionStateKey,
          logicalTimeMs,
        });
        break;
      case "drain":
        record = await this.options.execution.drain({
          stateKey: verified.executionStateKey,
          logicalTimeMs,
        });
        break;
      case "release_budget":
        record = await this.options.execution.releaseBudget({
          stateKey: verified.executionStateKey,
          logicalTimeMs,
        });
        break;
      case "evaluate": {
        if (!this.options.evaluation)
          return {
            status: "failed",
            reasonCode: "morphogenesis_evaluation_port_unavailable",
          };
        const evaluation = await this.options.evaluation.evaluate({
          binding: verified,
          logicalTimeMs,
        });
        record = await this.options.execution.complete({
          stateKey: verified.executionStateKey,
          disposition: evaluation.disposition,
          outcomeEvidenceDigests: evaluation.outcomeEvidenceDigests,
          logicalTimeMs,
        });
        break;
      }
      default:
        return {
          status: "failed",
          reasonCode: "morphogenesis_protected_stage_unsupported",
        };
    }
    return {
      status: "completed",
      resultReference: `morphogenesis:${record.stateKey}:${record.revision}`,
      resultDigest: record.recordDigest,
    };
  }
}

export interface MorphogenesisWorkflowLogicalClockV1 {
  resolve(isoLogicalTime: string): number;
}

export class MorphogenesisTaskExecutionBindingResolverV1
  implements TaskExecutionBindingResolverV1
{
  constructor(
    readonly options: {
      readonly policyDigest: `sha256:${string}`;
      readonly toolsetDigest: `sha256:${string}`;
      readonly runtimeImplementationDigest: `sha256:${string}`;
    },
  ) {
    for (const value of Object.values(options))
      if (!/^sha256:[0-9a-f]{64}$/u.test(value))
        fail("Morphogenesis task binding digest is invalid");
  }

  async resolve(input: {
    readonly stage: Extract<ProcessStageV1, { kind: "task" }>;
  }): Promise<TaskExecutionBindingInputV1> {
    if (
      !input.stage.taskDefinitionId.startsWith("agentplat.morphogenesis.") ||
      input.stage.taskDefinitionVersion !== "1"
    )
      fail("Morphogenesis task definition binding is invalid");
    return Object.freeze({
      policyDigest: this.options.policyDigest,
      toolsetDigest: this.options.toolsetDigest,
      runtimeImplementationDigest: this.options.runtimeImplementationDigest,
    });
  }
}

export class MorphogenesisDecisionGateProviderV1
  implements GateProviderPortV1
{
  constructor(
    readonly options: {
      readonly decisions: MorphogenesisDecisionRuntimeV1;
      readonly candidates: MorphogenesisDecisionCandidateResolutionPortV1;
      readonly clock: MorphogenesisWorkflowLogicalClockV1;
    },
  ) {}

  async resolve(input: ProcessGateRequestV1): Promise<ProcessGateResultV1> {
    if (input.gateType !== MORPHOGENESIS_DECISION_GATE_TYPE_V1)
      fail("morphogenesis decision gate type is invalid");
    const processInput = decisionProcessInput(input.processInput);
    const candidate = await this.options.candidates.resolve(
      processInput.candidateDigest,
    );
    if (
      !candidate ||
      candidate.candidateDigest !== processInput.candidateDigest ||
      candidate.decisionRoute !== processInput.decisionRoute
    )
      fail("morphogenesis decision candidate is unavailable or substituted");
    const logicalTimeMs = this.options.clock.resolve(input.logicalTime);
    const gateRequestId = `${input.runId}:${input.stageId}:${candidate.candidateId}`;
    if (logicalTimeMs >= candidate.expiresAtLogicalMs)
      return {
        status: "expired",
        gateRequestId,
        reasonCode: "morphogenesis_decision_expired",
      };
    const decision = await this.options.decisions.decide({
      candidate,
      logicalTimeMs,
    });
    if (!decision) return { status: "waiting", gateRequestId };
    return decision.authorization.disposition === "approved"
      ? { status: "approved", gateRequestId }
      : {
          status: "rejected",
          gateRequestId,
          reasonCode: "morphogenesis_decision_rejected",
        };
  }
}

export async function verifyMorphogenesisDecisionAfterGateV1(input: {
  readonly decisions: MorphogenesisDecisionRuntimeV1;
  readonly candidate: MorphogenesisDecisionCandidateV1;
  readonly logicalTimeMs: number;
}): Promise<MorphogenesisDecisionBindingV1> {
  const binding = await input.decisions.verifyRetained(input);
  if (!binding || binding.authorization.disposition !== "approved")
    fail("approved gate lacks a current exact Morphogenesis decision");
  return binding;
}

export function createMorphogenesisCatalogLifecycleProcessDefinitionV1(): ProcessDefinitionV1 {
  const task = (
    stageId: string,
    dependencies: readonly ProcessStageDependencyV1[],
  ): ProcessStageV1 => ({
    schemaVersion: 1,
    stageId,
    name: stageName(stageId),
    kind: "task",
    taskDefinitionId: `agentplat.morphogenesis.${stageId}.v1`,
    taskDefinitionVersion: "1",
    dependsOn: dependencies,
  });
  const compensate = (stageId: string): ProcessStageV1 => ({
    schemaVersion: 1,
    stageId: `compensate_${stageId}`,
    name: `Compensate ${stageName(stageId)}`,
    kind: "task",
    taskDefinitionId: `agentplat.morphogenesis.compensate-${stageId}.v1`,
    taskDefinitionVersion: "1",
    compensationForStageId: stageId,
    dependsOn: [],
  });
  const success = (stageId: string): readonly ProcessStageDependencyV1[] => [
    { stageId, outcomes: ["succeeded"] },
  ];
  return createProcessDefinitionV1({
    processId: MORPHOGENESIS_CATALOG_LIFECYCLE_PROCESS_ID_V1,
    version: MORPHOGENESIS_CATALOG_LIFECYCLE_PROCESS_VERSION_V1,
    name: "AgentPlat Morphogenesis catalog lifecycle V1",
    stages: [
      task("observe", []),
      task("assess", success("observe")),
      task("propose", success("assess")),
      {
        schemaVersion: 1,
        stageId: "decision_gate",
        name: "Morphogenesis decision",
        kind: "gate",
        gateType: MORPHOGENESIS_DECISION_GATE_TYPE_V1,
        gateDefinitionId: "agentplat.morphogenesis.decision-gate.v1",
        configuration: { source: "process_input" },
        dependsOn: success("propose"),
      },
      task("verify_decision", [
        { stageId: "decision_gate", outcomes: ["approved"] },
      ]),
      task("decision_rejected", [
        { stageId: "decision_gate", outcomes: ["rejected"] },
      ]),
      task("decision_expired", [
        { stageId: "decision_gate", outcomes: ["expired"] },
      ]),
      task("decision_failed", [
        { stageId: "decision_gate", outcomes: ["failed"] },
      ]),
      task("prepare", success("verify_decision")),
      task("provision", success("prepare")),
      task("attest", success("provision")),
      task("enroll", success("attest")),
      task("activate", success("enroll")),
      task("commit_morphology", success("activate")),
      {
        schemaVersion: 1,
        stageId: "await_outcome",
        name: "Await Morphogenesis outcome",
        kind: "await_signal",
        signalType: "agentplat.morphogenesis.outcome.v1",
        correlationKey: "morphogenesis",
        dependsOn: success("commit_morphology"),
      },
      task("checkpoint", [
        { stageId: "await_outcome", outcomes: ["signal_received"] },
      ]),
      task("fence", success("checkpoint")),
      task("drain", [
        { stageId: "fence", outcomes: ["succeeded"] },
      ]),
      task("release_budget", success("drain")),
      task("evaluate", success("release_budget")),
      compensate("prepare"),
      compensate("provision"),
      compensate("enroll"),
    ],
    cancellationTriggers: [
      {
        kind: "signal",
        signalType: "agentplat.morphogenesis.cancel.v1",
        correlationKey: "morphogenesis",
        reasonCode: "morphogenesis_cancelled",
      },
    ],
    limits: {
      maximumStages: 32,
      maximumDependenciesPerStage: 4,
      maximumDependentsPerStage: 8,
      maximumAttemptsPerTask: 8,
      maximumSignalBytes: 16_384,
      maximumRetainedSignals: 256,
      maximumTransitionsPerAdvance: 32,
      maximumRetainedOperations: 16_384,
      maximumRunDurationMs: 90 * 24 * 60 * 60 * 1_000,
      maximumGateDurationMs: 30 * 24 * 60 * 60 * 1_000,
    },
  });
}

export function createMorphogenesisCatalogLifecycleTaskDefinitionsV1(): readonly TaskDefinitionV1[] {
  const definition = createMorphogenesisCatalogLifecycleProcessDefinitionV1();
  return Object.freeze(
    definition.stages
      .filter(
        (stage): stage is Extract<ProcessStageV1, { kind: "task" }> =>
          stage.kind === "task",
      )
      .map((stage) => {
        const protectedEffect = new Set([
          "prepare",
          "provision",
          "enroll",
          "activate",
          "commit_morphology",
          "checkpoint",
          "fence",
          "drain",
          "release_budget",
          "compensate_prepare",
          "compensate_provision",
          "compensate_enroll",
        ]).has(stage.stageId);
        const common = {
          taskDefinitionId: stage.taskDefinitionId,
          version: stage.taskDefinitionVersion,
          name: stage.name,
          handlerKey: `agentplat.morphogenesis.handler.${stage.stageId}.v1`,
          handlerDigest: digestWorkflowJsonV1("morphogenesis-handler", {
            schemaVersion: 1,
            stageId: stage.stageId,
          }),
        };
        return protectedEffect
          ? createTaskDefinitionV1({
              ...common,
              effectClass: "protected_external",
              actionBinding: {
                namespace: "agentplat.morphogenesis",
                toolId: "morphogenesis",
                operation: stage.stageId,
              },
            })
          : createTaskDefinitionV1({
              ...common,
              effectClass: "internal",
            });
      }),
  );
}

function decisionProcessInput(input: JsonObject | undefined): {
  readonly candidateDigest: PlanningDigestV1;
  readonly decisionRoute: MorphogenesisDecisionRouteV1;
} {
  if (
    !input ||
    Object.keys(input).sort().join(",") !==
      "candidateDigest,decisionRoute" ||
    typeof input.candidateDigest !== "string" ||
    !/^sha256:[0-9a-f]{64}$/u.test(input.candidateDigest) ||
    !new Set([
      "local_policy",
      "authorized_agent",
      "authorized_person",
      "collective",
      "composite",
    ]).has(input.decisionRoute as string)
  )
    fail("Morphogenesis decision process input is invalid");
  return {
    candidateDigest: input.candidateDigest as PlanningDigestV1,
    decisionRoute: input.decisionRoute as MorphogenesisDecisionRouteV1,
  };
}

function stageName(stageId: string): string {
  return stageId
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function fail(message: string): never {
  throw new TypeError(message);
}

function identifier(value: unknown, label: string): AgentPlatID {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/+=-]{0,255}$/u.test(value)
  )
    fail(`${label} is invalid`);
  return value as AgentPlatID;
}

function digestValue(value: unknown, label: string): PlanningDigestV1 {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value))
    fail(`${label} is invalid`);
  return value as PlanningDigestV1;
}

function positiveInteger(value: unknown, label: string): number {
  const result = nonNegativeInteger(value, label);
  if (result < 1) fail(`${label} is invalid`);
  return result;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    fail(`${label} is invalid`);
  return value as number;
}
