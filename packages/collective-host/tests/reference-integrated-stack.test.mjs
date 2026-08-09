import assert from "node:assert/strict";
import test from "node:test";

import {
  createReferenceLocalCapabilityCatalogV1,
  createAutonomousCollectiveCognitiveContextBindingV1,
  createIntegratedSemanticAcceptancePolicyV2,
  DistributedPlanningRuntimeV1,
  DistributedCollectiveProtocolRuntimeV1,
  InMemoryDistributedCollectiveProtocolStoreV1,
  InProcessSparseBftFinalityGatewayV1,
  IntegratedCollectiveHostV2,
  isDistributedCollectiveProtocolBoundToV1,
  isDistributedCollectiveProtocolRuntimeV1,
  isVerifiedSparseBftFinalityBoundToV1,
  isVerifiedSparseBftFinalityRuntimeV1,
  ReferenceAdaptationInvariantGateV1,
  ReferenceLocalCatalogRuntimeV1,
  ReferenceOperationalCognitiveExecutionPortV1,
  VerifiedSparseBftFinalityRuntimeV1,
} from "../dist/index.js";
import { createDistributedDecompositionPolicyV1 } from "../../collective-planning/dist/distributed-decomposition.js";
import {
  createSparseCommitteePolicyV2,
  sparseAggregateSignerSetDigestV2,
} from "../../collective-quorum/dist/sparse-agreement.js";
import { createStrategicAllocationPolicyV1 } from "../../collective-runtime/dist/strategic-allocation.js";
import {
  GovernedAgentLifecycleRuntimeV1,
  GovernedAgentLineageRuntimeV1,
  InMemoryAgentLineageStoreV1,
  collectiveMembershipDigestV1,
  createAgentCreationPolicyV1,
} from "../../collective-membership/dist/index.js";
import {
  AnytimeSemanticGuaranteeEngineV1,
  OperationalCognitiveControllerV1,
  createAnytimeSemanticGuaranteePolicyV1,
  createBlackBoxControlPolicyV1,
  createSemanticHorizonControlPolicyV1,
  createSemanticHorizonControlV1,
  digestBlackBoxContentV1,
} from "../../inference-control/dist/index.js";

const digest = (character) => `sha256:${character.repeat(64)}`;

function distributedPlanningPolicies() {
  return {
    decompositionPolicy: createDistributedDecompositionPolicyV1({
      schemaVersion: 1,
      policyId: "decomposition:snapshot-test",
      policyVersion: 1,
      maximumTasks: 16,
      maximumDepth: 4,
      maximumDependenciesPerTask: 4,
      maximumBudgetUnits: 1_000,
      minimumProposalConfidenceBasisPoints: 0,
      templates: [],
    }),
    allocationPolicy: createStrategicAllocationPolicyV1({
      schemaVersion: 1,
      policyId: "allocation:snapshot-test",
      policyVersion: 1,
      maximumTasksPerPeer: 16,
      maximumTasksPerIndependenceGroup: 16,
      maximumTotalBudgetUnits: 10_000,
      maximumTotalResourceUnits: 10_000,
      maximumCollusionPressureBasisPoints: 10_000,
      maximumCredibilityUncertaintyBasisPoints: 10_000,
      minimumCapabilityConfidenceBasisPoints: 0,
      utilityWeightBasisPoints: 10_000,
      costWeightBasisPoints: 0,
      credibilityWeightBasisPoints: 0,
      capabilityWeightBasisPoints: 0,
      collusionPenaltyWeightBasisPoints: 0,
      falseCommitmentPenaltyBasisPoints: 0,
    }),
  };
}

function allocationEvidencePort() {
  return {
    async verifyCapabilityAttestation() {
      return true;
    },
    async verifyPeerProjection() {
      return true;
    },
  };
}

test("distributed planning snapshots policies, evidence and base invokers at construction", async () => {
  const created = distributedPlanningPolicies();
  const decompositionPolicy = structuredClone(created.decompositionPolicy);
  const allocationPolicy = structuredClone(created.allocationPolicy);
  let capabilityReads = 0;
  let projectionReads = 0;
  const allocationEvidence = {};
  Object.defineProperties(allocationEvidence, {
    verifyCapabilityAttestation: {
      configurable: true,
      enumerable: true,
      get() {
        capabilityReads += 1;
        return async () => true;
      },
    },
    verifyPeerProjection: {
      configurable: true,
      enumerable: true,
      get() {
        projectionReads += 1;
        return async () => true;
      },
    },
  });
  let subclassOverrides = 0;
  class OverridingPlanningRuntime extends DistributedPlanningRuntimeV1 {
    async proposeDecomposition() {
      subclassOverrides += 1;
      return null;
    }
  }
  const genuineProtocol = new DistributedCollectiveProtocolRuntimeV1({
    protocolId: "protocol:planning-authority",
    scopeDigest: digest("a"),
    membershipConfigurationDigest: digest("b"),
    localPeerId: "peer:planning-authority",
    localInstanceId: "instance:planning-authority",
    plane: { async publish() {} },
    artifacts: {
      async put() {},
      async get() {
        return null;
      },
    },
    authenticity: {
      localKeyId: "key:planning-authority",
      async sign(messageDigest) {
        return `signed:${messageDigest}`;
      },
      async verify() {
        return true;
      },
    },
    membership: {
      async verifyPeer() {
        return true;
      },
    },
    store: {
      async load() {
        return null;
      },
      async save() {
        return true;
      },
    },
  });
  const runtime = new OverridingPlanningRuntime({
    protocol: genuineProtocol,
    decompositionPolicy,
    allocationPolicy,
    allocationEvidence,
  });

  decompositionPolicy.maximumTasks = 1;
  decompositionPolicy.templates.push({});
  allocationPolicy.maximumTasksPerPeer = 1;
  allocationPolicy.utilityWeightBasisPoints = 0;
  Object.defineProperties(allocationEvidence, {
    verifyCapabilityAttestation: {
      configurable: true,
      value: async () => false,
    },
    verifyPeerProjection: {
      configurable: true,
      value: async () => false,
    },
  });

  assert.equal(capabilityReads, 1);
  assert.equal(projectionReads, 1);
  assert.equal(runtime.options.decompositionPolicy.maximumTasks, 16);
  assert.deepEqual(runtime.options.decompositionPolicy.templates, []);
  assert.equal(runtime.options.allocationPolicy.maximumTasksPerPeer, 16);
  assert.equal(
    runtime.options.allocationPolicy.utilityWeightBasisPoints,
    10_000,
  );
  assert.equal(Object.isFrozen(runtime.options.decompositionPolicy), true);
  assert.equal(
    Object.isFrozen(runtime.options.decompositionPolicy.templates),
    true,
  );
  assert.equal(Object.isFrozen(runtime.options.allocationPolicy), true);
  assert.equal(Object.isFrozen(runtime.options.allocationEvidence), true);
  assert.notEqual(runtime.options.decompositionPolicy, decompositionPolicy);
  assert.notEqual(runtime.options.allocationPolicy, allocationPolicy);
  assert.notEqual(runtime.options.allocationEvidence, allocationEvidence);
  for (const method of [
    "proposeDecomposition",
    "reconcileDecompositions",
    "commitBid",
    "revealBid",
    "decideAllocation",
    "settleAward",
  ]) {
    const descriptor = Object.getOwnPropertyDescriptor(runtime, method);
    assert.equal(descriptor?.writable, false);
    assert.equal(descriptor?.configurable, false);
  }
  await assert.rejects(
    runtime.proposeDecomposition({}),
    /distributed planning cycle schema is invalid/u,
  );
  assert.equal(subclassOverrides, 0);

  assert.throws(
    () =>
      new DistributedPlanningRuntimeV1({
        protocol: genuineProtocol,
        decompositionPolicy: {
          ...created.decompositionPolicy,
          maximumTasks: 1,
        },
        allocationPolicy: created.allocationPolicy,
        allocationEvidence: allocationEvidencePort(),
      }),
    /decomposition policy digest mismatch/u,
  );
  assert.throws(
    () =>
      new DistributedPlanningRuntimeV1({
        protocol: genuineProtocol,
        decompositionPolicy: created.decompositionPolicy,
        allocationPolicy: {
          ...created.allocationPolicy,
          maximumTasksPerPeer: 1,
        },
        allocationEvidence: allocationEvidencePort(),
      }),
    /allocation policy digest mismatch/u,
  );
});

