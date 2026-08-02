import type { JsonValue } from "@agentplat/core";

import {
  deepFreezePlanning,
  digestPlanningJsonV1,
  planningUtf8ByteLengthV1,
  canonicalizePlanningJsonV1,
  CollectivePlanningValidationError,
} from "./canonical.js";
import type {
  AdvancePlanningLogicalTimeCommandV1,
  AdaptiveRoleBindingV1,
  EvaluatePlanningSlotCommandV1,
  FragmentWorkMappingV1,
  Increment2FragmentTransitionStatusV1,
  MissionObservationV1,
  MissionIntentV1,
  ObservePlanningFragmentAssignmentCommandV1,
  ObservePlanningFragmentExecutionCommandV1,
  ObservePlanningFragmentTerminalCommandV1,
  ObservePlanningWorkRevisionCommandV1,
  ObservedTerminalFragmentStatusV1,
  PlanFragmentDecisionV1,
  PlanFragmentProposalV1,
  PlanFragmentStatusV1,
  PlanFragmentV1,
  PlanningAdmittedSubjectV1,
  PlanningBudgetReservationV1,
  PlanningBudgetShardV1,
  PlanningDigestV1,
  PlanningDomainHighWaterV1,
  PlanningObservationCursorHighWaterV1,
  PlanningReducerCommandHighWaterV1,
  PlanningReducerCommandV1,
  PlanningReducerErrorCodeV1,
  PlanningReducerErrorV1,
  PlanningReducerEventKindV1,
  PlanningReducerEventV1,
  PlanningReducerResultV1,
  PlanningReducerSnapshotV1,
  PlanningReducerStateV1,
  PlanSelectionPolicyV1,
  PlanSemanticSlotHeadV1,
  PlanViewV1,
  PlanningWorkTargetV1,
  ProjectPlanningFragmentToWorkCommandV1,
  RecordPlanningObservationCommandV1,
  RecordPlanningProposalCommandV1,
  TransitionPlanningFragmentCommandV1,
} from "./contracts.js";
import {
  assertPlanningDigest,
  assertPlanningExactKeys,
  assertPlanningIdentifier,
  assertPlanningSafeInteger,
  assertPlanningToken,
  createAdaptiveRoleBindingV1,
  createPlanFragmentDecisionV1,
  createPlanFragmentV1,
  createPlanViewV1,
  validateMissionIntentV1,
  validateMissionObservationV1,
  validateAdaptiveRoleBindingV1,
  validatePlanFragmentProposalV1,
  validatePlanSelectionPolicyV1,
  validatePlanViewV1,
} from "./validation.js";

const STATE_LIMITS = Object.freeze({
  maximumBytes: 67_108_864,
  maximumDepth: 32,
  maximumNodes: 2_000_000,
  maximumKeysPerObject: 256,
  maximumItemsPerArray: 262_144,
});
const EMPTY_EVENTS = Object.freeze([]) as readonly [];
const SAFE_TRANSITIONS = new Set<Increment2FragmentTransitionStatusV1>([
  "superseded",
  "cancelled",
  "failed",
]);
const OBSERVED_TERMINAL_STATUSES = new Set<ObservedTerminalFragmentStatusV1>([
  "superseded",
  "cancelled",
  "completed",
  "failed",
]);

type CommandFactoryInput =
  | (Omit<RecordPlanningObservationCommandV1, "commandId" | "commandDigest"> & {
      readonly commandId?: string;
    })
  | (Omit<RecordPlanningProposalCommandV1, "commandId" | "commandDigest"> & {
      readonly commandId?: string;
    })
  | (Omit<EvaluatePlanningSlotCommandV1, "commandId" | "commandDigest"> & {
      readonly commandId?: string;
    })
  | (Omit<
      TransitionPlanningFragmentCommandV1,
      "commandId" | "commandDigest"
    > & {
      readonly commandId?: string;
    })
  | (Omit<
      ProjectPlanningFragmentToWorkCommandV1,
      "commandId" | "commandDigest"
    > & {
      readonly commandId?: string;
    })
  | (Omit<
      ObservePlanningFragmentAssignmentCommandV1,
      "commandId" | "commandDigest"
    > & {
      readonly commandId?: string;
    })
  | (Omit<
      ObservePlanningFragmentExecutionCommandV1,
      "commandId" | "commandDigest"
    > & {
      readonly commandId?: string;
    })
  | (Omit<
      ObservePlanningFragmentTerminalCommandV1,
      "commandId" | "commandDigest"
    > & {
      readonly commandId?: string;
    })
  | (Omit<
      ObservePlanningWorkRevisionCommandV1,
      "commandId" | "commandDigest"
    > & {
      readonly commandId?: string;
    })
  | (Omit<
      AdvancePlanningLogicalTimeCommandV1,
      "commandId" | "commandDigest"
    > & {
      readonly commandId?: string;
    });

type CommandWithoutDigest =
  | Omit<RecordPlanningObservationCommandV1, "commandDigest">
  | Omit<RecordPlanningProposalCommandV1, "commandDigest">
  | Omit<EvaluatePlanningSlotCommandV1, "commandDigest">
  | Omit<TransitionPlanningFragmentCommandV1, "commandDigest">
  | Omit<ProjectPlanningFragmentToWorkCommandV1, "commandDigest">
  | Omit<ObservePlanningFragmentAssignmentCommandV1, "commandDigest">
  | Omit<ObservePlanningFragmentExecutionCommandV1, "commandDigest">
  | Omit<ObservePlanningFragmentTerminalCommandV1, "commandDigest">
  | Omit<ObservePlanningWorkRevisionCommandV1, "commandDigest">
  | Omit<AdvancePlanningLogicalTimeCommandV1, "commandDigest">;

export interface CreatePlanningReducerStateInputV1 {
  readonly schemaVersion: 1;
  readonly peerId: string;
  readonly peerInstanceId: string;
  readonly missionIntent: MissionIntentV1;
  readonly selectionPolicy: PlanSelectionPolicyV1;
  readonly admittedSubjects: readonly PlanningAdmittedSubjectV1[];
  readonly logicalTimeMs?: number;
}

function descriptorValue(object: object, key: PropertyKey): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (!descriptor || !("value" in descriptor))
    throw new CollectivePlanningValidationError(
      "planning reducer values may not contain accessors",
    );
  return descriptor.value;
}

function without<T extends Record<string, unknown>>(
  value: T,
  key: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const name of Object.getOwnPropertyNames(value))
    if (name !== key) result[name] = descriptorValue(value, name);
  return result;
}

function sortedUniqueStrings(
  value: unknown,
  label: string,
  maximum = 262_144,
): readonly string[] {
  if (!Array.isArray(value))
    throw new CollectivePlanningValidationError(`${label} must be an array`);
  if (value.length > maximum)
    throw new CollectivePlanningValidationError(`${label} is too large`);
  if (Object.getOwnPropertySymbols(value).length > 0)
    throw new CollectivePlanningValidationError(
      `${label} may not contain symbol keys`,
    );
  const result: string[] = [];
  let previous: string | undefined;
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable)
      throw new CollectivePlanningValidationError(`${label} must contain data`);
    const item = descriptor.value;
    if (
      typeof item !== "string" ||
      (previous !== undefined && previous >= item)
    )
      throw new CollectivePlanningValidationError(
        `${label} must be sorted and unique`,
      );
    previous = item;
    result.push(item);
  }
  if (Object.getOwnPropertyNames(value).length !== value.length + 1)
    throw new CollectivePlanningValidationError(
      `${label} may not contain extra properties`,
    );
  return result;
}

function subjectKey(peerId: string, peerInstanceId: string): string {
  return `${peerId}\u0000${peerInstanceId}`;
}

function cursorKey(observation: MissionObservationV1): string {
  return `${observation.observerPeerId}\u0000${observation.observerInstanceId}\u0000${observation.environmentCursor}`;
}

function recordKey(item: PlanningDomainHighWaterV1): string {
  return `${item.domain}\u0000${item.recordId}`;
}

function validateWorkTarget(
  value: unknown,
  label: string,
): PlanningWorkTargetV1 {
  assertPlanningExactKeys(
    value,
    [
      "schemaVersion",
      "meshId",
      "objectiveId",
      "workItemId",
      "workItemRevision",
    ],
    label,
  );
  if (value.schemaVersion !== 1)
    throw new CollectivePlanningValidationError(
      `${label} schemaVersion is invalid`,
    );
  assertPlanningIdentifier(value.meshId, "meshId");
  assertPlanningIdentifier(value.objectiveId, "objectiveId");
  assertPlanningIdentifier(value.workItemId, "workItemId");
  assertPlanningSafeInteger(value.workItemRevision, "workItemRevision", 1);
  return deepFreezePlanning({ ...value }) as unknown as PlanningWorkTargetV1;
}

function validateWorkMapping(
  value: unknown,
  label: string,
): FragmentWorkMappingV1 {
  assertPlanningExactKeys(
    value,
    [
      "schemaVersion",
      "fragmentDigest",
      "meshId",
      "objectiveId",
      "workItemId",
      "workItemRevision",
    ],
    label,
  );
  if (value.schemaVersion !== 1)
    throw new CollectivePlanningValidationError(
      `${label} schemaVersion is invalid`,
    );
  assertPlanningDigest(value.fragmentDigest, "fragmentDigest");
  const target = validateWorkTarget(
    {
      schemaVersion: value.schemaVersion,
      meshId: value.meshId,
      objectiveId: value.objectiveId,
      workItemId: value.workItemId,
      workItemRevision: value.workItemRevision,
    },
    label,
  );
  return deepFreezePlanning({
    ...target,
    fragmentDigest: value.fragmentDigest as PlanningDigestV1,
  });
}

