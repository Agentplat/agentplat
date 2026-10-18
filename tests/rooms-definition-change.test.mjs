import test from "node:test";
import assert from "node:assert/strict";
import { definitionChangeFixture as fixture } from "./helpers/definition-change-fixture.mjs";

test("definition change requires exact approval and evaluation; selects suspended revision with replay and reversal", async () => {
  const f = await fixture(),
    p = await f.proposal(...f.revisions, 0, "promote");
  await assert.rejects(f.service.apply("owner", p.request), /approval/);
  await p.approve();
  await assert.rejects(f.service.apply("stranger", p.request), /owner/);
  f.setPassed(false);
  await assert.rejects(f.service.apply("owner", p.request), /evaluation/);
  f.setPassed(true);
  const selected = await f.service.apply("owner", p.request);
  assert.equal(
    selected.configuration.definitionRevisionId,
    f.revisions[1].revisionId,
  );
  assert.equal(selected.status, "suspended");
  assert.deepEqual(await f.service.apply("owner", p.request), selected);
  const reverse = await f.proposal(
    f.revisions[1],
    f.revisions[0],
    selected.revision,
    "reverse",
  );
  await reverse.approve();
  await assert.rejects(
    f.service.apply("owner", { ...reverse.request, operationId: "promote" }),
    { code: "CONFLICT" },
  );
  const reversed = await f.service.apply("owner", reverse.request);
  assert.equal(
    reversed.configuration.definitionRevisionId,
    f.revisions[0].revisionId,
  );
  assert.equal(reversed.status, "suspended");
});
test("changed governance base invalidates an otherwise approved candidate", async () => {
  const f = await fixture(),
    p = await f.proposal(...f.revisions, 0, "promote");
  await p.approve();
  await f.governance.execute("owner", {
    agentId: "a",
    operationId: "edit",
    expectedRevision: 0,
    command: { kind: "purpose", purpose: "Updated" },
  });
  await assert.rejects(f.service.apply("owner", p.request), {
    code: "CONFLICT",
  });
});

test("approval of an earlier proposal version cannot select a revised candidate", async () => {
  const f = await fixture(),
    p = await f.proposal(...f.revisions, 0, "promote");
  await p.approve();
  await f.rooms.createArtifactVersion(
    "t",
    p.request.roomId,
    p.request.artifactId,
    { content: { changed: true } },
  );
  await assert.rejects(f.service.apply("owner", p.request), /approval/);
  assert.equal((await f.governance.get("owner", "a")).revision, 0);
});

test("review coordinates are audited and conflicting approval reuse cannot replay", async () => {
  const f = await fixture(),
    first = await f.proposal(...f.revisions, 0, "same-operation");
  await first.approve();
  await f.service.apply("owner", first.request);
  const history = await f.governance.history("owner", "a");
  assert.equal(history.at(-1).review.approvalId, first.request.approvalId);
  const replacement = await f.proposal(...f.revisions, 0, "same-operation");
  await replacement.approve();
  await assert.rejects(f.service.apply("owner", replacement.request), {
    code: "CONFLICT",
  });
});
test("a proposal changed while evaluation is pending cannot select a definition", async () => {
  let pending;
  const f = await fixture({
    onEvaluate: async (rooms) => {
      await rooms.createArtifactVersion(
        "t",
        pending.roomId,
        pending.artifactId,
        { content: { replacement: true } },
      );
    },
  });
  const p = await f.proposal(...f.revisions, 0, "race");
  pending = p.request;
  await p.approve();
  await assert.rejects(f.service.apply("owner", p.request), /changed/);
  assert.equal((await f.governance.get("owner", "a")).revision, 0);
});
test("evaluation expiring during validation fails closed", async () => {
  let now = "2026-10-17T12:00:00.000Z";
  const f = await fixture({
    clock: () => new Date(now),
    expiresAt: "2026-10-17T13:00:00.000Z",
    onEvaluate: async () => {
      now = "2026-10-17T14:00:00.000Z";
    },
  });
  const p = await f.proposal(...f.revisions, 0, "expire");
  await p.approve();
  await assert.rejects(f.service.apply("owner", p.request), /evaluation/i);
  assert.equal((await f.governance.get("owner", "a")).revision, 0);
});

test("approval expiring during evaluation cannot select a definition", async () => {
  let now = "2026-10-17T12:00:00.000Z";
  const f = await fixture({
    clock: () => new Date(now),
    approvalExpiresAt: "2026-10-17T13:00:00.000Z",
    onEvaluate: async () => {
      now = "2026-10-17T14:00:00.000Z";
    },
  });
  const p = await f.proposal(...f.revisions, 0, "expire-approval");
  await p.approve();
  await assert.rejects(f.service.apply("owner", p.request), /expired/i);
  assert.equal((await f.governance.get("owner", "a")).revision, 0);
});

test("evaluator expiry must be canonical UTC rather than lexically compared offsets", async () => {
  const f = await fixture({
    clock: () => new Date("2026-10-17T13:00:00.000Z"),
    expiresAt: "2026-10-17T14:00:00+02:00",
  });
  const p = await f.proposal(...f.revisions, 0, "offset-expiry");
  await p.approve();
  await assert.rejects(f.service.apply("owner", p.request), /evaluation/i);
  assert.equal((await f.governance.get("owner", "a")).revision, 0);
});
