import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  CollectivePlanningValidationError,
  assertMissionIntentRevisionV1,
  assertSnapshotHighWatersNotLoweredV1,
  canonicalizePlanningJsonV1,
  createAdaptiveRoleBindingV1,
  createCollectivePlanningSnapshotV1,
  createMissionIntentV1,
  createMissionObservationV1,
  createPlanFragmentDecisionV1,
  createPlanFragmentProposalV1,
  createPlanFragmentV1,
  createPlanSelectionPolicyV1,
  createPlanViewV1,
  deepFreezePlanning,
  derivePlanFragmentProposalIdV1,
  digestPlanningJsonV1,
  planningUtf8ByteLengthV1,
  sha256HexPlanningV1,
  validateAdaptiveRoleBindingV1,
  validateCollectivePlanningSnapshotV1,
  validateMissionIntentV1,
  validateMissionObservationV1,
  validatePlanFragmentDecisionV1,
  validatePlanFragmentProposalV1,
  validatePlanFragmentV1,
  validatePlanSelectionPolicyV1,
  validatePlanViewV1,
} from '@agentplat/collective-planning';

const digest = (domain, label) =>
  digestPlanningJsonV1(domain, { label, schemaVersion: 1 });

const oneOver = (value) => value + 1;

function assertDeepFrozen(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeepFrozen(child, seen);
}

function assertRejectsWithoutInvoking(run, invocationCount) {
  assert.throws(run, CollectivePlanningValidationError);
  assert.equal(invocationCount(), 0);
}

function planningLimits(overrides = {}) {
  return {
    schemaVersion: 1,
    maximumCandidateFragments: 16,
    maximumActiveFragments: 8,
    maximumFragmentsPerPeer: 8,
    maximumRevisionsPerSemanticSlot: 4,
    maximumDependencyDepth: 4,
    maximumDependencyFanout: 4,
    maximumCapabilityTerms: 4,
    maximumOutcomeTerms: 4,
    maximumProposalBytes: 16_384,
    maximumSnapshotBytes: 131_072,
    maximumTraceBytes: 262_144,
    maximumTotalPlanningBudgetUnits: 1_000,
    maximumFragmentBudgetUnits: 250,
    budgetShardPolicy: 'equal_mandate_subjects',
    maximumConcurrentProposals: 4,
    maximumActiveRoles: 4,
    proposalLogicalWindowMs: 60_000,
    observationLogicalWindowMs: 60_000,
    replanningLogicalWindowMs: 120_000,
    ...overrides,
  };
}

function selectionPolicy(overrides = {}) {
  return createPlanSelectionPolicyV1({
    schemaVersion: 1,
    selectionPolicyId: 'selection-policy:alpha',
    revision: 1,
    scoringDimensions: [
      {
        schemaVersion: 1,
        dimension: 'bounded_risk',
        weight: 1,
        direction: 'minimize',
      },
      {
        schemaVersion: 1,
        dimension: 'budget_efficiency',
        weight: 2,
        direction: 'maximize',
      },
      {
        schemaVersion: 1,
        dimension: 'capability_confidence',
        weight: 3,
        direction: 'maximize',
      },
      {
        schemaVersion: 1,
        dimension: 'deadline_margin',
        weight: 2,
        direction: 'maximize',
      },
      {
        schemaVersion: 1,
        dimension: 'dependency_readiness',
        weight: 3,
        direction: 'maximize',
      },
      {
        schemaVersion: 1,
        dimension: 'outcome_coverage',
        weight: 4,
        direction: 'maximize',
      },
    ],
    hardConstraintKeys: ['budget', 'capability', 'deadline'],
    acceptanceScoreThreshold: 700,
    challengeScoreThreshold: 400,
    tieBreakOrder: [
      'score',
      'requested_budget_units',
      'work_deadline',
      'proposed_at_logical_ms',
      'proposal_digest',
    ],
    ...overrides,
  });
}

function missionIntent(policy = selectionPolicy(), overrides = {}) {
  return createMissionIntentV1({
    schemaVersion: 1,
    missionIntentId: 'mission-intent:alpha',
    revision: 1,
    predecessorDigest: null,
    tenantId: 'tenant:alpha',
    policyDomainId: 'policy-domain:alpha',
    objective: {
      schemaVersion: 1,
      meshId: 'mesh:alpha',
      objectiveId: 'objective:alpha',
      objectiveDocumentId: 'objective-document:alpha',
      objectiveRevision: 1,
      acceptedPolicyDigest: digest('mission-intent', 'objective-policy'),
    },
    mandateDigest: digest('mission-intent', 'mandate'),
    outcomeStatements: ['Map the bounded area', 'Report verified findings'],
    permittedResourceClasses: ['compute', 'sensor'],
    permittedCapabilityKeys: ['capability.map', 'capability.observe'],
    planningLimits: planningLimits(),
    selectionPolicyDigest: policy.policyDigest,
    validFrom: '2026-08-01T00:00:00.000Z',
    validUntil: '2026-08-02T00:00:00.000Z',
    ...overrides,
  });
}

function missionObservation(intent, overrides = {}) {
  return createMissionObservationV1({
    schemaVersion: 1,
    observationId: 'observation:alpha:1',
    missionIntentId: intent.missionIntentId,
    intentRevision: intent.revision,
    intentDigest: intent.intentDigest,
    observerPeerId: 'peer:alpha',
    observerInstanceId: 'instance:alpha:1',
    environmentCursor: 'environment-cursor:1',
    logicalTimeMs: 100,
    visibility: 'resource',
    observationKind: 'resource.available',
    publicValue: { resourceClass: 'sensor', zone: 'north' },
    contentReferenceDigest: null,
    ...overrides,
  });
}

function fragmentProposal(intent, observation, overrides = {}) {
  return createPlanFragmentProposalV1({
    schemaVersion: 1,
    proposalRevision: 1,
    missionIntentId: intent.missionIntentId,
    intentRevision: intent.revision,
    intentDigest: intent.intentDigest,
    proposerPeerId: observation.observerPeerId,
    proposerInstanceId: observation.observerInstanceId,
    semanticSlotKey: 'slot.map.north',
    predecessorFragmentDigest: null,
    parentFragmentDigests: [],
    dependencyFragmentDigests: [],
    outcomeStatements: ['Map the bounded area'],
    roleKey: 'mapper',
    requiredCapabilityKeys: ['capability.map'],
    inputReferenceDigest: digest('plan-fragment-proposal', 'input:north'),
    basisObservationDigests: [observation.observationDigest],
    requestedBudgetUnits: 100,
    workDeadline: '2026-08-01T12:00:00.000Z',
    proposedAtLogicalMs: 110,
    ...overrides,
  });
}

function fragmentDecision(intent, policy, proposal, overrides = {}) {
  return createPlanFragmentDecisionV1({
    schemaVersion: 1,
    decisionId: 'plan-decision:alpha:1',
    missionIntentId: intent.missionIntentId,
    intentRevision: intent.revision,
    intentDigest: intent.intentDigest,
    proposalId: proposal.proposalId,
    proposalDigest: proposal.proposalDigest,
    selectionPolicyDigest: policy.policyDigest,
    status: 'accepted',
    reasonCodes: ['constraints.satisfied', 'score.accepted'],
    inputCandidateDigests: [proposal.proposalDigest],
    selectedSemanticSlotHeadDigest: proposal.proposalDigest,
    localPlanViewRevision: 1,
    decidedAtLogicalMs: 115,
    resultingStateDigest: digest('plan-view', 'resulting-state'),
    ...overrides,
  });
}

