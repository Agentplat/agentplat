/**
 * Server-only, opt-in bridge between authenticated Mesh envelopes and Trust.
 * It is deliberately not exported by the Mesh root entrypoint.
 */
import type { MeshCryptoPolicy, MeshKeyResolver } from "@agentplat/mesh-crypto";
import { verifyMeshEnvelope } from "@agentplat/mesh-crypto";
import {
  canonicalizeMeshJson,
  validateMeshEnvelopeContext,
  type MeshProtocolOptions,
  type SignedMeshEnvelope,
  type VerifiedMeshEnvelope,
} from "@agentplat/mesh-protocol";
import {
  normalizeMeshEvidenceAttestationV1,
  normalizeMeshEvidenceChallengeV1,
  normalizeMeshEvidenceClaimV1,
  normalizeMeshEvidenceRetractionV1,
  normalizeMeshTrustObservationV1,
} from "@agentplat/trust/mesh-records";
import {
  digestTrustJsonV1,
  reduceEvidenceTrustStateV1,
  sha256TrustBytesV1,
  type EvidenceRecordV1,
  type EvidenceTrustStateV1,
  type TrustObservationV1,
} from "@agentplat/trust";

const trustDigestPattern = /^[0-9a-f]{64}$/;
const maximumOriginProofs = 4_096;
const maximumRemoteObservations = 4_096;
const maximumAuthorityDigests = 32;
/** Unforgeable, adapter-bound handoff from the verified processor. */
const concreteAdapterCapabilities = new WeakMap<object, object>();
const authorizedAdapterInvocations = new WeakMap<object, object>();

type MeshTrustPayloadV1 =
  | Extract<SignedMeshEnvelope["payload"], { readonly type: "evidence.claim" }>
  | Extract<SignedMeshEnvelope["payload"], { readonly type: "evidence.attest" }>
  | Extract<
      SignedMeshEnvelope["payload"],
      { readonly type: "evidence.challenge" }
    >
  | Extract<
      SignedMeshEnvelope["payload"],
      { readonly type: "evidence.retract" }
    >
  | Extract<
      SignedMeshEnvelope["payload"],
      { readonly type: "trust.observation" }
    >;

export type MeshEvidenceInboundRejectionCodeV1 =
  | "invalid_request"
  | "unsupported_message_type"
  | "scope_mismatch"
  | "audience_mismatch"
  | "crypto_rejected"
  | "normalization_failed"
  | "authorization_rejected"
  | "replay_rejected"
  | "trust_transition_rejected";

/** Retained only in the authenticated composite Mesh state/journal. */
export interface MeshEvidenceOriginProofV1 {
  readonly schemaVersion: 1;
  readonly messageId: string;
  readonly payloadHash: string;
  readonly signedEnvelopeDigest: string;
  readonly senderPeerId: string;
  readonly senderKeyId: string;
  readonly admissionStateDigest: string;
  readonly coordinationAuthorityDigests: readonly string[];
  readonly replayStateDigest: string;
  readonly normalizedRecordId: string;
  readonly normalizedRecordDigest: string;
  readonly originProofDigest: string;
}

/** Authenticated composite journal material retained for network-free restore. */
export interface MeshEvidenceOriginJournalEntryV1 {
  readonly schemaVersion: 1;
  readonly descriptor: MeshEvidenceOriginProofV1;
  readonly canonicalSignedEnvelope: string;
}

/**
 * A construction-bound adapter. It owns accepted admission, Objective/Work,
 * role and replay projections and must perform its Trust transition atomically.
 */
export interface MeshEvidenceInboundPreparationBaseV1 {
  readonly accepted: true;
  readonly admissionStateDigest: string;
  readonly coordinationAuthorityDigests: readonly string[];
  readonly replayStateDigest: string;
  readonly observationCorrelated: boolean;
  readonly effectiveAtLogicalMs: number;
}

export interface MeshEvidenceInboundAdapterV1<
  TState,
  TPreparation extends MeshEvidenceInboundPreparationBaseV1 =
    MeshEvidenceInboundPreparationBaseV1,
> {
  readonly bindingDigest: string;
  prepare(input: {
    readonly state: TState;
    readonly envelope: VerifiedMeshEnvelope<MeshTrustPayloadV1>;
    readonly receivedAt: number;
  }):
    | TPreparation
    | {
        readonly accepted: false;
        readonly code: "authorization_rejected" | "replay_rejected";
      };
  process(input: {
    readonly state: TState;
    readonly envelope: VerifiedMeshEnvelope<MeshTrustPayloadV1>;
    readonly verifiedKeyId: string;
    readonly receivedAt: number;
    readonly record?: EvidenceRecordV1;
    readonly observation?: TrustObservationV1;
    readonly observationCorrelated?: boolean;
    readonly origin: MeshEvidenceOriginProofV1;
    readonly originBindingDigest: string;
    readonly originVerifierBindingDigest: string;
    readonly preparation: TPreparation;
  }):
    | {
        readonly accepted: true;
        readonly duplicate: boolean;
        readonly state: TState;
      }
    | {
        readonly accepted: false;
        readonly code:
          | "authorization_rejected"
          | "replay_rejected"
          | "trust_transition_rejected";
        readonly state: TState;
      };
}

