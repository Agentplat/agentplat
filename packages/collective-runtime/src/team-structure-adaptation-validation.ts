import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";

import {
  TEAM_STRUCTURE_ADAPTATION_HANDOFF_FORMAT_V1,
  TEAM_STRUCTURE_ADAPTATION_SCHEMA_VERSION_V1,
  TEAM_STRUCTURE_ADAPTATION_STATE_FORMAT_V1,
  type TeamStructureAdaptationDecisionV1,
  type TeamStructureAdaptationHandoffEnvelopeV1,
  type TeamStructureAdaptationPolicyRecordV1,
  type TeamStructureAdaptationPolicyV1,
  type TeamStructureAdaptationRequestV1,
  type TeamStructureAdaptationStateV1,
  type TeamStructureObservationV1,
  type TeamStructureObservationHeadV1,
  type TeamStructureTemplateArmV1,
  type TeamStructureTemplateCatalogV1,
  type TeamStructureTemplatePositionV1,
  type TeamStructureTemplateV1,
} from "./team-structure-adaptation-contracts.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/+-= ]{0,511}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const BPS = 10_000;
const outcomes = new Set(["completed", "failed", "unsafe", "incomplete"]);
const terminalStatuses = new Set([
  "completed",
  "recovery_required",
  "cancelled",
]);
const modes = new Set([
  "baseline",
  "baseline_floor",
  "explore",
  "exploit",
  "hysteresis",
  "cooldown",
  "safe_fallback",
]);

export function createTeamStructureTemplatePositionV1(
  input: Omit<TeamStructureTemplatePositionV1, "positionTemplateDigest">,
): TeamStructureTemplatePositionV1 {
  exact(
    input,
    [
      "budgetUnits",
      "completionCriteria",
      "dependsOnTemplatePositionIds",
      "maximumActionBudgetUnits",
      "requiredCapabilityKeys",
      "roleKey",
      "schemaVersion",
      "templatePositionId",
    ],
    "team structure template position",
  );
  schema(input.schemaVersion, "team structure template position");
  const body = freeze({
    schemaVersion: 1 as const,
    templatePositionId: id(input.templatePositionId, "template position ID"),
    roleKey: id(input.roleKey, "template role key"),
    requiredCapabilityKeys: ids(
      input.requiredCapabilityKeys,
      "template required capability keys",
      1,
    ),
    completionCriteria: tokens(
      input.completionCriteria,
      "template completion criteria",
      1,
    ),
    dependsOnTemplatePositionIds: ids(
      input.dependsOnTemplatePositionIds,
      "template dependencies",
      0,
    ),
    budgetUnits: positive(input.budgetUnits, "template position budget"),
    maximumActionBudgetUnits: positive(
      input.maximumActionBudgetUnits,
      "template action budget",
    ),
  });
  if (body.maximumActionBudgetUnits > body.budgetUnits)
    fail("template action budget exceeds position budget");
  if (body.dependsOnTemplatePositionIds.includes(body.templatePositionId))
    fail("template position depends on itself");
  return freeze({
    ...body,
    positionTemplateDigest: digest("team-structure-template-position", body),
  });
}

export function validateTeamStructureTemplatePositionV1(
  input: unknown,
): TeamStructureTemplatePositionV1 {
  const value = exact(
    input,
    [
      "budgetUnits",
      "completionCriteria",
      "dependsOnTemplatePositionIds",
      "maximumActionBudgetUnits",
      "positionTemplateDigest",
      "requiredCapabilityKeys",
      "roleKey",
      "schemaVersion",
      "templatePositionId",
    ],
    "team structure template position",
  );
  const { positionTemplateDigest, ...body } = value;
  const result = createTeamStructureTemplatePositionV1(
    body as Omit<TeamStructureTemplatePositionV1, "positionTemplateDigest">,
  );
  if (value.positionTemplateDigest !== result.positionTemplateDigest)
    fail("template position digest is invalid");
  return result;
}

export function createTeamStructureTemplateV1(
  input: Omit<TeamStructureTemplateV1, "templateDigest">,
): TeamStructureTemplateV1 {
  exact(
    input,
    ["positions", "schemaVersion", "templateId", "templateVersion"],
    "team structure template",
  );
  schema(input.schemaVersion, "team structure template");
  const positions = sorted(
    input.positions,
    validateTeamStructureTemplatePositionV1,
    (x) => x.templatePositionId,
    "template positions",
    1,
  );
  const idsSet = new Set(positions.map((x) => x.templatePositionId));
  for (const position of positions)
    for (const dependency of position.dependsOnTemplatePositionIds)
      if (!idsSet.has(dependency)) fail("template dependency is unknown");
  assertDag(positions);
  const body = freeze({
    schemaVersion: 1 as const,
    templateId: id(input.templateId, "template ID"),
    templateVersion: positive(input.templateVersion, "template version"),
    positions,
  });
  return freeze({
    ...body,
    templateDigest: digest("team-structure-template", body),
  });
}

export function validateTeamStructureTemplateV1(
  input: unknown,
): TeamStructureTemplateV1 {
  const value = exact(
    input,
    [
      "positions",
      "schemaVersion",
      "templateDigest",
      "templateId",
      "templateVersion",
    ],
    "team structure template",
  );
  const { templateDigest, ...body } = value;
  const result = createTeamStructureTemplateV1(
    body as Omit<TeamStructureTemplateV1, "templateDigest">,
  );
  if (value.templateDigest !== result.templateDigest)
    fail("team structure template digest is invalid");
  return result;
}

