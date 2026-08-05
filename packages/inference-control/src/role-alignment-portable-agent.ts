import type { JsonValue } from '@agentplat/core';
import {
  normalizeCheckpointTransferV1,
  normalizeRoleBindingV1,
  type PortableAgentCheckpointTransferV1,
  type PortableAgentControlDecisionV1,
  type PortableAgentControlPortV1,
  type PortableAgentControlRequestV1,
  type PortableAgentRoleBindingV1,
} from '@agentplat/runtime/adapter';

import {
  assertRoleAlignmentStateV1,
  closeRoleAlignmentStateV1,
  createRoleAlignmentPolicyRecordV1,
  createRoleAlignmentRoleAnchorV1,
  createRoleAlignmentStateV1,
  decisionForInactiveRoleAlignmentStateV1,
  digestRoleAlignmentJsonV1,
  findRoleAlignmentDecisionV1,
  observeRoleAlignmentSignalV1,
  rebindRoleAlignmentSessionV1,
  replaceRoleAlignmentRoleV1,
  resumeRoleAlignmentStateV1,
  type RoleAlignmentCheckpointV1,
  type RoleAlignmentDecisionV1,
  type RoleAlignmentEventV1,
  type RoleAlignmentPolicyV1,
  type RoleAlignmentRoleAnchorV1,
  type RoleAlignmentSignalV1,
  type RoleAlignmentStateV1,
} from './role-alignment.js';
import {
  assertDigest,
  assertExactKeys,
  assertIdentifier,
  assertSafeInteger,
  deepFreeze,
} from './validation.js';

export interface RoleAlignmentAssessorBindingV1 {
  readonly schemaVersion: 1;
  readonly assessorId: string;
  readonly assessorVersion: number;
  readonly assessorBindingDigest: string;
}

export interface RoleAlignmentAssessmentRequestV1 {
  readonly schemaVersion: 1;
  readonly assessmentRequestId: string;
  readonly targetDigest: string;
  readonly controllerId: string;
  readonly controllerVersion: number;
  readonly implementationId: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly policyDigest: string;
  readonly tenantId: string;
  readonly sessionId: string;
  readonly agentId: string;
  readonly stepId: string;
  readonly checkpoint: RoleAlignmentCheckpointV1;
  readonly roleAnchorDigest: string;
  readonly roleRevision: number;
  readonly stateRevision: number;
  readonly previousRollingCoherenceBps: number | null;
  readonly previousDegraded: boolean;
  readonly createdAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
}

export interface RoleAlignmentAssessmentV1 {
  readonly schemaVersion: 1;
  readonly assessmentId: string;
  readonly assessmentRequestId: string;
  readonly targetDigest: string;
  readonly assessorId: string;
  readonly assessorVersion: number;
  readonly assessorBindingDigest: string;
  readonly coherenceBps: number;
  readonly uncertaintyBps: number;
  readonly contextInconsistencyBps: number;
  readonly hardViolation: boolean;
  readonly reasonCodes: readonly string[];
  readonly evidenceReferenceIds: readonly string[];
  readonly assessedAtLogicalMs: number;
}

/** The target is supplied as data; returning an assessment never grants authority. */
export interface RoleAlignmentAssessorV1 {
  assess(
    request: RoleAlignmentAssessmentRequestV1,
    target: PortableAgentControlRequestV1
  ): Promise<RoleAlignmentAssessmentV1> | RoleAlignmentAssessmentV1;
}

/** Atomic revision-checked persistence boundary for controller state. */
export interface RoleAlignmentStateStoreV1 {
  load(sessionId: string): Promise<RoleAlignmentStateV1 | undefined>;
  save(
    state: RoleAlignmentStateV1,
    expectedRevision: number | null
  ): Promise<void>;
}

export class RoleAlignmentStoreConflictErrorV1 extends Error {
  readonly name = 'RoleAlignmentStoreConflictErrorV1';

  constructor(message = 'role alignment state revision conflict') {
    super(message);
  }
}

