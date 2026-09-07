import assert from "node:assert/strict";
import test from "node:test";
import { legacyStagingTags } from "../scripts/npm-staging-tag-hygiene.mjs";

test("legacy staging inventory selects only the retired fixed prefix", () => {
  assert.deepEqual(
    legacyStagingTags("@agentplat/core", {
      latest: "1.0.0",
      next: "1.1.0-beta.1",
      "agentplat-stage-bbbbbbbbbbbb": "1.1.0-beta.1",
      "agentplat-stage-aaaaaaaaaaaa": "1.0.0-beta.1",
    }),
    [
      {
        packageName: "@agentplat/core",
        tag: "agentplat-stage-aaaaaaaaaaaa",
        version: "1.0.0-beta.1",
      },
      {
        packageName: "@agentplat/core",
        tag: "agentplat-stage-bbbbbbbbbbbb",
        version: "1.1.0-beta.1",
      },
    ],
  );
});

test("legacy staging inventory rejects malformed registry metadata", () => {
  assert.throws(
    () => legacyStagingTags("@agentplat/core", { "../stage": "1.0.0" }),
    /regular expression/,
  );
  assert.throws(
    () => legacyStagingTags("@other/core", { latest: "1.0.0" }),
    /regular expression/,
  );
});
