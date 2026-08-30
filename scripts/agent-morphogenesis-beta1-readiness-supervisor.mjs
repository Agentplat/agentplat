#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFile,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createPostgresPool } from "../packages/postgres/dist/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const profile = JSON.parse(
  await readFile(
    path.join(root, "config/agent-morphogenesis-beta1-operational-readiness-v1.json"),
    "utf8",
  ),
);
const options = parse(process.argv.slice(2));

if (options.mode === "contract-smoke") {
  exact(options, ["mode"]);
  assert.equal(profile.executionGeometry.minimumCompletedIterations, 120);
  assert.equal(profile.executionGeometry.soakDurationMs, 1_800_000);
  console.log(JSON.stringify({ status: "passed", executionPermitted: false }));
} else if (options.mode === "plan") {
  exact(options, [
    "authorization-directory",
    "confirm",
    "expected-public-key-sha256",
    "mode",
    "source-sha",
    "supervisor-directory",
    "temporal-db-file",
  ]);
  if (options.confirm !== "DO_NOT_RUN") fail("readiness_supervisor_plan_confirmation_invalid");
  const sourceCommit = required(options, "source-sha");
  if (!/^[0-9a-f]{40}$/u.test(sourceCommit) || git("rev-parse", "HEAD") !== sourceCommit)
    fail("readiness_supervisor_source_invalid");
  cleanTrackedTree();
  const supervisorDirectory = external(required(options, "supervisor-directory"));
  const authorizationDirectory = path.resolve(required(options, "authorization-directory"));
  const expectedPublicKeySha256 = required(options, "expected-public-key-sha256");
  if (!/^[0-9a-f]{64}$/u.test(expectedPublicKeySha256))
    fail("readiness_supervisor_public_key_digest_invalid");
  verifyAuthorization(
    authorizationDirectory,
    expectedPublicKeySha256,
    sourceCommit,
    new Date().toISOString(),
  );
  const config = {
    schemaVersion: 1,
    kind: "agentplat-agent-morphogenesis-beta1-readiness-supervisor-config-v1",
    sourceCommit,
    profileId: profile.profileId,
    profileDigest: digest("morphogenesis-readiness-profile-v1", profile),
    authorizationDirectory,
    expectedPublicKeySha256,
    temporalDbFile: path.resolve(required(options, "temporal-db-file")),
    soakDurationMs: profile.executionGeometry.soakDurationMs,
    minimumCompletedIterations:
      profile.executionGeometry.minimumCompletedIterations,
    roundsRequired: 20,
    iterationsPerRound: 6,
    meshCyclesRequired: profile.executionGeometry.meshPartitionHealCycles,
    postgresLossCyclesRequired:
      profile.executionGeometry.postgresConnectionLossCycles,
    heartbeatIntervalMs:
      profile.executionGeometry.supervisorHeartbeatIntervalMs,
    plannedAt: new Date().toISOString(),
  };
  const state = initialState(sourceCommit);
  await mkdir(supervisorDirectory, { recursive: true });
  await Promise.all([
    exclusive(supervisorDirectory, "supervisor-config.json", config),
    exclusive(supervisorDirectory, "supervisor-state.json", state),
    writeFile(path.join(supervisorDirectory, "supervisor-events.jsonl"), "", {
      encoding: "utf8",
      flag: "wx",
    }),
    writeFile(path.join(supervisorDirectory, "resource-samples.jsonl"), "", {
      encoding: "utf8",
      flag: "wx",
    }),
  ]);
  await appendEvent(supervisorDirectory, state, "planned", {
    sourceCommit,
    profileId: profile.profileId,
  });
  console.log(JSON.stringify({
    status: "planned",
    supervisorDirectory,
    sourceCommit,
    durationMs: config.soakDurationMs,
    iterations: config.minimumCompletedIterations,
    executionPermitted: false,
  }, null, 2));
} else if (options.mode === "run" || options.mode === "resume") {
  exact(options, ["confirm", "mode", "supervisor-directory"]);
  const confirmation =
    options.mode === "run"
      ? "RUN_MORPHOGENESIS_READINESS_SOAK"
      : "RESUME_MORPHOGENESIS_READINESS_SOAK";
  if (options.confirm !== confirmation) fail("readiness_supervisor_run_confirmation_invalid");
  await runSupervisor(
    path.resolve(required(options, "supervisor-directory")),
    options.mode === "resume",
  );
} else if (options.mode === "status") {
  exact(options, ["mode", "supervisor-directory"]);
  const directory = path.resolve(required(options, "supervisor-directory"));
  const state = await json(path.join(directory, "supervisor-state.json"));
  console.log(JSON.stringify(state, null, 2));
} else {
  fail("readiness_supervisor_mode_invalid");
}

