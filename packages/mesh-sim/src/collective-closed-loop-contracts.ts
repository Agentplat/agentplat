import type {
  MissionIntentV1,
  MissionObservationV1,
  PlanFragmentProposalV1,
  PlanSelectionPolicyV1,
  PlanningDigestV1,
  PlanningJson,
  PlanViewV1,
} from "@agentplat/collective-planning";
import {
  deepFreezePlanning,
  digestPlanningJsonV1,
  validateMissionIntentV1,
  validateMissionObservationV1,
  validatePlanFragmentProposalV1,
  validatePlanSelectionPolicyV1,
  validatePlanViewV1,
} from "@agentplat/collective-planning";
import type {
  CollectiveEvaluationRegistrationBindingV1,
  CollectiveEvaluationRunnerV2,
} from "@agentplat/collective-planning/evaluation";
import { validateCollectiveEvaluationRegistrationBindingV1 } from "@agentplat/collective-planning/evaluation";
import type { DelegationMandateV1 } from "@agentplat/collective-control";
import { validateDelegationMandateV1 } from "@agentplat/collective-control";

export interface CollectiveClosedLoopPeerV1 {
  readonly schemaVersion: 1;
  readonly peerId: string;
  readonly peerInstanceId: string;
  readonly capabilityKeys: readonly string[];
  readonly neighborPeerIds: readonly string[];
}

export interface CollectivePlanningDecisionContextV1 {
  readonly schemaVersion: 1;
  readonly peerId: string;
  readonly peerInstanceId: string;
  readonly missionIntent: MissionIntentV1;
  readonly observations: readonly MissionObservationV1[];
  readonly planView: PlanViewV1;
  readonly logicalTimeMs: number;
}

export interface CollectiveCentralizedPlanningDecisionContextV1 {
  readonly schemaVersion: 1;
  readonly ownerPeerId: string;
  readonly ownerPeerInstanceId: string;
  readonly missionIntent: MissionIntentV1;
  readonly observations: readonly MissionObservationV1[];
  readonly logicalTimeMs: number;
}

export type CollectivePlanningDecisionV1 =
  | {
      readonly schemaVersion: 1;
      readonly kind: "proposal";
      readonly proposal: PlanFragmentProposalV1;
    }
  | {
      readonly schemaVersion: 1;
      readonly kind: "challenge" | "abstain";
      readonly reasonCode: string;
    };

export interface CollectivePlanningDecisionPolicyV1 {
  readonly policyId: string;
  readonly policyVersion: number;
  readonly policyDigest: PlanningDigestV1;
  decide(
    context: CollectivePlanningDecisionContextV1,
  ): CollectivePlanningDecisionV1 | Promise<CollectivePlanningDecisionV1>;
  decideCentralized(
    context: CollectiveCentralizedPlanningDecisionContextV1,
  ): CollectivePlanningDecisionV1 | Promise<CollectivePlanningDecisionV1>;
}

export interface CollectiveClosedLoopDefinitionV1 {
  readonly schemaVersion: 1;
  readonly registration: CollectiveEvaluationRegistrationBindingV1;
  readonly missionIntent: MissionIntentV1;
  readonly selectionPolicy: PlanSelectionPolicyV1;
  readonly mandate: DelegationMandateV1;
  readonly peers: readonly CollectiveClosedLoopPeerV1[];
  readonly maximumLogicalTimeMs: number;
  readonly definitionDigest: PlanningDigestV1;
}

export type CollectiveClosedLoopStopReasonV1 =
  "plan_completed" | "hard_bound" | "interaction_limit" | "explicit_failure";

export interface CollectiveClosedLoopRunResultV1 {
  readonly schemaVersion: 1;
  readonly registrationBindingDigest: PlanningDigestV1;
  readonly runner: CollectiveEvaluationRunnerV2;
  readonly stopReason: CollectiveClosedLoopStopReasonV1;
  readonly finalLogicalTimeMs: number;
  readonly planningStateRoots: readonly PlanningDigestV1[];
  readonly meshStateRoots: readonly PlanningDigestV1[];
  readonly governanceStateRoots: readonly PlanningDigestV1[];
  readonly publicArtifacts: readonly PlanningJson[];
  readonly runDigest: PlanningDigestV1;
}

