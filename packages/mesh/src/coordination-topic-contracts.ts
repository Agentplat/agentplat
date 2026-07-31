import type { SignedMeshEnvelope } from '@agentplat/mesh-protocol';

import type {
  MeshDiscoveryInboundProcessor,
  MeshDiscoveryInboundRuntimeState,
} from './coordination-inbound-contracts.js';
import type { MeshDiscoveryPayload } from './coordination-discovery-contracts.js';

/** Exact process-local route; neither peer IDs nor instance IDs are global. */
export interface MeshCoordinationTopicAddress {
  readonly tenantId: string;
  readonly meshId: string;
  readonly peerId: string;
  readonly instanceId: string;
}

/** One trusted receiver-time sample supplied outside the topic driver. */
export interface MeshCoordinationTopicTime {
  readonly verifiedAt: string;
  readonly receivedAt: number;
}

/** Address-aware trusted clock used for selection and delivery. */
export interface MeshCoordinationTopicClock {
  now(address: MeshCoordinationTopicAddress): MeshCoordinationTopicTime;
}

/** Hard ceilings retained by one independently scoped driver. */
export interface MeshCoordinationTopicLimits {
  readonly maximumEndpoints: number;
  readonly maximumQueueDepth: number;
  readonly maximumQueuedBytes: number;
  readonly maximumDeliveriesPerPublish: number;
  readonly maximumInternalStepsPerDrain: number;
}

/** Frozen construction snapshot safe to expose for local inspection. */
export interface MeshCoordinationTopicConfiguration extends MeshCoordinationTopicLimits {
  readonly tenantId: string;
  readonly meshId: string;
}

/** Redacted local-only delivery detail; callback failures are ignored. */
export interface MeshCoordinationTopicDiagnostic {
  readonly status: 'rejected' | 'unavailable';
  readonly code: string;
  readonly messageId: string;
  readonly target: MeshCoordinationTopicAddress;
}

/** Construction options for one explicit, process-local topic driver. */
export interface MeshCoordinationTopicDriverOptions {
  readonly tenantId: string;
  readonly meshId: string;
  readonly clock: MeshCoordinationTopicClock;
  readonly maximumEndpoints?: number;
  readonly maximumQueueDepth?: number;
  readonly maximumQueuedBytes?: number;
  readonly maximumDeliveriesPerPublish?: number;
  readonly maximumInternalStepsPerDrain?: number;
  readonly onDiagnostic?: (diagnostic: MeshCoordinationTopicDiagnostic) => void;
}

/** State and authenticated processor installed at one exact endpoint. */
export interface MeshCoordinationTopicRegistration {
  readonly state: MeshDiscoveryInboundRuntimeState;
  readonly processor: MeshDiscoveryInboundProcessor;
}

/** One already-signed discovery publication and optional sender fanout. */
export interface MeshCoordinationTopicPublishInput {
  readonly envelope: SignedMeshEnvelope<MeshDiscoveryPayload>;
  readonly fanout?: number;
}

/** Public delivery outcome, deliberately excluding exact rejection codes. */
export interface MeshCoordinationTopicReceipt {
  readonly status: 'accepted' | 'rejected' | 'unavailable';
  readonly messageId: string;
  readonly target: MeshCoordinationTopicAddress;
}

/** Mutable driver-owned endpoint around immutable inbound snapshots. */
export interface MeshCoordinationTopicPeer {
  readonly address: MeshCoordinationTopicAddress;
  getState(): MeshDiscoveryInboundRuntimeState;
  publish(
    input: MeshCoordinationTopicPublishInput
  ): Promise<readonly MeshCoordinationTopicReceipt[]>;
  unregister(): void;
}

/** Bounded sender-only topic delivery with no process-global registry. */
export interface MeshCoordinationTopicDriver {
  readonly configuration: MeshCoordinationTopicConfiguration;
  register(
    registration: MeshCoordinationTopicRegistration
  ): MeshCoordinationTopicPeer;
  idle(): Promise<void>;
  close(): Promise<void>;
}
