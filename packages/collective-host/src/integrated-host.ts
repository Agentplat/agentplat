import type {
  LocalRuleDecisionV1,
  LocalRuleKernelV1,
  LocalRuleScalarV1,
} from "@agentplat/collective-control/local-rule-kernel";
import {
  AgentLineageRecordV1,
  GovernedAgentLineageRuntimeV1,
  invokeGovernedAgentLineageLoadV1,
  isGovernedAgentLineageRuntimeV1,
} from "@agentplat/collective-membership/agent-lineage";
import type {
  DistributedDecompositionPolicyV1,
  MissionDecompositionGraphV1,
  MissionDecompositionRequestV1,
  MissionDecompositionMergeV1,
  ReferenceMissionDecomposerV1,
} from "@agentplat/collective-planning/distributed-decomposition";
import { mergeMissionDecompositionsV1 } from "@agentplat/collective-planning/distributed-decomposition";
import {
  resolveCollusionAwareContextV1,
  type CollusionAwareContextPolicyV1,
  type CollusionAwareContextResolutionV1,
  type ContextClaimCandidateV1,
  type ContextSourceDependencyPortV1,
} from "@agentplat/collective-quorum/collusion-aware-context";
import { collectiveQuorumDigestV1 } from "@agentplat/collective-quorum/crypto";
import type { SparseFinalityCertificateV2 } from "@agentplat/collective-quorum/sparse-agreement";
import {
  allocateStrategicallyV1,
  type StrategicAllocationCandidateV1,
  type StrategicAllocationEvidencePortV1,
  type StrategicAllocationPlanV1,
  type StrategicAllocationPolicyV1,
  type StrategicAllocationTaskV1,
} from "@agentplat/collective-runtime/strategic-allocation";
import type { GovernedRoleCatalogRuntimeV2 } from "@agentplat/inference-control/governed-role-evolution";
import type {
  SemanticMetricSampleV1,
  SequentialSemanticGuaranteeEngineV1,
  SequentialSemanticGuaranteeV1,
} from "@agentplat/inference-control/semantic-metrics";
import type {
  CognitiveAgentAdapterContextV2,
  CognitiveAgentRuntimeV2,
  CognitiveOperationReceiptV2,
  CognitiveOperationRequestV2,
  CognitiveOperationResultV2,
} from "@agentplat/runtime/cognitive-adapter";
import type { PortableAgentRoleBindingV1 } from "@agentplat/runtime/adapter";
import type {
  PeerCredibilityObservationV1,
  PeerCredibilityRuntimeV1,
  PeerCredibilityStateV1,
  PeerSourceDependencyEdgeV1,
} from "@agentplat/trust/peer-credibility";

export interface IntegratedCollectiveFinalityPortV2 {
  certify(input: {
    readonly cycleId: string;
    readonly scopeDigest: string;
    readonly decisionDigest: string;
    readonly ruleDecisionDigest: string;
    readonly credibilityStateDigest: string;
    readonly contextResolutionDigest: string;
    readonly decompositionGraphDigest: string;
    readonly allocationPlanDigest: string;
    readonly semanticAcceptancePolicyDigest: string;
    readonly semanticGuaranteeDigest: string;
    readonly semanticAssessmentDigests: readonly string[];
    readonly logicalTimeMs: number;
  }): Promise<SparseFinalityCertificateV2 | null>;
  verify(input: {
    readonly certificate: SparseFinalityCertificateV2;
    readonly decisionDigest: string;
    readonly scopeDigest: string;
    readonly logicalTimeMs: number;
  }): Promise<boolean>;
}

export interface IntegratedSemanticAcceptancePolicyV2 {
  readonly schemaVersion: 2;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly minimumSamples: number;
  readonly minimumRoleCoherenceLowerBasisPoints: number;
  readonly minimumMissionAlignmentLowerBasisPoints: number;
  readonly maximumContextConflictUpperBasisPoints: number;
  readonly maximumUncertaintyUpperBasisPoints: number;
  readonly minimumCourseActionDiversityLowerBasisPoints: number;
  readonly minimumCourseActionNoveltyLowerBasisPoints: number;
  readonly requireCourseActionDiversity: boolean;
  readonly requireCourseActionNovelty: boolean;
  readonly policyDigest: string;
}