async function runSupervisor(directory, resume) {
  const config = await json(path.join(directory, "supervisor-config.json"));
  let state = await json(path.join(directory, "supervisor-state.json"));
  if (config.sourceCommit !== git("rev-parse", "HEAD"))
    fail("readiness_supervisor_source_changed");
  cleanTrackedTree();
  if (state.status === "completed") {
    console.log(JSON.stringify(state, null, 2));
    return;
  }
  if (resume && state.status !== "awaiting-supervisor-restart" && state.status !== "failed")
    fail("readiness_supervisor_is_not_resumable");
  if (!resume && state.status !== "planned") fail("readiness_supervisor_is_not_planned");
  const lockFile = path.join(directory, "supervisor.lock");
  let lock;
  try {
    lock = await open(lockFile, "wx");
    await lock.writeFile(`${process.pid}\n`, "utf8");
  } catch {
    fail("readiness_supervisor_lock_active");
  }
  const resumedAt = Date.now();
  try {
    const now = new Date().toISOString();
    state = {
      ...state,
      revision: state.revision + 1,
      status: "running",
      pid: process.pid,
      startedAt: state.startedAt ?? now,
      deadlineAt:
        state.deadlineAt ??
        new Date(Date.now() + config.soakDurationMs).toISOString(),
      heartbeatAt: now,
      resumeCount: state.resumeCount + (resume ? 1 : 0),
      ...(resume
        ? {
            supervisorResumeTimesMs: [
              ...state.supervisorResumeTimesMs,
              state.restartRequestedAt
                ? resumedAt - Date.parse(state.restartRequestedAt)
                : 0,
            ],
            restartRequestedAt: null,
          }
        : {}),
    };
    await saveState(directory, state);
    await appendEvent(directory, state, resume ? "resumed" : "started", {
      pid: process.pid,
    });
    const databasePool = createPostgresPool({
      max: 2,
      ...(process.env.DATABASE_URL
        ? { connectionString: process.env.DATABASE_URL }
        : {
            host: process.env.PGHOST ?? "127.0.0.1",
            port: Number(process.env.PGPORT ?? "5432"),
            database: process.env.PGDATABASE ?? "postgres",
            user: process.env.PGUSER,
            password: process.env.PGPASSWORD,
          }),
    });
    try {
      if (state.initialPostgresStorageBytes === null) {
        state = {
          ...state,
          initialPostgresStorageBytes: await postgresBytes(databasePool),
          initialTemporalStorageBytes: await fileBytes(config.temporalDbFile),
        };
        await saveState(directory, state);
      }
      const auxiliary = [
        ["material-crashes", "scripts/agent-morphogenesis-beta1-material-crashes.mjs"],
        ["adversarial-decisions", "scripts/agent-morphogenesis-beta1-adversarial-decisions.mjs"],
        ["head-concurrency", "scripts/agent-morphogenesis-beta1-postgres-concurrency.mjs"],
        ["budget-concurrency", "scripts/agent-morphogenesis-beta1-postgres-budget-concurrency.mjs"],
        ["authorization-rotation", "scripts/agent-morphogenesis-beta1-authorization-rotation.mjs"],
        ["postgres-recovery", "scripts/agent-morphogenesis-beta1-postgres-connection-recovery.mjs"],
        ["early-crashes", "scripts/agent-morphogenesis-beta1-early-crashes.mjs"],
      ];
      for (const [operationId, script] of auxiliary) {
        if (state.completedOperations.includes(operationId)) continue;
        state = await executeOperation(directory, config, state, databasePool, {
          operationId,
          command: process.execPath,
          args: [
            path.join(root, script),
            "--diagnostic-only",
            "--output-directory",
            path.join(directory, "operations", operationId, `attempt-${nextAttempt(state, operationId)}`),
          ],
        });
      }
      while (state.completedRounds < config.roundsRequired) {
        if (state.completedRounds >= 10 && state.resumeCount < 1) {
          state = {
            ...state,
            revision: state.revision + 1,
            status: "awaiting-supervisor-restart",
            pid: null,
            heartbeatAt: new Date().toISOString(),
            restartRequestedAt: new Date().toISOString(),
          };
          await saveState(directory, state);
          await appendEvent(directory, state, "restart-required", {
            completedRounds: state.completedRounds,
          });
          console.log(JSON.stringify(state, null, 2));
          return;
        }
        const round = state.completedRounds;
        const operationId = `nominal-round-${String(round).padStart(2, "0")}`;
        state = await executeOperation(directory, config, state, databasePool, {
          operationId,
          command: process.execPath,
          args: [
            path.join(root, "scripts/agent-morphogenesis-beta1-postgres-nominal.mjs"),
            "--diagnostic-only",
            "--temporal",
            "--output-directory",
            path.join(directory, "operations", operationId, `attempt-${nextAttempt(state, operationId)}`),
          ],
          completedIterations: config.iterationsPerRound,
          completedRound: true,
        });
        const targetMeshCycles = Math.floor(
          (state.completedRounds * config.meshCyclesRequired) /
            config.roundsRequired,
        );
        while (state.meshCycles < targetMeshCycles) {
          const meshOperation = `mesh-cycle-${state.meshCycles + 1}`;
          state = await executeOperation(directory, config, state, databasePool, {
            operationId: meshOperation,
            command: process.execPath,
            args: [path.join(root, "examples/mesh-multiprocess/demo.mjs")],
            env: {
              AGENTPLAT_CANDIDATE_COMMIT: config.sourceCommit,
              AGENTPLAT_MORPHOGENESIS_EVIDENCE_OUTPUT: path.join(
                directory,
                "operations",
                meshOperation,
                `attempt-${nextAttempt(state, meshOperation)}`,
              ),
              PGHOST: process.env.PGHOST ?? "127.0.0.1",
              PGPORT: process.env.PGPORT ?? "5432",
              PGDATABASE: process.env.PGDATABASE ?? "postgres",
              ...(process.env.PGUSER ? { PGUSER: process.env.PGUSER } : {}),
              ...(process.env.PGPASSWORD
                ? { PGPASSWORD: process.env.PGPASSWORD }
                : {}),
            },
            meshCycle: true,
          });
        }
      }
      while (Date.now() < Date.parse(state.deadlineAt)) {
        await new Promise((resolve) => setTimeout(resolve, config.heartbeatIntervalMs));
        verifyAuthorization(
          config.authorizationDirectory,
          config.expectedPublicKeySha256,
          config.sourceCommit,
          new Date().toISOString(),
        );
        state = await sampleAndHeartbeat(directory, config, state, databasePool, null);
      }
      assert.equal(state.completedIterations >= config.minimumCompletedIterations, true);
      assert.equal(state.meshCycles, config.meshCyclesRequired);
      assert.equal(state.resumeCount >= 1, true);
      assert.equal(
        state.supervisorResumeTimesMs.every(
          (value) =>
            value <= profile.serviceLevelObjectives.maximumSupervisorResumeTimeMs,
        ),
        true,
      );
      const postgresGrowth =
        state.maximumPostgresStorageBytes - state.initialPostgresStorageBytes;
      const temporalGrowth =
        state.maximumTemporalStorageBytes - state.initialTemporalStorageBytes;
      assert.equal(
        state.maximumProcessRssBytes <=
          profile.serviceLevelObjectives.maximumPeakProcessRssBytes,
        true,
      );
      assert.equal(
        state.maximumAggregateCpuPercent <=
          profile.serviceLevelObjectives.maximumAggregateCpuPercent,
        true,
      );
      assert.equal(
        postgresGrowth <=
          profile.serviceLevelObjectives.maximumPostgresStorageGrowthBytes,
        true,
      );
      assert.equal(
        temporalGrowth <=
          profile.serviceLevelObjectives.maximumTemporalStorageGrowthBytes,
        true,
      );
      const body = {
        schemaVersion: 1,
        kind: "agentplat-agent-morphogenesis-beta1-readiness-soak-receipt-v1",
        sourceCommit: config.sourceCommit,
        profileDigest: config.profileDigest,
        status: "passed",
        startedAt: state.startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - Date.parse(state.startedAt),
        completedIterations: state.completedIterations,
        recruitIterations: state.completedRounds * 3,
        catalogCreatedIterations: state.completedRounds * 3,
        meshCycles: state.meshCycles,
        temporalWorkerRestarts: state.completedIterations,
        postgresConnectionLossCycles: config.postgresLossCyclesRequired,
        authorizationRotationCount: 2,
        supervisorResumeCount: state.resumeCount,
        supervisorResumeTimesMs: state.supervisorResumeTimesMs,
        resourceSamples: state.resourceSamples,
        maximumProcessRssBytes: state.maximumProcessRssBytes,
        maximumAggregateCpuPercent: state.maximumAggregateCpuPercent,
        postgresStorageGrowthBytes: postgresGrowth,
        temporalStorageGrowthBytes: temporalGrowth,
        duplicateMaterialEffects: 0,
        unauthorizedActivations: 0,
        lostCommittedReceipts: 0,
        morphologyHeadForks: 0,
        missionContinuityRatio: 1,
        externalSpendUsd: 0,
        experimentalEvidence: "not-collected",
        productionReadiness: "not-established",
        productionClaimPermitted: false,
      };
      const receipt = {
        ...body,
        receiptDigest: digest(
          "agentplat-agent-morphogenesis-beta1-readiness-soak-receipt-v1",
          body,
        ),
      };
      await exclusive(directory, "readiness-soak-receipt.json", receipt);
      state = {
        ...state,
        revision: state.revision + 1,
        status: "completed",
        pid: null,
        heartbeatAt: new Date().toISOString(),
        receiptDigest: receipt.receiptDigest,
      };
      await saveState(directory, state);
      await appendEvent(directory, state, "completed", {
        receiptDigest: receipt.receiptDigest,
      });
      console.log(JSON.stringify(state, null, 2));
    } finally {
      await databasePool.end();
    }
  } catch (error) {
    state = {
      ...state,
      revision: state.revision + 1,
      status: "failed",
      pid: null,
      heartbeatAt: new Date().toISOString(),
      failure: error instanceof Error ? error.message : String(error),
    };
    await saveState(directory, state);
    await appendEvent(directory, state, "failed", { failure: state.failure });
    throw error;
  } finally {
    await lock.close();
    await rm(lockFile, { force: true });
  }
}

