import assert from "node:assert/strict";
import test from "node:test";

const benchmark =
  await import("../packages/mesh-sim/dist/verified-benchmark.js");
const environment =
  await import("../packages/mesh-sim/dist/multi-domain-environment.js");

const digest = (label, value) =>
  benchmark.verifiedBenchmarkDigestV1(label, value);
const evidenceVerifier = Object.freeze({
  verifierId: "registered-evaluator:test-v1",
  verify({
    traceEvidence,
    participantDescriptor,
    artifactLock,
    suiteManifest,
  }) {
    return (
      traceEvidence.participantDescriptorDigest ===
        participantDescriptor.descriptorDigest &&
      traceEvidence.artifactLockDigest === artifactLock.lockDigest &&
      traceEvidence.scenarioManifestDigest ===
        suiteManifest.scenarioManifest.manifestDigest
    );
  },
});

const verificationInput = (
  submission,
  fixture,
  verifier = evidenceVerifier,
) => ({
  submission,
  environmentDescriptor: fixture.adapter.descriptor,
  suiteManifestDigest: fixture.suite.manifestDigest,
  evidenceVerifier: verifier,
});

function participant(adapterId, coordinationModel = "collective") {
  return benchmark.createEvaluationParticipantDescriptorV1({
    adapterId,
    adapterVersion: 1,
    coordinationModel,
    implementationDigest: digest("implementation", { adapterId }),
    capabilities: ["trace-evidence", "replay-lock"],
  });
}

function lock(name) {
  return benchmark.createBenchmarkArtifactSourceLockV1({
    sourceId: `source:${name}`,
    sourceDigest: digest("source", { name }),
    artifactId: `artifact:${name}`,
    artifactDigest: digest("artifact", { name }),
    buildDigest: digest("build", { name }),
  });
}

async function fixture(profileId = "peers-500-interactions-5000", seed = 43) {
  const adapter = environment.createReferenceMultiDomainEnvironmentAdapterV1({
    domain: "cyber",
  });
  const definition = environment.createReferenceMultiDomainScenarioDefinitionV1(
    {
      adapter,
      scenarioId: `scenario:${profileId}:${seed}`,
      scaleProfileId: profileId,
      seed,
    },
  );
  const scenario = await adapter.createScenario(definition);
  const baselineParticipant = participant("open-baseline", "centralized");
  const baselineLock = lock("baseline");
  const suite = benchmark.createBenchmarkSuiteManifestV1({
    suiteId: `suite:${profileId}`,
    suiteVersion: 1,
    environmentDescriptor: adapter.descriptor,
    scenarioManifest: scenario,
    baselineParticipant,
    baselineArtifactLock: baselineLock,
  });
  const baselineTrace = benchmark.createBenchmarkTraceEvidenceV1({
    traceId: `trace:baseline:${profileId}:${seed}`,
    participantDescriptor: baselineParticipant,
    scenarioManifest: scenario,
    artifactLock: baselineLock,
    interactionCount: 100,
    successfulObjectiveCount: 60,
    recoveryToBaselineCount: 50,
    roleCoherenceLength: 70,
  });
  const pairedBaseline = benchmark.createPairedBaselineEvidenceV1({
    participantDescriptor: baselineParticipant,
    artifactLock: baselineLock,
    scenarioManifest: scenario,
    traceEvidence: baselineTrace,
  });
  return { adapter, scenario, suite, pairedBaseline };
}

function submission(input) {
  const candidate = participant(input.adapterId ?? "third-party:example");
  const candidateLock = lock(input.adapterId ?? "candidate");
  const trace = benchmark.createBenchmarkTraceEvidenceV1({
    traceId: input.traceId ?? `trace:${input.adapterId ?? "candidate"}`,
    participantDescriptor: candidate,
    scenarioManifest: input.scenario,
    artifactLock: candidateLock,
    interactionCount: input.interactionCount ?? 100,
    successfulObjectiveCount: input.success ?? 80,
    recoveryToBaselineCount: input.recovery ?? 70,
    roleCoherenceLength: input.coherence ?? 90,
  });
  return benchmark.createVerifiedBenchmarkSubmissionV1({
    submissionId:
      input.submissionId ?? `submission:${input.adapterId ?? "candidate"}`,
    participantDescriptor: candidate,
    artifactLock: candidateLock,
    suiteManifest: input.suite,
    traceEvidence: trace,
    pairedBaseline: input.pairedBaseline,
  });
}

