import assert from "node:assert/strict";
import test from "node:test";

import {
  MorphogenesisStagingObservabilityGatewayV1,
  digest,
} from "./lib/morphogenesis-staging-observability.mjs";

const sha = (character) => `sha256:${character.repeat(64)}`;
const input = {
  sourceCommit: "a".repeat(40),
  inventoryDigest: sha("b"),
  deploymentReceiptDigest: sha("c"),
  challenge: "CCCCCCCCCCCCCCCCCCCCCC",
  alertReceiverId: "receiver:staging-ops",
};

function successful(request, change = (value) => value) {
  const body = {
    schemaVersion: 1,
    kind: "agentplat-agent-morphogenesis-beta1-staging-observability-response-v1",
    requestDigest: request.requestDigest,
    status: "passed",
    checks: {
      logs: "query-passed",
      metrics: "query-passed",
      otlp: "ingestion-passed",
    },
    alert: {
      alertId: "alert:staging-preflight",
      receiverId: input.alertReceiverId,
      firedAt: "2026-08-30T12:00:00.000Z",
      deliveredAt: "2026-08-30T12:00:01.000Z",
      resolvedAt: "2026-08-30T12:00:02.000Z",
      deliveryReceiptDigest: sha("d"),
    },
    metricsEvidenceDigest: sha("e"),
    logsEvidenceDigest: sha("f"),
    otlpEvidenceDigest: sha("0"),
    contentCaptured: false,
  };
  const changed = change(body);
  return {
    ...changed,
    responseDigest: digest("staging-observability-response-v1", changed),
  };
}

test("observability gateway binds content-free telemetry and alert delivery", async () => {
  let authorization;
  const gateway = new MorphogenesisStagingObservabilityGatewayV1({
    endpoint: "https://observability.staging.invalid/v1/preflight",
    authorizationHeader: async () => "Bearer projected-observability-token",
    fetch: async (_url, init) => {
      authorization = init.headers.authorization;
      return Response.json(successful(JSON.parse(init.body)));
    },
  });
  const response = await gateway.preflight(input);
  assert.equal(response.status, "passed");
  assert.equal(response.contentCaptured, false);
  assert.equal(authorization, "Bearer projected-observability-token");
});

test("observability gateway rejects replay binding and captured content", async () => {
  const gateway = (change) => new MorphogenesisStagingObservabilityGatewayV1({
    endpoint: "https://observability.staging.invalid/v1/preflight",
    fetch: async (_url, init) => Response.json(successful(JSON.parse(init.body), change)),
  });
  await assert.rejects(
    gateway((value) => ({ ...value, requestDigest: sha("9") })).preflight(input),
  );
  await assert.rejects(
    gateway((value) => ({ ...value, contentCaptured: true })).preflight(input),
  );
  assert.throws(
    () => new MorphogenesisStagingObservabilityGatewayV1({
      endpoint: "http://observability.invalid",
    }),
    /credential-free HTTPS/,
  );
});
