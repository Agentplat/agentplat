#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

import {
  awsKmsPublicKeyPemV1,
  createAwsJsonRunner,
  resolveAwsKmsEd25519V1,
  signAwsKmsEd25519V1,
} from "./lib/aws-kms-ed25519.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const options = parse(process.argv.slice(2));
const mode = options.mode ?? "contract-smoke";

if (mode === "contract-smoke") {
  exact(["mode"]);
  console.log(JSON.stringify({
    status: "passed",
    custody: "external-aws-kms",
    dualKeyProofRequired: true,
    executionPermitted: false,
    stagingQualification: "not-established",
    productionClaimPermitted: false,
  }, null, 2));
} else if (mode === "rotate") {
  exact([
    "activate-at", "actor-id", "actor-type", "aws-cli", "aws-profile",
    "aws-region", "confirm", "mode", "operation-id", "output-directory",
    "overlap-until", "predecessor-key-id", "source-sha", "successor-key-id",
  ]);
  assert.equal(options.confirm, "ROTATE_MORPHOGENESIS_STAGING_KMS_KEY");
  assert.ok(new Set(["agent", "person", "collective"]).has(options["actor-type"]));
  identifier(options["actor-id"]);
  identifier(options["operation-id"]);
  const sourceCommit = required("source-sha");
  assert.match(sourceCommit, /^[0-9a-f]{40}$/u);
  assert.equal(git("rev-parse", "HEAD"), sourceCommit);
  assert.equal(git("status", "--porcelain=v1", "--untracked-files=no"), "");
  const activateAt = iso(required("activate-at"));
  const overlapUntil = iso(required("overlap-until"));
  assert.ok(Date.parse(overlapUntil) > Date.parse(activateAt));
  const outputDirectory = external(required("output-directory"));
  const runAws = createAwsJsonRunner({
    executable: options["aws-cli"],
    profile: options["aws-profile"],
    region: options["aws-region"],
  });
  const [predecessor, successor] = await Promise.all([
    resolveAwsKmsEd25519V1({ keyId: required("predecessor-key-id"), runAws }),
    resolveAwsKmsEd25519V1({ keyId: required("successor-key-id"), runAws }),
  ]);
  assert.notEqual(predecessor.keyId, successor.keyId);
  assert.notEqual(predecessor.publicKeyFingerprint, successor.publicKeyFingerprint);
  const body = {
    schemaVersion: 1,
    kind: "agentplat-agent-morphogenesis-beta1-staging-key-rotation-v1",
    operationId: options["operation-id"],
    sourceCommit,
    actorType: options["actor-type"],
    actorId: options["actor-id"],
    predecessor: publicBinding(predecessor),
    successor: publicBinding(successor),
    activateAt,
    overlapUntil,
    predecessorDispositionAfterOverlap: "verify-only",
    successorDispositionAtActivation: "sign-and-verify",
    privateKeyExported: false,
    stagingQualification: "not-established",
    productionReadiness: "not-established",
    productionClaimPermitted: false,
  };
  const rotationDigest = digest(
    "agentplat-agent-morphogenesis-beta1-staging-key-rotation-v1",
    body,
  );
  const message = signingBytes(body);
  const [predecessorSignature, successorSignature] = await Promise.all([
    signAwsKmsEd25519V1({ material: predecessor, message, runAws }),
    signAwsKmsEd25519V1({ material: successor, message, runAws }),
  ]);
  const receipt = {
    ...body,
    rotationDigest,
    proofs: [
      { keyId: predecessor.keyId, role: "predecessor", algorithm: "Ed25519", signature: predecessorSignature },
      { keyId: successor.keyId, role: "successor", algorithm: "Ed25519", signature: successorSignature },
    ],
  };
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    exclusive(outputDirectory, "key-rotation-receipt.json", `${JSON.stringify(receipt, null, 2)}\n`),
    exclusive(outputDirectory, "predecessor-public-key.pem", awsKmsPublicKeyPemV1(predecessor)),
    exclusive(outputDirectory, "successor-public-key.pem", awsKmsPublicKeyPemV1(successor)),
  ]);
  console.log(JSON.stringify({
    status: "rotation-receipt-issued",
    rotationDigest,
    predecessorKeyId: predecessor.keyId,
    successorKeyId: successor.keyId,
    privateKeyExported: false,
    signerActivationVerified: false,
    stagingQualification: "not-established",
    productionClaimPermitted: false,
    outputDirectory,
  }, null, 2));
} else if (mode === "verify") {
  exact(["directory", "mode"]);
  const directory = path.resolve(required("directory"));
  const [receipt, predecessorPem, successorPem] = await Promise.all([
    json(path.join(directory, "key-rotation-receipt.json")),
    readFile(path.join(directory, "predecessor-public-key.pem"), "utf8"),
    readFile(path.join(directory, "successor-public-key.pem"), "utf8"),
  ]);
  const { rotationDigest, proofs, ...body } = receipt;
  assert.equal(
    rotationDigest,
    digest("agentplat-agent-morphogenesis-beta1-staging-key-rotation-v1", body),
  );
  assert.equal(proofs.length, 2);
  const expected = [
    { binding: body.predecessor, role: "predecessor", pem: predecessorPem },
    { binding: body.successor, role: "successor", pem: successorPem },
  ];
  for (const [index, item] of expected.entries()) {
    const proof = proofs[index];
    assert.equal(proof.keyId, item.binding.keyId);
    assert.equal(proof.role, item.role);
    assert.equal(proof.algorithm, "Ed25519");
    const bytes = pemBytes(item.pem);
    assert.equal(
      `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      item.binding.publicKeyFingerprint,
    );
    const publicKey = await crypto.subtle.importKey(
      "spki", bytes, { name: "Ed25519" }, false, ["verify"],
    );
    assert.equal(
      await crypto.subtle.verify(
        "Ed25519", publicKey, Buffer.from(proof.signature, "base64url"), signingBytes(body),
      ),
      true,
    );
  }
  assert.equal(body.productionClaimPermitted, false);
  assert.equal(body.privateKeyExported, false);
  console.log(JSON.stringify({
    status: "verified",
    rotationDigest,
    dualKeyProofs: 2,
    productionClaimPermitted: false,
  }, null, 2));
} else {
  throw new TypeError("staging_key_rotation_mode_invalid");
}

function publicBinding(material) {
  return {
    keyId: material.keyId,
    keySpec: material.keySpec,
    keyUsage: material.keyUsage,
    signingAlgorithm: material.signingAlgorithm,
    publicKeyFingerprint: material.publicKeyFingerprint,
    nonExportable: true,
  };
}

function signingBytes(body) {
  return Buffer.from(
    `agentplat-agent-morphogenesis-beta1-staging-key-rotation-v1\n${JSON.stringify(body)}`,
    "utf8",
  );
}

function digest(domain, value) {
  return `sha256:${createHash("sha256").update(`${domain}\n${JSON.stringify(value)}`).digest("hex")}`;
}

function pemBytes(pem) {
  return Buffer.from(
    pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/gu, ""),
    "base64",
  );
}

function iso(value) {
  assert.equal(new Date(value).toISOString(), value);
  return value;
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
    throw new TypeError("key rotation output must be external");
  return resolved;
}

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

async function exclusive(directory, name, value) {
  await writeFile(path.join(directory, name), value, { encoding: "utf8", flag: "wx" });
}

async function json(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function exact(expected) {
  assert.deepEqual(Object.keys(options).sort(), expected.filter((key) => options[key] !== undefined).sort());
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
