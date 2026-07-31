import {
  DEFAULT_MESH_PROTOCOL_LIMITS,
  canonicalizeMeshJsonBytes,
  compareMeshTimestamps,
  validateSignedMeshEnvelope,
  type SignedMeshEnvelope,
} from '@agentplat/mesh-protocol';

import type {
  MeshObjectiveInboundDecision,
  MeshObjectiveInboundProcessor,
  MeshObjectiveInboundRequest,
  MeshObjectiveInboundRuntimeState,
} from './coordination-inbound-contracts.js';
import { isTrustedMeshObjectiveInboundDecision } from './coordination-inbound.js';
import { createMeshObjectiveInboundRuntimeState } from './coordination-inbound-state.js';
import type { MeshObjectivePayload } from './coordination-objective-work-contracts.js';
import type { MeshPeerIdentity } from './contracts.js';
import type {
  MeshCoordinationObjectiveTopicAddress,
  MeshCoordinationObjectiveTopicConfiguration,
  MeshCoordinationObjectiveTopicDiagnostic,
  MeshCoordinationObjectiveTopicDriver,
  MeshCoordinationObjectiveTopicDriverOptions,
  MeshCoordinationObjectiveTopicLimits,
  MeshCoordinationObjectiveTopicPeer,
  MeshCoordinationObjectiveTopicPublishInput,
  MeshCoordinationObjectiveTopicReceipt,
  MeshCoordinationObjectiveTopicRegistration,
  MeshCoordinationObjectiveTopicTime,
} from './coordination-objective-topic-contracts.js';
import { assertMeshLogicalTime } from './state.js';

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:@-]*$/;
const utf8Encoder = new TextEncoder();

/** Conservative defaults that may only be reduced per driver instance. */
export const DEFAULT_MESH_COORDINATION_OBJECTIVE_TOPIC_LIMITS: Readonly<MeshCoordinationObjectiveTopicLimits> =
  Object.freeze({
    maximumEndpoints: 256,
    maximumQueueDepth: 1_024,
    maximumQueuedBytes: 16 * 1_024 * 1_024,
    maximumDeliveriesPerPublish: 32,
    maximumInternalStepsPerDrain: 1_024,
  });

interface TopicEndpoint {
  readonly address: MeshCoordinationObjectiveTopicAddress;
  readonly process: MeshObjectiveInboundProcessor['process'];
  getState(): MeshObjectiveInboundRuntimeState;
  setState(state: MeshObjectiveInboundRuntimeState): void;
}

interface TopicQueueJob {
  readonly insertionSequence: number;
  readonly envelope: SignedMeshEnvelope<MeshObjectivePayload>;
  readonly canonicalEnvelope: Uint8Array;
  readonly target: MeshCoordinationObjectiveTopicAddress;
  /** The exact endpoint selected from the sender view at enqueue time. */
  readonly selectedEndpoint: TopicEndpoint | undefined;
  readonly byteLength: number;
  readonly resolve: (receipt: MeshCoordinationObjectiveTopicReceipt) => void;
}

/** Creates one isolated Objective topic driver with construction-bound trust inputs. */
export function createMeshCoordinationObjectiveTopicDriver(
  options: MeshCoordinationObjectiveTopicDriverOptions
): MeshCoordinationObjectiveTopicDriver {
  const driver = new InMemoryMeshCoordinationObjectiveTopicDriver(options);
  return Object.freeze({
    configuration: driver.configuration,
    register: driver.register.bind(driver),
    idle: driver.idle.bind(driver),
    close: driver.close.bind(driver),
  });
}

