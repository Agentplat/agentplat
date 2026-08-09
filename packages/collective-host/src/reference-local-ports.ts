import type { Metadata, TenantContext } from "@agentplat/core";
import {
  invokeGovernedAgentLifecycleEligibilityV1,
  isGovernedAgentLifecycleRuntimeV1,
  type GovernedAgentLifecycleRuntimeV1,
} from "@agentplat/collective-membership/governed-agent-lifecycle";
import {
  governedRoleCatalogMissionIdV2,
  invokeGovernedRoleCatalogResolveActiveRoleBindingV2,
  isGovernedRoleCatalogRuntimeV2,
  type GovernedRoleCatalogRuntimeV2,
} from "@agentplat/inference-control/governed-role-evolution";
import type {
  MissionIntentV1,
  MissionTaskNodeV1,
  PlanningDigestV1,
} from "@agentplat/collective-planning";
import { collectiveQuorumDigestV1 } from "@agentplat/collective-quorum/crypto";
import {
  invokeOperationalCognitiveRunTurnV1,
  isOperationalCognitiveControllerV1,
  type OperationalCognitiveControllerV1,
} from "@agentplat/inference-control/operational-control";
import {
  createCognitiveOperationRequestV2,
  createWebCryptoCognitiveIntegrityV2,
  type CognitiveAgentAdapterContextV2,
  type CognitiveOperationReceiptV2,
  type CognitiveOperationRequestV2,
  type CognitiveOperationResultV2,
} from "@agentplat/runtime/cognitive-adapter";
import type {
  StrategicAllocationEvidencePortV1,
  StrategicCapabilityAttestationV1,
  StrategicPeerProjectionV1,
} from "@agentplat/collective-runtime/strategic-allocation";

import {
  createAutonomousCollectiveCognitiveContextBindingV1,
  type AutonomousCollectiveLocalBidV1,
  type AutonomousCollectiveTaskContextRehydratorPortV1,
  type AutonomousCollectiveLocalPlanningPortV1,
  type AutonomousCollectiveTaskMaterializerPortV1,
} from "./autonomous-collective-node.js";
import type {
  AssuranceCognitiveExecutionPortV1,
  AssuranceExecutionCurrentnessPortV1,
} from "./assurance-coupled-execution.js";

export interface ReferenceLocalCapabilityEntryV1 {
  readonly entryId: string;
  readonly agentId: string;
  readonly lineageDigest: PlanningDigestV1;
  readonly roleKey: string;
  readonly roleDefinitionDigest: PlanningDigestV1;
  readonly capabilityKeys: readonly string[];
  readonly authorityDigest: PlanningDigestV1;
  readonly declaredUtilityMicros: number;
  readonly declaredCostUnits: number;
  readonly declaredResourceUnits: number;
  readonly maximumRequestedBudgetUnits: number;
  readonly collateralUnits: number;
  readonly resourceCeilingUnits: number;
  readonly capabilityConfidenceBasisPoints: number;
  readonly validFromLogicalMs: number;
  readonly validUntilLogicalMs: number;
}

export interface ReferenceLocalCapabilityCatalogV1 {
  readonly schemaVersion: 1;
  readonly catalogId: string;
  readonly catalogVersion: number;
  readonly tenantId: string;
  readonly localPeerId: string;
  readonly localInstanceId: string;
  readonly membershipConfigurationDigest: PlanningDigestV1;
  readonly issuerId: string;
  readonly issuerKeyDigest: PlanningDigestV1;
  readonly independenceGroupId: string;
  readonly bidNonceSeed: string;
  readonly bidValidityMs: number;
  readonly credibilityStateDigest: PlanningDigestV1;
  readonly credibilityScoreBasisPoints: number;
  readonly credibilityUncertaintyBasisPoints: number;
  readonly collusionPressureBasisPoints: number;
  readonly entries: readonly ReferenceLocalCapabilityEntryV1[];
  readonly catalogDigest: PlanningDigestV1;
}

export interface ReferenceGovernedRoleCurrentnessV1 {
  resolve(input: {
    readonly missionId: string;
    readonly objectiveId: string;
    readonly roleKey: string;
    readonly agentId: string;
    readonly requiredCapabilityKeys: readonly string[];
    readonly logicalTimeMs: number;
  }): Promise<{
    readonly roleDefinitionDigest: PlanningDigestV1;
    readonly authorityDigest: PlanningDigestV1;
    readonly roleBindingDigest: PlanningDigestV1;
    readonly validUntilLogicalMs: number;
  } | null>;
}

/** Adapts the governed role catalog into a content-bound currentness resolver. */
export class GovernedRoleCatalogCurrentnessV1 implements ReferenceGovernedRoleCurrentnessV1 {
  readonly #catalog: GovernedRoleCatalogRuntimeV2;
  readonly #missionId: string;
  readonly #crypto: Crypto | undefined;

