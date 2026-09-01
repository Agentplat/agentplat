import {
  invokeGovernedAgentLifecycleCreateAndEnrollV1,
  invokeGovernedAgentLifecycleEligibilityV1,
  invokeGovernedAgentLifecycleReconcileCreateAndEnrollV1,
  invokeGovernedAgentLifecycleReconcileRetirementV1,
  invokeGovernedAgentLifecycleRetirePeerV1,
  type GovernedAgentLifecycleRuntimeV1,
} from "@agentplat/collective-membership/governed-agent-lifecycle";
import {
  createAgentCreationRequestV1,
  type AgentCreationCertificateV1,
  type AgentCreationRequestV1,
} from "@agentplat/collective-membership/agent-lineage";
import type { WorkContractV1 } from "@agentplat/collective-control/mesh";
import type {
  ProcessTaskExecutionRequestV1,
  ProcessTaskExecutionResultV1,
  TaskExecutorPortV1,
} from "@agentplat/workflows";
import type { ActionGateway } from "@agentplat/inference-control/tools";
import type { CollectiveHostTelemetryPortV1 } from "./collective-telemetry.js";
import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import {
  type AgentInstantiationProfileCertificationPortV1,
  type AgentInstantiationProfileCertificationPortV2,
  type AgentInstantiationProfileCertificationV1,
  type AgentInstantiationProfileAnyV1,
  type AgentInstantiationProfileV2Context,
  type AgentInstantiationAuthorityAttenuationPortV1,
  type AgentInstantiationSynthesisCertificationPortV1,
  type MorphogenesisScopeV1,
  type MorphogenesisAgentLifecyclePortV1,
  type MorphogenesisAgentAttestationPortV1,
  type MorphogenesisAgentRetirementPortV1,
  type MorphogenesisContinuityPortV1,
  type MorphogenesisAuthorityFencePortV1,
  type MorphogenesisLifecycleAgentV1,
  type MorphogenesisSuccessorTeamPortV1,
  createMorphogenesisLifecycleAgentV1,
  createMorphogenesisContinuityReceiptV1,
  createMorphogenesisAuthorityFenceReceiptV1,
  createMorphogenesisAgentAttestationV1,
  createMorphogenesisSuccessorTeamReceiptV1,
  createMorphogenesisTerminalAgentReceiptV1,
  validateAgentInstantiationProfileCertificationV1,
  validateAgentInstantiationProfileV1,
  validateAgentInstantiationProfileV2,
  validateMorphogenesisScopeV1,
} from "@agentplat/collective-runtime/morphogenesis";
import {
  validateGovernedRoleCertificationV2,
  validateGovernedRoleDefinitionV2,
  type GovernedRoleCertificationV2,
  type GovernedRoleDefinitionV2,
} from "@agentplat/inference-control/governed-role-evolution";
import type {
  TeamFormationPortV1,
  TeamFormationRequestV1,
} from "@agentplat/collective-runtime/team-formation";
import type {
  TeamExecutionContinuityCheckpointV1,
  TeamExecutionContinuityPortV1,
} from "@agentplat/collective-runtime/team-execution-continuity";

/**
 * Host-layer adapter from the portable Morphogenesis profile into the existing
 * governed agent-creation contract. It creates no certificate or authority.
 */
