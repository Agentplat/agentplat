import assert from "node:assert/strict";
import test from "node:test";
import {
  AgentDefinitionRegistry,
  InMemoryAgentDefinitionRegistryStore,
  InMemoryAgentGovernanceStoreV1,
  AgentGovernanceServiceV1,
} from "@agentplat/rooms";
import { governanceScenarios } from "./helpers/agent-governance-scenarios.mjs";

test("governance identity, authority, CAS, replay, history and two-party transfer", async () => {
  await governanceScenarios(
    new InMemoryAgentGovernanceStoreV1(),
    new AgentDefinitionRegistry(new InMemoryAgentDefinitionRegistryStore()),
  );
});
test("unavailable identity/authorization fails closed", async () => {
  for (const access of [
    {
      authenticate: async () => {
        throw Error("unavailable");
      },
    },
    {
      authenticate: async () => ({ tenantId: "t", subjectId: "s" }),
      authorize: async () => {
        throw Error("unavailable");
      },
    },
  ]) {
    const service = new AgentGovernanceServiceV1(
      new InMemoryAgentGovernanceStoreV1(),
      access,
      {},
    );
    await assert.rejects(service.get("credentials", "a"), {
      code: "FORBIDDEN",
    });
  }
});

test("owner configuration preserves limits across modes and invalidates transfer offers on intervening changes", async () => {
  const definitions = new AgentDefinitionRegistry(
    new InMemoryAgentDefinitionRegistryStore(),
  );
  await definitions.createAgent({ tenantId: "t", agentId: "a", name: "Agent" });
  const make = async (version, interaction) => {
    const candidate = await definitions.createRevision({
      tenantId: "t",
      agentId: "a",
      version,
      instructions: "Work",
      runtimeProfile: {},
      ...(interaction ? { interaction } : {}),
    });
    await definitions.publishRevision("t", candidate.definition.revisionId, 0);
    return candidate.definition.revisionId;
  };
  const purpose = await make("1.0.0", {
    schemaVersion: 1,
    interactionMode: "purpose",
    governanceId: "gov",
  });
  const instruction = await make("2.0.0");
  let now = "2026-09-28T12:00:00.000Z";
  const store = new InMemoryAgentGovernanceStoreV1();
  const service = new AgentGovernanceServiceV1(
    store,
    {
      authenticate: async (subjectId) => ({ tenantId: "t", subjectId }),
      authorize: async () => true,
    },
    definitions,
    () => new Date(now),
  );
  const execute = (subject, op, rev, command) =>
    service.execute(subject, {
      agentId: "a",
      operationId: op,
      expectedRevision: rev,
      command,
    });
  await assert.rejects(
    execute("owner", "wrong", null, {
      kind: "create",
      governanceId: "wrong",
      ownerId: "owner",
      purpose: "Retention",
      definitionRevisionId: purpose,
    }),
    { code: "CONFLICT" },
  );
  assert.equal(await store.load("t", "a"), undefined);
  await execute("owner", "create", null, {
    kind: "create",
    governanceId: "gov",
    ownerId: "owner",
    purpose: "Retention",
    definitionRevisionId: purpose,
  });
  await execute("owner", "limits", 0, {
    kind: "limits",
    refs: ["spending-limit"],
  });
  const switched = await execute("owner", "mode", 1, {
    kind: "mode",
    definitionRevisionId: instruction,
  });
  assert.equal(switched.configuration.interactionMode, "instruction");
  assert.equal(switched.status, "suspended");
  assert.deepEqual(switched.configuration.limitRefs, ["spending-limit"]);
  await execute("owner", "offer", 2, {
    kind: "transfer_start",
    targetOwnerId: "next",
    expiresAt: "2026-09-29T12:00:00.000Z",
  });
  await execute("owner", "purpose", 3, {
    kind: "purpose",
    purpose: "Improve retention responsibly",
  });
  await assert.rejects(
    execute("next", "accept", 4, {
      kind: "transfer_accept",
      transferId: "offer",
    }),
    { code: "FORBIDDEN" },
  );
  await execute("owner", "offer-2", 4, {
    kind: "transfer_start",
    targetOwnerId: "next",
    expiresAt: "2026-09-29T12:00:00.000Z",
  });
  assert.equal(
    (
      await execute("owner", "cancel", 5, {
        kind: "transfer_cancel",
        transferId: "offer-2",
      })
    ).pendingTransfer,
    null,
  );
  await execute("owner", "delegations", 6, {
    kind: "delegations",
    delegations: [
      {
        subjectId: "operator",
        operation: "suspend",
        expiresAt: "2026-09-29T12:00:00.000Z",
      },
    ],
  });
  assert.equal(
    (await execute("operator", "suspend", 7, { kind: "suspend" }))
      .authorityEpoch,
    8,
  );
  now = "2026-09-27T12:00:00.000Z";
  await assert.rejects(
    execute("owner", "clock", 8, { kind: "purpose", purpose: "Earlier" }),
    { code: "CONFLICT" },
  );
});
