import test from "node:test";
import assert from "node:assert/strict";
import { AgentRegistry, InMemoryAgentRegistryStore } from "../dist/index.js";
export const draft = {
  tenantId: "tenant",
  entryId: "research",
  ownerId: "owner",
  name: "Research",
  capabilities: ["research"],
  inputMediaTypes: ["text/plain"],
  outputMediaTypes: ["text/plain"],
  controls: [],
  execution: {
    kind: "local",
    agentId: "agent",
    revisionId: "revision",
    digest: "digest",
  },
  provenance: { sourceId: "source", sourceRevision: "1" },
  availability: "available",
  verification: "verified",
  admission: "approved",
  validUntil: "2030-01-01T00:00:00Z",
};
const principal = { tenantId: "tenant", subjectId: "owner" };
test("registry separates discovery, eligibility, isolation and authority", async () => {
  const registry = new AgentRegistry(
    new InMemoryAgentRegistryStore(),
    { authorize: async (p) => p.subjectId === "owner" },
    () => Date.parse("2026-09-07"),
  );
  const entry = await registry.publish(principal, draft);
  assert.equal(entry.revision, 1);
  assert.equal(
    await registry.get({ ...principal, tenantId: "other" }, draft.entryId),
    undefined,
  );
  await assert.rejects(
    registry.publish({ ...principal, tenantId: "other" }, draft),
    { code: "forbidden" },
  );
  await assert.rejects(
    registry.search(
      { ...principal, subjectId: "unknown" },
      { capabilities: [] },
    ),
    { code: "forbidden" },
  );
  let search = await registry.search(principal, { capabilities: ["research"] });
  assert.equal(search.candidates[0].eligible, true);
  assert.equal(search.candidates[0].grantsAuthority, false);
  search = await registry.search(principal, {
    capabilities: ["code"],
    controls: ["restore"],
  });
  assert.deepEqual(search.candidates[0].reasons, [
    "missing_capability:code",
    "missing_control:restore",
  ]);
  const results = await Promise.allSettled([
    registry.publish(principal, { ...draft, availability: "unknown" }, 1),
    registry.withdraw(principal, draft.entryId, 1),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  await assert.rejects(
    registry.resolve(principal, draft.entryId, 1, { capabilities: [] }),
    { code: "conflict" },
  );
});
test("pagination, immutable copies, expiry, unverified claims and controls", async () => {
  const registry = new AgentRegistry(
    new InMemoryAgentRegistryStore(),
    { authorize: async () => true },
    () => Date.parse("2031-01-01"),
  );
  await registry.publish(principal, { ...draft, entryId: "a" });
  await registry.publish(principal, {
    ...draft,
    entryId: "b",
    verification: "unverified",
    admission: "pending",
  });
  const first = await registry.search(principal, {
    capabilities: [],
    limit: 1,
  });
  assert.equal(first.nextCursor, "a");
  first.candidates[0].entry.name = "mutated";
  assert.equal((await registry.get(principal, "a")).name, "Research");
  assert.ok(first.candidates[0].reasons.includes("expired"));
  const next = await registry.search(principal, {
    capabilities: [],
    after: first.nextCursor,
  });
  assert.equal(next.candidates[0].entry.entryId, "b");
  assert.ok(next.candidates[0].reasons.includes("verification:unverified"));
  await assert.rejects(
    registry.publish(principal, {
      ...draft,
      execution: {
        kind: "a2a",
        endpoint: "http://localhost",
        cardUrl: "https://test/card",
        cardDigest: "hash",
        protocolVersion: "1.0",
      },
    }),
  );
  await assert.rejects(
    registry.publish(principal, {
      ...draft,
      controls: ["restore"],
      execution: {
        kind: "a2a",
        endpoint: "https://test/rpc",
        cardUrl: "https://test/card",
        cardDigest: "hash",
        protocolVersion: "1.0",
      },
    }),
  );
});
