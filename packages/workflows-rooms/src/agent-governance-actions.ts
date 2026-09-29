import {
  ActionGateway,
  actionDigest,
  actionInputDigest,
  scopeDigest,
  controlDigest,
  type ActionScope,
  type ActionGrantRepository,
  type ActionBinding,
  type ActionDispatcher,
  type ActionInvocationContextResolver,
  type ActionAuthorityResolver,
  type ActionAssessmentResolver,
  type ActionGrant,
  type ControlJsonObject,
} from "@agentplat/inference-control/tools";
import type {
  AgentExecutionControllerV1,
  AgentExecutionBindingV1,
  AgentEffectChargeV1,
} from "@agentplat/rooms";

/** Bind the existing assessment target to this governance epoch at grant issuance. */
export function agentGovernanceActionTargetDigestV1(
  governance: AgentExecutionBindingV1,
  scope: ActionScope,
  binding: ActionBinding,
  input: ControlJsonObject,
): string {
  return controlDigest("message", {
    domain: "agent-governance-action-target-v1",
    governance: {
      tenantId: governance.tenantId,
      agentId: governance.agentId,
      governanceId: governance.governanceId,
      revision: governance.revision,
      authorityEpoch: governance.authorityEpoch,
      configurationDigest: governance.configurationDigest,
      definitionRevisionId: governance.definitionRevisionId,
      profileDigest: governance.profileDigest,
      ...(governance.continuity
        ? {
            continuity: governance.continuity.map(
              ({ parentWork, delegation, ...link }) => ({
                ...link,
                ...(delegation ? { delegation: { ...delegation } } : {}),
                ...(parentWork ? { parentWork: { ...parentWork } } : {}),
              }),
            ),
          }
        : {}),
      ...(governance.purposeControlDigest
        ? { purposeControlDigest: governance.purposeControlDigest }
        : {}),
      ...(governance.purposeWork
        ? { purposeWork: { ...governance.purposeWork } }
        : {}),
    },
    scopeDigest: scopeDigest(scope),
    actionBinding: { ...binding },
    inputDigest: actionInputDigest(input),
  });
}

/** Host-owned quote extraction; amounts/destination must come from the exact bound tool input. */
export interface AgentGovernedActionQuotePortV1 {
  quote(input: {
    grant: ActionGrant;
    binding: ActionBinding;
    input: ControlJsonObject;
  }): Promise<{
    effectId: string;
    destination: string | null;
    charges: AgentEffectChargeV1[];
  }>;
}
/** Compose with the existing grant, policy and assessment checks; creates no grant or permission. */
export function createAgentGovernanceActionGatewayV1(options: {
  ledger: ActionGrantRepository;
  binding: ActionBinding;
  downstream: ActionDispatcher;
  contextResolver: ActionInvocationContextResolver;
  authorityResolver: ActionAuthorityResolver;
  assessmentResolver: ActionAssessmentResolver;
  controller: AgentExecutionControllerV1;
  governance: AgentExecutionBindingV1;
  quote: AgentGovernedActionQuotePortV1;
}): ActionGateway {
  const governance = structuredClone(options.governance);
  const { ledger, controller, authorityResolver, assessmentResolver } = options;
  const quoteAction = options.quote.quote.bind(options.quote);
  const dispatch = options.downstream.dispatch.bind(options.downstream);
  const dispatcher: ActionDispatcher = {
    dispatcherId: options.downstream.dispatcherId,
    dispatcherVersion: options.downstream.dispatcherVersion,
    fencingMode: options.downstream.fencingMode,
    async dispatch(request) {
      const grant = await ledger.loadGrant(request.permit.grantId);
      if (
        !grant ||
        grant.status !== "reserved" ||
        grant.scope.tenantId !== governance.tenantId ||
        grant.scope.agentId !== governance.agentId ||
        grant.reservation?.reservationId !== request.permit.reservationId ||
        grant.reservation.dispatchAttemptId !==
          request.permit.dispatchAttemptId ||
        grant.actionDigest !== request.permit.actionDigest ||
        grant.assessmentTargetDigest !==
          agentGovernanceActionTargetDigestV1(
            governance,
            grant.scope,
            request.binding,
            request.input,
          ) ||
        grant.scopeDigest !== request.permit.scopeDigest ||
        scopeDigest(grant.scope) !== grant.scopeDigest ||
        request.permit.gatewayId !== ledger.gatewayId ||
        grant.reservation.reservedByGatewayId !== request.permit.gatewayId ||
        request.binding.actionBindingId !== grant.actionBindingId ||
        request.binding.actionBindingVersion !== grant.actionBindingVersion ||
        request.binding.namespace !== grant.namespace ||
        request.binding.toolId !== grant.toolId ||
        request.binding.operation !== grant.operation ||
        request.binding.handlerDigest !== grant.handlerDigest ||
        actionDigest(grant, request.binding) !== grant.actionDigest ||
        request.context.tenant.tenantId !== grant.scope.tenantId ||
        request.context.runId !== grant.scope.runId ||
        request.context.toolId !== grant.toolId ||
        actionInputDigest(request.input) !== grant.inputDigest
      )
        return {
          ok: false,
          error: { code: "agent_governance_binding_mismatch" },
        };
      const quote = await quoteAction({
        grant: structuredClone(grant),
        binding: request.binding,
        input: request.input,
      });
      const current = await authorityResolver.resolve(
        grant.scope,
        grant.actionDigest,
        grant.reservation.reservedAtLogicalMs,
      );
      if (
        current.status !== "current" ||
        current.scopeDigest !== grant.scopeDigest ||
        scopeDigest(current.scope) !== grant.scopeDigest ||
        current.actionDigest !== grant.actionDigest ||
        current.authorityGeneration !== request.permit.authorityGeneration ||
        current.fencingToken !== request.permit.fencingToken ||
        !(await assessmentResolver.consumeCurrent(
          grant,
          grant.reservation.reservedAtLogicalMs,
        ))
      ) {
        return { ok: false, error: { code: "base_action_authority_stale" } };
      }
      const admission = await controller.reserve(governance, {
        effectId: quote.effectId,
        grantId: grant.grantId,
        reservationId: request.permit.reservationId,
        dispatchAttemptId: request.permit.dispatchAttemptId,
        runId: grant.scope.runId,
        downstreamIdempotencyKey: request.permit.idempotencyKey,
        scopeDigest: grant.scopeDigest,
        actionDigest: grant.actionDigest,
        inputDigest: grant.inputDigest,
        toolId: request.binding.toolId,
        operation: request.binding.operation,
        destination: quote.destination,
        charges: quote.charges,
      });
      if (admission.status === "denied")
        return { ok: false, error: { code: admission.code } };
      if (admission.status === "replayed")
        return { ok: false, error: { code: "effect_requires_reconciliation" } };
      // This reservation is the governance/budget linearization point. Later suspension
      // prevents new admission, but cannot retroactively cancel this accepted effect.
      try {
        const result = await dispatch(request);
        await controller.recordOutcome(
          admission.record,
          result.ok ? "succeeded" : "indeterminate",
          `dispatch:${request.permit.dispatchAttemptId}`,
        );
        return result;
      } catch (error) {
        try {
          await controller.recordOutcome(
            admission.record,
            "indeterminate",
            `uncertain:${request.permit.dispatchAttemptId}`,
          );
        } catch {
          /* The durable admission still holds the budget if outcome persistence is unavailable. */
        }
        throw error;
      }
    },
  };
  return new ActionGateway(
    options.ledger,
    options.binding,
    dispatcher,
    options.contextResolver,
    options.authorityResolver,
    options.assessmentResolver,
  );
}
