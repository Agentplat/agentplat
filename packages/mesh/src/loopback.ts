import {
  MESH_PROTOCOL,
  MESH_SIGNATURE_ALGORITHM,
  MESH_SUPPORTED_WIRE_VERSIONS,
  MESH_WIRE_VERSION,
  type MeshMessagePayload,
  type MeshProtocolOptions,
  type SignedMeshEnvelope,
  type UnsignedMeshEnvelope,
  type MeshWireVersion,
} from '@agentplat/mesh-protocol';
import type {
  MeshCryptoPolicy,
  MeshEnvelopeSigner,
  MeshEnvelopeVerifier,
  MeshKeyResolver,
} from '@agentplat/mesh-crypto';

import {
  ALLOW_PREPROVISIONED_MESH_ADMISSION,
  processMeshEnvelope,
} from './inbound.js';
import { reduceMeshPeer } from './reducer.js';
import type {
  MeshAdmissionPolicy,
  MeshLogicalTime,
  MeshPeerEffect,
  MeshPeerIdentity,
  MeshPeerInput,
  MeshPeerState,
} from './contracts.js';

/** Exact transport route; peer IDs are never global lookup keys. */
export interface MeshLoopbackAddress {
  readonly tenantId: string;
  readonly meshId: string;
  readonly peerId: string;
}

/** One coherent wall-clock and logical-time sample supplied by a driver. */
export interface MeshLoopbackTime {
  readonly logicalTime: MeshLogicalTime;
  readonly timestamp: string;
}

/** Explicit clock used by loopback and deterministic tests. */
export interface MeshLoopbackClock {
  now(): MeshLoopbackTime;
}

/** Injectable canonical message-ID source. */
export interface MeshLoopbackMessageIdSource {
  nextMessageId(): string;
}

/** Redacted queue entry returned by inspection. */
export interface MeshLoopbackQueueEntry {
  readonly insertionSequence: number;
  readonly messageId: string;
  readonly target: MeshLoopbackAddress;
}

/** Delivery result at the in-memory transport boundary. */
export type MeshLoopbackReceipt =
  | {
      readonly accepted: true;
      readonly messageId: string;
      readonly target: MeshLoopbackAddress;
    }
  | {
      readonly accepted: false;
      readonly messageId?: string;
      readonly reasonCode: string;
      readonly target?: MeshLoopbackAddress;
    };

/** State and immediate effects returned after one local peer input. */
export interface MeshLoopbackDispatchResult {
  readonly state: MeshPeerState;
  readonly effects: readonly MeshPeerEffect[];
  readonly receipts: readonly MeshLoopbackReceipt[];
}

/** External commands; interpreted effect results remain driver-owned. */
export type MeshLoopbackPeerCommand = Exclude<
  MeshPeerInput,
  { readonly kind: 'effect.result' }
>;

/** Restart-safe snapshot owned by one registered loopback peer. */
export interface MeshLoopbackPeerSnapshot {
  readonly state: MeshPeerState;
  readonly outboundSequence: number;
}

/** Complete dependencies for one signed loopback peer. */
export interface MeshLoopbackPeerOptions {
  readonly state: MeshPeerState;
  readonly signer: MeshEnvelopeSigner;
  readonly verifier: MeshEnvelopeVerifier;
  readonly resolver: MeshKeyResolver;
  readonly cryptoPolicy: MeshCryptoPolicy;
  readonly privateKey: CryptoKey;
  readonly clock: MeshLoopbackClock;
  readonly messageIds?: MeshLoopbackMessageIdSource;
  readonly admissionPolicy?: MeshAdmissionPolicy;
  readonly outboundSequence?: number;
  /** Construction-bound outbound version; compatibility v0 needs a v0 signer. */
  readonly wireVersion?: MeshWireVersion;
  readonly crypto?: Crypto;
  readonly protocolOptions?: MeshProtocolOptions;
  readonly supportedCriticalExtensions?: readonly string[];
  readonly onEffect?: (effect: MeshPeerEffect) => void;
}

