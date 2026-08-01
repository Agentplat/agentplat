import assert from 'node:assert/strict';

import { signMeshEnvelope } from '@agentplat/mesh-crypto';
import { computeMeshDurableValueDigest } from '@agentplat/mesh/durability';
import {
  DEFAULT_MESH_HTTP_PATH,
  createMeshHttpHandler,
} from '@agentplat/mesh-http';
import {
  PostgresMeshDurableRepository,
  createPostgresPool,
} from '@agentplat/mesh-postgres';
import {
  MESH_PROTOCOL,
  MESH_SIGNATURE_ALGORITHM,
  MESH_WIRE_VERSION,
  canonicalizeMeshJsonBytes,
} from '@agentplat/mesh-protocol';
import {
  createMemoryRoomMeshIdempotencyRepository,
  createRoomMeshBridge,
} from '@agentplat/rooms-mesh';

const keys = await crypto.subtle.generateKey(MESH_SIGNATURE_ALGORITHM, true, [
  'sign',
  'verify',
]);
const envelope = await signMeshEnvelope({
  envelope: {
    protocol: MESH_PROTOCOL,
    wireVersion: MESH_WIRE_VERSION,
    messageId: 'AAAAAAAAAAAAAAAAAAAAAQ',
    tenantId: 'tenant-a',
    meshId: 'mesh-a',
    type: 'peer.ping',
    sender: { peerId: 'peer-a', instanceId: 'peer-a-1' },
    audience: { kind: 'peer', peerId: 'peer-b' },
    sequence: 1,
    sentAt: '2026-08-01T00:00:00.000Z',
    expiresAt: '2026-08-01T00:00:30.000Z',
    payload: { type: 'peer.ping' },
    proof: { algorithm: MESH_SIGNATURE_ALGORITHM, keyId: 'key-a' },
  },
  privateKey: keys.privateKey,
});
const body = canonicalizeMeshJsonBytes(envelope);
assert.equal(body.ok, true);
const handler = createMeshHttpHandler({
  target: {
    tenantId: 'tenant-a',
    meshId: 'mesh-a',
    peerId: 'peer-b',
    instanceId: 'peer-b-1',
  },
  accept: async () => ({ accepted: true }),
});
const response = await handler(
  new Request(`https://peer-b.example${DEFAULT_MESH_HTTP_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body.value,
  })
);
assert.equal(response.status, 202);
assert.match(
  await computeMeshDurableValueDigest({ stable: true }),
  /^sha256:/u
);

const pool = createPostgresPool({ max: 1 });
const postgres = new PostgresMeshDurableRepository(pool);
postgres.close();
await pool.end();

const projection = Object.freeze({
  schemaVersion: 1,
  kind: 'room.message',
  idempotencyKey: `room-mesh:sha256:${'A'.repeat(43)}`,
  tenantId: 'tenant-a',
  roomId: 'room-a',
  taskId: 'task-a',
  source: Object.freeze({
    meshId: 'mesh-a',
    messageId: 'AAAAAAAAAAAAAAAAAAAAAQ',
    messageType: 'work.progress',
    senderPeerId: 'peer-a',
    objectiveId: 'objective-a',
    workItemId: 'work-a',
    assignmentEpoch: 1,
    assignmentAuthorityId: 'award-a',
    fencingToken: 'award-a',
  }),
  input: Object.freeze({
    id: 'message-a',
    role: 'agent',
    content: 'Progress',
    metadata: Object.freeze({ bridgeId: 'bridge-a' }),
  }),
});
let applications = 0;
const bridge = createRoomMeshBridge({
  bridgeId: 'bridge-a',
  workerId: 'worker-a',
  idempotency: createMemoryRoomMeshIdempotencyRepository(),
  sink: {
    async apply() {
      applications += 1;
      return { applied: true };
    },
  },
});
assert.equal((await bridge.apply(projection)).status, 'applied');
assert.equal((await bridge.apply(projection)).status, 'duplicate');
assert.equal(applications, 1);

console.log(
  'Verified packed HTTP, durability, PostgreSQL and Rooms bridge contracts.'
);
