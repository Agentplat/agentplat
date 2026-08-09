import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import {
  createCollectiveDecisionCandidateV1,
  validateCollectiveDecisionCertificateV1,
  validateCollectiveDecisionScopeV1,
  validateCollectiveDecisionV1,
} from "./collective-decision-validation.js";
import type { CollectiveDecisionV1 } from "./collective-decision-contracts.js";
import { mechanismAllocationEventDigestV1 } from "./mechanism-allocation-validation.js";
import { createTeamMemberContractBindingsV1 } from "./team-formation-adapters.js";
import {
  createJointWorkContractV1,
  createTeamFormationRequestV1,
  createTeamMemberSelectionV1,
  createTeamPositionBidV1,
  createTeamProposalV1,
  validateJointWorkContractV1,
  validateTeamCandidateV1,
  validateTeamFormationDecisionV1,
  validateTeamFormationRequestInvalidationV1,
  validateTeamFormationRequestV1,
  validateTeamPositionV1,
  validateTeamProposalV1,
} from "./team-formation-validation.js";
import type {
  MechanismAllocationPlanV1,
  MechanismAllocationStateV1,
} from "./mechanism-allocation-contracts.js";
import type {
  DistributedTeamAllocationActivationContextV2,
  DistributedTeamAllocationFenceV2,
  DistributedTeamAllocationPortV2,
  DistributedTeamAllocationRuntimeOptionsV2,
  DistributedTeamAllocationStateV2,
  DistributedTeamAllocationStoreV2,
} from "./distributed-team-allocation-contracts.js";
import { DISTRIBUTED_TEAM_ALLOCATION_STATE_FORMAT_V2 } from "./distributed-team-allocation-contracts.js";

