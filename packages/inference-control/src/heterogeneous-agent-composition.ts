import type { JsonValue } from "@agentplat/core";
import {
  PortableAgentAdapterRegistryV1,
  PortableAgentSessionRuntimeV1,
  type PortableAgentAdapterManifestV1,
  type PortableAgentAdapterRequirementsV1,
  type PortableAgentAdapterV1,
  type PortableAgentControlPortV1,
  type PortableAgentControlRequestV1,
  type PortableAgentStateStoreV1,
} from "@agentplat/runtime/adapter";
import type {
  InferenceInterventionAdapterDescriptorV1,
  RepresentationInterventionSidecarPortV1,
} from "./intervention-contracts.js";
import { HeterogeneousInferenceInterventionRuntimeV1 } from "./intervention-runtime.js";
import { assertInferenceInterventionAdapterDescriptorV1 } from "./intervention-validation.js";
import { canonicalizeControlJsonV1 } from "./canonical.js";
import { createCompositePortableAgentControlV1 } from "./portable-agent.js";
import type { RoleAlignmentPortableAgentControlV1 } from "./role-alignment-portable-agent.js";
import type {
  SemanticActionAuthorizationV1,
  SemanticActionEffectReceiptV1,
  SemanticActionEffectSinkV1,
  SemanticControlCheckpointV1,
  SemanticControlDecisionV1,
  SemanticControlEvaluationInputV1,
} from "./semantic-alignment-contracts.js";
import { SemanticAlignmentAgilityRuntimeV1 } from "./semantic-alignment-runtime.js";
import {
  createSemanticControlRequestV1,
  digestSemanticControlV1,
  digestSemanticOperationPayloadV1,
} from "./semantic-alignment-validation.js";
import {
  assertDigest,
  assertIdentifier,
  assertSafeInteger,
  deepFreeze,
} from "./validation.js";

export type HeterogeneousAgentRouteKindV1 =
  "open_weight_representation" | "opaque_api";

export interface HeterogeneousAgentRouteV1 {
  readonly schemaVersion: 1;
  readonly routeId: string;
  readonly routeKind: HeterogeneousAgentRouteKindV1;
  readonly representationAccess: "read_write" | "opaque";
  readonly interventionAdapter: InferenceInterventionAdapterDescriptorV1;
  readonly portableAdapterBindingDigest: string;
  readonly representationSidecarBindingDigest: string | null;
  readonly routeDigest: string;
}

export interface SemanticPortableMaterialBindingV1 {
  readonly materialHandle: string;
  /** Exact content identity that assessors must verify after resolving the handle. */
  readonly materialDigest: string;
  readonly candidateCourseActionDigests: readonly string[];
  readonly selectedCourseActionDigest: string | null;
  readonly modalities: readonly (
    "text" | "image" | "audio" | "video" | "sensor"
  )[];
}

/** Application-owned bridge from portable data to provider-owned semantic material. */
export interface SemanticPortableMaterialPortV1 {
  bind(
    request: PortableAgentControlRequestV1,
  ):
    | SemanticPortableMaterialBindingV1
    | Promise<SemanticPortableMaterialBindingV1>;
}

export interface ComposeHeterogeneousPortableAgentV1 {
  readonly composerId: string;
  readonly composerVersion: number;
  readonly implementationId: string;
  readonly route: HeterogeneousAgentRouteV1;
  readonly manifest: PortableAgentAdapterManifestV1;
  readonly adapter: PortableAgentAdapterV1;
  readonly semanticRuntime: SemanticAlignmentAgilityRuntimeV1;
  readonly semanticMaterial: SemanticPortableMaterialPortV1;
  readonly roleAlignmentControl: RoleAlignmentPortableAgentControlV1;
  readonly interventionControl: BoundHeterogeneousInterventionPortableControlV1;
  /** Inclusive logical-time ceiling accepted for requests in this session. */
  readonly maximumSessionLogicalTimeMs: number;
  readonly stateStore?: PortableAgentStateStoreV1;
  readonly maximumSessionSnapshotBytes?: number;
  readonly clock?: () => Date;
}

