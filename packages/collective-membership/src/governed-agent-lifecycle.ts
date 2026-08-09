import {
  createCollectiveMembershipConfigurationV1,
  createCollectiveMembershipTransitionProposalV1,
} from "./configuration.js";
import type {
  CollectiveMembershipChangeV1,
  CollectiveMembershipClockV1,
  CollectiveMembershipConfigurationV1,
  CollectiveMembershipMemberV1,
  CollectiveMembershipRegistryV1,
} from "./contracts.js";
import { CollectiveMembershipClientV1 } from "./client.js";
import type {
  AgentCreationCertificateV1,
  AgentCreationRequestV1,
  AgentLineageRecordV1,
  AgentMembershipEnrollmentPortV1,
} from "./agent-lineage.js";
import {
  GovernedAgentLineageRuntimeV1,
  invokeGovernedAgentLineageCompleteRetirementV1,
  invokeGovernedAgentLineageCreateV1,
  invokeGovernedAgentLineageEnrollV1,
  invokeGovernedAgentLineageLoadV1,
  invokeGovernedAgentLineageReconcileRetirementV1,
  invokeGovernedAgentLineageTerminateV1,
  isGovernedAgentLineageRuntimeV1,
} from "./agent-lineage.js";

export interface GovernedAgentEligibilityDecisionV1 {
  readonly eligible: boolean;
  readonly reasonCode:
    | "active_member"
    | "agent_unknown"
    | "agent_inactive"
    | "instance_mismatch"
    | "capability_unavailable"
    | "membership_unavailable";
  readonly agent: AgentLineageRecordV1 | null;
  readonly membershipEpoch: number | null;
  readonly membershipConfigurationDigest: string | null;
}

export interface GovernedAgentLifecycleTelemetryPortV1 {
  record(event: {
    readonly category: "membership";
    readonly operation: "agent.activated" | "agent.retired";
    readonly outcome: "completed";
    readonly logicalTimeMs: number;
    readonly operationDigest: string;
    readonly evidenceDigests: readonly string[];
    readonly correlation?: {
      readonly missionId: string;
      readonly cycleId?: string;
    };
  }): Promise<void>;
}

/**
 * Turns governed lineage joins and removals into quorum-certified membership
 * transitions. The configuration in a creation certificate authorizes the
 * operation; a successful join is committed in its immediate successor epoch.
 */
export class ReferenceAgentMembershipEnrollmentPortV1 implements AgentMembershipEnrollmentPortV1 {
  readonly #transitionTtlMs: number;
  readonly #currentMembership: CollectiveMembershipRegistryV1["current"];
  readonly #membershipConfiguration: CollectiveMembershipRegistryV1["configuration"];
  readonly #transition: CollectiveMembershipClientV1["transition"];
  readonly #now: CollectiveMembershipClockV1["now"];
  readonly #crypto: Crypto | undefined;

