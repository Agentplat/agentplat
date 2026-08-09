import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";

import type {
  TeamExecutionPolicyRecordV1,
  TeamExecutionStateV1,
} from "./team-execution-contracts.js";
import { validateTeamExecutionStateV1 } from "./team-execution-validation.js";
import type {
  TeamFormationRequestV1,
  TeamPositionV1,
} from "./team-formation-contracts.js";
import {
  createTeamFormationRequestV1,
  createTeamPositionV1,
  validateTeamPositionV1,
} from "./team-formation-validation.js";
import type {
  TeamStructureAdaptationDecisionV1,
  TeamStructureFormationAdapterInputV1,
  TeamStructureMaterializationV1,
  TeamStructureObservationV1,
  TeamStructurePositionBindingV1,
  TeamStructureTemplateCatalogV1,
} from "./team-structure-adaptation-contracts.js";
import {
  createTeamStructureObservationV1,
  validateTeamStructureAdaptationDecisionV1,
  validateTeamStructureTemplateCatalogV1,
} from "./team-structure-adaptation-validation.js";

/**
 * Derives only finite execution facts. Artifact references, messages, and raw
 * task content are intentionally excluded from the observation.
 */
export function createTeamStructureObservationFromExecutionStateV1(input: {
  readonly observationId: string;
  readonly executionState: TeamExecutionStateV1;
  readonly executionPolicy: TeamExecutionPolicyRecordV1;
  readonly decision: TeamStructureAdaptationDecisionV1;
  readonly catalog: TeamStructureTemplateCatalogV1;
  readonly materialization: TeamStructureMaterializationV1;
  readonly observedAtLogicalMs: number;
}): TeamStructureObservationV1 {
  const executionState = validateTeamExecutionStateV1(input.executionState, {
    policy: input.executionPolicy,
  });
  const decision = validateTeamStructureAdaptationDecisionV1(input.decision);
  const catalog = validateTeamStructureTemplateCatalogV1(input.catalog);
  const materialization = validateTeamStructureMaterializationV1(
    input.materialization,
    { catalog },
  );
  const execution = executionState.execution;
  if (!execution)
    throw new TypeError("team structure observation requires an execution");
  if (execution.status === "active")
    throw new TypeError(
      "active team execution cannot produce an adaptation observation",
    );
  const template = catalog.templates.find(
    (item) => item.templateId === decision.selectedTemplateId,
  );
  if (!template || template.templateDigest !== decision.selectedTemplateDigest)
    throw new TypeError(
      "team structure decision selected an unapproved template",
    );
  if (
    materialization.templateId !== decision.selectedTemplateId ||
    materialization.templateDigest !== decision.selectedTemplateDigest
  )
    throw new TypeError(
      "team structure materialization is not bound to the decision",
    );
  if (execution.positions.length !== template.positions.length)
    throw new TypeError(
      "team execution position count does not match selected template",
    );
  const materializedPositions = new Map(
    materialization.positions.map((position) => [
      position.positionId,
      position.positionDigest,
    ]),
  );
  if (
    execution.proposal.positions.length !== materialization.positions.length ||
    execution.proposal.positions.some(
      (position) =>
        materializedPositions.get(position.positionId) !==
        position.positionDigest,
    ) ||
    execution.positions.some(
      (position) =>
        materializedPositions.get(position.positionId) !==
        position.positionDigest,
    )
  )
    throw new TypeError(
      "team execution proposal does not match structure materialization",
    );
  if (input.observedAtLogicalMs < executionState.logicalTimeHighWaterMs)
    throw new TypeError("team structure observation time regressed");
  const completedPositionCount = execution.positions.filter(
    (item) => item.status === "completed",
  ).length;
  const failedPositionCount = execution.positions.filter(
    (item) => item.status === "failed",
  ).length;
  const unsafePositionCount = execution.positions.filter(
    (item) => item.status === "unsafe",
  ).length;
  const outcome =
    unsafePositionCount > 0
      ? "unsafe"
      : failedPositionCount > 0 || execution.status === "recovery_required"
        ? "failed"
        : execution.status === "completed"
          ? "completed"
          : "incomplete";
  return createTeamStructureObservationV1({
    schemaVersion: 1,
    observationId: input.observationId,
    executionStateDigest: executionState.stateDigest,
    executionId: execution.executionId,
    executionEpoch: execution.executionEpoch,
    executionRecordDigest: execution.recordDigest,
    terminalExecutionStatus: execution.status,
    proposalDigest: execution.proposal.proposalDigest,
    jointWorkContractDigest:
      execution.jointWorkContract.jointWorkContractDigest,
    adaptationEpoch: decision.adaptationEpoch,
    decisionDigest: decision.decisionDigest,
    teamId: execution.proposal.teamId,
    teamEpoch: execution.proposal.teamEpoch,
    templateId: template.templateId,
    templateDigest: template.templateDigest,
    outcome,
    completedPositionCount,
    failedPositionCount,
    unsafePositionCount,
    observedAtLogicalMs: input.observedAtLogicalMs,
  });
}

