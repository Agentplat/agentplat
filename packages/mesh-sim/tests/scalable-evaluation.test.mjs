import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";

const evaluation = await import("../dist/scalable-evaluation.js");
const environment = await import("../dist/multi-domain-environment.js");
const sharded = await import("../dist/sharded-simulation.js");
const evidenceCrypto = globalThis.crypto ?? webcrypto;
const evidenceKeys = await evidenceCrypto.subtle.generateKey("Ed25519", false, [
  "sign",
  "verify",
]);

test("scale profiles model 500, 5K, and 100K agents as bounded configuration", () => {
  assert.deepEqual(
    evaluation.SCALABLE_EVALUATION_PROFILES_V1.map((profile) => [
      profile.profileId,
      profile.agentCount,
      profile.budget.maximumInteractions,
      profile.budget.maximumMessages,
    ]),
    [
      ["standard-500", 500, 5_000, 5_000],
      ["large-5000", 5_000, 50_000, 50_000],
      ["frontier-100000", 100_000, 1_000_000, 1_000_000],
    ],
  );
  const frontier = evaluation.createScalableEvaluationProfileV1({
    profileId: "frontier-100000",
    maximumInteractions: 250_000,
    maximumMessages: 100_000,
    maximumRetainedRecords: 8,
  });
  assert.equal(frontier.agentCount, 100_000);
  assert.equal(frontier.budget.maximumInteractions, 250_000);
  assert.ok(JSON.stringify(frontier).length < 1_000);

  const frontierFixture = makeFixture({
    profileId: "frontier-100000",
    maximumRetainedRecords: 8,
    targetAgentCount: 33_000,
  });
  const runtime = evaluation.createScalableEvaluationRuntimeV1({
    definition: frontierFixture.definition,
    descriptor: frontierFixture.adapter.descriptor,
  });
  const snapshot = runtime.snapshotV1();
  assert.equal(snapshot.teamSummaries.length, 2);
  assert.equal(snapshot.recentAccountingRecords.length, 0);
  assert.equal("agents" in snapshot, false);
  assert.equal("peers" in snapshot, false);
  assert.ok(JSON.stringify(snapshot).length < 10_000);
});

test("definition binds partial visibility, all perturbation classes, and an interchangeable matchup", async () => {
  const fixture = makeFixture({ includeAllPerturbations: true });
  assert.deepEqual(
    fixture.definition.perturbations.map((entry) => entry.kind),
    ["benign", "byzantine", "rogue", "context_poisoning"],
  );
  assert.equal(fixture.definition.matchup.comparisonKind, "team-vs-team");
  assert.equal(fixture.definition.teams[1].architecture, "centralized");
  assert.equal(
    fixture.definition.partialObservability.sourceVisibilityPolicyDigest,
    fixture.scenario.visibilityPolicyDigest,
  );

  const binding = await evaluation.openScalableEvaluationEnvironmentV1({
    definition: fixture.definition,
    adapter: fixture.adapter,
  });
  assert.equal(
    binding.manifest.manifestDigest,
    fixture.definition.scenarioManifestDigest,
  );

  const left = {
    descriptor: fixture.teams[0],
    stepV1() {
      throw new Error("not executed by binding");
    },
  };
  const right = {
    descriptor: fixture.teams[1],
    stepV1() {
      throw new Error("not executed by binding");
    },
  };
  const teams = evaluation.bindScalableEvaluationTeamsV1({
    definition: fixture.definition,
    ports: [right, left],
  });
  assert.equal(teams.left, left);
  assert.equal(teams.right, right);

  const third = evaluation.createScalableEvaluationTeamDescriptorV1({
    teamId: "team:third",
    architecture: "custom",
    implementationId: "third-controller",
    implementationVersion: "1.0.0",
    implementationDigest: evaluation.scalableEvaluationDigestV1(
      "implementation",
      { kind: "third" },
    ),
  });
  assert.throws(
    () =>
      evaluation.createScalableEvaluationDefinitionV1({
        evaluationId: "evaluation:too-many-teams",
        profile: fixture.profile,
        descriptor: fixture.adapter.descriptor,
        scenario: fixture.scenario,
        partialObservability: fixture.definition.partialObservability,
        teams: [...fixture.teams, third],
        perturbations: [],
      }),
    /team_count_invalid/u,
  );

  const claimedReference = evaluation.createScalableEvaluationTeamDescriptorV1({
    teamId: "team:claimed-reference-stack",
    architecture: "distributed",
    implementationId:
      evaluation.REFERENCE_INTEGRATED_SCALABLE_EVALUATION_IMPLEMENTATION_ID_V1,
    implementationVersion: "1.0.0",
    implementationDigest: evaluation.scalableEvaluationDigestV1(
      "implementation",
      { kind: "claimed-reference-stack" },
    ),
  });
  const claimedDefinition = evaluation.createScalableEvaluationDefinitionV1({
    evaluationId: "evaluation:claimed-reference-stack",
    profile: fixture.profile,
    descriptor: fixture.adapter.descriptor,
    scenario: fixture.scenario,
    partialObservability: fixture.definition.partialObservability,
    teams: [claimedReference, fixture.teams[1]],
    perturbations: [],
  });
  assert.throws(
    () =>
      evaluation.bindScalableEvaluationTeamsV1({
        definition: claimedDefinition,
        ports: [
          {
            descriptor: claimedReference,
            stepV1() {
              throw new Error();
            },
          },
          right,
        ],
      }),
    /reference_integrated_team_port_not_genuine/u,
  );
});

