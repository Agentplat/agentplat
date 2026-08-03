import type { JsonValue } from "@agentplat/core";

import {
  deepFreezePlanning,
  digestPlanningJsonV1,
  type PlanningJsonLimitsV1,
} from "./canonical.js";
import type { PlanningDigestV1 } from "./contracts.js";
import {
  createCollectiveEvaluationCampaignManifestV1,
  type CollectiveEvaluationCampaignManifestV1,
  type CollectiveEvaluationCampaignRegistrationV1,
  type CollectiveEvaluationCampaignRunnerV1,
  validateCollectiveEvaluationCampaignRegistrationV1,
} from "./evaluation-campaign.js";
import {
  assertPlanningDigest,
  assertPlanningIdentifier,
  assertPlanningSafeInteger,
  assertPlanningToken,
} from "./validation.js";

export const COLLECTIVE_EVALUATION_EXECUTION_SCHEMA_VERSION_V1 = 1 as const;

// Execution state contains one resumable slot ledger per registered cell. The
// closed normative profile has 240 cells × 4 slots and legitimately exceeds
// the generic 256KiB planning document default. This limit is local to the
// sealed execution-state digest; all other planning values retain defaults.
const executionStateJsonLimits: PlanningJsonLimitsV1 = Object.freeze({
  maximumBytes: 4 * 1024 * 1024,
  maximumDepth: 32,
  maximumNodes: 250_000,
  maximumKeysPerObject: 256,
  maximumItemsPerArray: 4_096,
});

export type CollectiveEvaluationExecutionStatusV1 =
  "active" | "completed" | "failed" | "cancelled";
export type CollectiveEvaluationCellExecutionStatusV1 =
  "pending" | "leased" | "running" | "succeeded" | "failed" | "cancelled";
export type CollectiveEvaluationRunStatusV1 =
  "pending" | "running" | "succeeded" | "failed" | "cancelled";
export type CollectiveEvaluationRunAttemptKindV1 = "first" | "replay";

export interface CollectiveEvaluationCellLeaseV1 {
  readonly workerId: string;
  readonly leaseToken: string;
  readonly generation: number;
  readonly expiresAtMs: number;
}

export interface CollectiveEvaluationRunResultV1 {
  readonly resultDigest: PlanningDigestV1;
  readonly traceDigest: PlanningDigestV1;
  readonly ledgerDigest: PlanningDigestV1;
  readonly evidenceDigest: PlanningDigestV1;
  readonly fairnessDigest: PlanningDigestV1;
}

export interface CollectiveEvaluationRunSlotV1 {
  readonly runner: CollectiveEvaluationCampaignRunnerV1;
  readonly attempt: CollectiveEvaluationRunAttemptKindV1;
  readonly runKey: PlanningDigestV1;
  readonly status: CollectiveEvaluationRunStatusV1;
  readonly dispatchAttempts: number;
  readonly result: CollectiveEvaluationRunResultV1 | null;
  readonly reasonCode: string | null;
  readonly settlementFence: CollectiveEvaluationExecutionFenceV1 | null;
  readonly settledFromRevision: number | null;
}

export interface CollectiveEvaluationCellExecutionV1 {
  readonly cellId: string;
  readonly status: CollectiveEvaluationCellExecutionStatusV1;
  readonly revision: number;
  /** Monotonic even while no lease is held, so a released fence cannot revive. */
  readonly leaseGeneration: number;
  readonly lease: CollectiveEvaluationCellLeaseV1 | null;
  readonly reasonCode: string | null;
  readonly runs: readonly CollectiveEvaluationRunSlotV1[];
}

export interface CollectiveEvaluationCampaignExecutionV1 {
  readonly schemaVersion: 1;
  readonly executionId: string;
  readonly registrationDigest: PlanningDigestV1;
  readonly status: CollectiveEvaluationExecutionStatusV1;
  readonly revision: number;
  readonly cells: readonly CollectiveEvaluationCellExecutionV1[];
  readonly manifest: CollectiveEvaluationCampaignManifestV1 | null;
  readonly executionDigest: PlanningDigestV1;
}

export interface CollectiveEvaluationExecutionLeaseInputV1 {
  readonly workerId: string;
  readonly leaseToken: string;
  readonly expiresAtMs: number;
}

export interface CollectiveEvaluationExecutionFenceV1 extends CollectiveEvaluationExecutionLeaseInputV1 {
  readonly generation: number;
}

export interface CollectiveEvaluationExecutionSettlementV1 {
  readonly status: "committed" | "duplicate";
  readonly state: CollectiveEvaluationCampaignExecutionV1;
}

/** Verifies the canonical digest before a persisted execution state is trusted. */
export function validateCollectiveEvaluationCampaignExecutionV1(
  state: CollectiveEvaluationCampaignExecutionV1,
): CollectiveEvaluationCampaignExecutionV1 {
  return assertState(state);
}