  constructor(options: {
    readonly client: CollectiveMembershipClientV1;
    readonly registry: CollectiveMembershipRegistryV1;
    readonly clock: CollectiveMembershipClockV1;
    readonly transitionTtlMs?: number;
    readonly crypto?: Crypto;
  }) {
    if (!options || typeof options !== "object")
      throw new TypeError("agent membership enrollment options are required");
    const client = options.client;
    const registry = options.registry;
    const clock = options.clock;
    const transitionTtlMs = options.transitionTtlMs;
    const crypto = options.crypto;
    const transition = client?.transition;
    const clientOptions = client?.options;
    const clientRegistry = clientOptions?.registry;
    const currentMembership = registry?.current;
    const membershipConfiguration = registry?.configuration;
    const now = clock?.now;
    if (!client || typeof transition !== "function")
      throw new TypeError("collective membership client is required");
    if (
      !registry ||
      typeof currentMembership !== "function" ||
      typeof membershipConfiguration !== "function"
    )
      throw new TypeError("collective membership registry is required");
    if (!clock || typeof now !== "function")
      throw new TypeError("collective membership clock is required");
    if (clientRegistry !== registry)
      throw new TypeError(
        "membership client and enrollment adapter must share a registry",
      );
    this.#currentMembership = () => currentMembership.call(registry);
    this.#membershipConfiguration = (epoch) =>
      membershipConfiguration.call(registry, epoch);
    this.#transition = (proposal) => transition.call(client, proposal);
    this.#now = () => now.call(clock);
    this.#crypto = crypto;
    this.#transitionTtlMs = positiveInteger(
      transitionTtlMs ?? 30_000,
      "transitionTtlMs",
      300_000,
    );
  }

  async enroll(
    input: Parameters<AgentMembershipEnrollmentPortV1["enroll"]>[0],
  ) {
    const current = this.#currentMembership();
    const replay = this.#enrollmentSuccessor(input);
    if (replay) return replay;
    const existing = current.members.find(
      ({ peerId }) => peerId === input.agent.peerId,
    );
    if (existing) {
      if (!sameMember(existing, input.member))
        throw new Error(
          "governed agent membership identity conflicts with an active peer",
        );
      throw new Error(
        "governed agent enrollment replay lacks its certified historical successor",
      );
    }
    if (
      input.agent.membershipConfigurationDigest !==
        current.configurationDigest ||
      input.agent.membershipEpoch !== current.epoch
    )
      throw new Error(
        "governed agent creation authorization is no longer current",
      );
    if (
      input.change.kind !== "join" ||
      input.change.peerId !== input.agent.peerId
    )
      throw new TypeError(
        "governed agent enrollment requires its exact join change",
      );
    const next = await this.#nextConfiguration(current, [
      ...current.members,
      input.member,
    ]);
    const proposal = await this.#proposal(current, next, input.change);
    const certificate = await this.#transition(proposal);
    if (
      !certificate ||
      certificate.proposal.nextConfiguration.configurationDigest !==
        next.configurationDigest ||
      certificate.proposal.nextConfiguration.epoch !== next.epoch
    )
      throw new Error("governed agent membership join was not certified");
    return Object.freeze({
      enrolled: true as const,
      authorizationConfigurationDigest: current.configurationDigest,
      authorizationEpoch: current.epoch,
      membershipConfigurationDigest: next.configurationDigest,
      membershipEpoch: next.epoch,
    });
  }

  async remove(
    input: Parameters<AgentMembershipEnrollmentPortV1["remove"]>[0],
  ) {
    const current = this.#currentMembership();
    const existing = current.members.find(
      ({ peerId }) => peerId === input.agent.peerId,
    );
    if (!existing) {
      const replay = this.#removalSuccessor(input.agent, current.epoch);
      if (replay) return replay;
      throw new Error(
        "governed agent membership removal lacks its certified historical successor",
      );
    }
    if (existing.instanceId !== input.agent.instanceId)
      throw new Error(
        "governed agent removal instance does not match active membership",
      );
    const next = await this.#nextConfiguration(
      current,
      current.members.filter(({ peerId }) => peerId !== input.agent.peerId),
    );
    const proposal = await this.#proposal(current, next, {
      kind: "leave",
      peerId: input.agent.peerId,
    });
    const certificate = await this.#transition(proposal);
    if (
      !certificate ||
      certificate.proposal.nextConfiguration.configurationDigest !==
        next.configurationDigest ||
      certificate.proposal.nextConfiguration.epoch !== next.epoch
    )
      throw new Error("governed agent membership removal was not certified");
    return Object.freeze({
      removed: true as const,
      membershipConfigurationDigest: next.configurationDigest,
      membershipEpoch: next.epoch,
    });
  }

  #enrollmentSuccessor(
    input: Parameters<AgentMembershipEnrollmentPortV1["enroll"]>[0],
  ): Awaited<ReturnType<AgentMembershipEnrollmentPortV1["enroll"]>> | null {
    const authorizationEpoch = input.agent.membershipEpoch;
    const authorizationConfigurationDigest =
      input.agent.membershipConfigurationDigest;
    if (
      authorizationEpoch === null ||
      authorizationConfigurationDigest === null
    )
      return null;
    const authorization = this.#membershipConfiguration(authorizationEpoch);
    const successor = this.#membershipConfiguration(authorizationEpoch + 1);
    const priorMember = authorization?.members.find(
      ({ peerId }) => peerId === input.agent.peerId,
    );
    const enrolledMember = successor?.members.find(
      ({ peerId }) => peerId === input.agent.peerId,
    );
    if (
      !authorization ||
      authorization.configurationDigest !== authorizationConfigurationDigest ||
      !successor ||
      successor.previousConfigurationDigest !==
        authorizationConfigurationDigest ||
      priorMember ||
      !enrolledMember ||
      !sameMember(enrolledMember, input.member)
    )
      return null;
    return Object.freeze({
      enrolled: true as const,
      authorizationConfigurationDigest,
      authorizationEpoch,
      membershipConfigurationDigest: successor.configurationDigest,
      membershipEpoch: successor.epoch,
    });
  }

  #removalSuccessor(
    agent: AgentLineageRecordV1,
    currentEpoch: number,
  ): Awaited<ReturnType<AgentMembershipEnrollmentPortV1["remove"]>> | null {
    const enrolledAtEpoch = agent.membershipEpoch;
    if (enrolledAtEpoch === null) return null;
    for (let epoch = currentEpoch; epoch > enrolledAtEpoch; epoch -= 1) {
      const successor = this.#membershipConfiguration(epoch);
      const predecessor = this.#membershipConfiguration(epoch - 1);
      if (!successor || !predecessor) continue;
      const prior = predecessor.members.find(
        ({ peerId }) => peerId === agent.peerId,
      );
      const next = successor.members.find(
        ({ peerId }) => peerId === agent.peerId,
      );
      if (
        prior?.instanceId === agent.instanceId &&
        !next &&
        successor.previousConfigurationDigest ===
          predecessor.configurationDigest
      )
        return Object.freeze({
          removed: true as const,
          membershipConfigurationDigest: successor.configurationDigest,
          membershipEpoch: successor.epoch,
        });
    }
    return null;
  }

  async #nextConfiguration(
    current: CollectiveMembershipConfigurationV1,
    members: readonly CollectiveMembershipMemberV1[],
  ): Promise<CollectiveMembershipConfigurationV1> {
    if (members.length < 1)
      throw new Error(
        "governed lifecycle cannot remove the final collective member",
      );
    const reading = this.#now();
    const effectiveAtMs = Math.max(
      Date.parse(reading.wallTime),
      Date.parse(current.effectiveAt) + 1,
      ...members.flatMap(({ keys }) =>
        keys.map(({ validFrom }) => Date.parse(validFrom)),
      ),
    );
    if (!Number.isFinite(effectiveAtMs))
      throw new TypeError("membership transition time is invalid");
    return createCollectiveMembershipConfigurationV1(
      {
        tenantId: current.tenantId,
        meshId: current.meshId,
        policyDomainId: current.policyDomainId,
        epoch: current.epoch + 1,
        previousConfigurationDigest: current.configurationDigest,
        effectiveAt: new Date(effectiveAtMs).toISOString(),
        effectiveAtLogicalMs: Math.max(
          current.effectiveAtLogicalMs + 1,
          reading.logicalTimeMs,
        ),
        members,
      },
      this.#crypto,
    );
  }

  async #proposal(
    current: CollectiveMembershipConfigurationV1,
    next: CollectiveMembershipConfigurationV1,
    change: CollectiveMembershipChangeV1,
  ) {
    const reading = this.#now();
    return createCollectiveMembershipTransitionProposalV1({
      current,
      next,
      change,
      proposedAtLogicalMs: reading.logicalTimeMs,
      expiresAtLogicalMs: safeAdd(reading.logicalTimeMs, this.#transitionTtlMs),
      crypto: this.#crypto,
    });
  }
}

