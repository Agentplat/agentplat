import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createMissionIntentV1,
  createPlanSelectionPolicyV1,
  digestPlanningJsonV1,
} from '@agentplat/collective-planning';
import {
  DEFAULT_COLLECTIVE_EVALUATION_LIMITS_V1,
  createCollectiveEvaluationRegistrationBindingV1,
} from '@agentplat/collective-planning/evaluation';
import {
  createDelegationMandateV1,
  delegationMandateDigestV1,
} from '@agentplat/collective-control';
import {
  collectiveClosedLoopDefinitionDigestV1,
  createCollectiveClosedLoopDefinitionV1,
  createCollectiveClosedLoopRunResultV1,
  validateCollectiveClosedLoopDefinitionV1,
  validateCollectiveClosedLoopRunResultV1,
} from '@agentplat/mesh-sim';

const hash = (label) =>
  digestPlanningJsonV1('environment-state-v1', { label, schemaVersion: 1 });

function peersFor(count) {
  return Array.from({ length: count }, (_, index) => {
    const peerId = `peer:${String(index).padStart(3, '0')}`;
    const neighborPeerIds = [];
    if (index > 0)
      neighborPeerIds.push(`peer:${String(index - 1).padStart(3, '0')}`);
    if (index + 1 < count)
      neighborPeerIds.push(`peer:${String(index + 1).padStart(3, '0')}`);
    return {
      schemaVersion: 1,
      peerId,
      peerInstanceId: `instance:${String(index).padStart(3, '0')}`,
      capabilityKeys: ['capability.execute'],
      neighborPeerIds,
    };
  });
}

function fixture(peerCount = 3, { stratum = 'nominal' } = {}) {
  const peers = peersFor(peerCount);
  const selectionPolicy = createPlanSelectionPolicyV1({
    schemaVersion: 1,
    selectionPolicyId: 'selection-policy:closed-loop',
    revision: 1,
    scoringDimensions: [
      {
        schemaVersion: 1,
        dimension: 'outcome_coverage',
        weight: 1,
        direction: 'maximize',
      },
    ],
    hardConstraintKeys: ['budget'],
    acceptanceScoreThreshold: 1,
    challengeScoreThreshold: 0,
    tieBreakOrder: [
      'score',
      'requested_budget_units',
      'work_deadline',
      'proposed_at_logical_ms',
      'proposal_digest',
    ],
  });
  const statement = {
    schemaVersion: 1,
    mandateId: 'mandate:closed-loop',
    tenantId: 'tenant:closed-loop',
    policyDomainId: 'policy-domain:closed-loop',
    issuerId: 'issuer:closed-loop',
    revision: 1,
    predecessorDigest: null,
    subjectPeerIds: peers.map((peer) => peer.peerId),
    objective: {
      schemaVersion: 1,
      meshId: 'mesh:closed-loop',
      objectiveId: 'objective:closed-loop',
      objectiveDocumentId: 'objective-document:closed-loop',
      minimumObjectiveRevision: 1,
      maximumObjectiveRevision: 1,
    },
    work: {
      schemaVersion: 1,
      workItemIds: [],
      permittedRoleKeys: ['executor'],
      maximumWorkItemRevision: 1,
    },
    permittedCapabilityKeys: ['capability.execute'],
    permittedActions: [
      {
        schemaVersion: 1,
        namespace: 'resources',
        toolId: 'allocator',
        operation: 'commit',
      },
    ],
    budget: {
      schemaVersion: 1,
      totalBudgetUnits: 10_000,
      maximumWorkBudgetUnits: 100,
      maximumActionBudgetUnits: 10,
      maximumConcurrentWorkReservations: 500,
      maximumConcurrentActionReservations: 500,
      reservationLifetimeMs: 60_000,
    },
    validFrom: '2026-08-01T00:00:00.000Z',
    validUntil: '2026-08-03T00:00:00.000Z',
    roomProvenance: null,
    evidence: {
      schemaVersion: 1,
      redactionPolicyId: 'redaction:closed-loop',
      retentionClass: 'evaluation',
      requireDurablePreDispatchEvidence: true,
    },
  };
  const mandateDigest = delegationMandateDigestV1(statement);
  const mandate = createDelegationMandateV1({
    statement,
    proof: {
      schemaVersion: 1,
      kind: 'local_attestation',
      issuerId: statement.issuerId,
      attestorId: 'attestor:closed-loop',
      attestationId: `attestation:${mandateDigest.slice(-16)}`,
      signedDigest: mandateDigest,
    },
  });
  const missionIntent = createMissionIntentV1({
    schemaVersion: 1,
    missionIntentId: 'mission:closed-loop',
    revision: 1,
    predecessorDigest: null,
    tenantId: statement.tenantId,
    policyDomainId: statement.policyDomainId,
    objective: {
      schemaVersion: 1,
      meshId: statement.objective.meshId,
      objectiveId: statement.objective.objectiveId,
      objectiveDocumentId: statement.objective.objectiveDocumentId,
      objectiveRevision: 1,
      acceptedPolicyDigest: hash('objective-policy'),
    },
    mandateDigest: mandate.mandateDigest,
    outcomeStatements: ['outcome.complete'],
    permittedResourceClasses: ['resource.compute'],
    permittedCapabilityKeys: ['capability.execute'],
    planningLimits: {
      schemaVersion: 1,
      maximumCandidateFragments: 8,
      maximumActiveFragments: 4,
      maximumFragmentsPerPeer: 4,
      maximumRevisionsPerSemanticSlot: 8,
      maximumDependencyDepth: 4,
      maximumDependencyFanout: 2,
      maximumCapabilityTerms: 4,
      maximumOutcomeTerms: 4,
      maximumProposalBytes: 16_384,
      maximumSnapshotBytes: 131_072,
      maximumTraceBytes: 131_072,
      maximumTotalPlanningBudgetUnits: 1_000,
      maximumFragmentBudgetUnits: 100,
      budgetShardPolicy: 'equal_mandate_subjects',
      maximumConcurrentProposals: 4,
      maximumActiveRoles: 4,
      proposalLogicalWindowMs: 20,
      observationLogicalWindowMs: 20,
      replanningLogicalWindowMs: 20,
    },
    selectionPolicyDigest: selectionPolicy.policyDigest,
    validFrom: '2026-08-01T01:00:00.000Z',
    validUntil: '2026-08-02T00:00:00.000Z',
  });
  const registration = createCollectiveEvaluationRegistrationBindingV1({
    schemaVersion: 1,
    registrationId: 'registration:closed-loop',
    registrationDigest: hash('registration'),
    tenantId: missionIntent.tenantId,
    missionIntentId: missionIntent.missionIntentId,
    intentRevision: missionIntent.revision,
    intentDigest: missionIntent.intentDigest,
    runner: 'adaptive_collective',
    stratum,
    seed: 7,
    environmentDigest: hash('environment'),
    observationPolicyDigest: hash('observation-policy'),
    monitorDigest: hash('monitor'),
    hiddenCanaryDigest: hash('hidden-canary'),
    limits: DEFAULT_COLLECTIVE_EVALUATION_LIMITS_V1,
  });
  return {
    schemaVersion: 1,
    registration,
    missionIntent,
    selectionPolicy,
    mandate,
    peers,
    maximumLogicalTimeMs: 60_000,
  };
}

