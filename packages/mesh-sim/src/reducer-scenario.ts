import { canonicalizeMeshJsonBytes } from '@agentplat/mesh-protocol';

import {
  MESH_SIMULATION_FAULT_LIMITS,
  type MeshSimulationFault,
  type MeshSimulationFaultPlan,
  type MeshSimulationLink,
  type MeshSimulationPrngVersion,
} from './index.js';

const MAX_SCENARIO_PEERS = 1_024;

export interface MeshReducerScenarioLimits {
  readonly maximumEvents: number;
  readonly maximumLogicalTime: number;
  readonly maximumQueuedEvents: number;
  readonly maximumStateBytes: number;
}

export interface MeshReducerScenarioPeer<State> {
  readonly peerId: string;
  readonly state: State;
}

/**
 * One serialized reducer input. `sourcePeerId` makes transport partitions
 * observable without teaching a production reducer about simulated links.
 */
export interface MeshReducerScenarioEvent<Action> {
  readonly eventId: string;
  readonly targetPeerId: string;
  readonly sourcePeerId?: string;
  /** Time at which a transport delivery entered the volatile driver queue. */
  readonly scheduledAt?: number;
  readonly logicalTime: number;
  readonly priority: number;
  readonly action: Action;
}

export interface MeshReducerScenarioConfig<State, Action> {
  readonly schemaVersion: 1;
  readonly scenarioId: string;
  readonly seed: number;
  readonly prngVersion: MeshSimulationPrngVersion;
  readonly peers: readonly MeshReducerScenarioPeer<State>[];
  readonly links: readonly MeshSimulationLink[];
  readonly events: readonly MeshReducerScenarioEvent<Action>[];
  readonly faultPlan: MeshSimulationFaultPlan;
  readonly limits: MeshReducerScenarioLimits;
}

export interface MeshReducerScenarioDecision<State, Effect = unknown> {
  readonly state: State;
  readonly accepted: boolean;
  readonly rejectionCode?: string;
  readonly effects?: readonly Effect[];
}

export interface MeshReducerScenarioRuntime<
  State,
  Action,
  Effect = unknown,
  Projection = State,
> {
  /** Versioned identifier for the reducer dispatch table; callbacks are not hashed. */
  readonly driverId: string;
  /** Versioned identifier for the semantic projection; callbacks are not hashed. */
  readonly projectionId: string;
  reduce(input: {
    readonly peerId: string;
    readonly state: State;
    readonly action: Action;
    readonly logicalTime: number;
    readonly clockOffset: number;
    random(scope: string): number;
  }): MeshReducerScenarioDecision<State, Effect>;
  project(state: State): Projection;
  readonly invariants?: readonly {
    readonly name: string;
    evaluate(input: {
      readonly eventId: string;
      readonly peerStates: Readonly<Record<string, State>>;
      readonly projections: Readonly<Record<string, Projection>>;
      readonly queuedEvents: number;
    }): void;
  }[];
}

export interface MeshReducerScenarioOrder {
  readonly logicalTime: number;
  readonly priority: number;
  readonly insertionSequence: number;
}

export interface MeshReducerScenarioRecord {
  readonly eventId: string;
  readonly peerId: string;
  readonly order: MeshReducerScenarioOrder;
  readonly kind: 'reducer' | 'fault' | 'suppressed';
  readonly accepted: boolean;
  readonly rejectionCode?: string;
  readonly faultId?: string;
  readonly faultKind?: MeshSimulationFault['kind'];
  readonly actionDigest: string;
  readonly effectsDigest: string;
  readonly stateDigest: string;
  readonly projectionDigest: string;
  readonly chainDigest: string;
}

export interface MeshReducerScenarioFaultRecord {
  readonly faultId: string;
  readonly kind: MeshSimulationFault['kind'];
  readonly applied: boolean;
  readonly affectedEventIds: readonly string[];
  readonly affectedLinkIds: readonly string[];
}

export interface MeshReducerScenarioMetrics {
  readonly processedEvents: number;
  readonly reducerCalls: number;
  readonly acceptedReducerCalls: number;
  readonly rejectedReducerCalls: number;
  readonly faultEvents: number;
  readonly suppressedEvents: number;
  readonly finalLogicalTime: number;
}

export interface MeshReducerScenarioTrace<State, Projection> {
  readonly scenarioId: string;
  readonly seed: number;
  readonly prngVersion: MeshSimulationPrngVersion;
  readonly configurationDigest: string;
  readonly faultPlanDigest: string;
  readonly chainDigest: string;
  readonly metrics: MeshReducerScenarioMetrics;
  readonly records: readonly MeshReducerScenarioRecord[];
  readonly faults: readonly MeshReducerScenarioFaultRecord[];
  readonly peerStates: Readonly<Record<string, State>>;
  readonly projections: Readonly<Record<string, Projection>>;
}

export interface MeshReducerScenarioReplayResult {
  readonly matches: boolean;
  readonly expectedChainDigest: string;
  readonly actualChainDigest: string;
  readonly firstDivergence?: number;
}

interface QueuedEvent<Action> extends MeshReducerScenarioEvent<Action> {
  readonly insertionSequence: number;
  readonly fault?: MeshSimulationFault;
}

