import type { PlanningDigestV1 } from "@agentplat/collective-planning";

import {
  type JointWorkContractV1,
  type TeamFormationDecisionV1,
  type TeamFormationHandoffEnvelopeV1,
  type TeamFormationPolicyRecordV1,
  type TeamFormationPortV1,
  type TeamFormationRequestV1,
  type TeamFormationRuntimeOptionsV1,
  type TeamFormationStateV1,
  type TeamFormationStoreV1,
  type TeamMemberOutcomeV1,
  type TeamRecordV1,
  type TeamReconfigurationRequestV1,
} from "./team-formation-contracts.js";
import {
  activateTeamProposalV1,
  cancelTeamV1,
  recordTeamMemberOutcomeV1,
  reduceTeamFormationV1,
  reduceTeamReconfigurationV1,
} from "./team-formation-reducer.js";
import {
  createTeamFormationHandoffV1,
  createTeamFormationStateV1,
  validateTeamFormationHandoffV1,
  validateTeamFormationPolicyV1,
  validateTeamFormationRequestV1,
  validateTeamFormationStateV1,
  validateTeamMemberOutcomeV1,
  validateTeamReconfigurationRequestV1,
} from "./team-formation-validation.js";
import { createTeamMemberContractBindingsV1 } from "./team-formation-adapters.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;

export class TeamFormationRuntimeV1 implements TeamFormationPortV1 {
  readonly formationId: string;
  readonly formationVersion: number;
  readonly implementationId: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly policyDigest: PlanningDigestV1;
  readonly #stateKey: string;
  readonly #policy: TeamFormationPolicyRecordV1;
  readonly #store: TeamFormationStoreV1;

  constructor(options: TeamFormationRuntimeOptionsV1) {
    if (!options || typeof options !== "object")
      fail("team formation runtime options are required");
    this.#stateKey = identifier(options.stateKey, "runtime.stateKey");
    this.formationId = identifier(options.formationId, "runtime.formationId");
    this.formationVersion = positive(
      options.formationVersion,
      "runtime.formationVersion",
    );
    this.implementationId = identifier(
      options.implementationId,
      "runtime.implementationId",
    );
    this.#policy = validateTeamFormationPolicyV1(options.policy);
    this.policyId = this.#policy.policy.policyId;
    this.policyVersion = this.#policy.policy.policyVersion;
    this.policyDigest = this.#policy.policyDigest;
    if (
      !options.store ||
      typeof options.store.load !== "function" ||
      typeof options.store.save !== "function"
    )
      fail("team formation store is required");
    this.#store = options.store;
  }

  async form(
    requestValue: TeamFormationRequestV1,
  ): Promise<TeamFormationDecisionV1> {
    const request = validateTeamFormationRequestV1(requestValue);
    return this.#commitDecision((state) =>
      reduceTeamFormationV1({ state, policy: this.#policy, request }),
    );
  }

  async reconfigure(
    requestValue: TeamReconfigurationRequestV1,
  ): Promise<TeamFormationDecisionV1> {
    const request = validateTeamReconfigurationRequestV1(requestValue);
    return this.#commitDecision((state) =>
      reduceTeamReconfigurationV1({ state, policy: this.#policy, request }),
    );
  }

  async activate(input: {
    readonly proposalDigest: PlanningDigestV1;
    readonly workContracts: Parameters<
      typeof createTeamMemberContractBindingsV1
    >[0]["workContracts"];
    readonly logicalTimeMs: number;
  }): Promise<JointWorkContractV1> {
    const proposalDigest = sha(
      input.proposalDigest,
      "activation.proposalDigest",
    );
    const logicalTimeMs = nonNegative(
      input.logicalTimeMs,
      "activation.logicalTimeMs",
    );
    for (let attempt = 0; attempt < this.#maximumAttempts(); attempt += 1) {
      const loaded = await this.#store.load(this.#stateKey);
      const state = loaded ? this.#validated(loaded) : this.#initialState();
      this.#assertBinding(state);
      const current = state.team?.jointWorkContract ?? null;
      if (
        current &&
        current.proposalDigest === proposalDigest &&
        state.team?.status === "active"
      )
        return current;
      const proposal = state.team?.proposal;
      if (!proposal || proposal.proposalDigest !== proposalDigest)
        fail("team activation proposal is not current");
      const memberContracts = createTeamMemberContractBindingsV1({
        proposal,
        workContracts: input.workContracts,
        logicalTimeMs,
      });
      const result = activateTeamProposalV1({
        state,
        policy: this.#policy,
        proposalDigest,
        memberContracts,
        logicalTimeMs,
      });
      if (
        await this.#store.save({
          state: result.state,
          expectedRevision: loaded ? state.revision : null,
        })
      )
        return result.contract;
    }
    throw new Error("team_formation_commit_conflict");
  }

