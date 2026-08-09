import type { JsonValue } from "@agentplat/core";
import {
  normalizeAdapterManifestV1,
  type PortableAgentAdapterManifestV1,
  type PortableAgentAdapterV1,
  type PortableAgentCheckpointTransferV1,
  type PortableAgentControlDecisionV1,
  type PortableAgentControlPortV1,
  type PortableAgentControlRequestV1,
  type PortableAgentObservationV1,
  type PortableAgentOutputV1,
  type PortableAgentSourceZoneV1,
} from "@agentplat/runtime/adapter";

import { digestControlJsonV1 } from "./canonical.js";
import {
  CONTEXT_INTEGRITY_SCHEMA_VERSION_V1,
  type ContextIntegrityDecisionV1,
  type ContextIntegrityFilterBindingV1,
  type ContextIntegrityHandoffEnvelopeV1,
  type ContextIntegrityItemV1,
  type ContextIntegrityMemoryTierV1,
  type ContextIntegrityPortV1,
  type ContextIntegrityRequestV1,
  type ContextIntegrityScopeV1,
  type ContextIntegritySourceZoneV1,
  type ContextIntegrityStateV1,
} from "./context-integrity-contracts.js";
import {
  createContextIntegrityEphemeralContentV1,
  createContextIntegrityFilterBindingV1,
  createContextIntegrityItemV1,
  createContextIntegrityRequestV1,
  digestContextIntegrityJsonV1,
  validateContextIntegrityDecisionV1,
} from "./context-integrity-runtime.js";
import {
  assertDigest,
  assertIdentifier,
  assertSafeInteger,
  deepFreeze,
} from "./validation.js";

export interface ContextIntegrityPortableReferenceResolutionV1 {
  readonly content: JsonValue;
  readonly contentDigest: string;
}

export interface ContextIntegrityPortableReferenceResolverV1 {
  resolve(input: {
    readonly reference: NonNullable<
      PortableAgentObservationV1["contentReference"]
    >;
    readonly checkpoint: "pre_step" | "post_output";
    readonly target: PortableAgentControlRequestV1;
  }):
    | Promise<ContextIntegrityPortableReferenceResolutionV1>
    | ContextIntegrityPortableReferenceResolutionV1;
}

export interface ContextIntegrityPortableClassificationV1 {
  readonly memoryTier: ContextIntegrityMemoryTierV1;
  readonly claimKeyDigest: string | null;
  readonly claimValueDigest: string | null;
  readonly corroborationGroupIds: readonly string[];
}

export interface ContextIntegrityPortableScopeV1 {
  readonly tenantId: string;
  readonly sessionId: string;
  readonly agentId: string;
  readonly objectiveId: string;
}

export interface ContextIntegrityPortableAgentBundleOptionsV1 {
  readonly controller: ContextIntegrityPortV1;
  readonly controlId: string;
  readonly controlVersion: number;
  readonly controlImplementationId: string;
  readonly manifest: PortableAgentAdapterManifestV1;
  readonly adapter: PortableAgentAdapterV1;
  readonly wrapperImplementationId: string;
  readonly filterId: string;
  readonly filterVersion: number;
  readonly filterImplementationDigest: string;
  readonly itemTtlMs: number;
  readonly referenceResolver?: ContextIntegrityPortableReferenceResolverV1;
  readonly classify?: (input: {
    readonly itemKind: "observation" | "output" | "action";
    readonly sourceZone: ContextIntegritySourceZoneV1;
    readonly sourceId: string;
    readonly target: PortableAgentControlRequestV1;
  }) => ContextIntegrityPortableClassificationV1;
  readonly stateKey?: (scope: ContextIntegrityPortableScopeV1) => string;
}

export interface ContextIntegrityPortableEvaluationV1 {
  readonly request: ContextIntegrityRequestV1;
  readonly decision: ContextIntegrityDecisionV1;
}

export interface ContextIntegrityPortableAgentControlV1 extends PortableAgentControlPortV1 {
  readonly filterBinding: ContextIntegrityFilterBindingV1;
  readonly adapterBinding: Readonly<{
    readonly adapterId: string;
    readonly adapterVersion: string;
    readonly implementationId: string;
  }>;
  evaluateIntegrity(
    target: PortableAgentControlRequestV1,
  ): Promise<ContextIntegrityPortableEvaluationV1>;
  stateKeyFor(scope: ContextIntegrityPortableScopeV1): string;
  exportHandoff(input: {
    readonly source: ContextIntegrityPortableScopeV1;
    readonly target: ContextIntegrityPortableScopeV1;
    readonly logicalTimeMs: number;
  }): Promise<ContextIntegrityHandoffEnvelopeV1>;
  importHandoff(input: {
    readonly handoff: ContextIntegrityHandoffEnvelopeV1;
    readonly target: ContextIntegrityPortableScopeV1;
    readonly logicalTimeMs: number;
  }): Promise<ContextIntegrityStateV1>;
}

