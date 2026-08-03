import {
  canonicalizePlanningJsonV1,
  deepFreezePlanning,
} from "@agentplat/collective-planning";
import {
  claimCollectiveEvaluationCellV1,
  collectiveEvaluationRunKeyV1,
  createCollectiveEvaluationCampaignExecutionV1,
  finalizeCollectiveEvaluationCampaignExecutionV1,
  renewCollectiveEvaluationCellLeaseV1,
  reconcileCollectiveEvaluationRunV1,
  settleCollectiveEvaluationRunV1,
  startCollectiveEvaluationRunV1,
  validateCollectiveEvaluationCampaignExecutionV1,
  validateCollectiveEvaluationCampaignRegistrationV1,
  type CollectiveEvaluationCampaignCellV1,
  type CollectiveEvaluationCampaignExecutionV1,
  type CollectiveEvaluationCampaignRegistrationV1,
  type CollectiveEvaluationExecutionFenceV1,
} from "@agentplat/collective-planning/evaluation";

import {
  createCollectiveStatisticalCampaignExecutionArtifactsV1,
  type CollectiveStatisticalCampaignExecutionArtifactsV1,
  type CollectiveStatisticalCampaignRunnerOutputV1,
} from "./collective-statistical-campaign-aggregation.js";
import type {
  CollectiveStatisticalCampaignAttemptV1,
  CollectiveStatisticalCampaignRunnerV1,
} from "./collective-statistical-campaign-bundle.js";

const runners = Object.freeze([
  "adaptive_collective",
  "centralized_planner",
] as const);
const attempts = Object.freeze(["first", "replay"] as const);
const MAXIMUM_EXECUTION_STATE_CAS_RETRIES = 256;

export interface CollectiveStatisticalCampaignExecutionStoreV1 {
  readonly schemaVersion: 1;
  readExecutionStateV1(
    input: Readonly<{
      executionId: string;
      registrationDigest: string;
    }>,
  ): Promise<CollectiveEvaluationCampaignExecutionV1 | null>;
  /**
   * Commits `state` only when the stored digest equals the expected digest.
   * `duplicate` means the proposed canonical state is already stored exactly;
   * callers must still reread that canonical state before continuing.
   */
  compareAndSwapExecutionStateV1(
    input: Readonly<{
      executionId: string;
      expectedExecutionDigest: string | null;
      state: CollectiveEvaluationCampaignExecutionV1;
    }>,
  ): Promise<"committed" | "duplicate" | "conflict">;
  readExecutionsV1(runKeys: readonly string[]): Promise<
    readonly Readonly<{
      runKey: string;
      execution: CollectiveStatisticalCampaignExecutionArtifactsV1 | null;
    }>[]
  >;
  commitExecutionV1(
    input: Readonly<{
      runKey: string;
      execution: CollectiveStatisticalCampaignExecutionArtifactsV1;
    }>,
  ): Promise<"committed" | "duplicate">;
}

export interface CollectiveStatisticalCampaignExecutionContextV1 {
  readonly schemaVersion: 1;
  readonly executionId: string;
  readonly registrationDigest: string;
  readonly runKey: string;
  readonly cell: CollectiveEvaluationCampaignCellV1;
  readonly runner: CollectiveStatisticalCampaignRunnerV1;
  readonly attempt: CollectiveStatisticalCampaignAttemptV1;
  readonly maximumInteractions: number;
  /** Extends the current fence. The requested expiry must be in the future. */
  renewLeaseV1(expiresAtMs: number): Promise<void>;
}

export interface CollectiveStatisticalCampaignShardExecutionInputV1 {
  readonly schemaVersion: 1;
  readonly registration: CollectiveEvaluationCampaignRegistrationV1;
  readonly executionId: string;
  readonly workerId: string;
  readonly shard: Readonly<{
    readonly schemaVersion: 1;
    readonly index: number;
    readonly count: number;
  }>;
  readonly leaseDurationMs: number;
  readonly maximumCells: number;
  readonly store: CollectiveStatisticalCampaignExecutionStoreV1;
  readonly now: () => number;
  readonly execute: (
    context: CollectiveStatisticalCampaignExecutionContextV1,
  ) =>
    | Promise<CollectiveStatisticalCampaignRunnerOutputV1>
    | CollectiveStatisticalCampaignRunnerOutputV1;
}

