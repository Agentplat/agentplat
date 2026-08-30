import type { PlanningDigestV1 } from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";
import {
  invokeGovernedAgentLifecycleResumePeerV1,
  invokeGovernedAgentLifecycleSuspendPeerV1,
  type GovernedAgentLifecycleRuntimeV1,
} from "@agentplat/collective-membership/governed-agent-lifecycle";
import type { CollectiveMembershipKeyProofV1 } from "@agentplat/collective-membership";
import {
  activateTeamTopologyTransformationV1,
  certifyTeamTopologyTransformationV1,
  type TeamTopologyStateV1,
  type TeamTopologyTransformationRequestV1,
} from "@agentplat/collective-runtime/team-topology-transformation";
import {
  createMorphogenesisOperatorStepReceiptV2,
  createMorphogenesisAgentStatusReceiptV2,
  validateMorphogenesisAgentStatusReceiptV2,
  type MorphogenesisAgentStatusPortV2,
  type MorphogenesisAgentLifecyclePortV1,
  type MorphogenesisAgentAttestationPortV1,
  type MorphogenesisSuccessorTeamPortV1,
  type MorphogenesisContinuityPortV1,
  type MorphogenesisAuthorityFencePortV1,
  type MorphogenesisAgentRetirementPortV1,
  type MorphogenesisDetachmentPortV1,
  type MorphogenesisOperatorBoundaryPortV2,
  type MorphogenesisOperatorStepResolutionV2,
} from "@agentplat/collective-runtime/morphogenesis";

export interface GovernedMembershipMorphogenesisStatusResolutionPortV2 {
  resolve(agentDigest: PlanningDigestV1): Promise<{
    readonly peerId: AgentPlatID;
    readonly activeKeyProof?: CollectiveMembershipKeyProofV1;
  } | null>;
}

/** Canonical Morphogenesis status port backed by governed lineage and quorum membership. */
export class GovernedMembershipMorphogenesisAgentStatusPortV2
  implements MorphogenesisAgentStatusPortV2
{
  constructor(readonly options: {
    readonly lifecycle: GovernedAgentLifecycleRuntimeV1;
    readonly resolution: GovernedMembershipMorphogenesisStatusResolutionPortV2;
  }) {}

  suspend(input: Parameters<MorphogenesisAgentStatusPortV2["suspend"]>[0]) {
    return this.#change(input, "suspend");
  }
  reconcileSuspend(input: Parameters<MorphogenesisAgentStatusPortV2["reconcileSuspend"]>[0]) {
    return this.#change(input, "suspend");
  }
  resume(input: Parameters<MorphogenesisAgentStatusPortV2["resume"]>[0]) {
    return this.#change(input, "resume");
  }
  reconcileResume(input: Parameters<MorphogenesisAgentStatusPortV2["reconcileResume"]>[0]) {
    return this.#change(input, "resume");
  }

  async #change(
    input: Parameters<MorphogenesisAgentStatusPortV2["suspend"]>[0],
    mode: "suspend" | "resume",
  ) {
    const resolved = await this.options.resolution.resolve(input.agentDigest);
    if (!resolved) throw new TypeError("Morphogenesis governed membership target is unavailable");
    const agent = mode === "suspend"
      ? await invokeGovernedAgentLifecycleSuspendPeerV1(this.options.lifecycle, {
          peerId: resolved.peerId,
          logicalTimeMs: input.logicalTimeMs,
        })
      : await invokeGovernedAgentLifecycleResumePeerV1(this.options.lifecycle, {
          peerId: resolved.peerId,
          activeKeyProof: requiredKeyProof(resolved.activeKeyProof),
          logicalTimeMs: input.logicalTimeMs,
        });
    return createMorphogenesisAgentStatusReceiptV2({
      operationId: input.operationId,
      agentDigest: input.agentDigest,
      previousStatus: mode === "suspend" ? "active" : "suspended",
      nextStatus: mode === "suspend" ? "suspended" : "active",
      checkpointDigest: input.checkpointDigest,
      authorityFenceDigest: input.authorityFenceDigest,
      policyDigest: input.policyDigest,
      membershipConfigurationDigest: asDigest(agent.membershipConfigurationDigest!),
      membershipEpoch: agent.membershipEpoch!,
      effectReceiptDigest: asDigest(agent.lineageDigest),
      appliedAtLogicalMs: input.logicalTimeMs,
    });
  }
}

function requiredKeyProof(value: CollectiveMembershipKeyProofV1 | undefined) {
  if (!value) throw new TypeError("Morphogenesis resumption active-key proof is required");
  return value;
}

export interface MorphogenesisEvolvedProfileVerificationPortV2 {
  verify(input: {
    readonly profileDigest: PlanningDigestV1;
    readonly evolutionDigest: PlanningDigestV1;
    readonly attenuationDigest: PlanningDigestV1;
    readonly policyDigest: PlanningDigestV1;
    readonly logicalTimeMs: number;
  }): Promise<{ readonly verified: boolean; readonly verificationDigest: PlanningDigestV1 }>;
}

