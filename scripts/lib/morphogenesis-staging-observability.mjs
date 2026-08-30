import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export class MorphogenesisStagingObservabilityGatewayV1 {
  #endpoint;
  #fetch;
  #authorizationHeader;
  #timeoutMs;

  constructor({ endpoint, fetch = globalThis.fetch, authorizationHeader, timeoutMs = 30_000 }) {
    const url = new URL(endpoint);
    if (
      url.protocol !== "https:" || url.username || url.password || url.search || url.hash
    ) throw new TypeError("staging observability gateway must use credential-free HTTPS");
    if (typeof fetch !== "function") throw new TypeError("staging observability fetch is unavailable");
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000)
      throw new TypeError("staging observability timeout is invalid");
    this.#endpoint = url;
    this.#fetch = fetch;
    this.#authorizationHeader = authorizationHeader;
    this.#timeoutMs = timeoutMs;
  }

  async preflight(input) {
    assert.match(input.sourceCommit, /^[0-9a-f]{40}$/u);
    sha(input.inventoryDigest);
    sha(input.deploymentReceiptDigest);
    assert.match(input.challenge, /^[A-Za-z0-9_-]{22,128}$/u);
    text(input.alertReceiverId);
    const body = {
      schemaVersion: 1,
      kind: "agentplat-agent-morphogenesis-beta1-staging-observability-request-v1",
      sourceCommit: input.sourceCommit,
      inventoryDigest: input.inventoryDigest,
      deploymentReceiptDigest: input.deploymentReceiptDigest,
      challenge: input.challenge,
      alertReceiverId: input.alertReceiverId,
      contentPolicy: "content-free-only",
    };
    const requestDigest = digest("staging-observability-request-v1", body);
    const authorization = await this.#authorizationHeader?.();
    if (authorization !== undefined && authorization.trim() === "")
      throw new Error("staging observability authorization is empty");
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
      throw new Error("staging observability gateway failed closed");
    const encoded = await response.text();
    if (Buffer.byteLength(encoded, "utf8") > 65_536)
      throw new Error("staging observability response is oversized");
    let value;
    try { value = JSON.parse(encoded); }
    catch { throw new Error("staging observability response is invalid JSON"); }
    return validateResponse(value, requestDigest, input.alertReceiverId);
  }
}

function validateResponse(value, requestDigest, alertReceiverId) {
  assert.equal(value.schemaVersion, 1);
  assert.equal(value.kind, "agentplat-agent-morphogenesis-beta1-staging-observability-response-v1");
  assert.equal(value.requestDigest, requestDigest);
  assert.equal(value.status, "passed");
  assert.deepEqual(value.checks, {
    logs: "query-passed",
    metrics: "query-passed",
    otlp: "ingestion-passed",
  });
  assert.equal(value.contentCaptured, false);
  assert.equal(value.alert.receiverId, alertReceiverId);
  text(value.alert.alertId);
  for (const field of ["firedAt", "deliveredAt", "resolvedAt"])
    assert.equal(new Date(value.alert[field]).toISOString(), value.alert[field]);
  assert.ok(Date.parse(value.alert.firedAt) <= Date.parse(value.alert.deliveredAt));
  assert.ok(Date.parse(value.alert.deliveredAt) <= Date.parse(value.alert.resolvedAt));
  sha(value.alert.deliveryReceiptDigest);
  sha(value.metricsEvidenceDigest);
  sha(value.logsEvidenceDigest);
  sha(value.otlpEvidenceDigest);
  const body = {
    schemaVersion: 1,
    kind: value.kind,
    requestDigest: value.requestDigest,
    status: value.status,
    checks: value.checks,
    alert: value.alert,
    metricsEvidenceDigest: value.metricsEvidenceDigest,
    logsEvidenceDigest: value.logsEvidenceDigest,
    otlpEvidenceDigest: value.otlpEvidenceDigest,
    contentCaptured: value.contentCaptured,
  };
  assert.deepEqual(Object.keys(value).sort(), [...Object.keys(body), "responseDigest"].sort());
  assert.equal(value.responseDigest, digest("staging-observability-response-v1", body));
  return Object.freeze(value);
}

function text(value) {
  assert.match(value, /^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u);
}

function sha(value) {
  assert.match(value, /^sha256:[0-9a-f]{64}$/u);
}

export function digest(domain, value) {
  return `sha256:${createHash("sha256").update(`${domain}\n${JSON.stringify(value)}`).digest("hex")}`;
}
