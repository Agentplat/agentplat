import { sha256Base64Url } from "./sha256.js";
import {
  createMeshSparseRelayDeliveryV2,
  validateMeshSparseDeliveryV2,
  validateMeshSparseOverlayProfileV2,
  validateMeshSparsePeerViewV2,
  validateMeshSparseUpdateV2,
} from "./sparse-overlay.js";
import type {
  MeshSparseDeliveryV2,
  MeshSparseOverlayDigestV2,
} from "./sparse-overlay-contracts.js";
import type {
  MeshSparseDeliveryQueuePortV1,
  MeshSparseDurableAdmissionV1,
  MeshSparseMembershipPeerV1,
  MeshSparseUpdateAdmissionPortV1,
} from "./sparse-overlay-runtime-contracts.js";
import type {
  MeshSparseNextHopTransportV1,
  MeshSparsePeerTransportOptionsV1,
  MeshSparseTransportBatchResultV1,
  MeshSparseTransportCatchUpResponseV1,
  MeshSparseTransportConnectivityV1,
  MeshSparseTransportEndpointV1,
  MeshSparseTransportHistoryRecordV1,
  MeshSparseTransportInboundHandlerV1,
  MeshSparseTransportLimitsV1,
  MeshSparseTransportRejoinResultV1,
  MeshSparseTransportStateV1,
  MeshSparseTransportStoreV1,
} from "./sparse-overlay-transport-contracts.js";

const DEFAULT_LIMITS: MeshSparseTransportLimitsV1 = Object.freeze({
  maximumOutbox: 4_096,
  maximumInbox: 4_096,
  maximumUpdates: 1_024,
  maximumHistory: 8_192,
  maximumDirectPeers: 64,
  maximumBatchItems: 128,
  maximumCatchUpItems: 256,
  maximumCommitAttempts: 8,
  retryBaseDelay: 1,
  retryMaximumDelay: 1_024,
});

/**
 * One portable, CAS-backed next-hop transport. It implements the peer-plane
 * durable queue and update admission ports without owning routing decisions.
 */
