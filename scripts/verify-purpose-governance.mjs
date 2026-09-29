import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
assert.equal(
  process.env.AGENTPLAT_POSTGRES_TEST,
  "1",
  "Set AGENTPLAT_POSTGRES_TEST=1 and disposable PostgreSQL credentials; this qualification gate does not accept skipped database tests",
);
assert.ok(
  process.argv.length <= 3,
  "Usage: node scripts/verify-purpose-governance.mjs [NEW_EVIDENCE_DIRECTORY]",
);
const directory = process.argv[2]
  ? resolve(process.argv[2])
  : await mkdtemp(join(tmpdir(), "agentplat-purpose-evidence-"));
if (process.argv[2]) await mkdir(directory, { recursive: false });
const steps = [];
async function run(name, command, args) {
  const started = Date.now(),
    result = spawnSync(command, args, {
      cwd: root,
      env: process.env,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      timeout: 180000,
    });
  const log = (result.stdout ?? "") + (result.stderr ?? "");
  await writeFile(join(directory, `${name}.log`), log);
  const record = {
    name,
    command: [command, ...args],
    exitCode: result.status,
    durationMs: Date.now() - started,
  };
  steps.push(record);
  if (result.error || result.status !== 0) {
    await writeFile(
      join(directory, "failure.json"),
      JSON.stringify({ steps, failed: name }, null, 2),
    );
    throw Error(`${name} failed; inspect ${join(directory, `${name}.log`)}`);
  }
  console.log(`${name}: passed`);
  return log;
}
await run("build", "pnpm", [
  "--filter",
  "@agentplat/rooms-postgres...",
  "--filter",
  "@agentplat/rooms-api...",
  "--filter",
  "@agentplat/workflows-rooms...",
  "build",
]);
await run("public-types", "pnpm", ["run", "type-check:public"]);
const files = [];
for (const dir of [
  "tests",
  "packages/rooms-api/test",
  "packages/rooms-postgres/tests",
  "packages/workflows-rooms/tests",
])
  for (const file of await readdir(join(root, dir))) {
    if (!file.endsWith(".test.mjs")) continue;
    if (
      dir === "tests" &&
      !file.startsWith("rooms-") &&
      file !== "purpose-support-demo.test.mjs"
    )
      continue;
    files.push(`${dir}/${file}`);
  }
files.sort();
const tap = await run("contracts", "node", [
  "--test",
  "--test-reporter=tap",
  ...files,
]);
const count = (name) => {
  const m = tap.match(new RegExp(`^# ${name} (\\d+)$`, "m"));
  assert.ok(m, `Missing TAP ${name}`);
  return Number(m[1]);
};
const tests = {
  total: count("tests"),
  passed: count("pass"),
  failed: count("fail"),
  skipped: count("skipped"),
  todo: count("todo"),
};
assert.equal(tests.failed, 0);
assert.equal(tests.skipped, 0);
assert.equal(tests.todo, 0);
assert.equal(tests.total, tests.passed);
for (const [name, script] of [
  ["platform-boundaries", "verify-platform-boundaries.mjs"],
  ["specification", "verify-agentplat-spec.mjs"],
  ["compatibility-sources", "verify-agentplat-conformance.mjs"],
  ["adoption-links", "verify-adoption-docs.mjs"],
])
  await run(name, "node", [`scripts/${script}`]);
async function tree(directory) {
  const result = [];
  for (const e of await readdir(join(root, directory), {
    withFileTypes: true,
  })) {
    const file = `${directory}/${e.name}`;
    if (e.isDirectory()) result.push(...(await tree(file)));
    else result.push(file);
  }
  return result;
}
const sourceFiles = [
  ...files,
  "package.json",
  ".github/workflows/ci.yml",
  "scripts/verify-public-consumer.mjs",
  "scripts/pack-consumers/purpose-governance.mjs",
  "scripts/verify-adoption-docs.mjs",
  "packages/rooms/package.json",
  "packages/rooms-api/package.json",
  "packages/rooms-postgres/package.json",
  "packages/workflows-rooms/package.json",
  "pnpm-lock.yaml",
  "scripts/verify-purpose-governance.mjs",
  "docs/specification/agent-purpose-governance-v1.md",
];
for (const d of [
  "packages/rooms/src",
  "packages/rooms-api/src",
  "packages/rooms-postgres/src",
  "packages/rooms-postgres/migrations",
  "packages/workflows-rooms/src",
  "examples/agent-purpose-support",
  "tests/helpers",
  "docs/agent-governance",
])
  sourceFiles.push(...(await tree(d)));
const sources = [];
for (const file of [...new Set(sourceFiles)].sort()) {
  const bytes = await readFile(join(root, file));
  sources.push({
    path: file,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
const evidence = {
  schemaVersion: 1,
  profile: "agentplat-room-purpose-v1",
  generatedAt: new Date().toISOString(),
  node: process.version,
  tests,
  steps,
  sources,
  evidenceBoundary:
    "Local source conformance with deterministic assessors and real disposable PostgreSQL. Not a release, external effect certification, semantic quality evaluation or production-scale evidence.",
};
await writeFile(
  join(directory, "evidence.json"),
  JSON.stringify(evidence, null, 2) + "\n",
);
console.log(
  `Purpose governance: ${tests.passed} tests, no skips. Evidence: ${directory}`,
);
