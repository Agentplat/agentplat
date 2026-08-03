import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { digestPlanningJsonV1 } from "../packages/collective-planning/dist/index.js";
import {
  CAMPAIGN_READINESS_CAMPAIGN_OUTCOME_IDS_V1,
  CAMPAIGN_READINESS_RELEASE_OUTCOME_IDS_V1,
  CAMPAIGN_READINESS_REQUIRED_CONTROL_IDS_V1,
  createCampaignCapacityEstimateV1,
  createCampaignReadinessEvidenceReceiptV1,
  createCampaignReadinessPlanV1,
  deriveCampaignReadinessAssessmentV1,
  validateCampaignCapacityEstimateV1,
  validateCampaignReadinessAssessmentV1,
  validateCampaignReadinessEvidenceReceiptV1,
  validateCampaignReadinessPlanV1,
} from "../packages/collective-planning/dist/evaluation.js";

const digest = (character) => `sha256:${character.repeat(64)}`;
const commit = "a".repeat(40);

function fixture() {
  const estimate = createCampaignCapacityEstimateV1({
    schemaVersion: 1,
    registrationDigest: digest("1"),
    operationPlanDigest: digest("2"),
    adapterDigest: digest("3"),
  });
  const plan = createCampaignReadinessPlanV1({
    schemaVersion: 1,
    campaignId: "campaign:readiness-test",
    sourceCommit: commit,
    sourceTreeDigest: digest("4"),
    registrationDigest: estimate.registrationDigest,
    operationPlanDigest: estimate.operationPlanDigest,
    adapterDigest: estimate.adapterDigest,
    capacityEstimateDigest: estimate.estimateDigest,
  });
  const receipt = (controlId, status = "passed") =>
    createCampaignReadinessEvidenceReceiptV1({
      schemaVersion: 1,
      controlId,
      sourceCommit: plan.sourceCommit,
      sourceTreeDigest: plan.sourceTreeDigest,
      readinessPlanDigest: plan.readinessPlanDigest,
      status,
      reasonCode: status === "passed" ? "verified" : "check_failed",
      evidenceDigest: digest("5"),
    });
  return { estimate, plan, receipt };
}

test("readiness contracts freeze the capacity boundary and derive the recommendation", () => {
  const { estimate, plan, receipt } = fixture();
  assert.equal(validateCampaignCapacityEstimateV1(estimate).cells, 240);
  assert.equal(estimate.slots, 960);
  assert.equal(estimate.shards, 48);
  assert.equal(estimate.maximumInteractions, 3_296_000);
  assert.equal(estimate.maximumTraceEvents, 96_000_000);
  assert.equal(estimate.maximumArtifactBytes, 15 * 1024 * 1024 * 1024);
  assert.equal(estimate.maximumShardRunnerMinutes, 8_640);
  assert.equal(estimate.maximumControlRunnerMinutes, 170);
  assert.equal(estimate.monetaryCostStatus, "requires_operator_rate_card");
  assert.equal(estimate.maximumAmountMinorUnits, null);
  assert.equal(estimate.executionPermitted, false);
  assert.equal(estimate.fullCampaignPermitted, false);
  assert.equal(
    validateCampaignReadinessPlanV1(plan, estimate).requiredControlIds.length,
    12,
  );

  const partial = deriveCampaignReadinessAssessmentV1({
    schemaVersion: 1,
    plan,
    receipts: [receipt(CAMPAIGN_READINESS_REQUIRED_CONTROL_IDS_V1[0])],
  });
  assert.equal(partial.recommendation, "no_go");
  assert.equal(partial.passedControlIds.length, 1);
  assert.equal(partial.unmetControlIds.length, 11);
  assert.deepEqual(
    partial.pendingCampaignOutcomeIds,
    CAMPAIGN_READINESS_CAMPAIGN_OUTCOME_IDS_V1,
  );
  assert.deepEqual(
    partial.pendingReleaseOutcomeIds,
    CAMPAIGN_READINESS_RELEASE_OUTCOME_IDS_V1,
  );

  const receipts = CAMPAIGN_READINESS_REQUIRED_CONTROL_IDS_V1.map((controlId) =>
    receipt(controlId),
  );
  const complete = deriveCampaignReadinessAssessmentV1({
    schemaVersion: 1,
    plan,
    receipts,
  });
  assert.equal(complete.recommendation, "ready_for_operator_authorization");
  assert.equal(complete.unmetControlIds.length, 0);
  assert.equal(complete.executionPermitted, false);
  assert.equal(complete.fullCampaignPermitted, false);
  assert.deepEqual(
    validateCampaignReadinessAssessmentV1(complete, plan, receipts),
    complete,
  );
});

