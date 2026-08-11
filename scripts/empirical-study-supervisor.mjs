#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = fileURLToPath(import.meta.url);
const campaignScript = path.join(root, "scripts/empirical-study-campaign.mjs");
const CONFIG_FILE = "supervisor-config.json";
const CONTROL_FILE = "supervisor-control.json";
const STATE_FILE = "supervisor-state.json";
const EVENTS_FILE = "supervisor-events.jsonl";
const LOCK_FILE = "supervisor.lock";
const STDOUT_FILE = "supervisor.stdout.log";
const STDERR_FILE = "supervisor.stderr.log";
const REPORT_FILE = "execution-report.md";
const FINAL_REPORT_FILE = "execution-report-final.md";
const START_CONFIRMATION = "START_DURABLE_LOCAL_CAMPAIGN";
const PAUSE_CONFIRMATION = "PAUSE_DURABLE_LOCAL_CAMPAIGN";
const RESUME_CONFIRMATION = "RESUME_DURABLE_LOCAL_CAMPAIGN";
const STOP_CONFIRMATION = "STOP_DURABLE_LOCAL_CAMPAIGN";
const SHARD_CONFIRMATION = "RUN_LOCAL_REGISTERED_SHARD";
const MAX_TEXT_BYTES = 16 * 1024 * 1024;
const MAX_CHILD_OUTPUT_BYTES = 1024 * 1024;
const PAUSE_POLL_MS = 5_000;

const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(scriptPath);

