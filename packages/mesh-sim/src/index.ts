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
  MESH_WIRE_VERSION,
  canonicalizeMeshJsonBytes,
  type MeshProtocolOptions,
  type SignedMeshEnvelope,
  type UnsignedMeshEnvelope,
} from '@agentplat/mesh-protocol';

export type MeshSimulationPrngVersion = 'xorshift32-v1';
export type MeshSimulationRecordingMode = 'full' | 'digest' | 'metrics';

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
  readonly invariants?: readonly MeshSimulationInvariant[];
}

export type MeshSimulationAction =
  | {
      readonly kind: 'peer.input';
      readonly input: Exclude<MeshPeerInput, { readonly kind: 'effect.result' }>;
    }
  | {
      readonly kind: 'message.delivery';
      readonly envelope: SignedMeshEnvelope;
    };

export interface MeshSimulationEventInput {
  readonly eventId: string;
  readonly targetPeerId: string;
  readonly logicalTime: MeshLogicalTime;
  readonly priority: number;
  readonly action: MeshSimulationAction;
}

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
  readonly actionDigest: string;
  readonly accepted?: boolean;
  readonly rejectionCode?: string;
  readonly effectKinds: readonly MeshPeerEffect['kind'][];
  readonly effectsDigest: string;
  readonly stateDigest: string;
  readonly chainDigest: string;
}

export interface MeshSimulationMetrics {
  readonly processedEvents: number;
  readonly emittedEffects: number;
  readonly deliveredMessages: number;
  readonly rejectedMessages: number;
  readonly finalLogicalTime: MeshLogicalTime;
}

export interface MeshSimulationTrace {
  readonly seed: number;
  readonly prngVersion: MeshSimulationPrngVersion;
  readonly configurationDigest: string;
  readonly chainDigest: string;
  readonly metrics: MeshSimulationMetrics;
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
  readonly schemaVersion: 1;
  readonly logicalTime: MeshLogicalTime;
  readonly insertionSequence: number;
  readonly peerStates: Readonly<Record<string, MeshPeerState>>;
  readonly outboundSequences: Readonly<Record<string, number>>;
  readonly prngStates: Readonly<Record<string, number>>;
  readonly queuedEvents: readonly MeshSimulationEvent[];
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
}

/** Creates a bounded kernel after hashing its serializable configuration. */
export async function createMeshSimulationKernel(
  config: MeshSimulationConfig
): Promise<MeshSimulationKernel> {
  validateConfig(config);
  const configurationDigest = await digest(configurationProjection(config));
  return new DeterministicMeshSimulationKernel(config, configurationDigest);
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
      expectedRecords[index]?.chainDigest !==
      actualRecords[index]?.chainDigest
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
    ...(matches
      ? {}
      : { firstDivergence: firstDivergence ?? Math.min(count, 0) }),
  });
}

class DeterministicMeshSimulationKernel implements MeshSimulationKernel {
  readonly config: MeshSimulationConfig;
  readonly configurationDigest: string;
  readonly #peers = new Map<string, PeerRuntime>();
  readonly #queue: MeshSimulationEvent[] = [];
  readonly #eventIds = new Set<string>();
  readonly #prngStates = new Map<string, number>();
  readonly #records: MeshSimulationRecord[] = [];
  #insertionSequence = 0;
  #logicalTime = 0;
  #processedEvents = 0;
  #emittedEffects = 0;
  #deliveredMessages = 0;
  #rejectedMessages = 0;
  #chainDigest: string;