const peerKeys = Object.freeze([
  "schemaVersion",
  "peerId",
  "peerInstanceId",
  "capabilityKeys",
  "neighborPeerIds",
] as const);
const contextKeys = Object.freeze([
  "schemaVersion",
  "peerId",
  "peerInstanceId",
  "missionIntent",
  "observations",
  "planView",
  "logicalTimeMs",
] as const);
const centralizedContextKeys = Object.freeze([
  "schemaVersion",
  "ownerPeerId",
  "ownerPeerInstanceId",
  "missionIntent",
  "observations",
  "logicalTimeMs",
] as const);
const definitionBodyKeys = Object.freeze([
  "schemaVersion",
  "registration",
  "missionIntent",
  "selectionPolicy",
  "mandate",
  "peers",
  "maximumLogicalTimeMs",
] as const);
const definitionKeys = Object.freeze([
  ...definitionBodyKeys,
  "definitionDigest",
] as const);
const runBodyKeys = Object.freeze([
  "schemaVersion",
  "registrationBindingDigest",
  "runner",
  "stopReason",
  "finalLogicalTimeMs",
  "planningStateRoots",
  "meshStateRoots",
  "governanceStateRoots",
  "publicArtifacts",
] as const);
const runKeys = Object.freeze([...runBodyKeys, "runDigest"] as const);
const digestPattern = /^sha256:[0-9a-f]{64}$/u;
const tokenPattern = /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u;

function exact(
  value: unknown,
  keys: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`${label} must be a plain object`);
  const names = Object.getOwnPropertyNames(value).sort();
  const expected = [...keys].sort();
  const prototype = Object.getPrototypeOf(value);
  if (
    (prototype !== Object.prototype && prototype !== null) ||
    Object.getOwnPropertySymbols(value).length !== 0 ||
    names.length !== expected.length ||
    names.some((name, index) => name !== expected[index])
  )
    throw new TypeError(`${label} has an invalid shape`);
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor))
      throw new TypeError(`${label} must contain enumerable data properties`);
  }
}

function denseArray(value: unknown, label: string): asserts value is unknown[] {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    Object.getOwnPropertySymbols(value).length !== 0 ||
    Object.getOwnPropertyNames(value).length !== value.length + 1
  )
    throw new TypeError(`${label} must be a dense array`);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor))
      throw new TypeError(`${label} must contain enumerable data properties`);
  }
}

function identifier(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 256 ||
    /[\u0000-\u001f\u007f]/u.test(value)
  )
    throw new TypeError(`${label} must be a bounded identifier`);
}

function token(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length > 128 ||
    !tokenPattern.test(value)
  )
    throw new TypeError(`${label} must be a bounded token`);
}

function safeInteger(
  value: unknown,
  label: string,
  minimum = 0,
): asserts value is number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    Object.is(value, -0)
  )
    throw new TypeError(`${label} must be a safe integer`);
}

function digest(
  value: unknown,
  label: string,
): asserts value is PlanningDigestV1 {
  if (typeof value !== "string" || !digestPattern.test(value))
    throw new TypeError(`${label} must be a digest`);
}

function sortedStrings(
  value: unknown,
  label: string,
  maximum: number,
): readonly string[] {
  denseArray(value, label);
  if (value.length > maximum) throw new TypeError(`${label} is too large`);
  const result: string[] = [];
  let previous: string | null = null;
  for (const item of value) {
    token(item, label);
    if (previous !== null && previous >= item)
      throw new TypeError(`${label} must be sorted and unique`);
    previous = item;
    result.push(item);
  }
  return Object.freeze(result);
}

function validatePeer(value: unknown): CollectiveClosedLoopPeerV1 {
  exact(value, peerKeys, "closed-loop peer");
  if (value.schemaVersion !== 1)
    throw new TypeError("closed-loop peer schema is invalid");
  identifier(value.peerId, "peerId");
  identifier(value.peerInstanceId, "peerInstanceId");
  const capabilityKeys = sortedStrings(
    value.capabilityKeys,
    "capabilityKeys",
    256,
  );
  const neighborPeerIds = sortedStrings(
    value.neighborPeerIds,
    "neighborPeerIds",
    99,
  );
  if (neighborPeerIds.includes(value.peerId))
    throw new TypeError("a peer may not be its own neighbor");
  return deepFreezePlanning({
    schemaVersion: 1,
    peerId: value.peerId,
    peerInstanceId: value.peerInstanceId,
    capabilityKeys,
    neighborPeerIds,
  });
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((item, index) => item === right[index])
  );
}