function fragmentSortKey(fragment: PlanFragmentV1): string {
  return `${fragment.fragmentId}\u0000${String(fragment.fragmentRevision).padStart(16, "0")}`;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function domainDigest(
  domain: "planning-reducer-command-identity" | "planning-reducer-transition",
  value: unknown,
): PlanningDigestV1 {
  return digestPlanningJsonV1(domain, value as JsonValue, STATE_LIMITS);
}

function commandIdentity(command: CommandWithoutDigest): JsonValue {
  switch (command.kind) {
    case "observation.record":
      return {
        kind: command.kind,
        observerPeerId: command.observation.observerPeerId,
        observerInstanceId: command.observation.observerInstanceId,
        environmentCursor: command.observation.environmentCursor,
      };
    case "proposal.record":
      return { kind: command.kind, proposalId: command.proposal.proposalId };
    case "slot.evaluate":
      return {
        kind: command.kind,
        semanticSlotKey: command.semanticSlotKey,
        candidateProposalDigests: command.candidateProposalDigests,
        decidedAtLogicalMs: command.decidedAtLogicalMs,
      } as unknown as JsonValue;
    case "fragment.transition":
      return {
        kind: command.kind,
        fragmentId: command.fragmentId,
        previousFragmentDigest: command.previousFragmentDigest,
        status: command.status,
      };
    case "fragment.project-to-work":
      return {
        kind: command.kind,
        fragmentId: command.fragmentId,
        previousFragmentDigest: command.previousFragmentDigest,
        workTarget: command.workTarget,
      } as unknown as JsonValue;
    case "fragment.assignment.observe":
      return {
        kind: command.kind,
        fragmentId: command.fragmentId,
        previousFragmentDigest: command.previousFragmentDigest,
        expectedWorkMapping: command.expectedWorkMapping,
        roleBindingDigest: command.roleBinding.roleBindingDigest,
      } as unknown as JsonValue;
    case "fragment.execution.observe":
      return {
        kind: command.kind,
        fragmentId: command.fragmentId,
        previousFragmentDigest: command.previousFragmentDigest,
        previousRoleBindingDigest: command.previousRoleBindingDigest,
        roleBindingDigest: command.roleBinding.roleBindingDigest,
      } as unknown as JsonValue;
    case "fragment.terminal.observe":
      return {
        kind: command.kind,
        fragmentId: command.fragmentId,
        previousFragmentDigest: command.previousFragmentDigest,
        status: command.status,
        expectedWorkMapping: command.expectedWorkMapping,
        expectedRoleBindingDigest: command.expectedRoleBindingDigest,
      } as unknown as JsonValue;
    case "work.revision.observe":
      return {
        kind: command.kind,
        fragmentId: command.fragmentId,
        previousFragmentDigest: command.previousFragmentDigest,
        workTarget: command.workTarget,
        roleBindingDigest: null,
      } as unknown as JsonValue;
    case "logical-time.advance":
      return { kind: command.kind, logicalTimeMs: command.logicalTimeMs };
  }
}

function deriveCommandId(command: CommandWithoutDigest): string {
  const digest = domainDigest(
    "planning-reducer-command-identity",
    commandIdentity(command),
  );
  return `planning-command:${digest.slice(7)}`;
}

export function planningReducerCommandDigestV1(
  command: CommandWithoutDigest,
): PlanningDigestV1 {
  const withoutConcurrencyPrecondition = without(
    command as unknown as Record<string, unknown>,
    "expectedStateDigest",
  );
  const content =
    command.kind === "fragment.transition" ||
    command.kind === "fragment.project-to-work" ||
    command.kind === "fragment.terminal.observe"
      ? without(withoutConcurrencyPrecondition, "transitionedAtLogicalMs")
      : withoutConcurrencyPrecondition;
  return digestPlanningJsonV1(
    "planning-reducer-command",
    content as JsonValue,
    STATE_LIMITS,
  );
}

function commandKeys(
  kind: PlanningReducerCommandV1["kind"],
): readonly string[] {
  const common = [
    "schemaVersion",
    "kind",
    "commandId",
    "expectedStateDigest",
    "commandDigest",
  ];
  switch (kind) {
    case "observation.record":
      return [...common, "observation"];
    case "proposal.record":
      return [...common, "proposal"];
    case "slot.evaluate":
      return [
        ...common,
        "semanticSlotKey",
        "candidateProposalDigests",
        "decidedAtLogicalMs",
      ];
    case "fragment.transition":
      return [
        ...common,
        "fragmentId",
        "previousFragmentDigest",
        "status",
        "transitionedAtLogicalMs",
      ];
    case "fragment.project-to-work":
      return [
        ...common,
        "fragmentId",
        "previousFragmentDigest",
        "workTarget",
        "transitionedAtLogicalMs",
      ];
    case "fragment.assignment.observe":
      return [
        ...common,
        "fragmentId",
        "previousFragmentDigest",
        "expectedWorkMapping",
        "roleBinding",
      ];
    case "fragment.execution.observe":
      return [
        ...common,
        "fragmentId",
        "previousFragmentDigest",
        "previousRoleBindingDigest",
        "roleBinding",
      ];
    case "fragment.terminal.observe":
      return [
        ...common,
        "fragmentId",
        "previousFragmentDigest",
        "status",
        "expectedWorkMapping",
        "expectedRoleBindingDigest",
        "transitionedAtLogicalMs",
      ];
    case "work.revision.observe":
      return [
        ...common,
        "fragmentId",
        "previousFragmentDigest",
        "expectedWorkMapping",
        "workTarget",
        "roleBinding",
      ];
    case "logical-time.advance":
      return [...common, "logicalTimeMs"];
  }
}

function validateCommandFactoryInputShape(
  input: unknown,
): asserts input is CommandFactoryInput {
  if (input === null || typeof input !== "object" || Array.isArray(input))
    throw new CollectivePlanningValidationError(
      "planning reducer command input must be a plain object",
    );
  const kind = descriptorValue(input, "kind");
  if (
    typeof kind !== "string" ||
    !new Set([
      "observation.record",
      "proposal.record",
      "slot.evaluate",
      "fragment.transition",
      "fragment.project-to-work",
      "fragment.assignment.observe",
      "fragment.execution.observe",
      "fragment.terminal.observe",
      "work.revision.observe",
      "logical-time.advance",
    ]).has(kind)
  )
    throw new CollectivePlanningValidationError(
      "planning reducer command kind is invalid",
    );
  const expected = commandKeys(kind as PlanningReducerCommandV1["kind"]).filter(
    (key) =>
      key !== "commandDigest" &&
      (key !== "commandId" ||
        Object.prototype.hasOwnProperty.call(input, "commandId")),
  );
  assertPlanningExactKeys(input, expected, "planning reducer command input");
}

export function validatePlanningReducerCommandV1(
  value: unknown,
): PlanningReducerCommandV1 {
  assertPlanningExactKeys(
    value,
    Object.getOwnPropertyNames(value as object).includes("kind") &&
      typeof descriptorValue(value as object, "kind") === "string" &&
      new Set([
        "observation.record",
        "proposal.record",
        "slot.evaluate",
        "fragment.transition",
        "fragment.project-to-work",
        "fragment.assignment.observe",
        "fragment.execution.observe",
        "fragment.terminal.observe",
        "work.revision.observe",
        "logical-time.advance",
      ]).has(descriptorValue(value as object, "kind") as string)
      ? commandKeys(
          descriptorValue(
            value as object,
            "kind",
          ) as PlanningReducerCommandV1["kind"],
        )
      : [],
    "planning reducer command",
  );
  if (value.schemaVersion !== 1)
    throw new CollectivePlanningValidationError(
      "command schemaVersion is invalid",
    );
  assertPlanningIdentifier(value.commandId, "commandId");
  if (value.expectedStateDigest !== null)
    assertPlanningDigest(value.expectedStateDigest, "expectedStateDigest");
  switch (value.kind) {
    case "observation.record":
      validateMissionObservationV1(value.observation);
      break;
    case "proposal.record":
      validatePlanFragmentProposalV1(value.proposal);
      break;
    case "slot.evaluate":
      assertPlanningToken(value.semanticSlotKey, "semanticSlotKey");
      {
        const candidates = sortedUniqueStrings(
          value.candidateProposalDigests,
          "candidateProposalDigests",
        );
        for (const digest of candidates)
          assertPlanningDigest(digest, "candidateProposalDigest");
        if (candidates.length === 0)
          throw new CollectivePlanningValidationError(
            "candidate set must not be empty",
          );
      }
      assertPlanningSafeInteger(value.decidedAtLogicalMs, "decidedAtLogicalMs");
      break;
    case "fragment.transition":
      assertPlanningIdentifier(value.fragmentId, "fragmentId");
      assertPlanningDigest(
        value.previousFragmentDigest,
        "previousFragmentDigest",
      );
      if (
        !SAFE_TRANSITIONS.has(
          value.status as Increment2FragmentTransitionStatusV1,
        )
      )
        throw new CollectivePlanningValidationError(
          "fragment transition status is not Increment-2-safe",
        );
      assertPlanningSafeInteger(
        value.transitionedAtLogicalMs,
        "transitionedAtLogicalMs",
      );
      break;
    case "fragment.project-to-work":
      assertPlanningIdentifier(value.fragmentId, "fragmentId");
      assertPlanningDigest(
        value.previousFragmentDigest,
        "previousFragmentDigest",
      );
      validateWorkTarget(value.workTarget, "workTarget");
      assertPlanningSafeInteger(
        value.transitionedAtLogicalMs,
        "transitionedAtLogicalMs",
      );
      break;
    case "fragment.assignment.observe":
      assertPlanningIdentifier(value.fragmentId, "fragmentId");
      assertPlanningDigest(
        value.previousFragmentDigest,
        "previousFragmentDigest",
      );
      validateWorkMapping(value.expectedWorkMapping, "expectedWorkMapping");
      validateAdaptiveRoleBindingV1(value.roleBinding);
      break;
    case "fragment.execution.observe":
      assertPlanningIdentifier(value.fragmentId, "fragmentId");
      assertPlanningDigest(
        value.previousFragmentDigest,
        "previousFragmentDigest",
      );
      assertPlanningDigest(
        value.previousRoleBindingDigest,
        "previousRoleBindingDigest",
      );
      validateAdaptiveRoleBindingV1(value.roleBinding);
      break;
    case "fragment.terminal.observe":
      assertPlanningIdentifier(value.fragmentId, "fragmentId");
      assertPlanningDigest(
        value.previousFragmentDigest,
        "previousFragmentDigest",
      );
      if (
        !OBSERVED_TERMINAL_STATUSES.has(
          value.status as ObservedTerminalFragmentStatusV1,
        )
      )
        throw new CollectivePlanningValidationError(
          "observed terminal status is invalid",
        );
      validateWorkMapping(value.expectedWorkMapping, "expectedWorkMapping");
      if (value.expectedRoleBindingDigest !== null)
        assertPlanningDigest(
          value.expectedRoleBindingDigest,
          "expectedRoleBindingDigest",
        );
      assertPlanningSafeInteger(
        value.transitionedAtLogicalMs,
        "transitionedAtLogicalMs",
      );
      break;
    case "work.revision.observe":
      assertPlanningIdentifier(value.fragmentId, "fragmentId");
      assertPlanningDigest(
        value.previousFragmentDigest,
        "previousFragmentDigest",
      );
      validateWorkMapping(value.expectedWorkMapping, "expectedWorkMapping");
      validateWorkTarget(value.workTarget, "workTarget");
      if (value.roleBinding !== null)
        throw new CollectivePlanningValidationError(
          "Work revision cannot retain assignment authority",
        );
      break;
    case "logical-time.advance":
      assertPlanningSafeInteger(value.logicalTimeMs, "logicalTimeMs");
      break;
  }
  assertPlanningDigest(value.commandDigest, "commandDigest");
  const commandWithoutDigest = without(
    value,
    "commandDigest",
  ) as unknown as CommandWithoutDigest;
  if (deriveCommandId(commandWithoutDigest) !== value.commandId)
    throw new CollectivePlanningValidationError("commandId mismatch");
  if (
    planningReducerCommandDigestV1(commandWithoutDigest) !== value.commandDigest
  )
    throw new CollectivePlanningValidationError("commandDigest mismatch");
  return deepFreezePlanning({
    ...value,
  }) as unknown as PlanningReducerCommandV1;
}

export function createPlanningReducerCommandV1(
  input: CommandFactoryInput,
): PlanningReducerCommandV1 {
  validateCommandFactoryInputShape(input);
  // Detach nested records before deriving an identity. Their validators reject
  // accessors and symbols without invoking attacker-controlled properties.
  const detachedInput =
    input.kind === "observation.record"
      ? {
          ...input,
          observation: validateMissionObservationV1(input.observation),
        }
      : input.kind === "proposal.record"
        ? { ...input, proposal: validatePlanFragmentProposalV1(input.proposal) }
        : input.kind === "slot.evaluate"
          ? {
              ...input,
              candidateProposalDigests: sortedUniqueStrings(
                input.candidateProposalDigests,
                "candidateProposalDigests",
              ),
            }
          : input.kind === "fragment.project-to-work"
            ? {
                ...input,
                workTarget: validateWorkTarget(input.workTarget, "workTarget"),
              }
            : input.kind === "fragment.assignment.observe"
              ? {
                  ...input,
                  expectedWorkMapping: validateWorkMapping(
                    input.expectedWorkMapping,
                    "expectedWorkMapping",
                  ),
                  roleBinding: validateAdaptiveRoleBindingV1(input.roleBinding),
                }
              : input.kind === "fragment.execution.observe"
                ? {
                    ...input,
                    roleBinding: validateAdaptiveRoleBindingV1(
                      input.roleBinding,
                    ),
                  }
                : input.kind === "fragment.terminal.observe"
                  ? {
                      ...input,
                      expectedWorkMapping: validateWorkMapping(
                        input.expectedWorkMapping,
                        "expectedWorkMapping",
                      ),
                    }
                  : input.kind === "work.revision.observe"
                    ? {
                        ...input,
                        expectedWorkMapping: validateWorkMapping(
                          input.expectedWorkMapping,
                          "expectedWorkMapping",
                        ),
                        workTarget: validateWorkTarget(
                          input.workTarget,
                          "workTarget",
                        ),
                        roleBinding: null,
                      }
                    : input;
  const withPlaceholder = {
    ...detachedInput,
    commandId: detachedInput.commandId ?? "planning-command:placeholder",
  } as unknown as CommandWithoutDigest;
  const commandId = deriveCommandId(withPlaceholder);
  if (
    detachedInput.commandId !== undefined &&
    detachedInput.commandId !== commandId
  )
    throw new CollectivePlanningValidationError("commandId mismatch");
  const command = {
    ...detachedInput,
    commandId,
  } as unknown as CommandWithoutDigest;
  return validatePlanningReducerCommandV1({
    ...command,
    commandDigest: planningReducerCommandDigestV1(command),
  });
}

export function planningReducerStateDigestV1(
  state: Omit<PlanningReducerStateV1, "stateDigest">,
): PlanningDigestV1 {
  return digestPlanningJsonV1(
    "planning-reducer-state",
    state as unknown as JsonValue,
    STATE_LIMITS,
  );
}

function validateSubject(value: unknown): PlanningAdmittedSubjectV1 {
  assertPlanningExactKeys(
    value,
    ["schemaVersion", "peerId", "peerInstanceId"],
    "admitted subject",
  );
  if (value.schemaVersion !== 1)
    throw new CollectivePlanningValidationError(
      "admitted subject schemaVersion is invalid",
    );
  assertPlanningIdentifier(value.peerId, "peerId");
  assertPlanningIdentifier(value.peerInstanceId, "peerInstanceId");
  return deepFreezePlanning({
    ...value,
  }) as unknown as PlanningAdmittedSubjectV1;
}

function validateRecordHighWater(value: unknown): PlanningDomainHighWaterV1 {
  assertPlanningExactKeys(
    value,
    ["schemaVersion", "domain", "recordId", "revision", "digest"],
    "record high-water",
  );
  if (
    value.schemaVersion !== 1 ||
    !new Set(["observation", "proposal", "decision", "fragment"]).has(
      value.domain as string,
    )
  )
    throw new CollectivePlanningValidationError(
      "record high-water domain is invalid",
    );
  assertPlanningIdentifier(value.recordId, "recordId");
  assertPlanningSafeInteger(value.revision, "revision", 1);
  assertPlanningDigest(value.digest, "digest");
  return deepFreezePlanning({
    ...value,
  }) as unknown as PlanningDomainHighWaterV1;
}

function validateCursorHighWater(
  value: unknown,
): PlanningObservationCursorHighWaterV1 {
  assertPlanningExactKeys(
    value,
    [
      "schemaVersion",
      "observerPeerId",
      "observerInstanceId",
      "environmentCursor",
      "observationId",
      "observationDigest",
      "logicalTimeMs",
    ],
    "observation cursor high-water",
  );
  if (value.schemaVersion !== 1)
    throw new CollectivePlanningValidationError(
      "cursor high-water schemaVersion is invalid",
    );
  assertPlanningIdentifier(value.observerPeerId, "observerPeerId");
  assertPlanningIdentifier(value.observerInstanceId, "observerInstanceId");
  assertPlanningIdentifier(value.environmentCursor, "environmentCursor");
  assertPlanningIdentifier(value.observationId, "observationId");
  assertPlanningDigest(value.observationDigest, "observationDigest");
  assertPlanningSafeInteger(value.logicalTimeMs, "logicalTimeMs");
  return deepFreezePlanning({
    ...value,
  }) as unknown as PlanningObservationCursorHighWaterV1;
}

function validateCommandHighWater(
  value: unknown,
): PlanningReducerCommandHighWaterV1 {
  assertPlanningExactKeys(
    value,
    [
      "schemaVersion",
      "commandId",
      "commandDigest",
      "command",
      ...(Object.prototype.hasOwnProperty.call(value, "appliedAtLogicalMs")
        ? ["appliedAtLogicalMs"]
        : []),
    ],
    "command high-water",
  );
  if (value.schemaVersion !== 1)
    throw new CollectivePlanningValidationError(
      "command high-water schemaVersion is invalid",
    );
  assertPlanningIdentifier(value.commandId, "commandId");
  assertPlanningDigest(value.commandDigest, "commandDigest");
  const command = validatePlanningReducerCommandV1(value.command);
  const increment3Lifecycle = new Set([
    "fragment.project-to-work",
    "fragment.assignment.observe",
    "fragment.execution.observe",
    "fragment.terminal.observe",
    "work.revision.observe",
  ]).has(command.kind);
  if (value.appliedAtLogicalMs !== undefined)
    assertPlanningSafeInteger(value.appliedAtLogicalMs, "appliedAtLogicalMs");
  if (
    command.commandId !== value.commandId ||
    command.commandDigest !== value.commandDigest ||
    command.expectedStateDigest !== null ||
    (command.kind === "fragment.transition" &&
      command.transitionedAtLogicalMs !== 0) ||
    (increment3Lifecycle && value.appliedAtLogicalMs === undefined)
  )
    throw new CollectivePlanningValidationError(
      "command high-water differs from its canonical retained command",
    );
  return deepFreezePlanning({
    ...value,
    command,
  }) as unknown as PlanningReducerCommandHighWaterV1;
}

function validateSortedRecords<T>(
  value: unknown,
  label: string,
  maximum: number,
  validate: (item: unknown) => T,
  key: (item: T) => string,
): readonly T[] {
  if (!Array.isArray(value) || value.length > maximum)
    throw new CollectivePlanningValidationError(`${label} has invalid length`);
  if (
    Object.getOwnPropertySymbols(value).length > 0 ||
    Object.getOwnPropertyNames(value).length !== value.length + 1
  )
    throw new CollectivePlanningValidationError(
      `${label} may not contain symbol, sparse or extra properties`,
    );
  const result: T[] = [];
  let previous: string | undefined;
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable)
      throw new CollectivePlanningValidationError(`${label} must contain data`);
    const item = validate(descriptor.value);
    const current = key(item);
    if (previous !== undefined && previous >= current)
      throw new CollectivePlanningValidationError(
        `${label} must be sorted and unique`,
      );
    previous = current;
    result.push(item);
  }
  return result;
}

function equalBudgetShards(
  intent: MissionIntentV1,
  subjects: readonly PlanningAdmittedSubjectV1[],
): readonly PlanningBudgetShardV1[] {
  const units = Math.floor(
    intent.planningLimits.maximumTotalPlanningBudgetUnits / subjects.length,
  );
  return subjects.map((subject) => ({
    schemaVersion: 1,
    peerId: subject.peerId,
    peerInstanceId: subject.peerInstanceId,
    budgetUnits: units,
  }));
}

function sameJson(left: unknown, right: unknown): boolean {
  return (
    canonicalizePlanningJsonV1(left as JsonValue, STATE_LIMITS) ===
    canonicalizePlanningJsonV1(right as JsonValue, STATE_LIMITS)
  );
}

