import type { JsonValue } from "@agentplat/core";
import {
  normalizeCheckpointTransferV1,
  normalizeRoleBindingV1,
  type PortableAgentCheckpointTransferV1,
  type PortableAgentRoleBindingV1,
  type PortableAgentSessionSnapshotV1,
} from "@agentplat/runtime/adapter";
import {
  digestTrustEligibilityDecisionV1,
  validateTrustEligibilityDecisionV1,
  type TrustEligibilityDecisionV1,
} from "@agentplat/trust";

import {
  assertRoleAlignmentStateV1,
  createRoleAlignmentPolicyRecordV1,
  createRoleAlignmentRoleAnchorV1,
  type RoleAlignmentPolicyV1,
  type RoleAlignmentStateV1,
} from "./role-alignment.js";
import type { RoleAlignmentPortableAgentControlV1 } from "./role-alignment-portable-agent.js";
import {
  admitRoleCandidateV1,
  assertTrustedRoleDefinitionWithinAuthorityCeilingV1,
  assertRoleRealignmentStateV1,
  beginRoleRealignmentActivationV1,
  certifyRoleRealignmentSelectionV1,
  completeRoleRealignmentActivationV1,
  createRoleCandidateEvaluationV1,
  createRoleRealignmentPolicyRecordV1,
  createRoleRealignmentRequestV1,
  createRoleRealignmentStateV1,
  digestRoleRealignmentJsonV1,
  expireRoleRealignmentV1,
  recordRoleCandidateEvaluationV1,
  rebindRoleRealignmentSessionV1,
  selectRoleCandidateV1,
  validateTrustedRoleDefinitionV1,
  type AdmittedRoleCandidateV1,
  type RoleAuthorityCeilingV1,
  type RoleCandidateProposalV1,
  type RoleRealignmentCertificationPortV1,
  type RoleRealignmentPolicyV1,
  type RoleRealignmentRequestV1,
  type RoleRealignmentStateV1,
  type RoleRealignmentTransitionV1,
  type TrustedRoleDefinitionV1,
} from "./role-realignment.js";
import {
  assertDigest,
  assertExactKeys,
  assertIdentifier,
  assertSafeInteger,
  deepFreeze,
} from "./validation.js";

export interface RoleDiscoveryStrategyV1 {
  readonly proposerId: string;
  readonly proposerVersion: number;
  readonly proposerBindingDigest: string;
  propose(input: {
    readonly request: RoleRealignmentRequestV1;
    readonly logicalTimeMs: number;
    readonly signal?: AbortSignal;
  }):
    | Promise<readonly RoleCandidateProposalV1[]>
    | readonly RoleCandidateProposalV1[];
}

export interface TrustedRoleCatalogPortV1 {
  resolve(input: {
    readonly catalogId?: string;
    readonly definitionId: string;
    readonly definitionRevision: number;
    readonly definitionDigest: string;
    readonly logicalTimeMs: number;
  }): Promise<TrustedRoleDefinitionV1 | null> | TrustedRoleDefinitionV1 | null;
}

export interface RoleCandidateEvaluationResultV1 {
  readonly eligible: boolean;
  readonly roleFitBps: number;
  readonly missionContributionBps: number;
  readonly uncertaintyBps: number;
  readonly transitionRiskBps: number;
  readonly reasonCodes: readonly string[];
  readonly evidenceReferenceIds: readonly string[];
}

export interface RoleCandidateEvaluatorPortV1 {
  readonly evaluatorId: string;
  readonly evaluatorVersion: number;
  readonly evaluatorBindingDigest: string;
  evaluate(input: {
    readonly request: RoleRealignmentRequestV1;
    readonly candidate: AdmittedRoleCandidateV1;
    readonly definition: TrustedRoleDefinitionV1;
    readonly logicalTimeMs: number;
    readonly signal?: AbortSignal;
  }):
    Promise<RoleCandidateEvaluationResultV1> | RoleCandidateEvaluationResultV1;
}

export interface RoleRealignmentTrustEligibilityPortV1 {
  evaluate(input: {
    readonly tenantId: string;
    readonly subjectKind: "proposer" | "evaluator";
    readonly subjectId: string;
    readonly subjectBindingDigest: string;
    readonly requestDigest: string;
    readonly candidateDigest: string | null;
    readonly logicalTimeMs: number;
  }):
    | Promise<TrustEligibilityDecisionV1 | null>
    | TrustEligibilityDecisionV1
    | null;
}

export interface RoleRealignmentSessionRuntimePortV1 {
  getSession(
    sessionId: string,
  ): Promise<PortableAgentSessionSnapshotV1 | undefined>;
  updateRole(
    sessionId: string,
    role: PortableAgentRoleBindingV1,
    expectedRevision: number,
  ): Promise<PortableAgentSessionSnapshotV1>;
}

export interface RoleRealignmentObserverV1 {
  observe(input: {
    readonly activeSessionId: string;
    readonly status: RoleRealignmentStateV1["status"];
    readonly revision: number;
    readonly stateDigest: string;
    readonly event: RoleRealignmentTransitionV1["event"];
  }): Promise<void> | void;
}