function planFragment(intent, policy, proposal, decision, overrides = {}) {
  return createPlanFragmentV1({
    schemaVersion: 1,
    fragmentRevision: 1,
    previousStateDigest: null,
    proposalId: proposal.proposalId,
    proposalRevision: proposal.proposalRevision,
    proposalDigest: proposal.proposalDigest,
    decisionDigest: decision.decisionDigest,
    missionIntentId: intent.missionIntentId,
    intentRevision: intent.revision,
    intentDigest: intent.intentDigest,
    proposerPeerId: proposal.proposerPeerId,
    proposerInstanceId: proposal.proposerInstanceId,
    semanticSlotKey: proposal.semanticSlotKey,
    predecessorFragmentDigest: proposal.predecessorFragmentDigest,
    parentFragmentDigests: proposal.parentFragmentDigests,
    dependencyFragmentDigests: proposal.dependencyFragmentDigests,
    outcomeStatements: proposal.outcomeStatements,
    roleKey: proposal.roleKey,
    requiredCapabilityKeys: proposal.requiredCapabilityKeys,
    inputReferenceDigest: proposal.inputReferenceDigest,
    basisObservationDigests: proposal.basisObservationDigests,
    requestedBudgetUnits: proposal.requestedBudgetUnits,
    workDeadline: proposal.workDeadline,
    proposedAtLogicalMs: proposal.proposedAtLogicalMs,
    acceptancePolicyDigest: policy.policyDigest,
    acceptedAtLogicalMs: 116,
    localPlanViewRevision: 1,
    status: 'active',
    ...overrides,
  });
}

function advanceFragmentState(
  intent,
  policy,
  proposal,
  decision,
  previous,
  status,
  overrides = {},
) {
  return planFragment(intent, policy, proposal, decision, {
    fragmentRevision: previous.fragmentRevision + 1,
    previousStateDigest: previous.fragmentDigest,
    status,
    ...overrides,
  });
}

function planView(
  intent,
  policy,
  proposal,
  decision,
  fragment,
  overrides = {},
) {
  return createPlanViewV1({
    schemaVersion: 1,
    planViewId: 'plan-view:peer-alpha',
    tenantId: intent.tenantId,
    policyDomainId: intent.policyDomainId,
    peerId: proposal.proposerPeerId,
    peerInstanceId: proposal.proposerInstanceId,
    missionIntentId: intent.missionIntentId,
    intentRevision: intent.revision,
    intentDigest: intent.intentDigest,
    selectionPolicyDigest: policy.policyDigest,
    revision: 1,
    proposals: [proposal],
    decisions: [decision],
    fragments: [fragment],
    selectedHeads: [
      {
        schemaVersion: 1,
        semanticSlotKey: fragment.semanticSlotKey,
        fragmentDigest: fragment.fragmentDigest,
      },
    ],
    causalFrontierDigests: [fragment.fragmentDigest],
    unresolvedDependencyDigests: [],
    budgetShards: [
      {
        schemaVersion: 1,
        peerId: proposal.proposerPeerId,
        budgetUnits: 500,
      },
    ],
    budgetReservations: [
      {
        schemaVersion: 1,
        reservationId: 'planning-reservation:alpha:1',
        peerId: proposal.proposerPeerId,
        proposalDigest: proposal.proposalDigest,
        fragmentDigest: fragment.fragmentDigest,
        units: proposal.requestedBudgetUnits,
        status: 'committed',
      },
    ],
    workMappings: [],
    activeRoleBindings: [],
    logicalTimeHighWaterMs: 116,
    ...overrides,
  });
}

function adaptiveRole(intent, view, fragment, overrides = {}) {
  return createAdaptiveRoleBindingV1({
    schemaVersion: 1,
    roleBindingId: 'adaptive-role:alpha:1',
    missionIntentId: intent.missionIntentId,
    intentRevision: intent.revision,
    intentDigest: intent.intentDigest,
    planViewDigest: view.stateDigest,
    fragmentDigest: fragment.fragmentDigest,
    roleKey: fragment.roleKey,
    workContractId: 'work-contract:alpha:1',
    workContractDigest: digest('adaptive-role-binding', 'work-contract'),
    assignedPeerId: 'peer:beta',
    assignedInstanceId: 'instance:beta:1',
    assignmentAuthorityId: 'assignment-authority:alpha:1',
    assignmentEpoch: 1,
    authorityGeneration: 1,
    fencingToken: 'fence:alpha:1',
    leaseExpiresAtLogicalMs: 10_000,
    status: 'current',
    terminalReasonCode: null,
    ...overrides,
  });
}

function planningSnapshot(
  intent,
  policy,
  view,
  observation,
  proposal,
  decision,
  fragment,
  overrides = {},
) {
  return createCollectivePlanningSnapshotV1({
    format: 'agentplat.collective-planning.snapshot',
    formatVersion: 1,
    schemaVersion: 1,
    snapshotId: 'collective-planning-snapshot:alpha:1',
    tenantId: intent.tenantId,
    policyDomainId: intent.policyDomainId,
    peerId: view.peerId,
    peerInstanceId: view.peerInstanceId,
    missionIntent: intent,
    selectionPolicy: policy,
    planView: view,
    domainHighWaters: [
      {
        schemaVersion: 1,
        domain: 'decision',
        recordId: decision.decisionId,
        revision: decision.localPlanViewRevision,
        digest: decision.decisionDigest,
      },
      {
        schemaVersion: 1,
        domain: 'fragment',
        recordId: fragment.fragmentId,
        revision: fragment.fragmentRevision,
        digest: fragment.fragmentDigest,
      },
      {
        schemaVersion: 1,
        domain: 'observation',
        recordId: observation.observationId,
        revision: 1,
        digest: observation.observationDigest,
      },
      {
        schemaVersion: 1,
        domain: 'proposal',
        recordId: proposal.proposalId,
        revision: proposal.proposalRevision,
        digest: proposal.proposalDigest,
      },
    ],
    ...overrides,
  });
}

