import type { JsonObject, JsonValue, Metadata } from "@agentplat/core";

import type {
  PortableAgentActionProposalV1,
  PortableAgentAdapterManifestV1,
  PortableAgentAdapterRequirementsV1,
  PortableAgentCheckpointV1,
  PortableAgentControlDecisionV1,
  PortableAgentControlPointV1,
  PortableAgentInteractionModeV1,
  PortableAgentKindV1,
  PortableAgentModalityV1,
  PortableAgentObservationV1,
  PortableAgentOutputV1,
  PortableAgentRoleBindingV1,
  PortableAgentSessionSnapshotV1,
  PortableAgentSourceZoneV1,
  PortableAgentStepRequestV1,
  PortableAgentStepResultV1,
} from "./adapter-contracts.js";
import { PortableAgentErrorV1 } from "./adapter-errors.js";

const AGENT_KINDS = new Set<PortableAgentKindV1>([
  "language_model",
  "vision_language_model",
  "vision_language_action",
  "policy",
  "symbolic",
  "hybrid",
  "custom",
]);
const MODALITIES = new Set<PortableAgentModalityV1>([
  "text",
  "image",
  "audio",
  "video",
  "structured",
  "sensor",
  "action",
]);
const INTERACTION_MODES = new Set<PortableAgentInteractionModeV1>([
  "invoke",
  "stream",
  "observe_act",
]);
const CONTROL_POINTS = new Set<PortableAgentControlPointV1>([
  "pre_step",
  "post_output",
  "pre_action",
]);
const SOURCE_ZONES = new Set<PortableAgentSourceZoneV1>([
  "operator_trusted",
  "objective_trusted",
  "local_trusted",
  "environment_untrusted",
  "peer_untrusted",
  "tool_untrusted",
  "provider_untrusted",
]);
const SESSION_STATUSES = new Set(["active", "paused", "closed", "failed"]);
const STEP_STATUSES = new Set(["completed", "refused", "paused", "failed"]);

export function normalizeAdapterManifestV1(
  input: PortableAgentAdapterManifestV1,
): PortableAgentAdapterManifestV1 {
  exactKeys(
    input,
    [
      "schemaVersion",
      "adapterId",
      "adapterVersion",
      "implementationId",
      "agentKinds",
      "inputModalities",
      "outputModalities",
      "interactionModes",
      "controlPoints",
      "supportsCancellation",
      "supportsCheckpoint",
      "supportsRestore",
      "maximumObservationBytes",
      "maximumOutputBytes",
      "maximumActionBytes",
      "maximumStepsPerSession",
    ],
    "adapter manifest",
  );
  if (input.schemaVersion !== 1) invalid("adapter schemaVersion is invalid");
  const supportsCheckpoint = boolean(
    input.supportsCheckpoint,
    "supportsCheckpoint",
  );
  const supportsRestore = boolean(input.supportsRestore, "supportsRestore");
  if (supportsRestore && !supportsCheckpoint) {
    invalid("restore support requires checkpoint support");
  }
  return cloneAndFreeze({
    schemaVersion: 1,
    adapterId: identifier(input.adapterId, "adapterId"),
    adapterVersion: token(input.adapterVersion, "adapterVersion", 128),
    implementationId: identifier(input.implementationId, "implementationId"),
    agentKinds: enumArray(
      input.agentKinds,
      AGENT_KINDS,
      "agentKinds",
      16,
      true,
    ),
    inputModalities: enumArray(
      input.inputModalities,
      MODALITIES,
      "inputModalities",
      16,
      true,
    ),
    outputModalities: enumArray(
      input.outputModalities,
      MODALITIES,
      "outputModalities",
      16,
      true,
    ),
    interactionModes: enumArray(
      input.interactionModes,
      INTERACTION_MODES,
      "interactionModes",
      8,
      true,
    ),
    controlPoints: enumArray(
      input.controlPoints,
      CONTROL_POINTS,
      "controlPoints",
      8,
      false,
    ),
    supportsCancellation: boolean(
      input.supportsCancellation,
      "supportsCancellation",
    ),
    supportsCheckpoint,
    supportsRestore,
    maximumObservationBytes: positiveInteger(
      input.maximumObservationBytes,
      "maximumObservationBytes",
      67_108_864,
    ),
    maximumOutputBytes: positiveInteger(
      input.maximumOutputBytes,
      "maximumOutputBytes",
      67_108_864,
    ),
    maximumActionBytes: positiveInteger(
      input.maximumActionBytes,
      "maximumActionBytes",
      67_108_864,
    ),
    maximumStepsPerSession: positiveInteger(
      input.maximumStepsPerSession,
      "maximumStepsPerSession",
      1_000_000,
    ),
  });
}

