import type {
  AgentPlatID,
  ISODateTime,
  JsonObject,
  Metadata,
  ResourceRef,
  TenantScoped,
} from '@agentplat/core';

export interface AgentPlatEvent<
  TPayload extends JsonObject = JsonObject,
> extends TenantScoped {
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
  subscribe(
    type: string,
    handler: (event: AgentPlatEvent) => Promise<void>
  ): Promise<void>;
}

export interface WebhookSink {
  deliver(event: AgentPlatEvent, targetUrl: string): Promise<void>;
}

type EventHandler = (event: AgentPlatEvent) => Promise<void>;

export class InMemoryEventBus implements EventPublisher, EventSubscriber {
  private readonly handlers = new Map<string, EventHandler[]>();
  private readonly published: AgentPlatEvent[] = [];

  async publish(event: AgentPlatEvent): Promise<void> {
    this.published.push(event);
    const handlers = [
      ...(this.handlers.get(event.type) ?? []),
      ...(this.handlers.get('*') ?? []),
    ];
    await Promise.all(handlers.map((handler) => handler(event)));
  }

  async subscribe(type: string, handler: EventHandler): Promise<void> {
    const handlers = this.handlers.get(type) ?? [];
    handlers.push(handler);
    this.handlers.set(type, handlers);
  }

  listPublished(): AgentPlatEvent[] {
    return [...this.published];
  }

  clear(): void {
    this.published.length = 0;
  }
}