export function createTeamStructureTemplateCatalogV1(
  input: Omit<TeamStructureTemplateCatalogV1, "catalogDigest">,
): TeamStructureTemplateCatalogV1 {
  exact(
    input,
    [
      "baselineTemplateId",
      "catalogId",
      "catalogVersion",
      "parentCatalogDigest",
      "schemaVersion",
      "templates",
    ],
    "team structure template catalog",
  );
  schema(input.schemaVersion, "team structure template catalog");
  const templates = sorted(
    input.templates,
    validateTeamStructureTemplateV1,
    (x) => x.templateId,
    "catalog templates",
    1,
  );
  const baselineTemplateId = id(
    input.baselineTemplateId,
    "catalog baseline template ID",
  );
  if (!templates.some((x) => x.templateId === baselineTemplateId))
    fail("catalog baseline template is unknown");
  const body = freeze({
    schemaVersion: 1 as const,
    catalogId: id(input.catalogId, "catalog ID"),
    catalogVersion: positive(input.catalogVersion, "catalog version"),
    parentCatalogDigest: nullableDigest(
      input.parentCatalogDigest,
      "catalog parent digest",
    ),
    baselineTemplateId,
    templates,
  });
  return freeze({
    ...body,
    catalogDigest: digest("team-structure-template-catalog", body),
  });
}

export function validateTeamStructureTemplateCatalogV1(
  input: unknown,
): TeamStructureTemplateCatalogV1 {
  const value = exact(
    input,
    [
      "baselineTemplateId",
      "catalogDigest",
      "catalogId",
      "catalogVersion",
      "parentCatalogDigest",
      "schemaVersion",
      "templates",
    ],
    "team structure template catalog",
  );
  const { catalogDigest, ...body } = value;
  const result = createTeamStructureTemplateCatalogV1(
    body as Omit<TeamStructureTemplateCatalogV1, "catalogDigest">,
  );
  if (value.catalogDigest !== result.catalogDigest)
    fail("team structure catalog digest is invalid");
  return result;
}

export function createTeamStructureAdaptationPolicyV1(
  input: TeamStructureAdaptationPolicyV1,
): TeamStructureAdaptationPolicyRecordV1 {
  const policy = normalizePolicy(input);
  return freeze({
    schemaVersion: 1,
    policy,
    policyDigest: digest("team-structure-adaptation-policy", policy),
  });
}

export function validateTeamStructureAdaptationPolicyV1(
  input: unknown,
): TeamStructureAdaptationPolicyRecordV1 {
  const value = exact(
    input,
    ["policy", "policyDigest", "schemaVersion"],
    "team structure adaptation policy record",
  );
  schema(value.schemaVersion, "team structure adaptation policy record");
  const result = createTeamStructureAdaptationPolicyV1(
    value.policy as TeamStructureAdaptationPolicyV1,
  );
  if (value.policyDigest !== result.policyDigest)
    fail("team structure adaptation policy digest is invalid");
  return result;
}

export function createTeamStructureObservationV1(
  input: Omit<TeamStructureObservationV1, "observationDigest">,
): TeamStructureObservationV1 {
  exact(
    input,
    [
      "adaptationEpoch",
      "completedPositionCount",
      "decisionDigest",
      "executionEpoch",
      "executionId",
      "executionRecordDigest",
      "executionStateDigest",
      "failedPositionCount",
      "jointWorkContractDigest",
      "observationId",
      "observedAtLogicalMs",
      "outcome",
      "proposalDigest",
      "schemaVersion",
      "teamEpoch",
      "teamId",
      "templateDigest",
      "templateId",
      "terminalExecutionStatus",
      "unsafePositionCount",
    ],
    "team structure observation",
  );
  schema(input.schemaVersion, "team structure observation");
  const body = freeze({
    schemaVersion: 1 as const,
    observationId: id(input.observationId, "observation ID"),
    executionStateDigest: sha(
      input.executionStateDigest,
      "observation execution state digest",
    ),
    executionId: id(input.executionId, "observation execution ID"),
    executionEpoch: positive(
      input.executionEpoch,
      "observation execution epoch",
    ),
    executionRecordDigest: sha(
      input.executionRecordDigest,
      "observation execution record digest",
    ),
    terminalExecutionStatus: terminalStatus(input.terminalExecutionStatus),
    proposalDigest: sha(input.proposalDigest, "observation proposal digest"),
    jointWorkContractDigest: sha(
      input.jointWorkContractDigest,
      "observation joint work contract digest",
    ),
    adaptationEpoch: positive(
      input.adaptationEpoch,
      "observation adaptation epoch",
    ),
    decisionDigest: sha(input.decisionDigest, "observation decision digest"),
    teamId: id(input.teamId, "observation team ID"),
    teamEpoch: positive(input.teamEpoch, "observation team epoch"),
    templateId: id(input.templateId, "observation template ID"),
    templateDigest: sha(input.templateDigest, "observation template digest"),
    outcome: outcome(input.outcome),
    completedPositionCount: nonNegative(
      input.completedPositionCount,
      "completed position count",
    ),
    failedPositionCount: nonNegative(
      input.failedPositionCount,
      "failed position count",
    ),
    unsafePositionCount: nonNegative(
      input.unsafePositionCount,
      "unsafe position count",
    ),
    observedAtLogicalMs: nonNegative(
      input.observedAtLogicalMs,
      "observation time",
    ),
  });
  const expectedOutcome =
    body.unsafePositionCount > 0
      ? "unsafe"
      : body.failedPositionCount > 0 ||
          body.terminalExecutionStatus === "recovery_required"
        ? "failed"
        : body.terminalExecutionStatus === "completed"
          ? "completed"
          : "incomplete";
  if (body.outcome !== expectedOutcome)
    fail(
      "team structure observation outcome contradicts terminal execution facts",
    );
  return freeze({
    ...body,
    observationDigest: digest("team-structure-observation", body),
  });
}

