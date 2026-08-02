import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  discoverWorkspacePackageManifests,
  loadPublicPackageCatalog,
} from "./public-package-catalog.mjs";
import {
  assertPublicApiCompatibility,
  inspectSourceTypeSurface,
} from "./public-api-surface.mjs";

const root = process.cwd();
const baselineTag = "v0.3.0-beta.1";
const compatibilityCommit = "68be97142aad1d31e2c65c08ec431c25d2fedba9";
const baselineEvidenceCommit = "6ac78cba0a56d7c5d2c5f372ab0b549c1565b17a";
const releaseVersion = "0.3.0-beta.2";
const argumentsByName = parseArguments(process.argv.slice(2));
const mode = argumentsByName.get("--mode") ?? "run";
const output = path.resolve(
  root,
  argumentsByName.get("--output") ??
    "docs/governed-collectives/beta-2-compatibility-report.json",
);
if (!new Set(["run", "check"]).has(mode))
  throw new TypeError("--mode must be run or check");

const baselineCommit = git(["rev-parse", `${baselineTag}^{commit}`]).trim();
const baselineCatalog = JSON.parse(
  git(["show", `${baselineTag}:config/public-packages.json`]),
);
const baselineSurface = JSON.parse(
  git([
    "show",
    `${baselineEvidenceCommit}:docs/agent-mesh/beta-1-public-api-surface.json`,
  ]),
);
assert.equal(baselineSurface.releaseVersion, "0.3.0-beta.1");
execFileSync(
  "git",
  ["merge-base", "--is-ancestor", baselineCommit, baselineEvidenceCommit],
  { cwd: root, stdio: "ignore" },
);

const catalog = await loadPublicPackageCatalog(root);
const manifests = new Map(
  (await discoverWorkspacePackageManifests(root)).map((record) => [
    record.manifest.name,
    record,
  ]),
);
const currentRecords = catalog.packages.flatMap((entry) => {
  const record = manifests.get(entry.name);
  assert(record, `Missing current package ${entry.name}`);
  return declaredExportSubpaths(record.manifest).map((subpath) => ({
    package: entry.name,
    subpath,
    browser: entry.browserEntrypoints.includes(subpath),
    sideEffects: record.manifest.sideEffects,
    ...inspectSourceTypeSurface(
      path.join(root, entry.directory),
      record.manifest,
      subpath,
    ),
  }));
});
assertPublicApiCompatibility(baselineSurface.records, currentRecords);

const compiledBaselineSources = await compileBaselineSources(baselineTag);
const baselinePackages = new Set(
  baselineCatalog.packages.map((entry) => entry.name),
);
const baselineEntrypoints = new Set(
  baselineSurface.records.map((record) => surfaceKey(record)),
);
const body = {
  schemaVersion: 1,
  releaseVersion,
  candidateCommit: git(["rev-parse", "HEAD"]).trim(),
  baseline: {
    tag: baselineTag,
    commit: baselineCommit,
    evidenceCommit: baselineEvidenceCommit,
    packageCount: baselineCatalog.packages.length,
    entrypointCount: baselineSurface.records.length,
    surfaceSha256: sha256(JSON.stringify(baselineSurface)),
  },
  candidate: {
    packageCount: catalog.packages.length,
    entrypointCount: currentRecords.length,
    newPackages: catalog.packages
      .map((entry) => entry.name)
      .filter((name) => !baselinePackages.has(name))
      .sort(compareAscii),
    newEntrypoints: currentRecords
      .map(surfaceKey)
      .filter((key) => !baselineEntrypoints.has(key))
      .sort(compareAscii),
    surfaceSha256: sha256(JSON.stringify(currentRecords)),
  },
  compiledBaselineSources,
  removedPackages: 0,
  removedEntrypoints: 0,
  removedTypeExports: 0,
  status: "passed",
};
const report = { ...body, reportSha256: sha256(JSON.stringify(body)) };

