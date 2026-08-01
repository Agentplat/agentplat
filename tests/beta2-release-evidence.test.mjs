import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  compareAscii,
  loadPublicPackageCatalog,
} from "../scripts/public-package-catalog.mjs";
import { REGISTRY_PACKAGES } from "../scripts/verify-registry-consumer.mjs";

const RELEASE_VERSION = "0.3.0-beta.2";
const DESIGN_COMMIT = "36d5571748fb8818ecf5a1bf925c8af392ad13f0";
const RELEASE_COMMIT = "43037e3fa05133377672ef769140912eaf87bcef";
const RELEASE_FIX_COMMIT = "e22dc419aade875418741994ba50287ac14e8b06";
const VERIFICATION_COMMIT = "68be97142aad1d31e2c65c08ec431c25d2fedba9";
const RELEASE_TAG = "v0.3.0-beta.2";
const RELEASE_TAG_OBJECT = "e891179e713dc6286fc808fceab17ab7b11f63c5";
const COMPATIBILITY_COMMIT = "323adfcb081a022cb39acd200f92d47b197f2a93";
const POSTGRES_CONFORMANCE_COMMIT = "89354e214ac4445ac1ffc0309cd06cc0e2ce183b";
const EVALUATION_COMMIT = "60213b3f3cd901f0649174b2b874efcb379fa720";
const RELEASE_FIX_PATH =
  "scripts/pack-consumers/collective-control-beta2-types.ts";

test("Beta 2 Git provenance preserves the tagged release payload", () => {
  assert.equal(git("rev-parse", RELEASE_TAG), RELEASE_TAG_OBJECT);
  assert.equal(git("rev-parse", `${RELEASE_TAG}^{}`), RELEASE_COMMIT);

  for (const [ancestor, descendant] of [
    [DESIGN_COMMIT, RELEASE_COMMIT],
    [RELEASE_COMMIT, VERIFICATION_COMMIT],
    [RELEASE_FIX_COMMIT, VERIFICATION_COMMIT],
  ]) {
    assert.doesNotThrow(() =>
      execFileSync(
        "git",
        ["merge-base", "--is-ancestor", ancestor, descendant],
        {
          stdio: "pipe",
        },
      ),
    );
  }

  assert.deepEqual(
    git("diff", "--name-only", RELEASE_COMMIT, RELEASE_FIX_COMMIT).split("\n"),
    [RELEASE_FIX_PATH],
  );
  assert.deepEqual(
    git("diff", "--name-only", RELEASE_COMMIT, VERIFICATION_COMMIT).split("\n"),
    [RELEASE_FIX_PATH],
  );
});

