import {
  claimCollectiveEvaluationCellV1,
  collectiveEvaluationRunKeyV1,
  createCollectiveEvaluationCampaignExecutionV1,
  reconcileCollectiveEvaluationRunV1,
  releaseCollectiveEvaluationCellV1,
  settleCollectiveEvaluationRunV1,
  validateCollectiveEvaluationCampaignExecutionV1,
  type CollectiveEvaluationCampaignExecutionV1,
  type CollectiveEvaluationExecutionFenceV1,
  type CollectiveEvaluationRunResultV1,
} from "@agentplat/collective-planning/evaluation";

declare const state: CollectiveEvaluationCampaignExecutionV1;
declare const fence: CollectiveEvaluationExecutionFenceV1;
declare const result: CollectiveEvaluationRunResultV1;

const runKey = collectiveEvaluationRunKeyV1({
  executionId: "execution:type",
  registrationDigest:
    "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  cellId: "campaign:type:50:nominal:0",
  runner: "adaptive_collective",
  attempt: "first",
});
const claimed = claimCollectiveEvaluationCellV1(state, {
  executionId: state.executionId,
  expectedRevision: state.revision,
  cellId: state.cells[0].cellId,
  nowMs: 1,
  lease: { workerId: "worker:type", leaseToken: "lease-type", expiresAtMs: 2 },
});
const settlement = settleCollectiveEvaluationRunV1(state, {
  executionId: state.executionId,
  expectedRevision: state.revision,
  cellId: state.cells[0].cellId,
  runner: "adaptive_collective",
  attempt: "first",
  nowMs: 1,
  fence,
  result,
  reasonCode: null,
});
const released = releaseCollectiveEvaluationCellV1(state, {
  executionId: state.executionId,
  expectedRevision: state.revision,
  cellId: state.cells[0].cellId,
  nowMs: 1,
  fence,
});
const reconciled = reconcileCollectiveEvaluationRunV1(state, {
  executionId: state.executionId,
  expectedRevision: state.revision,
  cellId: state.cells[0].cellId,
  runner: "adaptive_collective",
  attempt: "first",
  runKey,
  nowMs: 1,
  result,
  reasonCode: null,
});

void createCollectiveEvaluationCampaignExecutionV1;
void runKey;
void claimed;
void released;
void reconciled;
void settlement;
void validateCollectiveEvaluationCampaignExecutionV1(state);
// @ts-expect-error sealed execution schedules are immutable.
state.cells.pop();
collectiveEvaluationRunKeyV1({
  executionId: "execution:type",
  registrationDigest: runKey,
  cellId: "cell:type",
  // @ts-expect-error the deterministic four-slot schedule excludes arbitrary runners.
  runner: "oracle",
  attempt: "first",
});