  constructor(
    readonly options: {
      readonly catalog: GovernedRoleCatalogRuntimeV2;
      readonly crypto?: Crypto;
    },
  ) {
    if (!isGovernedRoleCatalogRuntimeV2(options.catalog))
      throw new TypeError("concrete governed role catalog is required");
    this.#catalog = options.catalog;
    this.#missionId = governedRoleCatalogMissionIdV2(options.catalog);
    this.#crypto = options.crypto;
    Object.defineProperty(this, "options", {
      value: Object.freeze({ ...options }),
      writable: false,
      configurable: false,
      enumerable: true,
    });
  }

  async resolve(
    input: Parameters<ReferenceGovernedRoleCurrentnessV1["resolve"]>[0],
  ) {
    if (input.missionId !== this.#missionId) return null;
    const binding = await invokeGovernedRoleCatalogResolveActiveRoleBindingV2(
      this.#catalog,
      {
        roleKey: input.roleKey,
        agentId: input.agentId,
        objectiveId: input.objectiveId,
        validFromLogicalMs: input.logicalTimeMs,
        validUntilLogicalMs: safeAdd(input.logicalTimeMs, 1),
      },
    );
    if (!binding) return null;
    const constraints = binding.constraints as Record<string, unknown>;
    const roleDefinitionDigest = constraints.definitionDigest;
    const authorityDigest = constraints.authorityDigest;
    const capabilityKeys = constraints.capabilityKeys;
    digest(roleDefinitionDigest, "governedRole.definitionDigest");
    digest(authorityDigest, "governedRole.authorityDigest");
    if (
      !Array.isArray(capabilityKeys) ||
      input.requiredCapabilityKeys.some((key) => !capabilityKeys.includes(key))
    )
      return null;
    return immutable({
      roleDefinitionDigest: roleDefinitionDigest as PlanningDigestV1,
      authorityDigest: authorityDigest as PlanningDigestV1,
      roleBindingDigest: (await collectiveQuorumDigestV1(
        {
          domain: "reference-governed-role-binding-v1",
          body: binding,
        },
        this.#crypto,
      )) as PlanningDigestV1,
      validUntilLogicalMs: binding.validUntilLogicalMs,
    });
  }
}

export async function createReferenceLocalCapabilityCatalogV1(
  input: Omit<ReferenceLocalCapabilityCatalogV1, "catalogDigest">,
  crypto?: Crypto,
): Promise<ReferenceLocalCapabilityCatalogV1> {
  validateCatalogBody(input);
  const body = immutable({
    ...input,
    entries: [...input.entries].sort((a, b) =>
      a.entryId.localeCompare(b.entryId),
    ),
  });
  return immutable({
    ...body,
    catalogDigest: (await collectiveQuorumDigestV1(
      {
        domain: "reference-local-capability-catalog-v1",
        body,
      },
      crypto,
    )) as PlanningDigestV1,
  });
}

/**
 * Concrete local planning and execution-material adapter. Mission ticks expose
 * no prepared graph, candidate set, score, cognitive payload, or result.
 */
export class ReferenceLocalCatalogRuntimeV1
  implements
    AutonomousCollectiveLocalPlanningPortV1,
    AutonomousCollectiveTaskMaterializerPortV1,
    AutonomousCollectiveTaskContextRehydratorPortV1,
    StrategicAllocationEvidencePortV1,
    AssuranceExecutionCurrentnessPortV1
{
  readonly #entries: ReadonlyMap<string, ReferenceLocalCapabilityEntryV1>;
  readonly #attestationEntries = new Map<
    string,
    ReferenceLocalCapabilityEntryV1
  >();
  readonly #signal: AbortSignal;
  readonly #catalog: ReferenceLocalCapabilityCatalogV1;
  #catalogVerification: Promise<void> | null = null;

  constructor(
    readonly options: {
      readonly catalog: ReferenceLocalCapabilityCatalogV1;
      readonly tenant?: TenantContext;
      readonly credentials?: Readonly<Record<string, string>>;
      readonly lifecycle?: Pick<GovernedAgentLifecycleRuntimeV1, "eligibility">;
      readonly roles?: ReferenceGovernedRoleCurrentnessV1;
      readonly remoteEvidence?: StrategicAllocationEvidencePortV1;
      readonly signal?: AbortSignal;
      readonly crypto?: Crypto;
    },
  ) {
    validateCatalog(options.catalog);
    const catalog = immutable(options.catalog);
    if (
      options.lifecycle &&
      typeof options.lifecycle.eligibility !== "function"
    )
      throw new TypeError("governed lifecycle eligibility port is invalid");
    if (options.roles && typeof options.roles.resolve !== "function")
      throw new TypeError("governed role currentness port is invalid");
    if (
      options.remoteEvidence &&
      (typeof options.remoteEvidence.verifyCapabilityAttestation !==
        "function" ||
        typeof options.remoteEvidence.verifyPeerProjection !== "function")
    )
      throw new TypeError("remote allocation evidence port is invalid");
    this.#catalog = catalog;
    this.#entries = new Map(
      catalog.entries.map((entry) => [entry.entryId, entry]),
    );
    this.#signal = options.signal ?? new AbortController().signal;
    const tenant = immutable(
      options.tenant ?? { tenantId: options.catalog.tenantId },
    );
    const credentials = options.credentials
      ? immutable(options.credentials)
      : undefined;
    Object.defineProperty(this, "options", {
      value: Object.freeze({
        ...options,
        catalog,
        tenant,
        ...(credentials ? { credentials } : {}),
      }),
      writable: false,
      configurable: false,
      enumerable: true,
    });
  }

