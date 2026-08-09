import type { MissionDecompositionGraphV1 } from "@agentplat/collective-planning/distributed-decomposition";
import {
  GovernedAgentLifecycleRuntimeV1,
  invokeGovernedAgentLifecycleCurrentMembershipV1,
  isGovernedAgentLifecycleRuntimeV1,
} from "@agentplat/collective-membership/governed-agent-lifecycle";
import { collectiveQuorumDigestV1 } from "@agentplat/collective-quorum/crypto";
import {
  validateSparseFinalityCertificateV2,
  type SparseAggregateSignaturePortV2,
  type SparseAgreementMembershipV2,
  type SparseCommitteeCertificateV2,
  type SparseCommitteePolicyV2,
  type SparseFinalityCertificateV2,
} from "@agentplat/collective-quorum/sparse-agreement";
import {
  validateStrategicAllocationPolicyV1,
  type StrategicAllocationPlanV1,
} from "@agentplat/collective-runtime/strategic-allocation";
import {
  autonomousCompromiseRecoveryScopeV1,
  AutonomousCompromiseRecoveryNotReadyErrorV1,
  AutonomousCompromiseRecoveryRuntimeV1,
  hasAutonomousCompromiseRecoveryClosedRegistryPairV1,
  invokeAutonomousCompromiseRecoveryGateExecutionV1,
  invokeAutonomousCompromiseRecoveryRequireNodeProgressV1,
  invokeAutonomousCompromiseRecoveryTickV1,
  isAutonomousCompromiseRecoveryBoundToAssignmentAuthorityV1,
  isAutonomousCompromiseRecoveryBoundToLifecycleV1,
  isAutonomousCompromiseRecoveryRuntimeV1,
  type CompromiseRecoveryAssignmentFenceInstallerV1,
} from "@agentplat/collective-runtime/compromise-aware-recovery";
import {
  governedRoleCatalogMissionIdV2,
  GovernedRoleCatalogRuntimeV2,
  isGovernedRoleCatalogRuntimeV2,
} from "@agentplat/inference-control/governed-role-evolution";
import {
  isOperationalCognitiveControllerBoundToDurableHorizonBudgetV1,
  isOperationalCognitiveControllerBoundToSemanticGuaranteesV1,
  isOperationalCognitiveControllerV1,
} from "@agentplat/inference-control/operational-control";
import { isSequentialSemanticGuaranteeEngineV1 } from "@agentplat/inference-control/semantic-metrics";
import type { MeshSparseOverlayDigestV2 } from "@agentplat/mesh/overlay";

import {
  AssuranceCoupledExecutionRuntimeV1,
  type AssuranceCoupledFinalityPortV1,
  type AssuranceExecutionAuthorityPortV1,
  type AssuranceExecutionAuthorityFenceV1,
  type AssuranceExecutionCurrentnessPortV1,
} from "./assurance-coupled-execution.js";
import {
  AutonomousAdaptationRuntimeV1,
  isAutonomousAdaptationRuntimeV1,
  isRestartDurableAutonomousAdaptationStoreV1,
  type AutonomousAdaptationActionV1,
  type AutonomousAdaptationFinalityPortV1,
  type AutonomousAdaptationSafetyPortV1,
  type AutonomousMissionSignalV1,
  type RestartDurableAutonomousAdaptationStoreV1,
} from "./autonomous-adaptation-runtime.js";
import {
  AutonomousCollectiveNodeRuntimeV1,
  isAutonomousCollectiveNodeRuntimeV1,
  type AutonomousCollectiveNodeStateV1,
  type AutonomousCollectivePlanningFinalityPortV1,
} from "./autonomous-collective-node.js";
import {
  DistributedCollectiveProtocolRuntimeV1,
  isDistributedCollectiveProtocolBoundToV1,
  isDistributedCollectiveProtocolRuntimeV1,
  validateDistributedCollectiveMessageV1,
  type DistributedCollectiveMessageV1,
  type DistributedCollectiveMembershipPortV1,
  type DistributedCollectiveProtocolStateV1,
} from "./distributed-collective-protocol.js";
import { DistributedPlanningRuntimeV1 } from "./distributed-planning-runtime.js";
import {
  isCollectiveHostDurableTelemetryPortV1,
  isCollectiveHostTelemetryPortBoundToIdentityV1,
} from "./collective-telemetry.js";
import {
  AnytimeSemanticHorizonCouplingV1,
  isAnytimeSemanticHorizonCouplingV1,
} from "./semantic-horizon-coupling.js";
import {
  GovernedRoleCatalogCurrentnessV1,
  ReferenceLocalCatalogRuntimeV1,
  ReferenceOperationalCognitiveExecutionPortV1,
} from "./reference-local-ports.js";

export type ReferenceCollectiveDecisionClassV1 =
  "planning" | "execution" | "adaptation";

/**
 * The only finality boundary left to an embedding. Implementations submit the
 * exact proposal/value pair to their sparse agreement network and return the
 * resulting certificate together with the shard certificates needed for
 * independent verification.
 */
export interface SparseBftFinalityGatewayV1 {
  certify(input: {
    readonly decisionClass: ReferenceCollectiveDecisionClassV1;
    readonly decisionId: string;
    readonly proposalDigest: string;
    readonly valueDigest: string;
    readonly commandBindingDigest?: string | null;
    readonly evidenceDigests: readonly string[];
    readonly logicalTimeMs: number;
  }): Promise<{
    readonly certificate: SparseFinalityCertificateV2;
    readonly shardCertificates: readonly SparseCommitteeCertificateV2[];
  } | null>;
  shardCertificates(input: {
    readonly certificate: SparseFinalityCertificateV2;
    readonly logicalTimeMs: number;
  }): Promise<readonly SparseCommitteeCertificateV2[] | null>;
  /**
   * Looks up an already-finalized envelope by its complete durable identity.
   * Implementations must not start a new agreement round from this method.
   */
  reconcileCertification?(input: {
    readonly decisionClass: ReferenceCollectiveDecisionClassV1;
    readonly decisionId: string;
    readonly proposalDigest: string;
    readonly valueDigest: string;
    readonly commandBindingDigest: string;
    readonly logicalTimeMs: number;
  }): Promise<{
    readonly certificate: SparseFinalityCertificateV2;
    readonly shardCertificates: readonly SparseCommitteeCertificateV2[];
  } | null>;
}

const restartDurableSparseBftFinalityGatewaysV1 = new WeakSet<object>();

export type RestartDurableSparseBftFinalityGatewayV1 =
  SparseBftFinalityGatewayV1;

/**
 * Explicit operator assertion that certification envelopes and their complete
 * lookup bindings survive process restart. Structural lookalikes are rejected.
 */
export function declareRestartDurableSparseBftFinalityGatewayV1<
  T extends SparseBftFinalityGatewayV1,
>(gateway: T): T & RestartDurableSparseBftFinalityGatewayV1 {
  if (
    !gateway ||
    typeof gateway.certify !== "function" ||
    typeof gateway.shardCertificates !== "function" ||
    typeof gateway.reconcileCertification !== "function"
  )
    throw new TypeError(
      "restart-durable sparse BFT gateway must support exact certification reconciliation",
    );
  restartDurableSparseBftFinalityGatewaysV1.add(gateway);
  return gateway;
}

export function isRestartDurableSparseBftFinalityGatewayV1(
  gateway: unknown,
): gateway is RestartDurableSparseBftFinalityGatewayV1 {
  return (
    typeof gateway === "object" &&
    gateway !== null &&
    restartDurableSparseBftFinalityGatewaysV1.has(gateway)
  );
}

export interface VerifiedSparseBftFinalityRuntimeOptionsV1 {
  readonly membership: SparseAgreementMembershipV2;
  readonly policy: SparseCommitteePolicyV2;
  readonly signatures: SparseAggregateSignaturePortV2;
  readonly gateway: SparseBftFinalityGatewayV1;
  /** Bounded local verification cache; evicted entries are reloaded. */
  readonly maximumCachedCertificates?: number;
  readonly crypto?: Crypto;
}

/** Exact construction-time identities retained behind the nominal runtime. */
export interface VerifiedSparseBftFinalityAuthorityBindingV1 {
  readonly membership: SparseAgreementMembershipV2;
  readonly policy: SparseCommitteePolicyV2;
  readonly signatures: SparseAggregateSignaturePortV2;
  readonly gateway: SparseBftFinalityGatewayV1;
  readonly crypto: Crypto | undefined;
}

interface VerifiedSparseBftFinalityDependenciesV1 {
  readonly certify: SparseBftFinalityGatewayV1["certify"];
  readonly shardCertificates: SparseBftFinalityGatewayV1["shardCertificates"];
  readonly reconcileCertification: NonNullable<
    SparseBftFinalityGatewayV1["reconcileCertification"]
  > | null;
}

const verifiedSparseBftFinalityDependenciesV1 = new WeakMap<
  object,
  VerifiedSparseBftFinalityDependenciesV1
>();
const verifiedSparseBftFinalityAuthorityBindingsV1 = new WeakMap<
  object,
  VerifiedSparseBftFinalityAuthorityBindingV1
>();
const verifiedSparseBftFinalityBrandsV1 = new WeakSet<object>();

/**
 * One verified sparse-BFT boundary adapted to planning finality, protected
 * execution finality, and adaptation finality. The gateway may transport
 * rounds, but it cannot replace local certificate verification.
 */
export class VerifiedSparseBftFinalityRuntimeV1 {
  readonly #verifiedShards = new Map<
    string,
    readonly SparseCommitteeCertificateV2[]
  >();
  readonly #maximumCachedCertificates: number;
  declare readonly options: VerifiedSparseBftFinalityRuntimeOptionsV1;

