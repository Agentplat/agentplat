import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";

import { digestPlanningJsonV1 } from "@agentplat/collective-planning";
import { InMemoryCollectiveSyncRepositoryV1 } from "@agentplat/collective-sync";
import {
  InMemoryPeerStrategyEvidenceStoreV1,
  PeerStrategyEvidenceExchangeRuntimeV1,
  createPeerStrategyEvidenceBindingV1,
  createPeerStrategyEvidenceCohortV1,
  createPeerStrategyEvidenceCollectiveSyncAdapterV1,
  createPeerStrategyEvidenceExchangePolicyV1,
  createPeerStrategyEvidenceEligibilityPortV1,
  createPeerStrategyEvidenceStateV1,
  createSignedPeerStrategyOutcomeAttestationV1,
  fromMeshSparseDigestV2,
  publishPeerStrategyEvidenceGossipV1,
  receivePeerStrategyEvidenceGossipV1,
  toMeshSparseDigestV2,
  verifySignedPeerStrategyOutcomeAttestationV1,
} from "@agentplat/collective-runtime/strategy-evidence-exchange";
import {
  createMeshSparsePeerViewV2,
  createMeshSparseRoutingStateV2,
  meshSparseOverlayProfileV2,
} from "@agentplat/mesh/overlay";

const crypto = webcrypto;
const digest = (label) =>
  digestPlanningJsonV1("local-strategy-definition", { label });

const feedbackSchemaDigest = digest("feedback-schema");
const cohort = createPeerStrategyEvidenceCohortV1({
  tenantId: "tenant",
  meshId: "mesh",
  policyDomainId: "policy-domain",
  missionIntentId: "mission",
  objectiveId: "objective",
  contextClassDigest: digest("context-class"),
});
const binding = createPeerStrategyEvidenceBindingV1({
  operation: "offer_routing",
  strategyId: "strategy.fast-path",
  strategyDigest: digest("strategy"),
  implementationDigest: digest("implementation"),
  feedbackSchemaDigest,
});

function policy(overrides = {}) {
  return createPeerStrategyEvidenceExchangePolicyV1({
    schemaVersion: 1,
    policyId: "evidence-policy",
    policyVersion: 1,
    parentPolicyDigest: null,
    feedbackSchemaDigest,
    minimumDistinctPeers: 3,
    minimumDistinctIndependenceGroups: 3,
    minimumConfidenceBps: 5_000,
    maximumPriorInfluenceBps: 4_000,
    limits: {
      maximumAttestations: 16,
      maximumAttestationsPerPeer: 4,
      maximumSourceHeads: 16,
      maximumCertificates: 8,
      maximumFeedbackSignalDigests: 4,
      maximumAttestationTtlMs: 100,
      maximumFutureSkewMs: 5,
      maximumReasonCodesPerDecision: 8,
      maximumCommitAttempts: 4,
      maximumGossipFanout: 4,
      maximumGossipHops: 3,
    },
    ...overrides,
  });
}

function metrics(valueMicros) {
  return [
    "mission_progress",
    "latency_efficiency",
    "resource_efficiency",
    "recovery_quality",
    "safety",
  ].map((metric) => ({ schemaVersion: 1, metric, valueMicros }));
}

async function keyPair() {
  return crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
}