class InMemoryMeshCoordinationObjectiveTopicDriver implements MeshCoordinationObjectiveTopicDriver {
  readonly configuration: MeshCoordinationObjectiveTopicConfiguration;
  readonly #now: (
    address: MeshCoordinationObjectiveTopicAddress
  ) => MeshCoordinationObjectiveTopicTime;
  readonly #onDiagnostic:
    | ((diagnostic: MeshCoordinationObjectiveTopicDiagnostic) => void)
    | undefined;
  readonly #endpoints = new Map<string, TopicEndpoint>();
  readonly #queue: TopicQueueJob[] = [];
  #insertionSequence = 0;
  #queuedBytes = 0;
  #inFlight = 0;
  #inFlightBytes = 0;
  #draining = false;
  #closed = false;
  #idlePromise: Promise<void> | undefined;
  #resolveIdle: (() => void) | undefined;
  #closePromise: Promise<void> | undefined;
  #resolveClose: (() => void) | undefined;

  constructor(options: MeshCoordinationObjectiveTopicDriverOptions) {
    assertOptions(options);
    const limits = resolveLimits(options);
    this.configuration = Object.freeze({
      tenantId: options.tenantId,
      meshId: options.meshId,
      ...limits,
    });
    this.#now = options.clock.now.bind(options.clock);
    this.#onDiagnostic =
      options.onDiagnostic === undefined
        ? undefined
        : options.onDiagnostic.bind(undefined);
  }

  register(
    registration: MeshCoordinationObjectiveTopicRegistration
  ): MeshCoordinationObjectiveTopicPeer {
    if (this.#closed) {
      throw new Error('Mesh coordination Objective topic driver is closed');
    }
    assertRegistration(registration);
    if (this.#endpoints.size >= this.configuration.maximumEndpoints) {
      throw new RangeError(
        'Mesh coordination Objective topic endpoint capacity exceeded'
      );
    }
    assertRuntimeState(registration.state);
    const identity = registration.state.discovery.identity;
    if (
      identity.tenantId !== this.configuration.tenantId ||
      identity.meshId !== this.configuration.meshId
    ) {
      throw new TypeError(
        'Mesh coordination Objective topic endpoint scope mismatch'
      );
    }
    const address = freezeAddress(identity);
    const key = addressKey(address);
    if (this.#endpoints.has(key)) {
      throw new TypeError(
        'Duplicate Mesh coordination Objective topic endpoint'
      );
    }
    const endpoint = new RegisteredObjectiveTopicEndpoint(
      this,
      address,
      registration.state,
      registration.processor.process.bind(registration.processor)
    );
    this.#endpoints.set(key, endpoint);
    return endpoint.handle;
  }

  idle(): Promise<void> {
    if (this.#isQuiescent()) return Promise.resolve();
    if (!this.#idlePromise) {
      this.#idlePromise = new Promise<void>((resolve) => {
        this.#resolveIdle = resolve;
      });
    }
    return this.#idlePromise;
  }

  close(): Promise<void> {
    if (this.#closePromise) return this.#closePromise;
    this.#closed = true;
    this.#closePromise = new Promise<void>((resolve) => {
      this.#resolveClose = resolve;
    }).then(() => {
      this.#endpoints.clear();
    });
    this.#resolveQuiescence();
    return this.#closePromise;
  }

  unregister(endpoint: TopicEndpoint): void {
    const key = addressKey(endpoint.address);
    if (this.#endpoints.get(key) === endpoint) this.#endpoints.delete(key);
  }

  publishFrom(
    sender: TopicEndpoint,
    input: MeshCoordinationObjectiveTopicPublishInput
  ): Promise<readonly MeshCoordinationObjectiveTopicReceipt[]> {
    if (this.#closed) {
      throw new Error('Mesh coordination Objective topic driver is closed');
    }
    if (this.#endpoints.get(addressKey(sender.address)) !== sender) {
      throw new Error(
        'Mesh coordination Objective topic endpoint is unregistered'
      );
    }
    assertPublishInput(input);

    const structural = validateSignedMeshEnvelope(input.envelope);
    if (!structural.ok) {
      throw new TypeError('Invalid signed Mesh Objective envelope');
    }
    const envelope =
      structural.value as SignedMeshEnvelope<MeshObjectivePayload>;
    assertPublicationIdentity(sender, envelope, this.configuration);
    assertObjectiveTopic(envelope);
    const time = this.#sampleTime(sender.address);
    const state = sender.getState();
    const lastLogicalTime = Math.max(
      state.coordination.lastLogicalTime,
      state.discovery.lastLogicalTime,
      state.objectives.lastLogicalTime,
      state.inbound.lastLogicalTime
    );
    if (time.receivedAt < lastLogicalTime) {
      throw new RangeError(
        'Mesh coordination Objective topic logical time cannot move backwards'
      );
    }

    const maximumFanout = Math.min(
      this.configuration.maximumDeliveriesPerPublish,
      state.discovery.limits.maximumFanout
    );
    const fanout = input.fanout ?? maximumFanout;
    if (!Number.isSafeInteger(fanout) || fanout < 1 || fanout > maximumFanout) {
      throw new RangeError('Invalid Mesh coordination Objective topic fanout');
    }

    // Selection begins solely with the sender's own active view. The process
    // registry only pins an already-selected exact instance; it never expands
    // the reachable recipient set.
    const targets = selectTopicTargets(state, sender.address, time, fanout);
    if (targets.length === 0) return Promise.resolve(Object.freeze([]));

    const canonical = canonicalizeMeshJsonBytes(envelope);
    if (!canonical.ok) {
      throw new TypeError('Invalid canonical Mesh Objective envelope');
    }
    const batchBytes = checkedProduct(
      canonical.value.byteLength,
      targets.length
    );
    if (
      batchBytes === undefined ||
      exceedsSum(
        this.#insertionSequence,
        targets.length,
        Number.MAX_SAFE_INTEGER
      ) ||
      exceedsSum(
        this.#queue.length + this.#inFlight,
        targets.length,
        this.configuration.maximumQueueDepth
      ) ||
      exceedsSum(
        this.#queuedBytes + this.#inFlightBytes,
        batchBytes,
        this.configuration.maximumQueuedBytes
      )
    ) {
      return Promise.resolve(
        this.#rejectBatch(
          envelope.messageId,
          targets,
          'queue_capacity_exceeded'
        )
      );
    }

    const promises = targets.map(
      (target) =>
        new Promise<MeshCoordinationObjectiveTopicReceipt>((resolve) => {
          this.#insertionSequence += 1;
          this.#queue.push({
            insertionSequence: this.#insertionSequence,
            envelope,
            canonicalEnvelope: canonical.value,
            target,
            selectedEndpoint: this.#endpoints.get(addressKey(target)),
            byteLength: canonical.value.byteLength,
            resolve,
          });
        })
    );
    this.#queuedBytes += batchBytes;
    this.#scheduleDrain();
    return Promise.all(promises).then((receipts) => Object.freeze(receipts));
  }

  #rejectBatch(
    messageId: string,
    targets: readonly MeshCoordinationObjectiveTopicAddress[],
    code: string
  ): readonly MeshCoordinationObjectiveTopicReceipt[] {
    return Object.freeze(
      targets.map((target) => {
        this.#diagnose('rejected', code, messageId, target);
        return freezeReceipt('rejected', messageId, target);
      })
    );
  }

  #sampleTime(
    address: MeshCoordinationObjectiveTopicAddress
  ): MeshCoordinationObjectiveTopicTime {
    return freezeTime(this.#now(address));
  }

  #scheduleDrain(): void {
    if (this.#draining) return;
    this.#draining = true;
    void Promise.resolve().then(() => this.#drain());
  }

  async #drain(): Promise<void> {
    let steps = 0;
    try {
      while (
        this.#queue.length > 0 &&
        steps < this.configuration.maximumInternalStepsPerDrain
      ) {
        const job = this.#queue.shift();
        if (!job) break;
        steps += 1;
        this.#queuedBytes -= job.byteLength;
        this.#inFlight = 1;
        this.#inFlightBytes = job.byteLength;
        const endpoint = this.#endpoints.get(addressKey(job.target));
        if (!endpoint || endpoint !== job.selectedEndpoint) {
          this.#finishJob(
            job,
            freezeReceipt('unavailable', job.envelope.messageId, job.target),
            'endpoint_unavailable'
          );
          continue;
        }

        let receipt: MeshCoordinationObjectiveTopicReceipt;
        let diagnosticCode: string | undefined;
        try {
          const time = this.#sampleTime(job.target);
          const priorState = endpoint.getState();
          const request: MeshObjectiveInboundRequest = Object.freeze({
            envelope: job.envelope,
            verifiedAt: time.verifiedAt,
            receivedAt: time.receivedAt,
          });
          const decision = await endpoint.process(priorState, request);
          assertProcessorDecision(
            decision,
            priorState,
            request,
            job.envelope,
            job.canonicalEnvelope
          );
          endpoint.setState(decision.state);
          if (decision.accepted) {
            receipt = freezeReceipt(
              'accepted',
              job.envelope.messageId,
              job.target
            );
          } else {
            diagnosticCode = decision.code;
            receipt = freezeReceipt(
              'rejected',
              job.envelope.messageId,
              job.target
            );
          }
        } catch {
          diagnosticCode = 'endpoint_failed';
          receipt = freezeReceipt(
            'rejected',
            job.envelope.messageId,
            job.target
          );
        }
        this.#finishJob(job, receipt, diagnosticCode);
      }
    } finally {
      this.#draining = false;
      if (this.#queue.length > 0) {
        this.#scheduleDrain();
      } else {
        this.#resolveQuiescence();
      }
    }
  }

  #finishJob(
    job: TopicQueueJob,
    receipt: MeshCoordinationObjectiveTopicReceipt,
    diagnosticCode: string | undefined
  ): void {
    this.#inFlight = 0;
    this.#inFlightBytes = 0;
    if (diagnosticCode !== undefined && receipt.status !== 'accepted') {
      this.#diagnose(
        receipt.status,
        diagnosticCode,
        job.envelope.messageId,
        job.target
      );
    }
    job.resolve(receipt);
  }

  #diagnose(
    status: 'rejected' | 'unavailable',
    code: string,
    messageId: string,
    target: MeshCoordinationObjectiveTopicAddress
  ): void {
    try {
      this.#onDiagnostic?.(Object.freeze({ status, code, messageId, target }));
    } catch {
      // Local diagnostics cannot change delivery or committed endpoint state.
    }
  }

  #isQuiescent(): boolean {
    return !this.#draining && this.#inFlight === 0 && this.#queue.length === 0;
  }

  #resolveQuiescence(): void {
    if (!this.#isQuiescent()) return;
    const resolveIdle = this.#resolveIdle;
    this.#resolveIdle = undefined;
    this.#idlePromise = undefined;
    resolveIdle?.();
    if (this.#closed) {
      this.#resolveClose?.();
      this.#resolveClose = undefined;
    }
  }
}

