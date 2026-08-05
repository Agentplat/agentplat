import {
  MESH_SIGNATURE_ALGORITHM,
  canonicalizeMeshJsonBytes,
  compareMeshTimestamps,
} from "@agentplat/mesh-protocol";
import type { MeshKeyResolver } from "@agentplat/mesh-crypto";
import {
  COLLECTIVE_AGREEMENT_PROTOCOL_V1,
  COLLECTIVE_AGREEMENT_SCHEMA_VERSION_V1,
} from "./agreement-contracts.js";
import type {
  CollectiveAgreementCommitCertificateV1,
  CollectiveAgreementCoordinateV1,
  CollectiveAgreementMembershipV1,
  CollectiveAgreementPayloadV1,
  CollectiveAgreementValueV1,
  CollectiveAgreementVoteCertificateV1,
  CollectiveAgreementVotePayloadV1,
  SignedCollectiveAgreementEnvelopeV1,
  UnsignedCollectiveAgreementEnvelopeV1,
} from "./agreement-contracts.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const SIGNATURE = /^[A-Za-z0-9_-]{86}$/u;
const MAXIMUM_BYTES = 1_048_576;

export class CollectiveAgreementCodecErrorV1 extends Error {
  readonly name = "CollectiveAgreementCodecErrorV1";

  constructor(
    readonly code:
      | "invalid_value"
      | "invalid_envelope"
      | "invalid_private_key"
      | "crypto_unavailable"
      | "crypto_operation_failed",
  ) {
    super(code);
  }
}

export async function collectiveAgreementDigestV1(
  value: unknown,
  injectedCrypto?: Crypto,
): Promise<string> {
  const bytes = canonicalBytes(value);
  try {
    const digest = new Uint8Array(
      await resolveCrypto(injectedCrypto).subtle.digest(
        "SHA-256",
        bytes.slice().buffer,
      ),
    );
    return `sha256:${toHex(digest)}`;
  } catch {
    throw new CollectiveAgreementCodecErrorV1("crypto_operation_failed");
  }
}

export async function createCollectiveAgreementValueV1(input: {
  readonly kind: CollectiveAgreementValueV1["kind"];
  readonly valueId: string;
  readonly previousCommitDigest?: string | null;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly crypto?: Crypto;
}): Promise<CollectiveAgreementValueV1> {
  const body = {
    schemaVersion: 1 as const,
    kind: input.kind,
    valueId: input.valueId,
    previousCommitDigest: input.previousCommitDigest ?? null,
    payload: input.payload,
  };
  const value = {
    ...body,
    valueDigest: await collectiveAgreementDigestV1(body, input.crypto),
  };
  const valid = await validateCollectiveAgreementValueV1(value, input.crypto);
  if (!valid) throw new CollectiveAgreementCodecErrorV1("invalid_value");
  return valid;
}

export async function validateCollectiveAgreementValueV1(
  candidate: unknown,
  crypto?: Crypto,
): Promise<CollectiveAgreementValueV1 | null> {
  if (
    !record(candidate) ||
    !exact(candidate, [
      "kind",
      "payload",
      "previousCommitDigest",
      "schemaVersion",
      "valueDigest",
      "valueId",
    ]) ||
    candidate.schemaVersion !== 1 ||
    ![
      "application",
      "assignment_confirmation",
      "recovery_selection",
      "planning_slot_head",
      "role_reconfiguration",
      "role_refinement",
      "synchronization_watermark",
      "membership_reconfiguration",
    ].includes(candidate.kind as string) ||
    !identifier(candidate.valueId) ||
    !(
      candidate.previousCommitDigest === null ||
      digest(candidate.previousCommitDigest)
    ) ||
    !record(candidate.payload) ||
    !digest(candidate.valueDigest)
  )
    return null;
  try {
    const { valueDigest: _, ...body } = candidate;
    if (
      (await collectiveAgreementDigestV1(body, crypto)) !==
      candidate.valueDigest
    )
      return null;
    canonicalBytes(candidate);
    return freeze(candidate) as unknown as CollectiveAgreementValueV1;
  } catch {
    return null;
  }
}