export interface IntegratedCollectiveCycleInputV2 {
  readonly schemaVersion: 2;
  readonly cycleId: string;
  readonly expectedHostRevision: number;
  readonly scopeDigest: string;
  readonly logicalTimeMs: number;
  readonly localFacts: Readonly<Record<string, LocalRuleScalarV1>>;
  readonly credibility: {
    readonly subjectId: string;
    readonly observation: PeerCredibilityObservationV1;
    readonly dependencyEdges: readonly PeerSourceDependencyEdgeV1[];
  };
  readonly context: {
    readonly subjectDigest: string;
    readonly candidates: readonly ContextClaimCandidateV1[];
    readonly policy: CollusionAwareContextPolicyV1;
    readonly dependencyEvidence: ContextSourceDependencyPortV1;
  };
  readonly decomposition: {
    readonly request: MissionDecompositionRequestV1;
    readonly peerGraphs: readonly MissionDecompositionGraphV1[];
    readonly priorGraph: MissionDecompositionGraphV1 | null;
    readonly policy: DistributedDecompositionPolicyV1;
  };
  readonly allocation: {
    readonly allocationId: string;
    readonly tasks: readonly StrategicAllocationTaskV1[];
    readonly candidates: readonly StrategicAllocationCandidateV1[];
    readonly policy: StrategicAllocationPolicyV1;
    readonly evidence: StrategicAllocationEvidencePortV1;
  };
  readonly semanticSample: SemanticMetricSampleV1;
  readonly cognitive: {
    readonly request: CognitiveOperationRequestV2;
    readonly context: CognitiveAgentAdapterContextV2;
    readonly roleKey: string;
    readonly objectiveId: string;
    readonly roleValidFromLogicalMs: number;
    readonly roleValidUntilLogicalMs: number;
  };
}

export type IntegratedCollectiveCycleStatusV2 =
  | "policy_denied"
  | "policy_abstained"
  | "context_challenged"
  | "context_unavailable"
  | "safe_action_selected"
  | "allocation_unavailable"
  | "semantic_rejected"
  | "finality_unavailable"
  | "execution_binding_unavailable"
  | "completed";

export interface IntegratedCollectiveCycleReceiptV2 {
  readonly schemaVersion: 2;
  readonly cycleId: string;
  readonly scopeDigest: string;
  readonly hostRevision: number;
  readonly status: IntegratedCollectiveCycleStatusV2;
  readonly ruleDecision: LocalRuleDecisionV1;
  readonly credibilityState: PeerCredibilityStateV1 | null;
  readonly contextResolution: CollusionAwareContextResolutionV1 | null;
  readonly decompositionGraph: MissionDecompositionGraphV1 | null;
  readonly decompositionMerge: MissionDecompositionMergeV1 | null;
  readonly allocationPlan: StrategicAllocationPlanV1 | null;
  readonly semanticGuarantee: SequentialSemanticGuaranteeV1 | null;
  readonly finalityCertificate: SparseFinalityCertificateV2 | null;
  readonly cognitiveResult: CognitiveOperationResultV2 | null;
  readonly cognitiveReceipt: CognitiveOperationReceiptV2 | null;
  readonly logicalTimeMs: number;
  readonly previousReceiptDigest: string | null;
  readonly receiptDigest: string;
}

export interface IntegratedCollectiveHostStateV2 {
  readonly schemaVersion: 2;
  readonly hostId: string;
  readonly peerId: string;
  readonly scopeDigest: string;
  readonly revision: number;
  readonly logicalTimeHighWaterMs: number;
  readonly retainedReceipts: readonly IntegratedCollectiveCycleReceiptV2[];
  readonly stateDigest: string;
}

export interface IntegratedExecutionBindingV2 {
  readonly agent: AgentLineageRecordV1;
  readonly roleBinding: PortableAgentRoleBindingV1;
  readonly roleBindingDigest: string;
}

export interface IntegratedCollectiveHostStoreV2 {
  load(hostId: string): Promise<IntegratedCollectiveHostStateV2 | null>;
  save(
    state: IntegratedCollectiveHostStateV2,
    expectedRevision: number | null,
  ): Promise<boolean>;
}

export class InMemoryIntegratedCollectiveHostStoreV2 implements IntegratedCollectiveHostStoreV2 {
  readonly #states = new Map<string, IntegratedCollectiveHostStateV2>();
  async load(hostId: string): Promise<IntegratedCollectiveHostStateV2 | null> {
    return this.#states.get(hostId) ?? null;
  }
  async save(
    state: IntegratedCollectiveHostStateV2,
    expectedRevision: number | null,
  ): Promise<boolean> {
    const current = this.#states.get(state.hostId);
    if (
      (expectedRevision === null &&
        (current !== undefined || state.revision !== 0)) ||
      (expectedRevision !== null &&
        (!current ||
          current.revision !== expectedRevision ||
          state.revision !== expectedRevision + 1))
    )
      return false;
    this.#states.set(state.hostId, state);
    return true;
  }
}

/**
 * Peer-local closed-loop composition. It owns no network-wide clock, leader or
 * membership authority; every collective claim crosses an explicit certificate port.
 */
export class IntegratedCollectiveHostV2 {
  readonly #lineage: GovernedAgentLineageRuntimeV1;
  readonly #store: IntegratedCollectiveHostStoreV2;
  readonly #semanticAcceptance: IntegratedSemanticAcceptancePolicyV2;
  readonly #maximumRetainedReceipts: number;
  readonly #maximumCommitAttempts: number;
  readonly #maximumReceiptBytes: number;
  #semanticPolicyVerification: Promise<IntegratedSemanticAcceptancePolicyV2> | null =
    null;