export async function compileAgentInstantiationProfileToCreationRequestV1(
  input: {
    readonly requestId: string;
    readonly parentAgentId: string;
    readonly requestedAgentId: string;
    readonly requestedPeerId: string;
    readonly requestedInstanceId: string;
    readonly factoryId: string;
    readonly scope: MorphogenesisScopeV1;
    readonly expectedProfilePolicyDigest: PlanningDigestV1;
    readonly proposedAuthorityDigest: PlanningDigestV1;
    readonly parentAuthorityDigest: PlanningDigestV1;
    readonly requestedAtLogicalMs: number;
    readonly expiresAtLogicalMs: number;
    readonly profile: AgentInstantiationProfileAnyV1;
    readonly profileV2Context?: AgentInstantiationProfileV2Context;
    readonly profileCertification: AgentInstantiationProfileCertificationV1;
    readonly role: GovernedRoleDefinitionV2;
    readonly roleCertification: GovernedRoleCertificationV2;
    readonly certification?: AgentInstantiationProfileCertificationPortV1;
    readonly certificationV2?: AgentInstantiationProfileCertificationPortV2;
    readonly authorityAttenuationVerification?:
      AgentInstantiationAuthorityAttenuationPortV1;
    readonly synthesisCertificationVerification?:
      AgentInstantiationSynthesisCertificationPortV1;
    readonly crypto?: Crypto;
  },
): Promise<AgentCreationRequestV1> {
  const scope = validateMorphogenesisScopeV1(input.scope);
  const role = validateGovernedRoleDefinitionV2(input.role);
  const roleCertification = validateGovernedRoleCertificationV2(
    input.roleCertification,
  );
  let profile: AgentInstantiationProfileAnyV1;
  let profileV2Context: AgentInstantiationProfileV2Context | undefined;
  if (input.profile.schemaVersion === 2) {
    if (!input.profileV2Context)
      fail("instantiation profile V2 context is unavailable");
    profileV2Context = {
      ...input.profileV2Context,
      materialProfile: validateAgentInstantiationProfileV1(
        input.profileV2Context.materialProfile,
        { role, roleCertification },
      ),
    };
    profile = validateAgentInstantiationProfileV2(
      input.profile,
      profileV2Context,
    );
  } else {
    profile = validateAgentInstantiationProfileV1(input.profile, {
      role,
      roleCertification,
    });
  }
  const profileCertification =
    validateAgentInstantiationProfileCertificationV1(
      input.profileCertification,
    );
  const logicalTimeMs = nonNegative(
    input.requestedAtLogicalMs,
    "creation request time",
  );
  if (
    profile.tenantId !== scope.tenantId ||
    profile.missionId !== scope.missionId ||
    profile.objectiveId !== scope.objectiveId ||
    profile.roomId !== scope.roomId ||
    profile.workItemId !== scope.workItemId ||
    profile.workItemRevision !== scope.workItemRevision ||
    profileCertification.profileDigest !== profile.profileDigest ||
    profileCertification.policyDigest !==
      input.expectedProfilePolicyDigest ||
    profileCertification.roleCertificationDigest !==
      profile.roleCertificationDigest ||
    profileCertification.validUntilLogicalMs > profile.expiresAtLogicalMs ||
    logicalTimeMs < profile.validFromLogicalMs ||
    logicalTimeMs >= profile.expiresAtLogicalMs ||
    logicalTimeMs >= profileCertification.validUntilLogicalMs ||
    input.proposedAuthorityDigest !== profile.authorityCeilingDigest ||
    input.expiresAtLogicalMs <= logicalTimeMs ||
    input.expiresAtLogicalMs > profile.expiresAtLogicalMs ||
    input.expiresAtLogicalMs > profileCertification.validUntilLogicalMs
  )
    fail("instantiation profile is stale, cross-scoped or authority-invalid");
  if (profile.schemaVersion === 1) {
    if (
      !input.certification ||
      !(await input.certification.verify({
        profile,
        certification: profileCertification,
        role,
        roleCertification,
        logicalTimeMs,
      }))
    )
      fail("instantiation profile certification was denied");
  } else {
    const context = profileV2Context!;
    if (
      !input.certificationV2 ||
      !(await input.certificationV2.verify({
        profile,
        profileCertification,
        evolution: context.evolution,
        attenuation: context.attenuation,
        synthesisCertification: context.synthesisCertification,
        role,
        roleCertification,
        logicalTimeMs,
      }))
    )
      fail("instantiation profile V2 certification was denied");
    if (
      profile.creationMode !== "catalog" &&
      (!context.evolution ||
        !context.attenuation ||
        !input.authorityAttenuationVerification ||
        !(await input.authorityAttenuationVerification.verify({
          evolution: context.evolution,
          attenuation: context.attenuation,
          logicalTimeMs,
        })))
    )
      fail("instantiation profile authority attenuation was denied");
    if (
      profile.creationMode === "synthesized" &&
      (!context.evolution ||
        !context.synthesisCertification ||
        !input.synthesisCertificationVerification ||
        !(await input.synthesisCertificationVerification.verify({
          evolution: context.evolution,
          certification: context.synthesisCertification,
          logicalTimeMs,
        })))
    )
      fail("instantiation profile synthesis certification was denied");
  }
  return createAgentCreationRequestV1(
    {
      requestId: input.requestId,
      parentAgentId: input.parentAgentId,
      requestedAgentId: input.requestedAgentId,
      requestedPeerId: input.requestedPeerId,
      requestedInstanceId: input.requestedInstanceId,
      factoryId: input.factoryId,
      adapterId: profile.adapterId,
      adapterVersion: profile.adapterVersion,
      capabilityKeys: profile.capabilityKeys,
      roleDefinitionDigest: profile.roleDefinitionDigest,
      proposedAuthorityDigest: input.proposedAuthorityDigest,
      parentAuthorityDigest: input.parentAuthorityDigest,
      localRuleProgramDigest: profile.localRuleProgramDigest,
      resourceBudgetUnits: profile.resourceBudgetUnits,
      interactionBudgetUnits: profile.interactionBudgetUnits,
      requestedAtLogicalMs: logicalTimeMs,
      expiresAtLogicalMs: input.expiresAtLogicalMs,
    },
    input.crypto,
  );
}

