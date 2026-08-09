import {
  deepFreezePlanning,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";

import {
  MULTI_DOMAIN_ENVIRONMENT_DOMAINS_V1,
  MULTI_DOMAIN_ENVIRONMENT_MODALITIES_V1,
  type MultiDomainActionEnvelopeV1,
  type MultiDomainActionSchemaV1,
  type MultiDomainEnvironmentDescriptorV1,
  type MultiDomainEnvironmentDomainV1,
  type MultiDomainEnvironmentLimitsV1,
  type MultiDomainEnvironmentModalityV1,
  type MultiDomainObservationEnvelopeV1,
  type MultiDomainObservationSchemaV1,
  type MultiDomainScenarioDefinitionV1,
  type MultiDomainScenarioManifestV1,
} from "./multi-domain-environment-contracts.js";
import {
  shardedSimulationDigestV1,
  shardedSimulationScaleProfileV1,
  type ShardedSimulationScaleProfileIdV1,
} from "./sharded-simulation-contracts.js";

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const MAXIMUM_SCHEMAS = 64;
const MAXIMUM_CAPABILITIES = 64;
const MAXIMUM_PAYLOAD_BYTES = 16 * 1024 * 1024;
const encoder = new TextEncoder();

export function multiDomainEnvironmentDigestV1(
  domain: string,
  value: unknown,
): PlanningDigestV1 {
  return shardedSimulationDigestV1(
    `multi-domain-environment/${domain}/v1`,
    value,
  );
}

export function createMultiDomainEnvironmentDescriptorV1(input: {
  readonly adapterId: string;
  readonly adapterVersion: number;
  readonly implementationDigest: PlanningDigestV1;
  readonly domains: readonly MultiDomainEnvironmentDomainV1[];
  readonly capabilities: readonly string[];
  readonly observationSchemas: readonly MultiDomainObservationSchemaV1[];
  readonly actionSchemas: readonly MultiDomainActionSchemaV1[];
  readonly limits: MultiDomainEnvironmentLimitsV1;
  readonly deterministicReplay: boolean;
}): MultiDomainEnvironmentDescriptorV1 {
  identifier(input.adapterId, "adapter_id");
  positive(input.adapterVersion, "adapter_version");
  digest(input.implementationDigest, "implementation_digest");
  const domains = canonicalDomains(input.domains);
  const capabilities = canonicalIdentifiers(
    input.capabilities,
    MAXIMUM_CAPABILITIES,
    "capabilities",
  );
  const observationSchemas = canonicalObservationSchemas(
    input.observationSchemas,
    domains,
  );
  const actionSchemas = canonicalActionSchemas(
    input.actionSchemas,
    domains,
    capabilities,
  );
  const limits = validateMultiDomainEnvironmentLimitsV1(input.limits);
  if (typeof input.deterministicReplay !== "boolean")
    fail("deterministic_replay_invalid");
  const body = {
    schemaVersion: 1 as const,
    adapterId: input.adapterId,
    adapterVersion: input.adapterVersion,
    implementationDigest: input.implementationDigest,
    domains,
    capabilities,
    observationSchemas,
    actionSchemas,
    limits,
    deterministicReplay: input.deterministicReplay,
  };
  return freeze({
    ...body,
    descriptorDigest: multiDomainEnvironmentDigestV1("descriptor", body),
  });
}

export function validateMultiDomainEnvironmentDescriptorV1(
  input: unknown,
): MultiDomainEnvironmentDescriptorV1 {
  const value = object(
    input,
    "descriptor",
  ) as unknown as MultiDomainEnvironmentDescriptorV1;
  exact(
    value,
    [
      "schemaVersion",
      "adapterId",
      "adapterVersion",
      "implementationDigest",
      "domains",
      "capabilities",
      "observationSchemas",
      "actionSchemas",
      "limits",
      "deterministicReplay",
      "descriptorDigest",
    ],
    "descriptor",
  );
  if (value.schemaVersion !== 1) fail("descriptor_schema_invalid");
  const rebuilt = createMultiDomainEnvironmentDescriptorV1(value);
  if (!same(value, rebuilt)) fail("descriptor_digest_invalid");
  return rebuilt;
}

export function createMultiDomainScenarioManifestV1(input: {
  readonly descriptor: MultiDomainEnvironmentDescriptorV1;
  readonly definition: MultiDomainScenarioDefinitionV1;
}): MultiDomainScenarioManifestV1 {
  const descriptor = validateMultiDomainEnvironmentDescriptorV1(
    input.descriptor,
  );
  const definition = validateScenarioDefinition(input.definition, descriptor);
  const body = {
    schemaVersion: 1 as const,
    scenarioId: definition.scenarioId,
    adapterDescriptorDigest: descriptor.descriptorDigest,
    scaleProfileId: definition.scaleProfileId,
    seed: definition.seed,
    domains: definition.domains,
    entityCount: definition.entityCount,
    topologyDigest: definition.topologyDigest,
    transitionPolicyDigest: definition.transitionPolicyDigest,
    visibilityPolicyDigest: definition.visibilityPolicyDigest,
    faultModelDigest: definition.faultModelDigest,
    resourceBudget: definition.resourceBudget,
  };
  return freeze({
    ...body,
    manifestDigest: multiDomainEnvironmentDigestV1("scenario-manifest", body),
  });
}

export function validateMultiDomainScenarioManifestV1(
  input: unknown,
  descriptor: MultiDomainEnvironmentDescriptorV1,
): MultiDomainScenarioManifestV1 {
  const value = object(
    input,
    "scenario_manifest",
  ) as unknown as MultiDomainScenarioManifestV1;
  exact(
    value,
    [
      "schemaVersion",
      "scenarioId",
      "adapterDescriptorDigest",
      "scaleProfileId",
      "seed",
      "domains",
      "entityCount",
      "topologyDigest",
      "transitionPolicyDigest",
      "visibilityPolicyDigest",
      "faultModelDigest",
      "resourceBudget",
      "manifestDigest",
    ],
    "scenario_manifest",
  );
  if (value.schemaVersion !== 1) fail("scenario_manifest_schema_invalid");
  if (value.adapterDescriptorDigest !== descriptor.descriptorDigest)
    fail("scenario_adapter_binding_invalid");
  const rebuilt = createMultiDomainScenarioManifestV1({
    descriptor,
    definition: {
      schemaVersion: 1,
      scenarioId: value.scenarioId,
      scaleProfileId: value.scaleProfileId,
      seed: value.seed,
      domains: value.domains,
      entityCount: value.entityCount,
      topologyDigest: value.topologyDigest,
      transitionPolicyDigest: value.transitionPolicyDigest,
      visibilityPolicyDigest: value.visibilityPolicyDigest,
      faultModelDigest: value.faultModelDigest,
      resourceBudget: value.resourceBudget,
    },
  });
  if (!same(value, rebuilt)) fail("scenario_manifest_digest_invalid");
  return rebuilt;
}

export function createMultiDomainObservationEnvelopeV1(input: {
  readonly descriptor: MultiDomainEnvironmentDescriptorV1;
  readonly observationId: string;
  readonly domain: Exclude<MultiDomainEnvironmentDomainV1, "hybrid">;
  readonly entityId: string;
  readonly modality: MultiDomainEnvironmentModalityV1;
  readonly schemaDigest: PlanningDigestV1;
  readonly logicalTime: number;
  readonly payload: PlanningJson;
}): MultiDomainObservationEnvelopeV1 {
  const descriptor = validateMultiDomainEnvironmentDescriptorV1(
    input.descriptor,
  );
  identifier(input.observationId, "observation_id");
  identifier(input.entityId, "entity_id");
  nonNegative(input.logicalTime, "observation_logical_time");
  const schema = descriptor.observationSchemas.find(
    (candidate) =>
      candidate.domain === input.domain &&
      candidate.modality === input.modality &&
      candidate.schemaDigest === input.schemaDigest,
  );
  if (!schema) fail("observation_schema_not_registered");
  strictJson(input.payload, "observation_payload");
  if (jsonBytes(input.payload) > descriptor.limits.maximumObservationBytes)
    fail("observation_payload_limit_exceeded");
  const body = {
    schemaVersion: 1 as const,
    observationId: input.observationId,
    domain: input.domain,
    entityId: input.entityId,
    modality: input.modality,
    schemaDigest: input.schemaDigest,
    logicalTime: input.logicalTime,
    payload: freeze(input.payload),
  };
  return freeze({
    ...body,
    observationDigest: multiDomainEnvironmentDigestV1("observation", body),
  });
}

export function validateMultiDomainObservationEnvelopeV1(
  input: unknown,
  descriptor: MultiDomainEnvironmentDescriptorV1,
): MultiDomainObservationEnvelopeV1 {
  const value = object(
    input,
    "observation",
  ) as unknown as MultiDomainObservationEnvelopeV1;
  exact(
    value,
    [
      "schemaVersion",
      "observationId",
      "domain",
      "entityId",
      "modality",
      "schemaDigest",
      "logicalTime",
      "payload",
      "observationDigest",
    ],
    "observation",
  );
  if (value.schemaVersion !== 1) fail("observation_schema_version_invalid");
  const rebuilt = createMultiDomainObservationEnvelopeV1({
    descriptor,
    ...value,
  });
  if (!same(value, rebuilt)) fail("observation_digest_invalid");
  return rebuilt;
}

export function validateMultiDomainActionEnvelopeV1(
  input: unknown,
  descriptor: MultiDomainEnvironmentDescriptorV1,
): MultiDomainActionEnvelopeV1 {
  const value = object(
    input,
    "action",
  ) as unknown as MultiDomainActionEnvelopeV1;
  exact(
    value,
    [
      "schemaVersion",
      "domain",
      "entityId",
      "capability",
      "schemaDigest",
      "payload",
    ],
    "action",
  );
  if (value.schemaVersion !== 1) fail("action_schema_version_invalid");
  identifier(value.entityId, "action_entity_id");
  identifier(value.capability, "action_capability");
  digest(value.schemaDigest, "action_schema_digest");
  strictJson(value.payload, "action_payload");
  const schema = descriptor.actionSchemas.find(
    (candidate) =>
      candidate.domain === value.domain &&
      candidate.capability === value.capability &&
      candidate.schemaDigest === value.schemaDigest,
  );
  if (!schema) fail("action_capability_not_registered");
  if (jsonBytes(value.payload) > descriptor.limits.maximumActionBytes)
    fail("action_payload_limit_exceeded");
  return freeze({ ...value, payload: freeze(value.payload) });
}

function validateScenarioDefinition(
  input: unknown,
  descriptor: MultiDomainEnvironmentDescriptorV1,
): MultiDomainScenarioDefinitionV1 {
  const value = object(
    input,
    "scenario_definition",
  ) as unknown as MultiDomainScenarioDefinitionV1;
  exact(
    value,
    [
      "schemaVersion",
      "scenarioId",
      "scaleProfileId",
      "seed",
      "domains",
      "entityCount",
      "topologyDigest",
      "transitionPolicyDigest",
      "visibilityPolicyDigest",
      "faultModelDigest",
      "resourceBudget",
    ],
    "scenario_definition",
  );
  if (value.schemaVersion !== 1) fail("scenario_definition_schema_invalid");
  identifier(value.scenarioId, "scenario_id");
  nonNegative(value.seed, "scenario_seed");
  const scaleProfile = profileFor(value.scaleProfileId);
  const domains = canonicalDomains(value.domains);
  if (domains.some((domain) => !descriptor.domains.includes(domain)))
    fail("scenario_domain_not_supported");
  positive(value.entityCount, "entity_count");
  if (
    value.entityCount > scaleProfile.logicalPeerCount ||
    value.entityCount > descriptor.limits.maximumEntities
  )
    fail("scenario_entity_limit_exceeded");
  for (const [label, candidate] of [
    ["topology_digest", value.topologyDigest],
    ["transition_policy_digest", value.transitionPolicyDigest],
    ["visibility_policy_digest", value.visibilityPolicyDigest],
    ["fault_model_digest", value.faultModelDigest],
  ] as const)
    digest(candidate, label);
  const budget = validateResourceBudget(value.resourceBudget);
  if (
    budget.maximumInteractions > scaleProfile.interactionCeiling ||
    budget.maximumObservationBytes >
      descriptor.limits.maximumObservationBytes ||
    budget.maximumActionBytes > descriptor.limits.maximumActionBytes ||
    budget.maximumCheckpointBytes > descriptor.limits.maximumCheckpointBytes
  )
    fail("scenario_resource_budget_exceeded");
  return freeze({ ...value, domains, resourceBudget: budget });
}

function validateMultiDomainEnvironmentLimitsV1(
  input: unknown,
): MultiDomainEnvironmentLimitsV1 {
  const value = object(
    input,
    "limits",
  ) as unknown as MultiDomainEnvironmentLimitsV1;
  exact(
    value,
    [
      "maximumEntities",
      "maximumObservationBytes",
      "maximumActionBytes",
      "maximumObservationsPerPull",
      "maximumCheckpointBytes",
    ],
    "limits",
  );
  positive(value.maximumEntities, "maximum_entities");
  positive(value.maximumObservationBytes, "maximum_observation_bytes");
  positive(value.maximumActionBytes, "maximum_action_bytes");
  positive(value.maximumObservationsPerPull, "maximum_observations_per_pull");
  positive(value.maximumCheckpointBytes, "maximum_checkpoint_bytes");
  if (
    value.maximumEntities > 100_000 ||
    value.maximumObservationBytes > MAXIMUM_PAYLOAD_BYTES ||
    value.maximumActionBytes > MAXIMUM_PAYLOAD_BYTES ||
    value.maximumObservationsPerPull > 1_024 ||
    value.maximumCheckpointBytes > MAXIMUM_PAYLOAD_BYTES
  )
    fail("limits_exceed_protocol_ceiling");
  return freeze({ ...value });
}

function validateResourceBudget(
  input: unknown,
): MultiDomainScenarioDefinitionV1["resourceBudget"] {
  const value = object(
    input,
    "resource_budget",
  ) as unknown as MultiDomainScenarioDefinitionV1["resourceBudget"];
  exact(
    value,
    [
      "maximumInteractions",
      "maximumObservationBytes",
      "maximumActionBytes",
      "maximumCheckpointBytes",
    ],
    "resource_budget",
  );
  for (const [label, candidate] of Object.entries(value))
    positive(candidate, label);
  return freeze({ ...value });
}

function canonicalObservationSchemas(
  input: readonly MultiDomainObservationSchemaV1[],
  domains: readonly MultiDomainEnvironmentDomainV1[],
): readonly MultiDomainObservationSchemaV1[] {
  if (
    !Array.isArray(input) ||
    input.length === 0 ||
    input.length > MAXIMUM_SCHEMAS
  )
    fail("observation_schemas_invalid");
  const allowedDomains = new Set(
    domains.filter((domain) => domain !== "hybrid"),
  );
  const result = input
    .map((schema) => {
      exact(
        object(schema, "observation_schema"),
        ["schemaVersion", "domain", "modality", "schemaId", "schemaDigest"],
        "observation_schema",
      );
      if (schema.schemaVersion !== 1 || !allowedDomains.has(schema.domain))
        fail("observation_schema_domain_invalid");
      if (
        !(MULTI_DOMAIN_ENVIRONMENT_MODALITIES_V1 as readonly string[]).includes(
          schema.modality,
        )
      )
        fail("observation_schema_modality_invalid");
      identifier(schema.schemaId, "observation_schema_id");
      digest(schema.schemaDigest, "observation_schema_digest");
      return freeze({ ...schema });
    })
    .sort(
      (left, right) =>
        left.domain.localeCompare(right.domain) ||
        left.modality.localeCompare(right.modality) ||
        left.schemaId.localeCompare(right.schemaId),
    );
  const keys = result.map(
    (schema) => `${schema.domain}\0${schema.modality}\0${schema.schemaId}`,
  );
  if (new Set(keys).size !== keys.length) fail("observation_schema_duplicate");
  return Object.freeze(result);
}

function canonicalActionSchemas(
  input: readonly MultiDomainActionSchemaV1[],
  domains: readonly MultiDomainEnvironmentDomainV1[],
  capabilities: readonly string[],
): readonly MultiDomainActionSchemaV1[] {
  if (
    !Array.isArray(input) ||
    input.length === 0 ||
    input.length > MAXIMUM_SCHEMAS
  )
    fail("action_schemas_invalid");
  const allowedDomains = new Set(
    domains.filter((domain) => domain !== "hybrid"),
  );
  const allowedCapabilities = new Set(capabilities);
  const result = input
    .map((schema) => {
      exact(
        object(schema, "action_schema"),
        ["schemaVersion", "domain", "capability", "schemaId", "schemaDigest"],
        "action_schema",
      );
      if (
        schema.schemaVersion !== 1 ||
        !allowedDomains.has(schema.domain) ||
        !allowedCapabilities.has(schema.capability)
      )
        fail("action_schema_binding_invalid");
      identifier(schema.capability, "action_schema_capability");
      identifier(schema.schemaId, "action_schema_id");
      digest(schema.schemaDigest, "action_schema_digest");
      return freeze({ ...schema });
    })
    .sort(
      (left, right) =>
        left.domain.localeCompare(right.domain) ||
        left.capability.localeCompare(right.capability) ||
        left.schemaId.localeCompare(right.schemaId),
    );
  const keys = result.map(
    (schema) => `${schema.domain}\0${schema.capability}\0${schema.schemaId}`,
  );
  if (new Set(keys).size !== keys.length) fail("action_schema_duplicate");
  return Object.freeze(result);
}

function canonicalDomains(
  input: readonly MultiDomainEnvironmentDomainV1[],
): readonly MultiDomainEnvironmentDomainV1[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > 4)
    fail("domains_invalid");
  const allowed = new Set<string>(MULTI_DOMAIN_ENVIRONMENT_DOMAINS_V1);
  if (input.some((domain) => !allowed.has(domain))) fail("domain_invalid");
  const result = [...new Set(input)].sort() as MultiDomainEnvironmentDomainV1[];
  if (result.length !== input.length) fail("domain_duplicate");
  if (result.includes("hybrid") && result.length < 3)
    fail("hybrid_domain_requires_multiple_domains");
  return Object.freeze(result);
}

