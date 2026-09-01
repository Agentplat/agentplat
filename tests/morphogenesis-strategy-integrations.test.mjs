import assert from "node:assert/strict";
import test from "node:test";

import { digestPlanningJsonV1 } from "@agentplat/collective-planning";
import {
  createLocalStrategyCatalogV1,
  createLocalStrategyDefinitionV1,
} from "@agentplat/collective-runtime/strategy-adaptation";
import {
  InMemoryMorphogenesisStrategyMemoryPortV3,
  createMorphogenesisStrategyCatalogV3,
  createMorphogenesisStrategyContextV3,
  createMorphogenesisStrategyDefinitionV3,
  createMorphogenesisStrategyMemoryRecordV3,
  createMorphogenesisStrategySelectionRequestV3,
  createMorphogenesisStrategyTrustSafetySourceV3,
} from "@agentplat/collective-runtime/morphogenesis";

const sha = (value) => digestPlanningJsonV1("morphogenesis-strategy-context-v3", { value });
const operations = ["award_selection", "bid_submission", "offer_routing", "plan_decomposition", "recovery_selection"];

function fixture() {
  const strategy = createLocalStrategyDefinitionV1({
    schemaVersion: 1,
    strategyId: "strategy:morphogenesis:trusted",
    strategyVersion: 1,
    implementationDigest: sha("strategy-implementation"),
    operations,
  });
  const localCatalog = createLocalStrategyCatalogV1({
    schemaVersion: 1,
    catalogId: "catalog:local:trust",
    catalogVersion: 1,
    parentCatalogDigest: null,
    strategies: [strategy],
    baselines: Object.fromEntries(operations.map((operation) => [operation, strategy.strategyId])),
  });
  const policyDigest = sha("morphogenesis-policy");
  const catalog = createMorphogenesisStrategyCatalogV3({
    catalogId: "catalog:morphogenesis:trust",
    catalogVersion: 1,
    parentCatalogDigest: null,
    localCatalog,
    strategies: [createMorphogenesisStrategyDefinitionV3({
      strategy,
      morphogenesisPolicyDigest: policyDigest,
      blueprintCatalogDigest: sha("blueprints"),
      proposalGeneratorDigest: sha("generator"),
      supportedOperators: ["replace_agent"],
    })],
  });
  const context = createMorphogenesisStrategyContextV3({
    scopeDigest: sha("scope"), morphologyEpoch: 1,
    currentSnapshotDigest: sha("snapshot"), needDigest: sha("need"),
    targetDigest: sha("target"), morphogenesisPolicyDigest: policyDigest,
    riskDigest: sha("risk"), costEnvelopeDigest: sha("cost"),
    deadlineDigest: sha("deadline"),
  });
  const request = createMorphogenesisStrategySelectionRequestV3({
    requestId: "request:morphogenesis:trust",
    scope: {
      tenantId: "tenant:test", meshId: "mesh:test", policyDomainId: "policy:test",
      missionIntentId: "mission-intent:test", objectiveId: "objective:test",
      workItemId: "work:test", workItemRevision: 1,
    },
    context,
    catalog,
    logicalTimeMs: 10,
  });
  return { strategy, catalog, context, request };
}

test("Morphogenesis strategy Trust narrows the existing safety dimension", async () => {
  const { strategy, catalog, context, request } = fixture();
  const evidenceDigest = sha("trust-evidence");
  const source = createMorphogenesisStrategyTrustSafetySourceV3({
    catalog,
    contexts: { async resolve(value) { return value === context.contextDigest ? context : null; } },
    trust: {
      async assess(input) {
        return {
          contextDigest: input.context.contextDigest,
          definitionDigest: input.definitionDigest,
          disposition: "restricted",
          sourceId: "trust:strategy-assessor",
          sourceVersion: 1,
          sourceImplementationDigest: sha("trust-assessor"),
          sourceRevision: 3,
          evidenceDigest,
          observedAtLogicalMs: 10,
          expiresAtLogicalMs: 50,
        };
      },
    },
  });
  const signal = await source.resolve({ request, strategy });
  assert.equal(signal.dimension, "trust");
  assert.equal(signal.disposition, "restricted");
  assert.equal(signal.signalId.includes(evidenceDigest.slice(7, 39)), true);
  assert.equal("authorizationDigest" in signal, false);
});

test("content-free Morphogenesis strategy Memory is scoped and replay exact", async () => {
  const memory = new InMemoryMorphogenesisStrategyMemoryPortV3();
  const record = createMorphogenesisStrategyMemoryRecordV3({
    recordId: "memory:strategy:selection:1",
    kind: "selection",
    tenantId: "tenant:test",
    missionIntentId: "mission-intent:test",
    objectiveId: "objective:test",
    scopeDigest: sha("scope"),
    subjectDigest: sha("selection"),
    relatedDigests: [sha("catalog")],
    evidenceDigests: [sha("decision")],
    recordedAtLogicalMs: 10,
  });
  assert.equal(await memory.remember(record), "created");
  assert.equal(await memory.remember(record), "replayed");
  assert.equal((await memory.list({
    tenantId: record.tenantId,
    missionIntentId: record.missionIntentId,
    objectiveId: record.objectiveId,
    maximumRecords: 10,
  }))[0].recordDigest, record.recordDigest);
  assert.deepEqual(await memory.list({
    tenantId: "tenant:other",
    missionIntentId: record.missionIntentId,
    objectiveId: record.objectiveId,
    maximumRecords: 10,
  }), []);
  const conflicting = createMorphogenesisStrategyMemoryRecordV3({
    ...record,
    subjectDigest: sha("substituted"),
  });
  await assert.rejects(memory.remember(conflicting),
    /identity conflict/);
});