type GovernedCreateInput = Parameters<
  GovernedAgentLifecycleRuntimeV1["createAndEnroll"]
>[0];

export interface MorphogenesisAgentCreationMaterialPortV1 {
  prepare(input: {
    readonly operationId: string;
    readonly scope: MorphogenesisScopeV1;
    readonly proposalDigest: PlanningDigestV1;
    readonly profile: AgentInstantiationProfileAnyV1;
    readonly logicalTimeMs: number;
  }): Promise<{
    readonly request: AgentCreationRequestV1;
    readonly certificate: AgentCreationCertificateV1;
    readonly activeKeyProof: GovernedCreateInput["activeKeyProof"];
    readonly binding?: MorphogenesisAgentCreationMaterialBindingV2;
  }>;
}

export interface MorphogenesisAgentCreationMaterialBindingV2 {
  readonly schemaVersion: 2;
  readonly operationId: string;
  readonly scopeDigest: PlanningDigestV1;
  readonly proposalDigest: PlanningDigestV1;
  readonly profileDigest: PlanningDigestV1;
  readonly requestDigest: PlanningDigestV1;
  readonly certificateDigest: PlanningDigestV1;
  readonly bindingDigest: PlanningDigestV1;
}

export function createMorphogenesisAgentCreationMaterialBindingV2(
  input: Omit<MorphogenesisAgentCreationMaterialBindingV2, "schemaVersion" | "bindingDigest">,
): MorphogenesisAgentCreationMaterialBindingV2 {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:@/+=-]{0,255}$/u.test(input.operationId))
    fail("agent creation material operation ID is invalid");
  const body = Object.freeze({
    schemaVersion: 2 as const,
    operationId: input.operationId,
    scopeDigest: asDigest(input.scopeDigest, "creation material scope digest"),
    proposalDigest: asDigest(input.proposalDigest, "creation material proposal digest"),
    profileDigest: asDigest(input.profileDigest, "creation material profile digest"),
    requestDigest: asDigest(input.requestDigest, "creation material request digest"),
    certificateDigest: asDigest(input.certificateDigest, "creation material certificate digest"),
  });
  return Object.freeze({
    ...body,
    bindingDigest: digestPlanningJsonV1(
      "morphogenesis-agent-creation-material-binding-v2",
      body as unknown as PlanningJson,
    ),
  });
}

