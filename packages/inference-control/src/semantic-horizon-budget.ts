import type { JsonValue } from "@agentplat/core";

import {
  validateSemanticHorizonDecisionV1,
  type AnytimeSemanticGuaranteeV1,
  type SemanticHorizonDecisionV1,
} from "./anytime-semantic-guarantees.js";
import { digestControlJsonV1 } from "./canonical.js";
import {
  assertDigest,
  assertIdentifier,
  compareCodeUnits,
  deepFreeze,
} from "./validation.js";

export const SEMANTIC_HORIZON_BUDGET_STATE_FORMAT_V1 =
  "agentplat.inference-control.semantic-horizon-budget-state.v1" as const;

/**
 * Durable, hash-chained account of an actionable semantic horizon. A null
 * remainingSteps value means that the latest accepted decision is unbounded.
 */
export interface SemanticHorizonBudgetStateV1 {
  readonly format: typeof SEMANTIC_HORIZON_BUDGET_STATE_FORMAT_V1;
  readonly schemaVersion: 1;
  readonly stateKey: string;
  readonly revision: number;
  readonly guaranteeStateDigest: string;
  readonly guaranteeSequence: number;
  readonly guaranteeLogicalTimeMs: number;
  readonly policyDigest: string;
  readonly assumptionsDigest: string;
  readonly controlPolicyDigest: string;
  readonly directive: SemanticHorizonDecisionV1["directive"];
  readonly decisionBindingDigest: string;
  readonly remainingSteps: number | null;
  /** Monotonic epoch advanced only when a new guarantee is accepted. */
  readonly consumptionEpoch: number;
  /** Number of old-window tombstones committed to the accumulator. */
  readonly compactedConsumptionCount: number;
  /** Hash-chain accumulator for compacted tombstones; null before compaction. */
  readonly compactedConsumptionDigest: string | null;
  readonly consumptions: readonly SemanticHorizonBudgetConsumptionV1[];
  readonly predecessorStateDigest: string | null;
  readonly stateDigest: string;
}

export interface SemanticHorizonBudgetConsumptionV1 {
  readonly epoch: number;
  readonly consumptionIdDigest: string;
  readonly bindingDigest: string;
}

export interface SemanticHorizonBudgetConsumptionInputV1 {
  readonly consumptionId: string;
  readonly bindingDigest: string;
}

/**
 * Persistence boundary for horizon budgets. Implementations must serialize
 * compareAndSet per stateKey and retain committed state across runtime restarts.
 */
export interface SemanticHorizonBudgetStoreV1 {
  load(stateKey: string): Promise<SemanticHorizonBudgetStateV1 | null>;
  compareAndSet(input: {
    readonly stateKey: string;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: string | null;
    readonly next: SemanticHorizonBudgetStateV1;
  }): Promise<boolean>;
}

export interface SemanticHorizonBudgetAnchorV1 {
  readonly revision: number;
  readonly stateDigest: string;
}

/** Independent monotonic witness used to detect state rollback or deletion. */
export interface SemanticHorizonBudgetMonotonicAnchorStoreV1 {
  readAnchor(stateKey: string): Promise<SemanticHorizonBudgetAnchorV1 | null>;
  compareAndSetAnchor(input: {
    readonly stateKey: string;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: string | null;
    readonly next: SemanticHorizonBudgetAnchorV1;
  }): Promise<boolean>;
}

/** In-process repository useful for tests and same-process reconstruction. */
export class InMemorySemanticHorizonBudgetStoreV1 implements SemanticHorizonBudgetStoreV1 {
  readonly #states = new Map<string, SemanticHorizonBudgetStateV1>();

  async load(stateKey: string): Promise<SemanticHorizonBudgetStateV1 | null> {
    assertIdentifier(stateKey, "semanticHorizonBudget.stateKey");
    return this.#states.get(stateKey) ?? null;
  }

  async compareAndSet(input: {
    readonly stateKey: string;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: string | null;
    readonly next: SemanticHorizonBudgetStateV1;
  }): Promise<boolean> {
    assertIdentifier(input.stateKey, "semanticHorizonBudget.stateKey");
    const current = this.#states.get(input.stateKey) ?? null;
    if (
      (current?.revision ?? null) !== input.expectedRevision ||
      (current?.stateDigest ?? null) !== input.expectedStateDigest
    )
      return false;
    const next = validateSemanticHorizonBudgetStateV1(input.next);
    if (
      next.stateKey !== input.stateKey ||
      next.revision !== (current?.revision ?? 0) + 1 ||
      next.predecessorStateDigest !== (current?.stateDigest ?? null)
    )
      throw new TypeError("semantic_horizon_budget_cas_transition_invalid");
    this.#states.set(input.stateKey, next);
    return true;
  }
}