export class InMemoryRoleAlignmentStateStoreV1 implements RoleAlignmentStateStoreV1 {
  private readonly states = new Map<string, RoleAlignmentStateV1>();

  async load(sessionId: string): Promise<RoleAlignmentStateV1 | undefined> {
    assertIdentifier(sessionId, 'sessionId');
    return this.states.get(sessionId);
  }

  async save(
    state: RoleAlignmentStateV1,
    expectedRevision: number | null
  ): Promise<void> {
    assertIdentifier(state.sessionId, 'sessionId');
    const current = this.states.get(state.sessionId);
    if (
      (expectedRevision === null && current !== undefined) ||
      (expectedRevision !== null && current?.revision !== expectedRevision)
    )
      throw new RoleAlignmentStoreConflictErrorV1();
    this.states.set(state.sessionId, state);
  }
}

export interface RoleAlignmentDecisionObserverV1 {
  observe(input: {
    readonly state: RoleAlignmentStateV1;
    readonly event: RoleAlignmentEventV1;
    readonly decision: RoleAlignmentDecisionV1;
  }): Promise<void> | void;
}

export interface CreateRoleAlignmentPortableAgentControlV1 {
  readonly controlId: string;
  readonly controlVersion: number;
  readonly implementationId: string;
  readonly policy: RoleAlignmentPolicyV1;
  readonly assessorBinding: RoleAlignmentAssessorBindingV1;
  readonly assessor: RoleAlignmentAssessorV1;
  readonly assessmentTtlMs: number;
  readonly stateStore?: RoleAlignmentStateStoreV1;
  /** Best-effort content-free observation; failure never changes enforcement. */
  readonly decisionObserver?: RoleAlignmentDecisionObserverV1;
}

export interface RoleAlignmentHandoffEnvelopeV1 {
  readonly schemaVersion: 1;
  readonly contentClass: 'role_alignment_state';
  readonly controllerId: string;
  readonly controllerVersion: number;
  readonly implementationId: string;
  readonly policyDigest: string;
  readonly sourceSessionId: string;
  readonly sourceAgentId: string;
  readonly sourceRoleAnchorDigest: string;
  readonly checkpointTransferDigest: string;
  readonly sourceState: RoleAlignmentStateV1;
  readonly exportedAtLogicalMs: number;
  readonly handoffDigest: string;
}

export interface RoleAlignmentPortableAgentControlV1 extends PortableAgentControlPortV1 {
  readonly binding: Readonly<{
    readonly policyId: string;
    readonly policyVersion: number;
    readonly policyDigest: string;
    readonly assessorId: string;
    readonly assessorVersion: number;
    readonly assessorBindingDigest: string;
  }>;
  getState(sessionId: string): Promise<RoleAlignmentStateV1 | undefined>;
  activateSessionRole(input: {
    readonly sessionId: string;
    readonly expectedRevision: number;
    readonly tenantId: string;
    readonly agentId: string;
    readonly role: PortableAgentRoleBindingV1;
    readonly logicalTimeMs: number;
  }): Promise<RoleAlignmentStateV1>;
  resumeSession(input: {
    readonly sessionId: string;
    readonly expectedRevision: number;
    readonly logicalTimeMs: number;
    readonly reasonCode: string;
  }): Promise<RoleAlignmentStateV1>;
  closeSession(input: {
    readonly sessionId: string;
    readonly expectedRevision: number;
    readonly logicalTimeMs: number;
    readonly reasonCode: string;
  }): Promise<RoleAlignmentStateV1>;
  exportHandoff(input: {
    readonly sessionId: string;
    readonly checkpointTransfer: PortableAgentCheckpointTransferV1;
    readonly logicalTimeMs: number;
  }): Promise<RoleAlignmentHandoffEnvelopeV1>;
  importHandoff(input: {
    readonly handoff: RoleAlignmentHandoffEnvelopeV1;
    readonly checkpointTransfer: PortableAgentCheckpointTransferV1;
    readonly targetSessionId: string;
    readonly targetAgentId: string;
    readonly targetRole: PortableAgentRoleBindingV1;
    readonly logicalTimeMs: number;
  }): Promise<RoleAlignmentStateV1>;
}

