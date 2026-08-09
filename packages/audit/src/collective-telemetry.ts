export type CollectiveTelemetryCategoryV1 =
  | "control"
  | "coordination"
  | "execution"
  | "inference"
  | "interop"
  | "membership"
  | "planning"
  | "recovery"
  | "simulation"
  | "transport"
  | "trust";

export type CollectiveTelemetryOutcomeV1 =
  "accepted" | "completed" | "deferred" | "failed" | "rejected" | "started";

export interface CollectiveTelemetryMetricV1 {
  readonly key: string;
  readonly value: number;
}

export interface CollectiveTelemetryRecordInputV1 {
  readonly category: CollectiveTelemetryCategoryV1;
  readonly operation: string;
  readonly outcome: CollectiveTelemetryOutcomeV1;
  readonly logicalTimeMs: number;
  readonly operationDigest: string;
  readonly evidenceDigests?: readonly string[];
  readonly metrics?: readonly CollectiveTelemetryMetricV1[];
  readonly correlation?: CollectiveTelemetryCorrelationV1;
}

/** Content-free causal coordinates shared by all runtime layers. */
export interface CollectiveTelemetryCorrelationV1 {
  readonly missionId: string;
  readonly cycleId?: string;
  readonly decisionId?: string;
  readonly effectId?: string;
}

export interface CollectiveTelemetryEventV1 {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly streamId: string;
  readonly tenantId: string;
  readonly collectiveId: string;
  readonly peerId: string;
  readonly instanceId: string;
  readonly keyId: string;
  readonly sequence: number;
  readonly category: CollectiveTelemetryCategoryV1;
  readonly operation: string;
  readonly outcome: CollectiveTelemetryOutcomeV1;
  readonly logicalTimeMs: number;
  readonly operationDigest: string;
  readonly policyDigest: string;
  readonly evidenceDigests: readonly string[];
  readonly metrics: readonly CollectiveTelemetryMetricV1[];
  readonly correlation?: CollectiveTelemetryCorrelationV1;
  readonly previousEventDigest: string | null;
  readonly eventDigest: string;
  readonly signature: string;
}

export interface CollectiveTelemetryPolicyV1 {
  readonly schemaVersion: 1;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly allowedMetricKeys: readonly string[];
  readonly maximumEvidenceDigestsPerEvent: number;
  readonly maximumMetricsPerEvent: number;
  readonly maximumRetainedEvents: number;
  readonly maximumCommitAttempts: number;
  readonly policyDigest: string;
}

export interface CollectiveTelemetryStateV1 {
  readonly schemaVersion: 1;
  readonly streamId: string;
  readonly tenantId: string;
  readonly collectiveId: string;
  readonly peerId: string;
  readonly instanceId: string;
  readonly keyId: string;
  readonly policyDigest: string;
  readonly revision: number;
  readonly sequence: number;
  readonly chainHeadDigest: string | null;
  readonly retainedFromSequence: number;
  readonly events: readonly CollectiveTelemetryEventV1[];
  readonly logicalTimeHighWaterMs: number;
  readonly previousStateDigest: string | null;
  readonly stateDigest: string;
}

/**
 * Short-lived idempotency receipt for one external delivery. It is retained
 * independently of the bounded event window until the source confirms that it
 * durably remembers the record.
 */
export interface CollectiveTelemetryDeliveryReceiptV1 {
  readonly schemaVersion: 1;
  readonly streamId: string;
  readonly deliveryDigest: string;
  readonly recordInputDigest: string;
  readonly eventDigest: string;
  readonly sequence: number;
}

export type CollectiveTelemetryDeliveryCommitResultV1 =
  "committed" | "already_recorded" | "conflict";

export interface CollectiveTelemetryEvidenceBundleV1 {
  readonly schemaVersion: 1;
  readonly streamId: string;
  readonly tenantId: string;
  readonly collectiveId: string;
  readonly peerId: string;
  readonly instanceId: string;
  readonly keyId: string;
  readonly policyDigest: string;
  readonly fromSequence: number;
  readonly throughSequence: number;
  readonly priorEventDigest: string | null;
  readonly chainHeadDigest: string | null;
  readonly events: readonly CollectiveTelemetryEventV1[];
  readonly counts: readonly {
    readonly category: CollectiveTelemetryCategoryV1;
    readonly outcome: CollectiveTelemetryOutcomeV1;
    readonly count: number;
  }[];
  readonly exportedAtLogicalMs: number;
  readonly bundleDigest: string;
}

export interface CollectiveTelemetryRuntimeIdentityV1 {
  readonly tenantId: string;
  readonly collectiveId: string;
  readonly peerId: string;
  readonly instanceId: string;
  readonly keyId: string;
}

export interface CollectiveTelemetryStoreV1 {
  load(streamId: string): Promise<CollectiveTelemetryStateV1 | null>;
  save(
    state: CollectiveTelemetryStateV1,
    expectedRevision: number | null,
    expectedStateDigest: string | null,
  ): Promise<boolean>;
  /** Atomically commits the next stream state, event, and delivery receipt. */
  commitDelivery?(input: {
    readonly state: CollectiveTelemetryStateV1;
    readonly expectedRevision: number;
    readonly expectedStateDigest: string;
    readonly receipt: CollectiveTelemetryDeliveryReceiptV1;
  }): Promise<CollectiveTelemetryDeliveryCommitResultV1>;
  loadDelivery?(
    streamId: string,
    deliveryDigest: string,
  ): Promise<CollectiveTelemetryDeliveryReceiptV1 | null>;
  /** Idempotently removes the exact receipt after the source records handoff. */
  releaseDelivery?(streamId: string, deliveryDigest: string): Promise<boolean>;
}

export interface CollectiveTelemetryAnchorV1 {
  readonly revision: number;
  readonly sequence: number;
  readonly stateDigest: string;
  readonly logicalTimeHighWaterMs: number;
}

/** Independently protected monotonic witness for rollback-sensitive streams. */
export interface CollectiveTelemetryMonotonicAnchorPortV1 {
  load(anchorKey: string): Promise<CollectiveTelemetryAnchorV1 | null>;
  save(input: {
    readonly anchorKey: string;
    readonly anchor: CollectiveTelemetryAnchorV1;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: string | null;
  }): Promise<boolean>;
}

export interface CollectiveTelemetryAuthenticityPortV1 {
  readonly peerId: string;
  readonly instanceId: string;
  readonly keyId: string;
  sign(messageDigest: string): Promise<string>;
  verify(input: {
    readonly peerId: string;
    readonly instanceId: string;
    readonly keyId: string;
    readonly messageDigest: string;
    readonly signature: string;
  }): Promise<boolean>;
}

export interface CollectiveTelemetryRuntimeOptionsV1 {
  readonly streamId: string;
  readonly anchorKey: string;
  readonly tenantId: string;
  readonly collectiveId: string;
  readonly policy: CollectiveTelemetryPolicyV1;
  readonly authenticity: CollectiveTelemetryAuthenticityPortV1;
  readonly store?: CollectiveTelemetryStoreV1;
  readonly maximumPendingDeliveryReceipts?: number;
  readonly monotonicAnchor: CollectiveTelemetryMonotonicAnchorPortV1;
  readonly crypto?: Crypto;
}

interface CollectiveTelemetryDurableRuntimeInvokersV1 {
  readonly handoffDelivery: (input: {
    readonly deliveryDigest: string;
    readonly event: CollectiveTelemetryRecordInputV1;
    readonly deliveryState: "pending" | "recorded";
    readonly markRecorded: () => Promise<boolean>;
    readonly acknowledge: () => Promise<boolean>;
  }) => Promise<boolean>;
}

interface CollectiveTelemetryRuntimeInvokersV1 {
  readonly record: (
    input: CollectiveTelemetryRecordInputV1,
  ) => Promise<CollectiveTelemetryEventV1>;
}

const collectiveTelemetryDurableRuntimeInvokers = new WeakMap<
  object,
  CollectiveTelemetryDurableRuntimeInvokersV1
>();
const collectiveTelemetryRuntimeInvokers = new WeakMap<
  object,
  CollectiveTelemetryRuntimeInvokersV1
>();
const claimedCollectiveTelemetryDurableRuntimes = new WeakSet<object>();
const collectiveTelemetryRuntimeIdentities = new WeakMap<
  object,
  CollectiveTelemetryRuntimeIdentityV1
>();

export class InMemoryCollectiveTelemetryStoreV1 implements CollectiveTelemetryStoreV1 {
  readonly #states = new Map<string, CollectiveTelemetryStateV1>();
  readonly #deliveryReceipts = new Map<
    string,
    CollectiveTelemetryDeliveryReceiptV1
  >();

  constructor(readonly maximumPendingDeliveryReceipts = 4_096) {
    integer(
      maximumPendingDeliveryReceipts,
      "maximumPendingDeliveryReceipts",
      1,
      100_000,
    );
  }

  async load(streamId: string): Promise<CollectiveTelemetryStateV1 | null> {
    const state = this.#states.get(streamId);
    return state ? immutable(state) : null;
  }

  async save(
    state: CollectiveTelemetryStateV1,
    expectedRevision: number | null,
    expectedStateDigest: string | null,
  ): Promise<boolean> {
    const current = this.#states.get(state.streamId);
    if (
      (expectedRevision === null &&
        (expectedStateDigest !== null ||
          current !== undefined ||
          state.revision !== 0)) ||
      (expectedRevision !== null &&
        (!current ||
          current.revision !== expectedRevision ||
          current.stateDigest !== expectedStateDigest ||
          state.revision !== expectedRevision + 1))
    )
      return false;
    this.#states.set(state.streamId, immutable(state));
    return true;
  }

