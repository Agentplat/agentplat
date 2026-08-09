import type { JsonValue } from "@agentplat/core";

import {
  CollectivePlanningValidationError,
  deepFreezePlanning,
  digestPlanningJsonV1,
} from "./canonical.js";
import type { PlanningDigestV1 } from "./contracts.js";
import { sha256HexPlanningV1 } from "./sha256.js";

export const DEVELOPMENT_CAPABILITY_IDS_V1 = [
  "autonomous-local-peer-host",
  "sparse-peer-discovery-routing",
  "durable-causal-delivery-catch-up",
  "membership-epochs-attenuated-lineage",
  "authenticated-rotation-aware-overlay-transport",
  "distributed-mission-decomposition",
  "decentralized-allocation-team-formation",
  "sparse-adversarial-agreement",
  "adversarial-context-fusion-local-credibility",
  "mission-execution-continuity-compromise-recovery",
  "autonomous-adaptation-local-replanning",
  "role-objective-context-drift-detection",
  "inference-time-intervention",
  "heterogeneous-open-black-box-adapters",
  "semantic-agility-governed-role-evolution",
  "anytime-statistical-guarantees-coupled-planning",
  "governed-agent-creation-termination",
  "versioned-agent-simulation-interoperability",
  "scale-safe-telemetry-executable-invariants",
] as const;

export type DevelopmentCapabilityIdV1 =
  (typeof DEVELOPMENT_CAPABILITY_IDS_V1)[number];

export interface DevelopmentCapabilityManifestV1 {
  readonly schemaVersion: 1;
  readonly manifestId: string;
  readonly capabilityId: DevelopmentCapabilityIdV1;
  readonly sourceCommit: string;
  readonly sourceTreeDigest: PlanningDigestV1;
  readonly publicSurfaceDigests: readonly PlanningDigestV1[];
  readonly integrationBoundaryDigests: readonly PlanningDigestV1[];
  readonly threatModelDigests: readonly PlanningDigestV1[];
  readonly manifestDigest: PlanningDigestV1;
}

export interface DevelopmentEvidenceAuthorizationV1 {
  readonly schemaVersion: 1;
  readonly capabilityId: DevelopmentCapabilityIdV1;
  readonly issuerId: string;
  readonly keyId: string;
  readonly manifestDigest: PlanningDigestV1;
}

export interface DevelopmentEvidencePolicyV1 {
  readonly schemaVersion: 1;
  readonly policyId: string;
  readonly sourceCommit: string;
  readonly sourceTreeDigest: PlanningDigestV1;
  readonly authorizations: readonly DevelopmentEvidenceAuthorizationV1[];
  readonly policyDigest: PlanningDigestV1;
}

export interface DevelopmentCapabilityReceiptV1 {
  readonly schemaVersion: 1;
  readonly receiptId: string;
  readonly capabilityId: DevelopmentCapabilityIdV1;
  readonly sourceCommit: string;
  readonly sourceTreeDigest: PlanningDigestV1;
  readonly policyDigest: PlanningDigestV1;
  readonly manifestDigest: PlanningDigestV1;
  readonly publicSurfaceDigests: readonly PlanningDigestV1[];
  readonly integrationBoundaryDigests: readonly PlanningDigestV1[];
  readonly threatModelDigests: readonly PlanningDigestV1[];
  readonly receiptDigest: PlanningDigestV1;
}

export interface DevelopmentEvidenceIssuerV1 {
  readonly schemaVersion: 1;
  readonly issuerId: string;
  readonly keyId: string;
  readonly algorithm: "Ed25519";
  readonly status: "active" | "revoked";
}

export interface DevelopmentCapabilityAttestationProofV1 {
  readonly algorithm: "Ed25519";
  readonly issuerId: string;
  readonly keyId: string;
  /** Detached Ed25519 signature encoded as unpadded base64url. */
  readonly value: string;
}

export interface UnsignedDevelopmentCapabilityAttestationV1 {
  readonly schemaVersion: 1;
  readonly attestationId: string;
  readonly receipt: DevelopmentCapabilityReceiptV1;
  readonly issuerId: string;
  readonly keyId: string;
  readonly algorithm: "Ed25519";
  readonly attestationDigest: PlanningDigestV1;
}

export interface SignedDevelopmentCapabilityAttestationV1 extends UnsignedDevelopmentCapabilityAttestationV1 {
  readonly proof: DevelopmentCapabilityAttestationProofV1;
}

export interface DevelopmentEvidenceResolverV1 {
  resolveManifest(input: {
    readonly manifestDigest: PlanningDigestV1;
  }): Promise<DevelopmentCapabilityManifestV1 | null>;
  resolveIssuer(input: {
    readonly issuerId: string;
    readonly keyId: string;
  }): Promise<DevelopmentEvidenceIssuerV1 | null>;
}