export function normalizeAdapterRequirementsV1(
  input: PortableAgentAdapterRequirementsV1,
): PortableAgentAdapterRequirementsV1 {
  if (!isPlainRecord(input)) invalid("adapter requirements are required");
  const keys = Object.keys(input).sort(compareAscii);
  const allowed = [
    "agentKinds",
    "controlPoints",
    "inputModalities",
    "interactionMode",
    "outputModalities",
    "requireCancellation",
    "requireCheckpoint",
    "requireRestore",
  ].sort(compareAscii);
  if (keys.some((key) => !allowed.includes(key))) {
    invalid("adapter requirements contain unknown fields");
  }
  if (!INTERACTION_MODES.has(input.interactionMode)) {
    invalid("requirements.interactionMode is invalid");
  }
  return cloneAndFreeze({
    ...(input.agentKinds === undefined
      ? {}
      : {
          agentKinds: enumArray(
            input.agentKinds,
            AGENT_KINDS,
            "requirements.agentKinds",
            16,
            true,
          ),
        }),
    inputModalities: enumArray(
      input.inputModalities,
      MODALITIES,
      "requirements.inputModalities",
      16,
      false,
    ),
    outputModalities: enumArray(
      input.outputModalities,
      MODALITIES,
      "requirements.outputModalities",
      16,
      false,
    ),
    interactionMode: input.interactionMode,
    controlPoints: enumArray(
      input.controlPoints,
      CONTROL_POINTS,
      "requirements.controlPoints",
      8,
      false,
    ),
    ...(input.requireCancellation === undefined
      ? {}
      : {
          requireCancellation: boolean(
            input.requireCancellation,
            "requirements.requireCancellation",
          ),
        }),
    ...(input.requireCheckpoint === undefined
      ? {}
      : {
          requireCheckpoint: boolean(
            input.requireCheckpoint,
            "requirements.requireCheckpoint",
          ),
        }),
    ...(input.requireRestore === undefined
      ? {}
      : {
          requireRestore: boolean(
            input.requireRestore,
            "requirements.requireRestore",
          ),
        }),
  });
}

export function normalizeRoleBindingV1(
  input: PortableAgentRoleBindingV1,
): PortableAgentRoleBindingV1 {
  exactKeys(
    input,
    [
      "schemaVersion",
      "roleBindingId",
      "roleRevision",
      "predecessorRoleBindingId",
      "objectiveId",
      "roleKey",
      "instructions",
      "constraints",
      "validFromLogicalMs",
      "validUntilLogicalMs",
    ],
    "role binding",
  );
  if (input.schemaVersion !== 1) invalid("role schemaVersion is invalid");
  const roleRevision = positiveInteger(
    input.roleRevision,
    "roleRevision",
    Number.MAX_SAFE_INTEGER,
  );
  const predecessorRoleBindingId = nullableIdentifier(
    input.predecessorRoleBindingId,
    "predecessorRoleBindingId",
  );
  if (
    (roleRevision === 1 && predecessorRoleBindingId !== null) ||
    (roleRevision > 1 && predecessorRoleBindingId === null)
  ) {
    invalid("role predecessor is inconsistent with its revision");
  }
  const validFromLogicalMs = safeInteger(
    input.validFromLogicalMs,
    "validFromLogicalMs",
    0,
  );
  const validUntilLogicalMs = safeInteger(
    input.validUntilLogicalMs,
    "validUntilLogicalMs",
    1,
  );
  if (validUntilLogicalMs <= validFromLogicalMs) {
    invalid("role validity interval is invalid");
  }
  if (!Array.isArray(input.instructions) || input.instructions.length > 128) {
    invalid("role instructions must be a bounded array");
  }
  const instructions = Object.freeze(
    input.instructions.map((value, index) =>
      text(value, `instructions[${index}]`, 8_192),
    ),
  );
  return cloneAndFreeze({
    schemaVersion: 1,
    roleBindingId: identifier(input.roleBindingId, "roleBindingId"),
    roleRevision,
    predecessorRoleBindingId,
    objectiveId: identifier(input.objectiveId, "objectiveId"),
    roleKey: token(input.roleKey, "roleKey", 256),
    instructions,
    constraints: normalizeJsonObject(input.constraints, "role.constraints"),
    validFromLogicalMs,
    validUntilLogicalMs,
  });
}

