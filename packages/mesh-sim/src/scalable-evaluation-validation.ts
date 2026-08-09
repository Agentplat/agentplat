import {
  deepFreezePlanning,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";

import {
  createMultiDomainScenarioManifestV1,
  validateMultiDomainEnvironmentDescriptorV1,
} from "./multi-domain-environment-validation.js";
import {
  SHARDED_SIMULATION_LIMITS_V1,
  shardedSimulationDigestV1,
  shardedSimulationScaleProfileV1,
} from "./sharded-simulation-contracts.js";
import {
  SCALABLE_EVALUATION_DOMAINS_V1,
  SCALABLE_EVALUATION_PERTURBATION_KINDS_V1,
  SCALABLE_EVALUATION_PROFILE_IDS_V1,
  type ScalableEvaluationDefinitionV1,
  type ScalableEvaluationMatchupV1,
  type ScalableEvaluationPartialObservabilityV1,
  type ScalableEvaluationPerturbationV1,
  type ScalableEvaluationProfileIdV1,
  type ScalableEvaluationProfileV1,
  type ScalableEvaluationTeamDescriptorV1,
} from "./scalable-evaluation-contracts.js";
import type {
  MultiDomainEnvironmentDescriptorV1,
  MultiDomainScenarioDefinitionV1,
} from "./multi-domain-environment-contracts.js";

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const MAXIMUM_IDENTIFIER_LENGTH = 256;
const MAXIMUM_VERSION_LENGTH = 128;
const MAXIMUM_RETAINED_RECORDS = 16_384;
const MAXIMUM_MESSAGE_BYTES_PER_MESSAGE = 1024 * 1024;

const profileIds = new Set<string>(SCALABLE_EVALUATION_PROFILE_IDS_V1);
const domains = new Set<string>(SCALABLE_EVALUATION_DOMAINS_V1);
const perturbationKinds = new Set<string>(
  SCALABLE_EVALUATION_PERTURBATION_KINDS_V1,
);
const architectures = new Set<string>([
  "distributed",
  "centralized",
  "hybrid",
  "custom",
]);
const observationScopes = new Set<string>([
  "peer_local",
  "role_scoped",
  "partition_scoped",
]);

export function scalableEvaluationDigestV1(
  domain: string,
  value: unknown,
): PlanningDigestV1 {
  return shardedSimulationDigestV1(`scalable-evaluation/${domain}/v1`, value);
}

export function createScalableEvaluationProfileV1(input: {
  readonly profileId: ScalableEvaluationProfileIdV1;
  readonly maximumInteractions?: number;
  readonly maximumMessages?: number;
  readonly maximumMessageBytes?: number;
  readonly maximumRetainedRecords?: number;
}): ScalableEvaluationProfileV1 {
  if (!profileIds.has(input.profileId)) fail("profile_id_invalid");
  const mapping = profileMapping(input.profileId);
  const sharded = shardedSimulationScaleProfileV1(mapping.shardedProfileId);
  const maximumInteractions =
    input.maximumInteractions ?? sharded.interactionCeiling;
  const maximumMessages = input.maximumMessages ?? sharded.interactionCeiling;
  positiveInteger(maximumInteractions, "maximum_interactions");
  positiveInteger(maximumMessages, "maximum_messages");
  if (maximumInteractions > sharded.interactionCeiling)
    fail("interaction_budget_exceeds_profile");
  if (maximumMessages > sharded.interactionCeiling)
    fail("message_budget_exceeds_profile");
  const maximumMessageBytes =
    input.maximumMessageBytes ?? maximumMessages * 64 * 1024;
  positiveInteger(maximumMessageBytes, "maximum_message_bytes");
  if (maximumMessageBytes > maximumMessages * MAXIMUM_MESSAGE_BYTES_PER_MESSAGE)
    fail("message_byte_budget_exceeds_profile");
  const maximumRetainedRecords = input.maximumRetainedRecords ?? 1_024;
  positiveInteger(maximumRetainedRecords, "maximum_retained_records");
  if (maximumRetainedRecords > MAXIMUM_RETAINED_RECORDS)
    fail("retained_record_limit_exceeded");
  const body = {
    schemaVersion: 1 as const,
    profileId: input.profileId,
    shardedProfileId: mapping.shardedProfileId,
    agentCount: sharded.logicalPeerCount,
    budget: {
      maximumInteractions,
      maximumMessages,
      maximumMessageBytes,
      maximumRetainedRecords,
    },
  };
  return freeze({
    ...body,
    profileDigest: scalableEvaluationDigestV1("profile", body),
  });
}

export const SCALABLE_EVALUATION_PROFILES_V1 = Object.freeze(
  SCALABLE_EVALUATION_PROFILE_IDS_V1.map((profileId) =>
    createScalableEvaluationProfileV1({ profileId }),
  ),
);

export function validateScalableEvaluationProfileV1(
  input: unknown,
): ScalableEvaluationProfileV1 {
  const value = input as ScalableEvaluationProfileV1;
  if (!record(value) || value.schemaVersion !== 1 || !record(value.budget))
    fail("profile_invalid");
  const rebuilt = createScalableEvaluationProfileV1({
    profileId: value.profileId,
    maximumInteractions: value.budget.maximumInteractions,
    maximumMessages: value.budget.maximumMessages,
    maximumMessageBytes: value.budget.maximumMessageBytes,
    maximumRetainedRecords: value.budget.maximumRetainedRecords,
  });
  if (!same(value, rebuilt)) fail("profile_invalid");
  return rebuilt;
}

export function createScalableEvaluationPartialObservabilityV1(input: {
  readonly scope: ScalableEvaluationPartialObservabilityV1["scope"];
  readonly maximumObservationsPerPull: number;
  readonly allowCrossDomainAggregation: boolean;
  readonly sourceVisibilityPolicyDigest: PlanningDigestV1;
}): ScalableEvaluationPartialObservabilityV1 {
  if (!observationScopes.has(input.scope)) fail("observation_scope_invalid");
  positiveInteger(
    input.maximumObservationsPerPull,
    "maximum_observations_per_pull",
  );
  if (
    input.maximumObservationsPerPull >
    SHARDED_SIMULATION_LIMITS_V1.maximumObservationsPerDelivery
  )
    fail("observation_pull_limit_exceeded");
  if (typeof input.allowCrossDomainAggregation !== "boolean")
    fail("cross_domain_policy_invalid");
  digest(input.sourceVisibilityPolicyDigest, "visibility_policy_digest");
  const body = {
    schemaVersion: 1 as const,
    scope: input.scope,
    maximumObservationsPerPull: input.maximumObservationsPerPull,
    allowCrossDomainAggregation: input.allowCrossDomainAggregation,
    sourceVisibilityPolicyDigest: input.sourceVisibilityPolicyDigest,
  };
  return freeze({
    ...body,
    policyDigest: scalableEvaluationDigestV1("partial-observability", body),
  });
}

export function validateScalableEvaluationPartialObservabilityV1(
  input: unknown,
): ScalableEvaluationPartialObservabilityV1 {
  const value = input as ScalableEvaluationPartialObservabilityV1;
  if (!record(value) || value.schemaVersion !== 1)
    fail("partial_observability_invalid");
  const rebuilt = createScalableEvaluationPartialObservabilityV1(value);
  if (!same(value, rebuilt)) fail("partial_observability_invalid");
  return rebuilt;
}

export function createScalableEvaluationTeamDescriptorV1(input: {
  readonly teamId: string;
  readonly architecture: ScalableEvaluationTeamDescriptorV1["architecture"];
  readonly implementationId: string;
  readonly implementationVersion: string;
  readonly implementationDigest: PlanningDigestV1;
}): ScalableEvaluationTeamDescriptorV1 {
  identifier(input.teamId, "team_id");
  if (!architectures.has(input.architecture)) fail("team_architecture_invalid");
  identifier(input.implementationId, "implementation_id");
  boundedString(
    input.implementationVersion,
    "implementation_version",
    MAXIMUM_VERSION_LENGTH,
  );
  digest(input.implementationDigest, "implementation_digest");
  const body = {
    schemaVersion: 1 as const,
    teamId: input.teamId,
    architecture: input.architecture,
    implementationId: input.implementationId,
    implementationVersion: input.implementationVersion,
    implementationDigest: input.implementationDigest,
  };
  return freeze({
    ...body,
    descriptorDigest: scalableEvaluationDigestV1("team-descriptor", body),
  });
}

export function validateScalableEvaluationTeamDescriptorV1(
  input: unknown,
): ScalableEvaluationTeamDescriptorV1 {
  const value = input as ScalableEvaluationTeamDescriptorV1;
  if (!record(value) || value.schemaVersion !== 1)
    fail("team_descriptor_invalid");
  const rebuilt = createScalableEvaluationTeamDescriptorV1(value);
  if (!same(value, rebuilt)) fail("team_descriptor_invalid");
  return rebuilt;
}

export function createScalableEvaluationMatchupV1(input: {
  readonly leftTeamId: string;
  readonly rightTeamId: string;
  readonly referenceSide?: "left" | "right" | "neither";
}): ScalableEvaluationMatchupV1 {
  identifier(input.leftTeamId, "left_team_id");
  identifier(input.rightTeamId, "right_team_id");
  if (input.leftTeamId === input.rightTeamId) fail("matchup_team_duplicate");
  const referenceSide = input.referenceSide ?? "neither";
  if (!new Set(["left", "right", "neither"]).has(referenceSide))
    fail("matchup_reference_side_invalid");
  const body = {
    schemaVersion: 1 as const,
    comparisonKind: "team-vs-team" as const,
    leftTeamId: input.leftTeamId,
    rightTeamId: input.rightTeamId,
    referenceSide,
  };
  return freeze({
    ...body,
    matchupDigest: scalableEvaluationDigestV1("matchup", body),
  });
}

export function validateScalableEvaluationMatchupV1(
  input: unknown,
): ScalableEvaluationMatchupV1 {
  const value = input as ScalableEvaluationMatchupV1;
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    value.comparisonKind !== "team-vs-team"
  )
    fail("matchup_invalid");
  const rebuilt = createScalableEvaluationMatchupV1(value);
  if (!same(value, rebuilt)) fail("matchup_invalid");
  return rebuilt;
}

