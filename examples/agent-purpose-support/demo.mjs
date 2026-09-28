import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  createPostgresPool,
  runMigrations,
} from "../../packages/rooms-postgres/dist/index.js";
const [directory, outcome = "recovered"] = process.argv.slice(2);
assert(
  directory,
  "Usage: node examples/agent-purpose-support/demo.mjs NEW_OUTPUT_DIRECTORY [recovered|unresolved]",
);
assert(["recovered", "unresolved"].includes(outcome), "Unknown outcome");
const output = resolve(directory);
await mkdir(output, { recursive: false });
const schema = `support_demo_${randomBytes(6).toString("hex")}`,
  pool = createPostgresPool({ options: "-c search_path=pg_catalog" }),
  q = `"${schema}"`;
try {
  await runMigrations(pool, { schema, createSchema: true });
  await pool.query(
    `CREATE TABLE ${q}.demo_account(id text PRIMARY KEY,state jsonb NOT NULL)`,
  );
  await pool.query(
    `CREATE TABLE ${q}.demo_trace(sequence bigserial PRIMARY KEY,kind text NOT NULL,data jsonb NOT NULL,pid integer NOT NULL)`,
  );
  await pool.query(
    `INSERT INTO ${q}.demo_account VALUES('customer',$1::jsonb)`,
    [
      JSON.stringify({
        caseId: "case-001",
        identityVerified: false,
        accessRestored: false,
        requestedOutcome: outcome,
        simulated: true,
      }),
    ],
  );
  await writeFile(
    resolve(output, "run.json"),
    JSON.stringify(
      { schema, outcome, scenario: "account-access-support", simulated: true },
      null,
      2,
    ) + "\n",
  );
} finally {
  await pool.end();
}
for (const phase of ["prepare", "resume", "verify"]) {
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL("./worker.mjs", import.meta.url)),
      phase,
      schema,
      resolve(output, "evidence.json"),
    ],
    { stdio: "inherit", env: process.env, timeout: 60000 },
  );
  if (result.error) throw result.error;
  assert.equal(
    result.status,
    0,
    `${phase} failed; schema ${schema} retained for inspection`,
  );
}
await writeFile(
  resolve(output, "README.md"),
  `# AgentPlat: soporte por tarea y por propósito\n\nEscenario simulado; resultado: **${outcome}**.\n\n- instruction: instrucciones entregadas; tarea completada.\n- purpose: evidencia requerida; bypass rechazado; límite corregido por el propietario.\n- Suspensión persistida y recuperada en otro proceso.\n- Las tareas antiguas conservan su autoridad anterior y no se reactivan automáticamente.\n- Resultado y trazabilidad: [informe narrado](report.md) y [evidence.json](evidence.json).\n\nPostgreSQL conserva el esquema aislado \`${schema}\` para inspección. No contiene datos reales.\n`,
);
console.log(`Demo completa: ${output}`);
