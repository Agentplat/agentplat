import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";
import type {
  MorphogenesisConstitutionV8,
  MorphogenesisConstitutionalAmendmentV8,
  MorphogenesisConstitutionalInvariantV8,
} from "./morphogenesis-constitutional-continuity.js";
export interface MorphogenesisConstitutionalModelCheckingScenarioV8 {
  readonly schemaVersion: 8;
  readonly scenarioId: AgentPlatID;
  readonly currentConstitutionDigest: PlanningDigestV1;
  readonly amendmentDigests: readonly PlanningDigestV1[];
  readonly invariantDigests: readonly PlanningDigestV1[];
  readonly checkerImplementationDigest: PlanningDigestV1;
  readonly maximumTransitions: number;
  readonly environmentDigest: PlanningDigestV1;
  readonly seedDigest: PlanningDigestV1;
  readonly scenarioDigest: PlanningDigestV1;
}
export interface MorphogenesisConstitutionalInvariantVerifierV8 {
  readonly invariantId: AgentPlatID;
  readonly verifierImplementationDigest: PlanningDigestV1;
  verify(input: {
    readonly current: MorphogenesisConstitutionV8;
    readonly amendment: MorphogenesisConstitutionalAmendmentV8;
    readonly invariant: MorphogenesisConstitutionalInvariantV8;
    readonly scenario: MorphogenesisConstitutionalModelCheckingScenarioV8;
  }): Promise<{
    readonly satisfied: boolean;
    readonly evidenceDigest: PlanningDigestV1;
  }>;
}
export interface MorphogenesisConstitutionalModelCheckingReceiptV8 {
  readonly schemaVersion: 8;
  readonly receiptId: AgentPlatID;
  readonly scenarioDigest: PlanningDigestV1;
  readonly exploredTransitions: number;
  readonly requiredTransitions: number;
  readonly disposition: "proved" | "counterexample" | "incomplete";
  readonly violatedInvariantId: AgentPlatID | null;
  readonly counterexampleAmendmentDigest: PlanningDigestV1 | null;
  readonly evidenceDigests: readonly PlanningDigestV1[];
  readonly checkerImplementationDigest: PlanningDigestV1;
  readonly checkedAtLogicalMs: number;
  readonly grantsAuthority: false;
  readonly receiptDigest: PlanningDigestV1;
}
export function createMorphogenesisConstitutionalModelCheckingScenarioV8(
  i: Omit<
    MorphogenesisConstitutionalModelCheckingScenarioV8,
    | "schemaVersion"
    | "currentConstitutionDigest"
    | "amendmentDigests"
    | "invariantDigests"
    | "scenarioDigest"
  > & {
    readonly current: MorphogenesisConstitutionV8;
    readonly amendments: readonly MorphogenesisConstitutionalAmendmentV8[];
  },
) {
  const b = freeze({
    schemaVersion: 8 as const,
    scenarioId: id(i.scenarioId),
    currentConstitutionDigest: i.current.constitutionDigest,
    amendmentDigests: shas(i.amendments.map((x) => x.amendmentDigest)),
    invariantDigests: shas(i.current.invariants.map((x) => x.invariantDigest)),
    checkerImplementationDigest: sha(i.checkerImplementationDigest),
    maximumTransitions: pos(i.maximumTransitions),
    environmentDigest: sha(i.environmentDigest),
    seedDigest: sha(i.seedDigest),
  });
  return freeze({
    ...b,
    scenarioDigest: dg(
      "morphogenesis-constitutional-model-checking-scenario-v8",
      b,
    ),
  });
}
export class MorphogenesisConstitutionalModelCheckerV8 {
  constructor(
    readonly options: {
      readonly checkerImplementationDigest: PlanningDigestV1;
      readonly verifiers: readonly MorphogenesisConstitutionalInvariantVerifierV8[];
    },
  ) {}
  async check(i: {
    readonly receiptId: AgentPlatID;
    readonly current: MorphogenesisConstitutionV8;
    readonly amendments: readonly MorphogenesisConstitutionalAmendmentV8[];
    readonly scenario: MorphogenesisConstitutionalModelCheckingScenarioV8;
    readonly logicalTimeMs: number;
  }) {
    if (
      i.scenario.checkerImplementationDigest !==
        this.options.checkerImplementationDigest ||
      i.scenario.currentConstitutionDigest !== i.current.constitutionDigest
    )
      fail("constitutional checker binding invalid");
    const verifier = new Map(
        this.options.verifiers.map((x) => [x.invariantId, x]),
      ),
      required = i.amendments.length * i.current.invariants.length,
      evidence = [] as PlanningDigestV1[];
    let explored = 0,
      violated: AgentPlatID | null = null,
      counter: PlanningDigestV1 | null = null;
    outer: for (const amendment of [...i.amendments].sort((a, b) =>
      a.amendmentDigest.localeCompare(b.amendmentDigest),
    ))
      for (const invariant of i.current.invariants) {
        if (explored >= i.scenario.maximumTransitions) break outer;
        const v = verifier.get(invariant.invariantId);
        if (
          !v ||
          v.verifierImplementationDigest !==
            invariant.verifierImplementationDigest
        )
          fail("constitutional invariant verifier unavailable");
        const result = await v.verify({
          current: i.current,
          amendment,
          invariant,
          scenario: i.scenario,
        });
        evidence.push(sha(result.evidenceDigest));
        explored++;
        if (!result.satisfied) {
          violated = invariant.invariantId;
          counter = amendment.amendmentDigest;
          break outer;
        }
      }
    const disposition = violated
      ? "counterexample"
      : explored < required
        ? "incomplete"
        : "proved";
    const b = freeze({
      schemaVersion: 8 as const,
      receiptId: id(i.receiptId),
      scenarioDigest: i.scenario.scenarioDigest,
      exploredTransitions: explored,
      requiredTransitions: required,
      disposition,
      violatedInvariantId: violated,
      counterexampleAmendmentDigest: counter,
      evidenceDigests: freeze([...new Set(evidence)].sort()),
      checkerImplementationDigest: this.options.checkerImplementationDigest,
      checkedAtLogicalMs: nn(i.logicalTimeMs),
      grantsAuthority: false as const,
    });
    return freeze({
      ...b,
      receiptDigest: dg(
        "morphogenesis-constitutional-model-checking-receipt-v8",
        b,
      ),
    });
  }
}
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u,
  SHA = /^sha256:[0-9a-f]{64}$/u;
function id(v: unknown) {
  if (typeof v !== "string" || !ID.test(v))
    fail("constitutional model ID invalid");
  return v as AgentPlatID;
}
function sha(v: unknown) {
  if (typeof v !== "string" || !SHA.test(v))
    fail("constitutional model digest invalid");
  return v as PlanningDigestV1;
}
function pos(v: unknown) {
  if (!Number.isSafeInteger(v) || (v as number) < 1)
    fail("constitutional model bound invalid");
  return v as number;
}
function nn(v: unknown) {
  if (!Number.isSafeInteger(v) || (v as number) < 0)
    fail("constitutional model time invalid");
  return v as number;
}
function shas(v: readonly unknown[]) {
  const r = [...new Set(v.map(sha))].sort();
  if (!r.length || r.length !== v.length)
    fail("constitutional model set invalid");
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