export class GovernedAgentLifecycleMorphogenesisPortV1
  implements
    MorphogenesisAgentLifecyclePortV1,
    MorphogenesisAgentRetirementPortV1
{
  constructor(
    readonly options: {
      readonly lifecycle: GovernedAgentLifecycleRuntimeV1;
      readonly material: MorphogenesisAgentCreationMaterialPortV1;
    },
  ) {}

  async createAndEnroll(
    input: Parameters<MorphogenesisAgentLifecyclePortV1["createAndEnroll"]>[0],
  ): Promise<MorphogenesisLifecycleAgentV1> {
    const prepared = await this.#material(input);
    const agent = await invokeGovernedAgentLifecycleCreateAndEnrollV1(
      this.options.lifecycle,
      {
        ...prepared,
        logicalTimeMs: input.logicalTimeMs,
        signal: input.signal,
        correlation: { missionId: input.scope.missionId },
      },
    );
    return lifecycleAgent(agent, createdSource(input.profile));
  }

  async reconcileCreateAndEnroll(
    input: Parameters<
      MorphogenesisAgentLifecyclePortV1["reconcileCreateAndEnroll"]
    >[0],
  ): Promise<MorphogenesisLifecycleAgentV1> {
    const prepared = await this.#material(input);
    const agent = await invokeGovernedAgentLifecycleReconcileCreateAndEnrollV1(
      this.options.lifecycle,
      {
        ...prepared,
        logicalTimeMs: input.logicalTimeMs,
        signal: input.signal,
        correlation: { missionId: input.scope.missionId },
      },
    );
    return lifecycleAgent(agent, createdSource(input.profile));
  }

  async eligibility(
    input: Parameters<MorphogenesisAgentLifecyclePortV1["eligibility"]>[0],
  ): Promise<MorphogenesisLifecycleAgentV1 | null> {
    const decision = await invokeGovernedAgentLifecycleEligibilityV1(
      this.options.lifecycle,
      { peerId: input.peerId, instanceId: input.instanceId },
    );
    if (
      !decision.eligible ||
      !decision.agent ||
      decision.membershipConfigurationDigest !==
        input.membershipConfigurationDigest ||
      decision.membershipEpoch !== input.membershipEpoch ||
      input.requiredCapabilityKeys.some(
        (key) => !decision.agent!.capabilityKeys.includes(key),
      )
    )
      return null;
    return lifecycleAgent(decision.agent, input.expectedSource);
  }

  async retire(
    input: Parameters<MorphogenesisAgentRetirementPortV1["retire"]>[0],
  ) {
    return this.#retire(input, false);
  }

  async reconcile(
    input: Parameters<MorphogenesisAgentRetirementPortV1["reconcile"]>[0],
  ) {
    return this.#retire(input, true);
  }

  async #retire(
    input: Parameters<MorphogenesisAgentRetirementPortV1["retire"]>[0],
    reconcile: boolean,
  ) {
    if (input.fence.agentDigest !== input.agent.agentDigest)
      fail("agent retirement lacks its authority fence");
    const retired = await (reconcile
      ? invokeGovernedAgentLifecycleReconcileRetirementV1(
          this.options.lifecycle,
          {
            peerId: input.agent.peerId,
            reasonCode: input.reasonCode,
            cascade: false,
            logicalTimeMs: input.logicalTimeMs,
          },
        )
      : invokeGovernedAgentLifecycleRetirePeerV1(this.options.lifecycle, {
          peerId: input.agent.peerId,
          reasonCode: input.reasonCode,
          cascade: false,
          logicalTimeMs: input.logicalTimeMs,
        }));
    return createMorphogenesisTerminalAgentReceiptV1({
      operationId: input.operationId,
      agentDigest: input.agent.agentDigest,
      disposition: "retired",
      membershipConfigurationDigest: retired.membershipConfigurationDigest,
      membershipEpoch: retired.membershipEpoch,
      lifecycleReceiptDigest: retired.retirementDigest,
      terminatedAtLogicalMs: retired.retiredAtLogicalMs,
    });
  }

  async #material(input: {
    readonly operationId: string;
    readonly scope: MorphogenesisScopeV1;
    readonly proposalDigest: PlanningDigestV1;
    readonly profile: AgentInstantiationProfileAnyV1;
    readonly logicalTimeMs: number;
  }) {
    const prepared = await this.options.material.prepare(input);
    const request = prepared.request;
    const profile = input.profile;
    if (
      request.requestId !== input.operationId ||
      request.adapterId !== profile.adapterId ||
      request.adapterVersion !== profile.adapterVersion ||
      JSON.stringify(request.capabilityKeys) !== JSON.stringify(profile.capabilityKeys) ||
      request.roleDefinitionDigest !== profile.roleDefinitionDigest ||
      request.proposedAuthorityDigest !== profile.authorityCeilingDigest ||
      request.localRuleProgramDigest !== profile.localRuleProgramDigest ||
      request.resourceBudgetUnits !== profile.resourceBudgetUnits ||
      request.interactionBudgetUnits !== profile.interactionBudgetUnits ||
      request.requestedAtLogicalMs !== input.logicalTimeMs ||
      prepared.certificate.requestDigest !== request.requestDigest ||
      prepared.certificate.roleDefinitionDigest !== request.roleDefinitionDigest
    ) fail("agent creation material substituted the Morphogenesis profile");
    if (prepared.binding) {
      const expected = createMorphogenesisAgentCreationMaterialBindingV2({
        operationId: input.operationId,
        scopeDigest: input.scope.scopeDigest,
        proposalDigest: input.proposalDigest,
        profileDigest: profile.profileDigest,
        requestDigest: request.requestDigest as PlanningDigestV1,
        certificateDigest: prepared.certificate.certificateDigest as PlanningDigestV1,
      });
      if (JSON.stringify(prepared.binding) !== JSON.stringify(expected))
        fail("agent creation material binding is invalid");
    } else if (profile.schemaVersion === 2) {
      fail("agent creation material V2 binding is required");
    }
    return prepared;
  }
}

