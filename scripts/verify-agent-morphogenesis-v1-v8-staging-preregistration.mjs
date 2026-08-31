import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const registration = JSON.parse(await readFile(new URL(
  "../config/agent-morphogenesis-v1-v8-staging-preregistration-v1.json",
  import.meta.url), "utf8"));
assert.equal(registration.schemaVersion, 1);
assert.equal(registration.executionPermitted, false);
assert.equal(registration.environment.kind, "controlled_distributed_staging");
assert.equal(registration.environment.minimumIndependentHosts >= 3, true);
assert.equal(registration.environment.productionTrafficPermitted, false);
assert.deepEqual(registration.scenarios, ["nominal-v1-v8", "crash-after-effect",
  "postgres-rollback", "mesh-partition", "constitutional-fork",
  "reverse-compensation", "trust-restriction", "inference-denial"]);
assert.equal(registration.hypotheses.length, 3);
assert.equal(registration.metrics.length, 7);
assert.equal(registration.readinessCriteria.duplicateEffectCount, 0);
assert.equal(registration.readinessCriteria.minimumEvidenceCompletenessBps, 10000);
assert.equal(registration.claimBoundary.sourceConformance, true);
assert.equal(registration.claimBoundary.operationalReadinessClaim, false);
assert.equal(registration.claimBoundary.productionReadinessClaim, false);
assert.equal(registration.claimBoundary.organizationalImprovementClaim, false);
console.log(`Agent Morphogenesis staging preregistration verified: ${registration.scenarios.length} scenarios`);
