import type { JsonValue } from "@agentplat/core";

import { deepFreezeCollective, digestCollectiveJsonV1 } from "./canonical.js";
import type {
  BudgetReservationStatusV1,
  BudgetReservationV1,
  CollectiveDigestV1,
  DelegationMandateV1,
  GovernedActionPermitStatusV1,
  GovernedActionPermitV1,
  WorkContractStatusV1,
  WorkContractV1,
} from "./contracts.js";
import {
  assertCollectiveDigest,
  assertCollectiveExactKeys,
  assertCollectiveIdentifier,
  assertCollectiveSafeInteger,
  assertCollectiveTimestamp,
  budgetReservationDigestV1,
  governedActionPermitDigestV1,
  validateBudgetReservationV1,
  validateDelegationMandateV1,
  validateGovernedActionPermitV1,
  validateWorkContractV1,
  workContractDigestV1,
  CollectiveControlValidationError,
} from "./validation.js";

export interface CollectiveExecutionLimitsV1 {
  readonly maximumWorkContracts: number;
  readonly maximumBudgetReservations: number;
  readonly maximumActionPermits: number;
}

export interface CollectiveExecutionStateV1 {
  readonly schemaVersion: 1;
  readonly tenantId: string;
  readonly policyDomainId: string;
  readonly generation: number;
  readonly highWaterLogicalMs: number;
  readonly workContracts: readonly WorkContractV1[];
  readonly budgetReservations: readonly BudgetReservationV1[];
  readonly actionPermits: readonly GovernedActionPermitV1[];
  readonly limits: CollectiveExecutionLimitsV1;
  readonly stateDigest: CollectiveDigestV1;
}

export type CollectiveExecutionRejectionCodeV1 =
  | "logical_time_regressed"
  | "scope_mismatch"
  | "capacity_exceeded"
  | "state_conflict"
  | "work_idempotent"
  | "work_scope_widened"
  | "work_not_active"
  | "work_transition_invalid"
  | "budget_exceeded"
  | "reservation_conflict"
  | "permit_idempotent"
  | "permit_binding_mismatch"
  | "permit_transition_invalid";

export interface CollectiveExecutionDecisionV1 {
  readonly schemaVersion: 1;
  readonly accepted: boolean;
  readonly code: "accepted" | CollectiveExecutionRejectionCodeV1;
  readonly state: CollectiveExecutionStateV1;
  readonly workContract: WorkContractV1 | null;
  readonly budgetReservation: BudgetReservationV1 | null;
  readonly actionPermit: GovernedActionPermitV1 | null;
}

const DEFAULT_EXECUTION_LIMITS: CollectiveExecutionLimitsV1 = Object.freeze({
  maximumWorkContracts: 65_536,
  maximumBudgetReservations: 131_072,
  maximumActionPermits: 131_072,
});

const TERMINAL_WORK = new Set<WorkContractStatusV1>([
  "completed",
  "revoked",
  "expired",
  "released",
]);

const TERMINAL_PERMIT = new Set<GovernedActionPermitStatusV1>([
  "dispatched",
  "failed",
  "indeterminate",
  "expired",
]);

export function createCollectiveExecutionStateV1(input: {
  readonly tenantId: string;
  readonly policyDomainId: string;
  readonly limits?: Partial<CollectiveExecutionLimitsV1>;
}): CollectiveExecutionStateV1 {
  assertCollectiveIdentifier(input.tenantId, "tenantId");
  assertCollectiveIdentifier(input.policyDomainId, "policyDomainId");
  const limits = validateExecutionLimits({
    ...DEFAULT_EXECUTION_LIMITS,
    ...input.limits,
  });
  return buildState({
    schemaVersion: 1,
    tenantId: input.tenantId,
    policyDomainId: input.policyDomainId,
    generation: 1,
    highWaterLogicalMs: 0,
    workContracts: [],
    budgetReservations: [],
    actionPermits: [],
    limits,
  });
}