export interface MeshEvidenceInboundRuntimeStateV1<TState> {
  readonly schemaVersion: 1;
  readonly identity: {
    readonly tenantId: string;
    readonly meshId: string;
    readonly peerId: string;
  };
  readonly state: TState;
}

/** Concrete composite retained by the server-only adapter. */
export interface MeshEvidenceTrustCompositeStateV1<
  TAuthorizationState = unknown,
> {
  readonly authorizationState: TAuthorizationState;
  readonly trust: EvidenceTrustStateV1;
  readonly originProofs: Readonly<
    Record<string, MeshEvidenceOriginJournalEntryV1>
  >;
  readonly remoteObservations: Readonly<
    Record<
      string,
      { readonly observation: TrustObservationV1; readonly correlated: boolean }
    >
  >;
}

/**
 * The surrounding Mesh runtime supplies one immutable, construction-bound
 * authorization/replay transaction. It must validate admission, topic/direct
 * audience, Objective/Work revision, epoch, authority, fence, source role and
 * causation before returning its projection digests.
 */
export interface MeshEvidenceTrustPreparationV1<
  TAuthorizationState,
> extends MeshEvidenceInboundPreparationBaseV1 {
  readonly nextAuthorizationState: TAuthorizationState;
}

export interface MeshEvidenceTrustAuthorizationV1<TAuthorizationState> {
  prepare(input: {
    readonly authorizationState: TAuthorizationState;
    readonly envelope: VerifiedMeshEnvelope<MeshTrustPayloadV1>;
    readonly receivedAt: number;
  }):
    | MeshEvidenceTrustPreparationV1<TAuthorizationState>
    | {
        readonly accepted: false;
        readonly code: "authorization_rejected" | "replay_rejected";
      };
}

/** Creates the Trust reducer adapter; no direct payload route exists. */
export function createMeshEvidenceTrustAdapterV1<TAuthorizationState>(
  bindingDigest: string,
  originVerifierBindingDigest: string,
  authorization: MeshEvidenceTrustAuthorizationV1<TAuthorizationState>,
): MeshEvidenceInboundAdapterV1<
  MeshEvidenceTrustCompositeStateV1<TAuthorizationState>,
  MeshEvidenceTrustPreparationV1<TAuthorizationState>