/** Separate same-process monotonic witness for restart and rollback tests. */
export class InMemorySemanticHorizonBudgetMonotonicAnchorV1 implements SemanticHorizonBudgetMonotonicAnchorStoreV1 {
  readonly #anchors = new Map<string, SemanticHorizonBudgetAnchorV1>();

  async readAnchor(
    stateKey: string,
  ): Promise<SemanticHorizonBudgetAnchorV1 | null> {
    assertIdentifier(stateKey, "semanticHorizonBudget.anchor.stateKey");
    return this.#anchors.get(stateKey) ?? null;
  }

  async compareAndSetAnchor(input: {
    readonly stateKey: string;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: string | null;
    readonly next: SemanticHorizonBudgetAnchorV1;
  }): Promise<boolean> {
    assertIdentifier(input.stateKey, "semanticHorizonBudget.anchor.stateKey");
    const prior = this.#anchors.get(input.stateKey) ?? null;
    if (
      (prior?.revision ?? null) !== input.expectedRevision ||
      (prior?.stateDigest ?? null) !== input.expectedStateDigest
    )
      return false;
    integer(
      input.next.revision,
      "semanticHorizonBudget.anchor.revision",
      1,
      Number.MAX_SAFE_INTEGER,
    );
    assertDigest(
      input.next.stateDigest,
      "semanticHorizonBudget.anchor.stateDigest",
    );
    if (input.next.revision !== (prior?.revision ?? 0) + 1)
      throw new TypeError("semantic_horizon_budget_anchor_transition_invalid");
    this.#anchors.set(input.stateKey, deepFreeze({ ...input.next }));
    return true;
  }
}

export interface SemanticHorizonBudgetLedgerOptionsV1 {
  readonly stateKey: string;
  readonly store: SemanticHorizonBudgetStoreV1;
  readonly monotonicAnchor?: SemanticHorizonBudgetMonotonicAnchorStoreV1;
  readonly maximumCasAttempts?: number;
  readonly maximumConsumptions?: number;
}

interface SemanticHorizonBudgetLedgerInvokersV1 {
  readonly current: () => Promise<SemanticHorizonBudgetStateV1 | null>;
  readonly apply: (
    guarantee: AnytimeSemanticGuaranteeV1,
    decision: SemanticHorizonDecisionV1,
  ) => Promise<SemanticHorizonBudgetStateV1>;
  readonly consume: (
    decision: SemanticHorizonDecisionV1,
    consumption: SemanticHorizonBudgetConsumptionInputV1,
  ) => Promise<boolean>;
  readonly reconcileConsumption: (
    consumption: SemanticHorizonBudgetConsumptionInputV1,
  ) => Promise<boolean>;
}

const semanticHorizonBudgetLedgerInvokersV1 = new WeakMap<
  object,
  SemanticHorizonBudgetLedgerInvokersV1
>();

/**
 * CAS-backed non-refilling horizon ledger. Re-applying the exact same
 * guarantee/decision binding preserves the already consumed remainder.
 */
export class SemanticHorizonBudgetLedgerV1 {
  readonly stateKey: string;
  readonly maximumCasAttempts: number;
  readonly maximumConsumptions: number;
  readonly #load: SemanticHorizonBudgetStoreV1["load"];
  readonly #compareAndSet: SemanticHorizonBudgetStoreV1["compareAndSet"];
  readonly #readAnchor: SemanticHorizonBudgetMonotonicAnchorStoreV1["readAnchor"];
  readonly #compareAndSetAnchor: SemanticHorizonBudgetMonotonicAnchorStoreV1["compareAndSetAnchor"];

