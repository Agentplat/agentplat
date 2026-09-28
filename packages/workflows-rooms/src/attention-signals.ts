import {
  createProcessSignalV1,
  type ProcessSignalV1,
} from "@agentplat/workflows";
import type { AttentionEvaluationWakeupV1 } from "@agentplat/rooms";

export const ATTENTION_EVALUATION_SIGNAL_TYPE_V1 =
  "agentplat.attention.evaluate.v1";
/** Pure transport mapping. The workflow owner chooses routing, persistence and advancement. */
export function attentionWakeupToProcessSignalV1(
  wakeup: AttentionEvaluationWakeupV1,
  runId: string,
): ProcessSignalV1 {
  if (wakeup.schemaVersion !== 1 || wakeup.executionAuthorized !== false)
    throw new Error("Invalid attention evaluation wakeup");
  return createProcessSignalV1({
    tenantId: wakeup.tenantId,
    runId,
    signalId: wakeup.wakeupId,
    signalType: ATTENTION_EVALUATION_SIGNAL_TYPE_V1,
    correlationKey: wakeup.definitionId,
    sourceType: "agentplat.attention",
    sourceId: wakeup.agentId,
    sourceRevision: wakeup.governance.revision,
    receivedAt: wakeup.createdAt,
    payload: {
      wakeupId: wakeup.wakeupId,
      definitionId: wakeup.definitionId,
      configurationDigest: wakeup.governance.configurationDigest,
      authorityEpoch: wakeup.governance.authorityEpoch,
      observationIds: wakeup.observationIds,
      referenceIds: wakeup.referenceIds,
      contradictory: wakeup.contradictory,
      coverage: wakeup.coverage.map((x) => ({ ...x })),
      executionAuthorized: false,
    },
  });
}
