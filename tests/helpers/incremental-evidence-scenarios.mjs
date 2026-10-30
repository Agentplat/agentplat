import assert from "node:assert/strict";
import { IncrementalEvidenceServiceV1 } from "@agentplat/events";

export const scope = { consumerId: "personal", source: "mail" };
const collector = { tenantId: "tenant", actorId: "collector" },
  worker = { tenantId: "tenant", actorId: "worker" },
  owner = { tenantId: "tenant", actorId: "owner" };
export function evidenceFixture(store) {
  let now = "2026-10-28T12:00:00.000Z",
    enabled = true;
  const access = {
    authenticate: async (context) => context ?? null,
    authorize: async (p, r) =>
      enabled &&
      r.consumerId === "personal" &&
      ["mail", "support"].includes(r.source) &&
      (p.actorId === "owner" ||
        (p.actorId === "collector" &&
          ["receive", "read"].includes(r.operation)) ||
        (p.actorId === "worker" &&
          ["read", "claim", "settle", "project"].includes(r.operation))),
  };
  const options = { clock: () => new Date(now) };
  const service = new IncrementalEvidenceServiceV1(store, access, options);
  const batch = (id, extra = {}) => ({
    ...scope,
    operationId: `batch-${id}`,
    events: [
      {
        event: {
          tenantId: "tenant",
          id: `event-${id}`,
          source: "mail",
          type: "message.received",
          occurredAt: now,
          payload: { messageId: id },
        },
        evidence: [
          { evidenceId: id, evidenceRevision: "1", reference: `mail:${id}` },
        ],
      },
    ],
    ...extra,
  });
  const key = (id) => ({ ...scope, evidenceId: id, evidenceRevision: "1" });
  return {
    store,
    service,
    access,
    options,
    batch,
    key,
    collector,
    worker,
    owner,
    setTime: (value) => (now = value),
    disable: () => (enabled = false),
    enable: () => (enabled = true),
    reopen: (nextStore) =>
      new IncrementalEvidenceServiceV1(nextStore ?? store, access, options),
  };
}

