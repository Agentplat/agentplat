import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const STAGING_MAINTENANCE_CLASSES_V1 = Object.freeze([
  "rolling-deployment", "schema-upgrade", "backup-restore", "key-rotation",
]);

export class MorphogenesisStagingMaintenanceGatewayV1 {
  #endpoint; #fetch; #authorizationHeader; #timeoutMs;
  constructor({ endpoint, fetch = globalThis.fetch, authorizationHeader, timeoutMs = 1_800_000 }) {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new TypeError("staging maintenance gateway must use credential-free HTTPS");
    if (typeof fetch !== "function") throw new TypeError("staging maintenance fetch is unavailable");
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 30_000 || timeoutMs > 3_600_000) throw new TypeError("staging maintenance timeout is invalid");
    this.#endpoint = url; this.#fetch = fetch; this.#authorizationHeader = authorizationHeader; this.#timeoutMs = timeoutMs;
  }
  async execute(input) {
    assert.ok(STAGING_MAINTENANCE_CLASSES_V1.includes(input.operationClass)); assert.ok(Number.isSafeInteger(input.cycle) && input.cycle >= 1); assert.match(input.sourceCommit, /^[0-9a-f]{40}$/u); sha(input.inventoryDigest); sha(input.deploymentReceiptDigest); assert.match(input.challenge, /^[A-Za-z0-9_-]{22,128}$/u); validateIntent(input.operationClass, input.intent);
    const body = { schemaVersion: 1, kind: "agentplat-agent-morphogenesis-beta1-staging-maintenance-request-v1", sourceCommit: input.sourceCommit, inventoryDigest: input.inventoryDigest, deploymentReceiptDigest: input.deploymentReceiptDigest, operationClass: input.operationClass, cycle: input.cycle, intent: input.intent, challenge: input.challenge, contentPolicy: "content-free-only" };
    const requestDigest = digest("staging-maintenance-request-v1", body); const authorization = await this.#authorizationHeader?.(); if (authorization !== undefined && authorization.trim() === "") throw new Error("staging maintenance authorization is empty");
    const response = await this.#fetch(this.#endpoint, { method: "POST", headers: { "content-type": "application/json", accept: "application/json", ...(authorization === undefined ? {} : { authorization }) }, body: JSON.stringify({ ...body, requestDigest }), signal: AbortSignal.timeout(this.#timeoutMs) });
    if (!response.ok || response.headers.get("content-type")?.split(";", 1)[0] !== "application/json") throw new Error("staging maintenance gateway failed closed"); const encoded = await response.text(); if (Buffer.byteLength(encoded, "utf8") > 131_072) throw new Error("staging maintenance response is oversized"); let value; try { value = JSON.parse(encoded); } catch { throw new Error("staging maintenance response is invalid JSON"); }
    return validateResponse(value, requestDigest, input);
  }
}

function validateIntent(type, value) {
  assert.equal(typeof value, "object");
  if (type === "rolling-deployment") { image(value.predecessorImage); image(value.successorImage); assert.notEqual(value.predecessorImage, value.successorImage); }
  else if (type === "schema-upgrade") { assert.ok(Number.isSafeInteger(value.previousMigration) && value.previousMigration >= 0); assert.ok(Number.isSafeInteger(value.successorMigration) && value.successorMigration > value.previousMigration); }
  else if (type === "backup-restore") identifier(value.sourceResourceId);
  else { identifier(value.predecessorKeyId); identifier(value.successorKeyId); assert.notEqual(value.predecessorKeyId, value.successorKeyId); sha(value.rotationReceiptDigest); }
}

function validateResponse(value, requestDigest, request) {
  assert.equal(value.schemaVersion, 1); assert.equal(value.kind, "agentplat-agent-morphogenesis-beta1-staging-maintenance-response-v1"); assert.equal(value.requestDigest, requestDigest); assert.equal(value.operationClass, request.operationClass); assert.equal(value.cycle, request.cycle); assert.equal(value.status, "passed"); identifier(value.providerEventId);
  for (const field of ["startedAt", "completedAt"]) assert.equal(new Date(value[field]).toISOString(), value[field]); assert.ok(Date.parse(value.completedAt) >= Date.parse(value.startedAt)); assert.equal(value.observations.missionContinuityRatio, 1); for (const key of ["duplicateMaterialEffects", "unauthorizedActivations", "lostCommittedReceipts", "morphologyHeadForks", "crossTenantEffects", "crossMissionEffects"]) assert.equal(value.observations[key], 0); assert.equal(value.contentCaptured, false); sha(value.evidenceDigest);
  const evidence = value.classEvidence; const intent = request.intent;
  if (request.operationClass === "rolling-deployment") { assert.equal(evidence.predecessorImage, intent.predecessorImage); assert.equal(evidence.successorImage, intent.successorImage); assert.ok(evidence.failureDomainCount >= 3); assert.equal(evidence.allPeersReady, true); assert.equal(evidence.versionSkewObserved, true); }
  else if (request.operationClass === "schema-upgrade") { assert.equal(evidence.previousMigration, intent.previousMigration); assert.equal(evidence.successorMigration, intent.successorMigration); assert.equal(evidence.backwardRestoreTested, true); sha(evidence.migrationReceiptDigest); }
  else if (request.operationClass === "backup-restore") { assert.equal(evidence.sourceResourceId, intent.sourceResourceId); sha(evidence.backupDigest); sha(evidence.sourceCanonicalRoot); assert.equal(evidence.restoredCanonicalRoot, evidence.sourceCanonicalRoot); identifier(evidence.cleanRestoreResourceId); assert.notEqual(evidence.cleanRestoreResourceId, intent.sourceResourceId); assert.ok(evidence.restorePointLossMs >= 0); assert.ok(evidence.restoreTimeMs > 0); }
  else { assert.equal(evidence.predecessorKeyId, intent.predecessorKeyId); assert.equal(evidence.successorKeyId, intent.successorKeyId); assert.equal(evidence.rotationReceiptDigest, intent.rotationReceiptDigest); assert.equal(evidence.activeSignerKeyId, intent.successorKeyId); assert.equal(evidence.predecessorSigningDenied, true); assert.equal(evidence.predecessorHistoricalVerificationPassed, true); }
  const { responseDigest, ...body } = value; assert.equal(responseDigest, digest("staging-maintenance-response-v1", body)); return Object.freeze(value);
}
function image(value) { assert.match(value, /@sha256:[0-9a-f]{64}$/u); } function identifier(value) { assert.match(value, /^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u); } function sha(value) { assert.match(value, /^sha256:[0-9a-f]{64}$/u); } export function digest(domain, value) { return `sha256:${createHash("sha256").update(`${domain}\n${JSON.stringify(value)}`).digest("hex")}`; }
