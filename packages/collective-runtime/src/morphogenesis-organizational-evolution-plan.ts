import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";
import {
  validateMorphogenesisCompiledOperatorPlanV2,
  type MorphogenesisCompiledOperatorPlanV2,
} from "./morphogenesis-operator-compiler.js";
import {
  validateTeamTopologyTransformationRequestV1,
  type TeamTopologyTransformationRequestV1,
} from "./team-topology-transformation.js";
import { validateMorphogenesisOperationV1 } from "./morphogenesis-validation.js";
import type {
  MorphogenesisOperationV1,
  MorphogenesisOperatorV1,
  MorphogenesisPolicyRecordAnyV1,
} from "./morphogenesis-contracts.js";
import type { MorphogenesisOrganizationalCandidateV7 } from "./morphogenesis-organizational-evolution.js";

export type MorphogenesisOrganizationalArtifactV7 =
  | {
      readonly kind: "compiled_operator_v2";
      readonly plan: MorphogenesisCompiledOperatorPlanV2;
      readonly context: Parameters<
        typeof validateMorphogenesisCompiledOperatorPlanV2
      >[1];
    }
  | {
      readonly kind: "topology_request_v1";
      readonly request: TeamTopologyTransformationRequestV1;
    }
  | {
      readonly kind: "governed_operation_v1";
      readonly operation: MorphogenesisOperationV1;
      readonly policy: MorphogenesisPolicyRecordAnyV1;
    };