  constructor(input: VerifiedSparseBftFinalityRuntimeOptionsV1) {
    const membership = input?.membership;
    const policy = input?.policy;
    const signatures = input?.signatures;
    const gateway = input?.gateway;
    const maximumCachedCertificates = input?.maximumCachedCertificates;
    const configuredCrypto = input?.crypto;
    const certify = gateway?.certify;
    const shardCertificates = gateway?.shardCertificates;
    const reconcileCertification = gateway?.reconcileCertification;
    const verifyShare = signatures?.verifyShare;
    const aggregate = signatures?.aggregate;
    const verifyAggregate = signatures?.verifyAggregate;
    const signatureAlgorithm = signatures?.algorithm;
    if (!membership || !policy || !signatures || !gateway)
      throw new TypeError(
        "verified sparse BFT finality dependencies are required",
      );
    if (
      typeof certify !== "function" ||
      typeof shardCertificates !== "function"
    )
      throw new TypeError("sparse BFT finality gateway is invalid");
    if (
      typeof signatureAlgorithm !== "string" ||
      typeof verifyShare !== "function" ||
      typeof aggregate !== "function" ||
      typeof verifyAggregate !== "function"
    )
      throw new TypeError("sparse BFT signature authority is invalid");
    const membershipSnapshot = immutable(membership);
    const policySnapshot = immutable(policy);
    const crypto = captureDigestCrypto(configuredCrypto);
    const signatureSnapshot: SparseAggregateSignaturePortV2 = Object.freeze({
      algorithm: signatureAlgorithm,
      verifyShare: verifyShare.bind(signatures),
      aggregate: aggregate.bind(signatures),
      verifyAggregate: verifyAggregate.bind(signatures),
    });
    const gatewaySnapshot: SparseBftFinalityGatewayV1 = Object.freeze({
      certify: certify.bind(gateway),
      shardCertificates: shardCertificates.bind(gateway),
      ...(typeof reconcileCertification === "function"
        ? { reconcileCertification: reconcileCertification.bind(gateway) }
        : {}),
    });
    verifiedSparseBftFinalityDependenciesV1.set(
      this,
      Object.freeze({
        certify: gatewaySnapshot.certify,
        shardCertificates: gatewaySnapshot.shardCertificates,
        reconcileCertification: gatewaySnapshot.reconcileCertification ?? null,
      }),
    );
    verifiedSparseBftFinalityAuthorityBindingsV1.set(
      this,
      Object.freeze({
        membership,
        policy,
        signatures,
        gateway,
        crypto: configuredCrypto,
      }),
    );
    this.#maximumCachedCertificates = maximumCachedCertificates ?? 4_096;
    integer(
      this.#maximumCachedCertificates,
      "maximumCachedCertificates",
      1,
      100_000,
    );
    Object.defineProperty(this, "options", {
      value: Object.freeze({
        membership: membershipSnapshot,
        policy: policySnapshot,
        signatures: signatureSnapshot,
        gateway: gatewaySnapshot,
        maximumCachedCertificates: this.#maximumCachedCertificates,
        crypto,
      }),
      writable: false,
      configurable: false,
      enumerable: true,
    });
    Object.defineProperties(this, {
      planning: immutableProperty(Object.freeze(this.planning)),
      execution: immutableProperty(Object.freeze(this.execution)),
      adaptation: immutableProperty(Object.freeze(this.adaptation)),
    });
    verifiedSparseBftFinalityBrandsV1.add(this);
  }

  readonly planning: AutonomousCollectivePlanningFinalityPortV1 = {
    certify: async (input) => {
      const expectedDecisionDigest = await collectiveQuorumDigestV1(
        {
          domain: "autonomous-collective-planning-decision-v1",
          body: {
            cycle: input.cycle,
            graphDigest: input.graph.graphDigest,
            allocationPlanDigest: input.plan.planDigest,
            admittedMessageDigests: canonicalDigests(
              input.admittedMessageDigests,
            ),
            logicalTimeMs: input.logicalTimeMs,
          },
        },
        this.options.crypto,
      );
      if (input.decisionDigest !== expectedDecisionDigest)
        throw new TypeError(
          "planning decision digest is not derived from the distributed planning view",
        );
      const valueDigest = await planningValueDigest(
        input.graph,
        input.plan,
        this.options.crypto,
      );
      return this.#certify({
        decisionClass: "planning",
        decisionId: input.cycle.cycleId,
        proposalDigest: input.decisionDigest,
        valueDigest,
        commandBindingDigest: input.commandBindingDigest,
        evidenceDigests: [
          input.graph.graphDigest,
          input.plan.planDigest,
          ...input.admittedMessageDigests,
        ],
        logicalTimeMs: input.logicalTimeMs,
      });
    },
    verify: async (input) =>
      this.#verify({
        certificate: input.certificate,
        proposalDigest: input.decisionDigest,
        valueDigest: await planningBindingDigest(
          input.graphDigest,
          input.allocationPlanDigest,
          this.options.crypto,
        ),
        logicalTimeMs: input.logicalTimeMs,
      }),
    reconcileCertification: async (input) => {
      const expectedDecisionDigest = await collectiveQuorumDigestV1(
        {
          domain: "autonomous-collective-planning-decision-v1",
          body: {
            cycle: input.cycle,
            graphDigest: input.graph.graphDigest,
            allocationPlanDigest: input.plan.planDigest,
            admittedMessageDigests: canonicalDigests(
              input.admittedMessageDigests,
            ),
            logicalTimeMs: input.logicalTimeMs,
          },
        },
        this.options.crypto,
      );
      if (input.decisionDigest !== expectedDecisionDigest)
        throw new TypeError(
          "planning reconciliation digest is not derived from the distributed planning view",
        );
      return this.#reconcileCertification({
        decisionClass: "planning",
        decisionId: input.cycle.cycleId,
        proposalDigest: input.decisionDigest,
        valueDigest: await planningValueDigest(
          input.graph,
          input.plan,
          this.options.crypto,
        ),
        commandBindingDigest: input.commandBindingDigest,
        logicalTimeMs: input.logicalTimeMs,
      });
    },
  };

  readonly execution: AssuranceCoupledFinalityPortV1 = {
    verifyPlanning: async (input) =>
      this.#verify({
        certificate: input.certificate,
        proposalDigest: input.planningDecisionDigest,
        valueDigest: await planningBindingDigest(
          input.graphDigest,
          input.allocationPlanDigest,
          this.options.crypto,
        ),
        logicalTimeMs: input.logicalTimeMs,
      }),
    certifyExecution: async (input) => {
      if (
        (input.anytimeSemanticGuaranteeDigest === null) !==
        (input.semanticHorizonDecisionDigest === null)
      )
        throw new TypeError(
          "execution finality semantic horizon binding is incomplete",
        );
      if (input.anytimeSemanticGuaranteeDigest !== null)
        digest(
          input.anytimeSemanticGuaranteeDigest,
          "anytimeSemanticGuaranteeDigest",
        );
      if (input.semanticHorizonDecisionDigest !== null)
        digest(
          input.semanticHorizonDecisionDigest,
          "semanticHorizonDecisionDigest",
        );
      return this.#certify({
        decisionClass: "execution",
        decisionId: input.executionId,
        proposalDigest: input.decisionDigest,
        valueDigest: input.effectProposalDigest,
        commandBindingDigest: null,
        evidenceDigests: [
          input.graphDigest,
          input.allocationPlanDigest,
          input.awardDigest,
          input.taskDigest,
          input.planningDecisionDigest,
          input.planningFinalityCertificateDigest,
          input.cognitivePayloadDigest,
          input.cognitiveMetadataDigest,
          input.cognitiveAuthorityDigest,
          input.cognitiveRoleBindingDigest,
          input.cognitiveReceiptDigest,
          input.outputDigest,
          input.semanticGuaranteeDigest,
          ...(input.anytimeSemanticGuaranteeDigest
            ? [input.anytimeSemanticGuaranteeDigest]
            : []),
          ...(input.semanticHorizonDecisionDigest
            ? [input.semanticHorizonDecisionDigest]
            : []),
          input.assessmentDigest,
          input.effectProposalDigest,
          ...(input.authorityFenceDigest ? [input.authorityFenceDigest] : []),
        ],
        logicalTimeMs: input.logicalTimeMs,
      });
    },
    verifyExecution: async (input) =>
      this.#verify({
        certificate: input.certificate,
        proposalDigest: input.decisionDigest,
        valueDigest: input.effectProposalDigest,
        logicalTimeMs: input.logicalTimeMs,
      }),
  };

  readonly adaptation: AutonomousAdaptationFinalityPortV1 = {
    certify: async (input) =>
      this.#certify({
        decisionClass: "adaptation",
        decisionId: input.cycleId,
        proposalDigest: input.bundleDigest,
        valueDigest: input.bundleDigest,
        commandBindingDigest: null,
        evidenceDigests: [
          ...input.actionDigests,
          ...input.signalDigests,
          input.safetyDecisionDigest,
        ],
        logicalTimeMs: input.logicalTimeMs,
      }),
    verify: async (input) =>
      this.#verify({
        certificate: input.certificate,
        proposalDigest: input.bundleDigest,
        valueDigest: input.bundleDigest,
        logicalTimeMs: input.logicalTimeMs,
      }),
  };

  async #certify(input: {
    readonly decisionClass: ReferenceCollectiveDecisionClassV1;
    readonly decisionId: string;
    readonly proposalDigest: string;
    readonly valueDigest: string;
    readonly commandBindingDigest: string | null;
    readonly evidenceDigests: readonly string[];
    readonly logicalTimeMs: number;
  }): Promise<SparseFinalityCertificateV2 | null> {
    identifier(input.decisionId, "decisionId");
    digest(input.proposalDigest, "proposalDigest");
    digest(input.valueDigest, "valueDigest");
    if (input.commandBindingDigest !== null)
      digest(input.commandBindingDigest, "commandBindingDigest");
    const evidenceDigests = canonicalDigests(input.evidenceDigests);
    const dependencies = this.#dependencies();
    const delivered = await dependencies.certify({
      ...input,
      evidenceDigests,
    });
    if (!delivered) return null;
    const certificate = immutable(delivered.certificate);
    const shardCertificates = immutable(delivered.shardCertificates);
    if (certificate.finalizedAtLogicalMs !== input.logicalTimeMs) return null;
    if (
      !(await this.#verifyEnvelope(
        certificate,
        shardCertificates,
        input.proposalDigest,
        input.valueDigest,
        input.logicalTimeMs,
      ))
    )
      return null;
    this.#cacheVerifiedShards(certificate.certificateDigest, shardCertificates);
    return certificate;
  }

  async #reconcileCertification(input: {
    readonly decisionClass: ReferenceCollectiveDecisionClassV1;
    readonly decisionId: string;
    readonly proposalDigest: string;
    readonly valueDigest: string;
    readonly commandBindingDigest: string;
    readonly logicalTimeMs: number;
  }): Promise<SparseFinalityCertificateV2 | null> {
    identifier(input.decisionId, "decisionId");
    digest(input.proposalDigest, "proposalDigest");
    digest(input.valueDigest, "valueDigest");
    digest(input.commandBindingDigest, "commandBindingDigest");
    integer(input.logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
    const reconcile = this.#dependencies().reconcileCertification;
    if (!reconcile) return null;
    const delivered = await reconcile(input);
    if (!delivered) return null;
    const certificate = immutable(delivered.certificate);
    const shardCertificates = immutable(delivered.shardCertificates);
    if (
      !(await this.#verifyEnvelope(
        certificate,
        shardCertificates,
        input.proposalDigest,
        input.valueDigest,
        input.logicalTimeMs,
      ))
    )
      return null;
    this.#cacheVerifiedShards(certificate.certificateDigest, shardCertificates);
    return certificate;
  }

  async #verify(input: {
    readonly certificate: SparseFinalityCertificateV2;
    readonly proposalDigest: string;
    readonly valueDigest: string;
    readonly logicalTimeMs: number;
  }): Promise<boolean> {
    const certificate = immutable(input.certificate);
    let shards =
      this.#verifiedShards.get(certificate.certificateDigest) ?? null;
    if (!shards) {
      shards = await this.#dependencies().shardCertificates({
        certificate,
        logicalTimeMs: input.logicalTimeMs,
      });
    }
    if (!shards) return false;
    const shardSnapshot = immutable(shards);
    const verified = await this.#verifyEnvelope(
      certificate,
      shardSnapshot,
      input.proposalDigest,
      input.valueDigest,
      input.logicalTimeMs,
    );
    if (verified)
      this.#cacheVerifiedShards(certificate.certificateDigest, shardSnapshot);
    return verified;
  }

  #cacheVerifiedShards(
    certificateDigest: string,
    shards: readonly SparseCommitteeCertificateV2[],
  ): void {
    this.#verifiedShards.delete(certificateDigest);
    this.#verifiedShards.set(certificateDigest, shards);
    while (this.#verifiedShards.size > this.#maximumCachedCertificates) {
      const oldest = this.#verifiedShards.keys().next().value as
        string | undefined;
      if (oldest === undefined) break;
      this.#verifiedShards.delete(oldest);
    }
  }

  async #verifyEnvelope(
    certificate: SparseFinalityCertificateV2,
    shardCertificates: readonly SparseCommitteeCertificateV2[],
    proposalDigest: string,
    valueDigest: string,
    logicalTimeMs: number,
  ): Promise<boolean> {
    integer(logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
    if (
      !certificate ||
      certificate.proposalDigest !== proposalDigest ||
      certificate.valueDigest !== valueDigest ||
      certificate.epoch !== this.options.membership.epoch ||
      certificate.membershipConfigurationDigest !==
        this.options.membership.configurationDigest ||
      certificate.policyDigest !== this.options.policy.policyDigest ||
      certificate.finalizedAtLogicalMs > logicalTimeMs
    )
      return false;
    try {
      return await validateSparseFinalityCertificateV2({
        certificate,
        shardCertificates,
        membership: this.options.membership,
        policy: this.options.policy,
        signatures: this.options.signatures,
        crypto: this.options.crypto,
      });
    } catch {
      return false;
    }
  }

  #dependencies(): VerifiedSparseBftFinalityDependenciesV1 {
    const dependencies = verifiedSparseBftFinalityDependenciesV1.get(this);
    if (!dependencies)
      throw new TypeError(
        "verified sparse BFT finality runtime is not genuine",
      );
    return dependencies;
  }
}

