import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const path = new URL("../config/agent-morphogenesis-hardening-v1.json", import.meta.url);
const manifest = JSON.parse(await readFile(path, "utf8"));
assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.manifestId, "agentplat-agent-morphogenesis-hardening-v1");
assert.deepEqual(manifest.sourceCapabilities.map(({ version }) => version),
  [1, 2, 3, 4, 5, 6, 7, 8]);
assert.equal(manifest.sourceCapabilities.every(({ status }) => status === "source_complete"), true);
const required = ["adapter-closure", "end-to-end-vertical", "conformance-fixtures",
  "adversarial-hardening", "observability-runbooks", "documentation-catalogs",
  "release-qualification", "distributed-staging", "empirical-preregistration"];
assert.deepEqual(manifest.workstreams.map(({ id }) => id), required);
assert.equal(manifest.claimBoundary.sourceBehaviorOnly, true);
assert.equal(manifest.claimBoundary.operationalReadiness, false);
assert.equal(manifest.claimBoundary.productionReadiness, false);
assert.equal(manifest.claimBoundary.organizationalImprovement, false);
assert.equal(manifest.frozenCapabilityBaselineV1Modified, false);
console.log(`Agent Morphogenesis hardening manifest verified: ${required.length} workstreams`);
