import type {
  CollectiveAgreementClockReadingV1,
  CollectiveAgreementPayloadV1,
  CollectiveAgreementScopeV1,
  CollectiveAgreementSigningV1,
  SignedCollectiveAgreementEnvelopeV1,
} from "./agreement-contracts.js";
import {
  COLLECTIVE_AGREEMENT_PROTOCOL_V1,
  COLLECTIVE_AGREEMENT_SCHEMA_VERSION_V1,
} from "./agreement-contracts.js";
import {
  collectiveAgreementDigestV1,
  signCollectiveAgreementEnvelopeV1,
} from "./agreement-codec.js";

export const DEFAULT_COLLECTIVE_AGREEMENT_ENVELOPE_TTL_MS_V1 = 30_000;

export async function createSignedCollectiveAgreementEnvelopeV1<
  TPayload extends CollectiveAgreementPayloadV1,
>(input: {
  readonly scope: CollectiveAgreementScopeV1;
  readonly signing: CollectiveAgreementSigningV1;
  readonly audiencePeerId: string;
  readonly payload: TPayload;
  readonly clock: CollectiveAgreementClockReadingV1;
  readonly maximumEnvelopeTtlMs?: number;
  readonly crypto?: Crypto;
}): Promise<SignedCollectiveAgreementEnvelopeV1<TPayload>> {
  const ttl =
    input.maximumEnvelopeTtlMs ??
    DEFAULT_COLLECTIVE_AGREEMENT_ENVELOPE_TTL_MS_V1;
  if (!Number.isSafeInteger(ttl) || ttl < 1 || ttl > 300_000)
    throw new RangeError("maximumEnvelopeTtlMs is out of range");
  const expiresAt = new Date(
    Date.parse(input.clock.wallTime) + ttl,
  ).toISOString();
  const identity = {
    tenantId: input.scope.tenantId,
    meshId: input.scope.meshId,
    senderPeerId: input.scope.peerId,
    senderInstanceId: input.scope.instanceId,
    audiencePeerId: input.audiencePeerId,
    issuedAt: input.clock.wallTime,
    expiresAt,
    payload: input.payload,
  };
  const digest = await collectiveAgreementDigestV1(identity, input.crypto);
  return signCollectiveAgreementEnvelopeV1({
    envelope: {
      protocol: COLLECTIVE_AGREEMENT_PROTOCOL_V1,
      schemaVersion: COLLECTIVE_AGREEMENT_SCHEMA_VERSION_V1,
      messageId: `agreement.${input.payload.type}.${digest.slice(7, 47)}`,
      ...identity,
      proof: {
        algorithm: input.signing.algorithm,
        keyId: input.signing.keyId,
      },
    },
    privateKey: input.signing.privateKey,
    crypto: input.crypto,
  });
}