class RegisteredObjectiveTopicEndpoint implements TopicEndpoint {
  readonly address: MeshCoordinationObjectiveTopicAddress;
  readonly handle: MeshCoordinationObjectiveTopicPeer;
  readonly process: MeshObjectiveInboundProcessor['process'];
  readonly #driver: InMemoryMeshCoordinationObjectiveTopicDriver;
  #state: MeshObjectiveInboundRuntimeState;

  constructor(
    driver: InMemoryMeshCoordinationObjectiveTopicDriver,
    address: MeshCoordinationObjectiveTopicAddress,
    state: MeshObjectiveInboundRuntimeState,
    process: MeshObjectiveInboundProcessor['process']
  ) {
    this.#driver = driver;
    this.address = address;
    this.#state = state;
    this.process = process;
    this.handle = Object.freeze({
      address,
      getState: this.getState.bind(this),
      publish: this.publish.bind(this),
      unregister: this.unregister.bind(this),
    });
    Object.freeze(this);
  }

  getState(): MeshObjectiveInboundRuntimeState {
    return this.#state;
  }

  setState(state: MeshObjectiveInboundRuntimeState): void {
    this.#state = state;
  }

  publish(
    input: MeshCoordinationObjectiveTopicPublishInput
  ): Promise<readonly MeshCoordinationObjectiveTopicReceipt[]> {
    return this.#driver.publishFrom(this, input);
  }

