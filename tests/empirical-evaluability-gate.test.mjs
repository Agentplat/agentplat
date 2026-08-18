import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEvaluabilityCertificateV1,
  REQUIRED_PUBLICATION_ARTIFACTS_V1,
  verifyEvaluabilityCertificateV1,
} from "../scripts/empirical-evaluability-gate.mjs";

function fixtureInput() {
  const cells = [];
  for (const [peerCount, seeds] of [[50, 10], [100, 10], [250, 10], [500, 30]]) {
    for (const stratum of ["nominal", "benign", "adversarial", "mixed"]) {
      for (let index = 0; index < seeds; index += 1)
        cells.push({ peerCount, stratum });
    }
  }
  return {
    sourceCommit: "a".repeat(40),
    registration: {
      schemaVersion: 1,
      registrationDigest: `sha256:${"a".repeat(64)}`,
      cells,
    },
    plan: {
      schemaVersion: 1,
      planDigest: `sha256:${"b".repeat(64)}`,
      expectedCellCount: 240,
      expectedSlotCount: 960,
      shards: Array.from({ length: 48 }, () => ({ cellIds: ["a", "b", "c", "d", "e"] })),
    },
    descriptor: {
      descriptorDigest: `sha256:${"c".repeat(64)}`,
      capabilities: { evaluatorOwnedMetrics: true, exactReplay: true },
    },
    requiredPublicationArtifacts: REQUIRED_PUBLICATION_ARTIFACTS_V1,
    syntheticRoleDecisionCount: 1_000,
    syntheticUsefulDecisionCount: 700,
    syntheticUnsafeExecutableCount: 0,
    syntheticConvergenceEvidencePresent: true,
    syntheticConvergenceInteractionDelta: 250,
  };
}

test("evaluability gate passes the registered synthetic boundary fixture", () => {
  const input = fixtureInput();
  const certificate = buildEvaluabilityCertificateV1(input);
  assert.equal(certificate.status, "passed");
  assert.equal(
    verifyEvaluabilityCertificateV1(certificate, input).certificateDigest,
    certificate.certificateDigest,
  );
});

test("evaluability gate rejects a tampered certificate", () => {
  const input = fixtureInput();
  const certificate = buildEvaluabilityCertificateV1(input);
  assert.throws(
    () => verifyEvaluabilityCertificateV1({ ...certificate, certificateDigest: `sha256:${"d".repeat(64)}` }, input),
    /evaluability_certificate_digest_invalid/u,
  );
});