/** Mutable driver handle around immutable peer snapshots. */
export interface MeshLoopbackPeer {
  readonly address: MeshLoopbackAddress;
  getState(): MeshPeerState;
  snapshot(): MeshLoopbackPeerSnapshot;
  dispatch(input: MeshLoopbackPeerCommand): Promise<MeshLoopbackDispatchResult>;
}

/** Construction bounds for one explicit in-memory transport. */
export interface MeshLoopbackTransportOptions {
  readonly maximumPeers?: number;
  readonly maximumQueueDepth?: number;
  readonly maximumQueuedBytes?: number;
  readonly maximumDuplicateCopies?: number;
  readonly maximumInternalStepsPerTransition?: number;
}

/** Signed, bounded and explicitly scoped local transport. */
export interface MeshLoopbackTransport {
  register(options: MeshLoopbackPeerOptions): MeshLoopbackPeer;
  unregister(address: MeshLoopbackAddress): void;
  deliver(envelope: SignedMeshEnvelope): Promise<MeshLoopbackReceipt>;
  injectDuplicate(
    envelope: SignedMeshEnvelope,
    additionalDeliveries?: number
  ): Promise<readonly MeshLoopbackReceipt[]>;
  inspectQueue(): readonly MeshLoopbackQueueEntry[];
  idle(): Promise<void>;
  close(): Promise<void>;
}

interface QueueJob {
  readonly insertionSequence: number;
  readonly envelope: SignedMeshEnvelope;
  readonly target: MeshLoopbackAddress;
  readonly byteLength: number;
  readonly resolve: (receipt: MeshLoopbackReceipt) => void;
}

interface PeerAcceptance {
  readonly receipt: MeshLoopbackReceipt;
  readonly outgoing: readonly SignedMeshEnvelope[];
}

const defaultMaximumQueueDepth = 1_024;
const defaultMaximumQueuedBytes = 16 * 1_024 * 1_024;

/** Creates an isolated loopback bus with no process-global registry. */
export function createMeshLoopbackTransport(
  options: MeshLoopbackTransportOptions = {}
): MeshLoopbackTransport {
  return new InMemoryMeshLoopbackTransport(options);
}

class InMemoryMeshLoopbackTransport implements MeshLoopbackTransport {
  readonly #maximumQueueDepth: number;
  readonly #maximumPeers: number;
  readonly #maximumQueuedBytes: number;
  readonly #maximumDuplicateCopies: number;
  readonly #maximumInternalStepsPerTransition: number;
  readonly #peers = new Map<string, LoopbackPeer>();
  readonly #seenInstances = new Set<string>();
  readonly #queue: QueueJob[] = [];
  readonly #idleWaiters: (() => void)[] = [];
  #insertionSequence = 0;
  #queuedBytes = 0;
  #inFlight = 0;
  #inFlightBytes = 0;
  #draining = false;
  #activeDispatches = 0;
  #closed = false;
  #closePromise: Promise<void> | undefined;
  #resolveClose: (() => void) | undefined;

  constructor(options: MeshLoopbackTransportOptions) {
    const maximumQueueDepth =
      options.maximumQueueDepth ?? defaultMaximumQueueDepth;
    const limits = {
      maximumPeers: options.maximumPeers ?? 256,
      maximumQueueDepth,
      maximumQueuedBytes:
        options.maximumQueuedBytes ?? defaultMaximumQueuedBytes,
      maximumDuplicateCopies: options.maximumDuplicateCopies ?? 16,
      maximumInternalStepsPerTransition:
        options.maximumInternalStepsPerTransition ?? 1_024,
    };
    for (const [name, value] of Object.entries(limits)) {
      if (!Number.isSafeInteger(value) || value < 1) {
        throw new RangeError(
          `Mesh loopback ${name} must be a positive safe integer`
        );
      }
    }
    this.#maximumQueueDepth = maximumQueueDepth;
    this.#maximumPeers = limits.maximumPeers;
    this.#maximumQueuedBytes = limits.maximumQueuedBytes;
    this.#maximumDuplicateCopies = limits.maximumDuplicateCopies;
    this.#maximumInternalStepsPerTransition =
      limits.maximumInternalStepsPerTransition;
  }