/** Creates the resumable state only after accepting the frozen campaign registration. */
export function createCollectiveEvaluationCampaignExecutionV1(input: {
  readonly schemaVersion: 1;
  readonly executionId: string;
  readonly registration: CollectiveEvaluationCampaignRegistrationV1;
}): CollectiveEvaluationCampaignExecutionV1 {
  exact(
    input,
    ["executionId", "registration", "schemaVersion"],
    "execution input",
  );
  if (input.schemaVersion !== 1)
    throw new TypeError("execution schema is invalid");
  assertPlanningIdentifier(input.executionId, "executionId");
  const registration = validateCollectiveEvaluationCampaignRegistrationV1(
    input.registration,
  );
  return seal({
    schemaVersion: 1,
    executionId: input.executionId,
    registrationDigest: registration.registrationDigest,
    status: "active",
    revision: 0,
    cells: registration.cells.map((cell) =>
      cellState(input.executionId, registration, cell.cellId),
    ),
    manifest: null,
  });
}

/** Deterministic idempotency boundary for one logical runner attempt. */
export function collectiveEvaluationRunKeyV1(input: {
  readonly executionId: string;
  readonly registrationDigest: PlanningDigestV1;
  readonly cellId: string;
  readonly runner: CollectiveEvaluationCampaignRunnerV1;
  readonly attempt: CollectiveEvaluationRunAttemptKindV1;
}): PlanningDigestV1 {
  exact(
    input,
    ["attempt", "cellId", "executionId", "registrationDigest", "runner"],
    "run key input",
  );
  assertPlanningIdentifier(input.executionId, "executionId");
  assertPlanningIdentifier(input.cellId, "cellId");
  assertPlanningDigest(input.registrationDigest, "registrationDigest");
  runner(input.runner);
  attempt(input.attempt);
  return digest({
    schemaVersion: 1,
    kind: "evaluation-execution-run-key",
    ...input,
  });
}

export function claimCollectiveEvaluationCellV1(
  state: CollectiveEvaluationCampaignExecutionV1,
  input: {
    readonly executionId: string;
    readonly expectedRevision: number;
    readonly cellId: string;
    readonly nowMs: number;
    readonly lease: CollectiveEvaluationExecutionLeaseInputV1;
  },
): CollectiveEvaluationCampaignExecutionV1 {
  const current = assertState(state);
  assertCommand(input, [
    "cellId",
    "executionId",
    "expectedRevision",
    "lease",
    "nowMs",
  ]);
  commandTarget(current, input);
  assertPlanningIdentifier(input.cellId, "cellId");
  time(input.nowMs, "nowMs");
  leaseInput(input.lease, input.nowMs);
  const cell = findCell(current, input.cellId);
  const reclaimingExpiredLease =
    cell.status === "leased" &&
    cell.lease !== null &&
    cell.lease.expiresAtMs <= input.nowMs;
  if (
    cell.status === "running" &&
    cell.lease !== null &&
    cell.lease.expiresAtMs <= input.nowMs
  ) {
    // A running worker may have emitted an external effect. Do not silently retry it.
    throw new TypeError("expired running cell requires reconciliation");
  }
  if (
    (cell.status !== "pending" || cell.lease !== null) &&
    !reclaimingExpiredLease
  )
    throw new TypeError("cell is not claimable");
  const generation = cell.leaseGeneration + 1;
  return mutate(current, input.expectedRevision, input.cellId, {
    ...cell,
    status: "leased",
    revision: cell.revision + 1,
    leaseGeneration: generation,
    lease: freezeLease({ ...input.lease, generation }),
  });
}

export function renewCollectiveEvaluationCellLeaseV1(
  state: CollectiveEvaluationCampaignExecutionV1,
  input: {
    readonly executionId: string;
    readonly expectedRevision: number;
    readonly cellId: string;
    readonly nowMs: number;
    readonly fence: CollectiveEvaluationExecutionFenceV1;
    readonly expiresAtMs: number;
  },
): CollectiveEvaluationCampaignExecutionV1 {
  const current = assertState(state);
  assertCommand(input, [
    "cellId",
    "executionId",
    "expectedRevision",
    "expiresAtMs",
    "fence",
    "nowMs",
  ]);
  commandTarget(current, input);
  time(input.nowMs, "nowMs");
  time(input.expiresAtMs, "expiresAtMs");
  const cell = fencedCell(current, input.cellId, input.fence, input.nowMs);
  if (input.expiresAtMs <= cell.lease!.expiresAtMs)
    throw new TypeError("lease renewal must extend expiry");
  return mutate(current, input.expectedRevision, input.cellId, {
    ...cell,
    revision: cell.revision + 1,
    lease: freezeLease({ ...cell.lease!, expiresAtMs: input.expiresAtMs }),
  });
}

