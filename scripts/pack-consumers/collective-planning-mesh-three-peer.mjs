import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash, webcrypto as crypto } from 'node:crypto';

import {
  createMissionIntentV1,
  createMissionObservationV1,
  createPlanFragmentProposalV1,
  createPlanSelectionPolicyV1,
  createPlanningReducerCommandV1,
  createPlanningReducerStateV1,
  digestPlanningJsonV1,
  reducePlanningCommandV1,
} from '@agentplat/collective-planning';
import {
  createDelegationMandateV1,
  delegationMandateDigestV1,
} from '@agentplat/collective-control';
import {
  InMemoryPlanningFragmentRepositoryV1,
  PLANNING_MESH_CAPABILITY_PROFILE_V1,
  PLANNING_WORK_EXTENSION_KEY_V1,
  createPlanningAdaptiveRoleV1,
  createPlanningLocalWorkProjectionV1,
  createPlanningMeshInboundProcessorV1,
  planningWorkItemIdV1,
  selectPlanningOfferRecipientsV1,
} from '@agentplat/collective-planning/mesh';
import {
  COLLECTIVE_INTERACTION_ACCOUNTING_VERSION_V2,
  auditCollectiveEnvironmentPortV1,
  collectiveTraceAccountingV2,
} from '@agentplat/collective-planning/evaluation';
import { DELEGATION_MANDATE_REFERENCE_PREFIX_V1 } from '@agentplat/collective-control/mesh';
import {
  DEFAULT_MESH_CRYPTO_POLICY,
  createStaticMeshKeyResolver,
  createWebCryptoMeshEnvelopeSigner,
  verifyMeshEnvelope,
} from '@agentplat/mesh-crypto';
import {
  MESH_SIGNATURE_ALGORITHM,
  canonicalizeMeshPayload,
} from '@agentplat/mesh-protocol';
import {
  createMeshAllocationInboundProcessor,
  createMeshAllocationInboundRuntimeState,
  createMeshAllocationRuntimeState,
  createMeshAllocationState,
  createMeshCoordinationInboundState,
  createMeshCoordinationState,
  createMeshDiscoveryRuntimeState,
  createMeshDiscoveryState,
  createMeshObjectiveWorkRuntimeState,
  createMeshObjectiveWorkState,
  evaluateMeshAllocationCommand,
  evaluateMeshObjectiveWorkCommand,
  evaluateVerifiedMeshAllocationEnvelope,
  evaluateVerifiedMeshDiscoveryEnvelope,
  evaluateVerifiedMeshObjectiveEnvelope,
  restoreMeshAllocationState,
  restoreMeshDiscoveryState,
  restoreMeshObjectiveWorkState,
  selectMeshAllocationBid,
} from '@agentplat/mesh/coordination';

const peerIds = Object.freeze(['peer-a', 'peer-b', 'peer-c']);
const TENANT_ID = 'tenant-packed-planning';
const MESH_ID = 'mesh-packed-planning';
const OBJECTIVE_ID = 'objective-packed-planning';
const OBJECTIVE_DOCUMENT_ID = 'objective-document-packed-planning';
const VERIFIED_AT = '2026-07-30T00:00:10.000Z';
const BID_VERIFIED_AT = '2026-07-30T00:00:12.000Z';
const AWARD_VERIFIED_AT = '2026-07-30T00:00:14.000Z';
const ACCEPT_VERIFIED_AT = '2026-07-30T00:00:15.000Z';
const PROGRESS_VERIFIED_AT = '2026-07-30T00:00:16.000Z';
const signer = createWebCryptoMeshEnvelopeSigner({
  signingPolicy: { allowedWireVersions: [0] },
});

function messageId(value) {
  const bytes = new Uint8Array(16);
  new DataView(bytes.buffer).setUint32(12, value);
  return Buffer.from(bytes).toString('base64url');
}

function identity(peerId) {
  return Object.freeze({
    tenantId: TENANT_ID,
    meshId: MESH_ID,
    peerId,
    instanceId: `instance-${peerId}`,
    keyId: `key-${peerId}`,
  });
}

function envelope({
  id,
  type,
  senderPeerId,
  audience,
  payload,
  objectiveId,
  causationId,
  sentAt = '2026-07-30T00:00:00.000Z',
  expiresAt = '2026-07-30T00:05:00.000Z',
  extensions,
  criticalExtensions,
}) {
  return {
    protocol: 'agentplat.mesh',
    wireVersion: 0,
    messageId: messageId(id),
    tenantId: TENANT_ID,
    meshId: MESH_ID,
    ...(objectiveId === undefined ? {} : { objectiveId }),
    type,
    sender: {
      peerId: senderPeerId,
      instanceId: `instance-${senderPeerId}`,
    },
    audience,
    sequence: id,
    sentAt,
    expiresAt,
    ...(causationId === undefined ? {} : { causationId }),
    ...(extensions === undefined ? {} : { extensions }),
    ...(criticalExtensions === undefined ? {} : { criticalExtensions }),
    payload,
    proof: {
      algorithm: 'Ed25519',
      keyId: `key-${senderPeerId}`,
      value: '',
    },
  };
}

function withPayloadHash(value) {
  const canonical = canonicalizeMeshPayload(value.payload);
  assert.equal(canonical.ok, true, 'packed payload must canonicalize');
  return {
    ...value,
    payloadHash: `sha256:${createHash('sha256').update(canonical.value).digest('base64url')}`,
  };
}

async function signed(value, peerId, verifiedAt = VERIFIED_AT) {
  const signedEnvelope = await signer.sign({
    envelope: withPayloadHash(value),
    privateKey: keyPairs[peerId].privateKey,
  });
  const verification = await verifyMeshEnvelope({
    envelope: signedEnvelope,
    resolver,
    policy: DEFAULT_MESH_CRYPTO_POLICY,
    verifiedAt,
  });
  assert.equal(verification.verified, true, 'packed envelope must verify');
  return Object.freeze({
    signed: signedEnvelope,
    verified: verification.envelope,
  });
}

