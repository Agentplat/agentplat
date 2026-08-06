import assert from "node:assert/strict";
import test from "node:test";

import { digestPlanningJsonV1 } from "@agentplat/collective-planning";
import { meshSparseOverlayProfileV2 } from "@agentplat/mesh/overlay";
import {
  CapabilityStateFusionRuntimeV1,
  InMemoryCapabilityStateStoreV1,
  createCapabilityStateCapacitySignalV1,
  createCapabilityStateCandidateV1,
  createCapabilityStateFusionRequestV1,
  createCapabilityStateFusionStateV1,
  createCapabilityStatePolicyV1,
  createCapabilityStateReachabilitySignalV1,
  createCapabilityStateRecoverySignalV1,
  createCapabilityStateResolutionPortV1,
  createCapabilityStateRoleSignalV1,
  createCapabilityStateSignalSourceV1,
  createCapabilityStateSignalV1,
  createCapabilityStateTrustSignalV1,
  reduceCapabilityStateFusionV1,
  validateCapabilityStateCandidateV1,
  validateCapabilityStateFusionDecisionV1,
} from "@agentplat/collective-runtime/capability-state";

const implementationDigest = digestPlanningJsonV1("capability-state-signal", {
  implementationId: "test-source",
});

const policy = createCapabilityStatePolicyV1({
  schemaVersion: 1,
  policyId: "capability-policy",
  policyVersion: 1,
  parentPolicyDigest: null,
  requiredDimensions: {
    offer_recipient: ["capacity", "reachability", "trust"],
    bid: ["capacity", "role", "trust"],
    award: ["capacity", "reachability", "trust"],
    assignment_acceptance: ["capacity", "role", "trust"],
    recovery: ["capacity", "reachability", "recovery", "role", "trust"],
  },
  maximumCandidates: 16,
  maximumReasonCodesPerSignal: 8,
  maximumStateHeads: 128,
  maximumDecisionTtlMs: 100,
  maximumCommitAttempts: 4,
});

function candidate(id = "peer-a") {
  return createCapabilityStateCandidateV1({
    schemaVersion: 1,
    candidateId: `candidate.${id}`,
    kind: "peer",
    peerId: id,
    instanceId: `${id}.instance`,
    agentId: null,
    requiredCapabilityKeys: ["mapping"],
    advertisedCapabilityKeys: ["mapping", "planning"],
    sourceEvidenceDigest: digestPlanningJsonV1("capability-state-candidate", {
      id,
    }),
    sourceRecordId: `card.${id}`,
    sourceRevision: 1,
  });
}

function request({
  id = "request-1",
  logicalTimeMs = 10,
  operation = "offer_recipient",
  candidates = [candidate()],
} = {}) {
  return createCapabilityStateFusionRequestV1({
    schemaVersion: 1,
    requestId: id,
    operation,
    scope: {
      tenantId: "tenant",
      meshId: "mesh",
      policyDomainId: "policy-domain",
      missionIntentId: "mission-intent",
      objectiveId: "objective",
      workItemId: "work",
      workItemRevision: 1,
    },
    logicalTimeMs,
    requiredCapabilityKeys: ["mapping"],
    candidates,
  });
}

function binding(
  dimension,
  revision = 1,
  observedAtLogicalMs = 5,
  expiresAtLogicalMs = 50,
) {
  return {
    signalId: `signal.${dimension}.${revision}.${observedAtLogicalMs}.${expiresAtLogicalMs}`,
    sourceId: `source.${dimension}`,
    sourceVersion: 1,
    sourceImplementationDigest: implementationDigest,
    sourceRevision: revision,
    observedAtLogicalMs,
    expiresAtLogicalMs,
  };
}

function eligibleSignals(current, operation = "offer_recipient") {
  const common = { candidate: current };
  const signals = {
    capacity: createCapabilityStateCapacitySignalV1({
      ...common,
      binding: binding("capacity"),
      activeAssignments: 0,
      maximumConcurrency: 2,
      acceptingWork: true,
    }),
    reachability: createCapabilityStateReachabilitySignalV1({
      ...common,
      binding: binding("reachability"),
      routeStatus: "active",
    }),
    recovery: createCapabilityStateRecoverySignalV1({
      ...common,
      binding: binding("recovery"),
      recoveryStatus: "ready",
    }),
    role: createCapabilityStateRoleSignalV1({
      ...common,
      binding: binding("role"),
      roleStatus: "active",
      degraded: false,
    }),
    trust: createCapabilityStateTrustSignalV1({
      ...common,
      binding: binding("trust"),
      trustDisposition: "eligible",
    }),
  };
  return policy.policy.requiredDimensions[operation].map(
    (dimension) => signals[dimension],
  );
}

