import type { ISODateTime, JsonObject } from "@agentplat/core";
import type { HumanContributionRequest } from "./human-contribution.js";

/** Optional projection boundary for an external human work system. */
export interface WorkManagementProvider {
  providerId: string;
  lookupContributionTask(input: {
    idempotencyKey: string;
  }): Promise<{ externalId: string; externalUrl?: string } | null>;
  createContributionTask(input: {
    contribution: HumanContributionRequest;
    idempotencyKey: string;
  }): Promise<{ externalId: string; externalUrl?: string }>;
  updateContributionTask(input: {
    externalId: string;
    contribution: HumanContributionRequest;
    idempotencyKey: string;
  }): Promise<void>;
}

/** Durable local delivery state for one provider projection. */
export interface HumanContributionDelivery {
  tenantId: string;
  roomId: string;
  deliveryId: string;
  contributionId: string;
  providerId: string;
  status: "pending" | "processing" | "synchronized" | "failed";
  revision: number;
  attempts: number;
  nextAttemptAt: ISODateTime;
  leaseToken?: string;
  leaseExpiresAt?: ISODateTime;
  externalId?: string;
  externalUrl?: string;
  lastError?: string;
  desiredContributionRevision: number;
  synchronizedContributionRevision?: number;
  providerReceipt?: JsonObject;
  metadata: JsonObject;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** Compare-and-set persistence and scoped discovery for provider deliveries. */
export interface HumanContributionDeliveryStore {
  load(
    tenantId: string,
    roomId: string,
    deliveryId: string,
  ): Promise<HumanContributionDelivery | undefined>;
  compareAndSet(input: {
    expectedRevision: number | null;
    state: HumanContributionDelivery;
  }): Promise<boolean>;
  list(tenantId: string, roomId?: string): Promise<HumanContributionDelivery[]>;
}

/** Test-oriented in-memory work-management delivery store. */
export class InMemoryHumanContributionDeliveryStore implements HumanContributionDeliveryStore {
  private readonly states = new Map<string, HumanContributionDelivery>();
  async load(tenantId: string, roomId: string, deliveryId: string) {
    const state = this.states.get(
      `${tenantId}\u0000${roomId}\u0000${deliveryId}`,
    );
    return state ? structuredClone(state) : undefined;
  }
  async compareAndSet(input: {
    expectedRevision: number | null;
    state: HumanContributionDelivery;
  }) {
    const key = `${input.state.tenantId}\u0000${input.state.roomId}\u0000${input.state.deliveryId}`;
    const current = this.states.get(key);
    if (input.expectedRevision === null) {
      if (current || input.state.revision !== 0) return false;
    } else if (
      !current ||
      current.revision !== input.expectedRevision ||
      input.state.revision !== input.expectedRevision + 1
    ) {
      return false;
    }
    this.states.set(key, structuredClone(input.state));
    return true;
  }
  async list(tenantId: string, roomId?: string) {
    return [...this.states.values()]
      .filter(
        (state) =>
          state.tenantId === tenantId &&
          (roomId === undefined || state.roomId === roomId),
      )
      .map((state) => structuredClone(state));
  }
}

/** Bounded queue counters for one or more work-management providers. */
export interface WorkManagementDeliveryMetrics {
  pending: number;
  processing: number;
  synchronized: number;
  failed: number;
  oldestPendingAt?: ISODateTime;
}

/**
 * Reconciles idempotent external task projections under local leases and
 * compare-and-set state without importing external completion authority.
 */
export class WorkManagementDeliveryRuntime {
  private readonly providers = new Map<string, WorkManagementProvider>();
  private readonly clock: () => Date;
  constructor(
    private readonly store: HumanContributionDeliveryStore,
    providers: WorkManagementProvider[],
    private readonly options: {
      clock?: () => Date;
      leaseMs?: number;
      maximumAttempts?: number;
      baseRetryMs?: number;
    } = {},
  ) {
    this.clock = options.clock ?? (() => new Date());
    for (const provider of providers)
      this.providers.set(provider.providerId, provider);
  }