  constructor(options: SemanticHorizonBudgetLedgerOptionsV1) {
    assertIdentifier(options.stateKey, "semanticHorizonBudget.stateKey");
    const load = options.store?.load;
    const compareAndSet = options.store?.compareAndSet;
    if (typeof load !== "function" || typeof compareAndSet !== "function")
      throw new TypeError("semantic_horizon_budget_store_required");
    const monotonicAnchor =
      options.monotonicAnchor ??
      (options.store instanceof InMemorySemanticHorizonBudgetStoreV1
        ? new InMemorySemanticHorizonBudgetMonotonicAnchorV1()
        : undefined);
    if (!monotonicAnchor)
      throw new TypeError("semantic_horizon_budget_monotonic_anchor_required");
    const readAnchor = monotonicAnchor.readAnchor;
    const compareAndSetAnchor = monotonicAnchor.compareAndSetAnchor;
    if (
      typeof readAnchor !== "function" ||
      typeof compareAndSetAnchor !== "function"
    )
      throw new TypeError("semantic_horizon_budget_monotonic_anchor_required");
    const maximumCasAttempts = options.maximumCasAttempts ?? 8;
    const maximumConsumptions = options.maximumConsumptions ?? 4_096;
    integer(
      maximumCasAttempts,
      "semanticHorizonBudget.maximumCasAttempts",
      1,
      1_000,
    );
    integer(
      maximumConsumptions,
      "semanticHorizonBudget.maximumConsumptions",
      1,
      100_000,
    );
    this.stateKey = options.stateKey;
    this.maximumCasAttempts = maximumCasAttempts;
    this.maximumConsumptions = maximumConsumptions;
    this.#load = load.bind(options.store);
    this.#compareAndSet = compareAndSet.bind(options.store);
    this.#readAnchor = readAnchor.bind(monotonicAnchor);
    this.#compareAndSetAnchor = compareAndSetAnchor.bind(monotonicAnchor);
    const invokers: SemanticHorizonBudgetLedgerInvokersV1 = Object.freeze({
      current: () => this.#current(),
      apply: (
        guarantee: AnytimeSemanticGuaranteeV1,
        decision: SemanticHorizonDecisionV1,
      ) => this.#apply(guarantee, decision),
      consume: (
        decision: SemanticHorizonDecisionV1,
        consumption: SemanticHorizonBudgetConsumptionInputV1,
      ) => this.#consume(decision, consumption),
      reconcileConsumption: (
        consumption: SemanticHorizonBudgetConsumptionInputV1,
      ) => this.#reconcileConsumption(consumption),
    });
    semanticHorizonBudgetLedgerInvokersV1.set(this, invokers);
    Object.defineProperties(this, {
      current: immutableInvoker(invokers.current),
      apply: immutableInvoker(invokers.apply),
      consume: immutableInvoker(invokers.consume),
      reconcileConsumption: immutableInvoker(invokers.reconcileConsumption),
    });
    Object.freeze(this);
  }

  async current(): Promise<SemanticHorizonBudgetStateV1 | null> {
    return semanticHorizonBudgetInvokers(this).current();
  }