export async function createCollectiveAgreementMembershipV1(input: {
  readonly epoch: number;
  readonly faultThreshold: number;
  readonly validators: readonly {
    readonly peerId: string;
    readonly instanceId: string;
    readonly keyId: string;
  }[];
  readonly crypto?: Crypto;
}): Promise<CollectiveAgreementMembershipV1> {
  const validators = [...input.validators].sort((left, right) =>
    left.peerId.localeCompare(right.peerId),
  );
  const core = {
    schemaVersion: 1 as const,
    epoch: input.epoch,
    faultThreshold: input.faultThreshold,
    validators,
  };
  const membership = {
    ...core,
    configurationDigest: await collectiveAgreementDigestV1(core, input.crypto),
  };
  const valid = await validateCollectiveAgreementMembershipV1(
    membership,
    input.crypto,
  );
  if (!valid) throw new CollectiveAgreementCodecErrorV1("invalid_value");
  return valid;
}

export async function validateCollectiveAgreementMembershipV1(
  candidate: unknown,
  crypto?: Crypto,
): Promise<CollectiveAgreementMembershipV1 | null> {
  if (
    !record(candidate) ||
    !exact(candidate, [
      "configurationDigest",
      "epoch",
      "faultThreshold",
      "schemaVersion",
      "validators",
    ]) ||
    candidate.schemaVersion !== 1 ||
    !positive(candidate.epoch) ||
    !nonnegative(candidate.faultThreshold) ||
    !digest(candidate.configurationDigest) ||
    !Array.isArray(candidate.validators) ||
    candidate.validators.length < 4 ||
    candidate.validators.length > 128 ||
    candidate.validators.length !== 3 * (candidate.faultThreshold as number) + 1
  )
    return null;
  const validators = candidate.validators as unknown[];
  if (
    validators.some(
      (item) =>
        !record(item) ||
        !exact(item, ["instanceId", "keyId", "peerId"]) ||
        !identifier(item.peerId) ||
        !identifier(item.instanceId) ||
        !identifier(item.keyId),
    ) ||
    validators.some(
      (item, index) =>
        index > 0 &&
        (validators[index - 1] as { peerId: string }).peerId >=
          (item as { peerId: string }).peerId,
    )
  )
    return null;
  try {
    const { configurationDigest: _, ...body } = candidate;
    if (
      (await collectiveAgreementDigestV1(body, crypto)) !==
      candidate.configurationDigest
    )
      return null;
    return freeze(candidate) as unknown as CollectiveAgreementMembershipV1;
  } catch {
    return null;
  }
}

export function collectiveAgreementQuorumThresholdV1(
  membership: CollectiveAgreementMembershipV1,
): number {
  return 2 * membership.faultThreshold + 1;
}

export function collectiveAgreementProposerV1(input: {
  readonly membership: CollectiveAgreementMembershipV1;
  readonly height: number;
  readonly round: number;
}): string {
  if (!positive(input.height) || !nonnegative(input.round))
    throw new RangeError("height or round is invalid");
  const index =
    (input.height - 1 + input.round) % input.membership.validators.length;
  return input.membership.validators[index]!.peerId;
}

export async function signCollectiveAgreementEnvelopeV1<
  TPayload extends CollectiveAgreementPayloadV1,
>(input: {
  readonly envelope: UnsignedCollectiveAgreementEnvelopeV1<TPayload>;
  readonly privateKey: CryptoKey;
  readonly crypto?: Crypto;
}): Promise<SignedCollectiveAgreementEnvelopeV1<TPayload>> {
  const envelope = await validateUnsignedCollectiveAgreementEnvelopeV1(
    input.envelope,
    input.crypto,
  );
  if (!envelope) throw new CollectiveAgreementCodecErrorV1("invalid_envelope");
  if (!ed25519(input.privateKey, "private", "sign"))
    throw new CollectiveAgreementCodecErrorV1("invalid_private_key");
  try {
    const signature = new Uint8Array(
      await resolveCrypto(input.crypto).subtle.sign(
        MESH_SIGNATURE_ALGORITHM,
        input.privateKey,
        canonicalBytes(envelope).slice().buffer,
      ),
    );
    const signed = {
      ...envelope,
      proof: {
        ...envelope.proof,
        value: encodeBase64Url(signature),
      },
    };
    const valid = await validateSignedCollectiveAgreementEnvelopeV1(
      signed,
      input.crypto,
    );
    if (!valid) throw new CollectiveAgreementCodecErrorV1("invalid_envelope");
    return valid as SignedCollectiveAgreementEnvelopeV1<TPayload>;
  } catch (error) {
    if (error instanceof CollectiveAgreementCodecErrorV1) throw error;
    throw new CollectiveAgreementCodecErrorV1("crypto_operation_failed");
  }
}

