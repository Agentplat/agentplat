import {
  digestPlanningJsonV1,
  type PlanningDigestDomainV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";

import {
  COORDINATION_CONTROL_ACTIONS_V1,
  type CoordinationControlScopeV1,
} from "./coordination-control-contracts.js";
import {
  COORDINATION_CONTROL_GUARANTEE_SCHEMA_VERSION_V1,
  COORDINATION_CONTROL_GUARANTEE_STATE_FORMAT_V1,
  type CoordinationControlGuaranteePolicyV1,
  type CoordinationControlGuaranteeProposalV1,
  type CoordinationControlGuaranteeExecutionReceiptV1,
  type CoordinationControlGuaranteeOutboxRecordV1,
  type CoordinationControlGuaranteeStateV1,
  type CoordinationControlGuaranteeV1,
  type CoordinationControlTargetV1,
} from "./coordination-control-guarantees-contracts.js";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const BPS = 10_000;

export function createCoordinationControlGuaranteeV1(
  input: Omit<CoordinationControlGuaranteeV1, "guaranteeDigest">,
): CoordinationControlGuaranteeV1 {
  assertGuarantee(input);
  const body = { ...input, schemaVersion: COORDINATION_CONTROL_GUARANTEE_SCHEMA_VERSION_V1 } as CoordinationControlGuaranteeV1;
  return freeze({ ...body, guaranteeDigest: digest("mission-observation", body) });
}

export function validateCoordinationControlGuaranteeV1(input: unknown): CoordinationControlGuaranteeV1 {
  object(input, "control guarantee");
  const value = input as unknown as CoordinationControlGuaranteeV1;
  assertGuarantee(value);
  const { guaranteeDigest, ...body } = value;
  if (guaranteeDigest !== digest("mission-observation", body)) fail("control guarantee digest is invalid");
  return freezeGuarantee(value);
}

export function createCoordinationControlTargetV1(
  input: Omit<CoordinationControlTargetV1, "targetDigest">,
): CoordinationControlTargetV1 {
  assertTarget(input);
  const body = { ...input, schemaVersion: COORDINATION_CONTROL_GUARANTEE_SCHEMA_VERSION_V1 } as CoordinationControlTargetV1;
  return freeze({ ...body, targetDigest: digest("plan-selection-policy", body) });
}

export function validateCoordinationControlTargetV1(input: unknown): CoordinationControlTargetV1 {
  object(input, "control target");
  const value = input as unknown as CoordinationControlTargetV1;
  assertTarget(value);
  const { targetDigest, ...body } = value;
  if (targetDigest !== digest("plan-selection-policy", body)) fail("control target digest is invalid");
  return freezeTarget(value);
}

export function createCoordinationControlGuaranteeProposalV1(
  input: Omit<CoordinationControlGuaranteeProposalV1, "proposalDigest">,
): CoordinationControlGuaranteeProposalV1 {
  assertProposal(input);
  const body = { ...input, schemaVersion: COORDINATION_CONTROL_GUARANTEE_SCHEMA_VERSION_V1 } as CoordinationControlGuaranteeProposalV1;
  return freeze({ ...body, proposalDigest: digest("proposal-identity", body) });
}

export function validateCoordinationControlGuaranteeProposalV1(input: unknown): CoordinationControlGuaranteeProposalV1 {
  object(input, "control guarantee proposal");
  const value = input as unknown as CoordinationControlGuaranteeProposalV1;
  assertProposal(value);
  const { proposalDigest, ...body } = value;
  if (proposalDigest !== digest("proposal-identity", body)) fail("control guarantee proposal digest is invalid");
  return freeze({ ...value, scope: freezeScope(value.scope), reasonCodes: freeze([...value.reasonCodes]) });
}

export function createCoordinationControlGuaranteeExecutionReceiptV1(
  input: Omit<CoordinationControlGuaranteeExecutionReceiptV1, "receiptDigest">,
): CoordinationControlGuaranteeExecutionReceiptV1 {
  assertExecutionReceipt(input);
  const body: Omit<
    CoordinationControlGuaranteeExecutionReceiptV1,
    "receiptDigest"
  > = {
    ...input,
    schemaVersion: COORDINATION_CONTROL_GUARANTEE_SCHEMA_VERSION_V1,
    scope: freezeScope(input.scope),
    controlBinding: freeze({ ...input.controlBinding }),
  };
  return freeze({
    ...body,
    receiptDigest: digest("proposal-identity", {
      recordKind: "coordination-control-guarantee-execution-receipt",
      ...body,
    }),
  });
}

export function validateCoordinationControlGuaranteeExecutionReceiptV1(
  input: unknown,
): CoordinationControlGuaranteeExecutionReceiptV1 {
  object(input, "control guarantee execution receipt");
  const value = input as unknown as CoordinationControlGuaranteeExecutionReceiptV1;
  assertExecutionReceipt(value);
  const { receiptDigest, ...body } = value;
  if (
    receiptDigest !==
    digest("proposal-identity", {
      recordKind: "coordination-control-guarantee-execution-receipt",
      ...body,
    })
  )
    fail("control guarantee execution receipt digest is invalid");
  return freeze({
    ...value,
    scope: freezeScope(value.scope),
    controlBinding: freeze({ ...value.controlBinding }),
  });
}

export function coordinationControlGuaranteeStateDigestV1(
  state: Omit<CoordinationControlGuaranteeStateV1, "stateDigest">,
): PlanningDigestV1 {
  return digest("collective-planning-snapshot", state);
}

export function createCoordinationControlGuaranteePolicyV1(
  input: Omit<CoordinationControlGuaranteePolicyV1, "policyDigest">,
): CoordinationControlGuaranteePolicyV1 {
  assertPolicy(input);
  const body = { ...input, schemaVersion: COORDINATION_CONTROL_GUARANTEE_SCHEMA_VERSION_V1 } as CoordinationControlGuaranteePolicyV1;
  return freeze({ ...body, policyDigest: digest("plan-selection-policy", body) });
}

export function validateCoordinationControlGuaranteePolicyV1(input: unknown): CoordinationControlGuaranteePolicyV1 {
  object(input, "control guarantee policy");
  const value = input as unknown as CoordinationControlGuaranteePolicyV1;
  assertPolicy(value);
  const { policyDigest, ...body } = value;
  if (policyDigest !== digest("plan-selection-policy", body)) fail("control guarantee policy digest is invalid");
  return freeze({ ...value });
}

export function validateCoordinationControlGuaranteeStateV1(input: unknown): CoordinationControlGuaranteeStateV1 {
  object(input, "control guarantee state");
  const value = input as unknown as CoordinationControlGuaranteeStateV1;
  if (value.format !== COORDINATION_CONTROL_GUARANTEE_STATE_FORMAT_V1) fail("control guarantee state format is invalid");
  schema(value.schemaVersion); id(value.stateKey, "state key"); scope(value.scope); sha(value.policyDigest, "state policy digest"); nonnegative(value.revision, "state revision"); nonnegative(value.logicalTimeHighWaterMs, "state logical time");
  head(value.guaranteeHead, "guarantee head"); head(value.targetHead, "target head");
  const guarantee = value.latestGuarantee === null ? null : validateCoordinationControlGuaranteeV1(value.latestGuarantee);
  const target = value.latestTarget === null ? null : validateCoordinationControlTargetV1(value.latestTarget);
  if (guarantee && !sameScope(guarantee.scope, value.scope)) fail("state guarantee scope is invalid");
  if (target && !sameScope(target.scope, value.scope)) fail("state target scope is invalid");
  if ((value.guaranteeHead === null) !== (guarantee === null) || (value.targetHead === null) !== (target === null)) fail("state source head is invalid");
  if (value.guaranteeHead && (!guarantee || value.guaranteeHead.sourceId !== guarantee.controlId || value.guaranteeHead.sourceRevision !== guarantee.sourceRevision || value.guaranteeHead.sourceRecordDigest !== guarantee.sourceRecordDigest || value.guaranteeHead.recordDigest !== guarantee.guaranteeDigest)) fail("state guarantee head is invalid");
  if (value.targetHead && (!target || value.targetHead.sourceId !== target.planningId || value.targetHead.sourceRevision !== target.planningRevision || value.targetHead.sourceRecordDigest !== target.planningRecordDigest || value.targetHead.recordDigest !== target.targetDigest)) fail("state target head is invalid");
  const lastProposal = value.lastProposal === null ? null : validateCoordinationControlGuaranteeProposalV1(value.lastProposal);
  if (lastProposal && !sameScope(lastProposal.scope, value.scope)) fail("state proposal scope is invalid");
  if (lastProposal && lastProposal.evaluatedAtLogicalMs > value.logicalTimeHighWaterMs) fail("state proposal time exceeds logical time");
  if (!Array.isArray(value.outbox)) fail("state outbox is invalid");
  const ids = new Set<string>();
  const outbox = value.outbox.map((item) => {
    object(item, "state outbox record"); const proposal = validateCoordinationControlGuaranteeProposalV1(item.proposal);
    const receipt = item.receipt === null ? null : validateCoordinationControlGuaranteeExecutionReceiptV1(item.receipt);
    const status = item.status;
    if (
      !sameScope(proposal.scope, value.scope) ||
      (status !== "pending" && status !== "delivered" && status !== "expired")
    ) fail("state outbox record is invalid");
    const validatedStatus = status as CoordinationControlGuaranteeOutboxRecordV1["status"];
    if (proposal.evaluatedAtLogicalMs > value.logicalTimeHighWaterMs) fail("state outbox proposal time exceeds logical time");
    if ((status === "delivered") !== (receipt !== null)) fail("state outbox delivery receipt is invalid");
    if (receipt && !executionReceiptMatchesProposal(receipt, proposal)) fail("state outbox delivery receipt binding is invalid");
    if (ids.has(proposal.proposalId)) fail("state outbox proposals must be unique"); ids.add(proposal.proposalId);
    return freeze({ proposal, status: validatedStatus, receipt });
  });
  if ((value.predecessorStateDigest === null) !== (value.revision === 0)) fail("state predecessor is invalid");
  if (value.predecessorStateDigest !== null) sha(value.predecessorStateDigest, "state predecessor digest");
  const { stateDigest, ...body } = value;
  if (stateDigest !== coordinationControlGuaranteeStateDigestV1(body)) fail("control guarantee state digest is invalid");
  return freeze({ ...value, scope: freezeScope(value.scope), latestGuarantee: guarantee, latestTarget: target, lastProposal, outbox: freeze(outbox) });
}

function assertGuarantee(value: Omit<CoordinationControlGuaranteeV1, "guaranteeDigest"> | CoordinationControlGuaranteeV1): void {
  schema(value.schemaVersion); id(value.guaranteeId, "guarantee ID"); scope(value.scope); id(value.controlId, "control ID"); positive(value.controlVersion, "control version"); id(value.implementationId, "implementation ID"); nonnegative(value.sourceRevision, "guarantee source revision"); sha(value.sourceRecordDigest, "guarantee source record digest");
  positive(value.coherenceHorizonMs, "coherence horizon"); metrics(value); assumptions(value.contextAssumptionDigests, "context assumptions"); assumptions(value.threatAssumptionDigests, "threat assumptions"); assumptions(value.supportedCheckpointDigests, "supported checkpoints"); actions(value.supportedActions, "supported actions"); window(value.observedAtLogicalMs, value.validUntilLogicalMs, "guarantee");
}
function assertTarget(value: Omit<CoordinationControlTargetV1, "targetDigest"> | CoordinationControlTargetV1): void {
  schema(value.schemaVersion); id(value.targetId, "target ID"); scope(value.scope); id(value.planningId, "planning ID"); nonnegative(value.planningRevision, "planning revision"); sha(value.planningRecordDigest, "planning record digest"); positive(value.plannedHorizonMs, "planned horizon"); metrics(value); assumptions(value.requiredContextAssumptionDigests, "required context assumptions"); assumptions(value.requiredThreatAssumptionDigests, "required threat assumptions"); assumptions(value.requiredCheckpointDigests, "required checkpoints"); actions(value.requiredActions, "required actions"); window(value.issuedAtLogicalMs, value.validUntilLogicalMs, "target");
}
function assertProposal(value: Omit<CoordinationControlGuaranteeProposalV1, "proposalDigest"> | CoordinationControlGuaranteeProposalV1): void {
  schema(value.schemaVersion); id(value.proposalId, "proposal ID"); scope(value.scope);
  if (!["admitted", "replan_required", "blocked"].includes(value.status)) fail("proposal status is invalid");
  if (value.disposition !== "allow" && value.disposition !== "deny") fail("proposal disposition is invalid");
  if (!["continue", "pause_dispatch", "request_replanning"].includes(value.action)) fail("proposal action is invalid");
  if ((value.status === "admitted") !== (value.disposition === "allow" && value.action === "continue")) fail("proposal admission is invalid");
  if (value.status === "blocked" && (value.disposition !== "deny" || value.action !== "pause_dispatch")) fail("blocked proposal is invalid");
  if (value.status === "replan_required" && (value.disposition !== "deny" || value.action !== "request_replanning")) fail("replanning proposal is invalid");
  nonnegative(value.effectivePlanningWindowMs, "effective planning window"); if (value.status === "admitted" ? value.effectivePlanningWindowMs < 1 : value.effectivePlanningWindowMs !== 0) fail("proposal planning window is invalid");
  nullableDigest(value.guaranteeDigest, "proposal guarantee digest"); nullableDigest(value.targetDigest, "proposal target digest");
  if (!Array.isArray(value.reasonCodes) || value.reasonCodes.length < 1 || value.reasonCodes.some((item) => typeof item !== "string" || !ID.test(item))) fail("proposal reasons are invalid");
  window(value.evaluatedAtLogicalMs, value.expiresAtLogicalMs, "proposal");
}
function assertExecutionReceipt(value: Omit<CoordinationControlGuaranteeExecutionReceiptV1, "receiptDigest"> | CoordinationControlGuaranteeExecutionReceiptV1): void {
  schema(value.schemaVersion); id(value.receiptId, "execution receipt ID"); id(value.proposalId, "execution receipt proposal ID"); sha(value.proposalDigest, "execution receipt proposal digest"); scope(value.scope); object(value.controlBinding, "execution receipt control binding"); id(value.controlBinding.controlId, "execution receipt control ID"); positive(value.controlBinding.controlVersion, "execution receipt control version"); id(value.controlBinding.implementationId, "execution receipt implementation ID"); nonnegative(value.deliveredAtLogicalMs, "execution receipt delivery time");
}
export function executionReceiptMatchesProposal(
  receipt: CoordinationControlGuaranteeExecutionReceiptV1,
  proposal: CoordinationControlGuaranteeProposalV1,
): boolean {
  return receipt.proposalId === proposal.proposalId && receipt.proposalDigest === proposal.proposalDigest && sameScope(receipt.scope, proposal.scope) && receipt.deliveredAtLogicalMs >= proposal.evaluatedAtLogicalMs && receipt.deliveredAtLogicalMs < proposal.expiresAtLogicalMs;
}
function assertPolicy(value: Omit<CoordinationControlGuaranteePolicyV1, "policyDigest"> | CoordinationControlGuaranteePolicyV1): void {
  schema(value.schemaVersion); id(value.policyId, "policy ID"); positive(value.policyVersion, "policy version");
  nonnegative(value.maximumGuaranteeAgeMs, "maximum guarantee age"); nonnegative(value.maximumTargetAgeMs, "maximum target age");
  positive(value.maximumProposalTtlMs, "maximum proposal ttl"); positive(value.maximumOutboxRecords, "maximum outbox records"); positive(value.maximumCommitAttempts, "maximum commit attempts");
}
function metrics(value: object): void {
  const record = value as Record<string, unknown>;
  for (const key of ["alignmentBps", "coherenceBps", "agilityBps", "confidenceBps", "riskBps", "uncertaintyBps", "minimumAlignmentBps", "minimumCoherenceBps", "minimumAgilityBps", "minimumConfidenceBps", "maximumRiskBps", "maximumUncertaintyBps"]) if (key in record) bps(record[key], key);
}
function assumptions(values: unknown, label: string): void { if (!Array.isArray(values)) fail(`${label} are invalid`); const seen = new Set<string>(); for (const value of values) { sha(value, label); if (seen.has(value)) fail(`${label} must be unique`); seen.add(value); } }
function actions(values: unknown, label: string): void { if (!Array.isArray(values) || values.length < 1) fail(`${label} are invalid`); const seen = new Set<string>(); for (const value of values) { if (!(COORDINATION_CONTROL_ACTIONS_V1 as readonly string[]).includes(value as string) || seen.has(value as string)) fail(`${label} are invalid`); seen.add(value as string); } }
function head(value: unknown, label: string): void { if (value === null) return; object(value, label); const headValue = value as { sourceId: unknown; sourceRevision: unknown; sourceRecordDigest: unknown; recordDigest: unknown }; id(headValue.sourceId, `${label} source ID`); nonnegative(headValue.sourceRevision, `${label} revision`); sha(headValue.sourceRecordDigest, `${label} source digest`); sha(headValue.recordDigest, `${label} record digest`); }
function scope(value: CoordinationControlScopeV1): void { object(value, "scope"); id(value.tenantId, "scope tenant ID"); id(value.coordinationId, "scope coordination ID"); id(value.missionIntentId, "scope mission intent ID"); if (value.teamId !== null) id(value.teamId, "scope team ID"); if (value.workItemId !== null) id(value.workItemId, "scope work item ID"); }
function freezeScope(value: CoordinationControlScopeV1): CoordinationControlScopeV1 { return freeze({ ...value }); }
function sameScope(left: CoordinationControlScopeV1, right: CoordinationControlScopeV1): boolean { return left.tenantId === right.tenantId && left.coordinationId === right.coordinationId && left.missionIntentId === right.missionIntentId && left.teamId === right.teamId && left.workItemId === right.workItemId; }
function freezeGuarantee(value: CoordinationControlGuaranteeV1): CoordinationControlGuaranteeV1 { return freeze({ ...value, scope: freezeScope(value.scope), contextAssumptionDigests: freeze([...value.contextAssumptionDigests]), threatAssumptionDigests: freeze([...value.threatAssumptionDigests]), supportedCheckpointDigests: freeze([...value.supportedCheckpointDigests]), supportedActions: freeze([...value.supportedActions]) }); }
function freezeTarget(value: CoordinationControlTargetV1): CoordinationControlTargetV1 { return freeze({ ...value, scope: freezeScope(value.scope), requiredContextAssumptionDigests: freeze([...value.requiredContextAssumptionDigests]), requiredThreatAssumptionDigests: freeze([...value.requiredThreatAssumptionDigests]), requiredCheckpointDigests: freeze([...value.requiredCheckpointDigests]), requiredActions: freeze([...value.requiredActions]) }); }
function digest(domain: PlanningDigestDomainV1, value: unknown): PlanningDigestV1 { return digestPlanningJsonV1(domain, value as PlanningJson); }
function schema(value: unknown): void { if (value !== 1) fail("unsupported schema version"); }
function id(value: unknown, label: string): asserts value is string { if (typeof value !== "string" || !ID.test(value)) fail(`${label} is invalid`); }
function sha(value: unknown, label: string): asserts value is PlanningDigestV1 { if (typeof value !== "string" || !DIGEST.test(value)) fail(`${label} is invalid`); }
function nullableDigest(value: unknown, label: string): void { if (value !== null) sha(value, label); }
function bps(value: unknown, label: string): void { if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > BPS) fail(`${label} must be a basis-point value`); }
function positive(value: unknown, label: string): void { if (!Number.isSafeInteger(value) || (value as number) < 1) fail(`${label} must be positive`); }
function nonnegative(value: unknown, label: string): void { if (!Number.isSafeInteger(value) || (value as number) < 0) fail(`${label} must be non-negative`); }
function window(start: unknown, end: unknown, label: string): void { nonnegative(start, `${label} start`); if (!Number.isSafeInteger(end) || (end as number) <= (start as number)) fail(`${label} validity window is invalid`); }
function object(value: unknown, label: string): asserts value is Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`); }
function freeze<T>(value: T): Readonly<T> { return Object.freeze(value); }
function fail(message: string): never { throw new TypeError(message); }