function normalizedDefinitionBody(
  value: Record<string, unknown>,
): Omit<CollectiveClosedLoopDefinitionV1, "definitionDigest"> {
  if (value.schemaVersion !== 1)
    throw new TypeError("closed-loop definition schema is invalid");
  const registration = validateCollectiveEvaluationRegistrationBindingV1(
    value.registration,
  );
  if (registration.stratum !== "nominal")
    throw new TypeError("closed-loop Increment 5 supports nominal runs only");
  const missionIntent = validateMissionIntentV1(value.missionIntent);
  const selectionPolicy = validatePlanSelectionPolicyV1(value.selectionPolicy);
  const mandate = validateDelegationMandateV1(value.mandate);
  denseArray(value.peers, "peers");
  if (value.peers.length < 3 || value.peers.length > 100)
    throw new TypeError("closed-loop peer count is invalid");
  const peers = value.peers.map(validatePeer);
  safeInteger(value.maximumLogicalTimeMs, "maximumLogicalTimeMs", 1);

  let previousPeerKey = "";
  const peerIds = new Set<string>();
  const peerInstances = new Set<string>();
  for (const peer of peers) {
    const key = `${peer.peerId}\u0000${peer.peerInstanceId}`;
    if (previousPeerKey !== "" && previousPeerKey >= key)
      throw new TypeError("peers must be sorted and unique");
    previousPeerKey = key;
    if (peerIds.has(peer.peerId) || peerInstances.has(peer.peerInstanceId))
      throw new TypeError("peer identities must be unique");
    peerIds.add(peer.peerId);
    peerInstances.add(peer.peerInstanceId);
    if (
      peer.capabilityKeys.some(
        (capability) =>
          !missionIntent.permittedCapabilityKeys.includes(capability),
      )
    )
      throw new TypeError("peer capability widens the mission intent");
  }
  for (const peer of peers)
    for (const neighborId of peer.neighborPeerIds) {
      const neighbor = peers.find(
        (candidate) => candidate.peerId === neighborId,
      );
      if (!neighbor || !neighbor.neighborPeerIds.includes(peer.peerId))
        throw new TypeError("closed-loop topology must be known and symmetric");
    }

  const statement = mandate.statement;
  const sortedPeerIds = [...peerIds].sort();
  if (
    registration.tenantId !== missionIntent.tenantId ||
    registration.missionIntentId !== missionIntent.missionIntentId ||
    registration.intentRevision !== missionIntent.revision ||
    registration.intentDigest !== missionIntent.intentDigest ||
    missionIntent.selectionPolicyDigest !== selectionPolicy.policyDigest ||
    missionIntent.mandateDigest !== mandate.mandateDigest ||
    statement.tenantId !== missionIntent.tenantId ||
    statement.policyDomainId !== missionIntent.policyDomainId ||
    statement.objective.meshId !== missionIntent.objective.meshId ||
    statement.objective.objectiveId !== missionIntent.objective.objectiveId ||
    statement.objective.objectiveDocumentId !==
      missionIntent.objective.objectiveDocumentId ||
    missionIntent.objective.objectiveRevision <
      statement.objective.minimumObjectiveRevision ||
    missionIntent.objective.objectiveRevision >
      statement.objective.maximumObjectiveRevision ||
    statement.work.workItemIds.length !== 0 ||
    !sameStrings(statement.subjectPeerIds, sortedPeerIds) ||
    missionIntent.permittedCapabilityKeys.some(
      (capability) => !statement.permittedCapabilityKeys.includes(capability),
    ) ||
    Date.parse(missionIntent.validFrom) < Date.parse(statement.validFrom) ||
    Date.parse(missionIntent.validUntil) > Date.parse(statement.validUntil)
  )
    throw new TypeError(
      "closed-loop definition widens or conflicts with its registered authority",
    );

  return deepFreezePlanning({
    schemaVersion: 1,
    registration,
    missionIntent,
    selectionPolicy,
    mandate,
    peers,
    maximumLogicalTimeMs: value.maximumLogicalTimeMs,
  });
}

export function collectiveClosedLoopDefinitionDigestV1(
  value: Omit<CollectiveClosedLoopDefinitionV1, "definitionDigest">,
): PlanningDigestV1 {
  exact(value, definitionBodyKeys, "closed-loop definition body");
  const body = normalizedDefinitionBody(value);
  return digestPlanningJsonV1(
    "environment-state-v1",
    body as unknown as PlanningJson,
    {
      maximumBytes: 67_108_864,
      maximumDepth: 64,
      maximumNodes: 2_000_000,
      maximumKeysPerObject: 4_096,
      maximumItemsPerArray: 262_144,
    },
  );
}

export function createCollectiveClosedLoopDefinitionV1(
  input: Omit<CollectiveClosedLoopDefinitionV1, "definitionDigest">,
): CollectiveClosedLoopDefinitionV1 {
  exact(input, definitionBodyKeys, "closed-loop definition input");
  const body = normalizedDefinitionBody(input);
  return deepFreezePlanning({
    ...body,
    definitionDigest: collectiveClosedLoopDefinitionDigestV1(body),
  });
}