const keyPairs = Object.fromEntries(
  await Promise.all(
    peerIds.map(async (peerId) => [
      peerId,
      await crypto.subtle.generateKey(MESH_SIGNATURE_ALGORITHM, true, [
        'sign',
        'verify',
      ]),
    ])
  )
);
const resolver = createStaticMeshKeyResolver(
  peerIds.map((peerId) => ({
    tenantId: TENANT_ID,
    meshId: MESH_ID,
    peerId,
    keyId: `key-${peerId}`,
    algorithm: MESH_SIGNATURE_ALGORITHM,
    publicKey: keyPairs[peerId].publicKey,
    validFrom: '2026-01-01T00:00:00.000Z',
    validUntil: '2027-01-01T00:00:00.000Z',
    status: 'active',
  }))
);
const baseInboundProcessor = createMeshAllocationInboundProcessor({
  resolver,
  cryptoPolicy: DEFAULT_MESH_CRYPTO_POLICY,
  supportedCriticalExtensions: [PLANNING_WORK_EXTENSION_KEY_V1],
});

function createMeshRuntime(peerId) {
  const local = identity(peerId);
  return createMeshAllocationInboundRuntimeState(
    createMeshCoordinationState({ identity: local }),
    createMeshDiscoveryState({
      identity: local,
      subscriptions: ['membership', 'capability', 'objective'],
      admittedPeers: peerIds.map((candidate) => ({
        peerId: candidate,
        instanceIds: [`instance-${candidate}`],
        validUntil: '2027-01-01T00:00:00.000Z',
      })),
    }),
    createMeshObjectiveWorkState({
      identity: local,
      issuerAuthorities: [
        {
          peerId: 'peer-a',
          keyIds: ['key-peer-a'],
          validUntil: '2027-01-01T00:00:00.000Z',
        },
      ],
    }),
    createMeshAllocationState({ identity: local }),
    createMeshCoordinationInboundState({ identity: local })
  );
}

function replaceMeshDomains(state, domains, logicalTime = undefined) {
  const alignedLogicalTime =
    logicalTime ??
    Math.max(
      domains.coordination.lastLogicalTime,
      domains.discovery.lastLogicalTime,
      domains.objectives.lastLogicalTime,
      state.allocation.lastLogicalTime
    );
  return createMeshAllocationInboundRuntimeState(
    domains.coordination,
    restoreMeshDiscoveryState({
      ...domains.discovery,
      lastLogicalTime: alignedLogicalTime,
    }),
    restoreMeshObjectiveWorkState({
      ...domains.objectives,
      lastLogicalTime: alignedLogicalTime,
    }),
    restoreMeshAllocationState({
      ...state.allocation,
      lastLogicalTime: alignedLogicalTime,
    }),
    state.inbound
  );
}

