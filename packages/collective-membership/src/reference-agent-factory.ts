import {
  createAgentFactoryReceiptV1,
  GovernedAgentCreationCancelledErrorV1,
  validateAgentCreationCertificateV1,
  validateAgentCreationRequestV1,
  validateAgentFactoryReceiptV1,
  validateAgentLineageStateV1,
  verifyAgentCreationPolicyV1,
  type AgentCreationCertificateV1,
  type AgentCreationCertificationPortV1,
  type AgentCreationPolicyV1,
  type AgentCreationRequestV1,
  type AgentFactoryReceiptV1,
  type AgentLineageRecordV1,
  type AgentLineageStateV1,
  type AgentLineageStoreV1,
  type GovernedAgentFactoryPortV1,
} from "./agent-lineage.js";
import { collectiveMembershipDigestV1 } from "./crypto.js";

export interface GovernedAgentFactoryClockPortV1 {
  read(): Promise<{
    readonly wallTime: string;
    readonly logicalTimeMs: number;
  }>;
}

/**
 * Implementations must be idempotent for one creationOperationId. Termination
 * must durably fence that operation even when identityHandle is null, so a
 * provision already in flight cannot materialize after cleanup wins.
 */
export interface GovernedAgentIdentityProvisioningPortV1 {
  provision(input: {
    readonly creationOperationId: string;
    readonly agentId: string;
    readonly peerId: string;
    readonly instanceId: string;
    readonly adapterId: string;
    readonly adapterVersion: string;
    readonly capabilityKeys: readonly string[];
    readonly roleDefinitionDigest: string;
    readonly authorityDigest: string;
    readonly localRuleProgramDigest: string;
    readonly resourceBudgetUnits: number;
    readonly interactionBudgetUnits: number;
    readonly expiresAtLogicalMs: number;
    readonly signal?: AbortSignal;
  }): Promise<{
    readonly identityHandle: string;
    readonly runtimeAttestationDigest: string;
  }>;
  terminate(input: {
    readonly creationOperationId: string;
    readonly identityHandle: string | null;
    readonly reasonCode: string;
    readonly logicalTimeMs: number;
  }): Promise<{ readonly terminated: boolean; readonly receiptDigest: string }>;
}

/**
 * Private key material remains behind this port and never enters factory
 * state. Revocation must durably fence the operation even with a null handle.
 */
export interface GovernedAgentKeyCustodyPortV1 {
  generateEd25519(input: {
    readonly creationOperationId: string;
    readonly agentId: string;
    readonly peerId: string;
    readonly instanceId: string;
    readonly validFrom: string;
    readonly validUntil: string;
    readonly signal?: AbortSignal;
  }): Promise<{
    readonly keyHandle: string;
    readonly publicKeyId: string;
    readonly publicKey: string;
    readonly keyAlgorithm: "Ed25519";
    readonly validFrom: string;
    readonly validUntil: string;
    readonly keyAttestationDigest: string;
  }>;
  revoke(input: {
    readonly creationOperationId: string;
    readonly keyHandle: string | null;
    readonly reasonCode: string;
    readonly logicalTimeMs: number;
  }): Promise<{ readonly revoked: boolean; readonly receiptDigest: string }>;
}

export type GovernedAgentFactoryRecordStatusV1 =
  "reserved" | "expiring" | "active" | "terminated" | "expired";

export interface GovernedAgentFactoryRecordV1 {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly requestDigest: string;
  readonly certificateDigest: string;
  readonly parentAgentId: string;
  readonly parentLineageDigest: string;
  readonly agentId: string;
  readonly peerId: string;
  readonly instanceId: string;
  readonly adapterId: string;
  readonly capabilityKeys: readonly string[];
  readonly authorityDigest: string;
  readonly resourceBudgetUnits: number;
  readonly interactionBudgetUnits: number;
  readonly identityHandle: string | null;
  readonly keyHandle: string | null;
  readonly identityAttestationDigest: string | null;
  readonly keyAttestationDigest: string | null;
  readonly receipt: AgentFactoryReceiptV1 | null;
  readonly status: GovernedAgentFactoryRecordStatusV1;
  readonly createdAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  /** Exact pre-effect wall-time plan; retries must never extend this interval. */
  readonly provisioningWallTime?: string | null;
  readonly provisioningValidUntil?: string | null;
  /** Exact cleanup invocation time retained across cleanup retries. */
  readonly cleanupStartedAtLogicalMs?: number | null;
  readonly terminatedAtLogicalMs: number | null;
  readonly terminationReceiptDigest: string | null;
  readonly recordDigest: string;
}

export interface GovernedAgentFactoryStateV1 {
  readonly schemaVersion: 1;
  readonly stateKey: string;
  readonly factoryId: string;
  readonly factoryVersion: number;
  readonly factoryImplementationDigest: string;
  readonly policyDigest: string;
  readonly revision: number;
  readonly records: readonly GovernedAgentFactoryRecordV1[];
  readonly logicalTimeHighWaterMs: number;
  readonly previousStateDigest: string | null;
  readonly stateDigest: string;
}

export interface GovernedAgentFactoryStoreV1 {
  load(stateKey: string): Promise<GovernedAgentFactoryStateV1 | null>;
  save(
    state: GovernedAgentFactoryStateV1,
    expectedRevision: number | null,
  ): Promise<boolean>;
}

export class InMemoryGovernedAgentFactoryStoreV1 implements GovernedAgentFactoryStoreV1 {
  readonly #states = new Map<string, GovernedAgentFactoryStateV1>();

  async load(stateKey: string): Promise<GovernedAgentFactoryStateV1 | null> {
    const state = this.#states.get(stateKey);
    return state ? immutable(state) : null;
  }

  async save(
    state: GovernedAgentFactoryStateV1,
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
    this.#states.set(state.stateKey, immutable(state));
    return true;
  }
}

/**
 * Reference implementation of the material agent factory boundary. It keeps a
 * CAS ledger before provisioning, revalidates current parent lineage and
 * authority, and delegates process identity and private-key custody to
 * portable, idempotent ports.
 */
export class ReferenceGovernedAgentFactoryV1 implements GovernedAgentFactoryPortV1 {
  readonly factoryId: string;
  readonly factoryVersion: number;
  readonly factoryImplementationDigest: string;
  readonly policy: AgentCreationPolicyV1;
  readonly #store: GovernedAgentFactoryStoreV1;
  #policyVerification: Promise<AgentCreationPolicyV1> | null = null;

  constructor(
    readonly options: {
      readonly stateKey: string;
      readonly lineageStateKey: string;
      readonly factoryId: string;
      readonly factoryVersion: number;
      readonly factoryImplementationDigest: string;
      readonly policy: AgentCreationPolicyV1;
      readonly lineageStore: AgentLineageStoreV1;
      readonly store: GovernedAgentFactoryStoreV1;
      readonly certification: AgentCreationCertificationPortV1;
      readonly identity: GovernedAgentIdentityProvisioningPortV1;
      readonly keys: GovernedAgentKeyCustodyPortV1;
      readonly clock: GovernedAgentFactoryClockPortV1;
      readonly maximumManagedAgents: number;
      readonly maximumKeyLifetimeMs: number;
      readonly crypto?: Crypto;
    },
  ) {
    identifier(options.stateKey, "stateKey");
    identifier(options.lineageStateKey, "lineageStateKey");
    identifier(options.factoryId, "factoryId");
    integer(
      options.factoryVersion,
      "factoryVersion",
      1,
      Number.MAX_SAFE_INTEGER,
    );
    digest(options.factoryImplementationDigest, "factoryImplementationDigest");
    integer(options.maximumManagedAgents, "maximumManagedAgents", 1, 1_000_000);
    integer(
      options.maximumKeyLifetimeMs,
      "maximumKeyLifetimeMs",
      1,
      Number.MAX_SAFE_INTEGER,
    );
    if (
      !options.lineageStore ||
      !options.store ||
      !options.certification ||
      !options.identity ||
      !options.keys ||
      !options.clock
    )
      fail("governed agent factory ports are required");
    this.factoryId = options.factoryId;
    this.factoryVersion = options.factoryVersion;
    this.factoryImplementationDigest = options.factoryImplementationDigest;
    this.policy = options.policy;
    this.#store = options.store;
  }

