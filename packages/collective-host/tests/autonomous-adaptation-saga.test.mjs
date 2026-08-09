import assert from "node:assert/strict";
import test from "node:test";

import { collectiveQuorumDigestV1 } from "../../collective-quorum/dist/index.js";
import {
  AutonomousAdaptationRuntimeV1,
  ProtocolBoundAdaptationSignalAdmissionV1,
  createAutonomousAdaptationActionV1,
  createAutonomousAdaptationPolicyV1,
  createAutonomousMissionSignalV1,
} from "../dist/index.js";

const digest = (character) => `sha256:${character.repeat(64)}`;

test("adaptation saga applies an exact multi-action predecessor chain", async () => {
  const fixture = await sagaFixture({});
  const decision = await fixture.runtime.runCycle({
    cycleId: "cycle:multi-success",
    logicalTimeMs: 10,
  });
  assert.equal(decision.status, "applied");
  assert.deepEqual(decision.appliedActionDigests, [
    fixture.actions[0].actionDigest,
    fixture.actions[1].actionDigest,
  ]);
  assert.equal(fixture.effectState(), fixture.actions[1].candidateDigest);
  assert.equal(fixture.applyCalls(), 2);
  const state = await fixture.runtime.load();
  assert.equal(state.adaptationSagas[0].phase, "completed");
  assert.deepEqual(
    state.adaptationSagas[0].actions.map(({ phase }) => phase),
    ["completed", "completed"],
  );
});

test("adaptation saga rejects a stale second predecessor before any effect", async () => {
  const fixture = await sagaFixture({ staleSecondPredecessor: true });
  await assert.rejects(
    fixture.runtime.runCycle({
      cycleId: "cycle:stale-chain",
      logicalTimeMs: 10,
    }),
    /stale predecessor/u,
  );
  assert.equal(fixture.applyCalls(), 0);
});

test("an invalid later action compensates every durably applied predecessor", async () => {
  const fixture = await sagaFixture({ failSecondApply: true });
  const decision = await fixture.runtime.runCycle({
    cycleId: "cycle:invalid-second",
    logicalTimeMs: 10,
  });
  assert.equal(decision.status, "rolled_back");
  assert.deepEqual(decision.appliedActionDigests, [
    fixture.actions[0].actionDigest,
  ]);
  assert.equal(fixture.rollbackCalls(), 1);
  assert.equal(fixture.effectState(), fixture.actions[0].rollbackDigest);
  const state = await fixture.runtime.load();
  assert.deepEqual(
    state.adaptationSagas[0].actions.map(({ phase }) => phase),
    ["rolled_back", "prepared"],
  );
});

test("a denied later actuator receipt compensates every prior action", async () => {
  const fixture = await sagaFixture({ denySecondApply: true });
  const decision = await fixture.runtime.runCycle({
    cycleId: "cycle:denied-second",
    logicalTimeMs: 10,
  });
  assert.equal(decision.status, "rolled_back");
  assert.equal(fixture.rollbackCalls(), 1);
  assert.equal(fixture.effectState(), fixture.actions[0].rollbackDigest);
});

test("a crash after an effect resumes with the same idempotency key", async () => {
  const fixture = await sagaFixture({ failFirstAppliedJournal: true });
  await assert.rejects(
    fixture.runtime.runCycle({
      cycleId: "cycle:journal-crash",
      logicalTimeMs: 10,
    }),
    /simulated applied journal crash/u,
  );
  const decision = await fixture.runtime.runCycle({
    cycleId: "cycle:journal-crash",
    logicalTimeMs: 10,
  });
  assert.equal(decision.status, "applied");
  assert.equal(fixture.applyCalls(), 2);
});

test("an actuator throw after applying is recovered from its durable receipt", async () => {
  const fixture = await sagaFixture({ throwAfterApplyEffect: true });
  const decision = await fixture.runtime.runCycle({
    cycleId: "cycle:actuator-reconcile",
    logicalTimeMs: 10,
  });
  assert.equal(decision.status, "applied");
  assert.equal(fixture.applyCalls(), 2);
  assert.equal(fixture.effectState(), fixture.actions[1].candidateDigest);
});

