import {
  ActionGateway,
  actionInputDigest,
  controlDigest,
  reconcileActionGrantV1,
  scopeDigest,
  type ActionAssessmentResolver,
  type ActionAuthorityResolver,
  type ActionBinding,
  type ActionDispatcher,
  type ActionGrant,
  type ActionGrantRepository,
  type ActionInvocationContextResolver,
  type ActionScope,
  type AuthorityResult,
  type ControlJson,
  type ControlJsonObject,
} from "@agentplat/inference-control/tools";

import type {
  GovernedActionPermitV1,
  GovernedActionPermitStatusV1,
} from "./contracts.js";
import {
  transitionGovernedActionPermitV1,
  validateCollectiveExecutionStateV1,
  type CollectiveExecutionRepositoryV1,
  type CollectiveExecutionStateV1,
} from "./lifecycle.js";
import {
  assertCollectiveIdentifier,
  validateGovernedActionPermitV1,
} from "./validation.js";

export type GovernedActionCheckStageV1 =
  "permit" | "authority" | "dispatch" | "reconcile";

export type GovernedActionCheckDecisionV1 =
  | { readonly allowed: true; readonly code: "allowed" }
  | { readonly allowed: false; readonly code: string };

/** Construction-bound policy check used at every protected action boundary. */
export interface GovernedActionGuardV1 {
  check(input: {
    readonly stage: GovernedActionCheckStageV1;
    readonly permit: GovernedActionPermitV1;
    readonly scope: ActionScope | null;
    readonly actionDigest: string;
    readonly logicalTimeMs: number;
  }): Promise<GovernedActionCheckDecisionV1>;
}

export function createGovernedActionAuthorityResolverV1(input: {
  readonly resolverId: string;
  readonly resolverVersion: number;
  readonly base: ActionAuthorityResolver;
  readonly permit: GovernedActionPermitV1;
  readonly guard: GovernedActionGuardV1;
  readonly logicalTimeMs: number;
}): ActionAuthorityResolver {
  const permit = validateGovernedActionPermitV1(input.permit);
  const resolve = input.base.resolve.bind(input.base);
  return Object.freeze({
    resolverId: input.resolverId,
    resolverVersion: input.resolverVersion,
    async resolve(
      scope: ActionScope,
      actionDigestValue: string,
      logicalTimeMs: number,
    ) {
      if (
        logicalTimeMs !== input.logicalTimeMs ||
        scopeDigest(scope) !== permit.actionScopeDigest
      )
        return staleAuthority(input, scope, actionDigestValue);
      let base: AuthorityResult;
      try {
        base = await resolve(scope, actionDigestValue, logicalTimeMs);
      } catch {
        return unavailableAuthority(input, scope, actionDigestValue);
      }
      if (base.status !== "current")
        return Object.freeze({
          schemaVersion: 1,
          status: base.status,
          resolverId: input.resolverId,
          resolverVersion: input.resolverVersion,
          scopeDigest: scopeDigest(scope),
          actionDigest: actionDigestValue,
        });
      if (
        base.scopeDigest !== scopeDigest(scope) ||
        base.actionDigest !== actionDigestValue ||
        scopeDigest(base.scope) !== scopeDigest(scope)
      )
        return unavailableAuthority(input, scope, actionDigestValue);
      let decision: GovernedActionCheckDecisionV1;
      try {
        decision = await input.guard.check({
          stage: "authority",
          permit,
          scope,
          actionDigest: actionDigestValue,
          logicalTimeMs,
        });
      } catch {
        return unavailableAuthority(input, scope, actionDigestValue);
      }
      if (!decision.allowed)
        return staleAuthority(input, scope, actionDigestValue);
      return Object.freeze({
        schemaVersion: 1,
        status: "current",
        resolverId: input.resolverId,
        resolverVersion: input.resolverVersion,
        scopeDigest: scopeDigest(scope),
        actionDigest: actionDigestValue,
        scope,
        authorityGeneration: base.authorityGeneration,
        fencingToken: base.fencingToken,
      });
    },
  });
}