export function validateTeamStructureObservationV1(
  input: unknown,
): TeamStructureObservationV1 {
  const value = exact(
    input,
    [
      "adaptationEpoch",
      "completedPositionCount",
      "decisionDigest",
      "executionEpoch",
      "executionId",
      "executionRecordDigest",
      "executionStateDigest",
      "failedPositionCount",
      "jointWorkContractDigest",
      "observationDigest",
      "observationId",
      "observedAtLogicalMs",
      "outcome",
      "proposalDigest",
      "schemaVersion",
      "teamEpoch",
      "teamId",
      "templateDigest",
      "templateId",
      "terminalExecutionStatus",
      "unsafePositionCount",
    ],
    "team structure observation",
  );
  const { observationDigest, ...body } = value;
  const result = createTeamStructureObservationV1(
    body as Omit<TeamStructureObservationV1, "observationDigest">,
  );
  if (value.observationDigest !== result.observationDigest)
    fail("team structure observation digest is invalid");
  return result;
}

export function createTeamStructureAdaptationRequestV1(
  input: Omit<TeamStructureAdaptationRequestV1, "requestDigest">,
): TeamStructureAdaptationRequestV1 {
  exact(
    input,
    [
      "currentAdaptationEpoch",
      "eligibleTemplateIds",
      "entropyEvidenceDigest",
      "explorationDrawBps",
      "logicalTimeMs",
      "nextAdaptationEpoch",
      "requestId",
      "schemaVersion",
      "validUntilLogicalMs",
    ],
    "team structure adaptation request",
  );
  schema(input.schemaVersion, "team structure adaptation request");
  const body = freeze({
    schemaVersion: 1 as const,
    requestId: id(input.requestId, "adaptation request ID"),
    currentAdaptationEpoch: nonNegative(
      input.currentAdaptationEpoch,
      "current adaptation epoch",
    ),
    nextAdaptationEpoch: positive(
      input.nextAdaptationEpoch,
      "next adaptation epoch",
    ),
    logicalTimeMs: nonNegative(input.logicalTimeMs, "adaptation request time"),
    validUntilLogicalMs: positive(
      input.validUntilLogicalMs,
      "adaptation request expiry",
    ),
    eligibleTemplateIds: ids(
      input.eligibleTemplateIds,
      "eligible template IDs",
      1,
    ),
    explorationDrawBps: bps(input.explorationDrawBps, "exploration draw"),
    entropyEvidenceDigest: sha(
      input.entropyEvidenceDigest,
      "entropy evidence digest",
    ),
  });
  if (
    body.nextAdaptationEpoch !== body.currentAdaptationEpoch + 1 ||
    body.validUntilLogicalMs <= body.logicalTimeMs
  )
    fail("adaptation request epoch or expiry is invalid");
  return freeze({
    ...body,
    requestDigest: digest("team-structure-adaptation-request", body),
  });
}

export function validateTeamStructureAdaptationRequestV1(
  input: unknown,
): TeamStructureAdaptationRequestV1 {
  const value = exact(
    input,
    [
      "currentAdaptationEpoch",
      "eligibleTemplateIds",
      "entropyEvidenceDigest",
      "explorationDrawBps",
      "logicalTimeMs",
      "nextAdaptationEpoch",
      "requestDigest",
      "requestId",
      "schemaVersion",
      "validUntilLogicalMs",
    ],
    "team structure adaptation request",
  );
  const { requestDigest, ...body } = value;
  const result = createTeamStructureAdaptationRequestV1(
    body as Omit<TeamStructureAdaptationRequestV1, "requestDigest">,
  );
  if (value.requestDigest !== result.requestDigest)
    fail("adaptation request digest is invalid");
  return result;
}

