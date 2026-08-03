import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  COLLECTIVE_STATISTICAL_CAMPAIGN_SCALE_LADDER_V1,
  createCollectiveStatisticalCampaignFaultCoverageV1,
  createCollectiveStatisticalCampaignFaultMatrixV1,
  createCollectiveStatisticalCampaignScaleConfigurationV1,
  createCollectiveClosedLoopReferenceRuntimeV1,
  createCollectiveClosedLoopResilienceReferenceScenarioV1,
  digestCollectiveStatisticalCampaignBundleV1,
  runPairedCollectiveClosedLoopResilienceCampaignV1,
} from "@agentplat/mesh-sim";
import {
  COLLECTIVE_EVALUATION_PREFLIGHT_CAMPAIGN_PROFILE_V1,
  collectiveEvaluationCampaignProfileCellsV1,
} from "@agentplat/collective-planning/evaluation";
import {
  PLANNING_CONFORMANCE_CAPABILITIES_V1,
  createPlanningConformanceReportV1,
  runPlanningConformanceV1,
  validatePlanningConformanceReportV1,
} from "@agentplat/mesh-conformance/planning";

const peerCount = 3;
const preflightCells = collectiveEvaluationCampaignProfileCellsV1(
  COLLECTIVE_EVALUATION_PREFLIGHT_CAMPAIGN_PROFILE_V1,
  "packed-consumer-preflight",
);
const scaleConfiguration =
  createCollectiveStatisticalCampaignScaleConfigurationV1({
    schemaVersion: 1,
    agentCount: 50,
    seed: 0,
    stratum: "nominal",
  });
const faultMatrix = createCollectiveStatisticalCampaignFaultMatrixV1();
const nominalCoverage = createCollectiveStatisticalCampaignFaultCoverageV1({
  schemaVersion: 1,
  stratum: "nominal",
  registeredFaultFamilies: [],
  observedFaultFamilies: [],
});
assert.equal(preflightCells.length, 8);
assert.deepEqual(
  COLLECTIVE_STATISTICAL_CAMPAIGN_SCALE_LADDER_V1.map(
    (entry) => entry.agentCount,
  ),
  [50, 100, 250, 500],
);
assert.equal(scaleConfiguration.topology.peerIds.length, 50);
assert.equal(scaleConfiguration.topology.edges.length, 300);
assert.equal(faultMatrix.rows.length, 4);
assert.equal(nominalCoverage.observedFaultFamilies.length, 0);
assert.match(
  digestCollectiveStatisticalCampaignBundleV1({
    schemaVersion: 1,
    campaignId: "packed-consumer-preflight",
    sourceLockArtifactId: "source-lock",
    registrationArtifactId: "registration",
    manifestArtifactId: "manifest",
    cells: [],
    expectedArtifacts: [],
    artifacts: [],
    summaryArtifactId: "summary",
  }),
  /^sha256:[0-9a-f]{64}$/,
);
const runtime = await createCollectiveClosedLoopReferenceRuntimeV1(peerCount);
const createScenario = (runner) =>
  createCollectiveClosedLoopResilienceReferenceScenarioV1({
    runner,
    peerCount,
    runtime,
  });

const report = await runPairedCollectiveClosedLoopResilienceCampaignV1({
  schemaVersion: 1,
  createAdaptiveInput: () => createScenario("adaptive_collective"),
  createCentralizedInput: () => createScenario("centralized_planner"),
});

const adaptive = report.adaptive.first;
const centralized = report.centralized.first;
assert.equal(report.matched, true);
assert.equal(adaptive.resilience.run.stopReason, "plan_completed");
assert.equal(centralized.resilience.run.stopReason, "plan_completed");
assert.equal(adaptive.action.receipt?.status, "committed");
assert.equal(adaptive.faultMatrix.records.length, 6);
assert.equal(
  adaptive.faultMatrix.records.every((record) => record.observed),
  true,
);
assert.ok(adaptive.resilience.staleResultRejections.length > 0);