function validateReducerStateLimits(
  intent: MissionIntentV1,
  observations: readonly MissionObservationV1[],
  view: PlanViewV1,
): void {
  const limits = intent.planningLimits;
  if (view.proposals.length > limits.maximumCandidateFragments)
    throw new CollectivePlanningValidationError(
      "proposal count exceeds the mission limit",
    );
  const observationDigests = new Set(
    observations.map((item) => item.observationDigest),
  );
  const permittedCapabilities = new Set(intent.permittedCapabilityKeys);
  const permittedOutcomes = new Set(intent.outcomeStatements);
  const proposalsBySubject = new Map<string, number>();
  const proposalsBySlot = new Map<string, number>();
  const decided = new Set(view.decisions.map((item) => item.proposalDigest));
  for (const proposal of view.proposals) {
    const key = subjectKey(
      proposal.proposerPeerId,
      proposal.proposerInstanceId,
    );
    proposalsBySubject.set(key, (proposalsBySubject.get(key) ?? 0) + 1);
    proposalsBySlot.set(
      proposal.semanticSlotKey,
      (proposalsBySlot.get(proposal.semanticSlotKey) ?? 0) + 1,
    );
    if (
      proposal.parentFragmentDigests.length > limits.maximumDependencyFanout ||
      proposal.dependencyFragmentDigests.length >
        limits.maximumDependencyFanout ||
      proposal.outcomeStatements.length > limits.maximumOutcomeTerms ||
      proposal.requiredCapabilityKeys.length > limits.maximumCapabilityTerms ||
      proposal.requestedBudgetUnits > limits.maximumFragmentBudgetUnits ||
      proposal.requiredCapabilityKeys.some(
        (item) => !permittedCapabilities.has(item),
      ) ||
      proposal.outcomeStatements.some((item) => !permittedOutcomes.has(item)) ||
      proposal.basisObservationDigests.some(
        (item) => !observationDigests.has(item),
      ) ||
      planningUtf8ByteLengthV1(
        canonicalizePlanningJsonV1(proposal as unknown as JsonValue),
      ) > limits.maximumProposalBytes
    )
      throw new CollectivePlanningValidationError(
        "proposal exceeds mission scope or planning limits",
      );
  }
  if (
    [...proposalsBySubject.values()].some(
      (count) => count > limits.maximumFragmentsPerPeer,
    ) ||
    [...proposalsBySlot.values()].some(
      (count) => count > limits.maximumRevisionsPerSemanticSlot,
    ) ||
    view.proposals.filter((item) => !decided.has(item.proposalDigest)).length >
      limits.maximumConcurrentProposals
  )
    throw new CollectivePlanningValidationError(
      "proposal history exceeds per-subject, per-slot or concurrency limits",
    );
  const latest = latestFragments(view);
  const fragmentRevisionCounts = new Map<string, number>();
  for (const fragment of view.fragments)
    fragmentRevisionCounts.set(
      fragment.fragmentId,
      (fragmentRevisionCounts.get(fragment.fragmentId) ?? 0) + 1,
    );
  if (
    [...fragmentRevisionCounts.values()].some(
      (count) => count > limits.maximumRevisionsPerSemanticSlot,
    )
  )
    throw new CollectivePlanningValidationError(
      "fragment state history exceeds its revision limit",
    );
  const activeCount = [...latest.values()].filter(
    (item) => item.status === "active",
  ).length;
  if (activeCount > limits.maximumActiveFragments)
    throw new CollectivePlanningValidationError(
      "active fragment count exceeds the mission limit",
    );
  const byDigest = new Map<string, PlanFragmentV1>(
    view.fragments.map((item) => [item.fragmentDigest, item]),
  );
  const visiting = new Set<string>();
  const depths = new Map<string, number>();
  const depthOf = (digest: string): number => {
    const known = depths.get(digest);
    if (known !== undefined) return known;
    if (visiting.has(digest))
      throw new CollectivePlanningValidationError(
        "fragment graph contains a cycle",
      );
    const fragment = byDigest.get(digest);
    if (!fragment) return 0;
    visiting.add(digest);
    const edges = [
      ...fragment.parentFragmentDigests,
      ...fragment.dependencyFragmentDigests,
      ...(fragment.predecessorFragmentDigest === null
        ? []
        : [fragment.predecessorFragmentDigest]),
    ];
    if (new Set(edges).size > limits.maximumDependencyFanout)
      throw new CollectivePlanningValidationError(
        "fragment graph fanout exceeds the mission limit",
      );
    let depth = 1;
    for (const edge of edges) depth = Math.max(depth, 1 + depthOf(edge));
    visiting.delete(digest);
    if (depth > limits.maximumDependencyDepth)
      throw new CollectivePlanningValidationError(
        "fragment graph depth exceeds the mission limit",
      );
    depths.set(digest, depth);
    return depth;
  };
  for (const digest of byDigest.keys()) depthOf(digest);
}

export function validatePlanningReducerStateV1(
  value: unknown,
): PlanningReducerStateV1 {
  assertPlanningExactKeys(
    value,
    [
      "schemaVersion",
      "tenantId",
      "policyDomainId",
      "peerId",
      "peerInstanceId",
      "missionIntent",
      "selectionPolicy",
      "admittedSubjects",
      "observations",
      "planView",
      "recordHighWaters",
      "observationCursorHighWaters",
      "commandHighWaters",
      "stateDigest",
    ],
    "planning reducer state",
  );
  if (value.schemaVersion !== 1)
    throw new CollectivePlanningValidationError(
      "state schemaVersion is invalid",
    );
  assertPlanningIdentifier(value.tenantId, "tenantId");
  assertPlanningIdentifier(value.policyDomainId, "policyDomainId");
  assertPlanningIdentifier(value.peerId, "peerId");
  assertPlanningIdentifier(value.peerInstanceId, "peerInstanceId");
  const intent = validateMissionIntentV1(value.missionIntent);
  const policy = validatePlanSelectionPolicyV1(value.selectionPolicy);
  const subjects = validateSortedRecords(
    value.admittedSubjects,
    "admittedSubjects",
    65_536,
    validateSubject,
    (item) => subjectKey(item.peerId, item.peerInstanceId),
  );
  if (
    subjects.length === 0 ||
    !subjects.some(
      (item) =>
        item.peerId === value.peerId &&
        item.peerInstanceId === value.peerInstanceId,
    )
  )
    throw new CollectivePlanningValidationError(
      "local planning subject is not admitted",
    );
  if (
    !Array.isArray(value.observations) ||
    value.observations.length > intent.planningLimits.maximumCandidateFragments
  )
    throw new CollectivePlanningValidationError(
      "observations exceed their bound",
    );
  const observations = validateSortedRecords(
    value.observations,
    "observations",
    intent.planningLimits.maximumCandidateFragments,
    validateMissionObservationV1,
    cursorKey,
  );
  const view = validatePlanViewV1(value.planView);
  const records = validateSortedRecords(
    value.recordHighWaters,
    "recordHighWaters",
    intent.planningLimits.maximumCandidateFragments * 4,
    validateRecordHighWater,
    recordKey,
  );
  const cursors = validateSortedRecords(
    value.observationCursorHighWaters,
    "observationCursorHighWaters",
    intent.planningLimits.maximumCandidateFragments,
    validateCursorHighWater,
    (item) =>
      `${item.observerPeerId}\u0000${item.observerInstanceId}\u0000${item.environmentCursor}`,
  );
  const commands = validateSortedRecords(
    value.commandHighWaters,
    "commandHighWaters",
    intent.planningLimits.maximumCandidateFragments * 8,
    validateCommandHighWater,
    (item) => item.commandId,
  );
  if (
    intent.tenantId !== value.tenantId ||
    intent.policyDomainId !== value.policyDomainId ||
    intent.selectionPolicyDigest !== policy.policyDigest ||
    view.tenantId !== value.tenantId ||
    view.policyDomainId !== value.policyDomainId ||
    view.peerId !== value.peerId ||
    view.peerInstanceId !== value.peerInstanceId ||
    view.missionIntentId !== intent.missionIntentId ||
    view.intentRevision !== intent.revision ||
    view.intentDigest !== intent.intentDigest ||
    view.selectionPolicyDigest !== policy.policyDigest
  )
    throw new CollectivePlanningValidationError(
      "state identity, intent, policy and view bindings differ",
    );
  validateReducerStateLimits(intent, observations, view);
  const expectedShards = equalBudgetShards(intent, subjects);
  if (!sameJson(view.budgetShards, expectedShards))
    throw new CollectivePlanningValidationError(
      "frozen budget shard layout differs from admitted subjects",
    );
  const observationByCursor = new Map(
    observations.map((item) => [cursorKey(item), item]),
  );
  if (cursors.length !== observations.length)
    throw new CollectivePlanningValidationError(
      "cursor high-waters must exactly cover observation history",
    );
  for (const cursor of cursors) {
    const observation = observationByCursor.get(
      `${cursor.observerPeerId}\u0000${cursor.observerInstanceId}\u0000${cursor.environmentCursor}`,
    );
    if (
      !observation ||
      observation.observationId !== cursor.observationId ||
      observation.observationDigest !== cursor.observationDigest ||
      observation.logicalTimeMs !== cursor.logicalTimeMs
    )
      throw new CollectivePlanningValidationError(
        "cursor high-water differs from observation history",
      );
  }
  const recordByKey = new Map(records.map((item) => [recordKey(item), item]));
  for (const observation of observations) {
    if (
      observation.missionIntentId !== intent.missionIntentId ||
      observation.intentRevision !== intent.revision ||
      observation.intentDigest !== intent.intentDigest
    )
      throw new CollectivePlanningValidationError(
        "observation intent binding differs from state",
      );
    const record = recordByKey.get(
      `observation\u0000${observation.observationId}`,
    );
    if (
      !record ||
      record.revision !== 1 ||
      record.digest !== observation.observationDigest
    )
      throw new CollectivePlanningValidationError(
        "record high-waters do not cover observations",
      );
  }
  for (const proposal of view.proposals) {
    const record = recordByKey.get(`proposal\u0000${proposal.proposalId}`);
    if (
      !record ||
      record.revision !== proposal.proposalRevision ||
      record.digest !== proposal.proposalDigest
    )
      throw new CollectivePlanningValidationError(
        "record high-waters do not cover proposals",
      );
  }
  for (const decision of view.decisions) {
    const record = recordByKey.get(`decision\u0000${decision.decisionId}`);
    if (
      !record ||
      record.revision !== decision.localPlanViewRevision ||
      record.digest !== decision.decisionDigest
    )
      throw new CollectivePlanningValidationError(
        "record high-waters do not cover decisions",
      );
  }
  for (const fragment of latestFragments(view).values()) {
    const record = recordByKey.get(`fragment\u0000${fragment.fragmentId}`);
    if (
      !record ||
      record.revision !== fragment.fragmentRevision ||
      record.digest !== fragment.fragmentDigest
    )
      throw new CollectivePlanningValidationError(
        "record high-waters do not cover fragment history",
      );
  }
  const latestFragmentCount = latestFragments(view).size;
  const expectedRecordCount =
    observations.length +
    view.proposals.length +
    view.decisions.length +
    latestFragmentCount;
  if (records.length !== expectedRecordCount)
    throw new CollectivePlanningValidationError(
      "record high-waters must exactly cover reducer records",
    );
  if (commands.length !== observations.length + view.revision)
    throw new CollectivePlanningValidationError(
      "command high-waters must exactly cover applied reducer revisions",
    );
  const commandIds = new Set(commands.map((item) => item.commandId));
  const retainedCommands = commands.map((item) => item.command);
  for (const observation of observations) {
    const commandId = deriveCommandId({
      schemaVersion: 1,
      kind: "observation.record",
      commandId: "planning-command:placeholder",
      expectedStateDigest: null,
      observation,
    });
    if (!commandIds.has(commandId))
      throw new CollectivePlanningValidationError(
        "command high-waters do not cover observation history",
      );
    const retained = retainedCommands.find(
      (item): item is RecordPlanningObservationCommandV1 =>
        item.kind === "observation.record" && item.commandId === commandId,
    );
    if (!retained || !sameJson(retained.observation, observation))
      throw new CollectivePlanningValidationError(
        "retained observation command differs from observation history",
      );
  }
  for (const proposal of view.proposals) {
    const commandId = deriveCommandId({
      schemaVersion: 1,
      kind: "proposal.record",
      commandId: "planning-command:placeholder",
      expectedStateDigest: null,
      proposal,
    });
    if (!commandIds.has(commandId))
      throw new CollectivePlanningValidationError(
        "command high-waters do not cover proposal history",
      );
    const retained = retainedCommands.find(
      (item): item is RecordPlanningProposalCommandV1 =>
        item.kind === "proposal.record" && item.commandId === commandId,
    );
    if (!retained || !sameJson(retained.proposal, proposal))
      throw new CollectivePlanningValidationError(
        "retained proposal command differs from proposal history",
      );
  }
  const proposalsByDigest = new Map(
    view.proposals.map((item) => [item.proposalDigest, item]),
  );
  const decisionBatches = new Map<number, PlanFragmentDecisionV1[]>();
  for (const decision of view.decisions) {
    const batch = decisionBatches.get(decision.localPlanViewRevision) ?? [];
    batch.push(decision);
    decisionBatches.set(decision.localPlanViewRevision, batch);
  }
  for (const batch of decisionBatches.values()) {
    const first = batch[0];
    const proposal = proposalsByDigest.get(first.proposalDigest)!;
    const batchDigests = batch
      .map((item) => item.proposalDigest)
      .sort(compareCodeUnits);
    if (
      batch.some(
        (item) =>
          item.decidedAtLogicalMs !== first.decidedAtLogicalMs ||
          !sameJson(item.inputCandidateDigests, first.inputCandidateDigests) ||
          proposalsByDigest.get(item.proposalDigest)?.semanticSlotKey !==
            proposal.semanticSlotKey,
      ) ||
      !sameJson(batchDigests, first.inputCandidateDigests)
    )
      throw new CollectivePlanningValidationError(
        "decision batch does not exactly cover one slot evaluation",
      );
    const commandId = deriveCommandId({
      schemaVersion: 1,
      kind: "slot.evaluate",
      commandId: "planning-command:placeholder",
      expectedStateDigest: null,
      semanticSlotKey: proposal.semanticSlotKey,
      candidateProposalDigests: first.inputCandidateDigests,
      decidedAtLogicalMs: first.decidedAtLogicalMs,
    });
    if (!commandIds.has(commandId))
      throw new CollectivePlanningValidationError(
        "command high-waters do not cover slot decision history",
      );
    const retained = retainedCommands.find(
      (item): item is EvaluatePlanningSlotCommandV1 =>
        item.kind === "slot.evaluate" && item.commandId === commandId,
    );
    if (
      !retained ||
      retained.semanticSlotKey !== proposal.semanticSlotKey ||
      retained.decidedAtLogicalMs !== first.decidedAtLogicalMs ||
      !sameJson(retained.candidateProposalDigests, first.inputCandidateDigests)
    )
      throw new CollectivePlanningValidationError(
        "retained slot command differs from decision history",
      );
  }
  if (
    retainedCommands.filter((item) => item.kind === "observation.record")
      .length !== observations.length ||
    retainedCommands.filter((item) => item.kind === "proposal.record")
      .length !== view.proposals.length ||
    retainedCommands.filter((item) => item.kind === "slot.evaluate").length !==
      decisionBatches.size
  )
    throw new CollectivePlanningValidationError(
      "retained command kinds do not match reducer history",
    );
  const lifecycleTransitions: Array<{
    previous: PlanFragmentV1;
    current: PlanFragmentV1;
  }> = [];
  const histories = new Map<string, PlanFragmentV1[]>();
  for (const fragment of view.fragments) {
    const history = histories.get(fragment.fragmentId) ?? [];
    history.push(fragment);
    histories.set(fragment.fragmentId, history);
  }
  for (const history of histories.values())
    for (let index = 1; index < history.length; index += 1) {
      const previous = history[index - 1];
      const current = history[index];
      const implicitActivation =
        previous.status === "candidate" && current.status === "active";
      const implicitReplan =
        previous.status === "active" &&
        current.status === "superseded" &&
        view.fragments.some(
          (item) => item.predecessorFragmentDigest === previous.fragmentDigest,
        );
      if (!implicitActivation && !implicitReplan)
        lifecycleTransitions.push({ previous, current });
    }
  const lifecycleCommands = retainedCommands.filter((item) =>
    new Set([
      "fragment.transition",
      "fragment.project-to-work",
      "fragment.assignment.observe",
      "fragment.execution.observe",
      "fragment.terminal.observe",
      "work.revision.observe",
    ]).has(item.kind),
  );
  const lifecycleWaterByCommandId = new Map(
    commands.map((item) => [item.commandId, item]),
  );
  const appliedAtFor = (item: PlanningReducerCommandV1): number | null =>
    lifecycleWaterByCommandId.get(item.commandId)?.appliedAtLogicalMs ?? null;
  const retainedTimeIsValid = (
    item:
      | ProjectPlanningFragmentToWorkCommandV1
      | ObservePlanningFragmentTerminalCommandV1,
    previous: PlanFragmentV1,
  ): boolean => {
    const appliedAt = appliedAtFor(item);
    return (
      appliedAt !== null &&
      appliedAt <= view.logicalTimeHighWaterMs &&
      item.transitionedAtLogicalMs >= previous.acceptedAtLogicalMs &&
      item.transitionedAtLogicalMs <= appliedAt &&
      appliedAt - item.transitionedAtLogicalMs <=
        intent.planningLimits.replanningLogicalWindowMs
    );
  };
  const retainedRoleIsValid = (
    item: PlanningReducerCommandV1,
    role: AdaptiveRoleBindingV1,
    previous: PlanFragmentV1,
    current: PlanFragmentV1,
  ): boolean => {
    const appliedAt = appliedAtFor(item);
    return (
      appliedAt !== null &&
      appliedAt <= view.logicalTimeHighWaterMs &&
      role.status === "current" &&
      role.missionIntentId === intent.missionIntentId &&
      role.intentRevision === intent.revision &&
      role.intentDigest === intent.intentDigest &&
      role.fragmentDigest === current.fragmentDigest &&
      role.roleKey === previous.roleKey &&
      role.leaseExpiresAtLogicalMs > appliedAt &&
      subjects.some(
        (subject) =>
          subject.peerId === role.assignedPeerId &&
          subject.peerInstanceId === role.assignedInstanceId,
      )
    );
  };
  const transitionHasCommand = ({
    previous,
    current,
  }: {
    previous: PlanFragmentV1;
    current: PlanFragmentV1;
  }): boolean =>
    lifecycleCommands.some((item) => {
      if (!("fragmentId" in item) || !("previousFragmentDigest" in item))
        return false;
      if (
        item.fragmentId !== previous.fragmentId ||
        item.previousFragmentDigest !== previous.fragmentDigest
      )
        return false;
      if (item.kind === "fragment.transition")
        return previous.status === "active" && item.status === current.status;
      if (item.kind === "fragment.project-to-work")
        return (
          previous.status === "active" &&
          current.status === "offered" &&
          item.workTarget.meshId === intent.objective.meshId &&
          item.workTarget.objectiveId === intent.objective.objectiveId &&
          retainedTimeIsValid(item, previous)
        );
      if (item.kind === "fragment.assignment.observe")
        return (
          previous.status === "offered" &&
          current.status === "assigned" &&
          retainedRoleIsValid(item, item.roleBinding, previous, current)
        );
      if (item.kind === "fragment.execution.observe")
        return (
          previous.status === "assigned" &&
          current.status === "executing" &&
          retainedRoleIsValid(item, item.roleBinding, previous, current)
        );
      if (item.kind === "fragment.terminal.observe")
        return (
          (previous.status === "offered" ||
            previous.status === "assigned" ||
            previous.status === "executing") &&
          item.status === current.status &&
          !(item.status === "completed" && previous.status !== "executing") &&
          !(item.status === "failed" && previous.status === "offered") &&
          retainedTimeIsValid(item, previous)
        );
      return (
        item.kind === "work.revision.observe" &&
        previous.status === "offered" &&
        current.status === "offered" &&
        item.workTarget.workItemRevision ===
          item.expectedWorkMapping.workItemRevision + 1
      );
    });
  if (
    lifecycleCommands.length !== lifecycleTransitions.length ||
    lifecycleTransitions.some((item) => !transitionHasCommand(item))
  )
    throw new CollectivePlanningValidationError(
      "retained lifecycle commands do not match fragment history",
    );
  const usedWorkRevisions = new Set<string>();
  for (const retained of retainedCommands) {
    const target =
      retained.kind === "fragment.project-to-work" ||
      retained.kind === "work.revision.observe"
        ? retained.workTarget
        : undefined;
    if (!target) continue;
    const key = `${target.meshId}\u0000${target.objectiveId}\u0000${target.workItemId}\u0000${target.workItemRevision}`;
    if (usedWorkRevisions.has(key))
      throw new CollectivePlanningValidationError(
        "Work revision is reused by reducer history",
      );
    usedWorkRevisions.add(key);
  }
  for (const history of histories.values()) {
    let expectedMapping: FragmentWorkMappingV1 | null = null;
    let expectedRole: AdaptiveRoleBindingV1 | null = null;
    for (let index = 1; index < history.length; index += 1) {
      const previous = history[index - 1];
      const current = history[index];
      const retained = lifecycleCommands.find(
        (item) =>
          "fragmentId" in item &&
          "previousFragmentDigest" in item &&
          item.fragmentId === previous.fragmentId &&
          item.previousFragmentDigest === previous.fragmentDigest,
      );
      if (!retained) continue;
      if (retained.kind === "fragment.project-to-work") {
        expectedMapping = mappingFor(
          current.fragmentDigest,
          retained.workTarget,
        );
        expectedRole = null;
      } else if (retained.kind === "fragment.assignment.observe") {
        if (
          !expectedMapping ||
          expectedRole !== null ||
          !sameMapping(expectedMapping, retained.expectedWorkMapping) ||
          !retainedRoleIsValid(
            retained,
            retained.roleBinding,
            previous,
            current,
          )
        )
          throw new CollectivePlanningValidationError(
            "retained assignment Work CAS differs from history",
          );
        expectedMapping = mappingFor(current.fragmentDigest, expectedMapping);
        expectedRole = retained.roleBinding;
      } else if (retained.kind === "fragment.execution.observe") {
        if (
          !expectedMapping ||
          !expectedRole ||
          expectedRole.roleBindingDigest !==
            retained.previousRoleBindingDigest ||
          !retainedRoleIsValid(
            retained,
            retained.roleBinding,
            previous,
            current,
          ) ||
          !sameRoleAuthority(expectedRole, retained.roleBinding)
        )
          throw new CollectivePlanningValidationError(
            "retained execution CAS differs from history",
          );
        expectedMapping = mappingFor(current.fragmentDigest, expectedMapping);
        expectedRole = retained.roleBinding;
      } else if (retained.kind === "work.revision.observe") {
        if (
          !expectedMapping ||
          !sameMapping(expectedMapping, retained.expectedWorkMapping) ||
          expectedRole !== null
        )
          throw new CollectivePlanningValidationError(
            "retained Work revision CAS differs from history",
          );
        expectedMapping = mappingFor(
          current.fragmentDigest,
          retained.workTarget,
        );
        expectedRole = retained.roleBinding;
      } else if (retained.kind === "fragment.terminal.observe") {
        if (
          !expectedMapping ||
          !sameMapping(expectedMapping, retained.expectedWorkMapping) ||
          (expectedRole?.roleBindingDigest ?? null) !==
            retained.expectedRoleBindingDigest
        )
          throw new CollectivePlanningValidationError(
            "retained terminal CAS differs from history",
          );
        expectedMapping = null;
        expectedRole = null;
      }
    }
    const latest = history[history.length - 1];
    const actualMapping =
      view.workMappings.find(
        (item) => item.fragmentDigest === latest.fragmentDigest,
      ) ?? null;
    const actualRole =
      view.activeRoleBindings.find(
        (item) => item.fragmentDigest === latest.fragmentDigest,
      ) ?? null;
    if (
      !sameJson(expectedMapping, actualMapping) ||
      !sameJson(expectedRole, actualRole)
    )
      throw new CollectivePlanningValidationError(
        "current Work or role evidence differs from retained lifecycle history",
      );
  }
  for (const mapping of view.workMappings)
    if (
      mapping.meshId !== intent.objective.meshId ||
      mapping.objectiveId !== intent.objective.objectiveId
    )
      throw new CollectivePlanningValidationError(
        "Work mapping differs from the mission Objective",
      );
  for (const role of view.activeRoleBindings)
    if (
      !subjects.some(
        (item) =>
          item.peerId === role.assignedPeerId &&
          item.peerInstanceId === role.assignedInstanceId,
      )
    )
      throw new CollectivePlanningValidationError(
        "active role subject is not admitted",
      );
  const timeCommands = retainedCommands
    .filter(
      (item): item is AdvancePlanningLogicalTimeCommandV1 =>
        item.kind === "logical-time.advance",
    )
    .sort((left, right) => left.logicalTimeMs - right.logicalTimeMs);
  if (
    timeCommands.some(
      (item, index) =>
        item.logicalTimeMs > view.logicalTimeHighWaterMs ||
        (index > 0 &&
          timeCommands[index - 1].logicalTimeMs >= item.logicalTimeMs),
    ) ||
    (timeCommands.length > 0 &&
      timeCommands[timeCommands.length - 1].logicalTimeMs !==
        view.logicalTimeHighWaterMs)
  )
    throw new CollectivePlanningValidationError(
      "retained logical-time commands do not match the high-water",
    );
  assertPlanningDigest(value.stateDigest, "stateDigest");
  canonicalizePlanningJsonV1(value as unknown as JsonValue, {
    ...STATE_LIMITS,
    maximumBytes: intent.planningLimits.maximumSnapshotBytes,
  });
  if (
    planningReducerStateDigestV1(
      without(value, "stateDigest") as unknown as Omit<
        PlanningReducerStateV1,
        "stateDigest"
      >,
    ) !== value.stateDigest
  )
    throw new CollectivePlanningValidationError("stateDigest mismatch");
  return deepFreezePlanning({ ...value }) as unknown as PlanningReducerStateV1;
}