export function startCollectiveEvaluationRunV1(
  state: CollectiveEvaluationCampaignExecutionV1,
  input: {
    readonly executionId: string;
    readonly expectedRevision: number;
    readonly cellId: string;
    readonly runner: CollectiveEvaluationCampaignRunnerV1;
    readonly attempt: CollectiveEvaluationRunAttemptKindV1;
    readonly nowMs: number;
    readonly fence: CollectiveEvaluationExecutionFenceV1;
  },
): CollectiveEvaluationCampaignExecutionV1 {
  const current = assertState(state);
  assertCommand(input, [
    "attempt",
    "cellId",
    "executionId",
    "expectedRevision",
    "fence",
    "nowMs",
    "runner",
  ]);
  commandTarget(current, input);
  runner(input.runner);
  attempt(input.attempt);
  time(input.nowMs, "nowMs");
  const cell = fencedCell(current, input.cellId, input.fence, input.nowMs);
  const slot = findRun(cell, input.runner, input.attempt);
  if (slot.status === "running") return current;
  if (slot.status !== "pending") throw new TypeError("run is not startable");
  return mutate(current, input.expectedRevision, input.cellId, {
    ...cell,
    status: "running",
    revision: cell.revision + 1,
    runs: replaceRun(cell.runs, {
      ...slot,
      status: "running",
      dispatchAttempts: slot.dispatchAttempts + 1,
    }),
  });
}

export function settleCollectiveEvaluationRunV1(
  state: CollectiveEvaluationCampaignExecutionV1,
  input: {
    readonly executionId: string;
    readonly expectedRevision: number;
    readonly cellId: string;
    readonly runner: CollectiveEvaluationCampaignRunnerV1;
    readonly attempt: CollectiveEvaluationRunAttemptKindV1;
    readonly nowMs: number;
    readonly fence: CollectiveEvaluationExecutionFenceV1;
    readonly result: CollectiveEvaluationRunResultV1 | null;
    readonly reasonCode: string | null;
  },
): CollectiveEvaluationExecutionSettlementV1 {
  const current = assertState(state);
  assertCommand(input, [
    "attempt",
    "cellId",
    "executionId",
    "expectedRevision",
    "fence",
    "nowMs",
    "reasonCode",
    "result",
    "runner",
  ]);
  if (input.executionId !== current.executionId)
    throw new TypeError("executionId does not match state");
  runner(input.runner);
  attempt(input.attempt);
  time(input.nowMs, "nowMs");
  fenceInput(input.fence);
  const existingCell = findCell(current, input.cellId);
  const existingSlot = findRun(existingCell, input.runner, input.attempt);
  const result = input.result === null ? null : runResult(input.result);
  if ((result === null) === (input.reasonCode === null))
    throw new TypeError("settlement requires exactly one result or reasonCode");
  if (input.reasonCode !== null)
    assertPlanningToken(input.reasonCode, "reasonCode");
  if (existingSlot.status === "succeeded" || existingSlot.status === "failed") {
    if (input.expectedRevision !== existingSlot.settledFromRevision)
      throw new TypeError("terminal settlement revision is stale");
    if (
      existingSlot.settlementFence === null ||
      !sameFence(existingSlot.settlementFence, input.fence)
    )
      throw new TypeError("terminal settlement fence is stale");
    if (sameSlotSettlement(existingSlot, result, input.reasonCode))
      return Object.freeze({ status: "duplicate", state: current });
    throw new TypeError("settlement conflicts with terminal run");
  }
  commandTarget(current, input);
  const cell = fencedCell(current, input.cellId, input.fence, input.nowMs);
  const slot = findRun(cell, input.runner, input.attempt);
  if (slot.status !== "running") throw new TypeError("run is not settleable");
  const terminalRun: CollectiveEvaluationRunSlotV1 = {
    ...slot,
    status: result === null ? "failed" : "succeeded",
    result,
    reasonCode: input.reasonCode,
    settlementFence: freezeLease(input.fence),
    settledFromRevision: input.expectedRevision,
  };
  const runs = replaceRun(cell.runs, terminalRun);
  const allTerminal = runs.every(
    (entry) =>
      entry.status === "succeeded" ||
      entry.status === "failed" ||
      entry.status === "cancelled",
  );
  const failed = runs.some(
    (entry) => entry.status === "failed" || entry.status === "cancelled",
  );
  const next: CollectiveEvaluationCellExecutionV1 = allTerminal
    ? {
        ...cell,
        status: failed ? "failed" : "succeeded",
        revision: cell.revision + 1,
        lease: null,
        reasonCode: failed ? (input.reasonCode ?? cell.reasonCode) : null,
        runs,
      }
    : {
        ...cell,
        status: "leased",
        revision: cell.revision + 1,
        reasonCode: result === null ? input.reasonCode : cell.reasonCode,
        runs,
      };
  return Object.freeze({
    status: "committed",
    state: mutate(current, input.expectedRevision, input.cellId, next),
  });
}

