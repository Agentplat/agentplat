import type { TrustEligibilityDecisionV1 } from "@agentplat/trust";
import type { SemanticControlDecisionV1 } from "@agentplat/inference-control/semantic-alignment";
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
