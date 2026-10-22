import test from "node:test";
import assert from "node:assert/strict";
import { canonicalPlannerJson } from "../packages/rooms/dist/planner-json.js";

test("Planner JSON survives reordered nested JSONB and omitted undefined properties", () => {
  assert.equal(
    canonicalPlannerJson({ z: [1, { b: 2, a: 1 }], a: undefined }),
    canonicalPlannerJson({ z: [1, { a: 1, b: 2 }] }),
  );
  assert.notEqual(canonicalPlannerJson([1, 2]), canonicalPlannerJson([2, 1]));
});
test("Planner JSON rejects cycles, nonfinite values, unsupported objects and excessive depth", () => {
  const cyclic = {};
  cyclic.self = cyclic;
  let deep = {};
  for (let i = 0; i < 66; i++) deep = { child: deep };
  for (const value of [
    cyclic,
    deep,
    Infinity,
    NaN,
    1n,
    new Date(),
    [undefined],
  ])
    assert.throws(
      () => canonicalPlannerJson(value),
      (error) => error.code === "VALIDATION_ERROR",
    );
});
