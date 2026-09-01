import assert from "node:assert/strict";
import test from "node:test";

import {
  PostgresMorphogenesisExecutionStoreV1,
  PostgresMorphologyHeadStoreV1,
} from "../dist/morphogenesis.js";
import {
  MorphogenesisExecutionRuntimeV1,
  InMemoryMorphologyHeadStoreV1,
  createInitialMorphologyHeadV1,
  createMorphogenesisBudgetEnvelopeV1,
  createMorphogenesisBudgetReservationRequestV1,
  createMorphogenesisBudgetReservationV1,
  createMorphogenesisDecisionAuthorizationV1,
  createMorphogenesisDecisionBindingV1,
  createMorphogenesisDecisionCandidateV1,
  createMorphogenesisPolicyV1,
  createMorphogenesisScopeV1,
  createMorphogenesisCandidateSearchRequestV1,
  createSuccessorMorphologyHeadV1,
} from "@agentplat/collective-runtime/morphogenesis";

const sha = (character) => `sha256:${character.repeat(64)}`;

class FakePool {
  rows = new Map();
  async query(sql, params) {
    const key = `${params[0]}:${params[1]}:${params[2]}`;
    if (sql.includes("SELECT revision")) {
      const row = this.rows.get(key);
      return { rowCount: row ? 1 : 0, rows: row ? [structuredClone(row)] : [] };
    }
    if (sql.includes("INSERT INTO")) {
      if (this.rows.has(key)) return { rowCount: 0, rows: [] };
      this.rows.set(key, {
        revision: params[3],
        logical_time_high_water_ms: params[4],
        state_digest: params[5],
        state: JSON.parse(params[6]),
      });
      return { rowCount: 1, rows: [] };
    }
    if (sql.includes("UPDATE")) {
      const row = this.rows.get(key);
      if (
        !row ||
        Number(row.revision) !== params[3] ||
        row.state_digest !== params[4] ||
        Number(row.logical_time_high_water_ms) > params[6]
      )
        return { rowCount: 0, rows: [] };
      this.rows.set(key, {
        revision: params[5],
        logical_time_high_water_ms: params[6],
        state_digest: params[7],
        state: JSON.parse(params[8]),
      });
      return { rowCount: 1, rows: [] };
    }
    throw new Error(`unexpected SQL: ${sql}`);
  }
}

class Witness {
  heads = new Map();
  async verify(input) {
    const value = this.heads.get(
      `${input.scopeId}:${input.stateKind}:${input.stateKey}`,
    );
    return Boolean(
      value && value.revision === input.revision && value.digest === input.digest,
    );
  }
  async record(input) {
    const key = `${input.scopeId}:${input.stateKind}:${input.stateKey}`;
    const current = this.heads.get(key);
    if (
      (input.previousRevision === null && current) ||
      (input.previousRevision !== null &&
        (!current ||
          current.revision !== input.previousRevision ||
          current.digest !== input.previousDigest))
    )
      return false;
    this.heads.set(key, {
      revision: input.nextRevision,
      digest: input.nextDigest,
    });
    return true;
  }
}

async function runHeadStoreConformance(open, stateKey) {
  const store = open();
  const initial = createInitialMorphologyHeadV1({
    stateKey,
    scopeDigest: sha("c"),
    policyDigest: sha("d"),
    morphologyEpoch: 1,
    snapshotDigest: sha("e"),
    logicalTimeMs: 10,
  });
  assert.equal(
    await store.save({
      head: initial,
      expectedRevision: null,
      expectedHeadDigest: null,
    }),
    true,
  );
  const successor = createSuccessorMorphologyHeadV1({
    current: initial,
    commit: {
      stateKey,
      scopeDigest: initial.scopeDigest,
      policyDigest: initial.policyDigest,
      expectedMorphologyEpoch: 1,
      snapshotDigest: sha("f"),
      proposalDigest: sha("0"),
      decisionDigest: sha("1"),
      receiptDigest: sha("2"),
      logicalTimeMs: 20,
    },
  });
  assert.equal(
    await store.save({
      head: successor,
      expectedRevision: initial.revision,
      expectedHeadDigest: initial.headDigest,
    }),
    true,
  );
  assert.equal((await open().load(stateKey)).headDigest, successor.headDigest);
}

test("memory and PostgreSQL morphology heads pass the same CAS conformance", async () => {
  const memory = new InMemoryMorphologyHeadStoreV1();
  await runHeadStoreConformance(() => memory, "head:memory-conformance");
  const pool = new FakePool();
  const witness = new Witness();
  await runHeadStoreConformance(
    () =>
      new PostgresMorphologyHeadStoreV1(pool, {
        scopeId: "scope:postgres-conformance",
        rollbackWitness: witness,
      }),
    "head:postgres-conformance",
  );
});

