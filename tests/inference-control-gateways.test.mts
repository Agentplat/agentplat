import type { JsonObject } from "@agentplat/core";
import type {
  ActionDispatchPermit,
  ActionGateway,
  ActionGrantRepository,
  ActionScope,
} from "@agentplat/inference-control/tools";
import {
  recoverReservedActionGrantV1,
  createActionGrantV1,
  issueActionGrantV1,
  reconcileActionGrantV1,
} from "@agentplat/inference-control/tools";
import type {
  MessageDispatchPermit,
  OutboundMessageGateway,
} from "@agentplat/inference-control/messages";

declare const actionGateway: ActionGateway;
declare const actionGrantRepository: ActionGrantRepository;
declare const messageGateway: OutboundMessageGateway;
declare const scope: ActionScope;
declare const actionPermit: ActionDispatchPermit;
declare const messagePermit: MessageDispatchPermit;
const input: JsonObject = {};

void actionGateway.invoke({
  schemaVersion: 1,
  grantId: "grant:one",
  input,
  logicalTimeMs: 1,
});
void scope;
void actionPermit;
void actionGrantRepository;
void issueActionGrantV1;
void reconcileActionGrantV1;
void messageGateway;
void messagePermit;

const prepared = createActionGrantV1({
  grantId: "grant:prepared", scope, binding: actionGateway.binding, input: {},
  assessmentRequestId: "assessment-request:prepared", assessmentId: "assessment:prepared",
  assessmentTargetDigest: `sha256:${"2".repeat(64)}`, idempotencyKey: "effect:prepared",
  issuedAtLogicalMs: 1, expiresAtLogicalMs: 101,
});
void issueActionGrantV1(actionGrantRepository, prepared);
// @ts-expect-error callers cannot mutate a prepared grant
prepared.status = "dispatched";

void recoverReservedActionGrantV1(actionGrantRepository, {
  grantId: "one", reservationId: "one:reservation", dispatchAttemptId: "one:attempt",
}, async grant => grant.reservation !== null);
