import {
  digestPlanningJsonV1,
  type PlanningDigestDomainV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";

import {
  MORPHOGENESIS_DECISION_ROUTES_V1,
  MORPHOGENESIS_FIRST_RELEASE_OPERATORS_V1,
  MORPHOGENESIS_OPERATORS_V1,
  MORPHOGENESIS_REASON_CODES_V1,
  MORPHOGENESIS_SCHEMA_VERSION_V1,
  MORPHOLOGY_COMPONENT_KINDS_V1,
  MORPHOLOGY_HEAD_STATE_FORMAT_V1,
  MORPHOLOGY_SOURCE_CLASSES_V1,
  type MorphogenesisBudgetEnvelopeV1,
  type MorphogenesisCurrencyAmountV1,
  type MorphogenesisNeedV1,
  type MorphogenesisOperationV1,
  type MorphogenesisPolicyRecordV1,
  type MorphogenesisPolicyV1,
  type MorphogenesisProposalV1,
  type MorphogenesisScopeV1,
  type MorphologyComponentReferenceV1,
  type MorphologyHeadV1,
  type MorphologySnapshotV1,
  type MorphologySourceHeadV1,
  type TargetMorphologyAgentDispositionV1,
  type TargetMorphologyPositionV1,
  type TargetMorphologyV1,
} from "./morphogenesis-contracts.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/+-= ]{0,511}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const CURRENCY = /^[A-Z][A-Z0-9]{2,11}$/u;
const sourceClasses = new Set<string>(MORPHOLOGY_SOURCE_CLASSES_V1);
const componentKinds = new Set<string>(MORPHOLOGY_COMPONENT_KINDS_V1);
const reasonCodes = new Set<string>(MORPHOGENESIS_REASON_CODES_V1);
const decisionRoutes = new Set<string>(MORPHOGENESIS_DECISION_ROUTES_V1);
const operators = new Set<string>(MORPHOGENESIS_OPERATORS_V1);
const firstReleaseOperators = new Set<string>(
  MORPHOGENESIS_FIRST_RELEASE_OPERATORS_V1,
);
const fillModes = new Set([
  "retain_current",
  "recruit_existing",
  "instantiate_catalog",
]);
const dispositions = new Set([
  "retain",
  "rebind",
  "drain",
  "detach",
  "suspend",
  "retire",
]);
const effectClasses = new Set(["internal", "protected_external"]);
const compensations = new Set([
  "none",
  "release_budget",
  "terminate_unenrolled",
  "detach_successor",
  "restore_predecessor_before_commit",
]);

export function createMorphogenesisPolicyV1(
  input: MorphogenesisPolicyV1,
): MorphogenesisPolicyRecordV1 {
  const policy = normalizePolicy(input);
  return freeze({
    schemaVersion: 1,
    policy,
    policyDigest: digest("morphogenesis-policy", policy),
  });
}

export function validateMorphogenesisPolicyV1(
  input: unknown,
): MorphogenesisPolicyRecordV1 {
  const value = exact(
    input,
    ["policy", "policyDigest", "schemaVersion"],
    "morphogenesis policy record",
  );
  schema(value.schemaVersion, "morphogenesis policy record");
  const result = createMorphogenesisPolicyV1(
    value.policy as MorphogenesisPolicyV1,
  );
  if (value.policyDigest !== result.policyDigest)
    fail("morphogenesis policy digest is invalid");
  return result;
}

export function createMorphogenesisScopeV1(
  input: Omit<MorphogenesisScopeV1, "schemaVersion" | "scopeDigest">,
): MorphogenesisScopeV1 {
  if ((input.workItemId === null) !== (input.workItemRevision === null))
    fail("morphogenesis Work scope is incomplete");
  const body = freeze({
    schemaVersion: 1 as const,
    tenantId: id(input.tenantId, "scope tenant ID"),
    morphologyId: id(input.morphologyId, "morphology ID"),
    policyDomainId: id(input.policyDomainId, "policy domain ID"),
    missionId: id(input.missionId, "mission ID"),
    missionIntentId: id(input.missionIntentId, "mission intent ID"),
    objectiveId: id(input.objectiveId, "Objective ID"),
    meshId: nullableId(input.meshId, "Mesh ID"),
    roomId: nullableId(input.roomId, "Room ID"),
    workItemId: nullableId(input.workItemId, "Work Item ID"),
    workItemRevision:
      input.workItemRevision === null
        ? null
        : positive(input.workItemRevision, "Work Item revision"),
  });
  return freeze({
    ...body,
    scopeDigest: digest("morphogenesis-scope", body),
  });
}

export function validateMorphogenesisScopeV1(
  input: unknown,
): MorphogenesisScopeV1 {
  const value = exact(
    input,
    [
      "meshId",
      "missionId",
      "missionIntentId",
      "morphologyId",
      "objectiveId",
      "policyDomainId",
      "roomId",
      "schemaVersion",
      "scopeDigest",
      "tenantId",
      "workItemId",
      "workItemRevision",
    ],
    "morphogenesis scope",
  );
  schema(value.schemaVersion, "morphogenesis scope");
  const result = createMorphogenesisScopeV1({
    tenantId: value.tenantId as AgentPlatID,
    morphologyId: value.morphologyId as AgentPlatID,
    policyDomainId: value.policyDomainId as AgentPlatID,
    missionId: value.missionId as AgentPlatID,
    missionIntentId: value.missionIntentId as AgentPlatID,
    objectiveId: value.objectiveId as AgentPlatID,
    meshId: value.meshId as AgentPlatID | null,
    roomId: value.roomId as AgentPlatID | null,
    workItemId: value.workItemId as AgentPlatID | null,
    workItemRevision: value.workItemRevision as number | null,
  });
  if (value.scopeDigest !== result.scopeDigest)
    fail("morphogenesis scope digest is invalid");
  return result;
}

export function createMorphologySourceHeadV1(
  input: Omit<MorphologySourceHeadV1, "schemaVersion" | "sourceHeadDigest">,
): MorphologySourceHeadV1 {
  if (!sourceClasses.has(input.sourceClass))
    fail("morphology source class is invalid");
  const body = freeze({
    schemaVersion: 1 as const,
    sourceHeadId: id(input.sourceHeadId, "source head ID"),
    sourceClass: input.sourceClass,
    sourceId: id(input.sourceId, "source ID"),
    sourceVersion: positive(input.sourceVersion, "source version"),
    sourceImplementationDigest: sha(
      input.sourceImplementationDigest,
      "source implementation digest",
    ),
    sourceRevision: nonNegative(input.sourceRevision, "source revision"),
    sourceRecordDigest: sha(input.sourceRecordDigest, "source record digest"),
    scopeDigest: sha(input.scopeDigest, "source scope digest"),
    authenticationEvidenceDigest: sha(
      input.authenticationEvidenceDigest,
      "source authentication evidence digest",
    ),
    required: bool(input.required, "source required flag"),
    observedAtLogicalMs: nonNegative(
      input.observedAtLogicalMs,
      "source observation time",
    ),
    expiresAtLogicalMs: positive(input.expiresAtLogicalMs, "source expiry"),
  });
  if (body.expiresAtLogicalMs <= body.observedAtLogicalMs)
    fail("morphology source validity window is invalid");
  return freeze({
    ...body,
    sourceHeadDigest: digest("morphology-source-head", body),
  });
}

export function validateMorphologySourceHeadV1(
  input: unknown,
): MorphologySourceHeadV1 {
  const value = exact(
    input,
    [
      "authenticationEvidenceDigest",
      "expiresAtLogicalMs",
      "observedAtLogicalMs",
      "required",
      "schemaVersion",
      "scopeDigest",
      "sourceClass",
      "sourceHeadDigest",
      "sourceHeadId",
      "sourceId",
      "sourceImplementationDigest",
      "sourceRecordDigest",
      "sourceRevision",
      "sourceVersion",
    ],
    "morphology source head",
  );
  schema(value.schemaVersion, "morphology source head");
  const { sourceHeadDigest: _digest, schemaVersion: _schema, ...body } = value;
  const result = createMorphologySourceHeadV1(
    body as Omit<
      MorphologySourceHeadV1,
      "schemaVersion" | "sourceHeadDigest"
    >,
  );
  if (value.sourceHeadDigest !== result.sourceHeadDigest)
    fail("morphology source head digest is invalid");
  return result;
}

export function createMorphologyComponentReferenceV1(
  input: Omit<
    MorphologyComponentReferenceV1,
    "schemaVersion" | "componentDigest"
  >,
): MorphologyComponentReferenceV1 {
  if (!componentKinds.has(input.componentKind))
    fail("morphology component kind is invalid");
  const body = freeze({
    schemaVersion: 1 as const,
    componentKind: input.componentKind,
    componentId: id(input.componentId, "component ID"),
    sourceHeadDigest: sha(input.sourceHeadDigest, "component source digest"),
    recordDigest: sha(input.recordDigest, "component record digest"),
    revision:
      input.revision === null
        ? null
        : nonNegative(input.revision, "component revision"),
    epoch:
      input.epoch === null ? null : positive(input.epoch, "component epoch"),
  });
  return freeze({
    ...body,
    componentDigest: digest("morphology-component-reference", body),
  });
}

export function validateMorphologyComponentReferenceV1(
  input: unknown,
): MorphologyComponentReferenceV1 {
  const value = exact(
    input,
    [
      "componentDigest",
      "componentId",
      "componentKind",
      "epoch",
      "recordDigest",
      "revision",
      "schemaVersion",
      "sourceHeadDigest",
    ],
    "morphology component reference",
  );
  schema(value.schemaVersion, "morphology component reference");
  const { componentDigest: _digest, schemaVersion: _schema, ...body } = value;
  const result = createMorphologyComponentReferenceV1(
    body as Omit<
      MorphologyComponentReferenceV1,
      "schemaVersion" | "componentDigest"
    >,
  );
  if (value.componentDigest !== result.componentDigest)
    fail("morphology component digest is invalid");
  return result;
}

export function createMorphologySnapshotV1(input: {
  readonly snapshotId: AgentPlatID;
  readonly scope: MorphogenesisScopeV1;
  readonly morphologyEpoch: number;
  readonly previousMorphologyDigest: PlanningDigestV1 | null;
  readonly policy: MorphogenesisPolicyRecordV1;
  readonly implementationDigest: PlanningDigestV1;
  readonly sourceHeads: readonly MorphologySourceHeadV1[];
  readonly components: readonly MorphologyComponentReferenceV1[];
  readonly population: MorphologySnapshotV1["population"];
  readonly resources: MorphologySnapshotV1["resources"];
  readonly observedAtLogicalMs: number;
  readonly logicalTimeHighWaterMs: number;
}): MorphologySnapshotV1 {
  const scope = validateMorphogenesisScopeV1(input.scope);
  const policy = validateMorphogenesisPolicyV1(input.policy);
  const sourceHeads = sortedUnique(
    input.sourceHeads,
    validateMorphologySourceHeadV1,
    (item) => item.sourceHeadId,
    "morphology source heads",
    1,
    policy.policy.limits.maximumSourceHeads,
  );
  const observedAtLogicalMs = nonNegative(
    input.observedAtLogicalMs,
    "snapshot observation time",
  );
  for (const head of sourceHeads) {
    if (
      head.scopeDigest !== scope.scopeDigest ||
      head.observedAtLogicalMs > observedAtLogicalMs ||
      observedAtLogicalMs >= head.expiresAtLogicalMs ||
      observedAtLogicalMs - head.observedAtLogicalMs >
        policy.policy.limits.maximumSourceFreshnessMs
    )
      fail("morphology source head is stale or cross-scoped");
  }
  for (const sourceClass of policy.policy.requiredSourceClasses)
    if (
      !sourceHeads.some(
        (head) => head.sourceClass === sourceClass && head.required,
      )
    )
      fail(`required morphology source class ${sourceClass} is unavailable`);

  const sourceDigests = new Set(
    sourceHeads.map(({ sourceHeadDigest }) => sourceHeadDigest),
  );
  const components = sortedUnique(
    input.components,
    validateMorphologyComponentReferenceV1,
    (item) => `${item.componentKind}:${item.componentId}`,
    "morphology components",
    0,
    policy.policy.limits.maximumComponents,
  );
  if (components.some((item) => !sourceDigests.has(item.sourceHeadDigest)))
    fail("morphology component references an unavailable source head");

  const population = normalizePopulation(input.population);
  const resources = normalizeResources(input.resources);
  if (population.activeAgents > policy.policy.maximumPopulation)
    fail("morphology population exceeds policy");
  const logicalTimeHighWaterMs = nonNegative(
    input.logicalTimeHighWaterMs,
    "snapshot logical-time high-water",
  );
  if (logicalTimeHighWaterMs < observedAtLogicalMs)
    fail("snapshot logical-time high-water precedes observation");
  const body = freeze({
    schemaVersion: 1 as const,
    snapshotId: id(input.snapshotId, "snapshot ID"),
    scope,
    morphologyEpoch: positive(input.morphologyEpoch, "morphology epoch"),
    previousMorphologyDigest: nullableSha(
      input.previousMorphologyDigest,
      "previous morphology digest",
    ),
    policyDigest: policy.policyDigest,
    implementationDigest: sha(
      input.implementationDigest,
      "morphology implementation digest",
    ),
    sourceHeads,
    components,
    population,
    resources,
    observedAtLogicalMs,
    logicalTimeHighWaterMs,
  });
  return freeze({
    ...body,
    snapshotDigest: digest("morphology-snapshot", body),
  });
}

export function validateMorphologySnapshotV1(
  input: unknown,
  policy: MorphogenesisPolicyRecordV1,
): MorphologySnapshotV1 {
  const value = exact(
    input,
    [
      "components",
      "implementationDigest",
      "logicalTimeHighWaterMs",
      "morphologyEpoch",
      "observedAtLogicalMs",
      "policyDigest",
      "population",
      "previousMorphologyDigest",
      "resources",
      "schemaVersion",
      "scope",
      "snapshotDigest",
      "snapshotId",
      "sourceHeads",
    ],
    "morphology snapshot",
  );
  schema(value.schemaVersion, "morphology snapshot");
  const result = createMorphologySnapshotV1({
    snapshotId: value.snapshotId as AgentPlatID,
    scope: value.scope as MorphogenesisScopeV1,
    morphologyEpoch: value.morphologyEpoch as number,
    previousMorphologyDigest:
      value.previousMorphologyDigest as PlanningDigestV1 | null,
    policy,
    implementationDigest: value.implementationDigest as PlanningDigestV1,
    sourceHeads: value.sourceHeads as readonly MorphologySourceHeadV1[],
    components:
      value.components as readonly MorphologyComponentReferenceV1[],
    population: value.population as MorphologySnapshotV1["population"],
    resources: value.resources as MorphologySnapshotV1["resources"],
    observedAtLogicalMs: value.observedAtLogicalMs as number,
    logicalTimeHighWaterMs: value.logicalTimeHighWaterMs as number,
  });
  if (
    value.policyDigest !== result.policyDigest ||
    value.snapshotDigest !== result.snapshotDigest
  )
    fail("morphology snapshot binding or digest is invalid");
  return result;
}

export function createMorphogenesisNeedV1(
  input: Omit<MorphogenesisNeedV1, "schemaVersion" | "needDigest">,
  policy: MorphogenesisPolicyRecordV1,
): MorphogenesisNeedV1 {
  if (!reasonCodes.has(input.reasonCode))
    fail("morphogenesis reason code is invalid");
  const evidenceDigests = digests(
    input.evidenceDigests,
    "need evidence digests",
    1,
    policy.policy.limits.maximumEvidenceDigests,
  );
  const body = freeze({
    schemaVersion: 1 as const,
    needId: id(input.needId, "need ID"),
    scopeDigest: sha(input.scopeDigest, "need scope digest"),
    currentSnapshotDigest: sha(
      input.currentSnapshotDigest,
      "need snapshot digest",
    ),
    reasonCode: input.reasonCode,
    severityBps: bps(input.severityBps, "need severity"),
    boundedViewDigest: nullableSha(
      input.boundedViewDigest,
      "need bounded view digest",
    ),
    candidateSearchLimit:
      input.candidateSearchLimit === null
        ? null
        : boundedPositive(
            input.candidateSearchLimit,
            "need candidate search limit",
            100_000,
          ),
    evidenceDigests,
    detectedAtLogicalMs: nonNegative(
      input.detectedAtLogicalMs,
      "need detection time",
    ),
    expiresAtLogicalMs: positive(input.expiresAtLogicalMs, "need expiry"),
  });
  if (
    (body.boundedViewDigest === null) !==
      (body.candidateSearchLimit === null) ||
    (body.reasonCode === "missing_capability" &&
      body.boundedViewDigest === null) ||
    body.severityBps < policy.policy.minimumNeedSeverityBps ||
    body.expiresAtLogicalMs <= body.detectedAtLogicalMs ||
    body.expiresAtLogicalMs - body.detectedAtLogicalMs >
      policy.policy.limits.maximumNeedTtlMs
  )
    fail("morphogenesis need severity or validity is outside policy");
  return freeze({ ...body, needDigest: digest("morphogenesis-need", body) });
}

export function validateMorphogenesisNeedV1(
  input: unknown,
  policy: MorphogenesisPolicyRecordV1,
): MorphogenesisNeedV1 {
  const value = exact(
    input,
    [
      "currentSnapshotDigest",
      "boundedViewDigest",
      "candidateSearchLimit",
      "detectedAtLogicalMs",
      "evidenceDigests",
      "expiresAtLogicalMs",
      "needDigest",
      "needId",
      "reasonCode",
      "schemaVersion",
      "scopeDigest",
      "severityBps",
    ],
    "morphogenesis need",
  );
  schema(value.schemaVersion, "morphogenesis need");
  const { needDigest: _digest, schemaVersion: _schema, ...body } = value;
  const result = createMorphogenesisNeedV1(
    body as Omit<MorphogenesisNeedV1, "schemaVersion" | "needDigest">,
    policy,
  );
  if (value.needDigest !== result.needDigest)
    fail("morphogenesis need digest is invalid");
  return result;
}

export function createTargetMorphologyPositionV1(
  input: Omit<
    TargetMorphologyPositionV1,
    "schemaVersion" | "positionDigest"
  >,
): TargetMorphologyPositionV1 {
  if (!fillModes.has(input.fillMode)) fail("target fill mode is invalid");
  const body = freeze({
    schemaVersion: 1 as const,
    positionId: id(input.positionId, "target position ID"),
    roleKey: token(input.roleKey, "target role key"),
    requiredCapabilityKeys: ids(
      input.requiredCapabilityKeys,
      "target capability keys",
      1,
      256,
    ),
    dependsOnPositionIds: ids(
      input.dependsOnPositionIds,
      "target position dependencies",
      0,
      256,
    ),
    fillMode: input.fillMode,
    currentAgentId: nullableId(input.currentAgentId, "current agent ID"),
    instantiationProfileDigest: nullableSha(
      input.instantiationProfileDigest,
      "instantiation profile digest",
    ),
    resourceBudgetUnits: positive(
      input.resourceBudgetUnits,
      "position resource budget",
    ),
    maximumActionBudgetUnits: positive(
      input.maximumActionBudgetUnits,
      "position action budget",
    ),
  });
  if (
    body.dependsOnPositionIds.includes(body.positionId) ||
    body.maximumActionBudgetUnits > body.resourceBudgetUnits ||
    (body.fillMode === "retain_current") !== (body.currentAgentId !== null) ||
    (body.fillMode === "instantiate_catalog") !==
      (body.instantiationProfileDigest !== null) ||
    (body.fillMode !== "retain_current" && body.currentAgentId !== null)
  )
    fail("target morphology position binding is invalid");
  return freeze({
    ...body,
    positionDigest: digest("target-morphology-position", body),
  });
}

export function validateTargetMorphologyPositionV1(
  input: unknown,
): TargetMorphologyPositionV1 {
  const value = exact(
    input,
    [
      "currentAgentId",
      "dependsOnPositionIds",
      "fillMode",
      "instantiationProfileDigest",
      "maximumActionBudgetUnits",
      "positionDigest",
      "positionId",
      "requiredCapabilityKeys",
      "resourceBudgetUnits",
      "roleKey",
      "schemaVersion",
    ],
    "target morphology position",
  );
  schema(value.schemaVersion, "target morphology position");
  const { positionDigest: _digest, schemaVersion: _schema, ...body } = value;
  const result = createTargetMorphologyPositionV1(
    body as Omit<
      TargetMorphologyPositionV1,
      "schemaVersion" | "positionDigest"
    >,
  );
  if (value.positionDigest !== result.positionDigest)
    fail("target morphology position digest is invalid");
  return result;
}

export function createTargetMorphologyAgentDispositionV1(
  input: Omit<
    TargetMorphologyAgentDispositionV1,
    "schemaVersion" | "dispositionDigest"
  >,
): TargetMorphologyAgentDispositionV1 {
  if (!dispositions.has(input.disposition))
    fail("agent disposition is invalid");
  const body = freeze({
    schemaVersion: 1 as const,
    agentId: id(input.agentId, "disposition agent ID"),
    expectedLineageDigest: sha(
      input.expectedLineageDigest,
      "expected lineage digest",
    ),
    disposition: input.disposition,
    targetPositionId: nullableId(
      input.targetPositionId,
      "disposition target position ID",
    ),
    targetRoleDefinitionDigest: nullableSha(
      input.targetRoleDefinitionDigest,
      "target role definition digest",
    ),
    reasonCode: token(input.reasonCode, "disposition reason code"),
  });
  if (
    ["retain", "rebind"].includes(body.disposition) !==
    (body.targetPositionId !== null)
  )
    fail("agent disposition target position binding is invalid");
  return freeze({
    ...body,
    dispositionDigest: digest("target-agent-disposition", body),
  });
}

export function validateTargetMorphologyAgentDispositionV1(
  input: unknown,
): TargetMorphologyAgentDispositionV1 {
  const value = exact(
    input,
    [
      "agentId",
      "disposition",
      "dispositionDigest",
      "expectedLineageDigest",
      "reasonCode",
      "schemaVersion",
      "targetPositionId",
      "targetRoleDefinitionDigest",
    ],
    "target morphology agent disposition",
  );
  schema(value.schemaVersion, "target morphology agent disposition");
  const { dispositionDigest: _digest, schemaVersion: _schema, ...body } = value;
  const result = createTargetMorphologyAgentDispositionV1(
    body as Omit<
      TargetMorphologyAgentDispositionV1,
      "schemaVersion" | "dispositionDigest"
    >,
  );
  if (value.dispositionDigest !== result.dispositionDigest)
    fail("target agent disposition digest is invalid");
  return result;
}

export function createTargetMorphologyV1(
  input: Omit<TargetMorphologyV1, "schemaVersion" | "targetDigest">,
  policy: MorphogenesisPolicyRecordV1,
): TargetMorphologyV1 {
  const positions = sortedUnique(
    input.positions,
    validateTargetMorphologyPositionV1,
    (item) => item.positionId,
    "target positions",
    1,
    policy.policy.limits.maximumPositions,
  );
  assertPositionDag(positions);
  const positionIds = new Set(positions.map(({ positionId }) => positionId));
  const agentDispositions = sortedUnique(
    input.agentDispositions,
    validateTargetMorphologyAgentDispositionV1,
    (item) => item.agentId,
    "target agent dispositions",
    0,
    policy.policy.limits.maximumAgentDispositions,
  );
  if (
    agentDispositions.some(
      ({ targetPositionId }) =>
        targetPositionId !== null && !positionIds.has(targetPositionId),
    )
  )
    fail("agent disposition references an unknown target position");
  const invariantDigests = digests(
    input.invariantDigests,
    "target invariant digests",
    1,
    policy.policy.limits.maximumInvariantDigests,
  );
  const estimatedNewAgents = nonNegative(
    input.estimatedNewAgents,
    "estimated new agents",
  );
  const catalogPositions = positions.filter(
    ({ fillMode }) => fillMode === "instantiate_catalog",
  ).length;
  const body = freeze({
    schemaVersion: 1 as const,
    targetId: id(input.targetId, "target morphology ID"),
    scopeDigest: sha(input.scopeDigest, "target scope digest"),
    currentSnapshotDigest: sha(
      input.currentSnapshotDigest,
      "target current snapshot digest",
    ),
    expectedCurrentEpoch: positive(
      input.expectedCurrentEpoch,
      "target expected current epoch",
    ),
    positions,
    agentDispositions,
    invariantDigests,
    estimatedActiveAgents: nonNegative(
      input.estimatedActiveAgents,
      "estimated active agents",
    ),
    estimatedNewAgents,
    estimatedResourceUnits: nonNegative(
      input.estimatedResourceUnits,
      "estimated resource units",
    ),
  });
  if (
    body.estimatedActiveAgents > policy.policy.maximumPopulation ||
    body.estimatedNewAgents !== catalogPositions ||
    body.estimatedNewAgents > policy.policy.maximumNewAgentsPerProposal ||
    body.estimatedResourceUnits > policy.policy.maximumResourceUnitsPerProposal
  )
    fail("target morphology estimates are outside policy");
  return freeze({
    ...body,
    targetDigest: digest("target-morphology", body),
  });
}

export function validateTargetMorphologyV1(
  input: unknown,
  policy: MorphogenesisPolicyRecordV1,
): TargetMorphologyV1 {
  const value = exact(
    input,
    [
      "agentDispositions",
      "currentSnapshotDigest",
      "estimatedActiveAgents",
      "estimatedNewAgents",
      "estimatedResourceUnits",
      "expectedCurrentEpoch",
      "invariantDigests",
      "positions",
      "schemaVersion",
      "scopeDigest",
      "targetDigest",
      "targetId",
    ],
    "target morphology",
  );
  schema(value.schemaVersion, "target morphology");
  const { targetDigest: _digest, schemaVersion: _schema, ...body } = value;
  const result = createTargetMorphologyV1(
    body as Omit<TargetMorphologyV1, "schemaVersion" | "targetDigest">,
    policy,
  );
  if (value.targetDigest !== result.targetDigest)
    fail("target morphology digest is invalid");
  return result;
}

export function createMorphogenesisBudgetEnvelopeV1(
  input: Omit<MorphogenesisBudgetEnvelopeV1, "budgetDigest">,
): MorphogenesisBudgetEnvelopeV1 {
  const maximumCosts = sortedUnique(
    input.maximumCosts,
    normalizeCurrencyAmount,
    (item) => item.currency,
    "morphogenesis maximum costs",
    0,
    32,
  );
  const body = freeze({
    maximumActiveAgents: positive(
      input.maximumActiveAgents,
      "maximum active agents",
    ),
    maximumNewAgents: nonNegative(
      input.maximumNewAgents,
      "maximum new agents",
    ),
    maximumConcurrentProvisioning: nonNegative(
      input.maximumConcurrentProvisioning,
      "maximum concurrent provisioning",
    ),
    maximumResourceUnits: nonNegative(
      input.maximumResourceUnits,
      "maximum resource units",
    ),
    maximumInteractionUnits: nonNegative(
      input.maximumInteractionUnits,
      "maximum interaction units",
    ),
    maximumActionUnits: nonNegative(
      input.maximumActionUnits,
      "maximum action units",
    ),
    maximumInputTokens: nonNegative(
      input.maximumInputTokens,
      "maximum input tokens",
    ),
    maximumOutputTokens: nonNegative(
      input.maximumOutputTokens,
      "maximum output tokens",
    ),
    maximumTotalTokens: nonNegative(
      input.maximumTotalTokens,
      "maximum total tokens",
    ),
    maximumDurationMs: positive(input.maximumDurationMs, "maximum duration"),
    maximumCosts,
  });
  if (
    body.maximumConcurrentProvisioning > body.maximumNewAgents ||
    body.maximumInputTokens + body.maximumOutputTokens > body.maximumTotalTokens
  )
    fail("morphogenesis budget envelope is inconsistent");
  return freeze({
    ...body,
    budgetDigest: digest("morphogenesis-budget-envelope", body),
  });
}

export function validateMorphogenesisBudgetEnvelopeV1(
  input: unknown,
): MorphogenesisBudgetEnvelopeV1 {
  const value = exact(
    input,
    [
      "budgetDigest",
      "maximumActionUnits",
      "maximumActiveAgents",
      "maximumConcurrentProvisioning",
      "maximumCosts",
      "maximumDurationMs",
      "maximumInputTokens",
      "maximumInteractionUnits",
      "maximumNewAgents",
      "maximumOutputTokens",
      "maximumResourceUnits",
      "maximumTotalTokens",
    ],
    "morphogenesis budget envelope",
  );
  const { budgetDigest: _digest, ...body } = value;
  const result = createMorphogenesisBudgetEnvelopeV1(
    body as Omit<MorphogenesisBudgetEnvelopeV1, "budgetDigest">,
  );
  if (value.budgetDigest !== result.budgetDigest)
    fail("morphogenesis budget digest is invalid");
  return result;
}

export function createMorphogenesisOperationV1(
  input: Omit<MorphogenesisOperationV1, "schemaVersion" | "operationDigest">,
  policy: MorphogenesisPolicyRecordV1,
): MorphogenesisOperationV1 {
  if (
    !operators.has(input.operator) ||
    !policy.policy.allowedOperators.includes(input.operator)
  )
    fail("morphogenesis operator is not admitted by policy");
  if (!effectClasses.has(input.effectClass))
    fail("morphogenesis effect class is invalid");
  if (!compensations.has(input.compensation))
    fail("morphogenesis compensation is invalid");
  const body = freeze({
    schemaVersion: 1 as const,
    operationId: id(input.operationId, "morphogenesis operation ID"),
    operator: input.operator,
    effectClass: input.effectClass,
    dependsOnOperationIds: ids(
      input.dependsOnOperationIds,
      "operation dependencies",
      0,
      policy.policy.limits.maximumDependenciesPerOperation,
    ),
    targetReferenceDigest: sha(
      input.targetReferenceDigest,
      "operation target reference digest",
    ),
    compensation: input.compensation,
  });
  if (body.dependsOnOperationIds.includes(body.operationId))
    fail("morphogenesis operation depends on itself");
  return freeze({
    ...body,
    operationDigest: digest("morphogenesis-operation", body),
  });
}

export function validateMorphogenesisOperationV1(
  input: unknown,
  policy: MorphogenesisPolicyRecordV1,
): MorphogenesisOperationV1 {
  const value = exact(
    input,
    [
      "compensation",
      "dependsOnOperationIds",
      "effectClass",
      "operationDigest",
      "operationId",
      "operator",
      "schemaVersion",
      "targetReferenceDigest",
    ],
    "morphogenesis operation",
  );
  schema(value.schemaVersion, "morphogenesis operation");
  const { operationDigest: _digest, schemaVersion: _schema, ...body } = value;
  const result = createMorphogenesisOperationV1(
    body as Omit<
      MorphogenesisOperationV1,
      "schemaVersion" | "operationDigest"
    >,
    policy,
  );
  if (value.operationDigest !== result.operationDigest)
    fail("morphogenesis operation digest is invalid");
  return result;
}

export function createMorphogenesisProposalV1(
  input: Omit<
    MorphogenesisProposalV1,
    "schemaVersion" | "proposalDigest" | "advisoryOnly"
  >,
  context: {
    readonly policy: MorphogenesisPolicyRecordV1;
    readonly snapshot: MorphologySnapshotV1;
    readonly need: MorphogenesisNeedV1;
    readonly target: TargetMorphologyV1;
  },
): MorphogenesisProposalV1 {
  const policy = validateMorphogenesisPolicyV1(context.policy);
  const snapshot = validateMorphologySnapshotV1(context.snapshot, policy);
  const need = validateMorphogenesisNeedV1(context.need, policy);
  const target = validateTargetMorphologyV1(context.target, policy);
  if (
    input.scopeDigest !== snapshot.scope.scopeDigest ||
    need.scopeDigest !== snapshot.scope.scopeDigest ||
    target.scopeDigest !== snapshot.scope.scopeDigest ||
    input.currentSnapshotDigest !== snapshot.snapshotDigest ||
    need.currentSnapshotDigest !== snapshot.snapshotDigest ||
    target.currentSnapshotDigest !== snapshot.snapshotDigest ||
    input.expectedCurrentEpoch !== snapshot.morphologyEpoch ||
    target.expectedCurrentEpoch !== snapshot.morphologyEpoch ||
    input.needDigest !== need.needDigest ||
    input.targetDigest !== target.targetDigest
  )
    fail("morphogenesis proposal context binding is invalid");
  if (
    !decisionRoutes.has(input.decisionRoute) ||
    !policy.policy.allowedDecisionRoutes.includes(input.decisionRoute)
  )
    fail("morphogenesis decision route is not admitted by policy");
  const operations = sortedUnique(
    input.operations,
    (item) => validateMorphogenesisOperationV1(item, policy),
    (item) => item.operationId,
    "morphogenesis operations",
    1,
    policy.policy.limits.maximumOperations,
  );
  assertOperationDag(operations);
  const hasCreation = operations.some(
    ({ operator }) => operator === "instantiate_agent",
  );
  if (hasCreation && !policy.policy.allowAgentCreation)
    fail("agent creation is disabled by morphogenesis policy");
  if (
    target.estimatedNewAgents > 0 !== hasCreation ||
    operations.some(
      ({ operator }) => operator === "derive_agent" && !hasCreation,
    )
  )
    fail("morphogenesis creation operation set is inconsistent");
  const budget = validateMorphogenesisBudgetEnvelopeV1(input.budget);
  if (
    budget.maximumActiveAgents < target.estimatedActiveAgents ||
    budget.maximumNewAgents < target.estimatedNewAgents ||
    budget.maximumResourceUnits < target.estimatedResourceUnits ||
    budget.maximumActiveAgents > policy.policy.maximumPopulation ||
    budget.maximumNewAgents > policy.policy.maximumNewAgentsPerProposal ||
    budget.maximumResourceUnits > policy.policy.maximumResourceUnitsPerProposal
  )
    fail("proposal budget does not cover target or exceeds policy");
  const body = freeze({
    schemaVersion: 1 as const,
    proposalId: id(input.proposalId, "proposal ID"),
    scopeDigest: snapshot.scope.scopeDigest,
    currentSnapshotDigest: snapshot.snapshotDigest,
    expectedCurrentEpoch: snapshot.morphologyEpoch,
    needDigest: need.needDigest,
    targetDigest: target.targetDigest,
    operations,
    processDefinitionDigest: sha(
      input.processDefinitionDigest,
      "process definition digest",
    ),
    budget,
    decisionRoute: input.decisionRoute,
    proposerId: id(input.proposerId, "proposer ID"),
    proposerVersion: positive(input.proposerVersion, "proposer version"),
    proposerImplementationDigest: sha(
      input.proposerImplementationDigest,
      "proposer implementation digest",
    ),
    proposedAtLogicalMs: nonNegative(
      input.proposedAtLogicalMs,
      "proposal time",
    ),
    expiresAtLogicalMs: positive(input.expiresAtLogicalMs, "proposal expiry"),
    advisoryOnly: true as const,
  });
  if (
    body.proposedAtLogicalMs < snapshot.logicalTimeHighWaterMs ||
    body.proposedAtLogicalMs < need.detectedAtLogicalMs ||
    body.expiresAtLogicalMs > need.expiresAtLogicalMs ||
    body.expiresAtLogicalMs <= body.proposedAtLogicalMs ||
    body.expiresAtLogicalMs - body.proposedAtLogicalMs >
      policy.policy.limits.maximumProposalTtlMs
  )
    fail("morphogenesis proposal validity is outside current context or policy");
  return freeze({
    ...body,
    proposalDigest: digest("morphogenesis-proposal", body),
  });
}

export function validateMorphogenesisProposalV1(
  input: unknown,
  context: {
    readonly policy: MorphogenesisPolicyRecordV1;
    readonly snapshot: MorphologySnapshotV1;
    readonly need: MorphogenesisNeedV1;
    readonly target: TargetMorphologyV1;
  },
): MorphogenesisProposalV1 {
  const value = exact(
    input,
    [
      "advisoryOnly",
      "budget",
      "currentSnapshotDigest",
      "decisionRoute",
      "expectedCurrentEpoch",
      "expiresAtLogicalMs",
      "needDigest",
      "operations",
      "processDefinitionDigest",
      "proposalDigest",
      "proposalId",
      "proposedAtLogicalMs",
      "proposerId",
      "proposerImplementationDigest",
      "proposerVersion",
      "schemaVersion",
      "scopeDigest",
      "targetDigest",
    ],
    "morphogenesis proposal",
  );
  schema(value.schemaVersion, "morphogenesis proposal");
  if (value.advisoryOnly !== true)
    fail("morphogenesis proposal must remain advisory");
  const {
    proposalDigest: _digest,
    schemaVersion: _schema,
    advisoryOnly: _advisory,
    ...body
  } = value;
  const result = createMorphogenesisProposalV1(
    body as Omit<
      MorphogenesisProposalV1,
      "schemaVersion" | "proposalDigest" | "advisoryOnly"
    >,
    context,
  );
  if (value.proposalDigest !== result.proposalDigest)
    fail("morphogenesis proposal digest is invalid");
  return result;
}

export function createMorphologyHeadV1(input: Omit<MorphologyHeadV1, "format" | "schemaVersion" | "headDigest">): MorphologyHeadV1 {
  const body = freeze({
    format: MORPHOLOGY_HEAD_STATE_FORMAT_V1,
    schemaVersion: 1 as const,
    stateKey: id(input.stateKey, "morphology head state key"),
    scopeDigest: sha(input.scopeDigest, "morphology head scope digest"),
    policyDigest: sha(input.policyDigest, "morphology head policy digest"),
    revision: nonNegative(input.revision, "morphology head revision"),
    morphologyEpoch: positive(input.morphologyEpoch, "morphology head epoch"),
    snapshotDigest: sha(input.snapshotDigest, "morphology head snapshot digest"),
    acceptedProposalDigest: nullableSha(input.acceptedProposalDigest, "accepted proposal digest"),
    decisionDigest: nullableSha(input.decisionDigest, "morphology decision digest"),
    receiptDigest: nullableSha(input.receiptDigest, "morphology receipt digest"),
    logicalTimeHighWaterMs: nonNegative(input.logicalTimeHighWaterMs, "morphology head logical time"),
    predecessorHeadDigest: nullableSha(input.predecessorHeadDigest, "predecessor morphology head digest"),
  });
  const initial = body.revision === 0;
  if (
    initial !== (body.predecessorHeadDigest === null) ||
    initial !== (body.acceptedProposalDigest === null) ||
    initial !== (body.decisionDigest === null) ||
    initial !== (body.receiptDigest === null)
  )
    fail("morphology head lineage or receipt binding is invalid");
  return freeze({ ...body, headDigest: digest("morphology-head", body) });
}

export function validateMorphologyHeadV1(input: unknown): MorphologyHeadV1 {
  const value = exact(
    input,
    [
      "acceptedProposalDigest",
      "decisionDigest",
      "format",
      "headDigest",
      "logicalTimeHighWaterMs",
      "morphologyEpoch",
      "policyDigest",
      "predecessorHeadDigest",
      "receiptDigest",
      "revision",
      "schemaVersion",
      "scopeDigest",
      "snapshotDigest",
      "stateKey",
    ],
    "morphology head",
  );
  if (
    value.format !== MORPHOLOGY_HEAD_STATE_FORMAT_V1 ||
    value.schemaVersion !== MORPHOGENESIS_SCHEMA_VERSION_V1
  )
    fail("morphology head format is invalid");
  const { format: _format, schemaVersion: _schema, headDigest: _digest, ...body } = value;
  const result = createMorphologyHeadV1(
    body as Omit<MorphologyHeadV1, "format" | "schemaVersion" | "headDigest">,
  );
  if (value.headDigest !== result.headDigest)
    fail("morphology head digest is invalid");
  return result;
}

function normalizePolicy(input: MorphogenesisPolicyV1): MorphogenesisPolicyV1 {
  const value = exact(
    input,
    [
      "allowAgentCreation",
      "allowedDecisionRoutes",
      "allowedOperators",
      "limits",
      "maximumNewAgentsPerProposal",
      "maximumPopulation",
      "maximumResourceUnitsPerProposal",
      "minimumNeedSeverityBps",
      "parentPolicyDigest",
      "policyId",
      "policyVersion",
      "requireIndependentDecider",
      "requiredSourceClasses",
      "schemaVersion",
    ],
    "morphogenesis policy",
  );
  schema(value.schemaVersion, "morphogenesis policy");
  const limits = exact(
    value.limits,
    [
      "cooldownMs",
      "hysteresisBps",
      "maximumAgentDispositions",
      "maximumCommitAttempts",
      "maximumComponents",
      "maximumDependenciesPerOperation",
      "maximumEvidenceDigests",
      "maximumInvariantDigests",
      "maximumNeedTtlMs",
      "maximumOperations",
      "maximumPositions",
      "maximumProposalTtlMs",
      "maximumSourceFreshnessMs",
      "maximumSourceHeads",
      "maximumTransformationsPerWindow",
      "transformationWindowMs",
    ],
    "morphogenesis policy limits",
  );
  const requiredSourceClasses = enumValues(
    value.requiredSourceClasses,
    sourceClasses,
    "required source classes",
    1,
    MORPHOLOGY_SOURCE_CLASSES_V1.length,
  ) as MorphogenesisPolicyV1["requiredSourceClasses"];
  const allowedOperators = enumValues(
    value.allowedOperators,
    operators,
    "allowed morphogenesis operators",
    1,
    MORPHOGENESIS_OPERATORS_V1.length,
  ) as MorphogenesisPolicyV1["allowedOperators"];
  if (allowedOperators.some((operator) => !firstReleaseOperators.has(operator)))
    fail("morphogenesis operator is not available in the first release");
  const allowedDecisionRoutes = enumValues(
    value.allowedDecisionRoutes,
    decisionRoutes,
    "allowed decision routes",
    1,
    MORPHOGENESIS_DECISION_ROUTES_V1.length,
  ) as MorphogenesisPolicyV1["allowedDecisionRoutes"];
  const policy = freeze({
    schemaVersion: 1 as const,
    policyId: id(value.policyId, "morphogenesis policy ID"),
    policyVersion: positive(value.policyVersion, "morphogenesis policy version"),
    parentPolicyDigest: nullableSha(value.parentPolicyDigest, "parent policy digest"),
    requiredSourceClasses,
    allowedOperators,
    allowedDecisionRoutes,
    requireIndependentDecider: bool(
      value.requireIndependentDecider,
      "require independent decider",
    ),
    allowAgentCreation: bool(value.allowAgentCreation, "allow agent creation"),
    maximumPopulation: positive(value.maximumPopulation, "maximum population"),
    maximumNewAgentsPerProposal: nonNegative(value.maximumNewAgentsPerProposal, "maximum new agents per proposal"),
    maximumResourceUnitsPerProposal: positive(value.maximumResourceUnitsPerProposal, "maximum resource units per proposal"),
    minimumNeedSeverityBps: bps(value.minimumNeedSeverityBps, "minimum need severity"),
    limits: freeze({
      maximumSourceHeads: boundedPositive(limits.maximumSourceHeads, "maximum source heads", 4_096),
      maximumComponents: boundedPositive(limits.maximumComponents, "maximum components", 100_000),
      maximumPositions: boundedPositive(limits.maximumPositions, "maximum positions", 4_096),
      maximumAgentDispositions: boundedPositive(limits.maximumAgentDispositions, "maximum agent dispositions", 100_000),
      maximumOperations: boundedPositive(limits.maximumOperations, "maximum operations", 4_096),
      maximumDependenciesPerOperation: boundedPositive(limits.maximumDependenciesPerOperation, "maximum dependencies per operation", 1_024),
      maximumEvidenceDigests: boundedPositive(limits.maximumEvidenceDigests, "maximum evidence digests", 4_096),
      maximumInvariantDigests: boundedPositive(limits.maximumInvariantDigests, "maximum invariant digests", 4_096),
      maximumProposalTtlMs: positive(limits.maximumProposalTtlMs, "maximum proposal TTL"),
      maximumNeedTtlMs: positive(limits.maximumNeedTtlMs, "maximum need TTL"),
      maximumSourceFreshnessMs: positive(limits.maximumSourceFreshnessMs, "maximum source freshness"),
      maximumCommitAttempts: boundedPositive(limits.maximumCommitAttempts, "maximum commit attempts", 1_000),
      maximumTransformationsPerWindow: boundedPositive(limits.maximumTransformationsPerWindow, "maximum transformations per window", 100_000),
      transformationWindowMs: positive(limits.transformationWindowMs, "transformation window"),
      cooldownMs: nonNegative(limits.cooldownMs, "morphogenesis cooldown"),
      hysteresisBps: bps(limits.hysteresisBps, "morphogenesis hysteresis"),
    }),
  });
  if (
    policy.maximumNewAgentsPerProposal > policy.maximumPopulation ||
    (!policy.allowAgentCreation &&
      policy.allowedOperators.some((item) =>
        ["instantiate_agent", "derive_agent"].includes(item),
      ))
  )
    fail("morphogenesis policy creation or population bounds are inconsistent");
  return policy;
}

function normalizePopulation(
  input: MorphologySnapshotV1["population"],
): MorphologySnapshotV1["population"] {
  const value = exact(
    input,
    [
      "activeAgents",
      "activeTeams",
      "concurrentlyProvisioningAgents",
      "dormantAgents",
    ],
    "morphology population counters",
  );
  return freeze({
    activeAgents: nonNegative(value.activeAgents, "active agent count"),
    dormantAgents: nonNegative(value.dormantAgents, "dormant agent count"),
    activeTeams: nonNegative(value.activeTeams, "active Team count"),
    concurrentlyProvisioningAgents: nonNegative(
      value.concurrentlyProvisioningAgents,
      "provisioning agent count",
    ),
  });
}

function normalizeResources(
  input: MorphologySnapshotV1["resources"],
): MorphologySnapshotV1["resources"] {
  const value = exact(
    input,
    [
      "configuredResourceUnits",
      "consumedInteractionUnits",
      "reservedResourceUnits",
    ],
    "morphology resource counters",
  );
  const result = freeze({
    configuredResourceUnits: nonNegative(
      value.configuredResourceUnits,
      "configured resource units",
    ),
    reservedResourceUnits: nonNegative(
      value.reservedResourceUnits,
      "reserved resource units",
    ),
    consumedInteractionUnits: nonNegative(
      value.consumedInteractionUnits,
      "consumed interaction units",
    ),
  });
  if (result.reservedResourceUnits > result.configuredResourceUnits)
    fail("reserved morphology resources exceed configured resources");
  return result;
}

function normalizeCurrencyAmount(input: unknown): MorphogenesisCurrencyAmountV1 {
  const value = exact(input, ["currency", "micros"], "currency amount");
  if (typeof value.currency !== "string" || !CURRENCY.test(value.currency))
    fail("morphogenesis cost currency is invalid");
  return freeze({
    currency: value.currency,
    micros: nonNegative(value.micros, "morphogenesis cost micros"),
  });
}

function assertPositionDag(
  positions: readonly TargetMorphologyPositionV1[],
): void {
  const byId = new Map(positions.map((item) => [item.positionId, item]));
  for (const position of positions)
    for (const dependency of position.dependsOnPositionIds)
      if (!byId.has(dependency)) fail("target position dependency is unknown");
  assertDag(
    positions.map((item) => ({
      id: item.positionId,
      dependencies: item.dependsOnPositionIds,
    })),
    "target morphology positions",
  );
}

function assertOperationDag(
  operations: readonly MorphogenesisOperationV1[],
): void {
  const byId = new Set(operations.map(({ operationId }) => operationId));
  for (const operation of operations)
    for (const dependency of operation.dependsOnOperationIds)
      if (!byId.has(dependency)) fail("morphogenesis operation dependency is unknown");
  assertDag(
    operations.map((item) => ({
      id: item.operationId,
      dependencies: item.dependsOnOperationIds,
    })),
    "morphogenesis operations",
  );
}

function assertDag(
  nodes: readonly { readonly id: string; readonly dependencies: readonly string[] }[],
  label: string,
): void {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (nodeId: string): void => {
    if (visited.has(nodeId)) return;
    if (visiting.has(nodeId)) fail(`${label} contain a dependency cycle`);
    visiting.add(nodeId);
    for (const dependency of byId.get(nodeId)?.dependencies ?? []) visit(dependency);
    visiting.delete(nodeId);
    visited.add(nodeId);
  };
  for (const node of nodes) visit(node.id);
}

function exact(
  input: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    fail(`${label} must be an object`);
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null)
    fail(`${label} must be a plain object`);
  const actual = Object.keys(input as object).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    fail(`${label} fields are invalid`);
  return input as Record<string, unknown>;
}

