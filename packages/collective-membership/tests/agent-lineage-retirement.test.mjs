import assert from "node:assert/strict";
import test from "node:test";

import {
  GovernedAgentLifecycleRuntimeV1,
  GovernedAgentLineageRuntimeV1,
  InMemoryAgentLineageStoreV1,
  ReferenceAgentMembershipEnrollmentPortV1,
  collectiveMembershipDigestV1,
  createAgentCreationCertificateV1,
  createAgentCreationPolicyV1,
  createAgentCreationRequestV1,
  createAgentFactoryReceiptV1,
  invokeGovernedAgentLineageLoadV1,
  invokeGovernedAgentLineageTerminateV1,
  isGovernedAgentLineageRuntimeV1,
} from "../dist/index.js";

const digest = (character) => `sha256:${character.repeat(64)}`;

test("a persisted retirement reservation prevents concurrent external effects and receipt overwrite", async () => {
  let removeCalls = 0;
  let terminateCalls = 0;
  let releaseRemoval;
  let announceRemoval;
  const removalStarted = new Promise((resolve) => {
    announceRemoval = resolve;
  });
  const removalReleased = new Promise((resolve) => {
    releaseRemoval = resolve;
  });
  const fixture = await createRuntime("active", {
    remove: async () => {
      removeCalls += 1;
      announceRemoval();
      await removalReleased;
      return {
        removed: true,
        membershipConfigurationDigest: digest("c"),
        membershipEpoch: 2,
      };
    },
    terminate: async () => {
      terminateCalls += 1;
      return { terminated: true, receiptDigest: digest("d") };
    },
  });

  const first = fixture.runtime.terminate({
    agentId: "agent:child",
    reasonCode: "operator_retirement",
    cascade: false,
    logicalTimeMs: 10,
  });
  await removalStarted;
  await assert.rejects(
    fixture.runtime.terminate({
      agentId: "agent:child",
      reasonCode: "operator_retirement",
      cascade: false,
      logicalTimeMs: 10,
    }),
    /retirement is already in progress/u,
  );
  releaseRemoval();

  const completed = await first;
  const terminal = completed.agents.find(
    ({ agentId }) => agentId === "agent:child",
  );
  assert.equal(removeCalls, 1);
  assert.equal(terminateCalls, 1);
  assert.equal(terminal.status, "terminated");
  assert.equal(terminal.retirementMembershipConfigurationDigest, digest("c"));
  assert.equal(terminal.retirementMembershipEpoch, 2);
  assert.deepEqual(completed.terminationReceiptDigests, [digest("d")]);

  const replayed = await fixture.runtime.terminate({
    agentId: "agent:child",
    reasonCode: "operator_retirement",
    cascade: false,
    logicalTimeMs: 20,
  });
  assert.equal(replayed.stateDigest, completed.stateDigest);
  assert.equal(removeCalls, 1);
  assert.equal(terminateCalls, 1);
});

for (const initialStatus of ["suspended", "revoked"]) {
  test(`${initialStatus} material completes membership retirement without repeated factory cleanup`, async () => {
    let removeCalls = 0;
    let terminateCalls = 0;
    let memberPresent = true;
    const fixture = await createRuntime(initialStatus, {
      remove: async () => {
        removeCalls += 1;
        memberPresent = false;
        return {
          removed: true,
          membershipConfigurationDigest: digest("e"),
          membershipEpoch: 7,
        };
      },
      terminate: async () => {
        terminateCalls += 1;
        return { terminated: true, receiptDigest: digest("f") };
      },
    });
    const lifecycle = new GovernedAgentLifecycleRuntimeV1({
      lineage: fixture.runtime,
      registry: {
        current: () => ({
          epoch: memberPresent ? 6 : 7,
          configurationDigest: memberPresent ? digest("b") : digest("e"),
          members: memberPresent
            ? [{ peerId: "peer:child", instanceId: "instance:child" }]
            : [],
        }),
      },
    });

    const retired = await lifecycle.retirePeer({
      peerId: "peer:child",
      reasonCode: "governance_disabled",
      cascade: false,
      logicalTimeMs: 12,
    });
    assert.equal(removeCalls, 1);
    assert.equal(terminateCalls, 0);
    assert.equal(retired.membershipConfigurationDigest, digest("e"));
    assert.equal(retired.membershipEpoch, 7);

    const replayed = await lifecycle.retirePeer({
      peerId: "peer:child",
      reasonCode: "governance_disabled",
      cascade: false,
      logicalTimeMs: 20,
    });
    assert.deepEqual(replayed, retired);
    assert.equal(removeCalls, 1);
    assert.equal(terminateCalls, 0);
  });
}

