import type {
  MeshAdaptiveOverlayCertificateV1,
  MeshAdaptiveOverlayResultV1,
} from "./adaptive-overlay-contracts.js";
import {
  createMeshAdaptiveOverlayAppliedViewV1,
  validateMeshAdaptiveOverlayCertificateV1,
  validateMeshAdaptiveOverlayStateV1,
} from "./adaptive-overlay-validation.js";
import { sha256Base64Url } from "./sha256.js";
import {
  createMeshSparsePeerViewV2,
  createMeshSparseRoutingStateV2,
  publishMeshSparseUpdateV2,
  receiveMeshSparseDeliveryV2,
  refreshMeshSparseRoutingStateV2,
  validateMeshSparseDeliveryV2,
  validateMeshSparseOverlayProfileV2,
  validateMeshSparseRoutingStateV2,
  validateMeshSparseUpdateV2,
} from "./sparse-overlay.js";
import type {
  MeshSparseDeliveryV2,
  MeshSparseOverlayDigestV2,
  MeshSparseUpdateV2,
} from "./sparse-overlay-contracts.js";
import type {
  MeshSparseDurableAdmissionV1,
  MeshSparseMembershipPeerV1,
  MeshSparseMembershipSliceV1,
  MeshSparsePeerPlaneAdaptationResultV1,
  MeshSparsePeerPlaneDrainResultV1,
  MeshSparsePeerPlaneLimitsV1,
  MeshSparsePeerPlaneOptionsV1,
  MeshSparsePeerPlanePublishResultV1,
  MeshSparsePeerPlaneReceiveResultV1,
  MeshSparsePeerPlaneStateV1,
  MeshSparseTopologyFreshnessV1,
} from "./sparse-overlay-runtime-contracts.js";

const DEFAULT_LIMITS: MeshSparsePeerPlaneLimitsV1 = Object.freeze({
  maximumPendingDeliveries: 4_096,
  maximumPendingUpdates: 1_024,
  maximumPendingPerNeighbor: 256,
  maximumPendingPerTopic: 256,
  maximumDrainItems: 128,
  maximumCommitAttempts: 8,
});
const DIGEST = /^sha256:[A-Za-z0-9_-]{43}$/u;

interface MeshSparsePeerPlaneRuntimeInvokersV1 {
  readonly restore: (
    logicalTime?: number,
  ) => Promise<MeshSparsePeerPlaneStateV1>;
  readonly publish: (input: {
    readonly topic: string;
    readonly payloadDigest: MeshSparseOverlayDigestV2;
    readonly logicalTime: number;
    readonly lifetime: number;
    readonly fanout?: number;
  }) => Promise<MeshSparsePeerPlanePublishResultV1>;
  readonly receive: (input: {
    readonly delivery: MeshSparseDeliveryV2;
    readonly logicalTime: number;
  }) => Promise<MeshSparsePeerPlaneReceiveResultV1>;
  readonly drain: (input: {
    readonly logicalTime: number;
    readonly maximumItems?: number;
  }) => Promise<MeshSparsePeerPlaneDrainResultV1>;
  readonly topologyFreshness: (
    logicalTime: number,
  ) => Promise<MeshSparseTopologyFreshnessV1>;
  readonly catchUpMembership: (logicalTime: number) => Promise<boolean>;
  readonly applyAdaptation: (input: {
    readonly certificate: MeshAdaptiveOverlayCertificateV1;
    readonly expectedRevision: number;
    readonly logicalTime: number;
  }) => Promise<MeshSparsePeerPlaneAdaptationResultV1>;
}

const meshSparsePeerPlaneRuntimeInvokersV1 = new WeakMap<
  object,
  MeshSparsePeerPlaneRuntimeInvokersV1
>();

/** Durable peer-local execution path for sparse selection, deduplication and forwarding. */
export class MeshSparsePeerPlaneRuntimeV1 {
  readonly #options: MeshSparsePeerPlaneOptionsV1;
  readonly #limits: MeshSparsePeerPlaneLimitsV1;
  declare readonly restore: MeshSparsePeerPlaneRuntimeInvokersV1["restore"];
  declare readonly publish: MeshSparsePeerPlaneRuntimeInvokersV1["publish"];
  declare readonly receive: MeshSparsePeerPlaneRuntimeInvokersV1["receive"];
  declare readonly drain: MeshSparsePeerPlaneRuntimeInvokersV1["drain"];
  declare readonly topologyFreshness: MeshSparsePeerPlaneRuntimeInvokersV1["topologyFreshness"];
  declare readonly catchUpMembership: MeshSparsePeerPlaneRuntimeInvokersV1["catchUpMembership"];
  declare readonly applyAdaptation: MeshSparsePeerPlaneRuntimeInvokersV1["applyAdaptation"];