if (isMain) {
  let options = Object.create(null);
  try {
    options = parseOptions(process.argv.slice(2));
    if (options.mode === "start") await startSupervisor(options);
    else if (options.mode === "run") await runSupervisor(options);
    else if (options.mode === "status") await showStatus(options);
    else if (options.mode === "pause")
      await updateDesiredState(options, "paused", PAUSE_CONFIRMATION);
    else if (options.mode === "resume")
      await resumeSupervisor(options, RESUME_CONFIRMATION);
    else if (options.mode === "stop")
      await updateDesiredState(options, "stopped", STOP_CONFIRMATION);
    else if (options.mode === "report") await writeExecutionReport(options);
    else if (options.mode === "contract-smoke") contractSmoke(options);
    else fail("empirical_supervisor_mode_invalid");
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        status: "rejected",
        reasonCode: publicFailureReason(error),
      })}\n`,
    );
    process.exitCode = 2;
  }
}

async function startSupervisor(options) {
  exactOptions(options, [
    "authorization-directory",
    "campaign-id",
    "confirm",
    "heartbeat-seconds",
    "mode",
    "output-directory",
    "registration-directory",
    "shard-indices",
    "source-sha",
    "store-directory",
    "supervisor-directory",
    "worker-id-prefix",
  ]);
  if (options.confirm !== START_CONFIRMATION)
    fail("empirical_supervisor_start_confirmation_required");
  const supervisorDirectory = externalDirectoryOption(
    options,
    "supervisor-directory",
  );
  const body = {
    schemaVersion: 1,
    kind: "agentplat-local-empirical-supervisor-config-v1",
    supervisorId: `supervisor:${tokenOption(options, "campaign-id")}`,
    campaignId: tokenOption(options, "campaign-id"),
    sourceCommit: commitOption(options, "source-sha"),
    registrationDirectory: externalDirectoryOption(
      options,
      "registration-directory",
    ),
    authorizationDirectory: externalDirectoryOption(
      options,
      "authorization-directory",
    ),
    outputDirectory: externalDirectoryOption(options, "output-directory"),
    storeDirectory: externalDirectoryOption(options, "store-directory"),
    shardIndices: shardListOption(options, "shard-indices"),
    workerIdPrefix: tokenOption(options, "worker-id-prefix"),
    heartbeatIntervalMs:
      positiveIntegerOption(options, "heartbeat-seconds", 5, 300) * 1_000,
    executionPolicy: "strictly_sequential_stop_on_failure",
    evidencePolicy: "immutable_shard_receipts_and_hash_chained_events",
    hostSleepPolicy: "prevent_on_darwin_best_effort",
  };
  const config = {
    ...body,
    configDigest: digest("empirical-supervisor-config-v1", body),
  };
  await mkdir(supervisorDirectory, { recursive: true, mode: 0o700 });
  await chmod(supervisorDirectory, 0o700);
  await writeJsonImmutable(path.join(supervisorDirectory, CONFIG_FILE), config);
  const campaign = await readCampaignStatus(config);
  if (
    config.shardIndices.some(
      (shardIndex) => !campaign.authorizedShards.includes(shardIndex),
    )
  )
    fail("empirical_supervisor_shard_scope_not_authorized");
  const controlPath = path.join(supervisorDirectory, CONTROL_FILE);
  const control = await readJsonIfPresent(controlPath);
  if (control === null) {
    await writeJsonAtomic(controlPath, {
      schemaVersion: 1,
      kind: "agentplat-local-empirical-supervisor-control-v1",
      configDigest: config.configDigest,
      desiredState: "running",
      revision: 1,
      requestedAt: new Date().toISOString(),
    });
  } else {
    validateControl(control, config);
    await writeJsonAtomic(controlPath, {
      ...control,
      desiredState: "running",
      revision: control.revision + 1,
      requestedAt: new Date().toISOString(),
    });
  }
  const active = await activeSupervisor(supervisorDirectory);
  if (active !== null) {
    status({
      status: "already_running",
      pid: active.pid,
      supervisorDirectory,
      configDigest: config.configDigest,
    });
    return;
  }
  const child = await spawnDetachedWorker(supervisorDirectory);
  const started = await waitForActiveSupervisor(
    supervisorDirectory,
    child.pid,
    5_000,
  );
  if (started === null) fail("empirical_supervisor_worker_start_failed");
  status({
    status: "started",
    pid: started.pid,
    supervisorDirectory,
    configDigest: config.configDigest,
    executionPolicy: config.executionPolicy,
  });
}

async function resumeSupervisor(options, confirmation) {
  await updateDesiredState(options, "running", confirmation, false);
  const supervisorDirectory = externalDirectoryOption(
    options,
    "supervisor-directory",
  );
  const active = await activeSupervisor(supervisorDirectory);
  if (active !== null) {
    status({ status: "resume_requested", pid: active.pid });
    return;
  }
  const child = await spawnDetachedWorker(supervisorDirectory);
  const started = await waitForActiveSupervisor(
    supervisorDirectory,
    child.pid,
    5_000,
  );
  if (started === null) fail("empirical_supervisor_worker_start_failed");
  status({ status: "resumed", pid: started.pid, supervisorDirectory });
}

async function updateDesiredState(
  options,
  desiredState,
  confirmation,
  emitStatus = true,
) {
  exactOptions(options, ["confirm", "mode", "supervisor-directory"]);
  if (options.confirm !== confirmation)
    fail(`empirical_supervisor_${desiredState}_confirmation_required`);
  const supervisorDirectory = externalDirectoryOption(
    options,
    "supervisor-directory",
  );
  const config = await loadConfig(supervisorDirectory);
  const controlPath = path.join(supervisorDirectory, CONTROL_FILE);
  const control = await readJsonBounded(controlPath);
  validateControl(control, config);
  const next = {
    ...control,
    desiredState,
    revision: control.revision + 1,
    requestedAt: new Date().toISOString(),
  };
  await writeJsonAtomic(controlPath, next);
  if (emitStatus)
    status({
      status: `${desiredState}_requested`,
      desiredState,
      revision: next.revision,
      takesEffect: "at_or_before_next_shard_boundary",
    });
}

async function spawnDetachedWorker(supervisorDirectory) {
  const stdout = await open(
    path.join(supervisorDirectory, STDOUT_FILE),
    "a",
    0o600,
  );
  const stderr = await open(
    path.join(supervisorDirectory, STDERR_FILE),
    "a",
    0o600,
  );
  try {
    const child = spawn(
      process.execPath,
      [
        scriptPath,
        "--mode",
        "run",
        "--supervisor-directory",
        supervisorDirectory,
      ],
      {
        cwd: root,
        detached: true,
        stdio: ["ignore", stdout.fd, stderr.fd],
      },
    );
    child.unref();
    return child;
  } finally {
    await stdout.close();
    await stderr.close();
  }
}

async function runSupervisor(options) {
  exactOptions(options, ["mode", "supervisor-directory"]);
  const supervisorDirectory = externalDirectoryOption(
    options,
    "supervisor-directory",
  );
  const config = await loadConfig(supervisorDirectory);
  const lock = await acquireLock(supervisorDirectory);
  let state = await loadState(supervisorDirectory, config);
  const chain = await validateEventChainFile(
    path.join(supervisorDirectory, EVENTS_FILE),
    config.configDigest,
  );
  assertStateEventAnchorV1(state, chain);
  let sequence = chain.length;
  let previousEventDigest =
    chain.length === 0 ? null : chain.at(-1).eventDigest;
  let stateWrite = Promise.resolve();
  let stateWriteFailure = null;
  let shutdownRequested = false;
  let keepAwake = null;

  const queueState = (patch) => {
    state = {
      ...state,
      ...patch,
      schemaVersion: 1,
      kind: "agentplat-local-empirical-supervisor-state-v1",
      configDigest: config.configDigest,
      pid: process.pid,
      updatedAt: new Date().toISOString(),
      lastEventDigest: previousEventDigest,
    };
    stateWrite = stateWrite
      .then(() =>
        writeJsonAtomic(path.join(supervisorDirectory, STATE_FILE), state),
      )
      .catch((error) => {
        stateWriteFailure = error;
        throw error;
      });
    return stateWrite;
  };

  const recordEvent = async (eventType, value) => {
    const event = createSupervisorEventV1({
      configDigest: config.configDigest,
      sequence,
      previousEventDigest,
      eventType,
      recordedAt: new Date().toISOString(),
      value,
    });
    await appendTextDurable(
      path.join(supervisorDirectory, EVENTS_FILE),
      `${JSON.stringify(event)}\n`,
    );
    sequence += 1;
    previousEventDigest = event.eventDigest;
    return event;
  };

  const requestShutdown = () => {
    shutdownRequested = true;
  };
  process.once("SIGINT", requestShutdown);
  process.once("SIGTERM", requestShutdown);

  const heartbeat = setInterval(() => {
    void queueState({ heartbeatAt: new Date().toISOString() }).catch(
      () => undefined,
    );
  }, config.heartbeatIntervalMs);

  try {
    keepAwake = startKeepAwakeAdapter();
    await recordEvent("supervisor_started", {
      pid: process.pid,
      recovered: chain.length > 0,
      environment: publicEnvironment(),
      keepAwakeAdapter:
        keepAwake === null
          ? "unavailable_or_not_required"
          : "darwin_caffeinate",
    });
    await queueState({
      observedState: "running",
      heartbeatAt: new Date().toISOString(),
      currentShard: null,
      failureReason: null,
    });
    await generateReport(supervisorDirectory, config);

    while (true) {
      if (stateWriteFailure !== null) throw stateWriteFailure;
      const control = await readJsonBounded(
        path.join(supervisorDirectory, CONTROL_FILE),
      );
      validateControl(control, config);
      if (control.revision < (state.lastControlRevision ?? 0))
        fail("empirical_supervisor_control_rollback_detected");
      if (shutdownRequested || control.desiredState === "stopped") {
        await recordEvent("supervisor_stopped", {
          reason: shutdownRequested ? "process_signal" : "operator_request",
          controlRevision: control.revision,
        });
        await queueState({
          observedState: "stopped",
          currentShard: null,
          lastControlRevision: control.revision,
        });
        break;
      }
      if (control.desiredState === "paused") {
        if (state.observedState !== "paused") {
          await recordEvent("supervisor_paused", {
            controlRevision: control.revision,
          });
          await queueState({
            observedState: "paused",
            currentShard: null,
            lastControlRevision: control.revision,
          });
          await generateReport(supervisorDirectory, config);
        }
        await delay(PAUSE_POLL_MS);
        continue;
      }
      if (state.observedState === "paused") {
        await recordEvent("supervisor_resumed", {
          controlRevision: control.revision,
        });
        await queueState({
          observedState: "running",
          lastControlRevision: control.revision,
        });
      }
      const campaign = await readCampaignStatus(config);
      const completed = new Set(campaign.completedShards);
      const nextShard = config.shardIndices.find(
        (value) => !completed.has(value),
      );
      if (nextShard === undefined) {
        await recordEvent("campaign_completed", {
          completedShards: campaign.completedShards,
          completedProjectionCount: campaign.completedProjectionCount,
        });
        await queueState({
          observedState: "completed",
          currentShard: null,
          completedShards: campaign.completedShards,
          completedProjectionCount: campaign.completedProjectionCount,
        });
        await generateReport(supervisorDirectory, config, campaign);
        break;
      }

      const before = await operationalSample(config.storeDirectory);
      await recordEvent("shard_started", {
        shardIndex: nextShard,
        workerId: `${config.workerIdPrefix}-${String(nextShard).padStart(2, "0")}`,
        operationalSample: before,
      });
      await queueState({
        observedState: "running",
        currentShard: nextShard,
        lastControlRevision: control.revision,
        completedShards: campaign.completedShards,
        completedProjectionCount: campaign.completedProjectionCount,
      });
      const startedAtMs = Date.now();
      const result = await executeShard(config, nextShard);
      const after = await operationalSample(config.storeDirectory);
      const elapsedMs = Date.now() - startedAtMs;
      if (result.exitCode !== 0 || result.status?.status !== "completed") {
        const reasonCode =
          result.failure?.reasonCode ?? "empirical_supervisor_shard_failed";
        await recordEvent("shard_failed", {
          shardIndex: nextShard,
          elapsedMs,
          exitCode: result.exitCode,
          signal: result.signal,
          reasonCode,
          stderrDigest: digest("empirical-supervisor-stderr-v1", result.stderr),
          operationalSample: after,
        });
        await queueState({
          observedState: "failed",
          currentShard: nextShard,
          failureReason: reasonCode,
        });
        await generateReport(supervisorDirectory, config);
        process.exitCode = 1;
        break;
      }
      await recordEvent("shard_completed", {
        shardIndex: nextShard,
        elapsedMs,
        executedSlotCount: result.status.executedSlotCount,
        resumedSlotCount: result.status.resumedSlotCount,
        projectionCount: result.status.projectionCount,
        receiptDigest: result.status.receiptDigest,
        peakResidentSetBytes: result.peakResidentSetBytes,
        storeBytesBefore: before.storeBytes,
        storeBytesAfter: after.storeBytes,
        operationalSample: after,
      });
      const refreshed = await readCampaignStatus(config);
      await queueState({
        observedState: "running",
        currentShard: null,
        failureReason: null,
        completedShards: refreshed.completedShards,
        completedProjectionCount: refreshed.completedProjectionCount,
      });
      await generateReport(supervisorDirectory, config, refreshed);
    }
  } catch (error) {
    const reasonCode = publicFailureReason(error);
    try {
      await recordEvent("supervisor_failed", { reasonCode });
      await queueState({
        observedState: "failed",
        currentShard: state.currentShard ?? null,
        failureReason: reasonCode,
      });
      await generateReport(supervisorDirectory, config);
    } catch {
      // The original failure remains authoritative when reporting also fails.
    }
    process.exitCode = 1;
  } finally {
    clearInterval(heartbeat);
    if (keepAwake !== null) keepAwake.kill("SIGTERM");
    await stateWrite.catch(() => undefined);
    await lock.release();
  }
}

async function executeShard(config, shardIndex) {
  const workerId = `${config.workerIdPrefix}-${String(shardIndex).padStart(2, "0")}`;
  const args = [
    campaignScript,
    "--mode",
    "execute-shard",
    "--campaign-id",
    config.campaignId,
    "--source-sha",
    config.sourceCommit,
    "--registration-directory",
    config.registrationDirectory,
    "--authorization-directory",
    config.authorizationDirectory,
    "--output-directory",
    config.outputDirectory,
    "--store-directory",
    config.storeDirectory,
    "--shard-index",
    String(shardIndex),
    "--worker-id",
    workerId,
    "--confirm",
    SHARD_CONFIRMATION,
  ];
  const child = spawn(process.execPath, args, {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let peakResidentSetBytes = null;
  let sampling = Promise.resolve();
  const sampleResidentSet = () => {
    sampling = sampling.then(async () => {
      const value = await childResidentSetBytes(child.pid);
      if (value !== null)
        peakResidentSetBytes = Math.max(peakResidentSetBytes ?? 0, value);
    });
    return sampling;
  };
  await sampleResidentSet();
  const memorySampler = setInterval(() => {
    void sampleResidentSet().catch(() => undefined);
  }, config.heartbeatIntervalMs);
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout = boundedAppend(stdout, chunk);
  });
  child.stderr.on("data", (chunk) => {
    stderr = boundedAppend(stderr, chunk);
  });
  let completion;
  try {
    completion = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (exitCode, signal) => resolve({ exitCode, signal }));
    });
  } finally {
    clearInterval(memorySampler);
    await sampleResidentSet().catch(() => undefined);
    await sampling.catch(() => undefined);
  }
  return {
    ...completion,
    peakResidentSetBytes,
    stdout,
    stderr,
    status: lastJsonLine(stdout),
    failure: lastJsonLine(stderr),
  };
}

async function showStatus(options) {
  exactOptions(options, ["mode", "supervisor-directory"]);
  const supervisorDirectory = externalDirectoryOption(
    options,
    "supervisor-directory",
  );
  const config = await loadConfig(supervisorDirectory);
  const control = await readJsonBounded(
    path.join(supervisorDirectory, CONTROL_FILE),
  );
  validateControl(control, config);
  const state = await loadState(supervisorDirectory, config);
  const events = await validateEventChainFile(
    path.join(supervisorDirectory, EVENTS_FILE),
    config.configDigest,
  );
  assertStateEventAnchorV1(state, events);
  const active = await activeSupervisor(supervisorDirectory);
  const campaign = await readCampaignStatus(config);
  status({
    status: campaign.status,
    processActive: active !== null,
    pid: active?.pid ?? null,
    desiredState: control.desiredState,
    observedState: state.observedState,
    heartbeatAt: state.heartbeatAt,
    heartbeatAgeMs:
      typeof state.heartbeatAt === "string"
        ? Math.max(0, Date.now() - Date.parse(state.heartbeatAt))
        : null,
    currentShard: state.currentShard,
    completedShards: campaign.completedShards,
    missingShards: campaign.missingShards,
    completedProjectionCount: campaign.completedProjectionCount,
    failureReason: state.failureReason,
    empiricalClaimPermitted: false,
  });
}

async function writeExecutionReport(options) {
  exactOptions(options, ["mode", "supervisor-directory"]);
  const supervisorDirectory = externalDirectoryOption(
    options,
    "supervisor-directory",
  );
  const config = await loadConfig(supervisorDirectory);
  const campaign = await readCampaignStatus(config);
  const result = await generateReport(supervisorDirectory, config, campaign);
  status(result);
}

async function generateReport(supervisorDirectory, config, suppliedCampaign) {
  const events = await validateEventChainFile(
    path.join(supervisorDirectory, EVENTS_FILE),
    config.configDigest,
  );
  const state = await loadState(supervisorDirectory, config);
  assertStateEventAnchorV1(state, events);
  const campaign = suppliedCampaign ?? (await readCampaignStatus(config));
  const markdown = renderExecutionReportV1({ config, events, campaign });
  const reportPath = path.join(supervisorDirectory, REPORT_FILE);
  await writeTextAtomic(reportPath, markdown);
  let finalReportPath = null;
  if (isTerminalCampaignClosureV1(config, campaign, events)) {
    finalReportPath = path.join(supervisorDirectory, FINAL_REPORT_FILE);
    await writeTextImmutable(finalReportPath, markdown);
  }
  return {
    status:
      campaign.status === "complete"
        ? "final_report_created"
        : "draft_report_created",
    reportPath,
    finalReportPath,
    completedShardCount: campaign.completedShards.length,
    eventCount: events.length,
  };
}

export function isTerminalCampaignClosureV1(config, campaign, events) {
  return (
    campaign.completedShards.length === config.shardIndices.length &&
    config.shardIndices.every(
      (value, index) => campaign.completedShards[index] === value,
    ) &&
    events.some((event) => event.eventType === "campaign_completed")
  );
}

export function renderExecutionReportV1({ config, events, campaign }) {
  const started = events.find(
    (event) => event.eventType === "supervisor_started",
  );
  const completed = events.filter(
    (event) => event.eventType === "shard_completed",
  );
  const incidents = events.filter((event) =>
    ["shard_failed", "supervisor_failed"].includes(event.eventType),
  );
  const recoveries = events.filter(
    (event) =>
      event.eventType === "supervisor_started" &&
      event.value.recovered === true,
  );
  const totalElapsedMs = completed.reduce(
    (sum, event) => sum + event.value.elapsedMs,
    0,
  );
  const environment = started?.value.environment ?? null;
  const rows = completed
    .map(
      (event) =>
        `| ${event.value.shardIndex} | ${formatDuration(event.value.elapsedMs)} | ${event.value.executedSlotCount} | ${event.value.resumedSlotCount} | ${event.value.projectionCount} | ${formatBytes(event.value.peakResidentSetBytes)} | \`${event.value.receiptDigest}\` |`,
    )
    .join("\n");
  const incidentRows = incidents.length
    ? incidents
        .map(
          (event) =>
            `- Event ${event.sequence} (${event.eventType}): \`${event.value.reasonCode}\``,
        )
        .join("\n")
    : "- No supervisor or shard failure has been recorded.";
  return `# Local empirical campaign execution report

Status: ${campaign.status === "complete" ? "final" : "in progress"}. This report records execution provenance and does not, by itself, authorize an empirical claim.

## Registered identity

- Campaign: \`${config.campaignId}\`
- Source commit: \`${config.sourceCommit}\`
- Supervisor configuration: \`${config.configDigest}\`
- Execution policy: \`${config.executionPolicy}\`
- Authorized shard scope: \`${config.shardIndices.join(",")}\`

## Current closure

- Completed shards: ${campaign.completedShards.length}/${config.shardIndices.length}
- Completed projections: ${campaign.completedProjectionCount}
- Missing shards: ${campaign.missingShards.length === 0 ? "none" : campaign.missingShards.join(", ")}
- Recorded shard wall time: ${formatDuration(totalElapsedMs)}
- Empirical claim permitted by this report: no

## Public execution environment

${environment === null ? "Environment not recorded yet." : `- Platform: ${environment.platform} ${environment.release} (${environment.arch})\n- Node.js: ${environment.nodeVersion}\n- CPU: ${environment.cpuModel}\n- Logical CPU count: ${environment.logicalCpuCount}\n- Total memory bytes: ${environment.totalMemoryBytes}`}

Hardware serial numbers, host names, user names, credentials and private paths are intentionally excluded.

## Per-shard record

| Shard | Wall time | Executed slots | Resumed slots | Projections | Peak RSS | Receipt |
| ---: | ---: | ---: | ---: | ---: | ---: | --- |
${rows || "| — | — | — | — | — | — | No completed shard recorded |"}

## Interruptions and deviations

- Supervisor process recoveries: ${recoveries.length}
${incidentRows}

An interrupted shard is not counted until the immutable shard receipt exists. A resumed slot remains visible in the table and is not rewritten as a fresh success.

## Evidence topology

- Hash-chained operational events: ${events.length}
- Last operational event digest: \`${events.at(-1)?.eventDigest ?? "none"}\`
- Immutable scientific evidence remains in the separately configured campaign output and content-addressed store.
- Mutable supervisor state, heartbeat and this draft report are operational metadata, not scientific outcomes.
`;
}