  register(options: MeshLoopbackPeerOptions): MeshLoopbackPeer {
    if (this.#closed) throw new Error('Mesh loopback transport is closed');
    if (this.#peers.size >= this.#maximumPeers) {
      throw new RangeError('Mesh loopback peer capacity exceeded');
    }
    const peer = new LoopbackPeer(this, options);
    const key = addressKey(peer.address);
    if (this.#peers.has(key)) {
      throw new TypeError('Duplicate Mesh loopback peer registration');
    }
    const instanceKey = JSON.stringify([
      ...JSON.parse(key),
      options.state.identity.instanceId,
    ]);
    if (this.#seenInstances.has(instanceKey)) {
      throw new TypeError(
        'Mesh loopback peer instance cannot be re-registered'
      );
    }
    this.#seenInstances.add(instanceKey);
    this.#peers.set(key, peer);
    return peer;
  }

  unregister(address: MeshLoopbackAddress): void {
    const key = addressKey(freezeAddress(address));
    this.#peers.get(key)?.dispose();
    this.#peers.delete(key);
  }

  deliver(envelope: SignedMeshEnvelope): Promise<MeshLoopbackReceipt> {
    const target = directTarget(envelope);
    if (!target) {
      return Promise.resolve(
        Object.freeze({
          accepted: false,
          messageId: envelope?.messageId,
          reasonCode: 'audience_not_direct',
        })
      );
    }
    return this.#enqueue(envelope, target);
  }

  injectDuplicate(
    envelope: SignedMeshEnvelope,
    additionalDeliveries = 1
  ): Promise<readonly MeshLoopbackReceipt[]> {
    if (
      !Number.isSafeInteger(additionalDeliveries) ||
      additionalDeliveries < 1 ||
      additionalDeliveries > this.#maximumDuplicateCopies
    ) {
      throw new RangeError(
        'Mesh loopback additionalDeliveries must be a positive safe integer'
      );
    }
    const target = directTarget(envelope);
    if (!target) {
      return Promise.resolve(
        Object.freeze([
          Object.freeze({
            accepted: false,
            messageId: envelope?.messageId,
            reasonCode: 'audience_not_direct',
          }),
        ])
      );
    }
    const byteLength = envelopeByteLength(envelope);
    const batchSize = additionalDeliveries + 1;
    if (
      this.#closed ||
      this.#queue.length + this.#inFlight + batchSize >
        this.#maximumQueueDepth ||
      this.#queuedBytes + this.#inFlightBytes + byteLength * batchSize >
        this.#maximumQueuedBytes
    ) {
      return Promise.resolve(
        Object.freeze([
          Object.freeze({
            accepted: false,
            messageId: envelope.messageId,
            reasonCode: this.#closed
              ? 'transport_closed'
              : 'queue_capacity_exceeded',
            target,
          }),
        ])
      );
    }
    return Promise.all(
      Array.from({ length: additionalDeliveries + 1 }, () =>
        this.#enqueue(envelope, target)
      )
    ).then((receipts) => Object.freeze(receipts));
  }

  inspectQueue(): readonly MeshLoopbackQueueEntry[] {
    return Object.freeze(
      this.#queue.map((job) =>
        Object.freeze({
          insertionSequence: job.insertionSequence,
          messageId: job.envelope.messageId,
          target: job.target,
        })
      )
    );
  }

