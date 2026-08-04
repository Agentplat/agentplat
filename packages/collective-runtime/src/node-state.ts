import {
  digestPlanningJsonV1,
  validatePlanningReducerStateV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import type { PlanningMeshInboundRuntimeStateV1 } from "@agentplat/collective-planning/mesh";
import {
  createMeshAllocationInboundRuntimeState,
  restoreMeshAllocationState,
  restoreMeshCoordinationInboundState,
  restoreMeshCoordinationState,
  restoreMeshDiscoveryState,
  restoreMeshObjectiveWorkState,
} from "@agentplat/mesh/coordination";
import type {
  MeshDurablePeerSnapshot,
  MeshDurableScope,
} from "@agentplat/mesh/durability";
import type { MeshJsonValue } from "@agentplat/mesh-protocol";

import {
  COLLECTIVE_PEER_NODE_SCHEMA_VERSION,
  COLLECTIVE_PEER_NODE_SNAPSHOT_FORMAT,
  type CollectivePeerNodeScopeV1,
  type CollectivePeerNodeSnapshotV1,
  type CollectivePeerNodeStoredStateV1,
} from "./node-contracts.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@-]*$/u;
const PLANNING_DIGEST = /^sha256:[0-9a-f]{64}$/u;
const CONTENT_DIGEST = /^sha256:[A-Za-z0-9_-]{43}$/u;

export function createCollectivePeerNodeStoredStateV1(input: {
  readonly scope: CollectivePeerNodeScopeV1;
  readonly outboundSequence?: number;
  readonly runtime: PlanningMeshInboundRuntimeStateV1;
  readonly releases?: CollectivePeerNodeStoredStateV1["releases"];
  readonly initialPlanningState?: PlanningMeshInboundRuntimeStateV1["planning"];
}): CollectivePeerNodeStoredStateV1 {
  const scope = normalizeCollectivePeerNodeScopeV1(input.scope);
  const outboundSequence = nonNegativeInteger(
    input.outboundSequence ?? 0,
    "outboundSequence",
  );
  const baseline = validatePlanningReducerStateV1(
    input.initialPlanningState ?? input.runtime.planning,
  );
  const planning = validatePlanningReducerStateV1(input.runtime.planning);
  assertPlanningBinding(scope, baseline, planning);
  const mesh = createMeshAllocationInboundRuntimeState(
    restoreMeshCoordinationState(input.runtime.mesh.coordination),
    restoreMeshDiscoveryState(input.runtime.mesh.discovery),
    restoreMeshObjectiveWorkState(input.runtime.mesh.objectives),
    restoreMeshAllocationState(input.runtime.mesh.allocation),
    restoreMeshCoordinationInboundState(input.runtime.mesh.inbound),
  );
  assertRuntimeBinding(scope, mesh, planning);
  return Object.freeze({
    format: COLLECTIVE_PEER_NODE_SNAPSHOT_FORMAT,
    schemaVersion: COLLECTIVE_PEER_NODE_SCHEMA_VERSION,
    scope,
    outboundSequence,
    runtime: Object.freeze({ mesh, planning }),
    releases: normalizeReleases(input.releases ?? []),
  });
}

export function encodeCollectivePeerNodeStoredStateV1(
  input: CollectivePeerNodeStoredStateV1,
): MeshJsonValue {
  const normalized = createCollectivePeerNodeStoredStateV1({
    scope: input.scope,
    outboundSequence: input.outboundSequence,
    runtime: input.runtime,
    releases: input.releases,
    initialPlanningState: input.runtime.planning,
  });
  return JSON.parse(JSON.stringify(normalized)) as MeshJsonValue;
}

export function restoreCollectivePeerNodeStoredStateV1(input: {
  readonly value: unknown;
  readonly expectedScope: CollectivePeerNodeScopeV1;
  readonly initialPlanningState: PlanningMeshInboundRuntimeStateV1["planning"];
}): CollectivePeerNodeStoredStateV1 {
  if (
    !input.value ||
    typeof input.value !== "object" ||
    Array.isArray(input.value)
  )
    throw new TypeError("Collective peer node snapshot is invalid");
  const value = input.value as Record<string, unknown>;
  const keys = Object.keys(value).sort();
  if (
    keys.join("\u0000") !==
      [
        "format",
        "outboundSequence",
        "releases",
        "runtime",
        "schemaVersion",
        "scope",
      ]
        .sort()
        .join("\u0000") ||
    value.format !== COLLECTIVE_PEER_NODE_SNAPSHOT_FORMAT ||
    value.schemaVersion !== COLLECTIVE_PEER_NODE_SCHEMA_VERSION ||
    !value.runtime ||
    typeof value.runtime !== "object" ||
    Array.isArray(value.runtime)
  ) {
    throw new TypeError("Collective peer node snapshot format is invalid");
  }
  const runtime = value.runtime as Record<string, unknown>;
  if (Object.keys(runtime).sort().join("\u0000") !== "mesh\u0000planning")
    throw new TypeError("Collective peer node runtime snapshot is invalid");
  const mesh = runtime.mesh as Record<string, unknown>;
  if (
    !mesh ||
    typeof mesh !== "object" ||
    Array.isArray(mesh) ||
    Object.keys(mesh).sort().join("\u0000") !==
      "allocation\u0000coordination\u0000discovery\u0000inbound\u0000objectives"
  ) {
    throw new TypeError("Collective peer node Mesh snapshot is invalid");
  }
  const scope = normalizeCollectivePeerNodeScopeV1(
    value.scope as CollectivePeerNodeScopeV1,
  );
  assertSameScope(scope, input.expectedScope);
  return createCollectivePeerNodeStoredStateV1({
    scope,
    outboundSequence: value.outboundSequence as number,
    releases: value.releases as CollectivePeerNodeStoredStateV1["releases"],
    runtime: {
      mesh: {
        coordination: mesh.coordination as never,
        discovery: mesh.discovery as never,
        objectives: mesh.objectives as never,
        allocation: mesh.allocation as never,
        inbound: mesh.inbound as never,
      },
      planning: runtime.planning as never,
    },
    initialPlanningState: input.initialPlanningState,
  });
}

export function createCollectivePeerNodeSnapshotV1(input: {
  readonly durable: MeshDurablePeerSnapshot;
  readonly expectedScope: CollectivePeerNodeScopeV1;
  readonly initialPlanningState: PlanningMeshInboundRuntimeStateV1["planning"];
}): CollectivePeerNodeSnapshotV1 {
  assertDurableScope(input.durable.scope, input.expectedScope);
  if (
    input.durable.snapshotFormat !== COLLECTIVE_PEER_NODE_SNAPSHOT_FORMAT ||
    input.durable.snapshotSchemaVersion !== COLLECTIVE_PEER_NODE_SCHEMA_VERSION
  ) {
    throw new TypeError("Collective peer node durable descriptor is invalid");
  }
  return Object.freeze({
    schemaVersion: COLLECTIVE_PEER_NODE_SCHEMA_VERSION,
    durableRevision: input.durable.revision,
    durableStateDigest: input.durable.stateDigest,
    committedAt: input.durable.committedAt,
    state: restoreCollectivePeerNodeStoredStateV1({
      value: input.durable.state,
      expectedScope: input.expectedScope,
      initialPlanningState: input.initialPlanningState,
    }),
  });
}

export function normalizeCollectivePeerNodeScopeV1(
  input: CollectivePeerNodeScopeV1,
): CollectivePeerNodeScopeV1 {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new TypeError("Collective peer node scope is required");
  const expected = [
    "instanceId",
    "meshId",
    "missionIntentId",
    "peerId",
    "policyDomainId",
    "tenantId",
  ];
  if (
    Object.keys(input).sort().join("\u0000") !== expected.sort().join("\u0000")
  )
    throw new TypeError("Collective peer node scope must have an exact shape");
  return Object.freeze({
    tenantId: identifier(input.tenantId, "tenantId"),
    policyDomainId: identifier(input.policyDomainId, "policyDomainId"),
    meshId: identifier(input.meshId, "meshId"),
    missionIntentId: identifier(input.missionIntentId, "missionIntentId"),
    peerId: identifier(input.peerId, "peerId"),
    instanceId: identifier(input.instanceId, "instanceId"),
  });
}

export function meshDurableScopeForNodeV1(
  scope: CollectivePeerNodeScopeV1,
): MeshDurableScope {
  const normalized = normalizeCollectivePeerNodeScopeV1(scope);
  return Object.freeze({
    tenantId: normalized.tenantId,
    meshId: normalized.meshId,
    peerId: normalized.peerId,
    instanceId: normalized.instanceId,
  });
}

function assertPlanningBinding(
  scope: CollectivePeerNodeScopeV1,
  baseline: PlanningMeshInboundRuntimeStateV1["planning"],
  planning: PlanningMeshInboundRuntimeStateV1["planning"],
): void {
  if (
    planning.tenantId !== scope.tenantId ||
    planning.policyDomainId !== scope.policyDomainId ||
    planning.peerId !== scope.peerId ||
    planning.peerInstanceId !== scope.instanceId ||
    planning.missionIntent.missionIntentId !== scope.missionIntentId ||
    planning.missionIntent.objective.meshId !== scope.meshId ||
    baseline.tenantId !== planning.tenantId ||
    baseline.policyDomainId !== planning.policyDomainId ||
    baseline.peerId !== planning.peerId ||
    baseline.peerInstanceId !== planning.peerInstanceId ||
    baseline.missionIntent.intentDigest !==
      planning.missionIntent.intentDigest ||
    baseline.selectionPolicy.policyDigest !==
      planning.selectionPolicy.policyDigest ||
    JSON.stringify(baseline.admittedSubjects) !==
      JSON.stringify(planning.admittedSubjects) ||
    JSON.stringify(baseline.planView.budgetShards) !==
      JSON.stringify(planning.planView.budgetShards)
  ) {
    throw new TypeError("Collective peer node planning binding changed");
  }
}

function assertRuntimeBinding(
  scope: CollectivePeerNodeScopeV1,
  mesh: PlanningMeshInboundRuntimeStateV1["mesh"],
  planning: PlanningMeshInboundRuntimeStateV1["planning"],
): void {
  const identity = mesh.coordination.identity;
  if (
    identity.tenantId !== scope.tenantId ||
    identity.meshId !== scope.meshId ||
    identity.peerId !== scope.peerId ||
    identity.instanceId !== scope.instanceId ||
    planning.peerId !== identity.peerId ||
    planning.peerInstanceId !== identity.instanceId
  ) {
    throw new TypeError("Collective peer node runtime scope changed");
  }
}

function assertDurableScope(
  actual: MeshDurableScope,
  expected: CollectivePeerNodeScopeV1,
): void {
  if (
    actual.tenantId !== expected.tenantId ||
    actual.meshId !== expected.meshId ||
    actual.peerId !== expected.peerId ||
    actual.instanceId !== expected.instanceId
  )
    throw new TypeError("Collective peer node durable scope changed");
}

function assertSameScope(
  actual: CollectivePeerNodeScopeV1,
  expected: CollectivePeerNodeScopeV1,
): void {
  if (
    JSON.stringify(actual) !==
    JSON.stringify(normalizeCollectivePeerNodeScopeV1(expected))
  )
    throw new TypeError("Collective peer node snapshot scope changed");
}

function identifier(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length > 256 ||
    !IDENTIFIER.test(value)
  )
    throw new TypeError(`Collective peer node ${label} is invalid`);
  return value;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new TypeError(`Collective peer node ${label} is invalid`);
  return value as number;
}