  async commitDelivery(input: {
    readonly state: CollectiveTelemetryStateV1;
    readonly expectedRevision: number;
    readonly expectedStateDigest: string;
    readonly receipt: CollectiveTelemetryDeliveryReceiptV1;
  }): Promise<CollectiveTelemetryDeliveryCommitResultV1> {
    const key = `${input.receipt.streamId}\u0000${input.receipt.deliveryDigest}`;
    const receipt = this.#deliveryReceipts.get(key);
    if (receipt) {
      if (receipt.recordInputDigest !== input.receipt.recordInputDigest)
        fail("collective telemetry delivery digest collision");
      return "already_recorded";
    }
    const current = this.#states.get(input.state.streamId);
    if (
      !current ||
      current.revision !== input.expectedRevision ||
      current.stateDigest !== input.expectedStateDigest ||
      input.state.revision !== input.expectedRevision + 1
    )
      return "conflict";
    if (this.#deliveryReceipts.size >= this.maximumPendingDeliveryReceipts)
      fail("collective telemetry delivery receipt capacity exhausted");
    this.#states.set(input.state.streamId, immutable(input.state));
    this.#deliveryReceipts.set(key, immutable(input.receipt));
    return "committed";
  }

  async loadDelivery(
    streamId: string,
    deliveryDigest: string,
  ): Promise<CollectiveTelemetryDeliveryReceiptV1 | null> {
    return (
      this.#deliveryReceipts.get(`${streamId}\u0000${deliveryDigest}`) ?? null
    );
  }

  async releaseDelivery(
    streamId: string,
    deliveryDigest: string,
  ): Promise<boolean> {
    const key = `${streamId}\u0000${deliveryDigest}`;
    this.#deliveryReceipts.delete(key);
    return true;
  }
}

export class InMemoryCollectiveTelemetryMonotonicAnchorV1 implements CollectiveTelemetryMonotonicAnchorPortV1 {
  readonly #anchors = new Map<string, CollectiveTelemetryAnchorV1>();

  async load(anchorKey: string): Promise<CollectiveTelemetryAnchorV1 | null> {
    return this.#anchors.get(anchorKey) ?? null;
  }

  async save(input: {
    readonly anchorKey: string;
    readonly anchor: CollectiveTelemetryAnchorV1;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: string | null;
  }): Promise<boolean> {
    const current = this.#anchors.get(input.anchorKey) ?? null;
    validateAnchor(input.anchor);
    if (
      (input.expectedRevision === null) !==
        (input.expectedStateDigest === null) ||
      (current?.revision ?? null) !== input.expectedRevision ||
      (current?.stateDigest ?? null) !== input.expectedStateDigest ||
      input.anchor.revision !== (input.expectedRevision ?? -1) + 1 ||
      input.anchor.sequence !== (current?.sequence ?? -1) + 1 ||
      input.anchor.logicalTimeHighWaterMs <
        (current?.logicalTimeHighWaterMs ?? -1)
    )
      return false;
    this.#anchors.set(input.anchorKey, immutable(input.anchor));
    return true;
  }
}

/**
 * Content-free, signed evidence stream. It accepts only identifiers, digests,
 * bounded numeric metrics and categorical outcomes; prompts, model output,
 * tool payloads and arbitrary metadata have no place in the contract.
 */
export class CollectiveTelemetryRuntimeV1 {
  readonly #options: CollectiveTelemetryRuntimeOptionsV1;
  readonly #store: CollectiveTelemetryStoreV1;
  readonly #policy: CollectiveTelemetryPolicyV1;
  readonly #authoritativeLoad: () => Promise<CollectiveTelemetryStateV1>;
  #verifiedPolicy: Promise<CollectiveTelemetryPolicyV1> | null = null;

