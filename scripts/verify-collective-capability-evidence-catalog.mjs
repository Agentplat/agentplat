#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = path.join(
  root,
  "config/collective-capability-baseline-v1.json",
);
const catalogPath = path.join(
  root,
  "config/collective-capability-evidence-v1.json",
);

const [baseline, catalog] = await Promise.all([
  readJson(baselinePath),
  readJson(catalogPath),
]);

assert(catalog.schemaVersion === 1, "catalog schemaVersion must be 1");
assert(
  catalog.catalogId === "agentplat-collective-capability-evidence-v1",
  "unexpected capability evidence catalog id",
);
assert(
  catalog.baselineId === baseline.baselineId,
  "catalog baseline id does not match frozen baseline",
);
assert(
  catalog.baselineDigest === baseline.baselineDigest,
  "catalog baseline digest does not match frozen baseline",
);
assert(
  Array.isArray(catalog.capabilities),
  "catalog capabilities must be an array",
);

const baselineIds = baseline.capabilities.map(({ id }) => id);
const catalogIds = catalog.capabilities.map(({ capabilityId }) => capabilityId);
assert(
  JSON.stringify(catalogIds) === JSON.stringify(baselineIds),
  "catalog capability ids or ordering differ from the frozen baseline",
);

const fields = [
  "publicSurfacePaths",
  "integrationBoundaryPaths",
  "threatModelPaths",
];
for (const capability of catalog.capabilities) {
  assertExactKeys(capability, ["capabilityId", ...fields]);
  for (const field of fields) {
    const paths = capability[field];
    assert(
      Array.isArray(paths) && paths.length > 0 && paths.length <= 64,
      `${capability.capabilityId}.${field} must contain 1-64 paths`,
    );
    assert(
      new Set(paths).size === paths.length,
      `${capability.capabilityId}.${field} contains duplicate paths`,
    );
    assert(
      [...paths]
        .sort(compareCodeUnits)
        .every((value, index) => value === paths[index]),
      `${capability.capabilityId}.${field} must be code-unit sorted`,
    );
    for (const relativePath of paths) {
      validateRelativePath(relativePath);
      const value = await stat(path.join(root, relativePath)).catch(() => null);
      assert(
        value?.isFile(),
        `${capability.capabilityId}.${field} is missing file ${relativePath}`,
      );
    }
  }
}

console.log(
  `collective capability evidence catalog: PASS (${catalog.capabilities.length}/${baselineIds.length} capabilities, three evidence classes each)`,
);

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function assertExactKeys(value, expected) {
  assert(
    value && typeof value === "object" && !Array.isArray(value),
    "catalog entry must be an object",
  );
  const actual = Object.keys(value).sort(compareCodeUnits);
  const wanted = [...expected].sort(compareCodeUnits);
  assert(
    JSON.stringify(actual) === JSON.stringify(wanted),
    `catalog entry keys must be exactly ${wanted.join(", ")}`,
  );
}

function validateRelativePath(value) {
  assert(
    typeof value === "string" &&
      value.length > 0 &&
      value.length <= 1_024 &&
      !path.isAbsolute(value) &&
      !value.includes("\\") &&
      !value.includes("\u0000") &&
      value
        .split("/")
        .every((segment) => segment && segment !== "." && segment !== ".."),
    `invalid capability evidence path: ${String(value)}`,
  );
}

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
