import {
  digestPlanningJsonV1,
  type PlanningDigestDomainV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";

import type { MorphogenesisScopeV1 } from "./morphogenesis-contracts.js";
import {
  validateMorphogenesisBudgetReservationV1,
  type MorphogenesisBudgetReservationPortV1,
  type MorphogenesisBudgetReservationV1,
} from "./morphogenesis-budget.js";
import {
  validateMorphogenesisDecisionBindingV1,
  type MorphogenesisDecisionBindingV1,
} from "./morphogenesis-decision.js";
import {
  createMorphogenesisReceiptV1,
  type MorphogenesisActivationReceiptV1,
  type MorphogenesisAgentRetirementPortV1,
  type MorphogenesisAuthorityFencePortV1,
  type MorphogenesisAuthorityFenceReceiptV1,
  type MorphogenesisContinuityPortV1,
  type MorphogenesisContinuityReceiptV1,
  type MorphogenesisDetachmentPortV1,
  type MorphogenesisMorphologyActivationPortV1,
  type MorphogenesisReceiptV1,
  type MorphogenesisTerminalAgentReceiptV1,
} from "./morphogenesis-retirement.js";
import type { AgentInstantiationProfileAnyV1 } from "./morphogenesis-instantiation.js";
import { validateMorphogenesisScopeV1 } from "./morphogenesis-validation.js";

export interface MorphogenesisCandidateSearchRequestV1 {
  readonly schemaVersion: 1;
  readonly requestId: AgentPlatID;
  readonly scopeDigest: PlanningDigestV1;
  readonly positionDigest: PlanningDigestV1;
  readonly requiredCapabilityKeys: readonly string[];
  readonly membershipConfigurationDigest: PlanningDigestV1;
  readonly membershipEpoch: number;
  readonly viewId: AgentPlatID;
  readonly viewDigest: PlanningDigestV1;
  readonly searchLimit: number;
  readonly requestedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly requestDigest: PlanningDigestV1;
}

export interface MorphogenesisExistingCandidateV1 {
  readonly schemaVersion: 1;
  readonly candidateId: AgentPlatID;
  readonly agentId: AgentPlatID;
  readonly peerId: AgentPlatID;
  readonly instanceId: AgentPlatID;
  readonly lineageDigest: PlanningDigestV1;
  readonly capabilityKeys: readonly string[];
  readonly sourceEvidenceDigest: PlanningDigestV1;
  readonly membershipConfigurationDigest: PlanningDigestV1;
  readonly membershipEpoch: number;
  readonly locallyEvaluatedScoreMicros: number;
  readonly budgetUnits: number;
  readonly observedAtLogicalMs: number;
  readonly validUntilLogicalMs: number;
  readonly candidateDigest: PlanningDigestV1;
}

export interface MorphogenesisCandidateSearchResultV1 {
  readonly schemaVersion: 1;
  readonly requestDigest: PlanningDigestV1;
  readonly status:
    | "eligible_candidates"
    | "no_eligible_candidate_in_bounded_view"
    | "incomplete_bounded_view";
  readonly completeWithinDeclaredView: boolean;
  readonly searchedCandidateCount: number;
  readonly candidates: readonly MorphogenesisExistingCandidateV1[];
  readonly observedAtLogicalMs: number;
  readonly resultDigest: PlanningDigestV1;
}

export interface MorphogenesisCandidateDiscoveryPortV1 {
  search(
    request: MorphogenesisCandidateSearchRequestV1,
  ): Promise<MorphogenesisCandidateSearchResultV1>;
}

export interface MorphogenesisInstantiationProfileResolutionPortV1 {
  resolve(
    profileDigest: PlanningDigestV1,
  ): Promise<{
    readonly profile: AgentInstantiationProfileAnyV1;
    readonly certificationDigest: PlanningDigestV1;
    readonly validUntilLogicalMs: number;
    readonly status: "certified";
  } | null>;
}

export interface MorphogenesisLifecycleAgentV1 {
  readonly schemaVersion: 1;
  readonly agentId: AgentPlatID;
  readonly peerId: AgentPlatID;
  readonly instanceId: AgentPlatID;
  readonly lineageDigest: PlanningDigestV1;
  readonly capabilityKeys: readonly string[];
  readonly roleDefinitionDigest: PlanningDigestV1;
  readonly membershipConfigurationDigest: PlanningDigestV1;
  readonly membershipEpoch: number;
  readonly source:
    | "existing"
    | "catalog_created"
    | "derived_created"
    | "synthesized_created";
  readonly agentDigest: PlanningDigestV1;
}

export interface MorphogenesisAgentLifecyclePortV1 {
  createAndEnroll(input: {
    readonly operationId: AgentPlatID;
    readonly scope: MorphogenesisScopeV1;
    readonly proposalDigest: PlanningDigestV1;
    readonly profile: AgentInstantiationProfileAnyV1;
    readonly logicalTimeMs: number;
    readonly signal?: AbortSignal;
  }): Promise<MorphogenesisLifecycleAgentV1>;
  reconcileCreateAndEnroll(input: {
    readonly operationId: AgentPlatID;
    readonly scope: MorphogenesisScopeV1;
    readonly proposalDigest: PlanningDigestV1;
    readonly profile: AgentInstantiationProfileAnyV1;
    readonly logicalTimeMs: number;
    readonly signal?: AbortSignal;
  }): Promise<MorphogenesisLifecycleAgentV1>;
  eligibility(input: {
    readonly peerId: AgentPlatID;
    readonly instanceId: AgentPlatID;
    readonly requiredCapabilityKeys: readonly string[];
    readonly membershipConfigurationDigest: PlanningDigestV1;
    readonly membershipEpoch: number;
    readonly expectedSource: MorphogenesisLifecycleAgentV1["source"];
    readonly logicalTimeMs: number;
  }): Promise<MorphogenesisLifecycleAgentV1 | null>;
}

export interface MorphogenesisAgentAttestationV1 {
  readonly schemaVersion: 1;
  readonly operationId: AgentPlatID;
  readonly agentDigest: PlanningDigestV1;
  readonly profileDigest: PlanningDigestV1 | null;
  readonly runtimeAttestationDigest: PlanningDigestV1;
  readonly capabilityAssessmentDigests: readonly PlanningDigestV1[];
  readonly eligibilityEvidenceDigests: readonly PlanningDigestV1[];
  readonly attestedAtLogicalMs: number;
  readonly validUntilLogicalMs: number;
  readonly attestationDigest: PlanningDigestV1;
}

export interface MorphogenesisAgentAttestationPortV1 {
  attest(input: {
    readonly operationId: AgentPlatID;
    readonly scope: MorphogenesisScopeV1;
    readonly proposalDigest: PlanningDigestV1;
    readonly agent: MorphogenesisLifecycleAgentV1;
    readonly profile: AgentInstantiationProfileAnyV1 | null;
    readonly logicalTimeMs: number;
    readonly signal?: AbortSignal;
  }): Promise<MorphogenesisAgentAttestationV1>;
  reconcile(input: {
    readonly operationId: AgentPlatID;
    readonly scope: MorphogenesisScopeV1;
    readonly proposalDigest: PlanningDigestV1;
    readonly agent: MorphogenesisLifecycleAgentV1;
    readonly profile: AgentInstantiationProfileAnyV1 | null;
    readonly logicalTimeMs: number;
    readonly signal?: AbortSignal;
  }): Promise<MorphogenesisAgentAttestationV1>;
}

export interface MorphogenesisSuccessorTeamReceiptV1 {
  readonly schemaVersion: 1;
  readonly operationId: AgentPlatID;
  readonly agentDigest: PlanningDigestV1;
  readonly teamId: AgentPlatID;
  readonly teamEpoch: number;
  readonly teamProposalDigest: PlanningDigestV1;
  readonly jointWorkContractDigest: PlanningDigestV1;
  readonly individualWorkContractDigests: readonly PlanningDigestV1[];
  readonly executionStateDigest: PlanningDigestV1;
  readonly retainedArtifactDigests: readonly PlanningDigestV1[];
  readonly invalidatedCausalClosureDigests: readonly PlanningDigestV1[];
  readonly activatedAtLogicalMs: number;
  readonly receiptDigest: PlanningDigestV1;
}

export interface MorphogenesisSuccessorTeamPortV1 {
  activateSuccessor(input: {
    readonly operationId: AgentPlatID;
    readonly scope: MorphogenesisScopeV1;
    readonly proposalDigest: PlanningDigestV1;
    readonly positionDigest: PlanningDigestV1;
    readonly agent: MorphogenesisLifecycleAgentV1;
    readonly attestation: MorphogenesisAgentAttestationV1;
    readonly logicalTimeMs: number;
  }): Promise<MorphogenesisSuccessorTeamReceiptV1>;
  reconcileActivation(input: {
    readonly operationId: AgentPlatID;
    readonly scope: MorphogenesisScopeV1;
    readonly proposalDigest: PlanningDigestV1;
    readonly positionDigest: PlanningDigestV1;
    readonly agent: MorphogenesisLifecycleAgentV1;
    readonly attestation: MorphogenesisAgentAttestationV1;
    readonly logicalTimeMs: number;
  }): Promise<MorphogenesisSuccessorTeamReceiptV1>;
}

export interface MorphogenesisExecutionOperationV1 {
  readonly operationId: AgentPlatID;
  readonly kind:
    | "create_and_enroll"
    | "attest"
    | "activate_team"
    | "commit_morphology"
    | "checkpoint"
    | "fence"
    | "detach"
    | "retire"
    | "release_budget";
  readonly status: "prepared" | "applied";
  readonly preparedAtLogicalMs: number;
  readonly resultDigest: PlanningDigestV1 | null;
}

export interface MorphogenesisExecutionEventV1 {
  readonly schemaVersion: 1;
  readonly sequence: number;
  readonly phase: MorphogenesisExecutionRecordV1["phase"];
  readonly outcome: "state" | "prepared" | "applied";
  readonly operationId: AgentPlatID | null;
  readonly evidenceDigests: readonly PlanningDigestV1[];
  readonly logicalTimeMs: number;
  readonly previousEventDigest: PlanningDigestV1 | null;
  readonly eventDigest: PlanningDigestV1;
}

export interface MorphogenesisExecutionRecordV1 {
  readonly schemaVersion: 1;
  readonly stateKey: AgentPlatID;
  readonly scope: MorphogenesisScopeV1;
  readonly proposalDigest: PlanningDigestV1;
  readonly targetDigest: PlanningDigestV1;
  readonly decisionDigest: PlanningDigestV1;
  readonly budgetReservationDigest: PlanningDigestV1;
  readonly budgetReservationId: AgentPlatID;
  readonly budgetReleaseDigest: PlanningDigestV1 | null;
  readonly morphologyHeadStateKey: AgentPlatID;
  readonly expectedMorphologyEpoch: number;
  readonly resultingSnapshotDigest: PlanningDigestV1;
  readonly positionDigest: PlanningDigestV1;
  readonly requiredCapabilityKeys: readonly string[];
  readonly searchRequest: MorphogenesisCandidateSearchRequestV1;
  readonly profile: AgentInstantiationProfileAnyV1 | null;
  readonly profileCertificationDigest: PlanningDigestV1 | null;
  readonly phase:
    | "prepared"
    | "creating"
    | "agent_ready"
    | "attesting"
    | "attested"
    | "enrollment_verified"
    | "activating_team"
    | "team_active"
    | "committing_morphology"
    | "morphology_active"
    | "checkpointing"
    | "checkpointed"
    | "fencing"
    | "fenced"
    | "draining"
    | "detached"
    | "retired"
    | "releasing_budget"
    | "budget_released"
    | "completed";
  readonly branch:
    | "recruit_existing"
    | "catalog_created"
    | "derived_created"
    | "synthesized_created"
    | null;
  readonly searchResult: MorphogenesisCandidateSearchResultV1 | null;
  readonly selectedCandidate: MorphogenesisExistingCandidateV1 | null;
  readonly agent: MorphogenesisLifecycleAgentV1 | null;
  readonly attestation: MorphogenesisAgentAttestationV1 | null;
  readonly team: MorphogenesisSuccessorTeamReceiptV1 | null;
  readonly activation: MorphogenesisActivationReceiptV1 | null;
  readonly continuity: MorphogenesisContinuityReceiptV1 | null;
  readonly fence: MorphogenesisAuthorityFenceReceiptV1 | null;
  readonly terminalAgent: MorphogenesisTerminalAgentReceiptV1 | null;
  readonly receipt: MorphogenesisReceiptV1 | null;
  readonly pendingOperation: MorphogenesisExecutionOperationV1 | null;
  readonly events: readonly MorphogenesisExecutionEventV1[];
  readonly revision: number;
  readonly logicalTimeHighWaterMs: number;
  readonly predecessorRecordDigest: PlanningDigestV1 | null;
  readonly recordDigest: PlanningDigestV1;
}

export interface MorphogenesisExecutionStoreV1 {
  load(stateKey: AgentPlatID): Promise<MorphogenesisExecutionRecordV1 | null>;
  save(input: {
    readonly record: MorphogenesisExecutionRecordV1;
    readonly expectedRevision: number | null;
    readonly expectedRecordDigest: PlanningDigestV1 | null;
  }): Promise<boolean>;
}

export class InMemoryMorphogenesisExecutionStoreV1
  implements MorphogenesisExecutionStoreV1
{
  readonly #records = new Map<string, MorphogenesisExecutionRecordV1>();
  async load(stateKey: AgentPlatID): Promise<MorphogenesisExecutionRecordV1 | null> {
    const value = this.#records.get(stateKey);
    return value ? immutable(value) : null;
  }
  async save(input: {
    readonly record: MorphogenesisExecutionRecordV1;
    readonly expectedRevision: number | null;
    readonly expectedRecordDigest: PlanningDigestV1 | null;
  }): Promise<boolean> {
    const current = this.#records.get(input.record.stateKey);
    if (input.expectedRevision === null) {
      if (current || input.expectedRecordDigest !== null || input.record.revision !== 0)
        return false;
    } else if (
      !current ||
      current.revision !== input.expectedRevision ||
      current.recordDigest !== input.expectedRecordDigest ||
      input.record.revision !== current.revision + 1 ||
      input.record.predecessorRecordDigest !== current.recordDigest ||
      input.record.scope.scopeDigest !== current.scope.scopeDigest ||
      input.record.proposalDigest !== current.proposalDigest ||
      input.record.logicalTimeHighWaterMs < current.logicalTimeHighWaterMs
    )
      return false;
    this.#records.set(input.record.stateKey, immutable(input.record));
    return true;
  }
}

export class MorphogenesisExecutionRuntimeV1 {
  constructor(
    readonly options: {
      readonly discovery: MorphogenesisCandidateDiscoveryPortV1;
      readonly profiles: MorphogenesisInstantiationProfileResolutionPortV1;
      readonly lifecycle: MorphogenesisAgentLifecyclePortV1;
      readonly attestation: MorphogenesisAgentAttestationPortV1;
      readonly teams: MorphogenesisSuccessorTeamPortV1;
      readonly morphology: MorphogenesisMorphologyActivationPortV1;
      readonly continuity: MorphogenesisContinuityPortV1;
      readonly authority: MorphogenesisAuthorityFencePortV1;
      readonly detachment: MorphogenesisDetachmentPortV1;
      readonly retirement: MorphogenesisAgentRetirementPortV1;
      readonly budgets: MorphogenesisBudgetReservationPortV1;
      readonly store: MorphogenesisExecutionStoreV1;
      readonly maximumCommitAttempts: number;
    },
  ) {
    if (
      !Number.isSafeInteger(options.maximumCommitAttempts) ||
      options.maximumCommitAttempts < 1 ||
      options.maximumCommitAttempts > 1_000
    )
      fail("Morphogenesis execution commit attempts are invalid");
  }

  async initialize(input: {
    readonly stateKey: AgentPlatID;
    readonly scope: MorphogenesisScopeV1;
    readonly proposalDigest: PlanningDigestV1;
    readonly targetDigest: PlanningDigestV1;
    readonly decision: MorphogenesisDecisionBindingV1;
    readonly budgetReservation: MorphogenesisBudgetReservationV1;
    readonly morphologyHeadStateKey: AgentPlatID;
    readonly expectedMorphologyEpoch: number;
    readonly resultingSnapshotDigest: PlanningDigestV1;
    readonly positionDigest: PlanningDigestV1;
    readonly requiredCapabilityKeys: readonly string[];
    readonly searchRequest: MorphogenesisCandidateSearchRequestV1;
    readonly profile: AgentInstantiationProfileAnyV1 | null;
    readonly profileCertificationDigest: PlanningDigestV1 | null;
    readonly logicalTimeMs: number;
  }): Promise<MorphogenesisExecutionRecordV1> {
    if (
      (input.profile === null) !==
      (input.profileCertificationDigest === null)
    )
      fail("Morphogenesis profile certification binding is incomplete");
    const decision = validateMorphogenesisDecisionBindingV1(input.decision);
    const reservation = validateMorphogenesisBudgetReservationV1(
      input.budgetReservation,
    );
    if (
      decision.authorization.disposition !== "approved" ||
      decision.candidate.scopeDigest !== input.scope.scopeDigest ||
      decision.candidate.proposalDigest !== input.proposalDigest ||
      decision.candidate.targetDigest !== input.targetDigest ||
      reservation.status !== "reserved" ||
      reservation.request.scopeDigest !== input.scope.scopeDigest ||
      reservation.request.proposalDigest !== input.proposalDigest ||
      reservation.request.expectedMorphologyEpoch !==
        decision.candidate.morphologyEpoch ||
      input.expectedMorphologyEpoch !== decision.candidate.morphologyEpoch ||
      reservation.request.budget.budgetDigest !==
        decision.candidate.budgetDigest
    )
      fail("Morphogenesis execution decision or budget guard is invalid");
    const {
      decision: _decision,
      budgetReservation: _budgetReservation,
      logicalTimeMs: _logicalTimeMs,
      ...recordInput
    } = input;
    const initialEvent = createExecutionEvent({
      sequence: 1,
      phase: "prepared",
      outcome: "state",
      operationId: null,
      evidenceDigests: [
        decision.decisionDigest,
        reservation.reservationDigest,
        input.proposalDigest,
      ],
      logicalTimeMs: input.logicalTimeMs,
      previousEventDigest: null,
    });
    const record = createRecord({
      ...recordInput,
      decisionDigest: decision.decisionDigest,
      budgetReservationDigest: reservation.reservationDigest,
      budgetReservationId: reservation.request.reservationId,
      budgetReleaseDigest: null,
      phase: "prepared",
      branch: null,
      searchResult: null,
      selectedCandidate: null,
      agent: null,
      attestation: null,
      team: null,
      activation: null,
      continuity: null,
      fence: null,
      terminalAgent: null,
      receipt: null,
      pendingOperation: null,
      events: [initialEvent],
      revision: 0,
      logicalTimeHighWaterMs: input.logicalTimeMs,
      predecessorRecordDigest: null,
    });
    if (
      await this.options.store.save({
        record,
        expectedRevision: null,
        expectedRecordDigest: null,
      })
    )
      return record;
    const retained = await this.options.store.load(record.stateKey);
    if (retained?.recordDigest === record.recordDigest) return retained;
    fail("Morphogenesis execution initialization conflicts");
  }

  async resolveAgent(input: {
    readonly stateKey: AgentPlatID;
    readonly logicalTimeMs: number;
    readonly signal?: AbortSignal;
  }): Promise<MorphogenesisExecutionRecordV1> {
    let current = await this.required(input.stateKey);
    if (["agent_ready", "attesting", "attested", "enrollment_verified", "activating_team", "team_active"].includes(current.phase))
      return current;
    if (current.phase === "creating") {
      const agent = await this.options.lifecycle.reconcileCreateAndEnroll({
        operationId: current.pendingOperation!.operationId,
        scope: current.scope,
        proposalDigest: current.proposalDigest,
        profile: current.profile!,
        logicalTimeMs: input.logicalTimeMs,
        signal: input.signal,
      });
      return this.applyAgent(current, agent, input.logicalTimeMs);
    }
    if (current.phase !== "prepared") fail("Morphogenesis agent resolution phase is invalid");
    const searchResult = validateSearchResult(
      await this.options.discovery.search(current.searchRequest),
      current.searchRequest,
    );
    const eligible = selectExistingCandidates(searchResult);
    for (const candidate of eligible) {
      const agent = await this.options.lifecycle.eligibility({
        peerId: candidate.peerId,
        instanceId: candidate.instanceId,
        requiredCapabilityKeys: current.requiredCapabilityKeys,
        membershipConfigurationDigest:
          candidate.membershipConfigurationDigest,
        membershipEpoch: candidate.membershipEpoch,
        expectedSource: "existing",
        logicalTimeMs: input.logicalTimeMs,
      });
      if (agent)
        return this.saveNext(current, {
          phase: "agent_ready",
          branch: "recruit_existing",
          searchResult,
          selectedCandidate: candidate,
          agent: validateLifecycleAgent(agent),
          pendingOperation: null,
          logicalTimeMs: input.logicalTimeMs,
        });
    }
    if (!searchResult.completeWithinDeclaredView || searchResult.status === "incomplete_bounded_view")
      fail("bounded candidate discovery is incomplete");
    if (!current.profile) fail("no eligible candidate and catalog creation is unavailable");
    const resolvedProfile = await this.options.profiles.resolve(
      current.profile.profileDigest,
    );
    if (
      !resolvedProfile ||
      resolvedProfile.status !== "certified" ||
      resolvedProfile.profile.profileDigest !== current.profile.profileDigest ||
      resolvedProfile.certificationDigest !==
        current.profileCertificationDigest ||
      input.logicalTimeMs >= resolvedProfile.validUntilLogicalMs
    )
      fail("instantiation profile is unavailable or substituted");
    if (resolvedProfile.profile !== current.profile)
      current = await this.saveNext(current, {
        profile: resolvedProfile.profile,
        logicalTimeMs: input.logicalTimeMs,
      });
    const operationId = `${current.stateKey}:create-and-enroll` as AgentPlatID;
    current = await this.saveNext(current, {
      phase: "creating",
      branch: createdBranch(current.profile!),
      searchResult,
      selectedCandidate: null,
      pendingOperation: {
        operationId,
        kind: "create_and_enroll",
        status: "prepared",
        preparedAtLogicalMs: input.logicalTimeMs,
        resultDigest: null,
      },
      logicalTimeMs: input.logicalTimeMs,
    });
    const agent = await this.options.lifecycle.createAndEnroll({
      operationId,
      scope: current.scope,
      proposalDigest: current.proposalDigest,
      profile: current.profile!,
      logicalTimeMs: input.logicalTimeMs,
      signal: input.signal,
    });
    return this.applyAgent(current, agent, input.logicalTimeMs);
  }

  async attest(input: { readonly stateKey: AgentPlatID; readonly logicalTimeMs: number; readonly signal?: AbortSignal }): Promise<MorphogenesisExecutionRecordV1> {
    let current = await this.required(input.stateKey);
    if (["attested", "enrollment_verified", "activating_team", "team_active"].includes(current.phase)) return current;
    if (current.phase === "attesting") {
      const receipt = await this.options.attestation.reconcile({
        operationId: current.pendingOperation!.operationId,
        scope: current.scope,
        proposalDigest: current.proposalDigest,
        agent: current.agent!,
        profile: current.profile,
        logicalTimeMs: input.logicalTimeMs,
        signal: input.signal,
      });
      return this.applyAttestation(current, receipt, input.logicalTimeMs);
    }
    if (current.phase !== "agent_ready") fail("Morphogenesis attestation phase is invalid");
    const operationId = `${current.stateKey}:attest` as AgentPlatID;
    current = await this.saveNext(current, {
      phase: "attesting",
      pendingOperation: { operationId, kind: "attest", status: "prepared", preparedAtLogicalMs: input.logicalTimeMs, resultDigest: null },
      logicalTimeMs: input.logicalTimeMs,
    });
    const receipt = await this.options.attestation.attest({
      operationId,
      scope: current.scope,
      proposalDigest: current.proposalDigest,
      agent: current.agent!,
      profile: current.profile,
      logicalTimeMs: input.logicalTimeMs,
      signal: input.signal,
    });
    return this.applyAttestation(current, receipt, input.logicalTimeMs);
  }

  async verifyEnrollment(input: { readonly stateKey: AgentPlatID; readonly logicalTimeMs: number }): Promise<MorphogenesisExecutionRecordV1> {
    const current = await this.required(input.stateKey);
    if (["enrollment_verified", "activating_team", "team_active"].includes(current.phase)) return current;
    if (current.phase !== "attested") fail("Morphogenesis enrollment phase is invalid");
    const eligible = await this.options.lifecycle.eligibility({
      peerId: current.agent!.peerId,
      instanceId: current.agent!.instanceId,
      requiredCapabilityKeys: current.requiredCapabilityKeys,
      membershipConfigurationDigest:
        current.agent!.membershipConfigurationDigest,
      membershipEpoch: current.agent!.membershipEpoch,
      expectedSource: current.agent!.source,
      logicalTimeMs: input.logicalTimeMs,
    });
    if (!eligible || eligible.agentDigest !== current.agent!.agentDigest)
      fail("Morphogenesis agent enrollment or eligibility is unavailable");
    return this.saveNext(current, {
      phase: "enrollment_verified",
      agent: validateLifecycleAgent(eligible),
      pendingOperation: null,
      logicalTimeMs: input.logicalTimeMs,
    });
  }

  async activateTeam(input: { readonly stateKey: AgentPlatID; readonly logicalTimeMs: number }): Promise<MorphogenesisExecutionRecordV1> {
    let current = await this.required(input.stateKey);
    if (current.phase === "team_active") return current;
    if (current.phase === "activating_team") {
      const receipt = await this.options.teams.reconcileActivation({
        operationId: current.pendingOperation!.operationId,
        scope: current.scope,
        proposalDigest: current.proposalDigest,
        positionDigest: current.positionDigest,
        agent: current.agent!,
        attestation: current.attestation!,
        logicalTimeMs: input.logicalTimeMs,
      });
      return this.applyTeam(current, receipt, input.logicalTimeMs);
    }
    if (current.phase !== "enrollment_verified") fail("Morphogenesis Team activation phase is invalid");
    const operationId = `${current.stateKey}:activate-team` as AgentPlatID;
    current = await this.saveNext(current, {
      phase: "activating_team",
      pendingOperation: { operationId, kind: "activate_team", status: "prepared", preparedAtLogicalMs: input.logicalTimeMs, resultDigest: null },
      logicalTimeMs: input.logicalTimeMs,
    });
    const receipt = await this.options.teams.activateSuccessor({
      operationId,
      scope: current.scope,
      proposalDigest: current.proposalDigest,
      positionDigest: current.positionDigest,
      agent: current.agent!,
      attestation: current.attestation!,
      logicalTimeMs: input.logicalTimeMs,
    });
    return this.applyTeam(current, receipt, input.logicalTimeMs);
  }

  async commitMorphology(input: { readonly stateKey: AgentPlatID; readonly logicalTimeMs: number }): Promise<MorphogenesisExecutionRecordV1> {
    let current = await this.required(input.stateKey);
    if (["morphology_active", "checkpointing", "checkpointed", "fencing", "fenced", "draining", "detached", "retired", "completed"].includes(current.phase)) return current;
    if (current.phase === "committing_morphology") {
      const receipt = await this.options.morphology.reconcile(this.activationInput(current, input.logicalTimeMs));
      return this.applyActivation(current, receipt, input.logicalTimeMs);
    }
    if (current.phase !== "team_active") fail("Morphogenesis morphology activation phase is invalid");
    const operationId = `${current.stateKey}:commit-morphology` as AgentPlatID;
    current = await this.saveNext(current, {
      phase: "committing_morphology",
      pendingOperation: { operationId, kind: "commit_morphology", status: "prepared", preparedAtLogicalMs: input.logicalTimeMs, resultDigest: null },
      logicalTimeMs: input.logicalTimeMs,
    });
    const receipt = await this.options.morphology.activate(this.activationInput(current, input.logicalTimeMs));
    return this.applyActivation(current, receipt, input.logicalTimeMs);
  }

  async checkpoint(input: { readonly stateKey: AgentPlatID; readonly logicalTimeMs: number }): Promise<MorphogenesisExecutionRecordV1> {
    let current = await this.required(input.stateKey);
    if (["checkpointed", "fencing", "fenced", "draining", "detached", "retired", "completed"].includes(current.phase)) return current;
    if (current.phase === "checkpointing") {
      const receipt = await this.options.continuity.reconcile(this.continuityInput(current, input.logicalTimeMs));
      return this.applyContinuity(current, receipt, input.logicalTimeMs);
    }
    if (current.phase !== "morphology_active") fail("Morphogenesis checkpoint phase is invalid");
    const operationId = `${current.stateKey}:checkpoint` as AgentPlatID;
    current = await this.saveNext(current, {
      phase: "checkpointing",
      pendingOperation: { operationId, kind: "checkpoint", status: "prepared", preparedAtLogicalMs: input.logicalTimeMs, resultDigest: null },
      logicalTimeMs: input.logicalTimeMs,
    });
    const receipt = await this.options.continuity.checkpoint(this.continuityInput(current, input.logicalTimeMs));
    return this.applyContinuity(current, receipt, input.logicalTimeMs);
  }

  async fenceAuthority(input: { readonly stateKey: AgentPlatID; readonly logicalTimeMs: number }): Promise<MorphogenesisExecutionRecordV1> {
    let current = await this.required(input.stateKey);
    if (["fenced", "draining", "detached", "retired", "completed"].includes(current.phase)) return current;
    if (current.phase === "fencing") {
      const receipt = await this.options.authority.reconcile(this.fenceInput(current, input.logicalTimeMs));
      return this.applyFence(current, receipt, input.logicalTimeMs);
    }
    if (current.phase !== "checkpointed") fail("Morphogenesis authority fence phase is invalid");
    const operationId = `${current.stateKey}:fence` as AgentPlatID;
    current = await this.saveNext(current, {
      phase: "fencing",
      pendingOperation: { operationId, kind: "fence", status: "prepared", preparedAtLogicalMs: input.logicalTimeMs, resultDigest: null },
      logicalTimeMs: input.logicalTimeMs,
    });
    const receipt = await this.options.authority.fence(this.fenceInput(current, input.logicalTimeMs));
    return this.applyFence(current, receipt, input.logicalTimeMs);
  }

  async drain(input: { readonly stateKey: AgentPlatID; readonly logicalTimeMs: number; readonly reasonCode?: string }): Promise<MorphogenesisExecutionRecordV1> {
    let current = await this.required(input.stateKey);
    if (["detached", "retired", "releasing_budget", "budget_released", "completed"].includes(current.phase)) return current;
    const created = current.agent!.source !== "existing";
    if (current.phase === "draining") {
      const receipt = created
        ? await this.options.retirement.reconcile(this.retirementInput(current, input.logicalTimeMs, input.reasonCode))
        : await this.options.detachment.reconcile(this.detachmentInput(current, input.logicalTimeMs));
      return this.applyTerminalAgent(current, receipt, input.logicalTimeMs);
    }
    if (current.phase !== "fenced") fail("Morphogenesis drain phase is invalid");
    const operationId = `${current.stateKey}:${created ? "retire" : "detach"}` as AgentPlatID;
    current = await this.saveNext(current, {
      phase: "draining",
      pendingOperation: { operationId, kind: created ? "retire" : "detach", status: "prepared", preparedAtLogicalMs: input.logicalTimeMs, resultDigest: null },
      logicalTimeMs: input.logicalTimeMs,
    });
    const receipt = created
      ? await this.options.retirement.retire(this.retirementInput(current, input.logicalTimeMs, input.reasonCode))
      : await this.options.detachment.detach(this.detachmentInput(current, input.logicalTimeMs));
    return this.applyTerminalAgent(current, receipt, input.logicalTimeMs);
  }

  async releaseBudget(input: { readonly stateKey: AgentPlatID; readonly logicalTimeMs: number }): Promise<MorphogenesisExecutionRecordV1> {
    let current = await this.required(input.stateKey);
    if (["budget_released", "completed"].includes(current.phase)) return current;
    if (!new Set(["detached", "retired", "releasing_budget"]).has(current.phase))
      fail("Morphogenesis budget release requires terminal agent handling");
    const operationId = current.phase === "releasing_budget"
      ? current.pendingOperation!.operationId
      : (`${current.stateKey}:release-budget` as AgentPlatID);
    if (current.phase !== "releasing_budget")
      current = await this.saveNext(current, {
        phase: "releasing_budget",
        pendingOperation: { operationId, kind: "release_budget", status: "prepared", preparedAtLogicalMs: input.logicalTimeMs, resultDigest: null },
        logicalTimeMs: input.logicalTimeMs,
      });
    const released = await this.options.budgets.release({
      reservationId: current.budgetReservationId,
      proposalDigest: current.proposalDigest,
      releaseOperationId: operationId,
      reasonCode: "morphogenesis_terminal",
      logicalTimeMs: input.logicalTimeMs,
    });
    if (
      released.status !== "released" ||
      released.request.reservationId !== current.budgetReservationId ||
      released.request.proposalDigest !== current.proposalDigest
    )
      fail("Morphogenesis budget release receipt is invalid");
    return this.saveNext(current, {
      phase: "budget_released",
      budgetReleaseDigest: released.reservationDigest,
      pendingOperation: { ...current.pendingOperation!, status: "applied", resultDigest: released.reservationDigest },
      logicalTimeMs: input.logicalTimeMs,
    });
  }

  async complete(input: { readonly stateKey: AgentPlatID; readonly disposition: MorphogenesisReceiptV1["disposition"]; readonly outcomeEvidenceDigests: readonly PlanningDigestV1[]; readonly logicalTimeMs: number }): Promise<MorphogenesisExecutionRecordV1> {
    const current = await this.required(input.stateKey);
    if (current.phase === "completed") return current;
    if (current.phase !== "budget_released" || !current.budgetReleaseDigest) fail("Morphogenesis completion requires released budget");
    const receipt = createMorphogenesisReceiptV1({
      receiptId: `${current.stateKey}:receipt` as AgentPlatID,
      scopeDigest: current.scope.scopeDigest,
      proposalDigest: current.proposalDigest,
      decisionDigest: current.decisionDigest,
      budgetReservationDigest: current.budgetReservationDigest,
      budgetReleaseDigest: current.budgetReleaseDigest,
      activationReceiptDigest: current.activation!.activationReceiptDigest,
      continuityReceiptDigest: current.continuity!.continuityReceiptDigest,
      fenceReceiptDigest: current.fence!.fenceReceiptDigest,
      terminalAgentReceiptDigest: current.terminalAgent!.terminalReceiptDigest,
      resultingSnapshotDigest: current.resultingSnapshotDigest,
      resultingMorphologyEpoch: current.activation!.morphologyEpoch,
      disposition: input.disposition,
      outcomeEvidenceDigests: input.outcomeEvidenceDigests,
      evaluatedAtLogicalMs: input.logicalTimeMs,
    });
    return this.saveNext(current, { phase: "completed", receipt, pendingOperation: null, logicalTimeMs: input.logicalTimeMs });
  }

  activationInput(current: MorphogenesisExecutionRecordV1, logicalTimeMs: number) {
    return { operationId: current.pendingOperation!.operationId, morphologyHeadStateKey: current.morphologyHeadStateKey, scope: current.scope, expectedMorphologyEpoch: current.expectedMorphologyEpoch, proposalDigest: current.proposalDigest, decisionDigest: current.decisionDigest, resultingSnapshotDigest: current.resultingSnapshotDigest, team: current.team!, logicalTimeMs };
  }

  continuityInput(current: MorphogenesisExecutionRecordV1, logicalTimeMs: number) {
    return { operationId: current.pendingOperation!.operationId, scope: current.scope, proposalDigest: current.proposalDigest, agent: current.agent!, team: current.team!, logicalTimeMs };
  }

  fenceInput(current: MorphogenesisExecutionRecordV1, logicalTimeMs: number) {
    return { operationId: current.pendingOperation!.operationId, scope: current.scope, proposalDigest: current.proposalDigest, agent: current.agent!, team: current.team!, continuity: current.continuity!, logicalTimeMs };
  }

  detachmentInput(current: MorphogenesisExecutionRecordV1, logicalTimeMs: number) {
    return { operationId: current.pendingOperation!.operationId, scope: current.scope, proposalDigest: current.proposalDigest, agent: current.agent!, team: current.team!, fence: current.fence!, logicalTimeMs };
  }

  retirementInput(current: MorphogenesisExecutionRecordV1, logicalTimeMs: number, reasonCode = "morphogenesis_lifecycle_complete") {
    return { operationId: current.pendingOperation!.operationId, scope: current.scope, proposalDigest: current.proposalDigest, agent: current.agent!, fence: current.fence!, reasonCode, logicalTimeMs };
  }

  async required(stateKey: AgentPlatID): Promise<MorphogenesisExecutionRecordV1> {
    const value = await this.options.store.load(stateKey);
    if (!value) fail("Morphogenesis execution state is unavailable");
    return value;
  }

  async applyAgent(current: MorphogenesisExecutionRecordV1, input: MorphogenesisLifecycleAgentV1, logicalTimeMs: number): Promise<MorphogenesisExecutionRecordV1> {
    const agent = validateLifecycleAgent(input);
    if (current.profile && current.branch !== "recruit_existing" && agent.roleDefinitionDigest !== current.profile.roleDefinitionDigest)
      fail("created agent does not match the instantiation profile role");
    if (current.requiredCapabilityKeys.some((key) => !agent.capabilityKeys.includes(key)))
      fail("selected agent lacks a required capability");
    return this.saveNext(current, {
      phase: "agent_ready",
      agent,
      pendingOperation: current.pendingOperation ? { ...current.pendingOperation, status: "applied", resultDigest: agent.agentDigest } : null,
      logicalTimeMs,
    });
  }

  async applyAttestation(current: MorphogenesisExecutionRecordV1, input: MorphogenesisAgentAttestationV1, logicalTimeMs: number): Promise<MorphogenesisExecutionRecordV1> {
    const receipt = validateAttestation(input);
    if (receipt.agentDigest !== current.agent!.agentDigest || (current.profile && receipt.profileDigest !== current.profile.profileDigest) || logicalTimeMs >= receipt.validUntilLogicalMs)
      fail("Morphogenesis attestation binding is invalid");
    return this.saveNext(current, {
      phase: "attested",
      attestation: receipt,
      pendingOperation: { ...current.pendingOperation!, status: "applied", resultDigest: receipt.attestationDigest },
      logicalTimeMs,
    });
  }

  async applyTeam(current: MorphogenesisExecutionRecordV1, input: MorphogenesisSuccessorTeamReceiptV1, logicalTimeMs: number): Promise<MorphogenesisExecutionRecordV1> {
    const receipt = validateTeamReceipt(input);
    if (receipt.agentDigest !== current.agent!.agentDigest || receipt.individualWorkContractDigests.length < 1)
      fail("successor Team lacks exact individual Work authority");
    return this.saveNext(current, {
      phase: "team_active",
      team: receipt,
      pendingOperation: { ...current.pendingOperation!, status: "applied", resultDigest: receipt.receiptDigest },
      logicalTimeMs,
    });
  }

  async applyActivation(current: MorphogenesisExecutionRecordV1, receipt: MorphogenesisActivationReceiptV1, logicalTimeMs: number): Promise<MorphogenesisExecutionRecordV1> {
    if (receipt.operationId !== current.pendingOperation!.operationId || receipt.proposalDigest !== current.proposalDigest || receipt.decisionDigest !== current.decisionDigest || receipt.teamReceiptDigest !== current.team!.receiptDigest || receipt.resultingSnapshotDigest !== current.resultingSnapshotDigest || receipt.morphologyEpoch !== current.expectedMorphologyEpoch + 1)
      fail("Morphogenesis activation receipt binding is invalid");
    return this.saveNext(current, { phase: "morphology_active", activation: receipt, pendingOperation: { ...current.pendingOperation!, status: "applied", resultDigest: receipt.activationReceiptDigest }, logicalTimeMs });
  }

  async applyContinuity(current: MorphogenesisExecutionRecordV1, receipt: MorphogenesisContinuityReceiptV1, logicalTimeMs: number): Promise<MorphogenesisExecutionRecordV1> {
    if (receipt.operationId !== current.pendingOperation!.operationId || receipt.agentDigest !== current.agent!.agentDigest || receipt.teamReceiptDigest !== current.team!.receiptDigest)
      fail("Morphogenesis continuity receipt binding is invalid");
    return this.saveNext(current, { phase: "checkpointed", continuity: receipt, pendingOperation: { ...current.pendingOperation!, status: "applied", resultDigest: receipt.continuityReceiptDigest }, logicalTimeMs });
  }

  async applyFence(current: MorphogenesisExecutionRecordV1, receipt: MorphogenesisAuthorityFenceReceiptV1, logicalTimeMs: number): Promise<MorphogenesisExecutionRecordV1> {
    if (receipt.operationId !== current.pendingOperation!.operationId || receipt.agentDigest !== current.agent!.agentDigest || receipt.teamReceiptDigest !== current.team!.receiptDigest || current.team!.individualWorkContractDigests.some((digest) => !receipt.fencedWorkContractDigests.includes(digest)))
      fail("Morphogenesis authority fence receipt is incomplete");
    return this.saveNext(current, { phase: "fenced", fence: receipt, pendingOperation: { ...current.pendingOperation!, status: "applied", resultDigest: receipt.fenceReceiptDigest }, logicalTimeMs });
  }

  async applyTerminalAgent(current: MorphogenesisExecutionRecordV1, receipt: MorphogenesisTerminalAgentReceiptV1, logicalTimeMs: number): Promise<MorphogenesisExecutionRecordV1> {
    const expected = current.agent!.source === "existing" ? "detached" : "retired";
    if (receipt.operationId !== current.pendingOperation!.operationId || receipt.agentDigest !== current.agent!.agentDigest || receipt.disposition !== expected)
      fail("Morphogenesis terminal agent receipt is invalid");
    return this.saveNext(current, { phase: receipt.disposition, terminalAgent: receipt, pendingOperation: { ...current.pendingOperation!, status: "applied", resultDigest: receipt.terminalReceiptDigest }, logicalTimeMs });
  }

  async saveNext(current: MorphogenesisExecutionRecordV1, changes: Record<string, unknown> & { logicalTimeMs: number }): Promise<MorphogenesisExecutionRecordV1> {
    const { logicalTimeMs, ...values } = changes;
    const pending = (values.pendingOperation ?? current.pendingOperation) as
      | MorphogenesisExecutionOperationV1
      | null;
    const phase = (values.phase ?? current.phase) as MorphogenesisExecutionRecordV1["phase"];
    const evidenceDigests = [
      ...new Set([
      pending?.resultDigest,
      (values.agent as MorphogenesisLifecycleAgentV1 | undefined)?.agentDigest,
      (values.attestation as MorphogenesisAgentAttestationV1 | undefined)
        ?.attestationDigest,
      (values.team as MorphogenesisSuccessorTeamReceiptV1 | undefined)
        ?.receiptDigest,
      (values.activation as MorphogenesisActivationReceiptV1 | undefined)
        ?.activationReceiptDigest,
      (values.continuity as MorphogenesisContinuityReceiptV1 | undefined)
        ?.continuityReceiptDigest,
      (values.fence as MorphogenesisAuthorityFenceReceiptV1 | undefined)
        ?.fenceReceiptDigest,
      (values.terminalAgent as MorphogenesisTerminalAgentReceiptV1 | undefined)
        ?.terminalReceiptDigest,
      (values.receipt as MorphogenesisReceiptV1 | undefined)?.receiptDigest,
      values.budgetReleaseDigest as PlanningDigestV1 | undefined,
      ].filter((value): value is PlanningDigestV1 => Boolean(value))),
    ];
    const event = createExecutionEvent({
      sequence: current.events.length + 1,
      phase,
      outcome: pending ? pending.status : "state",
      operationId: pending?.operationId ?? null,
      evidenceDigests,
      logicalTimeMs,
      previousEventDigest: current.events.at(-1)?.eventDigest ?? null,
    });
    const next = createRecord({
      ...current,
      ...values,
      events: [...current.events, event],
      revision: current.revision + 1,
      logicalTimeHighWaterMs: Math.max(current.logicalTimeHighWaterMs, logicalTimeMs),
      predecessorRecordDigest: current.recordDigest,
      recordDigest: undefined,
    } as never);
    if (
      await this.options.store.save({
        record: next,
        expectedRevision: current.revision,
        expectedRecordDigest: current.recordDigest,
      })
    ) return next;
    const retained = await this.options.store.load(current.stateKey);
    if (retained && sameAppliedResult(retained, next)) return retained;
    fail("Morphogenesis execution changed concurrently");
  }
}

export function validateMorphogenesisExecutionRecordV1(
  input: unknown,
): MorphogenesisExecutionRecordV1 {
  if (!input || typeof input !== "object" || Array.isArray(input))
    fail("Morphogenesis execution record must be an object");
  const value = input as Record<string, unknown>;
  const expected = [
    "activation",
    "agent",
    "attestation",
    "branch",
    "budgetReleaseDigest",
    "budgetReservationDigest",
    "budgetReservationId",
    "continuity",
    "decisionDigest",
    "events",
    "expectedMorphologyEpoch",
    "fence",
    "logicalTimeHighWaterMs",
    "morphologyHeadStateKey",
    "pendingOperation",
    "phase",
    "positionDigest",
    "predecessorRecordDigest",
    "profile",
    "profileCertificationDigest",
    "proposalDigest",
    "receipt",
    "recordDigest",
    "requiredCapabilityKeys",
    "resultingSnapshotDigest",
    "revision",
    "schemaVersion",
    "scope",
    "searchRequest",
    "searchResult",
    "selectedCandidate",
    "stateKey",
    "team",
    "terminalAgent",
    "targetDigest",
  ].sort();
  if (
    Object.getOwnPropertySymbols(input).length > 0 ||
    Object.keys(value).sort().join(",") !== expected.join(",") ||
    value.schemaVersion !== 1
  )
    fail(
      `Morphogenesis execution record fields or schema are invalid: ${Object.keys(
        value,
      )
        .sort()
        .join(",")}`,
    );
  const { schemaVersion: _schema, recordDigest, ...body } = value;
  const result = createRecord(
    body as unknown as Omit<
      MorphogenesisExecutionRecordV1,
      "schemaVersion" | "recordDigest"
    >,
  );
  if (recordDigest !== result.recordDigest)
    fail("Morphogenesis execution record digest is invalid");
  return result;
}

export function createMorphogenesisCandidateSearchRequestV1(input: Omit<MorphogenesisCandidateSearchRequestV1, "schemaVersion" | "requestDigest">): MorphogenesisCandidateSearchRequestV1 {
  const body = freeze({ schemaVersion: 1 as const, requestId: id(input.requestId, "candidate search request ID"), scopeDigest: sha(input.scopeDigest, "candidate search scope digest"), positionDigest: sha(input.positionDigest, "candidate search position digest"), requiredCapabilityKeys: ids(input.requiredCapabilityKeys, "candidate search capabilities", 1, 256), membershipConfigurationDigest: sha(input.membershipConfigurationDigest, "candidate search membership digest"), membershipEpoch: positive(input.membershipEpoch, "candidate search membership epoch"), viewId: id(input.viewId, "candidate view ID"), viewDigest: sha(input.viewDigest, "candidate view digest"), searchLimit: boundedPositive(input.searchLimit, "candidate search limit", 100_000), requestedAtLogicalMs: nonNegative(input.requestedAtLogicalMs, "candidate search time"), expiresAtLogicalMs: positive(input.expiresAtLogicalMs, "candidate search expiry") });
  if (body.expiresAtLogicalMs <= body.requestedAtLogicalMs) fail("candidate search validity is invalid");
  return freeze({ ...body, requestDigest: digest("morphogenesis-candidate-search-request", body) });
}

export function createMorphogenesisExistingCandidateV1(input: Omit<MorphogenesisExistingCandidateV1, "schemaVersion" | "candidateDigest">): MorphogenesisExistingCandidateV1 {
  const body = freeze({ schemaVersion: 1 as const, candidateId: id(input.candidateId, "candidate ID"), agentId: id(input.agentId, "candidate agent ID"), peerId: id(input.peerId, "candidate peer ID"), instanceId: id(input.instanceId, "candidate instance ID"), lineageDigest: sha(input.lineageDigest, "candidate lineage digest"), capabilityKeys: ids(input.capabilityKeys, "candidate capabilities", 1, 256), sourceEvidenceDigest: sha(input.sourceEvidenceDigest, "candidate source evidence digest"), membershipConfigurationDigest: sha(input.membershipConfigurationDigest, "candidate membership digest"), membershipEpoch: positive(input.membershipEpoch, "candidate membership epoch"), locallyEvaluatedScoreMicros: nonNegative(input.locallyEvaluatedScoreMicros, "candidate score"), budgetUnits: positive(input.budgetUnits, "candidate budget"), observedAtLogicalMs: nonNegative(input.observedAtLogicalMs, "candidate observation time"), validUntilLogicalMs: positive(input.validUntilLogicalMs, "candidate validity") });
  if (body.validUntilLogicalMs <= body.observedAtLogicalMs) fail("candidate validity is invalid");
  return freeze({ ...body, candidateDigest: digest("morphogenesis-existing-candidate", body) });
}

export function createMorphogenesisCandidateSearchResultV1(input: Omit<MorphogenesisCandidateSearchResultV1, "schemaVersion" | "resultDigest">, request: MorphogenesisCandidateSearchRequestV1): MorphogenesisCandidateSearchResultV1 {
  const candidates = input.candidates.map((item) => createMorphogenesisExistingCandidateV1(stripDigest(item))).sort(candidateOrder);
  if (new Set(candidates.map(({ candidateId }) => candidateId)).size !== candidates.length || candidates.length > request.searchLimit) fail("candidate search result is duplicated or oversized");
  const body = freeze({ schemaVersion: 1 as const, requestDigest: sha(input.requestDigest, "candidate search request digest"), status: input.status, completeWithinDeclaredView: input.completeWithinDeclaredView, searchedCandidateCount: nonNegative(input.searchedCandidateCount, "searched candidate count"), candidates: freeze(candidates), observedAtLogicalMs: nonNegative(input.observedAtLogicalMs, "search result time") });
  if (body.requestDigest !== request.requestDigest || body.searchedCandidateCount > request.searchLimit || body.observedAtLogicalMs < request.requestedAtLogicalMs || body.observedAtLogicalMs >= request.expiresAtLogicalMs || (body.status === "eligible_candidates") !== (candidates.length > 0) || (body.status === "incomplete_bounded_view") === body.completeWithinDeclaredView || (body.status === "no_eligible_candidate_in_bounded_view" && !body.completeWithinDeclaredView)) fail("candidate search result binding is invalid");
  for (const candidate of candidates) if (candidate.membershipConfigurationDigest !== request.membershipConfigurationDigest || candidate.membershipEpoch !== request.membershipEpoch || candidate.observedAtLogicalMs > body.observedAtLogicalMs || body.observedAtLogicalMs >= candidate.validUntilLogicalMs || request.requiredCapabilityKeys.some((key) => !candidate.capabilityKeys.includes(key))) fail("candidate is stale, ineligible or membership-invalid");
  return freeze({ ...body, resultDigest: digest("morphogenesis-candidate-search-result", body) });
}

function validateSearchResult(input: MorphogenesisCandidateSearchResultV1, request: MorphogenesisCandidateSearchRequestV1): MorphogenesisCandidateSearchResultV1 { const { schemaVersion: _schema, resultDigest, ...body } = input; const result = createMorphogenesisCandidateSearchResultV1(body, request); if (resultDigest !== result.resultDigest) fail("candidate search result digest is invalid"); return result; }
function selectExistingCandidates(result: MorphogenesisCandidateSearchResultV1): readonly MorphogenesisExistingCandidateV1[] { return result.candidates.filter((item) => item.validUntilLogicalMs > result.observedAtLogicalMs).sort(candidateOrder); }
function candidateOrder(left: MorphogenesisExistingCandidateV1, right: MorphogenesisExistingCandidateV1): number { return right.locallyEvaluatedScoreMicros - left.locallyEvaluatedScoreMicros || left.budgetUnits - right.budgetUnits || left.candidateDigest.localeCompare(right.candidateDigest); }
function validateLifecycleAgent(input: MorphogenesisLifecycleAgentV1): MorphogenesisLifecycleAgentV1 { const body = freeze({ schemaVersion: 1 as const, agentId: id(input.agentId, "lifecycle agent ID"), peerId: id(input.peerId, "lifecycle peer ID"), instanceId: id(input.instanceId, "lifecycle instance ID"), lineageDigest: sha(input.lineageDigest, "lifecycle lineage digest"), capabilityKeys: ids(input.capabilityKeys, "lifecycle capabilities", 1, 256), roleDefinitionDigest: sha(input.roleDefinitionDigest, "lifecycle role digest"), membershipConfigurationDigest: sha(input.membershipConfigurationDigest, "lifecycle membership digest"), membershipEpoch: positive(input.membershipEpoch, "lifecycle membership epoch"), source: input.source }); if (!new Set(["existing", "catalog_created", "derived_created", "synthesized_created"]).has(body.source)) fail("lifecycle agent source is invalid"); const result = freeze({ ...body, agentDigest: digest("morphogenesis-lifecycle-agent", body) }); if (input.agentDigest !== result.agentDigest) fail("lifecycle agent digest is invalid"); return result; }

function createdBranch(profile: AgentInstantiationProfileAnyV1): Exclude<MorphogenesisExecutionRecordV1["branch"], "recruit_existing" | null> {
  return profile.creationMode === "derived"
    ? "derived_created"
    : profile.creationMode === "synthesized"
      ? "synthesized_created"
      : "catalog_created";
}
export function createMorphogenesisLifecycleAgentV1(input: Omit<MorphogenesisLifecycleAgentV1, "schemaVersion" | "agentDigest">): MorphogenesisLifecycleAgentV1 { const partial = { schemaVersion: 1 as const, ...input, agentDigest: "sha256:" + "0".repeat(64) } as MorphogenesisLifecycleAgentV1; const body = { ...partial }; delete (body as { agentDigest?: string }).agentDigest; return freeze({ ...body, agentDigest: digest("morphogenesis-lifecycle-agent", body) }) as MorphogenesisLifecycleAgentV1; }
export function createMorphogenesisAgentAttestationV1(input: Omit<MorphogenesisAgentAttestationV1, "schemaVersion" | "attestationDigest">): MorphogenesisAgentAttestationV1 { const body = freeze({ schemaVersion: 1 as const, operationId: id(input.operationId, "attestation operation ID"), agentDigest: sha(input.agentDigest, "attestation agent digest"), profileDigest: input.profileDigest === null ? null : sha(input.profileDigest, "attestation profile digest"), runtimeAttestationDigest: sha(input.runtimeAttestationDigest, "runtime attestation digest"), capabilityAssessmentDigests: digests(input.capabilityAssessmentDigests, "capability assessment digests", 1, 128), eligibilityEvidenceDigests: digests(input.eligibilityEvidenceDigests, "eligibility evidence digests", 1, 128), attestedAtLogicalMs: nonNegative(input.attestedAtLogicalMs, "attestation time"), validUntilLogicalMs: positive(input.validUntilLogicalMs, "attestation validity") }); if (body.validUntilLogicalMs <= body.attestedAtLogicalMs) fail("attestation validity is invalid"); return freeze({ ...body, attestationDigest: digest("morphogenesis-agent-attestation", body) }); }
function validateAttestation(input: MorphogenesisAgentAttestationV1): MorphogenesisAgentAttestationV1 { const result = createMorphogenesisAgentAttestationV1(stripDigest(input)); if (input.attestationDigest !== result.attestationDigest) fail("agent attestation digest is invalid"); return result; }
export function createMorphogenesisSuccessorTeamReceiptV1(input: Omit<MorphogenesisSuccessorTeamReceiptV1, "schemaVersion" | "receiptDigest">): MorphogenesisSuccessorTeamReceiptV1 { const body = freeze({ schemaVersion: 1 as const, operationId: id(input.operationId, "Team operation ID"), agentDigest: sha(input.agentDigest, "Team agent digest"), teamId: id(input.teamId, "Team ID"), teamEpoch: positive(input.teamEpoch, "Team epoch"), teamProposalDigest: sha(input.teamProposalDigest, "Team proposal digest"), jointWorkContractDigest: sha(input.jointWorkContractDigest, "joint Work Contract digest"), individualWorkContractDigests: digests(input.individualWorkContractDigests, "individual Work Contract digests", 1, 1_024), executionStateDigest: sha(input.executionStateDigest, "successor execution state digest"), retainedArtifactDigests: digests(input.retainedArtifactDigests, "retained execution artifacts", 0, 4_096), invalidatedCausalClosureDigests: digests(input.invalidatedCausalClosureDigests, "invalidated causal closure", 0, 4_096), activatedAtLogicalMs: nonNegative(input.activatedAtLogicalMs, "Team activation time") }); return freeze({ ...body, receiptDigest: digest("morphogenesis-successor-team-receipt", body) }); }
function validateTeamReceipt(input: MorphogenesisSuccessorTeamReceiptV1): MorphogenesisSuccessorTeamReceiptV1 { const result = createMorphogenesisSuccessorTeamReceiptV1(stripDigest(input)); if (input.receiptDigest !== result.receiptDigest) fail("successor Team receipt digest is invalid"); return result; }
function createRecord(input: Omit<MorphogenesisExecutionRecordV1, "schemaVersion" | "recordDigest"> & { recordDigest?: undefined }): MorphogenesisExecutionRecordV1 { const { recordDigest: _ignored, ...value } = input; const body = freeze({ schemaVersion: 1 as const, ...value, stateKey: id(value.stateKey, "execution state key"), scope: validateMorphogenesisScopeV1(value.scope), proposalDigest: sha(value.proposalDigest, "execution proposal digest"), targetDigest: sha(value.targetDigest, "execution target digest"), decisionDigest: sha(value.decisionDigest, "execution decision digest"), budgetReservationDigest: sha(value.budgetReservationDigest, "execution budget reservation digest"), budgetReservationId: id(value.budgetReservationId, "budget reservation ID"), budgetReleaseDigest: value.budgetReleaseDigest === null ? null : sha(value.budgetReleaseDigest, "budget release digest"), morphologyHeadStateKey: id(value.morphologyHeadStateKey, "morphology head state key"), expectedMorphologyEpoch: positive(value.expectedMorphologyEpoch, "expected morphology epoch"), resultingSnapshotDigest: sha(value.resultingSnapshotDigest, "resulting snapshot digest"), positionDigest: sha(value.positionDigest, "execution position digest"), requiredCapabilityKeys: ids(value.requiredCapabilityKeys, "execution capability keys", 1, 256), searchRequest: createMorphogenesisCandidateSearchRequestV1(stripDigest(value.searchRequest)), profileCertificationDigest: value.profileCertificationDigest === null ? null : sha(value.profileCertificationDigest, "profile certification digest"), events: validateExecutionEvents(value.events), revision: nonNegative(value.revision, "execution revision"), logicalTimeHighWaterMs: nonNegative(value.logicalTimeHighWaterMs, "execution logical time"), predecessorRecordDigest: value.predecessorRecordDigest === null ? null : sha(value.predecessorRecordDigest, "execution predecessor digest") }); return freeze({ ...body, recordDigest: digest("morphogenesis-execution-record", body) }); }
function sameAppliedResult(left: MorphogenesisExecutionRecordV1, right: MorphogenesisExecutionRecordV1): boolean { return left.phase === right.phase && left.pendingOperation?.resultDigest === right.pendingOperation?.resultDigest && left.agent?.agentDigest === right.agent?.agentDigest && left.attestation?.attestationDigest === right.attestation?.attestationDigest && left.team?.receiptDigest === right.team?.receiptDigest && left.activation?.activationReceiptDigest === right.activation?.activationReceiptDigest && left.continuity?.continuityReceiptDigest === right.continuity?.continuityReceiptDigest && left.fence?.fenceReceiptDigest === right.fence?.fenceReceiptDigest && left.terminalAgent?.terminalReceiptDigest === right.terminalAgent?.terminalReceiptDigest && left.budgetReleaseDigest === right.budgetReleaseDigest && left.receipt?.receiptDigest === right.receipt?.receiptDigest; }
function createExecutionEvent(input: Omit<MorphogenesisExecutionEventV1, "schemaVersion" | "eventDigest">): MorphogenesisExecutionEventV1 { const body = freeze({ schemaVersion: 1 as const, sequence: positive(input.sequence, "execution event sequence"), phase: input.phase, outcome: input.outcome, operationId: input.operationId === null ? null : id(input.operationId, "execution event operation ID"), evidenceDigests: digests(input.evidenceDigests, "execution event evidence", 0, 32), logicalTimeMs: nonNegative(input.logicalTimeMs, "execution event logical time"), previousEventDigest: input.previousEventDigest === null ? null : sha(input.previousEventDigest, "execution event predecessor") }); return freeze({ ...body, eventDigest: digest("morphogenesis-execution-event", body) }); }
function validateExecutionEvents(input: readonly MorphogenesisExecutionEventV1[]): readonly MorphogenesisExecutionEventV1[] { if (!Array.isArray(input) || input.length < 1 || input.length > 512) fail("execution event history is invalid"); const result = input.map((event, index) => { const { schemaVersion, eventDigest, ...body } = event; if (schemaVersion !== 1 || event.sequence !== index + 1 || event.previousEventDigest !== (index === 0 ? null : input[index - 1]!.eventDigest)) fail("execution event lineage is invalid"); const rebuilt = createExecutionEvent(body); if (rebuilt.eventDigest !== eventDigest) fail("execution event digest is invalid"); return rebuilt; }); return freeze(result); }
function stripDigest<T extends object>(input: T): Omit<T, "candidateDigest" | "requestDigest" | "resultDigest" | "attestationDigest" | "receiptDigest"> { const clone = { ...input } as Record<string, unknown>; for (const key of ["candidateDigest", "requestDigest", "resultDigest", "attestationDigest", "receiptDigest"]) delete clone[key]; return clone as never; }
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/+=-]{0,255}$/u; const DIGEST = /^sha256:[0-9a-f]{64}$/u;
function id(value: unknown, label: string): AgentPlatID { if (typeof value !== "string" || !IDENTIFIER.test(value)) fail(`${label} is invalid`); return value as AgentPlatID; }
function sha(value: unknown, label: string): PlanningDigestV1 { if (typeof value !== "string" || !DIGEST.test(value)) fail(`${label} is invalid`); return value as PlanningDigestV1; }
function positive(value: unknown, label: string): number { const result = nonNegative(value, label); if (result < 1) fail(`${label} is invalid`); return result; } function boundedPositive(value: unknown, label: string, max: number): number { const result = positive(value, label); if (result > max) fail(`${label} is too large`); return result; } function nonNegative(value: unknown, label: string): number { if (!Number.isSafeInteger(value) || (value as number) < 0) fail(`${label} is invalid`); return value as number; }
function ids(input: readonly unknown[], label: string, minimum: number, maximum: number): readonly string[] { if (!Array.isArray(input) || input.length < minimum || input.length > maximum) fail(`${label} count is invalid`); const result = input.map((value) => { if (typeof value !== "string" || !IDENTIFIER.test(value)) fail(`${label} value is invalid`); return value; }).sort(); if (new Set(result).size !== result.length) fail(`${label} contain duplicates`); return freeze(result); } function digests(input: readonly unknown[], label: string, minimum: number, maximum: number): readonly PlanningDigestV1[] { if (!Array.isArray(input) || input.length < minimum || input.length > maximum) fail(`${label} count is invalid`); const result = input.map((value) => sha(value, label)).sort(); if (new Set(result).size !== result.length) fail(`${label} contain duplicates`); return freeze(result); }
function digest(domain: PlanningDigestDomainV1, value: unknown): PlanningDigestV1 { return digestPlanningJsonV1(domain, value as PlanningJson); } function freeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const key of Object.getOwnPropertyNames(value)) freeze((value as Record<string, unknown>)[key]); } return value; } function immutable<T>(value: T): T { return freeze(structuredClone(value)); } function fail(message: string): never { throw new TypeError(message); }