> {
  if (
    !trustDigestPattern.test(bindingDigest) ||
    !trustDigestPattern.test(originVerifierBindingDigest) ||
    !authorization ||
    typeof authorization !== "object" ||
    typeof authorization.prepare !== "function"
  ) {
    throw new TypeError("Mesh Evidence Trust adapter bindings are invalid");
  }
  const prepare = authorization.prepare.bind(authorization);
  const adapterCapability = Object.freeze({});
  const adapter: MeshEvidenceInboundAdapterV1<
    MeshEvidenceTrustCompositeStateV1<TAuthorizationState>,
    MeshEvidenceTrustPreparationV1<TAuthorizationState>
  > = {
    bindingDigest,
    prepare: (input) => {
      const result = prepare({
        authorizationState: input.state.authorizationState,
        envelope: input.envelope,
        receivedAt: input.receivedAt,
      });
      if (!result || typeof result !== "object" || result.accepted !== true)
        return result;
      return Object.freeze({
        accepted: true as const,
        nextAuthorizationState: result.nextAuthorizationState,
        admissionStateDigest: result.admissionStateDigest,
        coordinationAuthorityDigests: Object.freeze([
          ...result.coordinationAuthorityDigests,
        ]),
        replayStateDigest: result.replayStateDigest,
        observationCorrelated: result.observationCorrelated,
        effectiveAtLogicalMs: result.effectiveAtLogicalMs,
      });
    },
    process: (input) => {
      if (
        !input ||
        typeof input !== "object" ||
        authorizedAdapterInvocations.get(input) !== adapterCapability
      ) {
        return {
          accepted: false as const,
          code: "trust_transition_rejected" as const,
          state: input?.state,
        };
      }
      authorizedAdapterInvocations.delete(input);
      let originEntry: MeshEvidenceOriginJournalEntryV1;
      try {
        originEntry = createOriginJournalEntry(input.origin, input.envelope);
      } catch {
        return {
          accepted: false as const,
          code: "trust_transition_rejected" as const,
          state: input.state,
        };
      }
      if (
        !Object.hasOwn(
          input.state.originProofs,
          input.origin.originProofDigest,
        ) &&
        Object.keys(input.state.originProofs).length >= maximumOriginProofs
      ) {
        return {
          accepted: false as const,
          code: "trust_transition_rejected" as const,
          state: input.state,
        };
      }
      const originProofs = {
        ...input.state.originProofs,
        [input.origin.originProofDigest]: originEntry,
      };
      if (input.observation !== undefined) {
        if (
          !Object.hasOwn(
            input.state.remoteObservations,
            input.observation.observationId,
          ) &&
          Object.keys(input.state.remoteObservations).length >=
            maximumRemoteObservations
        ) {
          return {
            accepted: false as const,
            code: "trust_transition_rejected" as const,
            state: input.state,
          };
        }
        const remoteObservations = {
          ...input.state.remoteObservations,
          [input.observation.observationId]: Object.freeze({
            observation: input.observation,
            correlated: input.observationCorrelated === true,
          }),
        };
        return {
          accepted: true as const,
          duplicate: Object.hasOwn(
            input.state.remoteObservations,
            input.observation.observationId,
          ),
          state: Object.freeze({
            ...input.state,
            authorizationState: input.preparation.nextAuthorizationState,
            originProofs: Object.freeze(originProofs),
            remoteObservations: Object.freeze(remoteObservations),
          }),
        };
      }
      try {
        const record = input.record!;
        const recordId = evidenceRecordId(record);
        const recordDigest = recordId.slice(recordId.indexOf(":") + 1);
        const reduced = reduceEvidenceTrustStateV1(
          input.state.trust,
          {
            schemaVersion: 1,
            kind: "record_admitted",
            record,
            origin: "verified_mesh",
            originBindingDigest: input.originBindingDigest,
            originVerifierBindingDigest: input.originVerifierBindingDigest,
            originProofDigest: input.origin.originProofDigest,
            effectiveAtLogicalMs: input.preparation.effectiveAtLogicalMs,
            logicalTimeMs: input.receivedAt,
          },
          {
            verifiedMeshAdmissionVerifierRegistry: {
              resolve: (binding) =>
                binding !== originVerifierBindingDigest
                  ? null
                  : {
                      verifierBindingDigest: originVerifierBindingDigest,
                      upstreamBindingDigest: input.originBindingDigest,
                      verify: (candidate: {
                        readonly recordId: string;
                        readonly recordDigest: string;
                        readonly originBindingDigest: string;
                        readonly originVerifierBindingDigest: string;
                        readonly originProofDigest: string;
                        readonly effectiveAtLogicalMs: number;
                      }) => {
                        const proofEntry =
                          originProofs[candidate.originProofDigest];
                        const proof = proofEntry?.descriptor;
                        return (
                          proof !== undefined &&
                          validateOriginJournalEntry(proofEntry) &&
                          candidate.originBindingDigest ===
                            input.originBindingDigest &&
                          candidate.originVerifierBindingDigest ===
                            originVerifierBindingDigest &&
                          candidate.recordId === recordId &&
                          candidate.recordDigest === recordDigest &&
                          candidate.effectiveAtLogicalMs ===
                            input.preparation.effectiveAtLogicalMs &&
                          proof.normalizedRecordId === recordId &&
                          proof.normalizedRecordDigest === recordDigest
                        );
                      },
                    },
            },
          },
        );
        const duplicate = reduced.effects.some(
          (effect: { readonly reasonCode: string }) =>
            effect.reasonCode === "duplicate",
        );
        return {
          accepted: true as const,
          duplicate,
          state: Object.freeze({
            ...input.state,
            authorizationState: input.preparation.nextAuthorizationState,
            trust: reduced.state,
            originProofs: Object.freeze(originProofs),
          }),
        };
      } catch {
        return {
          accepted: false as const,
          code: "trust_transition_rejected" as const,
          state: input.state,
        };
      }
    },
  };
  const frozenAdapter = Object.freeze(adapter);
  concreteAdapterCapabilities.set(frozenAdapter, adapterCapability);
  return frozenAdapter;
}

export interface MeshEvidenceInboundProcessorOptionsV1<
  TState,
  TPreparation extends MeshEvidenceInboundPreparationBaseV1 =
    MeshEvidenceInboundPreparationBaseV1,
> {
  readonly resolver: MeshKeyResolver;
  readonly cryptoPolicy: MeshCryptoPolicy;
  readonly adapter: MeshEvidenceInboundAdapterV1<TState, TPreparation>;
  readonly originVerifierBindingDigest: string;
  readonly crypto?: Crypto;
  readonly protocolOptions?: MeshProtocolOptions;
  readonly supportedCriticalExtensions?: readonly string[];
}