/** Atomic revision-checked persistence boundary, including session moves. */
export interface RoleRealignmentStateStoreV1 {
  load(sessionId: string): Promise<RoleRealignmentStateV1 | undefined>;
  save(
    state: RoleRealignmentStateV1,
    expectedRevision: number | null,
  ): Promise<void>;
  rebind(input: {
    readonly sourceSessionId: string;
    readonly targetState: RoleRealignmentStateV1;
    readonly expectedSourceRevision: number;
  }): Promise<void>;
}

export class RoleRealignmentStoreConflictErrorV1 extends Error {
  readonly name = "RoleRealignmentStoreConflictErrorV1";

  constructor(message = "role realignment state revision conflict") {
    super(message);
  }
}

export class InMemoryRoleRealignmentStateStoreV1 implements RoleRealignmentStateStoreV1 {
  private readonly states = new Map<string, RoleRealignmentStateV1>();

  async load(sessionId: string): Promise<RoleRealignmentStateV1 | undefined> {
    assertIdentifier(sessionId, "sessionId");
    return this.states.get(sessionId);
  }

  async save(
    state: RoleRealignmentStateV1,
    expectedRevision: number | null,
  ): Promise<void> {
    const current = this.states.get(state.activeSessionId);
    if (
      (expectedRevision === null && current !== undefined) ||
      (expectedRevision !== null && current?.revision !== expectedRevision)
    )
      throw new RoleRealignmentStoreConflictErrorV1();
    this.states.set(state.activeSessionId, state);
  }

  async rebind(input: {
    readonly sourceSessionId: string;
    readonly targetState: RoleRealignmentStateV1;
    readonly expectedSourceRevision: number;
  }): Promise<void> {
    const source = this.states.get(input.sourceSessionId);
    if (
      source?.revision !== input.expectedSourceRevision ||
      this.states.has(input.targetState.activeSessionId) ||
      input.sourceSessionId === input.targetState.activeSessionId
    )
      throw new RoleRealignmentStoreConflictErrorV1();
    this.states.delete(input.sourceSessionId);
    this.states.set(input.targetState.activeSessionId, input.targetState);
  }
}

export interface RoleRealignmentHandoffEnvelopeV1 {
  readonly schemaVersion: 1;
  readonly contentClass: "role_realignment_state";
  readonly controllerId: string;
  readonly controllerVersion: number;
  readonly implementationId: string;
  readonly policyDigest: string;
  readonly sourceSessionId: string;
  readonly sourceAgentId: string;
  readonly sourceRoleAnchorDigest: string;
  readonly checkpointTransferDigest: string;
  readonly sourceState: RoleRealignmentStateV1;
  readonly exportedAtLogicalMs: number;
  readonly handoffDigest: string;
}

export interface CreateRoleRealignmentPortableAgentV1 {
  readonly controllerId: string;
  readonly controllerVersion: number;
  readonly implementationId: string;
  readonly policy: RoleRealignmentPolicyV1;
  readonly alignmentPolicy: RoleAlignmentPolicyV1;
  readonly alignment: RoleAlignmentPortableAgentControlV1;
  readonly runtime: RoleRealignmentSessionRuntimePortV1;
  readonly discovery: readonly RoleDiscoveryStrategyV1[];
  readonly catalog: TrustedRoleCatalogPortV1;
  readonly evaluators: readonly RoleCandidateEvaluatorPortV1[];
  readonly trustEligibility: RoleRealignmentTrustEligibilityPortV1;
  readonly certification: RoleRealignmentCertificationPortV1;
  readonly requestTtlMs: number;
  readonly evaluationTtlMs: number;
  readonly certificationTtlMs: number;
  readonly stateStore?: RoleRealignmentStateStoreV1;
  /** Best-effort content-free observation after durable enforcement state. */
  readonly observer?: RoleRealignmentObserverV1;
}

export interface RunRoleRealignmentInputV1 {
  readonly sessionId: string;
  readonly requestId: string;
  readonly selectionId: string;
  readonly activationId: string;
  readonly authorityCeiling: RoleAuthorityCeilingV1;
  readonly logicalTimeMs: number;
  readonly signal?: AbortSignal;
}

export interface RoleRealignmentPortableAgentV1 {
  readonly binding: Readonly<{
    readonly controllerId: string;
    readonly controllerVersion: number;
    readonly implementationId: string;
    readonly policyId: string;
    readonly policyVersion: number;
    readonly policyDigest: string;
    readonly alignmentPolicyDigest: string;
  }>;
  getState(sessionId: string): Promise<RoleRealignmentStateV1 | undefined>;
  run(input: RunRoleRealignmentInputV1): Promise<RoleRealignmentStateV1>;
  exportHandoff(input: {
    readonly sessionId: string;
    readonly checkpointTransfer: PortableAgentCheckpointTransferV1;
    readonly logicalTimeMs: number;
  }): Promise<RoleRealignmentHandoffEnvelopeV1>;
  importHandoff(input: {
    readonly handoff: RoleRealignmentHandoffEnvelopeV1;
    readonly checkpointTransfer: PortableAgentCheckpointTransferV1;
    readonly targetAlignmentState: RoleAlignmentStateV1;
    readonly logicalTimeMs: number;
  }): Promise<RoleRealignmentStateV1>;
}

