import type { PlanningDigestV1 } from "@agentplat/collective-planning";

import type {
  TeamExecutionArtifactPortV1,
  TeamExecutionArtifactV1,
  TeamExecutionHandoffEnvelopeV1,
  TeamExecutionPolicyRecordV1,
  TeamExecutionPortV1,
  TeamExecutionRebindRequestV1,
  TeamExecutionRecordV1,
  TeamExecutionRuntimeOptionsV1,
  TeamExecutionStartRequestV1,
  TeamExecutionStateV1,
  TeamExecutionStepCommandV1,
  TeamExecutionStepDispatchV1,
  TeamExecutionStepResultV1,
  TeamExecutionStoreV1,
  TeamMemberExecutionPortV1,
} from "./team-execution-contracts.js";
import {
  cancelTeamExecutionV1,
  expireTeamExecutionStepV1,
  prepareTeamExecutionStepV1,
  rebindTeamExecutionV1,
  settleTeamExecutionStepV1,
  startTeamExecutionV1,
} from "./team-execution-reducer.js";
import {
  createTeamExecutionHandoffV1,
  createTeamExecutionStateV1,
  validateTeamExecutionArtifactV1,
  validateTeamExecutionHandoffV1,
  validateTeamExecutionPolicyV1,
  validateTeamExecutionRebindRequestV1,
  validateTeamExecutionStartRequestV1,
  validateTeamExecutionStateV1,
  validateTeamExecutionStepCommandV1,
  validateTeamExecutionStepResultV1,
} from "./team-execution-validation.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;

export class TeamExecutionRuntimeV1 implements TeamExecutionPortV1 {
  readonly runtimeId: string;
  readonly runtimeVersion: number;
  readonly implementationId: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly policyDigest: PlanningDigestV1;
  readonly #stateKey: string;
  readonly #policy: TeamExecutionPolicyRecordV1;
  readonly #executor: TeamMemberExecutionPortV1;
  readonly #artifacts: TeamExecutionArtifactPortV1;
  readonly #store: TeamExecutionStoreV1;

  constructor(options: TeamExecutionRuntimeOptionsV1) {
    if (!options || typeof options !== "object")
      fail("team execution runtime options are required");
    this.#stateKey = identifier(options.stateKey, "runtime.stateKey");
    this.runtimeId = identifier(options.runtimeId, "runtime.runtimeId");
    this.runtimeVersion = positive(
      options.runtimeVersion,
      "runtime.runtimeVersion",
    );
    this.implementationId = identifier(
      options.implementationId,
      "runtime.implementationId",
    );
    this.#policy = validateTeamExecutionPolicyV1(options.policy);
    this.policyId = this.#policy.policy.policyId;
    this.policyVersion = this.#policy.policy.policyVersion;
    this.policyDigest = this.#policy.policyDigest;
    if (
      !options.executor ||
      typeof options.executor.execute !== "function" ||
      !options.artifacts ||
      typeof options.artifacts.publish !== "function" ||
      typeof options.artifacts.ensureAvailable !== "function" ||
      !options.store ||
      typeof options.store.load !== "function" ||
      typeof options.store.save !== "function"
    )
      fail("team execution runtime ports are required");
    identifier(options.executor.executorId, "executor.executorId");
    positive(options.executor.executorVersion, "executor.executorVersion");
    identifier(options.executor.implementationId, "executor.implementationId");
    this.#executor = options.executor;
    this.#artifacts = options.artifacts;
    this.#store = options.store;
  }