/** Resolves an expired running slot without ever redispatching it. */
export function reconcileCollectiveEvaluationRunV1(
  state: CollectiveEvaluationCampaignExecutionV1,
  input: {
    readonly executionId: string;
    readonly expectedRevision: number;
    readonly cellId: string;
    readonly runner: CollectiveEvaluationCampaignRunnerV1;
    readonly attempt: CollectiveEvaluationRunAttemptKindV1;
    readonly runKey: PlanningDigestV1;
    readonly nowMs: number;
    readonly result: CollectiveEvaluationRunResultV1 | null;
    readonly reasonCode: string | null;
  },
): CollectiveEvaluationExecutionSettlementV1 {
  const current = assertState(state);
  assertCommand(input, [
    "attempt",
    "cellId",
    "executionId",
    "expectedRevision",
    "nowMs",
    "reasonCode",
    "result",
    "runKey",
    "runner",
  ]);
  if (input.executionId !== current.executionId)
    throw new TypeError("executionId does not match state");
  runner(input.runner);
  attempt(input.attempt);
  time(input.nowMs, "nowMs");
  assertPlanningDigest(input.runKey, "runKey");
  const cell = findCell(current, input.cellId);
  const slot = findRun(cell, input.runner, input.attempt);
  if (slot.runKey !== input.runKey)
    throw new TypeError("reconciliation runKey is stale");
  const result = input.result === null ? null : runResult(input.result);
  if ((result === null) === (input.reasonCode === null))
    throw new TypeError(
      "reconciliation requires exactly one result or reasonCode",
    );
  if (input.reasonCode !== null)
    assertPlanningToken(input.reasonCode, "reasonCode");
  if (slot.status === "succeeded" || slot.status === "failed") {
    if (input.expectedRevision !== slot.settledFromRevision)
      throw new TypeError("terminal reconciliation revision is stale");
    if (sameSlotSettlement(slot, result, input.reasonCode))
      return Object.freeze({ status: "duplicate", state: current });
    throw new TypeError("reconciliation conflicts with terminal run");
  }
  commandTarget(current, input);
  if (
    cell.status !== "running" ||
    cell.lease === null ||
    cell.lease.expiresAtMs > input.nowMs ||
    slot.status !== "running"
  )
    throw new TypeError("run is not reconcilable");
  const terminalRun: CollectiveEvaluationRunSlotV1 = {
    ...slot,
    status: result === null ? "failed" : "succeeded",
    result,
    reasonCode: input.reasonCode,
    settlementFence: freezeLease(cell.lease),
    settledFromRevision: input.expectedRevision,
  };
  const runs = replaceRun(cell.runs, terminalRun);
  const allTerminal = runs.every(
    (entry) =>
      entry.status === "succeeded" ||
      entry.status === "failed" ||
      entry.status === "cancelled",
  );
  const failed = runs.some(
    (entry) => entry.status === "failed" || entry.status === "cancelled",
  );
  const next: CollectiveEvaluationCellExecutionV1 = allTerminal
    ? {
        ...cell,
        status: failed ? "failed" : "succeeded",
        revision: cell.revision + 1,
        lease: null,
        reasonCode: failed ? (input.reasonCode ?? cell.reasonCode) : null,
        runs,
      }
    : {
        ...cell,
        status: "leased",
        revision: cell.revision + 1,
        reasonCode: result === null ? input.reasonCode : cell.reasonCode,
        runs,
      };
  return Object.freeze({
    status: "committed",
    state: mutate(current, input.expectedRevision, input.cellId, next),
  });
}

export function releaseCollectiveEvaluationCellV1(
  state: CollectiveEvaluationCampaignExecutionV1,
  input: {
    readonly executionId: string;
    readonly expectedRevision: number;
    readonly cellId: string;
    readonly nowMs: number;
    readonly fence: CollectiveEvaluationExecutionFenceV1;
  },
): CollectiveEvaluationCampaignExecutionV1 {
  const current = assertState(state);
  assertCommand(input, [
    "cellId",
    "executionId",
    "expectedRevision",
    "fence",
    "nowMs",
  ]);
  commandTarget(current, input);
  time(input.nowMs, "nowMs");
  const cell = fencedCell(current, input.cellId, input.fence, input.nowMs);
  if (
    cell.status !== "leased" ||
    cell.runs.some((slot) => slot.status === "running")
  )
    throw new TypeError("running cell requires settlement or reconciliation");
  return mutate(current, input.expectedRevision, input.cellId, {
    ...cell,
    status: "pending",
    revision: cell.revision + 1,
    lease: null,
    runs: cell.runs,
  });
}

export function cancelCollectiveEvaluationCampaignExecutionV1(
  state: CollectiveEvaluationCampaignExecutionV1,
  input: {
    readonly executionId: string;
    readonly expectedRevision: number;
    readonly reasonCode: string;
  },
): CollectiveEvaluationCampaignExecutionV1 {
  const current = assertState(state);
  assertCommand(input, ["executionId", "expectedRevision", "reasonCode"]);
  commandTarget(current, input);
  assertPlanningToken(input.reasonCode, "reasonCode");
  if (current.status !== "active") throw new TypeError("execution is terminal");
  return sealBody({
    ...body(current),
    status: "cancelled",
    revision: current.revision + 1,
    cells: current.cells.map((cell) =>
      cell.status === "succeeded" || cell.status === "failed"
        ? cell
        : {
            ...cell,
            status: "cancelled",
            revision: cell.revision + 1,
            lease: null,
            reasonCode: input.reasonCode,
            runs: cancelPending(cell.runs),
          },
    ),
    manifest: null,
  });
}

