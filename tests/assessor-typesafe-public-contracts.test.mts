import {
  TypeSafeAssessorV1,
  TypeSafeDecisionClientV1,
  type TypeSafeAssessmentEvidenceV1,
  type TypeSafeAssessorOptionsV1,
  type TypeSafeDecisionRequestV1,
} from "@agentplat/assessor-typesafe";

void TypeSafeAssessorV1;
void TypeSafeDecisionClientV1;

declare const evidence: TypeSafeAssessmentEvidenceV1;
void evidence.targetDigest;
void evidence.resolvedModel;
void evidence.spendReservedUsd;

const request: TypeSafeDecisionRequestV1<{
  readonly eligibility: {
    readonly type: "choice";
    readonly instructions: string;
    readonly criteria: { readonly allow: null; readonly escalate: null };
  };
}> = {
  state: { artifactVersion: 2, content: "proposal body" },
  questions: {
    eligibility: {
      type: "choice",
      instructions: "Choose the review route.",
      criteria: { allow: null, escalate: null },
    },
  },
};
void request;

const assessorOptions: TypeSafeAssessorOptionsV1<{
  readonly eligibility: {
    readonly type: "choice";
    readonly instructions: string;
    readonly criteria: { readonly allow: null; readonly escalate: null };
  };
}> = {
  assessorId: "proposal-review",
  assessorVersion: 1,
  assessorBindingDigest: `sha256:${"a".repeat(64)}`,
  apiKey: "test-key",
  model: "jev-pinned-version",
  timeoutMs: 1_000,
  buildRequest: (assessment) => ({
    state: { content: assessment.content, targetDigest: assessment.targetDigest },
    questions: request.questions,
  }),
  mapResult: (result) => ({
    disposition:
      result.answers.eligibility.choice === "allow" ? "allow" : "escalate",
    reasonCode: "proposal_review",
  }),
};
void assessorOptions;
