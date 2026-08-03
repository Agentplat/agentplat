import type {
  PlanningDigestV1,
  PlanningJson,
} from "@agentplat/collective-planning";
import {
  deepFreezePlanning,
  digestPlanningJsonV1,
} from "@agentplat/collective-planning";
import {
  validateCollectiveClosedLoopDefinitionV1,
  validateCollectiveClosedLoopRunResultV1,
  type CollectiveClosedLoopDefinitionV1,
  type CollectiveClosedLoopRunResultV1,
} from "./collective-closed-loop-contracts.js";

/** The closed-loop reference surface deliberately bounds one compact fault plan. */
export const COLLECTIVE_CLOSED_LOOP_RESILIENCE_LIMITS_V1 = Object.freeze({
  maximumFaults: 8,
  minimumEpochs: 2,
  maximumEpochs: 3,
  maximumLinksPerFault: 49,
  maximumTargetsPerFault: 50,
  maximumCausalPredecessorsPerFault: 7,
  maximumStaleResultRejections: 8,
});

export type CollectiveClosedLoopFaultFamilyV1 =
  | "capability.withdraw"
  | "assignment.decline"
  | "peer.crash"
  | "peer.restart"
  | "network.partition"
  | "network.heal";

export interface CollectiveClosedLoopFaultLinkV1 {
  readonly schemaVersion: 1;
  readonly fromPeerId: string;
  readonly toPeerId: string;
}

export interface CollectiveClosedLoopFaultTargetV1 {
  readonly schemaVersion: 1;
  readonly peerId: string;
}

/** A trigger never exposes future evaluator state to a runner. */
export type CollectiveClosedLoopFaultTriggerV1 =
  | {
      readonly schemaVersion: 1;
      readonly kind: "logical_time";
      readonly logicalTimeMs: number;
      readonly causalEventDigest: null;
    }
  | {
      readonly schemaVersion: 1;
      readonly kind: "trace_event";
      readonly logicalTimeMs: number;
      readonly causalEventDigest: PlanningDigestV1;
    };

export interface CollectiveClosedLoopFaultPlanEntryV1 {
  readonly schemaVersion: 1;
  readonly faultId: string;
  readonly family: CollectiveClosedLoopFaultFamilyV1;
  readonly trigger: CollectiveClosedLoopFaultTriggerV1;
  /** Sorted predecessors form the plan's explicit causal DAG. */
  readonly causalPredecessorFaultIds: readonly string[];
  /** Sorted directed links are only meaningful for network faults. */
  readonly links: readonly CollectiveClosedLoopFaultLinkV1[];
  /** Sorted peers are only meaningful for peer/capability/allocation faults. */
  readonly targets: readonly CollectiveClosedLoopFaultTargetV1[];
}

export interface CollectiveClosedLoopFaultPlanV1 {
  readonly schemaVersion: 1;
  readonly nominalDefinitionDigest: PlanningDigestV1;
  readonly faults: readonly CollectiveClosedLoopFaultPlanEntryV1[];
  readonly faultPlanDigest: PlanningDigestV1;
}

/**
 * An additive resilience wrapper. The nominal definition remains immutable and
 * continues to own authority, topology and evaluation identity.
 */
export interface CollectiveClosedLoopResilienceDefinitionV1 {
  readonly schemaVersion: 1;
  readonly nominalDefinition: CollectiveClosedLoopDefinitionV1;
  readonly faultPlan: CollectiveClosedLoopFaultPlanV1;
  readonly maximumEpochs: number;
  readonly resilienceDefinitionDigest: PlanningDigestV1;
}

export interface CollectiveClosedLoopResilienceEpochV1 {
  readonly schemaVersion: 1;
  readonly epoch: number;
  readonly startedAtLogicalMs: number;
  readonly endedAtLogicalMs: number;
  readonly planningStateRoot: PlanningDigestV1;
  readonly meshStateRoot: PlanningDigestV1;
  readonly governanceStateRoot: PlanningDigestV1;
}

export interface CollectiveClosedLoopFaultObservationV1 {
  readonly schemaVersion: 1;
  readonly faultId: string;
  readonly scheduledEventDigest: PlanningDigestV1;
  readonly injectedEventDigest: PlanningDigestV1;
  readonly observedEventDigest: PlanningDigestV1;
}

export interface CollectiveClosedLoopStaleResultRejectionV1 {
  readonly schemaVersion: 1;
  readonly rejectionId: string;
  readonly faultId: string;
  readonly rejectedAtLogicalMs: number;
  readonly staleFenceDigest: PlanningDigestV1;
  readonly currentFenceDigest: PlanningDigestV1;
  readonly rejectionEventDigest: PlanningDigestV1;
}

export interface CollectiveClosedLoopResilienceResultV1 {
  readonly schemaVersion: 1;
  readonly resilienceDefinitionDigest: PlanningDigestV1;
  readonly run: CollectiveClosedLoopRunResultV1;
  readonly epochs: readonly CollectiveClosedLoopResilienceEpochV1[];
  /** Every planned fault must have a concrete scheduled, injected and observed event. */
  readonly faultObservations: readonly CollectiveClosedLoopFaultObservationV1[];
  readonly staleResultRejections: readonly CollectiveClosedLoopStaleResultRejectionV1[];
  readonly resilienceResultDigest: PlanningDigestV1;
}