export interface BoundHeterogeneousInterventionPortableControlV1 extends PortableAgentControlPortV1 {
  readonly interventionAdapterDescriptorDigest: string;
  readonly representationSidecarBindingDigest: string | null;
  readonly interventionBindingDigest: string;
  readonly interventionPolicyDigest: string;
  readonly maximumStep: number;
}

const boundInterventionControls = new WeakSet<object>();
const PORTABLE_CONTROL_SEQUENCE_STRIDE = 16_384;
const PORTABLE_CONTROL_MAXIMUM_ITEM_INDEX = 4_095;
const PORTABLE_CONTROL_MAXIMUM_ORDINAL = 12_289;

export interface HeterogeneousPortableAgentCompositionV1 {
  readonly route: HeterogeneousAgentRouteV1;
  readonly maximumSessionLogicalTimeMs: number;
  readonly registry: PortableAgentAdapterRegistryV1;
  readonly control: PortableAgentControlPortV1;
  readonly semanticControl: PortableAgentControlPortV1;
  readonly actionGateway: HeterogeneousPortableActionGatewayV1;
  readonly sessionRuntime: PortableAgentSessionRuntimeV1;
  readonly requiredSessionCapabilities: PortableAgentAdapterRequirementsV1;
}

/** Final provider-neutral effect boundary for an allowed portable proposal. */
export interface HeterogeneousPortableActionGatewayV1 {
  dispatch(
    input: {
      readonly request: PortableAgentControlRequestV1;
      /** Must originate from a trusted monotonic logical-time source. */
      readonly currentLogicalTimeMs: number;
    },
    sink: SemanticActionEffectSinkV1,
  ): Promise<{
    readonly authorization: SemanticActionAuthorizationV1;
    readonly effectReceipt: SemanticActionEffectReceiptV1;
  }>;
}

export function createHeterogeneousAgentRouteV1(
  input: Omit<HeterogeneousAgentRouteV1, "routeDigest">,
): HeterogeneousAgentRouteV1 {
  if (input.schemaVersion !== 1)
    throw new TypeError("heterogeneous_route_schema_invalid");
  assertIdentifier(input.routeId, "routeId");
  if (
    !(["open_weight_representation", "opaque_api"] as const).includes(
      input.routeKind,
    )
  )
    throw new TypeError("heterogeneous_route_kind_invalid");
  assertInferenceInterventionAdapterDescriptorV1(input.interventionAdapter);
  assertDigest(
    input.portableAdapterBindingDigest,
    "portableAdapterBindingDigest",
  );
  const capabilities = new Set(input.interventionAdapter.capabilities);
  for (const required of [
    "pre_input_filter",
    "output_gate",
    "action_gate",
  ] as const)
    if (!capabilities.has(required))
      throw new TypeError(`heterogeneous_route_capability_missing:${required}`);
  if (input.routeKind === "open_weight_representation") {
    if (input.interventionAdapter.agentClass === "opaque_api_model")
      throw new TypeError("open_weight_route_agent_class_invalid");
    if (
      input.representationAccess !== "read_write" ||
      !capabilities.has("representation_intervention")
    )
      throw new TypeError(
        "open_weight_route_requires_representation_intervention",
      );
    if (input.representationSidecarBindingDigest === null)
      throw new TypeError("open_weight_route_requires_sidecar_binding");
    assertDigest(
      input.representationSidecarBindingDigest,
      "representationSidecarBindingDigest",
    );
  } else {
    if (
      input.representationAccess !== "opaque" ||
      capabilities.has("representation_intervention")
    )
      throw new TypeError("opaque_route_must_not_claim_representation_access");
    if (input.interventionAdapter.agentClass !== "opaque_api_model")
      throw new TypeError("opaque_route_agent_class_invalid");
    if (input.representationSidecarBindingDigest !== null)
      throw new TypeError("opaque_route_must_not_bind_representation_sidecar");
  }
  const body = deepFreeze({ ...input });
  return deepFreeze({
    ...body,
    routeDigest: digestSemanticControlV1("route", body as unknown as JsonValue),
  });
}

