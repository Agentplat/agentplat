import type { AgentPlatID } from "@agentplat/core";
import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";

/** Provider-neutral, content-free forensic preservation contracts. */
export const FORENSIC_PRESERVATION_SCHEMA_VERSION_V1 = 1 as const;

export type ForensicCustodyActionV1 =
  | "observed"
  | "acquired"
  | "verified"
  | "exported"
  | "archived"
  | "retention_changed"
  | "disposed";

export interface ForensicRetentionPolicyV1 {
  readonly schemaVersion: 1;
  readonly policyId: AgentPlatID;
  readonly policyVersion: string;
  readonly minimumRetentionMs: number;
  readonly legalHold: boolean;
  readonly disposition: "retain" | "archive" | "crypto_shred";
  readonly policyDigest: PlanningDigestV1;
}

export interface ForensicEvidenceRecordV1 {
  readonly schemaVersion: 1;
  readonly incidentId: AgentPlatID;
  readonly recordId: AgentPlatID;
  readonly sequence: number;
  readonly previousRecordDigest: PlanningDigestV1 | null;
  readonly evidenceKind: string;
  readonly evidenceId: AgentPlatID;
  /** Digest of bytes retained by an external evidence repository. */
  readonly contentDigest: PlanningDigestV1;
  readonly mediaType: string;
  readonly encodedBytes: number;
  readonly sourceId: AgentPlatID;
  readonly observedAtLogicalMs: number;
  readonly policyDigest: PlanningDigestV1;
  readonly recordDigest: PlanningDigestV1;
}

export interface ForensicCustodyReceiptV1 {
  readonly schemaVersion: 1;
  readonly incidentId: AgentPlatID;
  readonly receiptId: AgentPlatID;
  readonly sequence: number;
  readonly previousReceiptDigest: PlanningDigestV1 | null;
  readonly action: ForensicCustodyActionV1;
  readonly actorId: AgentPlatID;
  readonly subjectDigest: PlanningDigestV1;
  readonly occurredAtLogicalMs: number;
  readonly reasonCode: string;
  readonly receiptDigest: PlanningDigestV1;
}

export interface ForensicExportManifestV1 {
  readonly schemaVersion: 1;
  readonly incidentId: AgentPlatID;
  readonly exportId: AgentPlatID;
  readonly evidenceRecordDigests: readonly PlanningDigestV1[];
  readonly custodyReceiptDigests: readonly PlanningDigestV1[];
  readonly evidenceHeadDigest: PlanningDigestV1 | null;
  readonly custodyHeadDigest: PlanningDigestV1 | null;
  readonly retentionPolicy: ForensicRetentionPolicyV1;
  readonly createdAtLogicalMs: number;
  readonly manifestDigest: PlanningDigestV1;
}

export interface ForensicManifestSignatureV1 {
  readonly schemaVersion: 1;
  readonly manifestDigest: PlanningDigestV1;
  readonly signerId: AgentPlatID;
  readonly keyId: AgentPlatID;
  readonly algorithm: string;
  readonly signature: string;
}

export interface ForensicManifestSignerV1 {
  readonly signerId: AgentPlatID;
  readonly keyId: AgentPlatID;
  readonly algorithm: string;
  sign(manifestDigest: PlanningDigestV1): Promise<string>;
}

export interface ForensicManifestVerifierV1 {
  verify(signature: ForensicManifestSignatureV1): Promise<boolean>;
}

export interface ForensicExportBundleV1 {
  readonly manifest: ForensicExportManifestV1;
  readonly signature: ForensicManifestSignatureV1 | null;
  readonly evidenceRecords: readonly ForensicEvidenceRecordV1[];
  readonly custodyReceipts: readonly ForensicCustodyReceiptV1[];
}

/** Append-only storage; implementations MUST reject identity conflicts. */
export interface ForensicEvidenceRepositoryV1 {
  listEvidence(incidentId: AgentPlatID): Promise<readonly ForensicEvidenceRecordV1[]>;
  appendEvidence(record: ForensicEvidenceRecordV1): Promise<void>;
  listReceipts(incidentId: AgentPlatID): Promise<readonly ForensicCustodyReceiptV1[]>;
  appendReceipt(receipt: ForensicCustodyReceiptV1): Promise<void>;
}

export function forensicDigestV1(domain: string, input: unknown): PlanningDigestV1 {
  return digestPlanningJsonV1("collective-planning-snapshot", {
    domain: `forensic-preservation:${domain}`,
    input,
  } as PlanningJson);
}

export function createForensicRetentionPolicyV1(
  input: Omit<ForensicRetentionPolicyV1, "policyDigest">,
): ForensicRetentionPolicyV1 {
  assertSchema(input.schemaVersion);
  assertId(input.policyId, "policyId");
  assertToken(input.policyVersion, "policyVersion");
  assertNonNegative(input.minimumRetentionMs, "minimumRetentionMs");
  if (!["retain", "archive", "crypto_shred"].includes(input.disposition))
    fail("retention disposition is invalid");
  const body = freeze({ ...input });
  return freeze({ ...body, policyDigest: forensicDigestV1("retention-policy", body) });
}