const reducerScenarioCanonicalLimits = Object.freeze({
  maximumEnvelopeBytes: 64 * 1024 * 1024,
  maximumPayloadBytes: 64 * 1024 * 1024,
  maximumNestingDepth: 128,
  maximumTotalObjectKeys: 2_000_000,
  maximumObjectKeys: 1_000_000,
  maximumTotalArrayItems: 2_000_000,
  maximumArrayItems: 1_000_000,
  maximumStringBytes: 1_048_576,
});

/**
 * Runs a closed serialized schedule against a caller supplied production reducer
 * dispatch table. Faults mutate only driver availability, links, clocks, or the
 * event queue.
 */
export async function runMeshReducerScenario<
  State,
  Action,
  Effect = unknown,
  Projection = State,
>(
  inputConfig: MeshReducerScenarioConfig<State, Action>,
  inputRuntime: MeshReducerScenarioRuntime<State, Action, Effect, Projection>
): Promise<MeshReducerScenarioTrace<State, Projection>> {
  assertPlainRecord(inputRuntime, 'runtime');
  assertExactKeys(
    inputRuntime,
    ['driverId', 'project', 'projectionId', 'reduce'],
    ['invariants']
  );
  if (
    typeof inputRuntime.reduce !== 'function' ||
    typeof inputRuntime.project !== 'function'
  )
    throw new TypeError('Invalid Mesh reducer scenario runtime');
  const rawInvariants = inputRuntime.invariants ?? [];
  assertDenseArray(rawInvariants, 'runtime invariants');
  if (rawInvariants.length > 256)
    throw new RangeError('Mesh reducer scenario invariant limit exceeded');
  const invariants = Object.freeze(
    rawInvariants.map((invariant) => {
      assertPlainRecord(invariant, 'runtime invariant');
      assertExactKeys(invariant, ['evaluate', 'name']);
      assertString(invariant.name, 'invariant name');
      if (typeof invariant.evaluate !== 'function')
        throw new TypeError('Invalid Mesh reducer scenario invariant');
      return Object.freeze({
        name: invariant.name,
        evaluate: invariant.evaluate,
      });
    })
  );
  const runtime = Object.freeze({
    driverId: inputRuntime.driverId,
    projectionId: inputRuntime.projectionId,
    reduce: inputRuntime.reduce,
    project: inputRuntime.project,
    invariants,
  });
  const config = deepFreezeData(inputConfig);
  validateScenario(config, runtime);
  const runtimeDescriptor = Object.freeze({
    driverId: runtime.driverId,
    projectionId: runtime.projectionId,
    invariantNames: Object.freeze(runtime.invariants.map(({ name }) => name)),
  });
  const configurationDigest = await digest({
    config,
    ...runtimeDescriptor,
  });
  const faultPlanDigest = await digest(config.faultPlan);
  const states = new Map(
    config.peers.map(({ peerId, state }) => [peerId, deepFreezeData(state)])
  );
  const stateRecordDigest = new IncrementalPeerRecordDigest();
  const projectionRecordDigest = new IncrementalPeerRecordDigest();
  const projectionCache = new WeakMap<object, Projection>();
  const availability = new Map(
    config.peers.map(({ peerId }) => [peerId, true])
  );
  const clockOffsets = new Map(config.peers.map(({ peerId }) => [peerId, 0]));
  const links = new Map(
    config.links.map((link) => [linkKey(link.fromPeerId, link.toPeerId), link])
  );
  const prngStates = new Map<string, number>();
  let insertionSequence = 0;
  const queue: QueuedEvent<Action>[] = [];
  for (const event of config.events)
    queue.push(
      Object.freeze({
        ...event,
        action: deepFreezeData(event.action),
        insertionSequence: ++insertionSequence,
      })
    );
  for (const fault of config.faultPlan.faults) {
    const frozenFault = deepFreezeData(fault);
    const targetPeerId = faultTargetPeerId(frozenFault, config.peers);
    const faultEventId = `fault:${frozenFault.faultId}`;
    assertString(faultEventId, 'fault eventId');
    queue.push(
      Object.freeze({
        eventId: faultEventId,
        targetPeerId,
        logicalTime: frozenFault.logicalTime,
        priority: frozenFault.priority,
        action: Object.freeze({}) as Action,
        insertionSequence: ++insertionSequence,
        fault: frozenFault,
      })
    );
  }
  queue.sort(compareQueued);

  const records: MeshReducerScenarioRecord[] = [];
  const faultRecords: MeshReducerScenarioFaultRecord[] = [];
  let chainDigest = configurationDigest;
  let logicalTime = 0;
  let queueNeedsSort = false;
  let reducerCalls = 0;
  let acceptedReducerCalls = 0;
  let rejectedReducerCalls = 0;
  let suppressedEvents = 0;

  while (queue.length > 0) {
    if (records.length >= config.limits.maximumEvents)
      throw new RangeError('Mesh reducer scenario event limit exceeded');
    const event = queue.shift();
    if (event === undefined)
      throw new TypeError('Mesh reducer scenario queue became inconsistent');
    logicalTime = event.logicalTime;
    const order = Object.freeze({
      logicalTime,
      priority: event.priority,
      insertionSequence: event.insertionSequence,
    });
    let kind: MeshReducerScenarioRecord['kind'] = 'reducer';
    let accepted = false;
    let rejectionCode: string | undefined;
    let effects: readonly Effect[] = Object.freeze([]);
    let faultRecord: MeshReducerScenarioFaultRecord | undefined;

    if (event.fault !== undefined) {
      kind = 'fault';
      const applied = applyFault(
        event.fault,
        queue,
        availability,
        clockOffsets,
        links,
        config,
        () => ++insertionSequence
      );
      // Faults are the only operation that can mutate/reorder the pending
      // queue. Normal reducer events consume its already-sorted head.
      queueNeedsSort = true;
      suppressedEvents += applied.suppressedEvents ?? 0;
      accepted = applied.applied;
      faultRecord = Object.freeze({
        faultId: event.fault.faultId,
        kind: event.fault.kind,
        applied: applied.applied,
        affectedEventIds: Object.freeze(applied.affectedEventIds),
        affectedLinkIds: Object.freeze(applied.affectedLinkIds ?? []),
      });
      faultRecords.push(faultRecord);
    } else {
      const sourcePeerId = event.sourcePeerId;
      const unavailable = availability.get(event.targetPeerId) !== true;
      const partitioned =
        sourcePeerId !== undefined &&
        links.get(linkKey(sourcePeerId, event.targetPeerId))?.enabled !== true;
      if (unavailable || partitioned) {
        kind = 'suppressed';
        accepted = false;
        rejectionCode = unavailable
          ? 'simulation_peer_crashed'
          : 'simulation_partitioned';
        suppressedEvents += 1;
      } else {
        const state = states.get(event.targetPeerId);
        if (state === undefined)
          throw new TypeError('Mesh reducer scenario peer state disappeared');
        let decision: MeshReducerScenarioDecision<State, Effect>;
        try {
          decision = runtime.reduce({
            peerId: event.targetPeerId,
            state,
            action: event.action,
            logicalTime,
            clockOffset: clockOffsets.get(event.targetPeerId) ?? 0,
            random(scope) {
              const scoped = `${event.targetPeerId}:${scope}`;
              let value =
                prngStates.get(scoped) ?? mixSeed(config.seed >>> 0, scoped);
              value = xorshift32(value);
              prngStates.set(scoped, value);
              return value / 0x1_0000_0000;
            },
          });
        } catch (error) {
          throw new Error(
            `Mesh reducer scenario event ${event.eventId} threw: ${
              error instanceof Error ? error.message : String(error)
            }`,
            { cause: error }
          );
        }
        assertDecision(decision);
        const frozenState = deepFreezeData(decision.state);
        assertCanonicalWithin(
          frozenState,
          config.limits.maximumStateBytes,
          'state'
        );
        states.set(event.targetPeerId, frozenState);
        accepted = decision.accepted;
        rejectionCode = decision.rejectionCode;
        effects = deepFreezeData([...(decision.effects ?? [])]);
        reducerCalls += 1;
        if (accepted) acceptedReducerCalls += 1;
        else rejectedReducerCalls += 1;
      }
    }

    const peerStates = frozenRecord([...states]);
    const projections = frozenRecord(
      [...states].map(([peerId, state]) => {
        let projection = projectionCache.get(state as object);
        if (projection === undefined) {
          projection = deepFreezeData(runtime.project(state));
          projectionCache.set(state as object, projection);
        }
        return [peerId, projection];
      })
    );
    for (const invariant of runtime.invariants ?? [])
      invariant.evaluate({
        eventId: event.eventId,
        peerStates,
        projections,
        queuedEvents: queue.length,
      });
    const [actionDigest, effectsDigest, stateDigest, projectionDigest] =
      await Promise.all([
        digest(event.fault ?? event.action),
        digest(effects),
        stateRecordDigest.digest(peerStates),
        projectionRecordDigest.digest(projections),
      ]);
    const base = {
      eventId: event.eventId,
      peerId: event.targetPeerId,
      order,
      kind,
      accepted,
      ...(rejectionCode === undefined ? {} : { rejectionCode }),
      ...(faultRecord === undefined
        ? {}
        : {
            faultId: faultRecord.faultId,
            faultKind: faultRecord.kind,
          }),
      actionDigest,
      effectsDigest,
      stateDigest,
      projectionDigest,
    };
    chainDigest = await digest({ previous: chainDigest, record: base });
    records.push(Object.freeze({ ...base, chainDigest }));
    if (queueNeedsSort) {
      queue.sort(compareQueued);
      queueNeedsSort = false;
    }
  }

  const peerStates = frozenRecord([...states]);
  const projections = frozenRecord(
    [...states].map(([peerId, state]) => {
      let projection = projectionCache.get(state as object);
      if (projection === undefined) {
        projection = deepFreezeData(runtime.project(state));
        projectionCache.set(state as object, projection);
      }
      return [peerId, projection];
    })
  );
  return Object.freeze({
    scenarioId: config.scenarioId,
    seed: config.seed,
    prngVersion: config.prngVersion,
    configurationDigest,
    faultPlanDigest,
    chainDigest,
    metrics: Object.freeze({
      processedEvents: records.length,
      reducerCalls,
      acceptedReducerCalls,
      rejectedReducerCalls,
      faultEvents: faultRecords.length,
      suppressedEvents,
      finalLogicalTime: logicalTime,
    }),
    records: Object.freeze(records),
    faults: Object.freeze(faultRecords),
    peerStates,
    projections,
  });
}