export function composeHeterogeneousPortableAgentV1(
  options: ComposeHeterogeneousPortableAgentV1,
): HeterogeneousPortableAgentCompositionV1 {
  assertIdentifier(options.composerId, "composerId");
  assertSafeInteger(options.composerVersion, "composerVersion", 1);
  assertIdentifier(options.implementationId, "implementationId");
  const expectedRoute = createHeterogeneousAgentRouteV1(
    stripRouteDigest(options.route),
  );
  if (expectedRoute.routeDigest !== options.route.routeDigest)
    throw new TypeError("heterogeneous_route_digest_invalid");
  if (
    options.route.portableAdapterBindingDigest !==
    portableAdapterBindingDigestV1(options.manifest)
  )
    throw new TypeError("heterogeneous_portable_adapter_binding_mismatch");
  if (!(options.semanticRuntime instanceof SemanticAlignmentAgilityRuntimeV1))
    throw new TypeError("semantic_runtime_required");
  if (!options.semanticRuntime.options.actionAuthorization)
    throw new TypeError("semantic_action_authorization_boundary_required");
  assertSafeInteger(
    options.maximumSessionLogicalTimeMs,
    "maximumSessionLogicalTimeMs",
    0,
  );
  if (
    !options.semanticMaterial ||
    typeof options.semanticMaterial.bind !== "function"
  )
    throw new TypeError("semantic_material_port_required");
  for (const [name, control] of [
    ["role_alignment", options.roleAlignmentControl],
    ["intervention", options.interventionControl],
  ] as const) {
    if (!control || typeof control.evaluate !== "function")
      throw new TypeError(`${name}_portable_control_required`);
  }
  const interventionBinding =
    options.interventionControl as BoundHeterogeneousInterventionPortableControlV1;
  if (
    !boundInterventionControls.has(interventionBinding) ||
    interventionBinding.interventionAdapterDescriptorDigest !==
      options.route.interventionAdapter.descriptorDigest ||
    interventionBinding.representationSidecarBindingDigest !==
      options.route.representationSidecarBindingDigest
  )
    throw new TypeError("portable_intervention_control_binding_mismatch");
  if (!options.roleAlignmentControl.binding)
    throw new TypeError("portable_role_alignment_binding_missing");
  assertDigest(
    options.roleAlignmentControl.binding.policyDigest,
    "roleAlignment.policyDigest",
  );
  assertDigest(
    options.roleAlignmentControl.binding.assessorBindingDigest,
    "roleAlignment.assessorBindingDigest",
  );
  const requiredPoints = ["post_output", "pre_action", "pre_step"] as const;
  if (
    requiredPoints.some(
      (point) => !options.manifest.controlPoints.includes(point),
    )
  )
    throw new TypeError("portable_adapter_missing_mandatory_control_point");
  if (
    options.route.routeKind === "opaque_api" &&
    options.manifest.agentKinds.some((kind) => kind === "symbolic")
  )
    throw new TypeError("opaque_api_route_agent_kind_invalid");
  const maximumControlSequence =
    (options.manifest.maximumStepsPerSession - 1) *
      PORTABLE_CONTROL_SEQUENCE_STRIDE +
    PORTABLE_CONTROL_MAXIMUM_ORDINAL;
  if (!Number.isSafeInteger(maximumControlSequence))
    throw new RangeError("heterogeneous_control_sequence_capacity_exhausted");
  if (
    maximumControlSequence >
    options.semanticRuntime.options.policy.limits.maximumSequence
  )
    throw new RangeError("semantic_policy_sequence_capacity_insufficient");
  if (maximumControlSequence > interventionBinding.maximumStep)
    throw new RangeError("intervention_policy_step_capacity_insufficient");
  if (
    options.maximumSessionLogicalTimeMs >
    options.semanticRuntime.options.policy.limits.maximumLogicalTimeMs
  )
    throw new RangeError("semantic_policy_logical_time_capacity_insufficient");

  const semanticControl = createSemanticPortableAgentControlV1({
    controlId: `${options.composerId}.semantic`,
    controlVersion: options.composerVersion,
    implementationId: options.implementationId,
    runtime: options.semanticRuntime,
    material: options.semanticMaterial,
    maximumLogicalTimeMs: options.maximumSessionLogicalTimeMs,
  });
  const prerequisiteControl = createCompositePortableAgentControlV1({
    controlId: `${options.composerId}.prerequisites`,
    controlVersion: options.composerVersion,
    implementationId: options.implementationId,
    controls: [options.roleAlignmentControl, options.interventionControl],
  });
  const control: PortableAgentControlPortV1 = Object.freeze({
    controlId: options.composerId,
    controlVersion: options.composerVersion,
    implementationId: options.implementationId,
    async evaluate(portable: PortableAgentControlRequestV1) {
      try {
        const prerequisite = await prerequisiteControl.evaluate(portable);
        if (prerequisite.disposition !== "allow") return prerequisite;
        if (portable.checkpoint === "pre_action") {
          // Build once after prerequisites so volatile material cannot change
          // between semantic evaluation and receipt issuance.
          const evaluation = await buildSemanticPortableEvaluationV1(
            {
              runtime: options.semanticRuntime,
              material: options.semanticMaterial,
              maximumLogicalTimeMs: options.maximumSessionLogicalTimeMs,
            },
            portable,
          );
          const authorized =
            await options.semanticRuntime.authorizeAction(evaluation);
          if (!authorized.authorization)
            return portableSemanticDecisionV1(authorized.decision);
          return allow("semantic_control_allowed");
        }
        const semantic = await semanticControl.evaluate(portable);
        return semantic;
      } catch {
        return deny("heterogeneous_composite_control_unavailable");
      }
    },
  });
  const registry = new PortableAgentAdapterRegistryV1().register({
    manifest: options.manifest,
    adapter: options.adapter,
  });
  const requiredSessionCapabilities: PortableAgentAdapterRequirementsV1 =
    deepFreeze({
      agentKinds: [...options.manifest.agentKinds],
      inputModalities: [...options.manifest.inputModalities],
      outputModalities: [...options.manifest.outputModalities],
      interactionMode: options.manifest.interactionModes[0]!,
      controlPoints: [...requiredPoints],
      requireCancellation: options.manifest.supportsCancellation,
      requireCheckpoint: false,
      requireRestore: false,
    });
  const negotiation = registry.negotiate(
    options.manifest,
    requiredSessionCapabilities,
  );
  if (!negotiation.accepted)
    throw new TypeError("portable_adapter_control_route_negotiation_failed");
  const sessionRuntime = new PortableAgentSessionRuntimeV1({
    registry,
    control,
    ...(options.stateStore ? { stateStore: options.stateStore } : {}),
    ...(options.maximumSessionSnapshotBytes
      ? { maximumSessionSnapshotBytes: options.maximumSessionSnapshotBytes }
      : {}),
    ...(options.clock ? { clock: options.clock } : {}),
  });
  const actionGateway = createHeterogeneousPortableActionGatewayV1({
    runtime: options.semanticRuntime,
    sessions: sessionRuntime,
  });
  return Object.freeze({
    route: expectedRoute,
    maximumSessionLogicalTimeMs: options.maximumSessionLogicalTimeMs,
    registry,
    control,
    semanticControl,
    actionGateway,
    sessionRuntime,
    requiredSessionCapabilities,
  });
}

