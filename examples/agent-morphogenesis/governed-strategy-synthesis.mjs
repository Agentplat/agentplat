import { createHash } from "node:crypto";
import {
  MORPHOGENESIS_SYNTHESIS_THREATS_V5,
  MorphogenesisStrategySynthesisRuntimeV5,
  createMorphogenesisStrategyGapV5,
  createMorphogenesisStrategySynthesisPolicyV5,
  createMorphogenesisSynthesizedStrategyManifestV5,
} from "@agentplat/collective-runtime/morphogenesis";

const digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const synthesizerImplementationDigest = digest("example-synthesizer-v1");
const policy = createMorphogenesisStrategySynthesisPolicyV5({
  schemaVersion: 5, policyId: "policy:synthesis:example", policyVersion: 1,
  parentPolicyDigest: null, catalogDigest: digest("catalog:v3"),
  governancePolicyDigest: digest("governance:v3"),
  admittedSynthesizerImplementationDigests: [synthesizerImplementationDigest],
  requiredThreats: MORPHOGENESIS_SYNTHESIS_THREATS_V5,
  allowedReviewRoutes: ["authorized_agent", "authorized_person", "collective"],
  minimumGapEvidence: 2, minimumEvaluationConfidenceBps: 8_000,
  minimumSafetyMicros: 800_000, maximumCandidateTtlMs: 60_000,
  maximumEvaluationTtlMs: 30_000, maximumTokenBudget: 10_000,
  maximumToolCalls: 8, maximumSpawnDepth: 0, maximumCandidatesPerGap: 4,
});
const gap = createMorphogenesisStrategyGapV5({
  gapId: "gap:example", catalogDigest: policy.catalogDigest,
  governanceStateDigest: digest("governance-state"), contextDigest: digest("context"),
  baselineStrategyId: "strategy:baseline",
  evaluatedStrategyIds: ["strategy:baseline"], eligibleStrategyIds: [],
  localEvidenceDigests: [digest("observed-outcome")],
  collectiveEvidenceDigests: [digest("collective-certificate")],
  evidenceDigests: [digest("observed-outcome"), digest("collective-certificate")],
  reasonCodes: ["catalog_candidates_inadequate"], detectedById: "agent:detector",
  detectorImplementationDigest: digest("detector"), detectedAtLogicalMs: 10,
  expiresAtLogicalMs: 50_000, policy,
});
const manifest = createMorphogenesisSynthesizedStrategyManifestV5({
  strategyId: "strategy:synthesized:example", strategyVersion: 1,
  strategyImplementationDigest: digest("immutable-strategy-artifact"),
  proposalGeneratorDigest: digest("proposal-generator"),
  blueprintCatalogDigest: digest("blueprint-catalog"),
  morphogenesisPolicyDigest: digest("morphogenesis-policy"),
  materialProfileDigest: digest("material-profile"),
  profileEvolutionDigest: digest("profile-evolution"),
  authorityAttenuationDigest: digest("authority-attenuation"),
  toolSetDigest: digest("tool-set"), memoryScopeDigest: digest("memory-scope"),
  inputContractDigest: digest("input-contract"),
  outputContractDigest: digest("output-contract"), supportedOperators: ["replace_agent"],
  tokenBudget: 5_000, toolCallBudget: 4, maximumSpawnDepth: 0,
});
const runtime = new MorphogenesisStrategySynthesisRuntimeV5({ policy,
  synthesizer: { synthesizerId: "agent:synthesizer", synthesizerVersion: 1,
    synthesizerImplementationDigest, async synthesize() {
      return { candidateId: "candidate:example", manifest,
        provenanceDigests: [digest("generation-receipt")], proposedAtLogicalMs: 20,
        expiresAtLogicalMs: 40_000 };
    } } });
const candidate = await runtime.synthesize({ gap, logicalTimeMs: 20 });
console.log(JSON.stringify({ candidateId: candidate.candidateId,
  candidateDigest: candidate.candidateDigest, status: candidate.status,
  inert: candidate.inert, next: "simulate, independently certify, gate, review, then canary" },
null, 2));