async function readCampaignStatus(config) {
  const args = [
    campaignScript,
    "--mode",
    "status",
    "--campaign-id",
    config.campaignId,
    "--source-sha",
    config.sourceCommit,
    "--registration-directory",
    config.registrationDirectory,
    "--authorization-directory",
    config.authorizationDirectory,
    "--output-directory",
    config.outputDirectory,
  ];
  const result = await spawnCaptured(process.execPath, args);
  const value = lastJsonLine(result.stdout);
  if (result.exitCode !== 0 || value === null)
    fail("empirical_supervisor_campaign_status_failed");
  return value;
}

async function spawnCaptured(command, args) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout = boundedAppend(stdout, chunk);
  });
  child.stderr.on("data", (chunk) => {
    stderr = boundedAppend(stderr, chunk);
  });
  const completion = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (exitCode, signal) => resolve({ exitCode, signal }));
  });
  return { ...completion, stdout, stderr };
}

async function childResidentSetBytes(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return null;
  try {
    if (process.platform === "linux") {
      const value = await readFile(`/proc/${pid}/status`, "utf8");
      const match = /^VmRSS:\s+([0-9]+)\s+kB$/mu.exec(value);
      return match === null ? null : Number(match[1]) * 1_024;
    }
    if (process.platform === "darwin") {
      const result = await spawnCaptured("/bin/ps", [
        "-o",
        "rss=",
        "-p",
        String(pid),
      ]);
      const kibibytes = Number(result.stdout.trim());
      return result.exitCode === 0 && Number.isFinite(kibibytes)
        ? kibibytes * 1_024
        : null;
    }
  } catch {
    return null;
  }
  return null;
}

