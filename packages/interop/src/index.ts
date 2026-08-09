import type { JsonObject, JsonValue } from "@agentplat/core";
import type {
  PortableAgentAdapterCheckpointExportInputV1,
  PortableAgentAdapterCheckpointExportResultV1,
  PortableAgentAdapterCheckpointImportInputV1,
  PortableAgentAdapterCheckpointInputV1,
  PortableAgentAdapterContextV1,
  PortableAgentAdapterRestoreInputV1,
  PortableAgentAdapterStepInputV1,
  PortableAgentAdapterV1,
  PortableAgentCheckpointV1,
  PortableAgentStepResultV1,
} from "@agentplat/runtime/adapter";

export * from "./webcrypto.js";

export const AGENTPLAT_INTEROP_PROTOCOL_V1 = "agentplat-interop/1" as const;

const interopDigestCryptoInvokersV1 = new WeakMap<
  object,
  SubtleCrypto["digest"]
>();

export type InteropOperationV1 =
  | "agent.step"
  | "agent.checkpoint"
  | "agent.restore"
  | "agent.checkpoint.export"
  | "agent.checkpoint.import"
  | "environment.reset"
  | "environment.observe"
  | "environment.act"
  | "environment.snapshot"
  | "environment.restore"
  | "environment.close";

export interface InteropEndpointManifestV1 {
  readonly schemaVersion: 1;
  readonly protocol: typeof AGENTPLAT_INTEROP_PROTOCOL_V1;
  readonly endpointId: string;
  readonly endpointVersion: string;
  readonly implementationId: string;
  readonly endpointKind: "agent" | "environment" | "hybrid";
  readonly operations: readonly InteropOperationV1[];
  readonly inputSchemaDigest: string;
  readonly outputSchemaDigest: string;
  readonly supportsCancellation: boolean;
  readonly supportsDeterministicReplay: boolean;
  readonly supportsCheckpoint: boolean;
  readonly requiresRequestSignature: boolean;
  readonly signsResponses: boolean;
  readonly maximumRequestBytes: number;
  readonly maximumResponseBytes: number;
  readonly maximumStepsPerSession: number;
  readonly manifestDigest: string;
}

export interface InteropRequestEnvelopeV1 {
  readonly schemaVersion: 1;
  readonly protocol: typeof AGENTPLAT_INTEROP_PROTOCOL_V1;
  readonly requestId: string;
  readonly idempotencyKey: string;
  readonly issuerId: string;
  readonly endpointId: string;
  readonly sessionId: string;
  readonly operation: InteropOperationV1;
  readonly sequence: number;
  readonly logicalTimeMs: number;
  readonly deadlineLogicalMs: number;
  readonly payload: JsonValue;
  readonly payloadDigest: string;
  readonly requestDigest: string;
  readonly signature: string | null;
}

export interface InteropResponseEnvelopeV1 {
  readonly schemaVersion: 1;
  readonly protocol: typeof AGENTPLAT_INTEROP_PROTOCOL_V1;
  readonly requestDigest: string;
  readonly endpointId: string;
  readonly sessionId: string;
  readonly operation: InteropOperationV1;
  readonly sequence: number;
  readonly status: "completed" | "refused" | "deferred" | "failed";
  readonly reasonCode: string;
  readonly payload: JsonValue;
  readonly payloadDigest: string;
  readonly responseDigest: string;
  readonly signature: string | null;
}

export interface InteropTransportV1 {
  manifest(options?: {
    readonly signal?: AbortSignal;
  }): Promise<InteropEndpointManifestV1>;
  exchange(
    request: InteropRequestEnvelopeV1,
    options?: { readonly signal?: AbortSignal },
  ): Promise<InteropResponseEnvelopeV1>;
}

export interface InteropEnvelopeAuthenticityPortV1 {
  readonly localSignerId: string;
  sign(digest: string): Promise<string>;
  verify(input: {
    readonly signerId: string;
    readonly digest: string;
    readonly signature: string;
  }): Promise<boolean>;
}

/**
 * Content-bound authorization retained across one router invocation. Generic
 * admission ports may continue to return booleans; stateful ports return this
 * grant so the router can prove it is still current before commit and delivery.
 */
export interface InteropRequestAdmissionGrantV1 {
  readonly admitted: true;
  readonly admissionId: string;
  readonly requestDigest: string;
  readonly scopeRevision: number;
  readonly scopeEpoch: number;
  readonly scopeDigest: string;
  readonly bindingDigest: string;
}

export interface InteropRequestAdmissionPortV1 {
  admit(
    request: InteropRequestEnvelopeV1,
  ): Promise<boolean | InteropRequestAdmissionGrantV1>;
  /**
   * Optional fail-closed freshness check. Routers invoke it after handler work,
   * immediately before commit and again immediately before returning any cached
   * or newly committed response.
   */
  revalidate?(input: {
    readonly request: InteropRequestEnvelopeV1;
    readonly grant: InteropRequestAdmissionGrantV1 | null;
  }): Promise<boolean>;
}

export interface InteropPayloadSchemaV1 {
  readonly schemaDigest: string;
  validate(input: {
    readonly operation: InteropOperationV1;
    readonly direction: "request" | "response";
    readonly payload: JsonValue;
  }): Promise<boolean>;
}

/** Resolves the exact negotiated schema to executable validation code. */
export interface InteropPayloadSchemaResolverV1 {
  resolve(schemaDigest: string): Promise<InteropPayloadSchemaV1 | null>;
}

export class InMemoryInteropPayloadSchemaResolverV1 implements InteropPayloadSchemaResolverV1 {
  readonly #schemas: ReadonlyMap<string, InteropPayloadSchemaV1>;

  constructor(schemas: readonly InteropPayloadSchemaV1[]) {
    const byDigest = new Map<string, InteropPayloadSchemaV1>();
    for (const schema of schemas) {
      const schemaDigest = schema.schemaDigest;
      const validate = schema.validate;
      digest(schemaDigest, "interopPayloadSchema.schemaDigest");
      if (typeof validate !== "function" || byDigest.has(schemaDigest))
        throw new TypeError("interop payload schema registration is invalid");
      byDigest.set(
        schemaDigest,
        Object.freeze({
          schemaDigest,
          validate: validate.bind(schema),
        }),
      );
    }
    this.#schemas = byDigest;
  }

  async resolve(schemaDigest: string): Promise<InteropPayloadSchemaV1 | null> {
    digest(schemaDigest, "schemaDigest");
    return this.#schemas.get(schemaDigest) ?? null;
  }
}

export interface InteropOperationHandlerV1 {
  readonly operation: InteropOperationV1;
  handle(input: {
    readonly request: InteropRequestEnvelopeV1;
    readonly signal: AbortSignal;
    /** Exact scoped grant admitted for this invocation, when available. */
    readonly admissionGrant: InteropRequestAdmissionGrantV1 | null;
  }): Promise<{
    readonly status: InteropResponseEnvelopeV1["status"];
    readonly reasonCode: string;
    readonly payload: JsonValue;
  }>;
}

export interface InteropIdempotencyRecordV1 {
  readonly requestDigest: string;
  readonly reservationId: string;
  readonly reservedUntilLogicalMs: number;
  readonly response: InteropResponseEnvelopeV1 | null;
}

export interface InteropIdempotencyStoreV1 {
  load(idempotencyKey: string): Promise<InteropIdempotencyRecordV1 | null>;
  reserve(input: {
    readonly idempotencyKey: string;
    readonly requestDigest: string;
    readonly reservationId: string;
    readonly logicalTimeMs: number;
    readonly reservedUntilLogicalMs: number;
  }): Promise<boolean>;
  commit(input: {
    readonly idempotencyKey: string;
    readonly requestDigest: string;
    readonly reservationId: string;
    readonly response: InteropResponseEnvelopeV1;
  }): Promise<boolean>;
}

export type InteropSequenceAdmissionV1 =
  "advanced" | "duplicate" | "stale" | "conflict";

export interface InteropSequenceStoreV1 {
  admit(input: {
    readonly issuerId: string;
    readonly sessionId: string;
    readonly operation: InteropOperationV1;
    readonly sequence: number;
    readonly requestDigest: string;
  }): Promise<InteropSequenceAdmissionV1>;
}

/**
 * Closed durable custody composition for a router that must survive process
 * restart.  It deliberately cannot be assembled structurally: callers use
 * createRestartDurableInteropRouterStoresV1 so an operational router never
 * accidentally falls back to process-local replay state.
 */
const restartDurableInteropRouterStoresBrandV1: unique symbol = Symbol(
  "RestartDurableInteropRouterStoresV1",
);
export interface RestartDurableInteropRouterStoresV1 {
  readonly idempotency: InteropIdempotencyStoreV1;
  readonly sequences: InteropSequenceStoreV1;
  readonly [restartDurableInteropRouterStoresBrandV1]: "RestartDurableInteropRouterStoresV1";
}

export function createRestartDurableInteropRouterStoresV1(input: {
  readonly idempotency: InteropIdempotencyStoreV1;
  readonly sequences: InteropSequenceStoreV1;
}): RestartDurableInteropRouterStoresV1 {
  if (!input || typeof input !== "object")
    throw new TypeError("restart-durable router stores are required");
  const { idempotency, sequences } = input;
  if (
    !idempotency ||
    typeof idempotency.load !== "function" ||
    typeof idempotency.reserve !== "function" ||
    typeof idempotency.commit !== "function" ||
    !sequences ||
    typeof sequences.admit !== "function"
  )
    throw new TypeError("restart-durable router stores are invalid");
  return Object.freeze({
    idempotency,
    sequences,
    [restartDurableInteropRouterStoresBrandV1]:
      "RestartDurableInteropRouterStoresV1" as const,
  });
}