export interface CollectiveStatisticalCampaignShardExecutionResultV1 {
  readonly schemaVersion: 1;
  readonly executionId: string;
  readonly registrationDigest: string;
  readonly shardIndex: number;
  readonly shardCount: number;
  readonly selectedCellCount: number;
  readonly executedSlotCount: number;
  readonly resumedSlotCount: number;
  readonly passedSlotCount: number;
  readonly failedSlotCount: number;
  readonly state: CollectiveEvaluationCampaignExecutionV1;
  readonly executions: readonly CollectiveStatisticalCampaignExecutionArtifactsV1[];
}

/**
 * Runs one deterministic shard. Disjoint workers converge through bounded
 * revision-CAS retries; every logical run remains idempotent through runKey
 * and an immutable commit.
 * A crash after commit but before settlement is resumed from the stored commit.
 */
export async function runCollectiveStatisticalCampaignShardV1(
  input: CollectiveStatisticalCampaignShardExecutionInputV1,
): Promise<CollectiveStatisticalCampaignShardExecutionResultV1> {
  validateExecutorInput(input);
  const registration = validateCollectiveEvaluationCampaignRegistrationV1(
    input.registration,
  );
  let state = await loadOrCreateExecutionState(input, registration);
  const transition = async (
    apply: (
      current: CollectiveEvaluationCampaignExecutionV1,
    ) => CollectiveEvaluationCampaignExecutionV1,
  ): Promise<
    Readonly<{
      state: CollectiveEvaluationCampaignExecutionV1;
      outcome: "committed" | "duplicate";
    }>
  > => {
    for (
      let retry = 0;
      retry < MAXIMUM_EXECUTION_STATE_CAS_RETRIES;
      retry += 1
    ) {
      const previous = state;
      const next = apply(previous);
      const status = await input.store.compareAndSwapExecutionStateV1({
        executionId: input.executionId,
        expectedExecutionDigest: previous.executionDigest,
        state: next,
      });
      if (status === "committed") {
        state = next;
        return Object.freeze({ state, outcome: "committed" as const });
      }
      const canonical = await readExecutionState(input, registration);
      if (canonical === null)
        throw new TypeError(
          "collective_statistical_campaign_state_conflict_missing",
        );
      state = canonical;
      if (status === "duplicate") {
        // The store linearized an exact duplicate. The mandatory reread may
        // already observe a later CAS committed by another shard.
        return Object.freeze({ state, outcome: "duplicate" as const });
      }
    }
    throw new TypeError(
      "collective_statistical_campaign_state_retry_limit_exceeded",
    );
  };
  const selected = registration.cells.filter(
    (_cell, index) => index % input.shard.count === input.shard.index,
  );
  if (selected.length > input.maximumCells)
    throw new RangeError(
      "collective_statistical_campaign_shard_cell_limit_exceeded",
    );
  let executedSlotCount = 0;
  let resumedSlotCount = 0;
  const completed: CollectiveStatisticalCampaignExecutionArtifactsV1[] = [];

  for (const cell of selected) {
    const leaseToken = `lease:${input.workerId}:${input.shard.index}:${cell.peerCount}:${cell.stratum}:${cell.seed}`;
    let ownedFence: CollectiveEvaluationExecutionFenceV1 | null = null;

    for (const runner of runners) {
      for (const attempt of attempts) {
        const runKey = runKeyFor(state, cell.cellId, runner, attempt);
        let currentCell = cellFor(state, cell.cellId);
        let currentSlot = runFor(currentCell, runner, attempt);
        if (
          currentSlot.status === "succeeded" ||
          currentSlot.status === "failed"
        ) {
          const durable = await readOne(input.store, runKey);
          if (durable === null)
            throw new TypeError(
              "collective_statistical_campaign_terminal_commit_missing",
            );
          completed.push(
            validateStoredExecution(
              registration,
              input.executionId,
              cell,
              runner,
              attempt,
              runKey,
              durable,
            ),
          );
          resumedSlotCount += 1;
          continue;
        }
        if (currentSlot.status === "running") {
          const activeFence = fenceFor(state, cell.cellId);
          let durable = await readOne(input.store, runKey);
          const inspectionNow = clock(input.now);
          if (durable === null && activeFence.expiresAtMs > inspectionNow)
            throw new TypeError(
              "collective_statistical_campaign_running_lease_active",
            );
          if (durable === null) {
            durable = createFailedExecution(
              input.executionId,
              registration.registrationDigest,
              runKey,
              cell,
              runner,
              attempt,
              "indeterminate_external_effect",
            );
            const commit = await input.store.commitExecutionV1({
              runKey,
              execution: durable,
            });
            if (commit === "committed") executedSlotCount += 1;
            else {
              const canonical = await readOne(input.store, runKey);
              if (canonical === null)
                throw new TypeError(
                  "collective_statistical_campaign_duplicate_commit_missing",
                );
              durable = canonical;
              resumedSlotCount += 1;
            }
          } else {
            resumedSlotCount += 1;
          }
          const execution = validateStoredExecution(
            registration,
            input.executionId,
            cell,
            runner,
            attempt,
            runKey,
            durable,
          );
          await transition((current) =>
            settleStoredExecution(
              current,
              input.executionId,
              cell,
              runner,
              attempt,
              runKey,
              clock(input.now),
              execution,
            ),
          );
          completed.push(execution);
          continue;
        }

        const claim = await transition((current) => {
          const candidate = cellFor(current, cell.cellId);
          const claimNow = clock(input.now);
          if (
            candidate.status === "pending" ||
            (candidate.status === "leased" &&
              candidate.lease !== null &&
              candidate.lease.expiresAtMs <= claimNow)
          ) {
            return claimCollectiveEvaluationCellV1(current, {
              executionId: input.executionId,
              expectedRevision: current.revision,
              cellId: cell.cellId,
              nowMs: claimNow,
              lease: {
                workerId: input.workerId,
                leaseToken,
                expiresAtMs: safeAdd(claimNow, input.leaseDurationMs),
              },
            });
          }
          if (
            (candidate.status === "leased" || candidate.status === "running") &&
            candidate.lease !== null &&
            candidate.lease.workerId === input.workerId &&
            candidate.lease.leaseToken === leaseToken
          )
            return current;
          throw new TypeError(
            "collective_statistical_campaign_cell_lease_active",
          );
        });
        if (claim.outcome === "duplicate") {
          if (ownedFence === null)
            throw new TypeError(
              "collective_statistical_campaign_cell_lease_active",
            );
          const canonicalFence = fenceFor(state, cell.cellId);
          if (!sameExecutionFence(ownedFence, canonicalFence))
            throw new TypeError(
              "collective_statistical_campaign_cell_lease_active",
            );
        }
        const acquiredFence = fenceFor(state, cell.cellId);
        ownedFence = acquiredFence;
        await transition((current) =>
          startCollectiveEvaluationRunV1(current, {
            executionId: input.executionId,
            expectedRevision: current.revision,
            cellId: cell.cellId,
            runner,
            attempt,
            nowMs: clock(input.now),
            fence: acquiredFence,
          }),
        );
        const renewLeaseV1 = async (expiresAtMs: number): Promise<void> => {
          const renewalFence = ownedFence;
          if (renewalFence === null)
            throw new TypeError(
              "collective_statistical_campaign_cell_lease_missing",
            );
          await transition((current) =>
            renewCollectiveEvaluationCellLeaseV1(current, {
              executionId: input.executionId,
              expectedRevision: current.revision,
              cellId: cell.cellId,
              nowMs: clock(input.now),
              fence: renewalFence,
              expiresAtMs,
            }),
          );
          ownedFence = fenceFor(state, cell.cellId);
        };

        const stored = await readOne(input.store, runKey);
        let execution: CollectiveStatisticalCampaignExecutionArtifactsV1;
        if (stored !== null) {
          execution = validateStoredExecution(
            registration,
            input.executionId,
            cell,
            runner,
            attempt,
            runKey,
            stored,
          );
          resumedSlotCount += 1;
        } else {
          let output: CollectiveStatisticalCampaignRunnerOutputV1;
          try {
            output = await input.execute(
              deepFreezePlanning({
                schemaVersion: 1 as const,
                executionId: input.executionId,
                registrationDigest: registration.registrationDigest,
                runKey,
                cell,
                runner,
                attempt,
                maximumInteractions: cell.maximumInteractions,
                renewLeaseV1,
              }),
            );
          } catch {
            output = deepFreezePlanning({
              schemaVersion: 1 as const,
              status: "failed" as const,
              reasonCode: "runner_exception",
              outcome: { reasonCode: "runner_exception" },
              traceRecords: [],
              ledgerRecords: [],
              observations: [],
            });
          }
          execution = createCollectiveStatisticalCampaignExecutionArtifactsV1({
            schemaVersion: 1,
            executionId: input.executionId,
            runKey,
            registrationDigest: registration.registrationDigest,
            cell,
            runner,
            attempt,
            output,
          });
          const commit = await input.store.commitExecutionV1({
            runKey,
            execution,
          });
          if (commit === "committed") {
            executedSlotCount += 1;
          } else {
            const durable = await readOne(input.store, runKey);
            if (durable === null)
              throw new TypeError(
                "collective_statistical_campaign_duplicate_commit_missing",
              );
            execution = validateStoredExecution(
              registration,
              input.executionId,
              cell,
              runner,
              attempt,
              runKey,
              durable,
            );
            resumedSlotCount += 1;
          }
        }
        await transition((current) =>
          settleStoredExecution(
            current,
            input.executionId,
            cell,
            runner,
            attempt,
            runKey,
            clock(input.now),
            execution,
            ownedFence,
          ),
        );
        completed.push(execution);
      }
    }
  }
  const passedSlotCount = completed.filter(
    (execution) => execution.sample.status === "passed",
  ).length;
  return deepFreezePlanning({
    schemaVersion: 1 as const,
    executionId: input.executionId,
    registrationDigest: registration.registrationDigest,
    shardIndex: input.shard.index,
    shardCount: input.shard.count,
    selectedCellCount: selected.length,
    executedSlotCount,
    resumedSlotCount,
    passedSlotCount,
    failedSlotCount: completed.length - passedSlotCount,
    state,
    executions: Object.freeze(completed),
  });
}