export function registerWorkContractV1(
  state: CollectiveExecutionStateV1,
  input: {
    readonly mandate: DelegationMandateV1;
    readonly workContract: WorkContractV1;
    readonly authorizedAt: string;
    readonly acceptedAtLogicalMs: number;
  },
): CollectiveExecutionDecisionV1 {
  const current = validateCollectiveExecutionStateV1(state);
  const mandate = validateDelegationMandateV1(input.mandate);
  const work = validateWorkContractV1(input.workContract);
  assertCollectiveTimestamp(input.authorizedAt, "authorizedAt");
  assertCollectiveSafeInteger(input.acceptedAtLogicalMs, "acceptedAtLogicalMs");
  if (input.acceptedAtLogicalMs < current.highWaterLogicalMs)
    return reject(current, "logical_time_regressed");
  if (!matchesScope(current, work.tenantId, work.policyDomainId))
    return reject(current, "scope_mismatch");
  const prior = current.workContracts.find(
    (candidate) => candidate.workContractId === work.workContractId,
  );
  if (prior)
    return prior.workContractDigest === work.workContractDigest
      ? idempotent(current, "work_idempotent", prior, null, null)
      : reject(current, "state_conflict", prior);
  if (current.workContracts.length >= current.limits.maximumWorkContracts)
    return reject(current, "capacity_exceeded");
  if (!workNarrowedByMandate(work, mandate, input.authorizedAt))
    return reject(current, "work_scope_widened");
  const activeForMandate = current.workContracts.filter(
    (candidate) =>
      candidate.mandate.mandateDigest === mandate.mandateDigest &&
      !TERMINAL_WORK.has(candidate.status),
  );
  if (
    activeForMandate.length >=
      mandate.statement.budget.maximumConcurrentWorkReservations ||
    sumSafe(
      activeForMandate.map((candidate) => candidate.reservedBudgetUnits),
    ) +
      work.reservedBudgetUnits >
      mandate.statement.budget.totalBudgetUnits
  )
    return reject(current, "budget_exceeded");
  const next = buildState({
    ...withoutStateDigest(current),
    generation: current.generation + 1,
    highWaterLogicalMs: input.acceptedAtLogicalMs,
    workContracts: sortById([...current.workContracts, work], "workContractId"),
  });
  return accept(next, work, null, null);
}

export function transitionWorkContractV1(
  state: CollectiveExecutionStateV1,
  input: {
    readonly workContractId: string;
    readonly expectedGeneration: number;
    readonly expectedDigest: CollectiveDigestV1;
    readonly nextStatus: WorkContractStatusV1;
    readonly terminalReasonCode: string | null;
    readonly logicalTimeMs: number;
  },
): CollectiveExecutionDecisionV1 {
  const current = validateCollectiveExecutionStateV1(state);
  assertCollectiveIdentifier(input.workContractId, "workContractId");
  assertCollectiveSafeInteger(
    input.expectedGeneration,
    "expectedGeneration",
    1,
  );
  assertCollectiveDigest(input.expectedDigest, "expectedDigest");
  assertCollectiveSafeInteger(input.logicalTimeMs, "logicalTimeMs");
  if (input.logicalTimeMs < current.highWaterLogicalMs)
    return reject(current, "logical_time_regressed");
  const index = current.workContracts.findIndex(
    (candidate) => candidate.workContractId === input.workContractId,
  );
  if (index < 0) return reject(current, "state_conflict");
  const prior = current.workContracts[index]!;
  if (
    prior.generation !== input.expectedGeneration ||
    prior.workContractDigest !== input.expectedDigest
  )
    return reject(current, "state_conflict", prior);
  if (!validWorkTransition(prior.status, input.nextStatus))
    return reject(current, "work_transition_invalid", prior);
  const body = {
    ...withoutWorkDigest(prior),
    generation: prior.generation + 1,
    updatedAtLogicalMs: input.logicalTimeMs,
    status: input.nextStatus,
    terminalReasonCode: input.terminalReasonCode,
  };
  const nextWork = validateWorkContractV1({
    ...body,
    workContractDigest: workContractDigestV1(body),
  });
  const workContracts = [...current.workContracts];
  workContracts[index] = nextWork;
  const next = buildState({
    ...withoutStateDigest(current),
    generation: current.generation + 1,
    highWaterLogicalMs: input.logicalTimeMs,
    workContracts,
  });
  return accept(next, nextWork, null, null);
}