/**
 * Atomic outbound sequence allocator. Durable implementations must preserve
 * both the high-water mark and idempotency-key allocations across restarts.
 */
export interface InteropOutboundSequenceStoreV1 {
  next(input: {
    readonly issuerId: string;
    readonly sessionId: string;
    readonly maximumSequence: number;
    /** Exact retries receive the originally allocated envelope sequence. */
    readonly idempotencyKey?: string;
  }): Promise<number>;
  current(input: {
    readonly issuerId: string;
    readonly sessionId: string;
  }): Promise<number>;
}

export class InMemoryInteropOutboundSequenceStoreV1 implements InteropOutboundSequenceStoreV1 {
  readonly #heads = new Map<string, number>();
  readonly #allocations = new Map<string, number>();

  async next(input: {
    readonly issuerId: string;
    readonly sessionId: string;
    readonly maximumSequence: number;
    readonly idempotencyKey?: string;
  }): Promise<number> {
    identifier(input.issuerId, "issuerId");
    identifier(input.sessionId, "sessionId");
    integer(
      input.maximumSequence,
      "maximumSequence",
      1,
      Number.MAX_SAFE_INTEGER,
    );
    const key = `${input.issuerId}\u0000${input.sessionId}`;
    if (input.idempotencyKey !== undefined)
      identifier(input.idempotencyKey, "idempotencyKey");
    const allocationKey =
      input.idempotencyKey === undefined
        ? null
        : `${key}\u0000${input.idempotencyKey}`;
    const allocated =
      allocationKey === null ? undefined : this.#allocations.get(allocationKey);
    if (allocated !== undefined) {
      if (allocated > input.maximumSequence)
        throw new RangeError("interop outbound sequence capacity exceeded");
      return allocated;
    }
    const next = (this.#heads.get(key) ?? 0) + 1;
    if (next > input.maximumSequence)
      throw new RangeError("interop outbound sequence capacity exceeded");
    this.#heads.set(key, next);
    if (allocationKey !== null) this.#allocations.set(allocationKey, next);
    return next;
  }

  async current(input: {
    readonly issuerId: string;
    readonly sessionId: string;
  }): Promise<number> {
    identifier(input.issuerId, "issuerId");
    identifier(input.sessionId, "sessionId");
    return this.#heads.get(`${input.issuerId}\u0000${input.sessionId}`) ?? 0;
  }
}

export class InMemoryInteropSequenceStoreV1 implements InteropSequenceStoreV1 {
  readonly #heads = new Map<
    string,
    { readonly sequence: number; readonly requestDigest: string }
  >();
  async admit(input: {
    readonly issuerId: string;
    readonly sessionId: string;
    readonly operation: InteropOperationV1;
    readonly sequence: number;
    readonly requestDigest: string;
  }): Promise<InteropSequenceAdmissionV1> {
    const key = `${input.issuerId}\u0000${input.sessionId}\u0000${input.operation}`;
    const current = this.#heads.get(key);
    if (!current || input.sequence > current.sequence) {
      this.#heads.set(
        key,
        freeze({
          sequence: input.sequence,
          requestDigest: input.requestDigest,
        }),
      );
      return "advanced";
    }
    if (input.sequence < current.sequence) return "stale";
    return input.requestDigest === current.requestDigest
      ? "duplicate"
      : "conflict";
  }
}

export class InMemoryInteropIdempotencyStoreV1 implements InteropIdempotencyStoreV1 {
  readonly #values = new Map<string, InteropIdempotencyRecordV1>();
  async load(
    idempotencyKey: string,
  ): Promise<InteropIdempotencyRecordV1 | null> {
    return this.#values.get(idempotencyKey) ?? null;
  }
  async reserve(input: {
    readonly idempotencyKey: string;
    readonly requestDigest: string;
    readonly reservationId: string;
    readonly logicalTimeMs: number;
    readonly reservedUntilLogicalMs: number;
  }): Promise<boolean> {
    const current = this.#values.get(input.idempotencyKey);
    if (current) {
      if (current.requestDigest !== input.requestDigest)
        throw new Error(
          "interop idempotency key was reused with different content",
        );
      if (
        current.response ||
        current.reservedUntilLogicalMs >= input.logicalTimeMs
      )
        return false;
    }
    this.#values.set(
      input.idempotencyKey,
      freeze({
        requestDigest: input.requestDigest,
        reservationId: input.reservationId,
        reservedUntilLogicalMs: input.reservedUntilLogicalMs,
        response: null,
      }),
    );
    return true;
  }
  async commit(input: {
    readonly idempotencyKey: string;
    readonly requestDigest: string;
    readonly reservationId: string;
    readonly response: InteropResponseEnvelopeV1;
  }): Promise<boolean> {
    const current = this.#values.get(input.idempotencyKey);
    if (
      !current ||
      current.requestDigest !== input.requestDigest ||
      current.reservationId !== input.reservationId
    )
      return false;
    if (current.response)
      return current.response.responseDigest === input.response.responseDigest;
    this.#values.set(
      input.idempotencyKey,
      freeze({ ...current, response: input.response }),
    );
    return true;
  }
}

export interface SimulationEnvironmentObservationV1 {
  readonly observationId: string;
  readonly cursor: string;
  readonly partial: boolean;
  readonly modality: "structured" | "text" | "sensor" | "image" | "audio";
  readonly value: JsonValue;
  readonly evidenceDigest: string;
  readonly logicalTimeMs: number;
}

export interface SimulationEnvironmentTransitionV1 {
  readonly transitionId: string;
  readonly actionDigest: string;
  readonly accepted: boolean;
  readonly rewardMicros: number | null;
  readonly terminal: boolean;
  readonly nextCursor: string;
  readonly evidenceDigest: string;
  readonly logicalTimeMs: number;
}

export interface SimulationEnvironmentSnapshotV1 {
  readonly snapshotId: string;
  readonly sessionId: string;
  readonly throughSequence: number;
  readonly stateReference: string;
  readonly stateDigest: string;
}

const interopClientInvokersV1 = new WeakMap<
  object,
  {
    readonly clientId: string;
    readonly negotiate: (
      signal?: AbortSignal,
    ) => Promise<InteropEndpointManifestV1>;
    readonly manifest: (
      signal?: AbortSignal,
    ) => Promise<InteropEndpointManifestV1>;
    readonly invoke: (
      input: Parameters<InteropClientV1["invoke"]>[0],
    ) => Promise<InteropResponseEnvelopeV1>;
  }
>();

export class InteropClientV1 {
  readonly #integrity: InteropEnvelopeAuthenticityPortV1 | null;
  readonly #clientId: string;
  readonly #transportManifest: InteropTransportV1["manifest"];
  readonly #transportExchange: InteropTransportV1["exchange"];
  readonly #resolveSchema: InteropPayloadSchemaResolverV1["resolve"];
  readonly #crypto: Crypto | undefined;
  #manifest: InteropEndpointManifestV1 | null = null;
  #negotiation: Promise<InteropEndpointManifestV1> | null = null;
  #inputSchema: InteropPayloadSchemaV1 | null = null;
  #outputSchema: InteropPayloadSchemaV1 | null = null;

