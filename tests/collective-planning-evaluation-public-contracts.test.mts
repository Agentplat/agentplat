import {
  COLLECTIVE_ENVIRONMENT_PORT_VERSION_V1,
  COLLECTIVE_INTERACTION_ACCOUNTING_VERSION_V2,
  COLLECTIVE_INVARIANT_MONITOR_PORT_VERSION_V1,
  COLLECTIVE_TRACE_SCHEMA_VERSION_V2,
  DEFAULT_COLLECTIVE_EVALUATION_LIMITS_V1,
  assertCollectiveEnvironmentPortV1,
  assertCollectiveTraceSuccessionV2,
  auditCollectiveEnvironmentPortV1,
  collectiveHiddenCanaryDigestV1,
  collectiveTraceAccountingV2,
  createCollectiveEnvironmentAdvanceRequestV1,
  createCollectiveEnvironmentInitializationV1,
  createCollectiveEnvironmentObservationRequestV1,
  createCollectiveEnvironmentSnapshotHandleV1,
  createCollectiveEvaluationBoundaryEvidenceV1,
  createCollectiveEvaluationRegistrationBindingV1,
  createCollectiveInvariantMonitorEventV1,
  createCollectiveInvariantMonitorPolicyV1,
  createCollectiveInvariantMonitorV1,
  createCollectiveProtectedEffectAttemptV1,
  createCollectiveTraceEventV2,
  createCollectiveTraceV2,
  replayCollectiveInteractionLedgerV2,
  replayCollectiveInvariantMonitorV1,
  scanCollectivePublicArtifactForCanaryV1,
  validateCollectiveEvaluationBoundaryEvidenceV1,
  validateCollectiveTraceV2,
  type CollectiveEnvironmentEffectPortV1,
  type CollectiveEnvironmentLifecyclePortV1,
  type CollectiveEnvironmentLogicalTimePortV1,
  type CollectiveEnvironmentObservationPortV1,
  type CollectiveEnvironmentPortV1,
  type CollectiveEnvironmentSnapshotPortV1,
  type CollectiveEvaluationBoundaryEvidenceV1,
  type CollectiveEvaluationRegistrationBindingV1,
  type CollectiveInteractionLedgerV2,
  type CollectiveInvariantMonitorV1,
  type CollectiveInvariantMonitorVerdictV1,
  type CollectiveTraceEventV2,
  type CollectiveTraceV2,
} from "@agentplat/collective-planning/evaluation";

declare const environment: CollectiveEnvironmentPortV1;
declare const monitor: CollectiveInvariantMonitorV1;
declare const registration: CollectiveEvaluationRegistrationBindingV1;
declare const traceEvent: CollectiveTraceEventV2;
declare const trace: CollectiveTraceV2;
declare const ledger: CollectiveInteractionLedgerV2;
declare const verdict: CollectiveInvariantMonitorVerdictV1;
declare const evidence: CollectiveEvaluationBoundaryEvidenceV1;

const environmentVersion: typeof COLLECTIVE_ENVIRONMENT_PORT_VERSION_V1 = 1;
const traceVersion: typeof COLLECTIVE_TRACE_SCHEMA_VERSION_V2 = 2;
const monitorVersion: typeof COLLECTIVE_INVARIANT_MONITOR_PORT_VERSION_V1 = 1;
const accountingVersion: typeof COLLECTIVE_INTERACTION_ACCOUNTING_VERSION_V2 =
  "interaction-accounting-v2";

void DEFAULT_COLLECTIVE_EVALUATION_LIMITS_V1;
void assertCollectiveEnvironmentPortV1;
void assertCollectiveTraceSuccessionV2;
void auditCollectiveEnvironmentPortV1;
void collectiveHiddenCanaryDigestV1;
void collectiveTraceAccountingV2;
void createCollectiveEnvironmentAdvanceRequestV1;
void createCollectiveEnvironmentInitializationV1;
void createCollectiveEnvironmentObservationRequestV1;
void createCollectiveEnvironmentSnapshotHandleV1;
void createCollectiveEvaluationBoundaryEvidenceV1;
void createCollectiveEvaluationRegistrationBindingV1;
void createCollectiveInvariantMonitorEventV1;
void createCollectiveInvariantMonitorPolicyV1;
void createCollectiveInvariantMonitorV1;
void createCollectiveProtectedEffectAttemptV1;
void createCollectiveTraceEventV2;
void createCollectiveTraceV2;
void replayCollectiveInteractionLedgerV2;
void replayCollectiveInvariantMonitorV1;
void scanCollectivePublicArtifactForCanaryV1;
void validateCollectiveEvaluationBoundaryEvidenceV1;
void validateCollectiveTraceV2;
void environment;
void monitor;
void registration;
void traceEvent;
void trace;
void ledger;
void verdict;
void evidence;
void environmentVersion;
void traceVersion;
void monitorVersion;
void accountingVersion;
void (null as CollectiveEnvironmentEffectPortV1 | null);
void (null as CollectiveEnvironmentLifecyclePortV1 | null);
void (null as CollectiveEnvironmentLogicalTimePortV1 | null);
void (null as CollectiveEnvironmentObservationPortV1 | null);
void (null as CollectiveEnvironmentSnapshotPortV1 | null);

// @ts-expect-error the runner-visible port cannot access the invariant monitor.
environment.monitor;
// @ts-expect-error the runner-visible port cannot enumerate hidden world state.
environment.hiddenState;
// @ts-expect-error the runner-visible port cannot query global membership.
environment.globalMembership;
// @ts-expect-error trace events expose canonical accounting, never mutable counters.
traceEvent.accountingUnits = 7;
// @ts-expect-error the ledger is replay output and is immutable.
ledger.total = 99;
// @ts-expect-error the monitor verdict cannot be supplied through the environment port.
environment.setVerdict(verdict);