  constructor(options: CollectiveTelemetryRuntimeOptionsV1) {
    identifier(options.streamId, "streamId");
    identifier(options.anchorKey, "anchorKey");
    identifier(options.tenantId, "tenantId");
    identifier(options.collectiveId, "collectiveId");
    identifier(options.authenticity.peerId, "authenticity.peerId");
    identifier(options.authenticity.instanceId, "authenticity.instanceId");
    identifier(options.authenticity.keyId, "authenticity.keyId");
    if (
      typeof options.authenticity.sign !== "function" ||
      typeof options.authenticity.verify !== "function"
    )
      fail("collective telemetry authenticity port is required");
    if (
      !options.monotonicAnchor ||
      typeof options.monotonicAnchor.load !== "function" ||
      typeof options.monotonicAnchor.save !== "function"
    )
      fail("collective telemetry monotonic anchor is required");
    const authenticity = Object.freeze({
      peerId: options.authenticity.peerId,
      instanceId: options.authenticity.instanceId,
      keyId: options.authenticity.keyId,
      sign: options.authenticity.sign.bind(options.authenticity),
      verify: options.authenticity.verify.bind(options.authenticity),
    });
    const monotonicAnchor = Object.freeze({
      load: options.monotonicAnchor.load.bind(options.monotonicAnchor),
      save: options.monotonicAnchor.save.bind(options.monotonicAnchor),
    });
    const crypto = captureCrypto(options.crypto);
    this.#options = Object.freeze({
      ...options,
      streamId: options.streamId,
      anchorKey: options.anchorKey,
      tenantId: options.tenantId,
      collectiveId: options.collectiveId,
      authenticity,
      monotonicAnchor,
      crypto,
    });
    collectiveTelemetryRuntimeIdentities.set(
      this,
      immutable({
        tenantId: options.tenantId,
        collectiveId: options.collectiveId,
        peerId: options.authenticity.peerId,
        instanceId: options.authenticity.instanceId,
        keyId: options.authenticity.keyId,
      }),
    );
    integer(
      options.maximumPendingDeliveryReceipts ?? 4_096,
      "maximumPendingDeliveryReceipts",
      1,
      100_000,
    );
    this.#policy = validateCollectiveTelemetryPolicyV1(options.policy);
    const store =
      options.store ??
      new InMemoryCollectiveTelemetryStoreV1(
        options.maximumPendingDeliveryReceipts ?? 4_096,
      );
    if (typeof store.load !== "function" || typeof store.save !== "function")
      fail("collective telemetry store is required");
    const commitDelivery =
      typeof store.commitDelivery === "function"
        ? store.commitDelivery.bind(store)
        : undefined;
    const loadDelivery =
      typeof store.loadDelivery === "function"
        ? store.loadDelivery.bind(store)
        : undefined;
    const releaseDelivery =
      typeof store.releaseDelivery === "function"
        ? store.releaseDelivery.bind(store)
        : undefined;
    this.#store = Object.freeze({
      load: store.load.bind(store),
      save: store.save.bind(store),
      ...(commitDelivery ? { commitDelivery } : {}),
      ...(loadDelivery ? { loadDelivery } : {}),
      ...(releaseDelivery ? { releaseDelivery } : {}),
    });
    // Durable handoff paths must not dispatch through the public `load()`
    // method: subclasses and instance monkey patches are not authoritative.
    this.#authoritativeLoad = () => this.#loadInternal();
    collectiveTelemetryRuntimeInvokers.set(
      this,
      Object.freeze({
        record: (input: CollectiveTelemetryRecordInputV1) =>
          this.#recordInternal(input),
      }),
    );
    if (commitDelivery && loadDelivery && releaseDelivery) {
      const handoffDelivery = (input: {
        readonly deliveryDigest: string;
        readonly event: CollectiveTelemetryRecordInputV1;
        readonly deliveryState: "pending" | "recorded";
        readonly markRecorded: () => Promise<boolean>;
        readonly acknowledge: () => Promise<boolean>;
      }) => this.#handoffDeliveryInternal(input);
      collectiveTelemetryDurableRuntimeInvokers.set(this, {
        handoffDelivery,
      });
    }
  }

  async initialize(logicalTimeMs = 0): Promise<CollectiveTelemetryStateV1> {
    await this.#verifyPolicy();
    integer(logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
    const state = await createState(
      {
        schemaVersion: 1,
        streamId: this.#options.streamId,
        tenantId: this.#options.tenantId,
        collectiveId: this.#options.collectiveId,
        peerId: this.#options.authenticity.peerId,
        instanceId: this.#options.authenticity.instanceId,
        keyId: this.#options.authenticity.keyId,
        policyDigest: this.#policy.policyDigest,
        revision: 0,
        sequence: 0,
        chainHeadDigest: null,
        retainedFromSequence: 1,
        events: [],
        logicalTimeHighWaterMs: logicalTimeMs,
        previousStateDigest: null,
      },
      this.#options.crypto,
    );
    if ((await this.#store.save(state, null, null)) !== true)
      fail("collective telemetry stream already initialized");
    await this.#advanceAnchor(state, null);
    return state;
  }

  async record(
    input: CollectiveTelemetryRecordInputV1,
  ): Promise<CollectiveTelemetryEventV1> {
    return invokeCollectiveTelemetryRecordV1(this, input);
  }

  async #recordInternal(
    input: CollectiveTelemetryRecordInputV1,
  ): Promise<CollectiveTelemetryEventV1> {
    const recordInput = immutable(input);
    await this.#verifyPolicy();
    validateRecordInput(recordInput, this.#policy, true);
    for (
      let attempt = 0;
      attempt < this.#policy.maximumCommitAttempts;
      attempt += 1
    ) {
      const current = await this.#authoritativeLoad();
      if (recordInput.logicalTimeMs < current.logicalTimeHighWaterMs)
        fail("collective telemetry logical time rollback");
      const eventBody = {
        schemaVersion: 1 as const,
        streamId: current.streamId,
        tenantId: current.tenantId,
        collectiveId: current.collectiveId,
        peerId: current.peerId,
        instanceId: current.instanceId,
        keyId: current.keyId,
        sequence: current.sequence + 1,
        category: recordInput.category,
        operation: recordInput.operation,
        outcome: recordInput.outcome,
        logicalTimeMs: recordInput.logicalTimeMs,
        operationDigest: recordInput.operationDigest,
        policyDigest: current.policyDigest,
        evidenceDigests: canonicalDigests(
          recordInput.evidenceDigests ?? [],
          "evidenceDigests",
        ),
        metrics: canonicalMetrics(recordInput.metrics ?? [], this.#policy),
        ...(recordInput.correlation
          ? { correlation: canonicalCorrelation(recordInput.correlation) }
          : {}),
        previousEventDigest: current.chainHeadDigest,
      };
      const eventDigest = await telemetryDigest(
        "collective-telemetry-event-v1",
        eventBody,
        this.#options.crypto,
      );
      const signature = await this.#options.authenticity.sign(eventDigest);
      token(signature, "signature", 16_384);
      if (
        (await this.#options.authenticity.verify({
          peerId: current.peerId,
          instanceId: current.instanceId,
          keyId: current.keyId,
          messageDigest: eventDigest,
          signature,
        })) !== true
      )
        fail("collective telemetry signature was not verifiable");
      const event = immutable({
        ...eventBody,
        eventId: `telemetry:${eventDigest.slice(7, 47)}`,
        eventDigest,
        signature,
      });
      const retained = [...current.events, event].slice(
        -this.#policy.maximumRetainedEvents,
      );
      const next = await createState(
        {
          ...current,
          revision: current.revision + 1,
          sequence: event.sequence,
          chainHeadDigest: event.eventDigest,
          retainedFromSequence: retained[0]?.sequence ?? event.sequence + 1,
          events: retained,
          logicalTimeHighWaterMs: recordInput.logicalTimeMs,
          previousStateDigest: current.stateDigest,
        },
        this.#options.crypto,
      );
      if (
        (await this.#store.save(
          next,
          current.revision,
          current.stateDigest,
        )) === true
      ) {
        await this.#advanceAnchor(next, this.#anchor(current));
        return event;
      }
    }
    fail("collective telemetry commit attempts exhausted");
  }

  /** Enforces record -> source mark -> receipt release -> source ACK. */
  async #handoffDeliveryInternal(input: {
    readonly deliveryDigest: string;
    readonly event: CollectiveTelemetryRecordInputV1;
    readonly deliveryState: "pending" | "recorded";
    readonly markRecorded: () => Promise<boolean>;
    readonly acknowledge: () => Promise<boolean>;
  }): Promise<boolean> {
    const deliveryState = input.deliveryState;
    const deliveryDigest = input.deliveryDigest;
    const event = immutable(input.event);
    const markRecorded = input.markRecorded;
    const acknowledge = input.acknowledge;
    if (typeof markRecorded !== "function" || typeof acknowledge !== "function")
      fail("collective telemetry delivery callbacks are invalid");
    if (deliveryState !== "pending" && deliveryState !== "recorded")
      fail("collective telemetry delivery state is invalid");
    if (deliveryState === "pending")
      await this.#recordDeliveryInternal({ deliveryDigest, event });
    // Reconfirm the source state even on restart before receipt release. The
    // source mark operation is idempotent and is the only phase gate.
    if ((await markRecorded()) !== true)
      fail("collective telemetry source recorded handoff conflict");
    await this.#releaseDeliveryInternal(deliveryDigest);
    return (await acknowledge()) === true;
  }

  /** Atomically records signed event plus a short-lived nominal receipt. */
  async #recordDeliveryInternal(input: {
    readonly deliveryDigest: string;
    readonly event: CollectiveTelemetryRecordInputV1;
  }): Promise<void> {
    const deliveryDigest = input.deliveryDigest;
    const recordInput = immutable(input.event);
    await this.#verifyPolicy();
    if (!collectiveTelemetryDurableRuntimeInvokers.has(this))
      fail("collective telemetry durable delivery store is required");
    digest(deliveryDigest, "deliveryDigest");
    validateRecordInput(recordInput, this.#policy, true);
    const normalized = {
      category: recordInput.category,
      operation: recordInput.operation,
      outcome: recordInput.outcome,
      logicalTimeMs: recordInput.logicalTimeMs,
      operationDigest: recordInput.operationDigest,
      evidenceDigests: canonicalDigests(
        recordInput.evidenceDigests ?? [],
        "evidenceDigests",
      ),
      metrics: canonicalMetrics(recordInput.metrics ?? [], this.#policy),
      ...(recordInput.correlation
        ? { correlation: canonicalCorrelation(recordInput.correlation) }
        : {}),
    };
    const recordInputDigest = await telemetryDigest(
      "collective-telemetry-delivery-input-v1",
      {
        streamId: this.#options.streamId,
        deliveryDigest,
        event: normalized,
      },
      this.#options.crypto,
    );
    const existing = await this.#store.loadDelivery!(
      this.#options.streamId,
      deliveryDigest,
    );
    if (existing) {
      if (existing.recordInputDigest !== recordInputDigest)
        fail("collective telemetry delivery digest collision");
      await this.#verifyDeliveryReceipt(deliveryDigest, recordInputDigest);
      return;
    }
    for (
      let attempt = 0;
      attempt < this.#policy.maximumCommitAttempts;
      attempt += 1
    ) {
      const current = await this.#authoritativeLoad();
      if (normalized.logicalTimeMs < current.logicalTimeHighWaterMs)
        fail("collective telemetry logical time rollback");
      const eventBody = {
        schemaVersion: 1 as const,
        streamId: current.streamId,
        tenantId: current.tenantId,
        collectiveId: current.collectiveId,
        peerId: current.peerId,
        instanceId: current.instanceId,
        keyId: current.keyId,
        sequence: current.sequence + 1,
        ...normalized,
        policyDigest: current.policyDigest,
        previousEventDigest: current.chainHeadDigest,
      };
      const eventDigest = await telemetryDigest(
        "collective-telemetry-event-v1",
        eventBody,
        this.#options.crypto,
      );
      const signature = await this.#options.authenticity.sign(eventDigest);
      token(signature, "signature", 16_384);
      if (
        (await this.#options.authenticity.verify({
          peerId: current.peerId,
          instanceId: current.instanceId,
          keyId: current.keyId,
          messageDigest: eventDigest,
          signature,
        })) !== true
      )
        fail("collective telemetry signature was not verifiable");
      const event = immutable({
        ...eventBody,
        eventId: `telemetry:${eventDigest.slice(7, 47)}`,
        eventDigest,
        signature,
      });
      const retained = [...current.events, event].slice(
        -this.#policy.maximumRetainedEvents,
      );
      const next = await createState(
        {
          ...current,
          revision: current.revision + 1,
          sequence: event.sequence,
          chainHeadDigest: event.eventDigest,
          retainedFromSequence: retained[0]?.sequence ?? event.sequence + 1,
          events: retained,
          logicalTimeHighWaterMs: normalized.logicalTimeMs,
          previousStateDigest: current.stateDigest,
        },
        this.#options.crypto,
      );
      const receipt = immutable({
        schemaVersion: 1 as const,
        streamId: current.streamId,
        deliveryDigest,
        recordInputDigest,
        eventDigest: event.eventDigest,
        sequence: event.sequence,
      });
      const result = await this.#store.commitDelivery!({
        state: next,
        expectedRevision: current.revision,
        expectedStateDigest: current.stateDigest,
        receipt,
      });
      if (result === "already_recorded") {
        await this.#verifyDeliveryReceipt(deliveryDigest, recordInputDigest);
        return;
      }
      if (result === "committed") {
        await this.#advanceAnchor(next, this.#anchor(current));
        return;
      }
    }
    fail("collective telemetry delivery commit attempts exhausted");
  }

  /** Releases only inside the module-owned handoff after a durable mark. */
  async #releaseDeliveryInternal(deliveryDigest: string): Promise<void> {
    if (!collectiveTelemetryDurableRuntimeInvokers.has(this))
      fail("collective telemetry durable delivery store is required");
    digest(deliveryDigest, "deliveryDigest");
    const receipt = await this.#store.loadDelivery!(
      this.#options.streamId,
      deliveryDigest,
    );
    if (receipt) await this.#verifyDeliveryReceipt(deliveryDigest);
    else await this.#authoritativeLoad();
    if (
      (await this.#store.releaseDelivery!(
        this.#options.streamId,
        deliveryDigest,
      )) !== true
    )
      fail("collective telemetry delivery receipt release failed");
  }

  async load(): Promise<CollectiveTelemetryStateV1> {
    return this.#authoritativeLoad();
  }

  async #loadInternal(): Promise<CollectiveTelemetryStateV1> {
    await this.#verifyPolicy();
    const state = await this.#store.load(this.#options.streamId);
    if (!state) fail("collective telemetry stream is not initialized");
    const validated = await this.#validateRuntimeState(state);
    const anchor = await this.#options.monotonicAnchor.load(
      this.#options.anchorKey,
    );
    if (!anchor) {
      if (validated.revision !== 0)
        fail("collective telemetry monotonic anchor is unavailable");
      await this.#advanceAnchor(validated, null);
      return validated;
    }
    validateAnchor(anchor);
    if (
      anchor.revision === validated.revision &&
      anchor.sequence === validated.sequence &&
      anchor.stateDigest === validated.stateDigest &&
      anchor.logicalTimeHighWaterMs === validated.logicalTimeHighWaterMs
    )
      return validated;
    if (
      validated.revision !== anchor.revision + 1 ||
      validated.sequence !== anchor.sequence + 1 ||
      validated.previousStateDigest !== anchor.stateDigest ||
      validated.logicalTimeHighWaterMs < anchor.logicalTimeHighWaterMs
    )
      fail("collective telemetry state rollback or fork detected");
    await this.#advanceAnchor(validated, anchor);
    return validated;
  }

  async exportEvidence(input: {
    readonly fromSequence?: number;
    readonly exportedAtLogicalMs: number;
  }): Promise<CollectiveTelemetryEvidenceBundleV1> {
    const state = await this.#authoritativeLoad();
    integer(
      input.exportedAtLogicalMs,
      "exportedAtLogicalMs",
      state.logicalTimeHighWaterMs,
      Number.MAX_SAFE_INTEGER,
    );
    const fromSequence = input.fromSequence ?? state.retainedFromSequence;
    integer(
      fromSequence,
      "fromSequence",
      state.retainedFromSequence,
      state.sequence + 1,
    );
    const events = state.events.filter(
      (event) => event.sequence >= fromSequence,
    );
    const countMap = new Map<string, number>();
    for (const event of events) {
      const key = `${event.category}:${event.outcome}`;
      countMap.set(key, (countMap.get(key) ?? 0) + 1);
    }
    const counts = [...countMap]
      .sort(([left], [right]) => compareCodeUnits(left, right))
      .map(([key, count]) => {
        const [category, outcome] = key.split(":") as [
          CollectiveTelemetryCategoryV1,
          CollectiveTelemetryOutcomeV1,
        ];
        return immutable({ category, outcome, count });
      });
    const body = {
      schemaVersion: 1 as const,
      streamId: state.streamId,
      tenantId: state.tenantId,
      collectiveId: state.collectiveId,
      peerId: state.peerId,
      instanceId: state.instanceId,
      keyId: state.keyId,
      policyDigest: state.policyDigest,
      fromSequence,
      throughSequence: events.at(-1)?.sequence ?? fromSequence - 1,
      priorEventDigest:
        events.length > 0
          ? events[0].previousEventDigest
          : state.chainHeadDigest,
      chainHeadDigest: events.at(-1)?.eventDigest ?? state.chainHeadDigest,
      events,
      counts,
      exportedAtLogicalMs: input.exportedAtLogicalMs,
    };
    return immutable({
      ...body,
      bundleDigest: await telemetryDigest(
        "collective-telemetry-bundle-v1",
        body,
        this.#options.crypto,
      ),
    });
  }

  #verifyPolicy(): Promise<CollectiveTelemetryPolicyV1> {
    this.#verifiedPolicy ??= verifyCollectiveTelemetryPolicyV1(
      this.#policy,
      this.#options.crypto,
    );
    return this.#verifiedPolicy;
  }

  #anchor(state: CollectiveTelemetryStateV1): CollectiveTelemetryAnchorV1 {
    return immutable({
      revision: state.revision,
      sequence: state.sequence,
      stateDigest: state.stateDigest,
      logicalTimeHighWaterMs: state.logicalTimeHighWaterMs,
    });
  }

  async #advanceAnchor(
    state: CollectiveTelemetryStateV1,
    prior: CollectiveTelemetryAnchorV1 | null,
  ): Promise<void> {
    const next = this.#anchor(state);
    if (
      (await this.#options.monotonicAnchor.save({
        anchorKey: this.#options.anchorKey,
        anchor: next,
        expectedRevision: prior?.revision ?? null,
        expectedStateDigest: prior?.stateDigest ?? null,
      })) === true
    )
      return;
    const current = await this.#options.monotonicAnchor.load(
      this.#options.anchorKey,
    );
    if (
      current &&
      current.revision === next.revision &&
      current.sequence === next.sequence &&
      current.stateDigest === next.stateDigest &&
      current.logicalTimeHighWaterMs === next.logicalTimeHighWaterMs
    )
      return;
    if (current) {
      validateAnchor(current);
      const persisted = await this.#store.load(this.#options.streamId);
      if (persisted) {
        const successor = await this.#validateRuntimeState(persisted);
        if (
          current.revision === successor.revision &&
          current.sequence === successor.sequence &&
          current.stateDigest === successor.stateDigest &&
          current.logicalTimeHighWaterMs === successor.logicalTimeHighWaterMs &&
          successor.revision === state.revision + 1 &&
          successor.sequence === state.sequence + 1 &&
          successor.previousStateDigest === state.stateDigest &&
          successor.logicalTimeHighWaterMs >= state.logicalTimeHighWaterMs
        )
          return;
      }
    }
    fail("collective telemetry monotonic anchor update failed");
  }

  async #validateRuntimeState(
    state: CollectiveTelemetryStateV1,
  ): Promise<CollectiveTelemetryStateV1> {
    const validated = await validateCollectiveTelemetryStateV1({
      state,
      policy: this.#policy,
      authenticity: this.#options.authenticity,
      crypto: this.#options.crypto,
    });
    if (
      validated.streamId !== this.#options.streamId ||
      validated.tenantId !== this.#options.tenantId ||
      validated.collectiveId !== this.#options.collectiveId ||
      validated.peerId !== this.#options.authenticity.peerId ||
      validated.instanceId !== this.#options.authenticity.instanceId ||
      validated.keyId !== this.#options.authenticity.keyId ||
      validated.policyDigest !== this.#policy.policyDigest
    )
      fail("collective telemetry runtime binding changed");
    return validated;
  }

  async #verifyDeliveryReceipt(
    deliveryDigest: string,
    recordInputDigest?: string,
  ): Promise<void> {
    const receipt = await this.#store.loadDelivery!(
      this.#options.streamId,
      deliveryDigest,
    );
    if (
      !receipt ||
      receipt.schemaVersion !== 1 ||
      receipt.streamId !== this.#options.streamId ||
      receipt.deliveryDigest !== deliveryDigest ||
      (recordInputDigest !== undefined &&
        receipt.recordInputDigest !== recordInputDigest)
    )
      fail("collective telemetry delivery receipt binding is invalid");
    digest(receipt.recordInputDigest, "deliveryReceipt.recordInputDigest");
    digest(receipt.eventDigest, "deliveryReceipt.eventDigest");
    integer(
      receipt.sequence,
      "deliveryReceipt.sequence",
      1,
      Number.MAX_SAFE_INTEGER,
    );
    const state = await this.#authoritativeLoad();
    if (receipt.sequence > state.sequence)
      fail("collective telemetry delivery receipt is ahead of stream state");
    if (receipt.sequence >= state.retainedFromSequence) {
      const event = state.events.find(
        (candidate) => candidate.sequence === receipt.sequence,
      );
      if (!event || event.eventDigest !== receipt.eventDigest)
        fail("collective telemetry delivery receipt event binding is invalid");
    }
  }
}