if (mode === "run") {
  const rootManifest = JSON.parse(
    await readFile(path.join(root, "package.json"), "utf8"),
  );
  assert.equal(
    rootManifest.version,
    releaseVersion,
    "Historical Beta 2 evidence can only be regenerated from the Beta 2 release line",
  );
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o644,
  });
} else {
  const evidence = JSON.parse(await readFile(output, "utf8"));
  assert.equal(evidence.schemaVersion, 1);
  assert.equal(evidence.releaseVersion, releaseVersion);
  assert.equal(evidence.status, "passed");
  assert.equal(evidence.baseline.tag, baselineTag);
  assert.equal(evidence.baseline.commit, baselineCommit);
  assert.equal(evidence.baseline.evidenceCommit, baselineEvidenceCommit);
  assert.ok(
    evidence.candidate.packageCount <= body.candidate.packageCount,
    "Current package count must preserve the Beta 2 candidate",
  );
  assert.ok(
    evidence.candidate.entrypointCount <= body.candidate.entrypointCount,
    "Current entrypoint count must preserve the Beta 2 candidate",
  );
  const currentPackages = new Set(catalog.packages.map((entry) => entry.name));
  const currentEntrypoints = new Set(currentRecords.map(surfaceKey));
  for (const packageName of evidence.candidate.newPackages)
    assert.ok(
      currentPackages.has(packageName),
      `Current catalog removed Beta 2 package ${packageName}`,
    );
  for (const entrypoint of evidence.candidate.newEntrypoints)
    assert.ok(
      currentEntrypoints.has(entrypoint),
      `Current surface removed Beta 2 entrypoint ${entrypoint}`,
    );
  assert.equal(evidence.removedPackages, 0);
  assert.equal(evidence.removedEntrypoints, 0);
  assert.equal(evidence.removedTypeExports, 0);
  assert.equal(
    evidence.reportSha256,
    sha256(JSON.stringify(withoutKey(evidence, "reportSha256"))),
  );
  execFileSync(
    "git",
    ["merge-base", "--is-ancestor", evidence.candidateCommit, "HEAD"],
    { cwd: root, stdio: "ignore" },
  );
  await compileBaselineSources(compatibilityCommit);
}

process.stdout.write(
  `Beta 2 compatibility passed: ${baselineSurface.records.length} prior entrypoints, ${currentRecords.length} current entrypoints, ${compiledBaselineSources} compiled contracts\n`,
);

async function compileBaselineSources(sourceTag) {
  const sources = git([
    "ls-tree",
    "-r",
    "--name-only",
    sourceTag,
    "tests",
    "scripts/pack-consumers",
  ])
    .split("\n")
    .filter(
      (file) =>
        file.endsWith(".test.mts") ||
        (file.startsWith("scripts/pack-consumers/") &&
          file.endsWith("-types.ts")),
    )
    .sort(compareAscii);
  assert(sources.length > 0);
  const temporaryRoot = await mkdtemp(
    path.join(root, ".agentplat-beta1-compat-"),
  );
  try {
    const sourceRoot = path.join(temporaryRoot, "sources");
    await mkdir(sourceRoot, { recursive: true });
    await Promise.all(
      sources.map((file, index) =>
        writeFile(
          path.join(
            sourceRoot,
            `${String(index).padStart(3, "0")}-${path.basename(file)}`,
          ),
          git(["show", `${sourceTag}:${file}`]),
          "utf8",
        ),
      ),
    );
    await writeFile(
      path.join(temporaryRoot, "tsconfig.json"),
      `${JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "NodeNext",
            moduleResolution: "NodeNext",
            strict: true,
            noEmit: true,
            skipLibCheck: false,
            types: [],
            lib: ["ES2022", "DOM"],
          },
          include: ["sources/*"],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    execFileSync(
      process.execPath,
      [
        path.join(root, "node_modules/typescript/bin/tsc"),
        "-p",
        "tsconfig.json",
      ],
      { cwd: temporaryRoot, stdio: "inherit" },
    );
    return sources.length;
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

function declaredExportSubpaths(manifest) {
  if (!manifest.exports || typeof manifest.exports !== "object") return ["."];
  const keys = Object.keys(manifest.exports);
  return keys.some((key) => key.startsWith("."))
    ? keys.sort(compareAscii)
    : ["."];
}

function surfaceKey(record) {
  return record.subpath === "."
    ? record.package
    : `${record.package}/${record.subpath.slice(2)}`;
}

function withoutKey(value, key) {
  const result = { ...value };
  delete result[key];
  return result;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function git(values) {
  return execFileSync("git", values, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
}

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function parseArguments(values) {
  const supported = new Set(["--mode", "--output"]);
  const result = new Map();
  for (let index = 0; index < values.length; index += 1) {
    const name = values[index];
    if (name === "--") continue;
    if (!supported.has(name))
      throw new TypeError(`Unsupported argument: ${name}`);
    const value = values[index + 1];
    if (value === undefined || value.startsWith("--"))
      throw new TypeError(`${name} requires a value`);
    result.set(name, value);
    index += 1;
  }
  return result;
}
