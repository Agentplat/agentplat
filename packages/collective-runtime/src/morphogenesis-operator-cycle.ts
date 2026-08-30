import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";

import type { MorphologyHeadV1 } from "./morphogenesis-contracts.js";
import type { MorphogenesisOperatorExecutionStateV2 } from "./morphogenesis-operator-runtime.js";
import { MorphologyHeadRuntimeV1 } from "./morphogenesis-runtime.js";

export interface MorphogenesisOperatorOutcomeReceiptV2 {
  readonly schemaVersion: 2;
  readonly receiptId: AgentPlatID;
  readonly operatorExecutionStateDigest: PlanningDigestV1;
  readonly planDigest: PlanningDigestV1;
  readonly proposalDigest: PlanningDigestV1;
  readonly decisionDigest: PlanningDigestV1;
  readonly authorizationDigest: PlanningDigestV1;
  readonly authorityFenceDigest: PlanningDigestV1;
  readonly stepReceiptRoot: PlanningDigestV1;
  readonly disposition:
    | "success"
    | "partial_success"
    | "failure"
    | "indeterminate"
    | "successor_recovery_required";
  readonly outcomeEvidenceDigests: readonly PlanningDigestV1[];
  readonly resultingSnapshotDigest: PlanningDigestV1;
  readonly resultingMorphologyEpoch: number;
  readonly evaluatedAtLogicalMs: number;
  readonly receiptDigest: PlanningDigestV1;
}

export interface MorphogenesisOperatorEvaluationPortV2 {
  evaluate(input: {
    readonly execution: MorphogenesisOperatorExecutionStateV2;
    readonly logicalTimeMs: number;
  }): Promise<{
    readonly disposition: MorphogenesisOperatorOutcomeReceiptV2["disposition"];
    readonly outcomeEvidenceDigests: readonly PlanningDigestV1[];
  }>;
}

export interface MorphogenesisOperatorOutcomeStoreV2 {
  load(planDigest: PlanningDigestV1): Promise<MorphogenesisOperatorOutcomeReceiptV2 | null>;
  save(receipt: MorphogenesisOperatorOutcomeReceiptV2): Promise<boolean>;
}

export class InMemoryMorphogenesisOperatorOutcomeStoreV2
  implements MorphogenesisOperatorOutcomeStoreV2
{
  readonly #receipts = new Map<string, MorphogenesisOperatorOutcomeReceiptV2>();
  async load(planDigest: PlanningDigestV1) {
    const receipt = this.#receipts.get(planDigest);
    return receipt ? Object.freeze(structuredClone(receipt)) : null;
  }
  async save(receipt: MorphogenesisOperatorOutcomeReceiptV2) {
    const retained = this.#receipts.get(receipt.planDigest);
    if (retained) return retained.receiptDigest === receipt.receiptDigest;
    this.#receipts.set(receipt.planDigest, structuredClone(receipt));
    return true;
  }
}

export class MorphogenesisOperatorCycleRuntimeV2 {
  constructor(
    readonly options: {
      readonly morphology: MorphologyHeadRuntimeV1;
      readonly outcomes: MorphogenesisOperatorOutcomeStoreV2;
      readonly evaluation: MorphogenesisOperatorEvaluationPortV2;
    },
  ) {}