type GovernedAgentCreateAndEnrollInputV1 = {
  readonly request: AgentCreationRequestV1;
  readonly certificate: AgentCreationCertificateV1;
  readonly activeKeyProof: Parameters<
    GovernedAgentLineageRuntimeV1["enroll"]
  >[0]["activeKeyProof"];
  readonly logicalTimeMs: number;
  readonly signal?: AbortSignal;
  readonly correlation?: {
    readonly missionId: string;
    readonly cycleId?: string;
  };
};

type GovernedAgentRetirePeerInputV1 = {
  readonly peerId: string;
  readonly reasonCode: string;
  readonly cascade: boolean;
  readonly logicalTimeMs: number;
};

type GovernedAgentRetirementV1 = {
  readonly retired: true;
  readonly peerId: string;
  readonly membershipConfigurationDigest: `sha256:${string}`;
  readonly membershipEpoch: number;
  readonly retirementDigest: `sha256:${string}`;
  readonly retiredAtLogicalMs: number;
};

type GovernedAgentEligibilityInputV1 = {
  readonly peerId: string;
  readonly instanceId?: string;
  readonly capabilityKey?: string;
};

interface GovernedAgentLifecycleInvokersV1 {
  readonly lineage: GovernedAgentLineageRuntimeV1;
  readonly registry: CollectiveMembershipRegistryV1;
  currentMembership(): CollectiveMembershipConfigurationV1;
  createAndEnroll(
    input: GovernedAgentCreateAndEnrollInputV1,
  ): Promise<AgentLineageRecordV1>;
  reconcileCreateAndEnroll(
    input: GovernedAgentCreateAndEnrollInputV1,
  ): Promise<AgentLineageRecordV1>;
  retirePeer(
    input: GovernedAgentRetirePeerInputV1,
  ): Promise<GovernedAgentRetirementV1>;
  reconcileRetirement(
    input: GovernedAgentRetirePeerInputV1,
  ): Promise<GovernedAgentRetirementV1>;
  eligibility(
    input: GovernedAgentEligibilityInputV1,
  ): Promise<GovernedAgentEligibilityDecisionV1>;
}

