import assert from "node:assert/strict";
import test from "node:test";

import { collectiveQuorumDigestV1 } from "../../collective-quorum/dist/index.js";
import {
  AutonomousAdaptationRuntimeV1,
  AutonomousCollectiveNodeRuntimeV1,
  createAutonomousAdaptationActionV1,
  createAutonomousAdaptationPolicyV1,
  createAutonomousMissionSignalV1,
  isAutonomousAdaptationRuntimeV1,
  isAutonomousCollectiveNodeRuntimeV1,
} from "../dist/index.js";

const digest = (character) => `sha256:${character.repeat(64)}`;

test("autonomous adaptation captures authority ports and ignores prototype dispatch", async () => {
  const missionId = "mission:authority-capture";
  const protocol = {
    options: {
      localPeerId: "peer:local",
      localInstanceId: "instance:local",
      membershipConfigurationDigest: digest("a"),
      authenticity: { localKeyId: "key:local" },
    },
    async publish() {},
    async messages() {
      return [message];
    },
  };
  const signal = await createAutonomousMissionSignalV1({
    signalId: "signal:authority-capture",
    missionId,
    sourcePeerId: "peer:local",
    sourceInstanceId: "instance:local",
    sourceKeyId: "key:local",
    membershipConfigurationDigest: digest("a"),
    sourceIndependenceGroupId: "group:local",
    kind: "environment_change",
    severityBasisPoints: 9_000,
    confidenceBasisPoints: 9_000,
    subjectDigest: digest("b"),
    evidenceDigests: [digest("c")],
    observedAtLogicalMs: 10,
  });
  const message = {
    payload: signal,
    issuerPeerId: signal.sourcePeerId,
    issuerInstanceId: signal.sourceInstanceId,
    issuerKeyId: signal.sourceKeyId,
    membershipConfigurationDigest: signal.membershipConfigurationDigest,
    logicalTimeMs: signal.observedAtLogicalMs,
  };
  const policy = await createAutonomousAdaptationPolicyV1({
    policyId: "policy:authority-capture",
    policyVersion: 1,
    minimumSeverityBasisPoints: 1,
    minimumConfidenceBasisPoints: 1,
    minimumIndependentSources: 1,
    observationWindowMs: 100,
    domainCooldownMs: { mission: 0, strategy: 0, role: 0, team: 0 },
    maximumActionsPerCycle: 4,
    maximumEvidenceDigestsPerSignal: 16,
    maximumRetainedSignals: 16,
    maximumRetainedDecisions: 16,
    maximumCommitAttempts: 2,
  });
  const action = await createAutonomousAdaptationActionV1({
    actionId: "action:authority-capture",
    domain: "mission",
    subjectId: missionId,
    predecessorDigest: digest("3"),
    candidateDigest: digest("e"),
    rollbackDigest: digest("f"),
    authorityCeilingDigest: digest("1"),
    evidenceDigests: [signal.signalDigest],
    expectedBenefitBasisPoints: 8_000,
    maximumRiskBasisPoints: 100,
  });
  let state;
  let safetyEvaluations = 0;
  let subclassOverrides = 0;
  let prototypePatches = 0;
  const store = {
    async load() {
      return state ?? null;
    },
    async save(next, expectedRevision) {
      if (
        (expectedRevision === null && state !== undefined) ||
        (expectedRevision !== null && state?.revision !== expectedRevision)
      )
        return false;
      state = structuredClone(next);
      return true;
    },
  };
  const signalAdmission = {
    async admit() {
      return true;
    },
  };
  const planners = ["mission", "strategy", "role", "team"].map((domain) => ({
    domain,
    async propose() {
      return domain === "mission" ? action : null;
    },
  }));
  const safety = {
    async evaluate(input) {
      safetyEvaluations += 1;
      const reasonCodes = ["invariant_denied"];
      const evidenceDigests = [digest("2")];
      return {
        disposition: "deny",
        reasonCodes,
        evidenceDigests,
        decisionDigest: await collectiveQuorumDigestV1({
          domain: "autonomous-adaptation-safety-decision-v1",
          body: {
            cycleId: input.cycleId,
            missionId,
            policyDigest: policy.policyDigest,
            currentStateDigest: digest("3"),
            signalDigests: [signal.signalDigest],
            actionDigests: [action.actionDigest],
            disposition: "deny",
            reasonCodes,
            evidenceDigests,
            logicalTimeMs: input.logicalTimeMs,
          },
        }),
      };
    },
  };
  const finality = {
    async certify() {
      throw new Error("finality must remain gated by safety");
    },
    async verify() {
      throw new Error("finality must remain gated by safety");
    },
  };
  const actuator = {
    async reconcileApply() {
      return null;
    },
    async apply() {
      throw new Error("actuation must remain gated by safety");
    },
    async reconcileRollback() {
      return null;
    },
    async rollback() {
      throw new Error("actuation must remain gated by safety");
    },
  };
  const options = {
    runtimeId: "adaptation:authority-capture",
    missionId,
    protocol,
    currentStateDigest: async () => digest("3"),
    signalAdmission,
    policy,
    planners,
    safety,
    finality,
    actuator,
    store,
  };
  class OverridingAdaptationRuntime extends AutonomousAdaptationRuntimeV1 {
    async initialize() {
      subclassOverrides += 1;
      return null;
    }
    async runCycle() {
      subclassOverrides += 1;
      return null;
    }
    async load() {
      subclassOverrides += 1;
      return null;
    }
  }
  const runtime = new OverridingAdaptationRuntime(options);
  Object.defineProperty(AutonomousAdaptationRuntimeV1.prototype, "runCycle", {
    configurable: true,
    value: async () => {
      prototypePatches += 1;
      return null;
    },
  });

  protocol.messages = async () => [];
  protocol.publish = async () => {
    throw new Error("replacement publish invoked");
  };
  signalAdmission.admit = async () => false;
  safety.evaluate = async () => {
    throw new Error("replacement safety invoked");
  };
  finality.certify = async () => null;
  actuator.apply = async () => ({ applied: true });
  store.load = async () => null;
  store.save = async () => false;
  for (const planner of planners) planner.propose = async () => null;

  await runtime.initialize(0);
  const decision = await runtime.runCycle({
    cycleId: "cycle:authority-capture",
    logicalTimeMs: 10,
  });

  assert.equal(decision.status, "safety_rejected");
  assert.deepEqual(decision.reasonCodes, ["invariant_denied"]);
  assert.equal(safetyEvaluations, 1);
  assert.equal(subclassOverrides, 0);
  assert.equal(prototypePatches, 0);
  assert.equal(isAutonomousAdaptationRuntimeV1(runtime), true);
  assert.equal(Object.isFrozen(runtime.options), true);
  assert.equal(Object.isFrozen(runtime.options.policy), true);
  for (const method of ["initialize", "publishSignal", "runCycle", "load"]) {
    const descriptor = Object.getOwnPropertyDescriptor(runtime, method);
    assert.equal(descriptor?.writable, false);
    assert.equal(descriptor?.configurable, false);
  }
  assert.equal(
    isAutonomousAdaptationRuntimeV1({
      initialize() {},
      publishSignal() {},
      runCycle() {},
      load() {},
    }),
    false,
  );
  delete AutonomousAdaptationRuntimeV1.prototype.runCycle;
});