test("lineage invokers reject structural fakes and retain construction-time dependencies", async () => {
  let removeCalls = 0;
  let terminateCalls = 0;
  const fixture = await createRuntime("active", {
    remove: async () => {
      removeCalls += 1;
      return {
        removed: true,
        membershipConfigurationDigest: digest("c"),
        membershipEpoch: 2,
      };
    },
    terminate: async () => {
      terminateCalls += 1;
      return { terminated: true, receiptDigest: digest("d") };
    },
  });
  assert.equal(isGovernedAgentLineageRuntimeV1(fixture.runtime), true);
  assert.equal(
    isGovernedAgentLineageRuntimeV1({
      load: fixture.runtime.load.bind(fixture.runtime),
      terminate: fixture.runtime.terminate.bind(fixture.runtime),
    }),
    false,
  );
  fixture.runtime.load = async () => {
    throw new Error("monkey-patched lineage load must not run");
  };
  fixture.runtime.terminate = async () => {
    throw new Error("monkey-patched lineage termination must not run");
  };
  fixture.store.load = async () => {
    throw new Error("rebound lineage store load must not run");
  };
  fixture.store.save = async () => {
    throw new Error("rebound lineage store save must not run");
  };
  fixture.factory.terminate = async () => {
    throw new Error("rebound agent factory must not run");
  };
  fixture.enrollment.remove = async () => {
    throw new Error("rebound membership enrollment must not run");
  };
  assert.equal(
    (await invokeGovernedAgentLineageLoadV1(fixture.runtime)).agents.length,
    2,
  );
  const retired = await invokeGovernedAgentLineageTerminateV1(fixture.runtime, {
    agentId: "agent:child",
    reasonCode: "compromise",
    cascade: false,
    logicalTimeMs: 10,
  });
  assert.equal(
    retired.agents.find(({ agentId }) => agentId === "agent:child").status,
    "terminated",
  );
  assert.equal(removeCalls, 1);
  assert.equal(terminateCalls, 1);
});

test("retirement reconciliation resumes after membership removal journal crash", async () => {
  let removeCalls = 0;
  let physicalRemovals = 0;
  let removed = false;
  const removeLogicalTimes = [];
  const terminateLogicalTimes = [];
  const fixture = await createRuntime("active", {
    failSaveAfterRemoval: true,
    remove: async (input) => {
      removeLogicalTimes.push(input.logicalTimeMs);
      removeCalls += 1;
      if (!removed) {
        removed = true;
        physicalRemovals += 1;
      }
      return {
        removed: true,
        membershipConfigurationDigest: digest("c"),
        membershipEpoch: 2,
      };
    },
    terminate: async (input) => {
      terminateLogicalTimes.push(input.logicalTimeMs);
      return { terminated: true, receiptDigest: digest("d") };
    },
  });
  const lifecycle = new GovernedAgentLifecycleRuntimeV1({
    lineage: fixture.runtime,
    registry: {
      current: () => ({
        epoch: removed ? 2 : 1,
        configurationDigest: removed ? digest("c") : digest("b"),
        members: removed
          ? [{ peerId: "peer:root", instanceId: "instance:root" }]
          : [
              { peerId: "peer:root", instanceId: "instance:root" },
              { peerId: "peer:child", instanceId: "instance:child" },
            ],
      }),
    },
  });
  await assert.rejects(
    lifecycle.retirePeer({
      peerId: "peer:child",
      reasonCode: "crash_recovery",
      cascade: false,
      logicalTimeMs: 10,
    }),
    /simulated removal journal crash/u,
  );
  const completed = await lifecycle.retirePeer({
    peerId: "peer:child",
    reasonCode: "crash_recovery",
    cascade: false,
    logicalTimeMs: 20,
  });
  assert.equal(completed.peerId, "peer:child");
  assert.equal(removeCalls, 2);
  assert.equal(physicalRemovals, 1);
  assert.deepEqual(removeLogicalTimes, [10, 10]);
  assert.deepEqual(terminateLogicalTimes, [10]);
});