const governedAgentLifecycleInvokersV1 = new WeakMap<
  object,
  GovernedAgentLifecycleInvokersV1
>();

/**
 * Reference lifecycle facade for create+enroll, idempotent retirement and the
 * exact active-lineage/current-membership eligibility predicate used by hosts.
 */
export class GovernedAgentLifecycleRuntimeV1 {
  readonly #lineage: GovernedAgentLineageRuntimeV1;
  readonly #registry: CollectiveMembershipRegistryV1;
  readonly #currentMembership: CollectiveMembershipRegistryV1["current"];
  readonly #recordTelemetry:
    GovernedAgentLifecycleTelemetryPortV1["record"] | null;

  constructor(options: {
    readonly lineage: GovernedAgentLineageRuntimeV1;
    readonly registry: CollectiveMembershipRegistryV1;
    readonly telemetry?: GovernedAgentLifecycleTelemetryPortV1;
  }) {
    if (!options || typeof options !== "object")
      throw new TypeError("governed agent lifecycle options are required");
    const lineage = options.lineage;
    const registry = options.registry;
    const telemetry = options.telemetry;
    const currentMembership = registry?.current;
    const recordTelemetry = telemetry?.record;
    if (!isGovernedAgentLineageRuntimeV1(lineage))
      throw new TypeError(
        "concrete governed agent lineage runtime is required",
      );
    if (!registry || typeof currentMembership !== "function")
      throw new TypeError("collective membership registry is required");
    if (telemetry && typeof recordTelemetry !== "function")
      throw new TypeError("governed lifecycle telemetry port is invalid");
    this.#lineage = lineage;
    this.#registry = registry;
    this.#currentMembership = () => currentMembership.call(registry);
    if (telemetry && recordTelemetry) {
      this.#recordTelemetry = (event) => recordTelemetry.call(telemetry, event);
    } else this.#recordTelemetry = null;
    const invokers: GovernedAgentLifecycleInvokersV1 = Object.freeze({
      lineage: this.#lineage,
      registry: this.#registry,
      currentMembership: () => this.#currentMembership(),
      createAndEnroll: (input: GovernedAgentCreateAndEnrollInputV1) =>
        this.#createAndEnroll(input),
      reconcileCreateAndEnroll: (input: GovernedAgentCreateAndEnrollInputV1) =>
        this.#createAndEnroll(input),
      retirePeer: (input: GovernedAgentRetirePeerInputV1) =>
        this.#retirePeer(input),
      reconcileRetirement: (input: GovernedAgentRetirePeerInputV1) =>
        this.#reconcileRetirement(input),
      eligibility: (input: GovernedAgentEligibilityInputV1) =>
        this.#eligibility(input),
    });
    governedAgentLifecycleInvokersV1.set(this, invokers);
    // Generic ports may still call public methods. Immutable own functions
    // route those calls to the same module-owned implementation.
    Object.defineProperties(this, {
      createAndEnroll: immutableInvoker(invokers.createAndEnroll),
      reconcileCreateAndEnroll: immutableInvoker(
        invokers.reconcileCreateAndEnroll,
      ),
      retirePeer: immutableInvoker(invokers.retirePeer),
      reconcileRetirement: immutableInvoker(invokers.reconcileRetirement),
      eligibility: immutableInvoker(invokers.eligibility),
    });
  }

