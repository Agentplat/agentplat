import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { canonicalizeMeshPayload } from '@agentplat/mesh-protocol';
import {
  createMeshAllocationRuntimeState,
  createMeshAllocationState,
  createMeshCoordinationState,
  createMeshDiscoveryRuntimeState,
  createMeshDiscoveryState,
  createMeshObjectiveWorkRuntimeState,
  createMeshObjectiveWorkState,
  evaluateMeshAllocationCommand,
  evaluateVerifiedMeshAllocationEnvelope,
  evaluateVerifiedMeshDiscoveryEnvelope,
  evaluateVerifiedMeshObjectiveEnvelope,
  matchMeshDiscoveryCapabilities,
  restoreMeshAllocationState,
  restoreMeshCoordinationState,
  restoreMeshDiscoveryState,
} from '@agentplat/mesh/coordination';

import {
  replayCollectiveClosedLoopFaultMatrixV1,
  runCollectiveClosedLoopFaultMatrixV1,
} from '@agentplat/mesh-sim';

const fixtureRoot = new URL(
  '../packages/mesh-protocol/fixtures/v0/',
  import.meta.url
);
const fixture = (name) =>
  JSON.parse(readFileSync(new URL(name, fixtureRoot), 'utf8'));

function messageId(number) {
  const bytes = Buffer.alloc(16);
  bytes.writeUInt32BE(number, 12);
  return bytes.toString('base64url');
}

function hashed(envelope) {
  const value = structuredClone(envelope);
  const canonical = canonicalizeMeshPayload(value.payload);
  assert.equal(canonical.ok, true);
  value.payloadHash = `sha256:${createHash('sha256').update(canonical.value).digest('base64url')}`;
  return value;
}

function allocationEnvelope(
  source,
  {
    id,
    sequence,
    senderPeerId,
    recipientPeerId,
    causationId,
    sentAt,
    expiresAt,
    payload,
  }
) {
  const envelope = structuredClone(source);
  envelope.messageId = messageId(id);
  envelope.sequence = sequence;
  envelope.sender = {
    peerId: senderPeerId,
    instanceId: `instance-${senderPeerId.slice(-1)}`,
  };
  envelope.audience = { kind: 'peer', peerId: recipientPeerId };
  envelope.proof.keyId = `key-${senderPeerId.slice(-1)}`;
  if (sentAt !== undefined) envelope.sentAt = sentAt;
  if (expiresAt !== undefined) envelope.expiresAt = expiresAt;
  if (causationId === undefined) delete envelope.causationId;
  else envelope.causationId = causationId;
  Object.assign(envelope.payload, payload);
  return hashed(envelope);
}

function allocationRuntimeForPeerB() {
  const identity = {
    tenantId: 'tenant-a',
    meshId: 'mesh-a',
    peerId: 'peer-b',
    instanceId: 'instance-b',
    keyId: 'key-b',
  };
  let state = createMeshAllocationRuntimeState(
    createMeshCoordinationState({ identity }),
    createMeshDiscoveryState({
      identity,
      subscriptions: ['membership', 'capability', 'objective'],
      admittedPeers: [
        {
          peerId: 'peer-a',
          instanceIds: ['instance-a'],
          validUntil: '2027-01-01T00:00:00.000Z',
        },
      ],
    }),
    createMeshObjectiveWorkState({
      identity,
      issuerAuthorities: [
        {
          peerId: 'peer-a',
          keyIds: ['key-a'],
          validUntil: '2027-01-01T00:00:00.000Z',
        },
      ],
    }),
    createMeshAllocationState({ identity })
  );
  const objective = evaluateVerifiedMeshObjectiveEnvelope(
    createMeshObjectiveWorkRuntimeState(
      state.coordination,
      state.discovery,
      state.objectives
    ),
    {
      envelope: hashed(fixture('objective-announce.json')),
      verifiedAt: '2026-07-30T00:00:04.000Z',
      receivedAt: 1,
    }
  );
  assert.equal(objective.accepted, true, objective.code);
  state = createMeshAllocationRuntimeState(
    objective.state.coordination,
    objective.state.discovery,
    objective.state.objectives,
    restoreMeshAllocationState({ ...state.allocation, lastLogicalTime: 1 })
  );
  return state;
}