export interface DevelopmentSourceTreeEntryV1 {
  readonly path: string;
  readonly byteLength: number;
  /** SHA-256 of the exact file bytes, without a JSON/domain prefix. */
  readonly contentDigest: PlanningDigestV1;
}

export interface DevelopmentSourceTreeSnapshotV1 {
  readonly schemaVersion: 1;
  readonly sourceCommit: string;
  readonly entries: readonly DevelopmentSourceTreeEntryV1[];
  /** Deterministic digest of sourceCommit plus the ordered entry metadata. */
  readonly sourceTreeDigest: PlanningDigestV1;
}

/**
 * Resolves the exact source snapshot and bytes used by a closure assessment.
 * Implementations normally read a frozen VCS tree or release bundle. The
 * assessor independently hashes every returned file and never retains bytes.
 */
export interface DevelopmentEvidenceArtifactResolverV1 {
  resolveSourceTree(input: {
    readonly sourceCommit: string;
    readonly sourceTreeDigest: PlanningDigestV1;
  }): Promise<DevelopmentSourceTreeSnapshotV1 | null>;
  resolveArtifact(input: {
    readonly sourceCommit: string;
    readonly sourceTreeDigest: PlanningDigestV1;
    readonly path: string;
    readonly contentDigest: PlanningDigestV1;
    readonly byteLength: number;
  }): Promise<Uint8Array | null>;
}

export interface DevelopmentEvidenceAttestationSignerV1 {
  sign(input: {
    readonly issuerId: string;
    readonly keyId: string;
    readonly algorithm: "Ed25519";
    readonly attestationDigest: PlanningDigestV1;
  }): Promise<string>;
}

export interface DevelopmentEvidenceAttestationVerifierV1 {
  verify(input: {
    readonly issuer: DevelopmentEvidenceIssuerV1;
    readonly attestation: SignedDevelopmentCapabilityAttestationV1;
    readonly attestationDigest: PlanningDigestV1;
  }): Promise<boolean>;
}

export interface DevelopmentEvidencePublicKeyResolverV1 {
  resolve(input: {
    readonly issuerId: string;
    readonly keyId: string;
    readonly algorithm: "Ed25519";
  }): Promise<CryptoKey | null>;
}

const developmentEvidenceVerifierBindings = new WeakMap<
  object,
  {
    readonly resolveKey: DevelopmentEvidencePublicKeyResolverV1["resolve"];
    readonly verify: SubtleCrypto["verify"];
  }
>();

/** Concrete, construction-bound Ed25519 verifier used by source closure. */
export class WebCryptoDevelopmentEvidenceAttestationVerifierV1 implements DevelopmentEvidenceAttestationVerifierV1 {
  constructor(options: {
    readonly keys: DevelopmentEvidencePublicKeyResolverV1;
  }) {
    if (!options?.keys || typeof options.keys.resolve !== "function")
      fail("development evidence public-key resolver is required");
    const crypto = globalThis.crypto;
    if (!crypto?.subtle || typeof crypto.subtle.verify !== "function")
      fail("development evidence Web Crypto implementation is required");
    developmentEvidenceVerifierBindings.set(this, {
      resolveKey: options.keys.resolve.bind(options.keys),
      verify: crypto.subtle.verify.bind(crypto.subtle),
    });
  }

  verify(input: {
    readonly issuer: DevelopmentEvidenceIssuerV1;
    readonly attestation: SignedDevelopmentCapabilityAttestationV1;
    readonly attestationDigest: PlanningDigestV1;
  }): Promise<boolean> {
    return verifyWithBoundWebCrypto(this, input);
  }
}

export interface DevelopmentCapabilityAssessmentV1 {
  readonly schemaVersion: 1;
  readonly policyDigest: PlanningDigestV1;
  readonly sourceCommit: string;
  readonly sourceTreeDigest: PlanningDigestV1;
  readonly acceptedAttestationDigests: readonly PlanningDigestV1[];
  readonly acceptedReceiptDigests: readonly PlanningDigestV1[];
  readonly coveredCapabilityIds: readonly DevelopmentCapabilityIdV1[];
  readonly missingCapabilityIds: readonly DevelopmentCapabilityIdV1[];
  readonly developmentStatus: "development_complete" | "development_incomplete";
  readonly empiricalValidationStatus: "pending";
  readonly executionPermitted: false;
  readonly assessmentDigest: PlanningDigestV1;
}

const MAXIMUM_DEVELOPMENT_SOURCE_ENTRIES = 250_000;
const MAXIMUM_DEVELOPMENT_SOURCE_FILE_BYTES = 64 * 1024 * 1024;
const MAXIMUM_DEVELOPMENT_SOURCE_TOTAL_BYTES = 4 * 1024 * 1024 * 1024;