async function attestation({
  keys,
  peerId = "peer-a",
  instanceId = `${peerId}.instance`,
  streamId = `${peerId}.stream`,
  sequence = 1,
  predecessorAttestationDigest = null,
  membershipEpoch = 1,
  membershipConfigurationDigest = digest("membership"),
  metricValue = 500_000,
  confidenceBps = 7_000,
  outcome = "success",
  observedAtLogicalMs = 10,
  expiresAtLogicalMs = 100,
  bindingInput = binding,
  schemaVersion = 1,
} = {}) {
  return createSignedPeerStrategyOutcomeAttestationV1({
    schemaVersion,
    issuerPeerId: peerId,
    issuerInstanceId: instanceId,
    issuerStreamId: streamId,
    issuerSequence: sequence,
    predecessorAttestationDigest,
    membershipEpoch,
    membershipConfigurationDigest,
    cohort,
    binding: bindingInput,
    catalogDigest: digest(`catalog-${peerId}`),
    localPolicyDigest: digest(`local-policy-${peerId}`),
    selectionDecisionDigest: digest(
      `selection-${peerId}-${sequence}-${metricValue}`,
    ),
    feedbackBatchDigest: digest(`batch-${peerId}-${sequence}-${metricValue}`),
    feedbackDecisionDigest: digest(
      `feedback-${peerId}-${sequence}-${metricValue}`,
    ),
    feedbackSignalDigests: [
      digest(`signal-${peerId}-${sequence}-${metricValue}`),
    ],
    outcome,
    metrics: metrics(metricValue),
    confidenceBps,
    observedAtLogicalMs,
    expiresAtLogicalMs,
    signing: { keyId: `${peerId}.key`, privateKey: keys.privateKey },
    crypto,
  });
}

function runtime({
  currentEligibility,
  groupFor,
  stateKey = "evidence-state",
  policyRecord = policy(),
} = {}) {
  const store = new InMemoryPeerStrategyEvidenceStoreV1(policyRecord);
  const eligible = currentEligibility ?? new Set();
  return {
    store,
    exchange: new PeerStrategyEvidenceExchangeRuntimeV1({
      stateKey,
      exchangerId: "exchange",
      exchangerVersion: 1,
      implementationId: "exchange-implementation",
      policy: policyRecord,
      eligibility: {
        async evaluate({ attestation: current }) {
          const admitted =
            eligible.size === 0 || eligible.has(current.issuerPeerId);
          return {
            schemaVersion: 1,
            attestationDigest: current.attestationDigest,
            disposition: admitted ? "eligible" : "restricted",
            decisionDigest: digest(
              `eligibility-${current.attestationDigest}-${admitted}`,
            ),
            expiresAtLogicalMs: 200,
          };
        },
      },
      independence: {
        async classify({ attestation: current }) {
          const group = groupFor?.(current) ?? `group-${current.issuerPeerId}`;
          return {
            independenceGroupId: group,
            classificationDigest: digest(`group-${group}`),
            expiresAtLogicalMs: 200,
          };
        },
      },
      store,
    }),
  };
}

test("creates canonical cohort, binding and policy records", () => {
  assert.equal(
    cohort.cohortDigest,
    createPeerStrategyEvidenceCohortV1({
      tenantId: "tenant",
      meshId: "mesh",
      policyDomainId: "policy-domain",
      missionIntentId: "mission",
      objectiveId: "objective",
      contextClassDigest: digest("context-class"),
    }).cohortDigest,
  );
  assert.equal(binding.operation, "offer_routing");
  assert.equal(policy().policy.feedbackSchemaDigest, feedbackSchemaDigest);
  const { bindingDigest, ...bindingInput } = binding;
  assert.throws(
    () =>
      createPeerStrategyEvidenceBindingV1({
        ...bindingInput,
        feedbackSchemaDigest: "sha256:not-a-digest",
      }),
    /invalid/u,
  );
});

test("Ed25519 attestations verify and tampering is rejected", async () => {
  const keys = await keyPair();
  const signed = await attestation({ keys });
  assert.equal(
    (
      await verifySignedPeerStrategyOutcomeAttestationV1({
        attestation: signed,
        publicKey: keys.publicKey,
        crypto,
      })
    )?.attestationDigest,
    signed.attestationDigest,
  );
  assert.equal(
    await verifySignedPeerStrategyOutcomeAttestationV1({
      attestation: { ...signed, confidenceBps: 1 },
      publicKey: keys.publicKey,
      crypto,
    }),
    null,
  );
});