export function createSemanticPortableAgentControlV1(input: {
  readonly controlId: string;
  readonly controlVersion: number;
  readonly implementationId: string;
  readonly runtime: SemanticAlignmentAgilityRuntimeV1;
  readonly material: SemanticPortableMaterialPortV1;
  readonly maximumLogicalTimeMs: number;
}): PortableAgentControlPortV1 {
  assertIdentifier(input.controlId, "controlId");
  assertSafeInteger(input.controlVersion, "controlVersion", 1);
  assertIdentifier(input.implementationId, "implementationId");
  if (!input.runtime || typeof input.runtime.evaluate !== "function")
    throw new TypeError("semantic_runtime_required");
  if (!input.material || typeof input.material.bind !== "function")
    throw new TypeError("semantic_material_port_required");
  assertSafeInteger(input.maximumLogicalTimeMs, "maximumLogicalTimeMs", 0);
  if (
    input.maximumLogicalTimeMs >
    input.runtime.options.policy.limits.maximumLogicalTimeMs
  )
    throw new RangeError("semantic_control_logical_time_capacity_insufficient");
  return Object.freeze({
    controlId: input.controlId,
    controlVersion: input.controlVersion,
    implementationId: input.implementationId,
    async evaluate(portable: PortableAgentControlRequestV1) {
      try {
        const evaluation = await buildSemanticPortableEvaluationV1(
          input,
          portable,
        );
        const decision = await input.runtime.evaluate(evaluation);
        if (decision.disposition === "allow")
          return allow("semantic_control_allowed");
        // Portable controls have no steering payload channel. Stopping is the
        // only non-bypass interpretation until the application supplies a new step.
        if (decision.disposition === "steer")
          return abstain("semantic_steering_required");
        if (decision.disposition === "abstain")
          return abstain("semantic_control_abstained");
        return deny("semantic_control_blocked");
      } catch {
        return deny("semantic_control_unavailable");
      }
    },
  });
}

