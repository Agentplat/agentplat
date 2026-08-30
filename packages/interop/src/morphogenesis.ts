import type { JsonObject } from "@agentplat/core";
import {
  validateMorphogenesisOperatorOutcomeReceiptV2,
  type MorphogenesisOperatorOutcomeReceiptV2,
} from "@agentplat/collective-runtime/morphogenesis";

import type {
  InteropOperationHandlerV1,
  InteropRequestAdmissionGrantV1,
} from "./index.js";

export interface InteropMorphogenesisRequestV2 extends JsonObject {
  readonly schemaVersion: 2;
  readonly morphogenesisRequestDigest: `sha256:${string}`;
  readonly missionScopeDigest: `sha256:${string}`;
  readonly missionAuthorizationDigest: `sha256:${string}`;
  readonly expectedMorphologyEpoch: number;
}

export interface InteropMorphogenesisExecutionPortV2 {
  enact(input: {
    readonly request: InteropMorphogenesisRequestV2;
    readonly interopRequestDigest: `sha256:${string}`;
    readonly idempotencyKey: string;
    /** Must be revalidated atomically by the effect owner. */
    readonly admissionGrant: InteropRequestAdmissionGrantV1;
    readonly signal: AbortSignal;
  }): Promise<{
    readonly morphogenesisRequestDigest: `sha256:${string}`;
    readonly missionScopeDigest: `sha256:${string}`;
    readonly missionAuthorizationDigest: `sha256:${string}`;
    readonly expectedMorphologyEpoch: number;
    readonly outcome: MorphogenesisOperatorOutcomeReceiptV2;
  }>;
}

/** Content-free, authority-preserving Interop handler for a pre-authorized cycle. */
export class InteropMorphogenesisHandlerV2 implements InteropOperationHandlerV1 {
  readonly operation = "morphogenesis.enact" as const;
  constructor(readonly execution: InteropMorphogenesisExecutionPortV2) {
    if (!execution || typeof execution.enact !== "function")
      throw new TypeError("Interop Morphogenesis execution port is required");
  }

  async handle(input: Parameters<InteropOperationHandlerV1["handle"]>[0]) {
    if (input.request.operation !== this.operation)
      throw new TypeError("Interop Morphogenesis operation is invalid");
    if (!input.admissionGrant ||
        input.admissionGrant.requestDigest !== input.request.requestDigest)
      throw new TypeError("Interop Morphogenesis requires an exact admission grant");
    const request = validateRequest(input.request.payload);
    const result = await this.execution.enact({
      request,
      interopRequestDigest: sha(input.request.requestDigest, "Interop request digest"),
      idempotencyKey: input.request.idempotencyKey,
      admissionGrant: input.admissionGrant,
      signal: input.signal,
    });
    const outcome = validateMorphogenesisOperatorOutcomeReceiptV2(result.outcome);
    if (result.morphogenesisRequestDigest !== request.morphogenesisRequestDigest ||
        result.missionScopeDigest !== request.missionScopeDigest ||
        result.missionAuthorizationDigest !== request.missionAuthorizationDigest ||
        result.expectedMorphologyEpoch !== request.expectedMorphologyEpoch ||
        outcome.resultingMorphologyEpoch !== request.expectedMorphologyEpoch + 1)
      throw new TypeError("Interop Morphogenesis result binding is invalid");
    return Object.freeze({
      status: "completed" as const,
      reasonCode: `morphogenesis_${outcome.disposition}`,
      payload: structuredClone(outcome) as unknown as JsonObject,
    });
  }
}

function validateRequest(value: unknown): InteropMorphogenesisRequestV2 {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Interop Morphogenesis payload is invalid");
  const input = value as unknown as InteropMorphogenesisRequestV2;
  const keys = Object.keys(input).sort();
  if (JSON.stringify(keys) !== JSON.stringify([
    "expectedMorphologyEpoch", "missionAuthorizationDigest", "missionScopeDigest",
    "morphogenesisRequestDigest", "schemaVersion",
  ]) || input.schemaVersion !== 2)
    throw new TypeError("Interop Morphogenesis payload is invalid");
  sha(input.morphogenesisRequestDigest, "Morphogenesis request digest");
  sha(input.missionScopeDigest, "Mission scope digest");
  sha(input.missionAuthorizationDigest, "Mission authorization digest");
  if (!Number.isSafeInteger(input.expectedMorphologyEpoch) || input.expectedMorphologyEpoch < 1)
    throw new TypeError("Interop Morphogenesis epoch is invalid");
  return Object.freeze({ ...input });
}

function sha(value: unknown, label: string): `sha256:${string}` {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value))
    throw new TypeError(`${label} is invalid`);
  return value as `sha256:${string}`;
}