function initialState() {
  return createCapabilityStateFusionStateV1({
    stateKey: "state",
    fusionId: "fusion",
    fusionVersion: 1,
    implementationId: "fusion-implementation",
    policy,
  });
}

test("fuses every required dimension into one content-bound eligible decision", () => {
  const current = candidate();
  const currentRequest = request({ candidates: [current] });
  const result = reduceCapabilityStateFusionV1({
    state: initialState(),
    policy,
    request: currentRequest,
    signals: eligibleSignals(current),
  });
  assert.equal(result.decision.candidates[0].disposition, "eligible");
  assert.deepEqual(result.decision.candidates[0].reasonCodes, [
    "all_required_dimensions_eligible",
    "capacity_available",
    "route_active",
    "trust_eligible",
  ]);
  assert.equal(result.state.revision, 1);
  assert.equal(result.state.heads.length, 3);
  assert.equal(result.state.lastDecisionDigest, result.decision.decisionDigest);
  assert.equal(
    validateCapabilityStateFusionDecisionV1({
      decision: result.decision,
      request: currentRequest,
      expected: {
        fusionId: "fusion",
        fusionVersion: 1,
        implementationId: "fusion-implementation",
        policyId: policy.policy.policyId,
        policyVersion: policy.policy.policyVersion,
        policyDigest: policy.policyDigest,
      },
      logicalTimeMs: 10,
    }).decisionDigest,
    result.decision.decisionDigest,
  );
});

test("missing, restricted and negative dimensions never become eligible", () => {
  const current = candidate();
  const currentRequest = request({ candidates: [current] });
  const missing = reduceCapabilityStateFusionV1({
    state: initialState(),
    policy,
    request: currentRequest,
    signals: eligibleSignals(current).filter(
      ({ dimension }) => dimension !== "trust",
    ),
  });
  assert.equal(missing.decision.candidates[0].disposition, "unavailable");
  assert.ok(
    missing.decision.candidates[0].reasonCodes.includes("signal_missing:trust"),
  );

  const restrictedTrust = createCapabilityStateTrustSignalV1({
    candidate: current,
    binding: binding("trust"),
    trustDisposition: "restricted",
  });
  const restricted = reduceCapabilityStateFusionV1({
    state: initialState(),
    policy,
    request: currentRequest,
    signals: [
      ...eligibleSignals(current).filter(
        ({ dimension }) => dimension !== "trust",
      ),
      restrictedTrust,
    ],
  });
  assert.equal(restricted.decision.candidates[0].disposition, "restricted");

  const saturated = createCapabilityStateCapacitySignalV1({
    candidate: current,
    binding: binding("capacity"),
    activeAssignments: 2,
    maximumConcurrency: 2,
    acceptingWork: true,
  });
  const ineligible = reduceCapabilityStateFusionV1({
    state: initialState(),
    policy,
    request: currentRequest,
    signals: [
      saturated,
      ...eligibleSignals(current).filter(
        ({ dimension }) => dimension !== "capacity",
      ),
    ],
  });
  assert.equal(ineligible.decision.candidates[0].disposition, "ineligible");
  assert.ok(
    ineligible.decision.candidates[0].reasonCodes.includes(
      "capacity_saturated",
    ),
  );
});

test("expired and future-dated observations fail closed", () => {
  const current = candidate();
  const currentRequest = request({
    candidates: [current],
    logicalTimeMs: 10,
  });
  const expiredTrust = createCapabilityStateTrustSignalV1({
    candidate: current,
    binding: binding("trust", 1, 5, 10),
    trustDisposition: "eligible",
  });
  const result = reduceCapabilityStateFusionV1({
    state: initialState(),
    policy,
    request: currentRequest,
    signals: [
      expiredTrust,
      ...eligibleSignals(current).filter(
        ({ dimension }) => dimension !== "trust",
      ),
    ],
  });
  assert.equal(result.decision.candidates[0].disposition, "unavailable");
  assert.ok(
    result.decision.candidates[0].reasonCodes.includes("signal_expired:trust"),
  );
  assert.equal(
    validateCapabilityStateFusionDecisionV1({
      decision: result.decision,
      request: currentRequest,
      expected: {
        fusionId: "fusion",
        fusionVersion: 1,
        implementationId: "fusion-implementation",
        policyId: policy.policy.policyId,
        policyVersion: policy.policy.policyVersion,
        policyDigest: policy.policyDigest,
      },
      logicalTimeMs: 10,
    }).decisionDigest,
    result.decision.decisionDigest,
  );

  const futureTrust = createCapabilityStateTrustSignalV1({
    candidate: current,
    binding: binding("trust", 1, 11, 50),
    trustDisposition: "eligible",
  });
  const future = reduceCapabilityStateFusionV1({
    state: initialState(),
    policy,
    request: request({ candidates: [current], logicalTimeMs: 10 }),
    signals: [
      futureTrust,
      ...eligibleSignals(current).filter(
        ({ dimension }) => dimension !== "trust",
      ),
    ],
  });
  assert.equal(future.decision.candidates[0].disposition, "unavailable");
  assert.ok(
    future.decision.candidates[0].reasonCodes.includes(
      "signal_future_dated:trust",
    ),
  );
});