test("accounting is sequence-safe, budgeted per team, and retains only a bounded tail", () => {
  const fixture = makeFixture({
    maximumInteractions: 3,
    maximumMessages: 2,
    maximumMessageBytes: 12,
    maximumRetainedRecords: 2,
  });
  const runtime = evaluation.createScalableEvaluationRuntimeV1({
    definition: fixture.definition,
    descriptor: fixture.adapter.descriptor,
  });
  runtime.recordAccountingV1(
    activity(fixture, {
      eventId: "event:1",
      sequence: 1,
      logicalTime: 1,
      kind: "message",
      messageCount: 1,
      messageBytes: 4,
    }),
  );
  assert.throws(
    () =>
      runtime.recordAccountingV1(
        activity(fixture, {
          eventId: "event:gap",
          sequence: 3,
          logicalTime: 2,
        }),
      ),
    /accounting_sequence_invalid/u,
  );
  runtime.recordAccountingV1(
    activity(fixture, {
      eventId: "event:2",
      sequence: 2,
      logicalTime: 2,
      kind: "message",
      messageCount: 1,
      messageBytes: 4,
    }),
  );
  runtime.recordAccountingV1(
    activity(fixture, {
      eventId: "event:3",
      sequence: 3,
      logicalTime: 3,
      kind: "decision",
    }),
  );
  assert.throws(
    () =>
      runtime.recordAccountingV1(
        activity(fixture, {
          eventId: "event:over-budget",
          sequence: 4,
          logicalTime: 4,
        }),
      ),
    /interaction_budget_exceeded/u,
  );
  const snapshot = runtime.snapshotV1();
  assert.deepEqual(
    snapshot.recentAccountingRecords.map((record) => record.eventId),
    ["event:2", "event:3"],
  );
  const distributed = snapshot.teamSummaries.find(
    (summary) => summary.teamId === fixture.teams[0].teamId,
  );
  assert.equal(distributed.counters.interactions, 3);
  assert.equal(distributed.counters.messages, 2);
  assert.equal(distributed.counters.messageBytes, 8);
});

test("runtime state export and restore preserve counters, bounded ring cursor, and hash continuity", () => {
  const fixture = makeFixture({
    maximumInteractions: 8,
    maximumRetainedRecords: 2,
  });
  const first = evaluation.createScalableEvaluationRuntimeV1({
    definition: fixture.definition,
    descriptor: fixture.adapter.descriptor,
  });
  for (const [index, team] of fixture.teams.entries())
    first.bindTeamEnvironmentV1({
      teamId: team.teamId,
      sessionId: `state:session:${index}`,
      episodeId: `state:episode:${index}`,
    });
  for (let sequence = 1; sequence <= 3; sequence += 1)
    first.recordAccountingV1(
      activity(fixture, {
        eventId: `state:event:${sequence}`,
        sequence,
        logicalTime: sequence,
      }),
    );
  const exported = first.exportStateV1();
  assert.equal(exported.revision, 5);
  assert.equal(exported.recordTail.length, 2);
  assert.equal(exported.recordTailCursor, 1);
  assert.match(exported.predecessorStateDigest, /^sha256:[0-9a-f]{64}$/u);

  const restored = evaluation.restoreScalableEvaluationRuntimeV1({
    definition: fixture.definition,
    descriptor: fixture.adapter.descriptor,
    state: structuredClone(exported),
  });
  assert.deepEqual(restored.snapshotV1(), first.snapshotV1());
  const priorDigest = restored.exportStateV1().stateDigest;
  restored.recordAccountingV1(
    activity(fixture, {
      eventId: "state:event:4",
      sequence: 4,
      logicalTime: 4,
    }),
  );
  const advanced = restored.exportStateV1();
  assert.equal(advanced.revision, 6);
  assert.equal(advanced.predecessorStateDigest, priorDigest);
  assert.deepEqual(
    restored
      .snapshotV1()
      .recentAccountingRecords.map((record) => record.sequence),
    [3, 4],
  );

  const tampered = structuredClone(exported);
  tampered.teams[0].counters.interactions += 1;
  assert.throws(
    () =>
      evaluation.restoreScalableEvaluationRuntimeV1({
        definition: fixture.definition,
        descriptor: fixture.adapter.descriptor,
        state: tampered,
      }),
    /runtime_state_digest_invalid/u,
  );

  const rehash = (state) => {
    const body = { ...state };
    delete body.stateDigest;
    state.stateDigest = evaluation.scalableEvaluationDigestV1(
      "runtime-state",
      body,
    );
    return state;
  };
  const missingBinding = structuredClone(exported);
  missingBinding.environmentBindings.pop();
  assert.throws(
    () =>
      evaluation.restoreScalableEvaluationRuntimeV1({
        definition: fixture.definition,
        descriptor: fixture.adapter.descriptor,
        state: rehash(missingBinding),
      }),
    /runtime_state_invalid/u,
  );

  const inconsistentCursor = structuredClone(exported);
  inconsistentCursor.recordTailCursor = 0;
  assert.throws(
    () =>
      evaluation.restoreScalableEvaluationRuntimeV1({
        definition: fixture.definition,
        descriptor: fixture.adapter.descriptor,
        state: rehash(inconsistentCursor),
      }),
    /runtime_state_record_cursor_invalid/u,
  );

  const inconsistentHead = structuredClone(exported);
  const headTeam = inconsistentHead.teams.find(
    (team) => team.descriptor.teamId === fixture.teams[0].teamId,
  );
  const newestRecord = inconsistentHead.recordTail.find(
    (record) => record.sequence === headTeam.sequence,
  );
  headTeam.counters.interactions += 1;
  headTeam.countersByDomain.cyber.interactions += 1;
  newestRecord.cumulative.interactions += 1;
  assert.throws(
    () =>
      evaluation.restoreScalableEvaluationRuntimeV1({
        definition: fixture.definition,
        descriptor: fixture.adapter.descriptor,
        state: rehash(inconsistentHead),
      }),
    /runtime_state_record_continuity_invalid/u,
  );
});