  async enqueue(input: {
    contribution: HumanContributionRequest;
    providerId: string;
  }) {
    const provider = this.provider(input.providerId);
    const deliveryId = `${input.contribution.contributionId}:${provider.providerId}`;
    const existing = await this.store.load(
      input.contribution.tenantId,
      input.contribution.roomId,
      deliveryId,
    );
    if (existing) {
      if (existing.contributionId !== input.contribution.contributionId) {
        throw new Error("Work management delivery binding conflict");
      }
      if (existing.desiredContributionRevision >= input.contribution.revision) {
        return existing;
      }
      const next: HumanContributionDelivery = {
        ...existing,
        revision: existing.revision + 1,
        status: "pending",
        desiredContributionRevision: input.contribution.revision,
        nextAttemptAt: this.now(),
        updatedAt: this.now(),
      };
      await this.commit(existing.revision, next);
      return next;
    }
    const now = this.now();
    const state: HumanContributionDelivery = {
      tenantId: input.contribution.tenantId,
      roomId: input.contribution.roomId,
      deliveryId,
      contributionId: input.contribution.contributionId,
      providerId: provider.providerId,
      status: "pending",
      revision: 0,
      attempts: 0,
      desiredContributionRevision: input.contribution.revision,
      nextAttemptAt: now,
      metadata: {},
      createdAt: now,
      updatedAt: now,
    };
    if (!(await this.store.compareAndSet({ expectedRevision: null, state }))) {
      return this.store.load(state.tenantId, state.roomId, state.deliveryId);
    }
    return state;
  }

  async synchronize(input: {
    contribution: HumanContributionRequest;
    providerId: string;
    expectedRevision: number;
    leaseToken: string;
  }) {
    const provider = this.provider(input.providerId);
    const deliveryId = `${input.contribution.contributionId}:${provider.providerId}`;
    const current = await this.requireDelivery(input.contribution, deliveryId);
    if (current.revision !== input.expectedRevision)
      throw new Error("Work management delivery revision conflict");
    if (
      current.status === "synchronized" &&
      current.synchronizedContributionRevision === input.contribution.revision
    ) {
      return current;
    }
    if (current.attempts >= (this.options.maximumAttempts ?? 8)) {
      throw new Error("Work management delivery attempt limit reached");
    }
    const now = this.clock();
    if (
      current.status === "processing" &&
      current.leaseExpiresAt &&
      new Date(current.leaseExpiresAt).getTime() > now.getTime()
    ) {
      throw new Error("Work management delivery is already leased");
    }
    if (new Date(current.nextAttemptAt).getTime() > now.getTime()) {
      throw new Error("Work management delivery retry is not due");
    }
    const claimed: HumanContributionDelivery = {
      ...current,
      revision: current.revision + 1,
      status: "processing",
      attempts: current.attempts + 1,
      leaseToken: input.leaseToken,
      leaseExpiresAt: new Date(
        now.getTime() + (this.options.leaseMs ?? 30_000),
      ).toISOString(),
      updatedAt: now.toISOString(),
    };
    await this.commit(current.revision, claimed);
    const idempotencyKey = deliveryIdempotencyKey(claimed);
    try {
      let external = await provider.lookupContributionTask({ idempotencyKey });
      if (!external) {
        external = await provider.createContributionTask({
          contribution: input.contribution,
          idempotencyKey,
        });
      } else if (
        claimed.synchronizedContributionRevision !== input.contribution.revision
      ) {
        await provider.updateContributionTask({
          externalId: external.externalId,
          contribution: input.contribution,
          idempotencyKey,
        });
      }
      const latest = await this.requireDelivery(input.contribution, deliveryId);
      if (latest.leaseToken !== input.leaseToken) {
        throw new Error("Work management delivery lease ownership was lost");
      }
      const synchronized: HumanContributionDelivery = {
        ...latest,
        revision: latest.revision + 1,
        status: "synchronized",
        synchronizedContributionRevision: input.contribution.revision,
        externalId: external.externalId,
        externalUrl: external.externalUrl,
        providerReceipt: {
          idempotencyKey,
          contributionRevision: input.contribution.revision,
        },
        leaseToken: undefined,
        leaseExpiresAt: undefined,
        lastError: undefined,
        updatedAt: this.now(),
      };
      await this.commit(latest.revision, synchronized);
      return synchronized;
    } catch (error) {
      const latest = await this.requireDelivery(input.contribution, deliveryId);
      if (latest.leaseToken !== input.leaseToken) throw error;
      const delay = Math.min(
        3_600_000,
        (this.options.baseRetryMs ?? 1_000) *
          2 ** Math.max(0, latest.attempts - 1),
      );
      const failed: HumanContributionDelivery = {
        ...latest,
        revision: latest.revision + 1,
        status: "failed",
        nextAttemptAt: new Date(this.clock().getTime() + delay).toISOString(),
        leaseToken: undefined,
        leaseExpiresAt: undefined,
        lastError:
          error instanceof Error
            ? error.message.slice(0, 500)
            : "unknown error",
        updatedAt: this.now(),
      };
      await this.commit(latest.revision, failed);
      return failed;
    }
  }

