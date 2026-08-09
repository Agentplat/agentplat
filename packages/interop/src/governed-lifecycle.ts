import type {
  AgentCreationCertificateV1,
  AgentCreationRequestV1,
  AgentLineageRecordV1,
} from "@agentplat/collective-membership";
import type { JsonValue } from "@agentplat/core";
import {
  invokeGovernedAgentLifecycleCreateAndEnrollV1,
  invokeGovernedAgentLifecycleEligibilityV1,
  invokeGovernedAgentLifecycleRetirePeerV1,
  isGovernedAgentLifecycleRuntimeV1,
  type GovernedAgentEligibilityDecisionV1,
  type GovernedAgentLifecycleRuntimeV1,
} from "@agentplat/collective-membership/governed-agent-lifecycle";
import {
  InMemoryInteropOutboundSequenceStoreV1,
  InteropClientV1,
  InteropEndpointRouterV1,
  InteropPortableAgentAdapterV1,
  captureInteropDigestCryptoV1,
  interopClientIdV1,
  interopDigestV1,
  invokeInteropClientNegotiateV1,
  invokeInteropEndpointRouterHandleV1,
  isInteropClientV1,
  snapshotInteropEndpointManifestV1,
  snapshotInteropRequestEnvelopeV1,
  validateInteropEndpointManifestV1,
  type InteropEndpointManifestV1,
  type InteropEnvelopeAuthenticityPortV1,
  type InteropOperationV1,
  type InteropOperationHandlerV1,
  type InteropOutboundSequenceStoreV1,
  type InteropPayloadSchemaResolverV1,
  type InteropRequestAdmissionGrantV1,
  type InteropRequestAdmissionPortV1,
  type InteropRequestEnvelopeV1,
  type InteropResponseEnvelopeV1,
  type RestartDurableInteropRouterStoresV1,
} from "./index.js";

export const GOVERNED_INTEROP_SESSION_RECORD_FORMAT_V1 =
  "agentplat-interop/governed-session-record/1" as const;

export interface InteropCapabilityBindingV1 {
  readonly operation: InteropOperationV1;
  readonly capabilityKey: string;
}

export interface InteropCapabilityProfileV1 {
  readonly schemaVersion: 1;
  readonly profileId: string;
  readonly profileVersion: number;
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly endpointId: string;
  readonly endpointVersion: string;
  readonly implementationId: string;
  readonly allowedEndpointKinds: readonly InteropEndpointManifestV1["endpointKind"][];
  readonly requiredOperations: readonly InteropOperationV1[];
  readonly operationCapabilities: readonly InteropCapabilityBindingV1[];
  readonly requireCancellation: boolean;
  readonly requireDeterministicReplay: boolean;
  readonly requireCheckpoint: boolean;
  readonly requireRequestSignature: boolean;
  readonly requireResponseSignature: boolean;
  readonly profileDigest: string;
}

export type InteropCapabilityProfileInputV1 = Omit<
  InteropCapabilityProfileV1,
  "schemaVersion" | "profileDigest"
>;

export interface InteropRoleProfileV1 {
  readonly schemaVersion: 1;
  readonly profileId: string;
  readonly profileVersion: number;
  readonly roleDefinitionDigest: string;
  readonly allowedCapabilityProfileDigests: readonly string[];
  readonly requiredCapabilityKeys: readonly string[];
  readonly profileDigest: string;
}

export type InteropRoleProfileInputV1 = Omit<
  InteropRoleProfileV1,
  "schemaVersion" | "profileDigest"
>;

export type GovernedInteropSessionStatusV1 = "prepared" | "active" | "retired";

export interface GovernedInteropSessionRecordV1 {
  readonly format: typeof GOVERNED_INTEROP_SESSION_RECORD_FORMAT_V1;
  readonly schemaVersion: 1;
  readonly recordKey: string;
  readonly admissionId: string;
  readonly sessionId: string;
  /** Authenticated interop caller allowed to use this governed session. */
  readonly issuerId: string;
  readonly requestDigest: string;
  readonly agentId: string;
  readonly peerId: string;
  readonly instanceId: string;
  readonly endpointId: string;
  readonly manifestDigest: string;
  readonly capabilityProfileDigest: string;
  readonly roleProfileDigest: string;
  readonly status: GovernedInteropSessionStatusV1;
  readonly revision: number;
  readonly membershipConfigurationDigest: string | null;
  readonly membershipEpoch: number | null;
  readonly lineageDigest: string | null;
  readonly retirementDigest: string | null;
  readonly retiredAtLogicalMs: number | null;
  readonly logicalTimeHighWaterMs: number;
  readonly predecessorRecordDigest: string | null;
  readonly recordDigest: string;
}

/** Durable implementations must provide atomic compare-and-set semantics. */
export interface GovernedInteropSessionStoreV1 {
  load(recordKey: string): Promise<GovernedInteropSessionRecordV1 | null>;
  compareAndSet(input: {
    readonly recordKey: string;
    readonly expectedRevision: number | null;
    readonly expectedRecordDigest: string | null;
    readonly next: GovernedInteropSessionRecordV1;
  }): Promise<boolean>;
}

export class InMemoryGovernedInteropSessionStoreV1 implements GovernedInteropSessionStoreV1 {
  readonly #records = new Map<string, GovernedInteropSessionRecordV1>();

  async load(
    recordKey: string,
  ): Promise<GovernedInteropSessionRecordV1 | null> {
    return this.#records.get(recordKey) ?? null;
  }

  async compareAndSet(input: {
    readonly recordKey: string;
    readonly expectedRevision: number | null;
    readonly expectedRecordDigest: string | null;
    readonly next: GovernedInteropSessionRecordV1;
  }): Promise<boolean> {
    const current = this.#records.get(input.recordKey) ?? null;
    if (
      (current?.revision ?? null) !== input.expectedRevision ||
      (current?.recordDigest ?? null) !== input.expectedRecordDigest ||
      input.next.recordKey !== input.recordKey ||
      input.next.revision !== (current?.revision ?? -1) + 1 ||
      input.next.predecessorRecordDigest !== (current?.recordDigest ?? null)
    )
      return false;
    this.#records.set(input.recordKey, input.next);
    return true;
  }
}

/**
 * Structural lifecycle adapter for non-authoritative integration utilities.
 * Authoritative governed interop classes require the concrete nominal runtime.
 */
export interface NonAuthoritativeInteropLifecyclePortV1 {
  createAndEnroll(
    input: Parameters<GovernedAgentLifecycleRuntimeV1["createAndEnroll"]>[0],
  ): ReturnType<GovernedAgentLifecycleRuntimeV1["createAndEnroll"]>;
  eligibility(
    input: Parameters<GovernedAgentLifecycleRuntimeV1["eligibility"]>[0],
  ): ReturnType<GovernedAgentLifecycleRuntimeV1["eligibility"]>;
  retirePeer(
    input: Parameters<GovernedAgentLifecycleRuntimeV1["retirePeer"]>[0],
  ): ReturnType<GovernedAgentLifecycleRuntimeV1["retirePeer"]>;
}

/** @deprecated Use `NonAuthoritativeInteropLifecyclePortV1` for non-authoritative adapters. */
export type GovernedInteropLifecyclePortV1 =
  NonAuthoritativeInteropLifecyclePortV1;

export interface GovernedInteropAdmissionRequestV1 {
  readonly admissionId: string;
  readonly sessionId: string;
  readonly request: AgentCreationRequestV1;
  readonly certificate: AgentCreationCertificateV1;
  readonly activeKeyProof: Parameters<
    GovernedAgentLifecycleRuntimeV1["createAndEnroll"]
  >[0]["activeKeyProof"];
  readonly logicalTimeMs: number;
  readonly signal?: AbortSignal;
}

export interface GovernedInteropActiveSessionV1 {
  readonly record: GovernedInteropSessionRecordV1;
  readonly manifest: InteropEndpointManifestV1;
  readonly agent: AgentLineageRecordV1;
  /** Every method performs a fresh lifecycle and session-record eligibility check. */
  readonly adapter: InteropPortableAgentAdapterV1;
}

export interface GovernedInteropRetirementV1 {
  readonly record: GovernedInteropSessionRecordV1;
  readonly retired: true;
  readonly peerId: string;
  readonly membershipConfigurationDigest: string;
  readonly membershipEpoch: number;
  readonly retirementDigest: string;
  readonly retiredAtLogicalMs: number;
}

export interface GovernedInteropLifecycleOptionsV1 {
  readonly client: InteropClientV1;
  readonly lifecycle: GovernedAgentLifecycleRuntimeV1;
  readonly capabilityProfile: InteropCapabilityProfileV1;
  readonly roleProfile: InteropRoleProfileV1;
  readonly store?: GovernedInteropSessionStoreV1;
  readonly outboundSequences?: InteropOutboundSequenceStoreV1;
  /**
   * Optional authoritative endpoint manifest. The complete manifest is
   * validated before any session or agent lifecycle side effect.
   */
  readonly expectedManifest?: InteropEndpointManifestV1;
  readonly maximumCommitAttempts?: number;
  readonly crypto?: Crypto;
}