test("the reference eligibility gate binds membership, signature, and local Trust", async () => {
  const keys = await keyPair();
  const signed = await attestation({ keys });
  const gate = createPeerStrategyEvidenceEligibilityPortV1({
    crypto,
    membership: {
      async resolve() {
        return {
          publicKey: keys.publicKey,
          decisionDigest: digest("membership-eligibility"),
          expiresAtLogicalMs: 80,
        };
      },
    },
    trust: {
      async evaluate() {
        return {
          disposition: "eligible",
          decisionDigest: digest("trust-eligibility"),
          expiresAtLogicalMs: 70,
        };
      },
    },
  });
  assert.equal(
    (await gate.evaluate({ attestation: signed, logicalTimeMs: 20 }))
      .disposition,
    "eligible",
  );
  const replacement = signed.proof.value.startsWith("A") ? "B" : "A";
  const invalidSignature = {
    ...signed,
    proof: {
      ...signed.proof,
      value: replacement + signed.proof.value.slice(1),
    },
  };
  assert.equal(
    (
      await gate.evaluate({
        attestation: invalidSignature,
        logicalTimeMs: 20,
      })
    ).disposition,
    "ineligible",
  );
});

test("admission is causal, replay-safe, bounded by TTL and rejects equivocation", async () => {
  const keys = await keyPair();
  const { exchange } = runtime();
  const first = await attestation({ keys, peerId: "peer-a" });
  assert.equal(
    (await exchange.admit({ attestation: first, logicalTimeMs: 20 })).status,
    "admitted",
  );
  assert.equal(
    (await exchange.admit({ attestation: first, logicalTimeMs: 20 })).status,
    "duplicate",
  );

  const second = await attestation({
    keys,
    peerId: "peer-a",
    sequence: 2,
    predecessorAttestationDigest: first.attestationDigest,
  });
  const gap = await attestation({
    keys,
    peerId: "peer-a",
    sequence: 3,
    predecessorAttestationDigest: second.attestationDigest,
  });
  assert.equal(
    (await exchange.admit({ attestation: gap, logicalTimeMs: 20 })).status,
    "pending_predecessor",
  );
  assert.equal((await exchange.loadState()).pendingAttestations.length, 1);

  assert.equal(
    (await exchange.admit({ attestation: second, logicalTimeMs: 20 })).status,
    "admitted",
  );
  const converged = await exchange.loadState();
  assert.equal(converged.pendingAttestations.length, 0);
  assert.equal(converged.sourceHeads[0].issuerSequence, 3);
  const fork = await attestation({
    keys,
    peerId: "peer-a",
    sequence: 2,
    predecessorAttestationDigest: first.attestationDigest,
    metricValue: 800_000,
  });
  assert.equal(
    (await exchange.admit({ attestation: fork, logicalTimeMs: 20 })).status,
    "rejected",
  );
  const quarantined = await exchange.loadState();
  assert.equal(quarantined.sourceHeads[0].equivocated, true);
  assert.equal(
    quarantined.attestations.some(
      ({ issuerPeerId }) => issuerPeerId === "peer-a",
    ),
    false,
  );

  const expired = await attestation({
    keys,
    peerId: "peer-b",
    expiresAtLogicalMs: 19,
  });
  const expiredDecision = await exchange.admit({
    attestation: expired,
    logicalTimeMs: 20,
  });
  assert.equal(expiredDecision.status, "rejected");
  assert.ok(expiredDecision.reasonCodes.includes("expired"));

  await assert.rejects(
    attestation({ keys, peerId: "peer-schema", schemaVersion: 2 }),
    /schema/u,
  );
  const { bindingDigest, ...bindingInput } = binding;
  const otherBinding = createPeerStrategyEvidenceBindingV1({
    ...bindingInput,
    feedbackSchemaDigest: digest("other-schema"),
  });
  const mismatched = await attestation({
    keys,
    peerId: "peer-c",
    bindingInput: otherBinding,
  });
  assert.equal(
    (await exchange.admit({ attestation: mismatched, logicalTimeMs: 20 }))
      .status,
    "rejected",
  );
});