export async function incrementalEvidenceScenarios(t, setup) {
  const scenarios = {
    async "concurrent completions and projection acknowledgements replay the same known result"(
      f,
    ) {
      await f.service.receiveBatch(f.collector, f.batch("concurrent"));
      const claim = await f.service.claim(f.worker, {
        ...scope,
        workerId: "a",
      });
      const outputs = await Promise.all(
        [1, 2].map(() =>
          f.service.complete(
            f.worker,
            claim,
            { known: true },
            "analysis:concurrent",
          ),
        ),
      );
      assert.equal(outputs[0].resultDigest, outputs[1].resultDigest);
      const acknowledgements = await Promise.all(
        [1, 2, 3].map(() =>
          f.service.acknowledgeProjection(
            f.worker,
            claim,
            outputs[0].resultDigest,
          ),
        ),
      );
      assert.ok(acknowledgements.every((r) => r.projection === "applied"));
      await assert.rejects(
        f.service.complete(
          f.worker,
          claim,
          { substituted: true },
          "analysis:concurrent",
        ),
      );
      assert.deepEqual(
        (await f.service.read(f.owner, f.key("concurrent"))).result,
        { known: true },
      );
    },
    async "metadata changes queue lightweight work without repeating body inference"(
      f,
    ) {
      await f.service.receiveBatch(f.collector, f.batch("body"));
      const body = await f.service.claim(f.worker, {
        ...scope,
        workerId: "body",
      });
      const result = await f.service.complete(
        f.worker,
        body,
        { facts: ["Known content"] },
        "analysis:body",
      );
      await f.service.acknowledgeProjection(
        f.worker,
        body,
        result.resultDigest,
      );
      const update = f.batch("body");
      update.operationId = "metadata-update";
      update.events[0].event.id = "labels-changed";
      update.events[0].event.type = "labels.changed";
      update.events[0].event.payload = { starred: true };
      update.events[0].evidence.push({
        evidenceId: "body-metadata",
        evidenceRevision: "history-2",
        reference: "mail-metadata:body",
      });
      assert.equal(
        (await f.service.receiveBatch(f.collector, update)).insertedEvidence,
        1,
      );
      const metadata = await f.service.claim(f.worker, {
        ...scope,
        workerId: "metadata",
      });
      assert.equal(metadata.evidenceId, "body-metadata");
      assert.deepEqual(
        (await f.service.readEvent(f.worker, scope, metadata.discoveredEventId))
          .event.payload,
        { starred: true },
      );
      await f.service.complete(
        f.worker,
        metadata,
        { attentionChanged: true, cachedContent: result.resultReference },
        "projection:metadata",
      );
      await f.service.project(f.worker, metadata, async (input) =>
        assert.equal(input.result.attentionChanged, true),
      );
      assert.equal(
        await f.service.claim(f.worker, { ...scope, workerId: "again" }),
        undefined,
      );
      assert.equal(
        (await f.service.read(f.owner, f.key("body"))).resultDigest,
        result.resultDigest,
      );
    },
    async "intake is atomic with checkpoint CAS and exact batch/event/evidence identities"(
      f,
    ) {
      const input = f.batch("one", {
        checkpoint: { expectedRevision: null, position: "page-1" },
      });
      const [first, replay] = await Promise.all([
        f.service.receiveBatch(f.collector, input),
        f.service.receiveBatch(f.collector, input),
      ]);
      assert.deepEqual(first, replay);
      assert.equal(first.insertedEvidence, 1);
      assert.equal(
        (await f.service.checkpoint(f.owner, scope)).position,
        "page-1",
      );
      const second = f.batch("two", {
        checkpoint: { expectedRevision: 0, position: "page-2" },
      });
      await f.service.receiveBatch(f.collector, second);
      await assert.rejects(
        f.service.receiveBatch(f.collector, {
          ...input,
          operationId: "stale",
          events: [],
        }),
        (e) => e.code === "CONFLICT",
      );
      const bad = f.batch("new", {
        checkpoint: { expectedRevision: 1, position: "bad-cursor" },
      });
      bad.events.push({
        ...input.events[0],
        event: { ...input.events[0].event, payload: { tampered: true } },
      });
      await assert.rejects(
        f.service.receiveBatch(f.collector, bad),
        (e) => e.code === "CONFLICT",
      );
      assert.equal(await f.service.read(f.owner, f.key("new")), undefined);
      assert.equal(
        (await f.service.checkpoint(f.owner, scope)).position,
        "page-2",
      );
      assert.deepEqual(
        await f.reopen().receiveBatch(f.collector, input),
        first,
      );
      await assert.rejects(
        f.service.receiveBatch(f.collector, { ...input, events: [] }),
        (e) => e.code === "CONFLICT",
      );
    },
    async "repeated source notifications do not repeat a completed analysis or projection"(
      f,
    ) {
      await f.service.receiveBatch(f.collector, f.batch("mail"));
      const claim = await f.service.claim(f.worker, {
        ...scope,
        workerId: "worker-a",
      });
      let paidCalls = 0;
      paidCalls++;
      const completed = await f.service.complete(
        f.worker,
        claim,
        { facts: ["An obligation needs verification"] },
        "analysis:mail",
      );
      assert.deepEqual(
        await f.service.complete(
          f.worker,
          claim,
          { facts: ["An obligation needs verification"] },
          "analysis:mail",
        ),
        completed,
      );
      const changed = f.batch("mail");
      changed.operationId = "label-update";
      changed.events[0].event.id = "label-event";
      changed.events[0].event.type = "label.changed";
      assert.equal(
        (await f.service.receiveBatch(f.collector, changed)).insertedEvidence,
        0,
      );
      assert.equal(
        await f.reopen().claim(f.worker, { ...scope, workerId: "worker-b" }),
        undefined,
      );
      const pending = await f.reopen().pendingProjections(f.worker, scope);
      assert.equal(pending.length, 1);
      assert.deepEqual(pending[0].result, {
        facts: ["An obligation needs verification"],
      });
      await assert.rejects(
        f.service.acknowledgeProjection(
          f.worker,
          f.key("mail"),
          "wrong-digest",
        ),
      );
      await f.service.acknowledgeProjection(
        f.worker,
        f.key("mail"),
        completed.resultDigest,
      );
      await f.service.acknowledgeProjection(
        f.worker,
        f.key("mail"),
        completed.resultDigest,
      );
      assert.equal(
        (await f.service.pendingProjections(f.worker, scope)).length,
        0,
      );
      assert.equal(paidCalls, 1);
    },
    async "expired or uncertain inference is fenced and never automatically retried"(
      f,
    ) {
      await f.service.receiveBatch(f.collector, f.batch("unknown"));
      const claim = await f.service.claim(f.worker, {
        ...scope,
        workerId: "a",
        leaseMs: 1000,
      });
      f.setTime("2026-10-28T12:00:02.000Z");
      assert.equal(
        await f.reopen().claim(f.worker, { ...scope, workerId: "b" }),
        undefined,
      );
      assert.equal(
        (await f.service.read(f.owner, f.key("unknown"))).status,
        "uncertain",
      );
      await assert.rejects(
        f.service.complete(f.worker, claim, { answer: "late" }, "result:late"),
      );
      await assert.rejects(
        f.service.reconcile(f.worker, {
          ...f.key("unknown"),
          operationId: "proof",
          expectedGeneration: claim.generation,
          proofRefs: ["provider:receipt"],
          outcome: { kind: "not_started" },
        }),
      );
      const request = {
        ...f.key("unknown"),
        operationId: "known-result",
        expectedGeneration: claim.generation,
        proofRefs: ["provider:receipt"],
        outcome: {
          kind: "completed",
          result: { answer: "Stored provider response" },
          resultReference: "provider:response",
        },
      };
      const reconciled = await f.service.reconcile(f.owner, request);
      assert.equal(reconciled.status, "completed");
      assert.equal(
        (await f.service.reconcile(f.owner, request)).resultDigest,
        reconciled.resultDigest,
      );
      assert.equal(
        (await f.service.pendingProjections(f.owner, scope)).length,
        1,
      );
      assert.equal(
        await f.service.claim(f.worker, { ...scope, workerId: "c" }),
        undefined,
      );
    },
    async "only verified not-started outcomes can return to the queue"(f) {
      await f.service.receiveBatch(f.collector, f.batch("retry"));
      const first = await f.service.claim(f.worker, {
        ...scope,
        workerId: "a",
      });
      await f.service.fail(
        f.worker,
        first,
        "not_started",
        "Local validation before inference",
        0,
      );
      const second = await f.service.claim(f.worker, {
        ...scope,
        workerId: "b",
      });
      assert.equal(second.generation, first.generation + 1);
      await assert.rejects(f.service.assertCurrent(f.worker, first));
      await f.service.fail(
        f.worker,
        second,
        "uncertain",
        "Provider connection lost",
      );
      assert.equal(
        await f.service.claim(f.worker, { ...scope, workerId: "c" }),
        undefined,
      );
      await f.service.reconcile(f.owner, {
        ...f.key("retry"),
        operationId: "verified-no-call",
        expectedGeneration: second.generation,
        proofRefs: ["provider:not-invoked"],
        outcome: { kind: "not_started" },
      });
      assert.ok(await f.service.claim(f.worker, { ...scope, workerId: "c" }));
    },
    async "pre-inference failures back off without starving new evidence"(f) {
      await f.service.receiveBatch(f.collector, f.batch("old"));
      const old = await f.service.claim(f.worker, { ...scope, workerId: "a" });
      const waiting = await f.service.fail(
        f.worker,
        old,
        "not_started",
        "Source unavailable before inference",
      );
      assert.equal(waiting.availableAt, "2026-10-28T12:00:30.000Z");
      f.setTime("2026-10-28T12:00:01.000Z");
      await f.service.receiveBatch(f.collector, f.batch("new"));
      const next = await f
        .reopen()
        .claim(f.worker, { ...scope, workerId: "b" });
      assert.equal(next.evidenceId, "new");
      await f.service.complete(
        f.worker,
        next,
        { analyzed: true },
        "analysis:new",
      );
      assert.equal(
        await f.service.claim(f.worker, { ...scope, workerId: "c" }),
        undefined,
      );
      f.setTime("2026-10-28T12:00:31.000Z");
      assert.equal(
        (await f.service.claim(f.worker, { ...scope, workerId: "c" }))
          .evidenceId,
        "old",
      );
    },
    async "projection recovery reuses the durable analysis and the same domain operation identity"(
      f,
    ) {
      await f.service.receiveBatch(f.collector, f.batch("project"));
      const claim = await f.service.claim(f.worker, {
        ...scope,
        workerId: "a",
      });
      await f.service.complete(
        f.worker,
        claim,
        { situation: "case-a" },
        "analysis:project",
      );
      const ids = [];
      await assert.rejects(
        f.service.project(f.worker, f.key("project"), async (input) => {
          ids.push(input.operationId);
          throw Error("Crash after a partial domain write");
        }),
      );
      assert.equal(
        (await f.service.pendingProjections(f.worker, scope)).length,
        1,
      );
      await f.reopen().project(f.worker, f.key("project"), async (input) => {
        ids.push(input.operationId);
        assert.deepEqual(input.result, { situation: "case-a" });
      });
      assert.equal(ids.length, 2);
      assert.equal(ids[0], ids[1]);
      await f.service.project(f.worker, f.key("project"), async () => {
        throw Error("A completed projection must not run again");
      });
      assert.equal(
        await f.service.claim(f.worker, { ...scope, workerId: "b" }),
        undefined,
      );
    },
    async "concurrent workers claim each receipt once and retained identities survive compaction"(
      f,
    ) {
      for (const id of ["a", "b", "c"])
        await f.service.receiveBatch(f.collector, f.batch(id));
      const claims = await Promise.all(
        ["1", "2", "3", "4"].map((workerId) =>
          f.service.claim(f.worker, { ...scope, workerId }),
        ),
      );
      assert.equal(claims.filter(Boolean).length, 3);
      assert.equal(
        new Set(claims.filter(Boolean).map((c) => c.evidenceId)).size,
        3,
      );
      for (const claim of claims.filter(Boolean)) {
        const done = await f.service.complete(
          f.worker,
          claim,
          { id: claim.evidenceId },
          `result:${claim.evidenceId}`,
        );
        await f.service.acknowledgeProjection(
          f.worker,
          claim,
          done.resultDigest,
        );
      }
      f.setTime("2026-10-29T12:00:00.000Z");
      for (let i = 0; i < 4; i++)
        await f.service.compact(f.owner, scope, "2026-10-29T00:00:00.000Z", 1);
      for (const id of ["a", "b", "c"]) {
        const receipt = await f.service.read(f.owner, f.key(id));
        assert.equal(receipt.result, undefined);
        assert.ok(receipt.compactedAt);
      }
      const replay = f.batch("a");
      replay.events[0].event.occurredAt = "2026-10-28T12:00:00.000Z";
      assert.equal(
        (await f.reopen().receiveBatch(f.collector, replay)).insertedEvidence,
        1,
        "exact intake returns its original result, not a second analysis",
      );
      assert.equal(
        await f.service.claim(f.worker, { ...scope, workerId: "new" }),
        undefined,
      );
    },
    async "compaction retains source payload until every referenced result has been applied"(
      f,
    ) {
      const input = f.batch("keep");
      await f.service.receiveBatch(f.collector, input);
      f.setTime("2026-10-29T12:00:00.000Z");
      await f.service.compact(f.owner, scope, "2026-10-29T00:00:00.000Z");
      assert.ok(
        (await f.service.readEvent(f.owner, scope, "event-keep")).event,
      );
      const claim = await f.service.claim(f.worker, {
        ...scope,
        workerId: "a",
      });
      const result = await f.service.complete(
        f.worker,
        claim,
        { known: true },
        "result:keep",
      );
      await f.service.compact(f.owner, scope, "2026-10-29T00:00:00.000Z");
      assert.ok(
        (await f.service.readEvent(f.owner, scope, "event-keep")).event,
        "analysis alone does not acknowledge its domain projection",
      );
      await f.service.acknowledgeProjection(
        f.worker,
        claim,
        result.resultDigest,
      );
      await f.service.compact(f.owner, scope, "2026-10-29T00:00:00.000Z");
      assert.equal(
        (await f.service.readEvent(f.owner, scope, "event-keep")).event,
        undefined,
      );
    },
    async "tenant, source and current authorization remain independent of event payload"(
      f,
    ) {
      const input = f.batch("private");
      await f.service.receiveBatch(f.collector, input);
      assert.equal(
        await f.service.read(
          { ...f.owner, tenantId: "foreign" },
          f.key("private"),
        ),
        undefined,
      );
      await assert.rejects(
        f.service.receiveBatch({ ...f.collector, tenantId: "foreign" }, input),
      );
      await assert.rejects(f.service.receiveBatch(f.worker, input));
      await assert.rejects(
        f.service.claim(f.collector, { ...scope, workerId: "x" }),
      );
      await assert.rejects(
        f.service.read(f.owner, { ...f.key("private"), source: "forbidden" }),
      );
      const claim = await f.service.claim(f.worker, {
        ...scope,
        workerId: "a",
      });
      f.disable();
      await assert.rejects(f.service.assertCurrent(f.worker, claim));
      f.enable();
      assert.equal(
        (await f.service.read(f.owner, f.key("private"))).status,
        "leased",
      );
    },
    async "source descriptors cannot supply processing state or tenant authority"(
      f,
    ) {
      const input = f.batch("descriptor");
      Object.assign(input.events[0].evidence[0], {
        tenantId: "foreign",
        consumerId: "foreign",
        source: "foreign",
        status: "completed",
        result: { forged: true },
        reconciliations: { forged: "digest" },
        lease: {
          actorId: "owner",
          token: "fake",
          workerId: "fake",
          until: "2099-01-01T00:00:00.000Z",
        },
      });
      await f.service.receiveBatch(f.collector, input);
      const record = await f.service.read(f.owner, f.key("descriptor"));
      assert.equal(record.tenantId, "tenant");
      assert.equal(record.status, "pending");
      assert.equal(record.result, undefined);
      assert.equal(record.reconciliations, undefined);
      assert.equal(record.lease, undefined);
      assert.equal(
        (await f.service.claim(f.worker, { ...scope, workerId: "a" }))
          .evidenceId,
        "descriptor",
      );
    },
    async "metadata growth has no fixed tenant event cap and revisions require an explicit new identity"(
      f,
    ) {
      for (let batch = 0; batch < 11; batch++) {
        const request = f.batch(`bulk-${batch}`);
        request.events = Array.from(
          { length: 100 },
          (_, i) => f.batch(`${batch}-${i}`).events[0],
        );
        assert.equal(
          (await f.service.receiveBatch(f.collector, request)).insertedEvidence,
          100,
        );
      }
      const changed = f.batch("0-0");
      changed.operationId = "changed-evidence";
      changed.events[0].event.id = "new-delivery";
      changed.events[0].evidence[0].reference = "mail:substituted";
      await assert.rejects(f.service.receiveBatch(f.collector, changed));
      changed.events[0].evidence[0].evidenceRevision = "2";
      assert.equal(
        (await f.service.receiveBatch(f.collector, changed)).insertedEvidence,
        1,
      );
    },
  };
  for (const [name, run] of Object.entries(scenarios))
    await t.test(name, async () => {
      const resource = await setup();
      const fixture = evidenceFixture(resource.store);
      try {
        await run(fixture);
      } finally {
        await resource.dispose?.();
      }
    });
}