export interface MorphogenesisDerivedAgentResolutionPortV2 {
  resolveLifecycle(evolutionDigest: PlanningDigestV1): Promise<{
    readonly input: Parameters<MorphogenesisAgentLifecyclePortV1["createAndEnroll"]>[0];
    readonly authorizationDigest: PlanningDigestV1;
  } | null>;
  resolveAttestation(attenuationDigest: PlanningDigestV1): Promise<{
    readonly input: Parameters<MorphogenesisAgentAttestationPortV1["attest"]>[0];
    readonly authorizationDigest: PlanningDigestV1;
  } | null>;
  resolveTeam(targetDigest: PlanningDigestV1): Promise<{
    readonly input: Parameters<MorphogenesisSuccessorTeamPortV1["activateSuccessor"]>[0];
    readonly authorizationDigest: PlanningDigestV1;
  } | null>;
}

/** Executes derived or synthesized creation through the existing governed owners. */
export class DerivedAgentMorphogenesisBoundaryV2
  implements MorphogenesisOperatorBoundaryPortV2
{
  constructor(readonly options: {
    readonly profiles: MorphogenesisEvolvedProfileVerificationPortV2;
    readonly lifecycle: MorphogenesisAgentLifecyclePortV1;
    readonly attestation: MorphogenesisAgentAttestationPortV1;
    readonly teams: MorphogenesisSuccessorTeamPortV1;
    readonly resolution: MorphogenesisDerivedAgentResolutionPortV2;
  }) {}

  execute(input: Parameters<MorphogenesisOperatorBoundaryPortV2["execute"]>[0]) {
    return this.#run(input, false);
  }
  reconcile(input: Parameters<MorphogenesisOperatorBoundaryPortV2["reconcile"]>[0]) {
    return this.#run(input, true);
  }

  async #run(
    input: Parameters<MorphogenesisOperatorBoundaryPortV2["execute"]>[0],
    reconcile: boolean,
  ): Promise<MorphogenesisOperatorStepResolutionV2> {
    const binding = input.plan.binding;
    if (binding.operator !== "derive_agent")
      throw new TypeError("Morphogenesis derived-agent binding is invalid");
    let resultDigest: PlanningDigestV1;
    let appliedAtLogicalMs = input.logicalTimeMs;
    switch (input.step.operation) {
      case "verify_evolved_profile": {
        if (input.step.targetDigest !== binding.profileDigest)
          throw new TypeError("Morphogenesis evolved profile target is invalid");
        const result = await this.options.profiles.verify({
          profileDigest: binding.profileDigest,
          evolutionDigest: binding.evolutionDigest,
          attenuationDigest: binding.attenuationDigest,
          policyDigest: input.plan.policyDigest,
          logicalTimeMs: input.logicalTimeMs,
        });
        if (!result.verified) return { status: "not_applied" };
        resultDigest = asDigest(result.verificationDigest);
        break;
      }
      case "create_and_enroll": {
        if (input.step.targetDigest !== binding.evolutionDigest)
          throw new TypeError("Morphogenesis derived lifecycle target is invalid");
        const resolved = await this.options.resolution.resolveLifecycle(binding.evolutionDigest);
        if (!resolved) return { status: "not_applied" };
        authorizeDerived(resolved.authorizationDigest, input.authorizationDigest);
        if (resolved.input.profile.profileDigest !== binding.profileDigest ||
            resolved.input.proposalDigest !== input.proposalDigest)
          throw new TypeError("Morphogenesis derived lifecycle material is substituted");
        const agent = reconcile
          ? await this.options.lifecycle.reconcileCreateAndEnroll(resolved.input)
          : await this.options.lifecycle.createAndEnroll(resolved.input);
        const expectedSource = resolved.input.profile.creationMode === "synthesized"
          ? "synthesized_created"
          : resolved.input.profile.creationMode === "derived"
            ? "derived_created"
            : "catalog_created";
        if (agent.source !== expectedSource)
          throw new TypeError("Morphogenesis derived lifecycle source is invalid");
        resultDigest = asDigest(agent.agentDigest);
        break;
      }
      case "attest_created_agent": {
        if (input.step.targetDigest !== binding.attenuationDigest)
          throw new TypeError("Morphogenesis derived attestation target is invalid");
        const resolved = await this.options.resolution.resolveAttestation(binding.attenuationDigest);
        if (!resolved) return { status: "not_applied" };
        authorizeDerived(resolved.authorizationDigest, input.authorizationDigest);
        if (resolved.input.profile?.profileDigest !== binding.profileDigest ||
            resolved.input.agent.agentDigest !== priorResult(input, 1))
          throw new TypeError("Morphogenesis derived attestation material is substituted");
        const receipt = reconcile
          ? await this.options.attestation.reconcile(resolved.input)
          : await this.options.attestation.attest(resolved.input);
        resultDigest = asDigest(receipt.attestationDigest);
        appliedAtLogicalMs = receipt.attestedAtLogicalMs;
        break;
      }
      case "activate_successor_team": {
        const resolved = await this.options.resolution.resolveTeam(input.step.targetDigest);
        if (!resolved) return { status: "not_applied" };
        authorizeDerived(resolved.authorizationDigest, input.authorizationDigest);
        if (resolved.input.agent.agentDigest !== priorResult(input, 1) ||
            resolved.input.attestation.attestationDigest !== priorResult(input, 2))
          throw new TypeError("Morphogenesis derived Team material is substituted");
        const receipt = reconcile
          ? await this.options.teams.reconcileActivation(resolved.input)
          : await this.options.teams.activateSuccessor(resolved.input);
        resultDigest = asDigest(receipt.receiptDigest);
        appliedAtLogicalMs = receipt.activatedAtLogicalMs;
        break;
      }
      default:
        throw new TypeError("Morphogenesis derived-agent operation is unsupported");
    }
    return appliedReceipt(input, resultDigest, appliedAtLogicalMs);
  }
}

