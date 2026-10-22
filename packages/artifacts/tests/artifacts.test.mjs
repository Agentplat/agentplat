import test from "node:test";
import assert from "node:assert/strict";
import {
  ArtifactError,
  ArtifactService,
  InMemoryArtifactStore,
  drainArtifactOutbox,
  registerArtifactTools,
} from "../dist/index.js";
import { InMemoryToolRegistry } from "../../tools/dist/index.js";
import { InMemoryEventBus } from "../../events/dist/index.js";

const tenant = (tenantId, actorId = "alice") => ({
  tenantId,
  actor: { actorId, actorType: "human" },
});
const make = (options = {}) => {
  let n = 0;
  const events = new InMemoryEventBus();
  const store = new InMemoryArtifactStore();
  const service = new ArtifactService({
    store,
    events,
    id: () => `id-${++n}`,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    ...options,
  });
  return { service, store, events };
};

test("persists content and reads exact immutable revisions", async () => {
  const { service } = make();
  const first = await service.create(tenant("t1"), {
    name: "plan.md",
    format: "markdown",
    content: "# One",
    roomId: "room-1",
    runId: "run-1",
  });
  const second = await service.update(tenant("t1"), {
    artifactId: first.id,
    expectedRevision: 1,
    content: "# Two",
    messageId: "msg-1",
  });
  assert.equal(second.revision, 2);
  assert.equal(
    (await service.read(tenant("t1"), first.id, 1)).revision.content,
    "# One",
  );
  assert.equal(
    (await service.read(tenant("t1"), first.id)).revision.content,
    "# Two",
  );
});

test("rejects stale writes and tenant or owner isolation violations", async () => {
  const { service } = make();
  const ref = await service.create(tenant("t1"), {
    name: "a.txt",
    format: "text",
    content: "secret",
  });
  await service.update(tenant("t1"), {
    artifactId: ref.id,
    expectedRevision: 1,
    content: "new",
  });
  await assert.rejects(
    service.read(tenant("t2"), ref.id),
    (e) => e.code === "not_found",
  );
  await assert.rejects(
    service.read(tenant("t1", "bob"), ref.id),
    (e) => e.code === "forbidden",
  );
  await assert.rejects(
    service.update(tenant("t1"), {
      artifactId: ref.id,
      expectedRevision: 1,
      content: "lost",
    }),
    (e) => e.code === "conflict",
  );
});

test("enforces UTF-8 byte limits, CSV shape, and inert supported formats", async () => {
  const { service } = make({ maximumContentBytes: 4 });
  await assert.rejects(
    service.create(tenant("t1"), {
      name: "a",
      format: "text",
      content: "🙂🙂🙂",
    }),
    (e) => e.code === "too_large",
  );
  await assert.rejects(
    service.create(tenant("t1"), {
      name: "a",
      format: "csv",
      content: "a,b\n1",
    }),
    (e) => e.code === "invalid",
  );
  const supported = make();
  for (const format of ["markdown", "text", "code", "csv", "html"])
    await supported.service.create(tenant(`t-${format}`), {
      name: "ok",
      format,
      content: format === "csv" ? "a,b\n1,2" : "<script>inert</script>",
    });
  const json = await supported.service.create(tenant("t-json"), {
    name: "data.json",
    format: "json",
    content: '{"ok":true,"items":[1,2]}',
  });
  assert.equal(json.mimeType, "application/json; charset=utf-8");
  await assert.rejects(
    supported.service.create(tenant("t-bad-json"), {
      name: "bad.json",
      format: "json",
      content: '{"ok":',
    }),
    (e) =>
      e.code === "invalid" && e.message === "json_content_must_be_valid_json",
  );
  await assert.rejects(
    supported.service.update(tenant("t-json"), {
      artifactId: json.id,
      expectedRevision: 1,
      content: "not-json",
    }),
    (e) => e.code === "invalid",
  );
});

test("agent tools create, read, update and publish durable reference events", async () => {
  const { service, events } = make();
  const registry = new InMemoryToolRegistry();
  await registerArtifactTools(registry, service);
  const createTool = await registry.get("agentplat.artifacts.create");
  const created = await createTool.handler.invoke(
    { name: "draft.md", format: "markdown", content: "# Draft" },
    { tenant: tenant("t1"), toolId: createTool.definition.id },
  );
  assert.equal(created.ok, true);
  const id = created.value.reference.id;
  const updateTool = await registry.get("agentplat.artifacts.update");
  const updated = await updateTool.handler.invoke(
    { artifactId: id, expectedRevision: 1, content: "# Final" },
    { tenant: tenant("t1"), toolId: updateTool.definition.id },
  );
  assert.equal(updated.ok, true);
  const readTool = await registry.get("agentplat.artifacts.read");
  const read = await readTool.handler.invoke(
    { artifactId: id },
    { tenant: tenant("t1"), toolId: readTool.definition.id },
  );
  assert.equal(read.value.revision.content, "# Final");
  assert.deepEqual(
    events.listPublished().map((event) => event.type),
    ["artifact.created", "artifact.updated"],
  );
  assert.equal(events.listPublished()[1].payload.reference.revision, 2);
});

test("outbox-capable stores commit references before delivery and allow retry", async () => {
  const store = new InMemoryArtifactStore();
  const service = new ArtifactService({
    store,
    events: {
      publish: async () => {
        throw new Error("temporary delivery failure");
      },
    },
    id: () => "event-1",
  });
  const ref = await service.create(tenant("t1"), {
    name: "retry.json",
    format: "json",
    content: '{"ok":true}',
  });
  assert.equal(
    (await service.read(tenant("t1"), ref.id)).revision.content,
    '{"ok":true}',
  );
  const delivered = [];
  assert.equal(
    await drainArtifactOutbox(store, {
      publish: async (event) => delivered.push(event),
    }),
    1,
  );
  assert.equal(delivered[0].type, "artifact.created");
  assert.equal(delivered[0].payload.reference.id, ref.id);
  assert.equal(
    await drainArtifactOutbox(store, { publish: async () => {} }),
    0,
  );
});