export function createScalableEvaluationPerturbationV1(input: {
  readonly perturbationId: string;
  readonly kind: ScalableEvaluationPerturbationV1["kind"];
  readonly domain: ScalableEvaluationPerturbationV1["domain"];
  readonly scheduledAtLogicalTime: number;
  readonly targetTeamIds: readonly string[];
  readonly targetAgentCount: number;
  readonly targetSelectorDigest: PlanningDigestV1;
}): ScalableEvaluationPerturbationV1 {
  identifier(input.perturbationId, "perturbation_id");
  if (!perturbationKinds.has(input.kind)) fail("perturbation_kind_invalid");
  if (!domains.has(input.domain)) fail("perturbation_domain_invalid");
  positiveInteger(input.scheduledAtLogicalTime, "scheduled_logical_time");
  if (
    !Array.isArray(input.targetTeamIds) ||
    input.targetTeamIds.length === 0 ||
    input.targetTeamIds.length > 2
  )
    fail("perturbation_target_teams_invalid");
  const targetTeamIds = [...input.targetTeamIds].sort();
  if (new Set(targetTeamIds).size !== targetTeamIds.length)
    fail("perturbation_target_teams_duplicate");
  for (const teamId of targetTeamIds) identifier(teamId, "target_team_id");
  positiveInteger(input.targetAgentCount, "target_agent_count");
  digest(input.targetSelectorDigest, "target_selector_digest");
  const body = {
    schemaVersion: 1 as const,
    perturbationId: input.perturbationId,
    kind: input.kind,
    domain: input.domain,
    scheduledAtLogicalTime: input.scheduledAtLogicalTime,
    targetTeamIds,
    targetAgentCount: input.targetAgentCount,
    targetSelectorDigest: input.targetSelectorDigest,
  };
  return freeze({
    ...body,
    configurationDigest: scalableEvaluationDigestV1("perturbation", body),
  });
}

