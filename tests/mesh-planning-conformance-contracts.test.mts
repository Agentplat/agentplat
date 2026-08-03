import {
  PLANNING_CONFORMANCE_CAPABILITIES_V1,
  PLANNING_CONFORMANCE_CASES_V1,
  createPlanningConformanceFixturesV1,
  createPlanningConformanceReportV1,
  runPlanningConformanceV1,
  validatePlanningConformanceAssessmentV1,
  validatePlanningConformanceReportV1,
  type PlanningConformanceAdapterV1,
  type PlanningConformanceCapabilityV1,
  type PlanningConformanceCaseIdV1,
  type PlanningConformanceReportV1,
} from "@agentplat/mesh-conformance/planning";

const capability: PlanningConformanceCapabilityV1 = "planning.reducer";
const caseId: PlanningConformanceCaseIdV1 = "planning.reducer.dependency-cycle";
void capability;
void caseId;
void PLANNING_CONFORMANCE_CAPABILITIES_V1;
void PLANNING_CONFORMANCE_CASES_V1;
void createPlanningConformanceFixturesV1;
void createPlanningConformanceReportV1;
void runPlanningConformanceV1;
void validatePlanningConformanceAssessmentV1;
void validatePlanningConformanceReportV1;
void (undefined as unknown as PlanningConformanceAdapterV1);
void (undefined as unknown as PlanningConformanceReportV1);

// @ts-expect-error Planning capability declarations are closed.
const invalidCapability: PlanningConformanceCapabilityV1 =
  "planning.global-authority";
void invalidCapability;

// @ts-expect-error Planning case identifiers are closed.
const invalidCase: PlanningConformanceCaseIdV1 = "planning.anything";
void invalidCase;