/** Materialization copies only approved template fields; bindings cannot choose roles or budgets. */
export function createTeamStructureMaterializationV1(input: {
  readonly templateId: string;
  readonly catalog: TeamStructureTemplateCatalogV1;
  readonly bindings: readonly TeamStructurePositionBindingV1[];
}): TeamStructureMaterializationV1 {
  const catalog = validateTeamStructureTemplateCatalogV1(input.catalog);
  const template = catalog.templates.find(
    (item) => item.templateId === input.templateId,
  );
  if (!template) throw new TypeError("team structure template is not approved");
  if (
    !Array.isArray(input.bindings) ||
    input.bindings.length !== template.positions.length
  )
    throw new TypeError("team structure bindings do not cover template");
  const bindings = input.bindings
    .map(normalizeBinding)
    .sort((left, right) =>
      left.templatePositionId.localeCompare(right.templatePositionId),
    );
  const byTemplatePosition = new Map<string, TeamStructurePositionBindingV1>();
  for (const binding of bindings) {
    if (byTemplatePosition.has(binding.templatePositionId))
      throw new TypeError("team structure binding is duplicated");
    byTemplatePosition.set(binding.templatePositionId, binding);
  }
  if (
    bindings.some(
      (binding) =>
        !template.positions.some(
          (position) =>
            position.templatePositionId === binding.templatePositionId,
        ),
    )
  )
    throw new TypeError(
      "team structure binding references no template position",
    );
  const positions = template.positions
    .map((position) => {
      const binding = byTemplatePosition.get(position.templatePositionId);
      if (!binding)
        throw new TypeError(
          "team structure binding references no template position",
        );
      return createTeamPositionV1({
        schemaVersion: 1,
        positionId: binding.positionId,
        workItemId: binding.workItemId,
        workItemRevision: binding.workItemRevision,
        roleKey: position.roleKey,
        requiredCapabilityKeys: position.requiredCapabilityKeys,
        completionCriteria: position.completionCriteria,
        dependsOnPositionIds: position.dependsOnTemplatePositionIds.map(
          (dependency) => {
            const dependencyBinding = byTemplatePosition.get(dependency);
            if (!dependencyBinding)
              throw new TypeError(
                "team structure dependency binding is unavailable",
              );
            return dependencyBinding.positionId;
          },
        ),
        budgetUnits: position.budgetUnits,
        maximumActionBudgetUnits: position.maximumActionBudgetUnits,
      });
    })
    .sort((a, b) => a.positionId.localeCompare(b.positionId));
  if (
    new Set(positions.map((position) => position.positionId)).size !==
    positions.length
  )
    throw new TypeError("materialized position IDs are not unique");
  const body = freeze({
    schemaVersion: 1 as const,
    templateId: template.templateId,
    templateDigest: template.templateDigest,
    bindings: freeze(bindings),
    positions: freeze(positions),
  });
  return freeze({
    ...body,
    materializationDigest: digest("team-structure-materialization", body),
  });
}