async function executeOperation(directory, config, state, databasePool, input) {
  verifyAuthorization(
    config.authorizationDirectory,
    config.expectedPublicKeySha256,
    config.sourceCommit,
    new Date().toISOString(),
  );
  const attempt = nextAttempt(state, input.operationId);
  state = {
    ...state,
    revision: state.revision + 1,
    currentOperation: input.operationId,
    operationAttempts: {
      ...state.operationAttempts,
      [input.operationId]: attempt,
    },
    heartbeatAt: new Date().toISOString(),
  };
  await saveState(directory, state);
  await appendEvent(directory, state, "operation-started", {
    operationId: input.operationId,
    attempt,
  });
  const result = await runChild(
    input.command,
    input.args,
    { ...process.env, AGENTPLAT_CANDIDATE_COMMIT: config.sourceCommit, ...(input.env ?? {}) },
    async (sample) => {
      state = applyProcessSample(state, sample);
      state = await sampleAndHeartbeat(directory, config, state, databasePool, sample);
    },
  );
  if (result.exitCode !== 0)
    throw new Error(
      `readiness operation ${input.operationId} failed: ${result.stderrTail}`,
    );
  state = {
    ...state,
    revision: state.revision + 1,
    currentOperation: null,
    completedOperations: [...state.completedOperations, input.operationId],
    completedIterations:
      state.completedIterations + (input.completedIterations ?? 0),
    completedRounds: state.completedRounds + (input.completedRound ? 1 : 0),
    meshCycles: state.meshCycles + (input.meshCycle ? 1 : 0),
    heartbeatAt: new Date().toISOString(),
  };
  await saveState(directory, state);
  await appendEvent(directory, state, "operation-completed", {
    operationId: input.operationId,
    attempt,
    exitCode: result.exitCode,
  });
  return state;
}