export interface ContextIntegrityPortableAgentBundleV1 {
  readonly manifest: PortableAgentAdapterManifestV1;
  readonly adapter: PortableAgentAdapterV1;
  readonly control: ContextIntegrityPortableAgentControlV1;
  readonly filterBinding: ContextIntegrityFilterBindingV1;
}

export function createContextIntegrityPortableAgentBundleV1(
  options: ContextIntegrityPortableAgentBundleOptionsV1,
): ContextIntegrityPortableAgentBundleV1 {
  if (!options || typeof options !== "object")
    fail("context_integrity_portable_bundle_options_required");
  const controller = normalizeController(options.controller);
  const sourceManifest = normalizeAdapterManifestV1(options.manifest);
  if (!options.adapter || typeof options.adapter.step !== "function")
    fail("context_integrity_portable_adapter_required");
  const wrapperImplementationId = identifier(
    options.wrapperImplementationId,
    "wrapperImplementationId",
  );
  if (wrapperImplementationId === sourceManifest.implementationId)
    fail("context_integrity_wrapper_implementation_must_change");
  const manifest = normalizeAdapterManifestV1({
    ...sourceManifest,
    implementationId: wrapperImplementationId,
  });
  const itemTtlMs = positive(options.itemTtlMs, "itemTtlMs");
  if (
    options.referenceResolver !== undefined &&
    typeof options.referenceResolver.resolve !== "function"
  )
    fail("context_integrity_reference_resolver_invalid");
  if (options.classify !== undefined && typeof options.classify !== "function")
    fail("context_integrity_portable_classifier_invalid");
  if (options.stateKey !== undefined && typeof options.stateKey !== "function")
    fail("context_integrity_portable_state_key_invalid");
  const filterBinding = createContextIntegrityFilterBindingV1({
    schemaVersion: CONTEXT_INTEGRITY_SCHEMA_VERSION_V1,
    filterId: identifier(options.filterId, "filterId"),
    filterVersion: positive(options.filterVersion, "filterVersion"),
    filterImplementationDigest: digest(
      options.filterImplementationDigest,
      "filterImplementationDigest",
    ),
  });
  const control = createPortableControl({
    options,
    controller,
    manifest,
    filterBinding,
    itemTtlMs,
  });
  const adapter = createFilteringAdapter({
    sourceManifest,
    manifest,
    sourceAdapter: options.adapter,
    control,
  });
  return deepFreeze({ manifest, adapter, control, filterBinding });
}

