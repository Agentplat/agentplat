import assert from "node:assert/strict";
import test from "node:test";

import {
  CollectivePeerHostRuntimeV1,
  InMemoryCollectivePeerHostClaimPortV1,
  createFixedCollectivePeerHostTopologyPortV1,
} from "@agentplat/collective-runtime/host";
import { createTeamFormationScopeV1 } from "@agentplat/collective-runtime/team-formation";
import {
  createTeamStructureAdaptationDecisionV1,
  createTeamStructureTemplateCatalogV1,
  createTeamStructureTemplatePositionV1,
  createTeamStructureTemplateV1,
} from "@agentplat/collective-runtime/team-structure-adaptation";

const sha = (character = "a") => `sha256:${character.repeat(64)}`;

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function envelope(messageId, type = "work.offer", criticalExtensions) {
  return {
    protocol: "agentplat.mesh",
    wireVersion: 1,
    messageId,
    tenantId: "tenant-a",
    meshId: "mesh-a",
    type,
    sender: { peerId: "peer-a", instanceId: "peer-a-1" },
    audience: { kind: "mesh", topic: "work" },
    sequence: 1,
    sentAt: "2026-08-07T11:59:00.000Z",
    expiresAt: "2026-08-07T12:01:00.000Z",
    payloadHash: sha(),
    payload: { type },
    proof: { algorithm: "Ed25519", keyId: "key-a", value: "signature-a" },
    ...(criticalExtensions ? { criticalExtensions } : {}),
  };
}

function route(routeId, kind, criticalExtension = null, dispatchGate) {
  const admitted = new Set();
  let admissionCalls = 0;
  let pending = 0;
  let dispatches = 0;
  let active = 0;
  let maximumActive = 0;
  return {
    route: { routeId, kind, criticalExtension },
    get admissionCalls() {
      return admissionCalls;
    },
    get dispatches() {
      return dispatches;
    },
    get maximumActive() {
      return maximumActive;
    },
    seed(count = 1) {
      pending += count;
    },
    async admit(input) {
      admissionCalls += 1;
      if (admitted.has(input.envelope.messageId))
        return { status: "duplicate", durable: true, reasonCode: null };
      admitted.add(input.envelope.messageId);
      pending += 1;
      return { status: "accepted", durable: true, reasonCode: null };
    },
    async dispatch() {
      if (pending === 0) return { status: "idle", reasonCode: null };
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      try {
        if (dispatchGate) await dispatchGate.promise;
        pending -= 1;
        dispatches += 1;
        return { status: "dispatched", reasonCode: null };
      } finally {
        active -= 1;
      }
    },
    pending: () => pending,
  };
}

function host({ routes, claims, freshness = "fresh", limits, ...ports } = {}) {
  return new CollectivePeerHostRuntimeV1({
    hostId: "host-a",
    routes: routes ?? [route("node", "node")],
    claims: claims ?? new InMemoryCollectivePeerHostClaimPortV1(),
    topology: createFixedCollectivePeerHostTopologyPortV1(freshness),
    clock: { now: () => "2026-08-07T12:00:00.000Z" },
    limits,
    ...ports,
  });
}

test("peer host claims before admission and acknowledges only after durable completion", async () => {
  const underlying = new InMemoryCollectivePeerHostClaimPortV1();
  const completionGate = deferred();
  let completed = false;
  const claims = {
    claim: (input) => underlying.claim(input),
    async complete(input) {
      await completionGate.promise;
      const result = await underlying.complete(input);
      completed = true;
      return result;
    },
  };
  const node = route("node", "node");
  const runtime = host({ routes: [node], claims });
  let settled = false;
  const receiving = runtime
    .receive({ envelope: envelope("message-1") })
    .then((outcome) => {
      settled = true;
      return outcome;
    });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(settled, false);
  assert.equal(completed, false);
  completionGate.resolve();
  assert.equal((await receiving).status, "acknowledged");
  assert.equal(completed, true);
  assert.equal(
    (await runtime.receive({ envelope: envelope("message-1") })).duplicate,
    true,
  );
  assert.equal(node.admissionCalls, 1);
  const equivocation = await runtime.receive({
    envelope: { ...envelope("message-1"), payloadHash: sha("b") },
  });
  assert.equal(equivocation.status, "rejected");
  assert.match(equivocation.reasonCode, /identity conflicts/u);
  assert.equal(node.admissionCalls, 1);
});