function priorResult(
  input: Parameters<MorphogenesisOperatorBoundaryPortV2["execute"]>[0],
  index: number,
): PlanningDigestV1 {
  const receipt = input.priorReceipts[index];
  if (!receipt) throw new TypeError("Morphogenesis derived prerequisite receipt is unavailable");
  return receipt.resultDigest;
}

function authorizeDerived(
  resolved: PlanningDigestV1,
  expected: PlanningDigestV1,
) {
  if (resolved !== expected)
    throw new TypeError("Morphogenesis derived-agent authorization is invalid");
}

export interface MorphogenesisReplacementResolutionPortV2 {
  resolveSuccessor(targetDigest: PlanningDigestV1): Promise<{
    readonly input: Parameters<MorphogenesisAgentLifecyclePortV1["createAndEnroll"]>[0];
    readonly authorizationDigest: PlanningDigestV1;
  } | null>;
  resolveAttestation(targetDigest: PlanningDigestV1): Promise<{
    readonly input: Parameters<MorphogenesisAgentAttestationPortV1["attest"]>[0];
    readonly authorizationDigest: PlanningDigestV1;
  } | null>;
  resolveTeam(targetDigest: PlanningDigestV1): Promise<{
    readonly input: Parameters<MorphogenesisSuccessorTeamPortV1["activateSuccessor"]>[0];
    readonly authorizationDigest: PlanningDigestV1;
  } | null>;
  resolveContinuity(targetDigest: PlanningDigestV1): Promise<{
    readonly input: Parameters<MorphogenesisContinuityPortV1["checkpoint"]>[0];
    readonly authorizationDigest: PlanningDigestV1;
  } | null>;
  resolveFence(targetDigest: PlanningDigestV1): Promise<{
    readonly input: Parameters<MorphogenesisAuthorityFencePortV1["fence"]>[0];
    readonly authorizationDigest: PlanningDigestV1;
  } | null>;
  resolveTerminal(targetDigest: PlanningDigestV1): Promise<{
    readonly mode: "retire" | "detach";
    readonly input:
      | Parameters<MorphogenesisAgentRetirementPortV1["retire"]>[0]
      | Parameters<MorphogenesisDetachmentPortV1["detach"]>[0];
    readonly authorizationDigest: PlanningDigestV1;
  } | null>;
}