  constructor(
    readonly options: {
      readonly hostId: string;
      readonly peerId: string;
      readonly scopeDigest: string;
      readonly rules: LocalRuleKernelV1;
      readonly credibility: PeerCredibilityRuntimeV1;
      readonly decomposer: ReferenceMissionDecomposerV1;
      readonly semanticGuarantees: SequentialSemanticGuaranteeEngineV1;
      readonly semanticAcceptance: IntegratedSemanticAcceptancePolicyV2;
      readonly cognitive: CognitiveAgentRuntimeV2;
      readonly roles: GovernedRoleCatalogRuntimeV2;
      readonly lineage: GovernedAgentLineageRuntimeV1;
      readonly finality: IntegratedCollectiveFinalityPortV2;
      readonly store?: IntegratedCollectiveHostStoreV2;
      readonly maximumRetainedReceipts?: number;
      readonly maximumCommitAttempts?: number;
      readonly maximumReceiptBytes?: number;
      readonly requireCompleteAllocation?: boolean;
      readonly crypto?: Crypto;
    },
  ) {
    identifier(options.hostId, "hostId");
    identifier(options.peerId, "peerId");
    digest(options.scopeDigest, "scopeDigest");
    if (
      !options.finality ||
      typeof options.finality.certify !== "function" ||
      typeof options.finality.verify !== "function"
    )
      throw new TypeError("integrated finality port is required");
    if (!isGovernedAgentLineageRuntimeV1(options.lineage))
      throw new TypeError(
        "integrated host requires a concrete governed lineage runtime",
      );
    this.#lineage = options.lineage;
    validateSemanticAcceptance(options.semanticAcceptance);
    this.#semanticAcceptance = Object.freeze({
      ...options.semanticAcceptance,
    });
    Object.defineProperty(this, "options", {
      value: Object.freeze({
        ...options,
        semanticAcceptance: this.#semanticAcceptance,
      }),
      writable: false,
      configurable: false,
      enumerable: true,
    });
    this.#store =
      options.store ?? new InMemoryIntegratedCollectiveHostStoreV2();
    this.#maximumRetainedReceipts = integer(
      options.maximumRetainedReceipts ?? 1_024,
      "maximumRetainedReceipts",
      1,
      100_000,
    );
    this.#maximumCommitAttempts = integer(
      options.maximumCommitAttempts ?? 4,
      "maximumCommitAttempts",
      1,
      32,
    );
    this.#maximumReceiptBytes = integer(
      options.maximumReceiptBytes ?? 8_388_608,
      "maximumReceiptBytes",
      1_024,
      67_108_864,
    );
  }

  async initialize(): Promise<IntegratedCollectiveHostStateV2> {
    await this.#verifySemanticPolicy();
    const state = await this.#createState({
      schemaVersion: 2,
      hostId: this.options.hostId,
      peerId: this.options.peerId,
      scopeDigest: this.options.scopeDigest,
      revision: 0,
      logicalTimeHighWaterMs: 0,
      retainedReceipts: [],
    });
    if (!(await this.#store.save(state, null)))
      throw new Error("integrated host already initialized");
    return state;
  }

  /** Resolves the exact digest a cognitive request must carry before a cycle is submitted. */
  async resolveExecutionBinding(input: {
    readonly roleKey: string;
    readonly agentId: string;
    readonly objectiveId: string;
    readonly validFromLogicalMs: number;
    readonly validUntilLogicalMs: number;
  }): Promise<IntegratedExecutionBindingV2 | null> {
    const lineage = await invokeGovernedAgentLineageLoadV1(this.#lineage);
    const agent = lineage.agents.find(
      (item) => item.agentId === input.agentId && item.status === "active",
    );
    if (!agent) return null;
    const roleBinding =
      await this.options.roles.resolveActiveRoleBinding(input);
    if (
      !roleBinding ||
      roleBinding.constraints.authorityDigest !== agent.authorityDigest ||
      roleBinding.constraints.definitionDigest !== agent.roleDefinitionDigest
    )
      return null;
    return Object.freeze({
      agent,
      roleBinding,
      roleBindingDigest: await integratedGovernedRoleBindingDigestV2(
        roleBinding,
        this.options.crypto,
      ),
    });
  }

  async runCycle(
    input: IntegratedCollectiveCycleInputV2,
  ): Promise<IntegratedCollectiveCycleReceiptV2> {
    await this.#verifySemanticPolicy();
    this.#validateInput(input);
    const initial = await this.load();
    if (initial.revision !== input.expectedHostRevision)
      throw new Error("integrated host revision conflict");
    if (input.logicalTimeMs < initial.logicalTimeHighWaterMs)
      throw new Error("integrated host logical time rollback");
    if (initial.retainedReceipts.some((item) => item.cycleId === input.cycleId))
      throw new Error("integrated cycle identifier already committed");

    const ruleDecision = await this.options.rules.evaluate({
      decisionId: `${input.cycleId}:local-policy`,
      facts: input.localFacts,
      logicalTimeMs: input.logicalTimeMs,
    });
    if (ruleDecision.disposition !== "allow")
      return this.#commitReceipt(input, {
        status:
          ruleDecision.disposition === "deny"
            ? "policy_denied"
            : "policy_abstained",
        ruleDecision,
        credibilityState: null,
        contextResolution: null,
        decompositionGraph: null,
        decompositionMerge: null,
        allocationPlan: null,
        semanticGuarantee: null,
        finalityCertificate: null,
        cognitiveResult: null,
        cognitiveReceipt: null,
      });

    const credibilityState = await this.options.credibility.observe({
      scopeDigest: input.scopeDigest.replace(/^sha256:/, ""),
      subjectId: input.credibility.subjectId,
      observation: input.credibility.observation,
      dependencyEdges: input.credibility.dependencyEdges,
      evaluatedAtLogicalMs: input.logicalTimeMs,
    });
    const contextCandidates = input.context.candidates.map((candidate) =>
      candidate.sourceId === credibilityState.subjectId
        ? { ...candidate, credibility: credibilityState }
        : candidate,
    );
    const contextResolution = await resolveCollusionAwareContextV1({
      scopeDigest: credibilityState.scopeDigest,
      subjectDigest: input.context.subjectDigest,
      candidates: contextCandidates,
      policy: input.context.policy,
      dependencyEvidence: input.context.dependencyEvidence,
      evaluatedAtLogicalMs: input.logicalTimeMs,
      crypto: this.options.crypto,
    });
    if (
      contextResolution.action === "challenge" ||
      contextResolution.action === "quarantine"
    )
      return this.#commitReceipt(input, {
        status: "context_challenged",
        ruleDecision,
        credibilityState,
        contextResolution,
        decompositionGraph: null,
        decompositionMerge: null,
        allocationPlan: null,
        semanticGuarantee: null,
        finalityCertificate: null,
        cognitiveResult: null,
        cognitiveReceipt: null,
      });
    if (contextResolution.action === "abstain")
      return this.#commitReceipt(input, {
        status: "context_unavailable",
        ruleDecision,
        credibilityState,
        contextResolution,
        decompositionGraph: null,
        decompositionMerge: null,
        allocationPlan: null,
        semanticGuarantee: null,
        finalityCertificate: null,
        cognitiveResult: null,
        cognitiveReceipt: null,
      });
    if (contextResolution.action === "safe_action")
      return this.#commitReceipt(input, {
        status: "safe_action_selected",
        ruleDecision,
        credibilityState,
        contextResolution,
        decompositionGraph: null,
        decompositionMerge: null,
        allocationPlan: null,
        semanticGuarantee: null,
        finalityCertificate: null,
        cognitiveResult: null,
        cognitiveReceipt: null,
      });

    if (
      !input.decomposition.request.observationDigests.includes(
        contextResolution.resolutionDigest as MissionDecompositionRequestV1["observationDigests"][number],
      )
    )
      throw new TypeError(
        "mission decomposition is not bound to the admitted context resolution",
      );
    const localGraph = this.options.decomposer.factorize(
      input.decomposition.request,
    );
    const { graph: decompositionGraph, merge: decompositionMerge } =
      mergeMissionDecompositionsV1({
        graphs: [localGraph, ...input.decomposition.peerGraphs],
        priorGraph: input.decomposition.priorGraph,
        policy: input.decomposition.policy,
        logicalTimeMs: input.logicalTimeMs,
      });
    if (!allocationTasksMatchGraph(input.allocation.tasks, decompositionGraph))
      return this.#commitReceipt(input, {
        status: "allocation_unavailable",
        ruleDecision,
        credibilityState,
        contextResolution,
        decompositionGraph,
        decompositionMerge,
        allocationPlan: null,
        semanticGuarantee: null,
        finalityCertificate: null,
        cognitiveResult: null,
        cognitiveReceipt: null,
      });
    const allocationPlan = await allocateStrategicallyV1({
      allocationId: input.allocation.allocationId,
      scopeDigest: input.scopeDigest,
      tasks: input.allocation.tasks,
      candidates: input.allocation.candidates,
      policy: input.allocation.policy,
      evidence: input.allocation.evidence,
      logicalTimeMs: input.logicalTimeMs,
    });
    if (
      (this.options.requireCompleteAllocation ?? true) &&
      allocationPlan.unallocatedTaskIds.length > 0
    )
      return this.#commitReceipt(input, {
        status: "allocation_unavailable",
        ruleDecision,
        credibilityState,
        contextResolution,
        decompositionGraph,
        decompositionMerge,
        allocationPlan,
        semanticGuarantee: null,
        finalityCertificate: null,
        cognitiveResult: null,
        cognitiveReceipt: null,
      });
    const semanticGuarantee = this.options.semanticGuarantees.append(
      input.semanticSample,
    );
    if (
      !integratedSemanticGuaranteeAcceptedV2(
        semanticGuarantee,
        this.#semanticAcceptance,
      )
    )
      return this.#commitReceipt(input, {
        status: "semantic_rejected",
        ruleDecision,
        credibilityState,
        contextResolution,
        decompositionGraph,
        decompositionMerge,
        allocationPlan,
        semanticGuarantee,
        finalityCertificate: null,
        cognitiveResult: null,
        cognitiveReceipt: null,
      });
    const semanticGuaranteeDigest = await collectiveQuorumDigestV1(
      {
        domain: "integrated-semantic-guarantee-v2",
        body: semanticGuarantee,
      },
      this.options.crypto,
    );
    const decisionDigest = await collectiveQuorumDigestV1(
      {
        domain: "integrated-collective-decision-v2",
        body: {
          cycleId: input.cycleId,
          scopeDigest: input.scopeDigest,
          ruleDecisionDigest: ruleDecision.decisionDigest,
          credibilityStateDigest: `sha256:${credibilityState.stateDigest}`,
          contextResolutionDigest: contextResolution.resolutionDigest,
          decompositionGraphDigest: decompositionGraph.graphDigest,
          allocationPlanDigest: allocationPlan.planDigest,
          semanticAcceptancePolicyDigest: this.#semanticAcceptance.policyDigest,
          semanticGuaranteeDigest,
          semanticAssessmentDigests: semanticGuarantee.evidenceDigests,
          logicalTimeMs: input.logicalTimeMs,
        },
      },
      this.options.crypto,
    );
    const finalityCertificate = await this.options.finality.certify({
      cycleId: input.cycleId,
      scopeDigest: input.scopeDigest,
      decisionDigest,
      ruleDecisionDigest: ruleDecision.decisionDigest,
      credibilityStateDigest: `sha256:${credibilityState.stateDigest}`,
      contextResolutionDigest: contextResolution.resolutionDigest,
      decompositionGraphDigest: decompositionGraph.graphDigest,
      allocationPlanDigest: allocationPlan.planDigest,
      semanticAcceptancePolicyDigest: this.#semanticAcceptance.policyDigest,
      semanticGuaranteeDigest,
      semanticAssessmentDigests: semanticGuarantee.evidenceDigests,
      logicalTimeMs: input.logicalTimeMs,
    });
    if (
      !finalityCertificate ||
      finalityCertificate.proposalDigest !== decisionDigest ||
      !(await this.options.finality.verify({
        certificate: finalityCertificate,
        decisionDigest,
        scopeDigest: input.scopeDigest,
        logicalTimeMs: input.logicalTimeMs,
      }))
    )
      return this.#commitReceipt(input, {
        status: "finality_unavailable",
        ruleDecision,
        credibilityState,
        contextResolution,
        decompositionGraph,
        decompositionMerge,
        allocationPlan,
        semanticGuarantee,
        finalityCertificate: null,
        cognitiveResult: null,
        cognitiveReceipt: null,
      });

    const executionBinding = await this.resolveExecutionBinding({
      roleKey: input.cognitive.roleKey,
      agentId: input.cognitive.request.agentId,
      objectiveId: input.cognitive.objectiveId,
      validFromLogicalMs: input.cognitive.roleValidFromLogicalMs,
      validUntilLogicalMs: input.cognitive.roleValidUntilLogicalMs,
    });
    if (
      !executionBinding ||
      executionBinding.roleBindingDigest !==
        input.cognitive.request.roleBindingDigest ||
      executionBinding.agent.authorityDigest !==
        input.cognitive.request.authorityDigest ||
      executionBinding.agent.membershipConfigurationDigest !==
        finalityCertificate.membershipConfigurationDigest ||
      executionBinding.agent.membershipEpoch !== finalityCertificate.epoch ||
      input.cognitive.request.controlPlaneDigest !==
        finalityCertificate.certificateDigest ||
      input.logicalTimeMs < executionBinding.roleBinding.validFromLogicalMs ||
      input.logicalTimeMs > executionBinding.roleBinding.validUntilLogicalMs
    )
      return this.#commitReceipt(input, {
        status: "execution_binding_unavailable",
        ruleDecision,
        credibilityState,
        contextResolution,
        decompositionGraph,
        decompositionMerge,
        allocationPlan,
        semanticGuarantee,
        finalityCertificate,
        cognitiveResult: null,
        cognitiveReceipt: null,
      });

    const cognitive = await this.options.cognitive.execute(
      input.cognitive.request,
      input.cognitive.context,
    );
    return this.#commitReceipt(input, {
      status: "completed",
      ruleDecision,
      credibilityState,
      contextResolution,
      decompositionGraph,
      decompositionMerge,
      allocationPlan,
      semanticGuarantee,
      finalityCertificate,
      cognitiveResult: cognitive.result,
      cognitiveReceipt: cognitive.receipt,
    });
  }

  async load(): Promise<IntegratedCollectiveHostStateV2> {
    const state = await this.#store.load(this.options.hostId);
    if (!state) throw new Error("integrated host is not initialized");
    const validated = await validateIntegratedCollectiveHostStateV2(
      state,
      this.#maximumRetainedReceipts,
      this.options.crypto,
    );
    if (
      validated.hostId !== this.options.hostId ||
      validated.peerId !== this.options.peerId ||
      validated.scopeDigest !== this.options.scopeDigest
    )
      throw new Error("integrated host binding changed");
    return validated;
  }

  #verifySemanticPolicy(): Promise<IntegratedSemanticAcceptancePolicyV2> {
    this.#semanticPolicyVerification ??=
      verifyIntegratedSemanticAcceptancePolicyV2(
        this.#semanticAcceptance,
        this.options.crypto,
      );
    return this.#semanticPolicyVerification;
  }

  async #commitReceipt(
    input: IntegratedCollectiveCycleInputV2,
    body: Omit<
      IntegratedCollectiveCycleReceiptV2,
      | "schemaVersion"
      | "cycleId"
      | "scopeDigest"
      | "hostRevision"
      | "logicalTimeMs"
      | "previousReceiptDigest"
      | "receiptDigest"
    >,
  ): Promise<IntegratedCollectiveCycleReceiptV2> {
    for (let attempt = 0; attempt < this.#maximumCommitAttempts; attempt += 1) {
      const current = await this.load();
      if (current.revision !== input.expectedHostRevision)
        throw new Error("integrated host cycle lost its revision fence");
      if (input.logicalTimeMs < current.logicalTimeHighWaterMs)
        throw new Error("integrated host logical time rollback");
      const receiptBody = {
        schemaVersion: 2 as const,
        cycleId: input.cycleId,
        scopeDigest: input.scopeDigest,
        hostRevision: current.revision + 1,
        ...body,
        logicalTimeMs: input.logicalTimeMs,
        previousReceiptDigest:
          current.retainedReceipts.at(-1)?.receiptDigest ?? null,
      };
      if (
        new TextEncoder().encode(JSON.stringify(receiptBody)).byteLength >
        this.#maximumReceiptBytes
      )
        throw new RangeError("integrated cycle receipt exceeds its byte limit");
      const receipt = immutable({
        ...receiptBody,
        receiptDigest: await collectiveQuorumDigestV1(
          {
            domain: "integrated-collective-cycle-receipt-v2",
            body: receiptBody,
          },
          this.options.crypto,
        ),
      });
      const next = await this.#createState({
        ...current,
        revision: current.revision + 1,
        logicalTimeHighWaterMs: input.logicalTimeMs,
        retainedReceipts: [...current.retainedReceipts, receipt].slice(
          -this.#maximumRetainedReceipts,
        ),
      });
      if (await this.#store.save(next, current.revision)) return receipt;
    }
    throw new Error("integrated host commit attempts exhausted");
  }

  async #createState(
    input: Omit<IntegratedCollectiveHostStateV2, "stateDigest">,
  ): Promise<IntegratedCollectiveHostStateV2> {
    const { stateDigest: _staleStateDigest, ...body } =
      input as IntegratedCollectiveHostStateV2;
    return immutable({
      ...body,
      stateDigest: await collectiveQuorumDigestV1(
        { domain: "integrated-collective-host-state-v2", body },
        this.options.crypto,
      ),
    });
  }

  #validateInput(input: IntegratedCollectiveCycleInputV2): void {
    if (!input || input.schemaVersion !== 2)
      throw new TypeError("integrated cycle schema is invalid");
    identifier(input.cycleId, "cycleId");
    digest(input.scopeDigest, "scopeDigest");
    if (input.scopeDigest !== this.options.scopeDigest)
      throw new TypeError("integrated cycle scope differs from host");
    integer(
      input.expectedHostRevision,
      "expectedHostRevision",
      0,
      Number.MAX_SAFE_INTEGER,
    );
    integer(input.logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
    if (
      input.decomposition.request.logicalTimeMs !== input.logicalTimeMs ||
      input.semanticSample.logicalTimeMs !== input.logicalTimeMs ||
      input.cognitive.request.logicalTimeMs !== input.logicalTimeMs ||
      input.credibility.observation.observedAtLogicalMs > input.logicalTimeMs
    )
      throw new TypeError(
        "integrated cycle component logical times are not bound",
      );
  }
}