  async initialize(logicalTimeMs = 0): Promise<GovernedAgentFactoryStateV1> {
    integer(logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
    const policy = await this.#verifyPolicy();
    const state = await createFactoryState(
      {
        schemaVersion: 1,
        stateKey: this.options.stateKey,
        factoryId: this.factoryId,
        factoryVersion: this.factoryVersion,
        factoryImplementationDigest: this.factoryImplementationDigest,
        policyDigest: policy.policyDigest,
        revision: 0,
        records: [],
        logicalTimeHighWaterMs: logicalTimeMs,
        previousStateDigest: null,
      },
      this.options.crypto,
    );
    if (!(await this.#store.save(state, null)))
      fail("governed agent factory already initialized");
    return state;
  }

  async load(): Promise<GovernedAgentFactoryStateV1> {
    const policy = await this.#verifyPolicy();
    const state = await this.#store.load(this.options.stateKey);
    if (!state) fail("governed agent factory is not initialized");
    const validated = await validateGovernedAgentFactoryStateV1(
      state,
      this.options.crypto,
    );
    if (
      validated.stateKey !== this.options.stateKey ||
      validated.factoryId !== this.factoryId ||
      validated.factoryVersion !== this.factoryVersion ||
      validated.factoryImplementationDigest !==
        this.factoryImplementationDigest ||
      validated.policyDigest !== policy.policyDigest
    )
      fail("governed agent factory state binding changed");
    return validated;
  }

  async create(input: {
    readonly request: AgentCreationRequestV1;
    readonly certificate: AgentCreationCertificateV1;
    readonly reservedAtLogicalMs: number;
    readonly signal?: AbortSignal;
  }): Promise<AgentFactoryReceiptV1> {
    const request = await validateAgentCreationRequestV1(
      input.request,
      this.options.crypto,
    );
    const certificate = await validateAgentCreationCertificateV1(
      input.certificate,
      this.options.crypto,
    );
    integer(
      input.reservedAtLogicalMs,
      "reservedAtLogicalMs",
      request.requestedAtLogicalMs,
      Math.min(request.expiresAtLogicalMs, certificate.validUntilLogicalMs) - 1,
    );
    if (input.signal?.aborted) fail("governed agent provisioning aborted");
    let state = await this.load();
    const existing = this.#matchReplay(state, request);
    if (
      existing &&
      existing.certificateDigest !== certificate.certificateDigest
    )
      fail("governed agent replay certificate changed");
    const reading = await this.#readClock();
    if (existing?.receipt) {
      if (
        existing.status === "active" &&
        (reading.logicalTimeMs >= existing.expiresAtLogicalMs ||
          Date.parse(reading.wallTime) >=
            Date.parse(existing.receipt.validUntil))
      )
        return this.#cancelReservation(request, certificate, reading);
      return existing.receipt;
    }
    if (existing?.status === "expired")
      throw new GovernedAgentCreationCancelledErrorV1(
        request.requestDigest,
        existing.terminationReceiptDigest!,
      );
    if (existing?.status === "expiring")
      return this.#cancelReservation(request, certificate, reading);
    if (!existing) {
      if (
        reading.logicalTimeMs >= request.expiresAtLogicalMs ||
        reading.logicalTimeMs >= certificate.validUntilLogicalMs
      ) {
        await this.#reserveExpiredCancellation(
          request,
          certificate,
          input.reservedAtLogicalMs,
          reading,
        );
        return this.#cancelReservation(request, certificate, reading);
      }
      const context = await this.#authorize(request, certificate, reading);
      this.#validateFactoryQuotaAndIdentity(state, request, context);
      const expiresAtLogicalMs = Math.min(
        request.expiresAtLogicalMs,
        certificate.validUntilLogicalMs,
      );
      const validForMs = Math.min(
        this.options.maximumKeyLifetimeMs,
        expiresAtLogicalMs - reading.logicalTimeMs,
      );
      integer(validForMs, "keyValidityDurationMs", 1, Number.MAX_SAFE_INTEGER);
      const validUntilMs = Date.parse(reading.wallTime) + validForMs;
      if (!Number.isFinite(validUntilMs))
        fail("governed agent key validity overflow");
      const reserved = await createFactoryRecord(
        {
          schemaVersion: 1,
          requestId: request.requestId,
          requestDigest: request.requestDigest,
          certificateDigest: certificate.certificateDigest,
          parentAgentId: context.parent.agentId,
          parentLineageDigest: context.parent.lineageDigest,
          agentId: request.requestedAgentId,
          peerId: request.requestedPeerId,
          instanceId: request.requestedInstanceId,
          adapterId: request.adapterId,
          capabilityKeys: request.capabilityKeys,
          authorityDigest: request.proposedAuthorityDigest,
          resourceBudgetUnits: request.resourceBudgetUnits,
          interactionBudgetUnits: request.interactionBudgetUnits,
          identityHandle: null,
          keyHandle: null,
          identityAttestationDigest: null,
          keyAttestationDigest: null,
          receipt: null,
          status: "reserved",
          createdAtLogicalMs: reading.logicalTimeMs,
          expiresAtLogicalMs,
          provisioningWallTime: reading.wallTime,
          provisioningValidUntil: new Date(validUntilMs).toISOString(),
          cleanupStartedAtLogicalMs: null,
          terminatedAtLogicalMs: null,
          terminationReceiptDigest: null,
        },
        this.options.crypto,
      );
      state = await this.#commit(reading.logicalTimeMs, async (current) => {
        const concurrent = this.#matchReplay(current, request);
        if (concurrent) return current;
        const authorization = await this.#authorize(
          request,
          certificate,
          reading,
        );
        this.#validateFactoryQuotaAndIdentity(current, request, authorization);
        return createFactoryState(
          {
            ...current,
            revision: current.revision + 1,
            records: [...current.records, reserved],
            logicalTimeHighWaterMs: reading.logicalTimeMs,
            previousStateDigest: current.stateDigest,
          },
          this.options.crypto,
        );
      });
      const concurrent = this.#matchReplay(state, request);
      if (!concurrent) fail("governed agent reservation was not retained");
      if (concurrent.receipt) return concurrent.receipt;
    }