export interface MorphogenesisTeamActivationCommandPortV1 {
  buildFormationRequest(
    input: Parameters<
      MorphogenesisSuccessorTeamPortV1["activateSuccessor"]
    >[0],
  ): Promise<TeamFormationRequestV1>;
  resolveWorkContracts(input: {
    readonly operation: Parameters<
      MorphogenesisSuccessorTeamPortV1["activateSuccessor"]
    >[0];
    readonly proposal: NonNullable<
      Awaited<ReturnType<TeamFormationPortV1["form"]>>["proposal"]
    >;
  }): Promise<readonly WorkContractV1[]>;
  continueExecution(input: {
    readonly operation: Parameters<
      MorphogenesisSuccessorTeamPortV1["activateSuccessor"]
    >[0];
    readonly proposal: NonNullable<
      Awaited<ReturnType<TeamFormationPortV1["form"]>>["proposal"]
    >;
    readonly jointWorkContract: Awaited<
      ReturnType<TeamFormationPortV1["activate"]>
    >;
  }): Promise<{
    readonly executionStateDigest: PlanningDigestV1;
    readonly retainedArtifactDigests: readonly PlanningDigestV1[];
    readonly invalidatedCausalClosureDigests: readonly PlanningDigestV1[];
  }>;
}

export class TeamFormationMorphogenesisSuccessorPortV1
  implements MorphogenesisSuccessorTeamPortV1
{
  constructor(
    readonly options: {
      readonly formation: TeamFormationPortV1;
      readonly commands: MorphogenesisTeamActivationCommandPortV1;
    },
  ) {}

  activateSuccessor(
    input: Parameters<MorphogenesisSuccessorTeamPortV1["activateSuccessor"]>[0],
  ) {
    return this.#activate(input);
  }

  reconcileActivation(
    input: Parameters<
      MorphogenesisSuccessorTeamPortV1["reconcileActivation"]
    >[0],
  ) {
    return this.#activate(input);
  }

  async #activate(
    input: Parameters<MorphogenesisSuccessorTeamPortV1["activateSuccessor"]>[0],
  ) {
    const formationRequest =
      await this.options.commands.buildFormationRequest(input);
    if (
      formationRequest.requestId !== input.operationId ||
      formationRequest.scope.tenantId !== input.scope.tenantId ||
      formationRequest.scope.missionIntentId !==
        input.scope.missionIntentId ||
      formationRequest.scope.objectiveId !== input.scope.objectiveId ||
      (input.scope.workItemId !== null &&
        formationRequest.scope.rootWorkItemId !== input.scope.workItemId) ||
      !formationRequest.bids.some(
        ({ candidate }) =>
          candidate.peerId === input.agent.peerId &&
          candidate.instanceId === input.agent.instanceId,
      )
    )
      fail("Team Formation command is stale or cross-scoped");
    const decision = await this.options.formation.form(formationRequest);
    if (!decision.proposal || decision.status !== "formed")
      fail("successor Team could not be formed");
    if (
      !decision.proposal.members.some(
        ({ peerId, instanceId, positionDigest }) =>
          peerId === input.agent.peerId &&
          instanceId === input.agent.instanceId &&
          positionDigest === input.positionDigest,
      )
    )
      fail("formed Team does not contain the attested Morphogenesis agent");
    const workContracts = await this.options.commands.resolveWorkContracts({
      operation: input,
      proposal: decision.proposal,
    });
    const joint = await this.options.formation.activate({
      proposalDigest: decision.proposal.proposalDigest,
      workContracts,
      logicalTimeMs: input.logicalTimeMs,
    });
    const execution = await this.options.commands.continueExecution({
      operation: input,
      proposal: decision.proposal,
      jointWorkContract: joint,
    });
    return createMorphogenesisSuccessorTeamReceiptV1({
      operationId: input.operationId,
      agentDigest: input.agent.agentDigest,
      teamId: joint.teamId,
      teamEpoch: joint.teamEpoch,
      teamProposalDigest: joint.proposalDigest,
      jointWorkContractDigest: joint.jointWorkContractDigest,
      individualWorkContractDigests: joint.memberContracts.map(
        ({ workContractDigest }) => workContractDigest,
      ),
      executionStateDigest: execution.executionStateDigest,
      retainedArtifactDigests: execution.retainedArtifactDigests,
      invalidatedCausalClosureDigests:
        execution.invalidatedCausalClosureDigests,
      activatedAtLogicalMs: joint.activatedAtLogicalMs,
    });
  }
}

export interface MorphogenesisContinuityProjectionPortV1 {
  project(input: {
    readonly checkpoint: TeamExecutionContinuityCheckpointV1;
    readonly proposalDigest: PlanningDigestV1;
  }): Promise<{
    readonly preservedArtifactDigests: readonly PlanningDigestV1[];
    readonly completedCausalNodeDigests: readonly PlanningDigestV1[];
    readonly invalidatedCausalClosureDigests: readonly PlanningDigestV1[];
  }>;
}

