import assert from "node:assert/strict";

// Preserve the historical time-based profile and its published evidence.
export function localCoverageProfile(profile) {
  return {
    ...profile,
    profileId: `${profile.profileId}-local-coverage`,
    executionGeometry: { ...profile.executionGeometry, soakDurationMs: 0 },
  };
}

export function requireLocalCoverageEndpoints(env) {
  assert.ok(!env.DATABASE_URL, "local coverage requires explicit loopback PG settings");
  assert.ok(["127.0.0.1", "localhost", "::1"].includes(env.PGHOST ?? "127.0.0.1"));
  const temporal = new URL(`http://${env.TEMPORAL_ADDRESS ?? "127.0.0.1:7233"}`);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(temporal.hostname));
  assert.equal(temporal.username, "");
  assert.equal(temporal.password, "");
}