test("a signal remains pending until independent-source quorum arrives", async () => {
  const fixture = await sagaFixture({ lateQuorum: true });
  const idle = await fixture.runtime.runCycle({
    cycleId: "cycle:quorum-pending",
    logicalTimeMs: 10,
  });
  assert.equal(idle.status, "idle");
  let state = await fixture.runtime.load();
  assert.deepEqual(state.processedSignalDigests, []);
  assert.deepEqual(state.processedSignalWatermarks, []);

  fixture.releaseIndependentSignal();
  const applied = await fixture.runtime.runCycle({
    cycleId: "cycle:quorum-complete",
    logicalTimeMs: 11,
  });
  assert.equal(applied.status, "applied");
  state = await fixture.runtime.load();
  assert.equal(state.processedSignalDigests.length, 2);
});

test("one peer cannot forge a second independence group to satisfy quorum", async () => {
  const fixture = await sagaFixture({ forgedGroupQuorum: true });
  const idle = await fixture.runtime.runCycle({
    cycleId: "cycle:forged-group",
    logicalTimeMs: 10,
  });
  assert.equal(idle.status, "idle");
  assert.deepEqual(idle.reasonCodes, ["independent_signal_quorum_unavailable"]);
  assert.deepEqual(idle.signalDigests, [fixture.signal.signalDigest]);
});

test("a distinct signal at the same causal time is not hidden by the watermark", async () => {
  const fixture = await sagaFixture({
    sameCoordinateLater: true,
    noActions: true,
  });
  const first = await fixture.runtime.runCycle({
    cycleId: "cycle:same-time-first",
    logicalTimeMs: 10,
  });
  assert.deepEqual(first.signalDigests, [fixture.signal.signalDigest]);

  fixture.releaseIndependentSignal();
  const second = await fixture.runtime.runCycle({
    cycleId: "cycle:same-time-second",
    logicalTimeMs: 11,
  });
  assert.deepEqual(second.signalDigests, [
    fixture.independentSignal.signalDigest,
  ]);
  const state = await fixture.runtime.load();
  assert.deepEqual(state.processedSignalWatermarks, [
    {
      sourcePeerId: fixture.signal.sourcePeerId,
      sourceInstanceId: fixture.signal.sourceInstanceId,
      sourceKeyId: fixture.signal.sourceKeyId,
      observedAtLogicalMs: 10,
      signalDigestsAtLogicalMs: [
        fixture.independentSignal.signalDigest,
        fixture.signal.signalDigest,
      ].sort(),
    },
  ]);
});

test("an applied receipt is journaled before a later successor is classified as superseding", async () => {
  const fixture = await sagaFixture({ successorAfterApplyCrash: true });
  const decision = await fixture.runtime.runCycle({
    cycleId: "cycle:apply-successor",
    logicalTimeMs: 10,
  });
  assert.equal(decision.status, "superseded");
  assert.equal(fixture.rollbackCalls(), 0);
  assert.equal(fixture.effectState(), digest("e"));
  const state = await fixture.runtime.load();
  assert.equal(
    state.adaptationSagas[0].actions[0].applyReceiptDigest !== null,
    true,
  );
});

test("a rollback receipt is journaled without rolling back over a later successor", async () => {
  const fixture = await sagaFixture({
    failSecondApply: true,
    successorAfterRollbackCrash: true,
  });
  const decision = await fixture.runtime.runCycle({
    cycleId: "cycle:rollback-successor",
    logicalTimeMs: 10,
  });
  assert.equal(decision.status, "superseded");
  assert.equal(fixture.rollbackCalls(), 1);
  assert.equal(fixture.effectState(), digest("e"));
});