test("retirement reconciliation resumes after termination crashes post-effect", async () => {
  let terminateCalls = 0;
  let physicalTerminations = 0;
  let terminated = false;
  let throwAfterFirstEffect = true;
  const fixture = await createRuntime("active", {
    remove: async () => ({
      removed: true,
      membershipConfigurationDigest: digest("c"),
      membershipEpoch: 2,
    }),
    terminate: async () => {
      terminateCalls += 1;
      if (!terminated) {
        terminated = true;
        physicalTerminations += 1;
      }
      if (throwAfterFirstEffect) {
        throwAfterFirstEffect = false;
        throw new Error("simulated termination crash");
      }
      return { terminated: true, receiptDigest: digest("d") };
    },
  });
  await assert.rejects(
    fixture.runtime.terminate({
      agentId: "agent:child",
      reasonCode: "crash_recovery",
      cascade: false,
      logicalTimeMs: 10,
    }),
    /simulated termination crash/u,
  );
  const reserved = await invokeGovernedAgentLineageLoadV1(fixture.runtime);
  const operationId = reserved.agents.find(
    ({ agentId }) => agentId === "agent:child",
  ).retirementOperationId;
  const completed = await fixture.runtime.reconcileRetirement({
    operationId,
    logicalTimeMs: 10,
  });
  assert.equal(
    completed.agents.find(({ agentId }) => agentId === "agent:child").status,
    "terminated",
  );
  assert.equal(terminateCalls, 2);
  assert.equal(physicalTerminations, 1);
});

test("membership effect reconciliation uses certified history after later transitions", async () => {
  const member = {
    peerId: "peer:child",
    instanceId: "instance:child",
    roles: ["worker"],
    capabilities: ["capability:test"],
    keys: [],
  };
  const root = {
    peerId: "peer:root",
    instanceId: "instance:root",
    roles: ["coordinator"],
    capabilities: [],
    keys: [],
  };
  const observer = {
    peerId: "peer:observer",
    instanceId: "instance:observer",
    roles: ["observer"],
    capabilities: [],
    keys: [],
  };
  const configurations = new Map([
    [1, membershipConfiguration(1, null, digest("1"), [root])],
    [2, membershipConfiguration(2, digest("1"), digest("2"), [root, member])],
    [
      3,
      membershipConfiguration(3, digest("2"), digest("3"), [
        root,
        member,
        observer,
      ]),
    ],
    [4, membershipConfiguration(4, digest("3"), digest("4"), [root, observer])],
    [5, membershipConfiguration(5, digest("4"), digest("5"), [root])],
  ]);
  let currentEpoch = 3;
  const registry = {
    current: () => configurations.get(currentEpoch),
    configuration: (epoch) => configurations.get(epoch),
  };
  let transitions = 0;
  const port = new ReferenceAgentMembershipEnrollmentPortV1({
    registry,
    client: {
      options: { registry },
      async transition() {
        transitions += 1;
        throw new Error("historical reconciliation must not transition again");
      },
    },
    clock: {
      now: () => ({
        wallTime: "2030-01-01T00:00:00.000Z",
        logicalTimeMs: 100,
      }),
    },
  });
  const pending = {
    ...(await lineageRecord({
      agentId: "agent:child",
      peerId: "peer:child",
      instanceId: "instance:child",
      parentAgentId: "agent:root",
      rootAgentId: "agent:root",
      generation: 1,
      authorityDigest: digest("3"),
      parentAuthorityDigest: digest("2"),
      status: "pending_enrollment",
    })),
    membershipConfigurationDigest: digest("1"),
    membershipEpoch: 1,
  };
  const enrolled = await port.enroll({
    agent: pending,
    member,
    change: { kind: "join", peerId: "peer:child" },
    logicalTimeMs: 100,
  });
  assert.equal(enrolled.membershipConfigurationDigest, digest("2"));
  assert.equal(enrolled.membershipEpoch, 2);

  currentEpoch = 5;
  const removed = await port.remove({
    agent: {
      ...pending,
      status: "retiring",
      membershipConfigurationDigest: digest("2"),
      membershipEpoch: 2,
    },
    logicalTimeMs: 101,
  });
  assert.equal(removed.membershipConfigurationDigest, digest("4"));
  assert.equal(removed.membershipEpoch, 4);
  assert.equal(transitions, 0);
});

