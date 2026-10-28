import { AgentPlatError } from "@agentplat/core";

export function operationIntegerV1(
  value: number,
  maximum = Number.MAX_SAFE_INTEGER,
): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum)
    throw new AgentPlatError(
      "VALIDATION_ERROR",
      "Expected a bounded nonnegative integer",
    );
}
export function operationConflictV1(
  message = "Operation identity or revision changed",
): never {
  throw new AgentPlatError("CONFLICT", message);
}
export function operationSumV1(...values: number[]): number {
  const sum = values.reduce((a, b) => a + b, 0);
  operationIntegerV1(sum);
  return sum;
}

/** Reference transactions stage only touched records, and commit only on success. */
export class MemoryOperationTablesV1 {
  private rows = new Map<string, unknown>();
  private locks = new Map<string, Promise<void>>();
  async transaction<T>(
    scope: string,
    work: (tx: {
      get<R>(kind: string, id: string): R | undefined;
      put(kind: string, id: string, record: unknown): void;
      values<R>(kind: string): R[];
    }) => Promise<T>,
  ): Promise<T> {
    const prior = this.locks.get(scope) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.locks.set(scope, current);
    await prior;
    const pending = new Map<string, unknown>();
    const key = (kind: string, id: string) => JSON.stringify([scope, kind, id]);
    try {
      const result = await work({
        get: <R>(kind: string, id: string) =>
          structuredClone(
            (pending.has(key(kind, id)) ? pending : this.rows).get(
              key(kind, id),
            ),
          ) as R | undefined,
        put: (kind, id, record) => {
          pending.set(key(kind, id), structuredClone(record));
        },
        values: <R>(kind: string) =>
          [...new Map([...this.rows, ...pending])]
            .filter(([k]) => {
              const [s, t] = JSON.parse(k);
              return s === scope && t === kind;
            })
            .map(([, v]) => structuredClone(v) as R),
      });
      for (const [k, v] of pending) this.rows.set(k, v);
      return structuredClone(result);
    } finally {
      release();
      if (this.locks.get(scope) === current) this.locks.delete(scope);
    }
  }
  values<R>(kind: string): R[] {
    return [...this.rows]
      .filter(([k]) => JSON.parse(k)[1] === kind)
      .map(([, v]) => structuredClone(v) as R);
  }
}
