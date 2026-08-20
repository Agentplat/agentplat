#!/usr/bin/env node

import assert from 'node:assert/strict';
import { deriveConvergenceMetricsV1 } from '../packages/mesh-sim/dist/index.js';

const digest = (hex) => `sha256:${hex.repeat(64 / hex.length)}`;
const stateA = digest('a');
const stateB = digest('b');

function event({ id, time, peer, state, units, kind = 'peer.decision.accepted', faultBinding = null }) {
  return {
    eventId: id,
    logicalTimeMs: time,
    peerId: peer,
    kind,
    status: 'accepted',
    reasonCode: null,
    accountingKind: kind === 'peer.decision.accepted' ? 'decision' : null,
    accountingUnits: units,
    stateDigestAfter: state,
    traceChainDigest: digest(id.slice(-1)),
    previousTraceChainDigest: null,
    faultBinding,
  };
}

const nominal = deriveConvergenceMetricsV1([
  event({ id: 'decision-a', time: 10, peer: 'peer-a', state: stateA, units: 2 }),
  event({ id: 'decision-b', time: 10, peer: 'peer-b', state: stateA, units: 3 }),
  event({ id: 'decision-c', time: 10, peer: 'peer-c', state: stateA, units: 4 }),
], 'nominal');
assert.equal(nominal.healthyParticipantCount, 3);
assert.equal(nominal.agreeingParticipantCount, 3);
assert.equal(nominal.interactionsToAgreement, 9);
assert.equal(nominal.agreementEventId, 'decision-c');
assert.equal(nominal.healOrQuiescenceEventId, 'decision-c');

const resilient = deriveConvergenceMetricsV1([
  event({
    id: 'fault-observed',
    time: 5,
    peer: 'peer-a',
    state: null,
    units: 1,
    kind: 'fault.observed',
    faultBinding: { faultFamily: 'network.partition' },
  }),
  event({
    id: 'network-heal',
    time: 6,
    peer: 'peer-a',
    state: null,
    units: 1,
    kind: 'fault.observed',
    faultBinding: { faultFamily: 'network.heal' },
  }),
  event({ id: 'decision-d', time: 7, peer: 'peer-a', state: stateB, units: 2 }),
  event({ id: 'decision-e', time: 7, peer: 'peer-b', state: stateB, units: 2 }),
], 'benign');
assert.equal(resilient.healthyParticipantCount, 2);
assert.equal(resilient.agreeingParticipantCount, 2);
assert.equal(resilient.interactionsToAgreement, 6);
assert.equal(resilient.healOrQuiescenceEventId, 'network-heal');

process.stdout.write(`${JSON.stringify({ status: 'passed', nominal, resilient })}\n`);
