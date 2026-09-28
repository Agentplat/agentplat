import {
  type AttentionSignalDefinitionInputV1,
  type AttentionEvaluationWakeupV1,
  type AttentionSignalReferenceInputV1,
  AttentionSignalServiceV1,
  InMemoryAttentionSignalStoreV1,
} from "@agentplat/rooms";
import { PostgresAttentionSignalStoreV1 } from "@agentplat/rooms-postgres";
import { attentionWakeupToProcessSignalV1 } from "@agentplat/workflows-rooms";
const reference: AttentionSignalReferenceInputV1 = {
  definitionId: "d",
  interpretation: { kind: "qualitative", criterion: "Stable institutions" },
};
const limit: AttentionSignalReferenceInputV1["interpretation"] = {
  // @ts-expect-error a reference is not an executable limit
  kind: "hard_limit",
  maximum: 10,
};
// @ts-expect-error evaluation wakeups never authorize actions
const effect: AttentionEvaluationWakeupV1["executionAuthorized"] = true;
const kind: AttentionSignalDefinitionInputV1["kind"] = "event";
void reference;
void limit;
void effect;
void kind;
void AttentionSignalServiceV1;
void InMemoryAttentionSignalStoreV1;
void PostgresAttentionSignalStoreV1;
void attentionWakeupToProcessSignalV1;