function event(eventId, targetPeerId, logicalTime, action, sourcePeerId) {
  return {
    eventId,
    targetPeerId,
    ...(sourcePeerId === undefined
      ? {}
      : { sourcePeerId, scheduledAt: logicalTime }),
    logicalTime,
    priority: 10,
    action,
  };
}

function input(overrides = {}) {
  const scenario = {
    schemaVersion: 1,
    scenarioId: 'closed-loop-fault-matrix-v1',
    seed: 0x5a17,
    prngVersion: 'xorshift32-v1',
    peers: [
      {
        peerId: 'peer-a',
        state: { declined: false, offerAttempt: 1, deliveries: 0 },
      },
      { peerId: 'peer-b', state: { eligible: true, deliveries: 0 } },
    ],
    links: [
      { fromPeerId: 'peer-a', toPeerId: 'peer-b', latency: 0, enabled: true },
      { fromPeerId: 'peer-b', toPeerId: 'peer-a', latency: 0, enabled: true },
    ],
    events: [
      event('withdraw-capability', 'peer-b', 1, {
        kind: 'capability.withdraw',
      }),
      event('decline-award', 'peer-a', 2, { kind: 'work.decline' }),
      event('reoffer-attempt-2', 'peer-a', 3, {
        kind: 'work.reoffer',
        attempt: 2,
      }),
      event(
        'delivery-during-crash',
        'peer-b',
        4,
        { kind: 'delivery' },
        'peer-a'
      ),
      event(
        'delivery-after-restart',
        'peer-b',
        5,
        { kind: 'delivery' },
        'peer-a'
      ),
      event(
        'delivery-during-partition',
        'peer-b',
        6,
        { kind: 'delivery' },
        'peer-a'
      ),
      event('delivery-after-heal', 'peer-b', 7, { kind: 'delivery' }, 'peer-a'),
    ],
    faultPlan: {
      schemaVersion: 1,
      faults: [
        {
          faultId: 'crash-b',
          kind: 'peer.crash',
          peerId: 'peer-b',
          logicalTime: 4,
          priority: -10,
        },
        {
          faultId: 'restart-b',
          kind: 'peer.resume',
          peerId: 'peer-b',
          logicalTime: 5,
          priority: -10,
        },
        {
          faultId: 'partition-a-b',
          kind: 'network.partition',
          links: [{ fromPeerId: 'peer-a', toPeerId: 'peer-b' }],
          logicalTime: 6,
          priority: -10,
        },
        {
          faultId: 'heal-a-b',
          kind: 'network.heal',
          links: [{ fromPeerId: 'peer-a', toPeerId: 'peer-b' }],
          logicalTime: 7,
          priority: -10,
        },
      ],
    },
    limits: {
      maximumEvents: 64,
      maximumLogicalTime: 100,
      maximumQueuedEvents: 64,
      maximumStateBytes: 64 * 1024,
    },
  };
  const runtime = {
    driverId: 'closed-loop-fault-matrix-domain-adapter-v1',
    projectionId: 'closed-loop-fault-matrix-domain-projection-v1',
    reduce({ state, action }) {
      if (action.kind === 'capability.withdraw')
        return { accepted: true, state: { ...state, eligible: false } };
      if (action.kind === 'work.decline')
        return { accepted: true, state: { ...state, declined: true } };
      if (action.kind === 'work.reoffer')
        return state.declined === true &&
          action.attempt === state.offerAttempt + 1
          ? {
              accepted: true,
              state: { ...state, offerAttempt: action.attempt },
            }
          : { accepted: false, rejectionCode: 'reoffer_not_causal', state };
      if (action.kind === 'delivery')
        return {
          accepted: true,
          state: { ...state, deliveries: state.deliveries + 1 },
        };
      throw new TypeError('unknown domain action');
    },
    project(state) {
      return state;
    },
  };
  const faults = [
    {
      schemaVersion: 1,
      faultId: 'withdraw-b',
      family: 'capability.withdraw',
      logicalTime: 1,
      injection: {
        schemaVersion: 1,
        kind: 'reducer_event',
        eventId: 'withdraw-capability',
      },
      causalPredecessorFaultId: null,
    },
    {
      schemaVersion: 1,
      faultId: 'decline-a',
      family: 'assignment.decline',
      logicalTime: 2,
      injection: {
        schemaVersion: 1,
        kind: 'reducer_event',
        eventId: 'decline-award',
      },
      causalPredecessorFaultId: null,
      reofferEventId: 'reoffer-attempt-2',
      declinedOfferAttempt: 1,
      reofferAttempt: 2,
    },
    {
      schemaVersion: 1,
      faultId: 'crash-b',
      family: 'peer.crash',
      logicalTime: 4,
      injection: {
        schemaVersion: 1,
        kind: 'driver_fault',
        simulationFaultId: 'crash-b',
      },
      causalPredecessorFaultId: null,
    },
    {
      schemaVersion: 1,
      faultId: 'restart-b',
      family: 'peer.restart',
      logicalTime: 5,
      injection: {
        schemaVersion: 1,
        kind: 'driver_fault',
        simulationFaultId: 'restart-b',
      },
      causalPredecessorFaultId: 'crash-b',
    },
    {
      schemaVersion: 1,
      faultId: 'partition-a-b',
      family: 'network.partition',
      logicalTime: 6,
      injection: {
        schemaVersion: 1,
        kind: 'driver_fault',
        simulationFaultId: 'partition-a-b',
      },
      causalPredecessorFaultId: null,
    },
    {
      schemaVersion: 1,
      faultId: 'heal-a-b',
      family: 'network.heal',
      logicalTime: 7,
      injection: {
        schemaVersion: 1,
        kind: 'driver_fault',
        simulationFaultId: 'heal-a-b',
      },
      causalPredecessorFaultId: 'partition-a-b',
    },
  ];
  const observations = faults.map(({ faultId }) => ({
    faultId,
    observe({ trace }) {
      if (faultId === 'withdraw-b')
        return trace.peerStates['peer-b'].eligible === false;
      if (faultId === 'decline-a')
        return trace.peerStates['peer-a'].offerAttempt === 2;
      if (faultId === 'crash-b')
        return (
          trace.faults
            .find((fault) => fault.faultId === 'crash-b')
            ?.affectedEventIds.includes('delivery-during-crash') === true
        );
      if (faultId === 'restart-b')
        return (
          trace.records.find(
            (record) => record.eventId === 'delivery-after-restart'
          )?.accepted === true
        );
      if (faultId === 'partition-a-b')
        return (
          trace.faults
            .find((fault) => fault.faultId === 'partition-a-b')
            ?.affectedEventIds.includes('delivery-during-partition') === true
        );
      return (
        trace.records.find((record) => record.eventId === 'delivery-after-heal')
          ?.accepted === true
      );
    },
  }));
  return {
    schemaVersion: 1,
    scenario,
    runtime,
    faults,
    observations,
    ...overrides,
  };
}

