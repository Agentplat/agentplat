import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtemp,
  readFile,
  writeFile,
  mkdir,
  rm,
  readdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  discoverWorkspacePackageManifests,
  loadPublicPackageCatalog,
} from "./public-package-catalog.mjs";
import { assertPackedInternalDependencyRanges } from "./packed-manifest.mjs";
const root = process.cwd(),
  temporary = await mkdtemp(path.join(tmpdir(), "agentplat-a2a-consumer-"));
try {
  const records = await discoverWorkspacePackageManifests(root),
    byName = new Map(records.map((r) => [r.manifest.name, r]));
  const required = new Set();
  function collect(name) {
    if (required.has(name)) return;
    required.add(name);
    for (const dependency of Object.keys(
      byName.get(name).manifest.dependencies ?? {},
    ))
      if (dependency.startsWith("@agentplat/")) collect(dependency);
  }
  for (const target of ["@agentplat/a2a", "@agentplat/agent-registry-postgres"])
    collect(target);
  const catalog = await loadPublicPackageCatalog(root);
  for (const target of [
    "@agentplat/a2a",
    "@agentplat/agent-registry",
    "@agentplat/agent-registry-postgres",
  ])
    assert.ok(
      catalog.packages.find(
        (e) => e.name === target && e.publish && e.packSmoke,
      ),
    );
  const tarballs = path.join(temporary, "tarballs");
  await mkdir(tarballs);
  const dependencies = {};
  for (const name of [...required].sort()) {
    const record = byName.get(name);
    execFileSync("pnpm", ["pack", "--pack-destination", tarballs], {
      cwd: path.join(root, record.directory),
      stdio: "pipe",
    });
    const filename =
      name.replace("@", "").replace("/", "-") +
      "-" +
      record.manifest.version +
      ".tgz";
    const file = path.join(tarballs, filename);
    const manifest = JSON.parse(
      execFileSync("tar", ["-xOzf", file, "package/package.json"], {
        encoding: "utf8",
      }),
    );
    assertPackedInternalDependencyRanges(manifest);
    dependencies[name] = "file:" + file;
  }
  const consumer = path.join(temporary, "consumer");
  await mkdir(consumer);
  await writeFile(
    path.join(consumer, "package.json"),
    JSON.stringify({
      name: "a2a-consumer",
      private: true,
      type: "module",
      dependencies,
    }),
  );
  execFileSync(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
    ],
    { cwd: consumer, stdio: "pipe" },
  );
  await writeFile(
    path.join(consumer, "consumer.mts"),
    `import {AgentRegistry,InMemoryAgentRegistryStore} from '@agentplat/agent-registry';
import {A2AClient,A2AServer,InMemoryA2AStateStore,type A2AService} from '@agentplat/a2a';
import {RoomA2ABridge} from '@agentplat/a2a/rooms';
import {createMeshA2AAuthorizer} from '@agentplat/a2a/mesh';
import {createRegistryMorphogenesisDiscovery,proposeRegistryMorphogenesis} from '@agentplat/a2a/morphogenesis';
import {PostgresA2AStateStore,runMigrations} from '@agentplat/a2a/postgres';
import {PostgresAgentRegistryStore} from '@agentplat/agent-registry-postgres';
const registry=new AgentRegistry(new InMemoryAgentRegistryStore(),{authorize:async()=>true});
await registry.search({tenantId:'tenant',subjectId:'user'},{capabilities:['research']});
console.log('A2A packed consumer passed',typeof A2AClient,typeof A2AServer,typeof RoomA2ABridge,typeof createMeshA2AAuthorizer,typeof createRegistryMorphogenesisDiscovery,typeof proposeRegistryMorphogenesis,typeof PostgresA2AStateStore,typeof PostgresAgentRegistryStore,typeof runMigrations,new InMemoryA2AStateStore());\n`,
  );
  execFileSync(
    process.execPath,
    [
      path.join(root, "node_modules/typescript/bin/tsc"),
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "--target",
      "ES2022",
      "--strict",
      "--skipLibCheck",
      "consumer.mts",
    ],
    { cwd: consumer, stdio: "pipe" },
  );
  process.stdout.write(
    execFileSync(process.execPath, ["consumer.mjs"], {
      cwd: consumer,
      encoding: "utf8",
    }),
  );
  for (const name of ["a2a", "agent-registry", "agent-registry-postgres"]) {
    const files = await readdir(path.join(root, "packages", name, "dist"));
    for (const file of files.filter((f) => f.endsWith(".d.ts"))) {
      const text = await readFile(
        path.join(root, "packages", name, "dist", file),
        "utf8",
      );
      if (
        ["index.d.ts", "client.d.ts", "server.d.ts", "contracts.d.ts"].includes(
          file,
        )
      )
        assert.ok(
          !text.includes("@a2a-js/sdk"),
          `SDK type leaked in ${name}/${file}`,
        );
    }
  }
  console.log(
    `Verified ${required.size} packed workspace packages; SDK types stay inside the adapter.`,
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