test("genesis runtime state round-trips and rejects incoherent revision ancestry", () => {
  const fixture = makeFixture();
  const runtime = evaluation.createScalableEvaluationRuntimeV1({
    definition: fixture.definition,
    descriptor: fixture.adapter.descriptor,
  });
  const genesis = runtime.exportStateV1();
  assert.equal(genesis.revision, 0);
  assert.equal(genesis.predecessorStateDigest, null);
  assert.deepEqual(genesis.environmentBindings, []);
  const restored = evaluation.restoreScalableEvaluationRuntimeV1({
    definition: fixture.definition,
    descriptor: fixture.adapter.descriptor,
    state: structuredClone(genesis),
  });
  assert.deepEqual(restored.exportStateV1(), genesis);

  const rehash = (state) => {
    const body = { ...state };
    delete body.stateDigest;
    state.stateDigest = evaluation.scalableEvaluationDigestV1(
      "runtime-state",
      body,
    );
    return state;
  };
  const revisionZeroWithParent = structuredClone(genesis);
  revisionZeroWithParent.predecessorStateDigest =
    evaluation.scalableEvaluationDigestV1("test-impossible-parent", {});
  assert.throws(
    () =>
      evaluation.restoreScalableEvaluationRuntimeV1({
        definition: fixture.definition,
        descriptor: fixture.adapter.descriptor,
        state: rehash(revisionZeroWithParent),
      }),
    /runtime_state_invalid/u,
  );
  const revisionOneWithoutParent = structuredClone(genesis);
  revisionOneWithoutParent.revision = 1;
  assert.throws(
    () =>
      evaluation.restoreScalableEvaluationRuntimeV1({
        definition: fixture.definition,
        descriptor: fixture.adapter.descriptor,
        state: rehash(revisionOneWithoutParent),
      }),
    /runtime_state_invalid/u,
  );
});

