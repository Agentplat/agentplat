import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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

import {
  loadPublicPackageCatalog,
  packSmokePackages,
} from "./public-package-catalog.mjs";
import { assertReleaseLine } from "./release-line.mjs";

const root = process.cwd();
const rootManifest = JSON.parse(
  await readFile(path.join(root, "package.json"), "utf8"),
);
const catalog = await loadPublicPackageCatalog(root);
await assertReleaseLine({ root, rootManifest, catalog });
const packages = packSmokePackages(catalog);
const temporaryRoot = await mkdtemp(
  path.join(os.tmpdir(), "agentplat-packed-postgres-consumer-"),
);
const tarballRoot = path.join(temporaryRoot, "tarballs");
const consumerRoot = path.join(temporaryRoot, "consumer");
const store = execFileSync("corepack", ["pnpm", "store", "path"], {
  cwd: root,
  encoding: "utf8",
}).trim();

try {
  await Promise.all([
    mkdir(tarballRoot, { recursive: true }),
    mkdir(consumerRoot, { recursive: true }),
  ]);
  const overrides = {};
  for (const entry of packages) {
    const packageRoot = path.join(root, entry.directory);
    const manifest = JSON.parse(
      await readFile(path.join(packageRoot, "package.json"), "utf8"),
    );
    execFileSync(
      "corepack",
      ["pnpm", "pack", "--pack-destination", tarballRoot],
      { cwd: packageRoot, stdio: "pipe" },
    );
    const tarball = path.join(
      tarballRoot,
      `agentplat-${manifest.name.slice("@agentplat/".length)}-${manifest.version}.tgz`,
    );
    overrides[manifest.name] = `file:${tarball}`;
  }
  assert.equal(Object.keys(overrides).length, packages.length);
  await Promise.all([
    writeFile(
      path.join(consumerRoot, "package.json"),
      `${JSON.stringify(
        {
          name: "agentplat-packed-postgres-readiness-consumer",
          version: "1.0.0",
          private: true,
          type: "module",
          packageManager: "pnpm@8.10.0",
          dependencies: {
            "@agentplat/collective-control-postgres":
              overrides["@agentplat/collective-control-postgres"],
            "@agentplat/mesh-conformance":
              overrides["@agentplat/mesh-conformance"],
            pg: rootManifest.devDependencies.pg,
          },
          pnpm: { overrides },
        },
        null,
        2,
      )}\n`,
    ),
    writeFile(
      path.join(consumerRoot, ".npmrc"),
      "node-linker=isolated\nhoist=false\nstrict-peer-dependencies=true\n",
    ),
    copyFile(
      path.join(
        root,
        "scripts/pack-consumers/collective-control-postgres-beta2.mjs",
      ),
      path.join(consumerRoot, "verify-postgres.mjs"),
    ),
  ]);
  execFileSync(
    "corepack",
    [
      "pnpm",
      "install",
      "--offline",
      "--ignore-scripts",
      "--no-frozen-lockfile",
      "--store-dir",
      store,
    ],
    { cwd: consumerRoot, env: installEnvironment(), stdio: "inherit" },
  );
  const output = execFileSync(process.execPath, ["verify-postgres.mjs"], {
    cwd: consumerRoot,
    env: runtimeEnvironment(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
  const result = JSON.parse(output.split(/\r?\n/u).at(-1));
  assert.deepEqual(result, {
    status: "passed",
    profile: "postgres",
    conformanceCases: 14,
  });
  process.stdout.write(
    `${JSON.stringify({
      status: "passed",
      profile: "packed_postgres",
      packages: packages.length,
      conformanceCases: result.conformanceCases,
      registryReads: 0,
    })}\n`,
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

function installEnvironment() {
  return selectEnvironment(
    new Set([
      "ALL_PROXY",
      "COMSPEC",
      "HTTP_PROXY",
      "HTTPS_PROXY",
      "LANG",
      "LC_ALL",
      "LC_CTYPE",
      "NODE_EXTRA_CA_CERTS",
      "NO_PROXY",
      "PATH",
      "PATHEXT",
      "SSL_CERT_FILE",
      "SYSTEMROOT",
      "TEMP",
      "TMP",
      "TMPDIR",
      "WINDIR",
    ]),
  );
}

function runtimeEnvironment() {
  return selectEnvironment(
    new Set([
      "COMSPEC",
      "DATABASE_URL",
      "LANG",
      "LC_ALL",
      "LC_CTYPE",
      "PATH",
      "PATHEXT",
      "PGDATABASE",
      "PGHOST",
      "PGPASSWORD",
      "PGPORT",
      "PGSSLMODE",
      "PGUSER",
      "SYSTEMROOT",
      "TEMP",
      "TMP",
      "TMPDIR",
      "WINDIR",
    ]),
  );
}

function selectEnvironment(keys) {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      ([key, value]) =>
        typeof value === "string" && keys.has(key.toUpperCase()),
    ),
  );
}
