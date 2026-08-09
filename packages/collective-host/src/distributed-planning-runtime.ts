import {
  ReferenceMissionDecomposerV1,
  mergeMissionDecompositionsV1,
  validateDistributedDecompositionPolicyV1,
  validateMissionDecompositionGraphV1,
  type DistributedDecompositionPolicyV1,
  type MissionDecompositionGraphV1,
  type MissionDecompositionMergeV1,
  type MissionDecompositionRequestV1,
  type PlanningDigestV1,
} from "@agentplat/collective-planning";
import {
  allocateStrategicallyV1,
  createStrategicBidCommitmentV1,
  createStrategicBidRevealV1,
  settleStrategicAllocationV1,
  validateStrategicAllocationPolicyV1,
  validateStrategicAllocationPlanV1,
  type StrategicAllocationCandidateV1,
  type StrategicAllocationEvidencePortV1,
  type StrategicAllocationPlanV1,
  type StrategicAllocationPolicyV1,
  type StrategicAllocationSettlementV1,
  type StrategicAllocationTaskV1,
  type StrategicBidCommitmentV1,
  type StrategicBidRevealV1,
  type StrategicCapabilityAttestationV1,
  type StrategicPeerProjectionV1,
} from "@agentplat/collective-runtime/strategic-allocation";

import {
  DistributedCollectiveProtocolRuntimeV1,
  isDistributedCollectiveProtocolRuntimeV1,
  type DistributedCollectiveMessageV1,
} from "./distributed-collective-protocol.js";

export interface DistributedPlanningCycleV1 {
  readonly schemaVersion: 1;
  readonly cycleId: string;
  readonly missionIntentId: string;
  readonly intentRevision: number;
  readonly intentDigest: PlanningDigestV1;
  readonly allocationId: string;
  readonly graphProposalCloseAtLogicalMs: number;
  readonly bidCommitmentCloseAtLogicalMs: number;
  readonly bidRevealCloseAtLogicalMs: number;
}

export interface DistributedPlanningPublicationOptionsV1 {
  readonly logicalTimeMs: number;
  readonly lifetime: number;
  readonly fanout?: number;
}

export interface DistributedPlanningGraphPayloadV1 {
  readonly schemaVersion: 1;
  readonly payloadKind: "candidate" | "reconciled";
  readonly cycle: DistributedPlanningCycleV1;
  readonly graph: MissionDecompositionGraphV1;
  readonly merge: MissionDecompositionMergeV1 | null;
}

export interface DistributedPlanningCommitmentPayloadV1 {
  readonly schemaVersion: 1;
  readonly cycle: DistributedPlanningCycleV1;
  readonly graphDigest: PlanningDigestV1;
  readonly commitment: StrategicBidCommitmentV1;
}

export interface DistributedPlanningRevealPayloadV1 {
  readonly schemaVersion: 1;
  readonly cycle: DistributedPlanningCycleV1;
  readonly graphDigest: PlanningDigestV1;
  readonly reveal: StrategicBidRevealV1;
  readonly attestation: StrategicCapabilityAttestationV1;
  readonly peerProjection: StrategicPeerProjectionV1;
}

export interface DistributedPlanningPlanPayloadV1 {
  readonly schemaVersion: 1;
  readonly cycle: DistributedPlanningCycleV1;
  readonly graphDigest: PlanningDigestV1;
  readonly plan: StrategicAllocationPlanV1;
  readonly contributingCommitmentDigests: readonly PlanningDigestV1[];
  readonly contributingRevealDigests: readonly PlanningDigestV1[];
}

export interface DistributedPlanningSettlementPayloadV1 {
  readonly schemaVersion: 1;
  readonly cycle: DistributedPlanningCycleV1;
  readonly settlement: StrategicAllocationSettlementV1;
  readonly outcomeEvidenceDigest: PlanningDigestV1;
}

export type DistributedPlanningCommandLookupResultV1<T> =
  | { readonly found: true; readonly value: T }
  | { readonly found: false };

export const DISTRIBUTED_PLANNING_REPEATABLE_COMMANDS_V1 = Object.freeze([
  "planning:decomposition",
] as const);

/**
 * `planning:decomposition` is a pure factorization and may be repeated only
 * when this nominal lookup proves that no publication was durably recorded.
 */
export function isDistributedPlanningCommandRepeatableV1(
  commandId: string,
): boolean {
  return (DISTRIBUTED_PLANNING_REPEATABLE_COMMANDS_V1 as readonly string[]).includes(
    commandId,
  );
}

/**
 * Peer-local planning over authenticated messages. Peers factorize locally,
 * reconcile the candidates visible in their sparse view, then run a sealed
 * commitment/reveal allocation without a network-wide coordinator.
 */
export class DistributedPlanningRuntimeV1 {
  readonly #decomposer: ReferenceMissionDecomposerV1;
  readonly #decompositionPolicy: DistributedDecompositionPolicyV1;
  readonly #allocationPolicy: StrategicAllocationPolicyV1;
  readonly #allocationEvidence: StrategicAllocationEvidencePortV1;

