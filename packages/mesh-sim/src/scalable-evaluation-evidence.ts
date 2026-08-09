import type { PlanningDigestV1 } from "@agentplat/collective-planning";

import type {
  ScalableEvaluationDefinitionV1,
  ScalableEvaluationEvidenceAuthorizationResolverV1,
  ScalableEvaluationEvidenceKindV1,
  ScalableEvaluationEvidenceProofV1,
  ScalableEvaluationEvidenceProviderAuthorizationV1,
  ScalableEvaluationEvidencePublicKeyResolverV1,
  ScalableEvaluationEvidenceSignerV1,
  ScalableEvaluationEvidenceVerifierV1,
  ScalableEvaluationPerturbationInjectionReceiptV1,
  ScalableEvaluationPerturbationV1,
  ScalableEvaluationRecoveryMeasurementReceiptV1,
} from "./scalable-evaluation-contracts.js";
import { scalableEvaluationDigestV1 } from "./scalable-evaluation-validation.js";

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const SIGNATURE = /^[A-Za-z0-9_-]{86}$/u;
const EVIDENCE_KINDS = new Set<ScalableEvaluationEvidenceKindV1>([
  "perturbation_injection",
  "recovery_measurement",
]);

const verifierBindings = new WeakMap<
  object,
  {
    readonly resolveAuthorization: ScalableEvaluationEvidenceAuthorizationResolverV1["resolve"];
    readonly resolveKey: ScalableEvaluationEvidencePublicKeyResolverV1["resolve"];
    readonly verifySignature: SubtleCrypto["verify"];
  }
>();
const verifiedPerturbationReceipts = new WeakSet<object>();
const verifiedRecoveryReceipts = new WeakSet<object>();

export function createScalableEvaluationEvidenceProviderAuthorizationV1(input: {
  readonly authorizationId: string;
  readonly providerId: string;
  readonly keyId: string;
  readonly status: "active" | "revoked";
  readonly evidenceKinds: readonly ScalableEvaluationEvidenceKindV1[];
  readonly evaluationDefinitionDigest: PlanningDigestV1;
  readonly scenarioManifestDigest: PlanningDigestV1;
  readonly adapterDescriptorDigest: PlanningDigestV1;
  readonly teamIds: readonly string[];
}): ScalableEvaluationEvidenceProviderAuthorizationV1 {
  identifier(input.authorizationId, "evidence authorization id");
  identifier(input.providerId, "evidence provider id");
  identifier(input.keyId, "evidence key id");
  if (input.status !== "active" && input.status !== "revoked")
    fail("evidence authorization status is invalid");
  const evidenceKinds = sortedUnique(input.evidenceKinds, (value) => {
    if (!EVIDENCE_KINDS.has(value))
      fail("evidence authorization kind is invalid");
  });
  if (evidenceKinds.length === 0)
    fail("evidence authorization requires at least one kind");
  const teamIds = sortedUnique(input.teamIds, (value) =>
    identifier(value, "evidence authorization team id"),
  );
  if (teamIds.length === 0)
    fail("evidence authorization requires at least one team");
  digest(input.evaluationDefinitionDigest, "evidence definition digest");
  digest(input.scenarioManifestDigest, "evidence scenario digest");
  digest(input.adapterDescriptorDigest, "evidence adapter digest");
  const body = {
    schemaVersion: 1 as const,
    authorizationId: input.authorizationId,
    providerId: input.providerId,
    keyId: input.keyId,
    algorithm: "Ed25519" as const,
    status: input.status,
    evidenceKinds,
    evaluationDefinitionDigest: input.evaluationDefinitionDigest,
    scenarioManifestDigest: input.scenarioManifestDigest,
    adapterDescriptorDigest: input.adapterDescriptorDigest,
    teamIds,
  };
  return freeze({
    ...body,
    authorizationDigest: scalableEvaluationDigestV1(
      "evidence-provider-authorization",
      body,
    ),
  });
}