export function validateScalableEvaluationPerturbationV1(
  input: unknown,
): ScalableEvaluationPerturbationV1 {
  const value = input as ScalableEvaluationPerturbationV1;
  if (!record(value) || value.schemaVersion !== 1) fail("perturbation_invalid");
  const rebuilt = createScalableEvaluationPerturbationV1(value);
  if (!same(value, rebuilt)) fail("perturbation_invalid");
  return rebuilt;
}

export function createScalableEvaluationDefinitionV1(input: {
  readonly evaluationId: string;
  readonly profile: ScalableEvaluationProfileV1;
  readonly descriptor: MultiDomainEnvironmentDescriptorV1;
  readonly scenario: MultiDomainScenarioDefinitionV1;
  readonly partialObservability: ScalableEvaluationPartialObservabilityV1;
  readonly teams: readonly [
    ScalableEvaluationTeamDescriptorV1,
    ScalableEvaluationTeamDescriptorV1,
  ];
  readonly matchup?: ScalableEvaluationMatchupV1;
  readonly perturbations?: readonly ScalableEvaluationPerturbationV1[];
}): ScalableEvaluationDefinitionV1 {
  identifier(input.evaluationId, "evaluation_id");
  const profile = validateScalableEvaluationProfileV1(input.profile);
  const descriptor = validateMultiDomainEnvironmentDescriptorV1(
    input.descriptor,
  );
  const manifest = createMultiDomainScenarioManifestV1({
    descriptor,
    definition: input.scenario,
  });
  if (manifest.scaleProfileId !== profile.shardedProfileId)
    fail("scenario_profile_binding_invalid");
  if (manifest.entityCount !== profile.agentCount)
    fail("scenario_agent_count_binding_invalid");
  if (
    manifest.resourceBudget.maximumInteractions <
    profile.budget.maximumInteractions
  )
    fail("scenario_interaction_budget_too_small");
  const scenarioDomains = manifest.domains.filter(
    (domain): domain is ScalableEvaluationDefinitionV1["domains"][number] =>
      domain !== "hybrid",
  );
  if (
    scenarioDomains.length === 0 ||
    new Set(scenarioDomains).size !== scenarioDomains.length
  )
    fail("scenario_domains_invalid");
  const partialObservability = validateScalableEvaluationPartialObservabilityV1(
    input.partialObservability,
  );
  if (
    partialObservability.sourceVisibilityPolicyDigest !==
    manifest.visibilityPolicyDigest
  )
    fail("visibility_policy_binding_invalid");
  if (
    partialObservability.maximumObservationsPerPull >
    descriptor.limits.maximumObservationsPerPull
  )
    fail("adapter_observation_limit_exceeded");
  if (!Array.isArray(input.teams) || input.teams.length !== 2)
    fail("team_count_invalid");
  const teams = Object.freeze(
    input.teams.map(validateScalableEvaluationTeamDescriptorV1),
  ) as unknown as readonly [
    ScalableEvaluationTeamDescriptorV1,
    ScalableEvaluationTeamDescriptorV1,
  ];
  if (teams[0].teamId === teams[1].teamId) fail("team_id_duplicate");
  const defaultMatchup = createScalableEvaluationMatchupV1({
    leftTeamId: teams[0].teamId,
    rightTeamId: teams[1].teamId,
  });
  const matchup = input.matchup
    ? validateScalableEvaluationMatchupV1(input.matchup)
    : defaultMatchup;
  if (
    matchup.leftTeamId !== teams[0].teamId ||
    matchup.rightTeamId !== teams[1].teamId
  )
    fail("matchup_team_binding_invalid");
  const teamIds = new Set(teams.map((team) => team.teamId));
  const domainSet = new Set(scenarioDomains);
  const perturbationIds = new Set<string>();
  const perturbations = (input.perturbations ?? [])
    .map(validateScalableEvaluationPerturbationV1)
    .sort(
      (left, right) =>
        left.scheduledAtLogicalTime - right.scheduledAtLogicalTime ||
        left.perturbationId.localeCompare(right.perturbationId),
    );
  if (perturbations.length > SHARDED_SIMULATION_LIMITS_V1.maximumFaults)
    fail("perturbation_plan_limit_exceeded");
  for (const perturbation of perturbations) {
    if (perturbationIds.has(perturbation.perturbationId))
      fail("perturbation_id_duplicate");
    perturbationIds.add(perturbation.perturbationId);
    if (!domainSet.has(perturbation.domain))
      fail("perturbation_domain_not_in_scenario");
    if (perturbation.targetTeamIds.some((teamId) => !teamIds.has(teamId)))
      fail("perturbation_team_not_in_matchup");
    if (perturbation.targetAgentCount > profile.agentCount)
      fail("perturbation_target_count_exceeds_profile");
  }
  const perturbationPlanDigest = scalableEvaluationDigestV1(
    "perturbation-plan",
    perturbations,
  );
  const body = {
    schemaVersion: 1 as const,
    evaluationId: input.evaluationId,
    profile,
    adapterDescriptorDigest: descriptor.descriptorDigest,
    scenario: manifestToDefinition(manifest),
    scenarioManifestDigest: manifest.manifestDigest,
    domains: scenarioDomains,
    partialObservability,
    teams,
    matchup,
    perturbations,
    perturbationPlanDigest,
  };
  return freeze({
    ...body,
    definitionDigest: scalableEvaluationDigestV1("definition", body),
  });
}