test("same-route claimed retry completes idempotently and a conflicting route fails closed", async () => {
  const claims = new InMemoryCollectivePeerHostClaimPortV1();
  const failingNode = route("node-a", "node");
  let fail = true;
  const originalAdmit = failingNode.admit;
  failingNode.admit = async (input) => {
    if (fail) {
      fail = false;
      throw new Error("temporary_admission_failure");
    }
    return originalAdmit(input);
  };
  const firstHost = host({ routes: [failingNode], claims });
  assert.equal(
    (await firstHost.receive({ envelope: envelope("retry-message") })).status,
    "rejected",
  );
  assert.equal(
    (await firstHost.receive({ envelope: envelope("retry-message") })).status,
    "acknowledged",
  );

  const otherHost = host({ routes: [route("node-b", "node")], claims });
  assert.deepEqual(
    await otherHost.receive({ envelope: envelope("retry-message") }),
    { status: "rejected", reasonCode: "claim_route_conflict" },
  );
});

test("concurrent same-route receivers share the claim and complete through route idempotence", async () => {
  const claims = new InMemoryCollectivePeerHostClaimPortV1();
  const node = route("node", "node");
  const runtime = host({ routes: [node], claims });
  const [first, second] = await Promise.all([
    runtime.receive({ envelope: envelope("racing-message") }),
    runtime.receive({ envelope: envelope("racing-message") }),
  ]);

  assert.equal(first.status, "acknowledged");
  assert.equal(second.status, "acknowledged");
  assert.equal([first.duplicate, second.duplicate].filter(Boolean).length, 1);
  assert.equal(node.admissionCalls, 2);
});

test("concurrent runOnce respects the global limit and never selects one route twice", async () => {
  const gate = deferred();
  const node = route("node", "node", null, gate);
  const exchange = route(
    "exchange",
    "exchange",
    "agentplat.execution.exchange.v1",
    gate,
  );
  node.seed();
  exchange.seed();
  const runtime = host({
    routes: [node, exchange],
    limits: { maximumConcurrentDispatches: 2 },
  });

  const first = runtime.runOnce();
  const second = runtime.runOnce();
  await new Promise((resolve) => setImmediate(resolve));
  const status = await runtime.status();
  assert.equal(status.activeDispatches, 2);
  assert.equal((await runtime.runOnce()).paused, true);
  assert.equal(node.maximumActive, 1);
  assert.equal(exchange.maximumActive, 1);
  gate.resolve();
  await Promise.all([first, second]);
});

test("start drives an abortable worker loop and drain never revives stopped", async () => {
  const node = route("node", "node");
  node.seed();
  const controller = new AbortController();
  const originalDispatch = node.dispatch;
  node.dispatch = async () => {
    const result = await originalDispatch();
    controller.abort();
    return result;
  };
  const runtime = host({ routes: [node] });
  await runtime.start({ signal: controller.signal, idleDelayMs: 1 });
  assert.equal(node.dispatches, 1);
  assert.equal((await runtime.status()).lifecycle, "stopped");
  assert.equal((await runtime.drain()).paused, true);
  assert.equal((await runtime.status()).lifecycle, "stopped");
});

test("routing configuration and critical extension handling are unambiguous", async () => {
  assert.throws(() =>
    host({ routes: [route("bad-node", "node", "critical.v1")] }),
  );
  assert.throws(() =>
    host({ routes: [route("bad-exchange", "exchange", null)] }),
  );
  assert.throws(() =>
    host({
      routes: [
        route("exchange-a", "exchange", "same.v1"),
        route("exchange-b", "exchange", "same.v1"),
      ],
    }),
  );
  assert.throws(
    () =>
      host({
        structure: {
          adaptation: {
            catalogDigest: sha("a"),
            observe: async () => ({}),
            recommend: async () => ({}),
          },
          catalog: { catalogDigest: sha("b"), templates: [] },
        },
      }),
    /catalog binding/u,
  );

  const runtime = host({
    routes: [route("node", "node"), route("exchange", "exchange", "known.v1")],
  });
  assert.equal(
    (
      await runtime.receive({
        envelope: envelope("unknown-message", "work.progress", ["unknown.v1"]),
      })
    ).status,
    "rejected",
  );
  assert.equal(
    (
      await runtime.receive({
        envelope: envelope("ambiguous-message", "work.progress", [
          "known.v1",
          "known.v1",
        ]),
      })
    ).status,
    "rejected",
  );
});

