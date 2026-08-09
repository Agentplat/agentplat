import type {
  AgentPlatID,
  JsonObject,
  JsonValue,
  Metadata,
  TenantContext,
} from "@agentplat/core";

import type {
  PortableAgentAdapterManifestV1,
  PortableAgentAdapterV1,
} from "./adapter-contracts.js";
import { PortableAgentErrorV1 } from "./adapter-errors.js";
import { normalizeAdapterManifestV1 } from "./adapter-validation.js";

export const COGNITIVE_AGENT_ADAPTER_SCHEMA_VERSION_V2 = 2 as const;

export const COGNITIVE_OPERATION_KINDS_V2 = Object.freeze([
  "observe",
  "plan",
  "memory_query",
  "memory_mutation",
  "tool",
  "alignment",
  "intervention",
] as const);
export type CognitiveOperationKindV2 =
  (typeof COGNITIVE_OPERATION_KINDS_V2)[number];

export const COGNITIVE_EFFECTFUL_OPERATION_KINDS_V2 = Object.freeze([
  "memory_mutation",
  "tool",
] as const);
export type CognitiveEffectfulOperationKindV2 =
  (typeof COGNITIVE_EFFECTFUL_OPERATION_KINDS_V2)[number];

export type CognitiveControlSurfaceV2 =
  "context" | "memory" | "tool" | "output" | "action" | "representation";

export interface CognitiveAgentAdapterManifestV2 {
  readonly schemaVersion: 2;
  readonly adapterId: AgentPlatID;
  readonly adapterVersion: string;
  readonly implementationId: AgentPlatID;
  readonly portable: PortableAgentAdapterManifestV1;
  readonly operations: readonly CognitiveOperationKindV2[];
  readonly controlSurfaces: readonly CognitiveControlSurfaceV2[];
  readonly supportsBlackBoxControl: boolean;
  readonly supportsRepresentationControl: boolean;
  readonly supportsMultimodalState: boolean;
  readonly maximumOperationBytes: number;
  readonly maximumResultBytes: number;
  readonly maximumReceiptHistory: number;
}

/**
 * Content-bound operation submitted to the peer-local cognitive boundary.
 * The payload is visible to the adapter but never copied into a durable receipt.
 */
export interface CognitiveOperationRequestV2 {
  readonly schemaVersion: 2;
  readonly operationId: AgentPlatID;
  readonly operation: CognitiveOperationKindV2;
  readonly tenantId: AgentPlatID;
  readonly sessionId: AgentPlatID;
  readonly agentId: AgentPlatID;
  readonly expectedRevision: number;
  readonly logicalTimeMs: number;
  readonly payload: JsonObject;
  readonly payloadDigest: string;
  readonly metadataDigest: string;
  readonly authorityDigest: string;
  readonly roleBindingDigest: string;
  /** Optional certified collective decision that authorized this operation. */
  readonly controlPlaneDigest?: string;
  readonly metadata: Metadata;
}

export interface CognitiveOperationResultV2 {
  readonly schemaVersion: 2;
  readonly operationId: AgentPlatID;
  readonly status: "completed" | "refused" | "abstained" | "failed";
  readonly output: JsonValue;
  readonly outputDigest: string;
  readonly reasonCode: string;
  readonly controlSurface: CognitiveControlSurfaceV2 | null;
}

export interface CognitiveOperationReceiptV2 {
  readonly schemaVersion: 2;
  readonly operationId: AgentPlatID;
  readonly operation: CognitiveOperationKindV2;
  readonly sessionId: AgentPlatID;
  readonly agentId: AgentPlatID;
  readonly revision: number;
  readonly logicalTimeMs: number;
  readonly payloadDigest: string;
  readonly metadataDigest: string;
  readonly outputDigest: string;
  readonly authorityDigest: string;
  readonly roleBindingDigest: string;
  readonly controlPlaneDigest?: string;
  readonly implementationId: AgentPlatID;
  readonly status: CognitiveOperationResultV2["status"];
  readonly reasonCode: string;
  readonly controlSurface: CognitiveControlSurfaceV2 | null;
  readonly previousStateDigest: string;
  readonly receiptDigest: string;
}

export interface CognitiveSessionStateV2 {
  readonly schemaVersion: 2;
  readonly tenantId: AgentPlatID;
  readonly sessionId: AgentPlatID;
  readonly agentId: AgentPlatID;
  readonly adapterId: AgentPlatID;
  readonly adapterVersion: string;
  readonly implementationId: AgentPlatID;
  readonly revision: number;
  readonly logicalTimeHighWaterMs: number;
  readonly receipts: readonly CognitiveOperationReceiptV2[];
  readonly stateDigest: string;
}

export interface CognitiveOperationOutcomeV2 {
  /** Retained durably for exact replay; stores must protect sensitive output. */
  readonly result: CognitiveOperationResultV2;
  readonly receipt: CognitiveOperationReceiptV2;
  readonly state: CognitiveSessionStateV2;
}

interface CognitiveDurableOperationRecordBaseV2 {
  readonly schemaVersion: 2;
  readonly tenantId: AgentPlatID;
  readonly sessionId: AgentPlatID;
  readonly agentId: AgentPlatID;
  readonly operationId: AgentPlatID;
  readonly operation: CognitiveOperationKindV2;
  readonly adapterId: AgentPlatID;
  readonly adapterVersion: string;
  readonly implementationId: AgentPlatID;
  readonly requestDigest: string;
  readonly idempotencyKey: string;
  readonly expectedSessionRevision: number;
  readonly previousStateDigest: string;
  readonly preparedAtLogicalMs: number;
  readonly recordDigest: string;
}

export type CognitiveDurableOperationRecordV2 =
  | (CognitiveDurableOperationRecordBaseV2 & {
      readonly status: "prepared";
      readonly journalRevision: 0;
      readonly outcome: null;
    })
  | (CognitiveDurableOperationRecordBaseV2 & {
      readonly status: "applied";
      readonly journalRevision: 1;
      readonly outcome: CognitiveOperationOutcomeV2;
    });

export interface CognitiveAgentAdapterContextV2 {
  readonly tenant: TenantContext;
  readonly signal: AbortSignal;
  readonly credentials?: Readonly<Record<string, string>>;
}

export interface CognitiveEffectInvocationV2 {
  readonly schemaVersion: 2;
  /** Stable across replicas and retries for one tenant/session/operationId. */
  readonly idempotencyKey: string;
  /** Binds the key to the complete content-addressed cognitive request. */
  readonly requestDigest: string;
}