export class TeamExecutionContinuityMorphogenesisPortV1
  implements MorphogenesisContinuityPortV1
{
  constructor(
    readonly options: {
      readonly continuity: TeamExecutionContinuityPortV1;
      readonly projection: MorphogenesisContinuityProjectionPortV1;
    },
  ) {}

  checkpoint(input: Parameters<MorphogenesisContinuityPortV1["checkpoint"]>[0]) {
    return this.#checkpoint(input);
  }

  reconcile(input: Parameters<MorphogenesisContinuityPortV1["reconcile"]>[0]) {
    return this.#checkpoint(input);
  }

  async #checkpoint(
    input: Parameters<MorphogenesisContinuityPortV1["checkpoint"]>[0],
  ) {
    const checkpoint = await this.options.continuity.checkpoint({
      checkpointId: input.operationId,
      targetStateKey: `${input.operationId}:target`,
      logicalTimeMs: input.logicalTimeMs,
    });
    if (
      checkpoint.checkpointId !== input.operationId ||
      checkpoint.scope.tenantId !== input.scope.tenantId ||
      checkpoint.scope.missionIntentId !== input.scope.missionIntentId ||
      checkpoint.scope.objectiveId !== input.scope.objectiveId ||
      (input.scope.workItemId !== null &&
        checkpoint.scope.rootWorkItemId !== input.scope.workItemId) ||
      checkpoint.membershipEpoch !== input.agent.membershipEpoch ||
      checkpoint.membershipConfigurationDigest !==
        input.agent.membershipConfigurationDigest
    )
      fail("Team Execution checkpoint is stale or cross-scoped");
    const projection = await this.options.projection.project({
      checkpoint,
      proposalDigest: input.proposalDigest,
    });
    return createMorphogenesisContinuityReceiptV1({
      operationId: input.operationId,
      agentDigest: input.agent.agentDigest,
      teamReceiptDigest: input.team.receiptDigest,
      checkpointDigest: checkpoint.checkpointDigest,
      preservedArtifactDigests: projection.preservedArtifactDigests,
      completedCausalNodeDigests: projection.completedCausalNodeDigests,
      invalidatedCausalClosureDigests:
        projection.invalidatedCausalClosureDigests,
      completedAtLogicalMs: input.logicalTimeMs,
    });
  }
}

export interface MorphogenesisWorkActionFenceCommandPortV1 {
  fence(input: Parameters<MorphogenesisAuthorityFencePortV1["fence"]>[0]): Promise<{
    readonly fencedWorkContractDigests: readonly PlanningDigestV1[];
    readonly revokedActionGrantDigests: readonly PlanningDigestV1[];
    readonly successorFenceDigests: readonly PlanningDigestV1[];
    readonly effectReceiptDigest: PlanningDigestV1;
  }>;
  reconcile(input: Parameters<MorphogenesisAuthorityFencePortV1["reconcile"]>[0]): Promise<{
    readonly fencedWorkContractDigests: readonly PlanningDigestV1[];
    readonly revokedActionGrantDigests: readonly PlanningDigestV1[];
    readonly successorFenceDigests: readonly PlanningDigestV1[];
    readonly effectReceiptDigest: PlanningDigestV1;
  }>;
}

export class WorkActionMorphogenesisAuthorityFencePortV1
  implements MorphogenesisAuthorityFencePortV1
{
  constructor(readonly commands: MorphogenesisWorkActionFenceCommandPortV1) {}

  async fence(input: Parameters<MorphogenesisAuthorityFencePortV1["fence"]>[0]) {
    return this.#apply(input, await this.commands.fence(input));
  }

  async reconcile(input: Parameters<MorphogenesisAuthorityFencePortV1["reconcile"]>[0]) {
    return this.#apply(input, await this.commands.reconcile(input));
  }

  #apply(
    input: Parameters<MorphogenesisAuthorityFencePortV1["fence"]>[0],
    result: Awaited<ReturnType<MorphogenesisWorkActionFenceCommandPortV1["fence"]>>,
  ) {
    if (
      input.team.individualWorkContractDigests.some(
        (digest) => !result.fencedWorkContractDigests.includes(digest),
      ) ||
      result.successorFenceDigests.length < 1 ||
      !/^sha256:[0-9a-f]{64}$/u.test(result.effectReceiptDigest)
    )
      fail("Work/Action fence result is incomplete");
    return createMorphogenesisAuthorityFenceReceiptV1({
      operationId: input.operationId,
      agentDigest: input.agent.agentDigest,
      teamReceiptDigest: input.team.receiptDigest,
      fencedWorkContractDigests: result.fencedWorkContractDigests,
      revokedActionGrantDigests: result.revokedActionGrantDigests,
      successorFenceDigests: result.successorFenceDigests,
      effectReceiptDigest: result.effectReceiptDigest,
      fencedAtLogicalMs: input.logicalTimeMs,
    });
  }
}