  async start(
    requestValue: TeamExecutionStartRequestV1,
  ): Promise<TeamExecutionRecordV1> {
    const request = validateTeamExecutionStartRequestV1(requestValue);
    return this.#commit((state) =>
      startTeamExecutionV1({ state, policy: this.#policy, request }),
    );
  }

  async prepareStep(
    commandValue: TeamExecutionStepCommandV1,
  ): Promise<TeamExecutionStepDispatchV1> {
    const command = validateTeamExecutionStepCommandV1(commandValue);
    const result = await this.#commit<TeamExecutionStepDispatchV1>((state) =>
      prepareTeamExecutionStepV1({ state, policy: this.#policy, command }),
    );
    return result;
  }

  async settleStep(
    resultValue: TeamExecutionStepResultV1,
  ): Promise<TeamExecutionRecordV1> {
    const result = validateTeamExecutionStepResultV1(resultValue);
    settleTeamExecutionStepV1({
      state: await this.loadState(),
      policy: this.#policy,
      executor: this.#executor,
      result,
    });
    await this.#publishArtifacts(result.artifacts);
    return this.#commit((state) =>
      settleTeamExecutionStepV1({
        state,
        policy: this.#policy,
        executor: this.#executor,
        result,
      }),
    );
  }

  async runStep(input: {
    readonly command: TeamExecutionStepCommandV1;
    readonly signal?: AbortSignal;
  }): Promise<TeamExecutionRecordV1> {
    const command = validateTeamExecutionStepCommandV1(input.command);
    const dispatch = await this.prepareStep(command);
    const state = await this.loadState();
    const execution = state.execution;
    if (!execution) fail("team execution disappeared after step preparation");
    const record = execution.steps.find(
      (step) => step.dispatch.dispatchDigest === dispatch.dispatchDigest,
    );
    if (!record) fail("prepared team execution dispatch is unavailable");
    if (record.result) return execution;
    const byDigest = new Map(
      execution.artifacts.map((artifact) => [
        artifact.artifactDigest,
        artifact,
      ]),
    );
    const dependencyArtifacts = dispatch.dependencyArtifactDigests.map(
      (artifactDigest) => {
        const artifact = byDigest.get(artifactDigest);
        if (!artifact)
          fail("team execution dependency artifact is unavailable");
        return artifact;
      },
    );
    for (const artifact of dependencyArtifacts) {
      if (!(await this.#artifacts.ensureAvailable(artifact)))
        fail("team execution dependency artifact is not locally available");
    }
    const result = validateTeamExecutionStepResultV1(
      await this.#executor.execute({
        dispatch,
        dependencyArtifacts,
        signal: input.signal,
      }),
    );
    return this.settleStep(result);
  }

  async expireStep(input: {
    readonly dispatchDigest: PlanningDigestV1;
    readonly logicalTimeMs: number;
  }): Promise<TeamExecutionRecordV1> {
    const dispatchDigest = sha(input.dispatchDigest, "expiry.dispatchDigest");
    const logicalTimeMs = nonNegative(
      input.logicalTimeMs,
      "expiry.logicalTimeMs",
    );
    return this.#commit((state) =>
      expireTeamExecutionStepV1({
        state,
        policy: this.#policy,
        executor: this.#executor,
        dispatchDigest,
        logicalTimeMs,
      }),
    );
  }

  async rebind(
    requestValue: TeamExecutionRebindRequestV1,
  ): Promise<TeamExecutionRecordV1> {
    const request = validateTeamExecutionRebindRequestV1(requestValue);
    return this.#commit((state) =>
      rebindTeamExecutionV1({ state, policy: this.#policy, request }),
    );
  }

  async cancel(input: {
    readonly reasonCode: string;
    readonly logicalTimeMs: number;
  }): Promise<TeamExecutionRecordV1> {
    return this.#commit((state) =>
      cancelTeamExecutionV1({
        state,
        policy: this.#policy,
        reasonCode: input.reasonCode,
        logicalTimeMs: input.logicalTimeMs,
      }),
    );
  }

  async loadState(): Promise<TeamExecutionStateV1> {
    const loaded = await this.#store.load(this.#stateKey);
    const state = loaded ? this.#validated(loaded) : this.#initialState();
    this.#assertBinding(state);
    return state;
  }

  async exportHandoff(input: {
    readonly targetStateKey: string;
    readonly logicalTimeMs: number;
  }): Promise<TeamExecutionHandoffEnvelopeV1> {
    const state = await this.loadState();
    return createTeamExecutionHandoffV1({
      sourceState: state,
      targetStateKey: input.targetStateKey,
      exportedAtLogicalMs: input.logicalTimeMs,
      policy: this.#policy,
    });
  }