export function finalizeCollectiveEvaluationCampaignExecutionV1(
  state: CollectiveEvaluationCampaignExecutionV1,
  registrationInput: CollectiveEvaluationCampaignRegistrationV1,
  expectedRevision: number,
): CollectiveEvaluationCampaignExecutionV1 {
  const current = assertState(state);
  const registration =
    validateCollectiveEvaluationCampaignRegistrationV1(registrationInput);
  if (registration.registrationDigest !== current.registrationDigest)
    throw new TypeError("registration does not bind execution");
  if (current.revision !== expectedRevision)
    throw new TypeError("execution revision conflict");
  if (current.status !== "active" && current.status !== "cancelled")
    throw new TypeError("execution is already finalized");
  if (!current.cells.every((cell) => terminalCell(cell.status)))
    throw new TypeError("execution has nonterminal cells");
  const manifest = materializeCollectiveEvaluationCampaignManifestV1(
    registration,
    current,
  );
  const status = current.cells.every((cell) => cell.status === "succeeded")
    ? "completed"
    : current.status === "cancelled"
      ? "cancelled"
      : "failed";
  return sealBody({
    ...body(current),
    status,
    revision: current.revision + 1,
    manifest,
  });
}

export function materializeCollectiveEvaluationCampaignManifestV1(
  registrationInput: CollectiveEvaluationCampaignRegistrationV1,
  state: CollectiveEvaluationCampaignExecutionV1,
): CollectiveEvaluationCampaignManifestV1 {
  const registration =
    validateCollectiveEvaluationCampaignRegistrationV1(registrationInput);
  const current = assertState(state);
  if (registration.registrationDigest !== current.registrationDigest)
    throw new TypeError("registration does not bind execution");
  if (!current.cells.every((cell) => terminalCell(cell.status)))
    throw new TypeError("execution has nonterminal cells");
  return createCollectiveEvaluationCampaignManifestV1(registration, {
    schemaVersion: 1,
    registrationDigest: registration.registrationDigest,
    entries: registration.cells.map((registered) =>
      manifestEntry(findCell(current, registered.cellId)),
    ),
  });
}

function manifestEntry(cell: CollectiveEvaluationCellExecutionV1) {
  if (cell.status !== "succeeded")
    return {
      schemaVersion: 1 as const,
      cellId: cell.cellId,
      status: "failure" as const,
      reasonCode: cell.reasonCode ?? "execution_cancelled",
      adaptiveResultDigest: null,
      centralizedResultDigest: null,
      adaptiveTraceDigest: null,
      centralizedTraceDigest: null,
      adaptiveLedgerDigest: null,
      centralizedLedgerDigest: null,
      fairnessDigest: null,
      adaptiveCampaignEvidenceDigest: null,
      centralizedCampaignEvidenceDigest: null,
    };
  const adaptive = findRun(cell, "adaptive_collective", "first").result!;
  const centralized = findRun(cell, "centralized_planner", "first").result!;
  if (adaptive.fairnessDigest !== centralized.fairnessDigest)
    throw new TypeError("successful cell fairness digest conflicts");
  return {
    schemaVersion: 1 as const,
    cellId: cell.cellId,
    status: "success" as const,
    reasonCode: null,
    adaptiveResultDigest: adaptive.resultDigest,
    centralizedResultDigest: centralized.resultDigest,
    adaptiveTraceDigest: adaptive.traceDigest,
    centralizedTraceDigest: centralized.traceDigest,
    adaptiveLedgerDigest: adaptive.ledgerDigest,
    centralizedLedgerDigest: centralized.ledgerDigest,
    fairnessDigest: adaptive.fairnessDigest,
    adaptiveCampaignEvidenceDigest: adaptive.evidenceDigest,
    centralizedCampaignEvidenceDigest: centralized.evidenceDigest,
  };
}

function cellState(
  executionId: string,
  registration: CollectiveEvaluationCampaignRegistrationV1,
  cellId: string,
): CollectiveEvaluationCellExecutionV1 {
  const runs = (
    ["adaptive_collective", "centralized_planner"] as const
  ).flatMap((runnerValue) =>
    (["first", "replay"] as const).map((attemptValue) =>
      deepFreezePlanning({
        runner: runnerValue,
        attempt: attemptValue,
        runKey: collectiveEvaluationRunKeyV1({
          executionId,
          registrationDigest: registration.registrationDigest,
          cellId,
          runner: runnerValue,
          attempt: attemptValue,
        }),
        status: "pending" as const,
        dispatchAttempts: 0,
        result: null,
        reasonCode: null,
        settlementFence: null,
        settledFromRevision: null,
      }),
    ),
  );
  return deepFreezePlanning({
    cellId,
    status: "pending" as const,
    revision: 0,
    leaseGeneration: 0,
    lease: null,
    reasonCode: null,
    runs,
  });
}