export function createRoleAlignmentPortableAgentControlV1(
  options: CreateRoleAlignmentPortableAgentControlV1
): RoleAlignmentPortableAgentControlV1 {
  return new RoleAlignmentPortableAgentControl(options);
}

class RoleAlignmentPortableAgentControl implements RoleAlignmentPortableAgentControlV1 {
  readonly controlId: string;
  readonly controlVersion: number;
  readonly implementationId: string;
  readonly binding: RoleAlignmentPortableAgentControlV1['binding'];

  private readonly policy: RoleAlignmentPolicyV1;
  private readonly assessorBinding: RoleAlignmentAssessorBindingV1;
  private readonly assessor: RoleAlignmentAssessorV1;
  private readonly assessmentTtlMs: number;
  private readonly stateStore: RoleAlignmentStateStoreV1;
  private readonly decisionObserver?: RoleAlignmentDecisionObserverV1;

  constructor(options: CreateRoleAlignmentPortableAgentControlV1) {
    if (!options || typeof options !== 'object')
      throw new TypeError('role_alignment_options_required');
    assertIdentifier(options.controlId, 'controlId');
    assertSafeInteger(options.controlVersion, 'controlVersion', 1);
    assertIdentifier(options.implementationId, 'implementationId');
    const policyRecord = createRoleAlignmentPolicyRecordV1(options.policy);
    const assessorBinding = validateAssessorBinding(options.assessorBinding);
    if (!options.assessor || typeof options.assessor.assess !== 'function')
      throw new TypeError('role_alignment_assessor_required');
    assertSafeInteger(options.assessmentTtlMs, 'assessmentTtlMs', 1);
    if (
      options.assessmentTtlMs >
      policyRecord.policy.limits.maximumAssessmentTtlMs
    )
      throw new TypeError('role_alignment_assessment_ttl_exceeds_policy');
    if (
      options.stateStore !== undefined &&
      (typeof options.stateStore.load !== 'function' ||
        typeof options.stateStore.save !== 'function')
    )
      throw new TypeError('role_alignment_state_store_invalid');
    if (
      options.decisionObserver !== undefined &&
      typeof options.decisionObserver.observe !== 'function'
    )
      throw new TypeError('role_alignment_decision_observer_invalid');
    this.controlId = options.controlId;
    this.controlVersion = options.controlVersion;
    this.implementationId = options.implementationId;
    this.policy = policyRecord.policy;
    this.assessorBinding = assessorBinding;
    this.assessor = options.assessor;
    this.assessmentTtlMs = options.assessmentTtlMs;
    this.stateStore =
      options.stateStore ?? new InMemoryRoleAlignmentStateStoreV1();
    this.decisionObserver = options.decisionObserver;
    this.binding = deepFreeze({
      policyId: policyRecord.policy.policyId,
      policyVersion: policyRecord.policy.policyVersion,
      policyDigest: policyRecord.policyDigest,
      assessorId: assessorBinding.assessorId,
      assessorVersion: assessorBinding.assessorVersion,
      assessorBindingDigest: assessorBinding.assessorBindingDigest,
    });
  }

  async evaluate(
    target: PortableAgentControlRequestV1
  ): Promise<PortableAgentControlDecisionV1> {
    try {
      return await this.evaluateStrict(target);
    } catch {
      return deepFreeze({
        disposition: 'deny' as const,
        reasonCode: 'role_alignment_control_unavailable',
      });
    }
  }

  async getState(sessionId: string): Promise<RoleAlignmentStateV1 | undefined> {
    assertIdentifier(sessionId, 'sessionId');
    const state = await this.stateStore.load(sessionId);
    if (state === undefined) return undefined;
    assertRoleAlignmentStateV1(
      state,
      this.policy,
      this.stateBinding(sessionId)
    );
    return state;
  }