test("readiness validation rejects drift, cross-plan evidence and selected outcomes", () => {
  const { estimate, plan, receipt } = fixture();
  assert.throws(
    () =>
      validateCampaignCapacityEstimateV1({
        ...estimate,
        maximumInteractions: estimate.maximumInteractions + 1,
      }),
    /fixed envelope|canonical content/u,
  );
  assert.throws(
    () =>
      validateCampaignReadinessPlanV1({
        ...plan,
        requiredControlIds: [...plan.requiredControlIds].reverse(),
      }),
    /closed ordered set/u,
  );
  assert.throws(
    () =>
      validateCampaignReadinessEvidenceReceiptV1(
        {
          ...receipt(CAMPAIGN_READINESS_REQUIRED_CONTROL_IDS_V1[0]),
          sourceCommit: "b".repeat(40),
        },
        plan,
      ),
    /canonical content|outside the readiness plan/u,
  );
  const receipts = CAMPAIGN_READINESS_REQUIRED_CONTROL_IDS_V1.map((controlId) =>
    receipt(controlId),
  );
  assert.throws(
    () =>
      deriveCampaignReadinessAssessmentV1({
        schemaVersion: 1,
        plan,
        receipts: [receipts[0], receipts[0]],
      }),
    /duplicated/u,
  );
  const assessment = deriveCampaignReadinessAssessmentV1({
    schemaVersion: 1,
    plan,
    receipts: [],
  });
  assert.throws(
    () =>
      validateCampaignReadinessAssessmentV1(
        { ...assessment, recommendation: "ready_for_operator_authorization" },
        plan,
        [],
      ),
    /not derived|canonical content/u,
  );
});