function startKeepAwakeAdapter() {
  if (process.platform !== "darwin") return null;
  try {
    const child = spawn(
      "/usr/bin/caffeinate",
      ["-dimsu", "-w", String(process.pid)],
      {
        detached: false,
        stdio: "ignore",
      },
    );
    child.once("error", () => undefined);
    return child;
  } catch {
    return null;
  }
}

async function acquireLock(supervisorDirectory) {
  const lockPath = path.join(supervisorDirectory, LOCK_FILE);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(lockPath, "wx", 0o600);
      try {
        await handle.writeFile(
          `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`,
        );
        await handle.sync();
      } catch (error) {
        await rm(lockPath, { force: true });
        throw error;
      } finally {
        await handle.close();
      }
      return {
        async release() {
          const current = await readJsonIfPresent(lockPath);
          if (current?.pid === process.pid) await rm(lockPath, { force: true });
        },
      };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const existing = await readJsonIfPresent(lockPath);
      if (existing !== null && processIsAlive(existing.pid))
        fail("empirical_supervisor_already_running");
      await rm(lockPath, { force: true });
    }
  }
  fail("empirical_supervisor_lock_unavailable");
}

async function activeSupervisor(supervisorDirectory) {
  const lock = await readJsonIfPresent(
    path.join(supervisorDirectory, LOCK_FILE),
  );
  return lock !== null && processIsAlive(lock.pid) ? lock : null;
}

