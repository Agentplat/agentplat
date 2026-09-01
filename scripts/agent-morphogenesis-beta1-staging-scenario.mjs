#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MorphogenesisStagingScenarioGatewayV1,
  digest,
} from "./lib/morphogenesis-staging-scenario-gateway.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const options = parse(process.argv.slice(2));
const mode = options.mode ?? "contract-smoke";

if (mode === "contract-smoke") {
  assert.deepEqual(Object.keys(options).sort(), ["mode"]);
  const [profile, readiness] = await Promise.all([
    json(path.join(root, "config/agent-morphogenesis-beta1-staging-qualification-v1.json")),
    json(path.join(root, "config/agent-morphogenesis-beta1-operational-readiness-v1.json")),
  ]);
  assert.equal(readiness.operationalScenarioIds.length, 22);
  assert.equal(profile.partitionAuthorityScenarioIds.length, 6);
  console.log(JSON.stringify({
    status: "passed",
    canonicalScenarioCount: 22,
    partitionAuthorityScenarioCount: 6,
    phases: ["baseline", "post-upgrade", "partition"],
    executionPermitted: false,
    stagingQualification: "not-established",
    productionClaimPermitted: false,
  }, null, 2));
} else if (mode === "run") {
  allowed([
    "confirm", "deployment-receipt", "inventory", "mode", "output-directory",
    "phase", "scenario-id", "token-file",
  ]);
  assert.equal(options.confirm, "RUN_MORPHOGENESIS_STAGING_SCENARIO");
  const scenarioId = required("scenario-id");
  const phase = required("phase");
  assert.ok(new Set(["baseline", "post-upgrade", "partition"]).has(phase));
  const outputDirectory = external(required("output-directory"));
  const [profile, readiness, inventory, deployment] = await Promise.all([
    json(path.join(root, "config/agent-morphogenesis-beta1-staging-qualification-v1.json")),
    json(path.join(root, "config/agent-morphogenesis-beta1-operational-readiness-v1.json")),
    json(external(required("inventory"))),
    json(external(required("deployment-receipt"))),
  ]);
  assert.ok(readiness.operationalScenarioIds.includes(scenarioId));
  if (phase === "partition") assert.ok(profile.partitionAuthorityScenarioIds.includes(scenarioId));
  assert.equal(inventory.status, "bound");
  assert.equal(deployment.status, "deployed");
  const { receiptDigest: deploymentReceiptDigest, ...deploymentBody } = deployment;
  assert.equal(deploymentReceiptDigest, digest("staging-deployment-receipt-v1", deploymentBody));
  const inventoryDigest = digest(
    "agentplat-agent-morphogenesis-beta1-distributed-staging-inventory-v1",
    inventory,
  );
  assert.equal(deployment.inventoryDigest, inventoryDigest);
  const tokenFile = options["token-file"] ? external(options["token-file"]) : null;
  const gateway = new MorphogenesisStagingScenarioGatewayV1({
    endpoint: inventory.scenarioExecution.gatewayEndpoint,
    ...(tokenFile ? { authorizationHeader: async () => {
      const token = (await readFile(tokenFile, "utf8")).trim();
      if (!token) throw new Error("scenario gateway token is empty");
      return `Bearer ${token}`;
    } } : {}),
  });
  const result = await gateway.execute({
    sourceCommit: inventory.sourceCommit,
    inventoryDigest,
    deploymentReceiptDigest,
    scenarioId,
    phase,
    postgresqlResourceId: inventory.postgresql.resourceId,
    temporalResourceId: inventory.temporal.resourceId,
    challenge: randomBytes(24).toString("base64url"),
  });
  const body = {
    schemaVersion: 1,
    kind: "agentplat-agent-morphogenesis-beta1-staging-scenario-receipt-v1",
    status: "passed",
    sourceCommit: inventory.sourceCommit,
    inventoryDigest,
    deploymentReceiptDigest,
    scenarioId,
    phase,
    gatewayResponseDigest: result.responseDigest,
    scenarioOutcome: result.scenarioOutcome,
    executionDomain: result.executionDomain,
    decisionActorType: result.decisionActorType,
    invariants: result.invariants,
    metrics: result.metrics,
    evidenceDigest: result.evidenceDigest,
    contentCaptured: false,
    stagingQualification: "not-established",
    productionReadiness: "not-established",
    productionClaimPermitted: false,
  };
  const receipt = { ...body, receiptDigest: digest("staging-scenario-receipt-v1", body) };
  const operationDetail = {
    scenarioId,
    phase,
    externalScenarioReceiptDigest: receipt.receiptDigest,
    evidenceDigest: result.evidenceDigest,
  };
  await mkdir(outputDirectory, { recursive: false });
  await Promise.all([
    writeFile(path.join(outputDirectory, "scenario-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf8", flag: "wx" }),
    writeFile(path.join(outputDirectory, "operation-detail.json"), `${JSON.stringify(operationDetail, null, 2)}\n`, { encoding: "utf8", flag: "wx" }),
  ]);
  console.log(JSON.stringify({ status: "passed", scenarioId, phase, receiptDigest: receipt.receiptDigest, stagingQualification: "not-established", productionClaimPermitted: false, outputDirectory }, null, 2));
} else throw new TypeError("staging_scenario_mode_invalid");

function required(name) { const value = options[name]; if (!value) throw new TypeError(`${name} is required`); return value; }
function external(value) { const resolved = path.resolve(value); const relative = path.relative(root, resolved); if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) throw new TypeError("staging scenario paths must be external"); return resolved; }
function allowed(names) { for (const name of Object.keys(options)) if (!names.includes(name)) throw new TypeError(`unsupported option: ${name}`); }
function parse(args) { const result = {}; for (let index = 0; index < args.length; index += 1) { if (args[index] === "--") continue; if (!args[index].startsWith("--")) throw new TypeError("invalid option"); const value = args[index + 1]; if (!value || value.startsWith("--")) throw new TypeError(`missing value for ${args[index]}`); result[args[index].slice(2)] = value; index += 1; } return result; }
async function json(file) { return JSON.parse(await readFile(file, "utf8")); }