test("partial observations are validated against the multi-domain descriptor before accounting", () => {
  const fixture = makeFixture();
  const runtime = evaluation.createScalableEvaluationRuntimeV1({
    definition: fixture.definition,
    descriptor: fixture.adapter.descriptor,
  });
  const schema = fixture.adapter.descriptor.observationSchemas[0];
  const observation = environment.createMultiDomainObservationEnvelopeV1({
    descriptor: fixture.adapter.descriptor,
    observationId: "observation:1",
    domain: "cyber",
    entityId: "entity:0",
    modality: schema.modality,
    schemaDigest: schema.schemaDigest,
    logicalTime: 1,
    payload: { state: "bounded-public-view" },
  });
  const deliveryBody = {
    schemaVersion: 1,
    requestId: "pull:1",
    peerIndex: 0,
    logicalTime: 1,
    observations: [observation],
    nextCursor: null,
  };
  const delivery = {
    ...deliveryBody,
    deliveryDigest: sharded.shardedSimulationDigestV1(
      "sharded-simulation-observation-delivery-v1",
      deliveryBody,
    ),
  };
  const receipt = runtime.recordPartialObservationV1({
    accounting: {
      schemaVersion: 1,
      eventId: "event:observation",
      teamId: fixture.teams[0].teamId,
      sequence: 1,
      logicalTime: 1,
      domain: "cyber",
      evidenceDigest: delivery.deliveryDigest,
    },
    peerIndex: 0,
    delivery,
    observations: [observation],
  });
  assert.equal(receipt.cumulative.observations, 1);

  const futureObservation = environment.createMultiDomainObservationEnvelopeV1({
    descriptor: fixture.adapter.descriptor,
    observationId: "observation:future",
    domain: "cyber",
    entityId: "entity:0",
    modality: schema.modality,
    schemaDigest: schema.schemaDigest,
    logicalTime: 2,
    payload: { state: "not-yet-visible" },
  });
  const futureBody = {
    ...deliveryBody,
    requestId: "pull:future",
    observations: [futureObservation],
  };
  const futureDelivery = {
    ...futureBody,
    deliveryDigest: sharded.shardedSimulationDigestV1(
      "sharded-simulation-observation-delivery-v1",
      futureBody,
    ),
  };
  assert.throws(
    () =>
      evaluation
        .createScalableEvaluationRuntimeV1({
          definition: fixture.definition,
          descriptor: fixture.adapter.descriptor,
        })
        .recordPartialObservationV1({
          accounting: {
            schemaVersion: 1,
            eventId: "event:future",
            teamId: fixture.teams[0].teamId,
            sequence: 1,
            logicalTime: 1,
            domain: "cyber",
            evidenceDigest: futureDelivery.deliveryDigest,
          },
          peerIndex: 0,
          delivery: futureDelivery,
          observations: [futureObservation],
        }),
    /partial_observation_from_future/u,
  );

  const largeObservations = ["a", "b"].map((suffix) =>
    environment.createMultiDomainObservationEnvelopeV1({
      descriptor: fixture.adapter.descriptor,
      observationId: `observation:large:${suffix}`,
      domain: "cyber",
      entityId: "entity:0",
      modality: schema.modality,
      schemaDigest: schema.schemaDigest,
      logicalTime: 1,
      payload: { state: suffix.repeat(40_000) },
    }),
  );
  const largeBody = {
    ...deliveryBody,
    requestId: "pull:large",
    observations: largeObservations,
  };
  const largeDelivery = {
    ...largeBody,
    deliveryDigest: sharded.shardedSimulationDigestV1(
      "sharded-simulation-observation-delivery-v1",
      largeBody,
    ),
  };
  assert.throws(
    () =>
      evaluation
        .createScalableEvaluationRuntimeV1({
          definition: fixture.definition,
          descriptor: fixture.adapter.descriptor,
        })
        .recordPartialObservationV1({
          accounting: {
            schemaVersion: 1,
            eventId: "event:large",
            teamId: fixture.teams[0].teamId,
            sequence: 1,
            logicalTime: 1,
            domain: "cyber",
            evidenceDigest: largeDelivery.deliveryDigest,
          },
          peerIndex: 0,
          delivery: largeDelivery,
          observations: largeObservations,
        }),
    /partial_observation_scenario_budget_exceeded/u,
  );
  assert.throws(
    () =>
      evaluation
        .createScalableEvaluationRuntimeV1({
          definition: fixture.definition,
          descriptor: fixture.adapter.descriptor,
        })
        .recordPartialObservationV1({
          accounting: {
            schemaVersion: 1,
            eventId: "event:tampered",
            teamId: fixture.teams[0].teamId,
            sequence: 1,
            logicalTime: 1,
            domain: "cyber",
            evidenceDigest: delivery.deliveryDigest,
          },
          peerIndex: 0,
          delivery,
          observations: [{ ...observation, payload: { state: "substituted" } }],
        }),
    /partial_observation_binding_invalid|observation_digest_invalid/u,
  );
});