function createPortableControl(input: {
  readonly options: ContextIntegrityPortableAgentBundleOptionsV1;
  readonly controller: ContextIntegrityPortV1;
  readonly manifest: PortableAgentAdapterManifestV1;
  readonly filterBinding: ContextIntegrityFilterBindingV1;
  readonly itemTtlMs: number;
}): ContextIntegrityPortableAgentControlV1 {
  const controlId = identifier(input.options.controlId, "controlId");
  const controlVersion = positive(
    input.options.controlVersion,
    "controlVersion",
  );
  const implementationId = identifier(
    input.options.controlImplementationId,
    "controlImplementationId",
  );
  const adapterBinding = deepFreeze({
    adapterId: input.manifest.adapterId,
    adapterVersion: input.manifest.adapterVersion,
    implementationId: input.manifest.implementationId,
  });
  const stateKeyFor = (scopeInput: ContextIntegrityPortableScopeV1): string => {
    const scope = normalizePortableScope(scopeInput);
    if (input.options.stateKey)
      return identifier(input.options.stateKey(scope), "stateKey");
    const keyDigest = digestContextIntegrityJsonV1(
      "state",
      scope as unknown as JsonValue,
    );
    return `context-integrity-state.${keyDigest.slice(7)}`;
  };

  const evaluateIntegrity = async (
    target: PortableAgentControlRequestV1,
  ): Promise<ContextIntegrityPortableEvaluationV1> => {
    assertPortableBinding(target, input.manifest);
    const mapped = await mapPortableTarget({
      target,
      filterBinding: input.filterBinding,
      itemTtlMs: input.itemTtlMs,
      referenceResolver: input.options.referenceResolver,
      classify: input.options.classify,
    });
    const decision = validateContextIntegrityDecisionV1({
      decision: await input.controller.evaluate({
        stateKey: stateKeyFor(mapped.request.scope),
        request: mapped.request,
        contents: mapped.contents,
      }),
      request: mapped.request,
      expected: input.controller,
      logicalTimeMs: mapped.request.logicalTimeMs,
    });
    return deepFreeze({ request: mapped.request, decision });
  };

  return deepFreeze({
    controlId,
    controlVersion,
    implementationId,
    filterBinding: input.filterBinding,
    adapterBinding,
    async evaluate(target) {
      try {
        const { decision } = await evaluateIntegrity(target);
        if (decision.disposition === "allow")
          return allow(
            decision.filterRequired
              ? "context_integrity_filter_authorized"
              : "context_integrity_allowed",
          );
        return deepFreeze({
          disposition: decision.disposition,
          reasonCode:
            decision.disposition === "deny"
              ? "context_integrity_denied"
              : "context_integrity_abstained",
        });
      } catch {
        return deny("context_integrity_control_unavailable");
      }
    },
    evaluateIntegrity,
    stateKeyFor,
    exportHandoff({ source, target, logicalTimeMs }) {
      return input.controller.exportHandoff({
        sourceStateKey: stateKeyFor(source),
        targetStateKey: stateKeyFor(target),
        logicalTimeMs,
      });
    },
    importHandoff({ handoff, target, logicalTimeMs }) {
      const targetStateKey = stateKeyFor(target);
      return input.controller.importHandoff({
        handoff,
        targetStateKey,
        logicalTimeMs,
      });
    },
  } satisfies ContextIntegrityPortableAgentControlV1);
}