export async function verifyCollectiveAgreementEnvelopeV1<
  TPayload extends CollectiveAgreementPayloadV1 = CollectiveAgreementPayloadV1,
>(input: {
  readonly envelope: unknown;
  readonly resolver: MeshKeyResolver;
  readonly verifiedAt: string;
  readonly crypto?: Crypto;
}): Promise<SignedCollectiveAgreementEnvelopeV1<TPayload> | null> {
  const envelope = await validateSignedCollectiveAgreementEnvelopeV1<TPayload>(
    input.envelope,
    input.crypto,
  );
  if (!envelope || !timestamp(input.verifiedAt)) return null;
  let key;
  try {
    key = input.resolver.resolve({
      tenantId: envelope.tenantId,
      meshId: envelope.meshId,
      peerId: envelope.senderPeerId,
      keyId: envelope.proof.keyId,
      algorithm: envelope.proof.algorithm,
    });
  } catch {
    return null;
  }
  if (
    !key ||
    !keyUsableWhenSigned(key, envelope.issuedAt) ||
    key.peerId !== envelope.senderPeerId ||
    key.keyId !== envelope.proof.keyId ||
    key.algorithm !== MESH_SIGNATURE_ALGORITHM ||
    !ed25519(key.publicKey, "public", "verify") ||
    !within(envelope.issuedAt, key.validFrom, key.validUntil)
  )
    return null;
  const signature = decodeBase64Url(envelope.proof.value);
  if (!signature || signature.byteLength !== 64) return null;
  const unsigned = {
    ...envelope,
    proof: { algorithm: envelope.proof.algorithm, keyId: envelope.proof.keyId },
  } as UnsignedCollectiveAgreementEnvelopeV1<TPayload>;
  try {
    return (await resolveCrypto(input.crypto).subtle.verify(
      MESH_SIGNATURE_ALGORITHM,
      key.publicKey,
      signature.slice().buffer,
      canonicalBytes(unsigned).slice().buffer,
    ))
      ? envelope
      : null;
  } catch {
    return null;
  }
}

/** Verifies signature history plus live freshness and revocation state. */
export async function verifyCollectiveAgreementLiveEnvelopeV1<
  TPayload extends CollectiveAgreementPayloadV1 = CollectiveAgreementPayloadV1,
>(input: {
  readonly envelope: unknown;
  readonly resolver: MeshKeyResolver;
  readonly verifiedAt: string;
  readonly maximumTtlMs?: number;
  readonly crypto?: Crypto;
}): Promise<SignedCollectiveAgreementEnvelopeV1<TPayload> | null> {
  const envelope = await verifyCollectiveAgreementEnvelopeV1<TPayload>(input);
  if (
    !envelope ||
    !collectiveAgreementEnvelopeIsFreshV1(
      envelope,
      input.verifiedAt,
      input.maximumTtlMs,
    )
  )
    return null;
  let key;
  try {
    key = input.resolver.resolve({
      tenantId: envelope.tenantId,
      meshId: envelope.meshId,
      peerId: envelope.senderPeerId,
      keyId: envelope.proof.keyId,
      algorithm: envelope.proof.algorithm,
    });
  } catch {
    return null;
  }
  return key && keyUsableAtVerification(key, input.verifiedAt)
    ? envelope
    : null;
}

export async function validateUnsignedCollectiveAgreementEnvelopeV1<
  TPayload extends CollectiveAgreementPayloadV1 = CollectiveAgreementPayloadV1,
>(
  candidate: unknown,
  crypto?: Crypto,
): Promise<UnsignedCollectiveAgreementEnvelopeV1<TPayload> | null> {
  return (await envelope(
    candidate,
    false,
    crypto,
  )) as UnsignedCollectiveAgreementEnvelopeV1<TPayload> | null;
}

export async function validateSignedCollectiveAgreementEnvelopeV1<
  TPayload extends CollectiveAgreementPayloadV1 = CollectiveAgreementPayloadV1,