test("cross-domain observation accounting preserves a per-domain breakdown", () => {
  const fixture = makeCrossDomainFixture();
  const runtime = evaluation.createScalableEvaluationRuntimeV1({
    definition: fixture.definition,
    descriptor: fixture.descriptor,
  });
  const observations = ["physical", "cyber"].map((domain) => {
    const schema = fixture.descriptor.observationSchemas.find(
      (candidate) => candidate.domain === domain,
    );
    return environment.createMultiDomainObservationEnvelopeV1({
      descriptor: fixture.descriptor,
      observationId: `observation:${domain}`,
      domain,
      entityId: "entity:0",
      modality: schema.modality,
      schemaDigest: schema.schemaDigest,
      logicalTime: 1,
      payload: { domain },
    });
  });
  const deliveryBody = {
    schemaVersion: 1,
    requestId: "pull:cross-domain",
    peerIndex: 0,
    logicalTime: 1,
    observations,
    nextCursor: null,
  };
  const delivery = {
    ...deliveryBody,
    deliveryDigest: sharded.shardedSimulationDigestV1(
      "sharded-simulation-observation-delivery-v1",
      deliveryBody,
    ),
  };
  runtime.recordPartialObservationV1({
    accounting: {
      schemaVersion: 1,
      eventId: "event:cross-domain",
      teamId: fixture.teams[0].teamId,
      sequence: 1,
      logicalTime: 1,
      domain: "cyber",
      evidenceDigest: delivery.deliveryDigest,
    },
    peerIndex: 0,
    delivery,
    observations,
  });
  const summary = runtime
    .snapshotV1()
    .teamSummaries.find(
      (candidate) => candidate.teamId === fixture.teams[0].teamId,
    );
  assert.equal(summary.counters.observations, 2);
  assert.equal(summary.countersByDomain.physical.observations, 1);
  assert.equal(summary.countersByDomain.cyber.observations, 1);
  assert.equal(summary.countersByDomain.cyber.interactions, 1);
  assert.equal(summary.countersByDomain.physical.interactions, 0);
});