test("integrated host snapshots semantic acceptance before verification", async () => {
  const lineageFixture = await activeCatalogLineage();
  const semanticAcceptance = structuredClone(
    await createIntegratedSemanticAcceptancePolicyV2({
      policyId: "semantic-acceptance:host-snapshot-test",
      policyVersion: 1,
      minimumSamples: 1,
      minimumRoleCoherenceLowerBasisPoints: 0,
      minimumMissionAlignmentLowerBasisPoints: 0,
      maximumContextConflictUpperBasisPoints: 10_000,
      maximumUncertaintyUpperBasisPoints: 10_000,
      minimumCourseActionDiversityLowerBasisPoints: 0,
      minimumCourseActionNoveltyLowerBasisPoints: 0,
      requireCourseActionDiversity: false,
      requireCourseActionNovelty: false,
    }),
  );
  const host = new IntegratedCollectiveHostV2({
    hostId: "host:snapshot-test",
    peerId: "peer:snapshot-test",
    scopeDigest: digest("1"),
    rules: {},
    credibility: {},
    decomposer: {},
    semanticGuarantees: {},
    semanticAcceptance,
    cognitive: {},
    roles: {},
    lineage: lineageFixture.runtime,
    finality: {
      async certify() {
        return null;
      },
      async verify() {
        return false;
      },
    },
  });

  semanticAcceptance.minimumSamples = 100_000;
  semanticAcceptance.policyDigest = digest("f");

  assert.equal(host.options.semanticAcceptance.minimumSamples, 1);
  assert.notEqual(host.options.semanticAcceptance, semanticAcceptance);
  assert.equal(Object.isFrozen(host.options.semanticAcceptance), true);
  const initialized = await host.initialize();
  assert.equal(initialized.hostId, "host:snapshot-test");
});

function operationalController(
  inference,
  Controller = OperationalCognitiveControllerV1,
) {
  const metric = (direction) => ({
    direction,
    errorBudgetPpm: 10_000,
    missingness: "worst_case_imputation",
  });
  const guaranteePolicy = createAnytimeSemanticGuaranteePolicyV1({
    policyId: "guarantee:reference-stack",
    familywiseErrorBudgetPpm: 60_000,
    minimumInferenceSamples: 1,
    metrics: {
      roleCoherence: metric("higher_is_better"),
      missionAlignment: metric("higher_is_better"),
      contextConflict: metric("lower_is_better"),
      uncertainty: metric("lower_is_better"),
      courseActionDiversity: metric("higher_is_better"),
      courseActionNovelty: metric("higher_is_better"),
    },
    assumptions: { assumptionEvidenceDigests: [] },
  });
  const horizonPolicy = createSemanticHorizonControlPolicyV1({
    expectedGuaranteePolicyDigest: guaranteePolicy.policyDigest,
    expectedAssumptionsDigest: guaranteePolicy.assumptions.assumptionsDigest,
    nominalHorizonSteps: 8,
    cautionHorizonSteps: 2,
    replanHorizonSteps: 1,
    thresholds: Object.fromEntries(
      [
        "roleCoherence",
        "missionAlignment",
        "contextConflict",
        "uncertainty",
        "courseActionDiversity",
        "courseActionNovelty",
      ].map((name) => [name, { thresholdBasisPoints: 5_000, enabled: false }]),
    ),
  });
  const observer = (kind) => ({
    observerId: `observer:${kind}`,
    observerVersion: 1,
    observerImplementationDigest: digest("1"),
    kind,
    async observe() {
      return { valueBasisPoints: 9_000, evidenceDigests: [], reasonCodes: [] };
    },
  });
  const roleReinforcement = "Follow the governed mission role.";
  return new Controller({
    controlId: "control:reference-stack",
    mode: "black_box",
    guaranteeStateKey: "guarantee-state:reference-stack",
    blackBoxPolicy: createBlackBoxControlPolicyV1({
      maximumContextTokens: 128,
      maximumContextItems: 8,
      maximumContextItemBytes: 4_096,
      minimumTrustBasisPoints: 5_000,
      maximumRiskBasisPoints: 5_000,
      maximumItemsPerIndependenceGroup: 2,
      allowedToolNames: [],
      protectedZones: ["authority"],
      roleReinforcement,
      roleReinforcementDigest: digestBlackBoxContentV1(roleReinforcement),
    }),
    observers: {
      coherence: observer("coherence"),
      objective: observer("objective_alignment"),
      context: observer("context_conflict"),
      uncertainty: observer("uncertainty"),
    },
    intervention: {
      async gateCheckpoint() {
        return {
          allowed: true,
          assessments: [],
          state: { stateDigest: digest("2") },
        };
      },
      async gateOperation() {
        return {
          allowed: true,
          assessments: [],
          state: { stateDigest: digest("2") },
        };
      },
    },
    guarantee: new AnytimeSemanticGuaranteeEngineV1({
      policy: guaranteePolicy,
    }),
    horizonControl: createSemanticHorizonControlV1(horizonPolicy),
    inference,
  });
}

