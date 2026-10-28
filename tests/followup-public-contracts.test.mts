import {
  IncrementalEvidenceServiceV1,
  InMemoryIncrementalEvidenceStoreV1,
  type EvidenceBatchInputV1,
  type EvidenceProcessingAccessV1,
} from "@agentplat/events";
import {
  RoomSituationServiceV1,
  MemoryProposalServiceV1,
  type ApplySituationInputV1,
  type MemoryProposalV1,
} from "@agentplat/framework";
import {
  PostgresIncrementalEvidenceStoreV1,
  PostgresRoomSituationStoreV1,
  PostgresMemoryProposalStoreV1,
  runRoomFollowupMigrations,
  runIncrementalEvidenceMigrations,
} from "@agentplat/rooms-postgres";
const batch: EvidenceBatchInputV1 = {
  consumerId: "assistant",
  source: "connector",
  operationId: "intake",
  events: [],
  checkpoint: { expectedRevision: null, position: { opaque: "cursor" } },
};
declare const access: EvidenceProcessingAccessV1<string>;
const processing = new IncrementalEvidenceServiceV1(
  new InMemoryIncrementalEvidenceStoreV1(),
  access,
);
void processing.receiveBatch("verified-context", batch);
// @ts-expect-error A source event cannot select a completed processing state.
const forged: EvidenceBatchInputV1 = { ...batch, status: "completed" };
declare const input: ApplySituationInputV1;
const bad: ApplySituationInputV1 = {
  ...input,
  // @ts-expect-error Application statuses must use the typed situation lifecycle.
  content: { ...input.content, status: "paid" },
};
declare const proposal: MemoryProposalV1;
void proposal;
void forged;
void bad;
void RoomSituationServiceV1;
void MemoryProposalServiceV1;
void PostgresIncrementalEvidenceStoreV1;
void PostgresRoomSituationStoreV1;
void PostgresMemoryProposalStoreV1;
void runRoomFollowupMigrations;
void runIncrementalEvidenceMigrations;
