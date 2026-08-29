import {
  createMorphogenesisDecisionAuthorizationV1,
  validateMorphogenesisDecisionAuthorizationV1,
  validateMorphogenesisDecisionCandidateV1,
  type MorphogenesisDecisionAuthorizationIssuerPortV1,
  type MorphogenesisDecisionAuthorizationV1,
  type MorphogenesisDecisionCandidateV1,
} from "@agentplat/collective-runtime/morphogenesis";

import type { CollectiveAgreementCommitCertificateV1 } from "./agreement-contracts.js";

export interface MorphogenesisCollectiveAgreementCertificatePortV1 {
  resolve(input: {
    readonly candidate: MorphogenesisDecisionCandidateV1;
    readonly logicalTimeMs: number;
  }): Promise<CollectiveAgreementCommitCertificateV1 | null>;
  verify(input: {
    readonly candidate: MorphogenesisDecisionCandidateV1;
    readonly certificate: CollectiveAgreementCommitCertificateV1;
    readonly logicalTimeMs: number;
  }): Promise<boolean>;
}

/** Maps an authenticated `application` agreement commit into an inert decision. */
export class CollectiveAgreementMorphogenesisDecisionIssuerV1
  implements MorphogenesisDecisionAuthorizationIssuerPortV1
{
  constructor(
    readonly certificates: MorphogenesisCollectiveAgreementCertificatePortV1,
  ) {}

  async issue(input: {
    readonly candidate: MorphogenesisDecisionCandidateV1;
    readonly logicalTimeMs: number;
  }): Promise<MorphogenesisDecisionAuthorizationV1 | null> {
    const candidate = validateMorphogenesisDecisionCandidateV1(input.candidate);
    if (candidate.decisionRoute !== "collective")
      throw new TypeError("collective agreement route is not selected");
    const certificate = await this.certificates.resolve({
      candidate,
      logicalTimeMs: input.logicalTimeMs,
    });
    if (!certificate) return null;
    if (
      !(await this.certificates.verify({
        candidate,
        certificate,
        logicalTimeMs: input.logicalTimeMs,
      }))
    )
      throw new TypeError("collective agreement certificate is invalid");
    return authorization(candidate, certificate);
  }

  async verify(input: {
    readonly candidate: MorphogenesisDecisionCandidateV1;
    readonly authorization: MorphogenesisDecisionAuthorizationV1;
    readonly logicalTimeMs: number;
  }): Promise<boolean> {
    const candidate = validateMorphogenesisDecisionCandidateV1(input.candidate);
    const retained = validateMorphogenesisDecisionAuthorizationV1(
      input.authorization,
    );
    const certificate = await this.certificates.resolve({
      candidate,
      logicalTimeMs: input.logicalTimeMs,
    });
    if (
      !certificate ||
      !(await this.certificates.verify({
        candidate,
        certificate,
        logicalTimeMs: input.logicalTimeMs,
      }))
    )
      return false;
    return (
      authorization(candidate, certificate).authorizationDigest ===
      retained.authorizationDigest
    );
  }
}

function authorization(
  candidate: MorphogenesisDecisionCandidateV1,
  certificate: CollectiveAgreementCommitCertificateV1,
): MorphogenesisDecisionAuthorizationV1 {
  const value = certificate.value;
  if (
    value.kind !== "application" ||
    value.valueId !== `morphogenesis:${candidate.candidateId}` ||
    certificate.coordinate.membershipEpoch !== candidate.membershipEpoch ||
    certificate.coordinate.membershipConfigurationDigest !==
      candidate.membershipConfigurationDigest
  )
    throw new TypeError("collective agreement does not bind the candidate");
  const payload = exactPayload(value.payload);
  if (payload.candidateDigest !== candidate.candidateDigest)
    throw new TypeError("collective agreement candidate digest changed");
  return createMorphogenesisDecisionAuthorizationV1({
    authorizationId: `${certificate.certificateId}:morphogenesis`,
    candidateDigest: candidate.candidateDigest,
    route: "collective",
    actorType: "collective",
    actorId: `collective:${certificate.coordinate.membershipConfigurationDigest}`,
    actorMandateDigest: payload.actorMandateDigest,
    independenceGroupId: payload.independenceGroupId,
    disposition: payload.disposition,
    proofDigest: digest(certificate.certificateDigest),
    issuedAtLogicalMs: certificate.committedAtLogicalMs,
    expiresAtLogicalMs: payload.expiresAtLogicalMs,
  });
}

function digest(value: unknown): `sha256:${string}` {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value))
    throw new TypeError("collective Morphogenesis certificate digest is invalid");
  return value as `sha256:${string}`;
}

function exactPayload(input: Readonly<Record<string, unknown>>): {
  readonly candidateDigest: `sha256:${string}`;
  readonly actorMandateDigest: `sha256:${string}`;
  readonly independenceGroupId: string;
  readonly disposition: "approved" | "rejected";
  readonly expiresAtLogicalMs: number;
} {
  const keys = Object.keys(input).sort();
  const expected = [
    "actorMandateDigest",
    "candidateDigest",
    "disposition",
    "expiresAtLogicalMs",
    "independenceGroupId",
  ].sort();
  if (keys.join(",") !== expected.join(","))
    throw new TypeError("collective Morphogenesis payload fields are invalid");
  for (const field of ["candidateDigest", "actorMandateDigest"] as const)
    if (
      typeof input[field] !== "string" ||
      !/^sha256:[0-9a-f]{64}$/u.test(input[field])
    )
      throw new TypeError("collective Morphogenesis digest is invalid");
  if (
    typeof input.independenceGroupId !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u.test(
      input.independenceGroupId,
    ) ||
    !["approved", "rejected"].includes(input.disposition as string) ||
    !Number.isSafeInteger(input.expiresAtLogicalMs) ||
    (input.expiresAtLogicalMs as number) < 1
  )
    throw new TypeError("collective Morphogenesis payload is invalid");
  return input as ReturnType<typeof exactPayload>;
}