export function normalizeObservationV1(
  input: PortableAgentObservationV1,
): PortableAgentObservationV1 {
  exactKeys(
    input,
    [
      "schemaVersion",
      "observationId",
      "sourceZone",
      "sourceId",
      "modality",
      "content",
      "contentReference",
      "provenance",
      "observedAtLogicalMs",
    ],
    "observation",
  );
  if (input.schemaVersion !== 1)
    invalid("observation schemaVersion is invalid");
  if (!SOURCE_ZONES.has(input.sourceZone)) invalid("sourceZone is invalid");
  if (!MODALITIES.has(input.modality))
    invalid("observation modality is invalid");
  const content =
    input.content === null
      ? null
      : normalizeJson(input.content, "observation.content");
  const contentReference =
    input.contentReference === null
      ? null
      : normalizeContentReference(input.contentReference, "contentReference");
  if ((content === null) === (contentReference === null)) {
    invalid("observation requires exactly one content representation");
  }
  return cloneAndFreeze({
    schemaVersion: 1,
    observationId: identifier(input.observationId, "observationId"),
    sourceZone: input.sourceZone,
    sourceId: identifier(input.sourceId, "sourceId"),
    modality: input.modality,
    content,
    contentReference,
    provenance: normalizeMetadata(input.provenance, "observation.provenance"),
    observedAtLogicalMs: safeInteger(
      input.observedAtLogicalMs,
      "observedAtLogicalMs",
      0,
    ),
  });
}

export function normalizeStepRequestV1(
  input: PortableAgentStepRequestV1,
  manifest?: PortableAgentAdapterManifestV1,
): PortableAgentStepRequestV1 {
  exactKeys(
    input,
    [
      "schemaVersion",
      "stepId",
      "expectedSessionRevision",
      "interactionMode",
      "observations",
      "input",
      "requestedOutputModalities",
      "logicalTimeMs",
    ],
    "step request",
  );
  if (input.schemaVersion !== 1) invalid("step schemaVersion is invalid");
  if (!INTERACTION_MODES.has(input.interactionMode)) {
    invalid("step interactionMode is invalid");
  }
  if (!Array.isArray(input.observations) || input.observations.length > 4_096) {
    invalid("step observations must be a bounded array");
  }
  const observations = input.observations.map(normalizeObservationV1);
  const observationIds = observations.map(({ observationId }) => observationId);
  if (new Set(observationIds).size !== observationIds.length) {
    invalid("step observations contain duplicate IDs");
  }
  const requestedOutputModalities = enumArray(
    input.requestedOutputModalities,
    MODALITIES,
    "requestedOutputModalities",
    16,
    true,
  );
  const stepInput =
    input.input === null
      ? null
      : normalizeJsonObject(input.input, "step.input");
  if (manifest) {
    if (!manifest.interactionModes.includes(input.interactionMode)) {
      invalid("adapter does not support the requested interaction mode");
    }
    for (const observation of observations) {
      if (!manifest.inputModalities.includes(observation.modality)) {
        invalid(`adapter does not accept ${observation.modality} observations`);
      }
    }
    for (const modality of requestedOutputModalities) {
      if (!manifest.outputModalities.includes(modality)) {
        invalid(`adapter does not produce ${modality} output`);
      }
    }
    if (
      jsonByteLength(
        normalizeJson(
          { observations, input: stepInput },
          "step observation envelope",
        ),
      ) +
        observations.reduce(
          (total, observation) =>
            total + (observation.contentReference?.byteLength ?? 0),
          0,
        ) >
      manifest.maximumObservationBytes
    ) {
      invalid("step observations exceed the adapter byte limit");
    }
  }
  return cloneAndFreeze({
    schemaVersion: 1,
    stepId: identifier(input.stepId, "stepId"),
    expectedSessionRevision: safeInteger(
      input.expectedSessionRevision,
      "expectedSessionRevision",
      0,
    ),
    interactionMode: input.interactionMode,
    observations,
    input: stepInput,
    requestedOutputModalities,
    logicalTimeMs: safeInteger(input.logicalTimeMs, "logicalTimeMs", 0),
  });
}

