import type {
  PlanningDigestV1,
  PlanningJson,
  MissionObservationV1,
} from '@agentplat/collective-planning';
import {
  deepFreezePlanning,
  digestPlanningJsonV1,
  validateMissionObservationV1,
} from '@agentplat/collective-planning';
import type {
  CollectiveEnvironmentInitializationReceiptV1,
  CollectiveEnvironmentInitializationV1,
  CollectiveEnvironmentObservationRequestV1,
  CollectiveEnvironmentObservationResultV1,
  CollectiveEnvironmentPortV1,
  CollectiveEnvironmentAdvanceRequestV1,
  CollectiveEnvironmentAdvanceReceiptV1,
  CollectiveEnvironmentRestoreReceiptV1,
  CollectiveEnvironmentSnapshotHandleV1,
  CollectiveEvaluationBoundaryEvidenceV1,
  CollectiveEvaluationRegistrationBindingV1,
  CollectiveInvariantMonitorEventV1,
  CollectiveInvariantMonitorPolicyV1,
  CollectiveInvariantMonitorSnapshotV1,
  CollectiveInvariantMonitorV1,
  CollectiveProtectedEffectAttemptV1,
  CollectiveProtectedEffectReceiptV1,
  CollectiveTraceEventV2,
  CollectiveTraceV2,
} from '@agentplat/collective-planning/evaluation';
import {
  assertCollectiveEnvironmentPortV1,
  createCollectiveEnvironmentAdvanceReceiptV1,
  createCollectiveEnvironmentInitializationReceiptV1,
  createCollectiveEnvironmentObservationReceiptV1,
  createCollectiveEnvironmentRestoreReceiptV1,
  createCollectiveEnvironmentSnapshotHandleV1,
  createCollectiveEvaluationBoundaryEvidenceV1,
  createCollectiveInvariantMonitorEventV1,
  createCollectiveInvariantMonitorV1,
  createCollectiveProtectedEffectReceiptV1,
  createCollectiveTraceEventV2,
  createCollectiveTraceV2,
  validateCollectiveEnvironmentAdvanceRequestV1,
  validateCollectiveEnvironmentInitializationV1,
  validateCollectiveEnvironmentObservationRequestV1,
  validateCollectiveEnvironmentSnapshotHandleV1,
  validateCollectiveEvaluationRegistrationBindingV1,
  validateCollectiveInvariantMonitorEventV1,
  validateCollectiveInvariantMonitorPolicyV1,
  validateCollectiveInvariantMonitorSnapshotV1,
  validateCollectiveProtectedEffectAttemptV1,
} from '@agentplat/collective-planning/evaluation';

export type CollectiveDeterministicEffectBehaviorV1 =
  'commit' | 'reject' | 'timeout_before_commit' | 'timeout_after_commit';

export interface CollectiveDeterministicEffectRuleV1 {
  readonly schemaVersion: 1;
  readonly effectId: string;
  readonly workItemId: string;
  readonly workItemRevision: number;
  readonly workContractId: string;
  readonly workContractDigest: PlanningDigestV1;
  readonly peerId: string;
  readonly peerInstanceId: string;
  readonly assignmentEpoch: number;
  readonly authorityGeneration: number;
  readonly fencingToken: string;
  readonly actionClass: string;
  readonly inputDigest: PlanningDigestV1;
  readonly outputDigest: PlanningDigestV1;
  readonly behavior: CollectiveDeterministicEffectBehaviorV1;
  readonly rejectionCode: string | null;
}

export interface CollectiveDeterministicEnvironmentDefinitionV1 {
  readonly schemaVersion: 1;
  readonly environmentId: string;
  readonly observations: readonly MissionObservationV1[];
  readonly effectRules: readonly CollectiveDeterministicEffectRuleV1[];
  readonly hiddenCanary: string;
}

export interface CollectiveDeterministicEnvironmentHarnessConfigV1 {
  readonly schemaVersion: 1;
  readonly registration: CollectiveEvaluationRegistrationBindingV1;
  readonly monitorPolicy: CollectiveInvariantMonitorPolicyV1;
  readonly definition: CollectiveDeterministicEnvironmentDefinitionV1;
}

export interface CollectiveDeterministicEnvironmentResultV1 {
  readonly trace: CollectiveTraceV2;
  readonly monitorSnapshot: CollectiveInvariantMonitorSnapshotV1;
  readonly evidence: CollectiveEvaluationBoundaryEvidenceV1;
}

export interface CollectiveDeterministicEnvironmentHarnessV1 {
  readonly environment: CollectiveEnvironmentPortV1;
  readonly monitor: CollectiveInvariantMonitorV1;
  finalize(
    publicArtifacts?: readonly PlanningJson[]
  ): CollectiveDeterministicEnvironmentResultV1;
}

interface EffectRecord {
  readonly attemptDigest: PlanningDigestV1;
  readonly firstReceipt: CollectiveProtectedEffectReceiptV1;
  readonly settledReceipt: CollectiveProtectedEffectReceiptV1;
  deliveredFirst: boolean;
}

interface HiddenSnapshot {
  readonly bindingDigest: PlanningDigestV1;
  readonly seed: number;
  readonly initializationDigest: PlanningDigestV1 | null;
  readonly logicalTimeMs: number;
  readonly traceEvents: readonly CollectiveTraceEventV2[];
  readonly monitorSnapshot: CollectiveInvariantMonitorSnapshotV1;
  readonly monitorEvents: readonly CollectiveInvariantMonitorEventV1[];
  readonly observationRequests: readonly [
    string,
    PlanningDigestV1,
    CollectiveEnvironmentObservationResultV1,
  ][];
  readonly observationRequestIds: readonly [string, PlanningDigestV1][];
  readonly advanceRequests: readonly [
    string,
    PlanningDigestV1,
    CollectiveEnvironmentAdvanceReceiptV1,
  ][];
  readonly effectRecords: readonly [string, EffectRecord][];
  readonly effectAttemptIds: readonly [string, PlanningDigestV1][];
  readonly committedEffectIds: readonly string[];
  readonly snapshotCount: number;
}

