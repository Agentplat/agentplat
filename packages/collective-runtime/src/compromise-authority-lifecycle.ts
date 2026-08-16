import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
} from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";

export const COMPROMISE_AUTHORITY_LIFECYCLE_SCHEMA_VERSION_V1 = 1 as const;

export type CompromiseAuthorityResourceKindV1 =
  | "session"
  | "key"
  | "role"
  | "mandate"
  | "effect";

export interface CompromiseAuthorityScopeV1 {
  readonly tenantId: AgentPlatID;
  readonly meshId: AgentPlatID;
  readonly missionIntentId: AgentPlatID;
  readonly subjectPeerId: AgentPlatID;
}

export interface CompromiseAuthorityGrantV1 {
  readonly capability: string;
  readonly resourcePattern: string;
  readonly maximumEffectClass: number;
}

export interface CompromiseRevocationRequestV1 {
  readonly schemaVersion: 1;
  readonly operationId: AgentPlatID;
  readonly incidentId: AgentPlatID;
  readonly scope: CompromiseAuthorityScopeV1;
  readonly evidenceDigest: PlanningDigestV1;
  readonly authorityEpoch: number;
  readonly credentialGeneration: number;
  readonly sessionIds: readonly AgentPlatID[];
  readonly keyIds: readonly AgentPlatID[];
  readonly roleIds: readonly AgentPlatID[];
  readonly mandateIds: readonly AgentPlatID[];
  readonly pendingEffectIds: readonly AgentPlatID[];
  readonly logicalTimeMs: number;
}

export interface CompromiseResourceRevocationV1 {
  readonly kind: CompromiseAuthorityResourceKindV1;
  readonly resourceId: AgentPlatID;
  readonly revokedAtLogicalMs: number;
  readonly receiptDigest: PlanningDigestV1;
}

/**
 * Durable epoch fence installed before a compromised principal can be
 * re-admitted. Every session, signature and effect boundary must compare both
 * values with this fence and reject lower values.
 */
export interface CompromiseAuthorityFenceV1 {
  readonly subjectPeerId: AgentPlatID;
  readonly minimumAuthorityEpoch: number;
  readonly minimumCredentialGeneration: number;
  readonly incidentId: AgentPlatID;
  readonly installedAtLogicalMs: number;
  readonly fenceDigest: PlanningDigestV1;
}

export interface CompromiseRevocationReceiptV1 {
  readonly schemaVersion: 1;
  readonly operationId: AgentPlatID;
  readonly incidentId: AgentPlatID;
  readonly scope: CompromiseAuthorityScopeV1;
  readonly priorAuthorityEpoch: number;
  readonly priorCredentialGeneration: number;
  readonly fence: CompromiseAuthorityFenceV1;
  readonly revocations: readonly CompromiseResourceRevocationV1[];
  readonly evidenceDigest: PlanningDigestV1;
  readonly completedAtLogicalMs: number;
  readonly receiptDigest: PlanningDigestV1;
}

/**
 * This port is deliberately aggregate: implementations must commit all
 * revocations and the monotonic fence atomically, or expose no success.
 */
export interface CompromiseAuthorityRevocationPortV1 {
  revokeAuthority(input: {
    readonly request: CompromiseRevocationRequestV1;
    readonly fence: CompromiseAuthorityFenceV1;
  }): Promise<{
    readonly revocations: readonly CompromiseResourceRevocationV1[];
  }>;
}

export interface CompromiseRejoinRequestV1 {
  readonly schemaVersion: 1;
  readonly operationId: AgentPlatID;
  readonly incidentId: AgentPlatID;
  readonly scope: CompromiseAuthorityScopeV1;
  readonly revocationReceiptDigest: PlanningDigestV1;
  readonly requestedAuthorityEpoch: number;
  readonly requestedCredentialGeneration: number;
  readonly requestedGrants: readonly CompromiseAuthorityGrantV1[];
  readonly recoveryEvidenceDigest: PlanningDigestV1;
  readonly approvalDigest: PlanningDigestV1;
  readonly logicalTimeMs: number;
}

