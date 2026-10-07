import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertPackedInternalDependencyRanges } from "./packed-manifest.mjs";
import { assertSecurePublishManifest } from "./verify-release.mjs";
import { extractPackageTarball } from "./publish-packages.mjs";
import { runPublicAudit } from "./audit-public.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const suppliedArtifacts = process.env.AGENTPLAT_PREPACKED_TARBALL_DIRECTORY;
const registrySource =
  process.env.AGENTPLAT_PUBLIC_CONSUMER_SOURCE === "registry";
assert.ok(
  !(suppliedArtifacts && registrySource),
  "Select either prepared artifacts or registry packages",
);
const outputDirectory = suppliedArtifacts
  ? path.join(root, "dependency-audit", "runner-consumer")
  : path.join(root, "release-artifacts", "runner-candidate");
const artifacts = suppliedArtifacts
  ? path.resolve(suppliedArtifacts)
  : outputDirectory;
const version = JSON.parse(
  await readFile(path.join(root, "package.json"), "utf8"),
).version;
const scratch = await mkdtemp(
  path.join(os.tmpdir(), "agentplat-runner-consumer-"),
);
const run = (command, args, cwd = root) =>
  execFileSync(command, args, {
    cwd,
    env: process.env,
    stdio: "pipe",
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
try {
  await mkdir(outputDirectory, { recursive: true });
  if (!registrySource && !suppliedArtifacts) {
    console.log("Building and packing runner candidates...");
    run("pnpm", ["--filter", "@agentplat/runner-hub...", "build"]);
  }
  const archives = [];
  for (const name of ["runner", "runner-hub", "postgres"]) {
    if (registrySource) {
      archives.push({
        name: `@agentplat/${name}`,
        version,
        source: "registry",
      });
      continue;
    }
    if (!suppliedArtifacts)
      run(
        "pnpm",
        ["pack", "--pack-destination", artifacts],
        path.join(root, "packages", name),
      );
    const manifest = JSON.parse(
      await readFile(path.join(root, "packages", name, "package.json"), "utf8"),
    );
    const archive = path.join(
      artifacts,
      `agentplat-${name}-${manifest.version}.tgz`,
    );
    const extracted = path.join(scratch, name);
    await mkdir(extracted);
    extractPackageTarball({
      root,
      environment: process.env,
      tarballPath: archive,
      destination: extracted,
    });
    const packed = JSON.parse(
      await readFile(path.join(extracted, "package", "package.json"), "utf8"),
    );
    assertPackedInternalDependencyRanges(packed);
    assertSecurePublishManifest(manifest.name, manifest);
    assert.deepEqual(packed.scripts, manifest.scripts);
    assert.deepEqual(packed.files, manifest.files);
    assert.equal(packed.name, manifest.name);
    assert.equal(packed.version, version);
    assert.deepEqual(packed.exports, manifest.exports);
    await runPublicAudit({ root: path.join(extracted, "package") });
    const bytes = await readFile(archive);
    archives.push({
      name: packed.name,
      version: packed.version,
      filename: path.basename(archive),
      size: bytes.length,
      integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
    });
  }
  console.log(
    registrySource
      ? "Installing runner registry packages into an isolated npm consumer..."
      : "Installing exact tarballs into an isolated npm consumer...",
  );
  const consumer = path.join(scratch, "consumer");
  await mkdir(consumer);
  await writeFile(
    path.join(consumer, "package.json"),
    JSON.stringify({
      name: "runner-packed-consumer",
      private: true,
      type: "module",
    }),
  );
  run(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      ...archives.map((a) =>
        registrySource
          ? `${a.name}@${version}`
          : path.join(artifacts, a.filename),
      ),
      "typescript@7.0.2",
      "ws@8.21.1",
    ],
    consumer,
  );
  for (const name of ["runner", "runner-hub", "postgres"]) {
    const installed = path.join(consumer, "node_modules", "@agentplat", name);
    assert.equal(
      JSON.parse(await readFile(path.join(installed, "package.json"), "utf8"))
        .version,
      version,
    );
  }
  await copyFile(
    path.join(root, "scripts", "pack-consumers", "runner-node-types.ts"),
    path.join(consumer, "node-types.ts"),
  );
  await copyFile(
    path.join(root, "scripts", "pack-consumers", "runner-browser-types.ts"),
    path.join(consumer, "browser-types.ts"),
  );
  for (const [name, lib, types] of [
    ["node", ["ES2022"], ["node"]],
    ["browser", ["ES2022", "DOM"], []],
  ]) {
    await writeFile(
      path.join(consumer, `tsconfig-${name}.json`),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          noEmit: true,
          skipLibCheck: false,
          module: "NodeNext",
          moduleResolution: "NodeNext",
          target: "ES2022",
          lib,
          types,
        },
        files: [`${name}-types.ts`],
      }),
    );
    run(
      process.execPath,
      [
        path.join(consumer, "node_modules/typescript/bin/tsc"),
        "-p",
        `tsconfig-${name}.json`,
      ],
      consumer,
    );
  }
  console.log("Node and browser declarations passed without skipLibCheck.");
  const auditReport = JSON.parse(
    run("npm", ["audit", "--omit=dev", "--json"], consumer),
  );
  assert.equal(auditReport.metadata.vulnerabilities.high, 0);
  assert.equal(auditReport.metadata.vulnerabilities.critical, 0);
  await copyFile(
    path.join(root, "scripts", "pack-consumers", "runner-runtime.mjs"),
    path.join(consumer, "runtime.mjs"),
  );
  const runtime = run(process.execPath, ["runtime.mjs"], consumer);
  console.log(runtime.trim());
  const report = {
    schemaVersion: 1,
    kind: "runner-package-candidate",
    published: false,
    sourceCommit: run("git", ["rev-parse", "HEAD"]).trim(),
    workingTreeDirty: run("git", ["status", "--porcelain"]).trim().length > 0,
    node: process.version,
    registrySource,
    preparedArtifacts: Boolean(suppliedArtifacts),
    archives,
    checks: {
      packedManifests: !registrySource,
      packedAudit: !registrySource,
      isolatedNpmInstall: true,
      nodeTypes: true,
      browserTypes: true,
      runtimeImports: true,
      isolatedDependencyAudit: true,
      externalWorkerBundle: Boolean(
        process.env.RUNNER_BROWSER_BUNDLE_PATH &&
        process.env.RUNNER_BROWSER_BRIDGE_PATH &&
        process.env.RUNNER_TEST_DATABASE_URL,
      ),
      postgresHttpWebSocket: Boolean(process.env.RUNNER_TEST_DATABASE_URL),
    },
  };
  await writeFile(
    path.join(outputDirectory, "verification.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(`Verified candidate artifacts: ${outputDirectory}`);
} catch (error) {
  if (error.stdout) console.error(String(error.stdout));
  if (error.stderr) console.error(String(error.stderr));
  throw error;
} finally {
  await rm(scratch, { recursive: true, force: true });
}