export interface MorphogenesisRuntimeAttestationVerifierV1 {
  verify(input: Parameters<MorphogenesisAgentAttestationPortV1["attest"]>[0]): Promise<PlanningDigestV1 | null>;
}

export interface MorphogenesisCapabilityAssessmentPortV1 {
  assess(input: Parameters<MorphogenesisAgentAttestationPortV1["attest"]>[0]): Promise<readonly PlanningDigestV1[] | null>;
}

export interface MorphogenesisEligibilityEvidencePortV1 {
  evaluate(input: Parameters<MorphogenesisAgentAttestationPortV1["attest"]>[0]): Promise<{
    readonly eligible: boolean;
    readonly current: boolean;
    readonly evidenceDigest: PlanningDigestV1;
  }>;
}

export class TrustInferenceMorphogenesisAttestationPortV1
  implements MorphogenesisAgentAttestationPortV1
{
  constructor(
    readonly options: {
      readonly runtime: MorphogenesisRuntimeAttestationVerifierV1;
      readonly capabilities: MorphogenesisCapabilityAssessmentPortV1;
      readonly trust: MorphogenesisEligibilityEvidencePortV1;
      readonly inference: MorphogenesisEligibilityEvidencePortV1;
      readonly receiptTtlMs: number;
    },
  ) {
    if (
      !Number.isSafeInteger(options.receiptTtlMs) ||
      options.receiptTtlMs < 1
    )
      fail("Morphogenesis attestation TTL is invalid");
  }

  attest(input: Parameters<MorphogenesisAgentAttestationPortV1["attest"]>[0]) {
    return this.#attest(input);
  }

  reconcile(input: Parameters<MorphogenesisAgentAttestationPortV1["reconcile"]>[0]) {
    return this.#attest(input);
  }

  async #attest(
    input: Parameters<MorphogenesisAgentAttestationPortV1["attest"]>[0],
  ) {
    const [runtime, capabilities, trust, inference] = await Promise.all([
      this.options.runtime.verify(input),
      this.options.capabilities.assess(input),
      this.options.trust.evaluate(input),
      this.options.inference.evaluate(input),
    ]);
    if (
      !runtime ||
      !capabilities ||
      capabilities.length < 1 ||
      !trust.eligible ||
      !trust.current ||
      !inference.eligible ||
      !inference.current
    )
      fail("Morphogenesis Trust/Inference attestation was denied");
    return createMorphogenesisAgentAttestationV1({
      operationId: input.operationId,
      agentDigest: input.agent.agentDigest,
      profileDigest: input.profile?.profileDigest ?? null,
      runtimeAttestationDigest: runtime,
      capabilityAssessmentDigests: capabilities,
      eligibilityEvidenceDigests: [
        trust.evidenceDigest,
        inference.evidenceDigest,
      ],
      attestedAtLogicalMs: input.logicalTimeMs,
      validUntilLogicalMs: input.logicalTimeMs + this.options.receiptTtlMs,
    });
  }
}

export interface MorphogenesisActionGatewayResolutionPortV1 {
  resolve(input: {
    readonly task: ProcessTaskExecutionRequestV1;
    readonly logicalTimeMs: number;
  }): Promise<{
    readonly gateway: ActionGateway;
    readonly grantId: string;
  } | null>;
}