export class ReplacementMorphogenesisBoundaryV2
  implements MorphogenesisOperatorBoundaryPortV2
{
  constructor(
    readonly options: {
      readonly lifecycle: MorphogenesisAgentLifecyclePortV1;
      readonly attestation: MorphogenesisAgentAttestationPortV1;
      readonly teams: MorphogenesisSuccessorTeamPortV1;
      readonly continuity: MorphogenesisContinuityPortV1;
      readonly authority: MorphogenesisAuthorityFencePortV1;
      readonly retirement: MorphogenesisAgentRetirementPortV1;
      readonly detachment: MorphogenesisDetachmentPortV1;
      readonly resolution: MorphogenesisReplacementResolutionPortV2;
    },
  ) {}
  execute(input: Parameters<MorphogenesisOperatorBoundaryPortV2["execute"]>[0]) {
    return this.#run(input, false);
  }
  reconcile(input: Parameters<MorphogenesisOperatorBoundaryPortV2["reconcile"]>[0]) {
    return this.#run(input, true);
  }
  async #run(
    input: Parameters<MorphogenesisOperatorBoundaryPortV2["execute"]>[0],
    reconcile: boolean,
  ): Promise<MorphogenesisOperatorStepResolutionV2> {
    if (input.plan.binding.operator !== "replace_agent")
      throw new TypeError("Morphogenesis replacement binding is invalid");
    const target = input.step.targetDigest;
    let resolved: { readonly authorizationDigest: PlanningDigestV1 } | null;
    let resultDigest: PlanningDigestV1;
    let appliedAtLogicalMs = input.logicalTimeMs;
    switch (input.step.operation) {
      case "resolve_or_create_successor": {
        const value = await this.options.resolution.resolveSuccessor(target);
        resolved = value;
        if (!value) return { status: "not_applied" };
        this.#authorize(value, input);
        const agent = reconcile
          ? await this.options.lifecycle.reconcileCreateAndEnroll(value.input)
          : await this.options.lifecycle.createAndEnroll(value.input);
        resultDigest = asDigest(agent.agentDigest);
        break;
      }
      case "attest_successor": {
        const value = await this.options.resolution.resolveAttestation(target);
        resolved = value;
        if (!value) return { status: "not_applied" };
        this.#authorize(value, input);
        const receipt = reconcile
          ? await this.options.attestation.reconcile(value.input)
          : await this.options.attestation.attest(value.input);
        resultDigest = asDigest(receipt.attestationDigest);
        appliedAtLogicalMs = receipt.attestedAtLogicalMs;
        break;
      }
      case "activate_successor_team": {
        const value = await this.options.resolution.resolveTeam(target);
        resolved = value;
        if (!value) return { status: "not_applied" };
        this.#authorize(value, input);
        const receipt = reconcile
          ? await this.options.teams.reconcileActivation(value.input)
          : await this.options.teams.activateSuccessor(value.input);
        resultDigest = asDigest(receipt.receiptDigest);
        appliedAtLogicalMs = receipt.activatedAtLogicalMs;
        break;
      }
      case "checkpoint_predecessor_work": {
        const value = await this.options.resolution.resolveContinuity(target);
        resolved = value;
        if (!value) return { status: "not_applied" };
        this.#authorize(value, input);
        const receipt = reconcile
          ? await this.options.continuity.reconcile(value.input)
          : await this.options.continuity.checkpoint(value.input);
        resultDigest = asDigest(receipt.continuityReceiptDigest);
        appliedAtLogicalMs = receipt.completedAtLogicalMs;
        break;
      }
      case "fence_predecessor_authority": {
        const value = await this.options.resolution.resolveFence(target);
        resolved = value;
        if (!value) return { status: "not_applied" };
        this.#authorize(value, input);
        const receipt = reconcile
          ? await this.options.authority.reconcile(value.input)
          : await this.options.authority.fence(value.input);
        resultDigest = asDigest(receipt.fenceReceiptDigest);
        appliedAtLogicalMs = receipt.fencedAtLogicalMs;
        break;
      }
      case "drain_and_retire_predecessor": {
        const value = await this.options.resolution.resolveTerminal(target);
        resolved = value;
        if (!value) return { status: "not_applied" };
        this.#authorize(value, input);
        const receipt = value.mode === "retire"
          ? reconcile
            ? await this.options.retirement.reconcile(value.input as Parameters<MorphogenesisAgentRetirementPortV1["reconcile"]>[0])
            : await this.options.retirement.retire(value.input as Parameters<MorphogenesisAgentRetirementPortV1["retire"]>[0])
          : reconcile
            ? await this.options.detachment.reconcile(value.input as Parameters<MorphogenesisDetachmentPortV1["reconcile"]>[0])
            : await this.options.detachment.detach(value.input as Parameters<MorphogenesisDetachmentPortV1["detach"]>[0]);
        resultDigest = asDigest(receipt.terminalReceiptDigest);
        appliedAtLogicalMs = receipt.terminatedAtLogicalMs;
        break;
      }
      default:
        throw new TypeError("Morphogenesis replacement operation is unsupported");
    }
    return appliedReceipt(input, resultDigest, appliedAtLogicalMs);
  }
  #authorize(
    resolved: { readonly authorizationDigest: PlanningDigestV1 },
    input: Parameters<MorphogenesisOperatorBoundaryPortV2["execute"]>[0],
  ) {
    if (resolved.authorizationDigest !== input.authorizationDigest)
      throw new TypeError("Morphogenesis replacement authorization is invalid");
  }
}

export interface MorphogenesisAgentStatusResolutionPortV2 {
  resolve(input: {
    readonly agentDigest: PlanningDigestV1;
    readonly mode: "suspend" | "resume";
  }): Promise<{
    readonly port: MorphogenesisAgentStatusPortV2;
    readonly policyDigest: PlanningDigestV1;
    readonly morphogenesisAuthorizationDigest: PlanningDigestV1;
  } | null>;
}