export class MeshSparsePeerTransportRuntimeV1
  implements
    MeshSparseDeliveryQueuePortV1,
    MeshSparseUpdateAdmissionPortV1,
    MeshSparseTransportEndpointV1
{
  readonly #options: MeshSparsePeerTransportOptionsV1;
  readonly #limits: MeshSparseTransportLimitsV1;
  readonly #localPeer: MeshSparseMembershipPeerV1;

  constructor(options: MeshSparsePeerTransportOptionsV1) {
    if (!options || typeof options !== "object") fail("transport options are required");
    identifier(options.overlayId, "overlayId");
    const profile = validateMeshSparseOverlayProfileV2(options.profile);
    integer(options.localPeerIndex, "localPeerIndex", 0, profile.maximumPeers - 1);
    identifier(options.localPeerId, "localPeerId");
    digest(options.membershipDigest, "membershipDigest");
    if (!options.store || typeof options.store.load !== "function" || typeof options.store.compareAndSwap !== "function")
      fail("durable transport store is required");
    if (!options.membership || typeof options.membership.resolve !== "function")
      fail("membership projection port is required");
    if (!options.nextHop || typeof options.nextHop.deliver !== "function" || typeof options.nextHop.catchUp !== "function" || typeof options.nextHop.fetchCausal !== "function")
      fail("next-hop transport is required");
    if (typeof options.currentView !== "function") fail("current sparse view port is required");
    this.#options = options;
    this.#limits = limits(options.limits);
    this.#localPeer = Object.freeze({
      peerIndex: options.localPeerIndex,
      peerId: options.localPeerId,
      availability: "active" as const,
    });
  }

  async restore(logicalTime = 0): Promise<MeshSparseTransportStateV1> {
    integer(logicalTime, "logicalTime", 0, Number.MAX_SAFE_INTEGER);
    const existing = await this.#options.store.load(this.#options.overlayId);
    if (existing) return validateState(existing, this.#options, this.#limits);
    const initial = buildState({
      overlayId: this.#options.overlayId,
      localPeerIndex: this.#options.localPeerIndex,
      localPeerId: this.#options.localPeerId,
      membershipDigest: this.#options.membershipDigest,
      profileDigest: this.#options.profile.profileDigest,
      revision: 0,
      connectivity: "active",
      nextHistorySequence: 1,
      outbox: [],
      inbox: [],
      updates: [],
      acknowledgedUpdates: [],
      history: [],
      neighborCursors: [],
      lastLogicalTime: logicalTime,
    });
    if (await this.#options.store.compareAndSwap({
      overlayId: initial.overlayId,
      expectedRevision: null,
      expectedStateDigest: null,
      next: initial,
    })) return initial;
    const raced = await this.#options.store.load(this.#options.overlayId);
    return raced
      ? validateState(raced, this.#options, this.#limits)
      : fail("transport initialization conflict");
  }

  async pending(identity: string): Promise<number> {
    identifier(identity, "pending identity");
    const state = await this.restore();
    return state.outbox.filter((record) => record.recipient.peerId === identity).length;
  }

  async enqueue(input: {
    readonly overlayId: string;
    readonly recipient: MeshSparseMembershipPeerV1;
    readonly delivery: MeshSparseDeliveryV2;
  }): Promise<MeshSparseDurableAdmissionV1> {
    if (input.overlayId !== this.#options.overlayId) return rejected("overlay_mismatch");
    const delivery = validateMeshSparseDeliveryV2(this.#options.profile, input.delivery);
    const recipient = membershipPeer(input.recipient, this.#options.profile.maximumPeers);
    if (delivery.senderPeerIndex !== this.#options.localPeerIndex || delivery.recipientPeerIndex !== recipient.peerIndex)
      return rejected("delivery_peer_binding_invalid");
    let outcome: MeshSparseDurableAdmissionV1 = admitted();
    await this.#mutate(undefined, (state) => {
      const existing = state.outbox.find((record) => record.delivery.deliveryDigest === delivery.deliveryDigest);
      if (existing) {
        outcome = existing.recipient.peerId === recipient.peerId
          ? duplicate()
          : rejected("delivery_identity_conflict");
        return state;
      }
      if (state.outbox.length >= this.#limits.maximumOutbox) {
        outcome = backpressured("transport_outbox_capacity");
        return state;
      }
      const queuedAt = Math.max(state.lastLogicalTime, delivery.update.createdAtLogicalTime);
      return nextState(state, {
        outbox: [...state.outbox, Object.freeze({
          recipient,
          delivery,
          attempts: 0,
          queuedAtLogicalTime: queuedAt,
          availableAtLogicalTime: queuedAt,
          lastReasonCode: null,
        })],
        history: appendHistory(state, delivery, queuedAt, this.#limits.maximumHistory),
        nextHistorySequence: hasHistory(state.history, delivery.deliveryDigest)
          ? state.nextHistorySequence
          : state.nextHistorySequence + 1,
        lastLogicalTime: queuedAt,
      });
    });
    return outcome;
  }

  async admit(input: {
    readonly overlayId: string;
    readonly update: Parameters<MeshSparseUpdateAdmissionPortV1["admit"]>[0]["update"];
  }): Promise<MeshSparseDurableAdmissionV1> {
    if (input.overlayId !== this.#options.overlayId) return rejected("overlay_mismatch");
    const update = validateMeshSparseUpdateV2(this.#options.profile, input.update);
    let outcome: MeshSparseDurableAdmissionV1 = admitted();
    await this.#mutate(undefined, (state) => {
      const known = [
        ...state.updates.map((record) => ({
          updateId: record.update.updateId,
          updateDigest: record.update.updateDigest,
        })),
        ...state.acknowledgedUpdates,
      ].find((candidate) => candidate.updateId === update.updateId);
      if (known) {
        outcome = known.updateDigest === update.updateDigest
          ? duplicate()
          : rejected("update_identity_conflict");
        return state;
      }
      if (state.updates.length >= this.#limits.maximumUpdates) {
        outcome = backpressured("transport_update_capacity");
        return state;
      }
      const conflictingEvidence = state.history
        .map((record) => record.delivery.update)
        .find((candidate) => candidate.updateId === update.updateId && candidate.updateDigest !== update.updateDigest);
      if (conflictingEvidence) {
        outcome = rejected("update_identity_conflict");
        return state;
      }
      return nextState(state, {
        updates: [...state.updates, Object.freeze({
          update,
          admittedAtLogicalTime: state.lastLogicalTime,
        })],
      });
    });
    return outcome;
  }

  /** Durable remote ingress, idempotent by delivery digest and update identity. */
  async receive(input: {
    readonly overlayId: string;
    readonly membershipDigest: MeshSparseOverlayDigestV2;
    readonly sender: MeshSparseMembershipPeerV1;
    readonly delivery: MeshSparseDeliveryV2;
    readonly logicalTime: number;
  }): Promise<MeshSparseDurableAdmissionV1> {
    integer(input.logicalTime, "logicalTime", 0, Number.MAX_SAFE_INTEGER);
    if (input.overlayId !== this.#options.overlayId) return rejected("overlay_mismatch");
    if (input.membershipDigest !== this.#options.membershipDigest) return rejected("membership_mismatch");
    const sender = membershipPeer(input.sender, this.#options.profile.maximumPeers);
    const delivery = validateMeshSparseDeliveryV2(this.#options.profile, input.delivery);
    if (sender.availability !== "active" || delivery.senderPeerIndex !== sender.peerIndex || delivery.recipientPeerIndex !== this.#options.localPeerIndex)
      return rejected("delivery_peer_binding_invalid");
    let outcome: MeshSparseDurableAdmissionV1 = admitted();
    await this.#mutate(input.logicalTime, (state) => {
      const exact = state.history.find((record) => record.delivery.deliveryDigest === delivery.deliveryDigest);
      if (exact) {
        outcome = exact.delivery.update.updateDigest === delivery.update.updateDigest
          ? duplicate()
          : rejected("delivery_identity_conflict");
        return state;
      }
      const sameUpdate = state.history.find((record) => record.delivery.update.updateId === delivery.update.updateId)?.delivery.update;
      if (sameUpdate && sameUpdate.updateDigest !== delivery.update.updateDigest) {
        outcome = rejected("update_identity_conflict");
        return state;
      }
      if (state.inbox.length >= this.#limits.maximumInbox) {
        outcome = backpressured("transport_inbox_capacity");
        return state;
      }
      return nextState(state, {
        inbox: [...state.inbox, Object.freeze({
          sender,
          delivery,
          attempts: 0,
          queuedAtLogicalTime: input.logicalTime,
          availableAtLogicalTime: input.logicalTime,
          lastReasonCode: null,
        })],
        history: appendHistory(state, delivery, input.logicalTime, this.#limits.maximumHistory),
        nextHistorySequence: state.nextHistorySequence + 1,
        lastLogicalTime: input.logicalTime,
      });
    });
    return outcome;
  }

  async setConnectivity(
    connectivity: MeshSparseTransportConnectivityV1,
    logicalTime: number,
  ): Promise<MeshSparseTransportStateV1> {
    if (connectivity !== "active" && connectivity !== "partitioned" && connectivity !== "rejoining")
      fail("connectivity is invalid");
    return this.#mutate(logicalTime, (state) =>
      state.connectivity === connectivity
        ? state
        : nextState(state, { connectivity, lastLogicalTime: logicalTime }),
    );
  }

  /** Retries durable next-hop work; a partition never discards queued work. */
  async pumpOutbox(input: {
    readonly logicalTime: number;
    readonly maximumItems?: number;
  }): Promise<MeshSparseTransportBatchResultV1> {
    const maximumItems = batchSize(input.maximumItems, this.#limits);
    let attempted = 0;
    let completed = 0;
    let duplicates = 0;
    let deferred = 0;
    let rejectedCount = 0;
    const blocked = new Set<string>();
    while (attempted < maximumItems) {
      const state = await this.restore(input.logicalTime);
      if (state.connectivity === "partitioned") {
        deferred += state.outbox.length > 0 ? 1 : 0;
        break;
      }
      const record = state.outbox.find((candidate) =>
        candidate.availableAtLogicalTime <= input.logicalTime &&
        !blocked.has(candidate.delivery.deliveryDigest));
      if (!record) break;
      attempted += 1;
      if (record.delivery.update.expiresAtLogicalTime <= input.logicalTime) {
        rejectedCount += 1;
        await this.#removeOutbox(record.delivery.deliveryDigest, input.logicalTime);
        continue;
      }
      let outcome: MeshSparseDurableAdmissionV1;
      try {
        outcome = admission(await this.#options.nextHop.deliver({
          recipient: record.recipient,
          overlayId: state.overlayId,
          membershipDigest: state.membershipDigest,
          sender: this.#localPeer,
          delivery: record.delivery,
          logicalTime: input.logicalTime,
        }));
      } catch {
        outcome = backpressured("next_hop_unavailable");
      }
      if (outcome.status === "admitted" || outcome.status === "duplicate") {
        completed += 1;
        if (outcome.status === "duplicate") duplicates += 1;
        await this.#removeOutbox(record.delivery.deliveryDigest, input.logicalTime);
      } else if (outcome.status === "rejected") {
        rejectedCount += 1;
        await this.#removeOutbox(record.delivery.deliveryDigest, input.logicalTime);
      } else {
        deferred += 1;
        blocked.add(record.delivery.deliveryDigest);
        await this.#defer(
          "outbox",
          record.delivery.deliveryDigest,
          "reasonCode" in outcome ? outcome.reasonCode : "next_hop_deferred",
          input.logicalTime,
        );
      }
    }
    const state = await this.restore(input.logicalTime);
    return Object.freeze({ attempted, completed, duplicates, deferred, rejected: rejectedCount, remaining: state.outbox.length });
  }

  /**
   * Delivers durable ingress to the peer plane. A crash after the handler and
   * before acknowledgement safely replays because the peer plane deduplicates.
   */
  async processInbox(input: {
    readonly logicalTime: number;
    readonly handler: MeshSparseTransportInboundHandlerV1;
    readonly maximumItems?: number;
  }): Promise<MeshSparseTransportBatchResultV1> {
    if (typeof input.handler !== "function") fail("inbound handler is required");
    const maximumItems = batchSize(input.maximumItems, this.#limits);
    let attempted = 0;
    let completed = 0;
    let duplicates = 0;
    let deferred = 0;
    let rejectedCount = 0;
    const blocked = new Set<string>();
    while (attempted < maximumItems) {
      const state = await this.restore(input.logicalTime);
      const record = state.inbox.find((candidate) =>
        candidate.availableAtLogicalTime <= input.logicalTime &&
        !blocked.has(candidate.delivery.deliveryDigest));
      if (!record) break;
      attempted += 1;
      if (record.delivery.update.expiresAtLogicalTime <= input.logicalTime) {
        rejectedCount += 1;
        await this.#removeInbox(record.delivery.deliveryDigest, input.logicalTime);
        continue;
      }
      const causal = await this.#ensureCausal(record, input.logicalTime);
      if (!causal) {
        deferred += 1;
        blocked.add(record.delivery.deliveryDigest);
        await this.#defer("inbox", record.delivery.deliveryDigest, "causal_predecessor_unavailable", input.logicalTime);
        continue;
      }
      try {
        const outcome = await input.handler({ delivery: record.delivery, logicalTime: input.logicalTime });
        if (outcome.accepted) {
          completed += 1;
          if (outcome.duplicate) duplicates += 1;
          await this.#removeInbox(record.delivery.deliveryDigest, input.logicalTime);
        } else if (retryablePeerPlaneReason(outcome.reasonCode)) {
          deferred += 1;
          blocked.add(record.delivery.deliveryDigest);
          await this.#defer("inbox", record.delivery.deliveryDigest, outcome.reasonCode ?? "peer_plane_deferred", input.logicalTime);
        } else {
          rejectedCount += 1;
          await this.#removeInbox(record.delivery.deliveryDigest, input.logicalTime);
        }
      } catch {
        deferred += 1;
        blocked.add(record.delivery.deliveryDigest);
        await this.#defer("inbox", record.delivery.deliveryDigest, "peer_plane_unavailable", input.logicalTime);
      }
    }
    const state = await this.restore(input.logicalTime);
    return Object.freeze({ attempted, completed, duplicates, deferred, rejected: rejectedCount, remaining: state.inbox.length });
  }

  async readUpdates(maximumItems = this.#limits.maximumBatchItems) {
    integer(maximumItems, "maximumItems", 1, this.#limits.maximumBatchItems);
    const state = await this.restore();
    return Object.freeze(state.updates.slice(0, maximumItems));
  }

  async acknowledgeUpdate(updateId: string, logicalTime: number): Promise<boolean> {
    identifier(updateId, "updateId");
    let removed = false;
    await this.#mutate(logicalTime, (state) => {
      const acknowledged = state.updates.find((record) => record.update.updateId === updateId);
      const updates = state.updates.filter((record) => record.update.updateId !== updateId);
      removed = updates.length !== state.updates.length;
      if (!removed || !acknowledged) return state;
      const acknowledgedUpdates = [
        ...state.acknowledgedUpdates.filter((record) => record.updateId !== updateId),
        Object.freeze({
          updateId: acknowledged.update.updateId,
          updateDigest: acknowledged.update.updateDigest,
          acknowledgedAtLogicalTime: logicalTime,
        }),
      ].slice(-this.#limits.maximumHistory);
      return nextState(state, { updates, acknowledgedUpdates, lastLogicalTime: logicalTime });
    });
    return removed;
  }

  /** Pulls bounded deltas from current local-view neighbors after a partition. */
  async rejoin(input: {
    readonly neighborPeerIndexes: readonly number[];
    readonly logicalTime: number;
    readonly maximumItemsPerNeighbor?: number;
  }): Promise<MeshSparseTransportRejoinResultV1> {
    const view = validateMeshSparsePeerViewV2(this.#options.profile, await this.#options.currentView());
    const allowed = new Set([...view.activeNeighborIndexes, ...view.reserveNeighborIndexes]);
    const peerIndexes = uniqueIndexes(input.neighborPeerIndexes, this.#options.profile.maximumPeers);
    if (peerIndexes.length > this.#limits.maximumDirectPeers || peerIndexes.some((index) => !allowed.has(index)))
      fail("rejoin peers exceed the current local sparse view");
    const maximumItems = input.maximumItemsPerNeighbor ?? this.#limits.maximumCatchUpItems;
    integer(maximumItems, "maximumItemsPerNeighbor", 1, this.#limits.maximumCatchUpItems);
    await this.setConnectivity("rejoining", input.logicalTime);
    const slice = await this.#options.membership.resolve({
      overlayId: this.#options.overlayId,
      membershipDigest: this.#options.membershipDigest,
      peerIndexes,
      logicalTime: input.logicalTime,
    });
    validateMembershipSlice(slice, this.#options.overlayId, this.#options.membershipDigest, peerIndexes);
    let contacted = 0;
    let admittedCount = 0;
    let duplicateCount = 0;
    let deferred = 0;
    const gaps: string[] = [];
    for (const peer of slice.peers) {
      if (peer.availability !== "active") {
        deferred += 1;
        continue;
      }
      const state = await this.restore(input.logicalTime);
      const afterSequence = state.neighborCursors.find((cursor) => cursor.peerIndex === peer.peerIndex)?.acknowledgedSequence ?? 0;
      let response: MeshSparseTransportCatchUpResponseV1;
      try {
        response = await this.#options.nextHop.catchUp({
          recipient: peer,
          overlayId: state.overlayId,
          membershipDigest: state.membershipDigest,
          requester: this.#localPeer,
          afterSequence,
          maximumItems,
          logicalTime: input.logicalTime,
        });
      } catch {
        deferred += 1;
        continue;
      }
      contacted += 1;
      validateCatchUpResponse(response, state, peer, afterSequence, maximumItems);
      if (response.truncated) {
        gaps.push(peer.peerId);
        deferred += 1;
        continue;
      }
      let acceptedAll = true;
      for (const record of response.records) {
        const outcome = await this.receive({
          overlayId: state.overlayId,
          membershipDigest: state.membershipDigest,
          sender: peer,
          delivery: record.delivery,
          logicalTime: input.logicalTime,
        });
        if (outcome.status === "admitted") admittedCount += 1;
        else if (outcome.status === "duplicate") duplicateCount += 1;
        else {
          deferred += 1;
          acceptedAll = false;
          break;
        }
      }
      if (acceptedAll) await this.#advanceCursor(peer, response.latestSequence, input.logicalTime);
    }
    const connectivity: MeshSparseTransportConnectivityV1 = gaps.length === 0 ? "active" : "rejoining";
    const state = await this.setConnectivity(connectivity, input.logicalTime);
    return Object.freeze({ contacted, admitted: admittedCount, duplicates: duplicateCount, deferred, gaps: Object.freeze(gaps), state });
  }

  /** Serves only retained local evidence to a peer in the current sparse view. */
  async catchUp(input: {
    readonly overlayId: string;
    readonly membershipDigest: MeshSparseOverlayDigestV2;
    readonly requester: MeshSparseMembershipPeerV1;
    readonly afterSequence: number;
    readonly maximumItems: number;
    readonly logicalTime: number;
  }): Promise<MeshSparseTransportCatchUpResponseV1> {
    this.#assertRemoteRequest(input.overlayId, input.membershipDigest, input.requester, input.logicalTime);
    integer(input.afterSequence, "afterSequence", 0, Number.MAX_SAFE_INTEGER);
    integer(input.maximumItems, "maximumItems", 1, this.#limits.maximumCatchUpItems);
    const view = await this.#assertCurrentNeighbor(input.requester);
    const state = await this.restore(input.logicalTime);
    const earliestAvailableSequence = state.history[0]?.localSequence ?? state.nextHistorySequence;
    const headSequence = state.nextHistorySequence - 1;
    const truncated = input.afterSequence + 1 < earliestAvailableSequence && input.afterSequence < headSequence;
    const selected: { providerSequence: number; delivery: MeshSparseDeliveryV2 }[] = [];
    const updates = new Set<string>();
    let latestSequence = input.afterSequence;
    if (!truncated) {
      for (const record of state.history) {
        if (record.localSequence <= input.afterSequence) continue;
        latestSequence = record.localSequence;
        if (
          selected.length < input.maximumItems &&
          record.delivery.update.expiresAtLogicalTime > input.logicalTime &&
          record.delivery.hop < record.delivery.update.maximumHops &&
          !updates.has(record.delivery.update.updateId)
        ) {
          updates.add(record.delivery.update.updateId);
          selected.push(Object.freeze({
            providerSequence: record.localSequence,
            delivery: createMeshSparseRelayDeliveryV2({
              schemaVersion: 2,
              profile: this.#options.profile,
              senderView: view,
              recipientPeerIndex: input.requester.peerIndex,
              predecessor: record.delivery,
            }),
          }));
        }
        if (selected.length >= input.maximumItems) break;
      }
      if (selected.length === 0) latestSequence = headSequence;
    }
    return Object.freeze({
      overlayId: state.overlayId,
      membershipDigest: state.membershipDigest,
      provider: Object.freeze({ peerIndex: state.localPeerIndex, peerId: state.localPeerId }),
      earliestAvailableSequence,
      latestSequence,
      truncated,
      records: Object.freeze(selected),
    });
  }

  async fetchCausal(input: {
    readonly overlayId: string;
    readonly membershipDigest: MeshSparseOverlayDigestV2;
    readonly requester: MeshSparseMembershipPeerV1;
    readonly deliveryDigest: MeshSparseOverlayDigestV2;
    readonly logicalTime: number;
  }): Promise<MeshSparseDeliveryV2 | undefined> {
    this.#assertRemoteRequest(input.overlayId, input.membershipDigest, input.requester, input.logicalTime);
    digest(input.deliveryDigest, "deliveryDigest");
    await this.#assertCurrentNeighbor(input.requester);
    return (await this.restore(input.logicalTime)).history
      .find((record) => record.delivery.deliveryDigest === input.deliveryDigest)?.delivery;
  }

  async #ensureCausal(
    record: MeshSparseTransportStateV1["inbox"][number],
    logicalTime: number,
  ): Promise<boolean> {
    const predecessor = record.delivery.previousDeliveryDigest;
    if (predecessor === null) return true;
    let state = await this.restore(logicalTime);
    if (hasHistory(state.history, predecessor)) return true;
    let evidence: MeshSparseDeliveryV2 | undefined;
    try {
      evidence = await this.#options.nextHop.fetchCausal({
        recipient: record.sender,
        overlayId: state.overlayId,
        membershipDigest: state.membershipDigest,
        requester: this.#localPeer,
        deliveryDigest: predecessor,
        logicalTime,
      });
    } catch {
      return false;
    }
    if (!evidence) return false;
    const validated = validateMeshSparseDeliveryV2(this.#options.profile, evidence);
    if (validated.deliveryDigest !== predecessor || validated.update.updateDigest !== record.delivery.update.updateDigest)
      return false;
    await this.#mutate(logicalTime, (current) => {
      if (hasHistory(current.history, predecessor)) return current;
      return nextState(current, {
        history: appendHistory(current, validated, logicalTime, this.#limits.maximumHistory),
        nextHistorySequence: current.nextHistorySequence + 1,
        lastLogicalTime: logicalTime,
      });
    });
    state = await this.restore(logicalTime);
    return hasHistory(state.history, predecessor);
  }

  async #assertCurrentNeighbor(peer: MeshSparseMembershipPeerV1) {
    const view = validateMeshSparsePeerViewV2(this.#options.profile, await this.#options.currentView());
    if (![...view.activeNeighborIndexes, ...view.reserveNeighborIndexes].includes(peer.peerIndex))
      fail("remote peer is outside the current local sparse view");
    return view;
  }

  #assertRemoteRequest(
    overlayId: string,
    membershipDigest: MeshSparseOverlayDigestV2,
    requester: MeshSparseMembershipPeerV1,
    logicalTime: number,
  ): void {
    if (overlayId !== this.#options.overlayId || membershipDigest !== this.#options.membershipDigest)
      fail("remote request binding is invalid");
    membershipPeer(requester, this.#options.profile.maximumPeers);
    integer(logicalTime, "logicalTime", 0, Number.MAX_SAFE_INTEGER);
  }

  async #advanceCursor(peer: MeshSparseMembershipPeerV1, sequence: number, logicalTime: number): Promise<void> {
    await this.#mutate(logicalTime, (state) => {
      const current = state.neighborCursors.find((cursor) => cursor.peerIndex === peer.peerIndex);
      if (current && current.acknowledgedSequence >= sequence) return state;
      const neighborCursors = [
        ...state.neighborCursors.filter((cursor) => cursor.peerIndex !== peer.peerIndex),
        Object.freeze({ peerIndex: peer.peerIndex, peerId: peer.peerId, acknowledgedSequence: sequence }),
      ].sort((left, right) => left.peerIndex - right.peerIndex);
      if (neighborCursors.length > this.#limits.maximumDirectPeers) fail("neighbor cursor capacity exceeded");
      return nextState(state, { neighborCursors, lastLogicalTime: logicalTime });
    });
  }

  async #removeOutbox(deliveryDigest: string, logicalTime: number): Promise<void> {
    await this.#mutate(logicalTime, (state) => {
      const outbox = state.outbox.filter((record) => record.delivery.deliveryDigest !== deliveryDigest);
      return outbox.length === state.outbox.length ? state : nextState(state, { outbox, lastLogicalTime: logicalTime });
    });
  }

  async #removeInbox(deliveryDigest: string, logicalTime: number): Promise<void> {
    await this.#mutate(logicalTime, (state) => {
      const inbox = state.inbox.filter((record) => record.delivery.deliveryDigest !== deliveryDigest);
      return inbox.length === state.inbox.length ? state : nextState(state, { inbox, lastLogicalTime: logicalTime });
    });
  }

  async #defer(kind: "outbox" | "inbox", deliveryDigest: string, reasonCode: string, logicalTime: number): Promise<void> {
    await this.#mutate(logicalTime, (state) => {
      if (kind === "outbox") {
        const record = state.outbox.find((candidate) => candidate.delivery.deliveryDigest === deliveryDigest);
        if (!record) return state;
        const attempts = record.attempts + 1;
        const replacement = Object.freeze({
          ...record,
          attempts,
          availableAtLogicalTime: safeAdd(logicalTime, retryDelay(attempts, this.#limits)),
          lastReasonCode: reasonCode,
        });
        return nextState(state, {
          outbox: state.outbox.map((candidate) => candidate === record ? replacement : candidate),
          lastLogicalTime: logicalTime,
        });
      }
      const record = state.inbox.find((candidate) => candidate.delivery.deliveryDigest === deliveryDigest);
      if (!record) return state;
      const attempts = record.attempts + 1;
      const replacement = Object.freeze({
        ...record,
        attempts,
        availableAtLogicalTime: safeAdd(logicalTime, retryDelay(attempts, this.#limits)),
        lastReasonCode: reasonCode,
      });
      return nextState(state, {
        inbox: state.inbox.map((candidate) => candidate === record ? replacement : candidate),
        lastLogicalTime: logicalTime,
      });
    });
  }

  async #mutate(
    logicalTime: number | undefined,
    operation: (state: MeshSparseTransportStateV1) => MeshSparseTransportStateV1,
  ): Promise<MeshSparseTransportStateV1> {
    if (logicalTime !== undefined) integer(logicalTime, "logicalTime", 0, Number.MAX_SAFE_INTEGER);
    for (let attempt = 0; attempt < this.#limits.maximumCommitAttempts; attempt += 1) {
      const current = await this.restore(logicalTime ?? 0);
      if (logicalTime !== undefined && logicalTime < current.lastLogicalTime) fail("transport logical time regressed");
      const next = operation(current);
      if (next === current) return current;
      if (await this.#options.store.compareAndSwap({
        overlayId: current.overlayId,
        expectedRevision: current.revision,
        expectedStateDigest: current.stateDigest,
        next,
      })) return next;
    }
    return fail("transport compare-and-swap attempts exhausted");
  }
}