function sortedUnique<T>(
  input: readonly unknown[],
  validate: (item: unknown) => T,
  key: (item: T) => string,
  label: string,
  minimum: number,
  maximum: number,
): readonly T[] {
  if (!Array.isArray(input) || input.length < minimum || input.length > maximum)
    fail(`${label} count is outside policy`);
  const result = input.map(validate).sort((left, right) =>
    compare(key(left), key(right)),
  );
  for (let index = 1; index < result.length; index += 1)
    if (key(result[index - 1]!) === key(result[index]!))
      fail(`${label} contain a duplicate`);
  return freeze(result);
}

function enumValues(
  input: unknown,
  allowed: ReadonlySet<string>,
  label: string,
  minimum: number,
  maximum: number,
): readonly string[] {
  if (!Array.isArray(input)) fail(`${label} must be an array`);
  const values = input.map((item) => {
    if (typeof item !== "string" || !allowed.has(item))
      fail(`${label} contain an invalid value`);
    return item;
  });
  if (values.length < minimum || values.length > maximum)
    fail(`${label} count is outside policy`);
  const sorted = [...new Set(values)].sort(compare);
  if (sorted.length !== values.length) fail(`${label} contain a duplicate`);
  return freeze(sorted);
}

function ids(
  input: readonly unknown[],
  label: string,
  minimum: number,
  maximum: number,
): readonly AgentPlatID[] {
  if (!Array.isArray(input) || input.length < minimum || input.length > maximum)
    fail(`${label} count is invalid`);
  const result = input.map((value) => id(value, label)).sort(compare);
  if (new Set(result).size !== result.length) fail(`${label} contain a duplicate`);
  return freeze(result);
}