  constructor(
    readonly options: {
      readonly protocol: DistributedCollectiveProtocolRuntimeV1;
      readonly decompositionPolicy: DistributedDecompositionPolicyV1;
      readonly allocationPolicy: StrategicAllocationPolicyV1;
      readonly allocationEvidence: StrategicAllocationEvidencePortV1;
    },
  ) {
    if (!isDistributedCollectiveProtocolRuntimeV1(options.protocol))
      throw new TypeError(
        "distributed planning requires a genuine collective protocol runtime",
      );
    const verifyCapabilityAttestation =
      options.allocationEvidence?.verifyCapabilityAttestation;
    const verifyPeerProjection =
      options.allocationEvidence?.verifyPeerProjection;
    if (
      typeof verifyCapabilityAttestation !== "function" ||
      typeof verifyPeerProjection !== "function"
    )
      throw new TypeError("allocation evidence port is required");
    this.#decompositionPolicy = validateDistributedDecompositionPolicyV1(
      options.decompositionPolicy,
    );
    this.#allocationPolicy = validateStrategicAllocationPolicyV1(
      options.allocationPolicy,
    );
    this.#decomposer = new ReferenceMissionDecomposerV1(
      this.#decompositionPolicy,
    );
    this.#allocationEvidence = Object.freeze({
      verifyCapabilityAttestation: verifyCapabilityAttestation.bind(
        options.allocationEvidence,
      ),
      verifyPeerProjection: verifyPeerProjection.bind(
        options.allocationEvidence,
      ),
    });
    Object.defineProperty(this, "options", {
      value: Object.freeze({
        ...options,
        decompositionPolicy: this.#decompositionPolicy,
        allocationPolicy: this.#allocationPolicy,
        allocationEvidence: this.#allocationEvidence,
      }),
      writable: false,
      configurable: false,
      enumerable: true,
    });
    installDistributedPlanningRuntimeInvokersV1(this);
  }

  async proposeDecomposition(input: {
    readonly cycle: DistributedPlanningCycleV1;
    readonly request: MissionDecompositionRequestV1;
    readonly publication: DistributedPlanningPublicationOptionsV1;
    readonly commandBindingDigest?: string;
  }): Promise<MissionDecompositionGraphV1> {
    const cycle = validateDistributedPlanningCycleV1(input.cycle);
    validatePublication(input.publication);
    if (input.publication.logicalTimeMs >= cycle.graphProposalCloseAtLogicalMs)
      throw new Error("distributed graph proposal window is closed");
    if (
      input.request.missionIntentId !== cycle.missionIntentId ||
      input.request.intentRevision !== cycle.intentRevision ||
      input.request.intentDigest !== cycle.intentDigest ||
      input.request.logicalTimeMs !== input.publication.logicalTimeMs
    )
      throw new TypeError(
        "distributed graph request is not bound to the cycle",
      );
    const graph = this.#decomposer.factorize(input.request);
    await this.options.protocol.publish({
      cycleId: cycle.cycleId,
      streamId: `planning:${cycle.missionIntentId}`,
      kind: "planning.graph",
      payload: freeze({
        schemaVersion: 1,
        payloadKind: "candidate",
        cycle,
        graph,
        merge: null,
      }),
      ...(input.commandBindingDigest === undefined
        ? {}
        : { commandBindingDigest: input.commandBindingDigest }),
      ...input.publication,
    });
    return graph;
  }

  async reconcileDecompositions(input: {
    readonly cycle: DistributedPlanningCycleV1;
    readonly priorGraph: MissionDecompositionGraphV1 | null;
    readonly publication: DistributedPlanningPublicationOptionsV1;
    readonly commandBindingDigest?: string;
    readonly admittedMessageDigests: readonly string[];
  }): Promise<{
    readonly graph: MissionDecompositionGraphV1;
    readonly merge: MissionDecompositionMergeV1;
  }> {
    const cycle = validateDistributedPlanningCycleV1(input.cycle);
    validatePublication(input.publication);
    if (input.publication.logicalTimeMs < cycle.graphProposalCloseAtLogicalMs)
      throw new Error("distributed graph proposal window is still open");
    if (input.publication.logicalTimeMs >= cycle.bidCommitmentCloseAtLogicalMs)
      throw new Error("distributed graph reconciliation window is closed");
    const admittedMessageDigests = planningDigestSnapshot(
      input.admittedMessageDigests,
    );
    const admittedSet = new Set<string>(admittedMessageDigests);
    const messages = (await this.options.protocol.messages({
      cycleId: cycle.cycleId,
      kind: "planning.graph",
      throughLogicalTimeMs: cycle.graphProposalCloseAtLogicalMs - 1,
    })).filter((message) => admittedSet.has(message.messageDigest));
    const graphs = messages
      .map((message) => graphPayload(message, cycle, this.#decompositionPolicy))
      .filter(
        (payload): payload is DistributedPlanningGraphPayloadV1 =>
          payload !== null && payload.payloadKind === "candidate",
      )
      .map((payload) => payload.graph);
    if (graphs.length === 0)
      throw new Error("no admissible distributed graph candidates");
    const reconciled = mergeMissionDecompositionsV1({
      graphs,
      priorGraph: input.priorGraph,
      policy: this.#decompositionPolicy,
      logicalTimeMs: input.publication.logicalTimeMs,
    });
    await this.options.protocol.publish({
      cycleId: cycle.cycleId,
      streamId: `planning:${cycle.missionIntentId}`,
      kind: "planning.graph",
      payload: freeze({
        schemaVersion: 1,
        payloadKind: "reconciled",
        cycle,
        graph: reconciled.graph,
        merge: reconciled.merge,
      } satisfies DistributedPlanningGraphPayloadV1),
      ...(input.commandBindingDigest === undefined
        ? {}
        : { commandBindingDigest: input.commandBindingDigest }),
      ...input.publication,
    });
    return reconciled;
  }

  async commitBid(input: {
    readonly cycle: DistributedPlanningCycleV1;
    readonly graphDigest: PlanningDigestV1;
    readonly commitment: StrategicBidCommitmentV1;
    readonly publication: DistributedPlanningPublicationOptionsV1;
    readonly commandBindingDigest?: string;
  }): Promise<void> {
    const cycle = validateDistributedPlanningCycleV1(input.cycle);
    validatePublication(input.publication);
    if (
      input.publication.logicalTimeMs < cycle.graphProposalCloseAtLogicalMs ||
      input.publication.logicalTimeMs >= cycle.bidCommitmentCloseAtLogicalMs
    )
      throw new Error("distributed bid commitment is outside its window");
    planningDigest(input.graphDigest, "graphDigest");
    const commitment = validateCommitment(input.commitment);
    if (
      commitment.allocationId !== cycle.allocationId ||
      commitment.committedAtLogicalMs !== input.publication.logicalTimeMs
    )
      throw new TypeError(
        "distributed bid commitment is not bound to the cycle",
      );
    await this.options.protocol.publish({
      cycleId: cycle.cycleId,
      streamId: `allocation:${cycle.allocationId}`,
      kind: "allocation.commitment",
      payload: freeze({
        schemaVersion: 1,
        cycle,
        graphDigest: input.graphDigest,
        commitment,
      }),
      ...(input.commandBindingDigest === undefined
        ? {}
        : { commandBindingDigest: input.commandBindingDigest }),
      ...input.publication,
    });
  }

  async revealBid(input: {
    readonly cycle: DistributedPlanningCycleV1;
    readonly graphDigest: PlanningDigestV1;
    readonly reveal: StrategicBidRevealV1;
    readonly attestation: StrategicCapabilityAttestationV1;
    readonly peerProjection: StrategicPeerProjectionV1;
    readonly publication: DistributedPlanningPublicationOptionsV1;
    readonly commandBindingDigest?: string;
  }): Promise<void> {
    const cycle = validateDistributedPlanningCycleV1(input.cycle);
    validatePublication(input.publication);
    if (
      input.publication.logicalTimeMs < cycle.bidCommitmentCloseAtLogicalMs ||
      input.publication.logicalTimeMs >= cycle.bidRevealCloseAtLogicalMs
    )
      throw new Error("distributed bid reveal is outside its window");
    planningDigest(input.graphDigest, "graphDigest");
    const reveal = validateReveal(input.reveal);
    if (
      reveal.allocationId !== cycle.allocationId ||
      reveal.revealedAtLogicalMs !== input.publication.logicalTimeMs
    )
      throw new TypeError("distributed bid reveal is not bound to the cycle");
    await this.options.protocol.publish({
      cycleId: cycle.cycleId,
      streamId: `allocation:${cycle.allocationId}`,
      kind: "allocation.reveal",
      payload: freeze({
        schemaVersion: 1,
        cycle,
        graphDigest: input.graphDigest,
        reveal,
        attestation: input.attestation,
        peerProjection: input.peerProjection,
      }),
      ...(input.commandBindingDigest === undefined
        ? {}
        : { commandBindingDigest: input.commandBindingDigest }),
      ...input.publication,
    });
  }

  async decideAllocation(input: {
    readonly cycle: DistributedPlanningCycleV1;
    readonly graph: MissionDecompositionGraphV1;
    readonly publication: DistributedPlanningPublicationOptionsV1;
    readonly commandBindingDigest?: string;
    readonly admittedMessageDigests: readonly string[];
  }): Promise<StrategicAllocationPlanV1> {
    const cycle = validateDistributedPlanningCycleV1(input.cycle);
    validatePublication(input.publication);
    if (input.publication.logicalTimeMs < cycle.bidRevealCloseAtLogicalMs)
      throw new Error("distributed bid reveal window is still open");
    const graph = validateMissionDecompositionGraphV1(
      input.graph,
      this.#decompositionPolicy,
    );
    if (
      graph.missionIntentId !== cycle.missionIntentId ||
      graph.intentRevision !== cycle.intentRevision ||
      graph.intentDigest !== cycle.intentDigest
    )
      throw new TypeError(
        "distributed allocation graph is not bound to the cycle",
      );
    const admittedMessageDigests = planningDigestSnapshot(
      input.admittedMessageDigests,
    );
    const admittedSet = new Set<string>(admittedMessageDigests);
    const [commitmentMessages, revealMessages] = (await Promise.all([
      this.options.protocol.messages({
        cycleId: cycle.cycleId,
        kind: "allocation.commitment",
        throughLogicalTimeMs: cycle.bidCommitmentCloseAtLogicalMs - 1,
      }),
      this.options.protocol.messages({
        cycleId: cycle.cycleId,
        kind: "allocation.reveal",
        throughLogicalTimeMs: cycle.bidRevealCloseAtLogicalMs - 1,
      }),
    ])).map((messages) =>
      messages.filter((message) => admittedSet.has(message.messageDigest)),
    );
    const commitments = commitmentMessages
      .map((message) => commitmentPayload(message, cycle, graph.graphDigest))
      .filter(
        (payload): payload is DistributedPlanningCommitmentPayloadV1 =>
          payload !== null,
      );
    const candidates: StrategicAllocationCandidateV1[] = [];
    const acceptedCommitments = new Set<PlanningDigestV1>();
    const acceptedReveals = new Set<PlanningDigestV1>();
    for (const message of revealMessages) {
      const payload = revealPayload(message, cycle, graph.graphDigest);
      if (!payload) continue;
      const commitment = commitments.find(
        (item) =>
          item.commitment.commitmentId === payload.reveal.commitmentId &&
          item.commitment.peerId === payload.reveal.peerId &&
          item.commitment.peerInstanceId === payload.reveal.peerInstanceId &&
          item.commitment.taskId === payload.reveal.taskId,
      )?.commitment;
      if (!commitment) continue;
      candidates.push({
        commitment,
        reveal: payload.reveal,
        attestation: payload.attestation,
        peer: payload.peerProjection,
      });
      acceptedCommitments.add(commitment.commitmentDigest);
      acceptedReveals.add(payload.reveal.revealDigest);
    }
    const plan = await allocateStrategicallyV1({
      allocationId: cycle.allocationId,
      scopeDigest: this.options.protocol.options.scopeDigest,
      tasks: graphTasks(graph),
      candidates,
      policy: this.#allocationPolicy,
      evidence: this.#allocationEvidence,
      logicalTimeMs: input.publication.logicalTimeMs,
    });
    await this.options.protocol.publish({
      cycleId: cycle.cycleId,
      streamId: `allocation:${cycle.allocationId}`,
      kind: "allocation.plan",
      payload: freeze({
        schemaVersion: 1,
        cycle,
        graphDigest: graph.graphDigest,
        plan,
        contributingCommitmentDigests: [...acceptedCommitments].sort(),
        contributingRevealDigests: [...acceptedReveals].sort(),
      } satisfies DistributedPlanningPlanPayloadV1),
      ...(input.commandBindingDigest === undefined
        ? {}
        : { commandBindingDigest: input.commandBindingDigest }),
      ...input.publication,
    });
    return plan;
  }

  async settleAward(input: {
    readonly cycle: DistributedPlanningCycleV1;
    readonly plan: StrategicAllocationPlanV1;
    readonly awardDigest: PlanningDigestV1;
    readonly outcome: StrategicAllocationSettlementV1["outcome"];
    readonly outcomeEvidenceDigest: PlanningDigestV1;
    readonly publication: DistributedPlanningPublicationOptionsV1;
    readonly commandBindingDigest?: string;
  }): Promise<StrategicAllocationSettlementV1> {
    const cycle = validateDistributedPlanningCycleV1(input.cycle);
    validatePublication(input.publication);
    planningDigest(input.outcomeEvidenceDigest, "outcomeEvidenceDigest");
    const plan = validateStrategicAllocationPlanV1(
      input.plan,
      this.#allocationPolicy,
    );
    if (plan.allocationId !== cycle.allocationId)
      throw new TypeError(
        "distributed settlement plan is not bound to the cycle",
      );
    const settlement = settleStrategicAllocationV1({
      plan,
      awardDigest: input.awardDigest,
      outcome: input.outcome,
      outcomeEvidenceDigest: input.outcomeEvidenceDigest,
      settledAtLogicalMs: input.publication.logicalTimeMs,
      policy: this.#allocationPolicy,
    });
    await this.options.protocol.publish({
      cycleId: cycle.cycleId,
      streamId: `settlement:${cycle.allocationId}`,
      kind: "allocation.settlement",
      payload: freeze({
        schemaVersion: 1,
        cycle,
        settlement,
        outcomeEvidenceDigest: input.outcomeEvidenceDigest,
      } satisfies DistributedPlanningSettlementPayloadV1),
      ...(input.commandBindingDigest === undefined
        ? {}
        : { commandBindingDigest: input.commandBindingDigest }),
      ...input.publication,
    });
    return settlement;
  }

  async reconcileProposeDecomposition(
    input: Parameters<DistributedPlanningRuntimeV1["proposeDecomposition"]>[0] & {
      readonly commandBindingDigest: string;
    },
  ): Promise<MissionDecompositionGraphV1 | null> {
    const cycle = validateDistributedPlanningCycleV1(input.cycle);
    const message = await this.#lookupCommandMessage({
      cycle,
      streamId: `planning:${cycle.missionIntentId}`,
      kind: "planning.graph",
      publication: input.publication,
      commandBindingDigest: input.commandBindingDigest,
    });
    if (!message) return null;
    const payload = graphPayload(message, cycle, this.#decompositionPolicy);
    if (!payload || payload.payloadKind !== "candidate")
      throw new Error("distributed decomposition command result mismatch");
    return payload.graph;
  }

  async reconcileDecompositionMerge(
    input: Parameters<DistributedPlanningRuntimeV1["reconcileDecompositions"]>[0] & {
      readonly commandBindingDigest: string;
    },
  ): Promise<{
    readonly graph: MissionDecompositionGraphV1;
    readonly merge: MissionDecompositionMergeV1;
  } | null> {
    const cycle = validateDistributedPlanningCycleV1(input.cycle);
    const message = await this.#lookupCommandMessage({
      cycle,
      streamId: `planning:${cycle.missionIntentId}`,
      kind: "planning.graph",
      publication: input.publication,
      commandBindingDigest: input.commandBindingDigest,
    });
    if (!message) return null;
    const payload = graphPayload(message, cycle, this.#decompositionPolicy);
    if (
      !payload ||
      payload.payloadKind !== "reconciled" ||
      !payload.merge ||
      payload.merge.resultingGraphDigest !== payload.graph.graphDigest
    )
      throw new Error("distributed graph merge command result mismatch");
    planningDigest(payload.merge.mergeDigest, "mergeDigest");
    return freeze({ graph: payload.graph, merge: payload.merge });
  }

  async reconcileBidCommitment(
    input: Parameters<DistributedPlanningRuntimeV1["commitBid"]>[0] & {
      readonly commandBindingDigest: string;
    },
  ): Promise<boolean> {
    const cycle = validateDistributedPlanningCycleV1(input.cycle);
    const message = await this.#lookupCommandMessage({
      cycle,
      streamId: `allocation:${cycle.allocationId}`,
      kind: "allocation.commitment",
      publication: input.publication,
      commandBindingDigest: input.commandBindingDigest,
    });
    if (!message) return false;
    const payload = commitmentPayload(message, cycle, input.graphDigest);
    if (
      !payload ||
      payload.commitment.commitmentDigest !== input.commitment.commitmentDigest
    )
      throw new Error("distributed bid commitment command result mismatch");
    return true;
  }

  async reconcileBidReveal(
    input: Parameters<DistributedPlanningRuntimeV1["revealBid"]>[0] & {
      readonly commandBindingDigest: string;
    },
  ): Promise<boolean> {
    const cycle = validateDistributedPlanningCycleV1(input.cycle);
    const message = await this.#lookupCommandMessage({
      cycle,
      streamId: `allocation:${cycle.allocationId}`,
      kind: "allocation.reveal",
      publication: input.publication,
      commandBindingDigest: input.commandBindingDigest,
    });
    if (!message) return false;
    const payload = revealPayload(message, cycle, input.graphDigest);
    if (
      !payload ||
      payload.reveal.revealDigest !== input.reveal.revealDigest ||
      payload.attestation.attestationDigest !== input.attestation.attestationDigest ||
      JSON.stringify(payload.peerProjection) !==
        JSON.stringify(input.peerProjection)
    )
      throw new Error("distributed bid reveal command result mismatch");
    return true;
  }

  async reconcileAllocationDecision(
    input: Parameters<DistributedPlanningRuntimeV1["decideAllocation"]>[0] & {
      readonly commandBindingDigest: string;
    },
  ): Promise<StrategicAllocationPlanV1 | null> {
    const cycle = validateDistributedPlanningCycleV1(input.cycle);
    const graph = validateMissionDecompositionGraphV1(
      input.graph,
      this.#decompositionPolicy,
    );
    const message = await this.#lookupCommandMessage({
      cycle,
      streamId: `allocation:${cycle.allocationId}`,
      kind: "allocation.plan",
      publication: input.publication,
      commandBindingDigest: input.commandBindingDigest,
    });
    if (!message) return null;
    const payload = record(message.payload);
    if (
      !payload ||
      payload.schemaVersion !== 1 ||
      !sameCycle(payload.cycle, cycle) ||
      payload.graphDigest !== graph.graphDigest
    )
      throw new Error("distributed allocation command result mismatch");
    const plan = validateStrategicAllocationPlanV1(
      payload.plan as StrategicAllocationPlanV1,
      this.#allocationPolicy,
    );
    if (plan.allocationId !== cycle.allocationId)
      throw new Error("distributed allocation command binding mismatch");
    return plan;
  }

  async reconcileAwardSettlement(
    input: Parameters<DistributedPlanningRuntimeV1["settleAward"]>[0] & {
      readonly commandBindingDigest: string;
    },
  ): Promise<StrategicAllocationSettlementV1 | null> {
    const cycle = validateDistributedPlanningCycleV1(input.cycle);
    const message = await this.#lookupCommandMessage({
      cycle,
      streamId: `settlement:${cycle.allocationId}`,
      kind: "allocation.settlement",
      publication: input.publication,
      commandBindingDigest: input.commandBindingDigest,
    });
    if (!message) return null;
    const payload = record(message.payload);
    const expected = settleStrategicAllocationV1({
      plan: input.plan,
      awardDigest: input.awardDigest,
      outcome: input.outcome,
      outcomeEvidenceDigest: input.outcomeEvidenceDigest,
      settledAtLogicalMs: input.publication.logicalTimeMs,
      policy: this.#allocationPolicy,
    });
    if (
      !payload ||
      payload.schemaVersion !== 1 ||
      !sameCycle(payload.cycle, cycle) ||
      payload.outcomeEvidenceDigest !== input.outcomeEvidenceDigest ||
      (payload.settlement as StrategicAllocationSettlementV1 | undefined)
        ?.settlementDigest !== expected.settlementDigest
    )
      throw new Error("distributed settlement command result mismatch");
    return expected;
  }

  async #lookupCommandMessage(input: {
    readonly cycle: DistributedPlanningCycleV1;
    readonly streamId: string;
    readonly kind: DistributedCollectiveMessageV1["kind"];
    readonly publication: DistributedPlanningPublicationOptionsV1;
    readonly commandBindingDigest: string;
  }): Promise<DistributedCollectiveMessageV1 | null> {
    validatePublication(input.publication);
    planningDigest(input.commandBindingDigest, "commandBindingDigest");
    const messages = await this.options.protocol.messages();
    const matches = messages.filter(
      (message) => message.commandBindingDigest === input.commandBindingDigest,
    );
    if (matches.length === 0) return null;
    if (matches.length !== 1)
      throw new Error("distributed planning command binding is not unique");
    const message = matches[0]!;
    if (
      message.cycleId !== input.cycle.cycleId ||
      message.streamId !== input.streamId ||
      message.kind !== input.kind ||
      message.issuerPeerId !== this.options.protocol.options.localPeerId ||
      message.issuerInstanceId !==
        this.options.protocol.options.localInstanceId ||
      message.logicalTimeMs !== input.publication.logicalTimeMs ||
      message.expiresAtLogicalMs !==
        input.publication.logicalTimeMs + input.publication.lifetime
    )
      throw new Error("distributed planning command binding mismatch");
    return message;
  }
}

