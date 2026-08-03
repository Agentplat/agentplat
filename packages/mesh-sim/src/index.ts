import {
  processMeshEnvelope,
  reduceMeshPeer,
  type MeshAdmissionPolicy,
  type MeshLogicalTime,
  type MeshPeerEffect,
  type MeshPeerInput,
  type MeshPeerState,
} from '@agentplat/mesh';
import type {
  MeshCryptoPolicy,
  MeshEnvelopeSigner,
  MeshEnvelopeVerifier,
  MeshKeyResolver,
} from '@agentplat/mesh-crypto';
import {
  MESH_PROTOCOL,
  MESH_SIGNATURE_ALGORITHM,
  MESH_SUPPORTED_WIRE_VERSIONS,
  MESH_WIRE_VERSION,
  canonicalizeMeshJsonBytes,
  validateSignedMeshEnvelope,
  type MeshProtocolOptions,
  type SignedMeshEnvelope,
  type UnsignedMeshEnvelope,
  type MeshWireVersion,
} from '@agentplat/mesh-protocol';

export * from './collective-evaluation.js';
export * from './collective-environment.js';
export * from './collective-closed-loop-contracts.js';
export * from './collective-closed-loop-resilience-contracts.js';
export * from './collective-closed-loop-action.js';
export * from './collective-closed-loop-runtime.js';
export * from './collective-closed-loop-runner.js';
export * from './collective-closed-loop-reference.js';
export * from './collective-closed-loop-replanning.js';
export * from './collective-closed-loop-fault-matrix.js';
export * from './collective-closed-loop-resilience-campaign.js';
export * from './collective-statistical-campaign-scale.js';
export * from './collective-statistical-campaign-bundle.js';
export * from './collective-statistical-campaign-aggregation.js';
export * from './collective-statistical-campaign-executor.js';
export * from './collective-statistical-campaign-artifact-stream.js';
export * from './collective-statistical-campaign-normative-analysis.js';
export * from './collective-statistical-campaign-normative-operation.js';
export * from './collective-statistical-campaign-normative-registry.js';
export * from './collective-statistical-campaign-registered-adapter.js';

export type MeshSimulationPrngVersion = 'xorshift32-v1';
export type MeshSimulationRecordingMode = 'full' | 'digest' | 'metrics';
export type MeshSimulationFaultKind =
  | 'peer.crash'
  | 'peer.resume'
  | 'message.drop'
  | 'message.duplicate'
  | 'message.delay'
  | 'message.reorder'
  | 'network.partition'
  | 'network.heal'
  | 'clock.offset';

interface MeshSimulationFaultBase {
  readonly faultId: string;
  readonly logicalTime: MeshLogicalTime;
  readonly priority: number;
}

export type MeshSimulationFault =
  | (MeshSimulationFaultBase & {
      readonly kind: 'peer.crash' | 'peer.resume';
      readonly peerId: string;
    })
  | (MeshSimulationFaultBase & {
      readonly kind: 'message.drop';
      readonly deliveryEventId: string;
    })
  | (MeshSimulationFaultBase & {
      readonly kind: 'message.duplicate';
      readonly deliveryEventId: string;
      readonly copies: number;
    })
  | (MeshSimulationFaultBase & {
      readonly kind: 'message.delay';
      readonly deliveryEventId: string;
      readonly delay: MeshLogicalTime;
    })
  | (MeshSimulationFaultBase & {
      readonly kind: 'message.reorder';
      readonly deliveryEventId: string;
      readonly newLogicalTime: MeshLogicalTime;
      readonly newPriority: number;
    })
  | (MeshSimulationFaultBase & {
      readonly kind: 'network.partition' | 'network.heal';
      readonly links: readonly {
        readonly fromPeerId: string;
        readonly toPeerId: string;
      }[];
    })
  | (MeshSimulationFaultBase & {
      readonly kind: 'clock.offset';
      readonly peerId: string;
      readonly offset: number;
    });

/** Closed, serialized fault schedule interpreted only at driver boundaries. */
export interface MeshSimulationFaultPlan {
  readonly schemaVersion: 1;
  readonly faults: readonly MeshSimulationFault[];
}

export const MESH_SIMULATION_FAULT_LIMITS = Object.freeze({
  maximumFaults: 4_096,
  maximumDuplicateCopies: 16,
  maximumClockOffset: 24 * 60 * 60 * 1_000,
  maximumLinksPerFault: 4_096,
});

const metricDeltaKeys = Object.freeze([
  'clockOffsetChanges',
  'crashSuppressedEvents',
  'delayedMessages',
  'deliveredMessages',
  'droppedMessages',
  'duplicatedMessages',
  'emittedEffects',
  'faultEvents',
  'heals',
  'partitionSuppressedMessages',
  'partitions',
  'peerCrashes',
  'peerResumes',
  'processedEvents',
  'rejectedMessages',
  'reorderedMessages',
] as const);

/** Runtime handles are excluded from configuration and trace digests. */
export interface MeshSimulationPeer {
  readonly peerId: string;
  readonly state: MeshPeerState;
  readonly signer: MeshEnvelopeSigner;
  readonly verifier: MeshEnvelopeVerifier;
  readonly resolver: MeshKeyResolver;
  readonly cryptoPolicy: MeshCryptoPolicy;
  readonly admissionPolicy: MeshAdmissionPolicy;
  readonly privateKey: CryptoKey;
  readonly outboundSequence?: number;
  /** Construction-bound outbound wire version for mixed-version scenarios. */
  readonly wireVersion?: MeshWireVersion;
  readonly crypto?: Crypto;
  readonly protocolOptions?: MeshProtocolOptions;
}

export interface MeshSimulationLink {
  readonly fromPeerId: string;
  readonly toPeerId: string;
  readonly latency: number;
  readonly enabled: boolean;
}

export interface MeshSimulationLimits {
  readonly maximumEvents: number;
  readonly maximumLogicalTime: MeshLogicalTime;
  readonly maximumQueuedEvents: number;
  readonly maximumInternalSteps: number;
}

export interface MeshSimulationConfig {
  readonly seed: number;
  readonly prngVersion: MeshSimulationPrngVersion;
  readonly recordingMode: MeshSimulationRecordingMode;
  readonly startTime: string;
  readonly peers: readonly MeshSimulationPeer[];
  readonly links: readonly MeshSimulationLink[];
  readonly limits: MeshSimulationLimits;
  readonly faultPlan?: MeshSimulationFaultPlan;
  readonly invariants?: readonly MeshSimulationInvariant[];
}

export type MeshSimulationAction =
  | {
      readonly kind: 'peer.input';
      readonly input: Exclude<
        MeshPeerInput,
        { readonly kind: 'effect.result' }
      >;
    }
  | {
      readonly kind: 'message.delivery';
      readonly envelope: SignedMeshEnvelope;
    }
  | {
      readonly kind: 'fault.apply';
      readonly fault: MeshSimulationFault;
    };

export interface MeshSimulationEventInput {
  readonly eventId: string;
  readonly targetPeerId: string;
  readonly logicalTime: MeshLogicalTime;
  readonly priority: number;
  readonly action: Exclude<
    MeshSimulationAction,
    { readonly kind: 'fault.apply' }
  >;
}

type MeshSimulationInternalEventInput = Omit<
  MeshSimulationEventInput,
  'action'
> & {
  readonly action: MeshSimulationAction;
};

export interface MeshSimulationOrder {
  readonly logicalTime: MeshLogicalTime;
  readonly priority: number;
  readonly insertionSequence: number;
}

export interface MeshSimulationEvent {
  readonly eventId: string;
  readonly targetPeerId: string;
  readonly order: MeshSimulationOrder;
  readonly action: MeshSimulationAction;
}

export interface MeshSimulationRecord {
  readonly eventId: string;
  readonly peerId: string;
  readonly order: MeshSimulationOrder;
  readonly inputKind: MeshSimulationAction['kind'];
  readonly inputDeliverySourcePeerId?: string;
  readonly actionDigest: string;
  readonly accepted?: boolean;
  readonly rejectionCode?: string;
  readonly faultId?: string;
  readonly faultKind?: MeshSimulationFaultKind;
  readonly faultApplied?: boolean;
  readonly effectKinds: readonly MeshPeerEffect['kind'][];
  readonly metricsDelta: MeshSimulationMetricsDelta;
  readonly transportOutcome: MeshSimulationTransportOutcome;
  readonly effectsDigest: string;
  readonly stateDigest: string;
  readonly chainDigest: string;
}

export type MeshSimulationMetricsDelta = Readonly<
  Omit<MeshSimulationMetrics, 'finalLogicalTime'>
>;

export interface MeshSimulationTransportOutcome {
  readonly delivered: number;
  readonly droppedByCrash: number;
  readonly droppedByPartition: number;
  readonly droppedByCrashAndPartition: number;
  readonly droppedByDestinationMissing: number;
  readonly deliveries: readonly MeshSimulationTransportDeliveryOutcome[];
}

export interface MeshSimulationTransportDeliveryOutcome {
  readonly eventId: string;
  readonly fromPeerId: string;
  readonly toPeerId: string;
  readonly outcome:
    | 'delivered'
    | 'crash'
    | 'partition'
    | 'crash_partition'
    | 'destination_missing';
}

export interface MeshSimulationMetrics {
  readonly processedEvents: number;
  readonly emittedEffects: number;
  readonly deliveredMessages: number;
  readonly rejectedMessages: number;
  readonly faultEvents: number;
  readonly peerCrashes: number;
  readonly peerResumes: number;
  readonly droppedMessages: number;
  readonly duplicatedMessages: number;
  readonly delayedMessages: number;
  readonly reorderedMessages: number;
  readonly partitions: number;
  readonly heals: number;
  readonly clockOffsetChanges: number;
  readonly crashSuppressedEvents: number;
  readonly partitionSuppressedMessages: number;
  readonly finalLogicalTime: MeshLogicalTime;
}

export interface MeshSimulationFaultRecord {
  readonly faultId: string;
  readonly kind: MeshSimulationFaultKind;
  readonly order: MeshSimulationOrder;
  readonly applied: boolean;
  readonly affectedEventIds: readonly string[];
  readonly affectedLinkIds: readonly string[];
  readonly affectedDeliveries: readonly MeshSimulationAffectedDelivery[];
}

export interface MeshSimulationAffectedDelivery {
  readonly eventId: string;
  readonly fromPeerId: string;
  readonly toPeerId: string;
  readonly order: MeshSimulationOrder;
}

export interface MeshSimulationTrace {
  readonly seed: number;
  readonly prngVersion: MeshSimulationPrngVersion;
  readonly configurationDigest: string;
  readonly faultPlanDigest: string;
  readonly faultPlan: MeshSimulationFaultPlan;
  readonly chainDigest: string;
  readonly metrics: MeshSimulationMetrics;
  readonly faults: readonly MeshSimulationFaultRecord[];
  readonly records?: readonly MeshSimulationRecord[];
  readonly peerStates: Readonly<Record<string, MeshPeerState>>;
}

export interface MeshSimulationInvariant {
  readonly name: string;
  evaluate(context: {
    event: MeshSimulationEvent;
    peerStates: Readonly<Record<string, MeshPeerState>>;
    queuedEvents: number;
  }): void;
}

export interface MeshSimulationSnapshot {
  readonly schemaVersion: 2;
  readonly configurationDigest: string;
  readonly faultPlanDigest: string;
  readonly logicalTime: MeshLogicalTime;
  readonly insertionSequence: number;
  readonly faultCursor: number;
  readonly peerStates: Readonly<Record<string, MeshPeerState>>;
  readonly outboundSequences: Readonly<Record<string, number>>;
  readonly prngStates: Readonly<Record<string, number>>;
  readonly peerAvailability: Readonly<Record<string, boolean>>;
  readonly clockOffsets: Readonly<Record<string, number>>;
  readonly topology: readonly MeshSimulationLink[];
  readonly queuedEvents: readonly MeshSimulationEvent[];
  readonly eventIds: readonly string[];
  readonly metrics: MeshSimulationMetrics;
  readonly records: readonly MeshSimulationRecord[];
  readonly faults: readonly MeshSimulationFaultRecord[];
  readonly chainDigest: string;
}

export interface MeshSimulationReplayResult {
  readonly matches: boolean;
  readonly expectedChainDigest: string;
  readonly actualChainDigest: string;
  readonly firstDivergence?: number;
}

export interface MeshSimulationKernel {
  readonly config: MeshSimulationConfig;
  readonly configurationDigest: string;
  enqueue(event: MeshSimulationEventInput): void;
  random(scope: string): number;
  step(): Promise<MeshSimulationRecord | undefined>;
  runUntilIdle(): Promise<MeshSimulationTrace>;
  snapshot(): MeshSimulationSnapshot;
}

interface PeerRuntime {
  readonly config: MeshSimulationPeer;
  state: MeshPeerState;
  outboundSequence: number;
  available: boolean;
}

/** Creates a bounded kernel after hashing its serializable configuration. */
export async function createMeshSimulationKernel(
  config: MeshSimulationConfig
): Promise<MeshSimulationKernel> {
  validateConfig(config);
  const faultPlan = normalizeFaultPlan(config.faultPlan, config);
  const frozenConfig = freezeSimulationConfig(config, faultPlan);
  const [configurationDigest, faultPlanDigest] = await Promise.all([
    digest(configurationProjection(frozenConfig, faultPlan)),
    digest(faultPlan),
  ]);
  return new DeterministicMeshSimulationKernel(
    frozenConfig,
    configurationDigest,
    faultPlan,
    faultPlanDigest
  );
}

/** Restores a strict v2 snapshot using the runtime handles from the same config. */
export async function restoreMeshSimulationKernel(
  config: MeshSimulationConfig,
  snapshot: unknown
): Promise<MeshSimulationKernel> {
  validateConfig(config);
  const faultPlan = normalizeFaultPlan(config.faultPlan, config);
  const frozenConfig = freezeSimulationConfig(config, faultPlan);
  const [configurationDigest, faultPlanDigest] = await Promise.all([
    digest(configurationProjection(frozenConfig, faultPlan)),
    digest(faultPlan),
  ]);
  const restored = await restoreSnapshot(
    snapshot,
    frozenConfig,
    configurationDigest,
    faultPlanDigest,
    faultPlan
  );
  return new DeterministicMeshSimulationKernel(
    frozenConfig,
    configurationDigest,
    faultPlan,
    faultPlanDigest,
    restored
  );
}

export async function runMeshSimulation(
  config: MeshSimulationConfig,
  events: readonly MeshSimulationEventInput[]
): Promise<MeshSimulationTrace> {
  const kernel = await createMeshSimulationKernel(config);
  for (const event of events) kernel.enqueue(event);
  return kernel.runUntilIdle();
}

