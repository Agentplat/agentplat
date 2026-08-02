import assert from 'node:assert/strict';

import {
  createCollectiveClosedLoopReferenceRuntimeV1,
  createCollectiveClosedLoopReferenceScenarioV1,
  replayAdaptiveCollectiveClosedLoopV1,
  runAdaptiveCollectiveClosedLoopV1,
} from '@agentplat/mesh-sim';

const peerCount = 3;
const runtime = await createCollectiveClosedLoopReferenceRuntimeV1(peerCount);
const createInput = () =>
  createCollectiveClosedLoopReferenceScenarioV1({
    runner: 'adaptive_collective',
    peerCount,
    runtime,
  });
const first = await runAdaptiveCollectiveClosedLoopV1(await createInput());
assert.equal(first.run.stopReason, 'plan_completed');
assert.equal(first.action.receipt?.status, 'committed');
assert.equal(first.finalized.result.recordType, 'result');
assert.ok(
  first.trace.events.some((event) => event.kind === 'work.result'),
  'the packed scenario must retain the terminal Mesh result'
);

const replay = await replayAdaptiveCollectiveClosedLoopV1({
  schemaVersion: 1,
  createInput,
});
assert.equal(replay.matched, true);
assert.equal(replay.first.run.runDigest, replay.replay.run.runDigest);
assert.equal(replay.first.trace.traceDigest, replay.replay.trace.traceDigest);
assert.equal(
  replay.first.evidence.evidenceDigest,
  replay.replay.evidence.evidenceDigest
);
process.stdout.write(
  `${JSON.stringify({
    status: 'passed',
    runner: first.run.runner,
    stopReason: first.run.stopReason,
    effectStatus: first.action.receipt.status,
    resultType: first.finalized.result.recordType,
    runDigest: first.run.runDigest,
    traceDigest: first.trace.traceDigest,
  })}\n`
);
