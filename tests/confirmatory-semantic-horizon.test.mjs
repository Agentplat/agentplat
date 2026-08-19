import assert from "node:assert/strict";
import test from "node:test";

import {
  createConfirmatorySemanticAgreementCertificateV1,
  projectConfirmatorySemanticHorizonV1,
  replayConfirmatorySemanticHorizonV1,
} from "../packages/mesh-sim/dist/index.js";
import { digestPlanningJsonV1 } from "../packages/collective-planning/dist/index.js";

const digest = (letter) => `sha256:${letter.repeat(64)}`;

function fixture(count = 1_000) {
  const input = {
    executionId: "execution:confirmatory-smoke",
    registrationDigest: digest("a"),
    membershipEpoch: 7,
    membershipConfigurationDigest: digest("b"),
    decisionEvents: Array.from({ length: count }, (_, index) => ({
      schemaVersion: 1,
      projectionOwner: "evaluator",
      decisionId: `decision:${String(index).padStart(4, "0")}`,
      executionId: "execution:confirmatory-smoke",
      registrationDigest: digest("a"),
      traceEventId: `event:${index}`,
      traceDigest: digestPlanningJsonV1("evaluation-campaign-artifact-v1", { schemaVersion: 1, kind: "trace-binding", value: { executionId: "execution:confirmatory-smoke", traceEventId: `event:${index}`, decisionDigest: digest((index % 10).toString(16)) } }),
      membershipEpoch: 7,
      membershipConfigurationDigest: digest("b"),
      assignmentEpoch: index,
      decisionDigest: digest((index % 10).toString(16)),
      disposition: index % 20 === 0 ? "not_useful" : "useful",
      evidenceDigest: digest("d"),
    })),
    agreementCertificate: null,
  };
  const provisional = projectConfirmatorySemanticHorizonV1(input);
  input.agreementCertificate = createConfirmatorySemanticAgreementCertificateV1({
    epoch: 7,
    membershipConfigurationDigest: digest("b"),
    decisionRootDigest: provisional.decisionRootDigest,
    proposalDigest: digest("e"),
    valueDigest: digest("f"),
    signerSetDigest: digest("1"),
  });
  return input;
}

test("confirmatory horizon closes exactly at 1,000 evaluator decisions", () => {
  const input = fixture();
  const projection = projectConfirmatorySemanticHorizonV1(input);
  assert.equal(projection.status, "complete");
  assert.equal(projection.observedDecisionCount, 1_000);
  assert.equal(projection.usefulDecisionCount, 950);
  assert.equal(projection.unsafeDecisionCount, 0);
  assert.equal(replayConfirmatorySemanticHorizonV1(input, projection).projectionDigest, projection.projectionDigest);
});

test("confirmatory horizon rejects 999 decisions", () => {
  const input = fixture(999);
  assert.equal(projectConfirmatorySemanticHorizonV1(input).status, "incomplete");
});

test("confirmatory horizon rejects caller-authored and stale events", () => {
  const input = fixture();
  input.decisionEvents[0].projectionOwner = "runner";
  assert.throws(() => projectConfirmatorySemanticHorizonV1(input), /confirmatory_semantic_decision_binding_invalid/u);
  const stale = fixture();
  stale.decisionEvents[0].membershipEpoch = 6;
  assert.throws(() => projectConfirmatorySemanticHorizonV1(stale), /confirmatory_semantic_decision_binding_invalid/u);
});

test("confirmatory horizon rejects divergent replay", () => {
  const input = fixture();
  const projection = projectConfirmatorySemanticHorizonV1(input);
  input.decisionEvents[0].disposition = "unsafe";
  assert.throws(() => replayConfirmatorySemanticHorizonV1(input, projection), /confirmatory_semantic_horizon_replay_diverged/u);
});
