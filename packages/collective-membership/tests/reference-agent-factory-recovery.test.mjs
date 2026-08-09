import assert from "node:assert/strict";
import test from "node:test";

import {
  GovernedAgentCreationCancelledErrorV1,
  GovernedAgentLineageRuntimeV1,
  InMemoryAgentLineageStoreV1,
  InMemoryGovernedAgentFactoryStoreV1,
  ReferenceGovernedAgentFactoryV1,
  createAgentCreationCertificateV1,
  createAgentCreationPolicyV1,
  createAgentCreationRequestV1,
} from "../dist/index.js";

const digest = (character) => `sha256:${character.repeat(64)}`;

for (const crashStage of [
  "lineage-reservation",
  "reservation",
  "identity",
  "key",
  "completion",
]) {
  test(`expired ${crashStage} crash is cancelled durably without extending authority`, async () => {
    const fixture = await recoveryFixture(crashStage);
    await assert.rejects(
      fixture.lineage.create({
        request: fixture.request,
        certificate: fixture.certificate,
        logicalTimeMs: 10,
      }),
      new RegExp(`simulated ${crashStage} crash`, "u"),
    );

    fixture.clock.wallTime = "2030-01-01T00:00:00.100Z";
    fixture.clock.logicalTimeMs = 100;
    await assert.rejects(
      fixture.lineage.create({
        request: fixture.request,
        certificate: fixture.certificate,
        logicalTimeMs: 100,
      }),
      GovernedAgentCreationCancelledErrorV1,
    );

    const lineageState = await fixture.lineage.load();
    const saga = lineageState.creationSagas.find(
      ({ request }) => request.requestDigest === fixture.request.requestDigest,
    );
    assert.equal(saga.phase, "cancelled");
    assert.match(saga.cancellationReceiptDigest, /^sha256:[0-9a-f]{64}$/u);
    assert.equal(
      lineageState.agents.some(
        ({ agentId }) => agentId === fixture.request.requestedAgentId,
      ),
      false,
    );

    const factoryState = await fixture.factory.load();
    const record = factoryState.records.find(
      ({ requestDigest }) => requestDigest === fixture.request.requestDigest,
    );
    assert.equal(record.status, "expired");
    assert.equal(record.createdAtLogicalMs, 10);
    assert.equal(
      record.provisioningWallTime,
      crashStage === "lineage-reservation" ? null : "2030-01-01T00:00:00.000Z",
    );
    assert.equal(
      record.provisioningValidUntil,
      crashStage === "lineage-reservation" ? null : "2030-01-01T00:00:00.010Z",
    );
    assert.equal(record.cleanupStartedAtLogicalMs, 100);
    assert.equal(
      fixture.identity.live.has(fixture.request.requestDigest),
      false,
    );
    assert.equal(fixture.keys.live.has(fixture.request.requestDigest), false);
    assert.equal(fixture.identity.terminationCalls, 1);
    assert.equal(fixture.keys.revocationCalls, 1);
    assert.equal(
      fixture.identity.provisionCalls,
      crashStage === "lineage-reservation" || crashStage === "reservation"
        ? 0
        : 1,
    );
    assert.equal(
      fixture.keys.generationCalls,
      crashStage === "key" || crashStage === "completion" ? 1 : 0,
    );

    await assert.rejects(
      fixture.lineage.create({
        request: fixture.request,
        certificate: fixture.certificate,
        logicalTimeMs: 101,
      }),
      GovernedAgentCreationCancelledErrorV1,
    );
    assert.equal(fixture.identity.terminationCalls, 1);
    assert.equal(fixture.keys.revocationCalls, 1);
  });
}

test("a pre-expiry retry uses the original verifier time and key interval", async () => {
  const fixture = await recoveryFixture("identity");
  await assert.rejects(
    fixture.lineage.create({
      request: fixture.request,
      certificate: fixture.certificate,
      logicalTimeMs: 10,
    }),
    /simulated identity crash/u,
  );
  fixture.clock.wallTime = "2030-01-01T00:00:00.005Z";
  fixture.clock.logicalTimeMs = 15;
  const created = await fixture.lineage.create({
    request: fixture.request,
    certificate: fixture.certificate,
    logicalTimeMs: 15,
  });
  assert.equal(created.status, "pending_enrollment");
  assert.equal(created.validFrom, "2030-01-01T00:00:00.000Z");
  assert.equal(created.validUntil, "2030-01-01T00:00:00.010Z");
  assert.deepEqual(new Set(fixture.certification.logicalTimes), new Set([10]));
  assert.equal(fixture.identity.physicalProvisions, 1);
  assert.equal(fixture.keys.physicalGenerations, 1);
});

