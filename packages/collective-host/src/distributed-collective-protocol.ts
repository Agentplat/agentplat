import type {
  MeshSparseOverlayDigestV2,
  MeshSparsePeerPlanePublishResultV1,
  MeshSparseUpdateV2,
} from "@agentplat/mesh/overlay";
import { collectiveQuorumDigestV1 } from "@agentplat/collective-quorum/crypto";

export const DISTRIBUTED_COLLECTIVE_PROTOCOL_SCHEMA_VERSION_V1 = 1 as const;

export const DISTRIBUTED_COLLECTIVE_MESSAGE_KINDS_V1 = Object.freeze([
  "context.claim",
  "planning.graph",
  "allocation.commitment",
  "allocation.reveal",
  "allocation.plan",
  "allocation.settlement",
  "agreement.share",
  "agreement.finality",
  "semantic.guarantee",
  "mission.signal",
  "role.proposal",
  "checkpoint.available",
] as const);

export type DistributedCollectiveMessageKindV1 =
  (typeof DISTRIBUTED_COLLECTIVE_MESSAGE_KINDS_V1)[number];

export interface DistributedCollectiveUnsignedMessageV1 {
  readonly schemaVersion: 1;
  readonly protocolId: string;
  readonly scopeDigest: string;
  readonly membershipConfigurationDigest: string;
  readonly cycleId: string;
  readonly streamId: string;
  readonly kind: DistributedCollectiveMessageKindV1;
  readonly issuerPeerId: string;
  readonly issuerInstanceId: string;
  readonly issuerKeyId: string;
  readonly sequence: number;
  readonly logicalTimeMs: number;
  readonly expiresAtLogicalMs: number;
  readonly predecessorMessageDigest: string | null;
  /** Stable caller command binding used only for durable reconciliation. */
  readonly commandBindingDigest?: string;
  readonly payloadDigest: string;
  readonly payload: unknown;
}

export interface DistributedCollectiveMessageV1 extends DistributedCollectiveUnsignedMessageV1 {
  readonly messageDigest: string;
  readonly signature: string;
  readonly artifactDigest: MeshSparseOverlayDigestV2;
}

export interface DistributedCollectiveMessageReferenceV1 {
  readonly artifactDigest: MeshSparseOverlayDigestV2;
  readonly messageDigest: string;
  readonly scopeDigest: string;
  readonly membershipConfigurationDigest: string;
  readonly cycleId: string;
  readonly streamId: string;
  readonly kind: DistributedCollectiveMessageKindV1;
  readonly issuerPeerId: string;
  readonly issuerInstanceId: string;
  readonly issuerKeyId: string;
  readonly sequence: number;
  readonly logicalTimeMs: number;
  readonly expiresAtLogicalMs: number;
  readonly predecessorMessageDigest: string | null;
  readonly commandBindingDigest?: string;
}

export interface DistributedCollectiveOutboxRecordV1 {
  readonly reference: DistributedCollectiveMessageReferenceV1;
  readonly topic: string;
  readonly lifetime: number;
  readonly status: "pending" | "published" | "expired";
  readonly publishedUpdateDigest: MeshSparseOverlayDigestV2 | null;
  /** Command-bound publications remain compaction-protected until true. */
  readonly commandAcknowledged?: boolean;
}

export interface DistributedCollectiveProtocolStateV1 {
  readonly schemaVersion: 1;
  readonly protocolId: string;
  readonly scopeDigest: string;
  readonly localPeerId: string;
  readonly localInstanceId: string;
  readonly membershipConfigurationDigest: string;
  readonly revision: number;
  readonly logicalTimeHighWaterMs: number;
  readonly accepted: readonly DistributedCollectiveMessageReferenceV1[];
  readonly outbox: readonly DistributedCollectiveOutboxRecordV1[];
  readonly previousStateDigest: string | null;
  readonly stateDigest: string;
}

export interface DistributedCollectiveProtocolStoreV1 {
  load(
    protocolId: string,
  ): Promise<DistributedCollectiveProtocolStateV1 | null>;
  save(
    state: DistributedCollectiveProtocolStateV1,
    expectedRevision: number | null,
  ): Promise<boolean>;
}

export interface DistributedCollectiveArtifactStoreV1 {
  put(message: DistributedCollectiveMessageV1): Promise<void>;
  get(
    artifactDigest: MeshSparseOverlayDigestV2,
  ): Promise<DistributedCollectiveMessageV1 | null>;
}

export interface DistributedCollectiveAuthenticityPortV1 {
  readonly localKeyId: string;
  sign(messageDigest: string): Promise<string>;
  verify(input: {
    readonly messageDigest: string;
    readonly signature: string;
    readonly issuerPeerId: string;
    readonly issuerInstanceId: string;
    readonly issuerKeyId: string;
    readonly membershipConfigurationDigest: string;
    readonly logicalTimeMs: number;
  }): Promise<boolean>;
}

export interface DistributedCollectiveMembershipPortV1 {
  verifyPeer(input: {
    readonly peerId: string;
    readonly instanceId: string;
    readonly keyId: string;
    readonly membershipConfigurationDigest: string;
    readonly scopeDigest: string;
    readonly logicalTimeMs: number;
  }): Promise<boolean>;
  resolveIndependenceGroup?(input: {
    readonly peerId: string;
    readonly instanceId: string;
    readonly keyId: string;
    readonly membershipConfigurationDigest: string;
  }): Promise<string | null>;
}

/** Narrow surface implemented by MeshSparsePeerPlaneRuntimeV1. */
export interface DistributedCollectiveSparsePlanePortV1 {
  publish(input: {
    readonly topic: string;
    readonly payloadDigest: MeshSparseOverlayDigestV2;
    readonly logicalTime: number;
    readonly lifetime: number;
    readonly fanout?: number;
  }): Promise<MeshSparsePeerPlanePublishResultV1>;
}

export interface DistributedCollectivePublishInputV1 {
  readonly cycleId: string;
  readonly streamId: string;
  readonly kind: DistributedCollectiveMessageKindV1;
  readonly payload: unknown;
  readonly logicalTimeMs: number;
  readonly lifetime: number;
  readonly fanout?: number;
  /**
   * Stable digest of the enclosing durable command. Reusing it with any
   * different publication binding fails closed and never allocates a new
   * stream sequence.
   */
  readonly commandBindingDigest?: string;
}

export interface DistributedCollectivePublishReconciliationInputV1 extends DistributedCollectivePublishInputV1 {
  readonly commandBindingDigest: string;
}

export interface DistributedCollectiveProtocolRuntimeOptionsV1 {
  readonly protocolId: string;
  readonly scopeDigest: string;
  readonly membershipConfigurationDigest: string;
  readonly localPeerId: string;
  readonly localInstanceId: string;
  readonly plane: DistributedCollectiveSparsePlanePortV1;
  readonly artifacts: DistributedCollectiveArtifactStoreV1;
  readonly authenticity: DistributedCollectiveAuthenticityPortV1;
  readonly membership: DistributedCollectiveMembershipPortV1;
  readonly store?: DistributedCollectiveProtocolStoreV1;
  readonly maximumRetainedReferences?: number;
  readonly maximumOutboxRecords?: number;
  readonly maximumCommitAttempts?: number;
  readonly crypto?: Crypto;
}

