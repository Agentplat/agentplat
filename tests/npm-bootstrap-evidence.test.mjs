import assert from "node:assert/strict";
import test from "node:test";
import {
  NPM_BOOTSTRAP_EVIDENCE,
  isInteractiveBootstrapEvidence,
} from "../scripts/npm-bootstrap-evidence.mjs";
import { inspectPublishedArtifact } from "../scripts/publish-direct-npm-release.mjs";
const context = (artifact = NPM_BOOTSTRAP_EVIDENCE[0]) => ({
  artifact: { ...artifact },
  dist: { integrity: artifact.integrity },
  distributionTags: { latest: "1.4.0" },
  expectedDistTag: "latest",
  expectedWorkflowPath: ".github/workflows/release-direct.yml",
});
test("recognizes only the two pinned bootstrap tarballs", () => {
  assert.equal(NPM_BOOTSTRAP_EVIDENCE.length, 2);
  for (const a of NPM_BOOTSTRAP_EVIDENCE)
    assert.equal(isInteractiveBootstrapEvidence(context(a)), true);
  assert.equal(
    isInteractiveBootstrapEvidence({
      ...context(),
      artifact: { ...context().artifact, name: "@agentplat/rooms" },
    }),
    false,
  );
  assert.equal(
    isInteractiveBootstrapEvidence({
      ...context(),
      artifact: { ...context().artifact, version: "1.4.1" },
    }),
    false,
  );
  assert.equal(
    isInteractiveBootstrapEvidence({
      ...context(),
      expectedWorkflowPath: ".github/workflows/release.yml",
    }),
    false,
  );
  assert.equal(
    isInteractiveBootstrapEvidence({
      ...context(),
      dist: {
        ...context().dist,
        attestations: { url: "https://registry.npmjs.org/attestation" },
      },
    }),
    false,
  );
});
test("changed size, hash, registry hash, tag or tag target fails closed", () => {
  const c = context();
  for (const change of [
    { artifact: { ...c.artifact, size: c.artifact.size + 1 } },
    { artifact: { ...c.artifact, integrity: "sha512-changed" } },
    { dist: { integrity: "sha512-changed" } },
    { expectedDistTag: "next" },
    { distributionTags: { latest: "1.4.1" } },
    { distributionTags: {} },
  ])
    assert.throws(() => isInteractiveBootstrapEvidence({ ...c, ...change }));
});
test("recognition never skips cryptographic signature verification in the publisher", async () => {
  const artifact = { ...NPM_BOOTSTRAP_EVIDENCE[0] };
  const calls = [];
  await assert.rejects(
    inspectPublishedArtifact({
      artifact,
      manifest: { distTag: "latest", sourceCommit: "a".repeat(40) },
      fetchImplementation: async (url) => {
        calls.push(url);
        if (url.endsWith("/-/npm/v1/keys"))
          return { ok: true, json: async () => ({ keys: [] }) };
        return {
          ok: true,
          json: async () => ({
            name: artifact.name,
            versions: {
              [artifact.version]: {
                dist: {
                  integrity: artifact.integrity,
                  signatures: [],
                  tarball: "https://registry.npmjs.org/tarball",
                },
              },
            },
            "dist-tags": { latest: artifact.version },
          }),
        };
      },
    }),
    /No valid npm registry signature/,
  );
  assert.equal(calls.length, 2);
});
test("bootstrap records are immutable", () => {
  assert.throws(() => {
    NPM_BOOTSTRAP_EVIDENCE[0].integrity = "changed";
  });
  assert.throws(() => {
    NPM_BOOTSTRAP_EVIDENCE.push(context().artifact);
  });
});