test("a prepared creation saga remains resumable after authorization expiry", async () => {
  const policy = await createAgentCreationPolicyV1({
    schemaVersion: 1,
    policyId: "policy:create-recovery",
    policyVersion: 1,
    maximumGeneration: 4,
    maximumChildrenPerAgent: 4,
    maximumActiveDescendants: 8,
    maximumResourceUnitsPerChild: 100,
    maximumInteractionUnitsPerChild: 100,
    allowedAdapterIds: ["adapter:test"],
    permittedCapabilityKeys: ["capability:test"],
    requireRulePolicyInheritance: true,
    requireAuthorityAttenuation: true,
    requestTtlLogicalMs: 100,
    maximumCommitAttempts: 4,
  });
  const root = await lineageRecord({
    agentId: "agent:root",
    peerId: "peer:root",
    instanceId: "instance:root",
    parentAgentId: null,
    rootAgentId: "agent:root",
    generation: 0,
    authorityDigest: digest("2"),
    parentAuthorityDigest: null,
    status: "active",
  });
  const request = await createAgentCreationRequestV1({
    requestId: "request:child",
    parentAgentId: root.agentId,
    requestedAgentId: "agent:new-child",
    requestedPeerId: "peer:new-child",
    requestedInstanceId: "instance:new-child",
    factoryId: "factory:test",
    adapterId: "adapter:test",
    adapterVersion: "1.0.0",
    capabilityKeys: ["capability:test"],
    roleDefinitionDigest: digest("5"),
    proposedAuthorityDigest: digest("3"),
    parentAuthorityDigest: root.authorityDigest,
    localRuleProgramDigest: root.localRuleProgramDigest,
    resourceBudgetUnits: 10,
    interactionBudgetUnits: 10,
    requestedAtLogicalMs: 10,
    expiresAtLogicalMs: 100,
  });
  const certificate = await createAgentCreationCertificateV1({
    requestDigest: request.requestDigest,
    policyDigest: policy.policyDigest,
    parentLineageDigest: root.lineageDigest,
    roleDefinitionDigest: request.roleDefinitionDigest,
    authorityAttenuationDigest: digest("8"),
    collectiveCertificateDigest: digest("9"),
    membershipConfigurationDigest: digest("b"),
    membershipEpoch: 1,
    certifiedAtLogicalMs: 10,
    validUntilLogicalMs: 100,
  });
  const receipt = await createAgentFactoryReceiptV1({
    requestDigest: request.requestDigest,
    factoryId: "factory:test",
    factoryVersion: 1,
    factoryImplementationDigest: digest("4"),
    agentId: request.requestedAgentId,
    peerId: request.requestedPeerId,
    instanceId: request.requestedInstanceId,
    publicKeyId: "key:new-child",
    publicKey: "public-key-new-child",
    keyAlgorithm: "Ed25519",
    validFrom: "2030-01-01T00:00:00.000Z",
    validUntil: "2031-01-01T00:00:00.000Z",
    runtimeAttestationDigest: digest("a"),
  });
  let factoryCalls = 0;
  const runtime = new GovernedAgentLineageRuntimeV1({
    stateKey: "lineage:create-recovery",
    policy,
    store: new InMemoryAgentLineageStoreV1(),
    factory: {
      factoryId: "factory:test",
      factoryVersion: 1,
      factoryImplementationDigest: digest("4"),
      async create() {
        factoryCalls += 1;
        if (factoryCalls === 1) throw new Error("simulated factory outage");
        return receipt;
      },
      async terminate() {
        throw new Error("not used");
      },
    },
    certification: {
      async verify() {
        return true;
      },
      async verifyAuthorityAttenuation() {
        return true;
      },
    },
    enrollment: {
      async enroll() {
        throw new Error("not used");
      },
      async remove() {
        throw new Error("not used");
      },
    },
  });
  const { lineageDigest: _lineageDigest, ...rootSeed } = root;
  await runtime.initialize(rootSeed);
  await assert.rejects(
    runtime.create({ request, certificate, logicalTimeMs: 10 }),
    /simulated factory outage/u,
  );
  const created = await runtime.create({
    request,
    certificate,
    logicalTimeMs: 200,
  });
  assert.equal(created.agentId, request.requestedAgentId);
  assert.equal(created.createdAtLogicalMs, 10);
  assert.equal(factoryCalls, 2);
});

