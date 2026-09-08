import type { RegistryPrincipal } from "@agentplat/agent-registry";
export type Json =
  null | boolean | number | string | Json[] | { [key: string]: Json };
export type A2APart =
  | { kind: "text"; text: string }
  | { kind: "data"; data: Json }
  | { kind: "url"; url: string; mediaType: string };
export interface A2AArtifact {
  id: string;
  name: string;
  parts: A2APart[];
}
export type A2ATaskState =
  | "submitted"
  | "working"
  | "completed"
  | "failed"
  | "canceled"
  | "input_required"
  | "auth_required"
  | "rejected";
export interface A2ATaskSnapshot {
  taskId: string;
  contextId: string;
  state: A2ATaskState;
  artifacts: A2AArtifact[];
  reply?: A2APart[];
}
export interface A2AMessageInput {
  messageId: string;
  parts: A2APart[];
  taskId?: string;
  contextId?: string;
}
/** Domain references are resolved by the host, never accepted from remote metadata. */
export interface A2AWorkBinding {
  roomId?: string;
  runId?: string;
  workItemId?: string;
  agentRevisionId?: string;
  peerId?: string;
  instanceId?: string;
  assignmentAuthorityId?: string;
  fencingToken?: string;
}
export interface A2AExecutionRequest {
  principal: RegistryPrincipal;
  serviceId: string;
  taskId: string;
  contextId: string;
  operationId: string;
  message: A2AMessageInput;
  binding: A2AWorkBinding;
}
export interface A2AService {
  id: string;
  name: string;
  description: string;
  version: string;
  kind: "agent" | "room_service";
  endpoint: string;
  skills: {
    id: string;
    name: string;
    description: string;
    capability: string;
  }[];
  inputMediaTypes: string[];
  outputMediaTypes: string[];
  /** Authenticate independently; authorize each call, including task reads. */
  authorize(principal: RegistryPrincipal, operation: string): Promise<boolean>;
  /** Idempotent, operation-bound local context policy, evaluated before work is issued. */
  bind(input: Omit<A2AExecutionRequest, "binding">): Promise<A2AWorkBinding>;
  execute(
    request: A2AExecutionRequest,
  ): AsyncIterable<{
    state: A2ATaskState;
    artifacts?: A2AArtifact[];
    reply?: A2APart[];
  }>;
  /** Return true only after the existing execution owner confirms cancellation. */
  cancel(request: A2AExecutionRequest): Promise<boolean>;
  /** Read/reconcile the existing run after restart. Must not issue replacement work. */
  reconcile(request: A2AExecutionRequest): Promise<A2ATaskSnapshot | undefined>;
}
export interface A2ARecord {
  revision: number;
  value: Json;
}
/** Atomic CAS. Retain pending operations; do not expire uncertain effect reservations. */
export interface A2AStateStore {
  get(scope: string, key: string): Promise<A2ARecord | undefined>;
  list(scope: string): Promise<{ key: string; record: A2ARecord }[]>;
  compareAndSet(
    scope: string,
    key: string,
    expectedRevision: number | null,
    value: Json,
  ): Promise<boolean>;
}
export class InMemoryA2AStateStore implements A2AStateStore {
  readonly #records = new Map<string, Map<string, A2ARecord>>();
  async get(scope: string, key: string) {
    return structuredClone(this.#records.get(scope)?.get(key));
  }
  async list(scope: string) {
    return structuredClone(
      [...(this.#records.get(scope)?.entries() ?? [])].map(([key, record]) => ({
        key,
        record,
      })),
    );
  }
  async compareAndSet(
    scope: string,
    key: string,
    expectedRevision: number | null,
    value: Json,
  ) {
    const entries = this.#records.get(scope) ?? new Map<string, A2ARecord>();
    if ((entries.get(key)?.revision ?? null) !== expectedRevision) return false;
    entries.set(key, {
      revision: (expectedRevision ?? 0) + 1,
      value: structuredClone(value),
    });
    this.#records.set(scope, entries);
    return true;
  }
}
export const a2aScope = (
  principal: RegistryPrincipal,
  serviceId: string,
  domain: string,
): string =>
  JSON.stringify([domain, principal.tenantId, principal.subjectId, serviceId]);
