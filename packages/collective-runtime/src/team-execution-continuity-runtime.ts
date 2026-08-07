import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";

import type {
  TeamExecutionContinuityCheckpointRequestV1,
  TeamExecutionContinuityCheckpointV1,
  TeamExecutionContinuityHolderV1,
  TeamExecutionContinuityPortV1,
  TeamExecutionContinuityRuntimeOptionsV1,
  TeamExecutionContinuityStateV1,
  TeamExecutionContinuityTakeoverRequestV1,
  TeamExecutionContinuityTakeoverResultV1,
  TeamExecutionWorkOwnerAuthorityV1,
} from "./team-execution-continuity-contracts.js";
import {
  createTeamExecutionContinuityCheckpointV1,
  createTeamExecutionContinuityStateV1,
  validateTeamExecutionContinuityCheckpointV1,
  validateTeamExecutionContinuityStateV1,
  validateTeamExecutionWorkOwnerAuthorityV1,
} from "./team-execution-continuity-validation.js";
import type {
  TeamExecutionHandoffEnvelopeV1,
  TeamExecutionPolicyRecordV1,
  TeamExecutionStateV1,
} from "./team-execution-contracts.js";
import {
  validateTeamExecutionHandoffV1,
  validateTeamExecutionPolicyV1,
  validateTeamExecutionScopeV1,
  validateTeamExecutionStateV1,
} from "./team-execution-validation.js";

/**
 * Serializes ownership of one root work item. It consumes an existing owner
 * decision and never elects or widens authority.
 */
export class TeamExecutionContinuityRuntimeV1 implements TeamExecutionContinuityPortV1 {
  readonly #options: TeamExecutionContinuityRuntimeOptionsV1;
  readonly #maximumCommitAttempts: number;
  readonly #localHolder: TeamExecutionContinuityHolderV1;
  readonly #executionPolicy: TeamExecutionPolicyRecordV1;

  constructor(options: TeamExecutionContinuityRuntimeOptionsV1) {
    if (!options || typeof options !== "object")
      fail("continuity runtime options are required");
    if (
      !options.execution ||
      typeof options.execution.start !== "function" ||
      typeof options.execution.prepareStep !== "function" ||
      typeof options.execution.settleStep !== "function" ||
      typeof options.execution.runStep !== "function" ||
      typeof options.execution.expireStep !== "function" ||
      typeof options.execution.rebind !== "function" ||
      typeof options.execution.cancel !== "function" ||
      typeof options.execution.loadState !== "function" ||
      typeof options.execution.exportHandoff !== "function" ||
      typeof options.execution.importHandoff !== "function" ||
      !options.authority ||
      typeof options.authority.current !== "function" ||
      !options.membership ||
      typeof options.membership.current !== "function" ||
      !options.checkpoints ||
      typeof options.checkpoints.get !== "function" ||
      typeof options.checkpoints.getById !== "function" ||
      typeof options.checkpoints.put !== "function" ||
      !options.availability ||
      typeof options.availability.certify !== "function" ||
      typeof options.availability.verify !== "function" ||
      !options.store ||
      typeof options.store.load !== "function" ||
      typeof options.store.save !== "function"
    )
      fail("continuity runtime ports are required");
    validateTeamExecutionScopeV1(options.scope);
    identifier(options.stateKey, "continuity.stateKey");
    this.#localHolder = holder(options.localHolder);
    this.#executionPolicy = validateTeamExecutionPolicyV1(
      options.executionPolicy,
    );
    if (
      options.execution.runtimeId === undefined ||
      options.execution.runtimeVersion === undefined ||
      options.execution.implementationId === undefined ||
      options.execution.policyId !== this.#executionPolicy.policy.policyId ||
      options.execution.policyVersion !==
        this.#executionPolicy.policy.policyVersion ||
      options.execution.policyDigest !== this.#executionPolicy.policyDigest
    )
      fail("continuity execution policy binding is invalid");
    this.#maximumCommitAttempts = options.maximumCommitAttempts ?? 8;
    if (
      !Number.isSafeInteger(this.#maximumCommitAttempts) ||
      this.#maximumCommitAttempts < 1 ||
      this.#maximumCommitAttempts > 64
    )
      fail("continuity maximum commit attempts is invalid");
    this.#options = options;
  }