function identifier(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/.test(value)
  )
    throw new TypeError(`${label} is invalid`);
}

export async function integratedGovernedRoleBindingDigestV2(
  roleBinding: PortableAgentRoleBindingV1,
  crypto?: Crypto,
): Promise<string> {
  return collectiveQuorumDigestV1(
    {
      domain: "integrated-governed-role-binding-v2",
      body: roleBinding,
    },
    crypto,
  );
}

export async function validateIntegratedCollectiveHostStateV2(
  input: IntegratedCollectiveHostStateV2,
  maximumRetainedReceipts: number,
  crypto?: Crypto,
): Promise<IntegratedCollectiveHostStateV2> {
  if (!input || input.schemaVersion !== 2)
    throw new TypeError("integrated host state schema is invalid");
  identifier(input.hostId, "hostId");
  identifier(input.peerId, "peerId");
  digest(input.scopeDigest, "scopeDigest");
  integer(input.revision, "revision", 0, Number.MAX_SAFE_INTEGER);
  integer(
    input.logicalTimeHighWaterMs,
    "logicalTimeHighWaterMs",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  integer(maximumRetainedReceipts, "maximumRetainedReceipts", 1, 100_000);
  if (input.retainedReceipts.length > maximumRetainedReceipts)
    throw new RangeError("integrated host receipt retention exceeded");
  const cycleIds = new Set<string>();
  let prior: IntegratedCollectiveCycleReceiptV2 | null = null;
  for (const receipt of input.retainedReceipts) {
    if (!receipt || receipt.schemaVersion !== 2)
      throw new TypeError("integrated cycle receipt schema is invalid");
    identifier(receipt.cycleId, "cycleId");
    if (cycleIds.has(receipt.cycleId))
      throw new TypeError("integrated cycle receipt duplicated");
    cycleIds.add(receipt.cycleId);
    digest(receipt.scopeDigest, "receipt.scopeDigest");
    if (receipt.scopeDigest !== input.scopeDigest)
      throw new TypeError("integrated cycle receipt scope invalid");
    integer(receipt.hostRevision, "receipt.hostRevision", 1, input.revision);
    integer(
      receipt.logicalTimeMs,
      "receipt.logicalTimeMs",
      0,
      input.logicalTimeHighWaterMs,
    );
    if (
      ![
        "policy_denied",
        "policy_abstained",
        "context_challenged",
        "context_unavailable",
        "safe_action_selected",
        "allocation_unavailable",
        "semantic_rejected",
        "finality_unavailable",
        "execution_binding_unavailable",
        "completed",
      ].includes(receipt.status)
    )
      throw new TypeError("integrated cycle receipt status invalid");
    if (receipt.previousReceiptDigest !== null)
      digest(receipt.previousReceiptDigest, "previousReceiptDigest");
    if (
      prior &&
      (receipt.hostRevision !== prior.hostRevision + 1 ||
        receipt.logicalTimeMs < prior.logicalTimeMs ||
        receipt.previousReceiptDigest !== prior.receiptDigest)
    )
      throw new TypeError("integrated cycle receipt chain invalid");
    const { receiptDigest, ...body } = receipt;
    digest(receiptDigest, "receiptDigest");
    if (
      (await collectiveQuorumDigestV1(
        { domain: "integrated-collective-cycle-receipt-v2", body },
        crypto,
      )) !== receiptDigest
    )
      throw new TypeError("integrated cycle receipt digest invalid");
    prior = receipt;
  }
  if (
    (input.revision === 0) !== (input.retainedReceipts.length === 0) ||
    (prior !== null && prior.hostRevision !== input.revision)
  )
    throw new TypeError("integrated host revision and receipt history differ");
  const { stateDigest, ...body } = input;
  digest(stateDigest, "stateDigest");
  if (
    (await collectiveQuorumDigestV1(
      { domain: "integrated-collective-host-state-v2", body },
      crypto,
    )) !== stateDigest
  )
    throw new TypeError("integrated host state digest invalid");
  return immutable(input);
}

function digest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value))
    throw new TypeError(`${label} is invalid`);
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