async function buildSemanticPortableEvaluationV1(
  input: {
    readonly runtime: SemanticAlignmentAgilityRuntimeV1;
    readonly material: SemanticPortableMaterialPortV1;
    readonly maximumLogicalTimeMs: number;
  },
  portable: PortableAgentControlRequestV1,
): Promise<SemanticControlEvaluationInputV1> {
  const runtime = input.runtime;
  const binding = runtime.options.binding;
  assertPortableSemanticBindingV1(runtime, portable);
  assertSafeInteger(portable.stepSequence, "stepSequence", 1);
  if (portable.stepSequence > portable.manifest.maximumStepsPerSession)
    throw new RangeError("portable_step_sequence_exceeded");
  assertSafeInteger(portable.request.logicalTimeMs, "request.logicalTimeMs", 0);
  if (portable.request.logicalTimeMs > input.maximumLogicalTimeMs)
    throw new RangeError("portable_logical_time_exceeded");
  const itemIndex = portable.checkpointItemIndex ?? 0;
  assertSafeInteger(itemIndex, "checkpointItemIndex", 0);
  if (portable.checkpoint === "pre_step" && itemIndex !== 0)
    throw new RangeError("portable_pre_step_item_index_invalid");
  if (itemIndex > PORTABLE_CONTROL_MAXIMUM_ITEM_INDEX)
    throw new RangeError("portable_checkpoint_item_index_exceeded");
  const ordinal = checkpointOrdinal(portable.checkpoint, itemIndex);
  const sequence =
    (portable.stepSequence - 1) * PORTABLE_CONTROL_SEQUENCE_STRIDE + ordinal;
  const logicalTimeMs = portable.request.logicalTimeMs;
  if (!Number.isSafeInteger(sequence))
    throw new RangeError("portable_semantic_clock_exhausted");
  const material = await input.material.bind(portable);
  assertDigest(material.materialDigest, "material.materialDigest");
  const state = await runtime.getState();
  const target = targetFor(portable);
  const context = {
    observations: portable.request.observations.map((item) => ({
      observationId: item.observationId,
      sourceId: item.sourceId,
      sourceZone: item.sourceZone,
      contentDigest:
        item.contentReference?.contentDigest ??
        digestSemanticControlV1("request", item.content as JsonValue),
    })),
    roleBindingId: portable.role.roleBindingId,
    roleRevision: portable.role.roleRevision,
    checkpointItemIndex: itemIndex,
  };
  const interventionPayload =
    portable.checkpoint === "pre_action" && portable.actionProposal
      ? portableActionPayloadV1(portable)
      : undefined;
  const request = createSemanticControlRequestV1({
    schemaVersion: 1,
    requestId: portableSemanticRequestIdV1(portable),
    checkpoint: portable.checkpoint,
    bindingDigest: binding.bindingDigest,
    missionAnchorDigest: binding.missionAnchorDigest,
    roleAnchorDigest: binding.roleAnchorDigest,
    authorityDigest: binding.authorityDigest,
    sequence,
    step: portable.stepSequence,
    logicalTimeMs,
    targetDigest: digestSemanticControlV1("request", target),
    contextDigest: digestSemanticControlV1(
      "request",
      context as unknown as JsonValue,
    ),
    selectedCourseActionDigest: material.selectedCourseActionDigest,
    candidateCourseActionDigests: material.candidateCourseActionDigests,
    priorCourseActionDigests: state?.courseActionHistory ?? [],
    modalities: material.modalities,
    materialDigest: material.materialDigest,
    actionPayloadDigest:
      interventionPayload === undefined
        ? null
        : digestSemanticOperationPayloadV1(
            interventionPayload,
            runtime.options.policy.limits.maximumActionPayloadBytes,
          ),
    materialHandle: material.materialHandle,
  });
  return {
    request,
    ...(interventionPayload === undefined ? {} : { interventionPayload }),
  };
}