export async function replayMeshSimulation(
  config: MeshSimulationConfig,
  events: readonly MeshSimulationEventInput[],
  expected: MeshSimulationTrace
): Promise<MeshSimulationReplayResult> {
  const actual = await runMeshSimulation(config, events);
  const expectedRecords = expected.records ?? [];
  const actualRecords = actual.records ?? [];
  let firstDivergence: number | undefined;
  const count = Math.max(expectedRecords.length, actualRecords.length);
  for (let index = 0; index < count; index += 1) {
    if (
      expectedRecords[index]?.chainDigest !== actualRecords[index]?.chainDigest
    ) {
      firstDivergence = index;
      break;
    }
  }
  const matches =
    expected.configurationDigest === actual.configurationDigest &&
    expected.chainDigest === actual.chainDigest;
  return Object.freeze({
    matches,
    expectedChainDigest: expected.chainDigest,
    actualChainDigest: actual.chainDigest,
    ...(matches || firstDivergence === undefined ? {} : { firstDivergence }),
  });
}

class DeterministicMeshSimulationKernel implements MeshSimulationKernel {
  readonly config: MeshSimulationConfig;
  readonly configurationDigest: string;
  readonly #faultPlan: MeshSimulationFaultPlan;
  readonly #faultPlanDigest: string;
  readonly #peers = new Map<string, PeerRuntime>();
  readonly #topology = new Map<string, MeshSimulationLink>();
  readonly #clockOffsets = new Map<string, number>();
  readonly #queue: MeshSimulationEvent[] = [];
  readonly #eventIds = new Set<string>();
  readonly #prngStates = new Map<string, number>();
  readonly #records: MeshSimulationRecord[] = [];
  readonly #faultRecords: MeshSimulationFaultRecord[] = [];
  #insertionSequence = 0;
  #faultCursor = 0;
  #logicalTime = 0;
  #processedEvents = 0;
  #emittedEffects = 0;
  #deliveredMessages = 0;
  #rejectedMessages = 0;
  #peerCrashes = 0;
  #peerResumes = 0;
  #droppedMessages = 0;
  #duplicatedMessages = 0;
  #delayedMessages = 0;
  #reorderedMessages = 0;
  #partitions = 0;
  #heals = 0;
  #clockOffsetChanges = 0;
  #crashSuppressedEvents = 0;
  #partitionSuppressedMessages = 0;
  #chainDigest: string;