async function loadOrCreateExecutionState(
  input: CollectiveStatisticalCampaignShardExecutionInputV1,
  registration: CollectiveEvaluationCampaignRegistrationV1,
): Promise<CollectiveEvaluationCampaignExecutionV1> {
  const loaded = await readExecutionState(input, registration);
  if (loaded !== null) return loaded;
  const created = createCollectiveEvaluationCampaignExecutionV1({
    schemaVersion: 1,
    executionId: input.executionId,
    registration,
  });
  const status = await input.store.compareAndSwapExecutionStateV1({
    executionId: input.executionId,
    expectedExecutionDigest: null,
    state: created,
  });
  if (status === "committed") return created;
  const raced = await readExecutionState(input, registration);
  if (raced === null)
    throw new TypeError("collective_statistical_campaign_state_conflict");
  return raced;
}

async function readExecutionState(
  input: CollectiveStatisticalCampaignShardExecutionInputV1,
  registration: CollectiveEvaluationCampaignRegistrationV1,
): Promise<CollectiveEvaluationCampaignExecutionV1 | null> {
  const state = await input.store.readExecutionStateV1({
    executionId: input.executionId,
    registrationDigest: registration.registrationDigest,
  });
  return state === null
    ? null
    : validatePersistedState(state, input.executionId, registration);
}