test("third-party participant descriptors are open, exact, and evaluator metrics are derived only from trace evidence", async () => {
  const result = await fixture();
  const { scenario, suite, pairedBaseline } = result;
  const record = submission({
    adapterId: "third.party/solver-v7",
    scenario,
    suite,
    pairedBaseline,
  });
  const verification = benchmark.verifyVerifiedBenchmarkSubmissionV1(
    verificationInput(record, result),
  );
  assert.equal(verification.eligible, true);
  assert.equal(verification.metricProjection.compositeScoreBps, 8000);
  assert.equal("metricProjection" in record, false);
  assert.throws(
    () =>
      benchmark.createEvaluationParticipantDescriptorV1({
        adapterId: "third.party/solver-v7",
        adapterVersion: 1,
        coordinationModel: "collective",
        implementationDigest: digest("implementation", 1),
        capabilities: ["x"],
        ignored: true,
      }),
    /shape_invalid/u,
  );
});

test("suite locks environment scenario profile seed and budget for 500, 5K and 100K/1M profiles", async () => {
  for (const profileId of [
    "peers-500-interactions-5000",
    "peers-5000-interactions-50000",
    "peers-100000-interactions-1000000",
  ]) {
    const { adapter, suite } = await fixture(profileId, 97);
    const validated = benchmark.validateBenchmarkSuiteManifestV1(
      suite,
      adapter.descriptor,
    );
    assert.equal(validated.scaleProfile.profileId, profileId);
    assert.equal(validated.seed, 97);
    assert.equal(
      validated.scenarioManifest.resourceBudget.maximumInteractions,
      validated.scaleProfile.interactionCeiling,
    );
  }
});

test("artifact/source substitution and replay binding mismatch are rejected before ranking", async () => {
  const result = await fixture();
  const { scenario, suite, pairedBaseline } = result;
  const good = submission({
    scenario,
    suite,
    pairedBaseline,
    adapterId: "candidate-good",
  });
  const substitutedTrace = benchmark.createBenchmarkTraceEvidenceV1({
    traceId: "trace:substituted",
    participantDescriptor: good.participantDescriptor,
    scenarioManifest: scenario,
    artifactLock: lock("substituted-artifact"),
    interactionCount: 100,
    successfulObjectiveCount: 95,
    recoveryToBaselineCount: 95,
    roleCoherenceLength: 95,
  });
  const substituted = benchmark.createVerifiedBenchmarkSubmissionV1({
    submissionId: "submission:substituted",
    participantDescriptor: good.participantDescriptor,
    artifactLock: good.artifactLock,
    suiteManifest: suite,
    traceEvidence: substitutedTrace,
    pairedBaseline,
  });
  assert.equal(
    benchmark.verifyVerifiedBenchmarkSubmissionV1(
      verificationInput(substituted, result),
    ).reason,
    "trace_binding_mismatch",
  );
  const replayed = {
    ...good,
    replayDigest: digest("wrong-replay", { good: true }),
  };
  assert.equal(
    benchmark.verifyVerifiedBenchmarkSubmissionV1(
      verificationInput(replayed, result),
    ).eligible,
    false,
  );
});

test("leaderboard is deterministic, ties share rank, and ineligible submissions have no rank", async () => {
  const result = await fixture();
  const { adapter, scenario, suite, pairedBaseline } = result;
  const first = submission({
    adapterId: "alpha",
    scenario,
    suite,
    pairedBaseline,
    success: 90,
    recovery: 80,
    coherence: 70,
  });
  const second = submission({
    adapterId: "beta",
    scenario,
    suite,
    pairedBaseline,
    success: 90,
    recovery: 80,
    coherence: 70,
  });
  const overBudget = submission({
    adapterId: "too-many",
    scenario,
    suite,
    pairedBaseline,
    interactionCount: 5_001,
    success: 1,
    recovery: 1,
    coherence: 1,
  });
  const options = {
    environmentDescriptor: adapter.descriptor,
    suiteManifestDigest: suite.manifestDigest,
    evidenceVerifier,
  };
  const one = benchmark.buildBenchmarkLeaderboardV1({
    ...options,
    submissions: [second, overBudget, first],
  });
  const two = benchmark.buildBenchmarkLeaderboardV1({
    ...options,
    submissions: [first, second, overBudget],
  });
  assert.deepEqual(
    one.entries.map((entry) => [entry.rank, entry.participantDescriptorDigest]),
    two.entries.map((entry) => [entry.rank, entry.participantDescriptorDigest]),
  );
  assert.deepEqual(
    one.entries.map((entry) => entry.rank),
    [1, 1],
  );
  assert.equal(one.ineligibleSubmissions.length, 1);
  assert.equal(one.ineligibleSubmissions[0].reason, "budget_exceeded");
  assert.equal("rank" in one.ineligibleSubmissions[0], false);
});

