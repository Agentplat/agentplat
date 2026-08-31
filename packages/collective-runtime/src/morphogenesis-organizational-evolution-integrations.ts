import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";
import type { MorphogenesisOrganizationalGovernanceStateV7 } from "./morphogenesis-organizational-evolution-governance.js";
import type { MorphogenesisOrganizationalExecutionStateV7 } from "./morphogenesis-organizational-evolution-runtime.js";
export interface MorphogenesisOrganizationalOwnerHandoffV7 {
  readonly schemaVersion: 7;
  readonly handoffId: AgentPlatID;
  readonly planDigest: PlanningDigestV1;
  readonly stepDigest: PlanningDigestV1;
  readonly owner:
    "morphogenesis" | "dynamic_topology" | "membership" | "work" | "action";
  readonly authorizationDigest: PlanningDigestV1;
  readonly sourceEpoch: number;
  readonly successorEpoch: number;
  readonly artifactDigest: PlanningDigestV1;
  readonly membershipGranted: false;
  readonly workGranted: false;
  readonly actionAuthorityGranted: false;
  readonly createdAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly handoffDigest: PlanningDigestV1;
}
export function createMorphogenesisOrganizationalOwnerHandoffV7(i: {
  readonly handoffId: AgentPlatID;
  readonly governance: MorphogenesisOrganizationalGovernanceStateV7;
  readonly stepId: AgentPlatID;
  readonly logicalTimeMs: number;
  readonly expiresAtLogicalMs: number;
}) {
  const g = i.governance;
  if (!["canary", "stable"].includes(g.status) || !g.authorizationDigest)
    fail("organizational owner handoff unavailable");
  const s = g.plan.steps.find((x) => x.stepId === i.stepId);
  if (!s) fail("organizational owner step unavailable");
  const b = freeze({
    schemaVersion: 7 as const,
    handoffId: id(i.handoffId),
    planDigest: g.plan.planDigest,
    stepDigest: s.stepDigest,
    owner: s.authorityOwner,
    authorizationDigest: g.authorizationDigest,
    sourceEpoch: g.plan.sourceEpoch,
    successorEpoch: g.plan.successorEpoch,
    artifactDigest: s.artifactDigest,
    membershipGranted: false as const,
    workGranted: false as const,
    actionAuthorityGranted: false as const,
    createdAtLogicalMs: nn(i.logicalTimeMs),
    expiresAtLogicalMs: pos(i.expiresAtLogicalMs),
  });
  if (b.expiresAtLogicalMs <= b.createdAtLogicalMs)
    fail("organizational handoff window invalid");
  return freeze({
    ...b,
    handoffDigest: digest("morphogenesis-organizational-owner-handoff-v7", b),
  });
}
export interface MorphogenesisOrganizationalLineageV7 {
  readonly schemaVersion: 7;
  readonly lineageId: AgentPlatID;
  readonly planDigest: PlanningDigestV1;
  readonly candidateDigest: PlanningDigestV1;
  readonly sourceTopologyDigest: PlanningDigestV1;
  readonly sourceEpoch: number;
  readonly successorEpoch: number;
  readonly authorizationDigest: PlanningDigestV1;
  readonly executionStateDigest: PlanningDigestV1;
  readonly appliedReceiptDigests: readonly PlanningDigestV1[];
  readonly compensationReceiptDigests: readonly PlanningDigestV1[];
  readonly finalStatus: string;
  readonly recordedAtLogicalMs: number;
  readonly grantsAuthority: false;
  readonly lineageDigest: PlanningDigestV1;
}
export function createMorphogenesisOrganizationalLineageV7(i: {
  readonly lineageId: AgentPlatID;
  readonly governance: MorphogenesisOrganizationalGovernanceStateV7;
  readonly execution: MorphogenesisOrganizationalExecutionStateV7;
  readonly logicalTimeMs: number;
}) {
  if (
    !i.governance.authorizationDigest ||
    i.execution.plan.planDigest !== i.governance.plan.planDigest ||
    i.execution.authorizationDigest !== i.governance.authorizationDigest
  )
    fail("organizational lineage binding invalid");
  const b = freeze({
    schemaVersion: 7 as const,
    lineageId: id(i.lineageId),
    planDigest: i.execution.plan.planDigest,
    candidateDigest: i.execution.plan.candidateDigest,
    sourceTopologyDigest: i.execution.plan.sourceTopologyDigest,
    sourceEpoch: i.execution.plan.sourceEpoch,
    successorEpoch: i.execution.plan.successorEpoch,
    authorizationDigest: i.execution.authorizationDigest,
    executionStateDigest: i.execution.stateDigest,
    appliedReceiptDigests: freeze(
      i.execution.appliedReceipts.map((x) => x.receiptDigest).sort(),
    ),
    compensationReceiptDigests: freeze(
      i.execution.compensationReceipts.map((x) => x.receiptDigest).sort(),
    ),
    finalStatus: i.execution.status,
    recordedAtLogicalMs: nn(i.logicalTimeMs),
    grantsAuthority: false as const,
  });
  return freeze({
    ...b,
    lineageDigest: digest("morphogenesis-organizational-lineage-v7", b),
  });
}
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u;
function id(v: unknown) {
  if (typeof v !== "string" || !ID.test(v))
    fail("organizational integration ID invalid");
  return v as AgentPlatID;
}
function pos(v: unknown) {
  if (!Number.isSafeInteger(v) || (v as number) < 1)
    fail("organizational integration integer invalid");
  return v as number;
}
function nn(v: unknown) {
  if (!Number.isSafeInteger(v) || (v as number) < 0)
    fail("organizational integration integer invalid");
  return v as number;
}
function digest(d: string, v: unknown): PlanningDigestV1 {
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