  constructor(options: MeshSparsePeerPlaneOptionsV1) {
    if (!options || typeof options !== "object")
      fail("peer plane options are required");
    identifier(options.overlayId, "overlayId");
    const profile = validateMeshSparseOverlayProfileV2(options.profile);
    integer(options.topologySeed, "topologySeed", 0, 0xffff_ffff);
    integer(
      options.localPeerIndex,
      "localPeerIndex",
      0,
      profile.maximumPeers - 1,
    );
    digest(options.membershipDigest, "membershipDigest");
    if (
      !options.store ||
      typeof options.store.load !== "function" ||
      typeof options.store.compareAndSwap !== "function"
    )
      fail("durable peer plane store is required");
    if (!options.membership || typeof options.membership.resolve !== "function")
      fail("membership projection port is required");
    if (
      !options.deliveryQueue ||
      typeof options.deliveryQueue.pending !== "function" ||
      typeof options.deliveryQueue.enqueue !== "function"
    )
      fail("durable delivery queue is required");
    if (
      !options.updateAdmission ||
      typeof options.updateAdmission.pending !== "function" ||
      typeof options.updateAdmission.admit !== "function"
    )
      fail("durable update admission port is required");
    if (
      options.membershipCatchUp &&
      typeof options.membershipCatchUp.catchUp !== "function"
    )
      fail("membership catch-up port is invalid");
    if (options.adaptive && typeof options.adaptive.apply !== "function")
      fail("adaptive overlay application port is invalid");
    this.#limits = limits(options.limits);
    const storeLoad = options.store.load.bind(options.store);
    const storeCompareAndSwap = options.store.compareAndSwap.bind(
      options.store,
    );
    const membershipResolve = options.membership.resolve.bind(
      options.membership,
    );
    const deliveryPending = options.deliveryQueue.pending.bind(
      options.deliveryQueue,
    );
    const deliveryEnqueue = options.deliveryQueue.enqueue.bind(
      options.deliveryQueue,
    );
    const updatePending = options.updateAdmission.pending.bind(
      options.updateAdmission,
    );
    const updateAdmit = options.updateAdmission.admit.bind(
      options.updateAdmission,
    );
    const membershipCatchUp = options.membershipCatchUp?.catchUp.bind(
      options.membershipCatchUp,
    );
    const adaptiveApply = options.adaptive?.apply.bind(options.adaptive);
    this.#options = Object.freeze({
      overlayId: options.overlayId,
      profile,
      topologySeed: options.topologySeed,
      localPeerIndex: options.localPeerIndex,
      membershipDigest: options.membershipDigest,
      store: Object.freeze({
        load: storeLoad,
        compareAndSwap: storeCompareAndSwap,
      }),
      membership: Object.freeze({ resolve: membershipResolve }),
      deliveryQueue: Object.freeze({
        pending: deliveryPending,
        enqueue: deliveryEnqueue,
      }),
      updateAdmission: Object.freeze({
        pending: updatePending,
        admit: updateAdmit,
      }),
      ...(membershipCatchUp
        ? {
            membershipCatchUp: Object.freeze({ catchUp: membershipCatchUp }),
          }
        : {}),
      ...(adaptiveApply
        ? { adaptive: Object.freeze({ apply: adaptiveApply }) }
        : {}),
      limits: this.#limits,
    });
    const invokers: MeshSparsePeerPlaneRuntimeInvokersV1 = Object.freeze({
      restore: (logicalTime = 0) => this.#restore(logicalTime),
      publish: (
        input: Parameters<MeshSparsePeerPlaneRuntimeInvokersV1["publish"]>[0],
      ) => this.#publish(input),
      receive: (
        input: Parameters<MeshSparsePeerPlaneRuntimeInvokersV1["receive"]>[0],
      ) => this.#receive(input),
      drain: (
        input: Parameters<MeshSparsePeerPlaneRuntimeInvokersV1["drain"]>[0],
      ) => this.#drain(input),
      topologyFreshness: (logicalTime: number) =>
        this.#topologyFreshness(logicalTime),
      catchUpMembership: (logicalTime: number) =>
        this.#catchUpMembership(logicalTime),
      applyAdaptation: (
        input: Parameters<
          MeshSparsePeerPlaneRuntimeInvokersV1["applyAdaptation"]
        >[0],
      ) => this.#applyAdaptation(input),
    });
    meshSparsePeerPlaneRuntimeInvokersV1.set(this, invokers);
    Object.defineProperties(this, {
      restore: immutableMethod(invokers.restore),
      publish: immutableMethod(invokers.publish),
      receive: immutableMethod(invokers.receive),
      drain: immutableMethod(invokers.drain),
      topologyFreshness: immutableMethod(invokers.topologyFreshness),
      catchUpMembership: immutableMethod(invokers.catchUpMembership),
      applyAdaptation: immutableMethod(invokers.applyAdaptation),
    });
  }

  async #restore(logicalTime = 0): Promise<MeshSparsePeerPlaneStateV1> {
    integer(logicalTime, "logicalTime", 0, Number.MAX_SAFE_INTEGER);
    const existing = await this.#options.store.load(this.#options.overlayId);
    if (existing) return validateState(existing, this.#options);
    const view = createMeshSparsePeerViewV2({
      schemaVersion: 2,
      profile: this.#options.profile,
      topologySeed: this.#options.topologySeed,
      peerIndex: this.#options.localPeerIndex,
    });
    const routing = createMeshSparseRoutingStateV2({
      schemaVersion: 2,
      profile: this.#options.profile,
      view,
      logicalTime,
    });
    const initial = buildState({
      overlayId: this.#options.overlayId,
      revision: 0,
      membershipDigest: this.#options.membershipDigest,
      profile: this.#options.profile,
      routing,
      pendingDeliveries: [],
      pendingUpdates: [],
      lastLogicalTime: logicalTime,
    });
    if (
      await this.#options.store.compareAndSwap({
        overlayId: initial.overlayId,
        expectedRevision: null,
        expectedStateDigest: null,
        next: initial,
      })
    )
      return initial;
    const raced = await this.#options.store.load(this.#options.overlayId);
    if (!raced) fail("peer plane initialization conflict");
    return validateState(raced, this.#options);
  }

  async #publish(input: {
    readonly topic: string;
    readonly payloadDigest: MeshSparseOverlayDigestV2;
    readonly logicalTime: number;
    readonly lifetime: number;
    readonly fanout?: number;
  }): Promise<MeshSparsePeerPlanePublishResultV1> {
    const captured = Object.freeze({
      topic: input.topic,
      payloadDigest: input.payloadDigest,
      logicalTime: input.logicalTime,
      lifetime: input.lifetime,
      fanout: input.fanout,
    });
    let published: MeshSparseUpdateV2 | undefined;
    await this.#mutate(captured.logicalTime, (current) => {
      const result = publishMeshSparseUpdateV2({
        schemaVersion: 2,
        profile: current.profile,
        state: current.routing,
        topic: captured.topic,
        payloadDigest: captured.payloadDigest,
        logicalTime: captured.logicalTime,
        lifetime: captured.lifetime,
        ...(captured.fanout === undefined ? {} : { fanout: captured.fanout }),
      });
      capacity(
        current.pendingDeliveries.length + result.deliveries.length,
        this.#limits.maximumPendingDeliveries,
        "pending delivery",
      );
      published = result.update;
      return nextState(current, {
        routing: result.state,
        pendingDeliveries: [
          ...current.pendingDeliveries,
          ...result.deliveries.map((delivery) =>
            Object.freeze({
              delivery,
              queuedAtLogicalTime: captured.logicalTime,
            }),
          ),
        ],
        lastLogicalTime: captured.logicalTime,
      });
    });
    const drain = await this.#drain({ logicalTime: captured.logicalTime });
    return Object.freeze({
      update: published!,
      state: await this.#restore(),
      drain,
    });
  }

  async #receive(input: {
    readonly delivery: MeshSparseDeliveryV2;
    readonly logicalTime: number;
  }): Promise<MeshSparsePeerPlaneReceiveResultV1> {
    const delivery = validateMeshSparseDeliveryV2(
      this.#options.profile,
      input.delivery,
    );
    const logicalTime = input.logicalTime;
    integer(logicalTime, "logicalTime", 0, Number.MAX_SAFE_INTEGER);
    let accepted = false;
    let duplicate = false;
    let reasonCode: string | null = null;
    const state = await this.#mutate(logicalTime, (current) => {
      const result = receiveMeshSparseDeliveryV2({
        schemaVersion: 2,
        profile: current.profile,
        state: current.routing,
        delivery,
        logicalTime,
      });
      if (!result.accepted) {
        reasonCode = result.code;
        return current;
      }
      const addUpdate = result.duplicate ? 0 : 1;
      if (
        current.pendingDeliveries.length + result.deliveries.length >
          this.#limits.maximumPendingDeliveries ||
        current.pendingUpdates.length + addUpdate >
          this.#limits.maximumPendingUpdates
      ) {
        reasonCode = "peer_plane_backpressure";
        return current;
      }
      accepted = true;
      duplicate = result.duplicate;
      return nextState(current, {
        routing: result.state,
        pendingDeliveries: [
          ...current.pendingDeliveries,
          ...result.deliveries.map((delivery) =>
            Object.freeze({ delivery, queuedAtLogicalTime: logicalTime }),
          ),
        ],
        pendingUpdates: result.duplicate
          ? current.pendingUpdates
          : [
              ...current.pendingUpdates,
              Object.freeze({
                update: delivery.update,
                admittedAtLogicalTime: logicalTime,
              }),
            ],
        lastLogicalTime: logicalTime,
      });
    });
    const drain = accepted
      ? await this.#drain({ logicalTime })
      : emptyDrain(state);
    return Object.freeze({
      accepted,
      duplicate,
      reasonCode,
      state: accepted ? await this.#restore() : state,
      drain,
    });
  }

  async #drain(input: {
    readonly logicalTime: number;
    readonly maximumItems?: number;
  }): Promise<MeshSparsePeerPlaneDrainResultV1> {
    integer(input.logicalTime, "logicalTime", 0, Number.MAX_SAFE_INTEGER);
    const maximumItems = input.maximumItems ?? this.#limits.maximumDrainItems;
    integer(maximumItems, "maximumItems", 1, this.#limits.maximumDrainItems);
    let attempted = 0;
    let admitted = 0;
    let backpressured = 0;
    let rejected = 0;
    const blockedUpdates = new Set<string>();
    const blockedDeliveries = new Set<string>();
    while (attempted < maximumItems) {
      const state = await this.#restore();
      const pendingUpdate = state.pendingUpdates.find(
        ({ update }) => !blockedUpdates.has(update.updateId),
      );
      if (pendingUpdate) {
        attempted += 1;
        if (pendingUpdate.update.expiresAtLogicalTime <= input.logicalTime) {
          rejected += 1;
          await this.#removePending(
            "update",
            pendingUpdate.update.updateId,
            input.logicalTime,
          );
          continue;
        }
        let outcome: MeshSparseDurableAdmissionV1;
        try {
          const count = await this.#options.updateAdmission.pending(
            pendingUpdate.update.topic,
          );
          nonNegative(count, "update admission pending");
          if (count >= this.#limits.maximumPendingPerTopic) {
            backpressured += 1;
            blockedUpdates.add(pendingUpdate.update.updateId);
            continue;
          }
          outcome = admission(
            await this.#options.updateAdmission.admit({
              overlayId: state.overlayId,
              update: pendingUpdate.update,
            }),
          );
        } catch {
          backpressured += 1;
          blockedUpdates.add(pendingUpdate.update.updateId);
          continue;
        }
        if (outcome.status === "backpressured") {
          backpressured += 1;
          blockedUpdates.add(pendingUpdate.update.updateId);
          continue;
        }
        if (outcome.status === "rejected") rejected += 1;
        else admitted += 1;
        await this.#removePending(
          "update",
          pendingUpdate.update.updateId,
          input.logicalTime,
        );
        continue;
      }
      const pendingDelivery = state.pendingDeliveries.find(
        ({ delivery }) => !blockedDeliveries.has(delivery.deliveryDigest),
      );
      if (!pendingDelivery) break;
      attempted += 1;
      if (
        pendingDelivery.delivery.update.expiresAtLogicalTime <=
        input.logicalTime
      ) {
        rejected += 1;
        await this.#removePending(
          "delivery",
          pendingDelivery.delivery.deliveryDigest,
          input.logicalTime,
        );
        continue;
      }
      let recipient: MeshSparseMembershipPeerV1 | undefined;
      try {
        const slice = await this.#membershipSlice(
          state,
          [pendingDelivery.delivery.recipientPeerIndex],
          input.logicalTime,
        );
        if (
          slice.observedAtLogicalTime > input.logicalTime ||
          slice.validUntilLogicalTime <= input.logicalTime
        ) {
          backpressured += 1;
          blockedDeliveries.add(pendingDelivery.delivery.deliveryDigest);
          continue;
        }
        recipient = slice.peers[0];
      } catch {
        backpressured += 1;
        blockedDeliveries.add(pendingDelivery.delivery.deliveryDigest);
        continue;
      }
      if (!recipient || recipient.availability !== "active") {
        backpressured += 1;
        blockedDeliveries.add(pendingDelivery.delivery.deliveryDigest);
        continue;
      }
      let outcome: MeshSparseDurableAdmissionV1;
      try {
        const count = await this.#options.deliveryQueue.pending(
          recipient.peerId,
        );
        nonNegative(count, "delivery queue pending");
        if (count >= this.#limits.maximumPendingPerNeighbor) {
          backpressured += 1;
          blockedDeliveries.add(pendingDelivery.delivery.deliveryDigest);
          continue;
        }
        outcome = admission(
          await this.#options.deliveryQueue.enqueue({
            overlayId: state.overlayId,
            recipient,
            delivery: pendingDelivery.delivery,
          }),
        );
      } catch {
        backpressured += 1;
        blockedDeliveries.add(pendingDelivery.delivery.deliveryDigest);
        continue;
      }
      if (outcome.status === "backpressured") {
        backpressured += 1;
        blockedDeliveries.add(pendingDelivery.delivery.deliveryDigest);
        continue;
      }
      if (outcome.status === "rejected") rejected += 1;
      else admitted += 1;
      await this.#removePending(
        "delivery",
        pendingDelivery.delivery.deliveryDigest,
        input.logicalTime,
      );
    }
    const remainingState = await this.#restore();
    return Object.freeze({
      attempted,
      admitted,
      backpressured,
      rejected,
      remaining:
        remainingState.pendingDeliveries.length +
        remainingState.pendingUpdates.length,
    });
  }

  async #topologyFreshness(
    logicalTime: number,
  ): Promise<MeshSparseTopologyFreshnessV1> {
    try {
      const state = await this.#restore();
      const slice = await this.#membershipSlice(
        state,
        state.routing.view.activeNeighborIndexes,
        logicalTime,
      );
      if (
        slice.observedAtLogicalTime > logicalTime ||
        slice.validUntilLogicalTime <= logicalTime
      )
        return "stale";
      return slice.peers.length ===
        state.routing.view.activeNeighborIndexes.length &&
        slice.peers.every((peer) => peer.availability === "active")
        ? "fresh"
        : "stale";
    } catch {
      return "unknown";
    }
  }

  async #catchUpMembership(logicalTime: number): Promise<boolean> {
    integer(logicalTime, "logicalTime", 0, Number.MAX_SAFE_INTEGER);
    if (!this.#options.membershipCatchUp) return false;
    const state = await this.#restore();
    const requiredPeerIndexes = Object.freeze(
      [
        ...new Set([
          ...state.routing.view.activeNeighborIndexes,
          ...state.routing.view.reserveNeighborIndexes,
        ]),
      ].sort((left, right) => left - right),
    );
    return this.#options.membershipCatchUp.catchUp({
      overlayId: state.overlayId,
      membershipDigest: state.membershipDigest,
      requiredPeerIndexes,
      logicalTime,
    });
  }

  /** Applies adaptive-overlay authorization, then durably reconciles the exact local view. */
  async #applyAdaptation(input: {
    readonly certificate: MeshAdaptiveOverlayCertificateV1;
    readonly expectedRevision: number;
    readonly logicalTime: number;
  }): Promise<MeshSparsePeerPlaneAdaptationResultV1> {
    if (!this.#options.adaptive)
      fail("adaptive overlay runtime is not configured");
    const certificate = validateMeshAdaptiveOverlayCertificateV1(
      input.certificate,
    );
    const expectedRevision = input.expectedRevision;
    const logicalTime = input.logicalTime;
    integer(expectedRevision, "expectedRevision", 0, Number.MAX_SAFE_INTEGER);
    integer(logicalTime, "logicalTime", 0, Number.MAX_SAFE_INTEGER);
    const current = await this.#restore();
    if (
      certificate.binding.membershipDigest !== current.membershipDigest ||
      (certificate.binding.viewDigest === current.routing.view.viewDigest &&
        certificate.binding.revision !== current.routing.view.revision)
    )
      fail("adaptation local binding is stale");
    const adaptation = snapshotAdaptiveOverlayResult(
      await this.#options.adaptive.apply({
        certificate,
        profile: current.profile,
        view: current.routing.view,
        expectedRevision,
        logicalTimeMs: logicalTime,
      }),
    );
    if (
      adaptation.decision !== "applied" &&
      adaptation.decision !== "duplicate"
    )
      return Object.freeze({ adaptation, state: current });
    const applied = adaptation.applied ?? adaptation.state.applied;
    if (!applied) fail("adaptive application record is missing");
    const proposal = adaptation.state.proposals.find(
      (candidate) =>
        candidate.proposalDigest === input.certificate.proposalDigest,
    );
    if (!proposal) fail("adaptive proposal is missing after application");
    const state = await this.#mutate(logicalTime, (latest) => {
      if (latest.routing.view.viewDigest === applied.resultingViewDigest)
        return latest;
      if (latest.routing.view.viewDigest !== applied.binding.viewDigest)
        fail("adaptive view cannot be reconciled with local routing state");
      const routing = refreshMeshSparseRoutingStateV2({
        schemaVersion: 2,
        profile: latest.profile,
        state: latest.routing,
        excludedNeighborIndexes: proposal.excludedNeighborIndexes,
        logicalTime,
      });
      if (routing.view.viewDigest !== applied.resultingViewDigest)
        fail("adaptive resulting view digest conflicts with sparse routing");
      if (routing.view.revision !== applied.resultingRevision)
        fail("adaptive resulting revision conflicts with sparse routing");
      return nextState(latest, { routing, lastLogicalTime: logicalTime });
    });
    return Object.freeze({ adaptation, state });
  }

  async #mutate(
    logicalTime: number,
    operation: (
      state: MeshSparsePeerPlaneStateV1,
    ) => MeshSparsePeerPlaneStateV1,
  ): Promise<MeshSparsePeerPlaneStateV1> {
    integer(logicalTime, "logicalTime", 0, Number.MAX_SAFE_INTEGER);
    for (
      let attempt = 0;
      attempt < this.#limits.maximumCommitAttempts;
      attempt += 1
    ) {
      const current = await this.#restore(logicalTime);
      if (logicalTime < current.lastLogicalTime)
        fail("peer plane logical time regressed");
      if (current.revision === Number.MAX_SAFE_INTEGER)
        fail("peer plane revision is exhausted");
      const next = operation(current);
      if (next === current) return current;
      if (
        await this.#options.store.compareAndSwap({
          overlayId: current.overlayId,
          expectedRevision: current.revision,
          expectedStateDigest: current.stateDigest,
          next,
        })
      )
        return next;
    }
    fail("peer plane compare-and-swap attempts exhausted");
  }

  async #removePending(
    kind: "delivery" | "update",
    identity: string,
    logicalTime: number,
  ): Promise<void> {
    await this.#mutate(logicalTime, (current) => {
      const pendingDeliveries =
        kind === "delivery"
          ? current.pendingDeliveries.filter(
              (entry) => entry.delivery.deliveryDigest !== identity,
            )
          : current.pendingDeliveries;
      const pendingUpdates =
        kind === "update"
          ? current.pendingUpdates.filter(
              (entry) => entry.update.updateId !== identity,
            )
          : current.pendingUpdates;
      if (
        pendingDeliveries.length === current.pendingDeliveries.length &&
        pendingUpdates.length === current.pendingUpdates.length
      )
        return current;
      return nextState(current, {
        pendingDeliveries,
        pendingUpdates,
        lastLogicalTime: Math.max(current.lastLogicalTime, logicalTime),
      });
    });
  }

  async #membershipSlice(
    state: MeshSparsePeerPlaneStateV1,
    peerIndexes: readonly number[],
    logicalTime: number,
  ): Promise<MeshSparseMembershipSliceV1> {
    const requested = Object.freeze(
      [...new Set(peerIndexes)].sort((left, right) => left - right),
    );
    const slice = await this.#options.membership.resolve({
      overlayId: state.overlayId,
      membershipDigest: state.membershipDigest,
      peerIndexes: requested,
      logicalTime,
    });
    return validateSlice(slice, state, requested);
  }
}

