import type {
  CollectiveMembershipChangeV1,
  CollectiveMembershipKeyProofV1,
  CollectiveMembershipMemberV1,
} from "./contracts.js";
import { collectiveMembershipDigestV1 } from "./crypto.js";

export interface AgentCreationPolicyV1 {
  readonly schemaVersion: 1;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly maximumGeneration: number;
  readonly maximumChildrenPerAgent: number;
  readonly maximumActiveDescendants: number;
  readonly maximumResourceUnitsPerChild: number;
  readonly maximumInteractionUnitsPerChild: number;
  readonly allowedAdapterIds: readonly string[];
  readonly permittedCapabilityKeys: readonly string[];
  readonly requireRulePolicyInheritance: boolean;
  readonly requireAuthorityAttenuation: boolean;
  readonly requestTtlLogicalMs: number;
  readonly maximumCommitAttempts: number;
  readonly policyDigest: string;
}

export interface AgentLineageRecordV1 {
  readonly schemaVersion: 1;
  readonly agentId: string;
  readonly peerId: string;
  readonly instanceId: string;
  readonly parentAgentId: string | null;
  readonly rootAgentId: string;
  readonly generation: number;
  readonly factoryId: string;
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly capabilityKeys: readonly string[];
  readonly roleDefinitionDigest: string;
  readonly authorityDigest: string;
  readonly parentAuthorityDigest: string | null;
  readonly localRuleProgramDigest: string;
  readonly resourceBudgetUnits: number;
  readonly interactionBudgetUnits: number;
  readonly publicKeyId: string;
  readonly publicKey: string;
  readonly validFrom: string;
  readonly validUntil: string;
  readonly creationCertificateDigest: string;
  readonly membershipConfigurationDigest: string | null;
  readonly membershipEpoch: number | null;
  readonly status:
    | "pending_enrollment"
    | "active"
    | "suspended"
    | "revoked"
    | "retiring"
    | "terminated";
  readonly createdAtLogicalMs: number;
  readonly terminatedAtLogicalMs: number | null;
  /** Exact certified membership successor that first excluded this peer. */
  readonly retirementMembershipConfigurationDigest?: string | null;
  readonly retirementMembershipEpoch?: number | null;
  /** Durable enrollment effect journal retained until activation. */
  readonly enrollmentPhase?: "prepared" | "applied" | null;
  readonly enrollmentAuthorizationConfigurationDigest?: string | null;
  readonly enrollmentAuthorizationEpoch?: number | null;
  /** Durable retirement reconciliation coordinates and receipts. */
  readonly retirementOperationId?: string | null;
  readonly retirementStartedAtLogicalMs?: number | null;
  readonly retirementReasonCode?: string | null;
  readonly retirementSourceStatus?:
    "pending_enrollment" | "active" | "suspended" | "revoked" | null;
  readonly retirementSourceLineageDigest?: string | null;
  readonly retirementRequiresMembershipRemoval?: boolean;
  readonly retirementRequiresFactoryTermination?: boolean;
  readonly retirementTerminationReceiptDigest?: string | null;
  readonly lineageDigest: string;
}

export interface AgentLineageCreationSagaV1 {
  readonly operationId: string;
  readonly phase: "prepared" | "effect_applied" | "cancelled" | "completed";
  readonly request: AgentCreationRequestV1;
  readonly certificate: AgentCreationCertificateV1;
  readonly parentLineageDigest: string;
  readonly logicalTimeMs: number;
  readonly factoryReceipt: AgentFactoryReceiptV1 | null;
  readonly cancellationReceiptDigest?: string | null;
}

/** Terminal, cleanup-backed outcome for a creation that can no longer become valid. */
export class GovernedAgentCreationCancelledErrorV1 extends Error {
  constructor(
    readonly requestDigest: string,
    readonly cancellationReceiptDigest: string,
  ) {
    super("governed agent creation was cancelled after authorization expiry");
    this.name = "GovernedAgentCreationCancelledErrorV1";
  }
}

export interface AgentCreationRequestV1 {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly parentAgentId: string;
  readonly requestedAgentId: string;
  readonly requestedPeerId: string;
  readonly requestedInstanceId: string;
  readonly factoryId: string;
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly capabilityKeys: readonly string[];
  readonly roleDefinitionDigest: string;
  readonly proposedAuthorityDigest: string;
  readonly parentAuthorityDigest: string;
  readonly localRuleProgramDigest: string;
  readonly resourceBudgetUnits: number;
  readonly interactionBudgetUnits: number;
  readonly requestedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly requestDigest: string;
}

export interface AgentCreationCertificateV1 {
  readonly schemaVersion: 1;
  readonly requestDigest: string;
  readonly policyDigest: string;
  readonly parentLineageDigest: string;
  readonly roleDefinitionDigest: string;
  readonly authorityAttenuationDigest: string;
  readonly collectiveCertificateDigest: string;
  readonly membershipConfigurationDigest: string;
  readonly membershipEpoch: number;
  readonly certifiedAtLogicalMs: number;
  readonly validUntilLogicalMs: number;
  readonly certificateDigest: string;
}

export interface AgentFactoryReceiptV1 {
  readonly schemaVersion: 1;
  readonly requestDigest: string;
  readonly factoryId: string;
  readonly factoryVersion: number;
  readonly factoryImplementationDigest: string;
  readonly agentId: string;
  readonly peerId: string;
  readonly instanceId: string;
  readonly publicKeyId: string;
  readonly publicKey: string;
  readonly keyAlgorithm: "Ed25519";
  readonly validFrom: string;
  readonly validUntil: string;
  readonly runtimeAttestationDigest: string;
  readonly receiptDigest: string;
}

export interface GovernedAgentFactoryPortV1 {
  readonly factoryId: string;
  readonly factoryVersion: number;
  readonly factoryImplementationDigest: string;
  create(input: {
    readonly request: AgentCreationRequestV1;
    readonly certificate: AgentCreationCertificateV1;
    /** Durable lineage reservation time, stable across exact retries. */
    readonly reservedAtLogicalMs: number;
    readonly signal?: AbortSignal;
  }): Promise<AgentFactoryReceiptV1>;
  terminate(input: {
    readonly operationId: string;
    readonly agent: AgentLineageRecordV1;
    readonly reasonCode: string;
    readonly logicalTimeMs: number;
  }): Promise<{ readonly terminated: boolean; readonly receiptDigest: string }>;
}

export interface AgentCreationCertificationPortV1 {
  verify(input: {
    readonly request: AgentCreationRequestV1;
    readonly parent: AgentLineageRecordV1;
    readonly certificate: AgentCreationCertificateV1;
    readonly logicalTimeMs: number;
  }): Promise<boolean>;
  verifyAuthorityAttenuation(input: {
    readonly parentAuthorityDigest: string;
    readonly childAuthorityDigest: string;
    readonly attenuationDigest: string;
  }): Promise<boolean>;
}

export interface AgentMembershipEnrollmentPortV1 {
  enroll(input: {
    readonly agent: AgentLineageRecordV1;
    readonly member: CollectiveMembershipMemberV1;
    readonly change: CollectiveMembershipChangeV1;
    readonly logicalTimeMs: number;
  }): Promise<{
    readonly enrolled: boolean;
    /** Configuration whose quorum authorized the creation certificate. */
    readonly authorizationConfigurationDigest: string;
    readonly authorizationEpoch: number;
    /** Configuration produced by the certified join transition. */
    readonly membershipConfigurationDigest: string;
    readonly membershipEpoch: number;
  }>;
  remove(input: {
    readonly agent: AgentLineageRecordV1;
    readonly logicalTimeMs: number;
  }): Promise<{
    readonly removed: boolean;
    readonly membershipConfigurationDigest: string;
    readonly membershipEpoch: number;
  }>;
}

export interface AgentLineageStateV1 {
  readonly schemaVersion: 1;
  readonly stateKey: string;
  readonly policyDigest: string;
  readonly revision: number;
  readonly fence: number;
  readonly agents: readonly AgentLineageRecordV1[];
  readonly factoryReceiptDigests: readonly string[];
  readonly terminationReceiptDigests: readonly string[];
  readonly creationSagas?: readonly AgentLineageCreationSagaV1[];
  readonly logicalTimeHighWaterMs: number;
  readonly previousStateDigest: string | null;
  readonly stateDigest: string;
}

export interface AgentLineageStoreV1 {
  load(stateKey: string): Promise<AgentLineageStateV1 | null>;
  save(
    state: AgentLineageStateV1,
    expectedRevision: number | null,
  ): Promise<boolean>;
}

export class InMemoryAgentLineageStoreV1 implements AgentLineageStoreV1 {
  readonly #states = new Map<string, AgentLineageStateV1>();
  async load(stateKey: string): Promise<AgentLineageStateV1 | null> {
    return this.#states.get(stateKey) ?? null;
  }
  async save(
    state: AgentLineageStateV1,
    expectedRevision: number | null,
  ): Promise<boolean> {
    const current = this.#states.get(state.stateKey);
    if (
      (expectedRevision === null &&
        (current !== undefined || state.revision !== 0)) ||
      (expectedRevision !== null &&
        (!current ||
          current.revision !== expectedRevision ||
          state.revision !== expectedRevision + 1))
    )
      return false;
    this.#states.set(state.stateKey, state);
    return true;
  }
}

type GovernedAgentLineageCreateInputV1 = Parameters<
  GovernedAgentLineageRuntimeV1["create"]
>[0];
type GovernedAgentLineageEnrollInputV1 = Parameters<
  GovernedAgentLineageRuntimeV1["enroll"]
>[0];
type GovernedAgentLineageRetireInputV1 = Parameters<
  GovernedAgentLineageRuntimeV1["terminate"]
>[0];

interface GovernedAgentLineageInvokersV1 {
  initialize(
    root: Omit<AgentLineageRecordV1, "lineageDigest">,
  ): Promise<AgentLineageStateV1>;
  create(
    input: GovernedAgentLineageCreateInputV1,
  ): Promise<AgentLineageRecordV1>;
  enroll(
    input: GovernedAgentLineageEnrollInputV1,
  ): Promise<AgentLineageRecordV1>;
  terminate(
    input: GovernedAgentLineageRetireInputV1,
  ): Promise<AgentLineageStateV1>;
  completeRetirement(
    input: GovernedAgentLineageRetireInputV1,
  ): Promise<AgentLineageStateV1>;
  reconcileRetirement(input: {
    readonly operationId: string;
    readonly logicalTimeMs: number;
  }): Promise<AgentLineageStateV1>;
  load(): Promise<AgentLineageStateV1>;
}

const governedAgentLineageInvokersV1 = new WeakMap<
  object,
  GovernedAgentLineageInvokersV1