export function issueGovernedActionPermitV1(
  state: CollectiveExecutionStateV1,
  input: {
    readonly mandate: DelegationMandateV1;
    readonly budgetReservation: BudgetReservationV1;
    readonly actionPermit: GovernedActionPermitV1;
    readonly authorizedAt: string;
    readonly acceptedAtLogicalMs: number;
  },
): CollectiveExecutionDecisionV1 {
  const current = validateCollectiveExecutionStateV1(state);
  const mandate = validateDelegationMandateV1(input.mandate);
  const reservation = validateBudgetReservationV1(input.budgetReservation);
  const permit = validateGovernedActionPermitV1(input.actionPermit);
  assertCollectiveTimestamp(input.authorizedAt, "authorizedAt");
  assertCollectiveSafeInteger(input.acceptedAtLogicalMs, "acceptedAtLogicalMs");
  if (input.acceptedAtLogicalMs < current.highWaterLogicalMs)
    return reject(current, "logical_time_regressed");
  if (
    !matchesScope(current, permit.tenantId, permit.policyDomainId) ||
    !matchesScope(current, reservation.tenantId, reservation.policyDomainId)
  )
    return reject(current, "scope_mismatch");
  const priorPermit = current.actionPermits.find(
    (candidate) => candidate.permitId === permit.permitId,
  );
  const priorReservation = current.budgetReservations.find(
    (candidate) => candidate.reservationId === reservation.reservationId,
  );
  const priorByIdempotency = current.budgetReservations.find(
    (candidate) =>
      candidate.workContractId === reservation.workContractId &&
      candidate.idempotencyKey === reservation.idempotencyKey,
  );
  if (priorPermit || priorReservation || priorByIdempotency) {
    if (
      priorPermit?.permitDigest === permit.permitDigest &&
      (priorReservation ?? priorByIdempotency)?.reservationDigest ===
        reservation.reservationDigest
    )
      return idempotent(
        current,
        "permit_idempotent",
        null,
        priorReservation ?? priorByIdempotency ?? null,
        priorPermit,
      );
    return reject(
      current,
      priorByIdempotency ? "reservation_conflict" : "state_conflict",
      null,
      priorReservation ?? priorByIdempotency ?? null,
      priorPermit ?? null,
    );
  }
  if (
    current.actionPermits.length >= current.limits.maximumActionPermits ||
    current.budgetReservations.length >=
      current.limits.maximumBudgetReservations
  )
    return reject(current, "capacity_exceeded");
  const work = current.workContracts.find(
    (candidate) => candidate.workContractId === permit.workContractId,
  );
  if (!work || work.status !== "active")
    return reject(current, "work_not_active", work ?? null);
  if (
    !permitBoundToUpstream(
      permit,
      reservation,
      work,
      mandate,
      input.authorizedAt,
      input.acceptedAtLogicalMs,
    )
  )
    return reject(current, "permit_binding_mismatch", work);
  const retainedForWork = current.budgetReservations.filter(
    (candidate) =>
      candidate.workContractId === work.workContractId &&
      candidate.status !== "released",
  );
  const retainedForMandate = current.budgetReservations.filter(
    (candidate) =>
      candidate.mandateDigest === mandate.mandateDigest &&
      candidate.status !== "released",
  );
  const concurrent = current.budgetReservations.filter(
    (candidate) =>
      candidate.mandateDigest === mandate.mandateDigest &&
      (candidate.status === "reserved" || candidate.status === "indeterminate"),
  );
  if (
    sumSafe(retainedForWork.map((candidate) => candidate.units)) +
      reservation.units >
      work.reservedBudgetUnits ||
    sumSafe(retainedForMandate.map((candidate) => candidate.units)) +
      reservation.units >
      mandate.statement.budget.totalBudgetUnits ||
    concurrent.length >=
      mandate.statement.budget.maximumConcurrentActionReservations
  )
    return reject(current, "budget_exceeded", work);
  const next = buildState({
    ...withoutStateDigest(current),
    generation: current.generation + 1,
    highWaterLogicalMs: input.acceptedAtLogicalMs,
    budgetReservations: sortById(
      [...current.budgetReservations, reservation],
      "reservationId",
    ),
    actionPermits: sortById([...current.actionPermits, permit], "permitId"),
  });
  return accept(next, work, reservation, permit);
}