  async loadState(): Promise<TeamExecutionContinuityStateV1> {
    const loaded = await this.#options.store.load(this.#options.stateKey);
    return loaded ? this.#validatedState(loaded) : this.#initialState();
  }

  async initialize(input: {
    readonly logicalTimeMs: number;
  }): Promise<TeamExecutionContinuityStateV1> {
    const logicalTimeMs = logical(
      input.logicalTimeMs,
      "initialize.logicalTimeMs",
    );
    const authority = await this.#current(logicalTimeMs);
    if (authority.resumeCheckpointDigest !== null)
      fail("team execution continuity takeover is required");
    for (let attempt = 0; attempt < this.#maximumCommitAttempts; attempt += 1) {
      const loaded = await this.#options.store.load(this.#options.stateKey);
      const state = loaded
        ? this.#validatedState(loaded)
        : this.#initialState();
      if (state.authority) {
        if (!sameAuthority(state.authority, authority))
          fail("team execution continuity authority is stale");
        return state;
      }
      const next = this.#next(state, { authority, logicalTimeMs });
      if (
        await this.#options.store.save({
          state: next,
          expectedRevision: loaded ? state.revision : null,
          authority,
          logicalTimeMs,
        })
      ) {
        await this.#assertSameCurrent(authority, logicalTimeMs);
        return next;
      }
    }
    throw new Error("team_execution_continuity_commit_conflict");
  }

  async checkpoint(
    request: TeamExecutionContinuityCheckpointRequestV1,
  ): Promise<TeamExecutionContinuityCheckpointV1> {
    const logicalTimeMs = logical(
      request.logicalTimeMs,
      "checkpoint.logicalTimeMs",
    );
    const checkpointId = identifier(
      request.checkpointId,
      "checkpoint.checkpointId",
    );
    const targetStateKey = identifier(
      request.targetStateKey,
      "checkpoint.targetStateKey",
    );
    for (let attempt = 0; attempt < this.#maximumCommitAttempts; attempt += 1) {
      const loaded = await this.#options.store.load(this.#options.stateKey);
      const state = loaded
        ? this.#validatedState(loaded)
        : this.#initialState();
      const authority = await this.#assertMutationAuthority(
        state,
        logicalTimeMs,
      );
      const membershipEpoch = authority.membershipEpoch;
      const membershipConfigurationDigest =
        authority.membershipConfigurationDigest;
      const handoff = this.#validatedHandoff(
        await this.#options.execution.exportHandoff({
          targetStateKey,
          logicalTimeMs,
          authority,
        }),
      );
      if (
        handoff.sourceState.execution?.scope.scopeDigest !==
        this.#options.scope.scopeDigest
      )
        fail("team execution continuity checkpoint scope is invalid");

      const existingByIdValue =
        await this.#options.checkpoints.getById(checkpointId);
      const existingById = existingByIdValue
        ? this.#validatedCheckpoint(existingByIdValue)
        : null;
      const existingPredecessor =
        existingById &&
        state.checkpointHeadDigest === existingById.checkpointDigest
          ? existingById.predecessorCheckpointDigest
          : state.checkpointHeadDigest;
      if (
        existingById &&
        !checkpointMatches(existingById, {
          authority,
          membershipEpoch,
          membershipConfigurationDigest,
          executionStateDigest: handoff.sourceStateDigest,
          targetStateKey,
          predecessorCheckpointDigest: existingPredecessor,
        })
      )
        fail("team execution continuity checkpoint id conflict");

      if (state.checkpointHeadDigest) {
        const headValue = await this.#options.checkpoints.get(
          state.checkpointHeadDigest,
        );
        if (!headValue)
          fail("team execution continuity checkpoint head is unavailable");
        const head = this.#validatedCheckpoint(headValue);
        if (
          checkpointSameRevision(head, {
            authority,
            membershipEpoch,
            membershipConfigurationDigest,
            executionStateDigest: handoff.sourceStateDigest,
          })
        ) {
          if (head.handoff.targetStateKey !== targetStateKey)
            fail("team execution continuity checkpoint revision conflict");
          if (
            existingById &&
            existingById.checkpointDigest !== head.checkpointDigest
          )
            fail("team execution continuity checkpoint id conflict");
          await this.#assertAvailable(head, logicalTimeMs);
          return head;
        }
      }

      let checkpoint = existingById;
      if (!checkpoint) {
        const core = {
          schemaVersion: 1 as const,
          checkpointId,
          scope: state.scope,
          authority,
          membershipEpoch,
          membershipConfigurationDigest,
          predecessorCheckpointDigest: state.checkpointHeadDigest,
          executionStateDigest: handoff.sourceStateDigest,
          handoff,
          createdAtLogicalMs: logicalTimeMs,
        };
        const checkpointDigest = digest(
          "team-execution-continuity-checkpoint",
          core,
        );
        const availability = await this.#options.availability.certify({
          scope: state.scope,
          checkpointDigest,
          membershipEpoch,
          membershipConfigurationDigest,
          logicalTimeMs,
        });
        checkpoint = createTeamExecutionContinuityCheckpointV1({
          ...core,
          availability,
        });
        await this.#assertAvailable(checkpoint, logicalTimeMs);
        await this.#options.checkpoints.put(checkpoint);
      } else {
        await this.#assertAvailable(checkpoint, logicalTimeMs);
      }
      await this.#assertSameCurrent(authority, logicalTimeMs);
      const next = this.#next(state, {
        authority,
        checkpointHeadDigest: checkpoint.checkpointDigest,
        logicalTimeMs,
      });
      if (
        await this.#options.store.save({
          state: next,
          expectedRevision: loaded ? state.revision : null,
          authority,
          logicalTimeMs,
        })
      ) {
        await this.#assertSameCurrent(authority, logicalTimeMs);
        return checkpoint;
      }
      const raced = await this.#options.store.load(this.#options.stateKey);
      if (
        raced &&
        this.#validatedState(raced).checkpointHeadDigest ===
          checkpoint.checkpointDigest
      )
        return checkpoint;
    }
    throw new Error("team_execution_continuity_commit_conflict");
  }

  async takeover(
    request: TeamExecutionContinuityTakeoverRequestV1,
  ): Promise<TeamExecutionContinuityTakeoverResultV1> {
    const checkpointDigest = sha(
      request.checkpointDigest,
      "takeover.checkpointDigest",
    );
    const logicalTimeMs = logical(
      request.logicalTimeMs,
      "takeover.logicalTimeMs",
    );
    const checkpointValue =
      await this.#options.checkpoints.get(checkpointDigest);
    if (!checkpointValue)
      fail("team execution continuity checkpoint is unavailable");
    const checkpoint = this.#validatedCheckpoint(checkpointValue);
    if (checkpoint.checkpointDigest !== checkpointDigest)
      fail("team execution continuity checkpoint is invalid");
    if (checkpoint.scope.scopeDigest !== this.#options.scope.scopeDigest)
      fail("team execution continuity checkpoint scope is invalid");
    await this.#assertMembership(
      checkpoint.membershipEpoch,
      checkpoint.membershipConfigurationDigest,
      logicalTimeMs,
    );
    await this.#assertAvailable(checkpoint, logicalTimeMs);
    for (let attempt = 0; attempt < this.#maximumCommitAttempts; attempt += 1) {
      const loaded = await this.#options.store.load(this.#options.stateKey);
      const state = loaded
        ? this.#validatedState(loaded)
        : this.#initialState();
      const authority = await this.#current(logicalTimeMs);
      if (
        authority.generation <= checkpoint.authority.generation ||
        authority.fencingToken === checkpoint.authority.fencingToken
      )
        fail("team execution continuity takeover authority is stale");
      if (authority.resumeCheckpointDigest !== checkpointDigest)
        fail(
          "team execution continuity checkpoint is not authorized for resume",
        );
      if (
        state.authority &&
        state.checkpointHeadDigest === checkpointDigest &&
        sameAuthority(state.authority, authority)
      )
        return this.#completedTakeover(state, checkpoint);
      const emptyBootstrap =
        state.authority === null ||
        (sameAuthority(state.authority, authority) &&
          state.checkpointHeadDigest === null);
      if (
        !emptyBootstrap &&
        (!sameAuthority(state.authority, checkpoint.authority) ||
          state.checkpointHeadDigest !== checkpointDigest)
      )
        fail("team execution continuity checkpoint fork detected");
      const imported = this.#validatedImportedExecution(
        await this.#options.execution.importHandoff({
          handoff: checkpoint.handoff,
          logicalTimeMs,
          authority,
        }),
        checkpoint,
      );
      await this.#assertSameCurrent(authority, logicalTimeMs);
      const next = this.#next(state, {
        authority,
        checkpointHeadDigest: checkpointDigest,
        logicalTimeMs,
      });
      const saved = await this.#options.store.save({
        state: next,
        expectedRevision: loaded ? state.revision : null,
        authority,
        logicalTimeMs,
      });
      await this.#assertSameCurrent(authority, logicalTimeMs);
      if (saved) return this.#takeoverResult(next, imported);
    }
    throw new Error("team_execution_continuity_commit_conflict");
  }

  async start(request: Parameters<TeamExecutionContinuityPortV1["start"]>[0]) {
    return this.#mutate(request.logicalTimeMs, (authority) =>
      this.#options.execution.start({ request, authority }),
    );
  }
  async prepareStep(
    command: Parameters<TeamExecutionContinuityPortV1["prepareStep"]>[0],
  ) {
    return this.#mutate(command.logicalTimeMs, (authority) =>
      this.#options.execution.prepareStep({ command, authority }),
    );
  }
  async settleStep(
    result: Parameters<TeamExecutionContinuityPortV1["settleStep"]>[0],
  ) {
    return this.#mutate(result.completedAtLogicalMs, (authority) =>
      this.#options.execution.settleStep({ result, authority }),
    );
  }
  async runStep(
    input: Parameters<TeamExecutionContinuityPortV1["runStep"]>[0],
  ) {
    return this.#mutate(input.command.logicalTimeMs, (authority) =>
      this.#options.execution.runStep({ request: input, authority }),
    );
  }
  async expireStep(
    input: Parameters<TeamExecutionContinuityPortV1["expireStep"]>[0],
  ) {
    return this.#mutate(input.logicalTimeMs, (authority) =>
      this.#options.execution.expireStep({ request: input, authority }),
    );
  }
  async rebind(
    request: Parameters<TeamExecutionContinuityPortV1["rebind"]>[0],
  ) {
    return this.#mutate(request.logicalTimeMs, (authority) =>
      this.#options.execution.rebind({ request, authority }),
    );
  }
  async cancel(input: Parameters<TeamExecutionContinuityPortV1["cancel"]>[0]) {
    return this.#mutate(input.logicalTimeMs, (authority) =>
      this.#options.execution.cancel({ request: input, authority }),
    );
  }

  async #mutate<T>(
    logicalTimeValue: number,
    action: (authority: TeamExecutionWorkOwnerAuthorityV1) => Promise<T>,
  ): Promise<T> {
    const logicalTimeMs = logical(logicalTimeValue, "mutation.logicalTimeMs");
    const before = await this.loadState();
    const authority = await this.#assertMutationAuthority(
      before,
      logicalTimeMs,
    );
    const result = await action(authority);
    const after = await this.loadState();
    const current = await this.#assertMutationAuthority(after, logicalTimeMs);
    if (!sameAuthority(authority, current))
      fail("team execution continuity authority changed during mutation");
    return result;
  }

  async #completedTakeover(
    receipt: TeamExecutionContinuityStateV1,
    checkpoint: TeamExecutionContinuityCheckpointV1,
  ): Promise<TeamExecutionContinuityTakeoverResultV1> {
    if (
      !receipt.authority ||
      receipt.checkpointHeadDigest !== checkpoint.checkpointDigest ||
      receipt.authority.resumeCheckpointDigest !==
        checkpoint.checkpointDigest ||
      receipt.authority.generation <= checkpoint.authority.generation
    )
      fail("team execution continuity takeover receipt is invalid");
    return this.#takeoverResult(
      receipt,
      this.#validatedImportedExecution(
        await this.#options.execution.loadState(),
        checkpoint,
        true,
      ),
    );
  }

  #takeoverResult(
    state: TeamExecutionContinuityStateV1,
    execution: TeamExecutionStateV1,
  ): TeamExecutionContinuityTakeoverResultV1 {
    const pendingDispatches =
      execution.execution?.steps
        .filter((step) => step.result === null)
        .map((step) => step.dispatch) ?? [];
    return Object.freeze({
      state,
      execution,
      pendingDispatches: Object.freeze(pendingDispatches),
    });
  }

  #validatedState(input: unknown): TeamExecutionContinuityStateV1 {
    const state = validateTeamExecutionContinuityStateV1(input);
    if (
      state.stateKey !== this.#options.stateKey ||
      state.scope.scopeDigest !== this.#options.scope.scopeDigest
    )
      fail("team execution continuity state binding is invalid");
    if (state.authority === null && state.checkpointHeadDigest !== null)
      fail("team execution continuity state lineage is invalid");
    return state;
  }

  #validatedHandoff(input: unknown): TeamExecutionHandoffEnvelopeV1 {
    return validateTeamExecutionHandoffV1(input, {
      policy: this.#executionPolicy,
    });
  }

  #validatedCheckpoint(input: unknown): TeamExecutionContinuityCheckpointV1 {
    const checkpoint = validateTeamExecutionContinuityCheckpointV1(input);
    const handoff = this.#validatedHandoff(checkpoint.handoff);
    if (
      handoff.handoffDigest !== checkpoint.handoff.handoffDigest ||
      handoff.sourceStateDigest !== checkpoint.executionStateDigest
    )
      fail("team execution continuity checkpoint handoff is invalid");
    return checkpoint;
  }

  #validatedImportedExecution(
    input: unknown,
    checkpoint: TeamExecutionContinuityCheckpointV1,
    confirmed = false,
  ): TeamExecutionStateV1 {
    const state = validateTeamExecutionStateV1(input, {
      policy: this.#executionPolicy,
    });
    const source = checkpoint.handoff.sourceState;
    if (
      state.stateKey !== checkpoint.handoff.targetStateKey ||
      state.runtimeId !== checkpoint.handoff.runtimeId ||
      state.runtimeVersion !== checkpoint.handoff.runtimeVersion ||
      state.implementationId !== checkpoint.handoff.implementationId ||
      state.policyId !== this.#executionPolicy.policy.policyId ||
      state.policyVersion !== this.#executionPolicy.policy.policyVersion ||
      state.policyDigest !== checkpoint.handoff.policyDigest ||
      state.execution?.scope.scopeDigest !== this.#options.scope.scopeDigest ||
      state.execution?.executionId !== source.execution?.executionId ||
      (confirmed
        ? state.revision < source.revision + 1
        : state.predecessorStateDigest !== checkpoint.executionStateDigest)
    )
      fail("team execution continuity imported execution binding is invalid");
    return state;
  }

  async #assertMutationAuthority(
    state: TeamExecutionContinuityStateV1,
    logicalTimeMs: number,
  ): Promise<TeamExecutionWorkOwnerAuthorityV1> {
    if (!state.authority) fail("team execution continuity is not initialized");
    const authority = await this.#current(logicalTimeMs);
    if (!sameAuthority(state.authority, authority))
      fail("team execution continuity authority is stale");
    return authority;
  }

  async #current(
    logicalTimeMs: number,
  ): Promise<TeamExecutionWorkOwnerAuthorityV1> {
    const decision = await this.#options.authority.current({
      scope: this.#options.scope,
      logicalTimeMs,
    });
    if (
      !decision ||
      decision.current !== true ||
      decision.reasonCode !== "current"
    )
      fail("team execution continuity authority is unavailable");
    const authority = validateTeamExecutionWorkOwnerAuthorityV1(
      decision.authority,
    );
    if (!sameScope(authority, this.#options.scope))
      fail("team execution continuity authority scope is invalid");
    if (!sameHolder(authority.holder, this.#localHolder))
      fail("team execution continuity authority holder is invalid");
    if (logicalTimeMs >= authority.validUntilLogicalMs)
      fail("team execution continuity authority is expired");
    await this.#assertMembership(
      authority.membershipEpoch,
      authority.membershipConfigurationDigest,
      logicalTimeMs,
    );
    return authority;
  }

  async #assertSameCurrent(
    expected: TeamExecutionWorkOwnerAuthorityV1,
    logicalTimeMs: number,
  ): Promise<void> {
    if (!sameAuthority(expected, await this.#current(logicalTimeMs)))
      fail("team execution continuity authority changed during mutation");
  }

  async #assertMembership(
    membershipEpoch: number,
    membershipConfigurationDigest: PlanningDigestV1,
    logicalTimeMs: number,
  ): Promise<void> {
    const decision = await this.#options.membership.current({
      scope: this.#options.scope,
      membershipEpoch,
      membershipConfigurationDigest,
      logicalTimeMs,
    });
    if (!decision || decision.current !== true)
      fail("team execution continuity membership is stale");
  }

  async #assertAvailable(
    checkpoint: TeamExecutionContinuityCheckpointV1,
    logicalTimeMs: number,
  ): Promise<void> {
    if (
      !(await this.#options.availability.verify({
        scope: checkpoint.scope,
        certificate: checkpoint.availability,
        checkpointDigest: checkpoint.checkpointDigest,
        membershipEpoch: checkpoint.membershipEpoch,
        membershipConfigurationDigest: checkpoint.membershipConfigurationDigest,
        logicalTimeMs,
      }))
    )
      fail("team execution continuity checkpoint is unavailable");
  }

  #initialState(): TeamExecutionContinuityStateV1 {
    return createTeamExecutionContinuityStateV1({
      stateKey: this.#options.stateKey,
      scope: this.#options.scope,
      revision: 0,
      logicalTimeHighWaterMs: 0,
      authority: null,
      checkpointHeadDigest: null,
      predecessorStateDigest: null,
    });
  }

  #next(
    state: TeamExecutionContinuityStateV1,
    change: {
      readonly authority?: TeamExecutionWorkOwnerAuthorityV1;
      readonly checkpointHeadDigest?: PlanningDigestV1 | null;
      readonly logicalTimeMs: number;
    },
  ): TeamExecutionContinuityStateV1 {
    if (change.logicalTimeMs < state.logicalTimeHighWaterMs)
      fail("team execution continuity logical time regressed");
    return createTeamExecutionContinuityStateV1({
      stateKey: state.stateKey,
      scope: state.scope,
      revision: state.revision + 1,
      logicalTimeHighWaterMs: change.logicalTimeMs,
      authority: change.authority ?? state.authority,
      checkpointHeadDigest:
        change.checkpointHeadDigest === undefined
          ? state.checkpointHeadDigest
          : change.checkpointHeadDigest,
      predecessorStateDigest: state.stateDigest,
    });
  }
}

