import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  COLLECTIVE_EVALUATION_NORMATIVE_CAMPAIGN_PROFILE_V1,
  COLLECTIVE_EVALUATION_PREFLIGHT_CAMPAIGN_PROFILE_V1,
  campaignCellIdV1,
  collectiveEvaluationCampaignProfileCellsV1,
  createCollectiveEvaluationCampaignManifestV1,
  createCollectiveEvaluationCampaignRegistrationV1,
  validateCollectiveEvaluationCampaignManifestV1,
  validateCollectiveEvaluationCampaignRegistrationV1,
} from "../packages/collective-planning/dist/evaluation-campaign.js";

const digest = (label) =>
  `sha256:${createHash("sha256").update(label).digest("hex")}`;

function registrationInput({
  campaignId = "campaign:preflight",
  profile = COLLECTIVE_EVALUATION_PREFLIGHT_CAMPAIGN_PROFILE_V1,
} = {}) {
  return {
    schemaVersion: 1,
    campaignId,
    profile,
    sourceDigest: digest("source"),
    packageDigest: digest("package"),
    fixtureManifestDigest: digest("fixtures"),
    policyDigest: digest("policy"),
    environmentDigest: digest("environment"),
    observationPolicyDigest: digest("observation-policy"),
    monitorDigest: digest("monitor"),
    hiddenCanaryDigest: digest("hidden-canary"),
    runners: ["adaptive_collective", "centralized_planner"],
    maximumInteractions:
      profile === COLLECTIVE_EVALUATION_PREFLIGHT_CAMPAIGN_PROFILE_V1
        ? 1_000
        : 5_000,
    cells: collectiveEvaluationCampaignProfileCellsV1(profile, campaignId).map(
      (scheduled) => ({
        schemaVersion: 1,
        ...scheduled,
        maximumInteractions:
          scheduled.peerCount === 50
            ? 1_000
            : scheduled.peerCount === 100
              ? 1_600
              : scheduled.peerCount === 250
                ? 3_000
                : 5_000,
        scaleConfigurationDigest: digest(
          `scale-configuration:${scheduled.cellId}`,
        ),
        adaptiveDefinitionDigest: digest(`adaptive:${scheduled.cellId}`),
        centralizedDefinitionDigest: digest(`centralized:${scheduled.cellId}`),
        faultPlanDigest: digest(`fault-plan:${scheduled.cellId}`),
        faultMatrixBindingDigest: digest(`fault-matrix:${scheduled.cellId}`),
      }),
    ),
  };
}

function manifestInput(registration, status = "success") {
  return {
    schemaVersion: 1,
    registrationDigest: registration.registrationDigest,
    entries: registration.cells.map((cell) => ({
      schemaVersion: 1,
      cellId: cell.cellId,
      status,
      reasonCode: status === "failure" ? "runner_unavailable" : null,
      adaptiveResultDigest:
        status === "failure" ? null : digest(`adaptive-result:${cell.cellId}`),
      centralizedResultDigest:
        status === "failure"
          ? null
          : digest(`centralized-result:${cell.cellId}`),
      adaptiveTraceDigest:
        status === "failure" ? null : digest(`adaptive-trace:${cell.cellId}`),
      centralizedTraceDigest:
        status === "failure"
          ? null
          : digest(`centralized-trace:${cell.cellId}`),
      adaptiveLedgerDigest:
        status === "failure" ? null : digest(`adaptive-ledger:${cell.cellId}`),
      centralizedLedgerDigest:
        status === "failure"
          ? null
          : digest(`centralized-ledger:${cell.cellId}`),
      fairnessDigest:
        status === "failure" ? null : digest(`fairness:${cell.cellId}`),
      adaptiveCampaignEvidenceDigest:
        status === "failure"
          ? null
          : digest(`adaptive-evidence:${cell.cellId}`),
      centralizedCampaignEvidenceDigest:
        status === "failure"
          ? null
          : digest(`centralized-evidence:${cell.cellId}`),
    })),
  };
}

test("campaign profiles freeze exact ordered seeds and complete manifests", () => {
  const normative = collectiveEvaluationCampaignProfileCellsV1(
    COLLECTIVE_EVALUATION_NORMATIVE_CAMPAIGN_PROFILE_V1,
    "campaign:normative",
  );
  assert.equal(normative.length, 240);
  assert.deepEqual(
    normative.slice(0, 10).map((cell) => cell.seed),
    Array.from({ length: 10 }, (_, seed) => seed),
  );
  assert.deepEqual(
    normative
      .filter((cell) => cell.peerCount === 500 && cell.stratum === "nominal")
      .map((cell) => cell.seed),
    Array.from({ length: 30 }, (_, seed) => seed),
  );
  assert.equal(
    normative[0].cellId,
    campaignCellIdV1("campaign:normative", 50, "nominal", 0),
  );
  assert.ok(Object.isFrozen(normative));

  const registration =
    createCollectiveEvaluationCampaignRegistrationV1(registrationInput());
  assert.equal(registration.cells.length, 8);
  assert.ok(Object.isFrozen(registration));
  assert.ok(Object.isFrozen(registration.cells));
  assert.deepEqual(
    validateCollectiveEvaluationCampaignRegistrationV1(registration),
    registration,
  );
  assert.throws(
    () =>
      validateCollectiveEvaluationCampaignRegistrationV1({
        ...registration,
        registrationDigest: digest("tampered-registration"),
      }),
    /does not bind/,
  );

  const manifest = createCollectiveEvaluationCampaignManifestV1(
    registration,
    manifestInput(registration),
  );
  assert.equal(manifest.entries.length, registration.cells.length);
  assert.ok(Object.isFrozen(manifest));
  assert.deepEqual(
    validateCollectiveEvaluationCampaignManifestV1(manifest, registration),
    manifest,
  );
});