    const reservation = this.#matchReplay(state, request);
    if (
      !reservation ||
      reservation.certificateDigest !== certificate.certificateDigest ||
      reservation.parentAgentId !== request.parentAgentId ||
      reservation.agentId !== request.requestedAgentId ||
      reservation.peerId !== request.requestedPeerId ||
      reservation.instanceId !== request.requestedInstanceId
    )
      fail("governed agent reservation binding changed");
    if (reservation.status === "expired")
      throw new GovernedAgentCreationCancelledErrorV1(
        request.requestDigest,
        reservation.terminationReceiptDigest!,
      );
    if (reservation.status === "expiring")
      return this.#cancelReservation(request, certificate, reading);
    if (reservation.status !== "reserved")
      fail("governed agent creation request is terminal");
    const provisioningWallTime = reservation.provisioningWallTime;
    const provisioningValidUntil = reservation.provisioningValidUntil;
    if (!provisioningWallTime || !provisioningValidUntil)
      fail("governed agent reservation lacks its original provisioning plan");
    if (
      reading.logicalTimeMs >= reservation.expiresAtLogicalMs ||
      Date.parse(reading.wallTime) >= Date.parse(provisioningValidUntil)
    )
      return this.#cancelReservation(request, certificate, reading);
    const authorization = await this.#authorize(request, certificate, {
      wallTime: provisioningWallTime,
      logicalTimeMs: reservation.createdAtLogicalMs,
    });
    if (authorization.parent.lineageDigest !== reservation.parentLineageDigest)
      fail("governed agent reservation parent lineage changed");
    const identity = await this.options.identity.provision({
      creationOperationId: request.requestDigest,
      agentId: request.requestedAgentId,
      peerId: request.requestedPeerId,
      instanceId: request.requestedInstanceId,
      adapterId: request.adapterId,
      adapterVersion: request.adapterVersion,
      capabilityKeys: request.capabilityKeys,
      roleDefinitionDigest: request.roleDefinitionDigest,
      authorityDigest: request.proposedAuthorityDigest,
      localRuleProgramDigest: request.localRuleProgramDigest,
      resourceBudgetUnits: request.resourceBudgetUnits,
      interactionBudgetUnits: request.interactionBudgetUnits,
      expiresAtLogicalMs: reservation.expiresAtLogicalMs,
      signal: input.signal,
    });
    token(identity.identityHandle, "identityHandle");
    digest(identity.runtimeAttestationDigest, "runtimeAttestationDigest");
    const key = await this.options.keys.generateEd25519({
      creationOperationId: request.requestDigest,
      agentId: request.requestedAgentId,
      peerId: request.requestedPeerId,
      instanceId: request.requestedInstanceId,
      validFrom: provisioningWallTime,
      validUntil: provisioningValidUntil,
      signal: input.signal,
    });
    validateGeneratedKey(key, provisioningWallTime, provisioningValidUntil);
    const runtimeAttestationDigest = await collectiveMembershipDigestV1(
      {
        domain: "governed-agent-runtime-attestation-v1",
        body: {
          requestDigest: request.requestDigest,
          certificateDigest: certificate.certificateDigest,
          parentLineageDigest: reservation.parentLineageDigest,
          factoryImplementationDigest: this.factoryImplementationDigest,
          identityAttestationDigest: identity.runtimeAttestationDigest,
          keyAttestationDigest: key.keyAttestationDigest,
        },
      },
      this.options.crypto,
    );
    const receipt = await createAgentFactoryReceiptV1(
      {
        requestDigest: request.requestDigest,
        factoryId: this.factoryId,
        factoryVersion: this.factoryVersion,
        factoryImplementationDigest: this.factoryImplementationDigest,
        agentId: request.requestedAgentId,
        peerId: request.requestedPeerId,
        instanceId: request.requestedInstanceId,
        publicKeyId: key.publicKeyId,
        publicKey: key.publicKey,
        keyAlgorithm: "Ed25519",
        validFrom: key.validFrom,
        validUntil: key.validUntil,
        runtimeAttestationDigest,
      },
      this.options.crypto,
    );
    const completionReading = await this.#readClock();
    if (
      completionReading.logicalTimeMs >= reservation.expiresAtLogicalMs ||
      Date.parse(completionReading.wallTime) >=
        Date.parse(provisioningValidUntil)
    )
      return this.#cancelReservation(request, certificate, completionReading);
    const completionAuthorization = await this.#authorize(
      request,
      certificate,
      {
        wallTime: provisioningWallTime,
        logicalTimeMs: reservation.createdAtLogicalMs,
      },
    );
    if (
      completionAuthorization.parent.lineageDigest !==
      reservation.parentLineageDigest
    )
      fail("governed agent reservation parent lineage changed");
    const completed = await this.#commit(
      completionReading.logicalTimeMs,
      async (current) => {
        const retained = this.#matchReplay(current, request);
        if (retained?.receipt) return current;
        if (
          !retained ||
          retained.status !== "reserved" ||
          retained.recordDigest !== reservation.recordDigest
        )
          return current;
        const active = await createFactoryRecord(
          {
            ...retained,
            identityHandle: identity.identityHandle,
            keyHandle: key.keyHandle,
            identityAttestationDigest: identity.runtimeAttestationDigest,
            keyAttestationDigest: key.keyAttestationDigest,
            receipt,
            status: "active",
          },
          this.options.crypto,
        );
        return createFactoryState(
          {
            ...current,
            revision: current.revision + 1,
            records: current.records.map((record) =>
              record.requestDigest === request.requestDigest ? active : record,
            ),
            logicalTimeHighWaterMs: completionReading.logicalTimeMs,
            previousStateDigest: current.stateDigest,
          },
          this.options.crypto,
        );
      },
    );
    const result = this.#matchReplay(completed, request);
    if (
      result?.receipt &&
      result.receipt.receiptDigest === receipt.receiptDigest
    )
      return result.receipt;
    if (result?.status === "expiring" || result?.status === "expired")
      return this.#cancelReservation(request, certificate, completionReading);
    fail("governed agent receipt completion conflict");
  }

  async #reserveExpiredCancellation(
    request: AgentCreationRequestV1,
    certificate: AgentCreationCertificateV1,
    reservedAtLogicalMs: number,
    reading: { readonly wallTime: string; readonly logicalTimeMs: number },
  ): Promise<void> {
    const lineage = await this.#loadLineage();
    const parent = lineage.agents.find(
      (agent) =>
        agent.agentId === request.parentAgentId && agent.status === "active",
    );
    if (!parent) fail("governed agent cancellation parent is unavailable");
    const authorization = await this.#authorize(request, certificate, {
      wallTime: parent.validFrom,
      logicalTimeMs: reservedAtLogicalMs,
    });
    const expiring = await createFactoryRecord(
      {
        schemaVersion: 1,
        requestId: request.requestId,
        requestDigest: request.requestDigest,
        certificateDigest: certificate.certificateDigest,
        parentAgentId: authorization.parent.agentId,
        parentLineageDigest: authorization.parent.lineageDigest,
        agentId: request.requestedAgentId,
        peerId: request.requestedPeerId,
        instanceId: request.requestedInstanceId,
        adapterId: request.adapterId,
        capabilityKeys: request.capabilityKeys,
        authorityDigest: request.proposedAuthorityDigest,
        resourceBudgetUnits: request.resourceBudgetUnits,
        interactionBudgetUnits: request.interactionBudgetUnits,
        identityHandle: null,
        keyHandle: null,
        identityAttestationDigest: null,
        keyAttestationDigest: null,
        receipt: null,
        status: "expiring",
        createdAtLogicalMs: reservedAtLogicalMs,
        expiresAtLogicalMs: Math.min(
          request.expiresAtLogicalMs,
          certificate.validUntilLogicalMs,
        ),
        provisioningWallTime: null,
        provisioningValidUntil: null,
        cleanupStartedAtLogicalMs: reading.logicalTimeMs,
        terminatedAtLogicalMs: null,
        terminationReceiptDigest: null,
      },
      this.options.crypto,
    );
    await this.#commit(reading.logicalTimeMs, async (current) => {
      const concurrent = this.#matchReplay(current, request);
      if (concurrent) return current;
      if (
        current.records.some(
          (record) =>
            record.agentId === request.requestedAgentId ||
            record.peerId === request.requestedPeerId ||
            record.instanceId === request.requestedInstanceId,
        )
      )
        fail("governed agent cancellation identity already exists");
      return createFactoryState(
        {
          ...current,
          revision: current.revision + 1,
          records: [...current.records, expiring],
          logicalTimeHighWaterMs: reading.logicalTimeMs,
          previousStateDigest: current.stateDigest,
        },
        this.options.crypto,
      );
    });
  }

  async #cancelReservation(
    request: AgentCreationRequestV1,
    certificate: AgentCreationCertificateV1,
    reading: { readonly wallTime: string; readonly logicalTimeMs: number },
  ): Promise<AgentFactoryReceiptV1> {
    const initial = this.#matchReplay(await this.load(), request);
    if (initial?.status === "active" && initial.receipt) {
      const lineage = await this.#loadLineage();
      const materialized = lineage.agents.find(
        (agent) => agent.agentId === initial.agentId,
      );
      if (materialized) {
        if (
          materialized.peerId !== initial.peerId ||
          materialized.instanceId !== initial.instanceId ||
          materialized.creationCertificateDigest !== initial.certificateDigest
        )
          fail("governed agent active lineage binding changed");
        return initial.receipt;
      }
    }
    let state = await this.#commit(reading.logicalTimeMs, async (current) => {
      const retained = this.#matchReplay(current, request);
      if (
        !retained ||
        retained.certificateDigest !== certificate.certificateDigest
      )
        fail("governed agent cancellation binding changed");
      if (retained.status === "expiring" || retained.status === "expired")
        return current;
      if (retained.status !== "reserved" && retained.status !== "active")
        fail("governed agent creation request is terminal");
      const expiring = await createFactoryRecord(
        {
          ...retained,
          status: "expiring",
          cleanupStartedAtLogicalMs: reading.logicalTimeMs,
        },
        this.options.crypto,
      );
      return createFactoryState(
        {
          ...current,
          revision: current.revision + 1,
          records: current.records.map((record) =>
            record.requestDigest === request.requestDigest ? expiring : record,
          ),
          logicalTimeHighWaterMs: reading.logicalTimeMs,
          previousStateDigest: current.stateDigest,
        },
        this.options.crypto,
      );
    });
    let retained = this.#matchReplay(state, request);
    if (!retained) fail("governed agent cancellation record disappeared");
    if (retained.status === "expired")
      throw new GovernedAgentCreationCancelledErrorV1(
        request.requestDigest,
        retained.terminationReceiptDigest!,
      );
    if (retained.status === "active" && retained.receipt)
      return retained.receipt;
    if (
      retained.status !== "expiring" ||
      retained.cleanupStartedAtLogicalMs === null ||
      retained.cleanupStartedAtLogicalMs === undefined
    )
      fail("governed agent cancellation fence is unavailable");
    const cleanupLogicalTimeMs = retained.cleanupStartedAtLogicalMs;
    const reasonCode = "creation_authorization_expired";
    const key = await this.options.keys.revoke({
      creationOperationId: retained.requestDigest,
      keyHandle: retained.keyHandle,
      reasonCode,
      logicalTimeMs: cleanupLogicalTimeMs,
    });
    if (!key.revoked) fail("expired governed agent key cleanup was denied");
    digest(key.receiptDigest, "keyRevocationReceiptDigest");
    const identity = await this.options.identity.terminate({
      creationOperationId: retained.requestDigest,
      identityHandle: retained.identityHandle,
      reasonCode,
      logicalTimeMs: cleanupLogicalTimeMs,
    });
    if (!identity.terminated)
      fail("expired governed agent identity cleanup was denied");
    digest(identity.receiptDigest, "identityTerminationReceiptDigest");
    const cancellationReceiptDigest = await collectiveMembershipDigestV1(
      {
        domain: "governed-agent-expiration-receipt-v1",
        body: {
          requestDigest: retained.requestDigest,
          reasonCode,
          keyRevocationReceiptDigest: key.receiptDigest,
          identityTerminationReceiptDigest: identity.receiptDigest,
          logicalTimeMs: cleanupLogicalTimeMs,
        },
      },
      this.options.crypto,
    );
    state = await this.#commit(reading.logicalTimeMs, async (current) => {
      const currentRecord = this.#matchReplay(current, request);
      if (!currentRecord)
        fail("governed agent cancellation record disappeared");
      if (currentRecord.status === "expired") return current;
      if (
        currentRecord.status !== "expiring" ||
        currentRecord.certificateDigest !== certificate.certificateDigest ||
        currentRecord.cleanupStartedAtLogicalMs !== cleanupLogicalTimeMs
      )
        fail("governed agent cancellation fence changed");
      const expired = await createFactoryRecord(
        {
          ...currentRecord,
          status: "expired",
          terminatedAtLogicalMs: cleanupLogicalTimeMs,
          terminationReceiptDigest: cancellationReceiptDigest,
        },
        this.options.crypto,
      );
      return createFactoryState(
        {
          ...current,
          revision: current.revision + 1,
          records: current.records.map((record) =>
            record.requestDigest === request.requestDigest ? expired : record,
          ),
          logicalTimeHighWaterMs: reading.logicalTimeMs,
          previousStateDigest: current.stateDigest,
        },
        this.options.crypto,
      );
    });
    retained = this.#matchReplay(state, request);
    if (
      retained?.status !== "expired" ||
      retained.terminationReceiptDigest !== cancellationReceiptDigest
    )
      fail("governed agent cancellation completion conflict");
    throw new GovernedAgentCreationCancelledErrorV1(
      request.requestDigest,
      cancellationReceiptDigest,
    );
  }

  /**
   * Fences expired reservations before asking the idempotent ports to remove
   * any partially provisioned identity or key material.
   */
  async expireReservations(
    input: {
      readonly maximumRecords?: number;
      readonly reasonCode?: string;
    } = {},
  ): Promise<GovernedAgentFactoryStateV1> {
    const maximumRecords = integer(
      input.maximumRecords ?? 128,
      "maximumRecords",
      1,
      10_000,
    );
    const reasonCode = input.reasonCode ?? "creation_authorization_expired";
    token(reasonCode, "reasonCode");
    const reading = await this.#readClock();
    let claimed: GovernedAgentFactoryRecordV1[] = [];
    let state = await this.#commit(reading.logicalTimeMs, async (current) => {
      const candidates = current.records
        .filter(
          (record) =>
            record.status === "reserved" &&
            record.expiresAtLogicalMs <= reading.logicalTimeMs,
        )
        .slice(0, maximumRecords);
      if (candidates.length === 0) {
        claimed = current.records
          .filter(
            (record) =>
              record.status === "expiring" &&
              record.expiresAtLogicalMs <= reading.logicalTimeMs,
          )
          .slice(0, maximumRecords);
        return current;
      }
      const ids = new Set(candidates.map((record) => record.requestDigest));
      const records = await Promise.all(
        current.records.map((record) =>
          ids.has(record.requestDigest)
            ? createFactoryRecord(
                {
                  ...record,
                  status: "expiring",
                  cleanupStartedAtLogicalMs: reading.logicalTimeMs,
                },
                this.options.crypto,
              )
            : record,
        ),
      );
      claimed = records.filter((record) => ids.has(record.requestDigest));
      return createFactoryState(
        {
          ...current,
          revision: current.revision + 1,
          records,
          logicalTimeHighWaterMs: reading.logicalTimeMs,
          previousStateDigest: current.stateDigest,
        },
        this.options.crypto,
      );
    });
    if (claimed.length === 0)
      claimed = state.records
        .filter(
          (record) =>
            record.status === "expiring" &&
            record.expiresAtLogicalMs <= reading.logicalTimeMs,
        )
        .slice(0, maximumRecords);
    const expirations = new Map<string, string>();
    for (const record of claimed) {
      if (
        record.cleanupStartedAtLogicalMs === null ||
        record.cleanupStartedAtLogicalMs === undefined
      )
        fail("governed agent expiration cleanup time is unavailable");
      const cleanupLogicalTimeMs = record.cleanupStartedAtLogicalMs;
      const key = await this.options.keys.revoke({
        creationOperationId: record.requestDigest,
        keyHandle: record.keyHandle,
        reasonCode,
        logicalTimeMs: cleanupLogicalTimeMs,
      });
      if (!key.revoked) fail("expired governed agent key cleanup was denied");
      digest(key.receiptDigest, "keyRevocationReceiptDigest");
      const identity = await this.options.identity.terminate({
        creationOperationId: record.requestDigest,
        identityHandle: record.identityHandle,
        reasonCode,
        logicalTimeMs: cleanupLogicalTimeMs,
      });
      if (!identity.terminated)
        fail("expired governed agent identity cleanup was denied");
      digest(identity.receiptDigest, "identityTerminationReceiptDigest");
      expirations.set(
        record.requestDigest,
        await collectiveMembershipDigestV1(
          {
            domain: "governed-agent-expiration-receipt-v1",
            body: {
              requestDigest: record.requestDigest,
              reasonCode,
              keyRevocationReceiptDigest: key.receiptDigest,
              identityTerminationReceiptDigest: identity.receiptDigest,
              logicalTimeMs: cleanupLogicalTimeMs,
            },
          },
          this.options.crypto,
        ),
      );
    }
    if (expirations.size === 0) return state;
    state = await this.#commit(reading.logicalTimeMs, async (current) => {
      const records = await Promise.all(
        current.records.map(async (record) => {
          const receiptDigest = expirations.get(record.requestDigest);
          if (!receiptDigest || record.status === "expired") return record;
          if (record.status !== "expiring")
            fail("governed agent expiration fence changed");
          if (
            record.cleanupStartedAtLogicalMs === null ||
            record.cleanupStartedAtLogicalMs === undefined
          )
            fail("governed agent expiration cleanup time changed");
          return createFactoryRecord(
            {
              ...record,
              status: "expired",
              terminatedAtLogicalMs: record.cleanupStartedAtLogicalMs,
              terminationReceiptDigest: receiptDigest,
            },
            this.options.crypto,
          );
        }),
      );
      return createFactoryState(
        {
          ...current,
          revision: current.revision + 1,
          records,
          logicalTimeHighWaterMs: reading.logicalTimeMs,
          previousStateDigest: current.stateDigest,
        },
        this.options.crypto,
      );
    });
    return state;
  }

  async terminate(input: {
    readonly operationId: string;
    readonly agent: AgentLineageRecordV1;
    readonly reasonCode: string;
    readonly logicalTimeMs: number;
  }): Promise<{
    readonly terminated: boolean;
    readonly receiptDigest: string;
  }> {
    identifier(input.operationId, "operationId");
    token(input.reasonCode, "reasonCode");
    integer(input.logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
    const reading = await this.#readClock();
    if (reading.logicalTimeMs !== input.logicalTimeMs)
      fail("governed agent termination clock binding changed");
    const lineage = await this.#loadLineage();
    const currentAgent = lineage.agents.find(
      (agent) => agent.agentId === input.agent.agentId,
    );
    const exactActive =
      currentAgent?.lineageDigest === input.agent.lineageDigest;
    const exactRetirement =
      currentAgent?.status === "retiring" &&
      currentAgent.retirementOperationId === input.operationId &&
      currentAgent.retirementSourceLineageDigest === input.agent.lineageDigest;
    if (
      !currentAgent ||
      (!exactActive && !exactRetirement) ||
      currentAgent.parentAgentId === null
    )
      fail("governed agent termination lineage is unavailable");
    let state = await this.load();
    const record = state.records.find(
      (candidate) => candidate.agentId === currentAgent.agentId,
    );
    if (
      !record ||
      !record.receipt ||
      record.status === "reserved" ||
      record.status === "expired"
    )
      fail("governed agent termination record is unavailable");
    if (record.status === "terminated")
      return {
        terminated: true,
        receiptDigest: record.terminationReceiptDigest!,
      };
    validateRecordAgainstAgent(record, input.agent);
    const key = await this.options.keys.revoke({
      creationOperationId: record.requestDigest,
      keyHandle: record.keyHandle,
      reasonCode: input.reasonCode,
      logicalTimeMs: input.logicalTimeMs,
    });
    if (!key.revoked) fail("governed agent key revocation was denied");
    digest(key.receiptDigest, "keyRevocationReceiptDigest");
    const identity = await this.options.identity.terminate({
      creationOperationId: record.requestDigest,
      identityHandle: record.identityHandle,
      reasonCode: input.reasonCode,
      logicalTimeMs: input.logicalTimeMs,
    });
    if (!identity.terminated)
      fail("governed agent identity termination was denied");
    digest(identity.receiptDigest, "identityTerminationReceiptDigest");
    const receiptDigest = await collectiveMembershipDigestV1(
      {
        domain: "governed-agent-termination-receipt-v1",
        body: {
          requestDigest: record.requestDigest,
          operationId: input.operationId,
          agentLineageDigest: input.agent.lineageDigest,
          reasonCode: input.reasonCode,
          keyRevocationReceiptDigest: key.receiptDigest,
          identityTerminationReceiptDigest: identity.receiptDigest,
          logicalTimeMs: input.logicalTimeMs,
        },
      },
      this.options.crypto,
    );
    state = await this.#commit(input.logicalTimeMs, async (current) => {
      const retained = current.records.find(
        (candidate) => candidate.requestDigest === record.requestDigest,
      );
      if (!retained) fail("governed agent termination record disappeared");
      if (retained.status === "terminated") return current;
      if (
        retained.status !== "active" ||
        retained.recordDigest !== record.recordDigest
      )
        fail("governed agent termination record changed");
      const terminated = await createFactoryRecord(
        {
          ...retained,
          status: "terminated",
          terminatedAtLogicalMs: input.logicalTimeMs,
          terminationReceiptDigest: receiptDigest,
        },
        this.options.crypto,
      );
      return createFactoryState(
        {
          ...current,
          revision: current.revision + 1,
          records: current.records.map((candidate) =>
            candidate.requestDigest === record.requestDigest
              ? terminated
              : candidate,
          ),
          logicalTimeHighWaterMs: input.logicalTimeMs,
          previousStateDigest: current.stateDigest,
        },
        this.options.crypto,
      );
    });
    const terminated = state.records.find(
      (candidate) => candidate.requestDigest === record.requestDigest,
    );
    return {
      terminated: terminated?.status === "terminated",
      receiptDigest: terminated?.terminationReceiptDigest ?? receiptDigest,
    };
  }

  async #authorize(
    request: AgentCreationRequestV1,
    certificate: AgentCreationCertificateV1,
    reading: { readonly wallTime: string; readonly logicalTimeMs: number },
  ): Promise<{
    readonly lineage: AgentLineageStateV1;
    readonly parent: AgentLineageRecordV1;
  }> {
    const policy = await this.#verifyPolicy();
    if (
      request.factoryId !== this.factoryId ||
      certificate.requestDigest !== request.requestDigest ||
      certificate.policyDigest !== policy.policyDigest ||
      certificate.roleDefinitionDigest !== request.roleDefinitionDigest
    )
      fail("governed agent authorization binding is invalid");
    if (
      reading.logicalTimeMs < request.requestedAtLogicalMs ||
      reading.logicalTimeMs >= request.expiresAtLogicalMs ||
      reading.logicalTimeMs < certificate.certifiedAtLogicalMs ||
      reading.logicalTimeMs >= certificate.validUntilLogicalMs ||
      request.expiresAtLogicalMs - request.requestedAtLogicalMs >
        policy.requestTtlLogicalMs
    )
      fail("governed agent authorization expired or is not yet active");
    const lineage = await this.#loadLineage();
    const parent = lineage.agents.find(
      (agent) =>
        agent.agentId === request.parentAgentId && agent.status === "active",
    );
    if (
      !parent ||
      Date.parse(parent.validFrom) > Date.parse(reading.wallTime) ||
      Date.parse(parent.validUntil) <= Date.parse(reading.wallTime)
    )
      fail("governed agent parent is unavailable or its key is not active");
    if (
      certificate.parentLineageDigest !== parent.lineageDigest ||
      request.parentAuthorityDigest !== parent.authorityDigest ||
      (policy.requireRulePolicyInheritance &&
        request.localRuleProgramDigest !== parent.localRuleProgramDigest) ||
      !policy.allowedAdapterIds.includes(request.adapterId) ||
      request.capabilityKeys.some(
        (capability) =>
          !policy.permittedCapabilityKeys.includes(capability) ||
          !parent.capabilityKeys.includes(capability),
      ) ||
      request.resourceBudgetUnits > policy.maximumResourceUnitsPerChild ||
      request.resourceBudgetUnits > parent.resourceBudgetUnits ||
      request.interactionBudgetUnits > policy.maximumInteractionUnitsPerChild ||
      request.interactionBudgetUnits > parent.interactionBudgetUnits ||
      parent.generation + 1 > policy.maximumGeneration
    )
      fail("governed agent request exceeds inherited policy or authority");
    validateLineageQuota(lineage, parent, request, policy);
    if (
      !(await this.options.certification.verify({
        request,
        parent,
        certificate,
        logicalTimeMs: reading.logicalTimeMs,
      })) ||
      (policy.requireAuthorityAttenuation &&
        !(await this.options.certification.verifyAuthorityAttenuation({
          parentAuthorityDigest: parent.authorityDigest,
          childAuthorityDigest: request.proposedAuthorityDigest,
          attenuationDigest: certificate.authorityAttenuationDigest,
        })))
    )
      fail("governed agent certification or authority attenuation is invalid");
    if (
      lineage.agents.some(
        (agent) =>
          agent.agentId === request.requestedAgentId ||
          agent.peerId === request.requestedPeerId ||
          agent.instanceId === request.requestedInstanceId,
      )
    )
      fail("governed agent identity already exists in lineage");
    return { lineage, parent };
  }

  async #loadLineage(): Promise<AgentLineageStateV1> {
    const state = await this.options.lineageStore.load(
      this.options.lineageStateKey,
    );
    if (!state) fail("governed agent lineage is not initialized");
    const lineage = await validateAgentLineageStateV1(
      state,
      this.options.crypto,
    );
    if (
      lineage.stateKey !== this.options.lineageStateKey ||
      lineage.policyDigest !== this.policy.policyDigest
    )
      fail("governed agent lineage binding changed");
    return lineage;
  }

  #matchReplay(
    state: GovernedAgentFactoryStateV1,
    request: AgentCreationRequestV1,
  ) {
    const record = state.records.find(
      (candidate) =>
        candidate.requestId === request.requestId ||
        candidate.requestDigest === request.requestDigest,
    );
    if (record && record.requestDigest !== request.requestDigest)
      fail("governed agent request identity was reused with different content");
    return record;
  }

  #validateFactoryQuotaAndIdentity(
    state: GovernedAgentFactoryStateV1,
    request: AgentCreationRequestV1,
    context: {
      readonly lineage: AgentLineageStateV1;
      readonly parent: AgentLineageRecordV1;
    },
  ): void {
    const managed = state.records.filter(
      (record) =>
        record.status === "reserved" ||
        record.status === "expiring" ||
        record.status === "active",
    );
    if (managed.length >= this.options.maximumManagedAgents)
      fail("governed agent factory quota exceeded");
    if (
      state.records.some(
        (record) =>
          record.agentId === request.requestedAgentId ||
          record.peerId === request.requestedPeerId ||
          record.instanceId === request.requestedInstanceId,
      )
    )
      fail("governed agent factory identity already exists");
    const lineageAgentIds = new Set(
      context.lineage.agents.map((agent) => agent.agentId),
    );
    const unrecorded = managed.filter(
      (record) => !lineageAgentIds.has(record.agentId),
    );
    const reservedChildren = unrecorded.filter(
      (record) => record.parentAgentId === context.parent.agentId,
    );
    const lineageChildren = context.lineage.agents.filter(
      (agent) =>
        agent.parentAgentId === context.parent.agentId &&
        agent.status !== "terminated" &&
        agent.status !== "revoked",
    );
    if (
      lineageChildren.length + reservedChildren.length >=
      this.policy.maximumChildrenPerAgent
    )
      fail("governed agent reserved child quota exceeded");
    const reservedResourceUnits = reservedChildren.reduce(
      (sum, record) => safeAdd(sum, record.resourceBudgetUnits),
      request.resourceBudgetUnits,
    );
    const reservedInteractionUnits = reservedChildren.reduce(
      (sum, record) => safeAdd(sum, record.interactionBudgetUnits),
      request.interactionBudgetUnits,
    );
    const lineageResourceUnits = lineageChildren.reduce(
      (sum, agent) => safeAdd(sum, agent.resourceBudgetUnits),
      0,
    );
    const lineageInteractionUnits = lineageChildren.reduce(
      (sum, agent) => safeAdd(sum, agent.interactionBudgetUnits),
      0,
    );
    if (
      safeAdd(lineageResourceUnits, reservedResourceUnits) >
        context.parent.resourceBudgetUnits ||
      safeAdd(lineageInteractionUnits, reservedInteractionUnits) >
        context.parent.interactionBudgetUnits
    )
      fail("governed agent reserved child budget exceeds parent budget");
    const descendantIds = lineageDescendantIds(
      context.lineage.agents,
      context.parent.agentId,
    );
    const activeDescendants = context.lineage.agents.filter(
      (agent) =>
        descendantIds.has(agent.agentId) &&
        agent.status !== "terminated" &&
        agent.status !== "revoked",
    ).length;
    const reservedDescendants = unrecorded.filter(
      (record) =>
        record.parentAgentId === context.parent.agentId ||
        descendantIds.has(record.parentAgentId),
    ).length;
    if (
      activeDescendants + reservedDescendants >=
      this.policy.maximumActiveDescendants
    )
      fail("governed agent reserved descendant quota exceeded");
  }

  async #readClock() {
    const reading = await this.options.clock.read();
    canonicalInstant(reading.wallTime, "clock.wallTime");
    integer(
      reading.logicalTimeMs,
      "clock.logicalTimeMs",
      0,
      Number.MAX_SAFE_INTEGER,
    );
    return immutable(reading);
  }

  #verifyPolicy(): Promise<AgentCreationPolicyV1> {
    this.#policyVerification ??= verifyAgentCreationPolicyV1(
      this.options.policy,
      this.options.crypto,
    );
    return this.#policyVerification;
  }

  async #commit(
    logicalTimeMs: number,
    mutate: (
      state: GovernedAgentFactoryStateV1,
    ) => Promise<GovernedAgentFactoryStateV1>,
  ): Promise<GovernedAgentFactoryStateV1> {
    for (
      let attempt = 0;
      attempt < this.policy.maximumCommitAttempts;
      attempt += 1
    ) {
      const current = await this.load();
      if (logicalTimeMs < current.logicalTimeHighWaterMs)
        fail("governed agent factory logical time rollback");
      const next = await mutate(current);
      if (next === current) return current;
      if (await this.#store.save(next, current.revision)) return next;
    }
    fail("governed agent factory commit attempts exhausted");
  }
}

