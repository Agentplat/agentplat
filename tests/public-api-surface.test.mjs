import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertPublicApiCompatibility,
  inspectPackedTypeSurface,
  inspectSourceTypeSurface,
} from "../scripts/public-api-surface.mjs";

test("packed type surface follows declaration exports and records the entry digest", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agentplat-api-surface-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "dist"));
  await Promise.all([
    writeFile(
      path.join(root, "dist/index.d.ts"),
      [
        "export * from './nested.js';",
        "export { Hidden as PublicAlias } from './nested.js';",
        "export interface RootType { readonly value: string }",
        "export declare const rootValue: 1;",
        "",
      ].join("\n"),
    ),
    writeFile(
      path.join(root, "dist/nested.d.ts"),
      [
        "export type Hidden = string;",
        "export declare function nested(): void;",
        "",
      ].join("\n"),
    ),
  ]);
  const surface = inspectPackedTypeSurface(
    root,
    {
      name: "@agentplat/fixture",
      types: "./dist/index.d.ts",
      exports: {
        ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
      },
    },
    ".",
  );
  assert.equal(surface.declarationEntrypoint, "dist/index.d.ts");
  assert.match(surface.declarationSha256, /^[a-f0-9]{64}$/u);
  assert.deepEqual(surface.typeExports, [
    "Hidden",
    "PublicAlias",
    "RootType",
    "nested",
    "rootValue",
  ]);
});

test("source surface maps declaration exports and compatibility rejects breaking fixtures", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agentplat-api-source-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "src"));
  await Promise.all([
    writeFile(
      path.join(root, "src/index.ts"),
      [
        "export * from './nested.js';",
        "export interface RootType { readonly value: string }",
        "",
      ].join("\n"),
    ),
    writeFile(path.join(root, "src/nested.ts"), "export const nested = 1;\n"),
  ]);
  const manifest = {
    name: "@agentplat/fixture",
    types: "./dist/index.d.ts",
    exports: {
      ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
    },
  };
  const source = inspectSourceTypeSurface(root, manifest, ".");
  assert.equal(source.sourceEntrypoint, "src/index.ts");
  assert.deepEqual(source.typeExports, ["RootType", "nested"]);

  const baseline = [
    {
      package: manifest.name,
      subpath: ".",
      browser: true,
      sideEffects: false,
      typeExports: source.typeExports,
    },
  ];
  const compatible = [
    {
      ...baseline[0],
      typeExports: [...source.typeExports, "Additive"],
    },
  ];
  assert.doesNotThrow(() => assertPublicApiCompatibility(baseline, compatible));
  assert.throws(
    () => assertPublicApiCompatibility(baseline, []),
    /removed @agentplat\/fixture/u,
  );
  assert.throws(
    () =>
      assertPublicApiCompatibility(baseline, [
        { ...compatible[0], typeExports: ["nested"] },
      ]),
    /removed @agentplat\/fixture export RootType/u,
  );
  assert.throws(
    () =>
      assertPublicApiCompatibility(baseline, [
        { ...compatible[0], browser: false },
      ]),
    /removed browser support/u,
  );
  assert.throws(
    () =>
      assertPublicApiCompatibility(baseline, [
        { ...compatible[0], sideEffects: true },
      ]),
    /introduced import side effects/u,
  );
});