test("reference invariant gate enforces local risk and authority ceilings", async () => {
  const invariants = {
    maximumRiskBasisPoints: 2_000,
    allowedDomains: ["strategy"],
    allowedAuthorityCeilingDigests: [digest("3")],
  };
  const gate = new ReferenceAdaptationInvariantGateV1({
    missionId: "mission:reference",
    policyDigest: digest("1"),
    currentStateDigest: async () => digest("2"),
    invariants,
  });
  const action = {
    schemaVersion: 1,
    actionId: "action:1",
    domain: "strategy",
    subjectId: "subject:1",
    predecessorDigest: digest("4"),
    candidateDigest: digest("5"),
    rollbackDigest: digest("6"),
    authorityCeilingDigest: digest("3"),
    evidenceDigests: [],
    expectedBenefitBasisPoints: 3_000,
    maximumRiskBasisPoints: 1_000,
    actionDigest: digest("7"),
  };
  const signal = {
    schemaVersion: 1,
    signalId: "signal:1",
    missionId: "mission:reference",
    sourcePeerId: "peer:1",
    sourceInstanceId: "instance:1",
    sourceKeyId: "key:1",
    membershipConfigurationDigest: digest("8"),
    sourceIndependenceGroupId: "group:1",
    kind: "objective_progress",
    severityBasisPoints: 5_000,
    confidenceBasisPoints: 9_000,
    subjectDigest: digest("9"),
    evidenceDigests: [],
    observedAtLogicalMs: 10,
    signalDigest: digest("a"),
  };

  const allowed = await gate.evaluate({
    cycleId: "cycle:1",
    actions: [action],
    signals: [signal],
    logicalTimeMs: 10,
  });
  assert.equal(allowed.disposition, "allow");
  assert.match(allowed.decisionDigest, /^sha256:[0-9a-f]{64}$/u);
  invariants.maximumRiskBasisPoints = 10_000;
  invariants.allowedDomains.push("team");
  invariants.allowedAuthorityCeilingDigests.push(digest("f"));
  assert.equal(gate.options.invariants.maximumRiskBasisPoints, 2_000);
  assert.equal(Object.isFrozen(gate.options.invariants), true);

  const denied = await gate.evaluate({
    cycleId: "cycle:2",
    actions: [{ ...action, maximumRiskBasisPoints: 2_001 }],
    signals: [signal],
    logicalTimeMs: 11,
  });
  assert.equal(denied.disposition, "deny");
  assert.deepEqual(denied.reasonCodes, ["risk_ceiling_exceeded"]);
});

test("verified finality rejects a gateway certificate without real shard proof", async () => {
  const binding = digest("b");
  const membershipDigest = digest("c");
  const policyDigest = digest("d");
  const malformed = {
    schemaVersion: 2,
    certificateId: "sparse-finality:malformed",
    coordinateDigest: digest("e"),
    proposalDigest: binding,
    valueDigest: binding,
    epoch: 1,
    membershipConfigurationDigest: membershipDigest,
    policyDigest,
    requiredShardIds: ["shard:1"],
    shardCertificateDigests: [],
    shardCertificateRootDigest: digest("f"),
    reconciliationCertificate: {},
    finalizedAtLogicalMs: 5,
    certificateDigest: digest("0"),
  };
  const finality = new VerifiedSparseBftFinalityRuntimeV1({
    membership: {
      schemaVersion: 2,
      epoch: 1,
      configurationDigest: membershipDigest,
      selectionSeedDigest: digest("1"),
      validators: [],
    },
    policy: {
      schemaVersion: 2,
      policyId: "policy:1",
      policyVersion: 1,
      committeeSize: 4,
      faultThreshold: 1,
      reconciliationCommitteeSize: 4,
      reconciliationFaultThreshold: 1,
      maximumCommittees: 1,
      maximumValidatorsPerIndependenceGroup: 1,
      policyDigest,
    },
    signatures: {
      algorithm: "test",
      verifyShare: async () => true,
      aggregate: async () => null,
      verifyAggregate: async () => true,
    },
    gateway: {
      certify: async () => ({ certificate: malformed, shardCertificates: [] }),
      shardCertificates: async () => [],
    },
  });

  assert.equal(
    await finality.adaptation.verify({
      certificate: malformed,
      bundleDigest: binding,
      logicalTimeMs: 5,
    }),
    false,
  );

  await assert.rejects(
    finality.execution.certifyExecution({
      executionId: "execution:incomplete-horizon",
      decisionDigest: digest("1"),
      graphDigest: digest("2"),
      allocationPlanDigest: digest("3"),
      awardDigest: digest("4"),
      taskDigest: digest("5"),
      planningDecisionDigest: digest("6"),
      planningFinalityCertificateDigest: digest("7"),
      cognitivePayloadDigest: digest("8"),
      cognitiveMetadataDigest: digest("9"),
      cognitiveAuthorityDigest: digest("a"),
      cognitiveRoleBindingDigest: digest("b"),
      cognitiveReceiptDigest: digest("c"),
      outputDigest: digest("d"),
      semanticGuaranteeDigest: digest("e"),
      anytimeSemanticGuaranteeDigest: digest("f"),
      semanticHorizonDecisionDigest: null,
      assessmentDigest: digest("0"),
      effectProposalDigest: digest("1"),
      authorityFenceDigest: null,
      logicalTimeMs: 5,
    }),
    /semantic horizon binding is incomplete/u,
  );

  await assert.rejects(
    finality.planning.certify({
      cycle: { cycleId: "cycle:bound", intentDigest: digest("1") },
      graph: { graphDigest: digest("2") },
      plan: { planDigest: digest("3") },
      decisionDigest: digest("4"),
      admittedMessageDigests: [],
      logicalTimeMs: 5,
    }),
    /not derived from the distributed planning view/,
  );
});