  constructor(
    readonly options: {
      readonly clientId: string;
      readonly transport: InteropTransportV1;
      readonly schemas: InteropPayloadSchemaResolverV1;
      readonly authenticity?: InteropEnvelopeAuthenticityPortV1;
      readonly crypto?: Crypto;
    },
  ) {
    const clientId = options.clientId;
    const transport = options.transport;
    const schemas = options.schemas;
    const authenticity = options.authenticity;
    const crypto = captureInteropDigestCryptoV1(
      options.crypto ?? globalThis.crypto,
    );
    const transportManifest = transport?.manifest;
    const transportExchange = transport?.exchange;
    const resolveSchema = schemas?.resolve;
    const signerId = authenticity?.localSignerId;
    const sign = authenticity?.sign;
    const verify = authenticity?.verify;
    identifier(clientId, "clientId");
    if (
      !transport ||
      typeof transportManifest !== "function" ||
      typeof transportExchange !== "function"
    )
      throw new TypeError("interop transport is required");
    if (!schemas || typeof resolveSchema !== "function")
      throw new TypeError("interop payload schema resolver is required");
    if (authenticity && signerId !== clientId)
      throw new TypeError(
        "interop client authenticity identity does not match clientId",
      );
    if (
      authenticity &&
      (typeof sign !== "function" || typeof verify !== "function")
    )
      throw new TypeError("interop client authenticity port is invalid");
    this.#clientId = clientId;
    this.#transportManifest = transportManifest.bind(transport);
    this.#transportExchange = transportExchange.bind(transport);
    this.#resolveSchema = resolveSchema.bind(schemas);
    this.#crypto = crypto;
    this.#integrity = authenticity
      ? Object.freeze({
          localSignerId: signerId!,
          sign: sign!.bind(authenticity),
          verify: verify!.bind(authenticity),
        })
      : null;
    Object.defineProperty(this, "options", {
      value: Object.freeze({
        clientId: this.#clientId,
        transport,
        schemas,
        ...(this.#integrity ? { authenticity: this.#integrity } : {}),
        ...(this.#crypto ? { crypto: this.#crypto } : {}),
      }),
      writable: false,
      configurable: false,
      enumerable: true,
    });
    const invokers = Object.freeze({
      clientId: this.#clientId,
      negotiate: (signal?: AbortSignal) => this.#negotiate(signal),
      manifest: (signal?: AbortSignal) => this.#manifestFor(signal),
      invoke: (input: Parameters<InteropClientV1["invoke"]>[0]) =>
        this.#invoke(input),
    });
    interopClientInvokersV1.set(this, invokers);
    Object.defineProperties(this, {
      negotiate: immutableMethod(invokers.negotiate),
      manifest: immutableMethod(invokers.manifest),
      invoke: immutableMethod(invokers.invoke),
    });
  }

  get clientId(): string {
    return this.#clientId;
  }

  negotiate(signal?: AbortSignal): Promise<InteropEndpointManifestV1> {
    return this.#negotiate(signal);
  }

  #negotiate(signal?: AbortSignal): Promise<InteropEndpointManifestV1> {
    if (this.#manifest) return Promise.resolve(this.#manifest);
    if (this.#negotiation) return this.#negotiation;
    const pending = this.#performNegotiation(signal).catch((error) => {
      this.#manifest = null;
      this.#inputSchema = null;
      this.#outputSchema = null;
      if (this.#negotiation === pending) this.#negotiation = null;
      throw error;
    });
    this.#negotiation = pending;
    return pending;
  }

  async #performNegotiation(
    signal?: AbortSignal,
  ): Promise<InteropEndpointManifestV1> {
    const manifest = await this.#transportManifest(signal ? { signal } : {});
    const validatedManifest = await validateInteropEndpointManifestV1(
      manifest,
      this.#crypto,
    );
    const [inputSchema, outputSchema] = await Promise.all([
      this.#resolveSchema(validatedManifest.inputSchemaDigest),
      this.#resolveSchema(validatedManifest.outputSchemaDigest),
    ]);
    const inputSchemaDigest = inputSchema?.schemaDigest;
    const inputSchemaValidate = inputSchema?.validate;
    const outputSchemaDigest = outputSchema?.schemaDigest;
    const outputSchemaValidate = outputSchema?.validate;
    if (
      !inputSchema ||
      inputSchemaDigest !== validatedManifest.inputSchemaDigest ||
      typeof inputSchemaValidate !== "function" ||
      !outputSchema ||
      outputSchemaDigest !== validatedManifest.outputSchemaDigest ||
      typeof outputSchemaValidate !== "function"
    )
      throw new Error("interop negotiated payload schema is unavailable");
    const capturedInputSchema = Object.freeze({
      schemaDigest: inputSchemaDigest,
      validate: inputSchemaValidate.bind(inputSchema),
    });
    const capturedOutputSchema = Object.freeze({
      schemaDigest: outputSchemaDigest,
      validate: outputSchemaValidate.bind(outputSchema),
    });
    if (
      (validatedManifest.requiresRequestSignature ||
        validatedManifest.signsResponses) &&
      !this.#integrity
    )
      throw new Error("interop endpoint requires an authenticity port");
    this.#manifest = validatedManifest;
    this.#inputSchema = capturedInputSchema;
    this.#outputSchema = capturedOutputSchema;
    this.#negotiation = null;
    return validatedManifest;
  }

  /** Returns the cached negotiated manifest, resolving schemas on first use. */
  manifest(signal?: AbortSignal): Promise<InteropEndpointManifestV1> {
    return this.#manifestFor(signal);
  }

  #manifestFor(signal?: AbortSignal): Promise<InteropEndpointManifestV1> {
    return this.#manifest
      ? Promise.resolve(this.#manifest)
      : this.#negotiate(signal);
  }

  invoke(input: {
    readonly requestId: string;
    readonly idempotencyKey: string;
    readonly sessionId: string;
    readonly operation: InteropOperationV1;
    readonly sequence: number;
    readonly logicalTimeMs: number;
    readonly deadlineLogicalMs: number;
    readonly payload: JsonValue;
    readonly signal?: AbortSignal;
    readonly expectedManifestDigest?: string;
  }): Promise<InteropResponseEnvelopeV1> {
    return this.#invoke(input);
  }

  async #invoke(input: {
    readonly requestId: string;
    readonly idempotencyKey: string;
    readonly sessionId: string;
    readonly operation: InteropOperationV1;
    readonly sequence: number;
    readonly logicalTimeMs: number;
    readonly deadlineLogicalMs: number;
    readonly payload: JsonValue;
    readonly signal?: AbortSignal;
    readonly expectedManifestDigest?: string;
  }): Promise<InteropResponseEnvelopeV1> {
    const captured = Object.freeze({
      requestId: input.requestId,
      idempotencyKey: input.idempotencyKey,
      sessionId: input.sessionId,
      operation: input.operation,
      sequence: input.sequence,
      logicalTimeMs: input.logicalTimeMs,
      deadlineLogicalMs: input.deadlineLogicalMs,
      payload: freeze(input.payload),
      signal: input.signal,
      expectedManifestDigest: input.expectedManifestDigest,
    });
    const manifest = await this.#manifestFor(captured.signal);
    if (
      captured.expectedManifestDigest !== undefined &&
      captured.expectedManifestDigest !== manifest.manifestDigest
    )
      throw new Error("interop client manifest binding changed");
    if (!manifest.operations.includes(captured.operation))
      throw new Error(
        `interop operation is unavailable: ${captured.operation}`,
      );
    const payload = captured.payload;
    if (
      !this.#inputSchema ||
      (await this.#inputSchema.validate({
        operation: captured.operation,
        direction: "request",
        payload,
      })) !== true
    )
      throw new TypeError(
        "interop request payload does not match its negotiated schema",
      );
    const payloadDigest = await interopDigestV1(
      "request-payload",
      payload,
      this.#crypto,
    );
    const unsigned = {
      schemaVersion: 1 as const,
      protocol: AGENTPLAT_INTEROP_PROTOCOL_V1,
      requestId: captured.requestId,
      idempotencyKey: captured.idempotencyKey,
      issuerId: this.#clientId,
      endpointId: manifest.endpointId,
      sessionId: captured.sessionId,
      operation: captured.operation,
      sequence: captured.sequence,
      logicalTimeMs: captured.logicalTimeMs,
      deadlineLogicalMs: captured.deadlineLogicalMs,
      payload,
      payloadDigest,
    };
    validateRequestBody(unsigned, manifest);
    const requestDigest = await interopDigestV1(
      "request",
      unsigned,
      this.#crypto,
    );
    const request = freeze({
      ...unsigned,
      requestDigest,
      signature: manifest.requiresRequestSignature
        ? await this.#integrity!.sign(requestDigest)
        : null,
    });
    if (canonicalByteLength(request) > manifest.maximumRequestBytes)
      throw new RangeError("interop request exceeds manifest limit");
    const response = await this.#transportExchange(
      request,
      captured.signal ? { signal: captured.signal } : {},
    );
    const validated = await validateInteropResponseEnvelopeV1({
      response,
      request,
      manifest,
      authenticity: manifest.signsResponses ? this.#integrity : null,
      crypto: this.#crypto,
    });
    if (
      validated.status === "completed" &&
      (!this.#outputSchema ||
        (await this.#outputSchema.validate({
          operation: validated.operation,
          direction: "response",
          payload: validated.payload,
        })) !== true)
    )
      throw new TypeError(
        "interop response payload does not match its negotiated schema",
      );
    return validated;
  }
}

export function isInteropClientV1(value: unknown): value is InteropClientV1 {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    interopClientInvokersV1.has(value)
  );
}

export function interopClientIdV1(client: InteropClientV1): string {
  const invokers = interopClientInvokersV1.get(client);
  if (!invokers) throw new TypeError("concrete interop client is required");
  return invokers.clientId;
}

export function invokeInteropClientNegotiateV1(
  client: InteropClientV1,
  signal?: AbortSignal,
): Promise<InteropEndpointManifestV1> {
  const invokers = interopClientInvokersV1.get(client);
  if (!invokers) throw new TypeError("concrete interop client is required");
  return invokers.negotiate(signal);
}

export function invokeInteropClientManifestV1(
  client: InteropClientV1,
  signal?: AbortSignal,
): Promise<InteropEndpointManifestV1> {
  const invokers = interopClientInvokersV1.get(client);
  if (!invokers) throw new TypeError("concrete interop client is required");
  return invokers.manifest(signal);
}

export function invokeInteropClientV1(
  client: InteropClientV1,
  input: Parameters<InteropClientV1["invoke"]>[0],
): Promise<InteropResponseEnvelopeV1> {
  const invokers = interopClientInvokersV1.get(client);
  if (!invokers) throw new TypeError("concrete interop client is required");
  return invokers.invoke(input);
}

interface InteropPortableAgentAdapterInvokersV1 {
  readonly step: (
    input: PortableAgentAdapterStepInputV1,
    context: PortableAgentAdapterContextV1,
  ) => Promise<PortableAgentStepResultV1>;
  readonly checkpoint: (
    input: PortableAgentAdapterCheckpointInputV1,
    context: PortableAgentAdapterContextV1,
  ) => Promise<PortableAgentCheckpointV1>;
  readonly restore: (
    input: PortableAgentAdapterRestoreInputV1,
    context: PortableAgentAdapterContextV1,
  ) => Promise<void>;
  readonly exportCheckpoint: (
    input: PortableAgentAdapterCheckpointExportInputV1,
    context: PortableAgentAdapterContextV1,
  ) => Promise<PortableAgentAdapterCheckpointExportResultV1>;
  readonly importCheckpoint: (
    input: PortableAgentAdapterCheckpointImportInputV1,
    context: PortableAgentAdapterContextV1,
  ) => Promise<PortableAgentCheckpointV1>;
}

const interopPortableAgentAdapterInvokersV1 = new WeakMap<
  object,
  InteropPortableAgentAdapterInvokersV1
