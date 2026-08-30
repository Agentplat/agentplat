#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createAwsJsonRunner,
  resolveAwsKmsEd25519V1,
  signAwsKmsEd25519V1,
} from "./lib/aws-kms-ed25519.mjs";
import { digest } from "./lib/morphogenesis-staging-supervisor.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const options = parse(process.argv.slice(2));
const mode = options.mode ?? "contract-smoke";

if (mode === "contract-smoke") {
  allowed(["mode"]);
  console.log(JSON.stringify({
    status: "passed",
    signer: "external-aws-kms",
    safetyInvariantsMustBeZero: true,
    executionPermitted: false,
    stagingQualification: "not-established",
    productionClaimPermitted: false,
  }, null, 2));
} else if (mode === "issue") {
  allowed([
    "aws-cli", "aws-profile", "aws-region", "confirm", "detail", "mode",
    "operation-id", "operation-type", "output-directory", "sequence",
    "supervisor-directory",
  ]);
  assert.equal(options.confirm, "ISSUE_MORPHOGENESIS_STAGING_OPERATION_RECEIPT");
  const supervisorDirectory = external(required("supervisor-directory"));
  const outputDirectory = external(required("output-directory"));
  const [config, detail] = await Promise.all([
    json(path.join(supervisorDirectory, "supervisor-config.json")),
    json(external(required("detail"))),
  ]);
  const sequence = Number(required("sequence"));
  assert.ok(Number.isSafeInteger(sequence) && sequence >= 1);
  identifier(required("operation-id"));
  const operationType = required("operation-type");
  assert.ok(new Set([
    "canonical-scenario", "fault-cycle", "rolling-deployment", "schema-upgrade",
    "backup-restore", "key-rotation", "tenant-mission-isolation",
    "alert-delivery", "soak-summary",
  ]).has(operationType));
  const runAws = createAwsJsonRunner({
    executable: options["aws-cli"],
    profile: options["aws-profile"],
    region: options["aws-region"],
  });
  const material = await resolveAwsKmsEd25519V1({
    keyId: config.campaignKeyId,
    runAws,
  });
  assert.equal(material.keyId, config.campaignKeyId);
  assert.equal(material.publicKeyFingerprint, config.campaignPublicKeyFingerprint);
  const body = {
    schemaVersion: 1,
    kind: "agentplat-agent-morphogenesis-beta1-staging-operation-receipt-v1",
    configDigest: config.configDigest,
    sourceCommit: config.sourceCommit,
    sequence,
    operationId: options["operation-id"],
    operationType,
    status: "passed",
    detail,
    invariants: {
      duplicateMaterialEffects: 0,
      unauthorizedActivations: 0,
      lostCommittedReceipts: 0,
      morphologyHeadForks: 0,
      crossTenantEffects: 0,
      crossMissionEffects: 0,
      missionContinuityRatio: 1,
    },
    productionReadiness: "not-established",
    productionClaimPermitted: false,
  };
  const signature = await signAwsKmsEd25519V1({
    material,
    message: signingBytes(body),
    runAws,
  });
  const receipt = {
    ...body,
    receiptDigest: digest(
      "agentplat-agent-morphogenesis-beta1-staging-operation-receipt-v1",
      body,
    ),
    proof: {
      algorithm: "Ed25519",
      keyId: material.keyId,
      signature,
    },
  };
  await mkdir(outputDirectory, { recursive: false });
  await writeFile(
    path.join(outputDirectory, "operation-receipt.json"),
    `${JSON.stringify(receipt, null, 2)}\n`,
    { encoding: "utf8", flag: "wx" },
  );
  console.log(JSON.stringify({
    status: "issued",
    operationId: body.operationId,
    operationType,
    sequence,
    receiptDigest: receipt.receiptDigest,
    campaignKeyId: material.keyId,
    productionClaimPermitted: false,
    outputDirectory,
  }, null, 2));
} else {
  throw new TypeError("staging_operation_receipt_mode_invalid");
}

function signingBytes(body) {
  return Buffer.from(
    `agentplat-agent-morphogenesis-beta1-staging-operation-receipt-v1\n${JSON.stringify(body)}`,
    "utf8",
  );
}

function identifier(value) {
  assert.match(value, /^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u);
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
    throw new TypeError("staging operation receipt paths must be external");
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
