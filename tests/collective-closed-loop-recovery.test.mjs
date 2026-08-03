import assert from "node:assert/strict";
import test from "node:test";

import {
  createCollectiveClosedLoopReferenceScenarioV1,
  createCollectiveClosedLoopReferenceRuntimeV1,
  runAdaptiveCollectiveClosedLoopV1,
} from "@agentplat/mesh-sim";
import { recoverCollectiveClosedLoopAssignmentV1 } from "../packages/mesh-sim/dist/collective-closed-loop-recovery.js";

test("certified recovery fences epoch one and resumes a real epoch two assignment", async () => {
  const runtime = await createCollectiveClosedLoopReferenceRuntimeV1(4);
  const input = await createCollectiveClosedLoopReferenceScenarioV1({
    runner: "adaptive_collective",
    peerCount: 4,
    runtime,
  });
  const nominal = await runAdaptiveCollectiveClosedLoopV1(input);
  const preEffect = nominal.preEffect;
  const replacementPeerId = input.definition.peers.find(
    (peer) =>
      peer.peerId !== preEffect.winnerPeerId &&
      peer.peerId !== input.definition.peers[0].peerId,
  )?.peerId;
  assert.ok(replacementPeerId, "reference topology has a replacement peer");

  const recoveryInput = {
    schemaVersion: 1,
    preEffect,
    peers: input.definition.peers,
    runner: input.runtime,
    missionIntent: input.definition.missionIntent,
    mandate: input.definition.mandate,
    failedWinnerPeerId: preEffect.winnerPeerId,
    replacementPeerId,
    faultLogicalTimeMs: preEffect.execution.leaseExpiresAtLogical + 60_000,
  };
  const [recovered, recoveryReplay] = await Promise.all([
    recoverCollectiveClosedLoopAssignmentV1(recoveryInput),
    recoverCollectiveClosedLoopAssignmentV1(recoveryInput),
  ]);

  assert.deepEqual(recovered.meshStates, recoveryReplay.meshStates);
  assert.deepEqual(recovered.staleRejections, recoveryReplay.staleRejections);

  assert.equal(
    recovered.workContract.assignment.assignedPeerId,
    replacementPeerId,
  );
  assert.equal(
    recovered.workContract.assignment.assignmentEpoch,
    preEffect.workContract.assignment.assignmentEpoch + 1,
  );
  assert.equal(recovered.execution.phase, "active");
  assert.equal(recovered.fenceHead.phase, "active");
  assert.equal(recovered.checkpoint.recordType, "checkpoint");
  assert.deepEqual(recovered.staleRejectionCodes, [
    "execution_authority_invalid",
    "execution_authority_invalid",
  ]);
  assert.deepEqual(
    recovered.staleRejections.map((rejection) => ({
      recordType: rejection.recordType,
      recordId: rejection.recordId,
      rejectionCode: rejection.rejectionCode,
      logicalTimeMs: rejection.logicalTimeMs,
      stateUnchanged: rejection.stateUnchanged,
    })),
    [
      {
        recordType: "work.progress",
        recordId: "recovery:stale-progress:1",
        rejectionCode: "execution_authority_invalid",
        logicalTimeMs: recovered.recoveryLogicalTimeMs + 1,
        stateUnchanged: true,
      },
      {
        recordType: "work.result",
        recordId: "recovery:stale-result:1",
        rejectionCode: "execution_authority_invalid",
        logicalTimeMs: recovered.recoveryLogicalTimeMs + 1,
        stateUnchanged: true,
      },
    ],
  );
  for (const rejection of recovered.staleRejections) {
    assert.equal(rejection.envelope.sender.peerId, preEffect.winnerPeerId);
    assert.ok(
      Date.parse(rejection.envelope.expiresAt) <
        Date.parse(preEffect.execution.leaseExpiresAt),
      "stale records are verified while the old lease is still current",
    );
  }
  assert.equal(recovered.leaseVoteIds.length, 2);
  assert.ok(nominal.action.effectAttempt);
  assert.ok(nominal.action.receipt);
  await assert.rejects(
    () =>
      recovered.finalizeAfterCommittedEffect({
        effectAttempt: nominal.action.effectAttempt,
        effectReceipt: nominal.action.receipt,
        resultDigest: nominal.action.receipt.outputDigest,
        resultSummary: "epoch one receipt cannot finish epoch two",
      }),
    /closed_loop_effect_binding_mismatch/,
  );
});