export function createRoleRealignmentPortableAgentV1(
  options: CreateRoleRealignmentPortableAgentV1,
): RoleRealignmentPortableAgentV1 {
  return new RoleRealignmentPortableAgent(options);
}

class RoleRealignmentPortableAgent implements RoleRealignmentPortableAgentV1 {
  readonly binding: RoleRealignmentPortableAgentV1["binding"];

  private readonly options: CreateRoleRealignmentPortableAgentV1;
  private readonly policy: RoleRealignmentPolicyV1;
  private readonly alignmentPolicy: RoleAlignmentPolicyV1;
  private readonly stateStore: RoleRealignmentStateStoreV1;

  constructor(options: CreateRoleRealignmentPortableAgentV1) {
    validatePortableOptions(options);
    const policyRecord = createRoleRealignmentPolicyRecordV1(options.policy);
    const alignmentPolicyRecord = createRoleAlignmentPolicyRecordV1(
      options.alignmentPolicy,
    );
    this.options = options;
    this.policy = policyRecord.policy;
    this.alignmentPolicy = alignmentPolicyRecord.policy;
    this.stateStore =
      options.stateStore ?? new InMemoryRoleRealignmentStateStoreV1();
    this.binding = deepFreeze({
      controllerId: options.controllerId,
      controllerVersion: options.controllerVersion,
      implementationId: options.implementationId,
      policyId: policyRecord.policy.policyId,
      policyVersion: policyRecord.policy.policyVersion,
      policyDigest: policyRecord.policyDigest,
      alignmentPolicyDigest: alignmentPolicyRecord.policyDigest,
    });
  }

  async getState(
    sessionId: string,
  ): Promise<RoleRealignmentStateV1 | undefined> {
    assertIdentifier(sessionId, "sessionId");
    const state = await this.stateStore.load(sessionId);
    if (!state) return undefined;
    assertRoleRealignmentStateV1(state, this.policy, {
      controllerId: this.binding.controllerId,
      controllerVersion: this.binding.controllerVersion,
      implementationId: this.binding.implementationId,
      activeSessionId: sessionId,
    });
    return state;
  }

  async run(input: RunRoleRealignmentInputV1): Promise<RoleRealignmentStateV1> {
    validateRunInput(input);
    let state = await this.getState(input.sessionId);
    if (!state) state = await this.start(input);
    if (state.status === "expired" || state.status === "failed") return state;
    if (input.logicalTimeMs >= state.request.expiresAtLogicalMs) {
      const expired = expireRoleRealignmentV1(
        state,
        {
          expectedRevision: state.revision,
          logicalTimeMs: input.logicalTimeMs,
        },
        this.policy,
      );
      await this.persistTransition(state, expired);
      return expired.state;
    }
    if (state.status === "requested" || state.status === "collecting")
      state = await this.discoverAndEvaluate(state, input);
    if (state.status === "collecting") {
      const selected = selectRoleCandidateV1(
        state,
        {
          expectedRevision: state.revision,
          selectionId: input.selectionId,
          logicalTimeMs: input.logicalTimeMs,
        },
        this.policy,
      );
      await this.persistTransition(state, selected);
      state = selected.state;
    }
    if (state.status === "selected") {
      const certificate = await this.options.certification.certify({
        state,
        policy: this.policy,
        logicalTimeMs: input.logicalTimeMs,
        expiresAtLogicalMs: Math.min(
          state.request.expiresAtLogicalMs,
          input.logicalTimeMs + this.options.certificationTtlMs,
        ),
        signal: input.signal,
      });
      if (!certificate) return state;
      const certified = certifyRoleRealignmentSelectionV1(
        state,
        {
          expectedRevision: state.revision,
          certificate,
          logicalTimeMs: input.logicalTimeMs,
        },
        this.policy,
      );
      await this.persistTransition(state, certified);
      state = certified.state;
    }
    if (state.status === "certified") {
      const selection = state.selection;
      if (!selection)
        throw new TypeError("role_realignment_selection_required");
      const selectedCandidate = state.candidates.find(
        ({ candidateDigest }) =>
          candidateDigest === selection.selectedCandidateDigest,
      );
      if (!selectedCandidate)
        throw new TypeError("role_realignment_selected_candidate_missing");
      const definition = await this.resolveCandidateDefinition(
        selectedCandidate,
        input.logicalTimeMs,
        state.request.authorityCeiling,
      );
      const activating = beginRoleRealignmentActivationV1(
        state,
        {
          expectedRevision: state.revision,
          activationId: input.activationId,
          definition,
          logicalTimeMs: input.logicalTimeMs,
        },
        this.policy,
      );
      await this.persistTransition(state, activating);
      state = activating.state;
    }
    if (state.status === "activating")
      state = await this.resumeActivation(state, input.logicalTimeMs);
    return state;
  }