>();

/** Makes a remote interop endpoint a first-class portable Agentplat adapter. */
export class InteropPortableAgentAdapterV1 implements PortableAgentAdapterV1 {
  readonly #clientId: string;
  readonly #clientManifest: (
    signal?: AbortSignal,
  ) => Promise<InteropEndpointManifestV1>;
  readonly #clientInvoke: (
    input: Parameters<InteropClientV1["invoke"]>[0],
  ) => Promise<InteropResponseEnvelopeV1>;
  readonly #nextSequence: InteropOutboundSequenceStoreV1["next"];
  readonly #authorizationGate:
    | ((
        operation: InteropOperationV1,
        sessionId: string,
        manifest: InteropEndpointManifestV1,
      ) => Promise<void>)
    | null;
  declare readonly step: InteropPortableAgentAdapterInvokersV1["step"];
  declare readonly checkpoint: InteropPortableAgentAdapterInvokersV1["checkpoint"];
  declare readonly restore: InteropPortableAgentAdapterInvokersV1["restore"];
  declare readonly exportCheckpoint: InteropPortableAgentAdapterInvokersV1["exportCheckpoint"];
  declare readonly importCheckpoint: InteropPortableAgentAdapterInvokersV1["importCheckpoint"];

  constructor(
    client: InteropClientV1,
    sequences: InteropOutboundSequenceStoreV1 = new InMemoryInteropOutboundSequenceStoreV1(),
    authorizationGate?: (
      operation: InteropOperationV1,
      sessionId: string,
      manifest: InteropEndpointManifestV1,
    ) => Promise<void>,
  ) {
    if (!isInteropClientV1(client))
      throw new TypeError("concrete interop client is required");
    const sequenceNext = sequences?.next;
    const sequenceCurrent = sequences?.current;
    if (
      !sequences ||
      typeof sequenceNext !== "function" ||
      typeof sequenceCurrent !== "function"
    )
      throw new TypeError("interop outbound sequence store is required");
    if (authorizationGate && typeof authorizationGate !== "function")
      throw new TypeError("interop adapter authorization gate is invalid");
    this.#clientId = interopClientIdV1(client);
    this.#clientManifest = (signal) =>
      invokeInteropClientManifestV1(client, signal);
    this.#clientInvoke = (input) => invokeInteropClientV1(client, input);
    this.#nextSequence = sequenceNext.bind(sequences);
    this.#authorizationGate = authorizationGate ?? null;
    const invokers: InteropPortableAgentAdapterInvokersV1 = Object.freeze({
      step: (
        input: PortableAgentAdapterStepInputV1,
        context: PortableAgentAdapterContextV1,
      ) => this.#step(input, context),
      checkpoint: (
        input: PortableAgentAdapterCheckpointInputV1,
        context: PortableAgentAdapterContextV1,
      ) => this.#checkpoint(input, context),
      restore: (
        input: PortableAgentAdapterRestoreInputV1,
        context: PortableAgentAdapterContextV1,
      ) => this.#restore(input, context),
      exportCheckpoint: (
        input: PortableAgentAdapterCheckpointExportInputV1,
        context: PortableAgentAdapterContextV1,
      ) => this.#exportCheckpoint(input, context),
      importCheckpoint: (
        input: PortableAgentAdapterCheckpointImportInputV1,
        context: PortableAgentAdapterContextV1,
      ) => this.#importCheckpoint(input, context),
    });
    interopPortableAgentAdapterInvokersV1.set(this, invokers);
    Object.defineProperties(this, {
      step: immutableMethod(invokers.step),
      checkpoint: immutableMethod(invokers.checkpoint),
      restore: immutableMethod(invokers.restore),
      exportCheckpoint: immutableMethod(invokers.exportCheckpoint),
      importCheckpoint: immutableMethod(invokers.importCheckpoint),
    });
  }

  async #step(
    input: PortableAgentAdapterStepInputV1,
    context: PortableAgentAdapterContextV1,
  ): Promise<PortableAgentStepResultV1> {
    const response = await this.#invoke({
      requestId: input.request.stepId,
      idempotencyKey: `${input.sessionId}:step:${input.stepSequence}`,
      sessionId: input.sessionId,
      operation: "agent.step",
      logicalTimeMs: input.request.logicalTimeMs,
      payload: input as unknown as JsonValue,
      signal: context.signal,
    });
    if (response.status !== "completed") throw new Error(response.reasonCode);
    return response.payload as unknown as PortableAgentStepResultV1;
  }

  async #checkpoint(
    input: PortableAgentAdapterCheckpointInputV1,
    context: PortableAgentAdapterContextV1,
  ): Promise<PortableAgentCheckpointV1> {
    const response = await this.#invoke({
      requestId: `${input.sessionId}:checkpoint:${input.throughStepSequence}`,
      idempotencyKey: `${input.sessionId}:checkpoint:${input.throughStepSequence}`,
      sessionId: input.sessionId,
      operation: "agent.checkpoint",
      logicalTimeMs: input.throughStepSequence,
      payload: input as unknown as JsonValue,
      signal: context.signal,
    });
    if (response.status !== "completed") throw new Error(response.reasonCode);
    return response.payload as unknown as PortableAgentCheckpointV1;
  }

  async #restore(
    input: PortableAgentAdapterRestoreInputV1,
    context: PortableAgentAdapterContextV1,
  ): Promise<void> {
    const response = await this.#invoke({
      requestId: `${input.sessionId}:restore:${input.checkpoint.checkpointId}`,
      idempotencyKey: `${input.sessionId}:restore:${input.checkpoint.stateDigest}`,
      sessionId: input.sessionId,
      operation: "agent.restore",
      logicalTimeMs: input.checkpoint.throughStepSequence,
      payload: input as unknown as JsonValue,
      signal: context.signal,
    });
    if (response.status !== "completed") throw new Error(response.reasonCode);
  }

  async #exportCheckpoint(
    input: PortableAgentAdapterCheckpointExportInputV1,
    context: PortableAgentAdapterContextV1,
  ): Promise<PortableAgentAdapterCheckpointExportResultV1> {
    const response = await this.#invoke({
      requestId: `${input.sessionId}:export:${input.checkpoint.checkpointId}`,
      idempotencyKey: `${input.sessionId}:export:${input.checkpoint.stateDigest}`,
      sessionId: input.sessionId,
      operation: "agent.checkpoint.export",
      logicalTimeMs: input.checkpoint.throughStepSequence,
      payload: input as unknown as JsonValue,
      signal: context.signal,
    });
    if (response.status !== "completed") throw new Error(response.reasonCode);
    return response.payload as unknown as PortableAgentAdapterCheckpointExportResultV1;
  }

  async #importCheckpoint(
    input: PortableAgentAdapterCheckpointImportInputV1,
    context: PortableAgentAdapterContextV1,
  ): Promise<PortableAgentCheckpointV1> {
    const response = await this.#invoke({
      requestId: `${input.targetSessionId}:import:${input.transfer.checkpoint.stateDigest}`,
      idempotencyKey: `${input.targetSessionId}:import:${input.transfer.checkpoint.stateDigest}`,
      sessionId: input.targetSessionId,
      operation: "agent.checkpoint.import",
      logicalTimeMs: input.transfer.sourceSessionRevision,
      payload: input as unknown as JsonValue,
      signal: context.signal,
    });
    if (response.status !== "completed") throw new Error(response.reasonCode);
    return response.payload as unknown as PortableAgentCheckpointV1;
  }

  async #invoke(input: {
    readonly requestId: string;
    readonly idempotencyKey: string;
    readonly sessionId: string;
    readonly operation: InteropOperationV1;
    readonly logicalTimeMs: number;
    readonly payload: JsonValue;
    readonly signal: AbortSignal;
  }): Promise<InteropResponseEnvelopeV1> {
    const captured = Object.freeze({
      requestId: input.requestId,
      idempotencyKey: input.idempotencyKey,
      sessionId: input.sessionId,
      operation: input.operation,
      logicalTimeMs: input.logicalTimeMs,
      payload: freeze(input.payload),
      signal: input.signal,
    });
    const manifest = await this.#clientManifest(captured.signal);
    if (this.#authorizationGate)
      await this.#authorizationGate(
        captured.operation,
        captured.sessionId,
        manifest,
      );
    const sequence = await this.#nextSequence({
      issuerId: this.#clientId,
      sessionId: captured.sessionId,
      maximumSequence: manifest.maximumStepsPerSession,
      idempotencyKey: captured.idempotencyKey,
    });
    return this.#clientInvoke({
      ...captured,
      sequence,
      deadlineLogicalMs: Number.MAX_SAFE_INTEGER,
      expectedManifestDigest: manifest.manifestDigest,
    });
  }
}