export function transitionGovernedActionPermitV1(
  state: CollectiveExecutionStateV1,
  input: {
    readonly permitId: string;
    readonly expectedGeneration: number;
    readonly expectedDigest: CollectiveDigestV1;
    readonly nextStatus: GovernedActionPermitStatusV1;
    readonly outcomeId: string | null;
    readonly logicalTimeMs: number;
  },
): CollectiveExecutionDecisionV1 {
  const current = validateCollectiveExecutionStateV1(state);
  assertCollectiveIdentifier(input.permitId, "permitId");
  assertCollectiveSafeInteger(
    input.expectedGeneration,
    "expectedGeneration",
    1,
  );
  assertCollectiveDigest(input.expectedDigest, "expectedDigest");
  assertCollectiveSafeInteger(input.logicalTimeMs, "logicalTimeMs");
  if (input.logicalTimeMs < current.highWaterLogicalMs)
    return reject(current, "logical_time_regressed");
  const permitIndex = current.actionPermits.findIndex(
    (candidate) => candidate.permitId === input.permitId,
  );
  if (permitIndex < 0) return reject(current, "state_conflict");
  const prior = current.actionPermits[permitIndex]!;
  if (
    prior.generation !== input.expectedGeneration ||
    prior.permitDigest !== input.expectedDigest
  )
    return reject(current, "state_conflict", null, null, prior);
  if (!validPermitTransition(prior.status, input.nextStatus))
    return reject(current, "permit_transition_invalid", null, null, prior);
  const reservationIndex = current.budgetReservations.findIndex(
    (candidate) => candidate.reservationId === prior.budgetReservationId,
  );
  if (reservationIndex < 0) return reject(current, "state_conflict");
  const priorReservation = current.budgetReservations[reservationIndex]!;
  const permitOutcome =
    TERMINAL_PERMIT.has(input.nextStatus) && input.nextStatus !== "expired"
      ? input.outcomeId
      : null;
  const permitBody = {
    ...withoutPermitDigest(prior),
    generation: prior.generation + 1,
    status: input.nextStatus,
    outcomeId: permitOutcome,
  };
  let nextPermit: GovernedActionPermitV1;
  try {
    nextPermit = validateGovernedActionPermitV1({
      ...permitBody,
      permitDigest: governedActionPermitDigestV1(permitBody),
    });
  } catch {
    return reject(
      current,
      "permit_transition_invalid",
      null,
      priorReservation,
      prior,
    );
  }
  const budgetStatus = budgetStatusForPermit(input.nextStatus);
  let nextReservation = priorReservation;
  if (budgetStatus !== null) {
    const reservationBody = {
      ...withoutReservationDigest(priorReservation),
      generation: priorReservation.generation + 1,
      status: budgetStatus,
      outcomeId: input.outcomeId,
    };
    try {
      nextReservation = validateBudgetReservationV1({
        ...reservationBody,
        reservationDigest: budgetReservationDigestV1(reservationBody),
      });
    } catch {
      return reject(
        current,
        "permit_transition_invalid",
        null,
        priorReservation,
        prior,
      );
    }
  }
  const actionPermits = [...current.actionPermits];
  actionPermits[permitIndex] = nextPermit;
  const budgetReservations = [...current.budgetReservations];
  budgetReservations[reservationIndex] = nextReservation;
  const next = buildState({
    ...withoutStateDigest(current),
    generation: current.generation + 1,
    highWaterLogicalMs: input.logicalTimeMs,
    actionPermits,
    budgetReservations,
  });
  return accept(next, null, nextReservation, nextPermit);
}