function mutate(
  current: CollectiveEvaluationCampaignExecutionV1,
  expectedRevision: number,
  cellId: string,
  cell: CollectiveEvaluationCellExecutionV1,
): CollectiveEvaluationCampaignExecutionV1 {
  if (current.revision !== expectedRevision)
    throw new TypeError("execution revision conflict");
  if (current.status !== "active") throw new TypeError("execution is terminal");
  return sealBody({
    ...body(current),
    revision: current.revision + 1,
    cells: current.cells.map((entry) =>
      entry.cellId === cellId ? cell : entry,
    ),
    manifest: null,
  });
}
function body(state: CollectiveEvaluationCampaignExecutionV1) {
  const { executionDigest: _digest, ...result } = state;
  return result;
}
function seal(
  value: Omit<CollectiveEvaluationCampaignExecutionV1, "executionDigest">,
): CollectiveEvaluationCampaignExecutionV1 {
  return sealBody(value);
}
function sealBody(
  value: Omit<CollectiveEvaluationCampaignExecutionV1, "executionDigest">,
): CollectiveEvaluationCampaignExecutionV1 {
  return deepFreezePlanning({ ...value, executionDigest: digest(value) });
}
function digest(value: unknown): PlanningDigestV1 {
  return digestPlanningJsonV1(
    "evaluation-campaign-artifact-v1",
    deepFreezePlanning(value) as unknown as JsonValue,
    executionStateJsonLimits,
  );
}

function assertState(
  value: CollectiveEvaluationCampaignExecutionV1,
): CollectiveEvaluationCampaignExecutionV1 {
  exact(
    value,
    [
      "cells",
      "executionDigest",
      "executionId",
      "manifest",
      "registrationDigest",
      "revision",
      "schemaVersion",
      "status",
    ],
    "execution state",
  );
  if (value.schemaVersion !== 1)
    throw new TypeError("execution state is invalid");
  assertPlanningIdentifier(value.executionId, "executionId");
  assertPlanningDigest(value.registrationDigest, "registrationDigest");
  assertPlanningSafeInteger(value.revision, "revision", 0);
  assertPlanningDigest(value.executionDigest, "executionDigest");
  executionStatus(value.status);
  denseArray(value.cells, "execution cells", 240);
  if (value.cells.length === 0)
    throw new TypeError("execution cells are empty");
  const cellIds = new Set<string>();
  for (const cell of value.cells) {
    validateCellState(cell);
    if (cellIds.has(cell.cellId))
      throw new TypeError("execution cellId is duplicated");
    cellIds.add(cell.cellId);
  }
  const allTerminal = value.cells.every((cell) => terminalCell(cell.status));
  if (
    (value.status === "active" && value.manifest !== null) ||
    (value.status !== "active" && !allTerminal) ||
    (value.status === "completed" &&
      (value.manifest === null ||
        !value.cells.every((cell) => cell.status === "succeeded"))) ||
    (value.status === "failed" &&
      (value.manifest === null ||
        !value.cells.some((cell) => cell.status === "failed")))
  )
    throw new TypeError("execution terminal state is inconsistent");
  if (
    value.manifest !== null &&
    (typeof value.manifest !== "object" || Array.isArray(value.manifest))
  )
    throw new TypeError("execution manifest is invalid");
  if (digest(body(value)) !== value.executionDigest)
    throw new TypeError("execution digest is invalid");
  return value;
}

function validateCellState(cell: CollectiveEvaluationCellExecutionV1): void {
  exact(
    cell,
    [
      "cellId",
      "lease",
      "leaseGeneration",
      "reasonCode",
      "revision",
      "runs",
      "status",
    ],
    "execution cell",
  );
  assertPlanningIdentifier(cell.cellId, "cellId");
  assertPlanningSafeInteger(cell.revision, "cell revision", 0);
  assertPlanningSafeInteger(cell.leaseGeneration, "leaseGeneration", 0);
  cellStatus(cell.status);
  if (cell.reasonCode !== null)
    assertPlanningToken(cell.reasonCode, "cell reasonCode");
  if (cell.lease !== null) {
    fenceInput(cell.lease);
    if (cell.lease.generation !== cell.leaseGeneration)
      throw new TypeError("cell lease generation is inconsistent");
  }
  denseArray(cell.runs, "execution runs", 4);
  if (cell.runs.length !== 4)
    throw new TypeError("execution cell must retain four runs");
  const expected = [
    ["adaptive_collective", "first"],
    ["adaptive_collective", "replay"],
    ["centralized_planner", "first"],
    ["centralized_planner", "replay"],
  ] as const;
  cell.runs.forEach((slot, index) => {
    validateRunState(slot);
    if (
      slot.runner !== expected[index]?.[0] ||
      slot.attempt !== expected[index]?.[1]
    )
      throw new TypeError("execution run schedule is invalid");
  });
  const hasRunning = cell.runs.some((slot) => slot.status === "running");
  const allTerminal = cell.runs.every(
    (slot) =>
      slot.status === "succeeded" ||
      slot.status === "failed" ||
      slot.status === "cancelled",
  );
  if (
    (cell.status === "pending" &&
      (cell.lease !== null || hasRunning || allTerminal)) ||
    (cell.status === "leased" &&
      (cell.lease === null || hasRunning || allTerminal)) ||
    (cell.status === "running" &&
      (cell.lease === null || !hasRunning || allTerminal)) ||
    (terminalCell(cell.status) && (cell.lease !== null || !allTerminal)) ||
    (cell.status === "succeeded" &&
      (!cell.runs.every((slot) => slot.status === "succeeded") ||
        cell.reasonCode !== null)) ||
    (cell.status === "failed" &&
      (!cell.runs.some(
        (slot) => slot.status === "failed" || slot.status === "cancelled",
      ) ||
        cell.reasonCode === null)) ||
    (cell.status === "cancelled" &&
      (!cell.runs.some((slot) => slot.status === "cancelled") ||
        cell.reasonCode === null))
  )
    throw new TypeError("execution cell state is inconsistent");
}