>(
  candidate: unknown,
  crypto?: Crypto,
): Promise<SignedCollectiveAgreementEnvelopeV1<TPayload> | null> {
  return (await envelope(
    candidate,
    true,
    crypto,
  )) as SignedCollectiveAgreementEnvelopeV1<TPayload> | null;
}

async function envelope(
  candidate: unknown,
  signed: boolean,
  crypto?: Crypto,
): Promise<
  | SignedCollectiveAgreementEnvelopeV1
  | UnsignedCollectiveAgreementEnvelopeV1
  | null
> {
  if (
    !record(candidate) ||
    !exact(candidate, [
      "audiencePeerId",
      "expiresAt",
      "issuedAt",
      "meshId",
      "messageId",
      "payload",
      "proof",
      "protocol",
      "schemaVersion",
      "senderInstanceId",
      "senderPeerId",
      "tenantId",
    ]) ||
    candidate.protocol !== COLLECTIVE_AGREEMENT_PROTOCOL_V1 ||
    candidate.schemaVersion !== COLLECTIVE_AGREEMENT_SCHEMA_VERSION_V1 ||
    !identifier(candidate.messageId) ||
    !identifier(candidate.tenantId) ||
    !identifier(candidate.meshId) ||
    !identifier(candidate.senderPeerId) ||
    !identifier(candidate.senderInstanceId) ||
    !identifier(candidate.audiencePeerId) ||
    !timestamp(candidate.issuedAt) ||
    !timestamp(candidate.expiresAt) ||
    !record(candidate.proof) ||
    !exact(
      candidate.proof,
      signed ? ["algorithm", "keyId", "value"] : ["algorithm", "keyId"],
    ) ||
    candidate.proof.algorithm !== MESH_SIGNATURE_ALGORITHM ||
    !identifier(candidate.proof.keyId) ||
    (signed && !SIGNATURE.test(String(candidate.proof.value)))
  )
    return null;
  const order = compareMeshTimestamps(
    candidate.issuedAt as string,
    candidate.expiresAt as string,
  );
  if (!order.ok || order.value >= 0) return null;
  const payload = await validateCollectiveAgreementPayloadV1(
    candidate.payload,
    crypto,
  );
  if (!payload) return null;
  try {
    const value = { ...candidate, payload };
    if (canonicalBytes(value).byteLength > MAXIMUM_BYTES) return null;
    return freeze(value) as
      | SignedCollectiveAgreementEnvelopeV1
      | UnsignedCollectiveAgreementEnvelopeV1;
  } catch {
    return null;
  }
}