function validatePersistedState(
  state: CollectiveEvaluationCampaignExecutionV1,
  executionId: string,
  registration: CollectiveEvaluationCampaignRegistrationV1,
): CollectiveEvaluationCampaignExecutionV1 {
  validateCollectiveEvaluationCampaignExecutionV1(state);
  if (
    state.executionId !== executionId ||
    state.registrationDigest !== registration.registrationDigest ||
    state.cells.length !== registration.cells.length ||
    state.cells.some(
      (cell, index) =>
        cell.cellId !== registration.cells[index]?.cellId ||
        cell.runs.length !== 4,
    )
  )
    throw new TypeError(
      "collective_statistical_campaign_persisted_state_invalid",
    );
  for (const cell of registration.cells) {
    for (const runner of runners) {
      for (const attempt of attempts) {
        const expected = collectiveEvaluationRunKeyV1({
          executionId: state.executionId,
          registrationDigest: registration.registrationDigest,
          cellId: cell.cellId,
          runner,
          attempt,
        });
        if (runKeyFor(state, cell.cellId, runner, attempt) !== expected)
          throw new TypeError(
            "collective_statistical_campaign_persisted_state_run_key_invalid",
          );
      }
    }
  }
  return state;
}

function settlementFields(
  execution: CollectiveStatisticalCampaignExecutionArtifactsV1,
  cell: CollectiveEvaluationCampaignCellV1,
) {
  return execution.sample.status === "passed"
    ? {
        result: {
          resultDigest: execution.sample.sampleDigest,
          traceDigest: execution.trace.traceDigest,
          ledgerDigest: execution.ledger.ledgerDigest,
          evidenceDigest: execution.evidence.evidenceDigest,
          fairnessDigest: cell.scaleConfigurationDigest,
        },
        reasonCode: null,
      }
    : {
        result: null,
        reasonCode: execution.reasonCode ?? "runner_failed",
      };
}