async function waitForActiveSupervisor(
  supervisorDirectory,
  expectedPid,
  maximumWaitMs,
) {
  const deadline = Date.now() + maximumWaitMs;
  while (Date.now() < deadline) {
    const active = await activeSupervisor(supervisorDirectory);
    if (
      active !== null &&
      (expectedPid === undefined || active.pid === expectedPid)
    )
      return active;
    if (!processIsAlive(expectedPid)) return null;
    await delay(100);
  }
  return null;
}

function processIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

async function loadConfig(supervisorDirectory) {
  const config = await readJsonBounded(
    path.join(supervisorDirectory, CONFIG_FILE),
  );
  const { configDigest, ...body } = config;
  if (
    config.schemaVersion !== 1 ||
    config.kind !== "agentplat-local-empirical-supervisor-config-v1" ||
    configDigest !== digest("empirical-supervisor-config-v1", body) ||
    typeof config.supervisorId !== "string" ||
    !validToken(config.campaignId) ||
    config.supervisorId !== `supervisor:${config.campaignId}` ||
    !/^[0-9a-f]{40}$/u.test(config.sourceCommit) ||
    ![
      config.registrationDirectory,
      config.authorizationDirectory,
      config.outputDirectory,
      config.storeDirectory,
    ].every(validExternalDirectory) ||
    !Array.isArray(config.shardIndices) ||
    config.shardIndices.length < 1 ||
    config.shardIndices.some(
      (value, index) =>
        !Number.isSafeInteger(value) ||
        value < 0 ||
        value > 47 ||
        (index > 0 && config.shardIndices[index - 1] >= value),
    ) ||
    !validToken(config.workerIdPrefix) ||
    !Number.isSafeInteger(config.heartbeatIntervalMs) ||
    config.heartbeatIntervalMs < 5_000 ||
    config.heartbeatIntervalMs > 300_000 ||
    config.executionPolicy !== "strictly_sequential_stop_on_failure" ||
    config.evidencePolicy !==
      "immutable_shard_receipts_and_hash_chained_events" ||
    config.hostSleepPolicy !== "prevent_on_darwin_best_effort"
  )
    fail("empirical_supervisor_config_invalid");
  return config;
}

