#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MorphogenesisStagingFaultGatewayV1,
  STAGING_FAULT_CLASSES_V1,
  digest,
} from "./lib/morphogenesis-staging-fault-gateway.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const options = parse(process.argv.slice(2));
const mode = options.mode ?? "contract-smoke";

if (mode === "contract-smoke") {
  assert.deepEqual(Object.keys(options).sort(), ["mode"]);
  console.log(JSON.stringify({
    status: "passed",
    faultClasses: STAGING_FAULT_CLASSES_V1,
    providerEvidenceRequired: true,
    executionPermitted: false,
    stagingQualification: "not-established",
    productionClaimPermitted: false,
  }, null, 2));
} else if (mode === "run") {
  allowed([
    "confirm", "cycle", "deployment-receipt", "fault-class", "inventory",
    "mode", "output-directory", "token-file",
  ]);
  assert.equal(options.confirm, "RUN_MORPHOGENESIS_STAGING_FAULT");
  const faultClass = required("fault-class");
  assert.ok(STAGING_FAULT_CLASSES_V1.includes(faultClass));
  const cycle = Number(required("cycle"));
  assert.ok(Number.isSafeInteger(cycle) && cycle >= 1);
  const outputDirectory = external(required("output-directory"));
  const [inventory, deployment] = await Promise.all([
    json(external(required("inventory"))),
    json(external(required("deployment-receipt"))),
  ]);
  assert.equal(inventory.status, "bound");
  assert.equal(deployment.status, "deployed");
  assert.equal(deployment.sourceCommit, inventory.sourceCommit);
  const { receiptDigest: deploymentReceiptDigest, ...deploymentBody } = deployment;
  assert.equal(deploymentReceiptDigest, digest("staging-deployment-receipt-v1", deploymentBody));
  const inventoryDigest = digest(
    "agentplat-agent-morphogenesis-beta1-distributed-staging-inventory-v1",
    inventory,
  );
  assert.equal(deployment.inventoryDigest, inventoryDigest);
  assert.ok(inventory.faultInjection.supportedFaultClasses.includes(faultClass));
  const tokenFile = options["token-file"] ? external(options["token-file"]) : null;
  const gateway = new MorphogenesisStagingFaultGatewayV1({
    endpoint: inventory.faultInjection.gatewayEndpoint,
    ...(tokenFile
      ? {
          authorizationHeader: async () => {
            const token = (await readFile(tokenFile, "utf8")).trim();
            if (!token) throw new Error("fault gateway token is empty");
            return `Bearer ${token}`;
          },
        }
      : {}),
  });
  const result = await gateway.execute({
    sourceCommit: inventory.sourceCommit,
    inventoryDigest,
    deploymentReceiptDigest,
    faultClass,
    cycle,
    challenge: randomBytes(24).toString("base64url"),
    targetResourceIds: targets(inventory, faultClass),
  });
  const body = {
    schemaVersion: 1,
    kind: "agentplat-agent-morphogenesis-beta1-staging-fault-receipt-v1",
    status: "passed",
    sourceCommit: inventory.sourceCommit,
    inventoryDigest,
    deploymentReceiptDigest,
    faultClass,
    cycle,
    gatewayResponseDigest: result.responseDigest,
    providerEventId: result.providerEventId,
    affectedResourceIds: result.affectedResourceIds,
    failureDomainIds: result.failureDomainIds,
    injectedAt: result.injectedAt,
    recoveredAt: result.recoveredAt,
    observations: result.observations,
    classEvidence: result.classEvidence,
    evidenceDigest: result.evidenceDigest,
    contentCaptured: false,
    stagingQualification: "not-established",
    productionReadiness: "not-established",
    productionClaimPermitted: false,
  };
  const receipt = { ...body, receiptDigest: digest("staging-fault-receipt-v1", body) };
  const operationDetail = {
    faultClass,
    cycle,
    externalFaultReceiptDigest: receipt.receiptDigest,
    providerEventId: result.providerEventId,
    evidenceDigest: result.evidenceDigest,
  };
  await mkdir(outputDirectory, { recursive: false });
  await Promise.all([
    writeFile(
      path.join(outputDirectory, "fault-receipt.json"),
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
    faultClass,
    cycle,
    receiptDigest: receipt.receiptDigest,
    providerEventId: result.providerEventId,
    stagingQualification: "not-established",
    productionClaimPermitted: false,
    outputDirectory,
  }, null, 2));
} else {
  throw new TypeError("staging_fault_mode_invalid");
}

function targets(inventory, faultClass) {
  if (faultClass === "postgres-failover") return [inventory.postgresql.resourceId];
  if (faultClass === "temporal-worker-loss") return [inventory.temporal.resourceId];
  if (faultClass === "host-loss") return inventory.cluster.failureDomains.map(({ nodeUid }) => nodeUid);
  return inventory.agentMesh.processes.map(({ processId }) => processId);
}

function required(name) { const value = options[name]; if (!value) throw new TypeError(`${name} is required`); return value; }
function external(value) { const resolved = path.resolve(value); const relative = path.relative(root, resolved); if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) throw new TypeError("staging fault paths must be external"); return resolved; }
function allowed(names) { for (const name of Object.keys(options)) if (!names.includes(name)) throw new TypeError(`unsupported option: ${name}`); }
function parse(args) { const result = {}; for (let index = 0; index < args.length; index += 1) { if (args[index] === "--") continue; if (!args[index].startsWith("--")) throw new TypeError("invalid option"); const value = args[index + 1]; if (!value || value.startsWith("--")) throw new TypeError(`missing value for ${args[index]}`); result[args[index].slice(2)] = value; index += 1; } return result; }
async function json(file) { return JSON.parse(await readFile(file, "utf8")); }