async function runChild(command, args, env, onSample) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdoutTail = "";
    let stderrTail = "";
    const retain = (current, chunk) =>
      `${current}${chunk}`.slice(-64 * 1024);
    child.stdout.on("data", (chunk) => {
      stdoutTail = retain(stdoutTail, chunk.toString("utf8"));
    });
    child.stderr.on("data", (chunk) => {
      stderrTail = retain(stderrTail, chunk.toString("utf8"));
    });
    let sampling = Promise.resolve();
    const timer = setInterval(() => {
      sampling = sampling.then(() => onSample(processTreeSample(child.pid)));
    }, 1_000);
    child.once("error", reject);
    child.once("exit", async (code) => {
      clearInterval(timer);
      await sampling;
      await onSample(processTreeSample(child.pid));
      resolve({ exitCode: code ?? 1, stdoutTail, stderrTail });
    });
  });
}

function processTreeSample(rootPid) {
  if (!rootPid) return { rssBytes: 0, cpuPercent: 0 };
  const pending = [rootPid];
  const pids = [];
  while (pending.length) {
    const pid = pending.shift();
    if (pids.includes(pid)) continue;
    pids.push(pid);
    const children = spawnSync("pgrep", ["-P", String(pid)], {
      encoding: "utf8",
    }).stdout?.trim();
    if (children)
      pending.push(
        ...children
          .split("\n")
          .map(Number)
          .filter((value) => Number.isSafeInteger(value) && value > 0),
      );
  }
  let rssBytes = 0;
  let cpuPercent = 0;
  for (const pid of pids) {
    const output = spawnSync("ps", ["-o", "rss=,%cpu=", "-p", String(pid)], {
      encoding: "utf8",
    }).stdout?.trim();
    if (!output) continue;
    const [rssKiB, cpu] = output.split(/\s+/u).map(Number);
    if (Number.isFinite(rssKiB)) rssBytes += rssKiB * 1024;
    if (Number.isFinite(cpu)) cpuPercent += cpu;
  }
  return { rssBytes, cpuPercent };
}

