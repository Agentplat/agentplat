import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { Pool } from "pg";
import {
  PostgresA2AStateStore,
  runMigrations,
  getMigrationStatus,
} from "../dist/postgres.js";
import {
  PostgresAgentRegistryStore,
  runMigrations as migrateRegistry,
} from "../../agent-registry-postgres/dist/index.js";
import { AgentRegistry } from "@agentplat/agent-registry";
import { A2AServer, A2AClient, discoverA2AAgent } from "../dist/index.js";
import { fixture, input, principal } from "./helpers.mjs";
const bin =
  process.env.AGENTPLAT_TEST_PG_BIN ?? "/opt/homebrew/opt/postgresql@16/bin";
const url = process.env.AGENTPLAT_A2A_TEST_DATABASE_URL;
test(
  "real PostgreSQL migrations, concurrent CAS, tenant isolation and server/client restart",
  { skip: !url && !existsSync(path.join(bin, "initdb")) },
  async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "ap-a2a-"));
    const socket = path.join(directory, "socket");
    await mkdir(socket);
    let started = false,
      pool;
    try {
      if (!url) {
        execFileSync(
          path.join(bin, "initdb"),
          [
            "-D",
            path.join(directory, "data"),
            "-A",
            "trust",
            "--no-locale",
            "-U",
            "agentplat_test",
          ],
          { stdio: "pipe" },
        );
        execFileSync(
          path.join(bin, "pg_ctl"),
          [
            "-D",
            path.join(directory, "data"),
            "-l",
            path.join(directory, "server.log"),
            "-o",
            `-k ${socket} -h '' -p 55439`,
            "-w",
            "start",
          ],
          { stdio: "pipe" },
        );
        started = true;
      }
      pool = new Pool(
        url
          ? { connectionString: url }
          : {
              host: socket,
              port: 55439,
              user: "agentplat_test",
              database: "postgres",
            },
      );
      const schema = "a2a_test_" + Date.now();
      try {
        await migrateRegistry(pool, { schema, createSchema: true });
        await runMigrations(pool, { schema });
        await runMigrations(pool, { schema });
        assert.equal(
          (await getMigrationStatus(pool, { schema })).currentVersion,
          1,
        );
        const registry = new AgentRegistry(
          new PostgresAgentRegistryStore(pool, schema),
          { authorize: async () => true },
        );
        const state = new PostgresA2AStateStore(pool, schema);
        const f = await fixture();
        let runs = 0;
        const service = {
          ...f.service,
          async *execute() {
            runs++;
            yield {
              state: "completed",
              reply: [{ kind: "text", text: "persistent" }],
            };
          },
        };
        let server = new A2AServer({
          service,
          store: state,
          authenticate: async () => principal,
          pollIntervalMs: 1,
        });
        const network = {
          ...f.network,
          fetch: async (input, init) => server.handle(new Request(input, init)),
        };
        const draft = await discoverA2AAgent({
          tenantId: "tenant",
          entryId: "research",
          ownerId: "owner",
          cardUrl: "https://agent.test/card",
          skillCapabilities: { research: "research" },
          validUntil: "2030-01-01",
          network,
        });
        const approved = {
          ...draft,
          availability: "available",
          verification: "verified",
          admission: "approved",
        };
        await registry.publish(principal, approved);
        const options = {
          principal,
          registry,
          store: state,
          network,
          authorize: async () => true,
        };
        let client = new A2AClient(options);
        for await (const event of client.sendStream(input())) {
        }
        assert.equal(runs, 1);
        server = new A2AServer({
          service,
          store: new PostgresA2AStateStore(pool, schema),
          authenticate: async () => principal,
          pollIntervalMs: 1,
        });
        client = new A2AClient({
          ...options,
          store: new PostgresA2AStateStore(pool, schema),
        });
        assert.equal(
          (await client.reconcile("research", "one")).task.state,
          "completed",
        );
        await client.send(input());
        assert.equal(runs, 1);
        const results = await Promise.allSettled([
          registry.publish(principal, approved, 1),
          registry.withdraw(principal, "research", 1),
        ]);
        assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
        assert.equal(
          await registry.get({ ...principal, tenantId: "other" }, "research"),
          undefined,
        );
        const claims = await Promise.all([
          state.compareAndSet("scope", "claim", null, { effect: 1 }),
          state.compareAndSet("scope", "claim", null, { effect: 2 }),
        ]);
        assert.deepEqual(claims.sort(), [false, true]);
        assert.equal(await state.get("other", "claim"), undefined);
        assert.equal(
          await state.compareAndSet("scope", "claim", 0, { effect: 3 }),
          false,
        );
      } finally {
        await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
      }
    } finally {
      await pool?.end();
      if (started)
        execFileSync(
          path.join(bin, "pg_ctl"),
          ["-D", path.join(directory, "data"), "-m", "fast", "-w", "stop"],
          { stdio: "pipe" },
        );
      await rm(directory, { recursive: true, force: true });
    }
  },
);