  async createAndEnroll(input: {
    readonly request: AgentCreationRequestV1;
    readonly certificate: AgentCreationCertificateV1;
    readonly activeKeyProof: Parameters<
      GovernedAgentLineageRuntimeV1["enroll"]
    >[0]["activeKeyProof"];
    readonly logicalTimeMs: number;
    readonly signal?: AbortSignal;
    readonly correlation?: {
      readonly missionId: string;
      readonly cycleId?: string;
    };
  }): Promise<AgentLineageRecordV1> {
    return invokeGovernedAgentLifecycleCreateAndEnrollV1(this, input);
  }

  /** Public crash-recovery entrypoint for a reserved create→enroll saga. */
  async reconcileCreateAndEnroll(
    input: GovernedAgentCreateAndEnrollInputV1,
  ): Promise<AgentLineageRecordV1> {
    return lifecycleInvokers(this).reconcileCreateAndEnroll(input);
  }

  async #createAndEnroll(
    input: GovernedAgentCreateAndEnrollInputV1,
  ): Promise<AgentLineageRecordV1> {
    const pending = await invokeGovernedAgentLineageCreateV1(
      this.#lineage,
      input,
    );
    const active = await invokeGovernedAgentLineageEnrollV1(this.#lineage, {
      agentId: pending.agentId,
      activeKeyProof: input.activeKeyProof,
      logicalTimeMs: input.logicalTimeMs,
    });
    await bestEffortTelemetry(this.#recordTelemetry, {
      category: "membership",
      operation: "agent.activated",
      outcome: "completed",
      logicalTimeMs: input.logicalTimeMs,
      operationDigest: active.lineageDigest,
      evidenceDigests: [
        active.creationCertificateDigest,
        active.membershipConfigurationDigest!,
      ].sort(),
      ...(input.correlation ? { correlation: input.correlation } : {}),
    });
    return active;
  }

  async retirePeer(input: {
    readonly peerId: string;
    readonly reasonCode: string;
    readonly cascade: boolean;
    readonly logicalTimeMs: number;
  }): Promise<{
    readonly retired: true;
    readonly peerId: string;
    readonly membershipConfigurationDigest: `sha256:${string}`;
    readonly membershipEpoch: number;
    readonly retirementDigest: `sha256:${string}`;
    readonly retiredAtLogicalMs: number;
  }> {
    return invokeGovernedAgentLifecycleRetirePeerV1(this, input);
  }

  /** Public crash-recovery entrypoint for membership removal and termination. */
  async reconcileRetirement(
    input: GovernedAgentRetirePeerInputV1,
  ): Promise<GovernedAgentRetirementV1> {
    return lifecycleInvokers(this).reconcileRetirement(input);
  }

  async #reconcileRetirement(
    input: GovernedAgentRetirePeerInputV1,
  ): Promise<GovernedAgentRetirementV1> {
    const state = await invokeGovernedAgentLineageLoadV1(this.#lineage);
    const agent = state.agents.find(({ peerId }) => peerId === input.peerId);
    if (!agent) throw new Error("governed agent peer is unknown");
    if (agent.status !== "retiring") return this.#retirePeer(input);
    if (
      !agent.retirementOperationId ||
      agent.retirementReasonCode !== input.reasonCode
    )
      throw new TypeError("governed agent retirement reconciliation changed");
    await invokeGovernedAgentLineageReconcileRetirementV1(this.#lineage, {
      operationId: agent.retirementOperationId,
      logicalTimeMs: input.logicalTimeMs,
    });
    return this.#retirePeer(input);
  }

  async #retirePeer(
    input: GovernedAgentRetirePeerInputV1,
  ): Promise<GovernedAgentRetirementV1> {
    const state = await invokeGovernedAgentLineageLoadV1(this.#lineage);
    let agent = state.agents.find(({ peerId }) => peerId === input.peerId);
    if (!agent) throw new Error("governed agent peer is unknown");
    if (agent.status === "retiring") {
      if (
        !agent.retirementOperationId ||
        agent.retirementReasonCode !== input.reasonCode
      )
        throw new TypeError("governed agent retirement reconciliation changed");
      const reconciled = await invokeGovernedAgentLineageReconcileRetirementV1(
        this.#lineage,
        {
          operationId: agent.retirementOperationId,
          logicalTimeMs: input.logicalTimeMs,
        },
      );
      agent = reconciled.agents.find(({ peerId }) => peerId === input.peerId);
      if (!agent)
        throw new Error("governed agent peer disappeared during retirement");
    }
    const terminal =
      agent.status === "terminated"
        ? agent
        : (
            await (agent.status === "suspended" || agent.status === "revoked"
              ? invokeGovernedAgentLineageCompleteRetirementV1(this.#lineage, {
                  agentId: agent.agentId,
                  reasonCode: input.reasonCode,
                  cascade: input.cascade,
                  logicalTimeMs: input.logicalTimeMs,
                })
              : invokeGovernedAgentLineageTerminateV1(this.#lineage, {
                  agentId: agent.agentId,
                  reasonCode: input.reasonCode,
                  cascade: input.cascade,
                  logicalTimeMs: input.logicalTimeMs,
                }))
          ).agents.find(({ agentId }) => agentId === agent.agentId)!;
    const currentMembership = this.#currentMembership();
    if (currentMembership.members.some(({ peerId }) => peerId === input.peerId))
      throw new Error(
        "governed agent remained in active membership after retirement",
      );
    if (
      terminal.retirementMembershipConfigurationDigest === null ||
      terminal.retirementMembershipConfigurationDigest === undefined ||
      terminal.retirementMembershipEpoch === null ||
      terminal.retirementMembershipEpoch === undefined
    )
      throw new Error(
        "governed agent retirement lacks its certified membership successor",
      );
    const result = Object.freeze({
      retired: true as const,
      peerId: input.peerId,
      membershipConfigurationDigest: asDigest(
        terminal.retirementMembershipConfigurationDigest,
      ),
      membershipEpoch: terminal.retirementMembershipEpoch,
      retirementDigest: asDigest(terminal.lineageDigest),
      retiredAtLogicalMs: terminal.terminatedAtLogicalMs ?? input.logicalTimeMs,
    });
    await bestEffortTelemetry(this.#recordTelemetry, {
      category: "membership",
      operation: "agent.retired",
      outcome: "completed",
      logicalTimeMs: input.logicalTimeMs,
      operationDigest: result.retirementDigest,
      evidenceDigests: [
        result.membershipConfigurationDigest,
        result.retirementDigest,
      ].sort(),
    });
    return result;
  }

  async eligibility(input: {
    readonly peerId: string;
    readonly instanceId?: string;
    readonly capabilityKey?: string;
  }): Promise<GovernedAgentEligibilityDecisionV1> {
    return invokeGovernedAgentLifecycleEligibilityV1(this, input);
  }

  async #eligibility(
    input: GovernedAgentEligibilityInputV1,
  ): Promise<GovernedAgentEligibilityDecisionV1> {
    const state = await invokeGovernedAgentLineageLoadV1(this.#lineage);
    const agent =
      state.agents.find(({ peerId }) => peerId === input.peerId) ?? null;
    if (!agent) return decision(false, "agent_unknown", null, null);
    if (agent.status !== "active")
      return decision(false, "agent_inactive", agent, null);
    if (input.instanceId && input.instanceId !== agent.instanceId)
      return decision(false, "instance_mismatch", agent, null);
    if (
      input.capabilityKey &&
      !agent.capabilityKeys.includes(input.capabilityKey)
    )
      return decision(false, "capability_unavailable", agent, null);
    const membership = this.#currentMembership();
    const member = membership.members.find(
      ({ peerId }) => peerId === input.peerId,
    );
    if (!member || member.instanceId !== agent.instanceId)
      return decision(false, "membership_unavailable", agent, null);
    return decision(true, "active_member", agent, membership);
  }
}

