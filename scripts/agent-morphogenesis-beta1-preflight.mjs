#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const diagnosticOnly = process.argv.includes("--diagnostic-only");
const unexpected = process.argv
  .slice(2)
  .filter((arg) => !["--", "--diagnostic-only"].includes(arg));
if (unexpected.length) throw new TypeError("morphogenesis_beta1_preflight_option_invalid");

const contract = JSON.parse(
  await readFile(
    path.join(root, "config/agent-morphogenesis-beta1-campaign-v1.json"),
    "utf8",
  ),
);
const sourceCommit = git(["rev-parse", "HEAD"]);
const worktreeEntries = git(["status", "--porcelain=v1"])
  .split("\n")
  .filter(Boolean);
const postgresHost = process.env.PGHOST ?? "127.0.0.1";
const postgresPort = port(process.env.PGPORT ?? "5432", "PGPORT");
const temporalAddress = process.env.TEMPORAL_ADDRESS ?? "127.0.0.1:7233";
const [temporalHost, temporalPortText] = temporalAddress.split(":");
const temporalPort = port(temporalPortText, "TEMPORAL_ADDRESS");

const requiredFiles = [
  "examples/agent-morphogenesis/demo.mjs",
  "examples/mesh-multiprocess/demo.mjs",
  "packages/collective-host-postgres/dist/morphogenesis.js",
  "packages/workflows-temporal/dist/index.js",
  "packages/collective-quorum/dist/morphogenesis.js",
];
const fileChecks = Object.fromEntries(
  await Promise.all(requiredFiles.map(async (file) => [file, await exists(file)])),
);
const checks = {
  exactCommitAvailable: /^[0-9a-f]{40}$/.test(sourceCommit),
  cleanWorktree: worktreeEntries.length === 0,
  postgresReachable: await tcpReachable(postgresHost, postgresPort),
  temporalReachable: await tcpReachable(temporalHost, temporalPort),
  requiredFilesPresent: Object.values(fileChecks).every(Boolean),
};
const ready = Object.values(checks).every(Boolean);

console.log(JSON.stringify({
  status: ready ? "ready" : "not-ready",
  purpose: "diagnostic-preflight-only",
  campaignId: contract.campaignId,
  sourceCommit,
  checks,
  endpoints: {
    postgres: `${postgresHost}:${postgresPort}`,
    temporal: temporalAddress,
  },
  requiredFiles: fileChecks,
  worktreeEntryCount: worktreeEntries.length,
  executionPermitted: false,
  evidenceProduced: false,
}, null, 2));

if (!ready && !diagnosticOnly) process.exitCode = 2;

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

async function exists(relativePath) {
  try {
    await access(path.join(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

function port(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535)
    throw new TypeError(`${name} port is invalid`);
  return parsed;
}

function tcpReachable(host, targetPort) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port: targetPort });
    const finish = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(750, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}