test("distributed protocol captures authority methods and rejects post-construction rebinding", async () => {
  const calls = {
    plane: 0,
    replacementPlane: 0,
    artifactPut: 0,
    artifactGet: 0,
    replacementArtifact: 0,
    sign: 0,
    verify: 0,
    membership: 0,
    replacementAuthority: 0,
  };
  const retained = new Map();
  const storeDelegate = new InMemoryDistributedCollectiveProtocolStoreV1();
  let originalStoreCalls = 0;
  let replacementStoreCalls = 0;
  const store = {
    async load(...args) {
      originalStoreCalls += 1;
      return storeDelegate.load(...args);
    },
    async save(...args) {
      originalStoreCalls += 1;
      return storeDelegate.save(...args);
    },
  };
  const digestMethod = globalThis.crypto.subtle.digest.bind(
    globalThis.crypto.subtle,
  );
  let originalCryptoCalls = 0;
  let replacementCryptoCalls = 0;
  const crypto = {
    subtle: {
      async digest(...args) {
        originalCryptoCalls += 1;
        return digestMethod(...args);
      },
    },
  };
  let planeMethodReads = 0;
  let planePublish = async () => {
    calls.plane += 1;
    return { update: { updateDigest: `sha256:${"A".repeat(43)}` } };
  };
  const plane = {};
  Object.defineProperty(plane, "publish", {
    configurable: true,
    get() {
      planeMethodReads += 1;
      return planePublish;
    },
    set(value) {
      planePublish = value;
    },
  });
  const artifacts = {
    async put(message) {
      calls.artifactPut += 1;
      retained.set(message.artifactDigest, structuredClone(message));
    },
    async get(artifactDigest) {
      calls.artifactGet += 1;
      return retained.get(artifactDigest) ?? null;
    },
  };
  const authenticity = {
    localKeyId: "key:captured",
    async sign(messageDigest) {
      calls.sign += 1;
      return `signed:${messageDigest}`;
    },
    async verify(input) {
      calls.verify += 1;
      return input.signature === `signed:${input.messageDigest}`;
    },
  };
  const membership = {
    async verifyPeer() {
      calls.membership += 1;
      return true;
    },
  };
  const options = {
    protocolId: "protocol:captured",
    scopeDigest: digest("1"),
    membershipConfigurationDigest: digest("2"),
    localPeerId: "peer:captured",
    localInstanceId: "instance:captured",
    plane,
    artifacts,
    authenticity,
    membership,
    store,
    crypto,
  };
  const optionReads = new Map();
  const runtime = new DistributedCollectiveProtocolRuntimeV1(
    new Proxy(options, {
      get(target, property, receiver) {
        optionReads.set(property, (optionReads.get(property) ?? 0) + 1);
        return Reflect.get(target, property, receiver);
      },
    }),
  );
  let subclassOverrideCalls = 0;
  class OverridingProtocol extends DistributedCollectiveProtocolRuntimeV1 {
    async publish() {
      subclassOverrideCalls += 1;
      throw new Error("subclass protocol override must not run");
    }
  }
  const subclass = new OverridingProtocol({
    protocolId: "protocol:subclass",
    scopeDigest: digest("1"),
    membershipConfigurationDigest: digest("2"),
    localPeerId: "peer:captured",
    localInstanceId: "instance:captured",
    plane,
    artifacts,
    authenticity,
    membership,
    store,
    crypto,
  });

  assert.equal(isDistributedCollectiveProtocolRuntimeV1(runtime), true);
  assert.equal(isDistributedCollectiveProtocolRuntimeV1(subclass), true);
  assert.equal(
    isDistributedCollectiveProtocolBoundToV1(runtime, {
      plane,
      artifacts,
      authenticity,
      membership,
      crypto,
    }),
    true,
  );
  assert.equal(planeMethodReads, 2);
  for (const property of [
    "protocolId",
    "scopeDigest",
    "membershipConfigurationDigest",
    "localPeerId",
    "localInstanceId",
    "plane",
    "artifacts",
    "authenticity",
    "membership",
    "store",
    "crypto",
  ])
    assert.equal(optionReads.get(property), 1);

  options.protocolId = "protocol:replacement";
  options.plane = {
    async publish() {
      calls.replacementPlane += 1;
      return { update: { updateDigest: `sha256:${"B".repeat(43)}` } };
    },
  };
  plane.publish = async () => {
    calls.replacementPlane += 1;
    return { update: { updateDigest: `sha256:${"C".repeat(43)}` } };
  };
  artifacts.put = artifacts.get = async () => {
    calls.replacementArtifact += 1;
    return null;
  };
  authenticity.localKeyId = "key:replacement";
  authenticity.sign = authenticity.verify = async () => {
    calls.replacementAuthority += 1;
    return false;
  };
  membership.verifyPeer = async () => {
    calls.replacementAuthority += 1;
    return false;
  };
  store.load = store.save = async () => {
    replacementStoreCalls += 1;
    return null;
  };
  crypto.subtle = {
    async digest() {
      replacementCryptoCalls += 1;
      throw new Error("replacement crypto must not run");
    },
  };

  assert.equal(runtime.options.protocolId, "protocol:captured");
  assert.equal(runtime.options.authenticity.localKeyId, "key:captured");
  assert.equal(Object.isFrozen(runtime.options), true);
  assert.equal(Object.isFrozen(runtime.options.plane), true);
  assert.throws(() => {
    runtime.publish = async () => null;
  }, TypeError);
  assert.throws(() => {
    runtime.options.membership.verifyPeer = async () => false;
  }, TypeError);

  const patchedPrototype = async () => {
    calls.replacementAuthority += 1;
    return null;
  };
  Object.defineProperty(
    DistributedCollectiveProtocolRuntimeV1.prototype,
    "publish",
    { value: patchedPrototype, configurable: true },
  );
  try {
    await runtime.initialize(0);
    const message = await runtime.publish({
      cycleId: "cycle:captured",
      streamId: "stream:captured",
      kind: "context.claim",
      payload: { status: "healthy" },
      logicalTimeMs: 1,
      lifetime: 10,
    });
    const messages = await runtime.messages();
    await subclass.initialize(0);
    await subclass.publish({
      cycleId: "cycle:subclass",
      streamId: "stream:subclass",
      kind: "context.claim",
      payload: { status: "healthy" },
      logicalTimeMs: 1,
      lifetime: 10,
    });
    const subclassMessages = await subclass.messages();
    assert.equal(message.protocolId, "protocol:captured");
    assert.equal(message.issuerKeyId, "key:captured");
    assert.equal(messages.length, 1);
    assert.equal(subclassMessages.length, 1);
  } finally {
    delete DistributedCollectiveProtocolRuntimeV1.prototype.publish;
  }

  assert.deepEqual(calls, {
    plane: 2,
    replacementPlane: 0,
    artifactPut: 2,
    artifactGet: 2,
    replacementArtifact: 0,
    sign: 2,
    verify: 2,
    membership: 4,
    replacementAuthority: 0,
  });
  assert.ok(originalStoreCalls > 0);
  assert.equal(replacementStoreCalls, 0);
  assert.ok(originalCryptoCalls > 0);
  assert.equal(replacementCryptoCalls, 0);
  assert.equal(subclassOverrideCalls, 0);
});

