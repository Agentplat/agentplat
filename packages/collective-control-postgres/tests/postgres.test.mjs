import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";

import {
  acceptDelegationMandateV1,
  createCollectiveAuthorityStateV1,
  createCollectiveDecisionRecordV1,
  createCollectiveExecutionStateV1,
  createDelegationMandateV1,
  delegationMandateDigestV1,
  digestCollectiveJsonV1,
} from "@agentplat/collective-control";
import {
  actionDigest,
  actionInputDigest,
  controlDigest,
  issueActionGrantV1,
  scopeDigest,
} from "@agentplat/inference-control/tools";
import { Pool } from "pg";

import {
  PostgresActionGrantRepositoryV1,
  PostgresCollectiveAuthorityRepositoryV1,
  PostgresCollectiveEvidenceSinkV1,
  PostgresCollectiveExecutionRepositoryV1,
  getCollectiveRollbackReadinessV1,
  getMigrationStatus,
  runMigrations,
  pruneCollectiveEvidenceBeforeV1,
  verifyCollectiveEvidenceChainV1,
  verifyCollectiveRepositoryIntegrityV1,
} from "../dist/index.js";

test("repository construction and migration import perform no I/O", async () => {
  const pool = new Pool({
    connectionString: "postgresql://invalid.invalid/unused",
  });
  const scope = {
    schema: "collective_import_test",
    tenantId: "tenant:import",
    policyDomainId: "policy-domain:import",
  };
  assert.doesNotThrow(
    () => new PostgresCollectiveAuthorityRepositoryV1(pool, scope),
  );
  assert.doesNotThrow(
    () => new PostgresCollectiveExecutionRepositoryV1(pool, scope),
  );
  assert.doesNotThrow(() => new PostgresCollectiveEvidenceSinkV1(pool, scope));
  assert.doesNotThrow(
    () =>
      new PostgresActionGrantRepositoryV1(pool, {
        schema: scope.schema,
        tenantId: scope.tenantId,
        gatewayId: "gateway:import",
      }),
  );
  await pool.end();
});

const integration = process.env.AGENTPLAT_POSTGRES_TEST === "1";