function digests(
  input: readonly unknown[],
  label: string,
  minimum: number,
  maximum: number,
): readonly PlanningDigestV1[] {
  if (!Array.isArray(input) || input.length < minimum || input.length > maximum)
    fail(`${label} count is invalid`);
  const result = input.map((value) => sha(value, label)).sort(compare);
  if (new Set(result).size !== result.length) fail(`${label} contain a duplicate`);
  return freeze(result);
}

function id(input: unknown, label: string): AgentPlatID {
  if (typeof input !== "string" || !IDENTIFIER.test(input))
    fail(`${label} is invalid`);
  return input as AgentPlatID;
}

function nullableId(input: unknown, label: string): AgentPlatID | null {
  return input === null ? null : id(input, label);
}

function token(input: unknown, label: string): string {
  if (typeof input !== "string" || !TOKEN.test(input)) fail(`${label} is invalid`);
  return input;
}

function sha(input: unknown, label: string): PlanningDigestV1 {
  if (typeof input !== "string" || !DIGEST.test(input)) fail(`${label} is invalid`);
  return input as PlanningDigestV1;
}

function nullableSha(input: unknown, label: string): PlanningDigestV1 | null {
  return input === null ? null : sha(input, label);
}

function schema(input: unknown, label: string): void {
  if (input !== MORPHOGENESIS_SCHEMA_VERSION_V1) fail(`${label} schema is invalid`);
}