async function mapPortableTarget(input: {
  readonly target: PortableAgentControlRequestV1;
  readonly filterBinding: ContextIntegrityFilterBindingV1;
  readonly itemTtlMs: number;
  readonly referenceResolver?: ContextIntegrityPortableReferenceResolverV1;
  readonly classify?: ContextIntegrityPortableAgentBundleOptionsV1["classify"];
}): Promise<{
  readonly request: ContextIntegrityRequestV1;
  readonly contents: readonly ReturnType<
    typeof createContextIntegrityEphemeralContentV1
  >[];
}> {
  const { target } = input;
  const logicalTimeMs = nonNegative(
    target.request.logicalTimeMs,
    "request.logicalTimeMs",
  );
  const scope = normalizePortableScope({
    tenantId: target.tenantId,
    sessionId: target.sessionId,
    agentId: target.agentId,
    objectiveId: target.role.objectiveId,
  });
  const mapped: Array<{
    readonly item: ContextIntegrityItemV1;
    readonly content: ReturnType<
      typeof createContextIntegrityEphemeralContentV1
    >;
  }> = [];
  if (target.checkpoint === "pre_step") {
    for (const observation of target.request.observations) {
      const value = await portableContent({
        inline: observation.content,
        reference: observation.contentReference,
        resolver: input.referenceResolver,
        checkpoint: "pre_step",
        target,
      });
      const content = createContextIntegrityEphemeralContentV1({
        itemId: observation.observationId,
        mediaType: typeof value === "string" ? "text" : "json",
        content: value,
      });
      const sourceZone = sourceZoneForPortable(observation.sourceZone);
      mapped.push({
        content,
        item: itemForPortableTarget({
          itemId: observation.observationId,
          sourceZone,
          sourceId: observation.sourceId,
          sourceRevision: observation.observedAtLogicalMs,
          observedAtLogicalMs: observation.observedAtLogicalMs,
          provenanceDigest: digestControlJsonV1("provenance", {
            sourceZone: observation.sourceZone,
            sourceId: observation.sourceId,
            provenance: observation.provenance,
            contentReference: observation.contentReference,
          } as unknown as JsonValue),
          content,
          classification:
            input.classify?.({
              itemKind: "observation",
              sourceZone,
              sourceId: observation.sourceId,
              target,
            }) ??
            defaultPortableClassification(sourceZone, observation.sourceId),
          itemTtlMs: input.itemTtlMs,
        }),
      });
    }
  } else if (target.checkpoint === "post_output") {
    if (!target.output) fail("context_integrity_output_missing");
    const value = await portableContent({
      inline: target.output.content,
      reference: target.output.contentReference,
      resolver: input.referenceResolver,
      checkpoint: "post_output",
      target,
    });
    const content = createContextIntegrityEphemeralContentV1({
      itemId: target.output.outputId,
      mediaType: typeof value === "string" ? "text" : "json",
      content: value,
    });
    const sourceZone = "provider_untrusted" as const;
    mapped.push({
      content,
      item: itemForPortableTarget({
        itemId: target.output.outputId,
        sourceZone,
        sourceId: target.manifest.adapterId,
        sourceRevision: target.stepSequence,
        observedAtLogicalMs: logicalTimeMs,
        provenanceDigest: digestControlJsonV1("provenance", {
          adapterId: target.manifest.adapterId,
          adapterVersion: target.manifest.adapterVersion,
          implementationId: target.manifest.implementationId,
          metadata: target.output.metadata,
          contentReference: target.output.contentReference,
        } as unknown as JsonValue),
        content,
        classification:
          input.classify?.({
            itemKind: "output",
            sourceZone,
            sourceId: target.manifest.adapterId,
            target,
          }) ??
          defaultPortableClassification(sourceZone, target.manifest.adapterId),
        itemTtlMs: input.itemTtlMs,
      }),
    });
  } else {
    if (!target.actionProposal) fail("context_integrity_action_missing");
    const content = createContextIntegrityEphemeralContentV1({
      itemId: target.actionProposal.actionId,
      mediaType: "json",
      content: target.actionProposal.input,
    });
    const sourceZone = "provider_untrusted" as const;
    mapped.push({
      content,
      item: itemForPortableTarget({
        itemId: target.actionProposal.actionId,
        sourceZone,
        sourceId: target.manifest.adapterId,
        sourceRevision: target.stepSequence,
        observedAtLogicalMs: logicalTimeMs,
        provenanceDigest: digestControlJsonV1("provenance", {
          adapterId: target.manifest.adapterId,
          adapterVersion: target.manifest.adapterVersion,
          implementationId: target.manifest.implementationId,
          actionClass: target.actionProposal.actionClass,
          riskClass: target.actionProposal.riskClass,
          metadata: target.actionProposal.metadata,
        } as unknown as JsonValue),
        content,
        classification:
          input.classify?.({
            itemKind: "action",
            sourceZone,
            sourceId: target.manifest.adapterId,
            target,
          }) ??
          defaultPortableClassification(sourceZone, target.manifest.adapterId),
        itemTtlMs: input.itemTtlMs,
      }),
    });
  }
  const checkpoint =
    target.checkpoint === "pre_step"
      ? "pre_step"
      : target.checkpoint === "post_output"
        ? "post_output"
        : "pre_action";
  const targetKind =
    checkpoint === "pre_step"
      ? "context"
      : checkpoint === "post_output"
        ? "output"
        : "action";
  const filterBindingDigest =
    checkpoint === "pre_step" ? input.filterBinding.filterBindingDigest : null;
  const requestSeed = deepFreeze({
    checkpoint,
    stepSequence: target.stepSequence,
    checkpointItemIndex: target.checkpointItemIndex ?? 0,
    targetKind,
    scope,
    logicalTimeMs,
    filterBindingDigest,
    itemDigests: mapped.map(({ item }) => item.itemDigest),
  });
  const requestIdDigest = digestContextIntegrityJsonV1(
    "request",
    requestSeed as unknown as JsonValue,
  );
  return deepFreeze({
    request: createContextIntegrityRequestV1({
      schemaVersion: CONTEXT_INTEGRITY_SCHEMA_VERSION_V1,
      requestId: `context-integrity-request.${requestIdDigest.slice(7)}`,
      checkpoint,
      targetKind,
      scope,
      logicalTimeMs,
      filterBindingDigest,
      items: mapped.map(({ item }) => item),
    }),
    contents: mapped.map(({ content }) => content),
  });
}