type DistributedPlanningRuntimeMethodNameV1 =
  | "proposeDecomposition"
  | "reconcileDecompositions"
  | "commitBid"
  | "revealBid"
  | "decideAllocation"
  | "settleAward"
  | "reconcileProposeDecomposition"
  | "reconcileDecompositionMerge"
  | "reconcileBidCommitment"
  | "reconcileBidReveal"
  | "reconcileAllocationDecision"
  | "reconcileAwardSettlement";

type DistributedPlanningRuntimeInvokersV1 = Readonly<
  Pick<DistributedPlanningRuntimeV1, DistributedPlanningRuntimeMethodNameV1>
>;

const distributedPlanningRuntimeInvokersV1 = new WeakMap<
  object,
  DistributedPlanningRuntimeInvokersV1
>();

const distributedPlanningRuntimeBaseMethodsV1: DistributedPlanningRuntimeInvokersV1 =
  Object.freeze({
    proposeDecomposition:
      DistributedPlanningRuntimeV1.prototype.proposeDecomposition,
    reconcileDecompositions:
      DistributedPlanningRuntimeV1.prototype.reconcileDecompositions,
    commitBid: DistributedPlanningRuntimeV1.prototype.commitBid,
    revealBid: DistributedPlanningRuntimeV1.prototype.revealBid,
    decideAllocation: DistributedPlanningRuntimeV1.prototype.decideAllocation,
    settleAward: DistributedPlanningRuntimeV1.prototype.settleAward,
    reconcileProposeDecomposition:
      DistributedPlanningRuntimeV1.prototype.reconcileProposeDecomposition,
    reconcileDecompositionMerge:
      DistributedPlanningRuntimeV1.prototype.reconcileDecompositionMerge,
    reconcileBidCommitment:
      DistributedPlanningRuntimeV1.prototype.reconcileBidCommitment,
    reconcileBidReveal:
      DistributedPlanningRuntimeV1.prototype.reconcileBidReveal,
    reconcileAllocationDecision:
      DistributedPlanningRuntimeV1.prototype.reconcileAllocationDecision,
    reconcileAwardSettlement:
      DistributedPlanningRuntimeV1.prototype.reconcileAwardSettlement,
  });