export interface MeshEvidenceInboundRequestV1 {
  readonly envelope: SignedMeshEnvelope;
  readonly verifiedAt: string;
  readonly receivedAt: number;
}

export type MeshEvidenceInboundDecisionV1<TState> =
  | {
      readonly accepted: true;
      readonly duplicate: boolean;
      readonly observation: boolean;
      readonly state: MeshEvidenceInboundRuntimeStateV1<TState>;
    }
  | {
      readonly accepted: false;
      readonly code: MeshEvidenceInboundRejectionCodeV1;
      readonly state: MeshEvidenceInboundRuntimeStateV1<TState>;
    };

export interface MeshEvidenceInboundProcessorV1<TState> {
  process(
    state: MeshEvidenceInboundRuntimeStateV1<TState>,
    request: MeshEvidenceInboundRequestV1,
  ): Promise<MeshEvidenceInboundDecisionV1<TState>>;
}

/** Creates the only Mesh route allowed to create a `verified_mesh` record. */
export function createMeshEvidenceInboundProcessorV1<
  TState,
  TPreparation extends MeshEvidenceInboundPreparationBaseV1 =
    MeshEvidenceInboundPreparationBaseV1,
>(
  options: MeshEvidenceInboundProcessorOptionsV1<TState, TPreparation>,
): MeshEvidenceInboundProcessorV1<TState> {
  if (
    !options ||
    typeof options !== "object" ||
    !options.adapter ||
    !options.resolver ||
    typeof options.resolver.resolve !== "function" ||
    !options.cryptoPolicy ||
    !Array.isArray(options.cryptoPolicy.allowedAlgorithms) ||
    options.cryptoPolicy.allowedAlgorithms.length === 0 ||
    typeof options.adapter.prepare !== "function" ||
    typeof options.adapter.process !== "function" ||
    !trustDigestPattern.test(options.adapter.bindingDigest) ||
    !trustDigestPattern.test(options.originVerifierBindingDigest)
  ) {
    throw new TypeError("Mesh Evidence inbound dependencies are required");
  }
  const adapterCapability = concreteAdapterCapabilities.get(
    options.adapter as object,
  );
  const resolver = Object.freeze({
    resolve: options.resolver.resolve.bind(options.resolver),
  });
  const policy = Object.freeze({
    allowedAlgorithms: Object.freeze([
      ...options.cryptoPolicy.allowedAlgorithms,
    ]),
  });
  const configuration = Object.freeze({
    resolver,
    policy,
    adapter: Object.freeze({
      bindingDigest: options.adapter.bindingDigest,
      prepare: options.adapter.prepare.bind(options.adapter),
      process: options.adapter.process.bind(options.adapter),
    }),
    originVerifierBindingDigest: options.originVerifierBindingDigest,
    crypto: options.crypto,
    protocolOptions: options.protocolOptions,
    supportedCriticalExtensions:
      options.supportedCriticalExtensions === undefined
        ? undefined
        : Object.freeze([...options.supportedCriticalExtensions]),
    adapterCapability,
  });
  const processor: MeshEvidenceInboundProcessorV1<TState> = {
    async process(
      state: MeshEvidenceInboundRuntimeStateV1<TState>,
      request: MeshEvidenceInboundRequestV1,
    ): Promise<MeshEvidenceInboundDecisionV1<TState>> {
      if (
        !state ||
        !request ||
        typeof request !== "object" ||
        !Number.isSafeInteger(request.receivedAt) ||
        request.receivedAt < 0
      )
        return reject(state, "invalid_request");
      if (!isRuntimeState(state)) return reject(state, "invalid_request");
      const contextual = validateMeshEnvelopeContext(
        request.envelope,
        {
          tenantId: state.identity.tenantId,
          meshId: state.identity.meshId,
          peerId: state.identity.peerId,
          receivedAt: request.verifiedAt,
          ...(configuration.supportedCriticalExtensions === undefined
            ? {}
            : {
                supportedCriticalExtensions:
                  configuration.supportedCriticalExtensions,
              }),
        },
        configuration.protocolOptions,
      );
      if (!contextual.ok)
        return reject(
          state,
          contextual.issues[0]?.code === "invalid_audience"
            ? "audience_mismatch"
            : "scope_mismatch",
        );
      if (!isTrustPayload(contextual.value.payload))
        return reject(state, "unsupported_message_type");
      let verification;
      try {
        verification = await verifyMeshEnvelope({
          envelope: request.envelope,
          resolver: configuration.resolver,
          policy: configuration.policy,
          verifiedAt: request.verifiedAt,
          crypto: configuration.crypto,
          protocolOptions: configuration.protocolOptions,
        });
      } catch {
        return reject(state, "crypto_rejected");
      }
      if (!verification.verified) return reject(state, "crypto_rejected");
      const envelope =
        verification.envelope as VerifiedMeshEnvelope<MeshTrustPayloadV1>;
      const normalized = normalize(envelope);
      if (!normalized) return reject(state, "normalization_failed");
      let prepared;
      try {
        prepared = configuration.adapter.prepare({
          state: state.state,
          envelope,
          receivedAt: request.receivedAt,
        });
      } catch {
        return reject(state, "authorization_rejected");
      }
      let acceptedPreparation: TPreparation;
      let preparationSecurity: MeshEvidenceInboundPreparationBaseV1;
      try {
        if (!prepared || typeof prepared !== "object")
          return reject(state, "authorization_rejected");
        const accepted = prepared.accepted;
        if (accepted !== true) {
          const code = prepared.code;
          if (
            accepted === false &&
            (code === "authorization_rejected" || code === "replay_rejected")
          )
            return Object.freeze({ accepted: false, code, state });
          return reject(state, "authorization_rejected");
        }
        preparationSecurity = Object.freeze({
          accepted: true,
          admissionStateDigest: prepared.admissionStateDigest,
          coordinationAuthorityDigests: Object.freeze([
            ...prepared.coordinationAuthorityDigests,
          ]),
          replayStateDigest: prepared.replayStateDigest,
          observationCorrelated: prepared.observationCorrelated,
          effectiveAtLogicalMs: prepared.effectiveAtLogicalMs,
        });
        if (
          !isValidPreparation(preparationSecurity, envelope, request.receivedAt)
        )
          return reject(state, "authorization_rejected");
        acceptedPreparation = prepared;
      } catch {
        return reject(state, "authorization_rejected");
      }
      let origin: MeshEvidenceOriginProofV1;
      try {
        origin = createOriginProof(
          envelope,
          verification.key.keyId,
          normalized.record === undefined
            ? normalized.observation!.observationId
            : evidenceRecordId(normalized.record),
          preparationSecurity,
        );
      } catch {
        return reject(state, "normalization_failed");
      }
      const adapterInput = Object.freeze({
        state: state.state,
        envelope,
        verifiedKeyId: verification.key.keyId,
        receivedAt: request.receivedAt,
        ...(normalized.record === undefined
          ? { observation: normalized.observation! }
          : { record: normalized.record }),
        ...(normalized.observation === undefined
          ? {}
          : {
              observationCorrelated: preparationSecurity.observationCorrelated,
            }),
        origin,
        originBindingDigest: configuration.adapter.bindingDigest,
        originVerifierBindingDigest: configuration.originVerifierBindingDigest,
        preparation: acceptedPreparation,
      });
      let transition: ReturnType<typeof configuration.adapter.process>;
      if (configuration.adapterCapability !== undefined)
        authorizedAdapterInvocations.set(
          adapterInput,
          configuration.adapterCapability,
        );
      try {
        transition = configuration.adapter.process(adapterInput);
      } catch {
        return reject(state, "trust_transition_rejected");
      } finally {
        authorizedAdapterInvocations.delete(adapterInput);
      }
      if (!transition || typeof transition !== "object")
        return reject(state, "trust_transition_rejected");
      if (!isValidAdapterTransition(transition, state.state))
        return reject(state, "trust_transition_rejected");
      if (!transition.accepted)
        return Object.freeze({
          accepted: false,
          code: transition.code,
          state,
        });
      return Object.freeze({
        accepted: true,
        duplicate: transition.duplicate,
        observation: normalized.observation !== undefined,
        state: freezeState(state, transition.state),
      });
    },
  };
  return Object.freeze(processor);
}

