import { createHash } from "node:crypto";
import {
  SequentialSemanticGuaranteeEngineV1,
} from "../packages/inference-control/dist/index.js";
import {
  createConfirmatorySemanticAgreementCertificateV1,
  projectConfirmatorySemanticHorizonV1,
  replayConfirmatorySemanticHorizonV1,
  CONFIRMATORY_SEMANTIC_DECISION_COUNT_V1,
} from "../packages/mesh-sim/dist/index.js";
import { digestPlanningJsonV1 } from "../packages/collective-planning/dist/index.js";
import { InProcessSparseBftFinalityGatewayV1 } from "../packages/collective-host/dist/index.js";
import { createSparseCommitteePolicyV2, sparseAggregateSignerSetDigestV2 } from "../packages/collective-quorum/dist/sparse-agreement.js";

const executionId = "confirmatory-semantic-horizon-smoke-v1";
const registrationDigest = digest("registration", { executionId, owner: "evaluator" });
const membershipConfigurationDigest = digest("membership", { epoch: 1, validators: ["v0", "v1", "v2", "v3"] });
const engine = new SequentialSemanticGuaranteeEngineV1(CONFIRMATORY_SEMANTIC_DECISION_COUNT_V1, 9_500);
const decisionEvents = [];
const scenarioByDecision = new Map();
for (let sequence = 1; sequence <= CONFIRMATORY_SEMANTIC_DECISION_COUNT_V1; sequence += 1) {
  const scenario = sequence % 37 === 0 ? ["context_conflict", "high_uncertainty", "low_action_diversity", "low_action_novelty", "controller_restriction"][Math.floor(sequence / 37) % 5] : "nominal";
  const metrics = {
    roleCoherenceBps: 8_000 + (sequence % 500),
    missionAlignmentBps: 8_500 + (sequence % 300),
    contextConflictBps: scenario === "context_conflict" ? 9_000 : 500 + (sequence % 100),
    uncertaintyBps: scenario === "high_uncertainty" ? 9_000 : 1_000 + (sequence % 200),
    courseActionDiversityBps: scenario === "low_action_diversity" ? 100 : 7_000 + (sequence % 400),
    courseActionNoveltyBps: scenario === "low_action_novelty" ? 100 : 6_000 + (sequence % 350),
  };
  if (scenario === "context_conflict") metrics.contextConflictBps = 9_000;
  const assessmentDigest = digest("semantic-assessment", { sequence, metrics });
  const guarantee = engine.append({ sequence, logicalTimeMs: sequence, metrics, assessmentDigest });
  const disposition = sequence % 37 === 0 ? "not_useful" : "useful";
  const decisionDigest = digest("decision", { sequence, assessmentDigest, disposition });
  const traceEventId = `inference.assessed:${sequence}`;
  const traceDigest = digest("trace-binding", { executionId, traceEventId, decisionDigest });
  decisionEvents.push({
    schemaVersion: 1,
    projectionOwner: "evaluator",
    decisionId: `semantic-decision:${sequence}`,
    executionId,
    registrationDigest,
    traceEventId,
    traceDigest,
    membershipEpoch: 1,
    membershipConfigurationDigest,
    assignmentEpoch: 1,
    decisionDigest,
    disposition,
    evidenceDigest: digest("evidence", { sequence, assessmentDigest, throughSequence: guarantee.throughSequence }),
  });
  scenarioByDecision.set(`semantic-decision:${sequence}`, scenario);
}
const sortedDecisionDigests = decisionEvents.slice().sort((a, b) => a.decisionId.localeCompare(b.decisionId)).map((event) => event.decisionDigest);
const decisionRootDigest = digest("decision-root", { executionId, decisionDigests: sortedDecisionDigests });
const sparseCertificate = await issueSparseCertificate({
  epoch: 1,
  membershipConfigurationDigest,
  decisionRootDigest,
});
const certificate = createConfirmatorySemanticAgreementCertificateV1({ ...sparseCertificate, decisionRootDigest });
const input = { executionId, registrationDigest, membershipEpoch: 1, membershipConfigurationDigest, decisionEvents, agreementCertificate: certificate };
const projection = projectConfirmatorySemanticHorizonV1(input);
if (projection.status !== "complete" || projection.observedDecisionCount !== 1_000) throw new Error("confirmatory_horizon_smoke_incomplete");
replayConfirmatorySemanticHorizonV1(input, projection);
const bundle = JSON.parse(JSON.stringify({ input, projection }));
const recovered = projectConfirmatorySemanticHorizonV1(bundle.input);
if (recovered.projectionDigest !== projection.projectionDigest) throw new Error("bundle_recovery_diverged");
let staleRejected = false;
try { projectConfirmatorySemanticHorizonV1({ ...input, decisionEvents: decisionEvents.map((event, index) => index === 999 ? { ...event, traceEventId: "stale:trace" } : event) }); } catch { staleRejected = true; }
if (!staleRejected) throw new Error("stale_evidence_was_accepted");
const sensitivity = [100, 250, 500, 1_000].map((horizon) => {
  const events = decisionEvents.slice(0, horizon);
  const partial = projectConfirmatorySemanticHorizonV1({ ...input, decisionEvents: events, agreementCertificate: horizon === 1_000 ? certificate : null });
  return { horizon, observedDecisionCount: partial.observedDecisionCount, usefulDecisionCount: partial.usefulDecisionCount, usefulDecisionRate: partial.usefulDecisionCount / horizon, status: partial.status };
});
const classification = {
  useful: decisionEvents.filter((event) => event.disposition === "useful").length,
  notUseful: decisionEvents.filter((event) => event.disposition === "not_useful").length,
  unsafe: decisionEvents.filter((event) => event.disposition === "unsafe").length,
};
const causalClassification = Object.fromEntries(["context_conflict", "high_uncertainty", "low_action_diversity", "low_action_novelty", "controller_restriction"].map((cause) => [cause, decisionEvents.filter((event) => event.disposition === "not_useful" && scenarioByDecision.get(event.decisionId) === cause).length]));
if (Object.values(causalClassification).reduce((sum, count) => sum + count, 0) !== classification.notUseful) throw new Error("causal_classification_incomplete");
console.log(JSON.stringify({ executionId, status: projection.status, observedDecisionCount: projection.observedDecisionCount, usefulDecisionCount: projection.usefulDecisionCount, classification, causalClassification, agreementCertificateDigest: projection.agreementCertificateDigest, replay: "stable", bundleRecovery: "stable", staleEvidence: "rejected", sensitivity, v29: "not_started" }, null, 2));

