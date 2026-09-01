import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const STAGING_FAULT_CLASSES_V1 = Object.freeze([
  "network-partition",
  "host-loss",
  "postgres-failover",
  "temporal-worker-loss",
]);

export class MorphogenesisStagingFaultGatewayV1 {
  #endpoint;
  #fetch;
  #authorizationHeader;
  #timeoutMs;

  constructor({ endpoint, fetch = globalThis.fetch, authorizationHeader, timeoutMs = 900_000 }) {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
      throw new TypeError("staging fault gateway must use credential-free HTTPS");
    if (typeof fetch !== "function") throw new TypeError("staging fault gateway fetch is unavailable");
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 30_000 || timeoutMs > 1_800_000)
      throw new TypeError("staging fault gateway timeout is invalid");
    this.#endpoint = url;
    this.#fetch = fetch;
    this.#authorizationHeader = authorizationHeader;
    this.#timeoutMs = timeoutMs;
  }

  async execute(input) {
    assert.ok(STAGING_FAULT_CLASSES_V1.includes(input.faultClass));
    assert.ok(Number.isSafeInteger(input.cycle) && input.cycle >= 1);
    assert.match(input.sourceCommit, /^[0-9a-f]{40}$/u);
    sha(input.inventoryDigest);
    sha(input.deploymentReceiptDigest);
    assert.match(input.challenge, /^[A-Za-z0-9_-]{22,128}$/u);
    assert.ok(Array.isArray(input.targetResourceIds) && input.targetResourceIds.length >= 1);
    input.targetResourceIds.forEach(identifier);
    const body = {
      schemaVersion: 1,
      kind: "agentplat-agent-morphogenesis-beta1-staging-fault-request-v1",
      sourceCommit: input.sourceCommit,
      inventoryDigest: input.inventoryDigest,
      deploymentReceiptDigest: input.deploymentReceiptDigest,
      faultClass: input.faultClass,
      cycle: input.cycle,
      challenge: input.challenge,
      targetResourceIds: [...input.targetResourceIds].sort(),
      requireAutomaticRecovery: true,
      contentPolicy: "content-free-only",
    };
    const requestDigest = digest("staging-fault-request-v1", body);
    const authorization = await this.#authorizationHeader?.();
    if (authorization !== undefined && authorization.trim() === "")
      throw new Error("staging fault gateway authorization is empty");
    const response = await this.#fetch(this.#endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...(authorization === undefined ? {} : { authorization }),
      },
      body: JSON.stringify({ ...body, requestDigest }),
      signal: AbortSignal.timeout(this.#timeoutMs),
    });
    if (!response.ok || response.headers.get("content-type")?.split(";", 1)[0] !== "application/json")
      throw new Error("staging fault gateway failed closed");
    const encoded = await response.text();
    if (Buffer.byteLength(encoded, "utf8") > 131_072)
      throw new Error("staging fault response is oversized");
    let value;
    try { value = JSON.parse(encoded); }
    catch { throw new Error("staging fault response is invalid JSON"); }
    return validateResponse(value, requestDigest, input.faultClass, input.cycle);
  }
}

function validateResponse(value, requestDigest, faultClass, cycle) {
  assert.equal(value.schemaVersion, 1);
  assert.equal(value.kind, "agentplat-agent-morphogenesis-beta1-staging-fault-response-v1");
  assert.equal(value.requestDigest, requestDigest);
  assert.equal(value.faultClass, faultClass);
  assert.equal(value.cycle, cycle);
  assert.equal(value.status, "passed");
  identifier(value.providerEventId);
  assert.ok(value.affectedResourceIds.length >= 1);
  value.affectedResourceIds.forEach(identifier);
  assert.ok(value.failureDomainIds.length >= 1);
  value.failureDomainIds.forEach(identifier);
  const times = ["injectedAt", "outageObservedAt", "recoveryStartedAt", "recoveredAt"]
    .map((field) => {
      assert.equal(new Date(value[field]).toISOString(), value[field]);
      return Date.parse(value[field]);
    });
  for (let index = 1; index < times.length; index += 1)
    assert.ok(times[index] >= times[index - 1]);
  assert.equal(value.observations.faultObserved, true);
  assert.equal(value.observations.recoveryObserved, true);
  assert.equal(value.observations.missionContinuityRatio, 1);
  for (const key of [
    "duplicateMaterialEffects", "unauthorizedActivations", "lostCommittedReceipts",
    "morphologyHeadForks", "crossTenantEffects", "crossMissionEffects",
  ]) assert.equal(value.observations[key], 0);
  assert.equal(value.contentCaptured, false);
  sha(value.preStateDigest);
  sha(value.postStateDigest);
  sha(value.evidenceDigest);
  validateClassEvidence(faultClass, value.classEvidence);
  const { responseDigest, ...body } = value;
  assert.equal(responseDigest, digest("staging-fault-response-v1", body));
  return Object.freeze(value);
}

function validateClassEvidence(faultClass, evidence) {
  if (faultClass === "network-partition") {
    assert.ok(evidence.minorityAuthorizationAttempts >= 1);
    assert.equal(evidence.minorityAuthorizationsAccepted, 0);
    assert.equal(evidence.partitionHealed, true);
  } else if (faultClass === "host-loss") {
    identifier(evidence.lostNodeUid);
    identifier(evidence.replacementNodeUid);
    assert.notEqual(evidence.lostNodeUid, evidence.replacementNodeUid);
    assert.equal(evidence.replacementProcessStarted, true);
  } else if (faultClass === "postgres-failover") {
    identifier(evidence.previousPrimaryId);
    identifier(evidence.successorPrimaryId);
    assert.notEqual(evidence.previousPrimaryId, evidence.successorPrimaryId);
    assert.equal(evidence.primaryChanged, true);
    assert.equal(evidence.rollbackWitnessVerified, true);
  } else {
    identifier(evidence.lostWorkerUid);
    identifier(evidence.replacementWorkerUid);
    assert.notEqual(evidence.lostWorkerUid, evidence.replacementWorkerUid);
    assert.equal(evidence.workflowReplayVerified, true);
  }
}

function identifier(value) {
  assert.match(value, /^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u);
}

function sha(value) {
  assert.match(value, /^sha256:[0-9a-f]{64}$/u);
}

export function digest(domain, value) {
  return `sha256:${createHash("sha256").update(`${domain}\n${JSON.stringify(value)}`).digest("hex")}`;
}