test("verified finality retains immutable authority snapshots and frozen ports", async () => {
  const calls = {
    gateway: 0,
    replacementGateway: 0,
    signature: 0,
    replacementSignature: 0,
    crypto: 0,
    replacementCrypto: 0,
  };
  const membership = {
    schemaVersion: 2,
    epoch: 1,
    configurationDigest: digest("3"),
    selectionSeedDigest: digest("4"),
    validators: [],
  };
  const policy = {
    schemaVersion: 2,
    policyId: "policy:captured",
    policyVersion: 1,
    committeeSize: 4,
    faultThreshold: 1,
    reconciliationCommitteeSize: 4,
    reconciliationFaultThreshold: 1,
    maximumCommittees: 1,
    maximumValidatorsPerIndependenceGroup: 1,
    policyDigest: digest("5"),
  };
  const signatures = {
    algorithm: "captured",
    async verifyShare() {
      calls.signature += 1;
      return true;
    },
    async aggregate() {
      calls.signature += 1;
      return null;
    },
    async verifyAggregate() {
      calls.signature += 1;
      return true;
    },
  };
  let certifyReads = 0;
  let certify = async () => {
    calls.gateway += 1;
    return null;
  };
  const gateway = {
    async shardCertificates() {
      calls.gateway += 1;
      return null;
    },
  };
  Object.defineProperty(gateway, "certify", {
    configurable: true,
    get() {
      certifyReads += 1;
      return certify;
    },
    set(value) {
      certify = value;
    },
  });
  const digestMethod = globalThis.crypto.subtle.digest.bind(
    globalThis.crypto.subtle,
  );
  const crypto = {
    subtle: {
      async digest(...args) {
        calls.crypto += 1;
        return digestMethod(...args);
      },
    },
  };
  const finalityInput = {
    membership,
    policy,
    signatures,
    gateway,
    crypto,
  };
  const optionReads = new Map();
  const finality = new VerifiedSparseBftFinalityRuntimeV1(
    new Proxy(finalityInput, {
      get(target, property, receiver) {
        optionReads.set(property, (optionReads.get(property) ?? 0) + 1);
        return Reflect.get(target, property, receiver);
      },
    }),
  );
  let subclassOverrideReads = 0;
  class OverridingFinality extends VerifiedSparseBftFinalityRuntimeV1 {
    get adaptation() {
      subclassOverrideReads += 1;
      return {
        async certify() {
          calls.replacementGateway += 1;
          return null;
        },
      };
    }
  }
  const subclass = new OverridingFinality(finalityInput);

  assert.equal(isVerifiedSparseBftFinalityRuntimeV1(finality), true);
  assert.equal(isVerifiedSparseBftFinalityRuntimeV1(subclass), true);
  assert.equal(
    isVerifiedSparseBftFinalityBoundToV1(finality, {
      membership,
      policy,
      signatures,
      gateway,
      crypto,
    }),
    true,
  );
  assert.equal(certifyReads, 2);
  for (const property of [
    "membership",
    "policy",
    "signatures",
    "gateway",
    "crypto",
  ])
    assert.equal(optionReads.get(property), 1);

  membership.epoch = 9;
  membership.configurationDigest = digest("6");
  policy.policyDigest = digest("7");
  signatures.verifyAggregate = async () => {
    calls.replacementSignature += 1;
    return false;
  };
  gateway.certify = async () => {
    calls.replacementGateway += 1;
    throw new Error("replacement gateway must not run");
  };
  gateway.shardCertificates = async () => {
    calls.replacementGateway += 1;
    throw new Error("replacement gateway must not run");
  };
  crypto.subtle.digest = async () => {
    calls.replacementCrypto += 1;
    throw new Error("replacement crypto must not run");
  };

  assert.equal(finality.options.membership.epoch, 1);
  assert.equal(finality.options.membership.configurationDigest, digest("3"));
  assert.equal(finality.options.policy.policyDigest, digest("5"));
  assert.equal(Object.isFrozen(finality.options.membership), true);
  assert.equal(Object.isFrozen(finality.planning), true);
  assert.equal(Object.isFrozen(finality.execution), true);
  assert.equal(Object.isFrozen(finality.adaptation), true);
  assert.throws(() => {
    finality.adaptation = {};
  }, TypeError);
  assert.throws(() => {
    finality.planning.certify = async () => null;
  }, TypeError);

  assert.equal(
    await finality.adaptation.certify({
      cycleId: "cycle:captured",
      bundleDigest: digest("8"),
      actionDigests: [],
      signalDigests: [],
      safetyDecisionDigest: digest("9"),
      logicalTimeMs: 3,
    }),
    null,
  );
  assert.equal(
    await subclass.adaptation.certify({
      cycleId: "cycle:subclass",
      bundleDigest: digest("8"),
      actionDigests: [],
      signalDigests: [],
      safetyDecisionDigest: digest("9"),
      logicalTimeMs: 3,
    }),
    null,
  );
  await finality.options.signatures.verifyAggregate({});
  await assert.rejects(
    finality.planning.certify({
      cycle: { cycleId: "cycle:crypto", intentDigest: digest("a") },
      graph: { graphDigest: digest("b") },
      plan: { planDigest: digest("c") },
      decisionDigest: digest("d"),
      admittedMessageDigests: [],
      logicalTimeMs: 4,
    }),
    /not derived from the distributed planning view/u,
  );
  assert.deepEqual(calls, {
    gateway: 2,
    replacementGateway: 0,
    signature: 1,
    replacementSignature: 0,
    crypto: 1,
    replacementCrypto: 0,
  });
  assert.equal(subclassOverrideReads, 0);
});