export function validateScalableEvaluationDefinitionV1(
  input: unknown,
  descriptor: MultiDomainEnvironmentDescriptorV1,
): ScalableEvaluationDefinitionV1 {
  const value = input as ScalableEvaluationDefinitionV1;
  if (!record(value) || value.schemaVersion !== 1) fail("definition_invalid");
  const rebuilt = createScalableEvaluationDefinitionV1({
    evaluationId: value.evaluationId,
    profile: value.profile,
    descriptor,
    scenario: value.scenario,
    partialObservability: value.partialObservability,
    teams: value.teams,
    matchup: value.matchup,
    perturbations: value.perturbations,
  });
  if (!same(value, rebuilt)) fail("definition_invalid");
  return rebuilt;
}

function profileMapping(profileId: ScalableEvaluationProfileIdV1): {
  readonly shardedProfileId:
    | "peers-500-interactions-5000"
    | "peers-5000-interactions-50000"
    | "peers-100000-interactions-1000000";
} {
  switch (profileId) {
    case "standard-500":
      return { shardedProfileId: "peers-500-interactions-5000" };
    case "large-5000":
      return { shardedProfileId: "peers-5000-interactions-50000" };
    case "frontier-100000":
      return { shardedProfileId: "peers-100000-interactions-1000000" };
  }
}

