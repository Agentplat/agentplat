import { type MultiDomainEnvironmentDescriptorV1 } from "./multi-domain-environment-contracts.js";
import type { PlanningDigestV1 } from "@agentplat/collective-planning";
import type {
  BenchmarkIneligibilityReasonV1,
  BenchmarkTraceEvidenceVerifierV1,
  VerifiedBenchmarkIneligibleSubmissionV1,
  VerifiedBenchmarkLeaderboardEntryV1,
  VerifiedBenchmarkLeaderboardV1,
  VerifiedBenchmarkSubmissionV1,
  VerifiedBenchmarkVerificationV1,
} from "./verified-benchmark-contracts.js";
import {
  evaluatorMetricProjectionV2,
  validateBenchmarkArtifactSourceLockV1,
  validateBenchmarkTraceEvidenceV1,
  validateEvaluationParticipantDescriptorV1,
  validatePairedBaselineEvidenceV1,
  validateVerifiedBenchmarkSubmissionV1,
  verifiedBenchmarkDigestV1,
} from "./verified-benchmark-validation.js";

/**
 * Pure verification: no transport, clock, mutation, service, or provider is
 * required. Structural validation failures are ineligible rather than scored.
 */
export function verifyVerifiedBenchmarkSubmissionV1(input: {
  readonly submission: unknown;
  readonly environmentDescriptor: MultiDomainEnvironmentDescriptorV1;
  readonly suiteManifestDigest: PlanningDigestV1;
  readonly evidenceVerifier: BenchmarkTraceEvidenceVerifierV1;
}): VerifiedBenchmarkVerificationV1 {
  const evidenceVerifierId = verifierId(input.evidenceVerifier);
  let submissionDigest: PlanningDigestV1 | null = null;
  let participantDescriptorDigest: PlanningDigestV1 | null = null;
  try {
    const submission = validateVerifiedBenchmarkSubmissionV1(
      input.submission,
      input.environmentDescriptor,
    );
    submissionDigest = submission.submissionDigest;
    participantDescriptorDigest =
      submission.participantDescriptor.descriptorDigest;
    const reason = eligibilityReason(
      submission,
      input.suiteManifestDigest,
      input.evidenceVerifier,
    );
    const metricProjection =
      reason === null
        ? evaluatorMetricProjectionV2(submission.traceEvidence)
        : null;
    return verification({
      eligible: reason === null,
      evidenceVerifierId,
      submissionDigest,
      participantDescriptorDigest,
      metricProjection,
      reason,
    });
  } catch {
    return verification({
      eligible: false,
      evidenceVerifierId,
      submissionDigest,
      participantDescriptorDigest,
      metricProjection: null,
      reason: "submission_invalid",
    });
  }
}

export function buildBenchmarkLeaderboardV1(input: {
  readonly environmentDescriptor: MultiDomainEnvironmentDescriptorV1;
  readonly suiteManifestDigest: PlanningDigestV1;
  readonly evidenceVerifier: BenchmarkTraceEvidenceVerifierV1;
  readonly submissions: readonly unknown[];
}): VerifiedBenchmarkLeaderboardV1 {
  if (!Array.isArray(input.submissions) || input.submissions.length > 10_000)
    throw new TypeError("verified_benchmark_leaderboard_submissions_invalid");
  const evaluated = input.submissions.map((submission) => ({
    submission,
    verification: verifyVerifiedBenchmarkSubmissionV1({
      submission,
      environmentDescriptor: input.environmentDescriptor,
      suiteManifestDigest: input.suiteManifestDigest,
      evidenceVerifier: input.evidenceVerifier,
    }),
  }));
  const valid = evaluated
    .filter(({ verification }) => verification.eligible)
    .map(({ submission, verification }) => ({
      submission: validateVerifiedBenchmarkSubmissionV1(
        submission,
        input.environmentDescriptor,
      ),
      verification,
    }))
    .sort((left, right) =>
      left.submission.submissionDigest.localeCompare(
        right.submission.submissionDigest,
      ),
    );
  const unique: typeof valid = [];
  const duplicateRecords: VerifiedBenchmarkIneligibleSubmissionV1[] = [];
  const submissionDigests = new Set<string>();
  const replayDigests = new Set<string>();
  for (const candidate of valid) {
    const duplicate = submissionDigests.has(
      candidate.submission.submissionDigest,
    );
    const replayed = replayDigests.has(candidate.submission.replayDigest);
    if (duplicate || replayed) {
      duplicateRecords.push(
        ineligibleRecord({
          ...candidate.verification,
          eligible: false,
          metricProjection: null,
          reason: duplicate ? "duplicate_submission" : "replayed_trace",
        }),
      );
      continue;
    }
    submissionDigests.add(candidate.submission.submissionDigest);
    replayDigests.add(candidate.submission.replayDigest);
    unique.push(candidate);
  }
  unique.sort(
    (left, right) =>
      right.verification.metricProjection!.compositeScoreBps -
        left.verification.metricProjection!.compositeScoreBps ||
      left.verification.participantDescriptorDigest!.localeCompare(
        right.verification.participantDescriptorDigest!,
      ) ||
      left.verification.submissionDigest!.localeCompare(
        right.verification.submissionDigest!,
      ),
  );
  let previousScore: number | null = null;
  let rank = 0;
  const entries = unique.map(({ submission, verification: entry }, index) => {
    if (entry.metricProjection!.compositeScoreBps !== previousScore)
      rank = index + 1;
    previousScore = entry.metricProjection!.compositeScoreBps;
    const body = {
      schemaVersion: 1 as const,
      rank,
      submissionId: submission.submissionId,
      participantDescriptorDigest: entry.participantDescriptorDigest!,
      metricProjection: entry.metricProjection!,
    };
    return Object.freeze({
      ...body,
      entryDigest: verifiedBenchmarkDigestV1("leaderboard-entry", body),
    }) as VerifiedBenchmarkLeaderboardEntryV1;
  });
  const ineligible = evaluated
    .map(({ verification }) => verification)
    .filter((entry) => !entry.eligible)
    .map((entry) => ineligibleRecord(entry))
    .concat(duplicateRecords)
    .sort((left, right) =>
      `${left.reason}:${left.submissionDigest ?? ""}`.localeCompare(
        `${right.reason}:${right.submissionDigest ?? ""}`,
      ),
    );
  const body = {
    schemaVersion: 1 as const,
    entries: Object.freeze(entries),
    ineligibleSubmissions: Object.freeze(ineligible),
  };
  return Object.freeze({
    ...body,
    leaderboardDigest: verifiedBenchmarkDigestV1("leaderboard", body),
  });
}