export interface CompromiseRejoinReceiptV1 {
  readonly schemaVersion: 1;
  readonly operationId: AgentPlatID;
  readonly incidentId: AgentPlatID;
  readonly scope: CompromiseAuthorityScopeV1;
  readonly authorityEpoch: number;
  readonly credentialGeneration: number;
  readonly grants: readonly CompromiseAuthorityGrantV1[];
  readonly priorRevocationReceiptDigest: PlanningDigestV1;
  readonly recoveryEvidenceDigest: PlanningDigestV1;
  readonly approvalDigest: PlanningDigestV1;
  readonly activatedAtLogicalMs: number;
  readonly receiptDigest: PlanningDigestV1;
}

export interface CompromiseAuthorityRejoinPortV1 {
  activateAttenuatedAuthority(input: {
    readonly request: CompromiseRejoinRequestV1;
    readonly priorRevocation: CompromiseRevocationReceiptV1;
    readonly grants: readonly CompromiseAuthorityGrantV1[];
  }): Promise<void>;
}

export interface CompromiseCredentialPresentationV1 {
  readonly subjectPeerId: AgentPlatID;
  readonly authorityEpoch: number;
  readonly credentialGeneration: number;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;

export function compromiseAuthorityDigestV1(
  domain: string,
  input: unknown,
): PlanningDigestV1 {
  return digestPlanningJsonV1("collective-planning-snapshot", {
    domain: `compromise-authority/${domain}`,
    input,
  } as never);
}

export function createCompromiseAuthorityFenceV1(
  request: CompromiseRevocationRequestV1,
): CompromiseAuthorityFenceV1 {
  validateRevocationRequest(request);
  const body = {
    subjectPeerId: request.scope.subjectPeerId,
    minimumAuthorityEpoch: request.authorityEpoch + 1,
    minimumCredentialGeneration: request.credentialGeneration + 1,
    incidentId: request.incidentId,
    installedAtLogicalMs: request.logicalTimeMs,
  };
  return Object.freeze({
    ...body,
    fenceDigest: compromiseAuthorityDigestV1("epoch-fence", body),
  });
}

export async function revokeCompromisedAuthorityV1(input: {
  readonly request: CompromiseRevocationRequestV1;
  readonly port: CompromiseAuthorityRevocationPortV1;
}): Promise<CompromiseRevocationReceiptV1> {
  validateRevocationRequest(input.request);
  const fence = createCompromiseAuthorityFenceV1(input.request);
  const result = await input.port.revokeAuthority({
    request: input.request,
    fence,
  });
  const expected = expectedResources(input.request);
  validateRevocations(result.revocations, expected, input.request.logicalTimeMs);
  const body = {
    schemaVersion: 1 as const,
    operationId: input.request.operationId,
    incidentId: input.request.incidentId,
    scope: input.request.scope,
    priorAuthorityEpoch: input.request.authorityEpoch,
    priorCredentialGeneration: input.request.credentialGeneration,
    fence,
    revocations: canonicalRevocations(result.revocations),
    evidenceDigest: input.request.evidenceDigest,
    completedAtLogicalMs: input.request.logicalTimeMs,
  };
  return Object.freeze({
    ...body,
    receiptDigest: compromiseAuthorityDigestV1("revocation-receipt", body),
  });
}

export async function rejoinWithAttenuatedAuthorityV1(input: {
  readonly request: CompromiseRejoinRequestV1;
  readonly priorRevocation: CompromiseRevocationReceiptV1;
  /** Upper bound approved before the incident; rejoin grants must be a subset. */
  readonly priorGrants: readonly CompromiseAuthorityGrantV1[];
  readonly port: CompromiseAuthorityRejoinPortV1;
}): Promise<CompromiseRejoinReceiptV1> {
  validateRejoin(input.request, input.priorRevocation);
  const grants = canonicalGrants(input.request.requestedGrants);
  const prior = canonicalGrants(input.priorGrants);
  let strictlyAttenuated = grants.length < prior.length;
  for (const grant of grants) {
    const upperBound = prior.find(
      (candidate) =>
        candidate.capability === grant.capability &&
        candidate.resourcePattern === grant.resourcePattern,
    );
    if (!upperBound || grant.maximumEffectClass > upperBound.maximumEffectClass)
      throw new Error("rejoin_grant_exceeds_prior_authority");
    if (grant.maximumEffectClass < upperBound.maximumEffectClass)
      strictlyAttenuated = true;
  }
  if (!strictlyAttenuated)
    throw new Error("rejoin_authority_must_be_attenuated");
  await input.port.activateAttenuatedAuthority({
    request: input.request,
    priorRevocation: input.priorRevocation,
    grants,
  });
  const body = {
    schemaVersion: 1 as const,
    operationId: input.request.operationId,
    incidentId: input.request.incidentId,
    scope: input.request.scope,
    authorityEpoch: input.request.requestedAuthorityEpoch,
    credentialGeneration: input.request.requestedCredentialGeneration,
    grants,
    priorRevocationReceiptDigest: input.request.revocationReceiptDigest,
    recoveryEvidenceDigest: input.request.recoveryEvidenceDigest,
    approvalDigest: input.request.approvalDigest,
    activatedAtLogicalMs: input.request.logicalTimeMs,
  };
  return Object.freeze({
    ...body,
    receiptDigest: compromiseAuthorityDigestV1("rejoin-receipt", body),
  });
}

/** Stateless admission check suitable for session, signature and effect gates. */
export function assertCredentialAfterCompromiseFenceV1(input: {
  readonly presentation: CompromiseCredentialPresentationV1;
  readonly fence: CompromiseAuthorityFenceV1;
}): void {
  if (input.presentation.subjectPeerId !== input.fence.subjectPeerId)
    throw new Error("credential_subject_fence_mismatch");
  if (input.presentation.authorityEpoch < input.fence.minimumAuthorityEpoch)
    throw new Error("credential_authority_epoch_replay");
  if (
    input.presentation.credentialGeneration <
    input.fence.minimumCredentialGeneration
  )
    throw new Error("credential_generation_replay");
}

function validateRevocationRequest(input: CompromiseRevocationRequestV1): void {
  if (input.schemaVersion !== 1) throw new TypeError("revocation_schema_invalid");
  ids([input.operationId, input.incidentId], "revocation identity");
  validateScope(input.scope);
  digest(input.evidenceDigest, "evidence digest");
  positive(input.authorityEpoch, "authority epoch");
  positive(input.credentialGeneration, "credential generation");
  nonNegative(input.logicalTimeMs, "logical time");
  for (const [label, values] of Object.entries({
    sessions: input.sessionIds,
    keys: input.keyIds,
    roles: input.roleIds,
    mandates: input.mandateIds,
    effects: input.pendingEffectIds,
  })) ids(values, label);
}

function validateRejoin(
  input: CompromiseRejoinRequestV1,
  prior: CompromiseRevocationReceiptV1,
): void {
  if (input.schemaVersion !== 1) throw new TypeError("rejoin_schema_invalid");
  ids([input.operationId, input.incidentId], "rejoin identity");
  validateScope(input.scope);
  if (
    input.incidentId !== prior.incidentId ||
    input.scope.subjectPeerId !== prior.scope.subjectPeerId ||
    input.revocationReceiptDigest !== prior.receiptDigest
  ) throw new Error("rejoin_revocation_chain_mismatch");
  if (input.requestedAuthorityEpoch < prior.fence.minimumAuthorityEpoch)
    throw new Error("rejoin_authority_epoch_replay");
  if (
    input.requestedCredentialGeneration <
    prior.fence.minimumCredentialGeneration
  ) throw new Error("rejoin_credential_generation_replay");
  digest(input.recoveryEvidenceDigest, "recovery evidence digest");
  digest(input.approvalDigest, "approval digest");
  nonNegative(input.logicalTimeMs, "logical time");
  if (input.logicalTimeMs < prior.completedAtLogicalMs)
    throw new Error("rejoin_logical_time_rollback");
  canonicalGrants(input.requestedGrants);
}

function expectedResources(
  request: CompromiseRevocationRequestV1,
): ReadonlyMap<string, CompromiseAuthorityResourceKindV1> {
  return new Map([
    ...request.sessionIds.map((id) => [`session\u0000${id}`, "session"] as const),
    ...request.keyIds.map((id) => [`key\u0000${id}`, "key"] as const),
    ...request.roleIds.map((id) => [`role\u0000${id}`, "role"] as const),
    ...request.mandateIds.map((id) => [`mandate\u0000${id}`, "mandate"] as const),
    ...request.pendingEffectIds.map((id) => [`effect\u0000${id}`, "effect"] as const),
  ]);
}

function validateRevocations(
  values: readonly CompromiseResourceRevocationV1[],
  expected: ReadonlyMap<string, CompromiseAuthorityResourceKindV1>,
  logicalTimeMs: number,
): void {
  if (!Array.isArray(values) || values.length !== expected.size)
    throw new Error("revocation_set_incomplete");
  const seen = new Set<string>();
  for (const value of values) {
    const key = `${value.kind}\u0000${value.resourceId}`;
    if (seen.has(key)) throw new Error("revocation_set_contains_duplicates");
    seen.add(key);
    if (expected.get(key) !== value.kind)
      throw new Error("revocation_resource_mismatch");
    if (value.revokedAtLogicalMs !== logicalTimeMs)
      throw new Error("revocation_logical_time_mismatch");
    digest(value.receiptDigest, "resource revocation digest");
  }
}

function canonicalRevocations(
  values: readonly CompromiseResourceRevocationV1[],
): readonly CompromiseResourceRevocationV1[] {
  return Object.freeze(
    [...values].sort((a, b) =>
      `${a.kind}\u0000${a.resourceId}`.localeCompare(`${b.kind}\u0000${b.resourceId}`),
    ),
  );
}

function canonicalGrants(
  values: readonly CompromiseAuthorityGrantV1[],
): readonly CompromiseAuthorityGrantV1[] {
  if (!Array.isArray(values)) throw new TypeError("authority_grants_invalid");
  const result = values.map((value) => {
    if (!value.capability || !value.resourcePattern)
      throw new TypeError("authority_grant_invalid");
    nonNegative(value.maximumEffectClass, "maximum effect class");
    return Object.freeze({ ...value });
  }).sort((a, b) =>
    `${a.capability}\u0000${a.resourcePattern}`.localeCompare(
      `${b.capability}\u0000${b.resourcePattern}`,
    ),
  );
  const keys = result.map((value) => `${value.capability}\u0000${value.resourcePattern}`);
  if (new Set(keys).size !== keys.length)
    throw new Error("authority_grants_contain_duplicates");
  return Object.freeze(result);
}

function validateScope(scope: CompromiseAuthorityScopeV1): void {
  ids(
    [scope.tenantId, scope.meshId, scope.missionIntentId, scope.subjectPeerId],
    "authority scope",
  );
}

function ids(values: readonly string[], label: string): void {
  if (!Array.isArray(values) || new Set(values).size !== values.length)
    throw new TypeError(`${label}_invalid`);
  for (const value of values)
    if (typeof value !== "string" || !ID.test(value))
      throw new TypeError(`${label}_invalid`);
}

function digest(value: string, label: string): void {
  if (!DIGEST.test(value)) throw new TypeError(`${label}_invalid`);
}

function positive(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new TypeError(`${label}_invalid`);
}

function nonNegative(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new TypeError(`${label}_invalid`);
}