  unregister(): void {
    this.#driver.unregister(this);
  }
}

function selectTopicTargets(
  state: MeshObjectiveInboundRuntimeState,
  sender: MeshCoordinationObjectiveTopicAddress,
  time: MeshCoordinationObjectiveTopicTime,
  fanout: number
): readonly MeshCoordinationObjectiveTopicAddress[] {
  const targets: MeshCoordinationObjectiveTopicAddress[] = [];
  for (const [peerId, view] of Object.entries(state.discovery.peerViews)) {
    const card = state.discovery.peerCards[peerId];
    const admission = state.discovery.admittedPeers[peerId];
    if (
      !card ||
      !admission ||
      card.status !== 'active' ||
      view.expiresAt <= time.receivedAt ||
      card.expiresAt <= time.receivedAt ||
      view.peerCardId !== card.peerCardId ||
      view.cardRevision !== card.cardRevision ||
      !admission.instanceIds.includes(card.instanceId) ||
      !timestampIsBefore(time.verifiedAt, admission.validUntil) ||
      (peerId === sender.peerId && card.instanceId === sender.instanceId)
    ) {
      continue;
    }
    targets.push(
      Object.freeze({
        tenantId: sender.tenantId,
        meshId: sender.meshId,
        peerId,
        instanceId: card.instanceId,
      })
    );
  }
  targets.sort(compareAddresses);
  return Object.freeze(targets.slice(0, fanout));
}