export function digestDevelopmentEvidenceArtifactV1(
  bytes: Uint8Array,
): PlanningDigestV1 {
  if (!(bytes instanceof Uint8Array))
    fail("development evidence artifact bytes are invalid");
  return `sha256:${sha256HexPlanningV1(bytes)}`;
}

export function createDevelopmentSourceTreeSnapshotV1(input: {
  readonly schemaVersion: 1;
  readonly sourceCommit: string;
  readonly entries: readonly DevelopmentSourceTreeEntryV1[];
}): DevelopmentSourceTreeSnapshotV1 {
  const body = validateSourceTreeBody(input);
  return deepFreezePlanning({
    ...body,
    sourceTreeDigest: digest("development-source-tree-v1", body),
  });
}

export function validateDevelopmentSourceTreeSnapshotV1(
  input: DevelopmentSourceTreeSnapshotV1,
): DevelopmentSourceTreeSnapshotV1 {
  const body = validateSourceTreeBody(input);
  if (input.sourceTreeDigest !== digest("development-source-tree-v1", body))
    fail("development source tree digest mismatch");
  return deepFreezePlanning({
    ...body,
    sourceTreeDigest: input.sourceTreeDigest,
  });
}

export function createDevelopmentCapabilityManifestV1(
  input: Omit<DevelopmentCapabilityManifestV1, "manifestDigest">,
): DevelopmentCapabilityManifestV1 {
  const body = validateManifestBody(input);
  return deepFreezePlanning({
    ...body,
    manifestDigest: digest("development-capability-manifest-v1", body),
  });
}

export function validateDevelopmentCapabilityManifestV1(
  input: DevelopmentCapabilityManifestV1,
): DevelopmentCapabilityManifestV1 {
  const body = validateManifestBody(input);
  if (
    input.manifestDigest !== digest("development-capability-manifest-v1", body)
  )
    fail("development capability manifest digest mismatch");
  return deepFreezePlanning({ ...body, manifestDigest: input.manifestDigest });
}

export function createDevelopmentEvidencePolicyV1(
  input: Omit<DevelopmentEvidencePolicyV1, "policyDigest">,
): DevelopmentEvidencePolicyV1 {
  const body = validatePolicyBody(input);
  return deepFreezePlanning({
    ...body,
    policyDigest: digest("development-capability-policy-v1", body),
  });
}

export function validateDevelopmentEvidencePolicyV1(
  input: DevelopmentEvidencePolicyV1,
): DevelopmentEvidencePolicyV1 {
  const body = validatePolicyBody(input);
  if (input.policyDigest !== digest("development-capability-policy-v1", body))
    fail("development evidence policy digest mismatch");
  return deepFreezePlanning({ ...body, policyDigest: input.policyDigest });
}

export function createDevelopmentCapabilityReceiptV1(
  input: Omit<DevelopmentCapabilityReceiptV1, "receiptDigest">,
): DevelopmentCapabilityReceiptV1 {
  const body = validateReceiptBody(input);
  return deepFreezePlanning({
    ...body,
    receiptDigest: digest("development-capability-receipt-v1", body),
  });
}

export function validateDevelopmentCapabilityReceiptV1(
  input: DevelopmentCapabilityReceiptV1,
): DevelopmentCapabilityReceiptV1 {
  const body = validateReceiptBody(input);
  if (input.receiptDigest !== digest("development-capability-receipt-v1", body))
    fail("development capability receipt digest mismatch");
  return deepFreezePlanning({ ...body, receiptDigest: input.receiptDigest });
}

export function createUnsignedDevelopmentCapabilityAttestationV1(input: {
  readonly receipt: DevelopmentCapabilityReceiptV1;
  readonly issuerId: string;
  readonly keyId: string;
}): UnsignedDevelopmentCapabilityAttestationV1 {
  const receipt = validateDevelopmentCapabilityReceiptV1(input.receipt);
  requireText(input.issuerId, "development evidence issuer id");
  requireText(input.keyId, "development evidence key id");
  const signedContent = {
    schemaVersion: 1 as const,
    receipt,
    issuerId: input.issuerId,
    keyId: input.keyId,
    algorithm: "Ed25519" as const,
  };
  const attestationDigest = digest(
    "development-capability-attestation-v1",
    signedContent,
  );
  return deepFreezePlanning({
    ...signedContent,
    attestationId: `development-attestation.${attestationDigest.slice(7)}`,
    attestationDigest,
  });
}