test("local catalog derives eligible bids and content-bound cognitive material", async () => {
  const lineageFixture = await activeCatalogLineage();
  const catalog = await createReferenceLocalCapabilityCatalogV1({
    schemaVersion: 1,
    catalogId: "catalog:1",
    catalogVersion: 1,
    tenantId: "tenant:1",
    localPeerId: "peer:1",
    localInstanceId: "instance:1",
    membershipConfigurationDigest: digest("1"),
    issuerId: "issuer:1",
    issuerKeyDigest: digest("2"),
    independenceGroupId: "group:1",
    bidNonceSeed: "local-secret-seed-for-tests",
    bidValidityMs: 100,
    credibilityStateDigest: digest("3"),
    credibilityScoreBasisPoints: 9_000,
    credibilityUncertaintyBasisPoints: 500,
    collusionPressureBasisPoints: 200,
    entries: [
      {
        entryId: "entry:1",
        agentId: "agent:1",
        lineageDigest: lineageFixture.agent.lineageDigest,
        roleKey: "analyst",
        roleDefinitionDigest: digest("e"),
        capabilityKeys: ["analyze"],
        authorityDigest: digest("4"),
        declaredUtilityMicros: 10_000,
        declaredCostUnits: 2,
        declaredResourceUnits: 3,
        maximumRequestedBudgetUnits: 5,
        collateralUnits: 1,
        resourceCeilingUnits: 10,
        capabilityConfidenceBasisPoints: 9_500,
        validFromLogicalMs: 0,
        validUntilLogicalMs: 1_000,
      },
    ],
  });
  const lifecycleOverrideCalls = {
    createAndEnroll: 0,
    retirePeer: 0,
    eligibility: 0,
  };
  class OverridingLifecycle extends GovernedAgentLifecycleRuntimeV1 {
    async createAndEnroll() {
      lifecycleOverrideCalls.createAndEnroll += 1;
      throw new Error("subclass create+enroll override must not run");
    }

    async retirePeer() {
      lifecycleOverrideCalls.retirePeer += 1;
      throw new Error("subclass retirement override must not run");
    }

    async eligibility() {
      lifecycleOverrideCalls.eligibility += 1;
      return { eligible: false, reasonCode: "agent_inactive" };
    }
  }
  const lineage = lineageFixture.runtime;
  const lifecycle = new OverridingLifecycle({
    lineage,
    registry: {
      current() {
        return {
          epoch: 1,
          configurationDigest: digest("1"),
          members: [{ peerId: "peer:1", instanceId: "instance:1" }],
        };
      },
    },
  });
  assert.throws(() => {
    lifecycle.eligibility = async () => ({
      eligible: false,
      reasonCode: "agent_inactive",
    });
  }, TypeError);
  const mutableCatalog = structuredClone(catalog);
  const local = new ReferenceLocalCatalogRuntimeV1({
    catalog: mutableCatalog,
    lifecycle,
    roles: {
      resolve: async ({
        missionId,
        roleKey,
        agentId,
        requiredCapabilityKeys,
      }) =>
        missionId === "mission:1" &&
        roleKey === "analyst" &&
        agentId === "agent:1" &&
        requiredCapabilityKeys.every((key) => key === "analyze")
          ? {
              roleDefinitionDigest: digest("e"),
              authorityDigest: digest("4"),
              roleBindingDigest: digest("5"),
              validUntilLogicalMs: 1_000,
            }
          : null,
    },
  });
  const task = {
    schemaVersion: 1,
    taskId: "task:1",
    semanticSlotKey: "outcome:0/step:analyze",
    outcomeIndex: 0,
    stepKey: "analyze",
    roleKey: "analyst",
    requiredCapabilityKeys: ["analyze"],
    dependencyTaskDigests: [],
    budgetUnits: 5,
    confidenceBasisPoints: 9_000,
    proposerPeerId: "peer:1",
    proposerInstanceId: "instance:1",
    basisObservationDigests: [],
    predecessorTaskDigest: null,
    taskDigest: digest("6"),
  };
  const intent = {
    missionIntentId: "mission:1",
    intentDigest: digest("7"),
    permittedCapabilityKeys: ["analyze"],
  };
  const cycle = {
    cycleId: "cycle:1",
    allocationId: "allocation:1",
    bidRevealCloseAtLogicalMs: 30,
  };
  const graph = { tasks: [task], graphDigest: digest("8") };
  assert.deepEqual(
    await local.availableRoleKeys({ intent, logicalTimeMs: 10 }),
    ["analyst"],
  );
  mutableCatalog.entries[0].declaredUtilityMicros = 999_999;
  mutableCatalog.entries[0].declaredCostUnits = 999;
  mutableCatalog.entries[0].capabilityConfidenceBasisPoints = 1;
  assert.throws(() => {
    local.options.catalog.entries[0].declaredUtilityMicros = 1;
  }, TypeError);
  const bids = await local.proposeBids({
    intent,
    cycle,
    graph,
    admittedMessages: [],
    localPeerId: "peer:1",
    localInstanceId: "instance:1",
    scopeDigest: digest("9"),
    logicalTimeMs: 10,
  });
  assert.equal(bids[0].declaredUtilityMicros, 10_000);
  assert.equal(bids[0].declaredCostUnits, 2);
  assert.equal(bids[0].attestation.capabilityConfidenceBasisPoints, 9_500);
  assert.deepEqual(lifecycleOverrideCalls, {
    createAndEnroll: 0,
    retirePeer: 0,
    eligibility: 0,
  });
  assert.equal(bids.length, 1);
  assert.equal(
    await local.verifyCapabilityAttestation({
      attestation: bids[0].attestation,
      task: {
        taskId: task.taskId,
        taskDigest: task.taskDigest,
        requiredCapabilityKeys: task.requiredCapabilityKeys,
        requiredIndependenceGroupId: null,
        budgetCeilingUnits: 5,
        collateralFloorUnits: 0,
        dependsOnTaskIds: [],
      },
      logicalTimeMs: 10,
    }),
    true,
  );
  const award = {
    peerId: "peer:1",
    peerInstanceId: "instance:1",
    awardDigest: digest("a"),
    attestationDigest: bids[0].attestation.attestationDigest,
  };
  const prepared = await local.prepare({
    intent,
    cycle,
    graph,
    plan: { planDigest: digest("b"), awards: [award] },
    award,
    task,
    planningFinality: { certificateDigest: digest("c") },
    admittedMessageDigests: [],
    semanticSequence: 1,
    logicalTimeMs: 40,
  });
  assert.equal(prepared.cognitiveRequest.operation, "plan");
  assert.equal(prepared.cognitiveRequest.controlPlaneDigest, digest("c"));
  assert.equal(prepared.cognitiveRequest.payload.awardDigest, digest("a"));
  assert.deepEqual(prepared.cognitiveRequest.payload.task, task);
  const rehydrated = await local.rehydrate({
    cognitiveRequest: prepared.cognitiveRequest,
    contextBinding: {
      ...createAutonomousCollectiveCognitiveContextBindingV1(
        prepared.cognitiveContext.tenant,
      ),
    },
  });
  assert.deepEqual(rehydrated.tenant, prepared.cognitiveContext.tenant);
  assert.equal(rehydrated.signal, prepared.cognitiveContext.signal);
  await assert.rejects(
    local.rehydrate({
      cognitiveRequest: prepared.cognitiveRequest,
      contextBinding: {
        ...createAutonomousCollectiveCognitiveContextBindingV1({
          tenantId: "tenant:other",
        }),
      },
    }),
    /outside the local tenant authority/u,
  );

  let controlledTurns = 0;
  const controller = operationalController({
    async execute() {
      controlledTurns += 1;
      return "model-output";
    },
  });
  const controlled = new ReferenceOperationalCognitiveExecutionPortV1(
    controller,
  );
  assert.equal(controlled.isBoundToController(controller), true);
  const monkeyPatchCalls = { turn: 0, tool: 0, effect: 0 };
  assert.throws(() => {
    controller.runTurn = async () => {
      monkeyPatchCalls.turn += 1;
      return { status: "completed", output: "monkey-patched-output" };
    };
  }, TypeError);
  assert.throws(() => {
    controller.runPreTool = async () => {
      monkeyPatchCalls.tool += 1;
      return { allowed: true };
    };
  }, TypeError);
  assert.throws(() => {
    controller.runPreEffect = async () => {
      monkeyPatchCalls.effect += 1;
      return { allowed: true };
    };
  }, TypeError);
  assert.throws(
    () =>
      new ReferenceOperationalCognitiveExecutionPortV1({
        options: controller.options,
        runTurn: controller.runTurn.bind(controller),
        runPreTool: controller.runPreTool.bind(controller),
        runPreEffect: controller.runPreEffect.bind(controller),
      }),
    /reference execution requires a concrete operational cognitive controller/u,
  );
  const executed = await controlled.execute(
    prepared.cognitiveRequest,
    prepared.cognitiveContext,
  );
  assert.equal(controlledTurns, 1);
  assert.deepEqual(monkeyPatchCalls, { turn: 0, tool: 0, effect: 0 });
  assert.equal(executed.result.status, "completed");
  assert.equal(executed.result.output, "model-output");

  const subclassOverrideCalls = { turn: 0, tool: 0, effect: 0 };
  class OverridingOperationalController extends OperationalCognitiveControllerV1 {
    async runTurn() {
      subclassOverrideCalls.turn += 1;
      return { status: "completed", output: "subclass-output" };
    }

    async runPreTool() {
      subclassOverrideCalls.tool += 1;
      return { allowed: true };
    }

    async runPreEffect() {
      subclassOverrideCalls.effect += 1;
      return { allowed: true };
    }
  }
  const subclassController = operationalController(
    {
      async execute() {
        controlledTurns += 1;
        return "subclass-base-output";
      },
    },
    OverridingOperationalController,
  );
  const subclassControlled = new ReferenceOperationalCognitiveExecutionPortV1(
    subclassController,
  );
  const subclassExecuted = await subclassControlled.execute(
    prepared.cognitiveRequest,
    prepared.cognitiveContext,
  );
  assert.deepEqual(subclassOverrideCalls, { turn: 0, tool: 0, effect: 0 });
  assert.equal(controlledTurns, 2);
  assert.equal(subclassExecuted.result.output, "subclass-base-output");
});