export function createTeamStructureAdaptationDecisionV1(
  input: Omit<TeamStructureAdaptationDecisionV1, "decisionDigest">,
): TeamStructureAdaptationDecisionV1 {
  exact(
    input,
    [
      "adaptationEpoch",
      "advisoryOnly",
      "committedStateRevision",
      "decisionId",
      "evaluatedAtLogicalMs",
      "expiresAtLogicalMs",
      "priorStateRevision",
      "requestDigest",
      "requestId",
      "schemaVersion",
      "selectedTemplateDigest",
      "selectedTemplateId",
      "selectionMode",
    ],
    "team structure adaptation decision",
  );
  schema(input.schemaVersion, "team structure adaptation decision");
  if (input.advisoryOnly !== true)
    fail("team structure decision must be advisory");
  const body = freeze({
    schemaVersion: 1 as const,
    decisionId: id(input.decisionId, "decision ID"),
    requestId: id(input.requestId, "decision request ID"),
    requestDigest: sha(input.requestDigest, "decision request digest"),
    selectedTemplateId: id(input.selectedTemplateId, "decision template ID"),
    selectedTemplateDigest: sha(
      input.selectedTemplateDigest,
      "decision template digest",
    ),
    selectionMode: mode(input.selectionMode),
    adaptationEpoch: positive(
      input.adaptationEpoch,
      "decision adaptation epoch",
    ),
    advisoryOnly: true as const,
    evaluatedAtLogicalMs: nonNegative(
      input.evaluatedAtLogicalMs,
      "decision time",
    ),
    expiresAtLogicalMs: positive(input.expiresAtLogicalMs, "decision expiry"),
    priorStateRevision: nonNegative(
      input.priorStateRevision,
      "decision prior revision",
    ),
    committedStateRevision: positive(
      input.committedStateRevision,
      "decision committed revision",
    ),
  });
  if (
    body.committedStateRevision !== body.priorStateRevision + 1 ||
    body.expiresAtLogicalMs <= body.evaluatedAtLogicalMs
  )
    fail("team structure decision revisions or expiry are invalid");
  return freeze({
    ...body,
    decisionDigest: digest("team-structure-adaptation-decision", body),
  });
}

export function validateTeamStructureAdaptationDecisionV1(
  input: unknown,
): TeamStructureAdaptationDecisionV1 {
  const value = exact(
    input,
    [
      "adaptationEpoch",
      "advisoryOnly",
      "committedStateRevision",
      "decisionDigest",
      "decisionId",
      "evaluatedAtLogicalMs",
      "expiresAtLogicalMs",
      "priorStateRevision",
      "requestDigest",
      "requestId",
      "schemaVersion",
      "selectedTemplateDigest",
      "selectedTemplateId",
      "selectionMode",
    ],
    "team structure adaptation decision",
  );
  const { decisionDigest, ...body } = value;
  const result = createTeamStructureAdaptationDecisionV1(
    body as Omit<TeamStructureAdaptationDecisionV1, "decisionDigest">,
  );
  if (value.decisionDigest !== result.decisionDigest)
    fail("team structure decision digest is invalid");
  return result;
}