test("duplicate replay drains a durable ready successor after restart", async () => {
  const keys = await keyPair();
  const policyRecord = policy();
  const { exchange, store } = runtime({ policyRecord });
  const first = await attestation({ keys, peerId: "peer-a" });
  const second = await attestation({
    keys,
    peerId: "peer-a",
    sequence: 2,
    predecessorAttestationDigest: first.attestationDigest,
  });
  const third = await attestation({
    keys,
    peerId: "peer-a",
    sequence: 3,
    predecessorAttestationDigest: second.attestationDigest,
  });
  await exchange.admit({ attestation: first, logicalTimeMs: 20 });
  await exchange.admit({ attestation: second, logicalTimeMs: 20 });
  const current = await exchange.loadState();
  const interrupted = createPeerStrategyEvidenceStateV1({
    stateKey: current.stateKey,
    exchangerId: current.exchangerId,
    exchangerVersion: current.exchangerVersion,
    implementationId: current.implementationId,
    policy: policyRecord,
    revision: current.revision + 1,
    logicalTimeHighWaterMs: current.logicalTimeHighWaterMs,
    sourceHeads: current.sourceHeads,
    attestations: current.attestations,
    pendingAttestations: [third],
    certificates: current.certificates,
    predecessorStateDigest: current.predecessorStateDigest,
  });
  assert.equal(
    await store.save({
      state: interrupted,
      expectedRevision: current.revision,
    }),
    true,
  );
  assert.equal(
    (await exchange.admit({ attestation: second, logicalTimeMs: 20 })).status,
    "duplicate",
  );
  const recovered = await exchange.loadState();
  assert.equal(recovered.pendingAttestations.length, 0);
  assert.equal(recovered.sourceHeads[0].issuerSequence, 3);
});

test("one authenticated instance cannot rotate streams to exhaust source heads", async () => {
  const keys = await keyPair();
  const { exchange } = runtime({
    policyRecord: policy({
      limits: {
        ...policy().policy.limits,
        maximumSourceHeads: 1,
      },
    }),
  });
  const first = await attestation({
    keys,
    peerId: "peer-a",
    streamId: "peer-a.stream-1",
  });
  assert.equal(
    (await exchange.admit({ attestation: first, logicalTimeMs: 20 })).status,
    "admitted",
  );
  for (const streamId of ["peer-a.stream-2", "peer-a.stream-3"]) {
    const rotated = await attestation({ keys, peerId: "peer-a", streamId });
    const decision = await exchange.admit({
      attestation: rotated,
      logicalTimeMs: 20,
    });
    assert.equal(decision.status, "rejected");
    assert.ok(decision.reasonCodes.includes("source_stream_changed"));
  }
  assert.equal((await exchange.loadState()).sourceHeads.length, 1);
});

test("pending predecessor evidence does not reserve an undocumented source-head slot", async () => {
  const [firstKeys, pendingKeys] = await Promise.all([keyPair(), keyPair()]);
  const { exchange } = runtime({
    policyRecord: policy({
      limits: {
        ...policy().policy.limits,
        maximumSourceHeads: 1,
      },
    }),
  });
  const first = await attestation({ keys: firstKeys, peerId: "peer-a" });
  assert.equal(
    (await exchange.admit({ attestation: first, logicalTimeMs: 20 })).status,
    "admitted",
  );

  const pending = await attestation({
    keys: pendingKeys,
    peerId: "peer-b",
    sequence: 2,
    predecessorAttestationDigest: digest("peer-b-missing-predecessor"),
  });
  const pendingDecision = await exchange.admit({
    attestation: pending,
    logicalTimeMs: 20,
  });
  assert.equal(pendingDecision.status, "pending_predecessor");
  assert.ok(pendingDecision.reasonCodes.includes("predecessor_missing"));
  assert.equal((await exchange.loadState()).sourceHeads.length, 1);

  const predecessor = await attestation({
    keys: pendingKeys,
    peerId: "peer-b",
  });
  const capacityDecision = await exchange.admit({
    attestation: predecessor,
    logicalTimeMs: 21,
  });
  assert.equal(capacityDecision.status, "rejected");
  assert.ok(
    capacityDecision.reasonCodes.includes("source_head_capacity_exceeded"),
  );
  const state = await exchange.loadState();
  assert.equal(state.sourceHeads.length, 1);
  assert.equal(state.pendingAttestations.length, 1);
});