  async recordOutcome(
    outcomeValue: TeamMemberOutcomeV1,
  ): Promise<TeamRecordV1> {
    const outcome = validateTeamMemberOutcomeV1(outcomeValue);
    for (let attempt = 0; attempt < this.#maximumAttempts(); attempt += 1) {
      const loaded = await this.#store.load(this.#stateKey);
      const state = loaded ? this.#validated(loaded) : this.#initialState();
      this.#assertBinding(state);
      const result = recordTeamMemberOutcomeV1({
        state,
        policy: this.#policy,
        outcome,
      });
      if (result.state.revision === state.revision) return result.team;
      if (
        await this.#store.save({
          state: result.state,
          expectedRevision: loaded ? state.revision : null,
        })
      )
        return result.team;
    }
    throw new Error("team_formation_commit_conflict");
  }

  async cancel(input: {
    readonly reasonCode: string;
    readonly logicalTimeMs: number;
  }): Promise<TeamRecordV1> {
    for (let attempt = 0; attempt < this.#maximumAttempts(); attempt += 1) {
      const loaded = await this.#store.load(this.#stateKey);
      const state = loaded ? this.#validated(loaded) : this.#initialState();
      this.#assertBinding(state);
      const result = cancelTeamV1({
        state,
        policy: this.#policy,
        reasonCode: input.reasonCode,
        logicalTimeMs: input.logicalTimeMs,
      });
      if (result.state.revision === state.revision) return result.team;
      if (
        await this.#store.save({
          state: result.state,
          expectedRevision: loaded ? state.revision : null,
        })
      )
        return result.team;
    }
    throw new Error("team_formation_commit_conflict");
  }

  async loadState(): Promise<TeamFormationStateV1> {
    const loaded = await this.#store.load(this.#stateKey);
    const state = loaded ? this.#validated(loaded) : this.#initialState();
    this.#assertBinding(state);
    return state;
  }

  async exportHandoff(input: {
    readonly targetStateKey: string;
    readonly logicalTimeMs: number;
  }): Promise<TeamFormationHandoffEnvelopeV1> {
    const state = await this.loadState();
    return createTeamFormationHandoffV1({
      sourceState: state,
      targetStateKey: input.targetStateKey,
      exportedAtLogicalMs: input.logicalTimeMs,
      policy: this.#policy,
    });
  }

  async importHandoff(input: {
    readonly handoff: TeamFormationHandoffEnvelopeV1;
    readonly logicalTimeMs: number;
  }): Promise<TeamFormationStateV1> {
    const handoff = validateTeamFormationHandoffV1(input.handoff, {
      policy: this.#policy,
    });
    const logicalTimeMs = nonNegative(
      input.logicalTimeMs,
      "handoff.logicalTimeMs",
    );
    if (
      handoff.targetStateKey !== this.#stateKey ||
      handoff.formationId !== this.formationId ||
      handoff.formationVersion !== this.formationVersion ||
      handoff.implementationId !== this.implementationId ||
      handoff.policyDigest !== this.policyDigest ||
      logicalTimeMs < handoff.exportedAtLogicalMs ||
      logicalTimeMs < handoff.sourceState.logicalTimeHighWaterMs
    )
      fail("team formation handoff binding is invalid");
    const existing = await this.#store.load(this.#stateKey);
    if (existing) {
      const state = this.#validated(existing);
      if (state.predecessorStateDigest === handoff.sourceStateDigest)
        return state;
      fail("team formation handoff target conflicts with existing state");
    }
    const source = handoff.sourceState;
    const restored = createTeamFormationStateV1({
      stateKey: this.#stateKey,
      formationId: this.formationId,
      formationVersion: this.formationVersion,
      implementationId: this.implementationId,
      policy: this.#policy,
      revision: source.revision + 1,
      logicalTimeHighWaterMs: Math.max(
        logicalTimeMs,
        source.logicalTimeHighWaterMs,
      ),
      team: source.team,
      lastDecision: source.lastDecision,
      predecessorStateDigest: source.stateDigest,
    });
    if (await this.#store.save({ state: restored, expectedRevision: null }))
      return restored;
    const raced = await this.#store.load(this.#stateKey);
    if (raced) {
      const state = this.#validated(raced);
      if (state.predecessorStateDigest === source.stateDigest) return state;
    }
    fail("team formation handoff target conflicts with existing state");
  }

  async #commitDecision(
    reduce: (state: TeamFormationStateV1) => {
      readonly state: TeamFormationStateV1;
      readonly decision: TeamFormationDecisionV1;
    },
  ): Promise<TeamFormationDecisionV1> {
    for (let attempt = 0; attempt < this.#maximumAttempts(); attempt += 1) {
      const loaded = await this.#store.load(this.#stateKey);
      const state = loaded ? this.#validated(loaded) : this.#initialState();
      this.#assertBinding(state);
      const result = reduce(state);
      if (result.state.revision === state.revision) return result.decision;
      if (
        await this.#store.save({
          state: result.state,
          expectedRevision: loaded ? state.revision : null,
        })
      )
        return result.decision;
    }
    throw new Error("team_formation_commit_conflict");
  }

  #initialState(): TeamFormationStateV1 {
    return createTeamFormationStateV1({
      stateKey: this.#stateKey,
      formationId: this.formationId,
      formationVersion: this.formationVersion,
      implementationId: this.implementationId,
      policy: this.#policy,
    });
  }

  #validated(input: unknown): TeamFormationStateV1 {
    return validateTeamFormationStateV1(input, { policy: this.#policy });
  }

  #assertBinding(state: TeamFormationStateV1): void {
    if (
      state.stateKey !== this.#stateKey ||
      state.formationId !== this.formationId ||
      state.formationVersion !== this.formationVersion ||
      state.implementationId !== this.implementationId ||
      state.policyDigest !== this.policyDigest
    )
      fail("team formation runtime binding changed");
  }

  #maximumAttempts(): number {
    return this.#policy.policy.limits.maximumCommitAttempts;
  }
}