  async availableRoleKeys(input: {
    readonly intent: MissionIntentV1;
    readonly logicalTimeMs: number;
  }): Promise<readonly string[]> {
    await this.#verifyCatalog();
    const roles = new Set<string>();
    for (const entry of this.options.catalog.entries) {
      if (!active(entry, input.logicalTimeMs)) continue;
      if (
        !entry.capabilityKeys.some((key) =>
          input.intent.permittedCapabilityKeys.includes(key),
        )
      )
        continue;
      if (!(await this.#eligible(entry))) continue;
      if (
        this.options.roles &&
        !(await this.#currentRole({
          entry,
          missionId: input.intent.missionIntentId,
          objectiveId: input.intent.missionIntentId,
          requiredCapabilityKeys: entry.capabilityKeys,
          logicalTimeMs: input.logicalTimeMs,
        }))
      )
        continue;
      roles.add(entry.roleKey);
    }
    return Object.freeze([...roles].sort());
  }

  async proposeBids(
    input: Parameters<
      AutonomousCollectiveLocalPlanningPortV1["proposeBids"]
    >[0],
  ) {
    await this.#verifyCatalog();
    this.#assertLocalBinding(
      input.localPeerId,
      input.localInstanceId,
      input.scopeDigest,
    );
    const bids: AutonomousCollectiveLocalBidV1[] = [];
    for (const task of [...input.graph.tasks].sort((a, b) =>
      a.taskId.localeCompare(b.taskId),
    )) {
      const candidates: ReferenceLocalCapabilityEntryV1[] = [];
      for (const entry of this.options.catalog.entries) {
        if (
          !active(entry, input.logicalTimeMs) ||
          entry.validUntilLogicalMs <= input.cycle.bidRevealCloseAtLogicalMs
        )
          continue;
        if (
          entry.roleKey !== task.roleKey ||
          !includesAll(entry.capabilityKeys, task.requiredCapabilityKeys)
        )
          continue;
        if (
          task.requiredCapabilityKeys.some(
            (key) => !input.intent.permittedCapabilityKeys.includes(key),
          )
        )
          continue;
        if (!(await this.#eligible(entry, task.requiredCapabilityKeys)))
          continue;
        if (
          this.options.roles &&
          !(await this.#currentRole({
            entry,
            missionId: input.intent.missionIntentId,
            objectiveId: input.cycle.cycleId,
            requiredCapabilityKeys: task.requiredCapabilityKeys,
            logicalTimeMs: input.logicalTimeMs,
          }))
        )
          continue;
        candidates.push(entry);
      }
      const entry = candidates.sort(compareEntries)[0];
      if (!entry) continue;
      const validUntil = Math.min(
        entry.validUntilLogicalMs,
        safeAdd(input.logicalTimeMs, this.options.catalog.bidValidityMs),
      );
      const attestation = await this.#attestation(
        entry,
        input.logicalTimeMs,
        validUntil,
      );
      this.#attestationEntries.set(attestation.attestationDigest, entry);
      bids.push(
        immutable({
          taskId: task.taskId,
          independenceGroupId: this.options.catalog.independenceGroupId,
          declaredUtilityMicros: entry.declaredUtilityMicros,
          declaredCostUnits: entry.declaredCostUnits,
          declaredResourceUnits: entry.declaredResourceUnits,
          requestedBudgetUnits: Math.min(
            task.budgetUnits,
            entry.maximumRequestedBudgetUnits,
          ),
          collateralUnits: entry.collateralUnits,
          availabilityUntilLogicalMs: validUntil,
          nonceDigest: (await collectiveQuorumDigestV1(
            {
              domain: "reference-local-sealed-bid-nonce-v1",
              body: {
                catalogDigest: this.options.catalog.catalogDigest,
                secretSeed: this.options.catalog.bidNonceSeed,
                cycleId: input.cycle.cycleId,
                allocationId: input.cycle.allocationId,
                taskDigest: task.taskDigest,
                entryId: entry.entryId,
              },
            },
            this.options.crypto,
          )) as PlanningDigestV1,
          attestation,
          peerProjection: this.#projection(input.scopeDigest),
        }),
      );
    }
    return Object.freeze(bids);
  }

  async prepare(
    input: Parameters<AutonomousCollectiveTaskMaterializerPortV1["prepare"]>[0],
  ) {
    await this.#verifyCatalog();
    const entry = this.#attestationEntries.get(input.award.attestationDigest);
    if (
      !entry ||
      !active(entry, input.logicalTimeMs) ||
      entry.roleKey !== input.task.roleKey ||
      !includesAll(entry.capabilityKeys, input.task.requiredCapabilityKeys)
    )
      throw new Error("local award has no eligible catalog execution binding");
    if (!(await this.#eligible(entry, input.task.requiredCapabilityKeys)))
      throw new Error("local award agent is no longer lifecycle eligible");
    const role = await this.#currentRole({
      entry,
      missionId: input.intent.missionIntentId,
      objectiveId: input.cycle.cycleId,
      requiredCapabilityKeys: input.task.requiredCapabilityKeys,
      logicalTimeMs: input.logicalTimeMs,
    });
    if (!role)
      throw new Error("local award role binding is not currently governed");
    if (
      !input.plan.awards.some(
        (award) =>
          award.awardDigest === input.award.awardDigest &&
          award.peerId === this.options.catalog.localPeerId &&
          award.peerInstanceId === this.options.catalog.localInstanceId,
      )
    )
      throw new TypeError("local award is not in the certified plan");
    const semanticSequence = integer(
      input.semanticSequence,
      "semanticSequence",
      1,
      Number.MAX_SAFE_INTEGER,
    );
    const admittedMessageDigests = [
      ...new Set(input.admittedMessageDigests),
    ].sort();
    admittedMessageDigests.forEach((item) =>
      digest(item, "admittedMessageDigest"),
    );
    if (
      JSON.stringify(admittedMessageDigests) !==
      JSON.stringify(input.admittedMessageDigests)
    )
      throw new TypeError(
        "certified planning evidence digests are not canonical",
      );
    const payload = {
      missionIntentId: input.intent.missionIntentId,
      missionIntentDigest: input.intent.intentDigest,
      planningCycleId: input.cycle.cycleId,
      decompositionGraphDigest: input.graph.graphDigest,
      allocationPlanDigest: input.plan.planDigest,
      awardDigest: input.award.awardDigest,
      task: taskPayload(input.task),
      admittedMessageDigests,
      catalogDigest: this.options.catalog.catalogDigest,
      catalogEntryId: entry.entryId,
    };
    const operationalBindingDigest = await collectiveQuorumDigestV1(
      {
        domain: "reference-operational-task-binding-v1",
        body: {
          payload,
          authorityDigest: role.authorityDigest,
          roleBindingDigest: role.roleBindingDigest,
          planningFinalityCertificateDigest:
            input.planningFinality.certificateDigest,
        },
      },
      this.options.crypto,
    );
    const metadata: Metadata = {
      catalogDigest: this.options.catalog.catalogDigest,
      operationalBindingDigest,
      operationalObservationSequence: semanticSequence * 3 - 2,
      admittedMessageDigests,
      requestedToolNames: [],
    };
    const cognitiveRequest = await createCognitiveOperationRequestV2({
      schemaVersion: 2,
      operationId: `task:${input.award.awardDigest.slice(7, 47)}`,
      operation: "plan",
      tenantId: this.options.catalog.tenantId,
      sessionId: `session:${input.award.awardDigest.slice(7, 47)}`,
      agentId: entry.agentId,
      expectedRevision: 0,
      logicalTimeMs: input.logicalTimeMs,
      payload: payload as unknown as import("@agentplat/core").JsonObject,
      metadata,
      authorityDigest: role.authorityDigest,
      roleBindingDigest: role.roleBindingDigest,
      controlPlaneDigest: input.planningFinality.certificateDigest,
    });
    const cognitiveContext: CognitiveAgentAdapterContextV2 = {
      tenant: this.options.tenant ?? {
        tenantId: this.options.catalog.tenantId,
      },
      signal: this.#signal,
      ...(this.options.credentials
        ? { credentials: this.options.credentials }
        : {}),
    };
    return Object.freeze({
      semanticSequence,
      cognitiveRequest,
      cognitiveContext: Object.freeze(cognitiveContext),
    });
  }

  /** Rehydrates only live process capabilities around an already durable request. */
  async rehydrate(
    input: Parameters<
      AutonomousCollectiveTaskContextRehydratorPortV1["rehydrate"]
    >[0],
  ): Promise<CognitiveAgentAdapterContextV2> {
    await this.#verifyCatalog();
    const configuredBinding =
      createAutonomousCollectiveCognitiveContextBindingV1(
        this.options.tenant!,
      );
    const [persistedTenantDigest, configuredTenantDigest] = await Promise.all([
      collectiveQuorumDigestV1(
        {
          domain: "autonomous-collective-cognitive-tenant-binding-v1",
          body: input.contextBinding ?? null,
        },
        this.options.crypto,
      ),
      collectiveQuorumDigestV1(
        {
          domain: "autonomous-collective-cognitive-tenant-binding-v1",
          body: configuredBinding,
        },
        this.options.crypto,
      ),
    ]);
    if (
      input.contextBinding?.schemaVersion !== 1 ||
      input.cognitiveRequest.tenantId !== this.#catalog.tenantId ||
      input.contextBinding.tenant?.tenantId !== this.#catalog.tenantId ||
      persistedTenantDigest !== configuredTenantDigest
    )
      throw new TypeError(
        "durable cognitive context is outside the local tenant authority",
      );
    return Object.freeze({
      tenant: this.options.tenant!,
      signal: this.#signal,
      ...(this.options.credentials
        ? { credentials: this.options.credentials }
        : {}),
    });
  }

  async verifyCapabilityAttestation(
    input: Parameters<
      StrategicAllocationEvidencePortV1["verifyCapabilityAttestation"]
    >[0],
  ) {
    await this.#verifyCatalog();
    if (input.attestation.peerId !== this.options.catalog.localPeerId)
      return (
        this.options.remoteEvidence?.verifyCapabilityAttestation(input) ?? false
      );
    const entryId = input.attestation.attestationId.startsWith("capability:")
      ? input.attestation.attestationId.slice("capability:".length)
      : "";
    const entry = this.#entries.get(entryId);
    if (
      !entry ||
      input.attestation.peerId !== this.options.catalog.localPeerId ||
      input.attestation.attestationId !== `capability:${entry.entryId}` ||
      JSON.stringify(input.attestation.capabilityKeys) !==
        JSON.stringify(entry.capabilityKeys) ||
      input.attestation.capabilityConfidenceBasisPoints !==
        entry.capabilityConfidenceBasisPoints ||
      input.attestation.resourceCeilingUnits !== entry.resourceCeilingUnits ||
      input.attestation.issuerId !== this.options.catalog.issuerId ||
      input.attestation.issuerKeyDigest !==
        this.options.catalog.issuerKeyDigest ||
      input.attestation.validFromLogicalMs < entry.validFromLogicalMs ||
      input.attestation.validUntilLogicalMs > entry.validUntilLogicalMs ||
      input.attestation.validFromLogicalMs > input.logicalTimeMs ||
      input.attestation.validUntilLogicalMs <= input.logicalTimeMs ||
      !includesAll(entry.capabilityKeys, input.task.requiredCapabilityKeys) ||
      !includesAll(
        input.attestation.capabilityKeys,
        input.task.requiredCapabilityKeys,
      ) ||
      !active(entry, input.logicalTimeMs) ||
      !(await this.#eligible(entry, input.task.requiredCapabilityKeys))
    )
      return false;
    const { attestationDigest, ...body } = input.attestation;
    return (
      attestationDigest ===
      (await collectiveQuorumDigestV1(
        {
          domain: "reference-local-capability-attestation-v1",
          body,
        },
        this.options.crypto,
      ))
    );
  }

  async verifyPeerProjection(
    input: Parameters<
      StrategicAllocationEvidencePortV1["verifyPeerProjection"]
    >[0],
  ) {
    await this.#verifyCatalog();
    if (input.projection.peerId !== this.options.catalog.localPeerId)
      return this.options.remoteEvidence?.verifyPeerProjection(input) ?? false;
    return (
      input.projection.scopeDigest === input.scopeDigest &&
      JSON.stringify(input.projection) ===
        JSON.stringify(this.#projection(input.scopeDigest))
    );
  }

  async verify(
    input: Parameters<AssuranceExecutionCurrentnessPortV1["verify"]>[0],
  ): Promise<boolean> {
    await this.#verifyCatalog();
    if (
      !this.options.lifecycle ||
      !this.options.roles ||
      input.localPeerId !== this.options.catalog.localPeerId ||
      input.localInstanceId !== this.options.catalog.localInstanceId
    )
      return false;
    const payload = input.cognitiveRequest.payload as Record<string, unknown>;
    const task = payload.task as Record<string, unknown> | undefined;
    const entryId = payload.catalogEntryId;
    if (typeof entryId !== "string") return false;
    const entry = this.#entries.get(entryId);
    if (
      !entry ||
      !active(entry, input.logicalTimeMs) ||
      input.cognitiveRequest.tenantId !== this.options.catalog.tenantId ||
      input.cognitiveRequest.agentId !== entry.agentId ||
      input.cognitiveRequest.authorityDigest !== entry.authorityDigest ||
      input.cognitiveRequest.controlPlaneDigest !==
        input.planningFinalityCertificateDigest ||
      payload.decompositionGraphDigest !== input.graphDigest ||
      payload.allocationPlanDigest !== input.allocationPlanDigest ||
      payload.awardDigest !== input.awardDigest ||
      payload.catalogDigest !== this.options.catalog.catalogDigest ||
      input.cognitiveRequest.metadata.catalogDigest !==
        this.options.catalog.catalogDigest ||
      task?.taskDigest !== input.task.taskDigest
    )
      return false;
    const missionId = payload.missionIntentId;
    const objectiveId = payload.planningCycleId;
    if (typeof missionId !== "string" || typeof objectiveId !== "string")
      return false;
    const role = await this.#currentRole({
      entry,
      missionId,
      objectiveId,
      requiredCapabilityKeys: input.task.requiredCapabilityKeys,
      logicalTimeMs: input.logicalTimeMs,
    });
    return Boolean(
      role &&
      role.authorityDigest === input.cognitiveRequest.authorityDigest &&
      role.roleBindingDigest === input.cognitiveRequest.roleBindingDigest &&
      (await this.#eligible(entry, input.task.requiredCapabilityKeys)),
    );
  }

  async #attestation(
    entry: ReferenceLocalCapabilityEntryV1,
    validFromLogicalMs: number,
    validUntilLogicalMs: number,
  ): Promise<StrategicCapabilityAttestationV1> {
    const body = {
      attestationId: `capability:${entry.entryId}`,
      peerId: this.options.catalog.localPeerId,
      capabilityKeys: entry.capabilityKeys,
      capabilityConfidenceBasisPoints: entry.capabilityConfidenceBasisPoints,
      resourceCeilingUnits: entry.resourceCeilingUnits,
      issuerId: this.options.catalog.issuerId,
      issuerKeyDigest: this.options.catalog.issuerKeyDigest,
      validFromLogicalMs,
      validUntilLogicalMs,
    };
    return immutable({
      ...body,
      attestationDigest: (await collectiveQuorumDigestV1(
        {
          domain: "reference-local-capability-attestation-v1",
          body,
        },
        this.options.crypto,
      )) as PlanningDigestV1,
    });
  }

  #projection(scopeDigest: string): StrategicPeerProjectionV1 {
    return immutable({
      peerId: this.options.catalog.localPeerId,
      scopeDigest: scopeDigest as PlanningDigestV1,
      credibilityStateDigest: this.options.catalog.credibilityStateDigest,
      credibilityScoreBasisPoints:
        this.options.catalog.credibilityScoreBasisPoints,
      credibilityUncertaintyBasisPoints:
        this.options.catalog.credibilityUncertaintyBasisPoints,
      collusionPressureBasisPoints:
        this.options.catalog.collusionPressureBasisPoints,
      status: "eligible",
    });
  }

  async #eligible(
    entry: ReferenceLocalCapabilityEntryV1,
    capabilities = entry.capabilityKeys,
  ): Promise<boolean> {
    if (!this.options.lifecycle) return true;
    for (const capabilityKey of capabilities) {
      const request = {
        peerId: this.options.catalog.localPeerId,
        instanceId: this.options.catalog.localInstanceId,
        capabilityKey,
      };
      const decision = isGovernedAgentLifecycleRuntimeV1(this.options.lifecycle)
        ? await invokeGovernedAgentLifecycleEligibilityV1(
            this.options.lifecycle,
            request,
          )
        : await this.options.lifecycle.eligibility(request);
      if (
        !decision.eligible ||
        decision.agent?.agentId !== entry.agentId ||
        decision.agent.lineageDigest !== entry.lineageDigest ||
        decision.agent.authorityDigest !== entry.authorityDigest ||
        decision.agent.roleDefinitionDigest !== entry.roleDefinitionDigest ||
        decision.membershipConfigurationDigest !==
          this.options.catalog.membershipConfigurationDigest
      )
        return false;
    }
    return true;
  }

  async #currentRole(input: {
    readonly entry: ReferenceLocalCapabilityEntryV1;
    readonly missionId: string;
    readonly objectiveId: string;
    readonly requiredCapabilityKeys: readonly string[];
    readonly logicalTimeMs: number;
  }) {
    if (!this.options.roles) return null;
    const role = await this.options.roles.resolve({
      missionId: input.missionId,
      objectiveId: input.objectiveId,
      roleKey: input.entry.roleKey,
      agentId: input.entry.agentId,
      requiredCapabilityKeys: input.requiredCapabilityKeys,
      logicalTimeMs: input.logicalTimeMs,
    });
    if (
      !role ||
      role.roleDefinitionDigest !== input.entry.roleDefinitionDigest ||
      role.authorityDigest !== input.entry.authorityDigest ||
      role.validUntilLogicalMs <= input.logicalTimeMs
    )
      return null;
    return role;
  }

  async #verifyCatalog(): Promise<void> {
    this.#catalogVerification ??= (async () => {
      const { catalogDigest, ...raw } = this.#catalog;
      const body = immutable({
        ...raw,
        entries: [...raw.entries].sort((a, b) =>
          a.entryId.localeCompare(b.entryId),
        ),
      });
      const expected = await collectiveQuorumDigestV1(
        {
          domain: "reference-local-capability-catalog-v1",
          body,
        },
        this.options.crypto,
      );
      if (catalogDigest !== expected)
        throw new TypeError("local capability catalog digest is invalid");
    })();
    return this.#catalogVerification;
  }

  #assertLocalBinding(
    peerId: string,
    instanceId: string,
    scopeDigest: string,
  ): void {
    if (
      peerId !== this.options.catalog.localPeerId ||
      instanceId !== this.options.catalog.localInstanceId
    )
      throw new TypeError(
        "local catalog identity differs from collective protocol identity",
      );
    digest(scopeDigest, "scopeDigest");
  }
}

