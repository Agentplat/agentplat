import type {
  CollectiveAgreementRequestPayloadV1,
  CollectiveAgreementResponsePayloadV1,
  CollectiveAgreementTransportV1,
  SignedCollectiveAgreementEnvelopeV1,
} from "./agreement-contracts.js";
import type { CollectiveAgreementPeerV1 } from "./agreement-peer.js";

/** Deterministic process-local router used by embeds and simulations. */
export class InMemoryCollectiveAgreementTransportV1 implements CollectiveAgreementTransportV1 {
  readonly #peers = new Map<string, CollectiveAgreementPeerV1>();

  register(peerId: string, peer: CollectiveAgreementPeerV1): void {
    if (!peerId || !peer) throw new TypeError("peerId and peer are required");
    if (this.#peers.has(peerId)) throw new Error("peer_already_registered");
    this.#peers.set(peerId, peer);
  }

  unregister(peerId: string): boolean {
    return this.#peers.delete(peerId);
  }

  async exchange<TRequest extends CollectiveAgreementRequestPayloadV1>(input: {
    readonly peerId: string;
    readonly request: SignedCollectiveAgreementEnvelopeV1<TRequest>;
    readonly signal?: AbortSignal;
  }): Promise<SignedCollectiveAgreementEnvelopeV1<CollectiveAgreementResponsePayloadV1> | null> {
    if (input.signal?.aborted) throw input.signal.reason;
    const peer = this.#peers.get(input.peerId);
    if (!peer) return null;
    const result = await peer.handle(input.request);
    return result.accepted ? (result.response ?? null) : null;
  }
}
