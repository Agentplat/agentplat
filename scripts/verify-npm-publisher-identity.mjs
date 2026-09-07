import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function assertNpmPublisherIdentity({ expectedUser, actualUser }) {
  assert.equal(
    typeof expectedUser,
    "string",
    "Explicit expected npm username is required",
  );
  assert.ok(
    expectedUser.trim() && expectedUser === expectedUser.trim(),
    "Explicit expected npm username is required",
  );
  assert.equal(
    actualUser,
    expectedUser,
    "Authenticated npm account does not match the explicitly authorized publisher",
  );
  return {
    username: actualUser,
    registry: "https://registry.npmjs.org/",
    identityVerified: true,
  };
}

export function verifyNpmPublisherIdentity({
  expectedUser,
  userconfig,
  execute = spawnSync,
}) {
  assert.ok(
    typeof expectedUser === "string" && expectedUser.trim(),
    "Specify the npm username authorized by the owner",
  );
  assert.ok(
    typeof userconfig === "string" && userconfig.trim(),
    "An explicit npm userconfig is required; global account selection is not allowed",
  );
  const result = execute(
    "npm",
    [
      "whoami",
      "--registry=https://registry.npmjs.org/",
      `--userconfig=${path.resolve(userconfig)}`,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  assert.equal(result.status, 0, "Unable to verify the isolated npm session");
  return assertNpmPublisherIdentity({
    expectedUser,
    actualUser: result.stdout.trim(),
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const options = {};
  for (let i = 2; i < process.argv.length; i++) {
    const flag = process.argv[i];
    const value = process.argv[++i];
    assert.ok(value && !value.startsWith("--"), `Missing value for ${flag}`);
    if (flag === "--expected-user") options.expectedUser = value;
    else if (flag === "--userconfig") options.userconfig = value;
    else throw new Error(`Unknown option ${flag}`);
  }
  console.log(JSON.stringify(verifyNpmPublisherIdentity(options)));
}