const governedInteropLifecycleInvokersV1 = new WeakMap<
  object,
  {
    readonly createAndEnroll: (
      input: GovernedInteropAdmissionRequestV1,
    ) => Promise<GovernedInteropActiveSessionV1>;
    readonly openSession: (
      sessionId: string,
      signal?: AbortSignal,
    ) => Promise<GovernedInteropActiveSessionV1>;
    readonly retire: (
      input: Parameters<GovernedInteropLifecycleV1["retire"]>[0],
    ) => Promise<GovernedInteropRetirementV1>;
  }
>();

/**
 * Negotiates an interop endpoint and activates it only through the governed
 * lineage and membership lifecycle. The session adapter remains lifecycle
 * gated for every portable-agent operation.
 */
export class GovernedInteropLifecycleV1 {
  readonly store: GovernedInteropSessionStoreV1;
  readonly #maximumCommitAttempts: number;
  readonly #client: InteropClientV1;
  readonly #clientId: string;
  readonly #negotiate: InteropClientV1["negotiate"];
  readonly #lifecycle: GovernedAgentLifecycleRuntimeV1;
  readonly #capabilityProfile: InteropCapabilityProfileV1;
  readonly #roleProfile: InteropRoleProfileV1;
  readonly #store: GovernedInteropSessionStoreV1;
  readonly #storeLoad: GovernedInteropSessionStoreV1["load"];
  readonly #storeCompareAndSet: GovernedInteropSessionStoreV1["compareAndSet"];
  readonly #outboundSequences: InteropOutboundSequenceStoreV1;
  readonly #expectedManifest: InteropEndpointManifestV1 | null;
  readonly #crypto: Crypto | undefined;

