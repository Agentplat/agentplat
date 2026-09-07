import test from "node:test";
import assert from "node:assert/strict";
import { verifyNpmPublisherIdentity } from "../scripts/verify-npm-publisher-identity.mjs";
test("npm publisher verification binds an explicitly selected isolated account", () => {
  const result = verifyNpmPublisherIdentity({
    expectedUser: "authorized-owner",
    userconfig: "/tmp/isolated.npmrc",
    execute(command, args) {
      assert.equal(command, "npm");
      assert.deepEqual(args, [
        "whoami",
        "--registry=https://registry.npmjs.org/",
        "--userconfig=/tmp/isolated.npmrc",
      ]);
      return { status: 0, stdout: "authorized-owner\n" };
    },
  });
  assert.equal(result.identityVerified, true);
});
test("another logged-in account cannot be used as the intended publisher", () => {
  assert.throws(
    () =>
      verifyNpmPublisherIdentity({
        expectedUser: "authorized-owner",
        userconfig: "/tmp/isolated.npmrc",
        execute: () => ({ status: 0, stdout: "other-account\n" }),
      }),
    /does not match/,
  );
});
test("missing expected identity or userconfig fails before invoking npm", () => {
  const execute = () => {
    throw new Error("must not execute");
  };
  assert.throws(
    () =>
      verifyNpmPublisherIdentity({
        userconfig: "/tmp/isolated.npmrc",
        execute,
      }),
    /Specify the npm username/,
  );
  assert.throws(
    () =>
      verifyNpmPublisherIdentity({ expectedUser: "authorized-owner", execute }),
    /explicit npm userconfig/,
  );
});