function canonicalIdentifiers(
  input: readonly string[],
  maximum: number,
  label: string,
): readonly string[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > maximum)
    fail(`${label}_invalid`);
  for (const value of input) identifier(value, label);
  const result = [...new Set(input)].sort();
  if (result.length !== input.length) fail(`${label}_duplicate`);
  return Object.freeze(result);
}

function profileFor(id: ShardedSimulationScaleProfileIdV1) {
  try {
    return shardedSimulationScaleProfileV1(id);
  } catch {
    fail("scale_profile_invalid");
  }
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    fail(`${label}_invalid`);
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null)
    fail(`${label}_prototype_invalid`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Object.values(descriptors).some((entry) => "get" in entry || "set" in entry)
  )
    fail(`${label}_accessor_invalid`);
  return value as Record<string, unknown>;
}
function exact(value: object, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  )
    fail(`${label}_shape_invalid`);
}
function identifier(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 256)
    fail(`${label}_invalid`);
}
function digest(
  value: unknown,
  label: string,
): asserts value is PlanningDigestV1 {
  if (typeof value !== "string" || !DIGEST.test(value))
    fail(`${label}_invalid`);
}
function positive(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1)
    fail(`${label}_invalid`);
}
function nonNegative(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    fail(`${label}_invalid`);
}
function strictJson(
  value: unknown,
  label: string,
): asserts value is PlanningJson {
  try {
    deepFreezePlanning(value as PlanningJson);
  } catch {
    fail(`${label}_invalid`);
  }
}
function jsonBytes(value: PlanningJson): number {
  return encoder.encode(JSON.stringify(value)).byteLength;
}
function freeze<T>(value: T): T {
  return deepFreezePlanning(value as unknown as PlanningJson) as unknown as T;
}
function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
function fail(code: string): never {
  throw new TypeError(`multi_domain_environment_${code}`);
}