test('planning JSON is deterministic, domain-separated, bounded and I-JSON safe', () => {
  assert.equal(
    canonicalizePlanningJsonV1({ z: 2, a: [true, null, -0] }),
    '{"a":[true,null,0],"z":2}',
  );
  assert.equal(planningUtf8ByteLengthV1('a😀'), 5);
  assert.equal(
    sha256HexPlanningV1(new TextEncoder().encode('abc')),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
  assert.notEqual(
    digestPlanningJsonV1('mission-intent', { value: 1 }),
    digestPlanningJsonV1('mission-observation', { value: 1 }),
  );

  for (const invalid of [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
    undefined,
    1n,
    new Date(0),
    '\ud800',
    '\udc00',
  ]) {
    assert.throws(
      () => canonicalizePlanningJsonV1(invalid),
      CollectivePlanningValidationError,
    );
  }
  assert.throws(
    () => planningUtf8ByteLengthV1('before\ud800after'),
    /unpaired surrogate/u,
  );

  const sparse = [];
  sparse.length = 1;
  assert.throws(() => canonicalizePlanningJsonV1(sparse), /dense/u);
  const extraArray = [1];
  extraArray.extra = true;
  assert.throws(() => canonicalizePlanningJsonV1(extraArray), /extra/u);
  const symbolic = { [Symbol('hidden')]: true };
  assert.throws(() => canonicalizePlanningJsonV1(symbolic), /symbol/u);
  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(() => canonicalizePlanningJsonV1(cyclic), /cycles/u);

  let accessorInvoked = false;
  const accessor = {};
  Object.defineProperty(accessor, 'danger', {
    enumerable: true,
    get() {
      accessorInvoked = true;
      throw new Error('must not execute');
    },
  });
  assert.throws(() => canonicalizePlanningJsonV1(accessor), /data properties/u);
  assert.equal(accessorInvoked, false);

  assert.equal(
    canonicalizePlanningJsonV1(
      { a: '😀' },
      {
        maximumBytes: 12,
        maximumDepth: 2,
        maximumNodes: 2,
        maximumKeysPerObject: 1,
        maximumItemsPerArray: 1,
      },
    ),
    '{"a":"😀"}',
  );
  assert.throws(
    () =>
      canonicalizePlanningJsonV1(
        { a: '😀' },
        {
          maximumBytes: 11,
          maximumDepth: 2,
          maximumNodes: 2,
          maximumKeysPerObject: 1,
          maximumItemsPerArray: 1,
        },
      ),
    /bytes/u,
  );
  assert.throws(
    () =>
      canonicalizePlanningJsonV1(
        { a: { b: true } },
        {
          maximumBytes: 64,
          maximumDepth: 1,
          maximumNodes: 3,
          maximumKeysPerObject: 1,
          maximumItemsPerArray: 1,
        },
      ),
    /depth/u,
  );
  assert.throws(
    () =>
      canonicalizePlanningJsonV1([true, false], {
        maximumBytes: 64,
        maximumDepth: 1,
        maximumNodes: 2,
        maximumKeysPerObject: 1,
        maximumItemsPerArray: 2,
      }),
    /nodes/u,
  );

  const frozen = deepFreezePlanning({ nested: [{ safe: true }] });
  assertDeepFrozen(frozen);
});

test('SHA-256 padding boundaries and every planning domain have fixed vectors', () => {
  for (const length of [0, 1, 55, 56, 63, 64, 65, 127, 128]) {
    const bytes = Uint8Array.from(
      { length },
      (_, index) => (index * 17 + 3) & 0xff,
    );
    assert.equal(
      sha256HexPlanningV1(bytes),
      createHash('sha256').update(bytes).digest('hex'),
      `SHA-256 differs at the ${length}-byte padding boundary`,
    );
  }

  const domainVector = { a: [true, null], z: 2 };
  const expected = {
    'mission-intent':
      'sha256:979af1e4e93beaba0fb7f04bef63ef783e7acdd2677c8e2c37ef59a8f54698d1',
    'mission-observation':
      'sha256:afb1b02a24f6d11fe4b5e9ec4bc259e2d5be1679d0190564c9bd51b019e08bbc',
    'proposal-identity':
      'sha256:50690d95a09d3932a0e2de0136cbcd44efdd0d188ec46d09f2b28b1102712cbd',
    'plan-fragment-proposal':
      'sha256:f45ba2361d0d07d5e9d2038978acfd5ca45491176ad0891b3067cf919ef20ec0',
    'plan-selection-policy':
      'sha256:633db8f77b77ce22d028601d2c888a33e9752afc25dff52c4e43c26e41652e69',
    'plan-fragment-decision':
      'sha256:8c8ba7967aba05f0af249cc85fea13d79d29508de5606f684eb4ed11fab6f5c1',
    'plan-fragment':
      'sha256:5e19f6983dec9e237a4ce8a00672a36ea4e2238708d01f004a3661b3c6adb02e',
    'plan-view':
      'sha256:3c3a15ba0a310efcd0a13a492760bc8545f131dc2da5d2fa855051101cf540d9',
    'adaptive-role-binding':
      'sha256:0748bc8ba8d675c465dd21f35c3cbe16ec48253c5d2284af7a576c029ce35a30',
    'collective-planning-snapshot':
      'sha256:bdbbef63aa19fbea90e2ffad144e484944b6d15bc58923f5c2b826b72cc6d207',
  };
  for (const [domain, expectedDigest] of Object.entries(expected))
    assert.equal(digestPlanningJsonV1(domain, domainVector), expectedDigest);

  const fixtureProposalId = derivePlanFragmentProposalIdV1({
    missionIntentId: 'mission-intent:fixture',
    intentRevision: 1,
    proposerPeerId: 'peer:fixture',
    proposerInstanceId: 'instance:fixture:1',
    semanticSlotKey: 'slot.fixture',
    predecessorFragmentDigest: null,
    proposalRevision: 1,
  });
  assert.equal(
    fixtureProposalId,
    'plan-proposal:ab30081436ea1ba95d8a773ab0f148a49ad7b4b9e9b8ac07d9e1c41fe3794736',
  );
});

test('canonical helpers and factories never invoke hostile getters or array methods', () => {
  let limitsInvocations = 0;
  const hostileLimits = {
    maximumDepth: 2,
    maximumNodes: 4,
    maximumKeysPerObject: 2,
    maximumItemsPerArray: 2,
  };
  Object.defineProperty(hostileLimits, 'maximumBytes', {
    enumerable: true,
    get() {
      limitsInvocations += 1;
      throw new Error('limits getter must not execute');
    },
  });
  assertRejectsWithoutInvoking(
    () => canonicalizePlanningJsonV1({ safe: true }, hostileLimits),
    () => limitsInvocations,
  );

  let freezeInvocations = 0;
  const hostileFreeze = {};
  Object.defineProperty(hostileFreeze, 'secret', {
    enumerable: true,
    get() {
      freezeInvocations += 1;
      throw new Error('freeze getter must not execute');
    },
  });
  assertRejectsWithoutInvoking(
    () => deepFreezePlanning(hostileFreeze),
    () => freezeInvocations,
  );

  let inheritedMapInvocations = 0;
  const inheritedMap = [1];
  Object.setPrototypeOf(inheritedMap, {
    map() {
      inheritedMapInvocations += 1;
      throw new Error('inherited map must not execute');
    },
  });
  try {
    assert.equal(canonicalizePlanningJsonV1(inheritedMap), '[1]');
  } catch (error) {
    assert.ok(error instanceof CollectivePlanningValidationError);
  }
  assert.equal(inheritedMapInvocations, 0);

  let ownMapInvocations = 0;
  const ownMap = [1];
  Object.defineProperty(ownMap, 'map', {
    enumerable: true,
    value() {
      ownMapInvocations += 1;
      throw new Error('own map must not execute');
    },
  });
  assertRejectsWithoutInvoking(
    () => canonicalizePlanningJsonV1(ownMap),
    () => ownMapInvocations,
  );

  const policy = selectionPolicy();
  const intent = missionIntent(policy);
  const observation = missionObservation(intent);
  const proposal = fragmentProposal(intent, observation);
  const decision = fragmentDecision(intent, policy, proposal);
  const fragment = planFragment(intent, policy, proposal, decision);
  const view = planView(intent, policy, proposal, decision, fragment);
  const role = adaptiveRole(intent, view, fragment);
  const snapshot = planningSnapshot(
    intent,
    policy,
    view,
    observation,
    proposal,
    decision,
    fragment,
  );

  let inheritedToJsonInvocations = 0;
  const previousToJson = Object.getOwnPropertyDescriptor(
    Object.prototype,
    'toJSON',
  );
  try {
    Object.defineProperty(Object.prototype, 'toJSON', {
      configurable: true,
      value() {
        inheritedToJsonInvocations += 1;
        throw new Error('inherited toJSON must not execute');
      },
    });
    assert.deepEqual(validateMissionIntentV1(intent), intent);
  } finally {
    if (previousToJson)
      Object.defineProperty(Object.prototype, 'toJSON', previousToJson);
    else delete Object.prototype.toJSON;
  }
  assert.equal(inheritedToJsonInvocations, 0);

  for (const [factory, source, omittedKey, accessorKey] of [
    [createMissionIntentV1, intent, 'intentDigest', 'missionIntentId'],
    [
      createMissionObservationV1,
      observation,
      'observationDigest',
      'observationId',
    ],
    [createPlanSelectionPolicyV1, policy, 'policyDigest', 'selectionPolicyId'],
    [createPlanFragmentProposalV1, proposal, 'proposalDigest', 'proposalId'],
    [createPlanFragmentDecisionV1, decision, 'decisionDigest', 'decisionId'],
    [createPlanFragmentV1, fragment, 'fragmentDigest', 'fragmentId'],
    [createPlanViewV1, view, 'stateDigest', 'planViewId'],
    [createAdaptiveRoleBindingV1, role, 'roleBindingDigest', 'roleBindingId'],
    [
      createCollectivePlanningSnapshotV1,
      snapshot,
      'snapshotDigest',
      'missionIntent',
    ],
  ]) {
    const hostile = structuredClone(source);
    delete hostile[omittedKey];
    delete hostile[accessorKey];
    let invocations = 0;
    Object.defineProperty(hostile, accessorKey, {
      enumerable: true,
      get() {
        invocations += 1;
        throw new Error(`${accessorKey} getter must not execute`);
      },
    });
    assertRejectsWithoutInvoking(
      () => factory(hostile),
      () => invocations,
    );
  }
});

test('portable intent, observation, policy and proposal records are strict and immutable', () => {
  const policy = selectionPolicy();
  const intent = missionIntent(policy);
  const observation = missionObservation(intent);
  const proposal = fragmentProposal(intent, observation);

  assert.deepEqual(validatePlanSelectionPolicyV1(policy), policy);
  assert.deepEqual(validateMissionIntentV1(intent), intent);
  assert.deepEqual(validateMissionObservationV1(observation), observation);
  assert.deepEqual(validatePlanFragmentProposalV1(proposal), proposal);
  for (const record of [policy, intent, observation, proposal])
    assertDeepFrozen(record);

  for (const [validate, record] of [
    [validatePlanSelectionPolicyV1, policy],
    [validateMissionIntentV1, intent],
    [validateMissionObservationV1, observation],
    [validatePlanFragmentProposalV1, proposal],
  ]) {
    assert.throws(
      () => validate({ ...structuredClone(record), unreviewedField: true }),
      /invalid shape/u,
    );
  }

  const alteredIntent = structuredClone(intent);
  alteredIntent.planningLimits.maximumTotalPlanningBudgetUnits += 1;
  assert.throws(() => validateMissionIntentV1(alteredIntent), /mismatch/u);
  const alteredObservation = structuredClone(observation);
  alteredObservation.logicalTimeMs += 1;
  assert.throws(
    () => validateMissionObservationV1(alteredObservation),
    /mismatch/u,
  );
  const alteredPolicy = structuredClone(policy);
  alteredPolicy.challengeScoreThreshold += 1;
  assert.throws(
    () => validatePlanSelectionPolicyV1(alteredPolicy),
    /mismatch/u,
  );
  const alteredProposal = structuredClone(proposal);
  alteredProposal.requestedBudgetUnits += 1;
  assert.throws(
    () => validatePlanFragmentProposalV1(alteredProposal),
    /mismatch/u,
  );
});

test('every nested planning record rejects unknown fields and accessors without invocation', () => {
  const policy = selectionPolicy();
  const intent = missionIntent(policy);
  const observation = missionObservation(intent);
  const proposal = fragmentProposal(intent, observation);
  const decision = fragmentDecision(intent, policy, proposal);
  const activeFragment = planFragment(intent, policy, proposal, decision);
  const activeView = planView(
    intent,
    policy,
    proposal,
    decision,
    activeFragment,
  );
  const offeredFragment = advanceFragmentState(
    intent,
    policy,
    proposal,
    decision,
    activeFragment,
    'offered',
  );
  const assignedFragment = advanceFragmentState(
    intent,
    policy,
    proposal,
    decision,
    offeredFragment,
    'assigned',
  );
  const role = adaptiveRole(intent, activeView, assignedFragment);
  const roleView = planView(
    intent,
    policy,
    proposal,
    decision,
    assignedFragment,
    {
      revision: 2,
      fragments: [activeFragment, offeredFragment, assignedFragment],
      workMappings: [
        {
          schemaVersion: 1,
          fragmentDigest: assignedFragment.fragmentDigest,
          meshId: intent.objective.meshId,
          objectiveId: intent.objective.objectiveId,
          workItemId: 'work-item:nested-boundary',
          workItemRevision: 1,
        },
      ],
      activeRoleBindings: [role],
      logicalTimeHighWaterMs: 120,
    },
  );
  const snapshot = planningSnapshot(
    intent,
    policy,
    roleView,
    observation,
    proposal,
    decision,
    assignedFragment,
  );

  const boundaries = [
    [validateMissionIntentV1, intent, ['objective'], 'meshId'],
    [
      validateMissionIntentV1,
      intent,
      ['planningLimits'],
      'maximumCandidateFragments',
    ],
    [validatePlanSelectionPolicyV1, policy, ['scoringDimensions', 0], 'weight'],
    [validatePlanViewV1, activeView, ['selectedHeads', 0], 'semanticSlotKey'],
    [validatePlanViewV1, activeView, ['budgetShards', 0], 'budgetUnits'],
    [validatePlanViewV1, activeView, ['budgetReservations', 0], 'units'],
    [validatePlanViewV1, roleView, ['workMappings', 0], 'workItemId'],
    [
      validatePlanViewV1,
      roleView,
      ['activeRoleBindings', 0],
      'assignmentEpoch',
    ],
    [
      validateCollectivePlanningSnapshotV1,
      snapshot,
      ['domainHighWaters', 0],
      'revision',
    ],
  ];

  const atPath = (root, path) =>
    path.reduce((current, segment) => current[segment], root);
  for (const [validate, record, path, accessorKey] of boundaries) {
    const unknown = structuredClone(record);
    atPath(unknown, path).unreviewedField = true;
    assert.throws(() => validate(unknown), /invalid shape/u);

    const hostile = structuredClone(record);
    const nested = atPath(hostile, path);
    delete nested[accessorKey];
    let invocations = 0;
    Object.defineProperty(nested, accessorKey, {
      enumerable: true,
      get() {
        invocations += 1;
        throw new Error(`${accessorKey} getter must not execute`);
      },
    });
    assertRejectsWithoutInvoking(
      () => validate(hostile),
      () => invocations,
    );
  }
});

test('observations and proposals cannot smuggle assignments or effect authority', () => {
  const intent = missionIntent();
  const observation = missionObservation(intent);
  const forbidden = [
    'assigneeId',
    'assignedPeerId',
    'assignmentEpoch',
    'assignmentAuthorityId',
    'authorityGeneration',
    'fencingToken',
    'actionGrantId',
    'permitId',
    'handler',
    'handlerId',
    'globalMembership',
    'hiddenState',
    'terminalPredicate',
    'futureEvents',
    'futureFaultSchedule',
    'assigned_peer_id',
    'assignment-authority-id',
    'GLOBAL MEMBERSHIP',
    'hidden_world_state',
    'future-fault-schedule',
    'permit-id',
    'ａｓｓｉｇｎｅｄＰｅｅｒＩｄ',
  ];
  for (const [index, field] of forbidden.entries()) {
    assert.throws(
      () =>
        missionObservation(intent, {
          observationId: `observation:forbidden:${index}`,
          publicValue: { nested: { [field]: 'smuggled' } },
        }),
      /forbidden field/u,
    );
  }
  for (const [index, publicValue] of [
    { assi: { gned_peer_id: 'smuggled' } },
    { glo: { bal: { membership: ['peer:all'] } } },
    { hid: { den: { world: { state: true } } } },
  ].entries()) {
    assert.throws(
      () =>
        missionObservation(intent, {
          observationId: `observation:split-forbidden:${index}`,
          publicValue,
        }),
      /forbidden field/u,
    );
  }

  const proposal = fragmentProposal(intent, observation);
  for (const field of [
    'assigneeId',
    'assignedPeerId',
    'assignmentEpoch',
    'assignmentAuthorityId',
    'authorityGeneration',
    'fencingToken',
    'actionGrantId',
    'permitId',
    'handler',
    'handlerId',
  ]) {
    assert.throws(
      () =>
        validatePlanFragmentProposalV1({
          ...structuredClone(proposal),
          [field]: 'smuggled',
        }),
      /invalid shape/u,
    );
  }
});

test('proposal identity is deterministic, nonce-free and digest-bound', () => {
  const intent = missionIntent();
  const observation = missionObservation(intent);
  const proposal = fragmentProposal(intent, observation);
  const identity = {
    missionIntentId: proposal.missionIntentId,
    intentRevision: proposal.intentRevision,
    proposerPeerId: proposal.proposerPeerId,
    proposerInstanceId: proposal.proposerInstanceId,
    semanticSlotKey: proposal.semanticSlotKey,
    predecessorFragmentDigest: proposal.predecessorFragmentDigest,
    proposalRevision: proposal.proposalRevision,
  };
  assert.equal(derivePlanFragmentProposalIdV1(identity), proposal.proposalId);
  assert.equal(derivePlanFragmentProposalIdV1(identity), proposal.proposalId);
  assert.notEqual(
    derivePlanFragmentProposalIdV1({ ...identity, proposalRevision: 2 }),
    proposal.proposalId,
  );

  assert.throws(
    () =>
      fragmentProposal(intent, observation, {
        proposalId: `${proposal.proposalId.slice(0, -1)}${
          proposal.proposalId.endsWith('0') ? '1' : '0'
        }`,
      }),
    /proposalId mismatch/u,
  );
  assert.throws(
    () => derivePlanFragmentProposalIdV1({ ...identity, nonce: 'grind' }),
    /invalid shape/u,
  );
  assert.throws(
    () => fragmentProposal(intent, observation, { nonce: 'grind' }),
    /invalid shape/u,
  );
});

test('portable record validators enforce sorted sets, safe integers and hard boundaries', () => {
  const policy = selectionPolicy();
  const intent = missionIntent(policy);
  const observation = missionObservation(intent);

  assert.throws(
    () =>
      missionIntent(policy, {
        outcomeStatements: ['Report verified findings', 'Map the bounded area'],
      }),
    /sorted and unique/u,
  );
  assert.throws(
    () =>
      missionIntent(policy, {
        permittedCapabilityKeys: ['capability.map', 'capability.map'],
      }),
    /sorted and unique/u,
  );
  assert.throws(
    () =>
      fragmentProposal(intent, observation, {
        requiredCapabilityKeys: ['capability.observe', 'capability.map'],
      }),
    /sorted and unique/u,
  );
  assert.throws(
    () => missionObservation(intent, { logicalTimeMs: -0 }),
    /integers must be safe|safe integer/u,
  );
  assert.throws(
    () =>
      fragmentProposal(intent, observation, {
        requestedBudgetUnits: Number.MAX_SAFE_INTEGER + 1,
      }),
    /integers must be safe|safe integer/u,
  );
  assert.throws(
    () =>
      missionIntent(policy, {
        planningLimits: planningLimits({
          maximumCandidateFragments: oneOver(65_536),
        }),
      }),
    /safe integer/u,
  );
  assert.throws(
    () =>
      missionIntent(policy, {
        planningLimits: planningLimits({
          maximumProposalBytes: oneOver(262_144),
        }),
      }),
    /safe integer/u,
  );
  assert.throws(
    () => missionIntent(policy, { validUntil: '2026-02-30T00:00:00.000Z' }),
    /RFC 3339/u,
  );
  assert.throws(
    () => missionObservation(intent, { observationId: 'bad\ud800id' }),
    /unpaired surrogate/u,
  );
  const tooManyOutcomes = Array.from(
    { length: 1_025 },
    (_, index) => `outcome-${String(index).padStart(4, '0')}`,
  );
  assert.throws(
    () =>
      fragmentProposal(intent, observation, {
        outcomeStatements: tooManyOutcomes,
      }),
    /invalid length/u,
  );
  const oversizedOutcomes = Array.from(
    { length: 1_024 },
    (_, index) =>
      `outcome-${String(index).padStart(4, '0')}-${'x'.repeat(300)}`,
  );
  assert.throws(
    () =>
      fragmentProposal(intent, observation, {
        outcomeStatements: oversizedOutcomes,
      }),
    /maximum bytes/u,
  );
});

test('decision, fragment, view, role and snapshot form a complete immutable contract chain', () => {
  const policy = selectionPolicy();
  const intent = missionIntent(policy);
  const observation = missionObservation(intent);
  const proposal = fragmentProposal(intent, observation);
  const decision = fragmentDecision(intent, policy, proposal);
  const activeFragment = planFragment(intent, policy, proposal, decision);
  const view = planView(intent, policy, proposal, decision, activeFragment);
  const offeredFragment = advanceFragmentState(
    intent,
    policy,
    proposal,
    decision,
    activeFragment,
    'offered',
  );
  const fragment = advanceFragmentState(
    intent,
    policy,
    proposal,
    decision,
    offeredFragment,
    'assigned',
  );
  const workMappings = [
    {
      schemaVersion: 1,
      fragmentDigest: fragment.fragmentDigest,
      meshId: intent.objective.meshId,
      objectiveId: intent.objective.objectiveId,
      workItemId: 'work-item:alpha:1',
      workItemRevision: 1,
    },
  ];
  const role = adaptiveRole(intent, view, fragment);
  const roleView = planView(intent, policy, proposal, decision, fragment, {
    revision: 2,
    fragments: [activeFragment, offeredFragment, fragment],
    workMappings,
    activeRoleBindings: [role],
    logicalTimeHighWaterMs: 120,
  });
  const snapshot = planningSnapshot(
    intent,
    policy,
    roleView,
    observation,
    proposal,
    decision,
    fragment,
  );

  for (const [validate, record] of [
    [validatePlanFragmentDecisionV1, decision],
    [validatePlanFragmentV1, activeFragment],
    [validatePlanFragmentV1, fragment],
    [validatePlanViewV1, view],
    [validateAdaptiveRoleBindingV1, role],
    [validatePlanViewV1, roleView],
    [validateCollectivePlanningSnapshotV1, snapshot],
  ]) {
    assert.deepEqual(validate(record), record);
    assertDeepFrozen(record);
    assert.throws(
      () => validate({ ...structuredClone(record), unreviewedField: true }),
      /invalid shape/u,
    );
  }

  for (const [validate, record, mutate] of [
    [
      validatePlanFragmentDecisionV1,
      decision,
      (copy) => {
        copy.decidedAtLogicalMs += 1;
      },
    ],
    [
      validatePlanFragmentV1,
      fragment,
      (copy) => {
        copy.acceptedAtLogicalMs += 1;
      },
    ],
    [
      validatePlanViewV1,
      view,
      (copy) => {
        copy.logicalTimeHighWaterMs += 1;
      },
    ],
    [
      validateAdaptiveRoleBindingV1,
      role,
      (copy) => {
        copy.assignmentEpoch += 1;
      },
    ],
    [
      validateCollectivePlanningSnapshotV1,
      snapshot,
      (copy) => {
        copy.snapshotId = 'collective-planning-snapshot:tampered';
      },
    ],
  ]) {
    const copy = structuredClone(record);
    mutate(copy);
    assert.throws(() => validate(copy), /mismatch/u);
  }
});

test('fragment lifecycle history is append-only, contiguous and transition-safe', () => {
  const policy = selectionPolicy();
  const intent = missionIntent(policy);
  const observation = missionObservation(intent);
  const proposal = fragmentProposal(intent, observation);
  const decision = fragmentDecision(intent, policy, proposal);
  const active = planFragment(intent, policy, proposal, decision);
  const offered = advanceFragmentState(
    intent,
    policy,
    proposal,
    decision,
    active,
    'offered',
  );
  const assigned = advanceFragmentState(
    intent,
    policy,
    proposal,
    decision,
    offered,
    'assigned',
  );
  const executing = advanceFragmentState(
    intent,
    policy,
    proposal,
    decision,
    assigned,
    'executing',
  );
  const completed = advanceFragmentState(
    intent,
    policy,
    proposal,
    decision,
    executing,
    'completed',
  );
  const history = [active, offered, assigned, executing, completed];
  const completedView = planView(
    intent,
    policy,
    proposal,
    decision,
    completed,
    {
      revision: 5,
      fragments: history,
      selectedHeads: [],
      causalFrontierDigests: [completed.fragmentDigest],
      budgetReservations: [
        {
          schemaVersion: 1,
          reservationId: 'planning-reservation:alpha:1',
          peerId: proposal.proposerPeerId,
          proposalDigest: proposal.proposalDigest,
          fragmentDigest: completed.fragmentDigest,
          units: proposal.requestedBudgetUnits,
          status: 'committed',
        },
      ],
      logicalTimeHighWaterMs: 125,
    },
  );
  assert.deepEqual(completedView.fragments, history);

  const reservationFor = (target, status) => ({
    schemaVersion: 1,
    reservationId: 'planning-reservation:alpha:1',
    peerId: proposal.proposerPeerId,
    proposalDigest: proposal.proposalDigest,
    fragmentDigest: target.fragmentDigest,
    units: proposal.requestedBudgetUnits,
    status,
  });
  const candidate = planFragment(intent, policy, proposal, decision, {
    status: 'candidate',
  });
  const candidateView = planView(
    intent,
    policy,
    proposal,
    decision,
    candidate,
    {
      selectedHeads: [],
      budgetReservations: [reservationFor(candidate, 'reserved')],
    },
  );
  assert.equal(candidateView.budgetReservations[0].status, 'reserved');
  assert.throws(
    () =>
      planView(intent, policy, proposal, decision, candidate, {
        selectedHeads: [],
        budgetReservations: [reservationFor(candidate, 'committed')],
      }),
    /candidate fragment requires a reserved/u,
  );
  assert.throws(
    () =>
      planView(intent, policy, proposal, decision, completed, {
        revision: 5,
        fragments: history,
        selectedHeads: [],
        causalFrontierDigests: [completed.fragmentDigest],
        budgetReservations: [reservationFor(executing, 'committed')],
        logicalTimeHighWaterMs: 125,
      }),
    /latest fragment lacks its exact planning reservation/u,
  );

  const terminalHistories = [
    [completed, history],
    ...['cancelled', 'superseded', 'failed'].map((status) => {
      const terminal = advanceFragmentState(
        intent,
        policy,
        proposal,
        decision,
        executing,
        status,
      );
      return [terminal, [active, offered, assigned, executing, terminal]];
    }),
  ];
  const [cancelled, cancelledHistory] = terminalHistories[1];
  assert.throws(
    () =>
      planView(intent, policy, proposal, decision, cancelled, {
        revision: 5,
        fragments: cancelledHistory,
        selectedHeads: [],
        causalFrontierDigests: [cancelled.fragmentDigest],
        budgetReservations: [reservationFor(cancelled, 'reserved')],
        logicalTimeHighWaterMs: 125,
      }),
    /cannot retain a reserved budget/u,
  );
  for (const [terminal, terminalHistory] of terminalHistories) {
    const resurrected = advanceFragmentState(
      intent,
      policy,
      proposal,
      decision,
      terminal,
      'active',
    );
    assert.throws(
      () =>
        planView(intent, policy, proposal, decision, resurrected, {
          fragments: [...terminalHistory, resurrected],
        }),
      /transition/u,
    );
  }

  const incorrectLink = advanceFragmentState(
    intent,
    policy,
    proposal,
    decision,
    active,
    'offered',
    { previousStateDigest: digest('plan-fragment', 'unrelated-state') },
  );
  assert.throws(
    () =>
      planView(intent, policy, proposal, decision, incorrectLink, {
        fragments: [active, incorrectLink],
      }),
    /history/u,
  );

  const skippedRevision = advanceFragmentState(
    intent,
    policy,
    proposal,
    decision,
    active,
    'offered',
    { fragmentRevision: 3 },
  );
  assert.throws(
    () =>
      planView(intent, policy, proposal, decision, skippedRevision, {
        fragments: [active, skippedRevision],
      }),
    /history/u,
  );

  const illegalTransition = advanceFragmentState(
    intent,
    policy,
    proposal,
    decision,
    active,
    'executing',
  );
  assert.throws(
    () =>
      planView(intent, policy, proposal, decision, illegalTransition, {
        fragments: [active, illegalTransition],
      }),
    /transition/u,
  );
});

test('decisions and fragments reject malformed selection and proposal bindings', () => {
  const policy = selectionPolicy();
  const intent = missionIntent(policy);
  const observation = missionObservation(intent);
  const proposal = fragmentProposal(intent, observation);
  const otherCandidate = digest('plan-fragment-proposal', 'other-candidate');

  assert.throws(
    () =>
      fragmentDecision(intent, policy, proposal, {
        inputCandidateDigests: [otherCandidate],
      }),
    /do not contain/u,
  );
  assert.throws(
    () =>
      fragmentDecision(intent, policy, proposal, {
        reasonCodes: ['score.accepted', 'constraints.satisfied'],
      }),
    /sorted and unique/u,
  );
  assert.throws(
    () =>
      fragmentDecision(intent, policy, proposal, {
        status: 'accepted',
        selectedSemanticSlotHeadDigest: null,
      }),
    /must select/u,
  );
  assert.throws(
    () =>
      fragmentDecision(intent, policy, proposal, {
        selectedSemanticSlotHeadDigest: otherCandidate,
      }),
    /accepted proposal digest|not an input candidate/u,
  );

  const decision = fragmentDecision(intent, policy, proposal);
  assert.throws(
    () =>
      planFragment(intent, policy, proposal, decision, { roleKey: 'reviewer' }),
    /proposalDigest mismatch|do not match proposalDigest/u,
  );
  assert.throws(
    () =>
      planFragment(intent, policy, proposal, decision, {
        acceptedAtLogicalMs: 109,
      }),
    /precedes/u,
  );
  assert.throws(
    () =>
      planFragment(intent, policy, proposal, decision, {
        dependencyFragmentDigests: [proposal.proposalDigest],
        predecessorFragmentDigest: proposal.proposalDigest,
      }),
    /predecessor must not/u,
  );
});

test('plan views fail closed on malformed graph, reservation and role references', () => {
  const policy = selectionPolicy();
  const intent = missionIntent(policy);
  const observation = missionObservation(intent);
  const proposal = fragmentProposal(intent, observation);
  const decision = fragmentDecision(intent, policy, proposal);
  const fragment = planFragment(intent, policy, proposal, decision);
  const view = planView(intent, policy, proposal, decision, fragment);
  const unknown = digest('plan-fragment', 'unknown');

  const selfCycle = structuredClone(fragment);
  selfCycle.dependencyFragmentDigests = [fragment.fragmentDigest];
  assert.throws(
    () => validatePlanFragmentV1(selfCycle),
    /proposalDigest|mismatch|itself|cycle/u,
  );

  assert.throws(
    () =>
      planView(intent, policy, proposal, decision, fragment, {
        causalFrontierDigests: [unknown],
      }),
    /unknown fragment|frontier does not match/u,
  );
  assert.throws(
    () =>
      planView(intent, policy, proposal, decision, fragment, {
        selectedHeads: [],
      }),
    /every active fragment/u,
  );
  assert.throws(
    () =>
      planView(intent, policy, proposal, decision, fragment, {
        selectedHeads: [
          {
            schemaVersion: 1,
            semanticSlotKey: 'slot.other',
            fragmentDigest: fragment.fragmentDigest,
          },
        ],
      }),
    /matching active fragment/u,
  );
  assert.throws(
    () =>
      planView(intent, policy, proposal, decision, fragment, {
        budgetReservations: [
          {
            schemaVersion: 1,
            reservationId: 'planning-reservation:alpha:1',
            peerId: 'peer:unknown',
            proposalDigest: proposal.proposalDigest,
            fragmentDigest: fragment.fragmentDigest,
            units: 100,
            status: 'committed',
          },
        ],
      }),
    /unknown budget shard/u,
  );
  assert.throws(
    () =>
      planView(intent, policy, proposal, decision, fragment, {
        budgetShards: [
          {
            schemaVersion: 1,
            peerId: proposal.proposerPeerId,
            budgetUnits: 50,
          },
        ],
      }),
    /exceeds its peer budget shard/u,
  );
  const role = adaptiveRole(intent, view, fragment, { roleKey: 'reviewer' });
  assert.throws(
    () =>
      planView(intent, policy, proposal, decision, fragment, {
        activeRoleBindings: [role],
      }),
    /not current for its fragment/u,
  );
});

test('snapshot validation applies intent graph limits and exact high-water coverage', () => {
  const policy = selectionPolicy();
  const constrainedIntent = missionIntent(policy, {
    planningLimits: planningLimits({ maximumDependencyFanout: 1 }),
  });
  const observation = missionObservation(constrainedIntent);
  const dependencies = [
    digest('plan-fragment', 'dependency:a'),
    digest('plan-fragment', 'dependency:b'),
  ].sort();
  const proposal = fragmentProposal(constrainedIntent, observation, {
    dependencyFragmentDigests: dependencies,
  });
  const decision = fragmentDecision(constrainedIntent, policy, proposal);
  const fragment = planFragment(constrainedIntent, policy, proposal, decision);
  const view = planView(
    constrainedIntent,
    policy,
    proposal,
    decision,
    fragment,
    { unresolvedDependencyDigests: dependencies },
  );
  assert.throws(
    () =>
      planningSnapshot(
        constrainedIntent,
        policy,
        view,
        observation,
        proposal,
        decision,
        fragment,
      ),
    /planning limits|fanout/u,
  );

  const proposalByteIntent = missionIntent(policy, {
    planningLimits: planningLimits({ maximumProposalBytes: 100 }),
  });
  const proposalByteObservation = missionObservation(proposalByteIntent);
  const proposalByteProposal = fragmentProposal(
    proposalByteIntent,
    proposalByteObservation,
  );
  const proposalByteDecision = fragmentDecision(
    proposalByteIntent,
    policy,
    proposalByteProposal,
  );
  const proposalByteFragment = planFragment(
    proposalByteIntent,
    policy,
    proposalByteProposal,
    proposalByteDecision,
  );
  const proposalByteView = planView(
    proposalByteIntent,
    policy,
    proposalByteProposal,
    proposalByteDecision,
    proposalByteFragment,
  );
  assert.throws(
    () =>
      planningSnapshot(
        proposalByteIntent,
        policy,
        proposalByteView,
        proposalByteObservation,
        proposalByteProposal,
        proposalByteDecision,
        proposalByteFragment,
      ),
    /proposal.*bytes|planning limits/iu,
  );

  const intent = missionIntent(policy);
  const normalObservation = missionObservation(intent);
  const normalProposal = fragmentProposal(intent, normalObservation);
  const normalDecision = fragmentDecision(intent, policy, normalProposal);
  const normalFragment = planFragment(
    intent,
    policy,
    normalProposal,
    normalDecision,
  );
  const normalView = planView(
    intent,
    policy,
    normalProposal,
    normalDecision,
    normalFragment,
  );
  assert.throws(
    () =>
      planningSnapshot(
        intent,
        policy,
        normalView,
        normalObservation,
        normalProposal,
        normalDecision,
        normalFragment,
        { domainHighWaters: [] },
      ),
    /do not cover (?:proposal|fragment) history/u,
  );

  const tinySnapshotIntent = missionIntent(policy, {
    planningLimits: planningLimits({ maximumSnapshotBytes: 1_024 }),
  });
  const tinyObservation = missionObservation(tinySnapshotIntent);
  const tinyProposal = fragmentProposal(tinySnapshotIntent, tinyObservation);
  const tinyDecision = fragmentDecision(
    tinySnapshotIntent,
    policy,
    tinyProposal,
  );
  const tinyFragment = planFragment(
    tinySnapshotIntent,
    policy,
    tinyProposal,
    tinyDecision,
  );
  const tinyView = planView(
    tinySnapshotIntent,
    policy,
    tinyProposal,
    tinyDecision,
    tinyFragment,
  );
  assert.throws(
    () =>
      planningSnapshot(
        tinySnapshotIntent,
        policy,
        tinyView,
        tinyObservation,
        tinyProposal,
        tinyDecision,
        tinyFragment,
      ),
    /bytes/u,
  );
});

test('intent revision and snapshot high-water assertions reject rollback and widening', () => {
  const policy = selectionPolicy();
  const intent = missionIntent(policy);
  const revisedIntent = missionIntent(policy, {
    revision: 2,
    predecessorDigest: intent.intentDigest,
    permittedResourceClasses: ['compute'],
    permittedCapabilityKeys: ['capability.map'],
    planningLimits: planningLimits({
      maximumCandidateFragments: 15,
      maximumActiveFragments: 7,
      maximumFragmentsPerPeer: 7,
      maximumActiveRoles: 3,
    }),
    validFrom: '2026-08-01T00:01:00.000Z',
    validUntil: '2026-08-01T23:59:00.000Z',
  });
  assert.deepEqual(
    assertMissionIntentRevisionV1(intent, revisedIntent),
    revisedIntent,
  );
  const widened = missionIntent(policy, {
    revision: 2,
    predecessorDigest: intent.intentDigest,
    permittedCapabilityKeys: [
      'capability.execute.unreviewed',
      ...intent.permittedCapabilityKeys,
    ].sort(),
  });
  assert.throws(
    () => assertMissionIntentRevisionV1(intent, widened),
    /widens/u,
  );

  const observation = missionObservation(intent);
  const proposal = fragmentProposal(intent, observation);
  const decision = fragmentDecision(intent, policy, proposal);
  const fragment = planFragment(intent, policy, proposal, decision);
  const firstView = planView(intent, policy, proposal, decision, fragment);
  const firstSnapshot = planningSnapshot(
    intent,
    policy,
    firstView,
    observation,
    proposal,
    decision,
    fragment,
  );
  const conflictingView = planView(
    intent,
    policy,
    proposal,
    decision,
    fragment,
    { logicalTimeHighWaterMs: firstView.logicalTimeHighWaterMs + 1 },
  );
  const conflictingViewSnapshot = planningSnapshot(
    intent,
    policy,
    conflictingView,
    observation,
    proposal,
    decision,
    fragment,
    { snapshotId: 'collective-planning-snapshot:conflicting-view' },
  );
  assert.throws(
    () =>
      assertSnapshotHighWatersNotLoweredV1(
        firstSnapshot,
        conflictingViewSnapshot,
      ),
    /same plan-view revision has a different state digest/u,
  );
  const snapshotForRevision = (
    nextIntent,
    nextPolicy,
    suffix,
    inheritedHighWaters,
  ) => {
    const nextObservation = missionObservation(nextIntent, {
      observationId: `observation:alpha:${suffix}`,
      environmentCursor: `environment-cursor:${suffix}`,
      logicalTimeMs: 120,
    });
    const nextProposal = fragmentProposal(nextIntent, nextObservation, {
      proposedAtLogicalMs: 121,
    });
    const nextDecision = fragmentDecision(
      nextIntent,
      nextPolicy,
      nextProposal,
      {
        decisionId: `plan-decision:alpha:${suffix}`,
        localPlanViewRevision: 2,
        decidedAtLogicalMs: 122,
      },
    );
    const nextFragment = planFragment(
      nextIntent,
      nextPolicy,
      nextProposal,
      nextDecision,
      {
        acceptedAtLogicalMs: 123,
        localPlanViewRevision: 2,
      },
    );
    const nextView = planView(
      nextIntent,
      nextPolicy,
      nextProposal,
      nextDecision,
      nextFragment,
      {
        revision: 2,
        logicalTimeHighWaterMs: 123,
      },
    );
    const isolated = planningSnapshot(
      nextIntent,
      nextPolicy,
      nextView,
      nextObservation,
      nextProposal,
      nextDecision,
      nextFragment,
      { snapshotId: `collective-planning-snapshot:alpha:${suffix}` },
    );
    return planningSnapshot(
      nextIntent,
      nextPolicy,
      nextView,
      nextObservation,
      nextProposal,
      nextDecision,
      nextFragment,
      {
        snapshotId: `collective-planning-snapshot:alpha:${suffix}`,
        domainHighWaters: [
          ...inheritedHighWaters,
          ...isolated.domainHighWaters,
        ].sort((left, right) =>
          `${left.domain}\u0000${left.recordId}`.localeCompare(
            `${right.domain}\u0000${right.recordId}`,
          ),
        ),
      },
    );
  };
  const revisedSnapshot = snapshotForRevision(
    revisedIntent,
    policy,
    'revision-2',
    firstSnapshot.domainHighWaters,
  );
  assert.deepEqual(
    assertSnapshotHighWatersNotLoweredV1(firstSnapshot, revisedSnapshot),
    revisedSnapshot,
  );
  const narrowedPolicy = selectionPolicy({
    revision: 2,
    hardConstraintKeys: ['budget', 'capability', 'deadline', 'risk'],
    acceptanceScoreThreshold: 701,
    challengeScoreThreshold: 401,
  });
  const narrowedPolicyIntent = missionIntent(narrowedPolicy, {
    revision: 2,
    predecessorDigest: intent.intentDigest,
  });
  const narrowedPolicySnapshot = snapshotForRevision(
    narrowedPolicyIntent,
    narrowedPolicy,
    'narrowed-policy',
    firstSnapshot.domainHighWaters,
  );
  assert.deepEqual(
    assertSnapshotHighWatersNotLoweredV1(firstSnapshot, narrowedPolicySnapshot),
    narrowedPolicySnapshot,
  );
  const widenedPolicy = selectionPolicy({
    revision: 2,
    acceptanceScoreThreshold: 699,
  });
  const widenedPolicyIntent = missionIntent(widenedPolicy, {
    revision: 2,
    predecessorDigest: intent.intentDigest,
  });
  const widenedPolicySnapshot = snapshotForRevision(
    widenedPolicyIntent,
    widenedPolicy,
    'widened-policy',
    firstSnapshot.domainHighWaters,
  );
  assert.throws(
    () =>
      assertSnapshotHighWatersNotLoweredV1(
        firstSnapshot,
        widenedPolicySnapshot,
      ),
    /widens scoring or thresholds/u,
  );
  const downgradedPolicyIntent = missionIntent(policy, {
    revision: 3,
    predecessorDigest: narrowedPolicyIntent.intentDigest,
  });
  const downgradedPolicySnapshot = snapshotForRevision(
    downgradedPolicyIntent,
    policy,
    'downgraded-policy',
    narrowedPolicySnapshot.domainHighWaters,
  );
  assert.throws(
    () =>
      assertSnapshotHighWatersNotLoweredV1(
        narrowedPolicySnapshot,
        downgradedPolicySnapshot,
      ),
    /selection policy identity or revision regressed/u,
  );
  assert.throws(
    () => assertSnapshotHighWatersNotLoweredV1(revisedSnapshot, firstSnapshot),
    /revision|predecessor|lowers/u,
  );
  const widenedSnapshot = snapshotForRevision(
    widened,
    policy,
    'widened',
    firstSnapshot.domainHighWaters,
  );
  assert.throws(
    () => assertSnapshotHighWatersNotLoweredV1(firstSnapshot, widenedSnapshot),
    /widens/u,
  );
  assert.throws(
    () =>
      planningSnapshot(
        intent,
        policy,
        firstView,
        observation,
        proposal,
        decision,
        fragment,
        {
          snapshotId: 'collective-planning-snapshot:missing-observation',
          domainHighWaters: firstSnapshot.domainHighWaters.filter(
            (item) => item.domain !== 'observation',
          ),
        },
      ),
    /do not cover proposal observations/u,
  );
  const elevatedObservationWater = planningSnapshot(
    intent,
    policy,
    firstView,
    observation,
    proposal,
    decision,
    fragment,
    {
      snapshotId: 'collective-planning-snapshot:alpha:2',
      domainHighWaters: firstSnapshot.domainHighWaters.map((item) =>
        item.domain === 'observation' ? { ...item, revision: 2 } : item,
      ),
    },
  );
  assert.throws(
    () =>
      assertSnapshotHighWatersNotLoweredV1(
        elevatedObservationWater,
        firstSnapshot,
      ),
    /lowers|immutable/u,
  );
});

test('snapshot succession rejects adaptive-role authority rollback and equivocation', () => {
  const policy = selectionPolicy();
  const intent = missionIntent(policy);
  const observation = missionObservation(intent);
  const proposal = fragmentProposal(intent, observation);
  const decision = fragmentDecision(intent, policy, proposal);
  const active = planFragment(intent, policy, proposal, decision);
  const offered = advanceFragmentState(
    intent,
    policy,
    proposal,
    decision,
    active,
    'offered',
  );
  const assigned = advanceFragmentState(
    intent,
    policy,
    proposal,
    decision,
    offered,
    'assigned',
  );
  const initialView = planView(intent, policy, proposal, decision, active);
  const mappingFor = (fragment) => ({
    schemaVersion: 1,
    fragmentDigest: fragment.fragmentDigest,
    meshId: intent.objective.meshId,
    objectiveId: intent.objective.objectiveId,
    workItemId: 'work-item:authority',
    workItemRevision: 1,
  });
  const assignedRole = adaptiveRole(intent, initialView, assigned, {
    assignmentEpoch: 2,
    authorityGeneration: 2,
  });
  const assignedView = planView(intent, policy, proposal, decision, assigned, {
    revision: 2,
    fragments: [active, offered, assigned],
    workMappings: [mappingFor(assigned)],
    activeRoleBindings: [assignedRole],
    logicalTimeHighWaterMs: 120,
  });
  const assignedSnapshot = planningSnapshot(
    intent,
    policy,
    assignedView,
    observation,
    proposal,
    decision,
    assigned,
  );
  const executing = advanceFragmentState(
    intent,
    policy,
    proposal,
    decision,
    assigned,
    'executing',
  );
  const successorSnapshot = (role, suffix) => {
    const executingView = planView(
      intent,
      policy,
      proposal,
      decision,
      executing,
      {
        revision: 3,
        fragments: [active, offered, assigned, executing],
        workMappings: [mappingFor(executing)],
        activeRoleBindings: [role],
        logicalTimeHighWaterMs: 121,
      },
    );
    return planningSnapshot(
      intent,
      policy,
      executingView,
      observation,
      proposal,
      decision,
      executing,
      { snapshotId: `collective-planning-snapshot:authority:${suffix}` },
    );
  };

  const loweredRole = adaptiveRole(intent, assignedView, executing, {
    assignmentEpoch: 1,
    authorityGeneration: 2,
  });
  assert.throws(
    () =>
      assertSnapshotHighWatersNotLoweredV1(
        assignedSnapshot,
        successorSnapshot(loweredRole, 'lowered'),
      ),
    /lowers adaptive-role assignment authority/u,
  );

  const loweredGenerationRole = adaptiveRole(intent, assignedView, executing, {
    assignmentEpoch: 2,
    authorityGeneration: 1,
  });
  assert.throws(
    () =>
      assertSnapshotHighWatersNotLoweredV1(
        assignedSnapshot,
        successorSnapshot(loweredGenerationRole, 'lowered-generation'),
      ),
    /lowers adaptive-role assignment authority/u,
  );

  const equivocatedRole = adaptiveRole(intent, assignedView, executing, {
    assignmentEpoch: 2,
    authorityGeneration: 2,
    assignedPeerId: 'peer:gamma',
    assignedInstanceId: 'instance:gamma:1',
  });
  assert.throws(
    () =>
      assertSnapshotHighWatersNotLoweredV1(
        assignedSnapshot,
        successorSnapshot(equivocatedRole, 'equivocated'),
      ),
    /conflicting bindings/u,
  );
});
