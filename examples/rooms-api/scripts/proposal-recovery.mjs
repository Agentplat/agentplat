import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { createPostgresPool, runMigrations } from "@agentplat/rooms-postgres";
const pool = createPostgresPool();
const schema = `proposal_recovery_${randomUUID().replaceAll("-", "")}`;
try {
  await runMigrations(pool, { schema, createSchema: true });
} catch (error) {
  await pool.end();
  throw error;
}
const env = {
  ...process.env,
  RECOVERY_TENANT_ID: schema,
  RECOVERY_SCHEMA: schema,
};
const target = new URL("./proposal-recovery-worker.mjs", import.meta.url);
const first = fork(target, ["first"], {
  env,
  stdio: ["ignore", "inherit", "inherit", "ipc"],
});
const deadline = setTimeout(() => first.kill("SIGKILL"), 30_000);
try {
  const receipt = await new Promise((resolve, reject) => {
    first.once("message", resolve);
    first.once("error", reject);
    first.once("exit", () =>
      reject(new Error("Worker exited before its durable checkpoint")),
    );
  });
  assert.equal(receipt.ready, true);
  const stopped = once(first, "exit");
  first.kill("SIGKILL");
  await stopped;
  await new Promise((resolve) => setTimeout(resolve, 350));
  const successor = fork(target, ["successor"], {
    env: { ...env, RECOVERY_EXPECTED_RUN: receipt.runId },
    stdio: ["ignore", "inherit", "inherit", "ipc"],
  });
  const timeout = setTimeout(() => successor.kill("SIGKILL"), 30_000);
  try {
    const [code] = await once(successor, "exit");
    assert.equal(code, 0);
  } finally {
    clearTimeout(timeout);
  }
} finally {
  clearTimeout(deadline);
  if (first.exitCode === null && first.signalCode === null) {
    const stopped = once(first, "exit");
    first.kill("SIGKILL");
    await stopped;
  }
  try {
    await pool.query(`DROP SCHEMA ${schema} CASCADE`);
  } finally {
    await pool.end();
  }
}