/**
 * Invokes the construction-time record capability of a genuine runtime.
 * Prototype and instance replacement cannot redirect the signed stream.
 */
export function invokeCollectiveTelemetryRecordV1(
  runtime: CollectiveTelemetryRuntimeV1,
  input: CollectiveTelemetryRecordInputV1,
): Promise<CollectiveTelemetryEventV1> {
  const invoker = collectiveTelemetryRuntimeInvokers.get(runtime);
  if (!invoker) fail("nominal collective telemetry runtime is required");
  return invoker.record(input);
}

export function isCollectiveTelemetryDurableRuntimeV1(
  runtime: unknown,
): runtime is CollectiveTelemetryRuntimeV1 {
  return Boolean(
    runtime && collectiveTelemetryDurableRuntimeInvokers.has(runtime as object),
  );
}

/** Reads the construction-time scope/signer identity only for a nominal runtime. */
export function inspectCollectiveTelemetryRuntimeIdentityV1(
  runtime: unknown,
): CollectiveTelemetryRuntimeIdentityV1 | null {
  return runtime && typeof runtime === "object"
    ? (collectiveTelemetryRuntimeIdentities.get(runtime) ?? null)
    : null;
}

/**
 * Claims the runtime's only durable host bridge. A second claim fails closed,
 * so retaining the runtime cannot recreate a raw delivery handoff after the
 * host adapter has captured this capability.
 */
export function claimCollectiveTelemetryDeliveryHandoffV1(
  runtime: CollectiveTelemetryRuntimeV1,
): (input: {
  readonly deliveryDigest: string;
  readonly event: CollectiveTelemetryRecordInputV1;
  readonly deliveryState: "pending" | "recorded";
  readonly markRecorded: () => Promise<boolean>;
  readonly acknowledge: () => Promise<boolean>;
}) => Promise<boolean> {
  const invokers = collectiveTelemetryDurableRuntimeInvokers.get(runtime);
  if (!invokers)
    fail("nominal collective telemetry durable runtime is required");
  if (claimedCollectiveTelemetryDurableRuntimes.has(runtime))
    fail("collective telemetry durable runtime bridge is already claimed");
  claimedCollectiveTelemetryDurableRuntimes.add(runtime);
  const handoff = invokers.handoffDelivery;
  return (input) => handoff(input);
}