/** Protected executor: the Action Gateway dispatcher owns the actual effect. */
export class MorphogenesisActionGatewayTaskExecutorV1
  implements TaskExecutorPortV1
{
  constructor(
    readonly options: {
      readonly gateways: MorphogenesisActionGatewayResolutionPortV1;
      readonly clock: {
        read(task: ProcessTaskExecutionRequestV1): number;
      };
    },
  ) {}

  async execute(
    task: ProcessTaskExecutionRequestV1,
  ): Promise<ProcessTaskExecutionResultV1> {
    const logicalTimeMs = this.options.clock.read(task);
    const resolved = await this.options.gateways.resolve({
      task,
      logicalTimeMs,
    });
    if (!resolved)
      return {
        status: "failed",
        reasonCode: "morphogenesis_action_gateway_unavailable",
      };
    let result;
    try {
      result = await resolved.gateway.invoke({
        schemaVersion: 1,
        grantId: resolved.grantId,
        input: {
          tenantId: task.tenantId,
          runId: task.runId,
          stageId: task.stage.stageId,
          taskRunId: task.taskRunId,
          taskIdempotencyKey: task.idempotencyKey,
          bindingDigest: task.binding.bindingDigest,
        },
        logicalTimeMs,
      });
    } catch {
      return {
        status: "indeterminate",
        reasonCode: "morphogenesis_action_gateway_indeterminate",
      };
    }
    if (!result.ok)
      return {
        status: "failed",
        reasonCode: "morphogenesis_action_gateway_denied",
      };
    const value = result.value;
    if (!value || typeof value !== "object" || Array.isArray(value))
      return {
        status: "indeterminate",
        reasonCode: "morphogenesis_action_result_invalid",
      };
    const record = value as Record<string, unknown>;
    if (
      record.status !== "completed" ||
      typeof record.resultReference !== "string" ||
      typeof record.resultDigest !== "string" ||
      !/^sha256:[0-9a-f]{64}$/u.test(record.resultDigest)
    )
      return {
        status: "indeterminate",
        reasonCode: "morphogenesis_action_result_invalid",
      };
    return {
      status: "completed",
      resultReference: record.resultReference,
      resultDigest: record.resultDigest as `sha256:${string}`,
    };
  }
}

/** Publishes the durable content-free event chain into signed telemetry. */
export class MorphogenesisTelemetryPublisherV1 {
  constructor(readonly telemetry: CollectiveHostTelemetryPortV1) {}

  async publish(input: {
    readonly execution: import("@agentplat/collective-runtime/morphogenesis").MorphogenesisExecutionRecordV1;
    readonly afterSequence?: number;
  }): Promise<number> {
    const afterSequence = input.afterSequence ?? 0;
    if (!Number.isSafeInteger(afterSequence) || afterSequence < 0)
      fail("Morphogenesis telemetry cursor is invalid");
    let cursor = afterSequence;
    for (const event of input.execution.events) {
      if (event.sequence <= afterSequence) continue;
      if (event.sequence !== cursor + 1)
        fail("Morphogenesis telemetry event sequence is discontinuous");
      await this.telemetry.record({
        category: "coordination",
        operation: "morphogenesis.transition",
        outcome:
          event.outcome === "prepared"
            ? "started"
            : event.outcome === "applied"
              ? "completed"
              : "accepted",
        logicalTimeMs: event.logicalTimeMs,
        operationDigest: event.eventDigest,
        evidenceDigests: event.evidenceDigests,
        correlation: {
          missionId: input.execution.scope.missionId,
          decisionId: input.execution.decisionDigest,
          ...(event.operationId ? { effectId: event.operationId } : {}),
        },
      });
      cursor = event.sequence;
    }
    return cursor;
  }
}

function lifecycleAgent(
  input: {
    readonly agentId: string;
    readonly peerId: string;
    readonly instanceId: string;
    readonly lineageDigest: string;
    readonly capabilityKeys: readonly string[];
    readonly roleDefinitionDigest: string;
    readonly membershipConfigurationDigest: string | null;
    readonly membershipEpoch: number | null;
    readonly status: string;
  },
  source: MorphogenesisLifecycleAgentV1["source"],
): MorphogenesisLifecycleAgentV1 {
  if (
    input.status !== "active" ||
    !input.membershipConfigurationDigest ||
    input.membershipEpoch === null
  )
    fail("governed lifecycle agent is not an active member");
  return createMorphogenesisLifecycleAgentV1({
    agentId: input.agentId,
    peerId: input.peerId,
    instanceId: input.instanceId,
    lineageDigest: asDigest(input.lineageDigest, "agent lineage digest"),
    capabilityKeys: input.capabilityKeys,
    roleDefinitionDigest: asDigest(
      input.roleDefinitionDigest,
      "agent role definition digest",
    ),
    membershipConfigurationDigest: asDigest(
      input.membershipConfigurationDigest,
      "agent membership digest",
    ),
    membershipEpoch: input.membershipEpoch,
    source,
  });
}

function createdSource(
  profile: AgentInstantiationProfileAnyV1,
): Exclude<MorphogenesisLifecycleAgentV1["source"], "existing"> {
  return profile.creationMode === "derived"
    ? "derived_created"
    : profile.creationMode === "synthesized"
      ? "synthesized_created"
      : "catalog_created";
}

function asDigest(value: string, label: string): PlanningDigestV1 {
  if (!/^sha256:[0-9a-f]{64}$/u.test(value)) fail(`${label} is invalid`);
  return value as PlanningDigestV1;
}

function nonNegative(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    fail(`${label} is invalid`);
  return value as number;
}

function fail(message: string): never {
  throw new TypeError(message);
}