function validateControl(control, config) {
  if (
    control?.schemaVersion !== 1 ||
    control.kind !== "agentplat-local-empirical-supervisor-control-v1" ||
    control.configDigest !== config.configDigest ||
    !["running", "paused", "stopped"].includes(control.desiredState) ||
    !Number.isSafeInteger(control.revision) ||
    control.revision < 1 ||
    !validTimestamp(control.requestedAt)
  )
    fail("empirical_supervisor_control_invalid");
}

async function loadState(supervisorDirectory, config) {
  const state = await readJsonIfPresent(
    path.join(supervisorDirectory, STATE_FILE),
  );
  if (state === null)
    return {
      schemaVersion: 1,
      kind: "agentplat-local-empirical-supervisor-state-v1",
      configDigest: config.configDigest,
      pid: null,
      observedState: "starting",
      heartbeatAt: null,
      updatedAt: null,
      currentShard: null,
      completedShards: [],
      completedProjectionCount: 0,
      failureReason: null,
      lastEventDigest: null,
      lastControlRevision: 0,
    };
  if (
    state.schemaVersion !== 1 ||
    state.kind !== "agentplat-local-empirical-supervisor-state-v1" ||
    state.configDigest !== config.configDigest ||
    ![
      "starting",
      "running",
      "paused",
      "stopped",
      "failed",
      "completed",
    ].includes(state.observedState) ||
    !(
      state.pid === null ||
      (Number.isSafeInteger(state.pid) && state.pid > 0)
    ) ||
    !(state.heartbeatAt === null || validTimestamp(state.heartbeatAt)) ||
    !(state.updatedAt === null || validTimestamp(state.updatedAt)) ||
    !(
      state.currentShard === null ||
      config.shardIndices.includes(state.currentShard)
    ) ||
    !Array.isArray(state.completedShards) ||
    state.completedShards.some(
      (value, index) =>
        !config.shardIndices.includes(value) ||
        (index > 0 && state.completedShards[index - 1] >= value),
    ) ||
    !Number.isSafeInteger(state.completedProjectionCount) ||
    state.completedProjectionCount < 0 ||
    !(
      state.failureReason === null || typeof state.failureReason === "string"
    ) ||
    !(
      state.lastEventDigest === null ||
      isSupervisorDigestV1(state.lastEventDigest)
    ) ||
    !Number.isSafeInteger(state.lastControlRevision) ||
    state.lastControlRevision < 0
  )
    fail("empirical_supervisor_state_invalid");
  return state;
}