  async #current(): Promise<SemanticHorizonBudgetStateV1 | null> {
    const [stored, anchor] = await Promise.all([
      this.#load(this.stateKey),
      this.#readAnchor(this.stateKey),
    ]);
    const state =
      stored === null
        ? null
        : validateSemanticHorizonBudgetStateV1(stored, this.stateKey);
    if (state && !anchor && state.revision === 1) {
      if (state.predecessorStateDigest !== null)
        throw new TypeError("semantic_horizon_budget_state_anchor_mismatch");
      return this.#reconcileSuccessorAnchor(null, state);
    }
    if ((state === null) !== (anchor === null))
      throw new TypeError("semantic_horizon_budget_state_anchor_mismatch");
    if (anchor) {
      integer(
        anchor.revision,
        "semanticHorizonBudget.anchor.revision",
        1,
        Number.MAX_SAFE_INTEGER,
      );
      assertDigest(
        anchor.stateDigest,
        "semanticHorizonBudget.anchor.stateDigest",
      );
    }
    if (state && anchor) {
      if (
        state.revision === anchor.revision &&
        state.stateDigest === anchor.stateDigest
      )
        return state;
      if (
        state.revision === anchor.revision + 1 &&
        state.predecessorStateDigest === anchor.stateDigest
      )
        return this.#reconcileSuccessorAnchor(anchor, state);
      throw new TypeError("semantic_horizon_budget_state_below_anchor");
    }
    return state;
  }

  async #reconcileSuccessorAnchor(
    anchor: SemanticHorizonBudgetAnchorV1 | null,
    state: SemanticHorizonBudgetStateV1,
  ): Promise<SemanticHorizonBudgetStateV1> {
    const advanced = await this.#compareAndSetAnchor({
      stateKey: this.stateKey,
      expectedRevision: anchor?.revision ?? null,
      expectedStateDigest: anchor?.stateDigest ?? null,
      next: { revision: state.revision, stateDigest: state.stateDigest },
    });
    const currentAnchor = advanced
      ? { revision: state.revision, stateDigest: state.stateDigest }
      : await this.#readAnchor(this.stateKey);
    if (
      currentAnchor?.revision !== state.revision ||
      currentAnchor.stateDigest !== state.stateDigest
    )
      throw new TypeError(
        "semantic_horizon_budget_anchor_reconciliation_failed",
      );
    return state;
  }

  async apply(
    guarantee: AnytimeSemanticGuaranteeV1,
    decision: SemanticHorizonDecisionV1,
  ): Promise<SemanticHorizonBudgetStateV1> {
    return semanticHorizonBudgetInvokers(this).apply(guarantee, decision);
  }

  async #apply(
    guarantee: AnytimeSemanticGuaranteeV1,
    decision: SemanticHorizonDecisionV1,
  ): Promise<SemanticHorizonBudgetStateV1> {
    validateSemanticHorizonDecisionV1(decision, guarantee);
    const binding = decisionBinding(guarantee, decision);
    for (let attempt = 0; attempt < this.maximumCasAttempts; attempt += 1) {
      const prior = await this.#current();
      if (prior) {
        if (
          guarantee.throughSequence < prior.guaranteeSequence ||
          guarantee.throughLogicalTimeMs < prior.guaranteeLogicalTimeMs
        )
          throw new TypeError("semantic_horizon_budget_guarantee_rollback");
        if (
          guarantee.throughSequence === prior.guaranteeSequence &&
          guarantee.stateDigest !== prior.guaranteeStateDigest
        )
          throw new TypeError("semantic_horizon_budget_guarantee_equivocation");
        if (guarantee.stateDigest === prior.guaranteeStateDigest) {
          if (binding !== prior.decisionBindingDigest)
            throw new TypeError(
              "semantic_horizon_budget_decision_equivocation",
            );
          return prior;
        }
      }
      const next = createState({
        stateKey: this.stateKey,
        prior,
        guarantee,
        decision,
        decisionBindingDigest: binding,
        remainingSteps: nextRemaining(prior?.remainingSteps ?? null, decision),
        consumptionEpoch: (prior?.consumptionEpoch ?? 0) + 1,
        compactedConsumptionCount: prior?.compactedConsumptionCount ?? 0,
        compactedConsumptionDigest: prior?.compactedConsumptionDigest ?? null,
        consumptions: prior?.consumptions ?? [],
      });
      if (
        await this.#compareAndSet({
          stateKey: this.stateKey,
          expectedRevision: prior?.revision ?? null,
          expectedStateDigest: prior?.stateDigest ?? null,
          next,
        })
      )
        return this.#anchorAndRequireCommitted(prior, next);
    }
    throw new Error("semantic_horizon_budget_cas_retry_exhausted");
  }

  async consume(
    decision: SemanticHorizonDecisionV1,
    consumption: SemanticHorizonBudgetConsumptionInputV1,
  ): Promise<boolean> {
    return semanticHorizonBudgetInvokers(this).consume(decision, consumption);
  }

  /**
   * Reconciles the exact durable debit without advancing semantic state. An
   * absent tombstone after compaction is ambiguous and therefore fails closed.
   */
  async reconcileConsumption(
    consumption: SemanticHorizonBudgetConsumptionInputV1,
  ): Promise<boolean> {
    return semanticHorizonBudgetInvokers(this).reconcileConsumption(
      consumption,
    );
  }

  async #reconcileConsumption(
    consumption: SemanticHorizonBudgetConsumptionInputV1,
  ): Promise<boolean> {
    assertIdentifier(
      consumption?.consumptionId,
      "semanticHorizonBudget.consumptionId",
    );
    assertDigest(
      consumption?.bindingDigest,
      "semanticHorizonBudget.consumption.bindingDigest",
    );
    const prior = await this.#current();
    if (!prior) return false;
    const consumptionIdDigest = consumptionDigest(
      this.stateKey,
      consumption.consumptionId,
    );
    const existing = prior.consumptions.find(
      (item) => item.consumptionIdDigest === consumptionIdDigest,
    );
    if (existing) {
      if (existing.bindingDigest !== consumption.bindingDigest)
        throw new TypeError("semantic_horizon_budget_consumption_equivocation");
      return true;
    }
    if (prior.compactedConsumptionCount > 0)
      throw new RangeError(
        "semantic_horizon_budget_consumption_replay_window_compacted",
      );
    return false;
  }

  async #consume(
    decision: SemanticHorizonDecisionV1,
    consumption: SemanticHorizonBudgetConsumptionInputV1,
  ): Promise<boolean> {
    assertDigest(
      decision.guaranteeStateDigest,
      "semanticHorizonBudget.decision.guaranteeStateDigest",
    );
    assertIdentifier(
      consumption?.consumptionId,
      "semanticHorizonBudget.consumptionId",
    );
    assertDigest(
      consumption?.bindingDigest,
      "semanticHorizonBudget.consumption.bindingDigest",
    );
    const consumptionIdDigest = consumptionDigest(
      this.stateKey,
      consumption.consumptionId,
    );
    for (let attempt = 0; attempt < this.maximumCasAttempts; attempt += 1) {
      const prior = await this.#current();
      if (!prior) throw new TypeError("semantic_horizon_budget_state_required");
      const existing = prior.consumptions.find(
        (item) => item.consumptionIdDigest === consumptionIdDigest,
      );
      if (existing) {
        if (existing.bindingDigest !== consumption.bindingDigest)
          throw new TypeError(
            "semantic_horizon_budget_consumption_equivocation",
          );
        return true;
      }
      if (
        prior.guaranteeStateDigest !== decision.guaranteeStateDigest ||
        prior.decisionBindingDigest !== decisionBindingFromDecision(decision)
      )
        return false;
      if (prior.remainingSteps === 0) return false;
      let retained = prior.consumptions;
      let compactedConsumptionCount = prior.compactedConsumptionCount;
      let compactedConsumptionDigest = prior.compactedConsumptionDigest;
      if (retained.length >= this.maximumConsumptions) {
        const compactable = retained.filter(
          (item) => item.epoch < prior.consumptionEpoch,
        );
        if (compactable.length === 0)
          throw new RangeError(
            "semantic_horizon_budget_current_epoch_consumption_capacity",
          );
        retained = retained.filter(
          (item) => item.epoch === prior.consumptionEpoch,
        );
        compactedConsumptionDigest = digestControlJsonV1("state", {
          kind: "semantic_horizon_budget_consumption_compaction",
          stateKey: this.stateKey,
          epoch: prior.consumptionEpoch,
          previousDigest: compactedConsumptionDigest,
          previousCount: compactedConsumptionCount,
          entries: compactable,
        } as unknown as JsonValue);
        compactedConsumptionCount += compactable.length;
      }
      const consumptions = [
        ...retained,
        {
          epoch: prior.consumptionEpoch,
          consumptionIdDigest,
          bindingDigest: consumption.bindingDigest,
        },
      ].sort(compareConsumptions);
      const next = createStateFromPrior(
        prior,
        prior.remainingSteps === null ? null : prior.remainingSteps - 1,
        consumptions,
        compactedConsumptionCount,
        compactedConsumptionDigest,
      );
      if (
        await this.#compareAndSet({
          stateKey: this.stateKey,
          expectedRevision: prior.revision,
          expectedStateDigest: prior.stateDigest,
          next,
        })
      ) {
        await this.#anchorAndRequireCommitted(prior, next);
        return true;
      }
    }
    throw new Error("semantic_horizon_budget_cas_retry_exhausted");
  }

  async #anchorAndRequireCommitted(
    prior: SemanticHorizonBudgetStateV1 | null,
    expected: SemanticHorizonBudgetStateV1,
  ): Promise<SemanticHorizonBudgetStateV1> {
    const advanced = await this.#compareAndSetAnchor({
      stateKey: this.stateKey,
      expectedRevision: prior?.revision ?? null,
      expectedStateDigest: prior?.stateDigest ?? null,
      next: {
        revision: expected.revision,
        stateDigest: expected.stateDigest,
      },
    });
    if (!advanced) {
      const anchor = await this.#readAnchor(this.stateKey);
      if (
        anchor?.revision !== expected.revision ||
        anchor.stateDigest !== expected.stateDigest
      )
        throw new TypeError("semantic_horizon_budget_anchor_commit_failed");
    }
    const committed = await this.#current();
    if (!committed || committed.stateDigest !== expected.stateDigest)
      throw new TypeError("semantic_horizon_budget_commit_not_observable");
    return committed;
  }
}

