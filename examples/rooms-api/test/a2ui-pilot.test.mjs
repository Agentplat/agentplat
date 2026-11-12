import assert from "node:assert/strict";
import test from "node:test";
import { RoomService, InMemoryRoomRepository } from "@agentplat/rooms";
import {
  createProposalPilot,
  validateSurface,
  mountProposalPilot,
} from "../src/a2ui/pilot.mjs";

async function fixture() {
  const service = new RoomService({ repository: new InMemoryRoomRepository() });
  const room = await service.createRoom("t", {
    title: "Proposal",
    goal: "Review",
  });
  const human = await service.addParticipant("t", room.id, {
    type: "human",
    displayName: "Reviewer",
    role: "owner",
    permissions: ["approve"],
  });
  const artifact = await service.createArtifact("t", room.id, {
    type: "proposal",
    title: "Pilot",
    content: "<script>untrusted</script>",
    contentType: "text/plain",
    provenance: {},
  });
  const approval = await service.requestApproval("t", room.id, {
    targetType: "artifact",
    targetId: artifact.id,
  });
  const pilot = createProposalPilot({
    service,
    tenantId: "t",
    participantId: human.id,
  });
  const snapshot = await pilot.snapshot(room.id);
  const action = {
    version: "1.0",
    action: {
      name: "approve",
      sourceComponentId: "approve",
      surfaceId: snapshot.surfaces[0].createSurface.surfaceId,
      timestamp: new Date().toISOString(),
      context: { comment: "Accepted" },
    },
  };
  return { service, room, human, artifact, approval, pilot, snapshot, action };
}