export function validateScalableEvaluationEvidenceProviderAuthorizationV1(
  input: ScalableEvaluationEvidenceProviderAuthorizationV1,
): ScalableEvaluationEvidenceProviderAuthorizationV1 {
  if (!input || input.schemaVersion !== 1 || input.algorithm !== "Ed25519")
    fail("evidence provider authorization is invalid");
  const rebuilt =
    createScalableEvaluationEvidenceProviderAuthorizationV1(input);
  if (rebuilt.authorizationDigest !== input.authorizationDigest)
    fail("evidence provider authorization digest is invalid");
  return rebuilt;
}

/** Concrete, construction-branded Ed25519 verifier for evaluation evidence. */
export class WebCryptoScalableEvaluationEvidenceVerifierV1 implements ScalableEvaluationEvidenceVerifierV1 {
  constructor(options: {
    readonly authorizations: ScalableEvaluationEvidenceAuthorizationResolverV1;
    readonly keys: ScalableEvaluationEvidencePublicKeyResolverV1;
  }) {
    if (
      !options ||
      Object.keys(options).some(
        (key) => key !== "authorizations" && key !== "keys",
      )
    )
      fail("evaluation evidence verifier options are invalid");
    if (
      !options?.authorizations ||
      typeof options.authorizations.resolve !== "function"
    )
      fail("evaluation evidence authorization resolver is required");
    if (!options.keys || typeof options.keys.resolve !== "function")
      fail("evaluation evidence public-key resolver is required");
    const crypto = globalThis.crypto;
    if (!crypto?.subtle || typeof crypto.subtle.verify !== "function")
      fail("evaluation evidence Web Crypto implementation is required");
    verifierBindings.set(this, {
      resolveAuthorization: options.authorizations.resolve.bind(
        options.authorizations,
      ),
      resolveKey: options.keys.resolve.bind(options.keys),
      verifySignature: crypto.subtle.verify.bind(crypto.subtle),
    });
  }

  verify(input: {
    readonly evidenceKind: ScalableEvaluationEvidenceKindV1;
    readonly definition: ScalableEvaluationDefinitionV1;
    readonly teamId: string;
    readonly evidenceDigest: PlanningDigestV1;
    readonly proof: ScalableEvaluationEvidenceProofV1;
  }): Promise<boolean> {
    return verifyWithBoundWebCrypto(this, input);
  }
}

/** Fails closed unless the verifier was created by the concrete Web Crypto implementation. */
export function assertScalableEvaluationEvidenceVerifierV1(
  verifier: ScalableEvaluationEvidenceVerifierV1,
): void {
  requireConcreteVerifier(verifier);
}

export async function issueScalableEvaluationPerturbationInjectionReceiptV1(input: {
  readonly evaluationDefinitionDigest: PlanningDigestV1;
  readonly scenarioManifestDigest: PlanningDigestV1;
  readonly adapterDescriptorDigest: PlanningDigestV1;
  readonly perturbationId: string;
  readonly teamId: string;
  readonly perturbationConfigurationDigest: PlanningDigestV1;
  readonly sessionId: string;
  readonly episodeId: string;
  readonly scheduledAtLogicalTime: number;
  readonly injectedAtLogicalTime: number;
  readonly sourceEvidenceDigest: PlanningDigestV1;
  readonly providerId: string;
  readonly keyId: string;
  readonly authorizationDigest: PlanningDigestV1;
  readonly signer: ScalableEvaluationEvidenceSignerV1;
}): Promise<ScalableEvaluationPerturbationInjectionReceiptV1> {
  requireSigner(input.signer);
  const body = perturbationEvidenceBody(input);
  const evidenceDigest = scalableEvaluationDigestV1(
    "perturbation-injection-evidence",
    body,
  );
  const proof = await signProof(input, evidenceDigest);
  const receiptBody = { ...body, evidenceDigest, proof };
  return freeze({
    ...receiptBody,
    receiptDigest: scalableEvaluationDigestV1(
      "perturbation-injection-receipt",
      receiptBody,
    ),
  });
}