function installDistributedPlanningRuntimeInvokersV1(
  runtime: DistributedPlanningRuntimeV1,
): void {
  const invokers: DistributedPlanningRuntimeInvokersV1 = Object.freeze({
    proposeDecomposition: (input) =>
      distributedPlanningRuntimeBaseMethodsV1.proposeDecomposition.call(
        runtime,
        input,
      ),
    reconcileDecompositions: (input) =>
      distributedPlanningRuntimeBaseMethodsV1.reconcileDecompositions.call(
        runtime,
        input,
      ),
    commitBid: (input) =>
      distributedPlanningRuntimeBaseMethodsV1.commitBid.call(runtime, input),
    revealBid: (input) =>
      distributedPlanningRuntimeBaseMethodsV1.revealBid.call(runtime, input),
    decideAllocation: (input) =>
      distributedPlanningRuntimeBaseMethodsV1.decideAllocation.call(
        runtime,
        input,
      ),
    settleAward: (input) =>
      distributedPlanningRuntimeBaseMethodsV1.settleAward.call(runtime, input),
    reconcileProposeDecomposition: (input) =>
      distributedPlanningRuntimeBaseMethodsV1.reconcileProposeDecomposition.call(
        runtime,
        input,
      ),
    reconcileDecompositionMerge: (input) =>
      distributedPlanningRuntimeBaseMethodsV1.reconcileDecompositionMerge.call(
        runtime,
        input,
      ),
    reconcileBidCommitment: (input) =>
      distributedPlanningRuntimeBaseMethodsV1.reconcileBidCommitment.call(
        runtime,
        input,
      ),
    reconcileBidReveal: (input) =>
      distributedPlanningRuntimeBaseMethodsV1.reconcileBidReveal.call(
        runtime,
        input,
      ),
    reconcileAllocationDecision: (input) =>
      distributedPlanningRuntimeBaseMethodsV1.reconcileAllocationDecision.call(
        runtime,
        input,
      ),
    reconcileAwardSettlement: (input) =>
      distributedPlanningRuntimeBaseMethodsV1.reconcileAwardSettlement.call(
        runtime,
        input,
      ),
  });
  distributedPlanningRuntimeInvokersV1.set(runtime, invokers);
  Object.defineProperties(runtime, {
    proposeDecomposition: immutablePlanningInvoker(
      invokers.proposeDecomposition,
    ),
    reconcileDecompositions: immutablePlanningInvoker(
      invokers.reconcileDecompositions,
    ),
    commitBid: immutablePlanningInvoker(invokers.commitBid),
    revealBid: immutablePlanningInvoker(invokers.revealBid),
    decideAllocation: immutablePlanningInvoker(invokers.decideAllocation),
    settleAward: immutablePlanningInvoker(invokers.settleAward),
    reconcileProposeDecomposition: immutablePlanningInvoker(
      invokers.reconcileProposeDecomposition,
    ),
    reconcileDecompositionMerge: immutablePlanningInvoker(
      invokers.reconcileDecompositionMerge,
    ),
    reconcileBidCommitment: immutablePlanningInvoker(
      invokers.reconcileBidCommitment,
    ),
    reconcileBidReveal: immutablePlanningInvoker(invokers.reconcileBidReveal),
    reconcileAllocationDecision: immutablePlanningInvoker(
      invokers.reconcileAllocationDecision,
    ),
    reconcileAwardSettlement: immutablePlanningInvoker(
      invokers.reconcileAwardSettlement,
    ),
  });
}