export class AgentStatusMorphogenesisBoundaryV2
  implements MorphogenesisOperatorBoundaryPortV2
{
  constructor(readonly resolution: MorphogenesisAgentStatusResolutionPortV2) {}
  execute(input: Parameters<MorphogenesisOperatorBoundaryPortV2["execute"]>[0]) {
    return this.#run(input, false);
  }
  reconcile(input: Parameters<MorphogenesisOperatorBoundaryPortV2["reconcile"]>[0]) {
    return this.#run(input, true);
  }
  async #run(
    input: Parameters<MorphogenesisOperatorBoundaryPortV2["execute"]>[0],
    reconcile: boolean,
  ): Promise<MorphogenesisOperatorStepResolutionV2> {
    const binding = input.plan.binding;
    if (
      input.step.boundary !== "governed_agent_lifecycle" ||
      !new Set(["suspend_agent_membership", "resume_agent_membership"]).has(
        input.step.operation,
      ) ||
      (binding.operator !== "suspend_agent" &&
        binding.operator !== "resume_agent")
    ) throw new TypeError("Morphogenesis agent status boundary is invalid");
    const mode = input.step.operation.startsWith("suspend")
      ? "suspend"
      : "resume";
    const resolved = await this.resolution.resolve({
      agentDigest: input.step.targetDigest,
      mode,
    });
    if (!resolved) return { status: "not_applied" };
    if (resolved.morphogenesisAuthorizationDigest !== input.authorizationDigest)
      throw new TypeError("Morphogenesis agent status authorization is invalid");
    const expectedPolicyDigest =
      binding.operator === "suspend_agent"
        ? binding.suspensionPolicyDigest
        : binding.resumptionPolicyDigest;
    if (resolved.policyDigest !== expectedPolicyDigest)
      throw new TypeError("Morphogenesis agent status policy is substituted");
    const checkpoint = [...input.priorReceipts]
      .reverse()
      .find(({ boundary }) => boundary === "team_execution_continuity");
    if (!checkpoint) throw new TypeError("Morphogenesis agent status checkpoint is unavailable");
    const fence = [...input.priorReceipts]
      .reverse()
      .find(({ boundary }) => boundary === "work_action_fence");
    const change = {
      operationId: input.operationId,
      agentDigest: input.step.targetDigest,
      checkpointDigest: checkpoint.resultDigest,
      authorityFenceDigest: fence?.resultDigest ?? input.authorityFenceDigest,
      policyDigest: resolved.policyDigest,
      logicalTimeMs: input.logicalTimeMs,
      signal: input.signal,
    };
    const receipt = reconcile
      ? mode === "suspend"
        ? await resolved.port.reconcileSuspend(change)
        : await resolved.port.reconcileResume(change)
      : mode === "suspend"
        ? await resolved.port.suspend(change)
        : await resolved.port.resume(change);
    if (!receipt) return { status: "not_applied" };
    const verified = validateMorphogenesisAgentStatusReceiptV2(receipt);
    if (
      verified.operationId !== input.operationId ||
      verified.agentDigest !== input.step.targetDigest ||
      verified.checkpointDigest !== checkpoint.resultDigest ||
      verified.authorityFenceDigest !== change.authorityFenceDigest ||
      verified.policyDigest !== resolved.policyDigest ||
      verified.nextStatus !== (mode === "suspend" ? "suspended" : "active")
    ) throw new TypeError("Morphogenesis agent status receipt is substituted");
    return appliedReceipt(
      input,
      verified.statusReceiptDigest,
      verified.appliedAtLogicalMs,
    );
  }
}
import {
  type GovernedMissionLifecycleRuntimeV1,
} from "@agentplat/collective-runtime/mission-lifecycle";
import type {
  GovernedMissionRequestV1,
  GovernedMissionStateV1,
} from "@agentplat/collective-runtime/mission-lifecycle";
import type {
  RoleRealignmentPortableAgentV1,
  RunRoleRealignmentInputV1,
} from "@agentplat/inference-control/role-realignment/portable-agent";

export interface MorphogenesisRoleRealignmentResolutionPortV2 {
  resolve(requestDigest: PlanningDigestV1): Promise<{
    readonly runtime: RoleRealignmentPortableAgentV1;
    readonly input: RunRoleRealignmentInputV1;
    readonly currentRoleBindingDigest: PlanningDigestV1;
    readonly morphogenesisAuthorizationDigest: PlanningDigestV1;
    readonly authorityFenceDigest: PlanningDigestV1;
  } | null>;
}