export async function issueScalableEvaluationRecoveryMeasurementReceiptV1(input: {
  readonly sampleId: string;
  readonly evaluationDefinitionDigest: PlanningDigestV1;
  readonly scenarioManifestDigest: PlanningDigestV1;
  readonly adapterDescriptorDigest: PlanningDigestV1;
  readonly perturbationId: string;
  readonly perturbationConfigurationDigest: PlanningDigestV1;
  readonly teamId: string;
  readonly domain: ScalableEvaluationRecoveryMeasurementReceiptV1["domain"];
  readonly sessionId: string;
  readonly episodeId: string;
  readonly scheduledAtLogicalTime: number;
  readonly logicalTime: number;
  readonly metrics: ScalableEvaluationRecoveryMeasurementReceiptV1["metrics"];
  readonly sourceEvidenceDigest: PlanningDigestV1;
  readonly providerId: string;
  readonly keyId: string;
  readonly authorizationDigest: PlanningDigestV1;
  readonly signer: ScalableEvaluationEvidenceSignerV1;
}): Promise<ScalableEvaluationRecoveryMeasurementReceiptV1> {
  requireSigner(input.signer);
  const body = recoveryEvidenceBody(input);
  const evidenceDigest = scalableEvaluationDigestV1(
    "recovery-measurement-evidence",
    body,
  );
  const proof = await signProof(input, evidenceDigest);
  const receiptBody = { ...body, evidenceDigest, proof };
  return freeze({
    ...receiptBody,
    receiptDigest: scalableEvaluationDigestV1(
      "recovery-measurement-receipt",
      receiptBody,
    ),
  });
}

export async function verifyScalableEvaluationPerturbationInjectionReceiptV1(input: {
  readonly receipt: ScalableEvaluationPerturbationInjectionReceiptV1;
  readonly verifier: ScalableEvaluationEvidenceVerifierV1;
  readonly definition: ScalableEvaluationDefinitionV1;
  readonly perturbation: ScalableEvaluationPerturbationV1;
  readonly teamId: string;
  readonly sessionId: string;
  readonly episodeId: string;
  readonly logicalTime: number;
}): Promise<ScalableEvaluationPerturbationInjectionReceiptV1> {
  requireConcreteVerifier(input.verifier);
  const value = input.receipt;
  const body = perturbationEvidenceBody(value);
  const evidenceDigest = scalableEvaluationDigestV1(
    "perturbation-injection-evidence",
    body,
  );
  if (
    value.evaluationDefinitionDigest !== input.definition.definitionDigest ||
    value.scenarioManifestDigest !== input.definition.scenarioManifestDigest ||
    value.adapterDescriptorDigest !==
      input.definition.adapterDescriptorDigest ||
    value.perturbationId !== input.perturbation.perturbationId ||
    value.teamId !== input.teamId ||
    value.perturbationConfigurationDigest !==
      input.perturbation.configurationDigest ||
    value.sessionId !== input.sessionId ||
    value.episodeId !== input.episodeId ||
    value.scheduledAtLogicalTime !==
      input.perturbation.scheduledAtLogicalTime ||
    value.injectedAtLogicalTime !== input.logicalTime ||
    value.evidenceDigest !== evidenceDigest ||
    !sameProofBinding(value) ||
    value.receiptDigest !==
      scalableEvaluationDigestV1("perturbation-injection-receipt", {
        ...body,
        evidenceDigest,
        proof: value.proof,
      })
  )
    fail("runner_perturbation_receipt_invalid");
  if (
    !(await verifyWithBoundWebCrypto(input.verifier, {
      evidenceKind: "perturbation_injection",
      definition: input.definition,
      teamId: input.teamId,
      evidenceDigest,
      proof: value.proof,
    }))
  )
    fail("runner_perturbation_evidence_invalid");
  const verified = freeze(value);
  verifiedPerturbationReceipts.add(verified);
  return verified;
}