export function createHeterogeneousPortableActionGatewayV1(input: {
  readonly runtime: SemanticAlignmentAgilityRuntimeV1;
  readonly sessions: Pick<PortableAgentSessionRuntimeV1, "getSession">;
}): HeterogeneousPortableActionGatewayV1 {
  if (!(input.runtime instanceof SemanticAlignmentAgilityRuntimeV1))
    throw new TypeError("semantic_runtime_required");
  if (!input.runtime.options.actionAuthorization)
    throw new TypeError("semantic_action_authorization_boundary_required");
  if (!input.sessions || typeof input.sessions.getSession !== "function")
    throw new TypeError("portable_session_lookup_required");
  return Object.freeze({
    async dispatch(
      value: {
        readonly request: PortableAgentControlRequestV1;
        readonly currentLogicalTimeMs: number;
      },
      sink: SemanticActionEffectSinkV1,
    ) {
      const portable = value.request;
      if (portable.checkpoint !== "pre_action" || !portable.actionProposal)
        throw new TypeError("heterogeneous_action_gateway_requires_proposal");
      assertSafeInteger(value.currentLogicalTimeMs, "currentLogicalTimeMs", 0);
      assertPortableSemanticBindingV1(input.runtime, portable);
      const session = await input.sessions.getSession(portable.sessionId);
      const itemIndex = portable.checkpointItemIndex ?? 0;
      assertSafeInteger(itemIndex, "checkpointItemIndex", 0);
      if (itemIndex > PORTABLE_CONTROL_MAXIMUM_ITEM_INDEX)
        throw new RangeError("portable_checkpoint_item_index_exceeded");
      const record = session?.stepRecords.find(
        (item) =>
          item.stepId === portable.request.stepId &&
          item.stepSequence === portable.stepSequence,
      );
      const retainedProposal = record?.result.actionProposals[itemIndex];
      if (
        !session ||
        session.status !== "active" ||
        session.tenantId !== portable.tenantId ||
        session.agentId !== portable.agentId ||
        session.objectiveId !== portable.role.objectiveId ||
        session.role.roleBindingId !== portable.role.roleBindingId ||
        session.role.roleRevision !== portable.role.roleRevision ||
        !record ||
        record.status !== "completed" ||
        record.result.status !== "completed" ||
        record.roleBindingId !== portable.role.roleBindingId ||
        record.roleRevision !== portable.role.roleRevision ||
        !retainedProposal ||
        digestSemanticControlV1(
          "request",
          record.request as unknown as JsonValue,
        ) !==
          digestSemanticControlV1(
            "request",
            portable.request as unknown as JsonValue,
          ) ||
        digestSemanticControlV1(
          "request",
          retainedProposal as unknown as JsonValue,
        ) !==
          digestSemanticControlV1(
            "request",
            portable.actionProposal as unknown as JsonValue,
          )
      )
        throw new TypeError("heterogeneous_action_session_commit_unverified");
      const targetDigest = digestSemanticControlV1(
        "request",
        targetFor(portable),
      );
      const payloadDigest = digestSemanticOperationPayloadV1(
        portableActionPayloadV1(portable),
        input.runtime.options.policy.limits.maximumActionPayloadBytes,
      );
      return input.runtime.dispatchAuthorizedAction(
        {
          authorizationId: portableSemanticRequestIdV1(portable),
          expectedTargetDigest: targetDigest,
          expectedActionPayloadDigest: payloadDigest,
          currentLogicalTimeMs: value.currentLogicalTimeMs,
        },
        sink,
      );
    },
  });
}