function validateRunState(slot: CollectiveEvaluationRunSlotV1): void {
  exact(
    slot,
    [
      "attempt",
      "dispatchAttempts",
      "reasonCode",
      "result",
      "runKey",
      "runner",
      "settledFromRevision",
      "settlementFence",
      "status",
    ],
    "execution run",
  );
  runner(slot.runner);
  attempt(slot.attempt);
  assertPlanningDigest(slot.runKey, "runKey");
  assertPlanningSafeInteger(slot.dispatchAttempts, "dispatchAttempts", 0);
  runStatus(slot.status);
  if (slot.reasonCode !== null)
    assertPlanningToken(slot.reasonCode, "run reasonCode");
  if (slot.result !== null) runResult(slot.result);
  if (slot.settlementFence !== null) fenceInput(slot.settlementFence);
  if (slot.settledFromRevision !== null)
    assertPlanningSafeInteger(
      slot.settledFromRevision,
      "settledFromRevision",
      0,
    );
  const hasSettlement =
    slot.settlementFence !== null && slot.settledFromRevision !== null;
  if (
    (slot.status === "pending" &&
      (slot.dispatchAttempts !== 0 ||
        slot.result !== null ||
        slot.reasonCode !== null ||
        hasSettlement)) ||
    (slot.status === "running" &&
      (slot.dispatchAttempts < 1 ||
        slot.result !== null ||
        slot.reasonCode !== null ||
        hasSettlement)) ||
    (slot.status === "succeeded" &&
      (slot.dispatchAttempts < 1 ||
        slot.result === null ||
        slot.reasonCode !== null ||
        !hasSettlement)) ||
    (slot.status === "failed" &&
      (slot.dispatchAttempts < 1 ||
        slot.result !== null ||
        slot.reasonCode === null ||
        !hasSettlement)) ||
    (slot.status === "cancelled" &&
      (slot.result !== null || slot.reasonCode !== null || hasSettlement)) ||
    (slot.settlementFence === null) !== (slot.settledFromRevision === null)
  )
    throw new TypeError("execution run state is inconsistent");
}