export async function replayMeshReducerScenario<
  State,
  Action,
  Effect = unknown,
  Projection = State,
>(
  config: MeshReducerScenarioConfig<State, Action>,
  runtime: MeshReducerScenarioRuntime<State, Action, Effect, Projection>,
  expected: MeshReducerScenarioTrace<State, Projection>
): Promise<MeshReducerScenarioReplayResult> {
  const actual = await runMeshReducerScenario(config, runtime);
  const count = Math.max(expected.records.length, actual.records.length);
  let firstDivergence: number | undefined;
  for (let index = 0; index < count; index += 1) {
    if (
      expected.records[index]?.chainDigest !==
      actual.records[index]?.chainDigest
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

function validateScenario<State, Action>(
  config: MeshReducerScenarioConfig<State, Action>,
  runtime: MeshReducerScenarioRuntime<State, Action, unknown, unknown>
): void {
  assertPlainRecord(config, 'configuration');
  assertExactKeys(config, [
    'events',
    'faultPlan',
    'limits',
    'links',
    'peers',
    'prngVersion',
    'scenarioId',
    'schemaVersion',
    'seed',
  ]);
  if (
    !config ||
    config.schemaVersion !== 1 ||
    !Number.isSafeInteger(config.seed) ||
    config.prngVersion !== 'xorshift32-v1'
  )
    throw new TypeError('Invalid Mesh reducer scenario configuration');
  assertString(config.scenarioId, 'scenarioId');
  assertString(runtime.driverId, 'driverId');
  assertString(runtime.projectionId, 'projectionId');
  assertDenseArray(config.peers, 'peers');
  assertDenseArray(config.events, 'events');
  assertDenseArray(config.links, 'links');
  assertPlainRecord(config.faultPlan, 'faultPlan');
  assertExactKeys(config.faultPlan, ['faults', 'schemaVersion']);
  assertDenseArray(config.faultPlan.faults, 'faults');
  if (
    config.peers.length === 0 ||
    config.peers.length > MAX_SCENARIO_PEERS ||
    !config.faultPlan ||
    config.faultPlan.schemaVersion !== 1 ||
    config.faultPlan.faults.length > MESH_SIMULATION_FAULT_LIMITS.maximumFaults
  )
    throw new TypeError('Invalid Mesh reducer scenario collections');
  const peerIds = new Set<string>();
  for (const peer of config.peers) {
    assertPlainRecord(peer, 'peer');
    assertExactKeys(peer, ['peerId', 'state']);
    assertString(peer.peerId, 'peerId');
    if (peerIds.has(peer.peerId))
      throw new TypeError('Duplicate Mesh reducer scenario peer');
    peerIds.add(peer.peerId);
    assertCanonicalWithin(
      deepFreezeData(peer.state),
      config.limits.maximumStateBytes,
      'initial state'
    );
  }
  assertPlainRecord(config.limits, 'limits');
  assertExactKeys(config.limits, [
    'maximumEvents',
    'maximumLogicalTime',
    'maximumQueuedEvents',
    'maximumStateBytes',
  ]);
  if (
    !Number.isSafeInteger(config.limits.maximumEvents) ||
    config.limits.maximumEvents < 1 ||
    !Number.isSafeInteger(config.limits.maximumLogicalTime) ||
    config.limits.maximumLogicalTime < 0 ||
    !Number.isSafeInteger(config.limits.maximumQueuedEvents) ||
    config.limits.maximumQueuedEvents < 1 ||
    !Number.isSafeInteger(config.limits.maximumStateBytes) ||
    config.limits.maximumStateBytes < 1 ||
    config.limits.maximumStateBytes > 16 * 1024 * 1024 ||
    config.events.length + config.faultPlan.faults.length >
      config.limits.maximumQueuedEvents
  )
    throw new RangeError('Invalid Mesh reducer scenario limits');
  const ids = new Set<string>();
  const eventsById = new Map<string, MeshReducerScenarioEvent<Action>>();
  for (const event of config.events) {
    assertPlainRecord(event, 'event');
    assertExactKeys(
      event,
      ['action', 'eventId', 'logicalTime', 'priority', 'targetPeerId'],
      ['scheduledAt', 'sourcePeerId']
    );
    assertString(event.eventId, 'eventId');
    if (
      ids.has(event.eventId) ||
      event.eventId.startsWith('fault:') ||
      !peerIds.has(event.targetPeerId) ||
      (event.sourcePeerId !== undefined && !peerIds.has(event.sourcePeerId)) ||
      (event.scheduledAt !== undefined &&
        (event.sourcePeerId === undefined ||
          !Number.isSafeInteger(event.scheduledAt) ||
          event.scheduledAt < 0 ||
          event.scheduledAt > event.logicalTime)) ||
      !Number.isSafeInteger(event.logicalTime) ||
      event.logicalTime < 0 ||
      event.logicalTime > config.limits.maximumLogicalTime ||
      !Number.isSafeInteger(event.priority)
    )
      throw new TypeError('Invalid Mesh reducer scenario event');
    ids.add(event.eventId);
    eventsById.set(event.eventId, event);
    assertCanonicalWithin(event.action, 1_048_576, 'action');
  }
  for (const link of config.links) {
    assertPlainRecord(link, 'link');
    assertExactKeys(link, ['enabled', 'fromPeerId', 'latency', 'toPeerId']);
    if (
      !peerIds.has(link.fromPeerId) ||
      !peerIds.has(link.toPeerId) ||
      link.fromPeerId === link.toPeerId ||
      !Number.isSafeInteger(link.latency) ||
      link.latency < 0 ||
      typeof link.enabled !== 'boolean'
    )
      throw new TypeError('Invalid Mesh reducer scenario link');
  }
  const configuredLinks = new Set<string>();
  for (const link of config.links) {
    const key = linkKey(link.fromPeerId, link.toPeerId);
    if (configuredLinks.has(key))
      throw new TypeError('Duplicate Mesh reducer scenario link');
    configuredLinks.add(key);
  }
  const faultIds = new Set<string>();
  for (const fault of config.faultPlan.faults) {
    validateFaultShape(fault);
    assertString(fault.faultId, 'faultId');
    if (
      faultIds.has(fault.faultId) ||
      !Number.isSafeInteger(fault.logicalTime) ||
      fault.logicalTime < 0 ||
      fault.logicalTime > config.limits.maximumLogicalTime ||
      !Number.isSafeInteger(fault.priority)
    )
      throw new TypeError('Invalid Mesh reducer scenario fault');
    faultIds.add(fault.faultId);
    validateFaultTargets(
      fault,
      peerIds,
      eventsById,
      configuredLinks,
      config.limits.maximumLogicalTime
    );
  }
  const invariantNames = new Set<string>();
  for (const invariant of runtime.invariants ?? []) {
    assertString(invariant.name, 'invariant name');
    if (invariantNames.has(invariant.name))
      throw new TypeError('Duplicate Mesh reducer scenario invariant');
    invariantNames.add(invariant.name);
  }
  assertCanonicalWithin(
    deepFreezeData(config),
    Number.MAX_SAFE_INTEGER,
    'configuration'
  );
}

function validateFaultTargets<Action>(
  fault: MeshSimulationFault,
  peerIds: ReadonlySet<string>,
  eventsById: ReadonlyMap<string, MeshReducerScenarioEvent<Action>>,
  configuredLinks: ReadonlySet<string>,
  maximumLogicalTime: number
): void {
  if ('peerId' in fault && !peerIds.has(fault.peerId))
    throw new TypeError('Mesh reducer scenario fault peer is unknown');
  if ('deliveryEventId' in fault) {
    const target = eventsById.get(fault.deliveryEventId);
    if (target === undefined)
      throw new TypeError('Mesh reducer scenario fault event is unknown');
    if (target.sourcePeerId === undefined)
      throw new TypeError(
        'Mesh reducer scenario message fault target is not a delivery'
      );
  }
  if (
    'copies' in fault &&
    (!Number.isSafeInteger(fault.copies) ||
      fault.copies < 1 ||
      fault.copies > 16)
  )
    throw new RangeError('Mesh reducer scenario duplicate limit exceeded');
  if (
    fault.kind === 'clock.offset' &&
    (!Number.isSafeInteger(fault.offset) ||
      Math.abs(fault.offset) > MESH_SIMULATION_FAULT_LIMITS.maximumClockOffset)
  )
    throw new RangeError('Mesh reducer scenario clock offset limit exceeded');
  if (
    'delay' in fault &&
    (!Number.isSafeInteger(fault.delay) ||
      fault.delay < 1 ||
      !Number.isSafeInteger(
        eventsById.get(fault.deliveryEventId)!.logicalTime + fault.delay
      ) ||
      eventsById.get(fault.deliveryEventId)!.logicalTime + fault.delay >
        maximumLogicalTime)
  )
    throw new RangeError('Invalid Mesh reducer scenario delay');
  if ('links' in fault) {
    if (fault.links.length === 0)
      throw new TypeError('Mesh reducer scenario partition is empty');
    if (fault.links.length > MESH_SIMULATION_FAULT_LIMITS.maximumLinksPerFault)
      throw new RangeError(
        'Mesh reducer scenario partition link limit exceeded'
      );
    const links = new Set<string>();
    for (const link of fault.links)
      if (
        !peerIds.has(link.fromPeerId) ||
        !peerIds.has(link.toPeerId) ||
        link.fromPeerId === link.toPeerId
      )
        throw new TypeError('Mesh reducer scenario fault link is unknown');
      else {
        const key = linkKey(link.fromPeerId, link.toPeerId);
        if (links.has(key))
          throw new TypeError('Duplicate Mesh reducer scenario fault link');
        if (!configuredLinks.has(key))
          throw new TypeError(
            'Mesh reducer scenario fault link is not configured'
          );
        links.add(key);
      }
  }
  if (
    fault.kind === 'message.reorder' &&
    (!Number.isSafeInteger(fault.newLogicalTime) ||
      !Number.isSafeInteger(fault.newPriority) ||
      fault.newLogicalTime < fault.logicalTime ||
      fault.newLogicalTime > maximumLogicalTime)
  )
    throw new RangeError('Invalid Mesh reducer scenario reorder');
}

function validateFaultShape(fault: MeshSimulationFault): void {
  assertPlainRecord(fault, 'fault');
  const base = ['faultId', 'kind', 'logicalTime', 'priority'];
  if (
    fault.kind === 'peer.crash' ||
    fault.kind === 'peer.resume' ||
    fault.kind === 'clock.offset'
  ) {
    assertExactKeys(fault, [
      ...base,
      'peerId',
      ...(fault.kind === 'clock.offset' ? ['offset'] : []),
    ]);
    return;
  }
  if (fault.kind === 'message.drop') {
    assertExactKeys(fault, [...base, 'deliveryEventId']);
    return;
  }
  if (fault.kind === 'message.duplicate') {
    assertExactKeys(fault, [...base, 'copies', 'deliveryEventId']);
    return;
  }
  if (fault.kind === 'message.delay') {
    assertExactKeys(fault, [...base, 'delay', 'deliveryEventId']);
    return;
  }
  if (fault.kind === 'message.reorder') {
    assertExactKeys(fault, [
      ...base,
      'deliveryEventId',
      'newLogicalTime',
      'newPriority',
    ]);
    return;
  }
  if (fault.kind === 'network.partition' || fault.kind === 'network.heal') {
    assertExactKeys(fault, [...base, 'links']);
    assertDenseArray(fault.links, 'fault links');
    for (const link of fault.links) {
      assertPlainRecord(link, 'fault link');
      assertExactKeys(link, ['fromPeerId', 'toPeerId']);
    }
    return;
  }
  throw new TypeError('Unsupported Mesh reducer scenario fault kind');
}

function applyFault<State, Action>(
  fault: MeshSimulationFault,
  queue: QueuedEvent<Action>[],
  availability: Map<string, boolean>,
  clockOffsets: Map<string, number>,
  links: Map<string, MeshSimulationLink>,
  config: MeshReducerScenarioConfig<State, Action>,
  nextInsertionSequence: () => number
): {
  readonly applied: boolean;
  readonly affectedEventIds: string[];
  readonly affectedLinkIds?: string[];
  readonly suppressedEvents?: number;
} {
  if (fault.kind === 'peer.crash') {
    const changed = availability.get(fault.peerId) !== false;
    availability.set(fault.peerId, false);
    if (!changed) return { applied: false, affectedEventIds: [] };
    const affectedEventIds: string[] = [];
    for (let index = queue.length - 1; index >= 0; index -= 1) {
      const event = queue[index]!;
      if (
        event.fault === undefined &&
        event.sourcePeerId !== undefined &&
        (event.scheduledAt ?? 0) <= fault.logicalTime &&
        event.targetPeerId === fault.peerId
      ) {
        affectedEventIds.push(event.eventId);
        queue.splice(index, 1);
      }
    }
    affectedEventIds.reverse();
    return { applied: true, affectedEventIds };
  }
  if (fault.kind === 'peer.resume') {
    const changed = availability.get(fault.peerId) !== true;
    availability.set(fault.peerId, true);
    return { applied: changed, affectedEventIds: [] };
  }
  if (fault.kind === 'clock.offset') {
    const changed = clockOffsets.get(fault.peerId) !== fault.offset;
    clockOffsets.set(fault.peerId, fault.offset);
    return { applied: changed, affectedEventIds: [] };
  }
  if (fault.kind === 'network.partition' || fault.kind === 'network.heal') {
    const enabled = fault.kind === 'network.heal';
    const affectedEventIds: string[] = [];
    const affectedLinkIds: string[] = [];
    const requestedLinks = new Set(
      fault.links.map((target) => linkKey(target.fromPeerId, target.toPeerId))
    );
    for (const target of fault.links) {
      const key = linkKey(target.fromPeerId, target.toPeerId);
      const link = links.get(key);
      if (link !== undefined && link.enabled !== enabled) {
        links.set(key, Object.freeze({ ...link, enabled }));
        affectedLinkIds.push(key);
      }
    }
    let suppressedEvents = 0;
    if (!enabled) {
      const droppedEventIds: string[] = [];
      for (let index = queue.length - 1; index >= 0; index -= 1) {
        const event = queue[index]!;
        if (
          event.fault === undefined &&
          event.sourcePeerId !== undefined &&
          (event.scheduledAt ?? 0) <= fault.logicalTime &&
          requestedLinks.has(linkKey(event.sourcePeerId, event.targetPeerId))
        ) {
          droppedEventIds.push(event.eventId);
          queue.splice(index, 1);
          suppressedEvents += 1;
        }
      }
      affectedEventIds.push(...droppedEventIds.reverse());
    }
    return {
      applied: affectedEventIds.length > 0 || affectedLinkIds.length > 0,
      affectedEventIds,
      affectedLinkIds,
      suppressedEvents,
    };
  }
  if (
    fault.kind !== 'message.drop' &&
    fault.kind !== 'message.duplicate' &&
    fault.kind !== 'message.delay' &&
    fault.kind !== 'message.reorder'
  )
    throw new TypeError('Unsupported Mesh reducer scenario fault');
  const index = queue.findIndex(
    ({ eventId, fault: queuedFault, sourcePeerId, scheduledAt }) =>
      queuedFault === undefined &&
      sourcePeerId !== undefined &&
      (scheduledAt ?? 0) <= fault.logicalTime &&
      eventId === fault.deliveryEventId
  );
  if (index < 0) return { applied: false, affectedEventIds: [] };
  const target = queue[index]!;
  if (fault.kind === 'message.drop') {
    queue.splice(index, 1);
    return { applied: true, affectedEventIds: [target.eventId] };
  }
  if (fault.kind === 'message.duplicate') {
    const affectedEventIds: string[] = [];
    for (let copy = 1; copy <= fault.copies; copy += 1) {
      if (queue.length >= config.limits.maximumQueuedEvents)
        throw new RangeError('Mesh reducer scenario queue limit exceeded');
      const eventId = `${target.eventId}:duplicate:${fault.faultId}:${copy}`;
      assertString(eventId, 'duplicate eventId');
      if (queue.some((event) => event.eventId === eventId))
        throw new TypeError('Duplicate Mesh reducer scenario event');
      queue.push(
        Object.freeze({
          ...target,
          eventId,
          insertionSequence: nextInsertionSequence(),
        })
      );
      affectedEventIds.push(eventId);
    }
    return { applied: true, affectedEventIds };
  }
  if (fault.kind === 'message.delay') {
    const logicalTime = target.logicalTime + fault.delay;
    if (logicalTime > config.limits.maximumLogicalTime)
      throw new RangeError('Mesh reducer scenario delay exceeds time limit');
    queue[index] = Object.freeze({ ...target, logicalTime });
    return { applied: true, affectedEventIds: [target.eventId] };
  }
  if (fault.kind !== 'message.reorder')
    throw new TypeError('Unsupported Mesh reducer scenario queue fault');
  if (
    fault.newLogicalTime < fault.logicalTime ||
    fault.newLogicalTime > config.limits.maximumLogicalTime
  )
    throw new RangeError('Mesh reducer scenario reorder exceeds time limit');
  queue[index] = Object.freeze({
    ...target,
    logicalTime: fault.newLogicalTime,
    priority: fault.newPriority,
  });
  return { applied: true, affectedEventIds: [target.eventId] };
}

function assertDecision<State, Effect>(
  decision: MeshReducerScenarioDecision<State, Effect>
): void {
  if (
    !decision ||
    typeof decision !== 'object' ||
    typeof decision.accepted !== 'boolean' ||
    (decision.rejectionCode !== undefined &&
      typeof decision.rejectionCode !== 'string') ||
    (decision.effects !== undefined && !Array.isArray(decision.effects))
  )
    throw new TypeError('Invalid Mesh reducer scenario decision');
}

function compareQueued<Action>(
  left: QueuedEvent<Action>,
  right: QueuedEvent<Action>
): number {
  return (
    left.logicalTime - right.logicalTime ||
    left.priority - right.priority ||
    left.insertionSequence - right.insertionSequence
  );
}

function faultTargetPeerId<State>(
  fault: MeshSimulationFault,
  peers: readonly MeshReducerScenarioPeer<State>[]
): string {
  const peerId =
    'peerId' in fault
      ? fault.peerId
      : 'links' in fault
        ? fault.links[0]?.fromPeerId
        : peers[0]?.peerId;
  if (peerId === undefined)
    throw new TypeError('Mesh reducer scenario fault lacks a target');
  return peerId;
}

function linkKey(fromPeerId: string, toPeerId: string): string {
  return JSON.stringify([fromPeerId, toPeerId]);
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
  for (let index = 0; index < scope.length; index += 1)
    value = Math.imul(value ^ scope.charCodeAt(index), 0x01000193);
  return value >>> 0 || 1;
}

function assertPlainRecord(
  value: unknown,
  name: string
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError(`Mesh reducer scenario ${name} must be a record`);
  const prototype = Object.getPrototypeOf(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    (prototype !== Object.prototype && prototype !== null) ||
    Object.getOwnPropertySymbols(value).length !== 0 ||
    Object.values(descriptors).some(
      (descriptor) =>
        !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')
    )
  )
    throw new TypeError(
      `Mesh reducer scenario ${name} must contain plain data`
    );
}

function assertDenseArray(
  value: unknown,
  name: string
): asserts value is unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype)
    throw new TypeError(`Mesh reducer scenario ${name} must be an array`);
  const names = Object.getOwnPropertyNames(value);
  if (names.length !== value.length + 1)
    throw new TypeError(`Mesh reducer scenario ${name} must be dense`);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !Object.hasOwn(descriptor, 'value')
    )
      throw new TypeError(`Mesh reducer scenario ${name} must be dense`);
  }
}