export function normalizeStepResultV1(
  input: PortableAgentStepResultV1,
  binding: {
    sessionId: string;
    stepId: string;
    stepSequence: number;
    manifest: PortableAgentAdapterManifestV1;
  },
): PortableAgentStepResultV1 {
  exactKeys(
    input,
    [
      "schemaVersion",
      "sessionId",
      "stepId",
      "stepSequence",
      "status",
      "outputs",
      "actionProposals",
      "checkpoint",
      "reasonCode",
      "metadata",
    ],
    "step result",
  );
  if (
    input.schemaVersion !== 1 ||
    input.sessionId !== binding.sessionId ||
    input.stepId !== binding.stepId ||
    input.stepSequence !== binding.stepSequence ||
    !STEP_STATUSES.has(input.status)
  ) {
    invalid("step result binding is invalid");
  }
  if (!Array.isArray(input.outputs) || input.outputs.length > 4_096) {
    invalid("step outputs must be a bounded array");
  }
  if (
    !Array.isArray(input.actionProposals) ||
    input.actionProposals.length > 4_096
  ) {
    invalid("step action proposals must be a bounded array");
  }
  const outputs = input.outputs.map((value) =>
    normalizeOutputV1(value, binding.manifest),
  );
  const actionProposals = input.actionProposals.map((value) =>
    normalizeActionProposalV1(value, binding.manifest),
  );
  uniqueIds(
    outputs.map(({ outputId }) => outputId),
    "output",
  );
  uniqueIds(
    actionProposals.map(({ actionId }) => actionId),
    "action",
  );
  if (
    jsonByteLength(outputs as unknown as JsonValue) +
      outputs.reduce(
        (total, output) => total + (output.contentReference?.byteLength ?? 0),
        0,
      ) >
    binding.manifest.maximumOutputBytes
  ) {
    invalid("agent outputs exceed the adapter byte limit");
  }
  if (
    jsonByteLength(actionProposals as unknown as JsonValue) >
    binding.manifest.maximumActionBytes
  ) {
    invalid("agent actions exceed the adapter byte limit");
  }
  const checkpoint =
    input.checkpoint === null
      ? null
      : normalizeCheckpointV1(input.checkpoint, {
          sessionId: binding.sessionId,
          manifest: binding.manifest,
          maximumSequence: binding.stepSequence,
        });
  if (checkpoint !== null && !binding.manifest.supportsCheckpoint) {
    invalid("adapter returned an undeclared checkpoint");
  }
  if (
    input.status === "completed" &&
    outputs.length === 0 &&
    actionProposals.length === 0
  ) {
    invalid("completed step result is empty");
  }
  if (
    input.status !== "completed" &&
    (input.reasonCode === null || input.reasonCode.length === 0)
  ) {
    invalid("non-completed step result requires a reasonCode");
  }
  return cloneAndFreeze({
    schemaVersion: 1,
    sessionId: binding.sessionId,
    stepId: binding.stepId,
    stepSequence: binding.stepSequence,
    status: input.status,
    outputs,
    actionProposals,
    checkpoint,
    reasonCode:
      input.reasonCode === null
        ? null
        : token(input.reasonCode, "reasonCode", 256),
    metadata: normalizeMetadata(input.metadata, "step.metadata"),
  });
}

