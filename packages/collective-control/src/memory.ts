import type {
  CollectiveDigestV1,
  DelegationMandateV1,
  DelegationProofVerificationV1,
  DelegationRevocationV1,
} from "./contracts.js";
import {
  acceptDelegationMandateV1,
  acceptDelegationRevocationV1,
  authorizeDelegationMandateAtV1,
  createCollectiveAuthorityStateV1,
  validateCollectiveAuthorityStateV1,
  type CollectiveAuthorityDecisionV1,
  type CollectiveAuthorityStateV1,
  type MandateAuthorizationDecisionV1,
} from "./state.js";
import {
  createCollectiveExecutionStateV1,
  issueGovernedActionPermitV1,
  registerWorkContractV1,
  transitionGovernedActionPermitV1,
  transitionWorkContractV1,
  validateCollectiveExecutionStateV1,
  type CollectiveExecutionDecisionV1,
  type CollectiveExecutionStateV1,
} from "./lifecycle.js";
import type {
  BudgetReservationV1,
  GovernedActionPermitStatusV1,
  GovernedActionPermitV1,
  WorkContractStatusV1,
  WorkContractV1,
} from "./contracts.js";

/** Bounded single-process reference repository; it makes no durability claim. */
export class MemoryCollectiveAuthorityRepositoryV1 {
  private current: CollectiveAuthorityStateV1;

  constructor(
    input:
      | {
          readonly tenantId: string;
          readonly policyDomainId: string;
        }
      | CollectiveAuthorityStateV1,
  ) {
    this.current =
      "schemaVersion" in input
        ? validateCollectiveAuthorityStateV1(input)
        : createCollectiveAuthorityStateV1(input);
  }

  snapshot(): CollectiveAuthorityStateV1 {
    return this.current;
  }

  acceptMandate(input: {
    readonly mandate: DelegationMandateV1;
    readonly verification: DelegationProofVerificationV1;
    readonly acceptedAtLogicalMs: number;
  }): CollectiveAuthorityDecisionV1 {
    const decision = acceptDelegationMandateV1(this.current, input);
    this.current = decision.state;
    return decision;
  }

  acceptRevocation(input: {
    readonly revocation: DelegationRevocationV1;
    readonly verification: DelegationProofVerificationV1;
    readonly acceptedAtLogicalMs: number;
  }): CollectiveAuthorityDecisionV1 {
    const decision = acceptDelegationRevocationV1(this.current, input);
    this.current = decision.state;
    return decision;
  }

  authorize(input: {
    readonly mandateId: string;
    readonly mandateDigest: CollectiveDigestV1;
    readonly at: string;
  }): MandateAuthorizationDecisionV1 {
    return authorizeDelegationMandateAtV1(this.current, input);
  }
}

/** Bounded single-process execution ledger; every accepted update is immutable. */
export class MemoryCollectiveExecutionRepositoryV1 {
  private current: CollectiveExecutionStateV1;

  constructor(
    input:
      | { readonly tenantId: string; readonly policyDomainId: string }
      | CollectiveExecutionStateV1,
  ) {
    this.current =
      "schemaVersion" in input
        ? validateCollectiveExecutionStateV1(input)
        : createCollectiveExecutionStateV1(input);
  }

  snapshot(): CollectiveExecutionStateV1 {
    return this.current;
  }

  registerWork(input: {
    readonly mandate: DelegationMandateV1;
    readonly workContract: WorkContractV1;
    readonly authorizedAt: string;
    readonly acceptedAtLogicalMs: number;
  }): CollectiveExecutionDecisionV1 {
    return this.apply(registerWorkContractV1(this.current, input));
  }

  transitionWork(input: {
    readonly workContractId: string;
    readonly expectedGeneration: number;
    readonly expectedDigest: CollectiveDigestV1;
    readonly nextStatus: WorkContractStatusV1;
    readonly terminalReasonCode: string | null;
    readonly logicalTimeMs: number;
  }): CollectiveExecutionDecisionV1 {
    return this.apply(transitionWorkContractV1(this.current, input));
  }

  issuePermit(input: {
    readonly mandate: DelegationMandateV1;
    readonly budgetReservation: BudgetReservationV1;
    readonly actionPermit: GovernedActionPermitV1;
    readonly authorizedAt: string;
    readonly acceptedAtLogicalMs: number;
  }): CollectiveExecutionDecisionV1 {
    return this.apply(issueGovernedActionPermitV1(this.current, input));
  }

  transitionPermit(input: {
    readonly permitId: string;
    readonly expectedGeneration: number;
    readonly expectedDigest: CollectiveDigestV1;
    readonly nextStatus: GovernedActionPermitStatusV1;
    readonly outcomeId: string | null;
    readonly logicalTimeMs: number;
  }): CollectiveExecutionDecisionV1 {
    return this.apply(transitionGovernedActionPermitV1(this.current, input));
  }

  private apply(
    decision: CollectiveExecutionDecisionV1,
  ): CollectiveExecutionDecisionV1 {
    this.current = decision.state;
    return decision;
  }
}