export async function issueDevelopmentCapabilityAttestationV1(input: {
  readonly receipt: DevelopmentCapabilityReceiptV1;
  readonly issuerId: string;
  readonly keyId: string;
  readonly signer: DevelopmentEvidenceAttestationSignerV1;
}): Promise<SignedDevelopmentCapabilityAttestationV1> {
  if (!input.signer || typeof input.signer.sign !== "function")
    fail("development evidence attestation signer is required");
  const unsigned = createUnsignedDevelopmentCapabilityAttestationV1(input);
  const value = await input.signer.sign({
    issuerId: unsigned.issuerId,
    keyId: unsigned.keyId,
    algorithm: unsigned.algorithm,
    attestationDigest: unsigned.attestationDigest,
  });
  validateSignature(value);
  return deepFreezePlanning({
    ...unsigned,
    proof: {
      algorithm: unsigned.algorithm,
      issuerId: unsigned.issuerId,
      keyId: unsigned.keyId,
      value,
    },
  });
}

export function validateSignedDevelopmentCapabilityAttestationV1(
  input: SignedDevelopmentCapabilityAttestationV1,
): SignedDevelopmentCapabilityAttestationV1 {
  rejectUnknown(input, [
    "schemaVersion",
    "attestationId",
    "receipt",
    "issuerId",
    "keyId",
    "algorithm",
    "attestationDigest",
    "proof",
  ]);
  const rebuilt = createUnsignedDevelopmentCapabilityAttestationV1({
    receipt: input.receipt,
    issuerId: input.issuerId,
    keyId: input.keyId,
  });
  if (
    input.schemaVersion !== 1 ||
    input.algorithm !== "Ed25519" ||
    input.attestationId !== rebuilt.attestationId ||
    input.attestationDigest !== rebuilt.attestationDigest
  )
    fail("development capability attestation binding mismatch");
  const proof = validateProof(input.proof);
  if (
    proof.algorithm !== rebuilt.algorithm ||
    proof.issuerId !== rebuilt.issuerId ||
    proof.keyId !== rebuilt.keyId
  )
    fail("development capability attestation proof binding mismatch");
  return deepFreezePlanning({ ...rebuilt, proof });
}

/**
 * Produces source closure only after locally resolving and verifying every
 * authorized manifest and issuer. It never grants execution authority and does
 * not convert source evidence into empirical evidence.
 */