export function validateTeamStructureMaterializationV1(
  input: unknown,
  options: { readonly catalog: TeamStructureTemplateCatalogV1 },
): TeamStructureMaterializationV1 {
  const value = exact(
    input,
    [
      "bindings",
      "materializationDigest",
      "positions",
      "schemaVersion",
      "templateDigest",
      "templateId",
    ],
    "team structure materialization",
  );
  if (value.schemaVersion !== 1)
    throw new TypeError("team structure materialization schema is invalid");
  const result = createTeamStructureMaterializationV1({
    templateId: value.templateId as string,
    catalog: options.catalog,
    bindings: value.bindings as readonly TeamStructurePositionBindingV1[],
  });
  if (!Array.isArray(value.positions))
    throw new TypeError("team structure materialization positions are invalid");
  const suppliedPositions = value.positions.map(validateTeamPositionV1);
  if (
    value.templateDigest !== result.templateDigest ||
    suppliedPositions.length !== result.positions.length ||
    suppliedPositions.some(
      (position, index) =>
        position.positionDigest !== result.positions[index]?.positionDigest,
    ) ||
    value.materializationDigest !== result.materializationDigest
  )
    throw new TypeError(
      "team structure materialization digest or translated graph is invalid",
    );
  return result;
}

/** The returned request remains subject to TeamFormation's authority, budget, and eligibility validation. */
export function createTeamFormationRequestFromTeamStructureV1(
  input: TeamStructureFormationAdapterInputV1,
): TeamFormationRequestV1 {
  const decision = validateTeamStructureAdaptationDecisionV1(input.decision);
  const catalog = validateTeamStructureTemplateCatalogV1(input.catalog);
  const materialization = validateTeamStructureMaterializationV1(
    input.materialization,
    { catalog },
  );
  if (
    !decision.advisoryOnly ||
    decision.selectedTemplateId !== materialization.templateId ||
    decision.selectedTemplateDigest !== materialization.templateDigest
  )
    throw new TypeError(
      "team structure decision and materialization do not match",
    );
  if (positive(input.targetTeamEpoch, "formation target team epoch") !== 1)
    throw new TypeError(
      "team structure formation requires a fresh team at epoch 1",
    );
  if (
    input.logicalTimeMs < decision.evaluatedAtLogicalMs ||
    input.logicalTimeMs >= decision.expiresAtLogicalMs
  )
    throw new TypeError("team structure advisory is not current for formation");
  return createTeamFormationRequestV1({
    schemaVersion: 1,
    requestId: input.requestId,
    scope: input.scope,
    membershipEpoch: input.membershipEpoch,
    membershipConfigurationDigest: input.membershipConfigurationDigest,
    positions: materialization.positions,
    bids: input.bids,
    logicalTimeMs: input.logicalTimeMs,
    validUntilLogicalMs: input.validUntilLogicalMs,
  });
}

function exact(
  input: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new TypeError(`${label} is invalid`);
  const actual = Object.keys(input).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  )
    throw new TypeError(`${label} has unexpected fields`);
  return input as Record<string, unknown>;
}
function normalizeBinding(input: unknown): TeamStructurePositionBindingV1 {
  const value = exact(
    input,
    ["positionId", "templatePositionId", "workItemId", "workItemRevision"],
    "team structure position binding",
  );
  return freeze({
    templatePositionId: identifier(
      value.templatePositionId,
      "binding template position ID",
    ),
    positionId: identifier(value.positionId, "binding position ID"),
    workItemId: identifier(value.workItemId, "binding work item ID"),
    workItemRevision: positive(
      value.workItemRevision,
      "binding work item revision",
    ),
  });
}
function identifier(input: unknown, label: string): string {
  if (
    typeof input !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u.test(input)
  )
    throw new TypeError(`${label} is invalid`);
  return input;
}
function positive(input: unknown, label: string): number {
  if (!Number.isSafeInteger(input) || (input as number) < 1)
    throw new TypeError(`${label} is invalid`);
  return input as number;
}
function digest(domain: string, input: unknown): PlanningDigestV1 {
  return digestPlanningJsonV1(domain as never, input as PlanningJson);
}
function freeze<T>(input: T): T {
  return Object.freeze(input);
}