async function validateEventChainFile(file, expectedConfigDigest = null) {
  let text;
  try {
    text = await readTextBounded(file, MAX_TEXT_BYTES);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  if (text === "") return [];
  if (!text.endsWith("\n")) fail("empirical_supervisor_event_log_truncated");
  const events = text
    .trimEnd()
    .split("\n")
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        fail("empirical_supervisor_event_log_invalid");
      }
    });
  return validateEventChainV1(events, expectedConfigDigest);
}

export function validateEventChainV1(events, expectedConfigDigest = null) {
  let previousEventDigest = null;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const { eventDigest, ...body } = event;
    if (
      event?.schemaVersion !== 1 ||
      event.kind !== "agentplat-local-empirical-supervisor-event-v1" ||
      (expectedConfigDigest !== null &&
        event.configDigest !== expectedConfigDigest) ||
      event.sequence !== index ||
      event.previousEventDigest !== previousEventDigest ||
      !validTimestamp(event.recordedAt) ||
      typeof event.eventType !== "string" ||
      !/^[a-z][a-z0-9_]{0,127}$/u.test(event.eventType) ||
      event.value === null ||
      typeof event.value !== "object" ||
      eventDigest !== digest("empirical-supervisor-event-v1", body)
    )
      fail("empirical_supervisor_event_chain_invalid");
    previousEventDigest = eventDigest;
  }
  return events;
}

export function assertStateEventAnchorV1(state, events) {
  if (
    state.lastEventDigest !== null &&
    events.at(-1)?.eventDigest !== state.lastEventDigest
  )
    fail("empirical_supervisor_event_log_truncated");
}

export function createSupervisorEventV1({
  configDigest,
  sequence,
  previousEventDigest,
  eventType,
  recordedAt,
  value,
}) {
  const body = {
    schemaVersion: 1,
    kind: "agentplat-local-empirical-supervisor-event-v1",
    configDigest,
    sequence,
    previousEventDigest,
    eventType,
    recordedAt,
    value,
  };
  return {
    ...body,
    eventDigest: digest("empirical-supervisor-event-v1", body),
  };
}

async function operationalSample(storeDirectory) {
  return {
    recordedAt: new Date().toISOString(),
    storeBytes: await directoryBytes(storeDirectory),
    freeMemoryBytes: os.freemem(),
    loadAverage1m: os.loadavg()[0],
  };
}

async function directoryBytes(directory) {
  let total = 0;
  const pending = [directory];
  while (pending.length > 0) {
    const current = pending.pop();
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    for (const entry of entries) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(target);
      else if (entry.isFile()) total += (await stat(target)).size;
    }
  }
  return total;
}

function publicEnvironment() {
  const cpus = os.cpus();
  return {
    platform: process.platform,
    release: os.release(),
    arch: process.arch,
    nodeVersion: process.version,
    cpuModel: cpus[0]?.model ?? "unknown",
    logicalCpuCount: cpus.length,
    totalMemoryBytes: os.totalmem(),
  };
}

function contractSmoke(options) {
  exactOptions(options, ["mode"]);
  const event = createSupervisorEventV1({
    configDigest: "sha256:config",
    sequence: 0,
    previousEventDigest: null,
    eventType: "supervisor_started",
    recordedAt: "2026-01-01T00:00:00.000Z",
    value: { recovered: false },
  });
  validateEventChainV1([event]);
  const report = renderExecutionReportV1({
    config: {
      campaignId: "contract",
      sourceCommit: "a".repeat(40),
      configDigest: "sha256:config",
      executionPolicy: "strictly_sequential_stop_on_failure",
      shardIndices: [0],
    },
    events: [event],
    campaign: {
      status: "partial",
      completedShards: [],
      missingShards: [0],
      completedProjectionCount: 0,
    },
  });
  if (!report.includes("Empirical claim permitted by this report: no"))
    fail("empirical_supervisor_report_contract_invalid");
  status({
    status: "passed",
    scope: "contract_only_no_execution",
    hashChainedEvents: true,
    detachedExecution: true,
    empiricalClaimPermitted: false,
  });
}

