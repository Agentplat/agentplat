import {
  deepFreezePlanning,
  digestPlanningJsonV1,
  type PlanningDigestDomainV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";

export const COLLECTIVE_STATISTICAL_CAMPAIGN_SCHEMA_VERSION_V1 = 1 as const;
export const COLLECTIVE_STATISTICAL_CAMPAIGN_STRATA_V1 = Object.freeze([
  "nominal",
  "benign",
  "adversarial",
  "mixed",
] as const);
export const COLLECTIVE_STATISTICAL_CAMPAIGN_FAULT_FAMILIES_V1 = Object.freeze([
  "capability.withdraw",
  "assignment.decline",
  "peer.crash",
  "peer.restart",
  "network.partition",
  "network.heal",
] as const);

export type CollectiveStatisticalCampaignStratumV1 =
  (typeof COLLECTIVE_STATISTICAL_CAMPAIGN_STRATA_V1)[number];
export type CollectiveStatisticalCampaignFaultFamilyV1 =
  (typeof COLLECTIVE_STATISTICAL_CAMPAIGN_FAULT_FAMILIES_V1)[number];

export interface CollectiveStatisticalCampaignScaleV1 {
  readonly schemaVersion: 1;
  readonly agentCount: 50 | 100 | 250 | 500;
  readonly outdegree: number;
  readonly directedEdgeCount: number;
  readonly maximumInteractions: number;
  readonly pairedSeedsPerStratum: number;
}

/** Frozen scale ladder; this is configuration only, not a runtime admission. */
export const COLLECTIVE_STATISTICAL_CAMPAIGN_SCALE_LADDER_V1 = Object.freeze([
  scale(50, 1_000, 10),
  scale(100, 1_600, 10),
  scale(250, 3_000, 10),
  scale(500, 5_000, 30),
] as const satisfies readonly CollectiveStatisticalCampaignScaleV1[]);

export interface CollectiveStatisticalCampaignTopologyEdgeV1 {
  readonly schemaVersion: 1;
  readonly fromPeerId: string;
  readonly toPeerId: string;
}

export interface CollectiveStatisticalCampaignTopologyV1 {
  readonly schemaVersion: 1;
  readonly agentCount: 50 | 100 | 250 | 500;
  readonly seed: number;
  readonly outdegree: number;
  readonly directedEdgeCount: number;
  readonly peerIds: readonly string[];
  readonly edges: readonly CollectiveStatisticalCampaignTopologyEdgeV1[];
  readonly topologyDigest: PlanningDigestV1;
}

export interface CollectiveStatisticalCampaignFaultMatrixRowV1 {
  readonly schemaVersion: 1;
  readonly stratum: CollectiveStatisticalCampaignStratumV1;
  readonly faultFamilies: readonly CollectiveStatisticalCampaignFaultFamilyV1[];
}

export interface CollectiveStatisticalCampaignFaultMatrixV1 {
  readonly schemaVersion: 1;
  readonly rows: readonly CollectiveStatisticalCampaignFaultMatrixRowV1[];
  readonly faultMatrixDigest: PlanningDigestV1;
}

export interface CollectiveStatisticalCampaignScaleConfigurationV1 {
  readonly schemaVersion: 1;
  readonly agentCount: 50 | 100 | 250 | 500;
  readonly seed: number;
  readonly stratum: CollectiveStatisticalCampaignStratumV1;
  readonly maximumInteractions: number;
  readonly topology: CollectiveStatisticalCampaignTopologyV1;
  readonly registeredFaultFamilies: readonly CollectiveStatisticalCampaignFaultFamilyV1[];
  readonly configurationDigest: PlanningDigestV1;
}

export interface CollectiveStatisticalCampaignFaultCoverageV1 {
  readonly schemaVersion: 1;
  readonly stratum: CollectiveStatisticalCampaignStratumV1;
  readonly registeredFaultFamilies: readonly CollectiveStatisticalCampaignFaultFamilyV1[];
  readonly observedFaultFamilies: readonly CollectiveStatisticalCampaignFaultFamilyV1[];
  readonly coverageDigest: PlanningDigestV1;
}

const scaleByAgentCount = new Map<
  CollectiveStatisticalCampaignScaleV1["agentCount"],
  CollectiveStatisticalCampaignScaleV1
>(
  COLLECTIVE_STATISTICAL_CAMPAIGN_SCALE_LADDER_V1.map((entry) => [
    entry.agentCount,
    entry,
  ]),
);
const strata = new Set<string>(COLLECTIVE_STATISTICAL_CAMPAIGN_STRATA_V1);
const faultFamilies = new Set<string>(
  COLLECTIVE_STATISTICAL_CAMPAIGN_FAULT_FAMILIES_V1,
);
const canonicalFaultFamilies = Object.freeze(
  [...COLLECTIVE_STATISTICAL_CAMPAIGN_FAULT_FAMILIES_V1].sort(),
) as readonly CollectiveStatisticalCampaignFaultFamilyV1[];

/** Builds the registered 50/100/250/500 campaign configuration without running it. */
export function createCollectiveStatisticalCampaignScaleConfigurationV1(input: {
  readonly schemaVersion: 1;
  readonly agentCount: 50 | 100 | 250 | 500;
  readonly seed: number;
  readonly stratum: CollectiveStatisticalCampaignStratumV1;
}): CollectiveStatisticalCampaignScaleConfigurationV1 {
  exact(input, ["agentCount", "schemaVersion", "seed", "stratum"], "scale configuration input");
  if (input.schemaVersion !== 1) throw new TypeError("scale configuration schema is invalid");
  const scale = requireScale(input.agentCount);
  safeSeed(input.seed);
  requireStratum(input.stratum);
  const topology = createCollectiveStatisticalCampaignTopologyV1({
    schemaVersion: 1,
    agentCount: scale.agentCount,
    seed: input.seed,
  });
  const registeredFaultFamilies = faultFamiliesForStratum(input.stratum);
  const body = {
    schemaVersion: 1 as const,
    agentCount: scale.agentCount,
    seed: input.seed,
    stratum: input.stratum,
    maximumInteractions: scale.maximumInteractions,
    topology,
    registeredFaultFamilies,
  };
  return deepFreezePlanning({
    ...body,
    configurationDigest: digest("evaluation-campaign-scale-configuration-v1", body as unknown as PlanningJson),
  }) as CollectiveStatisticalCampaignScaleConfigurationV1;
}

export function validateCollectiveStatisticalCampaignScaleConfigurationV1(
  value: unknown,
): CollectiveStatisticalCampaignScaleConfigurationV1 {
  exact(
    value,
    [
      "agentCount",
      "configurationDigest",
      "maximumInteractions",
      "registeredFaultFamilies",
      "schemaVersion",
      "seed",
      "stratum",
      "topology",
    ],
    "scale configuration",
  );
  assertPlainJsonData(value, "scale configuration");
  const configuration = value as unknown as CollectiveStatisticalCampaignScaleConfigurationV1;
  const rebuilt = createCollectiveStatisticalCampaignScaleConfigurationV1({
    schemaVersion: configuration.schemaVersion,
    agentCount: configuration.agentCount,
    seed: configuration.seed,
    stratum: configuration.stratum,
  });
  if (
    configuration.maximumInteractions !== rebuilt.maximumInteractions ||
    configuration.configurationDigest !== rebuilt.configurationDigest ||
    !sameJson(configuration.topology, rebuilt.topology) ||
    !sameStrings(configuration.registeredFaultFamilies, rebuilt.registeredFaultFamilies)
  ) throw new TypeError("scale configuration binding is invalid");
  return rebuilt;
}

/** Creates a deterministic sparse directed topology with an exact O(n log n) edge count. */
export function createCollectiveStatisticalCampaignTopologyV1(input: {
  readonly schemaVersion: 1;
  readonly agentCount: 50 | 100 | 250 | 500;
  readonly seed: number;
}): CollectiveStatisticalCampaignTopologyV1 {
  exact(input, ["agentCount", "schemaVersion", "seed"], "topology input");
  if (input.schemaVersion !== 1) throw new TypeError("topology schema is invalid");
  const scale = requireScale(input.agentCount);
  safeSeed(input.seed);
  const peerIds = Object.freeze(
    Array.from({ length: scale.agentCount }, (_, index) => peerId(index)),
  );
  const random = prng(input.seed);
  const edges: CollectiveStatisticalCampaignTopologyEdgeV1[] = [];
  for (let sourceIndex = 0; sourceIndex < peerIds.length; sourceIndex += 1) {
    const targets = new Set<number>([(sourceIndex + 1) % peerIds.length]);
    while (targets.size < scale.outdegree) {
      const candidate = random() % peerIds.length;
      if (candidate !== sourceIndex) targets.add(candidate);
    }
    for (const targetIndex of [...targets].sort((left, right) => left - right)) {
      edges.push(
        deepFreezePlanning({
          schemaVersion: 1,
          fromPeerId: peerIds[sourceIndex],
          toPeerId: peerIds[targetIndex],
        }) as CollectiveStatisticalCampaignTopologyEdgeV1,
      );
    }
  }
  if (edges.length !== scale.directedEdgeCount)
    throw new Error("scale topology edge count is invalid");
  const body = {
    schemaVersion: 1 as const,
    agentCount: scale.agentCount,
    seed: input.seed,
    outdegree: scale.outdegree,
    directedEdgeCount: scale.directedEdgeCount,
    peerIds,
    edges: Object.freeze(edges),
  };
  return deepFreezePlanning({
    ...body,
    topologyDigest: digest("evaluation-campaign-topology-v1", body as unknown as PlanningJson),
  }) as CollectiveStatisticalCampaignTopologyV1;
}

export function validateCollectiveStatisticalCampaignTopologyV1(
  value: unknown,
): CollectiveStatisticalCampaignTopologyV1 {
  exact(
    value,
    [
      "agentCount",
      "directedEdgeCount",
      "edges",
      "outdegree",
      "peerIds",
      "schemaVersion",
      "seed",
      "topologyDigest",
    ],
    "scale topology",
  );
  assertPlainJsonData(value, "scale topology");
  const topology = value as unknown as CollectiveStatisticalCampaignTopologyV1;
  const rebuilt = createCollectiveStatisticalCampaignTopologyV1({
    schemaVersion: topology.schemaVersion,
    agentCount: topology.agentCount,
    seed: topology.seed,
  });
  if (!sameJson(topology, rebuilt)) throw new TypeError("scale topology binding is invalid");
  return rebuilt;
}

/** Returns the closed registered matrix, including an empty nominal-fault row. */
export function createCollectiveStatisticalCampaignFaultMatrixV1(): CollectiveStatisticalCampaignFaultMatrixV1 {
  const rows = Object.freeze(
    COLLECTIVE_STATISTICAL_CAMPAIGN_STRATA_V1.map((stratum) =>
      deepFreezePlanning({
        schemaVersion: 1,
        stratum,
        faultFamilies: faultFamiliesForStratum(stratum),
      }) as CollectiveStatisticalCampaignFaultMatrixRowV1,
    ),
  );
  const body = { schemaVersion: 1 as const, rows };
  return deepFreezePlanning({
    ...body,
    faultMatrixDigest: digest("evaluation-campaign-fault-matrix-v1", body as unknown as PlanningJson),
  }) as CollectiveStatisticalCampaignFaultMatrixV1;
}

export function validateCollectiveStatisticalCampaignFaultMatrixV1(
  value: unknown,
): CollectiveStatisticalCampaignFaultMatrixV1 {
  exact(value, ["faultMatrixDigest", "rows", "schemaVersion"], "fault matrix");
  assertPlainJsonData(value, "fault matrix");
  const matrix = value as unknown as CollectiveStatisticalCampaignFaultMatrixV1;
  const rebuilt = createCollectiveStatisticalCampaignFaultMatrixV1();
  if (!sameJson(matrix, rebuilt)) throw new TypeError("fault matrix binding is invalid");
  return rebuilt;
}

/** Requires observed family coverage to equal the registered matrix row exactly. */
export function createCollectiveStatisticalCampaignFaultCoverageV1(input: {
  readonly schemaVersion: 1;
  readonly stratum: CollectiveStatisticalCampaignStratumV1;
  readonly registeredFaultFamilies: readonly CollectiveStatisticalCampaignFaultFamilyV1[];
  readonly observedFaultFamilies: readonly CollectiveStatisticalCampaignFaultFamilyV1[];
}): CollectiveStatisticalCampaignFaultCoverageV1 {
  exact(
    input,
    ["observedFaultFamilies", "registeredFaultFamilies", "schemaVersion", "stratum"],
    "fault coverage input",
  );
  assertPlainJsonData(input, "fault coverage input");
  if (input.schemaVersion !== 1) throw new TypeError("fault coverage schema is invalid");
  requireStratum(input.stratum);
  const registeredFaultFamilies = normalizeFaultFamilies(input.registeredFaultFamilies, "registered fault families");
  const observedFaultFamilies = normalizeFaultFamilies(input.observedFaultFamilies, "observed fault families");
  const expected = faultFamiliesForStratum(input.stratum);
  if (!sameStrings(registeredFaultFamilies, expected))
    throw new TypeError("registered fault families do not match the matrix");
  if (!sameStrings(observedFaultFamilies, registeredFaultFamilies))
    throw new TypeError("observed fault families do not match registration");
  const body = {
    schemaVersion: 1 as const,
    stratum: input.stratum,
    registeredFaultFamilies,
    observedFaultFamilies,
  };
  return deepFreezePlanning({
    ...body,
    coverageDigest: digest("evaluation-campaign-fault-coverage-v1", body as unknown as PlanningJson),
  }) as CollectiveStatisticalCampaignFaultCoverageV1;
}

export function validateCollectiveStatisticalCampaignFaultCoverageV1(
  value: unknown,
): CollectiveStatisticalCampaignFaultCoverageV1 {
  exact(
    value,
    ["coverageDigest", "observedFaultFamilies", "registeredFaultFamilies", "schemaVersion", "stratum"],
    "fault coverage",
  );
  assertPlainJsonData(value, "fault coverage");
  const coverage = value as unknown as CollectiveStatisticalCampaignFaultCoverageV1;
  const rebuilt = createCollectiveStatisticalCampaignFaultCoverageV1({
    schemaVersion: coverage.schemaVersion,
    stratum: coverage.stratum,
    registeredFaultFamilies: coverage.registeredFaultFamilies,
    observedFaultFamilies: coverage.observedFaultFamilies,
  });
  if (coverage.coverageDigest !== rebuilt.coverageDigest)
    throw new TypeError("fault coverage digest is invalid");
  return rebuilt;
}

function scale(
  agentCount: 50 | 100 | 250 | 500,
  maximumInteractions: number,
  pairedSeedsPerStratum: number,
): CollectiveStatisticalCampaignScaleV1 {
  const outdegree = Math.ceil(Math.log2(agentCount));
  return deepFreezePlanning({
    schemaVersion: 1,
    agentCount,
    outdegree,
    directedEdgeCount: agentCount * outdegree,
    maximumInteractions,
    pairedSeedsPerStratum,
  }) as CollectiveStatisticalCampaignScaleV1;
}

function requireScale(value: unknown): CollectiveStatisticalCampaignScaleV1 {
  if (value !== 50 && value !== 100 && value !== 250 && value !== 500)
    throw new TypeError("agent count is outside the registered scale ladder");
  const scale = scaleByAgentCount.get(value);
  if (!scale) throw new TypeError("agent count is outside the registered scale ladder");
  if (scale.maximumInteractions > 5_000)
    throw new Error("scale interaction budget exceeds the campaign ceiling");
  return scale;
}

function requireStratum(value: unknown): asserts value is CollectiveStatisticalCampaignStratumV1 {
  if (typeof value !== "string" || !strata.has(value))
    throw new TypeError("campaign stratum is invalid");
}

function faultFamiliesForStratum(
  stratum: CollectiveStatisticalCampaignStratumV1,
): readonly CollectiveStatisticalCampaignFaultFamilyV1[] {
  return stratum === "nominal"
    ? Object.freeze([])
    : canonicalFaultFamilies;
}

function normalizeFaultFamilies(
  value: unknown,
  label: string,
): readonly CollectiveStatisticalCampaignFaultFamilyV1[] {
  denseArray(value, label);
  const result: CollectiveStatisticalCampaignFaultFamilyV1[] = [];
  let previous: string | null = null;
  for (const item of value) {
    if (typeof item !== "string" || !faultFamilies.has(item))
      throw new TypeError(`${label} contains an invalid fault family`);
    if (previous !== null && previous >= item)
      throw new TypeError(`${label} must be sorted and unique`);
    previous = item;
    result.push(item as CollectiveStatisticalCampaignFaultFamilyV1);
  }
  return Object.freeze(result);
}

function peerId(index: number): string {
  return `peer:${String(index + 1).padStart(4, "0")}`;
}

function prng(seed: number): () => number {
  let state = (seed ^ 0x9e3779b9) >>> 0;
  if (state === 0) state = 0x6d2b79f5;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

function digest(domain: PlanningDigestDomainV1, value: PlanningJson): PlanningDigestV1 {
  return digestPlanningJsonV1(domain, value, {
    maximumBytes: 1_048_576,
    maximumDepth: 32,
    maximumNodes: 32_768,
    maximumKeysPerObject: 256,
    maximumItemsPerArray: 8_192,
  });
}

function exact(value: unknown, keys: readonly string[], label: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`${label} must be a plain object`);
  const names = Object.getOwnPropertyNames(value).sort();
  const expected = [...keys].sort();
  if (
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) ||
    Object.getOwnPropertySymbols(value).length !== 0 ||
    names.length !== expected.length ||
    names.some((name, index) => name !== expected[index])
  ) throw new TypeError(`${label} has an invalid shape`);
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
  ) throw new TypeError(`${label} must be a dense array`);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor))
      throw new TypeError(`${label} must contain enumerable data properties`);
  }
}

function assertPlainJsonData(value: unknown, label: string, seen = new Set<object>()): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${label} contains a non-finite number`);
    return;
  }
  if (typeof value !== "object") throw new TypeError(`${label} contains a non-JSON value`);
  if (seen.has(value)) throw new TypeError(`${label} contains a cycle`);
  seen.add(value);
  const isArray = Array.isArray(value);
  if (
    (isArray && Object.getPrototypeOf(value) !== Array.prototype) ||
    (!isArray && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) throw new TypeError(`${label} contains an invalid nested record`);
  const names = Object.getOwnPropertyNames(value);
  if (isArray && names.length !== value.length + 1)
    throw new TypeError(`${label} contains a sparse array`);
  for (const name of names) {
    if (isArray && name === "length") continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor))
      throw new TypeError(`${label} contains an accessor`);
    assertPlainJsonData(descriptor.value, label, seen);
  }
  seen.delete(value);
}

function safeSeed(value: unknown): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 0xffff_ffff ||
    Object.is(value, -0)
  )
    throw new TypeError("campaign seed is invalid");
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
