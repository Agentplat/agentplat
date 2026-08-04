import assert from "node:assert/strict";
import test from "node:test";

const scale = await import("../packages/mesh-sim/dist/index.js");

const digest = (character) => `sha256:${character.repeat(64)}`;

test("progressive profiles cover the full bounded scale ladder without global topology materialization", () => {
  assert.deepEqual(
    scale.COLLECTIVE_PROGRESSIVE_SCALE_PROFILES_V1.map((profile) => ({
      tier: profile.tier,
      agents: profile.agentCount,
      interactions: profile.maximumInteractions,
      roleSteps: profile.roleCoherenceSteps,
      affectedBasisPoints: profile.affectedAgentBasisPoints,
      recovery: profile.recoveryWorkClass,
      domains: profile.scenarioDomains,
    })),
    [
      {
        tier: "baseline",
        agents: 500,
        interactions: 5_000,
        roleSteps: 1_000,
        affectedBasisPoints: 2_000,
        recovery: "quadratic",
        domains: ["physical", "social"],
      },
      {
        tier: "resilient",
        agents: 5_000,
        interactions: 50_000,
        roleSteps: 1_000,
        affectedBasisPoints: 2_000,
        recovery: "n_log_n",
        domains: ["physical", "social", "cyber"],
      },
      {
        tier: "frontier",
        agents: 100_000,
        interactions: 1_000_000,
        roleSteps: 10_000,
        affectedBasisPoints: 3_300,
        recovery: "linear",
        domains: ["physical", "social", "cyber"],
      },
    ],
  );

  const plan = scale.createCollectiveProgressiveScalePlanV1({
    schemaVersion: 1,
    tier: "frontier",
    seed: 73,
  });
  assert.equal(plan.shards.length, 100);
  assert.equal(plan.shards[0].peerStartInclusive, 0);
  assert.equal(plan.shards.at(-1).peerEndExclusive, 100_000);
  assert.equal(plan.shards[0].interactionStartInclusive, 0);
  assert.equal(plan.shards.at(-1).interactionEndExclusive, 1_000_000);
  assert.equal(
    plan.shards.reduce(
      (total, shard) => total + shard.expectedAffectedPeers,
      0,
    ),
    33_000,
  );
  assert.equal(plan.topology.directedEdgeCount, 1_700_000);
  assert.equal(plan.topology.edges, undefined);
  assert.deepEqual(scale.validateCollectiveProgressiveScalePlanV1(plan), plan);

  const peer = scale.collectiveProgressiveScalePeerV1(plan.topology, 99_999);
  assert.equal(peer.peerId, "peer-99999");
  assert.equal(peer.neighborIndexes.length, 17);
  assert.equal(new Set(peer.neighborIndexes).size, 17);
  assert.equal(peer.neighborIndexes.includes(99_999), false);
  assert.equal(peer.neighborIndexes.includes(0), true);

  const changed = scale.createCollectiveProgressiveScaleTopologyV1({
    schemaVersion: 1,
    tier: "frontier",
    seed: 74,
  });
  assert.notDeepEqual(
    scale.collectiveProgressiveScaleNeighborsV1(plan.topology, 42),
    scale.collectiveProgressiveScaleNeighborsV1(changed, 42),
  );

  const role = scale.createCollectiveProgressiveScaleRoleCoherenceV1({
    schemaVersion: 1,
    profile: plan.profile,
    adversarial: true,
    steps: 10_000,
    coherentSteps: 10_000,
    usefulActions: 9_000,
    refusals: 1_000,
    unsafeActions: 0,
    firstFailureStep: null,
    traceDigest: digest("f"),
  });
  assert.equal(role.steps, 10_000);
  assert.equal(role.adversarial, true);
});

test("a provider-neutral shard executor is identity-bound and aggregates closed scale evidence", async () => {
  const plan = scale.createCollectiveProgressiveScalePlanV1({
    schemaVersion: 1,
    tier: "baseline",
    seed: 11,
  });
  const shard = plan.shards[0];
  const executor = {
    schemaVersion: 1,
    executorId: "reference-worker",
    executorVersion: "1.0.0",
    executeShardV1(context) {
      assert.equal(context.planDigest, plan.planDigest);
      assert.equal(context.topology.edges, undefined);
      return scale.createCollectiveProgressiveScaleShardResultV1({
        schemaVersion: 1,
        plan,
        shard: context.shard,
        executorId: this.executorId,
        executorVersion: this.executorVersion,
        processedPeers: 500,
        affectedPeers: 100,
        recoveredPeers: 100,
        interactions: 5_000,
        recoveryInteractions: 400,
        recoveryWorkUnits: 250_000,
        missionSuccessRateBeforeFaultBasisPoints: 9_500,
        missionSuccessRateAfterRecoveryBasisPoints: 9_500,
        stateRootDigest: digest("a"),
        eventStreamDigest: digest("b"),
      });
    },
  };
  const result = await scale.runCollectiveProgressiveScaleShardV1({
    schemaVersion: 1,
    plan,
    shardId: shard.shardId,
    executor,
  });
  const roleCoherence = scale.createCollectiveProgressiveScaleRoleCoherenceV1({
    schemaVersion: 1,
    profile: plan.profile,
    adversarial: false,
    steps: 1_000,
    coherentSteps: 1_000,
    usefulActions: 900,
    refusals: 100,
    unsafeActions: 0,
    firstFailureStep: null,
    traceDigest: digest("c"),
  });
  const report = scale.createCollectiveProgressiveScaleReportV1({
    schemaVersion: 1,
    plan,
    results: [result],
    roleCoherence,
  });
  assert.equal(report.recoveryWorkCeiling, 250_000);
  assert.equal(report.conformant, true);
  assert.deepEqual(
    scale.validateCollectiveProgressiveScaleReportV1(report, {
      plan,
      results: [result],
      roleCoherence,
    }),
    report,
  );

  await assert.rejects(
    () =>
      scale.runCollectiveProgressiveScaleShardV1({
        schemaVersion: 1,
        plan,
        shardId: shard.shardId,
        executor: {
          ...executor,
          executorVersion: "2.0.0",
          executeShardV1: () => result,
        },
      }),
    /executor binding/u,
  );
});

test("progressive scale bindings reject altered profiles, plans and reports", () => {
  const profile = scale.collectiveProgressiveScaleProfileV1("resilient");
  assert.throws(
    () =>
      scale.validateCollectiveProgressiveScaleProfileV1({
        ...profile,
        maximumInteractions: 1_000_000,
      }),
    /binding/u,
  );
  const plan = scale.createCollectiveProgressiveScalePlanV1({
    schemaVersion: 1,
    tier: "resilient",
    seed: 9,
  });
  assert.throws(
    () =>
      scale.validateCollectiveProgressiveScalePlanV1({
        ...plan,
        topology: { ...plan.topology, directedEdgeCount: 1 },
      }),
    /binding/u,
  );
  assert.equal(
    scale.collectiveProgressiveScaleRecoveryWorkCeilingV1(profile),
    65_000,
  );
});