  constructor(config: MeshSimulationConfig, configurationDigest: string) {
    this.config = config;
    this.configurationDigest = configurationDigest;
    this.#chainDigest = configurationDigest;
    for (const peer of config.peers) {
      this.#peers.set(peer.peerId, {
        config: peer,
        state: peer.state,
        outboundSequence: peer.outboundSequence ?? 0,
      });
    }
  }

  enqueue(input: MeshSimulationEventInput): void {
    if (!input || typeof input !== 'object' || this.#eventIds.has(input.eventId)) {
      throw new TypeError('Invalid or duplicate Mesh simulation event');
    }
    if (
      !this.#peers.has(input.targetPeerId) ||
      !Number.isSafeInteger(input.logicalTime) ||
      input.logicalTime < this.#logicalTime ||
      input.logicalTime > this.config.limits.maximumLogicalTime ||
      !Number.isSafeInteger(input.priority)
    ) {
      throw new RangeError('Mesh simulation event is outside configured bounds');
    }
    if (this.#queue.length >= this.config.limits.maximumQueuedEvents) {
      throw new RangeError('Mesh simulation queue limit exceeded');
    }
    this.#insertionSequence += 1;
    const event = Object.freeze({
      eventId: input.eventId,
      targetPeerId: input.targetPeerId,
      order: Object.freeze({
        logicalTime: input.logicalTime,
        priority: input.priority,
        insertionSequence: this.#insertionSequence,
      }),
      action: freezeAction(input.action),
    });
    this.#eventIds.add(input.eventId);
    this.#queue.push(event);
    this.#queue.sort(compareEvents);
  }

  random(scope: string): number {
    if (typeof scope !== 'string' || scope.length === 0) {
      throw new TypeError('Mesh simulation random scope is required');
    }
    let state =
      this.#prngStates.get(scope) ??
      mixSeed(this.config.seed >>> 0, scope);
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
    if (!event) throw new TypeError('Mesh simulation queue became inconsistent');
    this.#logicalTime = event.order.logicalTime;
    const peer = this.#peers.get(event.targetPeerId);
    if (!peer) throw new TypeError('Mesh simulation target disappeared');

    let effects: readonly MeshPeerEffect[] = Object.freeze([]);
    let accepted: boolean | undefined;
    let rejectionCode: string | undefined;
    if (event.action.kind === 'peer.input') {
      const transition = reduceMeshPeer(
        peer.state,
        event.action.input,
        this.#logicalTime
      );
      peer.state = transition.state;
      effects = await this.#interpret(peer, transition.effects, event);
    } else {
      const decision = await processMeshEnvelope(peer.state, {
        envelope: event.action.envelope,
        verifiedAt: timestampAt(this.config.startTime, this.#logicalTime),
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
        effects = await this.#interpret(peer, decision.effects, event);
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
      actionDigest,
      ...(accepted === undefined ? {} : { accepted }),
      ...(rejectionCode === undefined ? {} : { rejectionCode }),
      effectKinds: Object.freeze(effects.map((effect) => effect.kind)),
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
    if (this.config.recordingMode === 'full') this.#records.push(record);
    return record;
  }

  async runUntilIdle(): Promise<MeshSimulationTrace> {
    while (this.#queue.length > 0) await this.step();
    return Object.freeze({
      seed: this.config.seed,
      prngVersion: this.config.prngVersion,
      configurationDigest: this.configurationDigest,
      chainDigest: this.#chainDigest,
      metrics: Object.freeze({
        processedEvents: this.#processedEvents,
        emittedEffects: this.#emittedEffects,
        deliveredMessages: this.#deliveredMessages,
        rejectedMessages: this.#rejectedMessages,
        finalLogicalTime: this.#logicalTime,
      }),
      ...(this.config.recordingMode === 'full'
        ? { records: Object.freeze([...this.#records]) }
        : {}),
      peerStates: this.#peerStates(),
    });
  }

  snapshot(): MeshSimulationSnapshot {
    return Object.freeze({
      schemaVersion: 1,
      logicalTime: this.#logicalTime,
      insertionSequence: this.#insertionSequence,
      peerStates: this.#peerStates(),
      outboundSequences: frozenRecord(
        [...this.#peers].map(([peerId, peer]) => [
          peerId,
          peer.outboundSequence,
        ])
      ),
      prngStates: frozenRecord([...this.#prngStates]),
      queuedEvents: Object.freeze([...this.#queue]),
      chainDigest: this.#chainDigest,
    });
  }

  async #interpret(
    peer: PeerRuntime,
    initial: readonly MeshPeerEffect[],
    root: MeshSimulationEvent
  ): Promise<readonly MeshPeerEffect[]> {
    const effects = [...initial];
    const prepared = new Map<string, SignedMeshEnvelope>();
    for (let index = 0; index < effects.length; index += 1) {
      if (index >= this.config.limits.maximumInternalSteps) {
        throw new RangeError('Mesh simulation internal step limit exceeded');
      }
      const effect = effects[index];
      if (effect.kind === 'message.prepare') {
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
              expiresAt:
                this.#logicalTime + effect.intent.maximumLifetimeMs,
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
        const link = this.config.links.find(
          (candidate) =>
            candidate.fromPeerId === peer.config.peerId &&
            candidate.toPeerId === effect.audiencePeerId
        );
        if (!link?.enabled) {
          this.#rejectedMessages += 1;
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
      wireVersion: MESH_WIRE_VERSION,
      messageId: deterministicMessageId(
        () => this.random(`message:${peer.config.peerId}`)
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
}

function validateConfig(config: MeshSimulationConfig): void {
  if (
    !config ||
    config.prngVersion !== 'xorshift32-v1' ||
    !Number.isSafeInteger(config.seed) ||
    !Number.isFinite(Date.parse(config.startTime)) ||
    !Array.isArray(config.peers) ||
    config.peers.length < 1
  ) {
    throw new TypeError('Invalid Mesh simulation configuration');
  }
  const ids = config.peers.map((peer) => peer.peerId);
  if (new Set(ids).size !== ids.length) {
    throw new TypeError('Duplicate Mesh simulation peer');
  }
  for (const value of Object.values(config.limits)) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new RangeError('Invalid Mesh simulation limit');
    }
  }
}

function configurationProjection(config: MeshSimulationConfig): unknown {
  return {
    seed: config.seed,
    prngVersion: config.prngVersion,
    recordingMode: config.recordingMode,
    startTime: config.startTime,
    peers: config.peers.map((peer) => ({
      peerId: peer.peerId,
      state: peer.state,
      outboundSequence: peer.outboundSequence ?? 0,
    })),
    links: config.links,
    limits: config.limits,
    invariants: (config.invariants ?? []).map((invariant) => invariant.name),
  };
}

function freezeAction(action: MeshSimulationAction): MeshSimulationAction {
  if (action?.kind === 'peer.input') {
    return Object.freeze({
      kind: 'peer.input',
      input: Object.freeze({ ...action.input }),
    });
  }
  if (action?.kind === 'message.delivery') {
    return Object.freeze({ kind: 'message.delivery', envelope: action.envelope });
  }
  throw new TypeError('Invalid Mesh simulation action');
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
  if (!canonical.ok) throw new TypeError('Mesh simulation value is not canonical');
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