// This interpreter is intentionally limited to public conformance fixtures.
// The campaign assertions above, not this adapter, exercise the resilience runtime.
const conformanceCases = await runPlanningConformanceV1({
  declaredCapabilities: PLANNING_CONFORMANCE_CAPABILITIES_V1,
  factory: () => ({
    assess(challenge) {
      const input = challenge.input;
      const rejected = {
        "intent.validate": "unknown_field",
        "proposal.validate": "scope_widening",
        "reducer.apply": "dependency_cycle",
        "snapshot.restore":
          input.snapshotScope !== input.targetScope
            ? "snapshot_scope_mismatch"
            : "snapshot_rollback",
        "replanning.apply": "causal_predecessor_missing",
        "effect.apply": "stale_fence",
        "mesh-projection.validate": "assignment_binding_mismatch",
        "evaluation.artifact.validate": "private_evidence_disclosed",
      };
      const durableReopenAccepted =
        input.operation === "durability.reopen" &&
        typeof input.scope === "string" &&
        input.scope.length > 0 &&
        typeof input.expectedStateDigest === "string" &&
        /^sha256:[0-9a-f]{64}$/.test(input.expectedStateDigest) &&
        Number.isSafeInteger(input.expectedFenceHighWater) &&
        input.expectedFenceHighWater >= 0;
      const exactReplayAccepted =
        input.operation === "reducer.replay" &&
        Array.isArray(input.commands) &&
        input.commands.length === 2 &&
        JSON.stringify(input.commands[0]) === JSON.stringify(input.commands[1]);
      const reasonCode =
        rejected[input.operation] ??
        (input.operation === "reducer.replay"
          ? exactReplayAccepted
            ? null
            : "replay_not_exact"
          : input.operation === "durability.reopen"
            ? durableReopenAccepted
              ? null
              : "restart_high_water_invalid"
            : "unsupported_operation");
      const verdict = reasonCode === null ? "accepted" : "rejected";
      return {
        schemaVersion: 1,
        caseId: challenge.caseId,
        fixtureDigest: challenge.fixtureDigest,
        verdict,
        reasonCode,
        evidenceDigest: fixtureAssessmentDigest(
          challenge.caseId,
          input.operation,
          verdict,
          reasonCode,
        ),
      };
    },
  }),
});
const conformanceReport = validatePlanningConformanceReportV1(
  createPlanningConformanceReportV1({
    implementation: {
      name: "agentplat-planning-fixture-interpreter",
      version: "0.3.0-beta.3",
    },
    declaredCapabilities: PLANNING_CONFORMANCE_CAPABILITIES_V1,
    seed: 0,
    cases: conformanceCases,
  }),
);
assert.equal(conformanceReport.verdict, "passed");

process.stdout.write(
  `${JSON.stringify({
    status: "passed",
    runners: [
      adaptive.resilience.run.runner,
      centralized.resilience.run.runner,
    ],
    campaignEvidenceDigest: adaptive.campaignEvidence.campaignEvidenceDigest,
    fairnessDigest: report.fairnessDigest,
    matrixDigest: adaptive.faultMatrix.matrixDigest,
    resilienceResultDigest: adaptive.resilience.resilienceResultDigest,
    fixtureAdapter: {
      implementation: conformanceReport.implementation.name,
      verdict: conformanceReport.verdict,
      suiteDigest: conformanceReport.suiteDigest,
      passedCases: conformanceReport.counts.passed,
      scope: "public_fixture_integration_only",
    },
    statisticalCampaignContractSmoke: {
      scope: "registration_and_configuration_only",
      preflightCells: preflightCells.length,
      scaleAgents: COLLECTIVE_STATISTICAL_CAMPAIGN_SCALE_LADDER_V1.map(
        (entry) => entry.agentCount,
      ),
      topologyEdges: scaleConfiguration.topology.edges.length,
    },
  })}\n`,
);

function fixtureAssessmentDigest(caseId, operation, verdict, reasonCode) {
  return `sha256:${createHash("sha256")
    .update(
      JSON.stringify({
        schemaVersion: 1,
        caseId,
        operation,
        verdict,
        reasonCode,
      }),
    )
    .digest("hex")}`;
}