/**
 * Effectful adapters must delegate through this sink. `apply` MUST atomically
 * deduplicate by idempotencyKey and reject a different requestDigest. `lookup`
 * is the recovery path for a crash after the external effect but before the
 * local applied record commits. This is not a claim of external exactly-once.
 */
export interface CognitiveEffectSinkV2 {
  readonly protocol: "idempotent_effect_sink_v2";
  lookup(
    input: {
      readonly request: CognitiveOperationRequestV2;
      readonly invocation: CognitiveEffectInvocationV2;
    },
    context: CognitiveAgentAdapterContextV2,
  ): Promise<CognitiveOperationResultV2 | null>;
  apply(
    input: {
      readonly request: CognitiveOperationRequestV2;
      readonly invocation: CognitiveEffectInvocationV2;
    },
    context: CognitiveAgentAdapterContextV2,
  ): Promise<CognitiveOperationResultV2>;
}

/** V2 augments, rather than replaces, checkpoint-compatible portable agents. */
export interface CognitiveAgentAdapterV2 {
  readonly manifest: CognitiveAgentAdapterManifestV2;
  readonly portable: PortableAgentAdapterV1;
  /** Required when the manifest advertises memory_mutation or tool. */
  readonly effectSink?: CognitiveEffectSinkV2;
  /** Must not apply memory/tool effects; those operations use effectSink. */
  execute(
    request: CognitiveOperationRequestV2,
    context: CognitiveAgentAdapterContextV2,
  ): Promise<CognitiveOperationResultV2>;
}

export interface CognitiveOperationGuardV2 {
  authorize(input: {
    readonly manifest: CognitiveAgentAdapterManifestV2;
    readonly request: CognitiveOperationRequestV2;
  }):
    | { readonly allowed: true }
    | { readonly allowed: false; readonly reasonCode: string }
    | Promise<
        | { readonly allowed: true }
        | { readonly allowed: false; readonly reasonCode: string }
      >;
}

export interface CognitiveIntegrityV2 {
  digest(domain: string, value: JsonValue): Promise<string>;
}

export interface CognitiveSessionStateStoreV2 {
  load(sessionId: AgentPlatID): Promise<CognitiveSessionStateV2 | null>;
  save(
    state: CognitiveSessionStateV2,
    expectedRevision: number | null,
  ): Promise<boolean>;
}

/**
 * Durable session/journal transaction boundary for effect-capable adapters.
 * prepareOperation atomically claims one session revision; commitOperation
 * atomically advances both the operation prepared->applied and the session CAS.
 * A normal save at a claimed revision MUST fail until commitOperation resolves.
 */
export interface CognitiveDurableOperationStoreV2 extends CognitiveSessionStateStoreV2 {
  loadOperation(input: {
    readonly tenantId: AgentPlatID;
    readonly sessionId: AgentPlatID;
    readonly operationId: AgentPlatID;
  }): Promise<CognitiveDurableOperationRecordV2 | null>;
  prepareOperation(input: {
    readonly operation: Extract<
      CognitiveDurableOperationRecordV2,
      { readonly status: "prepared" }
    >;
  }): Promise<boolean>;
  commitOperation(input: {
    readonly operation: Extract<
      CognitiveDurableOperationRecordV2,
      { readonly status: "applied" }
    >;
    readonly expectedOperationRevision: 0;
  }): Promise<boolean>;
}

export class InMemoryCognitiveSessionStateStoreV2 implements CognitiveDurableOperationStoreV2 {
  readonly #states = new Map<AgentPlatID, CognitiveSessionStateV2>();
  readonly #operations = new Map<string, CognitiveDurableOperationRecordV2>();
  readonly #revisionClaims = new Map<string, string>();

  async load(sessionId: AgentPlatID): Promise<CognitiveSessionStateV2 | null> {
    const state = this.#states.get(sessionId);
    return state ? immutable(state) : null;
  }

  async save(
    state: CognitiveSessionStateV2,
    expectedRevision: number | null,
  ): Promise<boolean> {
    const current = this.#states.get(state.sessionId);
    if (
      expectedRevision !== null &&
      this.#revisionClaims.has(
        durableRevisionKey(state.tenantId, state.sessionId, expectedRevision),
      )
    )
      return false;
    if (
      (expectedRevision === null &&
        (current !== undefined || state.revision !== 0)) ||
      (expectedRevision !== null &&
        (!current ||
          current.revision !== expectedRevision ||
          state.revision !== expectedRevision + 1))
    )
      return false;
    this.#states.set(state.sessionId, immutable(state));
    return true;
  }

  async loadOperation(input: {
    readonly tenantId: AgentPlatID;
    readonly sessionId: AgentPlatID;
    readonly operationId: AgentPlatID;
  }): Promise<CognitiveDurableOperationRecordV2 | null> {
    const operation = this.#operations.get(
      durableOperationKey(input.tenantId, input.sessionId, input.operationId),
    );
    return operation ? immutable(operation) : null;
  }

  async prepareOperation(input: {
    readonly operation: Extract<
      CognitiveDurableOperationRecordV2,
      { readonly status: "prepared" }
    >;
  }): Promise<boolean> {
    const operation = input.operation;
    const operationKey = durableOperationKey(
      operation.tenantId,
      operation.sessionId,
      operation.operationId,
    );
    const revisionKey = durableRevisionKey(
      operation.tenantId,
      operation.sessionId,
      operation.expectedSessionRevision,
    );
    const current = this.#states.get(operation.sessionId);
    if (
      this.#operations.has(operationKey) ||
      this.#revisionClaims.has(revisionKey) ||
      !current ||
      current.tenantId !== operation.tenantId ||
      current.agentId !== operation.agentId ||
      current.revision !== operation.expectedSessionRevision ||
      current.stateDigest !== operation.previousStateDigest
    )
      return false;
    this.#operations.set(operationKey, immutable(operation));
    this.#revisionClaims.set(revisionKey, operationKey);
    return true;
  }

  async commitOperation(input: {
    readonly operation: Extract<
      CognitiveDurableOperationRecordV2,
      { readonly status: "applied" }
    >;
    readonly expectedOperationRevision: 0;
  }): Promise<boolean> {
    const operation = input.operation;
    const operationKey = durableOperationKey(
      operation.tenantId,
      operation.sessionId,
      operation.operationId,
    );
    const revisionKey = durableRevisionKey(
      operation.tenantId,
      operation.sessionId,
      operation.expectedSessionRevision,
    );
    const prepared = this.#operations.get(operationKey);
    const current = this.#states.get(operation.sessionId);
    const outcome = operation.outcome;
    if (
      input.expectedOperationRevision !== 0 ||
      !prepared ||
      prepared.status !== "prepared" ||
      prepared.journalRevision !== input.expectedOperationRevision ||
      !sameDurableOperationIdentity(prepared, operation) ||
      this.#revisionClaims.get(revisionKey) !== operationKey ||
      !current ||
      current.tenantId !== operation.tenantId ||
      current.agentId !== operation.agentId ||
      current.revision !== operation.expectedSessionRevision ||
      current.stateDigest !== operation.previousStateDigest ||
      outcome.state.tenantId !== operation.tenantId ||
      outcome.state.sessionId !== operation.sessionId ||
      outcome.state.agentId !== operation.agentId ||
      outcome.state.revision !== operation.expectedSessionRevision + 1 ||
      outcome.receipt.operationId !== operation.operationId ||
      outcome.receipt.previousStateDigest !== current.stateDigest ||
      outcome.result.operationId !== operation.operationId ||
      outcome.state.receipts.at(-1)?.receiptDigest !==
        outcome.receipt.receiptDigest
    )
      return false;
    this.#states.set(operation.sessionId, immutable(outcome.state));
    this.#operations.set(operationKey, immutable(operation));
    return true;
  }
}