  idle(): Promise<void> {
    if (!this.#draining && this.#queue.length === 0) return Promise.resolve();
    return new Promise((resolve) => this.#idleWaiters.push(resolve));
  }

  close(): Promise<void> {
    if (this.#closePromise) return this.#closePromise;
    this.#closed = true;
    this.#closePromise = new Promise<void>((resolve) => {
      this.#resolveClose = resolve;
    }).then(() => {
      for (const peer of this.#peers.values()) peer.dispose();
      this.#peers.clear();
    });
    this.#resolveCloseIfQuiescent();
    return this.#closePromise;
  }

  async dispatchFrom(
    peer: LoopbackPeer,
    input: MeshLoopbackPeerCommand
  ): Promise<MeshLoopbackDispatchResult> {
    if (this.#closed) throw new Error('Mesh loopback transport is closed');
    this.#activeDispatches += 1;
    try {
      const result = await peer.applyLocal(input);
      const receipts = await Promise.all(
        result.outgoing.map((envelope) => {
          const target = directTarget(envelope);
          return target
            ? this.#enqueue(envelope, target, true)
            : Promise.resolve<MeshLoopbackReceipt>(
                Object.freeze({
                  accepted: false,
                  messageId: envelope.messageId,
                  reasonCode: 'audience_not_direct',
                })
              );
        })
      );
      return Object.freeze({
        state: result.state,
        effects: result.effects,
        receipts: Object.freeze(receipts),
      });
    } finally {
      this.#activeDispatches -= 1;
      this.#resolveCloseIfQuiescent();
    }
  }

  #enqueue(
    envelope: SignedMeshEnvelope,
    target: MeshLoopbackAddress,
    internal = false
  ): Promise<MeshLoopbackReceipt> {
    if (this.#closed && !internal) {
      return Promise.resolve(
        Object.freeze({
          accepted: false,
          messageId: envelope.messageId,
          reasonCode: 'transport_closed',
          target,
        })
      );
    }
    const byteLength = envelopeByteLength(envelope);
    if (
      this.#queue.length + this.#inFlight >= this.#maximumQueueDepth ||
      this.#queuedBytes + this.#inFlightBytes + byteLength >
        this.#maximumQueuedBytes
    ) {
      return Promise.resolve(
        Object.freeze({
          accepted: false,
          messageId: envelope.messageId,
          reasonCode: 'queue_capacity_exceeded',
          target,
        })
      );
    }
    return new Promise((resolve) => {
      this.#insertionSequence += 1;
      this.#queue.push({
        insertionSequence: this.#insertionSequence,
        envelope,
        target,
        byteLength,
        resolve,
      });
      this.#queuedBytes += byteLength;
      this.#scheduleDrain();
    });
  }

  #scheduleDrain(): void {
    if (this.#draining) return;
    this.#draining = true;
    void Promise.resolve().then(() => this.#drain());
  }

  async #drain(): Promise<void> {
    try {
      while (this.#queue.length > 0) {
        const job = this.#queue.shift();
        if (!job) break;
        this.#queuedBytes -= job.byteLength;
        this.#inFlight = 1;
        this.#inFlightBytes = job.byteLength;
        const peer = this.#peers.get(addressKey(job.target));
        if (!peer) {
          job.resolve(
            Object.freeze({
              accepted: false,
              messageId: job.envelope.messageId,
              reasonCode: 'endpoint_not_found',
              target: job.target,
            })
          );
          this.#inFlight = 0;
          this.#inFlightBytes = 0;
          continue;
        }
        let result: PeerAcceptance;
        try {
          result = await peer.accept(job.envelope);
        } catch {
          result = {
            receipt: Object.freeze({
              accepted: false,
              messageId: job.envelope.messageId,
              reasonCode: 'endpoint_failed',
              target: job.target,
            }),
            outgoing: Object.freeze([]),
          };
        }
        // Acceptance has completed, so its bounded processing slot can be
        // handed directly to any causal descendant produced by that
        // transition (for example, a ping acknowledgement).
        this.#inFlight = 0;
        this.#inFlightBytes = 0;
        job.resolve(result.receipt);
        for (const outgoing of result.outgoing) {
          const target = directTarget(outgoing);
          if (target) void this.#enqueue(outgoing, target, true);
        }
      }
    } finally {
      this.#draining = false;
      if (this.#queue.length > 0) {
        this.#scheduleDrain();
      } else {
        for (const resolve of this.#idleWaiters.splice(0)) resolve();
      }
      this.#resolveCloseIfQuiescent();
    }
  }

  get maximumInternalStepsPerTransition(): number {
    return this.#maximumInternalStepsPerTransition;
  }

  #resolveCloseIfQuiescent(): void {
    if (
      this.#closed &&
      this.#activeDispatches === 0 &&
      !this.#draining &&
      this.#queue.length === 0
    ) {
      this.#resolveClose?.();
      this.#resolveClose = undefined;
    }
  }
}