  async exportHandoff(input: {
    readonly sessionId: string;
    readonly checkpointTransfer: PortableAgentCheckpointTransferV1;
    readonly logicalTimeMs: number;
  }): Promise<RoleRealignmentHandoffEnvelopeV1> {
    const state = await this.requireState(input.sessionId);
    const transfer = normalizeCheckpointTransferV1(input.checkpointTransfer, {
      maximumStateBytes: this.policy.limits.maximumStateBytes,
    });
    assertSafeInteger(input.logicalTimeMs, "logicalTimeMs");
    if (
      input.logicalTimeMs < state.lastLogicalTimeMs ||
      transfer.sourceSessionId !== state.activeSessionId ||
      transfer.sourceAgentId !== state.activeAgentId ||
      transfer.objectiveId !== state.objectiveId ||
      transfer.roleBindingId !==
        (state.status === "activated"
          ? state.activation!.roleBinding.roleBindingId
          : state.request.currentRoleBindingId)
    )
      throw new TypeError("role_realignment_handoff_binding_invalid");
    const checkpointTransferDigest = digestRoleRealignmentJsonV1(
      "handoff",
      transfer as unknown as JsonValue,
    );
    const body = {
      schemaVersion: 1 as const,
      contentClass: "role_realignment_state" as const,
      controllerId: this.binding.controllerId,
      controllerVersion: this.binding.controllerVersion,
      implementationId: this.binding.implementationId,
      policyDigest: this.binding.policyDigest,
      sourceSessionId: state.activeSessionId,
      sourceAgentId: state.activeAgentId,
      sourceRoleAnchorDigest: state.activeRoleAnchorDigest,
      checkpointTransferDigest,
      sourceState: state,
      exportedAtLogicalMs: input.logicalTimeMs,
    };
    return deepFreeze({
      ...body,
      handoffDigest: digestRoleRealignmentJsonV1(
        "handoff",
        body as unknown as JsonValue,
      ),
    });
  }

  async importHandoff(input: {
    readonly handoff: RoleRealignmentHandoffEnvelopeV1;
    readonly checkpointTransfer: PortableAgentCheckpointTransferV1;
    readonly targetAlignmentState: RoleAlignmentStateV1;
    readonly logicalTimeMs: number;
  }): Promise<RoleRealignmentStateV1> {
    const transfer = normalizeCheckpointTransferV1(input.checkpointTransfer, {
      maximumStateBytes: this.policy.limits.maximumStateBytes,
    });
    const handoff = this.validateHandoff(input.handoff, transfer);
    for (const candidate of handoff.sourceState.candidates)
      await this.resolveCandidateDefinition(
        candidate,
        input.logicalTimeMs,
        handoff.sourceState.request.authorityCeiling,
      );
    if (handoff.sourceState.activation)
      await this.validateLocalDefinition(
        handoff.sourceState.activation.definition,
        input.logicalTimeMs,
        handoff.sourceState.request.authorityCeiling,
      );
    const target = input.targetAlignmentState;
    assertRoleAlignmentStateV1(target, this.alignmentPolicy, {
      sessionId: target.sessionId,
    });
    assertSafeInteger(input.logicalTimeMs, "logicalTimeMs");
    if (
      input.logicalTimeMs < handoff.exportedAtLogicalMs ||
      target.tenantId !== handoff.sourceState.tenantId ||
      target.objectiveId !== handoff.sourceState.objectiveId ||
      target.sessionId === handoff.sourceSessionId ||
      transfer.sourceSessionId !== handoff.sourceSessionId
    )
      throw new TypeError("role_realignment_handoff_binding_invalid");
    const activated = handoff.sourceState.status === "activated";
    const expectedRole = activated
      ? handoff.sourceState.activation!.roleBinding
      : null;
    if (
      (activated &&
        (target.roleAnchor.roleBindingId !== expectedRole!.roleBindingId ||
          target.roleAnchor.roleRevision !== expectedRole!.roleRevision)) ||
      (!activated &&
        (target.roleAnchor.roleBindingId !==
          handoff.sourceState.request.currentRoleBindingId ||
          target.roleAnchor.roleRevision !==
            handoff.sourceState.request.currentRoleRevision ||
          target.roleAnchor.roleContentDigest !==
            handoff.sourceState.request.currentRoleContentDigest))
    )
      throw new TypeError("role_realignment_handoff_role_mismatch");
    const rebound = rebindRoleRealignmentSessionV1(
      handoff.sourceState,
      {
        expectedRevision: handoff.sourceState.revision,
        targetSessionId: target.sessionId,
        targetAgentId: target.agentId,
        targetRoleAnchorDigest: target.roleAnchor.anchorDigest,
        transferDigest: handoff.checkpointTransferDigest,
        logicalTimeMs: input.logicalTimeMs,
      },
      this.policy,
    );
    await this.stateStore.rebind({
      sourceSessionId: handoff.sourceSessionId,
      targetState: rebound.state,
      expectedSourceRevision: handoff.sourceState.revision,
    });
    await this.observe(rebound);
    return rebound.state;
  }