function normalize(envelope: VerifiedMeshEnvelope<MeshTrustPayloadV1>):
  | {
      readonly record?: EvidenceRecordV1;
      readonly observation?: TrustObservationV1;
    }
  | undefined {
  const material = {
    schemaVersion: 1 as const,
    tenantId: envelope.tenantId,
    meshId: envelope.meshId,
    objectiveId: envelope.objectiveId ?? null,
    senderPeerId: envelope.sender.peerId,
    causationId: envelope.causationId ?? null,
  };
  try {
    switch (envelope.payload.type) {
      case "evidence.claim": {
        const record = normalizeMeshEvidenceClaimV1(
          material,
          omit(envelope.payload, ["type", "claimId", "assertionDigest"]),
        );
        return record.claimId === envelope.payload.claimId &&
          record.assertionDigest === envelope.payload.assertionDigest
          ? { record }
          : undefined;
      }
      case "evidence.attest": {
        const record = normalizeMeshEvidenceAttestationV1(
          material,
          omit(envelope.payload, ["type", "attestationId"]),
        );
        return record.attestationId === envelope.payload.attestationId
          ? { record }
          : undefined;
      }
      case "evidence.challenge": {
        const record = normalizeMeshEvidenceChallengeV1(
          material,
          omit(envelope.payload, ["type", "challengeId"]) as never,
        );
        return record.challengeId === envelope.payload.challengeId
          ? { record }
          : undefined;
      }
      case "evidence.retract": {
        const record = normalizeMeshEvidenceRetractionV1(
          material,
          omit(envelope.payload, ["type", "retractionId"]) as never,
        );
        return record.retractionId === envelope.payload.retractionId
          ? { record }
          : undefined;
      }
      case "trust.observation": {
        const observation = normalizeMeshTrustObservationV1(
          material,
          omit(envelope.payload, ["type", "observationId"]) as never,
        );
        return observation.observationId === envelope.payload.observationId
          ? { observation }
          : undefined;
      }
    }
  } catch {
    return undefined;
  }
}

