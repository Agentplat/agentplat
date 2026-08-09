import type { JsonObject, JsonValue } from "@agentplat/core";
import {
  createWebCryptoCognitiveIntegrityV2,
  type CognitiveAgentAdapterContextV2,
  type CognitiveAgentAdapterManifestV2,
  type CognitiveAgentAdapterV2,
  type CognitiveOperationRequestV2,
  type CognitiveOperationResultV2,
  type PortableAgentAdapterV1,
} from "@agentplat/runtime/adapter";

import {
  ReferenceBlackBoxControllerV1,
  ReferenceRepresentationControllerV1,
  digestRepresentationVectorV1,
  type BlackBoxContextItemV1,
  type BlackBoxControlPolicyV1,
  type BlackBoxControlReceiptV1,
  type RepresentationControlPolicyV1,
  type RepresentationControlReceiptV1,
} from "./reference-controllers.js";

export interface ControlledOpaqueInferenceRequestV1 {
  readonly operation: CognitiveOperationRequestV2["operation"];
  readonly input: JsonObject;
  readonly context: readonly BlackBoxContextItemV1[];
  readonly allowedToolNames: readonly string[];
  readonly roleReinforcement: string;
  readonly controlReceipt: BlackBoxControlReceiptV1;
}

export interface ControlledOpaqueInferencePortV1 {
  execute(
    request: ControlledOpaqueInferenceRequestV1,
    context: CognitiveAgentAdapterContextV2,
  ): Promise<{ readonly status: CognitiveOperationResultV2["status"]; readonly output: JsonValue; readonly reasonCode: string }>;
}

export interface ControlledRepresentationInferenceRequestV1 {
  readonly operation: CognitiveOperationRequestV2["operation"];
  readonly input: JsonObject;
  readonly controlledActivation: readonly number[];
  readonly controlReceipt: RepresentationControlReceiptV1;
}

export interface ControlledRepresentationInferencePortV1 {
  execute(
    request: ControlledRepresentationInferenceRequestV1,
    context: CognitiveAgentAdapterContextV2,
  ): Promise<{ readonly status: CognitiveOperationResultV2["status"]; readonly output: JsonValue; readonly reasonCode: string }>;
}

export interface BlackBoxCognitiveOperationPayloadV1 {
  readonly input: JsonObject;
  readonly context: readonly BlackBoxContextItemV1[];
  readonly requestedToolNames: readonly string[];
  readonly memoryQueryDigest: string | null;
}

export interface RepresentationCognitiveOperationPayloadV1 {
  readonly input: JsonObject;
  readonly activation: readonly number[];
  readonly roleVector: readonly number[];
  readonly prohibitedVectors: readonly {
    readonly vectorDigest: string;
    readonly values: readonly number[];
  }[];
}

/** Applies context, memory and tool controls before invoking an opaque engine. */
export class BlackBoxCognitiveAgentAdapterV1 implements CognitiveAgentAdapterV2 {
  readonly manifest: CognitiveAgentAdapterManifestV2;
  readonly portable: PortableAgentAdapterV1;
  readonly #controller: ReferenceBlackBoxControllerV1;
  readonly #engine: ControlledOpaqueInferencePortV1;

  constructor(options: {
    readonly manifest: CognitiveAgentAdapterManifestV2;
    readonly portable: PortableAgentAdapterV1;
    readonly policy: BlackBoxControlPolicyV1;
    readonly engine: ControlledOpaqueInferencePortV1;
  }) {
    if (!options.portable || !options.engine || typeof options.engine.execute !== "function")
      throw new TypeError("black-box cognitive adapter ports are required");
    if (!options.manifest.supportsBlackBoxControl)
      throw new TypeError("black-box cognitive manifest capability is required");
    this.manifest = freeze(options.manifest);
    this.portable = options.portable;
    this.#controller = new ReferenceBlackBoxControllerV1(options.policy);
    this.#engine = options.engine;
  }

  async execute(
    request: CognitiveOperationRequestV2,
    context: CognitiveAgentAdapterContextV2,
  ): Promise<CognitiveOperationResultV2> {
    const payload = blackBoxPayload(request.payload);
    const controlled = this.#controller.control({
      requestId: request.operationId,
      bindingDigest: request.roleBindingDigest,
      step: request.expectedRevision + 1,
      logicalTimeMs: request.logicalTimeMs,
      context: payload.context,
      requestedToolNames: payload.requestedToolNames,
      memoryQueryDigest: payload.memoryQueryDigest,
    });
    if (controlled.receipt.disposition === "abstain")
      return result(request.operationId, "abstained", {
        controlReceipt: controlled.receipt as unknown as JsonValue,
      }, "protected_context_unavailable", "context");
    try {
      const executed = await this.#engine.execute({
        operation: request.operation,
        input: payload.input,
        context: controlled.context,
        allowedToolNames: controlled.allowedToolNames,
        roleReinforcement: controlled.roleReinforcement,
        controlReceipt: controlled.receipt,
      }, context);
      return result(request.operationId, executed.status, {
        value: executed.output,
        controlReceipt: controlled.receipt as unknown as JsonValue,
      }, executed.reasonCode, controlled.receipt.disposition === "modify" ? "context" : null);
    } catch (error) {
      if (context.signal.aborted) throw error;
      return result(request.operationId, "failed", {
        controlReceipt: controlled.receipt as unknown as JsonValue,
      }, "opaque_inference_failed", null);
    }
  }
}

