import type { TrustEligibilityDecisionV1 } from "@agentplat/trust";
import type { SemanticControlDecisionV1 } from "@agentplat/inference-control/semantic-alignment";
import type { CollectiveDecisionV1 } from "@agentplat/collective-runtime/collective-decision";
import type { CollectiveMembershipConfigurationV1 } from "@agentplat/collective-membership";
import type { CollectiveInvariantReceiptV1 } from "@agentplat/collective-runtime/collective-invariants";
import {
  createMorphogenesisConstitutionalGateAssessmentV8,
  type MorphogenesisConstitutionalGatePortV8,
  type MorphogenesisConstitutionalAmendmentV8,
  type MorphogenesisConstitutionalAuthorizationV8,
} from "@agentplat/collective-runtime/morphogenesis";
interface Binding<T> {
  readonly decision: T;
  readonly sourceId: string;
  readonly sourceImplementationDigest: `sha256:${string}`;
  readonly policyDigest: `sha256:${string}`;
  readonly evidenceDigests: readonly `sha256:${string}`[];
  readonly expiresAtLogicalMs: number;
}
type Input = {
  readonly amendment: MorphogenesisConstitutionalAmendmentV8;
  readonly authorization: MorphogenesisConstitutionalAuthorizationV8;
  readonly logicalTimeMs: number;
};
export function createMorphogenesisConstitutionalTrustGateAdapterV8(input: {
  readonly evaluate: (
    value: Input,
  ) => Promise<Binding<TrustEligibilityDecisionV1>>;
}): MorphogenesisConstitutionalGatePortV8 {
  return Object.freeze({
    source: "trust" as const,
    async assess(value: Input) {
      const e = await input.evaluate(value),
        d = e.decision;
      if (
        d.subjectDigest !== value.amendment.amendmentDigest ||
        d.scopeDigest !==
          value.amendment.successorConstitution.constitutionDigest ||
        d.policyDigest !== e.policyDigest
      )
        throw new TypeError("constitutional Trust binding invalid");
      return createMorphogenesisConstitutionalGateAssessmentV8({
        source: "trust",
        amendmentDigest: value.amendment.amendmentDigest,
        authorizationDigest: value.authorization.authorizationDigest,
        disposition:
          d.disposition === "eligible"
            ? "eligible"
            : d.disposition === "restricted"
              ? "restricted"
              : d.disposition === "quarantined"
                ? "denied"
                : "unavailable",
        policyDigest: e.policyDigest,
        sourceId: e.sourceId,
        sourceImplementationDigest: e.sourceImplementationDigest,
        evidenceDigests: e.evidenceDigests,
        observedAtLogicalMs: d.evaluatedAtLogicalMs,
        expiresAtLogicalMs: e.expiresAtLogicalMs,
      });
    },
  });
}
export function createMorphogenesisConstitutionalInferenceControlGateAdapterV8(input: {
  readonly evaluate: (
    value: Input,
  ) => Promise<Binding<SemanticControlDecisionV1>>;
}): MorphogenesisConstitutionalGatePortV8 {
  return Object.freeze({
    source: "inference_control" as const,
    async assess(value: Input) {
      const e = await input.evaluate(value),
        d = e.decision;
      if (
        d.requestDigest !== value.amendment.amendmentDigest ||
        d.decisionDigest !== e.evidenceDigests[0]
      )
        throw new TypeError("constitutional Inference Control binding invalid");
      return createMorphogenesisConstitutionalGateAssessmentV8({
        source: "inference_control",
        amendmentDigest: value.amendment.amendmentDigest,
        authorizationDigest: value.authorization.authorizationDigest,
        disposition:
          d.proceed && d.interventionAllowed !== false ? "eligible" : "denied",
        policyDigest: e.policyDigest,
        sourceId: e.sourceId,
        sourceImplementationDigest: e.sourceImplementationDigest,
        evidenceDigests: e.evidenceDigests,
        observedAtLogicalMs: value.logicalTimeMs,
        expiresAtLogicalMs: e.expiresAtLogicalMs,
      });
    },
  });
}
export function createMorphogenesisConstitutionalCollectiveDecisionGateAdapterV8(input: {
  readonly evaluate: (value: Input) => Promise<Binding<CollectiveDecisionV1>>;
}): MorphogenesisConstitutionalGatePortV8 {
  return Object.freeze({
    source: "collective_decision" as const,
    async assess(value: Input) {
      const e = await input.evaluate(value),
        d = e.decision;
      if (
        d.candidate.candidateDigest !== value.amendment.amendmentDigest ||
        d.candidate.scope.scopeDigest !==
          value.amendment.successorConstitution.constitutionDigest ||
        d.certificate.candidateDigest !== value.amendment.amendmentDigest ||
        d.expiresAtLogicalMs !== e.expiresAtLogicalMs
      )
        throw new TypeError(
          "constitutional Collective Decision binding invalid",
        );
      return createMorphogenesisConstitutionalGateAssessmentV8({
        source: "collective_decision",
        amendmentDigest: value.amendment.amendmentDigest,
        authorizationDigest: value.authorization.authorizationDigest,
        disposition: "eligible",
        policyDigest: d.policyDigest as `sha256:${string}`,
        sourceId: e.sourceId,
        sourceImplementationDigest: e.sourceImplementationDigest,
        evidenceDigests: [
          d.decisionDigest,
          ...e.evidenceDigests,
        ] as `sha256:${string}`[],
        observedAtLogicalMs: d.acceptedAtLogicalMs,
        expiresAtLogicalMs: d.expiresAtLogicalMs,
      });
    },
  });
}
export function createMorphogenesisConstitutionalMembershipGateAdapterV8(input: {
  readonly meshId: string;
  readonly policyDomainId: string;
  readonly evaluate: (
    value: Input,
  ) => Promise<Binding<CollectiveMembershipConfigurationV1>>;
}): MorphogenesisConstitutionalGatePortV8 {
  return Object.freeze({
    source: "membership" as const,
    async assess(value: Input) {
      const e = await input.evaluate(value),
        c = e.decision;
      if (
        c.tenantId !== value.amendment.successorConstitution.tenantId ||
        c.meshId !== input.meshId ||
        c.policyDomainId !== input.policyDomainId ||
        c.effectiveAtLogicalMs > value.logicalTimeMs ||
        c.configurationDigest !== e.evidenceDigests[0]
      )
        throw new TypeError("constitutional Membership binding invalid");
      return createMorphogenesisConstitutionalGateAssessmentV8({
        source: "membership",
        amendmentDigest: value.amendment.amendmentDigest,
        authorizationDigest: value.authorization.authorizationDigest,
        disposition: "eligible",
        policyDigest: e.policyDigest,
        sourceId: e.sourceId,
        sourceImplementationDigest: e.sourceImplementationDigest,
        evidenceDigests: e.evidenceDigests,
        observedAtLogicalMs: value.logicalTimeMs,
        expiresAtLogicalMs: e.expiresAtLogicalMs,
      });
    },
  });
}
export function createMorphogenesisConstitutionalEvidenceBoundaryGateAdapterV8(input: {
  readonly evaluate: (
    value: Input,
  ) => Promise<Binding<CollectiveInvariantReceiptV1>>;
}): MorphogenesisConstitutionalGatePortV8 {
  return Object.freeze({
    source: "evidence_boundary" as const,
    async assess(value: Input) {
      const e = await input.evaluate(value),
        r = e.decision;
      if (
        r.scopeId !==
          value.amendment.successorConstitution.constitutionDigest ||
        !["lineage_attenuation", "monotonic_coordinates"].includes(
          r.invariant,
        ) ||
        r.receiptDigest !== e.evidenceDigests[0]
      )
        throw new TypeError("constitutional Evidence Boundary binding invalid");
      return createMorphogenesisConstitutionalGateAssessmentV8({
        source: "evidence_boundary",
        amendmentDigest: value.amendment.amendmentDigest,
        authorizationDigest: value.authorization.authorizationDigest,
        disposition: r.disposition === "allow" ? "eligible" : "denied",
        policyDigest: e.policyDigest,
        sourceId: e.sourceId,
        sourceImplementationDigest: e.sourceImplementationDigest,
        evidenceDigests: e.evidenceDigests,
        observedAtLogicalMs: r.evaluatedAtLogicalMs,
        expiresAtLogicalMs: e.expiresAtLogicalMs,
      });
    },
  });
}