test(
  "PostgreSQL repositories preserve scope, CAS and durable chains",
  { skip: !integration },
  async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const schema = `collective_${randomUUID().replaceAll("-", "")}`;
    const scope = {
      schema,
      tenantId: "tenant:postgres",
      policyDomainId: "policy-domain:postgres",
    };
    try {
      const migrated = await runMigrations(pool, {
        schema,
        createSchema: true,
      });
      assert.equal(migrated.currentVersion, 1);
      assert.equal((await runMigrations(pool, { schema })).currentVersion, 1);
      assert.equal(
        (await getMigrationStatus(pool, { schema })).pendingVersions.length,
        0,
      );

      const authority = new PostgresCollectiveAuthorityRepositoryV1(
        pool,
        scope,
      );
      const authorityState = createCollectiveAuthorityStateV1(scope);
      assert.equal(await authority.initialize(authorityState), "initialized");
      assert.equal(await authority.initialize(authorityState), "existing");
      assert.equal(
        (await authority.read()).stateDigest,
        authorityState.stateDigest,
      );
      const mandateA = mandate("a");
      const mandateB = mandate("b");
      const nextA = acceptDelegationMandateV1(
        authorityState,
        acceptance(mandateA),
      );
      const nextB = acceptDelegationMandateV1(
        authorityState,
        acceptance(mandateB),
      );
      assert.equal(nextA.accepted && nextB.accepted, true);
      const authorityRaces = await Promise.all([
        authority.compareAndSwap({
          expectedGeneration: authorityState.generation,
          expectedStateDigest: authorityState.stateDigest,
          nextState: nextA.state,
        }),
        authority.compareAndSwap({
          expectedGeneration: authorityState.generation,
          expectedStateDigest: authorityState.stateDigest,
          nextState: nextB.state,
        }),
      ]);
      assert.deepEqual(authorityRaces.sort(), [false, true]);
      assert.equal((await authority.read()).mandates.length, 1);
      assert.equal(
        Number(
          (
            await pool.query(
              `SELECT count(*)::int AS count FROM "${schema}".collective_mandates`,
            )
          ).rows[0].count,
        ),
        1,
      );

      const execution = new PostgresCollectiveExecutionRepositoryV1(
        pool,
        scope,
      );
      const executionState = createCollectiveExecutionStateV1(scope);
      assert.equal(await execution.initialize(executionState), "initialized");
      assert.equal(
        (await execution.read()).stateDigest,
        executionState.stateDigest,
      );

      const foreignExecution = new PostgresCollectiveExecutionRepositoryV1(
        pool,
        {
          ...scope,
          tenantId: "tenant:foreign",
        },
      );
      await assert.rejects(foreignExecution.read(), /state_missing/u);

      const grants = new PostgresActionGrantRepositoryV1(pool, {
        schema,
        tenantId: scope.tenantId,
        gatewayId: "gateway:postgres",
      });
      const grant = actionGrant();
      const issued = await Promise.all(
        Array.from({ length: 8 }, () => issueActionGrantV1(grants, grant)),
      );
      assert.equal(new Set(issued.map((record) => record.grantId)).size, 1);
      assert.equal(
        (
          await getCollectiveRollbackReadinessV1(pool, {
            ...scope,
            gatewayId: grants.gatewayId,
          })
        ).ready,
        false,
      );
      const next = { ...grant, stateGeneration: 2, status: "expired" };
      const cas = await grants.compareAndSwapGrant({
        grantId: grant.grantId,
        expectedStateGeneration: 1,
        expectedGrantDigest: controlDigest("grant", grant),
        nextGrant: next,
        nextIdempotency: {
          schemaVersion: 1,
          scopeDigest: next.scopeDigest,
          idempotencyKey: next.idempotencyKey,
          actionDigest: next.actionDigest,
          grantId: next.grantId,
          retainedOutcome: next.status,
        },
      });
      assert.equal(cas.status, "updated");
      assert.equal((await grants.loadGrant(grant.grantId)).status, "expired");

      const evidence = new PostgresCollectiveEvidenceSinkV1(pool, scope);
      const first = decisionRecord(null, "record:one");
      assert.equal((await evidence.append(first)).code, "appended");
      assert.equal((await evidence.append(first)).code, "duplicate");
      const second = decisionRecord(first.recordDigest, "record:two");
      assert.equal((await evidence.append(second)).code, "appended");
      assert.deepEqual(await evidence.anchor(), {
        schemaVersion: 1,
        tenantId: scope.tenantId,
        policyDomainId: scope.policyDomainId,
        recordCount: 2,
        latestRecordDigest: second.recordDigest,
      });
      assert.equal(
        (await verifyCollectiveEvidenceChainV1(pool, scope)).valid,
        true,
      );

      const readiness = await getCollectiveRollbackReadinessV1(pool, {
        ...scope,
        gatewayId: grants.gatewayId,
      });
      assert.equal(readiness.ready, true);
      await pool.query(
        `UPDATE "${schema}".collective_action_grants SET status='indeterminate'
        WHERE tenant_id=$1 AND gateway_id=$2 AND grant_id=$3`,
        [scope.tenantId, grants.gatewayId, grant.grantId],
      );
      const indeterminateReadiness = await getCollectiveRollbackReadinessV1(
        pool,
        { ...scope, gatewayId: grants.gatewayId },
      );
      assert.equal(indeterminateReadiness.ready, false);
      assert.equal(indeterminateReadiness.indeterminateRecords, 1);
      await assert.rejects(
        pruneCollectiveEvidenceBeforeV1(pool, {
          ...scope,
          gatewayId: grants.gatewayId,
          retainFromSequence: 2,
        }),
        /collective_retention_not_ready/u,
      );
      await pool.query(
        `UPDATE "${schema}".collective_action_grants SET status='expired'
        WHERE tenant_id=$1 AND gateway_id=$2 AND grant_id=$3`,
        [scope.tenantId, grants.gatewayId, grant.grantId],
      );
      assert.equal(
        (
          await verifyCollectiveRepositoryIntegrityV1(pool, {
            ...scope,
            gatewayId: grants.gatewayId,
          })
        ).valid,
        true,
      );
      await pool.query(
        `UPDATE "${schema}".collective_action_grants SET status='failed'
        WHERE tenant_id=$1 AND gateway_id=$2 AND grant_id=$3`,
        [scope.tenantId, grants.gatewayId, grant.grantId],
      );
      assert.equal(
        (
          await getCollectiveRollbackReadinessV1(pool, {
            ...scope,
            gatewayId: grants.gatewayId,
          })
        ).ready,
        false,
      );
      await pool.query(
        `UPDATE "${schema}".collective_action_grants SET status='expired'
        WHERE tenant_id=$1 AND gateway_id=$2 AND grant_id=$3`,
        [scope.tenantId, grants.gatewayId, grant.grantId],
      );

      const faultScope = {
        schema,
        tenantId: "tenant:postgres:fault",
        policyDomainId: "policy-domain:postgres:fault",
      };
      const faultInitial = createCollectiveAuthorityStateV1(faultScope);
      const faultMandate = mandate("fault", faultScope);
      const faultNext = acceptDelegationMandateV1(
        faultInitial,
        acceptance(faultMandate),
      );
      const authorityFaultPool = faultingPool(
        pool,
        "collective_mandates",
        "before",
      );
      const faultAuthority = new PostgresCollectiveAuthorityRepositoryV1(
        authorityFaultPool,
        faultScope,
      );
      await assert.rejects(
        faultAuthority.initialize(faultNext.state),
        /injected_database_fault/u,
      );
      const recoveredAuthority = new PostgresCollectiveAuthorityRepositoryV1(
        pool,
        faultScope,
      );
      await assert.rejects(recoveredAuthority.read(), /state_missing/u);
      assert.equal(
        await recoveredAuthority.initialize(faultNext.state),
        "initialized",
      );

      const responseLossPool = faultingPool(pool, "COMMIT", "after");
      const responseLossRepository = new PostgresActionGrantRepositoryV1(
        responseLossPool,
        {
          schema,
          tenantId: scope.tenantId,
          gatewayId: "gateway:response-loss",
        },
      );
      await assert.rejects(
        issueActionGrantV1(
          responseLossRepository,
          actionGrant("response-loss"),
        ),
        /injected_database_fault/u,
      );
      const recoveredGrants = new PostgresActionGrantRepositoryV1(pool, {
        schema,
        tenantId: scope.tenantId,
        gatewayId: "gateway:response-loss",
      });
      assert.equal(
        (
          await issueActionGrantV1(
            recoveredGrants,
            actionGrant("response-loss"),
          )
        ).grantId,
        "grant:postgres:response-loss",
      );

      const evidenceFaultScope = {
        schema,
        tenantId: "tenant:postgres:evidence-fault",
        policyDomainId: "policy-domain:postgres:evidence-fault",
      };
      const evidenceFaultPool = faultingPool(
        pool,
        "collective_evidence_records",
        "before",
      );
      const faultEvidence = new PostgresCollectiveEvidenceSinkV1(
        evidenceFaultPool,
        evidenceFaultScope,
      );
      await assert.rejects(
        faultEvidence.append(
          decisionRecord(null, "record:fault", evidenceFaultScope),
        ),
        /injected_database_fault/u,
      );
      const recoveredEvidence = new PostgresCollectiveEvidenceSinkV1(
        pool,
        evidenceFaultScope,
      );
      assert.equal((await recoveredEvidence.anchor()).recordCount, 0);
      const pruned = await pruneCollectiveEvidenceBeforeV1(pool, {
        ...scope,
        gatewayId: grants.gatewayId,
        retainFromSequence: 2,
      });
      assert.equal(pruned.deletedRecords, 1);
      assert.equal(pruned.retainedPredecessorDigest, first.recordDigest);
      assert.deepEqual(await verifyCollectiveEvidenceChainV1(pool, scope), {
        valid: true,
        retainedRecordCount: 1,
        totalRecordCount: 2,
        retainedFromSequence: 2,
        latestRecordDigest: second.recordDigest,
      });
    } finally {
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool.end();
    }
  },
);