export function normalizeCheckpointV1(
  input: PortableAgentCheckpointV1,
  binding: {
    sessionId: string;
    manifest: PortableAgentAdapterManifestV1;
    maximumSequence: number;
  },
): PortableAgentCheckpointV1 {
  exactKeys(
    input,
    [
      "schemaVersion",
      "checkpointId",
      "sessionId",
      "adapterId",
      "adapterVersion",
      "implementationId",
      "throughStepSequence",
      "stateReference",
      "stateDigest",
      "createdAt",
    ],
    "checkpoint",
  );
  if (
    input.schemaVersion !== 1 ||
    input.sessionId !== binding.sessionId ||
    input.adapterId !== binding.manifest.adapterId ||
    input.adapterVersion !== binding.manifest.adapterVersion ||
    input.implementationId !== binding.manifest.implementationId
  ) {
    invalid("checkpoint binding is invalid");
  }
  const sequence = safeInteger(
    input.throughStepSequence,
    "throughStepSequence",
    0,
  );
  if (sequence > binding.maximumSequence) {
    invalid("checkpoint sequence is ahead of session state");
  }
  return cloneAndFreeze({
    schemaVersion: 1,
    checkpointId: identifier(input.checkpointId, "checkpointId"),
    sessionId: binding.sessionId,
    adapterId: binding.manifest.adapterId,
    adapterVersion: binding.manifest.adapterVersion,
    implementationId: binding.manifest.implementationId,
    throughStepSequence: sequence,
    stateReference: text(input.stateReference, "stateReference", 4_096),
    stateDigest: token(input.stateDigest, "stateDigest", 256),
    createdAt: timestamp(input.createdAt, "checkpoint.createdAt"),
  });
}

export function normalizeControlDecisionV1(
  input: PortableAgentControlDecisionV1,
): PortableAgentControlDecisionV1 {
  exactKeys(input, ["disposition", "reasonCode"], "control decision");
  if (!["allow", "deny", "abstain", "escalate"].includes(input.disposition)) {
    invalid("control disposition is invalid");
  }
  return Object.freeze({
    disposition: input.disposition,
    reasonCode: token(input.reasonCode, "control.reasonCode", 256),
  });
}