function settleStoredExecution(
  state: CollectiveEvaluationCampaignExecutionV1,
  executionId: string,
  cell: CollectiveEvaluationCampaignCellV1,
  runner: CollectiveStatisticalCampaignRunnerV1,
  attempt: CollectiveStatisticalCampaignAttemptV1,
  runKey: string,
  nowMs: number,
  execution: CollectiveStatisticalCampaignExecutionArtifactsV1,
  expectedFence: CollectiveEvaluationExecutionFenceV1 | null = null,
): CollectiveEvaluationCampaignExecutionV1 {
  const currentCell = cellFor(state, cell.cellId);
  const slot = runFor(currentCell, runner, attempt);
  const fields = settlementFields(execution, cell);
  if (slot.status === "succeeded" || slot.status === "failed") {
    if (slot.settlementFence === null || slot.settledFromRevision === null)
      throw new TypeError(
        "collective_statistical_campaign_terminal_settlement_invalid",
      );
    return settleCollectiveEvaluationRunV1(state, {
      executionId,
      expectedRevision: slot.settledFromRevision,
      cellId: cell.cellId,
      runner,
      attempt,
      nowMs,
      fence: slot.settlementFence,
      ...fields,
    }).state;
  }
  if (slot.status !== "running" || slot.runKey !== runKey)
    throw new TypeError("collective_statistical_campaign_run_not_settleable");
  const currentFence = fenceFor(state, cell.cellId);
  if (
    expectedFence !== null &&
    !sameExecutionFence(expectedFence, currentFence)
  )
    throw new TypeError("collective_statistical_campaign_run_fence_changed");
  return currentFence.expiresAtMs <= nowMs
    ? reconcileCollectiveEvaluationRunV1(state, {
        executionId,
        expectedRevision: state.revision,
        cellId: cell.cellId,
        runner,
        attempt,
        runKey: runKey as never,
        nowMs,
        ...fields,
      }).state
    : settleCollectiveEvaluationRunV1(state, {
        executionId,
        expectedRevision: state.revision,
        cellId: cell.cellId,
        runner,
        attempt,
        nowMs,
        fence: currentFence,
        ...fields,
      }).state;
}