function omit<T extends object>(
  value: T,
  keys: readonly string[],
): Omit<T, never> {
  const result = { ...value } as Record<string, unknown>;
  for (const key of keys) delete result[key];
  return result as Omit<T, never>;
}

function createOriginProof(
  envelope: VerifiedMeshEnvelope<MeshTrustPayloadV1>,
  keyId: string,
  recordId: string,
  security: {
    readonly admissionStateDigest: string;
    readonly coordinationAuthorityDigests: readonly string[];
    readonly replayStateDigest: string;
  },
): MeshEvidenceOriginProofV1 {
  const canonical = canonicalizeMeshJson(envelope);
  if (!canonical.ok)
    throw new TypeError("verified Mesh envelope is not canonical");
  const signedEnvelopeDigest = sha256TrustBytesV1(
    new TextEncoder().encode(canonical.value),
  );
  const recordDigest = recordId.slice(recordId.indexOf(":") + 1);
  const descriptor = {
    schemaVersion: 1 as const,
    messageId: envelope.messageId,
    payloadHash: envelope.payloadHash,
    signedEnvelopeDigest,
    senderPeerId: envelope.sender.peerId,
    senderKeyId: keyId,
    admissionStateDigest: security.admissionStateDigest,
    coordinationAuthorityDigests: Object.freeze(
      [...security.coordinationAuthorityDigests].sort(),
    ),
    replayStateDigest: security.replayStateDigest,
    normalizedRecordId: recordId,
    normalizedRecordDigest: recordDigest,
  };
  return Object.freeze({
    ...descriptor,
    originProofDigest: digestTrustJsonV1(
      "origin-proof",
      descriptor as unknown as Parameters<typeof digestTrustJsonV1>[1],
    ),
  });
}

function createOriginJournalEntry(
  descriptor: MeshEvidenceOriginProofV1,
  envelope: VerifiedMeshEnvelope<MeshTrustPayloadV1>,
): MeshEvidenceOriginJournalEntryV1 {
  const canonical = canonicalizeMeshJson(envelope);
  if (!canonical.ok)
    throw new TypeError("verified Mesh envelope is not canonical");
  const entry = Object.freeze({
    schemaVersion: 1 as const,
    descriptor,
    canonicalSignedEnvelope: canonical.value,
  });
  if (!validateMeshEvidenceOriginJournalEntryV1(entry))
    throw new TypeError("Mesh Evidence origin journal entry is invalid");
  return entry;
}

