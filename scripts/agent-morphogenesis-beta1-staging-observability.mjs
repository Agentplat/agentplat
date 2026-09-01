#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MorphogenesisStagingObservabilityGatewayV1,
  digest,
} from "./lib/morphogenesis-staging-observability.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const options = parse(process.argv.slice(2));
const mode = options.mode ?? "contract-smoke";

if (mode === "contract-smoke") {
  assert.deepEqual(Object.keys(options).sort(), ["mode"]);
  console.log(JSON.stringify({
    status: "passed",
    requiredChecks: ["otlp-ingestion", "metrics-query", "logs-query", "alert-delivery-resolution"],
    contentPolicy: "content-free-only",
    executionPermitted: false,
    stagingQualification: "not-established",
    productionClaimPermitted: false,
  }, null, 2));
} else if (mode === "run") {
  allowed([
    "confirm", "deployment-receipt", "inventory", "mode", "output-directory",
    "token-file",
  ]);
  assert.equal(options.confirm, "RUN_MORPHOGENESIS_STAGING_OBSERVABILITY_PREFLIGHT");
  const outputDirectory = external(required("output-directory"));
  const [inventory, deployment] = await Promise.all([
    json(external(required("inventory"))),
    json(external(required("deployment-receipt"))),
  ]);
  assert.equal(inventory.status, "bound");
  assert.equal(deployment.status, "deployed");
  assert.equal(deployment.sourceCommit, inventory.sourceCommit);
  assert.equal(deployment.productionClaimPermitted, false);
  const { receiptDigest: deploymentReceiptDigest, ...deploymentBody } = deployment;
  assert.equal(
    deploymentReceiptDigest,
    digest("staging-deployment-receipt-v1", deploymentBody),
  );
  const inventoryDigest = digest(
    "agentplat-agent-morphogenesis-beta1-distributed-staging-inventory-v1",
    inventory,
  );
  assert.equal(deployment.inventoryDigest, inventoryDigest);
  const tokenFile = options["token-file"] ? external(options["token-file"]) : null;
  const gateway = new MorphogenesisStagingObservabilityGatewayV1({
    endpoint: inventory.observability.gatewayEndpoint,
    ...(tokenFile
      ? {
          authorizationHeader: async () => {
            const token = (await readFile(tokenFile, "utf8")).trim();
            if (!token) throw new Error("observability token is empty");
            return `Bearer ${token}`;
          },
        }
      : {}),
  });
  const response = await gateway.preflight({
    sourceCommit: inventory.sourceCommit,
    inventoryDigest,
    deploymentReceiptDigest,
    challenge: randomBytes(24).toString("base64url"),
    alertReceiverId: inventory.observability.alertReceiverId,
  });
  const body = {
    schemaVersion: 1,
    kind: "agentplat-agent-morphogenesis-beta1-staging-observability-receipt-v1",
    status: "passed",
    sourceCommit: inventory.sourceCommit,
    inventoryDigest,
    deploymentReceiptDigest,
    gatewayResponseDigest: response.responseDigest,
    checks: response.checks,
    alert: response.alert,
    metricsEvidenceDigest: response.metricsEvidenceDigest,
    logsEvidenceDigest: response.logsEvidenceDigest,
    otlpEvidenceDigest: response.otlpEvidenceDigest,
    contentCaptured: false,
    stagingQualification: "not-established",
    productionReadiness: "not-established",
    productionClaimPermitted: false,
  };
  const receipt = {
    ...body,
    receiptDigest: digest("staging-observability-receipt-v1", body),
  };
  const operationDetail = {
    externalReceiptDigest: receipt.receiptDigest,
    alertDeliveryReceiptDigest: response.alert.deliveryReceiptDigest,
    metricsEvidenceDigest: response.metricsEvidenceDigest,
    logsEvidenceDigest: response.logsEvidenceDigest,
    otlpEvidenceDigest: response.otlpEvidenceDigest,
  };
  await mkdir(outputDirectory, { recursive: false });
  await Promise.all([
    writeFile(
      path.join(outputDirectory, "observability-receipt.json"),
      `${JSON.stringify(receipt, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    ),
    writeFile(
      path.join(outputDirectory, "operation-detail.json"),
      `${JSON.stringify(operationDetail, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    ),
  ]);
  console.log(JSON.stringify({
    status: "passed",
    receiptDigest: receipt.receiptDigest,
    alertDeliveryReceiptDigest: response.alert.deliveryReceiptDigest,
    contentCaptured: false,
    stagingQualification: "not-established",
    productionClaimPermitted: false,
    outputDirectory,
  }, null, 2));
} else {
  throw new TypeError("staging_observability_mode_invalid");
}

function required(name) {
  const value = options[name];
  if (!value) throw new TypeError(`${name} is required`);
  return value;
}

function external(value) {
  const resolved = path.resolve(value);
  const relative = path.relative(root, resolved);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)))
    throw new TypeError("staging observability paths must be external");
  return resolved;
}

function allowed(names) {
  for (const name of Object.keys(options))
    if (!names.includes(name)) throw new TypeError(`unsupported option: ${name}`);
}

function parse(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--") continue;
    if (!args[index].startsWith("--")) throw new TypeError("invalid option");
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new TypeError(`missing value for ${args[index]}`);
    result[args[index].slice(2)] = value;
    index += 1;
  }
  return result;
}

async function json(file) {
  return JSON.parse(await readFile(file, "utf8"));
}