  async importHandoff(input: {
    readonly handoff: TeamExecutionHandoffEnvelopeV1;
    readonly logicalTimeMs: number;
  }): Promise<TeamExecutionStateV1> {
    const handoff = validateTeamExecutionHandoffV1(input.handoff, {
      policy: this.#policy,
    });
    const logicalTimeMs = nonNegative(
      input.logicalTimeMs,
      "handoff.logicalTimeMs",
    );
    if (
      handoff.targetStateKey !== this.#stateKey ||
      handoff.runtimeId !== this.runtimeId ||
      handoff.runtimeVersion !== this.runtimeVersion ||
      handoff.implementationId !== this.implementationId ||
      handoff.policyDigest !== this.policyDigest ||
      logicalTimeMs < handoff.exportedAtLogicalMs ||
      logicalTimeMs < handoff.sourceState.logicalTimeHighWaterMs
    )
      fail("team execution handoff binding is invalid");
    const existing = await this.#store.load(this.#stateKey);
    if (existing) {
      const state = this.#validated(existing);
      if (state.predecessorStateDigest === handoff.sourceStateDigest)
        return state;
      fail("team execution handoff target conflicts with existing state");
    }
    const source = handoff.sourceState;
    const restored = createTeamExecutionStateV1({
      stateKey: this.#stateKey,
      runtimeId: this.runtimeId,
      runtimeVersion: this.runtimeVersion,
      implementationId: this.implementationId,
      policy: this.#policy,
      revision: source.revision + 1,
      logicalTimeHighWaterMs: Math.max(
        logicalTimeMs,
        source.logicalTimeHighWaterMs,
      ),
      execution: source.execution,
      predecessorStateDigest: source.stateDigest,
    });
    if (await this.#store.save({ state: restored, expectedRevision: null }))
      return restored;
    const raced = await this.#store.load(this.#stateKey);
    if (raced) {
      const state = this.#validated(raced);
      if (state.predecessorStateDigest === source.stateDigest) return state;
    }
    fail("team execution handoff target conflicts with existing state");
  }

  async #publishArtifacts(
    artifacts: readonly TeamExecutionArtifactV1[],
  ): Promise<void> {
    for (const artifact of artifacts) {
      await this.#artifacts.publish(artifact);
      if (!(await this.#artifacts.ensureAvailable(artifact)))
        fail("team execution result artifact is not durably available");
    }
  }

  async #commit<T>(
    transition: (state: TeamExecutionStateV1) => {
      readonly state: TeamExecutionStateV1;
      readonly execution?: TeamExecutionRecordV1;
      readonly dispatch?: TeamExecutionStepDispatchV1;
    },
  ): Promise<T> {
    for (let attempt = 0; attempt < this.#maximumAttempts(); attempt += 1) {
      const loaded = await this.#store.load(this.#stateKey);
      const state = loaded ? this.#validated(loaded) : this.#initialState();
      this.#assertBinding(state);
      const result = transition(state);
      const output = result.dispatch ?? result.execution;
      if (!output) fail("team execution transition produced no output");
      if (result.state.revision === state.revision) return output as T;
      if (
        await this.#store.save({
          state: result.state,
          expectedRevision: loaded ? state.revision : null,
        })
      )
        return output as T;
    }
    throw new Error("team_execution_commit_conflict");
  }

  #initialState(): TeamExecutionStateV1 {
    return createTeamExecutionStateV1({
      stateKey: this.#stateKey,
      runtimeId: this.runtimeId,
      runtimeVersion: this.runtimeVersion,
      implementationId: this.implementationId,
      policy: this.#policy,
    });
  }

  #validated(input: unknown): TeamExecutionStateV1 {
    return validateTeamExecutionStateV1(input, { policy: this.#policy });
  }

  #assertBinding(state: TeamExecutionStateV1): void {
    if (
      state.stateKey !== this.#stateKey ||
      state.runtimeId !== this.runtimeId ||
      state.runtimeVersion !== this.runtimeVersion ||
      state.implementationId !== this.implementationId ||
      state.policyDigest !== this.policyDigest
    )
      fail("team execution runtime binding changed");
  }

  #maximumAttempts(): number {
    return this.#policy.policy.limits.maximumCommitAttempts;
  }
}

export class InMemoryTeamExecutionStoreV1 implements TeamExecutionStoreV1 {
  readonly #states = new Map<string, TeamExecutionStateV1>();

  async load(stateKey: string): Promise<TeamExecutionStateV1 | null> {
    const state = this.#states.get(stateKey);
    return state ? structuredClone(state) : null;
  }

  async save(input: {
    readonly state: TeamExecutionStateV1;
    readonly expectedRevision: number | null;
  }): Promise<boolean> {
    const current = this.#states.get(input.state.stateKey);
    if (
      (input.expectedRevision === null && current) ||
      (input.expectedRevision !== null &&
        (!current || current.revision !== input.expectedRevision))
    )
      return false;
    this.#states.set(input.state.stateKey, structuredClone(input.state));
    return true;
  }
}

/** Reference registry for local composition and deterministic simulation only. */
export class InMemoryTeamExecutionArtifactPortV1 implements TeamExecutionArtifactPortV1 {
  readonly #artifacts = new Map<string, TeamExecutionArtifactV1>();
  readonly #maximumRecords: number;

  constructor(options: { readonly maximumRecords?: number } = {}) {
    this.#maximumRecords = options.maximumRecords ?? 65_536;
    if (
      !Number.isSafeInteger(this.#maximumRecords) ||
      this.#maximumRecords < 1 ||
      this.#maximumRecords > 1_000_000
    )
      fail("team execution artifact registry limit is invalid");
  }

  async publish(artifactValue: TeamExecutionArtifactV1): Promise<void> {
    const artifact = validateTeamExecutionArtifactV1(artifactValue);
    if (this.#artifacts.has(artifact.artifactDigest)) return;
    if (this.#artifacts.size >= this.#maximumRecords)
      throw new Error("team_execution_artifact_registry_full");
    this.#artifacts.set(artifact.artifactDigest, structuredClone(artifact));
  }

  async ensureAvailable(
    artifactValue: TeamExecutionArtifactV1,
  ): Promise<boolean> {
    const artifact = validateTeamExecutionArtifactV1(artifactValue);
    return this.#artifacts.has(artifact.artifactDigest);
  }
}

function identifier(input: unknown, label: string): string {
  if (typeof input !== "string" || !IDENTIFIER.test(input))
    fail(`${label} is invalid`);
  return input;
}

function sha(input: unknown, label: string): PlanningDigestV1 {
  if (typeof input !== "string" || !DIGEST.test(input))
    fail(`${label} is invalid`);
  return input as PlanningDigestV1;
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

function fail(message: string): never {
  throw new TypeError(message);
}