/** Delegates the complete certified role saga to Inference Control. */
export class RoleRealignmentMorphogenesisBoundaryV2
  implements MorphogenesisOperatorBoundaryPortV2
{
  constructor(
    readonly resolution: MorphogenesisRoleRealignmentResolutionPortV2,
  ) {}
  execute(input: Parameters<MorphogenesisOperatorBoundaryPortV2["execute"]>[0]) {
    return this.#run(input);
  }
  reconcile(input: Parameters<MorphogenesisOperatorBoundaryPortV2["reconcile"]>[0]) {
    return this.#run(input);
  }
  async #run(
    input: Parameters<MorphogenesisOperatorBoundaryPortV2["execute"]>[0],
  ): Promise<MorphogenesisOperatorStepResolutionV2> {
    if (
      input.step.boundary !== "governed_role_realignment" ||
      input.step.operation !== "run_certified_role_realignment" ||
      input.plan.binding.operator !== "realign_role"
    ) throw new TypeError("Morphogenesis role realignment boundary is invalid");
    const resolved = await this.resolution.resolve(input.step.targetDigest);
    if (!resolved) return { status: "not_applied" };
    if (
      resolved.currentRoleBindingDigest !==
        input.plan.binding.currentRoleBindingDigest ||
      resolved.morphogenesisAuthorizationDigest !== input.authorizationDigest ||
      resolved.authorityFenceDigest !== input.authorityFenceDigest
    ) throw new TypeError("Morphogenesis role realignment authority binding is invalid");
    const state = await resolved.runtime.run({
      ...resolved.input,
      logicalTimeMs: input.logicalTimeMs,
      signal: input.signal,
    });
    if (state.request.requestDigest !== input.step.targetDigest)
      throw new TypeError("Morphogenesis role realignment request is substituted");
    if (state.status === "activated")
      return appliedReceipt(
        input,
        state.activation!.activationDigest as PlanningDigestV1,
        state.activation!.completedAtLogicalMs!,
      );
    if (state.status === "expired" || state.status === "failed")
      return {
        status: "indeterminate",
        evidenceDigest: state.stateDigest as PlanningDigestV1,
      };
    return {
      status: "pending",
      evidenceDigest: state.stateDigest as PlanningDigestV1,
    };
  }
}

export class MorphogenesisOperatorBoundaryRouterV2
  implements MorphogenesisOperatorBoundaryPortV2
{
  readonly #ports = new Map<
    string,
    MorphogenesisOperatorBoundaryPortV2
  >();
  constructor(
    registrations: readonly {
      readonly boundaries: readonly string[];
      readonly port: MorphogenesisOperatorBoundaryPortV2;
    }[],
  ) {
    for (const registration of registrations) {
      if (!registration.port) throw new TypeError("Morphogenesis boundary port is required");
      for (const boundary of registration.boundaries) {
        if (this.#ports.has(boundary))
          throw new TypeError("Morphogenesis boundary is registered more than once");
        this.#ports.set(boundary, registration.port);
      }
    }
  }
  execute(input: Parameters<MorphogenesisOperatorBoundaryPortV2["execute"]>[0]) {
    return this.#resolve(input.step.boundary).execute(input);
  }
  reconcile(input: Parameters<MorphogenesisOperatorBoundaryPortV2["reconcile"]>[0]) {
    return this.#resolve(input.step.boundary).reconcile(input);
  }
  #resolve(boundary: string) {
    const port = this.#ports.get(boundary);
    if (!port) throw new TypeError("Morphogenesis execution boundary is unavailable");
    return port;
  }
}

export interface MorphogenesisMissionWorkResolutionPortV2 {
  resolveMission(commandDigest: PlanningDigestV1): Promise<{
    readonly runtime: GovernedMissionLifecycleRuntimeV1;
    readonly request: GovernedMissionRequestV1;
    readonly morphogenesisAuthorizationDigest: PlanningDigestV1;
    readonly authorityFenceDigest: PlanningDigestV1;
  } | null>;
  resolveWorkReceipt(workContractDigest: PlanningDigestV1): Promise<{
    readonly commandDigest: PlanningDigestV1;
    readonly missionResultDigest: PlanningDigestV1;
    readonly workContractDigest: PlanningDigestV1;
    readonly workReceiptDigest: PlanningDigestV1;
    readonly issuedAtLogicalMs: number;
  } | null>;
}

/** Adapter that observes the nominal Mission Lifecycle outbox; it issues no Work authority itself. */
export class MissionWorkReassignmentMorphogenesisBoundaryV2
  implements MorphogenesisOperatorBoundaryPortV2
{
  constructor(
    readonly resolution: MorphogenesisMissionWorkResolutionPortV2,
  ) {}
  execute(input: Parameters<MorphogenesisOperatorBoundaryPortV2["execute"]>[0]) {
    return this.#run(input, false);
  }
  reconcile(input: Parameters<MorphogenesisOperatorBoundaryPortV2["reconcile"]>[0]) {
    return this.#run(input, true);
  }
  async #run(
    input: Parameters<MorphogenesisOperatorBoundaryPortV2["execute"]>[0],
    recover: boolean,
  ): Promise<MorphogenesisOperatorStepResolutionV2> {
    if (input.step.boundary !== "mission_work_reassignment")
      throw new TypeError("Morphogenesis Mission Work boundary is invalid");
    if (input.step.operation === "enact_work_reassignment") {
      const resolved = await this.resolution.resolveMission(
        input.step.targetDigest,
      );
      if (!resolved) return { status: "not_applied" };
      if (
        resolved.morphogenesisAuthorizationDigest !== input.authorizationDigest ||
        resolved.authorityFenceDigest !== input.authorityFenceDigest
      ) throw new TypeError("Morphogenesis Mission Work authority binding is invalid");
      const state = recover
        ? await resolved.runtime.recover(resolved.request)
        : await resolved.runtime.advance(resolved.request);
      const outbox = appliedWorkReassignment(
        state,
        input.step.targetDigest,
      );
      if (!outbox) return { status: "not_applied" };
      return appliedReceipt(
        input,
        outbox.resultDigest!,
        resolved.request.logicalTimeMs,
      );
    }
    if (
      input.step.operation !== "issue_successor_work_contract" &&
      input.step.operation !== "rebind_resumed_work"
    )
      throw new TypeError("Morphogenesis Mission Work operation is invalid");
    const receipt = await this.resolution.resolveWorkReceipt(
      input.step.targetDigest,
    );
    if (!receipt) return { status: "not_applied" };
    if (receipt.workContractDigest !== input.step.targetDigest)
      throw new TypeError("Morphogenesis successor Work receipt is substituted");
    return appliedReceipt(
      input,
      receipt.workReceiptDigest,
      receipt.issuedAtLogicalMs,
    );
  }
}

