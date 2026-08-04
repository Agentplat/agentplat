import type { JsonValue } from "@agentplat/core";
import type {
  PortableAgentControlDecisionV1,
  PortableAgentControlPortV1,
  PortableAgentControlRequestV1,
} from "@agentplat/runtime/adapter";

import {
  assessmentMatchesRequestV1,
  validateInferenceAssessmentV1,
  validateAssessmentRequestV1,
} from "./assessments.js";
import {
  resolveControlBoundaryV1,
  type InferenceControlBoundaryV1,
} from "./boundary.js";
import { digestControlJsonV1 } from "./canonical.js";
import { createPolicyRecordV1 } from "./policy.js";
import { validateControlScopeV1 } from "./scopes.js";
import type {
  AssessmentRequestV1,
  ControlCheckpointV1,
  ControlScopeV1,
  InferenceAssessmentV1,
  ReleaseModeV1,
} from "./types.js";

const identifier = /^[A-Za-z0-9][A-Za-z0-9._:@-]*$/u;
const digest = /^sha256:[0-9a-f]{64}$/u;

/** Caller-owned assessment implementation; it never receives provider credentials. */
export interface PortableAgentInferenceAssessorV1 {
  assess(
    request: AssessmentRequestV1,
  ): Promise<InferenceAssessmentV1> | InferenceAssessmentV1;
}

export interface CreateInferenceControlPortableAgentControlV1 {
  readonly controlId: string;
  readonly controlVersion: number;
  readonly implementationId: string;
  readonly boundary: InferenceControlBoundaryV1;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly capabilityHandleId: string;
  readonly mode: ReleaseModeV1;
  readonly outputRisk: "low" | "moderate" | "high";
  readonly assessor: PortableAgentInferenceAssessorV1;
  /** Must match every policy assessor binding used by this bridge. */
  readonly assessorBindingDigest: string;
  /** Rebuilds current local scope for every checkpoint. */
  readonly scope: (
    request: PortableAgentControlRequestV1,
  ) => ControlScopeV1 | null | Promise<ControlScopeV1 | null>;
  /** Must be positive and cannot exceed the bound policy's assessment TTL. */
  readonly assessmentTtlMs: number;
}

export interface InferenceControlPortableAgentControlV1 extends PortableAgentControlPortV1 {
  readonly binding: Readonly<{
    readonly policyId: string;
    readonly policyVersion: number;
    readonly policyDigest: string;
    readonly capabilityDescriptorDigest: string;
    readonly assessorBindingDigest: string;
    readonly implementationId: string;
  }>;
}

/**
 * Adapts the three observable portable-agent checkpoints to the existing
 * inference-control assessment model. It is deliberately not a provider
 * adapter: provider invocation stays behind the portable runtime's adapter.
 */
export function createInferenceControlPortableAgentControlV1(
  options: CreateInferenceControlPortableAgentControlV1,
): InferenceControlPortableAgentControlV1 {
  assertOptions(options);
  const resolved = resolveControlBoundaryV1(options.boundary, {
    policyId: options.policyId,
    policyVersion: options.policyVersion,
    capabilityHandleId: options.capabilityHandleId,
    expectedMode: options.mode,
    expectedOutputRisk: options.outputRisk,
  });
  const policy = resolved.policy;
  if (options.assessmentTtlMs > policy.maximumAssessmentTtlMs)
    throw new TypeError("portable agent assessment TTL exceeds policy");
  const policyRecord = createPolicyRecordV1(policy);

  return Object.freeze({
    controlId: options.controlId,
    controlVersion: options.controlVersion,
    implementationId: options.implementationId,
    binding: Object.freeze({
      policyId: policy.policyId,
      policyVersion: policy.policyVersion,
      policyDigest: policyRecord.policyDigest,
      capabilityDescriptorDigest: resolved.descriptorDigest,
      assessorBindingDigest: options.assessorBindingDigest,
      implementationId: options.implementationId,
    }),
    async evaluate(input: PortableAgentControlRequestV1) {
      try {
        return await evaluatePortableCheckpoint({
          input,
          options,
          policy,
          policyDigest: policyRecord.policyDigest,
        });
      } catch {
        return deny("inference_control_unavailable");
      }
    },
  });
}