export interface CollectiveClosedLoopResilienceCampaignLimitsV1 {
  readonly schemaVersion: 1;
  readonly maximumFaults: number;
  readonly maximumEpochs: number;
  readonly maximumInteractions: number;
}

export interface CollectiveClosedLoopResilienceCampaignEvidenceV1 {
  readonly schemaVersion: 1;
  readonly resilienceDefinitionDigest: PlanningDigestV1;
  readonly resilienceResultDigest: PlanningDigestV1;
  readonly runner: "adaptive_collective" | "centralized_planner";
  readonly seed: number;
  readonly limits: CollectiveClosedLoopResilienceCampaignLimitsV1;
  readonly scheduledFaultIds: readonly string[];
  readonly injectedFaultIds: readonly string[];
  readonly observedFaultIds: readonly string[];
  readonly staleResultRejectionIds: readonly string[];
  readonly campaignEvidenceDigest: PlanningDigestV1;
}

const digestPattern = /^sha256:[0-9a-f]{64}$/u;
const tokenPattern = /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u;
const faultFamilies = new Set<CollectiveClosedLoopFaultFamilyV1>([
  "capability.withdraw",
  "assignment.decline",
  "peer.crash",
  "peer.restart",
  "network.partition",
  "network.heal",
]);
const faultPlanBodyKeys = [
  "schemaVersion",
  "nominalDefinitionDigest",
  "faults",
] as const;
const faultPlanKeys = [...faultPlanBodyKeys, "faultPlanDigest"] as const;
const resilienceDefinitionBodyKeys = [
  "schemaVersion",
  "nominalDefinition",
  "faultPlan",
  "maximumEpochs",
] as const;
const resilienceDefinitionKeys = [
  ...resilienceDefinitionBodyKeys,
  "resilienceDefinitionDigest",
] as const;
const resilienceResultBodyKeys = [
  "schemaVersion",
  "resilienceDefinitionDigest",
  "run",
  "epochs",
  "faultObservations",
  "staleResultRejections",
] as const;
const resilienceResultKeys = [
  ...resilienceResultBodyKeys,
  "resilienceResultDigest",
] as const;
const campaignEvidenceBodyKeys = [
  "schemaVersion",
  "resilienceDefinitionDigest",
  "resilienceResultDigest",
  "runner",
  "seed",
  "limits",
  "scheduledFaultIds",
  "injectedFaultIds",
  "observedFaultIds",
  "staleResultRejectionIds",
] as const;
const campaignEvidenceKeys = [
  ...campaignEvidenceBodyKeys,
  "campaignEvidenceDigest",
] as const;

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

function token(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 128 ||
    !tokenPattern.test(value)
  )
    throw new TypeError(`${label} must be a bounded token`);
}