/** Applies activation steering before invoking an embedded representation-aware engine. */
export class RepresentationCognitiveAgentAdapterV1 implements CognitiveAgentAdapterV2 {
  readonly manifest: CognitiveAgentAdapterManifestV2;
  readonly portable: PortableAgentAdapterV1;
  readonly #controller: ReferenceRepresentationControllerV1;
  readonly #engine: ControlledRepresentationInferencePortV1;

  constructor(options: {
    readonly manifest: CognitiveAgentAdapterManifestV2;
    readonly portable: PortableAgentAdapterV1;
    readonly policy: RepresentationControlPolicyV1;
    readonly engine: ControlledRepresentationInferencePortV1;
  }) {
    if (!options.portable || !options.engine || typeof options.engine.execute !== "function")
      throw new TypeError("representation cognitive adapter ports are required");
    if (!options.manifest.supportsRepresentationControl)
      throw new TypeError("representation cognitive manifest capability is required");
    this.manifest = freeze(options.manifest);
    this.portable = options.portable;
    this.#controller = new ReferenceRepresentationControllerV1(options.policy);
    this.#engine = options.engine;
  }

  async execute(
    request: CognitiveOperationRequestV2,
    context: CognitiveAgentAdapterContextV2,
  ): Promise<CognitiveOperationResultV2> {
    const payload = representationPayload(request.payload);
    const controlled = this.#controller.intervene({
      requestId: request.operationId,
      bindingDigest: request.roleBindingDigest,
      roleVectorDigest: digestRepresentationVectorV1(payload.roleVector),
      activationDigest: digestRepresentationVectorV1(payload.activation),
      activation: payload.activation,
      roleVector: payload.roleVector,
      prohibitedVectors: payload.prohibitedVectors,
      step: request.expectedRevision + 1,
      logicalTimeMs: request.logicalTimeMs,
    });
    if (controlled.receipt.result === "rejected")
      return result(request.operationId, "refused", {
        controlReceipt: controlled.receipt as unknown as JsonValue,
      }, controlled.receipt.reasonCode, "representation");
    try {
      const executed = await this.#engine.execute({
        operation: request.operation,
        input: payload.input,
        controlledActivation: controlled.activation,
        controlReceipt: controlled.receipt,
      }, context);
      return result(request.operationId, executed.status, {
        value: executed.output,
        controlReceipt: controlled.receipt as unknown as JsonValue,
      }, executed.reasonCode, controlled.receipt.result === "applied" ? "representation" : null);
    } catch (error) {
      if (context.signal.aborted) throw error;
      return result(request.operationId, "failed", {
        controlReceipt: controlled.receipt as unknown as JsonValue,
      }, "representation_inference_failed", "representation");
    }
  }
}

/**
 * Concrete HTTP client for a local chat-completions endpoint. Credentials stay
 * in the invocation context and are never retained by the adapter.
 */
export class LocalChatCompletionsInferencePortV1 implements ControlledOpaqueInferencePortV1 {
  readonly #endpoint: string;
  readonly #model: string;
  readonly #credentialName: string | null;
  readonly #additionalHeaders: Readonly<Record<string, string>>;
  readonly #maximumResponseBytes: number;

  constructor(options: {
    readonly endpoint: string;
    readonly model: string;
    readonly credentialName?: string;
    readonly additionalHeaders?: Readonly<Record<string, string>>;
    readonly maximumResponseBytes?: number;
  }) {
    const endpoint = new URL(options.endpoint);
    if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:")
      throw new TypeError("local inference endpoint protocol is invalid");
    if (!options.model.trim()) throw new TypeError("local inference model is required");
    this.#endpoint = endpoint.toString();
    this.#model = options.model;
    this.#credentialName = options.credentialName ?? null;
    this.#additionalHeaders = Object.freeze({ ...(options.additionalHeaders ?? {}) });
    this.#maximumResponseBytes = integer(options.maximumResponseBytes ?? 8_388_608, "maximumResponseBytes", 1_024, 67_108_864);
  }