  async resumeSession(input: {
    readonly sessionId: string;
    readonly expectedRevision: number;
    readonly logicalTimeMs: number;
    readonly reasonCode: string;
  }): Promise<RoleAlignmentStateV1> {
    const state = await this.requireState(input.sessionId);
    const next = resumeRoleAlignmentStateV1(state, input, this.policy);
    await this.stateStore.save(next, state.revision);
    return next;
  }

  async activateSessionRole(input: {
    readonly sessionId: string;
    readonly expectedRevision: number;
    readonly tenantId: string;
    readonly agentId: string;
    readonly role: PortableAgentRoleBindingV1;
    readonly logicalTimeMs: number;
  }): Promise<RoleAlignmentStateV1> {
    const state = await this.requireState(input.sessionId);
    assertSafeInteger(input.expectedRevision, 'expectedRevision');
    if (state.revision !== input.expectedRevision)
      throw new RoleAlignmentStoreConflictErrorV1();
    assertIdentifier(input.tenantId, 'tenantId');
    assertIdentifier(input.agentId, 'agentId');
    const role = normalizeRoleBindingV1(input.role);
    const anchor = anchorFor({
      tenantId: input.tenantId,
      sessionId: input.sessionId,
      agentId: input.agentId,
      role,
    });
    if (anchor.anchorDigest === state.roleAnchor.anchorDigest) return state;
    const next = replaceRoleAlignmentRoleV1(
      state,
      {
        expectedRevision: state.revision,
        roleAnchor: anchor,
        logicalTimeMs: input.logicalTimeMs,
      },
      this.policy
    );
    await this.stateStore.save(next, state.revision);
    return next;
  }

  async closeSession(input: {
    readonly sessionId: string;
    readonly expectedRevision: number;
    readonly logicalTimeMs: number;
    readonly reasonCode: string;
  }): Promise<RoleAlignmentStateV1> {
    const state = await this.requireState(input.sessionId);
    const next = closeRoleAlignmentStateV1(state, input, this.policy);
    if (next !== state) await this.stateStore.save(next, state.revision);
    return next;
  }

  async exportHandoff(input: {
    readonly sessionId: string;
    readonly checkpointTransfer: PortableAgentCheckpointTransferV1;
    readonly logicalTimeMs: number;
  }): Promise<RoleAlignmentHandoffEnvelopeV1> {
    const state = await this.requireState(input.sessionId);
    const transfer = normalizeCheckpointTransferV1(input.checkpointTransfer, {
      maximumStateBytes: this.policy.limits.maximumStateBytes,
    });
    assertSafeInteger(input.logicalTimeMs, 'logicalTimeMs');
    if (
      input.logicalTimeMs < state.lastLogicalTimeMs ||
      transfer.sourceSessionId !== state.sessionId ||
      transfer.sourceAgentId !== state.agentId ||
      transfer.objectiveId !== state.objectiveId ||
      transfer.roleBindingId !== state.roleAnchor.roleBindingId
    )
      throw new TypeError('role_alignment_handoff_binding_invalid');
    const checkpointTransferDigest = digestRoleAlignmentJsonV1(
      'handoff',
      transfer as unknown as JsonValue
    );
    const withoutDigest = {
      schemaVersion: 1 as const,
      contentClass: 'role_alignment_state' as const,
      controllerId: this.controlId,
      controllerVersion: this.controlVersion,
      implementationId: this.implementationId,
      policyDigest: this.binding.policyDigest,
      sourceSessionId: state.sessionId,
      sourceAgentId: state.agentId,
      sourceRoleAnchorDigest: state.roleAnchor.anchorDigest,
      checkpointTransferDigest,
      sourceState: state,
      exportedAtLogicalMs: input.logicalTimeMs,
    };
    return deepFreeze({
      ...withoutDigest,
      handoffDigest: digestRoleAlignmentJsonV1(
        'handoff',
        withoutDigest as unknown as JsonValue
      ),
    });
  }