/** Framework-neutral client for external deterministic or live environments. */
export class InteropSimulationEnvironmentClientV1 {
  readonly #clientId: string;
  readonly #clientManifest: (
    signal?: AbortSignal,
  ) => Promise<InteropEndpointManifestV1>;
  readonly #clientInvoke: (
    input: Parameters<InteropClientV1["invoke"]>[0],
  ) => Promise<InteropResponseEnvelopeV1>;
  readonly #nextSequence: InteropOutboundSequenceStoreV1["next"];

  constructor(
    readonly client: InteropClientV1,
    readonly sessionId: string,
    readonly sequences: InteropOutboundSequenceStoreV1,
  ) {
    identifier(sessionId, "sessionId");
    if (!isInteropClientV1(client))
      throw new TypeError("concrete interop client is required");
    const sequenceNext = sequences?.next;
    const sequenceCurrent = sequences?.current;
    if (
      !sequences ||
      typeof sequenceNext !== "function" ||
      typeof sequenceCurrent !== "function"
    )
      throw new TypeError("interop outbound sequence store is required");
    this.#clientId = interopClientIdV1(client);
    this.#clientManifest = (signal) =>
      invokeInteropClientManifestV1(client, signal);
    this.#clientInvoke = (input) => invokeInteropClientV1(client, input);
    this.#nextSequence = sequenceNext.bind(sequences);
    Object.defineProperty(this, "client", {
      value: client,
      writable: false,
      configurable: false,
      enumerable: true,
    });
    Object.defineProperty(this, "sessionId", {
      value: sessionId,
      writable: false,
      configurable: false,
      enumerable: true,
    });
    Object.defineProperty(this, "sequences", {
      value: sequences,
      writable: false,
      configurable: false,
      enumerable: true,
    });
  }

  reset(
    input: JsonObject,
    logicalTimeMs: number,
    signal?: AbortSignal,
  ): Promise<InteropResponseEnvelopeV1> {
    return this.#invoke("environment.reset", input, logicalTimeMs, signal);
  }
  async observe(
    cursor: string,
    logicalTimeMs: number,
    signal?: AbortSignal,
  ): Promise<SimulationEnvironmentObservationV1> {
    const response = await this.#invoke(
      "environment.observe",
      { cursor },
      logicalTimeMs,
      signal,
    );
    requireCompleted(response);
    return response.payload as unknown as SimulationEnvironmentObservationV1;
  }
  async act(
    action: JsonObject,
    logicalTimeMs: number,
    signal?: AbortSignal,
  ): Promise<SimulationEnvironmentTransitionV1> {
    const response = await this.#invoke(
      "environment.act",
      action,
      logicalTimeMs,
      signal,
    );
    requireCompleted(response);
    return response.payload as unknown as SimulationEnvironmentTransitionV1;
  }
  async snapshot(
    logicalTimeMs: number,
    signal?: AbortSignal,
  ): Promise<SimulationEnvironmentSnapshotV1> {
    const response = await this.#invoke(
      "environment.snapshot",
      {},
      logicalTimeMs,
      signal,
    );
    requireCompleted(response);
    return response.payload as unknown as SimulationEnvironmentSnapshotV1;
  }
  restore(
    snapshot: SimulationEnvironmentSnapshotV1,
    logicalTimeMs: number,
    signal?: AbortSignal,
  ): Promise<InteropResponseEnvelopeV1> {
    return this.#invoke(
      "environment.restore",
      snapshot as unknown as JsonValue,
      logicalTimeMs,
      signal,
    );
  }
  close(
    logicalTimeMs: number,
    signal?: AbortSignal,
  ): Promise<InteropResponseEnvelopeV1> {
    return this.#invoke("environment.close", {}, logicalTimeMs, signal);
  }

  async #invoke(
    operation: InteropOperationV1,
    payload: JsonValue,
    logicalTimeMs: number,
    signal?: AbortSignal,
  ) {
    const captured = Object.freeze({
      operation,
      payload: freeze(payload),
      logicalTimeMs,
      signal,
    });
    const manifest = await this.#clientManifest(captured.signal);
    const sequence = await this.#nextSequence({
      issuerId: this.#clientId,
      sessionId: this.sessionId,
      maximumSequence: manifest.maximumStepsPerSession,
      idempotencyKey: `${this.sessionId}:${captured.operation}:${captured.logicalTimeMs}`,
    });
    return this.#clientInvoke({
      requestId: `${this.sessionId}:${captured.operation}:${sequence}`,
      idempotencyKey: `${this.sessionId}:${captured.operation}:${sequence}`,
      sessionId: this.sessionId,
      operation: captured.operation,
      sequence,
      logicalTimeMs: captured.logicalTimeMs,
      deadlineLogicalMs: Number.MAX_SAFE_INTEGER,
      payload: captured.payload,
      ...(captured.signal ? { signal: captured.signal } : {}),
    });
  }
}

const interopEndpointRouterInvokersV1 = new WeakMap<
  object,
  {
    readonly handle: (
      request: InteropRequestEnvelopeV1,
      input: { readonly logicalTimeMs: number; readonly signal: AbortSignal },
    ) => Promise<InteropResponseEnvelopeV1>;
  }
>();

/** Server-side protocol router; HTTP, IPC and in-process servers can share it. */
export class InteropEndpointRouterV1 {
  readonly #handlers: ReadonlyMap<
    InteropOperationV1,
    InteropOperationHandlerV1["handle"]
  >;
  readonly #routerInstanceId: string;
  readonly #manifest: InteropEndpointManifestV1;
  readonly #reservationLeaseMs: number;
  readonly #admit: InteropRequestAdmissionPortV1["admit"];
  readonly #revalidate: NonNullable<
    InteropRequestAdmissionPortV1["revalidate"]
  > | null;
  readonly #resolveSchema: InteropPayloadSchemaResolverV1["resolve"];
  readonly #verify: InteropEnvelopeAuthenticityPortV1["verify"] | null;
  readonly #sign: InteropEnvelopeAuthenticityPortV1["sign"] | null;
  readonly #storeLoad: InteropIdempotencyStoreV1["load"];
  readonly #storeReserve: InteropIdempotencyStoreV1["reserve"];
  readonly #storeCommit: InteropIdempotencyStoreV1["commit"];
  readonly #sequenceAdmit: InteropSequenceStoreV1["admit"];
  readonly #crypto: Crypto | undefined;
  #invocationSequence = 0;

