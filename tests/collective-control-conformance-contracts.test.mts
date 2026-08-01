import {
  CONTROL_CONFORMANCE_CASES_V1,
  createControlConformanceReportV1,
  runControlConformanceV1,
  validateControlConformanceReportV1,
  type ControlConformanceAdapterV1,
  type ControlConformanceCaseIdV1,
  type ControlConformanceCapability,
  type ControlConformanceReportV1,
} from "@agentplat/mesh-conformance/control";

const caseId: ControlConformanceCaseIdV1 =
  "control.grant.substitution_conflict";
const capability: ControlConformanceCapability = "control.persistence";

void caseId;
void capability;
void CONTROL_CONFORMANCE_CASES_V1;
void runControlConformanceV1;
void createControlConformanceReportV1;
void validateControlConformanceReportV1;
void (undefined as unknown as ControlConformanceAdapterV1);
void (undefined as unknown as ControlConformanceReportV1);

// @ts-expect-error Control case IDs are a closed union.
const invalidCase: ControlConformanceCaseIdV1 = "control.unknown";
void invalidCase;

// @ts-expect-error Control capabilities are a closed union.
const invalidCapability: ControlConformanceCapability = "control.cloud";
void invalidCapability;