function appliedWorkReassignment(
  state: GovernedMissionStateV1,
  commandDigest: PlanningDigestV1,
) {
  return state.outbox.find(
    (entry) =>
      entry.action === "enact_work_reassignment" &&
      entry.status === "applied" &&
      entry.resultDigest !== null &&
      (entry.controlProposalDigest === commandDigest ||
        entry.intentDigest === commandDigest),
  );
}

function appliedReceipt(
  input: Parameters<MorphogenesisOperatorBoundaryPortV2["execute"]>[0],
  resultDigest: PlanningDigestV1,
  appliedAtLogicalMs: number,
): MorphogenesisOperatorStepResolutionV2 {
  return {
    status: "applied",
    receipt: createMorphogenesisOperatorStepReceiptV2({
      operationId: input.operationId,
      planDigest: input.plan.planDigest,
      stepId: input.step.stepId,
      stepDigest: input.step.stepDigest,
      boundary: input.step.boundary,
      resultDigest,
      appliedAtLogicalMs,
    }),
  };
}

function asDigest(value: string): PlanningDigestV1 {
  if (!/^sha256:[0-9a-f]{64}$/u.test(value))
    throw new TypeError("Morphogenesis boundary result digest is invalid");
  return value as PlanningDigestV1;
}

export interface MorphogenesisTeamTopologyStateStoreV2 {
  load(topologyId: AgentPlatID): Promise<TeamTopologyStateV1 | null>;
  save(input: {
    readonly state: TeamTopologyStateV1;
    readonly expectedStateDigest: PlanningDigestV1;
  }): Promise<boolean>;
}

export interface MorphogenesisTeamTopologyRequestResolutionPortV2 {
  resolve(requestDigest: PlanningDigestV1): Promise<{
    readonly topologyId: AgentPlatID;
    readonly request: TeamTopologyTransformationRequestV1;
  } | null>;
}

export class InMemoryMorphogenesisTeamTopologyStateStoreV2
  implements MorphogenesisTeamTopologyStateStoreV2
{
  readonly #states = new Map<string, TeamTopologyStateV1>();
  constructor(states: readonly TeamTopologyStateV1[] = []) {
    for (const state of states)
      this.#states.set(state.topologyId, structuredClone(state));
  }
  async load(topologyId: AgentPlatID) {
    const state = this.#states.get(topologyId);
    return state ? Object.freeze(structuredClone(state)) : null;
  }
  async save(input: {
    readonly state: TeamTopologyStateV1;
    readonly expectedStateDigest: PlanningDigestV1;
  }) {
    const current = this.#states.get(input.state.topologyId);
    if (!current || current.stateDigest !== input.expectedStateDigest)
      return false;
    this.#states.set(input.state.topologyId, structuredClone(input.state));
    return true;
  }
}

