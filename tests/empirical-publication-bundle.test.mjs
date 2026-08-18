import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { verifyPublicationBundleV1 } from "../scripts/empirical-publication-bundle.mjs";

test("publication bundle gate rejects a directory without a manifest", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "agentplat-publication-bundle-"));
  await assert.rejects(
    verifyPublicationBundleV1(directory),
    /publication_bundle_artifact_missing:publication-bundle-manifest\.json/u,
  );
});

test("publication bundle gate rejects an incomplete required artifact set", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "agentplat-publication-bundle-"));
  await writeFile(
    path.join(directory, "publication-bundle-manifest.json"),
    JSON.stringify({
      schemaVersion: 1,
      kind: "agentplat-empirical-publication-bundle-v1",
      bundleStatus: "complete",
      requiredArtifacts: [],
      bundleDigest: "sha256:invalid",
    }),
  );
  await assert.rejects(
    verifyPublicationBundleV1(directory),
    /publication_bundle_required_artifact_set_invalid/u,
  );
});