function itemForPortableTarget(input: {
  readonly itemId: string;
  readonly sourceZone: ContextIntegritySourceZoneV1;
  readonly sourceId: string;
  readonly sourceRevision: number;
  readonly observedAtLogicalMs: number;
  readonly provenanceDigest: string;
  readonly content: ReturnType<typeof createContextIntegrityEphemeralContentV1>;
  readonly classification: ContextIntegrityPortableClassificationV1;
  readonly itemTtlMs: number;
}): ContextIntegrityItemV1 {
  return createContextIntegrityItemV1({
    schemaVersion: CONTEXT_INTEGRITY_SCHEMA_VERSION_V1,
    itemId: input.itemId,
    sourceZone: input.sourceZone,
    sourceId: input.sourceId,
    sourceVersion: 1,
    sourceRevision: input.sourceRevision,
    memoryTier: input.classification.memoryTier,
    contentDigest: input.content.contentDigest,
    provenanceDigest: input.provenanceDigest,
    claimKeyDigest: input.classification.claimKeyDigest,
    claimValueDigest: input.classification.claimValueDigest,
    corroborationGroupIds: input.classification.corroborationGroupIds,
    observedAtLogicalMs: input.observedAtLogicalMs,
    expiresAtLogicalMs: safeAdd(
      input.observedAtLogicalMs,
      input.itemTtlMs,
      "context_integrity_item_expiry_overflow",
    ),
  });
}

async function portableContent(input: {
  readonly inline: JsonValue | null;
  readonly reference: PortableAgentObservationV1["contentReference"];
  readonly resolver?: ContextIntegrityPortableReferenceResolverV1;
  readonly checkpoint: "pre_step" | "post_output";
  readonly target: PortableAgentControlRequestV1;
}): Promise<JsonValue> {
  if (input.inline !== null) return input.inline;
  if (!input.reference || !input.resolver)
    fail("context_integrity_referenced_content_unavailable");
  const resolved = await input.resolver.resolve({
    reference: input.reference,
    checkpoint: input.checkpoint,
    target: input.target,
  });
  if (
    !resolved ||
    typeof resolved !== "object" ||
    resolved.contentDigest !== input.reference.contentDigest
  )
    fail("context_integrity_referenced_content_binding_invalid");
  digest(resolved.contentDigest, "resolved.contentDigest");
  return resolved.content;
}

function createFilteringAdapter(input: {
  readonly sourceManifest: PortableAgentAdapterManifestV1;
  readonly manifest: PortableAgentAdapterManifestV1;
  readonly sourceAdapter: PortableAgentAdapterV1;
  readonly control: ContextIntegrityPortableAgentControlV1;
}): PortableAgentAdapterV1 {
  const adapter: PortableAgentAdapterV1 = {
    async step(stepInput, context) {
      const target: PortableAgentControlRequestV1 = {
        schemaVersion: 1,
        checkpoint: "pre_step",
        stepSequence: stepInput.stepSequence,
        manifest: input.manifest,
        sessionId: stepInput.sessionId,
        tenantId: stepInput.tenantId,
        agentId: stepInput.agentId,
        role: stepInput.role,
        request: stepInput.request,
        output: null,
        actionProposal: null,
      };
      const { decision } = await input.control.evaluateIntegrity(target);
      if (decision.disposition !== "allow")
        fail(`context_integrity_${decision.disposition}`);
      const admittedIds = new Set(
        decision.items
          .filter(({ action }) => action === "admit" || action === "restrict")
          .map(({ itemId }) => itemId),
      );
      const filteredObservations = stepInput.request.observations.filter(
        ({ observationId }) => admittedIds.has(observationId),
      );
      if (
        !decision.filterRequired &&
        filteredObservations.length !== stepInput.request.observations.length
      )
        fail("context_integrity_filter_binding_invalid");
      const result = await input.sourceAdapter.step(
        {
          ...stepInput,
          request: deepFreeze({
            ...stepInput.request,
            observations: deepFreeze(filteredObservations),
          }),
          previousCheckpoint: checkpointForImplementation(
            stepInput.previousCheckpoint,
            input.sourceManifest.implementationId,
          ),
        },
        context,
      );
      return deepFreeze({
        ...result,
        checkpoint: checkpointForImplementation(
          result.checkpoint,
          input.manifest.implementationId,
        ),
      });
    },
    ...(input.sourceAdapter.checkpoint
      ? {
          checkpoint: async (checkpointInput, context) =>
            checkpointForImplementation(
              await input.sourceAdapter.checkpoint!(
                {
                  ...checkpointInput,
                  previousCheckpoint: checkpointForImplementation(
                    checkpointInput.previousCheckpoint,
                    input.sourceManifest.implementationId,
                  ),
                },
                context,
              ),
              input.manifest.implementationId,
            )!,
        }
      : {}),
    ...(input.sourceAdapter.restore
      ? {
          restore: async (restoreInput, context) =>
            input.sourceAdapter.restore!(
              {
                ...restoreInput,
                checkpoint: checkpointForImplementation(
                  restoreInput.checkpoint,
                  input.sourceManifest.implementationId,
                )!,
              },
              context,
            ),
        }
      : {}),
    ...(input.sourceAdapter.exportCheckpoint
      ? {
          exportCheckpoint: async (exportInput, context) =>
            input.sourceAdapter.exportCheckpoint!(
              {
                ...exportInput,
                checkpoint: checkpointForImplementation(
                  exportInput.checkpoint,
                  input.sourceManifest.implementationId,
                )!,
              },
              context,
            ),
        }
      : {}),
    ...(input.sourceAdapter.importCheckpoint
      ? {
          importCheckpoint: async (importInput, context) =>
            checkpointForImplementation(
              await input.sourceAdapter.importCheckpoint!(
                {
                  ...importInput,
                  transfer: transferForImplementation(
                    importInput.transfer,
                    input.sourceManifest.implementationId,
                  ),
                },
                context,
              ),
              input.manifest.implementationId,
            )!,
        }
      : {}),
  };
  return adapter;
}

