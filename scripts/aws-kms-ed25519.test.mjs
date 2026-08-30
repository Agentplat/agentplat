import assert from "node:assert/strict";
import { createPrivateKey, generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";

import {
  awsKmsPublicKeyPemV1,
  resolveAwsKmsEd25519V1,
  signAwsKmsEd25519V1,
} from "./lib/aws-kms-ed25519.mjs";

test("AWS KMS Ed25519 adapter resolves canonical material and verifies signatures", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const canonicalKeyId = "arn:aws:kms:us-east-1:123456789012:key/11111111-2222-3333-4444-555555555555";
  const publicKeyBytes = publicKey.export({ type: "spki", format: "der" });
  const calls = [];
  const runAws = async (args) => {
    calls.push(args);
    if (args[1] === "get-public-key") return {
      KeyId: canonicalKeyId,
      KeySpec: "ECC_NIST_EDWARDS25519",
      KeyUsage: "SIGN_VERIFY",
      SigningAlgorithms: ["ED25519_SHA_512"],
      PublicKey: publicKeyBytes.toString("base64"),
    };
    if (args[1] === "describe-key") return { KeyMetadata: {
      Arn: canonicalKeyId,
      Enabled: true,
      KeyState: "Enabled",
      KeySpec: "ECC_NIST_EDWARDS25519",
      KeyUsage: "SIGN_VERIFY",
    } };
    if (args[1] === "sign") {
      const encoded = args[args.indexOf("--message") + 1];
      return {
        KeyId: canonicalKeyId,
        SigningAlgorithm: "ED25519_SHA_512",
        Signature: sign(null, Buffer.from(encoded, "base64"), privateKey).toString("base64"),
      };
    }
    throw new Error("unexpected AWS operation");
  };
  const material = await resolveAwsKmsEd25519V1({ keyId: "alias/staging", runAws });
  assert.equal(material.keyId, canonicalKeyId);
  assert.match(material.publicKeyFingerprint, /^sha256:[0-9a-f]{64}$/u);
  assert.match(awsKmsPublicKeyPemV1(material), /BEGIN PUBLIC KEY/u);
  const signature = await signAwsKmsEd25519V1({
    material,
    message: Buffer.from("morphogenesis-staging-rotation"),
    runAws,
  });
  assert.equal(Buffer.from(signature, "base64url").byteLength, 64);
  assert.equal(calls.length, 3);
});

test("AWS KMS Ed25519 adapter rejects disabled and non-canonical material", async () => {
  const { publicKey } = generateKeyPairSync("ed25519");
  const bytes = publicKey.export({ type: "spki", format: "der" });
  const runAws = async (args) => args[1] === "get-public-key"
    ? {
        KeyId: "arn:aws:kms:us-east-1:123456789012:key/one",
        KeySpec: "ECC_NIST_EDWARDS25519",
        KeyUsage: "SIGN_VERIFY",
        SigningAlgorithms: ["ED25519_SHA_512"],
        PublicKey: bytes.toString("base64"),
      }
    : { KeyMetadata: {
        Arn: "arn:aws:kms:us-east-1:123456789012:key/two",
        Enabled: false,
        KeyState: "Disabled",
        KeySpec: "ECC_NIST_EDWARDS25519",
        KeyUsage: "SIGN_VERIFY",
      } };
  await assert.rejects(
    resolveAwsKmsEd25519V1({ keyId: "alias/bad", runAws }),
  );
});
