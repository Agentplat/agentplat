import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";

import { validateMorphogenesisDecisionBindingV1, type MorphogenesisDecisionBindingV1 } from "./morphogenesis-decision.js";
import type { MorphogenesisPolicyRecordAnyV1, MorphogenesisProposalV1 } from "./morphogenesis-contracts.js";
import {
  validateMorphogenesisCompiledOperatorPlanV2,
  type MorphogenesisCompiledOperatorPlanV2,
} from "./morphogenesis-operator-compiler.js";
import { validateMorphogenesisPolicyAnyV1 } from "./morphogenesis-validation.js";
import { MorphogenesisOperatorExecutionRuntimeV2 } from "./morphogenesis-operator-runtime.js";

export interface MorphogenesisGovernedOperatorAuthorizationV2 {
  readonly schemaVersion: 2;
  readonly authorizationId: AgentPlatID;
  readonly decisionDigest: PlanningDigestV1;
  readonly proposalDigest: PlanningDigestV1;
  readonly planDigest: PlanningDigestV1;
  readonly scopeDigest: PlanningDigestV1;
  readonly morphologyEpoch: number;
  readonly executionAuthorizationDigest: PlanningDigestV1;
  readonly authorityFenceDigest: PlanningDigestV1;
  readonly issuedAtLogicalMs: number;
  readonly validUntilLogicalMs: number;
  readonly authorizationReceiptDigest: PlanningDigestV1;
}

export interface MorphogenesisGovernedOperatorAuthorizationPortV2 {
  authorize(input: {
    readonly decision: MorphogenesisDecisionBindingV1;
    readonly proposal: MorphogenesisProposalV1;
    readonly policy: MorphogenesisPolicyRecordAnyV1;
    readonly plan: MorphogenesisCompiledOperatorPlanV2;
    readonly logicalTimeMs: number;
  }): Promise<MorphogenesisGovernedOperatorAuthorizationV2 | null>;
}

/** The governed entry point; the lower execution runtime remains a journal primitive. */
export class GovernedMorphogenesisOperatorExecutionRuntimeV2 {
  constructor(readonly options: {
    readonly execution: MorphogenesisOperatorExecutionRuntimeV2;
    readonly authorization: MorphogenesisGovernedOperatorAuthorizationPortV2;
  }) {
    if (!options?.execution || !options?.authorization ||
        typeof options.authorization.authorize !== "function")
      fail("governed Morphogenesis operator runtime options are required");
  }

  async initialize(input: {
    readonly stateKey: AgentPlatID;
    readonly plan: MorphogenesisCompiledOperatorPlanV2;
    readonly decision: MorphogenesisDecisionBindingV1;
    readonly proposal: MorphogenesisProposalV1;
    readonly policy: MorphogenesisPolicyRecordAnyV1;
    readonly scopeDigest: PlanningDigestV1;
    readonly expectedMorphologyEpoch: number;
    readonly logicalTimeMs: number;
  }) {
    const decision = validateMorphogenesisDecisionBindingV1(input.decision);
    const policy = validateMorphogenesisPolicyAnyV1(input.policy);
    const operation = input.proposal.operations.find(
      ({ operationDigest }) => operationDigest === input.plan.operationDigest,
    );
    if (!operation || policy.schemaVersion !== 2)
      fail("governed Morphogenesis operator requires policy V2 and an exact proposal operation");
    const plan = validateMorphogenesisCompiledOperatorPlanV2(input.plan, {
      operation,
      policy,
      binding: input.plan.binding,
    });
    if (decision.authorization.disposition !== "approved" ||
        input.proposal.proposalDigest !== decision.candidate.proposalDigest ||
        input.proposal.scopeDigest !== decision.candidate.scopeDigest ||
        input.proposal.expectedCurrentEpoch !== decision.candidate.morphologyEpoch ||
        input.proposal.currentSnapshotDigest !== decision.candidate.currentSnapshotDigest ||
        input.proposal.targetDigest !== decision.candidate.targetDigest ||
        input.proposal.budget.budgetDigest !== decision.candidate.budgetDigest ||
        JSON.stringify(input.proposal.operations.map(({ operationDigest }) => operationDigest).sort()) !==
          JSON.stringify(decision.candidate.operationDigests) ||
        operation.operator !== plan.operator ||
        decision.candidate.scopeDigest !== input.scopeDigest ||
        decision.candidate.morphologyEpoch !== input.expectedMorphologyEpoch ||
        decision.candidate.policyDigest !== plan.policyDigest ||
        policy.policyDigest !== plan.policyDigest ||
        !decision.candidate.operationDigests.includes(plan.operationDigest) ||
        input.logicalTimeMs < decision.decidedAtLogicalMs ||
        input.logicalTimeMs >= decision.authorization.expiresAtLogicalMs ||
        input.logicalTimeMs >= decision.candidate.expiresAtLogicalMs)
      fail("governed Morphogenesis decision does not authorize the operator plan");
    const authorization = await this.options.authorization.authorize({
      decision,
      proposal: input.proposal,
      policy,
      plan,
      logicalTimeMs: input.logicalTimeMs,
    });
    if (!authorization)
      fail("governed Morphogenesis operator authorization was denied");
    const verified = validateMorphogenesisGovernedOperatorAuthorizationV2(authorization);
    if (verified.decisionDigest !== decision.decisionDigest ||
        verified.proposalDigest !== decision.candidate.proposalDigest ||
        verified.planDigest !== plan.planDigest ||
        verified.scopeDigest !== input.scopeDigest ||
        verified.morphologyEpoch !== input.expectedMorphologyEpoch ||
        verified.issuedAtLogicalMs > input.logicalTimeMs ||
        verified.validUntilLogicalMs <= input.logicalTimeMs)
      fail("governed Morphogenesis operator authorization is stale or substituted");
    return this.options.execution.initialize({
      stateKey: input.stateKey,
      plan,
      scopeDigest: input.scopeDigest,
      proposalDigest: decision.candidate.proposalDigest,
      decisionDigest: decision.decisionDigest,
      authorizationDigest: verified.executionAuthorizationDigest,
      authorityFenceDigest: verified.authorityFenceDigest,
      expectedMorphologyEpoch: input.expectedMorphologyEpoch,
      logicalTimeMs: input.logicalTimeMs,
    });
  }
}