/** Exact construction-time identities; method replacement does not alter them. */
export interface DistributedCollectiveProtocolAuthorityBindingV1 {
  readonly plane: DistributedCollectiveSparsePlanePortV1;
  readonly artifacts: DistributedCollectiveArtifactStoreV1;
  readonly authenticity: DistributedCollectiveAuthenticityPortV1;
  readonly membership: DistributedCollectiveMembershipPortV1;
  readonly crypto: Crypto | undefined;
}

interface DistributedCollectiveProtocolDependencyInvokersV1 {
  readonly planePublish: DistributedCollectiveSparsePlanePortV1["publish"];
  readonly artifactPut: DistributedCollectiveArtifactStoreV1["put"];
  readonly artifactGet: DistributedCollectiveArtifactStoreV1["get"];
  readonly sign: DistributedCollectiveAuthenticityPortV1["sign"];
  readonly verifyAuthenticity: DistributedCollectiveAuthenticityPortV1["verify"];
  readonly verifyMembership: DistributedCollectiveMembershipPortV1["verifyPeer"];
  readonly storeLoad: DistributedCollectiveProtocolStoreV1["load"];
  readonly storeSave: DistributedCollectiveProtocolStoreV1["save"];
  readonly crypto: Crypto;
}

interface DistributedCollectiveProtocolRuntimeInvokersV1 {
  readonly initialize: (
    logicalTimeMs?: number,
  ) => Promise<DistributedCollectiveProtocolStateV1>;
  readonly load: () => Promise<DistributedCollectiveProtocolStateV1>;
  readonly publish: (
    input: DistributedCollectivePublishInputV1,
  ) => Promise<DistributedCollectiveMessageV1>;
  readonly reconcilePublish: (
    input: DistributedCollectivePublishReconciliationInputV1,
  ) => Promise<DistributedCollectiveMessageV1 | null>;
  readonly acknowledgePublishCommand: (
    commandBindingDigest: string,
  ) => Promise<boolean>;
  readonly flushOutbox: (
    logicalTimeMs: number,
    fanout?: number,
  ) => Promise<number>;
  readonly receive: (
    update: MeshSparseUpdateV2,
    logicalTimeMs: number,
  ) => Promise<DistributedCollectiveReceiveResultV1>;
  readonly messages: (input?: {
    readonly cycleId?: string;
    readonly kind?: DistributedCollectiveMessageKindV1;
    readonly issuerPeerId?: string;
    readonly throughLogicalTimeMs?: number;
  }) => Promise<readonly DistributedCollectiveMessageV1[]>;
}

const distributedCollectiveProtocolDependenciesV1 = new WeakMap<
  object,
  DistributedCollectiveProtocolDependencyInvokersV1
>();
const distributedCollectiveProtocolRuntimeInvokersV1 = new WeakMap<
  object,
  DistributedCollectiveProtocolRuntimeInvokersV1
>();
const distributedCollectiveProtocolAuthorityBindingsV1 = new WeakMap<
  object,
  DistributedCollectiveProtocolAuthorityBindingV1
>();

export interface DistributedCollectiveReceiveResultV1 {
  readonly status: "accepted" | "duplicate" | "deferred" | "rejected";
  readonly reasonCode: string;
  readonly reference: DistributedCollectiveMessageReferenceV1 | null;
}

export class InMemoryDistributedCollectiveProtocolStoreV1 implements DistributedCollectiveProtocolStoreV1 {
  readonly #states = new Map<string, DistributedCollectiveProtocolStateV1>();

  async load(
    protocolId: string,
  ): Promise<DistributedCollectiveProtocolStateV1 | null> {
    const state = this.#states.get(protocolId);
    return state ? immutable(state) : null;
  }

  async save(
    state: DistributedCollectiveProtocolStateV1,
    expectedRevision: number | null,
  ): Promise<boolean> {
    const current = this.#states.get(state.protocolId);
    if (
      (expectedRevision === null &&
        (current !== undefined || state.revision !== 0)) ||
      (expectedRevision !== null &&
        (!current ||
          current.revision !== expectedRevision ||
          state.revision !== expectedRevision + 1))
    )
      return false;
    this.#states.set(state.protocolId, immutable(state));
    return true;
  }
}

export class InMemoryDistributedCollectiveArtifactStoreV1 implements DistributedCollectiveArtifactStoreV1 {
  readonly #messages = new Map<
    MeshSparseOverlayDigestV2,
    DistributedCollectiveMessageV1
  >();

  async put(message: DistributedCollectiveMessageV1): Promise<void> {
    const existing = this.#messages.get(message.artifactDigest);
    if (existing && existing.messageDigest !== message.messageDigest)
      throw new Error("collective artifact digest collision");
    this.#messages.set(message.artifactDigest, immutable(message));
  }

  async get(
    artifactDigest: MeshSparseOverlayDigestV2,
  ): Promise<DistributedCollectiveMessageV1 | null> {
    const message = this.#messages.get(artifactDigest);
    return message ? immutable(message) : null;
  }
}

/**
 * Durable, at-least-once protocol above the sparse overlay. The local state
 * contains only content references; payloads remain in a replaceable
 * content-addressed store. It never requires a collective-wide peer graph.
 */
export class DistributedCollectiveProtocolRuntimeV1 {
  readonly #maximumRetainedReferences: number;
  readonly #maximumOutboxRecords: number;
  readonly #maximumCommitAttempts: number;
  declare readonly options: DistributedCollectiveProtocolRuntimeOptionsV1;
  declare readonly initialize: (
    logicalTimeMs?: number,
  ) => Promise<DistributedCollectiveProtocolStateV1>;
  declare readonly load: () => Promise<DistributedCollectiveProtocolStateV1>;
  declare readonly publish: (
    input: DistributedCollectivePublishInputV1,
  ) => Promise<DistributedCollectiveMessageV1>;
  declare readonly reconcilePublish: (
    input: DistributedCollectivePublishReconciliationInputV1,
  ) => Promise<DistributedCollectiveMessageV1 | null>;
  declare readonly acknowledgePublishCommand: (
    commandBindingDigest: string,
  ) => Promise<boolean>;
  declare readonly flushOutbox: (
    logicalTimeMs: number,
    fanout?: number,
  ) => Promise<number>;
  declare readonly receive: (
    update: MeshSparseUpdateV2,
    logicalTimeMs: number,
  ) => Promise<DistributedCollectiveReceiveResultV1>;
  declare readonly messages: DistributedCollectiveProtocolRuntimeInvokersV1["messages"];

