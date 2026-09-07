import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runPublicAudit } from "./audit-public.mjs";
import { assertReleaseLine } from "./release-line.mjs";
import { loadPublicPackageCatalog } from "./public-package-catalog.mjs";
import {
  extractPackageTarball,
  selectPublishablePackages,
} from "./publish-packages.mjs";
import { loadExternalTerminologyDenylist } from "./public-audit-terminology.mjs";
import { assertSecurePublishManifest } from "./verify-release.mjs";

export const RELEASE_ARTIFACT_MANIFEST = "npm-release-artifacts-v1.json";

export async function prepareNpmReleaseArtifacts({
  root = process.cwd(),
  environment = process.env,
} = {}) {
  const outputDirectory = path.resolve(
    root,
    environment.AGENTPLAT_RELEASE_ARTIFACT_DIRECTORY ?? "release-artifacts",
  );
  assert.ok(
    outputDirectory.startsWith(`${path.resolve(root)}${path.sep}`),
    "Release artifact directory must remain inside the repository workspace",
  );

  const rootManifest = JSON.parse(
    await readFile(path.join(root, "package.json"), "utf8"),
  );
  const catalog = await loadPublicPackageCatalog(root);
  await assertReleaseLine({ root, catalog, rootManifest });
  const scope = environment.NPM_PACKAGE_SCOPE ?? "all";
  const distTag = environment.NPM_DIST_TAG ?? "next";
  assert.match(distTag, /^[a-z][0-9a-z._-]*$/iu, "Invalid npm dist-tag");
  if (rootManifest.version.includes("-")) {
    assert.notEqual(
      distTag,
      "latest",
      `Refusing to prepare prerelease ${rootManifest.version} for latest`,
    );
  }

  const sourceCommit = git(root, ["rev-parse", "HEAD"]);
  assert.match(
    sourceCommit,
    /^[0-9a-f]{40}$/u,
    "Invalid release source commit",
  );
  if (environment.GITHUB_SHA !== undefined) {
    assert.equal(
      sourceCommit,
      environment.GITHUB_SHA,
      "GITHUB_SHA must match HEAD",
    );
    assert.equal(
      environment.GITHUB_REF,
      "refs/heads/main",
      "Release artifacts may only be prepared from refs/heads/main",
    );
  }
  assert.equal(
    git(root, ["status", "--porcelain"]),
    "",
    "Refusing to prepare release artifacts from a dirty tracked worktree",
  );
  await mkdir(outputDirectory, { recursive: true });
  assert.deepEqual(
    await readdir(outputDirectory),
    [],
    `Release artifact directory must start empty: ${outputDirectory}`,
  );

  const blockedTerms = await loadExternalTerminologyDenylist({
    root,
    filePath: environment.AGENTPLAT_PUBLIC_DENYLIST_FILE,
    required: true,
  });
  await runPublicAudit({
    root,
    blockedTerms,
    requireTerminologyDenylist: true,
  });

  const packages = selectPublishablePackages({ catalog, scope, root });
  const extractionRoot = await mkdtemp(
    path.join(os.tmpdir(), "agentplat-release-artifact-audit-"),
  );
  try {
    const artifacts = [];
    for (const packageEntry of packages) {
      const manifest = JSON.parse(
        await readFile(
          path.join(root, packageEntry.directory, "package.json"),
          "utf8",
        ),
      );
      assert.equal(manifest.name, packageEntry.name);
      assert.equal(manifest.version, rootManifest.version);
      assertSecurePublishManifest(manifest.name, manifest);
      execFileSync(
        "corepack",
        ["pnpm", "pack", "--pack-destination", outputDirectory],
        { cwd: path.join(root, packageEntry.directory), stdio: "pipe" },
      );
      const filename = expectedTarballName(manifest);
      const tarballPath = path.join(outputDirectory, filename);
      const stats = await lstat(tarballPath);
      assert.ok(stats.isFile(), `Missing release tarball ${filename}`);
      assert.equal(
        stats.isSymbolicLink(),
        false,
        `Tarball must not be a symlink: ${filename}`,
      );

      const destination = path.join(
        extractionRoot,
        packageEntry.name.slice("@agentplat/".length),
      );
      await mkdir(destination, { recursive: true });
      extractPackageTarball({
        destination,
        environment,
        root,
        tarballPath,
      });
      const extractedRoot = path.join(destination, "package");
      const packedManifest = JSON.parse(
        await readFile(path.join(extractedRoot, "package.json"), "utf8"),
      );
      assert.equal(packedManifest.name, manifest.name);
      assert.equal(packedManifest.version, manifest.version);
      await runPublicAudit({
        root: extractedRoot,
        blockedTerms,
        requireTerminologyDenylist: true,
        excludedDirectories: [],
        excludedFiles: [],
      });
      artifacts.push({
        filename,
        integrity: `sha512-${createHash("sha512")
          .update(await readFile(tarballPath))
          .digest("base64")}`,
        name: manifest.name,
        size: stats.size,
        version: manifest.version,
      });
    }

    artifacts.sort((left, right) => compareAscii(left.name, right.name));
    const body = {
      schemaVersion: 1,
      kind: "agentplat-npm-release-artifacts-v1",
      sourceCommit,
      releaseVersion: rootManifest.version,
      scope,
      distTag,
      artifacts,
    };
    const releaseManifest = {
      ...body,
      manifestDigest: digestCanonical(body),
    };
    await writeFile(
      path.join(outputDirectory, RELEASE_ARTIFACT_MANIFEST),
      `${JSON.stringify(releaseManifest, null, 2)}\n`,
      { encoding: "utf8", flag: "wx", mode: 0o600 },
    );
    console.log(
      `Prepared ${artifacts.length} immutable npm tarballs for ${rootManifest.version} from ${sourceCommit} (${releaseManifest.manifestDigest}).`,
    );
    return Object.freeze(releaseManifest);
  } finally {
    await rm(extractionRoot, { recursive: true, force: true });
  }
}

function expectedTarballName(manifest) {
  return `agentplat-${manifest.name.slice("@agentplat/".length)}-${manifest.version}.tgz`;
}

function git(root, arguments_) {
  return execFileSync("git", arguments_, {
    cwd: root,
    encoding: "utf8",
  }).trim();
}

function digestCanonical(value) {
  return `sha256-${createHash("sha256").update(canonical(value)).digest("base64")}`;
}

function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value)
    .sort(compareAscii)
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
    .join(",")}}`;
}

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    await prepareNpmReleaseArtifacts();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
