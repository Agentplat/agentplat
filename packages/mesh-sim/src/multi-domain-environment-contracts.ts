import type {
  PlanningDigestV1,
  PlanningJson,
} from "@agentplat/collective-planning";

import type {
  ShardedSimulationEnvironmentBridgeV1,
  ShardedSimulationScaleProfileIdV1,
} from "./sharded-simulation-contracts.js";

export const MULTI_DOMAIN_ENVIRONMENT_SCHEMA_VERSION_V1 = 1 as const;

export const MULTI_DOMAIN_ENVIRONMENT_DOMAINS_V1 = Object.freeze([
  "physical",
  "social",
  "cyber",
  "hybrid",
] as const);
export type MultiDomainEnvironmentDomainV1 =
  (typeof MULTI_DOMAIN_ENVIRONMENT_DOMAINS_V1)[number];

export const MULTI_DOMAIN_ENVIRONMENT_MODALITIES_V1 = Object.freeze([
  "text",
  "image",
  "sensor",
  "state",
] as const);
export type MultiDomainEnvironmentModalityV1 =
  (typeof MULTI_DOMAIN_ENVIRONMENT_MODALITIES_V1)[number];

/** Closed hard bounds applied before adapters allocate scenario state. */
export interface MultiDomainEnvironmentLimitsV1 {
  readonly maximumEntities: number;
  readonly maximumObservationBytes: number;
  readonly maximumActionBytes: number;
  readonly maximumObservationsPerPull: number;
  readonly maximumCheckpointBytes: number;
}

export interface MultiDomainObservationSchemaV1 {
  readonly schemaVersion: 1;
  readonly domain: Exclude<MultiDomainEnvironmentDomainV1, "hybrid">;
  readonly modality: MultiDomainEnvironmentModalityV1;
  readonly schemaId: string;
  readonly schemaDigest: PlanningDigestV1;
}

export interface MultiDomainActionSchemaV1 {
  readonly schemaVersion: 1;
  readonly domain: Exclude<MultiDomainEnvironmentDomainV1, "hybrid">;
  readonly capability: string;
  readonly schemaId: string;
  readonly schemaDigest: PlanningDigestV1;
}

/** Provider-neutral, content-free registration for one environment implementation. */
export interface MultiDomainEnvironmentDescriptorV1 {
  readonly schemaVersion: 1;
  readonly adapterId: string;
  readonly adapterVersion: number;
  readonly implementationDigest: PlanningDigestV1;
  readonly domains: readonly MultiDomainEnvironmentDomainV1[];
  readonly capabilities: readonly string[];
  readonly observationSchemas: readonly MultiDomainObservationSchemaV1[];
  readonly actionSchemas: readonly MultiDomainActionSchemaV1[];
  readonly limits: MultiDomainEnvironmentLimitsV1;
  readonly deterministicReplay: boolean;
  readonly descriptorDigest: PlanningDigestV1;
}

export interface MultiDomainScenarioResourceBudgetV1 {
  readonly maximumInteractions: number;
  readonly maximumObservationBytes: number;
  readonly maximumActionBytes: number;
  readonly maximumCheckpointBytes: number;
}

/** Immutable scenario identity. Private simulator state is deliberately absent. */
export interface MultiDomainScenarioManifestV1 {
  readonly schemaVersion: 1;
  readonly scenarioId: string;
  readonly adapterDescriptorDigest: PlanningDigestV1;
  readonly scaleProfileId: ShardedSimulationScaleProfileIdV1;
  readonly seed: number;
  readonly domains: readonly MultiDomainEnvironmentDomainV1[];
  readonly entityCount: number;
  readonly topologyDigest: PlanningDigestV1;
  readonly transitionPolicyDigest: PlanningDigestV1;
  readonly visibilityPolicyDigest: PlanningDigestV1;
  readonly faultModelDigest: PlanningDigestV1;
  readonly resourceBudget: MultiDomainScenarioResourceBudgetV1;
  readonly manifestDigest: PlanningDigestV1;
}

export interface MultiDomainScenarioDefinitionV1 {
  readonly schemaVersion: 1;
  readonly scenarioId: string;
  readonly scaleProfileId: ShardedSimulationScaleProfileIdV1;
  readonly seed: number;
  readonly domains: readonly MultiDomainEnvironmentDomainV1[];
  readonly entityCount: number;
  readonly topologyDigest: PlanningDigestV1;
  readonly transitionPolicyDigest: PlanningDigestV1;
  readonly visibilityPolicyDigest: PlanningDigestV1;
  readonly faultModelDigest: PlanningDigestV1;
  readonly resourceBudget: MultiDomainScenarioResourceBudgetV1;
}

/** The only observation shape that a conforming adapter may expose to a runner. */
export interface MultiDomainObservationEnvelopeV1 {
  readonly schemaVersion: 1;
  readonly observationId: string;
  readonly domain: Exclude<MultiDomainEnvironmentDomainV1, "hybrid">;
  readonly entityId: string;
  readonly modality: MultiDomainEnvironmentModalityV1;
  readonly schemaDigest: PlanningDigestV1;
  readonly logicalTime: number;
  readonly payload: PlanningJson;
  readonly observationDigest: PlanningDigestV1;
}

/** An action remains subject to the outer execution epoch and fencing token. */
export interface MultiDomainActionEnvelopeV1 {
  readonly schemaVersion: 1;
  readonly domain: Exclude<MultiDomainEnvironmentDomainV1, "hybrid">;
  readonly entityId: string;
  readonly capability: string;
  readonly schemaDigest: PlanningDigestV1;
  readonly payload: PlanningJson;
}

export interface MultiDomainEnvironmentAdapterV1 {
  readonly descriptor: MultiDomainEnvironmentDescriptorV1;
  createScenario(
    definition: MultiDomainScenarioDefinitionV1,
  ): MultiDomainScenarioManifestV1 | Promise<MultiDomainScenarioManifestV1>;
  openScenario(input: {
    readonly manifest: MultiDomainScenarioManifestV1;
  }):
    | ShardedSimulationEnvironmentBridgeV1
    | Promise<ShardedSimulationEnvironmentBridgeV1>;
}

export interface MultiDomainAdapterConformanceReportV1 {
  readonly schemaVersion: 1;
  readonly adapterDescriptorDigest: PlanningDigestV1;
  readonly scenarioManifestDigest: PlanningDigestV1;
  readonly scaleProfileId: ShardedSimulationScaleProfileIdV1;
  readonly descriptorValid: boolean;
  readonly manifestReplayStable: boolean;
  readonly observationReplayStable: boolean;
  readonly capabilityFailClosed: boolean;
  readonly staleFenceRejected: boolean;
  readonly checkpointRestoreStable: boolean;
  readonly boundedState: boolean;
  readonly conformant: boolean;
  readonly reportDigest: PlanningDigestV1;
}