test("Beta 2 release evidence closes the exact public registry release", async () => {
  const evidence = await readJson(
    "docs/governed-collectives/beta-2-release-evidence.json",
  );
  const catalog = await loadPublicPackageCatalog();
  const catalogNames = catalog.packages.map((entry) => entry.name);

  assert.equal(evidence.schemaVersion, 1);
  assert.equal(evidence.releaseVersion, RELEASE_VERSION);
  assert.equal(evidence.designCommit, DESIGN_COMMIT);
  assert.equal(evidence.releaseCommit, RELEASE_COMMIT);
  assert.equal(evidence.releaseFixCommit, RELEASE_FIX_COMMIT);
  assert.equal(evidence.verificationCommit, VERIFICATION_COMMIT);
  assert.equal(evidence.gitTag, RELEASE_TAG);
  assert.equal(evidence.gitTagObject, RELEASE_TAG_OBJECT);
  assert.equal(evidence.distributionTag, "next");
  assert.equal(evidence.stagingTag, "agentplat-stage-43037e3fa051");
  assert.equal(
    evidence.initialPublicationWorkflow,
    "https://github.com/Agentplat/agentplat/actions/runs/30706021749",
  );
  assert.equal(
    evidence.publicationWorkflow,
    "https://github.com/Agentplat/agentplat/actions/runs/30707363847",
  );
  assert.deepEqual(evidence.previousNext, {
    defaultForExistingPackages: "0.3.0-beta.1",
    exceptions: {
      "@agentplat/collective-control": null,
      "@agentplat/collective-control-postgres": null,
    },
  });
  assert.deepEqual(evidence.registryConsumers, {
    node20PnpmPortable: "passed",
    node20PnpmPostgres: "passed",
    node22NpmPortable: "passed",
  });
  assert.equal(evidence.verifiedPackageCount, 36);
  assert.equal(evidence.stagingTagsRemaining, 0);
  assert.ok(Number.isFinite(Date.parse(evidence.registryPublishedAt)));
  assert.ok(Number.isFinite(Date.parse(evidence.publicationCompletedAt)));
  assert.ok(
    Date.parse(evidence.publicationCompletedAt) >=
      Date.parse(evidence.registryPublishedAt),
  );

  const evidenceNames = evidence.packages.map((entry) => entry.name);
  assert.deepEqual(evidenceNames, REGISTRY_PACKAGES);
  assert.deepEqual(evidenceNames, catalogNames);
  assert.deepEqual(evidenceNames, [...evidenceNames].sort(compareAscii));
  assert.equal(new Set(evidenceNames).size, evidenceNames.length);
  assert.equal(evidence.packages.length, evidence.verifiedPackageCount);

  for (const entry of evidence.packages) {
    assert.deepEqual(Object.keys(entry).sort(compareAscii), [
      "integrity",
      "latest",
      "name",
      "next",
      "publishedAt",
      "version",
    ]);
    assert.equal(entry.version, RELEASE_VERSION, `${entry.name}.version`);
    assert.equal(entry.next, RELEASE_VERSION, `${entry.name}.next`);
    assert.equal(typeof entry.latest, "string", `${entry.name}.latest`);
    assert.match(entry.integrity, /^sha512-[A-Za-z0-9+/]+={0,2}$/u);
    assert.ok(
      Number.isFinite(Date.parse(entry.publishedAt)),
      `${entry.name}.publishedAt`,
    );
  }

  assert.equal(
    evidence.packages
      .map((entry) => entry.publishedAt)
      .sort()
      .at(-1),
    evidence.registryPublishedAt,
  );
  assert.equal(
    evidence.packages.find(
      (entry) => entry.name === "@agentplat/collective-control",
    ).latest,
    RELEASE_VERSION,
  );
  assert.equal(
    evidence.packages.find(
      (entry) => entry.name === "@agentplat/collective-control-postgres",
    ).latest,
    RELEASE_VERSION,
  );
});