test("readiness CLI plans safely, records bounded evidence and assesses exact closure", async () => {
  const root = path.resolve(import.meta.dirname, "..");
  const registeredCli = path.join(
    root,
    "scripts/collective-beta3-registered-preflight.mjs",
  );
  const readinessCli = path.join(
    root,
    "scripts/collective-beta3-campaign-readiness.mjs",
  );
  const repo = await cleanFixtureRepo();
  const operation = await mkdtemp(
    path.join(os.tmpdir(), "readiness-operation-"),
  );
  const readiness = await mkdtemp(path.join(os.tmpdir(), "readiness-plan-"));
  const receipts = await mkdtemp(path.join(os.tmpdir(), "readiness-receipts-"));
  const failedReceipts = await mkdtemp(
    path.join(os.tmpdir(), "readiness-failed-receipts-"),
  );
  const preflight = await mkdtemp(
    path.join(os.tmpdir(), "readiness-preflight-"),
  );
  const assessment = await mkdtemp(
    path.join(os.tmpdir(), "readiness-assessment-"),
  );
  const evidence = path.join(repo, "evidence.txt");
  try {
    const sha = git(repo, ["rev-parse", "HEAD"]);
    execFileSync(
      "node",
      [
        registeredCli,
        "--mode",
        "plan",
        "--confirm",
        "DO_NOT_RUN",
        "--campaign-id",
        "campaign:readiness-cli",
        "--source-sha",
        sha,
        "--output-directory",
        operation,
      ],
      { cwd: repo, stdio: "pipe" },
    );
    execFileSync(
      "node",
      [
        readinessCli,
        "--mode",
        "plan",
        "--campaign-id",
        "campaign:readiness-cli",
        "--source-sha",
        sha,
        "--operation-directory",
        operation,
        "--output-directory",
        readiness,
      ],
      { cwd: repo, stdio: "pipe" },
    );
    const plan = JSON.parse(
      await readFile(path.join(readiness, "readiness-plan.json"), "utf8"),
    );
    const estimate = JSON.parse(
      await readFile(path.join(readiness, "capacity-estimate.json"), "utf8"),
    );
    validateCampaignReadinessPlanV1(plan, estimate);
    assert.equal(estimate.maximumInteractions, 3_296_000);
    assert.deepEqual(
      (await readdir(readiness))
        .filter((name) => name.startsWith("receipt-"))
        .sort(),
      [
        "receipt-bounded_capacity_estimate.json",
        "receipt-immutable_source_and_plan.json",
        "receipt-registered_runtime_separation.json",
      ],
    );
    for (const name of await readdir(readiness)) {
      if (name.startsWith("receipt-"))
        await writeFile(
          path.join(receipts, name),
          await readFile(path.join(readiness, name)),
        );
    }
    execFileSync(
      "node",
      [
        readinessCli,
        "--mode",
        "assess",
        "--source-sha",
        sha,
        "--readiness-directory",
        readiness,
        "--receipt-directory",
        receipts,
        "--output-directory",
        assessment,
      ],
      { cwd: repo, stdio: "pipe" },
    );
    const partial = JSON.parse(
      await readFile(
        path.join(assessment, "readiness-assessment.json"),
        "utf8",
      ),
    );
    assert.equal(partial.recommendation, "no_go");
    assert.equal(partial.unmetControlIds.length, 9);

    await writeFile(evidence, "bounded public evidence\n");
    execFileSync(
      "node",
      [
        readinessCli,
        "--mode",
        "receipt",
        "--source-sha",
        sha,
        "--readiness-directory",
        readiness,
        "--control-id",
        "durable_preflight_closure",
        "--status",
        "failed",
        "--reason-code",
        "evidence_missing",
        "--evidence-file",
        evidence,
        "--output-directory",
        failedReceipts,
      ],
      { cwd: repo, stdio: "pipe" },
    );
    const failedPreflightReceipt = JSON.parse(
      await readFile(
        path.join(failedReceipts, "receipt-durable_preflight_closure.json"),
        "utf8",
      ),
    );
    assert.equal(failedPreflightReceipt.status, "failed");
    assert.throws(
      () =>
        execFileSync(
          "node",
          [
            readinessCli,
            "--mode",
            "receipt",
            "--source-sha",
            sha,
            "--readiness-directory",
            readiness,
            "--control-id",
            "durable_preflight_closure",
            "--status",
            "passed",
            "--reason-code",
            "verified",
            "--evidence-file",
            evidence,
            "--output-directory",
            failedReceipts,
          ],
          { cwd: repo, stdio: "pipe" },
        ),
      /campaign_readiness_control_requires_dedicated_verifier/u,
    );
    const authorizationBody = {
      schemaVersion: 1,
      kind: "collective_beta3_registered_authorization_receipt",
      status: "authorized",
      authorizationId: "authorization:test",
      authorizationDigest: digest("6"),
      credentialId: "credential:test",
      audience: "agentplat:registered-preflight-v1",
      planDigest: plan.operationPlanDigest,
      adapterDigest: plan.adapterDigest,
      shardIndex: 2,
      maximumCells: 5,
      expiresAt: "2026-08-04T00:00:00.000Z",
    };
    await writeFile(
      path.join(preflight, "authorization-receipt.json"),
      `${JSON.stringify({
        ...authorizationBody,
        receiptDigest: artifactDigest(
          "authorization-receipt",
          authorizationBody,
        ),
      })}\n`,
    );
    for (const [suffix, executedSlotCount, resumedSlotCount] of [
      ["1".repeat(64), 20, 0],
      ["2".repeat(64), 0, 20],
    ]) {
      const body = {
        schemaVersion: 1,
        kind: "collective_beta3_registered_preflight_receipt",
        status: "completed",
        releaseEvidence: false,
        fullCampaignPermitted: false,
        sourceCommit: plan.sourceCommit,
        registrationDigest: plan.registrationDigest,
        planDigest: plan.operationPlanDigest,
        adapterDigest: plan.adapterDigest,
        authorizationDigest: authorizationBody.authorizationDigest,
        executionId: "execution:test",
        authorizationExecutionId: "authorization-execution:test",
        shardIndex: 2,
        selectedCellCount: 5,
        executedSlotCount,
        resumedSlotCount,
        projectionCount: 20,
        verifiedArtifactCount: 20,
        verifiedArtifactBytes: 1024,
        projectionRoot: digest("7"),
      };
      await writeFile(
        path.join(preflight, `preflight-receipt-${suffix}.json`),
        `${JSON.stringify({
          ...body,
          receiptDigest: artifactDigest("preflight-receipt", body),
        })}\n`,
      );
    }
    execFileSync(
      "node",
      [
        readinessCli,
        "--mode",
        "preflight",
        "--source-sha",
        sha,
        "--workflow-run-id",
        "123",
        "--readiness-directory",
        readiness,
        "--preflight-directory",
        preflight,
        "--output-directory",
        receipts,
      ],
      { cwd: repo, stdio: "pipe" },
    );
    for (const controlId of CAMPAIGN_READINESS_REQUIRED_CONTROL_IDS_V1.slice(
      3,
    ).filter((candidate) => candidate !== "durable_preflight_closure")) {
      execFileSync(
        "node",
        [
          readinessCli,
          "--mode",
          "receipt",
          "--source-sha",
          sha,
          "--readiness-directory",
          readiness,
          "--control-id",
          controlId,
          "--status",
          "passed",
          "--reason-code",
          "verified",
          "--evidence-file",
          evidence,
          "--output-directory",
          receipts,
        ],
        { cwd: repo, stdio: "pipe" },
      );
    }
    await rm(path.join(assessment, "readiness-assessment.json"));
    execFileSync(
      "node",
      [
        readinessCli,
        "--mode",
        "assess",
        "--source-sha",
        sha,
        "--readiness-directory",
        readiness,
        "--receipt-directory",
        receipts,
        "--output-directory",
        assessment,
      ],
      { cwd: repo, stdio: "pipe" },
    );
    const complete = JSON.parse(
      await readFile(
        path.join(assessment, "readiness-assessment.json"),
        "utf8",
      ),
    );
    assert.equal(complete.recommendation, "ready_for_operator_authorization");
    assert.equal(complete.executionPermitted, false);
    assert.equal(complete.fullCampaignPermitted, false);
  } finally {
    await Promise.all(
      [
        repo,
        operation,
        readiness,
        receipts,
        failedReceipts,
        preflight,
        assessment,
      ].map((directory) => rm(directory, { recursive: true, force: true })),
    );
  }
});

async function cleanFixtureRepo() {
  const repo = await mkdtemp(path.join(os.tmpdir(), "readiness-git-"));
  await writeFile(
    path.join(repo, "package.json"),
    '{"version":"0.0.0-test"}\n',
  );
  await writeFile(
    path.join(repo, "pnpm-lock.yaml"),
    "lockfileVersion: '9.0'\n",
  );
  git(repo, ["init"]);
  git(repo, ["add", "package.json", "pnpm-lock.yaml"]);
  git(repo, [
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.invalid",
    "commit",
    "-m",
    "fixture",
  ]);
  return repo;
}

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function artifactDigest(kind, value) {
  return digestPlanningJsonV1("evaluation-campaign-artifact-v1", {
    schemaVersion: 1,
    kind,
    value,
  });
}