/** Durable adapter from compiled Morphogenesis topology steps to the existing topology reducer. */
export class TeamTopologyMorphogenesisBoundaryV2
  implements MorphogenesisOperatorBoundaryPortV2
{
  constructor(
    readonly options: {
      readonly store: MorphogenesisTeamTopologyStateStoreV2;
      readonly requests: MorphogenesisTeamTopologyRequestResolutionPortV2;
    },
  ) {}

  async execute(
    input: Parameters<MorphogenesisOperatorBoundaryPortV2["execute"]>[0],
  ): Promise<MorphogenesisOperatorStepResolutionV2> {
    if (input.step.boundary !== "team_topology_transformation")
      throw new TypeError("Morphogenesis topology adapter boundary is invalid");
    const resolved = await this.#resolve(input);
    const current = await this.options.store.load(resolved.topologyId);
    if (!current) throw new TypeError("Morphogenesis topology state is unavailable");
    if (input.step.operation.startsWith("certify_")) {
      const retained = current.transformations.find(
        ({ transformationId }) =>
          transformationId === resolved.request.transformationId,
      );
      if (retained)
        return retained.status === "certified" || retained.status === "activated"
          ? this.#applied(input, retained.transformationDigest, resolved.request)
          : this.#indeterminate(retained.transformationDigest);
      const next = certifyTeamTopologyTransformationV1({
        state: current,
        request: resolved.request,
      });
      if (
        !(await this.options.store.save({
          state: next,
          expectedStateDigest: current.stateDigest,
        }))
      ) return this.reconcile(input);
      const transformation = next.transformations.find(
        ({ transformationId }) =>
          transformationId === resolved.request.transformationId,
      )!;
      return this.#applied(
        input,
        transformation.transformationDigest,
        resolved.request,
      );
    }
    if (!input.step.operation.startsWith("activate_"))
      throw new TypeError("Morphogenesis topology step operation is invalid");
    const retained = current.transformations.find(
      ({ transformationId }) =>
        transformationId === resolved.request.transformationId,
    );
    if (!retained) return { status: "not_applied" };
    if (retained.status === "activated")
      return this.#applied(input, current.stateDigest, resolved.request);
    if (retained.status !== "certified")
      return this.#indeterminate(retained.transformationDigest);
    const next = activateTeamTopologyTransformationV1({
      state: current,
      transformationId: retained.transformationId,
    });
    if (
      !(await this.options.store.save({
        state: next,
        expectedStateDigest: current.stateDigest,
      }))
    ) return this.reconcile(input);
    return this.#applied(input, next.stateDigest, resolved.request);
  }

  async reconcile(
    input: Parameters<MorphogenesisOperatorBoundaryPortV2["reconcile"]>[0],
  ): Promise<MorphogenesisOperatorStepResolutionV2> {
    if (input.step.boundary !== "team_topology_transformation")
      throw new TypeError("Morphogenesis topology adapter boundary is invalid");
    const resolved = await this.#resolve(input);
    const current = await this.options.store.load(resolved.topologyId);
    if (!current) throw new TypeError("Morphogenesis topology state is unavailable");
    const retained = current.transformations.find(
      ({ transformationId }) =>
        transformationId === resolved.request.transformationId,
    );
    if (!retained) return { status: "not_applied" };
    if (input.step.operation.startsWith("certify_") &&
      (retained.status === "certified" || retained.status === "activated"))
      return this.#applied(input, retained.transformationDigest, resolved.request);
    if (input.step.operation.startsWith("activate_") && retained.status === "activated")
      return this.#applied(input, current.stateDigest, resolved.request);
    if (retained.status === "certified") return { status: "not_applied" };
    return this.#indeterminate(retained.transformationDigest);
  }

  async #resolve(input: Parameters<MorphogenesisOperatorBoundaryPortV2["execute"]>[0]) {
    const binding = input.plan.binding;
    if (binding.operator !== "split_team" && binding.operator !== "merge_teams" &&
        binding.operator !== "federate_teams")
      throw new TypeError("Morphogenesis topology binding is invalid");
    const requestDigest = binding.transformationRequestDigest;
    if (requestDigest !== input.step.targetDigest)
      throw new TypeError("Morphogenesis topology step target is invalid");
    const resolved = await this.options.requests.resolve(requestDigest);
    const expectedOperation = binding.operator === "split_team"
      ? "split"
      : binding.operator === "merge_teams" ? "merge" : "federate";
    if (!resolved || resolved.request.requestDigest !== requestDigest ||
        resolved.request.operation !== expectedOperation ||
        resolved.request.policyDigest !== binding.topologyPolicyDigest ||
        binding.topologyPolicyDigest !== input.plan.policyDigest)
      throw new TypeError("Morphogenesis topology request is unavailable or substituted");
    if (input.logicalTimeMs < resolved.request.requestedAtLogicalMs ||
        input.logicalTimeMs > resolved.request.validUntilLogicalMs)
      throw new TypeError("Morphogenesis topology request is outside its validity window");
    return resolved;
  }

  #applied(
    input: Parameters<MorphogenesisOperatorBoundaryPortV2["execute"]>[0],
    resultDigest: PlanningDigestV1,
    request: TeamTopologyTransformationRequestV1,
  ): MorphogenesisOperatorStepResolutionV2 {
    return {
      status: "applied",
      receipt: createMorphogenesisOperatorStepReceiptV2({
        operationId: input.operationId,
        planDigest: input.plan.planDigest,
        stepId: input.step.stepId,
        stepDigest: input.step.stepDigest,
        boundary: input.step.boundary,
        resultDigest,
        appliedAtLogicalMs: request.requestedAtLogicalMs,
      }),
    };
  }

  #indeterminate(evidenceDigest: PlanningDigestV1): MorphogenesisOperatorStepResolutionV2 {
    return { status: "indeterminate", evidenceDigest };
  }
}
