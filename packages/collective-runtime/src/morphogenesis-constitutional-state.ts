import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";
import {
  validateMorphogenesisConstitutionV8,
  validateMorphogenesisConstitutionalAmendmentV8,
  type MorphogenesisConstitutionV8,
  type MorphogenesisConstitutionalAmendmentV8,
} from "./morphogenesis-constitutional-continuity.js";
import type { MorphogenesisConstitutionalAuthorizationV8 } from "./morphogenesis-constitutional-governance.js";
import type { MorphogenesisConstitutionalEligibilityV8 } from "./morphogenesis-constitutional-integrations.js";
import type {
  MorphogenesisConstitutionalReconciliationV8,
  MorphogenesisConstitutionalRollbackReceiptV8,
} from "./morphogenesis-constitutional-reconciliation.js";
export interface MorphogenesisConstitutionalStateV8 {
  readonly schemaVersion: 8;
  readonly stateKey: AgentPlatID;
  readonly activeConstitution: MorphogenesisConstitutionV8;
  readonly authorityEpoch: number;
  readonly status: "active" | "isolated" | "recovery";
  readonly amendmentDigests: readonly PlanningDigestV1[];
  readonly authorizationDigests: readonly PlanningDigestV1[];
  readonly eligibilityDecisionDigests: readonly PlanningDigestV1[];
  readonly reconciliationDigests: readonly PlanningDigestV1[];
  readonly rollbackReceiptDigests: readonly PlanningDigestV1[];
  readonly revokedAuthorizationDigests: readonly PlanningDigestV1[];
  readonly revision: number;
  readonly logicalTimeHighWaterMs: number;
  readonly predecessorStateDigest: PlanningDigestV1 | null;
  readonly stateDigest: PlanningDigestV1;
}
export interface MorphogenesisConstitutionalStateStoreV8 {
  load(k: AgentPlatID): Promise<MorphogenesisConstitutionalStateV8 | null>;
  save(i: {
    readonly state: MorphogenesisConstitutionalStateV8;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: PlanningDigestV1 | null;
  }): Promise<boolean>;
}
export class InMemoryMorphogenesisConstitutionalStateStoreV8 implements MorphogenesisConstitutionalStateStoreV8 {
  #m = new Map<string, MorphogenesisConstitutionalStateV8>();
  async load(k: AgentPlatID) {
    return this.#m.get(k) ?? null;
  }
  async save(i: {
    readonly state: MorphogenesisConstitutionalStateV8;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: PlanningDigestV1 | null;
  }) {
    const c = this.#m.get(i.state.stateKey);
    if (
      (c?.revision ?? null) !== i.expectedRevision ||
      (c?.stateDigest ?? null) !== i.expectedStateDigest
    )
      return false;
    const state = validateMorphogenesisConstitutionalStateV8(i.state);
    this.#m.set(state.stateKey, state);
    return true;
  }
}
export class MorphogenesisConstitutionalStateRuntimeV8 {
  constructor(
    readonly options: {
      readonly stateKey: AgentPlatID;
      readonly store: MorphogenesisConstitutionalStateStoreV8;
      readonly maximumCommitAttempts: number;
    },
  ) {}
  async initialize(i: {
    readonly constitution: MorphogenesisConstitutionV8;
    readonly authorityEpoch: number;
    readonly logicalTimeMs: number;
  }) {
    const s = record({
      stateKey: id(this.options.stateKey),
      activeConstitution: validateMorphogenesisConstitutionV8(i.constitution),
      authorityEpoch: pos(i.authorityEpoch),
      status: "active",
      amendmentDigests: [],
      authorizationDigests: [],
      eligibilityDecisionDigests: [],
      reconciliationDigests: [],
      rollbackReceiptDigests: [],
      revokedAuthorizationDigests: [],
      revision: 0,
      logicalTimeHighWaterMs: nn(i.logicalTimeMs),
      predecessorStateDigest: null,
    });
    if (
      await this.options.store.save({
        state: s,
        expectedRevision: null,
        expectedStateDigest: null,
      })
    )
      return s;
    const x = await this.options.store.load(s.stateKey);
    if (x?.stateDigest === s.stateDigest) return x;
    fail("constitutional state initialization conflict");
  }
  async applySuccessor(i: {
    readonly amendment: MorphogenesisConstitutionalAmendmentV8;
    readonly authorization: MorphogenesisConstitutionalAuthorizationV8;
    readonly eligibility: MorphogenesisConstitutionalEligibilityV8;
    readonly logicalTimeMs: number;
  }) {
    return this.commit(i.logicalTimeMs, (s) => {
      const amendment = validateMorphogenesisConstitutionalAmendmentV8(
        i.amendment,
        s.activeConstitution,
      );
      if (
        amendment.currentConstitutionDigest !==
          s.activeConstitution.constitutionDigest ||
        i.authorization.amendmentDigest !== amendment.amendmentDigest ||
        i.eligibility.authorizationDigest !==
          i.authorization.authorizationDigest ||
        i.eligibility.disposition !== "eligible" ||
        i.authorization.operationalAuthorityGranted ||
        i.eligibility.operationalAuthorityGranted
      )
        fail("constitutional successor admission invalid");
      return next(s, i.logicalTimeMs, {
        activeConstitution: amendment.successorConstitution,
        authorityEpoch: s.authorityEpoch + 1,
        status: "active",
        amendmentDigests: add(s.amendmentDigests, amendment.amendmentDigest),
        authorizationDigests: add(
          s.authorizationDigests,
          i.authorization.authorizationDigest,
        ),
        eligibilityDecisionDigests: add(
          s.eligibilityDecisionDigests,
          i.eligibility.decisionDigest,
        ),
      });
    });
  }
  async recordReconciliation(i: {
    readonly reconciliation: MorphogenesisConstitutionalReconciliationV8;
    readonly logicalTimeMs: number;
  }) {
    return this.commit(i.logicalTimeMs, (s) =>
      next(s, i.logicalTimeMs, {
        status:
          i.reconciliation.disposition === "selected"
            ? "active"
            : i.reconciliation.disposition === "isolated"
              ? "isolated"
              : "recovery",
        reconciliationDigests: add(
          s.reconciliationDigests,
          i.reconciliation.reconciliationDigest,
        ),
      }),
    );
  }
  async applyRollback(i: {
    readonly receipt: MorphogenesisConstitutionalRollbackReceiptV8;
    readonly target: MorphogenesisConstitutionV8;
    readonly logicalTimeMs: number;
  }) {
    return this.commit(i.logicalTimeMs, (s) => {
      const target = validateMorphogenesisConstitutionV8(i.target);
      if (
        i.receipt.targetConstitutionDigest !== target.constitutionDigest ||
        i.receipt.successorAuthorityEpoch <= s.authorityEpoch ||
        i.receipt.reactivatesPriorAuthority
      )
        fail("constitutional rollback admission invalid");
      return next(s, i.logicalTimeMs, {
        activeConstitution: target,
        authorityEpoch: i.receipt.successorAuthorityEpoch,
        status: "recovery",
        rollbackReceiptDigests: add(
          s.rollbackReceiptDigests,
          i.receipt.receiptDigest,
        ),
        revokedAuthorizationDigests: freeze(
          [
            ...new Set([
              ...s.revokedAuthorizationDigests,
              ...i.receipt.revokedAuthorizationDigests,
            ]),
          ].sort(),
        ),
      });
    });
  }
  async state() {
    const s = await this.options.store.load(this.options.stateKey);
    if (!s) fail("constitutional state unavailable");
    return validateMorphogenesisConstitutionalStateV8(s);
  }
  async commit(
    t: number,
    f: (
      s: MorphogenesisConstitutionalStateV8,
    ) => MorphogenesisConstitutionalStateV8,
  ) {
    for (let n = 0; n < this.options.maximumCommitAttempts; n++) {
      const s = await this.state();
      if (t < s.logicalTimeHighWaterMs) fail("constitutional time rollback");
      const q = f(s);
      if (
        await this.options.store.save({
          state: q,
          expectedRevision: s.revision,
          expectedStateDigest: s.stateDigest,
        })
      )
        return q;
    }
    fail("constitutional state CAS exhausted");
  }
}
export function validateMorphogenesisConstitutionalStateV8(
  v: MorphogenesisConstitutionalStateV8,
) {
  const { stateDigest, ...body } = v;
  const constitution = validateMorphogenesisConstitutionV8(v.activeConstitution);
  if (
    v.schemaVersion !== 8 ||
    stateDigest !== dg("morphogenesis-constitutional-state-v8", body)
  )
    fail("constitutional state invalid");
  return freeze(structuredClone({ ...v, activeConstitution: constitution }));
}
function record(
  i: Omit<MorphogenesisConstitutionalStateV8, "schemaVersion" | "stateDigest">,
) {
  const b = freeze({ schemaVersion: 8 as const, ...i });
  return freeze({
    ...b,
    stateDigest: dg("morphogenesis-constitutional-state-v8", b),
  });
}
function next(
  s: MorphogenesisConstitutionalStateV8,
  t: number,
  c: Partial<MorphogenesisConstitutionalStateV8>,
) {
  return record({
    ...s,
    ...c,
    revision: s.revision + 1,
    logicalTimeHighWaterMs: t,
    predecessorStateDigest: s.stateDigest,
  });
}
function add(v: readonly PlanningDigestV1[], x: PlanningDigestV1) {
  return freeze([...new Set([...v, x])].sort());
}
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u;
function id(v: unknown) {
  if (typeof v !== "string" || !ID.test(v))
    fail("constitutional state ID invalid");
  return v as AgentPlatID;
}
function pos(v: unknown) {
  if (!Number.isSafeInteger(v) || (v as number) < 1)
    fail("constitutional state integer invalid");
  return v as number;
}
function nn(v: unknown) {
  if (!Number.isSafeInteger(v) || (v as number) < 0)
    fail("constitutional state integer invalid");
  return v as number;
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