async function recoveryFixture(crashStage) {
  const policy = await createAgentCreationPolicyV1({
    schemaVersion: 1,
    policyId: "policy:factory-recovery",
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
    maximumCommitAttempts: 8,
  });
  const lineageBacking = new InMemoryAgentLineageStoreV1();
  let lineageReservationCrashPending = crashStage === "lineage-reservation";
  const lineageStore = {
    load: (stateKey) => lineageBacking.load(stateKey),
    async save(state, expectedRevision) {
      const saved = await lineageBacking.save(state, expectedRevision);
      if (
        saved &&
        lineageReservationCrashPending &&
        state.creationSagas?.some(({ phase }) => phase === "prepared")
      ) {
        lineageReservationCrashPending = false;
        throw new Error("simulated lineage-reservation crash");
      }
      return saved;
    },
  };
  const factoryBacking = new InMemoryGovernedAgentFactoryStoreV1();
  let reservationCrashPending = crashStage === "reservation";
  let completionCrashPending = crashStage === "completion";
  const factoryStore = {
    load: (stateKey) => factoryBacking.load(stateKey),
    async save(state, expectedRevision) {
      const saved = await factoryBacking.save(state, expectedRevision);
      if (
        saved &&
        reservationCrashPending &&
        state.records.some(({ status }) => status === "reserved")
      ) {
        reservationCrashPending = false;
        throw new Error("simulated reservation crash");
      }
      if (
        saved &&
        completionCrashPending &&
        state.records.some(({ status }) => status === "active")
      ) {
        completionCrashPending = false;
        throw new Error("simulated completion crash");
      }
      return saved;
    },
  };
  const clock = {
    wallTime: "2030-01-01T00:00:00.000Z",
    logicalTimeMs: 10,
    async read() {
      return {
        wallTime: this.wallTime,
        logicalTimeMs: this.logicalTimeMs,
      };
    },
  };
  const certification = {
    logicalTimes: [],
    async verify({ logicalTimeMs }) {
      this.logicalTimes.push(logicalTimeMs);
      return logicalTimeMs === 10;
    },
    async verifyAuthorityAttenuation() {
      return true;
    },
  };
  const identity = idempotentIdentity(crashStage === "identity");
  const keys = idempotentKeys(crashStage === "key");
  const factory = new ReferenceGovernedAgentFactoryV1({
    stateKey: "factory:recovery",
    lineageStateKey: "lineage:recovery",
    factoryId: "factory:test",
    factoryVersion: 1,
    factoryImplementationDigest: digest("4"),
    policy,
    lineageStore,
    store: factoryStore,
    certification,
    identity,
    keys,
    clock,
    maximumManagedAgents: 16,
    maximumKeyLifetimeMs: 1_000,
  });
  const lineage = new GovernedAgentLineageRuntimeV1({
    stateKey: "lineage:recovery",
    policy,
    store: lineageStore,
    factory,
    certification,
    enrollment: {
      async enroll() {
        throw new Error("not used");
      },
      async remove() {
        throw new Error("not used");
      },
    },
  });
  const root = {
    schemaVersion: 1,
    agentId: "agent:root",
    peerId: "peer:root",
    instanceId: "instance:root",
    parentAgentId: null,
    rootAgentId: "agent:root",
    generation: 0,
    factoryId: "factory:root",
    adapterId: "adapter:test",
    adapterVersion: "1.0.0",
    capabilityKeys: ["capability:test"],
    roleDefinitionDigest: digest("5"),
    authorityDigest: digest("2"),
    parentAuthorityDigest: null,
    localRuleProgramDigest: digest("6"),
    resourceBudgetUnits: 100,
    interactionBudgetUnits: 100,
    publicKeyId: "key:root",
    publicKey: "public-key-root",
    validFrom: "2029-01-01T00:00:00.000Z",
    validUntil: "2031-01-01T00:00:00.000Z",
    creationCertificateDigest: digest("7"),
    membershipConfigurationDigest: digest("b"),
    membershipEpoch: 1,
    status: "active",
    createdAtLogicalMs: 0,
    terminatedAtLogicalMs: null,
    retirementMembershipConfigurationDigest: null,
    retirementMembershipEpoch: null,
  };
  const rootState = await lineage.initialize(root);
  await factory.initialize(0);
  const rootRecord = rootState.agents[0];
  const request = await createAgentCreationRequestV1({
    requestId: `request:${crashStage}`,
    parentAgentId: rootRecord.agentId,
    requestedAgentId: `agent:child-${crashStage}`,
    requestedPeerId: `peer:child-${crashStage}`,
    requestedInstanceId: `instance:child-${crashStage}`,
    factoryId: "factory:test",
    adapterId: "adapter:test",
    adapterVersion: "1.0.0",
    capabilityKeys: ["capability:test"],
    roleDefinitionDigest: digest("5"),
    proposedAuthorityDigest: digest("3"),
    parentAuthorityDigest: rootRecord.authorityDigest,
    localRuleProgramDigest: rootRecord.localRuleProgramDigest,
    resourceBudgetUnits: 10,
    interactionBudgetUnits: 10,
    requestedAtLogicalMs: 10,
    expiresAtLogicalMs: 20,
  });
  const certificate = await createAgentCreationCertificateV1({
    requestDigest: request.requestDigest,
    policyDigest: policy.policyDigest,
    parentLineageDigest: rootRecord.lineageDigest,
    roleDefinitionDigest: request.roleDefinitionDigest,
    authorityAttenuationDigest: digest("8"),
    collectiveCertificateDigest: digest("9"),
    membershipConfigurationDigest: digest("b"),
    membershipEpoch: 1,
    certifiedAtLogicalMs: 10,
    validUntilLogicalMs: 20,
  });
  return {
    policy,
    lineage,
    factory,
    request,
    certificate,
    certification,
    identity,
    keys,
    clock,
  };
}