test("PostgreSQL morphology stores preserve CAS and validate a reopened head", async () => {
  const pool = new FakePool();
  const witness = new Witness();
  const options = {
    scopeId: "tenant:morphogenesis",
    schema: "agentplat",
    rollbackWitness: witness,
  };
  const store = new PostgresMorphologyHeadStoreV1(pool, options);
  const initial = createInitialMorphologyHeadV1({
    stateKey: "morphology-head:postgres",
    scopeDigest: sha("1"),
    policyDigest: sha("2"),
    morphologyEpoch: 1,
    snapshotDigest: sha("3"),
    logicalTimeMs: 100,
  });
  assert.equal(
    await store.save({
      head: initial,
      expectedRevision: null,
      expectedHeadDigest: null,
    }),
    true,
  );
  const successor = createSuccessorMorphologyHeadV1({
    current: initial,
    commit: {
      stateKey: initial.stateKey,
      scopeDigest: initial.scopeDigest,
      policyDigest: initial.policyDigest,
      expectedMorphologyEpoch: 1,
      snapshotDigest: sha("4"),
      proposalDigest: sha("5"),
      decisionDigest: sha("6"),
      receiptDigest: sha("7"),
      logicalTimeMs: 110,
    },
  });
  assert.equal(
    await store.save({
      head: successor,
      expectedRevision: initial.revision,
      expectedHeadDigest: initial.headDigest,
    }),
    true,
  );
  const reopened = new PostgresMorphologyHeadStoreV1(pool, options);
  assert.equal((await reopened.load(initial.stateKey)).headDigest, successor.headDigest);
  const conflictingSuccessor = createSuccessorMorphologyHeadV1({
    current: initial,
    commit: {
      stateKey: initial.stateKey,
      scopeDigest: initial.scopeDigest,
      policyDigest: initial.policyDigest,
      expectedMorphologyEpoch: 1,
      snapshotDigest: sha("8"),
      proposalDigest: sha("9"),
      decisionDigest: sha("a"),
      receiptDigest: sha("b"),
      logicalTimeMs: 111,
    },
  });
  assert.equal(
    await reopened.save({
      head: conflictingSuccessor,
      expectedRevision: 0,
      expectedHeadDigest: initial.headDigest,
    }),
    false,
  );
  witness.heads.clear();
  await assert.rejects(
    reopened.load(initial.stateKey),
    /rollback witness diverged/,
  );
});