function actionGrant(suffix = "default") {
  const scope = {
    schemaVersion: 1,
    kind: "standalone",
    tenantId: "tenant:postgres",
    runId: "run:postgres",
    agentId: "agent:postgres",
    organizationId: null,
    workspaceId: null,
    policyId: "policy:postgres",
    policyVersion: 1,
  };
  const binding = {
    schemaVersion: 1,
    actionBindingId: "binding:postgres",
    actionBindingVersion: 1,
    namespace: "documents",
    toolId: "writer",
    operation: "create",
    dispatcherId: "dispatcher:postgres",
    dispatcherVersion: 1,
    contextResolverId: "context:postgres",
    contextResolverVersion: 1,
    fencingMode: "local_only",
    handlerDigest: controlDigest("handler-binding", { handler: "postgres" }),
  };
  const input = { title: "bounded" };
  const draft = {
    schemaVersion: 1,
    grantId: `grant:postgres:${suffix}`,
    stateGeneration: 1,
    scope,
    scopeDigest: scopeDigest(scope),
    namespace: binding.namespace,
    toolId: binding.toolId,
    operation: binding.operation,
    actionBindingId: binding.actionBindingId,
    actionBindingVersion: binding.actionBindingVersion,
    handlerDigest: binding.handlerDigest,
    inputDigest: actionInputDigest(input),
    actionDigest: controlDigest("action", { pending: true }),
    assessmentRequestId: "assessment-request:postgres",
    assessmentId: "assessment:postgres",
    assessmentTargetDigest: controlDigest("message", { target: "postgres" }),
    idempotencyKey: `idempotency:postgres:${suffix}`,
    issuedAtLogicalMs: 10,
    expiresAtLogicalMs: 1_000,
    singleUse: true,
    status: "issued",
    reservation: null,
  };
  return Object.freeze({
    ...draft,
    actionDigest: actionDigest(draft, binding),
  });
}

