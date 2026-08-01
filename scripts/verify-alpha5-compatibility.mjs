import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  discoverWorkspacePackageManifests,
  loadPublicPackageCatalog,
} from "./public-package-catalog.mjs";

const root = process.cwd();
const baselineTag = "v0.3.0-alpha.5";
const baselineCommit = "5d11f715947bd7d3e5b8f7311c8f6f68c8c33a98";
assert.equal(
  git(["rev-parse", `${baselineTag}^{commit}`]).trim(),
  baselineCommit,
);

const baselineCatalog = JSON.parse(
  git(["show", `${baselineTag}:config/public-packages.json`]),
);
const currentCatalog = await loadPublicPackageCatalog(root);
const currentManifests = new Map(
  (await discoverWorkspacePackageManifests(root)).map((record) => [
    record.manifest.name,
    record.manifest,
  ]),
);

for (const entry of baselineCatalog.packages) {
  const baselineManifest = JSON.parse(
    git(["show", `${baselineTag}:${entry.directory}/package.json`]),
  );
  const currentManifest = currentManifests.get(entry.name);
  assert.ok(currentManifest, `Beta 1 removed Alpha 5 package ${entry.name}`);
  const baselineExports = exportSubpaths(baselineManifest.exports);
  const currentExports = new Set(exportSubpaths(currentManifest.exports));
  for (const subpath of baselineExports) {
    assert.ok(
      currentExports.has(subpath),
      `Beta 1 removed Alpha 5 export ${entry.name}${subpath === "." ? "" : `/${subpath.slice(2)}`}`,
    );
  }
}

const baselineSources = git([
  "ls-tree",
  "-r",
  "--name-only",
  baselineTag,
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
assert.ok(baselineSources.length > 0);

const temporaryRoot = await mkdtemp(
  path.join(root, ".agentplat-alpha5-compat-"),
);
try {
  const sourceRoot = path.join(temporaryRoot, "sources");
  await mkdir(sourceRoot, { recursive: true });
  await Promise.all(
    baselineSources.map((file, index) =>
      writeFile(
        path.join(
          sourceRoot,
          `${String(index).padStart(3, "0")}-${path.basename(file)}`,
        ),
        git(["show", `${baselineTag}:${file}`]),
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
    [path.join(root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"],
    { cwd: temporaryRoot, stdio: "inherit" },
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

console.log(
  JSON.stringify({
    status: "passed",
    baselineTag,
    baselineCommit,
    baselinePackages: baselineCatalog.packages.length,
    currentPackages: currentCatalog.packages.length,
    compiledBaselineSources: baselineSources.length,
  }),
);

function git(args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
}

function exportSubpaths(exportsField) {
  if (
    typeof exportsField === "string" ||
    Array.isArray(exportsField) ||
    !exportsField ||
    typeof exportsField !== "object"
  ) {
    return ["."];
  }
  const keys = Object.keys(exportsField);
  return keys.some((key) => key.startsWith("."))
    ? keys.sort(compareAscii)
    : ["."];
}

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