test("paired baselines must replay the same scenario, seed, and resource budget", async () => {
  const first = await fixture("peers-500-interactions-5000", 10);
  const other = await fixture("peers-500-interactions-5000", 11);
  const mismatchedBaseline = benchmark.createPairedBaselineEvidenceV1({
    participantDescriptor: first.suite.baselineParticipant,
    artifactLock: first.suite.baselineArtifactLock,
    scenarioManifest: other.scenario,
    traceEvidence: benchmark.createBenchmarkTraceEvidenceV1({
      traceId: "trace:wrong-baseline-scenario",
      participantDescriptor: first.suite.baselineParticipant,
      scenarioManifest: other.scenario,
      artifactLock: first.suite.baselineArtifactLock,
      interactionCount: 100,
      successfulObjectiveCount: 1,
      recoveryToBaselineCount: 1,
      roleCoherenceLength: 1,
    }),
  });
  const candidate = submission({
    scenario: first.scenario,
    suite: first.suite,
    pairedBaseline: mismatchedBaseline,
  });
  const result = benchmark.verifyVerifiedBenchmarkSubmissionV1(
    verificationInput(candidate, first),
  );
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "baseline_replay_mismatch");
});

test("requires trusted evaluator provenance for candidate and baseline traces", async () => {
  const result = await fixture();
  const record = submission({
    scenario: result.scenario,
    suite: result.suite,
    pairedBaseline: result.pairedBaseline,
  });
  const rejected = benchmark.verifyVerifiedBenchmarkSubmissionV1(
    verificationInput(record, result, {
      verifierId: "registered-evaluator:reject-all",
      verify() {
        return false;
      },
    }),
  );
  assert.equal(rejected.eligible, false);
  assert.equal(rejected.reason, "trace_provenance_unverified");
});

test("rejects a paired baseline that exceeds the suite interaction budget", async () => {
  const result = await fixture();
  const baselineTrace = benchmark.createBenchmarkTraceEvidenceV1({
    traceId: "trace:over-budget-baseline",
    participantDescriptor: result.suite.baselineParticipant,
    scenarioManifest: result.scenario,
    artifactLock: result.suite.baselineArtifactLock,
    interactionCount: 5_001,
    successfulObjectiveCount: 1,
    recoveryToBaselineCount: 1,
    roleCoherenceLength: 1,
  });
  const pairedBaseline = benchmark.createPairedBaselineEvidenceV1({
    participantDescriptor: result.suite.baselineParticipant,
    artifactLock: result.suite.baselineArtifactLock,
    scenarioManifest: result.scenario,
    traceEvidence: baselineTrace,
  });
  const record = submission({
    scenario: result.scenario,
    suite: result.suite,
    pairedBaseline,
  });
  const rejected = benchmark.verifyVerifiedBenchmarkSubmissionV1(
    verificationInput(record, result),
  );
  assert.equal(rejected.reason, "baseline_budget_exceeded");
});

test("deduplicates exact submissions and replayed traces before ranking", async () => {
  const result = await fixture();
  const record = submission({
    submissionId: "submission:original",
    scenario: result.scenario,
    suite: result.suite,
    pairedBaseline: result.pairedBaseline,
  });
  const replayed = benchmark.createVerifiedBenchmarkSubmissionV1({
    submissionId: "submission:replayed-trace",
    participantDescriptor: record.participantDescriptor,
    artifactLock: record.artifactLock,
    suiteManifest: record.suiteManifest,
    traceEvidence: record.traceEvidence,
    pairedBaseline: record.pairedBaseline,
  });
  const leaderboard = benchmark.buildBenchmarkLeaderboardV1({
    environmentDescriptor: result.adapter.descriptor,
    suiteManifestDigest: result.suite.manifestDigest,
    evidenceVerifier,
    submissions: [record, record, replayed],
  });
  assert.equal(leaderboard.entries.length, 1);
  assert.deepEqual(
    leaderboard.ineligibleSubmissions.map((entry) => entry.reason).sort(),
    ["duplicate_submission", "replayed_trace"],
  );
});
