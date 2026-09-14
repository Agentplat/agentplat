import assert from "node:assert/strict";
import test from "node:test";
import {
  assemble,
  fixture,
  score,
} from "../experiments/context-economics/experiment.mjs";

for (const scenario of ["approved", "revised", "expired"]) {
  test(`context economics preserves original evidence: ${scenario}`, async () => {
    const input = await fixture(25, scenario);
    const before = structuredClone(input.state);
    const baseline = assemble(input, "bounded");
    const full = assemble(input, "full");
    const selected = assemble(input, "selective");
    assert.equal(score(input, baseline.envelope).constraintOmissions, 1);
    assert.equal(score(input, baseline.envelope).reviewStatus, "unknown");
    for (const result of [full, selected]) {
      const metrics = score(input, result.envelope);
      assert.equal(metrics.constraintOmissions, 0);
      assert.equal(metrics.currentArtifactAvailable, true);
      assert.equal(metrics.reviewStatusCorrect, true);
      assert.equal(metrics.privateOrExpiredMemoryExposed, false);
    }
    assert.ok(
      Buffer.byteLength(JSON.stringify(selected.envelope)) <
        Buffer.byteLength(JSON.stringify(baseline.envelope)),
    );
    assert.deepEqual(
      selected.envelope.approvalEvidence,
      baseline.envelope.approvalEvidence,
    );
    assert.deepEqual(input.state, before);
  });
}

test("missing originals, cross-scope references and budget overflow stop selection", async () => {
  const input = await fixture(25, "revised");
  assert.throws(() => assemble(input, "selective", 1), /exceeds budget/);
  const missing = structuredClone(input);
  missing.manifest.messageIds = ["missing"];
  assert.throws(() => assemble(missing, "selective"), /message unavailable/);
  const crossScope = structuredClone(input);
  crossScope.state.messages[0].tenantId = "different-tenant";
  assert.throws(() => assemble(crossScope, "selective"), /message unavailable/);
  const missingVersion = structuredClone(input);
  missingVersion.state.artifacts[0].versions = [];
  assert.throws(
    () => assemble(missingVersion, "selective"),
    /version unavailable/,
  );
});

test("the oracle detects lost constraints and substituted old artifact versions", async () => {
  const input = await fixture(25, "revised");
  const { envelope } = assemble(input, "selective");
  envelope.context.transcript = [];
  envelope.context.artifacts[0].currentVersion = 1;
  envelope.context.artifacts[0].content =
    input.state.artifacts[0].versions[0].content;
  const metrics = score(input, envelope);
  assert.equal(metrics.constraintOmissions, 1);
  assert.equal(metrics.currentArtifactAvailable, false);
  assert.equal(metrics.reviewStatusCorrect, false);
});

test("an incomplete application manifest loses an unmarked constraint", async () => {
  const input = await fixture(25, "approved");
  const incomplete = {
    ...input,
    manifest: { ...input.manifest, messageIds: [] },
  };
  const { envelope } = assemble(incomplete, "selective");
  // Score against the original independent reference, not the reduced manifest.
  assert.equal(score(input, envelope).constraintOmissions, 1);
});
