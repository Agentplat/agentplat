import type { PlanningDigestV1 } from "@agentplat/collective-planning";

import {
  GOVERNED_MISSION_LIFECYCLE_SCHEMA_VERSION_V1,
  GOVERNED_MISSION_LIFECYCLE_STATE_FORMAT_V1,
  type GovernedMissionActionV1,
  type GovernedMissionAuthorizationV1,
  type GovernedMissionControlActionV1,
  type GovernedMissionLifecyclePortV1,
  type GovernedMissionLifecycleRuntimeOptionsV1,
  type GovernedMissionOperationV1,
  type GovernedMissionRequestV1,
  type GovernedMissionStateV1,
} from "./mission-lifecycle-contracts.js";
import {
  governedMissionIntentDigestV1,
  governedMissionStateDigestV1,
  validateGovernedMissionAuthorizationV1,
  validateGovernedMissionControlProposalV1,
  validateGovernedMissionPolicyV1,
  validateGovernedMissionRequestV1,
  validateGovernedMissionStateV1,
} from "./mission-lifecycle-validation.js";

/**
 * Provider-neutral mission saga. Ports receive only digests and fenced scope
 * coordinates. Their effects must be idempotent by operationId.
 */
export class GovernedMissionLifecycleRuntimeV1 implements GovernedMissionLifecyclePortV1 {
  readonly #options: GovernedMissionLifecycleRuntimeOptionsV1;