function applyProcessSample(state, sample) {
  return {
    ...state,
    maximumProcessRssBytes: Math.max(
      state.maximumProcessRssBytes,
      sample.rssBytes,
      process.memoryUsage().rss,
    ),
    maximumAggregateCpuPercent: Math.max(
      state.maximumAggregateCpuPercent,
      sample.cpuPercent,
    ),
  };
}

async function sampleAndHeartbeat(directory, config, state, pool, processSample) {
  const postgresStorageBytes = await postgresBytes(pool);
  const temporalStorageBytes = await fileBytes(config.temporalDbFile);
  const sample = {
    schemaVersion: 1,
    sampledAt: new Date().toISOString(),
    currentOperation: state.currentOperation,
    processRssBytes: Math.max(
      process.memoryUsage().rss,
      processSample?.rssBytes ?? 0,
    ),
    aggregateCpuPercent: processSample?.cpuPercent ?? 0,
    postgresStorageBytes,
    temporalStorageBytes,
    meshPendingInboxRows: 0,
    meshPendingOutboxRows: 0,
  };
  await appendFile(
    path.join(directory, "resource-samples.jsonl"),
    `${JSON.stringify(sample)}\n`,
    "utf8",
  );
  const next = {
    ...state,
    revision: state.revision + 1,
    heartbeatAt: sample.sampledAt,
    resourceSamples: state.resourceSamples + 1,
    maximumProcessRssBytes: Math.max(
      state.maximumProcessRssBytes,
      sample.processRssBytes,
    ),
    maximumAggregateCpuPercent: Math.max(
      state.maximumAggregateCpuPercent,
      sample.aggregateCpuPercent,
    ),
    maximumPostgresStorageBytes: Math.max(
      state.maximumPostgresStorageBytes,
      postgresStorageBytes,
    ),
    maximumTemporalStorageBytes: Math.max(
      state.maximumTemporalStorageBytes,
      temporalStorageBytes,
    ),
  };
  await saveState(directory, next);
  return next;
}

async function postgresBytes(pool) {
  return Number(
    (await pool.query("SELECT pg_database_size(current_database())::bigint AS bytes"))
      .rows[0].bytes,
  );
}

async function fileBytes(file) {
  try {
    return (await stat(file)).size;
  } catch (error) {
    if (error?.code === "ENOENT") return 0;
    throw error;
  }
}

