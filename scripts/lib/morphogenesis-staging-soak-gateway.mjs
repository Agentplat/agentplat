import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export class MorphogenesisStagingSoakGatewayV1 {
  #endpoint; #fetch; #authorizationHeader; #timeoutMs;
  constructor({ endpoint, fetch = globalThis.fetch, authorizationHeader, timeoutMs = 120_000 }) {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new TypeError("staging soak gateway must use credential-free HTTPS");
    if (typeof fetch !== "function") throw new TypeError("staging soak fetch is unavailable");
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 10_000 || timeoutMs > 600_000) throw new TypeError("staging soak gateway timeout is invalid");
    this.#endpoint = url; this.#fetch = fetch; this.#authorizationHeader = authorizationHeader; this.#timeoutMs = timeoutMs;
  }
  async collect(input) {
    assert.match(input.sourceCommit, /^[0-9a-f]{40}$/u); sha(input.inventoryDigest); sha(input.deploymentReceiptDigest);
    assert.ok(Number.isSafeInteger(input.minimumDurationMs) && input.minimumDurationMs >= 86_400_000);
    assert.ok(Number.isSafeInteger(input.minimumRuns) && input.minimumRuns >= 1_000);
    assert.match(input.challenge, /^[A-Za-z0-9_-]{22,128}$/u);
    const body = { schemaVersion: 1, kind: "agentplat-agent-morphogenesis-beta1-staging-soak-collection-request-v1", sourceCommit: input.sourceCommit, inventoryDigest: input.inventoryDigest, deploymentReceiptDigest: input.deploymentReceiptDigest, minimumDurationMs: input.minimumDurationMs, minimumRuns: input.minimumRuns, challenge: input.challenge, contentPolicy: "content-free-only" };
    const requestDigest = digest("staging-soak-request-v1", body); const authorization = await this.#authorizationHeader?.(); if (authorization !== undefined && authorization.trim() === "") throw new Error("staging soak authorization is empty");
    const response = await this.#fetch(this.#endpoint, { method: "POST", headers: { "content-type": "application/json", accept: "application/json", ...(authorization === undefined ? {} : { authorization }) }, body: JSON.stringify({ ...body, requestDigest }), signal: AbortSignal.timeout(this.#timeoutMs) });
    if (!response.ok || response.headers.get("content-type")?.split(";", 1)[0] !== "application/json") throw new Error("staging soak gateway failed closed");
    const encoded = await response.text(); if (Buffer.byteLength(encoded, "utf8") > 262_144) throw new Error("staging soak response is oversized"); let value; try { value = JSON.parse(encoded); } catch { throw new Error("staging soak response is invalid JSON"); }
    return validateResponse(value, requestDigest, input);
  }
}
function validateResponse(value, requestDigest, request) {
  assert.equal(value.schemaVersion, 1); assert.equal(value.kind, "agentplat-agent-morphogenesis-beta1-staging-soak-collection-response-v1"); assert.equal(value.requestDigest, requestDigest); assert.equal(value.status, "passed");
  const startedAt = Date.parse(value.startedAt); const completedAt = Date.parse(value.completedAt); assert.equal(new Date(value.startedAt).toISOString(), value.startedAt); assert.equal(new Date(value.completedAt).toISOString(), value.completedAt); assert.equal(value.durationMs, completedAt - startedAt); assert.ok(value.durationMs >= request.minimumDurationMs);
  assert.ok(value.completedMorphogenesisRuns >= request.minimumRuns); assert.ok(Object.keys(value.runsByTenant).length >= 3); for (const runs of Object.values(value.runsByTenant)) assert.ok(runs >= 200); assert.ok(value.maximumConcurrentMissions >= 8); assert.ok(value.cumulativeMeshProcessStarts >= 6); assert.ok(value.resourceSampleCount > 0);
  for (const key of ["resourceSampleRoot", "operationReceiptRoot", "evidenceDigest"]) sha(value[key]); assert.equal(value.invariants.missionContinuityRatio, 1); for (const key of ["duplicateMaterialEffects", "unauthorizedActivations", "lostCommittedReceipts", "morphologyHeadForks", "crossTenantEffects", "crossMissionEffects"]) assert.equal(value.invariants[key], 0);
  assert.equal(value.finalPendingMeshInboxRows, 0); assert.equal(value.finalPendingMeshOutboxRows, 0); assert.equal(value.contentCaptured, false); const { responseDigest, ...body } = value; assert.equal(responseDigest, digest("staging-soak-response-v1", body)); return Object.freeze(value);
}
function sha(value) { assert.match(value, /^sha256:[0-9a-f]{64}$/u); }
export function digest(domain, value) { return `sha256:${createHash("sha256").update(`${domain}\n${JSON.stringify(value)}`).digest("hex")}`; }
