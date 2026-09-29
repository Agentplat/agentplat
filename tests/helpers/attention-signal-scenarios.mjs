import assert from "node:assert/strict";
import {
  AgentGovernanceServiceV1,
  AttentionSignalServiceV1,
} from "@agentplat/rooms";

export async function attentionSignalScenarios({
  store,
  governance,
  definitions,
}) {
  const base = Date.parse("2026-09-28T12:00:00.000Z");
  let elapsed = 0;
  const now = () => new Date(base + elapsed),
    at = (ms) => new Date(base + ms).toISOString();
  await definitions.createAgent({
    tenantId: "t",
    agentId: "agent",
    name: "Agent",
  });
  const def = await definitions.createRevision({
    tenantId: "t",
    agentId: "agent",
    version: "1.0.0",
    instructions: "Evaluate attention signals",
    runtimeProfile: {},
    interaction: {
      schemaVersion: 1,
      interactionMode: "purpose",
      governanceId: "gov",
    },
  });
  await definitions.publishRevision("t", def.definition.revisionId, 0);
  const government = new AgentGovernanceServiceV1(
    governance,
    {
      authenticate: async (token) =>
        token === "owner" ? { tenantId: "t", subjectId: "owner" } : null,
      authorize: async () => true,
    },
    definitions,
    now,
  );
  await government.execute("owner", {
    agentId: "agent",
    operationId: "enroll",
    expectedRevision: null,
    command: {
      kind: "create",
      governanceId: "gov",
      ownerId: "owner",
      purpose: "Improve LTV",
      definitionRevisionId: def.definition.revisionId,
    },
  });
  const access = {
    authenticate: async (token) =>
      ["owner", "collector", "worker", "intruder", "other"].includes(token)
        ? { tenantId: token === "other" ? "other" : "t", subjectId: token }
        : null,
    authorize: async (p, r) =>
      r.operation === "observe"
        ? p.subjectId === "collector"
        : r.operation === "work"
          ? p.subjectId === "worker"
          : true,
  };
  const service = () =>
    new AttentionSignalServiceV1(store, governance, access, now);
  const shape = {
    signalId: "cac",
    kind: "quantitative",
    description: "Customer acquisition cost",
    sourceIds: ["analytics", "finance"],
    freshnessMs: 1000,
    cadenceMs: 100,
    evaluationWindowMs: 1000,
    maximumEvaluationsPerWindow: 2,
    maximumObservations: 16,
    maximumWakeups: 16,
  };
  await assert.rejects(
    service().define("intruder", {
      agentId: "agent",
      expectedGovernanceRevision: 0,
      definition: shape,
    }),
    { code: "FORBIDDEN" },
  );
  await assert.rejects(
    service().define("invalid", {
      agentId: "agent",
      expectedGovernanceRevision: 0,
      definition: shape,
    }),
    { code: "FORBIDDEN" },
  );
  const signal = await service().define("owner", {
    agentId: "agent",
    expectedGovernanceRevision: 0,
    definition: shape,
  });
  assert.deepEqual(
    await service().define("owner", {
      agentId: "agent",
      expectedGovernanceRevision: 0,
      definition: shape,
    }),
    signal,
  );
  const scope = { agentId: "agent", definitionId: signal.recordId };
  const observation = (
    eventId,
    observedAt,
    value = 15,
    sourceId = "analytics",
  ) => ({
    ...scope,
    eventId,
    observedAt: at(observedAt),
    sourceId,
    value,
    availability: "observed",
    evidenceRefs: ["report:1"],
  });
  await assert.rejects(
    service().observe("collector", observation("inactive", 0)),
    { code: "CONFLICT" },
  );
  const reference = await service().reference("owner", {
    agentId: "agent",
    expectedGovernanceRevision: 0,
    reference: {
      definitionId: signal.recordId,
      interpretation: { kind: "quantitative", minimum: 1, maximum: 5 },
    },
  });
  assert.deepEqual(
    await service().catalog("owner", {
      agentId: "agent",
      recordId: reference.recordId,
    }),
    reference,
  );
  let govRevision = 0,
    operation = 0;
  const govern = async (command) => {
    const h = await government.execute("owner", {
      agentId: "agent",
      operationId: `config-${++operation}`,
      expectedRevision: govRevision,
      command,
    });
    govRevision = h.revision;
    return h;
  };
  await govern({ kind: "signals", refs: [signal.recordId] });
  await govern({ kind: "references", refs: [reference.recordId] });
  await assert.rejects(
    service().reference("owner", {
      agentId: "agent",
      expectedGovernanceRevision: 0,
      reference: reference.content,
    }),
    { code: "CONFLICT" },
  );
  const duplicates = await Promise.all([
    service().observe("collector", observation("first", 0)),
    service().observe("collector", observation("first", 0)),
  ]);
  assert.deepEqual(duplicates[0], duplicates[1]);
  const first = duplicates[0];
  assert.equal(first.governance.revision, 2);
  assert.equal(first.staleOnArrival, false);
  assert.deepEqual(
    await service().observe("collector", observation("first", 0)),
    first,
  );
  await assert.rejects(
    service().observe("collector", observation("first", 0, 99)),
    { code: "CONFLICT" },
  );
  await assert.rejects(
    service().observe("collector", observation("future", 1)),
    { code: "VALIDATION_ERROR" },
  );
  await assert.rejects(
    service().observe(
      "collector",
      observation("fake-source", 0, 15, "unknown"),
    ),
    { code: "FORBIDDEN" },
  );
  await assert.rejects(service().get("other", scope), { code: "NOT_FOUND" });
  assert.equal(
    (await service().get("owner", scope)).state.deliveries.length,
    0,
  );
  const initial = await service().tick("worker", scope);
  assert.equal(initial.executionAuthorized, false);
  assert.equal(
    initial.coverage.find((x) => x.sourceId === "finance").status,
    "missing",
  );
  assert.deepEqual(initial.referenceIds, [reference.recordId]);
  assert.equal(await service().tick("worker", scope), null);
  elapsed = 50;
  await service().observe(
    "collector",
    observation("second", 50, 17, "finance"),
  );
  await service().observe("collector", observation("third", 50, 18));
  assert.equal(await service().tick("worker", scope), null);
  elapsed = 100;
  const coalesced = await service().tick("worker", scope);
  assert.equal(coalesced.contradictory, true);
  assert.equal(coalesced.observationIds.length, 2);
  elapsed = 200;
  await service().observe("collector", observation("fourth", 200, 19));
  assert.equal(await service().tick("worker", scope), null);
  assert.equal(
    (await service().get("owner", scope)).state.pendingObservationIds.length,
    1,
  );
  elapsed = 1301;
  const older = await service().observe("collector", observation("old", 0, 14));
  assert.equal(older.outOfOrder, true);
  assert.equal(older.staleOnArrival, true);
  const stale = await service().tick("worker", scope);
  assert.ok(stale.coverage.every((x) => x.status === "stale"));
  assert.equal(
    stale.coverage.find((x) => x.sourceId === "analytics").observationId,
    (await service().get("owner", scope)).state.observations.find(
      (x) => x.eventId === "fourth",
    ).observationId,
  );
  elapsed = 1402;
  await service().observe("collector", {
    ...observation("offline", 1402, null, "finance"),
    availability: "unavailable",
  });
  const unavailable = await service().tick("worker", scope);
  assert.equal(
    unavailable.coverage.find((x) => x.sourceId === "finance").status,
    "unavailable",
  );
  const lease = await service().claim("worker", {
    ...scope,
    claimToken: "worker-1",
    leaseMs: 10,
  });
  assert.deepEqual(
    await service().claim("worker", {
      ...scope,
      claimToken: "worker-1",
      leaseMs: 10,
    }),
    lease,
  );
  elapsed += 11;
  const takeover = await service().claim("worker", {
    ...scope,
    claimToken: "worker-2",
    leaseMs: 10,
  });
  assert.equal(takeover.wakeup.wakeupId, lease.wakeup.wakeupId);
  assert.equal(takeover.generation, lease.generation + 1);
  await assert.rejects(
    service().complete("worker", {
      ...scope,
      wakeupId: lease.wakeup.wakeupId,
      claimToken: lease.claimToken,
      generation: lease.generation,
    }),
    { code: "CONFLICT" },
  );
  const settlement = {
    ...scope,
    wakeupId: takeover.wakeup.wakeupId,
    claimToken: takeover.claimToken,
    generation: takeover.generation,
  };
  await service().complete("worker", settlement);
  await service().complete("worker", settlement);
  const accepted = new Map();
  let fail = true;
  const sink = {
    notify: async (wake) => {
      const previous = accepted.get(wake.wakeupId);
      if (previous) assert.deepEqual(previous, wake);
      else accepted.set(wake.wakeupId, wake);
      if (fail) {
        fail = false;
        throw Error("crash after durable acceptance");
      }
    },
  };
  await assert.rejects(
    service().deliverOne(
      "worker",
      { ...scope, claimToken: "before-crash", leaseMs: 10 },
      sink,
    ),
    /crash/,
  );
  elapsed += 11;
  await service().deliverOne(
    "worker",
    { ...scope, claimToken: "after-crash", leaseMs: 10 },
    sink,
  );
  assert.equal(accepted.size, 1);
  // New catalog revisions stay inert until selected by the existing governance commands.
  const qualitative = await service().define("owner", {
    agentId: "agent",
    expectedGovernanceRevision: govRevision,
    definition: {
      ...shape,
      signalId: "market-stability",
      kind: "qualitative",
      sourceIds: ["market"],
      maximumObservations: 1,
      maximumWakeups: 1,
    },
  });
  const qualitativeRef = await service().reference("owner", {
    agentId: "agent",
    expectedGovernanceRevision: govRevision,
    reference: {
      definitionId: qualitative.recordId,
      interpretation: {
        kind: "qualitative",
        criterion: "Stable institutions and predictable access to credit",
      },
    },
  });
  const event = await service().define("owner", {
    agentId: "agent",
    expectedGovernanceRevision: govRevision,
    definition: {
      ...shape,
      signalId: "market-event",
      kind: "event",
      sourceIds: ["news"],
    },
  });
  await govern({
    kind: "signals",
    refs: [signal.recordId, qualitative.recordId, event.recordId],
  });
  await govern({
    kind: "references",
    refs: [reference.recordId, qualitativeRef.recordId],
  });
  await assert.rejects(service().complete("worker", settlement), {
    code: "CONFLICT",
  });
  const qualitativeScope = {
    agentId: "agent",
    definitionId: qualitative.recordId,
  };
  const missing = await service().tick("worker", qualitativeScope);
  assert.equal(missing.coverage[0].status, "missing");
  const qualitativeInput = {
    ...qualitativeScope,
    sourceId: "market",
    eventId: "stable",
    observedAt: at(elapsed),
    availability: "observed",
    value: "Credit access is deteriorating",
    evidenceRefs: ["report:market"],
  };
  await service().observe("collector", qualitativeInput);
  await assert.rejects(
    service().observe("collector", { ...qualitativeInput, eventId: "extra" }),
    /capacity exhausted/,
  );
  elapsed += 100;
  await assert.rejects(
    service().tick("worker", qualitativeScope),
    /capacity exhausted/,
  );
  assert.equal(
    (await service().get("owner", qualitativeScope)).state.pendingObservationIds
      .length,
    1,
  );
  await service().observe("collector", {
    agentId: "agent",
    definitionId: event.recordId,
    sourceId: "news",
    eventId: "e1",
    observedAt: at(elapsed),
    availability: "observed",
    value: "Unexpected market closure",
    evidenceRefs: [],
  });
  assert.equal(
    (
      await service().tick("worker", {
        agentId: "agent",
        definitionId: event.recordId,
      })
    ).executionAuthorized,
    false,
  );
  // A configuration write between ingestion read and commit must fence the write.
  const racingStore = {
    catalog: store.catalog.bind(store),
    put: store.put.bind(store),
    load: store.load.bind(store),
    commit: async (s, expected, b) => {
      await govern({
        kind: "purpose",
        purpose: "Improve LTV with updated constraints",
      });
      return store.commit(s, expected, b);
    },
  };
  const racingService = new AttentionSignalServiceV1(
    racingStore,
    governance,
    access,
    now,
  );
  await assert.rejects(
    racingService.observe("collector", observation("fenced", elapsed, 20)),
    { code: "CONFLICT" },
  );
  assert.ok(
    !(await service().get("owner", scope)).state.observations.some(
      (x) => x.eventId === "fenced",
    ),
  );
  assert.equal((await governance.load("t", "agent")).status, "suspended");
  await assert.rejects(
    definitions.resolvePublishedRevision("t", def.definition.revisionId),
    /qualified purpose mission execution is required/,
  );
  return {
    state: (await service().get("owner", scope)).state,
    signal,
    reference,
    initial,
    service,
    scope,
    access,
    clock: now,
    advance: (milliseconds) => { elapsed += milliseconds; },
  };
}