function assertPublicationIdentity(
  sender: TopicEndpoint,
  envelope: SignedMeshEnvelope<MeshObjectivePayload>,
  configuration: MeshCoordinationObjectiveTopicConfiguration
): void {
  const identity = sender.getState().discovery.identity;
  if (
    envelope.tenantId !== configuration.tenantId ||
    envelope.meshId !== configuration.meshId ||
    envelope.tenantId !== sender.address.tenantId ||
    envelope.meshId !== sender.address.meshId ||
    envelope.sender.peerId !== sender.address.peerId ||
    envelope.sender.instanceId !== sender.address.instanceId ||
    envelope.proof.keyId !== identity.keyId
  ) {
    throw new TypeError(
      'Mesh coordination Objective topic sender identity mismatch'
    );
  }
  if (envelope.audience.kind !== 'mesh') {
    throw new TypeError(
      'Mesh coordination Objective topic audience is required'
    );
  }
}

function assertObjectiveTopic(
  envelope: SignedMeshEnvelope<MeshObjectivePayload>
): void {
  if (
    envelope.audience.kind !== 'mesh' ||
    envelope.audience.topic !== 'objective' ||
    (envelope.payload.type !== 'objective.announce' &&
      envelope.payload.type !== 'objective.revise' &&
      envelope.payload.type !== 'objective.cancel')
  ) {
    throw new TypeError(
      'Mesh coordination Objective message family/topic mismatch'
    );
  }
}

function assertProcessorDecision(
  decision: MeshObjectiveInboundDecision,
  priorState: MeshObjectiveInboundRuntimeState,
  request: MeshObjectiveInboundRequest,
  envelope: SignedMeshEnvelope<MeshObjectivePayload>,
  canonicalEnvelope: Uint8Array
): void {
  if (
    !isPlainDataRecord(decision) ||
    !Object.isFrozen(decision) ||
    typeof decision.accepted !== 'boolean' ||
    !isTrustedMeshObjectiveInboundDecision(decision, priorState, request)
  ) {
    throw new TypeError(
      'Invalid Mesh coordination Objective topic processor result'
    );
  }
  const expectedKeys = decision.accepted
    ? ['accepted', 'duplicate', 'envelope', 'state']
    : ['accepted', 'code', 'state'];
  if (!hasExactDataKeys(decision, expectedKeys, expectedKeys)) {
    throw new TypeError(
      'Invalid Mesh coordination Objective topic processor result'
    );
  }
  assertRuntimeState(decision.state);
  const expectedIdentity: MeshPeerIdentity = priorState.discovery.identity;
  const identity = decision.state.discovery.identity;
  if (
    identity.tenantId !== expectedIdentity.tenantId ||
    identity.meshId !== expectedIdentity.meshId ||
    identity.peerId !== expectedIdentity.peerId ||
    identity.instanceId !== expectedIdentity.instanceId ||
    identity.keyId !== expectedIdentity.keyId
  ) {
    throw new TypeError(
      'Mesh coordination Objective topic processor changed identity'
    );
  }
  if (decision.accepted) {
    const acceptedEnvelope = validateSignedMeshEnvelope(decision.envelope);
    const acceptedCanonical = acceptedEnvelope.ok
      ? canonicalizeMeshJsonBytes(acceptedEnvelope.value)
      : undefined;
    if (
      typeof decision.duplicate !== 'boolean' ||
      !Object.isFrozen(decision.envelope) ||
      decision.envelope.messageId !== envelope.messageId ||
      !acceptedCanonical ||
      !acceptedCanonical.ok ||
      !sameBytes(acceptedCanonical.value, canonicalEnvelope)
    ) {
      throw new TypeError(
        'Invalid Mesh coordination Objective topic acceptance'
      );
    }
  } else if (typeof decision.code !== 'string' || decision.code.length < 1) {
    throw new TypeError('Invalid Mesh coordination Objective topic rejection');
  }
}