test('executes concrete domain and transport faults with deterministic evidence', async () => {
  const result = await runCollectiveClosedLoopFaultMatrixV1(input());
  assert.equal(result.records.length, 6);
  assert.deepEqual(
    result.records.map(({ faultId }) => faultId),
    [
      'withdraw-b',
      'decline-a',
      'crash-b',
      'restart-b',
      'partition-a-b',
      'heal-a-b',
    ]
  );
  assert.equal(
    result.records.every(({ observed }) => observed),
    true
  );
  assert.equal(result.trace.peerStates['peer-b'].eligible, false);
  assert.equal(result.trace.peerStates['peer-a'].offerAttempt, 2);
  assert.equal(
    result.trace.records.some(
      ({ eventId }) => eventId === 'delivery-during-crash'
    ),
    false
  );
  assert.equal(
    result.trace.records.some(
      ({ eventId }) => eventId === 'delivery-during-partition'
    ),
    false
  );
  const replay = await replayCollectiveClosedLoopFaultMatrixV1(input(), result);
  assert.equal(replay.matches, true);
});

test('a signed Mesh capability withdrawal is observed as no longer eligible', async () => {
  const identity = {
    tenantId: 'tenant-a',
    meshId: 'mesh-a',
    peerId: 'peer-b',
    instanceId: 'instance-b',
    keyId: 'key-b',
  };
  const discoveryState = createMeshDiscoveryRuntimeState(
    createMeshCoordinationState({ identity }),
    createMeshDiscoveryState({
      identity,
      subscriptions: ['membership', 'capability'],
      admittedPeers: [
        {
          peerId: 'peer-a',
          instanceIds: ['instance-a'],
          validUntil: '2027-01-01T00:00:00.000Z',
        },
      ],
    })
  );
  const inbound = (envelope) => ({ kind: 'discovery.inbound', envelope });
  const matrix = {
    schemaVersion: 1,
    scenario: {
      schemaVersion: 1,
      scenarioId: 'real-mesh-capability-withdrawal',
      seed: 9,
      prngVersion: 'xorshift32-v1',
      peers: [{ peerId: 'peer-b', state: discoveryState }],
      links: [],
      events: [
        event('peer-card', 'peer-b', 1, inbound(fixture('peer-card.json'))),
        event(
          'capability-advertise',
          'peer-b',
          2,
          inbound(fixture('capability-advertise.json'))
        ),
        event(
          'capability-withdraw',
          'peer-b',
          3,
          inbound(fixture('capability-withdraw.json'))
        ),
      ],
      faultPlan: { schemaVersion: 1, faults: [] },
      limits: {
        maximumEvents: 16,
        maximumLogicalTime: 10,
        maximumQueuedEvents: 16,
        maximumStateBytes: 128 * 1024,
      },
    },
    runtime: {
      driverId: 'mesh-discovery-reducer-v1',
      projectionId: 'mesh-discovery-capability-projection-v1',
      reduce({ state, action, logicalTime }) {
        const decision = evaluateVerifiedMeshDiscoveryEnvelope(state, {
          envelope: action.envelope,
          verifiedAt: '2026-07-30T00:00:01.000Z',
          receivedAt: logicalTime,
        });
        return decision.accepted
          ? { accepted: true, state: decision.state }
          : {
              accepted: false,
              state: decision.state,
              rejectionCode: decision.code,
            };
      },
      project(state) {
        return Object.values(state.discovery.capabilities)
          .map(({ status }) => status)
          .sort();
      },
    },
    faults: [
      {
        schemaVersion: 1,
        faultId: 'withdraw-a',
        family: 'capability.withdraw',
        logicalTime: 3,
        injection: {
          schemaVersion: 1,
          kind: 'reducer_event',
          eventId: 'capability-withdraw',
        },
        causalPredecessorFaultId: null,
      },
    ],
    observations: [
      {
        faultId: 'withdraw-a',
        observe({ trace }) {
          const state = trace.peerStates['peer-b'];
          const runtime = createMeshDiscoveryRuntimeState(
            restoreMeshCoordinationState(state.coordination),
            restoreMeshDiscoveryState(state.discovery)
          );
          return (
            matchMeshDiscoveryCapabilities(
              runtime,
              {
                capabilityKeys: ['summarize'],
                attributes: { language: 'en' },
                fanout: 1,
              },
              3
            ).matches.length === 0
          );
        },
      },
    ],
  };
  const result = await runCollectiveClosedLoopFaultMatrixV1(matrix);
  assert.equal(result.records[0].observed, true);
});