export async function validateCollectiveAgreementPayloadV1(
  candidate: unknown,
  crypto?: Crypto,
): Promise<CollectiveAgreementPayloadV1 | null> {
  if (!record(candidate) || typeof candidate.type !== "string") return null;
  if (candidate.type === "agreement.proposal") {
    if (
      !exact(candidate, [
        "coordinate",
        "justification",
        "proposalId",
        "proposedAtLogicalMs",
        "proposerPeerId",
        "type",
        "validRound",
        "value",
      ]) ||
      !identifier(candidate.proposalId) ||
      !identifier(candidate.proposerPeerId) ||
      !logical(candidate.proposedAtLogicalMs) ||
      !(candidate.validRound === null || nonnegative(candidate.validRound)) ||
      !coordinate(candidate.coordinate)
    )
      return null;
    const value = await validateCollectiveAgreementValueV1(
      candidate.value,
      crypto,
    );
    if (!value) return null;
    if (candidate.justification !== null) {
      const justification = validateCollectiveAgreementVoteCertificateShapeV1(
        candidate.justification,
      );
      if (
        !justification ||
        candidate.validRound !== justification.coordinate.round ||
        justification.phase !== "prevote" ||
        justification.valueDigest !== value.valueDigest
      )
        return null;
    } else if (candidate.validRound !== null) return null;
    return freeze({
      ...candidate,
      value,
    }) as unknown as CollectiveAgreementPayloadV1;
  }
  if (candidate.type === "agreement.vote") {
    if (
      !exact(candidate, [
        "coordinate",
        "phase",
        "proposalId",
        "type",
        "valueDigest",
        "votedAtLogicalMs",
        "voterPeerId",
      ]) ||
      !coordinate(candidate.coordinate) ||
      !["prevote", "precommit"].includes(candidate.phase as string) ||
      !identifier(candidate.proposalId) ||
      !identifier(candidate.voterPeerId) ||
      !(candidate.valueDigest === null || digest(candidate.valueDigest)) ||
      !logical(candidate.votedAtLogicalMs)
    )
      return null;
    return freeze(candidate) as unknown as CollectiveAgreementPayloadV1;
  }
  if (candidate.type === "agreement.certificate") {
    if (
      !exact(candidate, ["certificate", "deliveredAtLogicalMs", "type"]) ||
      !logical(candidate.deliveredAtLogicalMs) ||
      !validateCollectiveAgreementVoteCertificateShapeV1(candidate.certificate)
    )
      return null;
    return freeze(candidate) as unknown as CollectiveAgreementPayloadV1;
  }
  if (candidate.type === "agreement.commit") {
    if (
      !exact(candidate, ["certificate", "deliveredAtLogicalMs", "type"]) ||
      !logical(candidate.deliveredAtLogicalMs) ||
      !(await validateCollectiveAgreementCommitCertificateShapeV1(
        candidate.certificate,
        crypto,
      ))
    )
      return null;
    return freeze(candidate) as unknown as CollectiveAgreementPayloadV1;
  }
  if (candidate.type === "agreement.ack") {
    if (
      !exact(candidate, [
        "acknowledgedAtLogicalMs",
        "acknowledgement",
        "coordinate",
        "requestMessageId",
        "type",
      ]) ||
      candidate.acknowledgement !== "commit_stored" ||
      !identifier(candidate.requestMessageId) ||
      !coordinate(candidate.coordinate) ||
      !logical(candidate.acknowledgedAtLogicalMs)
    )
      return null;
    return freeze(candidate) as unknown as CollectiveAgreementPayloadV1;
  }
  return null;
}

export function validateCollectiveAgreementVoteCertificateShapeV1(
  candidate: unknown,
): CollectiveAgreementVoteCertificateV1 | null {
  if (
    !record(candidate) ||
    !exact(candidate, [
      "certificateDigest",
      "coordinate",
      "kind",
      "phase",
      "proposalId",
      "schemaVersion",
      "valueDigest",
      "votes",
    ]) ||
    candidate.schemaVersion !== 1 ||
    candidate.kind !== "vote_certificate" ||
    !["prevote", "precommit"].includes(candidate.phase as string) ||
    !coordinate(candidate.coordinate) ||
    !identifier(candidate.proposalId) ||
    !(candidate.valueDigest === null || digest(candidate.valueDigest)) ||
    !Array.isArray(candidate.votes) ||
    candidate.votes.length < 1 ||
    candidate.votes.length > 128 ||
    !digest(candidate.certificateDigest)
  )
    return null;
  return freeze(candidate) as unknown as CollectiveAgreementVoteCertificateV1;
}

export async function validateCollectiveAgreementCommitCertificateShapeV1(
  candidate: unknown,
  crypto?: Crypto,
): Promise<CollectiveAgreementCommitCertificateV1 | null> {
  if (
    !record(candidate) ||
    !exact(candidate, [
      "certificateDigest",
      "certificateId",
      "committedAtLogicalMs",
      "coordinate",
      "kind",
      "precommitCertificate",
      "prevoteCertificate",
      "proposalId",
      "schemaVersion",
      "value",
    ]) ||
    candidate.schemaVersion !== 1 ||
    candidate.kind !== "commit_certificate" ||
    !identifier(candidate.certificateId) ||
    !coordinate(candidate.coordinate) ||
    !identifier(candidate.proposalId) ||
    !logical(candidate.committedAtLogicalMs) ||
    !digest(candidate.certificateDigest) ||
    !validateCollectiveAgreementVoteCertificateShapeV1(
      candidate.prevoteCertificate,
    ) ||
    !validateCollectiveAgreementVoteCertificateShapeV1(
      candidate.precommitCertificate,
    ) ||
    !(await validateCollectiveAgreementValueV1(candidate.value, crypto))
  )
    return null;
  return freeze(candidate) as unknown as CollectiveAgreementCommitCertificateV1;
}