export function validateCollectiveClosedLoopDefinitionV1(
  value: unknown,
): CollectiveClosedLoopDefinitionV1 {
  exact(value, definitionKeys, "closed-loop definition");
  digest(value.definitionDigest, "definitionDigest");
  const body = normalizedDefinitionBody(value);
  const definitionDigest = collectiveClosedLoopDefinitionDigestV1(body);
  if (value.definitionDigest !== definitionDigest)
    throw new TypeError("closed-loop definition digest is invalid");
  return deepFreezePlanning({ ...body, definitionDigest });
}

export function validateCollectivePlanningDecisionContextV1(
  value: unknown,
): CollectivePlanningDecisionContextV1 {
  exact(value, contextKeys, "planning decision context");
  if (value.schemaVersion !== 1)
    throw new TypeError("planning decision context schema is invalid");
  identifier(value.peerId, "peerId");
  identifier(value.peerInstanceId, "peerInstanceId");
  safeInteger(value.logicalTimeMs, "logicalTimeMs");
  const missionIntent = validateMissionIntentV1(value.missionIntent);
  const planView = validatePlanViewV1(value.planView);
  denseArray(value.observations, "observations");
  const observations = value.observations.map(validateMissionObservationV1);
  const digests = new Set<string>();
  for (const observation of observations) {
    if (
      digests.has(observation.observationDigest) ||
      observation.observerPeerId !== value.peerId ||
      observation.observerInstanceId !== value.peerInstanceId ||
      observation.missionIntentId !== missionIntent.missionIntentId ||
      observation.intentRevision !== missionIntent.revision ||
      observation.intentDigest !== missionIntent.intentDigest ||
      observation.logicalTimeMs > value.logicalTimeMs
    )
      throw new TypeError("planning decision observation is not peer-local");
    digests.add(observation.observationDigest);
  }
  if (
    planView.missionIntentId !== missionIntent.missionIntentId ||
    planView.intentRevision !== missionIntent.revision ||
    planView.intentDigest !== missionIntent.intentDigest ||
    planView.logicalTimeHighWaterMs > value.logicalTimeMs
  )
    throw new TypeError("planning decision view is not current");
  return deepFreezePlanning({
    schemaVersion: 1,
    peerId: value.peerId,
    peerInstanceId: value.peerInstanceId,
    missionIntent,
    observations,
    planView,
    logicalTimeMs: value.logicalTimeMs,
  });
}

export function validateCollectiveCentralizedPlanningDecisionContextV1(
  value: unknown,
): CollectiveCentralizedPlanningDecisionContextV1 {
  exact(value, centralizedContextKeys, "centralized planning decision context");
  if (value.schemaVersion !== 1)
    throw new TypeError("centralized planning decision context schema is invalid");
  identifier(value.ownerPeerId, "ownerPeerId");
  identifier(value.ownerPeerInstanceId, "ownerPeerInstanceId");
  safeInteger(value.logicalTimeMs, "logicalTimeMs");
  const missionIntent = validateMissionIntentV1(value.missionIntent);
  denseArray(value.observations, "observations");
  const observations = value.observations.map(validateMissionObservationV1);
  const digests = new Set<string>();
  let ownerObservationFound = false;
  for (const observation of observations) {
    if (
      digests.has(observation.observationDigest) ||
      observation.missionIntentId !== missionIntent.missionIntentId ||
      observation.intentRevision !== missionIntent.revision ||
      observation.intentDigest !== missionIntent.intentDigest ||
      observation.logicalTimeMs > value.logicalTimeMs
    )
      throw new TypeError("centralized planning observation is not current");
    digests.add(observation.observationDigest);
    if (
      observation.observerPeerId === value.ownerPeerId &&
      observation.observerInstanceId === value.ownerPeerInstanceId
    )
      ownerObservationFound = true;
  }
  if (!ownerObservationFound)
    throw new TypeError("centralized planning owner observation is missing");
  return deepFreezePlanning({
    schemaVersion: 1,
    ownerPeerId: value.ownerPeerId,
    ownerPeerInstanceId: value.ownerPeerInstanceId,
    missionIntent,
    observations,
    logicalTimeMs: value.logicalTimeMs,
  });
}

