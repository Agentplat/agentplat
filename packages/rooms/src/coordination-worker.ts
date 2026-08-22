import { AgentPlatError } from "@agentplat/core";
import type {
  AgentRoomCoordinationRuntime,
  AgentRoomCoordinationState,
  AgentRoomCoordinationStore,
} from "./coordination-runtime.js";

/** Bounded operational counters emitted by a continuous coordination worker. */
export interface AgentRoomCoordinationWorkerMetrics {
  cycles: number;
  completed: number;
  failed: number;
  active: number;
  lastCycleAt?: string;
}

/**
 * Discovers and processes ready Agent Room coordination state with leases,
 * bounded concurrency, heartbeat renewal and graceful drain.
 */
export class AgentRoomCoordinationWorker {
  private readonly active = new Set<Promise<void>>();
  private stopped = false;
  private wake: (() => void) | undefined;
  private readonly metricsState: AgentRoomCoordinationWorkerMetrics = {
    cycles: 0,
    completed: 0,
    failed: 0,
    active: 0,
  };

  constructor(
    private readonly store: AgentRoomCoordinationStore,
    private readonly runtime: AgentRoomCoordinationRuntime,
    private readonly options: {
      workerId?: string;
      pollMs?: number;
      leaseMs?: number;
      concurrency?: number;
      tenantId?: string;
      onMetrics?(metrics: AgentRoomCoordinationWorkerMetrics): void;
      beforePoll?(): Promise<void>;
    } = {},
  ) {
    if (!store.listReady) {
      throw new AgentPlatError(
        "ADAPTER_ERROR",
        "Coordination worker requires store discovery support",
      );
    }
  }

  async start(signal?: AbortSignal) {
    this.stopped = false;
    while (!this.stopped && !signal?.aborted) {
      await this.runOnce();
      if (this.active.size >= (this.options.concurrency ?? 4)) {
        await Promise.race(this.active);
      } else {
        await this.wait(signal);
      }
    }
    await this.drain();
  }

  async runOnce() {
    await this.options.beforePoll?.();
    const capacity = Math.max(
      0,
      (this.options.concurrency ?? 4) - this.active.size,
    );
    if (capacity === 0) return this.metrics();
    const ready = await this.store.listReady!({
      tenantId: this.options.tenantId,
      limit: capacity,
    });
    for (const state of ready) this.launch(state);
    if (this.active.size > 0) await Promise.all([...this.active]);
    return this.metrics();
  }

  notify() {
    this.wake?.();
    this.wake = undefined;
  }

  stop() {
    this.stopped = true;
    this.notify();
  }

  async drain() {
    await Promise.all([...this.active]);
  }

  metrics() {
    return structuredClone(this.metricsState);
  }

  private launch(state: AgentRoomCoordinationState) {
    const leaseToken = `${this.options.workerId ?? "agent-room-worker"}:${crypto.randomUUID()}`;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let claimedRevision = state.revision;
    let itemId = "";
    const operation = this.runtime
      .runNext({
        tenantId: state.tenantId,
        roomId: state.roomId,
        coordinationId: state.coordinationId,
        expectedRevision: state.revision,
        leaseToken,
        leaseMs: this.options.leaseMs ?? 30_000,
        onClaimed: ({ state: claimed, itemId: claimedItemId }) => {
          claimedRevision = claimed.revision;
          itemId = claimedItemId;
          heartbeat = setInterval(
            async () => {
              try {
                const renewed = await this.runtime.renewLease({
                  tenantId: state.tenantId,
                  roomId: state.roomId,
                  coordinationId: state.coordinationId,
                  expectedRevision: claimedRevision,
                  itemId,
                  leaseToken,
                  leaseMs: this.options.leaseMs ?? 30_000,
                });
                claimedRevision = renewed.revision;
              } catch {
                if (heartbeat) clearInterval(heartbeat);
              }
            },
            Math.max(10, Math.floor((this.options.leaseMs ?? 30_000) / 3)),
          );
        },
      })
      .then((result) => {
        if (result.status === "completed") this.metricsState.completed += 1;
        if (result.status === "failed") this.metricsState.failed += 1;
      })
      .catch(() => {
        this.metricsState.failed += 1;
      })
      .finally(() => {
        if (heartbeat) clearInterval(heartbeat);
        this.metricsState.cycles += 1;
        this.metricsState.lastCycleAt = new Date().toISOString();
        this.active.delete(operation);
        this.metricsState.active = this.active.size;
        this.options.onMetrics?.(this.metrics());
      });
    this.active.add(operation);
    this.metricsState.active = this.active.size;
  }

  private wait(signal?: AbortSignal) {
    return new Promise<void>((resolve) => {
      if (this.stopped || signal?.aborted) return resolve();
      const timer = setTimeout(() => {
        this.wake = undefined;
        resolve();
      }, this.options.pollMs ?? 1_000);
      this.wake = () => {
        clearTimeout(timer);
        resolve();
      };
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
  }
}