export function sameCollectiveAgreementCoordinateV1(
  left: CollectiveAgreementCoordinateV1,
  right: CollectiveAgreementCoordinateV1,
): boolean {
  return (
    left.policyDomainId === right.policyDomainId &&
    left.slotId === right.slotId &&
    left.height === right.height &&
    left.round === right.round &&
    left.membershipEpoch === right.membershipEpoch &&
    left.membershipConfigurationDigest === right.membershipConfigurationDigest
  );
}

export function collectiveAgreementEnvelopeIsFreshV1(
  envelope: Pick<SignedCollectiveAgreementEnvelopeV1, "issuedAt" | "expiresAt">,
  verifiedAt: string,
  maximumTtlMs = 300_000,
): boolean {
  const afterIssue = compareMeshTimestamps(verifiedAt, envelope.issuedAt);
  const beforeExpiry = compareMeshTimestamps(verifiedAt, envelope.expiresAt);
  const ttl = Date.parse(envelope.expiresAt) - Date.parse(envelope.issuedAt);
  return (
    afterIssue.ok &&
    beforeExpiry.ok &&
    afterIssue.value >= 0 &&
    beforeExpiry.value < 0 &&
    Number.isFinite(ttl) &&
    ttl > 0 &&
    ttl <= maximumTtlMs
  );
}

function coordinate(
  candidate: unknown,
): candidate is CollectiveAgreementCoordinateV1 {
  return (
    record(candidate) &&
    exact(candidate, [
      "height",
      "membershipConfigurationDigest",
      "membershipEpoch",
      "policyDomainId",
      "round",
      "slotId",
    ]) &&
    identifier(candidate.policyDomainId) &&
    identifier(candidate.slotId) &&
    positive(candidate.height) &&
    nonnegative(candidate.round) &&
    positive(candidate.membershipEpoch) &&
    digest(candidate.membershipConfigurationDigest)
  );
}

function canonicalBytes(value: unknown): Uint8Array {
  const canonical = canonicalizeMeshJsonBytes(value);
  if (!canonical.ok) throw new CollectiveAgreementCodecErrorV1("invalid_value");
  return canonical.value;
}

function resolveCrypto(injected?: Crypto): Crypto {
  const crypto = injected ?? globalThis.crypto;
  if (!crypto?.subtle)
    throw new CollectiveAgreementCodecErrorV1("crypto_unavailable");
  return crypto;
}

function ed25519(
  key: CryptoKey,
  type: "private" | "public",
  usage: "sign" | "verify",
): boolean {
  return (
    key instanceof CryptoKey &&
    key.type === type &&
    key.algorithm.name === MESH_SIGNATURE_ALGORITHM &&
    key.usages.includes(usage)
  );
}

function within(at: string, from: string, until: string): boolean {
  const lower = compareMeshTimestamps(at, from);
  const upper = compareMeshTimestamps(at, until);
  return lower.ok && upper.ok && lower.value >= 0 && upper.value < 0;
}

function keyUsableWhenSigned(
  key: { readonly status: string; readonly revokedAt?: string },
  issuedAt: string,
): boolean {
  if (key.status === "active") return true;
  if (key.status !== "revoked" || !key.revokedAt) return false;
  const beforeRevocation = compareMeshTimestamps(issuedAt, key.revokedAt);
  return beforeRevocation.ok && beforeRevocation.value < 0;
}

function keyUsableAtVerification(
  key: { readonly status: string; readonly revokedAt?: string },
  verifiedAt: string,
): boolean {
  if (key.status === "active") return true;
  if (key.status !== "revoked" || !key.revokedAt) return false;
  const beforeRevocation = compareMeshTimestamps(verifiedAt, key.revokedAt);
  return beforeRevocation.ok && beforeRevocation.value < 0;
}

function timestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const compared = compareMeshTimestamps(value, value);
  return compared.ok;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exact(
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

function identifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER.test(value);
}

function digest(value: unknown): value is string {
  return typeof value === "string" && DIGEST.test(value);
}

function logical(value: unknown): value is number {
  return nonnegative(value);
}

function positive(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function nonnegative(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>))
      freeze(child);
  }
  return value;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/=/gu, "")
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_");
}

function decodeBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) return null;
  try {
    const normalized = value.replace(/-/gu, "+").replace(/_/gu, "/");
    const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
    return Uint8Array.from(atob(normalized + padding), (character) =>
      character.charCodeAt(0),
    );
  } catch {
    return null;
  }
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
