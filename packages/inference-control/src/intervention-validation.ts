import { canonicalizeControlJsonV1 } from "./canonical.js";
import { sha256Hex } from "./sha256.js";
import {
  assertDigest,
  assertIdentifier,
  assertSafeInteger,
  deepFreeze,
} from "./validation.js";
import {
  HETEROGENEOUS_INFERENCE_INTERVENTION_SCHEMA_VERSION_V1,
  INFERENCE_INTERVENTION_AGENT_CLASSES_V1,
  INFERENCE_INTERVENTION_CAPABILITIES_V1,
  type InferenceInterventionAdapterDescriptorV1,
  type InferenceInterventionCapabilityV1,
  type InferenceInterventionBindingV1,
  type InferenceInterventionPolicyV1,
  type RepresentationInterventionReceiptV1,
  type RepresentationInterventionRequestV1,
  type InferenceInterventionTransformationReceiptV1,
  type InferenceInterventionTransformationRequestV1,
  type InferenceInterventionReconciliationReceiptV1,
  type InferenceInterventionReconciliationRequestV1,
} from "./intervention-contracts.js";

const encoder = new TextEncoder();
export function digestInferenceInterventionV1(
  domain: string,
  value: unknown,
): string {
  return `sha256:${sha256Hex(encoder.encode(`agentplat.inference-intervention/${domain}/v1\0${canonicalizeControlJsonV1(value as never)}`))}`;
}