  constructor(readonly options: GovernedInteropLifecycleOptionsV1) {
    const client = options.client;
    const lifecycle = options.lifecycle;
    const capabilityProfile = options.capabilityProfile;
    const roleProfile = options.roleProfile;
    const configuredStore = options.store;
    const configuredOutboundSequences = options.outboundSequences;
    const expectedManifest = options.expectedManifest;
    const crypto = captureInteropDigestCryptoV1(
      options.crypto ?? globalThis.crypto,
    );
    const maximumCommitAttempts = options.maximumCommitAttempts;
    const configuredStoreLoad = configuredStore?.load;
    const configuredStoreCompareAndSet = configuredStore?.compareAndSet;
    const configuredSequenceNext = configuredOutboundSequences?.next;
    const configuredSequenceCurrent = configuredOutboundSequences?.current;
    if (!isInteropClientV1(client))
      throw new TypeError("concrete governed interop client is required");
    if (!isGovernedAgentLifecycleRuntimeV1(lifecycle))
      throw new TypeError(
        "concrete governed agent lifecycle runtime is required",
      );
    if (
      configuredStore &&
      (typeof configuredStoreLoad !== "function" ||
        typeof configuredStoreCompareAndSet !== "function")
    )
      throw new TypeError("governed interop session store is invalid");
    if (
      configuredOutboundSequences &&
      (typeof configuredSequenceNext !== "function" ||
        typeof configuredSequenceCurrent !== "function")
    )
      throw new TypeError(
        "governed interop outbound sequence store is invalid",
      );
    this.#client = client;
    this.#clientId = interopClientIdV1(client);
    this.#negotiate = (signal) =>
      invokeInteropClientNegotiateV1(client, signal);
    this.#lifecycle = lifecycle;
    this.#capabilityProfile = freeze(capabilityProfile);
    this.#roleProfile = freeze(roleProfile);
    this.#store =
      configuredStore ?? new InMemoryGovernedInteropSessionStoreV1();
    const storeLoad = configuredStoreLoad ?? this.#store.load;
    const storeCompareAndSet =
      configuredStoreCompareAndSet ?? this.#store.compareAndSet;
    this.#storeLoad = storeLoad.bind(this.#store);
    this.#storeCompareAndSet = storeCompareAndSet.bind(this.#store);
    const outboundSequences =
      configuredOutboundSequences ??
      new InMemoryInteropOutboundSequenceStoreV1();
    const sequenceNext = configuredSequenceNext ?? outboundSequences.next;
    const sequenceCurrent =
      configuredSequenceCurrent ?? outboundSequences.current;
    this.#outboundSequences = Object.freeze({
      next: (input: Parameters<InteropOutboundSequenceStoreV1["next"]>[0]) =>
        sequenceNext.call(outboundSequences, input),
      current: (
        input: Parameters<InteropOutboundSequenceStoreV1["current"]>[0],
      ) => sequenceCurrent.call(outboundSequences, input),
    });
    this.#expectedManifest = expectedManifest
      ? snapshotInteropEndpointManifestV1(expectedManifest)
      : null;
    this.store = this.#store;
    this.#crypto = crypto;
    this.#maximumCommitAttempts = boundedInteger(
      maximumCommitAttempts ?? 8,
      "maximumCommitAttempts",
      1,
      1_000,
    );
    Object.defineProperty(this, "store", {
      value: this.#store,
      writable: false,
      configurable: false,
      enumerable: true,
    });
    Object.defineProperty(this, "options", {
      value: Object.freeze({
        client: this.#client,
        lifecycle: this.#lifecycle,
        capabilityProfile: this.#capabilityProfile,
        roleProfile: this.#roleProfile,
        store: this.#store,
        outboundSequences: this.#outboundSequences,
        ...(this.#expectedManifest
          ? { expectedManifest: this.#expectedManifest }
          : {}),
        maximumCommitAttempts: this.#maximumCommitAttempts,
        ...(this.#crypto ? { crypto: this.#crypto } : {}),
      }),
      writable: false,
      configurable: false,
      enumerable: true,
    });
    const invokers = Object.freeze({
      createAndEnroll: (input: GovernedInteropAdmissionRequestV1) =>
        this.#createAndEnroll(input),
      openSession: (sessionId: string, signal?: AbortSignal) =>
        this.#openSession(sessionId, signal),
      retire: (input: Parameters<GovernedInteropLifecycleV1["retire"]>[0]) =>
        this.#retire(input),
    });
    governedInteropLifecycleInvokersV1.set(this, invokers);
    Object.defineProperties(this, {
      createAndEnroll: immutableMethod(invokers.createAndEnroll),
      openSession: immutableMethod(invokers.openSession),
      retire: immutableMethod(invokers.retire),
    });
  }

  createAndEnroll(
    input: GovernedInteropAdmissionRequestV1,
  ): Promise<GovernedInteropActiveSessionV1> {
    return this.#createAndEnroll(input);
  }

  async #createAndEnroll(
    input: GovernedInteropAdmissionRequestV1,
  ): Promise<GovernedInteropActiveSessionV1> {
    input = snapshotAdmissionInput(input);
    const [capabilityProfile, roleProfile, manifest] = await Promise.all([
      validateInteropCapabilityProfileV1(this.#capabilityProfile, this.#crypto),
      validateInteropRoleProfileV1(this.#roleProfile, this.#crypto),
      this.#negotiate(input.signal),
    ]);
    await this.#assertExpectedManifest(manifest);
    validateAdmissionBindings(
      input.request,
      manifest,
      capabilityProfile,
      roleProfile,
    );
    const recordKey = governedInteropSessionRecordKeyV1(input.sessionId);
    let record = await this.#storeLoad(recordKey);
    if (record) {
      record = await validateSessionRecordV1(record, this.#crypto);
      assertAdmissionReplay(
        record,
        input,
        manifest,
        capabilityProfile,
        roleProfile,
        this.#clientId,
      );
      if (record.status === "retired")
        throw new Error("governed interop session is retired");
      if (record.status === "active")
        return this.#activeSession(record, manifest, capabilityProfile);
    } else {
      const prepared = await createSessionRecordV1(
        {
          recordKey,
          admissionId: input.admissionId,
          sessionId: input.sessionId,
          issuerId: this.#clientId,
          requestDigest: input.request.requestDigest,
          agentId: input.request.requestedAgentId,
          peerId: input.request.requestedPeerId,
          instanceId: input.request.requestedInstanceId,
          endpointId: manifest.endpointId,
          manifestDigest: manifest.manifestDigest,
          capabilityProfileDigest: capabilityProfile.profileDigest,
          roleProfileDigest: roleProfile.profileDigest,
          status: "prepared",
          revision: 0,
          membershipConfigurationDigest: null,
          membershipEpoch: null,
          lineageDigest: null,
          retirementDigest: null,
          retiredAtLogicalMs: null,
          logicalTimeHighWaterMs: input.logicalTimeMs,
          predecessorRecordDigest: null,
        },
        this.#crypto,
      );
      const committed = await this.#storeCompareAndSet({
        recordKey,
        expectedRevision: null,
        expectedRecordDigest: null,
        next: prepared,
      });
      if (typeof committed !== "boolean")
        throw new TypeError("governed interop session CAS result is invalid");
      if (!committed) {
        record = await this.#storeLoad(recordKey);
        if (!record) throw new Error("governed interop admission CAS conflict");
        record = await validateSessionRecordV1(record, this.#crypto);
        assertAdmissionReplay(
          record,
          input,
          manifest,
          capabilityProfile,
          roleProfile,
          this.#clientId,
        );
      } else record = prepared;
    }

    const before = await invokeGovernedAgentLifecycleEligibilityV1(
      this.#lifecycle,
      {
        peerId: input.request.requestedPeerId,
        instanceId: input.request.requestedInstanceId,
      },
    );
    let agent: AgentLineageRecordV1;
    if (before.eligible) {
      agent = requireEligibleAgent(before, input.request);
    } else {
      if (before.agent)
        throw new Error(
          "governed interop admission requires lifecycle reconciliation",
        );
      agent = await invokeGovernedAgentLifecycleCreateAndEnrollV1(
        this.#lifecycle,
        {
          request: input.request,
          certificate: input.certificate,
          activeKeyProof: input.activeKeyProof,
          logicalTimeMs: input.logicalTimeMs,
          ...(input.signal ? { signal: input.signal } : {}),
        },
      );
      assertAgentBinding(agent, input.request);
    }
    const eligible = await invokeGovernedAgentLifecycleEligibilityV1(
      this.#lifecycle,
      {
        peerId: agent.peerId,
        instanceId: agent.instanceId,
      },
    );
    requireEligibleAgent(eligible, input.request);
    record = await this.#activateRecord(record!, agent, input.logicalTimeMs);
    return this.#activeSession(record, manifest, capabilityProfile);
  }

  openSession(
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<GovernedInteropActiveSessionV1> {
    return this.#openSession(sessionId, signal);
  }

  async #openSession(
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<GovernedInteropActiveSessionV1> {
    identifier(sessionId, "sessionId");
    const [capabilityProfile, roleProfile, manifest] = await Promise.all([
      validateInteropCapabilityProfileV1(this.#capabilityProfile, this.#crypto),
      validateInteropRoleProfileV1(this.#roleProfile, this.#crypto),
      this.#negotiate(signal),
    ]);
    await this.#assertExpectedManifest(manifest);
    const stored = await this.#storeLoad(
      governedInteropSessionRecordKeyV1(sessionId),
    );
    if (!stored)
      throw new Error("governed interop active session is unavailable");
    const record = await validateSessionRecordV1(stored, this.#crypto);
    assertOwnedSessionRecord(record, sessionId, this.#clientId);
    if (record.status !== "active")
      throw new Error("governed interop active session is unavailable");
    if (
      record.manifestDigest !== manifest.manifestDigest ||
      record.capabilityProfileDigest !== capabilityProfile.profileDigest ||
      record.roleProfileDigest !== roleProfile.profileDigest
    )
      throw new Error("governed interop session binding changed");
    return this.#activeSession(record, manifest, capabilityProfile);
  }

  retire(input: {
    readonly sessionId: string;
    readonly reasonCode: string;
    readonly cascade: boolean;
    readonly logicalTimeMs: number;
  }): Promise<GovernedInteropRetirementV1> {
    return this.#retire(input);
  }

  async #retire(input: {
    readonly sessionId: string;
    readonly reasonCode: string;
    readonly cascade: boolean;
    readonly logicalTimeMs: number;
  }): Promise<GovernedInteropRetirementV1> {
    identifier(input.sessionId, "sessionId");
    identifier(input.reasonCode, "reasonCode");
    boundedInteger(
      input.logicalTimeMs,
      "logicalTimeMs",
      0,
      Number.MAX_SAFE_INTEGER,
    );
    if (typeof input.cascade !== "boolean")
      throw new TypeError("cascade is invalid");
    input = Object.freeze({
      sessionId: input.sessionId,
      reasonCode: input.reasonCode,
      cascade: input.cascade,
      logicalTimeMs: input.logicalTimeMs,
    });
    const recordKey = governedInteropSessionRecordKeyV1(input.sessionId);
    let record = await this.#storeLoad(recordKey);
    if (!record) throw new Error("governed interop session is unknown");
    record = await validateSessionRecordV1(record, this.#crypto);
    assertOwnedSessionRecord(record, input.sessionId, this.#clientId);
    if (record.status === "retired") return retirementFromRecord(record);
    if (record.status !== "active")
      throw new Error("governed interop session is not active");
    const retired = await invokeGovernedAgentLifecycleRetirePeerV1(
      this.#lifecycle,
      {
        peerId: record.peerId,
        reasonCode: input.reasonCode,
        cascade: input.cascade,
        logicalTimeMs: input.logicalTimeMs,
      },
    );
    for (let attempt = 0; attempt < this.#maximumCommitAttempts; attempt += 1) {
      const stored = await this.#storeLoad(recordKey);
      if (!stored) throw new Error("governed interop session disappeared");
      const current = await validateSessionRecordV1(stored, this.#crypto);
      if (current.status === "retired") return retirementFromRecord(current);
      if (
        current.status !== "active" ||
        current.recordDigest !== record.recordDigest
      )
        throw new Error("governed interop retirement state changed");
      const next = await createSessionRecordV1(
        {
          ...current,
          status: "retired",
          revision: current.revision + 1,
          membershipConfigurationDigest: retired.membershipConfigurationDigest,
          membershipEpoch: retired.membershipEpoch,
          retirementDigest: retired.retirementDigest,
          retiredAtLogicalMs: retired.retiredAtLogicalMs,
          logicalTimeHighWaterMs: Math.max(
            current.logicalTimeHighWaterMs,
            retired.retiredAtLogicalMs,
          ),
          predecessorRecordDigest: current.recordDigest,
          recordDigest: undefined,
        },
        this.#crypto,
      );
      const committed = await this.#storeCompareAndSet({
        recordKey,
        expectedRevision: current.revision,
        expectedRecordDigest: current.recordDigest,
        next,
      });
      if (typeof committed !== "boolean")
        throw new TypeError("governed interop session CAS result is invalid");
      if (committed) return retirementFromRecord(next);
      record = current;
    }
    throw new Error("governed interop retirement CAS retry exhausted");
  }

  async #activateRecord(
    prepared: GovernedInteropSessionRecordV1,
    agent: AgentLineageRecordV1,
    logicalTimeMs: number,
  ): Promise<GovernedInteropSessionRecordV1> {
    for (let attempt = 0; attempt < this.#maximumCommitAttempts; attempt += 1) {
      const stored = await this.#storeLoad(prepared.recordKey);
      if (!stored)
        throw new Error("governed interop admission record disappeared");
      const current = await validateSessionRecordV1(stored, this.#crypto);
      if (current.status === "active") {
        if (current.lineageDigest !== agent.lineageDigest)
          throw new Error("governed interop active lineage conflicts");
        return current;
      }
      if (current.status !== "prepared")
        throw new Error("governed interop admission is no longer prepared");
      const next = await createSessionRecordV1(
        {
          ...current,
          status: "active",
          revision: current.revision + 1,
          membershipConfigurationDigest: agent.membershipConfigurationDigest,
          membershipEpoch: agent.membershipEpoch,
          lineageDigest: agent.lineageDigest,
          logicalTimeHighWaterMs: Math.max(
            current.logicalTimeHighWaterMs,
            logicalTimeMs,
          ),
          predecessorRecordDigest: current.recordDigest,
          recordDigest: undefined,
        },
        this.#crypto,
      );
      const committed = await this.#storeCompareAndSet({
        recordKey: current.recordKey,
        expectedRevision: current.revision,
        expectedRecordDigest: current.recordDigest,
        next,
      });
      if (typeof committed !== "boolean")
        throw new TypeError("governed interop session CAS result is invalid");
      if (committed) return next;
    }
    throw new Error("governed interop activation CAS retry exhausted");
  }

  async #activeSession(
    record: GovernedInteropSessionRecordV1,
    manifest: InteropEndpointManifestV1,
    profile: InteropCapabilityProfileV1,
  ): Promise<GovernedInteropActiveSessionV1> {
    await this.#assertExpectedManifest(manifest);
    const eligibility = await invokeGovernedAgentLifecycleEligibilityV1(
      this.#lifecycle,
      {
        peerId: record.peerId,
        instanceId: record.instanceId,
      },
    );
    const agent = requireEligibleRecord(eligibility, record);
    const adapter = new LifecycleGatedInteropPortableAgentAdapterV1(
      this.#client,
      this.#outboundSequences,
      async (operation, sessionId, invokedManifest) => {
        if (sessionId !== record.sessionId)
          throw new Error("governed interop adapter session mismatch");
        const stored = await this.#storeLoad(record.recordKey);
        if (!stored) throw new Error("governed interop session is not active");
        const current = await validateSessionRecordV1(stored, this.#crypto);
        if (
          current.status !== "active" ||
          current.recordKey !== record.recordKey ||
          current.sessionId !== record.sessionId ||
          current.issuerId !== this.#clientId ||
          current.requestDigest !== record.requestDigest ||
          current.manifestDigest !== invokedManifest.manifestDigest ||
          current.endpointId !== invokedManifest.endpointId
        )
          throw new Error("governed interop session is not active");
        const capabilityKey = profile.operationCapabilities.find(
          (item) => item.operation === operation,
        )?.capabilityKey;
        if (!capabilityKey)
          throw new Error(
            `governed interop operation is not profiled: ${operation}`,
          );
        const decision = await invokeGovernedAgentLifecycleEligibilityV1(
          this.#lifecycle,
          {
            peerId: current.peerId,
            instanceId: current.instanceId,
            capabilityKey,
          },
        );
        requireEligibleRecord(decision, current);
      },
    );
    return Object.freeze({ record, manifest, agent, adapter });
  }

  async #assertExpectedManifest(
    manifest: InteropEndpointManifestV1,
  ): Promise<void> {
    if (this.#expectedManifest === null) return;
    const expected = await validateInteropEndpointManifestV1(
      this.#expectedManifest,
      this.#crypto,
    );
    if (manifest.manifestDigest !== expected.manifestDigest)
      throw new Error("governed interop endpoint manifest binding changed");
  }
}

export function isGovernedInteropLifecycleV1(
  value: unknown,
): value is GovernedInteropLifecycleV1 {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    governedInteropLifecycleInvokersV1.has(value)
  );
}

export function invokeGovernedInteropLifecycleCreateAndEnrollV1(
  lifecycle: GovernedInteropLifecycleV1,
  input: GovernedInteropAdmissionRequestV1,
): Promise<GovernedInteropActiveSessionV1> {
  const invokers = governedInteropLifecycleInvokersV1.get(lifecycle);
  if (!invokers)
    throw new TypeError("concrete governed interop lifecycle is required");
  return invokers.createAndEnroll(input);
}

export function invokeGovernedInteropLifecycleOpenSessionV1(
  lifecycle: GovernedInteropLifecycleV1,
  sessionId: string,
  signal?: AbortSignal,
): Promise<GovernedInteropActiveSessionV1> {
  const invokers = governedInteropLifecycleInvokersV1.get(lifecycle);
  if (!invokers)
    throw new TypeError("concrete governed interop lifecycle is required");
  return invokers.openSession(sessionId, signal);
}

export function invokeGovernedInteropLifecycleRetireV1(
  lifecycle: GovernedInteropLifecycleV1,
  input: Parameters<GovernedInteropLifecycleV1["retire"]>[0],
): Promise<GovernedInteropRetirementV1> {
  const invokers = governedInteropLifecycleInvokersV1.get(lifecycle);
  if (!invokers)
    throw new TypeError("concrete governed interop lifecycle is required");
  return invokers.retire(input);
}

class LifecycleGatedInteropPortableAgentAdapterV1 extends InteropPortableAgentAdapterV1 {
  constructor(
    client: InteropClientV1,
    sequences: InteropOutboundSequenceStoreV1,
    gate: (
      operation: InteropOperationV1,
      sessionId: string,
      manifest: InteropEndpointManifestV1,
    ) => Promise<void>,
  ) {
    super(client, sequences, gate);
  }
}

export interface GovernedInteropRequestAdmissionOptionsV1 {
  readonly lifecycle: GovernedAgentLifecycleRuntimeV1;
  readonly store: GovernedInteropSessionStoreV1;
  readonly capabilityProfile: InteropCapabilityProfileV1;
  readonly endpointManifest: InteropEndpointManifestV1;
  readonly roleProfile: InteropRoleProfileV1;
  readonly crypto?: Crypto;
}

const governedInteropRequestAdmissionInvokersV1 = new WeakMap<
  object,
  {
    readonly admit: (
      request: InteropRequestEnvelopeV1,
    ) => Promise<InteropRequestAdmissionGrantV1 | false>;
    readonly revalidate: (input: {
      readonly request: InteropRequestEnvelopeV1;
      readonly grant: InteropRequestAdmissionGrantV1 | null;
    }) => Promise<boolean>;
  }
>();

/**
 * Authoritative router-side admission for governed interop sessions.
 *
 * The initial grant binds the exact caller, request, session-record revision,
 * membership epoch and operation capability. `InteropEndpointRouterV1` passes
 * that grant back immediately before committing and delivering a response, so
 * retirement or any other session-record transition invalidates an in-flight
 * result. Request signatures are mandatory because an unauthenticated
 * `issuerId` cannot be used as lifecycle authority.
 */
export class GovernedInteropRequestAdmissionV1 implements InteropRequestAdmissionPortV1 {
  readonly #lifecycle: GovernedAgentLifecycleRuntimeV1;
  readonly #store: GovernedInteropSessionStoreV1;
  readonly #storeLoad: GovernedInteropSessionStoreV1["load"];
  readonly #capabilityProfile: InteropCapabilityProfileV1;
  readonly #endpointManifest: InteropEndpointManifestV1;
  readonly #roleProfile: InteropRoleProfileV1;
  readonly #crypto: Crypto | undefined;

  constructor(readonly options: GovernedInteropRequestAdmissionOptionsV1) {
    const lifecycle = options.lifecycle;
    const store = options.store;
    const capabilityProfile = options.capabilityProfile;
    const endpointManifest = options.endpointManifest;
    const roleProfile = options.roleProfile;
    const crypto = captureInteropDigestCryptoV1(
      options.crypto ?? globalThis.crypto,
    );
    const storeLoad = store?.load;
    if (!isGovernedAgentLifecycleRuntimeV1(lifecycle))
      throw new TypeError(
        "concrete governed interop request lifecycle is required",
      );
    if (!store || typeof storeLoad !== "function")
      throw new TypeError("governed interop request session store is required");
    if (!capabilityProfile)
      throw new TypeError(
        "governed interop request capability profile is required",
      );
    if (!endpointManifest)
      throw new TypeError("governed interop endpoint manifest is required");
    if (!roleProfile)
      throw new TypeError("governed interop role profile is required");
    this.#lifecycle = lifecycle;
    this.#store = store;
    this.#storeLoad = storeLoad.bind(store);
    this.#capabilityProfile = freeze(capabilityProfile);
    this.#endpointManifest =
      snapshotInteropEndpointManifestV1(endpointManifest);
    this.#roleProfile = freeze(roleProfile);
    this.#crypto = crypto;
    Object.defineProperty(this, "options", {
      value: Object.freeze({
        lifecycle: this.#lifecycle,
        store: this.#store,
        capabilityProfile: this.#capabilityProfile,
        endpointManifest: this.#endpointManifest,
        roleProfile: this.#roleProfile,
        ...(this.#crypto ? { crypto: this.#crypto } : {}),
      }),
      writable: false,
      configurable: false,
      enumerable: true,
    });
    const invokers = Object.freeze({
      admit: (request: InteropRequestEnvelopeV1) => this.#admit(request),
      revalidate: (input: {
        readonly request: InteropRequestEnvelopeV1;
        readonly grant: InteropRequestAdmissionGrantV1 | null;
      }) => this.#revalidate(input),
    });
    governedInteropRequestAdmissionInvokersV1.set(this, invokers);
    Object.defineProperties(this, {
      admit: immutableMethod(invokers.admit),
      revalidate: immutableMethod(invokers.revalidate),
    });
  }

  admit(
    request: InteropRequestEnvelopeV1,
  ): Promise<InteropRequestAdmissionGrantV1 | false> {
    return this.#admit(request);
  }

  async #admit(
    request: InteropRequestEnvelopeV1,
  ): Promise<InteropRequestAdmissionGrantV1 | false> {
    return (await this.#grant(request)) ?? false;
  }

  revalidate(input: {
    readonly request: InteropRequestEnvelopeV1;
    readonly grant: InteropRequestAdmissionGrantV1 | null;
  }): Promise<boolean> {
    return this.#revalidate(input);
  }

  async #revalidate(input: {
    readonly request: InteropRequestEnvelopeV1;
    readonly grant: InteropRequestAdmissionGrantV1 | null;
  }): Promise<boolean> {
    if (!input.grant) return false;
    const current = await this.#grant(input.request);
    return (
      current !== null &&
      current.admissionId === input.grant.admissionId &&
      current.requestDigest === input.grant.requestDigest &&
      current.scopeRevision === input.grant.scopeRevision &&
      current.scopeEpoch === input.grant.scopeEpoch &&
      current.scopeDigest === input.grant.scopeDigest &&
      current.bindingDigest === input.grant.bindingDigest
    );
  }

  async #grant(
    request: InteropRequestEnvelopeV1,
  ): Promise<InteropRequestAdmissionGrantV1 | null> {
    request = snapshotInteropRequestEnvelopeV1(request);
    const [profile, manifest, roleProfile] = await Promise.all([
      validateInteropCapabilityProfileV1(this.#capabilityProfile, this.#crypto),
      validateInteropEndpointManifestV1(this.#endpointManifest, this.#crypto),
      validateInteropRoleProfileV1(this.#roleProfile, this.#crypto),
    ]);
    if (!profile.requireRequestSignature)
      throw new TypeError(
        "governed interop server admission requires signed requests",
      );
    if (!request.signature) return null;
    const capabilityKey = profile.operationCapabilities.find(
      (item) => item.operation === request.operation,
    )?.capabilityKey;
    if (!capabilityKey) return null;
    const stored = await this.#storeLoad(
      governedInteropSessionRecordKeyV1(request.sessionId),
    );
    if (!stored) return null;
    const record = await validateSessionRecordV1(stored, this.#crypto);
    if (
      record.status !== "active" ||
      record.sessionId !== request.sessionId ||
      record.issuerId !== request.issuerId ||
      record.endpointId !== request.endpointId ||
      request.endpointId !== manifest.endpointId ||
      record.manifestDigest !== manifest.manifestDigest ||
      record.capabilityProfileDigest !== profile.profileDigest ||
      record.roleProfileDigest !== roleProfile.profileDigest ||
      record.membershipEpoch === null
    )
      return null;
    const eligibility = await invokeGovernedAgentLifecycleEligibilityV1(
      this.#lifecycle,
      {
        peerId: record.peerId,
        instanceId: record.instanceId,
        capabilityKey,
      },
    );
    if (!isEligibleRecord(eligibility, record)) return null;
    const body = {
      schemaVersion: 1 as const,
      admissionId: record.admissionId,
      requestDigest: request.requestDigest,
      issuerId: request.issuerId,
      endpointId: request.endpointId,
      sessionId: request.sessionId,
      operation: request.operation,
      capabilityKey,
      scopeRevision: record.revision,
      scopeEpoch: record.membershipEpoch,
      scopeDigest: record.recordDigest,
    };
    return freeze({
      admitted: true as const,
      admissionId: record.admissionId,
      requestDigest: request.requestDigest,
      scopeRevision: record.revision,
      scopeEpoch: record.membershipEpoch,
      scopeDigest: record.recordDigest,
      bindingDigest: await interopDigestV1(
        "governed-request-admission",
        body,
        this.#crypto,
      ),
    });
  }
}

export function isGovernedInteropRequestAdmissionV1(
  value: unknown,
): value is GovernedInteropRequestAdmissionV1 {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    governedInteropRequestAdmissionInvokersV1.has(value)
  );
}

export function invokeGovernedInteropRequestAdmissionAdmitV1(
  admission: GovernedInteropRequestAdmissionV1,
  request: InteropRequestEnvelopeV1,
): Promise<InteropRequestAdmissionGrantV1 | false> {
  const invokers = governedInteropRequestAdmissionInvokersV1.get(admission);
  if (!invokers)
    throw new TypeError("concrete governed interop admission is required");
  return invokers.admit(request);
}

export function invokeGovernedInteropRequestAdmissionRevalidateV1(
  admission: GovernedInteropRequestAdmissionV1,
  input: {
    readonly request: InteropRequestEnvelopeV1;
    readonly grant: InteropRequestAdmissionGrantV1 | null;
  },
): Promise<boolean> {
  const invokers = governedInteropRequestAdmissionInvokersV1.get(admission);
  if (!invokers)
    throw new TypeError("concrete governed interop admission is required");
  return invokers.revalidate(input);
}

const restartDurableGovernedInteropRuntimeStoresBrandV1: unique symbol =
  Symbol("RestartDurableGovernedInteropRuntimeStoresV1");

/** Closed custody for every stateful boundary in the reference composition. */
export interface RestartDurableGovernedInteropRuntimeStoresV1 {
  readonly sessionStore: GovernedInteropSessionStoreV1;
  readonly outboundSequences: InteropOutboundSequenceStoreV1;
  readonly routerStores: RestartDurableInteropRouterStoresV1;
  readonly [restartDurableGovernedInteropRuntimeStoresBrandV1]:
    "RestartDurableGovernedInteropRuntimeStoresV1";
}

export function createRestartDurableGovernedInteropRuntimeStoresV1(input: {
  readonly sessionStore: GovernedInteropSessionStoreV1;
  readonly outboundSequences: InteropOutboundSequenceStoreV1;
  readonly routerStores: RestartDurableInteropRouterStoresV1;
}): RestartDurableGovernedInteropRuntimeStoresV1 {
  if (!input || typeof input !== "object")
    throw new TypeError("restart-durable governed interop stores are required");
  const { sessionStore, outboundSequences, routerStores } = input;
  if (
    !sessionStore ||
    typeof sessionStore.load !== "function" ||
    typeof sessionStore.compareAndSet !== "function" ||
    !outboundSequences ||
    typeof outboundSequences.next !== "function" ||
    typeof outboundSequences.current !== "function" ||
    !routerStores ||
    typeof routerStores.idempotency?.load !== "function" ||
    typeof routerStores.idempotency.reserve !== "function" ||
    typeof routerStores.idempotency.commit !== "function" ||
    typeof routerStores.sequences?.admit !== "function"
  )
    throw new TypeError("restart-durable governed interop stores are invalid");
  return Object.freeze({
    sessionStore,
    outboundSequences,
    routerStores,
    [restartDurableGovernedInteropRuntimeStoresBrandV1]:
      "RestartDurableGovernedInteropRuntimeStoresV1" as const,
  });
}

interface ReferenceGovernedInteropRuntimeBaseOptionsV1 {
  readonly client: InteropClientV1;
  readonly lifecycle: GovernedAgentLifecycleRuntimeV1;
  readonly capabilityProfile: InteropCapabilityProfileV1;
  readonly roleProfile: InteropRoleProfileV1;
  readonly maximumCommitAttempts?: number;
  readonly crypto?: Crypto;
  readonly router: {
    readonly routerInstanceId: string;
    readonly manifest: InteropEndpointManifestV1;
    /** Side-effect-free operation preparation. Effects commit separately. */
    readonly preparers: readonly GovernedInteropEffectPreparerV1[];
    /**
     * Atomically commits a prepared effect against the supplied session fence.
     * Implementations must reject a stale scope revision, epoch or digest.
     */
    readonly effects: GovernedInteropEffectCommitPortV1;
    readonly schemas: InteropPayloadSchemaResolverV1;
    readonly authenticity?: InteropEnvelopeAuthenticityPortV1;
    readonly reservationLeaseMs?: number;
  };
}

export type ReferenceGovernedInteropRuntimeOptionsV1 =
  ReferenceGovernedInteropRuntimeBaseOptionsV1 &
    (
      | {
          /** Explicit process-local mode for tests and single-process tools. */
          readonly localOnly: true;
          readonly durableStores?: never;
        }
      | {
          readonly localOnly?: never;
          readonly durableStores: RestartDurableGovernedInteropRuntimeStoresV1;
        }
    );

export interface GovernedInteropEffectPreparationV1 {
  readonly effectId: string;
  readonly payload: JsonValue;
}

export interface GovernedInteropPreparedEffectV1 {
  readonly schemaVersion: 1;
  readonly effectId: string;
  readonly requestDigest: string;
  readonly endpointId: string;
  readonly sessionId: string;
  readonly operation: InteropOperationV1;
  readonly scopeRevision: number;
  readonly scopeEpoch: number;
  readonly scopeDigest: string;
  readonly admissionBindingDigest: string;
  readonly payload: JsonValue;
  readonly effectDigest: string;
}

/**
 * Preparation code is pure with respect to external systems. It returns a
 * content-bound intent that the reference runtime fences before commit.
 */
export interface GovernedInteropEffectPreparerV1 {
  readonly operation: InteropOperationV1;
  prepare(input: {
    readonly request: InteropRequestEnvelopeV1;
    readonly signal: AbortSignal;
  }): Promise<GovernedInteropEffectPreparationV1>;
}

export interface GovernedInteropEffectCommitPortV1 {
  commit(input: {
    readonly request: InteropRequestEnvelopeV1;
    readonly grant: InteropRequestAdmissionGrantV1;
    readonly effect: GovernedInteropPreparedEffectV1;
    readonly signal: AbortSignal;
  }): Promise<{
    readonly status: InteropResponseEnvelopeV1["status"];
    readonly reasonCode: string;
    readonly payload: JsonValue;
  }>;
}

export interface ReferenceGovernedInteropRuntimeV1 {
  readonly schemaVersion: 1;
  readonly lifecycle: GovernedInteropLifecycleV1;
  readonly admission: GovernedInteropRequestAdmissionV1;
  readonly router: InteropEndpointRouterV1;
  readonly store: GovernedInteropSessionStoreV1;
  createAndEnroll(
    input: GovernedInteropAdmissionRequestV1,
  ): Promise<GovernedInteropActiveSessionV1>;
  openSession(
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<GovernedInteropActiveSessionV1>;
  retire(
    input: Parameters<GovernedInteropLifecycleV1["retire"]>[0],
  ): Promise<GovernedInteropRetirementV1>;
  handle(
    request: InteropRequestEnvelopeV1,
    input: { readonly logicalTimeMs: number; readonly signal: AbortSignal },
  ): Promise<InteropResponseEnvelopeV1>;
}

const referenceGovernedInteropRuntimeBindingsV1 = new WeakMap<
  object,
  {
    readonly lifecycle: GovernedInteropLifecycleV1;
    readonly admission: GovernedInteropRequestAdmissionV1;
    readonly router: InteropEndpointRouterV1;
    readonly store: GovernedInteropSessionStoreV1;
  }
>();

/**
 * Closed reference composition for governed interop. It binds one concrete
 * lifecycle, session store and capability profile to both client-side session
 * activation and server-side request admission. Router calls use
 * library-owned invokers, so public method replacement cannot redirect the
 * authoritative path after construction.
 */
export function createReferenceGovernedInteropRuntimeV1(
  options: ReferenceGovernedInteropRuntimeOptionsV1,
): ReferenceGovernedInteropRuntimeV1 {
  const client = options.client;
  const agentLifecycle = options.lifecycle;
  const inputCapabilityProfile = options.capabilityProfile;
  const inputRoleProfile = options.roleProfile;
  const localOnly = options.localOnly;
  const durableStores = options.durableStores;
  const legacyStore = (options as unknown as { readonly store?: unknown }).store;
  const legacyOutboundSequences = (
    options as unknown as { readonly outboundSequences?: unknown }
  ).outboundSequences;
  const maximumCommitAttempts = options.maximumCommitAttempts;
  const crypto = captureInteropDigestCryptoV1(
    options.crypto ?? globalThis.crypto,
  );
  const routerOptions = options.router;
  if (!routerOptions || typeof routerOptions !== "object")
    throw new TypeError("governed interop router options are required");
  const routerInstanceId = routerOptions.routerInstanceId;
  const manifest = snapshotInteropEndpointManifestV1(routerOptions.manifest);
  const preparers = routerOptions.preparers;
  const effects = routerOptions.effects;
  const schemas = routerOptions.schemas;
  const authenticity = routerOptions.authenticity;
  const nestedLocalOnly = (
    routerOptions as unknown as { readonly localOnly?: unknown }
  ).localOnly;
  const nestedDurableStores = (
    routerOptions as unknown as { readonly durableStores?: unknown }
  ).durableStores;
  const reservationLeaseMs = routerOptions.reservationLeaseMs;
  if (!isInteropClientV1(client))
    throw new TypeError("concrete governed interop client is required");
  if (!isGovernedAgentLifecycleRuntimeV1(agentLifecycle))
    throw new TypeError("concrete governed agent lifecycle is required");
  const effectCommit = effects?.commit;
  if (!effects || typeof effectCommit !== "function")
    throw new TypeError("governed interop effect commit port is required");
  if (!Array.isArray(preparers) || preparers.length === 0)
    throw new TypeError("governed interop effect preparers are required");
  if (
    legacyStore !== undefined ||
    legacyOutboundSequences !== undefined ||
    nestedLocalOnly !== undefined ||
    nestedDurableStores !== undefined
  )
    throw new TypeError(
      "reference governed interop durability must be selected once at the top level",
    );
  if ((localOnly === true) === (durableStores !== undefined))
    throw new TypeError(
      "reference governed interop requires exactly one localOnly or restart-durable store composition",
    );
  const store =
    durableStores?.sessionStore ?? new InMemoryGovernedInteropSessionStoreV1();
  const outboundSequences =
    durableStores?.outboundSequences ??
    new InMemoryInteropOutboundSequenceStoreV1();
  const routerStores = durableStores?.routerStores;
  const capabilityProfile = freeze(inputCapabilityProfile);
  const roleProfile = freeze(inputRoleProfile);
  const lifecycle = new GovernedInteropLifecycleV1({
    client,
    lifecycle: agentLifecycle,
    capabilityProfile,
    roleProfile,
    store,
    outboundSequences,
    expectedManifest: manifest,
    ...(maximumCommitAttempts !== undefined ? { maximumCommitAttempts } : {}),
    ...(crypto ? { crypto } : {}),
  });
  const admission = new GovernedInteropRequestAdmissionV1({
    lifecycle: agentLifecycle,
    store,
    capabilityProfile,
    endpointManifest: manifest,
    roleProfile,
    ...(crypto ? { crypto } : {}),
  });
  const authoritativeAdmission: InteropRequestAdmissionPortV1 = Object.freeze({
    admit: (request: InteropRequestEnvelopeV1) =>
      invokeGovernedInteropRequestAdmissionAdmitV1(admission, request),
    revalidate: (input: {
      readonly request: InteropRequestEnvelopeV1;
      readonly grant: InteropRequestAdmissionGrantV1 | null;
    }) => invokeGovernedInteropRequestAdmissionRevalidateV1(admission, input),
  });
  const handlers: readonly InteropOperationHandlerV1[] = Object.freeze(
    Array.from(preparers, (preparer) => {
      const operation = preparer?.operation;
      const prepare = preparer?.prepare;
      if (typeof prepare !== "function")
        throw new TypeError("governed interop effect preparer is invalid");
      const prepareEffect = prepare.bind(preparer);
      return Object.freeze({
        operation,
        async handle(input: {
          readonly request: InteropRequestEnvelopeV1;
          readonly signal: AbortSignal;
          readonly admissionGrant: InteropRequestAdmissionGrantV1 | null;
        }) {
          const grant = input.admissionGrant;
          if (!grant)
            return {
              status: "refused" as const,
              reasonCode: "interop_effect_requires_scoped_admission",
              payload: null,
            };
          const preparation = await prepareEffect({
            request: input.request,
            signal: input.signal,
          });
          const effectId = preparation?.effectId;
          const payload = freeze(preparation?.payload);
          identifier(effectId, "effectId");
          if (
            (await invokeGovernedInteropRequestAdmissionRevalidateV1(
              admission,
              { request: input.request, grant },
            )) !== true
          )
            return {
              status: "refused" as const,
              reasonCode: "interop_request_admission_expired",
              payload: null,
            };
          const effectBody = {
            schemaVersion: 1 as const,
            effectId,
            requestDigest: input.request.requestDigest,
            endpointId: input.request.endpointId,
            sessionId: input.request.sessionId,
            operation: input.request.operation,
            scopeRevision: grant.scopeRevision,
            scopeEpoch: grant.scopeEpoch,
            scopeDigest: grant.scopeDigest,
            admissionBindingDigest: grant.bindingDigest,
            payload,
          };
          const effect = freeze({
            ...effectBody,
            effectDigest: await interopDigestV1(
              "governed-effect",
              effectBody,
              crypto,
            ),
          });
          return effectCommit.call(effects, {
            request: input.request,
            grant,
            effect,
            signal: input.signal,
          });
        },
      });
    }),
  );
  const router = new InteropEndpointRouterV1({
    routerInstanceId,
    manifest,
    handlers,
    admission: authoritativeAdmission,
    schemas,
    ...(authenticity ? { authenticity } : {}),
    ...(localOnly === true
      ? { localOnly: true as const }
      : { durableStores: routerStores! }),
    ...(reservationLeaseMs !== undefined ? { reservationLeaseMs } : {}),
    ...(crypto ? { crypto } : {}),
  });
  const runtime: ReferenceGovernedInteropRuntimeV1 = Object.freeze({
    schemaVersion: 1 as const,
    lifecycle,
    admission,
    router,
    store,
    createAndEnroll: (input: GovernedInteropAdmissionRequestV1) =>
      invokeGovernedInteropLifecycleCreateAndEnrollV1(lifecycle, input),
    openSession: (sessionId: string, signal?: AbortSignal) =>
      invokeGovernedInteropLifecycleOpenSessionV1(lifecycle, sessionId, signal),
    retire: (input: Parameters<GovernedInteropLifecycleV1["retire"]>[0]) =>
      invokeGovernedInteropLifecycleRetireV1(lifecycle, input),
    handle: (
      request: InteropRequestEnvelopeV1,
      input: { readonly logicalTimeMs: number; readonly signal: AbortSignal },
    ) => invokeInteropEndpointRouterHandleV1(router, request, input),
  });
  referenceGovernedInteropRuntimeBindingsV1.set(runtime, {
    lifecycle,
    admission,
    router,
    store,
  });
  return runtime;
}

export function isReferenceGovernedInteropRuntimeV1(
  value: unknown,
): value is ReferenceGovernedInteropRuntimeV1 {
  if (
    (typeof value !== "object" && typeof value !== "function") ||
    value === null
  )
    return false;
  const binding = referenceGovernedInteropRuntimeBindingsV1.get(value);
  if (!binding) return false;
  const runtime = value as ReferenceGovernedInteropRuntimeV1;
  return (
    runtime.lifecycle === binding.lifecycle &&
    runtime.admission === binding.admission &&
    runtime.router === binding.router &&
    runtime.store === binding.store
  );
}

export async function createInteropCapabilityProfileV1(
  input: InteropCapabilityProfileInputV1,
  crypto?: Crypto,
): Promise<InteropCapabilityProfileV1> {
  const body = normalizeCapabilityProfile(input);
  return freeze({
    ...body,
    profileDigest: await interopDigestV1("capability-profile", body, crypto),
  });
}

export async function validateInteropCapabilityProfileV1(
  input: InteropCapabilityProfileV1,
  crypto?: Crypto,
): Promise<InteropCapabilityProfileV1> {
  if (!input || input.schemaVersion !== 1)
    throw new TypeError("interop capability profile schema is invalid");
  const { profileDigest, schemaVersion: _schemaVersion, ...body } = input;
  const rebuilt = await createInteropCapabilityProfileV1(body, crypto);
  if (rebuilt.profileDigest !== profileDigest)
    throw new TypeError("interop capability profile digest is invalid");
  return rebuilt;
}

export async function createInteropRoleProfileV1(
  input: InteropRoleProfileInputV1,
  crypto?: Crypto,
): Promise<InteropRoleProfileV1> {
  identifier(input.profileId, "roleProfile.profileId");
  boundedInteger(
    input.profileVersion,
    "roleProfile.profileVersion",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  digest(input.roleDefinitionDigest, "roleProfile.roleDefinitionDigest");
  const allowedCapabilityProfileDigests = canonicalDigests(
    input.allowedCapabilityProfileDigests,
    "allowedCapabilityProfileDigests",
  );
  if (!allowedCapabilityProfileDigests.length)
    throw new TypeError("role profile requires a capability profile");
  const requiredCapabilityKeys = canonicalTokens(
    input.requiredCapabilityKeys,
    "requiredCapabilityKeys",
  );
  const body = {
    schemaVersion: 1 as const,
    profileId: input.profileId,
    profileVersion: input.profileVersion,
    roleDefinitionDigest: input.roleDefinitionDigest,
    allowedCapabilityProfileDigests,
    requiredCapabilityKeys,
  };
  return freeze({
    ...body,
    profileDigest: await interopDigestV1("role-profile", body, crypto),
  });
}

export async function validateInteropRoleProfileV1(
  input: InteropRoleProfileV1,
  crypto?: Crypto,
): Promise<InteropRoleProfileV1> {
  if (!input || input.schemaVersion !== 1)
    throw new TypeError("interop role profile schema is invalid");
  const { profileDigest, schemaVersion: _schemaVersion, ...body } = input;
  const rebuilt = await createInteropRoleProfileV1(body, crypto);
  if (rebuilt.profileDigest !== profileDigest)
    throw new TypeError("interop role profile digest is invalid");
  return rebuilt;
}

export function governedInteropSessionRecordKeyV1(sessionId: string): string {
  identifier(sessionId, "sessionId");
  return `governed-interop-session:${sessionId}`;
}

async function createSessionRecordV1(
  input: Omit<
    GovernedInteropSessionRecordV1,
    "format" | "schemaVersion" | "recordDigest"
  > & {
    readonly recordDigest?: undefined;
  },
  crypto?: Crypto,
): Promise<GovernedInteropSessionRecordV1> {
  const body = {
    format: GOVERNED_INTEROP_SESSION_RECORD_FORMAT_V1,
    schemaVersion: 1 as const,
    recordKey: input.recordKey,
    admissionId: input.admissionId,
    sessionId: input.sessionId,
    issuerId: input.issuerId,
    requestDigest: input.requestDigest,
    agentId: input.agentId,
    peerId: input.peerId,
    instanceId: input.instanceId,
    endpointId: input.endpointId,
    manifestDigest: input.manifestDigest,
    capabilityProfileDigest: input.capabilityProfileDigest,
    roleProfileDigest: input.roleProfileDigest,
    status: input.status,
    revision: input.revision,
    membershipConfigurationDigest: input.membershipConfigurationDigest,
    membershipEpoch: input.membershipEpoch,
    lineageDigest: input.lineageDigest,
    retirementDigest: input.retirementDigest,
    retiredAtLogicalMs: input.retiredAtLogicalMs,
    logicalTimeHighWaterMs: input.logicalTimeHighWaterMs,
    predecessorRecordDigest: input.predecessorRecordDigest,
  };
  validateSessionRecordBody(body);
  return freeze({
    ...body,
    recordDigest: await interopDigestV1(
      "governed-session-record",
      body,
      crypto,
    ),
  });
}

async function validateSessionRecordV1(
  input: GovernedInteropSessionRecordV1,
  crypto?: Crypto,
): Promise<GovernedInteropSessionRecordV1> {
  if (!input || typeof input !== "object")
    throw new TypeError("governed interop session record is invalid");
  const recordDigest = input.recordDigest;
  const rebuilt = await createSessionRecordV1(
    {
      recordKey: input.recordKey,
      admissionId: input.admissionId,
      sessionId: input.sessionId,
      issuerId: input.issuerId,
      requestDigest: input.requestDigest,
      agentId: input.agentId,
      peerId: input.peerId,
      instanceId: input.instanceId,
      endpointId: input.endpointId,
      manifestDigest: input.manifestDigest,
      capabilityProfileDigest: input.capabilityProfileDigest,
      roleProfileDigest: input.roleProfileDigest,
      status: input.status,
      revision: input.revision,
      membershipConfigurationDigest: input.membershipConfigurationDigest,
      membershipEpoch: input.membershipEpoch,
      lineageDigest: input.lineageDigest,
      retirementDigest: input.retirementDigest,
      retiredAtLogicalMs: input.retiredAtLogicalMs,
      logicalTimeHighWaterMs: input.logicalTimeHighWaterMs,
      predecessorRecordDigest: input.predecessorRecordDigest,
    },
    crypto,
  );
  if (rebuilt.recordDigest !== recordDigest)
    throw new TypeError("governed interop session record digest is invalid");
  return rebuilt;
}

/** Rebuilds and verifies a durable governed-session record before custody use. */
export function validateGovernedInteropSessionRecordV1(
  input: GovernedInteropSessionRecordV1,
  crypto?: Crypto,
): Promise<GovernedInteropSessionRecordV1> {
  return validateSessionRecordV1(input, crypto);
}

function validateSessionRecordBody(
  input: Omit<GovernedInteropSessionRecordV1, "recordDigest">,
): void {
  if (
    input.format !== GOVERNED_INTEROP_SESSION_RECORD_FORMAT_V1 ||
    input.schemaVersion !== 1
  )
    throw new TypeError("governed interop session record schema is invalid");
  for (const [label, value] of [
    ["recordKey", input.recordKey],
    ["admissionId", input.admissionId],
    ["sessionId", input.sessionId],
    ["issuerId", input.issuerId],
    ["agentId", input.agentId],
    ["peerId", input.peerId],
    ["instanceId", input.instanceId],
    ["endpointId", input.endpointId],
  ] as const)
    identifier(value, label);
  if (input.recordKey !== governedInteropSessionRecordKeyV1(input.sessionId))
    throw new TypeError("governed interop session record key is invalid");
  for (const [label, value] of [
    ["requestDigest", input.requestDigest],
    ["manifestDigest", input.manifestDigest],
    ["capabilityProfileDigest", input.capabilityProfileDigest],
    ["roleProfileDigest", input.roleProfileDigest],
  ] as const)
    digest(value, label);
  if (!(["prepared", "active", "retired"] as const).includes(input.status))
    throw new TypeError("governed interop session status is invalid");
  boundedInteger(input.revision, "revision", 0, Number.MAX_SAFE_INTEGER);
  boundedInteger(
    input.logicalTimeHighWaterMs,
    "logicalTimeHighWaterMs",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  nullableDigest(
    input.membershipConfigurationDigest,
    "membershipConfigurationDigest",
  );
  nullableDigest(input.lineageDigest, "lineageDigest");
  nullableDigest(input.retirementDigest, "retirementDigest");
  nullableDigest(input.predecessorRecordDigest, "predecessorRecordDigest");
  if (input.membershipEpoch !== null)
    boundedInteger(
      input.membershipEpoch,
      "membershipEpoch",
      1,
      Number.MAX_SAFE_INTEGER,
    );
  if (input.retiredAtLogicalMs !== null)
    boundedInteger(
      input.retiredAtLogicalMs,
      "retiredAtLogicalMs",
      0,
      input.logicalTimeHighWaterMs,
    );
  if (
    input.status === "prepared" &&
    [
      input.lineageDigest,
      input.membershipConfigurationDigest,
      input.membershipEpoch,
    ].some((value) => value !== null)
  )
    throw new TypeError(
      "prepared governed interop session retains active state",
    );
  if (
    input.status === "active" &&
    (!input.lineageDigest ||
      !input.membershipConfigurationDigest ||
      input.membershipEpoch === null ||
      input.retirementDigest !== null)
  )
    throw new TypeError("active governed interop session state is incomplete");
  if (
    input.status === "retired" &&
    (!input.retirementDigest || input.retiredAtLogicalMs === null)
  )
    throw new TypeError("retired governed interop session state is incomplete");
}

function normalizeCapabilityProfile(
  input: InteropCapabilityProfileInputV1,
): Omit<InteropCapabilityProfileV1, "profileDigest"> {
  for (const [label, value] of [
    ["profileId", input.profileId],
    ["adapterId", input.adapterId],
    ["endpointId", input.endpointId],
    ["implementationId", input.implementationId],
  ] as const)
    identifier(value, `capabilityProfile.${label}`);
  if (!input.adapterVersion || !input.endpointVersion)
    throw new TypeError("interop capability profile versions are required");
  boundedInteger(
    input.profileVersion,
    "capabilityProfile.profileVersion",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  const allowedEndpointKinds = [...new Set(input.allowedEndpointKinds)].sort();
  if (
    !allowedEndpointKinds.length ||
    allowedEndpointKinds.some(
      (kind) => !["agent", "environment", "hybrid"].includes(kind),
    )
  )
    throw new TypeError("interop capability endpoint kinds are invalid");
  const requiredOperations = [
    ...new Set(input.requiredOperations),
  ].sort() as InteropOperationV1[];
  if (!requiredOperations.includes("agent.step"))
    throw new TypeError("interop capability profile requires agent.step");
  const operationCapabilities = [...input.operationCapabilities]
    .map((item) => {
      if (!requiredOperations.includes(item.operation))
        throw new TypeError("interop operation capability is not required");
      token(item.capabilityKey, "operationCapabilities.capabilityKey");
      return { operation: item.operation, capabilityKey: item.capabilityKey };
    })
    .sort((left, right) =>
      compareUtf16CodeUnits(left.operation, right.operation),
    );
  if (
    operationCapabilities.length !== requiredOperations.length ||
    new Set(operationCapabilities.map((item) => item.operation)).size !==
      operationCapabilities.length
  )
    throw new TypeError(
      "every required operation needs one capability binding",
    );
  for (const flag of [
    input.requireCancellation,
    input.requireDeterministicReplay,
    input.requireCheckpoint,
    input.requireRequestSignature,
    input.requireResponseSignature,
  ])
    if (typeof flag !== "boolean")
      throw new TypeError("interop capability profile flag is invalid");
  return {
    schemaVersion: 1,
    profileId: input.profileId,
    profileVersion: input.profileVersion,
    adapterId: input.adapterId,
    adapterVersion: input.adapterVersion,
    endpointId: input.endpointId,
    endpointVersion: input.endpointVersion,
    implementationId: input.implementationId,
    allowedEndpointKinds: Object.freeze(allowedEndpointKinds),
    requiredOperations: Object.freeze(requiredOperations),
    operationCapabilities: freeze(operationCapabilities),
    requireCancellation: input.requireCancellation,
    requireDeterministicReplay: input.requireDeterministicReplay,
    requireCheckpoint: input.requireCheckpoint,
    requireRequestSignature: input.requireRequestSignature,
    requireResponseSignature: input.requireResponseSignature,
  };
}

function validateAdmissionBindings(
  request: AgentCreationRequestV1,
  manifest: InteropEndpointManifestV1,
  capability: InteropCapabilityProfileV1,
  role: InteropRoleProfileV1,
): void {
  if (
    request.adapterId !== capability.adapterId ||
    request.adapterVersion !== capability.adapterVersion ||
    manifest.endpointId !== capability.endpointId ||
    manifest.endpointVersion !== capability.endpointVersion ||
    manifest.implementationId !== capability.implementationId ||
    !capability.allowedEndpointKinds.includes(manifest.endpointKind)
  )
    throw new TypeError(
      "interop manifest identity is outside capability profile",
    );
  if (
    capability.requiredOperations.some(
      (operation) => !manifest.operations.includes(operation),
    )
  )
    throw new TypeError("interop manifest operation coverage is insufficient");
  if (
    (capability.requireCancellation && !manifest.supportsCancellation) ||
    (capability.requireDeterministicReplay &&
      !manifest.supportsDeterministicReplay) ||
    (capability.requireCheckpoint && !manifest.supportsCheckpoint) ||
    (capability.requireRequestSignature &&
      !manifest.requiresRequestSignature) ||
    (capability.requireResponseSignature && !manifest.signsResponses)
  )
    throw new TypeError("interop manifest capability flags are insufficient");
  if (
    request.roleDefinitionDigest !== role.roleDefinitionDigest ||
    !role.allowedCapabilityProfileDigests.includes(capability.profileDigest)
  )
    throw new TypeError("interop role profile binding is invalid");
  const requiredKeys = new Set([
    ...role.requiredCapabilityKeys,
    ...capability.operationCapabilities.map((item) => item.capabilityKey),
  ]);
  if ([...requiredKeys].some((key) => !request.capabilityKeys.includes(key)))
    throw new TypeError("interop governed capability key is unavailable");
}

function validateAdmissionInput(
  input: GovernedInteropAdmissionRequestV1,
): void {
  identifier(input.admissionId, "admissionId");
  identifier(input.sessionId, "sessionId");
  boundedInteger(
    input.logicalTimeMs,
    "logicalTimeMs",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  if (!input.request || !input.certificate || !input.activeKeyProof)
    throw new TypeError("governed interop lifecycle material is required");
  if (input.signal?.aborted)
    throw new Error("governed interop admission aborted");
}

function snapshotAdmissionInput(
  input: GovernedInteropAdmissionRequestV1,
): GovernedInteropAdmissionRequestV1 {
  validateAdmissionInput(input);
  return Object.freeze({
    admissionId: input.admissionId,
    sessionId: input.sessionId,
    request: freeze(input.request),
    certificate: freeze(input.certificate),
    activeKeyProof: freeze(input.activeKeyProof),
    logicalTimeMs: input.logicalTimeMs,
    ...(input.signal ? { signal: input.signal } : {}),
  });
}

function assertOwnedSessionRecord(
  record: GovernedInteropSessionRecordV1,
  sessionId: string,
  issuerId: string,
): void {
  if (
    record.sessionId !== sessionId ||
    record.recordKey !== governedInteropSessionRecordKeyV1(sessionId) ||
    record.issuerId !== issuerId
  )
    throw new Error("governed interop session ownership changed");
}

function assertAdmissionReplay(
  record: GovernedInteropSessionRecordV1,
  input: GovernedInteropAdmissionRequestV1,
  manifest: InteropEndpointManifestV1,
  capability: InteropCapabilityProfileV1,
  role: InteropRoleProfileV1,
  issuerId: string,
): void {
  if (
    record.admissionId !== input.admissionId ||
    record.sessionId !== input.sessionId ||
    record.issuerId !== issuerId ||
    record.requestDigest !== input.request.requestDigest ||
    record.agentId !== input.request.requestedAgentId ||
    record.peerId !== input.request.requestedPeerId ||
    record.instanceId !== input.request.requestedInstanceId ||
    record.manifestDigest !== manifest.manifestDigest ||
    record.capabilityProfileDigest !== capability.profileDigest ||
    record.roleProfileDigest !== role.profileDigest
  )
    throw new Error("governed interop admission replay conflicts");
}

function assertAgentBinding(
  agent: AgentLineageRecordV1,
  request: AgentCreationRequestV1,
): void {
  if (
    agent.agentId !== request.requestedAgentId ||
    agent.peerId !== request.requestedPeerId ||
    agent.instanceId !== request.requestedInstanceId ||
    agent.adapterId !== request.adapterId ||
    agent.adapterVersion !== request.adapterVersion ||
    agent.roleDefinitionDigest !== request.roleDefinitionDigest ||
    agent.status !== "active" ||
    request.capabilityKeys.some((key) => !agent.capabilityKeys.includes(key)) ||
    !agent.membershipConfigurationDigest ||
    agent.membershipEpoch === null
  )
    throw new Error("governed interop active agent binding is invalid");
}

function requireEligibleAgent(
  decision: GovernedAgentEligibilityDecisionV1,
  request: AgentCreationRequestV1,
): AgentLineageRecordV1 {
  if (!decision.eligible || !decision.agent)
    throw new Error(
      `governed interop lifecycle is ineligible: ${decision.reasonCode}`,
    );
  assertAgentBinding(decision.agent, request);
  return decision.agent;
}

function requireEligibleRecord(
  decision: GovernedAgentEligibilityDecisionV1,
  record: GovernedInteropSessionRecordV1,
): AgentLineageRecordV1 {
  const agent = decision.agent;
  if (
    !decision.eligible ||
    !agent ||
    agent.agentId !== record.agentId ||
    agent.peerId !== record.peerId ||
    agent.instanceId !== record.instanceId ||
    agent.lineageDigest !== record.lineageDigest ||
    agent.status !== "active" ||
    decision.membershipConfigurationDigest !==
      record.membershipConfigurationDigest ||
    decision.membershipEpoch !== record.membershipEpoch
  )
    throw new Error(
      `governed interop lifecycle is ineligible: ${decision.reasonCode}`,
    );
  return agent;
}

function isEligibleRecord(
  decision: GovernedAgentEligibilityDecisionV1,
  record: GovernedInteropSessionRecordV1,
): boolean {
  const agent = decision.agent;
  return Boolean(
    decision.eligible &&
    agent &&
    agent.agentId === record.agentId &&
    agent.peerId === record.peerId &&
    agent.instanceId === record.instanceId &&
    agent.lineageDigest === record.lineageDigest &&
    agent.status === "active" &&
    decision.membershipConfigurationDigest ===
      record.membershipConfigurationDigest &&
    decision.membershipEpoch === record.membershipEpoch,
  );
}

function retirementFromRecord(
  record: GovernedInteropSessionRecordV1,
): GovernedInteropRetirementV1 {
  if (
    record.status !== "retired" ||
    !record.retirementDigest ||
    !record.membershipConfigurationDigest ||
    record.membershipEpoch === null ||
    record.retiredAtLogicalMs === null
  )
    throw new TypeError("governed interop retirement record is incomplete");
  return Object.freeze({
    record,
    retired: true,
    peerId: record.peerId,
    membershipConfigurationDigest: record.membershipConfigurationDigest,
    membershipEpoch: record.membershipEpoch,
    retirementDigest: record.retirementDigest,
    retiredAtLogicalMs: record.retiredAtLogicalMs,
  });
}

function canonicalDigests(
  values: readonly string[],
  label: string,
): readonly string[] {
  if (!Array.isArray(values)) throw new TypeError(`${label} is invalid`);
  const result = [...new Set(values)].sort();
  for (const value of result) digest(value, label);
  return Object.freeze(result);
}

function canonicalTokens(
  values: readonly string[],
  label: string,
): readonly string[] {
  if (!Array.isArray(values)) throw new TypeError(`${label} is invalid`);
  const result = [...new Set(values)].sort();
  for (const value of result) token(value, label);
  return Object.freeze(result);
}

function identifier(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u.test(value)
  )
    throw new TypeError(`${label} is invalid`);
}

function token(value: unknown, label: string): asserts value is string {
  identifier(value, label);
}

function compareUtf16CodeUnits(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function digest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value))
    throw new TypeError(`${label} is invalid`);
}

function nullableDigest(value: unknown, label: string): void {
  if (value !== null) digest(value, label);
}

function boundedInteger(
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

function immutableMethod<T extends (...args: never[]) => unknown>(
  value: T,
): PropertyDescriptor {
  return {
    value,
    writable: false,
    configurable: false,
    enumerable: false,
  };
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