/** Cognitive execution port whose model call is enclosed by pre/post-turn control. */
export class ReferenceOperationalCognitiveExecutionPortV1 implements AssuranceCognitiveExecutionPortV1 {
  readonly #integrity = createWebCryptoCognitiveIntegrityV2();
  readonly #controller: OperationalCognitiveControllerV1;

  constructor(
    readonly controller: OperationalCognitiveControllerV1,
    readonly crypto?: Crypto,
  ) {
    if (!isOperationalCognitiveControllerV1(controller))
      throw new TypeError(
        "reference execution requires a concrete operational cognitive controller",
      );
    this.#controller = controller;
    Object.defineProperty(this, "controller", {
      value: controller,
      writable: false,
      configurable: false,
      enumerable: true,
    });
  }

  isBoundToController(controller: object): boolean {
    return (
      this.#controller === controller &&
      isOperationalCognitiveControllerV1(controller)
    );
  }

  async execute(
    request: CognitiveOperationRequestV2,
    context: CognitiveAgentAdapterContextV2,
  ) {
    if (request.operation !== "plan")
      throw new TypeError(
        "reference operational execution accepts tool-free plan operations only",
      );
    if (context.tenant.tenantId !== request.tenantId)
      throw new TypeError("operational cognitive tenant binding differs");
    if (context.signal.aborted)
      throw new Error("operational cognitive execution aborted");
    const [payloadDigest, requestMetadataDigest] = await Promise.all([
      this.#integrity.digest("cognitive-operation-payload-v2", request.payload),
      this.#integrity.digest(
        "cognitive-operation-metadata-v2",
        request.metadata,
      ),
    ]);
    if (
      payloadDigest !== request.payloadDigest ||
      requestMetadataDigest !== request.metadataDigest
    )
      throw new TypeError(
        "operational cognitive request content digest is invalid",
      );
    if (!request.controlPlaneDigest)
      throw new TypeError(
        "operational cognitive planning finality is required",
      );
    const bindingDigest = metadataDigest(
      request.metadata.operationalBindingDigest,
      "operationalBindingDigest",
    );
    const expectedBindingDigest = await collectiveQuorumDigestV1(
      {
        domain: "reference-operational-task-binding-v1",
        body: {
          payload: request.payload,
          authorityDigest: request.authorityDigest,
          roleBindingDigest: request.roleBindingDigest,
          planningFinalityCertificateDigest: request.controlPlaneDigest,
        },
      },
      this.crypto,
    );
    if (bindingDigest !== expectedBindingDigest)
      throw new TypeError(
        "operational cognitive task binding digest is invalid",
      );
    const observationSequence = metadataInteger(
      request.metadata.operationalObservationSequence,
      "operationalObservationSequence",
    );
    const requestedToolNames = request.metadata.requestedToolNames;
    if (!Array.isArray(requestedToolNames) || requestedToolNames.length !== 0)
      throw new TypeError("reference plan operation cannot request tools");
    const turn = await invokeOperationalCognitiveRunTurnV1(this.#controller, {
      operationId: request.operationId,
      observationSequence,
      step: request.expectedRevision,
      logicalTimeMs: request.logicalTimeMs,
      bindingDigest,
      input: JSON.stringify(request.payload),
      context: [],
      requestedToolNames: [],
      memoryQueryDigest: null,
      representation: null,
    });
    const output = turn.output;
    const status: CognitiveOperationResultV2["status"] =
      turn.status === "completed"
        ? "completed"
        : turn.status === "blocked"
          ? "refused"
          : "abstained";
    const reasonCode =
      turn.status === "completed"
        ? "operational_control_completed"
        : `operational_control_${turn.status}`;
    const result = immutable({
      schemaVersion: 2 as const,
      operationId: request.operationId,
      status,
      output,
      outputDigest: await this.#integrity.digest(
        "cognitive-operation-output-v2",
        output,
      ),
      reasonCode,
      controlSurface: turn.status === "completed" ? null : ("action" as const),
    });
    const previousStateDigest = await collectiveQuorumDigestV1(
      {
        domain: "reference-operational-cognitive-predecessor-v1",
        body: {
          sessionId: request.sessionId,
          expectedRevision: request.expectedRevision,
        },
      },
      this.crypto,
    );
    const receiptBody: Omit<CognitiveOperationReceiptV2, "receiptDigest"> = {
      schemaVersion: 2,
      operationId: request.operationId,
      operation: request.operation,
      sessionId: request.sessionId,
      agentId: request.agentId,
      revision: request.expectedRevision + 1,
      logicalTimeMs: request.logicalTimeMs,
      payloadDigest: request.payloadDigest,
      metadataDigest: request.metadataDigest,
      outputDigest: result.outputDigest,
      authorityDigest: request.authorityDigest,
      roleBindingDigest: request.roleBindingDigest,
      ...(request.controlPlaneDigest
        ? { controlPlaneDigest: request.controlPlaneDigest }
        : {}),
      implementationId: this.controller.options.controlId,
      status: result.status,
      reasonCode: result.reasonCode,
      controlSurface: result.controlSurface,
      previousStateDigest,
    };
    const receipt = immutable({
      ...receiptBody,
      receiptDigest: await collectiveQuorumDigestV1(
        {
          domain: "reference-operational-cognitive-receipt-v1",
          body: receiptBody,
        },
        this.crypto,
      ),
    });
    return immutable({ result, receipt });
  }
}

