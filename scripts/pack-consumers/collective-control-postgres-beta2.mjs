import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import {
  PostgresActionGrantRepositoryV1,
  PostgresCollectiveAuthorityRepositoryV1,
  PostgresCollectiveEvidenceSinkV1,
  PostgresCollectiveExecutionRepositoryV1,
  runMigrations,
} from '@agentplat/collective-control-postgres';
import {
  CONTROL_CONFORMANCE_CAPABILITIES,
  createControlConformanceFixturesV1,
  runControlConformanceV1,
} from '@agentplat/mesh-conformance/control';
import { Pool } from 'pg';

const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : undefined
);
let sequence = 0;

try {
  const cases = await runControlConformanceV1({
    declaredCapabilities: CONTROL_CONFORMANCE_CAPABILITIES,
    seed: 24_605,
    timeoutMs: 30_000,
    cleanupTimeoutMs: 10_000,
    async factory() {
      const fixtures = createControlConformanceFixturesV1();
      const schema = `collective_registry_${randomUUID().replaceAll('-', '')}_${++sequence}`;
      const scope = {
        schema,
        tenantId: fixtures.authorityState.tenantId,
        policyDomainId: fixtures.authorityState.policyDomainId,
      };
      await runMigrations(pool, { schema, createSchema: true });
      const authorityRepository =
        new PostgresCollectiveAuthorityRepositoryV1(pool, scope);
      const executionRepository =
        new PostgresCollectiveExecutionRepositoryV1(pool, scope);
      await authorityRepository.initialize(fixtures.authorityState);
      await executionRepository.initialize(fixtures.executionState);
      const grantScope = {
        schema,
        tenantId: scope.tenantId,
        gatewayId: fixtures.actionPermit.gatewayId,
      };
      const actionGrantRepository =
        new PostgresActionGrantRepositoryV1(pool, grantScope);
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
              [scope.tenantId, scope.policyDomainId]
            )
          ).rows;
        },
        restart() {
          return {
            authorityRepository:
              new PostgresCollectiveAuthorityRepositoryV1(pool, scope),
            executionRepository:
              new PostgresCollectiveExecutionRepositoryV1(pool, scope),
            actionGrantRepository:
              new PostgresActionGrantRepositoryV1(pool, grantScope),
            evidenceSink: new PostgresCollectiveEvidenceSinkV1(pool, scope),
          };
        },
        async cleanup() {
          await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        },
      };
    },
  });

  assert.equal(cases.length, 14);
  assert.equal(cases.every((entry) => entry.outcome === 'passed'), true);
  process.stdout.write(
    `${JSON.stringify({
      status: 'passed',
      profile: 'postgres',
      conformanceCases: cases.length,
    })}\n`
  );
} finally {
  await pool.end();
}