export async function validateGovernedAgentFactoryStateV1(
  input: GovernedAgentFactoryStateV1,
  crypto?: Crypto,
): Promise<GovernedAgentFactoryStateV1> {
  if (!input || input.schemaVersion !== 1)
    fail("governed agent factory state schema is invalid");
  identifier(input.stateKey, "stateKey");
  identifier(input.factoryId, "factoryId");
  integer(input.factoryVersion, "factoryVersion", 1, Number.MAX_SAFE_INTEGER);
  digest(input.factoryImplementationDigest, "factoryImplementationDigest");
  digest(input.policyDigest, "policyDigest");
  integer(input.revision, "revision", 0, Number.MAX_SAFE_INTEGER);
  integer(
    input.logicalTimeHighWaterMs,
    "logicalTimeHighWaterMs",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  if ((input.revision === 0) !== (input.previousStateDigest === null))
    fail("governed agent factory state history is invalid");
  if (input.previousStateDigest !== null)
    digest(input.previousStateDigest, "previousStateDigest");
  const identities = new Set<string>();
  const requests = new Set<string>();
  for (const record of input.records) {
    const { recordDigest, ...body } = record;
    const rebuilt = await createFactoryRecord(body, crypto);
    if (rebuilt.recordDigest !== recordDigest)
      fail("governed agent factory record digest is invalid");
    for (const value of [record.agentId, record.peerId, record.instanceId]) {
      if (identities.has(value))
        fail("governed agent factory identity is duplicated");
      identities.add(value);
    }
    if (requests.has(record.requestId) || requests.has(record.requestDigest))
      fail("governed agent factory request is duplicated");
    requests.add(record.requestId);
    requests.add(record.requestDigest);
    if (
      record.createdAtLogicalMs > input.logicalTimeHighWaterMs ||
      (record.cleanupStartedAtLogicalMs !== null &&
        record.cleanupStartedAtLogicalMs !== undefined &&
        record.cleanupStartedAtLogicalMs > input.logicalTimeHighWaterMs) ||
      (record.terminatedAtLogicalMs !== null &&
        record.terminatedAtLogicalMs > input.logicalTimeHighWaterMs)
    )
      fail("governed agent factory record exceeds state logical time");
    if (record.receipt) {
      const receipt = await validateAgentFactoryReceiptV1(
        record.receipt,
        crypto,
      );
      if (
        receipt.factoryId !== input.factoryId ||
        receipt.factoryVersion !== input.factoryVersion ||
        receipt.factoryImplementationDigest !==
          input.factoryImplementationDigest
      )
        fail(
          "governed agent factory receipt implementation binding is invalid",
        );
      const runtimeAttestationDigest = await collectiveMembershipDigestV1(
        {
          domain: "governed-agent-runtime-attestation-v1",
          body: {
            requestDigest: record.requestDigest,
            certificateDigest: record.certificateDigest,
            parentLineageDigest: record.parentLineageDigest,
            factoryImplementationDigest: input.factoryImplementationDigest,
            identityAttestationDigest: record.identityAttestationDigest,
            keyAttestationDigest: record.keyAttestationDigest,
          },
        },
        crypto,
      );
      if (receipt.runtimeAttestationDigest !== runtimeAttestationDigest)
        fail("governed agent runtime attestation binding is invalid");
    }
  }
  const { stateDigest, ...body } = input;
  digest(stateDigest, "stateDigest");
  if (
    (await collectiveMembershipDigestV1(
      { domain: "governed-agent-factory-state-v1", body },
      crypto,
    )) !== stateDigest
  )
    fail("governed agent factory state digest is invalid");
  return immutable(input);
}

async function createFactoryRecord(
  input: Omit<GovernedAgentFactoryRecordV1, "recordDigest">,
  crypto?: Crypto,
): Promise<GovernedAgentFactoryRecordV1> {
  const { recordDigest: _stale, ...body } =
    input as GovernedAgentFactoryRecordV1;
  validateFactoryRecordBody(body);
  return immutable({
    ...body,
    recordDigest: await collectiveMembershipDigestV1(
      { domain: "governed-agent-factory-record-v1", body },
      crypto,
    ),
  });
}

async function createFactoryState(
  input: Omit<GovernedAgentFactoryStateV1, "stateDigest">,
  crypto?: Crypto,
): Promise<GovernedAgentFactoryStateV1> {
  const { stateDigest: _stale, ...body } = input as GovernedAgentFactoryStateV1;
  return immutable({
    ...body,
    stateDigest: await collectiveMembershipDigestV1(
      { domain: "governed-agent-factory-state-v1", body },
      crypto,
    ),
  });
}

function validateFactoryRecordBody(
  input: Omit<GovernedAgentFactoryRecordV1, "recordDigest">,
): void {
  if (input.schemaVersion !== 1)
    fail("governed agent factory record schema is invalid");
  for (const [label, value] of Object.entries({
    requestId: input.requestId,
    parentAgentId: input.parentAgentId,
    agentId: input.agentId,
    peerId: input.peerId,
    instanceId: input.instanceId,
    adapterId: input.adapterId,
  }))
    identifier(value, label);
  for (const [label, value] of Object.entries({
    requestDigest: input.requestDigest,
    certificateDigest: input.certificateDigest,
    parentLineageDigest: input.parentLineageDigest,
    authorityDigest: input.authorityDigest,
  }))
    digest(value, label);
  canonicalIdentifiers(input.capabilityKeys, "capabilityKeys");
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
    input.createdAtLogicalMs,
    "createdAtLogicalMs",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  integer(
    input.expiresAtLogicalMs,
    "expiresAtLogicalMs",
    input.createdAtLogicalMs + 1,
    Number.MAX_SAFE_INTEGER,
  );
  const hasProvisioningWallTime =
    input.provisioningWallTime !== null &&
    input.provisioningWallTime !== undefined;
  const hasProvisioningValidUntil =
    input.provisioningValidUntil !== null &&
    input.provisioningValidUntil !== undefined;
  if (hasProvisioningWallTime !== hasProvisioningValidUntil)
    fail("governed agent factory provisioning plan is incomplete");
  if (hasProvisioningWallTime && hasProvisioningValidUntil) {
    canonicalInstant(input.provisioningWallTime!, "provisioningWallTime");
    canonicalInstant(input.provisioningValidUntil!, "provisioningValidUntil");
    if (
      Date.parse(input.provisioningValidUntil!) <=
      Date.parse(input.provisioningWallTime!)
    )
      fail("governed agent factory provisioning interval is invalid");
  }
  if (
    !["reserved", "expiring", "active", "terminated", "expired"].includes(
      input.status,
    )
  )
    fail("governed agent factory record status is invalid");
  const materialValues = [
    input.identityHandle,
    input.keyHandle,
    input.identityAttestationDigest,
    input.keyAttestationDigest,
    input.receipt,
  ];
  const hasAnyMaterial = materialValues.some((value) => value !== null);
  const hasAllMaterial = materialValues.every((value) => value !== null);
  if (
    (hasAnyMaterial && !hasAllMaterial) ||
    ((input.status === "active" || input.status === "terminated") &&
      !hasAllMaterial) ||
    (input.status === "reserved" && hasAnyMaterial)
  )
    fail("governed agent factory materialization binding is invalid");
  if (input.identityHandle !== null)
    token(input.identityHandle, "identityHandle");
  if (input.keyHandle !== null) token(input.keyHandle, "keyHandle");
  if (input.identityAttestationDigest !== null)
    digest(input.identityAttestationDigest, "identityAttestationDigest");
  if (input.keyAttestationDigest !== null)
    digest(input.keyAttestationDigest, "keyAttestationDigest");
  const terminal = input.status === "terminated" || input.status === "expired";
  const expiring = input.status === "expiring" || input.status === "expired";
  const hasCleanupStartedAt =
    input.cleanupStartedAtLogicalMs !== null &&
    input.cleanupStartedAtLogicalMs !== undefined;
  if (expiring !== hasCleanupStartedAt)
    fail("governed agent factory cleanup fence binding is invalid");
  if (hasCleanupStartedAt)
    integer(
      input.cleanupStartedAtLogicalMs,
      "cleanupStartedAtLogicalMs",
      input.createdAtLogicalMs,
      Number.MAX_SAFE_INTEGER,
    );
  if (
    terminal !==
    (input.terminatedAtLogicalMs !== null &&
      input.terminationReceiptDigest !== null)
  )
    fail("governed agent factory terminal binding is invalid");
  if (input.terminatedAtLogicalMs !== null)
    integer(
      input.terminatedAtLogicalMs,
      "terminatedAtLogicalMs",
      input.createdAtLogicalMs,
      Number.MAX_SAFE_INTEGER,
    );
  if (input.terminationReceiptDigest !== null)
    digest(input.terminationReceiptDigest, "terminationReceiptDigest");
  if (
    input.receipt &&
    (input.receipt.requestDigest !== input.requestDigest ||
      input.receipt.agentId !== input.agentId ||
      input.receipt.peerId !== input.peerId ||
      input.receipt.instanceId !== input.instanceId)
  )
    fail("governed agent factory receipt binding is invalid");
  if (
    input.receipt &&
    hasProvisioningWallTime &&
    (input.receipt.validFrom !== input.provisioningWallTime ||
      input.receipt.validUntil !== input.provisioningValidUntil)
  )
    fail("governed agent factory receipt provisioning interval changed");
}

function validateGeneratedKey(
  key: Awaited<ReturnType<GovernedAgentKeyCustodyPortV1["generateEd25519"]>>,
  validFrom: string,
  validUntil: string,
): void {
  token(key.keyHandle, "keyHandle");
  identifier(key.publicKeyId, "publicKeyId");
  token(key.publicKey, "publicKey");
  if (
    key.keyAlgorithm !== "Ed25519" ||
    key.validFrom !== validFrom ||
    key.validUntil !== validUntil
  )
    fail("governed agent generated key binding is invalid");
  digest(key.keyAttestationDigest, "keyAttestationDigest");
}

function validateRecordAgainstAgent(
  record: GovernedAgentFactoryRecordV1,
  agent: AgentLineageRecordV1,
): void {
  if (
    !record.receipt ||
    record.agentId !== agent.agentId ||
    record.peerId !== agent.peerId ||
    record.instanceId !== agent.instanceId ||
    record.authorityDigest !== agent.authorityDigest ||
    record.certificateDigest !== agent.creationCertificateDigest ||
    record.receipt.publicKeyId !== agent.publicKeyId ||
    record.receipt.publicKey !== agent.publicKey
  )
    fail("governed agent factory record differs from lineage");
}

function validateLineageQuota(
  lineage: AgentLineageStateV1,
  parent: AgentLineageRecordV1,
  request: AgentCreationRequestV1,
  policy: AgentCreationPolicyV1,
): void {
  const children = lineage.agents.filter(
    (agent) =>
      agent.parentAgentId === parent.agentId &&
      agent.status !== "terminated" &&
      agent.status !== "revoked",
  );
  if (children.length >= policy.maximumChildrenPerAgent)
    fail("governed agent child quota exceeded");
  const resourceUnits = children.reduce(
    (sum, child) => safeAdd(sum, child.resourceBudgetUnits),
    request.resourceBudgetUnits,
  );
  const interactionUnits = children.reduce(
    (sum, child) => safeAdd(sum, child.interactionBudgetUnits),
    request.interactionBudgetUnits,
  );
  if (
    resourceUnits > parent.resourceBudgetUnits ||
    interactionUnits > parent.interactionBudgetUnits
  )
    fail("governed agent aggregate child budget exceeds parent budget");
  const descendants = lineageDescendantIds(lineage.agents, parent.agentId);
  const active = lineage.agents.filter(
    (agent) =>
      descendants.has(agent.agentId) &&
      agent.status !== "terminated" &&
      agent.status !== "revoked",
  ).length;
  if (active >= policy.maximumActiveDescendants)
    fail("governed agent descendant quota exceeded");
}

function lineageDescendantIds(
  agents: readonly AgentLineageRecordV1[],
  parentAgentId: string,
): ReadonlySet<string> {
  const descendants = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const agent of agents)
      if (
        agent.parentAgentId &&
        (agent.parentAgentId === parentAgentId ||
          descendants.has(agent.parentAgentId)) &&
        !descendants.has(agent.agentId)
      ) {
        descendants.add(agent.agentId);
        changed = true;
      }
  }
  return descendants;
}

function canonicalIdentifiers(values: readonly string[], label: string): void {
  if (!Array.isArray(values) || values.length > 100_000)
    fail(`${label} is invalid`);
  values.forEach((value) => identifier(value, label));
  const canonical = [...new Set(values)].sort();
  if (
    canonical.length !== values.length ||
    canonical.some((value, index) => value !== values[index])
  )
    fail(`${label} is not canonical`);
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
    fail(`${label} is not a canonical instant`);
}

function identifier(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u.test(value)
  )
    fail(`${label} is invalid`);
}

function token(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 4_096 ||
    /[\u0000-\u001f]/u.test(value)
  )
    fail(`${label} is invalid`);
}

function digest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value))
    fail(`${label} is invalid`);
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
    fail(`${label} is invalid`);
  return value as number;
}

function safeAdd(left: number, right: number): number {
  return integer(
    left + right,
    "aggregateBudgetUnits",
    0,
    Number.MAX_SAFE_INTEGER,
  );
}

function immutable<T>(value: T): T {
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