test('a real Mesh assignment decline permits only its causal next offer attempt', async () => {
  const offerA = allocationEnvelope(fixture('work-offer.json'), {
    id: 700,
    sequence: 700,
    senderPeerId: 'peer-a',
    recipientPeerId: 'peer-b',
    causationId: undefined,
    payload: { offerId: 'offer-a', offerAttempt: 1, ownerPeerId: 'peer-a' },
  });
  const bidA = allocationEnvelope(fixture('work-bid.json'), {
    id: 701,
    sequence: 701,
    senderPeerId: 'peer-b',
    recipientPeerId: 'peer-a',
    causationId: offerA.messageId,
    payload: {
      bidId: 'bid-b',
      offerId: 'offer-a',
      ownerPeerId: 'peer-a',
      bidderPeerId: 'peer-b',
      offerAttempt: 1,
      advertisementId: 'advertisement-b',
      capabilityId: 'capability-b',
    },
  });
  const awardA = allocationEnvelope(fixture('work-award.json'), {
    id: 702,
    sequence: 702,
    senderPeerId: 'peer-a',
    recipientPeerId: 'peer-b',
    causationId: bidA.messageId,
    sentAt: '2026-07-30T00:00:02.000Z',
    expiresAt: '2026-07-30T00:00:12.000Z',
    payload: {
      awardId: 'award-a',
      offerId: 'offer-a',
      bidId: 'bid-b',
      offerAttempt: 1,
      ownerPeerId: 'peer-a',
      assigneePeerId: 'peer-b',
      assignmentAuthorityId: 'award-a',
      fencingToken: 'award-a',
      acceptanceDeadline: '2026-07-30T00:00:15.000Z',
      leaseExpiresAt: '2026-07-30T00:00:25.000Z',
    },
  });
  const declineA = allocationEnvelope(fixture('work-decline.json'), {
    id: 703,
    sequence: 703,
    senderPeerId: 'peer-b',
    recipientPeerId: 'peer-a',
    causationId: awardA.messageId,
    sentAt: '2026-07-30T00:00:03.000Z',
    expiresAt: '2026-07-30T00:00:12.000Z',
    payload: {
      declineId: 'decline-a',
      awardId: 'award-a',
      ownerPeerId: 'peer-a',
      assigneePeerId: 'peer-b',
      assignmentAuthorityId: 'award-a',
      fencingToken: 'award-a',
      acceptanceDeadline: '2026-07-30T00:00:15.000Z',
    },
  });
  const offerB = allocationEnvelope(fixture('work-offer.json'), {
    id: 704,
    sequence: 704,
    senderPeerId: 'peer-a',
    recipientPeerId: 'peer-b',
    causationId: offerA.messageId,
    payload: {
      offerId: 'offer-b',
      offerAttempt: 2,
      previousOfferId: 'offer-a',
      ownerPeerId: 'peer-a',
    },
  });
  const inbound = (envelope) => ({ kind: 'inbound', envelope });
  const command = (value) => ({ kind: 'command', value });
  const matrix = {
    schemaVersion: 1,
    scenario: {
      schemaVersion: 1,
      scenarioId: 'real-mesh-assignment-decline',
      seed: 10,
      prngVersion: 'xorshift32-v1',
      peers: [{ peerId: 'peer-b', state: allocationRuntimeForPeerB() }],
      links: [],
      events: [
        event('offer-a', 'peer-b', 2, inbound(offerA)),
        event(
          'bid-a',
          'peer-b',
          3,
          command({
            kind: 'allocation.bid',
            offerId: 'offer-a',
            preparedAt: 3,
            envelope: bidA,
          })
        ),
        event('award-a', 'peer-b', 4, inbound(awardA)),
        event(
          'decline-a',
          'peer-b',
          5,
          command({
            kind: 'allocation.assignment_response',
            awardId: 'award-a',
            preparedAt: 5,
            envelope: declineA,
          })
        ),
        event('offer-b', 'peer-b', 6, inbound(offerB)),
      ],
      faultPlan: { schemaVersion: 1, faults: [] },
      limits: {
        maximumEvents: 32,
        maximumLogicalTime: 20,
        maximumQueuedEvents: 32,
        maximumStateBytes: 512 * 1024,
      },
    },
    runtime: {
      driverId: 'mesh-allocation-reducer-v1',
      projectionId: 'mesh-allocation-decline-projection-v1',
      reduce({ state, action, logicalTime }) {
        const decision =
          action.kind === 'inbound'
            ? evaluateVerifiedMeshAllocationEnvelope(state, {
                envelope: action.envelope,
                verifiedAt: '2026-07-30T00:00:04.000Z',
                receivedAt: logicalTime,
              })
            : evaluateMeshAllocationCommand(
                state,
                action.value,
                '2026-07-30T00:00:04.000Z',
                logicalTime
              );
        return decision.accepted
          ? {
              accepted: true,
              state: decision.state,
              effects: decision.effects ?? [],
            }
          : {
              accepted: false,
              state: decision.state,
              rejectionCode: decision.code,
            };
      },
      project(state) {
        return {
          offers: Object.keys(state.allocation.receivedOffers).sort(),
          awards: Object.keys(state.allocation.receivedAwards).sort(),
        };
      },
    },
    faults: [
      {
        schemaVersion: 1,
        faultId: 'decline-a',
        family: 'assignment.decline',
        logicalTime: 5,
        injection: {
          schemaVersion: 1,
          kind: 'reducer_event',
          eventId: 'decline-a',
        },
        causalPredecessorFaultId: null,
        reofferEventId: 'offer-b',
        declinedOfferAttempt: 1,
        reofferAttempt: 2,
      },
    ],
    observations: [
      {
        faultId: 'decline-a',
        observe({ trace }) {
          const allocation = trace.peerStates['peer-b'].allocation;
          return (
            allocation.receivedAwards['award-a'].status === 'declined' &&
            allocation.receivedOffers['offer-b'].envelope.payload
              .offerAttempt === 2
          );
        },
      },
    ],
  };
  const result = await runCollectiveClosedLoopFaultMatrixV1(matrix);
  assert.equal(result.records[0].observed, true);
});

