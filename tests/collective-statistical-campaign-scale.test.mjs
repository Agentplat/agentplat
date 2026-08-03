import assert from "node:assert/strict";
import test from "node:test";

const scale = await import(
  "../packages/mesh-sim/dist/collective-statistical-campaign-scale.js"
);

const expectedLadder = [
  [50, 6, 300, 1_000, 10],
  [100, 7, 700, 1_600, 10],
  [250, 8, 2_000, 3_000, 10],
  [500, 9, 4_500, 5_000, 30],
];

test("statistical scale ladder is closed and retains exact sparse-topology budgets", () => {
  assert.deepEqual(
    scale.COLLECTIVE_STATISTICAL_CAMPAIGN_SCALE_LADDER_V1.map((entry) => [
      entry.agentCount,
      entry.outdegree,
      entry.directedEdgeCount,
      entry.maximumInteractions,
      entry.pairedSeedsPerStratum,
    ]),
    expectedLadder,
  );
  assert.deepEqual(scale.COLLECTIVE_STATISTICAL_CAMPAIGN_STRATA_V1, [
    "nominal",
    "benign",
    "adversarial",
    "mixed",
  ]);
  assert.equal(
    scale.COLLECTIVE_STATISTICAL_CAMPAIGN_FAULT_FAMILIES_V1.length,
    6,
  );
});

test("topologies are exact per seed, sparse, connected by the ring, and differ when seed changes", () => {
  for (const [agentCount, outdegree, directedEdgeCount] of expectedLadder) {
    const first = scale.createCollectiveStatisticalCampaignTopologyV1({
      schemaVersion: 1,
      agentCount,
      seed: 73,
    });
    const replay = scale.createCollectiveStatisticalCampaignTopologyV1({
      schemaVersion: 1,
      agentCount,
      seed: 73,
    });
    const changed = scale.createCollectiveStatisticalCampaignTopologyV1({
      schemaVersion: 1,
      agentCount,
      seed: 74,
    });
    assert.deepEqual(first, replay);
    assert.notDeepEqual(first.edges, changed.edges);
    assert.equal(first.peerIds.length, agentCount);
    assert.equal(first.edges.length, directedEdgeCount);
    assert.equal(new Set(first.edges.map((edge) => `${edge.fromPeerId}\0${edge.toPeerId}`)).size, directedEdgeCount);
    for (const [index, peerId] of first.peerIds.entries()) {
      const outgoing = first.edges.filter((edge) => edge.fromPeerId === peerId);
      assert.equal(outgoing.length, outdegree);
      assert.equal(
        outgoing.some(
          (edge) => edge.toPeerId === first.peerIds[(index + 1) % agentCount],
        ),
        true,
      );
      assert.equal(outgoing.some((edge) => edge.toPeerId === peerId), false);
    }
    assert.deepEqual(
      scale.validateCollectiveStatisticalCampaignTopologyV1(first),
      first,
    );
  }
});

test("scale configuration binds the exact topology, scale budget and registered matrix row", () => {
  for (const stratum of scale.COLLECTIVE_STATISTICAL_CAMPAIGN_STRATA_V1) {
    const configuration =
      scale.createCollectiveStatisticalCampaignScaleConfigurationV1({
        schemaVersion: 1,
        agentCount: 500,
        seed: 101,
        stratum,
      });
    assert.equal(configuration.maximumInteractions, 5_000);
    assert.equal(
      configuration.registeredFaultFamilies.length,
      stratum === "nominal" ? 0 : 6,
    );
    assert.deepEqual(
      scale.validateCollectiveStatisticalCampaignScaleConfigurationV1(
        configuration,
      ),
      configuration,
    );
  }
  const configuration =
    scale.createCollectiveStatisticalCampaignScaleConfigurationV1({
      schemaVersion: 1,
      agentCount: 50,
      seed: 9,
      stratum: "benign",
    });
  assert.throws(
    () =>
      scale.validateCollectiveStatisticalCampaignScaleConfigurationV1({
        ...configuration,
        maximumInteractions: 5_001,
      }),
    /binding/u,
  );
  assert.throws(
    () =>
      scale.createCollectiveStatisticalCampaignScaleConfigurationV1({
        schemaVersion: 1,
        agentCount: 51,
        seed: 9,
        stratum: "benign",
      }),
    /scale ladder/u,
  );
});

test("fault matrix and coverage fail closed on omissions, substitutions and nominal faults", () => {
  const matrix = scale.createCollectiveStatisticalCampaignFaultMatrixV1();
  assert.deepEqual(
    scale.validateCollectiveStatisticalCampaignFaultMatrixV1(matrix),
    matrix,
  );
  const benign = matrix.rows.find((entry) => entry.stratum === "benign");
  assert.ok(benign);
  const coverage = scale.createCollectiveStatisticalCampaignFaultCoverageV1({
    schemaVersion: 1,
    stratum: "benign",
    registeredFaultFamilies: benign.faultFamilies,
    observedFaultFamilies: benign.faultFamilies,
  });
  assert.deepEqual(
    scale.validateCollectiveStatisticalCampaignFaultCoverageV1(coverage),
    coverage,
  );
  assert.throws(
    () =>
      scale.createCollectiveStatisticalCampaignFaultCoverageV1({
        schemaVersion: 1,
        stratum: "benign",
        registeredFaultFamilies: benign.faultFamilies,
        observedFaultFamilies: benign.faultFamilies.slice(1),
      }),
    /observed fault families/u,
  );
  assert.throws(
    () =>
      scale.createCollectiveStatisticalCampaignFaultCoverageV1({
        schemaVersion: 1,
        stratum: "nominal",
        registeredFaultFamilies: [],
        observedFaultFamilies: ["peer.crash"],
      }),
    /observed fault families/u,
  );
  assert.throws(
    () =>
      scale.validateCollectiveStatisticalCampaignFaultMatrixV1({
        ...matrix,
        rows: matrix.rows.slice(1),
      }),
    /binding/u,
  );
});