export async function createCollectiveTelemetryPolicyV1(
  input: Omit<CollectiveTelemetryPolicyV1, "policyDigest">,
  crypto?: Crypto,
): Promise<CollectiveTelemetryPolicyV1> {
  validatePolicyBody(input);
  const body = immutable(input);
  return immutable({
    ...body,
    policyDigest: await telemetryDigest(
      "collective-telemetry-policy-v1",
      body,
      crypto,
    ),
  });
}

export function validateCollectiveTelemetryPolicyV1(
  input: CollectiveTelemetryPolicyV1,
): CollectiveTelemetryPolicyV1 {
  validatePolicyBody(input);
  digest(input.policyDigest, "policyDigest");
  return immutable(input);
}

export async function verifyCollectiveTelemetryPolicyV1(
  input: CollectiveTelemetryPolicyV1,
  crypto?: Crypto,
): Promise<CollectiveTelemetryPolicyV1> {
  const snapshot = immutable(input);
  const capturedCrypto = captureCrypto(crypto);
  const { policyDigest, ...body } = snapshot;
  const rebuilt = await createCollectiveTelemetryPolicyV1(body, capturedCrypto);
  if (rebuilt.policyDigest !== policyDigest)
    fail("collective telemetry policy digest is invalid");
  return rebuilt;
}

