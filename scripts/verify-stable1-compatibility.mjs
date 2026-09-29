import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  inspectSourceTypeSurface,
  inspectPackedTypeSurface,
  assertPublicApiCompatibility,
} from "./public-api-surface.mjs";
const root = process.cwd();
// Source recorded in docs/releases/stable1-distribution-20260922.md, not a moving ref.
const baseline = "d59e59e452711c834728470f93953c93908da1a3";
const temp = await mkdtemp(path.join(tmpdir(), "agentplat-stable1-compat-"));
try {
  const archive = execFileSync(
    "git",
    ["archive", baseline, "packages", "tests", "config/public-packages.json"],
    { cwd: root, maxBuffer: 128 * 1024 * 1024 },
  );
  execFileSync("tar", ["-xf", "-", "-C", temp], {
    input: archive,
    maxBuffer: 128 * 1024 * 1024,
  });
  const catalog = JSON.parse(
    await readFile(path.join(temp, "config/public-packages.json"), "utf8"),
  );
  const current = JSON.parse(
    await readFile(path.join(root, "config/public-packages.json"), "utf8"),
  );
  const old = [],
    next = [];
  for (const [base, entries, records, inspect] of [
    [temp, catalog.packages, old, inspectSourceTypeSurface],
    [
      root,
      current.packages.filter((x) => x.publish),
      next,
      inspectPackedTypeSurface,
    ],
  ]) {
    for (const entry of entries) {
      const packageRoot = path.join(base, entry.directory),
        manifest = JSON.parse(
          await readFile(path.join(packageRoot, "package.json"), "utf8"),
        );
      for (const subpath of Object.keys(
        manifest.exports ?? { ".": { types: manifest.types } },
      ))
        records.push({
          package: entry.name,
          subpath,
          browser: entry.browserEntrypoints.includes(subpath),
          sideEffects: manifest.sideEffects,
          ...inspect(packageRoot, manifest, subpath),
        });
    }
  }
  assertPublicApiCompatibility(old, next);
  const contracts = execFileSync(
    "git",
    ["ls-tree", "-r", "--name-only", baseline, "tests"],
    { cwd: root, encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter((x) => x.endsWith(".test.mts"));
  assert.ok(contracts.length > 0);
  // Only public-import fixtures qualify: relative source imports could accidentally test baseline code.
  for (const file of contracts)
    assert.ok(
      !/from\s*["']\.{1,2}\//u.test(
        await readFile(path.join(temp, file), "utf8"),
      ),
      `Non-public fixture: ${file}`,
    );
  await symlink(
    path.join(root, "node_modules"),
    path.join(temp, "node_modules"),
    "dir",
  );
  await writeFile(
    path.join(temp, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        noEmit: true,
        skipLibCheck: false,
        esModuleInterop: true,
      },
      files: contracts,
    }),
  );
  execFileSync(
    process.execPath,
    [
      path.join(root, "node_modules/typescript/bin/tsc"),
      "--project",
      path.join(temp, "tsconfig.json"),
    ],
    { cwd: root, stdio: "inherit" },
  );
  console.log(
    JSON.stringify({
      status: "passed",
      baselineCommit: baseline,
      baselinePackages: catalog.packages.length,
      baselineEntrypoints: old.length,
      currentEntrypoints: next.length,
      unchangedTypeContracts: contracts.length,
      evidenceBoundary:
        "Export/browser/import-side-effect preservation and unchanged public type fixtures; not exhaustive behavioral or production validation.",
    }),
  );
} finally {
  await rm(temp, { recursive: true, force: true });
}
