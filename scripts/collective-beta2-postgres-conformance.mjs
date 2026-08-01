import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { digestCollectiveJsonV1 } from "@agentplat/collective-control";
import {
  PostgresActionGrantRepositoryV1,
  PostgresCollectiveAuthorityRepositoryV1,
  PostgresCollectiveEvidenceSinkV1,
  PostgresCollectiveExecutionRepositoryV1,
  runMigrations,
} from "@agentplat/collective-control-postgres";
import {
  CONTROL_CONFORMANCE_CAPABILITIES,
  CONTROL_CONFORMANCE_CASES_V1,
  CONTROL_CONFORMANCE_VERSION,
  createControlConformanceFixturesV1,
  createControlConformanceReportV1,
  runControlConformanceV1,
  validateControlConformanceReportV1,
} from "@agentplat/mesh-conformance/control";
import { controlDigest } from "@agentplat/inference-control/tools";
import { Pool } from "pg";

const execute = promisify(execFile);
const root = path.resolve(new URL("..", import.meta.url).pathname);
const argumentsByName = parseArguments(process.argv.slice(2));
const mode = argumentsByName.get("--mode") ?? "run";
const output = path.resolve(
  root,
  argumentsByName.get("--output") ??
    "docs/governed-collectives/beta-2-postgres-conformance.json",
);

if (mode === "check") {
  const evidence = JSON.parse(await readFile(output, "utf8"));
  assert.deepEqual(Object.keys(evidence).sort(), [
    "evidenceDigest",
    "releaseVersion",
    "report",
    "schemaVersion",
    "sourceCommit",
    "status",
  ]);
  assert.equal(evidence.schemaVersion, 1);
  assert.equal(evidence.releaseVersion, "0.3.0-beta.2");
  assert.equal(evidence.status, "passed");
  assert.match(evidence.sourceCommit, /^[0-9a-f]{40}$/u);
  const report = validateControlConformanceReportV1(evidence.report);
  assert.equal(report.verdict, "passed");
  assert.equal(report.counts.failed, 0);
  assert.equal(report.counts.notDeclared, 0);
  assert.equal(
    evidence.evidenceDigest,
    digestCollectiveJsonV1(
      "evaluation-report",
      withoutKey(evidence, "evidenceDigest"),
    ),
  );
  process.stdout.write(`PostgreSQL conformance evidence passed: ${output}\n`);
  process.exit(0);
}
if (mode !== "run") throw new TypeError("--mode must be run or check");
if (!process.env.DATABASE_URL)
  throw new Error("DATABASE_URL is required for PostgreSQL conformance");

const sourceCommit = (
  await execute("git", ["rev-parse", "HEAD"], { cwd: root })
).stdout.trim();
const dirty = (
  await execute("git", ["status", "--porcelain=v1"], { cwd: root })
).stdout.trim();
if (dirty !== "") throw new Error("conformance_requires_clean_worktree");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
let sequence = 0;
try {
  const cases = await runControlConformanceV1({
    declaredCapabilities: CONTROL_CONFORMANCE_CAPABILITIES,
    seed: 24_603,
    timeoutMs: 30_000,
    cleanupTimeoutMs: 10_000,
    async factory() {
      const fixtures = createControlConformanceFixturesV1();
      const schema = `collective_conformance_${sourceCommit.slice(0, 8)}_${++sequence}`;
      const scope = {
        schema,
        tenantId: fixtures.authorityState.tenantId,
        policyDomainId: fixtures.authorityState.policyDomainId,
      };
      await runMigrations(pool, { schema, createSchema: true });
      const authorityRepository = new PostgresCollectiveAuthorityRepositoryV1(
        pool,
        scope,
      );
      const executionRepository = new PostgresCollectiveExecutionRepositoryV1(
        pool,
        scope,
      );
      await authorityRepository.initialize(fixtures.authorityState);
      await executionRepository.initialize(fixtures.executionState);
      const actionGrantRepository = new PostgresActionGrantRepositoryV1(pool, {
        schema,
        tenantId: scope.tenantId,
        gatewayId: fixtures.actionPermit.gatewayId,
      });
      const evidenceSink = new PostgresCollectiveEvidenceSinkV1(pool, scope);
      return {
        authorityRepository,
        executionRepository,
        actionGrantRepository,
        evidenceSink,
        fixtures,
        async inspectEvidence() {
          return (
            await pool.query(
              `SELECT record FROM "${schema}".collective_evidence_records
                WHERE tenant_id=$1 AND policy_domain_id=$2 ORDER BY sequence`,
              [scope.tenantId, scope.policyDomainId],
            )
          ).rows;
        },
        restart() {
          return {
            authorityRepository: new PostgresCollectiveAuthorityRepositoryV1(
              pool,
              scope,
            ),
            executionRepository: new PostgresCollectiveExecutionRepositoryV1(
              pool,
              scope,
            ),
            actionGrantRepository: new PostgresActionGrantRepositoryV1(pool, {
              schema,
              tenantId: scope.tenantId,
              gatewayId: fixtures.actionPermit.gatewayId,
            }),
            evidenceSink: new PostgresCollectiveEvidenceSinkV1(pool, scope),
          };
        },
        async cleanup() {
          await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        },
      };
    },
  });
  const fixture = createControlConformanceFixturesV1();
  const report = createControlConformanceReportV1({
    suiteDigest: digestCollectiveJsonV1("state", {
      schemaVersion: 1,
      version: CONTROL_CONFORMANCE_VERSION,
      capabilities: CONTROL_CONFORMANCE_CAPABILITIES,
      cases: CONTROL_CONFORMANCE_CASES_V1,
    }),
    fixtureManifestDigest: digestCollectiveJsonV1("state", {
      schemaVersion: 1,
      mandateDigest: fixture.mandate.mandateDigest,
      authorityStateDigest: fixture.authorityState.stateDigest,
      executionStateDigest: fixture.executionState.stateDigest,
      actionGrantDigest: controlDigest("grant", fixture.actionGrant),
      evidenceDigests: fixture.evidenceRecords.map(
        (record) => record.recordDigest,
      ),
    }),
    implementation: {
      name: "collective-control-postgres",
      version: "0.3.0-beta.2",
    },
    declaredCapabilities: CONTROL_CONFORMANCE_CAPABILITIES,
    seed: 24_603,
    cases,
  });
  assert.equal(report.verdict, "passed", JSON.stringify(report.cases));
  const body = {
    schemaVersion: 1,
    releaseVersion: "0.3.0-beta.2",
    sourceCommit,
    status: "passed",
    report,
  };
  const evidence = {
    ...body,
    evidenceDigest: digestCollectiveJsonV1("evaluation-report", body),
  };
  await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o644,
  });
  process.stdout.write(
    `PostgreSQL conformance passed: ${report.counts.passed}/${report.counts.total}\n`,
  );
} finally {
  await pool.end();
}

function withoutKey(value, key) {
  const copy = { ...value };
  delete copy[key];
  return copy;
}

function parseArguments(values) {
  const supported = new Set(["--mode", "--output"]);
  const result = new Map();
  for (let index = 0; index < values.length; index += 1) {
    const name = values[index];
    if (name === "--") continue;
    if (!supported.has(name))
      throw new TypeError(`Unsupported argument: ${name}`);
    const value = values[index + 1];
    if (value === undefined || value.startsWith("--"))
      throw new TypeError(`${name} requires a value`);
    result.set(name, value);
    index += 1;
  }
  return result;
}