function checkpointForImplementation<T extends { implementationId: string }>(
  checkpoint: T | null,
  implementationId: string,
): T | null {
  return checkpoint === null
    ? null
    : deepFreeze({ ...checkpoint, implementationId } as T);
}

function transferForImplementation(
  transfer: PortableAgentCheckpointTransferV1,
  implementationId: string,
): PortableAgentCheckpointTransferV1 {
  return deepFreeze({
    ...transfer,
    implementationId,
    checkpoint: checkpointForImplementation(
      transfer.checkpoint,
      implementationId,
    )!,
  });
}

function assertPortableBinding(
  target: PortableAgentControlRequestV1,
  manifest: PortableAgentAdapterManifestV1,
): void {
  if (
    !target ||
    target.schemaVersion !== 1 ||
    target.manifest.adapterId !== manifest.adapterId ||
    target.manifest.adapterVersion !== manifest.adapterVersion ||
    target.manifest.implementationId !== manifest.implementationId
  )
    fail("context_integrity_portable_target_binding_invalid");
  identifier(target.sessionId, "target.sessionId");
  identifier(target.tenantId, "target.tenantId");
  identifier(target.agentId, "target.agentId");
  identifier(target.role.objectiveId, "target.role.objectiveId");
  positive(target.stepSequence, "target.stepSequence");
  const checkpointItemIndex = nonNegative(
    target.checkpointItemIndex ?? 0,
    "target.checkpointItemIndex",
  );
  if (
    checkpointItemIndex > 4_095 ||
    (target.checkpoint === "pre_step" && checkpointItemIndex !== 0)
  )
    fail("context_integrity_checkpoint_item_index_invalid");
  nonNegative(target.request.logicalTimeMs, "target.request.logicalTimeMs");
}

function defaultPortableClassification(
  sourceZone: ContextIntegritySourceZoneV1,
  sourceId: string,
): ContextIntegrityPortableClassificationV1 {
  return deepFreeze({
    memoryTier:
      sourceZone === "mission_trusted"
        ? "mission"
        : sourceZone === "local_trusted" || sourceZone === "operator_trusted"
          ? "episodic"
          : "working",
    claimKeyDigest: null,
    claimValueDigest: null,
    corroborationGroupIds: [
      digestContextIntegrityJsonV1("projection", { sourceZone, sourceId }),
    ],
  });
}

function sourceZoneForPortable(
  zone: PortableAgentSourceZoneV1,
): ContextIntegritySourceZoneV1 {
  return zone === "objective_trusted" ? "mission_trusted" : zone;
}

function normalizePortableScope(
  input: ContextIntegrityPortableScopeV1,
): ContextIntegrityScopeV1 {
  return deepFreeze({
    tenantId: identifier(input.tenantId, "scope.tenantId"),
    sessionId: identifier(input.sessionId, "scope.sessionId"),
    agentId: identifier(input.agentId, "scope.agentId"),
    objectiveId: identifier(input.objectiveId, "scope.objectiveId"),
  });
}

function normalizeController(
  input: ContextIntegrityPortV1,
): ContextIntegrityPortV1 {
  if (
    !input ||
    typeof input !== "object" ||
    typeof input.evaluate !== "function" ||
    typeof input.getState !== "function" ||
    typeof input.exportHandoff !== "function" ||
    typeof input.importHandoff !== "function"
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

function allow(reasonCode: string): PortableAgentControlDecisionV1 {
  return deepFreeze({ disposition: "allow", reasonCode });
}

function deny(reasonCode: string): PortableAgentControlDecisionV1 {
  return deepFreeze({ disposition: "deny", reasonCode });
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