export function createForensicEvidenceRecordV1(
  input: Omit<ForensicEvidenceRecordV1, "recordDigest">,
): ForensicEvidenceRecordV1 {
  assertSchema(input.schemaVersion);
  assertId(input.incidentId, "incidentId");
  assertId(input.recordId, "recordId");
  assertId(input.evidenceId, "evidenceId");
  assertId(input.sourceId, "sourceId");
  assertPositive(input.sequence, "sequence");
  assertDigestOrNull(input.previousRecordDigest, "previousRecordDigest");
  assertToken(input.evidenceKind, "evidenceKind");
  assertToken(input.mediaType, "mediaType");
  assertDigest(input.contentDigest, "contentDigest");
  assertDigest(input.policyDigest, "policyDigest");
  assertNonNegative(input.encodedBytes, "encodedBytes");
  assertNonNegative(input.observedAtLogicalMs, "observedAtLogicalMs");
  const body = freeze({ ...input });
  return freeze({ ...body, recordDigest: forensicDigestV1("evidence-record", body) });
}

export function createForensicCustodyReceiptV1(
  input: Omit<ForensicCustodyReceiptV1, "receiptDigest">,
): ForensicCustodyReceiptV1 {
  assertSchema(input.schemaVersion);
  assertId(input.incidentId, "incidentId");
  assertId(input.receiptId, "receiptId");
  assertId(input.actorId, "actorId");
  assertPositive(input.sequence, "sequence");
  assertDigestOrNull(input.previousReceiptDigest, "previousReceiptDigest");
  assertDigest(input.subjectDigest, "subjectDigest");
  assertToken(input.reasonCode, "reasonCode");
  assertNonNegative(input.occurredAtLogicalMs, "occurredAtLogicalMs");
  if (!CUSTODY_ACTIONS.has(input.action)) fail("custody action is invalid");
  const body = freeze({ ...input });
  return freeze({ ...body, receiptDigest: forensicDigestV1("custody-receipt", body) });
}

export function verifyForensicEvidenceChainV1(
  incidentId: AgentPlatID,
  records: readonly ForensicEvidenceRecordV1[],
): boolean {
  let previous: PlanningDigestV1 | null = null;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    if (record.incidentId !== incidentId || record.sequence !== index + 1)
      return false;
    if (record.previousRecordDigest !== previous) return false;
    const { recordDigest, ...body } = record;
    if (recordDigest !== createForensicEvidenceRecordV1(body).recordDigest)
      return false;
    previous = recordDigest;
  }
  return true;
}

export function verifyForensicCustodyChainV1(
  incidentId: AgentPlatID,
  receipts: readonly ForensicCustodyReceiptV1[],
): boolean {
  let previous: PlanningDigestV1 | null = null;
  for (let index = 0; index < receipts.length; index += 1) {
    const receipt = receipts[index]!;
    if (receipt.incidentId !== incidentId || receipt.sequence !== index + 1)
      return false;
    if (receipt.previousReceiptDigest !== previous) return false;
    const { receiptDigest, ...body } = receipt;
    if (receiptDigest !== createForensicCustodyReceiptV1(body).receiptDigest)
      return false;
    previous = receiptDigest;
  }
  return true;
}

export function createForensicExportManifestV1(input: {
  readonly incidentId: AgentPlatID;
  readonly exportId: AgentPlatID;
  readonly evidenceRecords: readonly ForensicEvidenceRecordV1[];
  readonly custodyReceipts: readonly ForensicCustodyReceiptV1[];
  readonly retentionPolicy: ForensicRetentionPolicyV1;
  readonly createdAtLogicalMs: number;
}): ForensicExportManifestV1 {
  assertId(input.incidentId, "incidentId");
  assertId(input.exportId, "exportId");
  assertNonNegative(input.createdAtLogicalMs, "createdAtLogicalMs");
  if (!verifyForensicEvidenceChainV1(input.incidentId, input.evidenceRecords))
    fail("forensic evidence chain is invalid");
  if (!verifyForensicCustodyChainV1(input.incidentId, input.custodyReceipts))
    fail("forensic custody chain is invalid");
  const policy = createForensicRetentionPolicyV1(stripPolicyDigest(input.retentionPolicy));
  if (policy.policyDigest !== input.retentionPolicy.policyDigest)
    fail("retention policy digest is invalid");
  const body = freeze({
    schemaVersion: 1 as const,
    incidentId: input.incidentId,
    exportId: input.exportId,
    evidenceRecordDigests: freeze(input.evidenceRecords.map((item) => item.recordDigest)),
    custodyReceiptDigests: freeze(input.custodyReceipts.map((item) => item.receiptDigest)),
    evidenceHeadDigest: input.evidenceRecords.at(-1)?.recordDigest ?? null,
    custodyHeadDigest: input.custodyReceipts.at(-1)?.receiptDigest ?? null,
    retentionPolicy: policy,
    createdAtLogicalMs: input.createdAtLogicalMs,
  });
  return freeze({ ...body, manifestDigest: forensicDigestV1("export-manifest", body) });
}