function denseArray(
  value: unknown,
  label: string,
  maximumLength: number,
): asserts value is readonly unknown[] {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length > maximumLength
  )
    throw new TypeError(`${label} is invalid`);
  const names = Object.getOwnPropertyNames(value);
  if (names.length !== value.length + 1 || !names.includes("length"))
    throw new TypeError(`${label} is sparse or extended`);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor))
      throw new TypeError(`${label} contains an accessor or hole`);
  }
}
function commandTarget(
  state: CollectiveEvaluationCampaignExecutionV1,
  input: { readonly executionId: string; readonly expectedRevision: number },
): void {
  if (input.executionId !== state.executionId)
    throw new TypeError("executionId does not match state");
  assertPlanningSafeInteger(input.expectedRevision, "expectedRevision", 0);
  if (input.expectedRevision !== state.revision)
    throw new TypeError("execution revision conflict");
}
function findCell(
  state: CollectiveEvaluationCampaignExecutionV1,
  cellId: string,
): CollectiveEvaluationCellExecutionV1 {
  const cell = state.cells.find((entry) => entry.cellId === cellId);
  if (!cell) throw new TypeError("cell is not registered");
  return cell;
}
function findRun(
  cell: CollectiveEvaluationCellExecutionV1,
  runnerValue: CollectiveEvaluationCampaignRunnerV1,
  attemptValue: CollectiveEvaluationRunAttemptKindV1,
): CollectiveEvaluationRunSlotV1 {
  const slot = cell.runs.find(
    (entry) => entry.runner === runnerValue && entry.attempt === attemptValue,
  );
  if (!slot) throw new TypeError("run slot is not registered");
  return slot;
}
function replaceRun(
  runs: readonly CollectiveEvaluationRunSlotV1[],
  replacement: CollectiveEvaluationRunSlotV1,
) {
  return runs.map((entry) =>
    entry.runner === replacement.runner && entry.attempt === replacement.attempt
      ? replacement
      : entry,
  );
}
function cancelPending(runs: readonly CollectiveEvaluationRunSlotV1[]) {
  return runs.map((slot) =>
    slot.status === "pending" || slot.status === "running"
      ? { ...slot, status: "cancelled" as const }
      : slot,
  );
}
function terminalCell(
  status: CollectiveEvaluationCellExecutionStatusV1,
): boolean {
  return (
    status === "succeeded" || status === "failed" || status === "cancelled"
  );
}
function fencedCell(
  state: CollectiveEvaluationCampaignExecutionV1,
  cellId: string,
  fence: CollectiveEvaluationExecutionFenceV1,
  nowMs: number,
) {
  fenceInput(fence);
  const cell = findCell(state, cellId);
  const lease = cell.lease;
  if (
    !lease ||
    lease.workerId !== fence.workerId ||
    lease.leaseToken !== fence.leaseToken ||
    lease.generation !== fence.generation ||
    lease.expiresAtMs !== fence.expiresAtMs ||
    lease.expiresAtMs <= nowMs
  )
    throw new TypeError("cell lease fence is stale");
  return cell;
}
function freezeLease(value: CollectiveEvaluationCellLeaseV1) {
  return deepFreezePlanning(value);
}
function leaseInput(
  value: CollectiveEvaluationExecutionLeaseInputV1,
  nowMs: number,
): void {
  exact(value, ["expiresAtMs", "leaseToken", "workerId"], "lease");
  assertPlanningIdentifier(value.workerId, "workerId");
  assertPlanningToken(value.leaseToken, "leaseToken");
  time(value.expiresAtMs, "expiresAtMs");
  if (value.expiresAtMs <= nowMs)
    throw new TypeError("lease is already expired");
}
function fenceInput(value: CollectiveEvaluationExecutionFenceV1): void {
  exact(
    value,
    ["expiresAtMs", "generation", "leaseToken", "workerId"],
    "lease fence",
  );
  assertPlanningIdentifier(value.workerId, "workerId");
  assertPlanningToken(value.leaseToken, "leaseToken");
  assertPlanningSafeInteger(value.generation, "generation", 1);
  time(value.expiresAtMs, "expiresAtMs");
}
function runResult(
  value: CollectiveEvaluationRunResultV1,
): CollectiveEvaluationRunResultV1 {
  exact(
    value,
    [
      "evidenceDigest",
      "fairnessDigest",
      "ledgerDigest",
      "resultDigest",
      "traceDigest",
    ],
    "run result",
  );
  for (const key of [
    "resultDigest",
    "traceDigest",
    "ledgerDigest",
    "evidenceDigest",
    "fairnessDigest",
  ] as const)
    assertPlanningDigest(value[key], key);
  return deepFreezePlanning(value);
}
function sameSlotSettlement(
  slot: CollectiveEvaluationRunSlotV1,
  result: CollectiveEvaluationRunResultV1 | null,
  reasonCode: string | null,
): boolean {
  return sameRunResult(slot.result, result) && slot.reasonCode === reasonCode;
}
function sameRunResult(
  left: CollectiveEvaluationRunResultV1 | null,
  right: CollectiveEvaluationRunResultV1 | null,
): boolean {
  if (left === null || right === null) return left === right;
  return (
    left.resultDigest === right.resultDigest &&
    left.traceDigest === right.traceDigest &&
    left.ledgerDigest === right.ledgerDigest &&
    left.evidenceDigest === right.evidenceDigest &&
    left.fairnessDigest === right.fairnessDigest
  );
}
function sameFence(
  left: CollectiveEvaluationExecutionFenceV1,
  right: CollectiveEvaluationExecutionFenceV1,
): boolean {
  return (
    left.workerId === right.workerId &&
    left.leaseToken === right.leaseToken &&
    left.generation === right.generation &&
    left.expiresAtMs === right.expiresAtMs
  );
}
function runner(
  value: unknown,
): asserts value is CollectiveEvaluationCampaignRunnerV1 {
  if (value !== "adaptive_collective" && value !== "centralized_planner")
    throw new TypeError("runner is invalid");
}
function executionStatus(
  value: unknown,
): asserts value is CollectiveEvaluationExecutionStatusV1 {
  if (
    value !== "active" &&
    value !== "completed" &&
    value !== "failed" &&
    value !== "cancelled"
  )
    throw new TypeError("execution status is invalid");
}
function cellStatus(
  value: unknown,
): asserts value is CollectiveEvaluationCellExecutionStatusV1 {
  if (
    value !== "pending" &&
    value !== "leased" &&
    value !== "running" &&
    value !== "succeeded" &&
    value !== "failed" &&
    value !== "cancelled"
  )
    throw new TypeError("cell status is invalid");
}
function runStatus(
  value: unknown,
): asserts value is CollectiveEvaluationRunStatusV1 {
  if (
    value !== "pending" &&
    value !== "running" &&
    value !== "succeeded" &&
    value !== "failed" &&
    value !== "cancelled"
  )
    throw new TypeError("run status is invalid");
}
function attempt(
  value: unknown,
): asserts value is CollectiveEvaluationRunAttemptKindV1 {
  if (value !== "first" && value !== "replay")
    throw new TypeError("attempt is invalid");
}
function time(value: unknown, label: string): asserts value is number {
  assertPlanningSafeInteger(value, label, 0);
}
function assertCommand(value: unknown, keys: readonly string[]): void {
  exact(value, keys, "execution command");
}
function exact(
  value: unknown,
  keys: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null) ||
    Object.getOwnPropertySymbols(value).length !== 0
  )
    throw new TypeError(`${label} must be a plain record`);
  const names = Object.getOwnPropertyNames(value).sort();
  const expected = [...keys].sort();
  if (
    names.length !== expected.length ||
    names.some((name, index) => name !== expected[index])
  )
    throw new TypeError(`${label} shape is invalid`);
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor))
      throw new TypeError(`${label} must not have accessors`);
  }
}