  async importHandoff(input: {
    readonly handoff: RoleAlignmentHandoffEnvelopeV1;
    readonly checkpointTransfer: PortableAgentCheckpointTransferV1;
    readonly targetSessionId: string;
    readonly targetAgentId: string;
    readonly targetRole: PortableAgentRoleBindingV1;
    readonly logicalTimeMs: number;
  }): Promise<RoleAlignmentStateV1> {
    const transfer = normalizeCheckpointTransferV1(input.checkpointTransfer, {
      maximumStateBytes: this.policy.limits.maximumStateBytes,
    });
    const handoff = this.validateHandoff(input.handoff, transfer);
    assertIdentifier(input.targetSessionId, 'targetSessionId');
    assertIdentifier(input.targetAgentId, 'targetAgentId');
    assertSafeInteger(input.logicalTimeMs, 'logicalTimeMs');
    if (input.logicalTimeMs < handoff.exportedAtLogicalMs)
      throw new TypeError('role_alignment_clock_rollback');
    const role = normalizeRoleBindingV1(input.targetRole);
    if (role.objectiveId !== transfer.objectiveId)
      throw new TypeError('role_alignment_handoff_objective_mismatch');
    const targetAnchor = anchorFor({
      tenantId: handoff.sourceState.tenantId,
      sessionId: input.targetSessionId,
      agentId: input.targetAgentId,
      role,
    });
    const rebound = rebindRoleAlignmentSessionV1(
      handoff.sourceState,
      {
        expectedRevision: handoff.sourceState.revision,
        targetRoleAnchor: targetAnchor,
        transferDigest: handoff.checkpointTransferDigest,
        logicalTimeMs: input.logicalTimeMs,
      },
      this.policy
    );
    await this.stateStore.save(rebound, null);
    return rebound;
  }

  private async evaluateStrict(
    target: PortableAgentControlRequestV1
  ): Promise<PortableAgentControlDecisionV1> {
    validateControlTarget(target);
    const logicalTimeMs = target.request.logicalTimeMs;
    const role = normalizeRoleBindingV1(target.role);
    const requestedAnchor = anchorFor({
      tenantId: target.tenantId,
      sessionId: target.sessionId,
      agentId: target.agentId,
      role,
    });
    let state = await this.stateStore.load(target.sessionId);
    if (state === undefined) {
      const created = createRoleAlignmentStateV1({
        controllerId: this.controlId,
        controllerVersion: this.controlVersion,
        implementationId: this.implementationId,
        policy: this.policy,
        roleAnchor: requestedAnchor,
        createdAtLogicalMs: logicalTimeMs,
      });
      await this.stateStore.save(created, null);
      state = created;
    } else {
      assertRoleAlignmentStateV1(
        state,
        this.policy,
        this.stateBinding(target.sessionId)
      );
      if (
        state.tenantId !== target.tenantId ||
        state.agentId !== target.agentId ||
        state.objectiveId !== role.objectiveId
      )
        throw new TypeError('role_alignment_target_binding_mismatch');
      if (state.roleAnchor.anchorDigest !== requestedAnchor.anchorDigest) {
        const replaced = replaceRoleAlignmentRoleV1(
          state,
          {
            expectedRevision: state.revision,
            roleAnchor: requestedAnchor,
            logicalTimeMs,
          },
          this.policy
        );
        await this.stateStore.save(replaced, state.revision);
        state = replaced;
      }
    }
    if (state.status !== 'active')
      return portableDecision(decisionForInactiveRoleAlignmentStateV1(state));

    const targetDigest = digestRoleAlignmentJsonV1(
      'target',
      target as unknown as JsonValue
    );
    const retained = findRoleAlignmentDecisionV1(state, targetDigest);
    if (retained !== undefined) return portableDecision(retained);
    const assessmentRequest = this.createAssessmentRequest(
      state,
      target,
      targetDigest
    );
    const assessment = validateAssessment(
      await this.assessor.assess(assessmentRequest, target),
      assessmentRequest,
      this.assessorBinding
    );
    const signal = assessmentToSignal(
      assessment,
      assessmentRequest,
      state.roleAnchor
    );
    const reduced = observeRoleAlignmentSignalV1(
      state,
      { expectedRevision: state.revision, signal },
      this.policy
    );
    await this.stateStore.save(reduced.state, state.revision);
    if (this.decisionObserver !== undefined) {
      try {
        await this.decisionObserver.observe(reduced);
      } catch {
        // Evidence sinks are deliberately outside the enforcement decision.
      }
    }
    return portableDecision(reduced.decision);
  }