export async function verifyScalableEvaluationRecoveryMeasurementReceiptV1(input: {
  readonly receipt: ScalableEvaluationRecoveryMeasurementReceiptV1;
  readonly verifier: ScalableEvaluationEvidenceVerifierV1;
  readonly definition: ScalableEvaluationDefinitionV1;
  readonly perturbation: ScalableEvaluationPerturbationV1;
  readonly teamId: string;
  readonly sampleId: string;
  readonly sessionId: string;
  readonly episodeId: string;
  readonly logicalTime: number;
}): Promise<ScalableEvaluationRecoveryMeasurementReceiptV1> {
  requireConcreteVerifier(input.verifier);
  const value = input.receipt;
  const body = recoveryEvidenceBody(value);
  const evidenceDigest = scalableEvaluationDigestV1(
    "recovery-measurement-evidence",
    body,
  );
  if (
    value.sampleId !== input.sampleId ||
    value.evaluationDefinitionDigest !== input.definition.definitionDigest ||
    value.scenarioManifestDigest !== input.definition.scenarioManifestDigest ||
    value.adapterDescriptorDigest !==
      input.definition.adapterDescriptorDigest ||
    value.perturbationId !== input.perturbation.perturbationId ||
    value.perturbationConfigurationDigest !==
      input.perturbation.configurationDigest ||
    value.teamId !== input.teamId ||
    value.domain !== input.perturbation.domain ||
    value.sessionId !== input.sessionId ||
    value.episodeId !== input.episodeId ||
    value.scheduledAtLogicalTime !==
      input.perturbation.scheduledAtLogicalTime ||
    value.logicalTime !== input.logicalTime ||
    value.evidenceDigest !== evidenceDigest ||
    !sameProofBinding(value) ||
    value.receiptDigest !==
      scalableEvaluationDigestV1("recovery-measurement-receipt", {
        ...body,
        evidenceDigest,
        proof: value.proof,
      })
  )
    fail("runner_recovery_measurement_invalid");
  if (
    !(await verifyWithBoundWebCrypto(input.verifier, {
      evidenceKind: "recovery_measurement",
      definition: input.definition,
      teamId: input.teamId,
      evidenceDigest,
      proof: value.proof,
    }))
  )
    fail("runner_recovery_evidence_invalid");
  const verified = freeze(value);
  verifiedRecoveryReceipts.add(verified);
  return verified;
}

/** @internal Runtime boundary check; structural receipts cannot acquire this brand. */
export function isVerifiedScalableEvaluationPerturbationReceiptV1(
  value: unknown,
): value is ScalableEvaluationPerturbationInjectionReceiptV1 {
  return Boolean(
    value &&
    typeof value === "object" &&
    verifiedPerturbationReceipts.has(value),
  );
}

/** @internal Runtime boundary check; structural receipts cannot acquire this brand. */
export function isVerifiedScalableEvaluationRecoveryReceiptV1(
  value: unknown,
): value is ScalableEvaluationRecoveryMeasurementReceiptV1 {
  return Boolean(
    value && typeof value === "object" && verifiedRecoveryReceipts.has(value),
  );
}

function perturbationEvidenceBody(input: {
  readonly evaluationDefinitionDigest: PlanningDigestV1;
  readonly scenarioManifestDigest: PlanningDigestV1;
  readonly adapterDescriptorDigest: PlanningDigestV1;
  readonly perturbationId: string;
  readonly teamId: string;
  readonly perturbationConfigurationDigest: PlanningDigestV1;
  readonly sessionId: string;
  readonly episodeId: string;
  readonly scheduledAtLogicalTime: number;
  readonly injectedAtLogicalTime: number;
  readonly sourceEvidenceDigest: PlanningDigestV1;
  readonly providerId: string;
  readonly keyId: string;
  readonly authorizationDigest: PlanningDigestV1;
}) {
  validateCommonEvidence(input);
  identifier(input.perturbationId, "perturbation id");
  nonNegativeInteger(input.scheduledAtLogicalTime, "perturbation schedule");
  nonNegativeInteger(
    input.injectedAtLogicalTime,
    "perturbation injection time",
  );
  digest(
    input.perturbationConfigurationDigest,
    "perturbation configuration digest",
  );
  return {
    schemaVersion: 1 as const,
    evaluationDefinitionDigest: input.evaluationDefinitionDigest,
    scenarioManifestDigest: input.scenarioManifestDigest,
    adapterDescriptorDigest: input.adapterDescriptorDigest,
    perturbationId: input.perturbationId,
    teamId: input.teamId,
    perturbationConfigurationDigest: input.perturbationConfigurationDigest,
    sessionId: input.sessionId,
    episodeId: input.episodeId,
    scheduledAtLogicalTime: input.scheduledAtLogicalTime,
    injectedAtLogicalTime: input.injectedAtLogicalTime,
    accepted: true as const,
    sourceEvidenceDigest: input.sourceEvidenceDigest,
    providerId: input.providerId,
    keyId: input.keyId,
    authorizationDigest: input.authorizationDigest,
    algorithm: "Ed25519" as const,
  };
}