  constructor(input: DistributedCollectiveProtocolRuntimeOptionsV1) {
    const protocolId = input?.protocolId;
    const scopeDigest = input?.scopeDigest;
    const membershipConfigurationDigest = input?.membershipConfigurationDigest;
    const localPeerId = input?.localPeerId;
    const localInstanceId = input?.localInstanceId;
    const plane = input?.plane;
    const artifacts = input?.artifacts;
    const authenticity = input?.authenticity;
    const membership = input?.membership;
    const configuredStore = input?.store;
    const configuredCrypto = input?.crypto;
    const maximumRetainedReferences = input?.maximumRetainedReferences;
    const maximumOutboxRecords = input?.maximumOutboxRecords;
    const maximumCommitAttempts = input?.maximumCommitAttempts;
    const localKeyId = authenticity?.localKeyId;
    const planePublish = plane?.publish;
    const artifactPut = artifacts?.put;
    const artifactGet = artifacts?.get;
    const sign = authenticity?.sign;
    const verifyAuthenticity = authenticity?.verify;
    const verifyMembership = membership?.verifyPeer;
    const resolveIndependenceGroup = membership?.resolveIndependenceGroup;
    const store =
      configuredStore ?? new InMemoryDistributedCollectiveProtocolStoreV1();
    const storeLoad = store?.load;
    const storeSave = store?.save;

    identifier(protocolId, "protocolId");
    digest(scopeDigest, "scopeDigest");
    digest(membershipConfigurationDigest, "membershipConfigurationDigest");
    identifier(localPeerId, "localPeerId");
    identifier(localInstanceId, "localInstanceId");
    identifier(localKeyId, "localKeyId");
    if (!plane || typeof planePublish !== "function")
      throw new TypeError("collective sparse plane is required");
    if (
      !artifacts ||
      typeof artifactPut !== "function" ||
      typeof artifactGet !== "function"
    )
      throw new TypeError("collective artifact store is required");
    if (
      !authenticity ||
      typeof sign !== "function" ||
      typeof verifyAuthenticity !== "function"
    )
      throw new TypeError("collective authenticity port is required");
    if (!membership || typeof verifyMembership !== "function")
      throw new TypeError("collective membership port is required");
    if (typeof storeLoad !== "function" || typeof storeSave !== "function")
      throw new TypeError("collective protocol store is invalid");

    const dependencies: DistributedCollectiveProtocolDependencyInvokersV1 =
      Object.freeze({
        planePublish: planePublish.bind(plane),
        artifactPut: artifactPut.bind(artifacts),
        artifactGet: artifactGet.bind(artifacts),
        sign: sign.bind(authenticity),
        verifyAuthenticity: verifyAuthenticity.bind(authenticity),
        verifyMembership: verifyMembership.bind(membership),
        storeLoad: storeLoad.bind(store),
        storeSave: storeSave.bind(store),
        crypto: captureDigestCrypto(configuredCrypto),
      });
    distributedCollectiveProtocolDependenciesV1.set(this, dependencies);
    distributedCollectiveProtocolAuthorityBindingsV1.set(
      this,
      Object.freeze({
        plane,
        artifacts,
        authenticity,
        membership,
        crypto: configuredCrypto,
      }),
    );

    this.#maximumRetainedReferences = integer(
      maximumRetainedReferences ?? 16_384,
      "maximumRetainedReferences",
      16,
      1_000_000,
    );
    this.#maximumOutboxRecords = integer(
      maximumOutboxRecords ?? 4_096,
      "maximumOutboxRecords",
      1,
      100_000,
    );
    this.#maximumCommitAttempts = integer(
      maximumCommitAttempts ?? 8,
      "maximumCommitAttempts",
      1,
      64,
    );

    const options: DistributedCollectiveProtocolRuntimeOptionsV1 =
      Object.freeze({
        protocolId,
        scopeDigest,
        membershipConfigurationDigest,
        localPeerId,
        localInstanceId,
        plane: Object.freeze({ publish: dependencies.planePublish }),
        artifacts: Object.freeze({
          put: dependencies.artifactPut,
          get: dependencies.artifactGet,
        }),
        authenticity: Object.freeze({
          localKeyId,
          sign: dependencies.sign,
          verify: dependencies.verifyAuthenticity,
        }),
        membership: Object.freeze({
          verifyPeer: dependencies.verifyMembership,
          ...(typeof resolveIndependenceGroup === "function"
            ? {
                resolveIndependenceGroup:
                  resolveIndependenceGroup.bind(membership),
              }
            : {}),
        }),
        store: Object.freeze({
          load: dependencies.storeLoad,
          save: dependencies.storeSave,
        }),
        maximumRetainedReferences: this.#maximumRetainedReferences,
        maximumOutboxRecords: this.#maximumOutboxRecords,
        maximumCommitAttempts: this.#maximumCommitAttempts,
        crypto: dependencies.crypto,
      });
    Object.defineProperty(this, "options", {
      value: options,
      writable: false,
      configurable: false,
      enumerable: true,
    });

    const runtimeInvokers: DistributedCollectiveProtocolRuntimeInvokersV1 =
      Object.freeze({
        initialize: (logicalTimeMs = 0) => this.#initialize(logicalTimeMs),
        load: () => this.#load(),
        publish: (publishInput: DistributedCollectivePublishInputV1) =>
          this.#publish(publishInput),
        reconcilePublish: (
          publishInput: DistributedCollectivePublishReconciliationInputV1,
        ) => this.#reconcilePublish(publishInput),
        acknowledgePublishCommand: (commandBindingDigest: string) =>
          this.#acknowledgePublishCommand(commandBindingDigest),
        flushOutbox: (logicalTimeMs: number, fanout?: number) =>
          this.#flushOutbox(logicalTimeMs, fanout),
        receive: (update: MeshSparseUpdateV2, logicalTimeMs: number) =>
          this.#receive(update, logicalTimeMs),
        messages: (messageInput = {}) => this.#messages(messageInput),
      });
    distributedCollectiveProtocolRuntimeInvokersV1.set(this, runtimeInvokers);
    Object.defineProperties(this, {
      initialize: immutableMethod(runtimeInvokers.initialize),
      load: immutableMethod(runtimeInvokers.load),
      publish: immutableMethod(runtimeInvokers.publish),
      reconcilePublish: immutableMethod(runtimeInvokers.reconcilePublish),
      acknowledgePublishCommand: immutableMethod(
        runtimeInvokers.acknowledgePublishCommand,
      ),
      flushOutbox: immutableMethod(runtimeInvokers.flushOutbox),
      receive: immutableMethod(runtimeInvokers.receive),
      messages: immutableMethod(runtimeInvokers.messages),
    });
  }

  async #initialize(
    logicalTimeMs = 0,
  ): Promise<DistributedCollectiveProtocolStateV1> {
    integer(logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
    const state = await this.#createState({
      schemaVersion: 1,
      protocolId: this.options.protocolId,
      scopeDigest: this.options.scopeDigest,
      localPeerId: this.options.localPeerId,
      localInstanceId: this.options.localInstanceId,
      membershipConfigurationDigest: this.options.membershipConfigurationDigest,
      revision: 0,
      logicalTimeHighWaterMs: logicalTimeMs,
      accepted: [],
      outbox: [],
      previousStateDigest: null,
    });
    if (!(await this.#dependencies().storeSave(state, null)))
      throw new Error("distributed collective protocol already initialized");
    return state;
  }

  async #load(): Promise<DistributedCollectiveProtocolStateV1> {
    const dependencies = this.#dependencies();
    const state = await dependencies.storeLoad(this.options.protocolId);
    if (!state)
      throw new Error("distributed collective protocol is not initialized");
    const validated = await validateDistributedCollectiveProtocolStateV1(
      state,
      {
        maximumRetainedReferences: this.#maximumRetainedReferences,
        maximumOutboxRecords: this.#maximumOutboxRecords,
      },
      dependencies.crypto,
    );
    if (
      validated.protocolId !== this.options.protocolId ||
      validated.scopeDigest !== this.options.scopeDigest ||
      validated.localPeerId !== this.options.localPeerId ||
      validated.localInstanceId !== this.options.localInstanceId ||
      validated.membershipConfigurationDigest !==
        this.options.membershipConfigurationDigest
    )
      throw new TypeError(
        "distributed collective protocol state binding is invalid",
      );
    return validated;
  }

  async #publish(
    input: DistributedCollectivePublishInputV1,
  ): Promise<DistributedCollectiveMessageV1> {
    validateKind(input.kind);
    identifier(input.cycleId, "cycleId");
    identifier(input.streamId, "streamId");
    integer(input.logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
    integer(input.lifetime, "lifetime", 1, Number.MAX_SAFE_INTEGER);
    if (input.logicalTimeMs > Number.MAX_SAFE_INTEGER - input.lifetime)
      throw new RangeError(
        "collective message lifetime overflows logical time",
      );
    if (input.fanout !== undefined)
      integer(input.fanout, "fanout", 1, 1_000_000);
    if (input.commandBindingDigest !== undefined)
      digest(input.commandBindingDigest, "commandBindingDigest");
    const dependencies = this.#dependencies();
    if (input.commandBindingDigest !== undefined) {
      const recovered = await this.#reconcilePublish({
        ...input,
        commandBindingDigest: input.commandBindingDigest,
      });
      if (recovered) return recovered;
    }
    if (
      !(await dependencies.verifyMembership({
        peerId: this.options.localPeerId,
        instanceId: this.options.localInstanceId,
        keyId: this.options.authenticity.localKeyId,
        membershipConfigurationDigest:
          this.options.membershipConfigurationDigest,
        scopeDigest: this.options.scopeDigest,
        logicalTimeMs: input.logicalTimeMs,
      }))
    )
      throw new Error("local collective membership is not active");
    const payloadDigest = await collectiveQuorumDigestV1(
      { domain: "distributed-collective-payload-v1", body: input.payload },
      dependencies.crypto,
    );

    for (let attempt = 0; attempt < this.#maximumCommitAttempts; attempt += 1) {
      const current = await this.#load();
      if (
        input.commandBindingDigest !== undefined &&
        current.accepted.some(
          (reference) =>
            reference.issuerPeerId === this.options.localPeerId &&
            reference.issuerInstanceId === this.options.localInstanceId &&
            reference.commandBindingDigest === input.commandBindingDigest,
        )
      ) {
        const recovered = await this.#reconcilePublish({
          ...input,
          commandBindingDigest: input.commandBindingDigest,
        });
        if (recovered) return recovered;
        throw new Error("collective command binding became unavailable");
      }
      if (input.logicalTimeMs < current.logicalTimeHighWaterMs)
        throw new Error("collective protocol logical time rollback");
      const prior = [...current.accepted]
        .reverse()
        .find(
          (item) =>
            item.issuerPeerId === this.options.localPeerId &&
            item.issuerInstanceId === this.options.localInstanceId &&
            item.streamId === input.streamId,
        );
      const unsigned: DistributedCollectiveUnsignedMessageV1 = {
        schemaVersion: 1,
        protocolId: this.options.protocolId,
        scopeDigest: this.options.scopeDigest,
        membershipConfigurationDigest:
          this.options.membershipConfigurationDigest,
        cycleId: input.cycleId,
        streamId: input.streamId,
        kind: input.kind,
        issuerPeerId: this.options.localPeerId,
        issuerInstanceId: this.options.localInstanceId,
        issuerKeyId: this.options.authenticity.localKeyId,
        sequence: (prior?.sequence ?? 0) + 1,
        logicalTimeMs: input.logicalTimeMs,
        expiresAtLogicalMs: input.logicalTimeMs + input.lifetime,
        predecessorMessageDigest: prior?.messageDigest ?? null,
        ...(input.commandBindingDigest === undefined
          ? {}
          : { commandBindingDigest: input.commandBindingDigest }),
        payloadDigest,
        payload: immutable(input.payload),
      };
      const messageDigest = await distributedCollectiveMessageDigestV1(
        unsigned,
        dependencies.crypto,
      );
      const signature = dependencies.sign(messageDigest);
      const signedBody = {
        ...unsigned,
        messageDigest,
        signature: await signature,
      };
      const message = immutable({
        ...signedBody,
        artifactDigest: await distributedCollectiveArtifactDigestV1(
          signedBody,
          dependencies.crypto,
        ),
      });
      await dependencies.artifactPut(message);
      const reference = referenceOf(message);
      const protectedRecords = current.outbox.filter(
        (item) =>
          item.status === "pending" ||
          (item.reference.commandBindingDigest !== undefined &&
            item.commandAcknowledged !== true),
      );
      if (protectedRecords.length >= this.#maximumOutboxRecords)
        throw new Error("collective protocol outbox capacity exhausted");
      const settledCapacity =
        this.#maximumOutboxRecords - protectedRecords.length - 1;
      const settled =
        settledCapacity > 0
          ? current.outbox
              .filter(
                (item) =>
                  item.status === "published" &&
                  !protectedRecords.includes(item),
              )
              .slice(-settledCapacity)
          : [];
      const nextOutbox: readonly DistributedCollectiveOutboxRecordV1[] = [
        ...settled,
        ...protectedRecords,
        {
          reference,
          topic: topicForKind(input.kind),
          lifetime: input.lifetime,
          status: "pending" as const,
          publishedUpdateDigest: null,
          ...(input.commandBindingDigest === undefined
            ? {}
            : { commandAcknowledged: false }),
        },
      ];
      const next = await this.#createState({
        ...current,
        revision: current.revision + 1,
        logicalTimeHighWaterMs: input.logicalTimeMs,
        accepted: retainReferences(
          [...current.accepted, reference],
          this.#maximumRetainedReferences,
          nextOutbox.map((item) => item.reference.messageDigest),
        ),
        outbox: nextOutbox,
        previousStateDigest: current.stateDigest,
      });
      if (await dependencies.storeSave(next, current.revision)) {
        await this.#flushOutbox(input.logicalTimeMs, input.fanout);
        return message;
      }
    }
    throw new Error("collective protocol publish contention exhausted");
  }

  async #reconcilePublish(
    input: DistributedCollectivePublishReconciliationInputV1,
  ): Promise<DistributedCollectiveMessageV1 | null> {
    validatePublishInput(input);
    const dependencies = this.#dependencies();
    const state = await this.#load();
    const matches = state.accepted.filter(
      (reference) =>
        reference.issuerPeerId === this.options.localPeerId &&
        reference.issuerInstanceId === this.options.localInstanceId &&
        reference.commandBindingDigest === input.commandBindingDigest,
    );
    if (matches.length === 0) return null;
    if (matches.length !== 1)
      throw new Error("collective command binding is not unique");
    const message = await dependencies.artifactGet(matches[0]!.artifactDigest);
    if (!message || message.messageDigest !== matches[0]!.messageDigest)
      throw new Error("collective command artifact is unavailable");
    const validated = await validateDistributedCollectiveMessageV1(
      message,
      dependencies.crypto,
    );
    const expectedPayloadDigest = await collectiveQuorumDigestV1(
      { domain: "distributed-collective-payload-v1", body: input.payload },
      dependencies.crypto,
    );
    if (
      validated.protocolId !== this.options.protocolId ||
      validated.scopeDigest !== this.options.scopeDigest ||
      validated.membershipConfigurationDigest !==
        this.options.membershipConfigurationDigest ||
      validated.issuerPeerId !== this.options.localPeerId ||
      validated.issuerInstanceId !== this.options.localInstanceId ||
      validated.commandBindingDigest !== input.commandBindingDigest ||
      validated.cycleId !== input.cycleId ||
      validated.streamId !== input.streamId ||
      validated.kind !== input.kind ||
      validated.logicalTimeMs !== input.logicalTimeMs ||
      validated.expiresAtLogicalMs !== input.logicalTimeMs + input.lifetime ||
      validated.payloadDigest !== expectedPayloadDigest
    )
      throw new Error("collective command binding mismatch");
    return validated;
  }

  async #acknowledgePublishCommand(
    commandBindingDigest: string,
  ): Promise<boolean> {
    digest(commandBindingDigest, "commandBindingDigest");
    for (let attempt = 0; attempt < this.#maximumCommitAttempts; attempt += 1) {
      const current = await this.#load();
      const record = current.outbox.find(
        (item) =>
          item.reference.issuerPeerId === this.options.localPeerId &&
          item.reference.issuerInstanceId === this.options.localInstanceId &&
          item.reference.commandBindingDigest === commandBindingDigest,
      );
      if (!record) return false;
      if (record.commandAcknowledged === true) return true;
      const next = await this.#createState({
        ...current,
        revision: current.revision + 1,
        outbox: current.outbox.map((item) =>
          item.reference.messageDigest === record.reference.messageDigest
            ? { ...item, commandAcknowledged: true }
            : item,
        ),
        previousStateDigest: current.stateDigest,
      });
      if (await this.#dependencies().storeSave(next, current.revision))
        return true;
    }
    throw new Error("collective command acknowledgement contention exhausted");
  }

  async #flushOutbox(logicalTimeMs: number, fanout?: number): Promise<number> {
    integer(logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
    if (fanout !== undefined) integer(fanout, "fanout", 1, 1_000_000);
    let published = 0;
    for (;;) {
      const dependencies = this.#dependencies();
      const current = await this.#load();
      const record = current.outbox.find((item) => item.status === "pending");
      if (!record) return published;
      if (record.reference.expiresAtLogicalMs <= logicalTimeMs) {
        await this.#dropExpiredOutbox(
          current,
          record.reference.messageDigest,
          logicalTimeMs,
        );
        continue;
      }
      const result = await dependencies.planePublish({
        topic: record.topic,
        payloadDigest: record.reference.artifactDigest,
        logicalTime: logicalTimeMs,
        lifetime: record.reference.expiresAtLogicalMs - logicalTimeMs,
        ...(fanout === undefined ? {} : { fanout }),
      });
      const next = await this.#createState({
        ...current,
        revision: current.revision + 1,
        logicalTimeHighWaterMs: Math.max(
          current.logicalTimeHighWaterMs,
          logicalTimeMs,
        ),
        outbox: current.outbox.map((item) =>
          item.reference.messageDigest === record.reference.messageDigest
            ? {
                ...item,
                status: "published" as const,
                publishedUpdateDigest: result.update.updateDigest,
              }
            : item,
        ),
        previousStateDigest: current.stateDigest,
      });
      if (await dependencies.storeSave(next, current.revision)) published += 1;
    }
  }

  async #receive(
    update: MeshSparseUpdateV2,
    logicalTimeMs: number,
  ): Promise<DistributedCollectiveReceiveResultV1> {
    integer(logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
    const dependencies = this.#dependencies();
    const message = await dependencies.artifactGet(update.payloadDigest);
    if (!message)
      return result("deferred", "collective_artifact_unavailable", null);
    try {
      await validateDistributedCollectiveMessageV1(
        message,
        dependencies.crypto,
      );
    } catch {
      return result("rejected", "collective_message_invalid", null);
    }
    const reference = referenceOf(message);
    if (
      update.topic !== topicForKind(message.kind) ||
      message.artifactDigest !== update.payloadDigest ||
      message.protocolId !== this.options.protocolId ||
      message.scopeDigest !== this.options.scopeDigest ||
      message.membershipConfigurationDigest !==
        this.options.membershipConfigurationDigest ||
      logicalTimeMs < message.logicalTimeMs ||
      logicalTimeMs >= message.expiresAtLogicalMs
    )
      return result(
        "rejected",
        "collective_message_binding_invalid",
        reference,
      );
    if (
      !(await dependencies.verifyMembership({
        peerId: message.issuerPeerId,
        instanceId: message.issuerInstanceId,
        keyId: message.issuerKeyId,
        membershipConfigurationDigest: message.membershipConfigurationDigest,
        scopeDigest: message.scopeDigest,
        logicalTimeMs,
      }))
    )
      return result("rejected", "collective_membership_unverified", reference);
    if (
      !(await dependencies.verifyAuthenticity({
        messageDigest: message.messageDigest,
        signature: message.signature,
        issuerPeerId: message.issuerPeerId,
        issuerInstanceId: message.issuerInstanceId,
        issuerKeyId: message.issuerKeyId,
        membershipConfigurationDigest: message.membershipConfigurationDigest,
        logicalTimeMs,
      }))
    )
      return result("rejected", "collective_signature_unverified", reference);

    for (let attempt = 0; attempt < this.#maximumCommitAttempts; attempt += 1) {
      const current = await this.#load();
      if (
        current.accepted.some(
          (item) => item.messageDigest === message.messageDigest,
        )
      )
        return result("duplicate", "collective_message_duplicate", reference);
      const sameSequence = current.accepted.find(
        (item) =>
          item.issuerPeerId === message.issuerPeerId &&
          item.issuerInstanceId === message.issuerInstanceId &&
          item.streamId === message.streamId &&
          item.sequence === message.sequence,
      );
      if (sameSequence)
        return result("rejected", "collective_stream_equivocation", reference);
      if (message.sequence === 1) {
        if (message.predecessorMessageDigest !== null)
          return result(
            "rejected",
            "collective_genesis_predecessor_invalid",
            reference,
          );
      } else {
        const predecessor = current.accepted.find(
          (item) => item.messageDigest === message.predecessorMessageDigest,
        );
        if (!predecessor)
          return result(
            "deferred",
            "collective_predecessor_unavailable",
            reference,
          );
        if (
          predecessor.issuerPeerId !== message.issuerPeerId ||
          predecessor.issuerInstanceId !== message.issuerInstanceId ||
          predecessor.streamId !== message.streamId ||
          predecessor.sequence + 1 !== message.sequence ||
          predecessor.logicalTimeMs > message.logicalTimeMs
        )
          return result(
            "rejected",
            "collective_predecessor_binding_invalid",
            reference,
          );
      }
      const next = await this.#createState({
        ...current,
        revision: current.revision + 1,
        logicalTimeHighWaterMs: Math.max(
          current.logicalTimeHighWaterMs,
          logicalTimeMs,
        ),
        accepted: retainReferences(
          [...current.accepted, reference],
          this.#maximumRetainedReferences,
          current.outbox.map((item) => item.reference.messageDigest),
        ),
        previousStateDigest: current.stateDigest,
      });
      if (await dependencies.storeSave(next, current.revision))
        return result("accepted", "collective_message_accepted", reference);
    }
    return result("deferred", "collective_receive_contention", reference);
  }

  async #messages(
    input: {
      readonly cycleId?: string;
      readonly kind?: DistributedCollectiveMessageKindV1;
      readonly issuerPeerId?: string;
      readonly throughLogicalTimeMs?: number;
    } = {},
  ): Promise<readonly DistributedCollectiveMessageV1[]> {
    if (input.cycleId !== undefined) identifier(input.cycleId, "cycleId");
    if (input.kind !== undefined) validateKind(input.kind);
    if (input.issuerPeerId !== undefined)
      identifier(input.issuerPeerId, "issuerPeerId");
    if (input.throughLogicalTimeMs !== undefined)
      integer(
        input.throughLogicalTimeMs,
        "throughLogicalTimeMs",
        0,
        Number.MAX_SAFE_INTEGER,
      );
    const dependencies = this.#dependencies();
    const state = await this.#load();
    const references = state.accepted.filter(
      (item) =>
        (input.cycleId === undefined || item.cycleId === input.cycleId) &&
        (input.kind === undefined || item.kind === input.kind) &&
        (input.issuerPeerId === undefined ||
          item.issuerPeerId === input.issuerPeerId) &&
        (input.throughLogicalTimeMs === undefined ||
          item.logicalTimeMs <= input.throughLogicalTimeMs),
    );
    const resolved: DistributedCollectiveMessageV1[] = [];
    for (const reference of references) {
      const message = await dependencies.artifactGet(reference.artifactDigest);
      if (
        !message ||
        message.messageDigest !== reference.messageDigest ||
        message.protocolId !== this.options.protocolId ||
        message.scopeDigest !== this.options.scopeDigest ||
        message.membershipConfigurationDigest !==
          this.options.membershipConfigurationDigest
      )
        throw new Error("accepted collective artifact is unavailable");
      const validated = await validateDistributedCollectiveMessageV1(
        message,
        dependencies.crypto,
      );
      if (
        !(await dependencies.verifyMembership({
          peerId: validated.issuerPeerId,
          instanceId: validated.issuerInstanceId,
          keyId: validated.issuerKeyId,
          membershipConfigurationDigest:
            validated.membershipConfigurationDigest,
          scopeDigest: validated.scopeDigest,
          logicalTimeMs: validated.logicalTimeMs,
        })) ||
        !(await dependencies.verifyAuthenticity({
          messageDigest: validated.messageDigest,
          signature: validated.signature,
          issuerPeerId: validated.issuerPeerId,
          issuerInstanceId: validated.issuerInstanceId,
          issuerKeyId: validated.issuerKeyId,
          membershipConfigurationDigest:
            validated.membershipConfigurationDigest,
          logicalTimeMs: validated.logicalTimeMs,
        }))
      )
        throw new Error(
          "accepted collective artifact cannot be reauthenticated",
        );
      resolved.push(validated);
    }
    return immutable(resolved.sort(compareMessages));
  }

  async #dropExpiredOutbox(
    current: DistributedCollectiveProtocolStateV1,
    messageDigest: string,
    logicalTimeMs: number,
  ): Promise<void> {
    const next = await this.#createState({
      ...current,
      revision: current.revision + 1,
      logicalTimeHighWaterMs: Math.max(
        current.logicalTimeHighWaterMs,
        logicalTimeMs,
      ),
      outbox: current.outbox.flatMap((item) => {
        if (item.reference.messageDigest !== messageDigest) return [item];
        if (
          item.reference.commandBindingDigest !== undefined &&
          item.commandAcknowledged !== true
        )
          return [{ ...item, status: "expired" as const }];
        return [];
      }),
      previousStateDigest: current.stateDigest,
    });
    await this.#dependencies().storeSave(next, current.revision);
  }

  async #createState(
    input: Omit<DistributedCollectiveProtocolStateV1, "stateDigest">,
  ): Promise<DistributedCollectiveProtocolStateV1> {
    const { stateDigest: _staleDigest, ...body } =
      input as DistributedCollectiveProtocolStateV1;
    return immutable({
      ...body,
      stateDigest: await collectiveQuorumDigestV1(
        { domain: "distributed-collective-protocol-state-v1", body },
        this.#dependencies().crypto,
      ),
    });
  }

  #dependencies(): DistributedCollectiveProtocolDependencyInvokersV1 {
    const dependencies = distributedCollectiveProtocolDependenciesV1.get(this);
    if (!dependencies)
      throw new TypeError("distributed collective protocol is not genuine");
    return dependencies;
  }
}