function checkpointMatches(
  checkpoint: TeamExecutionContinuityCheckpointV1,
  expected: {
    readonly authority: TeamExecutionWorkOwnerAuthorityV1;
    readonly membershipEpoch: number;
    readonly membershipConfigurationDigest: PlanningDigestV1;
    readonly executionStateDigest: PlanningDigestV1;
    readonly targetStateKey: string;
    readonly predecessorCheckpointDigest: PlanningDigestV1 | null;
  },
): boolean {
  return (
    sameAuthority(checkpoint.authority, expected.authority) &&
    checkpoint.membershipEpoch === expected.membershipEpoch &&
    checkpoint.membershipConfigurationDigest ===
      expected.membershipConfigurationDigest &&
    checkpoint.executionStateDigest === expected.executionStateDigest &&
    checkpoint.handoff.targetStateKey === expected.targetStateKey &&
    checkpoint.predecessorCheckpointDigest ===
      expected.predecessorCheckpointDigest
  );
}
function checkpointSameRevision(
  checkpoint: TeamExecutionContinuityCheckpointV1,
  expected: {
    readonly authority: TeamExecutionWorkOwnerAuthorityV1;
    readonly membershipEpoch: number;
    readonly membershipConfigurationDigest: PlanningDigestV1;
    readonly executionStateDigest: PlanningDigestV1;
  },
): boolean {
  return (
    sameAuthority(checkpoint.authority, expected.authority) &&
    checkpoint.membershipEpoch === expected.membershipEpoch &&
    checkpoint.membershipConfigurationDigest ===
      expected.membershipConfigurationDigest &&
    checkpoint.executionStateDigest === expected.executionStateDigest
  );
}
function sameHolder(
  left: TeamExecutionContinuityHolderV1,
  right: TeamExecutionContinuityHolderV1,
): boolean {
  return (
    left.peerId === right.peerId &&
    left.instanceId === right.instanceId &&
    left.keyId === right.keyId
  );
}
function sameScope(
  authority: TeamExecutionWorkOwnerAuthorityV1,
  scope: {
    readonly tenantId: string;
    readonly meshId: string;
    readonly objectiveId: string;
    readonly rootWorkItemId: string;
  },
): boolean {
  return (
    authority.tenantId === scope.tenantId &&
    authority.meshId === scope.meshId &&
    authority.objectiveId === scope.objectiveId &&
    authority.rootWorkItemId === scope.rootWorkItemId
  );
}
function sameAuthority(
  left: TeamExecutionWorkOwnerAuthorityV1,
  right: TeamExecutionWorkOwnerAuthorityV1,
): boolean {
  return (
    sameScope(left, right) &&
    left.generation === right.generation &&
    left.headDigest === right.headDigest &&
    left.fencingToken === right.fencingToken &&
    left.membershipEpoch === right.membershipEpoch &&
    left.membershipConfigurationDigest ===
      right.membershipConfigurationDigest &&
    left.resumeCheckpointDigest === right.resumeCheckpointDigest &&
    sameHolder(left.holder, right.holder)
  );
}
function holder(
  value: TeamExecutionContinuityHolderV1,
): TeamExecutionContinuityHolderV1 {
  if (!value || value.schemaVersion !== 1)
    fail("continuity.localHolder is invalid");
  return Object.freeze({
    schemaVersion: 1,
    peerId: identifier(value.peerId, "localHolder.peerId"),
    instanceId: identifier(value.instanceId, "localHolder.instanceId"),
    keyId: identifier(value.keyId, "localHolder.keyId"),
  });
}
function digest(domain: string, value: unknown): PlanningDigestV1 {
  return digestPlanningJsonV1(domain as never, value as PlanningJson);
}
function identifier(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u.test(value)
  )
    fail(`${label} is invalid`);
  return value;
}
function sha(value: unknown, label: string): PlanningDigestV1 {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value))
    fail(`${label} is invalid`);
  return value as PlanningDigestV1;
}
function positive(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1)
    fail(`${label} is invalid`);
  return value as number;
}
function logical(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    fail(`${label} is invalid`);
  return value as number;
}
function fail(message: string): never {
  throw new TypeError(message);
}