/** Nominal runtime check; structural and prototype-only lookalikes fail. */
export function isDistributedPlanningRuntimeV1(
  value: unknown,
): value is DistributedPlanningRuntimeV1 {
  return (
    typeof value === "object" &&
    value !== null &&
    distributedPlanningRuntimeInvokersV1.has(value)
  );
}

function immutablePlanningInvoker(value: unknown): PropertyDescriptor {
  return {
    value,
    writable: false,
    configurable: false,
    enumerable: false,
  };
}

export function validateDistributedPlanningCycleV1(
  input: DistributedPlanningCycleV1,
): DistributedPlanningCycleV1 {
  if (!input || input.schemaVersion !== 1)
    throw new TypeError("distributed planning cycle schema is invalid");
  identifier(input.cycleId, "cycleId");
  identifier(input.missionIntentId, "missionIntentId");
  integer(input.intentRevision, "intentRevision", 1, Number.MAX_SAFE_INTEGER);
  planningDigest(input.intentDigest, "intentDigest");
  identifier(input.allocationId, "allocationId");
  integer(
    input.graphProposalCloseAtLogicalMs,
    "graphProposalCloseAtLogicalMs",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  integer(
    input.bidCommitmentCloseAtLogicalMs,
    "bidCommitmentCloseAtLogicalMs",
    input.graphProposalCloseAtLogicalMs + 1,
    Number.MAX_SAFE_INTEGER,
  );
  integer(
    input.bidRevealCloseAtLogicalMs,
    "bidRevealCloseAtLogicalMs",
    input.bidCommitmentCloseAtLogicalMs + 1,
    Number.MAX_SAFE_INTEGER,
  );
  return freeze(input);
}

function graphPayload(
  message: DistributedCollectiveMessageV1,
  cycle: DistributedPlanningCycleV1,
  policy: DistributedDecompositionPolicyV1,
): DistributedPlanningGraphPayloadV1 | null {
  const payload = record(message.payload);
  if (
    !payload ||
    payload.schemaVersion !== 1 ||
    !sameCycle(payload.cycle, cycle) ||
    (payload.payloadKind !== "candidate" &&
      payload.payloadKind !== "reconciled")
  )
    return null;
  try {
    const graph = validateMissionDecompositionGraphV1(
      payload.graph as MissionDecompositionGraphV1,
      policy,
    );
    return freeze({
      ...payload,
      graph,
    }) as unknown as DistributedPlanningGraphPayloadV1;
  } catch {
    return null;
  }
}

function commitmentPayload(
  message: DistributedCollectiveMessageV1,
  cycle: DistributedPlanningCycleV1,
  graphDigest: PlanningDigestV1,
): DistributedPlanningCommitmentPayloadV1 | null {
  const payload = record(message.payload);
  if (
    !payload ||
    payload.schemaVersion !== 1 ||
    !sameCycle(payload.cycle, cycle) ||
    payload.graphDigest !== graphDigest
  )
    return null;
  try {
    return freeze({
      schemaVersion: 1,
      cycle,
      graphDigest,
      commitment: validateCommitment(
        payload.commitment as StrategicBidCommitmentV1,
      ),
    });
  } catch {
    return null;
  }
}

function revealPayload(
  message: DistributedCollectiveMessageV1,
  cycle: DistributedPlanningCycleV1,
  graphDigest: PlanningDigestV1,
): DistributedPlanningRevealPayloadV1 | null {
  const payload = record(message.payload);
  if (
    !payload ||
    payload.schemaVersion !== 1 ||
    !sameCycle(payload.cycle, cycle) ||
    payload.graphDigest !== graphDigest
  )
    return null;
  try {
    const attestation = payload.attestation as StrategicCapabilityAttestationV1;
    const peerProjection = payload.peerProjection as StrategicPeerProjectionV1;
    if (!attestation || !peerProjection) return null;
    return freeze({
      schemaVersion: 1,
      cycle,
      graphDigest,
      reveal: validateReveal(payload.reveal as StrategicBidRevealV1),
      attestation,
      peerProjection,
    });
  } catch {
    return null;
  }
}

function validateCommitment(
  input: StrategicBidCommitmentV1,
): StrategicBidCommitmentV1 {
  const { schemaVersion: _schemaVersion, commitmentDigest, ...body } = input;
  const rebuilt = createStrategicBidCommitmentV1(body);
  if (rebuilt.commitmentDigest !== commitmentDigest)
    throw new TypeError("strategic bid commitment digest is invalid");
  return rebuilt;
}

function validateReveal(input: StrategicBidRevealV1): StrategicBidRevealV1 {
  const { schemaVersion: _schemaVersion, revealDigest, ...body } = input;
  const rebuilt = createStrategicBidRevealV1(body);
  if (rebuilt.revealDigest !== revealDigest)
    throw new TypeError("strategic bid reveal digest is invalid");
  return rebuilt;
}

function graphTasks(
  graph: MissionDecompositionGraphV1,
): readonly StrategicAllocationTaskV1[] {
  const idByDigest = new Map(
    graph.tasks.map((task) => [task.taskDigest, task.taskId]),
  );
  return freeze(
    graph.tasks.map((task) => ({
      taskId: task.taskId,
      taskDigest: task.taskDigest,
      requiredCapabilityKeys: task.requiredCapabilityKeys,
      requiredIndependenceGroupId: null,
      budgetCeilingUnits: task.budgetUnits,
      collateralFloorUnits: 0,
      dependsOnTaskIds: task.dependencyTaskDigests
        .map((digest) => {
          const id = idByDigest.get(digest);
          if (!id)
            throw new TypeError("distributed graph dependency is unavailable");
          return id;
        })
        .sort(),
    })),
  );
}

function sameCycle(
  value: unknown,
  expected: DistributedPlanningCycleV1,
): boolean {
  try {
    const actual = validateDistributedPlanningCycleV1(
      value as DistributedPlanningCycleV1,
    );
    return (
      actual.cycleId === expected.cycleId &&
      actual.missionIntentId === expected.missionIntentId &&
      actual.intentRevision === expected.intentRevision &&
      actual.intentDigest === expected.intentDigest &&
      actual.allocationId === expected.allocationId &&
      actual.graphProposalCloseAtLogicalMs ===
        expected.graphProposalCloseAtLogicalMs &&
      actual.bidCommitmentCloseAtLogicalMs ===
        expected.bidCommitmentCloseAtLogicalMs &&
      actual.bidRevealCloseAtLogicalMs === expected.bidRevealCloseAtLogicalMs
    );
  } catch {
    return false;
  }
}

function validatePublication(
  input: DistributedPlanningPublicationOptionsV1,
): void {
  if (!input)
    throw new TypeError("distributed planning publication is required");
  integer(input.logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
  integer(input.lifetime, "lifetime", 1, Number.MAX_SAFE_INTEGER);
  if (input.fanout !== undefined) integer(input.fanout, "fanout", 1, 1_000_000);
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function identifier(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u.test(value)
  )
    throw new TypeError(`${label} is invalid`);
}

function planningDigest(
  value: unknown,
  label: string,
): asserts value is PlanningDigestV1 {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value))
    throw new TypeError(`${label} is invalid`);
}

function planningDigestSnapshot(value: unknown): readonly PlanningDigestV1[] {
  if (!Array.isArray(value))
    throw new TypeError("admittedMessageDigests is invalid");
  const canonical = [...new Set(value as unknown[])].sort();
  if (
    canonical.length !== value.length ||
    canonical.some((item, index) => item !== value[index])
  )
    throw new TypeError("admittedMessageDigests is not canonical");
  canonical.forEach((item) => planningDigest(item, "admittedMessageDigest"));
  return canonical as readonly PlanningDigestV1[];
}

function integer(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  )
    throw new RangeError(`${label} is invalid`);
  return value as number;
}

function freeze<T>(value: T): T {
  const clone = structuredClone(value);
  const visit = (item: unknown): void => {
    if (!item || typeof item !== "object" || Object.isFrozen(item)) return;
    for (const child of Object.values(item as Record<string, unknown>))
      visit(child);
    Object.freeze(item);
  };
  visit(clone);
  return clone;
}
