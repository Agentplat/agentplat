import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";
export const MORPHOGENESIS_CONSTITUTIONAL_INVARIANTS_V8 = Object.freeze([
  "authority_attenuation",
  "causal_continuity",
  "diversity_floor",
  "evidence_boundary",
  "mission_identity",
  "no_self_amendment",
  "reviewer_independence",
  "tenant_isolation",
] as const);
export type MorphogenesisConstitutionalInvariantKindV8 =
  (typeof MORPHOGENESIS_CONSTITUTIONAL_INVARIANTS_V8)[number];
export interface MorphogenesisConstitutionalInvariantV8 {
  readonly schemaVersion: 8;
  readonly invariantId: AgentPlatID;
  readonly kind: MorphogenesisConstitutionalInvariantKindV8;
  readonly ruleDigest: PlanningDigestV1;
  readonly immutable: boolean;
  readonly verifierImplementationDigest: PlanningDigestV1;
  readonly invariantDigest: PlanningDigestV1;
}
export interface MorphogenesisConstitutionV8 {
  readonly schemaVersion: 8;
  readonly constitutionId: AgentPlatID;
  readonly constitutionVersion: number;
  readonly constitutionalEpoch: number;
  readonly parentConstitutionDigest: PlanningDigestV1 | null;
  readonly tenantId: AgentPlatID;
  readonly missionIntentDigest: PlanningDigestV1;
  readonly authorityCeilingDigest: PlanningDigestV1;
  readonly evidenceBoundaryDigest: PlanningDigestV1;
  readonly diversityPolicyDigest: PlanningDigestV1;
  readonly amendmentPolicyDigest: PlanningDigestV1;
  readonly invariants: readonly MorphogenesisConstitutionalInvariantV8[];
  readonly checkpointDigest: PlanningDigestV1;
  readonly effectiveAtLogicalMs: number;
  readonly constitutionDigest: PlanningDigestV1;
}
export interface MorphogenesisConstitutionalAmendmentV8 {
  readonly schemaVersion: 8;
  readonly amendmentId: AgentPlatID;
  readonly currentConstitutionDigest: PlanningDigestV1;
  readonly successorConstitution: MorphogenesisConstitutionV8;
  readonly organizationalLineageDigest: PlanningDigestV1;
  readonly proposerId: AgentPlatID;
  readonly proposerImplementationDigest: PlanningDigestV1;
  readonly beneficiaryIds: readonly AgentPlatID[];
  readonly evidenceDigests: readonly PlanningDigestV1[];
  readonly proposedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly advisoryOnly: true;
  readonly amendmentDigest: PlanningDigestV1;
}
export function createMorphogenesisConstitutionalInvariantV8(
  i: Omit<
    MorphogenesisConstitutionalInvariantV8,
    "schemaVersion" | "invariantDigest"
  >,
) {
  if (!new Set(MORPHOGENESIS_CONSTITUTIONAL_INVARIANTS_V8).has(i.kind))
    fail("constitutional invariant kind invalid");
  const b = freeze({
    schemaVersion: 8 as const,
    invariantId: id(i.invariantId),
    kind: i.kind,
    ruleDigest: sha(i.ruleDigest),
    immutable: Boolean(i.immutable),
    verifierImplementationDigest: sha(i.verifierImplementationDigest),
  });
  return freeze({
    ...b,
    invariantDigest: digest("morphogenesis-constitutional-invariant-v8", b),
  });
}
export function createMorphogenesisConstitutionV8(
  i: Omit<MorphogenesisConstitutionV8, "schemaVersion" | "constitutionDigest">,
) {
  const invariants = freeze(
    i.invariants
      .map((x) => createMorphogenesisConstitutionalInvariantV8(x))
      .sort((a, b) => a.invariantId.localeCompare(b.invariantId)),
  );
  const kinds = new Set(invariants.map((x) => x.kind));
  if (
    invariants.length !== new Set(invariants.map((x) => x.invariantId)).size ||
    MORPHOGENESIS_CONSTITUTIONAL_INVARIANTS_V8.some((x) => !kinds.has(x))
  )
    fail("constitution invariant coverage invalid");
  const b = freeze({
    schemaVersion: 8 as const,
    constitutionId: id(i.constitutionId),
    constitutionVersion: pos(i.constitutionVersion),
    constitutionalEpoch: pos(i.constitutionalEpoch),
    parentConstitutionDigest:
      i.parentConstitutionDigest === null
        ? null
        : sha(i.parentConstitutionDigest),
    tenantId: id(i.tenantId),
    missionIntentDigest: sha(i.missionIntentDigest),
    authorityCeilingDigest: sha(i.authorityCeilingDigest),
    evidenceBoundaryDigest: sha(i.evidenceBoundaryDigest),
    diversityPolicyDigest: sha(i.diversityPolicyDigest),
    amendmentPolicyDigest: sha(i.amendmentPolicyDigest),
    invariants,
    checkpointDigest: sha(i.checkpointDigest),
    effectiveAtLogicalMs: nn(i.effectiveAtLogicalMs),
  });
  return freeze({
    ...b,
    constitutionDigest: digest("morphogenesis-constitution-v8", b),
  });
}
export function createMorphogenesisConstitutionalAmendmentV8(
  i: Omit<
    MorphogenesisConstitutionalAmendmentV8,
    | "schemaVersion"
    | "currentConstitutionDigest"
    | "advisoryOnly"
    | "amendmentDigest"
  > & { readonly current: MorphogenesisConstitutionV8 },
) {
  const current = createMorphogenesisConstitutionV8(i.current),
    next = createMorphogenesisConstitutionV8(i.successorConstitution);
  if (
    next.parentConstitutionDigest !== current.constitutionDigest ||
    next.constitutionalEpoch !== current.constitutionalEpoch + 1 ||
    next.constitutionVersion !== current.constitutionVersion + 1 ||
    next.tenantId !== current.tenantId
  )
    fail("constitutional successor lineage invalid");
  const byId = new Map(next.invariants.map((x) => [x.invariantId, x]));
  for (const x of current.invariants)
    if (
      x.immutable &&
      byId.get(x.invariantId)?.invariantDigest !== x.invariantDigest
    )
      fail("immutable constitutional invariant changed");
  const beneficiaries = ids(i.beneficiaryIds);
  if (beneficiaries.includes(i.proposerId))
    fail("constitutional self amendment prohibited");
  const b = freeze({
    schemaVersion: 8 as const,
    amendmentId: id(i.amendmentId),
    currentConstitutionDigest: current.constitutionDigest,
    successorConstitution: next,
    organizationalLineageDigest: sha(i.organizationalLineageDigest),
    proposerId: id(i.proposerId),
    proposerImplementationDigest: sha(i.proposerImplementationDigest),
    beneficiaryIds: beneficiaries,
    evidenceDigests: shas(i.evidenceDigests),
    proposedAtLogicalMs: nn(i.proposedAtLogicalMs),
    expiresAtLogicalMs: pos(i.expiresAtLogicalMs),
    advisoryOnly: true as const,
  });
  if (b.expiresAtLogicalMs <= b.proposedAtLogicalMs)
    fail("constitutional amendment window invalid");
  return freeze({
    ...b,
    amendmentDigest: digest("morphogenesis-constitutional-amendment-v8", b),
  });
}
export function validateMorphogenesisConstitutionV8(input: unknown) {
  const value = exact(input, CONSTITUTION_KEYS, "constitution") as unknown as
    MorphogenesisConstitutionV8;
  const { schemaVersion: _schema, constitutionDigest, ...body } = value;
  const rebuilt = createMorphogenesisConstitutionV8(body);
  if (value.schemaVersion !== 8 || constitutionDigest !== rebuilt.constitutionDigest)
    fail("constitution digest invalid");
  return rebuilt;
}
export function validateMorphogenesisConstitutionalAmendmentV8(
  input: unknown,
  current: MorphogenesisConstitutionV8,
) {
  const value = exact(input, AMENDMENT_KEYS, "constitutional amendment") as unknown as
    MorphogenesisConstitutionalAmendmentV8;
  const { schemaVersion: _schema, currentConstitutionDigest: _current,
    advisoryOnly: _advisory, amendmentDigest, ...body } = value;
  const rebuilt = createMorphogenesisConstitutionalAmendmentV8({ ...body, current });
  if (value.schemaVersion !== 8 || value.advisoryOnly !== true ||
      amendmentDigest !== rebuilt.amendmentDigest)
    fail("constitutional amendment digest invalid");
  return rebuilt;
}
const CONSTITUTION_KEYS = ["amendmentPolicyDigest", "authorityCeilingDigest",
  "checkpointDigest", "constitutionDigest", "constitutionId", "constitutionVersion",
  "constitutionalEpoch", "diversityPolicyDigest", "effectiveAtLogicalMs",
  "evidenceBoundaryDigest", "invariants", "missionIntentDigest",
  "parentConstitutionDigest", "schemaVersion", "tenantId"] as const;