/**
 * Nominal runtime check used by closed reference compositions. The backing
 * brand is module-private, so a structural object cannot claim that it ran the
 * certified lineage and membership lifecycle.
 */
export function isGovernedAgentLifecycleRuntimeV1(
  value: unknown,
): value is GovernedAgentLifecycleRuntimeV1 {
  return (
    typeof value === "object" &&
    value !== null &&
    governedAgentLifecycleInvokersV1.has(value)
  );
}

/** Returns the exact lineage runtime captured by the lifecycle constructor. */
export function governedAgentLifecycleLineageV1(
  runtime: GovernedAgentLifecycleRuntimeV1,
): GovernedAgentLineageRuntimeV1 {
  return lifecycleInvokers(runtime).lineage;
}

/** Returns the exact membership registry captured by the lifecycle constructor. */
export function governedAgentLifecycleRegistryV1(
  runtime: GovernedAgentLifecycleRuntimeV1,
): CollectiveMembershipRegistryV1 {
  return lifecycleInvokers(runtime).registry;
}

/** Reads membership through the exact registry method captured by lifecycle construction. */
export function invokeGovernedAgentLifecycleCurrentMembershipV1(
  runtime: GovernedAgentLifecycleRuntimeV1,
): CollectiveMembershipConfigurationV1 {
  return lifecycleInvokers(runtime).currentMembership();
}