function parseOptions(args) {
  const result = Object.create(null);
  const values = args.filter((value) => value !== "--");
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];
    if (
      !name?.startsWith("--") ||
      value === undefined ||
      value.startsWith("--")
    )
      fail("empirical_supervisor_option_syntax_invalid");
    const key = name.slice(2);
    if (key in result) fail("empirical_supervisor_option_duplicate");
    result[key] = value;
  }
  return result;
}

function exactOptions(options, expected) {
  const actual = Object.keys(options).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((name, index) => name !== wanted[index])
  )
    fail("empirical_supervisor_option_set_invalid");
}

function tokenOption(options, name) {
  const value = options[name];
  if (!validToken(value)) fail(`empirical_supervisor_${name}_invalid`);
  return value;
}

function validToken(value) {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/u.test(value)
  );
}

function commitOption(options, name) {
  const value = options[name];
  if (typeof value !== "string" || !/^[a-f0-9]{40}$/u.test(value))
    fail(`empirical_supervisor_${name}_invalid`);
  return value;
}

function shardListOption(options, name) {
  const text = options[name];
  if (
    typeof text !== "string" ||
    !/^(?:[0-9]|[1-3][0-9]|4[0-7])(?:,(?:[0-9]|[1-3][0-9]|4[0-7]))*$/u.test(
      text,
    )
  )
    fail(`empirical_supervisor_${name}_invalid`);
  const values = text.split(",").map(Number);
  if (
    new Set(values).size !== values.length ||
    values.some((value, index) => index > 0 && value <= values[index - 1])
  )
    fail(`empirical_supervisor_${name}_invalid`);
  return values;
}

function positiveIntegerOption(options, name, minimum, maximum) {
  const value = Number(options[name]);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
    fail(`empirical_supervisor_${name}_invalid`);
  return value;
}

function externalDirectoryOption(options, name) {
  const value = options[name];
  if (!validExternalDirectory(value))
    fail(`empirical_supervisor_${name}_invalid`);
  return path.resolve(value);
}

function validExternalDirectory(value) {
  if (
    typeof value !== "string" ||
    value.includes("\0") ||
    !path.isAbsolute(value)
  )
    return false;
  const resolved = path.resolve(value);
  const relative = path.relative(root, resolved);
  return !(
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function validTimestamp(value) {
  return (
    typeof value === "string" &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

async function readJsonBounded(file) {
  const text = await readTextBounded(file, MAX_TEXT_BYTES);
  try {
    return JSON.parse(text);
  } catch {
    fail("empirical_supervisor_json_invalid");
  }
}

async function readJsonIfPresent(file) {
  try {
    return await readJsonBounded(file);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function readTextBounded(file, maximumBytes) {
  const value = await readFile(file, "utf8");
  const bytes = Buffer.byteLength(value, "utf8");
  if (bytes > maximumBytes) fail("empirical_supervisor_text_size_invalid");
  return value;
}

async function writeJsonImmutable(file, value) {
  await writeTextImmutable(file, `${JSON.stringify(value)}\n`);
}

async function writeTextImmutable(file, value) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  try {
    const handle = await open(file, "wx", 0o600);
    try {
      await handle.writeFile(value, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    if ((await readFile(file, "utf8")) !== value)
      fail("empirical_supervisor_immutable_artifact_conflict");
  }
  await chmod(file, 0o600);
}

async function writeJsonAtomic(file, value) {
  await writeTextAtomic(file, `${JSON.stringify(value)}\n`);
}

async function writeTextAtomic(file, value) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.tmp-${process.pid}-${randomUUID()}`;
  try {
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(value, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, file);
    await chmod(file, 0o600);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function appendTextDurable(file, value) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const handle = await open(file, "a", 0o600);
  try {
    await handle.writeFile(value, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function boundedAppend(current, chunk) {
  const next = current + chunk;
  return Buffer.byteLength(next, "utf8") > MAX_CHILD_OUTPUT_BYTES
    ? next.slice(-MAX_CHILD_OUTPUT_BYTES)
    : next;
}

function lastJsonLine(text) {
  const lines = text.trim().split("\n").reverse();
  for (const line of lines) {
    try {
      const value = JSON.parse(line);
      if (value !== null && typeof value === "object") return value;
    } catch {
      // Non-JSON child output is ignored but remains digest-bound on failure.
    }
  }
  return null;
}

function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("empirical_supervisor_number_invalid");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value !== "object") fail("empirical_supervisor_value_invalid");
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

export function isSupervisorDigestV1(value) {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/u.test(value);
}

function digest(scope, value) {
  return `sha256:${createHash("sha256")
    .update(scope)
    .update("\0")
    .update(canonicalJson(value))
    .digest("hex")}`;
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

function formatBytes(value) {
  if (!Number.isSafeInteger(value) || value < 0) return "unavailable";
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function publicFailureReason(error) {
  const message = error instanceof Error ? error.message : "";
  return /^empirical_supervisor_[a-z0-9_]{1,180}$/u.test(message)
    ? message
    : "empirical_supervisor_failed";
}

function status(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function fail(reason) {
  throw new TypeError(reason);
}