  constructor(
    readonly options: {
      readonly routerInstanceId: string;
      readonly manifest: InteropEndpointManifestV1;
      readonly handlers: readonly InteropOperationHandlerV1[];
      readonly admission: InteropRequestAdmissionPortV1;
      readonly schemas: InteropPayloadSchemaResolverV1;
      readonly authenticity?: InteropEnvelopeAuthenticityPortV1;
      /** Required for normal/operational use; created by the closed factory. */
      readonly durableStores?: RestartDurableInteropRouterStoresV1;
      /** Explicit opt-in for tests, simulations and single-process tools. */
      readonly localOnly?: true;
      readonly reservationLeaseMs?: number;
      readonly crypto?: Crypto;
    },
  ) {
    const routerInstanceId = options.routerInstanceId;
    const manifest = snapshotInteropEndpointManifestV1(options.manifest);
    const admission = options.admission;
    const schemas = options.schemas;
    const authenticity = options.authenticity;
    const crypto = captureInteropDigestCryptoV1(
      options.crypto ?? globalThis.crypto,
    );
    const admit = admission?.admit;
    const revalidate = admission?.revalidate;
    const resolveSchema = schemas?.resolve;
    const signerId = authenticity?.localSignerId;
    const verify = authenticity?.verify;
    const sign = authenticity?.sign;
    const handlerRegistrations = Array.from(options.handlers, (handler) => ({
      operation: handler.operation,
      handle: handler.handle,
      owner: handler,
    }));
    identifier(routerInstanceId, "routerInstanceId");
    const reservationLeaseMs = integer(
      options.reservationLeaseMs ?? 30_000,
      "reservationLeaseMs",
      1,
      3_600_000,
    );
    if (!admission || typeof admit !== "function")
      throw new TypeError("interop request admission port is required");
    if (!schemas || typeof resolveSchema !== "function")
      throw new TypeError("interop payload schema resolver is required");
    if (revalidate !== undefined && typeof revalidate !== "function")
      throw new TypeError("interop request revalidation port is invalid");
    if (
      (manifest.requiresRequestSignature || manifest.signsResponses) &&
      !authenticity
    )
      throw new TypeError(
        "interop manifest authenticity capabilities do not match the router",
      );
    if (authenticity && signerId !== manifest.endpointId)
      throw new TypeError(
        "interop router authenticity identity does not match endpointId",
      );
    if (
      authenticity &&
      (typeof verify !== "function" || typeof sign !== "function")
    )
      throw new TypeError("interop router authenticity port is invalid");
    const handlers = new Map<
      InteropOperationV1,
      InteropOperationHandlerV1["handle"]
    >(
      handlerRegistrations.map((handler) => [
        handler.operation,
        handler.handle.bind(handler.owner),
      ]),
    );
    if (
      handlerRegistrations.some(
        (handler) => typeof handler.handle !== "function",
      ) ||
      handlers.size !== handlerRegistrations.length ||
      handlers.size !== manifest.operations.length ||
      manifest.operations.some((operation) => !handlers.has(operation))
    )
      throw new TypeError(
        "interop operation handlers do not match the manifest",
      );
    if (options.localOnly === true && options.durableStores !== undefined)
      throw new TypeError("router cannot combine local and durable stores");
    if (options.localOnly !== true && !options.durableStores)
      throw new TypeError(
        "restart-durable interop router stores are required; use createRestartDurableInteropRouterStoresV1 or explicitly select localOnly",
      );
    const store = options.durableStores?.idempotency ?? new InMemoryInteropIdempotencyStoreV1();
    const sequences = options.durableStores?.sequences ?? new InMemoryInteropSequenceStoreV1();
    const storeLoad = store.load;
    const storeReserve = store.reserve;
    const storeCommit = store.commit;
    const sequenceAdmit = sequences.admit;
    if (
      typeof storeLoad !== "function" ||
      typeof storeReserve !== "function" ||
      typeof storeCommit !== "function"
    )
      throw new TypeError("interop idempotency store is required");
    if (typeof sequenceAdmit !== "function")
      throw new TypeError("interop sequence store is required");
    this.#routerInstanceId = routerInstanceId;
    this.#manifest = manifest;
    this.#reservationLeaseMs = reservationLeaseMs;
    this.#handlers = handlers;
    this.#admit = admit.bind(admission);
    this.#revalidate = revalidate ? revalidate.bind(admission) : null;
    this.#resolveSchema = resolveSchema.bind(schemas);
    this.#verify = authenticity ? verify!.bind(authenticity) : null;
    this.#sign = authenticity ? sign!.bind(authenticity) : null;
    this.#storeLoad = storeLoad.bind(store);
    this.#storeReserve = storeReserve.bind(store);
    this.#storeCommit = storeCommit.bind(store);
    this.#sequenceAdmit = sequenceAdmit.bind(sequences);
    this.#crypto = crypto;
    Object.defineProperty(this, "options", {
      value: Object.freeze({
        routerInstanceId: this.#routerInstanceId,
        manifest: this.#manifest,
        handlers: Object.freeze(
          handlerRegistrations.map((handler) =>
            Object.freeze({
              operation: handler.operation,
              handle: handler.handle.bind(handler.owner),
            }),
          ),
        ),
        admission,
        schemas,
        ...(authenticity ? { authenticity } : {}),
        ...(options.durableStores ? { durableStores: options.durableStores } : { localOnly: true as const }),
        reservationLeaseMs: this.#reservationLeaseMs,
        ...(this.#crypto ? { crypto: this.#crypto } : {}),
      }),
      writable: false,
      configurable: false,
      enumerable: true,
    });
    const invokers = Object.freeze({
      handle: (
        request: InteropRequestEnvelopeV1,
        input: { readonly logicalTimeMs: number; readonly signal: AbortSignal },
      ) => this.#handle(request, input),
    });
    interopEndpointRouterInvokersV1.set(this, invokers);
    Object.defineProperty(this, "handle", immutableMethod(invokers.handle));
  }

  handle(
    request: InteropRequestEnvelopeV1,
    input: { readonly logicalTimeMs: number; readonly signal: AbortSignal },
  ): Promise<InteropResponseEnvelopeV1> {
    return this.#handle(request, input);
  }

  async #handle(
    request: InteropRequestEnvelopeV1,
    input: { readonly logicalTimeMs: number; readonly signal: AbortSignal },
  ): Promise<InteropResponseEnvelopeV1> {
    request = snapshotInteropRequestEnvelopeV1(request);
    const logicalTimeMs = input.logicalTimeMs;
    const signal = input.signal;
    integer(logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
    const manifest = await validateInteropEndpointManifestV1(
      this.#manifest,
      this.#crypto,
    );
    request = await validateInteropRequestEnvelopeV1(
      request,
      manifest,
      this.#crypto,
    );
    if (!manifest.requiresRequestSignature && request.signature !== null)
      throw new TypeError("interop request signature was not negotiated");
    if (
      manifest.requiresRequestSignature &&
      (!request.signature ||
        !this.#verify ||
        (await this.#verify({
          signerId: request.issuerId,
          digest: request.requestDigest,
          signature: request.signature,
        })) !== true)
    )
      throw new TypeError("interop request signature is invalid");
    const inputSchema = await this.#resolveSchema(manifest.inputSchemaDigest);
    const validateInput = inputSchema?.validate;
    if (
      !inputSchema ||
      inputSchema.schemaDigest !== manifest.inputSchemaDigest ||
      typeof validateInput !== "function" ||
      (await validateInput.call(inputSchema, {
        operation: request.operation,
        direction: "request",
        payload: request.payload,
      })) !== true
    )
      throw new TypeError(
        "interop request payload does not match its negotiated schema",
      );
    if (logicalTimeMs < request.logicalTimeMs)
      return this.#respond(
        request,
        "deferred",
        "interop_request_not_yet_valid",
        null,
      );
    const admissionDecision = await this.#admit(request);
    const admissionGrant =
      admissionDecision === true
        ? null
        : admissionDecision === false
          ? false
          : validateAdmissionGrant(admissionDecision, request);
    if (admissionGrant === false)
      return this.#respond(
        request,
        "refused",
        "interop_request_not_admitted",
        null,
      );
    const idempotencyStoreKey = scopedIdempotencyStoreKey(request);
    const cached = await this.#loadIdempotencyRecord(
      idempotencyStoreKey,
      request,
      manifest,
    );
    if (cached) {
      if (cached.requestDigest !== request.requestDigest)
        throw new Error("interop idempotency replay binding is invalid");
      if (cached.response)
        return this.#deliverAdmittedResponse(
          request,
          cached.response,
          admissionGrant,
        );
      if (cached.reservedUntilLogicalMs >= logicalTimeMs)
        return this.#deliverAdmittedResponse(
          request,
          await this.#respond(
            request,
            "deferred",
            "interop_request_in_progress",
            null,
          ),
          admissionGrant,
        );
    }
    if (logicalTimeMs >= request.deadlineLogicalMs)
      return this.#deliverAdmittedResponse(
        request,
        await this.#respond(
          request,
          "deferred",
          "interop_request_deadline_elapsed",
          null,
        ),
        admissionGrant,
      );
    if (signal.aborted)
      return this.#deliverAdmittedResponse(
        request,
        await this.#respond(
          request,
          "deferred",
          "interop_request_aborted",
          null,
        ),
        admissionGrant,
      );
    const sequenceAdmission = await this.#sequenceAdmit({
      issuerId: request.issuerId,
      sessionId: request.sessionId,
      operation: request.operation,
      sequence: request.sequence,
      requestDigest: request.requestDigest,
    });
    if (
      !["advanced", "duplicate", "stale", "conflict"].includes(
        sequenceAdmission,
      )
    )
      throw new TypeError("interop sequence admission result is invalid");
    if (sequenceAdmission === "stale")
      return this.#deliverAdmittedResponse(
        request,
        await this.#respond(
          request,
          "refused",
          "interop_request_sequence_stale",
          null,
        ),
        admissionGrant,
      );
    if (sequenceAdmission === "conflict")
      throw new Error("interop request sequence equivocation");
    const handler = this.#handlers.get(request.operation);
    if (!handler)
      return this.#deliverAdmittedResponse(
        request,
        await this.#respond(
          request,
          "refused",
          "interop_operation_unavailable",
          null,
        ),
        admissionGrant,
      );
    const reservationId = `${this.#routerInstanceId}:${++this.#invocationSequence}`;
    const reservedUntilLogicalMs = Math.min(
      Number.MAX_SAFE_INTEGER,
      logicalTimeMs + this.#reservationLeaseMs,
    );
    if (
      (await this.#storeReserve({
        idempotencyKey: idempotencyStoreKey,
        requestDigest: request.requestDigest,
        reservationId,
        logicalTimeMs,
        reservedUntilLogicalMs,
      })) !== true
    ) {
      const raced = await this.#loadIdempotencyRecord(
        idempotencyStoreKey,
        request,
        manifest,
      );
      if (!raced || raced.requestDigest !== request.requestDigest)
        throw new Error("interop idempotency reservation conflict");
      return this.#deliverAdmittedResponse(
        request,
        raced.response ??
          (await this.#respond(
            request,
            "deferred",
            "interop_request_in_progress",
            null,
          )),
        admissionGrant,
      );
    }
    let outcome: Awaited<ReturnType<InteropOperationHandlerV1["handle"]>>;
    try {
      outcome = await handler({
        request,
        signal,
        admissionGrant,
      });
    } catch (error) {
      if (signal.aborted) throw error;
      outcome = {
        status: "failed",
        reasonCode: "interop_handler_failed",
        payload: null,
      };
    }
    outcome = freeze(outcome);
    if (outcome.status === "completed") {
      const outputSchema = await this.#resolveSchema(
        manifest.outputSchemaDigest,
      );
      const validateOutput = outputSchema?.validate;
      if (
        !outputSchema ||
        outputSchema.schemaDigest !== manifest.outputSchemaDigest ||
        typeof validateOutput !== "function" ||
        (await validateOutput.call(outputSchema, {
          operation: request.operation,
          direction: "response",
          payload: outcome.payload,
        })) !== true
      ) {
        outcome = {
          status: "failed",
          reasonCode: "interop_response_schema_invalid",
          payload: null,
        };
      }
    }
    let response: InteropResponseEnvelopeV1;
    try {
      response = await this.#respond(
        request,
        outcome.status,
        outcome.reasonCode,
        outcome.payload,
      );
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      response = await this.#respond(
        request,
        "failed",
        "interop_response_limit_exceeded",
        null,
      );
    }
    if (!(await this.#admissionIsCurrent(request, admissionGrant)))
      response = await this.#respond(
        request,
        "refused",
        "interop_request_admission_expired",
        null,
      );
    if (
      (await this.#storeCommit({
        idempotencyKey: idempotencyStoreKey,
        requestDigest: request.requestDigest,
        reservationId,
        response,
      })) !== true
    ) {
      const raced = await this.#loadIdempotencyRecord(
        idempotencyStoreKey,
        request,
        manifest,
      );
      if (
        !raced ||
        raced.requestDigest !== request.requestDigest ||
        !raced.response
      )
        throw new Error("interop idempotency commit conflict");
      return this.#deliverAdmittedResponse(
        request,
        raced.response,
        admissionGrant,
      );
    }
    return this.#deliverAdmittedResponse(request, response, admissionGrant);
  }

  async #loadIdempotencyRecord(
    idempotencyStoreKey: string,
    request: InteropRequestEnvelopeV1,
    manifest: InteropEndpointManifestV1,
  ): Promise<InteropIdempotencyRecordV1 | null> {
    const loaded = await this.#storeLoad(idempotencyStoreKey);
    if (loaded === null) return null;
    const record = freeze(loaded);
    digest(record.requestDigest, "idempotencyRequestDigest");
    identifier(record.reservationId, "idempotencyReservationId");
    integer(
      record.reservedUntilLogicalMs,
      "idempotencyReservedUntilLogicalMs",
      0,
      Number.MAX_SAFE_INTEGER,
    );
    if (record.response === null) return record;
    const response = await validateInteropResponseEnvelopeV1({
      response: record.response,
      request,
      manifest,
      authenticity: null,
      ...(this.#crypto ? { crypto: this.#crypto } : {}),
    });
    if (
      manifest.signsResponses &&
      (!response.signature ||
        !this.#verify ||
        (await this.#verify({
          signerId: response.endpointId,
          digest: response.responseDigest,
          signature: response.signature,
        })) !== true)
    )
      throw new TypeError("cached interop response signature is invalid");
    if (response.status === "completed") {
      const outputSchema = await this.#resolveSchema(
        manifest.outputSchemaDigest,
      );
      const validateOutput = outputSchema?.validate;
      if (
        !outputSchema ||
        outputSchema.schemaDigest !== manifest.outputSchemaDigest ||
        typeof validateOutput !== "function" ||
        (await validateOutput.call(outputSchema, {
          operation: request.operation,
          direction: "response",
          payload: response.payload,
        })) !== true
      )
        throw new TypeError(
          "cached interop response does not match its negotiated schema",
        );
    }
    return freeze({ ...record, response });
  }

  async #admissionIsCurrent(
    request: InteropRequestEnvelopeV1,
    grant: InteropRequestAdmissionGrantV1 | null,
  ): Promise<boolean> {
    return this.#revalidate
      ? (await this.#revalidate({ request, grant })) === true
      : true;
  }

  async #deliverAdmittedResponse(
    request: InteropRequestEnvelopeV1,
    response: InteropResponseEnvelopeV1,
    grant: InteropRequestAdmissionGrantV1 | null,
  ): Promise<InteropResponseEnvelopeV1> {
    if (response.reasonCode === "interop_request_admission_expired")
      return response;
    if (await this.#admissionIsCurrent(request, grant)) return response;
    return this.#respond(
      request,
      "refused",
      "interop_request_admission_expired",
      null,
    );
  }

  async #respond(
    request: InteropRequestEnvelopeV1,
    status: InteropResponseEnvelopeV1["status"],
    reasonCode: string,
    payload: JsonValue,
  ): Promise<InteropResponseEnvelopeV1> {
    if (!["completed", "refused", "deferred", "failed"].includes(status))
      throw new TypeError("interop response status is invalid");
    if (status !== "completed" && payload !== null)
      throw new TypeError(
        "non-completed interop response payload must be null",
      );
    const stablePayload = freeze(payload);
    identifier(reasonCode, "reasonCode");
    if (
      new TextEncoder().encode(canonical(stablePayload)).byteLength >
      this.#manifest.maximumResponseBytes
    )
      throw new RangeError("interop handler response exceeds manifest limit");
    const payloadDigest = await interopDigestV1(
      "response-payload",
      stablePayload,
      this.#crypto,
    );
    const body = {
      schemaVersion: 1 as const,
      protocol: AGENTPLAT_INTEROP_PROTOCOL_V1,
      requestDigest: request.requestDigest,
      endpointId: this.#manifest.endpointId,
      sessionId: request.sessionId,
      operation: request.operation,
      sequence: request.sequence,
      status,
      reasonCode,
      payload: stablePayload,
      payloadDigest,
    };
    const responseDigest = await interopDigestV1(
      "response",
      body,
      this.#crypto,
    );
    const response = freeze({
      ...body,
      responseDigest,
      signature: this.#manifest.signsResponses
        ? await this.#sign!(responseDigest)
        : null,
    });
    if (canonicalByteLength(response) > this.#manifest.maximumResponseBytes)
      throw new RangeError("interop response exceeds manifest limit");
    return response;
  }
}