/** Nominal runtime check; structural lookalikes and prototype-only values fail. */
export function isVerifiedSparseBftFinalityRuntimeV1(
  value: unknown,
): value is VerifiedSparseBftFinalityRuntimeV1 {
  return (
    typeof value === "object" &&
    value !== null &&
    verifiedSparseBftFinalityBrandsV1.has(value) &&
    verifiedSparseBftFinalityDependenciesV1.has(value) &&
    verifiedSparseBftFinalityAuthorityBindingsV1.has(value)
  );
}

/** Checks every construction-time finality authority by object identity. */
export function isVerifiedSparseBftFinalityBoundToV1(
  runtime: unknown,
  binding: VerifiedSparseBftFinalityAuthorityBindingV1,
): runtime is VerifiedSparseBftFinalityRuntimeV1 {
  if (!isVerifiedSparseBftFinalityRuntimeV1(runtime) || !binding) return false;
  const retained = verifiedSparseBftFinalityAuthorityBindingsV1.get(runtime)!;
  return (
    retained.membership === binding.membership &&
    retained.policy === binding.policy &&
    retained.signatures === binding.signatures &&
    retained.gateway === binding.gateway &&
    retained.crypto === binding.crypto
  );
}

export interface ReferenceAdaptationInvariantPolicyV1 {
  readonly maximumRiskBasisPoints: number;
  readonly allowedDomains: readonly AutonomousAdaptationActionV1["domain"][];
  readonly allowedAuthorityCeilingDigests: readonly string[];
}

/** Static local invariants. Remote evidence can trigger evaluation, not widen it. */
export class ReferenceAdaptationInvariantGateV1 implements AutonomousAdaptationSafetyPortV1 {
  readonly #allowedDomains: ReadonlySet<AutonomousAdaptationActionV1["domain"]>;
  readonly #allowedAuthorityCeilings: ReadonlySet<string>;
  readonly #maximumRiskBasisPoints: number;
  readonly #missionId: string;
  readonly #policyDigest: string;
  readonly #currentStateDigest: () => Promise<string>;
  readonly #crypto: Crypto | undefined;

