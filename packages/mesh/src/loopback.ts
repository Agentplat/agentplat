import type { SignedMeshEnvelope } from '@agentplat/mesh-protocol';

/** Delivery result at the in-memory transport boundary. */
export type MeshLoopbackReceipt =
  | {
      readonly accepted: true;
      readonly messageId: string;
    }
  | {
      readonly accepted: false;
      readonly messageId?: string;
      readonly reasonCode: string;
    };

/** One registered endpoint in a bounded in-memory transport. */
export interface MeshLoopbackEndpoint {
  readonly peerId: string;
  receive(envelope: SignedMeshEnvelope): Promise<MeshLoopbackReceipt>;
}

/**
 * Contract for the signed local transport used by examples and integration
 * tests. Delivery remains at-least-once and a receipt is not a domain ack.
 */
export interface MeshLoopbackTransport {
  register(endpoint: MeshLoopbackEndpoint): void;
  unregister(peerId: string): void;
  deliver(envelope: SignedMeshEnvelope): Promise<MeshLoopbackReceipt>;
}