export async function createForensicExportBundleV1(input: {
  readonly manifest: ForensicExportManifestV1;
  readonly evidenceRecords: readonly ForensicEvidenceRecordV1[];
  readonly custodyReceipts: readonly ForensicCustodyReceiptV1[];
  readonly signer?: ForensicManifestSignerV1;
}): Promise<ForensicExportBundleV1> {
  const rebuilt = createForensicExportManifestV1({
    incidentId: input.manifest.incidentId,
    exportId: input.manifest.exportId,
    evidenceRecords: input.evidenceRecords,
    custodyReceipts: input.custodyReceipts,
    retentionPolicy: input.manifest.retentionPolicy,
    createdAtLogicalMs: input.manifest.createdAtLogicalMs,
  });
  if (rebuilt.manifestDigest !== input.manifest.manifestDigest)
    fail("forensic manifest is invalid");
  let signature: ForensicManifestSignatureV1 | null = null;
  if (input.signer) {
    assertId(input.signer.signerId, "signerId");
    assertId(input.signer.keyId, "keyId");
    assertToken(input.signer.algorithm, "algorithm");
    const encoded = await input.signer.sign(rebuilt.manifestDigest);
    if (typeof encoded !== "string" || encoded.length === 0)
      fail("forensic signature is invalid");
    signature = freeze({
      schemaVersion: 1,
      manifestDigest: rebuilt.manifestDigest,
      signerId: input.signer.signerId,
      keyId: input.signer.keyId,
      algorithm: input.signer.algorithm,
      signature: encoded,
    });
  }
  return freeze({
    manifest: rebuilt,
    signature,
    evidenceRecords: freeze([...input.evidenceRecords]),
    custodyReceipts: freeze([...input.custodyReceipts]),
  });
}

export async function verifyForensicExportBundleV1(
  bundle: ForensicExportBundleV1,
  verifier?: ForensicManifestVerifierV1,
): Promise<boolean> {
  try {
    const rebuilt = createForensicExportManifestV1({
      incidentId: bundle.manifest.incidentId,
      exportId: bundle.manifest.exportId,
      evidenceRecords: bundle.evidenceRecords,
      custodyReceipts: bundle.custodyReceipts,
      retentionPolicy: bundle.manifest.retentionPolicy,
      createdAtLogicalMs: bundle.manifest.createdAtLogicalMs,
    });
    if (rebuilt.manifestDigest !== bundle.manifest.manifestDigest) return false;
    if (bundle.signature === null) return verifier === undefined;
    if (!verifier || bundle.signature.manifestDigest !== rebuilt.manifestDigest)
      return false;
    return verifier.verify(bundle.signature);
  } catch {
    return false;
  }
}

export function retentionDispositionAllowedV1(input: {
  readonly policy: ForensicRetentionPolicyV1;
  readonly firstObservedAtLogicalMs: number;
  readonly logicalTimeMs: number;
}): boolean {
  if (input.policy.legalHold || input.policy.disposition === "retain") return false;
  assertNonNegative(input.firstObservedAtLogicalMs, "firstObservedAtLogicalMs");
  assertNonNegative(input.logicalTimeMs, "logicalTimeMs");
  return input.logicalTimeMs >= input.firstObservedAtLogicalMs + input.policy.minimumRetentionMs;
}

const CUSTODY_ACTIONS = new Set<ForensicCustodyActionV1>([
  "observed", "acquired", "verified", "exported", "archived",
  "retention_changed", "disposed",
]);
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/+=-]{0,255}$/u;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:+/=-]{0,127}$/u;
const SHA = /^sha256:[0-9a-f]{64}$/u;
function fail(message: string): never { throw new TypeError(message); }
function assertSchema(value: unknown): asserts value is 1 {
  if (value !== 1) fail("forensic schema version is invalid");
}
function assertId(value: unknown, label: string): asserts value is AgentPlatID {
  if (typeof value !== "string" || !ID.test(value)) fail(`${label} is invalid`);
}
function assertToken(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !TOKEN.test(value)) fail(`${label} is invalid`);
}
function assertDigest(value: unknown, label: string): asserts value is PlanningDigestV1 {
  if (typeof value !== "string" || !SHA.test(value)) fail(`${label} is invalid`);
}
function assertDigestOrNull(value: unknown, label: string): void {
  if (value !== null) assertDigest(value, label);
}
function assertNonNegative(value: unknown, label: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail(`${label} is invalid`);
}
function assertPositive(value: unknown, label: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) fail(`${label} is invalid`);
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  }
  return value;
}
function stripPolicyDigest(
  value: ForensicRetentionPolicyV1,
): Omit<ForensicRetentionPolicyV1, "policyDigest"> {
  const { policyDigest: _policyDigest, ...body } = value;
  return body;
}