/** Nominal check for the library-owned CAS ledger. */
export function isSemanticHorizonBudgetLedgerV1(
  value: unknown,
): value is SemanticHorizonBudgetLedgerV1 {
  return (
    typeof value === "object" &&
    value !== null &&
    semanticHorizonBudgetLedgerInvokersV1.has(value)
  );
}

function semanticHorizonBudgetInvokers(
  ledger: SemanticHorizonBudgetLedgerV1,
): SemanticHorizonBudgetLedgerInvokersV1 {
  const invokers =
    typeof ledger === "object" && ledger !== null
      ? semanticHorizonBudgetLedgerInvokersV1.get(ledger)
      : undefined;
  if (!invokers)
    throw new TypeError("concrete semantic horizon budget ledger is required");
  return invokers;
}

function immutableInvoker(value: unknown): PropertyDescriptor {
  return {
    value,
    writable: false,
    configurable: false,
    enumerable: false,
  };
}

export function validateSemanticHorizonBudgetStateV1(
  input: SemanticHorizonBudgetStateV1,
  expectedStateKey?: string,
): SemanticHorizonBudgetStateV1 {
  if (!input || typeof input !== "object")
    throw new TypeError("semantic_horizon_budget_state_invalid");
  const expectedKeys = [
    "assumptionsDigest",
    "compactedConsumptionCount",
    "compactedConsumptionDigest",
    "consumptionEpoch",
    "controlPolicyDigest",
    "consumptions",
    "decisionBindingDigest",
    "directive",
    "format",
    "guaranteeLogicalTimeMs",
    "guaranteeSequence",
    "guaranteeStateDigest",
    "policyDigest",
    "predecessorStateDigest",
    "remainingSteps",
    "revision",
    "schemaVersion",
    "stateDigest",
    "stateKey",
  ].sort();
  if (
    JSON.stringify(Object.keys(input).sort()) !== JSON.stringify(expectedKeys)
  )
    throw new TypeError("semantic_horizon_budget_state_schema_invalid");
  if (
    input.format !== SEMANTIC_HORIZON_BUDGET_STATE_FORMAT_V1 ||
    input.schemaVersion !== 1
  )
    throw new TypeError("semantic_horizon_budget_state_format_invalid");
  assertIdentifier(input.stateKey, "semanticHorizonBudget.stateKey");
  if (expectedStateKey !== undefined && input.stateKey !== expectedStateKey)
    throw new TypeError("semantic_horizon_budget_state_key_mismatch");
  integer(
    input.revision,
    "semanticHorizonBudget.revision",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  assertDigest(
    input.guaranteeStateDigest,
    "semanticHorizonBudget.guaranteeStateDigest",
  );
  integer(
    input.guaranteeSequence,
    "semanticHorizonBudget.guaranteeSequence",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  integer(
    input.guaranteeLogicalTimeMs,
    "semanticHorizonBudget.guaranteeLogicalTimeMs",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  assertDigest(input.policyDigest, "semanticHorizonBudget.policyDigest");
  assertDigest(
    input.assumptionsDigest,
    "semanticHorizonBudget.assumptionsDigest",
  );
  assertDigest(
    input.controlPolicyDigest,
    "semanticHorizonBudget.controlPolicyDigest",
  );
  assertDigest(
    input.decisionBindingDigest,
    "semanticHorizonBudget.decisionBindingDigest",
  );
  if (!isDirective(input.directive))
    throw new TypeError("semantic_horizon_budget_directive_invalid");
  if (input.remainingSteps !== null)
    integer(
      input.remainingSteps,
      "semanticHorizonBudget.remainingSteps",
      0,
      Number.MAX_SAFE_INTEGER,
    );
  if (
    (input.directive === "continue" && input.remainingSteps !== null) ||
    (input.directive === "shorten_horizon" && input.remainingSteps === null) ||
    ((input.directive === "replan" || input.directive === "safe_stop") &&
      input.remainingSteps !== 0)
  )
    throw new TypeError("semantic_horizon_budget_directive_remaining_invalid");
  integer(
    input.consumptionEpoch,
    "semanticHorizonBudget.consumptionEpoch",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  integer(
    input.compactedConsumptionCount,
    "semanticHorizonBudget.compactedConsumptionCount",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  if (
    (input.compactedConsumptionCount === 0) !==
    (input.compactedConsumptionDigest === null)
  )
    throw new TypeError(
      "semantic_horizon_budget_compaction_accumulator_invalid",
    );
  if (input.compactedConsumptionDigest !== null)
    assertDigest(
      input.compactedConsumptionDigest,
      "semanticHorizonBudget.compactedConsumptionDigest",
    );
  if (
    (input.revision === 1 && input.predecessorStateDigest !== null) ||
    (input.revision > 1 && input.predecessorStateDigest === null)
  )
    throw new TypeError("semantic_horizon_budget_predecessor_revision_invalid");
  if (input.predecessorStateDigest !== null)
    assertDigest(
      input.predecessorStateDigest,
      "semanticHorizonBudget.predecessorStateDigest",
    );
  if (!Array.isArray(input.consumptions))
    throw new TypeError("semantic_horizon_budget_consumptions_invalid");
  let previousConsumption: SemanticHorizonBudgetConsumptionV1 | null = null;
  for (const consumption of input.consumptions) {
    if (
      !consumption ||
      typeof consumption !== "object" ||
      JSON.stringify(Object.keys(consumption).sort()) !==
        JSON.stringify(["bindingDigest", "consumptionIdDigest", "epoch"])
    )
      throw new TypeError("semantic_horizon_budget_consumption_invalid");
    integer(
      consumption.epoch,
      "semanticHorizonBudget.consumption.epoch",
      1,
      input.consumptionEpoch,
    );
    assertDigest(
      consumption.consumptionIdDigest,
      "semanticHorizonBudget.consumptionIdDigest",
    );
    assertDigest(
      consumption.bindingDigest,
      "semanticHorizonBudget.consumption.bindingDigest",
    );
    if (
      previousConsumption &&
      compareConsumptions(previousConsumption, consumption) >= 0
    )
      throw new TypeError("semantic_horizon_budget_consumptions_not_canonical");
    previousConsumption = consumption;
  }
  assertDigest(input.stateDigest, "semanticHorizonBudget.stateDigest");
  const body = stateBody(input);
  if (
    input.stateDigest !==
    digestControlJsonV1("state", body as unknown as JsonValue)
  )
    throw new TypeError("semantic_horizon_budget_state_digest_invalid");
  return deepFreeze({ ...input });
}

function decisionBinding(
  guarantee: AnytimeSemanticGuaranteeV1,
  decision: SemanticHorizonDecisionV1,
): string {
  if (
    guarantee.stateDigest !== decision.guaranteeStateDigest ||
    guarantee.policyDigest !== decision.policyDigest ||
    guarantee.assumptionsDigest !== decision.assumptionsDigest
  )
    throw new TypeError("semantic_horizon_budget_decision_binding_invalid");
  return decisionBindingFromDecision(decision);
}

function decisionBindingFromDecision(
  decision: SemanticHorizonDecisionV1,
): string {
  const body = {
    bindingKind: "semantic_horizon_budget_decision" as const,
    schemaVersion: decision.schemaVersion,
    directive: decision.directive,
    recommendedHorizonSteps: decision.recommendedHorizonSteps,
    replanRequired: decision.replanRequired,
    reasonCodes: decision.reasonCodes,
    guaranteeStateDigest: decision.guaranteeStateDigest,
    policyDigest: decision.policyDigest,
    assumptionsDigest: decision.assumptionsDigest,
    controlPolicyDigest: decision.controlPolicyDigest,
  };
  return digestControlJsonV1("policy", body as unknown as JsonValue);
}

function nextRemaining(
  prior: number | null,
  decision: SemanticHorizonDecisionV1,
): number | null {
  if (decision.directive === "continue") return prior;
  if (decision.directive !== "shorten_horizon") return 0;
  return prior === null
    ? decision.recommendedHorizonSteps
    : Math.min(prior, decision.recommendedHorizonSteps);
}

function createState(input: {
  readonly stateKey: string;
  readonly prior: SemanticHorizonBudgetStateV1 | null;
  readonly guarantee: AnytimeSemanticGuaranteeV1;
  readonly decision: SemanticHorizonDecisionV1;
  readonly decisionBindingDigest: string;
  readonly remainingSteps: number | null;
  readonly consumptionEpoch: number;
  readonly compactedConsumptionCount: number;
  readonly compactedConsumptionDigest: string | null;
  readonly consumptions: readonly SemanticHorizonBudgetConsumptionV1[];
}): SemanticHorizonBudgetStateV1 {
  const body = {
    format: SEMANTIC_HORIZON_BUDGET_STATE_FORMAT_V1,
    schemaVersion: 1 as const,
    stateKey: input.stateKey,
    revision: (input.prior?.revision ?? 0) + 1,
    guaranteeStateDigest: input.guarantee.stateDigest,
    guaranteeSequence: input.guarantee.throughSequence,
    guaranteeLogicalTimeMs: input.guarantee.throughLogicalTimeMs,
    policyDigest: input.decision.policyDigest,
    assumptionsDigest: input.decision.assumptionsDigest,
    controlPolicyDigest: input.decision.controlPolicyDigest,
    directive: effectiveDirective(
      input.prior,
      input.decision,
      input.remainingSteps,
    ),
    decisionBindingDigest: input.decisionBindingDigest,
    remainingSteps: input.remainingSteps,
    consumptionEpoch: input.consumptionEpoch,
    compactedConsumptionCount: input.compactedConsumptionCount,
    compactedConsumptionDigest: input.compactedConsumptionDigest,
    consumptions: input.consumptions,
    predecessorStateDigest: input.prior?.stateDigest ?? null,
  };
  return deepFreeze({
    ...body,
    stateDigest: digestControlJsonV1("state", body as unknown as JsonValue),
  });
}

function createStateFromPrior(
  prior: SemanticHorizonBudgetStateV1,
  remainingSteps: number | null,
  consumptions: readonly SemanticHorizonBudgetConsumptionV1[],
  compactedConsumptionCount: number,
  compactedConsumptionDigest: string | null,
): SemanticHorizonBudgetStateV1 {
  const body = {
    ...stateBody(prior),
    revision: prior.revision + 1,
    remainingSteps,
    consumptions,
    compactedConsumptionCount,
    compactedConsumptionDigest,
    predecessorStateDigest: prior.stateDigest,
  };
  return deepFreeze({
    ...body,
    stateDigest: digestControlJsonV1("state", body as unknown as JsonValue),
  });
}

function stateBody(input: SemanticHorizonBudgetStateV1) {
  return {
    format: input.format,
    schemaVersion: input.schemaVersion,
    stateKey: input.stateKey,
    revision: input.revision,
    guaranteeStateDigest: input.guaranteeStateDigest,
    guaranteeSequence: input.guaranteeSequence,
    guaranteeLogicalTimeMs: input.guaranteeLogicalTimeMs,
    policyDigest: input.policyDigest,
    assumptionsDigest: input.assumptionsDigest,
    controlPolicyDigest: input.controlPolicyDigest,
    directive: input.directive,
    decisionBindingDigest: input.decisionBindingDigest,
    remainingSteps: input.remainingSteps,
    consumptionEpoch: input.consumptionEpoch,
    compactedConsumptionCount: input.compactedConsumptionCount,
    compactedConsumptionDigest: input.compactedConsumptionDigest,
    consumptions: input.consumptions,
    predecessorStateDigest: input.predecessorStateDigest,
  };
}

function compareConsumptions(
  left: SemanticHorizonBudgetConsumptionV1,
  right: SemanticHorizonBudgetConsumptionV1,
): number {
  return (
    left.epoch - right.epoch ||
    compareCodeUnits(left.consumptionIdDigest, right.consumptionIdDigest)
  );
}

function consumptionDigest(stateKey: string, consumptionId: string): string {
  return digestControlJsonV1("action", {
    kind: "semantic_horizon_budget_consumption",
    stateKey,
    consumptionId,
  });
}

function effectiveDirective(
  prior: SemanticHorizonBudgetStateV1 | null,
  decision: SemanticHorizonDecisionV1,
  remainingSteps: number | null,
): SemanticHorizonDecisionV1["directive"] {
  if (remainingSteps === null) return "continue";
  if (remainingSteps > 0) return "shorten_horizon";
  if (decision.directive === "safe_stop" || decision.directive === "replan")
    return decision.directive;
  if (
    prior?.remainingSteps === 0 &&
    (prior.directive === "safe_stop" || prior.directive === "replan")
  )
    return prior.directive;
  return "shorten_horizon";
}

function isDirective(
  value: unknown,
): value is SemanticHorizonDecisionV1["directive"] {
  return ["continue", "shorten_horizon", "replan", "safe_stop"].includes(
    value as string,
  );
}

function integer(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): void {
  if (!Number.isSafeInteger(value) || (value as number) < minimum)
    throw new RangeError(`${label}_invalid`);
  if ((value as number) > maximum) throw new RangeError(`${label}_invalid`);
}
