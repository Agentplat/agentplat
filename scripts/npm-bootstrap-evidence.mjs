import assert from "node:assert/strict";

// Immutable owner-approved interactive bootstrap, from protected dry-run
// 39854878760 / acb64cad435987484eab7835d8674681ee2e7c75. These two versions
// have no CI provenance and must never be represented as OIDC publications.
export const NPM_BOOTSTRAP_EVIDENCE = Object.freeze([
  Object.freeze({
    name: "@agentplat/artifacts",
    version: "1.4.0",
    size: 15602,
    integrity:
      "sha512-CDDRNPlj/aWm9gqJPmUwcDfDMG98fisb5Z1sR/OnxCfZ2iHUqKpSNAxM1wrT9Wenb3Aj3VgHxoOg9pO9MIBvxQ==",
  }),
  Object.freeze({
    name: "@agentplat/artifacts-postgres",
    version: "1.4.0",
    size: 9609,
    integrity:
      "sha512-5L1DuT7Xzv7YgNcst8+U9I9UzrpW1WkhxSo/gDZ9sJW8JvuAXSqJtQhwntKtdIk5jnZ039K6c7m3OepFeclL3A==",
  }),
]);

// This only recognizes the historical evidence type. Callers MUST still verify
// the npm ECDSA signature and downloaded bytes using verifyRegistryArtifact.
export function isInteractiveBootstrapEvidence({
  artifact,
  dist,
  distributionTags,
  expectedDistTag,
  expectedWorkflowPath,
}) {
  if (expectedWorkflowPath !== ".github/workflows/release-direct.yml")
    return false;
  const approved = NPM_BOOTSTRAP_EVIDENCE.find(
    (entry) =>
      entry.name === artifact.name && entry.version === artifact.version,
  );
  if (!approved || dist.attestations != null) return false;
  assert.equal(
    expectedDistTag,
    "latest",
    "Bootstrap evidence is bound to latest",
  );
  assert.equal(
    distributionTags?.latest,
    approved.version,
    "Bootstrap latest mismatch",
  );
  assert.equal(artifact.size, approved.size, "Bootstrap size mismatch");
  assert.equal(
    artifact.integrity,
    approved.integrity,
    "Bootstrap artifact integrity mismatch",
  );
  assert.equal(
    dist.integrity,
    approved.integrity,
    "Bootstrap registry integrity mismatch",
  );
  return true;
}
