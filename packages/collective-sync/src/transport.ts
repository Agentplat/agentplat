import type {
  CollectiveSyncRequestPayloadV1,
  CollectiveSyncResponsePayloadV1,
  CollectiveSyncTransportV1,
  SignedCollectiveSyncEnvelopeV1,
} from "./contracts.js";
import type { CollectiveSyncPeerV1 } from "./peer.js";

/** Deterministic direct router for tests and embedded multi-peer hosts. */
export class InMemoryCollectiveSyncTransportV1 implements CollectiveSyncTransportV1 {
  readonly #peers = new Map<string, CollectiveSyncPeerV1>();
  register(peerId: string, peer: CollectiveSyncPeerV1): void {
    if (!peerId || !peer) throw new TypeError("peerId and peer are required");
    this.#peers.set(peerId, peer);
  }
  unregister(peerId: string): void {
    this.#peers.delete(peerId);
  }
  async exchange<TRequest extends CollectiveSyncRequestPayloadV1>(input: {
    readonly peerId: string;
    readonly request: SignedCollectiveSyncEnvelopeV1<TRequest>;
    readonly signal?: AbortSignal;
  }): Promise<SignedCollectiveSyncEnvelopeV1<CollectiveSyncResponsePayloadV1> | null> {
    if (input.signal?.aborted) throw input.signal.reason;
    return (await this.#peers.get(input.peerId)?.handle(input.request)) ?? null;
  }
}