export interface MorphogenesisOrganizationalPlanStepV7 {
  readonly schemaVersion: 7;
  readonly stepId: AgentPlatID;
  readonly operator: MorphogenesisOperatorV1;
  readonly artifactKind: MorphogenesisOrganizationalArtifactV7["kind"];
  readonly artifactDigest: PlanningDigestV1;
  readonly authorityOwner:
    "morphogenesis" | "dynamic_topology" | "membership" | "work" | "action";
  readonly dependsOnStepIds: readonly AgentPlatID[];
  readonly compensationRequired: boolean;
  readonly stepDigest: PlanningDigestV1;
}
export interface MorphogenesisOrganizationalEvolutionPlanV7 {
  readonly schemaVersion: 7;
  readonly planId: AgentPlatID;
  readonly candidateDigest: PlanningDigestV1;
  readonly sourceTopologyDigest: PlanningDigestV1;
  readonly sourceEpoch: number;
  readonly successorEpoch: number;
  readonly steps: readonly MorphogenesisOrganizationalPlanStepV7[];
  readonly continuityPlanDigest: PlanningDigestV1;
  readonly rollbackPlanDigest: PlanningDigestV1;
  readonly compiledAtLogicalMs: number;
  readonly advisoryOnly: true;
  readonly planDigest: PlanningDigestV1;
}
export function createMorphogenesisOrganizationalEvolutionPlanV7(input: {
  readonly planId: AgentPlatID;
  readonly candidate: MorphogenesisOrganizationalCandidateV7;
  readonly sourceTopologyDigest: PlanningDigestV1;
  readonly sourceEpoch: number;
  readonly artifacts: readonly {
    readonly stepId: AgentPlatID;
    readonly artifact: MorphogenesisOrganizationalArtifactV7;
    readonly authorityOwner: MorphogenesisOrganizationalPlanStepV7["authorityOwner"];
    readonly dependsOnStepIds: readonly AgentPlatID[];
    readonly compensationRequired: boolean;
  }[];
  readonly compiledAtLogicalMs: number;
}) {
  const steps = input.artifacts.map((x) => step(x));
  const ids = new Set(steps.map((x) => x.stepId));
  if (
    ids.size !== steps.length ||
    steps.some((x) =>
      x.dependsOnStepIds.some((d) => !ids.has(d) || d === x.stepId),
    )
  )
    fail("organizational plan DAG invalid");
  assertAcyclic(steps);
  const operators = new Set(steps.map((x) => x.operator));
  if (
    input.candidate.operators.some((x) => !operators.has(x)) ||
    steps.some((x) => !input.candidate.operators.includes(x.operator))
  )
    fail("organizational plan does not cover candidate operators");
  const body = freeze({
    schemaVersion: 7 as const,
    planId: id(input.planId),
    candidateDigest: input.candidate.candidateDigest,
    sourceTopologyDigest: sha(input.sourceTopologyDigest),
    sourceEpoch: pos(input.sourceEpoch),
    successorEpoch: pos(input.sourceEpoch) + 1,
    steps: freeze(steps),
    continuityPlanDigest: input.candidate.continuityPlanDigest,
    rollbackPlanDigest: input.candidate.rollbackPlanDigest,
    compiledAtLogicalMs: nonneg(input.compiledAtLogicalMs),
    advisoryOnly: true as const,
  });
  return freeze({
    ...body,
    planDigest: digest("morphogenesis-organizational-evolution-plan-v7", body),
  });
}
export function validateMorphogenesisOrganizationalEvolutionPlanV7(
  v: MorphogenesisOrganizationalEvolutionPlanV7,
) {
  if (
    v.schemaVersion !== 7 ||
    v.advisoryOnly !== true ||
    v.successorEpoch !== v.sourceEpoch + 1
  )
    fail("organizational plan epoch invalid");
  const names = new Set(v.steps.map((x) => x.stepId));
  if (names.size !== v.steps.length)
    fail("organizational plan steps duplicated");
  for (const s of v.steps) {
    const { stepDigest, ...b } = s;
    if (
      stepDigest !== digest("morphogenesis-organizational-plan-step-v7", b) ||
      s.dependsOnStepIds.some((x) => !names.has(x))
    )
      fail("organizational plan step invalid");
  }
  assertAcyclic(v.steps);
  const { planDigest, ...body } = v;
  if (
    planDigest !==
    digest("morphogenesis-organizational-evolution-plan-v7", body)
  )
    fail("organizational plan digest invalid");
  return freeze(structuredClone(v));
}
function step(x: {
  readonly stepId: AgentPlatID;
  readonly artifact: MorphogenesisOrganizationalArtifactV7;
  readonly authorityOwner: MorphogenesisOrganizationalPlanStepV7["authorityOwner"];
  readonly dependsOnStepIds: readonly AgentPlatID[];
  readonly compensationRequired: boolean;
}) {
  let operator: MorphogenesisOperatorV1, artifactDigest: PlanningDigestV1;
  if (x.artifact.kind === "compiled_operator_v2") {
    const p = validateMorphogenesisCompiledOperatorPlanV2(
      x.artifact.plan,
      x.artifact.context,
    );
    operator = p.operator;
    artifactDigest = p.planDigest;
  } else if (x.artifact.kind === "topology_request_v1") {
    const r = validateTeamTopologyTransformationRequestV1(x.artifact.request);
    operator = `${r.operation}_team` as MorphogenesisOperatorV1;
    artifactDigest = r.requestDigest;
  } else {
    const o = validateMorphogenesisOperationV1(
      x.artifact.operation,
      x.artifact.policy,
    );
    operator = o.operator;
    artifactDigest = o.operationDigest;
  }
  const body = freeze({
    schemaVersion: 7 as const,
    stepId: id(x.stepId),
    operator,
    artifactKind: x.artifact.kind,
    artifactDigest,
    authorityOwner: x.authorityOwner,
    dependsOnStepIds: freeze([...new Set(x.dependsOnStepIds)].sort()),
    compensationRequired: Boolean(x.compensationRequired),
  });
  return freeze({
    ...body,
    stepDigest: digest("morphogenesis-organizational-plan-step-v7", body),
  });
}
function assertAcyclic(s: readonly MorphogenesisOrganizationalPlanStepV7[]) {
  const m = new Map(s.map((x) => [x.stepId, x.dependsOnStepIds]));
  const done = new Set<string>(),
    active = new Set<string>();
  const visit = (x: string) => {
    if (active.has(x)) fail("organizational plan cycle");
    if (done.has(x)) return;
    active.add(x);
    for (const d of m.get(x) ?? []) visit(d);
    active.delete(x);
    done.add(x);
  };
  for (const x of m.keys()) visit(x);
}
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u,
  SHA = /^sha256:[0-9a-f]{64}$/u;
function id(v: unknown) {
  if (typeof v !== "string" || !ID.test(v))
    fail("organizational plan ID invalid");
  return v as AgentPlatID;
}
function sha(v: unknown) {
  if (typeof v !== "string" || !SHA.test(v))
    fail("organizational plan digest invalid");
  return v as PlanningDigestV1;
}
function pos(v: unknown) {
  if (!Number.isSafeInteger(v) || (v as number) < 1)
    fail("organizational epoch invalid");
  return v as number;
}
function nonneg(v: unknown) {
  if (!Number.isSafeInteger(v) || (v as number) < 0)
    fail("organizational time invalid");
  return v as number;
}
function digest(d: string, v: unknown) {
  return digestPlanningJsonV1(d as never, v as PlanningJson);
}
function freeze<T>(v: T): T {
  if (v && typeof v === "object" && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const x of Object.values(v as Record<string, unknown>)) freeze(x);
  }
  return v;
}
function fail(m: string): never {
  throw new TypeError(m);
}