export function bindHeterogeneousInterventionPortableControlV1(input: {
  readonly runtime: HeterogeneousInferenceInterventionRuntimeV1;
}): BoundHeterogeneousInterventionPortableControlV1 {
  if (!(input.runtime instanceof HeterogeneousInferenceInterventionRuntimeV1))
    throw new TypeError("intervention_runtime_required");
  const runtime = input.runtime;
  const descriptor = runtime.options.adapter.descriptor;
  assertInferenceInterventionAdapterDescriptorV1(descriptor);
  const sidecarDigest = representationSidecarBindingDigestV1(
    runtime.options.sidecar ?? null,
  );
  const control = Object.freeze({
    controlId: `heterogeneous-intervention.${descriptor.adapterId}`,
    controlVersion: descriptor.adapterVersion,
    implementationId: `heterogeneous-intervention.${descriptor.adapterId}.v${descriptor.adapterVersion}`,
    interventionAdapterDescriptorDigest: descriptor.descriptorDigest,
    representationSidecarBindingDigest: sidecarDigest,
    interventionBindingDigest: runtime.options.binding.bindingDigest,
    interventionPolicyDigest: runtime.options.policy.policyDigest,
    maximumStep: runtime.options.policy.maximumStep,
    async evaluate(request: PortableAgentControlRequestV1) {
      try {
        const binding = runtime.options.binding;
        if (
          request.sessionId !== binding.sessionId ||
          request.agentId !== binding.agentId ||
          request.role.objectiveId !== binding.missionId ||
          (request.role.roleBindingId !== binding.roleId &&
            request.role.roleKey !== binding.roleId)
        )
          return deny("intervention_portable_binding_mismatch");
        assertSafeInteger(request.stepSequence, "stepSequence", 1);
        if (request.stepSequence > request.manifest.maximumStepsPerSession)
          return deny("intervention_step_sequence_exceeded");
        const itemIndex = request.checkpointItemIndex ?? 0;
        assertSafeInteger(itemIndex, "checkpointItemIndex", 0);
        if (request.checkpoint === "pre_step" && itemIndex !== 0)
          return deny("intervention_pre_step_item_index_invalid");
        if (itemIndex > PORTABLE_CONTROL_MAXIMUM_ITEM_INDEX)
          return deny("intervention_checkpoint_item_index_exceeded");
        const ordinal = checkpointOrdinal(request.checkpoint, itemIndex);
        const step =
          (request.stepSequence - 1) * PORTABLE_CONTROL_SEQUENCE_STRIDE +
          ordinal;
        const logicalTimeMs = request.request.logicalTimeMs;
        if (!Number.isSafeInteger(step) || !Number.isSafeInteger(logicalTimeMs))
          return deny("intervention_portable_clock_exhausted");
        const payload = canonicalizeControlJsonV1(targetFor(request));
        const result =
          request.checkpoint === "pre_action"
            ? await runtime.gateOperation({
                operationId: `portable-intervention-${request.sessionId}-${request.request.stepId}-${request.checkpoint}-${itemIndex}`,
                kind: "action",
                step,
                logicalTimeMs,
                payload,
              })
            : await runtime.gateCheckpoint({
                operationId: `portable-intervention-${request.sessionId}-${request.request.stepId}-${request.checkpoint}-${itemIndex}`,
                kind: request.checkpoint === "pre_step" ? "input" : "output",
                step,
                logicalTimeMs,
                payload,
              });
        return result.allowed
          ? allow("intervention_runtime_allowed")
          : deny("intervention_runtime_blocked");
      } catch {
        return deny("intervention_runtime_unavailable");
      }
    },
  });
  boundInterventionControls.add(control);
  return control;
}

