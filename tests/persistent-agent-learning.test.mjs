import test from "node:test";
import assert from "node:assert/strict";
import { persistentAgentLearningExample } from "../examples/persistent-agent-learning.mjs";
test("persistent agent composition pins memory and instructions, deduplicates schedule and preserves inconclusive review", async () => {
  const result = await persistentAgentLearningExample();
  assert.equal(result.taskRuns.length, 1);
  assert.equal(result.taskRuns[0].binding.promptRevision, "instructions:1");
  assert.equal(result.snapshot.references[0].revision, 1);
  assert.match(result.snapshot.references[0].digest, /^sha256:/);
  assert.equal(result.summary[0].inconclusive, 1);
  assert.equal(result.summary[0].positive, 0);
});