/** Nominal runtime check; structural lookalikes and prototype-only objects fail. */
export function isDistributedCollectiveProtocolRuntimeV1(
  value: unknown,
): value is DistributedCollectiveProtocolRuntimeV1 {
  return (
    typeof value === "object" &&
    value !== null &&
    distributedCollectiveProtocolRuntimeInvokersV1.has(value) &&
    distributedCollectiveProtocolDependenciesV1.has(value) &&
    distributedCollectiveProtocolAuthorityBindingsV1.has(value)
  );
}

/** Checks every construction-time environmental authority by object identity. */
export function isDistributedCollectiveProtocolBoundToV1(
  runtime: unknown,
  binding: DistributedCollectiveProtocolAuthorityBindingV1,
): runtime is DistributedCollectiveProtocolRuntimeV1 {
  if (!isDistributedCollectiveProtocolRuntimeV1(runtime) || !binding)
    return false;
  const retained =
    distributedCollectiveProtocolAuthorityBindingsV1.get(runtime)!;
  return (
    retained.plane === binding.plane &&
    retained.artifacts === binding.artifacts &&
    retained.authenticity === binding.authenticity &&
    retained.membership === binding.membership &&
    retained.crypto === binding.crypto
  );
}

export async function distributedCollectiveMessageDigestV1(
  message: DistributedCollectiveUnsignedMessageV1,
  crypto?: Crypto,
): Promise<string> {
  return collectiveQuorumDigestV1(
    { domain: "distributed-collective-message-v1", body: message },
    crypto,
  );
}