function digest(kind, value) {
  return digestPlanningJsonV1("evaluation-campaign-artifact-v1", { schemaVersion: 1, kind, value });
}

async function issueSparseCertificate({ epoch, membershipConfigurationDigest, decisionRootDigest }) {
  const validators = [0, 1, 2, 3].map((index) => ({ peerId: `confirmatory-v${index}`, instanceId: `confirmatory-i${index}`, keyId: `confirmatory-k${index}`, eligibilityDigest: digest("eligibility", index), independenceGroupId: `confirmatory-g${index}` }));
  const membership = { schemaVersion: 2, epoch, configurationDigest: membershipConfigurationDigest, selectionSeedDigest: digest("selection", executionId), validators };
  const policy = await createSparseCommitteePolicyV2({ policyId: "confirmatory-semantic-horizon", policyVersion: 1, committeeSize: 4, faultThreshold: 1, reconciliationCommitteeSize: 4, reconciliationFaultThreshold: 1, maximumCommittees: 1, maximumValidatorsPerIndependenceGroup: 1 });
  const proposalDigest = digest("proposal", { executionId, decisionRootDigest });
  const valueDigest = digest("value", { executionId, decisionRootDigest });
  const decisionId = `confirmatory-semantic:${executionId}`;
  const signatures = { algorithm: "confirmatory-test-signatures-v1", verifyShare: async ({ validator, signature }) => signature === `signed:${validator.peerId}`, aggregate: async ({ messageDigest, shares }) => { const signerPeerIds = shares.map((share) => share.signerPeerId).sort(); return { algorithm: "confirmatory-test-signatures-v1", signerPeerIds, signerSetDigest: await sparseAggregateSignerSetDigestV2("confirmatory-test-signatures-v1", signerPeerIds), value: `aggregate:${messageDigest}` }; }, verifyAggregate: async ({ messageDigest, signature }) => signature.value === `aggregate:${messageDigest}` };
  const gateway = new InProcessSparseBftFinalityGatewayV1({ membership, policy, signatures, signers: validators.map((validator) => ({ ...validator, admitProposal: async ({ decisionId: candidateId, proposalDigest: candidateProposal, valueDigest: candidateValue }) => candidateId === decisionId && candidateProposal === proposalDigest && candidateValue === valueDigest, sign: async () => `signed:${validator.peerId}` })) });
  const finalized = await gateway.certify({ decisionClass: "confirmatory_semantic_horizon", decisionId, proposalDigest, valueDigest, commandBindingDigest: digest("command", executionId), evidenceDigests: [decisionRootDigest], logicalTimeMs: 1_000 });
  return { epoch: finalized.certificate.epoch, membershipConfigurationDigest: finalized.certificate.membershipConfigurationDigest, proposalDigest, valueDigest, signerSetDigest: finalized.certificate.reconciliationCertificate.aggregateSignature.signerSetDigest };
}
