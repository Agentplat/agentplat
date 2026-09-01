import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";
import type { MorphogenesisConstitutionalAmendmentV8 } from "./morphogenesis-constitutional-continuity.js";
import type { MorphogenesisConstitutionalAuthorizationV8 } from "./morphogenesis-constitutional-governance.js";
export type MorphogenesisConstitutionalGateSourceV8 =
  | "trust"
  | "inference_control"
  | "collective_decision"
  | "membership"
  | "evidence_boundary";
export interface MorphogenesisConstitutionalGateAssessmentV8 {
  readonly schemaVersion: 8;
  readonly source: MorphogenesisConstitutionalGateSourceV8;
  readonly amendmentDigest: PlanningDigestV1;
  readonly authorizationDigest: PlanningDigestV1;
  readonly disposition: "eligible" | "restricted" | "denied" | "unavailable";
  readonly policyDigest: PlanningDigestV1;
  readonly sourceId: AgentPlatID;
  readonly sourceImplementationDigest: PlanningDigestV1;
  readonly evidenceDigests: readonly PlanningDigestV1[];
  readonly observedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly assessmentDigest: PlanningDigestV1;
}
export interface MorphogenesisConstitutionalGatePortV8 {
  readonly source: MorphogenesisConstitutionalGateSourceV8;
  assess(input: {
    readonly amendment: MorphogenesisConstitutionalAmendmentV8;
    readonly authorization: MorphogenesisConstitutionalAuthorizationV8;
    readonly logicalTimeMs: number;
  }): Promise<MorphogenesisConstitutionalGateAssessmentV8>;
}
export interface MorphogenesisConstitutionalEligibilityV8 {
  readonly schemaVersion: 8;
  readonly amendmentDigest: PlanningDigestV1;
  readonly authorizationDigest: PlanningDigestV1;
  readonly assessmentDigests: readonly PlanningDigestV1[];
  readonly disposition: "eligible" | "ineligible";
  readonly reasonCodes: readonly AgentPlatID[];
  readonly evaluatedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly operationalAuthorityGranted: false;
  readonly decisionDigest: PlanningDigestV1;
}
export function createMorphogenesisConstitutionalGateAssessmentV8(
  i: Omit<
    MorphogenesisConstitutionalGateAssessmentV8,
    "schemaVersion" | "assessmentDigest"
  >,
) {
  const b = freeze({
    schemaVersion: 8 as const,
    source: source(i.source),
    amendmentDigest: sha(i.amendmentDigest),
    authorizationDigest: sha(i.authorizationDigest),
    disposition: disp(i.disposition),
    policyDigest: sha(i.policyDigest),
    sourceId: id(i.sourceId),
    sourceImplementationDigest: sha(i.sourceImplementationDigest),
    evidenceDigests: shas(i.evidenceDigests),
    observedAtLogicalMs: nn(i.observedAtLogicalMs),
    expiresAtLogicalMs: pos(i.expiresAtLogicalMs),
  });
  if (b.expiresAtLogicalMs <= b.observedAtLogicalMs)
    fail("constitutional gate window invalid");
  return freeze({
    ...b,
    assessmentDigest: dg("morphogenesis-constitutional-gate-assessment-v8", b),
  });
}
export class MorphogenesisConstitutionalEligibilityGateV8 {
  readonly ports: readonly MorphogenesisConstitutionalGatePortV8[];
  constructor(ports: readonly MorphogenesisConstitutionalGatePortV8[]) {
    const sources = new Set(ports.map((x) => x.source));
    if (
      REQUIRED.some((x) => !sources.has(x)) ||
      sources.size !== REQUIRED.length
    )
      fail("constitutional gate sources incomplete");
    this.ports = ports;
  }
  async evaluate(i: {
    readonly amendment: MorphogenesisConstitutionalAmendmentV8;
    readonly authorization: MorphogenesisConstitutionalAuthorizationV8;
    readonly logicalTimeMs: number;
  }) {
    const values = await Promise.all(this.ports.map((x) => x.assess(i))),
      assessments = values.map((v) => {
        const { schemaVersion: _, assessmentDigest, ...body } = v,
          n = createMorphogenesisConstitutionalGateAssessmentV8(body);
        if (
          n.assessmentDigest !== assessmentDigest ||
          n.amendmentDigest !== i.amendment.amendmentDigest ||
          n.authorizationDigest !== i.authorization.authorizationDigest ||
          n.expiresAtLogicalMs <= i.logicalTimeMs
        )
          fail("constitutional gate assessment invalid");
        return n;
      });
    const reasons = freeze(
        assessments
          .filter((x) => x.disposition !== "eligible")
          .map((x) => `${x.source}_${x.disposition}` as AgentPlatID)
          .sort(),
      ),
      b = freeze({
        schemaVersion: 8 as const,
        amendmentDigest: i.amendment.amendmentDigest,
        authorizationDigest: i.authorization.authorizationDigest,
        assessmentDigests: freeze(
          assessments.map((x) => x.assessmentDigest).sort(),
        ),
        disposition: (reasons.length ? "ineligible" : "eligible") as
          "eligible" | "ineligible",
        reasonCodes: reasons,
        evaluatedAtLogicalMs: nn(i.logicalTimeMs),
        expiresAtLogicalMs: Math.min(
          ...assessments.map((x) => x.expiresAtLogicalMs),
        ),
        operationalAuthorityGranted: false as const,
      });
    return freeze({
      ...b,
      decisionDigest: dg("morphogenesis-constitutional-eligibility-v8", b),
    });
  }
}
const REQUIRED = [
    "trust",
    "inference_control",
    "collective_decision",
    "membership",
    "evidence_boundary",
  ] as const,
  ID = /^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u,
  SHA = /^sha256:[0-9a-f]{64}$/u;
function source(v: unknown) {
  if (typeof v !== "string" || !new Set(REQUIRED).has(v as never))
    fail("constitutional gate source invalid");
  return v as MorphogenesisConstitutionalGateSourceV8;
}
function disp(v: unknown) {
  if (
    typeof v !== "string" ||
    !new Set(["eligible", "restricted", "denied", "unavailable"]).has(v)
  )
    fail("constitutional gate disposition invalid");
  return v as MorphogenesisConstitutionalGateAssessmentV8["disposition"];
}
function id(v: unknown) {
  if (typeof v !== "string" || !ID.test(v))
    fail("constitutional gate ID invalid");
  return v as AgentPlatID;
}
function sha(v: unknown) {
  if (typeof v !== "string" || !SHA.test(v))
    fail("constitutional gate digest invalid");
  return v as PlanningDigestV1;
}
function pos(v: unknown) {
  if (!Number.isSafeInteger(v) || (v as number) < 1)
    fail("constitutional gate integer invalid");
  return v as number;
}
function nn(v: unknown) {
  if (!Number.isSafeInteger(v) || (v as number) < 0)
    fail("constitutional gate integer invalid");
  return v as number;
}
function shas(v: readonly unknown[]) {
  const r = [...new Set(v.map(sha))].sort();
  if (!r.length || r.length !== v.length)
    fail("constitutional gate evidence invalid");
  return freeze(r);
}
function dg(d: string, v: unknown) {
  return digestPlanningJsonV1(d as never, v as PlanningJson);
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