export function createTeamStructureAdaptationStateV1(
  input: Omit<
    TeamStructureAdaptationStateV1,
    | "format"
    | "schemaVersion"
    | "stateDigest"
    | "arms"
    | "observationDigests"
    | "observationHeads"
    | "decisions"
    | "lastDecision"
    | "adaptationEpochHighWater"
    | "policyId"
    | "policyVersion"
    | "policyDigest"
    | "catalogDigest"
  > & {
    readonly catalog: TeamStructureTemplateCatalogV1;
    readonly policy: TeamStructureAdaptationPolicyRecordV1;
    readonly arms?: readonly TeamStructureTemplateArmV1[];
    readonly observationDigests?: readonly PlanningDigestV1[];
    readonly observationHeads?: readonly TeamStructureObservationHeadV1[];
    readonly decisions?: readonly TeamStructureAdaptationDecisionV1[];
    readonly lastDecision?: TeamStructureAdaptationDecisionV1 | null;
  },
): TeamStructureAdaptationStateV1 {
  const catalog = validateTeamStructureTemplateCatalogV1(input.catalog);
  const policy = validateTeamStructureAdaptationPolicyV1(input.policy);
  const providedArms =
    input.arms ??
    catalog.templates.map((template) => ({
      schemaVersion: 1 as const,
      templateId: template.templateId,
      templateDigest: template.templateDigest,
      weightMicros: policy.policy.initialWeightMicros,
      selectionCount: 0,
      observationCount: 0,
      completedCount: 0,
      failedCount: 0,
      unsafeCount: 0,
      quarantinedUntilEpoch: 0,
    }));
  const arms = sorted(
    providedArms,
    validateArm,
    (x) => x.templateId,
    "adaptation arms",
    1,
  );
  if (catalog.templates.length > policy.policy.limits.maximumTemplates)
    fail("catalog exceeds adaptation template limit");
  for (const template of catalog.templates) {
    if (
      template.positions.length >
      policy.policy.limits.maximumPositionsPerTemplate
    )
      fail("template exceeds adaptation position limit");
    if (
      template.positions.some(
        (position) =>
          position.dependsOnTemplatePositionIds.length >
          policy.policy.limits.maximumDependenciesPerPosition,
      )
    )
      fail("template exceeds adaptation dependency limit");
  }
  if (arms.length !== catalog.templates.length)
    fail("adaptation arms do not cover catalog");
  for (const template of catalog.templates) {
    const arm = arms.find((x) => x.templateId === template.templateId);
    if (!arm || arm.templateDigest !== template.templateDigest)
      fail("adaptation arm is not catalog-bound");
    if (
      arm.weightMicros < policy.policy.minimumWeightMicros ||
      arm.weightMicros > policy.policy.maximumWeightMicros
    )
      fail("adaptation arm weight is out of policy bounds");
  }
  const observationHeads = sorted(
    input.observationHeads ?? [],
    validateObservationHead,
    (item) => item.observationId,
    "observation heads",
    0,
  );
  if (
    new Set(
      observationHeads.map(
        (item) => `${item.executionId}\u0000${item.executionEpoch}`,
      ),
    ).size !== observationHeads.length
  )
    fail("observation execution heads are not unique");
  const observationDigests = digests(
    input.observationDigests ??
      observationHeads.map((item) => item.observationDigest),
    "observation digests",
    policy.policy.limits.maximumObservations,
  );
  if (
    observationHeads.length !== observationDigests.length ||
    observationHeads.some(
      (item) => !observationDigests.includes(item.observationDigest),
    )
  )
    fail("observation heads do not match observation digests");
  const decisions = decisionHistory(
    input.decisions ?? [],
    policy.policy.limits.maximumDecisions,
  );
  for (const head of observationHeads) {
    const decision = decisions.find(
      (item) => item.adaptationEpoch === head.adaptationEpoch,
    );
    if (!decision || decision.decisionDigest !== head.decisionDigest)
      fail("observation head is not bound to decision history");
  }
  const derivedLastDecision = decisions.at(-1) ?? null;
  const suppliedLastDecision =
    input.lastDecision === undefined
      ? derivedLastDecision
      : input.lastDecision === null
        ? null
        : validateTeamStructureAdaptationDecisionV1(input.lastDecision);
  if (
    (derivedLastDecision?.decisionDigest ?? null) !==
    (suppliedLastDecision?.decisionDigest ?? null)
  )
    fail("last adaptation decision does not match history");
  let adaptationEpochHighWater = 0;
  for (const head of observationHeads)
    adaptationEpochHighWater = Math.max(
      adaptationEpochHighWater,
      head.adaptationEpoch,
    );
  for (const decision of decisions)
    adaptationEpochHighWater = Math.max(
      adaptationEpochHighWater,
      decision.adaptationEpoch,
    );
  const body = freeze({
    format: TEAM_STRUCTURE_ADAPTATION_STATE_FORMAT_V1,
    schemaVersion: TEAM_STRUCTURE_ADAPTATION_SCHEMA_VERSION_V1,
    stateKey: id(input.stateKey, "adaptation state key"),
    adaptationId: id(input.adaptationId, "adaptation ID"),
    adaptationVersion: positive(input.adaptationVersion, "adaptation version"),
    implementationId: id(
      input.implementationId,
      "adaptation implementation ID",
    ),
    policyId: policy.policy.policyId,
    policyVersion: policy.policy.policyVersion,
    policyDigest: policy.policyDigest,
    catalogDigest: catalog.catalogDigest,
    revision: nonNegative(input.revision ?? 0, "adaptation state revision"),
    logicalTimeHighWaterMs: nonNegative(
      input.logicalTimeHighWaterMs ?? 0,
      "adaptation high-water time",
    ),
    adaptationEpochHighWater,
    arms,
    observationDigests,
    observationHeads,
    decisions,
    lastDecision: suppliedLastDecision,
    predecessorStateDigest: nullableDigest(
      input.predecessorStateDigest ?? null,
      "adaptation predecessor state digest",
    ),
  });
  if (
    decisions.some(
      (decision) =>
        decision.committedStateRevision > body.revision ||
        decision.evaluatedAtLogicalMs > body.logicalTimeHighWaterMs,
    )
  )
    fail("adaptation decision is not state-bound");
  if (
    decisions.some(
      (decision) =>
        !catalog.templates.some(
          (template) =>
            template.templateId === decision.selectedTemplateId &&
            template.templateDigest === decision.selectedTemplateDigest,
        ),
    )
  )
    fail("adaptation decision selected an unapproved template");
  return freeze({
    ...body,
    stateDigest: digest("team-structure-adaptation-state", body),
  });
}

export function validateTeamStructureAdaptationStateV1(
  input: unknown,
  options: {
    readonly catalog: TeamStructureTemplateCatalogV1;
    readonly policy: TeamStructureAdaptationPolicyRecordV1;
  },
): TeamStructureAdaptationStateV1 {
  const value = exact(
    input,
    [
      "adaptationEpochHighWater",
      "adaptationId",
      "adaptationVersion",
      "arms",
      "catalogDigest",
      "decisions",
      "format",
      "implementationId",
      "lastDecision",
      "logicalTimeHighWaterMs",
      "observationDigests",
      "observationHeads",
      "policyDigest",
      "policyId",
      "policyVersion",
      "predecessorStateDigest",
      "revision",
      "schemaVersion",
      "stateDigest",
      "stateKey",
    ],
    "team structure adaptation state",
  );
  if (
    value.format !== TEAM_STRUCTURE_ADAPTATION_STATE_FORMAT_V1 ||
    value.schemaVersion !== 1
  )
    fail("team structure adaptation state format is invalid");
  const result = createTeamStructureAdaptationStateV1({
    stateKey: value.stateKey as string,
    adaptationId: value.adaptationId as string,
    adaptationVersion: value.adaptationVersion as number,
    implementationId: value.implementationId as string,
    catalog: options.catalog,
    policy: options.policy,
    revision: value.revision as number,
    logicalTimeHighWaterMs: value.logicalTimeHighWaterMs as number,
    arms: value.arms as readonly TeamStructureTemplateArmV1[],
    observationDigests: value.observationDigests as readonly PlanningDigestV1[],
    observationHeads:
      value.observationHeads as readonly TeamStructureObservationHeadV1[],
    decisions: value.decisions as readonly TeamStructureAdaptationDecisionV1[],
    lastDecision:
      value.lastDecision as TeamStructureAdaptationDecisionV1 | null,
    predecessorStateDigest:
      value.predecessorStateDigest as PlanningDigestV1 | null,
  });
  if (
    value.policyId !== result.policyId ||
    value.policyVersion !== result.policyVersion ||
    value.policyDigest !== result.policyDigest ||
    value.catalogDigest !== result.catalogDigest ||
    value.adaptationEpochHighWater !== result.adaptationEpochHighWater ||
    value.stateDigest !== result.stateDigest
  )
    fail("team structure adaptation state binding is invalid");
  return result;
}