test("recovery-to-baseline accepts only verified measurements and reports signed deltas", async () => {
  const fixture = makeFixture({ maximumRetainedRecords: 4 });
  const runtime = evaluation.createScalableEvaluationRuntimeV1({
    definition: fixture.definition,
    descriptor: fixture.adapter.descriptor,
  });
  const baselineMetrics = [
    {
      metricId: "mission-progress",
      valueBasisPoints: 9_000,
      toleranceBasisPoints: 200,
    },
    {
      metricId: "service-health",
      valueBasisPoints: 9_500,
      toleranceBasisPoints: 100,
    },
  ];
  runtime.registerRecoveryBaselineV1({
    baselineId: "baseline:left",
    teamId: fixture.teams[0].teamId,
    domain: "cyber",
    establishedAtLogicalTime: 0,
    metrics: baselineMetrics,
  });
  assert.throws(
    () => runtime.recordPerturbationObservationV1({ receipt: {} }),
    /perturbation_evidence_not_verified/u,
  );
  const evidence = evidenceHarness(fixture);
  const perturbation = fixture.definition.perturbations.find(
    (entry) => entry.perturbationId === "perturbation:benign",
  );
  const sessionId = "session:runtime-evidence";
  const episodeId = "episode:runtime-evidence";
  runtime.bindTeamEnvironmentV1({
    teamId: fixture.teams[0].teamId,
    sessionId,
    episodeId,
  });
  const issuedInjection =
    await evaluation.issueScalableEvaluationPerturbationInjectionReceiptV1({
      evaluationDefinitionDigest: fixture.definition.definitionDigest,
      scenarioManifestDigest: fixture.definition.scenarioManifestDigest,
      adapterDescriptorDigest: fixture.definition.adapterDescriptorDigest,
      perturbationId: perturbation.perturbationId,
      teamId: fixture.teams[0].teamId,
      perturbationConfigurationDigest: perturbation.configurationDigest,
      sessionId,
      episodeId,
      scheduledAtLogicalTime: perturbation.scheduledAtLogicalTime,
      injectedAtLogicalTime: 1,
      sourceEvidenceDigest: evaluation.scalableEvaluationDigestV1(
        "test-injection-evidence",
        { injected: true },
      ),
      ...evidence.signing,
    });
  const verifiedInjection =
    await evaluation.verifyScalableEvaluationPerturbationInjectionReceiptV1({
      receipt: issuedInjection,
      verifier: evidence.verifier,
      definition: fixture.definition,
      perturbation,
      teamId: fixture.teams[0].teamId,
      sessionId,
      episodeId,
      logicalTime: 1,
    });
  const otherRun = evaluation.createScalableEvaluationRuntimeV1({
    definition: fixture.definition,
    descriptor: fixture.adapter.descriptor,
  });
  otherRun.bindTeamEnvironmentV1({
    teamId: fixture.teams[0].teamId,
    sessionId: "session:other-runtime",
    episodeId: "episode:other-runtime",
  });
  assert.throws(
    () =>
      otherRun.recordPerturbationObservationV1({
        receipt: verifiedInjection,
      }),
    /evaluation_evidence_environment_binding_invalid/u,
  );
  runtime.recordPerturbationObservationV1({
    receipt: verifiedInjection,
  });
  runtime.recordAccountingV1(
    activity(fixture, {
      eventId: "event:recover-1",
      sequence: 1,
      logicalTime: 2,
      kind: "recovery",
    }),
  );
  runtime.recordAccountingV1(
    activity(fixture, {
      eventId: "event:recover-2",
      sequence: 2,
      logicalTime: 3,
      kind: "message",
      messageCount: 1,
      messageBytes: 8,
    }),
  );
  const degradedMeasurement = await verifiedRecoveryMeasurement({
    fixture,
    evidence,
    perturbation,
    sessionId,
    episodeId,
    sampleId: "sample:degraded",
    logicalTime: 4,
    metrics: [
      { metricId: "service-health", valueBasisPoints: 8_000 },
      { metricId: "mission-progress", valueBasisPoints: 7_000 },
    ],
  });
  const degraded = runtime.recordRecoverySampleV1({
    measurement: degradedMeasurement,
  });
  assert.equal(degraded.withinBaselineTolerance, false);
  assert.throws(
    () => runtime.recordRecoverySampleV1({ measurement: issuedInjection }),
    /recovery_evidence_not_verified/u,
  );
  const recoveredMeasurement = await verifiedRecoveryMeasurement({
    fixture,
    evidence,
    perturbation,
    sessionId,
    episodeId,
    sampleId: "sample:recovered",
    logicalTime: 5,
    metrics: [
      { metricId: "mission-progress", valueBasisPoints: 8_850 },
      { metricId: "service-health", valueBasisPoints: 9_450 },
    ],
  });
  const recovered = runtime.recordRecoverySampleV1({
    measurement: recoveredMeasurement,
  });
  assert.equal(recovered.withinBaselineTolerance, true);
  assert.equal(recovered.recoveryInteractions, 2);
  assert.equal(recovered.recoveryMessages, 1);

  runtime.recordAccountingV1({
    ...activity(fixture, {
      eventId: "event:right",
      sequence: 1,
      logicalTime: 1,
      kind: "decision",
    }),
    teamId: fixture.teams[1].teamId,
  });
  const comparison = runtime.compareV1();
  assert.equal(comparison.left.recoveredEpisodeCount, 1);
  assert.equal(comparison.left.completedRecoveryInteractions, 2);
  assert.equal(comparison.leftMinusRight.interactions, 1);
  assert.equal("winner" in comparison, false);
  const recovery = runtime.snapshotV1().recoverySummaries[0];
  assert.equal(recovery.recoveryInteractions, 2);
  assert.equal(recovery.recoveryMessages, 1);

  runtime.bindTeamEnvironmentV1({
    teamId: fixture.teams[1].teamId,
    sessionId: "session:runtime-evidence:right",
    episodeId: "episode:runtime-evidence:right",
  });
  const exported = runtime.exportStateV1();
  const rehash = (state) => {
    const body = { ...state };
    delete body.stateDigest;
    state.stateDigest = evaluation.scalableEvaluationDigestV1(
      "runtime-state",
      body,
    );
    return state;
  };
  const restore = (state) =>
    evaluation.restoreScalableEvaluationRuntimeV1({
      definition: fixture.definition,
      descriptor: fixture.adapter.descriptor,
      state: rehash(state),
    });

  const substitutedBaseline = structuredClone(exported);
  substitutedBaseline.recoveries[0].baseline = structuredClone(
    substitutedBaseline.recoveries[0].baseline,
  );
  substitutedBaseline.recoveries[0].baseline.metrics[0].valueBasisPoints -= 1;
  const substitutedBaselineBody = {
    ...substitutedBaseline.recoveries[0].baseline,
  };
  delete substitutedBaselineBody.baselineDigest;
  substitutedBaseline.recoveries[0].baseline.baselineDigest =
    evaluation.scalableEvaluationDigestV1(
      "recovery-baseline",
      substitutedBaselineBody,
    );
  assert.throws(
    () => restore(substitutedBaseline),
    /runtime_state_recovery_invalid/u,
  );

  const inconsistentTerminalState = structuredClone(exported);
  inconsistentTerminalState.recoveries[0].recoveredAtLogicalTime = null;
  assert.throws(
    () => restore(inconsistentTerminalState),
    /runtime_state_recovery_invalid/u,
  );

  const substitutedObservationTime = structuredClone(exported);
  substitutedObservationTime.recoveries[0].observedAtLogicalTime += 1;
  assert.throws(
    () => restore(substitutedObservationTime),
    /runtime_state_recovery_invalid/u,
  );

  const missingRecovery = structuredClone(exported);
  missingRecovery.recoveries.pop();
  assert.throws(
    () => restore(missingRecovery),
    /runtime_state_recovery_set_invalid/u,
  );
});