function assertExactKeys(
  value: object,
  required: readonly string[],
  optional: readonly string[] = []
): void {
  const supported = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  if (
    keys.some((key) => !supported.has(key)) ||
    required.some((key) => !Object.hasOwn(value, key))
  )
    throw new TypeError(
      'Mesh reducer scenario value contains unsupported fields'
    );
}

function assertString(value: unknown, name: string): asserts value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    new TextEncoder().encode(value).byteLength > 768
  )
    throw new TypeError(`Invalid Mesh reducer scenario ${name}`);
}

function assertCanonicalWithin(
  value: unknown,
  maximumBytes: number,
  name: string
): void {
  const canonical = canonicalizeMeshJsonBytes(value, {
    limits: reducerScenarioCanonicalLimits,
  });
  if (!canonical.ok)
    throw new TypeError(`Mesh reducer scenario ${name} is not canonical`);
  if (canonical.value.byteLength > maximumBytes)
    throw new RangeError(
      `Mesh reducer scenario ${name} exceeds its byte limit`
    );
}

function deepFreezeData<T>(
  value: T,
  context = {
    active: new WeakSet<object>(),
    copies: new WeakMap<object, unknown>(),
    nodes: 0,
    totalArrayItems: 0,
    totalObjectKeys: 0,
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
    throw new TypeError('Mesh reducer scenario values must contain data only');
  if (
    depth > reducerScenarioCanonicalLimits.maximumNestingDepth ||
    context.nodes >=
      reducerScenarioCanonicalLimits.maximumTotalArrayItems +
        reducerScenarioCanonicalLimits.maximumTotalObjectKeys ||
    context.active.has(value)
  )
    throw new RangeError('Mesh reducer scenario value exceeds data limits');
  const prior = context.copies.get(value);
  if (prior !== undefined) return prior as T;
  context.active.add(value);
  context.nodes += 1;
  if (Array.isArray(value)) {
    if (
      value.length > reducerScenarioCanonicalLimits.maximumArrayItems ||
      context.totalArrayItems + value.length >
        reducerScenarioCanonicalLimits.maximumTotalArrayItems
    )
      throw new RangeError('Mesh reducer scenario array exceeds data limits');
    context.totalArrayItems += value.length;
    assertDenseArray(value, 'value array');
    const result: unknown[] = [];
    context.copies.set(value, result);
    for (const entry of value) {
      if (entry === undefined)
        throw new TypeError(
          'Mesh reducer scenario arrays cannot contain undefined'
        );
      result.push(deepFreezeData(entry, context, depth + 1));
    }
    context.active.delete(value);
    const frozen = Object.freeze(result);
    context.copies.set(value, frozen);
    return frozen as T;
  }
  const propertyNames = Object.getOwnPropertyNames(value);
  if (
    propertyNames.length > reducerScenarioCanonicalLimits.maximumObjectKeys ||
    context.totalObjectKeys + propertyNames.length >
      reducerScenarioCanonicalLimits.maximumTotalObjectKeys
  )
    throw new RangeError('Mesh reducer scenario object exceeds data limits');
  context.totalObjectKeys += propertyNames.length;
  assertPlainRecord(value, 'value');
  const result = Object.create(null) as Record<string, unknown>;
  context.copies.set(value, result);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    const entry = descriptor.value;
    if (entry !== undefined)
      result[key] = deepFreezeData(entry, context, depth + 1);
  }
  context.active.delete(value);
  const frozen = Object.freeze(result);
  context.copies.set(value, frozen);
  return frozen as T;
}