  private async start(
    input: RunRoleRealignmentInputV1,
  ): Promise<RoleRealignmentStateV1> {
    const alignment = await this.options.alignment.getState(input.sessionId);
    if (!alignment) throw new TypeError("role_alignment_state_unavailable");
    const request = createRoleRealignmentRequestV1({
      requestId: input.requestId,
      policy: this.policy,
      alignmentPolicy: this.alignmentPolicy,
      alignmentState: alignment,
      authorityCeiling: input.authorityCeiling,
      createdAtLogicalMs: input.logicalTimeMs,
      expiresAtLogicalMs: input.logicalTimeMs + this.options.requestTtlMs,
    });
    const state = createRoleRealignmentStateV1({
      controllerId: this.binding.controllerId,
      controllerVersion: this.binding.controllerVersion,
      implementationId: this.binding.implementationId,
      policy: this.policy,
      request,
      createdAtLogicalMs: input.logicalTimeMs,
    });
    await this.stateStore.save(state, null);
    await this.observe({ state, event: state.events[0]! });
    return state;
  }

  private async discoverAndEvaluate(
    stateInput: RoleRealignmentStateV1,
    input: RunRoleRealignmentInputV1,
  ): Promise<RoleRealignmentStateV1> {
    let state = stateInput;
    const proposalSets = await Promise.all(
      this.options.discovery.map(async (strategy) => ({
        strategy,
        proposals: await strategy.propose({
          request: state.request,
          logicalTimeMs: input.logicalTimeMs,
          signal: input.signal,
        }),
      })),
    );
    const proposals = proposalSets
      .flatMap(({ strategy, proposals: values }) =>
        values.map((proposal) => ({ strategy, proposal })),
      )
      .sort((left, right) =>
        compare(left.proposal.proposalDigest, right.proposal.proposalDigest),
      );
    for (const { strategy, proposal } of proposals) {
      if (
        state.candidates.some(
          (candidate) =>
            candidate.proposal.proposalDigest === proposal.proposalDigest ||
            candidate.proposal.definitionDigest === proposal.definitionDigest,
        )
      )
        continue;
      if (
        proposal.proposerId !== strategy.proposerId ||
        proposal.proposerVersion !== strategy.proposerVersion ||
        proposal.proposerBindingDigest !== strategy.proposerBindingDigest
      )
        throw new TypeError("role_discovery_strategy_binding_mismatch");
      const trustDigest = await this.eligibleSubjectDigest({
        tenantId: state.tenantId,
        subjectKind: "proposer",
        subjectId: strategy.proposerId,
        subjectBindingDigest: strategy.proposerBindingDigest,
        requestDigest: state.request.requestDigest,
        candidateDigest: null,
        logicalTimeMs: input.logicalTimeMs,
      });
      if (!trustDigest) continue;
      const definition = await this.options.catalog.resolve({
        definitionId: proposal.definitionId,
        definitionRevision: proposal.definitionRevision,
        definitionDigest: proposal.definitionDigest,
        logicalTimeMs: input.logicalTimeMs,
      });
      if (!definition) continue;
      const admitted = admitRoleCandidateV1(
        state,
        {
          expectedRevision: state.revision,
          proposal,
          proposerEligibilityDecisionDigest: trustDigest,
          definition,
          logicalTimeMs: input.logicalTimeMs,
        },
        this.policy,
      );
      await this.persistTransition(state, admitted);
      state = admitted.state;
    }
    for (const candidate of state.candidates) {
      const definition = await this.resolveCandidateDefinition(
        candidate,
        input.logicalTimeMs,
        state.request.authorityCeiling,
      );
      for (const evaluator of this.options.evaluators) {
        if (
          state.evaluations.some(
            (evaluation) =>
              evaluation.candidateDigest === candidate.candidateDigest &&
              evaluation.evaluatorBindingDigest ===
                evaluator.evaluatorBindingDigest,
          )
        )
          continue;
        const trustDigest = await this.eligibleSubjectDigest({
          tenantId: state.tenantId,
          subjectKind: "evaluator",
          subjectId: evaluator.evaluatorId,
          subjectBindingDigest: evaluator.evaluatorBindingDigest,
          requestDigest: state.request.requestDigest,
          candidateDigest: candidate.candidateDigest,
          logicalTimeMs: input.logicalTimeMs,
        });
        if (!trustDigest) continue;
        const result = await evaluator.evaluate({
          request: state.request,
          candidate,
          definition,
          logicalTimeMs: input.logicalTimeMs,
          signal: input.signal,
        });
        const evaluation = createRoleCandidateEvaluationV1({
          evaluationId: `evaluation-${candidate.candidateDigest.slice(7, 23)}-${evaluator.evaluatorBindingDigest.slice(7, 23)}`,
          requestDigest: state.request.requestDigest,
          candidateDigest: candidate.candidateDigest,
          definitionDigest: candidate.proposal.definitionDigest,
          evaluatorId: evaluator.evaluatorId,
          evaluatorVersion: evaluator.evaluatorVersion,
          evaluatorBindingDigest: evaluator.evaluatorBindingDigest,
          eligibilityDecisionDigest: trustDigest,
          eligible: result.eligible,
          roleFitBps: result.roleFitBps,
          missionContributionBps: result.missionContributionBps,
          uncertaintyBps: result.uncertaintyBps,
          transitionRiskBps: result.transitionRiskBps,
          reasonCodes: result.reasonCodes,
          evidenceReferenceIds: result.evidenceReferenceIds,
          evaluatedAtLogicalMs: input.logicalTimeMs,
          expiresAtLogicalMs: Math.min(
            state.request.expiresAtLogicalMs,
            input.logicalTimeMs + this.options.evaluationTtlMs,
          ),
        });
        const recorded = recordRoleCandidateEvaluationV1(
          state,
          {
            expectedRevision: state.revision,
            evaluation,
            logicalTimeMs: input.logicalTimeMs,
          },
          this.policy,
        );
        await this.persistTransition(state, recorded);
        state = recorded.state;
      }
    }
    return state;
  }

