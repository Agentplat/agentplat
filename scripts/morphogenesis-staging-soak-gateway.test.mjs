import assert from "node:assert/strict"; import test from "node:test"; import { MorphogenesisStagingSoakGatewayV1, digest } from "./lib/morphogenesis-staging-soak-gateway.mjs";
const sha = (character) => `sha256:${character.repeat(64)}`; const input = { sourceCommit: "a".repeat(40), inventoryDigest: sha("b"), deploymentReceiptDigest: sha("c"), minimumDurationMs: 0, minimumRuns: 1_000, challenge: "ZZZZZZZZZZZZZZZZZZZZZZ" };
function response(request, change = (value) => value) { const body = { schemaVersion: 1, kind: "agentplat-agent-morphogenesis-beta1-staging-soak-collection-response-v1", requestDigest: request.requestDigest, status: "passed", startedAt: "2026-08-29T00:00:00.000Z", completedAt: "2026-08-29T00:05:00.000Z", durationMs: 300_000, completedMorphogenesisRuns: 1_000, runsByTenant: { "tenant:a": 400, "tenant:b": 300, "tenant:c": 300 }, maximumConcurrentMissions: 8, cumulativeMeshProcessStarts: 6, resourceSampleCount: 1_000, resourceSampleRoot: sha("d"), operationReceiptRoot: sha("e"), nominalP95WallTimeMs: 100, recoveryP95WallTimeMs: 500, rollbackP95WallTimeMs: 500, restorePointLossMs: 0, restoreTimeMs: 1_000, peakWorkerRssBytes: 100_000_000, aggregateWorkerCpuPercent: 200, finalPendingMeshInboxRows: 0, finalPendingMeshOutboxRows: 0, externalSpendUsd: 10, invariants: { missionContinuityRatio: 1, duplicateMaterialEffects: 0, unauthorizedActivations: 0, lostCommittedReceipts: 0, morphologyHeadForks: 0, crossTenantEffects: 0, crossMissionEffects: 0 }, evidenceDigest: sha("f"), contentCaptured: false }; const changed = change(body); return { ...changed, responseDigest: digest("staging-soak-response-v1", changed) }; }
test("soak gateway accepts completed multi-tenant coverage in five minutes", async () => { const gateway = new MorphogenesisStagingSoakGatewayV1({ endpoint: "https://soak.staging.invalid/v1/collect", fetch: async (_url, init) => Response.json(response(JSON.parse(init.body))) }); const result = await gateway.collect(input); assert.equal(result.durationMs, 300_000); assert.equal(result.completedMorphogenesisRuns, 1_000); });
test("soak gateway rejects unmet explicit duration and unsafe results", async () => { const gateway = (change) => new MorphogenesisStagingSoakGatewayV1({ endpoint: "https://soak.staging.invalid/v1/collect", fetch: async (_url, init) => Response.json(response(JSON.parse(init.body), change)) }); await assert.rejects(gateway((value) => ({ ...value, completedAt: "2026-08-29T01:00:00.000Z", durationMs: 3_600_000 })).collect({ ...input, minimumDurationMs: 7_200_000 })); await assert.rejects(gateway((value) => ({ ...value, invariants: { ...value.invariants, unauthorizedActivations: 1 } })).collect(input)); assert.throws(() => new MorphogenesisStagingSoakGatewayV1({ endpoint: "http://soak.invalid" }), /credential-free HTTPS/); });

test("coverage collection rejects incomplete work and invalid elapsed time", async () => {
  for (const change of [
    value => ({ ...value, completedMorphogenesisRuns: 999 }),
    value => ({ ...value, runsByTenant: { a: 500, b: 500 } }),
    value => ({ ...value, runsByTenant: { a: 500, b: 400, c: 100 } }),
    value => ({ ...value, maximumConcurrentMissions: 7 }),
    value => ({ ...value, durationMs: 0, completedAt: value.startedAt }),
    value => ({ ...value, durationMs: -1 }),
    value => ({ ...value, finalPendingMeshInboxRows: 1 }),
  ]) {
    const gateway = new MorphogenesisStagingSoakGatewayV1({
      endpoint: "https://soak.staging.invalid/v1/collect",
      fetch: async (_url, init) => Response.json(response(JSON.parse(init.body), change)),
    });
    await assert.rejects(gateway.collect(input));
  }
});

test("planning target is not an upper bound on valid evidence", async () => {
  const gateway = new MorphogenesisStagingSoakGatewayV1({
    endpoint: "https://soak.staging.invalid/v1/collect",
    fetch: async (_url, init) => Response.json(response(JSON.parse(init.body), value => ({
      ...value, durationMs: 1_800_000, completedAt: "2026-08-29T00:30:00.000Z",
    }))),
  });
  assert.equal((await gateway.collect(input)).durationMs, 1_800_000);
});