export function createMorphogenesisGovernedOperatorAuthorizationV2(
  input: Omit<MorphogenesisGovernedOperatorAuthorizationV2, "schemaVersion" | "authorizationReceiptDigest">,
): MorphogenesisGovernedOperatorAuthorizationV2 {
  const body = Object.freeze({
    schemaVersion: 2 as const,
    authorizationId: id(input.authorizationId),
    decisionDigest: sha(input.decisionDigest),
    proposalDigest: sha(input.proposalDigest),
    planDigest: sha(input.planDigest),
    scopeDigest: sha(input.scopeDigest),
    morphologyEpoch: positive(input.morphologyEpoch),
    executionAuthorizationDigest: sha(input.executionAuthorizationDigest),
    authorityFenceDigest: sha(input.authorityFenceDigest),
    issuedAtLogicalMs: nonNegative(input.issuedAtLogicalMs),
    validUntilLogicalMs: positive(input.validUntilLogicalMs),
  });
  if (body.validUntilLogicalMs <= body.issuedAtLogicalMs)
    fail("governed Morphogenesis operator authorization window is invalid");
  return Object.freeze({
    ...body,
    authorizationReceiptDigest: digest("morphogenesis-governed-operator-authorization-v2", body),
  });
}

export function validateMorphogenesisGovernedOperatorAuthorizationV2(
  input: unknown,
): MorphogenesisGovernedOperatorAuthorizationV2 {
  if (!input || typeof input !== "object" || Array.isArray(input))
    fail("governed Morphogenesis operator authorization is invalid");
  const value = input as MorphogenesisGovernedOperatorAuthorizationV2;
  const { schemaVersion: _schema, authorizationReceiptDigest: _digest, ...body } = value;
  const result = createMorphogenesisGovernedOperatorAuthorizationV2(body);
  if (value.schemaVersion !== 2 || JSON.stringify(value) !== JSON.stringify(result))
    fail("governed Morphogenesis operator authorization is invalid");
  return result;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u;
const SHA = /^sha256:[0-9a-f]{64}$/u;
function id(value: unknown): AgentPlatID { if (typeof value !== "string" || !ID.test(value)) fail("governed Morphogenesis ID is invalid"); return value as AgentPlatID; }
function sha(value: unknown): PlanningDigestV1 { if (typeof value !== "string" || !SHA.test(value)) fail("governed Morphogenesis digest is invalid"); return value as PlanningDigestV1; }
function positive(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) < 1) fail("governed Morphogenesis positive integer is invalid"); return value as number; }
function nonNegative(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) < 0) fail("governed Morphogenesis time is invalid"); return value as number; }
function digest(domain: string, value: unknown): PlanningDigestV1 { return digestPlanningJsonV1(domain as never, value as PlanningJson); }
function fail(message: string): never { throw new TypeError(message); }
