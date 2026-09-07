import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadPublicPackageCatalog,
  publishablePackages,
} from "./public-package-catalog.mjs";

const LEGACY_STAGING_PREFIX = "agentplat-stage-";
const APPLY_CONFIRMATION = "REMOVE_AGENTPLAT_LEGACY_STAGING_TAGS";
const REGISTRY_ARGUMENTS = Object.freeze([
  "--registry=https://registry.npmjs.org/",
  "--@agentplat:registry=https://registry.npmjs.org/",
]);

export function legacyStagingTags(packageName, distributionTags) {
  assert.match(packageName, /^@agentplat\/[a-z0-9]+(?:-[a-z0-9]+)*$/u);
  assert.ok(
    distributionTags &&
      typeof distributionTags === "object" &&
      !Array.isArray(distributionTags),
  );
  return Object.entries(distributionTags)
    .filter(([tag, version]) => {
      assert.match(tag, /^[a-z][0-9a-z._-]*$/iu);
      assert.equal(typeof version, "string");
      return tag.startsWith(LEGACY_STAGING_PREFIX);
    })
    .map(([tag, version]) => ({ packageName, tag, version }))
    .sort((left, right) => compareAscii(left.tag, right.tag));
}

export async function npmStagingTagHygiene({
  arguments_: argumentsValue = process.argv.slice(2),
  environment = process.env,
  root = process.cwd(),
} = {}) {
  const apply = parseArguments(argumentsValue);
  const catalog = await loadPublicPackageCatalog(root);
  const inventory = await Promise.all(
    publishablePackages(catalog).map(async (packageEntry) => {
      const tags = await registryDistributionTags(packageEntry.name, true);
      return tags === undefined
        ? []
        : legacyStagingTags(packageEntry.name, tags);
    }),
  );
  const plan = inventory.flat();

  const report = Object.freeze({
    schemaVersion: 1,
    kind: "agentplat-legacy-npm-staging-tag-plan-v1",
    mode: apply ? "apply" : "inventory",
    prefix: LEGACY_STAGING_PREFIX,
    entries: plan,
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!apply) return report;

  assert.equal(
    environment.NODE_AUTH_TOKEN,
    undefined,
    "Automation tokens are forbidden",
  );
  assert.equal(
    environment.NPM_TOKEN,
    undefined,
    "Automation tokens are forbidden",
  );
  assert.ok(
    process.stdin.isTTY && process.stdout.isTTY,
    "Cleanup requires an interactive terminal",
  );

  for (const entry of plan) {
    const before = await registryDistributionTags(entry.packageName, false);
    assert.equal(
      before[entry.tag],
      entry.version,
      `${entry.packageName} ${entry.tag} changed after inventory`,
    );
    run(
      "npm",
      ["dist-tag", "rm", entry.packageName, entry.tag, ...REGISTRY_ARGUMENTS],
      environment,
      root,
      "inherit",
    );
    const after = await registryDistributionTags(entry.packageName, false);
    assert.equal(
      after[entry.tag],
      undefined,
      `${entry.packageName} ${entry.tag} still exists`,
    );
  }
  return report;
}

function parseArguments(arguments_) {
  if (arguments_.length === 0) return false;
  assert.deepEqual(
    arguments_,
    ["--apply", "--confirm", APPLY_CONFIRMATION],
    `Apply requires --apply --confirm ${APPLY_CONFIRMATION}`,
  );
  return true;
}

async function registryDistributionTags(packageName, allowMissing) {
  const response = await fetch(
    `https://registry.npmjs.org/${encodeURIComponent(packageName)}`,
    { headers: { accept: "application/vnd.npm.install-v1+json" } },
  );
  if (allowMissing && response.status === 404) return undefined;
  assert.equal(
    response.ok,
    true,
    `Unable to inspect ${packageName}: HTTP ${response.status}`,
  );
  return (await response.json())["dist-tags"];
}

function scrubAuthentication(environment) {
  const clean = { ...environment };
  delete clean.NODE_AUTH_TOKEN;
  delete clean.NPM_TOKEN;
  return clean;
}

function run(command, arguments_, environment, root, stdio) {
  const result = spawnSync(command, arguments_, {
    cwd: root,
    encoding: "utf8",
    env: scrubAuthentication(environment),
    stdio,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${command} ${arguments_.join(" ")} failed`);
}

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    await npmStagingTagHygiene();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
