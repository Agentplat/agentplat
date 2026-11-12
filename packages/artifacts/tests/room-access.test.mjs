import test from "node:test";
import { InMemoryArtifactStore } from "../dist/index.js";
import { artifactRoomAccessScenarios } from "../../../tests/helpers/artifact-room-access-scenarios.mjs";
test("room-shared artifacts preserve creator, writers, immutable scope, tenant and CAS", async () => {
  await artifactRoomAccessScenarios(new InMemoryArtifactStore());
});

test('Room authorization rejects historical revisions with a different persisted Room scope', async () => {
  const { ArtifactService } = await import('../dist/index.js');
  const assert = (await import('node:assert/strict')).default;
  const store = new InMemoryArtifactStore();
  const context = { tenantId: 't', actor: { actorId: 'creator', actorType: 'human' } };
  const legacy = new ArtifactService({ store });
  const ref = await legacy.create(context, { roomId: 'old', name: 'legacy', format: 'text', content: 'private old Room' });
  // Legacy trusted callers can reassign links; a sharing rollout must not expose
  // old content simply because its current head points to an accessible Room.
  await legacy.update(context, { artifactId: ref.id, expectedRevision: 1, roomId: 'new', content: 'new Room content' });
  const scoped = new ArtifactService({ store, roomAccess: async scope => scope.roomId === 'new' });
  assert.equal((await scoped.read(context, ref.id)).revision.content, 'new Room content');
  await assert.rejects(scoped.read(context, ref.id, 1), e => e.code === 'forbidden');
  await assert.rejects(scoped.listRevisions(context, ref.id), e => e.code === 'forbidden');
});
