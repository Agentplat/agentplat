import type { JsonValue } from "@agentplat/core";

import type {
  ContextIntegrityPolicyRecordV1,
  ContextIntegrityStateV1,
} from "./context-integrity-contracts.js";
import {
  digestContextIntegrityJsonV1,
  projectContextIntegrityRoleV1,
  validateContextIntegrityStateV1,
} from "./context-integrity-runtime.js";
import type {
  RoleAlignmentCheckpointV1,
  RoleAlignmentSignalV1,
} from "./role-alignment.js";
import {
  assertDigest,
  assertIdentifier,
  assertSafeInteger,
  deepFreeze,
} from "./validation.js";

export interface ContextIntegrityRoleSignalBindingV1 {
  readonly assessmentRequestId: string;
  readonly assessorId: string;
  readonly assessorVersion: number;
  readonly assessorBindingDigest: string;
  readonly tenantId: string;
  readonly sessionId: string;
  readonly agentId: string;
  readonly stepId: string;
  readonly checkpoint: RoleAlignmentCheckpointV1;
  readonly roleAnchorDigest: string;
  readonly roleRevision: number;
  readonly targetDigest: string;
  readonly observedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
}

/**
 * Projects content-free integrity state into an ordinary role-alignment
 * signal. The caller must explicitly bind this factory as its assessor.
 */
export function createContextIntegrityRoleAlignmentSignalV1(input: {
  readonly state: ContextIntegrityStateV1;
  readonly policy: ContextIntegrityPolicyRecordV1;
  readonly binding: ContextIntegrityRoleSignalBindingV1;
}): RoleAlignmentSignalV1 {
  const state = validateContextIntegrityStateV1(input.state, input.policy);
  const projection = projectContextIntegrityRoleV1(state, input.policy);
  const binding = normalizeBinding(input.binding);
  if (
    binding.observedAtLogicalMs < state.logicalTimeHighWaterMs ||
    binding.expiresAtLogicalMs <= binding.observedAtLogicalMs
  )
    fail("context_integrity_role_signal_time_invalid");
  const signalSeed = deepFreeze({
    stateDigest: state.stateDigest,
    projectionDigest: projection.projectionDigest,
    assessmentRequestId: binding.assessmentRequestId,
    targetDigest: binding.targetDigest,
  });
  const signalDigest = digestContextIntegrityJsonV1(
    "projection",
    signalSeed as unknown as JsonValue,
  );
  return deepFreeze({
    schemaVersion: 1,
    signalId: `context-integrity-signal.${signalDigest.slice(7)}`,
    assessmentRequestId: binding.assessmentRequestId,
    assessorId: binding.assessorId,
    assessorVersion: binding.assessorVersion,
    assessorBindingDigest: binding.assessorBindingDigest,
    tenantId: binding.tenantId,
    sessionId: binding.sessionId,
    agentId: binding.agentId,
    stepId: binding.stepId,
    checkpoint: binding.checkpoint,
    roleAnchorDigest: binding.roleAnchorDigest,
    roleRevision: binding.roleRevision,
    targetDigest: binding.targetDigest,
    coherenceBps: projection.coherenceBps,
    uncertaintyBps: projection.uncertaintyBps,
    contextInconsistencyBps: 10_000 - projection.coherenceBps,
    hardViolation:
      projection.roleStatus === "denied" || state.status === "denied",
    reasonCodes: deepFreeze(
      [
        `context_integrity_${state.status}`,
        ...(state.degraded ? ["context_integrity_degraded"] : []),
      ].sort(compare),
    ),
    evidenceReferenceIds: deepFreeze(
      [projection.projectionDigest, state.stateDigest].sort(compare),
    ),
    observedAtLogicalMs: binding.observedAtLogicalMs,
    expiresAtLogicalMs: binding.expiresAtLogicalMs,
  });
}

function normalizeBinding(
  input: ContextIntegrityRoleSignalBindingV1,
): ContextIntegrityRoleSignalBindingV1 {
  if (!input || typeof input !== "object")
    fail("context_integrity_role_signal_binding_required");
  if (
    input.checkpoint !== "pre_step" &&
    input.checkpoint !== "post_output" &&
    input.checkpoint !== "pre_action"
  )
    fail("context_integrity_role_signal_checkpoint_invalid");
  return deepFreeze({
    assessmentRequestId: identifier(
      input.assessmentRequestId,
      "assessmentRequestId",
    ),
    assessorId: identifier(input.assessorId, "assessorId"),
    assessorVersion: positive(input.assessorVersion, "assessorVersion"),
    assessorBindingDigest: digest(
      input.assessorBindingDigest,
      "assessorBindingDigest",
    ),
    tenantId: identifier(input.tenantId, "tenantId"),
    sessionId: identifier(input.sessionId, "sessionId"),
    agentId: identifier(input.agentId, "agentId"),
    stepId: identifier(input.stepId, "stepId"),
    checkpoint: input.checkpoint,
    roleAnchorDigest: digest(input.roleAnchorDigest, "roleAnchorDigest"),
    roleRevision: positive(input.roleRevision, "roleRevision"),
    targetDigest: digest(input.targetDigest, "targetDigest"),
    observedAtLogicalMs: nonNegative(
      input.observedAtLogicalMs,
      "observedAtLogicalMs",
    ),
    expiresAtLogicalMs: positive(
      input.expiresAtLogicalMs,
      "expiresAtLogicalMs",
    ),
  });
}

function identifier(input: unknown, label: string): string {
  assertIdentifier(input, label);
  return input;
}

function digest(input: unknown, label: string): string {
  assertDigest(input, label);
  return input;
}

function positive(input: unknown, label: string): number {
  assertSafeInteger(input, label, 1);
  return input;
}

function nonNegative(input: unknown, label: string): number {
  assertSafeInteger(input, label, 0);
  return input;
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(message: string): never {
  throw new TypeError(message);
}