/** Validates retained descriptor + exact canonical signed-envelope bytes. */
export function validateMeshEvidenceOriginJournalEntryV1(
  value: unknown,
): value is MeshEvidenceOriginJournalEntryV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  if (
    entry.schemaVersion !== 1 ||
    typeof entry.canonicalSignedEnvelope !== "string" ||
    !entry.descriptor ||
    typeof entry.descriptor !== "object" ||
    Array.isArray(entry.descriptor) ||
    !hasExactKeys(entry, [
      "schemaVersion",
      "descriptor",
      "canonicalSignedEnvelope",
    ])
  )
    return false;
  const descriptor = entry.descriptor as Record<string, unknown>;
  if (
    !hasExactKeys(descriptor, [
      "schemaVersion",
      "messageId",
      "payloadHash",
      "signedEnvelopeDigest",
      "senderPeerId",
      "senderKeyId",
      "admissionStateDigest",
      "coordinationAuthorityDigests",
      "replayStateDigest",
      "normalizedRecordId",
      "normalizedRecordDigest",
      "originProofDigest",
    ]) ||
    descriptor.schemaVersion !== 1 ||
    !trustDigestPattern.test(String(descriptor.signedEnvelopeDigest)) ||
    !trustDigestPattern.test(String(descriptor.admissionStateDigest)) ||
    !trustDigestPattern.test(String(descriptor.replayStateDigest)) ||
    !trustDigestPattern.test(String(descriptor.normalizedRecordDigest)) ||
    !trustDigestPattern.test(String(descriptor.originProofDigest)) ||
    !Array.isArray(descriptor.coordinationAuthorityDigests) ||
    descriptor.coordinationAuthorityDigests.length > maximumAuthorityDigests ||
    !descriptor.coordinationAuthorityDigests.every(
      (digest) => typeof digest === "string" && trustDigestPattern.test(digest),
    ) ||
    !descriptor.coordinationAuthorityDigests.every(
      (digest, index, values) => index === 0 || values[index - 1] < digest,
    )
  )
    return false;
  for (const key of [
    "messageId",
    "payloadHash",
    "senderPeerId",
    "senderKeyId",
    "normalizedRecordId",
  ])
    if (typeof descriptor[key] !== "string" || descriptor[key].length === 0)
      return false;
  const { originProofDigest: _originProofDigest, ...descriptorBody } =
    descriptor;
  if (
    digestTrustJsonV1(
      "origin-proof",
      descriptorBody as Parameters<typeof digestTrustJsonV1>[1],
    ) !== descriptor.originProofDigest
  )
    return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(entry.canonicalSignedEnvelope as string);
  } catch {
    return false;
  }
  const canonical = canonicalizeMeshJson(parsed);
  if (!canonical.ok || canonical.value !== entry.canonicalSignedEnvelope)
    return false;
  const envelope = parsed as Record<string, unknown>;
  const sender = envelope.sender as Record<string, unknown> | undefined;
  const proof = envelope.proof as Record<string, unknown> | undefined;
  return (
    envelope.messageId === descriptor.messageId &&
    envelope.payloadHash === descriptor.payloadHash &&
    sender?.peerId === descriptor.senderPeerId &&
    proof?.keyId === descriptor.senderKeyId &&
    sha256TrustBytesV1(
      new TextEncoder().encode(entry.canonicalSignedEnvelope as string),
    ) === descriptor.signedEnvelopeDigest &&
    String(descriptor.normalizedRecordId).endsWith(
      `:${descriptor.normalizedRecordDigest}`,
    )
  );
}

