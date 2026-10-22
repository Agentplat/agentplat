import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertPackedInternalDependencyRanges } from "./packed-manifest.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const json = (file, value) =>
  writeFile(file, JSON.stringify(value, null, 2) + "\n");
const run = (command, args, cwd = root) =>
  execFileSync(command, args, {
    cwd,
    env: { ...process.env, npm_config_userconfig: "/dev/null" },
    stdio: "pipe",
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
assert.equal(
  process.env.AGENTPLAT_POSTGRES_TEST,
  "1",
  "This verifier requires an isolated test PostgreSQL instance: AGENTPLAT_POSTGRES_TEST=1",
);
const scratch = await mkdtemp(
  path.join(os.tmpdir(), "agentplat-memory-consumer-"),
);
const fixtureNames = [
  "persistent-memory-postgres.mjs",
  "persistent-memory-types.mts",
];
async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory())
      result.push(...(await files(path.join(directory, entry.name))));
    else if (entry.isFile()) result.push(path.join(directory, entry.name));
    else throw Error("Unexpected symlink in artifact/source: " + entry.name);
  }
  return result.sort();
}
async function hashedFiles(base, paths) {
  return Promise.all(
    paths.sort().map(async (file) => ({
      path: path.relative(base, file),
      sha256: sha(await readFile(file)),
    })),
  );
}
async function checkBundle(bundle, receipt) {
  assert.equal(receipt.schemaVersion, 1);
  assert.equal(receipt.kind, "persistent-memory-source-preview");
  assert.equal(receipt.published, false);
  const paths = new Set();
  for (const item of receipt.files) {
    assert.ok(
      !path.isAbsolute(item.path) && !item.path.split(/[\\/]/).includes(".."),
      "Unsafe bundle path",
    );
    assert.ok(!paths.has(item.path), "Duplicate bundle path");
    paths.add(item.path);
    assert.equal(
      sha(await readFile(path.join(bundle, item.path))),
      item.sha256,
      "Bundle bytes changed: " + item.path,
    );
  }
  for (const item of receipt.packages)
    assert.ok(paths.has("tarballs/" + item.filename), "Unsealed package");
  for (const file of [
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    ...fixtureNames,
  ])
    assert.ok(paths.has("consumer/" + file), "Unsealed consumer input");
  if (receipt.checks.npmFirst)
    for (const file of ["package.json", "package-lock.json", ...fixtureNames])
      assert.ok(
        paths.has("npm-consumer/" + file),
        "Unsealed npm consumer input",
      );
  const actual = [
    ...(await files(path.join(bundle, "tarballs"))),
    ...(await files(path.join(bundle, "consumer"))),
    ...(receipt.checks.npmFirst
      ? await files(path.join(bundle, "npm-consumer"))
      : []),
  ]
    .map((file) => path.relative(bundle, file))
    .sort();
  assert.deepEqual(actual, [...paths].sort(), "Unsealed files in bundle");
  assert.equal(sha(JSON.stringify(receipt.files)), receipt.bundleDigest);
}
async function consumerCopy(bundle, label, manager = "pnpm") {
  const base = path.join(scratch, label);
  await mkdir(base);
  await cp(path.join(bundle, "tarballs"), path.join(base, "tarballs"), {
    recursive: true,
  });
  await cp(
    path.join(bundle, manager === "npm" ? "npm-consumer" : "consumer"),
    path.join(base, "consumer"),
    {
      recursive: true,
    },
  );
  return path.join(base, "consumer");
}
async function validateConsumer(consumer, packages, manager = "pnpm") {
  const expected = new Map(packages.map((p) => [p.name, p]));
  const tree = JSON.parse(
    run(
      manager,
      manager === "npm"
        ? ["ls", "--all", "--json", "--long"]
        : ["list", "--depth", "Infinity", "--json"],
      consumer,
    ),
  );
  const visited = new Set();
  async function visit(node) {
    for (const field of [
      "dependencies",
      "devDependencies",
      "optionalDependencies",
    ])
      for (const [name, dependency] of Object.entries(node[field] ?? {})) {
        if (name.startsWith("@agentplat/")) {
          assert.ok(
            expected.has(name),
            "Unexpected AgentPlat dependency " + name,
          );
          const location = await realpath(dependency.path);
          assert.ok(
            location.startsWith(
              (await realpath(path.dirname(consumer))) + path.sep,
            ),
            "Workspace dependency escaped isolation",
          );
          const installed = await readJson(path.join(location, "package.json"));
          assert.equal(
            installed.version,
            expected.get(name).version,
            "Mixed cohort " + name,
          );
          if (!visited.has(location)) {
            // Compare every packaged file, not only package version strings.
            const archive = path.resolve(
              consumer,
              "../tarballs",
              expected.get(name).filename,
            );
            const unpack = await mkdtemp(path.join(scratch, "unpack-"));
            const entries = run("tar", ["-tzf", archive]).trim().split("\n");
            for (const e of entries)
              assert.ok(
                e.startsWith("package/") && !e.split("/").includes(".."),
                "Unsafe package path",
              );
            for (const entry of run("tar", ["-tvzf", archive])
              .trim()
              .split("\n"))
              assert.ok(
                ["-", "d"].includes(entry[0]),
                "Links and special files are not supported in preview archives",
              );
            run("tar", ["-xzf", archive, "-C", unpack]);
            for (const file of await files(path.join(unpack, "package"))) {
              const relative = path.relative(
                path.join(unpack, "package"),
                file,
              );
              assert.equal(
                sha(await readFile(path.join(location, relative))),
                sha(await readFile(file)),
                "Installed bytes changed: " + name + "/" + relative,
              );
            }
            await rm(unpack, { recursive: true, force: true });
            visited.add(location);
          }
        }
        await visit(dependency);
      }
  }
  for (const node of Array.isArray(tree) ? tree : [tree]) await visit(node);
  assert.ok(visited.size >= packages.length);
  run(
    process.execPath,
    [
      path.join(consumer, "node_modules/typescript/bin/tsc"),
      "--noEmit",
      "--strict",
      "--skipLibCheck",
      "false",
      "--target",
      "ES2022",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "persistent-memory-types.mts",
    ],
    consumer,
  );
  const output = run(
    process.execPath,
    ["persistent-memory-postgres.mjs"],
    consumer,
  );
  const result = JSON.parse(output.trim().split("\n").at(-1));
  assert.equal(result.passed, true);
  return {
    installedPackageLocations: visited.size,
    publicTypes: true,
    postgres: result,
  };
}
try {
  const verifyIndex = process.argv.indexOf("--verify");
  if (verifyIndex !== -1) {
    assert.ok(
      process.argv[verifyIndex + 1],
      "--verify requires a bundle directory",
    );
    const bundle = path.resolve(process.argv[verifyIndex + 1]);
    const receipt = await readJson(path.join(bundle, "bundle.json"));
    await checkBundle(bundle, receipt);
    const managerIndex = process.argv.indexOf("--manager");
    const manager =
      managerIndex === -1 ? "pnpm" : process.argv[managerIndex + 1];
    assert.ok(
      ["pnpm", "npm"].includes(manager),
      "Expected --manager pnpm or npm",
    );
    if (manager === "npm")
      assert.ok(
        receipt.checks.npmFirst,
        "This bundle has no verified npm consumer",
      );
    const consumer = await consumerCopy(bundle, "replay", manager);
    console.log(
      "Installing sealed memory preview with " +
        manager +
        " frozen dependency graph...",
    );
    run(
      manager,
      manager === "npm"
        ? ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]
        : ["install", "--frozen-lockfile", "--ignore-scripts"],
      consumer,
    );
    const result = await validateConsumer(consumer, receipt.packages, manager);
    console.log(
      JSON.stringify({
        bundleDigest: receipt.bundleDigest,
        replayed: true,
        manager,
        ...result,
      }),
    );
  } else {
    const manifests = new Map();
    for (const entry of await readdir(path.join(root, "packages"), {
      withFileTypes: true,
    }))
      if (entry.isDirectory()) {
        const directory = path.join(root, "packages", entry.name);
        try {
          const manifest = await readJson(path.join(directory, "package.json"));
          manifests.set(manifest.name, { directory, manifest });
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      }
    const selected = new Set();
    function select(name) {
      if (selected.has(name)) return;
      const entry = manifests.get(name);
      assert.ok(entry, "Missing package " + name);
      selected.add(name);
      for (const field of [
        "dependencies",
        "optionalDependencies",
        "peerDependencies",
      ])
        for (const dependency of Object.keys(entry.manifest[field] ?? {}))
          if (dependency.startsWith("@agentplat/")) select(dependency);
    }
    const roots = [
      "@agentplat/rooms-postgres",
      "@agentplat/workflows-postgres",
      "@agentplat/framework",
      "@agentplat/model-openai-compatible",
      "@agentplat/runtime-mock",
      "@agentplat/workflows-rooms",
    ];
    for (const name of roots) select(name);
    const names = [...selected].sort();
    const versions = new Set(
      names.map((name) => manifests.get(name).manifest.version),
    );
    assert.equal(
      versions.size,
      1,
      "Preview packages must be one coordinated version",
    );
    const sourcePaths = [
      path.join(root, "tsconfig.base.json"),
      path.join(root, "package.json"),
      path.join(root, "pnpm-workspace.yaml"),
      path.join(root, "pnpm-lock.yaml"),
      fileURLToPath(import.meta.url),
      path.join(root, "scripts/packed-manifest.mjs"),
      ...fixtureNames.map((n) => path.join(root, "scripts/pack-consumers", n)),
    ];
    for (const name of names) {
      const dir = manifests.get(name).directory;
      for (const file of ["package.json", "tsconfig.json", "README.md"])
        sourcePaths.push(path.join(dir, file));
      sourcePaths.push(...(await files(path.join(dir, "src"))));
      try {
        sourcePaths.push(...(await files(path.join(dir, "migrations"))));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    const sourceFiles = await hashedFiles(root, sourcePaths),
      sourceDigest = sha(JSON.stringify(sourceFiles));
    const bundle = path.join(
      root,
      "release-artifacts",
      "memory-preview",
      new Date().toISOString().replaceAll(":", "-") +
        "-" +
        sourceDigest.slice(0, 12),
    );
    await mkdir(path.join(bundle, "tarballs"), { recursive: true });
    await mkdir(path.join(bundle, "consumer"));
    console.log(
      "Building and packing " + names.length + " coordinated packages...",
    );
    run("pnpm", [
      ...roots.flatMap((name) => ["--filter", name + "..."]),
      "build",
    ]);
    const packages = [];
    for (const name of names) {
      const { directory, manifest } = manifests.get(name);
      run(
        "pnpm",
        ["pack", "--pack-destination", path.join(bundle, "tarballs")],
        directory,
      );
      const filename =
        name.replace("@", "").replace("/", "-") +
        "-" +
        manifest.version +
        ".tgz";
      const archive = path.join(bundle, "tarballs", filename);
      const packed = JSON.parse(
        run("tar", ["-xOf", archive, "package/package.json"]),
      );
      assertPackedInternalDependencyRanges(packed);
      const bytes = await readFile(archive);
      packages.push({
        name,
        version: packed.version,
        filename,
        size: bytes.length,
        sha256: sha(bytes),
        integrity:
          "sha512-" + createHash("sha512").update(bytes).digest("base64"),
      });
    }
    assert.deepEqual(
      await hashedFiles(root, sourcePaths),
      sourceFiles,
      "Source changed during build/pack",
    );
    const dependencies = Object.fromEntries(
      packages.map((p) => [p.name, "file:../tarballs/" + p.filename]),
    );
    const adapterRequire = createRequire(
      path.join(root, "packages/rooms-postgres/package.json"),
    );
    const installedVersion = (name) => {
      try {
        return require(name + "/package.json").version;
      } catch (error) {
        if (error.code !== "MODULE_NOT_FOUND") throw error;
        return adapterRequire(name + "/package.json").version;
      }
    };
    const manifest = {
      name: "agentplat-persistent-memory-consumer",
      version: "0.0.0",
      private: true,
      type: "module",
      packageManager: (await readJson(path.join(root, "package.json")))
        .packageManager,
      dependencies,
      devDependencies: {
        typescript: installedVersion("typescript"),
        "@types/node": installedVersion("@types/node"),
      },
    };
    await json(path.join(bundle, "consumer/package.json"), manifest);
    // pnpm 11 reads dependency overrides from workspace settings, not package.json.
    await json(path.join(bundle, "consumer/pnpm-workspace.yaml"), {
      packages: [],
      overrides: dependencies,
      nodeLinker: "isolated",
      hoist: false,
    });
    for (const name of fixtureNames)
      await copyFile(
        path.join(root, "scripts/pack-consumers", name),
        path.join(bundle, "consumer", name),
      );
    const first = await consumerCopy(bundle, "first");
    console.log(
      "Installing tarballs outside the workspace and checking PostgreSQL consumer...",
    );
    run("pnpm", ["install", "--no-frozen-lockfile", "--ignore-scripts"], first);
    const firstResult = await validateConsumer(first, packages);
    await copyFile(
      path.join(first, "pnpm-lock.yaml"),
      path.join(bundle, "consumer/pnpm-lock.yaml"),
    );
    const second = await consumerCopy(bundle, "frozen");
    console.log("Repeating clean installation with frozen dependency graph...");
    run("pnpm", ["install", "--frozen-lockfile", "--ignore-scripts"], second);
    const secondResult = await validateConsumer(second, packages);
    await mkdir(path.join(bundle, "npm-consumer"));
    const npmManifest = {
      ...manifest,
      packageManager: "npm@" + run("npm", ["--version"]).trim(),
      overrides: Object.fromEntries(
        Object.keys(dependencies).map((name) => [name, "$" + name]),
      ),
    };
    await json(path.join(bundle, "npm-consumer/package.json"), npmManifest);
    for (const name of fixtureNames)
      await copyFile(
        path.join(bundle, "consumer", name),
        path.join(bundle, "npm-consumer", name),
      );
    const npmFirst = await consumerCopy(bundle, "npm-first", "npm");
    console.log("Checking isolated npm installation of the same cohort...");
    run(
      "npm",
      ["install", "--ignore-scripts", "--no-audit", "--no-fund"],
      npmFirst,
    );
    const npmFirstResult = await validateConsumer(npmFirst, packages, "npm");
    await copyFile(
      path.join(npmFirst, "package-lock.json"),
      path.join(bundle, "npm-consumer/package-lock.json"),
    );
    const npmFrozen = await consumerCopy(bundle, "npm-frozen", "npm");
    console.log("Repeating npm consumer with npm ci...");
    run(
      "npm",
      ["ci", "--ignore-scripts", "--no-audit", "--no-fund"],
      npmFrozen,
    );
    const npmFrozenResult = await validateConsumer(npmFrozen, packages, "npm");
    const sealed = await hashedFiles(bundle, [
      ...(await files(path.join(bundle, "tarballs"))),
      ...(await files(path.join(bundle, "consumer"))),
      ...(await files(path.join(bundle, "npm-consumer"))),
    ]);
    const receipt = {
      schemaVersion: 1,
      kind: "persistent-memory-source-preview",
      published: false,
      sourceCommit: run("git", ["rev-parse", "HEAD"]).trim(),
      workingTreeDirty: !!run("git", ["status", "--porcelain"]).trim(),
      sourceDigest,
      sourceFiles,
      node: process.version,
      pnpm: run("pnpm", ["--version"]).trim(),
      npm: run("npm", ["--version"]).trim(),
      roots,
      packages,
      files: sealed,
      bundleDigest: sha(JSON.stringify(sealed)),
      checks: {
        first: firstResult,
        frozen: secondResult,
        npmFirst: npmFirstResult,
        npmFrozen: npmFrozenResult,
      },
    };
    await json(path.join(bundle, "bundle.json"), receipt);
    await checkBundle(bundle, receipt);
    console.log(
      JSON.stringify({
        bundle,
        bundleDigest: receipt.bundleDigest,
        packages: packages.length,
        publicTypes: true,
        isolatedInstall: true,
        frozenReinstall: true,
        npmInstall: true,
        npmCi: true,
        postgres: true,
        published: false,
      }),
    );
  }
} catch (error) {
  if (error.stdout) console.error(String(error.stdout));
  if (error.stderr) console.error(String(error.stderr));
  throw error;
} finally {
  await rm(scratch, { recursive: true, force: true });
}