function makeState(
  input: Omit<PlanningReducerStateV1, "stateDigest">,
): PlanningReducerStateV1 {
  return validatePlanningReducerStateV1({
    ...input,
    stateDigest: planningReducerStateDigestV1(input),
  });
}

export function createPlanningReducerStateV1(
  input: CreatePlanningReducerStateInputV1,
): PlanningReducerStateV1 {
  assertPlanningExactKeys(
    input,
    [
      "schemaVersion",
      "peerId",
      "peerInstanceId",
      "missionIntent",
      "selectionPolicy",
      "admittedSubjects",
      ...(Object.prototype.hasOwnProperty.call(input, "logicalTimeMs")
        ? ["logicalTimeMs"]
        : []),
    ],
    "planning reducer state input",
  );
  if (input.schemaVersion !== 1)
    throw new CollectivePlanningValidationError(
      "state input schemaVersion is invalid",
    );
  assertPlanningIdentifier(input.peerId, "peerId");
  assertPlanningIdentifier(input.peerInstanceId, "peerInstanceId");
  const intent = validateMissionIntentV1(input.missionIntent);
  const policy = validatePlanSelectionPolicyV1(input.selectionPolicy);
  if (intent.selectionPolicyDigest !== policy.policyDigest)
    throw new CollectivePlanningValidationError(
      "selection policy does not match intent",
    );
  const subjects = validateSortedRecords(
    input.admittedSubjects,
    "admittedSubjects",
    65_536,
    validateSubject,
    (item) => subjectKey(item.peerId, item.peerInstanceId),
  );
  if (subjects.length === 0)
    throw new CollectivePlanningValidationError(
      "at least one admitted subject is required",
    );
  const logicalTimeMs = input.logicalTimeMs ?? 0;
  assertPlanningSafeInteger(logicalTimeMs, "logicalTimeMs");
  const view = createPlanViewV1({
    schemaVersion: 1,
    planViewId: `planning-view:${intent.intentDigest.slice(7)}:${input.peerId}:${input.peerInstanceId}`,
    tenantId: intent.tenantId,
    policyDomainId: intent.policyDomainId,
    peerId: input.peerId,
    peerInstanceId: input.peerInstanceId,
    missionIntentId: intent.missionIntentId,
    intentRevision: intent.revision,
    intentDigest: intent.intentDigest,
    selectionPolicyDigest: policy.policyDigest,
    revision: 0,
    proposals: [],
    decisions: [],
    fragments: [],
    selectedHeads: [],
    causalFrontierDigests: [],
    unresolvedDependencyDigests: [],
    budgetShards: equalBudgetShards(intent, subjects),
    budgetReservations: [],
    workMappings: [],
    activeRoleBindings: [],
    logicalTimeHighWaterMs: logicalTimeMs,
  });
  return makeState({
    schemaVersion: 1,
    tenantId: intent.tenantId,
    policyDomainId: intent.policyDomainId,
    peerId: input.peerId,
    peerInstanceId: input.peerInstanceId,
    missionIntent: intent,
    selectionPolicy: policy,
    admittedSubjects: subjects,
    observations: [],
    planView: view,
    recordHighWaters: [],
    observationCursorHighWaters: [],
    commandHighWaters: [],
  });
}

function error(
  code: PlanningReducerErrorCodeV1,
  message: string,
): PlanningReducerErrorV1 {
  return deepFreezePlanning({ schemaVersion: 1 as const, code, message });
}

function nonApplied(
  state: PlanningReducerStateV1,
  status: "idempotent" | "rejected" | "conflict",
  code?: PlanningReducerErrorCodeV1,
  message?: string,
): PlanningReducerResultV1 {
  return deepFreezePlanning(
    status === "idempotent"
      ? { status, state, events: EMPTY_EVENTS, error: null }
      : { status, state, events: EMPTY_EVENTS, error: error(code!, message!) },
  ) as PlanningReducerResultV1;
}

function updateView(
  view: PlanViewV1,
  changes: Partial<Omit<PlanViewV1, "stateDigest">>,
): PlanViewV1 {
  const base = without(
    view as unknown as Record<string, unknown>,
    "stateDigest",
  ) as unknown as Omit<PlanViewV1, "stateDigest">;
  return createPlanViewV1({ ...base, ...changes });
}

function latestFragments(view: PlanViewV1): Map<string, PlanFragmentV1> {
  const result = new Map<string, PlanFragmentV1>();
  for (const fragment of view.fragments) {
    const current = result.get(fragment.fragmentId);
    if (!current || current.fragmentRevision < fragment.fragmentRevision)
      result.set(fragment.fragmentId, fragment);
  }
  return result;
}

function graphProjection(fragments: readonly PlanFragmentV1[]): {
  readonly frontier: readonly PlanningDigestV1[];
  readonly unresolved: readonly PlanningDigestV1[];
} {
  const latest = latestFragments({ fragments } as PlanViewV1);
  const byDigest = new Map(
    fragments.map((fragment) => [fragment.fragmentDigest, fragment]),
  );
  const referencedIds = new Set<string>();
  for (const fragment of latest.values())
    for (const digest of [
      ...fragment.parentFragmentDigests,
      ...fragment.dependencyFragmentDigests,
      ...(fragment.predecessorFragmentDigest
        ? [fragment.predecessorFragmentDigest]
        : []),
    ]) {
      const target = byDigest.get(digest);
      if (target && target.fragmentId !== fragment.fragmentId)
        referencedIds.add(target.fragmentId);
    }
  const frontier = [...latest.values()]
    .filter((item) => !referencedIds.has(item.fragmentId))
    .map((item) => item.fragmentDigest)
    .sort();
  const unresolved = new Set<PlanningDigestV1>();
  for (const fragment of latest.values())
    if (fragment.status === "active")
      for (const digest of fragment.dependencyFragmentDigests) {
        const target = byDigest.get(digest);
        if (!target || latest.get(target.fragmentId)?.status !== "completed")
          unresolved.add(digest);
      }
  return { frontier, unresolved: [...unresolved].sort() };
}

function appendCommandWater(
  state: PlanningReducerStateV1,
  command: PlanningReducerCommandV1,
): readonly PlanningReducerCommandHighWaterV1[] {
  const retainedCommand = validatePlanningReducerCommandV1({
    ...command,
    expectedStateDigest: null,
    ...(command.kind === "fragment.transition"
      ? { transitionedAtLogicalMs: 0 }
      : {}),
  });
  return [
    ...state.commandHighWaters,
    {
      schemaVersion: 1 as const,
      commandId: command.commandId,
      commandDigest: command.commandDigest,
      command: retainedCommand,
      ...(new Set([
        "fragment.project-to-work",
        "fragment.assignment.observe",
        "fragment.execution.observe",
        "fragment.terminal.observe",
        "work.revision.observe",
      ]).has(command.kind)
        ? { appliedAtLogicalMs: state.planView.logicalTimeHighWaterMs }
        : {}),
    },
  ].sort((a, b) => compareCodeUnits(a.commandId, b.commandId));
}