const hiddenSnapshots = new WeakMap<object, HiddenSnapshot>();

function exact(
  value: unknown,
  keys: readonly string[],
  label: string
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError(`${label} must be a plain object`);
  const prototype = Object.getPrototypeOf(value);
  const names = Object.getOwnPropertyNames(value).sort();
  const expected = [...keys].sort();
  if (
    (prototype !== Object.prototype && prototype !== null) ||
    Object.getOwnPropertySymbols(value).length > 0 ||
    names.length !== expected.length ||
    names.some((name, index) => name !== expected[index])
  )
    throw new TypeError(`${label} has an invalid shape`);
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor))
      throw new TypeError(`${label} must contain enumerable data properties`);
  }
}

function token(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:/@-]*$/u.test(value) ||
    value.length > 128
  )
    throw new TypeError(`${label} must be a bounded token`);
}

function identifier(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 256 ||
    /[\u0000-\u001f\u007f]/u.test(value)
  )
    throw new TypeError(`${label} must be a bounded identifier`);
}

function digest(
  value: unknown,
  label: string
): asserts value is PlanningDigestV1 {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value))
    throw new TypeError(`${label} must be a digest`);
}

function safeInteger(
  value: unknown,
  label: string,
  minimum = 0
): asserts value is number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    Object.is(value, -0)
  )
    throw new TypeError(`${label} must be a safe integer`);
}

function denseArray(value: unknown, label: string): asserts value is unknown[] {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    Object.getOwnPropertySymbols(value).length > 0 ||
    Object.getOwnPropertyNames(value).length !== value.length + 1
  )
    throw new TypeError(`${label} must be a dense array`);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor))
      throw new TypeError(`${label} must contain data properties`);
  }
}

export function collectiveHiddenCanaryDigestV1(
  hiddenCanary: string
): PlanningDigestV1 {
  if (
    typeof hiddenCanary !== 'string' ||
    new TextEncoder().encode(hiddenCanary).length < 8
  )
    throw new TypeError('hiddenCanary must contain at least eight UTF-8 bytes');
  return digestPlanningJsonV1('environment-state-v1', { hiddenCanary });
}

function validateEffectRule(
  value: unknown
): CollectiveDeterministicEffectRuleV1 {
  exact(
    value,
    [
      'schemaVersion',
      'effectId',
      'workItemId',
      'workItemRevision',
      'workContractId',
      'workContractDigest',
      'peerId',
      'peerInstanceId',
      'assignmentEpoch',
      'authorityGeneration',
      'fencingToken',
      'actionClass',
      'inputDigest',
      'outputDigest',
      'behavior',
      'rejectionCode',
    ],
    'effect rule'
  );
  if (value.schemaVersion !== 1)
    throw new TypeError('effect rule schema is invalid');
  identifier(value.effectId, 'effectId');
  identifier(value.workItemId, 'workItemId');
  safeInteger(value.workItemRevision, 'workItemRevision', 1);
  identifier(value.workContractId, 'workContractId');
  digest(value.workContractDigest, 'workContractDigest');
  identifier(value.peerId, 'peerId');
  identifier(value.peerInstanceId, 'peerInstanceId');
  safeInteger(value.assignmentEpoch, 'assignmentEpoch', 1);
  safeInteger(value.authorityGeneration, 'authorityGeneration', 1);
  token(value.fencingToken, 'fencingToken');
  token(value.actionClass, 'actionClass');
  digest(value.inputDigest, 'inputDigest');
  digest(value.outputDigest, 'outputDigest');
  if (
    !new Set([
      'commit',
      'reject',
      'timeout_before_commit',
      'timeout_after_commit',
    ]).has(value.behavior as string)
  )
    throw new TypeError('effect rule behavior is invalid');
  if (value.rejectionCode !== null) token(value.rejectionCode, 'rejectionCode');
  if (value.behavior === 'reject' && value.rejectionCode === null)
    throw new TypeError('rejected effect rule requires a reason');
  if (value.behavior !== 'reject' && value.rejectionCode !== null)
    throw new TypeError(
      'non-rejected effect rule may not have a rejection reason'
    );
  return deepFreezePlanning(
    structuredClone(value)
  ) as unknown as CollectiveDeterministicEffectRuleV1;
}

export function validateCollectiveDeterministicEnvironmentDefinitionV1(
  value: unknown
): CollectiveDeterministicEnvironmentDefinitionV1 {
  exact(
    value,
    [
      'schemaVersion',
      'environmentId',
      'observations',
      'effectRules',
      'hiddenCanary',
    ],
    'environment definition'
  );
  if (value.schemaVersion !== 1)
    throw new TypeError('environment definition schema is invalid');
  identifier(value.environmentId, 'environmentId');
  denseArray(value.observations, 'observations');
  const observations = value.observations.map(validateMissionObservationV1);
  denseArray(value.effectRules, 'effectRules');
  const effectRules = value.effectRules.map(validateEffectRule);
  let previous = '';
  const dispatchSelectors = new Set<string>();
  for (const rule of effectRules) {
    if (previous >= rule.effectId)
      throw new TypeError('effectRules must be sorted and unique by effectId');
    previous = rule.effectId;
    const selector = `${rule.workItemId}\u0000${rule.workItemRevision}\u0000${rule.actionClass}\u0000${rule.inputDigest}`;
    if (dispatchSelectors.has(selector))
      throw new TypeError('effectRules must have unique dispatch selectors');
    dispatchSelectors.add(selector);
  }
  const observationIds = new Set<string>();
  const peerObservationCounts = new Map<string, number>();
  const peerLogicalTimes = new Map<string, number>();
  for (const observation of observations) {
    if (observationIds.has(observation.observationId))
      throw new TypeError('observation IDs must be unique');
    observationIds.add(observation.observationId);
    const peerKey = `${observation.observerPeerId}\u0000${observation.observerInstanceId}`;
    const offset = peerObservationCounts.get(peerKey) ?? 0;
    if (observation.environmentCursor !== `cursor:${offset}`)
      throw new TypeError(
        'peer observations must carry contiguous environment cursors'
      );
    const previousLogicalTime = peerLogicalTimes.get(peerKey) ?? 0;
    if (observation.logicalTimeMs < previousLogicalTime)
      throw new TypeError(
        'peer observations must use non-decreasing logical time'
      );
    peerObservationCounts.set(peerKey, offset + 1);
    peerLogicalTimes.set(peerKey, observation.logicalTimeMs);
  }
  collectiveHiddenCanaryDigestV1(value.hiddenCanary as string);
  return deepFreezePlanning({
    schemaVersion: 1,
    environmentId: value.environmentId as string,
    observations,
    effectRules,
    hiddenCanary: value.hiddenCanary as string,
  });
}