function decisionRecord(
  previousRecordDigest,
  recordId,
  scope = {
    tenantId: "tenant:postgres",
    policyDomainId: "policy-domain:postgres",
  },
) {
  const digest = (label) => digestCollectiveJsonV1("state", { label });
  return createCollectiveDecisionRecordV1({
    schemaVersion: 1,
    recordId,
    tenantId: scope.tenantId,
    policyDomainId: scope.policyDomainId,
    kind: "effect.reconcile",
    accepted: true,
    reasonCode: "reconciled",
    logicalTimeMs: recordId.endsWith("one") ? 20 : 21,
    mandateId: "mandate:postgres",
    mandateDigest: digest("mandate"),
    workContractId: "work:postgres",
    workContractDigest: digest("work"),
    permitId: "permit:postgres",
    permitDigest: digest("permit"),
    assignmentAuthorityId: "authority:postgres",
    assignmentEpoch: 1,
    fencingToken: "fence:postgres:1",
    budgetDeltaKind: "none",
    budgetDeltaUnits: 0,
    inputDigest: digest("input"),
    actionDigest: digest("action"),
    assessmentDigest: digest("assessment"),
    trustDecisionDigest: digest("trust"),
    previousRecordDigest,
  });
}

function mandate(
  suffix,
  scope = {
    tenantId: "tenant:postgres",
    policyDomainId: "policy-domain:postgres",
  },
) {
  const statement = {
    schemaVersion: 1,
    mandateId: `mandate:postgres:${suffix}`,
    tenantId: scope.tenantId,
    policyDomainId: scope.policyDomainId,
    issuerId: "issuer:postgres",
    revision: 1,
    predecessorDigest: null,
    subjectPeerIds: ["peer:postgres"],
    objective: {
      schemaVersion: 1,
      meshId: "mesh:postgres",
      objectiveId: "objective:postgres",
      objectiveDocumentId: "objective-document:postgres",
      minimumObjectiveRevision: 1,
      maximumObjectiveRevision: 1,
    },
    work: {
      schemaVersion: 1,
      workItemIds: [],
      permittedRoleKeys: ["executor"],
      maximumWorkItemRevision: 1,
    },
    permittedCapabilityKeys: ["documents.write"],
    permittedActions: [
      {
        schemaVersion: 1,
        namespace: "documents",
        toolId: "writer",
        operation: "create",
      },
    ],
    budget: {
      schemaVersion: 1,
      totalBudgetUnits: 100,
      maximumWorkBudgetUnits: 100,
      maximumActionBudgetUnits: 10,
      maximumConcurrentWorkReservations: 2,
      maximumConcurrentActionReservations: 2,
      reservationLifetimeMs: 1_000,
    },
    validFrom: "2026-08-01T00:00:00.000Z",
    validUntil: "2026-08-02T00:00:00.000Z",
    roomProvenance: null,
    evidence: {
      schemaVersion: 1,
      redactionPolicyId: "redaction:postgres",
      retentionClass: "standard",
      requireDurablePreDispatchEvidence: true,
    },
  };
  const mandateDigest = delegationMandateDigestV1(statement);
  return createDelegationMandateV1({
    statement,
    proof: {
      schemaVersion: 1,
      kind: "local_attestation",
      issuerId: statement.issuerId,
      attestorId: "attestor:postgres",
      attestationId: `attestation:postgres:${suffix}`,
      signedDigest: mandateDigest,
    },
  });
}

function acceptance(document) {
  return {
    mandate: document,
    verification: {
      schemaVersion: 1,
      verifierId: "verifier:postgres",
      verifierVersion: 1,
      issuerId: document.statement.issuerId,
      signedDigest: document.mandateDigest,
      verifiedAt: "2026-08-01T00:00:01.000Z",
      status: "verified",
    },
    acceptedAtLogicalMs: 1,
  };
}

function faultingPool(pool, match, timing) {
  let armed = true;
  return {
    query: pool.query.bind(pool),
    async connect() {
      const client = await pool.connect();
      return {
        async query(...args) {
          const sql = String(args[0]);
          if (armed && sql.includes(match)) {
            armed = false;
            if (timing === "before") throw new Error("injected_database_fault");
            const result = await client.query(...args);
            throw new Error("injected_database_fault");
          }
          return client.query(...args);
        },
        release(error) {
          client.release(error);
        },
      };
    },
  };
}