  constructor(
    config: MeshSimulationConfig,
    configurationDigest: string,
    faultPlan: MeshSimulationFaultPlan,
    faultPlanDigest: string,
    snapshot?: MeshSimulationSnapshot
  ) {
    this.config = config;
    this.configurationDigest = configurationDigest;
    this.#faultPlan = faultPlan;
    this.#faultPlanDigest = faultPlanDigest;
    this.#chainDigest = configurationDigest;
    for (const peer of config.peers) {
      this.#peers.set(peer.peerId, {
        config: peer,
        state: peer.state,
        outboundSequence: peer.outboundSequence ?? 0,
        available: true,
      });
      this.#clockOffsets.set(peer.peerId, 0);
    }
    for (const link of config.links)
      this.#topology.set(linkKey(link.fromPeerId, link.toPeerId), link);
    if (snapshot === undefined) {
      for (const fault of faultPlan.faults) this.#enqueueFault(fault);
    } else {
      this.#restore(snapshot);
    }
  }

  enqueue(input: MeshSimulationEventInput): void {
    const internal = input as MeshSimulationInternalEventInput;
    if (
      typeof internal?.eventId === 'string' &&
      internal.eventId.startsWith('fault:')
    )
      throw new TypeError('Mesh simulation eventId uses a reserved namespace');
    if (internal?.action?.kind === 'fault.apply')
      throw new TypeError(
        'Mesh simulation faults must come from the configured fault plan'
      );
    this.#enqueue(internal);
  }

  #enqueue(input: MeshSimulationInternalEventInput): void {
    if (
      !input ||
      typeof input !== 'object' ||
      this.#eventIds.has(input.eventId)
    ) {
      throw new TypeError('Invalid or duplicate Mesh simulation event');
    }
    assertBoundedString(input.eventId, 'eventId', 768);
    if (
      !this.#peers.has(input.targetPeerId) ||
      !Number.isSafeInteger(input.logicalTime) ||
      input.logicalTime < this.#logicalTime ||
      input.logicalTime > this.config.limits.maximumLogicalTime ||
      !Number.isSafeInteger(input.priority)
    ) {
      throw new RangeError(
        'Mesh simulation event is outside configured bounds'
      );
    }
    if (this.#queue.length >= this.config.limits.maximumQueuedEvents) {
      throw new RangeError('Mesh simulation queue limit exceeded');
    }
    if (this.#insertionSequence >= maximumIssuedEvents(this.config))
      throw new RangeError('Mesh simulation event issuance limit exceeded');
    const action = freezeAction(input.action);
    this.#insertionSequence += 1;
    const event = Object.freeze({
      eventId: input.eventId,
      targetPeerId: input.targetPeerId,
      order: Object.freeze({
        logicalTime: input.logicalTime,
        priority: input.priority,
        insertionSequence: this.#insertionSequence,
      }),
      action,
    });
    this.#eventIds.add(input.eventId);
    this.#queue.push(event);
    this.#queue.sort(compareEvents);
  }

  random(scope: string): number {
    assertBoundedString(scope, 'random scope', 768);
    if (!this.#prngStates.has(scope) && this.#prngStates.size >= 4096)
      throw new RangeError('Mesh simulation PRNG stream limit exceeded');
    let state =
      this.#prngStates.get(scope) ?? mixSeed(this.config.seed >>> 0, scope);
    state = xorshift32(state);
    this.#prngStates.set(scope, state);
    return state / 0x1_0000_0000;
  }

  async step(): Promise<MeshSimulationRecord | undefined> {
    if (this.#queue.length === 0) return undefined;
    if (this.#processedEvents >= this.config.limits.maximumEvents) {
      throw new RangeError('Mesh simulation event limit exceeded');
    }
    const event = this.#queue.shift();
    if (!event)
      throw new TypeError('Mesh simulation queue became inconsistent');
    this.#logicalTime = event.order.logicalTime;
    const peer = this.#peers.get(event.targetPeerId);
    if (!peer) throw new TypeError('Mesh simulation target disappeared');
    const metricsBefore = this.#metrics();

    let effects: readonly MeshPeerEffect[] = Object.freeze([]);
    let transportOutcome = emptyTransportOutcome();
    const transportDeliveries: MeshSimulationTransportDeliveryOutcome[] = [];
    let accepted: boolean | undefined;
    let rejectionCode: string | undefined;
    let faultResult:
      | {
          readonly applied: boolean;
          readonly affectedEventIds: readonly string[];
          readonly affectedLinkIds: readonly string[];
          readonly affectedDeliveries: readonly MeshSimulationAffectedDelivery[];
        }
      | undefined;
    if (event.action.kind === 'fault.apply') {
      faultResult = this.#applyFault(event.action.fault);
      accepted = faultResult.applied;
      this.#faultCursor += 1;
      this.#faultRecords.push(
        Object.freeze({
          faultId: event.action.fault.faultId,
          kind: event.action.fault.kind,
          order: event.order,
          applied: faultResult.applied,
          affectedEventIds: faultResult.affectedEventIds,
          affectedLinkIds: faultResult.affectedLinkIds,
          affectedDeliveries: faultResult.affectedDeliveries,
        })
      );
    } else if (!peer.available) {
      accepted = false;
      rejectionCode = 'simulation_peer_crashed';
      this.#crashSuppressedEvents += 1;
      if (event.action.kind === 'message.delivery') {
        this.#rejectedMessages += 1;
        this.#droppedMessages += 1;
      }
    } else if (
      event.action.kind === 'message.delivery' &&
      !this.#linkEnabled(
        event.action.envelope.sender.peerId,
        event.targetPeerId
      )
    ) {
      accepted = false;
      rejectionCode = 'simulation_partitioned';
      this.#rejectedMessages += 1;
      this.#droppedMessages += 1;
      this.#partitionSuppressedMessages += 1;
    } else if (event.action.kind === 'peer.input') {
      const transition = reduceMeshPeer(
        peer.state,
        event.action.input,
        this.#logicalTime
      );
      peer.state = transition.state;
      effects = await this.#interpret(
        peer,
        transition.effects,
        event,
        transportDeliveries
      );
      transportOutcome = transportOutcomeFromDeliveries(transportDeliveries);
    } else {
      const decision = await processMeshEnvelope(peer.state, {
        envelope: event.action.envelope,
        verifiedAt: timestampAt(
          this.config.startTime,
          this.#logicalTime + (this.#clockOffsets.get(peer.config.peerId) ?? 0)
        ),
        receivedAt: this.#logicalTime,
        verifier: peer.config.verifier,
        resolver: peer.config.resolver,
        cryptoPolicy: peer.config.cryptoPolicy,
        admissionPolicy: peer.config.admissionPolicy,
        crypto: peer.config.crypto,
        protocolOptions: peer.config.protocolOptions,
      });
      accepted = decision.accepted;
      if (decision.accepted) {
        peer.state = decision.state;
        effects = await this.#interpret(
          peer,
          decision.effects,
          event,
          transportDeliveries
        );
        transportOutcome = transportOutcomeFromDeliveries(transportDeliveries);
      } else {
        rejectionCode = decision.code;
        this.#rejectedMessages += 1;
      }
    }

    this.#processedEvents += 1;
    this.#emittedEffects += effects.length;
    const peerStates = this.#peerStates();
    for (const invariant of this.config.invariants ?? []) {
      invariant.evaluate({
        event,
        peerStates,
        queuedEvents: this.#queue.length,
      });
    }
    const [actionDigest, effectsDigest, stateDigest] = await Promise.all([
      digest(event.action),
      digest(effects),
      digest(peerStates),
    ]);
    const recordBase = {
      eventId: event.eventId,
      peerId: event.targetPeerId,
      order: event.order,
      inputKind: event.action.kind,
      ...(event.action.kind === 'message.delivery'
        ? {
            inputDeliverySourcePeerId: event.action.envelope.sender.peerId,
          }
        : {}),
      actionDigest,
      ...(accepted === undefined ? {} : { accepted }),
      ...(rejectionCode === undefined ? {} : { rejectionCode }),
      ...(event.action.kind === 'fault.apply'
        ? {
            faultId: event.action.fault.faultId,
            faultKind: event.action.fault.kind,
            faultApplied: faultResult?.applied ?? false,
          }
        : {}),
      effectKinds: Object.freeze(effects.map((effect) => effect.kind)),
      metricsDelta: metricDelta(metricsBefore, this.#metrics()),
      transportOutcome,
      effectsDigest,
      stateDigest,
    };
    this.#chainDigest = await digest({
      previous: this.#chainDigest,
      record: recordBase,
    });
    const record = Object.freeze({
      ...recordBase,
      chainDigest: this.#chainDigest,
    });
    this.#records.push(record);
    return record;
  }

  async runUntilIdle(): Promise<MeshSimulationTrace> {
    while (this.#queue.length > 0) await this.step();
    return Object.freeze({
      seed: this.config.seed,
      prngVersion: this.config.prngVersion,
      configurationDigest: this.configurationDigest,
      faultPlanDigest: this.#faultPlanDigest,
      faultPlan: this.#faultPlan,
      chainDigest: this.#chainDigest,
      metrics: this.#metrics(),
      faults: Object.freeze([...this.#faultRecords]),
      ...(this.config.recordingMode === 'full'
        ? { records: Object.freeze([...this.#records]) }
        : {}),
      peerStates: this.#peerStates(),
    });
  }

  snapshot(): MeshSimulationSnapshot {
    return Object.freeze({
      schemaVersion: 2,
      configurationDigest: this.configurationDigest,
      faultPlanDigest: this.#faultPlanDigest,
      logicalTime: this.#logicalTime,
      insertionSequence: this.#insertionSequence,
      faultCursor: this.#faultCursor,
      peerStates: this.#peerStates(),
      outboundSequences: frozenRecord(
        [...this.#peers].map(([peerId, peer]) => [
          peerId,
          peer.outboundSequence,
        ])
      ),
      prngStates: frozenRecord([...this.#prngStates]),
      peerAvailability: frozenRecord(
        [...this.#peers].map(([peerId, peer]) => [peerId, peer.available])
      ),
      clockOffsets: frozenRecord([...this.#clockOffsets]),
      topology: Object.freeze(
        [...this.#topology.values()].map((link) => Object.freeze({ ...link }))
      ),
      queuedEvents: Object.freeze([...this.#queue]),
      eventIds: Object.freeze([...this.#eventIds].sort()),
      metrics: this.#metrics(),
      records: Object.freeze([...this.#records]),
      faults: Object.freeze([...this.#faultRecords]),
      chainDigest: this.#chainDigest,
    });
  }

  async #interpret(
    peer: PeerRuntime,
    initial: readonly MeshPeerEffect[],
    root: MeshSimulationEvent,
    transportDeliveries: MeshSimulationTransportDeliveryOutcome[]
  ): Promise<readonly MeshPeerEffect[]> {
    const effects = [...initial];
    const prepared = new Map<string, SignedMeshEnvelope>();
    for (let index = 0; index < effects.length; index += 1) {
      if (index >= this.config.limits.maximumInternalSteps) {
        throw new RangeError('Mesh simulation internal step limit exceeded');
      }
      const effect = effects[index];
      if (effect.kind === 'message.prepare') {
        if (peer.outboundSequence >= Number.MAX_SAFE_INTEGER)
          throw new RangeError('Mesh simulation outbound sequence exhausted');
        peer.outboundSequence += 1;
        const envelope = await this.#prepare(peer, effect);
        prepared.set(effect.effectId, envelope);
        const transition = reduceMeshPeer(
          peer.state,
          {
            kind: 'effect.result',
            effectId: effect.effectId,
            status: 'succeeded',
            preparedMessage: {
              messageId: envelope.messageId,
              type: envelope.type,
              audiencePeerId: effect.intent.audiencePeerId,
              expiresAt: this.#logicalTime + effect.intent.maximumLifetimeMs,
            },
          },
          this.#logicalTime
        );
        peer.state = transition.state;
        effects.push(...transition.effects);
      } else if (effect.kind === 'message.deliver') {
        const envelope = prepared.get(effect.preparationEffectId);
        if (!envelope || envelope.messageId !== effect.messageId) {
          throw new TypeError('Mesh simulation lacks prepared delivery');
        }
        const link = this.#topology.get(
          linkKey(peer.config.peerId, effect.audiencePeerId)
        );
        const recipient = this.#peers.get(effect.audiencePeerId);
        if (!recipient) {
          this.#rejectedMessages += 1;
          this.#droppedMessages += 1;
          transportDeliveries.push(
            Object.freeze({
              eventId: `delivery:${envelope.messageId}`,
              fromPeerId: peer.config.peerId,
              toPeerId: effect.audiencePeerId,
              outcome: 'destination_missing',
            })
          );
          continue;
        }
        if (!link?.enabled || !recipient?.available) {
          this.#rejectedMessages += 1;
          this.#droppedMessages += 1;
          if (!link?.enabled) this.#partitionSuppressedMessages += 1;
          if (!recipient.available) this.#crashSuppressedEvents += 1;
          transportDeliveries.push(
            Object.freeze({
              eventId: `delivery:${envelope.messageId}`,
              fromPeerId: peer.config.peerId,
              toPeerId: effect.audiencePeerId,
              outcome:
                !link?.enabled && !recipient.available
                  ? 'crash_partition'
                  : !link?.enabled
                    ? 'partition'
                    : 'crash',
            })
          );
          continue;
        }
        this.enqueue({
          eventId: `delivery:${envelope.messageId}`,
          targetPeerId: effect.audiencePeerId,
          logicalTime: this.#logicalTime + link.latency,
          priority: root.order.priority,
          action: { kind: 'message.delivery', envelope },
        });
        this.#deliveredMessages += 1;
        transportDeliveries.push(
          Object.freeze({
            eventId: `delivery:${envelope.messageId}`,
            fromPeerId: peer.config.peerId,
            toPeerId: effect.audiencePeerId,
            outcome: 'delivered',
          })
        );
      }
    }
    return Object.freeze(effects);
  }

  async #prepare(
    peer: PeerRuntime,
    effect: Extract<MeshPeerEffect, { readonly kind: 'message.prepare' }>
  ): Promise<SignedMeshEnvelope> {
    const sentAt = timestampAt(this.config.startTime, this.#logicalTime);
    const unsigned: UnsignedMeshEnvelope = {
      protocol: MESH_PROTOCOL,
      wireVersion: peer.config.wireVersion ?? MESH_WIRE_VERSION,
      messageId: deterministicMessageId(() =>
        this.random(`message:${peer.config.peerId}`)
      ),
      tenantId: peer.state.identity.tenantId,
      meshId: peer.state.identity.meshId,
      type: effect.intent.type,
      sender: {
        peerId: peer.state.identity.peerId,
        instanceId: peer.state.identity.instanceId,
      },
      audience: {
        kind: 'peer',
        peerId: effect.intent.audiencePeerId,
      },
      sequence: peer.outboundSequence,
      sentAt,
      expiresAt: timestampAt(
        this.config.startTime,
        this.#logicalTime + effect.intent.maximumLifetimeMs
      ),
      payload: effect.intent.payload,
      proof: {
        algorithm: MESH_SIGNATURE_ALGORITHM,
        keyId: peer.state.identity.keyId,
      },
      ...(effect.intent.causationId === undefined
        ? {}
        : { causationId: effect.intent.causationId }),
      ...(effect.intent.correlationId === undefined
        ? {}
        : { correlationId: effect.intent.correlationId }),
    };
    return peer.config.signer.sign({
      envelope: unsigned,
      privateKey: peer.config.privateKey,
      crypto: peer.config.crypto,
      protocolOptions: peer.config.protocolOptions,
    });
  }

  #peerStates(): Readonly<Record<string, MeshPeerState>> {
    return frozenRecord(
      [...this.#peers].map(([peerId, peer]) => [peerId, peer.state])
    );
  }

  #metrics(): MeshSimulationMetrics {
    return Object.freeze({
      processedEvents: this.#processedEvents,
      emittedEffects: this.#emittedEffects,
      deliveredMessages: this.#deliveredMessages,
      rejectedMessages: this.#rejectedMessages,
      faultEvents: this.#faultCursor,
      peerCrashes: this.#peerCrashes,
      peerResumes: this.#peerResumes,
      droppedMessages: this.#droppedMessages,
      duplicatedMessages: this.#duplicatedMessages,
      delayedMessages: this.#delayedMessages,
      reorderedMessages: this.#reorderedMessages,
      partitions: this.#partitions,
      heals: this.#heals,
      clockOffsetChanges: this.#clockOffsetChanges,
      crashSuppressedEvents: this.#crashSuppressedEvents,
      partitionSuppressedMessages: this.#partitionSuppressedMessages,
      finalLogicalTime: this.#logicalTime,
    });
  }

  #linkEnabled(fromPeerId: string, toPeerId: string): boolean {
    return this.#topology.get(linkKey(fromPeerId, toPeerId))?.enabled === true;
  }

  #enqueueFault(fault: MeshSimulationFault): void {
    this.#enqueue({
      eventId: `fault:${fault.faultId}`,
      targetPeerId: faultTargetPeerId(fault, this.config),
      logicalTime: fault.logicalTime,
      priority: fault.priority,
      action: { kind: 'fault.apply', fault },
    });
  }

  #applyFault(fault: MeshSimulationFault): {
    readonly applied: boolean;
    readonly affectedEventIds: readonly string[];
    readonly affectedLinkIds: readonly string[];
    readonly affectedDeliveries: readonly MeshSimulationAffectedDelivery[];
  } {
    if (fault.kind === 'peer.crash') {
      const peer = this.#peers.get(fault.peerId);
      if (!peer || !peer.available) return emptyFaultResult();
      peer.available = false;
      this.#peerCrashes += 1;
      const dropped = this.#queue.filter(
        (event) =>
          event.targetPeerId === fault.peerId &&
          event.action.kind === 'message.delivery'
      );
      for (const event of dropped) {
        this.#removeQueuedEvent(event.eventId);
        this.#droppedMessages += 1;
        this.#crashSuppressedEvents += 1;
      }
      return {
        applied: true,
        affectedEventIds: Object.freeze(dropped.map((event) => event.eventId)),
        affectedLinkIds: Object.freeze([]),
        affectedDeliveries: Object.freeze(
          dropped.map(affectedDeliveryMetadata)
        ),
      };
    }
    if (fault.kind === 'peer.resume') {
      const peer = this.#peers.get(fault.peerId);
      if (!peer || peer.available) return emptyFaultResult();
      peer.available = true;
      this.#peerResumes += 1;
      return {
        applied: true,
        affectedEventIds: Object.freeze([fault.peerId]),
        affectedLinkIds: Object.freeze([]),
        affectedDeliveries: Object.freeze([]),
      };
    }
    if (fault.kind === 'network.partition' || fault.kind === 'network.heal') {
      const enabled = fault.kind === 'network.heal';
      const affectedLinkIds: string[] = [];
      const droppedDeliveries: MeshSimulationEvent[] = [];
      const requestedKeys = new Set<string>();
      for (const requested of fault.links) {
        const key = linkKey(requested.fromPeerId, requested.toPeerId);
        requestedKeys.add(key);
        const link = this.#topology.get(key);
        if (!link || link.enabled === enabled) continue;
        this.#topology.set(key, Object.freeze({ ...link, enabled }));
        affectedLinkIds.push(key);
      }
      if (!enabled) {
        const dropped = this.#queue.filter(
          (event) =>
            event.action.kind === 'message.delivery' &&
            requestedKeys.has(
              linkKey(event.action.envelope.sender.peerId, event.targetPeerId)
            )
        );
        for (const event of dropped) {
          this.#removeQueuedEvent(event.eventId);
          this.#droppedMessages += 1;
          this.#partitionSuppressedMessages += 1;
          droppedDeliveries.push(event);
        }
      }
      if (affectedLinkIds.length > 0 || droppedDeliveries.length > 0) {
        if (enabled) this.#heals += 1;
        else this.#partitions += 1;
      }
      return {
        applied: affectedLinkIds.length > 0 || droppedDeliveries.length > 0,
        affectedEventIds: Object.freeze(
          droppedDeliveries.map((event) => event.eventId)
        ),
        affectedLinkIds: Object.freeze(affectedLinkIds),
        affectedDeliveries: Object.freeze(
          droppedDeliveries.map(affectedDeliveryMetadata)
        ),
      };
    }
    if (fault.kind === 'clock.offset') {
      const current = this.#clockOffsets.get(fault.peerId);
      if (current === undefined || current === fault.offset)
        return emptyFaultResult();
      this.#clockOffsets.set(fault.peerId, fault.offset);
      this.#clockOffsetChanges += 1;
      return {
        applied: true,
        affectedEventIds: Object.freeze([fault.peerId]),
        affectedLinkIds: Object.freeze([]),
        affectedDeliveries: Object.freeze([]),
      };
    }
    if (!('deliveryEventId' in fault)) return emptyFaultResult();
    const index = this.#queue.findIndex(
      (event) =>
        event.eventId === fault.deliveryEventId &&
        event.action.kind === 'message.delivery'
    );
    if (index < 0) return emptyFaultResult();
    const delivery = this.#queue[index]!;
    if (delivery.action.kind !== 'message.delivery')
      throw new TypeError('Mesh simulation delivery queue became inconsistent');
    if (fault.kind === 'message.drop') {
      this.#queue.splice(index, 1);
      this.#droppedMessages += 1;
      return {
        applied: true,
        affectedEventIds: Object.freeze([delivery.eventId]),
        affectedLinkIds: Object.freeze([]),
        affectedDeliveries: Object.freeze([affectedDeliveryMetadata(delivery)]),
      };
    }
    if (fault.kind === 'message.duplicate') {
      if (
        this.#queue.length + fault.copies >
          this.config.limits.maximumQueuedEvents ||
        this.#insertionSequence + fault.copies >
          maximumIssuedEvents(this.config)
      )
        throw new RangeError('Mesh simulation queue limit exceeded');
      const duplicateIds = Array.from(
        { length: fault.copies },
        (_, index) =>
          `${delivery.eventId}:duplicate:${fault.faultId}:${index + 1}`
      );
      for (const eventId of duplicateIds)
        assertBoundedString(eventId, 'duplicate eventId', 768);
      if (duplicateIds.some((eventId) => this.#eventIds.has(eventId)))
        throw new TypeError('Duplicate Mesh simulation fault delivery');
      const affected: string[] = [];
      for (let copy = 1; copy <= fault.copies; copy += 1) {
        const eventId = duplicateIds[copy - 1]!;
        this.#enqueueAction(
          eventId,
          delivery.targetPeerId,
          delivery.order.logicalTime,
          delivery.order.priority,
          delivery.action
        );
        affected.push(eventId);
      }
      this.#duplicatedMessages += affected.length;
      this.#deliveredMessages += affected.length;
      return {
        applied: true,
        affectedEventIds: Object.freeze(affected),
        affectedLinkIds: Object.freeze([]),
        affectedDeliveries: Object.freeze([]),
      };
    }
    if (fault.kind === 'message.delay') {
      const logicalTime = delivery.order.logicalTime + fault.delay;
      if (
        !Number.isSafeInteger(logicalTime) ||
        logicalTime > this.config.limits.maximumLogicalTime
      )
        throw new RangeError(
          'Mesh simulation delayed event exceeds time limit'
        );
      this.#queue[index] = Object.freeze({
        ...delivery,
        order: Object.freeze({ ...delivery.order, logicalTime }),
      });
      this.#queue.sort(compareEvents);
      this.#delayedMessages += 1;
      return {
        applied: true,
        affectedEventIds: Object.freeze([delivery.eventId]),
        affectedLinkIds: Object.freeze([]),
        affectedDeliveries: Object.freeze([]),
      };
    }
    if (fault.kind !== 'message.reorder') return emptyFaultResult();
    this.#queue[index] = Object.freeze({
      ...delivery,
      order: Object.freeze({
        ...delivery.order,
        logicalTime: fault.newLogicalTime,
        priority: fault.newPriority,
      }),
    });
    this.#queue.sort(compareEvents);
    this.#reorderedMessages += 1;
    return {
      applied: true,
      affectedEventIds: Object.freeze([delivery.eventId]),
      affectedLinkIds: Object.freeze([]),
      affectedDeliveries: Object.freeze([]),
    };
  }

  #removeQueuedEvent(eventId: string): void {
    const index = this.#queue.findIndex((event) => event.eventId === eventId);
    if (index >= 0) this.#queue.splice(index, 1);
  }

  #enqueueAction(
    eventId: string,
    targetPeerId: string,
    logicalTime: number,
    priority: number,
    action: MeshSimulationEventInput['action']
  ): void {
    this.enqueue({ eventId, targetPeerId, logicalTime, priority, action });
  }

  #restore(snapshot: MeshSimulationSnapshot): void {
    this.#logicalTime = snapshot.logicalTime;
    this.#insertionSequence = snapshot.insertionSequence;
    this.#faultCursor = snapshot.faultCursor;
    this.#chainDigest = snapshot.chainDigest;
    this.#processedEvents = snapshot.metrics.processedEvents;
    this.#emittedEffects = snapshot.metrics.emittedEffects;
    this.#deliveredMessages = snapshot.metrics.deliveredMessages;
    this.#rejectedMessages = snapshot.metrics.rejectedMessages;
    this.#peerCrashes = snapshot.metrics.peerCrashes;
    this.#peerResumes = snapshot.metrics.peerResumes;
    this.#droppedMessages = snapshot.metrics.droppedMessages;
    this.#duplicatedMessages = snapshot.metrics.duplicatedMessages;
    this.#delayedMessages = snapshot.metrics.delayedMessages;
    this.#reorderedMessages = snapshot.metrics.reorderedMessages;
    this.#partitions = snapshot.metrics.partitions;
    this.#heals = snapshot.metrics.heals;
    this.#clockOffsetChanges = snapshot.metrics.clockOffsetChanges;
    this.#crashSuppressedEvents = snapshot.metrics.crashSuppressedEvents;
    this.#partitionSuppressedMessages =
      snapshot.metrics.partitionSuppressedMessages;
    this.#queue.push(...snapshot.queuedEvents);
    for (const eventId of snapshot.eventIds) this.#eventIds.add(eventId);
    for (const [scope, state] of Object.entries(snapshot.prngStates))
      this.#prngStates.set(scope, state);
    for (const [peerId, state] of Object.entries(snapshot.peerStates)) {
      const peer = this.#peers.get(peerId);
      if (!peer)
        throw new TypeError('Mesh simulation restored peer is unknown');
      peer.state = state;
      peer.outboundSequence = snapshot.outboundSequences[peerId]!;
      peer.available = snapshot.peerAvailability[peerId]!;
    }
    this.#clockOffsets.clear();
    for (const [peerId, offset] of Object.entries(snapshot.clockOffsets))
      this.#clockOffsets.set(peerId, offset);
    this.#topology.clear();
    for (const link of snapshot.topology)
      this.#topology.set(linkKey(link.fromPeerId, link.toPeerId), link);
    this.#records.push(...snapshot.records);
    this.#faultRecords.push(...snapshot.faults);
  }
}

function validateConfig(config: MeshSimulationConfig): void {
  assertPlainData(config, 'configuration');
  if (
    config.prngVersion !== 'xorshift32-v1' ||
    !['full', 'digest', 'metrics'].includes(config.recordingMode) ||
    !Number.isSafeInteger(config.seed) ||
    typeof config.startTime !== 'string' ||
    !Number.isFinite(Date.parse(config.startTime)) ||
    !Array.isArray(config.peers) ||
    config.peers.length < 1 ||
    config.peers.length > 256 ||
    !isDenseArray(config.peers) ||
    !Array.isArray(config.links) ||
    config.links.length > 256 * 255 ||
    !isDenseArray(config.links) ||
    !config.limits ||
    typeof config.limits !== 'object'
  ) {
    throw new TypeError('Invalid Mesh simulation configuration');
  }
  const peerIds = new Set<string>();
  for (const peer of config.peers) {
    assertPlainData(peer, 'peer');
    assertBoundedString(peer.peerId, 'peerId', 256);
    assertPlainData(peer.state, 'peer state');
    assertPlainData(peer.state.identity, 'peer identity');
    if (
      peer.state.identity.peerId !== peer.peerId ||
      (peer.outboundSequence !== undefined &&
        (!Number.isSafeInteger(peer.outboundSequence) ||
          peer.outboundSequence < 0)) ||
      (peer.wireVersion !== undefined &&
        !MESH_SUPPORTED_WIRE_VERSIONS.includes(peer.wireVersion)) ||
      peerIds.has(peer.peerId)
    )
      throw new TypeError('Invalid or duplicate Mesh simulation peer');
    peerIds.add(peer.peerId);
  }
  const linkKeys = new Set<string>();
  for (const link of config.links) {
    assertPlainData(link, 'link');
    assertBoundedString(link.fromPeerId, 'link source peerId', 256);
    assertBoundedString(link.toPeerId, 'link target peerId', 256);
    if (
      !peerIds.has(link.fromPeerId) ||
      !peerIds.has(link.toPeerId) ||
      link.fromPeerId === link.toPeerId ||
      !Number.isSafeInteger(link.latency) ||
      link.latency < 0 ||
      typeof link.enabled !== 'boolean'
    )
      throw new TypeError('Invalid Mesh simulation link');
    const key = linkKey(link.fromPeerId, link.toPeerId);
    if (linkKeys.has(key))
      throw new TypeError('Duplicate Mesh simulation link');
    linkKeys.add(key);
  }
  assertPlainData(config.limits, 'limits');
  for (const value of Object.values(config.limits)) {
    if (
      typeof value !== 'number' ||
      !Number.isSafeInteger(value) ||
      value < 1
    ) {
      throw new RangeError('Invalid Mesh simulation limit');
    }
  }
  if (
    config.limits.maximumEvents >
    Math.floor(Number.MAX_SAFE_INTEGER / config.limits.maximumInternalSteps)
  )
    throw new RangeError('Mesh simulation outbound sequence capacity exceeded');
  const maximumSequenceIncrements =
    config.limits.maximumEvents * config.limits.maximumInternalSteps;
  if (
    config.peers.some(
      (peer) =>
        (peer.outboundSequence ?? 0) >
        Number.MAX_SAFE_INTEGER - maximumSequenceIncrements
    )
  )
    throw new RangeError('Mesh simulation outbound sequence capacity exceeded');
}

function configurationProjection(
  config: MeshSimulationConfig,
  faultPlan: MeshSimulationFaultPlan
): unknown {
  return {
    seed: config.seed,
    prngVersion: config.prngVersion,
    recordingMode: config.recordingMode,
    startTime: config.startTime,
    peers: config.peers.map((peer) => ({
      peerId: peer.peerId,
      state: peer.state,
      outboundSequence: peer.outboundSequence ?? 0,
      wireVersion: peer.wireVersion ?? MESH_WIRE_VERSION,
    })),
    links: config.links,
    limits: config.limits,
    faultPlan,
    invariants: (config.invariants ?? []).map((invariant) => invariant.name),
  };
}

function metricDelta(
  before: MeshSimulationMetrics,
  after: MeshSimulationMetrics
): MeshSimulationMetricsDelta {
  return Object.freeze(
    Object.fromEntries(
      metricDeltaKeys.map((key) => [key, after[key] - before[key]])
    )
  ) as MeshSimulationMetricsDelta;
}

function emptyFaultResult(): {
  readonly applied: false;
  readonly affectedEventIds: readonly string[];
  readonly affectedLinkIds: readonly string[];
  readonly affectedDeliveries: readonly MeshSimulationAffectedDelivery[];
} {
  return {
    applied: false,
    affectedEventIds: Object.freeze([]),
    affectedLinkIds: Object.freeze([]),
    affectedDeliveries: Object.freeze([]),
  };
}

function affectedDeliveryMetadata(
  event: MeshSimulationEvent
): MeshSimulationAffectedDelivery {
  if (event.action.kind !== 'message.delivery')
    throw new TypeError('Mesh simulation affected event is not a delivery');
  return Object.freeze({
    eventId: event.eventId,
    fromPeerId: event.action.envelope.sender.peerId,
    toPeerId: event.targetPeerId,
    order: event.order,
  });
}

function emptyTransportOutcome(): MeshSimulationTransportOutcome {
  return Object.freeze({
    delivered: 0,
    droppedByCrash: 0,
    droppedByPartition: 0,
    droppedByCrashAndPartition: 0,
    droppedByDestinationMissing: 0,
    deliveries: Object.freeze([]),
  });
}

function transportOutcomeFromDeliveries(
  deliveries: readonly MeshSimulationTransportDeliveryOutcome[]
): MeshSimulationTransportOutcome {
  return Object.freeze({
    delivered: deliveries.filter(({ outcome }) => outcome === 'delivered')
      .length,
    droppedByCrash: deliveries.filter(({ outcome }) => outcome === 'crash')
      .length,
    droppedByPartition: deliveries.filter(
      ({ outcome }) => outcome === 'partition'
    ).length,
    droppedByCrashAndPartition: deliveries.filter(
      ({ outcome }) => outcome === 'crash_partition'
    ).length,
    droppedByDestinationMissing: deliveries.filter(
      ({ outcome }) => outcome === 'destination_missing'
    ).length,
    deliveries: Object.freeze([...deliveries]),
  });
}

function freezeSimulationConfig(
  config: MeshSimulationConfig,
  faultPlan: MeshSimulationFaultPlan
): MeshSimulationConfig {
  return Object.freeze({
    seed: config.seed,
    prngVersion: config.prngVersion,
    recordingMode: config.recordingMode,
    startTime: config.startTime,
    peers: Object.freeze(
      config.peers.map((peer) =>
        Object.freeze({
          peerId: peer.peerId,
          state: restorePeerState(peer.state),
          signer: peer.signer,
          verifier: peer.verifier,
          resolver: peer.resolver,
          cryptoPolicy: deepFreezeCopy(peer.cryptoPolicy),
          admissionPolicy: peer.admissionPolicy,
          privateKey: peer.privateKey,
          ...(peer.outboundSequence === undefined
            ? {}
            : { outboundSequence: peer.outboundSequence }),
          wireVersion: peer.wireVersion ?? MESH_WIRE_VERSION,
          ...(peer.crypto === undefined ? {} : { crypto: peer.crypto }),
          ...(peer.protocolOptions === undefined
            ? {}
            : {
                protocolOptions: deepFreezeCopy(peer.protocolOptions),
              }),
        })
      )
    ),
    links: Object.freeze(
      config.links.map((link) => Object.freeze({ ...link }))
    ),
    limits: Object.freeze({ ...config.limits }),
    faultPlan,
    ...(config.invariants === undefined
      ? {}
      : {
          invariants: Object.freeze(
            config.invariants.map((invariant) =>
              Object.freeze({
                name: invariant.name,
                evaluate: invariant.evaluate,
              })
            )
          ),
        }),
  });
}

function freezeAction(action: MeshSimulationAction): MeshSimulationAction {
  if (action?.kind === 'peer.input') {
    return Object.freeze({
      kind: 'peer.input',
      input: deepFreezeCopy(action.input),
    });
  }
  if (action?.kind === 'message.delivery') {
    return Object.freeze({
      kind: 'message.delivery',
      envelope: deepFreezeCopy(action.envelope),
    });
  }
  if (action?.kind === 'fault.apply') {
    return Object.freeze({
      kind: 'fault.apply',
      fault: deepFreezeCopy(action.fault),
    });
  }
  throw new TypeError('Invalid Mesh simulation action');
}

function normalizeFaultPlan(
  input: MeshSimulationFaultPlan | undefined,
  config: MeshSimulationConfig
): MeshSimulationFaultPlan {
  if (input === undefined)
    return Object.freeze({ schemaVersion: 1, faults: Object.freeze([]) });
  assertPlainData(input, 'fault plan');
  assertExactKeys(
    input,
    ['faults', 'schemaVersion'],
    ['faults', 'schemaVersion']
  );
  if (
    input.schemaVersion !== 1 ||
    !Array.isArray(input.faults) ||
    input.faults.length > MESH_SIMULATION_FAULT_LIMITS.maximumFaults ||
    !isDenseArray(input.faults)
  )
    throw new TypeError('Invalid Mesh simulation fault plan');
  const peerIds = new Set(config.peers.map((peer) => peer.peerId));
  const topology = new Set(
    config.links.map((link) => linkKey(link.fromPeerId, link.toPeerId))
  );
  const faultIds = new Set<string>();
  const faults = input.faults.map((fault) => {
    assertPlainData(fault, 'fault');
    const common = ['faultId', 'kind', 'logicalTime', 'priority'];
    const required =
      fault.kind === 'peer.crash' || fault.kind === 'peer.resume'
        ? [...common, 'peerId']
        : fault.kind === 'message.drop'
          ? [...common, 'deliveryEventId']
          : fault.kind === 'message.duplicate'
            ? [...common, 'copies', 'deliveryEventId']
            : fault.kind === 'message.delay'
              ? [...common, 'delay', 'deliveryEventId']
              : fault.kind === 'message.reorder'
                ? [
                    ...common,
                    'deliveryEventId',
                    'newLogicalTime',
                    'newPriority',
                  ]
                : fault.kind === 'network.partition' ||
                    fault.kind === 'network.heal'
                  ? [...common, 'links']
                  : fault.kind === 'clock.offset'
                    ? [...common, 'offset', 'peerId']
                    : undefined;
    if (required === undefined)
      throw new TypeError('Unsupported Mesh simulation fault');
    assertExactKeys(fault, required, required);
    assertBoundedString(fault.faultId, 'faultId');
    if (
      faultIds.has(fault.faultId) ||
      !Number.isSafeInteger(fault.logicalTime) ||
      fault.logicalTime < 0 ||
      fault.logicalTime > config.limits.maximumLogicalTime ||
      !Number.isSafeInteger(fault.priority)
    )
      throw new TypeError('Invalid Mesh simulation fault identity or time');
    faultIds.add(fault.faultId);
    if (
      'peerId' in fault &&
      (typeof fault.peerId !== 'string' || !peerIds.has(fault.peerId))
    )
      throw new TypeError('Mesh simulation fault peer is unknown');
    if ('peerId' in fault)
      assertBoundedString(fault.peerId, 'fault peerId', 256);
    if ('deliveryEventId' in fault)
      assertBoundedString(fault.deliveryEventId, 'deliveryEventId', 768);
    if (
      fault.kind === 'message.duplicate' &&
      (!Number.isSafeInteger(fault.copies) ||
        fault.copies < 1 ||
        fault.copies > MESH_SIMULATION_FAULT_LIMITS.maximumDuplicateCopies)
    )
      throw new RangeError('Mesh simulation duplicate bound exceeded');
    if (
      fault.kind === 'message.delay' &&
      (!Number.isSafeInteger(fault.delay) ||
        fault.delay < 1 ||
        fault.delay > config.limits.maximumLogicalTime)
    )
      throw new RangeError('Mesh simulation delay is invalid');
    if (
      fault.kind === 'message.reorder' &&
      (!Number.isSafeInteger(fault.newLogicalTime) ||
        fault.newLogicalTime < fault.logicalTime ||
        fault.newLogicalTime > config.limits.maximumLogicalTime ||
        !Number.isSafeInteger(fault.newPriority))
    )
      throw new RangeError('Mesh simulation reorder is invalid');
    if (
      fault.kind === 'clock.offset' &&
      (!Number.isSafeInteger(fault.offset) ||
        Math.abs(fault.offset) >
          MESH_SIMULATION_FAULT_LIMITS.maximumClockOffset ||
        Date.parse(config.startTime) + fault.logicalTime + fault.offset < 0)
    )
      throw new RangeError('Mesh simulation clock offset is invalid');
    if (fault.kind === 'network.partition' || fault.kind === 'network.heal') {
      if (
        !Array.isArray(fault.links) ||
        fault.links.length < 1 ||
        fault.links.length >
          MESH_SIMULATION_FAULT_LIMITS.maximumLinksPerFault ||
        !isDenseArray(fault.links)
      )
        throw new RangeError('Mesh simulation fault link bound exceeded');
      const seen = new Set<string>();
      for (const link of fault.links) {
        assertPlainData(link, 'fault link');
        assertExactKeys(
          link,
          ['fromPeerId', 'toPeerId'],
          ['fromPeerId', 'toPeerId']
        );
        assertBoundedString(link.fromPeerId, 'fault link source peerId', 256);
        assertBoundedString(link.toPeerId, 'fault link target peerId', 256);
        const key = linkKey(link.fromPeerId, link.toPeerId);
        if (!topology.has(key) || seen.has(key))
          throw new TypeError('Invalid Mesh simulation fault link');
        seen.add(key);
      }
    }
    return deepFreezeCopy(fault) as MeshSimulationFault;
  });
  return Object.freeze({ schemaVersion: 1, faults: Object.freeze(faults) });
}

async function restoreSnapshot(
  input: unknown,
  config: MeshSimulationConfig,
  configurationDigest: string,
  faultPlanDigest: string,
  faultPlan: MeshSimulationFaultPlan
): Promise<MeshSimulationSnapshot> {
  assertPlainData(input, 'snapshot');
  assertExactKeys(
    input,
    [
      'chainDigest',
      'clockOffsets',
      'configurationDigest',
      'eventIds',
      'faultCursor',
      'faultPlanDigest',
      'faults',
      'insertionSequence',
      'logicalTime',
      'metrics',
      'outboundSequences',
      'peerAvailability',
      'peerStates',
      'prngStates',
      'queuedEvents',
      'records',
      'schemaVersion',
      'topology',
    ],
    [
      'chainDigest',
      'clockOffsets',
      'configurationDigest',
      'eventIds',
      'faultCursor',
      'faultPlanDigest',
      'faults',
      'insertionSequence',
      'logicalTime',
      'metrics',
      'outboundSequences',
      'peerAvailability',
      'peerStates',
      'prngStates',
      'queuedEvents',
      'records',
      'schemaVersion',
      'topology',
    ]
  );
  const snapshot = input as unknown as MeshSimulationSnapshot;
  if (
    snapshot.schemaVersion !== 2 ||
    snapshot.configurationDigest !== configurationDigest ||
    snapshot.faultPlanDigest !== faultPlanDigest ||
    !isDigest(snapshot.chainDigest) ||
    !Number.isSafeInteger(snapshot.logicalTime) ||
    snapshot.logicalTime < 0 ||
    snapshot.logicalTime > config.limits.maximumLogicalTime ||
    !Number.isSafeInteger(snapshot.insertionSequence) ||
    snapshot.insertionSequence < 0 ||
    snapshot.insertionSequence > maximumIssuedEvents(config) ||
    !Number.isSafeInteger(snapshot.faultCursor) ||
    snapshot.faultCursor < 0 ||
    snapshot.faultCursor > faultPlan.faults.length ||
    !Array.isArray(snapshot.queuedEvents) ||
    snapshot.queuedEvents.length > config.limits.maximumQueuedEvents ||
    !isDenseArray(snapshot.queuedEvents) ||
    !Array.isArray(snapshot.records) ||
    snapshot.records.length > config.limits.maximumEvents ||
    !isDenseArray(snapshot.records) ||
    !Array.isArray(snapshot.faults) ||
    snapshot.faults.length > faultPlan.faults.length ||
    !isDenseArray(snapshot.faults) ||
    !Array.isArray(snapshot.eventIds) ||
    snapshot.eventIds.length > snapshot.insertionSequence ||
    !isDenseArray(snapshot.eventIds)
  )
    throw new TypeError('Invalid Mesh simulation snapshot');
  const peerIds = config.peers.map((peer) => peer.peerId).sort();
  const peerIdSet = new Set(peerIds);
  for (const [name, record] of Object.entries({
    peerStates: snapshot.peerStates,
    outboundSequences: snapshot.outboundSequences,
    prngStates: snapshot.prngStates,
    peerAvailability: snapshot.peerAvailability,
    clockOffsets: snapshot.clockOffsets,
  }))
    assertDataRecord(record, `snapshot ${name}`);
  assertExactRecordKeys(snapshot.peerStates, peerIds, 'peerStates');
  assertExactRecordKeys(
    snapshot.outboundSequences,
    peerIds,
    'outboundSequences'
  );
  assertExactRecordKeys(snapshot.peerAvailability, peerIds, 'peerAvailability');
  assertExactRecordKeys(snapshot.clockOffsets, peerIds, 'clockOffsets');
  const restoredPeerStates = new Map<string, MeshPeerState>();
  for (const peer of config.peers) {
    const state = restorePeerState(snapshot.peerStates[peer.peerId]!);
    restoredPeerStates.set(peer.peerId, state);
    if (
      !state ||
      state.identity?.peerId !== peer.peerId ||
      state.identity.tenantId !== peer.state.identity.tenantId ||
      state.identity.meshId !== peer.state.identity.meshId ||
      state.lastLogicalTime > snapshot.logicalTime ||
      !Number.isSafeInteger(snapshot.outboundSequences[peer.peerId]) ||
      snapshot.outboundSequences[peer.peerId]! < 0 ||
      typeof snapshot.peerAvailability[peer.peerId] !== 'boolean' ||
      !Number.isSafeInteger(snapshot.clockOffsets[peer.peerId]) ||
      Math.abs(snapshot.clockOffsets[peer.peerId]!) >
        MESH_SIMULATION_FAULT_LIMITS.maximumClockOffset
    )
      throw new TypeError('Invalid Mesh simulation snapshot peer');
  }
  const prngEntries = Object.entries(snapshot.prngStates);
  if (prngEntries.length > 4096)
    throw new RangeError('Mesh simulation PRNG stream limit exceeded');
  for (const [scope, state] of prngEntries) {
    assertBoundedString(scope, 'random scope', 768);
    if (!Number.isSafeInteger(state) || state < 0 || state > 0xffff_ffff)
      throw new TypeError('Invalid Mesh simulation PRNG snapshot');
  }
  const topology = validateSnapshotTopology(snapshot.topology, config);
  const queuedEvents = snapshot.queuedEvents.map((event) =>
    validateSnapshotEvent(event, snapshot, config, peerIdSet)
  );
  const queuedInsertionSequences = new Set(
    queuedEvents.map((event) => event.order.insertionSequence)
  );
  if (queuedInsertionSequences.size !== queuedEvents.length)
    throw new TypeError(
      'Mesh simulation snapshot queue insertion sequence is not unique'
    );
  for (let index = 1; index < queuedEvents.length; index += 1)
    if (compareEvents(queuedEvents[index - 1]!, queuedEvents[index]!) >= 0)
      throw new TypeError('Mesh simulation snapshot queue is not ordered');
  const eventIds = [...snapshot.eventIds];
  if (
    eventIds.some(
      (eventId) =>
        typeof eventId !== 'string' ||
        eventId.length < 1 ||
        new TextEncoder().encode(eventId).byteLength > 768
    ) ||
    eventIds.length !== snapshot.insertionSequence ||
    new Set(eventIds).size !== eventIds.length ||
    queuedEvents.some((event) => !eventIds.includes(event.eventId)) ||
    faultPlan.faults.some(
      (fault) => !eventIds.includes(`fault:${fault.faultId}`)
    )
  )
    throw new TypeError('Invalid Mesh simulation snapshot event IDs');
  const metrics = validateMetrics(snapshot.metrics, snapshot);
  const records = snapshot.records.map((record) => {
    validateRecord(record, config, peerIdSet, snapshot.insertionSequence);
    return deepFreezeCopy(record);
  }) as MeshSimulationRecord[];
  let chain = configurationDigest;
  const issuedInsertionSequences = new Set(queuedInsertionSequences);
  for (const record of records) {
    if (issuedInsertionSequences.has(record.order.insertionSequence))
      throw new TypeError(
        'Mesh simulation snapshot insertion sequence is not unique'
      );
    issuedInsertionSequences.add(record.order.insertionSequence);
    const { chainDigest, ...base } = record;
    chain = await digest({ previous: chain, record: base });
    if (chain !== chainDigest)
      throw new TypeError('Mesh simulation snapshot record chain is invalid');
  }
  if (
    chain !== snapshot.chainDigest ||
    records.length !== metrics.processedEvents
  )
    throw new TypeError('Mesh simulation snapshot digest is invalid');
  const recordedMetricTotals = Object.fromEntries(
    metricDeltaKeys.map((key) => [key, 0])
  ) as Record<(typeof metricDeltaKeys)[number], number>;
  for (const record of records)
    for (const key of metricDeltaKeys) {
      const total = recordedMetricTotals[key] + record.metricsDelta[key];
      if (!Number.isSafeInteger(total))
        throw new TypeError('Mesh simulation snapshot metrics overflow');
      recordedMetricTotals[key] = total;
    }
  if (metricDeltaKeys.some((key) => metrics[key] !== recordedMetricTotals[key]))
    throw new TypeError(
      'Mesh simulation snapshot metrics do not match records'
    );
  const peerStatesDigest = await digest(snapshot.peerStates);
  const expectedPeerStatesDigest =
    records.length > 0
      ? records.at(-1)!.stateDigest
      : await digest(
          frozenRecord(
            config.peers.map((peer) => [peer.peerId, peer.state] as const)
          )
        );
  if (peerStatesDigest !== expectedPeerStatesDigest)
    throw new TypeError('Mesh simulation snapshot peer digest is invalid');
  const plannedFaults = new Map(
    faultPlan.faults.map((fault) => [fault.faultId, fault])
  );
  const faults = snapshot.faults.map((fault) =>
    validateFaultRecord(
      fault,
      records,
      plannedFaults,
      eventIds,
      queuedEvents,
      config
    )
  );
  const removedDeliveryIds = new Set<string>();
  for (const fault of faults)
    for (const delivery of fault.affectedDeliveries) {
      if (removedDeliveryIds.has(delivery.eventId))
        throw new TypeError(
          'Mesh simulation snapshot delivery is attributed to multiple faults'
        );
      removedDeliveryIds.add(delivery.eventId);
    }
  const historicalAvailability = new Map(
    config.peers.map((peer) => [peer.peerId, true])
  );
  const historicalTopology = new Map(
    config.links.map((link) => [
      linkKey(link.fromPeerId, link.toPeerId),
      link.enabled,
    ])
  );
  for (const record of records) {
    if (record.inputKind === 'fault.apply') {
      const planned = plannedFaults.get(record.faultId!);
      if (!planned)
        throw new TypeError('Unknown Mesh simulation historical fault');
      if (planned.kind === 'peer.crash' && record.faultApplied)
        historicalAvailability.set(planned.peerId, false);
      else if (planned.kind === 'peer.resume' && record.faultApplied)
        historicalAvailability.set(planned.peerId, true);
      else if (
        (planned.kind === 'network.partition' ||
          planned.kind === 'network.heal') &&
        record.faultApplied
      )
        for (const link of planned.links)
          historicalTopology.set(
            linkKey(link.fromPeerId, link.toPeerId),
            planned.kind === 'network.heal'
          );
      continue;
    }
    const targetAvailable = historicalAvailability.get(record.peerId) === true;
    const inputLinkEnabled =
      record.inputKind !== 'message.delivery'
        ? true
        : historicalTopology.get(
            linkKey(record.inputDeliverySourcePeerId!, record.peerId)
          ) === true;
    const expectedSuppression = !targetAvailable
      ? 'simulation_peer_crashed'
      : !inputLinkEnabled
        ? 'simulation_partitioned'
        : undefined;
    if (
      (expectedSuppression !== undefined &&
        record.rejectionCode !== expectedSuppression) ||
      (expectedSuppression === undefined &&
        (record.rejectionCode === 'simulation_peer_crashed' ||
          record.rejectionCode === 'simulation_partitioned'))
    )
      throw new TypeError(
        'Mesh simulation snapshot input transport outcome is inconsistent'
      );
    for (const delivery of record.transportOutcome.deliveries) {
      const recipientConfigured = historicalAvailability.has(delivery.toPeerId);
      const recipientAvailable =
        historicalAvailability.get(delivery.toPeerId) === true;
      const linkEnabled =
        historicalTopology.get(
          linkKey(delivery.fromPeerId, delivery.toPeerId)
        ) === true;
      const expectedOutcome = !recipientConfigured
        ? 'destination_missing'
        : !linkEnabled && !recipientAvailable
          ? 'crash_partition'
          : !linkEnabled
            ? 'partition'
            : !recipientAvailable
              ? 'crash'
              : 'delivered';
      if (
        delivery.fromPeerId !== record.peerId ||
        delivery.outcome !== expectedOutcome
      )
        throw new TypeError(
          'Mesh simulation snapshot effect transport outcome is inconsistent'
        );
    }
  }
  if (
    faults.length !== snapshot.faultCursor ||
    faults.length !== metrics.faultEvents
  )
    throw new TypeError('Mesh simulation snapshot fault cursor is invalid');
  const recordedFaults = records.filter(
    (record) => record.faultId !== undefined
  );
  if (
    recordedFaults.length !== faults.length ||
    faults.some(
      (fault, index) =>
        recordedFaults[index]?.faultId !== fault.faultId ||
        recordedFaults[index]?.order.insertionSequence !==
          fault.order.insertionSequence
    )
  )
    throw new TypeError('Mesh simulation snapshot fault ledger is not ordered');
  const processedFaultIds = new Set<string>();
  const expectedAvailability = new Map(
    config.peers.map((peer) => [peer.peerId, true])
  );
  const expectedClockOffsets = new Map(
    config.peers.map((peer) => [peer.peerId, 0])
  );
  const expectedTopology = new Map(
    config.links.map((link) => [
      linkKey(link.fromPeerId, link.toPeerId),
      link.enabled,
    ])
  );
  const expectedFaultMetrics = {
    peerCrashes: 0,
    peerResumes: 0,
    duplicatedMessages: 0,
    delayedMessages: 0,
    reorderedMessages: 0,
    partitions: 0,
    heals: 0,
    clockOffsetChanges: 0,
  };
  let faultDroppedMessages = 0;
  let crashFaultDrops = 0;
  let partitionFaultDrops = 0;
  for (const fault of faults) {
    const planned = plannedFaults.get(fault.faultId);
    const record = records.find(
      (candidate) =>
        candidate.faultId === fault.faultId &&
        candidate.order.insertionSequence === fault.order.insertionSequence
    );
    if (
      !planned ||
      planned.kind !== fault.kind ||
      !record ||
      record.actionDigest !==
        (await digest({ kind: 'fault.apply', fault: planned })) ||
      processedFaultIds.has(fault.faultId)
    )
      throw new TypeError('Mesh simulation snapshot fault is not configured');
    const partitionDrops =
      planned.kind === 'network.partition' ? fault.affectedEventIds.length : 0;
    if (
      (planned.kind === 'message.duplicate' &&
        record.metricsDelta.duplicatedMessages !==
          (fault.applied ? fault.affectedEventIds.length : 0)) ||
      (planned.kind === 'peer.crash' &&
        (record.metricsDelta.droppedMessages !==
          (fault.applied ? fault.affectedEventIds.length : 0) ||
          record.metricsDelta.crashSuppressedEvents !==
            record.metricsDelta.droppedMessages)) ||
      (planned.kind === 'network.partition' &&
        (record.metricsDelta.droppedMessages !== partitionDrops ||
          record.metricsDelta.partitionSuppressedMessages !== partitionDrops))
    )
      throw new TypeError('Mesh simulation snapshot fault metrics mismatch');
    processedFaultIds.add(fault.faultId);
    if (planned.kind === 'peer.crash') {
      expectedAvailability.set(planned.peerId, false);
      if (fault.applied) {
        expectedFaultMetrics.peerCrashes += 1;
        crashFaultDrops += fault.affectedEventIds.length;
        faultDroppedMessages += fault.affectedEventIds.length;
      }
    } else if (planned.kind === 'peer.resume') {
      expectedAvailability.set(planned.peerId, true);
      if (fault.applied) expectedFaultMetrics.peerResumes += 1;
    } else if (
      planned.kind === 'network.partition' ||
      planned.kind === 'network.heal'
    ) {
      const enabled = planned.kind === 'network.heal';
      for (const link of planned.links)
        expectedTopology.set(linkKey(link.fromPeerId, link.toPeerId), enabled);
      if (fault.applied)
        expectedFaultMetrics[
          planned.kind === 'network.heal' ? 'heals' : 'partitions'
        ] += 1;
      if (fault.applied && planned.kind === 'network.partition') {
        const drops = fault.affectedEventIds.length;
        partitionFaultDrops += drops;
        faultDroppedMessages += drops;
      }
    } else if (planned.kind === 'clock.offset') {
      expectedClockOffsets.set(planned.peerId, planned.offset);
      if (fault.applied) expectedFaultMetrics.clockOffsetChanges += 1;
    } else if (planned.kind === 'message.duplicate' && fault.applied) {
      expectedFaultMetrics.duplicatedMessages += fault.affectedEventIds.length;
    } else if (planned.kind === 'message.delay' && fault.applied) {
      expectedFaultMetrics.delayedMessages += 1;
    } else if (planned.kind === 'message.reorder' && fault.applied) {
      expectedFaultMetrics.reorderedMessages += 1;
    } else if (planned.kind === 'message.drop' && fault.applied) {
      faultDroppedMessages += 1;
    }
  }
  const emittedEffects = records.reduce(
    (total, record) => total + record.effectKinds.length,
    0
  );
  const messageDeliverEffects = records.reduce(
    (total, record) =>
      total +
      record.effectKinds.filter((kind) => kind === 'message.deliver').length,
    0
  );
  const rejectedMessageRecords = records.filter(
    (record) =>
      record.inputKind === 'message.delivery' && record.accepted === false
  ).length;
  const processedCrashSuppressions = records.filter(
    (record) => record.rejectionCode === 'simulation_peer_crashed'
  ).length;
  const processedCrashDeliveryDrops = records.filter(
    (record) =>
      record.inputKind === 'message.delivery' &&
      record.rejectionCode === 'simulation_peer_crashed'
  ).length;
  const processedPartitionDrops = records.filter(
    (record) =>
      record.inputKind === 'message.delivery' &&
      record.rejectionCode === 'simulation_partitioned'
  ).length;
  const successfulDeliveries =
    metrics.deliveredMessages - expectedFaultMetrics.duplicatedMessages;
  const immediateDeliveryDrops = messageDeliverEffects - successfulDeliveries;
  const immediateCrashSuppressions = records.reduce(
    (total, record) =>
      total +
      record.transportOutcome.droppedByCrash +
      record.transportOutcome.droppedByCrashAndPartition,
    0
  );
  const immediatePartitionSuppressions = records.reduce(
    (total, record) =>
      total +
      record.transportOutcome.droppedByPartition +
      record.transportOutcome.droppedByCrashAndPartition,
    0
  );
  const expectedOutboundSequences = new Map(
    config.peers.map((peer) => [
      peer.peerId,
      (peer.outboundSequence ?? 0) +
        records.reduce(
          (total, record) =>
            total +
            (record.peerId === peer.peerId
              ? record.effectKinds.filter((kind) => kind === 'message.prepare')
                  .length
              : 0),
          0
        ),
    ])
  );
  const crashSuppressionBase = processedCrashSuppressions + crashFaultDrops;
  const partitionSuppressionBase =
    processedPartitionDrops + partitionFaultDrops;
  if (
    metrics.processedEvents !== records.length ||
    metrics.emittedEffects !== emittedEffects ||
    metrics.deliveredMessages < expectedFaultMetrics.duplicatedMessages ||
    successfulDeliveries > messageDeliverEffects ||
    immediateDeliveryDrops < 0 ||
    metrics.rejectedMessages !==
      rejectedMessageRecords + immediateDeliveryDrops ||
    metrics.droppedMessages !==
      immediateDeliveryDrops +
        processedCrashDeliveryDrops +
        processedPartitionDrops +
        faultDroppedMessages ||
    metrics.crashSuppressedEvents !==
      crashSuppressionBase + immediateCrashSuppressions ||
    metrics.partitionSuppressedMessages !==
      partitionSuppressionBase + immediatePartitionSuppressions ||
    config.peers.some(
      (peer) =>
        snapshot.outboundSequences[peer.peerId] !==
        expectedOutboundSequences.get(peer.peerId)
    )
  )
    throw new TypeError('Mesh simulation snapshot metrics are inconsistent');
  if (
    config.peers.some(
      (peer) =>
        snapshot.peerAvailability[peer.peerId] !==
          expectedAvailability.get(peer.peerId) ||
        snapshot.clockOffsets[peer.peerId] !==
          expectedClockOffsets.get(peer.peerId)
    ) ||
    topology.some(
      (link) =>
        link.enabled !==
        expectedTopology.get(linkKey(link.fromPeerId, link.toPeerId))
    ) ||
    Object.entries(expectedFaultMetrics).some(
      ([name, value]) =>
        metrics[name as keyof typeof expectedFaultMetrics] !== value
    )
  )
    throw new TypeError('Mesh simulation snapshot fault state is invalid');
  const queuedFaults = queuedEvents.filter(
    (
      event
    ): event is MeshSimulationEvent & {
      readonly action: Extract<
        MeshSimulationAction,
        { readonly kind: 'fault.apply' }
      >;
    } => event.action.kind === 'fault.apply'
  );
  const queuedFaultIds = new Set<string>();
  for (const event of queuedFaults) {
    const planned = plannedFaults.get(event.action.fault.faultId);
    if (
      !planned ||
      processedFaultIds.has(planned.faultId) ||
      queuedFaultIds.has(planned.faultId) ||
      event.eventId !== `fault:${planned.faultId}` ||
      event.targetPeerId !== faultTargetPeerId(planned, config) ||
      event.order.logicalTime !== planned.logicalTime ||
      event.order.priority !== planned.priority ||
      (await digest(event.action.fault)) !== (await digest(planned))
    )
      throw new TypeError('Mesh simulation snapshot fault queue is invalid');
    queuedFaultIds.add(planned.faultId);
  }
  if (processedFaultIds.size + queuedFaultIds.size !== faultPlan.faults.length)
    throw new TypeError('Mesh simulation snapshot fault plan is incomplete');
  return Object.freeze({
    schemaVersion: 2,
    configurationDigest,
    faultPlanDigest,
    logicalTime: snapshot.logicalTime,
    insertionSequence: snapshot.insertionSequence,
    faultCursor: snapshot.faultCursor,
    peerStates: frozenRecord(
      peerIds.map((peerId) => [peerId, restoredPeerStates.get(peerId)!])
    ),
    outboundSequences: frozenRecord(
      peerIds.map((peerId) => [peerId, snapshot.outboundSequences[peerId]!])
    ),
    prngStates: frozenRecord(
      Object.entries(snapshot.prngStates).map(([key, value]) => [key, value])
    ),
    peerAvailability: frozenRecord(
      peerIds.map((peerId) => [peerId, snapshot.peerAvailability[peerId]!])
    ),
    clockOffsets: frozenRecord(
      peerIds.map((peerId) => [peerId, snapshot.clockOffsets[peerId]!])
    ),
    topology,
    queuedEvents: Object.freeze(queuedEvents),
    eventIds: Object.freeze(eventIds.sort()),
    metrics,
    records: Object.freeze(records),
    faults: Object.freeze(faults),
    chainDigest: snapshot.chainDigest,
  });
}

function validateSnapshotTopology(
  input: readonly MeshSimulationLink[],
  config: MeshSimulationConfig
): readonly MeshSimulationLink[] {
  if (
    !Array.isArray(input) ||
    input.length !== config.links.length ||
    !isDenseArray(input)
  )
    throw new TypeError('Invalid Mesh simulation snapshot topology');
  const expected = new Map(
    config.links.map((link) => [linkKey(link.fromPeerId, link.toPeerId), link])
  );
  const result = input.map((link) => {
    assertPlainData(link, 'snapshot link');
    assertExactKeys(
      link,
      ['enabled', 'fromPeerId', 'latency', 'toPeerId'],
      ['enabled', 'fromPeerId', 'latency', 'toPeerId']
    );
    assertBoundedString(link.fromPeerId, 'snapshot link source peerId', 256);
    assertBoundedString(link.toPeerId, 'snapshot link target peerId', 256);
    const original = expected.get(linkKey(link.fromPeerId, link.toPeerId));
    if (
      !original ||
      link.latency !== original.latency ||
      typeof link.enabled !== 'boolean'
    )
      throw new TypeError('Invalid Mesh simulation snapshot link');
    expected.delete(linkKey(link.fromPeerId, link.toPeerId));
    return Object.freeze({ ...link });
  });
  if (expected.size !== 0)
    throw new TypeError('Incomplete Mesh simulation snapshot topology');
  return Object.freeze(result);
}

function validateSnapshotEvent(
  input: MeshSimulationEvent,
  snapshot: MeshSimulationSnapshot,
  config: MeshSimulationConfig,
  peerIds: ReadonlySet<string>
): MeshSimulationEvent {
  assertPlainData(input, 'snapshot event');
  assertExactKeys(
    input,
    ['action', 'eventId', 'order', 'targetPeerId'],
    ['action', 'eventId', 'order', 'targetPeerId']
  );
  assertBoundedString(input.eventId, 'eventId', 768);
  assertBoundedString(input.targetPeerId, 'snapshot event peerId', 256);
  if (!peerIds.has(input.targetPeerId))
    throw new TypeError('Mesh simulation snapshot event peer is unknown');
  assertPlainData(input.order, 'snapshot event order');
  assertExactKeys(
    input.order,
    ['insertionSequence', 'logicalTime', 'priority'],
    ['insertionSequence', 'logicalTime', 'priority']
  );
  if (
    !Number.isSafeInteger(input.order.logicalTime) ||
    input.order.logicalTime < snapshot.logicalTime ||
    input.order.logicalTime > config.limits.maximumLogicalTime ||
    !Number.isSafeInteger(input.order.priority) ||
    !Number.isSafeInteger(input.order.insertionSequence) ||
    input.order.insertionSequence < 1 ||
    input.order.insertionSequence > snapshot.insertionSequence
  )
    throw new TypeError('Invalid Mesh simulation snapshot event order');
  assertPlainData(input.action, 'snapshot action');
  if (
    input.action.kind === 'peer.input' ||
    input.action.kind === 'message.delivery'
  )
    assertExactKeys(
      input.action,
      input.action.kind === 'peer.input'
        ? ['input', 'kind']
        : ['envelope', 'kind'],
      input.action.kind === 'peer.input'
        ? ['input', 'kind']
        : ['envelope', 'kind']
    );
  else if (input.action.kind === 'fault.apply')
    assertExactKeys(input.action, ['fault', 'kind'], ['fault', 'kind']);
  else throw new TypeError('Invalid Mesh simulation snapshot action');
  let action: MeshSimulationAction;
  if (input.action.kind === 'peer.input') {
    action = Object.freeze({
      kind: 'peer.input',
      input: validateSnapshotPeerInput(input.action.input, peerIds),
    });
  } else if (input.action.kind === 'message.delivery') {
    const envelopeCopy = deepFreezeCopy(input.action.envelope);
    const target = config.peers.find(
      (peer) => peer.peerId === input.targetPeerId
    )!;
    const validated = validateSignedMeshEnvelope(envelopeCopy, {
      limits: target.protocolOptions?.limits,
    });
    if (!validated.ok)
      throw new TypeError('Invalid Mesh simulation snapshot envelope');
    action = Object.freeze({
      kind: 'message.delivery',
      envelope: validated.value,
    });
  } else {
    const normalized = normalizeFaultPlan(
      { schemaVersion: 1, faults: [input.action.fault] },
      config
    );
    action = Object.freeze({
      kind: 'fault.apply',
      fault: normalized.faults[0]!,
    });
  }
  if (!canonicalizeMeshJsonBytes(action).ok)
    throw new TypeError('Invalid Mesh simulation snapshot action');
  return Object.freeze({
    eventId: input.eventId,
    targetPeerId: input.targetPeerId,
    order: Object.freeze({ ...input.order }),
    action,
  });
}

function validateSnapshotPeerInput(
  input: Exclude<MeshPeerInput, { readonly kind: 'effect.result' }>,
  peerIds: ReadonlySet<string>
): Exclude<MeshPeerInput, { readonly kind: 'effect.result' }> {
  assertPlainData(input, 'snapshot peer input');
  if (input.kind === 'peer.start') {
    assertExactKeys(input, ['kind'], ['kind']);
  } else if (input.kind === 'peer.stop') {
    assertExactKeys(input, ['kind', 'reason'], ['kind', 'reason']);
    if (!['policy', 'requested', 'resource_limit'].includes(input.reason))
      throw new TypeError('Invalid Mesh simulation snapshot peer input');
  } else if (input.kind === 'peer.ping') {
    assertExactKeys(input, ['kind', 'peerId'], ['kind', 'peerId']);
    assertBoundedString(input.peerId, 'snapshot ping peerId', 256);
    if (!peerIds.has(input.peerId))
      throw new TypeError('Invalid Mesh simulation snapshot ping peer');
  } else {
    throw new TypeError('Invalid Mesh simulation snapshot peer input');
  }
  return deepFreezeCopy(input);
}

function validateMetrics(
  input: MeshSimulationMetrics,
  snapshot: MeshSimulationSnapshot
): MeshSimulationMetrics {
  assertPlainData(input, 'snapshot metrics');
  const keys = [
    'clockOffsetChanges',
    'crashSuppressedEvents',
    'delayedMessages',
    'deliveredMessages',
    'droppedMessages',
    'duplicatedMessages',
    'emittedEffects',
    'faultEvents',
    'finalLogicalTime',
    'heals',
    'partitionSuppressedMessages',
    'partitions',
    'peerCrashes',
    'peerResumes',
    'processedEvents',
    'rejectedMessages',
    'reorderedMessages',
  ];
  assertExactKeys(input, keys, keys);
  if (
    Object.values(input).some(
      (value) =>
        typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0
    ) ||
    input.processedEvents > snapshot.records.length ||
    input.finalLogicalTime !== snapshot.logicalTime
  )
    throw new TypeError('Invalid Mesh simulation snapshot metrics');
  return Object.freeze({ ...input });
}

function validateRecord(
  record: MeshSimulationRecord,
  config: MeshSimulationConfig,
  peerIds: ReadonlySet<string>,
  insertionSequence: number
): void {
  assertPlainData(record, 'snapshot record');
  const supported = [
    'accepted',
    'actionDigest',
    'chainDigest',
    'effectKinds',
    'effectsDigest',
    'eventId',
    'faultApplied',
    'faultId',
    'faultKind',
    'inputKind',
    'inputDeliverySourcePeerId',
    'metricsDelta',
    'order',
    'peerId',
    'rejectionCode',
    'stateDigest',
    'transportOutcome',
  ];
  assertExactKeys(record, supported, [
    'actionDigest',
    'chainDigest',
    'effectKinds',
    'effectsDigest',
    'eventId',
    'inputKind',
    'metricsDelta',
    'order',
    'peerId',
    'stateDigest',
    'transportOutcome',
  ]);
  const effectKinds = new Set<MeshPeerEffect['kind']>([
    'event.emit',
    'intake.backpressure',
    'message.deliver',
    'message.prepare',
    'timer.schedule',
  ]);
  const faultKinds = new Set<MeshSimulationFaultKind>([
    'peer.crash',
    'peer.resume',
    'message.drop',
    'message.duplicate',
    'message.delay',
    'message.reorder',
    'network.partition',
    'network.heal',
    'clock.offset',
  ]);
  assertBoundedString(record.peerId, 'snapshot record peerId', 256);
  if (record.inputKind === 'message.delivery')
    assertBoundedString(
      record.inputDeliverySourcePeerId,
      'snapshot input delivery source peerId',
      256
    );
  assertPlainData(record.metricsDelta, 'snapshot record metrics delta');
  assertExactKeys(record.metricsDelta, metricDeltaKeys, metricDeltaKeys);
  assertPlainData(record.transportOutcome, 'snapshot transport outcome');
  assertExactKeys(
    record.transportOutcome,
    [
      'delivered',
      'deliveries',
      'droppedByCrash',
      'droppedByCrashAndPartition',
      'droppedByDestinationMissing',
      'droppedByPartition',
    ],
    [
      'delivered',
      'deliveries',
      'droppedByCrash',
      'droppedByCrashAndPartition',
      'droppedByDestinationMissing',
      'droppedByPartition',
    ]
  );
  if (
    !Array.isArray(record.transportOutcome.deliveries) ||
    record.transportOutcome.deliveries.length >
      config.limits.maximumInternalSteps ||
    !isDenseArray(record.transportOutcome.deliveries)
  )
    throw new TypeError('Invalid Mesh simulation transport outcomes');
  const transportDeliveries = record.transportOutcome.deliveries.map(
    (delivery) => {
      assertPlainData(delivery, 'snapshot transport delivery');
      assertExactKeys(
        delivery,
        ['eventId', 'fromPeerId', 'outcome', 'toPeerId'],
        ['eventId', 'fromPeerId', 'outcome', 'toPeerId']
      );
      assertBoundedString(delivery.eventId, 'transport eventId', 768);
      assertBoundedString(delivery.fromPeerId, 'transport source peerId', 256);
      assertBoundedString(delivery.toPeerId, 'transport target peerId', 256);
      if (
        !peerIds.has(delivery.fromPeerId) ||
        (delivery.outcome === 'destination_missing'
          ? peerIds.has(delivery.toPeerId)
          : !peerIds.has(delivery.toPeerId)) ||
        ![
          'crash',
          'crash_partition',
          'delivered',
          'destination_missing',
          'partition',
        ].includes(delivery.outcome)
      )
        throw new TypeError('Invalid Mesh simulation transport outcome');
      return delivery;
    }
  );
  const transportCounts = {
    delivered: transportDeliveries.filter(
      ({ outcome }) => outcome === 'delivered'
    ).length,
    droppedByCrash: transportDeliveries.filter(
      ({ outcome }) => outcome === 'crash'
    ).length,
    droppedByPartition: transportDeliveries.filter(
      ({ outcome }) => outcome === 'partition'
    ).length,
    droppedByCrashAndPartition: transportDeliveries.filter(
      ({ outcome }) => outcome === 'crash_partition'
    ).length,
    droppedByDestinationMissing: transportDeliveries.filter(
      ({ outcome }) => outcome === 'destination_missing'
    ).length,
  };
  if (
    !peerIds.has(record.peerId) ||
    (record.inputKind === 'message.delivery'
      ? typeof record.inputDeliverySourcePeerId !== 'string'
      : record.inputDeliverySourcePeerId !== undefined) ||
    !['peer.input', 'message.delivery', 'fault.apply'].includes(
      record.inputKind
    ) ||
    !isDigest(record.actionDigest) ||
    !isDigest(record.effectsDigest) ||
    !isDigest(record.stateDigest) ||
    !isDigest(record.chainDigest) ||
    !Array.isArray(record.effectKinds) ||
    record.effectKinds.length > config.limits.maximumInternalSteps ||
    !isDenseArray(record.effectKinds) ||
    record.effectKinds.some(
      (kind) =>
        typeof kind !== 'string' ||
        !effectKinds.has(kind as MeshPeerEffect['kind'])
    ) ||
    (record.accepted !== undefined && typeof record.accepted !== 'boolean') ||
    (record.rejectionCode !== undefined &&
      (typeof record.rejectionCode !== 'string' ||
        new TextEncoder().encode(record.rejectionCode).byteLength > 256)) ||
    (record.faultId !== undefined &&
      (typeof record.faultId !== 'string' ||
        new TextEncoder().encode(record.faultId).byteLength > 256)) ||
    (record.faultKind !== undefined && !faultKinds.has(record.faultKind)) ||
    (record.faultApplied !== undefined &&
      typeof record.faultApplied !== 'boolean') ||
    (record.inputKind === 'peer.input' &&
      (record.accepted !== undefined || record.rejectionCode !== undefined) &&
      !(
        record.accepted === false &&
        record.rejectionCode === 'simulation_peer_crashed'
      )) ||
    (record.inputKind === 'message.delivery' &&
      typeof record.accepted !== 'boolean') ||
    (record.rejectionCode !== undefined && record.accepted !== false) ||
    (record.inputKind === 'fault.apply'
      ? record.faultId === undefined ||
        record.faultKind === undefined ||
        typeof record.faultApplied !== 'boolean' ||
        typeof record.accepted !== 'boolean' ||
        record.rejectionCode !== undefined
      : record.faultId !== undefined ||
        record.faultKind !== undefined ||
        record.faultApplied !== undefined) ||
    Object.values(record.metricsDelta).some(
      (value) =>
        typeof value !== 'number' ||
        !Number.isSafeInteger(value) ||
        value < 0 ||
        value > maximumIssuedEvents(config)
    ) ||
    record.metricsDelta.processedEvents !== 1 ||
    record.metricsDelta.emittedEffects !== record.effectKinds.length ||
    record.metricsDelta.faultEvents !==
      (record.inputKind === 'fault.apply' ? 1 : 0) ||
    Object.entries(transportCounts).some(
      ([key, value]) =>
        record.transportOutcome[key as keyof typeof transportCounts] !== value
    ) ||
    transportDeliveries.length !==
      record.effectKinds.filter((kind) => kind === 'message.deliver').length ||
    new Set(transportDeliveries.map(({ eventId }) => eventId)).size !==
      transportDeliveries.length
  )
    throw new TypeError('Invalid Mesh simulation snapshot record');
  const faultOnlyMetricKeys = [
    'clockOffsetChanges',
    'delayedMessages',
    'duplicatedMessages',
    'heals',
    'partitions',
    'peerCrashes',
    'peerResumes',
    'reorderedMessages',
  ] as const;
  if (
    record.inputKind !== 'fault.apply' &&
    faultOnlyMetricKeys.some((key) => record.metricsDelta[key] !== 0)
  )
    throw new TypeError('Invalid Mesh simulation snapshot record metrics');
  if (record.inputKind === 'fault.apply') {
    const applied = record.faultApplied === true;
    const expectedUnit = (kind: MeshSimulationFaultKind): number =>
      applied && record.faultKind === kind ? 1 : 0;
    if (
      record.effectKinds.length !== 0 ||
      record.metricsDelta.peerCrashes !== expectedUnit('peer.crash') ||
      record.metricsDelta.peerResumes !== expectedUnit('peer.resume') ||
      record.metricsDelta.delayedMessages !== expectedUnit('message.delay') ||
      record.metricsDelta.reorderedMessages !==
        expectedUnit('message.reorder') ||
      record.metricsDelta.partitions !== expectedUnit('network.partition') ||
      record.metricsDelta.heals !== expectedUnit('network.heal') ||
      record.metricsDelta.clockOffsetChanges !== expectedUnit('clock.offset') ||
      record.metricsDelta.rejectedMessages !== 0 ||
      (record.faultKind === 'message.duplicate'
        ? record.metricsDelta.duplicatedMessages < (applied ? 1 : 0) ||
          record.metricsDelta.deliveredMessages !==
            record.metricsDelta.duplicatedMessages
        : record.metricsDelta.duplicatedMessages !== 0 ||
          record.metricsDelta.deliveredMessages !== 0) ||
      (record.faultKind === 'message.drop'
        ? record.metricsDelta.droppedMessages !== (applied ? 1 : 0)
        : record.faultKind === 'peer.crash'
          ? record.metricsDelta.droppedMessages !==
              record.metricsDelta.crashSuppressedEvents ||
            record.metricsDelta.partitionSuppressedMessages !== 0
          : record.faultKind === 'network.partition'
            ? record.metricsDelta.droppedMessages !==
                record.metricsDelta.partitionSuppressedMessages ||
              record.metricsDelta.crashSuppressedEvents !== 0
            : record.metricsDelta.droppedMessages !== 0 ||
              record.metricsDelta.crashSuppressedEvents !== 0 ||
              record.metricsDelta.partitionSuppressedMessages !== 0)
    )
      throw new TypeError('Invalid Mesh simulation snapshot fault metrics');
  } else {
    const effectDrops =
      transportCounts.droppedByCrash +
      transportCounts.droppedByPartition +
      transportCounts.droppedByCrashAndPartition +
      transportCounts.droppedByDestinationMissing;
    const inputRejected =
      record.inputKind === 'message.delivery' && record.accepted === false
        ? 1
        : 0;
    const inputDropped =
      record.inputKind === 'message.delivery' &&
      (record.rejectionCode === 'simulation_peer_crashed' ||
        record.rejectionCode === 'simulation_partitioned')
        ? 1
        : 0;
    if (
      record.metricsDelta.deliveredMessages !== transportCounts.delivered ||
      record.metricsDelta.rejectedMessages !== inputRejected + effectDrops ||
      record.metricsDelta.droppedMessages !== inputDropped + effectDrops ||
      record.metricsDelta.crashSuppressedEvents !==
        (record.rejectionCode === 'simulation_peer_crashed' ? 1 : 0) +
          transportCounts.droppedByCrash +
          transportCounts.droppedByCrashAndPartition ||
      record.metricsDelta.partitionSuppressedMessages !==
        (record.rejectionCode === 'simulation_partitioned' ? 1 : 0) +
          transportCounts.droppedByPartition +
          transportCounts.droppedByCrashAndPartition
    )
      throw new TypeError('Invalid Mesh simulation snapshot transport metrics');
  }
  assertBoundedString(record.eventId, 'snapshot record eventId', 768);
  assertPlainData(record.order, 'snapshot record order');
  assertExactKeys(
    record.order,
    ['insertionSequence', 'logicalTime', 'priority'],
    ['insertionSequence', 'logicalTime', 'priority']
  );
  if (
    !Number.isSafeInteger(record.order.logicalTime) ||
    record.order.logicalTime < 0 ||
    record.order.logicalTime > config.limits.maximumLogicalTime ||
    !Number.isSafeInteger(record.order.priority) ||
    !Number.isSafeInteger(record.order.insertionSequence) ||
    record.order.insertionSequence < 1 ||
    record.order.insertionSequence > insertionSequence
  )
    throw new TypeError('Invalid Mesh simulation snapshot record order');
}

function validateFaultRecord(
  input: MeshSimulationFaultRecord,
  records: readonly MeshSimulationRecord[],
  plannedFaults: ReadonlyMap<string, MeshSimulationFault>,
  eventIds: readonly string[],
  queuedEvents: readonly MeshSimulationEvent[],
  config: MeshSimulationConfig
): MeshSimulationFaultRecord {
  assertPlainData(input, 'snapshot fault record');
  assertExactKeys(
    input,
    [
      'affectedDeliveries',
      'affectedEventIds',
      'affectedLinkIds',
      'applied',
      'faultId',
      'kind',
      'order',
    ],
    [
      'affectedDeliveries',
      'affectedEventIds',
      'affectedLinkIds',
      'applied',
      'faultId',
      'kind',
      'order',
    ]
  );
  assertBoundedString(input.faultId, 'snapshot faultId');
  assertPlainData(input.order, 'snapshot fault order');
  assertExactKeys(
    input.order,
    ['insertionSequence', 'logicalTime', 'priority'],
    ['insertionSequence', 'logicalTime', 'priority']
  );
  const planned = plannedFaults.get(input.faultId);
  const maximumAffected =
    planned?.kind === 'message.duplicate'
      ? planned.copies
      : planned?.kind === 'network.partition'
        ? config.limits.maximumQueuedEvents
        : planned?.kind === 'network.heal'
          ? 0
          : planned?.kind === 'peer.crash'
            ? config.limits.maximumQueuedEvents
            : 1;
  const maximumAffectedLinks =
    planned?.kind === 'network.partition' || planned?.kind === 'network.heal'
      ? planned.links.length
      : 0;
  if (
    !planned ||
    planned.kind !== input.kind ||
    typeof input.applied !== 'boolean' ||
    !Number.isSafeInteger(input.order.logicalTime) ||
    !Number.isSafeInteger(input.order.priority) ||
    !Number.isSafeInteger(input.order.insertionSequence) ||
    !Array.isArray(input.affectedEventIds) ||
    input.affectedEventIds.length > maximumAffected ||
    !isDenseArray(input.affectedEventIds) ||
    !Array.isArray(input.affectedLinkIds) ||
    input.affectedLinkIds.length > maximumAffectedLinks ||
    !isDenseArray(input.affectedLinkIds) ||
    !Array.isArray(input.affectedDeliveries) ||
    input.affectedDeliveries.length > input.affectedEventIds.length ||
    !isDenseArray(input.affectedDeliveries)
  )
    throw new TypeError('Invalid Mesh simulation snapshot fault record');
  const affectedEventIds = [...input.affectedEventIds];
  const affectedLinkIds = [...input.affectedLinkIds];
  for (const eventId of affectedEventIds)
    assertBoundedString(eventId, 'snapshot affected eventId', 768);
  for (const linkId of affectedLinkIds)
    assertBoundedString(linkId, 'snapshot affected linkId', 768);
  if (
    new Set(affectedEventIds).size !== affectedEventIds.length ||
    new Set(affectedLinkIds).size !== affectedLinkIds.length ||
    (!input.applied &&
      (affectedEventIds.length !== 0 || affectedLinkIds.length !== 0))
  )
    throw new TypeError('Invalid Mesh simulation snapshot affected events');
  const affectedSet = new Set(affectedEventIds);
  const affectedDeliveries = input.affectedDeliveries.map((delivery) => {
    assertPlainData(delivery, 'snapshot affected delivery');
    assertExactKeys(
      delivery,
      ['eventId', 'fromPeerId', 'order', 'toPeerId'],
      ['eventId', 'fromPeerId', 'order', 'toPeerId']
    );
    assertBoundedString(delivery.eventId, 'affected delivery eventId', 768);
    assertBoundedString(delivery.fromPeerId, 'affected delivery source', 256);
    assertBoundedString(delivery.toPeerId, 'affected delivery target', 256);
    assertPlainData(delivery.order, 'affected delivery order');
    assertExactKeys(
      delivery.order,
      ['insertionSequence', 'logicalTime', 'priority'],
      ['insertionSequence', 'logicalTime', 'priority']
    );
    if (
      !affectedSet.has(delivery.eventId) ||
      !config.peers.some((peer) => peer.peerId === delivery.toPeerId) ||
      !Number.isSafeInteger(delivery.order.logicalTime) ||
      delivery.order.logicalTime < input.order.logicalTime ||
      delivery.order.logicalTime > config.limits.maximumLogicalTime ||
      !Number.isSafeInteger(delivery.order.priority) ||
      !Number.isSafeInteger(delivery.order.insertionSequence) ||
      delivery.order.insertionSequence < 1 ||
      delivery.order.insertionSequence > maximumIssuedEvents(config)
    )
      throw new TypeError('Invalid Mesh simulation affected delivery');
    return Object.freeze({
      eventId: delivery.eventId,
      fromPeerId: delivery.fromPeerId,
      toPeerId: delivery.toPeerId,
      order: Object.freeze({ ...delivery.order }),
    });
  });
  if (
    new Set(affectedDeliveries.map(({ eventId }) => eventId)).size !==
    affectedDeliveries.length
  )
    throw new TypeError('Duplicate Mesh simulation affected delivery');
  const record = records.find(
    (candidate) =>
      candidate.faultId === input.faultId &&
      candidate.faultKind === input.kind &&
      candidate.order.insertionSequence === input.order.insertionSequence
  );
  if (
    !record ||
    record.accepted !== input.applied ||
    record.faultApplied !== input.applied ||
    input.order.logicalTime !== planned.logicalTime ||
    input.order.priority !== planned.priority ||
    record.order.logicalTime !== input.order.logicalTime ||
    record.order.priority !== input.order.priority
  )
    throw new TypeError('Invalid Mesh simulation snapshot fault record');
  const expectedSingle =
    planned.kind === 'message.drop' ||
    planned.kind === 'message.delay' ||
    planned.kind === 'message.reorder'
      ? planned.deliveryEventId
      : planned.kind === 'peer.resume' || planned.kind === 'clock.offset'
        ? planned.peerId
        : undefined;
  if (
    expectedSingle !== undefined &&
    input.applied &&
    (affectedEventIds.length !== 1 || affectedEventIds[0] !== expectedSingle)
  )
    throw new TypeError('Invalid Mesh simulation snapshot affected events');
  if (planned.kind === 'message.duplicate' && input.applied) {
    const expected = Array.from(
      { length: planned.copies },
      (_, index) =>
        `${planned.deliveryEventId}:duplicate:${planned.faultId}:${index + 1}`
    );
    if (
      affectedEventIds.length !== expected.length ||
      expected.some((eventId) => !affectedSet.has(eventId))
    )
      throw new TypeError('Invalid Mesh simulation snapshot affected events');
  }
  if (
    input.applied &&
    (planned.kind === 'message.drop' ||
      planned.kind === 'message.duplicate' ||
      planned.kind === 'message.delay' ||
      planned.kind === 'message.reorder') &&
    affectedEventIds.some((eventId) => !eventIds.includes(eventId))
  )
    throw new TypeError('Invalid Mesh simulation snapshot affected events');
  if (
    (planned.kind === 'network.partition' || planned.kind === 'network.heal') &&
    input.applied
  ) {
    const configured = new Set(
      planned.links.map((link) => linkKey(link.fromPeerId, link.toPeerId))
    );
    const queuedIds = new Set(queuedEvents.map((event) => event.eventId));
    const recordedIds = new Set(records.map((candidate) => candidate.eventId));
    if (
      affectedEventIds.length + affectedLinkIds.length === 0 ||
      affectedLinkIds.some((linkId) => !configured.has(linkId)) ||
      (planned.kind === 'network.heal' && affectedEventIds.length > 0) ||
      affectedEventIds.some(
        (eventId) =>
          !eventIds.includes(eventId) ||
          queuedIds.has(eventId) ||
          recordedIds.has(eventId) ||
          eventId.startsWith('fault:')
      )
    )
      throw new TypeError('Invalid Mesh simulation snapshot affected links');
  }
  if (planned.kind === 'peer.crash') {
    const queuedIds = new Set(queuedEvents.map((event) => event.eventId));
    const recordedIds = new Set(records.map((candidate) => candidate.eventId));
    if (
      affectedEventIds.some(
        (eventId) =>
          !eventIds.includes(eventId) ||
          queuedIds.has(eventId) ||
          recordedIds.has(eventId) ||
          eventId.startsWith('fault:')
      )
    )
      throw new TypeError('Invalid Mesh simulation snapshot crash drops');
  }
  const affectedDeliveryIds = new Set(
    affectedDeliveries.map(({ eventId }) => eventId)
  );
  const expectedRemovedDeliveryIds =
    planned.kind === 'peer.crash'
      ? affectedEventIds
      : planned.kind === 'message.drop' && input.applied
        ? [planned.deliveryEventId]
        : planned.kind === 'network.partition' && input.applied
          ? affectedEventIds
          : [];
  if (
    affectedDeliveryIds.size !== expectedRemovedDeliveryIds.length ||
    expectedRemovedDeliveryIds.some(
      (eventId) => !affectedDeliveryIds.has(eventId)
    ) ||
    affectedDeliveries.some(
      (delivery) =>
        (planned.kind === 'peer.crash' &&
          delivery.toPeerId !== planned.peerId) ||
        (planned.kind === 'message.drop' &&
          delivery.eventId !== planned.deliveryEventId) ||
        (planned.kind === 'network.partition' &&
          !planned.links.some(
            (link) =>
              link.fromPeerId === delivery.fromPeerId &&
              link.toPeerId === delivery.toPeerId
          ))
    )
  )
    throw new TypeError(
      'Invalid Mesh simulation snapshot affected delivery causality'
    );
  return Object.freeze({
    faultId: input.faultId,
    kind: input.kind,
    order: Object.freeze({ ...input.order }),
    applied: input.applied,
    affectedEventIds: Object.freeze(affectedEventIds),
    affectedLinkIds: Object.freeze(affectedLinkIds),
    affectedDeliveries: Object.freeze(affectedDeliveries),
  });
}

function restorePeerState(value: MeshPeerState): MeshPeerState {
  assertPlainData(value, 'snapshot peer state');
  const keys = [
    'admittedPeers',
    'identity',
    'lastLogicalTime',
    'limits',
    'localEventSequence',
    'messageIds',
    'peers',
    'pendingPings',
    'pendingPreparations',
    'replay',
    'status',
  ];
  assertExactKeys(value, keys, keys);
  const recordNames = [
    'admittedPeers',
    'messageIds',
    'peers',
    'pendingPings',
    'pendingPreparations',
    'replay',
  ] as const;
  for (const name of recordNames)
    assertDataRecord(value[name], `snapshot peer ${name}`);
  const copy = deepFreezeCopy(value) as MeshPeerState;
  return Object.freeze({
    ...copy,
    admittedPeers: frozenRecord(
      Object.entries(copy.admittedPeers).map(([key, entry]) => [key, entry])
    ),
    peers: frozenRecord(
      Object.entries(copy.peers).map(([key, entry]) => [key, entry])
    ),
    replay: frozenRecord(
      Object.entries(copy.replay).map(([key, entry]) => [key, entry])
    ),
    messageIds: frozenRecord(
      Object.entries(copy.messageIds).map(([key, entry]) => [key, entry])
    ),
    pendingPings: frozenRecord(
      Object.entries(copy.pendingPings).map(([key, entry]) => [key, entry])
    ),
    pendingPreparations: frozenRecord(
      Object.entries(copy.pendingPreparations).map(([key, entry]) => [
        key,
        entry,
      ])
    ),
  });
}

function compareEvents(left: MeshSimulationEvent, right: MeshSimulationEvent) {
  return (
    left.order.logicalTime - right.order.logicalTime ||
    left.order.priority - right.order.priority ||
    left.order.insertionSequence - right.order.insertionSequence
  );
}

function timestampAt(startTime: string, logicalTime: number): string {
  return new Date(Date.parse(startTime) + logicalTime).toISOString();
}

function linkKey(fromPeerId: string, toPeerId: string): string {
  return JSON.stringify([fromPeerId, toPeerId]);
}

function faultTargetPeerId(
  fault: MeshSimulationFault,
  config: MeshSimulationConfig
): string {
  const targetPeerId =
    'peerId' in fault
      ? fault.peerId
      : 'links' in fault
        ? fault.links[0]?.fromPeerId
        : config.peers[0]?.peerId;
  if (targetPeerId === undefined)
    throw new TypeError('Mesh simulation fault has no target');
  return targetPeerId;
}

function maximumIssuedEvents(config: MeshSimulationConfig): number {
  const queueChurn =
    config.limits.maximumQueuedEvents * (config.limits.maximumEvents + 1);
  const effectEvents =
    config.limits.maximumEvents * config.limits.maximumInternalSteps;
  return Math.min(Number.MAX_SAFE_INTEGER, queueChurn + effectEvents);
}

function isDigest(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value);
}