test("retirement cannot overtake an effect-applied child creation saga", async () => {
  let factoryReceipt;
  const fixture = await createRuntime("active", {
    failCreationFinalization: true,
    create: async () => factoryReceipt,
    remove: async () => ({
      removed: true,
      membershipConfigurationDigest: digest("c"),
      membershipEpoch: 2,
    }),
    terminate: async () => ({ terminated: true, receiptDigest: digest("d") }),
  });
  const parent = (await fixture.runtime.load()).agents.find(
    ({ agentId }) => agentId === "agent:child",
  );
  const request = await createAgentCreationRequestV1({
    requestId: "request:grandchild",
    parentAgentId: parent.agentId,
    requestedAgentId: "agent:grandchild",
    requestedPeerId: "peer:grandchild",
    requestedInstanceId: "instance:grandchild",
    factoryId: "factory:test",
    adapterId: "adapter:test",
    adapterVersion: "1.0.0",
    capabilityKeys: ["capability:test"],
    roleDefinitionDigest: digest("5"),
    proposedAuthorityDigest: digest("9"),
    parentAuthorityDigest: parent.authorityDigest,
    localRuleProgramDigest: parent.localRuleProgramDigest,
    resourceBudgetUnits: 10,
    interactionBudgetUnits: 10,
    requestedAtLogicalMs: 10,
    expiresAtLogicalMs: 100,
  });
  const certificate = await createAgentCreationCertificateV1({
    requestDigest: request.requestDigest,
    policyDigest: fixture.policy.policyDigest,
    parentLineageDigest: parent.lineageDigest,
    roleDefinitionDigest: request.roleDefinitionDigest,
    authorityAttenuationDigest: digest("8"),
    collectiveCertificateDigest: digest("9"),
    membershipConfigurationDigest: digest("b"),
    membershipEpoch: 1,
    certifiedAtLogicalMs: 10,
    validUntilLogicalMs: 100,
  });
  factoryReceipt = await createAgentFactoryReceiptV1({
    requestDigest: request.requestDigest,
    factoryId: "factory:test",
    factoryVersion: 1,
    factoryImplementationDigest: digest("4"),
    agentId: request.requestedAgentId,
    peerId: request.requestedPeerId,
    instanceId: request.requestedInstanceId,
    publicKeyId: "key:grandchild",
    publicKey: "public-key-grandchild",
    keyAlgorithm: "Ed25519",
    validFrom: "2030-01-01T00:00:00.000Z",
    validUntil: "2031-01-01T00:00:00.000Z",
    runtimeAttestationDigest: digest("a"),
  });
  await assert.rejects(
    fixture.runtime.create({ request, certificate, logicalTimeMs: 10 }),
    /simulated creation finalization crash/u,
  );
  const reserved = await fixture.runtime.load();
  assert.equal(reserved.creationSagas[0].phase, "effect_applied");
  await assert.rejects(
    fixture.runtime.terminate({
      agentId: parent.agentId,
      reasonCode: "parent_retirement",
      cascade: false,
      logicalTimeMs: 20,
    }),
    /blocked by an incomplete child creation saga/u,
  );
  const created = await fixture.runtime.create({
    request,
    certificate,
    logicalTimeMs: 20,
  });
  assert.equal(created.agentId, request.requestedAgentId);
});