test("concrete continuity and adaptation ports are invoked and their failures propagate", async () => {
  const checkpointRequest = { checkpointId: "checkpoint-a" };
  const takeoverRequest = { checkpointDigest: "sha256:a" };
  const observation = { observationId: "observation-a" };
  const selection = { requestId: "selection-a" };
  const calls = [];
  const runtime = host({
    continuity: {
      checkpoint: async (input) => {
        calls.push(["checkpoint", input]);
        return { checkpointId: "done" };
      },
      takeover: async (input) => {
        calls.push(["takeover", input]);
        return { pendingDispatches: [] };
      },
      start: async () => ({ status: "started" }),
      runStep: async () => ({ status: "ran" }),
    },
    structure: {
      adaptation: {
        catalogDigest: sha(),
        observe: async (input) => {
          calls.push(["observe", input]);
          return { revision: 1 };
        },
        recommend: async (input) => {
          calls.push(["select", input]);
          return { selectedTemplateId: "template-a" };
        },
      },
      catalog: { catalogDigest: sha(), templates: [] },
    },
  });

  await runtime.checkpoint(checkpointRequest);
  await runtime.recover(takeoverRequest);
  await runtime.observe(observation);
  await runtime.select(selection);
  assert.deepEqual(calls, [
    ["checkpoint", checkpointRequest],
    ["takeover", takeoverRequest],
    ["observe", observation],
    ["select", selection],
  ]);

  const failing = host({
    structure: {
      adaptation: {
        catalogDigest: sha(),
        observe: async () => {
          throw new Error("observation_failed");
        },
        recommend: async () => {
          throw new Error("selection_failed");
        },
      },
      catalog: { catalogDigest: sha(), templates: [] },
    },
  });
  await assert.rejects(failing.observe(observation), /observation_failed/);
  await assert.rejects(failing.select(selection), /selection_failed/);
});

test("decision, admitted allocation, and control ports remain explicit host facade calls", async () => {
  const calls = [];
  const decisionInput = {
    decisionId: "decision-a",
    candidate: { candidateId: "candidate-a" },
    logicalTimeMs: 10,
  };
  const admittedAllocation = {
    event: {
      kind: "clear",
      clearingPeerId: "peer-a",
      clearingInstanceId: "peer-a-1",
      clearingIndependenceGroupId: "group-a",
      logicalTimeMs: 11,
    },
    admission: { admissionId: "admission-a" },
  };
  const evidence = [{ evidenceId: "evidence-a" }];
  const runtime = host({
    decisions: {
      prepare: (input) => input,
      certify: async () => ({}),
      verify: async () => ({}),
      commit: async () => ({}),
      decide: async (input) => {
        calls.push(["decide", input]);
        return { decisionId: input.decisionId };
      },
    },
    allocation: {
      allocationId: "allocation-a",
      allocationVersion: 1,
      implementationId: "allocation.default",
      policyDigest: sha("d"),
      submit: async (input) => {
        calls.push(["allocate", input]);
        return { revision: 1 };
      },
      loadState: async () => ({ revision: 1 }),
    },
    coordinationControl: {
      evaluate: async (input) => {
        calls.push(["control", input]);
        return { proposalId: "proposal-a" };
      },
      dispatchPending: async (logicalTimeMs) => {
        calls.push(["dispatch-control", logicalTimeMs]);
        return { proposalId: "proposal-a" };
      },
    },
  });

  assert.deepEqual(await runtime.decide(decisionInput), {
    decisionId: "decision-a",
  });
  assert.deepEqual(await runtime.allocate(admittedAllocation), { revision: 1 });
  assert.deepEqual(await runtime.loadAllocationState(), { revision: 1 });
  assert.deepEqual(
    await runtime.evaluateControl({ logicalTimeMs: 12, evidence }),
    { proposalId: "proposal-a" },
  );
  assert.deepEqual(await runtime.dispatchControl(13), {
    proposalId: "proposal-a",
  });
  assert.deepEqual(calls, [
    ["decide", decisionInput],
    ["allocate", admittedAllocation],
    ["control", { logicalTimeMs: 12, evidence }],
    ["dispatch-control", 13],
  ]);
});

