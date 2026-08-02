import assert from 'node:assert/strict';

import {
  COLLECTIVE_PLANNING_SCHEMA_VERSION,
  canonicalizePlanningJsonV1,
  createMissionObservationV1,
  digestPlanningJsonV1,
  validateMissionObservationV1,
} from '@agentplat/collective-planning';

assert.equal(COLLECTIVE_PLANNING_SCHEMA_VERSION, 1);
assert.equal(
  canonicalizePlanningJsonV1({ z: 2, a: [true, null, -0] }),
  '{"a":[true,null,0],"z":2}',
);

const intentDigest = digestPlanningJsonV1('mission-intent', {
  missionIntentId: 'mission:registry-consumer',
  schemaVersion: 1,
});
const observation = createMissionObservationV1({
  schemaVersion: 1,
  observationId: 'observation:registry-consumer',
  missionIntentId: 'mission:registry-consumer',
  intentRevision: 1,
  intentDigest,
  observerPeerId: 'peer:registry-consumer',
  observerInstanceId: 'instance:registry-consumer',
  environmentCursor: 'cursor:1',
  logicalTimeMs: 1,
  visibility: 'public',
  observationKind: 'registry_smoke',
  publicValue: { available: true },
  contentReferenceDigest: null,
});

assert.deepEqual(validateMissionObservationV1(observation), observation);
assert.equal(Object.isFrozen(observation), true);
assert.match(observation.observationDigest, /^sha256:[0-9a-f]{64}$/u);

process.stdout.write(
  `${JSON.stringify({ status: 'passed', observationDigest: observation.observationDigest })}\n`,
);