const AMENDMENT_KEYS = ["advisoryOnly", "amendmentDigest", "amendmentId",
  "beneficiaryIds", "currentConstitutionDigest", "evidenceDigests",
  "expiresAtLogicalMs", "organizationalLineageDigest", "proposedAtLogicalMs",
  "proposerId", "proposerImplementationDigest", "schemaVersion",
  "successorConstitution"] as const;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u,
  SHA = /^sha256:[0-9a-f]{64}$/u;
function id(v: unknown) {
  if (typeof v !== "string" || !ID.test(v)) fail("constitutional ID invalid");
  return v as AgentPlatID;
}
function sha(v: unknown) {
  if (typeof v !== "string" || !SHA.test(v))
    fail("constitutional digest invalid");
  return v as PlanningDigestV1;
}
function pos(v: unknown) {
  if (!Number.isSafeInteger(v) || (v as number) < 1)
    fail("constitutional integer invalid");
  return v as number;
}
function nn(v: unknown) {
  if (!Number.isSafeInteger(v) || (v as number) < 0)
    fail("constitutional integer invalid");
  return v as number;
}
function ids(v: readonly unknown[]) {
  const r = [...new Set(v.map(id))].sort();
  if (!r.length || r.length !== v.length)
    fail("constitutional identities invalid");
  return freeze(r);
}
function shas(v: readonly unknown[]) {
  const r = [...new Set(v.map(sha))].sort();
  if (!r.length || r.length !== v.length)
    fail("constitutional evidence invalid");
  return freeze(r);
}
function digest(d: string, v: unknown) {
  return digestPlanningJsonV1(d as never, v as PlanningJson);
}
function exact(value: unknown, keys: readonly string[], label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype ||
      JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort()))
    fail(`${label} shape invalid`);
  return value as Record<string, unknown>;
}
function freeze<T>(v: T): T {
  if (v && typeof v === "object" && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const x of Object.values(v as Record<string, unknown>)) freeze(x);
  }
  return v;
}
function fail(m: string): never {
  throw new TypeError(m);
}