function recoveryEvidenceBody(input: {
  readonly sampleId: string;
  readonly evaluationDefinitionDigest: PlanningDigestV1;
  readonly scenarioManifestDigest: PlanningDigestV1;
  readonly adapterDescriptorDigest: PlanningDigestV1;
  readonly perturbationId: string;
  readonly perturbationConfigurationDigest: PlanningDigestV1;
  readonly teamId: string;
  readonly domain: ScalableEvaluationRecoveryMeasurementReceiptV1["domain"];
  readonly sessionId: string;
  readonly episodeId: string;
  readonly scheduledAtLogicalTime: number;
  readonly logicalTime: number;
  readonly metrics: ScalableEvaluationRecoveryMeasurementReceiptV1["metrics"];
  readonly sourceEvidenceDigest: PlanningDigestV1;
  readonly providerId: string;
  readonly keyId: string;
  readonly authorizationDigest: PlanningDigestV1;
}) {
  validateCommonEvidence(input);
  identifier(input.sampleId, "recovery sample id");
  identifier(input.perturbationId, "recovery perturbation id");
  if (!(["physical", "social", "cyber"] as const).includes(input.domain))
    fail("recovery evidence domain is invalid");
  nonNegativeInteger(input.scheduledAtLogicalTime, "recovery schedule");
  nonNegativeInteger(input.logicalTime, "recovery sample time");
  digest(input.perturbationConfigurationDigest, "recovery perturbation digest");
  const metrics = normalizeMetrics(input.metrics);
  return {
    schemaVersion: 1 as const,
    sampleId: input.sampleId,
    evaluationDefinitionDigest: input.evaluationDefinitionDigest,
    scenarioManifestDigest: input.scenarioManifestDigest,
    adapterDescriptorDigest: input.adapterDescriptorDigest,
    perturbationId: input.perturbationId,
    perturbationConfigurationDigest: input.perturbationConfigurationDigest,
    teamId: input.teamId,
    domain: input.domain,
    sessionId: input.sessionId,
    episodeId: input.episodeId,
    scheduledAtLogicalTime: input.scheduledAtLogicalTime,
    logicalTime: input.logicalTime,
    metrics,
    sourceEvidenceDigest: input.sourceEvidenceDigest,
    providerId: input.providerId,
    keyId: input.keyId,
    authorizationDigest: input.authorizationDigest,
    algorithm: "Ed25519" as const,
  };
}

function validateCommonEvidence(input: {
  readonly evaluationDefinitionDigest: PlanningDigestV1;
  readonly scenarioManifestDigest: PlanningDigestV1;
  readonly adapterDescriptorDigest: PlanningDigestV1;
  readonly teamId: string;
  readonly sessionId: string;
  readonly episodeId: string;
  readonly sourceEvidenceDigest: PlanningDigestV1;
  readonly providerId: string;
  readonly keyId: string;
  readonly authorizationDigest: PlanningDigestV1;
}): void {
  for (const value of [
    input.evaluationDefinitionDigest,
    input.scenarioManifestDigest,
    input.adapterDescriptorDigest,
    input.sourceEvidenceDigest,
    input.authorizationDigest,
  ])
    digest(value, "evaluation evidence digest");
  for (const [label, value] of [
    ["team id", input.teamId],
    ["session id", input.sessionId],
    ["episode id", input.episodeId],
    ["provider id", input.providerId],
    ["key id", input.keyId],
  ] as const)
    identifier(value, label);
}