class LoopbackPeer implements MeshLoopbackPeer {
  readonly address: MeshLoopbackAddress;
  readonly #transport: InMemoryMeshLoopbackTransport;
  readonly #options: MeshLoopbackPeerOptions;
  readonly #prepared = new Map<string, SignedMeshEnvelope>();
  readonly #wireVersion: MeshWireVersion;
  #state: MeshPeerState;
  #outboundSequence: number;
  #tail: Promise<void> = Promise.resolve();

  constructor(
    transport: InMemoryMeshLoopbackTransport,
    options: MeshLoopbackPeerOptions
  ) {
    if (!options || typeof options !== 'object') {
      throw new TypeError('Mesh loopback peer options are required');
    }
    this.#transport = transport;
    this.#options = options;
    this.#state = options.state;
    this.address = freezeAddress(options.state.identity);
    this.#outboundSequence = options.outboundSequence ?? 0;
    this.#wireVersion = options.wireVersion ?? MESH_WIRE_VERSION;
    if (
      !Number.isSafeInteger(this.#outboundSequence) ||
      this.#outboundSequence < 0
    ) {
      throw new RangeError('Invalid Mesh loopback outbound sequence');
    }
    if (!MESH_SUPPORTED_WIRE_VERSIONS.includes(this.#wireVersion)) {
      throw new TypeError('Invalid Mesh loopback wire version');
    }
  }

  getState(): MeshPeerState {
    return this.#state;
  }

  snapshot(): MeshLoopbackPeerSnapshot {
    return Object.freeze({
      state: this.#state,
      outboundSequence: this.#outboundSequence,
    });
  }

  dispatch(
    input: MeshLoopbackPeerCommand
  ): Promise<MeshLoopbackDispatchResult> {
    return this.#transport.dispatchFrom(this, input);
  }

  applyLocal(input: MeshLoopbackPeerCommand): Promise<{
    readonly state: MeshPeerState;
    readonly effects: readonly MeshPeerEffect[];
    readonly outgoing: readonly SignedMeshEnvelope[];
  }> {
    return this.#exclusive(async () => {
      const time = freezeTime(this.#options.clock.now());
      const transition = reduceMeshPeer(this.#state, input, time.logicalTime);
      this.#state = transition.state;
      const interpreted = await this.#interpret(transition.effects, time);
      return Object.freeze({
        state: this.#state,
        effects: transition.effects,
        outgoing: interpreted,
      });
    });
  }

  accept(envelope: SignedMeshEnvelope): Promise<PeerAcceptance> {
    return this.#exclusive(async () => {
      const time = freezeTime(this.#options.clock.now());
      const decision = await processMeshEnvelope(this.#state, {
        envelope,
        verifiedAt: time.timestamp,
        receivedAt: time.logicalTime,
        verifier: this.#options.verifier,
        resolver: this.#options.resolver,
        cryptoPolicy: this.#options.cryptoPolicy,
        admissionPolicy:
          this.#options.admissionPolicy ?? ALLOW_PREPROVISIONED_MESH_ADMISSION,
        crypto: this.#options.crypto,
        protocolOptions: this.#options.protocolOptions,
        supportedCriticalExtensions: this.#options.supportedCriticalExtensions,
      });
      if (!decision.accepted) {
        return Object.freeze({
          receipt: Object.freeze({
            accepted: false,
            messageId: envelope.messageId,
            reasonCode: decision.code,
            target: this.address,
          }),
          outgoing: Object.freeze([]),
        });
      }
      this.#state = decision.state;
      const outgoing = await this.#interpret(decision.effects, time);
      return Object.freeze({
        receipt: Object.freeze({
          accepted: true,
          messageId: envelope.messageId,
          target: this.address,
        }),
        outgoing,
      });
    });
  }