test("Beta 2 report, fixture and review digests are complete", async () => {
  const evidence = await readJson(
    "docs/governed-collectives/beta-2-release-evidence.json",
  );

  for (const collection of [
    evidence.reports,
    evidence.fixtures,
    evidence.reviewedDocuments,
  ]) {
    for (const [name, record] of Object.entries(collection)) {
      assert.match(record.sha256, /^[a-f0-9]{64}$/u, `${name}.sha256`);
      assert.equal(
        await sha256File(record.path),
        record.sha256,
        `${name}.sha256`,
      );
    }
  }

  const compatibility = await readJson(evidence.reports.compatibility.path);
  assert.equal(compatibility.status, "passed");
  assert.equal(compatibility.releaseVersion, RELEASE_VERSION);
  assert.equal(compatibility.candidateCommit, COMPATIBILITY_COMMIT);
  assert.deepEqual(compatibility.baseline, {
    tag: "v0.3.0-beta.1",
    commit: "b38c25098599499813fe2caea605b5d61f939222",
    evidenceCommit: "6ac78cba0a56d7c5d2c5f372ab0b549c1565b17a",
    packageCount: 34,
    entrypointCount: 50,
    surfaceSha256:
      "d0ac286a0f36b31b27b5cbd788d44bd2c59717d82ec44a92076077a9d325b37e",
  });
  assert.equal(compatibility.candidate.packageCount, 36);
  assert.equal(compatibility.candidate.entrypointCount, 58);
  assert.deepEqual(compatibility.candidate.newPackages, [
    "@agentplat/collective-control",
    "@agentplat/collective-control-postgres",
  ]);
  assert.equal(compatibility.candidate.newEntrypoints.length, 8);
  assert.equal(compatibility.removedPackages, 0);
  assert.equal(compatibility.removedEntrypoints, 0);
  assert.equal(compatibility.removedTypeExports, 0);

  const postgres = await readJson(evidence.reports.postgresConformance.path);
  assert.equal(postgres.status, "passed");
  assert.equal(postgres.releaseVersion, RELEASE_VERSION);
  assert.equal(postgres.sourceCommit, POSTGRES_CONFORMANCE_COMMIT);
  assert.match(postgres.evidenceDigest, /^sha256:[a-f0-9]{64}$/u);
  assert.match(postgres.report.suiteDigest, /^sha256:[a-f0-9]{64}$/u);
  assert.match(postgres.report.fixtureManifestDigest, /^sha256:[a-f0-9]{64}$/u);
  assert.deepEqual(postgres.report.counts, {
    passed: 14,
    failed: 0,
    notDeclared: 0,
    total: 14,
  });
  assert.equal(postgres.report.cases.length, 14);
  assert.equal(postgres.report.verdict, "passed");

  const evaluation = await readJson(evidence.reports.collectiveEvaluation.path);
  assert.equal(evaluation.status, "passed");
  assert.equal(evaluation.releaseVersion, RELEASE_VERSION);
  assert.equal(evaluation.sourceCommit, EVALUATION_COMMIT);
  assert.equal(evaluation.registeredBeforeExecution, true);
  assert.equal(evaluation.dirtyWorktree, false);
  assert.deepEqual(evaluation.summary, {
    registrationCount: 32,
    reportCount: 32,
    comparisonCount: 16,
    validSamples: 880,
    invalidSamples: 0,
    pairedReplayExecutions: 1760,
    safetyViolations: 0,
    exactReplayFailures: 0,
    maximumAgents: 500,
    maximumInteractionsObserved: 5000,
  });
  assert.equal(evaluation.registrations.length, 32);
  assert.equal(evaluation.reports.length, 32);
  assert.equal(evaluation.comparisons.length, 16);
  assert.ok(evaluation.coverage.benignFaultFamilies.length > 0);
  assert.ok(evaluation.coverage.adversaryFamilies.length > 0);
  assert.equal(
    evaluation.roleCoherence.sha256,
    evidence.fixtures.roleCoherence.sha256,
  );

  for (const record of [
    ...evaluation.registrations,
    ...evaluation.reports,
    ...evaluation.comparisons,
  ]) {
    assert.equal(await sha256File(record.path), record.sha256, record.path);
  }
});

test("Beta 2 acceptance and design records have no open release item", async () => {
  const checklist = await readFile(
    "docs/collective-control/beta-2-acceptance-checklist.md",
    "utf8",
  );
  const designReview = await readFile(
    "docs/collective-control/beta-2-design-review.md",
    "utf8",
  );

  assert.match(checklist, /^Status: accepted\./mu);
  assert.doesNotMatch(checklist, /^\s*- \[ \]/mu);
  assert.equal(checklist.match(/^- \[x\]/gmu)?.length, 91);
  assert.match(checklist, /all 36 immutable packages/iu);
  assert.match(checklist, /actions\/runs\/30707363847/u);

  assert.match(designReview, /^Status: accepted\./mu);
  assert.match(designReview, /^P0: 0\.$/mu);
  assert.match(designReview, /^P1: 0\.$/mu);
  assert.match(designReview, /^P2: 0\.$/mu);
  assert.match(designReview, new RegExp(DESIGN_COMMIT, "u"));
  assert.match(designReview, new RegExp(RELEASE_COMMIT, "u"));
});

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function sha256File(filePath) {
  return createHash("sha256")
    .update(await readFile(filePath))
    .digest("hex");
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}
