import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
async function run(script, env = process.env) {
  const child = spawn(process.execPath, [script], {
    cwd: root,
    env,
    stdio: "inherit",
  });
  const timeout = setTimeout(() => child.kill("SIGKILL"), 120_000);
  try {
    const [code] = await once(child, "exit");
    assert.equal(code, 0, script);
  } finally {
    clearTimeout(timeout);
  }
}
await run("examples/rooms-api/scripts/migrate.mjs");
// Let the OS select an available local port; startup below detects binding errors.
const socket = createServer();
socket.listen(0, "127.0.0.1");
await once(socket, "listening");
const port = socket.address().port;
await new Promise((resolve) => socket.close(resolve));
const env = {
  ...process.env,
  HOST: "127.0.0.1",
  PORT: String(port),
  API_URL: `http://127.0.0.1:${port}`,
  PROPOSAL_MODEL_MODE: "mock",
};
const server = spawn(process.execPath, ["examples/rooms-api/src/index.mjs"], {
  cwd: root,
  env,
  stdio: "inherit",
});
let serverError;
server.on("error", (error) => {
  serverError = error;
});
const serverExit = once(server, "exit");
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (serverError) throw serverError;
    assert.equal(server.exitCode, null, "API exited before readiness");
    try {
      ready = (
        await fetch(`${env.API_URL}/health`, {
          signal: AbortSignal.timeout(500),
        })
      ).ok;
    } catch {}
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, "API readiness timeout");
  await run("examples/rooms-api/scripts/proposal-demo.mjs", env);
  await run("examples/rooms-api/scripts/proposal-recovery.mjs", env);
  await run("examples/rooms-api/scripts/protected-action-demo.mjs", env);
} finally {
  server.kill("SIGTERM");
  const timeout = setTimeout(() => server.kill("SIGKILL"), 10_000);
  try {
    await serverExit;
  } finally {
    clearTimeout(timeout);
  }
}
console.log(
  "Adoption integration scenarios passed; external developer pilot remains separate.",
);