export function validateCollectiveExecutionStateV1(
  value: unknown,
): CollectiveExecutionStateV1 {
  assertCollectiveExactKeys(
    value,
    [
      "schemaVersion",
      "tenantId",
      "policyDomainId",
      "generation",
      "highWaterLogicalMs",
      "workContracts",
      "budgetReservations",
      "actionPermits",
      "limits",
      "stateDigest",
    ],
    "execution state",
  );
  if (value.schemaVersion !== 1)
    throw new CollectiveControlValidationError(
      "execution state schema is invalid",
    );
  assertCollectiveIdentifier(value.tenantId, "tenantId");
  assertCollectiveIdentifier(value.policyDomainId, "policyDomainId");
  assertCollectiveSafeInteger(value.generation, "generation", 1);
  assertCollectiveSafeInteger(value.highWaterLogicalMs, "highWaterLogicalMs");
  const tenantId = value.tenantId;
  const policyDomainId = value.policyDomainId;
  const generation = value.generation;
  const highWaterLogicalMs = value.highWaterLogicalMs;
  const limits = validateExecutionLimits(value.limits);
  const workContracts = validateArray(value.workContracts, "workContracts").map(
    validateWorkContractV1,
  );
  const budgetReservations = validateArray(
    value.budgetReservations,
    "budgetReservations",
  ).map(validateBudgetReservationV1);
  const actionPermits = validateArray(value.actionPermits, "actionPermits").map(
    validateGovernedActionPermitV1,
  );
  if (
    workContracts.length > limits.maximumWorkContracts ||
    budgetReservations.length > limits.maximumBudgetReservations ||
    actionPermits.length > limits.maximumActionPermits
  )
    throw new CollectiveControlValidationError(
      "execution state exceeds capacity",
    );
  validateSortedUnique(workContracts, "workContractId", "workContracts");
  validateSortedUnique(
    budgetReservations,
    "reservationId",
    "budgetReservations",
  );
  validateSortedUnique(actionPermits, "permitId", "actionPermits");
  for (const item of [
    ...workContracts,
    ...budgetReservations,
    ...actionPermits,
  ]) {
    if (
      !matchesScope(
        { tenantId, policyDomainId },
        item.tenantId,
        item.policyDomainId,
      )
    )
      throw new CollectiveControlValidationError(
        "execution state scope mismatch",
      );
  }
  for (const reservation of budgetReservations) {
    const permit = actionPermits.find(
      (candidate) => candidate.permitId === reservation.permitId,
    );
    if (
      !permit ||
      permit.budgetReservationId !== reservation.reservationId ||
      permit.workContractId !== reservation.workContractId ||
      permit.mandateDigest !== reservation.mandateDigest ||
      permit.budgetUnits !== reservation.units
    )
      throw new CollectiveControlValidationError(
        "execution state binding mismatch",
      );
  }
  for (const permit of actionPermits) {
    const reservation = budgetReservations.find(
      (candidate) => candidate.reservationId === permit.budgetReservationId,
    );
    if (!reservation)
      throw new CollectiveControlValidationError(
        "execution state binding mismatch",
      );
    const work = workContracts.find(
      (candidate) => candidate.workContractId === permit.workContractId,
    );
    if (
      !work ||
      permit.workContractDigest !== work.workContractDigest ||
      permit.assignmentAuthorityId !== work.assignment.assignmentAuthorityId ||
      permit.assignedPeerId !== work.assignment.assignedPeerId ||
      permit.assignedInstanceId !== work.assignment.assignedInstanceId ||
      permit.assignmentEpoch !== work.assignment.assignmentEpoch ||
      permit.authorityGeneration !== work.assignment.authorityGeneration ||
      permit.fencingToken !== work.assignment.fencingToken
    )
      throw new CollectiveControlValidationError(
        "execution state work binding mismatch",
      );
    if (
      (permit.status === "dispatched" && reservation.status !== "committed") ||
      ((permit.status === "failed" || permit.status === "expired") &&
        reservation.status !== "released") ||
      (permit.status === "indeterminate" &&
        reservation.status !== "indeterminate") ||
      (!TERMINAL_PERMIT.has(permit.status) && reservation.status !== "reserved")
    )
      throw new CollectiveControlValidationError(
        "execution state outcome mismatch",
      );
  }
  if (
    workContracts.some(
      (item) => item.updatedAtLogicalMs > highWaterLogicalMs,
    ) ||
    budgetReservations.some(
      (item) => item.reservedAtLogicalMs > highWaterLogicalMs,
    ) ||
    actionPermits.some((item) => item.issuedAtLogicalMs > highWaterLogicalMs)
  )
    throw new CollectiveControlValidationError(
      "execution record exceeds logical time",
    );
  assertCollectiveDigest(value.stateDigest, "stateDigest");
  const body = {
    schemaVersion: 1 as const,
    tenantId,
    policyDomainId,
    generation,
    highWaterLogicalMs,
    workContracts,
    budgetReservations,
    actionPermits,
    limits,
  };
  if (executionStateDigest(body) !== value.stateDigest)
    throw new CollectiveControlValidationError(
      "execution state digest is invalid",
    );
  return deepFreezeCollective({ ...body, stateDigest: value.stateDigest });
}