>();

export class GovernedAgentLineageRuntimeV1 {
  readonly #policy: AgentCreationPolicyV1;
  readonly #stateKey: string;
  readonly #crypto: Crypto | undefined;
  readonly #storeLoad: AgentLineageStoreV1["load"];
  readonly #storeSave: AgentLineageStoreV1["save"];
  readonly #factoryIdentity: Pick<
    GovernedAgentFactoryPortV1,
    "factoryId" | "factoryVersion" | "factoryImplementationDigest"
  >;
  readonly #factoryCreate: GovernedAgentFactoryPortV1["create"];
  readonly #factoryTerminate: GovernedAgentFactoryPortV1["terminate"];
  readonly #verifyCertification: AgentCreationCertificationPortV1["verify"];
  readonly #verifyAuthorityAttenuation: AgentCreationCertificationPortV1["verifyAuthorityAttenuation"];
  readonly #enrollMembership: AgentMembershipEnrollmentPortV1["enroll"];
  readonly #removeMembership: AgentMembershipEnrollmentPortV1["remove"];
  #policyVerification: Promise<AgentCreationPolicyV1> | null = null;

  constructor(options: {
    readonly stateKey: string;
    readonly policy: AgentCreationPolicyV1;
    readonly store?: AgentLineageStoreV1;
    readonly factory: GovernedAgentFactoryPortV1;
    readonly certification: AgentCreationCertificationPortV1;
    readonly enrollment: AgentMembershipEnrollmentPortV1;
    readonly crypto?: Crypto;
  }) {
    if (!options || typeof options !== "object")
      fail("governed agent lineage options are required");
    const stateKey = options.stateKey;
    const policy = options.policy;
    const configuredStore = options.store;
    const factory = options.factory;
    const certification = options.certification;
    const enrollment = options.enrollment;
    const crypto = options.crypto;
    identifier(stateKey, "stateKey");
    this.#stateKey = stateKey;
    if (!policy || typeof policy !== "object")
      fail("agent creation policy is required");
    this.#policy = validateAgentCreationPolicyV1(structuredClone(policy));
    this.#crypto = crypto;
    const store = configuredStore ?? new InMemoryAgentLineageStoreV1();
    const storeLoad = store?.load;
    const storeSave = store?.save;
    const factoryId = factory?.factoryId;
    const factoryVersion = factory?.factoryVersion;
    const factoryImplementationDigest = factory?.factoryImplementationDigest;
    const factoryCreate = factory?.create;
    const factoryTerminate = factory?.terminate;
    const verifyCertification = certification?.verify;
    const verifyAuthorityAttenuation =
      certification?.verifyAuthorityAttenuation;
    const enrollMembership = enrollment?.enroll;
    const removeMembership = enrollment?.remove;
    if (typeof storeLoad !== "function" || typeof storeSave !== "function")
      fail("agent lineage store is required");
    if (
      !factory ||
      typeof factoryCreate !== "function" ||
      typeof factoryTerminate !== "function"
    )
      fail("governed agent factory is required");
    if (
      !certification ||
      typeof verifyCertification !== "function" ||
      typeof verifyAuthorityAttenuation !== "function"
    )
      fail("agent creation certification port is required");
    if (
      !enrollment ||
      typeof enrollMembership !== "function" ||
      typeof removeMembership !== "function"
    )
      fail("agent membership enrollment port is required");
    this.#storeLoad = (stateKey) => storeLoad.call(store, stateKey);
    this.#storeSave = (state, expectedRevision) =>
      storeSave.call(store, state, expectedRevision);
    identifier(factoryId, "factory.factoryId");
    this.#factoryIdentity = Object.freeze({
      factoryId,
      factoryVersion: integer(
        factoryVersion,
        "factory.factoryVersion",
        1,
        Number.MAX_SAFE_INTEGER,
      ),
      factoryImplementationDigest,
    });
    quorumDigest(
      this.#factoryIdentity.factoryImplementationDigest,
      "factory.factoryImplementationDigest",
    );
    this.#factoryCreate = (input) => factoryCreate.call(factory, input);
    this.#factoryTerminate = (input) => factoryTerminate.call(factory, input);
    this.#verifyCertification = (input) =>
      verifyCertification.call(certification, input);
    this.#verifyAuthorityAttenuation = (input) =>
      verifyAuthorityAttenuation.call(certification, input);
    this.#enrollMembership = (input) =>
      enrollMembership.call(enrollment, input);
    this.#removeMembership = (input) =>
      removeMembership.call(enrollment, input);
    const invokers: GovernedAgentLineageInvokersV1 = Object.freeze({
      initialize: (root: Omit<AgentLineageRecordV1, "lineageDigest">) =>
        this.#initialize(root),
      create: (input: GovernedAgentLineageCreateInputV1) => this.#create(input),
      enroll: (input: GovernedAgentLineageEnrollInputV1) => this.#enroll(input),
      terminate: (input: GovernedAgentLineageRetireInputV1) =>
        this.#retire(input, false),
      completeRetirement: (input: GovernedAgentLineageRetireInputV1) =>
        this.#retire(input, true),
      reconcileRetirement: (input: {
        readonly operationId: string;
        readonly logicalTimeMs: number;
      }) => this.#reconcileRetirement(input.operationId, input.logicalTimeMs),
      load: () => this.#load(),
    });
    governedAgentLineageInvokersV1.set(this, invokers);
  }

  get policy(): AgentCreationPolicyV1 {
    return this.#policy;
  }

  async initialize(
    root: Omit<AgentLineageRecordV1, "lineageDigest">,
  ): Promise<AgentLineageStateV1> {
    return invokeGovernedAgentLineageInitializeV1(this, root);
  }

  async #initialize(
    root: Omit<AgentLineageRecordV1, "lineageDigest">,
  ): Promise<AgentLineageStateV1> {
    await this.#verifyPolicy();
    if (
      root.parentAgentId !== null ||
      root.generation !== 0 ||
      root.rootAgentId !== root.agentId ||
      root.status !== "active"
    )
      fail("agent lineage root is invalid");
    const record = await createLineageRecord(root, this.#crypto);
    const state = await createState(
      {
        schemaVersion: 1,
        stateKey: this.#stateKey,
        policyDigest: this.#policy.policyDigest,
        revision: 0,
        fence: 1,
        agents: [record],
        factoryReceiptDigests: [],
        terminationReceiptDigests: [],
        creationSagas: [],
        logicalTimeHighWaterMs: root.createdAtLogicalMs,
        previousStateDigest: null,
      },
      this.#crypto,
    );
    if (!(await this.#storeSave(state, null)))
      fail("agent lineage already initialized");
    return state;
  }

  async create(input: {
    readonly request: AgentCreationRequestV1;
    readonly certificate: AgentCreationCertificateV1;
    readonly logicalTimeMs: number;
    readonly signal?: AbortSignal;
  }): Promise<AgentLineageRecordV1> {
    return invokeGovernedAgentLineageCreateV1(this, input);
  }

  async #create(
    input: GovernedAgentLineageCreateInputV1,
  ): Promise<AgentLineageRecordV1> {
    const request = await validateAgentCreationRequestV1(
      input.request,
      this.#crypto,
    );
    const certificate = await validateAgentCreationCertificateV1(
      input.certificate,
      this.#crypto,
    );
    integer(input.logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
    if (input.signal?.aborted) fail("agent creation aborted");
    const before = await this.#load();
    const replay = before.agents.find(
      (item) =>
        item.agentId === request.requestedAgentId &&
        item.peerId === request.requestedPeerId &&
        item.creationCertificateDigest === certificate.certificateDigest,
    );
    if (replay) return replay;
    const operationId = `creation:${request.requestDigest}`;
    const durableSaga = (before.creationSagas ?? []).find(
      (candidate) => candidate.operationId === operationId,
    );
    if (
      durableSaga &&
      (durableSaga.request.requestDigest !== request.requestDigest ||
        durableSaga.certificate.certificateDigest !==
          certificate.certificateDigest)
    )
      fail("agent creation saga binding changed");
    if (
      !durableSaga &&
      (input.logicalTimeMs >= request.expiresAtLogicalMs ||
        input.logicalTimeMs >= certificate.validUntilLogicalMs)
    )
      fail("agent creation authorization expired");
    if (
      !durableSaga &&
      (certificate.certifiedAtLogicalMs < request.requestedAtLogicalMs ||
        certificate.certifiedAtLogicalMs > input.logicalTimeMs ||
        request.expiresAtLogicalMs - request.requestedAtLogicalMs >
          this.#policy.requestTtlLogicalMs)
    )
      fail("agent creation authorization time binding is invalid");
    const parent = before.agents.find(
      (item) =>
        item.agentId === request.parentAgentId && item.status === "active",
    );
    if (!parent) fail("agent creation parent is unavailable");
    this.#validateRequestAgainstParent(request, parent, before);
    if (
      certificate.requestDigest !== request.requestDigest ||
      certificate.policyDigest !== this.#policy.policyDigest ||
      certificate.parentLineageDigest !== parent.lineageDigest ||
      certificate.roleDefinitionDigest !== request.roleDefinitionDigest ||
      !(await this.#verifyCertification({
        request,
        parent,
        certificate,
        logicalTimeMs: durableSaga?.logicalTimeMs ?? input.logicalTimeMs,
      })) ||
      (this.#policy.requireAuthorityAttenuation &&
        !(await this.#verifyAuthorityAttenuation({
          parentAuthorityDigest: request.parentAuthorityDigest,
          childAuthorityDigest: request.proposedAuthorityDigest,
          attenuationDigest: certificate.authorityAttenuationDigest,
        })))
    )
      fail("agent creation certificate is invalid");
    await this.#reserveCreationSaga({
      operationId,
      request,
      certificate,
      parent,
      logicalTimeMs: input.logicalTimeMs,
    });
    let saga = ((await this.#load()).creationSagas ?? []).find(
      (candidate) => candidate.operationId === operationId,
    );
    if (!saga) fail("agent creation saga is unavailable");
    if (saga.phase === "completed") {
      const completed = (await this.#load()).agents.find(
        (agent) => agent.agentId === request.requestedAgentId,
      );
      if (!completed) fail("completed agent creation saga lacks its lineage");
      return completed;
    }
    if (saga.phase === "cancelled")
      throw new GovernedAgentCreationCancelledErrorV1(
        request.requestDigest,
        saga.cancellationReceiptDigest!,
      );
    if (saga.phase === "prepared") {
      let receipt: AgentFactoryReceiptV1;
      try {
        receipt = await this.#factoryCreate({
          request,
          certificate,
          reservedAtLogicalMs: saga.logicalTimeMs,
          signal: input.signal,
        });
      } catch (error) {
        if (error instanceof GovernedAgentCreationCancelledErrorV1) {
          if (error.requestDigest !== request.requestDigest)
            fail("agent creation cancellation binding changed");
          await this.#recordCreationCancellation(
            operationId,
            error.cancellationReceiptDigest,
            input.logicalTimeMs,
          );
        }
        throw error;
      }
      await validateFactoryReceipt(
        receipt,
        request,
        this.#factoryIdentity,
        this.#crypto,
      );
      await this.#recordCreationEffect(
        operationId,
        receipt,
        input.logicalTimeMs,
      );
      saga = ((await this.#load()).creationSagas ?? []).find(
        (candidate) => candidate.operationId === operationId,
      );
    }
    const receipt = saga?.factoryReceipt;
    if (!saga || saga.phase !== "effect_applied" || !receipt)
      fail("agent creation effect receipt is unavailable");
    const record = await createLineageRecord(
      {
        schemaVersion: 1,
        agentId: request.requestedAgentId,
        peerId: request.requestedPeerId,
        instanceId: request.requestedInstanceId,
        parentAgentId: parent.agentId,
        rootAgentId: parent.rootAgentId,
        generation: parent.generation + 1,
        factoryId: request.factoryId,
        adapterId: request.adapterId,
        adapterVersion: request.adapterVersion,
        capabilityKeys: request.capabilityKeys,
        roleDefinitionDigest: request.roleDefinitionDigest,
        authorityDigest: request.proposedAuthorityDigest,
        parentAuthorityDigest: request.parentAuthorityDigest,
        localRuleProgramDigest: request.localRuleProgramDigest,
        resourceBudgetUnits: request.resourceBudgetUnits,
        interactionBudgetUnits: request.interactionBudgetUnits,
        publicKeyId: receipt.publicKeyId,
        publicKey: receipt.publicKey,
        validFrom: receipt.validFrom,
        validUntil: receipt.validUntil,
        creationCertificateDigest: certificate.certificateDigest,
        membershipConfigurationDigest:
          certificate.membershipConfigurationDigest,
        membershipEpoch: certificate.membershipEpoch,
        status: "pending_enrollment",
        createdAtLogicalMs: saga.logicalTimeMs,
        terminatedAtLogicalMs: null,
        retirementMembershipConfigurationDigest: null,
        retirementMembershipEpoch: null,
      },
      this.#crypto,
    );
    await this.#commit(input.logicalTimeMs, async (current) => {
      const existing = current.agents.find(
        (item) =>
          item.agentId === record.agentId || item.peerId === record.peerId,
      );
      if (existing) {
        if (
          existing.agentId === record.agentId &&
          existing.peerId === record.peerId &&
          existing.creationCertificateDigest ===
            record.creationCertificateDigest
        )
          return current;
        fail("agent lineage identity already exists");
      }
      const retainedSaga = (current.creationSagas ?? []).find(
        (candidate) => candidate.operationId === operationId,
      );
      if (
        !retainedSaga ||
        retainedSaga.phase !== "effect_applied" ||
        retainedSaga.factoryReceipt?.receiptDigest !== receipt.receiptDigest
      )
        fail("agent creation saga changed before finalization");
      const currentParent = current.agents.find(
        (item) => item.agentId === parent.agentId && item.status === "active",
      );
      if (
        !currentParent ||
        currentParent.lineageDigest !== parent.lineageDigest
      )
        fail("agent creation parent changed");
      this.#validateRequestAgainstParent(request, currentParent, current);
      return createState(
        {
          ...current,
          revision: current.revision + 1,
          agents: [...current.agents, record],
          factoryReceiptDigests: [
            ...current.factoryReceiptDigests,
            receipt.receiptDigest,
          ],
          creationSagas: (current.creationSagas ?? []).map((candidate) =>
            candidate.operationId === operationId
              ? { ...candidate, phase: "completed" as const }
              : candidate,
          ),
          logicalTimeHighWaterMs: input.logicalTimeMs,
          previousStateDigest: current.stateDigest,
        },
        this.#crypto,
      );
    });
    return record;
  }

  async #reserveCreationSaga(input: {
    readonly operationId: string;
    readonly request: AgentCreationRequestV1;
    readonly certificate: AgentCreationCertificateV1;
    readonly parent: AgentLineageRecordV1;
    readonly logicalTimeMs: number;
  }): Promise<void> {
    await this.#commit(input.logicalTimeMs, async (current) => {
      const existing = (current.creationSagas ?? []).find(
        (candidate) => candidate.operationId === input.operationId,
      );
      if (existing) {
        if (
          existing.request.requestDigest !== input.request.requestDigest ||
          existing.certificate.certificateDigest !==
            input.certificate.certificateDigest ||
          existing.parentLineageDigest !== input.parent.lineageDigest
        )
          fail("agent creation saga binding changed");
        return current;
      }
      const retainedParent = current.agents.find(
        (agent) => agent.agentId === input.parent.agentId,
      );
      if (
        !retainedParent ||
        retainedParent.status !== "active" ||
        retainedParent.lineageDigest !== input.parent.lineageDigest
      )
        fail("agent creation parent changed before reservation");
      const saga: AgentLineageCreationSagaV1 = freeze({
        operationId: input.operationId,
        phase: "prepared",
        request: input.request,
        certificate: input.certificate,
        parentLineageDigest: input.parent.lineageDigest,
        logicalTimeMs: input.logicalTimeMs,
        factoryReceipt: null,
        cancellationReceiptDigest: null,
      });
      return createState(
        {
          ...current,
          revision: current.revision + 1,
          creationSagas: [...(current.creationSagas ?? []), saga],
          logicalTimeHighWaterMs: input.logicalTimeMs,
          previousStateDigest: current.stateDigest,
        },
        this.#crypto,
      );
    });
  }

  async #recordCreationEffect(
    operationId: string,
    receipt: AgentFactoryReceiptV1,
    logicalTimeMs: number,
  ): Promise<void> {
    await this.#commit(logicalTimeMs, async (current) => {
      const saga = (current.creationSagas ?? []).find(
        (candidate) => candidate.operationId === operationId,
      );
      if (!saga) fail("agent creation saga is unavailable");
      if (saga.phase === "completed") return current;
      if (saga.phase === "effect_applied") {
        if (saga.factoryReceipt?.receiptDigest !== receipt.receiptDigest)
          fail("agent creation effect equivocated");
        return current;
      }
      return createState(
        {
          ...current,
          revision: current.revision + 1,
          creationSagas: (current.creationSagas ?? []).map((candidate) =>
            candidate.operationId === operationId
              ? {
                  ...candidate,
                  phase: "effect_applied" as const,
                  factoryReceipt: receipt,
                }
              : candidate,
          ),
          logicalTimeHighWaterMs: logicalTimeMs,
          previousStateDigest: current.stateDigest,
        },
        this.#crypto,
      );
    });
  }

  async #recordCreationCancellation(
    operationId: string,
    cancellationReceiptDigest: string,
    logicalTimeMs: number,
  ): Promise<void> {
    quorumDigest(
      cancellationReceiptDigest,
      "creationCancellationReceiptDigest",
    );
    await this.#commit(logicalTimeMs, async (current) => {
      const saga = (current.creationSagas ?? []).find(
        (candidate) => candidate.operationId === operationId,
      );
      if (!saga) fail("agent creation saga is unavailable");
      if (saga.phase === "cancelled") {
        if (saga.cancellationReceiptDigest !== cancellationReceiptDigest)
          fail("agent creation cancellation equivocated");
        return current;
      }
      if (saga.phase !== "prepared")
        fail("materialized agent creation cannot be cancelled");
      return createState(
        {
          ...current,
          revision: current.revision + 1,
          creationSagas: (current.creationSagas ?? []).map((candidate) =>
            candidate.operationId === operationId
              ? {
                  ...candidate,
                  phase: "cancelled" as const,
                  cancellationReceiptDigest,
                }
              : candidate,
          ),
          logicalTimeHighWaterMs: logicalTimeMs,
          previousStateDigest: current.stateDigest,
        },
        this.#crypto,
      );
    });
  }

  async enroll(input: {
    readonly agentId: string;
    readonly activeKeyProof: CollectiveMembershipKeyProofV1;
    readonly logicalTimeMs: number;
  }): Promise<AgentLineageRecordV1> {
    return invokeGovernedAgentLineageEnrollV1(this, input);
  }

  async #enroll(
    input: GovernedAgentLineageEnrollInputV1,
  ): Promise<AgentLineageRecordV1> {
    identifier(input.agentId, "agentId");
    integer(input.logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
    let state = await this.#load();
    const active = state.agents.find(
      (item) => item.agentId === input.agentId && item.status === "active",
    );
    if (active) return active;
    let agent = state.agents.find(
      (item) =>
        item.agentId === input.agentId && item.status === "pending_enrollment",
    );
    if (!agent) fail("agent pending enrollment is unavailable");
    if (agent.enrollmentPhase === null || agent.enrollmentPhase === undefined) {
      await this.#commit(input.logicalTimeMs, async (current) => {
        const retained = current.agents.find(
          (item) => item.agentId === input.agentId,
        );
        if (!retained || retained.status !== "pending_enrollment")
          fail("agent pending enrollment changed before reservation");
        if (retained.enrollmentPhase !== null) return current;
        const prepared = await createLineageRecord(
          {
            ...retained,
            enrollmentPhase: "prepared",
          },
          this.#crypto,
        );
        return createState(
          {
            ...current,
            revision: current.revision + 1,
            fence: current.fence + 1,
            agents: current.agents.map((item) =>
              item.agentId === retained.agentId ? prepared : item,
            ),
            logicalTimeHighWaterMs: input.logicalTimeMs,
            previousStateDigest: current.stateDigest,
          },
          this.#crypto,
        );
      });
      state = await this.#load();
      agent = state.agents.find(
        (item) =>
          item.agentId === input.agentId &&
          item.status === "pending_enrollment",
      );
      if (!agent) fail("agent enrollment reservation is unavailable");
    }
    const projection = projectAgentLineageToMembershipJoinV1(
      agent,
      input.activeKeyProof,
    );
    if (agent.enrollmentPhase === "prepared") {
      const enrollment = await this.#enrollMembership({
        agent,
        member: projection.member,
        change: projection.change,
        logicalTimeMs: input.logicalTimeMs,
      });
      if (!enrollment.enrolled) fail("agent membership enrollment was denied");
      quorumDigest(
        enrollment.authorizationConfigurationDigest,
        "authorizationConfigurationDigest",
      );
      integer(
        enrollment.authorizationEpoch,
        "authorizationEpoch",
        1,
        Number.MAX_SAFE_INTEGER,
      );
      quorumDigest(
        enrollment.membershipConfigurationDigest,
        "membershipConfigurationDigest",
      );
      integer(
        enrollment.membershipEpoch,
        "membershipEpoch",
        1,
        Number.MAX_SAFE_INTEGER,
      );
      if (
        enrollment.authorizationConfigurationDigest !==
          agent.membershipConfigurationDigest ||
        enrollment.authorizationEpoch !== agent.membershipEpoch ||
        enrollment.membershipEpoch !== enrollment.authorizationEpoch + 1 ||
        enrollment.membershipConfigurationDigest ===
          enrollment.authorizationConfigurationDigest
      )
        fail(
          "agent membership enrollment is not descended from its creation authorization",
        );
      await this.#commit(input.logicalTimeMs, async (current) => {
        const retained = current.agents.find(
          (item) => item.agentId === agent!.agentId,
        );
        if (!retained || retained.status !== "pending_enrollment")
          fail("agent enrollment lineage changed");
        if (retained.enrollmentPhase === "applied") return current;
        if (retained.enrollmentPhase !== "prepared")
          fail("agent enrollment reservation changed");
        const applied = await createLineageRecord(
          {
            ...retained,
            enrollmentPhase: "applied",
            enrollmentAuthorizationConfigurationDigest:
              enrollment.membershipConfigurationDigest,
            enrollmentAuthorizationEpoch: enrollment.membershipEpoch,
          },
          this.#crypto,
        );
        return createState(
          {
            ...current,
            revision: current.revision + 1,
            agents: current.agents.map((item) =>
              item.agentId === retained.agentId ? applied : item,
            ),
            logicalTimeHighWaterMs: input.logicalTimeMs,
            previousStateDigest: current.stateDigest,
          },
          this.#crypto,
        );
      });
      state = await this.#load();
      agent = state.agents.find(
        (item) =>
          item.agentId === input.agentId &&
          item.status === "pending_enrollment",
      );
      if (!agent) fail("agent enrollment effect journal is unavailable");
    }
    if (
      agent.enrollmentPhase !== "applied" ||
      agent.enrollmentAuthorizationConfigurationDigest === null ||
      agent.enrollmentAuthorizationConfigurationDigest === undefined ||
      agent.enrollmentAuthorizationEpoch === null ||
      agent.enrollmentAuthorizationEpoch === undefined
    )
      fail("agent enrollment effect receipt is incomplete");
    const appliedAgent = agent;
    let activated: AgentLineageRecordV1 | null = null;
    await this.#commit(input.logicalTimeMs, async (current) => {
      const retained = current.agents.find(
        (item) => item.agentId === appliedAgent.agentId,
      );
      if (
        !retained ||
        retained.status !== "pending_enrollment" ||
        retained.lineageDigest !== appliedAgent.lineageDigest
      )
        fail("agent enrollment lineage changed");
      activated = await createLineageRecord(
        {
          ...retained,
          membershipConfigurationDigest:
            retained.enrollmentAuthorizationConfigurationDigest as string,
          membershipEpoch: retained.enrollmentAuthorizationEpoch as number,
          enrollmentPhase: null,
          enrollmentAuthorizationConfigurationDigest: null,
          enrollmentAuthorizationEpoch: null,
          status: "active",
        },
        this.#crypto,
      );
      return createState(
        {
          ...current,
          revision: current.revision + 1,
          fence: current.fence + 1,
          agents: current.agents.map((item) =>
            item.agentId === appliedAgent.agentId ? activated! : item,
          ),
          logicalTimeHighWaterMs: input.logicalTimeMs,
          previousStateDigest: current.stateDigest,
        },
        this.#crypto,
      );
    });
    return activated!;
  }

  async terminate(input: {
    readonly agentId: string;
    readonly reasonCode: string;
    readonly cascade: boolean;
    readonly logicalTimeMs: number;
  }): Promise<AgentLineageStateV1> {
    return invokeGovernedAgentLineageTerminateV1(this, input);
  }

  /**
   * Completes certified membership exclusion for material that governance has
   * already disabled. This path deliberately does not invoke factory cleanup.
   */
  async completeRetirement(input: {
    readonly agentId: string;
    readonly reasonCode: string;
    readonly cascade: boolean;
    readonly logicalTimeMs: number;
  }): Promise<AgentLineageStateV1> {
    return invokeGovernedAgentLineageCompleteRetirementV1(this, input);
  }

  /** Resumes a durably reserved retirement without repeating recorded effects. */
  async reconcileRetirement(input: {
    readonly operationId: string;
    readonly logicalTimeMs: number;
  }): Promise<AgentLineageStateV1> {
    return lineageInvokers(this).reconcileRetirement(input);
  }

  async #retire(
    input: {
      readonly agentId: string;
      readonly reasonCode: string;
      readonly cascade: boolean;
      readonly logicalTimeMs: number;
    },
    governanceDisabledOnly: boolean,
  ): Promise<AgentLineageStateV1> {
    identifier(input.agentId, "agentId");
    token(input.reasonCode, "reasonCode");
    if (typeof input.cascade !== "boolean")
      fail("agent termination cascade flag invalid");
    integer(input.logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
    const before = await this.#load();
    const target = before.agents.find((item) => item.agentId === input.agentId);
    if (!target || target.parentAgentId === null)
      fail("agent termination target is unavailable or is the root");
    if (target.status === "terminated") return before;
    if (target.status === "retiring")
      fail(
        "agent retirement is already in progress and requires reconciliation",
      );
    if (
      governanceDisabledOnly &&
      target.status !== "suspended" &&
      target.status !== "revoked"
    )
      fail("membership-only retirement requires a suspended or revoked agent");
    const descendants = descendantIds(before.agents, target.agentId).filter(
      (agentId) => {
        const descendant = before.agents.find(
          (item) => item.agentId === agentId,
        );
        return descendant !== undefined && descendant.status !== "terminated";
      },
    );
    if (!input.cascade && descendants.length > 0)
      fail("agent has active descendants");
    const targets = [target.agentId, ...descendants];
    const observedTargets = before.agents.filter((item) =>
      targets.includes(item.agentId),
    );
    const reservation = await this.#reserveRetirement({
      targetAgentId: target.agentId,
      observedTargets,
      reasonCode: input.reasonCode,
      governanceDisabledOnly,
      logicalTimeMs: input.logicalTimeMs,
    });
    if (!reservation.acquired) return reservation.state;
    return this.#reconcileRetirement(
      reservation.operationId,
      input.logicalTimeMs,
    );
  }

  async #reserveRetirement(input: {
    readonly targetAgentId: string;
    readonly observedTargets: readonly AgentLineageRecordV1[];
    readonly reasonCode: string;
    readonly governanceDisabledOnly: boolean;
    readonly logicalTimeMs: number;
  }): Promise<{
    readonly acquired: boolean;
    readonly state: AgentLineageStateV1;
    readonly operationId: string;
    readonly lineageDigests: ReadonlyMap<string, string>;
  }> {
    const operationId = `retirement:${input.targetAgentId}:${input.logicalTimeMs}`;
    const observedById = new Map(
      input.observedTargets.map((agent) => [agent.agentId, agent]),
    );
    for (
      let attempt = 0;
      attempt < this.#policy.maximumCommitAttempts;
      attempt += 1
    ) {
      const current = await this.#load();
      const currentTarget = current.agents.find(
        (agent) => agent.agentId === input.targetAgentId,
      );
      if (currentTarget?.status === "terminated") {
        return {
          acquired: false,
          state: current,
          operationId,
          lineageDigests: new Map(),
        };
      }
      if (currentTarget?.status === "retiring") {
        if (!currentTarget.retirementOperationId)
          fail("agent retirement reservation lacks its operation");
        return {
          acquired: true,
          state: current,
          operationId: currentTarget.retirementOperationId,
          lineageDigests: new Map(),
        };
      }
      if (input.logicalTimeMs < current.logicalTimeHighWaterMs)
        fail("agent lineage logical time rollback");
      if (
        current.agents.some(
          (agent) =>
            agent.status !== "terminated" &&
            !observedById.has(agent.agentId) &&
            agent.parentAgentId !== null &&
            observedById.has(agent.parentAgentId),
        )
      )
        fail("agent retirement descendant set changed before reservation");
      const blockingCreation = (current.creationSagas ?? []).find(
        (saga) =>
          (saga.phase === "prepared" || saga.phase === "effect_applied") &&
          observedById.has(saga.request.parentAgentId),
      );
      if (blockingCreation)
        fail(
          "agent retirement is blocked by an incomplete child creation saga",
        );
      for (const [agentId, observed] of observedById) {
        const retained = current.agents.find(
          (agent) => agent.agentId === agentId,
        );
        if (
          !retained ||
          retained.status === "terminated" ||
          retained.status === "retiring" ||
          retained.status !== observed.status ||
          retained.lineageDigest !== observed.lineageDigest
        )
          fail("agent retirement lineage changed before reservation");
      }
      const reservedRecords = new Map<string, AgentLineageRecordV1>();
      const next = await createState(
        {
          ...current,
          revision: current.revision + 1,
          fence: current.fence + 1,
          agents: await Promise.all(
            current.agents.map(async (agent) => {
              if (!observedById.has(agent.agentId)) return agent;
              const reserved = await createLineageRecord(
                {
                  ...agent,
                  status: "retiring",
                  retirementOperationId: operationId,
                  retirementStartedAtLogicalMs: input.logicalTimeMs,
                  retirementReasonCode: input.reasonCode,
                  retirementSourceStatus: agent.status as
                    "pending_enrollment" | "active" | "suspended" | "revoked",
                  retirementSourceLineageDigest: agent.lineageDigest,
                  retirementRequiresMembershipRemoval:
                    agent.status === "active" ||
                    agent.status === "suspended" ||
                    agent.status === "revoked",
                  retirementRequiresFactoryTermination:
                    agent.status !== "revoked" &&
                    !(
                      input.governanceDisabledOnly &&
                      agent.agentId === input.targetAgentId
                    ),
                },
                this.#crypto,
              );
              reservedRecords.set(agent.agentId, reserved);
              return reserved;
            }),
          ),
          logicalTimeHighWaterMs: input.logicalTimeMs,
          previousStateDigest: current.stateDigest,
        },
        this.#crypto,
      );
      if (await this.#storeSave(next, current.revision)) {
        return {
          acquired: true,
          state: next,
          operationId,
          lineageDigests: new Map(
            [...reservedRecords].map(([agentId, agent]) => [
              agentId,
              agent.lineageDigest,
            ]),
          ),
        };
      }
    }
    fail("agent lineage retirement reservation attempts exhausted");
  }

  async #reconcileRetirement(
    operationId: string,
    logicalTimeMs: number,
  ): Promise<AgentLineageStateV1> {
    identifier(operationId, "retirementOperationId");
    integer(logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
    for (;;) {
      const state = await this.#load();
      const targets = state.agents.filter(
        (agent) =>
          agent.status === "retiring" &&
          agent.retirementOperationId === operationId,
      );
      if (targets.length === 0) {
        const completed = state.agents.some(
          (agent) =>
            agent.status === "terminated" &&
            agent.retirementOperationId === operationId,
        );
        if (completed) return state;
        fail("agent retirement operation is unavailable");
      }
      const pendingRemoval = targets.find(
        (agent) =>
          agent.retirementRequiresMembershipRemoval === true &&
          (agent.retirementMembershipConfigurationDigest === null ||
            agent.retirementMembershipConfigurationDigest === undefined),
      );
      if (pendingRemoval) {
        const source = this.#retirementSource(pendingRemoval);
        const removed = await this.#removeMembership({
          agent: source,
          logicalTimeMs: pendingRemoval.retirementStartedAtLogicalMs!,
        });
        if (!removed.removed) fail("agent membership removal was denied");
        quorumDigest(
          removed.membershipConfigurationDigest,
          "retirementMembershipConfigurationDigest",
        );
        integer(
          removed.membershipEpoch,
          "retirementMembershipEpoch",
          1,
          Number.MAX_SAFE_INTEGER,
        );
        await this.#updateRetirementRecord(
          operationId,
          pendingRemoval.agentId,
          logicalTimeMs,
          {
            retirementMembershipConfigurationDigest:
              removed.membershipConfigurationDigest,
            retirementMembershipEpoch: removed.membershipEpoch,
          },
        );
        continue;
      }
      const pendingTermination = targets.find(
        (agent) =>
          agent.retirementRequiresFactoryTermination === true &&
          (agent.retirementTerminationReceiptDigest === null ||
            agent.retirementTerminationReceiptDigest === undefined),
      );
      if (pendingTermination) {
        const source = this.#retirementSource(pendingTermination);
        const terminated = await this.#factoryTerminate({
          operationId,
          agent: source,
          reasonCode: pendingTermination.retirementReasonCode!,
          logicalTimeMs: pendingTermination.retirementStartedAtLogicalMs!,
        });
        if (!terminated.terminated)
          fail("agent factory termination was denied");
        quorumDigest(terminated.receiptDigest, "terminationReceiptDigest");
        await this.#updateRetirementRecord(
          operationId,
          pendingTermination.agentId,
          logicalTimeMs,
          { retirementTerminationReceiptDigest: terminated.receiptDigest },
        );
        continue;
      }
      return this.#finalizeRetirementOperation(operationId, logicalTimeMs);
    }
  }

  #retirementSource(agent: AgentLineageRecordV1): AgentLineageRecordV1 {
    if (
      agent.status !== "retiring" ||
      !agent.retirementSourceStatus ||
      !agent.retirementSourceLineageDigest
    )
      fail("agent retirement source binding is incomplete");
    return freeze({
      ...agent,
      status: agent.retirementSourceStatus,
      lineageDigest: agent.retirementSourceLineageDigest,
      retirementOperationId: null,
      retirementStartedAtLogicalMs: null,
      retirementReasonCode: null,
      retirementSourceStatus: null,
      retirementSourceLineageDigest: null,
      retirementRequiresMembershipRemoval: false,
      retirementRequiresFactoryTermination: false,
      retirementTerminationReceiptDigest: null,
      retirementMembershipConfigurationDigest: null,
      retirementMembershipEpoch: null,
    });
  }

  async #updateRetirementRecord(
    operationId: string,
    agentId: string,
    logicalTimeMs: number,
    patch: Partial<AgentLineageRecordV1>,
  ): Promise<void> {
    await this.#commit(logicalTimeMs, async (current) => {
      const retained = current.agents.find(
        (agent) => agent.agentId === agentId,
      );
      if (
        !retained ||
        retained.status !== "retiring" ||
        retained.retirementOperationId !== operationId
      )
        fail("agent retirement reservation changed");
      const nextRecord = await createLineageRecord(
        {
          ...retained,
          ...patch,
        },
        this.#crypto,
      );
      if (nextRecord.lineageDigest === retained.lineageDigest) return current;
      return createState(
        {
          ...current,
          revision: current.revision + 1,
          fence: current.fence + 1,
          agents: current.agents.map((agent) =>
            agent.agentId === agentId ? nextRecord : agent,
          ),
          logicalTimeHighWaterMs: Math.max(
            current.logicalTimeHighWaterMs,
            logicalTimeMs,
          ),
          previousStateDigest: current.stateDigest,
        },
        this.#crypto,
      );
    });
  }

  async #finalizeRetirementOperation(
    operationId: string,
    logicalTimeMs: number,
  ): Promise<AgentLineageStateV1> {
    return this.#commit(logicalTimeMs, async (current) => {
      const targets = current.agents.filter(
        (agent) =>
          agent.status === "retiring" &&
          agent.retirementOperationId === operationId,
      );
      if (targets.length === 0) return current;
      for (const agent of targets) {
        if (
          (agent.retirementRequiresMembershipRemoval &&
            !agent.retirementMembershipConfigurationDigest) ||
          (agent.retirementRequiresFactoryTermination &&
            !agent.retirementTerminationReceiptDigest)
        )
          fail("agent retirement effects are incomplete");
      }
      const receipts = targets.flatMap((agent) =>
        agent.retirementTerminationReceiptDigest
          ? [agent.retirementTerminationReceiptDigest]
          : [],
      );
      const targetIds = new Set(targets.map((agent) => agent.agentId));
      const agents = await Promise.all(
        current.agents.map((agent) =>
          targetIds.has(agent.agentId)
            ? createLineageRecord(
                {
                  ...agent,
                  status: "terminated",
                  terminatedAtLogicalMs: logicalTimeMs,
                  retirementSourceStatus: null,
                  retirementSourceLineageDigest: null,
                  retirementRequiresMembershipRemoval: false,
                  retirementRequiresFactoryTermination: false,
                },
                this.#crypto,
              )
            : agent,
        ),
      );
      return createState(
        {
          ...current,
          revision: current.revision + 1,
          fence: current.fence + 1,
          agents,
          terminationReceiptDigests: [
            ...new Set([...current.terminationReceiptDigests, ...receipts]),
          ],
          logicalTimeHighWaterMs: Math.max(
            current.logicalTimeHighWaterMs,
            logicalTimeMs,
          ),
          previousStateDigest: current.stateDigest,
        },
        this.#crypto,
      );
    });
  }

  async #commitReservedRetirement(input: {
    readonly targets: readonly string[];
    readonly reservedLineageDigests: ReadonlyMap<string, string>;
    readonly removals: ReadonlyMap<
      string,
      {
        readonly membershipConfigurationDigest: string;
        readonly membershipEpoch: number;
      }
    >;
    readonly receipts: readonly string[];
    readonly logicalTimeMs: number;
  }): Promise<AgentLineageStateV1> {
    for (
      let attempt = 0;
      attempt < this.#policy.maximumCommitAttempts;
      attempt += 1
    ) {
      const current = await this.#load();
      const currentTarget = current.agents.find(
        (agent) => agent.agentId === input.targets[0],
      );
      if (currentTarget?.status === "terminated") return current;
      const next = await createState(
        {
          ...current,
          revision: current.revision + 1,
          fence: current.fence + 1,
          agents: await Promise.all(
            current.agents.map((agent) =>
              input.targets.includes(agent.agentId)
                ? this.#finalizeReservedRetirement({
                    agent,
                    reservedLineageDigest: input.reservedLineageDigests.get(
                      agent.agentId,
                    ),
                    removal: input.removals.get(agent.agentId),
                    logicalTimeMs: input.logicalTimeMs,
                  })
                : agent,
            ),
          ),
          terminationReceiptDigests: [
            ...current.terminationReceiptDigests,
            ...input.receipts,
          ],
          logicalTimeHighWaterMs: Math.max(
            current.logicalTimeHighWaterMs,
            input.logicalTimeMs,
          ),
          previousStateDigest: current.stateDigest,
        },
        this.#crypto,
      );
      if (await this.#storeSave(next, current.revision)) return next;
    }
    fail("agent lineage retirement finalization attempts exhausted");
  }

  async #finalizeReservedRetirement(input: {
    readonly agent: AgentLineageRecordV1;
    readonly reservedLineageDigest: string | undefined;
    readonly removal:
      | {
          readonly membershipConfigurationDigest: string;
          readonly membershipEpoch: number;
        }
      | undefined;
    readonly logicalTimeMs: number;
  }): Promise<AgentLineageRecordV1> {
    if (
      input.agent.status !== "retiring" ||
      input.reservedLineageDigest === undefined ||
      input.agent.lineageDigest !== input.reservedLineageDigest
    )
      fail("agent retirement reservation changed before finalization");
    return createLineageRecord(
      {
        ...input.agent,
        status: "terminated",
        terminatedAtLogicalMs: input.logicalTimeMs,
        retirementMembershipConfigurationDigest:
          input.removal?.membershipConfigurationDigest ?? null,
        retirementMembershipEpoch: input.removal?.membershipEpoch ?? null,
      },
      this.#crypto,
    );
  }

  async load(): Promise<AgentLineageStateV1> {
    return invokeGovernedAgentLineageLoadV1(this);
  }

  async #load(): Promise<AgentLineageStateV1> {
    await this.#verifyPolicy();
    const state = await this.#storeLoad(this.#stateKey);
    if (!state) fail("agent lineage is not initialized");
    const validated = await validateAgentLineageStateV1(state, this.#crypto);
    if (
      validated.stateKey !== this.#stateKey ||
      validated.policyDigest !== this.#policy.policyDigest
    )
      fail("agent lineage binding changed");
    return validated;
  }

  #verifyPolicy(): Promise<AgentCreationPolicyV1> {
    this.#policyVerification ??= verifyAgentCreationPolicyV1(
      this.#policy,
      this.#crypto,
    );
    return this.#policyVerification;
  }

  #validateRequestAgainstParent(
    request: AgentCreationRequestV1,
    parent: AgentLineageRecordV1,
    state: AgentLineageStateV1,
  ): void {
    if (
      request.parentAuthorityDigest !== parent.authorityDigest ||
      (request.localRuleProgramDigest !== parent.localRuleProgramDigest &&
        this.#policy.requireRulePolicyInheritance) ||
      request.factoryId !== this.#factoryIdentity.factoryId ||
      !this.#policy.allowedAdapterIds.includes(request.adapterId) ||
      request.capabilityKeys.some(
        (item) =>
          !this.#policy.permittedCapabilityKeys.includes(item) ||
          !parent.capabilityKeys.includes(item),
      ) ||
      request.resourceBudgetUnits > this.#policy.maximumResourceUnitsPerChild ||
      request.resourceBudgetUnits > parent.resourceBudgetUnits ||
      request.interactionBudgetUnits >
        this.#policy.maximumInteractionUnitsPerChild ||
      request.interactionBudgetUnits > parent.interactionBudgetUnits ||
      parent.generation + 1 > this.#policy.maximumGeneration
    )
      fail("agent creation request exceeds inherited authority or budget");
    const children = state.agents.filter(
      (item) =>
        item.parentAgentId === parent.agentId &&
        !["terminated", "revoked"].includes(item.status),
    );
    if (children.length >= this.#policy.maximumChildrenPerAgent)
      fail("agent child limit exceeded");
    const reservedResourceUnits = children.reduce(
      (sum, item) => sum + item.resourceBudgetUnits,
      0,
    );
    const reservedInteractionUnits = children.reduce(
      (sum, item) => sum + item.interactionBudgetUnits,
      0,
    );
    if (
      !Number.isSafeInteger(
        reservedResourceUnits + request.resourceBudgetUnits,
      ) ||
      !Number.isSafeInteger(
        reservedInteractionUnits + request.interactionBudgetUnits,
      ) ||
      reservedResourceUnits + request.resourceBudgetUnits >
        parent.resourceBudgetUnits ||
      reservedInteractionUnits + request.interactionBudgetUnits >
        parent.interactionBudgetUnits
    )
      fail("agent child aggregate budget exceeds parent budget");
    const descendantSet = new Set(descendantIds(state.agents, parent.agentId));
    const activeDescendants = state.agents.filter(
      (item) =>
        descendantSet.has(item.agentId) &&
        !["terminated", "revoked"].includes(item.status),
    );
    if (activeDescendants.length >= this.#policy.maximumActiveDescendants)
      fail("agent descendant limit exceeded");
  }

  async #commit(
    logicalTimeMs: number,
    mutate: (state: AgentLineageStateV1) => Promise<AgentLineageStateV1>,
  ): Promise<AgentLineageStateV1> {
    for (
      let attempt = 0;
      attempt < this.#policy.maximumCommitAttempts;
      attempt += 1
    ) {
      const current = await this.#load();
      if (logicalTimeMs < current.logicalTimeHighWaterMs)
        fail("agent lineage logical time rollback");
      const next = await mutate(current);
      if (next === current) return current;
      if (await this.#storeSave(next, current.revision)) return next;
    }
    fail("agent lineage commit attempts exhausted");
  }
}

/** Nominal check for the library-owned durable lineage state machine. */
export function isGovernedAgentLineageRuntimeV1(
  value: unknown,
): value is GovernedAgentLineageRuntimeV1 {
  return Boolean(
    value &&
    typeof value === "object" &&
    governedAgentLineageInvokersV1.has(value),
  );
}

export function invokeGovernedAgentLineageInitializeV1(
  runtime: GovernedAgentLineageRuntimeV1,
  root: Parameters<GovernedAgentLineageRuntimeV1["initialize"]>[0],
): ReturnType<GovernedAgentLineageRuntimeV1["initialize"]> {
  return lineageInvokers(runtime).initialize(root);
}

export function invokeGovernedAgentLineageCreateV1(
  runtime: GovernedAgentLineageRuntimeV1,
  input: Parameters<GovernedAgentLineageRuntimeV1["create"]>[0],
): ReturnType<GovernedAgentLineageRuntimeV1["create"]> {
  return lineageInvokers(runtime).create(input);
}

export function invokeGovernedAgentLineageEnrollV1(
  runtime: GovernedAgentLineageRuntimeV1,
  input: Parameters<GovernedAgentLineageRuntimeV1["enroll"]>[0],
): ReturnType<GovernedAgentLineageRuntimeV1["enroll"]> {
  return lineageInvokers(runtime).enroll(input);
}

export function invokeGovernedAgentLineageTerminateV1(
  runtime: GovernedAgentLineageRuntimeV1,
  input: Parameters<GovernedAgentLineageRuntimeV1["terminate"]>[0],
): ReturnType<GovernedAgentLineageRuntimeV1["terminate"]> {
  return lineageInvokers(runtime).terminate(input);
}

export function invokeGovernedAgentLineageCompleteRetirementV1(
  runtime: GovernedAgentLineageRuntimeV1,
  input: Parameters<GovernedAgentLineageRuntimeV1["completeRetirement"]>[0],
): ReturnType<GovernedAgentLineageRuntimeV1["completeRetirement"]> {
  return lineageInvokers(runtime).completeRetirement(input);
}

export function invokeGovernedAgentLineageReconcileRetirementV1(
  runtime: GovernedAgentLineageRuntimeV1,
  input: Parameters<GovernedAgentLineageRuntimeV1["reconcileRetirement"]>[0],
): ReturnType<GovernedAgentLineageRuntimeV1["reconcileRetirement"]> {
  return lineageInvokers(runtime).reconcileRetirement(input);
}

export function invokeGovernedAgentLineageLoadV1(
  runtime: GovernedAgentLineageRuntimeV1,
): ReturnType<GovernedAgentLineageRuntimeV1["load"]> {
  return lineageInvokers(runtime).load();
}

function lineageInvokers(
  runtime: GovernedAgentLineageRuntimeV1,
): GovernedAgentLineageInvokersV1 {
  const invokers =
    runtime && typeof runtime === "object"
      ? governedAgentLineageInvokersV1.get(runtime)
      : undefined;
  if (!invokers) fail("concrete governed agent lineage runtime is required");
  return invokers;
}

export async function createAgentCreationPolicyV1(
  input: Omit<AgentCreationPolicyV1, "policyDigest">,
  crypto?: Crypto,
): Promise<AgentCreationPolicyV1> {
  validatePolicyBody(input);
  const body = freeze(input);
  return freeze({
    ...body,
    policyDigest: await collectiveMembershipDigestV1(
      { domain: "agent-creation-policy-v1", body },
      crypto,
    ),
  });
}

export function validateAgentCreationPolicyV1(
  input: AgentCreationPolicyV1,
): AgentCreationPolicyV1 {
  validatePolicyBody(input);
  quorumDigest(input.policyDigest, "policyDigest");
  return freeze(input);
}

export async function verifyAgentCreationPolicyV1(
  input: AgentCreationPolicyV1,
  crypto?: Crypto,
): Promise<AgentCreationPolicyV1> {
  const { policyDigest, ...body } = input;
  const rebuilt = await createAgentCreationPolicyV1(body, crypto);
  if (rebuilt.policyDigest !== policyDigest)
    fail("agent creation policy digest invalid");
  return rebuilt;
}

export async function createAgentCreationRequestV1(
  input: Omit<AgentCreationRequestV1, "schemaVersion" | "requestDigest">,
  crypto?: Crypto,
): Promise<AgentCreationRequestV1> {
  const body = { schemaVersion: 1 as const, ...input };
  validateRequestBody(body);
  return freeze({
    ...body,
    requestDigest: await collectiveMembershipDigestV1(
      { domain: "agent-creation-request-v1", body },
      crypto,
    ),
  });
}

export async function validateAgentCreationRequestV1(
  input: AgentCreationRequestV1,
  crypto?: Crypto,
): Promise<AgentCreationRequestV1> {
  const { requestDigest, ...body } = input;
  const rebuilt = await createAgentCreationRequestV1(body, crypto);
  if (rebuilt.requestDigest !== requestDigest)
    fail("agent creation request digest invalid");
  return rebuilt;
}

export async function createAgentCreationCertificateV1(
  input: Omit<
    AgentCreationCertificateV1,
    "schemaVersion" | "certificateDigest"
  >,
  crypto?: Crypto,
): Promise<AgentCreationCertificateV1> {
  const body = { schemaVersion: 1 as const, ...input };
  validateCertificateBody(body);
  return freeze({
    ...body,
    certificateDigest: await collectiveMembershipDigestV1(
      { domain: "agent-creation-certificate-v1", body },
      crypto,
    ),
  });
}

export async function validateAgentCreationCertificateV1(
  input: AgentCreationCertificateV1,
  crypto?: Crypto,
): Promise<AgentCreationCertificateV1> {
  const { certificateDigest, ...body } = input;
  const rebuilt = await createAgentCreationCertificateV1(body, crypto);
  if (rebuilt.certificateDigest !== certificateDigest)
    fail("agent creation certificate digest invalid");
  return rebuilt;
}

export async function createAgentFactoryReceiptV1(
  input: Omit<AgentFactoryReceiptV1, "schemaVersion" | "receiptDigest">,
  crypto?: Crypto,
): Promise<AgentFactoryReceiptV1> {
  const body = { schemaVersion: 1 as const, ...input };
  validateFactoryReceiptBody(body);
  return freeze({
    ...body,
    receiptDigest: await collectiveMembershipDigestV1(
      { domain: "agent-factory-receipt-v1", body },
      crypto,
    ),
  });
}

export async function validateAgentLineageStateV1(
  input: AgentLineageStateV1,
  crypto?: Crypto,
): Promise<AgentLineageStateV1> {
  if (!input || input.schemaVersion !== 1)
    fail("agent lineage state schema invalid");
  identifier(input.stateKey, "stateKey");
  quorumDigest(input.policyDigest, "policyDigest");
  integer(input.revision, "revision", 0, Number.MAX_SAFE_INTEGER);
  integer(input.fence, "fence", 1, Number.MAX_SAFE_INTEGER);
  integer(
    input.logicalTimeHighWaterMs,
    "logicalTimeHighWaterMs",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  if (input.previousStateDigest !== null)
    quorumDigest(input.previousStateDigest, "previousStateDigest");
  if ((input.revision === 0) !== (input.previousStateDigest === null))
    fail("agent lineage state history invalid");
  const agents: AgentLineageRecordV1[] = [];
  const ids = new Set<string>(),
    peers = new Set<string>();
  for (const recordInput of input.agents) {
    const { lineageDigest, ...body } = recordInput;
    const rebuilt = await createLineageRecord(body, crypto);
    if (rebuilt.lineageDigest !== lineageDigest)
      fail("agent lineage record digest invalid");
    if (ids.has(rebuilt.agentId) || peers.has(rebuilt.peerId))
      fail("agent lineage identity duplicated");
    if (
      rebuilt.createdAtLogicalMs > input.logicalTimeHighWaterMs ||
      (rebuilt.terminatedAtLogicalMs !== null &&
        rebuilt.terminatedAtLogicalMs > input.logicalTimeHighWaterMs)
    )
      fail("agent lineage record exceeds state logical time");
    ids.add(rebuilt.agentId);
    peers.add(rebuilt.peerId);
    agents.push(rebuilt);
  }
  const roots = agents.filter((item) => item.parentAgentId === null);
  if (
    roots.length !== 1 ||
    roots[0].generation !== 0 ||
    roots[0].rootAgentId !== roots[0].agentId
  )
    fail("agent lineage root invalid");
  const byId = new Map(agents.map((item) => [item.agentId, item]));
  for (const agent of agents) {
    if (agent.parentAgentId === null) continue;
    const parent = byId.get(agent.parentAgentId);
    if (
      !parent ||
      agent.generation !== parent.generation + 1 ||
      agent.rootAgentId !== parent.rootAgentId ||
      agent.parentAuthorityDigest !== parent.authorityDigest
    )
      fail("agent lineage parent binding invalid");
  }
  for (const agent of agents) {
    const visited = new Set<string>();
    let cursor: AgentLineageRecordV1 | undefined = agent;
    while (cursor && cursor.parentAgentId !== null) {
      if (visited.has(cursor.agentId)) fail("agent lineage cycle detected");
      visited.add(cursor.agentId);
      cursor = byId.get(cursor.parentAgentId);
    }
  }
  validateDigestList(input.factoryReceiptDigests, "factoryReceiptDigests");
  validateDigestList(
    input.terminationReceiptDigests,
    "terminationReceiptDigests",
  );
  const creationSagas = input.creationSagas ?? [];
  if (!Array.isArray(creationSagas) || creationSagas.length > 100_000)
    fail("agent creation saga capacity invalid");
  const operationIds = new Set<string>();
  for (const saga of creationSagas) {
    identifier(saga.operationId, "creationSaga.operationId");
    if (operationIds.has(saga.operationId))
      fail("agent creation saga duplicated");
    operationIds.add(saga.operationId);
    if (
      !(
        ["prepared", "effect_applied", "cancelled", "completed"] as const
      ).includes(saga.phase)
    )
      fail("agent creation saga phase invalid");
    const request = await validateAgentCreationRequestV1(saga.request, crypto);
    const certificate = await validateAgentCreationCertificateV1(
      saga.certificate,
      crypto,
    );
    if (
      saga.operationId !== `creation:${request.requestDigest}` ||
      certificate.requestDigest !== request.requestDigest ||
      saga.parentLineageDigest !== certificate.parentLineageDigest
    )
      fail("agent creation saga binding invalid");
    quorumDigest(saga.parentLineageDigest, "creationSaga.parentLineageDigest");
    integer(
      saga.logicalTimeMs,
      "creationSaga.logicalTimeMs",
      0,
      input.logicalTimeHighWaterMs,
    );
    const cancellationReceiptDigest = saga.cancellationReceiptDigest ?? null;
    if (
      (saga.factoryReceipt === null) !==
      (saga.phase === "prepared" || saga.phase === "cancelled")
    )
      fail("agent creation saga receipt binding invalid");
    if (saga.factoryReceipt)
      await validateAgentFactoryReceiptV1(saga.factoryReceipt, crypto);
    if ((cancellationReceiptDigest === null) !== (saga.phase !== "cancelled"))
      fail("agent creation saga cancellation binding invalid");
    if (cancellationReceiptDigest !== null)
      quorumDigest(
        cancellationReceiptDigest,
        "creationSaga.cancellationReceiptDigest",
      );
    if (
      saga.phase === "completed" &&
      !agents.some(
        (agent) =>
          agent.agentId === request.requestedAgentId &&
          agent.creationCertificateDigest === certificate.certificateDigest,
      )
    )
      fail("completed agent creation saga lacks lineage");
  }
  const { stateDigest, ...body } = input;
  quorumDigest(stateDigest, "stateDigest");
  if (
    (await collectiveMembershipDigestV1(
      { domain: "agent-lineage-state-v1", body },
      crypto,
    )) !== stateDigest
  )
    fail("agent lineage state digest invalid");
  return freeze(structuredClone(input));
}

export async function validateAgentFactoryReceiptV1(
  input: AgentFactoryReceiptV1,
  crypto?: Crypto,
): Promise<AgentFactoryReceiptV1> {
  const { receiptDigest, schemaVersion: _schemaVersion, ...body } = input;
  const rebuilt = await createAgentFactoryReceiptV1(body, crypto);
  if (rebuilt.receiptDigest !== receiptDigest)
    fail("agent factory receipt digest invalid");
  return rebuilt;
}

export function projectAgentLineageToMembershipJoinV1(
  agent: AgentLineageRecordV1,
  activeKeyProof: CollectiveMembershipKeyProofV1,
): {
  readonly member: CollectiveMembershipMemberV1;
  readonly change: CollectiveMembershipChangeV1;
} {
  if (agent.status !== "pending_enrollment")
    fail("agent is not pending membership enrollment");
  const member: CollectiveMembershipMemberV1 = freeze({
    peerId: agent.peerId,
    instanceId: agent.instanceId,
    activeKeyId: agent.publicKeyId,
    keys: [
      {
        keyId: agent.publicKeyId,
        algorithm: "Ed25519",
        publicKey: agent.publicKey,
        validFrom: agent.validFrom,
        validUntil: agent.validUntil,
      },
    ],
  });
  return freeze({
    member,
    change: {
      kind: "join",
      peerId: agent.peerId,
      activeKeyProof,
    },
  });
}

async function createLineageRecord(
  input: Omit<AgentLineageRecordV1, "lineageDigest">,
  crypto?: Crypto,
): Promise<AgentLineageRecordV1> {
  const { lineageDigest: _staleLineageDigest, ...raw } =
    input as AgentLineageRecordV1;
  const body = {
    ...raw,
    retirementMembershipConfigurationDigest:
      raw.retirementMembershipConfigurationDigest ?? null,
    retirementMembershipEpoch: raw.retirementMembershipEpoch ?? null,
  };
  validateLineageBody(body);
  return freeze({
    ...body,
    lineageDigest: await collectiveMembershipDigestV1(
      { domain: "agent-lineage-record-v1", body },
      crypto,
    ),
  });
}

async function createState(
  input: Omit<AgentLineageStateV1, "stateDigest">,
  crypto?: Crypto,
): Promise<AgentLineageStateV1> {
  const { stateDigest: _staleStateDigest, ...body } =
    input as AgentLineageStateV1;
  return freeze({
    ...body,
    stateDigest: await collectiveMembershipDigestV1(
      { domain: "agent-lineage-state-v1", body },
      crypto,
    ),
  });
}

async function validateFactoryReceipt(
  receipt: AgentFactoryReceiptV1,
  request: AgentCreationRequestV1,
  factory: Pick<
    GovernedAgentFactoryPortV1,
    "factoryId" | "factoryVersion" | "factoryImplementationDigest"
  >,
  crypto?: Crypto,
): Promise<void> {
  const verified = await validateAgentFactoryReceiptV1(receipt, crypto);
  if (
    verified.requestDigest !== request.requestDigest ||
    verified.factoryId !== factory.factoryId ||
    verified.factoryVersion !== factory.factoryVersion ||
    verified.factoryImplementationDigest !==
      factory.factoryImplementationDigest ||
    verified.agentId !== request.requestedAgentId ||
    verified.peerId !== request.requestedPeerId ||
    verified.instanceId !== request.requestedInstanceId
  )
    fail("agent factory receipt invalid");
}

function descendantIds(
  records: readonly AgentLineageRecordV1[],
  parentId: string,
): string[] {
  const result = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const record of records)
      if (
        record.parentAgentId !== null &&
        (record.parentAgentId === parentId ||
          result.has(record.parentAgentId)) &&
        !result.has(record.agentId)
      ) {
        result.add(record.agentId);
        changed = true;
      }
  }
  return [...result].sort();
}

function validatePolicyBody(
  input: Omit<AgentCreationPolicyV1, "policyDigest"> | AgentCreationPolicyV1,
): void {
  if (input.schemaVersion !== 1) fail("agent creation policy schema invalid");
  identifier(input.policyId, "policyId");
  integer(input.policyVersion, "policyVersion", 1, Number.MAX_SAFE_INTEGER);
  integer(input.maximumGeneration, "maximumGeneration", 1, 1_000);
  integer(input.maximumChildrenPerAgent, "maximumChildrenPerAgent", 1, 100_000);
  integer(
    input.maximumActiveDescendants,
    "maximumActiveDescendants",
    1,
    1_000_000,
  );
  integer(
    input.maximumResourceUnitsPerChild,
    "maximumResourceUnitsPerChild",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  integer(
    input.maximumInteractionUnitsPerChild,
    "maximumInteractionUnitsPerChild",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  canonicalIdentifiers(input.allowedAdapterIds, "allowedAdapterIds");
  canonicalIdentifiers(
    input.permittedCapabilityKeys,
    "permittedCapabilityKeys",
  );
  integer(
    input.requestTtlLogicalMs,
    "requestTtlLogicalMs",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  integer(input.maximumCommitAttempts, "maximumCommitAttempts", 1, 32);
}

function validateRequestBody(
  input: Omit<AgentCreationRequestV1, "requestDigest">,
): void {
  if (input.schemaVersion !== 1) fail("agent creation request schema invalid");
  for (const [label, value] of Object.entries({
    requestId: input.requestId,
    parentAgentId: input.parentAgentId,
    requestedAgentId: input.requestedAgentId,
    requestedPeerId: input.requestedPeerId,
    requestedInstanceId: input.requestedInstanceId,
    factoryId: input.factoryId,
    adapterId: input.adapterId,
  }))
    identifier(value, label);
  token(input.adapterVersion, "adapterVersion");
  canonicalIdentifiers(input.capabilityKeys, "capabilityKeys");
  for (const [label, value] of Object.entries({
    roleDefinitionDigest: input.roleDefinitionDigest,
    proposedAuthorityDigest: input.proposedAuthorityDigest,
    parentAuthorityDigest: input.parentAuthorityDigest,
    localRuleProgramDigest: input.localRuleProgramDigest,
  }))
    quorumDigest(value, label);
  integer(
    input.resourceBudgetUnits,
    "resourceBudgetUnits",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  integer(
    input.interactionBudgetUnits,
    "interactionBudgetUnits",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  integer(
    input.requestedAtLogicalMs,
    "requestedAtLogicalMs",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  integer(
    input.expiresAtLogicalMs,
    "expiresAtLogicalMs",
    input.requestedAtLogicalMs + 1,
    Number.MAX_SAFE_INTEGER,
  );
}

function validateCertificateBody(
  input: Omit<AgentCreationCertificateV1, "certificateDigest">,
): void {
  if (input.schemaVersion !== 1)
    fail("agent creation certificate schema invalid");
  for (const [label, value] of Object.entries({
    requestDigest: input.requestDigest,
    policyDigest: input.policyDigest,
    parentLineageDigest: input.parentLineageDigest,
    roleDefinitionDigest: input.roleDefinitionDigest,
    authorityAttenuationDigest: input.authorityAttenuationDigest,
    collectiveCertificateDigest: input.collectiveCertificateDigest,
    membershipConfigurationDigest: input.membershipConfigurationDigest,
  }))
    quorumDigest(value, label);
  integer(input.membershipEpoch, "membershipEpoch", 1, Number.MAX_SAFE_INTEGER);
  integer(
    input.certifiedAtLogicalMs,
    "certifiedAtLogicalMs",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  integer(
    input.validUntilLogicalMs,
    "validUntilLogicalMs",
    input.certifiedAtLogicalMs + 1,
    Number.MAX_SAFE_INTEGER,
  );
}

function validateFactoryReceiptBody(
  input: Omit<AgentFactoryReceiptV1, "receiptDigest">,
): void {
  if (input.schemaVersion !== 1) fail("agent factory receipt schema invalid");
  quorumDigest(input.requestDigest, "requestDigest");
  identifier(input.factoryId, "factoryId");
  integer(input.factoryVersion, "factoryVersion", 1, Number.MAX_SAFE_INTEGER);
  quorumDigest(
    input.factoryImplementationDigest,
    "factoryImplementationDigest",
  );
  identifier(input.agentId, "agentId");
  identifier(input.peerId, "peerId");
  identifier(input.instanceId, "instanceId");
  identifier(input.publicKeyId, "publicKeyId");
  token(input.publicKey, "publicKey");
  if (input.keyAlgorithm !== "Ed25519")
    fail("agent factory key algorithm invalid");
  canonicalInstant(input.validFrom, "validFrom");
  canonicalInstant(input.validUntil, "validUntil");
  if (Date.parse(input.validUntil) <= Date.parse(input.validFrom))
    fail("agent factory key validity interval invalid");
  quorumDigest(input.runtimeAttestationDigest, "runtimeAttestationDigest");
}

function validateLineageBody(
  input: Omit<AgentLineageRecordV1, "lineageDigest">,
): void {
  if (input.schemaVersion !== 1) fail("agent lineage record schema invalid");
  for (const [label, value] of Object.entries({
    agentId: input.agentId,
    peerId: input.peerId,
    instanceId: input.instanceId,
    rootAgentId: input.rootAgentId,
    factoryId: input.factoryId,
    adapterId: input.adapterId,
    publicKeyId: input.publicKeyId,
  }))
    identifier(value, label);
  if (input.parentAgentId !== null)
    identifier(input.parentAgentId, "parentAgentId");
  integer(input.generation, "generation", 0, 1_000);
  token(input.adapterVersion, "adapterVersion");
  canonicalIdentifiers(input.capabilityKeys, "capabilityKeys");
  for (const [label, value] of Object.entries({
    roleDefinitionDigest: input.roleDefinitionDigest,
    authorityDigest: input.authorityDigest,
    localRuleProgramDigest: input.localRuleProgramDigest,
    creationCertificateDigest: input.creationCertificateDigest,
  }))
    quorumDigest(value, label);
  if (input.parentAuthorityDigest !== null)
    quorumDigest(input.parentAuthorityDigest, "parentAuthorityDigest");
  if (input.membershipConfigurationDigest !== null)
    quorumDigest(
      input.membershipConfigurationDigest,
      "membershipConfigurationDigest",
    );
  if (
    (input.membershipConfigurationDigest === null) !==
    (input.membershipEpoch === null)
  )
    fail("agent membership lineage binding incomplete");
  if (input.membershipEpoch !== null)
    integer(
      input.membershipEpoch,
      "membershipEpoch",
      1,
      Number.MAX_SAFE_INTEGER,
    );
  if (input.status === "active" && input.membershipConfigurationDigest === null)
    fail("active agent lacks a membership configuration");
  integer(
    input.resourceBudgetUnits,
    "resourceBudgetUnits",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  integer(
    input.interactionBudgetUnits,
    "interactionBudgetUnits",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  token(input.publicKey, "publicKey");
  canonicalInstant(input.validFrom, "validFrom");
  canonicalInstant(input.validUntil, "validUntil");
  if (Date.parse(input.validUntil) <= Date.parse(input.validFrom))
    fail("agent lineage key validity interval invalid");
  integer(
    input.createdAtLogicalMs,
    "createdAtLogicalMs",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  if (
    !(
      [
        "pending_enrollment",
        "active",
        "suspended",
        "revoked",
        "retiring",
        "terminated",
      ] as const
    ).includes(input.status)
  )
    fail("agent lineage status invalid");
  if (
    (input.status === "terminated") !==
    (input.terminatedAtLogicalMs !== null)
  )
    fail("agent lineage termination binding invalid");
  if (input.terminatedAtLogicalMs !== null)
    integer(
      input.terminatedAtLogicalMs,
      "terminatedAtLogicalMs",
      input.createdAtLogicalMs,
      Number.MAX_SAFE_INTEGER,
    );
  const enrollmentPhase = input.enrollmentPhase ?? null;
  if (
    enrollmentPhase !== null &&
    enrollmentPhase !== "prepared" &&
    enrollmentPhase !== "applied"
  )
    fail("agent enrollment phase invalid");
  if (enrollmentPhase !== null && input.status !== "pending_enrollment")
    fail("only a pending agent may retain enrollment work");
  const enrollmentConfiguration =
    input.enrollmentAuthorizationConfigurationDigest ?? null;
  const enrollmentEpoch = input.enrollmentAuthorizationEpoch ?? null;
  if ((enrollmentConfiguration === null) !== (enrollmentEpoch === null))
    fail("agent enrollment receipt binding incomplete");
  if (enrollmentPhase === "applied" && enrollmentConfiguration === null)
    fail("applied enrollment lacks its receipt");
  if (enrollmentPhase !== "applied" && enrollmentConfiguration !== null)
    fail("unapplied enrollment retained a receipt");
  if (enrollmentConfiguration !== null) {
    quorumDigest(enrollmentConfiguration, "enrollmentConfigurationDigest");
    integer(enrollmentEpoch, "enrollmentEpoch", 1, Number.MAX_SAFE_INTEGER);
  }
  const retirementOperationId = input.retirementOperationId ?? null;
  const retirementStartedAtLogicalMs =
    input.retirementStartedAtLogicalMs ?? null;
  const retirementReasonCode = input.retirementReasonCode ?? null;
  const retirementSourceStatus = input.retirementSourceStatus ?? null;
  const retirementSourceLineageDigest =
    input.retirementSourceLineageDigest ?? null;
  const retirementTerminationReceiptDigest =
    input.retirementTerminationReceiptDigest ?? null;
  if (retirementOperationId !== null)
    identifier(retirementOperationId, "retirementOperationId");
  if (retirementStartedAtLogicalMs !== null)
    integer(
      retirementStartedAtLogicalMs,
      "retirementStartedAtLogicalMs",
      input.createdAtLogicalMs,
      Number.MAX_SAFE_INTEGER,
    );
  if (retirementReasonCode !== null)
    token(retirementReasonCode, "retirementReasonCode");
  if (retirementSourceLineageDigest !== null)
    quorumDigest(
      retirementSourceLineageDigest,
      "retirementSourceLineageDigest",
    );
  if (retirementTerminationReceiptDigest !== null)
    quorumDigest(
      retirementTerminationReceiptDigest,
      "retirementTerminationReceiptDigest",
    );
  if (
    input.status === "retiring" &&
    (!retirementOperationId ||
      retirementStartedAtLogicalMs === null ||
      !retirementReasonCode ||
      !retirementSourceStatus ||
      !retirementSourceLineageDigest)
  )
    fail("agent retirement reservation binding incomplete");
  if (
    input.status !== "retiring" &&
    input.status !== "terminated" &&
    (retirementOperationId !== null ||
      retirementStartedAtLogicalMs !== null ||
      retirementReasonCode !== null ||
      retirementSourceStatus !== null ||
      retirementSourceLineageDigest !== null ||
      retirementTerminationReceiptDigest !== null)
  )
    fail("inactive retirement journal retained on agent");
  const retirementConfiguration =
    input.retirementMembershipConfigurationDigest ?? null;
  const retirementEpoch = input.retirementMembershipEpoch ?? null;
  if ((retirementConfiguration === null) !== (retirementEpoch === null))
    fail("agent lineage retirement membership binding incomplete");
  if (retirementConfiguration !== null) {
    if (input.status !== "terminated" && input.status !== "retiring")
      fail(
        "only a retiring or terminated agent may retain a retirement membership binding",
      );
    quorumDigest(
      retirementConfiguration,
      "retirementMembershipConfigurationDigest",
    );
    integer(
      retirementEpoch,
      "retirementMembershipEpoch",
      1,
      Number.MAX_SAFE_INTEGER,
    );
  }
}

function canonicalInstant(
  value: unknown,
  label: string,
): asserts value is string {
  if (
    typeof value !== "string" ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(Date.parse(value)).toISOString() !== value
  )
    fail(`${label} must be a canonical ISO-8601 instant`);
}

function canonicalIdentifiers(values: readonly string[], label: string): void {
  if (!Array.isArray(values) || values.length > 100_000)
    fail(`${label} invalid`);
  values.forEach((item) => identifier(item, label));
  const canonical = [...new Set(values)].sort();
  if (
    canonical.length !== values.length ||
    canonical.some((item, index) => item !== values[index])
  )
    fail(`${label} must be canonical`);
}

function validateDigestList(values: readonly string[], label: string): void {
  if (!Array.isArray(values) || values.length > 1_000_000)
    fail(`${label} invalid`);
  const seen = new Set<string>();
  for (const value of values) {
    quorumDigest(value, label);
    if (seen.has(value)) fail(`${label} contains a duplicate`);
    seen.add(value);
  }
}

function identifier(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/.test(value)
  )
    fail(`${label} invalid`);
}

function token(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 256 ||
    /[\u0000-\u001f]/.test(value)
  )
    fail(`${label} invalid`);
}

function quorumDigest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value))
    fail(`${label} invalid`);
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
    fail(`${label} invalid`);
  return value as number;
}

function freeze<T>(value: T): T {
  const clone = structuredClone(value);
  const visit = (item: unknown): void => {
    if (!item || typeof item !== "object" || Object.isFrozen(item)) return;
    Object.values(item as Record<string, unknown>).forEach(visit);
    Object.freeze(item);
  };
  visit(clone);
  return clone;
}

function fail(message: string): never {
  throw new TypeError(message);
}
