import { digestPlanningJsonV1, type PlanningDigestV1, type PlanningJson } from "@agentplat/collective-planning";
import type { MorphogenesisVerticalStateV1 } from "./morphogenesis-integration-vertical.js";
import type { MorphogenesisConstitutionalStateV8 } from "./morphogenesis-constitutional-state.js";
export interface MorphogenesisHardeningTelemetryV1 { readonly schemaVersion: 1;
  readonly verticalStateDigest: PlanningDigestV1; readonly verticalStatus: string;
  readonly completedStages: number; readonly compensatedStages: number;
  readonly pendingStage: string | null; readonly constitutionalStateDigest: PlanningDigestV1 | null;
  readonly constitutionalStatus: string | null; readonly authorityEpoch: number | null;
  readonly observedAtLogicalMs: number; readonly telemetryDigest: PlanningDigestV1 }
export interface MorphogenesisHardeningAlertV1 { readonly schemaVersion: 1;
  readonly kind: "vertical_stalled" | "compensation_active" | "vertical_rolled_back" |
    "constitutional_isolated" | "constitutional_recovery";
  readonly severity: "warning" | "critical"; readonly subjectDigest: PlanningDigestV1;
  readonly reasonCodes: readonly string[]; readonly observedAtLogicalMs: number;
  readonly alertDigest: PlanningDigestV1 }
export function createMorphogenesisHardeningTelemetryV1(input: {
  readonly vertical: MorphogenesisVerticalStateV1;
  readonly constitution?: MorphogenesisConstitutionalStateV8;
  readonly logicalTimeMs: number;
}) { const body = Object.freeze({ schemaVersion: 1 as const,
  verticalStateDigest: input.vertical.stateDigest, verticalStatus: input.vertical.status,
  completedStages: input.vertical.receipts.length,
  compensatedStages: input.vertical.compensationReceipts.length,
  pendingStage: input.vertical.pendingStage,
  constitutionalStateDigest: input.constitution?.stateDigest ?? null,
  constitutionalStatus: input.constitution?.status ?? null,
  authorityEpoch: input.constitution?.authorityEpoch ?? null,
  observedAtLogicalMs: input.logicalTimeMs });
  return Object.freeze({ ...body, telemetryDigest: digest(
    "morphogenesis-hardening-telemetry-v1", body) }); }
export function evaluateMorphogenesisHardeningAlertsV1(input: {
  readonly telemetry: MorphogenesisHardeningTelemetryV1;
  readonly verticalLogicalTimeHighWaterMs: number;
  readonly stallThresholdMs: number;
}) { const values: Omit<MorphogenesisHardeningAlertV1, "schemaVersion" | "alertDigest">[] = [];
  const push = (kind: MorphogenesisHardeningAlertV1["kind"], severity: "warning" | "critical",
    reasonCodes: string[]) => values.push({ kind, severity,
      subjectDigest: input.telemetry.verticalStateDigest, reasonCodes,
      observedAtLogicalMs: input.telemetry.observedAtLogicalMs });
  if (input.telemetry.pendingStage && input.telemetry.observedAtLogicalMs -
      input.verticalLogicalTimeHighWaterMs >= input.stallThresholdMs)
    push("vertical_stalled", "critical", ["pending_stage_exceeded_threshold"]);
  if (input.telemetry.verticalStatus === "compensating")
    push("compensation_active", "warning", ["reverse_compensation_in_progress"]);
  if (input.telemetry.verticalStatus === "rolled_back")
    push("vertical_rolled_back", "critical", ["vertical_terminated_by_rollback"]);
  if (input.telemetry.constitutionalStatus === "isolated")
    push("constitutional_isolated", "critical", ["conflicting_constitutional_branches"]);
  if (input.telemetry.constitutionalStatus === "recovery")
    push("constitutional_recovery", "warning", ["constitutional_recovery_required"]);
  return Object.freeze(values.map((value) => { const body = Object.freeze({
    schemaVersion: 1 as const, ...value }); return Object.freeze({ ...body,
    alertDigest: digest("morphogenesis-hardening-alert-v1", body) }); })); }
function digest(domain: string, value: unknown): PlanningDigestV1 {
  return digestPlanningJsonV1(domain as never, value as PlanningJson); }