function manifestToDefinition(
  manifest: ReturnType<typeof createMultiDomainScenarioManifestV1>,
): MultiDomainScenarioDefinitionV1 {
  return freeze({
    schemaVersion: 1,
    scenarioId: manifest.scenarioId,
    scaleProfileId: manifest.scaleProfileId,
    seed: manifest.seed,
    domains: manifest.domains,
    entityCount: manifest.entityCount,
    topologyDigest: manifest.topologyDigest,
    transitionPolicyDigest: manifest.transitionPolicyDigest,
    visibilityPolicyDigest: manifest.visibilityPolicyDigest,
    faultModelDigest: manifest.faultModelDigest,
    resourceBudget: manifest.resourceBudget,
  });
}

function record(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function same(left: unknown, right: unknown): boolean {
  return (
    scalableEvaluationDigestV1("structural-equivalence", left) ===
    scalableEvaluationDigestV1("structural-equivalence", right)
  );
}

function identifier(value: unknown, label: string): asserts value is string {
  boundedString(value, label, MAXIMUM_IDENTIFIER_LENGTH);
  if (!(value as string).trim()) fail(`${label}_invalid`);
}

function boundedString(
  value: unknown,
  label: string,
  maximumLength: number,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximumLength
  )
    fail(`${label}_invalid`);
}

function digest(
  value: unknown,
  label: string,
): asserts value is PlanningDigestV1 {
  if (typeof value !== "string" || !DIGEST.test(value))
    fail(`${label}_invalid`);
}

function positiveInteger(
  value: unknown,
  label: string,
): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0)
    fail(`${label}_invalid`);
}

function nonNegativeInteger(
  value: unknown,
  label: string,
): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    fail(`${label}_invalid`);
}

function freeze<T>(value: T): T {
  return deepFreezePlanning(value as unknown as PlanningJson) as unknown as T;
}

function fail(code: string): never {
  throw new TypeError(`scalable_evaluation_${code}`);
}