function evidenceHarness(fixture) {
  const providerId = "provider:runtime-evidence";
  const keyId = "key:runtime-ed25519";
  const authorization =
    evaluation.createScalableEvaluationEvidenceProviderAuthorizationV1({
      authorizationId: "authorization:runtime-evidence",
      providerId,
      keyId,
      status: "active",
      evidenceKinds: ["perturbation_injection", "recovery_measurement"],
      evaluationDefinitionDigest: fixture.definition.definitionDigest,
      scenarioManifestDigest: fixture.definition.scenarioManifestDigest,
      adapterDescriptorDigest: fixture.definition.adapterDescriptorDigest,
      teamIds: fixture.teams.map((team) => team.teamId),
    });
  const signer = {
    async sign(input) {
      const signature = await evidenceCrypto.subtle.sign(
        "Ed25519",
        evidenceKeys.privateKey,
        new TextEncoder().encode(input.evidenceDigest),
      );
      return Buffer.from(signature).toString("base64url");
    },
  };
  return {
    signing: {
      providerId,
      keyId,
      authorizationDigest: authorization.authorizationDigest,
      signer,
    },
    verifier: new evaluation.WebCryptoScalableEvaluationEvidenceVerifierV1({
      authorizations: {
        async resolve(input) {
          return input.authorizationDigest === authorization.authorizationDigest
            ? authorization
            : null;
        },
      },
      keys: {
        async resolve(input) {
          return input.providerId === providerId && input.keyId === keyId
            ? evidenceKeys.publicKey
            : null;
        },
      },
    }),
  };
}

async function verifiedRecoveryMeasurement(input) {
  const issued =
    await evaluation.issueScalableEvaluationRecoveryMeasurementReceiptV1({
      sampleId: input.sampleId,
      evaluationDefinitionDigest: input.fixture.definition.definitionDigest,
      scenarioManifestDigest: input.fixture.definition.scenarioManifestDigest,
      adapterDescriptorDigest: input.fixture.definition.adapterDescriptorDigest,
      perturbationId: input.perturbation.perturbationId,
      perturbationConfigurationDigest: input.perturbation.configurationDigest,
      teamId: input.fixture.teams[0].teamId,
      domain: input.perturbation.domain,
      sessionId: input.sessionId,
      episodeId: input.episodeId,
      scheduledAtLogicalTime: input.perturbation.scheduledAtLogicalTime,
      logicalTime: input.logicalTime,
      metrics: input.metrics,
      sourceEvidenceDigest: evaluation.scalableEvaluationDigestV1(
        "test-recovery-evidence",
        { sampleId: input.sampleId },
      ),
      ...input.evidence.signing,
    });
  return evaluation.verifyScalableEvaluationRecoveryMeasurementReceiptV1({
    receipt: issued,
    verifier: input.evidence.verifier,
    definition: input.fixture.definition,
    perturbation: input.perturbation,
    teamId: input.fixture.teams[0].teamId,
    sampleId: input.sampleId,
    sessionId: input.sessionId,
    episodeId: input.episodeId,
    logicalTime: input.logicalTime,
  });
}

function makeFixture(options = {}) {
  const profileId = options.profileId ?? "standard-500";
  const shardedProfileId = {
    "standard-500": "peers-500-interactions-5000",
    "large-5000": "peers-5000-interactions-50000",
    "frontier-100000": "peers-100000-interactions-1000000",
  }[profileId];
  const adapter = environment.createReferenceMultiDomainEnvironmentAdapterV1({
    domain: "cyber",
    adapterId: "reference:scalable-evaluation",
  });
  const baseScenario =
    environment.createReferenceMultiDomainScenarioDefinitionV1({
      adapter,
      scenarioId: "scenario:scalable-evaluation",
      scaleProfileId: shardedProfileId,
      seed: 47,
    });
  const profile = evaluation.createScalableEvaluationProfileV1({
    profileId,
    maximumInteractions: options.maximumInteractions,
    maximumMessages: options.maximumMessages,
    maximumMessageBytes: options.maximumMessageBytes,
    maximumRetainedRecords: options.maximumRetainedRecords,
  });
  const teams = [
    evaluation.createScalableEvaluationTeamDescriptorV1({
      teamId: "team:distributed",
      architecture: "distributed",
      implementationId: "collective-runtime",
      implementationVersion: "1.0.0",
      implementationDigest: evaluation.scalableEvaluationDigestV1(
        "implementation",
        { kind: "distributed" },
      ),
    }),
    evaluation.createScalableEvaluationTeamDescriptorV1({
      teamId: "team:centralized",
      architecture: "centralized",
      implementationId: "central-controller",
      implementationVersion: "1.0.0",
      implementationDigest: evaluation.scalableEvaluationDigestV1(
        "implementation",
        { kind: "centralized" },
      ),
    }),
  ];
  const kinds = options.includeAllPerturbations
    ? ["benign", "byzantine", "rogue", "context_poisoning"]
    : ["benign"];
  const perturbations = kinds.map((kind, index) =>
    evaluation.createScalableEvaluationPerturbationV1({
      perturbationId: `perturbation:${kind}`,
      kind,
      domain: "cyber",
      scheduledAtLogicalTime: index + 1,
      targetTeamIds: teams.map((team) => team.teamId),
      targetAgentCount: options.targetAgentCount ?? 50,
      targetSelectorDigest: evaluation.scalableEvaluationDigestV1("selector", {
        kind,
      }),
    }),
  );
  const partialObservability =
    evaluation.createScalableEvaluationPartialObservabilityV1({
      scope: "peer_local",
      maximumObservationsPerPull: 4,
      allowCrossDomainAggregation: false,
      sourceVisibilityPolicyDigest: baseScenario.visibilityPolicyDigest,
    });
  const matchup = evaluation.createScalableEvaluationMatchupV1({
    leftTeamId: teams[0].teamId,
    rightTeamId: teams[1].teamId,
    referenceSide: "right",
  });
  const definition = evaluation.createScalableEvaluationDefinitionV1({
    evaluationId: "evaluation:scalable",
    profile,
    descriptor: adapter.descriptor,
    scenario: baseScenario,
    partialObservability,
    teams,
    matchup,
    perturbations,
  });
  return {
    adapter,
    scenario: baseScenario,
    profile,
    teams,
    definition,
  };
}