test("in-process gateway runs real shard and reconciliation agreement rounds", async () => {
  const validators = [0, 1, 2, 3].map((index) => ({
    peerId: `p${index}`,
    instanceId: `i${index}`,
    keyId: `k${index}`,
    eligibilityDigest: digest(String(index + 1)),
    independenceGroupId: `g${index}`,
  }));
  const membership = {
    schemaVersion: 2,
    epoch: 1,
    configurationDigest: digest("a"),
    selectionSeedDigest: digest("b"),
    validators,
  };
  const policy = await createSparseCommitteePolicyV2({
    policyId: "policy:in-process",
    policyVersion: 1,
    committeeSize: 4,
    faultThreshold: 1,
    reconciliationCommitteeSize: 4,
    reconciliationFaultThreshold: 1,
    maximumCommittees: 1,
    maximumValidatorsPerIndependenceGroup: 1,
  });
  const signatures = {
    algorithm: "test-signatures-v1",
    verifyShare: async ({ validator, signature }) =>
      signature === `signed:${validator.peerId}`,
    aggregate: async ({ messageDigest, shares }) => {
      const signerPeerIds = shares.map((share) => share.signerPeerId).sort();
      return {
        algorithm: "test-signatures-v1",
        signerPeerIds,
        signerSetDigest: await sparseAggregateSignerSetDigestV2(
          "test-signatures-v1",
          signerPeerIds,
        ),
        value: `aggregate:${messageDigest}`,
      };
    },
    verifyAggregate: async ({ messageDigest, signature }) =>
      signature.value === `aggregate:${messageDigest}`,
  };
  const gateway = new InProcessSparseBftFinalityGatewayV1({
    membership,
    policy,
    signatures,
    signers: validators.map((validator) => ({
      ...validator,
      admitProposal: async ({ decisionId, proposalDigest, valueDigest }) =>
        decisionId === "decision:1" &&
        proposalDigest === digest("c") &&
        valueDigest === digest("d"),
      sign: async () => `signed:${validator.peerId}`,
    })),
  });
  const finalized = await gateway.certify({
    decisionClass: "planning",
    decisionId: "decision:1",
    proposalDigest: digest("c"),
    valueDigest: digest("d"),
    commandBindingDigest: digest("e"),
    evidenceDigests: [],
    logicalTimeMs: 20,
  });
  assert.ok(finalized);
  assert.equal(finalized.certificate.proposalDigest, digest("c"));
  assert.equal(finalized.certificate.valueDigest, digest("d"));
  assert.equal(finalized.shardCertificates.length, 1);
  assert.equal(finalized.shardCertificates[0].phase, "commit");
  assert.equal(
    finalized.certificate.reconciliationCertificate.phase,
    "reconcile",
  );
  assert.equal(
    (
      await gateway.reconcileCertification({
        decisionClass: "planning",
        decisionId: "decision:1",
        proposalDigest: digest("c"),
        valueDigest: digest("d"),
        commandBindingDigest: digest("e"),
        logicalTimeMs: 30,
      })
    ).certificate.certificateDigest,
    finalized.certificate.certificateDigest,
  );
  assert.equal(
    await gateway.reconcileCertification({
      decisionClass: "planning",
      decisionId: "decision:1",
      proposalDigest: digest("c"),
      valueDigest: digest("d"),
      commandBindingDigest: digest("f"),
      logicalTimeMs: 30,
    }),
    null,
  );

  const refusingGateway = new InProcessSparseBftFinalityGatewayV1({
    membership,
    policy,
    signatures,
    signers: validators.map((validator) => ({
      ...validator,
      admitProposal: async () => false,
      sign: async () => `signed:${validator.peerId}`,
    })),
  });
  assert.equal(
    await refusingGateway.certify({
      decisionClass: "planning",
      decisionId: "decision:refused",
      proposalDigest: digest("c"),
      valueDigest: digest("d"),
      evidenceDigests: [],
      logicalTimeMs: 20,
    }),
    null,
  );
});

