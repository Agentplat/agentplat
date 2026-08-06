import type { JsonValue } from "@agentplat/core";

import { validateContextEntryV1 } from "./context.js";
import {
  CONTEXT_INTEGRITY_SCHEMA_VERSION_V1,
  type ContextIntegrityFilterBindingV1,
  type ContextIntegrityItemV1,
  type ContextIntegrityMemoryTierV1,
  type ContextIntegrityPortV1,
  type ContextIntegrityScopeV1,
  type ContextIntegritySourceZoneV1,
} from "./context-integrity-contracts.js";
import {
  createContextIntegrityEphemeralContentV1,
  createContextIntegrityFilterBindingV1,
  createContextIntegrityItemV1,
  createContextIntegrityRequestV1,
  digestContextIntegrityJsonV1,
  validateContextIntegrityDecisionV1,
} from "./context-integrity-runtime.js";
import type {
  ControlledModelContextGateResultV1,
  ControlledModelContextGateV1,
  ControlledModelRequestV1,
} from "./model.js";
import type { ContextEntryV1, ContextZoneV1 } from "./types.js";
import {
  assertDigest,
  assertIdentifier,
  assertSafeInteger,
  deepFreeze,
} from "./validation.js";

export interface ContextIntegrityModelClassificationV1 {
  readonly memoryTier: ContextIntegrityMemoryTierV1;
  readonly claimKeyDigest: string | null;
  readonly claimValueDigest: string | null;
  readonly corroborationGroupIds: readonly string[];
}

export interface ContextIntegrityControlledModelGateOptionsV1 {
  readonly controller: ContextIntegrityPortV1;
  readonly filterId: string;
  readonly filterVersion: number;
  readonly filterImplementationDigest: string;
  readonly itemTtlMs: number;
  readonly logicalTimeMs: (request: ControlledModelRequestV1) => number;
  readonly scope?: (
    request: ControlledModelRequestV1,
  ) => ContextIntegrityScopeV1;
  readonly stateKey?: (
    request: ControlledModelRequestV1,
    scope: ContextIntegrityScopeV1,
  ) => string;
  readonly classify?: (
    entry: ContextEntryV1,
  ) => ContextIntegrityModelClassificationV1;
}

export interface ContextIntegrityControlledModelGateV1 extends ControlledModelContextGateV1 {
  readonly filterBinding: ContextIntegrityFilterBindingV1;
}

export function createContextIntegrityControlledModelGateV1(
  options: ContextIntegrityControlledModelGateOptionsV1,
): ContextIntegrityControlledModelGateV1 {
  if (!options || typeof options !== "object")
    fail("context_integrity_model_gate_options_required");
  const controller = normalizeController(options.controller);
  if (typeof options.logicalTimeMs !== "function")
    fail("context_integrity_logical_time_resolver_required");
  if (options.scope !== undefined && typeof options.scope !== "function")
    fail("context_integrity_scope_resolver_invalid");
  if (options.stateKey !== undefined && typeof options.stateKey !== "function")
    fail("context_integrity_state_key_resolver_invalid");
  if (options.classify !== undefined && typeof options.classify !== "function")
    fail("context_integrity_classifier_invalid");
  const itemTtlMs = positive(options.itemTtlMs, "itemTtlMs");
  const filterBinding = createContextIntegrityFilterBindingV1({
    schemaVersion: CONTEXT_INTEGRITY_SCHEMA_VERSION_V1,
    filterId: identifier(options.filterId, "filterId"),
    filterVersion: positive(options.filterVersion, "filterVersion"),
    filterImplementationDigest: digest(
      options.filterImplementationDigest,
      "filterImplementationDigest",
    ),
  });

  return deepFreeze({
    filterBinding,
    filterBindingDigest: filterBinding.filterBindingDigest,
    async evaluate({ request, contextEntries }) {
      if (!Array.isArray(contextEntries))
        fail("context_integrity_context_entries_invalid");
      const logicalTimeMs = nonNegative(
        options.logicalTimeMs(request),
        "logicalTimeMs",
      );
      const scope = options.scope
        ? options.scope(request)
        : defaultScope(request);
      const entries = contextEntries.map(validateContextEntryV1);
      if (
        entries.length !== request.contextEntryIds.length ||
        entries.some(
          (entry, index) =>
            entry.contextEntryId !== request.contextEntryIds[index] ||
            entry.runId !== request.runId ||
            entry.tenantId !== request.tenantId,
        )
      )
        fail("context_integrity_context_entry_binding_invalid");
      const items = entries.map((entry) =>
        itemFromEntry(
          entry,
          options.classify?.(entry) ?? defaultClassification(entry),
          itemTtlMs,
        ),
      );
      const requestIdSeed = deepFreeze({
        checkpoint: "pre_inference",
        scope,
        logicalTimeMs,
        filterBindingDigest: filterBinding.filterBindingDigest,
        itemDigests: items.map(({ itemDigest }) => itemDigest),
      });
      const requestIdDigest = digestContextIntegrityJsonV1(
        "request",
        requestIdSeed as unknown as JsonValue,
      );
      const integrityRequest = createContextIntegrityRequestV1({
        schemaVersion: CONTEXT_INTEGRITY_SCHEMA_VERSION_V1,
        requestId: `context-integrity-request.${requestIdDigest.slice(7)}`,
        checkpoint: "pre_inference",
        targetKind: "context",
        scope,
        logicalTimeMs,
        filterBindingDigest: filterBinding.filterBindingDigest,
        items,
      });
      const stateKey = options.stateKey
        ? identifier(options.stateKey(request, scope), "stateKey")
        : defaultStateKey(scope);
      const decision = validateContextIntegrityDecisionV1({
        decision: await controller.evaluate({
          stateKey,
          request: integrityRequest,
          contents: entries.map((entry) =>
            createContextIntegrityEphemeralContentV1({
              itemId: entry.contextEntryId,
              mediaType: entry.mediaType,
              content: entry.content,
            }),
          ),
        }),
        request: integrityRequest,
        expected: controller,
        logicalTimeMs,
      });
      const admitted = decision.items
        .filter(({ action }) => action === "admit" || action === "restrict")
        .map(({ itemId }) => itemId);
      return deepFreeze({
        disposition: decision.disposition,
        filterRequired: decision.filterRequired,
        admittedContextEntryIds: admitted,
        decisionDigest: decision.decisionDigest,
      } satisfies ControlledModelContextGateResultV1);
    },
  } satisfies ContextIntegrityControlledModelGateV1);
}