test("a newer membership epoch rotates one peer head without consuming churn capacity", async () => {
  const keys = await keyPair();
  const policyRecord = policy({
    limits: {
      ...policy().policy.limits,
      maximumSourceHeads: 1,
    },
  });
  const { exchange } = runtime({ policyRecord });
  const first = await attestation({
    keys,
    peerId: "peer-a",
    instanceId: "peer-a.instance-1",
    streamId: "peer-a.stream-1",
  });
  await exchange.admit({ attestation: first, logicalTimeMs: 20 });
  const rotated = await attestation({
    keys,
    peerId: "peer-a",
    instanceId: "peer-a.instance-2",
    streamId: "peer-a.stream-2",
    membershipEpoch: 2,
    membershipConfigurationDigest: digest("membership-2"),
  });
  const decision = await exchange.admit({
    attestation: rotated,
    logicalTimeMs: 20,
  });
  assert.equal(decision.status, "admitted");
  assert.ok(decision.reasonCodes.includes("source_epoch_rotated"));
  const state = await exchange.loadState();
  assert.equal(state.sourceHeads.length, 1);
  assert.equal(state.sourceHeads[0].issuerInstanceId, "peer-a.instance-2");
  assert.equal(state.sourceHeads[0].membershipEpoch, 2);
  assert.deepEqual(
    state.attestations.map(({ attestationDigest }) => attestationDigest),
    [rotated.attestationDigest],
  );
});

test("certificates require independent peers, use lower medians, and priors are re-evaluated", async () => {
  const keys = await Promise.all([keyPair(), keyPair(), keyPair()]);
  const admitted = new Set(["peer-a", "peer-b", "peer-c"]);
  const { exchange } = runtime({ currentEligibility: admitted });
  const values = [200_000, 500_000, 900_000];
  for (let index = 0; index < keys.length; index += 1) {
    const current = await attestation({
      keys: keys[index],
      peerId: `peer-${String.fromCharCode(97 + index)}`,
      metricValue: values[index],
      confidenceBps: 6_000 + index * 1_000,
    });
    assert.equal(
      (await exchange.admit({ attestation: current, logicalTimeMs: 20 }))
        .status,
      "admitted",
    );
  }
  const certificate = await exchange.certify({
    cohort,
    binding,
    logicalTimeMs: 30,
  });
  assert.equal(certificate.status, "certified");
  assert.equal(certificate.certificate.metrics[0].valueMicros, 500_000);
  assert.equal(certificate.certificate.confidenceBps, 7_000);
  const priors = await exchange.resolvePriors({
    cohort,
    binding,
    logicalTimeMs: 30,
  });
  assert.equal(priors.length, 1);
  assert.equal(priors[0].influenceBps, 2_800);

  admitted.delete("peer-c");
  const reevaluated = await exchange.resolvePriors({
    cohort,
    binding,
    logicalTimeMs: 31,
  });
  assert.deepEqual(reevaluated, []);
});

test("independence-group threshold does not count correlated peers twice", async () => {
  const keys = await Promise.all([keyPair(), keyPair(), keyPair()]);
  const { exchange } = runtime({
    groupFor: (current) =>
      current.issuerPeerId === "peer-c" ? "group-c" : "group-shared",
  });
  for (let index = 0; index < keys.length; index += 1) {
    const current = await attestation({
      keys: keys[index],
      peerId: `peer-${String.fromCharCode(97 + index)}`,
    });
    await exchange.admit({ attestation: current, logicalTimeMs: 20 });
  }
  const certificate = await exchange.certify({
    cohort,
    binding,
    logicalTimeMs: 30,
  });
  assert.equal(certificate.status, "insufficient_evidence");
  assert.ok(
    certificate.reasonCodes.includes("insufficient_independence_groups"),
  );
});

test("stores use CAS and handoff is predecessor-bound and idempotent", async () => {
  const keys = await keyPair();
  const source = runtime({ stateKey: "source" });
  const first = await attestation({ keys });
  await source.exchange.admit({ attestation: first, logicalTimeMs: 20 });
  const sourceState = await source.exchange.loadState();
  assert.equal(
    await source.store.save({ state: sourceState, expectedRevision: 99 }),
    false,
  );
  const handoff = await source.exchange.exportHandoff({
    targetStateKey: "target",
    logicalTimeMs: 30,
  });
  const target = runtime({ stateKey: "target" });
  const restored = await target.exchange.importHandoff({
    handoff,
    logicalTimeMs: 31,
  });
  assert.equal(restored.predecessorStateDigest, handoff.sourceStateDigest);
  assert.equal(
    (await target.exchange.importHandoff({ handoff, logicalTimeMs: 31 }))
      .stateDigest,
    restored.stateDigest,
  );
});