async function digest(value: unknown): Promise<string> {
  // Values reaching this boundary have already been validated and frozen by
  // the scenario runner. Avoid re-walking large 500-peer maps for every event;
  // the constructed records preserve deterministic insertion order.
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const source = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
  const result = new Uint8Array(
    await globalThis.crypto.subtle.digest('SHA-256', source)
  );
  return [...result].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Maintains a deterministic root over a large peer map. A reducer event
 * changes at most one peer state, so unchanged leaves are never rehashed.
 */
class IncrementalPeerRecordDigest {
  #leaves = new Map<string, { value: unknown; digest: string }>();

  async digest(record: Readonly<Record<string, unknown>>): Promise<string> {
    const keys = Object.keys(record);
    const updates = keys.map(async (key) => {
      const value = record[key];
      const prior = this.#leaves.get(key);
      if (prior?.value === value) return;
      const leaf = await digest(JSON.stringify(value));
      this.#leaves.set(key, { value, digest: leaf });
    });
    await Promise.all(updates);
    return digest(
      keys.map((key) => `${JSON.stringify(key)}:${this.#leaves.get(key)?.digest ?? ''}`).join(','),
    );
  }
}

function frozenRecord<T>(
  entries: readonly (readonly [string, T])[]
): Readonly<Record<string, T>> {
  const record = Object.create(null) as Record<string, T>;
  for (const [key, value] of entries) record[key] = value;
  return Object.freeze(record);
}
