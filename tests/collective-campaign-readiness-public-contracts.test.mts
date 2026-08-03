// Compiled-only public consumer contract for campaign readiness.
import {
  CAMPAIGN_READINESS_CAMPAIGN_OUTCOME_IDS_V1,
  CAMPAIGN_READINESS_RELEASE_OUTCOME_IDS_V1,
  CAMPAIGN_READINESS_REQUIRED_CONTROL_IDS_V1,
  createCampaignCapacityEstimateV1,
  createCampaignReadinessEvidenceReceiptV1,
  createCampaignReadinessPlanV1,
  deriveCampaignReadinessAssessmentV1,
  validateCampaignCapacityEstimateV1,
  validateCampaignReadinessAssessmentV1,
  validateCampaignReadinessEvidenceReceiptV1,
  validateCampaignReadinessPlanV1,
  type CampaignCapacityEstimateV1,
  type CampaignReadinessAssessmentV1,
  type CampaignReadinessControlIdV1,
  type CampaignReadinessEvidenceReceiptV1,
  type CampaignReadinessPlanV1,
  type CampaignReadinessRecommendationV1,
} from "@agentplat/collective-planning/evaluation";

declare const estimateInput: Parameters<
  typeof createCampaignCapacityEstimateV1
>[0];
declare const planInput: Parameters<typeof createCampaignReadinessPlanV1>[0];
declare const receiptInput: Parameters<
  typeof createCampaignReadinessEvidenceReceiptV1
>[0];
declare const estimate: CampaignCapacityEstimateV1;
declare const plan: CampaignReadinessPlanV1;
declare const receipt: CampaignReadinessEvidenceReceiptV1;
declare const assessment: CampaignReadinessAssessmentV1;

const controlId: CampaignReadinessControlIdV1 =
  CAMPAIGN_READINESS_REQUIRED_CONTROL_IDS_V1[0];
const recommendation: CampaignReadinessRecommendationV1 =
  assessment.recommendation;

void CAMPAIGN_READINESS_CAMPAIGN_OUTCOME_IDS_V1;
void CAMPAIGN_READINESS_RELEASE_OUTCOME_IDS_V1;
void estimateInput;
void planInput;
void receiptInput;
void createCampaignCapacityEstimateV1(estimateInput);
void createCampaignReadinessPlanV1(planInput);
void createCampaignReadinessEvidenceReceiptV1(receiptInput);
void deriveCampaignReadinessAssessmentV1({
  schemaVersion: 1,
  plan,
  receipts: [receipt],
});
void validateCampaignCapacityEstimateV1(estimate);
void validateCampaignReadinessPlanV1(plan, estimate);
void validateCampaignReadinessEvidenceReceiptV1(receipt, plan);
void validateCampaignReadinessAssessmentV1(assessment, plan, [receipt]);
void controlId;
void recommendation;

// @ts-expect-error readiness never exposes execution authority.
plan.authorization;
// @ts-expect-error a readiness recommendation is not an execution permit.
assessment.executionAuthorization;
// @ts-expect-error the fixed capacity envelope cannot carry provider pricing.
estimate.providerRateCard;
