import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  discoverWorkspacePackageManifests,
  loadPublicPackageCatalog,
} from "../scripts/public-package-catalog.mjs";
test("Jev is publishable in 1.1 but remains outside portable/default dependency closures", async () => {
  const records = await discoverWorkspacePackageManifests(),
    byName = new Map(records.map((x) => [x.manifest.name, x.manifest]));
  const catalog = await loadPublicPackageCatalog(),
    jev = catalog.packages.find(
      (x) => x.name === "@agentplat/assessor-typesafe",
    );
  assert.equal(jev.publish, true);
  assert.equal(jev.packSmoke, true);
  assert.equal(jev.providerNeutral, false);
  assert.notEqual(byName.get(jev.name).private, true);
  for (const name of [
    "core",
    "framework",
    "runtime",
    "rooms",
    "collective-runtime",
    "mesh",
    "inference-control",
  ]) {
    const seen = new Set(),
      pending = [`@agentplat/${name}`];
    while (pending.length) {
      const dep = pending.pop();
      if (seen.has(dep)) continue;
      seen.add(dep);
      const manifest = byName.get(dep);
      if (manifest)
        pending.push(
          ...Object.keys({
            ...manifest.dependencies,
            ...manifest.optionalDependencies,
          }),
        );
    }
    assert.equal(seen.has(jev.name), false, name);
    assert.equal(seen.has("@typesafe-ai/sdk"), false, name);
  }
  const workflow = await readFile(
    ".github/workflows/release-direct.yml",
    "utf8",
  );
  assert.match(workflow, /publish:\s+if: \$\{\{ !inputs\.dry_run/);
});