function normalizeReleases(
  input: CollectivePeerNodeStoredStateV1["releases"],
): CollectivePeerNodeStoredStateV1["releases"] {
  if (!Array.isArray(input) || input.length > 65_536)
    throw new TypeError("Collective peer node releases are invalid");
  const releases = JSON.parse(JSON.stringify(input)) as typeof input;
  const ids = new Set<string>();
  const stepKeys = new Set<string>();
  for (const release of releases) {
    const keys = release && Object.keys(release).sort().join("\u0000");
    const expectedKeys = [
      "schemaVersion",
      "releaseId",
      "workItemId",
      "workContractId",
      "workContractDigest",
      "roleBindingDigest",
      "executionRoleBindingDigest",
      "assignmentAuthorityId",
      "assignmentEpoch",
      "assignmentFencingToken",
      "continuityBinding",
      "assignmentConfirmation",
      "sessionId",
      "sessionRevision",
      "stepId",
      "stepSequence",
      "stepRecordDigest",
      "checkpointId",
      "checkpointDigest",
      "actions",
      "resultId",
      "resultDigest",
      "outboxEffectIds",
      "committedAtLogicalMs",
      "releaseDigest",
    ]
      .sort()
      .join("\u0000");
    if (
      !release ||
      keys !== expectedKeys ||
      release.schemaVersion !== 1 ||
      !IDENTIFIER.test(release.releaseId) ||
      !IDENTIFIER.test(release.workItemId) ||
      !IDENTIFIER.test(release.workContractId) ||
      !PLANNING_DIGEST.test(release.workContractDigest) ||
      !PLANNING_DIGEST.test(release.roleBindingDigest) ||
      !PLANNING_DIGEST.test(release.executionRoleBindingDigest) ||
      !IDENTIFIER.test(release.assignmentAuthorityId) ||
      !IDENTIFIER.test(release.assignmentFencingToken) ||
      ids.has(release.releaseId) ||
      !Number.isSafeInteger(release.assignmentEpoch) ||
      release.assignmentEpoch < 1 ||
      !release.continuityBinding ||
      typeof release.continuityBinding !== "object" ||
      Object.keys(release.continuityBinding).sort().join("\u0000") !==
        "fencingToken\u0000generation\u0000headDigest\u0000holder\u0000logicalTimeMs\u0000schemaVersion\u0000scopeKey" ||
      release.continuityBinding.schemaVersion !== 1 ||
      typeof release.continuityBinding.scopeKey !== "string" ||
      release.continuityBinding.scopeKey.length < 1 ||
      release.continuityBinding.scopeKey.length > 4_096 ||
      !Number.isSafeInteger(release.continuityBinding.generation) ||
      release.continuityBinding.generation < 1 ||
      !release.continuityBinding.holder ||
      Object.keys(release.continuityBinding.holder).sort().join("\u0000") !==
        "instanceId\u0000keyId\u0000peerId\u0000schemaVersion" ||
      release.continuityBinding.holder.schemaVersion !== 1 ||
      !IDENTIFIER.test(release.continuityBinding.holder.peerId) ||
      !IDENTIFIER.test(release.continuityBinding.holder.instanceId) ||
      !IDENTIFIER.test(release.continuityBinding.holder.keyId) ||
      !CONTENT_DIGEST.test(release.continuityBinding.headDigest) ||
      !IDENTIFIER.test(release.continuityBinding.fencingToken) ||
      !Number.isSafeInteger(release.continuityBinding.logicalTimeMs) ||
      release.continuityBinding.logicalTimeMs < 0 ||
      !validAssignmentConfirmation(release.assignmentConfirmation) ||
      !IDENTIFIER.test(release.sessionId) ||
      !Number.isSafeInteger(release.sessionRevision) ||
      release.sessionRevision < 0 ||
      !IDENTIFIER.test(release.stepId) ||
      !Number.isSafeInteger(release.stepSequence) ||
      release.stepSequence < 1 ||
      !CONTENT_DIGEST.test(release.stepRecordDigest) ||
      (release.checkpointId === null) !== (release.checkpointDigest === null) ||
      (release.checkpointId !== null &&
        !IDENTIFIER.test(release.checkpointId)) ||
      (release.checkpointDigest !== null &&
        !CONTENT_DIGEST.test(release.checkpointDigest)) ||
      !IDENTIFIER.test(release.resultId) ||
      !CONTENT_DIGEST.test(release.resultDigest) ||
      !Number.isSafeInteger(release.committedAtLogicalMs) ||
      release.committedAtLogicalMs < 0 ||
      !Array.isArray(release.actions) ||
      release.actions.length > 1_024 ||
      release.actions.some(
        (
          action: CollectivePeerNodeStoredStateV1["releases"][number]["actions"][number],
        ) => !validActionResolution(action),
      ) ||
      !Array.isArray(release.outboxEffectIds) ||
      release.outboxEffectIds.length < 1 ||
      release.outboxEffectIds.length > 4_096 ||
      release.outboxEffectIds.some(
        (effectId: string) => !IDENTIFIER.test(effectId),
      ) ||
      new Set(release.outboxEffectIds).size !==
        release.outboxEffectIds.length ||
      !PLANNING_DIGEST.test(release.releaseDigest)
    )
      throw new TypeError("Collective peer node release is invalid");
    const { releaseDigest, ...releaseBody } = release;
    if (
      releaseDigest !==
      digestPlanningJsonV1(
        "planning-reducer-command-identity",
        releaseBody as unknown as PlanningJson,
      )
    )
      throw new TypeError("Collective peer node release digest is invalid");
    const stepKey = `${release.workContractDigest}\u0000${release.stepId}`;
    if (stepKeys.has(stepKey))
      throw new TypeError("Collective peer node release step is duplicated");
    ids.add(release.releaseId);
    stepKeys.add(stepKey);
    if (
      release.actions.some(
        (
          action: CollectivePeerNodeStoredStateV1["releases"][number]["actions"][number],
        ) => action.status !== "dispatched",
      )
    )
      throw new TypeError(
        "Collective peer node release has unresolved actions",
      );
  }
  return Object.freeze(
    releases.map((release) =>
      Object.freeze({
        ...release,
        continuityBinding: Object.freeze({
          ...release.continuityBinding,
          holder: Object.freeze({ ...release.continuityBinding.holder }),
        }),
        assignmentConfirmation: Object.freeze({
          ...release.assignmentConfirmation,
          confirmedWitnessPeerIds: Object.freeze([
            ...release.assignmentConfirmation.confirmedWitnessPeerIds,
          ]),
        }),
        actions: Object.freeze(
          release.actions.map(
            (
              action: CollectivePeerNodeStoredStateV1["releases"][number]["actions"][number],
            ) => Object.freeze({ ...action }),
          ),
        ),
        outboxEffectIds: Object.freeze([...release.outboxEffectIds]),
      }),
    ),
  );
}