  constructor(
    readonly options: {
      readonly missionId: string;
      readonly policyDigest: string;
      readonly currentStateDigest: () => Promise<string>;
      readonly invariants: ReferenceAdaptationInvariantPolicyV1;
      readonly crypto?: Crypto;
    },
  ) {
    identifier(options.missionId, "missionId");
    digest(options.policyDigest, "policyDigest");
    const maximumRiskBasisPoints = integer(
      options.invariants.maximumRiskBasisPoints,
      "maximumRiskBasisPoints",
      0,
      10_000,
    );
    if (
      options.invariants.allowedDomains.some(
        (item) =>
          !(["mission", "strategy", "role", "team"] as const).includes(item),
      )
    )
      throw new TypeError("adaptation invariant domain is invalid");
    this.#allowedDomains = new Set(options.invariants.allowedDomains);
    if (this.#allowedDomains.size !== options.invariants.allowedDomains.length)
      throw new TypeError("adaptation invariant domain is duplicated");
    options.invariants.allowedAuthorityCeilingDigests.forEach((item) =>
      digest(item, "authorityCeilingDigest"),
    );
    this.#allowedAuthorityCeilings = new Set(
      options.invariants.allowedAuthorityCeilingDigests,
    );
    const currentStateDigest = options.currentStateDigest;
    if (typeof currentStateDigest !== "function")
      throw new TypeError("adaptation current state resolver is required");
    const invariants = immutable({
      maximumRiskBasisPoints,
      allowedDomains: [...this.#allowedDomains],
      allowedAuthorityCeilingDigests: [...this.#allowedAuthorityCeilings],
    });
    this.#maximumRiskBasisPoints = maximumRiskBasisPoints;
    this.#missionId = options.missionId;
    this.#policyDigest = options.policyDigest;
    this.#currentStateDigest = currentStateDigest.bind(options);
    this.#crypto = options.crypto;
    Object.defineProperty(this, "options", {
      value: Object.freeze({
        missionId: this.#missionId,
        policyDigest: this.#policyDigest,
        currentStateDigest: this.#currentStateDigest,
        invariants,
        ...(this.#crypto ? { crypto: this.#crypto } : {}),
      }),
      writable: false,
      configurable: false,
      enumerable: true,
    });
  }

  async evaluate(input: {
    readonly cycleId: string;
    readonly actions: readonly AutonomousAdaptationActionV1[];
    readonly signals: readonly AutonomousMissionSignalV1[];
    readonly logicalTimeMs: number;
  }) {
    const currentStateDigest = await this.#currentStateDigest();
    digest(currentStateDigest, "currentStateDigest");
    const violations = new Set<string>();
    for (const action of input.actions) {
      if (!this.#allowedDomains.has(action.domain))
        violations.add("domain_not_allowed");
      if (action.maximumRiskBasisPoints > this.#maximumRiskBasisPoints)
        violations.add("risk_ceiling_exceeded");
      if (!this.#allowedAuthorityCeilings.has(action.authorityCeilingDigest))
        violations.add("authority_ceiling_not_allowed");
    }
    const disposition =
      violations.size === 0 ? ("allow" as const) : ("deny" as const);
    const reasonCodes =
      violations.size === 0
        ? ["local_invariants_satisfied"]
        : [...violations].sort();
    const evidenceDigests = canonicalDigests([
      currentStateDigest,
      ...input.actions.map((item) => item.actionDigest),
      ...input.signals.map((item) => item.signalDigest),
    ]);
    const body = {
      cycleId: input.cycleId,
      missionId: this.#missionId,
      policyDigest: this.#policyDigest,
      currentStateDigest,
      signalDigests: input.signals.map((item) => item.signalDigest).sort(),
      actionDigests: input.actions.map((item) => item.actionDigest),
      disposition,
      reasonCodes,
      evidenceDigests,
      logicalTimeMs: input.logicalTimeMs,
    };
    return immutable({
      disposition,
      reasonCodes,
      evidenceDigests,
      decisionDigest: await collectiveQuorumDigestV1(
        {
          domain: "autonomous-adaptation-safety-decision-v1",
          body,
        },
        this.#crypto,
      ),
    });
  }
}

/** Uses the protocol's immutable membership view for adaptation signal admission. */
export class ProtocolBoundAdaptationSignalAdmissionV1 {
  readonly #verifyPeer: DistributedCollectiveMembershipPortV1["verifyPeer"];
  readonly #resolveIndependenceGroup: NonNullable<
    DistributedCollectiveMembershipPortV1["resolveIndependenceGroup"]
  >;

  constructor(
    readonly options: {
      readonly membership: DistributedCollectiveMembershipPortV1;
      readonly scopeDigest: string;
    },
  ) {
    digest(options.scopeDigest, "scopeDigest");
    const verifyPeer = options.membership?.verifyPeer;
    const resolveIndependenceGroup =
      options.membership?.resolveIndependenceGroup;
    if (
      !options.membership ||
      typeof verifyPeer !== "function" ||
      typeof resolveIndependenceGroup !== "function"
    )
      throw new TypeError(
        "collective membership and independence-group authority are required",
      );
    this.#verifyPeer = verifyPeer.bind(options.membership);
    this.#resolveIndependenceGroup = resolveIndependenceGroup.bind(
      options.membership,
    );
  }

  async admit(input: {
    readonly signal: AutonomousMissionSignalV1;
    readonly issuerInstanceId: string;
    readonly issuerKeyId: string;
    readonly membershipConfigurationDigest: string;
    readonly logicalTimeMs: number;
  }): Promise<boolean> {
    if (
      !(await this.#verifyPeer({
        peerId: input.signal.sourcePeerId,
        instanceId: input.issuerInstanceId,
        keyId: input.issuerKeyId,
        membershipConfigurationDigest: input.membershipConfigurationDigest,
        scopeDigest: this.options.scopeDigest,
        logicalTimeMs: input.logicalTimeMs,
      }))
    )
      return false;
    const authorizedGroup = await this.#resolveIndependenceGroup({
      peerId: input.signal.sourcePeerId,
      instanceId: input.issuerInstanceId,
      keyId: input.issuerKeyId,
      membershipConfigurationDigest: input.membershipConfigurationDigest,
    });
    if (authorizedGroup === null) return false;
    identifier(authorizedGroup, "authorizedIndependenceGroupId");
    return authorizedGroup === input.signal.sourceIndependenceGroupId;
  }
}

type ProtocolOptions = ConstructorParameters<
  typeof DistributedCollectiveProtocolRuntimeV1
>[0];
type PlanningOptions = ConstructorParameters<
  typeof DistributedPlanningRuntimeV1
>[0];
type ExecutionOptions = ConstructorParameters<
  typeof AssuranceCoupledExecutionRuntimeV1
>[0];
type AdaptationOptions = ConstructorParameters<
  typeof AutonomousAdaptationRuntimeV1
>[0];
type NodeOptions = ConstructorParameters<
  typeof AutonomousCollectiveNodeRuntimeV1
>[0];
type FinalityOptions = ConstructorParameters<
  typeof VerifiedSparseBftFinalityRuntimeV1
>[0];
type LocalOptions = ConstructorParameters<
  typeof ReferenceLocalCatalogRuntimeV1
>[0];

export interface ReferenceIntegratedCollectiveStackOptionsV1 {
  readonly protocol: ProtocolOptions;
  readonly planning: Omit<PlanningOptions, "protocol" | "allocationEvidence">;
  readonly local: Omit<LocalOptions, "lifecycle" | "roles"> & {
    readonly lifecycle: GovernedAgentLifecycleRuntimeV1;
    readonly governedRoleCatalog: GovernedRoleCatalogRuntimeV2;
  };
  readonly execution: Omit<
    ExecutionOptions,
    | "localPeerId"
    | "allocationPolicy"
    | "finality"
    | "cognitive"
    | "currentness"
    | "authority"
    | "operationalControl"
    | "requireSemanticHorizon"
    | "semanticHorizon"
    | "semanticStateKey"
    | "semanticHorizonBudgetStore"
    | "semanticHorizonBudgetStateKey"
    | "semanticHorizonBudgetMonotonicAnchor"
  > & {
    readonly operationalControl: NonNullable<
      ExecutionOptions["operationalControl"]
    >;
    readonly semanticHorizon: AnytimeSemanticHorizonCouplingV1;
    readonly semanticStateKey: string;
    readonly semanticHorizonBudgetStore: NonNullable<
      ExecutionOptions["semanticHorizonBudgetStore"]
    >;
    readonly semanticHorizonBudgetStateKey: string;
    readonly semanticHorizonBudgetMonotonicAnchor: NonNullable<
      ExecutionOptions["semanticHorizonBudgetMonotonicAnchor"]
    >;
  };
  readonly adaptation: Omit<
    AdaptationOptions,
    | "protocol"
    | "currentStateDigest"
    | "signalAdmission"
    | "safety"
    | "finality"
    | "store"
  > & {
    readonly invariants: ReferenceAdaptationInvariantPolicyV1;
    readonly currentStateDigest?: () => Promise<string>;
    /** Required explicitly because the reference continuity route cannot use the in-memory default. */
    readonly store: RestartDurableAutonomousAdaptationStoreV1;
  };
  readonly node: Omit<
    NodeOptions,
    | "protocol"
    | "planning"
    | "execution"
    | "adaptation"
    | "planningFinality"
    | "localPlanning"
    | "taskMaterializer"
    | "taskContextRehydrator"
  >;
  readonly finality: FinalityOptions;
  /** Certified, bounded recovery supervisor; raw detector output is not accepted. */
  readonly recovery: AutonomousCompromiseRecoveryRuntimeV1;
  /** Same durable authority used by every recovery saga and effect commit. */
  readonly recoveryAssignmentAuthority: ReferenceRecoveryAssignmentAuthorityV1;
}

export interface ReferenceIntegratedCollectiveStackV1 {
  /** Capability-safe facade; internal authority and certification ports remain private. */
  readonly node: {
    readonly initialize: AutonomousCollectiveNodeRuntimeV1["initialize"];
    readonly loadOptional: AutonomousCollectiveNodeRuntimeV1["loadOptional"];
    readonly load: AutonomousCollectiveNodeRuntimeV1["load"];
    readonly submitMission: AutonomousCollectiveNodeRuntimeV1["submitMission"];
    readonly receive: AutonomousCollectiveNodeRuntimeV1["receive"];
    readonly advance: AutonomousCollectiveNodeRuntimeV1["advance"];
  };
}

export class ReferenceCollectiveMembershipGenerationChangedErrorV1 extends Error {
  constructor(
    readonly expectedConfigurationDigest: string,
    readonly currentConfigurationDigest: string,
    readonly currentEpoch: number,
  ) {
    super(
      "reference collective membership generation changed; rebuild the stack",
    );
    this.name = "ReferenceCollectiveMembershipGenerationChangedErrorV1";
  }
}

export interface ReferenceMembershipGenerationV1 {
  readonly configurationDigest: string;
  readonly epoch: number;
}

/**
 * One durable repository installs recovery fences, resolves the current
 * assignment and atomically compares assignment plus membership while
 * committing an idempotent protected effect.
 */
export interface ReferenceRecoveryAssignmentAuthorityV1
  extends
    CompromiseRecoveryAssignmentFenceInstallerV1,
    AssuranceExecutionAuthorityPortV1 {}

export interface ReferenceIntegratedCollectiveStackSnapshotV1 {
  readonly schemaVersion: 1;
  readonly node: AutonomousCollectiveNodeStateV1 | null;
  readonly protocol: DistributedCollectiveProtocolStateV1 | null;
}

export interface ReferenceIntegratedCollectiveStackBindingV1 {
  readonly plane: ProtocolOptions["plane"];
  readonly artifacts: ProtocolOptions["artifacts"];
  readonly authenticity: ProtocolOptions["authenticity"];
  readonly protocolMembership: ProtocolOptions["membership"];
  readonly crypto: Crypto | undefined;
  readonly finalityMembership: FinalityOptions["membership"];
  readonly finalityPolicy: FinalityOptions["policy"];
  readonly finalitySignatures: FinalityOptions["signatures"];
  readonly finalityGateway: FinalityOptions["gateway"];
  readonly recoveryAssignmentAuthority: ReferenceRecoveryAssignmentAuthorityV1;
}

export interface ReferenceIntegratedCollectiveStackPlaneAndRecoveryBindingV1 {
  readonly plane: ProtocolOptions["plane"];
  readonly recoveryAssignmentAuthority: ReferenceRecoveryAssignmentAuthorityV1;
}

interface ReferenceIntegratedCollectiveStackInternalsV1 {
  readonly node: AutonomousCollectiveNodeRuntimeV1;
  readonly protocol: DistributedCollectiveProtocolRuntimeV1;
  readonly loadNodeOptional: AutonomousCollectiveNodeRuntimeV1["loadOptional"];
  readonly loadProtocol: DistributedCollectiveProtocolRuntimeV1["load"];
  readonly plane: ProtocolOptions["plane"];
  readonly artifacts: ProtocolOptions["artifacts"];
  readonly authenticity: ProtocolOptions["authenticity"];
  readonly protocolMembership: ProtocolOptions["membership"];
  readonly crypto: Crypto | undefined;
  readonly verificationCrypto: Crypto;
  readonly finalityMembership: FinalityOptions["membership"];
  readonly finalityPolicy: FinalityOptions["policy"];
  readonly finalitySignatures: FinalityOptions["signatures"];
  readonly finalityGateway: FinalityOptions["gateway"];
  readonly protocolId: string;
  readonly scopeDigest: string;
  readonly membershipConfigurationDigest: string;
  readonly putArtifact: ProtocolOptions["artifacts"]["put"];
  readonly getArtifact: ProtocolOptions["artifacts"]["get"];
  readonly verifyAuthenticity: ProtocolOptions["authenticity"]["verify"];
  readonly verifyProtocolMembership: ProtocolOptions["membership"]["verifyPeer"];
  readonly recoveryAssignmentAuthority: ReferenceRecoveryAssignmentAuthorityV1;
}

const referenceIntegratedCollectiveStackBrandV1 = new WeakSet<object>();
const referenceIntegratedCollectiveStackInternalsV1 = new WeakMap<
  object,
  ReferenceIntegratedCollectiveStackInternalsV1
>();

/** Nominal check: structural lookalikes and cloned facades are rejected. */
export function isReferenceIntegratedCollectiveStackV1(
  value: unknown,
): value is ReferenceIntegratedCollectiveStackV1 {
  return (
    typeof value === "object" &&
    value !== null &&
    referenceIntegratedCollectiveStackBrandV1.has(value) &&
    referenceIntegratedCollectiveStackInternalsV1.has(value)
  );
}

/** Requires exact object identity for every construction-time authority. */
export function isReferenceIntegratedCollectiveStackBoundToV1(
  stack: unknown,
  binding: ReferenceIntegratedCollectiveStackBindingV1,
): stack is ReferenceIntegratedCollectiveStackV1 {
  if (!isReferenceIntegratedCollectiveStackV1(stack) || !binding) return false;
  const internals = referenceIntegratedCollectiveStackInternalsV1.get(stack)!;
  return (
    internals.plane === binding.plane &&
    internals.artifacts === binding.artifacts &&
    internals.authenticity === binding.authenticity &&
    internals.protocolMembership === binding.protocolMembership &&
    internals.crypto === binding.crypto &&
    internals.finalityMembership === binding.finalityMembership &&
    internals.finalityPolicy === binding.finalityPolicy &&
    internals.finalitySignatures === binding.finalitySignatures &&
    internals.finalityGateway === binding.finalityGateway &&
    internals.recoveryAssignmentAuthority ===
      binding.recoveryAssignmentAuthority
  );
}

/**
 * Checks the two external boundaries owned by a transport integration. This is
 * intentionally narrower than the complete authority binding check above.
 */
export function isReferenceIntegratedCollectiveStackBoundToPlaneAndRecoveryV1(
  stack: unknown,
  binding: ReferenceIntegratedCollectiveStackPlaneAndRecoveryBindingV1,
): stack is ReferenceIntegratedCollectiveStackV1 {
  if (!isReferenceIntegratedCollectiveStackV1(stack) || !binding) return false;
  const internals = referenceIntegratedCollectiveStackInternalsV1.get(stack)!;
  return (
    internals.plane === binding.plane &&
    internals.recoveryAssignmentAuthority ===
      binding.recoveryAssignmentAuthority
  );
}

/** Returns an immutable lifecycle snapshot without exposing mutable runtimes. */
export async function inspectReferenceIntegratedCollectiveStackV1(
  stack: unknown,
): Promise<ReferenceIntegratedCollectiveStackSnapshotV1> {
  const internals = requireReferenceIntegratedCollectiveStackInternalsV1(stack);
  const node = await internals.loadNodeOptional();
  const protocol = node === null ? null : await internals.loadProtocol();
  return immutable({ schemaVersion: 1, node, protocol });
}

/**
 * Validates and persists one authenticated artifact, then proves that the
 * configured store retained the exact stack-bound content before returning.
 */
export async function storeReferenceIntegratedCollectiveArtifactV1(
  stack: unknown,
  artifact: DistributedCollectiveMessageV1,
): Promise<DistributedCollectiveMessageV1> {
  const internals = requireReferenceIntegratedCollectiveStackInternalsV1(stack);
  const validated = await validateReferenceIntegratedCollectiveArtifactV1(
    internals,
    artifact,
  );
  await authenticateReferenceIntegratedCollectiveArtifactV1(
    internals,
    validated,
  );
  await internals.putArtifact(validated);
  const retained = await internals.getArtifact(validated.artifactDigest);
  if (!retained)
    throw new Error(
      "reference collective artifact store did not retain artifact",
    );
  const reread = await validateReferenceIntegratedCollectiveArtifactV1(
    internals,
    retained,
    validated.artifactDigest,
  );
  await authenticateReferenceIntegratedCollectiveArtifactV1(internals, reread);
  if (reread.messageDigest !== validated.messageDigest)
    throw new TypeError("reference collective artifact binding is invalid");
  return immutable(reread);
}

/** Reads and validates one immutable artifact belonging to this stack. */
export async function readReferenceIntegratedCollectiveArtifactV1(
  stack: unknown,
  artifactDigest: MeshSparseOverlayDigestV2,
): Promise<DistributedCollectiveMessageV1 | null> {
  const internals = requireReferenceIntegratedCollectiveStackInternalsV1(stack);
  overlayDigest(artifactDigest, "artifactDigest");
  const artifact = await internals.getArtifact(artifactDigest);
  if (!artifact) return null;
  const validated = await validateReferenceIntegratedCollectiveArtifactV1(
    internals,
    artifact,
    artifactDigest,
  );
  await authenticateReferenceIntegratedCollectiveArtifactV1(
    internals,
    validated,
  );
  return immutable(validated);
}

/**
 * Capability-safe facade that reconciles certified recovery before every node
 * mutation. `load` and `loadOptional` do not progress node or recovery state,
 * though the node may reconcile its durable telemetry outbox before returning;
 * all mutation methods fail closed while recovery is unresolved or the fixed
 * membership generation has changed.
 */
export function createReferenceRecoveryGatedNodeFacadeV1(input: {
  readonly node: Pick<
    AutonomousCollectiveNodeRuntimeV1,
    | "initialize"
    | "loadOptional"
    | "load"
    | "submitMission"
    | "receive"
    | "advance"
  >;
  readonly recovery: AutonomousCompromiseRecoveryRuntimeV1;
  readonly expectedMembershipConfigurationDigest: string;
  readonly currentMembership: () => ReferenceMembershipGenerationV1;
}): ReferenceIntegratedCollectiveStackV1["node"] {
  if (
    !input?.node ||
    typeof input.node.initialize !== "function" ||
    typeof input.node.loadOptional !== "function" ||
    typeof input.node.load !== "function" ||
    typeof input.node.submitMission !== "function" ||
    typeof input.node.receive !== "function" ||
    typeof input.node.advance !== "function"
  )
    throw new TypeError("reference collective node is required");
  if (!isAutonomousCompromiseRecoveryRuntimeV1(input.recovery))
    throw new TypeError(
      "autonomous compromise recovery supervisor is required",
    );
  digest(
    input.expectedMembershipConfigurationDigest,
    "expectedMembershipConfigurationDigest",
  );
  if (typeof input.currentMembership !== "function")
    throw new TypeError("current membership resolver is required");

  const node = input.node;
  const initializeNode = node.initialize.bind(node);
  const loadNodeOptional = node.loadOptional.bind(node);
  const loadNode = node.load.bind(node);
  const submitMission = node.submitMission.bind(node);
  const receive = node.receive.bind(node);
  const advance = node.advance.bind(node);
  const recovery = input.recovery;
  const expectedMembershipConfigurationDigest =
    input.expectedMembershipConfigurationDigest;
  const currentMembership = input.currentMembership;

  const beforeMutation = async (logicalTimeMs: number): Promise<void> => {
    assertReferenceMembershipGenerationV1(
      currentMembership(),
      expectedMembershipConfigurationDigest,
    );
    await invokeAutonomousCompromiseRecoveryRequireNodeProgressV1(recovery, {
      logicalTimeMs,
    });
    assertReferenceMembershipGenerationV1(
      currentMembership(),
      expectedMembershipConfigurationDigest,
    );
  };
  return Object.freeze({
    initialize: async (logicalTimeMs = 0) => {
      await beforeMutation(logicalTimeMs);
      return initializeNode(logicalTimeMs);
    },
    loadOptional: loadNodeOptional,
    load: loadNode,
    submitMission: async (request) => {
      await beforeMutation(request.logicalTimeMs);
      return submitMission(request);
    },
    receive: async (update, logicalTimeMs) => {
      await beforeMutation(logicalTimeMs);
      return receive(update, logicalTimeMs);
    },
    advance: async (request) => {
      await beforeMutation(request.logicalTimeMs);
      return advance(request);
    },
  });
}

/** Re-checks recovery and lifecycle generation at the protected effect boundary. */
export function createReferenceRecoveryAwareCurrentnessV1(input: {
  readonly delegate: AssuranceExecutionCurrentnessPortV1;
  readonly recovery: AutonomousCompromiseRecoveryRuntimeV1;
  readonly expectedMembershipConfigurationDigest: string;
  readonly currentMembership: () => ReferenceMembershipGenerationV1;
}): AssuranceExecutionCurrentnessPortV1 {
  if (!input?.delegate || typeof input.delegate.verify !== "function")
    throw new TypeError("assurance currentness delegate is required");
  if (!isAutonomousCompromiseRecoveryRuntimeV1(input.recovery))
    throw new TypeError(
      "autonomous compromise recovery supervisor is required",
    );
  digest(
    input.expectedMembershipConfigurationDigest,
    "expectedMembershipConfigurationDigest",
  );
  if (typeof input.currentMembership !== "function")
    throw new TypeError("current membership resolver is required");
  const delegate = input.delegate;
  const recoveryRuntime = input.recovery;
  const expectedMembershipConfigurationDigest =
    input.expectedMembershipConfigurationDigest;
  const currentMembership = input.currentMembership;
  return Object.freeze({
    verify: async (
      request: Parameters<AssuranceExecutionCurrentnessPortV1["verify"]>[0],
    ) => {
      try {
        assertReferenceMembershipGenerationV1(
          currentMembership(),
          expectedMembershipConfigurationDigest,
        );
        const recovery = await invokeAutonomousCompromiseRecoveryTickV1(
          recoveryRuntime,
          { logicalTimeMs: request.logicalTimeMs },
        );
        if (!recovery.nodeProgressAllowed) return false;
        assertReferenceMembershipGenerationV1(
          currentMembership(),
          expectedMembershipConfigurationDigest,
        );
        return delegate.verify(request);
      } catch {
        return false;
      }
    },
  });
}

/**
 * Resolves and certifies the exact assignment fence before finality, then
 * routes commit to the same repository for one atomic fence/effect decision.
 */
export function createReferenceRecoveryExecutionAuthorityV1(input: {
  readonly recovery: AutonomousCompromiseRecoveryRuntimeV1;
  readonly assignmentAuthority: ReferenceRecoveryAssignmentAuthorityV1;
  readonly expectedMembershipConfigurationDigest: string;
  readonly currentMembership: () => ReferenceMembershipGenerationV1;
}): AssuranceExecutionAuthorityPortV1 {
  if (!isAutonomousCompromiseRecoveryRuntimeV1(input?.recovery))
    throw new TypeError(
      "autonomous compromise recovery supervisor is required",
    );
  const assignmentAuthority = input.assignmentAuthority;
  const resolve = assignmentAuthority?.resolve;
  const reconcile = assignmentAuthority?.reconcile;
  const commit = assignmentAuthority?.commit;
  const install = assignmentAuthority?.install;
  if (
    !assignmentAuthority ||
    typeof resolve !== "function" ||
    typeof reconcile !== "function" ||
    typeof commit !== "function" ||
    typeof install !== "function"
  )
    throw new TypeError("recovery assignment authority is required");
  digest(
    input.expectedMembershipConfigurationDigest,
    "expectedMembershipConfigurationDigest",
  );
  if (typeof input.currentMembership !== "function")
    throw new TypeError("current membership resolver is required");

  const recoveryRuntime = input.recovery;
  const recoveryScope = autonomousCompromiseRecoveryScopeV1(recoveryRuntime);
  const resolveAssignment = resolve.bind(assignmentAuthority);
  const reconcileAssignment = reconcile.bind(assignmentAuthority);
  const commitAssignment = commit.bind(assignmentAuthority);
  const expectedMembershipConfigurationDigest =
    input.expectedMembershipConfigurationDigest;
  const currentMembership = input.currentMembership;

  return Object.freeze({
    resolve: async (
      request: Parameters<AssuranceExecutionAuthorityPortV1["resolve"]>[0],
    ): Promise<AssuranceExecutionAuthorityFenceV1 | null> => {
      assertReferenceMembershipGenerationV1(
        currentMembership(),
        expectedMembershipConfigurationDigest,
      );
      const recovery =
        await invokeAutonomousCompromiseRecoveryRequireNodeProgressV1(
          recoveryRuntime,
          { logicalTimeMs: request.logicalTimeMs },
        );
      if (!recovery.nodeProgressAllowed)
        throw new AutonomousCompromiseRecoveryNotReadyErrorV1(recovery);
      const membership = currentMembership();
      assertReferenceMembershipGenerationV1(
        membership,
        expectedMembershipConfigurationDigest,
      );
      const fence = await resolveAssignment(request);
      if (!fence) return null;
      if (
        fence.scope.tenantId !== recoveryScope.tenantId ||
        fence.scope.meshId !== recoveryScope.meshId ||
        fence.scope.missionIntentId !== recoveryScope.missionIntentId ||
        fence.membershipConfigurationDigest !==
          membership.configurationDigest ||
        fence.membershipEpoch !== membership.epoch
      )
        throw new TypeError("recovery execution authority binding is invalid");
      const gate = await invokeAutonomousCompromiseRecoveryGateExecutionV1(
        recoveryRuntime,
        {
          scope: fence.scope,
          peerId: fence.assignedPeerId,
          assignmentEpoch: fence.assignmentEpoch,
          fencingToken: fence.fencingToken,
          logicalTimeMs: request.logicalTimeMs,
        },
      );
      if (!gate.allowed) return null;
      assertReferenceMembershipGenerationV1(
        currentMembership(),
        expectedMembershipConfigurationDigest,
      );
      return fence;
    },
    reconcile: async (
      request: Parameters<AssuranceExecutionAuthorityPortV1["reconcile"]>[0],
    ) => reconcileAssignment(request),
    commit: async (
      request: Parameters<AssuranceExecutionAuthorityPortV1["commit"]>[0],
    ) => {
      assertReferenceMembershipGenerationV1(
        currentMembership(),
        expectedMembershipConfigurationDigest,
      );
      await invokeAutonomousCompromiseRecoveryRequireNodeProgressV1(
        recoveryRuntime,
        { logicalTimeMs: request.logicalTimeMs },
      );
      const membership = currentMembership();
      assertReferenceMembershipGenerationV1(
        membership,
        expectedMembershipConfigurationDigest,
      );
      if (
        request.authorityFence.membershipConfigurationDigest !==
          membership.configurationDigest ||
        request.authorityFence.membershipEpoch !== membership.epoch
      )
        throw new TypeError(
          "recovery effect membership fence is no longer current",
        );
      return commitAssignment(request);
    },
  });
}

/**
 * Reference mission stack: intent -> distributed factorization/allocation ->
 * sparse-BFT finality -> invariant and semantic assurance -> protected effects
 * -> bounded adaptation. Callers supply environmental boundaries, not prepared
 * collective graphs, candidate lists, semantic samples, or verify callbacks.
 */
export function createReferenceIntegratedCollectiveStackV1(
  options: ReferenceIntegratedCollectiveStackOptionsV1,
): ReferenceIntegratedCollectiveStackV1 {
  const protocolOptions = captureProtocolOptions(options.protocol);
  const capturedProtocolRuntimeOptions =
    captureProtocolRuntimeOptions(protocolOptions);
  const configuredCrypto = protocolOptions.crypto;
  const authorityCrypto = captureDigestCrypto(configuredCrypto);
  const protocolRuntimeOptions = Object.freeze({
    ...capturedProtocolRuntimeOptions,
    crypto: authorityCrypto,
  });
  const finalityOptions = captureFinalityOptions(options.finality);
  if (configuredCrypto !== finalityOptions.crypto)
    throw new TypeError("protocol and sparse BFT crypto authorities differ");
  const finalityRuntimeOptions = captureFinalityRuntimeOptions(
    finalityOptions,
    authorityCrypto,
  );
  const localInput = options.local;
  const planningOptions = options.planning;
  const executionOptions = options.execution;
  const adaptationInput = options.adaptation;
  const nodeOptions = options.node;
  const lifecycle = localInput.lifecycle;
  const governedRoleCatalog = localInput.governedRoleCatalog;
  const operationalControl = executionOptions.operationalControl;
  const semanticHorizon = executionOptions.semanticHorizon;
  const recovery = options.recovery;
  const recoveryAssignmentAuthority = options.recoveryAssignmentAuthority;
  const membershipConfigurationDigest =
    protocolOptions.membershipConfigurationDigest;
  const missionId = adaptationInput.missionId;
  if (
    membershipConfigurationDigest !==
    finalityRuntimeOptions.membership.configurationDigest
  )
    throw new TypeError(
      "protocol and sparse BFT membership configurations differ",
    );
  if (
    membershipConfigurationDigest !==
      localInput.catalog.membershipConfigurationDigest ||
    protocolOptions.localPeerId !== localInput.catalog.localPeerId ||
    protocolOptions.localInstanceId !== localInput.catalog.localInstanceId
  )
    throw new TypeError(
      "protocol and local capability catalog bindings differ",
    );
  if (
    !isGovernedAgentLifecycleRuntimeV1(lifecycle) ||
    !isGovernedRoleCatalogRuntimeV2(governedRoleCatalog) ||
    governedRoleCatalogMissionIdV2(governedRoleCatalog) !== missionId
  )
    throw new TypeError(
      "reference stack requires a concrete governed lifecycle runtime and role currentness",
    );
  if (
    !isOperationalCognitiveControllerV1(operationalControl) ||
    !isOperationalCognitiveControllerBoundToDurableHorizonBudgetV1(
      operationalControl,
    ) ||
    !isOperationalCognitiveControllerBoundToSemanticGuaranteesV1(
      operationalControl,
    )
  )
    throw new TypeError(
      "reference stack requires a concrete operational cognitive controller with statistical control",
    );
  if (
    !isSequentialSemanticGuaranteeEngineV1(executionOptions.semanticGuarantees)
  )
    throw new TypeError(
      "reference stack requires a concrete sequential semantic guarantee engine",
    );
  if (
    !isAnytimeSemanticHorizonCouplingV1(semanticHorizon) ||
    typeof executionOptions.semanticStateKey !== "string" ||
    typeof executionOptions.semanticHorizonBudgetStateKey !== "string" ||
    !executionOptions.semanticHorizonBudgetStore ||
    typeof executionOptions.semanticHorizonBudgetStore.load !== "function" ||
    typeof executionOptions.semanticHorizonBudgetStore.compareAndSet !==
      "function" ||
    !executionOptions.semanticHorizonBudgetMonotonicAnchor ||
    typeof executionOptions.semanticHorizonBudgetMonotonicAnchor.readAnchor !==
      "function" ||
    typeof executionOptions.semanticHorizonBudgetMonotonicAnchor
      .compareAndSetAnchor !== "function"
  )
    throw new TypeError(
      "reference stack requires semantic horizon control with durable budgets",
    );
  identifier(executionOptions.semanticStateKey, "semanticStateKey");
  identifier(
    executionOptions.semanticHorizonBudgetStateKey,
    "semanticHorizonBudgetStateKey",
  );
  const currentMembership = () =>
    invokeGovernedAgentLifecycleCurrentMembershipV1(lifecycle);
  const initialMembership = currentMembership();
  if (
    !recoveryAssignmentAuthority ||
    typeof recoveryAssignmentAuthority.install !== "function" ||
    typeof recoveryAssignmentAuthority.resolve !== "function" ||
    typeof recoveryAssignmentAuthority.commit !== "function"
  )
    throw new TypeError(
      "reference stack recovery assignment authority is required",
    );
  if (!isAutonomousCompromiseRecoveryRuntimeV1(recovery))
    throw new TypeError("reference stack recovery scope is invalid");
  const recoveryScope = autonomousCompromiseRecoveryScopeV1(recovery);
  if (
    localInput.catalog.tenantId !== initialMembership.tenantId ||
    recoveryScope.tenantId !== initialMembership.tenantId ||
    recoveryScope.meshId !== initialMembership.meshId ||
    recoveryScope.missionIntentId !== missionId ||
    !hasAutonomousCompromiseRecoveryClosedRegistryPairV1(recovery) ||
    !isAutonomousCompromiseRecoveryBoundToLifecycleV1(recovery, lifecycle) ||
    !isAutonomousCompromiseRecoveryBoundToAssignmentAuthorityV1(
      recovery,
      recoveryAssignmentAuthority,
    )
  )
    throw new TypeError("reference stack recovery scope is invalid");
  assertReferenceMembershipGenerationV1(
    initialMembership,
    membershipConfigurationDigest,
  );
  const expectedTelemetryIdentity = Object.freeze({
    tenantId: initialMembership.tenantId,
    collectiveId: initialMembership.meshId,
    peerId: protocolRuntimeOptions.localPeerId,
    instanceId: protocolRuntimeOptions.localInstanceId,
    keyId: protocolRuntimeOptions.authenticity.localKeyId,
  });
  if (
    !isCollectiveHostDurableTelemetryPortV1(executionOptions.telemetry) ||
    !isCollectiveHostTelemetryPortBoundToIdentityV1(
      executionOptions.telemetry,
      expectedTelemetryIdentity,
    ) ||
    !executionOptions.store ||
    typeof executionOptions.store.checkpointEffect !== "function" ||
    typeof executionOptions.store.completeWithTelemetry !== "function" ||
    typeof executionOptions.store.loadPendingTelemetry !== "function" ||
    typeof executionOptions.store.markTelemetryRecorded !== "function" ||
    typeof executionOptions.store.acknowledgeTelemetry !== "function" ||
    !isCollectiveHostDurableTelemetryPortV1(nodeOptions.telemetry) ||
    !isCollectiveHostTelemetryPortBoundToIdentityV1(
      nodeOptions.telemetry,
      expectedTelemetryIdentity,
    ) ||
    nodeOptions.telemetry !== executionOptions.telemetry ||
    !nodeOptions.store ||
    typeof nodeOptions.store.saveWithTelemetry !== "function" ||
    typeof nodeOptions.store.loadPendingTelemetry !== "function" ||
    typeof nodeOptions.store.markTelemetryRecorded !== "function" ||
    typeof nodeOptions.store.acknowledgeTelemetry !== "function"
  )
    throw new TypeError(
      "reference stack requires durable causal telemetry outboxes",
    );
  const protocol = new DistributedCollectiveProtocolRuntimeV1(
    protocolRuntimeOptions,
  );
  if (
    !isDistributedCollectiveProtocolRuntimeV1(protocol) ||
    !isDistributedCollectiveProtocolBoundToV1(protocol, {
      plane: protocolRuntimeOptions.plane,
      artifacts: protocolRuntimeOptions.artifacts,
      authenticity: protocolRuntimeOptions.authenticity,
      membership: protocolRuntimeOptions.membership,
      crypto: authorityCrypto,
    })
  )
    throw new TypeError(
      "reference stack protocol authority binding is invalid",
    );
  for (const [label, configured] of [
    ["local", localInput.crypto],
    ["execution", executionOptions.crypto],
    ["adaptation", adaptationInput.crypto],
    ["node", nodeOptions.crypto],
  ] as const) {
    if (configured !== undefined && configured !== protocolOptions.crypto)
      throw new TypeError(`${label} and protocol crypto authorities differ`);
  }
  const { governedRoleCatalog: _governedRoleCatalog, ...localOptions } =
    localInput;
  const local = new ReferenceLocalCatalogRuntimeV1({
    ...localOptions,
    lifecycle,
    crypto: authorityCrypto,
    roles: new GovernedRoleCatalogCurrentnessV1({
      catalog: governedRoleCatalog,
      crypto: authorityCrypto,
    }),
  });
  const allocationPolicy = validateStrategicAllocationPolicyV1(
    planningOptions.allocationPolicy,
  );
  const planning = new DistributedPlanningRuntimeV1({
    ...planningOptions,
    protocol,
    allocationPolicy,
    allocationEvidence: local,
  });
  if (!isRestartDurableSparseBftFinalityGatewayV1(finalityOptions.gateway))
    throw new TypeError(
      "reference stack requires a restart-durable sparse BFT certification gateway",
    );
  const finality = new VerifiedSparseBftFinalityRuntimeV1(
    finalityRuntimeOptions,
  );
  if (
    !isVerifiedSparseBftFinalityRuntimeV1(finality) ||
    !isVerifiedSparseBftFinalityBoundToV1(finality, {
      membership: finalityRuntimeOptions.membership,
      policy: finalityRuntimeOptions.policy,
      signatures: finalityRuntimeOptions.signatures,
      gateway: finalityRuntimeOptions.gateway,
      crypto: authorityCrypto,
    })
  )
    throw new TypeError(
      "reference stack sparse BFT authority binding is invalid",
    );
  const cognitive = new ReferenceOperationalCognitiveExecutionPortV1(
    operationalControl,
    authorityCrypto,
  );
  if (!cognitive.isBoundToController(operationalControl))
    throw new TypeError(
      "reference operational cognitive controller binding is invalid",
    );
  const execution = new AssuranceCoupledExecutionRuntimeV1({
    ...executionOptions,
    crypto: authorityCrypto,
    semanticHorizon,
    telemetryDeliveryMode: "durable_outbox",
    localPeerId: protocolOptions.localPeerId,
    localInstanceId: protocolOptions.localInstanceId,
    allocationPolicy,
    finality: finality.execution,
    cognitive,
    currentness: createReferenceRecoveryAwareCurrentnessV1({
      delegate: local,
      recovery,
      expectedMembershipConfigurationDigest: membershipConfigurationDigest,
      currentMembership,
    }),
    authority: createReferenceRecoveryExecutionAuthorityV1({
      recovery,
      assignmentAuthority: recoveryAssignmentAuthority,
      expectedMembershipConfigurationDigest: membershipConfigurationDigest,
      currentMembership,
    }),
    operationalControl,
    requireSemanticHorizon: true,
  });
  if (
    planning.options.allocationPolicy !== allocationPolicy ||
    execution.options.allocationPolicy !== allocationPolicy
  )
    throw new TypeError(
      "reference stack planning and execution allocation authorities differ",
    );

  const loadProtocol = protocol.load;
  let node: AutonomousCollectiveNodeRuntimeV1 | null = null;
  let loadNodeState: AutonomousCollectiveNodeRuntimeV1["load"] | null = null;
  const currentStateDigest =
    adaptationInput.currentStateDigest ??
    (async () => {
      if (loadNodeState) return (await loadNodeState()).stateDigest;
      return (await loadProtocol()).stateDigest;
    });
  const signalAdmission = new ProtocolBoundAdaptationSignalAdmissionV1({
    membership: protocol.options.membership,
    scopeDigest: protocolOptions.scopeDigest,
  });
  const safety = new ReferenceAdaptationInvariantGateV1({
    missionId,
    policyDigest: adaptationInput.policy.policyDigest,
    currentStateDigest,
    invariants: adaptationInput.invariants,
    crypto: authorityCrypto,
  });
  const { invariants: _invariants, ...adaptationOptions } = adaptationInput;
  if (!isRestartDurableAutonomousAdaptationStoreV1(adaptationInput.store))
    throw new TypeError(
      "reference stack requires an explicitly restart-durable adaptation store",
    );
  const adaptation = new AutonomousAdaptationRuntimeV1({
    ...adaptationOptions,
    crypto: authorityCrypto,
    protocol,
    currentStateDigest,
    signalAdmission,
    safety,
    finality: finality.adaptation,
  });
  if (!isAutonomousAdaptationRuntimeV1(adaptation))
    throw new TypeError(
      "reference stack autonomous adaptation authority is invalid",
    );
  node = new AutonomousCollectiveNodeRuntimeV1({
    ...nodeOptions,
    crypto: authorityCrypto,
    telemetryDeliveryMode: "durable_outbox",
    protocol,
    planning,
    execution,
    adaptation,
    planningFinality: finality.planning,
    localPlanning: local,
    taskMaterializer: local,
    taskContextRehydrator: local,
  });
  if (!isAutonomousCollectiveNodeRuntimeV1(node))
    throw new TypeError("reference stack autonomous node authority is invalid");
  const loadNodeOptional = node.loadOptional.bind(node);
  loadNodeState = node.load.bind(node);
  const facade = createReferenceRecoveryGatedNodeFacadeV1({
    node,
    recovery,
    expectedMembershipConfigurationDigest: membershipConfigurationDigest,
    currentMembership,
  });
  const stack: ReferenceIntegratedCollectiveStackV1 = Object.freeze({
    node: facade,
  });
  referenceIntegratedCollectiveStackInternalsV1.set(stack, {
    node,
    protocol,
    loadNodeOptional,
    loadProtocol,
    plane: protocolOptions.plane,
    artifacts: protocolOptions.artifacts,
    authenticity: protocolOptions.authenticity,
    protocolMembership: protocolOptions.membership,
    crypto: protocolOptions.crypto,
    verificationCrypto: authorityCrypto,
    finalityMembership: finalityOptions.membership,
    finalityPolicy: finalityOptions.policy,
    finalitySignatures: finalityOptions.signatures,
    finalityGateway: finalityOptions.gateway,
    protocolId: protocol.options.protocolId,
    scopeDigest: protocol.options.scopeDigest,
    membershipConfigurationDigest:
      protocol.options.membershipConfigurationDigest,
    putArtifact: protocol.options.artifacts.put,
    getArtifact: protocol.options.artifacts.get,
    verifyAuthenticity: protocol.options.authenticity.verify,
    verifyProtocolMembership: protocol.options.membership.verifyPeer,
    recoveryAssignmentAuthority,
  });
  referenceIntegratedCollectiveStackBrandV1.add(stack);
  return stack;
}

function requireReferenceIntegratedCollectiveStackInternalsV1(
  stack: unknown,
): ReferenceIntegratedCollectiveStackInternalsV1 {
  if (!isReferenceIntegratedCollectiveStackV1(stack))
    throw new TypeError("reference integrated collective stack is not genuine");
  return referenceIntegratedCollectiveStackInternalsV1.get(stack)!;
}

function captureProtocolOptions(input: ProtocolOptions): ProtocolOptions {
  if (!input || typeof input !== "object")
    throw new TypeError("reference stack protocol options are required");
  const protocolId = input.protocolId;
  const scopeDigest = input.scopeDigest;
  const membershipConfigurationDigest = input.membershipConfigurationDigest;
  const localPeerId = input.localPeerId;
  const localInstanceId = input.localInstanceId;
  const plane = input.plane;
  const artifacts = input.artifacts;
  const authenticity = input.authenticity;
  const membership = input.membership;
  const store = input.store;
  const maximumRetainedReferences = input.maximumRetainedReferences;
  const maximumOutboxRecords = input.maximumOutboxRecords;
  const maximumCommitAttempts = input.maximumCommitAttempts;
  const crypto = input.crypto;
  return Object.freeze({
    protocolId,
    scopeDigest,
    membershipConfigurationDigest,
    localPeerId,
    localInstanceId,
    plane,
    artifacts,
    authenticity,
    membership,
    ...(store === undefined ? {} : { store }),
    ...(maximumRetainedReferences === undefined
      ? {}
      : { maximumRetainedReferences }),
    ...(maximumOutboxRecords === undefined ? {} : { maximumOutboxRecords }),
    ...(maximumCommitAttempts === undefined ? {} : { maximumCommitAttempts }),
    ...(crypto === undefined ? {} : { crypto }),
  });
}

function captureProtocolRuntimeOptions(
  input: ProtocolOptions,
): ProtocolOptions {
  const plane = input.plane;
  const artifacts = input.artifacts;
  const authenticity = input.authenticity;
  const membership = input.membership;
  const store = input.store;
  const planePublish = plane?.publish;
  const artifactPut = artifacts?.put;
  const artifactGet = artifacts?.get;
  const sign = authenticity?.sign;
  const verifyAuthenticity = authenticity?.verify;
  const verifyMembership = membership?.verifyPeer;
  const resolveIndependenceGroup = membership?.resolveIndependenceGroup;
  const storeLoad = store?.load;
  const storeSave = store?.save;
  return Object.freeze({
    ...input,
    plane:
      plane && typeof planePublish === "function"
        ? Object.freeze({ publish: planePublish.bind(plane) })
        : plane,
    artifacts:
      artifacts &&
      typeof artifactPut === "function" &&
      typeof artifactGet === "function"
        ? Object.freeze({
            put: artifactPut.bind(artifacts),
            get: artifactGet.bind(artifacts),
          })
        : artifacts,
    authenticity:
      authenticity &&
      typeof sign === "function" &&
      typeof verifyAuthenticity === "function"
        ? Object.freeze({
            localKeyId: authenticity.localKeyId,
            sign: sign.bind(authenticity),
            verify: verifyAuthenticity.bind(authenticity),
          })
        : authenticity,
    membership:
      membership && typeof verifyMembership === "function"
        ? Object.freeze({
            verifyPeer: verifyMembership.bind(membership),
            ...(typeof resolveIndependenceGroup === "function"
              ? {
                  resolveIndependenceGroup:
                    resolveIndependenceGroup.bind(membership),
                }
              : {}),
          })
        : membership,
    ...(store === undefined
      ? {}
      : {
          store:
            typeof storeLoad === "function" && typeof storeSave === "function"
              ? Object.freeze({
                  load: storeLoad.bind(store),
                  save: storeSave.bind(store),
                })
              : store,
        }),
  });
}

function captureFinalityOptions(input: FinalityOptions): FinalityOptions {
  if (!input || typeof input !== "object")
    throw new TypeError("reference stack finality options are required");
  const membership = input.membership;
  const policy = input.policy;
  const signatures = input.signatures;
  const gateway = input.gateway;
  const maximumCachedCertificates = input.maximumCachedCertificates;
  const crypto = input.crypto;
  return Object.freeze({
    membership,
    policy,
    signatures,
    gateway,
    ...(maximumCachedCertificates === undefined
      ? {}
      : { maximumCachedCertificates }),
    ...(crypto === undefined ? {} : { crypto }),
  });
}

function captureFinalityRuntimeOptions(
  input: FinalityOptions,
  crypto: Crypto,
): FinalityOptions {
  const membership = input.membership;
  const policy = input.policy;
  const signatures = input.signatures;
  const gateway = input.gateway;
  const signatureAlgorithm = signatures?.algorithm;
  const verifyShare = signatures?.verifyShare;
  const aggregate = signatures?.aggregate;
  const verifyAggregate = signatures?.verifyAggregate;
  const certify = gateway?.certify;
  const shardCertificates = gateway?.shardCertificates;
  const reconcileCertification = gateway?.reconcileCertification;
  return Object.freeze({
    ...input,
    membership: membership ? immutable(membership) : membership,
    policy: policy ? immutable(policy) : policy,
    signatures:
      signatures &&
      typeof signatureAlgorithm === "string" &&
      typeof verifyShare === "function" &&
      typeof aggregate === "function" &&
      typeof verifyAggregate === "function"
        ? Object.freeze({
            algorithm: signatureAlgorithm,
            verifyShare: verifyShare.bind(signatures),
            aggregate: aggregate.bind(signatures),
            verifyAggregate: verifyAggregate.bind(signatures),
          })
        : signatures,
    gateway:
      gateway &&
      typeof certify === "function" &&
      typeof shardCertificates === "function" &&
      typeof reconcileCertification === "function"
        ? Object.freeze({
            certify: certify.bind(gateway),
            shardCertificates: shardCertificates.bind(gateway),
            reconcileCertification: reconcileCertification.bind(gateway),
          })
        : gateway,
    crypto,
  });
}

async function validateReferenceIntegratedCollectiveArtifactV1(
  internals: ReferenceIntegratedCollectiveStackInternalsV1,
  artifact: DistributedCollectiveMessageV1,
  expectedArtifactDigest?: MeshSparseOverlayDigestV2,
): Promise<DistributedCollectiveMessageV1> {
  if (expectedArtifactDigest !== undefined) {
    overlayDigest(expectedArtifactDigest, "expectedArtifactDigest");
    if (artifact.artifactDigest !== expectedArtifactDigest)
      throw new TypeError("reference collective artifact binding is invalid");
  }
  const validated = await validateDistributedCollectiveMessageV1(
    immutable(artifact),
    internals.verificationCrypto,
  );
  if (
    validated.protocolId !== internals.protocolId ||
    validated.scopeDigest !== internals.scopeDigest ||
    validated.membershipConfigurationDigest !==
      internals.membershipConfigurationDigest
  )
    throw new TypeError("reference collective artifact scope is invalid");
  return immutable(validated);
}

async function authenticateReferenceIntegratedCollectiveArtifactV1(
  internals: ReferenceIntegratedCollectiveStackInternalsV1,
  artifact: DistributedCollectiveMessageV1,
): Promise<void> {
  if (
    !(await internals.verifyProtocolMembership({
      peerId: artifact.issuerPeerId,
      instanceId: artifact.issuerInstanceId,
      keyId: artifact.issuerKeyId,
      membershipConfigurationDigest: artifact.membershipConfigurationDigest,
      scopeDigest: artifact.scopeDigest,
      logicalTimeMs: artifact.logicalTimeMs,
    }))
  )
    throw new TypeError(
      "reference collective artifact membership is unverified",
    );
  if (
    !(await internals.verifyAuthenticity({
      messageDigest: artifact.messageDigest,
      signature: artifact.signature,
      issuerPeerId: artifact.issuerPeerId,
      issuerInstanceId: artifact.issuerInstanceId,
      issuerKeyId: artifact.issuerKeyId,
      membershipConfigurationDigest: artifact.membershipConfigurationDigest,
      logicalTimeMs: artifact.logicalTimeMs,
    }))
  )
    throw new TypeError(
      "reference collective artifact signature is unverified",
    );
}

function assertReferenceMembershipGenerationV1(
  current: ReferenceMembershipGenerationV1,
  expectedConfigurationDigest: string,
): void {
  if (!current || typeof current !== "object")
    throw new TypeError("current membership generation is unavailable");
  digest(current.configurationDigest, "currentMembership.configurationDigest");
  integer(current.epoch, "currentMembership.epoch", 1, Number.MAX_SAFE_INTEGER);
  if (current.configurationDigest !== expectedConfigurationDigest)
    throw new ReferenceCollectiveMembershipGenerationChangedErrorV1(
      expectedConfigurationDigest,
      current.configurationDigest,
      current.epoch,
    );
}

async function planningValueDigest(
  graph: MissionDecompositionGraphV1,
  plan: StrategicAllocationPlanV1,
  crypto?: Crypto,
): Promise<string> {
  return planningBindingDigest(graph.graphDigest, plan.planDigest, crypto);
}

async function planningBindingDigest(
  graphDigest: string,
  allocationPlanDigest: string,
  crypto?: Crypto,
): Promise<string> {
  digest(graphDigest, "graphDigest");
  digest(allocationPlanDigest, "allocationPlanDigest");
  return collectiveQuorumDigestV1(
    {
      domain: "reference-integrated-planning-binding-v1",
      body: { graphDigest, allocationPlanDigest },
    },
    crypto,
  );
}

function canonicalDigests(values: readonly string[]): readonly string[] {
  const result = [...new Set(values)].sort();
  result.forEach((item) => digest(item, "evidenceDigest"));
  return Object.freeze(result);
}

function identifier(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u.test(value)
  )
    throw new TypeError(`${label} is invalid`);
}

function digest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value))
    throw new TypeError(`${label} is invalid`);
}

function overlayDigest(
  value: unknown,
  label: string,
): asserts value is MeshSparseOverlayDigestV2 {
  if (typeof value !== "string" || !/^sha256:[A-Za-z0-9_-]{43}$/u.test(value))
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

function captureDigestCrypto(configuredCrypto: Crypto | undefined): Crypto {
  const source = configuredCrypto ?? globalThis.crypto;
  const subtle = source?.subtle;
  const digestMethod = subtle?.digest;
  if (!source || !subtle || typeof digestMethod !== "function")
    throw new TypeError("reference stack digest crypto capability is required");
  return Object.freeze({
    subtle: Object.freeze({ digest: digestMethod.bind(subtle) }),
  }) as unknown as Crypto;
}

function immutableProperty(value: unknown): PropertyDescriptor {
  return {
    value,
    writable: false,
    configurable: false,
    enumerable: true,
  };
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