export interface CognitiveAgentRuntimeOptionsV2 {
  readonly adapter: CognitiveAgentAdapterV2;
  readonly guard: CognitiveOperationGuardV2;
  readonly integrity?: CognitiveIntegrityV2;
  /** Explicit durable implementation is mandatory for effect-capable manifests. */
  readonly store?: CognitiveSessionStateStoreV2;
  readonly maximumCommitAttempts?: number;
}

/**
 * Revision-checked cognitive operation host. It serializes no hidden reasoning,
 * bounds session receipts, and uses a separate durable outcome journal only for
 * adapters that advertise effectful operations.
 */
export class CognitiveAgentRuntimeV2 {
  readonly #adapter: CognitiveAgentAdapterV2;
  readonly #guard: CognitiveOperationGuardV2;
  readonly #integrity: CognitiveIntegrityV2;
  readonly #store: CognitiveSessionStateStoreV2;
  readonly #durableStore: CognitiveDurableOperationStoreV2 | null;
  readonly #effectSink: CognitiveEffectSinkV2 | null;
  readonly #maximumCommitAttempts: number;
  readonly #activeSessions = new Set<AgentPlatID>();

  constructor(options: CognitiveAgentRuntimeOptionsV2) {
    validateManifest(options.adapter?.manifest);
    if (
      !options.adapter.portable ||
      typeof options.adapter.execute !== "function"
    )
      invalid("cognitive adapter implementation is required");
    if (!options.guard || typeof options.guard.authorize !== "function")
      invalid("cognitive operation guard is required");
    this.#adapter = options.adapter;
    this.#guard = options.guard;
    this.#integrity =
      options.integrity ?? createWebCryptoCognitiveIntegrityV2();
    this.#store = options.store ?? new InMemoryCognitiveSessionStateStoreV2();
    const effectCapable = options.adapter.manifest.operations.some(
      (operation) =>
        COGNITIVE_EFFECTFUL_OPERATION_KINDS_V2.includes(
          operation as CognitiveEffectfulOperationKindV2,
        ),
    );
    if (effectCapable) {
      if (!options.store || !durableOperationStore(options.store))
        throw new PortableAgentErrorV1(
          "ADAPTER_INCOMPATIBLE",
          "effectful cognitive operations require an explicit durable operation store",
        );
      if (
        options.adapter.effectSink?.protocol !== "idempotent_effect_sink_v2" ||
        typeof options.adapter.effectSink.lookup !== "function" ||
        typeof options.adapter.effectSink.apply !== "function"
      )
        throw new PortableAgentErrorV1(
          "ADAPTER_INCOMPATIBLE",
          "effectful cognitive operations require an idempotent effect sink with lookup",
        );
      this.#durableStore = options.store;
      this.#effectSink = options.adapter.effectSink;
    } else {
      this.#durableStore = null;
      this.#effectSink = null;
    }
    this.#maximumCommitAttempts = boundedInteger(
      options.maximumCommitAttempts ?? 4,
      "maximumCommitAttempts",
      1,
      32,
    );
  }

  async createSession(input: {
    readonly tenantId: AgentPlatID;
    readonly sessionId: AgentPlatID;
    readonly agentId: AgentPlatID;
  }): Promise<CognitiveSessionStateV2> {
    identifier(input.tenantId, "tenantId");
    identifier(input.sessionId, "sessionId");
    identifier(input.agentId, "agentId");
    const manifest = this.#adapter.manifest;
    const body = {
      schemaVersion: 2 as const,
      tenantId: input.tenantId,
      sessionId: input.sessionId,
      agentId: input.agentId,
      adapterId: manifest.adapterId,
      adapterVersion: manifest.adapterVersion,
      implementationId: manifest.implementationId,
      revision: 0,
      logicalTimeHighWaterMs: 0,
      receipts: [] as readonly CognitiveOperationReceiptV2[],
    };
    const state = immutable({
      ...body,
      stateDigest: await this.#integrity.digest(
        "cognitive-session-state-v2",
        body as unknown as JsonValue,
      ),
    });
    if (!(await this.#store.save(state, null)))
      throw new PortableAgentErrorV1(
        "STATE_CONFLICT",
        "cognitive session exists",
      );
    return state;
  }

  async getSession(
    sessionId: AgentPlatID,
  ): Promise<CognitiveSessionStateV2 | null> {
    identifier(sessionId, "sessionId");
    const state = await this.#store.load(sessionId);
    return state === null
      ? null
      : validateCognitiveSessionStateV2(
          state,
          this.#integrity,
          this.#adapter.manifest.maximumReceiptHistory,
        );
  }

  async execute(
    requestInput: CognitiveOperationRequestV2,
    context: CognitiveAgentAdapterContextV2,
  ): Promise<{
    readonly result: CognitiveOperationResultV2;
    readonly receipt: CognitiveOperationReceiptV2;
    readonly state: CognitiveSessionStateV2;
  }> {
    const request = await this.#validateRequest(requestInput);
    if (context.tenant.tenantId !== request.tenantId)
      invalid("tenant context does not match cognitive operation");
    if (context.signal.aborted)
      throw new PortableAgentErrorV1("CONFLICT", "operation aborted");
    if (this.#activeSessions.has(request.sessionId))
      throw new PortableAgentErrorV1(
        "STATE_CONFLICT",
        "session operation is already active",
      );
    this.#activeSessions.add(request.sessionId);
    try {
      return this.#durableStore
        ? await this.#executeDurably(request, context, this.#durableStore)
        : await this.#executeDirectly(request, context);
    } finally {
      this.#activeSessions.delete(request.sessionId);
    }
  }

  async #executeDirectly(
    request: CognitiveOperationRequestV2,
    context: CognitiveAgentAdapterContextV2,
  ): Promise<CognitiveOperationOutcomeV2> {
    const current = await this.#currentSession(request);
    if (
      current.receipts.some((item) => item.operationId === request.operationId)
    )
      throw new PortableAgentErrorV1(
        "STATE_CONFLICT",
        "operation identifier was already committed",
      );
    this.#assertRequestPosition(current, request);
    await this.#authorize(request);
    const result = await this.#adapter.execute(request, context);
    await this.#validateResult(request, result);
    const outcome = await this.#createOutcome(current, request, result);
    for (let attempt = 0; attempt < this.#maximumCommitAttempts; attempt += 1)
      if (await this.#store.save(outcome.state, current.revision))
        return outcome;
    throw new PortableAgentErrorV1(
      "STATE_CONFLICT",
      "commit attempts exhausted",
    );
  }

  async #executeDurably(
    request: CognitiveOperationRequestV2,
    context: CognitiveAgentAdapterContextV2,
    store: CognitiveDurableOperationStoreV2,
  ): Promise<CognitiveOperationOutcomeV2> {
    const requestDigest = await this.#requestDigest(request);
    const idempotencyKey = await this.#integrity.digest(
      "cognitive-effect-idempotency-v2",
      {
        tenantId: request.tenantId,
        sessionId: request.sessionId,
        operationId: request.operationId,
      },
    );
    for (let attempt = 0; attempt < this.#maximumCommitAttempts; attempt += 1) {
      const existing = await store.loadOperation(request);
      if (existing) {
        const operation = await this.#validatedDurableOperation(
          existing,
          request,
          requestDigest,
          idempotencyKey,
        );
        if (operation.status === "applied")
          return this.#replayedOutcome(request, operation.outcome);
        return this.#resumePreparedOperation(
          request,
          context,
          store,
          operation,
        );
      }

      const current = await this.#currentSession(request);
      if (
        current.receipts.some(
          (item) => item.operationId === request.operationId,
        )
      )
        throw new PortableAgentErrorV1(
          "STATE_INVALID",
          "committed operation is missing its durable journal record",
        );
      this.#assertRequestPosition(current, request);
      await this.#authorize(request);
      const preparedBody = {
        schemaVersion: 2 as const,
        tenantId: request.tenantId,
        sessionId: request.sessionId,
        agentId: request.agentId,
        operationId: request.operationId,
        operation: request.operation,
        adapterId: this.#adapter.manifest.adapterId,
        adapterVersion: this.#adapter.manifest.adapterVersion,
        implementationId: this.#adapter.manifest.implementationId,
        requestDigest,
        idempotencyKey,
        expectedSessionRevision: request.expectedRevision,
        previousStateDigest: current.stateDigest,
        preparedAtLogicalMs: request.logicalTimeMs,
        status: "prepared" as const,
        journalRevision: 0 as const,
        outcome: null,
      };
      const prepared = immutable({
        ...preparedBody,
        recordDigest: await this.#integrity.digest(
          "cognitive-durable-operation-v2",
          preparedBody as unknown as JsonValue,
        ),
      });
      if (await store.prepareOperation({ operation: prepared }))
        return this.#resumePreparedOperation(request, context, store, prepared);
    }
    throw new PortableAgentErrorV1(
      "STATE_CONFLICT",
      "durable operation reservation attempts exhausted",
    );
  }

  async #resumePreparedOperation(
    request: CognitiveOperationRequestV2,
    context: CognitiveAgentAdapterContextV2,
    store: CognitiveDurableOperationStoreV2,
    prepared: Extract<
      CognitiveDurableOperationRecordV2,
      { readonly status: "prepared" }
    >,
  ): Promise<CognitiveOperationOutcomeV2> {
    const current = await this.#currentSession(request);
    if (
      current.revision !== prepared.expectedSessionRevision ||
      current.stateDigest !== prepared.previousStateDigest
    )
      throw new PortableAgentErrorV1(
        "STATE_CONFLICT",
        "prepared cognitive operation lost its session revision",
      );

    const effectful = COGNITIVE_EFFECTFUL_OPERATION_KINDS_V2.includes(
      request.operation as CognitiveEffectfulOperationKindV2,
    );
    let result: CognitiveOperationResultV2;
    if (effectful) {
      const sink = this.#effectSink;
      if (!sink)
        throw new PortableAgentErrorV1(
          "ADAPTER_INCOMPATIBLE",
          "effect sink is unavailable",
        );
      const invocation = immutable({
        schemaVersion: 2 as const,
        idempotencyKey: prepared.idempotencyKey,
        requestDigest: prepared.requestDigest,
      });
      const recovered = await sink.lookup({ request, invocation }, context);
      if (recovered) {
        result = recovered;
      } else {
        if (context.signal.aborted)
          throw new PortableAgentErrorV1("CONFLICT", "operation aborted");
        // A prepared claim can outlive the authority that created it. Recheck
        // control immediately before starting an effect; reconciliation of an
        // already-applied sink receipt remains allowed without a second effect.
        await this.#authorize(request);
        result = await sink.apply({ request, invocation }, context);
      }
    } else {
      await this.#authorize(request);
      result = await this.#adapter.execute(request, context);
    }
    await this.#validateResult(request, result);
    const outcome = await this.#createOutcome(current, request, result);
    const { recordDigest: _preparedDigest, ...preparedBody } = prepared;
    const appliedBody = {
      ...preparedBody,
      status: "applied" as const,
      journalRevision: 1 as const,
      outcome,
    };
    const applied = immutable({
      ...appliedBody,
      recordDigest: await this.#integrity.digest(
        "cognitive-durable-operation-v2",
        appliedBody as unknown as JsonValue,
      ),
    });
    for (let attempt = 0; attempt < this.#maximumCommitAttempts; attempt += 1) {
      if (
        await store.commitOperation({
          operation: applied,
          expectedOperationRevision: 0,
        })
      )
        return outcome;
      const raced = await store.loadOperation(request);
      if (raced) {
        const validated = await this.#validatedDurableOperation(
          raced,
          request,
          prepared.requestDigest,
          prepared.idempotencyKey,
        );
        if (validated.status === "applied")
          return this.#replayedOutcome(request, validated.outcome);
      }
    }
    throw new PortableAgentErrorV1(
      "STATE_CONFLICT",
      "durable operation commit attempts exhausted",
    );
  }

  async #createOutcome(
    current: CognitiveSessionStateV2,
    request: CognitiveOperationRequestV2,
    result: CognitiveOperationResultV2,
  ): Promise<CognitiveOperationOutcomeV2> {
    const receiptBody = {
      schemaVersion: 2 as const,
      operationId: request.operationId,
      operation: request.operation,
      sessionId: request.sessionId,
      agentId: request.agentId,
      revision: current.revision + 1,
      logicalTimeMs: request.logicalTimeMs,
      payloadDigest: request.payloadDigest,
      metadataDigest: request.metadataDigest,
      outputDigest: result.outputDigest,
      authorityDigest: request.authorityDigest,
      roleBindingDigest: request.roleBindingDigest,
      ...(request.controlPlaneDigest === undefined
        ? {}
        : { controlPlaneDigest: request.controlPlaneDigest }),
      implementationId: this.#adapter.manifest.implementationId,
      status: result.status,
      reasonCode: result.reasonCode,
      controlSurface: result.controlSurface,
      previousStateDigest: current.stateDigest,
    };
    const receipt = immutable({
      ...receiptBody,
      receiptDigest: await this.#integrity.digest(
        "cognitive-operation-receipt-v2",
        receiptBody as unknown as JsonValue,
      ),
    });
    const retained = [...current.receipts, receipt].slice(
      -this.#adapter.manifest.maximumReceiptHistory,
    );
    const stateBody = {
      ...current,
      revision: current.revision + 1,
      logicalTimeHighWaterMs: request.logicalTimeMs,
      receipts: retained,
    };
    const { stateDigest: _priorDigest, ...digestable } = stateBody;
    const state = immutable({
      ...stateBody,
      stateDigest: await this.#integrity.digest(
        "cognitive-session-state-v2",
        digestable as unknown as JsonValue,
      ),
    });
    return immutable({ result, receipt, state });
  }

  async #currentSession(
    request: CognitiveOperationRequestV2,
  ): Promise<CognitiveSessionStateV2> {
    const current = await this.getSession(request.sessionId);
    if (!current)
      throw new PortableAgentErrorV1("NOT_FOUND", "session not found");
    this.#assertBinding(current, request);
    return current;
  }

  async #replayedOutcome(
    request: CognitiveOperationRequestV2,
    outcome: CognitiveOperationOutcomeV2,
  ): Promise<CognitiveOperationOutcomeV2> {
    const current = await this.#currentSession(request);
    if (
      current.revision < outcome.state.revision ||
      (current.revision === outcome.state.revision &&
        current.stateDigest !== outcome.state.stateDigest)
    )
      throw new PortableAgentErrorV1(
        "STATE_INVALID",
        "durable cognitive operation and session state diverged",
      );
    return outcome;
  }

  #assertRequestPosition(
    current: CognitiveSessionStateV2,
    request: CognitiveOperationRequestV2,
  ): void {
    if (current.revision !== request.expectedRevision)
      throw new PortableAgentErrorV1(
        "STATE_CONFLICT",
        "session revision conflict",
      );
    if (request.logicalTimeMs < current.logicalTimeHighWaterMs)
      invalid("operation logical time is below the session high-water mark");
  }

  async #authorize(request: CognitiveOperationRequestV2): Promise<void> {
    const authorization = await this.#guard.authorize({
      manifest: this.#adapter.manifest,
      request,
    });
    if (!authorization.allowed)
      throw new PortableAgentErrorV1(
        "CONTROL_DENIED",
        `cognitive operation denied: ${authorization.reasonCode}`,
      );
  }

  async #requestDigest(request: CognitiveOperationRequestV2): Promise<string> {
    const body = {
      schemaVersion: request.schemaVersion,
      operationId: request.operationId,
      operation: request.operation,
      tenantId: request.tenantId,
      sessionId: request.sessionId,
      agentId: request.agentId,
      expectedRevision: request.expectedRevision,
      logicalTimeMs: request.logicalTimeMs,
      payloadDigest: request.payloadDigest,
      metadataDigest: request.metadataDigest,
      authorityDigest: request.authorityDigest,
      roleBindingDigest: request.roleBindingDigest,
      ...(request.controlPlaneDigest === undefined
        ? {}
        : { controlPlaneDigest: request.controlPlaneDigest }),
    };
    return this.#integrity.digest(
      "cognitive-operation-request-v2",
      body as unknown as JsonValue,
    );
  }

  async #validatedDurableOperation(
    input: CognitiveDurableOperationRecordV2,
    request: CognitiveOperationRequestV2,
    requestDigest: string,
    idempotencyKey: string,
  ): Promise<CognitiveDurableOperationRecordV2> {
    if (!input || input.schemaVersion !== 2)
      invalid("durable cognitive operation schema is invalid");
    exactKeys(
      input,
      [
        "adapterId",
        "adapterVersion",
        "agentId",
        "expectedSessionRevision",
        "idempotencyKey",
        "implementationId",
        "journalRevision",
        "operation",
        "operationId",
        "outcome",
        "preparedAtLogicalMs",
        "previousStateDigest",
        "recordDigest",
        "requestDigest",
        "schemaVersion",
        "sessionId",
        "status",
        "tenantId",
      ],
      "durable cognitive operation",
    );
    identifier(input.tenantId, "operation.tenantId");
    identifier(input.sessionId, "operation.sessionId");
    identifier(input.agentId, "operation.agentId");
    identifier(input.operationId, "operation.operationId");
    identifier(input.adapterId, "operation.adapterId");
    token(input.adapterVersion, "operation.adapterVersion", 128);
    identifier(input.implementationId, "operation.implementationId");
    if (!COGNITIVE_OPERATION_KINDS_V2.includes(input.operation))
      invalid("durable cognitive operation kind is invalid");
    digest(input.requestDigest, "operation.requestDigest");
    digest(input.idempotencyKey, "operation.idempotencyKey");
    digest(input.previousStateDigest, "operation.previousStateDigest");
    digest(input.recordDigest, "operation.recordDigest");
    boundedInteger(
      input.expectedSessionRevision,
      "operation.expectedSessionRevision",
      0,
      1_000_000_000,
    );
    boundedInteger(
      input.preparedAtLogicalMs,
      "operation.preparedAtLogicalMs",
      0,
      Number.MAX_SAFE_INTEGER,
    );
    const { recordDigest, ...body } = input;
    if (
      (await this.#integrity.digest(
        "cognitive-durable-operation-v2",
        body as unknown as JsonValue,
      )) !== recordDigest
    )
      invalid("durable cognitive operation digest is invalid");
    if (
      input.tenantId !== request.tenantId ||
      input.sessionId !== request.sessionId ||
      input.operationId !== request.operationId ||
      input.adapterId !== this.#adapter.manifest.adapterId ||
      input.adapterVersion !== this.#adapter.manifest.adapterVersion ||
      input.implementationId !== this.#adapter.manifest.implementationId ||
      input.idempotencyKey !== idempotencyKey
    )
      invalid("durable cognitive operation binding is invalid");
    if (input.requestDigest !== requestDigest)
      throw new PortableAgentErrorV1(
        "STATE_CONFLICT",
        "operation identifier request digest conflicts with its reservation",
      );
    if (
      input.agentId !== request.agentId ||
      input.operation !== request.operation ||
      input.expectedSessionRevision !== request.expectedRevision ||
      input.preparedAtLogicalMs !== request.logicalTimeMs
    )
      invalid("durable cognitive operation request binding is invalid");
    if (input.status === "prepared") {
      if (input.journalRevision !== 0 || input.outcome !== null)
        invalid("prepared cognitive operation state is invalid");
      return immutable(input);
    }
    if (
      input.status !== "applied" ||
      input.journalRevision !== 1 ||
      !input.outcome
    )
      invalid("applied cognitive operation state is invalid");
    exactKeys(
      input.outcome,
      ["receipt", "result", "state"],
      "durable cognitive operation outcome",
    );
    await this.#validateResult(request, input.outcome.result);
    const state = await validateCognitiveSessionStateV2(
      input.outcome.state,
      this.#integrity,
      this.#adapter.manifest.maximumReceiptHistory,
    );
    this.#assertBinding(state, request);
    const receipt = input.outcome.receipt;
    if (!receipt || receipt.schemaVersion !== 2)
      invalid("durable cognitive operation receipt is invalid");
    const { receiptDigest, ...receiptBody } = receipt;
    if (
      (await this.#integrity.digest(
        "cognitive-operation-receipt-v2",
        receiptBody as unknown as JsonValue,
      )) !== receiptDigest
    )
      invalid("durable cognitive operation receipt digest is invalid");
    const retained = state.receipts.at(-1);
    if (
      receipt.operationId !== request.operationId ||
      receipt.operation !== request.operation ||
      receipt.sessionId !== request.sessionId ||
      receipt.agentId !== request.agentId ||
      receipt.revision !== request.expectedRevision + 1 ||
      receipt.logicalTimeMs !== request.logicalTimeMs ||
      receipt.payloadDigest !== request.payloadDigest ||
      receipt.metadataDigest !== request.metadataDigest ||
      receipt.authorityDigest !== request.authorityDigest ||
      receipt.roleBindingDigest !== request.roleBindingDigest ||
      receipt.controlPlaneDigest !== request.controlPlaneDigest ||
      receipt.implementationId !== this.#adapter.manifest.implementationId ||
      receipt.outputDigest !== input.outcome.result.outputDigest ||
      receipt.status !== input.outcome.result.status ||
      receipt.reasonCode !== input.outcome.result.reasonCode ||
      receipt.controlSurface !== input.outcome.result.controlSurface ||
      receipt.previousStateDigest !== input.previousStateDigest ||
      state.revision !== request.expectedRevision + 1 ||
      retained?.receiptDigest !== receipt.receiptDigest
    )
      invalid("applied cognitive operation outcome binding is invalid");
    return immutable(input);
  }

  async #validateRequest(
    request: CognitiveOperationRequestV2,
  ): Promise<CognitiveOperationRequestV2> {
    if (!request || request.schemaVersion !== 2)
      invalid("request schema is invalid");
    exactKeys(
      request,
      [
        "agentId",
        "authorityDigest",
        ...(request.controlPlaneDigest === undefined
          ? []
          : ["controlPlaneDigest"]),
        "expectedRevision",
        "logicalTimeMs",
        "metadata",
        "metadataDigest",
        "operation",
        "operationId",
        "payload",
        "payloadDigest",
        "roleBindingDigest",
        "schemaVersion",
        "sessionId",
        "tenantId",
      ],
      "cognitive operation request",
    );
    identifier(request.operationId, "operationId");
    identifier(request.tenantId, "tenantId");
    identifier(request.sessionId, "sessionId");
    identifier(request.agentId, "agentId");
    digest(request.payloadDigest, "payloadDigest");
    digest(request.metadataDigest, "metadataDigest");
    digest(request.authorityDigest, "authorityDigest");
    digest(request.roleBindingDigest, "roleBindingDigest");
    if (request.controlPlaneDigest !== undefined)
      digest(request.controlPlaneDigest, "controlPlaneDigest");
    boundedInteger(
      request.expectedRevision,
      "expectedRevision",
      0,
      1_000_000_000,
    );
    boundedInteger(
      request.logicalTimeMs,
      "logicalTimeMs",
      0,
      Number.MAX_SAFE_INTEGER,
    );
    if (!COGNITIVE_OPERATION_KINDS_V2.includes(request.operation))
      invalid("operation kind is unsupported");
    if (!this.#adapter.manifest.operations.includes(request.operation))
      throw new PortableAgentErrorV1(
        "ADAPTER_INCOMPATIBLE",
        `adapter does not implement ${request.operation}`,
      );
    const encoded = `${canonicalJson(request.payload)}${canonicalJson(request.metadata)}`;
    if (
      new TextEncoder().encode(encoded).byteLength >
      this.#adapter.manifest.maximumOperationBytes
    )
      invalid("operation payload exceeds adapter limit");
    const actual = await this.#integrity.digest(
      "cognitive-operation-payload-v2",
      request.payload,
    );
    if (actual !== request.payloadDigest)
      invalid("operation payload digest mismatch");
    const actualMetadata = await this.#integrity.digest(
      "cognitive-operation-metadata-v2",
      request.metadata,
    );
    if (actualMetadata !== request.metadataDigest)
      invalid("operation metadata digest mismatch");
    return immutable(request);
  }

  async #validateResult(
    request: CognitiveOperationRequestV2,
    result: CognitiveOperationResultV2,
  ): Promise<void> {
    if (
      !result ||
      result.schemaVersion !== 2 ||
      result.operationId !== request.operationId
    )
      invalid("adapter returned an invalid cognitive result");
    exactKeys(
      result,
      [
        "controlSurface",
        "operationId",
        "output",
        "outputDigest",
        "reasonCode",
        "schemaVersion",
        "status",
      ],
      "cognitive operation result",
    );
    if (
      !["completed", "refused", "abstained", "failed"].includes(result.status)
    )
      invalid("cognitive result status is invalid");
    token(result.reasonCode, "reasonCode", 160);
    digest(result.outputDigest, "outputDigest");
    if (
      result.controlSurface !== null &&
      !this.#adapter.manifest.controlSurfaces.includes(result.controlSurface)
    )
      invalid("adapter returned an undeclared control surface");
    if (
      new TextEncoder().encode(canonicalJson(result.output)).byteLength >
      this.#adapter.manifest.maximumResultBytes
    )
      invalid("cognitive result exceeds adapter limit");
    const actual = await this.#integrity.digest(
      "cognitive-operation-output-v2",
      result.output,
    );
    if (actual !== result.outputDigest)
      invalid("cognitive result digest mismatch");
  }

  #assertBinding(
    state: CognitiveSessionStateV2,
    request: CognitiveOperationRequestV2,
  ): void {
    const manifest = this.#adapter.manifest;
    if (
      state.tenantId !== request.tenantId ||
      state.agentId !== request.agentId ||
      state.adapterId !== manifest.adapterId ||
      state.adapterVersion !== manifest.adapterVersion ||
      state.implementationId !== manifest.implementationId
    )
      invalid("cognitive session binding mismatch");
  }
}

