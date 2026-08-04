import type {
  CollectiveMembershipRequestPayloadV1,
  CollectiveMembershipResponsePayloadV1,
  CollectiveMembershipTransportV1,
  SignedCollectiveMembershipEnvelopeV1,
} from "./contracts.js";
import type { CollectiveMembershipPeerV1 } from "./peer.js";

/** Deterministic direct router for tests and embedded multi-peer hosts. */
export class InMemoryCollectiveMembershipTransportV1 implements CollectiveMembershipTransportV1 {
  readonly #peers = new Map<string, CollectiveMembershipPeerV1>();

  register(peerId: string, peer: CollectiveMembershipPeerV1): void {
    if (!peerId || !peer) throw new TypeError("peerId and peer are required");
    if (this.#peers.has(peerId)) throw new Error("peer_already_registered");
    this.#peers.set(peerId, peer);
  }

  unregister(peerId: string): void {
    this.#peers.delete(peerId);
  }

  async exchange<TRequest extends CollectiveMembershipRequestPayloadV1>(input: {
    readonly peerId: string;
    readonly request: SignedCollectiveMembershipEnvelopeV1<TRequest>;
    readonly signal?: AbortSignal;
  }): Promise<SignedCollectiveMembershipEnvelopeV1<CollectiveMembershipResponsePayloadV1> | null> {
    if (input.signal?.aborted) return null;
    const peer = this.#peers.get(input.peerId);
    if (!peer) return null;
    const result = await peer.handle(input.request);
    return result.accepted ? (result.response ?? null) : null;
  }
}
