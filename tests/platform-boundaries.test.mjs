import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { verifyPlatformBoundaries } from "../scripts/verify-platform-boundaries.mjs";

test("current governed workflow packages satisfy platform boundaries", async () => {
  const report = await verifyPlatformBoundaries();
  assert.equal(report.sourceRuleCount, 9);
  assert.equal(report.adapterAdmissionCount, 5);
  assert.equal(report.scannedSourceFiles > 0, true);
});

test("boundary verifier rejects adapter imports and configured domain vocabulary", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agentplat-boundary-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "config"), { recursive: true });
  await mkdir(path.join(root, "packages", "portable", "src"), {
    recursive: true,
  });
  await writeFile(
    path.join(root, "packages", "portable", "package.json"),
    `${JSON.stringify({
      name: "@agentplat/portable",
      version: "1.0.0",
      dependencies: {},
    })}\n`,
  );
  await writeFile(
    path.join(root, "config", "public-packages.json"),
    `${JSON.stringify({
      schemaVersion: 2,
      packages: [
        {
          name: "@agentplat/portable",
          directory: "packages/portable",
          layer: "foundation",
          publish: true,
          providerNeutral: true,
          browserEntrypoints: ["."],
          packSmoke: true,
        },
      ],
    })}\n`,
  );
  await writeFile(
    path.join(root, "config", "platform-boundaries.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      sourceRules: [
        {
          id: "portable",
          paths: ["packages/portable/src"],
          exclude: [],
          forbiddenImports: ["pg"],
        },
      ],
      portableManifests: [],
      terminology: {
        paths: ["packages/portable/src"],
        terms: ["prospect"],
      },
      adapterAdmissions: [],
    })}\n`,
  );
  const source = path.join(root, "packages", "portable", "src", "index.ts");
  await writeFile(source, "export const portable = true;\n");
  await assert.doesNotReject(verifyPlatformBoundaries({ root }));

  await writeFile(source, 'import type { Pool } from "pg";\n');
  await assert.rejects(
    verifyPlatformBoundaries({ root }),
    /forbids import pg/u,
  );
  await writeFile(source, 'export const label = "prospect";\n');
  await assert.rejects(
    verifyPlatformBoundaries({ root }),
    /restricted terminology prospect/u,
  );
});