export function assertStoredPortableSessionV1(
  input: PortableAgentSessionSnapshotV1,
  binding?: {
    sessionId?: string;
    control?: {
      controlId: string;
      controlVersion: number;
      implementationId: string;
    };
    manifest?: PortableAgentAdapterManifestV1;
  },
): PortableAgentSessionSnapshotV1 {
  try {
    exactKeys(
      input,
      [
        "schemaVersion",
        "sessionId",
        "tenantId",
        "agentId",
        "objectiveId",
        "manifest",
        "controlBinding",
        "role",
        "status",
        "revision",
        "nextStepSequence",
        "stepRecords",
        "checkpoint",
        "metadata",
        "createdAt",
        "updatedAt",
        "closedAt",
      ],
      "stored session",
    );
    if (input.schemaVersion !== 1 || !SESSION_STATUSES.has(input.status)) {
      stateInvalid("stored session status is invalid");
    }
    identifier(input.sessionId, "stored.sessionId");
    identifier(input.tenantId, "stored.tenantId");
    identifier(input.agentId, "stored.agentId");
    identifier(input.objectiveId, "stored.objectiveId");
    const manifest = normalizeAdapterManifestV1(input.manifest);
    const role = normalizeRoleBindingV1(input.role);
    if (role.objectiveId !== input.objectiveId) {
      stateInvalid("stored role objective is invalid");
    }
    exactKeys(
      input.controlBinding,
      ["controlId", "controlVersion", "implementationId"],
      "stored control binding",
    );
    const controlBinding = {
      controlId: identifier(input.controlBinding.controlId, "controlId"),
      controlVersion: positiveInteger(
        input.controlBinding.controlVersion,
        "controlVersion",
        Number.MAX_SAFE_INTEGER,
      ),
      implementationId: identifier(
        input.controlBinding.implementationId,
        "control.implementationId",
      ),
    };
    if (
      binding?.sessionId !== undefined &&
      binding.sessionId !== input.sessionId
    ) {
      stateInvalid("stored session ID does not match");
    }
    if (
      binding?.manifest !== undefined &&
      !sameJson(binding.manifest, manifest)
    ) {
      stateInvalid("stored adapter manifest does not match");
    }
    if (
      binding?.control !== undefined &&
      !sameJson(binding.control, controlBinding)
    ) {
      stateInvalid("stored control deployment does not match");
    }
    const revision = safeInteger(input.revision, "stored.revision", 0);
    const nextStepSequence = positiveInteger(
      input.nextStepSequence,
      "stored.nextStepSequence",
      manifest.maximumStepsPerSession + 1,
    );
    if (
      !Array.isArray(input.stepRecords) ||
      input.stepRecords.length > manifest.maximumStepsPerSession
    ) {
      stateInvalid("stored step records are invalid");
    }
    const seenSteps = new Set<string>();
    const stepRecords = input.stepRecords.map((record, index) => {
      exactKeys(
        record,
        [
          "schemaVersion",
          "stepId",
          "stepSequence",
          "roleBindingId",
          "roleRevision",
          "interactionMode",
          "status",
          "request",
          "result",
          "startedAt",
          "completedAt",
        ],
        "stored step record",
      );
      if (
        record.schemaVersion !== 1 ||
        record.stepSequence !== index + 1 ||
        seenSteps.has(record.stepId) ||
        !INTERACTION_MODES.has(record.interactionMode) ||
        !STEP_STATUSES.has(record.status)
      ) {
        stateInvalid("stored step sequence is invalid");
      }
      seenSteps.add(identifier(record.stepId, "stored.stepId"));
      identifier(record.roleBindingId, "stored.roleBindingId");
      positiveInteger(
        record.roleRevision,
        "stored.roleRevision",
        Number.MAX_SAFE_INTEGER,
      );
      const request = normalizeStepRequestV1(record.request, manifest);
      if (
        request.stepId !== record.stepId ||
        request.interactionMode !== record.interactionMode
      ) {
        stateInvalid("stored step request is inconsistent");
      }
      const result = normalizeStepResultV1(record.result, {
        sessionId: input.sessionId,
        stepId: record.stepId,
        stepSequence: record.stepSequence,
        manifest,
      });
      if (result.status !== record.status) {
        stateInvalid("stored step result status is inconsistent");
      }
      return cloneAndFreeze({
        ...record,
        request,
        result,
        startedAt: timestamp(record.startedAt, "stored.startedAt"),
        completedAt: timestamp(record.completedAt, "stored.completedAt"),
      });
    });
    if (nextStepSequence !== stepRecords.length + 1) {
      stateInvalid("stored next step sequence is inconsistent");
    }
    const checkpoint =
      input.checkpoint === null
        ? null
        : normalizeCheckpointV1(input.checkpoint, {
            sessionId: input.sessionId,
            manifest,
            maximumSequence: nextStepSequence - 1,
          });
    const closedAt =
      input.closedAt === null
        ? null
        : timestamp(input.closedAt, "stored.closedAt");
    if (
      (input.status === "closed" && closedAt === null) ||
      (input.status !== "closed" && closedAt !== null)
    ) {
      stateInvalid("stored closed state is inconsistent");
    }
    return cloneAndFreeze({
      ...input,
      manifest,
      controlBinding,
      role,
      revision,
      nextStepSequence,
      stepRecords,
      checkpoint,
      metadata: normalizeMetadata(input.metadata, "stored.metadata"),
      createdAt: timestamp(input.createdAt, "stored.createdAt"),
      updatedAt: timestamp(input.updatedAt, "stored.updatedAt"),
      closedAt,
    });
  } catch (error) {
    if (
      error instanceof PortableAgentErrorV1 &&
      error.code === "STATE_INVALID"
    ) {
      throw error;
    }
    throw new PortableAgentErrorV1(
      "STATE_INVALID",
      "stored portable agent session is invalid",
    );
  }
}

export function normalizeMetadata(input: Metadata, label: string): Metadata {
  return normalizeJsonObject(input, label) as Metadata;
}

export function normalizeJsonObject(input: unknown, label: string): JsonObject {
  const normalized = normalizeJson(input, label);
  if (!isPlainRecord(normalized)) invalid(`${label} must be a JSON object`);
  return normalized as JsonObject;
}