async function createRuntime(childStatus, effects) {
  const policy = await createAgentCreationPolicyV1({
    schemaVersion: 1,
    policyId: "policy:test",
    policyVersion: 1,
    maximumGeneration: 4,
    maximumChildrenPerAgent: 4,
    maximumActiveDescendants: 8,
    maximumResourceUnitsPerChild: 100,
    maximumInteractionUnitsPerChild: 100,
    allowedAdapterIds: ["adapter:test"],
    permittedCapabilityKeys: ["capability:test"],
    requireRulePolicyInheritance: true,
    requireAuthorityAttenuation: true,
    requestTtlLogicalMs: 100,
    maximumCommitAttempts: 4,
  });
  const root = await lineageRecord({
    agentId: "agent:root",
    peerId: "peer:root",
    instanceId: "instance:root",
    parentAgentId: null,
    rootAgentId: "agent:root",
    generation: 0,
    authorityDigest: digest("2"),
    parentAuthorityDigest: null,
    status: "active",
  });
  const child = await lineageRecord({
    agentId: "agent:child",
    peerId: "peer:child",
    instanceId: "instance:child",
    parentAgentId: "agent:root",
    rootAgentId: "agent:root",
    generation: 1,
    authorityDigest: digest("3"),
    parentAuthorityDigest: digest("2"),
    status: childStatus,
  });
  const stateBody = {
    schemaVersion: 1,
    stateKey: "lineage:test",
    policyDigest: policy.policyDigest,
    revision: 0,
    fence: 1,
    agents: [root, child],
    factoryReceiptDigests: [],
    terminationReceiptDigests: [],
    logicalTimeHighWaterMs: 5,
    previousStateDigest: null,
  };
  const initial = {
    ...stateBody,
    stateDigest: await collectiveMembershipDigestV1({
      domain: "agent-lineage-state-v1",
      body: stateBody,
    }),
  };
  const backingStore = new InMemoryAgentLineageStoreV1();
  let failedSaveAfterRemoval = false;
  let failedCreationFinalization = false;
  const store = {
    load: (stateKey) => backingStore.load(stateKey),
    async save(next, expectedRevision) {
      if (
        effects.failSaveAfterRemoval &&
        !failedSaveAfterRemoval &&
        next.agents.some(
          (agent) =>
            agent.status === "retiring" &&
            agent.retirementMembershipConfigurationDigest !== null,
        )
      ) {
        failedSaveAfterRemoval = true;
        throw new Error("simulated removal journal crash");
      }
      if (
        effects.failCreationFinalization &&
        !failedCreationFinalization &&
        next.agents.length > 2 &&
        next.creationSagas?.some(({ phase }) => phase === "completed")
      ) {
        failedCreationFinalization = true;
        throw new Error("simulated creation finalization crash");
      }
      return backingStore.save(next, expectedRevision);
    },
  };
  assert.equal(await store.save(initial, null), true);
  const factory = {
    factoryId: "factory:test",
    factoryVersion: 1,
    factoryImplementationDigest: digest("4"),
    create: async (input) =>
      effects.create
        ? effects.create(input)
        : Promise.reject(new Error("not used")),
    terminate: effects.terminate,
  };
  const enrollment = {
    enroll: async () => {
      throw new Error("not used");
    },
    remove: effects.remove,
  };
  return {
    policy,
    store,
    factory,
    enrollment,
    runtime: new GovernedAgentLineageRuntimeV1({
      stateKey: "lineage:test",
      policy,
      store,
      factory,
      certification: {
        verify: async () => true,
        verifyAuthorityAttenuation: async () => true,
      },
      enrollment,
    }),
  };
}

async function lineageRecord(input) {
  const body = {
    schemaVersion: 1,
    ...input,
    factoryId: "factory:test",
    adapterId: "adapter:test",
    adapterVersion: "1.0.0",
    capabilityKeys: ["capability:test"],
    roleDefinitionDigest: digest("5"),
    localRuleProgramDigest: digest("6"),
    resourceBudgetUnits: 100,
    interactionBudgetUnits: 100,
    publicKeyId: `key:${input.agentId}`,
    publicKey: `public-key-${input.agentId}`,
    validFrom: "2030-01-01T00:00:00.000Z",
    validUntil: "2031-01-01T00:00:00.000Z",
    creationCertificateDigest: digest("7"),
    membershipConfigurationDigest: digest("b"),
    membershipEpoch: 1,
    createdAtLogicalMs: input.generation === 0 ? 0 : 5,
    terminatedAtLogicalMs: null,
    retirementMembershipConfigurationDigest: null,
    retirementMembershipEpoch: null,
  };
  return {
    ...body,
    lineageDigest: await collectiveMembershipDigestV1({
      domain: "agent-lineage-record-v1",
      body,
    }),
  };
}

function membershipConfiguration(
  epoch,
  previousConfigurationDigest,
  configurationDigest,
  members,
) {
  return {
    schemaVersion: 1,
    tenantId: "tenant:test",
    meshId: "mesh:test",
    policyDomainId: "policy:test",
    epoch,
    previousConfigurationDigest,
    effectiveAt: `2030-01-01T00:00:0${epoch}.000Z`,
    effectiveAtLogicalMs: epoch,
    members,
    quorumThreshold: 1,
    configurationDigest,
  };
}