export function validateCollectivePlanningDecisionV1(
  value: unknown,
): CollectivePlanningDecisionV1 {
  const kindDescriptor =
    value !== null && typeof value === "object"
      ? Object.getOwnPropertyDescriptor(value, "kind")
      : undefined;
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    kindDescriptor !== undefined &&
    "value" in kindDescriptor &&
    kindDescriptor.value === "proposal"
  ) {
    exact(value, ["schemaVersion", "kind", "proposal"], "planning decision");
    if (value.schemaVersion !== 1)
      throw new TypeError("planning decision schema is invalid");
    return deepFreezePlanning({
      schemaVersion: 1,
      kind: "proposal",
      proposal: validatePlanFragmentProposalV1(value.proposal),
    });
  }
  exact(value, ["schemaVersion", "kind", "reasonCode"], "planning decision");
  if (
    value.schemaVersion !== 1 ||
    (value.kind !== "challenge" && value.kind !== "abstain")
  )
    throw new TypeError("planning decision kind is invalid");
  token(value.reasonCode, "reasonCode");
  return deepFreezePlanning({
    schemaVersion: 1,
    kind: value.kind,
    reasonCode: value.reasonCode,
  });
}

function sortedDigests(
  value: unknown,
  label: string,
): readonly PlanningDigestV1[] {
  denseArray(value, label);
  const result: PlanningDigestV1[] = [];
  let previous: string | null = null;
  for (const item of value) {
    digest(item, label);
    if (previous !== null && previous >= item)
      throw new TypeError(`${label} must be sorted and unique`);
    previous = item;
    result.push(item);
  }
  return Object.freeze(result);
}

function normalizedRunBody(
  value: Record<string, unknown>,
): Omit<CollectiveClosedLoopRunResultV1, "runDigest"> {
  if (value.schemaVersion !== 1)
    throw new TypeError("closed-loop run result schema is invalid");
  digest(value.registrationBindingDigest, "registrationBindingDigest");
  if (
    value.runner !== "adaptive_collective" &&
    value.runner !== "centralized_planner"
  )
    throw new TypeError("closed-loop runner is invalid");
  if (
    value.stopReason !== "plan_completed" &&
    value.stopReason !== "hard_bound" &&
    value.stopReason !== "interaction_limit" &&
    value.stopReason !== "explicit_failure"
  )
    throw new TypeError("closed-loop stop reason is invalid");
  safeInteger(value.finalLogicalTimeMs, "finalLogicalTimeMs");
  const planningStateRoots = sortedDigests(
    value.planningStateRoots,
    "planningStateRoots",
  );
  const meshStateRoots = sortedDigests(value.meshStateRoots, "meshStateRoots");
  const governanceStateRoots = sortedDigests(
    value.governanceStateRoots,
    "governanceStateRoots",
  );
  denseArray(value.publicArtifacts, "publicArtifacts");
  digestPlanningJsonV1("environment-state-v1", {
    publicArtifacts: value.publicArtifacts as PlanningJson[],
  });
  const publicArtifacts = deepFreezePlanning(
    structuredClone(value.publicArtifacts as PlanningJson[]),
  );
  return deepFreezePlanning({
    schemaVersion: 1,
    registrationBindingDigest: value.registrationBindingDigest,
    runner: value.runner,
    stopReason: value.stopReason,
    finalLogicalTimeMs: value.finalLogicalTimeMs,
    planningStateRoots,
    meshStateRoots,
    governanceStateRoots,
    publicArtifacts,
  });
}

function runDigestV1(
  body: Omit<CollectiveClosedLoopRunResultV1, "runDigest">,
): PlanningDigestV1 {
  return digestPlanningJsonV1(
    "environment-state-v1",
    body as unknown as PlanningJson,
    {
      maximumBytes: 67_108_864,
      maximumDepth: 64,
      maximumNodes: 2_000_000,
      maximumKeysPerObject: 4_096,
      maximumItemsPerArray: 262_144,
    },
  );
}

export function createCollectiveClosedLoopRunResultV1(
  input: Omit<CollectiveClosedLoopRunResultV1, "runDigest">,
): CollectiveClosedLoopRunResultV1 {
  exact(input, runBodyKeys, "closed-loop run result input");
  const body = normalizedRunBody(input);
  return deepFreezePlanning({ ...body, runDigest: runDigestV1(body) });
}

export function validateCollectiveClosedLoopRunResultV1(
  value: unknown,
): CollectiveClosedLoopRunResultV1 {
  exact(value, runKeys, "closed-loop run result");
  digest(value.runDigest, "runDigest");
  const body = normalizedRunBody(value);
  const runDigest = runDigestV1(body);
  if (value.runDigest !== runDigest)
    throw new TypeError("closed-loop run result digest is invalid");
  return deepFreezePlanning({ ...body, runDigest });
}