export function createTeamStructureAdaptationHandoffV1(input: {
  readonly sourceState: TeamStructureAdaptationStateV1;
  readonly targetStateKey: string;
  readonly exportedAtLogicalMs: number;
  readonly catalog: TeamStructureTemplateCatalogV1;
  readonly policy: TeamStructureAdaptationPolicyRecordV1;
}): TeamStructureAdaptationHandoffEnvelopeV1 {
  const sourceState = validateTeamStructureAdaptationStateV1(
    input.sourceState,
    { catalog: input.catalog, policy: input.policy },
  );
  const body = freeze({
    format: TEAM_STRUCTURE_ADAPTATION_HANDOFF_FORMAT_V1,
    schemaVersion: 1 as const,
    contentClass: "team_structure_adaptation_state" as const,
    adaptationId: sourceState.adaptationId,
    adaptationVersion: sourceState.adaptationVersion,
    implementationId: sourceState.implementationId,
    policyDigest: sourceState.policyDigest,
    catalogDigest: sourceState.catalogDigest,
    sourceStateKey: sourceState.stateKey,
    sourceStateDigest: sourceState.stateDigest,
    targetStateKey: id(input.targetStateKey, "handoff target state key"),
    exportedAtLogicalMs: nonNegative(input.exportedAtLogicalMs, "handoff time"),
    sourceState,
  });
  if (
    body.targetStateKey === body.sourceStateKey ||
    body.exportedAtLogicalMs < sourceState.logicalTimeHighWaterMs
  )
    fail("team structure handoff binding is invalid");
  return freeze({
    ...body,
    handoffDigest: digest("team-structure-adaptation-handoff", body),
  });
}

export function validateTeamStructureAdaptationHandoffV1(
  input: unknown,
  options: {
    readonly catalog: TeamStructureTemplateCatalogV1;
    readonly policy: TeamStructureAdaptationPolicyRecordV1;
  },
): TeamStructureAdaptationHandoffEnvelopeV1 {
  const value = exact(
    input,
    [
      "adaptationId",
      "adaptationVersion",
      "catalogDigest",
      "contentClass",
      "exportedAtLogicalMs",
      "format",
      "handoffDigest",
      "implementationId",
      "policyDigest",
      "schemaVersion",
      "sourceState",
      "sourceStateDigest",
      "sourceStateKey",
      "targetStateKey",
    ],
    "team structure adaptation handoff",
  );
  if (
    value.format !== TEAM_STRUCTURE_ADAPTATION_HANDOFF_FORMAT_V1 ||
    value.schemaVersion !== 1 ||
    value.contentClass !== "team_structure_adaptation_state"
  )
    fail("team structure handoff format is invalid");
  const sourceState = validateTeamStructureAdaptationStateV1(
    value.sourceState,
    options,
  );
  const result = createTeamStructureAdaptationHandoffV1({
    sourceState,
    targetStateKey: value.targetStateKey as string,
    exportedAtLogicalMs: value.exportedAtLogicalMs as number,
    catalog: options.catalog,
    policy: options.policy,
  });
  if (
    value.adaptationId !== result.adaptationId ||
    value.adaptationVersion !== result.adaptationVersion ||
    value.implementationId !== result.implementationId ||
    value.policyDigest !== result.policyDigest ||
    value.catalogDigest !== result.catalogDigest ||
    value.sourceStateKey !== result.sourceStateKey ||
    value.sourceStateDigest !== result.sourceStateDigest ||
    value.handoffDigest !== result.handoffDigest
  )
    fail("team structure handoff digest or binding is invalid");
  return result;
}