  async #interpret(
    initialEffects: readonly MeshPeerEffect[],
    time: MeshLoopbackTime
  ): Promise<readonly SignedMeshEnvelope[]> {
    const effects = [...initialEffects];
    const outgoing: SignedMeshEnvelope[] = [];
    for (let index = 0; index < effects.length; index += 1) {
      if (index >= this.#transport.maximumInternalStepsPerTransition) {
        throw new RangeError('Mesh loopback internal step limit exceeded');
      }
      const effect = effects[index];
      this.#observe(effect);
      if (effect.kind === 'message.prepare') {
        let transition;
        try {
          const envelope = await this.#prepare(effect, time);
          this.#prepared.set(effect.effectId, envelope);
          transition = reduceMeshPeer(
            this.#state,
            Object.freeze({
              kind: 'effect.result',
              effectId: effect.effectId,
              status: 'succeeded',
              preparedMessage: Object.freeze({
                messageId: envelope.messageId,
                type: envelope.type,
                audiencePeerId: effect.intent.audiencePeerId,
                expiresAt: time.logicalTime + effect.intent.maximumLifetimeMs,
              }),
            }),
            time.logicalTime
          );
        } catch {
          transition = reduceMeshPeer(
            this.#state,
            Object.freeze({
              kind: 'effect.result',
              effectId: effect.effectId,
              status: 'failed',
              errorCode: 'preparation_failed',
            }),
            time.logicalTime
          );
        }
        this.#state = transition.state;
        effects.push(...transition.effects);
      } else if (effect.kind === 'message.deliver') {
        const envelope = this.#prepared.get(effect.preparationEffectId);
        if (
          !envelope ||
          envelope.messageId !== effect.messageId ||
          envelope.audience.kind !== 'peer' ||
          envelope.audience.peerId !== effect.audiencePeerId
        ) {
          throw new TypeError('Mesh loopback delivery lacks prepared bytes');
        }
        this.#prepared.delete(effect.preparationEffectId);
        outgoing.push(envelope);
      }
    }
    return Object.freeze(outgoing);
  }

  dispose(): void {
    this.#prepared.clear();
  }

  async #prepare(
    effect: Extract<MeshPeerEffect, { readonly kind: 'message.prepare' }>,
    time: MeshLoopbackTime
  ): Promise<SignedMeshEnvelope> {
    if (this.#outboundSequence >= Number.MAX_SAFE_INTEGER) {
      throw new RangeError('Mesh loopback outbound sequence exhausted');
    }
    if (
      time.logicalTime >
      Number.MAX_SAFE_INTEGER - effect.intent.maximumLifetimeMs
    ) {
      throw new RangeError('Mesh loopback logical expiry overflow');
    }
    this.#outboundSequence += 1;
    const messageId = (
      this.#options.messageIds ?? defaultMessageIdSource(this.#options.crypto)
    ).nextMessageId();
    const sentAtMilliseconds = Date.parse(time.timestamp);
    if (!Number.isFinite(sentAtMilliseconds)) {
      throw new TypeError('Invalid Mesh loopback timestamp');
    }
    const expiresAt = new Date(
      sentAtMilliseconds + effect.intent.maximumLifetimeMs
    ).toISOString();
    const intent = effect.intent;
    const unsigned: UnsignedMeshEnvelope = {
      protocol: MESH_PROTOCOL,
      wireVersion: this.#wireVersion,
      messageId,
      tenantId: this.#state.identity.tenantId,
      meshId: this.#state.identity.meshId,
      type: intent.type,
      sender: Object.freeze({
        peerId: this.#state.identity.peerId,
        instanceId: this.#state.identity.instanceId,
      }),
      audience: Object.freeze({
        kind: 'peer',
        peerId: intent.audiencePeerId,
      }),
      sequence: this.#outboundSequence,
      sentAt: time.timestamp,
      expiresAt,
      payload: intent.payload,
      proof: Object.freeze({
        algorithm: MESH_SIGNATURE_ALGORITHM,
        keyId: this.#state.identity.keyId,
      }),
      ...(intent.objectiveId === undefined
        ? {}
        : { objectiveId: intent.objectiveId }),
      ...(intent.causationId === undefined
        ? {}
        : { causationId: intent.causationId }),
      ...(intent.correlationId === undefined
        ? {}
        : { correlationId: intent.correlationId }),
    };
    return this.#options.signer.sign({
      envelope: unsigned,
      privateKey: this.#options.privateKey,
      crypto: this.#options.crypto,
      protocolOptions: this.#options.protocolOptions,
    });
  }

  #observe(effect: MeshPeerEffect): void {
    try {
      this.#options.onEffect?.(effect);
    } catch {
      // Observability cannot reverse a committed peer decision.
    }
  }

  #exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#tail.then(operation, operation);
    this.#tail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
}