test("registration rejects omissions, substitution, reordered cells and getters", () => {
  const input = registrationInput();
  assert.throws(
    () =>
      createCollectiveEvaluationCampaignRegistrationV1({
        ...input,
        cells: input.cells.slice(1),
      }),
    /frozen profile/,
  );
  assert.throws(
    () =>
      createCollectiveEvaluationCampaignRegistrationV1({
        ...input,
        cells: [...input.cells].reverse(),
      }),
    /order, identity or seed/,
  );
  const substituted = input.cells.map((cell) => ({ ...cell }));
  substituted[0].cellId = substituted[1].cellId;
  assert.throws(
    () =>
      createCollectiveEvaluationCampaignRegistrationV1({
        ...input,
        cells: substituted,
      }),
    /order, identity or seed/,
  );
  assert.throws(
    () =>
      createCollectiveEvaluationCampaignRegistrationV1({
        ...input,
        maximumInteractions: 5001,
      }),
    /bounded safe integer|exceeds 5000/,
  );
  assert.throws(
    () =>
      createCollectiveEvaluationCampaignRegistrationV1({
        ...input,
        maximumInteractions: 2_000,
      }),
    /does not match its maximum cell ceiling/,
  );
  const wrongScaleBudget = input.cells.map((cell) => ({ ...cell }));
  wrongScaleBudget[0].maximumInteractions = 1_001;
  assert.throws(
    () =>
      createCollectiveEvaluationCampaignRegistrationV1({
        ...input,
        cells: wrongScaleBudget,
      }),
    /interaction ceiling does not match its scale/,
  );
  assert.throws(
    () =>
      createCollectiveEvaluationCampaignRegistrationV1({
        ...input,
        runners: ["centralized_planner", "adaptive_collective"],
      }),
    /runner pair/,
  );

  let read = false;
  const getterRecord = { ...input };
  Object.defineProperty(getterRecord, "campaignId", {
    enumerable: true,
    get() {
      read = true;
      return input.campaignId;
    },
  });
  assert.throws(
    () => createCollectiveEvaluationCampaignRegistrationV1(getterRecord),
    /accessors/,
  );
  assert.equal(read, false);
});

test("manifest has one terminal entry per registered cell and never accepts substitution", () => {
  const registration =
    createCollectiveEvaluationCampaignRegistrationV1(registrationInput());
  const input = manifestInput(registration);
  const failed = manifestInput(registration, "failure");
  const failureManifest = createCollectiveEvaluationCampaignManifestV1(
    registration,
    failed,
  );
  assert.equal(failureManifest.entries[0].status, "failure");
  assert.throws(
    () =>
      createCollectiveEvaluationCampaignManifestV1(registration, {
        ...input,
        entries: input.entries.slice(1),
      }),
    /omits registered cells/,
  );
  assert.throws(
    () =>
      createCollectiveEvaluationCampaignManifestV1(registration, {
        ...input,
        entries: [...input.entries].reverse(),
      }),
    /substitutes a registered cell/,
  );
  const substitution = input.entries.map((entry) => ({ ...entry }));
  substitution[0].cellId = substitution[1].cellId;
  assert.throws(
    () =>
      createCollectiveEvaluationCampaignManifestV1(registration, {
        ...input,
        entries: substitution,
      }),
    /substitutes a registered cell/,
  );
  const failedWithEvidence = manifestInput(registration, "failure");
  failedWithEvidence.entries[0].adaptiveResultDigest = digest("unexpected");
  assert.throws(
    () =>
      createCollectiveEvaluationCampaignManifestV1(
        registration,
        failedWithEvidence,
      ),
    /success evidence/,
  );
  const failedWithoutReason = manifestInput(registration, "failure");
  failedWithoutReason.entries[0].reasonCode = null;
  assert.throws(
    () =>
      createCollectiveEvaluationCampaignManifestV1(
        registration,
        failedWithoutReason,
      ),
    /omits reason code/,
  );

  const manifest = createCollectiveEvaluationCampaignManifestV1(
    registration,
    input,
  );
  assert.throws(
    () =>
      validateCollectiveEvaluationCampaignManifestV1(
        { ...manifest, manifestDigest: digest("tampered") },
        registration,
      ),
    /does not bind/,
  );
});