export function normalizeJson(input: unknown, label: string): JsonValue {
  let nodes = 0;
  const visit = (value: unknown, path: string, depth: number): JsonValue => {
    nodes += 1;
    if (nodes > 100_000 || depth > 32) invalid(`${label} exceeds JSON limits`);
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean"
    ) {
      return value;
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) invalid(`${path} is not finite`);
      return value;
    }
    if (Array.isArray(value)) {
      if (value.length > 100_000) invalid(`${path} is too large`);
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) {
          invalid(`${path} cannot contain sparse entries`);
        }
      }
      return value.map((item, index) =>
        visit(item, `${path}[${index}]`, depth + 1),
      );
    }
    if (!isPlainRecord(value)) invalid(`${path} must contain plain JSON data`);
    if (Object.getOwnPropertySymbols(value).length > 0) {
      invalid(`${path} cannot contain symbol keys`);
    }
    const output: Record<string, JsonValue> = Object.create(null);
    for (const key of Object.getOwnPropertyNames(value).sort(compareAscii)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        invalid(`${path}.${key} must be enumerable data`);
      }
      output[key] = visit(descriptor.value, `${path}.${key}`, depth + 1);
    }
    return output;
  };
  return deepFreeze(visit(input, label, 0));
}

export function jsonByteLength(input: JsonValue): number {
  return new TextEncoder().encode(JSON.stringify(input)).byteLength;
}

export function cloneAndFreeze<T>(input: T): T {
  return deepFreeze(structuredClone(input));
}

export function identifier(input: unknown, label: string): string {
  if (
    typeof input !== "string" ||
    input.length === 0 ||
    input.length > 256 ||
    input.trim() !== input ||
    /[\u0000-\u001f\u007f]/u.test(input)
  ) {
    invalid(`${label} must be a non-empty bounded identifier`);
  }
  return input;
}

export function timestamp(input: unknown, label: string): string {
  if (
    typeof input !== "string" ||
    !Number.isFinite(Date.parse(input)) ||
    new Date(input).toISOString() !== input
  ) {
    invalid(`${label} must be a canonical ISO timestamp`);
  }
  return input;
}

function normalizeOutputV1(
  input: PortableAgentOutputV1,
  manifest: PortableAgentAdapterManifestV1,
): PortableAgentOutputV1 {
  exactKeys(
    input,
    [
      "schemaVersion",
      "outputId",
      "modality",
      "content",
      "contentReference",
      "metadata",
    ],
    "agent output",
  );
  if (input.schemaVersion !== 1 || !MODALITIES.has(input.modality)) {
    invalid("agent output is invalid");
  }
  if (!manifest.outputModalities.includes(input.modality)) {
    invalid("adapter returned an undeclared output modality");
  }
  const content =
    input.content === null
      ? null
      : normalizeJson(input.content, "output.content");
  const contentReference =
    input.contentReference === null
      ? null
      : normalizeContentReference(
          input.contentReference,
          "output.contentReference",
        );
  if ((content === null) === (contentReference === null)) {
    invalid("output requires exactly one content representation");
  }
  const output = cloneAndFreeze({
    schemaVersion: 1 as const,
    outputId: identifier(input.outputId, "outputId"),
    modality: input.modality,
    content,
    contentReference,
    metadata: normalizeMetadata(input.metadata, "output.metadata"),
  });
  if (
    jsonByteLength(output as unknown as JsonValue) > manifest.maximumOutputBytes
  ) {
    invalid("agent output exceeds the adapter byte limit");
  }
  return output;
}

function normalizeActionProposalV1(
  input: PortableAgentActionProposalV1,
  manifest: PortableAgentAdapterManifestV1,
): PortableAgentActionProposalV1 {
  exactKeys(
    input,
    [
      "schemaVersion",
      "actionId",
      "actionClass",
      "input",
      "riskClass",
      "metadata",
    ],
    "action proposal",
  );
  if (
    input.schemaVersion !== 1 ||
    !["low", "moderate", "high"].includes(input.riskClass)
  ) {
    invalid("action proposal is invalid");
  }
  const action = cloneAndFreeze({
    schemaVersion: 1 as const,
    actionId: identifier(input.actionId, "actionId"),
    actionClass: token(input.actionClass, "actionClass", 256),
    input: normalizeJsonObject(input.input, "action.input"),
    riskClass: input.riskClass,
    metadata: normalizeMetadata(input.metadata, "action.metadata"),
  });
  if (
    jsonByteLength(action as unknown as JsonValue) > manifest.maximumActionBytes
  ) {
    invalid("action proposal exceeds the adapter byte limit");
  }
  return action;
}