/** Nominal check for the module-owned sparse peer plane runtime. */
export function isMeshSparsePeerPlaneRuntimeV1(
  value: unknown,
): value is MeshSparsePeerPlaneRuntimeV1 {
  return (
    typeof value === "object" &&
    value !== null &&
    meshSparsePeerPlaneRuntimeInvokersV1.has(value)
  );
}

/** Invokes the construction-time publish implementation. */
export function invokeMeshSparsePeerPlanePublishV1(
  runtime: MeshSparsePeerPlaneRuntimeV1,
  input: Parameters<MeshSparsePeerPlaneRuntimeInvokersV1["publish"]>[0],
): Promise<MeshSparsePeerPlanePublishResultV1> {
  return requireMeshSparsePeerPlaneInvokers(runtime).publish(input);
}

/** Invokes the construction-time sparse admission implementation. */
export function invokeMeshSparsePeerPlaneReceiveV1(
  runtime: MeshSparsePeerPlaneRuntimeV1,
  input: Parameters<MeshSparsePeerPlaneRuntimeInvokersV1["receive"]>[0],
): Promise<MeshSparsePeerPlaneReceiveResultV1> {
  return requireMeshSparsePeerPlaneInvokers(runtime).receive(input);
}

function requireMeshSparsePeerPlaneInvokers(
  runtime: MeshSparsePeerPlaneRuntimeV1,
): MeshSparsePeerPlaneRuntimeInvokersV1 {
  const invokers = meshSparsePeerPlaneRuntimeInvokersV1.get(runtime);
  if (!invokers) fail("peer plane runtime is not genuine");
  return invokers;
}