function assertRuntimeState(state: MeshObjectiveInboundRuntimeState): void {
  if (
    !isPlainDataRecord(state) ||
    !Object.isFrozen(state) ||
    !hasExactDataKeys(
      state,
      ['coordination', 'discovery', 'inbound', 'objectives'],
      ['coordination', 'discovery', 'inbound', 'objectives']
    )
  ) {
    throw new TypeError(
      'Mesh coordination Objective topic state must be an immutable snapshot'
    );
  }
  createMeshObjectiveInboundRuntimeState(
    state.coordination,
    state.discovery,
    state.objectives,
    state.inbound
  );
}

function assertOptions(
  options: MeshCoordinationObjectiveTopicDriverOptions
): void {
  if (
    !isPlainDataRecord(options) ||
    !hasExactDataKeys(
      options,
      [
        'clock',
        'maximumDeliveriesPerPublish',
        'maximumEndpoints',
        'maximumInternalStepsPerDrain',
        'maximumQueueDepth',
        'maximumQueuedBytes',
        'meshId',
        'onDiagnostic',
        'tenantId',
      ],
      ['clock', 'meshId', 'tenantId']
    )
  ) {
    throw new TypeError(
      'Invalid Mesh coordination Objective topic driver options'
    );
  }
  assertIdentifier(options.tenantId, 'tenantId');
  assertIdentifier(options.meshId, 'meshId');
  if (
    !options.clock ||
    typeof options.clock !== 'object' ||
    typeof options.clock.now !== 'function' ||
    (options.onDiagnostic !== undefined &&
      typeof options.onDiagnostic !== 'function')
  ) {
    throw new TypeError(
      'Invalid Mesh coordination Objective topic trusted dependency'
    );
  }
}

function assertRegistration(
  registration: MeshCoordinationObjectiveTopicRegistration
): void {
  if (
    !isPlainDataRecord(registration) ||
    !hasExactDataKeys(
      registration,
      ['processor', 'state'],
      ['processor', 'state']
    ) ||
    !registration.processor ||
    typeof registration.processor !== 'object' ||
    typeof registration.processor.process !== 'function'
  ) {
    throw new TypeError(
      'Invalid Mesh coordination Objective topic registration'
    );
  }
}

function assertPublishInput(
  input: MeshCoordinationObjectiveTopicPublishInput
): void {
  if (
    !isPlainDataRecord(input) ||
    !hasExactDataKeys(input, ['envelope', 'fanout'], ['envelope'])
  ) {
    throw new TypeError(
      'Invalid Mesh coordination Objective topic publish input'
    );
  }
}

function resolveLimits(
  options: MeshCoordinationObjectiveTopicDriverOptions
): Readonly<MeshCoordinationObjectiveTopicLimits> {
  const limits: MeshCoordinationObjectiveTopicLimits = {
    maximumEndpoints:
      options.maximumEndpoints ??
      DEFAULT_MESH_COORDINATION_OBJECTIVE_TOPIC_LIMITS.maximumEndpoints,
    maximumQueueDepth:
      options.maximumQueueDepth ??
      DEFAULT_MESH_COORDINATION_OBJECTIVE_TOPIC_LIMITS.maximumQueueDepth,
    maximumQueuedBytes:
      options.maximumQueuedBytes ??
      DEFAULT_MESH_COORDINATION_OBJECTIVE_TOPIC_LIMITS.maximumQueuedBytes,
    maximumDeliveriesPerPublish:
      options.maximumDeliveriesPerPublish ??
      DEFAULT_MESH_COORDINATION_OBJECTIVE_TOPIC_LIMITS.maximumDeliveriesPerPublish,
    maximumInternalStepsPerDrain:
      options.maximumInternalStepsPerDrain ??
      DEFAULT_MESH_COORDINATION_OBJECTIVE_TOPIC_LIMITS.maximumInternalStepsPerDrain,
  };
  for (const [name, value] of Object.entries(limits)) {
    const ceiling =
      DEFAULT_MESH_COORDINATION_OBJECTIVE_TOPIC_LIMITS[
        name as keyof MeshCoordinationObjectiveTopicLimits
      ];
    if (!Number.isSafeInteger(value) || value < 1 || value > ceiling) {
      throw new RangeError(
        `Mesh coordination Objective topic ${name} must be a positive safe integer no greater than its default`
      );
    }
  }
  return Object.freeze(limits);
}