function digest(
  value: unknown,
  label: string,
): asserts value is PlanningDigestV1 {
  if (typeof value !== "string" || !digestPattern.test(value))
    throw new TypeError(`${label} must be a digest`);
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

function sortedTokens(
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

function digestBody(domain: string, value: PlanningJson): PlanningDigestV1 {
  return digestPlanningJsonV1(
    "environment-state-v1",
    { domain, value },
    {
      maximumBytes: 1_048_576,
      maximumDepth: 32,
      maximumNodes: 32_768,
      maximumKeysPerObject: 256,
      maximumItemsPerArray: 4_096,
    },
  );
}

function validateTrigger(value: unknown): CollectiveClosedLoopFaultTriggerV1 {
  exact(
    value,
    ["schemaVersion", "kind", "logicalTimeMs", "causalEventDigest"],
    "closed-loop fault trigger",
  );
  if (value.schemaVersion !== 1)
    throw new TypeError("closed-loop fault trigger schema is invalid");
  safeInteger(value.logicalTimeMs, "fault trigger logicalTimeMs");
  if (value.kind === "logical_time" && value.causalEventDigest === null)
    return deepFreezePlanning({
      schemaVersion: 1,
      kind: "logical_time" as const,
      logicalTimeMs: value.logicalTimeMs,
      causalEventDigest: null,
    });
  if (value.kind === "trace_event") {
    digest(value.causalEventDigest, "fault trigger causalEventDigest");
    return deepFreezePlanning({
      schemaVersion: 1,
      kind: "trace_event" as const,
      logicalTimeMs: value.logicalTimeMs,
      causalEventDigest: value.causalEventDigest,
    });
  }
  throw new TypeError("closed-loop fault trigger is invalid");
}

function validateLink(value: unknown): CollectiveClosedLoopFaultLinkV1 {
  exact(
    value,
    ["schemaVersion", "fromPeerId", "toPeerId"],
    "closed-loop fault link",
  );
  if (value.schemaVersion !== 1)
    throw new TypeError("closed-loop fault link schema is invalid");
  token(value.fromPeerId, "fault link fromPeerId");
  token(value.toPeerId, "fault link toPeerId");
  if (value.fromPeerId === value.toPeerId)
    throw new TypeError("closed-loop fault link may not be reflexive");
  return deepFreezePlanning({
    schemaVersion: 1,
    fromPeerId: value.fromPeerId,
    toPeerId: value.toPeerId,
  });
}

function validateTarget(value: unknown): CollectiveClosedLoopFaultTargetV1 {
  exact(value, ["schemaVersion", "peerId"], "closed-loop fault target");
  if (value.schemaVersion !== 1)
    throw new TypeError("closed-loop fault target schema is invalid");
  token(value.peerId, "fault target peerId");
  return deepFreezePlanning({ schemaVersion: 1, peerId: value.peerId });
}

function compareLink(
  left: CollectiveClosedLoopFaultLinkV1,
  right: CollectiveClosedLoopFaultLinkV1,
): number {
  const leftKey = `${left.fromPeerId}\u0000${left.toPeerId}`;
  const rightKey = `${right.fromPeerId}\u0000${right.toPeerId}`;
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

function sortedLinks(
  value: unknown,
): readonly CollectiveClosedLoopFaultLinkV1[] {
  denseArray(value, "fault links");
  if (
    value.length >
    COLLECTIVE_CLOSED_LOOP_RESILIENCE_LIMITS_V1.maximumLinksPerFault
  )
    throw new TypeError("fault links are too large");
  const links = value.map(validateLink);
  for (let index = 1; index < links.length; index += 1)
    if (compareLink(links[index - 1], links[index]) >= 0)
      throw new TypeError("fault links must be sorted and unique");
  return Object.freeze(links);
}

function sortedTargets(
  value: unknown,
): readonly CollectiveClosedLoopFaultTargetV1[] {
  denseArray(value, "fault targets");
  if (
    value.length >
    COLLECTIVE_CLOSED_LOOP_RESILIENCE_LIMITS_V1.maximumTargetsPerFault
  )
    throw new TypeError("fault targets are too large");
  const targets = value.map(validateTarget);
  for (let index = 1; index < targets.length; index += 1)
    if (targets[index - 1].peerId >= targets[index].peerId)
      throw new TypeError("fault targets must be sorted and unique");
  return Object.freeze(targets);
}

function validateFault(value: unknown): CollectiveClosedLoopFaultPlanEntryV1 {
  exact(
    value,
    [
      "schemaVersion",
      "faultId",
      "family",
      "trigger",
      "causalPredecessorFaultIds",
      "links",
      "targets",
    ],
    "closed-loop fault",
  );
  if (
    value.schemaVersion !== 1 ||
    !faultFamilies.has(value.family as CollectiveClosedLoopFaultFamilyV1)
  )
    throw new TypeError("closed-loop fault family is invalid");
  token(value.faultId, "faultId");
  const trigger = validateTrigger(value.trigger);
  const causalPredecessorFaultIds = sortedTokens(
    value.causalPredecessorFaultIds,
    "causalPredecessorFaultIds",
    COLLECTIVE_CLOSED_LOOP_RESILIENCE_LIMITS_V1.maximumCausalPredecessorsPerFault,
  );
  if (causalPredecessorFaultIds.includes(value.faultId))
    throw new TypeError("closed-loop fault may not causally depend on itself");
  const links = sortedLinks(value.links);
  const targets = sortedTargets(value.targets);
  const networkFault =
    value.family === "network.partition" || value.family === "network.heal";
  if (
    (networkFault && (links.length === 0 || targets.length !== 0)) ||
    (!networkFault && (links.length !== 0 || targets.length === 0))
  )
    throw new TypeError(
      "closed-loop fault family has invalid links or targets",
    );
  return deepFreezePlanning({
    schemaVersion: 1,
    faultId: value.faultId,
    family: value.family as CollectiveClosedLoopFaultFamilyV1,
    trigger,
    causalPredecessorFaultIds,
    links,
    targets,
  });
}

function normalizedFaultPlanBody(
  value: Record<string, unknown>,
): Omit<CollectiveClosedLoopFaultPlanV1, "faultPlanDigest"> {
  if (value.schemaVersion !== 1)
    throw new TypeError("closed-loop fault plan schema is invalid");
  digest(value.nominalDefinitionDigest, "nominalDefinitionDigest");
  denseArray(value.faults, "faults");
  if (
    value.faults.length === 0 ||
    value.faults.length >
      COLLECTIVE_CLOSED_LOOP_RESILIENCE_LIMITS_V1.maximumFaults
  )
    throw new TypeError("closed-loop fault count is invalid");
  const faults = value.faults.map(validateFault);
  const faultsById = new Map<string, CollectiveClosedLoopFaultPlanEntryV1>();
  let previousId: string | null = null;
  let previousLogicalTime = -1;
  for (const fault of faults) {
    if (previousId !== null && previousId >= fault.faultId)
      throw new TypeError("closed-loop faults must be sorted and unique");
    if (fault.trigger.logicalTimeMs < previousLogicalTime)
      throw new TypeError("closed-loop faults must be ordered by trigger time");
    previousId = fault.faultId;
    previousLogicalTime = fault.trigger.logicalTimeMs;
    faultsById.set(fault.faultId, fault);
  }
  for (const fault of faults) {
    for (const predecessorId of fault.causalPredecessorFaultIds) {
      const predecessor = faultsById.get(predecessorId);
      if (
        !predecessor ||
        predecessor.trigger.logicalTimeMs >= fault.trigger.logicalTimeMs
      )
        throw new TypeError("closed-loop fault causal predecessor is invalid");
    }
    if (
      fault.family === "peer.restart" &&
      !fault.causalPredecessorFaultIds.some((id) => {
        const predecessor = faultsById.get(id);
        return (
          predecessor?.family === "peer.crash" &&
          predecessor.targets.some((target) =>
            fault.targets.some((restart) => restart.peerId === target.peerId),
          )
        );
      })
    )
      throw new TypeError("closed-loop peer restart requires a causal crash");
    if (
      fault.family === "network.heal" &&
      !fault.causalPredecessorFaultIds.some((id) => {
        const predecessor = faultsById.get(id);
        return (
          predecessor?.family === "network.partition" &&
          predecessor.links.length === fault.links.length &&
          predecessor.links.every(
            (link, index) => compareLink(link, fault.links[index]) === 0,
          )
        );
      })
    )
      throw new TypeError(
        "closed-loop network heal requires its causal partition",
      );
  }
  return deepFreezePlanning({
    schemaVersion: 1,
    nominalDefinitionDigest: value.nominalDefinitionDigest,
    faults,
  });
}

export function collectiveClosedLoopFaultPlanDigestV1(
  value: Omit<CollectiveClosedLoopFaultPlanV1, "faultPlanDigest">,
): PlanningDigestV1 {
  exact(value, faultPlanBodyKeys, "closed-loop fault plan body");
  const body = normalizedFaultPlanBody(value);
  return digestBody(
    "collective-closed-loop-fault-plan-v1",
    body as unknown as PlanningJson,
  );
}

export function createCollectiveClosedLoopFaultPlanV1(
  input: Omit<CollectiveClosedLoopFaultPlanV1, "faultPlanDigest">,
): CollectiveClosedLoopFaultPlanV1 {
  exact(input, faultPlanBodyKeys, "closed-loop fault plan input");
  const body = normalizedFaultPlanBody(input);
  return deepFreezePlanning({
    ...body,
    faultPlanDigest: collectiveClosedLoopFaultPlanDigestV1(body),
  });
}

export function validateCollectiveClosedLoopFaultPlanV1(
  value: unknown,
): CollectiveClosedLoopFaultPlanV1 {
  exact(value, faultPlanKeys, "closed-loop fault plan");
  digest(value.faultPlanDigest, "faultPlanDigest");
  const body = normalizedFaultPlanBody(value);
  const faultPlanDigest = collectiveClosedLoopFaultPlanDigestV1(body);
  if (value.faultPlanDigest !== faultPlanDigest)
    throw new TypeError("closed-loop fault plan digest is invalid");
  return deepFreezePlanning({ ...body, faultPlanDigest });
}

function assertFaultPlanTargetsBound(
  plan: CollectiveClosedLoopFaultPlanV1,
  definition: CollectiveClosedLoopDefinitionV1,
): void {
  const peers = new Map(definition.peers.map((peer) => [peer.peerId, peer]));
  for (const fault of plan.faults) {
    if (fault.trigger.logicalTimeMs > definition.maximumLogicalTimeMs)
      throw new TypeError(
        "closed-loop fault trigger exceeds the nominal logical-time bound",
      );
    for (const target of fault.targets)
      if (!peers.has(target.peerId))
        throw new TypeError(
          "closed-loop fault target is outside the nominal definition",
        );
    for (const link of fault.links) {
      const fromPeer = peers.get(link.fromPeerId);
      if (!fromPeer || !peers.has(link.toPeerId))
        throw new TypeError(
          "closed-loop fault link is outside the nominal definition",
        );
      if (!fromPeer.neighborPeerIds.includes(link.toPeerId))
        throw new TypeError(
          "closed-loop fault link is outside the nominal topology",
        );
    }
  }
}

function normalizedResilienceDefinitionBody(
  value: Record<string, unknown>,
): Omit<
  CollectiveClosedLoopResilienceDefinitionV1,
  "resilienceDefinitionDigest"
> {
  if (value.schemaVersion !== 1)
    throw new TypeError("closed-loop resilience definition schema is invalid");
  const nominalDefinition = validateCollectiveClosedLoopDefinitionV1(
    value.nominalDefinition,
  );
  const faultPlan = validateCollectiveClosedLoopFaultPlanV1(value.faultPlan);
  safeInteger(
    value.maximumEpochs,
    "maximumEpochs",
    COLLECTIVE_CLOSED_LOOP_RESILIENCE_LIMITS_V1.minimumEpochs,
  );
  if (
    value.maximumEpochs >
    COLLECTIVE_CLOSED_LOOP_RESILIENCE_LIMITS_V1.maximumEpochs
  )
    throw new TypeError("maximumEpochs exceeds the resilience limit");
  if (faultPlan.nominalDefinitionDigest !== nominalDefinition.definitionDigest)
    throw new TypeError(
      "closed-loop resilience fault plan is not bound to its nominal definition",
    );
  assertFaultPlanTargetsBound(faultPlan, nominalDefinition);
  return deepFreezePlanning({
    schemaVersion: 1,
    nominalDefinition,
    faultPlan,
    maximumEpochs: value.maximumEpochs,
  });
}

export function collectiveClosedLoopResilienceDefinitionDigestV1(
  value: Omit<
    CollectiveClosedLoopResilienceDefinitionV1,
    "resilienceDefinitionDigest"
  >,
): PlanningDigestV1 {
  exact(
    value,
    resilienceDefinitionBodyKeys,
    "closed-loop resilience definition body",
  );
  const body = normalizedResilienceDefinitionBody(value);
  return digestBody(
    "collective-closed-loop-resilience-definition-v1",
    body as unknown as PlanningJson,
  );
}

export function createCollectiveClosedLoopResilienceDefinitionV1(
  input: Omit<
    CollectiveClosedLoopResilienceDefinitionV1,
    "resilienceDefinitionDigest"
  >,
): CollectiveClosedLoopResilienceDefinitionV1 {
  exact(
    input,
    resilienceDefinitionBodyKeys,
    "closed-loop resilience definition input",
  );
  const body = normalizedResilienceDefinitionBody(input);
  return deepFreezePlanning({
    ...body,
    resilienceDefinitionDigest:
      collectiveClosedLoopResilienceDefinitionDigestV1(body),
  });
}

export function validateCollectiveClosedLoopResilienceDefinitionV1(
  value: unknown,
): CollectiveClosedLoopResilienceDefinitionV1 {
  exact(value, resilienceDefinitionKeys, "closed-loop resilience definition");
  digest(value.resilienceDefinitionDigest, "resilienceDefinitionDigest");
  const body = normalizedResilienceDefinitionBody(value);
  const resilienceDefinitionDigest =
    collectiveClosedLoopResilienceDefinitionDigestV1(body);
  if (value.resilienceDefinitionDigest !== resilienceDefinitionDigest)
    throw new TypeError("closed-loop resilience definition digest is invalid");
  return deepFreezePlanning({ ...body, resilienceDefinitionDigest });
}

function validateEpoch(value: unknown): CollectiveClosedLoopResilienceEpochV1 {
  exact(
    value,
    [
      "schemaVersion",
      "epoch",
      "startedAtLogicalMs",
      "endedAtLogicalMs",
      "planningStateRoot",
      "meshStateRoot",
      "governanceStateRoot",
    ],
    "closed-loop resilience epoch",
  );
  if (value.schemaVersion !== 1)
    throw new TypeError("closed-loop resilience epoch schema is invalid");
  safeInteger(value.epoch, "epoch", 1);
  safeInteger(value.startedAtLogicalMs, "startedAtLogicalMs");
  safeInteger(value.endedAtLogicalMs, "endedAtLogicalMs");
  if (value.endedAtLogicalMs < value.startedAtLogicalMs)
    throw new TypeError("closed-loop resilience epoch ends before it starts");
  digest(value.planningStateRoot, "planningStateRoot");
  digest(value.meshStateRoot, "meshStateRoot");
  digest(value.governanceStateRoot, "governanceStateRoot");
  return deepFreezePlanning({
    schemaVersion: 1,
    epoch: value.epoch,
    startedAtLogicalMs: value.startedAtLogicalMs,
    endedAtLogicalMs: value.endedAtLogicalMs,
    planningStateRoot: value.planningStateRoot,
    meshStateRoot: value.meshStateRoot,
    governanceStateRoot: value.governanceStateRoot,
  });
}

function validateFaultObservation(
  value: unknown,
): CollectiveClosedLoopFaultObservationV1 {
  exact(
    value,
    [
      "schemaVersion",
      "faultId",
      "scheduledEventDigest",
      "injectedEventDigest",
      "observedEventDigest",
    ],
    "closed-loop fault observation",
  );
  if (value.schemaVersion !== 1)
    throw new TypeError("closed-loop fault observation schema is invalid");
  token(value.faultId, "fault observation faultId");
  digest(value.scheduledEventDigest, "scheduledEventDigest");
  digest(value.injectedEventDigest, "injectedEventDigest");
  digest(value.observedEventDigest, "observedEventDigest");
  return deepFreezePlanning({
    schemaVersion: 1,
    faultId: value.faultId,
    scheduledEventDigest: value.scheduledEventDigest,
    injectedEventDigest: value.injectedEventDigest,
    observedEventDigest: value.observedEventDigest,
  });
}

function validateStaleResultRejection(
  value: unknown,
): CollectiveClosedLoopStaleResultRejectionV1 {
  exact(
    value,
    [
      "schemaVersion",
      "rejectionId",
      "faultId",
      "rejectedAtLogicalMs",
      "staleFenceDigest",
      "currentFenceDigest",
      "rejectionEventDigest",
    ],
    "closed-loop stale result rejection",
  );
  if (value.schemaVersion !== 1)
    throw new TypeError("closed-loop stale result rejection schema is invalid");
  token(value.rejectionId, "stale result rejectionId");
  token(value.faultId, "stale result faultId");
  safeInteger(value.rejectedAtLogicalMs, "stale result rejectedAtLogicalMs");
  digest(value.staleFenceDigest, "staleFenceDigest");
  digest(value.currentFenceDigest, "currentFenceDigest");
  digest(value.rejectionEventDigest, "rejectionEventDigest");
  if (value.staleFenceDigest === value.currentFenceDigest)
    throw new TypeError("stale result rejection must bind distinct fences");
  return deepFreezePlanning({
    schemaVersion: 1,
    rejectionId: value.rejectionId,
    faultId: value.faultId,
    rejectedAtLogicalMs: value.rejectedAtLogicalMs,
    staleFenceDigest: value.staleFenceDigest,
    currentFenceDigest: value.currentFenceDigest,
    rejectionEventDigest: value.rejectionEventDigest,
  });
}

function normalizedResilienceResultBody(
  value: Record<string, unknown>,
): Omit<CollectiveClosedLoopResilienceResultV1, "resilienceResultDigest"> {
  if (value.schemaVersion !== 1)
    throw new TypeError("closed-loop resilience result schema is invalid");
  digest(value.resilienceDefinitionDigest, "resilienceDefinitionDigest");
  const run = validateCollectiveClosedLoopRunResultV1(value.run);
  denseArray(value.epochs, "epochs");
  if (
    value.epochs.length <
      COLLECTIVE_CLOSED_LOOP_RESILIENCE_LIMITS_V1.minimumEpochs ||
    value.epochs.length >
      COLLECTIVE_CLOSED_LOOP_RESILIENCE_LIMITS_V1.maximumEpochs
  )
    throw new TypeError("closed-loop resilience epoch count is invalid");
  const epochs = value.epochs.map(validateEpoch);
  for (let index = 0; index < epochs.length; index += 1) {
    const epoch = epochs[index];
    if (
      epoch.epoch !== index + 1 ||
      (index === 0 && epoch.startedAtLogicalMs !== 0) ||
      (index > 0 &&
        epoch.startedAtLogicalMs !== epochs[index - 1].endedAtLogicalMs)
    )
      throw new TypeError("closed-loop resilience epochs are not ordered");
  }
  if (epochs[epochs.length - 1].endedAtLogicalMs !== run.finalLogicalTimeMs)
    throw new TypeError("closed-loop resilience epochs do not close the run");
  denseArray(value.faultObservations, "faultObservations");
  const faultObservations = value.faultObservations.map(
    validateFaultObservation,
  );
  let previousFaultId: string | null = null;
  const retainedEventDigests = new Set<PlanningDigestV1>();
  for (const observation of faultObservations) {
    if (previousFaultId !== null && previousFaultId >= observation.faultId)
      throw new TypeError(
        "closed-loop fault observations must be sorted and unique",
      );
    for (const eventDigest of [
      observation.scheduledEventDigest,
      observation.injectedEventDigest,
      observation.observedEventDigest,
    ]) {
      if (retainedEventDigests.has(eventDigest))
        throw new TypeError("closed-loop fault evidence digest is reused");
      retainedEventDigests.add(eventDigest);
    }
    previousFaultId = observation.faultId;
  }
  denseArray(value.staleResultRejections, "staleResultRejections");
  if (
    value.staleResultRejections.length >
    COLLECTIVE_CLOSED_LOOP_RESILIENCE_LIMITS_V1.maximumStaleResultRejections
  )
    throw new TypeError("closed-loop stale result rejections are too large");
  const staleResultRejections = value.staleResultRejections.map(
    validateStaleResultRejection,
  );
  let previousRejectionId: string | null = null;
  for (const rejection of staleResultRejections) {
    if (
      previousRejectionId !== null &&
      previousRejectionId >= rejection.rejectionId
    )
      throw new TypeError(
        "closed-loop stale result rejections must be sorted and unique",
      );
    if (rejection.rejectedAtLogicalMs > run.finalLogicalTimeMs)
      throw new TypeError(
        "closed-loop stale result rejection is outside the run",
      );
    if (
      rejection.rejectionEventDigest === rejection.staleFenceDigest ||
      rejection.rejectionEventDigest === rejection.currentFenceDigest ||
      retainedEventDigests.has(rejection.rejectionEventDigest)
    )
      throw new TypeError("closed-loop stale result evidence digest is reused");
    retainedEventDigests.add(rejection.rejectionEventDigest);
    previousRejectionId = rejection.rejectionId;
  }
  return deepFreezePlanning({
    schemaVersion: 1,
    resilienceDefinitionDigest: value.resilienceDefinitionDigest,
    run,
    epochs,
    faultObservations,
    staleResultRejections,
  });
}

export function collectiveClosedLoopResilienceResultDigestV1(
  value: Omit<CollectiveClosedLoopResilienceResultV1, "resilienceResultDigest">,
): PlanningDigestV1 {
  exact(value, resilienceResultBodyKeys, "closed-loop resilience result body");
  const body = normalizedResilienceResultBody(value);
  return digestBody(
    "collective-closed-loop-resilience-result-v1",
    body as unknown as PlanningJson,
  );
}

export function createCollectiveClosedLoopResilienceResultV1(
  input: Omit<CollectiveClosedLoopResilienceResultV1, "resilienceResultDigest">,
): CollectiveClosedLoopResilienceResultV1 {
  exact(input, resilienceResultBodyKeys, "closed-loop resilience result input");
  const body = normalizedResilienceResultBody(input);
  return deepFreezePlanning({
    ...body,
    resilienceResultDigest: collectiveClosedLoopResilienceResultDigestV1(body),
  });
}

export function validateCollectiveClosedLoopResilienceResultV1(
  value: unknown,
): CollectiveClosedLoopResilienceResultV1 {
  exact(value, resilienceResultKeys, "closed-loop resilience result");
  digest(value.resilienceResultDigest, "resilienceResultDigest");
  const body = normalizedResilienceResultBody(value);
  const resilienceResultDigest =
    collectiveClosedLoopResilienceResultDigestV1(body);
  if (value.resilienceResultDigest !== resilienceResultDigest)
    throw new TypeError("closed-loop resilience result digest is invalid");
  return deepFreezePlanning({ ...body, resilienceResultDigest });
}

/**
 * Performs the cross-record checks deliberately kept out of the result digest
 * constructor. Runners call this at finalization, after they hold the exact
 * registered resilience definition.
 */
export function validateCollectiveClosedLoopResilienceResultForDefinitionV1(
  value: unknown,
  resilienceDefinitionInput: unknown,
): CollectiveClosedLoopResilienceResultV1 {
  const result = validateCollectiveClosedLoopResilienceResultV1(value);
  const definition = validateCollectiveClosedLoopResilienceDefinitionV1(
    resilienceDefinitionInput,
  );
  if (
    result.resilienceDefinitionDigest !==
      definition.resilienceDefinitionDigest ||
    result.run.registrationBindingDigest !==
      definition.nominalDefinition.registration.bindingDigest ||
    result.run.runner !== definition.nominalDefinition.registration.runner ||
    result.run.finalLogicalTimeMs >
      definition.nominalDefinition.maximumLogicalTimeMs ||
    result.epochs.length > definition.maximumEpochs
  )
    throw new TypeError(
      "closed-loop resilience result is not bound to its definition",
    );
  const expectedFaultIds = definition.faultPlan.faults.map(
    (fault) => fault.faultId,
  );
  const observedFaultIds = result.faultObservations.map(
    (observation) => observation.faultId,
  );
  if (!sameStrings(expectedFaultIds, observedFaultIds))
    throw new TypeError(
      "closed-loop resilience result fault coverage is incomplete",
    );
  const faultsById = new Map(
    definition.faultPlan.faults.map((fault) => [fault.faultId, fault] as const),
  );
  for (const fault of definition.faultPlan.faults)
    if (fault.trigger.logicalTimeMs > result.run.finalLogicalTimeMs)
      throw new TypeError("closed-loop fault trigger is outside the run");
  for (const rejection of result.staleResultRejections) {
    const fault = faultsById.get(rejection.faultId);
    if (
      fault === undefined ||
      rejection.rejectedAtLogicalMs < fault.trigger.logicalTimeMs
    )
      throw new TypeError(
        "closed-loop stale result rejection is outside the fault plan",
      );
  }
  return result;
}

function validateCampaignLimits(
  value: unknown,
): CollectiveClosedLoopResilienceCampaignLimitsV1 {
  exact(
    value,
    ["schemaVersion", "maximumFaults", "maximumEpochs", "maximumInteractions"],
    "closed-loop resilience campaign limits",
  );
  if (value.schemaVersion !== 1)
    throw new TypeError(
      "closed-loop resilience campaign limits schema is invalid",
    );
  safeInteger(value.maximumFaults, "maximumFaults", 1);
  safeInteger(
    value.maximumEpochs,
    "maximumEpochs",
    COLLECTIVE_CLOSED_LOOP_RESILIENCE_LIMITS_V1.minimumEpochs,
  );
  safeInteger(value.maximumInteractions, "maximumInteractions", 1);
  if (
    value.maximumFaults >
      COLLECTIVE_CLOSED_LOOP_RESILIENCE_LIMITS_V1.maximumFaults ||
    value.maximumEpochs >
      COLLECTIVE_CLOSED_LOOP_RESILIENCE_LIMITS_V1.maximumEpochs
  )
    throw new TypeError(
      "closed-loop resilience campaign limits exceed contract limits",
    );
  return deepFreezePlanning({
    schemaVersion: 1,
    maximumFaults: value.maximumFaults,
    maximumEpochs: value.maximumEpochs,
    maximumInteractions: value.maximumInteractions,
  });
}

function normalizedCampaignEvidenceBody(
  value: Record<string, unknown>,
): Omit<
  CollectiveClosedLoopResilienceCampaignEvidenceV1,
  "campaignEvidenceDigest"
> {
  if (value.schemaVersion !== 1)
    throw new TypeError(
      "closed-loop resilience campaign evidence schema is invalid",
    );
  digest(value.resilienceDefinitionDigest, "resilienceDefinitionDigest");
  digest(value.resilienceResultDigest, "resilienceResultDigest");
  if (
    value.runner !== "adaptive_collective" &&
    value.runner !== "centralized_planner"
  )
    throw new TypeError("closed-loop resilience campaign runner is invalid");
  safeInteger(value.seed, "seed");
  const limits = validateCampaignLimits(value.limits);
  const scheduledFaultIds = sortedTokens(
    value.scheduledFaultIds,
    "scheduledFaultIds",
    limits.maximumFaults,
  );
  const injectedFaultIds = sortedTokens(
    value.injectedFaultIds,
    "injectedFaultIds",
    limits.maximumFaults,
  );
  const observedFaultIds = sortedTokens(
    value.observedFaultIds,
    "observedFaultIds",
    limits.maximumFaults,
  );
  const staleResultRejectionIds = sortedTokens(
    value.staleResultRejectionIds,
    "staleResultRejectionIds",
    COLLECTIVE_CLOSED_LOOP_RESILIENCE_LIMITS_V1.maximumStaleResultRejections,
  );
  if (
    !sameStrings(scheduledFaultIds, injectedFaultIds) ||
    !sameStrings(scheduledFaultIds, observedFaultIds)
  )
    throw new TypeError(
      "closed-loop resilience campaign fault coverage is incomplete",
    );
  return deepFreezePlanning({
    schemaVersion: 1,
    resilienceDefinitionDigest: value.resilienceDefinitionDigest,
    resilienceResultDigest: value.resilienceResultDigest,
    runner: value.runner,
    seed: value.seed,
    limits,
    scheduledFaultIds,
    injectedFaultIds,
    observedFaultIds,
    staleResultRejectionIds,
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

export function collectiveClosedLoopResilienceCampaignEvidenceDigestV1(
  value: Omit<
    CollectiveClosedLoopResilienceCampaignEvidenceV1,
    "campaignEvidenceDigest"
  >,
): PlanningDigestV1 {
  exact(
    value,
    campaignEvidenceBodyKeys,
    "closed-loop resilience campaign evidence body",
  );
  const body = normalizedCampaignEvidenceBody(value);
  return digestBody(
    "collective-closed-loop-resilience-campaign-evidence-v1",
    body as unknown as PlanningJson,
  );
}

export function createCollectiveClosedLoopResilienceCampaignEvidenceV1(
  input: Omit<
    CollectiveClosedLoopResilienceCampaignEvidenceV1,
    "campaignEvidenceDigest"
  >,
): CollectiveClosedLoopResilienceCampaignEvidenceV1 {
  exact(
    input,
    campaignEvidenceBodyKeys,
    "closed-loop resilience campaign evidence input",
  );
  const body = normalizedCampaignEvidenceBody(input);
  return deepFreezePlanning({
    ...body,
    campaignEvidenceDigest:
      collectiveClosedLoopResilienceCampaignEvidenceDigestV1(body),
  });
}

export function validateCollectiveClosedLoopResilienceCampaignEvidenceV1(
  value: unknown,
): CollectiveClosedLoopResilienceCampaignEvidenceV1 {
  exact(
    value,
    campaignEvidenceKeys,
    "closed-loop resilience campaign evidence",
  );
  digest(value.campaignEvidenceDigest, "campaignEvidenceDigest");
  const body = normalizedCampaignEvidenceBody(value);
  const campaignEvidenceDigest =
    collectiveClosedLoopResilienceCampaignEvidenceDigestV1(body);
  if (value.campaignEvidenceDigest !== campaignEvidenceDigest)
    throw new TypeError(
      "closed-loop resilience campaign evidence digest is invalid",
    );
  return deepFreezePlanning({ ...body, campaignEvidenceDigest });
}

/** Binds campaign counters to one finalized result and its registered plan. */
export function validateCollectiveClosedLoopResilienceCampaignEvidenceForResultV1(
  value: unknown,
  resilienceDefinitionInput: unknown,
  resilienceResultInput: unknown,
): CollectiveClosedLoopResilienceCampaignEvidenceV1 {
  const evidence =
    validateCollectiveClosedLoopResilienceCampaignEvidenceV1(value);
  const definition = validateCollectiveClosedLoopResilienceDefinitionV1(
    resilienceDefinitionInput,
  );
  const result = validateCollectiveClosedLoopResilienceResultForDefinitionV1(
    resilienceResultInput,
    definition,
  );
  const expectedFaultIds = definition.faultPlan.faults.map(
    (fault) => fault.faultId,
  );
  const expectedRejectionIds = result.staleResultRejections.map(
    (rejection) => rejection.rejectionId,
  );
  if (
    evidence.resilienceDefinitionDigest !==
      definition.resilienceDefinitionDigest ||
    evidence.resilienceResultDigest !== result.resilienceResultDigest ||
    evidence.runner !== result.run.runner ||
    evidence.seed !== definition.nominalDefinition.registration.seed ||
    evidence.limits.maximumFaults !==
      COLLECTIVE_CLOSED_LOOP_RESILIENCE_LIMITS_V1.maximumFaults ||
    evidence.limits.maximumEpochs !== definition.maximumEpochs ||
    evidence.limits.maximumInteractions !==
      definition.nominalDefinition.registration.limits.maximumInteractions ||
    !sameStrings(evidence.scheduledFaultIds, expectedFaultIds) ||
    !sameStrings(evidence.injectedFaultIds, expectedFaultIds) ||
    !sameStrings(evidence.observedFaultIds, expectedFaultIds) ||
    !sameStrings(evidence.staleResultRejectionIds, expectedRejectionIds)
  )
    throw new TypeError(
      "closed-loop resilience campaign evidence is not bound to its result",
    );
  return evidence;
}