function taskPayload(task: MissionTaskNodeV1) {
  return {
    schemaVersion: task.schemaVersion,
    taskId: task.taskId,
    taskDigest: task.taskDigest,
    semanticSlotKey: task.semanticSlotKey,
    outcomeIndex: task.outcomeIndex,
    stepKey: task.stepKey,
    roleKey: task.roleKey,
    requiredCapabilityKeys: task.requiredCapabilityKeys,
    dependencyTaskDigests: task.dependencyTaskDigests,
    budgetUnits: task.budgetUnits,
    confidenceBasisPoints: task.confidenceBasisPoints,
    proposerPeerId: task.proposerPeerId,
    proposerInstanceId: task.proposerInstanceId,
    basisObservationDigests: task.basisObservationDigests,
    predecessorTaskDigest: task.predecessorTaskDigest,
  };
}

function compareEntries(
  left: ReferenceLocalCapabilityEntryV1,
  right: ReferenceLocalCapabilityEntryV1,
): number {
  return (
    right.declaredUtilityMicros - left.declaredUtilityMicros ||
    left.declaredCostUnits - right.declaredCostUnits ||
    left.entryId.localeCompare(right.entryId)
  );
}

function includesAll(
  available: readonly string[],
  required: readonly string[],
): boolean {
  return required.every((item) => available.includes(item));
}