function freezeAddress(value: {
  readonly tenantId: string;
  readonly meshId: string;
  readonly peerId: string;
  readonly instanceId: string;
}): MeshCoordinationObjectiveTopicAddress {
  assertIdentifier(value.tenantId, 'tenantId');
  assertIdentifier(value.meshId, 'meshId');
  assertIdentifier(value.peerId, 'peerId');
  assertIdentifier(value.instanceId, 'instanceId');
  return Object.freeze({
    tenantId: value.tenantId,
    meshId: value.meshId,
    peerId: value.peerId,
    instanceId: value.instanceId,
  });
}

function freezeTime(
  value: MeshCoordinationObjectiveTopicTime
): MeshCoordinationObjectiveTopicTime {
  if (
    !isPlainDataRecord(value) ||
    !hasExactDataKeys(
      value,
      ['receivedAt', 'verifiedAt'],
      ['receivedAt', 'verifiedAt']
    )
  ) {
    throw new TypeError(
      'Invalid Mesh coordination Objective topic time sample'
    );
  }
  assertMeshLogicalTime(value.receivedAt);
  if (!compareMeshTimestamps(value.verifiedAt, value.verifiedAt).ok) {
    throw new TypeError(
      'Invalid Mesh coordination Objective topic verification time'
    );
  }
  return Object.freeze({
    verifiedAt: value.verifiedAt,
    receivedAt: value.receivedAt,
  });
}

function freezeReceipt(
  status: MeshCoordinationObjectiveTopicReceipt['status'],
  messageId: string,
  target: MeshCoordinationObjectiveTopicAddress
): MeshCoordinationObjectiveTopicReceipt {
  return Object.freeze({ status, messageId, target });
}

function timestampIsBefore(left: string, right: string): boolean {
  const compared = compareMeshTimestamps(left, right);
  return compared.ok && compared.value < 0;
}

function checkedProduct(left: number, right: number): number | undefined {
  if (
    !Number.isSafeInteger(left) ||
    left < 0 ||
    !Number.isSafeInteger(right) ||
    right < 0 ||
    (right !== 0 && left > Math.floor(Number.MAX_SAFE_INTEGER / right))
  ) {
    return undefined;
  }
  return left * right;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function exceedsSum(left: number, right: number, maximum: number): boolean {
  return (
    !Number.isSafeInteger(left) ||
    left < 0 ||
    !Number.isSafeInteger(right) ||
    right < 0 ||
    left > maximum ||
    right > maximum - left
  );
}

function compareAddresses(
  left: MeshCoordinationObjectiveTopicAddress,
  right: MeshCoordinationObjectiveTopicAddress
): number {
  if (left.peerId !== right.peerId) return left.peerId < right.peerId ? -1 : 1;
  if (left.instanceId !== right.instanceId) {
    return left.instanceId < right.instanceId ? -1 : 1;
  }
  return 0;
}

function addressKey(address: MeshCoordinationObjectiveTopicAddress): string {
  return JSON.stringify([
    address.tenantId,
    address.meshId,
    address.peerId,
    address.instanceId,
  ]);
}

function assertIdentifier(value: string, name: string): void {
  if (
    typeof value !== 'string' ||
    !identifierPattern.test(value) ||
    utf8Encoder.encode(value).byteLength >
      DEFAULT_MESH_PROTOCOL_LIMITS.maximumIdBytes
  ) {
    throw new TypeError(`Invalid Mesh coordination Objective topic ${name}`);
  }
}

function isPlainDataRecord(value: unknown): value is Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (
    (prototype === null || prototype === Object.prototype) &&
    Object.getOwnPropertySymbols(value).length === 0 &&
    Object.getOwnPropertyNames(value).every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return (
        descriptor !== undefined &&
        'value' in descriptor &&
        descriptor.enumerable === true
      );
    })
  );
}

function hasExactDataKeys(
  value: object,
  supportedKeys: readonly string[],
  requiredKeys: readonly string[]
): boolean {
  const supported = new Set(supportedKeys);
  return (
    Object.getOwnPropertyNames(value).every((key) => supported.has(key)) &&
    requiredKeys.every((key) => Object.hasOwn(value, key))
  );
}
