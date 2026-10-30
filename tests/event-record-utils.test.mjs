import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  boundedEventJsonV1,
  canonicalEventJsonV1,
  eventRecordDigestV1,
  eventTokenV1,
} from "@agentplat/events";

test("record fingerprints use canonical finite JSON and exact UTF-8 byte budgets", async () => {
  assert.equal(canonicalEventJsonV1({ b: 2, a: 1 }), '{"a":1,"b":2}');
  assert.equal(
    await eventRecordDigestV1({ b: 2, a: 1 }),
    `sha256:${createHash("sha256").update('{"a":1,"b":2}').digest("hex")}`,
  );
  assert.equal(boundedEventJsonV1("é", 4), '"é"');
  assert.throws(() => boundedEventJsonV1("é", 3));
  for (const value of [NaN, Infinity, new Date(), [undefined], Array(3)])
    assert.throws(() => canonicalEventJsonV1(value));
  const cycle = {};
  cycle.self = cycle;
  assert.throws(() => canonicalEventJsonV1(cycle), /Cyclic/);
  let tree = "x".repeat(1024);
  for (let i = 0; i < 12; i++) tree = [tree, tree];
  assert.throws(() => boundedEventJsonV1(tree, 2048), /byte budget/);
  assert.equal(canonicalEventJsonV1({ a: undefined }), "{}");
});

test("record text is portable to PostgreSQL JSONB without altering source contents", () => {
  for (const value of ["nul\u0000", "high\uD800", "low\uDFFF"]) {
    assert.throws(() => eventTokenV1(value));
    assert.throws(() => canonicalEventJsonV1(value));
    assert.throws(() => canonicalEventJsonV1({ [value]: true }));
  }
  assert.doesNotThrow(() => eventTokenV1("mail:📩"));
  assert.throws(() => eventTokenV1("id\nnext"));
  assert.equal(
    canonicalEventJsonV1("Body\nwith\ttabs 📩"),
    JSON.stringify("Body\nwith\ttabs 📩"),
  );
});