function finalizeState(
  state: PlanningReducerStateV1,
  command: PlanningReducerCommandV1,
  changes: Partial<
    Omit<PlanningReducerStateV1, "stateDigest" | "commandHighWaters">
  >,
): PlanningReducerStateV1 {
  const base = without(
    state as unknown as Record<string, unknown>,
    "stateDigest",
  ) as unknown as Omit<PlanningReducerStateV1, "stateDigest">;
  return makeState({
    ...base,
    ...changes,
    commandHighWaters: appendCommandWater(state, command),
  });
}

function eventId(
  commandDigest: PlanningDigestV1,
  kind: PlanningReducerEventKindV1,
  subjectId: string,
): string {
  const digest = digestPlanningJsonV1("planning-reducer-event", {
    commandDigest,
    kind,
    subjectId,
  } as JsonValue);
  return `planning-event:${digest.slice(7)}`;
}

export function planningReducerEventDigestV1(
  event: Omit<PlanningReducerEventV1, "eventDigest">,
): PlanningDigestV1 {
  return digestPlanningJsonV1(
    "planning-reducer-event",
    event as unknown as JsonValue,
    STATE_LIMITS,
  );
}

export function validatePlanningReducerEventV1(
  value: unknown,
): PlanningReducerEventV1 {
  assertPlanningExactKeys(
    value,
    [
      "schemaVersion",
      "eventId",
      "kind",
      "commandId",
      "commandDigest",
      "previousStateDigest",
      "resultingStateDigest",
      "subjectId",
      "subjectDigest",
      "eventDigest",
    ],
    "planning reducer event",
  );
  if (
    value.schemaVersion !== 1 ||
    !new Set([
      "observation.recorded",
      "proposal.recorded",
      "slot.evaluated",
      "fragment.created",
      "fragment.transitioned",
      "fragment.projected-to-work",
      "fragment.assignment-observed",
      "fragment.execution-observed",
      "fragment.terminal-observed",
      "work.revision-observed",
      "logical-time.advanced",
    ]).has(value.kind as string)
  )
    throw new CollectivePlanningValidationError(
      "planning reducer event kind is invalid",
    );
  assertPlanningIdentifier(value.eventId, "eventId");
  assertPlanningIdentifier(value.commandId, "commandId");
  assertPlanningDigest(value.commandDigest, "commandDigest");
  assertPlanningDigest(value.previousStateDigest, "previousStateDigest");
  assertPlanningDigest(value.resultingStateDigest, "resultingStateDigest");
  assertPlanningIdentifier(value.subjectId, "subjectId");
  assertPlanningDigest(value.subjectDigest, "subjectDigest");
  assertPlanningDigest(value.eventDigest, "eventDigest");
  const input = without(value, "eventDigest") as unknown as Omit<
    PlanningReducerEventV1,
    "eventDigest"
  >;
  if (
    value.eventId !==
    eventId(
      value.commandDigest as PlanningDigestV1,
      value.kind as PlanningReducerEventKindV1,
      value.subjectId as string,
    )
  )
    throw new CollectivePlanningValidationError("eventId mismatch");
  if (value.eventDigest !== planningReducerEventDigestV1(input))
    throw new CollectivePlanningValidationError("eventDigest mismatch");
  return deepFreezePlanning({ ...value }) as unknown as PlanningReducerEventV1;
}

export function createPlanningReducerEventV1(
  input: Omit<PlanningReducerEventV1, "eventId" | "eventDigest"> & {
    readonly eventId?: string;
  },
): PlanningReducerEventV1 {
  assertPlanningExactKeys(
    input,
    [
      "schemaVersion",
      "kind",
      "commandId",
      "commandDigest",
      "previousStateDigest",
      "resultingStateDigest",
      "subjectId",
      "subjectDigest",
      ...(Object.prototype.hasOwnProperty.call(input, "eventId")
        ? ["eventId"]
        : []),
    ],
    "planning reducer event input",
  );
  const expectedId = eventId(input.commandDigest, input.kind, input.subjectId);
  if (input.eventId !== undefined && input.eventId !== expectedId)
    throw new CollectivePlanningValidationError("eventId mismatch");
  const withoutDigest = { ...input, eventId: expectedId } as Omit<
    PlanningReducerEventV1,
    "eventDigest"
  >;
  return validatePlanningReducerEventV1({
    ...withoutDigest,
    eventDigest: planningReducerEventDigestV1(withoutDigest),
  });
}

function createEvent(
  previous: PlanningReducerStateV1,
  next: PlanningReducerStateV1,
  command: PlanningReducerCommandV1,
  kind: PlanningReducerEventKindV1,
  subjectId: string,
  subjectDigest: PlanningDigestV1,
): PlanningReducerEventV1 {
  return createPlanningReducerEventV1({
    schemaVersion: 1,
    kind,
    commandId: command.commandId,
    commandDigest: command.commandDigest,
    previousStateDigest: previous.stateDigest,
    resultingStateDigest: next.stateDigest,
    subjectId,
    subjectDigest,
  });
}

function applied(
  previous: PlanningReducerStateV1,
  next: PlanningReducerStateV1,
  command: PlanningReducerCommandV1,
  specs: readonly [PlanningReducerEventKindV1, string, PlanningDigestV1][],
): PlanningReducerResultV1 {
  const events = specs.map(([kind, id, digest]) =>
    createEvent(previous, next, command, kind, id, digest),
  );
  return deepFreezePlanning({
    status: "applied" as const,
    state: next,
    events,
    error: null,
  });
}

function checkScope(
  state: PlanningReducerStateV1,
  record: {
    missionIntentId: string;
    intentRevision: number;
    intentDigest: PlanningDigestV1;
  },
): boolean {
  return (
    record.missionIntentId === state.missionIntent.missionIntentId &&
    record.intentRevision === state.missionIntent.revision &&
    record.intentDigest === state.missionIntent.intentDigest
  );
}

function recordObservation(
  state: PlanningReducerStateV1,
  command: RecordPlanningObservationCommandV1,
): PlanningReducerResultV1 {
  const observation = command.observation;
  if (!checkScope(state, observation))
    return nonApplied(
      state,
      "rejected",
      "scope_mismatch",
      "observation differs from the active intent",
    );
  if (
    !state.admittedSubjects.some(
      (item) =>
        item.peerId === observation.observerPeerId &&
        item.peerInstanceId === observation.observerInstanceId,
    )
  )
    return nonApplied(
      state,
      "rejected",
      "subject_not_admitted",
      "observer subject is not admitted",
    );
  const existingCursor = state.observationCursorHighWaters.find(
    (item) =>
      `${item.observerPeerId}\u0000${item.observerInstanceId}\u0000${item.environmentCursor}` ===
      cursorKey(observation),
  );
  if (existingCursor)
    return existingCursor.observationDigest === observation.observationDigest
      ? nonApplied(state, "idempotent")
      : nonApplied(
          state,
          "conflict",
          "cursor_high_water_conflict",
          "observation cursor was reused with different content",
        );
  const record = state.recordHighWaters.find(
    (item) =>
      item.domain === "observation" &&
      item.recordId === observation.observationId,
  );
  if (record)
    return record.digest === observation.observationDigest
      ? nonApplied(state, "idempotent")
      : nonApplied(
          state,
          "conflict",
          "record_high_water_conflict",
          "observation identity was reused with different content",
        );
  if (observation.logicalTimeMs > state.planView.logicalTimeHighWaterMs)
    return nonApplied(
      state,
      "rejected",
      "logical_time_regression",
      "observation is ahead of logical time",
    );
  if (
    state.planView.logicalTimeHighWaterMs - observation.logicalTimeMs >
    state.missionIntent.planningLimits.observationLogicalWindowMs
  )
    return nonApplied(
      state,
      "rejected",
      "logical_window_exceeded",
      "observation is outside its logical window",
    );
  if (
    state.observations.length >=
    state.missionIntent.planningLimits.maximumCandidateFragments
  )
    return nonApplied(
      state,
      "rejected",
      "planning_limit_exceeded",
      "observation bound is exhausted",
    );
  const observations = [...state.observations, observation].sort((a, b) =>
    compareCodeUnits(cursorKey(a), cursorKey(b)),
  );
  const recordHighWaters = [
    ...state.recordHighWaters,
    {
      schemaVersion: 1 as const,
      domain: "observation" as const,
      recordId: observation.observationId,
      revision: 1,
      digest: observation.observationDigest,
    },
  ].sort((a, b) => compareCodeUnits(recordKey(a), recordKey(b)));
  const observationCursorHighWaters = [
    ...state.observationCursorHighWaters,
    {
      schemaVersion: 1 as const,
      observerPeerId: observation.observerPeerId,
      observerInstanceId: observation.observerInstanceId,
      environmentCursor: observation.environmentCursor,
      observationId: observation.observationId,
      observationDigest: observation.observationDigest,
      logicalTimeMs: observation.logicalTimeMs,
    },
  ].sort((a, b) =>
    compareCodeUnits(
      `${a.observerPeerId}\u0000${a.observerInstanceId}\u0000${a.environmentCursor}`,
      `${b.observerPeerId}\u0000${b.observerInstanceId}\u0000${b.environmentCursor}`,
    ),
  );
  const next = finalizeState(state, command, {
    observations,
    recordHighWaters,
    observationCursorHighWaters,
  });
  return applied(state, next, command, [
    [
      "observation.recorded",
      observation.observationId,
      observation.observationDigest,
    ],
  ]);
}

function proposalGraphValid(
  state: PlanningReducerStateV1,
  proposal: PlanFragmentProposalV1,
): boolean {
  const byDigest = new Map(
    state.planView.fragments.map((item) => [item.fragmentDigest, item]),
  );
  if (proposal.parentFragmentDigests.some((digest) => !byDigest.has(digest)))
    return false;
  const currentHead = state.planView.selectedHeads.find(
    (item) => item.semanticSlotKey === proposal.semanticSlotKey,
  );
  if (
    proposal.predecessorFragmentDigest !== (currentHead?.fragmentDigest ?? null)
  )
    return false;
  if (proposal.predecessorFragmentDigest === null) return true;
  const predecessor = byDigest.get(proposal.predecessorFragmentDigest);
  return predecessor?.semanticSlotKey === proposal.semanticSlotKey;
}

function recordProposal(
  state: PlanningReducerStateV1,
  command: RecordPlanningProposalCommandV1,
): PlanningReducerResultV1 {
  const proposal = command.proposal;
  if (!checkScope(state, proposal))
    return nonApplied(
      state,
      "rejected",
      "scope_mismatch",
      "proposal differs from the active intent",
    );
  if (
    !state.admittedSubjects.some(
      (item) =>
        item.peerId === proposal.proposerPeerId &&
        item.peerInstanceId === proposal.proposerInstanceId,
    )
  )
    return nonApplied(
      state,
      "rejected",
      "subject_not_admitted",
      "proposer subject is not admitted",
    );
  const record = state.recordHighWaters.find(
    (item) =>
      item.domain === "proposal" && item.recordId === proposal.proposalId,
  );
  if (record)
    return record.digest === proposal.proposalDigest
      ? nonApplied(state, "idempotent")
      : nonApplied(
          state,
          "conflict",
          "record_high_water_conflict",
          "proposal identity was reused with different content",
        );
  const limits = state.missionIntent.planningLimits;
  if (proposal.proposedAtLogicalMs > state.planView.logicalTimeHighWaterMs)
    return nonApplied(
      state,
      "rejected",
      "logical_time_regression",
      "proposal is ahead of logical time",
    );
  if (
    state.planView.logicalTimeHighWaterMs - proposal.proposedAtLogicalMs >
    limits.proposalLogicalWindowMs
  )
    return nonApplied(
      state,
      "rejected",
      "logical_window_exceeded",
      "proposal is outside its logical window",
    );
  const observationByDigest = new Map(
    state.observations.map((item) => [item.observationDigest, item]),
  );
  if (
    proposal.basisObservationDigests.some(
      (digest) => !observationByDigest.has(digest),
    )
  )
    return nonApplied(
      state,
      "rejected",
      "basis_observation_missing",
      "proposal basis observation is absent",
    );
  if (
    proposal.basisObservationDigests.some((digest) => {
      const item = observationByDigest.get(digest)!;
      return (
        item.logicalTimeMs > proposal.proposedAtLogicalMs ||
        proposal.proposedAtLogicalMs - item.logicalTimeMs >
          limits.observationLogicalWindowMs
      );
    })
  )
    return nonApplied(
      state,
      "rejected",
      "logical_window_exceeded",
      "proposal basis observation is outside its logical window",
    );
  const outcomeSet = new Set(state.missionIntent.outcomeStatements);
  const capabilitySet = new Set(state.missionIntent.permittedCapabilityKeys);
  const deadline = Date.parse(proposal.workDeadline);
  if (
    proposal.outcomeStatements.some((item) => !outcomeSet.has(item)) ||
    proposal.requiredCapabilityKeys.some((item) => !capabilitySet.has(item)) ||
    deadline < Date.parse(state.missionIntent.validFrom) ||
    deadline > Date.parse(state.missionIntent.validUntil)
  )
    return nonApplied(
      state,
      "rejected",
      "scope_mismatch",
      "proposal widens intent outcomes, capabilities or validity",
    );
  const proposalBytes = planningUtf8ByteLengthV1(
    canonicalizePlanningJsonV1(proposal as unknown as JsonValue),
  );
  const subjectProposalCount = state.planView.proposals.filter(
    (item) =>
      item.proposerPeerId === proposal.proposerPeerId &&
      item.proposerInstanceId === proposal.proposerInstanceId,
  ).length;
  const slotCount = state.planView.proposals.filter(
    (item) => item.semanticSlotKey === proposal.semanticSlotKey,
  ).length;
  const decided = new Set(
    state.planView.decisions.map((item) => item.proposalDigest),
  );
  const pending = state.planView.proposals.filter(
    (item) => !decided.has(item.proposalDigest),
  ).length;
  if (
    state.planView.proposals.length >= limits.maximumCandidateFragments ||
    subjectProposalCount >= limits.maximumFragmentsPerPeer ||
    slotCount >= limits.maximumRevisionsPerSemanticSlot ||
    pending >= limits.maximumConcurrentProposals ||
    proposal.parentFragmentDigests.length > limits.maximumDependencyFanout ||
    proposal.dependencyFragmentDigests.length >
      limits.maximumDependencyFanout ||
    proposal.outcomeStatements.length > limits.maximumOutcomeTerms ||
    proposal.requiredCapabilityKeys.length > limits.maximumCapabilityTerms ||
    proposal.requestedBudgetUnits > limits.maximumFragmentBudgetUnits ||
    proposalBytes > limits.maximumProposalBytes
  )
    return nonApplied(
      state,
      "rejected",
      "planning_limit_exceeded",
      "proposal exceeds a planning limit",
    );
  if (!proposalGraphValid(state, proposal))
    return nonApplied(
      state,
      "rejected",
      "graph_invalid",
      "proposal graph reference is invalid",
    );
  const key = subjectKey(proposal.proposerPeerId, proposal.proposerInstanceId);
  const shard = state.planView.budgetShards.find(
    (item) => subjectKey(item.peerId, item.peerInstanceId) === key,
  )!;
  const used = state.planView.budgetReservations
    .filter(
      (item) =>
        subjectKey(item.peerId, item.peerInstanceId) === key &&
        item.status !== "released",
    )
    .reduce((sum, item) => sum + item.units, 0);
  if (used + proposal.requestedBudgetUnits > shard.budgetUnits)
    return nonApplied(
      state,
      "rejected",
      "budget_exceeded",
      "proposal exceeds its exact proposer shard",
    );
  const reservation: PlanningBudgetReservationV1 = {
    schemaVersion: 1,
    reservationId: `planning-reservation:${proposal.proposalDigest.slice(7)}`,
    peerId: proposal.proposerPeerId,
    peerInstanceId: proposal.proposerInstanceId,
    proposalDigest: proposal.proposalDigest,
    fragmentDigest: null,
    units: proposal.requestedBudgetUnits,
    status: "reserved",
  };
  const view = updateView(state.planView, {
    revision: state.planView.revision + 1,
    proposals: [...state.planView.proposals, proposal].sort((a, b) =>
      compareCodeUnits(
        `${a.proposalId}\u0000${String(a.proposalRevision).padStart(16, "0")}`,
        `${b.proposalId}\u0000${String(b.proposalRevision).padStart(16, "0")}`,
      ),
    ),
    budgetReservations: [
      ...state.planView.budgetReservations,
      reservation,
    ].sort((a, b) => compareCodeUnits(a.reservationId, b.reservationId)),
  });
  const recordHighWaters = [
    ...state.recordHighWaters,
    {
      schemaVersion: 1 as const,
      domain: "proposal" as const,
      recordId: proposal.proposalId,
      revision: proposal.proposalRevision,
      digest: proposal.proposalDigest,
    },
  ].sort((a, b) => compareCodeUnits(recordKey(a), recordKey(b)));
  const next = finalizeState(state, command, {
    planView: view,
    recordHighWaters,
  });
  return applied(state, next, command, [
    ["proposal.recorded", proposal.proposalId, proposal.proposalDigest],
  ]);
}

