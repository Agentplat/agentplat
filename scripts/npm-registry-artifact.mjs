import assert from "node:assert/strict";
import { createHash, createPublicKey, verify } from "node:crypto";

export function publicRegistryUrl(value) {
  const u = new URL(value);
  assert.equal(u.origin, "https://registry.npmjs.org");
  assert.equal(u.username, "");
  assert.equal(u.password, "");
  return u.href;
}

export function verifyRegistrySignature({
  artifact,
  dist,
  keys,
  now = Date.now(),
}) {
  assert.equal(
    dist.integrity,
    artifact.integrity,
    "Registry integrity mismatch",
  );
  const payload = Buffer.from(
    `${artifact.name}@${artifact.version}:${artifact.integrity}`,
  );
  const valid = (dist.signatures ?? []).some((signature) => {
    const key = keys?.keys?.find((k) => k.keyid === signature.keyid);
    if (
      !key ||
      key.keytype !== "ecdsa-sha2-nistp256" ||
      key.scheme !== "ecdsa-sha2-nistp256"
    )
      return false;
    if (key.expires != null && !(Date.parse(key.expires) > now)) return false;
    try {
      return verify(
        "sha256",
        payload,
        createPublicKey({
          key: Buffer.from(key.key, "base64"),
          type: "spki",
          format: "der",
        }),
        Buffer.from(signature.sig, "base64"),
      );
    } catch {
      return false;
    }
  });
  assert(valid, `No valid npm registry signature for ${artifact.name}`);
}

export async function verifyRegistryArtifact({
  artifact,
  dist,
  keys,
  fetchImplementation = fetch,
}) {
  verifyRegistrySignature({ artifact, dist, keys });
  const r = await fetchImplementation(publicRegistryUrl(dist.tarball), {
    redirect: "error",
  });
  assert(r.ok, "Unable to download registry tarball: " + artifact.name);
  const bytes = Buffer.from(await r.arrayBuffer());
  assert.equal(bytes.length, artifact.size, "Registry tarball size mismatch");
  assert.equal(
    "sha512-" + createHash("sha512").update(bytes).digest("base64"),
    artifact.integrity,
    "Registry tarball bytes mismatch",
  );
}