function validateSemanticAcceptance(
  policy: IntegratedSemanticAcceptancePolicyV2,
): void {
  if (!policy || typeof policy !== "object")
    throw new TypeError("integrated semantic acceptance policy is required");
  if (policy.schemaVersion !== 2)
    throw new TypeError(
      "integrated semantic acceptance policy schema is invalid",
    );
  identifier(policy.policyId, "semanticAcceptance.policyId");
  integer(
    policy.policyVersion,
    "semanticAcceptance.policyVersion",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  integer(policy.minimumSamples, "minimumSamples", 1, 100_000);
  for (const [label, value] of Object.entries(policy).filter(([key]) =>
    key.endsWith("BasisPoints"),
  ))
    integer(value, label, 0, 10_000);
  if (
    typeof policy.requireCourseActionDiversity !== "boolean" ||
    typeof policy.requireCourseActionNovelty !== "boolean"
  )
    throw new TypeError(
      "integrated semantic course-action requirements are invalid",
    );
  digest(policy.policyDigest, "semanticAcceptance.policyDigest");
}

export async function createIntegratedSemanticAcceptancePolicyV2(
  input: Omit<
    IntegratedSemanticAcceptancePolicyV2,
    "schemaVersion" | "policyDigest"
  >,
  crypto?: Crypto,
): Promise<IntegratedSemanticAcceptancePolicyV2> {
  const provisional = {
    schemaVersion: 2 as const,
    ...input,
    policyDigest: `sha256:${"0".repeat(64)}`,
  };
  validateSemanticAcceptance(provisional);
  const { policyDigest: _policyDigest, ...body } = provisional;
  return Object.freeze({
    ...body,
    policyDigest: await collectiveQuorumDigestV1(
      {
        domain: "integrated-semantic-acceptance-policy-v2",
        body,
      },
      crypto,
    ),
  });
}

export async function verifyIntegratedSemanticAcceptancePolicyV2(
  input: IntegratedSemanticAcceptancePolicyV2,
  crypto?: Crypto,
): Promise<IntegratedSemanticAcceptancePolicyV2> {
  validateSemanticAcceptance(input);
  const { policyDigest, schemaVersion: _schemaVersion, ...body } = input;
  const rebuilt = await createIntegratedSemanticAcceptancePolicyV2(
    body,
    crypto,
  );
  if (rebuilt.policyDigest !== policyDigest)
    throw new TypeError(
      "integrated semantic acceptance policy digest is invalid",
    );
  return rebuilt;
}

export function integratedSemanticGuaranteeAcceptedV2(
  guarantee: SequentialSemanticGuaranteeV1,
  policy: IntegratedSemanticAcceptancePolicyV2,
): boolean {
  const lowerAtLeast = (
    bound: {
      readonly sampleCount: number;
      readonly lowerBasisPoints: number | null;
    },
    threshold: number,
  ) =>
    bound.sampleCount >= policy.minimumSamples &&
    bound.lowerBasisPoints !== null &&
    bound.lowerBasisPoints >= threshold;
  const upperAtMost = (
    bound: {
      readonly sampleCount: number;
      readonly upperBasisPoints: number | null;
    },
    threshold: number,
  ) =>
    bound.sampleCount >= policy.minimumSamples &&
    bound.upperBasisPoints !== null &&
    bound.upperBasisPoints <= threshold;
  return (
    lowerAtLeast(
      guarantee.roleCoherence,
      policy.minimumRoleCoherenceLowerBasisPoints,
    ) &&
    lowerAtLeast(
      guarantee.missionAlignment,
      policy.minimumMissionAlignmentLowerBasisPoints,
    ) &&
    upperAtMost(
      guarantee.contextConflict,
      policy.maximumContextConflictUpperBasisPoints,
    ) &&
    upperAtMost(
      guarantee.uncertainty,
      policy.maximumUncertaintyUpperBasisPoints,
    ) &&
    (!policy.requireCourseActionDiversity ||
      lowerAtLeast(
        guarantee.courseActionDiversity,
        policy.minimumCourseActionDiversityLowerBasisPoints,
      )) &&
    (!policy.requireCourseActionNovelty ||
      lowerAtLeast(
        guarantee.courseActionNovelty,
        policy.minimumCourseActionNoveltyLowerBasisPoints,
      ))
  );
}

function allocationTasksMatchGraph(
  tasks: readonly StrategicAllocationTaskV1[],
  graph: MissionDecompositionGraphV1,
): boolean {
  if (tasks.length !== graph.tasks.length) return false;
  const nodeById = new Map(graph.tasks.map((item) => [item.taskId, item]));
  const nodeByDigest = new Map(
    graph.tasks.map((item) => [item.taskDigest, item]),
  );
  return tasks.every((task) => {
    const node = nodeById.get(task.taskId);
    if (
      !node ||
      task.taskDigest !== node.taskDigest ||
      task.budgetCeilingUnits !== node.budgetUnits
    )
      return false;
    if (
      task.requiredCapabilityKeys.length !==
        node.requiredCapabilityKeys.length ||
      task.requiredCapabilityKeys.some(
        (item, index) => item !== node.requiredCapabilityKeys[index],
      )
    )
      return false;
    const expectedDependencies = node.dependencyTaskDigests
      .map((digestValue) => nodeByDigest.get(digestValue)?.taskId ?? "")
      .sort();
    return (
      expectedDependencies.length === task.dependsOnTaskIds.length &&
      expectedDependencies.every(
        (item, index) => item !== "" && item === task.dependsOnTaskIds[index],
      )
    );
  });
}

function immutable<T>(value: T): T {
  const clone = structuredClone(value);
  const freeze = (item: unknown): void => {
    if (!item || typeof item !== "object" || Object.isFrozen(item)) return;
    for (const child of Object.values(item as Record<string, unknown>))
      freeze(child);
    Object.freeze(item);
  };
  freeze(clone);
  return clone;
}