function directTarget(
  envelope: SignedMeshEnvelope
): MeshLoopbackAddress | undefined {
  if (
    !envelope ||
    typeof envelope !== 'object' ||
    envelope.audience?.kind !== 'peer'
  ) {
    return undefined;
  }
  return Object.freeze({
    tenantId: envelope.tenantId,
    meshId: envelope.meshId,
    peerId: envelope.audience.peerId,
  });
}

function freezeAddress(
  value: Pick<MeshPeerIdentity, 'tenantId' | 'meshId' | 'peerId'>
): MeshLoopbackAddress {
  if (
    !value ||
    typeof value.tenantId !== 'string' ||
    typeof value.meshId !== 'string' ||
    typeof value.peerId !== 'string'
  ) {
    throw new TypeError('Invalid Mesh loopback address');
  }
  return Object.freeze({
    tenantId: value.tenantId,
    meshId: value.meshId,
    peerId: value.peerId,
  });
}

function freezeTime(value: MeshLoopbackTime): MeshLoopbackTime {
  if (
    !value ||
    !Number.isSafeInteger(value.logicalTime) ||
    value.logicalTime < 0 ||
    typeof value.timestamp !== 'string'
  ) {
    throw new TypeError('Invalid Mesh loopback time sample');
  }
  return Object.freeze({
    logicalTime: value.logicalTime,
    timestamp: value.timestamp,
  });
}

function addressKey(address: MeshLoopbackAddress): string {
  return JSON.stringify([address.tenantId, address.meshId, address.peerId]);
}

function defaultMessageIdSource(cryptoOverride: Crypto | undefined): {
  nextMessageId(): string;
} {
  const cryptoProvider = cryptoOverride ?? globalThis.crypto;
  return {
    nextMessageId(): string {
      if (!cryptoProvider?.getRandomValues) {
        throw new Error('Mesh loopback message ID source is unavailable');
      }
      const bytes = cryptoProvider.getRandomValues(new Uint8Array(16));
      return encodeBase64Url(bytes);
    },
  };
}

function encodeBase64Url(bytes: Uint8Array): string {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    const combined = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);
    output += alphabet[(combined >>> 18) & 63];
    output += alphabet[(combined >>> 12) & 63];
    if (second !== undefined) output += alphabet[(combined >>> 6) & 63];
    if (third !== undefined) output += alphabet[combined & 63];
  }
  return output;
}

const envelopeEncoder = new TextEncoder();

function envelopeByteLength(envelope: SignedMeshEnvelope): number {
  try {
    return envelopeEncoder.encode(JSON.stringify(envelope)).byteLength;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}