export async function assessDevelopmentCapabilitiesV1(input: {
  readonly policy: DevelopmentEvidencePolicyV1;
  readonly attestations: readonly SignedDevelopmentCapabilityAttestationV1[];
  readonly resolver: DevelopmentEvidenceResolverV1;
  readonly artifactResolver: DevelopmentEvidenceArtifactResolverV1;
  readonly verifier: DevelopmentEvidenceAttestationVerifierV1;
}): Promise<DevelopmentCapabilityAssessmentV1> {
  const policy = validateDevelopmentEvidencePolicyV1(input.policy);
  if (!Array.isArray(input.attestations))
    fail("development evidence attestations are invalid");
  if (
    !input.resolver ||
    typeof input.resolver.resolveManifest !== "function" ||
    typeof input.resolver.resolveIssuer !== "function"
  )
    fail("development evidence resolver is required");
  if (
    !input.artifactResolver ||
    typeof input.artifactResolver.resolveSourceTree !== "function" ||
    typeof input.artifactResolver.resolveArtifact !== "function"
  )
    fail("development evidence artifact resolver is required");
  if (
    !input.verifier ||
    !developmentEvidenceVerifierBindings.has(input.verifier as object)
  )
    fail("concrete development evidence Ed25519 verifier is required");

  const verifiedSourceDigests = await verifyDevelopmentSourceTree(
    policy,
    input.artifactResolver,
  );

  const authorizations = new Map(
    policy.authorizations.map((authorization) => [
      authorization.capabilityId,
      authorization,
    ]),
  );
  const covered = new Set<DevelopmentCapabilityIdV1>();
  const receiptIds = new Set<string>();
  const receiptDigests = new Set<PlanningDigestV1>();
  const attestationDigests = new Set<PlanningDigestV1>();
  for (const raw of input.attestations) {
    const attestation = validateSignedDevelopmentCapabilityAttestationV1(raw);
    const receipt = attestation.receipt;
    if (covered.has(receipt.capabilityId))
      fail(
        `duplicate development capability attestation: ${receipt.capabilityId}`,
      );
    if (receiptIds.has(receipt.receiptId))
      fail("duplicate development capability receipt id");
    if (
      receiptDigests.has(receipt.receiptDigest) ||
      attestationDigests.has(attestation.attestationDigest)
    )
      fail("duplicate development evidence digest");
    assertSourceBinding(receipt, policy);
    const authorization = authorizations.get(receipt.capabilityId);
    if (
      !authorization ||
      authorization.issuerId !== attestation.issuerId ||
      authorization.keyId !== attestation.keyId ||
      authorization.manifestDigest !== receipt.manifestDigest
    )
      fail("development capability attestation is not authorized by policy");

    const manifestValue = await input.resolver.resolveManifest({
      manifestDigest: authorization.manifestDigest,
    });
    if (!manifestValue)
      fail("authorized development capability manifest is unavailable");
    const manifest = validateDevelopmentCapabilityManifestV1(manifestValue);
    assertManifestBinding(manifest, receipt, policy);
    for (const artifactDigest of [
      ...manifest.publicSurfaceDigests,
      ...manifest.integrationBoundaryDigests,
      ...manifest.threatModelDigests,
    ])
      if (!verifiedSourceDigests.has(artifactDigest))
        fail("development capability evidence is absent from source tree");

    const issuerValue = await input.resolver.resolveIssuer({
      issuerId: authorization.issuerId,
      keyId: authorization.keyId,
    });
    const issuer = validateIssuer(issuerValue);
    if (issuer.status !== "active")
      fail("development evidence issuer is not active");
    if (
      issuer.issuerId !== authorization.issuerId ||
      issuer.keyId !== authorization.keyId ||
      issuer.algorithm !== attestation.algorithm
    )
      fail("development evidence issuer binding mismatch");
    if (
      !(await verifyWithBoundWebCrypto(input.verifier, {
        issuer,
        attestation,
        attestationDigest: attestation.attestationDigest,
      }))
    )
      fail("development capability attestation signature is invalid");

    covered.add(receipt.capabilityId);
    receiptIds.add(receipt.receiptId);
    receiptDigests.add(receipt.receiptDigest);
    attestationDigests.add(attestation.attestationDigest);
  }
  const coveredCapabilityIds = DEVELOPMENT_CAPABILITY_IDS_V1.filter((item) =>
    covered.has(item),
  );
  const missingCapabilityIds = DEVELOPMENT_CAPABILITY_IDS_V1.filter(
    (item) => !covered.has(item),
  );
  const body = {
    schemaVersion: 1 as const,
    policyDigest: policy.policyDigest,
    sourceCommit: policy.sourceCommit,
    sourceTreeDigest: policy.sourceTreeDigest,
    acceptedAttestationDigests: [...attestationDigests].sort(),
    acceptedReceiptDigests: [...receiptDigests].sort(),
    coveredCapabilityIds,
    missingCapabilityIds,
    developmentStatus: (missingCapabilityIds.length === 0
      ? "development_complete"
      : "development_incomplete") as
      "development_complete" | "development_incomplete",
    empiricalValidationStatus: "pending" as const,
    executionPermitted: false as const,
  };
  return deepFreezePlanning({
    ...body,
    assessmentDigest: digest("development-capability-assessment-v1", body),
  });
}

async function verifyDevelopmentSourceTree(
  policy: DevelopmentEvidencePolicyV1,
  resolver: DevelopmentEvidenceArtifactResolverV1,
): Promise<ReadonlySet<PlanningDigestV1>> {
  const value = await resolver.resolveSourceTree({
    sourceCommit: policy.sourceCommit,
    sourceTreeDigest: policy.sourceTreeDigest,
  });
  if (!value) fail("development source tree is unavailable");
  const tree = validateDevelopmentSourceTreeSnapshotV1(value);
  if (
    tree.sourceCommit !== policy.sourceCommit ||
    tree.sourceTreeDigest !== policy.sourceTreeDigest
  )
    fail("development source tree binding mismatch");
  const verifiedDigests = new Set<PlanningDigestV1>();
  let totalBytes = 0;
  for (const entry of tree.entries) {
    const bytes = await resolver.resolveArtifact({
      sourceCommit: tree.sourceCommit,
      sourceTreeDigest: tree.sourceTreeDigest,
      path: entry.path,
      contentDigest: entry.contentDigest,
      byteLength: entry.byteLength,
    });
    if (!(bytes instanceof Uint8Array))
      fail("development source artifact is unavailable");
    if (bytes.byteLength !== entry.byteLength)
      fail("development source artifact length mismatch");
    if (digestDevelopmentEvidenceArtifactV1(bytes) !== entry.contentDigest)
      fail("development source artifact digest mismatch");
    totalBytes += bytes.byteLength;
    if (
      !Number.isSafeInteger(totalBytes) ||
      totalBytes > MAXIMUM_DEVELOPMENT_SOURCE_TOTAL_BYTES
    )
      fail("development source tree byte budget exceeded");
    verifiedDigests.add(entry.contentDigest);
  }
  return verifiedDigests;
}