function assertBoundedString(
  value: unknown,
  name: string,
  maximumBytes = 256
): asserts value is string {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    new TextEncoder().encode(value).byteLength > maximumBytes
  )
    throw new TypeError(`Invalid Mesh simulation ${name}`);
}

function isDenseArray(value: unknown): value is readonly unknown[] {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    Object.getOwnPropertySymbols(value).length > 0
  )
    return false;
  const names = Object.getOwnPropertyNames(value);
  if (names.length !== value.length + 1) return false;
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (
      descriptor === undefined ||
      !('value' in descriptor) ||
      descriptor.enumerable !== true
    )
      return false;
  }
  return true;
}

function assertPlainData<T>(
  value: T,
  name: string
): asserts value is T & Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError(`Mesh simulation ${name} must be a plain record`);
  const prototype = Object.getPrototypeOf(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    (prototype !== null && prototype !== Object.prototype) ||
    Object.getOwnPropertySymbols(value).length > 0 ||
    Object.values(descriptors).some(
      (descriptor) =>
        !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')
    )
  )
    throw new TypeError(`Mesh simulation ${name} must contain data only`);
}

function assertDataRecord(
  value: unknown,
  name: string
): asserts value is Record<string, unknown> {
  assertPlainData(value, name);
}

function assertExactKeys(
  value: object,
  supportedKeys: readonly string[],
  requiredKeys: readonly string[]
): void {
  const supported = new Set(supportedKeys);
  const keys = Object.keys(value);
  if (
    keys.some((key) => !supported.has(key)) ||
    requiredKeys.some((key) => !Object.hasOwn(value, key))
  )
    throw new TypeError('Mesh simulation value contains unsupported fields');
}