  async finalize(input: {
    readonly execution: MorphogenesisOperatorExecutionStateV2;
    readonly morphologyHeadStateKey: AgentPlatID;
    readonly resultingSnapshotDigest: PlanningDigestV1;
    readonly logicalTimeMs: number;
  }): Promise<{
    readonly receipt: MorphogenesisOperatorOutcomeReceiptV2;
    readonly morphologyHead: MorphologyHeadV1;
  }> {
    if (input.execution.status !== "completed")
      throw new TypeError("Morphogenesis operator execution is not complete");
    let receipt = await this.options.outcomes.load(
      input.execution.plan.planDigest,
    );
    if (!receipt) {
      const evaluation = await this.options.evaluation.evaluate({
        execution: input.execution,
        logicalTimeMs: input.logicalTimeMs,
      });
      receipt = createMorphogenesisOperatorOutcomeReceiptV2({
        receiptId: `${input.execution.plan.planId}:outcome`,
        operatorExecutionStateDigest: input.execution.stateDigest,
        planDigest: input.execution.plan.planDigest,
        proposalDigest: input.execution.proposalDigest,
        decisionDigest: input.execution.decisionDigest,
        authorizationDigest: input.execution.authorizationDigest,
        authorityFenceDigest: input.execution.authorityFenceDigest,
        stepReceiptRoot: digest(
          "morphogenesis-operator-step-receipt-root-v2",
          input.execution.receipts.map(({ receiptDigest }) => receiptDigest),
        ),
        disposition: evaluation.disposition,
        outcomeEvidenceDigests: evaluation.outcomeEvidenceDigests,
        resultingSnapshotDigest: input.resultingSnapshotDigest,
        resultingMorphologyEpoch:
          input.execution.expectedMorphologyEpoch + 1,
        evaluatedAtLogicalMs: input.logicalTimeMs,
      });
      if (!(await this.options.outcomes.save(receipt)))
        throw new Error("Morphogenesis operator outcome conflicts");
    } else if (
      receipt.operatorExecutionStateDigest !== input.execution.stateDigest ||
      receipt.resultingSnapshotDigest !== input.resultingSnapshotDigest
    ) {
      throw new Error("Morphogenesis operator outcome replay diverged");
    }
    const morphologyHead = await this.options.morphology.commit({
      stateKey: input.morphologyHeadStateKey,
      scopeDigest: input.execution.scopeDigest,
      policyDigest: input.execution.plan.policyDigest,
      expectedMorphologyEpoch: input.execution.expectedMorphologyEpoch,
      snapshotDigest: receipt.resultingSnapshotDigest,
      proposalDigest: receipt.proposalDigest,
      decisionDigest: receipt.decisionDigest,
      receiptDigest: receipt.receiptDigest,
      logicalTimeMs: input.logicalTimeMs,
    });
    return Object.freeze({ receipt, morphologyHead });
  }
}

export function createMorphogenesisOperatorOutcomeReceiptV2(
  input: Omit<MorphogenesisOperatorOutcomeReceiptV2, "schemaVersion" | "receiptDigest">,
): MorphogenesisOperatorOutcomeReceiptV2 {
  const evidence = [...new Set(input.outcomeEvidenceDigests.map(sha))].sort();
  if (evidence.length < 1 || evidence.length > 256)
    throw new TypeError("Morphogenesis operator outcome evidence is invalid");
  if (!new Set(["success", "partial_success", "failure", "indeterminate", "successor_recovery_required"]).has(input.disposition))
    throw new TypeError("Morphogenesis operator outcome disposition is invalid");
  const body = Object.freeze({
    schemaVersion: 2 as const,
    receiptId: id(input.receiptId),
    operatorExecutionStateDigest: sha(input.operatorExecutionStateDigest),
    planDigest: sha(input.planDigest),
    proposalDigest: sha(input.proposalDigest),
    decisionDigest: sha(input.decisionDigest),
    authorizationDigest: sha(input.authorizationDigest),
    authorityFenceDigest: sha(input.authorityFenceDigest),
    stepReceiptRoot: sha(input.stepReceiptRoot),
    disposition: input.disposition,
    outcomeEvidenceDigests: Object.freeze(evidence),
    resultingSnapshotDigest: sha(input.resultingSnapshotDigest),
    resultingMorphologyEpoch: positive(input.resultingMorphologyEpoch),
    evaluatedAtLogicalMs: nonNegative(input.evaluatedAtLogicalMs),
  });
  return Object.freeze({ ...body, receiptDigest: digest("morphogenesis-operator-outcome-receipt-v2", body) });
}

export function validateMorphogenesisOperatorOutcomeReceiptV2(
  input: unknown,
): MorphogenesisOperatorOutcomeReceiptV2 {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new TypeError("Morphogenesis operator outcome receipt is invalid");
  const value = input as MorphogenesisOperatorOutcomeReceiptV2;
  const { schemaVersion: _schema, receiptDigest: _digest, ...body } = value;
  const result = createMorphogenesisOperatorOutcomeReceiptV2(body);
  if (value.schemaVersion !== 2 || JSON.stringify(value) !== JSON.stringify(result))
    throw new TypeError("Morphogenesis operator outcome receipt is invalid");
  return result;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u; const SHA = /^sha256:[0-9a-f]{64}$/u;
function id(value: unknown): AgentPlatID { if (typeof value !== "string" || !ID.test(value)) throw new TypeError("Morphogenesis operator outcome ID is invalid"); return value as AgentPlatID; } function sha(value: unknown): PlanningDigestV1 { if (typeof value !== "string" || !SHA.test(value)) throw new TypeError("Morphogenesis operator outcome digest is invalid"); return value as PlanningDigestV1; } function positive(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) < 1) throw new TypeError("Morphogenesis operator outcome epoch is invalid"); return value as number; } function nonNegative(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) < 0) throw new TypeError("Morphogenesis operator outcome time is invalid"); return value as number; } function digest(domain: string, value: unknown): PlanningDigestV1 { return digestPlanningJsonV1(domain as never, value as PlanningJson); }
