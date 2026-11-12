import assert from "node:assert/strict";
import { ArtifactService } from "../../packages/artifacts/dist/index.js";
const context = (actorId, tenantId = "t") => ({
  tenantId,
  actor: { actorId, actorType: "human" },
});
export async function artifactRoomAccessScenarios(store) {
  const members = new Set(["owner", "alice", "bob"]);
  const service = new ArtifactService({
    store,
    roomAccess: async (a) =>
      a.tenantId === "t" && a.roomId === "r" && members.has(a.actorId),
  });
  const ref = await service.create(context("alice"), {
    roomId: "r",
    name: "shared",
    format: "text",
    content: "v1",
  });
  for (const actor of members)
    assert.equal(
      (await service.read(context(actor), ref.id)).revision.content,
      "v1",
    );
  await service.update(context("bob"), {
    artifactId: ref.id,
    expectedRevision: 1,
    content: "v2",
  });
  const head = await service.read(context("owner"), ref.id);
  assert.equal(head.artifact.ownerId, "alice");
  assert.equal(head.revision.authorId, "bob");
  assert.equal(
    (await service.read(context("bob"), ref.id, 1)).revision.authorId,
    "alice",
  );
  await assert.rejects(
    service.update(context("owner"), {
      artifactId: ref.id,
      expectedRevision: 2,
      content: "moved",
      roomId: "other",
    }),
    (e) => e.code === "forbidden",
  );
  await assert.rejects(
    service.read(context("alice", "other"), ref.id),
    (e) => e.code === "not_found",
  );
  await assert.rejects(
    service.create(context("alice"), {
      roomId: "other",
      name: "x",
      format: "text",
      content: "x",
    }),
    (e) => e.code === "forbidden",
  );
  const results = await Promise.allSettled(
    ["owner", "alice"].map((actor) =>
      service.update(context(actor), {
        artifactId: ref.id,
        expectedRevision: 2,
        content: actor,
      }),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await service.listRevisions(context("bob"), ref.id)).length, 3);
  members.delete("alice");
  await assert.rejects(
    service.listRevisions(context("alice"), ref.id),
    (e) => e.code === "forbidden",
  );
  await assert.rejects(
    service.read(context("alice"), ref.id),
    (e) => e.code === "forbidden",
  );
  await assert.rejects(
    service.read(context("alice"), ref.id, 1),
    (e) => e.code === "forbidden",
  );
  await assert.rejects(
    service.update(context("alice"), {
      artifactId: ref.id,
      expectedRevision: 3,
      content: "revoked",
    }),
    (e) => e.code === "forbidden",
  );
}