function normalizePolicy(
  input: TeamStructureAdaptationPolicyV1,
): TeamStructureAdaptationPolicyV1 {
  const value = exact(
    input,
    [
      "baselineProbabilityFloorBps",
      "cooldownEpochs",
      "explorationCapBps",
      "hysteresisMicros",
      "initialWeightMicros",
      "learningStepMicros",
      "limits",
      "maximumWeightMicros",
      "minimumObservationCount",
      "minimumWeightMicros",
      "parentPolicyDigest",
      "policyId",
      "policyVersion",
      "quarantineEpochs",
      "schemaVersion",
    ],
    "team structure adaptation policy",
  );
  schema(value.schemaVersion, "team structure adaptation policy");
  const limits = exact(
    value.limits,
    [
      "maximumCommitAttempts",
      "maximumDecisionTtlMs",
      "maximumDecisions",
      "maximumDependenciesPerPosition",
      "maximumObservations",
      "maximumPositionsPerTemplate",
      "maximumTemplates",
    ],
    "team structure adaptation limits",
  );
  const policy = freeze({
    schemaVersion: 1 as const,
    policyId: id(value.policyId, "adaptation policy ID"),
    policyVersion: positive(value.policyVersion, "adaptation policy version"),
    parentPolicyDigest: nullableDigest(
      value.parentPolicyDigest,
      "adaptation policy parent digest",
    ),
    learningStepMicros: positive(value.learningStepMicros, "learning step"),
    minimumObservationCount: positive(
      value.minimumObservationCount,
      "minimum observation count",
    ),
    initialWeightMicros: positive(value.initialWeightMicros, "initial weight"),
    minimumWeightMicros: positive(value.minimumWeightMicros, "minimum weight"),
    maximumWeightMicros: positive(value.maximumWeightMicros, "maximum weight"),
    baselineProbabilityFloorBps: bps(
      value.baselineProbabilityFloorBps,
      "baseline floor",
    ),
    explorationCapBps: bps(value.explorationCapBps, "exploration cap"),
    cooldownEpochs: nonNegative(value.cooldownEpochs, "cooldown epochs"),
    hysteresisMicros: nonNegative(value.hysteresisMicros, "hysteresis"),
    quarantineEpochs: positive(value.quarantineEpochs, "quarantine epochs"),
    limits: freeze({
      maximumTemplates: positive(limits.maximumTemplates, "maximum templates"),
      maximumPositionsPerTemplate: positive(
        limits.maximumPositionsPerTemplate,
        "maximum positions per template",
      ),
      maximumDependenciesPerPosition: nonNegative(
        limits.maximumDependenciesPerPosition,
        "maximum dependencies per position",
      ),
      maximumObservations: positive(
        limits.maximumObservations,
        "maximum observations",
      ),
      maximumDecisions: positive(limits.maximumDecisions, "maximum decisions"),
      maximumCommitAttempts: positive(
        limits.maximumCommitAttempts,
        "maximum commit attempts",
      ),
      maximumDecisionTtlMs: positive(
        limits.maximumDecisionTtlMs,
        "maximum decision TTL",
      ),
    }),
  });
  if (
    policy.minimumWeightMicros > policy.initialWeightMicros ||
    policy.initialWeightMicros > policy.maximumWeightMicros ||
    policy.learningStepMicros > policy.maximumWeightMicros ||
    policy.minimumObservationCount > policy.limits.maximumObservations
  )
    fail("adaptation policy weight or observation bounds are invalid");
  return policy;
}

function validateArm(input: unknown): TeamStructureTemplateArmV1 {
  const value = exact(
    input,
    [
      "completedCount",
      "failedCount",
      "observationCount",
      "quarantinedUntilEpoch",
      "schemaVersion",
      "selectionCount",
      "templateDigest",
      "templateId",
      "unsafeCount",
      "weightMicros",
    ],
    "team structure template arm",
  );
  schema(value.schemaVersion, "team structure template arm");
  return freeze({
    schemaVersion: 1 as const,
    templateId: id(value.templateId, "arm template ID"),
    templateDigest: sha(value.templateDigest, "arm template digest"),
    weightMicros: positive(value.weightMicros, "arm weight"),
    selectionCount: nonNegative(value.selectionCount, "arm selection count"),
    observationCount: nonNegative(
      value.observationCount,
      "arm observation count",
    ),
    completedCount: nonNegative(value.completedCount, "arm completion count"),
    failedCount: nonNegative(value.failedCount, "arm failure count"),
    unsafeCount: nonNegative(value.unsafeCount, "arm unsafe count"),
    quarantinedUntilEpoch: nonNegative(
      value.quarantinedUntilEpoch,
      "arm quarantine epoch",
    ),
  });
}

function validateObservationHead(
  input: unknown,
): TeamStructureObservationHeadV1 {
  const value = exact(
    input,
    [
      "adaptationEpoch",
      "decisionDigest",
      "executionEpoch",
      "executionId",
      "observationDigest",
      "observationId",
      "schemaVersion",
      "teamEpoch",
    ],
    "team structure observation head",
  );
  schema(value.schemaVersion, "team structure observation head");
  return freeze({
    schemaVersion: 1 as const,
    observationId: id(value.observationId, "observation head ID"),
    executionId: id(value.executionId, "observation head execution ID"),
    executionEpoch: positive(
      value.executionEpoch,
      "observation head execution epoch",
    ),
    adaptationEpoch: positive(
      value.adaptationEpoch,
      "observation head adaptation epoch",
    ),
    decisionDigest: sha(
      value.decisionDigest,
      "observation head decision digest",
    ),
    teamEpoch: positive(value.teamEpoch, "observation head team epoch"),
    observationDigest: sha(value.observationDigest, "observation head digest"),
  });
}

function assertDag(
  positions: readonly TeamStructureTemplatePositionV1[],
): void {
  const remaining = new Map(
    positions.map((position) => [
      position.templatePositionId,
      position.dependsOnTemplatePositionIds.length,
    ]),
  );
  const dependents = new Map<string, string[]>();
  for (const position of positions) {
    for (const dependency of position.dependsOnTemplatePositionIds) {
      const list = dependents.get(dependency) ?? [];
      list.push(position.templatePositionId);
      dependents.set(dependency, list);
    }
  }
  const ready = [...remaining]
    .filter(([, count]) => count === 0)
    .map(([positionId]) => positionId);
  let visited = 0;
  while (ready.length) {
    const positionId = ready.pop()!;
    visited += 1;
    for (const dependent of dependents.get(positionId) ?? []) {
      const next = (remaining.get(dependent) ?? 0) - 1;
      remaining.set(dependent, next);
      if (next === 0) ready.push(dependent);
    }
  }
  if (visited !== positions.length)
    fail("team structure template must be a DAG");
}

