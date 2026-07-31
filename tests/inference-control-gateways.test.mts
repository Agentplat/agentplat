import type { JsonObject } from '@agentplat/core';
import type {
  ActionDispatchPermit,
  ActionGateway,
  ActionScope,
} from '@agentplat/inference-control/tools';
import type {
  MessageDispatchPermit,
  OutboundMessageGateway,
} from '@agentplat/inference-control/messages';

declare const actionGateway: ActionGateway;
declare const messageGateway: OutboundMessageGateway;
declare const scope: ActionScope;
declare const actionPermit: ActionDispatchPermit;
declare const messagePermit: MessageDispatchPermit;
const input: JsonObject = {};

void actionGateway.invoke({
  schemaVersion: 1,
  grantId: 'grant:one',
  input,
  logicalTimeMs: 1,
});
void scope;
void actionPermit;
void messageGateway;
void messagePermit;
