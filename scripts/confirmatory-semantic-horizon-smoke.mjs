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

const executionId = "confirmatory-semantic-horizon-smoke-v1";
const registrationDigest = digest("registration", { executionId, owner: "evaluator" });
const membershipConfigurationDigest = digest("membership", { epoch: 1, validators: ["v0", "v1", "v2", "v3"] });
const engine = new SequentialSemanticGuaranteeEngineV1(CONFIRMATORY_SEMANTIC_DECISION_COUNT_V1, 9_500);
const decisionEvents = [];
for (let sequence = 1; sequence <= CONFIRMATORY_SEMANTIC_DECISION_COUNT_V1; sequence += 1) {
  const metrics = {
    roleCoherenceBps: 8_000 + (sequence % 500),
    missionAlignmentBps: 8_500 + (sequence % 300),
    contextConflictBps: 500 + (sequence % 100),
    uncertaintyBps: 1_000 + (sequence % 200),
    courseActionDiversityBps: 7_000 + (sequence % 400),
    courseActionNoveltyBps: 6_000 + (sequence % 350),
  };
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
}
const sortedDecisionDigests = decisionEvents.slice().sort((a, b) => a.decisionId.localeCompare(b.decisionId)).map((event) => event.decisionDigest);
const decisionRootDigest = digest("decision-root", { executionId, decisionDigests: sortedDecisionDigests });
const certificate = createConfirmatorySemanticAgreementCertificateV1({
  epoch: 1,
  membershipConfigurationDigest,
  decisionRootDigest,
  proposalDigest: digest("proposal", { executionId, decisionRootDigest }),
  valueDigest: digest("value", { executionId, decisionRootDigest }),
  signerSetDigest: digest("signer-set", { validators: ["v0", "v1", "v2", "v3"] }),
});
const input = { executionId, registrationDigest, membershipEpoch: 1, membershipConfigurationDigest, decisionEvents, agreementCertificate: certificate };
const projection = projectConfirmatorySemanticHorizonV1(input);
if (projection.status !== "complete" || projection.observedDecisionCount !== 1_000) throw new Error("confirmatory_horizon_smoke_incomplete");
replayConfirmatorySemanticHorizonV1(input, projection);
let staleRejected = false;
try { projectConfirmatorySemanticHorizonV1({ ...input, decisionEvents: decisionEvents.map((event, index) => index === 999 ? { ...event, traceEventId: "stale:trace" } : event) }); } catch { staleRejected = true; }
if (!staleRejected) throw new Error("stale_evidence_was_accepted");
console.log(JSON.stringify({ executionId, status: projection.status, observedDecisionCount: projection.observedDecisionCount, usefulDecisionCount: projection.usefulDecisionCount, agreementCertificateDigest: projection.agreementCertificateDigest, replay: "stable", staleEvidence: "rejected", v29: "not_started" }, null, 2));

function digest(kind, value) {
  return digestPlanningJsonV1("evaluation-campaign-artifact-v1", { schemaVersion: 1, kind, value });
}