test("typed structure selection materializes an approved template into real formation", async () => {
  const template = createTeamStructureTemplateV1({
    schemaVersion: 1,
    templateId: "template-approved",
    templateVersion: 1,
    positions: [
      createTeamStructureTemplatePositionV1({
        schemaVersion: 1,
        templatePositionId: "template-position",
        roleKey: "research",
        requiredCapabilityKeys: ["research"],
        completionCriteria: ["research-complete"],
        dependsOnTemplatePositionIds: [],
        budgetUnits: 10,
        maximumActionBudgetUnits: 5,
      }),
    ],
  });
  const catalog = createTeamStructureTemplateCatalogV1({
    schemaVersion: 1,
    catalogId: "catalog-a",
    catalogVersion: 1,
    parentCatalogDigest: null,
    baselineTemplateId: template.templateId,
    templates: [template],
  });
  const decision = createTeamStructureAdaptationDecisionV1({
    schemaVersion: 1,
    decisionId: "decision-a",
    requestId: "selection-a",
    requestDigest: sha(),
    selectedTemplateId: template.templateId,
    selectedTemplateDigest: template.templateDigest,
    selectionMode: "baseline_floor",
    adaptationEpoch: 1,
    advisoryOnly: true,
    evaluatedAtLogicalMs: 10,
    expiresAtLogicalMs: 100,
    priorStateRevision: 0,
    committedStateRevision: 1,
  });
  let formationRequest;
  let currentFormationTeam = null;
  const runtime = host({
    formation: {
      form: async (request) => {
        formationRequest = request;
        return { status: "formed" };
      },
      activate: async () => ({ status: "active" }),
      loadState: async () => ({ team: currentFormationTeam }),
    },
    structure: {
      adaptation: {
        catalogDigest: catalog.catalogDigest,
        observe: async () => ({ revision: 1 }),
        recommend: async () => decision,
      },
      catalog,
    },
  });
  const selected = await runtime.select({ requestId: "selection-a" });
  const materialization = runtime.materialize({
    templateId: selected.selectedTemplateId,
    bindings: [
      {
        templatePositionId: "template-position",
        positionId: "position-a",
        workItemId: "work-a",
        workItemRevision: 1,
      },
    ],
  });
  const formationInput = {
    decision: selected,
    materialization,
    requestId: "formation-a",
    scope: createTeamFormationScopeV1({
      tenantId: "tenant-a",
      meshId: "mesh-a",
      policyDomainId: "policy-a",
      missionIntentId: "mission-a",
      objectiveId: "objective-a",
      rootWorkItemId: "work-a",
      rootWorkItemRevision: 1,
    }),
    targetTeamEpoch: 1,
    membershipEpoch: 1,
    membershipConfigurationDigest: sha("b"),
    bids: [],
    logicalTimeMs: 20,
    validUntilLogicalMs: 90,
  };
  await runtime.formFromStructure(formationInput);

  assert.equal(formationRequest.positions[0].roleKey, "research");
  assert.equal(formationRequest.positions[0].positionId, "position-a");
  assert.equal(formationRequest.membershipEpoch, 1);
  await assert.rejects(
    runtime.formFromStructure({
      ...formationInput,
      requestId: "expired",
      logicalTimeMs: 100,
    }),
    /advisory is not current/u,
  );
  await assert.rejects(
    runtime.formFromStructure({
      ...formationInput,
      requestId: "epoch-two",
      targetTeamEpoch: 2,
    }),
    /fresh team at epoch 1/u,
  );
  currentFormationTeam = {};
  await assert.rejects(
    runtime.formFromStructure({ ...formationInput, requestId: "active-team" }),
    /requires_fresh_runtime/u,
  );
});
