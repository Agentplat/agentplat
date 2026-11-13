import assert from "node:assert/strict";
import test from "node:test";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { once } from "node:events";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { RoomService } from "@agentplat/rooms";
import {
  createPostgresPool,
  PostgresRoomRepository,
  runMigrations,
} from "@agentplat/rooms-postgres";

const database = process.env.A2UI_TEST_DATABASE_URL;
test(
  "PostgreSQL: pending and decided approvals survive process crashes and graceful restarts",
  { skip: !database, timeout: 60000 },
  async (t) => {
    // Explicit opt-in: use only a disposable test DB. Migrations run, data is retained.
    const pool = createPostgresPool({ connectionString: database });
    pool.on("error", () => {});
    t.after(() => pool.end());
    await runMigrations(pool);
    const service = new RoomService({
      repository: new PostgresRoomRepository(pool),
    });
    const tenantId = `a2ui-test-${randomUUID()}`;
    const room = await service.createRoom(tenantId, {
      title: "A2UI restart",
      goal: "Verify durable decisions",
    });
    const human = await service.addParticipant(tenantId, room.id, {
      type: "human",
      displayName: "Reviewer",
      role: "owner",
      permissions: ["approve"],
    });
    const artifact = await service.createArtifact(tenantId, room.id, {
      type: "proposal",
      title: "Proposal",
      content: "Version one",
      contentType: "text/plain",
      provenance: {},
    });
    const approval = await service.requestApproval(tenantId, room.id, {
      targetType: "artifact",
      targetId: artifact.id,
    });
    const socket = createServer();
    socket.listen(0, "127.0.0.1");
    await once(socket, "listening");
    const port = socket.address().port;
    await new Promise((resolve) => socket.close(resolve));
    const base = `http://127.0.0.1:${port}`;
    const token = randomUUID();
    let child,
      exited,
      logs = "";
    async function start() {
      logs = "";
      child = spawn(
        process.execPath,
        [new URL("../src/index.mjs", import.meta.url).pathname],
        {
          env: {
            ...process.env,
            DATABASE_URL: database,
            HOST: "127.0.0.1",
            PORT: String(port),
            PROPOSAL_MODEL_MODE: "mock",
            A2UI_PILOT_TOKEN: token,
            A2UI_PILOT_TENANT_ID: tenantId,
            A2UI_PILOT_PARTICIPANT_ID: human.id,
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      exited = once(child, "exit");
      child.stdout.on("data", (chunk) => {
        logs += chunk;
      });
      child.stderr.on("data", (chunk) => {
        logs += chunk;
      });
      for (let n = 0; n < 100; n++) {
        if (child.exitCode !== null)
          throw new Error(`API startup failed: ${logs}`);
        try {
          if (
            (
              await fetch(`${base}/health`, {
                signal: AbortSignal.timeout(300),
              })
            ).ok
          )
            return;
        } catch {}
        await delay(50);
      }
      throw new Error("API startup deadline");
    }
    async function stop(signal) {
      child.kill(signal);
      const result = await Promise.race([
        exited,
        delay(8000, undefined, { ref: false }).then(() => {
          throw new Error("API shutdown deadline");
        }),
      ]);
      if (signal === "SIGTERM") assert.equal(result[0], 0, logs);
    }
    t.after(async () => {
      if (child?.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        await exited;
      }
    });
    const path = `/experimental/a2ui/rooms/${room.id}`;
    async function request(message) {
      const r = await fetch(base + path, {
        method: message ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: message ? JSON.stringify(message) : undefined,
        signal: AbortSignal.timeout(5000),
      });
      return { status: r.status, body: await r.json() };
    }
    const action = (surface, name, comment) => ({
      version: "1.0",
      action: {
        name,
        sourceComponentId: name,
        surfaceId: surface.createSurface.surfaceId,
        timestamp: new Date().toISOString(),
        context: { comment },
      },
    });
    await start();
    const initial = (await request()).body.data;
    assert.equal(initial.surfaces.length, 1);
    await stop("SIGKILL");
    await start();
    assert.deepEqual((await request()).body.data, initial);
    const container = process.env.A2UI_TEST_POSTGRES_CONTAINER;
    if (container) {
      // Additional explicit opt-in: stop/start only the named disposable container.
      const docker = promisify(execFile);
      try {
        await docker("docker", ["stop", container]);
        assert.equal((await request()).status, 500);
        assert.equal(
          child.exitCode,
          null,
          "API must survive idle PostgreSQL errors",
        );
      } finally {
        await docker("docker", ["start", container]);
      }
      let recovered = false;
      for (let n = 0; n < 100; n++) {
        if ((await request()).status === 200) {
          recovered = true;
          break;
        }
        await delay(100);
      }
      assert.ok(recovered, "snapshot must recover without restarting the API");
      assert.deepEqual((await request()).body.data, initial);
    }
    const revision = action(
      initial.surfaces[0],
      "requestRevision",
      "Add weekly human review",
    );
    assert.equal((await request(revision)).body.data.status, "needs_revision");
    await stop("SIGTERM");
    await start();
    assert.equal(
      (await request(revision)).status,
      200,
      "retry after response loss/restart must reconcile persisted decision",
    );
    await service.createArtifactVersion(tenantId, room.id, artifact.id, {
      content: "Version two: weekly human review",
      contentType: "text/plain",
    });
    await service.requestApproval(tenantId, room.id, {
      targetType: "artifact",
      targetId: artifact.id,
    });
    assert.equal(
      (await request(action(initial.surfaces[0], "approve", "stale"))).status,
      409,
    );
    const current = (await request()).body.data;
    const approve = action(
      current.surfaces[0],
      "approve",
      "Accepted version two",
    );
    const repeated = await Promise.all([request(approve), request(approve)]);
    assert.deepEqual(
      repeated.map((r) => r.status),
      [200, 200],
    );
    await stop("SIGKILL");
    await start();
    assert.equal((await request(approve)).status, 200);
    assert.deepEqual((await request()).body.data.surfaces, []);
    const state = await service.getRoomState(tenantId, room.id);
    assert.equal(
      state.approvals.find((a) => a.id === approval.id).status,
      "needs_revision",
    );
    assert.equal(
      state.approvals.filter(
        (a) => a.targetVersion === 2 && a.status === "approved",
      ).length,
      1,
    );
    assert.equal(
      state.artifacts.find((a) => a.id === artifact.id).currentVersion,
      2,
    );
    assert.equal(
      state.artifacts.find((a) => a.id === artifact.id).status,
      "approved",
    );
    await service.completeRoom(tenantId, room.id);
    await stop("SIGTERM");
    await start();
    assert.equal(
      (await service.getRoomState(tenantId, room.id)).room.status,
      "completed",
    );
    assert.deepEqual((await request()).body.data.surfaces, []);
    await stop("SIGTERM");
  },
);