  async metrics(
    tenantId: string,
    roomId?: string,
  ): Promise<WorkManagementDeliveryMetrics> {
    const deliveries = await this.store.list(tenantId, roomId);
    const metrics: WorkManagementDeliveryMetrics = {
      pending: 0,
      processing: 0,
      synchronized: 0,
      failed: 0,
    };
    for (const delivery of deliveries) metrics[delivery.status] += 1;
    const pending = deliveries
      .filter(
        (delivery) =>
          delivery.status === "pending" || delivery.status === "failed",
      )
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    if (pending[0]) metrics.oldestPendingAt = pending[0].createdAt;
    return metrics;
  }

  private provider(id: string) {
    const provider = this.providers.get(id);
    if (!provider)
      throw new Error(`Work management provider "${id}" is not registered`);
    return provider;
  }
  private async requireDelivery(
    contribution: HumanContributionRequest,
    deliveryId: string,
  ) {
    const state = await this.store.load(
      contribution.tenantId,
      contribution.roomId,
      deliveryId,
    );
    if (!state) throw new Error("Work management delivery not found");
    return state;
  }
  private async commit(
    expectedRevision: number,
    state: HumanContributionDelivery,
  ) {
    if (!(await this.store.compareAndSet({ expectedRevision, state }))) {
      throw new Error("Work management delivery changed concurrently");
    }
  }
  private now() {
    return this.clock().toISOString();
  }
}

/** Deterministic local provider for examples and tests. */
export class LocalWorkManagementProvider implements WorkManagementProvider {
  readonly providerId = "local";
  private readonly tasks = new Map<
    string,
    { externalId: string; externalUrl?: string }
  >();
  async lookupContributionTask(input: { idempotencyKey: string }) {
    return this.tasks.get(input.idempotencyKey) ?? null;
  }
  async createContributionTask(input: {
    contribution: HumanContributionRequest;
    idempotencyKey: string;
  }) {
    const existing = this.tasks.get(input.idempotencyKey);
    if (existing) return existing;
    const result = { externalId: `local:${input.contribution.contributionId}` };
    this.tasks.set(input.idempotencyKey, result);
    return result;
  }
  async updateContributionTask(): Promise<void> {}
}

/** Derives the stable cross-restart identity of an external delivery. */
export function deliveryIdempotencyKey(
  delivery: Pick<
    HumanContributionDelivery,
    "tenantId" | "roomId" | "contributionId" | "providerId"
  >,
) {
  return [
    "agentplat",
    "human-contribution",
    delivery.tenantId,
    delivery.roomId,
    delivery.contributionId,
    delivery.providerId,
  ]
    .map(encodeURIComponent)
    .join(":");
}
