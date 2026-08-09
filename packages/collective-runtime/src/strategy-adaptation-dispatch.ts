import type { JsonValue } from "@agentplat/core";

import type {
  LocalStrategyAdaptationPortV1,
  LocalStrategyCatalogV1,
  LocalStrategyDefinitionV1,
  LocalStrategyOperationV1,
  LocalStrategySelectionDecisionV1,
  LocalStrategySelectionRequestV1,
} from "./strategy-adaptation-contracts.js";
import {
  validateLocalStrategyCatalogV1,
  validateLocalStrategyDefinitionV1,
  validateLocalStrategySelectionDecisionV1,
  validateLocalStrategySelectionRequestV1,
} from "./strategy-adaptation-runtime.js";

export interface LocalStrategyImplementationV1 {
  readonly definition: LocalStrategyDefinitionV1;
  execute(input: {
    readonly operation: LocalStrategyOperationV1;
    readonly request: LocalStrategySelectionRequestV1;
    readonly input: JsonValue;
  }): Promise<JsonValue>;
}

export type LocalStrategyDispatchResultV1 =
  | {
      readonly status: "abstained";
      readonly decision: LocalStrategySelectionDecisionV1;
      readonly result: null;
    }
  | {
      readonly status: "executed";
      readonly decision: LocalStrategySelectionDecisionV1;
      readonly result: JsonValue;
    };

/**
 * Executes only immutable, catalog-bound local strategy implementations. The
 * decision remains subject to every downstream planning and authority check.
 */
export class LocalStrategyDispatcherV1 {
  readonly #adaptation: LocalStrategyAdaptationPortV1;
  readonly #catalog: LocalStrategyCatalogV1;
  readonly #implementations: ReadonlyMap<string, LocalStrategyImplementationV1>;

  constructor(input: {
    readonly adaptation: LocalStrategyAdaptationPortV1;
    readonly catalog: LocalStrategyCatalogV1;
    readonly implementations: readonly LocalStrategyImplementationV1[];
  }) {
    if (!input.adaptation || typeof input.adaptation.select !== "function")
      throw new TypeError("strategy adaptation port is required");
    this.#catalog = validateLocalStrategyCatalogV1(input.catalog);
    if (input.adaptation.catalogDigest !== this.#catalog.catalogDigest)
      throw new TypeError("strategy dispatcher catalog binding is invalid");
    const implementations = new Map<string, LocalStrategyImplementationV1>();
    for (const implementation of input.implementations) {
      if (!implementation || typeof implementation.execute !== "function")
        throw new TypeError("strategy implementation is invalid");
      const definition = validateLocalStrategyDefinitionV1(
        implementation.definition,
      );
      const catalogDefinition = this.#catalog.strategies.find(
        ({ strategyId }) => strategyId === definition.strategyId,
      );
      if (
        !catalogDefinition ||
        catalogDefinition.strategyDigest !== definition.strategyDigest ||
        implementations.has(definition.strategyId)
      )
        throw new TypeError("strategy implementation binding is invalid");
      implementations.set(definition.strategyId, implementation);
    }
    if (implementations.size !== this.#catalog.strategies.length)
      throw new TypeError("strategy implementation coverage is incomplete");
    this.#adaptation = input.adaptation;
    this.#implementations = implementations;
  }

  dispatchPlanDecomposition(
    request: LocalStrategySelectionRequestV1,
    input: JsonValue,
  ): Promise<LocalStrategyDispatchResultV1> {
    return this.#dispatch("plan_decomposition", request, input);
  }

  dispatchOfferRouting(
    request: LocalStrategySelectionRequestV1,
    input: JsonValue,
  ): Promise<LocalStrategyDispatchResultV1> {
    return this.#dispatch("offer_routing", request, input);
  }

  dispatchBidSubmission(
    request: LocalStrategySelectionRequestV1,
    input: JsonValue,
  ): Promise<LocalStrategyDispatchResultV1> {
    return this.#dispatch("bid_submission", request, input);
  }

  dispatchAwardSelection(
    request: LocalStrategySelectionRequestV1,
    input: JsonValue,
  ): Promise<LocalStrategyDispatchResultV1> {
    return this.#dispatch("award_selection", request, input);
  }

  dispatchRecoverySelection(
    request: LocalStrategySelectionRequestV1,
    input: JsonValue,
  ): Promise<LocalStrategyDispatchResultV1> {
    return this.#dispatch("recovery_selection", request, input);
  }

  async #dispatch(
    operation: LocalStrategyOperationV1,
    requestValue: LocalStrategySelectionRequestV1,
    input: JsonValue,
  ): Promise<LocalStrategyDispatchResultV1> {
    const request = validateLocalStrategySelectionRequestV1(requestValue);
    if (request.operation !== operation)
      throw new TypeError("strategy dispatcher operation binding is invalid");
    const decision = validateLocalStrategySelectionDecisionV1(
      await this.#adaptation.select(request),
    );
    if (
      decision.requestDigest !== request.requestDigest ||
      decision.catalogDigest !== this.#catalog.catalogDigest
    )
      throw new TypeError("strategy dispatcher decision binding is invalid");
    if (decision.selectedStrategyId === null)
      return Object.freeze({ status: "abstained", decision, result: null });
    const implementation = this.#implementations.get(
      decision.selectedStrategyId,
    );
    if (
      !implementation ||
      !implementation.definition.operations.includes(operation) ||
      implementation.definition.strategyDigest !==
        decision.selectedStrategyDigest
    )
      throw new TypeError("selected strategy implementation is unavailable");
    const result = await implementation.execute({ operation, request, input });
    return Object.freeze({ status: "executed", decision, result });
  }
}