  async execute(
    request: ControlledOpaqueInferenceRequestV1,
    context: CognitiveAgentAdapterContextV2,
  ): Promise<{ readonly status: "completed"; readonly output: JsonValue; readonly reasonCode: string }> {
    const credential = this.#credentialName === null
      ? undefined
      : context.credentials?.[this.#credentialName];
    if (this.#credentialName !== null && !credential)
      throw new Error("local inference credential is unavailable");
    const messages = [
      { role: "system", content: request.roleReinforcement },
      ...request.context.map((item) => ({
        role: item.sourceZone === "provider" || item.sourceZone === "tool" ? "user" : "system",
        content: `[${item.sourceZone}:${item.itemId}] ${item.content}`,
      })),
      { role: "user", content: JSON.stringify(request.input) },
    ];
    const response = await fetch(this.#endpoint, {
      method: "POST",
      signal: context.signal,
      headers: {
        "content-type": "application/json",
        ...this.#additionalHeaders,
        ...(credential ? { authorization: `Bearer ${credential}` } : {}),
      },
      body: JSON.stringify({
        model: this.#model,
        messages,
        allowed_tools: request.allowedToolNames,
      }),
    });
    if (!response.ok) throw new Error(`local inference request failed with status ${response.status}`);
    const encoded = await boundedResponseText(response, this.#maximumResponseBytes);
    const body = JSON.parse(encoded) as unknown;
    const parsed = completionResponse(body);
    return {
      status: "completed",
      output: freeze({
        text: parsed.content,
        model: parsed.model ?? this.#model,
        finishReason: parsed.finishReason,
      }),
      reasonCode: "local_inference_completed",
    };
  }
}

async function result(
  operationId: string,
  status: CognitiveOperationResultV2["status"],
  output: JsonValue,
  reasonCode: string,
  controlSurface: CognitiveOperationResultV2["controlSurface"],
): Promise<CognitiveOperationResultV2> {
  const integrity = createWebCryptoCognitiveIntegrityV2();
  return freeze({
    schemaVersion: 2,
    operationId,
    status,
    output,
    outputDigest: await integrity.digest("cognitive-operation-output-v2", output),
    reasonCode,
    controlSurface,
  });
}

function blackBoxPayload(input: JsonObject): BlackBoxCognitiveOperationPayloadV1 {
  if (!record(input.input) || !Array.isArray(input.context) || !Array.isArray(input.requestedToolNames) ||
      input.requestedToolNames.some((item) => typeof item !== "string") ||
      (input.memoryQueryDigest !== null && typeof input.memoryQueryDigest !== "string"))
    throw new TypeError("black-box cognitive payload is invalid");
  return input as unknown as BlackBoxCognitiveOperationPayloadV1;
}

function representationPayload(input: JsonObject): RepresentationCognitiveOperationPayloadV1 {
  if (!record(input.input) || !numberArray(input.activation) || !numberArray(input.roleVector) ||
      !Array.isArray(input.prohibitedVectors))
    throw new TypeError("representation cognitive payload is invalid");
  return input as unknown as RepresentationCognitiveOperationPayloadV1;
}

function completionResponse(value: unknown): {
  readonly content: string;
  readonly model: string | null;
  readonly finishReason: string | null;
} {
  const body = record(value);
  const choices = body?.choices;
  const choice = Array.isArray(choices) ? record(choices[0]) : null;
  const message = record(choice?.message);
  if (typeof message?.content !== "string")
    throw new TypeError("local inference response content is invalid");
  return {
    content: message.content,
    model: typeof body?.model === "string" ? body.model : null,
    finishReason: typeof choice?.finish_reason === "string" ? choice.finish_reason : null,
  };
}

function numberArray(value: unknown): value is readonly number[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => Number.isFinite(item));
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function integer(value: unknown, label: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum)
    throw new RangeError(`${label} is invalid`);
  return value as number;
}

async function boundedResponseText(response: Response, maximumBytes: number): Promise<string> {
  const declared = response.headers.get("content-length");
  if (declared !== null && Number(declared) > maximumBytes)
    throw new RangeError("local inference response exceeds configured limit");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let output = "";
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    total += chunk.value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel("local inference response limit exceeded");
      throw new RangeError("local inference response exceeds configured limit");
    }
    output += decoder.decode(chunk.value, { stream: true });
  }
  return output + decoder.decode();
}

function freeze<T>(value: T): T {
  const clone = structuredClone(value);
  const visit = (item: unknown): void => {
    if (!item || typeof item !== "object" || Object.isFrozen(item)) return;
    for (const child of Object.values(item as Record<string, unknown>)) visit(child);
    Object.freeze(item);
  };
  visit(clone);
  return clone;
}
