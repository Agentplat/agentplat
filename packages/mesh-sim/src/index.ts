import type {
  MeshLogicalTime,
  MeshPeerEffect,
  MeshPeerInput,
  MeshPeerReducer,
  MeshPeerState,
} from '@agentplat/mesh';

/** Versioned deterministic generator used only for simulation scheduling. */
export type MeshSimulationPrngVersion = 'xorshift32-v1';

/** Controls how much scenario information remains after one run. */
export type MeshSimulationRecordingMode = 'full' | 'digest' | 'metrics';

/** One peer running the production reducer inside a virtual environment. */
export interface MeshSimulationPeer {
  readonly peerId: string;
  readonly state: MeshPeerState;
  readonly reducer: MeshPeerReducer;
}

/** Explicit topology edge available to outbound message effects. */
export interface MeshSimulationLink {
  readonly fromPeerId: string;
  readonly toPeerId: string;
  readonly latency: number;
  readonly enabled: boolean;
}

/** Hard bounds that stop an invalid or runaway scenario. */
export interface MeshSimulationLimits {
  readonly maximumEvents: number;
  readonly maximumLogicalTime: MeshLogicalTime;
  readonly maximumQueuedEvents: number;
}

/** Frozen configuration that identifies a reproducible scenario. */
export interface MeshSimulationConfig {
  readonly seed: number;
  readonly prngVersion: MeshSimulationPrngVersion;
  readonly recordingMode: MeshSimulationRecordingMode;
  readonly peers: readonly MeshSimulationPeer[];
  readonly links: readonly MeshSimulationLink[];
  readonly limits: MeshSimulationLimits;
}

/** Total ordering key for one queued simulation event. */
export interface MeshSimulationOrder {
  readonly logicalTime: MeshLogicalTime;
  readonly priority: number;
  readonly insertionSequence: number;
}

/** Immutable event passed through the virtual priority queue. */
export interface MeshSimulationEvent {
  readonly eventId: string;
  readonly targetPeerId: string;
  readonly order: MeshSimulationOrder;
  readonly input: MeshPeerInput;
}

/** Redacted observation recorded after one production reducer transition. */
export interface MeshSimulationRecord {
  readonly eventId: string;
  readonly peerId: string;
  readonly order: MeshSimulationOrder;
  readonly inputKind: MeshPeerInput['kind'];
  readonly effectKinds: readonly MeshPeerEffect['kind'][];
  readonly stateDigest: string;
  readonly chainDigest: string;
}

/** Stable run counters suitable for comparison without retaining full state. */
export interface MeshSimulationMetrics {
  readonly processedEvents: number;
  readonly emittedEffects: number;
  readonly deliveredMessages: number;
  readonly rejectedMessages: number;
  readonly finalLogicalTime: MeshLogicalTime;
}

/** Complete result of one bounded scenario execution. */
export interface MeshSimulationTrace {
  readonly seed: number;
  readonly prngVersion: MeshSimulationPrngVersion;
  readonly configurationDigest: string;
  readonly chainDigest: string;
  readonly metrics: MeshSimulationMetrics;
  readonly records?: readonly MeshSimulationRecord[];
  readonly peerStates: Readonly<Record<string, MeshPeerState>>;
}

/** Invariant evaluated after every simulation event. */
export interface MeshSimulationInvariant {
  readonly name: string;
  evaluate(context: {
    event: MeshSimulationEvent;
    peerStates: Readonly<Record<string, MeshPeerState>>;
    queuedEvents: number;
  }): void;
}

/** Versioned snapshot used only with a matching configuration and code version. */
export interface MeshSimulationSnapshot {
  readonly schemaVersion: 1;
  readonly logicalTime: MeshLogicalTime;
  readonly insertionSequence: number;
  readonly peerStates: Readonly<Record<string, MeshPeerState>>;
  readonly queuedEvents: readonly MeshSimulationEvent[];
  readonly chainDigest: string;
}

/** Driver contract implemented by the deterministic simulation kernel. */
export interface MeshSimulationKernel {
  readonly config: MeshSimulationConfig;
  enqueue(event: MeshSimulationEvent): void;
  step(): Promise<MeshSimulationRecord | undefined>;
  runUntilIdle(): Promise<MeshSimulationTrace>;
  snapshot(): MeshSimulationSnapshot;
}

/** Canonical peer identifiers used by the packaged Alpha 1 scenario. */
export const THREE_PEER_SCENARIO_IDS = Object.freeze([
  'peer-a',
  'peer-b',
  'peer-c',
] as const);