function itemFromEntry(
  entry: ContextEntryV1,
  classification: ContextIntegrityModelClassificationV1,
  itemTtlMs: number,
): ContextIntegrityItemV1 {
  const expiresAtLogicalMs = safeAdd(
    entry.createdAtLogicalMs,
    itemTtlMs,
    "context_integrity_item_expiry_overflow",
  );
  return createContextIntegrityItemV1({
    schemaVersion: CONTEXT_INTEGRITY_SCHEMA_VERSION_V1,
    itemId: entry.contextEntryId,
    sourceZone: sourceZoneForContext(entry.zone),
    sourceId: entry.sourceId,
    sourceVersion: entry.sourceVersion,
    sourceRevision: entry.sourceVersion,
    memoryTier: classification.memoryTier,
    contentDigest: entry.contentDigest,
    provenanceDigest: entry.provenanceDigest,
    claimKeyDigest: classification.claimKeyDigest,
    claimValueDigest: classification.claimValueDigest,
    corroborationGroupIds: classification.corroborationGroupIds,
    observedAtLogicalMs: entry.createdAtLogicalMs,
    expiresAtLogicalMs,
  });
}

function defaultClassification(
  entry: ContextEntryV1,
): ContextIntegrityModelClassificationV1 {
  return deepFreeze({
    memoryTier: memoryTierForContext(entry.zone),
    claimKeyDigest: null,
    claimValueDigest: null,
    corroborationGroupIds: [
      digestContextIntegrityJsonV1("projection", {
        sourceKind: entry.sourceKind,
        sourceId: entry.sourceId,
      }),
    ],
  });
}

function defaultScope(
  request: ControlledModelRequestV1,
): ContextIntegrityScopeV1 {
  const agentId = request.scope?.agentId ?? "controlled-model-executor";
  const objectiveId =
    request.scope?.kind === "coordinated"
      ? request.scope.objectiveId
      : request.runId;
  return deepFreeze({
    tenantId: request.tenantId,
    sessionId: request.runId,
    agentId,
    objectiveId,
  });
}

function defaultStateKey(scope: ContextIntegrityScopeV1): string {
  const stateDigest = digestContextIntegrityJsonV1(
    "state",
    scope as unknown as JsonValue,
  );
  return `context-integrity-state.${stateDigest.slice(7)}`;
}

function sourceZoneForContext(
  zone: ContextZoneV1,
): ContextIntegritySourceZoneV1 {
  if (zone === "policy") return "doctrine_trusted";
  if (zone === "objective") return "mission_trusted";
  return zone;
}

function memoryTierForContext(
  zone: ContextZoneV1,
): ContextIntegrityMemoryTierV1 {
  if (zone === "policy") return "doctrine";
  if (zone === "objective") return "mission";
  return zone === "local_trusted" ? "episodic" : "working";
}

function normalizeController(
  input: ContextIntegrityPortV1,
): ContextIntegrityPortV1 {
  if (
    !input ||
    typeof input !== "object" ||
    typeof input.evaluate !== "function" ||
    typeof input.getState !== "function"
  )
    fail("context_integrity_controller_required");
  identifier(input.controllerId, "controller.controllerId");
  positive(input.controllerVersion, "controller.controllerVersion");
  identifier(input.implementationId, "controller.implementationId");
  identifier(input.policyId, "controller.policyId");
  positive(input.policyVersion, "controller.policyVersion");
  digest(input.policyDigest, "controller.policyDigest");
  identifier(input.analyzerId, "controller.analyzerId");
  positive(input.analyzerVersion, "controller.analyzerVersion");
  digest(
    input.analyzerImplementationDigest,
    "controller.analyzerImplementationDigest",
  );
  return input;
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

function safeAdd(left: number, right: number, reason: string): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) fail(reason);
  return result;
}

function fail(message: string): never {
  throw new TypeError(message);
}
