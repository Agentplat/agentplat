import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  computeCollectiveCapabilityBaselineDigestV1,
  verifyCollectiveCapabilityBaselineV1,
} from "../scripts/verify-collective-capability-baseline.mjs";

const rootDirectory = resolve(import.meta.dirname, "..");
const readJson = (path) =>
  JSON.parse(readFileSync(resolve(rootDirectory, path), "utf8"));
const manifest = readJson("config/collective-capability-baseline-v1.json");
const pointer = readJson("config/collective-capability-baseline-current.json");
const rootPackage = readJson("package.json");

test("frozen capability baseline closes exactly 11 objectives and 19 capabilities", () => {
  const result = verifyCollectiveCapabilityBaselineV1({
    rootDirectory,
    manifest,
    pointer,
  });
  assert.equal(result.sourceCompletionStatus, "complete");
  assert.equal(result.closedObjectives, 11);
  assert.equal(result.implementedCapabilities, 19);
  assert.equal(result.externalObligations, 6);
  assert.equal(result.attestationStatus, "pending-frozen-tree");
});

test("a redigested denominator change still requires a new baseline version", () => {
  const changed = structuredClone(manifest);
  changed.capabilities.push({
    id: "unapproved-capability",
    title: "Unapproved capability",
    status: "implemented-and-integrated",
  });
  changed.sourceCompletion.capabilityCount = 20;
  changed.baselineDigest = computeCollectiveCapabilityBaselineDigestV1(changed);
  const changedPointer = {
    ...pointer,
    manifestDigest: changed.baselineDigest,
  };
  assert.throws(
    () =>
      verifyCollectiveCapabilityBaselineV1({
        rootDirectory,
        manifest: changed,
        pointer: changedPointer,
      }),
    /create a new approved baseline|source completion/u,
  );
});

test("a defect cannot be disguised as a new or reopened objective", () => {
  const changed = structuredClone(manifest);
  changed.objectives[0].status = "reopened";
  changed.baselineDigest = computeCollectiveCapabilityBaselineDigestV1(changed);
  assert.throws(
    () =>
      verifyCollectiveCapabilityBaselineV1({
        rootDirectory,
        manifest: changed,
        pointer: { ...pointer, manifestDigest: changed.baselineDigest },
      }),
    /create a new approved baseline|not closed/u,
  );
});

test("external readiness work cannot enter the source denominator", () => {
  const changed = structuredClone(manifest);
  changed.externalObligations[0].status = "implemented-and-integrated";
  changed.baselineDigest = computeCollectiveCapabilityBaselineDigestV1(changed);
  assert.throws(
    () =>
      verifyCollectiveCapabilityBaselineV1({
        rootDirectory,
        manifest: changed,
        pointer: { ...pointer, manifestDigest: changed.baselineDigest },
      }),
    /create a new approved baseline|external obligation/u,
  );
});

test("the current pointer is exact and cannot silently select another manifest", () => {
  assert.throws(
    () =>
      verifyCollectiveCapabilityBaselineV1({
        rootDirectory,
        manifest,
        pointer: {
          ...pointer,
          currentBaselineVersion: 2,
          manifestPath: "config/collective-capability-baseline-v2.json",
        },
      }),
    /current baseline pointer/u,
  );
});

test("the frozen baseline verifier is part of the root release gate", () => {
  assert.equal(
    rootPackage.scripts["verify:capability-baseline"],
    "node scripts/verify-collective-capability-baseline.mjs",
  );
  assert.match(
    rootPackage.scripts.check,
    /pnpm run verify:capability-baseline/u,
  );
});