function dimensionValue(
  state: PlanningReducerStateV1,
  proposal: PlanFragmentProposalV1,
  dimension: string,
): number {
  const scale = 1_000_000;
  switch (dimension) {
    case "outcome_coverage":
      return Math.floor(
        (proposal.outcomeStatements.length * scale) /
          Math.max(1, state.missionIntent.outcomeStatements.length),
      );
    case "budget_efficiency":
      return Math.floor(
        ((state.missionIntent.planningLimits.maximumFragmentBudgetUnits -
          proposal.requestedBudgetUnits) *
          scale) /
          state.missionIntent.planningLimits.maximumFragmentBudgetUnits,
      );
    case "deadline_margin": {
      const start = Date.parse(state.missionIntent.validFrom),
        end = Date.parse(state.missionIntent.validUntil);
      return Math.floor(
        ((Date.parse(proposal.workDeadline) - start) * scale) /
          Math.max(1, end - start),
      );
    }
    case "capability_confidence":
      return Math.floor(
        ((state.missionIntent.permittedCapabilityKeys.length -
          proposal.requiredCapabilityKeys.length +
          1) *
          scale) /
          (state.missionIntent.permittedCapabilityKeys.length + 1),
      );
    case "dependency_readiness": {
      const latest = latestFragments(state.planView),
        byDigest = new Map(
          state.planView.fragments.map((item) => [item.fragmentDigest, item]),
        );
      const ready = proposal.dependencyFragmentDigests.filter((digest) => {
        const item = byDigest.get(digest);
        return item && latest.get(item.fragmentId)?.status === "completed";
      }).length;
      return proposal.dependencyFragmentDigests.length === 0
        ? scale
        : Math.floor(
            (ready * scale) / proposal.dependencyFragmentDigests.length,
          );
    }
    case "bounded_risk":
      return Math.floor(
        ((proposal.parentFragmentDigests.length +
          proposal.dependencyFragmentDigests.length) *
          scale) /
          Math.max(
            1,
            state.missionIntent.planningLimits.maximumDependencyFanout * 2,
          ),
      );
    default:
      return 0;
  }
}

function score(
  state: PlanningReducerStateV1,
  proposal: PlanFragmentProposalV1,
): number {
  let weighted = 0,
    weights = 0;
  for (const dimension of state.selectionPolicy.scoringDimensions) {
    const raw = dimensionValue(state, proposal, dimension.dimension);
    weighted +=
      (dimension.direction === "maximize" ? raw : 1_000_000 - raw) *
      dimension.weight;
    weights += dimension.weight;
  }
  return Math.floor(weighted / weights);
}

function passesHardConstraints(
  state: PlanningReducerStateV1,
  proposal: PlanFragmentProposalV1,
): boolean {
  const recognized = new Set([
    "authority_bounds",
    "intent_scope",
    "budget",
    "deadline",
    "capability",
    "capabilities",
    "observations",
    "dependencies",
    "graph",
    "risk",
  ]);
  if (
    state.selectionPolicy.hardConstraintKeys.some((key) => !recognized.has(key))
  )
    return false;
  if (!state.selectionPolicy.hardConstraintKeys.includes("dependencies"))
    return true;
  const latest = latestFragments(state.planView),
    byDigest = new Map(
      state.planView.fragments.map((item) => [item.fragmentDigest, item]),
    );
  return proposal.dependencyFragmentDigests.every((digest) => {
    const item = byDigest.get(digest);
    return (
      item !== undefined && latest.get(item.fragmentId)?.status === "completed"
    );
  });
}

function compareCandidates(
  state: PlanningReducerStateV1,
  left: PlanFragmentProposalV1,
  right: PlanFragmentProposalV1,
): number {
  for (const key of state.selectionPolicy.tieBreakOrder) {
    let comparison = 0;
    if (key === "score") comparison = score(state, right) - score(state, left);
    else if (key === "requested_budget_units")
      comparison = left.requestedBudgetUnits - right.requestedBudgetUnits;
    else if (key === "work_deadline") {
      comparison =
        Date.parse(left.workDeadline) - Date.parse(right.workDeadline);
      if (comparison === 0)
        comparison = compareCodeUnits(left.workDeadline, right.workDeadline);
    } else if (key === "proposed_at_logical_ms")
      comparison = left.proposedAtLogicalMs - right.proposedAtLogicalMs;
    else
      comparison = compareCodeUnits(left.proposalDigest, right.proposalDigest);
    if (comparison !== 0) return comparison;
  }
  return 0;
}

function decisionId(
  proposal: PlanFragmentProposalV1,
  candidates: readonly PlanningDigestV1[],
): string {
  const digest = domainDigest("planning-reducer-transition", {
    kind: "decision-identity",
    proposalDigest: proposal.proposalDigest,
    candidates,
  });
  return `plan-decision:${digest.slice(7)}`;
}

function copyProposalToFragment(proposal: PlanFragmentProposalV1) {
  return {
    proposalId: proposal.proposalId,
    proposalRevision: proposal.proposalRevision,
    proposalDigest: proposal.proposalDigest,
    missionIntentId: proposal.missionIntentId,
    intentRevision: proposal.intentRevision,
    intentDigest: proposal.intentDigest,
    proposerPeerId: proposal.proposerPeerId,
    proposerInstanceId: proposal.proposerInstanceId,
    semanticSlotKey: proposal.semanticSlotKey,
    predecessorFragmentDigest: proposal.predecessorFragmentDigest,
    parentFragmentDigests: proposal.parentFragmentDigests,
    dependencyFragmentDigests: proposal.dependencyFragmentDigests,
    outcomeStatements: proposal.outcomeStatements,
    roleKey: proposal.roleKey,
    requiredCapabilityKeys: proposal.requiredCapabilityKeys,
    inputReferenceDigest: proposal.inputReferenceDigest,
    basisObservationDigests: proposal.basisObservationDigests,
    requestedBudgetUnits: proposal.requestedBudgetUnits,
    workDeadline: proposal.workDeadline,
    proposedAtLogicalMs: proposal.proposedAtLogicalMs,
  };
}

function evaluateSlot(
  state: PlanningReducerStateV1,
  command: EvaluatePlanningSlotCommandV1,
): PlanningReducerResultV1 {
  if (command.decidedAtLogicalMs > state.planView.logicalTimeHighWaterMs)
    return nonApplied(
      state,
      "rejected",
      "logical_time_regression",
      "decision is ahead of logical time",
    );
  if (
    state.planView.logicalTimeHighWaterMs - command.decidedAtLogicalMs >
    state.missionIntent.planningLimits.replanningLogicalWindowMs
  )
    return nonApplied(
      state,
      "rejected",
      "logical_window_exceeded",
      "decision is outside its replanning window",
    );
  const decided = new Set(
    state.planView.decisions.map((item) => item.proposalDigest),
  );
  const candidates = state.planView.proposals
    .filter(
      (item) =>
        item.semanticSlotKey === command.semanticSlotKey &&
        !decided.has(item.proposalDigest),
    )
    .sort((a, b) => compareCodeUnits(a.proposalDigest, b.proposalDigest));
  const expected = candidates.map((item) => item.proposalDigest);
  if (!sameJson(expected, command.candidateProposalDigests))
    return nonApplied(
      state,
      "rejected",
      "candidate_set_incomplete",
      "candidate set is not the complete sorted pending slot set",
    );
  const recognizedHardConstraints = new Set([
    "authority_bounds",
    "intent_scope",
    "budget",
    "deadline",
    "capability",
    "capabilities",
    "observations",
    "dependencies",
    "graph",
    "risk",
  ]);
  if (
    state.selectionPolicy.hardConstraintKeys.some(
      (key) => !recognizedHardConstraints.has(key),
    )
  )
    return nonApplied(
      state,
      "rejected",
      "increment_not_supported",
      "selection policy contains an unsupported hard constraint",
    );
  const candidateEligible = (item: PlanFragmentProposalV1): boolean =>
    proposalGraphValid(state, item) && passesHardConstraints(state, item);
  const eligible = candidates
    .filter(candidateEligible)
    .sort((a, b) => compareCandidates(state, a, b));
  const winner =
    eligible[0] &&
    score(state, eligible[0]) >= state.selectionPolicy.acceptanceScoreThreshold
      ? eligible[0]
      : undefined;
  if (
    winner &&
    state.missionIntent.planningLimits.maximumRevisionsPerSemanticSlot < 2
  )
    return nonApplied(
      state,
      "rejected",
      "planning_limit_exceeded",
      "candidate-to-active history exceeds fragment revision limit",
    );
  const nextRevision = state.planView.revision + 1;
  const projectionDigest = domainDigest("planning-reducer-transition", {
    previousStateDigest: state.stateDigest,
    commandDigest: command.commandDigest,
    semanticSlotKey: command.semanticSlotKey,
    candidateProposalDigests: command.candidateProposalDigests,
    winnerProposalDigest: winner?.proposalDigest ?? null,
    nextPlanViewRevision: nextRevision,
    decidedAtLogicalMs: command.decidedAtLogicalMs,
  });
  const newDecisions: PlanFragmentDecisionV1[] = candidates.map((proposal) => {
    const proposalScore = candidateEligible(proposal)
      ? score(state, proposal)
      : 0;
    const status =
      winner?.proposalDigest === proposal.proposalDigest
        ? "accepted"
        : proposalScore >= state.selectionPolicy.challengeScoreThreshold
          ? "challenged"
          : "rejected";
    const reasons =
      status === "accepted"
        ? ["selected"]
        : candidateEligible(proposal)
          ? [
              status === "challenged"
                ? "below_acceptance_threshold"
                : "below_challenge_threshold",
            ]
          : ["hard_constraint_failed"];
    return createPlanFragmentDecisionV1({
      schemaVersion: 1,
      decisionId: decisionId(proposal, command.candidateProposalDigests),
      missionIntentId: proposal.missionIntentId,
      intentRevision: proposal.intentRevision,
      intentDigest: proposal.intentDigest,
      proposalId: proposal.proposalId,
      proposalDigest: proposal.proposalDigest,
      selectionPolicyDigest: state.selectionPolicy.policyDigest,
      status,
      reasonCodes: reasons.sort(),
      inputCandidateDigests: command.candidateProposalDigests,
      selectedSemanticSlotHeadDigest:
        status === "accepted" ? proposal.proposalDigest : null,
      localPlanViewRevision: nextRevision,
      decidedAtLogicalMs: command.decidedAtLogicalMs,
      resultingStateDigest: projectionDigest,
    });
  });
  const fragments = [...state.planView.fragments];
  const reservations = state.planView.budgetReservations.map((item) => ({
    ...item,
  }));
  let selectedHeads = [...state.planView.selectedHeads];
  const recordHighWaters = [...state.recordHighWaters];
  const eventSpecs: [PlanningReducerEventKindV1, string, PlanningDigestV1][] = [
    ["slot.evaluated", command.semanticSlotKey, projectionDigest],
  ];
  for (const decision of newDecisions)
    recordHighWaters.push({
      schemaVersion: 1,
      domain: "decision",
      recordId: decision.decisionId,
      revision: decision.localPlanViewRevision,
      digest: decision.decisionDigest,
    });
  if (winner) {
    selectedHeads = selectedHeads.filter(
      (item) => item.semanticSlotKey !== command.semanticSlotKey,
    );
    const priorHead = state.planView.selectedHeads.find(
      (item) => item.semanticSlotKey === command.semanticSlotKey,
    );
    if (priorHead) {
      const prior = [...latestFragments(state.planView).values()].find(
        (item) => item.fragmentDigest === priorHead.fragmentDigest,
      )!;
      const superseded = createPlanFragmentV1({
        ...(without(
          prior as unknown as Record<string, unknown>,
          "fragmentDigest",
        ) as unknown as Omit<PlanFragmentV1, "fragmentDigest" | "fragmentId">),
        fragmentId: prior.fragmentId,
        fragmentRevision: prior.fragmentRevision + 1,
        previousStateDigest: prior.fragmentDigest,
        status: "superseded",
      });
      fragments.push(superseded);
      const reservation = reservations.find(
        (item) => item.proposalDigest === prior.proposalDigest,
      )!;
      reservation.fragmentDigest = superseded.fragmentDigest;
      reservation.status = "released";
      const priorFragmentHighWaterIndex = recordHighWaters.findIndex(
        (item) =>
          item.domain === "fragment" && item.recordId === superseded.fragmentId,
      );
      const supersededHighWater: PlanningDomainHighWaterV1 = {
        schemaVersion: 1,
        domain: "fragment",
        recordId: superseded.fragmentId,
        revision: superseded.fragmentRevision,
        digest: superseded.fragmentDigest,
      };
      if (priorFragmentHighWaterIndex === -1)
        recordHighWaters.push(supersededHighWater);
      else recordHighWaters[priorFragmentHighWaterIndex] = supersededHighWater;
      eventSpecs.push([
        "fragment.transitioned",
        superseded.fragmentId,
        superseded.fragmentDigest,
      ]);
    }
    const decision = newDecisions.find(
      (item) => item.proposalDigest === winner.proposalDigest,
    )!;
    const candidate = createPlanFragmentV1({
      schemaVersion: 1,
      ...copyProposalToFragment(winner),
      decisionDigest: decision.decisionDigest,
      fragmentRevision: 1,
      previousStateDigest: null,
      acceptancePolicyDigest: state.selectionPolicy.policyDigest,
      acceptedAtLogicalMs: command.decidedAtLogicalMs,
      localPlanViewRevision: nextRevision,
      status: "candidate",
    });
    const active = createPlanFragmentV1({
      ...(without(
        candidate as unknown as Record<string, unknown>,
        "fragmentDigest",
      ) as unknown as Omit<PlanFragmentV1, "fragmentDigest" | "fragmentId">),
      fragmentId: candidate.fragmentId,
      fragmentRevision: 2,
      previousStateDigest: candidate.fragmentDigest,
      status: "active",
    });
    fragments.push(candidate, active);
    const reservation = reservations.find(
      (item) => item.proposalDigest === winner.proposalDigest,
    )!;
    reservation.fragmentDigest = active.fragmentDigest;
    reservation.status = "committed";
    const head: PlanSemanticSlotHeadV1 = {
      schemaVersion: 1,
      semanticSlotKey: winner.semanticSlotKey,
      fragmentDigest: active.fragmentDigest,
    };
    selectedHeads = [...selectedHeads, head].sort((a, b) =>
      compareCodeUnits(a.semanticSlotKey, b.semanticSlotKey),
    );
    recordHighWaters.push({
      schemaVersion: 1,
      domain: "fragment",
      recordId: active.fragmentId,
      revision: active.fragmentRevision,
      digest: active.fragmentDigest,
    });
    eventSpecs.push([
      "fragment.created",
      active.fragmentId,
      active.fragmentDigest,
    ]);
  }
  for (const candidate of candidates)
    if (!winner || candidate.proposalDigest !== winner.proposalDigest) {
      const reservation = reservations.find(
        (item) => item.proposalDigest === candidate.proposalDigest,
      )!;
      reservation.status = "released";
    }
  fragments.sort((a, b) =>
    compareCodeUnits(fragmentSortKey(a), fragmentSortKey(b)),
  );
  reservations.sort((a, b) =>
    compareCodeUnits(a.reservationId, b.reservationId),
  );
  recordHighWaters.sort((a, b) => compareCodeUnits(recordKey(a), recordKey(b)));
  const graph = graphProjection(fragments);
  const view = updateView(state.planView, {
    revision: nextRevision,
    decisions: [...state.planView.decisions, ...newDecisions].sort((a, b) =>
      compareCodeUnits(a.decisionId, b.decisionId),
    ),
    fragments,
    selectedHeads,
    causalFrontierDigests: graph.frontier,
    unresolvedDependencyDigests: graph.unresolved,
    budgetReservations: reservations,
  });
  const next = finalizeState(state, command, {
    planView: view,
    recordHighWaters,
  });
  return applied(state, next, command, eventSpecs);
}