export async function validateCognitiveSessionStateV2(
  input: CognitiveSessionStateV2,
  integrity: CognitiveIntegrityV2,
  maximumReceiptHistory: number,
): Promise<CognitiveSessionStateV2> {
  if (!input || input.schemaVersion !== 2)
    invalid("cognitive session state schema is invalid");
  if (!integrity || typeof integrity.digest !== "function")
    invalid("cognitive integrity implementation is required");
  identifier(input.tenantId, "state.tenantId");
  identifier(input.sessionId, "state.sessionId");
  identifier(input.agentId, "state.agentId");
  identifier(input.adapterId, "state.adapterId");
  token(input.adapterVersion, "state.adapterVersion", 128);
  identifier(input.implementationId, "state.implementationId");
  boundedInteger(input.revision, "state.revision", 0, 1_000_000_000);
  boundedInteger(
    input.logicalTimeHighWaterMs,
    "state.logicalTimeHighWaterMs",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  boundedInteger(maximumReceiptHistory, "maximumReceiptHistory", 1, 100_000);
  if (input.receipts.length > maximumReceiptHistory)
    invalid("cognitive receipt retention exceeded");
  const operationIds = new Set<string>();
  let prior: CognitiveOperationReceiptV2 | null = null;
  for (const receipt of input.receipts) {
    if (!receipt || receipt.schemaVersion !== 2)
      invalid("cognitive receipt schema is invalid");
    identifier(receipt.operationId, "receipt.operationId");
    if (operationIds.has(receipt.operationId))
      invalid("cognitive receipt operation is duplicated");
    operationIds.add(receipt.operationId);
    if (!COGNITIVE_OPERATION_KINDS_V2.includes(receipt.operation))
      invalid("cognitive receipt operation is invalid");
    identifier(receipt.sessionId, "receipt.sessionId");
    identifier(receipt.agentId, "receipt.agentId");
    if (
      receipt.sessionId !== input.sessionId ||
      receipt.agentId !== input.agentId
    )
      invalid("cognitive receipt session binding is invalid");
    boundedInteger(receipt.revision, "receipt.revision", 1, input.revision);
    boundedInteger(
      receipt.logicalTimeMs,
      "receipt.logicalTimeMs",
      0,
      input.logicalTimeHighWaterMs,
    );
    for (const [label, value] of Object.entries({
      payloadDigest: receipt.payloadDigest,
      metadataDigest: receipt.metadataDigest,
      outputDigest: receipt.outputDigest,
      authorityDigest: receipt.authorityDigest,
      roleBindingDigest: receipt.roleBindingDigest,
      previousStateDigest: receipt.previousStateDigest,
      receiptDigest: receipt.receiptDigest,
    }))
      digest(value, label);
    if (receipt.controlPlaneDigest !== undefined)
      digest(receipt.controlPlaneDigest, "controlPlaneDigest");
    identifier(receipt.implementationId, "receipt.implementationId");
    if (receipt.implementationId !== input.implementationId)
      invalid("cognitive receipt implementation binding is invalid");
    if (
      !["completed", "refused", "abstained", "failed"].includes(receipt.status)
    )
      invalid("cognitive receipt status is invalid");
    token(receipt.reasonCode, "receipt.reasonCode", 160);
    if (
      receipt.controlSurface !== null &&
      ![
        "context",
        "memory",
        "tool",
        "output",
        "action",
        "representation",
      ].includes(receipt.controlSurface)
    )
      invalid("cognitive receipt control surface is invalid");
    if (
      prior &&
      (receipt.revision !== prior.revision + 1 ||
        receipt.logicalTimeMs < prior.logicalTimeMs)
    )
      invalid("cognitive receipt sequence is invalid");
    const { receiptDigest, ...body } = receipt;
    if (
      (await integrity.digest(
        "cognitive-operation-receipt-v2",
        body as unknown as JsonValue,
      )) !== receiptDigest
    )
      invalid("cognitive receipt digest is invalid");
    prior = receipt;
  }
  if (
    (input.revision === 0) !== (input.receipts.length === 0) ||
    (prior !== null && prior.revision !== input.revision)
  )
    invalid("cognitive session revision and receipts differ");
  const { stateDigest, ...body } = input;
  digest(stateDigest, "stateDigest");
  if (
    (await integrity.digest(
      "cognitive-session-state-v2",
      body as unknown as JsonValue,
    )) !== stateDigest
  )
    invalid("cognitive session state digest is invalid");
  return immutable(input);
}

export async function createCognitiveOperationRequestV2(
  input: Omit<CognitiveOperationRequestV2, "payloadDigest" | "metadataDigest">,
  integrity: CognitiveIntegrityV2 = createWebCryptoCognitiveIntegrityV2(),
): Promise<CognitiveOperationRequestV2> {
  if (!integrity || typeof integrity.digest !== "function")
    invalid("cognitive integrity implementation is required");
  return immutable({
    ...input,
    payloadDigest: await integrity.digest(
      "cognitive-operation-payload-v2",
      input.payload,
    ),
    metadataDigest: await integrity.digest(
      "cognitive-operation-metadata-v2",
      input.metadata,
    ),
  });
}

export function createWebCryptoCognitiveIntegrityV2(): CognitiveIntegrityV2 {
  return Object.freeze({
    async digest(domain: string, value: JsonValue): Promise<string> {
      token(domain, "digest domain", 160);
      if (!globalThis.crypto?.subtle)
        throw new PortableAgentErrorV1(
          "ADAPTER_INCOMPATIBLE",
          "Web Crypto SHA-256 is unavailable",
        );
      const material = new TextEncoder().encode(
        `${domain}\u0000${canonicalJson(value)}`,
      );
      const hashed = await globalThis.crypto.subtle.digest("SHA-256", material);
      return `sha256:${[...new Uint8Array(hashed)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("")}`;
    },
  });
}

function validateManifest(manifest: CognitiveAgentAdapterManifestV2): void {
  if (!manifest || manifest.schemaVersion !== 2)
    invalid("cognitive manifest is invalid");
  identifier(manifest.adapterId, "adapterId");
  token(manifest.adapterVersion, "adapterVersion", 128);
  identifier(manifest.implementationId, "implementationId");
  normalizeAdapterManifestV1(manifest.portable);
  if (
    manifest.portable.adapterId !== manifest.adapterId ||
    manifest.portable.adapterVersion !== manifest.adapterVersion ||
    manifest.portable.implementationId !== manifest.implementationId
  )
    invalid(
      "portable and cognitive manifests are not bound to one implementation",
    );
  canonicalUnique(
    manifest.operations,
    COGNITIVE_OPERATION_KINDS_V2,
    "operations",
  );
  canonicalUnique(
    manifest.controlSurfaces,
    [
      "context",
      "memory",
      "tool",
      "output",
      "action",
      "representation",
    ] as const,
    "controlSurfaces",
  );
  boundedInteger(
    manifest.maximumOperationBytes,
    "maximumOperationBytes",
    1_024,
    67_108_864,
  );
  boundedInteger(
    manifest.maximumResultBytes,
    "maximumResultBytes",
    1_024,
    67_108_864,
  );
  boundedInteger(
    manifest.maximumReceiptHistory,
    "maximumReceiptHistory",
    1,
    100_000,
  );
  if (
    typeof manifest.supportsBlackBoxControl !== "boolean" ||
    typeof manifest.supportsRepresentationControl !== "boolean" ||
    typeof manifest.supportsMultimodalState !== "boolean"
  )
    invalid("cognitive manifest support flags are invalid");
  if (
    manifest.supportsBlackBoxControl &&
    !manifest.controlSurfaces.some((item) =>
      ["context", "memory", "tool"].includes(item),
    )
  )
    invalid("black-box control requires a declared black-box surface");
  if (
    manifest.supportsRepresentationControl &&
    !manifest.controlSurfaces.includes("representation")
  )
    invalid("representation control requires the representation surface");
}

function canonicalUnique<T extends string>(
  values: readonly T[],
  allowed: readonly T[],
  label: string,
): void {
  if (
    !Array.isArray(values) ||
    values.length === 0 ||
    values.length > allowed.length
  )
    invalid(`${label} are invalid`);
  const normalized = [...new Set(values)].sort();
  if (
    normalized.length !== values.length ||
    normalized.some((value, index) => value !== values[index]) ||
    normalized.some((value) => !allowed.includes(value))
  )
    invalid(`${label} must be canonical, unique and supported`);
}

function identifier(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,239}$/.test(value)
  )
    invalid(`${label} is invalid`);
}