function definitionBody(definition) {
  const { definitionDigest: _definitionDigest, ...body } = definition;
  return structuredClone(body);
}

function runBody() {
  return {
    schemaVersion: 1,
    registrationBindingDigest: hash('binding'),
    runner: 'adaptive_collective',
    stopReason: 'plan_completed',
    finalLogicalTimeMs: 42,
    planningStateRoots: [hash('planning-root')],
    meshStateRoots: [hash('mesh-root')],
    governanceStateRoots: [hash('governance-root')],
    publicArtifacts: [{ kind: 'summary', completed: true }],
  };
}

test('closed-loop definitions are nominal-only, deterministic, and idempotent', () => {
  const body = fixture();
  const first = createCollectiveClosedLoopDefinitionV1(body);
  const second = createCollectiveClosedLoopDefinitionV1(structuredClone(body));

  assert.deepEqual(second, first);
  assert.equal(
    collectiveClosedLoopDefinitionDigestV1(body),
    first.definitionDigest,
  );
  assert.deepEqual(
    validateCollectiveClosedLoopDefinitionV1(structuredClone(first)),
    first,
  );
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.peers));

  assert.throws(
    () => createCollectiveClosedLoopDefinitionV1(fixture(3, { stratum: 'benign' })),
    /nominal runs only/,
  );
});

test('closed-loop definitions accept the executable 3..500 peer scale', () => {
  assert.equal(createCollectiveClosedLoopDefinitionV1(fixture(3)).peers.length, 3);
  assert.equal(
    createCollectiveClosedLoopDefinitionV1(fixture(100)).peers.length,
    100,
  );
  assert.throws(
    () => createCollectiveClosedLoopDefinitionV1(fixture(501)),
    /peer count is invalid/,
  );
  assert.throws(
    () => createCollectiveClosedLoopDefinitionV1(fixture(2)),
    /peer count is invalid/,
  );
});