export function isInteropEndpointRouterV1(
  value: unknown,
): value is InteropEndpointRouterV1 {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    interopEndpointRouterInvokersV1.has(value)
  );
}

export function invokeInteropEndpointRouterHandleV1(
  router: InteropEndpointRouterV1,
  request: InteropRequestEnvelopeV1,
  input: { readonly logicalTimeMs: number; readonly signal: AbortSignal },
): Promise<InteropResponseEnvelopeV1> {
  const invokers = interopEndpointRouterInvokersV1.get(router);
  if (!invokers)
    throw new TypeError("concrete interop endpoint router is required");
  return invokers.handle(request, input);
}

export async function createInteropEndpointManifestV1(
  input: Omit<
    InteropEndpointManifestV1,
    "schemaVersion" | "protocol" | "manifestDigest"
  >,
  crypto?: Crypto,
): Promise<InteropEndpointManifestV1> {
  const body = freeze({
    schemaVersion: 1 as const,
    protocol: AGENTPLAT_INTEROP_PROTOCOL_V1,
    ...input,
  });
  validateManifestBody(body);
  return freeze({
    ...body,
    manifestDigest: await interopDigestV1("manifest", body, crypto),
  });
}

export function snapshotInteropEndpointManifestV1(
  input: InteropEndpointManifestV1,
): InteropEndpointManifestV1 {
  if (!input || typeof input !== "object")
    throw new TypeError("interop endpoint manifest is required");
  return freeze({
    schemaVersion: input.schemaVersion,
    protocol: input.protocol,
    endpointId: input.endpointId,
    endpointVersion: input.endpointVersion,
    implementationId: input.implementationId,
    endpointKind: input.endpointKind,
    operations: Array.from(input.operations),
    inputSchemaDigest: input.inputSchemaDigest,
    outputSchemaDigest: input.outputSchemaDigest,
    supportsCancellation: input.supportsCancellation,
    supportsDeterministicReplay: input.supportsDeterministicReplay,
    supportsCheckpoint: input.supportsCheckpoint,
    requiresRequestSignature: input.requiresRequestSignature,
    signsResponses: input.signsResponses,
    maximumRequestBytes: input.maximumRequestBytes,
    maximumResponseBytes: input.maximumResponseBytes,
    maximumStepsPerSession: input.maximumStepsPerSession,
    manifestDigest: input.manifestDigest,
  });
}

/** Captures one canonical request before an asynchronous authority boundary. */
export function snapshotInteropRequestEnvelopeV1(
  input: InteropRequestEnvelopeV1,
): InteropRequestEnvelopeV1 {
  if (!input || typeof input !== "object")
    throw new TypeError("interop request envelope is required");
  return freeze(input);
}

export async function validateInteropEndpointManifestV1(
  input: InteropEndpointManifestV1,
  crypto?: Crypto,
): Promise<InteropEndpointManifestV1> {
  input = freeze(input);
  const {
    manifestDigest,
    schemaVersion: _version,
    protocol: _protocol,
    ...body
  } = input;
  const rebuilt = await createInteropEndpointManifestV1(body, crypto);
  if (rebuilt.manifestDigest !== manifestDigest)
    throw new TypeError("interop manifest digest is invalid");
  return rebuilt;
}

export async function validateInteropRequestEnvelopeV1(
  input: InteropRequestEnvelopeV1,
  manifest: InteropEndpointManifestV1,
  crypto?: Crypto,
): Promise<InteropRequestEnvelopeV1> {
  input = freeze(input);
  if (
    !input ||
    input.schemaVersion !== 1 ||
    input.protocol !== AGENTPLAT_INTEROP_PROTOCOL_V1 ||
    input.endpointId !== manifest.endpointId
  )
    throw new TypeError(
      "interop request schema or endpoint binding is invalid",
    );
  const { requestDigest, signature, ...body } = input;
  if (signature !== null) token(signature, "requestSignature");
  if (canonicalByteLength(input) > manifest.maximumRequestBytes)
    throw new RangeError("interop request exceeds manifest limit");
  validateRequestBody(body, manifest);
  if (
    (await interopDigestV1("request-payload", input.payload, crypto)) !==
      input.payloadDigest ||
    (await interopDigestV1("request", body, crypto)) !== requestDigest
  )
    throw new TypeError("interop request digest is invalid");
  return freeze(input);
}

export async function interopDigestV1(
  domain: string,
  value: unknown,
  crypto: Crypto = globalThis.crypto,
): Promise<string> {
  if (!crypto?.subtle) throw new TypeError("Web Crypto is unavailable");
  const capturedDigest = interopDigestCryptoInvokersV1.get(crypto);
  const digest = capturedDigest ?? crypto.subtle.digest.bind(crypto.subtle);
  const bytes = new TextEncoder().encode(
    `agentplat-interop-v1\u0000${domain}\u0000${canonical(value)}`,
  );
  const hashed = await digest("SHA-256", bytes);
  return `sha256:${[...new Uint8Array(hashed)].map((item) => item.toString(16).padStart(2, "0")).join("")}`;
}

/** Captures the exact digest implementation used by a long-lived runtime. */
export function captureInteropDigestCryptoV1(crypto: Crypto): Crypto {
  const subtle = crypto?.subtle;
  const digest = subtle?.digest;
  if (!subtle || typeof digest !== "function")
    throw new TypeError("Web Crypto digest implementation is unavailable");
  const invokeDigest = digest.bind(subtle);
  const captured = Object.freeze({
    subtle: Object.freeze({ digest: invokeDigest }),
  }) as unknown as Crypto;
  interopDigestCryptoInvokersV1.set(captured, invokeDigest);
  return captured;
}