function active(
  entry: ReferenceLocalCapabilityEntryV1,
  logicalTimeMs: number,
): boolean {
  return (
    entry.validFromLogicalMs <= logicalTimeMs &&
    logicalTimeMs < entry.validUntilLogicalMs
  );
}

function validateCatalog(catalog: ReferenceLocalCapabilityCatalogV1): void {
  const { catalogDigest, ...body } = catalog;
  digest(catalogDigest, "catalogDigest");
  validateCatalogBody(body);
}

function validateCatalogBody(
  input: Omit<ReferenceLocalCapabilityCatalogV1, "catalogDigest">,
): void {
  if (!input || input.schemaVersion !== 1)
    throw new TypeError("local capability catalog schema is invalid");
  for (const [label, value] of Object.entries({
    catalogId: input.catalogId,
    tenantId: input.tenantId,
    localPeerId: input.localPeerId,
    localInstanceId: input.localInstanceId,
    issuerId: input.issuerId,
    independenceGroupId: input.independenceGroupId,
  }))
    identifier(value, label);
  digest(input.membershipConfigurationDigest, "membershipConfigurationDigest");
  digest(input.issuerKeyDigest, "issuerKeyDigest");
  digest(input.credibilityStateDigest, "credibilityStateDigest");
  integer(input.catalogVersion, "catalogVersion", 1, Number.MAX_SAFE_INTEGER);
  integer(input.bidValidityMs, "bidValidityMs", 1, Number.MAX_SAFE_INTEGER);
  if (
    typeof input.bidNonceSeed !== "string" ||
    input.bidNonceSeed.length < 16 ||
    input.bidNonceSeed.length > 4_096
  )
    throw new TypeError("bidNonceSeed is invalid");
  for (const label of [
    "credibilityScoreBasisPoints",
    "credibilityUncertaintyBasisPoints",
    "collusionPressureBasisPoints",
  ] as const)
    integer(input[label], label, 0, 10_000);
  const ids = new Set<string>();
  for (const entry of input.entries) {
    for (const [label, value] of Object.entries({
      entryId: entry.entryId,
      agentId: entry.agentId,
      roleKey: entry.roleKey,
    }))
      identifier(value, label);
    if (ids.has(entry.entryId))
      throw new TypeError("local capability catalog entry is duplicated");
    ids.add(entry.entryId);
    canonicalIdentifiers(entry.capabilityKeys, "capabilityKeys");
    digest(entry.lineageDigest, "lineageDigest");
    digest(entry.roleDefinitionDigest, "roleDefinitionDigest");
    digest(entry.authorityDigest, "authorityDigest");
    integer(
      entry.declaredUtilityMicros,
      "declaredUtilityMicros",
      0,
      1_000_000_000,
    );
    for (const label of [
      "declaredCostUnits",
      "declaredResourceUnits",
      "maximumRequestedBudgetUnits",
      "collateralUnits",
    ] as const)
      integer(entry[label], label, 0, Number.MAX_SAFE_INTEGER);
    integer(
      entry.resourceCeilingUnits,
      "resourceCeilingUnits",
      1,
      Number.MAX_SAFE_INTEGER,
    );
    integer(
      entry.capabilityConfidenceBasisPoints,
      "capabilityConfidenceBasisPoints",
      0,
      10_000,
    );
    integer(
      entry.validFromLogicalMs,
      "validFromLogicalMs",
      0,
      Number.MAX_SAFE_INTEGER,
    );
    integer(
      entry.validUntilLogicalMs,
      "validUntilLogicalMs",
      entry.validFromLogicalMs + 1,
      Number.MAX_SAFE_INTEGER,
    );
  }
}

function canonicalIdentifiers(values: readonly string[], label: string): void {
  const canonical = [...new Set(values)].sort();
  if (
    canonical.length !== values.length ||
    canonical.some((item, index) => item !== values[index])
  )
    throw new TypeError(`${label} is not canonical`);
  values.forEach((item) => identifier(item, label));
}

function metadataDigest(value: unknown, label: string): string {
  digest(value, label);
  return value;
}

function metadataInteger(value: unknown, label: string): number {
  return integer(value, label, 1, Number.MAX_SAFE_INTEGER);
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

function safeAdd(left: number, right: number): number {
  return integer(
    left + right,
    "logicalTimeDeadline",
    1,
    Number.MAX_SAFE_INTEGER,
  );
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