export class InMemoryTeamFormationStoreV1 implements TeamFormationStoreV1 {
  readonly #states = new Map<string, TeamFormationStateV1>();

  async load(stateKey: string): Promise<TeamFormationStateV1 | null> {
    const state = this.#states.get(stateKey);
    return state ? structuredClone(state) : null;
  }

  async save(input: {
    readonly state: TeamFormationStateV1;
    readonly expectedRevision: number | null;
  }): Promise<boolean> {
    const current = this.#states.get(input.state.stateKey);
    if (
      (input.expectedRevision === null && current) ||
      (input.expectedRevision !== null &&
        (!current || current.revision !== input.expectedRevision))
    )
      return false;
    this.#states.set(input.state.stateKey, structuredClone(input.state));
    return true;
  }
}

function identifier(input: unknown, label: string): string {
  if (typeof input !== "string" || !IDENTIFIER.test(input))
    fail(`${label} is invalid`);
  return input;
}

function sha(input: unknown, label: string): PlanningDigestV1 {
  if (typeof input !== "string" || !DIGEST.test(input))
    fail(`${label} is invalid`);
  return input as PlanningDigestV1;
}

function positive(input: unknown, label: string): number {
  if (!Number.isSafeInteger(input) || (input as number) < 1)
    fail(`${label} is invalid`);
  return input as number;
}

function nonNegative(input: unknown, label: string): number {
  if (!Number.isSafeInteger(input) || (input as number) < 0)
    fail(`${label} is invalid`);
  return input as number;
}

function fail(message: string): never {
  throw new TypeError(message);
}