export function createGovernedActionDispatcherV1(input: {
  readonly downstream: ActionDispatcher;
  readonly permit: GovernedActionPermitV1;
  readonly guard: GovernedActionGuardV1;
  readonly logicalTimeMs: number;
}): ActionDispatcher {
  const permit = validateGovernedActionPermitV1(input.permit);
  const dispatch = input.downstream.dispatch.bind(input.downstream);
  return Object.freeze({
    dispatcherId: input.downstream.dispatcherId,
    dispatcherVersion: input.downstream.dispatcherVersion,
    fencingMode: input.downstream.fencingMode,
    async dispatch(request: Parameters<ActionDispatcher["dispatch"]>[0]) {
      const bindingMatches =
        request.permit.grantId === permit.actionGrantId &&
        request.binding.namespace === permit.namespace &&
        request.binding.toolId === permit.toolId &&
        request.binding.operation === permit.operation &&
        request.binding.actionBindingId === permit.actionBindingId &&
        request.binding.actionBindingVersion === permit.actionBindingVersion &&
        request.binding.handlerDigest === permit.handlerDigest &&
        actionInputDigest(request.input) === permit.inputDigest;
      if (!bindingMatches)
        return Object.freeze({
          ok: false as const,
          error: Object.freeze({ code: "governed_binding_mismatch" }),
        });
      let decision: GovernedActionCheckDecisionV1;
      try {
        decision = await input.guard.check({
          stage: "dispatch",
          permit,
          scope: null,
          actionDigest: request.permit.actionDigest,
          logicalTimeMs: input.logicalTimeMs,
        });
      } catch {
        decision = Object.freeze({
          allowed: false,
          code: "governed_guard_unavailable",
        });
      }
      if (!decision.allowed)
        return Object.freeze({
          ok: false as const,
          error: Object.freeze({ code: decision.code }),
        });
      return dispatch(request);
    },
  });
}

const governedFactoryBrand = Symbol("governed-action-gateway-factory");

export class GovernedActionGatewayFactoryV1 {
  readonly [governedFactoryBrand] = true;

  constructor(
    readonly grantRepository: ActionGrantRepository,
    readonly binding: ActionBinding,
    readonly downstream: ActionDispatcher,
    readonly contextResolver: ActionInvocationContextResolver,
    readonly baseAuthorityResolver: ActionAuthorityResolver,
    readonly assessmentResolver: ActionAssessmentResolver,
    readonly guard: GovernedActionGuardV1,
  ) {}

  create(permit: GovernedActionPermitV1, logicalTimeMs: number): ActionGateway {
    const validated = validateGovernedActionPermitV1(permit);
    return new ActionGateway(
      this.grantRepository,
      this.binding,
      createGovernedActionDispatcherV1({
        downstream: this.downstream,
        permit: validated,
        guard: this.guard,
        logicalTimeMs,
      }),
      this.contextResolver,
      createGovernedActionAuthorityResolverV1({
        resolverId: `governed:${this.baseAuthorityResolver.resolverId}`,
        resolverVersion: this.baseAuthorityResolver.resolverVersion,
        base: this.baseAuthorityResolver,
        permit: validated,
        guard: this.guard,
        logicalTimeMs,
      }),
      this.assessmentResolver,
    );
  }
}

export function createGovernedActionGatewayFactoryV1(input: {
  readonly grantRepository: ActionGrantRepository;
  readonly binding: ActionBinding;
  readonly downstream: ActionDispatcher;
  readonly contextResolver: ActionInvocationContextResolver;
  readonly baseAuthorityResolver: ActionAuthorityResolver;
  readonly assessmentResolver: ActionAssessmentResolver;
  readonly guard: GovernedActionGuardV1;
}): GovernedActionGatewayFactoryV1 {
  return Object.freeze(
    new GovernedActionGatewayFactoryV1(
      input.grantRepository,
      Object.freeze({ ...input.binding }),
      input.downstream,
      input.contextResolver,
      input.baseAuthorityResolver,
      input.assessmentResolver,
      input.guard,
    ),
  );
}

export type GovernedActionDispatchDecisionV1 =
  | {
      readonly dispatched: true;
      readonly code: "dispatched";
      readonly result: Awaited<ReturnType<ActionGateway["invoke"]>>;
      readonly state: CollectiveExecutionStateV1;
      readonly permit: GovernedActionPermitV1;
    }
  | {
      readonly dispatched: false;
      readonly code:
        | "permit_missing"
        | "permit_not_issued"
        | "grant_binding_mismatch"
        | "governed_action_denied"
        | "repository_conflict"
        | "downstream_failed"
        | "effect_indeterminate";
      readonly state: CollectiveExecutionStateV1;
      readonly permit: GovernedActionPermitV1 | null;
      readonly result: Awaited<ReturnType<ActionGateway["invoke"]>> | null;
    };

