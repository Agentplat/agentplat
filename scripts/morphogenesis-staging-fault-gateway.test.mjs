import assert from "node:assert/strict";
import test from "node:test";

import {
  MorphogenesisStagingFaultGatewayV1,
  STAGING_FAULT_CLASSES_V1,
  digest,
} from "./lib/morphogenesis-staging-fault-gateway.mjs";

const sha = (character) => `sha256:${character.repeat(64)}`;
const input = {
  sourceCommit: "a".repeat(40),
  inventoryDigest: sha("b"),
  deploymentReceiptDigest: sha("c"),
  challenge: "FFFFFFFFFFFFFFFFFFFFFF",
  cycle: 1,
  targetResourceIds: ["resource:staging"],
};

function classEvidence(faultClass) {
  if (faultClass === "network-partition") return {
    minorityAuthorizationAttempts: 1,
    minorityAuthorizationsAccepted: 0,
    partitionHealed: true,
  };
  if (faultClass === "host-loss") return {
    lostNodeUid: "node:old",
    replacementNodeUid: "node:new",
    replacementProcessStarted: true,
  };
  if (faultClass === "postgres-failover") return {
    previousPrimaryId: "postgres:old",
    successorPrimaryId: "postgres:new",
    primaryChanged: true,
    rollbackWitnessVerified: true,
  };
  return {
    lostWorkerUid: "worker:old",
    replacementWorkerUid: "worker:new",
    workflowReplayVerified: true,
  };
}

function response(request, change = (value) => value) {
  const body = {
    schemaVersion: 1,
    kind: "agentplat-agent-morphogenesis-beta1-staging-fault-response-v1",
    requestDigest: request.requestDigest,
    faultClass: request.faultClass,
    cycle: request.cycle,
    status: "passed",
    providerEventId: `event:${request.faultClass}:1`,
    affectedResourceIds: request.targetResourceIds,
    failureDomainIds: ["zone:a"],
    injectedAt: "2026-08-30T12:00:00.000Z",
    outageObservedAt: "2026-08-30T12:00:01.000Z",
    recoveryStartedAt: "2026-08-30T12:00:02.000Z",
    recoveredAt: "2026-08-30T12:00:03.000Z",
    observations: {
      faultObserved: true,
      recoveryObserved: true,
      missionContinuityRatio: 1,
      duplicateMaterialEffects: 0,
      unauthorizedActivations: 0,
      lostCommittedReceipts: 0,
      morphologyHeadForks: 0,
      crossTenantEffects: 0,
      crossMissionEffects: 0,
    },
    classEvidence: classEvidence(request.faultClass),
    preStateDigest: sha("d"),
    postStateDigest: sha("e"),
    evidenceDigest: sha("f"),
    contentCaptured: false,
  };
  const changed = change(body);
  return { ...changed, responseDigest: digest("staging-fault-response-v1", changed) };
}

test("fault gateway validates every real fault class", async () => {
  for (const faultClass of STAGING_FAULT_CLASSES_V1) {
    const gateway = new MorphogenesisStagingFaultGatewayV1({
      endpoint: "https://faults.staging.invalid/v1/execute",
      fetch: async (_url, init) => Response.json(response(JSON.parse(init.body))),
    });
    const result = await gateway.execute({ ...input, faultClass });
    assert.equal(result.faultClass, faultClass);
    assert.equal(result.observations.missionContinuityRatio, 1);
  }
});

test("fault gateway rejects false recovery and unsafe observations", async () => {
  const gateway = (change) => new MorphogenesisStagingFaultGatewayV1({
    endpoint: "https://faults.staging.invalid/v1/execute",
    fetch: async (_url, init) => Response.json(response(JSON.parse(init.body), change)),
  });
  await assert.rejects(
    gateway((value) => ({
      ...value,
      observations: { ...value.observations, duplicateMaterialEffects: 1 },
    })).execute({ ...input, faultClass: "network-partition" }),
  );
  await assert.rejects(
    gateway((value) => ({
      ...value,
      classEvidence: { ...value.classEvidence, minorityAuthorizationsAccepted: 1 },
    })).execute({ ...input, faultClass: "network-partition" }),
  );
  assert.throws(
    () => new MorphogenesisStagingFaultGatewayV1({ endpoint: "http://faults.invalid" }),
    /credential-free HTTPS/,
  );
});