function assertExactRecordKeys(
  value: Readonly<Record<string, unknown>>,
  expectedKeys: readonly string[],
  name: string
): void {
  const actual = Object.keys(value).sort();
  if (
    actual.length !== expectedKeys.length ||
    actual.some((key, index) => key !== expectedKeys[index])
  )
    throw new TypeError(`Invalid Mesh simulation snapshot ${name}`);
}

function deepFreezeCopy<T>(
  value: T,
  context = {
    seen: new WeakSet<object>(),
    nodes: 0,
  },
  depth = 0
): T {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
    return value;
  if (typeof value !== 'object')
    throw new TypeError(
      'Mesh simulation snapshot value must contain data only'
    );
  if (depth > 128 || context.nodes >= 100_000 || context.seen.has(value))
    throw new RangeError('Mesh simulation snapshot value exceeds data limits');
  context.seen.add(value);
  context.nodes += 1;
  if (Array.isArray(value)) {
    if (value.length > 100_000 || !isDenseArray(value))
      throw new RangeError(
        'Mesh simulation snapshot array exceeds data limits'
      );
    const copy = value.map((entry) =>
      deepFreezeCopy(entry, context, depth + 1)
    );
    context.seen.delete(value);
    return Object.freeze(copy) as T;
  }
  assertPlainData(value, 'snapshot value');
  const record =
    Object.getPrototypeOf(value) === null
      ? Object.create(null)
      : ({} as Record<string, unknown>);
  for (const [key, entry] of Object.entries(value))
    record[key] = deepFreezeCopy(entry, context, depth + 1);
  context.seen.delete(value);
  return Object.freeze(record) as T;
}