/** Explicit, single-shot outer facade around the existing Action Gateway. */
export async function dispatchGovernedActionV1(input: {
  readonly executionRepository: CollectiveExecutionRepositoryV1;
  readonly gatewayFactory: GovernedActionGatewayFactoryV1;
  readonly permitId: string;
  readonly actionInput?: ControlJsonObject;
  readonly logicalTimeMs: number;
}): Promise<GovernedActionDispatchDecisionV1> {
  let state = validateCollectiveExecutionStateV1(
    await input.executionRepository.read(),
  );
  let permit = state.actionPermits.find(
    (candidate) => candidate.permitId === input.permitId,
  );
  if (!permit) return denied("permit_missing", state, null, null);
  if (permit.status !== "issued")
    return denied("permit_not_issued", state, permit, null);
  const grant = await input.gatewayFactory.grantRepository.loadGrant(
    permit.actionGrantId,
  );
  if (!grant || !permitMatchesGrant(permit, grant, input.actionInput ?? {}))
    return denied("grant_binding_mismatch", state, permit, null);
  let guard: GovernedActionCheckDecisionV1;
  try {
    guard = await input.gatewayFactory.guard.check({
      stage: "permit",
      permit,
      scope: grant.scope,
      actionDigest: grant.actionDigest,
      logicalTimeMs: input.logicalTimeMs,
    });
  } catch {
    guard = Object.freeze({
      allowed: false,
      code: "governed_guard_unavailable",
    });
  }
  if (!guard.allowed)
    return denied("governed_action_denied", state, permit, null);

  const reserved = await advancePermit(
    input.executionRepository,
    state,
    permit,
    {
      nextStatus: "reserved",
      outcomeId: null,
      logicalTimeMs: input.logicalTimeMs,
    },
  );
  if (!reserved) return denied("repository_conflict", state, permit, null);
  state = reserved.state;
  permit = reserved.permit;
  const dispatching = await advancePermit(
    input.executionRepository,
    state,
    permit,
    {
      nextStatus: "dispatching",
      outcomeId: null,
      logicalTimeMs: input.logicalTimeMs,
    },
  );
  if (!dispatching) return denied("repository_conflict", state, permit, null);
  state = dispatching.state;
  permit = dispatching.permit;

  let result: Awaited<ReturnType<ActionGateway["invoke"]>> | null = null;
  try {
    result = await input.gatewayFactory
      .create(permit, input.logicalTimeMs)
      .invoke({
        schemaVersion: 1,
        grantId: permit.actionGrantId,
        input: input.actionInput ?? {},
        logicalTimeMs: input.logicalTimeMs,
      });
  } catch {
    result = null;
  }
  let finalGrant: ActionGrant | undefined;
  try {
    finalGrant = await input.gatewayFactory.grantRepository.loadGrant(
      permit.actionGrantId,
    );
  } catch {
    finalGrant = undefined;
  }
  const finalStatus = permitStatusFromGrant(finalGrant);
  const settled = await advancePermit(
    input.executionRepository,
    state,
    permit,
    {
      nextStatus: finalStatus,
      outcomeId: `outcome:${permit.actionGrantId}:${finalGrant?.stateGeneration ?? 0}:${finalStatus}`,
      logicalTimeMs: input.logicalTimeMs,
    },
  );
  if (!settled) return denied("effect_indeterminate", state, permit, result);
  if (finalStatus === "dispatched" && result?.ok)
    return Object.freeze({
      dispatched: true,
      code: "dispatched",
      result,
      state: settled.state,
      permit: settled.permit,
    });
  return denied(
    finalStatus === "indeterminate"
      ? "effect_indeterminate"
      : "downstream_failed",
    settled.state,
    settled.permit,
    result,
  );
}