/** Invokes the certified create+enroll implementation captured at construction. */
export function invokeGovernedAgentLifecycleCreateAndEnrollV1(
  runtime: GovernedAgentLifecycleRuntimeV1,
  input: Parameters<GovernedAgentLifecycleRuntimeV1["createAndEnroll"]>[0],
): ReturnType<GovernedAgentLifecycleRuntimeV1["createAndEnroll"]> {
  return lifecycleInvokers(runtime).createAndEnroll(input);
}

export function invokeGovernedAgentLifecycleReconcileCreateAndEnrollV1(
  runtime: GovernedAgentLifecycleRuntimeV1,
  input: Parameters<
    GovernedAgentLifecycleRuntimeV1["reconcileCreateAndEnroll"]
  >[0],
): ReturnType<GovernedAgentLifecycleRuntimeV1["reconcileCreateAndEnroll"]> {
  return lifecycleInvokers(runtime).reconcileCreateAndEnroll(input);
}

/** Invokes retirement without consulting a replaceable public method. */
export function invokeGovernedAgentLifecycleRetirePeerV1(
  runtime: GovernedAgentLifecycleRuntimeV1,
  input: Parameters<GovernedAgentLifecycleRuntimeV1["retirePeer"]>[0],
): ReturnType<GovernedAgentLifecycleRuntimeV1["retirePeer"]> {
  return lifecycleInvokers(runtime).retirePeer(input);
}

