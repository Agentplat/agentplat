import { collectiveQuorumDigestV1 } from "@agentplat/collective-quorum/crypto";
import {
  AnytimeSemanticGuaranteeEngineV1,
  invokeAnytimeSemanticGuaranteeAppendV1,
  invokeSemanticHorizonControlV1,
  isAnytimeSemanticGuaranteeEngineV1,
  isSemanticHorizonControlV1,
  type SemanticHorizonControlPortV1,
} from "@agentplat/inference-control/semantic-guarantees";

import type { AssuranceSemanticHorizonPortV1 } from "./assurance-coupled-execution.js";

type SemanticHorizonEvaluationInputV1 = Parameters<
  AssuranceSemanticHorizonPortV1["evaluate"]
>[0];
type SemanticHorizonEvaluationResultV1 = Awaited<
  ReturnType<AssuranceSemanticHorizonPortV1["evaluate"]>
>;

const anytimeSemanticHorizonCouplingInvokersV1 = new WeakMap<
  object,
  (
    input: SemanticHorizonEvaluationInputV1,
  ) => Promise<SemanticHorizonEvaluationResultV1>
>();

/** Couples a time-uniform guarantee to an actionable planning horizon. */
export class AnytimeSemanticHorizonCouplingV1 implements AssuranceSemanticHorizonPortV1 {
  constructor(
    readonly options: {
      readonly guarantees: AnytimeSemanticGuaranteeEngineV1;
      readonly horizon: SemanticHorizonControlPortV1;
      readonly crypto?: Crypto;
    },
  ) {
    if (
      !isAnytimeSemanticGuaranteeEngineV1(options.guarantees) ||
      !isSemanticHorizonControlV1(options.horizon)
    )
      throw new TypeError(
        "concrete anytime semantic horizon coupling ports are required",
      );
    Object.defineProperty(this, "options", {
      value: Object.freeze({ ...options }),
      writable: false,
      configurable: false,
      enumerable: true,
    });
    anytimeSemanticHorizonCouplingInvokersV1.set(this, (input) =>
      this.#evaluate(input),
    );
  }

  async evaluate(
    input: SemanticHorizonEvaluationInputV1,
  ): Promise<SemanticHorizonEvaluationResultV1> {
    return invokeAnytimeSemanticHorizonCouplingV1(this, input);
  }

  async #evaluate(
    input: SemanticHorizonEvaluationInputV1,
  ): Promise<SemanticHorizonEvaluationResultV1> {
    const guarantee = await invokeAnytimeSemanticGuaranteeAppendV1(
      this.options.guarantees,
      {
        stateKey: input.stateKey,
        sample: {
          sequence: input.sequence,
          logicalTimeMs: input.logicalTimeMs,
          metrics: input.metrics,
          assessmentDigest: input.assessmentDigest,
        },
      },
    );
    const decision = invokeSemanticHorizonControlV1(
      this.options.horizon,
      guarantee,
    );
    const guaranteeDigest = await collectiveQuorumDigestV1(
      {
        domain: "anytime-semantic-guarantee-v1",
        body: guarantee,
      },
      this.options.crypto,
    );
    const decisionDigest = await collectiveQuorumDigestV1(
      {
        domain: "semantic-horizon-decision-v1",
        body: decision,
      },
      this.options.crypto,
    );
    return Object.freeze({
      guarantee,
      guaranteeDigest,
      decision,
      decisionDigest,
    });
  }
}

/** Nominal check for the reference time-uniform horizon coupling. */
export function isAnytimeSemanticHorizonCouplingV1(
  value: unknown,
): value is AnytimeSemanticHorizonCouplingV1 {
  return (
    typeof value === "object" &&
    value !== null &&
    anytimeSemanticHorizonCouplingInvokersV1.has(value)
  );
}

/** Evaluates the coupling through its construction-time private closure. */
export function invokeAnytimeSemanticHorizonCouplingV1(
  coupling: AnytimeSemanticHorizonCouplingV1,
  input: SemanticHorizonEvaluationInputV1,
): Promise<SemanticHorizonEvaluationResultV1> {
  const invoke =
    typeof coupling === "object" && coupling !== null
      ? anytimeSemanticHorizonCouplingInvokersV1.get(coupling)
      : undefined;
  if (!invoke)
    throw new TypeError(
      "concrete anytime semantic horizon coupling is required",
    );
  return invoke(input);
}