function transitionFragment(
  state: PlanningReducerStateV1,
  command: TransitionPlanningFragmentCommandV1,
): PlanningReducerResultV1 {
  if (command.transitionedAtLogicalMs > state.planView.logicalTimeHighWaterMs)
    return nonApplied(
      state,
      "rejected",
      "logical_time_regression",
      "fragment transition is ahead of logical time",
    );
  const latest = latestFragments(state.planView).get(command.fragmentId);
  if (
    !latest ||
    latest.fragmentDigest !== command.previousFragmentDigest ||
    latest.status !== "active"
  )
    return nonApplied(
      state,
      "rejected",
      "fragment_transition_invalid",
      "fragment is not the named active head",
    );
  if (command.transitionedAtLogicalMs < latest.acceptedAtLogicalMs)
    return nonApplied(
      state,
      "rejected",
      "fragment_transition_invalid",
      "fragment transition predates its accepted fragment",
    );
  if (
    state.planView.logicalTimeHighWaterMs - command.transitionedAtLogicalMs >
    state.missionIntent.planningLimits.replanningLogicalWindowMs
  )
    return nonApplied(
      state,
      "rejected",
      "logical_window_exceeded",
      "fragment transition is outside its replanning window",
    );
  const nextFragment = createPlanFragmentV1({
    ...(without(
      latest as unknown as Record<string, unknown>,
      "fragmentDigest",
    ) as unknown as Omit<PlanFragmentV1, "fragmentDigest" | "fragmentId">),
    fragmentId: latest.fragmentId,
    fragmentRevision: latest.fragmentRevision + 1,
    previousStateDigest: latest.fragmentDigest,
    status: command.status,
  });
  const fragments = [...state.planView.fragments, nextFragment].sort((a, b) =>
    compareCodeUnits(fragmentSortKey(a), fragmentSortKey(b)),
  );
  const reservationStatus =
    command.status === "failed" ? "committed" : "released";
  const budgetReservations = state.planView.budgetReservations.map((item) =>
    item.proposalDigest === latest.proposalDigest
      ? ({
          ...item,
          fragmentDigest: nextFragment.fragmentDigest,
          status: reservationStatus,
        } as PlanningBudgetReservationV1)
      : item,
  );
  const graph = graphProjection(fragments);
  const view = updateView(state.planView, {
    revision: state.planView.revision + 1,
    fragments,
    selectedHeads: state.planView.selectedHeads.filter(
      (item) => item.fragmentDigest !== latest.fragmentDigest,
    ),
    causalFrontierDigests: graph.frontier,
    unresolvedDependencyDigests: graph.unresolved,
    budgetReservations,
  });
  const water: PlanningDomainHighWaterV1 = {
    schemaVersion: 1,
    domain: "fragment",
    recordId: nextFragment.fragmentId,
    revision: nextFragment.fragmentRevision,
    digest: nextFragment.fragmentDigest,
  };
  const recordHighWaters = [
    ...state.recordHighWaters.filter(
      (item) =>
        !(
          item.domain === "fragment" &&
          item.recordId === nextFragment.fragmentId
        ),
    ),
    water,
  ].sort((a, b) => compareCodeUnits(recordKey(a), recordKey(b)));
  const next = finalizeState(state, command, {
    planView: view,
    recordHighWaters,
  });
  return applied(state, next, command, [
    [
      "fragment.transitioned",
      nextFragment.fragmentId,
      nextFragment.fragmentDigest,
    ],
  ]);
}

function mappingFor(
  fragmentDigest: PlanningDigestV1,
  target: PlanningWorkTargetV1,
): FragmentWorkMappingV1 {
  return deepFreezePlanning({ ...target, fragmentDigest });
}

function sameMapping(
  left: FragmentWorkMappingV1,
  right: FragmentWorkMappingV1,
): boolean {
  return sameJson(left, right);
}

function currentMapping(
  state: PlanningReducerStateV1,
  digest: PlanningDigestV1,
): FragmentWorkMappingV1 | undefined {
  return state.planView.workMappings.find(
    (item) => item.fragmentDigest === digest,
  );
}

function currentRole(
  state: PlanningReducerStateV1,
  digest: PlanningDigestV1,
): AdaptiveRoleBindingV1 | undefined {
  return state.planView.activeRoleBindings.find(
    (item) => item.fragmentDigest === digest,
  );
}

function makeLifecycleFragment(
  latest: PlanFragmentV1,
  status: PlanFragmentStatusV1,
): PlanFragmentV1 {
  return createPlanFragmentV1({
    ...(without(
      latest as unknown as Record<string, unknown>,
      "fragmentDigest",
    ) as unknown as Omit<PlanFragmentV1, "fragmentDigest" | "fragmentId">),
    fragmentId: latest.fragmentId,
    fragmentRevision: latest.fragmentRevision + 1,
    previousStateDigest: latest.fragmentDigest,
    status,
  });
}

function applyObservedLifecycle(
  state: PlanningReducerStateV1,
  command: PlanningReducerCommandV1,
  latest: PlanFragmentV1,
  nextFragment: PlanFragmentV1,
  mapping: FragmentWorkMappingV1 | null,
  role: AdaptiveRoleBindingV1 | null,
  reservationStatus: PlanningBudgetReservationV1["status"],
  eventKind: PlanningReducerEventKindV1,
): PlanningReducerResultV1 {
  const fragments = [...state.planView.fragments, nextFragment].sort((a, b) =>
    compareCodeUnits(fragmentSortKey(a), fragmentSortKey(b)),
  );
  const budgetReservations = state.planView.budgetReservations.map((item) =>
    item.proposalDigest === latest.proposalDigest
      ? {
          ...item,
          fragmentDigest: nextFragment.fragmentDigest,
          status: reservationStatus,
        }
      : item,
  );
  const graph = graphProjection(fragments);
  const selectedHeads = state.planView.selectedHeads
    .map((item) =>
      item.fragmentDigest === latest.fragmentDigest
        ? { ...item, fragmentDigest: nextFragment.fragmentDigest }
        : item,
    )
    .filter(
      (item) =>
        !new Set(["superseded", "cancelled", "completed", "failed"]).has(
          nextFragment.status,
        ) || item.fragmentDigest !== nextFragment.fragmentDigest,
    );
  const view = updateView(state.planView, {
    revision: state.planView.revision + 1,
    fragments,
    selectedHeads,
    causalFrontierDigests: graph.frontier,
    unresolvedDependencyDigests: graph.unresolved,
    budgetReservations,
    workMappings: [
      ...state.planView.workMappings.filter(
        (item) => item.fragmentDigest !== latest.fragmentDigest,
      ),
      ...(mapping === null ? [] : [mapping]),
    ].sort((a, b) => compareCodeUnits(a.fragmentDigest, b.fragmentDigest)),
    activeRoleBindings: [
      ...state.planView.activeRoleBindings.filter(
        (item) => item.fragmentDigest !== latest.fragmentDigest,
      ),
      ...(role === null ? [] : [role]),
    ].sort((a, b) => compareCodeUnits(a.roleBindingId, b.roleBindingId)),
  });
  const water: PlanningDomainHighWaterV1 = {
    schemaVersion: 1,
    domain: "fragment",
    recordId: nextFragment.fragmentId,
    revision: nextFragment.fragmentRevision,
    digest: nextFragment.fragmentDigest,
  };
  const recordHighWaters = [
    ...state.recordHighWaters.filter(
      (item) =>
        !(
          item.domain === "fragment" &&
          item.recordId === nextFragment.fragmentId
        ),
    ),
    water,
  ].sort((a, b) => compareCodeUnits(recordKey(a), recordKey(b)));
  const next = finalizeState(state, command, {
    planView: view,
    recordHighWaters,
  });
  return applied(state, next, command, [
    [eventKind, nextFragment.fragmentId, nextFragment.fragmentDigest],
  ]);
}

function observedTimeValid(
  state: PlanningReducerStateV1,
  latest: PlanFragmentV1,
  logicalTimeMs: number,
): PlanningReducerResultV1 | null {
  if (logicalTimeMs > state.planView.logicalTimeHighWaterMs)
    return nonApplied(
      state,
      "rejected",
      "logical_time_regression",
      "fragment observation is ahead of logical time",
    );
  if (logicalTimeMs < latest.acceptedAtLogicalMs)
    return nonApplied(
      state,
      "rejected",
      "fragment_transition_invalid",
      "fragment observation predates acceptance",
    );
  if (
    state.planView.logicalTimeHighWaterMs - logicalTimeMs >
    state.missionIntent.planningLimits.replanningLogicalWindowMs
  )
    return nonApplied(
      state,
      "rejected",
      "logical_window_exceeded",
      "fragment observation is outside its replanning window",
    );
  return null;
}

function projectFragmentToWork(
  state: PlanningReducerStateV1,
  command: ProjectPlanningFragmentToWorkCommandV1,
): PlanningReducerResultV1 {
  const latest = latestFragments(state.planView).get(command.fragmentId);
  if (
    !latest ||
    latest.fragmentDigest !== command.previousFragmentDigest ||
    latest.status !== "active"
  )
    return nonApplied(
      state,
      "rejected",
      "fragment_transition_invalid",
      "fragment is not the named active head",
    );
  const timeError = observedTimeValid(
    state,
    latest,
    command.transitionedAtLogicalMs,
  );
  if (timeError) return timeError;
  if (
    command.workTarget.meshId !== state.missionIntent.objective.meshId ||
    command.workTarget.objectiveId !== state.missionIntent.objective.objectiveId
  )
    return nonApplied(
      state,
      "rejected",
      "scope_mismatch",
      "Work target differs from the mission Objective",
    );
  if (
    latest.dependencyFragmentDigests.some((digest) => {
      const dependency = state.planView.fragments.find(
        (item) => item.fragmentDigest === digest,
      );
      return (
        !dependency ||
        latestFragments(state.planView).get(dependency.fragmentId)?.status !==
          "completed"
      );
    })
  )
    return nonApplied(
      state,
      "rejected",
      "graph_invalid",
      "fragment dependencies are not completed",
    );
  const reused = state.commandHighWaters.some(({ command: retained }) => {
    const target =
      retained.kind === "fragment.project-to-work" ||
      retained.kind === "work.revision.observe"
        ? retained.workTarget
        : undefined;
    return (
      target &&
      target.meshId === command.workTarget.meshId &&
      target.objectiveId === command.workTarget.objectiveId &&
      target.workItemId === command.workTarget.workItemId &&
      target.workItemRevision === command.workTarget.workItemRevision
    );
  });
  if (reused)
    return nonApplied(
      state,
      "conflict",
      "work_mapping_conflict",
      "Work revision was already mapped",
    );
  const nextFragment = makeLifecycleFragment(latest, "offered");
  return applyObservedLifecycle(
    state,
    command,
    latest,
    nextFragment,
    mappingFor(nextFragment.fragmentDigest, command.workTarget),
    null,
    "committed",
    "fragment.projected-to-work",
  );
}

function roleMatchesTransition(
  state: PlanningReducerStateV1,
  latest: PlanFragmentV1,
  next: PlanFragmentV1,
  role: AdaptiveRoleBindingV1,
): boolean {
  return (
    role.status === "current" &&
    role.fragmentDigest === next.fragmentDigest &&
    role.planViewDigest === state.planView.stateDigest &&
    role.roleKey === latest.roleKey &&
    checkScope(state, role) &&
    role.leaseExpiresAtLogicalMs > state.planView.logicalTimeHighWaterMs &&
    state.admittedSubjects.some(
      (item) =>
        item.peerId === role.assignedPeerId &&
        item.peerInstanceId === role.assignedInstanceId,
    )
  );
}

function observeFragmentAssignment(
  state: PlanningReducerStateV1,
  command: ObservePlanningFragmentAssignmentCommandV1,
): PlanningReducerResultV1 {
  const latest = latestFragments(state.planView).get(command.fragmentId);
  const mapping = latest
    ? currentMapping(state, latest.fragmentDigest)
    : undefined;
  if (
    !latest ||
    latest.fragmentDigest !== command.previousFragmentDigest ||
    latest.status !== "offered"
  )
    return nonApplied(
      state,
      "rejected",
      "fragment_transition_invalid",
      "fragment is not the named offered head",
    );
  if (!mapping || !sameMapping(mapping, command.expectedWorkMapping))
    return nonApplied(
      state,
      "conflict",
      "work_mapping_conflict",
      "Work mapping CAS failed",
    );
  const nextFragment = makeLifecycleFragment(latest, "assigned");
  if (!roleMatchesTransition(state, latest, nextFragment, command.roleBinding))
    return nonApplied(
      state,
      "rejected",
      "role_binding_invalid",
      "assignment binding differs from the fragment, intent, prior view, lease or admitted subject",
    );
  return applyObservedLifecycle(
    state,
    command,
    latest,
    nextFragment,
    mappingFor(nextFragment.fragmentDigest, mapping),
    command.roleBinding,
    "committed",
    "fragment.assignment-observed",
  );
}

function sameRoleAuthority(
  left: AdaptiveRoleBindingV1,
  right: AdaptiveRoleBindingV1,
): boolean {
  return (
    left.roleBindingId === right.roleBindingId &&
    left.workContractId === right.workContractId &&
    left.workContractDigest === right.workContractDigest &&
    left.assignedPeerId === right.assignedPeerId &&
    left.assignedInstanceId === right.assignedInstanceId &&
    left.assignmentAuthorityId === right.assignmentAuthorityId &&
    left.assignmentEpoch === right.assignmentEpoch &&
    left.authorityGeneration === right.authorityGeneration &&
    left.fencingToken === right.fencingToken &&
    left.leaseExpiresAtLogicalMs === right.leaseExpiresAtLogicalMs
  );
}