  private createAssessmentRequest(
    state: RoleAlignmentStateV1,
    target: PortableAgentControlRequestV1,
    targetDigest: string
  ): RoleAlignmentAssessmentRequestV1 {
    const createdAtLogicalMs = target.request.logicalTimeMs;
    return deepFreeze({
      schemaVersion: 1,
      assessmentRequestId: `role-alignment:${state.sessionId}:${state.revision + 1}`,
      targetDigest,
      controllerId: this.controlId,
      controllerVersion: this.controlVersion,
      implementationId: this.implementationId,
      policyId: this.binding.policyId,
      policyVersion: this.binding.policyVersion,
      policyDigest: this.binding.policyDigest,
      tenantId: state.tenantId,
      sessionId: state.sessionId,
      agentId: state.agentId,
      stepId: target.request.stepId,
      checkpoint: target.checkpoint,
      roleAnchorDigest: state.roleAnchor.anchorDigest,
      roleRevision: state.roleAnchor.roleRevision,
      stateRevision: state.revision,
      previousRollingCoherenceBps: state.rollingCoherenceBps,
      previousDegraded: state.degraded,
      createdAtLogicalMs,
      expiresAtLogicalMs: createdAtLogicalMs + this.assessmentTtlMs,
    });
  }

  private validateHandoff(
    input: RoleAlignmentHandoffEnvelopeV1,
    transfer: PortableAgentCheckpointTransferV1
  ): RoleAlignmentHandoffEnvelopeV1 {
    assertExactKeys(
      input,
      [
        'schemaVersion',
        'contentClass',
        'controllerId',
        'controllerVersion',
        'implementationId',
        'policyDigest',
        'sourceSessionId',
        'sourceAgentId',
        'sourceRoleAnchorDigest',
        'checkpointTransferDigest',
        'sourceState',
        'exportedAtLogicalMs',
        'handoffDigest',
      ],
      'role alignment handoff'
    );
    if (
      input.schemaVersion !== 1 ||
      input.contentClass !== 'role_alignment_state'
    )
      throw new TypeError('role_alignment_handoff_invalid');
    for (const [label, value] of [
      ['controllerId', input.controllerId],
      ['implementationId', input.implementationId],
      ['sourceSessionId', input.sourceSessionId],
      ['sourceAgentId', input.sourceAgentId],
    ] as const)
      assertIdentifier(value, label);
    assertSafeInteger(input.controllerVersion, 'controllerVersion', 1);
    for (const [label, value] of [
      ['policyDigest', input.policyDigest],
      ['sourceRoleAnchorDigest', input.sourceRoleAnchorDigest],
      ['checkpointTransferDigest', input.checkpointTransferDigest],
      ['handoffDigest', input.handoffDigest],
    ] as const)
      assertDigest(value, label);
    assertSafeInteger(input.exportedAtLogicalMs, 'exportedAtLogicalMs');
    assertRoleAlignmentStateV1(
      input.sourceState,
      this.policy,
      this.stateBinding(input.sourceSessionId)
    );
    const { handoffDigest: _ignored, ...withoutDigest } = input;
    if (
      digestRoleAlignmentJsonV1(
        'handoff',
        withoutDigest as unknown as JsonValue
      ) !== input.handoffDigest ||
      input.controllerId !== this.controlId ||
      input.controllerVersion !== this.controlVersion ||
      input.implementationId !== this.implementationId ||
      input.policyDigest !== this.binding.policyDigest ||
      input.sourceSessionId !== input.sourceState.sessionId ||
      input.sourceAgentId !== input.sourceState.agentId ||
      input.sourceRoleAnchorDigest !==
        input.sourceState.roleAnchor.anchorDigest ||
      input.checkpointTransferDigest !==
        digestRoleAlignmentJsonV1(
          'handoff',
          transfer as unknown as JsonValue
        ) ||
      transfer.sourceSessionId !== input.sourceSessionId ||
      transfer.sourceAgentId !== input.sourceAgentId ||
      transfer.roleBindingId !== input.sourceState.roleAnchor.roleBindingId
    )
      throw new TypeError('role_alignment_handoff_binding_invalid');
    return input;
  }