  private async resolveCandidateDefinition(
    candidate: AdmittedRoleCandidateV1,
    logicalTimeMs: number,
    authorityCeiling: RoleAuthorityCeilingV1,
  ): Promise<TrustedRoleDefinitionV1> {
    const definition = await this.options.catalog.resolve({
      catalogId: candidate.catalogId,
      definitionId: candidate.proposal.definitionId,
      definitionRevision: candidate.proposal.definitionRevision,
      definitionDigest: candidate.proposal.definitionDigest,
      logicalTimeMs,
    });
    if (!definition) throw new TypeError("trusted_role_definition_unavailable");
    const validated = validateTrustedRoleDefinitionV1(definition, this.policy);
    if (
      validated.catalogId !== candidate.catalogId ||
      validated.definitionId !== candidate.proposal.definitionId ||
      validated.definitionRevision !== candidate.proposal.definitionRevision ||
      validated.definitionDigest !== candidate.proposal.definitionDigest
    )
      throw new TypeError("trusted_role_definition_binding_mismatch");
    assertTrustedRoleDefinitionWithinAuthorityCeilingV1(
      validated,
      authorityCeiling,
    );
    return validated;
  }

  private async validateLocalDefinition(
    sourceDefinition: TrustedRoleDefinitionV1,
    logicalTimeMs: number,
    authorityCeiling: RoleAuthorityCeilingV1,
  ): Promise<TrustedRoleDefinitionV1> {
    const definition = validateTrustedRoleDefinitionV1(
      sourceDefinition,
      this.policy,
    );
    const local = await this.options.catalog.resolve({
      catalogId: definition.catalogId,
      definitionId: definition.definitionId,
      definitionRevision: definition.definitionRevision,
      definitionDigest: definition.definitionDigest,
      logicalTimeMs,
    });
    if (!local) throw new TypeError("trusted_role_definition_unavailable");
    const validated = validateTrustedRoleDefinitionV1(local, this.policy);
    if (validated.definitionDigest !== definition.definitionDigest)
      throw new TypeError("trusted_role_definition_binding_mismatch");
    assertTrustedRoleDefinitionWithinAuthorityCeilingV1(
      validated,
      authorityCeiling,
    );
    return validated;
  }

  private async eligibleSubjectDigest(
    input: Parameters<RoleRealignmentTrustEligibilityPortV1["evaluate"]>[0],
  ): Promise<string | null> {
    const raw = await this.options.trustEligibility.evaluate(input);
    if (!raw) return null;
    let decision: TrustEligibilityDecisionV1;
    try {
      decision = validateTrustEligibilityDecisionV1(raw);
    } catch {
      return null;
    }
    if (
      decision.disposition !== "eligible" ||
      decision.evaluatedAtLogicalMs > input.logicalTimeMs
    )
      return null;
    return `sha256:${digestTrustEligibilityDecisionV1(decision)}`;
  }