export interface IndeterminateEffectResolverV1 {
  resolve(input: {
    readonly permit: GovernedActionPermitV1;
    readonly grant: ActionGrant;
    readonly logicalTimeMs: number;
  }): Promise<
    | { readonly status: "indeterminate"; readonly outcomeId: null }
    | {
        readonly status: "dispatched" | "failed";
        readonly outcomeId: string;
      }
  >;
}

export type GovernedActionReconciliationDecisionV1 =
  | {
      readonly reconciled: true;
      readonly code: "reconciled" | "already_reconciled";
      readonly state: CollectiveExecutionStateV1;
      readonly permit: GovernedActionPermitV1;
    }
  | {
      readonly reconciled: false;
      readonly code:
        | "permit_missing"
        | "effect_indeterminate"
        | "governed_action_denied"
        | "repository_conflict";
      readonly state: CollectiveExecutionStateV1;
      readonly permit: GovernedActionPermitV1 | null;
    };

/** Reconciles an ambiguous effect once, using explicit downstream proof. */
export async function reconcileGovernedActionV1(input: {
  readonly executionRepository: CollectiveExecutionRepositoryV1;
  readonly gatewayFactory: GovernedActionGatewayFactoryV1;
  readonly effectResolver: IndeterminateEffectResolverV1;
  readonly permitId: string;
  readonly logicalTimeMs: number;
}): Promise<GovernedActionReconciliationDecisionV1> {
  const state = validateCollectiveExecutionStateV1(
    await input.executionRepository.read(),
  );
  const permit = state.actionPermits.find(
    (candidate) => candidate.permitId === input.permitId,
  );
  if (!permit)
    return Object.freeze({
      reconciled: false,
      code: "permit_missing",
      state,
      permit: null,
    });
  if (permit.status === "dispatched" || permit.status === "failed")
    return Object.freeze({
      reconciled: true,
      code: "already_reconciled",
      state,
      permit,
    });
  if (permit.status !== "indeterminate")
    return Object.freeze({
      reconciled: false,
      code: "effect_indeterminate",
      state,
      permit,
    });
  let grant = await input.gatewayFactory.grantRepository.loadGrant(
    permit.actionGrantId,
  );
  if (!grant)
    return Object.freeze({
      reconciled: false,
      code: "effect_indeterminate",
      state,
      permit,
    });
  let guard: GovernedActionCheckDecisionV1;
  try {
    guard = await input.gatewayFactory.guard.check({
      stage: "reconcile",
      permit,
      scope: grant.scope,
      actionDigest: grant.actionDigest,
      logicalTimeMs: input.logicalTimeMs,
    });
  } catch {
    guard = Object.freeze({
      allowed: false,
      code: "governed_guard_unavailable",
    });
  }
  if (!guard.allowed)
    return Object.freeze({
      reconciled: false,
      code: "governed_action_denied",
      state,
      permit,
    });
  let status: "dispatched" | "failed" | "indeterminate" =
    grant.status === "dispatched" || grant.status === "failed"
      ? grant.status
      : "indeterminate";
  let outcomeId: string | null =
    status === "indeterminate"
      ? null
      : `outcome:${grant.grantId}:${grant.stateGeneration}:${status}`;
  if (status === "indeterminate") {
    let proof;
    try {
      proof = await input.effectResolver.resolve({
        permit,
        grant,
        logicalTimeMs: input.logicalTimeMs,
      });
    } catch {
      proof = { status: "indeterminate" as const, outcomeId: null };
    }
    if (proof.status === "indeterminate")
      return Object.freeze({
        reconciled: false,
        code: "effect_indeterminate",
        state,
        permit,
      });
    try {
      assertCollectiveIdentifier(proof.outcomeId, "outcomeId");
      const reservation = grant.reservation;
      if (!reservation) throw new Error("state_conflict");
      grant = await reconcileActionGrantV1(
        input.gatewayFactory.grantRepository,
        {
          grantId: grant.grantId,
          reservationId: reservation.reservationId,
          dispatchAttemptId: reservation.dispatchAttemptId,
          outcome: proof.status,
        },
      );
      status = proof.status;
      outcomeId = proof.outcomeId;
    } catch {
      return Object.freeze({
        reconciled: false,
        code: "repository_conflict",
        state,
        permit,
      });
    }
  }
  const settled = await advancePermit(
    input.executionRepository,
    state,
    permit,
    {
      nextStatus: status,
      outcomeId,
      logicalTimeMs: input.logicalTimeMs,
    },
  );
  if (!settled)
    return Object.freeze({
      reconciled: false,
      code: "repository_conflict",
      state,
      permit,
    });
  return Object.freeze({
    reconciled: true,
    code: "reconciled",
    state: settled.state,
    permit: settled.permit,
  });
}

