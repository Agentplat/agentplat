import { createHash } from "node:crypto";
import {
  MORPHOGENESIS_AGENT_GENESIS_THREATS_V6,
  createMorphogenesisAgentGenesisNeedV6,
  createMorphogenesisAgentGenesisPolicyV6,
} from "@agentplat/collective-runtime/morphogenesis";

const digest = (value) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;
const policy = createMorphogenesisAgentGenesisPolicyV6({
  schemaVersion: 6,
  policyId: "policy:agent-genesis:example",
  policyVersion: 1,
  parentPolicyDigest: null,
  morphogenesisPolicyDigest: digest("morphogenesis-policy"),
  strategySynthesisPolicyDigest: digest("strategy-synthesis-v5"),
  admittedGeneratorImplementationDigests: [digest("agent-generator-v1")],
  requiredThreats: MORPHOGENESIS_AGENT_GENESIS_THREATS_V6,
  allowedReviewRoutes: ["authorized_agent", "authorized_person", "collective"],
  maximumResourceBudgetUnits: 20,
  maximumInteractionBudgetUnits: 30,
  maximumActionBudgetUnits: 3,
  maximumDraftTtlMs: 60_000,
  maximumProbationInteractions: 10,
  maximumSpawnDepth: 0,
  minimumAssessmentConfidenceBps: 8_000,
  minimumSafetyMicros: 800_000,
  maximumAssessmentTtlMs: 30_000,
});
const need = createMorphogenesisAgentGenesisNeedV6({
  needId: "need:agent-genesis:example",
  scopeDigest: digest("scope"),
  morphogenesisNeedDigest: digest("need"),
  strategyCandidateDigest: digest("strategy-v5"),
  strategyCertificationDigest: digest("strategy-v5-certification"),
  evaluatedBlueprintDigests: [digest("catalog-blueprint")],
  eligibleBlueprintDigests: [],
  localEvidenceDigests: [digest("local-outcome")],
  collectiveEvidenceDigests: [digest("collective-certificate")],
  reasonCodes: ["blueprint_gap"],
  detectedAtLogicalMs: 10,
  expiresAtLogicalMs: 50_000,
  policy,
});
console.log(
  JSON.stringify(
    {
      needId: need.needId,
      needDigest: need.needDigest,
      genesisRequired: need.genesisRequired,
      advisoryOnly: need.advisoryOnly,
      next: "generate V2 profile, evaluate, sandbox, probation, review, Membership, attest",
    },
    null,
    2,
  ),
);
