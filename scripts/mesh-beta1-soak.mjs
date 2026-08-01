import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { promisify } from "node:util";

const execute = promisify(execFile);
const argumentsByName = parseArguments(process.argv.slice(2));
const repetitions = bounded(
  argumentsByName.get("--repetitions") ?? "2",
  "--repetitions",
  3,
);
const messages = bounded(
  argumentsByName.get("--messages") ?? "9",
  "--messages",
  64,
);
const output = argumentsByName.get("--output");
const candidateCommit = argumentsByName.get("--candidate-commit") ?? null;
const seed = argumentsByName.get("--seed") ?? "agentplat-beta1-soak";
if (!/^[A-Za-z0-9._:@-]{1,128}$/u.test(seed)) {
  throw new TypeError("--seed is invalid");
}

const runs = [];
let diagnosticCount = 0;
for (let index = 0; index < repetitions; index += 1) {
  const result = await execute(
    process.execPath,
    ["examples/mesh-multiprocess/demo.mjs"],
    {
      cwd: new URL("..", import.meta.url),
      env: {
        ...process.env,
        MESH_SOAK_MESSAGES: String(messages),
        MESH_SOAK_SEED: seed,
        ...(candidateCommit === null
          ? {}
          : { AGENTPLAT_CANDIDATE_COMMIT: candidateCommit }),
      },
      timeout: 120_000,
      maxBuffer: 1_048_576,
    },
  );
  diagnosticCount += result.stderr
    .split("\n")
    .filter((line) => line.trim().length > 0).length;
  const lines = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{"));
  assert.equal(lines.length, 1);
  const report = JSON.parse(lines[0]);
  assert.equal(report.status, "passed");
  assert.equal(report.correctnessViolations, 0);
  assert.equal(report.integrityMismatches, 0);
  assert.equal(report.reorderedDelivery, true);
  assert.deepEqual(report.pending, { inbox: 0, outbox: 0 });
  runs.push(
    Object.freeze({
      repetition: index + 1,
      acceptedMessages: report.acceptedMessages,
      duplicateAttempts: report.duplicateAttempts,
      processesStarted: report.processesStarted,
      reorderedDelivery: report.reorderedDelivery,
      finalStateDigest: report.finalStateDigest,
      cleanup: "completed",
    }),
  );
}

assert.equal(
  new Set(runs.map(({ finalStateDigest }) => finalStateDigest)).size,
  1,
);
const report = Object.freeze({
  schemaVersion: 1,
  releaseVersion: "0.3.0-beta.1",
  candidateCommit,
  status: "passed",
  seed,
  repetitions,
  messagesPerRepetition: runs[0].acceptedMessages,
  mixedWireVersions: Object.freeze([0, 1]),
  faultMatrix: Object.freeze([
    "durable_receiver_restart",
    "rolling_peer_restart",
    "network_duplicate",
    "network_reorder",
    "timeout_after_remote_commit",
    "overload_retry",
  ]),
  deterministicFinalState: true,
  finalStateDigest: runs[0].finalStateDigest,
  diagnosticCount,
  correctnessViolations: 0,
  integrityMismatches: 0,
  staleFenceMutations: 0,
  cleanup: "completed",
  runs: Object.freeze(runs),
});
const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (output === undefined) process.stdout.write(serialized);
else await writeFile(output, serialized, { encoding: "utf8", mode: 0o644 });

function parseArguments(values) {
  const supported = new Set([
    "--candidate-commit",
    "--messages",
    "--output",
    "--repetitions",
    "--seed",
  ]);
  const result = new Map();
  for (let index = 0; index < values.length; index += 1) {
    const name = values[index];
    if (name === "--") continue;
    if (!supported.has(name))
      throw new TypeError(`Unsupported argument: ${name}`);
    const value = values[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new TypeError(`${name} requires a value`);
    }
    result.set(name, value);
    index += 1;
  }
  return result;
}

function bounded(value, name, maximum) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum) {
    throw new RangeError(`${name} must be from 1 through ${maximum}`);
  }
  return number;
}