  constructor(options: GovernedMissionLifecycleRuntimeOptionsV1) {
    if (!options?.store || !options?.ports)
      throw new TypeError("mission lifecycle store and ports are required");
    if (!options.stateKey)
      throw new TypeError("mission lifecycle state key is required");
    for (const key of [
      "authorization",
      "decision",
      "allocation",
      "formation",
      "execution",
      "control",
      "reconfiguration",
    ] as const) {
      if (!options.ports[key])
        throw new TypeError(`mission lifecycle ${key} port is required`);
    }
    if (
      typeof options.ports.authorization.authorize !== "function" ||
      typeof options.ports.authorization.verify !== "function"
    )
      throw new TypeError("mission lifecycle authorization port is invalid");
    this.#options = {
      ...options,
      policy: validateGovernedMissionPolicyV1(options.policy),
    };
  }

  async advance(
    rawRequest: GovernedMissionRequestV1,
  ): Promise<GovernedMissionStateV1> {
    const request = validateGovernedMissionRequestV1(rawRequest);
    this.#assertRequestPolicy(request);
    let commitConflicts = 0;
    for (
      let transition = 0;
      transition < this.#options.policy.budget.maximumTransitionsPerInvocation;
      transition += 1
    ) {
      const state = await this.#loadOrInitial(request);
      this.#assertStateRequest(state, request);
      if (state.phase === "completed" || state.phase === "failed") return state;
      if (request.logicalTimeMs < state.logicalTimeHighWaterMs)
        throw new TypeError("mission lifecycle logical time rollback");

      if (state.pendingOperation) {
        const preparedAction = state.pendingOperation.action;
        const committed = await this.#applyPrepared(request, state);
        if (committed && preparedAction === "enact_pause_dispatch")
          return this.#loadOrInitial(request);
        if (committed) continue;
        if (
          ++commitConflicts >= this.#options.policy.budget.maximumCommitAttempts
        )
          throw new Error(
            "mission lifecycle state commit contention exceeded limit",
          );
        continue; // CAS contention: replay the durable operation identity.
      }
      if (state.phase === "control" || state.phase === "paused") {
        const evaluated = await this.#evaluateControl(request, state);
        if (evaluated) continue;
        if (
          ++commitConflicts >= this.#options.policy.budget.maximumCommitAttempts
        )
          throw new Error(
            "mission lifecycle state commit contention exceeded limit",
          );
        continue;
      }
      const action = this.#nextAction(state);
      if (!action) return state;
      if (
        state.actionUnitsConsumed >=
        this.#options.policy.budget.maximumActionUnits
      )
        throw new Error("mission lifecycle action budget exhausted");
      if (
        this.#isReconfiguration(action) &&
        state.reconfigurationCount >=
          this.#options.policy.budget.maximumReconfigurations
      )
        throw new Error("mission lifecycle reconfiguration budget exhausted");
      const prepared = this.#prepare(state, request, action);
      const next = this.#state(state, request.logicalTimeMs, {
        pendingOperation: prepared,
        outbox: [
          ...state.outbox,
          {
            operationId: prepared.operationId,
            action: prepared.action,
            intentDigest: prepared.intentDigest,
            controlProposalDigest: prepared.controlProposalDigest,
            status: "prepared",
            authorizationDigest: null,
            resultDigest: null,
          },
        ],
      });
      if (!(await this.#save(state, next))) {
        if (
          ++commitConflicts >= this.#options.policy.budget.maximumCommitAttempts
        )
          throw new Error(
            "mission lifecycle state commit contention exceeded limit",
          );
      }
    }
    throw new Error("mission lifecycle transition budget exhausted");
  }

  async recover(
    request: GovernedMissionRequestV1,
  ): Promise<GovernedMissionStateV1> {
    return this.advance(request);
  }

  async #loadOrInitial(
    request: GovernedMissionRequestV1,
  ): Promise<GovernedMissionStateV1> {
    const found = await this.#options.store.load(this.#options.stateKey);
    if (found) {
      const state = validateGovernedMissionStateV1(found);
      await this.#verifyApplied(state);
      return state;
    }
    const initial = this.#initial(request);
    if (
      await this.#options.store.save({
        state: initial,
        expectedRevision: null,
        expectedStateDigest: null,
      })
    )
      return initial;
    const raced = await this.#options.store.load(this.#options.stateKey);
    if (!raced) throw new Error("mission lifecycle initial state contention");
    const state = validateGovernedMissionStateV1(raced);
    await this.#verifyApplied(state);
    return state;
  }

  async #applyPrepared(
    request: GovernedMissionRequestV1,
    state: GovernedMissionStateV1,
  ): Promise<boolean> {
    const operation = state.pendingOperation!;
    if (this.#isReconfiguration(operation.action))
      this.#assertControlProposalCurrent(state, operation, request);
    const authorization = await this.#options.ports.authorization.authorize({
      action: operation.action,
      operationId: operation.operationId,
      intentDigest: operation.intentDigest,
      scope: request.scope,
      logicalTimeMs: request.logicalTimeMs,
    });
    this.#validateAuthorization(authorization, operation, request);
    const resultDigest = await this.#invoke(
      operation.action,
      request,
      state,
      authorization!,
    );
    if (!/^sha256:[0-9a-f]{64}$/u.test(resultDigest))
      throw new TypeError("mission lifecycle port result digest is invalid");
    const transitioned = this.#afterAction(
      state,
      operation.action,
      resultDigest,
      request.logicalTimeMs,
    );
    const next = this.#state(state, request.logicalTimeMs, {
      ...transitioned,
      actionUnitsConsumed: state.actionUnitsConsumed + 1,
      reconfigurationCount:
        state.reconfigurationCount +
        (this.#isReconfiguration(operation.action) ? 1 : 0),
      pendingOperation: null,
      outbox: state.outbox.map((entry) =>
        entry.operationId === operation.operationId
          ? {
              ...entry,
              status: "applied" as const,
              authorizationDigest: authorization!.authorizationDigest,
              resultDigest,
            }
          : entry,
      ),
    });
    return this.#save(state, next);
  }

  async #evaluateControl(
    request: GovernedMissionRequestV1,
    state: GovernedMissionStateV1,
  ): Promise<boolean> {
    if (!state.executionObservationDigest)
      throw new TypeError("mission control requires an execution observation");
    const proposal = validateGovernedMissionControlProposalV1(
      await this.#options.ports.control.evaluate({
        scope: request.scope,
        logicalTimeMs: request.logicalTimeMs,
        executionObservationDigest: state.executionObservationDigest,
      }),
    );
    if (
      proposal.scopeDigest !== request.scope.scopeDigest ||
      proposal.authorityEpoch !== request.scope.authorityEpoch ||
      proposal.evaluatedAtLogicalMs > request.logicalTimeMs ||
      proposal.expiresAtLogicalMs <= request.logicalTimeMs
    )
      throw new TypeError(
        "mission control proposal is stale, expired, or out of scope",
      );
    if (proposal.action === "continue") {
      const next = this.#state(state, request.logicalTimeMs, {
        phase: "completed",
        controlProposal: proposal,
      });
      return this.#save(state, next);
    }
    const action = this.#controlAction(proposal.action);
    if (
      state.reconfigurationCount >=
      this.#options.policy.budget.maximumReconfigurations
    )
      throw new Error("mission lifecycle reconfiguration budget exhausted");
    const prepared = this.#prepare(
      state,
      request,
      action,
      proposal.proposalDigest,
    );
    const next = this.#state(state, request.logicalTimeMs, {
      phase: "reconfiguration",
      controlProposal: proposal,
      pendingOperation: prepared,
      outbox: [
        ...state.outbox,
        {
          operationId: prepared.operationId,
          action,
          intentDigest: prepared.intentDigest,
          controlProposalDigest: prepared.controlProposalDigest,
          status: "prepared",
          authorizationDigest: null,
          resultDigest: null,
        },
      ],
    });
    return this.#save(state, next);
  }

  async #invoke(
    action: GovernedMissionActionV1,
    request: GovernedMissionRequestV1,
    state: GovernedMissionStateV1,
    authorization: GovernedMissionAuthorizationV1,
  ): Promise<PlanningDigestV1> {
    const operation = state.pendingOperation!;
    const input = {
      request,
      scope: request.scope,
      operation,
      authorization,
      state,
    };
    switch (action) {
      case "certify_plan":
        return (await this.#options.ports.decision.certifyPlan(input))
          .decisionDigest;
      case "activate_allocation":
        return (await this.#options.ports.allocation.activateAllocation(input))
          .allocationDigest;
      case "activate_team":
        return (await this.#options.ports.formation.activateTeam(input))
          .teamDigest;
      case "observe_execution":
        return (await this.#options.ports.execution.observeExecution(input))
          .observationDigest;
      default:
        if (!state.controlProposal)
          throw new TypeError(
            "mission reconfiguration requires an advisory proposal",
          );
        return (
          await this.#options.ports.reconfiguration.enact({
            ...input,
            controlProposal: state.controlProposal,
          })
        ).resultDigest;
    }
  }

  #afterAction(
    state: GovernedMissionStateV1,
    action: GovernedMissionActionV1,
    result: PlanningDigestV1,
    now: number,
  ): Partial<GovernedMissionStateV1> {
    switch (action) {
      case "certify_plan":
        return { phase: "allocation", planDecisionDigest: result };
      case "activate_allocation":
        return { phase: "formation", allocationDigest: result };
      case "activate_team":
        return { phase: "execution", teamDigest: result };
      case "observe_execution":
        return { phase: "control", executionObservationDigest: result };
      case "enact_pause_dispatch":
        return { phase: "paused" };
      case "enact_role_transition":
      case "enact_work_reassignment":
        return {
          phase: "execution",
          executionObservationDigest: null,
          controlProposal: null,
        };
      case "enact_team_adaptation":
        return {
          phase: "formation",
          teamDigest: null,
          executionObservationDigest: null,
          controlProposal: null,
        };
      case "enact_replanning":
      case "enact_restrict_participation":
        return {
          phase: "planning",
          planDecisionDigest: null,
          allocationDigest: null,
          teamDigest: null,
          executionObservationDigest: null,
          controlProposal: null,
        };
    }
  }

  #nextAction(state: GovernedMissionStateV1): GovernedMissionActionV1 | null {
    switch (state.phase) {
      case "planning":
        return "certify_plan";
      case "allocation":
        return "activate_allocation";
      case "formation":
        return "activate_team";
      case "execution":
        return "observe_execution";
      default:
        return null;
    }
  }
  #controlAction(
    action: GovernedMissionControlActionV1,
  ): GovernedMissionActionV1 {
    switch (action) {
      case "pause_dispatch":
        return "enact_pause_dispatch";
      case "restrict_participation":
        return "enact_restrict_participation";
      case "request_role_transition":
        return "enact_role_transition";
      case "request_work_reassignment":
        return "enact_work_reassignment";
      case "request_team_adaptation":
        return "enact_team_adaptation";
      case "request_replanning":
        return "enact_replanning";
      default:
        throw new TypeError("unsupported mission control action");
    }
  }
  #isReconfiguration(action: GovernedMissionActionV1): boolean {
    return action.startsWith("enact_");
  }
  #prepare(
    state: GovernedMissionStateV1,
    request: GovernedMissionRequestV1,
    action: GovernedMissionActionV1,
    controlProposalDigest: PlanningDigestV1 | null = null,
  ): GovernedMissionOperationV1 {
    const ordinal =
      state.outbox.filter((entry) => entry.action === action).length + 1;
    const operationId = `${request.scope.missionId}.${action}.${request.scope.authorityEpoch}.${ordinal}`;
    const intentDigest = governedMissionIntentDigestV1({
      action,
      requestId: request.requestId,
      planInputDigest: request.planInputDigest,
      scopeDigest: request.scope.scopeDigest,
      authorityEpoch: request.scope.authorityEpoch,
      operationId,
      controlProposalDigest,
    });
    return Object.freeze({
      operationId,
      action,
      intentDigest,
      controlProposalDigest,
      preparedAtLogicalMs: request.logicalTimeMs,
      status: "prepared",
      resultDigest: null,
      authorizationDigest: null,
    });
  }
  #initial(request: GovernedMissionRequestV1): GovernedMissionStateV1 {
    const body = {
      format: GOVERNED_MISSION_LIFECYCLE_STATE_FORMAT_V1,
      schemaVersion: GOVERNED_MISSION_LIFECYCLE_SCHEMA_VERSION_V1,
      stateKey: this.#options.stateKey,
      scope: request.scope,
      policyDigest: request.policyDigest,
      requestId: request.requestId,
      planInputDigest: request.planInputDigest,
      revision: 0,
      logicalTimeHighWaterMs: request.logicalTimeMs,
      phase: "planning" as const,
      actionUnitsConsumed: 0,
      reconfigurationCount: 0,
      planDecisionDigest: null,
      allocationDigest: null,
      teamDigest: null,
      executionObservationDigest: null,
      controlProposal: null,
      pendingOperation: null,
      outbox: [],
      predecessorStateDigest: null,
    };
    return Object.freeze({
      ...body,
      stateDigest: governedMissionStateDigestV1(body),
    });
  }
  #state(
    state: GovernedMissionStateV1,
    logicalTimeMs: number,
    update: Partial<GovernedMissionStateV1>,
  ): GovernedMissionStateV1 {
    const { stateDigest: previousDigest, ...current } = state;
    const body = {
      ...current,
      ...update,
      revision: state.revision + 1,
      logicalTimeHighWaterMs: Math.max(
        state.logicalTimeHighWaterMs,
        logicalTimeMs,
      ),
      predecessorStateDigest: previousDigest,
    };
    return Object.freeze({
      ...body,
      stateDigest: governedMissionStateDigestV1(body),
    });
  }
  async #save(
    previous: GovernedMissionStateV1,
    next: GovernedMissionStateV1,
  ): Promise<boolean> {
    return this.#options.store.save({
      state: next,
      expectedRevision: previous.revision,
      expectedStateDigest: previous.stateDigest,
    });
  }
  #assertRequestPolicy(request: GovernedMissionRequestV1): void {
    if (
      request.policyDigest !== this.#options.policy.policyDigest ||
      request.requestId !== this.#options.policy.requestId ||
      request.planInputDigest !== this.#options.policy.planInputDigest
    )
      throw new TypeError("mission lifecycle policy/request binding changed");
  }
  #assertStateRequest(
    state: GovernedMissionStateV1,
    request: GovernedMissionRequestV1,
  ): void {
    if (
      state.stateKey !== this.#options.stateKey ||
      state.policyDigest !== request.policyDigest ||
      state.requestId !== request.requestId ||
      state.planInputDigest !== request.planInputDigest ||
      state.scope.scopeDigest !== request.scope.scopeDigest ||
      state.scope.authorityEpoch !== request.scope.authorityEpoch ||
      state.scope.fencingToken !== request.scope.fencingToken
    )
      throw new TypeError(
        "mission lifecycle request, scope, epoch, or fencing binding changed",
      );
    if (
      state.actionUnitsConsumed >
        this.#options.policy.budget.maximumActionUnits ||
      state.reconfigurationCount >
        this.#options.policy.budget.maximumReconfigurations
    )
      throw new TypeError("mission lifecycle stored budget is exceeded");
  }
  #validateAuthorization(
    value: GovernedMissionAuthorizationV1 | null,
    operation: GovernedMissionOperationV1,
    request: GovernedMissionRequestV1,
  ): void {
    if (!value) throw new Error("mission lifecycle authorization denied");
    const authorization = validateGovernedMissionAuthorizationV1(value);
    if (
      authorization.action !== operation.action ||
      authorization.operationId !== operation.operationId ||
      authorization.intentDigest !== operation.intentDigest ||
      authorization.scopeDigest !== request.scope.scopeDigest ||
      authorization.authorityEpoch !== request.scope.authorityEpoch ||
      authorization.fencingToken !== request.scope.fencingToken ||
      authorization.expiresAtLogicalMs <= request.logicalTimeMs ||
      authorization.issuedAtLogicalMs > request.logicalTimeMs
    )
      throw new TypeError(
        "mission lifecycle authorization is stale, conflicting, or invalid",
      );
  }
  #assertControlProposalCurrent(
    state: GovernedMissionStateV1,
    operation: GovernedMissionOperationV1,
    request: GovernedMissionRequestV1,
  ): void {
    if (!state.controlProposal)
      throw new TypeError(
        "mission reconfiguration requires a retained control proposal",
      );
    const proposal = validateGovernedMissionControlProposalV1(
      state.controlProposal,
    );
    if (
      proposal.scopeDigest !== state.scope.scopeDigest ||
      proposal.authorityEpoch !== state.scope.authorityEpoch ||
      proposal.expiresAtLogicalMs <= request.logicalTimeMs ||
      operation.controlProposalDigest !== proposal.proposalDigest ||
      this.#controlAction(proposal.action) !== operation.action
    )
      throw new TypeError(
        "mission retained control proposal is stale, conflicting, or expired",
      );
  }
  async #verifyApplied(state: GovernedMissionStateV1): Promise<void> {
    for (const record of state.outbox) {
      if (record.status !== "applied") continue;
      const authorization = await this.#options.ports.authorization.verify({
        authorizationDigest: record.authorizationDigest!,
        action: record.action,
        operationId: record.operationId,
        intentDigest: record.intentDigest,
        scope: state.scope,
      });
      if (!authorization)
        throw new Error(
          "mission lifecycle retained authorization verification failed",
        );
      const valid = validateGovernedMissionAuthorizationV1(authorization);
      if (
        valid.authorizationDigest !== record.authorizationDigest ||
        valid.action !== record.action ||
        valid.operationId !== record.operationId ||
        valid.intentDigest !== record.intentDigest ||
        valid.scopeDigest !== state.scope.scopeDigest ||
        valid.authorityEpoch !== state.scope.authorityEpoch ||
        valid.fencingToken !== state.scope.fencingToken
      )
        throw new TypeError(
          "mission lifecycle retained authorization is conflicting",
        );
    }
  }
}

/** In-memory CAS store for deterministic tests and local composition only. */
export class InMemoryGovernedMissionStoreV1 {
  #state: GovernedMissionStateV1 | null = null;
  async load(): Promise<GovernedMissionStateV1 | null> {
    return this.#state ? validateGovernedMissionStateV1(this.#state) : null;
  }
  async save(input: {
    readonly state: GovernedMissionStateV1;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: PlanningDigestV1 | null;
  }): Promise<boolean> {
    if (this.#state === null) {
      if (
        input.expectedRevision !== null ||
        input.expectedStateDigest !== null ||
        input.state.revision !== 0
      )
        return false;
    } else if (
      input.expectedRevision !== this.#state.revision ||
      input.expectedStateDigest !== this.#state.stateDigest ||
      input.state.revision !== this.#state.revision + 1
    )
      return false;
    this.#state = validateGovernedMissionStateV1(input.state);
    return true;
  }
}
