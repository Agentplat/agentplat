import test from "node:test";
import assert from "node:assert/strict";
import { evaluateRoomPlannerTraces } from "../scripts/evaluate-room-planner.mjs";
const traces = () =>
  ["legacy", "selective", "planner"].map((variant) => ({
    variant,
    caseId: "report",
    configuration: {
      model: "fixture",
      tools: "fixture",
      permissions: "read",
      budget: 100,
    },
    criteria: ["report"],
    events: [
      { id: "start", kind: "started", atMs: 0 },
      {
        id: "usage",
        kind: "usage",
        atMs: 1,
        costMicros: 5,
        inputTokens: 10,
        outputTokens: 5,
      },
      {
        id: "criterion",
        kind: "criterion",
        atMs: 2,
        criterionId: "report",
        verdict: "met",
        evidenceReference: "assessor:report:v1",
      },
      { id: "done", kind: "completed", atMs: 3 },
    ],
  }));
test("comparison derives cost, completion and false-completion from matched recoverable evidence", () => {
  const input = traces();
  input[0].events[2].verdict = "unknown";
  const output = evaluateRoomPlannerTraces(input);
  assert.equal(output.rows[0].falseCompletion, true);
  assert.equal(output.rows[2].completed, true);
  assert.equal(output.rows[2].costMicros, 5);
  input[1].configuration.model = "different";
  assert.throws(
    () => evaluateRoomPlannerTraces(input),
    /configurations differ/,
  );
});
test("comparison rejects missing arms, cost evidence and repeated events", () => {
  assert.throws(
    () => evaluateRoomPlannerTraces(traces().slice(1)),
    /Each case/,
  );
  const input = traces();
  delete input[0].events[1].costMicros;
  assert.throws(() => evaluateRoomPlannerTraces(input), /Missing cost/);
});
