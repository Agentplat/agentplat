import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export class MorphogenesisStagingScenarioGatewayV1 {
  #endpoint;
  #fetch;
  #authorizationHeader;
  #timeoutMs;

  constructor({ endpoint, fetch = globalThis.fetch, authorizationHeader, timeoutMs = 300_000 }) {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
      throw new TypeError("staging scenario gateway must use credential-free HTTPS");
    if (typeof fetch !== "function") throw new TypeError("staging scenario fetch is unavailable");
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 10_000 || timeoutMs > 900_000)
      throw new TypeError("staging scenario timeout is invalid");
    this.#endpoint = url;
    this.#fetch = fetch;
    this.#authorizationHeader = authorizationHeader;
    this.#timeoutMs = timeoutMs;
  }

  async execute(input) {
    identifier(input.scenarioId);
    assert.ok(new Set(["baseline", "post-upgrade", "partition"]).has(input.phase));
    assert.match(input.sourceCommit, /^[0-9a-f]{40}$/u);
    sha(input.inventoryDigest);
    sha(input.deploymentReceiptDigest);
    identifier(input.postgresqlResourceId);
    identifier(input.temporalResourceId);
    assert.match(input.challenge, /^[A-Za-z0-9_-]{22,128}$/u);
    const body = {
      schemaVersion: 1,
      kind: "agentplat-agent-morphogenesis-beta1-staging-scenario-request-v1",
      sourceCommit: input.sourceCommit,
      inventoryDigest: input.inventoryDigest,
      deploymentReceiptDigest: input.deploymentReceiptDigest,
      scenarioId: input.scenarioId,
      phase: input.phase,
      postgresqlResourceId: input.postgresqlResourceId,
      temporalResourceId: input.temporalResourceId,
      challenge: input.challenge,
      partitionRequired: input.phase === "partition",
      contentPolicy: "content-free-only",
    };
    const requestDigest = digest("staging-scenario-request-v1", body);
    const authorization = await this.#authorizationHeader?.();
    if (authorization !== undefined && authorization.trim() === "")
      throw new Error("staging scenario gateway authorization is empty");
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
      throw new Error("staging scenario gateway failed closed");
    const encoded = await response.text();
    if (Buffer.byteLength(encoded, "utf8") > 131_072)
      throw new Error("staging scenario response is oversized");
    let value;
    try { value = JSON.parse(encoded); }
    catch { throw new Error("staging scenario response is invalid JSON"); }
    return validateResponse(value, requestDigest, input);
  }
}

function validateResponse(value, requestDigest, request) {
  assert.equal(value.schemaVersion, 1);
  assert.equal(value.kind, "agentplat-agent-morphogenesis-beta1-staging-scenario-response-v1");
  assert.equal(value.requestDigest, requestDigest);
  assert.equal(value.scenarioId, request.scenarioId);
  assert.equal(value.phase, request.phase);
  assert.equal(value.status, "passed");
  assert.ok(new Set(["passed", "rejected-as-expected"]).has(value.scenarioOutcome));
  assert.equal(value.services.postgresqlResourceId, request.postgresqlResourceId);
  assert.equal(value.services.temporalResourceId, request.temporalResourceId);
  for (const key of ["runnerPodUid", "nodeUid", "zone", "failureDomainId"])
    identifier(value.executionDomain[key]);
  assert.ok(new Set(["agent", "person", "collective", "none"]).has(value.decisionActorType));
  assert.equal(value.meshAuthorityGrantedByTransport, false);
  assert.equal(value.externalSignerObserved, true);
  assert.equal(value.rollbackWitnessVerified, true);
  assert.equal(value.partitionActive, request.phase === "partition");
  if (request.phase === "partition") {
    assert.ok(value.minorityAuthorizationAttempts >= 1);
    assert.equal(value.minorityAuthorizationsAccepted, 0);
  }
  assert.equal(value.invariants.missionContinuityRatio, 1);
  for (const key of [
    "duplicateMaterialEffects", "unauthorizedActivations", "lostCommittedReceipts",
    "morphologyHeadForks", "crossTenantEffects", "crossMissionEffects",
  ]) assert.equal(value.invariants[key], 0);
  assert.ok(Number.isFinite(value.metrics.wallTimeMs) && value.metrics.wallTimeMs >= 0);
  assert.equal(value.metrics.inputTokens, 0);
  assert.equal(value.metrics.outputTokens, 0);
  assert.equal(value.metrics.estimatedCostUsd, 0);
  for (const key of ["domainReceiptDigest", "meshEvidenceDigest", "workflowHistoryDigest", "evidenceDigest"])
    sha(value[key]);
  assert.equal(value.contentCaptured, false);
  const { responseDigest, ...body } = value;
  assert.equal(responseDigest, digest("staging-scenario-response-v1", body));
  return Object.freeze(value);
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