async function sagaFixture(options) {
  const missionId = "mission:saga";
  const initialStateDigest = digest("3");
  let effectState = initialStateDigest;
  let applyCalls = 0;
  let rollbackCalls = 0;
  const applyReceipts = new Map();
  const rollbackReceipts = new Map();
  let durableState;
  let failedAppliedJournal = false;
  const signal = await createAutonomousMissionSignalV1({
    signalId: "signal:saga",
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
  const independentSignal = await createAutonomousMissionSignalV1({
    signalId: "signal:independent",
    missionId,
    sourcePeerId:
      options.forgedGroupQuorum || options.sameCoordinateLater
        ? "peer:local"
        : "peer:independent",
    sourceInstanceId:
      options.forgedGroupQuorum || options.sameCoordinateLater
        ? "instance:local"
        : "instance:independent",
    sourceKeyId:
      options.forgedGroupQuorum || options.sameCoordinateLater
        ? "key:local"
        : "key:independent",
    membershipConfigurationDigest: digest("a"),
    sourceIndependenceGroupId: options.forgedGroupQuorum
      ? "group:forged"
      : options.sameCoordinateLater
        ? "group:local"
        : "group:independent",
    kind: "environment_change",
    severityBasisPoints: 9_000,
    confidenceBasisPoints: 9_000,
    subjectDigest: digest("b"),
    evidenceDigests: [digest("d")],
    observedAtLogicalMs: options.sameCoordinateLater ? 10 : 11,
  });
  let includeIndependentSignal = options.forgedGroupQuorum ?? false;
  const first = await createAutonomousAdaptationActionV1({
    actionId: "action:mission",
    domain: "mission",
    subjectId: missionId,
    predecessorDigest: initialStateDigest,
    candidateDigest: digest("4"),
    rollbackDigest: initialStateDigest,
    authorityCeilingDigest: digest("8"),
    evidenceDigests: [signal.signalDigest],
    expectedBenefitBasisPoints: 8_000,
    maximumRiskBasisPoints: 100,
  });
  const second = await createAutonomousAdaptationActionV1({
    actionId: "action:strategy",
    domain: "strategy",
    subjectId: missionId,
    predecessorDigest: options.staleSecondPredecessor
      ? initialStateDigest
      : first.candidateDigest,
    candidateDigest: digest("5"),
    rollbackDigest: first.candidateDigest,
    authorityCeilingDigest: digest("8"),
    evidenceDigests: [signal.signalDigest],
    expectedBenefitBasisPoints: 8_000,
    maximumRiskBasisPoints: 100,
  });
  const actions = [first, second];
  const policy = await createAutonomousAdaptationPolicyV1({
    policyId: "policy:saga",
    policyVersion: 1,
    minimumSeverityBasisPoints: 1,
    minimumConfidenceBasisPoints: 1,
    minimumIndependentSources:
      options.lateQuorum || options.forgedGroupQuorum ? 2 : 1,
    observationWindowMs: 100,
    domainCooldownMs: { mission: 0, strategy: 0, role: 0, team: 0 },
    maximumActionsPerCycle: 4,
    maximumEvidenceDigestsPerSignal: 16,
    maximumRetainedSignals: 16,
    maximumRetainedDecisions: 16,
    maximumCommitAttempts: 4,
  });
  const protocol = {
    options: {
      localPeerId: signal.sourcePeerId,
      localInstanceId: signal.sourceInstanceId,
      membershipConfigurationDigest: signal.membershipConfigurationDigest,
      authenticity: { localKeyId: signal.sourceKeyId },
    },
    async publish() {},
    async messages() {
      return [
        {
          payload: signal,
          issuerPeerId: signal.sourcePeerId,
          issuerInstanceId: signal.sourceInstanceId,
          issuerKeyId: signal.sourceKeyId,
          membershipConfigurationDigest: signal.membershipConfigurationDigest,
          logicalTimeMs: signal.observedAtLogicalMs,
        },
        ...(includeIndependentSignal
          ? [
              {
                payload: independentSignal,
                issuerPeerId: independentSignal.sourcePeerId,
                issuerInstanceId: independentSignal.sourceInstanceId,
                issuerKeyId: independentSignal.sourceKeyId,
                membershipConfigurationDigest:
                  independentSignal.membershipConfigurationDigest,
                logicalTimeMs: independentSignal.observedAtLogicalMs,
              },
            ]
          : []),
      ];
    },
  };
  const planners = ["mission", "strategy", "role", "team"].map((domain) => ({
    domain,
    async propose() {
      if (options.noActions) return null;
      return domain === "mission"
        ? first
        : domain === "strategy"
          ? second
          : null;
    },
  }));
  const runtime = new AutonomousAdaptationRuntimeV1({
    runtimeId: "adaptation:saga",
    missionId,
    protocol,
    currentStateDigest: async () => effectState,
    signalAdmission: options.forgedGroupQuorum
      ? new ProtocolBoundAdaptationSignalAdmissionV1({
          scopeDigest: digest("f"),
          membership: {
            async verifyPeer() {
              return true;
            },
            async resolveIndependenceGroup() {
              return "group:local";
            },
          },
        })
      : {
          async admit() {
            return true;
          },
        },
    policy,
    planners,
    safety: {
      async evaluate(input) {
        const reasonCodes = ["bounded_change_allowed"];
        const evidenceDigests = [digest("6")];
        return {
          disposition: "allow",
          reasonCodes,
          evidenceDigests,
          decisionDigest: await collectiveQuorumDigestV1({
            domain: "autonomous-adaptation-safety-decision-v1",
            body: {
              cycleId: input.cycleId,
              missionId,
              policyDigest: policy.policyDigest,
              currentStateDigest: initialStateDigest,
              signalDigests: input.signals
                .map(({ signalDigest }) => signalDigest)
                .sort(),
              actionDigests: actions.map(({ actionDigest }) => actionDigest),
              disposition: "allow",
              reasonCodes,
              evidenceDigests,
              logicalTimeMs: input.logicalTimeMs,
            },
          }),
        };
      },
    },
    finality: {
      async certify(input) {
        return {
          proposalDigest: input.bundleDigest,
          certificateDigest: digest("7"),
        };
      },
      async verify() {
        return true;
      },
    },
    actuator: {
      async reconcileApply(input) {
        const receipt = applyReceipts.get(input.idempotencyKey) ?? null;
        if (receipt && options.successorAfterApplyCrash)
          effectState = digest("e");
        return receipt;
      },
      async apply(input) {
        const replay = applyReceipts.get(input.idempotencyKey);
        if (replay) return replay;
        applyCalls += 1;
        if (options.failSecondApply && input.action.domain === "strategy")
          throw new Error("simulated second action failure");
        if (options.denySecondApply && input.action.domain === "strategy") {
          const body = {
            idempotencyKey: input.idempotencyKey,
            actionDigest: input.action.actionDigest,
            finalityCertificateDigest: input.certificate.certificateDigest,
            applied: false,
            resultingDigest: input.action.predecessorDigest,
            logicalTimeMs: input.logicalTimeMs,
          };
          return {
            applied: false,
            resultingDigest: input.action.predecessorDigest,
            receiptDigest: await collectiveQuorumDigestV1({
              domain: "autonomous-adaptation-apply-receipt-v1",
              body,
            }),
          };
        }
        effectState = input.action.candidateDigest;
        const body = {
          idempotencyKey: input.idempotencyKey,
          actionDigest: input.action.actionDigest,
          finalityCertificateDigest: input.certificate.certificateDigest,
          applied: true,
          resultingDigest: input.action.candidateDigest,
          logicalTimeMs: input.logicalTimeMs,
        };
        const receipt = {
          applied: true,
          resultingDigest: input.action.candidateDigest,
          receiptDigest: await collectiveQuorumDigestV1({
            domain: "autonomous-adaptation-apply-receipt-v1",
            body,
          }),
        };
        applyReceipts.set(input.idempotencyKey, receipt);
        if (options.throwAfterApplyEffect || options.successorAfterApplyCrash)
          throw new Error("simulated actuator crash after effect");
        return receipt;
      },
      async reconcileRollback(input) {
        const receipt = rollbackReceipts.get(input.idempotencyKey) ?? null;
        if (receipt && options.successorAfterRollbackCrash)
          effectState = digest("e");
        return receipt;
      },
      async rollback(input) {
        const replay = rollbackReceipts.get(input.idempotencyKey);
        if (replay) return replay;
        rollbackCalls += 1;
        effectState = input.action.rollbackDigest;
        const body = {
          idempotencyKey: input.idempotencyKey,
          actionDigest: input.action.actionDigest,
          appliedReceiptDigest: input.appliedReceiptDigest,
          rolledBack: true,
          resultingDigest: input.action.rollbackDigest,
          logicalTimeMs: input.logicalTimeMs,
        };
        const receipt = {
          rolledBack: true,
          resultingDigest: input.action.rollbackDigest,
          receiptDigest: await collectiveQuorumDigestV1({
            domain: "autonomous-adaptation-rollback-receipt-v1",
            body,
          }),
        };
        rollbackReceipts.set(input.idempotencyKey, receipt);
        if (options.successorAfterRollbackCrash)
          throw new Error("simulated rollback crash after effect");
        return receipt;
      },
    },
    store: {
      async load() {
        return durableState ? structuredClone(durableState) : null;
      },
      async save(next, expectedRevision) {
        if (
          options.failFirstAppliedJournal &&
          !failedAppliedJournal &&
          next.adaptationSagas?.some((saga) =>
            saga.actions.some(({ phase }) => phase === "applied"),
          )
        ) {
          failedAppliedJournal = true;
          throw new Error("simulated applied journal crash");
        }
        if (
          (expectedRevision === null && durableState !== undefined) ||
          (expectedRevision !== null &&
            durableState?.revision !== expectedRevision)
        )
          return false;
        durableState = structuredClone(next);
        return true;
      },
    },
  });
  await runtime.initialize(0);
  return {
    runtime,
    actions,
    signal,
    independentSignal,
    effectState: () => effectState,
    applyCalls: () => applyCalls,
    rollbackCalls: () => rollbackCalls,
    releaseIndependentSignal: () => {
      includeIndependentSignal = true;
    },
  };
}