function makeCrossDomainFixture() {
  const physical = environment.createReferenceMultiDomainEnvironmentAdapterV1({
    domain: "physical",
    adapterId: "reference:physical-for-cross-domain",
  });
  const cyber = environment.createReferenceMultiDomainEnvironmentAdapterV1({
    domain: "cyber",
    adapterId: "reference:cyber-for-cross-domain",
  });
  const descriptor = environment.createMultiDomainEnvironmentDescriptorV1({
    adapterId: "reference:cross-domain",
    adapterVersion: 1,
    implementationDigest: evaluation.scalableEvaluationDigestV1(
      "implementation",
      { kind: "cross-domain" },
    ),
    domains: ["physical", "cyber"],
    capabilities: [
      ...physical.descriptor.capabilities,
      ...cyber.descriptor.capabilities,
    ],
    observationSchemas: [
      ...physical.descriptor.observationSchemas,
      ...cyber.descriptor.observationSchemas,
    ],
    actionSchemas: [
      ...physical.descriptor.actionSchemas,
      ...cyber.descriptor.actionSchemas,
    ],
    limits: physical.descriptor.limits,
    deterministicReplay: true,
  });
  const profile = evaluation.createScalableEvaluationProfileV1({
    profileId: "standard-500",
  });
  const scenario = {
    schemaVersion: 1,
    scenarioId: "scenario:cross-domain",
    scaleProfileId: profile.shardedProfileId,
    seed: 61,
    domains: ["physical", "cyber"],
    entityCount: profile.agentCount,
    topologyDigest: evaluation.scalableEvaluationDigestV1("topology", {
      kind: "cross-domain",
    }),
    transitionPolicyDigest: evaluation.scalableEvaluationDigestV1(
      "transition-policy",
      { kind: "cross-domain" },
    ),
    visibilityPolicyDigest: evaluation.scalableEvaluationDigestV1(
      "visibility-policy",
      { kind: "cross-domain" },
    ),
    faultModelDigest: evaluation.scalableEvaluationDigestV1("fault-model", {
      kind: "cross-domain",
    }),
    resourceBudget: {
      maximumInteractions: profile.budget.maximumInteractions,
      maximumObservationBytes: descriptor.limits.maximumObservationBytes,
      maximumActionBytes: descriptor.limits.maximumActionBytes,
      maximumCheckpointBytes: descriptor.limits.maximumCheckpointBytes,
    },
  };
  const teams = makeFixture().teams;
  const partialObservability =
    evaluation.createScalableEvaluationPartialObservabilityV1({
      scope: "partition_scoped",
      maximumObservationsPerPull: 4,
      allowCrossDomainAggregation: true,
      sourceVisibilityPolicyDigest: scenario.visibilityPolicyDigest,
    });
  const definition = evaluation.createScalableEvaluationDefinitionV1({
    evaluationId: "evaluation:cross-domain",
    profile,
    descriptor,
    scenario,
    partialObservability,
    teams,
    perturbations: [],
  });
  return { descriptor, teams, definition };
}

function activity(fixture, overrides) {
  return {
    schemaVersion: 1,
    eventId: overrides.eventId,
    teamId: fixture.teams[0].teamId,
    sequence: overrides.sequence,
    logicalTime: overrides.logicalTime,
    domain: "cyber",
    kind: overrides.kind ?? "decision",
    interactionCount: 1,
    messageCount: overrides.messageCount ?? 0,
    messageBytes: overrides.messageBytes ?? 0,
    observationCount: 0,
    observationCountsByDomain: { physical: 0, social: 0, cyber: 0 },
    actionCount: 0,
    successfulOutcomeCount: 0,
    failedOutcomeCount: 0,
    evidenceDigest: evaluation.scalableEvaluationDigestV1("evidence", {
      eventId: overrides.eventId,
    }),
  };
}
