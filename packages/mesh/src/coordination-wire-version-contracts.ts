import type { MeshWireVersion } from '@agentplat/mesh-protocol';

import type { MeshPeerCardProjection } from './coordination-discovery-contracts.js';

/** Explicit compatibility bootstrap for one admitted peer process. */
export interface MeshWireVersionBootstrap {
  readonly peerId: string;
  readonly instanceId: string;
  readonly wireVersion: MeshWireVersion;
}

/** Immutable local selection policy created before outbound preparation. */
export interface MeshWireVersionPolicy {
  readonly allowedWireVersions: readonly MeshWireVersion[];
  readonly bootstraps: readonly MeshWireVersionBootstrap[];
}

/** Highest authenticated version already selected for one peer process. */
export interface MeshWireVersionHighWater {
  readonly tenantId: string;
  readonly meshId: string;
  readonly peerId: string;
  readonly instanceId: string;
  readonly peerCardId?: string;
  readonly cardRevision?: number;
  readonly wireVersion: MeshWireVersion;
}

/** Explicit local authorization to cross a retained downgrade fence. */
export interface MeshWireVersionResetDecision {
  readonly tenantId: string;
  readonly meshId: string;
  readonly peerId: string;
  readonly instanceId: string;
  readonly peerCardId: string;
  readonly cardRevision: number;
  readonly wireVersion: MeshWireVersion;
  readonly reason: string;
}

/** Pure selector input; remote transport outcomes are intentionally absent. */
export interface MeshWireVersionSelectionInput {
  readonly tenantId: string;
  readonly meshId: string;
  readonly peerId: string;
  readonly instanceId: string;
  readonly policy: MeshWireVersionPolicy;
  readonly peerCard?: MeshPeerCardProjection;
  readonly highWater?: MeshWireVersionHighWater;
  readonly reset?: MeshWireVersionResetDecision;
}

/** Exact binding that must be retained while preparing and signing. */
export interface MeshWireVersionSelectionBinding {
  readonly tenantId: string;
  readonly meshId: string;
  readonly peerId: string;
  readonly instanceId: string;
  readonly peerCardId?: string;
  readonly cardRevision?: number;
  readonly wireVersion: MeshWireVersion;
  readonly previousHighWater?: MeshWireVersion;
  readonly source: 'bootstrap' | 'verified_peer_card';
  readonly resetApplied: boolean;
}

export type MeshWireVersionSelection =
  | {
      readonly selected: true;
      readonly binding: MeshWireVersionSelectionBinding;
      readonly highWater: MeshWireVersionHighWater;
    }
  | {
      readonly selected: false;
      readonly code:
        | 'peer_card_unavailable'
        | 'wire_version_downgrade'
        | 'wire_version_unavailable';
    };
