import type {
  CollectiveQuorumRequestPayloadV1,
  CollectiveQuorumResponsePayloadV1,
  CollectiveQuorumTransportV1,
  SignedCollectiveQuorumEnvelopeV1,
} from "./contracts.js";
import type { CollectiveQuorumPeerV1 } from "./peer.js";

/** Deterministic process-local router used by embeds, tests and simulations. */
export class InMemoryCollectiveQuorumTransportV1 implements CollectiveQuorumTransportV1 {
  readonly #peers = new Map<string, CollectiveQuorumPeerV1>();

  register(peerId: string, peer: CollectiveQuorumPeerV1): void {
    if (!peerId || !peer) throw new TypeError("peerId and peer are required");
    if (this.#peers.has(peerId)) throw new Error("peer_already_registered");
    this.#peers.set(peerId, peer);
  }

  unregister(peerId: string): boolean {
    return this.#peers.delete(peerId);
  }

  async exchange<TRequest extends CollectiveQuorumRequestPayloadV1>(input: {
    readonly peerId: string;
    readonly request: SignedCollectiveQuorumEnvelopeV1<TRequest>;
    readonly signal?: AbortSignal;
  }): Promise<SignedCollectiveQuorumEnvelopeV1<CollectiveQuorumResponsePayloadV1> | null> {
    if (input.signal?.aborted) throw input.signal.reason;
    const peer = this.#peers.get(input.peerId);
    if (!peer) return null;
    const result = await peer.handle(input.request);
    return result.accepted ? (result.response ?? null) : null;
  }
}