export class DistributedTeamAllocationRuntimeV2 implements DistributedTeamAllocationPortV2 {
  readonly #o: DistributedTeamAllocationRuntimeOptionsV2;
  constructor(options: DistributedTeamAllocationRuntimeOptionsV2) {
    if (
      !options ||
      !options.store ||
      !options.allocation ||
      !options.decision ||
      !options.formation ||
      !options.activation ||
      !options.events ||
      !options.candidates ||
      !options.workContracts ||
      typeof options.store.load !== "function" ||
      typeof options.store.save !== "function" ||
      typeof options.allocation.loadState !== "function" ||
      typeof options.allocation.submit !== "function" ||
      typeof options.decision.decide !== "function" ||
      typeof options.decision.verify !== "function" ||
      typeof options.formation.form !== "function" ||
      typeof options.formation.invalidate !== "function" ||
      typeof options.formation.cancel !== "function" ||
      typeof options.formation.loadState !== "function" ||
      typeof options.activation.reconcile !== "function" ||
      typeof options.activation.activate !== "function" ||
      typeof options.activation.cancel !== "function" ||
      typeof options.events.admit !== "function" ||
      typeof options.events.clear !== "function" ||
      typeof options.events.withdrawal !== "function" ||
      typeof options.candidates.resolve !== "function" ||
      typeof options.workContracts.resolve !== "function"
    )
      throw new TypeError(
        "distributed team allocation runtime ports are required",
      );
    if (
      !Number.isSafeInteger(options.maximumCommitAttempts) ||
      options.maximumCommitAttempts < 1
    )
      throw new TypeError(
        "distributed team allocation commit attempts are invalid",
      );
    if (
      !options.stateKey ||
      !options.planning ||
      !options.proposal ||
      options.planning.planningDigest !== options.proposal.scope.planningDigest
    )
      throw new TypeError(
        "distributed team allocation planning binding is invalid",
      );
    assertTopology(options);
    this.#o = options;
  }
  async loadState(): Promise<DistributedTeamAllocationStateV2> {
    const state = await this.#o.store.load(this.#o.stateKey);
    return state ? this.#validate(state) : this.#initial();
  }
  async advance(input: {
    readonly logicalTimeMs: number;
  }): Promise<DistributedTeamAllocationStateV2> {
    time(input.logicalTimeMs);
    for (
      let attempt = 0;
      attempt < this.#o.maximumCommitAttempts;
      attempt += 1
    ) {
      const loaded = await this.#o.store.load(this.#o.stateKey);
      const state = loaded ? this.#validate(loaded) : this.#initial();
      if (input.logicalTimeMs < state.logicalTimeHighWaterMs)
        throw new TypeError(
          "distributed team allocation logical time rollback",
        );
      const next = await this.#step(state, input.logicalTimeMs);
      if (next.stateDigest === state.stateDigest) return next;
      if (
        await this.#o.store.save({
          state: next,
          expectedRevision: loaded ? state.revision : null,
          expectedStateDigest: loaded ? state.stateDigest : null,
        })
      )
        return next;
    }
    throw new Error("distributed_team_allocation_commit_conflict");
  }
  async #step(
    state: DistributedTeamAllocationStateV2,
    now: number,
  ): Promise<DistributedTeamAllocationStateV2> {
    if (state.phase === "blocked")
      return this.#advance(state, { logicalTimeHighWaterMs: now });
    if (state.phase === "active") {
      const allocation = await this.#o.allocation.loadState();
      let plan: MechanismAllocationPlanV1 | null = null;
      try {
        plan = currentAllocationPlan(
          allocation,
          this.#o.proposal.proposalDigest,
        );
      } catch {
        /* handled as an invalid fence below */
      }
      if (
        now < this.#o.planning.validUntilLogicalMs &&
        plan &&
        currentFenceMatches(state, allocation, plan)
      )
        return this.#advance(state, { logicalTimeHighWaterMs: now });
      const reasonCode =
        now >= this.#o.planning.validUntilLogicalMs
          ? "planning_expired"
          : "allocation_fence_advanced";
      await this.#cancelActivationAndFormation(state, now, reasonCode);
      return this.#advance(state, {
        logicalTimeHighWaterMs: now,
        phase:
          now >= this.#o.planning.validUntilLogicalMs
            ? "blocked"
            : "awaiting_allocation",
        allocationStateDigest: allocation.stateDigest,
        ...clearAuthorization(),
        lastReasonCode: reasonCode,
      });
    }
    if (now >= this.#o.planning.validUntilLogicalMs) {
      const allocation = await this.#o.allocation.loadState();
      if (state.phase === "activation_pending")
        await this.#cancelActivationAndFormation(
          state,
          now,
          "planning_expired",
        );
      if (state.phase === "formation_pending")
        await this.#invalidateAndCancelFormation(
          state,
          now,
          "planning_expired",
        );
      let plan: MechanismAllocationPlanV1 | null = null;
      try {
        plan = currentAllocationPlan(
          allocation,
          this.#o.proposal.proposalDigest,
        );
      } catch {
        /* expiry still clears the invalid fence */
      }
      if (
        plan &&
        currentFenceMatches(state, allocation, plan) &&
        (state.phase === "formation_pending" ||
          state.phase === "activation_pending")
      )
        return this.#withdraw(state, allocation, plan, now, "planning_expired");
      return this.#advance(state, {
        logicalTimeHighWaterMs: now,
        phase: "blocked",
        allocationStateDigest: allocation.stateDigest,
        ...clearAuthorization(),
        lastReasonCode: "planning_expired",
      });
    }
    if (state.phase === "proposal_pending") {
      const allocation = await this.#o.allocation.loadState();
      if (
        allocation.proposal &&
        allocation.proposal.proposalDigest !== this.#o.proposal.proposalDigest
      )
        return this.#advance(state, {
          logicalTimeHighWaterMs: now,
          phase: "blocked",
          allocationStateDigest: allocation.stateDigest,
          ...clearAuthorization(),
          lastReasonCode: "allocation_fence_invalid",
        });
      if (!allocation.proposal)
        await this.#o.allocation.submit(
          await this.#o.events.admit({
            event: { kind: "proposal", proposal: this.#o.proposal },
            allocationState: allocation,
          }),
        );
      const current = await this.#o.allocation.loadState();
      return this.#advance(state, {
        logicalTimeHighWaterMs: now,
        phase: "awaiting_allocation",
        allocationStateDigest: current.stateDigest,
      });
    }
    const allocation = await this.#o.allocation.loadState();
    let plan: MechanismAllocationPlanV1 | null = null;
    try {
      plan = currentAllocationPlan(allocation, this.#o.proposal.proposalDigest);
    } catch {
      if (state.phase === "activation_pending")
        await this.#cancelActivationAndFormation(
          state,
          now,
          "allocation_fence_invalid",
        );
      if (state.phase === "formation_pending")
        await this.#invalidateAndCancelFormation(
          state,
          now,
          "allocation_fence_invalid",
        );
      return this.#advance(state, {
        logicalTimeHighWaterMs: now,
        phase: "blocked",
        allocationStateDigest: allocation.stateDigest,
        ...clearAuthorization(),
        lastReasonCode: "allocation_fence_invalid",
      });
    }
    if (
      state.allocationPlanDigest &&
      (!plan || !currentFenceMatches(state, allocation, plan))
    ) {
      if (state.phase === "activation_pending")
        await this.#cancelActivationAndFormation(
          state,
          now,
          "allocation_fence_advanced",
        );
      if (state.phase === "formation_pending")
        await this.#invalidateAndCancelFormation(
          state,
          now,
          "allocation_fence_advanced",
        );
      return this.#advance(state, {
        logicalTimeHighWaterMs: now,
        phase: "awaiting_allocation",
        allocationStateDigest: allocation.stateDigest,
        ...clearAuthorization(),
        lastReasonCode: "allocation_fence_advanced",
      });
    }
    if (state.phase === "reallocation_pending")
      return this.#advance(state, {
        logicalTimeHighWaterMs: now,
        phase: "awaiting_allocation",
        allocationStateDigest: allocation.stateDigest,
        ...clearAuthorization(),
      });
    if (!plan) {
      if (
        allocation.auction &&
        now >= allocation.auction.revealDeadlineLogicalMs
      ) {
        const admitted = await this.#o.events.clear({
          allocationState: allocation,
          logicalTimeMs: now,
        });
        if (
          admitted.event.kind !== "clear" ||
          admitted.event.logicalTimeMs !== now ||
          mechanismAllocationEventDigestV1(admitted.event) !==
            admitted.admission.eventDigest
        )
          throw new TypeError(
            "distributed team allocation clear binding is invalid",
          );
        await this.#o.allocation.submit(admitted);
      }
      const current = await this.#o.allocation.loadState();
      return this.#advance(state, {
        logicalTimeHighWaterMs: now,
        phase: "awaiting_allocation",
        allocationStateDigest: current.stateDigest,
      });
    }
    if (plan.unallocatedSlotIds.length)
      return this.#advance(state, {
        logicalTimeHighWaterMs: now,
        phase: "blocked",
        allocationStateDigest: allocation.stateDigest,
        allocationAuctionDigest: plan.auctionDigest,
        allocationRound: plan.round,
        allocationPlanDigest: plan.planDigest,
        lastReasonCode: "allocation_incomplete",
      });
    if (state.phase === "awaiting_allocation") {
      return this.#advance(state, {
        logicalTimeHighWaterMs: now,
        phase: "decision_pending",
        allocationStateDigest: allocation.stateDigest,
        allocationAuctionDigest: plan.auctionDigest,
        allocationRound: plan.round,
        allocationPlanDigest: plan.planDigest,
      });
    }
    if (state.phase === "decision_pending") {
      const decision = this.#decisionForPlan(
        validateCollectiveDecisionV1(
          await this.#o.decision.decide({
            decisionId: this.#decisionId(plan),
            candidate: {
              schemaVersion: 1,
              candidateId: this.#candidateId(plan),
              decisionKind: "team_roster",
              scope: this.#o.decisionBinding.scope,
              epoch: this.#o.decisionBinding.epoch,
              membershipDigest: this.#o.decisionBinding.membershipDigest,
              membershipMemberIds: this.#o.decisionBinding.membershipMemberIds,
              proposerId: this.#o.decisionBinding.proposerId,
              payloadDigest: plan.planDigest,
              preparedAtLogicalMs: plan.decidedAtLogicalMs,
              expiresAtLogicalMs: this.#o.planning.validUntilLogicalMs,
            },
            logicalTimeMs: now,
          }),
        ),
        plan,
        now,
      );
      return this.#advance(state, {
        logicalTimeHighWaterMs: now,
        phase: "formation_pending",
        allocationStateDigest: allocation.stateDigest,
        allocationPlanDigest: plan.planDigest,
        decision,
        decisionDigest: decision.decisionDigest,
        formationRequestId: this.#formationRequestId(plan),
        formationRequestLogicalTimeMs: now,
        formationRequest: null,
        formationRequestDigest: null,
        formationAuthorizationDigest: null,
        formationProposalDigest: null,
      });
    }
    if (state.phase === "formation_pending") {
      if (
        !state.formationRequestId ||
        state.formationRequestLogicalTimeMs === null
      )
        throw new TypeError(
          "distributed team allocation formation identity is unavailable",
        );
      if (state.formationRequest === null) {
        try {
          await this.#verifyDecision(state, plan, now);
          const prepared = await this.#formationRequest(
            plan,
            state.formationRequestId,
            state.formationRequestLogicalTimeMs,
          );
          return this.#advance(state, {
            logicalTimeHighWaterMs: now,
            formationRequest: prepared,
            formationRequestDigest: prepared.requestDigest,
            formationAuthorizationDigest:
              distributedTeamFormationAuthorizationDigestV2(state, prepared),
          });
        } catch {
          return this.#withdraw(
            state,
            allocation,
            plan,
            now,
            "roster_decision_invalid_or_expired",
          );
        }
      }
      const request = state.formationRequest;
      try {
        await this.#verifyFormationAuthorization(state, plan, now);
      } catch {
        return this.#withdraw(
          state,
          allocation,
          plan,
          now,
          "roster_decision_invalid_or_expired",
        );
      }
      const current = await this.#o.allocation.loadState();
      const currentPlan = currentAllocationPlan(
        current,
        this.#o.proposal.proposalDigest,
      );
      if (!currentPlan || !currentFenceMatches(state, current, currentPlan)) {
        await this.#invalidateAndCancelFormation(
          state,
          now,
          "allocation_fence_advanced",
        );
        return this.#advance(state, {
          logicalTimeHighWaterMs: now,
          phase: "awaiting_allocation",
          allocationStateDigest: current.stateDigest,
          ...clearAuthorization(),
          lastReasonCode: "allocation_fence_advanced",
        });
      }
      try {
        await this.#verifyFormationAuthorization(state, currentPlan, now);
      } catch {
        return this.#withdraw(
          state,
          current,
          currentPlan,
          now,
          "roster_decision_invalid_or_expired",
        );
      }
      let reconciled = await this.#reconcileFormation(state);
      if (!reconciled) {
        let response: ReturnType<
          typeof validateTeamFormationDecisionV1
        > | null = null;
        try {
          response = validateTeamFormationDecisionV1(
            await this.#o.formation.form(request),
          );
        } catch (error) {
          reconciled = await this.#reconcileFormation(state);
          if (!reconciled) throw error;
        }
        if (response) {
          if (response.status !== "formed" || !response.proposal) {
            if (!(await this.#formationResponseIsDurable(state, response)))
              return this.#withdraw(
                state,
                current,
                currentPlan,
                now,
                "formation_replay_invalid_or_expired",
              );
            return this.#withdraw(
              state,
              current,
              currentPlan,
              now,
              "formation_rejected",
            );
          }
          reconciled = await this.#reconcileFormation(state);
          if (
            !reconciled ||
            reconciled.proposal.proposalDigest !==
              response.proposal.proposalDigest
          )
            return this.#withdraw(
              state,
              current,
              currentPlan,
              now,
              "formation_replay_invalid_or_expired",
            );
        }
      }
      const formedProposal = reconciled!.proposal;
      if (
        !reconciled!.canonical ||
        reconciled!.teamStatus !== "awaiting_member_contracts" ||
        formedProposal.validUntilLogicalMs <= now
      )
        return this.#withdraw(
          state,
          current,
          currentPlan,
          now,
          "formation_replay_invalid_or_expired",
        );
      return this.#advance(state, {
        logicalTimeHighWaterMs: now,
        phase: "activation_pending",
        formationProposalDigest: formedProposal.proposalDigest,
      });
    }
    if (state.phase === "activation_pending") {
      try {
        const context = activationContext(state);
        const recovered = await this.#o.activation.reconcile({
          ...context,
          logicalTimeMs: now,
        });
        const contracts = await this.#o.workContracts.resolve({
          allocationPlan: plan,
          logicalTimeMs: now,
        });
        const finalCurrent = await this.#o.allocation.loadState();
        const finalPlan = currentAllocationPlan(
          finalCurrent,
          this.#o.proposal.proposalDigest,
        );
        if (
          !finalPlan ||
          !currentFenceMatches(state, finalCurrent, finalPlan)
        ) {
          if (recovered)
            await this.#cancelActivationAndFormation(
              state,
              now,
              "allocation_fence_advanced",
              recovered,
            );
          else
            await this.#cancelActivationAndFormation(
              state,
              now,
              "allocation_fence_advanced",
            );
          return this.#advance(state, {
            logicalTimeHighWaterMs: now,
            phase: "awaiting_allocation",
            allocationStateDigest: finalCurrent.stateDigest,
            ...clearAuthorization(),
            lastReasonCode: "allocation_fence_advanced",
          });
        }
        await this.#verifyFormationAuthorization(state, finalPlan, now);
        const activated =
          recovered ??
          (await this.#o.activation.activate({
            ...context,
            workContracts: contracts,
            logicalTimeMs: now,
          }));
        const contract = await validateActivatedContract({
          contract: activated,
          proposalDigest: state.formationProposalDigest!,
          formationRequest: state.formationRequest!,
          formation: this.#o.formation,
          planning: this.#o.planning,
          workContracts: contracts,
          logicalTimeMs: now,
        });
        const postActivation = await this.#o.allocation.loadState();
        const postActivationPlan = currentAllocationPlan(
          postActivation,
          this.#o.proposal.proposalDigest,
        );
        if (
          !postActivationPlan ||
          !currentFenceMatches(state, postActivation, postActivationPlan)
        ) {
          await this.#cancelActivationAndFormation(
            state,
            now,
            "allocation_fence_advanced",
            contract,
          );
          return this.#advance(state, {
            logicalTimeHighWaterMs: now,
            phase: "awaiting_allocation",
            allocationStateDigest: postActivation.stateDigest,
            ...clearAuthorization(),
            lastReasonCode: "allocation_fence_advanced",
          });
        }
        return this.#advance(state, {
          logicalTimeHighWaterMs: now,
          phase: "active",
          jointWorkContractDigest: contract.jointWorkContractDigest,
          lastReasonCode: null,
        });
      } catch {
        await this.#cancelActivationAndFormation(
          state,
          now,
          "activation_rejected_or_expired",
        );
        const current = await this.#o.allocation.loadState();
        const currentPlan = currentAllocationPlan(
          current,
          this.#o.proposal.proposalDigest,
        );
        if (currentPlan && currentFenceMatches(state, current, currentPlan))
          return this.#withdraw(
            state,
            current,
            currentPlan,
            now,
            "activation_rejected_or_expired",
          );
        return this.#advance(state, {
          logicalTimeHighWaterMs: now,
          phase: "awaiting_allocation",
          allocationStateDigest: current.stateDigest,
          ...clearAuthorization(),
          lastReasonCode: "allocation_fence_advanced",
        });
      }
    }
    return this.#advance(state, {
      logicalTimeHighWaterMs: now,
      phase: "blocked",
      lastReasonCode: "unsupported_saga_phase",
    });
  }
  async #withdraw(
    state: DistributedTeamAllocationStateV2,
    allocation: MechanismAllocationStateV1,
    plan: MechanismAllocationPlanV1,
    now: number,
    reasonCode: string,
  ): Promise<DistributedTeamAllocationStateV2> {
    if (state.phase === "formation_pending")
      await this.#invalidateAndCancelFormation(state, now, reasonCode);
    const admitted = await this.#o.events.withdrawal({
      allocationState: allocation,
      plan,
      reasonCode,
      logicalTimeMs: now,
    });
    if (
      admitted.event.kind !== "withdrawal" ||
      mechanismAllocationEventDigestV1(admitted.event) !==
        admitted.admission.eventDigest
    )
      throw new TypeError(
        "distributed team allocation withdrawal binding is invalid",
      );
    const next = await this.#o.allocation.submit(admitted);
    return this.#advance(state, {
      logicalTimeHighWaterMs: now,
      phase: "reallocation_pending",
      allocationStateDigest: next.stateDigest,
      ...clearAuthorization(),
      reallocationCount: state.reallocationCount + 1,
      lastReasonCode: reasonCode,
    });
  }
  async #reconcileFormation(state: DistributedTeamAllocationStateV2) {
    if (!state.formationRequest || !state.formationRequestDigest) return null;
    const formationState = await this.#o.formation.loadState();
    if (!formationState.team) return null;
    const teamProposal = validateTeamProposalV1(formationState.team?.proposal);
    if (state.formationProposalDigest !== null) {
      if (teamProposal.proposalDigest !== state.formationProposalDigest)
        return null;
    } else if (
      teamProposal.formationRequestDigest !== state.formationRequestDigest
    )
      return null;
    if (
      teamProposal.formationRequestDigest !== state.formationRequestDigest ||
      formationState.team.teamId !== teamProposal.teamId ||
      formationState.team.teamEpoch !== teamProposal.teamEpoch
    )
      throw new TypeError(
        "distributed team allocation durable formation binding is invalid",
      );
    return {
      proposal: teamProposal,
      teamStatus: formationState.team.status,
      canonical: proposalMatchesRequest(teamProposal, state.formationRequest),
    } as const;
  }
  async #formationResponseIsDurable(
    state: DistributedTeamAllocationStateV2,
    response: ReturnType<typeof validateTeamFormationDecisionV1>,
  ): Promise<boolean> {
    if (
      !state.formationRequestDigest ||
      response.requestDigest !== state.formationRequestDigest
    )
      return false;
    const formationState = await this.#o.formation.loadState();
    if (
      !formationState.lastDecision ||
      formationState.lastDecision.requestDigest !== state.formationRequestDigest
    )
      return false;
    return (
      validateTeamFormationDecisionV1(formationState.lastDecision)
        .decisionDigest === response.decisionDigest
    );
  }
  async #cancelFormedTeam(
    state: DistributedTeamAllocationStateV2,
    now: number,
    reasonCode: string,
  ): Promise<void> {
    const reconciled = await this.#reconcileFormation(state);
    if (
      !reconciled ||
      (reconciled.teamStatus !== "awaiting_member_contracts" &&
        reconciled.teamStatus !== "active")
    )
      return;
    await this.#o.formation.cancel({
      reasonCode,
      logicalTimeMs: now,
      expectedProposalDigest: reconciled.proposal.proposalDigest,
    });
  }
  async #invalidateFormationRequest(
    state: DistributedTeamAllocationStateV2,
    now: number,
    reasonCode: string,
  ): Promise<void> {
    if (
      !state.formationRequest ||
      !state.formationRequestDigest ||
      !state.formationAuthorizationDigest
    )
      return;
    const invalidation = validateTeamFormationRequestInvalidationV1(
      await this.#o.formation.invalidate({
        formationRequestDigest: state.formationRequestDigest,
        formationAuthorizationDigest: state.formationAuthorizationDigest,
        reasonCode,
        logicalTimeMs: now,
        requestValidUntilLogicalMs: state.formationRequest.validUntilLogicalMs,
      }),
    );
    if (
      invalidation.formationRequestDigest !== state.formationRequestDigest ||
      invalidation.formationAuthorizationDigest !==
        state.formationAuthorizationDigest ||
      invalidation.requestValidUntilLogicalMs !==
        state.formationRequest.validUntilLogicalMs
    )
      throw new TypeError(
        "distributed team allocation formation invalidation binding is invalid",
      );
  }
  async #invalidateAndCancelFormation(
    state: DistributedTeamAllocationStateV2,
    now: number,
    reasonCode: string,
  ): Promise<void> {
    await this.#invalidateFormationRequest(state, now, reasonCode);
    await this.#cancelFormedTeam(state, now, reasonCode);
  }
  async #cancelOrphan(
    state: DistributedTeamAllocationStateV2,
    now: number,
    reasonCode: string,
  ): Promise<void> {
    const context = activationContext(state);
    const contract = await this.#o.activation.reconcile({
      ...context,
      logicalTimeMs: now,
    });
    if (contract) await this.#cancelContract(state, contract, now, reasonCode);
  }
  async #cancelActivationAndFormation(
    state: DistributedTeamAllocationStateV2,
    now: number,
    reasonCode: string,
    contractValue?: unknown,
  ): Promise<void> {
    // Revoke effect authority first, tombstone the request, then close the exact
    // durable Team so no late form or next round inherits live authority.
    if (contractValue === undefined)
      await this.#cancelOrphan(state, now, reasonCode);
    else await this.#cancelContract(state, contractValue, now, reasonCode);
    await this.#invalidateAndCancelFormation(state, now, reasonCode);
  }
  async #cancelContract(
    state: DistributedTeamAllocationStateV2,
    contractValue: unknown,
    now: number,
    reasonCode: string,
  ): Promise<void> {
    const contract = validateJointWorkContractV1(contractValue);
    if (
      contract.proposalDigest !== state.formationProposalDigest ||
      (state.jointWorkContractDigest !== null &&
        contract.jointWorkContractDigest !== state.jointWorkContractDigest)
    )
      throw new TypeError(
        "distributed team allocation orphan contract binding is invalid",
      );
    await this.#o.activation.cancel({
      ...activationContext(state),
      cancellationId: `${state.stateKey}.cancel.${state.formationAuthorizationDigest!.slice(7, 31)}`,
      jointWorkContractDigest: contract.jointWorkContractDigest,
      reasonCode,
      logicalTimeMs: now,
    });
  }
  #decisionId(plan: MechanismAllocationPlanV1): string {
    return `${this.#o.stateKey}.decision.${plan.planDigest.slice(7, 23)}`;
  }
  #candidateId(plan: MechanismAllocationPlanV1): string {
    return `${this.#o.stateKey}.roster.${plan.planDigest.slice(7, 23)}`;
  }
  #decisionForPlan(
    decision: CollectiveDecisionV1,
    plan: MechanismAllocationPlanV1,
    now: number,
  ): CollectiveDecisionV1 {
    const expected = createCollectiveDecisionCandidateV1({
      schemaVersion: 1,
      candidateId: this.#candidateId(plan),
      decisionKind: "team_roster",
      scope: this.#o.decisionBinding.scope,
      epoch: this.#o.decisionBinding.epoch,
      membershipDigest: this.#o.decisionBinding.membershipDigest,
      membershipMemberIds: this.#o.decisionBinding.membershipMemberIds,
      proposerId: this.#o.decisionBinding.proposerId,
      payloadDigest: plan.planDigest,
      preparedAtLogicalMs: plan.decidedAtLogicalMs,
      expiresAtLogicalMs: this.#o.planning.validUntilLogicalMs,
    });
    if (
      decision.decisionId !== this.#decisionId(plan) ||
      decision.candidate.candidateDigest !== expected.candidateDigest ||
      decision.certificate.candidateDigest !== expected.candidateDigest ||
      decision.certificate.scopeDigest !== expected.scope.scopeDigest ||
      decision.certificate.epoch !== expected.epoch ||
      decision.certificate.membershipDigest !== expected.membershipDigest ||
      decision.acceptedAtLogicalMs < decision.candidate.preparedAtLogicalMs ||
      decision.acceptedAtLogicalMs > now ||
      decision.expiresAtLogicalMs > decision.candidate.expiresAtLogicalMs ||
      now >= decision.expiresAtLogicalMs
    )
      throw new TypeError(
        "distributed team allocation roster decision binding is invalid",
      );
    return decision;
  }
  async #verifyDecision(
    state: DistributedTeamAllocationStateV2,
    plan: MechanismAllocationPlanV1,
    now: number,
  ): Promise<CollectiveDecisionV1> {
    if (
      !state.decision ||
      state.decisionDigest !== state.decision.decisionDigest ||
      state.allocationPlanDigest !== plan.planDigest
    )
      throw new TypeError(
        "distributed team allocation roster decision is unavailable",
      );
    const decision = this.#decisionForPlan(
      validateCollectiveDecisionV1(state.decision),
      plan,
      now,
    );
    const certificate = validateCollectiveDecisionCertificateV1(
      await this.#o.decision.verify({
        candidate: decision.candidate,
        certificate: decision.certificate,
        logicalTimeMs: now,
      }),
    );
    if (
      certificate.certificateDigest !== decision.certificate.certificateDigest
    )
      throw new TypeError(
        "distributed team allocation roster decision verification changed",
      );
    return decision;
  }
  async #verifyFormationAuthorization(
    state: DistributedTeamAllocationStateV2,
    plan: MechanismAllocationPlanV1,
    now: number,
  ): Promise<void> {
    const request = state.formationRequest;
    if (
      !request ||
      state.formationRequestId !== this.#formationRequestId(plan) ||
      state.formationRequestDigest !== request.requestDigest ||
      state.formationAuthorizationDigest !==
        distributedTeamFormationAuthorizationDigestV2(state, request) ||
      request.requestId !== state.formationRequestId ||
      request.logicalTimeMs !== state.formationRequestLogicalTimeMs ||
      request.validUntilLogicalMs <= now ||
      now >= this.#o.planning.validUntilLogicalMs
    )
      throw new TypeError(
        "distributed team allocation formation authorization is invalid or expired",
      );
    assertFormationRequestForPlan(
      request,
      plan,
      this.#o.planning,
      state.stateKey,
    );
    await this.#verifyDecision(state, plan, now);
  }
  #formationRequestId(plan: MechanismAllocationPlanV1): string {
    return `${this.#o.stateKey}.formation.${plan.planDigest.slice(7, 23)}`;
  }
  async #formationRequest(
    plan: MechanismAllocationPlanV1,
    requestId: string,
    commandTime: number,
  ) {
    // Identity and timestamps are persisted before the external call. The
    // invocation clock is used by #step only to reject stale retries.
    const bids = await Promise.all(
      plan.selections.map(async (selection) => {
        const position = this.#o.planning.positions.find(
          (item) => item.positionId === selection.slotId,
        );
        if (!position)
          throw new TypeError("allocation selection has no planning position");
        const candidate = validateTeamCandidateV1(
          await this.#o.candidates.resolve({
            selection,
            position,
            allocationPlan: plan,
            logicalTimeMs: commandTime,
          }),
        );
        if (
          candidate.peerId !== selection.bidderPeerId ||
          candidate.instanceId !== selection.bidderInstanceId ||
          candidate.independenceGroupId !==
            selection.bidderIndependenceGroupId ||
          candidate.eligibleWorkItemId !== position.workItemId ||
          candidate.eligibleWorkItemRevision !== position.workItemRevision
        )
          throw new TypeError("allocation candidate fence is invalid");
        return createTeamPositionBidV1({
          schemaVersion: 1,
          bidId: `${this.#o.stateKey}.bid.${selection.slotId}.${plan.round}`,
          positionId: position.positionId,
          candidate,
          sourceBidDigest: selection.revealDigest,
          capacityReservationUnits: selection.declaredResourceUnits,
          budgetUnits: selection.declaredBudgetUnits,
          expectedCompletionAtLogicalMs: commandTime + 1,
          locallyEvaluatedScoreMicros: selection.declaredUtilityMicros,
          observedAtLogicalMs: commandTime,
          validUntilLogicalMs: this.#o.planning.validUntilLogicalMs,
        });
      }),
    );
    return createTeamFormationRequestV1({
      schemaVersion: 1,
      requestId,
      scope: this.#o.planning.scope,
      membershipEpoch: this.#o.planning.membershipEpoch,
      membershipConfigurationDigest:
        this.#o.planning.membershipConfigurationDigest,
      positions: this.#o.planning.positions,
      bids,
      logicalTimeMs: commandTime,
      validUntilLogicalMs: this.#o.planning.validUntilLogicalMs,
    });
  }
  #initial(): DistributedTeamAllocationStateV2 {
    return state({
      format: DISTRIBUTED_TEAM_ALLOCATION_STATE_FORMAT_V2,
      schemaVersion: 2,
      stateKey: this.#o.stateKey,
      planningDigest: this.#o.planning.planningDigest,
      proposalDigest: this.#o.proposal.proposalDigest,
      revision: 0,
      logicalTimeHighWaterMs: 0,
      phase: "proposal_pending",
      allocationStateDigest: null,
      allocationAuctionDigest: null,
      allocationRound: null,
      allocationPlanDigest: null,
      decision: null,
      decisionDigest: null,
      formationRequestId: null,
      formationRequestLogicalTimeMs: null,
      formationRequest: null,
      formationRequestDigest: null,
      formationAuthorizationDigest: null,
      formationProposalDigest: null,
      jointWorkContractDigest: null,
      reallocationCount: 0,
      lastReasonCode: null,
      predecessorStateDigest: null,
    });
  }
  #advance(
    previous: DistributedTeamAllocationStateV2,
    changes: Partial<
      Omit<
        DistributedTeamAllocationStateV2,
        | "format"
        | "schemaVersion"
        | "stateKey"
        | "planningDigest"
        | "proposalDigest"
        | "revision"
        | "predecessorStateDigest"
        | "stateDigest"
      >
    >,
  ): DistributedTeamAllocationStateV2 {
    const { stateDigest: _stateDigest, ...prior } = previous;
    return state({
      ...prior,
      ...changes,
      revision: previous.revision + 1,
      predecessorStateDigest: previous.stateDigest,
    });
  }
  #validate(
    value: DistributedTeamAllocationStateV2,
  ): DistributedTeamAllocationStateV2 {
    const result = validateState(value);
    const request = result.formationRequest;
    const decision = result.decision;
    if (
      result.stateKey !== this.#o.stateKey ||
      result.planningDigest !== this.#o.planning.planningDigest ||
      result.proposalDigest !== this.#o.proposal.proposalDigest ||
      (decision !== null &&
        (decision.candidate.decisionKind !== "team_roster" ||
          decision.candidate.payloadDigest !== result.allocationPlanDigest ||
          decision.candidate.scope.scopeDigest !==
            this.#o.decisionBinding.scope.scopeDigest ||
          decision.candidate.epoch !== this.#o.decisionBinding.epoch ||
          decision.candidate.membershipDigest !==
            this.#o.decisionBinding.membershipDigest ||
          decision.candidate.proposerId !==
            this.#o.decisionBinding.proposerId ||
          !sameIds(
            decision.candidate.membershipMemberIds,
            this.#o.decisionBinding.membershipMemberIds,
          ))) ||
      (request !== null &&
        (request.scope.scopeDigest !== this.#o.planning.scope.scopeDigest ||
          request.membershipEpoch !== this.#o.planning.membershipEpoch ||
          request.membershipConfigurationDigest !==
            this.#o.planning.membershipConfigurationDigest ||
          request.validUntilLogicalMs !==
            this.#o.planning.validUntilLogicalMs ||
          !samePositions(request.positions, this.#o.planning.positions)))
    )
      throw new TypeError("distributed team allocation state binding changed");
    return result;
  }
}
export class InMemoryDistributedTeamAllocationStoreV2 implements DistributedTeamAllocationStoreV2 {
  readonly #states = new Map<string, DistributedTeamAllocationStateV2>();
  async load(key: string) {
    const value = this.#states.get(key);
    return value ? structuredClone(value) : null;
  }
  async save(input: {
    readonly state: DistributedTeamAllocationStateV2;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: PlanningDigestV1 | null;
  }) {
    const state = validateState(input.state);
    const current = this.#states.get(state.stateKey) ?? null;
    if (
      (current?.revision ?? null) !== input.expectedRevision ||
      (current?.stateDigest ?? null) !== input.expectedStateDigest
    )
      return false;
    this.#states.set(state.stateKey, structuredClone(state));
    return true;
  }
}
function clearAuthorization() {
  return {
    allocationAuctionDigest: null,
    allocationRound: null,
    allocationPlanDigest: null,
    decision: null,
    decisionDigest: null,
    formationRequestId: null,
    formationRequestLogicalTimeMs: null,
    formationRequest: null,
    formationRequestDigest: null,
    formationAuthorizationDigest: null,
    formationProposalDigest: null,
    jointWorkContractDigest: null,
  } as const;
}
export function distributedTeamFormationAuthorizationDigestV2(
  state: Pick<
    DistributedTeamAllocationStateV2,
    | "stateKey"
    | "planningDigest"
    | "proposalDigest"
    | "allocationStateDigest"
    | "allocationAuctionDigest"
    | "allocationRound"
    | "allocationPlanDigest"
    | "decision"
    | "decisionDigest"
  >,
  request: NonNullable<DistributedTeamAllocationStateV2["formationRequest"]>,
): PlanningDigestV1 {
  if (
    !state.allocationStateDigest ||
    !state.allocationAuctionDigest ||
    state.allocationRound === null ||
    !Number.isSafeInteger(state.allocationRound) ||
    state.allocationRound < 1 ||
    !state.allocationPlanDigest ||
    !state.decision
  )
    throw new TypeError(
      "distributed team allocation formation authorization material is incomplete",
    );
  const decision = validateCollectiveDecisionV1(state.decision);
  const formationRequest = validateTeamFormationRequestV1(request);
  const decisionScope = decision.candidate.scope;
  const requestScope = formationRequest.scope;
  if (
    state.decisionDigest !== decision.decisionDigest ||
    decision.candidate.decisionKind !== "team_roster" ||
    decision.candidate.payloadDigest !== state.allocationPlanDigest ||
    decision.candidate.epoch !== formationRequest.membershipEpoch ||
    decision.candidate.membershipDigest !==
      formationRequest.membershipConfigurationDigest ||
    decision.candidate.expiresAtLogicalMs !==
      formationRequest.validUntilLogicalMs ||
    decisionScope.tenantId !== requestScope.tenantId ||
    decisionScope.meshId !== requestScope.meshId ||
    decisionScope.policyDomainId !== requestScope.policyDomainId ||
    decisionScope.missionIntentId !== requestScope.missionIntentId ||
    decisionScope.objectiveId !== requestScope.objectiveId ||
    decisionScope.workItemId !== requestScope.rootWorkItemId ||
    decisionScope.workItemRevision !== requestScope.rootWorkItemRevision
  )
    throw new TypeError(
      "distributed team allocation formation authorization binding changed",
    );
  return digestPlanningJsonV1("collective-planning-snapshot", {
    schemaVersion: 1,
    authorizationKind: "certified-team-formation",
    stateKey: state.stateKey,
    planningDigest: state.planningDigest,
    proposalDigest: state.proposalDigest,
    allocationStateDigest: state.allocationStateDigest,
    allocationAuctionDigest: state.allocationAuctionDigest,
    allocationRound: state.allocationRound,
    allocationPlanDigest: state.allocationPlanDigest,
    decisionDigest: decision.decisionDigest,
    candidateDigest: decision.candidate.candidateDigest,
    certificateDigest: decision.certificate.certificateDigest,
    formationRequestId: formationRequest.requestId,
    formationRequestLogicalTimeMs: formationRequest.logicalTimeMs,
    formationRequestDigest: formationRequest.requestDigest,
    scopeDigest: formationRequest.scope.scopeDigest,
    membershipEpoch: formationRequest.membershipEpoch,
    membershipConfigurationDigest:
      formationRequest.membershipConfigurationDigest,
    decisionExpiresAtLogicalMs: decision.expiresAtLogicalMs,
    requestValidUntilLogicalMs: formationRequest.validUntilLogicalMs,
  });
}
function allocationFence(
  state: DistributedTeamAllocationStateV2,
): DistributedTeamAllocationFenceV2 {
  if (
    !state.allocationStateDigest ||
    !state.allocationAuctionDigest ||
    state.allocationRound === null ||
    !state.allocationPlanDigest
  )
    throw new TypeError("distributed team allocation fence is unavailable");
  return {
    allocationStateDigest: state.allocationStateDigest,
    auctionDigest: state.allocationAuctionDigest,
    allocationRound: state.allocationRound,
    allocationPlanDigest: state.allocationPlanDigest,
  };
}
function activationContext(
  state: DistributedTeamAllocationStateV2,
): DistributedTeamAllocationActivationContextV2 {
  if (
    !state.formationAuthorizationDigest ||
    !state.formationRequestDigest ||
    !state.formationProposalDigest
  )
    throw new TypeError(
      "distributed team allocation activation context is unavailable",
    );
  return {
    fence: allocationFence(state),
    formationAuthorizationDigest: state.formationAuthorizationDigest,
    formationRequestDigest: state.formationRequestDigest,
    proposalDigest: state.formationProposalDigest,
  };
}
function currentAllocationPlan(
  allocation: MechanismAllocationStateV1,
  proposalDigest: PlanningDigestV1,
): MechanismAllocationPlanV1 | null {
  const plan = allocation.plan;
  if (!plan) return null;
  if (
    !allocation.auction ||
    !allocation.proposal ||
    plan.proposalDigest !== allocation.auction.proposalDigest ||
    plan.proposalDigest !== allocation.proposal.proposalDigest ||
    plan.proposalDigest !== proposalDigest ||
    plan.round > allocation.auction.round
  )
    throw new TypeError(
      "distributed team allocation plan is outside the current auction fence",
    );
  // Mechanism Allocation intentionally retains the withdrawn prior-round plan
  // while the next auction is open. It is historical and carries no authority.
  if (plan.round < allocation.auction.round) return null;
  if (
    plan.auctionDigest !== allocation.auction.roundDigest ||
    plan.causalEpoch !== allocation.auction.causalEpoch
  )
    throw new TypeError(
      "distributed team allocation plan is outside the current auction fence",
    );
  return plan;
}
function currentFenceMatches(
  state: DistributedTeamAllocationStateV2,
  allocation: MechanismAllocationStateV1,
  plan: MechanismAllocationPlanV1,
): boolean {
  return (
    state.allocationStateDigest === allocation.stateDigest &&
    state.allocationAuctionDigest === plan.auctionDigest &&
    state.allocationRound === plan.round &&
    state.allocationPlanDigest === plan.planDigest
  );
}
function assertFormationRequestForPlan(
  request: NonNullable<DistributedTeamAllocationStateV2["formationRequest"]>,
  plan: MechanismAllocationPlanV1,
  planning: DistributedTeamAllocationRuntimeOptionsV2["planning"],
  stateKey: string,
): void {
  if (
    request.bids.length !== plan.selections.length ||
    !samePositions(request.positions, planning.positions)
  )
    throw new TypeError(
      "distributed team allocation formation request topology changed",
    );
  for (const selection of plan.selections) {
    const position = planning.positions.find(
      (item) => item.positionId === selection.slotId,
    );
    const bid = request.bids.find(
      (item) => item.positionId === selection.slotId,
    );
    if (
      !position ||
      !bid ||
      bid.bidId !== `${stateKey}.bid.${selection.slotId}.${plan.round}` ||
      bid.sourceBidDigest !== selection.revealDigest ||
      bid.capacityReservationUnits !== selection.declaredResourceUnits ||
      bid.budgetUnits !== selection.declaredBudgetUnits ||
      bid.locallyEvaluatedScoreMicros !== selection.declaredUtilityMicros ||
      bid.expectedCompletionAtLogicalMs !== request.logicalTimeMs + 1 ||
      bid.observedAtLogicalMs !== request.logicalTimeMs ||
      bid.validUntilLogicalMs !== request.validUntilLogicalMs ||
      bid.candidate.peerId !== selection.bidderPeerId ||
      bid.candidate.instanceId !== selection.bidderInstanceId ||
      bid.candidate.independenceGroupId !==
        selection.bidderIndependenceGroupId ||
      bid.candidate.eligibleWorkItemId !== position.workItemId ||
      bid.candidate.eligibleWorkItemRevision !== position.workItemRevision
    )
      throw new TypeError(
        "distributed team allocation formation request changed from its allocation plan",
      );
  }
}
async function validateActivatedContract(input: {
  readonly contract: unknown;
  readonly proposalDigest: PlanningDigestV1;
  readonly formationRequest: NonNullable<
    DistributedTeamAllocationStateV2["formationRequest"]
  >;
  readonly formation: DistributedTeamAllocationRuntimeOptionsV2["formation"];
  readonly planning: DistributedTeamAllocationRuntimeOptionsV2["planning"];
  readonly workContracts: Parameters<
    DistributedTeamAllocationRuntimeOptionsV2["activation"]["activate"]
  >[0]["workContracts"];
  readonly logicalTimeMs: number;
}) {
  const contract = validateJointWorkContractV1(input.contract);
  const formationState = await input.formation.loadState();
  const proposal = validateTeamProposalV1(formationState.team?.proposal);
  if (
    contract.proposalDigest !== input.proposalDigest ||
    proposal.proposalDigest !== input.proposalDigest ||
    proposal.scope.scopeDigest !== input.planning.scope.scopeDigest ||
    !proposalMatchesRequest(proposal, input.formationRequest) ||
    contract.scopeDigest !== input.planning.scope.scopeDigest ||
    contract.activatedAtLogicalMs > input.logicalTimeMs ||
    input.logicalTimeMs >= contract.validUntilLogicalMs ||
    proposal.validUntilLogicalMs <= input.logicalTimeMs
  )
    throw new TypeError(
      "distributed team allocation activated contract binding is invalid",
    );
  const expectedBindings = createTeamMemberContractBindingsV1({
    proposal,
    workContracts: input.workContracts,
    logicalTimeMs: input.logicalTimeMs,
  });
  const expected = createJointWorkContractV1({
    proposal,
    memberContracts: expectedBindings,
    activatedAtLogicalMs: contract.activatedAtLogicalMs,
  });
  if (expected.jointWorkContractDigest !== contract.jointWorkContractDigest)
    throw new TypeError(
      "distributed team allocation member Work Contract binding is invalid",
    );
  return contract;
}
function assertTopology(o: DistributedTeamAllocationRuntimeOptionsV2) {
  const decisionScope = validateCollectiveDecisionScopeV1(
    o.decisionBinding.scope,
  );
  const planningScope = o.planning.scope;
  if (
    decisionScope.tenantId !== planningScope.tenantId ||
    decisionScope.meshId !== planningScope.meshId ||
    decisionScope.policyDomainId !== planningScope.policyDomainId ||
    decisionScope.missionIntentId !== planningScope.missionIntentId ||
    decisionScope.objectiveId !== planningScope.objectiveId ||
    decisionScope.workItemId !== planningScope.rootWorkItemId ||
    decisionScope.workItemRevision !== planningScope.rootWorkItemRevision ||
    o.decisionBinding.epoch !== o.planning.membershipEpoch ||
    o.decisionBinding.membershipDigest !==
      o.planning.membershipConfigurationDigest ||
    !Number.isSafeInteger(o.decisionBinding.epoch) ||
    o.decisionBinding.epoch < 0 ||
    !Array.isArray(o.decisionBinding.membershipMemberIds) ||
    !o.decisionBinding.membershipMemberIds.includes(
      o.decisionBinding.proposerId,
    ) ||
    o.proposal.scope.teamFormationScope.scopeDigest !==
      planningScope.scopeDigest ||
    o.proposal.slots.length !== o.planning.positions.length
  )
    throw new TypeError("distributed team allocation scope is invalid");
  for (const p of o.planning.positions) {
    validateTeamPositionV1(p);
    const s = o.proposal.slots.find((x) => x.slotId === p.positionId);
    if (
      !s ||
      s.semanticRoleKey !== p.roleKey ||
      !p.requiredCapabilityKeys.every((key) =>
        s.requiredCapabilityKeys.includes(key),
      ) ||
      s.budgetCeilingUnits < p.budgetUnits
    )
      throw new TypeError("planning position is not bound to allocation slot");
  }
}
function proposalMatchesRequest(
  proposal: ReturnType<typeof validateTeamProposalV1>,
  request: NonNullable<DistributedTeamAllocationStateV2["formationRequest"]>,
) {
  if (
    proposal.teamEpoch !== 1 ||
    proposal.predecessorJointWorkContractDigest !== null ||
    proposal.formationRequestDigest !== request.requestDigest ||
    proposal.scope.scopeDigest !== request.scope.scopeDigest ||
    proposal.membershipEpoch !== request.membershipEpoch ||
    proposal.membershipConfigurationDigest !==
      request.membershipConfigurationDigest ||
    proposal.proposedAtLogicalMs !== request.logicalTimeMs ||
    proposal.validUntilLogicalMs !== request.validUntilLogicalMs ||
    !samePositions(proposal.positions, request.positions) ||
    proposal.members.length !== request.bids.length
  )
    return false;
  const positions = new Map(
    request.positions.map((position) => [position.positionId, position]),
  );
  const bids = new Map(request.bids.map((bid) => [bid.positionId, bid]));
  if (bids.size !== request.bids.length || bids.size !== positions.size)
    return false;
  try {
    const members = [...bids.values()].map((bid) =>
      createTeamMemberSelectionV1({
        schemaVersion: 1,
        teamId: proposal.teamId,
        teamEpoch: 1,
        positionId: bid.positionId,
        positionDigest: positions.get(bid.positionId)!.positionDigest,
        candidateId: bid.candidate.candidateId,
        candidateDigest: bid.candidate.candidateDigest,
        peerId: bid.candidate.peerId,
        instanceId: bid.candidate.instanceId,
        independenceGroupId: bid.candidate.independenceGroupId,
        bidId: bid.bidId,
        bidDigest: bid.bidDigest,
        sourceBidDigest: bid.sourceBidDigest,
        budgetUnits: bid.budgetUnits,
        expectedCompletionAtLogicalMs: bid.expectedCompletionAtLogicalMs,
        locallyEvaluatedScoreMicros: bid.locallyEvaluatedScoreMicros,
      }),
    );
    const expected = createTeamProposalV1({
      schemaVersion: 1,
      teamEpoch: 1,
      scope: request.scope,
      policyDigest: proposal.policyDigest,
      membershipEpoch: request.membershipEpoch,
      membershipConfigurationDigest: request.membershipConfigurationDigest,
      formationRequestDigest: request.requestDigest,
      predecessorJointWorkContractDigest: null,
      positions: request.positions,
      members,
      totalBudgetUnits: members.reduce(
        (total, member) => total + member.budgetUnits,
        0,
      ),
      expectedCompletionAtLogicalMs: Math.max(
        ...members.map((member) => member.expectedCompletionAtLogicalMs),
      ),
      proposedAtLogicalMs: request.logicalTimeMs,
      validUntilLogicalMs: request.validUntilLogicalMs,
    });
    return (
      proposal.teamId === expected.teamId &&
      proposal.proposalDigest === expected.proposalDigest
    );
  } catch {
    return false;
  }
}
function samePositions(
  left: readonly {
    readonly positionId: string;
    readonly positionDigest: PlanningDigestV1;
  }[],
  right: readonly {
    readonly positionId: string;
    readonly positionDigest: PlanningDigestV1;
  }[],
) {
  if (left.length !== right.length) return false;
  const expected = new Map(
    right.map((position) => [position.positionId, position.positionDigest]),
  );
  return left.every(
    (position) => expected.get(position.positionId) === position.positionDigest,
  );
}
function sameIds(left: readonly string[], right: readonly string[]) {
  const expected = [...right].sort();
  return (
    left.length === expected.length &&
    [...left].sort().every((value, index) => value === expected[index])
  );
}
function state(
  body: Omit<DistributedTeamAllocationStateV2, "stateDigest">,
): DistributedTeamAllocationStateV2 {
  const result = {
    ...body,
    stateDigest: digestPlanningJsonV1(
      "collective-planning-snapshot",
      body as unknown as PlanningJson,
    ),
  };
  return Object.freeze(result);
}
function validateState(
  value: DistributedTeamAllocationStateV2,
): DistributedTeamAllocationStateV2 {
  const decision =
    value?.decision === null
      ? null
      : validateCollectiveDecisionV1(value?.decision);
  const formationRequest =
    value?.formationRequest === null
      ? null
      : validateTeamFormationRequestV1(value?.formationRequest);
  if (
    !value ||
    value.format !== DISTRIBUTED_TEAM_ALLOCATION_STATE_FORMAT_V2 ||
    value.schemaVersion !== 2 ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0 ||
    !Number.isSafeInteger(value.logicalTimeHighWaterMs) ||
    value.logicalTimeHighWaterMs < 0 ||
    ![
      "proposal_pending",
      "awaiting_allocation",
      "decision_pending",
      "formation_pending",
      "activation_pending",
      "reallocation_pending",
      "active",
      "blocked",
    ].includes(value.phase) ||
    !Number.isSafeInteger(value.reallocationCount) ||
    value.reallocationCount < 0 ||
    (value.allocationRound !== null &&
      (!Number.isSafeInteger(value.allocationRound) ||
        value.allocationRound < 1)) ||
    (value.allocationAuctionDigest === null) !==
      (value.allocationRound === null) ||
    (value.allocationAuctionDigest === null) !==
      (value.allocationPlanDigest === null) ||
    (value.formationRequestId !== null &&
      (typeof value.formationRequestId !== "string" ||
        value.formationRequestId.length < 1)) ||
    (value.formationRequestLogicalTimeMs !== null &&
      (!Number.isSafeInteger(value.formationRequestLogicalTimeMs) ||
        value.formationRequestLogicalTimeMs < 0)) ||
    (value.formationRequestId === null) !==
      (value.formationRequestLogicalTimeMs === null) ||
    (decision === null) !== (value.decisionDigest === null) ||
    (decision !== null &&
      (decision.decisionDigest !== value.decisionDigest ||
        decision.acceptedAtLogicalMs > value.logicalTimeHighWaterMs ||
        decision.certificate.candidateDigest !==
          decision.candidate.candidateDigest ||
        decision.certificate.scopeDigest !==
          decision.candidate.scope.scopeDigest ||
        decision.certificate.epoch !== decision.candidate.epoch ||
        decision.certificate.membershipDigest !==
          decision.candidate.membershipDigest)) ||
    (formationRequest === null) !== (value.formationRequestDigest === null) ||
    (formationRequest !== null &&
      (value.formationRequestId === null ||
        value.formationRequestLogicalTimeMs === null ||
        formationRequest.requestId !== value.formationRequestId ||
        formationRequest.logicalTimeMs !==
          value.formationRequestLogicalTimeMs ||
        formationRequest.requestDigest !== value.formationRequestDigest)) ||
    (formationRequest === null) !==
      (value.formationAuthorizationDigest === null) ||
    (formationRequest !== null &&
      (decision === null ||
        value.allocationStateDigest === null ||
        value.allocationAuctionDigest === null ||
        value.allocationRound === null ||
        value.allocationPlanDigest === null ||
        value.formationAuthorizationDigest !==
          distributedTeamFormationAuthorizationDigestV2(
            {
              stateKey: value.stateKey,
              planningDigest: value.planningDigest,
              proposalDigest: value.proposalDigest,
              allocationStateDigest: value.allocationStateDigest,
              allocationAuctionDigest: value.allocationAuctionDigest,
              allocationRound: value.allocationRound,
              allocationPlanDigest: value.allocationPlanDigest,
              decision,
              decisionDigest: value.decisionDigest,
            },
            formationRequest,
          ))) ||
    (value.formationProposalDigest !== null &&
      value.formationRequestDigest === null) ||
    (value.jointWorkContractDigest !== null &&
      value.formationProposalDigest === null) ||
    ([
      "proposal_pending",
      "awaiting_allocation",
      "decision_pending",
      "reallocation_pending",
    ].includes(value.phase) &&
      (decision !== null ||
        formationRequest !== null ||
        value.formationProposalDigest !== null ||
        value.jointWorkContractDigest !== null)) ||
    (value.phase === "formation_pending" &&
      (decision === null ||
        value.formationRequestId === null ||
        decision.expiresAtLogicalMs <= value.logicalTimeHighWaterMs)) ||
    (value.phase === "activation_pending" &&
      (decision === null ||
        formationRequest === null ||
        value.formationAuthorizationDigest === null ||
        value.formationProposalDigest === null ||
        decision.expiresAtLogicalMs <= value.logicalTimeHighWaterMs)) ||
    (value.phase === "active" &&
      (decision === null ||
        formationRequest === null ||
        value.formationAuthorizationDigest === null ||
        value.formationProposalDigest === null ||
        value.jointWorkContractDigest === null))
  )
    throw new TypeError("distributed team allocation state is invalid");
  const { stateDigest, ...body } = { ...value, decision, formationRequest };
  if (
    stateDigest !==
    digestPlanningJsonV1(
      "collective-planning-snapshot",
      body as unknown as PlanningJson,
    )
  )
    throw new TypeError("distributed team allocation state digest is invalid");
  return Object.freeze({ ...value, decision, formationRequest });
}
function time(value: number) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new TypeError("distributed team allocation logical time is invalid");
}