test("projects exact proposal content through the restricted catalog", async () => {
  const f = await fixture();
  assert.equal(validateSurface(f.snapshot.surfaces[0]), f.snapshot.surfaces[0]);
  assert.equal(
    f.snapshot.surfaces[0].createSurface.components.find(
      (c) => c.id === "content",
    ).text,
    "<script>untrusted</script>",
  );
});
test("stale version is rejected and no approval decision is committed", async () => {
  const f = await fixture();
  await f.service.resolveApproval("t", f.approval.id, "needs_revision", {
    decidedBy: f.human.id,
    comment: "Revise",
  });
  await f.service.createArtifactVersion("t", f.room.id, f.artifact.id, {
    content: "v2",
    contentType: "text/plain",
  });
  await assert.rejects(f.pilot.action(f.room.id, f.action), {
    code: "CONFLICT",
  });
  assert.equal(
    (await f.service.getRoomState("t", f.room.id)).approvals[0].status,
    "needs_revision",
  );
  assert.equal((await f.pilot.snapshot(f.room.id)).surfaces.length, 0);
});
test("simultaneous repeated clicks commit one decision; conflicting retry is rejected", async () => {
  const f = await fixture();
  const results = await Promise.all([
    f.pilot.action(f.room.id, f.action),
    f.pilot.action(f.room.id, f.action),
  ]);
  assert.equal(results[0].id, results[1].id);
  const fresh = createProposalPilot({
    service: f.service,
    tenantId: "t",
    participantId: f.human.id,
  });
  assert.equal((await fresh.action(f.room.id, f.action)).id, f.approval.id);
  await assert.rejects(
    fresh.action(f.room.id, {
      ...f.action,
      action: {
        ...f.action.action,
        name: "reject",
        sourceComponentId: "reject",
      },
    }),
    { code: "CONFLICT" },
  );
});
test("reconnection rebuilds current state and does not depend on prior UI messages", async () => {
  const f = await fixture();
  assert.deepEqual(await f.pilot.snapshot(f.room.id), f.snapshot);
  await f.pilot.action(f.room.id, f.action);
  const reconnected = createProposalPilot({
    service: f.service,
    tenantId: "t",
    participantId: f.human.id,
  });
  const current = await reconnected.snapshot(f.room.id);
  assert.notEqual(current.cursor, f.snapshot.cursor);
  assert.deepEqual(current.surfaces, []);
});
test("rejects unknown catalogs, components, functions, actions and forged authority", async () => {
  const f = await fixture();
  for (const mutate of [
    (s) => {
      s.catalogId = "remote";
    },
    (s) => {
      s.components[1].component = "HTML";
    },
    (s) => {
      s.components[1].text = { "@call": "execute" };
    },
    (s) => {
      s.components[2].onclick = "execute";
    },
  ]) {
    const message = structuredClone(f.snapshot.surfaces[0]);
    mutate(message.createSurface);
    assert.throws(() => validateSurface(message), { code: "VALIDATION_ERROR" });
  }
  for (const patch of [
    { name: "execute" },
    { context: { comment: "", decidedBy: "other" } },
    { sourceComponentId: "other" },
  ]) {
    await assert.rejects(
      f.pilot.action(f.room.id, {
        ...f.action,
        action: { ...f.action.action, ...patch },
      }),
      { code: "VALIDATION_ERROR" },
    );
  }
  const outsider = createProposalPilot({
    service: f.service,
    tenantId: "t",
    participantId: "outsider",
  });
  await assert.rejects(outsider.snapshot(f.room.id), { code: "FORBIDDEN" });
  await assert.rejects(outsider.action(f.room.id, f.action), {
    code: "FORBIDDEN",
  });
});
test("revision request uses the existing durable Approval contract", async () => {
  const f = await fixture();
  const result = await f.pilot.action(f.room.id, {
    ...f.action,
    action: {
      ...f.action.action,
      name: "requestRevision",
      sourceComponentId: "requestRevision",
      context: { comment: "Add weekly human review" },
    },
  });
  assert.equal(result.status, "needs_revision");
  assert.equal(result.decidedBy, f.human.id);
  assert.equal(
    (await f.service.getRoomState("t", f.room.id)).artifacts[0].status,
    "needs_revision",
  );
});
test("HTTP boundary requires configured bearer identity and rejects tenant-header bypass", async () => {
  const f = await fixture();
  const handlers = {};
  const app = {
    get() {},
    all(path, handler) {
      handlers.route = handler;
    },
  };
  mountProposalPilot(app, {
    service: f.service,
    token: "a".repeat(32),
    tenantId: "t",
    participantId: f.human.id,
    html: "",
  });
  const context = (token) => ({
    req: {
      method: "GET",
      header: (name) => (name === "Authorization" ? token : "t"),
      param: () => f.room.id,
    },
    json: (body, status) => ({ body, status }),
  });
  assert.equal((await handlers.route(context(undefined))).status, 401);
  assert.equal(
    (await handlers.route(context(`Bearer ${"a".repeat(32)}`))).status,
    200,
  );
});

test("real Rooms HTTP app mounts pilot, enforces auth and persists decisions", async () => {
  const { createRoomsApp } = await import("@agentplat/rooms-api");
  const f = await fixture();
  const app = createRoomsApp({ service: f.service });
  mountProposalPilot(app, {
    service: f.service,
    token: "a".repeat(32),
    tenantId: "t",
    participantId: f.human.id,
    html: "<h1>Pilot</h1>",
  });
  const url = `/experimental/a2ui/rooms/${encodeURIComponent(f.room.id)}`;
  assert.equal((await app.request(url)).status, 401);
  const headers = {
    Authorization: `Bearer ${"a".repeat(32)}`,
    "Content-Type": "application/json",
  };
  const snapshot = await app.request(url, { headers });
  assert.equal(snapshot.status, 200);
  assert.equal(snapshot.headers.get("cache-control"), "no-store");
  assert.equal((await snapshot.json()).data.surfaces.length, 1);
  for (let n = 0; n < 2; n++) {
    const result = await app.request(url, {
      method: "POST",
      headers,
      body: JSON.stringify(f.action),
    });
    assert.equal(result.status, 200);
    assert.equal((await result.json()).data.status, "approved");
  }
  const page = await app.request("/experimental/a2ui");
  assert.equal(page.status, 200);
  assert.match(
    page.headers.get("content-security-policy"),
    /object-src 'none'/,
  );
});