function validateSourceTreeBody(
  input:
    | Omit<DevelopmentSourceTreeSnapshotV1, "sourceTreeDigest">
    | DevelopmentSourceTreeSnapshotV1,
) {
  rejectUnknown(input, [
    "schemaVersion",
    "sourceCommit",
    "entries",
    "sourceTreeDigest",
  ]);
  if (input.schemaVersion !== 1)
    fail("development source tree schema version is unsupported");
  validateCommit(input.sourceCommit);
  if (
    !Array.isArray(input.entries) ||
    input.entries.length === 0 ||
    input.entries.length > MAXIMUM_DEVELOPMENT_SOURCE_ENTRIES
  )
    fail("development source tree entries are invalid");
  const entries = input.entries.map((entry) => {
    rejectUnknown(entry, ["path", "byteLength", "contentDigest"]);
    const path = validateSourcePath(entry.path);
    if (
      !Number.isSafeInteger(entry.byteLength) ||
      entry.byteLength < 0 ||
      entry.byteLength > MAXIMUM_DEVELOPMENT_SOURCE_FILE_BYTES
    )
      fail("development source tree entry byte length is invalid");
    validateDigest(
      entry.contentDigest,
      "development source tree entry content digest",
    );
    return {
      path,
      byteLength: entry.byteLength,
      contentDigest: entry.contentDigest,
    };
  });
  if (
    entries.some(
      (entry, index) =>
        index > 0 &&
        compareCodeUnits(entries[index - 1]!.path, entry.path) >= 0,
    )
  )
    fail("development source tree entries must be uniquely code-unit sorted");
  return {
    schemaVersion: 1 as const,
    sourceCommit: input.sourceCommit,
    entries: deepFreezePlanning(entries),
  };
}

function validateSourcePath(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 1_024 ||
    value.startsWith("/") ||
    value.includes("\\") ||
    value.includes("\u0000")
  )
    fail("development source tree path is invalid");
  const segments = value.split("/");
  if (
    segments.some((segment) => !segment || segment === "." || segment === "..")
  )
    fail("development source tree path is invalid");
  return value;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

async function verifyWithBoundWebCrypto(
  verifier: DevelopmentEvidenceAttestationVerifierV1,
  input: {
    readonly issuer: DevelopmentEvidenceIssuerV1;
    readonly attestation: SignedDevelopmentCapabilityAttestationV1;
    readonly attestationDigest: PlanningDigestV1;
  },
): Promise<boolean> {
  const binding = developmentEvidenceVerifierBindings.get(verifier as object);
  if (!binding)
    fail("concrete development evidence Ed25519 verifier is required");
  const key = await binding.resolveKey({
    issuerId: input.issuer.issuerId,
    keyId: input.issuer.keyId,
    algorithm: input.issuer.algorithm,
  });
  if (!isEd25519VerificationKey(key)) return false;
  let signature: Uint8Array;
  try {
    signature = decodeBase64Url(input.attestation.proof.value);
  } catch {
    return false;
  }
  if (signature.byteLength !== 64) return false;
  const signatureBuffer = new ArrayBuffer(signature.byteLength);
  new Uint8Array(signatureBuffer).set(signature);
  const message = new TextEncoder().encode(input.attestationDigest);
  try {
    return await binding.verify(
      "Ed25519",
      key,
      signatureBuffer,
      message.buffer,
    );
  } catch {
    return false;
  }
}

function isEd25519VerificationKey(value: CryptoKey | null): value is CryptoKey {
  return Boolean(
    value &&
    value.type === "public" &&
    value.algorithm?.name === "Ed25519" &&
    value.usages.length === 1 &&
    value.usages[0] === "verify",
  );
}

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value))
    throw new TypeError("base64url value is invalid");
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const output = new Uint8Array(Math.floor((value.length * 6) / 8));
  let accumulator = 0;
  let bits = 0;
  let offset = 0;
  for (const character of value) {
    const decoded = alphabet.indexOf(character);
    if (decoded < 0) throw new TypeError("base64url value is invalid");
    accumulator = (accumulator << 6) | decoded;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output[offset++] = (accumulator >>> bits) & 0xff;
    }
  }
  if (bits > 0 && (accumulator & ((1 << bits) - 1)) !== 0)
    throw new TypeError("base64url value is not canonical");
  return output;
}

