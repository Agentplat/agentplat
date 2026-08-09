import {
  CONTEXT_INTEGRITY_SCHEMA_VERSION_V1,
  ContextIntegrityRuntimeV1,
  InMemoryContextIntegrityStoreV1,
  createContextIntegrityFilterBindingV1,
  createContextIntegrityPolicyV1,
  createContextIntegrityReferenceAnalyzerV1,
  type ContextIntegrityPolicyV1,
  type ContextIntegrityRoleProjectionV1,
} from "@agentplat/inference-control/context-integrity";
import {
  createContextIntegrityControlledModelGateV1,
  type ContextIntegrityControlledModelGateV1,
} from "@agentplat/inference-control/context-integrity/model";
import type {
  ContextIntegrityPortableAgentBundleV1,
  ContextIntegrityPortableAgentControlV1,
} from "@agentplat/inference-control/context-integrity/portable-agent";

const implementationDigest =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const filter = createContextIntegrityFilterBindingV1({
  schemaVersion: CONTEXT_INTEGRITY_SCHEMA_VERSION_V1,
  filterId: "filter:types",
  filterVersion: 1,
  filterImplementationDigest: implementationDigest,
});
const policyInput: ContextIntegrityPolicyV1 = {
  schemaVersion: 1,
  policyId: "policy:types",
  policyVersion: 1,
  parentPolicyDigest: null,
  trustedSourceZones: ["local_trusted"],
  allowedFilterBindingDigests: [filter.filterBindingDigest],
  thresholds: {
    cautionRiskBps: 3_000,
    quarantineRiskBps: 7_000,
    denyRiskBps: 9_000,
    maximumUncertaintyBps: 5_000,
    contradictionRiskBps: 7_000,
  },
  minimumCorroborationGroups: 2,
  adverseSignalsToPause: 3,
  recoverySignalsRequired: 2,
  allowEmptyAfterIsolation: false,
  limits: {
    maximumItemsPerRequest: 32,
    maximumRetainedHeads: 64,
    rollingWindowAssessments: 16,
    maximumReasonCodesPerAssessment: 16,
    maximumThreatKindsPerAssessment: 16,
    maximumEvidenceDigestsPerAssessment: 16,
    maximumCorroborationGroupsPerItem: 8,
    maximumSteps: 10_000,
    maximumAssessmentTtlMs: 5_000,
    maximumDecisionTtlMs: 5_000,
    maximumCommitAttempts: 4,
  },
};
const policy = createContextIntegrityPolicyV1(policyInput);
const analyzer = createContextIntegrityReferenceAnalyzerV1({
  analyzerId: "analyzer:types",
  analyzerVersion: 1,
  analyzerImplementationDigest: implementationDigest,
  assessmentTtlMs: 1_000,
});
const controller = new ContextIntegrityRuntimeV1({
  controllerId: "controller:types",
  controllerVersion: 1,
  implementationId: "controller:types:v1",
  policy,
  analyzer,
  store: new InMemoryContextIntegrityStoreV1(policy),
});

const modelGate: ContextIntegrityControlledModelGateV1 =
  createContextIntegrityControlledModelGateV1({
    controller,
    filterId: filter.filterId,
    filterVersion: filter.filterVersion,
    filterImplementationDigest: implementationDigest,
    itemTtlMs: 10_000,
    logicalTimeMs: () => 1,
  });

declare const portableBundle: ContextIntegrityPortableAgentBundleV1;
const portableControl: ContextIntegrityPortableAgentControlV1 =
  portableBundle.control;
declare const projection: ContextIntegrityRoleProjectionV1;

void modelGate;
void portableControl;
void projection;
