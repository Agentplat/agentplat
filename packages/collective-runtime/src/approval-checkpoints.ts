import type { PlanningDigestV1 } from "@agentplat/collective-planning";

export const APPROVAL_CHECKPOINT_SCHEMA_VERSION_V1 = 1 as const;

export const APPROVAL_CHECKPOINT_MODES_V1 = Object.freeze([
  "autonomous",
  "notification",
  "deferred",
  "required",
] as const);

export type ApprovalCheckpointModeV1 =
  (typeof APPROVAL_CHECKPOINT_MODES_V1)[number];

export type ApprovalCheckpointActionV1 = "plan" | "execute";

export interface ApprovalCheckpointPolicyV1 {
  readonly schemaVersion: 1;
  readonly mode: ApprovalCheckpointModeV1;
  readonly policyId: string;
  readonly policyDigest: PlanningDigestV1;
  /** Checkpoints at which the policy applies. Empty means both plan and execute. */
  readonly actions?: readonly ApprovalCheckpointActionV1[];
}

export type ApprovalCheckpointStatusV1 = "approved" | "pending" | "denied";

export interface ApprovalCheckpointRequestV1 {
  readonly schemaVersion: 1;
  readonly approvalId: string;
  readonly operationId: string;
  readonly action: ApprovalCheckpointActionV1;
  readonly scopeDigest: PlanningDigestV1;
  readonly policyDigest: PlanningDigestV1;
  readonly requestedAtLogicalMs: number;
  readonly requestDigest: PlanningDigestV1;
}

export interface ApprovalCheckpointDecisionV1 {
  readonly status: ApprovalCheckpointStatusV1;
  readonly approvalId: string;
  readonly decisionDigest?: PlanningDigestV1;
  readonly reasonCode?: string;
}

export interface ApprovalCheckpointPortV1 {
  request(input: ApprovalCheckpointRequestV1):
    | ApprovalCheckpointDecisionV1
    | Promise<ApprovalCheckpointDecisionV1>;
  /** Optional notification sink. Notification mode always remains executable. */
  notify?(input: ApprovalCheckpointRequestV1): void | Promise<void>;
}

export interface ApprovalCheckpointEvaluationV1 {
  readonly status: "approved" | "deferred" | "failed";
  readonly reasonCode: string;
  readonly request: ApprovalCheckpointRequestV1 | null;
}

export function validateApprovalCheckpointPolicyV1(
  input: ApprovalCheckpointPolicyV1,
): ApprovalCheckpointPolicyV1 {
  if (!input || input.schemaVersion !== APPROVAL_CHECKPOINT_SCHEMA_VERSION_V1)
    throw new TypeError("approval checkpoint policy schema is invalid");
  if (!APPROVAL_CHECKPOINT_MODES_V1.includes(input.mode))
    throw new TypeError("approval checkpoint policy mode is invalid");
  if (typeof input.policyId !== "string" || input.policyId.length < 1 || input.policyId.length > 256)
    throw new TypeError("approval checkpoint policy id is invalid");
  if (!/^sha256:[0-9a-f]{64}$/u.test(input.policyDigest))
    throw new TypeError("approval checkpoint policy digest is invalid");
  if (input.actions !== undefined && (!Array.isArray(input.actions) || input.actions.some((action) => action !== "plan" && action !== "execute")))
    throw new TypeError("approval checkpoint policy actions are invalid");
  return Object.freeze({
    ...input,
    ...(input.actions ? { actions: Object.freeze([...input.actions]) } : {}),
  });
}

export function approvalCheckpointAppliesV1(
  policy: ApprovalCheckpointPolicyV1,
  action: ApprovalCheckpointActionV1,
): boolean {
  return !policy.actions || policy.actions.length === 0 || policy.actions.includes(action);
}

export async function evaluateApprovalCheckpointV1(input: {
  readonly policy: ApprovalCheckpointPolicyV1;
  readonly port: ApprovalCheckpointPortV1 | undefined;
  readonly request: ApprovalCheckpointRequestV1;
}): Promise<ApprovalCheckpointEvaluationV1> {
  const { policy, port, request } = input;
  if (!approvalCheckpointAppliesV1(policy, request.action))
    return Object.freeze({ status: "approved", reasonCode: "checkpoint_not_configured", request: null });
  if (policy.mode === "autonomous")
    return Object.freeze({ status: "approved", reasonCode: "autonomous_mode", request: null });
  if (!port)
    return Object.freeze({ status: "deferred", reasonCode: "approval_port_unavailable", request });
  if (policy.mode === "notification") {
    await port.notify?.(request);
    return Object.freeze({ status: "approved", reasonCode: "notification_emitted", request });
  }
  const decision = await port.request(request);
  if (!decision || decision.approvalId !== request.approvalId)
    return Object.freeze({ status: "failed", reasonCode: "approval_decision_invalid", request });
  if (decision.status === "approved")
    return Object.freeze({ status: "approved", reasonCode: decision.reasonCode ?? "approval_granted", request });
  if (decision.status === "denied")
    return Object.freeze({ status: "failed", reasonCode: decision.reasonCode ?? "approval_denied", request });
  return Object.freeze({ status: "deferred", reasonCode: policy.mode === "required" ? "approval_required" : "approval_deferred", request });
}