function token(
  value: unknown,
  label: string,
  maximum: number,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximum ||
    /[\u0000-\u001f]/u.test(value)
  )
    invalid(`${label} is invalid`);
}

function digest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value))
    invalid(`${label} must be a SHA-256 digest`);
}

function boundedInteger(
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
    invalid(`${label} is outside its supported range`);
  return value as number;
}

function exactKeys(
  value: object,
  keys: readonly string[],
  label: string,
): void {
  if (
    Object.keys(value).sort().join("\u0000") !== [...keys].sort().join("\u0000")
  )
    invalid(`${label} has unsupported fields`);
}

function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function durableOperationStore(
  value: CognitiveSessionStateStoreV2,
): value is CognitiveDurableOperationStoreV2 {
  const candidate = value as Partial<CognitiveDurableOperationStoreV2>;
  return (
    typeof candidate.loadOperation === "function" &&
    typeof candidate.prepareOperation === "function" &&
    typeof candidate.commitOperation === "function"
  );
}

function durableOperationKey(
  tenantId: AgentPlatID,
  sessionId: AgentPlatID,
  operationId: AgentPlatID,
): string {
  return `${tenantId}\u0000${sessionId}\u0000${operationId}`;
}

function durableRevisionKey(
  tenantId: AgentPlatID,
  sessionId: AgentPlatID,
  revision: number,
): string {
  return `${tenantId}\u0000${sessionId}\u0000${revision}`;
}

function sameDurableOperationIdentity(
  prepared: Extract<
    CognitiveDurableOperationRecordV2,
    { readonly status: "prepared" }
  >,
  applied: Extract<
    CognitiveDurableOperationRecordV2,
    { readonly status: "applied" }
  >,
): boolean {
  return (
    prepared.tenantId === applied.tenantId &&
    prepared.sessionId === applied.sessionId &&
    prepared.agentId === applied.agentId &&
    prepared.operationId === applied.operationId &&
    prepared.operation === applied.operation &&
    prepared.adapterId === applied.adapterId &&
    prepared.adapterVersion === applied.adapterVersion &&
    prepared.implementationId === applied.implementationId &&
    prepared.requestDigest === applied.requestDigest &&
    prepared.idempotencyKey === applied.idempotencyKey &&
    prepared.expectedSessionRevision === applied.expectedSessionRevision &&
    prepared.previousStateDigest === applied.previousStateDigest &&
    prepared.preparedAtLogicalMs === applied.preparedAtLogicalMs
  );
}

function immutable<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value as Record<string, unknown>))
      deepFreeze(item);
  }
  return value;
}

function invalid(message: string): never {
  throw new PortableAgentErrorV1("STATE_INVALID", message);
}