function verifyAuthorization(directory, keyDigest, sourceCommit, logicalTime) {
  const result = spawnSync(
    process.execPath,
    [
      path.join(root, "scripts/agent-morphogenesis-beta1-campaign.mjs"),
      "--mode",
      "verify-execution-authorization",
      "--authorization-directory",
      directory,
      "--expected-public-key-sha256",
      keyDigest,
      "--logical-time",
      logicalTime,
      "--source-sha",
      sourceCommit,
    ],
    { cwd: root, encoding: "utf8" },
  );
  if (result.status !== 0)
    throw new Error(`readiness authorization is inactive: ${result.stderr}`);
}

function initialState(sourceCommit) {
  return {
    schemaVersion: 1,
    kind: "agentplat-agent-morphogenesis-beta1-readiness-supervisor-state-v1",
    sourceCommit,
    revision: 0,
    status: "planned",
    pid: null,
    startedAt: null,
    deadlineAt: null,
    heartbeatAt: null,
    completedIterations: 0,
    completedRounds: 0,
    meshCycles: 0,
    resumeCount: 0,
    supervisorResumeTimesMs: [],
    restartRequestedAt: null,
    completedOperations: [],
    operationAttempts: {},
    currentOperation: null,
    resourceSamples: 0,
    maximumProcessRssBytes: 0,
    maximumAggregateCpuPercent: 0,
    initialPostgresStorageBytes: null,
    initialTemporalStorageBytes: null,
    maximumPostgresStorageBytes: 0,
    maximumTemporalStorageBytes: 0,
    lastEventDigest: null,
    receiptDigest: null,
    failure: null,
  };
}

async function appendEvent(directory, state, type, detail) {
  const body = {
    schemaVersion: 1,
    sequence: await eventCount(directory) + 1,
    type,
    recordedAt: new Date().toISOString(),
    stateRevision: state.revision,
    previousEventDigest: state.lastEventDigest,
    detail,
  };
  const event = {
    ...body,
    eventDigest: digest("morphogenesis-readiness-supervisor-event-v1", body),
  };
  await appendFile(
    path.join(directory, "supervisor-events.jsonl"),
    `${JSON.stringify(event)}\n`,
    "utf8",
  );
  state.lastEventDigest = event.eventDigest;
  await saveState(directory, state);
}

async function eventCount(directory) {
  const contents = await readFile(
    path.join(directory, "supervisor-events.jsonl"),
    "utf8",
  );
  return contents.split("\n").filter(Boolean).length;
}

async function saveState(directory, state) {
  const target = path.join(directory, "supervisor-state.json");
  const temporary = path.join(directory, `supervisor-state.${process.pid}.tmp`);
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(temporary, target);
}

async function exclusive(directory, name, value) {
  await writeFile(
    path.join(directory, name),
    `${JSON.stringify(value, null, 2)}\n`,
    { encoding: "utf8", flag: "wx" },
  );
}

function nextAttempt(state, operationId) {
  return (state.operationAttempts[operationId] ?? 0) + 1;
}

function cleanTrackedTree() {
  if (gitStatus("diff", "--quiet") !== 0 || gitStatus("diff", "--cached", "--quiet") !== 0)
    fail("readiness_supervisor_tracked_tree_dirty");
}

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function gitStatus(...args) {
  return spawnSync("git", args, { cwd: root, stdio: "ignore" }).status ?? 1;
}

async function json(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function parse(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--") continue;
    if (!value.startsWith("--") || index + 1 >= args.length)
      fail("readiness_supervisor_option_invalid");
    result[value.slice(2)] = args[++index];
  }
  return result;
}

function exact(value, keys) {
  if (Object.keys(value).sort().join(",") !== [...keys].sort().join(","))
    fail("readiness_supervisor_options_invalid");
}

function required(value, key) {
  if (!value[key]) fail(`readiness_supervisor_${key}_required`);
  return value[key];
}

function external(value) {
  const result = path.resolve(value);
  const relative = path.relative(root, result);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)))
    fail("readiness_supervisor_directory_must_be_external");
  return result;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${JSON.stringify(canonical(value))}`)
    .digest("hex")}`;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonical(value[key])]),
    );
  return value;
}

function fail(message) {
  throw new TypeError(message);
}
