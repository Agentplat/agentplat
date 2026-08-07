import type { PlanningDigestV1 } from "@agentplat/collective-planning";
import type { MeshJsonValue } from "@agentplat/mesh-protocol";

import type {
  TeamExecutionExchangeHandlerV1,
  TeamExecutionExchangeMessageV1,
  TeamExecutionExchangeOutboundPortV1,
  TeamExecutionExchangeStateV1,
  TeamExecutionExchangeStoreV1,
} from "./team-execution-exchange-contracts.js";
import { TEAM_EXECUTION_EXCHANGE_MESH_EXTENSION_V1 } from "./team-execution-exchange-contracts.js";
import {
  createTeamExecutionExchangeMeshExtensionV1,
  validateTeamExecutionExchangeMessageV1,
  validateTeamExecutionExchangeStateV1,
} from "./team-execution-exchange-validation.js";
import type {
  TeamExecutionArtifactPortV1,
  TeamExecutionArtifactV1,
  TeamExecutionPortV1,
  TeamExecutionRecoverySignalV1,
  TeamExecutionStepDispatchV1,
  TeamExecutionStepResultV1,
  TeamMemberExecutionPortV1,
} from "./team-execution-contracts.js";

/** Deterministic in-memory CAS store for tests and local simulations. */
export class InMemoryTeamExecutionExchangeStoreV1 implements TeamExecutionExchangeStoreV1 {
  readonly #states = new Map<string, TeamExecutionExchangeStateV1>();

  async load(stateKey: string): Promise<TeamExecutionExchangeStateV1 | null> {
    return this.#states.get(stateKey) ?? null;
  }

  async save(input: {
    readonly state: TeamExecutionExchangeStateV1;
    readonly expectedRevision: number | null;
  }): Promise<boolean> {
    const state = validateTeamExecutionExchangeStateV1(input.state);
    const current = this.#states.get(state.stateKey);
    if (
      (current === undefined && input.expectedRevision !== null) ||
      (current !== undefined && current.revision !== input.expectedRevision)
    )
      return false;
    this.#states.set(state.stateKey, state);
    return true;
  }
}

export interface TeamExecutionExchangeRouterOptionsV1 {
  readonly onDispatch: (input: {
    readonly messageId: string;
    readonly message: TeamExecutionExchangeMessageV1;
    readonly dispatch: TeamExecutionStepDispatchV1;
  }) => Promise<void>;
  readonly onArtifactAvailable: (input: {
    readonly messageId: string;
    readonly message: TeamExecutionExchangeMessageV1;
    readonly artifact: TeamExecutionArtifactV1;
  }) => Promise<void>;
  readonly onResult: (input: {
    readonly messageId: string;
    readonly message: TeamExecutionExchangeMessageV1;
    readonly result: TeamExecutionStepResultV1;
  }) => Promise<void>;
  readonly onRecovery: (input: {
    readonly messageId: string;
    readonly message: TeamExecutionExchangeMessageV1;
    readonly recoverySignal: TeamExecutionRecoverySignalV1;
  }) => Promise<void>;
}

/** Exact-kind router. Every callback must persist messageId before acknowledging. */
export function createTeamExecutionExchangeRouterV1(
  options: TeamExecutionExchangeRouterOptionsV1,
): TeamExecutionExchangeHandlerV1 {
  if (
    !options ||
    typeof options.onDispatch !== "function" ||
    typeof options.onArtifactAvailable !== "function" ||
    typeof options.onResult !== "function" ||
    typeof options.onRecovery !== "function"
  )
    throw new TypeError(
      "team execution exchange router callbacks are required",
    );
  return Object.freeze({
    async handle(input: {
      readonly messageId: string;
      readonly message: TeamExecutionExchangeMessageV1;
    }) {
      const message = validateTeamExecutionExchangeMessageV1(input.message);
      if (input.messageId !== message.messageId)
        throw new TypeError("team execution exchange handler id is invalid");
      const payload = message.payload;
      if (payload.kind === "dispatch")
        return options.onDispatch({
          messageId: message.messageId,
          message,
          dispatch: payload.dispatch,
        });
      if (payload.kind === "artifact_available")
        return options.onArtifactAvailable({
          messageId: message.messageId,
          message,
          artifact: payload.artifact,
        });
      if (payload.kind === "result")
        return options.onResult({
          messageId: message.messageId,
          message,
          result: payload.result,
        });
      return options.onRecovery({
        messageId: message.messageId,
        message,
        recoverySignal: payload.recoverySignal,
      });
    },
  });
}

export interface TeamExecutionCoordinatorExchangeHandlerOptionsV1 {
  readonly execution: TeamExecutionPortV1;
  readonly artifacts: TeamExecutionArtifactPortV1;
  /** Persist and deduplicate messageId inside this callback. */
  readonly onRecovery: (input: {
    readonly messageId: string;
    readonly recoverySignal: TeamExecutionRecoverySignalV1;
  }) => Promise<void>;
}

/**
 * Coordinator-side bridge. It admits references and settles exact results but
 * never grants execution or action authority.
 */
export function createTeamExecutionCoordinatorExchangeHandlerV1(
  options: TeamExecutionCoordinatorExchangeHandlerOptionsV1,
): TeamExecutionExchangeHandlerV1 {
  if (
    !options?.execution ||
    typeof options.execution.settleStep !== "function" ||
    !options.artifacts ||
    typeof options.artifacts.ensureAvailable !== "function" ||
    typeof options.onRecovery !== "function"
  )
    throw new TypeError(
      "team execution coordinator exchange ports are required",
    );
  return createTeamExecutionExchangeRouterV1({
    async onDispatch() {
      throw new TypeError("coordinator cannot consume a remote dispatch");
    },
    async onArtifactAvailable({ artifact }) {
      if (!(await options.artifacts.ensureAvailable(artifact)))
        throw new Error("announced team execution artifact is unavailable");
    },
    async onResult({ result }) {
      for (const artifact of result.artifacts) {
        if (!(await options.artifacts.ensureAvailable(artifact)))
          throw new Error("team execution result artifact is unavailable");
      }
      await options.execution.settleStep(result);
    },
    async onRecovery({ messageId, recoverySignal }) {
      await options.onRecovery({ messageId, recoverySignal });
    },
  });
}