function workNarrowedByMandate(
  work: WorkContractV1,
  mandate: DelegationMandateV1,
  authorizedAt: string,
): boolean {
  const statement = mandate.statement;
  const selectedWork = statement.work.workItemIds;
  return (
    work.status === "active" &&
    work.generation === 1 &&
    work.createdAtLogicalMs === work.updatedAtLogicalMs &&
    work.assignment.leaseExpiresAtLogicalMs > work.createdAtLogicalMs &&
    work.tenantId === statement.tenantId &&
    work.policyDomainId === statement.policyDomainId &&
    work.mandate.mandateId === statement.mandateId &&
    work.mandate.mandateRevision === statement.revision &&
    work.mandate.mandateDigest === mandate.mandateDigest &&
    work.objective.meshId === statement.objective.meshId &&
    work.objective.objectiveId === statement.objective.objectiveId &&
    work.objective.objectiveDocumentId ===
      statement.objective.objectiveDocumentId &&
    work.objective.objectiveRevision >=
      statement.objective.minimumObjectiveRevision &&
    work.objective.objectiveRevision <=
      statement.objective.maximumObjectiveRevision &&
    work.assignment.workItemRevision <=
      statement.work.maximumWorkItemRevision &&
    (selectedWork.length === 0 ||
      selectedWork.includes(work.assignment.workItemId)) &&
    statement.work.permittedRoleKeys.includes(work.roleKey) &&
    work.requiredCapabilityKeys.every((key) =>
      statement.permittedCapabilityKeys.includes(key),
    ) &&
    statement.subjectPeerIds.includes(work.assignment.assignedPeerId) &&
    work.reservedBudgetUnits <= statement.budget.maximumWorkBudgetUnits &&
    work.maximumActionBudgetUnits <=
      statement.budget.maximumActionBudgetUnits &&
    Date.parse(authorizedAt) >= Date.parse(statement.validFrom) &&
    Date.parse(authorizedAt) < Date.parse(statement.validUntil) &&
    Date.parse(work.assignment.workDeadline) <= Date.parse(statement.validUntil)
  );
}