function planningPolicy() {
  return createPlanSelectionPolicyV1({
    schemaVersion: 1,
    selectionPolicyId: 'policy:packed:planning',
    revision: 1,
    scoringDimensions: [
      {
        schemaVersion: 1,
        dimension: 'outcome_coverage',
        weight: 1,
        direction: 'maximize',
      },
    ],
    hardConstraintKeys: ['budget', 'dependencies'],
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
}

const selectionPolicy = planningPolicy();
const mandateStatement = {
  schemaVersion: 1,
  mandateId: 'mandate:packed:planning',
  tenantId: TENANT_ID,
  policyDomainId: 'policy-domain:packed:planning',
  issuerId: 'peer-a',
  revision: 1,
  predecessorDigest: null,
  subjectPeerIds: ['peer-b', 'peer-c'],
  objective: {
    schemaVersion: 1,
    meshId: MESH_ID,
    objectiveId: OBJECTIVE_ID,
    objectiveDocumentId: OBJECTIVE_DOCUMENT_ID,
    minimumObjectiveRevision: 1,
    maximumObjectiveRevision: 1,
  },
  work: {
    schemaVersion: 1,
    workItemIds: [],
    permittedRoleKeys: ['role.executor'],
    maximumWorkItemRevision: 1,
  },
  permittedCapabilityKeys: ['capability.execute'],
  permittedActions: [
    {
      schemaVersion: 1,
      namespace: 'packed',
      toolId: 'executor',
      operation: 'execute',
    },
  ],
  budget: {
    schemaVersion: 1,
    totalBudgetUnits: 60,
    maximumWorkBudgetUnits: 20,
    maximumActionBudgetUnits: 5,
    maximumConcurrentWorkReservations: 4,
    maximumConcurrentActionReservations: 4,
    reservationLifetimeMs: 60_000,
  },
  validFrom: '2026-07-29T00:00:00.000Z',
  validUntil: '2026-08-29T00:00:00.000Z',
  roomProvenance: null,
  evidence: {
    schemaVersion: 1,
    redactionPolicyId: 'redaction:packed',
    retentionClass: 'standard',
    requireDurablePreDispatchEvidence: true,
  },
};
const mandateDigest = delegationMandateDigestV1(mandateStatement);
const delegationMandate = createDelegationMandateV1({
  statement: mandateStatement,
  proof: {
    schemaVersion: 1,
    kind: 'local_attestation',
    issuerId: 'peer-a',
    attestorId: 'attestor:packed',
    attestationId: `attestation:${mandateDigest.slice(-12)}`,
    signedDigest: mandateDigest,
  },
});
const missionIntent = createMissionIntentV1({
  schemaVersion: 1,
  missionIntentId: 'intent:packed:planning',
  revision: 1,
  predecessorDigest: null,
  tenantId: TENANT_ID,
  policyDomainId: 'policy-domain:packed:planning',
  objective: {
    schemaVersion: 1,
    meshId: MESH_ID,
    objectiveId: OBJECTIVE_ID,
    objectiveDocumentId: OBJECTIVE_DOCUMENT_ID,
    objectiveRevision: 1,
    acceptedPolicyDigest: digestPlanningJsonV1('mission-intent', {
      schemaVersion: 1,
      policy: 'packed',
    }),
  },
  mandateDigest,
  outcomeStatements: ['outcome.completed'],
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
    maximumTotalPlanningBudgetUnits: 60,
    maximumFragmentBudgetUnits: 20,
    budgetShardPolicy: 'equal_mandate_subjects',
    maximumConcurrentProposals: 8,
    maximumActiveRoles: 4,
    proposalLogicalWindowMs: 60_000,
    observationLogicalWindowMs: 60_000,
    replanningLogicalWindowMs: 60_000,
  },
  selectionPolicyDigest: selectionPolicy.policyDigest,
  validFrom: '2026-07-30T00:00:00.000Z',
  validUntil: '2026-08-29T00:00:00.000Z',
});
const admittedSubjects = peerIds.map((peerId) => ({
  schemaVersion: 1,
  peerId,
  peerInstanceId: `instance-${peerId}`,
}));
const observation = createMissionObservationV1({
  schemaVersion: 1,
  observationId: 'observation:packed:availability',
  missionIntentId: missionIntent.missionIntentId,
  intentRevision: missionIntent.revision,
  intentDigest: missionIntent.intentDigest,
  observerPeerId: 'peer-a',
  observerInstanceId: 'instance-peer-a',
  environmentCursor: 'cursor:packed:1',
  logicalTimeMs: 1,
  visibility: 'public',
  observationKind: 'availability',
  publicValue: { available: true },
  contentReferenceDigest: null,
});
const proposal = createPlanFragmentProposalV1({
  schemaVersion: 1,
  proposalRevision: 1,
  missionIntentId: missionIntent.missionIntentId,
  intentRevision: missionIntent.revision,
  intentDigest: missionIntent.intentDigest,
  proposerPeerId: 'peer-a',
  proposerInstanceId: 'instance-peer-a',
  semanticSlotKey: 'slot.execute',
  predecessorFragmentDigest: null,
  parentFragmentDigests: [],
  dependencyFragmentDigests: [],
  outcomeStatements: ['outcome.completed'],
  roleKey: 'role.executor',
  requiredCapabilityKeys: ['capability.execute'],
  inputReferenceDigest: digestPlanningJsonV1('plan-fragment', {
    schemaVersion: 1,
    input: 'packed',
  }),
  basisObservationDigests: [observation.observationDigest],
  requestedBudgetUnits: 10,
  workDeadline: '2026-07-30T01:00:00.000Z',
  proposedAtLogicalMs: 1,
});

function createPlanningState(peerId) {
  let state = createPlanningReducerStateV1({
    schemaVersion: 1,
    peerId,
    peerInstanceId: `instance-${peerId}`,
    missionIntent,
    selectionPolicy,
    admittedSubjects,
    logicalTimeMs: 1,
  });
  state = applyPlanning(state, {
    kind: 'observation.record',
    observation,
  });
  return state;
}

function applyPlanning(state, input) {
  const decision = reducePlanningCommandV1(
    state,
    createPlanningReducerCommandV1({
      schemaVersion: 1,
      expectedStateDigest: null,
      ...input,
    })
  );
  assert.equal(decision.status, 'applied', decision.error?.message);
  return decision.state;
}

const planningStates = Object.fromEntries(
  peerIds.map((peerId) => [peerId, createPlanningState(peerId)])
);
planningStates['peer-a'] = applyPlanning(planningStates['peer-a'], {
  kind: 'proposal.record',
  proposal,
});
planningStates['peer-a'] = applyPlanning(planningStates['peer-a'], {
  kind: 'slot.evaluate',
  semanticSlotKey: proposal.semanticSlotKey,
  candidateProposalDigests: [proposal.proposalDigest],
  decidedAtLogicalMs: 1,
});
const activeFragment = planningStates['peer-a'].planView.fragments.find(
  (fragment) => fragment.status === 'active'
);
assert.ok(activeFragment, 'peer-a must select an active fragment');
const workItemId = planningWorkItemIdV1(proposal.proposalDigest);
planningStates['peer-a'] = applyPlanning(planningStates['peer-a'], {
  kind: 'fragment.project-to-work',
  fragmentId: activeFragment.fragmentId,
  previousFragmentDigest: activeFragment.fragmentDigest,
  workTarget: {
    schemaVersion: 1,
    meshId: MESH_ID,
    objectiveId: OBJECTIVE_ID,
    workItemId,
    workItemRevision: 1,
  },
  transitionedAtLogicalMs: 1,
});
const offeredFragment = planningStates['peer-a'].planView.fragments.find(
  (fragment) =>
    fragment.fragmentId === activeFragment.fragmentId &&
    fragment.status === 'offered'
);
assert.ok(offeredFragment, 'peer-a must project its fragment to offered Work');
const projection = createPlanningLocalWorkProjectionV1({
  missionIntent,
  sourcePlanView: planningStates['peer-a'].planView,
  fragment: offeredFragment,
});
assert.equal(projection.workItemId, workItemId);
const repository = new InMemoryPlanningFragmentRepositoryV1();
repository.put(projection.repositoryRecord);

const meshStates = Object.fromEntries(
  peerIds.map((peerId) => [peerId, createMeshRuntime(peerId)])
);

for (const [peerOffset, peerId] of ['peer-b', 'peer-c'].entries()) {
  const capabilityIds = [
    `capability-planning-${peerId}`,
    `capability-execute-${peerId}`,
  ].sort();
  const card = await signed(
    envelope({
      id: 10 + peerOffset * 10,
      type: 'peer.card',
      senderPeerId: peerId,
      audience: { kind: 'mesh', topic: 'membership' },
      expiresAt: '2026-07-30T00:02:00.000Z',
      payload: {
        type: 'peer.card',
        peerCardId: `card-${peerId}`,
        cardRevision: 1,
        subjectPeerId: peerId,
        instanceId: `instance-${peerId}`,
        protocolVersions: [0],
        transportHints: [`https://${peerId}.example.test/mesh`],
        capabilityIds,
        validFrom: '2026-07-30T00:00:00.000Z',
        validUntil: '2026-07-30T00:02:00.000Z',
      },
    }),
    peerId
  );
  let discovered = evaluateVerifiedMeshDiscoveryEnvelope(
    createMeshDiscoveryRuntimeState(
      meshStates['peer-a'].coordination,
      meshStates['peer-a'].discovery
    ),
    {
      envelope: card.verified,
      verifiedAt: VERIFIED_AT,
      receivedAt: 1 + peerOffset * 3,
    }
  );
  assert.equal(discovered.accepted, true, discovered.code);
  meshStates['peer-a'] = replaceMeshDomains(meshStates['peer-a'], {
    coordination: discovered.state.coordination,
    discovery: discovered.state.discovery,
    objectives: meshStates['peer-a'].objectives,
  });

  const planningCapability = await signed(
    envelope({
      id: 11 + peerOffset * 10,
      type: 'capability.advertise',
      senderPeerId: peerId,
      audience: { kind: 'mesh', topic: 'capability' },
      expiresAt: '2026-07-30T00:02:00.000Z',
      payload: {
        type: 'capability.advertise',
        advertisementId: `advertisement-planning-${peerId}`,
        capabilityId: `capability-planning-${peerId}`,
        capabilityRevision: 1,
        ownerPeerId: peerId,
        capabilityKey: PLANNING_MESH_CAPABILITY_PROFILE_V1.capabilityKey,
        version: PLANNING_MESH_CAPABILITY_PROFILE_V1.version,
        variant: PLANNING_MESH_CAPABILITY_PROFILE_V1.variant,
        inputMediaTypes: PLANNING_MESH_CAPABILITY_PROFILE_V1.inputMediaTypes,
        outputMediaTypes: PLANNING_MESH_CAPABILITY_PROFILE_V1.outputMediaTypes,
        attributes: PLANNING_MESH_CAPABILITY_PROFILE_V1.attributes,
        validFrom: '2026-07-30T00:00:00.000Z',
        validUntil: '2026-07-30T00:02:00.000Z',
        maximumConcurrency: 1,
        maximumPayloadBytes: 262_144,
      },
    }),
    peerId
  );
  discovered = evaluateVerifiedMeshDiscoveryEnvelope(
    createMeshDiscoveryRuntimeState(
      meshStates['peer-a'].coordination,
      meshStates['peer-a'].discovery
    ),
    {
      envelope: planningCapability.verified,
      verifiedAt: VERIFIED_AT,
      receivedAt: 2 + peerOffset * 3,
      supportedCriticalExtensions: [PLANNING_WORK_EXTENSION_KEY_V1],
    }
  );
  assert.equal(discovered.accepted, true, discovered.code);
  meshStates['peer-a'] = replaceMeshDomains(meshStates['peer-a'], {
    coordination: discovered.state.coordination,
    discovery: discovered.state.discovery,
    objectives: meshStates['peer-a'].objectives,
  });

  const executionCapability = await signed(
    envelope({
      id: 12 + peerOffset * 10,
      type: 'capability.advertise',
      senderPeerId: peerId,
      audience: { kind: 'mesh', topic: 'capability' },
      expiresAt: '2026-07-30T00:02:00.000Z',
      payload: {
        type: 'capability.advertise',
        advertisementId: `advertisement-execute-${peerId}`,
        capabilityId: `capability-execute-${peerId}`,
        capabilityRevision: 1,
        ownerPeerId: peerId,
        capabilityKey: 'capability.execute',
        version: '1',
        inputMediaTypes: ['application/json'],
        outputMediaTypes: ['application/json'],
        attributes: {},
        validFrom: '2026-07-30T00:00:00.000Z',
        validUntil: '2026-07-30T00:02:00.000Z',
        maximumConcurrency: 1,
        maximumPayloadBytes: 262_144,
      },
    }),
    peerId
  );
  discovered = evaluateVerifiedMeshDiscoveryEnvelope(
    createMeshDiscoveryRuntimeState(
      meshStates['peer-a'].coordination,
      meshStates['peer-a'].discovery
    ),
    {
      envelope: executionCapability.verified,
      verifiedAt: VERIFIED_AT,
      receivedAt: 3 + peerOffset * 3,
    }
  );
  assert.equal(discovered.accepted, true, discovered.code);
  meshStates['peer-a'] = replaceMeshDomains(meshStates['peer-a'], {
    coordination: discovered.state.coordination,
    discovery: discovered.state.discovery,
    objectives: meshStates['peer-a'].objectives,
  });
}

const recipients = selectPlanningOfferRecipientsV1({
  discovery: meshStates['peer-a'].discovery,
  logicalTimeMs: 6,
  verifiedAt: VERIFIED_AT,
  localSupportedCriticalExtensions: [PLANNING_WORK_EXTENSION_KEY_V1],
  requiredCapabilityKeys: projection.work.requiredCapabilityKeys,
  maximumRecipients: 2,
});
assert.deepEqual(
  recipients.map((recipient) => recipient.peerId),
  ['peer-b', 'peer-c']
);
const incompatibleDiscovery = structuredClone(meshStates['peer-a'].discovery);
const incompatiblePlanningCapability = Object.values(
  incompatibleDiscovery.capabilities
).find(
  (capability) =>
    capability.ownerPeerId === 'peer-b' &&
    capability.capabilityKey === PLANNING_WORK_EXTENSION_KEY_V1
);
assert.ok(incompatiblePlanningCapability);
incompatiblePlanningCapability.variant = 'incompatible-profile';
assert.deepEqual(
  selectPlanningOfferRecipientsV1({
    discovery: incompatibleDiscovery,
    logicalTimeMs: 6,
    verifiedAt: VERIFIED_AT,
    localSupportedCriticalExtensions: [PLANNING_WORK_EXTENSION_KEY_V1],
    requiredCapabilityKeys: projection.work.requiredCapabilityKeys,
    maximumRecipients: 2,
  }).map((recipient) => recipient.peerId),
  ['peer-c'],
  'an inexact planning capability profile must be incompatible'
);
assert.deepEqual(
  selectPlanningOfferRecipientsV1({
    discovery: meshStates['peer-a'].discovery,
    logicalTimeMs: 6,
    verifiedAt: VERIFIED_AT,
    localSupportedCriticalExtensions: [],
    requiredCapabilityKeys: projection.work.requiredCapabilityKeys,
    maximumRecipients: 2,
  }),
  [],
  'a planning offer must not downgrade when local critical support is absent'
);

const objectiveAnnouncement = await signed(
  envelope({
    id: 40,
    type: 'objective.announce',
    senderPeerId: 'peer-a',
    audience: { kind: 'mesh', topic: 'objective' },
    objectiveId: OBJECTIVE_ID,
    payload: {
      type: 'objective.announce',
      objectiveDocumentId: OBJECTIVE_DOCUMENT_ID,
      objectiveId: OBJECTIVE_ID,
      objectiveRevision: 1,
      issuerPeerId: 'peer-a',
      successCriteria: ['The selected outcome is completed.'],
      permittedCapabilityKeys: ['capability.execute'],
      maximumWorkItems: 4,
      maximumConcurrentAssignments: 2,
      maximumBudgetUnits: 60,
      bidWindowMs: 60_000,
      acceptanceWindowMs: 30_000,
      maximumLeaseDurationMs: 3_600_000,
      recoveryGraceMs: 60_000,
      maximumLeaseRenewals: 3,
      recoveryWitnessPeerIds: ['peer-b', 'peer-c', 'peer-witness'],
      recoveryWitnessThreshold: 2,
      contentReference: `${DELEGATION_MANDATE_REFERENCE_PREFIX_V1}${mandateDigest}`,
      validFrom: '2026-07-30T00:00:00.000Z',
      validUntil: '2026-08-29T00:00:00.000Z',
    },
  }),
  'peer-a'
);
for (const peerId of peerIds) {
  const announced = evaluateVerifiedMeshObjectiveEnvelope(
    createMeshObjectiveWorkRuntimeState(
      meshStates[peerId].coordination,
      meshStates[peerId].discovery,
      meshStates[peerId].objectives
    ),
    {
      envelope: objectiveAnnouncement.verified,
      verifiedAt: VERIFIED_AT,
      receivedAt: 7,
    }
  );
  assert.equal(announced.accepted, true, announced.code);
  meshStates[peerId] = replaceMeshDomains(
    meshStates[peerId],
    announced.state,
    7
  );
}

const createdWork = evaluateMeshObjectiveWorkCommand(
  createMeshObjectiveWorkRuntimeState(
    meshStates['peer-a'].coordination,
    meshStates['peer-a'].discovery,
    meshStates['peer-a'].objectives
  ),
  { kind: 'work.create', input: projection.work },
  { verifiedAt: VERIFIED_AT, receivedAt: 8 }
);
assert.equal(createdWork.accepted, true, createdWork.code);
meshStates['peer-a'] = replaceMeshDomains(
  meshStates['peer-a'],
  createdWork.state,
  8
);

const offerId = 'offer:packed:planning:1';
const offerPayload = Object.freeze({
  type: 'work.offer',
  offerId,
  objectiveId: OBJECTIVE_ID,
  objectiveDocumentId: OBJECTIVE_DOCUMENT_ID,
  objectiveRevision: 1,
  workItemId,
  workItemRevision: 1,
  ownerPeerId: 'peer-a',
  ownerEpoch: 1,
  offerAttempt: 1,
  requiredCapabilityKeys: projection.work.requiredCapabilityKeys,
  matchingAttributes: projection.work.matchingAttributes,
  inputReference: projection.work.inputReference,
  completionCriteria: projection.work.completionCriteria,
  budgetReservationUnits: projection.work.budgetReservationUnits,
  bidDeadline: '2026-07-30T00:01:10.000Z',
  workDeadline: projection.work.workDeadline,
});
const offerEnvelopes = await Promise.all(
  recipients.map(async (recipient, index) => ({
    recipientPeerId: recipient.peerId,
    preparedAt: 9,
    envelope: (
      await signed(
        envelope({
          id: 50 + index,
          type: 'work.offer',
          senderPeerId: 'peer-a',
          audience: { kind: 'peer', peerId: recipient.peerId },
          objectiveId: OBJECTIVE_ID,
          sentAt: VERIFIED_AT,
          expiresAt: '2026-07-30T00:01:10.000Z',
          extensions: projection.extensions,
          criticalExtensions: projection.criticalExtensions,
          payload: offerPayload,
        }),
        'peer-a'
      )
    ).signed,
  }))
);
const offered = evaluateMeshAllocationCommand(
  createMeshAllocationRuntimeState(
    meshStates['peer-a'].coordination,
    meshStates['peer-a'].discovery,
    meshStates['peer-a'].objectives,
    meshStates['peer-a'].allocation
  ),
  {
    kind: 'allocation.offer',
    objectiveId: OBJECTIVE_ID,
    workItemId,
    expectedWorkItemRevision: 1,
    recipients: offerEnvelopes,
  },
  VERIFIED_AT,
  9,
  [PLANNING_WORK_EXTENSION_KEY_V1],
  recipients.map((recipient) => recipient.peerId)
);
assert.equal(offered.accepted, true, offered.code);
meshStates['peer-a'] = createMeshAllocationInboundRuntimeState(
  offered.state.coordination,
  offered.state.discovery,
  offered.state.objectives,
  offered.state.allocation,
  meshStates['peer-a'].inbound
);

const offerByPeer = Object.fromEntries(
  offerEnvelopes.map((prepared) => [
    prepared.recipientPeerId,
    prepared.envelope,
  ])
);
const degradedOffer = await signed(
  envelope({
    id: 49,
    type: 'work.offer',
    senderPeerId: 'peer-a',
    audience: { kind: 'peer', peerId: 'peer-b' },
    objectiveId: OBJECTIVE_ID,
    sentAt: VERIFIED_AT,
    expiresAt: '2026-07-30T00:01:10.000Z',
    extensions: projection.extensions,
    payload: offerPayload,
  }),
  'peer-a'
);
const beforeDowngradeMesh = meshStates['peer-b'];
const beforeDowngradePlanning = planningStates['peer-b'];
const downgraded = await createPlanningMeshInboundProcessorV1({
  processor: baseInboundProcessor,
  repository,
}).process(
  {
    mesh: beforeDowngradeMesh,
    planning: beforeDowngradePlanning,
  },
  {
    envelope: degradedOffer.signed,
    verifiedAt: VERIFIED_AT,
    receivedAt: 8,
  }
);
assert.equal(downgraded.accepted, false);
assert.equal(downgraded.code, 'planning_extension_required');
assert.equal(
  downgraded.state.mesh.coordination,
  beforeDowngradeMesh.coordination
);
assert.equal(downgraded.state.mesh.discovery, beforeDowngradeMesh.discovery);
assert.equal(downgraded.state.mesh.objectives, beforeDowngradeMesh.objectives);
assert.equal(downgraded.state.mesh.allocation, beforeDowngradeMesh.allocation);
assert.equal(downgraded.state.planning, beforeDowngradePlanning);
assert.notEqual(downgraded.state.mesh.inbound, beforeDowngradeMesh.inbound);
assert.equal(downgraded.state.mesh.inbound.lastLogicalTime, 8);
meshStates['peer-b'] = downgraded.state.mesh;

for (const peerId of ['peer-b', 'peer-c']) {
  const processor = createPlanningMeshInboundProcessorV1({
    processor: baseInboundProcessor,
    repository,
  });
  const admitted = await processor.process(
    { mesh: meshStates[peerId], planning: planningStates[peerId] },
    {
      envelope: offerByPeer[peerId],
      verifiedAt: VERIFIED_AT,
      receivedAt: 9,
    }
  );
  assert.equal(admitted.accepted, true, admitted.code);
  meshStates[peerId] = admitted.state.mesh;
  planningStates[peerId] = admitted.state.planning;
  const localHeadDigest = planningStates[peerId].planView.selectedHeads.find(
    (head) => head.semanticSlotKey === proposal.semanticSlotKey
  )?.fragmentDigest;
  assert.notEqual(
    localHeadDigest,
    projection.extension.fragmentDigest,
    'a recipient must retain its locally derived fragment digest'
  );
  assert.equal(
    planningStates[peerId].planView.workMappings[0]?.workItemId,
    workItemId
  );
}

const bids = {};
for (const [index, peerId] of ['peer-b', 'peer-c'].entries()) {
  const bidId = `bid:packed:${peerId}`;
  const bidPayload = {
    type: 'work.bid',
    bidId,
    bidRevision: 1,
    offerId,
    objectiveId: OBJECTIVE_ID,
    objectiveDocumentId: OBJECTIVE_DOCUMENT_ID,
    objectiveRevision: 1,
    workItemId,
    workItemRevision: 1,
    ownerPeerId: 'peer-a',
    ownerEpoch: 1,
    offerAttempt: 1,
    bidderPeerId: peerId,
    advertisementId: `advertisement-execute-${peerId}`,
    capabilityId: `capability-execute-${peerId}`,
    capabilityRevision: 1,
    capacityReservationUnits: 1,
    budgetUnits: index === 0 ? 8 : 9,
    bidDeadline: offerPayload.bidDeadline,
    workDeadline: offerPayload.workDeadline,
    expectedCompletionAt:
      index === 0 ? '2026-07-30T00:20:00.000Z' : '2026-07-30T00:15:00.000Z',
    bidExpiresAt: '2026-07-30T00:00:40.000Z',
    assumptions: [],
  };
  const bid = await signed(
    envelope({
      id: 60 + index,
      type: 'work.bid',
      senderPeerId: peerId,
      audience: { kind: 'peer', peerId: 'peer-a' },
      objectiveId: OBJECTIVE_ID,
      causationId: offerByPeer[peerId].messageId,
      sentAt: '2026-07-30T00:00:11.000Z',
      expiresAt: '2026-07-30T00:00:40.000Z',
      payload: bidPayload,
    }),
    peerId,
    BID_VERIFIED_AT
  );
  const locallyPrepared = evaluateMeshAllocationCommand(
    createMeshAllocationRuntimeState(
      meshStates[peerId].coordination,
      meshStates[peerId].discovery,
      meshStates[peerId].objectives,
      meshStates[peerId].allocation
    ),
    {
      kind: 'allocation.bid',
      offerId,
      preparedAt: 10,
      envelope: bid.signed,
    },
    BID_VERIFIED_AT,
    10
  );
  assert.equal(locallyPrepared.accepted, true, locallyPrepared.code);
  meshStates[peerId] = createMeshAllocationInboundRuntimeState(
    locallyPrepared.state.coordination,
    locallyPrepared.state.discovery,
    locallyPrepared.state.objectives,
    locallyPrepared.state.allocation,
    meshStates[peerId].inbound
  );
  const receivedBid = evaluateVerifiedMeshAllocationEnvelope(
    createMeshAllocationRuntimeState(
      meshStates['peer-a'].coordination,
      meshStates['peer-a'].discovery,
      meshStates['peer-a'].objectives,
      meshStates['peer-a'].allocation
    ),
    {
      envelope: bid.verified,
      verifiedAt: BID_VERIFIED_AT,
      receivedAt: 11 + index,
      supportedCriticalExtensions: [PLANNING_WORK_EXTENSION_KEY_V1],
    }
  );
  assert.equal(receivedBid.accepted, true, receivedBid.code);
  meshStates['peer-a'] = createMeshAllocationInboundRuntimeState(
    receivedBid.state.coordination,
    receivedBid.state.discovery,
    receivedBid.state.objectives,
    receivedBid.state.allocation,
    meshStates['peer-a'].inbound
  );
  bids[peerId] = bid;
}

const selected = selectMeshAllocationBid(
  createMeshAllocationRuntimeState(
    meshStates['peer-a'].coordination,
    meshStates['peer-a'].discovery,
    meshStates['peer-a'].objectives,
    meshStates['peer-a'].allocation
  ),
  { offerId, evaluatedAt: 13 }
);
assert.equal(selected.reason, 'selected');
assert.equal(selected.bid?.bidderPeerId, 'peer-b');
const winnerPeerId = selected.bid.bidderPeerId;
const awardId = 'award:packed:planning:1';
const awardPayload = {
  type: 'work.award',
  awardId,
  offerId,
  bidId: selected.bid.bidId,
  bidRevision: selected.bid.bidRevision,
  objectiveId: OBJECTIVE_ID,
  objectiveDocumentId: OBJECTIVE_DOCUMENT_ID,
  objectiveRevision: 1,
  workItemId,
  workItemRevision: 1,
  ownerPeerId: 'peer-a',
  ownerEpoch: 1,
  offerAttempt: 1,
  assigneePeerId: winnerPeerId,
  assignmentEpoch: 1,
  authorityKind: 'award',
  assignmentAuthorityId: awardId,
  fencingToken: awardId,
  budgetReservationUnits: offerPayload.budgetReservationUnits,
  workDeadline: offerPayload.workDeadline,
  leaseStartsAt: '2026-07-30T00:00:14.000Z',
  leaseExpiresAt: '2026-07-30T00:30:00.000Z',
  acceptanceDeadline: '2026-07-30T00:00:40.000Z',
};
const award = await signed(
  envelope({
    id: 70,
    type: 'work.award',
    senderPeerId: 'peer-a',
    audience: { kind: 'peer', peerId: winnerPeerId },
    objectiveId: OBJECTIVE_ID,
    causationId: bids[winnerPeerId].signed.messageId,
    sentAt: AWARD_VERIFIED_AT,
    expiresAt: '2026-07-30T00:00:40.000Z',
    payload: awardPayload,
  }),
  'peer-a',
  AWARD_VERIFIED_AT
);
const awarded = evaluateMeshAllocationCommand(
  createMeshAllocationRuntimeState(
    meshStates['peer-a'].coordination,
    meshStates['peer-a'].discovery,
    meshStates['peer-a'].objectives,
    meshStates['peer-a'].allocation
  ),
  {
    kind: 'allocation.award',
    offerId,
    bidId: selected.bid.bidId,
    bidRevision: selected.bid.bidRevision,
    recipient: {
      recipientPeerId: winnerPeerId,
      preparedAt: 14,
      envelope: award.signed,
    },
  },
  AWARD_VERIFIED_AT,
  14
);
assert.equal(awarded.accepted, true, awarded.code);
meshStates['peer-a'] = createMeshAllocationInboundRuntimeState(
  awarded.state.coordination,
  awarded.state.discovery,
  awarded.state.objectives,
  awarded.state.allocation,
  meshStates['peer-a'].inbound
);
const receivedAward = await baseInboundProcessor.process(
  meshStates[winnerPeerId],
  {
    envelope: award.signed,
    verifiedAt: AWARD_VERIFIED_AT,
    receivedAt: 14,
  }
);
assert.equal(receivedAward.accepted, true, receivedAward.code);
meshStates[winnerPeerId] = receivedAward.state;

const acceptanceId = 'acceptance:packed:planning:1';
const acceptance = await signed(
  envelope({
    id: 80,
    type: 'work.accept',
    senderPeerId: winnerPeerId,
    audience: { kind: 'peer', peerId: 'peer-a' },
    objectiveId: OBJECTIVE_ID,
    causationId: award.signed.messageId,
    sentAt: ACCEPT_VERIFIED_AT,
    expiresAt: '2026-07-30T00:00:40.000Z',
    payload: {
      type: 'work.accept',
      acceptanceId,
      awardId,
      objectiveId: OBJECTIVE_ID,
      objectiveDocumentId: OBJECTIVE_DOCUMENT_ID,
      objectiveRevision: 1,
      workItemId,
      workItemRevision: 1,
      ownerPeerId: 'peer-a',
      ownerEpoch: 1,
      assigneePeerId: winnerPeerId,
      assignmentEpoch: 1,
      assignmentAuthorityId: awardId,
      fencingToken: awardId,
      acceptanceDeadline: awardPayload.acceptanceDeadline,
    },
  }),
  winnerPeerId,
  ACCEPT_VERIFIED_AT
);
const locallyAccepted = evaluateMeshAllocationCommand(
  createMeshAllocationRuntimeState(
    meshStates[winnerPeerId].coordination,
    meshStates[winnerPeerId].discovery,
    meshStates[winnerPeerId].objectives,
    meshStates[winnerPeerId].allocation
  ),
  {
    kind: 'allocation.assignment_response',
    awardId,
    preparedAt: 15,
    envelope: acceptance.signed,
  },
  ACCEPT_VERIFIED_AT,
  15
);
assert.equal(locallyAccepted.accepted, true, locallyAccepted.code);
meshStates[winnerPeerId] = createMeshAllocationInboundRuntimeState(
  locallyAccepted.state.coordination,
  locallyAccepted.state.discovery,
  locallyAccepted.state.objectives,
  locallyAccepted.state.allocation,
  meshStates[winnerPeerId].inbound
);
const ownerAccepted = await baseInboundProcessor.process(meshStates['peer-a'], {
  envelope: acceptance.signed,
  verifiedAt: ACCEPT_VERIFIED_AT,
  receivedAt: 15,
});
assert.equal(ownerAccepted.accepted, true, ownerAccepted.code);
meshStates['peer-a'] = ownerAccepted.state;

const progress = await signed(
  envelope({
    id: 90,
    type: 'work.progress',
    senderPeerId: winnerPeerId,
    audience: { kind: 'peer', peerId: 'peer-a' },
    objectiveId: OBJECTIVE_ID,
    causationId: acceptance.signed.messageId,
    sentAt: PROGRESS_VERIFIED_AT,
    expiresAt: '2026-07-30T00:00:50.000Z',
    payload: {
      type: 'work.progress',
      progressId: 'progress:packed:planning:1',
      progressSequence: 1,
      objectiveId: OBJECTIVE_ID,
      objectiveDocumentId: OBJECTIVE_DOCUMENT_ID,
      objectiveRevision: 1,
      workItemId,
      workItemRevision: 1,
      ownerPeerId: 'peer-a',
      ownerEpoch: 1,
      assigneePeerId: winnerPeerId,
      awardId,
      acceptanceId,
      assignmentEpoch: 1,
      assignmentAuthorityId: awardId,
      fencingToken: awardId,
      leaseExpiresAt: awardPayload.leaseExpiresAt,
      progressSummary: 'The assigned planning role has started execution.',
    },
  }),
  winnerPeerId,
  PROGRESS_VERIFIED_AT
);
const locallyProgressed = evaluateMeshAllocationCommand(
  createMeshAllocationRuntimeState(
    meshStates[winnerPeerId].coordination,
    meshStates[winnerPeerId].discovery,
    meshStates[winnerPeerId].objectives,
    meshStates[winnerPeerId].allocation
  ),
  {
    kind: 'allocation.execution',
    preparedAt: 16,
    envelope: progress.signed,
  },
  PROGRESS_VERIFIED_AT,
  16
);
assert.equal(locallyProgressed.accepted, true, locallyProgressed.code);
meshStates[winnerPeerId] = createMeshAllocationInboundRuntimeState(
  locallyProgressed.state.coordination,
  locallyProgressed.state.discovery,
  locallyProgressed.state.objectives,
  locallyProgressed.state.allocation,
  meshStates[winnerPeerId].inbound
);
const ownerProgressed = await baseInboundProcessor.process(
  meshStates['peer-a'],
  {
    envelope: progress.signed,
    verifiedAt: PROGRESS_VERIFIED_AT,
    receivedAt: 16,
  }
);
assert.equal(ownerProgressed.accepted, true, ownerProgressed.code);
meshStates['peer-a'] = ownerProgressed.state;

const allocation = Object.values(
  meshStates['peer-a'].allocation.workAllocations
).find(
  (candidate) =>
    candidate.objectiveId === OBJECTIVE_ID &&
    candidate.work.workItemId === workItemId
);
assert.equal(allocation?.phase, 'active');
assert.equal(allocation?.activeAwardId, awardId);
assert.equal(allocation?.activeAcceptanceId, acceptanceId);
assert.equal(
  meshStates[winnerPeerId].allocation.assigneeAuthorities[awardId]
    ?.acceptanceId,
  acceptanceId
);

const objectiveAuthority =
  meshStates['peer-a'].objectives.objectives[OBJECTIVE_ID];
const workAuthority = Object.values(
  meshStates['peer-a'].objectives.workItems
).find((candidate) => candidate.workItemId === workItemId);
const executionAuthority = Object.values(
  meshStates[winnerPeerId].allocation.executionHeads
).find(
  (candidate) =>
    candidate.workItemId === workItemId && candidate.phase === 'active'
);
const fenceAuthority = Object.values(
  meshStates[winnerPeerId].allocation.assignmentFenceHeads
).find(
  (candidate) =>
    candidate.workItemId === workItemId && candidate.phase === 'active'
);
assert.ok(objectiveAuthority, 'the Objective authority must be materialized');
assert.ok(workAuthority, 'the Work authority must be materialized');
assert.ok(executionAuthority, 'the active execution head must be materialized');
assert.ok(fenceAuthority, 'the active assignment fence must be materialized');
assert.equal(executionAuthority.assignmentAuthorityId, awardId);
assert.equal(fenceAuthority.assignmentAuthorityId, awardId);

const winnerPlanning = planningStates[winnerPeerId];
const winnerHeadDigest = winnerPlanning.planView.selectedHeads.find(
  (head) => head.semanticSlotKey === proposal.semanticSlotKey
)?.fragmentDigest;
const winnerFragment = winnerPlanning.planView.fragments.find(
  (candidate) => candidate.fragmentDigest === winnerHeadDigest
);
assert.ok(winnerFragment, 'the winner must retain its offered planning head');
const winnerWorkMapping = winnerPlanning.planView.workMappings.find(
  (candidate) => candidate.fragmentDigest === winnerFragment.fragmentDigest
);
assert.ok(winnerWorkMapping, 'the winner must retain the real Work mapping');

const adaptiveRole = createPlanningAdaptiveRoleV1({
  source: {
    workContractId: 'work-contract:packed:planning:1',
    identity: identity(winnerPeerId),
    objective: objectiveAuthority,
    workItem: workAuthority,
    execution: executionAuthority,
    fenceHead: fenceAuthority,
    mandate: delegationMandate,
    roleKey: winnerFragment.roleKey,
    trustPolicyId: 'trust-policy:packed',
    inferencePolicyId: 'inference-policy:packed',
    maximumActionBudgetUnits: 5,
    createdAtLogicalMs: 16,
  },
  missionIntent,
  planView: winnerPlanning.planView,
  fragment: winnerFragment,
  repositoryRecord: projection.repositoryRecord,
  extension: projection.extension,
  roleBindingId: 'role-binding:packed:planning:1',
  targetStatus: 'assigned',
});
planningStates[winnerPeerId] = applyPlanning(winnerPlanning, {
  kind: 'fragment.assignment.observe',
  fragmentId: winnerFragment.fragmentId,
  previousFragmentDigest: winnerFragment.fragmentDigest,
  expectedWorkMapping: winnerWorkMapping,
  roleBinding: adaptiveRole.roleBinding,
});

const assignedHeadDigest = planningStates[
  winnerPeerId
].planView.selectedHeads.find(
  (head) => head.semanticSlotKey === proposal.semanticSlotKey
)?.fragmentDigest;
const assignedFragment = planningStates[winnerPeerId].planView.fragments.find(
  (candidate) => candidate.fragmentDigest === assignedHeadDigest
);
const currentRoleBinding = planningStates[
  winnerPeerId
].planView.activeRoleBindings.find(
  (candidate) =>
    candidate.roleBindingId === adaptiveRole.roleBinding.roleBindingId
);
assert.equal(assignedFragment?.status, 'assigned');
assert.equal(
  assignedFragment?.fragmentDigest,
  adaptiveRole.targetFragment.fragmentDigest
);
assert.equal(currentRoleBinding?.status, 'current');
assert.equal(
  currentRoleBinding?.roleBindingDigest,
  adaptiveRole.roleBinding.roleBindingDigest
);
assert.equal(adaptiveRole.workContract.status, 'active');
assert.equal(adaptiveRole.workContract.generation, 1);
assert.equal(adaptiveRole.workContract.assignment.assignedPeerId, winnerPeerId);
assert.equal(
  adaptiveRole.workContract.assignment.assignedInstanceId,
  `instance-${winnerPeerId}`
);
assert.equal(
  adaptiveRole.workContract.assignment.assignmentAuthorityId,
  executionAuthority.assignmentAuthorityId
);
assert.equal(
  adaptiveRole.workContract.assignment.assignmentEpoch,
  executionAuthority.assignmentEpoch
);
assert.equal(
  adaptiveRole.workContract.assignment.authorityGeneration,
  fenceAuthority.assignmentEpoch
);
assert.equal(
  adaptiveRole.workContract.assignment.fencingToken,
  fenceAuthority.fencingToken
);
assert.equal(
  adaptiveRole.roleBinding.assignmentAuthorityId,
  adaptiveRole.workContract.assignment.assignmentAuthorityId
);
assert.equal(
  adaptiveRole.roleBinding.assignmentEpoch,
  adaptiveRole.workContract.assignment.assignmentEpoch
);
assert.equal(
  adaptiveRole.roleBinding.authorityGeneration,
  adaptiveRole.workContract.assignment.authorityGeneration
);
assert.equal(
  adaptiveRole.roleBinding.fencingToken,
  adaptiveRole.workContract.assignment.fencingToken
);
assert.equal(
  COLLECTIVE_INTERACTION_ACCOUNTING_VERSION_V2,
  'interaction-accounting-v2'
);
assert.deepEqual(
  collectiveTraceAccountingV2('environment.observation.delivered'),
  { accountingKind: 'observation', accountingUnits: 1 }
);
assert.equal(
  auditCollectiveEnvironmentPortV1(
    Object.freeze({
      version: 1,
      initialize() {},
      observe() {},
      applyEffect() {},
      advance() {},
      snapshot() {},
      restore() {},
    })
  ).passed,
  true
);

console.log(
  JSON.stringify({
    assignment: 'intent-to-adaptive-role-assigned',
    authorityGeneration:
      adaptiveRole.workContract.assignment.authorityGeneration,
    localFragmentDigestsDiffer: true,
    noCriticalExtensionDowngrade: true,
    recipients: recipients.map((recipient) => recipient.peerId),
    winnerPeerId,
    workItemId,
  })
);