  private async resumeActivation(
    state: RoleRealignmentStateV1,
    logicalTimeMs: number,
  ): Promise<RoleRealignmentStateV1> {
    const activation = state.activation;
    if (!activation) throw new TypeError("role_realignment_activation_missing");
    const targetRole = normalizeRoleBindingV1(activation.roleBinding);
    let session = await this.options.runtime.getSession(state.activeSessionId);
    if (!session) throw new TypeError("portable_agent_session_unavailable");
    assertRuntimeBinding(state, session);
    if (!sameRole(session.role, targetRole)) {
      if (
        session.role.roleBindingId !== state.request.currentRoleBindingId ||
        session.role.roleRevision !== state.request.currentRoleRevision
      )
        throw new TypeError("portable_agent_role_transition_conflict");
      session = await this.options.runtime.updateRole(
        state.activeSessionId,
        targetRole,
        session.revision,
      );
    }
    let alignment = await this.options.alignment.getState(
      state.activeSessionId,
    );
    if (!alignment) throw new TypeError("role_alignment_state_unavailable");
    const targetAnchor = roleAnchorFor(session, targetRole);
    if (alignment.roleAnchor.anchorDigest !== targetAnchor.anchorDigest) {
      alignment = await this.options.alignment.activateSessionRole({
        sessionId: state.activeSessionId,
        expectedRevision: alignment.revision,
        tenantId: state.tenantId,
        agentId: state.activeAgentId,
        role: targetRole,
        logicalTimeMs,
      });
    }
    if (alignment.roleAnchor.anchorDigest !== targetAnchor.anchorDigest)
      throw new TypeError("role_alignment_activation_mismatch");
    const completed = completeRoleRealignmentActivationV1(
      state,
      {
        expectedRevision: state.revision,
        runtimeSessionRevision: session.revision,
        alignmentStateRevision: alignment.revision,
        alignmentRoleAnchorDigest: alignment.roleAnchor.anchorDigest,
        logicalTimeMs,
      },
      this.policy,
    );
    await this.persistTransition(state, completed);
    return completed.state;
  }

  private async persistTransition(
    previous: RoleRealignmentStateV1,
    transition: RoleRealignmentTransitionV1,
  ): Promise<void> {
    await this.stateStore.save(transition.state, previous.revision);
    await this.observe(transition);
  }

  private async observe(
    transition: RoleRealignmentTransitionV1,
  ): Promise<void> {
    if (!this.options.observer) return;
    try {
      await this.options.observer.observe({
        activeSessionId: transition.state.activeSessionId,
        status: transition.state.status,
        revision: transition.state.revision,
        stateDigest: transition.state.stateDigest,
        event: transition.event,
      });
    } catch {
      // Enforcement state is already durable; observation is non-authoritative.
    }
  }

  private validateHandoff(
    input: RoleRealignmentHandoffEnvelopeV1,
    transfer: PortableAgentCheckpointTransferV1,
  ): RoleRealignmentHandoffEnvelopeV1 {
    assertExactKeys(
      input,
      [
        "schemaVersion",
        "contentClass",
        "controllerId",
        "controllerVersion",
        "implementationId",
        "policyDigest",
        "sourceSessionId",
        "sourceAgentId",
        "sourceRoleAnchorDigest",
        "checkpointTransferDigest",
        "sourceState",
        "exportedAtLogicalMs",
        "handoffDigest",
      ],
      "role realignment handoff",
    );
    assertRoleRealignmentStateV1(input.sourceState, this.policy, {
      controllerId: this.binding.controllerId,
      controllerVersion: this.binding.controllerVersion,
      implementationId: this.binding.implementationId,
      activeSessionId: input.sourceSessionId,
    });
    const { handoffDigest, ...body } = input;
    if (
      input.schemaVersion !== 1 ||
      input.contentClass !== "role_realignment_state" ||
      input.policyDigest !== this.binding.policyDigest ||
      input.sourceAgentId !== input.sourceState.activeAgentId ||
      input.sourceRoleAnchorDigest !==
        input.sourceState.activeRoleAnchorDigest ||
      input.checkpointTransferDigest !==
        digestRoleRealignmentJsonV1(
          "handoff",
          transfer as unknown as JsonValue,
        ) ||
      transfer.sourceSessionId !== input.sourceSessionId ||
      transfer.sourceAgentId !== input.sourceAgentId ||
      transfer.objectiveId !== input.sourceState.objectiveId ||
      digestRoleRealignmentJsonV1("handoff", body as unknown as JsonValue) !==
        handoffDigest
    )
      throw new TypeError("role_realignment_handoff_invalid");
    return input;
  }

  private async requireState(
    sessionId: string,
  ): Promise<RoleRealignmentStateV1> {
    const state = await this.getState(sessionId);
    if (!state) throw new TypeError("role_realignment_state_unavailable");
    return state;
  }
}

