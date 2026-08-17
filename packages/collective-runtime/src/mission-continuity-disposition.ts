import { digestPlanningJsonV1, type PlanningDigestV1 } from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";

export type MissionDispositionV1 = "active" | "rollback_pending" | "rolled_back" | "abandonment_pending" | "abandoned";

export interface MissionContinuityDispositionV1 {
  readonly schemaVersion: 1;
  readonly operationId: AgentPlatID;
  readonly missionId: AgentPlatID;
  readonly objectiveId: AgentPlatID;
  readonly disposition: MissionDispositionV1;
  readonly previousDisposition: MissionDispositionV1;
  readonly epoch: number;
  readonly planDigest: PlanningDigestV1;
  readonly checkpointDigest: PlanningDigestV1 | null;
  readonly authorityDigest: PlanningDigestV1;
  readonly evidenceDigest: PlanningDigestV1;
  readonly reasonCode: string;
  readonly logicalTimeMs: number;
  readonly receiptDigest: PlanningDigestV1;
}

export interface MissionRollbackRequestV1 {
  readonly operationId: AgentPlatID;
  readonly missionId: AgentPlatID;
  readonly objectiveId: AgentPlatID;
  readonly epoch: number;
  readonly currentPlanDigest: PlanningDigestV1;
  readonly checkpointDigest: PlanningDigestV1;
  readonly authorityDigest: PlanningDigestV1;
  readonly evidenceDigest: PlanningDigestV1;
  readonly reasonCode: string;
  readonly logicalTimeMs: number;
}

export interface MissionAbandonmentRequestV1 {
  readonly operationId: AgentPlatID;
  readonly missionId: AgentPlatID;
  readonly objectiveId: AgentPlatID;
  readonly epoch: number;
  readonly planDigest: PlanningDigestV1;
  readonly authorityDigest: PlanningDigestV1;
  readonly evidenceDigest: PlanningDigestV1;
  readonly reasonCode: string;
  readonly logicalTimeMs: number;
}

export interface MissionEffectRevocationV1 {
  readonly effectId: AgentPlatID;
  readonly authorityDigest: PlanningDigestV1;
  readonly revokedAtLogicalMs: number;
  readonly revocationDigest: PlanningDigestV1;
}

export interface MissionDispositionPortV1 {
  rollback(input: MissionRollbackRequestV1): Promise<{ readonly restoredCheckpointDigest: PlanningDigestV1; readonly revokedEffects: readonly MissionEffectRevocationV1[] }>;
  abandon(input: MissionAbandonmentRequestV1): Promise<{ readonly revokedEffects: readonly MissionEffectRevocationV1[] }>;
}

export function missionDispositionDigestV1(domain: string, input: unknown): PlanningDigestV1 {
  return digestPlanningJsonV1("collective-planning-snapshot", { domain, input } as never);
}

export function createRollbackReceiptV1(input: MissionRollbackRequestV1, revokedEffects: readonly MissionEffectRevocationV1[]): MissionContinuityDispositionV1 {
  const body = { schemaVersion: 1 as const, operationId: input.operationId, missionId: input.missionId, objectiveId: input.objectiveId, disposition: "rolled_back" as const, previousDisposition: "rollback_pending" as const, epoch: input.epoch + 1, planDigest: input.currentPlanDigest, checkpointDigest: input.checkpointDigest, authorityDigest: input.authorityDigest, evidenceDigest: missionDispositionDigestV1("rollback-evidence", { input, revokedEffects }), reasonCode: input.reasonCode, logicalTimeMs: input.logicalTimeMs };
  return Object.freeze({ ...body, receiptDigest: missionDispositionDigestV1("rollback-receipt", body) });
}

export function createAbandonmentReceiptV1(input: MissionAbandonmentRequestV1, revokedEffects: readonly MissionEffectRevocationV1[]): MissionContinuityDispositionV1 {
  const body = { schemaVersion: 1 as const, operationId: input.operationId, missionId: input.missionId, objectiveId: input.objectiveId, disposition: "abandoned" as const, previousDisposition: "abandonment_pending" as const, epoch: input.epoch + 1, planDigest: input.planDigest, checkpointDigest: null, authorityDigest: input.authorityDigest, evidenceDigest: missionDispositionDigestV1("abandonment-evidence", { input, revokedEffects }), reasonCode: input.reasonCode, logicalTimeMs: input.logicalTimeMs };
  return Object.freeze({ ...body, receiptDigest: missionDispositionDigestV1("abandonment-receipt", body) });
}