function decisionHistory(
  input: unknown,
  maximum: number,
): readonly TeamStructureAdaptationDecisionV1[] {
  if (!Array.isArray(input) || input.length > maximum)
    fail("adaptation decision history is invalid");
  const decisions = input.map(validateTeamStructureAdaptationDecisionV1);
  const requestIds = new Set<string>();
  const requestDigests = new Set<string>();
  const epochs = new Set<number>();
  let previousEpoch = 0;
  for (const decision of decisions) {
    if (
      requestIds.has(decision.requestId) ||
      requestDigests.has(decision.requestDigest) ||
      epochs.has(decision.adaptationEpoch) ||
      decision.adaptationEpoch <= previousEpoch
    )
      fail("adaptation decision history conflicts");
    requestIds.add(decision.requestId);
    requestDigests.add(decision.requestDigest);
    epochs.add(decision.adaptationEpoch);
    previousEpoch = decision.adaptationEpoch;
  }
  return freeze(decisions);
}

function exact(
  input: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    fail(`${label} is invalid`);
  const value = input as Record<string, unknown>;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  )
    fail(`${label} has unexpected fields`);
  return value;
}
function sorted<T>(
  input: unknown,
  validate: (value: unknown) => T,
  key: (value: T) => string,
  label: string,
  minimum: number,
): readonly T[] {
  if (!Array.isArray(input) || input.length < minimum || input.length > 65_536)
    fail(`${label} are invalid`);
  const result = input
    .map(validate)
    .sort((a, b) => key(a).localeCompare(key(b)));
  if (new Set(result.map(key)).size !== result.length)
    fail(`${label} are not unique`);
  return freeze(result);
}
function ids(
  input: unknown,
  label: string,
  minimum: number,
): readonly string[] {
  if (!Array.isArray(input) || input.length < minimum || input.length > 256)
    fail(`${label} are invalid`);
  const result = [...new Set(input.map((x) => id(x, label)))].sort();
  if (result.length !== input.length) fail(`${label} are not unique`);
  return freeze(result);
}
function tokens(
  input: unknown,
  label: string,
  minimum: number,
): readonly string[] {
  if (!Array.isArray(input) || input.length < minimum || input.length > 256)
    fail(`${label} are invalid`);
  const result = [...new Set(input.map((x) => token(x, label)))].sort();
  if (result.length !== input.length) fail(`${label} are not unique`);
  return freeze(result);
}
function digests(
  input: unknown,
  label: string,
  maximum: number,
): readonly PlanningDigestV1[] {
  if (!Array.isArray(input) || input.length > maximum)
    fail(`${label} are invalid`);
  const result = [...new Set(input.map((x) => sha(x, label)))].sort();
  if (result.length !== input.length) fail(`${label} are not unique`);
  return freeze(result);
}
function id(input: unknown, label: string): string {
  if (typeof input !== "string" || !IDENTIFIER.test(input))
    fail(`${label} is invalid`);
  return input;
}
function token(input: unknown, label: string): string {
  if (typeof input !== "string" || !TOKEN.test(input))
    fail(`${label} is invalid`);
  return input;
}
function sha(input: unknown, label: string): PlanningDigestV1 {
  if (typeof input !== "string" || !DIGEST.test(input))
    fail(`${label} is invalid`);
  return input as PlanningDigestV1;
}
function nullableDigest(
  input: unknown,
  label: string,
): PlanningDigestV1 | null {
  return input === null ? null : sha(input, label);
}
function schema(input: unknown, label: string): void {
  if (input !== 1) fail(`${label} schema version is invalid`);
}
function positive(input: unknown, label: string): number {
  if (!Number.isSafeInteger(input) || (input as number) < 1)
    fail(`${label} is invalid`);
  return input as number;
}
function nonNegative(input: unknown, label: string): number {
  if (!Number.isSafeInteger(input) || (input as number) < 0)
    fail(`${label} is invalid`);
  return input as number;
}
function bps(input: unknown, label: string): number {
  const value = nonNegative(input, label);
  if (value > BPS) fail(`${label} is invalid`);
  return value;
}
function outcome(input: unknown): TeamStructureObservationV1["outcome"] {
  if (typeof input !== "string" || !outcomes.has(input))
    fail("observation outcome is invalid");
  return input as TeamStructureObservationV1["outcome"];
}
function terminalStatus(
  input: unknown,
): TeamStructureObservationV1["terminalExecutionStatus"] {
  if (typeof input !== "string" || !terminalStatuses.has(input))
    fail("observation terminal execution status is invalid");
  return input as TeamStructureObservationV1["terminalExecutionStatus"];
}
function mode(
  input: unknown,
): TeamStructureAdaptationDecisionV1["selectionMode"] {
  if (typeof input !== "string" || !modes.has(input))
    fail("decision selection mode is invalid");
  return input as TeamStructureAdaptationDecisionV1["selectionMode"];
}
function digest(domain: string, input: unknown): PlanningDigestV1 {
  return digestPlanningJsonV1(domain as never, input as PlanningJson);
}
function freeze<T>(input: T): T {
  return Object.freeze(input);
}
function fail(message: string): never {
  throw new TypeError(message);
}
