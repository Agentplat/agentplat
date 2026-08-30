import assert from "node:assert/strict";
import test from "node:test";

import {
  MorphogenesisStagingScenarioGatewayV1,
  digest,
} from "./lib/morphogenesis-staging-scenario-gateway.mjs";

const sha = (character) => `sha256:${character.repeat(64)}`;
const input = {
  sourceCommit: "a".repeat(40),
  inventoryDigest: sha("b"),
  deploymentReceiptDigest: sha("c"),
  scenarioId: "stale-decision-authority",
  phase: "baseline",
  postgresqlResourceId: "postgres:staging",
  temporalResourceId: "temporal:staging",
  challenge: "SSSSSSSSSSSSSSSSSSSSSS",
};

function response(request, change = (value) => value) {
  const body = {
    schemaVersion: 1,
    kind: "agentplat-agent-morphogenesis-beta1-staging-scenario-response-v1",
    requestDigest: request.requestDigest,
    scenarioId: request.scenarioId,
    phase: request.phase,
    status: "passed",
    scenarioOutcome: "rejected-as-expected",
    services: {
      postgresqlResourceId: request.postgresqlResourceId,
      temporalResourceId: request.temporalResourceId,
    },
    executionDomain: {
      runnerPodUid: "pod:runner-1",
      nodeUid: "node:runner-1",
      zone: "zone:a",
      failureDomainId: "domain:a",
    },
    decisionActorType: "agent",
    meshAuthorityGrantedByTransport: false,
    externalSignerObserved: true,
    rollbackWitnessVerified: true,
    partitionActive: request.phase === "partition",
    minorityAuthorizationAttempts: request.phase === "partition" ? 1 : 0,
    minorityAuthorizationsAccepted: 0,
    invariants: {
      missionContinuityRatio: 1,
      duplicateMaterialEffects: 0,
      unauthorizedActivations: 0,
      lostCommittedReceipts: 0,
      morphologyHeadForks: 0,
      crossTenantEffects: 0,
      crossMissionEffects: 0,
    },
    metrics: { wallTimeMs: 10, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 },
    domainReceiptDigest: sha("d"),
    meshEvidenceDigest: sha("e"),
    workflowHistoryDigest: sha("f"),
    evidenceDigest: sha("0"),
    contentCaptured: false,
  };
  const changed = change(body);
  return { ...changed, responseDigest: digest("staging-scenario-response-v1", changed) };
}

test("scenario gateway validates baseline, post-upgrade and partition authority evidence", async () => {
  for (const phase of ["baseline", "post-upgrade", "partition"]) {
    const gateway = new MorphogenesisStagingScenarioGatewayV1({
      endpoint: "https://scenarios.staging.invalid/v1/execute",
      fetch: async (_url, init) => Response.json(response(JSON.parse(init.body))),
    });
    const result = await gateway.execute({ ...input, phase });
    assert.equal(result.phase, phase);
    assert.equal(result.partitionActive, phase === "partition");
  }
});

test("scenario gateway rejects transport authority and partition acceptance", async () => {
  const gateway = (change) => new MorphogenesisStagingScenarioGatewayV1({
    endpoint: "https://scenarios.staging.invalid/v1/execute",
    fetch: async (_url, init) => Response.json(response(JSON.parse(init.body), change)),
  });
  await assert.rejects(
    gateway((value) => ({ ...value, meshAuthorityGrantedByTransport: true })).execute(input),
  );
  await assert.rejects(
    gateway((value) => ({ ...value, minorityAuthorizationsAccepted: 1 }))
      .execute({ ...input, phase: "partition" }),
  );
  assert.throws(
    () => new MorphogenesisStagingScenarioGatewayV1({ endpoint: "http://scenarios.invalid" }),
    /credential-free HTTPS/,
  );
});