/** Reference CAS store. Export/import the immutable state to preserve it across host restarts. */
export class InMemoryMeshSparseTransportStoreV1 implements MeshSparseTransportStoreV1 {
  readonly #states = new Map<string, MeshSparseTransportStateV1>();

  constructor(states: readonly MeshSparseTransportStateV1[] = []) {
    for (const state of states) this.#states.set(state.overlayId, state);
  }

  async load(overlayId: string) { return this.#states.get(overlayId); }

  async compareAndSwap(input: {
    readonly overlayId: string;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: MeshSparseOverlayDigestV2 | null;
    readonly next: MeshSparseTransportStateV1;
  }) {
    const current = this.#states.get(input.overlayId);
    if ((current?.revision ?? null) !== input.expectedRevision || (current?.stateDigest ?? null) !== input.expectedStateDigest)
      return false;
    this.#states.set(input.overlayId, input.next);
    return true;
  }

  snapshot(): readonly MeshSparseTransportStateV1[] {
    return Object.freeze([...this.#states.values()]);
  }
}

/**
 * Explicit neighbor-only direct exchange. It has no process-global registry;
 * callers wire at most the local active/reserve endpoints.
 */
export class MeshSparseDirectNextHopTransportV1 implements MeshSparseNextHopTransportV1 {
  readonly #maximumDirectPeers: number;
  readonly #endpoints = new Map<string, { readonly peerIndex: number; readonly endpoint: MeshSparseTransportEndpointV1; available: boolean }>();

  constructor(maximumDirectPeers = DEFAULT_LIMITS.maximumDirectPeers) {
    integer(maximumDirectPeers, "maximumDirectPeers", 1, 1_024);
    this.#maximumDirectPeers = maximumDirectPeers;
  }

  connect(peer: Pick<MeshSparseMembershipPeerV1, "peerIndex" | "peerId">, endpoint: MeshSparseTransportEndpointV1): void {
    integer(peer.peerIndex, "peerIndex", 0, Number.MAX_SAFE_INTEGER);
    identifier(peer.peerId, "peerId");
    if (!endpoint || typeof endpoint.receive !== "function" || typeof endpoint.catchUp !== "function" || typeof endpoint.fetchCausal !== "function")
      fail("direct peer endpoint is invalid");
    if (!this.#endpoints.has(peer.peerId) && this.#endpoints.size >= this.#maximumDirectPeers)
      fail("direct peer capacity exceeded");
    this.#endpoints.set(peer.peerId, { peerIndex: peer.peerIndex, endpoint, available: true });
  }

  disconnect(peerId: string): void { this.#endpoints.delete(peerId); }

  setAvailable(peerId: string, available: boolean): void {
    const current = this.#endpoints.get(peerId);
    if (!current) fail("direct peer is not connected");
    current.available = available;
  }

  async deliver(input: Parameters<MeshSparseNextHopTransportV1["deliver"]>[0]) {
    const endpoint = this.#resolve(input.recipient);
    if (!endpoint) return backpressured("next_hop_unavailable");
    return endpoint.receive(input);
  }

  async catchUp(input: Parameters<MeshSparseNextHopTransportV1["catchUp"]>[0]) {
    const endpoint = this.#resolve(input.recipient);
    if (!endpoint) throw new Error("next_hop_unavailable");
    return endpoint.catchUp(input);
  }

  async fetchCausal(input: Parameters<MeshSparseNextHopTransportV1["fetchCausal"]>[0]) {
    const endpoint = this.#resolve(input.recipient);
    if (!endpoint) return undefined;
    return endpoint.fetchCausal(input);
  }

  #resolve(peer: MeshSparseMembershipPeerV1): MeshSparseTransportEndpointV1 | undefined {
    const record = this.#endpoints.get(peer.peerId);
    return record?.available && record.peerIndex === peer.peerIndex ? record.endpoint : undefined;
  }
}

function appendHistory(
  state: MeshSparseTransportStateV1,
  delivery: MeshSparseDeliveryV2,
  observedAtLogicalTime: number,
  maximum: number,
): readonly MeshSparseTransportHistoryRecordV1[] {
  if (hasHistory(state.history, delivery.deliveryDigest)) return state.history;
  const record = Object.freeze({ localSequence: state.nextHistorySequence, delivery, observedAtLogicalTime });
  return Object.freeze([...state.history, record].slice(-maximum));
}

function hasHistory(history: readonly MeshSparseTransportHistoryRecordV1[], deliveryDigest: string): boolean {
  return history.some((record) => record.delivery.deliveryDigest === deliveryDigest);
}

function buildState(
  input: Omit<MeshSparseTransportStateV1, "schemaVersion" | "stateDigest">,
): MeshSparseTransportStateV1 {
  const body = { schemaVersion: 1 as const, ...input };
  return deepFreeze({ ...body, stateDigest: contentDigest(body) });
}

function nextState(
  state: MeshSparseTransportStateV1,
  changes: Partial<Omit<MeshSparseTransportStateV1, "schemaVersion" | "overlayId" | "localPeerIndex" | "localPeerId" | "membershipDigest" | "profileDigest" | "revision" | "stateDigest">>,
): MeshSparseTransportStateV1 {
  return buildState({
    overlayId: state.overlayId,
    localPeerIndex: state.localPeerIndex,
    localPeerId: state.localPeerId,
    membershipDigest: state.membershipDigest,
    profileDigest: state.profileDigest,
    revision: state.revision + 1,
    connectivity: changes.connectivity ?? state.connectivity,
    nextHistorySequence: changes.nextHistorySequence ?? state.nextHistorySequence,
    outbox: changes.outbox ?? state.outbox,
    inbox: changes.inbox ?? state.inbox,
    updates: changes.updates ?? state.updates,
    acknowledgedUpdates: changes.acknowledgedUpdates ?? state.acknowledgedUpdates,
    history: changes.history ?? state.history,
    neighborCursors: changes.neighborCursors ?? state.neighborCursors,
    lastLogicalTime: changes.lastLogicalTime ?? state.lastLogicalTime,
  });
}

function validateState(
  state: MeshSparseTransportStateV1,
  options: MeshSparsePeerTransportOptionsV1,
  configuredLimits: MeshSparseTransportLimitsV1,
): MeshSparseTransportStateV1 {
  if (!state || state.schemaVersion !== 1 || state.overlayId !== options.overlayId || state.localPeerIndex !== options.localPeerIndex || state.localPeerId !== options.localPeerId || state.membershipDigest !== options.membershipDigest || state.profileDigest !== options.profile.profileDigest)
    fail("transport state binding is invalid");
  integer(state.revision, "state.revision", 0, Number.MAX_SAFE_INTEGER);
  integer(state.nextHistorySequence, "state.nextHistorySequence", 1, Number.MAX_SAFE_INTEGER);
  integer(state.lastLogicalTime, "state.lastLogicalTime", 0, Number.MAX_SAFE_INTEGER);
  if (state.connectivity !== "active" && state.connectivity !== "partitioned" && state.connectivity !== "rejoining") fail("transport connectivity is invalid");
  if (!Array.isArray(state.outbox) || state.outbox.length > configuredLimits.maximumOutbox || !Array.isArray(state.inbox) || state.inbox.length > configuredLimits.maximumInbox || !Array.isArray(state.updates) || state.updates.length > configuredLimits.maximumUpdates || !Array.isArray(state.acknowledgedUpdates) || state.acknowledgedUpdates.length > configuredLimits.maximumHistory || !Array.isArray(state.history) || state.history.length > configuredLimits.maximumHistory || !Array.isArray(state.neighborCursors) || state.neighborCursors.length > configuredLimits.maximumDirectPeers)
    fail("transport state capacity is invalid");
  const deliveryIds = new Set<string>();
  for (const record of [...state.outbox, ...state.inbox]) {
    const delivery = validateMeshSparseDeliveryV2(options.profile, record.delivery);
    integer(record.attempts, "record.attempts", 0, Number.MAX_SAFE_INTEGER);
    integer(record.queuedAtLogicalTime, "record.queuedAtLogicalTime", 0, Number.MAX_SAFE_INTEGER);
    integer(record.availableAtLogicalTime, "record.availableAtLogicalTime", record.queuedAtLogicalTime, Number.MAX_SAFE_INTEGER);
    if (deliveryIds.has(delivery.deliveryDigest)) fail("transport pending delivery is duplicated");
    deliveryIds.add(delivery.deliveryDigest);
  }
  let previousSequence = 0;
  const historyIds = new Set<string>();
  for (const record of state.history) {
    integer(record.localSequence, "history.localSequence", previousSequence + 1, Number.MAX_SAFE_INTEGER);
    previousSequence = record.localSequence;
    validateMeshSparseDeliveryV2(options.profile, record.delivery);
    if (historyIds.has(record.delivery.deliveryDigest)) fail("transport history is duplicated");
    historyIds.add(record.delivery.deliveryDigest);
  }
  if (previousSequence >= state.nextHistorySequence) fail("transport history sequence is invalid");
  for (const record of state.updates) validateMeshSparseUpdateV2(options.profile, record.update);
  for (const record of state.acknowledgedUpdates) {
    identifier(record.updateId, "acknowledged updateId");
    digest(record.updateDigest, "acknowledged updateDigest");
    integer(record.acknowledgedAtLogicalTime, "acknowledgedAtLogicalTime", 0, Number.MAX_SAFE_INTEGER);
  }
  const rebuilt = buildState({
    overlayId: state.overlayId,
    localPeerIndex: state.localPeerIndex,
    localPeerId: state.localPeerId,
    membershipDigest: state.membershipDigest,
    profileDigest: state.profileDigest,
    revision: state.revision,
    connectivity: state.connectivity,
    nextHistorySequence: state.nextHistorySequence,
    outbox: state.outbox,
    inbox: state.inbox,
    updates: state.updates,
    acknowledgedUpdates: state.acknowledgedUpdates,
    history: state.history,
    neighborCursors: state.neighborCursors,
    lastLogicalTime: state.lastLogicalTime,
  });
  if (rebuilt.stateDigest !== state.stateDigest) fail("transport state digest is invalid");
  return state;
}

function validateMembershipSlice(
  slice: Awaited<ReturnType<MeshSparsePeerTransportOptionsV1["membership"]["resolve"]>>,
  overlayId: string,
  membershipDigest: MeshSparseOverlayDigestV2,
  requested: readonly number[],
): void {
  if (!slice || slice.schemaVersion !== 1 || slice.overlayId !== overlayId || slice.membershipDigest !== membershipDigest || slice.peers.length > requested.length)
    fail("membership slice binding is invalid");
  const allowed = new Set(requested);
  if (slice.peers.some((peer) => !allowed.has(peer.peerIndex))) fail("membership slice returned an unrequested peer");
}

function validateCatchUpResponse(
  response: MeshSparseTransportCatchUpResponseV1,
  state: MeshSparseTransportStateV1,
  peer: MeshSparseMembershipPeerV1,
  afterSequence: number,
  maximumItems: number,
): void {
  if (!response || response.overlayId !== state.overlayId || response.membershipDigest !== state.membershipDigest || response.provider.peerIndex !== peer.peerIndex || response.provider.peerId !== peer.peerId || response.records.length > maximumItems)
    fail("catch-up response binding is invalid");
  integer(response.earliestAvailableSequence, "earliestAvailableSequence", 1, Number.MAX_SAFE_INTEGER);
  integer(response.latestSequence, "latestSequence", afterSequence, Number.MAX_SAFE_INTEGER);
  let sequence = afterSequence;
  for (const record of response.records) {
    integer(record.providerSequence, "providerSequence", sequence + 1, response.latestSequence);
    sequence = record.providerSequence;
  }
}

function membershipPeer(peer: MeshSparseMembershipPeerV1, maximumPeers: number): MeshSparseMembershipPeerV1 {
  if (!peer || typeof peer !== "object") fail("membership peer is required");
  integer(peer.peerIndex, "peerIndex", 0, maximumPeers - 1);
  identifier(peer.peerId, "peerId");
  if (peer.availability !== "active" && peer.availability !== "suspect" && peer.availability !== "departed") fail("peer availability is invalid");
  return Object.freeze({ peerIndex: peer.peerIndex, peerId: peer.peerId, availability: peer.availability });
}

function retryablePeerPlaneReason(reasonCode: string | null): boolean {
  return reasonCode === "peer_plane_backpressure" || reasonCode === "recent_update_capacity_exceeded";
}

function retryDelay(attempts: number, configuredLimits: MeshSparseTransportLimitsV1): number {
  return Math.min(configuredLimits.retryMaximumDelay, configuredLimits.retryBaseDelay * 2 ** Math.min(attempts - 1, 30));
}

function safeAdd(left: number, right: number): number {
  if (left > Number.MAX_SAFE_INTEGER - right) return Number.MAX_SAFE_INTEGER;
  return left + right;
}

function batchSize(value: number | undefined, configuredLimits: MeshSparseTransportLimitsV1): number {
  const result = value ?? configuredLimits.maximumBatchItems;
  integer(result, "maximumItems", 1, configuredLimits.maximumBatchItems);
  return result;
}

function uniqueIndexes(values: readonly number[], maximumPeers: number): readonly number[] {
  if (!Array.isArray(values)) fail("neighborPeerIndexes are required");
  const result = [...new Set(values)];
  result.forEach((value) => integer(value, "neighborPeerIndex", 0, maximumPeers - 1));
  return Object.freeze(result.sort((left, right) => left - right));
}

function limits(input: MeshSparsePeerTransportOptionsV1["limits"]): MeshSparseTransportLimitsV1 {
  const result = { ...DEFAULT_LIMITS, ...input };
  for (const [key, value] of Object.entries(result)) integer(value, key, 1, 1_000_000);
  if (result.retryBaseDelay > result.retryMaximumDelay) fail("retry delay bounds are invalid");
  return Object.freeze(result);
}

function admission(input: MeshSparseDurableAdmissionV1): MeshSparseDurableAdmissionV1 {
  if (!input || (input.status !== "admitted" && input.status !== "duplicate" && input.status !== "backpressured" && input.status !== "rejected")) fail("transport admission result is invalid");
  return input;
}

function admitted(): MeshSparseDurableAdmissionV1 { return Object.freeze({ status: "admitted" }); }
function duplicate(): MeshSparseDurableAdmissionV1 { return Object.freeze({ status: "duplicate" }); }
function backpressured(reasonCode: string): MeshSparseDurableAdmissionV1 { return Object.freeze({ status: "backpressured", reasonCode }); }
function rejected(reasonCode: string): MeshSparseDurableAdmissionV1 { return Object.freeze({ status: "rejected", reasonCode }); }

function contentDigest(value: unknown): MeshSparseOverlayDigestV2 {
  return `sha256:${sha256Base64Url(new TextEncoder().encode(canonical(value)))}`;
}

function canonical(value: unknown): string {
  if (value === undefined) fail("undefined is not canonical JSON");
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function identifier(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length > 256 || !/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u.test(value)) fail(`${label} is invalid`);
}

function digest(value: unknown, label: string): asserts value is MeshSparseOverlayDigestV2 {
  if (typeof value !== "string" || !/^sha256:[A-Za-z0-9_-]{43}$/u.test(value)) fail(`${label} is invalid`);
}

function integer(value: unknown, label: string, minimum: number, maximum: number): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) fail(`${label} is invalid`);
}

function fail(message: string): never { throw new TypeError(message); }
