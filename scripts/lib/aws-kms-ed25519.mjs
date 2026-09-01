import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

export function createAwsJsonRunner(options = {}) {
  const executable = options.executable ?? "aws";
  const prefix = [
    ...(options.profile ? ["--profile", options.profile] : []),
    ...(options.region ? ["--region", options.region] : []),
  ];
  return async (args) => {
    const output = execFileSync(executable, [...prefix, ...args, "--output", "json"], {
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    try {
      return JSON.parse(output);
    } catch {
      throw new Error("AWS KMS returned invalid JSON");
    }
  };
}

export async function resolveAwsKmsEd25519V1({ keyId, runAws }) {
  text(keyId, "AWS KMS key ID");
  assert.equal(typeof runAws, "function");
  const [publicResponse, metadataResponse] = await Promise.all([
    runAws(["kms", "get-public-key", "--key-id", keyId]),
    runAws(["kms", "describe-key", "--key-id", keyId]),
  ]);
  assert.equal(typeof publicResponse?.KeyId, "string", "AWS KMS key ID is missing");
  assert.equal(publicResponse.KeyId, metadataResponse?.KeyMetadata?.Arn);
  assert.equal(publicResponse.KeySpec, "ECC_NIST_EDWARDS25519");
  assert.equal(publicResponse.KeyUsage, "SIGN_VERIFY");
  assert.ok(publicResponse.SigningAlgorithms?.includes("ED25519_SHA_512"));
  assert.equal(metadataResponse.KeyMetadata.Enabled, true);
  assert.equal(metadataResponse.KeyMetadata.KeyState, "Enabled");
  assert.equal(metadataResponse.KeyMetadata.KeySpec, "ECC_NIST_EDWARDS25519");
  assert.equal(metadataResponse.KeyMetadata.KeyUsage, "SIGN_VERIFY");
  assert.equal(typeof publicResponse.PublicKey, "string");
  const publicKeyBytes = Buffer.from(publicResponse.PublicKey, "base64");
  assert.ok(publicKeyBytes.byteLength > 32);
  const publicKey = await crypto.subtle.importKey(
    "spki",
    publicKeyBytes,
    { name: "Ed25519" },
    false,
    ["verify"],
  );
  return Object.freeze({
    keyId: publicResponse.KeyId,
    keySpec: publicResponse.KeySpec,
    keyUsage: publicResponse.KeyUsage,
    signingAlgorithm: "ED25519_SHA_512",
    publicKey,
    publicKeyBytes,
    publicKeyFingerprint: `sha256:${createHash("sha256").update(publicKeyBytes).digest("hex")}`,
  });
}

export async function signAwsKmsEd25519V1({ material, message, runAws }) {
  assert.equal(typeof runAws, "function");
  const bytes = Buffer.from(message);
  assert.ok(bytes.byteLength > 0 && bytes.byteLength <= 4_096);
  const response = await runAws([
    "kms", "sign",
    "--key-id", material.keyId,
    "--message", bytes.toString("base64"),
    "--message-type", "RAW",
    "--signing-algorithm", "ED25519_SHA_512",
  ]);
  assert.equal(response?.KeyId, material.keyId);
  assert.equal(response?.SigningAlgorithm, "ED25519_SHA_512");
  assert.equal(typeof response?.Signature, "string");
  const signature = Buffer.from(response.Signature, "base64");
  assert.equal(signature.byteLength, 64);
  assert.equal(
    await crypto.subtle.verify("Ed25519", material.publicKey, signature, bytes),
    true,
    "AWS KMS returned a signature that does not verify with its public key",
  );
  return signature.toString("base64url");
}

export function awsKmsPublicKeyPemV1(material) {
  const base64 = Buffer.from(material.publicKeyBytes).toString("base64");
  const lines = base64.match(/.{1,64}/gu);
  assert.ok(lines);
  return `-----BEGIN PUBLIC KEY-----\n${lines.join("\n")}\n-----END PUBLIC KEY-----\n`;
}

function text(value, label) {
  if (typeof value !== "string" || value.length < 3)
    throw new TypeError(`${label} is invalid`);
}
