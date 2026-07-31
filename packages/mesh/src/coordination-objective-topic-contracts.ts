import type { SignedMeshEnvelope } from '@agentplat/mesh-protocol';

import type {
  MeshCoordinationTopicAddress,
  MeshCoordinationTopicLimits,
  MeshCoordinationTopicTime,
} from './coordination-topic-contracts.js';
import type {
  MeshObjectiveInboundProcessor,
  MeshObjectiveInboundRuntimeState,
} from './coordination-inbound-contracts.js';
import type { MeshObjectivePayload } from './coordination-objective-work-contracts.js';

/** An Objective topic route is always an exact process-local peer instance. */
export type MeshCoordinationObjectiveTopicAddress =
  MeshCoordinationTopicAddress;

/** One trusted receiver-time sample supplied outside the Objective topic driver. */
export type MeshCoordinationObjectiveTopicTime = MeshCoordinationTopicTime;

/** Hard ceilings retained by one independently scoped Objective driver. */
export interface MeshCoordinationObjectiveTopicLimits extends MeshCoordinationTopicLimits {}

/** Address-aware trusted clock used for Objective selection and delivery. */
export interface MeshCoordinationObjectiveTopicClock {
  now(
    address: MeshCoordinationObjectiveTopicAddress
  ): MeshCoordinationObjectiveTopicTime;
}

/** Frozen construction snapshot safe to expose for local inspection. */
export interface MeshCoordinationObjectiveTopicConfiguration extends MeshCoordinationObjectiveTopicLimits {
  readonly tenantId: string;
  readonly meshId: string;
}

/** Redacted local-only delivery detail; callback failures are ignored. */
export interface MeshCoordinationObjectiveTopicDiagnostic {
  readonly status: 'rejected' | 'unavailable';
  readonly code: string;
  readonly messageId: string;
  readonly target: MeshCoordinationObjectiveTopicAddress;
}

/** Construction options for one explicit, process-local Objective topic driver. */
export interface MeshCoordinationObjectiveTopicDriverOptions {
  readonly tenantId: string;
  readonly meshId: string;
  readonly clock: MeshCoordinationObjectiveTopicClock;
  readonly maximumEndpoints?: number;
  readonly maximumQueueDepth?: number;
  readonly maximumQueuedBytes?: number;
  readonly maximumDeliveriesPerPublish?: number;
  readonly maximumInternalStepsPerDrain?: number;
  readonly onDiagnostic?: (
    diagnostic: MeshCoordinationObjectiveTopicDiagnostic
  ) => void;
}

/** State and authenticated Objective processor installed at one exact endpoint. */
export interface MeshCoordinationObjectiveTopicRegistration {
  readonly state: MeshObjectiveInboundRuntimeState;
  readonly processor: MeshObjectiveInboundProcessor;
}

/** One already-signed Objective publication and optional bounded sender fanout. */
export interface MeshCoordinationObjectiveTopicPublishInput {
  readonly envelope: SignedMeshEnvelope<MeshObjectivePayload>;
  readonly fanout?: number;
}

/** Public delivery outcome, deliberately excluding exact rejection codes. */
export interface MeshCoordinationObjectiveTopicReceipt {
  readonly status: 'accepted' | 'rejected' | 'unavailable';
  readonly messageId: string;
  readonly target: MeshCoordinationObjectiveTopicAddress;
}

/** Mutable driver-owned endpoint around immutable inbound snapshots. */
export interface MeshCoordinationObjectiveTopicPeer {
  readonly address: MeshCoordinationObjectiveTopicAddress;
  getState(): MeshObjectiveInboundRuntimeState;
  publish(
    input: MeshCoordinationObjectiveTopicPublishInput
  ): Promise<readonly MeshCoordinationObjectiveTopicReceipt[]>;
  unregister(): void;
}

/** Bounded sender-view Objective delivery with no process-global routing. */
export interface MeshCoordinationObjectiveTopicDriver {
  readonly configuration: MeshCoordinationObjectiveTopicConfiguration;
  register(
    registration: MeshCoordinationObjectiveTopicRegistration
  ): MeshCoordinationObjectiveTopicPeer;
  idle(): Promise<void>;
  close(): Promise<void>;
}