function sameExecutionFence(
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

function createFailedExecution(
  executionId: string,
  registrationDigest: string,
  runKey: string,
  cell: CollectiveEvaluationCampaignCellV1,
  runner: CollectiveStatisticalCampaignRunnerV1,
  attempt: CollectiveStatisticalCampaignAttemptV1,
  reasonCode: string,
): CollectiveStatisticalCampaignExecutionArtifactsV1 {
  return createCollectiveStatisticalCampaignExecutionArtifactsV1({
    schemaVersion: 1,
    executionId,
    runKey,
    registrationDigest,
    cell,
    runner,
    attempt,
    output: {
      schemaVersion: 1,
      status: "failed",
      reasonCode,
      outcome: { reasonCode },
      traceRecords: [],
      ledgerRecords: [],
      observations: [],
    },
  });
}

function cellFor(
  state: CollectiveEvaluationCampaignExecutionV1,
  cellId: string,
) {
  const cell = state.cells.find((entry) => entry.cellId === cellId);
  if (!cell)
    throw new TypeError("collective_statistical_campaign_cell_missing");
  return cell;
}

function runFor(
  cell: ReturnType<typeof cellFor>,
  runner: CollectiveStatisticalCampaignRunnerV1,
  attempt: CollectiveStatisticalCampaignAttemptV1,
) {
  const run = cell.runs.find(
    (entry) => entry.runner === runner && entry.attempt === attempt,
  );
  if (!run)
    throw new TypeError("collective_statistical_campaign_run_slot_missing");
  return run;
}

/** Replays immutable commits into a fresh state and finalizes only a full closure. */
export function reconstructCollectiveStatisticalCampaignExecutionV1(input: {
  readonly schemaVersion: 1;
  readonly registration: CollectiveEvaluationCampaignRegistrationV1;
  readonly executionId: string;
  readonly executions: readonly CollectiveStatisticalCampaignExecutionArtifactsV1[];
}): CollectiveEvaluationCampaignExecutionV1 {
  if (input.schemaVersion !== 1)
    throw new TypeError(
      "collective_statistical_campaign_reconstruction_invalid",
    );
  const registration = validateCollectiveEvaluationCampaignRegistrationV1(
    input.registration,
  );
  const expectedSlotCount = registration.cells.length * 4;
  if (input.executions.length !== expectedSlotCount)
    throw new TypeError(
      "collective_statistical_campaign_reconstruction_incomplete",
    );
  const bySlot = new Map<
    string,
    CollectiveStatisticalCampaignExecutionArtifactsV1
  >();
  for (const execution of input.executions) {
    const slotKey = `${execution.cellId}\0${execution.runner}\0${execution.attempt}`;
    if (bySlot.has(slotKey))
      throw new TypeError(
        "collective_statistical_campaign_reconstruction_duplicate_slot",
      );
    bySlot.set(slotKey, execution);
  }
  if (bySlot.size !== expectedSlotCount)
    throw new TypeError(
      "collective_statistical_campaign_reconstruction_incomplete",
    );
  let state = createCollectiveEvaluationCampaignExecutionV1({
    schemaVersion: 1,
    executionId: input.executionId,
    registration,
  });
  let logicalTimeMs = 1;
  for (const cell of registration.cells) {
    state = claimCollectiveEvaluationCellV1(state, {
      executionId: input.executionId,
      expectedRevision: state.revision,
      cellId: cell.cellId,
      nowMs: logicalTimeMs,
      lease: {
        workerId: "worker:reconstruction",
        leaseToken: `lease:reconstruction:${cell.peerCount}:${cell.stratum}:${cell.seed}`,
        expiresAtMs: logicalTimeMs + 10_000,
      },
    });
    for (const runner of runners) {
      for (const attempt of attempts) {
        const execution = bySlot.get(`${cell.cellId}\0${runner}\0${attempt}`);
        if (!execution)
          throw new TypeError(
            "collective_statistical_campaign_reconstruction_missing_slot",
          );
        const runKey = runKeyFor(state, cell.cellId, runner, attempt);
        const validatedExecution = validateStoredExecution(
          registration,
          input.executionId,
          cell,
          runner,
          attempt,
          runKey,
          execution,
        );
        const fence = fenceFor(state, cell.cellId);
        state = startCollectiveEvaluationRunV1(state, {
          executionId: input.executionId,
          expectedRevision: state.revision,
          cellId: cell.cellId,
          runner,
          attempt,
          nowMs: logicalTimeMs,
          fence,
        });
        state = settleCollectiveEvaluationRunV1(state, {
          executionId: input.executionId,
          expectedRevision: state.revision,
          cellId: cell.cellId,
          runner,
          attempt,
          nowMs: logicalTimeMs,
          fence,
          result:
            validatedExecution.sample.status === "passed"
              ? {
                  resultDigest: validatedExecution.sample.sampleDigest,
                  traceDigest: validatedExecution.trace.traceDigest,
                  ledgerDigest: validatedExecution.ledger.ledgerDigest,
                  evidenceDigest: validatedExecution.evidence.evidenceDigest,
                  fairnessDigest: cell.scaleConfigurationDigest,
                }
              : null,
          reasonCode:
            validatedExecution.sample.status === "failed"
              ? (validatedExecution.reasonCode ?? "runner_failed")
              : null,
        }).state;
        logicalTimeMs += 1;
      }
    }
  }
  return finalizeCollectiveEvaluationCampaignExecutionV1(
    state,
    registration,
    state.revision,
  );
}

export function createMemoryCollectiveStatisticalCampaignExecutionStoreV1(): CollectiveStatisticalCampaignExecutionStoreV1 {
  const values = new Map<string, string>();
  const states = new Map<string, string>();
  return Object.freeze({
    schemaVersion: 1 as const,
    async readExecutionStateV1({
      executionId,
      registrationDigest,
    }: Readonly<{
      executionId: string;
      registrationDigest: string;
    }>) {
      const serialized = states.get(executionId);
      if (serialized === undefined) return null;
      const state = JSON.parse(
        serialized,
      ) as CollectiveEvaluationCampaignExecutionV1;
      if (state.registrationDigest !== registrationDigest)
        throw new TypeError(
          "collective_statistical_campaign_state_registration_conflict",
        );
      return state;
    },
    async compareAndSwapExecutionStateV1({
      executionId,
      expectedExecutionDigest,
      state,
    }: Readonly<{
      executionId: string;
      expectedExecutionDigest: string | null;
      state: CollectiveEvaluationCampaignExecutionV1;
    }>) {
      if (state.executionId !== executionId)
        throw new TypeError(
          "collective_statistical_campaign_state_execution_conflict",
        );
      const existing = states.get(executionId);
      if (existing === undefined) {
        if (expectedExecutionDigest !== null) return "conflict" as const;
      } else {
        const current = JSON.parse(
          existing,
        ) as CollectiveEvaluationCampaignExecutionV1;
        if (current.executionDigest !== expectedExecutionDigest)
          return "conflict" as const;
        const serialized = json(state);
        if (serialized === existing) return "duplicate" as const;
        states.set(executionId, serialized);
        return "committed" as const;
      }
      states.set(executionId, json(state));
      return "committed" as const;
    },
    async readExecutionsV1(runKeys: readonly string[]) {
      if (!Array.isArray(runKeys) || runKeys.length > 4_096)
        throw new RangeError(
          "collective_statistical_campaign_store_read_limit_exceeded",
        );
      return Object.freeze(
        runKeys.map((runKey) => {
          requireRunKey(runKey);
          const serialized = values.get(runKey);
          return Object.freeze({
            runKey,
            execution:
              serialized === undefined
                ? null
                : (JSON.parse(
                    serialized,
                  ) as CollectiveStatisticalCampaignExecutionArtifactsV1),
          });
        }),
      );
    },
    async commitExecutionV1({
      runKey,
      execution,
    }: Readonly<{
      runKey: string;
      execution: CollectiveStatisticalCampaignExecutionArtifactsV1;
    }>) {
      requireRunKey(runKey);
      const serialized = json(execution);
      const existing = values.get(runKey);
      if (existing !== undefined) {
        if (existing !== serialized)
          throw new TypeError(
            "collective_statistical_campaign_store_commit_conflict",
          );
        return "duplicate" as const;
      }
      values.set(runKey, serialized);
      return "committed" as const;
    },
  });
}

function validateExecutorInput(
  input: CollectiveStatisticalCampaignShardExecutionInputV1,
): void {
  if (
    !input ||
    input.schemaVersion !== 1 ||
    typeof input.executionId !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u.test(input.executionId) ||
    typeof input.workerId !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u.test(input.workerId) ||
    !input.shard ||
    input.shard.schemaVersion !== 1 ||
    !Number.isSafeInteger(input.shard.index) ||
    !Number.isSafeInteger(input.shard.count) ||
    input.shard.count < 1 ||
    input.shard.count > 256 ||
    input.shard.index < 0 ||
    input.shard.index >= input.shard.count ||
    !Number.isSafeInteger(input.leaseDurationMs) ||
    input.leaseDurationMs < 1_000 ||
    input.leaseDurationMs > 86_400_000 ||
    !Number.isSafeInteger(input.maximumCells) ||
    input.maximumCells < 1 ||
    input.maximumCells > 240 ||
    !input.store ||
    input.store.schemaVersion !== 1 ||
    typeof input.store.readExecutionStateV1 !== "function" ||
    typeof input.store.compareAndSwapExecutionStateV1 !== "function" ||
    typeof input.store.readExecutionsV1 !== "function" ||
    typeof input.store.commitExecutionV1 !== "function" ||
    typeof input.now !== "function" ||
    typeof input.execute !== "function"
  )
    throw new TypeError(
      "collective_statistical_campaign_executor_input_invalid",
    );
}

async function readOne(
  store: CollectiveStatisticalCampaignExecutionStoreV1,
  runKey: string,
): Promise<CollectiveStatisticalCampaignExecutionArtifactsV1 | null> {
  const result = await store.readExecutionsV1([runKey]);
  if (
    !Array.isArray(result) ||
    result.length !== 1 ||
    result[0]?.runKey !== runKey
  )
    throw new TypeError("collective_statistical_campaign_store_read_invalid");
  return result[0].execution;
}

function validateStoredExecution(
  registration: CollectiveEvaluationCampaignRegistrationV1,
  executionId: string,
  cell: CollectiveEvaluationCampaignCellV1,
  runner: CollectiveStatisticalCampaignRunnerV1,
  attempt: CollectiveStatisticalCampaignAttemptV1,
  runKey: string,
  execution: CollectiveStatisticalCampaignExecutionArtifactsV1,
): CollectiveStatisticalCampaignExecutionArtifactsV1 {
  if (
    runKey !==
      collectiveEvaluationRunKeyV1({
        executionId,
        registrationDigest: registration.registrationDigest,
        cellId: cell.cellId,
        runner,
        attempt,
      }) ||
    execution.executionId !== executionId ||
    execution.runKey !== runKey ||
    execution.cellId !== cell.cellId ||
    execution.seed !== cell.seed ||
    execution.runner !== runner ||
    execution.attempt !== attempt
  )
    throw new TypeError(
      "collective_statistical_campaign_stored_execution_scope_invalid",
    );
  const validated = createCollectiveStatisticalCampaignExecutionArtifactsV1({
    schemaVersion: 1,
    executionId,
    runKey,
    registrationDigest: registration.registrationDigest,
    cell,
    runner,
    attempt,
    output: {
      schemaVersion: 1,
      status: execution.sample.status,
      reasonCode: execution.reasonCode,
      outcome: execution.sample.outcome,
      traceRecords: execution.trace.records,
      ledgerRecords: execution.ledger.records,
      observations: execution.evidence.observations,
    },
  });
  if (json(validated) !== json(execution))
    throw new TypeError(
      "collective_statistical_campaign_stored_execution_invalid",
    );
  return validated;
}

function runKeyFor(
  state: CollectiveEvaluationCampaignExecutionV1,
  cellId: string,
  runner: CollectiveStatisticalCampaignRunnerV1,
  attempt: CollectiveStatisticalCampaignAttemptV1,
): string {
  const cell = state.cells.find((entry) => entry.cellId === cellId);
  const slot = cell?.runs.find(
    (entry) => entry.runner === runner && entry.attempt === attempt,
  );
  if (!slot)
    throw new TypeError("collective_statistical_campaign_run_slot_missing");
  return slot.runKey;
}

function fenceFor(
  state: CollectiveEvaluationCampaignExecutionV1,
  cellId: string,
): CollectiveEvaluationExecutionFenceV1 {
  const lease = state.cells.find((cell) => cell.cellId === cellId)?.lease;
  if (!lease)
    throw new TypeError("collective_statistical_campaign_cell_not_leased");
  return lease;
}

function requireRunKey(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value))
    throw new TypeError("collective_statistical_campaign_run_key_invalid");
}

function clock(now: () => number): number {
  const value = now();
  if (!Number.isSafeInteger(value) || value < 0)
    throw new TypeError("collective_statistical_campaign_clock_invalid");
  return value;
}

function safeAdd(left: number, right: number): number {
  const value = left + right;
  if (!Number.isSafeInteger(value))
    throw new RangeError("collective_statistical_campaign_time_overflow");
  return value;
}

function json(value: object): string {
  return canonicalizePlanningJsonV1(value as never, {
    maximumBytes: 67_108_864,
    maximumDepth: 64,
    maximumNodes: 2_000_000,
    maximumKeysPerObject: 4_096,
    maximumItemsPerArray: 262_144,
  });
}