test('closed-loop topology is local, known, self-free, and symmetric', () => {
  const unknown = fixture();
  unknown.peers[0].neighborPeerIds = ['peer:unknown'];
  assert.throws(
    () => createCollectiveClosedLoopDefinitionV1(unknown),
    /known and symmetric/,
  );

  const asymmetric = fixture();
  asymmetric.peers[1].neighborPeerIds = ['peer:002'];
  assert.throws(
    () => createCollectiveClosedLoopDefinitionV1(asymmetric),
    /known and symmetric/,
  );

  const selfNeighbor = fixture();
  selfNeighbor.peers[0].neighborPeerIds = ['peer:000'];
  assert.throws(
    () => createCollectiveClosedLoopDefinitionV1(selfNeighbor),
    /own neighbor/,
  );
});

test('definition validation rejects extensions, accessors, prototypes, and external scopes', () => {
  const body = fixture();
  assert.throws(
    () => createCollectiveClosedLoopDefinitionV1({ ...body, extra: true }),
    /invalid shape/,
  );
  assert.throws(
    () =>
      createCollectiveClosedLoopDefinitionV1({
        ...body,
        runner: 'adaptive_collective',
      }),
    /invalid shape/,
  );
  assert.throws(
    () => createCollectiveClosedLoopDefinitionV1({ ...body, stratum: 'nominal' }),
    /invalid shape/,
  );
  assert.throws(
    () => createCollectiveClosedLoopDefinitionV1({ ...body, faultPlan: [] }),
    /invalid shape/,
  );

  let getterCalls = 0;
  const accessor = structuredClone(body);
  Object.defineProperty(accessor, 'maximumLogicalTimeMs', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 60_000;
    },
  });
  assert.throws(
    () => createCollectiveClosedLoopDefinitionV1(accessor),
    /enumerable data properties/,
  );
  assert.equal(getterCalls, 0);

  const inherited = structuredClone(body);
  Object.setPrototypeOf(inherited, { injected: true });
  assert.throws(
    () => createCollectiveClosedLoopDefinitionV1(inherited),
    /invalid shape/,
  );
});

test('definition validation rejects digest and authority tampering', () => {
  const definition = createCollectiveClosedLoopDefinitionV1(fixture());
  assert.throws(
    () =>
      validateCollectiveClosedLoopDefinitionV1({
        ...definition,
        definitionDigest: hash('tampered-definition'),
      }),
    /definition digest is invalid/,
  );

  const widened = definitionBody(definition);
  widened.peers[0].capabilityKeys = ['capability.admin'];
  assert.throws(
    () => createCollectiveClosedLoopDefinitionV1(widened),
    /widens the mission intent/,
  );
});

test('run results are deterministic, immutable, and contain no verdict or ledger', () => {
  const body = runBody();
  const first = createCollectiveClosedLoopRunResultV1(body);
  const second = createCollectiveClosedLoopRunResultV1(structuredClone(body));

  assert.deepEqual(second, first);
  assert.deepEqual(
    validateCollectiveClosedLoopRunResultV1(structuredClone(first)),
    first,
  );
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.publicArtifacts));
  assert.equal(Object.hasOwn(first, 'missionSuccess'), false);
  assert.equal(Object.hasOwn(first, 'ledger'), false);
  assert.equal(Object.hasOwn(first, 'violations'), false);

  for (const forbidden of ['missionSuccess', 'ledger', 'violations']) {
    assert.throws(
      () =>
        createCollectiveClosedLoopRunResultV1({
          ...body,
          [forbidden]: forbidden === 'missionSuccess' ? true : [],
        }),
      /invalid shape/,
    );
  }
});

test('run results reject unsupported runners and hostile object shapes', () => {
  assert.throws(
    () =>
      createCollectiveClosedLoopRunResultV1({
        ...runBody(),
        runner: 'direct_assignment',
      }),
    /runner is invalid/,
  );

  let getterCalls = 0;
  const accessor = runBody();
  Object.defineProperty(accessor, 'finalLogicalTimeMs', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 42;
    },
  });
  assert.throws(
    () => createCollectiveClosedLoopRunResultV1(accessor),
    /enumerable data properties/,
  );
  assert.equal(getterCalls, 0);

  const inherited = runBody();
  Object.setPrototypeOf(inherited, { injected: true });
  assert.throws(
    () => createCollectiveClosedLoopRunResultV1(inherited),
    /invalid shape/,
  );
});
