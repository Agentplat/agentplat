import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";
export const MORPHOGENESIS_VERTICAL_STAGES_V1 = Object.freeze([
  "v1_lifecycle",
  "v2_topology",
  "v3_local_strategy",
  "v4_collective_intelligence",
  "v5_strategy_synthesis",
  "v6_agent_genesis",
  "v7_organizational_evolution",
  "v8_constitutional_continuity",
] as const);
export type MorphogenesisVerticalStageV1 =
  (typeof MORPHOGENESIS_VERTICAL_STAGES_V1)[number];
export interface MorphogenesisVerticalStageReceiptV1 {
  readonly schemaVersion: 1;
  readonly operationId: AgentPlatID;
  readonly stage: MorphogenesisVerticalStageV1;
  readonly inputDigest: PlanningDigestV1;
  readonly outputDigest: PlanningDigestV1;
  readonly appliedAtLogicalMs: number;
  readonly receiptDigest: PlanningDigestV1;
}
export interface MorphogenesisVerticalCompensationReceiptV1 {
  readonly schemaVersion: 1;
  readonly operationId: AgentPlatID;
  readonly stageReceiptDigest: PlanningDigestV1;
  readonly outputDigest: PlanningDigestV1;
  readonly compensatedAtLogicalMs: number;
  readonly receiptDigest: PlanningDigestV1;
}
export interface MorphogenesisVerticalStagePortV1 {
  execute(input: {
    readonly operationId: AgentPlatID;
    readonly stage: MorphogenesisVerticalStageV1;
    readonly inputDigest: PlanningDigestV1;
    readonly predecessorReceiptDigest: PlanningDigestV1 | null;
    readonly logicalTimeMs: number;
  }): Promise<MorphogenesisVerticalStageReceiptV1>;
  reconcile(input: {
    readonly operationId: AgentPlatID;
    readonly stage: MorphogenesisVerticalStageV1;
    readonly inputDigest: PlanningDigestV1;
    readonly predecessorReceiptDigest: PlanningDigestV1 | null;
    readonly logicalTimeMs: number;
  }): Promise<MorphogenesisVerticalStageReceiptV1>;
  compensate(input: {
    readonly operationId: AgentPlatID;
    readonly receipt: MorphogenesisVerticalStageReceiptV1;
    readonly logicalTimeMs: number;
    readonly reconcile: boolean;
  }): Promise<MorphogenesisVerticalCompensationReceiptV1>;
}
export interface MorphogenesisVerticalStateV1 {
  readonly schemaVersion: 1;
  readonly stateKey: AgentPlatID;
  readonly rootInputDigest: PlanningDigestV1;
  readonly status:
    "prepared" | "running" | "compensating" | "completed" | "rolled_back";
  readonly nextStageIndex: number;
  readonly pendingStage: MorphogenesisVerticalStageV1 | null;
  readonly receipts: readonly MorphogenesisVerticalStageReceiptV1[];
  readonly compensationReceipts: readonly MorphogenesisVerticalCompensationReceiptV1[];
  readonly failureEvidenceDigest: PlanningDigestV1 | null;
  readonly revision: number;
  readonly logicalTimeHighWaterMs: number;
  readonly predecessorStateDigest: PlanningDigestV1 | null;
  readonly stateDigest: PlanningDigestV1;
}
export interface MorphogenesisVerticalStoreV1 {
  load(key: AgentPlatID): Promise<MorphogenesisVerticalStateV1 | null>;
  save(input: {
    readonly state: MorphogenesisVerticalStateV1;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: PlanningDigestV1 | null;
  }): Promise<boolean>;
}
export class InMemoryMorphogenesisVerticalStoreV1 implements MorphogenesisVerticalStoreV1 {
  #m = new Map<string, MorphogenesisVerticalStateV1>();
  async load(k: AgentPlatID) {
    return this.#m.get(k) ?? null;
  }
  async save(i: {
    readonly state: MorphogenesisVerticalStateV1;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: PlanningDigestV1 | null;
  }) {
    const c = this.#m.get(i.state.stateKey);
    if (
      (c?.revision ?? null) !== i.expectedRevision ||
      (c?.stateDigest ?? null) !== i.expectedStateDigest
    )
      return false;
    const state = validateMorphogenesisVerticalStateV1(i.state);
    this.#m.set(state.stateKey, state);
    return true;
  }
}
export class MorphogenesisIntegrationVerticalRuntimeV1 {
  constructor(
    readonly options: {
      readonly store: MorphogenesisVerticalStoreV1;
      readonly ports: Readonly<
        Record<MorphogenesisVerticalStageV1, MorphogenesisVerticalStagePortV1>
      >;
      readonly maximumCommitAttempts: number;
    },
  ) {}
  async initialize(i: {
    readonly stateKey: AgentPlatID;
    readonly rootInputDigest: PlanningDigestV1;
    readonly logicalTimeMs: number;
  }) {
    const s = record({
      stateKey: id(i.stateKey),
      rootInputDigest: sha(i.rootInputDigest),
      status: "prepared",
      nextStageIndex: 0,
      pendingStage: null,
      receipts: [],
      compensationReceipts: [],
      failureEvidenceDigest: null,
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
    fail("Morphogenesis vertical initialization conflict");
  }
  async advance(i: {
    readonly stateKey: AgentPlatID;
    readonly logicalTimeMs: number;
  }) {
    let s = await this.required(i.stateKey);
    if (s.status === "completed" || s.status === "rolled_back") return s;
    if (s.status === "compensating") return this.compensate(i);
    const stage = MORPHOGENESIS_VERTICAL_STAGES_V1[s.nextStageIndex];
    if (!stage)
      return this.save(s, {
        status: "completed",
        pendingStage: null,
        logicalTimeMs: i.logicalTimeMs,
      });
    const retry = s.pendingStage === stage,
      operationId = `${s.stateKey}:${stage}` as AgentPlatID,
      inputDigest = s.receipts.at(-1)?.outputDigest ?? s.rootInputDigest,
      predecessorReceiptDigest = s.receipts.at(-1)?.receiptDigest ?? null;
    if (!retry)
      s = await this.save(s, {
        status: "running",
        pendingStage: stage,
        logicalTimeMs: i.logicalTimeMs,
      });
    const raw = await (retry
      ? this.options.ports[stage].reconcile({
          operationId,
          stage,
          inputDigest,
          predecessorReceiptDigest,
          logicalTimeMs: i.logicalTimeMs,
        })
      : this.options.ports[stage].execute({
          operationId,
          stage,
          inputDigest,
          predecessorReceiptDigest,
          logicalTimeMs: i.logicalTimeMs,
        }));
    const receipt = validateStageReceipt(raw, {
      operationId,
      stage,
      inputDigest,
      logicalTimeMs: i.logicalTimeMs,
      reconcile: retry,
    });
    return this.save(s, {
      status: "prepared",
      pendingStage: null,
      nextStageIndex: s.nextStageIndex + 1,
      receipts: [...s.receipts, receipt],
      logicalTimeMs: i.logicalTimeMs,
    });
  }
  async fail(i: {
    readonly stateKey: AgentPlatID;
    readonly failureEvidenceDigest: PlanningDigestV1;
    readonly logicalTimeMs: number;
  }) {
    const s = await this.required(i.stateKey);
    return this.save(s, {
      status: "compensating",
      pendingStage: null,
      failureEvidenceDigest: sha(i.failureEvidenceDigest),
      logicalTimeMs: i.logicalTimeMs,
    });
  }
  async compensate(i: {
    readonly stateKey: AgentPlatID;
    readonly logicalTimeMs: number;
  }) {
    let s = await this.required(i.stateKey);
    if (s.status !== "compensating")
      fail("Morphogenesis vertical compensation unavailable");
    const done = new Set(
        s.compensationReceipts.map((x) => x.stageReceiptDigest),
      ),
      receipt = [...s.receipts]
        .reverse()
        .find((x) => !done.has(x.receiptDigest));
    if (!receipt)
      return this.save(s, {
        status: "rolled_back",
        pendingStage: null,
        logicalTimeMs: i.logicalTimeMs,
      });
    const stage = receipt.stage,
      operationId = `${s.stateKey}:${stage}:compensate` as AgentPlatID,
      reconcile = s.pendingStage === stage;
    if (!reconcile)
      s = await this.save(s, {
        pendingStage: stage,
        logicalTimeMs: i.logicalTimeMs,
      });
    const out = await this.options.ports[stage].compensate({
      operationId,
      receipt,
      logicalTimeMs: i.logicalTimeMs,
      reconcile,
    });
    const validated = validateCompensation(
      out,
      operationId,
      receipt.receiptDigest,
      i.logicalTimeMs,
    );
    return this.save(s, {
      pendingStage: null,
      compensationReceipts: [...s.compensationReceipts, validated],
      logicalTimeMs: i.logicalTimeMs,
    });
  }
  async required(k: AgentPlatID) {
    const s = await this.options.store.load(k);
    if (!s) fail("Morphogenesis vertical state unavailable");
    return s;
  }
  async save(s: MorphogenesisVerticalStateV1, c: Partial<Pick<
    MorphogenesisVerticalStateV1, "status" | "nextStageIndex" | "pendingStage" |
      "receipts" | "compensationReceipts" | "failureEvidenceDigest">> &
      { readonly logicalTimeMs: number }) {
    for (let n = 0; n < this.options.maximumCommitAttempts; n++) {
      const { logicalTimeMs, ...changes } = c;
      const { schemaVersion: _schema, stateDigest: _stateDigest, ...prior } = s;
      const q = record({
        ...prior,
        ...changes,
        revision: s.revision + 1,
        logicalTimeHighWaterMs: logicalTimeMs,
        predecessorStateDigest: s.stateDigest,
      });
      if (
        await this.options.store.save({
          state: q,
          expectedRevision: s.revision,
          expectedStateDigest: s.stateDigest,
        })
      )
        return q;
      s = await this.required(s.stateKey);
    }
    fail("Morphogenesis vertical CAS exhausted");
  }
}
function validateStageReceipt(
  r: MorphogenesisVerticalStageReceiptV1,
  i: {
    readonly operationId: AgentPlatID;
    readonly stage: MorphogenesisVerticalStageV1;
    readonly inputDigest: PlanningDigestV1;
    readonly logicalTimeMs: number;
    readonly reconcile: boolean;
  },
) {
  const { receiptDigest, ...b } = r;
  if (
    r.operationId !== i.operationId ||
    r.stage !== i.stage ||
    r.inputDigest !== i.inputDigest ||
    (i.reconcile
      ? r.appliedAtLogicalMs > i.logicalTimeMs
      : r.appliedAtLogicalMs !== i.logicalTimeMs) ||
    receiptDigest !== dg("morphogenesis-vertical-stage-receipt-v1", b)
  )
    fail("Morphogenesis vertical receipt invalid");
  return Object.freeze(structuredClone(r));
}
function validateCompensation(
  r: MorphogenesisVerticalCompensationReceiptV1,
  op: AgentPlatID,
  receipt: PlanningDigestV1,
  time: number,
) {
  const { receiptDigest, ...b } = r;
  if (
    r.operationId !== op ||
    r.stageReceiptDigest !== receipt ||
    r.compensatedAtLogicalMs !== time ||
    receiptDigest !== dg("morphogenesis-vertical-compensation-receipt-v1", b)
  )
    fail("Morphogenesis vertical compensation invalid");
  return Object.freeze(structuredClone(r));
}
export function validateMorphogenesisVerticalStateV1(value: MorphogenesisVerticalStateV1) {
  const stageSet = new Set(MORPHOGENESIS_VERTICAL_STAGES_V1);
  if (value.schemaVersion !== 1 || value.nextStageIndex < 0 ||
      value.nextStageIndex > MORPHOGENESIS_VERTICAL_STAGES_V1.length ||
      (value.pendingStage !== null && !stageSet.has(value.pendingStage)))
    fail("Morphogenesis vertical state coordinates invalid");
  for (const receipt of value.receipts) {
    const { receiptDigest, ...body } = receipt;
    if (!stageSet.has(receipt.stage) || receiptDigest !== dg(
      "morphogenesis-vertical-stage-receipt-v1", body))
      fail("Morphogenesis vertical retained receipt invalid");
  }
  for (const receipt of value.compensationReceipts) {
    const { receiptDigest, ...body } = receipt;
    if (receiptDigest !== dg("morphogenesis-vertical-compensation-receipt-v1", body))
      fail("Morphogenesis vertical retained compensation invalid");
  }
  const { stateDigest, ...body } = value;
  if (stateDigest !== dg("morphogenesis-vertical-state-v1", body))
    fail("Morphogenesis vertical state digest invalid");
  return Object.freeze(structuredClone(value));
}
function record(
  i: Omit<MorphogenesisVerticalStateV1, "schemaVersion" | "stateDigest">,
) {
  const b = Object.freeze({ schemaVersion: 1 as const, ...i });
  return Object.freeze({
    ...b,
    stateDigest: dg("morphogenesis-vertical-state-v1", b),
  });
}
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u,
  SHA = /^sha256:[0-9a-f]{64}$/u;
function id(v: unknown) {
  if (typeof v !== "string" || !ID.test(v)) fail("vertical ID invalid");
  return v as AgentPlatID;
}
function sha(v: unknown) {
  if (typeof v !== "string" || !SHA.test(v)) fail("vertical digest invalid");
  return v as PlanningDigestV1;
}
function nn(v: unknown) {
  if (!Number.isSafeInteger(v) || (v as number) < 0)
    fail("vertical time invalid");
  return v as number;
}
function dg(d: string, v: unknown) {
  return digestPlanningJsonV1(d as never, v as PlanningJson);
}
function fail(m: string): never {
  throw new TypeError(m);
}