test("state rejects logical rollback and same-revision equivocation", () => {
  const current = candidate();
  const first = reduceCapabilityStateFusionV1({
    state: initialState(),
    policy,
    request: request({
      id: "request-first",
      candidates: [current],
      logicalTimeMs: 10,
    }),
    signals: eligibleSignals(current),
  });
  const rollback = reduceCapabilityStateFusionV1({
    state: first.state,
    policy,
    request: request({
      id: "request-rollback",
      candidates: [current],
      logicalTimeMs: 9,
    }),
    signals: eligibleSignals(current),
  });
  assert.equal(rollback.decision.candidates[0].disposition, "unavailable");
  assert.deepEqual(rollback.decision.candidates[0].reasonCodes, [
    "logical_time_rollback",
  ]);

  const { signalDigest: _signalDigest, ...trustBody } = eligibleSignals(
    current,
  ).find(({ dimension }) => dimension === "trust");
  const changedTrust = createCapabilityStateSignalV1({
    ...trustBody,
    signalId: "signal.trust.equivocated",
    disposition: "ineligible",
    reasonCodes: ["trust_ineligible"],
  });
  const equivocation = reduceCapabilityStateFusionV1({
    state: first.state,
    policy,
    request: request({
      id: "request-equivocation",
      candidates: [current],
      logicalTimeMs: 10,
    }),
    signals: [
      changedTrust,
      ...eligibleSignals(current).filter(
        ({ dimension }) => dimension !== "trust",
      ),
    ],
  });
  assert.equal(equivocation.decision.candidates[0].disposition, "ineligible");
  assert.ok(
    equivocation.decision.candidates[0].reasonCodes.includes(
      "signal_equivocation:trust",
    ),
  );
});

test("productive runtime resolves local projections and commits with CAS", async () => {
  const current = candidate();
  const byDimension = new Map(
    eligibleSignals(current).map((signal) => [signal.dimension, signal]),
  );
  const sources = ["capacity", "reachability", "trust"].map((dimension) =>
    createCapabilityStateSignalSourceV1({
      dimension,
      async resolve({ candidate: requested }) {
        assert.equal(requested.candidateDigest, current.candidateDigest);
        return byDimension.get(dimension);
      },
    }),
  );
  const store = new InMemoryCapabilityStateStoreV1(policy);
  const runtime = new CapabilityStateFusionRuntimeV1({
    stateKey: "runtime-state",
    fusionId: "runtime-fusion",
    fusionVersion: 1,
    implementationId: "runtime-implementation",
    policy,
    resolver: createCapabilityStateResolutionPortV1({ sources }),
    store,
  });
  const currentRequest = request({ candidates: [current] });
  const decision = await runtime.evaluate(currentRequest);
  assert.equal(decision.candidates[0].disposition, "eligible");
  assert.equal((await store.load("runtime-state")).revision, 1);
  assert.equal(
    validateCapabilityStateFusionDecisionV1({
      decision,
      request: currentRequest,
      expected: runtime,
      logicalTimeMs: 10,
    }).decisionDigest,
    decision.decisionDigest,
  );
});