test("collective-sync adapter preserves causal record binding and detects tampering", async () => {
  const keys = await keyPair();
  const signed = await attestation({ keys });
  const adapter = createPeerStrategyEvidenceCollectiveSyncAdapterV1({
    scope: {
      tenantId: "tenant",
      meshId: "mesh",
      policyDomainId: "policy-domain",
    },
    crypto,
  });
  const record = await adapter.toRecord({
    attestation: signed,
    predecessorRecordDigest: null,
  });
  assert.equal(
    (await adapter.fromRecord({ record }))?.attestationDigest,
    signed.attestationDigest,
  );
  assert.equal(
    await adapter.fromRecord({
      record: { ...record, payloadDigest: digest("tampered") },
    }),
    null,
  );
});

test("collective-sync adapter records append through the collective-sync repository", async () => {
  const keys = await keyPair();
  const signed = await attestation({ keys });
  const adapter = createPeerStrategyEvidenceCollectiveSyncAdapterV1({
    scope: {
      tenantId: "tenant",
      meshId: "mesh",
      policyDomainId: "policy-domain",
    },
    crypto,
  });
  const record = await adapter.toRecord({
    attestation: signed,
    predecessorRecordDigest: null,
  });
  const repository = new InMemoryCollectiveSyncRepositoryV1({
    tenantId: "tenant",
    meshId: "mesh",
    peerId: "peer-repository",
    instanceId: "peer-repository.instance",
    policyDomainId: "policy-domain",
  });
  const membership = {
    epoch: 1,
    configurationDigest: digest("membership"),
    memberPeerIds: ["peer-a", "peer-repository"],
    memberInstances: [
      { peerId: "peer-a", instanceId: "peer-a.instance" },
      { peerId: "peer-repository", instanceId: "peer-repository.instance" },
    ],
  };
  const appended = await repository.append({
    syncDomain: adapter.syncDomain,
    membership,
    records: [record],
  });
  assert.deepEqual(appended.acceptedRecordDigests, [record.recordDigest]);
  assert.equal(
    (
      await repository.readRecord({
        syncDomain: adapter.syncDomain,
        streamId: record.streamId,
        sequence: record.sequence,
      })
    )?.recordDigest,
    record.recordDigest,
  );
});

test("gossip converts digest representations and bounds fanout and hops", () => {
  const profile = meshSparseOverlayProfileV2("large-5000");
  const makeState = (peerIndex) =>
    createMeshSparseRoutingStateV2({
      schemaVersion: 2,
      profile,
      view: createMeshSparsePeerViewV2({
        schemaVersion: 2,
        profile,
        topologySeed: 19,
        peerIndex,
      }),
    });
  const payloadDigest = digest("gossip-payload");
  assert.equal(
    fromMeshSparseDigestV2(toMeshSparseDigestV2(payloadDigest)),
    payloadDigest,
  );
  const published = publishPeerStrategyEvidenceGossipV1({
    profile,
    state: makeState(0),
    payloadDigest,
    logicalTimeMs: 1,
    lifetimeMs: 50,
    policy: {
      maximumFanout: profile.maximumFanout,
      maximumHops: 1,
      maximumLifetimeMs: 100,
    },
  });
  assert.ok(published.deliveries.length <= profile.maximumFanout);
  const delivery = published.deliveries[0];
  assert.throws(
    () =>
      receivePeerStrategyEvidenceGossipV1({
        profile,
        state: makeState(delivery.recipientPeerIndex),
        delivery: { ...delivery, hop: 2 },
        logicalTimeMs: 2,
        policy: {
          maximumFanout: profile.maximumFanout,
          maximumHops: 1,
          maximumLifetimeMs: 100,
        },
      }),
    /hop_limit/u,
  );
});