function validateManifestBody(
  input:
    | Omit<DevelopmentCapabilityManifestV1, "manifestDigest">
    | DevelopmentCapabilityManifestV1,
) {
  rejectUnknown(input, [
    "schemaVersion",
    "manifestId",
    "capabilityId",
    "sourceCommit",
    "sourceTreeDigest",
    "publicSurfaceDigests",
    "integrationBoundaryDigests",
    "threatModelDigests",
    "manifestDigest",
  ]);
  if (input.schemaVersion !== 1)
    fail("development capability manifest schema version is unsupported");
  requireText(input.manifestId, "development capability manifest id");
  const capabilityId = validateCapabilityId(input.capabilityId);
  validateCommit(input.sourceCommit);
  validateDigest(
    input.sourceTreeDigest,
    "development capability manifest source tree digest",
  );
  return {
    schemaVersion: 1 as const,
    manifestId: input.manifestId,
    capabilityId,
    sourceCommit: input.sourceCommit,
    sourceTreeDigest: input.sourceTreeDigest,
    publicSurfaceDigests: validateEvidenceDigests(
      input.publicSurfaceDigests,
      "public surface",
    ),
    integrationBoundaryDigests: validateEvidenceDigests(
      input.integrationBoundaryDigests,
      "integration boundary",
    ),
    threatModelDigests: validateEvidenceDigests(
      input.threatModelDigests,
      "threat model",
    ),
  };
}

function validatePolicyBody(
  input:
    | Omit<DevelopmentEvidencePolicyV1, "policyDigest">
    | DevelopmentEvidencePolicyV1,
) {
  rejectUnknown(input, [
    "schemaVersion",
    "policyId",
    "sourceCommit",
    "sourceTreeDigest",
    "authorizations",
    "policyDigest",
  ]);
  if (input.schemaVersion !== 1)
    fail("development evidence policy schema version is unsupported");
  requireText(input.policyId, "development evidence policy id");
  validateCommit(input.sourceCommit);
  validateDigest(
    input.sourceTreeDigest,
    "development evidence source tree digest",
  );
  if (
    !Array.isArray(input.authorizations) ||
    input.authorizations.length > DEVELOPMENT_CAPABILITY_IDS_V1.length
  )
    fail("development evidence authorizations are invalid");
  const authorizations = input.authorizations.map(validateAuthorization);
  if (
    new Set(authorizations.map((item) => item.capabilityId)).size !==
    authorizations.length
  )
    fail("development evidence capability authorization is duplicated");
  if (
    authorizations.some(
      (item, index) =>
        index > 0 &&
        authorizations[index - 1]!.capabilityId >= item.capabilityId,
    )
  )
    fail(
      "development evidence authorizations must be ascending by capability id",
    );
  return {
    schemaVersion: 1 as const,
    policyId: input.policyId,
    sourceCommit: input.sourceCommit,
    sourceTreeDigest: input.sourceTreeDigest,
    authorizations,
  };
}

function validateAuthorization(
  input: DevelopmentEvidenceAuthorizationV1,
): DevelopmentEvidenceAuthorizationV1 {
  rejectUnknown(input, [
    "schemaVersion",
    "capabilityId",
    "issuerId",
    "keyId",
    "manifestDigest",
  ]);
  if (input.schemaVersion !== 1)
    fail("development evidence authorization schema version is unsupported");
  requireText(input.issuerId, "development evidence authorization issuer id");
  requireText(input.keyId, "development evidence authorization key id");
  validateDigest(
    input.manifestDigest,
    "development evidence authorization manifest digest",
  );
  return deepFreezePlanning({
    schemaVersion: 1,
    capabilityId: validateCapabilityId(input.capabilityId),
    issuerId: input.issuerId,
    keyId: input.keyId,
    manifestDigest: input.manifestDigest,
  });
}

function validateReceiptBody(
  input:
    | Omit<DevelopmentCapabilityReceiptV1, "receiptDigest">
    | DevelopmentCapabilityReceiptV1,
) {
  rejectUnknown(input, [
    "schemaVersion",
    "receiptId",
    "capabilityId",
    "sourceCommit",
    "sourceTreeDigest",
    "policyDigest",
    "manifestDigest",
    "publicSurfaceDigests",
    "integrationBoundaryDigests",
    "threatModelDigests",
    "receiptDigest",
  ]);
  if (input.schemaVersion !== 1)
    fail("development capability receipt schema version is unsupported");
  requireText(input.receiptId, "development capability receipt id");
  validateCommit(input.sourceCommit);
  validateDigest(
    input.sourceTreeDigest,
    "development capability source tree digest",
  );
  validateDigest(input.policyDigest, "development capability policy digest");
  validateDigest(
    input.manifestDigest,
    "development capability manifest digest",
  );
  return {
    schemaVersion: 1 as const,
    receiptId: input.receiptId,
    capabilityId: validateCapabilityId(input.capabilityId),
    sourceCommit: input.sourceCommit,
    sourceTreeDigest: input.sourceTreeDigest,
    policyDigest: input.policyDigest,
    manifestDigest: input.manifestDigest,
    publicSurfaceDigests: validateEvidenceDigests(
      input.publicSurfaceDigests,
      "public surface",
    ),
    integrationBoundaryDigests: validateEvidenceDigests(
      input.integrationBoundaryDigests,
      "integration boundary",
    ),
    threatModelDigests: validateEvidenceDigests(
      input.threatModelDigests,
      "threat model",
    ),
  };
}