test("autonomous node rejects structurally forged protocol and planning authority", async () => {
  let protocolInitializations = 0;
  let adaptationInitializations = 0;
  let protocolInitialized = false;
  let adaptationInitialized = false;
  let failFirstNodeSave = true;
  let receiveCalls = 0;
  let subclassOverrides = 0;
  let prototypePatches = 0;
  let state;
  const protocol = {
    options: {
      localPeerId: "peer:node",
      localInstanceId: "instance:node",
      scopeDigest: digest("4"),
      membershipConfigurationDigest: digest("5"),
      authenticity: { localKeyId: "key:node" },
    },
    async initialize() {
      if (protocolInitialized) throw new Error("protocol already initialized");
      protocolInitialized = true;
      protocolInitializations += 1;
    },
    async receive() {
      receiveCalls += 1;
      return { disposition: "duplicate" };
    },
    async load() {
      if (!protocolInitialized) throw new Error("protocol is not initialized");
      return {};
    },
    async publish() {},
    async messages() {
      return [];
    },
  };
  const planning = {
    options: {
      protocol,
      decompositionPolicy: { maximumBudgetUnits: 1_000 },
    },
    async proposeDecomposition() {},
    async reconcileDecompositions() {},
    async commitBid() {},
    async revealBid() {},
    async decideAllocation() {},
    async settleAward() {},
  };
  const execution = {
    options: { localPeerId: "peer:node" },
    async execute() {},
  };
  const adaptation = {
    options: { protocol, missionId: "mission:node" },
    async initialize() {
      if (adaptationInitialized)
        throw new Error("adaptation already initialized");
      adaptationInitialized = true;
      adaptationInitializations += 1;
    },
    async publishSignal() {},
    async runCycle() {},
    async load() {
      if (!adaptationInitialized)
        throw new Error("adaptation is not initialized");
      return {};
    },
  };
  const localPlanning = {
    async availableRoleKeys() {
      return [];
    },
    async proposeBids() {
      return [];
    },
  };
  const planningFinality = {
    async certify() {
      return null;
    },
    async verify() {
      return false;
    },
  };
  const taskMaterializer = { async prepare() {} };
  const store = {
    async load() {
      return state ?? null;
    },
    async save(next) {
      if (failFirstNodeSave) {
        failFirstNodeSave = false;
        throw new Error("simulated node save crash");
      }
      state = structuredClone(next);
      return true;
    },
    async reserveAdvance() {
      return null;
    },
    async assertAdvanceFence() {
      return true;
    },
    async saveAdvance() {
      return false;
    },
    async releaseAdvance() {
      return true;
    },
    async runAdvanceCommand(input) {
      return input.effect();
    },
  };
  const policy = {
    schemaVersion: 1,
    graphProposalWindowMs: 10,
    bidCommitmentWindowMs: 10,
    bidRevealWindowMs: 10,
    messageLifetimeMs: 100,
    maximumLocalBids: 4,
    maximumAdmittedEvidenceMessages: 16,
  };
  const options = {
    runtimeId: "node:authority-capture",
    protocol,
    planning,
    execution,
    adaptation,
    localPlanning,
    planningFinality,
    taskMaterializer,
    policy,
    store,
  };
  assert.throws(
    () => new AutonomousCollectiveNodeRuntimeV1(options),
    /concrete distributed collective (protocol|planning)/u,
  );
  return;
  class OverridingNodeRuntime extends AutonomousCollectiveNodeRuntimeV1 {
    async initialize() {
      subclassOverrides += 1;
      return null;
    }
    async receive() {
      subclassOverrides += 1;
      return null;
    }
  }
  const node = new OverridingNodeRuntime(options);
  Object.defineProperty(
    AutonomousCollectiveNodeRuntimeV1.prototype,
    "receive",
    {
      configurable: true,
      value: async () => {
        prototypePatches += 1;
        return null;
      },
    },
  );

  protocol.initialize = async () => {
    throw new Error("replacement protocol initialize invoked");
  };
  protocol.receive = async () => {
    throw new Error("replacement protocol receive invoked");
  };
  adaptation.initialize = async () => {
    throw new Error("replacement adaptation initialize invoked");
  };
  planning.proposeDecomposition = async () => {
    throw new Error("replacement planning invoked");
  };
  execution.execute = async () => {
    throw new Error("replacement execution invoked");
  };
  localPlanning.availableRoleKeys = async () => {
    throw new Error("replacement local planning invoked");
  };
  planningFinality.verify = async () => true;
  taskMaterializer.prepare = async () => {
    throw new Error("replacement materializer invoked");
  };
  store.save = async () => false;
  policy.graphProposalWindowMs = 1;

  await assert.rejects(node.initialize(0), /simulated node save crash/u);
  const initialized = await node.initialize(0);
  const received = await node.receive({}, 1);

  assert.equal(initialized.status, "idle");
  assert.deepEqual(received, { disposition: "duplicate" });
  assert.equal(protocolInitializations, 1);
  assert.equal(adaptationInitializations, 1);
  assert.equal(receiveCalls, 1);
  assert.equal(subclassOverrides, 0);
  assert.equal(prototypePatches, 0);
  assert.equal(isAutonomousCollectiveNodeRuntimeV1(node), true);
  assert.equal(Object.isFrozen(node.options), true);
  assert.equal(Object.isFrozen(node.options.policy), true);
  assert.equal(node.options.policy.graphProposalWindowMs, 10);
  for (const method of [
    "initialize",
    "loadOptional",
    "load",
    "submitMission",
    "receive",
    "advance",
  ]) {
    const descriptor = Object.getOwnPropertyDescriptor(node, method);
    assert.equal(descriptor?.writable, false);
    assert.equal(descriptor?.configurable, false);
  }
  delete AutonomousCollectiveNodeRuntimeV1.prototype.receive;
});