export function invokeGovernedAgentLifecycleReconcileRetirementV1(
  runtime: GovernedAgentLifecycleRuntimeV1,
  input: Parameters<GovernedAgentLifecycleRuntimeV1["reconcileRetirement"]>[0],
): ReturnType<GovernedAgentLifecycleRuntimeV1["reconcileRetirement"]> {
  return lifecycleInvokers(runtime).reconcileRetirement(input);
}

/** Invokes current-lineage eligibility without structural dispatch. */
export function invokeGovernedAgentLifecycleEligibilityV1(
  runtime: GovernedAgentLifecycleRuntimeV1,
  input: Parameters<GovernedAgentLifecycleRuntimeV1["eligibility"]>[0],
): ReturnType<GovernedAgentLifecycleRuntimeV1["eligibility"]> {
  return lifecycleInvokers(runtime).eligibility(input);
}

function lifecycleInvokers(
  runtime: GovernedAgentLifecycleRuntimeV1,
): GovernedAgentLifecycleInvokersV1 {
  const invokers =
    typeof runtime === "object" && runtime !== null
      ? governedAgentLifecycleInvokersV1.get(runtime)
      : undefined;
  if (!invokers)
    throw new TypeError(
      "concrete governed agent lifecycle runtime is required",
    );
  return invokers;
}

function immutableInvoker<T extends (...args: never[]) => unknown>(
  value: T,
): PropertyDescriptor {
  return {
    value,
    writable: false,
    configurable: false,
    enumerable: false,
  };
}

function decision(
  eligible: boolean,
  reasonCode: GovernedAgentEligibilityDecisionV1["reasonCode"],
  agent: AgentLineageRecordV1 | null,
  membership: CollectiveMembershipConfigurationV1 | null,
): GovernedAgentEligibilityDecisionV1 {
  return Object.freeze({
    eligible,
    reasonCode,
    agent,
    membershipEpoch: membership?.epoch ?? null,
    membershipConfigurationDigest: membership?.configurationDigest ?? null,
  });
}

function sameMember(
  left: CollectiveMembershipMemberV1,
  right: CollectiveMembershipMemberV1,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function positiveInteger(
  value: unknown,
  label: string,
  maximum: number,
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 1 ||
    (value as number) > maximum
  )
    throw new RangeError(`${label} is out of range`);
  return value as number;
}

function safeAdd(left: number, right: number): number {
  const value = left + right;
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError("membership transition deadline overflow");
  return value;
}

function asDigest(value: string): `sha256:${string}` {
  if (!/^sha256:[0-9a-f]{64}$/u.test(value))
    throw new TypeError("governed lifecycle digest is invalid");
  return value as `sha256:${string}`;
}

async function bestEffortTelemetry(
  record: GovernedAgentLifecycleTelemetryPortV1["record"] | null,
  event: Parameters<GovernedAgentLifecycleTelemetryPortV1["record"]>[0],
): Promise<void> {
  if (!record) return;
  try {
    await record(event);
  } catch {
    // Observability is never an authority or a lifecycle commit input.
  }
}