function permitBoundToUpstream(
  permit: GovernedActionPermitV1,
  reservation: BudgetReservationV1,
  work: WorkContractV1,
  mandate: DelegationMandateV1,
  authorizedAt: string,
  acceptedAtLogicalMs: number,
): boolean {
  const statement = mandate.statement;
  return (
    permit.status === "issued" &&
    permit.generation === 1 &&
    permit.outcomeId === null &&
    reservation.status === "reserved" &&
    reservation.generation === 1 &&
    reservation.outcomeId === null &&
    permit.issuedAtLogicalMs === acceptedAtLogicalMs &&
    reservation.reservedAtLogicalMs === acceptedAtLogicalMs &&
    permit.expiresAtLogicalMs === reservation.expiresAtLogicalMs &&
    permit.expiresAtLogicalMs <= work.assignment.leaseExpiresAtLogicalMs &&
    permit.expiresAtLogicalMs - permit.issuedAtLogicalMs <=
      statement.budget.reservationLifetimeMs &&
    permit.tenantId === reservation.tenantId &&
    permit.policyDomainId === reservation.policyDomainId &&
    permit.mandateId === statement.mandateId &&
    permit.mandateRevision === statement.revision &&
    permit.mandateDigest === mandate.mandateDigest &&
    reservation.mandateId === statement.mandateId &&
    reservation.mandateRevision === statement.revision &&
    reservation.mandateDigest === mandate.mandateDigest &&
    permit.workContractId === work.workContractId &&
    permit.workContractDigest === work.workContractDigest &&
    reservation.workContractId === work.workContractId &&
    permit.budgetReservationId === reservation.reservationId &&
    reservation.permitId === permit.permitId &&
    permit.idempotencyKey === reservation.idempotencyKey &&
    permit.budgetUnits === reservation.units &&
    permit.budgetUnits <= work.maximumActionBudgetUnits &&
    permit.budgetUnits <= statement.budget.maximumActionBudgetUnits &&
    permit.assignmentAuthorityId === work.assignment.assignmentAuthorityId &&
    permit.assignedPeerId === work.assignment.assignedPeerId &&
    permit.assignedInstanceId === work.assignment.assignedInstanceId &&
    permit.assignmentEpoch === work.assignment.assignmentEpoch &&
    permit.authorityGeneration === work.assignment.authorityGeneration &&
    permit.fencingToken === work.assignment.fencingToken &&
    statement.permittedActions.some(
      (action) =>
        action.namespace === permit.namespace &&
        action.toolId === permit.toolId &&
        action.operation === permit.operation,
    ) &&
    Date.parse(authorizedAt) >= Date.parse(statement.validFrom) &&
    Date.parse(authorizedAt) < Date.parse(statement.validUntil)
  );
}

function validWorkTransition(
  from: WorkContractStatusV1,
  to: WorkContractStatusV1,
): boolean {
  if (TERMINAL_WORK.has(from) || from === to) return false;
  if (from === "proposed")
    return ["active", "revoked", "expired", "released"].includes(to);
  if (from === "active")
    return [
      "completing",
      "completed",
      "revoked",
      "expired",
      "released",
    ].includes(to);
  return ["completed", "revoked", "expired", "released"].includes(to);
}

function validPermitTransition(
  from: GovernedActionPermitStatusV1,
  to: GovernedActionPermitStatusV1,
): boolean {
  if (TERMINAL_PERMIT.has(from) || from === to) return false;
  if (from === "issued") return to === "reserved" || to === "expired";
  if (from === "reserved")
    return ["dispatching", "failed", "indeterminate"].includes(to);
  return ["dispatched", "failed", "indeterminate"].includes(to);
}

function budgetStatusForPermit(
  status: GovernedActionPermitStatusV1,
): BudgetReservationStatusV1 | null {
  if (status === "dispatched") return "committed";
  if (status === "failed" || status === "expired") return "released";
  if (status === "indeterminate") return "indeterminate";
  return null;
}

function validateExecutionLimits(value: unknown): CollectiveExecutionLimitsV1 {
  assertCollectiveExactKeys(
    value,
    [
      "maximumWorkContracts",
      "maximumBudgetReservations",
      "maximumActionPermits",
    ],
    "execution limits",
  );
  for (const key of [
    "maximumWorkContracts",
    "maximumBudgetReservations",
    "maximumActionPermits",
  ] as const) {
    assertCollectiveSafeInteger(value[key], key, 1);
    if (value[key] > 1_000_000)
      throw new CollectiveControlValidationError(
        "execution limit is too large",
      );
  }
  const maximumWorkContracts = value.maximumWorkContracts as number;
  const maximumBudgetReservations = value.maximumBudgetReservations as number;
  const maximumActionPermits = value.maximumActionPermits as number;
  return Object.freeze({
    maximumWorkContracts,
    maximumBudgetReservations,
    maximumActionPermits,
  });
}

