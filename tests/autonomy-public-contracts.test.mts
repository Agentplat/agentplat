import {
  AutonomyControllerV1,
  AutonomyValidationErrorV1,
  InMemoryAutonomyStoreV1,
  canonicalizeAutonomyJsonV1,
  createAutonomyEvidenceWindowV1,
  createAutonomyPolicyV1,
  createAutonomyStateV1,
  digestAutonomyJsonV1,
  sha256HexAutonomyV1,
  validateAutonomyDecisionV1,
  validateAutonomyEvidenceWindowV1,
  validateAutonomyPolicyV1,
  validateAutonomyStateV1,
  type AutonomyDecisionDispositionV1,
  type AutonomyDecisionHistoryV1,
  type AutonomyDecisionV1,
  type AutonomyDigestV1,
  type AutonomyEvaluationInputV1,
  type AutonomyEvidenceCursorV1,
  type AutonomyEvidenceWindowInputV1,
  type AutonomyEvidenceWindowV1,
  type AutonomyLevelV1,
  type AutonomyPolicyInputV1,
  type AutonomyPolicyV1,
  type AutonomyStateV1,
  type AutonomyStoreV1,
} from "@agentplat/autonomy";
import {
  createAutonomyGovernedActionGuardV1,
  type AutonomyApprovalEvidencePortV1,
  type AutonomyGovernedActionGuardOptionsV1,
} from "@agentplat/autonomy/actions";
import {
  WorkflowAutonomyEvidenceAdapterV1,
  type WorkflowAutonomyEvidenceInputV1,
} from "@agentplat/autonomy/workflows";

void AutonomyControllerV1;
void AutonomyValidationErrorV1;
void InMemoryAutonomyStoreV1;
void WorkflowAutonomyEvidenceAdapterV1;
void canonicalizeAutonomyJsonV1;
void createAutonomyEvidenceWindowV1;
void createAutonomyGovernedActionGuardV1;
void createAutonomyPolicyV1;
void createAutonomyStateV1;
void digestAutonomyJsonV1;
void sha256HexAutonomyV1;
void validateAutonomyDecisionV1;
void validateAutonomyEvidenceWindowV1;
void validateAutonomyPolicyV1;
void validateAutonomyStateV1;

type PublicTypes =
  | AutonomyApprovalEvidencePortV1
  | AutonomyDecisionDispositionV1
  | AutonomyDecisionHistoryV1
  | AutonomyDecisionV1
  | AutonomyDigestV1
  | AutonomyEvaluationInputV1
  | AutonomyEvidenceCursorV1
  | AutonomyEvidenceWindowInputV1
  | AutonomyEvidenceWindowV1
  | AutonomyGovernedActionGuardOptionsV1
  | AutonomyLevelV1
  | AutonomyPolicyInputV1
  | AutonomyPolicyV1
  | AutonomyStateV1
  | AutonomyStoreV1
  | WorkflowAutonomyEvidenceInputV1;

declare const publicType: PublicTypes;
void publicType;
