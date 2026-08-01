import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  compareAscii,
  loadPublicPackageCatalog,
  publishablePackages,
} from "../scripts/public-package-catalog.mjs";

const RELEASE_VERSION = "0.3.0-beta.1";
const RELEASE_COMMIT = "b38c25098599499813fe2caea605b5d61f939222";
const RELEASE_TAG = "v0.3.0-beta.1";
const RELEASE_TAG_OBJECT = "9692bceb3e9d5d55fa5b0651738f1332fe6376a4";
const ALPHA5_COMMIT = "5d11f715947bd7d3e5b8f7311c8f6f68c8c33a98";

test("Beta 1 release evidence closes the exact public release", async () => {
  const evidence = await readJson(
    "docs/agent-mesh/beta-1-release-evidence.json",
  );
  const catalog = await loadPublicPackageCatalog();
  const expectedPackageNames = publishablePackages(catalog).map(
    (entry) => entry.name,
  );

  assert.equal(evidence.schemaVersion, 1);
  assert.equal(evidence.releaseVersion, RELEASE_VERSION);
  assert.equal(evidence.releaseCommit, RELEASE_COMMIT);
  assert.equal(evidence.gitTag, RELEASE_TAG);
  assert.equal(evidence.gitTagObject, RELEASE_TAG_OBJECT);
  assert.equal(evidence.distributionTag, "next");
  assert.match(evidence.stagingTag, /^agentplat-stage-[a-f0-9]{12}$/u);
  assert.equal(evidence.verifiedPackageCount, expectedPackageNames.length);
  assert.equal(evidence.verifiedPackageCount, 34);
  assert.equal(evidence.stagingTagsRemaining, 0);
  assert.deepEqual(evidence.registryConsumers, {
    node20Pnpm: "passed",
    node22Npm: "passed",
  });
  assert.equal(
    evidence.previousNext.defaultForExistingPackages,
    "0.3.0-alpha.5",
  );
  assert.deepEqual(evidence.previousNext.exceptions, {
    "@agentplat/mesh-conformance": null,
  });
  assert.ok(Number.isFinite(Date.parse(evidence.publicationCompletedAt)));

  const evidenceNames = evidence.packages.map((entry) => entry.name);
  assert.deepEqual(evidenceNames, expectedPackageNames);
  assert.deepEqual(evidenceNames, [...evidenceNames].sort(compareAscii));
  assert.equal(new Set(evidenceNames).size, evidenceNames.length);

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
    assert.match(entry.integrity, /^sha512-[A-Za-z0-9+/]+={0,2}$/u);
    assert.ok(
      Number.isFinite(Date.parse(entry.publishedAt)),
      `${entry.name}.publishedAt`,
    );
  }
});

test("Beta 1 report and fixture digests are complete and release-bound", async () => {
  const evidence = await readJson(
    "docs/agent-mesh/beta-1-release-evidence.json",
  );

  for (const [name, record] of Object.entries(evidence.reports)) {
    assert.equal(
      await sha256File(record.path),
      record.sha256,
      `${name}.sha256`,
    );
    const report = await readJson(record.path);
    assert.equal(
      report.releaseVersion,
      RELEASE_VERSION,
      `${name}.releaseVersion`,
    );
    if (name !== "publicApiSurface") {
      assert.equal(
        report.candidateCommit,
        RELEASE_COMMIT,
        `${name}.candidateCommit`,
      );
      assert.equal(report.status, "passed", `${name}.status`);
    }
  }

  for (const [name, record] of Object.entries(evidence.fixtures)) {
    assert.equal(
      await sha256File(record.path),
      record.sha256,
      `${name}.sha256`,
    );
  }

  const compatibility = await readJson(evidence.reports.compatibility.path);
  assert.deepEqual(compatibility.summary, {
    total: 7,
    passed: 7,
    failed: 0,
  });
  assert.equal(compatibility.cells.length, 7);

  const postgres = await readJson(evidence.reports.postgresFaults.path);
  assert.equal(postgres.cells.length, 29);
  assert.equal(postgres.summary.failed, 0);
  assert.equal(postgres.summary.migrationCrashWindows, 16);
  assert.equal(postgres.summary.transitionCrashWindows, 4);
  assert.equal(postgres.summary.lostAcceptedWork, 0);

  const soak = await readJson(evidence.reports.soak.path);
  assert.equal(soak.runs.length, 2);
  assert.equal(soak.correctnessViolations, 0);
  assert.equal(soak.integrityMismatches, 0);
  assert.equal(soak.deterministicFinalState, true);

  const benchmark = await readJson(evidence.reports.benchmark.path);
  assert.equal(benchmark.workloads.length, 10);
  assert.equal(benchmark.summary.errorCount, 0);
  assert.equal(benchmark.summary.correctnessViolations, 0);

  const surface = await readJson(evidence.reports.publicApiSurface.path);
  const catalog = await loadPublicPackageCatalog();
  assert.equal(surface.alpha5BaselineTag, "v0.3.0-alpha.5");
  assert.equal(surface.alpha5BaselineCommit, ALPHA5_COMMIT);
  assert.equal(
    surface.surfaceSha256,
    "96411d14eb925583b5857189c3f956244db1749de45c03eb0fec598da3c221b3",
  );
  assert.equal(surface.records.length, 50);
  assert.deepEqual(
    [...new Set(surface.records.map((record) => record.package))].sort(
      compareAscii,
    ),
    publishablePackages(catalog).map((entry) => entry.name),
  );
});

test("Beta 1 acceptance checklist has no open release item", async () => {
  const checklist = await readFile(
    "docs/agent-mesh/beta-1-acceptance-checklist.md",
    "utf8",
  );
  assert.match(checklist, /^Status: accepted\./mu);
  assert.doesNotMatch(checklist, /^\s*- \[ \]/mu);
  assert.match(checklist, /All 34 packages publish as `0\.3\.0-beta\.1`/u);
  assert.match(checklist, /Final machine-readable compatibility/u);
});

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function sha256File(filePath) {
  return createHash("sha256")
    .update(await readFile(filePath))
    .digest("hex");
}
