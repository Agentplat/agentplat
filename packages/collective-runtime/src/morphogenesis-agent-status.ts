import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";

export interface MorphogenesisAgentStatusReceiptV2 {
  readonly schemaVersion: 2;
  readonly operationId: AgentPlatID;
  readonly agentDigest: PlanningDigestV1;
  readonly previousStatus: "active" | "suspended";
  readonly nextStatus: "suspended" | "active";
  readonly checkpointDigest: PlanningDigestV1;
  readonly authorityFenceDigest: PlanningDigestV1;
  readonly policyDigest: PlanningDigestV1;
  readonly membershipConfigurationDigest: PlanningDigestV1;
  readonly membershipEpoch: number;
  readonly effectReceiptDigest: PlanningDigestV1;
  readonly appliedAtLogicalMs: number;
  readonly statusReceiptDigest: PlanningDigestV1;
}

export interface MorphogenesisAgentStatusPortV2 {
  suspend(input: MorphogenesisAgentStatusChangeInputV2): Promise<MorphogenesisAgentStatusReceiptV2>;
  reconcileSuspend(input: MorphogenesisAgentStatusChangeInputV2): Promise<MorphogenesisAgentStatusReceiptV2 | null>;
  resume(input: MorphogenesisAgentStatusChangeInputV2): Promise<MorphogenesisAgentStatusReceiptV2>;
  reconcileResume(input: MorphogenesisAgentStatusChangeInputV2): Promise<MorphogenesisAgentStatusReceiptV2 | null>;
}

export interface MorphogenesisAgentStatusChangeInputV2 {
  readonly operationId: AgentPlatID;
  readonly agentDigest: PlanningDigestV1;
  readonly checkpointDigest: PlanningDigestV1;
  readonly authorityFenceDigest: PlanningDigestV1;
  readonly policyDigest: PlanningDigestV1;
  readonly logicalTimeMs: number;
  readonly signal?: AbortSignal;
}

export function createMorphogenesisAgentStatusReceiptV2(
  input: Omit<MorphogenesisAgentStatusReceiptV2, "schemaVersion" | "statusReceiptDigest">,
): MorphogenesisAgentStatusReceiptV2 {
  if (
    !(
      (input.previousStatus === "active" && input.nextStatus === "suspended") ||
      (input.previousStatus === "suspended" && input.nextStatus === "active")
    )
  ) throw new TypeError("Morphogenesis agent status transition is invalid");
  const body = Object.freeze({
    schemaVersion: 2 as const,
    operationId: id(input.operationId),
    agentDigest: sha(input.agentDigest),
    previousStatus: input.previousStatus,
    nextStatus: input.nextStatus,
    checkpointDigest: sha(input.checkpointDigest),
    authorityFenceDigest: sha(input.authorityFenceDigest),
    policyDigest: sha(input.policyDigest),
    membershipConfigurationDigest: sha(input.membershipConfigurationDigest),
    membershipEpoch: positive(input.membershipEpoch),
    effectReceiptDigest: sha(input.effectReceiptDigest),
    appliedAtLogicalMs: nonNegative(input.appliedAtLogicalMs),
  });
  return Object.freeze({
    ...body,
    statusReceiptDigest: digest("morphogenesis-agent-status-receipt-v2", body),
  });
}

export function validateMorphogenesisAgentStatusReceiptV2(
  input: MorphogenesisAgentStatusReceiptV2,
): MorphogenesisAgentStatusReceiptV2 {
  const { schemaVersion: _schema, statusReceiptDigest: _digest, ...body } = input;
  const result = createMorphogenesisAgentStatusReceiptV2(body);
  if (input.schemaVersion !== 2 || JSON.stringify(input) !== JSON.stringify(result))
    throw new TypeError("Morphogenesis agent status receipt is invalid");
  return result;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u;
const SHA = /^sha256:[0-9a-f]{64}$/u;
function id(value: unknown): AgentPlatID { if (typeof value !== "string" || !ID.test(value)) throw new TypeError("Morphogenesis status ID is invalid"); return value as AgentPlatID; }
function sha(value: unknown): PlanningDigestV1 { if (typeof value !== "string" || !SHA.test(value)) throw new TypeError("Morphogenesis status digest is invalid"); return value as PlanningDigestV1; }
function positive(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) < 1) throw new TypeError("Morphogenesis status epoch is invalid"); return value as number; }
function nonNegative(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) < 0) throw new TypeError("Morphogenesis status time is invalid"); return value as number; }
function digest(domain: string, value: unknown): PlanningDigestV1 { return digestPlanningJsonV1(domain as never, value as PlanningJson); }
