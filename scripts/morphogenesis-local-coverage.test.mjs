import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { localCoverageProfile, requireLocalCoverageEndpoints } from "./lib/morphogenesis-local-coverage.mjs";

test("local coverage removes only elapsed-time waiting and preserves historical profile", async () => {
  const profile = JSON.parse(await readFile(new URL("../config/agent-morphogenesis-beta1-operational-readiness-v1.json", import.meta.url)));
  const original = structuredClone(profile);
  const local = localCoverageProfile(profile);
  assert.equal(local.executionGeometry.soakDurationMs, 0);
  assert.notEqual(local.profileId, profile.profileId);
  assert.deepEqual({ ...local.executionGeometry, soakDurationMs: original.executionGeometry.soakDurationMs }, original.executionGeometry);
  assert.deepEqual(local.serviceLevelObjectives, original.serviceLevelObjectives);
  assert.deepEqual(profile, original);
});

test("local coverage rejects remote service configuration", () => {
  requireLocalCoverageEndpoints({ PGHOST: "127.0.0.1", TEMPORAL_ADDRESS: "127.0.0.1:57234" });
  for (const env of [
    { DATABASE_URL: "postgres://remote.invalid/db" },
    { PGHOST: "remote.invalid" },
    { TEMPORAL_ADDRESS: "remote.invalid:7233" },
    { TEMPORAL_ADDRESS: "localhost@remote.invalid:7233" },
  ]) assert.throws(() => requireLocalCoverageEndpoints(env));
});