  private async requireState(sessionId: string): Promise<RoleAlignmentStateV1> {
    const state = await this.getState(sessionId);
    if (state === undefined)
      throw new TypeError('role_alignment_state_not_found');
    return state;
  }

  private stateBinding(sessionId: string) {
    return {
      controllerId: this.controlId,
      controllerVersion: this.controlVersion,
      implementationId: this.implementationId,
      sessionId,
    };
  }
}

function validateAssessorBinding(
  input: RoleAlignmentAssessorBindingV1
): RoleAlignmentAssessorBindingV1 {
  assertExactKeys(
    input,
    ['schemaVersion', 'assessorId', 'assessorVersion', 'assessorBindingDigest'],
    'role alignment assessor binding'
  );
  if (input.schemaVersion !== 1)
    throw new TypeError('role_alignment_assessor_binding_invalid');
  assertIdentifier(input.assessorId, 'assessorId');
  assertSafeInteger(input.assessorVersion, 'assessorVersion', 1);
  assertDigest(input.assessorBindingDigest, 'assessorBindingDigest');
  return deepFreeze({ ...input });
}

function validateAssessment(
  input: RoleAlignmentAssessmentV1,
  request: RoleAlignmentAssessmentRequestV1,
  binding: RoleAlignmentAssessorBindingV1
): RoleAlignmentAssessmentV1 {
  assertExactKeys(
    input,
    [
      'schemaVersion',
      'assessmentId',
      'assessmentRequestId',
      'targetDigest',
      'assessorId',
      'assessorVersion',
      'assessorBindingDigest',
      'coherenceBps',
      'uncertaintyBps',
      'contextInconsistencyBps',
      'hardViolation',
      'reasonCodes',
      'evidenceReferenceIds',
      'assessedAtLogicalMs',
    ],
    'role alignment assessment'
  );
  if (input.schemaVersion !== 1)
    throw new TypeError('role_alignment_assessment_invalid');
  assertIdentifier(input.assessmentId, 'assessmentId');
  assertIdentifier(input.assessmentRequestId, 'assessmentRequestId');
  assertDigest(input.targetDigest, 'targetDigest');
  assertIdentifier(input.assessorId, 'assessorId');
  assertSafeInteger(input.assessorVersion, 'assessorVersion', 1);
  assertDigest(input.assessorBindingDigest, 'assessorBindingDigest');
  for (const [label, value] of [
    ['coherenceBps', input.coherenceBps],
    ['uncertaintyBps', input.uncertaintyBps],
    ['contextInconsistencyBps', input.contextInconsistencyBps],
  ] as const) {
    assertSafeInteger(value, label);
    if (value > 10_000)
      throw new TypeError('role_alignment_assessment_score_invalid');
  }
  if (
    typeof input.hardViolation !== 'boolean' ||
    !Array.isArray(input.reasonCodes) ||
    !Array.isArray(input.evidenceReferenceIds)
  )
    throw new TypeError('role_alignment_assessment_invalid');
  for (const value of [...input.reasonCodes, ...input.evidenceReferenceIds])
    assertIdentifier(value, 'assessment reference');
  if (
    input.reasonCodes.some(
      (value, index) => index > 0 && input.reasonCodes[index - 1] >= value
    ) ||
    input.evidenceReferenceIds.some(
      (value, index) =>
        index > 0 && input.evidenceReferenceIds[index - 1] >= value
    )
  )
    throw new TypeError('role_alignment_assessment_references_invalid');
  assertSafeInteger(input.assessedAtLogicalMs, 'assessedAtLogicalMs');
  if (
    input.assessmentRequestId !== request.assessmentRequestId ||
    input.targetDigest !== request.targetDigest ||
    input.assessorId !== binding.assessorId ||
    input.assessorVersion !== binding.assessorVersion ||
    input.assessorBindingDigest !== binding.assessorBindingDigest ||
    input.assessedAtLogicalMs < request.createdAtLogicalMs ||
    input.assessedAtLogicalMs >= request.expiresAtLogicalMs
  )
    throw new TypeError('role_alignment_assessment_binding_invalid');
  return deepFreeze({ ...input });
}