async function evaluatePortableCheckpoint(input: {
  readonly input: PortableAgentControlRequestV1;
  readonly options: CreateInferenceControlPortableAgentControlV1;
  readonly policy: ReturnType<typeof createPolicyRecordV1>["policy"];
  readonly policyDigest: string;
}): Promise<PortableAgentControlDecisionV1> {
  const request = input.input;
  assertPortableRequest(request);
  const mapped = mapCheckpoint(request.checkpoint);
  const assessorBinding = input.policy.assessmentBindings.find(
    (binding) => binding.checkpoint === mapped,
  );
  if (!assessorBinding || !input.policy.checkpoints.includes(mapped))
    return deny("inference_control_checkpoint_unavailable");
  if (
    assessorBinding.assessorBindingDigest !==
    input.options.assessorBindingDigest
  )
    return deny("inference_control_assessor_binding_mismatch");

  const scope = await input.options.scope(request);
  const validatedScope = scope === null ? null : validateControlScopeV1(scope);
  if (
    validatedScope &&
    (validatedScope.tenantId !== request.tenantId ||
      validatedScope.runId !== request.sessionId ||
      validatedScope.agentId !== request.agentId ||
      validatedScope.policyId !== input.policy.policyId ||
      validatedScope.policyVersion !== input.policy.policyVersion)
  )
    return deny("inference_control_scope_mismatch");

  const target = targetFor(request);
  const logicalTimeMs = request.request.logicalTimeMs;
  const assessmentRequest = validateAssessmentRequestV1(
    {
      schemaVersion: 1,
      assessmentRequestId: `portable:${digestControlJsonV1("assessment-target", target)}`,
      requestGeneration: 1,
      runId: request.sessionId,
      tenantId: request.tenantId,
      policyId: input.policy.policyId,
      policyVersion: input.policy.policyVersion,
      checkpoint: mapped,
      assessorId: assessorBinding.assessorId,
      assessorVersion: assessorBinding.assessorVersion,
      targetKind: targetKindFor(mapped),
      targetDigest: digestControlJsonV1("assessment-target", target),
      contextEntryIds: request.request.observations.map(
        (observation) => observation.observationId,
      ),
      zoneDigest: digestControlJsonV1(
        "context",
        request.request.observations.map((observation) => ({
          observationId: observation.observationId,
          sourceZone: observation.sourceZone,
        })) as unknown as JsonValue,
      ),
      provenanceDigest: digestControlJsonV1(
        "provenance",
        request.request.observations.map((observation) => ({
          observationId: observation.observationId,
          sourceId: observation.sourceId,
          provenance: observation.provenance,
        })) as unknown as JsonValue,
      ),
      scope: validatedScope,
      createdAtLogicalMs: logicalTimeMs,
      expiresAtLogicalMs: logicalTimeMs + input.options.assessmentTtlMs,
      status: "pending",
    },
    input.policy.limits,
  );
  const assessment = validateInferenceAssessmentV1(
    await input.options.assessor.assess(assessmentRequest),
    input.policy.limits,
  );
  if (!assessmentMatchesRequestV1(assessmentRequest, assessment, logicalTimeMs))
    return deny("inference_control_assessment_mismatch");
  return assessment.disposition === "allow"
    ? allow(assessment.reasonCodes[0] ?? "inference_control_allowed")
    : assessment.disposition === "abstain" ||
        assessment.disposition === "escalate"
      ? Object.freeze({
          disposition: assessment.disposition,
          reasonCode:
            assessment.reasonCodes[0] ?? "inference_control_not_allowed",
        })
      : deny(assessment.reasonCodes[0] ?? "inference_control_not_allowed");
}

function mapCheckpoint(
  checkpoint: PortableAgentControlRequestV1["checkpoint"],
): ControlCheckpointV1 {
  switch (checkpoint) {
    case "pre_step":
      return "pre_run";
    case "post_output":
      return "post_run";
    case "pre_action":
      return "pre_tool";
  }
}

function targetKindFor(
  checkpoint: ControlCheckpointV1,
): AssessmentRequestV1["targetKind"] {
  switch (checkpoint) {
    case "pre_run":
      return "provider_request";
    case "post_run":
      return "final_output";
    case "pre_tool":
      return "action";
    default:
      throw new TypeError("portable checkpoint mapping is invalid");
  }
}

function targetFor(request: PortableAgentControlRequestV1): JsonValue {
  return {
    schemaVersion: 1,
    checkpoint: request.checkpoint,
    manifest: request.manifest,
    sessionId: request.sessionId,
    tenantId: request.tenantId,
    agentId: request.agentId,
    role: request.role,
    step: request.request,
    output: request.output,
    actionProposal: request.actionProposal,
  } as unknown as JsonValue;
}

function assertPortableRequest(request: PortableAgentControlRequestV1): void {
  if (
    !request ||
    request.schemaVersion !== 1 ||
    !identifier.test(request.sessionId) ||
    !identifier.test(request.tenantId) ||
    !identifier.test(request.agentId) ||
    !Number.isSafeInteger(request.request.logicalTimeMs) ||
    request.request.logicalTimeMs < 0
  )
    throw new TypeError("portable control request is invalid");
}

function assertOptions(
  options: CreateInferenceControlPortableAgentControlV1,
): void {
  if (
    !options ||
    typeof options !== "object" ||
    !identifier.test(options.controlId) ||
    !identifier.test(options.implementationId) ||
    !Number.isSafeInteger(options.controlVersion) ||
    options.controlVersion < 1 ||
    !identifier.test(options.policyId) ||
    !Number.isSafeInteger(options.policyVersion) ||
    options.policyVersion < 1 ||
    !identifier.test(options.capabilityHandleId) ||
    !digest.test(options.assessorBindingDigest) ||
    !options.boundary ||
    !options.assessor ||
    typeof options.assessor.assess !== "function" ||
    typeof options.scope !== "function" ||
    !Number.isSafeInteger(options.assessmentTtlMs) ||
    options.assessmentTtlMs < 1
  )
    throw new TypeError("portable inference control options are invalid");
}

function allow(reasonCode: string): PortableAgentControlDecisionV1 {
  return Object.freeze({ disposition: "allow", reasonCode });
}

function deny(reasonCode: string): PortableAgentControlDecisionV1 {
  return Object.freeze({ disposition: "deny", reasonCode });
}
