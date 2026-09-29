import assert from "node:assert/strict";
import { AgentGovernanceServiceV1 } from "@agentplat/rooms";

/** Shared behavior checks against real in-memory and PostgreSQL stores. */
export async function governanceScenarios(store, definitions) {
  for (const tenantId of ["tenant-a", "tenant-b"]) {
    await definitions.createAgent({
      tenantId,
      agentId: "agent",
      name: "Agent",
    });
    const draft = await definitions.createRevision({
      tenantId,
      agentId: "agent",
      version: "1.0.0",
      instructions: "Work",
      runtimeProfile: {},
      interaction: {
        schemaVersion: 1,
        interactionMode: "purpose",
        governanceId: "gov",
      },
    });
    await definitions.publishRevision(tenantId, draft.definition.revisionId, 0);
  }
  const revision = (await definitions.listRevisions("tenant-a", "agent"))[0]
    .definition.revisionId;
  let now = "2026-09-28T12:00:00.000Z";
  const identities = {
    owner: { tenantId: "tenant-a", subjectId: "owner" },
    delegate: { tenantId: "tenant-a", subjectId: "delegate" },
    stranger: { tenantId: "tenant-a", subjectId: "stranger" },
    successor: { tenantId: "tenant-a", subjectId: "successor" },
    other: { tenantId: "tenant-b", subjectId: "owner" },
  };
  const access = {
    authenticate: async (token) => identities[token] ?? null,
    authorize: async (p, r) =>
      r.operation !== "create" ||
      (p.subjectId === "owner" && r.command.ownerId === "owner"),
  };
  const service = () =>
    new AgentGovernanceServiceV1(
      store,
      access,
      definitions,
      () => new Date(now),
    );
  const request = (operationId, expectedRevision, command) => ({
    agentId: "agent",
    operationId,
    expectedRevision,
    command,
  });
  const create = request("create", null, {
    kind: "create",
    governanceId: "gov",
    ownerId: "owner",
    purpose: "Improve retention",
    definitionRevisionId: revision,
  });
  await assert.rejects(
    service().execute({ tenantId: "tenant-a", subjectId: "owner" }, create),
    { code: "FORBIDDEN" },
  );
  await assert.rejects(service().execute("stranger", create), {
    code: "FORBIDDEN",
  });
  const first = await service().execute("owner", create);
  assert.equal(first.status, "suspended");
  assert.equal(first.configuration.interactionMode, "purpose");
  assert.deepEqual(await service().execute("owner", create), first);
  await assert.rejects(
    service().execute("owner", { ...create, tenantId: "tenant-b" }),
    { code: "VALIDATION_ERROR" },
  );
  await assert.rejects(
    service().execute("owner", {
      ...create,
      command: { ...create.command, purpose: "Different" },
    }),
    { code: "CONFLICT" },
  );
  assert.equal(await service().get("other", "agent"), undefined);
  await service().execute("other", create);
  assert.equal((await service().get("other", "agent")).revision, 0);
  await assert.rejects(
    service().execute(
      "stranger",
      request("bad", 0, { kind: "purpose", purpose: "Divert" }),
    ),
    { code: "FORBIDDEN" },
  );
  await service().execute(
    "owner",
    request("delegate", 0, {
      kind: "delegations",
      delegations: [
        {
          subjectId: "delegate",
          operation: "signals",
          expiresAt: "2026-09-29T12:00:00.000Z",
        },
        {
          subjectId: "delegate",
          operation: "missions",
          expiresAt: "2026-09-29T12:00:00.000Z",
        },
      ],
    }),
  );
  await assert.rejects(
    service().execute(
      "delegate",
      request("bad-purpose", 1, { kind: "purpose", purpose: "Divert" }),
    ),
    { code: "FORBIDDEN" },
  );
  await assert.rejects(
    service().execute(
      "delegate",
      request("bad-mode", 1, { kind: "mode", definitionRevisionId: revision }),
    ),
    { code: "FORBIDDEN" },
  );
  await assert.rejects(
    service().execute(
      "delegate",
      request("bad-limits", 1, { kind: "limits", refs: [] }),
    ),
    { code: "FORBIDDEN" },
  );
  const signalRequest = request("signals", 1, {
    kind: "signals",
    refs: ["cac"],
  });
  const signal = await service().execute("delegate", signalRequest);
  assert.equal(signal.authorityEpoch, 2);
  signal.configuration.signalRefs.push("tampered");
  assert.deepEqual(
    (await service().get("owner", "agent")).configuration.signalRefs,
    ["cac"],
  );
  // Distinct service instances compete on the same expected revision.
  const race = await Promise.allSettled(
    ["race-a", "race-b"].map((op) =>
      service().execute(
        "owner",
        request(op, 2, { kind: "purpose", purpose: op }),
      ),
    ),
  );
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    race.find((r) => r.status === "rejected").reason.code,
    "CONFLICT",
  );
  const same = request("same", 3, {
    kind: "references",
    refs: ["cac-reference"],
  });
  const repeats = await Promise.all([
    service().execute("owner", same),
    service().execute("owner", same),
  ]);
  assert.deepEqual(repeats[0], repeats[1]);
  now = "2026-09-30T12:00:00.000Z";
  await assert.rejects(
    service().execute(
      "delegate",
      request("expired", 4, { kind: "signals", refs: [] }),
    ),
    { code: "FORBIDDEN" },
  );
  await service().execute(
    "owner",
    request("offer-expired", 4, {
      kind: "transfer_start",
      targetOwnerId: "successor",
      expiresAt: "2026-10-01T12:00:00.000Z",
    }),
  );
  now = "2026-10-02T12:00:00.000Z";
  await assert.rejects(
    service().execute(
      "successor",
      request("accept-expired", 5, {
        kind: "transfer_accept",
        transferId: "offer-expired",
      }),
    ),
    { code: "FORBIDDEN" },
  );
  assert.equal(
    (await service().get("owner", "agent")).configuration.ownerId,
    "owner",
  );
  await service().execute(
    "owner",
    request("offer", 5, {
      kind: "transfer_start",
      targetOwnerId: "successor",
      expiresAt: "2026-10-03T12:00:00.000Z",
    }),
  );
  await assert.rejects(
    service().execute(
      "stranger",
      request("stolen", 6, { kind: "transfer_accept", transferId: "offer" }),
    ),
    { code: "FORBIDDEN" },
  );
  const transferred = await service().execute(
    "successor",
    request("accept", 6, { kind: "transfer_accept", transferId: "offer" }),
  );
  assert.equal(transferred.configuration.ownerId, "successor");
  assert.deepEqual(transferred.configuration.delegations, []);
  assert.equal(transferred.status, "suspended");
  assert.equal(transferred.authorityEpoch, 7);
  await assert.rejects(
    service().execute(
      "owner",
      request("old-owner", 7, { kind: "purpose", purpose: "Changed" }),
    ),
    { code: "FORBIDDEN" },
  );
  await assert.rejects(
    service().execute(
      "successor",
      request("stale-accept", 6, {
        kind: "transfer_accept",
        transferId: "offer",
      }),
    ),
    { code: "CONFLICT" },
  );
  await assert.rejects(
    service().execute("successor", request("resume", 7, { kind: "resume" })),
    { code: "VALIDATION_ERROR" },
  );
  await assert.rejects(
    service().execute(
      "successor",
      request("self-auth", 7, {
        kind: "delegations",
        delegations: [
          {
            subjectId: "delegate",
            operation: "purpose",
            expiresAt: "2026-10-03T12:00:00.000Z",
          },
        ],
      }),
    ),
    { code: "VALIDATION_ERROR" },
  );
  const history = await service().history("successor", "agent");
  assert.deepEqual(
    history.map((x) => x.result.revision),
    [0, 1, 2, 3, 4, 5, 6, 7],
  );
  assert.equal(history[0].result.configuration.purpose, "Improve retention");
  assert.equal(history.at(-1).actorId, "successor");
  assert.equal((await service().history("other", "agent")).length, 1);
  assert.deepEqual(
    (await service().history("successor", "agent", 5, 1)).map(
      (x) => x.result.revision,
    ),
    [6],
  );
  await assert.rejects(
    definitions.resolvePublishedRevision("tenant-a", revision),
    /qualified purpose mission execution is required/,
  );
  return transferred;
}
