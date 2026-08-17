import type { JsonValue } from '@agentplat/core';

/** Provider-neutral durable state boundary. Implementations must provide atomic CAS. */
export interface DurableStateStoreV1<TState = JsonValue> {
  load(key: string): Promise<DurableStateRecordV1<TState> | undefined>;
  save(input: {
    readonly key: string;
    readonly state: TState;
    readonly expectedRevision: number | null;
    readonly epoch: number;
  }): Promise<DurableStateRecordV1<TState>>;
}

export interface DurableStateRecordV1<TState = JsonValue> {
  readonly key: string;
  readonly state: TState;
  readonly revision: number;
  readonly epoch: number;
  readonly updatedAt: string;
}

export type DurableOperationStatusV1 = 'applied' | 'idempotent' | 'rejected';

/** Causal receipt emitted for every externally visible state transition. */
export interface CausalReceiptV1 {
  readonly receiptId: string;
  readonly operationId: string;
  readonly operationDigest: string;
  readonly stateKey: string;
  readonly stateRevision: number;
  readonly epoch: number;
  readonly parentReceiptDigest: string | null;
  readonly status: DurableOperationStatusV1;
  readonly occurredAt: string;
  readonly metadata?: Readonly<Record<string, JsonValue>>;
}

export interface IdempotencyEntryV1 {
  readonly operationId: string;
  readonly operationDigest: string;
  readonly receipt: CausalReceiptV1;
}

export interface IdempotencyLedgerV1 {
  get(operationId: string): Promise<IdempotencyEntryV1 | undefined>;
  put(entry: IdempotencyEntryV1): Promise<void>;
}

/** Rejects stale writers and prevents epoch rollback after restart. */
export class EpochFenceV1 {
  readonly #epochs = new Map<string, number>();

  observe(key: string, epoch: number): void {
    if (!Number.isSafeInteger(epoch) || epoch < 0) throw new Error('epoch must be a non-negative integer');
    const current = this.#epochs.get(key);
    if (current !== undefined && epoch < current) throw new Error(`epoch rollback for "${key}"`);
    this.#epochs.set(key, epoch);
  }

  assert(key: string, epoch: number): void {
    const current = this.#epochs.get(key);
    if (current !== undefined && epoch !== current) throw new Error(`stale epoch for "${key}"`);
    this.observe(key, epoch);
  }

  current(key: string): number | undefined { return this.#epochs.get(key); }
}

/** Small local implementation useful for restart simulations and deterministic adapters. */
export class InMemoryDurableStateStoreV1<TState = JsonValue> implements DurableStateStoreV1<TState>, IdempotencyLedgerV1 {
  readonly #states = new Map<string, DurableStateRecordV1<TState>>();
  readonly #operations = new Map<string, IdempotencyEntryV1>();

  async load(key: string): Promise<DurableStateRecordV1<TState> | undefined> {
    const value = this.#states.get(key);
    return value === undefined ? undefined : structuredClone(value);
  }

  async save(input: { readonly key: string; readonly state: TState; readonly expectedRevision: number | null; readonly epoch: number }): Promise<DurableStateRecordV1<TState>> {
    const current = this.#states.get(input.key);
    if ((input.expectedRevision === null && current !== undefined) ||
      (input.expectedRevision !== null && (current === undefined || current.revision !== input.expectedRevision)))
      throw new Error(`durable state revision conflict for "${input.key}"`);
    if (current !== undefined && input.epoch < current.epoch) throw new Error(`durable state epoch rollback for "${input.key}"`);
    const next: DurableStateRecordV1<TState> = { key: input.key, state: structuredClone(input.state), revision: current ? current.revision + 1 : 0, epoch: input.epoch, updatedAt: new Date().toISOString() };
    this.#states.set(input.key, next);
    return structuredClone(next);
  }

  async get(operationId: string): Promise<IdempotencyEntryV1 | undefined> { return this.#operations.get(operationId); }
  async put(entry: IdempotencyEntryV1): Promise<void> {
    const existing = this.#operations.get(entry.operationId);
    if (existing !== undefined && existing.operationDigest !== entry.operationDigest) throw new Error(`idempotency conflict for "${entry.operationId}"`);
    this.#operations.set(entry.operationId, entry);
  }
}

export async function idempotentOperationV1(input: {
  readonly operationId: string;
  readonly operationDigest: string;
  readonly ledger: IdempotencyLedgerV1;
  readonly apply: () => Promise<CausalReceiptV1>;
}): Promise<CausalReceiptV1> {
  const existing = await input.ledger.get(input.operationId);
  if (existing !== undefined) {
    if (existing.operationDigest !== input.operationDigest) throw new Error(`idempotency conflict for "${input.operationId}"`);
    return { ...existing.receipt, status: 'idempotent' };
  }
  const receipt = await input.apply();
  await input.ledger.put({ operationId: input.operationId, operationDigest: input.operationDigest, receipt });
  return receipt;
}
