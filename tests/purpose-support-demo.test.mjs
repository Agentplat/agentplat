import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPostgresPool } from "../packages/rooms-postgres/dist/index.js";
import { verifyReport } from "../examples/agent-purpose-support/report.mjs";
const runner = fileURLToPath(
  new URL("../examples/agent-purpose-support/demo.mjs", import.meta.url),
);
for (const outcome of ["recovered", "unresolved"])
  test(
    `persistent support demonstration: ${outcome}, process restart and auditable evidence`,
    { skip: process.env.AGENTPLAT_POSTGRES_TEST !== "1" },
    async () => {
      const root = await mkdtemp(join(tmpdir(), "agentplat-support-test-")),
        output = join(root, "run");
      let schema;
      try {
        const result = spawnSync(process.execPath, [runner, output, outcome], {
          env: process.env,
          encoding: "utf8",
          timeout: 60000,
        });
        try {
          schema = JSON.parse(
            await readFile(join(output, "run.json"), "utf8"),
          ).schema;
        } catch {}
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.error, undefined);
        const report = JSON.parse(
          await readFile(join(output, "evidence.json"), "utf8"),
        );
        assert.ok(Object.values(verifyReport(report)).every(Boolean));
        assert.equal(
          report.outcome.outcome,
          outcome === "recovered" ? "recovered" : "escalated",
        );
        assert.match(
          await readFile(join(output, "report.md"), "utf8"),
          /una tarea terminada no es un problema resuelto/,
        );
        assert.equal(
          report.journal.filter((e) => e.kind === "runtime-output").length,
          3,
        );
        const mutations = [
          (r) => (r.inceptions.rejected.disposition = "adopted"),
          (r) =>
            (r.journal.find((e) => e.kind === "restart-verified").pid =
              r.journal.find((e) => e.kind === "paused-before-restart").pid),
          (r) => (r.signalState.observations = []),
          (r) =>
            r.currentLimits
              .find((l) => l.rule.kind === "tools")
              .rule.allowed.push("bypass_identity"),
          (r) => (r.room.artifacts = []),
        ];
        for (const change of mutations) {
          const tampered = structuredClone(report);
          change(tampered);
          assert.throws(() => verifyReport(tampered));
        }
        // Reopening the DB in this third host verifies the exported results are stored, not manufactured by the report process.
        const pool = createPostgresPool({
          options: "-c search_path=pg_catalog",
        });
        try {
          assert.match(schema, /^support_demo_[a-f0-9]{12}$/);
          const saved = (
            await pool.query(
              `SELECT state FROM "${schema}".purpose_missions WHERE tenant_id=$1 AND agent_id=$2 AND mission_id='recovery'`,
              ["support-demo", "purpose-support"],
            )
          ).rows[0].state;
          assert.deepEqual(saved, report.missionStates.recovery);
        } finally {
          await pool.end();
        }
      } finally {
        if (schema && /^support_demo_[a-f0-9]{12}$/.test(schema)) {
          const pool = createPostgresPool({
            options: "-c search_path=pg_catalog",
          });
          try {
            await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
          } finally {
            await pool.end();
          }
        }
        await rm(root, { recursive: true, force: true });
      }
    },
  );