async function validateInteropResponseEnvelopeV1(input: {
  readonly response: InteropResponseEnvelopeV1;
  readonly request: InteropRequestEnvelopeV1;
  readonly manifest: InteropEndpointManifestV1;
  readonly authenticity: InteropEnvelopeAuthenticityPortV1 | null;
  readonly crypto?: Crypto;
}): Promise<InteropResponseEnvelopeV1> {
  const value = freeze(input.response);
  if (
    !value ||
    value.schemaVersion !== 1 ||
    value.protocol !== AGENTPLAT_INTEROP_PROTOCOL_V1 ||
    value.requestDigest !== input.request.requestDigest ||
    value.endpointId !== input.manifest.endpointId ||
    value.sessionId !== input.request.sessionId ||
    value.operation !== input.request.operation ||
    value.sequence !== input.request.sequence
  )
    throw new TypeError("interop response binding is invalid");
  if (!["completed", "refused", "deferred", "failed"].includes(value.status))
    throw new TypeError("interop response status is invalid");
  if (value.status !== "completed" && value.payload !== null)
    throw new TypeError("non-completed interop response payload must be null");
  const actualPayload = await interopDigestV1(
    "response-payload",
    value.payload,
    input.crypto,
  );
  if (actualPayload !== value.payloadDigest)
    throw new TypeError("interop response payload digest is invalid");
  const { responseDigest, signature, ...body } = value;
  if (
    (await interopDigestV1("response", body, input.crypto)) !== responseDigest
  )
    throw new TypeError("interop response digest is invalid");
  identifier(value.reasonCode, "responseReasonCode");
  if (signature !== null) token(signature, "responseSignature");
  if (!input.manifest.signsResponses && signature !== null)
    throw new TypeError("interop response signature was not negotiated");
  if (
    input.authenticity &&
    (!signature ||
      (await input.authenticity.verify({
        signerId: value.endpointId,
        digest: responseDigest,
        signature,
      })) !== true)
  )
    throw new TypeError("interop response signature is invalid");
  if (canonicalByteLength(value) > input.manifest.maximumResponseBytes)
    throw new RangeError("interop response exceeds manifest limit");
  return freeze(value);
}

function validateManifestBody(
  input: Omit<InteropEndpointManifestV1, "manifestDigest">,
): void {
  if (
    input.schemaVersion !== 1 ||
    input.protocol !== AGENTPLAT_INTEROP_PROTOCOL_V1
  )
    throw new TypeError("interop manifest schema is invalid");
  identifier(input.endpointId, "endpointId");
  identifier(input.implementationId, "implementationId");
  if (
    !input.endpointVersion ||
    !["agent", "environment", "hybrid"].includes(input.endpointKind)
  )
    throw new TypeError("interop endpoint identity is invalid");
  const operations = [...new Set(input.operations)].sort();
  const supported: readonly InteropOperationV1[] = [
    "agent.checkpoint",
    "agent.checkpoint.export",
    "agent.checkpoint.import",
    "agent.restore",
    "agent.step",
    "environment.act",
    "environment.close",
    "environment.observe",
    "environment.reset",
    "environment.restore",
    "environment.snapshot",
  ];
  if (
    operations.length === 0 ||
    operations.some((item, index) => item !== input.operations[index]) ||
    operations.some((item) => !supported.includes(item))
  )
    throw new TypeError("interop operations must be canonical and supported");
  digest(input.inputSchemaDigest, "inputSchemaDigest");
  digest(input.outputSchemaDigest, "outputSchemaDigest");
  if (
    typeof input.supportsCancellation !== "boolean" ||
    typeof input.supportsDeterministicReplay !== "boolean" ||
    typeof input.supportsCheckpoint !== "boolean" ||
    typeof input.requiresRequestSignature !== "boolean" ||
    typeof input.signsResponses !== "boolean"
  )
    throw new TypeError("interop manifest capability flags are invalid");
  integer(input.maximumRequestBytes, "maximumRequestBytes", 1_024, 67_108_864);
  integer(
    input.maximumResponseBytes,
    "maximumResponseBytes",
    1_024,
    67_108_864,
  );
  integer(
    input.maximumStepsPerSession,
    "maximumStepsPerSession",
    1,
    10_000_000,
  );
}

function validateRequestBody(
  input: Omit<InteropRequestEnvelopeV1, "requestDigest" | "signature">,
  manifest: InteropEndpointManifestV1,
): void {
  identifier(input.requestId, "requestId");
  identifier(input.idempotencyKey, "idempotencyKey");
  identifier(input.issuerId, "issuerId");
  identifier(input.sessionId, "sessionId");
  if (!manifest.operations.includes(input.operation))
    throw new TypeError("interop request operation is unavailable");
  digest(input.payloadDigest, "payloadDigest");
  integer(input.sequence, "sequence", 1, manifest.maximumStepsPerSession);
  integer(input.logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
  integer(
    input.deadlineLogicalMs,
    "deadlineLogicalMs",
    input.logicalTimeMs,
    Number.MAX_SAFE_INTEGER,
  );
  if (
    new TextEncoder().encode(canonical(input)).byteLength >
    manifest.maximumRequestBytes
  )
    throw new RangeError("interop request exceeds manifest limit");
}

function validateAdmissionGrant(
  input: InteropRequestAdmissionGrantV1,
  request: InteropRequestEnvelopeV1,
): InteropRequestAdmissionGrantV1 {
  if (!input || input.admitted !== true)
    throw new TypeError("interop admission grant is invalid");
  identifier(input.admissionId, "admissionId");
  if (input.requestDigest !== request.requestDigest)
    throw new TypeError("interop admission grant request binding is invalid");
  digest(input.requestDigest, "requestDigest");
  integer(input.scopeRevision, "scopeRevision", 0, Number.MAX_SAFE_INTEGER);
  integer(input.scopeEpoch, "scopeEpoch", 0, Number.MAX_SAFE_INTEGER);
  digest(input.scopeDigest, "scopeDigest");
  digest(input.bindingDigest, "bindingDigest");
  return freeze(input);
}

function requireCompleted(response: InteropResponseEnvelopeV1): void {
  if (response.status !== "completed") throw new Error(response.reasonCode);
}

function scopedIdempotencyStoreKey(request: InteropRequestEnvelopeV1): string {
  return `${request.endpointId}\u0000${request.issuerId}\u0000${request.sessionId}\u0000${request.idempotencyKey}`;
}

function canonical(value: unknown): string {
  return canonicalJsonValue(value, new WeakSet<object>());
}

function canonicalByteLength(value: unknown): number {
  return new TextEncoder().encode(canonical(value)).byteLength;
}

function canonicalJsonValue(
  value: unknown,
  ancestors: WeakSet<object>,
): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0))
      throw new TypeError("interop JSON number is invalid");
    return JSON.stringify(value);
  }
  if (typeof value === "object") {
    if (ancestors.has(value))
      throw new TypeError("interop JSON object reference is repeated");
    ancestors.add(value);
    if (Array.isArray(value)) {
      const keys = Reflect.ownKeys(value);
      const indexKeys = keys.filter((key) => key !== "length");
      if (
        indexKeys.length !== value.length ||
        indexKeys.some((key) => {
          if (typeof key !== "string") return true;
          const index = Number(key);
          return (
            !Number.isSafeInteger(index) ||
            index < 0 ||
            index >= value.length ||
            String(index) !== key
          );
        })
      )
        throw new TypeError("interop JSON array is sparse or extended");
      const items = Array.from({ length: value.length }, (_, index) => {
        const descriptor = Object.getOwnPropertyDescriptor(
          value,
          String(index),
        );
        if (!descriptor || !descriptor.enumerable || !("value" in descriptor))
          throw new TypeError(
            "interop JSON array entries must be enumerable data",
          );
        return canonicalJsonValue(descriptor.value, ancestors);
      });
      return `[${items.join(",")}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null)
      throw new TypeError("interop JSON object prototype is invalid");
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string"))
      throw new TypeError("interop JSON symbol keys are invalid");
    const entries = (keys as string[]).map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor))
        throw new TypeError("interop JSON properties must be enumerable data");
      return [key, descriptor.value] as const;
    });
    return `{${entries
      // Relational comparison is specified over UTF-16 code units and does
      // not depend on host locale or installed collation data.
      .sort(([a], [b]) => compareUtf16CodeUnits(a, b))
      .map(
        ([key, item]) =>
          `${JSON.stringify(key)}:${canonicalJsonValue(item, ancestors)}`,
      )
      .join(",")}}`;
  }
  throw new TypeError("interop value is not canonical JSON");
}

function compareUtf16CodeUnits(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function identifier(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u.test(value)
  )
    throw new TypeError(`${label} is invalid`);
}
function digest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value))
    throw new TypeError(`${label} is invalid`);
}
function token(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length < 8 ||
    value.length > 16_384 ||
    /\s/u.test(value)
  )
    throw new TypeError(`${label} is invalid`);
}
function integer(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  )
    throw new RangeError(`${label} is invalid`);
  return value as number;
}
function immutableMethod<T extends (...args: never[]) => unknown>(
  value: T,
): PropertyDescriptor {
  return {
    value,
    writable: false,
    configurable: false,
    enumerable: false,
  };
}
function freeze<T>(value: T): T {
  canonical(value);
  const clone = structuredClone(value);
  const visit = (item: unknown): void => {
    if (!item || typeof item !== "object" || Object.isFrozen(item)) return;
    for (const child of Object.values(item as Record<string, unknown>))
      visit(child);
    Object.freeze(item);
  };
  visit(clone);
  return clone;
}