function validateOriginJournalEntry(
  entry: MeshEvidenceOriginJournalEntryV1,
): boolean {
  return validateMeshEvidenceOriginJournalEntryV1(entry);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function isValidAdapterTransition<T>(
  value:
    | ReturnType<MeshEvidenceInboundAdapterV1<T>["process"]>
    | Record<string, unknown>,
  previousState: T,
): boolean {
  const transition = value as unknown as Record<string, unknown>;
  if (transition.accepted === true)
    return (
      hasExactKeys(transition, ["accepted", "duplicate", "state"]) &&
      typeof transition.duplicate === "boolean"
    );
  return (
    transition.accepted === false &&
    hasExactKeys(transition, ["accepted", "code", "state"]) &&
    [
      "authorization_rejected",
      "replay_rejected",
      "trust_transition_rejected",
    ].includes(String(transition.code)) &&
    transition.state === previousState
  );
}

function evidenceRecordId(record: EvidenceRecordV1): string {
  if ("claimId" in record && "outcome" in record)
    return (record as { readonly claimId: string }).claimId;
  if ("attestationId" in record)
    return (record as { readonly attestationId: string }).attestationId;
  if ("challengeId" in record)
    return (record as { readonly challengeId: string }).challengeId;
  return (record as { readonly retractionId: string }).retractionId;
}

function isTrustPayload(
  payload: SignedMeshEnvelope["payload"],
): payload is MeshTrustPayloadV1 {
  return (
    payload.type === "evidence.claim" ||
    payload.type === "evidence.attest" ||
    payload.type === "evidence.challenge" ||
    payload.type === "evidence.retract" ||
    payload.type === "trust.observation"
  );
}

function freezeState<T>(
  state: MeshEvidenceInboundRuntimeStateV1<T>,
  next: T,
): MeshEvidenceInboundRuntimeStateV1<T> {
  return Object.freeze({
    schemaVersion: 1,
    identity: Object.freeze({ ...state.identity }),
    state: next,
  });
}

function reject<T>(
  state: MeshEvidenceInboundRuntimeStateV1<T>,
  code: MeshEvidenceInboundRejectionCodeV1,
): MeshEvidenceInboundDecisionV1<T> {
  return Object.freeze({ accepted: false, code, state });
}

function isRuntimeState<T>(
  state: MeshEvidenceInboundRuntimeStateV1<T>,
): boolean {
  return (
    state.schemaVersion === 1 &&
    state.identity !== null &&
    typeof state.identity === "object" &&
    typeof state.identity.tenantId === "string" &&
    typeof state.identity.meshId === "string" &&
    typeof state.identity.peerId === "string"
  );
}

function isValidPreparation(
  preparation: MeshEvidenceInboundPreparationBaseV1,
  envelope: VerifiedMeshEnvelope<MeshTrustPayloadV1>,
  receivedAt: number,
): boolean {
  const authorities = preparation.coordinationAuthorityDigests;
  return (
    preparation.accepted === true &&
    trustDigestPattern.test(preparation.admissionStateDigest) &&
    trustDigestPattern.test(preparation.replayStateDigest) &&
    Array.isArray(authorities) &&
    authorities.length <= maximumAuthorityDigests &&
    authorities.every((digest) => trustDigestPattern.test(digest)) &&
    authorities.every(
      (digest, index) => index === 0 || authorities[index - 1] < digest,
    ) &&
    typeof preparation.observationCorrelated === "boolean" &&
    Number.isSafeInteger(preparation.effectiveAtLogicalMs) &&
    preparation.effectiveAtLogicalMs >= 0 &&
    preparation.effectiveAtLogicalMs <= receivedAt &&
    (envelope.payload.scope.kind === "work" ||
      preparation.effectiveAtLogicalMs === receivedAt)
  );
}

export type MeshTrustEligibilityModeV1 = "observe" | "restrict";
export interface MeshTrustCandidateV1 {
  readonly peerId: string;
  readonly capabilities: readonly unknown[];
}
export interface MeshTrustEligibilityResolverV1 {
  readonly bindingDigest: string;
  evaluate(
    candidate: MeshTrustCandidateV1,
  ): "eligible" | "restricted" | "quarantined" | "unavailable";
}
export function filterMeshCapabilityMatchesWithTrustV1<
  T extends MeshTrustCandidateV1,
>(
  candidates: readonly T[],
  mode: MeshTrustEligibilityModeV1,
  resolver: MeshTrustEligibilityResolverV1,
): {
  readonly matches: readonly T[];
  readonly diagnostics: readonly {
    readonly peerId: string;
    readonly status: ReturnType<MeshTrustEligibilityResolverV1["evaluate"]>;
  }[];
  readonly unavailable: boolean;
} {
  if (mode !== "observe" && mode !== "restrict") {
    throw new TypeError("Mesh Trust eligibility mode is invalid");
  }
  if (
    new Set(candidates.map((candidate) => candidate.peerId)).size !==
    candidates.length
  ) {
    throw new TypeError("Mesh Trust candidates must be unique");
  }
  const evaluate = resolver.evaluate.bind(resolver);
  const diagnostics = candidates.map((candidate) => {
    let status: ReturnType<MeshTrustEligibilityResolverV1["evaluate"]> =
      "unavailable";
    try {
      status = evaluate(candidate);
    } catch {
      status = "unavailable";
    }
    if (
      !["eligible", "restricted", "quarantined", "unavailable"].includes(status)
    ) {
      status = "unavailable";
    }
    return Object.freeze({ peerId: candidate.peerId, status });
  });
  const unavailable = diagnostics.some((item) => item.status === "unavailable");
  const matches =
    mode === "observe"
      ? candidates
      : unavailable
        ? []
        : candidates.filter(
            (_, index) => diagnostics[index]!.status === "eligible",
          );
  return Object.freeze({
    matches: Object.freeze([...matches]),
    diagnostics: Object.freeze(diagnostics),
    unavailable,
  });
}

/** Encodes only the already-redacted projection; it never exports a profile or Fusion input. */
export function encodeMeshTrustObservationV1(
  observation: TrustObservationV1,
): Readonly<Record<string, unknown>> {
  const {
    schemaVersion: _schemaVersion,
    observerId: _observerId,
    observerKind: _observerKind,
    causationId: _causationId,
    scope,
    ...payload
  } = observation;
  return Object.freeze({
    type: "trust.observation",
    ...payload,
    subject: stripMeshSubject(observation.subject),
    scope: stripMeshScope(scope),
  });
}
function stripMeshSubject(subject: TrustObservationV1["subject"]): object {
  const { schemaVersion: _schemaVersion, ...wireSubject } = subject;
  return Object.freeze(wireSubject);
}
function stripMeshScope(scope: TrustObservationV1["scope"]): object {
  if (scope.kind === "mesh") return Object.freeze({ kind: "mesh" });
  if (scope.kind === "objective")
    return Object.freeze({
      kind: "objective",
      objectiveRevision: scope.objectiveRevision,
    });
  if (scope.kind === "work")
    return Object.freeze({
      kind: "work",
      objectiveRevision: scope.objectiveRevision,
      workItemId: scope.workItemId,
      workItemRevision: scope.workItemRevision,
      assignmentEpoch: scope.assignmentEpoch,
      assignmentAuthorityId: scope.assignmentAuthorityId,
      fencingToken: scope.fencingToken,
    });
  throw new TypeError("Trust observation scope is not Mesh-compatible");
}
