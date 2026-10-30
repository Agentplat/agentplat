import {
  SharedBudgetServiceV1,
  ScheduledFollowupServiceV1,
  createRoomPlannerSharedBudgetV1,
  createRoomPlannerNoticeDeliveryV1,
  runSharedBudgetCallV1,
  type SharedBudgetAccessV1,
  type SharedBudgetAdmissionV1,
  type AdmitSharedBudgetV1,
  type ReplaceScheduledFollowupV1,
  type ScheduledDeliveryV1,
} from "@agentplat/framework";
import { InMemorySharedBudgetStoreV1 } from "@agentplat/rooms";
import {
  PostgresSharedBudgetStoreV1,
  PostgresScheduledFollowupStoreV1,
  runPlannerOperationsMigrations,
} from "@agentplat/rooms-postgres";
declare const access: SharedBudgetAccessV1<string>;
const service = new SharedBudgetServiceV1(
  new InMemorySharedBudgetStoreV1(),
  access,
);
const request: AdmitSharedBudgetV1 = {
  accountId: "owner-account",
  operationId: "source-revision",
  currency: "USD",
  category: "source",
  maximumMicros: 100,
  reference: "evidence:known",
};
void service.admit("verified-context", request);
// @ts-expect-error Currency must be explicitly bound before admission.
const missingCurrency: AdmitSharedBudgetV1 = {
  accountId: "a",
  operationId: "op",
  category: "source",
  maximumMicros: 100,
  reference: "evidence:known",
};
declare const result: SharedBudgetAdmissionV1;
if (result.admitted) {
  const token: string = result.reservation.token;
  void token;
}
declare const schedule: ReplaceScheduledFollowupV1;
const invalid: ReplaceScheduledFollowupV1 = {
  ...schedule,
  // @ts-expect-error The engine only supports timestamp intents and prepared notices.
  activations: [{ key: "x", at: "date", action: { kind: "execute-payment" } }],
};
declare const delivery: ScheduledDeliveryV1;
// @ts-expect-error Unknown adapter outcomes cannot be presented as confirmed delivery.
const wrong: ScheduledDeliveryV1 = { ...delivery, status: "probably_sent" };
void missingCurrency;
void invalid;
void wrong;
void ScheduledFollowupServiceV1;
void createRoomPlannerSharedBudgetV1;
void createRoomPlannerNoticeDeliveryV1;
void runSharedBudgetCallV1;
void PostgresSharedBudgetStoreV1;
void PostgresScheduledFollowupStoreV1;
void runPlannerOperationsMigrations;