function validateProof(
  input: DevelopmentCapabilityAttestationProofV1,
): DevelopmentCapabilityAttestationProofV1 {
  rejectUnknown(input, ["algorithm", "issuerId", "keyId", "value"]);
  if (input.algorithm !== "Ed25519")
    fail("development evidence proof algorithm is invalid");
  requireText(input.issuerId, "development evidence proof issuer id");
  requireText(input.keyId, "development evidence proof key id");
  validateSignature(input.value);
  return deepFreezePlanning({ ...input });
}

function validateIssuer(
  input: DevelopmentEvidenceIssuerV1 | null,
): DevelopmentEvidenceIssuerV1 {
  if (!input) fail("development evidence issuer is unavailable");
  rejectUnknown(input, [
    "schemaVersion",
    "issuerId",
    "keyId",
    "algorithm",
    "status",
  ]);
  if (
    input.schemaVersion !== 1 ||
    input.algorithm !== "Ed25519" ||
    (input.status !== "active" && input.status !== "revoked")
  )
    fail("development evidence issuer is invalid");
  requireText(input.issuerId, "development evidence issuer id");
  requireText(input.keyId, "development evidence issuer key id");
  return deepFreezePlanning({ ...input });
}

function assertSourceBinding(
  receipt: DevelopmentCapabilityReceiptV1,
  policy: DevelopmentEvidencePolicyV1,
): void {
  if (receipt.sourceCommit !== policy.sourceCommit)
    fail("development evidence source commit mismatch");
  if (receipt.sourceTreeDigest !== policy.sourceTreeDigest)
    fail("development evidence source tree mismatch");
  if (receipt.policyDigest !== policy.policyDigest)
    fail("development evidence policy mismatch");
}

function assertManifestBinding(
  manifest: DevelopmentCapabilityManifestV1,
  receipt: DevelopmentCapabilityReceiptV1,
  policy: DevelopmentEvidencePolicyV1,
): void {
  if (
    manifest.manifestDigest !== receipt.manifestDigest ||
    manifest.capabilityId !== receipt.capabilityId ||
    manifest.sourceCommit !== policy.sourceCommit ||
    manifest.sourceTreeDigest !== policy.sourceTreeDigest
  )
    fail("development capability manifest binding mismatch");
  if (
    !sameDigests(manifest.publicSurfaceDigests, receipt.publicSurfaceDigests) ||
    !sameDigests(
      manifest.integrationBoundaryDigests,
      receipt.integrationBoundaryDigests,
    ) ||
    !sameDigests(manifest.threatModelDigests, receipt.threatModelDigests)
  )
    fail("development capability receipt is not authorized by manifest");
}

function validateCapabilityId(value: unknown): DevelopmentCapabilityIdV1 {
  if (!(DEVELOPMENT_CAPABILITY_IDS_V1 as readonly unknown[]).includes(value))
    fail("unknown development capability claim");
  return value as DevelopmentCapabilityIdV1;
}

function validateEvidenceDigests(
  value: readonly PlanningDigestV1[],
  label: string,
): readonly PlanningDigestV1[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 64)
    fail(`${label} evidence requires between one and 64 content digests`);
  const normalized = [...value];
  for (const item of normalized)
    validateDigest(item, `${label} evidence digest`);
  if (new Set(normalized).size !== normalized.length)
    fail(`${label} evidence digests must be unique`);
  if (
    normalized.some(
      (item, index) => index > 0 && normalized[index - 1]! >= item,
    )
  )
    fail(`${label} evidence digests must be ascending`);
  return deepFreezePlanning(normalized);
}

function sameDigests(
  left: readonly PlanningDigestV1[],
  right: readonly PlanningDigestV1[],
): boolean {
  return (
    left.length === right.length &&
    left.every((item, index) => item === right[index])
  );
}

function digest(domain: string, input: unknown): PlanningDigestV1 {
  return digestPlanningJsonV1(domain as never, input as JsonValue);
}

function validateDigest(
  value: unknown,
  label: string,
): asserts value is PlanningDigestV1 {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value))
    fail(`${label} is invalid`);
}

function validateCommit(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(value)
  )
    fail("development evidence source commit is invalid");
}

function validateSignature(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{86}$/.test(value))
    fail("development evidence Ed25519 signature is invalid");
}

function requireText(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 200)
    fail(`${label} is invalid`);
}

function rejectUnknown(value: object, allowed: readonly string[]): void {
  for (const key of Object.keys(value))
    if (!allowed.includes(key))
      fail(`unknown development evidence field: ${key}`);
}

function fail(message: string): never {
  throw new CollectivePlanningValidationError(message);
}
