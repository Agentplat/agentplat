import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";
import {
  validateMorphogenesisOrganizationalEvolutionPlanV7,
  type MorphogenesisOrganizationalEvolutionPlanV7,
  type MorphogenesisOrganizationalPlanStepV7,
} from "./morphogenesis-organizational-evolution-plan.js";

export interface MorphogenesisOrganizationalStepReceiptV7 {
  readonly schemaVersion: 7;
  readonly operationId: AgentPlatID;
  readonly planDigest: PlanningDigestV1;
  readonly stepDigest: PlanningDigestV1;
  readonly ownerReceiptDigest: PlanningDigestV1;
  readonly appliedAtLogicalMs: number;
  readonly receiptDigest: PlanningDigestV1;
}
export interface MorphogenesisOrganizationalCompensationReceiptV7 {
  readonly schemaVersion: 7;
  readonly operationId: AgentPlatID;
  readonly planDigest: PlanningDigestV1;
  readonly stepReceiptDigest: PlanningDigestV1;
  readonly ownerReceiptDigest: PlanningDigestV1;
  readonly compensatedAtLogicalMs: number;
  readonly receiptDigest: PlanningDigestV1;
}
export interface MorphogenesisOrganizationalBoundaryV7 {
  apply(input: {
    readonly operationId: AgentPlatID;
    readonly plan: MorphogenesisOrganizationalEvolutionPlanV7;
    readonly step: MorphogenesisOrganizationalPlanStepV7;
    readonly logicalTimeMs: number;
  }): Promise<MorphogenesisOrganizationalStepReceiptV7>;
  reconcileApply(input: {
    readonly operationId: AgentPlatID;
    readonly plan: MorphogenesisOrganizationalEvolutionPlanV7;
    readonly step: MorphogenesisOrganizationalPlanStepV7;
    readonly logicalTimeMs: number;
  }): Promise<MorphogenesisOrganizationalStepReceiptV7>;
  compensate(input: {
    readonly operationId: AgentPlatID;
    readonly plan: MorphogenesisOrganizationalEvolutionPlanV7;
    readonly step: MorphogenesisOrganizationalPlanStepV7;
    readonly receipt: MorphogenesisOrganizationalStepReceiptV7;
    readonly logicalTimeMs: number;
  }): Promise<MorphogenesisOrganizationalCompensationReceiptV7>;
  reconcileCompensation(input: {
    readonly operationId: AgentPlatID;
    readonly plan: MorphogenesisOrganizationalEvolutionPlanV7;
    readonly step: MorphogenesisOrganizationalPlanStepV7;
    readonly receipt: MorphogenesisOrganizationalStepReceiptV7;
    readonly logicalTimeMs: number;
  }): Promise<MorphogenesisOrganizationalCompensationReceiptV7>;
}
export interface MorphogenesisOrganizationalExecutionStateV7 {
  readonly schemaVersion: 7;
  readonly stateKey: AgentPlatID;
  readonly plan: MorphogenesisOrganizationalEvolutionPlanV7;
  readonly authorizationDigest: PlanningDigestV1;
  readonly status:
    | "prepared"
    | "applying"
    | "applied"
    | "compensating"
    | "rolled_back"
    | "failed";
  readonly pendingStepId: AgentPlatID | null;
  readonly appliedReceipts: readonly MorphogenesisOrganizationalStepReceiptV7[];
  readonly compensationReceipts: readonly MorphogenesisOrganizationalCompensationReceiptV7[];
  readonly failureEvidenceDigest: PlanningDigestV1 | null;
  readonly revision: number;
  readonly logicalTimeHighWaterMs: number;
  readonly predecessorStateDigest: PlanningDigestV1 | null;
  readonly stateDigest: PlanningDigestV1;
}
export interface MorphogenesisOrganizationalExecutionStoreV7 {
  load(
    key: AgentPlatID,
  ): Promise<MorphogenesisOrganizationalExecutionStateV7 | null>;
  save(input: {
    readonly state: MorphogenesisOrganizationalExecutionStateV7;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: PlanningDigestV1 | null;
  }): Promise<boolean>;
}
export class InMemoryMorphogenesisOrganizationalExecutionStoreV7 implements MorphogenesisOrganizationalExecutionStoreV7 {
  #m = new Map<string, MorphogenesisOrganizationalExecutionStateV7>();
  async load(k: AgentPlatID) {
    return this.#m.get(k) ?? null;
  }
  async save(i: {
    readonly state: MorphogenesisOrganizationalExecutionStateV7;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: PlanningDigestV1 | null;
  }) {
    const c = this.#m.get(i.state.stateKey);
    if (
      (c?.revision ?? null) !== i.expectedRevision ||
      (c?.stateDigest ?? null) !== i.expectedStateDigest
    )
      return false;
    this.#m.set(i.state.stateKey, freeze(structuredClone(i.state)));
    return true;
  }
}
export class MorphogenesisOrganizationalExecutionRuntimeV7 {
  constructor(
    readonly options: {
      readonly store: MorphogenesisOrganizationalExecutionStoreV7;
      readonly boundaries: Readonly<
        Record<
          MorphogenesisOrganizationalPlanStepV7["authorityOwner"],
          MorphogenesisOrganizationalBoundaryV7
        >
      >;
      readonly maximumCommitAttempts: number;
    },
  ) {}
  async initialize(input: {
    readonly stateKey: AgentPlatID;
    readonly plan: MorphogenesisOrganizationalEvolutionPlanV7;
    readonly authorizationDigest: PlanningDigestV1;
    readonly logicalTimeMs: number;
  }) {
    const s = state({
      stateKey: id(input.stateKey),
      plan: input.plan,
      authorizationDigest: sha(input.authorizationDigest),
      status: "prepared",
      pendingStepId: null,
      appliedReceipts: [],
      compensationReceipts: [],
      failureEvidenceDigest: null,
      revision: 0,
      logicalTimeHighWaterMs: nonneg(input.logicalTimeMs),
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
    const r = await this.options.store.load(s.stateKey);
    if (r?.stateDigest === s.stateDigest) return r;
    fail("organizational execution initialization conflict");
  }
  async advance(input: {
    readonly stateKey: AgentPlatID;
    readonly logicalTimeMs: number;
  }) {
    let c = await this.required(input.stateKey);
    if (["applied", "rolled_back", "failed"].includes(c.status)) return c;
    if (c.status === "compensating") return this.compensate(input);
    const done = new Set(c.appliedReceipts.map((x) => x.stepDigest));
    const next = c.plan.steps.find(
      (x) =>
        !done.has(x.stepDigest) &&
        x.dependsOnStepIds.every((d) => {
          const s = c.plan.steps.find((y) => y.stepId === d);
          return s && done.has(s.stepDigest);
        }),
    );
    if (!next)
      return this.save(c, {
        status: "applied",
        pendingStepId: null,
        logicalTimeMs: input.logicalTimeMs,
      });
    const op = `${c.stateKey}:${next.stepId}:apply` as AgentPlatID;
    const retry = c.status === "applying";
    if (retry && c.pendingStepId !== next.stepId)
      fail("organizational pending step inconsistent");
    if (!retry)
      c = await this.save(c, {
        status: "applying",
        pendingStepId: next.stepId,
        logicalTimeMs: input.logicalTimeMs,
      });
    const b = this.options.boundaries[next.authorityOwner];
    const raw = await (retry
      ? b.reconcileApply({
          operationId: op,
          plan: c.plan,
          step: next,
          logicalTimeMs: input.logicalTimeMs,
        })
      : b.apply({
          operationId: op,
          plan: c.plan,
          step: next,
          logicalTimeMs: input.logicalTimeMs,
        }));
    const r = receipt(
      raw,
      op,
      c.plan.planDigest,
      next.stepDigest,
      input.logicalTimeMs,
    );
    return this.save(c, {
      status: "prepared",
      pendingStepId: null,
      appliedReceipts: [...c.appliedReceipts, r],
      logicalTimeMs: input.logicalTimeMs,
    });
  }
  async failAndCompensate(input: {
    readonly stateKey: AgentPlatID;
    readonly failureEvidenceDigest: PlanningDigestV1;
    readonly logicalTimeMs: number;
  }) {
    const c = await this.required(input.stateKey);
    if (c.status === "applied")
      fail("applied organizational evolution requires governed rollback");
    return this.save(c, {
      status: "compensating",
      pendingStepId: null,
      failureEvidenceDigest: sha(input.failureEvidenceDigest),
      logicalTimeMs: input.logicalTimeMs,
    });
  }
  async compensate(input: {
    readonly stateKey: AgentPlatID;
    readonly logicalTimeMs: number;
  }) {
    let c = await this.required(input.stateKey);
    if (c.status !== "compensating")
      fail("organizational compensation unavailable");
    const compensated = new Set(
      c.compensationReceipts.map((x) => x.stepReceiptDigest),
    );
    const pair = [...c.appliedReceipts]
      .reverse()
      .map((r) => ({
        r,
        s: c.plan.steps.find((x) => x.stepDigest === r.stepDigest)!,
      }))
      .find(
        (x) => x.s.compensationRequired && !compensated.has(x.r.receiptDigest),
      );
    if (!pair)
      return this.save(c, {
        status: "rolled_back",
        pendingStepId: null,
        logicalTimeMs: input.logicalTimeMs,
      });
    const op = `${c.stateKey}:${pair.s.stepId}:compensate` as AgentPlatID;
    const retry = c.pendingStepId === pair.s.stepId;
    if (c.pendingStepId && !retry)
      fail("organizational compensation pending mismatch");
    if (!retry)
      c = await this.save(c, {
        pendingStepId: pair.s.stepId,
        logicalTimeMs: input.logicalTimeMs,
      });
    const b = this.options.boundaries[pair.s.authorityOwner];
    const raw = await (retry
      ? b.reconcileCompensation({
          operationId: op,
          plan: c.plan,
          step: pair.s,
          receipt: pair.r,
          logicalTimeMs: input.logicalTimeMs,
        })
      : b.compensate({
          operationId: op,
          plan: c.plan,
          step: pair.s,
          receipt: pair.r,
          logicalTimeMs: input.logicalTimeMs,
        }));
    const r = compReceipt(
      raw,
      op,
      c.plan.planDigest,
      pair.r.receiptDigest,
      input.logicalTimeMs,
    );
    return this.save(c, {
      pendingStepId: null,
      compensationReceipts: [...c.compensationReceipts, r],
      logicalTimeMs: input.logicalTimeMs,
    });
  }
  async required(k: AgentPlatID) {
    const x = await this.options.store.load(k);
    if (!x) fail("organizational execution missing");
    return x;
  }
  async save(
    c: MorphogenesisOrganizationalExecutionStateV7,
    x: {
      readonly status?: MorphogenesisOrganizationalExecutionStateV7["status"];
      readonly pendingStepId?: AgentPlatID | null;
      readonly appliedReceipts?: readonly MorphogenesisOrganizationalStepReceiptV7[];
      readonly compensationReceipts?: readonly MorphogenesisOrganizationalCompensationReceiptV7[];
      readonly failureEvidenceDigest?: PlanningDigestV1 | null;
      readonly logicalTimeMs: number;
    },
  ) {
    for (let n = 0; n < this.options.maximumCommitAttempts; n++) {
      const q = state({
        ...c,
        status: x.status ?? c.status,
        pendingStepId:
          x.pendingStepId === undefined ? c.pendingStepId : x.pendingStepId,
        appliedReceipts: x.appliedReceipts ?? c.appliedReceipts,
        compensationReceipts: x.compensationReceipts ?? c.compensationReceipts,
        failureEvidenceDigest:
          x.failureEvidenceDigest === undefined
            ? c.failureEvidenceDigest
            : x.failureEvidenceDigest,
        revision: c.revision + 1,
        logicalTimeHighWaterMs: x.logicalTimeMs,
        predecessorStateDigest: c.stateDigest,
      });
      if (
        await this.options.store.save({
          state: q,
          expectedRevision: c.revision,
          expectedStateDigest: c.stateDigest,
        })
      )
        return q;
      c = await this.required(c.stateKey);
    }
    fail("organizational execution CAS exhausted");
  }
}
function receipt(
  r: MorphogenesisOrganizationalStepReceiptV7,
  op: AgentPlatID,
  p: PlanningDigestV1,
  s: PlanningDigestV1,
  t: number,
) {
  const { receiptDigest, ...b } = r;
  if (
    r.operationId !== op ||
    r.planDigest !== p ||
    r.stepDigest !== s ||
    r.appliedAtLogicalMs !== t ||
    receiptDigest !== digest("morphogenesis-organizational-step-receipt-v7", b)
  )
    fail("organizational step receipt invalid");
  return freeze(structuredClone(r));
}
function compReceipt(
  r: MorphogenesisOrganizationalCompensationReceiptV7,
  op: AgentPlatID,
  p: PlanningDigestV1,
  s: PlanningDigestV1,
  t: number,
) {
  const { receiptDigest, ...b } = r;
  if (
    r.operationId !== op ||
    r.planDigest !== p ||
    r.stepReceiptDigest !== s ||
    r.compensatedAtLogicalMs !== t ||
    receiptDigest !==
      digest("morphogenesis-organizational-compensation-receipt-v7", b)
  )
    fail("organizational compensation receipt invalid");
  return freeze(structuredClone(r));
}
function state(
  i: Omit<
    MorphogenesisOrganizationalExecutionStateV7,
    "schemaVersion" | "stateDigest"
  >,
) {
  const b = freeze({
    schemaVersion: 7 as const,
    ...i,
    plan: validateMorphogenesisOrganizationalEvolutionPlanV7(i.plan),
  });
  return freeze({
    ...b,
    stateDigest: digest("morphogenesis-organizational-execution-state-v7", b),
  });
}
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u,
  SHA = /^sha256:[0-9a-f]{64}$/u;
function id(v: unknown) {
  if (typeof v !== "string" || !ID.test(v))
    fail("organizational runtime ID invalid");
  return v as AgentPlatID;
}
function sha(v: unknown) {
  if (typeof v !== "string" || !SHA.test(v))
    fail("organizational runtime digest invalid");
  return v as PlanningDigestV1;
}
function nonneg(v: unknown) {
  if (!Number.isSafeInteger(v) || (v as number) < 0)
    fail("organizational runtime time invalid");
  return v as number;
}
function digest(d: string, v: unknown) {
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