function validatePortableOptions(
  options: CreateRoleRealignmentPortableAgentV1,
): void {
  if (!options || typeof options !== "object")
    throw new TypeError("role_realignment_options_required");
  assertIdentifier(options.controllerId, "controllerId");
  assertSafeInteger(options.controllerVersion, "controllerVersion", 1);
  assertIdentifier(options.implementationId, "implementationId");
  const policy = createRoleRealignmentPolicyRecordV1(options.policy).policy;
  createRoleAlignmentPolicyRecordV1(options.alignmentPolicy);
  if (
    !options.alignment ||
    typeof options.alignment.getState !== "function" ||
    typeof options.alignment.activateSessionRole !== "function" ||
    !options.runtime ||
    typeof options.runtime.getSession !== "function" ||
    typeof options.runtime.updateRole !== "function" ||
    !Array.isArray(options.discovery) ||
    !options.discovery.length ||
    options.discovery.length > policy.limits.maximumProposers ||
    !Array.isArray(options.evaluators) ||
    options.evaluators.length < policy.minimumIndependentEvaluations ||
    options.evaluators.length > policy.limits.maximumEvaluationsPerCandidate ||
    !options.catalog ||
    typeof options.catalog.resolve !== "function" ||
    !options.trustEligibility ||
    typeof options.trustEligibility.evaluate !== "function" ||
    !options.certification ||
    typeof options.certification.certify !== "function"
  )
    throw new TypeError("role_realignment_port_invalid");
  const proposerBindings = new Set<string>();
  for (const proposer of options.discovery) {
    assertIdentifier(proposer.proposerId, "proposerId");
    assertSafeInteger(proposer.proposerVersion, "proposerVersion", 1);
    assertDigest(proposer.proposerBindingDigest, "proposerBindingDigest");
    if (
      typeof proposer.propose !== "function" ||
      proposerBindings.has(proposer.proposerBindingDigest)
    )
      throw new TypeError("role_discovery_strategy_invalid");
    proposerBindings.add(proposer.proposerBindingDigest);
  }
  const evaluatorBindings = new Set<string>();
  for (const evaluator of options.evaluators) {
    assertIdentifier(evaluator.evaluatorId, "evaluatorId");
    assertSafeInteger(evaluator.evaluatorVersion, "evaluatorVersion", 1);
    assertDigest(evaluator.evaluatorBindingDigest, "evaluatorBindingDigest");
    if (
      typeof evaluator.evaluate !== "function" ||
      evaluatorBindings.has(evaluator.evaluatorBindingDigest)
    )
      throw new TypeError("role_candidate_evaluator_invalid");
    evaluatorBindings.add(evaluator.evaluatorBindingDigest);
  }
  for (const [label, value, maximum] of [
    ["requestTtlMs", options.requestTtlMs, policy.limits.maximumRequestTtlMs],
    [
      "evaluationTtlMs",
      options.evaluationTtlMs,
      policy.limits.maximumEvaluationTtlMs,
    ],
    [
      "certificationTtlMs",
      options.certificationTtlMs,
      policy.limits.maximumCertificationTtlMs,
    ],
  ] as const) {
    assertSafeInteger(value, label, 1);
    if (value > maximum) throw new TypeError(`${label}_exceeds_policy`);
  }
  if (
    options.stateStore !== undefined &&
    (typeof options.stateStore.load !== "function" ||
      typeof options.stateStore.save !== "function" ||
      typeof options.stateStore.rebind !== "function")
  )
    throw new TypeError("role_realignment_state_store_invalid");
  if (
    options.observer !== undefined &&
    typeof options.observer.observe !== "function"
  )
    throw new TypeError("role_realignment_observer_invalid");
}

function validateRunInput(input: RunRoleRealignmentInputV1): void {
  if (!input || typeof input !== "object")
    throw new TypeError("role_realignment_run_input_required");
  for (const [label, value] of [
    ["sessionId", input.sessionId],
    ["requestId", input.requestId],
    ["selectionId", input.selectionId],
    ["activationId", input.activationId],
  ] as const)
    assertIdentifier(value, label);
  assertSafeInteger(input.logicalTimeMs, "logicalTimeMs");
}

function roleAnchorFor(
  session: PortableAgentSessionSnapshotV1,
  role: PortableAgentRoleBindingV1,
) {
  return createRoleAlignmentRoleAnchorV1({
    tenantId: session.tenantId,
    sessionId: session.sessionId,
    agentId: session.agentId,
    objectiveId: role.objectiveId,
    roleBindingId: role.roleBindingId,
    roleRevision: role.roleRevision,
    predecessorRoleBindingId: role.predecessorRoleBindingId,
    roleKey: role.roleKey,
    roleContent: {
      instructions: [...role.instructions],
      constraints: role.constraints,
      validFromLogicalMs: role.validFromLogicalMs,
      validUntilLogicalMs: role.validUntilLogicalMs,
    },
  });
}

function assertRuntimeBinding(
  state: RoleRealignmentStateV1,
  session: PortableAgentSessionSnapshotV1,
): void {
  if (
    session.sessionId !== state.activeSessionId ||
    session.tenantId !== state.tenantId ||
    session.agentId !== state.activeAgentId ||
    session.objectiveId !== state.objectiveId ||
    (session.status !== "active" && session.status !== "paused")
  )
    throw new TypeError("portable_agent_session_binding_mismatch");
}

function sameRole(
  left: PortableAgentRoleBindingV1,
  right: PortableAgentRoleBindingV1,
): boolean {
  return (
    digestRoleRealignmentJsonV1(
      "role_binding",
      left as unknown as JsonValue,
    ) ===
    digestRoleRealignmentJsonV1("role_binding", right as unknown as JsonValue)
  );
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