function validAssignmentConfirmation(
  value: CollectivePeerNodeStoredStateV1["releases"][number]["assignmentConfirmation"],
): boolean {
  if (!value || typeof value !== "object") return false;
  const timestamp = new Date(value.confirmedLeaseExpiresAt);
  return (
    Object.keys(value).sort().join("\u0000") ===
      "acceptanceId\u0000assignmentAuthorityId\u0000assignmentEpoch\u0000confirmationId\u0000confirmedAtLogicalMs\u0000confirmedLeaseExpiresAt\u0000confirmedWitnessPeerIds\u0000fencingToken\u0000leaseRenewalId\u0000ownerPeerId\u0000schemaVersion" &&
    value.schemaVersion === 1 &&
    IDENTIFIER.test(value.confirmationId) &&
    IDENTIFIER.test(value.ownerPeerId) &&
    IDENTIFIER.test(value.acceptanceId) &&
    IDENTIFIER.test(value.assignmentAuthorityId) &&
    Number.isSafeInteger(value.assignmentEpoch) &&
    value.assignmentEpoch > 0 &&
    IDENTIFIER.test(value.fencingToken) &&
    (value.leaseRenewalId === null || IDENTIFIER.test(value.leaseRenewalId)) &&
    Number.isFinite(timestamp.getTime()) &&
    timestamp.toISOString() === value.confirmedLeaseExpiresAt &&
    Array.isArray(value.confirmedWitnessPeerIds) &&
    value.confirmedWitnessPeerIds.length > 0 &&
    value.confirmedWitnessPeerIds.length <= 4_096 &&
    value.confirmedWitnessPeerIds.every((peerId) => IDENTIFIER.test(peerId)) &&
    new Set(value.confirmedWitnessPeerIds).size ===
      value.confirmedWitnessPeerIds.length &&
    Number.isSafeInteger(value.confirmedAtLogicalMs) &&
    value.confirmedAtLogicalMs >= 0
  );
}

function validActionResolution(
  value: CollectivePeerNodeStoredStateV1["releases"][number]["actions"][number],
): boolean {
  return (
    !!value &&
    typeof value === "object" &&
    Object.keys(value).sort().join("\u0000") ===
      "actionDigest\u0000actionId\u0000effectId\u0000outcomeId\u0000reasonCode\u0000status" &&
    IDENTIFIER.test(value.effectId) &&
    IDENTIFIER.test(value.actionId) &&
    CONTENT_DIGEST.test(value.actionDigest) &&
    ["dispatched", "failed", "indeterminate"].includes(value.status) &&
    IDENTIFIER.test(value.outcomeId) &&
    (value.reasonCode === null || IDENTIFIER.test(value.reasonCode)) &&
    (value.status === "dispatched"
      ? value.reasonCode === null
      : value.reasonCode !== null)
  );
}