test("PostgreSQL execution store reopens a validated guarded record", async () => {
  const pool = new FakePool();
  const witness = new Witness();
  const options = {
    scopeId: "tenant:execution",
    rollbackWitness: witness,
  };
  const scope = createMorphogenesisScopeV1({
    tenantId: "tenant:test",
    morphologyId: "morphology:test",
    policyDomainId: "policy-domain:test",
    missionId: "mission:test",
    missionIntentId: "mission-intent:test",
    objectiveId: "objective:test",
    meshId: "mesh:test",
    roomId: null,
    workItemId: "work:test",
    workItemRevision: 1,
  });
  const policy = createMorphogenesisPolicyV1({
    schemaVersion: 1,
    policyId: "policy:test",
    policyVersion: 1,
    parentPolicyDigest: null,
    requiredSourceClasses: ["mission"],
    allowedOperators: ["recruit_existing"],
    allowedDecisionRoutes: ["authorized_agent"],
    requireIndependentDecider: true,
    allowAgentCreation: false,
    maximumPopulation: 8,
    maximumNewAgentsPerProposal: 0,
    maximumResourceUnitsPerProposal: 100,
    minimumNeedSeverityBps: 1,
    limits: {
      maximumSourceHeads: 8,
      maximumComponents: 16,
      maximumPositions: 8,
      maximumAgentDispositions: 8,
      maximumOperations: 8,
      maximumDependenciesPerOperation: 4,
      maximumEvidenceDigests: 8,
      maximumInvariantDigests: 8,
      maximumProposalTtlMs: 1_000,
      maximumNeedTtlMs: 1_000,
      maximumSourceFreshnessMs: 1_000,
      maximumCommitAttempts: 4,
      maximumTransformationsPerWindow: 4,
      transformationWindowMs: 10_000,
      cooldownMs: 0,
      hysteresisBps: 0,
    },
  });
  const budget = createMorphogenesisBudgetEnvelopeV1({
    maximumActiveAgents: 2,
    maximumNewAgents: 0,
    maximumConcurrentProvisioning: 0,
    maximumResourceUnits: 10,
    maximumInteractionUnits: 10,
    maximumActionUnits: 10,
    maximumInputTokens: 10,
    maximumOutputTokens: 10,
    maximumTotalTokens: 20,
    maximumDurationMs: 1_000,
    maximumCosts: [],
  });
  const proposal = {
    schemaVersion: 1,
    proposalId: "proposal:test",
    scopeDigest: scope.scopeDigest,
    currentSnapshotDigest: sha("1"),
    expectedCurrentEpoch: 1,
    needDigest: sha("2"),
    targetDigest: sha("3"),
    operations: [
      {
        schemaVersion: 1,
        operationId: "operation:recruit",
        operator: "recruit_existing",
        effectClass: "internal",
        dependsOnOperationIds: [],
        targetReferenceDigest: sha("4"),
        compensation: "none",
        operationDigest: sha("5"),
      },
    ],
    processDefinitionDigest: sha("6"),
    budget,
    decisionRoute: "authorized_agent",
    proposerId: "agent:planner",
    proposerVersion: 1,
    proposerImplementationDigest: sha("7"),
    proposedAtLogicalMs: 100,
    expiresAtLogicalMs: 500,
    proposalDigest: sha("8"),
    advisoryOnly: true,
  };
  const candidate = createMorphogenesisDecisionCandidateV1({
    candidateId: "candidate:test",
    proposal,
    policy,
    membershipConfigurationDigest: sha("9"),
    membershipEpoch: 1,
    authorityId: "authority:test",
    authorityEpoch: 1,
    workContractDigest: sha("a"),
    preparedAtLogicalMs: 110,
    expiresAtLogicalMs: 490,
  });
  const authorization = createMorphogenesisDecisionAuthorizationV1({
    authorizationId: "authorization:test",
    candidateDigest: candidate.candidateDigest,
    route: "authorized_agent",
    actorType: "agent",
    actorId: "agent:supervisor",
    actorMandateDigest: sha("b"),
    independenceGroupId: "independence:test",
    disposition: "approved",
    proofDigest: sha("c"),
    issuedAtLogicalMs: 120,
    expiresAtLogicalMs: 480,
  });
  const decision = createMorphogenesisDecisionBindingV1({
    decisionId: "decision:test",
    candidate,
    authorization,
    decisionPortId: "decision-port:test",
    decisionPortVersion: 1,
    decisionPortImplementationDigest: sha("d"),
    decidedAtLogicalMs: 130,
  });
  const budgetRequest = createMorphogenesisBudgetReservationRequestV1({
    reservationId: "reservation:test",
    scopeDigest: scope.scopeDigest,
    proposalDigest: proposal.proposalDigest,
    expectedMorphologyEpoch: 1,
    operationId: "budget-operation:test",
    budget,
    reservedAtLogicalMs: 120,
    expiresAtLogicalMs: 500,
  });
  const reservation = createMorphogenesisBudgetReservationV1({
    request: budgetRequest,
    status: "reserved",
    closedAtLogicalMs: null,
    closeOperationId: null,
    closeReasonCode: null,
  });
  const searchRequest = createMorphogenesisCandidateSearchRequestV1({
    requestId: "search:test",
    scopeDigest: scope.scopeDigest,
    positionDigest: sha("e"),
    requiredCapabilityKeys: ["research"],
    membershipConfigurationDigest: sha("9"),
    membershipEpoch: 1,
    viewId: "view:test",
    viewDigest: sha("f"),
    searchLimit: 8,
    requestedAtLogicalMs: 100,
    expiresAtLogicalMs: 500,
  });
  const store = new PostgresMorphogenesisExecutionStoreV1(pool, options);
  const runtime = new MorphogenesisExecutionRuntimeV1({
    discovery: { async search() { throw new Error("unused"); } },
    profiles: { async resolve() { return null; } },
    lifecycle: {},
    attestation: {},
    teams: {},
    morphology: {},
    continuity: {},
    authority: {},
    detachment: {},
    retirement: {},
    budgets: {},
    store,
    maximumCommitAttempts: 4,
  });
  const record = await runtime.initialize({
    stateKey: "execution:postgres",
    scope,
    proposalDigest: proposal.proposalDigest,
    targetDigest: proposal.targetDigest,
    decision,
    budgetReservation: reservation,
    morphologyHeadStateKey: "head:postgres",
    expectedMorphologyEpoch: 1,
    resultingSnapshotDigest: sha("0"),
    positionDigest: searchRequest.positionDigest,
    requiredCapabilityKeys: searchRequest.requiredCapabilityKeys,
    searchRequest,
    profile: null,
    profileCertificationDigest: null,
    logicalTimeMs: 140,
  });
  const reopened = new PostgresMorphogenesisExecutionStoreV1(pool, options);
  assert.equal((await reopened.load(record.stateKey)).recordDigest, record.recordDigest);
});