export async function distributedCollectiveArtifactDigestV1(
  message: Omit<DistributedCollectiveMessageV1, "artifactDigest">,
  crypto?: Crypto,
): Promise<MeshSparseOverlayDigestV2> {
  const hex = await collectiveQuorumDigestV1(
    { domain: "distributed-collective-artifact-v1", body: message },
    crypto,
  );
  return hexDigestToOverlayDigest(hex);
}

export async function validateDistributedCollectiveMessageV1(
  input: DistributedCollectiveMessageV1,
  crypto?: Crypto,
): Promise<DistributedCollectiveMessageV1> {
  if (!input || input.schemaVersion !== 1)
    throw new TypeError("distributed collective message schema is invalid");
  identifier(input.protocolId, "protocolId");
  digest(input.scopeDigest, "scopeDigest");
  digest(input.membershipConfigurationDigest, "membershipConfigurationDigest");
  identifier(input.cycleId, "cycleId");
  identifier(input.streamId, "streamId");
  validateKind(input.kind);
  identifier(input.issuerPeerId, "issuerPeerId");
  identifier(input.issuerInstanceId, "issuerInstanceId");
  identifier(input.issuerKeyId, "issuerKeyId");
  integer(input.sequence, "sequence", 1, Number.MAX_SAFE_INTEGER);
  integer(input.logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
  integer(
    input.expiresAtLogicalMs,
    "expiresAtLogicalMs",
    input.logicalTimeMs + 1,
    Number.MAX_SAFE_INTEGER,
  );
  if (input.predecessorMessageDigest !== null)
    digest(input.predecessorMessageDigest, "predecessorMessageDigest");
  if (input.commandBindingDigest !== undefined)
    digest(input.commandBindingDigest, "commandBindingDigest");
  digest(input.payloadDigest, "payloadDigest");
  digest(input.messageDigest, "messageDigest");
  token(input.signature, "signature", 65_536);
  overlayDigest(input.artifactDigest, "artifactDigest");
  if (
    (await collectiveQuorumDigestV1(
      { domain: "distributed-collective-payload-v1", body: input.payload },
      crypto,
    )) !== input.payloadDigest
  )
    throw new TypeError("collective payload digest is invalid");
  const { messageDigest, signature, artifactDigest, ...unsigned } = input;
  if (
    (await distributedCollectiveMessageDigestV1(unsigned, crypto)) !==
    messageDigest
  )
    throw new TypeError("collective message digest is invalid");
  if (
    (await distributedCollectiveArtifactDigestV1(
      { ...unsigned, messageDigest, signature },
      crypto,
    )) !== artifactDigest
  )
    throw new TypeError("collective artifact digest is invalid");
  return immutable(input);
}

export async function validateDistributedCollectiveProtocolStateV1(
  input: DistributedCollectiveProtocolStateV1,
  limits: {
    readonly maximumRetainedReferences: number;
    readonly maximumOutboxRecords: number;
  },
  crypto?: Crypto,
): Promise<DistributedCollectiveProtocolStateV1> {
  if (!input || input.schemaVersion !== 1)
    throw new TypeError(
      "distributed collective protocol state schema is invalid",
    );
  identifier(input.protocolId, "protocolId");
  digest(input.scopeDigest, "scopeDigest");
  identifier(input.localPeerId, "localPeerId");
  identifier(input.localInstanceId, "localInstanceId");
  digest(input.membershipConfigurationDigest, "membershipConfigurationDigest");
  integer(input.revision, "revision", 0, Number.MAX_SAFE_INTEGER);
  integer(
    input.logicalTimeHighWaterMs,
    "logicalTimeHighWaterMs",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  integer(
    limits.maximumRetainedReferences,
    "maximumRetainedReferences",
    16,
    1_000_000,
  );
  integer(limits.maximumOutboxRecords, "maximumOutboxRecords", 1, 100_000);
  if (input.accepted.length > limits.maximumRetainedReferences)
    throw new RangeError("collective accepted reference capacity exceeded");
  if (input.outbox.length > limits.maximumOutboxRecords)
    throw new RangeError("collective outbox capacity exceeded");
  const messages = new Set<string>();
  const streamSequences = new Set<string>();
  const localCommandBindings = new Set<string>();
  for (const reference of input.accepted) {
    validateReference(reference, input);
    if (messages.has(reference.messageDigest))
      throw new TypeError("collective accepted message duplicated");
    messages.add(reference.messageDigest);
    const sequenceKey = `${reference.issuerPeerId}\u0000${reference.issuerInstanceId}\u0000${reference.streamId}\u0000${reference.sequence}`;
    if (streamSequences.has(sequenceKey))
      throw new TypeError("collective stream sequence duplicated");
    streamSequences.add(sequenceKey);
    if (
      reference.issuerPeerId === input.localPeerId &&
      reference.issuerInstanceId === input.localInstanceId &&
      reference.commandBindingDigest !== undefined
    ) {
      if (localCommandBindings.has(reference.commandBindingDigest))
        throw new TypeError("collective local command binding is duplicated");
      localCommandBindings.add(reference.commandBindingDigest);
    }
  }
  for (const record of input.outbox) {
    validateReference(record.reference, input);
    if (
      record.reference.issuerPeerId !== input.localPeerId ||
      record.reference.issuerInstanceId !== input.localInstanceId ||
      !messages.has(record.reference.messageDigest)
    )
      throw new TypeError("collective outbox reference is invalid");
    identifier(record.topic, "outbox.topic");
    integer(record.lifetime, "outbox.lifetime", 1, Number.MAX_SAFE_INTEGER);
    if (
      record.status !== "pending" &&
      record.status !== "published" &&
      record.status !== "expired"
    )
      throw new TypeError("collective outbox status is invalid");
    if (
      (record.status === "published") !==
      (record.publishedUpdateDigest !== null)
    )
      throw new TypeError("collective outbox publication binding is invalid");
    if (record.publishedUpdateDigest !== null)
      overlayDigest(record.publishedUpdateDigest, "publishedUpdateDigest");
    if (
      record.commandAcknowledged !== undefined &&
      typeof record.commandAcknowledged !== "boolean"
    )
      throw new TypeError("collective command acknowledgement is invalid");
    if (
      record.reference.commandBindingDigest === undefined &&
      record.commandAcknowledged !== undefined
    )
      throw new TypeError(
        "collective command acknowledgement binding is invalid",
      );
  }
  if (
    new Set(input.outbox.map((item) => item.reference.messageDigest)).size !==
    input.outbox.length
  )
    throw new TypeError("collective outbox record is duplicated");
  if ((input.revision === 0) !== (input.previousStateDigest === null))
    throw new TypeError("collective protocol state lineage is invalid");
  if (input.previousStateDigest !== null)
    digest(input.previousStateDigest, "previousStateDigest");
  const { stateDigest, ...body } = input;
  digest(stateDigest, "stateDigest");
  if (
    (await collectiveQuorumDigestV1(
      { domain: "distributed-collective-protocol-state-v1", body },
      crypto,
    )) !== stateDigest
  )
    throw new TypeError("collective protocol state digest is invalid");
  return immutable(input);
}

function validateReference(
  input: DistributedCollectiveMessageReferenceV1,
  state: DistributedCollectiveProtocolStateV1,
): void {
  overlayDigest(input.artifactDigest, "artifactDigest");
  digest(input.messageDigest, "messageDigest");
  digest(input.scopeDigest, "scopeDigest");
  digest(input.membershipConfigurationDigest, "membershipConfigurationDigest");
  if (
    input.scopeDigest !== state.scopeDigest ||
    input.membershipConfigurationDigest !== state.membershipConfigurationDigest
  )
    throw new TypeError("collective reference scope is invalid");
  identifier(input.cycleId, "cycleId");
  identifier(input.streamId, "streamId");
  validateKind(input.kind);
  identifier(input.issuerPeerId, "issuerPeerId");
  identifier(input.issuerInstanceId, "issuerInstanceId");
  identifier(input.issuerKeyId, "issuerKeyId");
  integer(input.sequence, "sequence", 1, Number.MAX_SAFE_INTEGER);
  integer(
    input.logicalTimeMs,
    "logicalTimeMs",
    0,
    state.logicalTimeHighWaterMs,
  );
  integer(
    input.expiresAtLogicalMs,
    "expiresAtLogicalMs",
    input.logicalTimeMs + 1,
    Number.MAX_SAFE_INTEGER,
  );
  if (input.predecessorMessageDigest !== null)
    digest(input.predecessorMessageDigest, "predecessorMessageDigest");
  if (input.commandBindingDigest !== undefined)
    digest(input.commandBindingDigest, "commandBindingDigest");
}

function referenceOf(
  message: DistributedCollectiveMessageV1,
): DistributedCollectiveMessageReferenceV1 {
  return immutable({
    artifactDigest: message.artifactDigest,
    messageDigest: message.messageDigest,
    scopeDigest: message.scopeDigest,
    membershipConfigurationDigest: message.membershipConfigurationDigest,
    cycleId: message.cycleId,
    streamId: message.streamId,
    kind: message.kind,
    issuerPeerId: message.issuerPeerId,
    issuerInstanceId: message.issuerInstanceId,
    issuerKeyId: message.issuerKeyId,
    sequence: message.sequence,
    logicalTimeMs: message.logicalTimeMs,
    expiresAtLogicalMs: message.expiresAtLogicalMs,
    predecessorMessageDigest: message.predecessorMessageDigest,
    ...(message.commandBindingDigest === undefined
      ? {}
      : { commandBindingDigest: message.commandBindingDigest }),
  });
}

function validatePublishInput(
  input: DistributedCollectivePublishReconciliationInputV1,
): void {
  if (!input) throw new TypeError("collective publish input is required");
  validateKind(input.kind);
  identifier(input.cycleId, "cycleId");
  identifier(input.streamId, "streamId");
  digest(input.commandBindingDigest, "commandBindingDigest");
  integer(input.logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
  integer(input.lifetime, "lifetime", 1, Number.MAX_SAFE_INTEGER);
  if (input.logicalTimeMs > Number.MAX_SAFE_INTEGER - input.lifetime)
    throw new RangeError("collective message lifetime overflows logical time");
  if (input.fanout !== undefined) integer(input.fanout, "fanout", 1, 1_000_000);
}

function retainReferences(
  references: readonly DistributedCollectiveMessageReferenceV1[],
  maximum: number,
  requiredMessageDigests: readonly string[] = [],
): readonly DistributedCollectiveMessageReferenceV1[] {
  const required = new Set(requiredMessageDigests);
  const latestByStream = new Map<
    string,
    DistributedCollectiveMessageReferenceV1
  >();
  for (const reference of references) {
    const key = `${reference.issuerPeerId}\u0000${reference.issuerInstanceId}\u0000${reference.streamId}`;
    const current = latestByStream.get(key);
    if (!current || reference.sequence > current.sequence)
      latestByStream.set(key, reference);
  }
  for (const reference of latestByStream.values())
    required.add(reference.messageDigest);
  if (required.size > maximum)
    throw new Error(
      "collective protocol reference capacity cannot preserve causal heads",
    );
  const selected = new Set(required);
  for (
    let index = references.length - 1;
    index >= 0 && selected.size < maximum;
    index -= 1
  )
    selected.add(references[index]!.messageDigest);
  return immutable(
    references.filter((item) => selected.has(item.messageDigest)),
  );
}

function compareMessages(
  left: DistributedCollectiveMessageV1,
  right: DistributedCollectiveMessageV1,
): number {
  return (
    left.logicalTimeMs - right.logicalTimeMs ||
    left.issuerPeerId.localeCompare(right.issuerPeerId) ||
    left.streamId.localeCompare(right.streamId) ||
    left.sequence - right.sequence ||
    left.messageDigest.localeCompare(right.messageDigest)
  );
}

function topicForKind(kind: DistributedCollectiveMessageKindV1): string {
  if (kind.startsWith("context.")) return "collective.context";
  if (kind.startsWith("planning.")) return "collective.planning";
  if (kind.startsWith("allocation.")) return "collective.allocation";
  if (kind.startsWith("agreement.")) return "collective.agreement";
  if (kind.startsWith("semantic.") || kind.startsWith("role."))
    return "collective.control";
  return "collective.execution";
}

function result(
  status: DistributedCollectiveReceiveResultV1["status"],
  reasonCode: string,
  reference: DistributedCollectiveMessageReferenceV1 | null,
): DistributedCollectiveReceiveResultV1 {
  return Object.freeze({ status, reasonCode, reference });
}

function hexDigestToOverlayDigest(
  hexDigest: string,
): MeshSparseOverlayDigestV2 {
  digest(hexDigest, "hexDigest");
  const bytes = new Uint8Array(32);
  for (let index = 0; index < bytes.length; index += 1)
    bytes[index] = Number.parseInt(
      hexDigest.slice(7 + index * 2, 9 + index * 2),
      16,
    );
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let base64 = "";
  for (let index = 0; index < binary.length; index += 3) {
    const first = binary.charCodeAt(index);
    const second = index + 1 < binary.length ? binary.charCodeAt(index + 1) : 0;
    const third = index + 2 < binary.length ? binary.charCodeAt(index + 2) : 0;
    const block = (first << 16) | (second << 8) | third;
    base64 += alphabet[(block >>> 18) & 63];
    base64 += alphabet[(block >>> 12) & 63];
    base64 += index + 1 < binary.length ? alphabet[(block >>> 6) & 63] : "=";
    base64 += index + 2 < binary.length ? alphabet[block & 63] : "=";
  }
  return `sha256:${base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "")}`;
}

function validateKind(
  value: unknown,
): asserts value is DistributedCollectiveMessageKindV1 {
  if (
    !(DISTRIBUTED_COLLECTIVE_MESSAGE_KINDS_V1 as readonly unknown[]).includes(
      value,
    )
  )
    throw new TypeError("distributed collective message kind is invalid");
}

function identifier(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u.test(value)
  )
    throw new TypeError(`${label} is invalid`);
}

function token(
  value: unknown,
  label: string,
  maximumBytes: number,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    new TextEncoder().encode(value).byteLength > maximumBytes
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
    throw new TypeError("collective digest crypto capability is required");
  return Object.freeze({
    subtle: Object.freeze({ digest: digestMethod.bind(subtle) }),
  }) as unknown as Crypto;
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