async function signProof(
  input: {
    readonly providerId: string;
    readonly keyId: string;
    readonly authorizationDigest: PlanningDigestV1;
    readonly signer: ScalableEvaluationEvidenceSignerV1;
  },
  evidenceDigest: PlanningDigestV1,
): Promise<ScalableEvaluationEvidenceProofV1> {
  const value = await input.signer.sign({
    providerId: input.providerId,
    keyId: input.keyId,
    algorithm: "Ed25519",
    evidenceDigest,
  });
  if (!isCanonicalSignature(value))
    fail("evaluation evidence signature is invalid");
  return freeze({
    algorithm: "Ed25519" as const,
    providerId: input.providerId,
    keyId: input.keyId,
    authorizationDigest: input.authorizationDigest,
    value,
  });
}

function sameProofBinding(input: {
  readonly providerId: string;
  readonly keyId: string;
  readonly authorizationDigest: PlanningDigestV1;
  readonly algorithm: "Ed25519";
  readonly proof: ScalableEvaluationEvidenceProofV1;
}): boolean {
  return (
    input.algorithm === "Ed25519" &&
    input.proof?.algorithm === input.algorithm &&
    input.proof.providerId === input.providerId &&
    input.proof.keyId === input.keyId &&
    input.proof.authorizationDigest === input.authorizationDigest &&
    isCanonicalSignature(input.proof.value)
  );
}

async function verifyWithBoundWebCrypto(
  verifier: ScalableEvaluationEvidenceVerifierV1,
  input: {
    readonly evidenceKind: ScalableEvaluationEvidenceKindV1;
    readonly definition: ScalableEvaluationDefinitionV1;
    readonly teamId: string;
    readonly evidenceDigest: PlanningDigestV1;
    readonly proof: ScalableEvaluationEvidenceProofV1;
  },
): Promise<boolean> {
  const binding = verifierBindings.get(verifier as object);
  if (!binding)
    fail("concrete evaluation evidence Ed25519 verifier is required");
  if (!EVIDENCE_KINDS.has(input.evidenceKind) || !sameProof(input.proof))
    return false;
  const rawAuthorization = await binding.resolveAuthorization({
    providerId: input.proof.providerId,
    keyId: input.proof.keyId,
    authorizationDigest: input.proof.authorizationDigest,
  });
  if (!rawAuthorization) return false;
  let authorization: ScalableEvaluationEvidenceProviderAuthorizationV1;
  try {
    authorization =
      validateScalableEvaluationEvidenceProviderAuthorizationV1(
        rawAuthorization,
      );
  } catch {
    return false;
  }
  if (
    authorization.status !== "active" ||
    authorization.providerId !== input.proof.providerId ||
    authorization.keyId !== input.proof.keyId ||
    authorization.authorizationDigest !== input.proof.authorizationDigest ||
    !authorization.evidenceKinds.includes(input.evidenceKind) ||
    authorization.evaluationDefinitionDigest !==
      input.definition.definitionDigest ||
    authorization.scenarioManifestDigest !==
      input.definition.scenarioManifestDigest ||
    authorization.adapterDescriptorDigest !==
      input.definition.adapterDescriptorDigest ||
    !authorization.teamIds.includes(input.teamId)
  )
    return false;
  const key = await binding.resolveKey({
    providerId: authorization.providerId,
    keyId: authorization.keyId,
    algorithm: authorization.algorithm,
  });
  if (!isEd25519VerificationKey(key)) return false;
  let signature: Uint8Array;
  try {
    signature = decodeBase64Url(input.proof.value);
  } catch {
    return false;
  }
  if (signature.byteLength !== 64) return false;
  const signatureBuffer = new ArrayBuffer(signature.byteLength);
  new Uint8Array(signatureBuffer).set(signature);
  const message = new TextEncoder().encode(input.evidenceDigest);
  try {
    return await binding.verifySignature(
      "Ed25519",
      key,
      signatureBuffer,
      message.buffer,
    );
  } catch {
    return false;
  }
}