function bool(input: unknown, label: string): boolean {
  if (typeof input !== "boolean") fail(`${label} is invalid`);
  return input;
}

function bps(input: unknown, label: string): number {
  return integer(input, label, 0, 10_000);
}

function positive(input: unknown, label: string): number {
  return integer(input, label, 1, Number.MAX_SAFE_INTEGER);
}

function boundedPositive(input: unknown, label: string, maximum: number): number {
  return integer(input, label, 1, maximum);
}

function nonNegative(input: unknown, label: string): number {
  return integer(input, label, 0, Number.MAX_SAFE_INTEGER);
}

function integer(input: unknown, label: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(input) || (input as number) < minimum || (input as number) > maximum)
    fail(`${label} must be a safe integer from ${minimum} through ${maximum}`);
  return input as number;
}

function digest(
  domain: PlanningDigestDomainV1,
  input: unknown,
): PlanningDigestV1 {
  return digestPlanningJsonV1(domain, input as PlanningJson);
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function freeze<T>(input: T): T {
  if (input && typeof input === "object" && !Object.isFrozen(input)) {
    Object.freeze(input);
    for (const key of Object.getOwnPropertyNames(input))
      freeze((input as Record<string, unknown>)[key]);
  }
  return input;
}

function fail(message: string): never {
  throw new TypeError(message);
}