function permitMatchesGrant(
  permit: GovernedActionPermitV1,
  grant: ActionGrant,
  input: ControlJsonObject,
): boolean {
  return (
    permit.actionGrantDigest ===
      controlDigest("grant", grant as unknown as ControlJson) &&
    permit.actionScopeDigest === grant.scopeDigest &&
    permit.actionGrantId === grant.grantId &&
    permit.namespace === grant.namespace &&
    permit.toolId === grant.toolId &&
    permit.operation === grant.operation &&
    permit.actionBindingId === grant.actionBindingId &&
    permit.actionBindingVersion === grant.actionBindingVersion &&
    permit.handlerDigest === grant.handlerDigest &&
    permit.inputDigest === grant.inputDigest &&
    permit.inputDigest === actionInputDigest(input) &&
    (grant.scope.kind !== "coordinated" ||
      (permit.assignmentAuthorityId === grant.scope.assignmentAuthorityId &&
        permit.assignedPeerId === grant.scope.peerId &&
        permit.assignedInstanceId === grant.scope.instanceId &&
        permit.assignmentEpoch === grant.scope.assignmentEpoch &&
        permit.authorityGeneration === grant.scope.authorityGeneration &&
        permit.fencingToken === grant.scope.fencingToken))
  );
}

async function advancePermit(
  repository: CollectiveExecutionRepositoryV1,
  state: CollectiveExecutionStateV1,
  permit: GovernedActionPermitV1,
  input: {
    readonly nextStatus: GovernedActionPermitStatusV1;
    readonly outcomeId: string | null;
    readonly logicalTimeMs: number;
  },
): Promise<{
  readonly state: CollectiveExecutionStateV1;
  readonly permit: GovernedActionPermitV1;
} | null> {
  const decision = transitionGovernedActionPermitV1(state, {
    permitId: permit.permitId,
    expectedGeneration: permit.generation,
    expectedDigest: permit.permitDigest,
    ...input,
  });
  if (!decision.accepted || !decision.actionPermit) return null;
  const written = await repository.compareAndSwap({
    expectedGeneration: state.generation,
    expectedStateDigest: state.stateDigest,
    nextState: decision.state,
  });
  return written
    ? Object.freeze({ state: decision.state, permit: decision.actionPermit })
    : null;
}

function permitStatusFromGrant(
  grant: ActionGrant | undefined,
): Extract<
  GovernedActionPermitStatusV1,
  "dispatched" | "failed" | "indeterminate"
> {
  if (grant?.status === "dispatched") return "dispatched";
  if (grant?.status === "failed" || grant?.status === "expired")
    return "failed";
  return "indeterminate";
}

function denied(
  code: Extract<
    GovernedActionDispatchDecisionV1,
    { dispatched: false }
  >["code"],
  state: CollectiveExecutionStateV1,
  permit: GovernedActionPermitV1 | null,
  result: Awaited<ReturnType<ActionGateway["invoke"]>> | null,
): GovernedActionDispatchDecisionV1 {
  return Object.freeze({ dispatched: false, code, state, permit, result });
}

function staleAuthority(
  input: { readonly resolverId: string; readonly resolverVersion: number },
  scope: ActionScope,
  actionDigestValue: string,
): AuthorityResult {
  return Object.freeze({
    schemaVersion: 1,
    status: "stale",
    resolverId: input.resolverId,
    resolverVersion: input.resolverVersion,
    scopeDigest: scopeDigest(scope),
    actionDigest: actionDigestValue,
  });
}

function unavailableAuthority(
  input: { readonly resolverId: string; readonly resolverVersion: number },
  scope: ActionScope,
  actionDigestValue: string,
): AuthorityResult {
  return Object.freeze({
    schemaVersion: 1,
    status: "unavailable",
    resolverId: input.resolverId,
    resolverVersion: input.resolverVersion,
    scopeDigest: scopeDigest(scope),
    actionDigest: actionDigestValue,
  });
}