async function activeCatalogLineage() {
  const policy = await createAgentCreationPolicyV1({
    schemaVersion: 1,
    policyId: "policy:catalog-test",
    policyVersion: 1,
    maximumGeneration: 4,
    maximumChildrenPerAgent: 4,
    maximumActiveDescendants: 8,
    maximumResourceUnitsPerChild: 100,
    maximumInteractionUnitsPerChild: 100,
    allowedAdapterIds: ["adapter:catalog-test"],
    permittedCapabilityKeys: ["analyze"],
    requireRulePolicyInheritance: true,
    requireAuthorityAttenuation: true,
    requestTtlLogicalMs: 100,
    maximumCommitAttempts: 4,
  });
  const body = {
    schemaVersion: 1,
    agentId: "agent:1",
    peerId: "peer:1",
    instanceId: "instance:1",
    parentAgentId: null,
    rootAgentId: "agent:1",
    generation: 0,
    factoryId: "factory:catalog-test",
    adapterId: "adapter:catalog-test",
    adapterVersion: "1.0.0",
    capabilityKeys: ["analyze"],
    roleDefinitionDigest: digest("e"),
    authorityDigest: digest("4"),
    parentAuthorityDigest: null,
    localRuleProgramDigest: digest("6"),
    resourceBudgetUnits: 100,
    interactionBudgetUnits: 100,
    publicKeyId: "key:agent-1",
    publicKey: "public-key-agent-1",
    validFrom: "2030-01-01T00:00:00.000Z",
    validUntil: "2031-01-01T00:00:00.000Z",
    creationCertificateDigest: digest("7"),
    membershipConfigurationDigest: digest("1"),
    membershipEpoch: 1,
    status: "active",
    createdAtLogicalMs: 0,
    terminatedAtLogicalMs: null,
    retirementMembershipConfigurationDigest: null,
    retirementMembershipEpoch: null,
  };
  const agent = {
    ...body,
    lineageDigest: await collectiveMembershipDigestV1({
      domain: "agent-lineage-record-v1",
      body,
    }),
  };
  const stateBody = {
    schemaVersion: 1,
    stateKey: "lineage:catalog-test",
    policyDigest: policy.policyDigest,
    revision: 0,
    fence: 1,
    agents: [agent],
    factoryReceiptDigests: [],
    terminationReceiptDigests: [],
    logicalTimeHighWaterMs: 0,
    previousStateDigest: null,
  };
  const store = new InMemoryAgentLineageStoreV1();
  assert.equal(
    await store.save(
      {
        ...stateBody,
        stateDigest: await collectiveMembershipDigestV1({
          domain: "agent-lineage-state-v1",
          body: stateBody,
        }),
      },
      null,
    ),
    true,
  );
  return {
    agent,
    runtime: new GovernedAgentLineageRuntimeV1({
      stateKey: "lineage:catalog-test",
      policy,
      store,
      factory: {
        factoryId: "factory:catalog-test",
        factoryVersion: 1,
        factoryImplementationDigest: digest("8"),
        async create() {
          throw new Error("not used");
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
    }),
  };
}
