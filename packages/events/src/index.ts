import type { AgentPlatID, ISODateTime, JsonObject, Metadata, ResourceRef, TenantScoped } from '@agentplat/core';

export interface AgentPlatEvent<TPayload extends JsonObject = JsonObject> extends TenantScoped {
  id: AgentPlatID;
  type: string;
  source: string;
  subject?: ResourceRef;
  payload: TPayload;
  metadata?: Metadata;
  occurredAt: ISODateTime;
}

export interface EventPublisher {
  publish(event: AgentPlatEvent): Promise<void>;
}

export interface EventSubscriber {
  subscribe(type: string, handler: (event: AgentPlatEvent) => Promise<void>): Promise<void>;
}

export interface WebhookSink {
  deliver(event: AgentPlatEvent, targetUrl: string): Promise<void>;
}