test('rejects declared-only events and impossible recovery pairs before running', async () => {
  const declaredOnly = input();
  declaredOnly.faults[0].injection.eventId = 'missing-withdrawal';
  await assert.rejects(
    runCollectiveClosedLoopFaultMatrixV1(declaredOnly),
    /fault_matrix_declared_only/u
  );

  const wrongInjectionTime = input();
  wrongInjectionTime.faults[0].logicalTime = 2;
  await assert.rejects(
    runCollectiveClosedLoopFaultMatrixV1(wrongInjectionTime),
    /fault_matrix_injection_time_mismatch/u
  );

  const extraDriverFault = input();
  extraDriverFault.scenario.faultPlan.faults.push({
    faultId: 'undeclared-extra-crash',
    kind: 'peer.crash',
    peerId: 'peer-a',
    logicalTime: 8,
    priority: -10,
  });
  await assert.rejects(
    runCollectiveClosedLoopFaultMatrixV1(extraDriverFault),
    /fault_matrix_driver_coverage_invalid/u
  );

  const restartWithoutCrash = input();
  restartWithoutCrash.faults = restartWithoutCrash.faults.filter(
    (fault) => fault.faultId !== 'crash-b'
  );
  restartWithoutCrash.observations = restartWithoutCrash.observations.filter(
    (observation) => observation.faultId !== 'crash-b'
  );
  await assert.rejects(
    runCollectiveClosedLoopFaultMatrixV1(restartWithoutCrash),
    /fault_matrix_restart_without_crash/u
  );

  const healWithoutPartition = input();
  healWithoutPartition.faults = healWithoutPartition.faults.map((fault) =>
    fault.faultId === 'heal-a-b'
      ? { ...fault, causalPredecessorFaultId: null }
      : fault
  );
  await assert.rejects(
    runCollectiveClosedLoopFaultMatrixV1(healWithoutPartition),
    /fault_matrix_heal_without_partition/u
  );
});