function assessmentToSignal(
  assessment: RoleAlignmentAssessmentV1,
  request: RoleAlignmentAssessmentRequestV1,
  roleAnchor: RoleAlignmentRoleAnchorV1
): RoleAlignmentSignalV1 {
  return deepFreeze({
    schemaVersion: 1,
    signalId: assessment.assessmentId,
    assessmentRequestId: assessment.assessmentRequestId,
    assessorId: assessment.assessorId,
    assessorVersion: assessment.assessorVersion,
    assessorBindingDigest: assessment.assessorBindingDigest,
    tenantId: request.tenantId,
    sessionId: request.sessionId,
    agentId: request.agentId,
    stepId: request.stepId,
    checkpoint: request.checkpoint,
    roleAnchorDigest: roleAnchor.anchorDigest,
    roleRevision: roleAnchor.roleRevision,
    targetDigest: request.targetDigest,
    coherenceBps: assessment.coherenceBps,
    uncertaintyBps: assessment.uncertaintyBps,
    contextInconsistencyBps: assessment.contextInconsistencyBps,
    hardViolation: assessment.hardViolation,
    reasonCodes: [...assessment.reasonCodes],
    evidenceReferenceIds: [...assessment.evidenceReferenceIds],
    observedAtLogicalMs: assessment.assessedAtLogicalMs,
    expiresAtLogicalMs: request.expiresAtLogicalMs,
  });
}

function anchorFor(input: {
  readonly tenantId: string;
  readonly sessionId: string;
  readonly agentId: string;
  readonly role: PortableAgentRoleBindingV1;
}): RoleAlignmentRoleAnchorV1 {
  return createRoleAlignmentRoleAnchorV1({
    tenantId: input.tenantId,
    sessionId: input.sessionId,
    agentId: input.agentId,
    objectiveId: input.role.objectiveId,
    roleBindingId: input.role.roleBindingId,
    roleRevision: input.role.roleRevision,
    predecessorRoleBindingId: input.role.predecessorRoleBindingId,
    roleKey: input.role.roleKey,
    roleContent: {
      instructions: [...input.role.instructions],
      constraints: input.role.constraints,
      validFromLogicalMs: input.role.validFromLogicalMs,
      validUntilLogicalMs: input.role.validUntilLogicalMs,
    },
  });
}

function validateControlTarget(target: PortableAgentControlRequestV1): void {
  if (!target || typeof target !== 'object' || target.schemaVersion !== 1)
    throw new TypeError('role_alignment_target_invalid');
  for (const [label, value] of [
    ['sessionId', target.sessionId],
    ['tenantId', target.tenantId],
    ['agentId', target.agentId],
    ['stepId', target.request?.stepId],
  ] as const)
    assertIdentifier(value, label);
  if (!['pre_step', 'post_output', 'pre_action'].includes(target.checkpoint))
    throw new TypeError('role_alignment_checkpoint_invalid');
  assertSafeInteger(target.request.logicalTimeMs, 'logicalTimeMs');
  normalizeRoleBindingV1(target.role);
}

function portableDecision(
  decision: RoleAlignmentDecisionV1
): PortableAgentControlDecisionV1 {
  return deepFreeze({
    disposition: decision.disposition,
    reasonCode: decision.reasonCode,
  });
}