function buildState(
  input: Omit<MeshSparsePeerPlaneStateV1, "schemaVersion" | "stateDigest">,
): MeshSparsePeerPlaneStateV1 {
  const body = { schemaVersion: 1 as const, ...input };
  return deepFreeze({ ...body, stateDigest: contentDigest(body) });
}

function nextState(
  state: MeshSparsePeerPlaneStateV1,
  changes: Partial<
    Pick<
      MeshSparsePeerPlaneStateV1,
      "routing" | "pendingDeliveries" | "pendingUpdates" | "lastLogicalTime"
    >
  >,
): MeshSparsePeerPlaneStateV1 {
  return buildState({
    overlayId: state.overlayId,
    revision: state.revision + 1,
    membershipDigest: state.membershipDigest,
    profile: state.profile,
    routing: changes.routing ?? state.routing,
    pendingDeliveries: changes.pendingDeliveries ?? state.pendingDeliveries,
    pendingUpdates: changes.pendingUpdates ?? state.pendingUpdates,
    lastLogicalTime: changes.lastLogicalTime ?? state.lastLogicalTime,
  });
}

function validateState(
  input: MeshSparsePeerPlaneStateV1,
  options: MeshSparsePeerPlaneOptionsV1,
): MeshSparsePeerPlaneStateV1 {
  if (
    !input ||
    input.schemaVersion !== 1 ||
    input.overlayId !== options.overlayId
  )
    fail("peer plane state binding is invalid");
  integer(input.revision, "state.revision", 0, Number.MAX_SAFE_INTEGER);
  if (input.membershipDigest !== options.membershipDigest)
    fail("peer plane membership binding is invalid");
  const profile = validateMeshSparseOverlayProfileV2(input.profile);
  if (profile.profileDigest !== options.profile.profileDigest)
    fail("peer plane profile binding is invalid");
  const routing = validateMeshSparseRoutingStateV2(profile, input.routing);
  if (
    routing.view.peerIndex !== options.localPeerIndex ||
    routing.view.topologySeed !== options.topologySeed
  )
    fail("peer plane local view binding is invalid");
  if (
    !Array.isArray(input.pendingDeliveries) ||
    !Array.isArray(input.pendingUpdates)
  )
    fail("peer plane pending state is invalid");
  const configuredLimits = limits(options.limits);
  capacity(
    input.pendingDeliveries.length,
    configuredLimits.maximumPendingDeliveries,
    "pending delivery",
  );
  capacity(
    input.pendingUpdates.length,
    configuredLimits.maximumPendingUpdates,
    "pending update",
  );
  const deliveryIds = new Set<string>();
  const pendingDeliveries = input.pendingDeliveries.map((entry) => {
    const delivery = validateMeshSparseDeliveryV2(profile, entry.delivery);
    integer(
      entry.queuedAtLogicalTime,
      "pending delivery logical time",
      0,
      Number.MAX_SAFE_INTEGER,
    );
    if (deliveryIds.has(delivery.deliveryDigest))
      fail("pending delivery identity is duplicated");
    deliveryIds.add(delivery.deliveryDigest);
    return Object.freeze({
      delivery,
      queuedAtLogicalTime: entry.queuedAtLogicalTime,
    });
  });
  const updateIds = new Set<string>();
  const pendingUpdates = input.pendingUpdates.map((entry) => {
    const update = validateMeshSparseUpdateV2(profile, entry.update);
    integer(
      entry.admittedAtLogicalTime,
      "pending update logical time",
      0,
      Number.MAX_SAFE_INTEGER,
    );
    if (updateIds.has(update.updateId))
      fail("pending update identity is duplicated");
    updateIds.add(update.updateId);
    return Object.freeze({
      update,
      admittedAtLogicalTime: entry.admittedAtLogicalTime,
    });
  });
  integer(
    input.lastLogicalTime,
    "state.lastLogicalTime",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  if (input.lastLogicalTime < routing.lastLogicalTime)
    fail("peer plane state time precedes routing state");
  const rebuilt = buildState({
    overlayId: input.overlayId,
    revision: input.revision,
    membershipDigest: input.membershipDigest,
    profile,
    routing,
    pendingDeliveries,
    pendingUpdates,
    lastLogicalTime: input.lastLogicalTime,
  });
  if (rebuilt.stateDigest !== input.stateDigest)
    fail("peer plane state digest is invalid");
  return rebuilt;
}

function validateSlice(
  slice: MeshSparseMembershipSliceV1,
  state: MeshSparsePeerPlaneStateV1,
  requested: readonly number[],
): MeshSparseMembershipSliceV1 {
  if (
    !slice ||
    slice.schemaVersion !== 1 ||
    slice.overlayId !== state.overlayId ||
    slice.membershipDigest !== state.membershipDigest
  )
    fail("membership slice binding is invalid");
  integer(
    slice.observedAtLogicalTime,
    "membership observedAtLogicalTime",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  integer(
    slice.validUntilLogicalTime,
    "membership validUntilLogicalTime",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  if (slice.validUntilLogicalTime <= slice.observedAtLogicalTime)
    fail("membership slice lifetime is invalid");
  if (!Array.isArray(slice.peers) || slice.peers.length > requested.length)
    fail("membership slice is not bounded by the request");
  const allowed = new Set(requested);
  const seen = new Set<number>();
  const peers = slice.peers.map((peer) => {
    integer(
      peer.peerIndex,
      "membership peerIndex",
      0,
      state.profile.maximumPeers - 1,
    );
    if (!allowed.has(peer.peerIndex) || seen.has(peer.peerIndex))
      fail("membership slice contains an unrequested or duplicate peer");
    seen.add(peer.peerIndex);
    identifier(peer.peerId, "membership peerId");
    if (
      peer.availability !== "active" &&
      peer.availability !== "suspect" &&
      peer.availability !== "departed"
    )
      fail("membership availability is invalid");
    return Object.freeze({
      peerIndex: peer.peerIndex,
      peerId: peer.peerId,
      availability: peer.availability,
    });
  });
  return Object.freeze({
    schemaVersion: 1,
    overlayId: slice.overlayId,
    membershipDigest: slice.membershipDigest,
    observedAtLogicalTime: slice.observedAtLogicalTime,
    validUntilLogicalTime: slice.validUntilLogicalTime,
    peers: Object.freeze(peers),
  });
}

function limits(
  input: MeshSparsePeerPlaneOptionsV1["limits"],
): MeshSparsePeerPlaneLimitsV1 {
  const result = { ...DEFAULT_LIMITS, ...input };
  for (const [key, value] of Object.entries(result))
    integer(value, key, 1, 1_000_000);
  return Object.freeze(result);
}

function snapshotAdaptiveOverlayResult(
  input: MeshAdaptiveOverlayResultV1,
): MeshAdaptiveOverlayResultV1 {
  if (!input || typeof input !== "object" || Array.isArray(input))
    fail("adaptive overlay result is invalid");
  const snapshot = structuredClone(input) as MeshAdaptiveOverlayResultV1;
  if (
    ![
      "observed",
      "certified",
      "applied",
      "duplicate",
      "stale",
      "conflict",
      "rejected",
    ].includes(snapshot.decision) ||
    typeof snapshot.reasonCode !== "string" ||
    !/^[a-z0-9][a-z0-9_.:-]{0,127}$/u.test(snapshot.reasonCode)
  )
    fail("adaptive overlay result disposition is invalid");
  const state = validateMeshAdaptiveOverlayStateV1(snapshot.state);
  const certificate = snapshot.certificate
    ? validateMeshAdaptiveOverlayCertificateV1(snapshot.certificate)
    : undefined;
  let applied = snapshot.applied;
  if (applied) {
    const {
      schemaVersion: _schemaVersion,
      applicationDigest,
      ...body
    } = applied;
    const rebuilt = createMeshAdaptiveOverlayAppliedViewV1(body);
    if (rebuilt.applicationDigest !== applicationDigest)
      fail("adaptive overlay applied result digest is invalid");
    applied = rebuilt;
  }
  if (
    (snapshot.decision === "applied" || snapshot.decision === "duplicate") &&
    !(applied ?? state.applied)
  )
    fail("adaptive overlay applied result is missing");
  if (certificate && certificate.policyDigest !== state.policyDigest)
    fail("adaptive overlay result policy binding changed");
  return deepFreeze({
    decision: snapshot.decision,
    reasonCode: snapshot.reasonCode,
    state,
    ...(certificate ? { certificate } : {}),
    ...(applied ? { applied } : {}),
  });
}

function admission(
  input: MeshSparseDurableAdmissionV1,
): MeshSparseDurableAdmissionV1 {
  if (
    !input ||
    (input.status !== "admitted" &&
      input.status !== "duplicate" &&
      input.status !== "backpressured" &&
      input.status !== "rejected")
  )
    fail("durable admission result is invalid");
  return input;
}

function emptyDrain(
  state: MeshSparsePeerPlaneStateV1,
): MeshSparsePeerPlaneDrainResultV1 {
  return Object.freeze({
    attempted: 0,
    admitted: 0,
    backpressured: 0,
    rejected: 0,
    remaining: state.pendingDeliveries.length + state.pendingUpdates.length,
  });
}

function capacity(value: number, maximum: number, label: string): void {
  if (value > maximum) fail(`${label} capacity exceeded`);
}

function contentDigest(value: unknown): MeshSparseOverlayDigestV2 {
  return `sha256:${sha256Base64Url(new TextEncoder().encode(canonical(value)))}`;
}

function canonical(value: unknown): string {
  if (value === undefined) fail("undefined is not canonical JSON");
  if (value === null || typeof value !== "object") {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) fail("value is not canonical JSON");
    return serialized;
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(",")}}`;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function identifier(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u.test(value)
  )
    fail(`${label} is invalid`);
}

function digest(
  value: unknown,
  label: string,
): asserts value is MeshSparseOverlayDigestV2 {
  if (typeof value !== "string" || !DIGEST.test(value))
    fail(`${label} is invalid`);
}

function integer(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): asserts value is number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  )
    fail(`${label} is invalid`);
}

function nonNegative(value: unknown, label: string): asserts value is number {
  integer(value, label, 0, Number.MAX_SAFE_INTEGER);
}

function immutableMethod<T extends (...args: never[]) => unknown>(
  value: T,
): PropertyDescriptor {
  return {
    value,
    writable: false,
    configurable: false,
    enumerable: false,
  };
}

function fail(message: string): never {
  throw new TypeError(message);
}