function xorshift32(input: number): number {
  let value = input || 0x6d2b79f5;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value >>> 0;
}

function mixSeed(seed: number, scope: string): number {
  let value = seed ^ 0x811c9dc5;
  for (let index = 0; index < scope.length; index += 1) {
    value = Math.imul(value ^ scope.charCodeAt(index), 0x01000193);
  }
  return value >>> 0 || 1;
}

function deterministicMessageId(random: () => number): string {
  const bytes = new Uint8Array(16);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Math.floor(random() * 256);
  }
  return base64url(bytes);
}

function base64url(bytes: Uint8Array): string {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const value =
      (bytes[index] << 16) |
      ((bytes[index + 1] ?? 0) << 8) |
      (bytes[index + 2] ?? 0);
    output += alphabet[(value >>> 18) & 63];
    output += alphabet[(value >>> 12) & 63];
    if (index + 1 < bytes.length) output += alphabet[(value >>> 6) & 63];
    if (index + 2 < bytes.length) output += alphabet[value & 63];
  }
  return output;
}

async function digest(value: unknown): Promise<string> {
  const canonical = canonicalizeMeshJsonBytes(value);
  if (!canonical.ok)
    throw new TypeError('Mesh simulation value is not canonical');
  const bytes = canonical.value;
  const source = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
  const result = new Uint8Array(
    await globalThis.crypto.subtle.digest('SHA-256', source)
  );
  return [...result].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function frozenRecord<T>(
  entries: readonly (readonly [string, T])[]
): Readonly<Record<string, T>> {
  const record = Object.create(null) as Record<string, T>;
  for (const [key, value] of entries) record[key] = value;
  return Object.freeze(record);
}

export const THREE_PEER_SCENARIO_IDS = Object.freeze([
  'peer-a',
  'peer-b',
  'peer-c',
] as const);

export * from './reducer-scenario.js';