function requireConcreteVerifier(
  verifier: ScalableEvaluationEvidenceVerifierV1,
): void {
  if (!verifier || !verifierBindings.has(verifier as object))
    fail("concrete evaluation evidence Ed25519 verifier is required");
}

function requireSigner(signer: ScalableEvaluationEvidenceSignerV1): void {
  if (!signer || typeof signer.sign !== "function")
    fail("evaluation evidence signer is required");
}

function sameProof(value: ScalableEvaluationEvidenceProofV1): boolean {
  return Boolean(
    value &&
    value.algorithm === "Ed25519" &&
    typeof value.providerId === "string" &&
    typeof value.keyId === "string" &&
    DIGEST.test(value.authorizationDigest) &&
    isCanonicalSignature(value.value),
  );
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
  if (!isCanonicalSignature(value))
    fail("evaluation evidence signature is invalid");
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const normalized = value.replace(/-/gu, "+").replace(/_/gu, "/");
  const output: number[] = [];
  for (let index = 0; index < normalized.length; index += 4) {
    const chars = normalized.slice(index, index + 4);
    const values = [...chars].map((character) => alphabet.indexOf(character));
    if (values.some((item) => item < 0))
      fail("evaluation evidence signature is invalid");
    const block =
      ((values[0] ?? 0) << 18) |
      ((values[1] ?? 0) << 12) |
      ((values[2] ?? 0) << 6) |
      (values[3] ?? 0);
    output.push((block >>> 16) & 255);
    if (chars.length > 2) output.push((block >>> 8) & 255);
    if (chars.length > 3) output.push(block & 255);
  }
  return new Uint8Array(output);
}

function isCanonicalSignature(value: string): boolean {
  if (!SIGNATURE.test(value)) return false;
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const finalSextet = alphabet.indexOf(value.at(-1)!);
  return finalSextet >= 0 && (finalSextet & 0x0f) === 0;
}

function normalizeMetrics(
  input: ScalableEvaluationRecoveryMeasurementReceiptV1["metrics"],
): ScalableEvaluationRecoveryMeasurementReceiptV1["metrics"] {
  if (!Array.isArray(input) || input.length === 0 || input.length > 64)
    fail("recovery evidence metrics are invalid");
  const metrics = input.map((metric) => {
    identifier(metric.metricId, "recovery evidence metric id");
    if (!Number.isSafeInteger(metric.valueBasisPoints))
      fail("recovery evidence metric value is invalid");
    return {
      metricId: metric.metricId,
      valueBasisPoints: metric.valueBasisPoints,
    };
  });
  metrics.sort((left, right) =>
    compareCodeUnits(left.metricId, right.metricId),
  );
  if (
    metrics.some(
      (metric, index) =>
        index > 0 && metrics[index - 1]!.metricId === metric.metricId,
    )
  )
    fail("recovery evidence metric is duplicated");
  return freeze(metrics);
}

function sortedUnique<T extends string>(
  input: readonly T[],
  validate: (value: T) => void,
): readonly T[] {
  if (!Array.isArray(input) || input.length > 256)
    fail("evaluation evidence list is invalid");
  const result = [...input];
  for (const value of result) validate(value);
  result.sort(compareCodeUnits);
  if (new Set(result).size !== result.length)
    fail("evaluation evidence list contains duplicates");
  return freeze(result);
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function identifier(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 256 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/+=-]*$/u.test(value)
  )
    fail(`${label} is invalid`);
}

function digest(
  value: unknown,
  label: string,
): asserts value is PlanningDigestV1 {
  if (typeof value !== "string" || !DIGEST.test(value))
    fail(`${label} is invalid`);
}

function nonNegativeInteger(
  value: unknown,
  label: string,
): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    fail(`${label} is invalid`);
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

function fail(message: string): never {
  throw new TypeError(message);
}
