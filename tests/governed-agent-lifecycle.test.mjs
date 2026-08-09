import assert from "node:assert/strict";
import test from "node:test";

import {
  GovernedAgentLifecycleRuntimeV1,
  GovernedAgentLineageRuntimeV1,
  InMemoryAgentLineageStoreV1,
  collectiveMembershipDigestV1,
  createAgentCreationPolicyV1,
  isGovernedAgentLifecycleRuntimeV1,
} from "@agentplat/collective-membership";
import { createCompromiseRecoveryLifecycleExclusionPortV1 } from "@agentplat/collective-runtime/compromise-aware-recovery";

const digest = (character) => `sha256:${character.repeat(64)}`;

test("retirement replays the membership successor that first excluded the peer", async () => {
  const overrideCalls = { createAndEnroll: 0, retirePeer: 0, eligibility: 0 };
  class OverridingLifecycle extends GovernedAgentLifecycleRuntimeV1 {
    async createAndEnroll() {
      overrideCalls.createAndEnroll += 1;
      throw new Error("subclass create+enroll override must not run");
    }

    async retirePeer() {
      overrideCalls.retirePeer += 1;
      throw new Error("subclass retirement override must not run");
    }

    async eligibility() {
      overrideCalls.eligibility += 1;
      return { eligible: true, reasonCode: "active_member" };
    }
  }
  const fixture = await createLineageRuntime();
  const lineage = fixture.runtime;
  const active = (await lineage.load()).agents.find(
    ({ agentId }) => agentId === "agent:child",
  );
  let membershipEpoch = 2;
  const registry = {
    current: () => ({
      epoch: membershipEpoch,
      configurationDigest: membershipEpoch === 2 ? digest("c") : digest("d"),
      members: [],
    }),
  };
  assert.throws(
    () =>
      new GovernedAgentLifecycleRuntimeV1({
        lineage: {
          create: async () => active,
          enroll: async () => active,
          load: async () => ({ agents: [active] }),
          terminate: async () => ({ agents: [] }),
        },
        registry,
      }),
    /concrete governed agent lineage runtime is required/u,
  );
  const lifecycle = new OverridingLifecycle({ lineage, registry });
  assert.equal(isGovernedAgentLifecycleRuntimeV1(lifecycle), true);
  assert.equal(
    isGovernedAgentLifecycleRuntimeV1({
      eligibility: lifecycle.eligibility.bind(lifecycle),
      retirePeer: lifecycle.retirePeer.bind(lifecycle),
    }),
    false,
  );
  assert.throws(() => {
    lifecycle.retirePeer = async () => {
      overrideCalls.retirePeer += 1;
      throw new Error("monkey-patched retirement must not run");
    };
  }, TypeError);
  lineage.load = async () => {
    throw new Error("monkey-patched lineage load must not run");
  };
  lineage.terminate = async () => {
    throw new Error("monkey-patched lineage termination must not run");
  };
  registry.current = () => {
    throw new Error("rebound membership registry must not run");
  };
  assert.throws(() => {
    lifecycle.eligibility = async () => {
      overrideCalls.eligibility += 1;
      return { eligible: true, reasonCode: "active_member" };
    };
  }, TypeError);
  const eligibility = await lifecycle.eligibility({ peerId: active.peerId });
  assert.equal(eligibility.eligible, false);
  assert.equal(eligibility.reasonCode, "membership_unavailable");

  const first = await lifecycle.retirePeer({
    peerId: "peer:child",
    reasonCode: "compromise",
    cascade: true,
    logicalTimeMs: 10,
  });
  membershipEpoch = 3;
  const replay = await lifecycle.retirePeer({
    peerId: "peer:child",
    reasonCode: "compromise",
    cascade: true,
    logicalTimeMs: 20,
  });
  const recoveryExclusion = createCompromiseRecoveryLifecycleExclusionPortV1({
    lifecycle,
    exclusion: {
      async exclude(request) {
        return {
          operationId: request.operationId,
          subjectPeerId: request.verdict.subjectPeerId,
          subjectPeerIndex: request.verdict.subjectPeerIndex,
          certificateDigest: request.verdict.certificateDigest,
          resultingViewDigest: digest("e"),
          resultingViewRevision: 2,
          appliedAtLogicalMs: request.logicalTimeMs,
          receiptDigest: digest("f"),
        };
      },
    },
  });
  const recoveryReceipt = await recoveryExclusion.exclude({
    operationId: "recovery:retire-peer",
    verdict: {
      subjectPeerId: active.peerId,
      subjectPeerIndex: 1,
      certificateDigest: digest("e"),
    },
    logicalTimeMs: 20,
  });

  assert.equal(first.membershipConfigurationDigest, digest("c"));
  assert.equal(first.membershipEpoch, 2);
  assert.deepEqual(replay, first);
  assert.equal(recoveryReceipt.membershipConfigurationDigest, digest("c"));
  assert.equal(recoveryReceipt.membershipEpoch, 2);
  assert.deepEqual(overrideCalls, {
    createAndEnroll: 0,
    retirePeer: 0,
    eligibility: 0,
  });
  assert.equal(fixture.calls.remove, 1);
  assert.equal(fixture.calls.terminate, 1);
});

async function createLineageRuntime() {
  const calls = { remove: 0, terminate: 0 };
  const policy = await createAgentCreationPolicyV1({
    schemaVersion: 1,
    policyId: "policy:lifecycle-test",
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
    status: "active",
  });
  const stateBody = {
    schemaVersion: 1,
    stateKey: "lineage:lifecycle-test",
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
  const store = new InMemoryAgentLineageStoreV1();
  assert.equal(await store.save(initial, null), true);
  return {
    calls,
    runtime: new GovernedAgentLineageRuntimeV1({
      stateKey: "lineage:lifecycle-test",
      policy,
      store,
      factory: {
        factoryId: "factory:test",
        factoryVersion: 1,
        factoryImplementationDigest: digest("4"),
        async create() {
          throw new Error("not used");
        },
        async terminate() {
          calls.terminate += 1;
          return { terminated: true, receiptDigest: digest("d") };
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
          calls.remove += 1;
          return {
            removed: true,
            membershipConfigurationDigest: digest("c"),
            membershipEpoch: 2,
          };
        },
      },
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
