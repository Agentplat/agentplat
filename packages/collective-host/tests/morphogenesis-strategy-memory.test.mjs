import assert from "node:assert/strict";
import test from "node:test";

import { digestPlanningJsonV1 } from "@agentplat/collective-planning";
import { createMorphogenesisStrategyMemoryRecordV3 } from "@agentplat/collective-runtime/morphogenesis";
import { InMemoryMemoryStore } from "@agentplat/memory";
import { AgentPlatMemoryMorphogenesisStrategyPortV3 } from "../dist/morphogenesis-strategy-memory.js";

const sha = (value) => digestPlanningJsonV1("morphogenesis-strategy-memory-record-v3", { value });

test("AgentPlat Memory stores only scoped content-free Morphogenesis strategy records", async () => {
  const memory = new InMemoryMemoryStore();
  const adapter = new AgentPlatMemoryMorphogenesisStrategyPortV3({
    store: memory,
    tenantId: "tenant:test",
    sessionId: "memory-session:morphogenesis-strategy",
    agentId: "agent:strategy-memory",
    logicalTimeToIso: (value) => new Date(Date.UTC(2030, 0, 1, 0, 0, 0, value)).toISOString(),
  });
  const record = createMorphogenesisStrategyMemoryRecordV3({
    recordId: "memory:morphogenesis:strategy:1",
    kind: "transition",
    tenantId: "tenant:test",
    missionIntentId: "mission-intent:test",
    objectiveId: "objective:test",
    scopeDigest: sha("scope"),
    subjectDigest: sha("transition"),
    relatedDigests: [sha("recommendation"), sha("review")],
    evidenceDigests: [sha("evidence")],
    recordedAtLogicalMs: 10,
  });
  assert.equal(await adapter.remember(record), "created");
  assert.equal(await adapter.remember(record), "replayed");
  const retained = await adapter.list({
    tenantId: record.tenantId,
    missionIntentId: record.missionIntentId,
    objectiveId: record.objectiveId,
    maximumRecords: 10,
  });
  assert.equal(retained[0].recordDigest, record.recordDigest);
  const messages = await memory.listMessages(record.tenantId, adapter.options.sessionId);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].metadata.authorityGranted, false);
  assert.equal(/prompt|credential|privateKey|reasoning/u.test(messages[0].content), false);
  await assert.rejects(adapter.remember({ ...record, tenantId: "tenant:other" }),
    /record digest|tenant/);
});
