import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const manifest = JSON.parse(await readFile(new URL(
  "../config/agent-morphogenesis-v1-v8-conformance-v1.json", import.meta.url), "utf8"));
assert.equal(manifest.schemaVersion, 1);
assert.deepEqual(manifest.stages, ["v1_lifecycle", "v2_topology", "v3_local_strategy",
  "v4_collective_intelligence", "v5_strategy_synthesis", "v6_agent_genesis",
  "v7_organizational_evolution", "v8_constitutional_continuity"]);
assert.deepEqual(manifest.scenarios.map(({ id }) => id), ["complete",
  "crash-before-stage-effect", "partial-failure", "mesh-partition",
  "constitutional-fork", "postgres-rollback"]);
assert.equal(manifest.claimBoundary, "source_conformance_only");
console.log(`Agent Morphogenesis V1-V8 conformance fixture verified: ${manifest.scenarios.length} scenarios`);