function observeFragmentExecution(
  state: PlanningReducerStateV1,
  command: ObservePlanningFragmentExecutionCommandV1,
): PlanningReducerResultV1 {
  const latest = latestFragments(state.planView).get(command.fragmentId);
  const mapping = latest
    ? currentMapping(state, latest.fragmentDigest)
    : undefined;
  const previousRole = latest
    ? currentRole(state, latest.fragmentDigest)
    : undefined;
  if (
    !latest ||
    latest.fragmentDigest !== command.previousFragmentDigest ||
    latest.status !== "assigned"
  )
    return nonApplied(
      state,
      "rejected",
      "fragment_transition_invalid",
      "fragment is not the named assigned head",
    );
  if (
    !previousRole ||
    previousRole.roleBindingDigest !== command.previousRoleBindingDigest
  )
    return nonApplied(
      state,
      "conflict",
      "role_binding_conflict",
      "role binding CAS failed",
    );
  const nextFragment = makeLifecycleFragment(latest, "executing");
  if (
    !mapping ||
    !roleMatchesTransition(state, latest, nextFragment, command.roleBinding) ||
    !sameRoleAuthority(previousRole, command.roleBinding)
  )
    return nonApplied(
      state,
      "rejected",
      "role_binding_invalid",
      "execution binding changes assignment authority or is not current",
    );
  return applyObservedLifecycle(
    state,
    command,
    latest,
    nextFragment,
    mappingFor(nextFragment.fragmentDigest, mapping),
    command.roleBinding,
    "committed",
    "fragment.execution-observed",
  );
}

function observeFragmentTerminal(
  state: PlanningReducerStateV1,
  command: ObservePlanningFragmentTerminalCommandV1,
): PlanningReducerResultV1 {
  const latest = latestFragments(state.planView).get(command.fragmentId);
  if (
    !latest ||
    latest.fragmentDigest !== command.previousFragmentDigest ||
    !new Set(["offered", "assigned", "executing"]).has(latest.status)
  )
    return nonApplied(
      state,
      "rejected",
      "fragment_transition_invalid",
      "fragment is not a projected non-terminal head",
    );
  if (
    (command.status === "completed" && latest.status !== "executing") ||
    (command.status === "failed" && latest.status === "offered")
  )
    return nonApplied(
      state,
      "rejected",
      "fragment_transition_invalid",
      "terminal status is invalid for the lifecycle state",
    );
  const timeError = observedTimeValid(
    state,
    latest,
    command.transitionedAtLogicalMs,
  );
  if (timeError) return timeError;
  const mapping = currentMapping(state, latest.fragmentDigest);
  if (!mapping || !sameMapping(mapping, command.expectedWorkMapping))
    return nonApplied(
      state,
      "conflict",
      "work_mapping_conflict",
      "Work mapping CAS failed",
    );
  const role = currentRole(state, latest.fragmentDigest);
  if ((role?.roleBindingDigest ?? null) !== command.expectedRoleBindingDigest)
    return nonApplied(
      state,
      "conflict",
      "role_binding_conflict",
      "role binding CAS failed",
    );
  if (
    (latest.status === "assigned" || latest.status === "executing") !==
    (role !== undefined)
  )
    return nonApplied(
      state,
      "rejected",
      "role_binding_invalid",
      "terminal observation does not name the required active role",
    );
  const nextFragment = makeLifecycleFragment(latest, command.status);
  const reservationStatus =
    latest.status === "offered" &&
    (command.status === "cancelled" || command.status === "superseded")
      ? "released"
      : "committed";
  return applyObservedLifecycle(
    state,
    command,
    latest,
    nextFragment,
    null,
    null,
    reservationStatus,
    "fragment.terminal-observed",
  );
}

function observeWorkRevision(
  state: PlanningReducerStateV1,
  command: ObservePlanningWorkRevisionCommandV1,
): PlanningReducerResultV1 {
  const latest = latestFragments(state.planView).get(command.fragmentId);
  if (
    !latest ||
    latest.fragmentDigest !== command.previousFragmentDigest ||
    latest.status !== "offered"
  )
    return nonApplied(
      state,
      "rejected",
      "fragment_transition_invalid",
      "fragment is not an unassigned offered head",
    );
  const mapping = currentMapping(state, latest.fragmentDigest);
  if (!mapping || !sameMapping(mapping, command.expectedWorkMapping))
    return nonApplied(
      state,
      "conflict",
      "work_mapping_conflict",
      "Work mapping CAS failed",
    );
  if (
    command.workTarget.meshId !== mapping.meshId ||
    command.workTarget.objectiveId !== mapping.objectiveId ||
    command.workTarget.workItemId !== mapping.workItemId ||
    command.workTarget.workItemRevision !== mapping.workItemRevision + 1
  )
    return nonApplied(
      state,
      "rejected",
      "work_revision_invalid",
      "Work revision must advance the same identity by exactly one",
    );
  const nextFragment = makeLifecycleFragment(latest, "offered");
  if (command.roleBinding !== null)
    return nonApplied(
      state,
      "rejected",
      "role_binding_invalid",
      "Work revision cannot retain or introduce assignment authority",
    );
  return applyObservedLifecycle(
    state,
    command,
    latest,
    nextFragment,
    mappingFor(nextFragment.fragmentDigest, command.workTarget),
    command.roleBinding,
    "committed",
    "work.revision-observed",
  );
}

function advanceTime(
  state: PlanningReducerStateV1,
  command: AdvancePlanningLogicalTimeCommandV1,
): PlanningReducerResultV1 {
  if (command.logicalTimeMs <= state.planView.logicalTimeHighWaterMs)
    return nonApplied(state, "idempotent");
  const view = updateView(state.planView, {
    revision: state.planView.revision + 1,
    logicalTimeHighWaterMs: command.logicalTimeMs,
  });
  const next = finalizeState(state, command, { planView: view });
  return applied(state, next, command, [
    [
      "logical-time.advanced",
      String(command.logicalTimeMs),
      command.commandDigest,
    ],
  ]);
}

export function reducePlanningCommandV1(
  stateInput: PlanningReducerStateV1,
  commandInput: unknown,
): PlanningReducerResultV1 {
  validatePlanningReducerStateV1(stateInput);
  let command: PlanningReducerCommandV1;
  try {
    command = validatePlanningReducerCommandV1(commandInput);
  } catch (caught) {
    return nonApplied(
      stateInput,
      "rejected",
      "invalid_command",
      caught instanceof Error ? caught.message : "invalid command",
    );
  }
  const commandWater = stateInput.commandHighWaters.find(
    (item) => item.commandId === command.commandId,
  );
  if (commandWater)
    return commandWater.commandDigest === command.commandDigest
      ? nonApplied(stateInput, "idempotent")
      : command.kind === "observation.record"
        ? nonApplied(
            stateInput,
            "conflict",
            "cursor_high_water_conflict",
            "observation cursor was reused with different content",
          )
        : nonApplied(
            stateInput,
            "conflict",
            "logical_identity_conflict",
            "command identity was reused with a different digest",
          );
  if (
    command.kind === "logical-time.advance" &&
    command.logicalTimeMs <= stateInput.planView.logicalTimeHighWaterMs
  )
    return nonApplied(stateInput, "idempotent");
  if (
    command.expectedStateDigest !== null &&
    command.expectedStateDigest !== stateInput.stateDigest
  )
    return nonApplied(
      stateInput,
      "rejected",
      "stale_state_digest",
      "expected state digest does not match current state",
    );
  if (
    stateInput.commandHighWaters.length >=
    stateInput.missionIntent.planningLimits.maximumCandidateFragments * 8
  )
    return nonApplied(
      stateInput,
      "rejected",
      "planning_limit_exceeded",
      "command high-water bound is exhausted",
    );
  try {
    switch (command.kind) {
      case "observation.record":
        return recordObservation(stateInput, command);
      case "proposal.record":
        return recordProposal(stateInput, command);
      case "slot.evaluate":
        return evaluateSlot(stateInput, command);
      case "fragment.transition":
        return transitionFragment(stateInput, command);
      case "fragment.project-to-work":
        return projectFragmentToWork(stateInput, command);
      case "fragment.assignment.observe":
        return observeFragmentAssignment(stateInput, command);
      case "fragment.execution.observe":
        return observeFragmentExecution(stateInput, command);
      case "fragment.terminal.observe":
        return observeFragmentTerminal(stateInput, command);
      case "work.revision.observe":
        return observeWorkRevision(stateInput, command);
      case "logical-time.advance":
        return advanceTime(stateInput, command);
    }
  } catch (caught) {
    return nonApplied(
      stateInput,
      "rejected",
      "planning_limit_exceeded",
      caught instanceof Error
        ? caught.message
        : "candidate transition validation failed",
    );
  }
}

export function planningReducerSnapshotDigestV1(
  snapshot: Omit<PlanningReducerSnapshotV1, "snapshotDigest">,
): PlanningDigestV1 {
  return digestPlanningJsonV1(
    "planning-reducer-snapshot",
    snapshot as unknown as JsonValue,
    STATE_LIMITS,
  );
}

export function validatePlanningReducerSnapshotV1(
  value: unknown,
): PlanningReducerSnapshotV1 {
  assertPlanningExactKeys(
    value,
    [
      "format",
      "formatVersion",
      "schemaVersion",
      "snapshotId",
      "state",
      "snapshotDigest",
    ],
    "planning reducer snapshot",
  );
  if (
    value.format !== "agentplat.collective-planning.reducer-snapshot" ||
    value.formatVersion !== 1 ||
    value.schemaVersion !== 1
  )
    throw new CollectivePlanningValidationError(
      "reducer snapshot format is invalid",
    );
  assertPlanningIdentifier(value.snapshotId, "snapshotId");
  const state = validatePlanningReducerStateV1(value.state);
  canonicalizePlanningJsonV1(value as unknown as JsonValue, {
    ...STATE_LIMITS,
    maximumBytes: state.missionIntent.planningLimits.maximumSnapshotBytes,
  });
  assertPlanningDigest(value.snapshotDigest, "snapshotDigest");
  if (
    planningReducerSnapshotDigestV1(
      without(value, "snapshotDigest") as unknown as Omit<
        PlanningReducerSnapshotV1,
        "snapshotDigest"
      >,
    ) !== value.snapshotDigest
  )
    throw new CollectivePlanningValidationError("snapshotDigest mismatch");
  return deepFreezePlanning({
    ...value,
  }) as unknown as PlanningReducerSnapshotV1;
}

export function createPlanningReducerSnapshotV1(
  stateInput: PlanningReducerStateV1,
): PlanningReducerSnapshotV1 {
  const state = validatePlanningReducerStateV1(stateInput);
  const snapshotIdDigest = digestPlanningJsonV1("planning-reducer-snapshot", {
    stateDigest: state.stateDigest,
  } as JsonValue);
  const input = {
    format: "agentplat.collective-planning.reducer-snapshot" as const,
    formatVersion: 1 as const,
    schemaVersion: 1 as const,
    snapshotId: `planning-snapshot:${snapshotIdDigest.slice(7)}`,
    state,
  };
  return validatePlanningReducerSnapshotV1({
    ...input,
    snapshotDigest: planningReducerSnapshotDigestV1(input),
  });
}

export function restorePlanningReducerSnapshotV1(
  currentInput: PlanningReducerStateV1,
  snapshotInput: unknown,
): PlanningReducerStateV1 {
  const current = validatePlanningReducerStateV1(currentInput);
  const snapshot = validatePlanningReducerSnapshotV1(snapshotInput);
  const next = snapshot.state;
  if (
    current.tenantId !== next.tenantId ||
    current.policyDomainId !== next.policyDomainId ||
    current.peerId !== next.peerId ||
    current.peerInstanceId !== next.peerInstanceId ||
    current.missionIntent.intentDigest !== next.missionIntent.intentDigest ||
    current.selectionPolicy.policyDigest !== next.selectionPolicy.policyDigest
  )
    throw new CollectivePlanningValidationError(
      "snapshot planning domain or frozen policy changed",
    );
  if (
    !sameJson(current.admittedSubjects, next.admittedSubjects) ||
    !sameJson(current.planView.budgetShards, next.planView.budgetShards)
  )
    throw new CollectivePlanningValidationError("snapshot_layout_changed");
  if (
    next.planView.logicalTimeHighWaterMs <
      current.planView.logicalTimeHighWaterMs ||
    next.planView.revision < current.planView.revision
  )
    throw new CollectivePlanningValidationError("snapshot_rollback");
  if (
    next.planView.revision === current.planView.revision &&
    next.planView.stateDigest !== current.planView.stateDigest
  )
    throw new CollectivePlanningValidationError("snapshot_rollback");
  const requireHistory = <T>(
    previous: readonly T[],
    following: readonly T[],
    digestOf: (item: T) => string,
  ): void => {
    const followingDigests = new Set(following.map(digestOf));
    if (previous.some((item) => !followingDigests.has(digestOf(item))))
      throw new CollectivePlanningValidationError("snapshot_rollback");
  };
  requireHistory(
    current.observations,
    next.observations,
    (item) => item.observationDigest,
  );
  requireHistory(
    current.planView.proposals,
    next.planView.proposals,
    (item) => item.proposalDigest,
  );
  requireHistory(
    current.planView.decisions,
    next.planView.decisions,
    (item) => item.decisionDigest,
  );
  requireHistory(
    current.planView.fragments,
    next.planView.fragments,
    (item) => item.fragmentDigest,
  );
  const nextReservations = new Map(
    next.planView.budgetReservations.map((item) => [item.reservationId, item]),
  );
  const allowedReservationTransitions: Readonly<
    Record<
      PlanningBudgetReservationV1["status"],
      ReadonlySet<PlanningBudgetReservationV1["status"]>
    >
  > = {
    reserved: new Set(["reserved", "committed", "released"]),
    committed: new Set(["committed", "released"]),
    released: new Set(["released"]),
  };
  for (const item of current.planView.budgetReservations) {
    const candidate = nextReservations.get(item.reservationId);
    if (
      !candidate ||
      candidate.peerId !== item.peerId ||
      candidate.peerInstanceId !== item.peerInstanceId ||
      candidate.proposalDigest !== item.proposalDigest ||
      candidate.units !== item.units ||
      !allowedReservationTransitions[item.status].has(candidate.status)
    )
      throw new CollectivePlanningValidationError("snapshot_rollback");
  }
  const nextRecords = new Map(
    next.recordHighWaters.map((item) => [recordKey(item), item]),
  );
  for (const item of current.recordHighWaters) {
    const candidate = nextRecords.get(recordKey(item));
    if (
      !candidate ||
      candidate.revision < item.revision ||
      (candidate.revision === item.revision && candidate.digest !== item.digest)
    )
      throw new CollectivePlanningValidationError("snapshot_rollback");
  }
  const nextCommands = new Map(
    next.commandHighWaters.map((item) => [item.commandId, item]),
  );
  for (const item of current.commandHighWaters) {
    const candidate = nextCommands.get(item.commandId);
    if (
      candidate?.commandDigest !== item.commandDigest ||
      !sameJson(candidate.command, item.command) ||
      candidate.appliedAtLogicalMs !== item.appliedAtLogicalMs
    )
      throw new CollectivePlanningValidationError("snapshot_rollback");
  }
  const nextCursors = new Map(
    next.observationCursorHighWaters.map((item) => [
      `${item.observerPeerId}\u0000${item.observerInstanceId}\u0000${item.environmentCursor}`,
      item.observationDigest,
    ]),
  );
  for (const item of current.observationCursorHighWaters)
    if (
      nextCursors.get(
        `${item.observerPeerId}\u0000${item.observerInstanceId}\u0000${item.environmentCursor}`,
      ) !== item.observationDigest
    )
      throw new CollectivePlanningValidationError("snapshot_rollback");
  return next;
}

export function replayPlanningCommandsV1(
  initialState: PlanningReducerStateV1,
  commands: readonly unknown[],
): PlanningReducerStateV1 {
  let state = validatePlanningReducerStateV1(initialState);
  for (const command of commands) {
    const result = reducePlanningCommandV1(state, command);
    if (result.status === "rejected" || result.status === "conflict")
      throw new CollectivePlanningValidationError(
        `replay failed: ${result.error.code}`,
      );
    state = result.state;
  }
  return state;
}