test("runtime retries CAS conflicts and preserves rollback heads across restart", async () => {
  const current = candidate();
  const revised = eligibleSignals(current).map(
    ({ signalDigest: _signalDigest, ...signal }) =>
      createCapabilityStateSignalV1({
        ...signal,
        signalId: `${signal.signalId}.revision-2`,
        sourceRevision: 2,
      }),
  );
  const rolledBack = eligibleSignals(current);
  const durableStore = new InMemoryCapabilityStateStoreV1(policy);
  let injectConflict = true;
  let saveAttempts = 0;
  const conflictStore = {
    load: (stateKey) => durableStore.load(stateKey),
    async save(input) {
      saveAttempts += 1;
      if (injectConflict) {
        injectConflict = false;
        return false;
      }
      return durableStore.save(input);
    },
  };
  const runtimeOptions = (signals, store) => ({
    stateKey: "restart-state",
    fusionId: "restart-fusion",
    fusionVersion: 1,
    implementationId: "restart-implementation",
    policy,
    resolver: createCapabilityStateResolutionPortV1({
      sources: ["capacity", "reachability", "trust"].map((dimension) =>
        createCapabilityStateSignalSourceV1({
          dimension,
          async resolve() {
            return signals.find((signal) => signal.dimension === dimension);
          },
        }),
      ),
    }),
    store,
  });
  const firstRuntime = new CapabilityStateFusionRuntimeV1(
    runtimeOptions(revised, conflictStore),
  );
  const first = await firstRuntime.evaluate(
    request({
      id: "request-before-restart",
      candidates: [current],
      logicalTimeMs: 20,
    }),
  );
  assert.equal(first.candidates[0].disposition, "eligible");
  assert.equal(saveAttempts, 2);

  const restartedRuntime = new CapabilityStateFusionRuntimeV1(
    runtimeOptions(rolledBack, durableStore),
  );
  const afterRestart = await restartedRuntime.evaluate(
    request({
      id: "request-after-restart",
      candidates: [current],
      logicalTimeMs: 21,
    }),
  );
  assert.equal(afterRestart.candidates[0].disposition, "unavailable");
  assert.ok(
    afterRestart.candidates[0].reasonCodes.includes(
      "signal_revision_rollback:trust",
    ),
  );
  assert.equal((await durableStore.load("restart-state")).revision, 2);
});

test("candidate and decision digests reject tampering", () => {
  const current = candidate();
  assert.throws(
    () =>
      validateCapabilityStateCandidateV1({
        ...current,
        advertisedCapabilityKeys: ["mapping", "planning", "untrusted"],
      }),
    /digest is invalid/,
  );
  const currentRequest = request({ candidates: [current] });
  const result = reduceCapabilityStateFusionV1({
    state: initialState(),
    policy,
    request: currentRequest,
    signals: eligibleSignals(current),
  });
  assert.throws(
    () =>
      validateCapabilityStateFusionDecisionV1({
        decision: {
          ...result.decision,
          candidates: [
            { ...result.decision.candidates[0], disposition: "eligible" },
          ],
          expiresAtLogicalMs: 1_000,
        },
        request: currentRequest,
        expected: {
          fusionId: "fusion",
          fusionVersion: 1,
          implementationId: "fusion-implementation",
          policyId: policy.policy.policyId,
          policyVersion: policy.policy.policyVersion,
          policyDigest: policy.policyDigest,
        },
        logicalTimeMs: 10,
      }),
    /binding is invalid/,
  );
});

test("adapter mappings preserve role, route and recovery semantics", () => {
  const current = candidate();
  assert.equal(
    createCapabilityStateRoleSignalV1({
      candidate: current,
      binding: binding("role"),
      roleStatus: "realignment_required",
      degraded: true,
    }).disposition,
    "unavailable",
  );
  assert.equal(
    createCapabilityStateReachabilitySignalV1({
      candidate: current,
      binding: binding("reachability"),
      routeStatus: "reserve",
    }).disposition,
    "eligible",
  );
  assert.equal(
    createCapabilityStateRecoverySignalV1({
      candidate: current,
      binding: binding("recovery"),
      recoveryStatus: "unavailable",
    }).disposition,
    "unavailable",
  );
});

test("frontier overlay fusion stays bounded to the local sparse view", () => {
  const profile = meshSparseOverlayProfileV2("frontier-100000");
  const localCandidateCount =
    profile.activeNeighborCount + profile.reserveNeighborCount;
  const scalePolicy = createCapabilityStatePolicyV1({
    ...policy.policy,
    policyId: "frontier-capability-policy",
    maximumCandidates: 64,
    requiredDimensions: {
      offer_recipient: [],
      bid: [],
      award: [],
      assignment_acceptance: [],
      recovery: [],
    },
  });
  const candidates = Array.from({ length: localCandidateCount }, (_, index) =>
    candidate(`peer-${String(index).padStart(3, "0")}`),
  );
  const result = reduceCapabilityStateFusionV1({
    state: createCapabilityStateFusionStateV1({
      stateKey: "frontier-state",
      fusionId: "frontier-fusion",
      fusionVersion: 1,
      implementationId: "frontier-implementation",
      policy: scalePolicy,
    }),
    policy: scalePolicy,
    request: request({
      id: "frontier-request",
      candidates,
      logicalTimeMs: 10,
    }),
    signals: [],
  });
  assert.equal(profile.maximumPeers, 100_000);
  assert.equal(result.decision.candidates.length, localCandidateCount);
  assert.ok(localCandidateCount < 64);
  assert.ok(
    result.decision.candidates.every(
      ({ disposition }) => disposition === "eligible",
    ),
  );
  assert.equal(result.state.heads.length, 0);
});