export async function verifyCollectiveTelemetryEvidenceBundleV1(input: {
  readonly bundle: CollectiveTelemetryEvidenceBundleV1;
  readonly policy: CollectiveTelemetryPolicyV1;
  readonly authenticity: CollectiveTelemetryAuthenticityPortV1;
  readonly crypto?: Crypto;
}): Promise<CollectiveTelemetryEvidenceBundleV1> {
  const bundle = immutable(input.bundle);
  const policy = immutable(input.policy);
  const crypto = captureCrypto(input.crypto);
  const sign = input.authenticity?.sign;
  const verify = input.authenticity?.verify;
  if (typeof sign !== "function" || typeof verify !== "function")
    fail("collective telemetry authenticity verifier is invalid");
  const authenticity: CollectiveTelemetryAuthenticityPortV1 = Object.freeze({
    peerId: input.authenticity.peerId,
    instanceId: input.authenticity.instanceId,
    keyId: input.authenticity.keyId,
    sign: sign.bind(input.authenticity),
    verify: verify.bind(input.authenticity),
  });
  await verifyCollectiveTelemetryPolicyV1(policy, crypto);
  if (!bundle || bundle.schemaVersion !== 1)
    fail("collective telemetry bundle schema is invalid");
  assertExactKeys(
    bundle,
    [
      "schemaVersion",
      "streamId",
      "tenantId",
      "collectiveId",
      "peerId",
      "instanceId",
      "keyId",
      "policyDigest",
      "fromSequence",
      "throughSequence",
      "priorEventDigest",
      "chainHeadDigest",
      "events",
      "counts",
      "exportedAtLogicalMs",
      "bundleDigest",
    ],
    [],
    "collective telemetry bundle",
  );
  identifier(bundle.streamId, "bundle.streamId");
  identifier(bundle.tenantId, "bundle.tenantId");
  identifier(bundle.collectiveId, "bundle.collectiveId");
  identifier(bundle.peerId, "bundle.peerId");
  identifier(bundle.instanceId, "bundle.instanceId");
  identifier(bundle.keyId, "bundle.keyId");
  if (
    bundle.peerId !== authenticity.peerId ||
    bundle.instanceId !== authenticity.instanceId ||
    bundle.keyId !== authenticity.keyId
  )
    fail("collective telemetry bundle signer binding changed");
  if (bundle.policyDigest !== policy.policyDigest)
    fail("collective telemetry bundle policy binding changed");
  integer(
    bundle.fromSequence,
    "bundle.fromSequence",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  integer(
    bundle.throughSequence,
    "bundle.throughSequence",
    bundle.fromSequence - 1,
    Number.MAX_SAFE_INTEGER,
  );
  integer(
    bundle.exportedAtLogicalMs,
    "bundle.exportedAtLogicalMs",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  if (bundle.priorEventDigest !== null)
    digest(bundle.priorEventDigest, "bundle.priorEventDigest");
  if (bundle.chainHeadDigest !== null)
    digest(bundle.chainHeadDigest, "bundle.chainHeadDigest");
  if (
    !Array.isArray(bundle.events) ||
    bundle.events.length > policy.maximumRetainedEvents ||
    !Array.isArray(bundle.counts) ||
    bundle.counts.length > policy.maximumRetainedEvents
  )
    fail("collective telemetry bundle capacity is invalid");
  let previousDigest = bundle.priorEventDigest;
  let expectedSequence = bundle.fromSequence;
  for (const event of bundle.events) {
    await validateEvent(event, policy, authenticity, crypto);
    if (
      event.streamId !== bundle.streamId ||
      event.tenantId !== bundle.tenantId ||
      event.collectiveId !== bundle.collectiveId ||
      event.peerId !== bundle.peerId ||
      event.instanceId !== bundle.instanceId ||
      event.keyId !== bundle.keyId ||
      event.policyDigest !== bundle.policyDigest ||
      event.sequence !== expectedSequence ||
      event.previousEventDigest !== previousDigest ||
      event.logicalTimeMs > bundle.exportedAtLogicalMs
    )
      fail("collective telemetry bundle event chain is invalid");
    previousDigest = event.eventDigest;
    expectedSequence += 1;
  }
  if (
    bundle.events.length === 0
      ? bundle.throughSequence !== bundle.fromSequence - 1 ||
        bundle.chainHeadDigest !== bundle.priorEventDigest
      : bundle.throughSequence !== expectedSequence - 1 ||
        bundle.chainHeadDigest !== previousDigest
  )
    fail("collective telemetry bundle range is invalid");
  const counts = bundleCounts(bundle.events);
  for (const count of bundle.counts)
    assertExactKeys(
      count,
      ["category", "outcome", "count"],
      [],
      "collective telemetry bundle count",
    );
  if (canonicalJson(counts) !== canonicalJson(bundle.counts))
    fail("collective telemetry bundle counts are invalid");
  const { bundleDigest, ...body } = bundle;
  digest(bundleDigest, "bundle.bundleDigest");
  if (
    (await telemetryDigest("collective-telemetry-bundle-v1", body, crypto)) !==
    bundleDigest
  )
    fail("collective telemetry bundle digest is invalid");
  return immutable(bundle);
}

export interface CollectiveTelemetryCausalReplayV1 {
  readonly schemaVersion: 1;
  readonly tenantId: string;
  readonly collectiveId: string;
  readonly missionId: string;
  readonly cycleId: string | null;
  readonly decisionId: string | null;
  readonly effectId: string | null;
  readonly sourceBundleDigests: readonly string[];
  readonly fromLogicalTimeMs: number | null;
  readonly throughLogicalTimeMs: number | null;
  readonly events: readonly CollectiveTelemetryEventV1[];
  readonly counts: readonly {
    readonly category: CollectiveTelemetryCategoryV1;
    readonly outcome: CollectiveTelemetryOutcomeV1;
    readonly count: number;
  }[];
  readonly metricTotals: readonly CollectiveTelemetryMetricV1[];
  readonly replayDigest: string;
}

export const COLLECTIVE_TELEMETRY_REPLAY_LIMITS_V1 = Object.freeze({
  maximumSources: 128,
  maximumAggregateEvents: 4_096,
  maximumAggregateCounts: 4_096,
  maximumAggregateEvidenceDigests: 65_536,
  maximumAggregateMetrics: 32_768,
  maximumAggregatePolicyMetricKeys: 32_768,
  maximumDataNodes: 262_144,
  maximumDataDepth: 32,
  maximumStringCodeUnits: 32 * 1_024 * 1_024,
});

/** Verifies every source stream before constructing a deterministic replay. */
export async function createCollectiveTelemetryCausalReplayV1(input: {
  readonly tenantId: string;
  readonly collectiveId: string;
  readonly missionId: string;
  readonly cycleId?: string;
  readonly decisionId?: string;
  readonly effectId?: string;
  readonly sources: readonly {
    readonly bundle: CollectiveTelemetryEvidenceBundleV1;
    readonly policy: CollectiveTelemetryPolicyV1;
    readonly authenticity: CollectiveTelemetryAuthenticityPortV1;
  }[];
  readonly crypto?: Crypto;
}): Promise<CollectiveTelemetryCausalReplayV1> {
  const tenantId = input.tenantId;
  const collectiveId = input.collectiveId;
  const crypto = captureCrypto(input.crypto);
  identifier(tenantId, "tenantId");
  identifier(collectiveId, "collectiveId");
  const selection = canonicalCorrelation({
    missionId: input.missionId,
    ...(input.cycleId === undefined ? {} : { cycleId: input.cycleId }),
    ...(input.decisionId === undefined ? {} : { decisionId: input.decisionId }),
    ...(input.effectId === undefined ? {} : { effectId: input.effectId }),
  });
  if (!Array.isArray(input.sources))
    fail("collective telemetry replay requires source bundles");
  const sourceCount = input.sources.length;
  if (
    sourceCount < 1 ||
    sourceCount > COLLECTIVE_TELEMETRY_REPLAY_LIMITS_V1.maximumSources
  )
    fail("collective telemetry replay requires source bundles");
  const snapshotBudget = { nodes: 0, stringCodeUnits: 0 };
  const sources = Array.from({ length: sourceCount }, (_, index) => {
    if (!Object.prototype.hasOwnProperty.call(input.sources, index))
      fail("collective telemetry replay source array is sparse");
    const source = input.sources[index];
    if (!source || typeof source !== "object")
      fail("collective telemetry replay source is invalid");
    const authenticity = source.authenticity;
    const sign = authenticity?.sign;
    const verify = authenticity?.verify;
    if (typeof sign !== "function" || typeof verify !== "function")
      fail("collective telemetry authenticity verifier is invalid");
    return Object.freeze({
      bundle: snapshotCollectiveTelemetryReplayData(
        source.bundle,
        snapshotBudget,
      ) as CollectiveTelemetryEvidenceBundleV1,
      policy: snapshotCollectiveTelemetryReplayData(
        source.policy,
        snapshotBudget,
      ) as CollectiveTelemetryPolicyV1,
      authenticity: Object.freeze({
        peerId: authenticity.peerId,
        instanceId: authenticity.instanceId,
        keyId: authenticity.keyId,
        sign: sign.bind(authenticity),
        verify: verify.bind(authenticity),
      }),
    });
  });
  preflightCollectiveTelemetryReplaySources(sources);
  const bundles = await Promise.all(
    sources.map((source) =>
      verifyCollectiveTelemetryEvidenceBundleV1({
        ...source,
        crypto,
      }),
    ),
  );
  const byCoordinate = new Map<string, CollectiveTelemetryEventV1>();
  for (const event of bundles.flatMap(({ events }) => events)) {
    if (event.tenantId !== tenantId || event.collectiveId !== collectiveId)
      fail("collective telemetry replay source scope changed");
    const coordinate = `${event.streamId}\u0000${event.sequence}`;
    const previous = byCoordinate.get(coordinate);
    if (previous && previous.eventDigest !== event.eventDigest)
      fail("collective telemetry replay contains a stream fork");
    byCoordinate.set(coordinate, event);
  }
  for (const bundle of bundles)
    if (bundle.tenantId !== tenantId || bundle.collectiveId !== collectiveId)
      fail("collective telemetry replay source scope changed");
  validateReplayStreamContinuity(bundles, byCoordinate);
  const events = [...byCoordinate.values()]
    .filter(({ correlation }) =>
      Boolean(
        correlation &&
        correlation.missionId === selection.missionId &&
        (selection.cycleId === undefined ||
          correlation.cycleId === selection.cycleId) &&
        (selection.decisionId === undefined ||
          correlation.decisionId === selection.decisionId) &&
        (selection.effectId === undefined ||
          correlation.effectId === selection.effectId),
      ),
    )
    .sort(
      (left, right) =>
        left.logicalTimeMs - right.logicalTimeMs ||
        compareCodeUnits(left.streamId, right.streamId) ||
        left.sequence - right.sequence,
    );
  const metricTotals = new Map<string, number>();
  for (const event of events)
    for (const metric of event.metrics) {
      const total = (metricTotals.get(metric.key) ?? 0) + metric.value;
      if (!Number.isSafeInteger(total))
        fail("collective telemetry replay metric overflow");
      metricTotals.set(metric.key, total);
    }
  const body = {
    schemaVersion: 1 as const,
    tenantId,
    collectiveId,
    missionId: selection.missionId,
    cycleId: selection.cycleId ?? null,
    decisionId: selection.decisionId ?? null,
    effectId: selection.effectId ?? null,
    sourceBundleDigests: [
      ...new Set(bundles.map(({ bundleDigest }) => bundleDigest)),
    ].sort(),
    fromLogicalTimeMs: events.at(0)?.logicalTimeMs ?? null,
    throughLogicalTimeMs: events.at(-1)?.logicalTimeMs ?? null,
    events,
    counts: bundleCounts(events),
    metricTotals: [...metricTotals]
      .sort(([left], [right]) => compareCodeUnits(left, right))
      .map(([key, value]) => immutable({ key, value })),
  };
  return immutable({
    ...body,
    replayDigest: await telemetryDigest(
      "collective-telemetry-causal-replay-v1",
      body,
      crypto,
    ),
  });
}

function preflightCollectiveTelemetryReplaySources(
  sources: readonly {
    readonly bundle: CollectiveTelemetryEvidenceBundleV1;
    readonly policy: CollectiveTelemetryPolicyV1;
  }[],
): void {
  let aggregateEvents = 0;
  let aggregateCounts = 0;
  let aggregateEvidenceDigests = 0;
  let aggregateMetrics = 0;
  let aggregatePolicyMetricKeys = 0;
  for (const source of sources) {
    if (
      !source?.bundle ||
      !Array.isArray(source.bundle.events) ||
      !Array.isArray(source.bundle.counts) ||
      !source.policy ||
      !Array.isArray(source.policy.allowedMetricKeys)
    )
      fail("collective telemetry replay source capacity is invalid");
    aggregateEvents += source.bundle.events.length;
    aggregateCounts += source.bundle.counts.length;
    aggregatePolicyMetricKeys += source.policy.allowedMetricKeys.length;
    if (
      aggregateEvents >
        COLLECTIVE_TELEMETRY_REPLAY_LIMITS_V1.maximumAggregateEvents ||
      aggregateCounts >
        COLLECTIVE_TELEMETRY_REPLAY_LIMITS_V1.maximumAggregateCounts ||
      aggregatePolicyMetricKeys >
        COLLECTIVE_TELEMETRY_REPLAY_LIMITS_V1.maximumAggregatePolicyMetricKeys
    )
      fail("collective telemetry replay source capacity is invalid");
    for (const event of source.bundle.events) {
      if (
        !event ||
        !Array.isArray(event.evidenceDigests) ||
        !Array.isArray(event.metrics)
      )
        fail("collective telemetry replay event capacity is invalid");
      aggregateEvidenceDigests += event.evidenceDigests.length;
      aggregateMetrics += event.metrics.length;
      if (
        aggregateEvidenceDigests >
          COLLECTIVE_TELEMETRY_REPLAY_LIMITS_V1.maximumAggregateEvidenceDigests ||
        aggregateMetrics >
          COLLECTIVE_TELEMETRY_REPLAY_LIMITS_V1.maximumAggregateMetrics
      )
        fail("collective telemetry replay event capacity is invalid");
    }
  }
}

function snapshotCollectiveTelemetryReplayData(
  root: unknown,
  budget: { nodes: number; stringCodeUnits: number },
): unknown {
  const visiting = new WeakSet<object>();
  const clone = (value: unknown, depth: number): unknown => {
    budget.nodes += 1;
    if (
      budget.nodes > COLLECTIVE_TELEMETRY_REPLAY_LIMITS_V1.maximumDataNodes ||
      depth > COLLECTIVE_TELEMETRY_REPLAY_LIMITS_V1.maximumDataDepth
    )
      fail("collective telemetry replay data capacity is invalid");
    if (typeof value === "string") {
      budget.stringCodeUnits += value.length;
      if (
        budget.stringCodeUnits >
        COLLECTIVE_TELEMETRY_REPLAY_LIMITS_V1.maximumStringCodeUnits
      )
        fail("collective telemetry replay data capacity is invalid");
      return value;
    }
    if (
      value === null ||
      typeof value === "number" ||
      typeof value === "boolean"
    )
      return value;
    if (!value || typeof value !== "object")
      fail("collective telemetry replay data is invalid");
    if (visiting.has(value)) fail("collective telemetry replay data is cyclic");
    visiting.add(value);
    if (
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) !== Object.prototype
    )
      fail("collective telemetry replay data is invalid");
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== "string"))
      fail("collective telemetry replay data is invalid");
    const keys = Object.keys(value);
    if (
      Array.isArray(value)
        ? keys.length !== value.length ||
          keys.some((key, index) => key !== String(index)) ||
          ownKeys.length !== value.length + 1 ||
          !ownKeys.includes("length")
        : keys.length !== ownKeys.length
    )
      fail("collective telemetry replay data shape is invalid");
    const result: unknown[] | Record<string, unknown> = Array.isArray(value)
      ? new Array(value.length)
      : {};
    for (const key of keys) {
      budget.stringCodeUnits += key.length;
      if (
        budget.stringCodeUnits >
        COLLECTIVE_TELEMETRY_REPLAY_LIMITS_V1.maximumStringCodeUnits
      )
        fail("collective telemetry replay data capacity is invalid");
      Object.defineProperty(result, key, {
        value: clone((value as Record<string, unknown>)[key], depth + 1),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    visiting.delete(value);
    return Object.freeze(result);
  };
  return clone(root, 0);
}

function validateReplayStreamContinuity(
  bundles: readonly CollectiveTelemetryEvidenceBundleV1[],
  byCoordinate: ReadonlyMap<string, CollectiveTelemetryEventV1>,
): void {
  const streamIdentities = new Map<string, string>();
  for (const bundle of bundles) {
    const identity = canonicalJson({
      streamId: bundle.streamId,
      tenantId: bundle.tenantId,
      collectiveId: bundle.collectiveId,
      peerId: bundle.peerId,
      instanceId: bundle.instanceId,
      keyId: bundle.keyId,
      policyDigest: bundle.policyDigest,
    });
    const retained = streamIdentities.get(bundle.streamId);
    if (retained !== undefined && retained !== identity)
      fail("collective telemetry replay stream identity changed");
    streamIdentities.set(bundle.streamId, identity);
  }
  const streamIds = [...new Set(bundles.map(({ streamId }) => streamId))].sort(
    compareCodeUnits,
  );
  for (const streamId of streamIds) {
    const events = [...byCoordinate.values()]
      .filter((event) => event.streamId === streamId)
      .sort((left, right) => left.sequence - right.sequence);
    const identity = events[0];
    if (
      identity &&
      events.some(
        (event) =>
          event.tenantId !== identity.tenantId ||
          event.collectiveId !== identity.collectiveId ||
          event.peerId !== identity.peerId ||
          event.instanceId !== identity.instanceId ||
          event.keyId !== identity.keyId ||
          event.policyDigest !== identity.policyDigest,
      )
    )
      fail("collective telemetry replay stream identity changed");
    for (let index = 1; index < events.length; index += 1) {
      const prior = events[index - 1];
      const current = events[index];
      if (!prior || !current)
        fail("collective telemetry replay stream is invalid");
      if (current.sequence !== prior.sequence + 1)
        fail("collective telemetry replay contains a stream continuity gap");
      if (current.previousEventDigest !== prior.eventDigest)
        fail("collective telemetry replay contains a stream continuity fork");
    }

    const digestBySequence = new Map(
      events.map((event) => [event.sequence, event.eventDigest] as const),
    );
    const streamBundles = bundles.filter(
      (candidate) => candidate.streamId === streamId,
    );
    let emptyCheckpoint: {
      readonly sequence: number;
      readonly digest: string | null;
    } | null = null;
    for (const bundle of streamBundles) {
      const knownPrior = digestBySequence.get(bundle.fromSequence - 1);
      if (knownPrior !== undefined && bundle.priorEventDigest !== knownPrior)
        fail("collective telemetry replay contains a stream continuity fork");
      if (bundle.events.length !== 0) continue;
      const checkpointSequence = bundle.fromSequence - 1;
      if (events.length === 0) {
        if (emptyCheckpoint && emptyCheckpoint.sequence !== checkpointSequence)
          fail("collective telemetry replay contains a stream continuity gap");
        if (
          emptyCheckpoint &&
          emptyCheckpoint.digest !== bundle.priorEventDigest
        )
          fail("collective telemetry replay contains a stream continuity fork");
        emptyCheckpoint = {
          sequence: checkpointSequence,
          digest: bundle.priorEventDigest,
        };
        continue;
      }
      const first = events[0];
      const last = events.at(-1);
      if (!first || !last)
        fail("collective telemetry replay stream is invalid");
      if (checkpointSequence === first.sequence - 1) {
        if (bundle.priorEventDigest !== first.previousEventDigest)
          fail("collective telemetry replay contains a stream continuity fork");
      } else if (
        checkpointSequence < first.sequence ||
        checkpointSequence > last.sequence
      ) {
        fail("collective telemetry replay contains a stream continuity gap");
      }
    }
  }
}

export async function validateCollectiveTelemetryStateV1(input: {
  readonly state: CollectiveTelemetryStateV1;
  readonly policy: CollectiveTelemetryPolicyV1;
  readonly authenticity: CollectiveTelemetryAuthenticityPortV1;
  readonly crypto?: Crypto;
}): Promise<CollectiveTelemetryStateV1> {
  const state = immutable(input.state);
  const policy = immutable(input.policy);
  const crypto = captureCrypto(input.crypto);
  if (
    !input.authenticity ||
    typeof input.authenticity.sign !== "function" ||
    typeof input.authenticity.verify !== "function"
  )
    fail("collective telemetry authenticity verifier is invalid");
  const authenticity = Object.freeze({
    peerId: input.authenticity.peerId,
    instanceId: input.authenticity.instanceId,
    keyId: input.authenticity.keyId,
    sign: input.authenticity.sign.bind(input.authenticity),
    verify: input.authenticity.verify.bind(input.authenticity),
  });
  if (!state || state.schemaVersion !== 1)
    fail("collective telemetry state schema is invalid");
  assertExactKeys(
    state,
    [
      "schemaVersion",
      "streamId",
      "tenantId",
      "collectiveId",
      "peerId",
      "instanceId",
      "keyId",
      "policyDigest",
      "revision",
      "sequence",
      "chainHeadDigest",
      "retainedFromSequence",
      "events",
      "logicalTimeHighWaterMs",
      "previousStateDigest",
      "stateDigest",
    ],
    [],
    "collective telemetry state",
  );
  if (!Array.isArray(state.events))
    fail("collective telemetry state events are invalid");
  if (state.policyDigest !== policy.policyDigest)
    fail("collective telemetry policy binding changed");
  for (const [label, value] of Object.entries({
    streamId: state.streamId,
    tenantId: state.tenantId,
    collectiveId: state.collectiveId,
    peerId: state.peerId,
    instanceId: state.instanceId,
    keyId: state.keyId,
  }))
    identifier(value, label);
  integer(state.revision, "revision", 0, Number.MAX_SAFE_INTEGER);
  integer(state.sequence, "sequence", 0, Number.MAX_SAFE_INTEGER);
  if (state.revision !== state.sequence)
    fail("collective telemetry state revision and sequence differ");
  integer(
    state.retainedFromSequence,
    "retainedFromSequence",
    1,
    state.sequence + 1,
  );
  integer(
    state.logicalTimeHighWaterMs,
    "logicalTimeHighWaterMs",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  if ((state.revision === 0) !== (state.previousStateDigest === null))
    fail("collective telemetry state lineage is invalid");
  if (state.previousStateDigest !== null)
    digest(state.previousStateDigest, "previousStateDigest");
  if (state.chainHeadDigest !== null)
    digest(state.chainHeadDigest, "chainHeadDigest");
  if (state.events.length > policy.maximumRetainedEvents)
    fail("collective telemetry retention is invalid");
  let previous: CollectiveTelemetryEventV1 | null = null;
  for (const event of state.events) {
    await validateEvent(event, policy, authenticity, crypto);
    if (
      event.streamId !== state.streamId ||
      event.tenantId !== state.tenantId ||
      event.collectiveId !== state.collectiveId ||
      event.peerId !== state.peerId ||
      event.instanceId !== state.instanceId ||
      event.keyId !== state.keyId ||
      event.policyDigest !== state.policyDigest ||
      event.logicalTimeMs > state.logicalTimeHighWaterMs ||
      (previous !== null &&
        (event.sequence !== previous.sequence + 1 ||
          event.previousEventDigest !== previous.eventDigest))
    )
      fail("collective telemetry retained chain is invalid");
    previous = event;
  }
  if (
    state.events.length === 0
      ? state.sequence !== 0 ||
        state.retainedFromSequence !== 1 ||
        state.chainHeadDigest !== null
      : state.events[0].sequence !== state.retainedFromSequence ||
        state.events.at(-1)?.sequence !== state.sequence ||
        state.events.at(-1)?.eventDigest !== state.chainHeadDigest
  )
    fail("collective telemetry state head is invalid");
  const { stateDigest, ...body } = state;
  digest(stateDigest, "stateDigest");
  if (
    (await telemetryDigest("collective-telemetry-state-v1", body, crypto)) !==
    stateDigest
  )
    fail("collective telemetry state digest is invalid");
  return immutable(state);
}

async function validateEvent(
  event: CollectiveTelemetryEventV1,
  policy: CollectiveTelemetryPolicyV1,
  authenticity: CollectiveTelemetryAuthenticityPortV1,
  crypto?: Crypto,
): Promise<void> {
  if (!event || event.schemaVersion !== 1)
    fail("collective telemetry event schema is invalid");
  assertExactKeys(
    event,
    [
      "schemaVersion",
      "eventId",
      "streamId",
      "tenantId",
      "collectiveId",
      "peerId",
      "instanceId",
      "keyId",
      "sequence",
      "category",
      "operation",
      "outcome",
      "logicalTimeMs",
      "operationDigest",
      "policyDigest",
      "evidenceDigests",
      "metrics",
      "previousEventDigest",
      "eventDigest",
      "signature",
    ],
    ["correlation"],
    "collective telemetry event",
  );
  identifier(event.eventId, "eventId");
  integer(event.sequence, "sequence", 1, Number.MAX_SAFE_INTEGER);
  validateRecordInput(event, policy);
  if (event.previousEventDigest !== null)
    digest(event.previousEventDigest, "previousEventDigest");
  const { eventId: _eventId, eventDigest, signature, ...body } = event;
  digest(eventDigest, "eventDigest");
  token(signature, "signature", 16_384);
  if (
    event.eventId !== `telemetry:${eventDigest.slice(7, 47)}` ||
    (await telemetryDigest("collective-telemetry-event-v1", body, crypto)) !==
      eventDigest
  )
    fail("collective telemetry event digest is invalid");
  if (
    event.peerId !== authenticity.peerId ||
    event.instanceId !== authenticity.instanceId ||
    event.keyId !== authenticity.keyId
  )
    fail("collective telemetry event signer identity changed");
  if (
    !(await authenticity.verify({
      peerId: event.peerId,
      instanceId: event.instanceId,
      keyId: event.keyId,
      messageDigest: event.eventDigest,
      signature: event.signature,
    }))
  )
    fail("collective telemetry event signature is invalid");
}

function bundleCounts(events: readonly CollectiveTelemetryEventV1[]): readonly {
  readonly category: CollectiveTelemetryCategoryV1;
  readonly outcome: CollectiveTelemetryOutcomeV1;
  readonly count: number;
}[] {
  const values = new Map<string, number>();
  for (const event of events) {
    const key = `${event.category}:${event.outcome}`;
    values.set(key, (values.get(key) ?? 0) + 1);
  }
  return immutable(
    [...values]
      .sort(([left], [right]) => compareCodeUnits(left, right))
      .map(([key, count]) => {
        const [category, outcome] = key.split(":") as [
          CollectiveTelemetryCategoryV1,
          CollectiveTelemetryOutcomeV1,
        ];
        return { category, outcome, count };
      }),
  );
}

async function createState(
  input: Omit<CollectiveTelemetryStateV1, "stateDigest">,
  crypto?: Crypto,
): Promise<CollectiveTelemetryStateV1> {
  const { stateDigest: _stale, ...body } = input as CollectiveTelemetryStateV1;
  return immutable({
    ...body,
    stateDigest: await telemetryDigest(
      "collective-telemetry-state-v1",
      body,
      crypto,
    ),
  });
}

function validatePolicyBody(
  input:
    | Omit<CollectiveTelemetryPolicyV1, "policyDigest">
    | CollectiveTelemetryPolicyV1,
): void {
  assertExactKeys(
    input,
    [
      "schemaVersion",
      "policyId",
      "policyVersion",
      "allowedMetricKeys",
      "maximumEvidenceDigestsPerEvent",
      "maximumMetricsPerEvent",
      "maximumRetainedEvents",
      "maximumCommitAttempts",
    ],
    ["policyDigest"],
    "collective telemetry policy",
  );
  if (input.schemaVersion !== 1)
    fail("collective telemetry policy schema is invalid");
  identifier(input.policyId, "policyId");
  integer(input.policyVersion, "policyVersion", 1, Number.MAX_SAFE_INTEGER);
  canonicalIdentifiers(input.allowedMetricKeys, "allowedMetricKeys");
  if (input.allowedMetricKeys.length > 256)
    fail("collective telemetry allowed metric key capacity exceeded");
  integer(
    input.maximumEvidenceDigestsPerEvent,
    "maximumEvidenceDigestsPerEvent",
    0,
    1_024,
  );
  integer(input.maximumMetricsPerEvent, "maximumMetricsPerEvent", 0, 256);
  integer(input.maximumRetainedEvents, "maximumRetainedEvents", 1, 100_000);
  integer(input.maximumCommitAttempts, "maximumCommitAttempts", 1, 32);
}

function validateAnchor(anchor: CollectiveTelemetryAnchorV1): void {
  integer(anchor.revision, "anchor.revision", 0, Number.MAX_SAFE_INTEGER);
  integer(anchor.sequence, "anchor.sequence", 0, Number.MAX_SAFE_INTEGER);
  integer(
    anchor.logicalTimeHighWaterMs,
    "anchor.logicalTimeHighWaterMs",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  digest(anchor.stateDigest, "anchor.stateDigest");
  if (anchor.revision !== anchor.sequence)
    fail("collective telemetry anchor revision and sequence differ");
}

function validateRecordInput(
  input: {
    readonly category: CollectiveTelemetryCategoryV1;
    readonly operation: string;
    readonly outcome: CollectiveTelemetryOutcomeV1;
    readonly logicalTimeMs: number;
    readonly operationDigest: string;
    readonly evidenceDigests?: readonly string[];
    readonly metrics?: readonly CollectiveTelemetryMetricV1[];
    readonly correlation?: CollectiveTelemetryCorrelationV1;
  },
  policy: CollectiveTelemetryPolicyV1,
  exactShape = false,
): void {
  if (exactShape)
    assertExactKeys(
      input,
      ["category", "operation", "outcome", "logicalTimeMs", "operationDigest"],
      ["evidenceDigests", "metrics", "correlation"],
      "collective telemetry record input",
    );
  if (
    ![
      "control",
      "coordination",
      "execution",
      "inference",
      "interop",
      "membership",
      "planning",
      "recovery",
      "simulation",
      "transport",
      "trust",
    ].includes(input.category)
  )
    fail("collective telemetry category is invalid");
  if (
    ![
      "accepted",
      "completed",
      "deferred",
      "failed",
      "rejected",
      "started",
    ].includes(input.outcome)
  )
    fail("collective telemetry outcome is invalid");
  identifier(input.operation, "operation");
  integer(input.logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
  digest(input.operationDigest, "operationDigest");
  if (
    (input.evidenceDigests?.length ?? 0) > policy.maximumEvidenceDigestsPerEvent
  )
    fail("collective telemetry evidence capacity exceeded");
  if ((input.metrics?.length ?? 0) > policy.maximumMetricsPerEvent)
    fail("collective telemetry metric capacity exceeded");
  canonicalDigests(input.evidenceDigests ?? [], "evidenceDigests");
  canonicalMetrics(input.metrics ?? [], policy);
  if (input.correlation) canonicalCorrelation(input.correlation);
}

function canonicalCorrelation(
  input: CollectiveTelemetryCorrelationV1,
): CollectiveTelemetryCorrelationV1 {
  assertExactKeys(
    input,
    ["missionId"],
    ["cycleId", "decisionId", "effectId"],
    "collective telemetry correlation",
  );
  identifier(input.missionId, "correlation.missionId");
  if (input.cycleId !== undefined)
    identifier(input.cycleId, "correlation.cycleId");
  if (input.decisionId !== undefined)
    identifier(input.decisionId, "correlation.decisionId");
  if (input.effectId !== undefined)
    identifier(input.effectId, "correlation.effectId");
  return immutable({
    missionId: input.missionId,
    ...(input.cycleId === undefined ? {} : { cycleId: input.cycleId }),
    ...(input.decisionId === undefined ? {} : { decisionId: input.decisionId }),
    ...(input.effectId === undefined ? {} : { effectId: input.effectId }),
  });
}

function canonicalMetrics(
  values: readonly CollectiveTelemetryMetricV1[],
  policy: CollectiveTelemetryPolicyV1,
): readonly CollectiveTelemetryMetricV1[] {
  if (!Array.isArray(values)) fail("collective telemetry metrics are invalid");
  const result = values
    .map((metric) => {
      assertExactKeys(
        metric,
        ["key", "value"],
        [],
        "collective telemetry metric",
      );
      identifier(metric.key, "metric.key");
      if (!policy.allowedMetricKeys.includes(metric.key))
        fail("collective telemetry metric is not allowed");
      const value = integer(
        metric.value,
        "metric.value",
        0,
        Number.MAX_SAFE_INTEGER,
      );
      return immutable({ key: metric.key, value });
    })
    .sort((left, right) => compareCodeUnits(left.key, right.key));
  if (new Set(result.map((item) => item.key)).size !== result.length)
    fail("collective telemetry metric key is duplicated");
  return immutable(result);
}

function canonicalDigests(
  values: readonly string[],
  label: string,
): readonly string[] {
  if (!Array.isArray(values)) fail(`${label} is invalid`);
  values.forEach((value) => digest(value, label));
  const canonical = [...new Set(values)].sort();
  if (
    canonical.length !== values.length ||
    canonical.some((value, index) => value !== values[index])
  )
    fail(`${label} must be canonical`);
  return immutable(canonical);
}

function canonicalIdentifiers(values: readonly string[], label: string): void {
  if (!Array.isArray(values)) fail(`${label} is invalid`);
  values.forEach((value) => identifier(value, label));
  const canonical = [...new Set(values)].sort(compareCodeUnits);
  if (
    canonical.length !== values.length ||
    canonical.some((value, index) => value !== values[index])
  )
    fail(`${label} must be canonical`);
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

async function telemetryDigest(
  domain: string,
  value: unknown,
  crypto?: Crypto,
): Promise<string> {
  const selected = crypto ?? globalThis.crypto;
  if (!selected?.subtle)
    fail("Web Crypto is required for collective telemetry");
  const bytes = new TextEncoder().encode(`${domain}\n${canonicalJson(value)}`);
  const output = await selected.subtle.digest("SHA-256", bytes);
  return `sha256:${[...new Uint8Array(output)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

/** Captures the only Web Crypto operation used by this runtime at construction. */
function captureCrypto(crypto: Crypto | undefined): Crypto | undefined {
  if (!crypto) return undefined;
  if (!crypto.subtle || typeof crypto.subtle.digest !== "function")
    fail("Web Crypto is required for collective telemetry");
  return Object.freeze({
    subtle: Object.freeze({ digest: crypto.subtle.digest.bind(crypto.subtle) }),
  }) as Crypto;
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number" && Number.isSafeInteger(value))
    return String(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (
    !value ||
    typeof value !== "object" ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    fail("collective telemetry digest input is not canonical data");
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => compareCodeUnits(left, right))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
    .join(",")}}`;
}

function assertExactKeys(
  value: unknown,
  required: readonly string[],
  optional: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(`${label} is invalid`);
  const keys = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  if (
    required.some((key) => !Object.prototype.hasOwnProperty.call(value, key)) ||
    keys.some((key) => !allowed.has(key))
  )
    fail(`${label} fields are invalid`);
}

function digest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value))
    fail(`${label} is invalid`);
}

function identifier(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/.test(value)
  )
    fail(`${label} is invalid`);
}

function token(
  value: unknown,
  label: string,
  maximum: number,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximum ||
    /[\u0000-\u001f]/.test(value)
  )
    fail(`${label} is invalid`);
}

function integer(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  )
    fail(`${label} is invalid`);
  return value as number;
}

function immutable<T>(value: T): T {
  const clone = structuredClone(value);
  const visit = (item: unknown): void => {
    if (!item || typeof item !== "object" || Object.isFrozen(item)) return;
    Object.values(item as Record<string, unknown>).forEach(visit);
    Object.freeze(item);
  };
  visit(clone);
  return clone;
}

function fail(message: string): never {
  throw new TypeError(message);
}
