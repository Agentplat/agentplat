import type {
  PlanningArtifactReplicationRequestPayloadV1,
  PlanningArtifactReplicationResponsePayloadV1,
  PlanningArtifactReplicationTransportV1,
  SignedPlanningArtifactReplicationEnvelopeV1,
} from "./replication-contracts.js";
import type { PlanningArtifactReplicationPeerV1 } from "./replication.js";

/** Deterministic direct router for embedded and conformance scenarios. */
export class InMemoryPlanningArtifactReplicationTransportV1 implements PlanningArtifactReplicationTransportV1 {
  readonly #peers = new Map<string, PlanningArtifactReplicationPeerV1>();

  register(peerId: string, peer: PlanningArtifactReplicationPeerV1): void {
    if (!peerId || !peer) throw new TypeError("peerId and peer are required");
    this.#peers.set(peerId, peer);
  }

  unregister(peerId: string): void {
    this.#peers.delete(peerId);
  }

  async exchange(input: {
    readonly peerId: string;
    readonly request: SignedPlanningArtifactReplicationEnvelopeV1<PlanningArtifactReplicationRequestPayloadV1>;
    readonly signal?: AbortSignal;
  }): Promise<SignedPlanningArtifactReplicationEnvelopeV1<PlanningArtifactReplicationResponsePayloadV1> | null> {
    if (input.signal?.aborted) throw input.signal.reason;
    return (await this.#peers.get(input.peerId)?.handle(input.request)) ?? null;
  }
}