export function representationSidecarBindingDigestV1(
  sidecar: RepresentationInterventionSidecarPortV1 | null,
): string | null {
  if (!sidecar) return null;
  assertIdentifier(sidecar.sidecarId, "sidecarId");
  assertSafeInteger(sidecar.sidecarVersion, "sidecarVersion", 1);
  assertDigest(
    sidecar.sidecarImplementationDigest,
    "sidecarImplementationDigest",
  );
  return digestSemanticControlV1("route", {
    kind: "representation-sidecar-binding",
    sidecarId: sidecar.sidecarId,
    sidecarVersion: sidecar.sidecarVersion,
    sidecarImplementationDigest: sidecar.sidecarImplementationDigest,
  });
}

export function portableAdapterBindingDigestV1(
  manifest: PortableAgentAdapterManifestV1,
): string {
  return digestSemanticControlV1("route", {
    kind: "portable-adapter-binding",
    manifest: manifest as unknown as JsonValue,
  });
}

function targetFor(request: PortableAgentControlRequestV1): JsonValue {
  if (request.checkpoint === "post_output")
    return request.output as unknown as JsonValue;
  if (request.checkpoint === "pre_action")
    return request.actionProposal as unknown as JsonValue;
  return {
    role: request.role,
    request: request.request,
    manifest: {
      adapterId: request.manifest.adapterId,
      adapterVersion: request.manifest.adapterVersion,
      implementationId: request.manifest.implementationId,
    },
  } as unknown as JsonValue;
}

export function portableSemanticRequestIdV1(
  request: PortableAgentControlRequestV1,
): string {
  const itemIndex = request.checkpointItemIndex ?? 0;
  assertSafeInteger(itemIndex, "checkpointItemIndex", 0);
  const identityDigest = digestSemanticControlV1("route", {
    kind: "portable-semantic-request",
    tenantId: request.tenantId,
    sessionId: request.sessionId,
    agentId: request.agentId,
    roleBindingId: request.role.roleBindingId,
    roleRevision: request.role.roleRevision,
    stepId: request.request.stepId,
    stepSequence: request.stepSequence,
    checkpoint: request.checkpoint,
    checkpointItemIndex: itemIndex,
  });
  return `portable-semantic:${identityDigest}`;
}

export function portableActionPayloadV1(
  request: PortableAgentControlRequestV1,
): string {
  if (request.checkpoint !== "pre_action" || !request.actionProposal)
    throw new TypeError("portable_action_payload_requires_proposal");
  // Canonical full-proposal bytes bind actionId, class, input, risk and metadata.
  return canonicalizeControlJsonV1(
    request.actionProposal as unknown as JsonValue,
  );
}

function assertPortableSemanticBindingV1(
  runtime: SemanticAlignmentAgilityRuntimeV1,
  portable: PortableAgentControlRequestV1,
): void {
  const binding = runtime.options.binding;
  if (
    portable.sessionId !== binding.sessionId ||
    portable.agentId !== binding.agentId ||
    portable.role.objectiveId !== binding.missionId ||
    (portable.role.roleBindingId !== binding.roleId &&
      portable.role.roleKey !== binding.roleId)
  )
    throw new TypeError("semantic_portable_binding_mismatch");
}

function checkpointOrdinal(
  checkpoint: SemanticControlCheckpointV1,
  itemIndex: number,
): number {
  if (checkpoint === "pre_step") return 1;
  if (checkpoint === "post_output") return 2 + itemIndex;
  return 8_194 + itemIndex;
}
function stripRouteDigest(
  route: HeterogeneousAgentRouteV1,
): Omit<HeterogeneousAgentRouteV1, "routeDigest"> {
  const { routeDigest: _ignored, ...body } = route;
  return body;
}
function allow(reasonCode: string) {
  return Object.freeze({ disposition: "allow" as const, reasonCode });
}
function deny(reasonCode: string) {
  return Object.freeze({ disposition: "deny" as const, reasonCode });
}
function abstain(reasonCode: string) {
  return Object.freeze({ disposition: "abstain" as const, reasonCode });
}
function portableSemanticDecisionV1(decision: SemanticControlDecisionV1) {
  if (decision.disposition === "allow")
    return allow("semantic_control_allowed");
  if (decision.disposition === "steer")
    return abstain("semantic_steering_required");
  if (decision.disposition === "abstain")
    return abstain("semantic_control_abstained");
  return deny("semantic_control_blocked");
}