function eligibilityReason(
  submission: VerifiedBenchmarkSubmissionV1,
  suiteManifestDigest: PlanningDigestV1,
  evidenceVerifier: BenchmarkTraceEvidenceVerifierV1,
): BenchmarkIneligibilityReasonV1 | null {
  const participant = validateEvaluationParticipantDescriptorV1(
    submission.participantDescriptor,
  );
  const artifact = validateBenchmarkArtifactSourceLockV1(
    submission.artifactLock,
  );
  const trace = validateBenchmarkTraceEvidenceV1(submission.traceEvidence);
  const suite = submission.suiteManifest;
  if (suite.manifestDigest !== suiteManifestDigest)
    return "suite_binding_mismatch";
  if (
    trace.participantDescriptorDigest !== participant.descriptorDigest ||
    trace.artifactLockDigest !== artifact.lockDigest ||
    trace.scenarioManifestDigest !== suite.scenarioManifest.manifestDigest
  )
    return "trace_binding_mismatch";
  if (
    trace.interactionCount >
    suite.scenarioManifest.resourceBudget.maximumInteractions
  )
    return "budget_exceeded";
  if (
    !evidenceVerifier.verify({
      role: "candidate",
      traceEvidence: trace,
      participantDescriptor: participant,
      artifactLock: artifact,
      suiteManifest: suite,
    })
  )
    return "trace_provenance_unverified";
  if (
    submission.replayDigest !==
    verifiedBenchmarkDigestV1("replay-binding", {
      participantDescriptorDigest: participant.descriptorDigest,
      scenarioManifestDigest: suite.scenarioManifest.manifestDigest,
      artifactLockDigest: artifact.lockDigest,
      traceDigest: trace.traceDigest,
    })
  )
    return "replay_binding_mismatch";
  const baseline = validatePairedBaselineEvidenceV1(submission.pairedBaseline);
  if (
    baseline.participantDescriptor.descriptorDigest !==
      suite.baselineParticipant.descriptorDigest ||
    baseline.artifactLock.lockDigest !== suite.baselineArtifactLock.lockDigest
  )
    return "baseline_binding_mismatch";
  if (
    baseline.traceEvidence.participantDescriptorDigest !==
      suite.baselineParticipant.descriptorDigest ||
    baseline.traceEvidence.artifactLockDigest !==
      suite.baselineArtifactLock.lockDigest ||
    baseline.traceEvidence.scenarioManifestDigest !==
      suite.scenarioManifest.manifestDigest
  )
    return "baseline_replay_mismatch";
  if (
    baseline.traceEvidence.interactionCount >
    suite.scenarioManifest.resourceBudget.maximumInteractions
  )
    return "baseline_budget_exceeded";
  if (
    !evidenceVerifier.verify({
      role: "baseline",
      traceEvidence: baseline.traceEvidence,
      participantDescriptor: baseline.participantDescriptor,
      artifactLock: baseline.artifactLock,
      suiteManifest: suite,
    })
  )
    return "baseline_provenance_unverified";
  return null;
}

function verification(
  input: Omit<
    VerifiedBenchmarkVerificationV1,
    "schemaVersion" | "verificationDigest"
  >,
): VerifiedBenchmarkVerificationV1 {
  const body = { schemaVersion: 1 as const, ...input };
  return Object.freeze({
    ...body,
    verificationDigest: verifiedBenchmarkDigestV1("verification", body),
  });
}
function ineligibleRecord(
  entry: VerifiedBenchmarkVerificationV1,
): VerifiedBenchmarkIneligibleSubmissionV1 {
  const body = {
    schemaVersion: 1 as const,
    submissionDigest: entry.submissionDigest,
    reason: entry.reason ?? "submission_invalid",
  };
  return Object.freeze({
    ...body,
    recordDigest: verifiedBenchmarkDigestV1("ineligible-submission", body),
  });
}
function verifierId(value: BenchmarkTraceEvidenceVerifierV1): string {
  if (
    !value ||
    typeof value !== "object" ||
    typeof value.verifierId !== "string" ||
    value.verifierId.length < 1 ||
    value.verifierId.length > 256 ||
    typeof value.verify !== "function"
  )
    return "invalid";
  return value.verifierId;
}