export function createInferenceInterventionReconciliationRequestV1(
  input: Omit<InferenceInterventionReconciliationRequestV1, "requestDigest">,
): InferenceInterventionReconciliationRequestV1 {
  assertIdentifier(input.stateKey, "stateKey");
  assertIdentifier(input.invocationId, "invocationId");
  for (const key of [
    "bindingDigest",
    "policyDigest",
    "invocationDigest",
    "authorizationDigest",
  ] as const)
    assertDigest(input[key], key);
  if (input.sidecarRequestDigest !== null)
    assertDigest(input.sidecarRequestDigest, "sidecarRequestDigest");
  assertSafeInteger(input.step, "step", 1);
  assertSafeInteger(input.reconciledAtLogicalMs, "reconciledAtLogicalMs");
  if (
    !["inference", "tool", "action"].includes(input.executionDomain) ||
    !["prepared_crash", "sidecar_ambiguous"].includes(input.unresolvedKind) ||
    !["confirmed_not_applied", "confirmed_applied_and_contained"].includes(
      input.resolution,
    )
  )
    throw new TypeError("invalid_reconciliation_request");
  const request = { ...input, schemaVersion: 1 as const };
  return deepFreeze({
    ...request,
    requestDigest: digestInferenceInterventionV1(
      "reconciliation-request",
      request,
    ),
  });
}
export function verifyInferenceInterventionReconciliationReceiptV1(
  request: InferenceInterventionReconciliationRequestV1,
  receipt: InferenceInterventionReconciliationReceiptV1,
  expected: {
    reconcilerId: string;
    reconcilerVersion: number;
    reconcilerImplementationDigest: string;
  },
): void {
  if (
    !receipt ||
    receipt.schemaVersion !== 1 ||
    receipt.requestDigest !== request.requestDigest ||
    receipt.resolution !== request.resolution
  )
    throw new TypeError("reconciliation_receipt_request_mismatch");
  assertIdentifier(receipt.reconcilerId, "reconcilerId");
  assertSafeInteger(receipt.reconcilerVersion, "reconcilerVersion", 1);
  assertDigest(
    receipt.reconcilerImplementationDigest,
    "reconcilerImplementationDigest",
  );
  assertDigest(receipt.receiptDigest, "receiptDigest");
  const { receiptDigest, ...unsigned } = receipt;
  if (
    receiptDigest !==
      digestInferenceInterventionV1("reconciliation-receipt", unsigned) ||
    receipt.reconcilerId !== expected.reconcilerId ||
    receipt.reconcilerVersion !== expected.reconcilerVersion ||
    receipt.reconcilerImplementationDigest !==
      expected.reconcilerImplementationDigest
  )
    throw new TypeError("reconciliation_receipt_binding_mismatch");
}
function uniqueCapabilities(
  value: readonly string[],
): readonly InferenceInterventionCapabilityV1[] {
  const unique = [...new Set(value)].sort();
  if (
    unique.length !== value.length ||
    unique.some(
      (item) =>
        !(INFERENCE_INTERVENTION_CAPABILITIES_V1 as readonly string[]).includes(
          item,
        ),
    )
  )
    throw new TypeError("invalid_closed_capability_set");
  return unique as readonly InferenceInterventionCapabilityV1[];
}
function bps(value: number, label: string): void {
  assertSafeInteger(value, label);
  if (value > 10_000) throw new RangeError(`${label}_must_be_bps`);
}
export function createInferenceInterventionAdapterDescriptorV1(
  input: Omit<InferenceInterventionAdapterDescriptorV1, "descriptorDigest">,
): InferenceInterventionAdapterDescriptorV1 {
  assertIdentifier(input.adapterId, "adapterId");
  assertSafeInteger(input.adapterVersion, "adapterVersion", 1);
  assertDigest(
    input.adapterImplementationDigest,
    "adapterImplementationDigest",
  );
  if (
    !(INFERENCE_INTERVENTION_AGENT_CLASSES_V1 as readonly string[]).includes(
      input.agentClass,
    )
  )
    throw new TypeError("invalid_agent_class");
  const descriptor = {
    ...input,
    schemaVersion: HETEROGENEOUS_INFERENCE_INTERVENTION_SCHEMA_VERSION_V1,
    capabilities: uniqueCapabilities(input.capabilities),
  } as const;
  return deepFreeze({
    ...descriptor,
    descriptorDigest: digestInferenceInterventionV1(
      "adapter-descriptor",
      descriptor,
    ),
  });
}
export function assertInferenceInterventionAdapterDescriptorV1(
  value: InferenceInterventionAdapterDescriptorV1,
): void {
  if (
    Object.keys(value).sort().join("|") !==
    [
      "adapterId",
      "adapterImplementationDigest",
      "adapterVersion",
      "agentClass",
      "capabilities",
      "descriptorDigest",
      "schemaVersion",
    ]
      .sort()
      .join("|")
  )
    throw new TypeError("adapter_descriptor_shape_mismatch");
  const { descriptorDigest, ...unsigned } = value;
  const expected = createInferenceInterventionAdapterDescriptorV1(unsigned);
  if (descriptorDigest !== expected.descriptorDigest)
    throw new TypeError("adapter_descriptor_digest_mismatch");
}
export function createInferenceInterventionBindingV1(
  input: Omit<InferenceInterventionBindingV1, "bindingDigest">,
): InferenceInterventionBindingV1 {
  for (const key of [
    "bindingId",
    "missionId",
    "agentId",
    "sessionId",
    "roleId",
    "modelOrAdapterId",
  ] as const)
    assertIdentifier(input[key], key);
  assertDigest(input.modelOrAdapterDigest, "modelOrAdapterDigest");
  assertDigest(input.authorityDigest, "authorityDigest");
  assertSafeInteger(input.fence, "fence", 1);
  const binding = {
    ...input,
    schemaVersion: HETEROGENEOUS_INFERENCE_INTERVENTION_SCHEMA_VERSION_V1,
  } as const;
  return deepFreeze({
    ...binding,
    bindingDigest: digestInferenceInterventionV1("binding", binding),
  });
}
export function assertInferenceInterventionBindingV1(
  value: InferenceInterventionBindingV1,
): void {
  if (
    Object.keys(value).sort().join("|") !==
    [
      "agentId",
      "authorityDigest",
      "bindingDigest",
      "bindingId",
      "fence",
      "missionId",
      "modelOrAdapterDigest",
      "modelOrAdapterId",
      "roleId",
      "schemaVersion",
      "sessionId",
    ]
      .sort()
      .join("|")
  )
    throw new TypeError("binding_shape_mismatch");
  const { bindingDigest, ...unsigned } = value;
  const expected = createInferenceInterventionBindingV1(unsigned);
  if (bindingDigest !== expected.bindingDigest)
    throw new TypeError("binding_digest_mismatch");
}
export function createInferenceInterventionPolicyV1(
  input: Omit<InferenceInterventionPolicyV1, "policyDigest">,
): InferenceInterventionPolicyV1 {
  assertIdentifier(input.policyId, "policyId");
  assertSafeInteger(input.policyVersion, "policyVersion", 1);
  uniqueCapabilities(input.requiredCapabilities);
  for (const key of [
    "blockRiskBps",
    "interventionRiskBps",
    "maximumUncertaintyBps",
    "minimumRoleCoherenceBps",
  ] as const)
    bps(input.thresholds[key], key);
  if (input.thresholds.interventionRiskBps > input.thresholds.blockRiskBps)
    throw new RangeError("intervention_threshold_exceeds_block_threshold");
  for (const key of [
    "maximumInterventions",
    "maximumRepresentationRequests",
    "cooldownLogicalMs",
    "recoveryClearAssessments",
    "maximumCasAttempts",
  ] as const)
    assertSafeInteger(
      input.budget[key],
      key,
      key === "maximumCasAttempts" ? 1 : 0,
    );
  assertSafeInteger(input.maximumStep, "maximumStep", 1);
  assertSafeInteger(input.maximumWindowTokens, "maximumWindowTokens", 1);
  assertSafeInteger(input.sidecarTimeoutMs, "sidecarTimeoutMs", 1);
  const policy = {
    ...input,
    schemaVersion: HETEROGENEOUS_INFERENCE_INTERVENTION_SCHEMA_VERSION_V1,
    requiredCapabilities: uniqueCapabilities(input.requiredCapabilities),
  } as const;
  return deepFreeze({
    ...policy,
    policyDigest: digestInferenceInterventionV1("policy", policy),
  });
}
export function assertInferenceInterventionPolicyV1(
  value: InferenceInterventionPolicyV1,
): void {
  if (
    Object.keys(value).sort().join("|") !==
    [
      "budget",
      "maximumStep",
      "maximumWindowTokens",
      "policyDigest",
      "policyId",
      "policyVersion",
      "requiredCapabilities",
      "schemaVersion",
      "sidecarTimeoutMs",
      "thresholds",
    ]
      .sort()
      .join("|")
  )
    throw new TypeError("policy_shape_mismatch");
  const { policyDigest, ...unsigned } = value;
  const expected = createInferenceInterventionPolicyV1(unsigned);
  if (policyDigest !== expected.policyDigest)
    throw new TypeError("policy_digest_mismatch");
}
export function createRepresentationInterventionRequestV1(
  input: Omit<RepresentationInterventionRequestV1, "requestDigest">,
): RepresentationInterventionRequestV1 {
  assertIdentifier(input.requestId, "requestId");
  for (const key of ["bindingDigest", "policyDigest", "inputDigest"] as const)
    assertDigest(input[key], key);
  assertSafeInteger(input.step, "step", 1);
  assertSafeInteger(input.requestedAtLogicalMs, "requestedAtLogicalMs");
  const request = {
    ...input,
    schemaVersion: HETEROGENEOUS_INFERENCE_INTERVENTION_SCHEMA_VERSION_V1,
  } as const;
  return deepFreeze({
    ...request,
    requestDigest: digestInferenceInterventionV1(
      "representation-request",
      request,
    ),
  });
}
export function verifyRepresentationInterventionReceiptV1(
  request: RepresentationInterventionRequestV1,
  receipt: RepresentationInterventionReceiptV1,
  expectedSidecar?: {
    sidecarId: string;
    sidecarVersion: number;
    sidecarImplementationDigest: string;
  },
): void {
  if (
    !receipt ||
    receipt.schemaVersion !== 1 ||
    receipt.requestDigest !== request.requestDigest
  )
    throw new TypeError("representation_receipt_request_mismatch");
  assertIdentifier(receipt.sidecarId, "sidecarId");
  assertSafeInteger(receipt.sidecarVersion, "sidecarVersion", 1);
  assertDigest(
    receipt.sidecarImplementationDigest,
    "sidecarImplementationDigest",
  );
  assertDigest(receipt.receiptDigest, "receiptDigest");
  if (!["applied", "not_applied", "rejected"].includes(receipt.result))
    throw new TypeError("invalid_representation_receipt_result");
  const { receiptDigest, ...unsigned } = receipt;
  if (
    receiptDigest !==
    digestInferenceInterventionV1("representation-receipt", unsigned)
  )
    throw new TypeError("representation_receipt_digest_mismatch");
  if (
    expectedSidecar &&
    (receipt.sidecarId !== expectedSidecar.sidecarId ||
      receipt.sidecarVersion !== expectedSidecar.sidecarVersion ||
      receipt.sidecarImplementationDigest !==
        expectedSidecar.sidecarImplementationDigest)
  )
    throw new TypeError("representation_receipt_sidecar_mismatch");
}
export function createInferenceInterventionTransformationRequestV1(
  input: Omit<InferenceInterventionTransformationRequestV1, "requestDigest">,
): InferenceInterventionTransformationRequestV1 {
  for (const key of [
    "bindingDigest",
    "policyDigest",
    "inputDigest",
    "signalDigest",
    "assessmentDigest",
  ] as const)
    assertDigest(input[key], key);
  const request = { ...input, schemaVersion: 1 as const };
  return deepFreeze({
    ...request,
    requestDigest: digestInferenceInterventionV1(
      "transformation-request",
      request,
    ),
  });
}
export function verifyInferenceInterventionTransformationReceiptV1(
  request: InferenceInterventionTransformationRequestV1,
  receipt: InferenceInterventionTransformationReceiptV1,
  expected: {
    transformerId: string;
    transformerVersion: number;
    transformerImplementationDigest: string;
  },
  transformedManifestDigest: string,
): void {
  if (
    !receipt ||
    receipt.schemaVersion !== 1 ||
    receipt.requestDigest !== request.requestDigest
  )
    throw new TypeError("transformation_receipt_request_mismatch");
  assertIdentifier(receipt.transformerId, "transformerId");
  assertSafeInteger(receipt.transformerVersion, "transformerVersion", 1);
  assertDigest(
    receipt.transformerImplementationDigest,
    "transformerImplementationDigest",
  );
  assertDigest(receipt.transformedManifestDigest, "transformedManifestDigest");
  assertDigest(receipt.receiptDigest, "receiptDigest");
  const { receiptDigest, ...unsigned } = receipt;
  if (
    receiptDigest !==
    digestInferenceInterventionV1("transformation-receipt", unsigned)
  )
    throw new TypeError("transformation_receipt_digest_mismatch");
  if (
    receipt.transformerId !== expected.transformerId ||
    receipt.transformerVersion !== expected.transformerVersion ||
    receipt.transformerImplementationDigest !==
      expected.transformerImplementationDigest ||
    receipt.transformedManifestDigest !== transformedManifestDigest
  )
    throw new TypeError("transformation_receipt_binding_mismatch");
}
