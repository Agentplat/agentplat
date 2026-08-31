import type { AgentPlatID } from "@agentplat/core";

import {
  createLocalStrategyCatalogV1,
  createLocalStrategyDefinitionV1,
} from "./strategy-adaptation-runtime.js";
import {
  createMorphogenesisStrategyCatalogV3,
  createMorphogenesisStrategyDefinitionV3,
  validateMorphogenesisStrategyCatalogV3,
  type MorphogenesisStrategyCatalogV3,
} from "./morphogenesis-strategy-adaptation.js";
import {
  validateMorphogenesisStrategySynthesisCandidateV5,
  type MorphogenesisStrategySynthesisCandidateV5,
  type MorphogenesisStrategySynthesisPolicyV5,
} from "./morphogenesis-strategy-synthesis.js";
import type {
  MorphogenesisSynthesisCatalogEntryV5,
  MorphogenesisSynthesisGovernancePolicyV5,
} from "./morphogenesis-strategy-synthesis-governance.js";

const OPERATIONS = [
  "award_selection",
  "bid_submission",
  "offer_routing",
  "plan_decomposition",
  "recovery_selection",
] as const;

/** Materializes only immutable catalog records. It installs no code and grants
 * no selection or execution authority. Experimental entries remain canary-only. */
export function createMorphogenesisSynthesisCatalogSuccessorV5(input: {
  readonly currentCatalog: MorphogenesisStrategyCatalogV3;
  readonly candidate: MorphogenesisStrategySynthesisCandidateV5;
  readonly entry: MorphogenesisSynthesisCatalogEntryV5;
  readonly synthesisPolicy: MorphogenesisStrategySynthesisPolicyV5;
  readonly localCatalogId: AgentPlatID;
  readonly localCatalogVersion: number;
  readonly morphogenesisCatalogId: AgentPlatID;
  readonly morphogenesisCatalogVersion: number;
}): {
  readonly catalog: MorphogenesisStrategyCatalogV3;
  readonly availability: "canary_only" | "governed";
  readonly grantsAuthority: false;
} {
  const current = validateMorphogenesisStrategyCatalogV3(input.currentCatalog);
  const candidate = validateMorphogenesisStrategySynthesisCandidateV5(
    input.candidate,
    input.synthesisPolicy,
  );
  if (
    current.catalogDigest !== candidate.catalogDigest ||
    input.entry.candidate.candidateDigest !== candidate.candidateDigest ||
    !["experimental", "certified"].includes(input.entry.status) ||
    current.strategies.some(
      ({ strategy }) => strategy.strategyId === candidate.manifest.strategyId,
    )
  )
    throw new TypeError("synthesized strategy catalog admission is invalid");
  const strategy = createLocalStrategyDefinitionV1({
    schemaVersion: 1,
    strategyId: candidate.manifest.strategyId,
    strategyVersion: candidate.manifest.strategyVersion,
    implementationDigest: candidate.manifest.strategyImplementationDigest,
    operations: OPERATIONS,
  });
  const localCatalog = createLocalStrategyCatalogV1({
    schemaVersion: 1,
    catalogId: input.localCatalogId,
    catalogVersion: input.localCatalogVersion,
    parentCatalogDigest: current.localCatalog.catalogDigest,
    strategies: [...current.localCatalog.strategies, strategy],
    baselines: current.localCatalog.baselines,
  });
  const definition = createMorphogenesisStrategyDefinitionV3({
    strategy,
    morphogenesisPolicyDigest: candidate.manifest.morphogenesisPolicyDigest,
    blueprintCatalogDigest: candidate.manifest.blueprintCatalogDigest,
    proposalGeneratorDigest: candidate.manifest.proposalGeneratorDigest,
    supportedOperators: candidate.manifest.supportedOperators as never,
  });
  const catalog = createMorphogenesisStrategyCatalogV3({
    catalogId: input.morphogenesisCatalogId,
    catalogVersion: input.morphogenesisCatalogVersion,
    parentCatalogDigest: current.catalogDigest,
    localCatalog,
    strategies: [...current.strategies, definition],
  });
  return Object.freeze({
    catalog,
    availability:
      input.entry.status === "experimental" ? "canary_only" : "governed",
    grantsAuthority: false as const,
  });
}

export function morphogenesisSynthesisStrategyAvailableV5(input: {
  readonly entry: MorphogenesisSynthesisCatalogEntryV5;
  readonly governancePolicy: MorphogenesisSynthesisGovernancePolicyV5;
  readonly canarySelection: boolean;
}): boolean {
  return (
    input.entry.status === "certified" ||
    (input.entry.status === "experimental" &&
      input.canarySelection &&
      input.entry.canary.selections <
        input.governancePolicy.maximumCanarySelections)
  );
}