function idempotentIdentity(crashOnce) {
  return {
    live: new Map(),
    fenced: new Set(),
    provisionCalls: 0,
    physicalProvisions: 0,
    terminationCalls: 0,
    crashPending: crashOnce,
    async provision(input) {
      this.provisionCalls += 1;
      if (this.fenced.has(input.creationOperationId))
        throw new Error("identity operation is fenced");
      if (!this.live.has(input.creationOperationId)) {
        this.physicalProvisions += 1;
        this.live.set(input.creationOperationId, {
          identityHandle: `identity:${input.agentId}`,
          runtimeAttestationDigest: digest("a"),
        });
      }
      if (this.crashPending) {
        this.crashPending = false;
        throw new Error("simulated identity crash");
      }
      return this.live.get(input.creationOperationId);
    },
    async terminate(input) {
      this.terminationCalls += 1;
      this.fenced.add(input.creationOperationId);
      this.live.delete(input.creationOperationId);
      return { terminated: true, receiptDigest: digest("c") };
    },
  };
}

function idempotentKeys(crashOnce) {
  return {
    live: new Map(),
    fenced: new Set(),
    generationCalls: 0,
    physicalGenerations: 0,
    revocationCalls: 0,
    crashPending: crashOnce,
    async generateEd25519(input) {
      this.generationCalls += 1;
      if (this.fenced.has(input.creationOperationId))
        throw new Error("key operation is fenced");
      if (!this.live.has(input.creationOperationId)) {
        this.physicalGenerations += 1;
        this.live.set(input.creationOperationId, {
          keyHandle: `key-handle:${input.agentId}`,
          publicKeyId: `key:${input.agentId}`,
          publicKey: `public-key-${input.agentId}`,
          keyAlgorithm: "Ed25519",
          validFrom: input.validFrom,
          validUntil: input.validUntil,
          keyAttestationDigest: digest("d"),
        });
      }
      if (this.crashPending) {
        this.crashPending = false;
        throw new Error("simulated key crash");
      }
      return this.live.get(input.creationOperationId);
    },
    async revoke(input) {
      this.revocationCalls += 1;
      this.fenced.add(input.creationOperationId);
      this.live.delete(input.creationOperationId);
      return { revoked: true, receiptDigest: digest("e") };
    },
  };
}