function normalizeContentReference(input: unknown, label: string) {
  exactKeys(input, ["uri", "mediaType", "byteLength", "contentDigest"], label);
  const value = input as PortableAgentObservationV1["contentReference"] & {};
  return cloneAndFreeze({
    uri: text(value.uri, `${label}.uri`, 4_096),
    mediaType: token(value.mediaType, `${label}.mediaType`, 256),
    byteLength: safeInteger(value.byteLength, `${label}.byteLength`, 0),
    contentDigest: token(value.contentDigest, `${label}.contentDigest`, 256),
  });
}

function exactKeys(
  input: unknown,
  keys: readonly string[],
  label: string,
): void {
  if (!isPlainRecord(input)) invalid(`${label} must be an object`);
  const actual = Object.keys(input).sort(compareAscii);
  const expected = [...keys].sort(compareAscii);
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    invalid(`${label} fields are invalid`);
  }
}

function enumArray<T extends string>(
  input: unknown,
  allowed: ReadonlySet<T>,
  label: string,
  maximum: number,
  requireNonEmpty: boolean,
): readonly T[] {
  if (
    !Array.isArray(input) ||
    input.length > maximum ||
    (requireNonEmpty && input.length === 0) ||
    input.some((value) => typeof value !== "string" || !allowed.has(value as T))
  ) {
    invalid(`${label} is invalid`);
  }
  const result = [...new Set(input as T[])].sort(compareAscii);
  if (result.length !== input.length) invalid(`${label} contains duplicates`);
  return Object.freeze(result);
}

function uniqueIds(ids: readonly string[], label: string): void {
  if (new Set(ids).size !== ids.length) invalid(`${label} IDs are duplicated`);
}

function nullableIdentifier(input: unknown, label: string): string | null {
  return input === null ? null : identifier(input, label);
}

function token(input: unknown, label: string, maximum: number): string {
  if (
    typeof input !== "string" ||
    input.length === 0 ||
    input.length > maximum ||
    input.trim() !== input ||
    /[\u0000-\u001f\u007f]/u.test(input)
  ) {
    invalid(`${label} must be bounded text`);
  }
  return input;
}

function text(input: unknown, label: string, maximum: number): string {
  if (
    typeof input !== "string" ||
    input.length === 0 ||
    input.length > maximum ||
    input.trim() !== input ||
    input.includes("\u0000")
  ) {
    invalid(`${label} must be bounded text`);
  }
  return input;
}

function boolean(input: unknown, label: string): boolean {
  if (typeof input !== "boolean") invalid(`${label} must be boolean`);
  return input;
}

function positiveInteger(
  input: unknown,
  label: string,
  maximum: number,
): number {
  return safeInteger(input, label, 1, maximum);
}

function safeInteger(
  input: unknown,
  label: string,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (
    !Number.isSafeInteger(input) ||
    (input as number) < minimum ||
    (input as number) > maximum
  ) {
    invalid(
      `${label} must be a safe integer from ${minimum} through ${maximum}`,
    );
  }
  return input as number;
}

function isPlainRecord(input: unknown): input is Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const prototype = Object.getPrototypeOf(input);
  return prototype === Object.prototype || prototype === null;
}

function sameJson(left: unknown, right: unknown): boolean {
  return (
    JSON.stringify(normalizeJson(left, "left")) ===
    JSON.stringify(normalizeJson(right, "right"))
  );
}

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(input: T): T {
  if (input && typeof input === "object" && !Object.isFrozen(input)) {
    Object.freeze(input);
    for (const key of Object.getOwnPropertyNames(input)) {
      deepFreeze((input as Record<string, unknown>)[key]);
    }
  }
  return input;
}

function invalid(message: string): never {
  throw new PortableAgentErrorV1("VALIDATION_ERROR", message);
}

function stateInvalid(message: string): never {
  throw new PortableAgentErrorV1("STATE_INVALID", message);
}