function buildState(
  body: Omit<CollectiveExecutionStateV1, "stateDigest">,
): CollectiveExecutionStateV1 {
  return validateCollectiveExecutionStateV1({
    ...body,
    stateDigest: executionStateDigest(body),
  });
}

function executionStateDigest(
  body: Omit<CollectiveExecutionStateV1, "stateDigest">,
): CollectiveDigestV1 {
  return digestCollectiveJsonV1("state", body as unknown as JsonValue);
}

function withoutStateDigest(
  value: CollectiveExecutionStateV1,
): Omit<CollectiveExecutionStateV1, "stateDigest"> {
  const { stateDigest: _digest, ...body } = value;
  return body;
}

function withoutWorkDigest(
  value: WorkContractV1,
): Omit<WorkContractV1, "workContractDigest"> {
  const { workContractDigest: _digest, ...body } = value;
  return body;
}

function withoutPermitDigest(
  value: GovernedActionPermitV1,
): Omit<GovernedActionPermitV1, "permitDigest"> {
  const { permitDigest: _digest, ...body } = value;
  return body;
}

function withoutReservationDigest(
  value: BudgetReservationV1,
): Omit<BudgetReservationV1, "reservationDigest"> {
  const { reservationDigest: _digest, ...body } = value;
  return body;
}

function validateArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype)
    throw new CollectiveControlValidationError(`${label} must be an array`);
  return value;
}

function validateSortedUnique<T extends Record<K, string>, K extends keyof T>(
  items: readonly T[],
  key: K,
  label: string,
): void {
  for (let index = 1; index < items.length; index += 1)
    if (items[index - 1]![key] >= items[index]![key])
      throw new CollectiveControlValidationError(
        `${label} must be sorted and unique`,
      );
}

function sortById<T, K extends keyof T>(
  items: readonly T[],
  key: K,
): readonly T[] {
  return Object.freeze(
    [...items].sort((left, right) => {
      const a = String(left[key]);
      const b = String(right[key]);
      return a < b ? -1 : a > b ? 1 : 0;
    }),
  );
}

function sumSafe(values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    total += value;
    if (!Number.isSafeInteger(total)) return Number.MAX_SAFE_INTEGER;
  }
  return total;
}

function matchesScope(
  state: { readonly tenantId: string; readonly policyDomainId: string },
  tenantId: string,
  policyDomainId: string,
): boolean {
  return state.tenantId === tenantId && state.policyDomainId === policyDomainId;
}

function accept(
  state: CollectiveExecutionStateV1,
  workContract: WorkContractV1 | null,
  budgetReservation: BudgetReservationV1 | null,
  actionPermit: GovernedActionPermitV1 | null,
): CollectiveExecutionDecisionV1 {
  return Object.freeze({
    schemaVersion: 1,
    accepted: true,
    code: "accepted",
    state,
    workContract,
    budgetReservation,
    actionPermit,
  });
}

function idempotent(
  state: CollectiveExecutionStateV1,
  code: "work_idempotent" | "permit_idempotent",
  workContract: WorkContractV1 | null,
  budgetReservation: BudgetReservationV1 | null,
  actionPermit: GovernedActionPermitV1 | null,
): CollectiveExecutionDecisionV1 {
  return Object.freeze({
    schemaVersion: 1,
    accepted: true,
    code,
    state,
    workContract,
    budgetReservation,
    actionPermit,
  });
}

function reject(
  state: CollectiveExecutionStateV1,
  code: CollectiveExecutionRejectionCodeV1,
  workContract: WorkContractV1 | null = null,
  budgetReservation: BudgetReservationV1 | null = null,
  actionPermit: GovernedActionPermitV1 | null = null,
): CollectiveExecutionDecisionV1 {
  return Object.freeze({
    schemaVersion: 1,
    accepted: false,
    code,
    state,
    workContract,
    budgetReservation,
    actionPermit,
  });
}
