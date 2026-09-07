import assert from "node:assert/strict";
import test from "node:test";
import { validateRegistryPackageEvidence } from "../scripts/verify-npm-release-provenance.mjs";

const integrityBytes = Buffer.alloc(64, 7);
const artifact = {
  name: "@agentplat/core",
  version: "1.2.3",
  integrity: `sha512-${integrityBytes.toString("base64")}`,
};
const commit = "a".repeat(40);

function envelope(statement) {
  return {
    bundle: {
      dsseEnvelope: {
        payload: Buffer.from(JSON.stringify(statement)).toString("base64"),
      },
    },
  };
}

function evidence() {
  return {
    artifact,
    expectedCommit: commit,
    expectedDistTag: "latest",
    dist: {
      integrity: artifact.integrity,
      signatures: [{ keyid: "key", sig: "signature" }],
    },
    distributionTags: { latest: artifact.version },
    attestations: {
      attestations: [
        envelope({
          predicateType:
            "https://github.com/npm/attestation/tree/main/specs/publish/v0.1",
        }),
        envelope({
          predicateType: "https://slsa.dev/provenance/v1",
          subject: [
            {
              name: "pkg:npm/%40agentplat/core@1.2.3",
              digest: { sha512: integrityBytes.toString("hex") },
            },
          ],
          predicate: {
            buildDefinition: {
              buildType:
                "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1",
              externalParameters: {
                workflow: {
                  ref: "refs/heads/main",
                  repository: "https://github.com/Agentplat/agentplat",
                  path: ".github/workflows/release.yml",
                },
              },
              resolvedDependencies: [{ digest: { gitCommit: commit } }],
            },
            runDetails: {
              builder: {
                id: "https://github.com/actions/runner/github-hosted",
              },
            },
          },
        }),
      ],
    },
  };
}

test("registry evidence binds integrity, tag, signatures and workflow provenance", () => {
  assert.doesNotThrow(() => validateRegistryPackageEvidence(evidence()));
});

test("registry evidence rejects integrity, tag and commit substitution", () => {
  for (const mutate of [
    (value) => {
      value.dist.integrity = `sha512-${Buffer.alloc(64, 8).toString("base64")}`;
    },
    (value) => {
      value.distributionTags.latest = "9.9.9";
    },
    (value) => {
      value.expectedCommit = "b".repeat(40);
    },
    (value) => {
      value.dist.signatures = [];
    },
  ]) {
    const value = evidence();
    mutate(value);
    assert.throws(() => validateRegistryPackageEvidence(value));
  }
});