export interface TeamExecutionMemberExchangeHandlerOptionsV1 {
  readonly executor: TeamMemberExecutionPortV1;
  readonly artifacts: TeamExecutionArtifactPortV1;
  readonly resolveDependencyArtifact: (
    digest: PlanningDigestV1,
  ) => Promise<TeamExecutionArtifactV1 | null>;
  /** Derive stable response ids from sourceMessage.messageId and payload identity. */
  readonly respond: (input: {
    readonly sourceMessage: TeamExecutionExchangeMessageV1;
    readonly payload:
      | {
          readonly kind: "artifact_available";
          readonly artifact: TeamExecutionArtifactV1;
        }
      | { readonly kind: "result"; readonly result: TeamExecutionStepResultV1 };
  }) => Promise<void>;
  readonly onRecovery: (input: {
    readonly messageId: string;
    readonly recoverySignal: TeamExecutionRecoverySignalV1;
  }) => Promise<void>;
}

/** Executes only an already-authorized dispatch and emits reference-only replies. */
export function createTeamExecutionMemberExchangeHandlerV1(
  options: TeamExecutionMemberExchangeHandlerOptionsV1,
): TeamExecutionExchangeHandlerV1 {
  if (
    !options?.executor ||
    typeof options.executor.execute !== "function" ||
    !options.artifacts ||
    typeof options.artifacts.publish !== "function" ||
    typeof options.artifacts.ensureAvailable !== "function" ||
    typeof options.resolveDependencyArtifact !== "function" ||
    typeof options.respond !== "function" ||
    typeof options.onRecovery !== "function"
  )
    throw new TypeError("team execution member exchange ports are required");
  return createTeamExecutionExchangeRouterV1({
    async onDispatch({ message, dispatch }) {
      const dependencies: TeamExecutionArtifactV1[] = [];
      for (const digest of dispatch.dependencyArtifactDigests) {
        const artifact = await options.resolveDependencyArtifact(digest);
        if (!artifact || artifact.artifactDigest !== digest)
          throw new Error("team execution dependency artifact is unavailable");
        if (!(await options.artifacts.ensureAvailable(artifact)))
          throw new Error("team execution dependency content is unavailable");
        dependencies.push(artifact);
      }
      const result = await options.executor.execute({
        dispatch,
        dependencyArtifacts: Object.freeze(dependencies),
      });
      for (const artifact of result.artifacts) {
        await options.artifacts.publish(artifact);
        if (!(await options.artifacts.ensureAvailable(artifact)))
          throw new Error("team execution output artifact is unavailable");
        await options.respond({
          sourceMessage: message,
          payload: Object.freeze({ kind: "artifact_available", artifact }),
        });
      }
      await options.respond({
        sourceMessage: message,
        payload: Object.freeze({ kind: "result", result }),
      });
    },
    async onArtifactAvailable() {
      throw new TypeError(
        "member cannot consume an output artifact announcement",
      );
    },
    async onResult() {
      throw new TypeError("member cannot consume a remote result");
    },
    async onRecovery({ messageId, recoverySignal }) {
      await options.onRecovery({ messageId, recoverySignal });
    },
  });
}

/**
 * Adds the critical extension to caller-owned Mesh envelope fields. The caller
 * remains responsible for choosing a semantically appropriate core payload,
 * signing the complete envelope and durably enqueueing it.
 */
export function attachTeamExecutionExchangeMeshExtensionV1(input: {
  readonly message: TeamExecutionExchangeMessageV1;
  readonly extensions?: Readonly<Record<string, MeshJsonValue>>;
  readonly criticalExtensions?: readonly string[];
}): {
  readonly extensions: Readonly<Record<string, MeshJsonValue>>;
  readonly criticalExtensions: readonly string[];
} {
  const message = validateTeamExecutionExchangeMessageV1(input.message);
  if (
    Object.hasOwn(
      input.extensions ?? {},
      TEAM_EXECUTION_EXCHANGE_MESH_EXTENSION_V1,
    )
  )
    throw new TypeError("team execution exchange Mesh extension conflicts");
  const critical = input.criticalExtensions ?? [];
  if (critical.includes(TEAM_EXECUTION_EXCHANGE_MESH_EXTENSION_V1))
    throw new TypeError("team execution exchange critical extension conflicts");
  return Object.freeze({
    extensions: Object.freeze({
      ...(input.extensions ?? {}),
      [TEAM_EXECUTION_EXCHANGE_MESH_EXTENSION_V1]:
        createTeamExecutionExchangeMeshExtensionV1(message),
    }),
    criticalExtensions: Object.freeze([
      ...critical,
      TEAM_EXECUTION_EXCHANGE_MESH_EXTENSION_V1,
    ]),
  });
}

/** Narrow function adapter for an application-owned signer/durable Mesh outbox. */
export function createTeamExecutionExchangeOutboundPortV1(
  publish: TeamExecutionExchangeOutboundPortV1["publish"],
): TeamExecutionExchangeOutboundPortV1 {
  if (typeof publish !== "function")
    throw new TypeError(
      "team execution exchange outbound publisher is required",
    );
  return Object.freeze({ publish });
}