export function collectiveDeterministicEnvironmentDigestV1(
  definitionInput: CollectiveDeterministicEnvironmentDefinitionV1
): PlanningDigestV1 {
  const definition =
    validateCollectiveDeterministicEnvironmentDefinitionV1(definitionInput);
  return digestPlanningJsonV1(
    'environment-state-v1',
    definition as unknown as PlanningJson,
    {
      maximumBytes: 67_108_864,
      maximumDepth: 32,
      maximumNodes: 2_000_000,
      maximumKeysPerObject: 256,
      maximumItemsPerArray: 262_144,
    }
  );
}

function parseCursor(value: string): number | null {
  const match = /^cursor:(0|[1-9][0-9]*)$/u.exec(value);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function resultClone(
  result: CollectiveEnvironmentObservationResultV1
): CollectiveEnvironmentObservationResultV1 {
  return deepFreezePlanning(structuredClone(result));
}

export function createCollectiveDeterministicEnvironmentHarnessV1(
  configInput: CollectiveDeterministicEnvironmentHarnessConfigV1
): CollectiveDeterministicEnvironmentHarnessV1 {
  exact(
    configInput,
    ['schemaVersion', 'registration', 'monitorPolicy', 'definition'],
    'environment harness config'
  );
  if (configInput.schemaVersion !== 1)
    throw new TypeError('environment harness config schema is invalid');
  const registration = validateCollectiveEvaluationRegistrationBindingV1(
    configInput.registration
  );
  const monitorPolicy = validateCollectiveInvariantMonitorPolicyV1(
    configInput.monitorPolicy
  );
  const definition = validateCollectiveDeterministicEnvironmentDefinitionV1(
    configInput.definition
  );
  if (
    registration.environmentDigest !==
    collectiveDeterministicEnvironmentDigestV1(definition)
  )
    throw new TypeError(
      'definition does not match the registered environment digest'
    );
  if (
    registration.hiddenCanaryDigest !==
    collectiveHiddenCanaryDigestV1(definition.hiddenCanary)
  )
    throw new TypeError('hidden canary does not match its registration digest');
  if (
    monitorPolicy.registrationDigest !== registration.registrationDigest ||
    monitorPolicy.hiddenCanaryDigest !== registration.hiddenCanaryDigest ||
    registration.monitorDigest !== monitorPolicy.policyDigest
  )
    throw new TypeError('monitor policy does not match the registration');
  for (const observation of definition.observations) {
    if (
      observation.missionIntentId !== registration.missionIntentId ||
      observation.intentRevision !== registration.intentRevision ||
      observation.intentDigest !== registration.intentDigest
    )
      throw new TypeError('observation is outside the registered intent');
  }
  const requiredEffects = new Set(
    monitorPolicy.requiredEffects.map((item) => item.effectId)
  );
  if (
    [...requiredEffects].some(
      (effectId) =>
        !definition.effectRules.some((rule) => rule.effectId === effectId)
    )
  )
    throw new TypeError(
      'monitor requires an effect absent from the environment'
    );

  let initializationDigest: PlanningDigestV1 | null = null;
  let logicalTimeMs = 0;
  let traceEvents: CollectiveTraceEventV2[] = [];
  let monitorEvents: CollectiveInvariantMonitorEventV1[] = [];
  let snapshotCount = 0;
  let observationRequests = new Map<
    string,
    {
      digest: PlanningDigestV1;
      result: CollectiveEnvironmentObservationResultV1;
    }
  >();
  let observationRequestIds = new Map<string, PlanningDigestV1>();
  let advanceRequests = new Map<
    string,
    { digest: PlanningDigestV1; receipt: CollectiveEnvironmentAdvanceReceiptV1 }
  >();
  let effectRecords = new Map<string, EffectRecord>();
  let effectAttemptIds = new Map<string, PlanningDigestV1>();
  let committedEffectIds = new Set<string>();
  const monitorCore = createCollectiveInvariantMonitorV1(
    monitorPolicy,
    registration.limits.maximumMonitorEvents
  );
  const monitor = Object.create(null) as CollectiveInvariantMonitorV1;
  Object.defineProperties(monitor, {
    version: { enumerable: true, value: 1 },
    record: {
      enumerable: true,
      value(input: CollectiveInvariantMonitorEventV1): void {
        const event = validateCollectiveInvariantMonitorEventV1(input);
        monitorCore.record(event);
        monitorEvents = [...monitorEvents, event];
      },
    },
    finalize: {
      enumerable: true,
      value(traceRoot: PlanningDigestV1 | null) {
        return monitorCore.finalize(traceRoot);
      },
    },
    snapshot: {
      enumerable: true,
      value(traceRoot: PlanningDigestV1 | null) {
        return monitorCore.snapshot(traceRoot);
      },
    },
    restore: {
      enumerable: true,
      value(input: CollectiveInvariantMonitorSnapshotV1): void {
        const snapshot = validateCollectiveInvariantMonitorSnapshotV1(
          input,
          monitorPolicy
        );
        monitorCore.restore(snapshot);
        monitorEvents = [...snapshot.events];
      },
    },
  });
  Object.freeze(monitor);

  const stateDigest = (
    pendingAdvanceRequest: readonly [string, PlanningDigestV1] | null = null
  ): PlanningDigestV1 => {
    const serializedAdvanceRequests: PlanningJson[] = [
      ...advanceRequests.entries(),
    ].map(([key, item]) => [key, item.digest]);
    if (
      pendingAdvanceRequest !== null &&
      !advanceRequests.has(pendingAdvanceRequest[0])
    )
      serializedAdvanceRequests.push([
        pendingAdvanceRequest[0],
        pendingAdvanceRequest[1],
      ]);
    return digestPlanningJsonV1(
      'environment-state-v1',
      {
        environmentId: definition.environmentId,
        hiddenCanary: definition.hiddenCanary,
        initializationDigest,
        logicalTimeMs,
        committedEffectIds: [...committedEffectIds].sort(),
        observationRequests: [...observationRequests.entries()].map(
          ([key, item]) => [key, item.digest]
        ),
        observationRequestIds: [...observationRequestIds.entries()],
        advanceRequests: serializedAdvanceRequests,
        effectRecords: [...effectRecords.entries()].map(([key, item]) => [
          key,
          item.attemptDigest,
          item.deliveredFirst,
        ]),
        effectAttemptIds: [...effectAttemptIds.entries()],
      },
      {
        maximumBytes: registration.limits.maximumTraceBytes,
        maximumDepth: 32,
        maximumNodes: 2_000_000,
        maximumKeysPerObject: 256,
        maximumItemsPerArray: 262_144,
      }
    );
  };

  const appendTrace = (
    input: Omit<
      Parameters<typeof createCollectiveTraceEventV2>[0],
      | 'schemaVersion'
      | 'eventId'
      | 'causalParentIds'
      | 'registrationDigest'
      | 'seed'
      | 'runner'
      | 'logicalTimeMs'
      | 'tenantId'
      | 'missionIntentId'
      | 'previousTraceChainDigest'
    >
  ): CollectiveTraceEventV2 => {
    if (traceEvents.length >= registration.limits.maximumTraceEvents)
      throw new TypeError('trace event limit exceeded');
    const previous = traceEvents.at(-1);
    const event = createCollectiveTraceEventV2({
      schemaVersion: 2,
      eventId: `evaluation-event:${String(traceEvents.length + 1).padStart(8, '0')}`,
      causalParentIds: previous === undefined ? [] : [previous.eventId],
      registrationDigest: registration.bindingDigest,
      seed: registration.seed,
      runner: registration.runner,
      logicalTimeMs,
      tenantId: registration.tenantId,
      missionIntentId: registration.missionIntentId,
      previousTraceChainDigest: previous?.traceChainDigest ?? null,
      ...input,
    });
    traceEvents = [...traceEvents, event];
    return event;
  };

  const recordMonitor = (
    kind: CollectiveInvariantMonitorEventV1['kind'],
    traceEventId: string | null,
    effectId: string | null,
    violationCode: string | null,
    record: PlanningJson
  ): CollectiveInvariantMonitorEventV1 => {
    const event = createCollectiveInvariantMonitorEventV1({
      schemaVersion: 1,
      monitorEventId: `monitor-event:${String(monitorEvents.length + 1).padStart(8, '0')}`,
      registrationDigest: registration.registrationDigest,
      traceEventId,
      logicalTimeMs,
      kind,
      effectId,
      violationCode,
      recordDigest: digestPlanningJsonV1('environment-state-v1', record),
      previousMonitorEventDigest:
        monitorEvents.at(-1)?.monitorEventDigest ?? null,
    });
    monitor.record(event);
    return event;
  };

  const rejectedObservation = (
    request: CollectiveEnvironmentObservationRequestV1,
    reasonCode: string
  ): CollectiveEnvironmentObservationResultV1 => {
    const receipt = createCollectiveEnvironmentObservationReceiptV1({
      schemaVersion: 1,
      requestDigest: request.requestDigest,
      peerId: request.peerId,
      peerInstanceId: request.peerInstanceId,
      environmentCursor: request.environmentCursor,
      nextEnvironmentCursor: request.environmentCursor,
      observationDigests: [],
      status: 'rejected',
      reasonCode,
      deliveredAtLogicalMs: logicalTimeMs,
    });
    return deepFreezePlanning({ receipt, observations: [] });
  };

  const initialize = (
    input: CollectiveEnvironmentInitializationV1
  ): CollectiveEnvironmentInitializationReceiptV1 => {
    const initialization = validateCollectiveEnvironmentInitializationV1(input);
    const stateBeforeInitialization = stateDigest();
    const matches =
      initialization.registration.bindingDigest ===
        registration.bindingDigest &&
      initialization.initializedAtLogicalMs === logicalTimeMs;
    let status: CollectiveEnvironmentInitializationReceiptV1['status'];
    let reasonCode: string | null = null;
    if (!matches) {
      status = 'rejected';
      reasonCode = 'registration_mismatch';
    } else if (initializationDigest === null) {
      initializationDigest = initialization.initializationDigest;
      status = 'initialized';
    } else if (initializationDigest === initialization.initializationDigest)
      status = 'idempotent';
    else {
      status = 'rejected';
      reasonCode = 'initialization_conflict';
    }
    const receipt = createCollectiveEnvironmentInitializationReceiptV1({
      schemaVersion: 1,
      initializationDigest: initialization.initializationDigest,
      status,
      reasonCode,
      logicalTimeMs,
      environmentStateDigest: stateDigest(),
    });
    appendTrace({
      peerId: null,
      component: 'environment',
      kind: 'environment.initialized',
      status: status === 'rejected' ? 'rejected' : 'accepted',
      reasonCode,
      recordDigest: receipt.receiptDigest,
      stateDigestBefore: stateBeforeInitialization,
      stateDigestAfter: receipt.environmentStateDigest,
      faultBinding: null,
    });
    return receipt;
  };

  const observe = (
    input: CollectiveEnvironmentObservationRequestV1
  ): CollectiveEnvironmentObservationResultV1 => {
    const request = validateCollectiveEnvironmentObservationRequestV1(input);
    const stateBeforeRequest = stateDigest();
    const requestEvent = appendTrace({
      peerId: request.peerId,
      component: 'environment',
      kind: 'environment.observation.requested',
      status: 'observed',
      reasonCode: null,
      recordDigest: request.requestDigest,
      stateDigestBefore: stateBeforeRequest,
      stateDigestAfter: stateBeforeRequest,
      faultBinding: null,
    });
    const priorRequestIdDigest = observationRequestIds.get(request.requestId);
    if (
      priorRequestIdDigest !== undefined &&
      priorRequestIdDigest !== request.requestDigest
    ) {
      const result = rejectedObservation(request, 'request_id_conflict');
      appendTrace({
        peerId: request.peerId,
        component: 'environment',
        kind: 'environment.observation.rejected',
        status: 'rejected',
        reasonCode: 'request_id_conflict',
        recordDigest: result.receipt.receiptDigest,
        stateDigestBefore: stateDigest(),
        stateDigestAfter: stateDigest(),
        faultBinding: null,
      });
      return result;
    }
    observationRequestIds.set(request.requestId, request.requestDigest);
    if (
      initializationDigest === null ||
      request.registrationDigest !== registration.bindingDigest ||
      request.missionIntentId !== registration.missionIntentId ||
      request.intentRevision !== registration.intentRevision ||
      request.intentDigest !== registration.intentDigest ||
      request.requestedAtLogicalMs !== logicalTimeMs ||
      request.maximumItems > registration.limits.maximumObservationBatch
    ) {
      const result = rejectedObservation(
        request,
        'observation_binding_invalid'
      );
      appendTrace({
        peerId: request.peerId,
        component: 'environment',
        kind: 'environment.observation.rejected',
        status: 'rejected',
        reasonCode: result.receipt.reasonCode,
        recordDigest: result.receipt.receiptDigest,
        stateDigestBefore: stateBeforeRequest,
        stateDigestAfter: stateDigest(),
        faultBinding: null,
      });
      return result;
    }
    const key = `${request.peerId}\u0000${request.peerInstanceId}\u0000${request.environmentCursor}`;
    const prior = observationRequests.get(key);
    if (prior !== undefined) {
      if (prior.digest !== request.requestDigest) {
        const result = rejectedObservation(request, 'cursor_conflict');
        appendTrace({
          peerId: request.peerId,
          component: 'environment',
          kind: 'environment.observation.rejected',
          status: 'rejected',
          reasonCode: 'cursor_conflict',
          recordDigest: result.receipt.receiptDigest,
          stateDigestBefore: stateBeforeRequest,
          stateDigestAfter: stateDigest(),
          faultBinding: null,
        });
        return result;
      }
      const result = resultClone(prior.result);
      return deepFreezePlanning({
        ...result,
        receipt: createCollectiveEnvironmentObservationReceiptV1({
          schemaVersion: 1,
          requestDigest: result.receipt.requestDigest,
          peerId: result.receipt.peerId,
          peerInstanceId: result.receipt.peerInstanceId,
          environmentCursor: result.receipt.environmentCursor,
          nextEnvironmentCursor: result.receipt.nextEnvironmentCursor,
          observationDigests: result.receipt.observationDigests,
          status: 'idempotent',
          reasonCode: result.receipt.reasonCode,
          deliveredAtLogicalMs: result.receipt.deliveredAtLogicalMs,
        }),
      });
    }
    const offset = parseCursor(request.environmentCursor);
    const peerObservations = definition.observations.filter(
      (observation) =>
        observation.observerPeerId === request.peerId &&
        observation.observerInstanceId === request.peerInstanceId &&
        observation.logicalTimeMs <= logicalTimeMs
    );
    if (
      offset === null ||
      offset > peerObservations.length ||
      offset === peerObservations.length
    ) {
      const result = rejectedObservation(
        request,
        offset === peerObservations.length
          ? 'cursor_exhausted'
          : 'cursor_invalid'
      );
      appendTrace({
        peerId: request.peerId,
        component: 'environment',
        kind: 'environment.observation.rejected',
        status: 'rejected',
        reasonCode: result.receipt.reasonCode,
        recordDigest: result.receipt.receiptDigest,
        stateDigestBefore: stateBeforeRequest,
        stateDigestAfter: stateDigest(),
        faultBinding: null,
      });
      return result;
    }
    const observations = peerObservations.slice(
      offset,
      offset + request.maximumItems
    );
    const nextEnvironmentCursor = `cursor:${offset + observations.length}`;
    const receipt = createCollectiveEnvironmentObservationReceiptV1({
      schemaVersion: 1,
      requestDigest: request.requestDigest,
      peerId: request.peerId,
      peerInstanceId: request.peerInstanceId,
      environmentCursor: request.environmentCursor,
      nextEnvironmentCursor,
      observationDigests: observations.map(
        (observation) => observation.observationDigest
      ),
      status: 'delivered',
      reasonCode: null,
      deliveredAtLogicalMs: logicalTimeMs,
    });
    const result = deepFreezePlanning({ receipt, observations });
    observationRequests.set(key, { digest: request.requestDigest, result });
    const delivery = appendTrace({
      peerId: request.peerId,
      component: 'environment',
      kind: 'environment.observation.delivered',
      status: 'accepted',
      reasonCode: null,
      recordDigest: receipt.receiptDigest,
      stateDigestBefore: stateBeforeRequest,
      stateDigestAfter: stateDigest(),
      faultBinding: null,
    });
    recordMonitor('observation.delivered', delivery.eventId, null, null, {
      requestDigest: request.requestDigest,
      observationDigests: [...receipt.observationDigests],
    });
    void requestEvent;
    return result;
  };

  const effectMismatch = (
    attempt: CollectiveProtectedEffectAttemptV1,
    reasonCode: string,
    monitorKind?: CollectiveInvariantMonitorEventV1['kind']
  ): CollectiveProtectedEffectReceiptV1 => {
    const receipt = createCollectiveProtectedEffectReceiptV1({
      schemaVersion: 1,
      attemptDigest: attempt.attemptDigest,
      idempotencyKey: attempt.idempotencyKey,
      effectId: null,
      status: 'rejected',
      reasonCode,
      outputDigest: null,
      observedAtLogicalMs: logicalTimeMs,
    });
    const event = appendTrace({
      peerId: attempt.peerId,
      component: 'environment',
      kind: 'environment.effect.rejected',
      status: 'rejected',
      reasonCode,
      recordDigest: receipt.receiptDigest,
      stateDigestBefore: stateDigest(),
      stateDigestAfter: stateDigest(),
      faultBinding: null,
    });
    if (monitorKind !== undefined)
      recordMonitor(monitorKind, event.eventId, null, reasonCode, {
        attemptDigest: attempt.attemptDigest,
        reasonCode,
      });
    return receipt;
  };

  const applyEffect = (
    input: CollectiveProtectedEffectAttemptV1
  ): CollectiveProtectedEffectReceiptV1 => {
    const attempt = validateCollectiveProtectedEffectAttemptV1(input);
    const stateBeforeAttempt = stateDigest();
    const priorAttemptIdDigest = effectAttemptIds.get(attempt.attemptId);
    const attemptIdConflict =
      priorAttemptIdDigest !== undefined &&
      priorAttemptIdDigest !== attempt.attemptDigest;
    if (!attemptIdConflict)
      effectAttemptIds.set(attempt.attemptId, attempt.attemptDigest);
    appendTrace({
      peerId: attempt.peerId,
      component: 'environment',
      kind: 'environment.effect.attempted',
      status: 'observed',
      reasonCode: null,
      recordDigest: attempt.attemptDigest,
      stateDigestBefore: stateBeforeAttempt,
      stateDigestAfter: stateDigest(),
      faultBinding: null,
    });
    if (attemptIdConflict)
      return effectMismatch(
        attempt,
        'attempt_id_conflict',
        'authorization.violation'
      );
    if (
      initializationDigest === null ||
      attempt.registrationDigest !== registration.bindingDigest ||
      attempt.tenantId !== registration.tenantId ||
      attempt.missionIntentId !== registration.missionIntentId ||
      attempt.intentRevision !== registration.intentRevision ||
      attempt.intentDigest !== registration.intentDigest ||
      attempt.attemptedAtLogicalMs !== logicalTimeMs
    )
      return effectMismatch(
        attempt,
        'effect_binding_invalid',
        'authorization.violation'
      );
    const prior = effectRecords.get(attempt.idempotencyKey);
    if (prior !== undefined) {
      if (prior.attemptDigest !== attempt.attemptDigest)
        return effectMismatch(
          attempt,
          'idempotency_conflict',
          'authorization.violation'
        );
      if (!prior.deliveredFirst) {
        prior.deliveredFirst = true;
        return prior.firstReceipt;
      }
      return prior.settledReceipt;
    }
    const candidate = definition.effectRules.find(
      (rule) =>
        rule.workItemId === attempt.workItemId &&
        rule.workItemRevision === attempt.workItemRevision &&
        rule.actionClass === attempt.actionClass &&
        rule.inputDigest === attempt.inputDigest
    );
    if (candidate === undefined)
      return effectMismatch(
        attempt,
        'effect_not_registered',
        'authorization.violation'
      );
    const contractMatches =
      candidate.workContractId === attempt.workContractId &&
      candidate.workContractDigest === attempt.workContractDigest &&
      candidate.peerId === attempt.peerId &&
      candidate.peerInstanceId === attempt.peerInstanceId &&
      candidate.assignmentEpoch === attempt.assignmentEpoch &&
      candidate.authorityGeneration === attempt.authorityGeneration;
    if (!contractMatches)
      return effectMismatch(
        attempt,
        'work_contract_mismatch',
        'plan_authority.violation'
      );
    if (candidate.fencingToken !== attempt.fencingToken)
      return effectMismatch(attempt, 'stale_fence', 'stale_fence.violation');
    if (candidate.behavior === 'reject')
      return effectMismatch(
        attempt,
        candidate.rejectionCode ?? 'effect_rejected'
      );
    if (candidate.behavior === 'timeout_before_commit') {
      const stateBeforeTimeout = stateDigest();
      const receipt = createCollectiveProtectedEffectReceiptV1({
        schemaVersion: 1,
        attemptDigest: attempt.attemptDigest,
        idempotencyKey: attempt.idempotencyKey,
        effectId: null,
        status: 'indeterminate',
        reasonCode: 'timeout_before_commit',
        outputDigest: null,
        observedAtLogicalMs: logicalTimeMs,
      });
      effectRecords.set(attempt.idempotencyKey, {
        attemptDigest: attempt.attemptDigest,
        firstReceipt: receipt,
        settledReceipt: receipt,
        deliveredFirst: true,
      });
      appendTrace({
        peerId: attempt.peerId,
        component: 'environment',
        kind: 'environment.effect.indeterminate',
        status: 'indeterminate',
        reasonCode: 'timeout_before_commit',
        recordDigest: receipt.receiptDigest,
        stateDigestBefore: stateBeforeTimeout,
        stateDigestAfter: stateDigest(),
        faultBinding: null,
      });
      return receipt;
    }
    if (committedEffectIds.has(candidate.effectId)) {
      recordMonitor(
        'effect.duplicate',
        traceEvents.at(-1)?.eventId ?? null,
        candidate.effectId,
        null,
        { attemptDigest: attempt.attemptDigest, effectId: candidate.effectId }
      );
      return effectMismatch(attempt, 'duplicate_effect');
    }
    const stateBeforeCommit = stateDigest();
    committedEffectIds.add(candidate.effectId);
    const settledReceipt = createCollectiveProtectedEffectReceiptV1({
      schemaVersion: 1,
      attemptDigest: attempt.attemptDigest,
      idempotencyKey: attempt.idempotencyKey,
      effectId: candidate.effectId,
      status: 'committed',
      reasonCode: null,
      outputDigest: candidate.outputDigest,
      observedAtLogicalMs: logicalTimeMs,
    });
    if (candidate.behavior === 'timeout_after_commit') {
      const firstReceipt = createCollectiveProtectedEffectReceiptV1({
        schemaVersion: 1,
        attemptDigest: attempt.attemptDigest,
        idempotencyKey: attempt.idempotencyKey,
        effectId: null,
        status: 'indeterminate',
        reasonCode: 'timeout_after_commit',
        outputDigest: null,
        observedAtLogicalMs: logicalTimeMs,
      });
      effectRecords.set(attempt.idempotencyKey, {
        attemptDigest: attempt.attemptDigest,
        firstReceipt,
        settledReceipt,
        deliveredFirst: true,
      });
      const stateAfter = stateDigest();
      const event = appendTrace({
        peerId: attempt.peerId,
        component: 'environment',
        kind: 'environment.effect.indeterminate',
        status: 'indeterminate',
        reasonCode: 'timeout_after_commit',
        recordDigest: firstReceipt.receiptDigest,
        stateDigestBefore: stateBeforeCommit,
        stateDigestAfter: stateAfter,
        faultBinding: null,
      });
      recordMonitor(
        'effect.committed',
        event.eventId,
        candidate.effectId,
        null,
        { attemptDigest: attempt.attemptDigest, effectId: candidate.effectId }
      );
      return firstReceipt;
    }
    effectRecords.set(attempt.idempotencyKey, {
      attemptDigest: attempt.attemptDigest,
      firstReceipt: settledReceipt,
      settledReceipt,
      deliveredFirst: true,
    });
    const stateAfter = stateDigest();
    const event = appendTrace({
      peerId: attempt.peerId,
      component: 'environment',
      kind: 'environment.effect.committed',
      status: 'accepted',
      reasonCode: null,
      recordDigest: settledReceipt.receiptDigest,
      stateDigestBefore: stateBeforeCommit,
      stateDigestAfter: stateAfter,
      faultBinding: null,
    });
    recordMonitor('effect.committed', event.eventId, candidate.effectId, null, {
      attemptDigest: attempt.attemptDigest,
      effectId: candidate.effectId,
    });
    return settledReceipt;
  };

  const advance = (
    input: CollectiveEnvironmentAdvanceRequestV1
  ): CollectiveEnvironmentAdvanceReceiptV1 => {
    const request = validateCollectiveEnvironmentAdvanceRequestV1(input);
    const stateBeforeAdvance = stateDigest();
    const prior = advanceRequests.get(request.advanceId);
    let status: CollectiveEnvironmentAdvanceReceiptV1['status'] = 'advanced';
    let reasonCode: string | null = null;
    if (prior !== undefined) {
      if (prior.digest === request.advanceDigest)
        return prior.receipt.status === 'rejected'
          ? prior.receipt
          : createCollectiveEnvironmentAdvanceReceiptV1({
              schemaVersion: 1,
              advanceDigest: prior.receipt.advanceDigest,
              status: 'idempotent',
              reasonCode: null,
              logicalTimeMs: prior.receipt.logicalTimeMs,
              environmentStateDigest: prior.receipt.environmentStateDigest,
            });
      status = 'rejected';
      reasonCode = 'advance_conflict';
    } else if (
      initializationDigest === null ||
      request.registrationDigest !== registration.bindingDigest ||
      request.targetLogicalTimeMs < logicalTimeMs
    ) {
      status = 'rejected';
      reasonCode =
        request.targetLogicalTimeMs < logicalTimeMs
          ? 'logical_time_regression'
          : 'advance_binding_invalid';
    } else logicalTimeMs = request.targetLogicalTimeMs;
    const environmentStateDigest = stateDigest(
      prior === undefined ? [request.advanceId, request.advanceDigest] : null
    );
    const receipt = createCollectiveEnvironmentAdvanceReceiptV1({
      schemaVersion: 1,
      advanceDigest: request.advanceDigest,
      status,
      reasonCode,
      logicalTimeMs,
      environmentStateDigest,
    });
    if (prior === undefined)
      advanceRequests.set(request.advanceId, {
        digest: request.advanceDigest,
        receipt,
      });
    appendTrace({
      peerId: null,
      component: 'environment',
      kind: 'environment.time.advanced',
      status: status === 'rejected' ? 'rejected' : 'accepted',
      reasonCode,
      recordDigest: receipt.receiptDigest,
      stateDigestBefore: stateBeforeAdvance,
      stateDigestAfter: receipt.environmentStateDigest,
      faultBinding: null,
    });
    return receipt;
  };

  const snapshot = (): CollectiveEnvironmentSnapshotHandleV1 => {
    if (snapshotCount >= registration.limits.maximumEnvironmentSnapshots)
      throw new TypeError('environment snapshot limit exceeded');
    snapshotCount += 1;
    const trace = createCollectiveTraceV2(registration, traceEvents);
    const monitorSnapshot = monitor.snapshot(trace.traceRoot);
    const handle = createCollectiveEnvironmentSnapshotHandleV1({
      format: 'agentplat.collective-environment.snapshot-handle',
      schemaVersion: 1,
      snapshotId: `environment-snapshot:${String(snapshotCount).padStart(8, '0')}`,
      registrationDigest: registration.bindingDigest,
      seed: registration.seed,
      logicalTimeMs,
      eventCount: traceEvents.length,
      traceRoot: trace.traceRoot,
      environmentStateDigest: stateDigest(),
    });
    hiddenSnapshots.set(handle, {
      bindingDigest: registration.bindingDigest,
      seed: registration.seed,
      initializationDigest,
      logicalTimeMs,
      traceEvents,
      monitorSnapshot,
      monitorEvents,
      observationRequests: [...observationRequests].map(([key, item]) => [
        key,
        item.digest,
        item.result,
      ]),
      observationRequestIds: [...observationRequestIds],
      advanceRequests: [...advanceRequests].map(([key, item]) => [
        key,
        item.digest,
        item.receipt,
      ]),
      effectRecords: [...effectRecords],
      effectAttemptIds: [...effectAttemptIds],
      committedEffectIds: [...committedEffectIds],
      snapshotCount,
    });
    return handle;
  };

  const restore = (
    input: CollectiveEnvironmentSnapshotHandleV1
  ): CollectiveEnvironmentRestoreReceiptV1 => {
    const handle = validateCollectiveEnvironmentSnapshotHandleV1(input);
    const hidden = hiddenSnapshots.get(input as object);
    let status: CollectiveEnvironmentRestoreReceiptV1['status'] = 'restored';
    let reasonCode: string | null = null;
    if (
      hidden === undefined ||
      hidden.bindingDigest !== registration.bindingDigest ||
      hidden.seed !== registration.seed ||
      handle.registrationDigest !== registration.bindingDigest ||
      handle.seed !== registration.seed
    ) {
      status = 'rejected';
      reasonCode = 'snapshot_binding_invalid';
    } else if (
      traceEvents.length > hidden.traceEvents.length ||
      monitorEvents.length > hidden.monitorEvents.length
    ) {
      status = 'rejected';
      reasonCode = 'snapshot_rollback_rejected';
    } else if (
      traceEvents.some(
        (event, index) =>
          event.traceChainDigest !== hidden.traceEvents[index]?.traceChainDigest
      ) ||
      monitorEvents.some(
        (event, index) =>
          event.monitorEventDigest !==
          hidden.monitorEvents[index]?.monitorEventDigest
      )
    ) {
      status = 'rejected';
      reasonCode = 'snapshot_history_conflict';
    } else if (
      traceEvents.length === hidden.traceEvents.length &&
      monitorEvents.length === hidden.monitorEvents.length
    )
      status = 'idempotent';
    else {
      monitor.restore(hidden.monitorSnapshot);
      initializationDigest = hidden.initializationDigest;
      logicalTimeMs = hidden.logicalTimeMs;
      traceEvents = [...hidden.traceEvents];
      observationRequests = new Map(
        hidden.observationRequests.map(([key, requestDigest, result]) => [
          key,
          { digest: requestDigest, result },
        ])
      );
      observationRequestIds = new Map(hidden.observationRequestIds);
      advanceRequests = new Map(
        hidden.advanceRequests.map(([key, requestDigest, receipt]) => [
          key,
          { digest: requestDigest, receipt },
        ])
      );
      effectRecords = new Map(
        hidden.effectRecords.map(([key, record]) => [key, { ...record }])
      );
      effectAttemptIds = new Map(hidden.effectAttemptIds);
      committedEffectIds = new Set(hidden.committedEffectIds);
      snapshotCount = hidden.snapshotCount;
    }
    return createCollectiveEnvironmentRestoreReceiptV1({
      schemaVersion: 1,
      snapshotDigest: handle.snapshotDigest,
      status,
      reasonCode,
      logicalTimeMs,
      environmentStateDigest: stateDigest(),
    });
  };

  const environment = Object.create(null) as CollectiveEnvironmentPortV1;
  Object.defineProperties(environment, {
    version: { enumerable: true, value: 1 },
    initialize: { enumerable: true, value: initialize },
    observe: { enumerable: true, value: observe },
    applyEffect: { enumerable: true, value: applyEffect },
    advance: { enumerable: true, value: advance },
    snapshot: { enumerable: true, value: snapshot },
    restore: { enumerable: true, value: restore },
  });
  Object.freeze(environment);
  assertCollectiveEnvironmentPortV1(environment);

  const finalize = (
    publicArtifacts: readonly PlanningJson[] = []
  ): CollectiveDeterministicEnvironmentResultV1 => {
    denseArray(publicArtifacts, 'publicArtifacts');
    let trace = createCollectiveTraceV2(registration, traceEvents);
    if (
      trace.ledger.limitExceeded &&
      !monitorEvents.some((event) => event.kind === 'terminal.failure')
    ) {
      const terminal = appendTrace({
        peerId: null,
        component: 'monitor',
        kind: 'monitor.terminal',
        status: 'rejected',
        reasonCode: 'interaction_limit_exceeded',
        recordDigest: trace.ledger.ledgerDigest,
        stateDigestBefore: stateDigest(),
        stateDigestAfter: stateDigest(),
        faultBinding: null,
      });
      recordMonitor('terminal.failure', terminal.eventId, null, null, {
        reasonCode: 'interaction_limit_exceeded',
        firstExceededEventId: trace.ledger.firstExceededEventId,
      });
      trace = createCollectiveTraceV2(registration, traceEvents);
    }
    const monitorSnapshot = monitor.snapshot(trace.traceRoot);
    const evidence = createCollectiveEvaluationBoundaryEvidenceV1({
      registration,
      trace,
      monitorPolicy,
      monitorEvents,
      publicArtifacts,
      hiddenCanary: definition.hiddenCanary,
    });
    return deepFreezePlanning({ trace, monitorSnapshot, evidence });
  };

  return Object.freeze({ environment, monitor, finalize });
}
