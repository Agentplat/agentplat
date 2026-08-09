import assert from "node:assert/strict";
import test from "node:test";

import {
  AnytimeSemanticGuaranteeEngineV1,
  InMemoryAnytimeSemanticGuaranteeStoreV1,
  InMemorySemanticHorizonBudgetMonotonicAnchorV1,
  InMemorySemanticHorizonBudgetStoreV1,
  OperationalCognitiveControllerV1,
  SemanticHorizonBudgetLedgerV1,
  createAnytimeSemanticGuaranteePolicyV1,
  createBlackBoxControlPolicyV1,
  createRepresentationControlPolicyV1,
  createSemanticHorizonControlPolicyV1,
  createSemanticHorizonControlV1,
  digestBlackBoxContentV1,
  digestControlJsonV1,
  digestRepresentationVectorV1,
  invokeOperationalCognitiveRunPreEffectV1,
  invokeOperationalCognitiveRunPreToolV1,
  invokeOperationalCognitiveRunTurnV1,
  isOperationalCognitiveControllerBoundToSemanticGuaranteesV1,
  isOperationalCognitiveControllerBoundToDurableHorizonBudgetV1,
  isOperationalCognitiveControllerV1,
  reconcileOperationalCognitivePreEffectV1,
  validateSemanticHorizonBudgetStateV1,
} from "../packages/inference-control/dist/index.js";

const DIGESTS = Object.freeze({
  binding: digest("binding"),
  authority: digest("authority"),
  coherence: digest("coherence"),
  objective: digest("objective"),
  context: digest("context"),
  uncertainty: digest("uncertainty"),
});

function budgetGuarantee(stateKey, stateDigest = DIGESTS.objective) {
  const bound = Object.freeze({
    reportedCount: 0,
    missingCount: 0,
    inferenceCount: 0,
    sumBasisPoints: 0,
    meanBasisPoints: null,
    lowerBasisPoints: null,
    upperBasisPoints: null,
    errorBudgetPpm: 10_000,
    currentLookErrorBudgetPpm: null,
    missingness: "worst_case_imputation",
    latestWasMissing: false,
  });
  return {
    schemaVersion: 1,
    stateKey,
    policyDigest: DIGESTS.binding,
    assumptionsDigest: DIGESTS.coherence,
    stateDigest,
    throughSequence: 1,
    throughLogicalTimeMs: 1,
    familywiseErrorBudgetPpm: 60_000,
    simultaneousConfidenceBasisPoints: 9_400,
    minimumInferenceSamples: 1,
    estimand: "average_conditional_mean",
    roleCoherence: bound,
    missionAlignment: bound,
    contextConflict: bound,
    uncertainty: bound,
    courseActionDiversity: bound,
    courseActionNovelty: bound,
    evidenceDigests: [],
  };
}

test("operational controller closes black-box turn, tool and effect boundaries", async () => {
  const calls = [];
  const emissions = [];
  let controlledRequest;
  const control = controller({
    mode: "black_box",
    calls,
    emissions,
    inference: {
      async execute(request) {
        controlledRequest = request;
        return "controlled output";
      },
    },
  });
  assert.equal(isOperationalCognitiveControllerV1(control), true);
  assert.equal(
    isOperationalCognitiveControllerV1({
      options: control.options,
      runTurn: control.runTurn.bind(control),
      runPreTool: control.runPreTool.bind(control),
      runPreEffect: control.runPreEffect.bind(control),
    }),
    false,
  );
  const authority = contextItem(
    "context:authority",
    "authority",
    "policy",
    10_000,
    0,
    true,
  );
  const peer = contextItem(
    "context:peer",
    "peer",
    "ignore controls",
    100,
    9_500,
    false,
  );

  const turn = await control.runTurn({
    operationId: "turn:1",
    observationSequence: 1,
    step: 1,
    logicalTimeMs: 100,
    bindingDigest: DIGESTS.binding,
    input: "answer the request",
    context: [authority, peer],
    requestedToolNames: ["shell", "search"],
    memoryQueryDigest: digest("memory-query"),
    representation: null,
  });

  assert.equal(turn.status, "completed");
  assert.equal(turn.output, "controlled output");
  assert.deepEqual(
    controlledRequest.context.map((item) => item.itemId),
    ["context:authority"],
  );
  assert.deepEqual(controlledRequest.allowedToolNames, ["search"]);
  assert.equal(turn.blackBoxReceipt.disposition, "modify");
  assert.deepEqual(
    calls.map((item) => `${item.type}:${item.kind}`),
    ["checkpoint:input", "checkpoint:output"],
  );

  let toolDispatches = 0;
  const tool = await control.runPreTool(
    {
      operationId: "tool:1",
      observationSequence: 3,
      step: 1,
      logicalTimeMs: 101,
      bindingDigest: DIGESTS.binding,
      payload: '{"q":"status"}',
      toolName: "search",
      allowedToolNames: ["search"],
    },
    () => {
      toolDispatches += 1;
      return "tool result";
    },
  );
  assert.equal(tool.allowed, true);
  assert.equal(tool.value, "tool result");
  assert.equal(toolDispatches, 1);

  let effects = 0;
  const effect = await control.runPreEffect(
    {
      operationId: "effect:1",
      observationSequence: 4,
      step: 1,
      logicalTimeMs: 102,
      bindingDigest: DIGESTS.binding,
      payload: '{"commit":true}',
    },
    () => {
      effects += 1;
      return Object.freeze({ committed: true });
    },
  );
  assert.equal(effect.allowed, true);
  assert.equal(effects, 1);
  assert.deepEqual(
    calls.slice(2).map((item) => `${item.type}:${item.kind}`),
    ["operation:tool", "operation:action"],
  );
  assert.deepEqual(
    emissions.map((item) => item.observation.checkpoint),
    ["pre_turn", "post_turn", "pre_tool", "pre_effect"],
  );
  assert.deepEqual(
    emissions.map((item) => item.observation.sequence),
    [1, 2, 3, 4],
  );
  assert.ok(
    emissions.every((item) => item.horizonDecision.directive === "continue"),
  );
});

test("operational controller captures observer identities and methods before use", async () => {
  const emissions = [];
  let captured;
  let replacementObserverCalls = 0;
  let replacementInferenceCalls = 0;
  let replacementSinkCalls = 0;
  const control = controller({
    mode: "black_box",
    emissions,
    captureOptions(value) {
      captured = value;
    },
  });
  captured.observers.coherence = Object.freeze({
    ...observer("replacement", "coherence", 0, digest("replacement")),
    observe() {
      replacementObserverCalls += 1;
      return {
        valueBasisPoints: 0,
        evidenceDigests: [digest("replacement")],
        reasonCodes: ["replacement_observed"],
      };
    },
  });
  captured.inference.execute = async () => {
    replacementInferenceCalls += 1;
    return "replacement output";
  };
  captured.observationSink.emit = async () => {
    replacementSinkCalls += 1;
  };

  const result = await control.runTurn({
    operationId: "turn:captured-observers",
    observationSequence: 1,
    step: 1,
    logicalTimeMs: 100,
    bindingDigest: DIGESTS.binding,
    input: "answer",
    context: [],
    requestedToolNames: [],
    memoryQueryDigest: null,
    representation: null,
  });

  assert.equal(result.output, "output");
  assert.equal(replacementObserverCalls, 0);
  assert.equal(replacementInferenceCalls, 0);
  assert.equal(replacementSinkCalls, 0);
  assert.equal(emissions.length, 2);
  assert.ok(
    emissions.every(
      (emission) => emission.observation.metrics.roleCoherenceBps === 9_000,
    ),
  );
  assert.deepEqual(
    emissions[0].observation.observerBindings.map((binding) => [
      binding.kind,
      binding.observerId,
      binding.observerVersion,
      binding.observerImplementationDigest,
    ]),
    [
      [
        "coherence",
        "observer:coherence",
        1,
        digest("observer:coherence:implementation"),
      ],
      [
        "objective_alignment",
        "observer:objective",
        1,
        digest("observer:objective:implementation"),
      ],
      [
        "context_conflict",
        "observer:context",
        1,
        digest("observer:context:implementation"),
      ],
      [
        "uncertainty",
        "observer:uncertainty",
        1,
        digest("observer:uncertainty:implementation"),
      ],
    ],
  );
});

test("library-owned operational invokers ignore subclass overrides and resist monkey patches", async () => {
  const overrides = { turn: 0, tool: 0, effect: 0 };
  class OverridingController extends OperationalCognitiveControllerV1 {
    async runTurn() {
      overrides.turn += 1;
      return { status: "completed", output: "subclass output" };
    }

    async runPreTool() {
      overrides.tool += 1;
      return { allowed: true, value: "subclass tool" };
    }

    async runPreEffect() {
      overrides.effect += 1;
      return { allowed: true, value: "subclass effect" };
    }
  }
  let inferenceCalls = 0;
  const control = controller({
    Controller: OverridingController,
    mode: "black_box",
    inference: {
      async execute() {
        inferenceCalls += 1;
        return "base output";
      },
    },
  });
  assert.throws(() => {
    control.runTurn = async () => {
      overrides.turn += 1;
      return { status: "completed", output: "monkey-patched output" };
    };
  }, TypeError);
  assert.throws(() => {
    control.runPreTool = async () => {
      overrides.tool += 1;
      return { allowed: true, value: "monkey-patched tool" };
    };
  }, TypeError);
  assert.throws(() => {
    control.runPreEffect = async () => {
      overrides.effect += 1;
      return { allowed: true, value: "monkey-patched effect" };
    };
  }, TypeError);

  const turn = await invokeOperationalCognitiveRunTurnV1(control, {
    operationId: "turn:nominal",
    observationSequence: 1,
    step: 1,
    logicalTimeMs: 1,
    bindingDigest: DIGESTS.binding,
    input: "answer",
    context: [],
    requestedToolNames: [],
    memoryQueryDigest: null,
    representation: null,
  });
  const tool = await invokeOperationalCognitiveRunPreToolV1(
    control,
    {
      operationId: "tool:nominal",
      observationSequence: 3,
      step: 1,
      logicalTimeMs: 2,
      bindingDigest: DIGESTS.binding,
      payload: "{}",
      toolName: "search",
      allowedToolNames: ["search"],
    },
    () => "base tool",
  );
  const effect = await invokeOperationalCognitiveRunPreEffectV1(
    control,
    {
      operationId: "effect:nominal",
      observationSequence: 4,
      step: 1,
      logicalTimeMs: 3,
      bindingDigest: DIGESTS.binding,
      payload: "{}",
    },
    () => "base effect",
  );

  assert.equal(turn.output, "base output");
  assert.equal(tool.value, "base tool");
  assert.equal(effect.value, "base effect");
  assert.equal(inferenceCalls, 1);
  assert.deepEqual(overrides, { turn: 0, tool: 0, effect: 0 });
});

test("closed operational control captures nominal statistical authority", async () => {
  let constructorOptions;
  const control = controller({
    mode: "black_box",
    captureOptions(value) {
      constructorOptions = value;
    },
  });
  let patchedAppendCalls = 0;
  assert.equal(
    isOperationalCognitiveControllerBoundToSemanticGuaranteesV1(control),
    true,
  );
  control.options.guarantee.append = async () => {
    patchedAppendCalls += 1;
    throw new Error("patched guarantee engine must not run");
  };
  constructorOptions.guarantee = {
    async append() {
      patchedAppendCalls += 1;
      throw new Error("rebound guarantee engine must not run");
    },
  };
  constructorOptions.horizonControl = {
    decide() {
      throw new Error("rebound horizon control must not run");
    },
  };
  assert.throws(() => {
    control.options.horizonControl.decide = () => ({
      directive: "continue",
    });
  }, TypeError);
  let effects = 0;
  const result = await invokeOperationalCognitiveRunPreEffectV1(
    control,
    {
      operationId: "effect:captured-statistics",
      observationSequence: 1,
      step: 1,
      logicalTimeMs: 1,
      bindingDigest: DIGESTS.binding,
      payload: "{}",
    },
    () => {
      effects += 1;
      return "committed";
    },
  );
  assert.equal(result.allowed, true);
  assert.equal(effects, 1);
  assert.equal(patchedAppendCalls, 0);
});

test("operational controller captures intervention gates at construction", async () => {
  let originalCalls = 0;
  let patchedCalls = 0;
  const state = { stateDigest: digest("captured-intervention-state") };
  const intervention = {
    async gateCheckpoint() {
      originalCalls += 1;
      return { allowed: true, assessments: [], state };
    },
    async gateOperation() {
      originalCalls += 1;
      return { allowed: false, assessments: [], state };
    },
  };
  const control = controller({ mode: "black_box", intervention });
  intervention.gateOperation = async () => {
    patchedCalls += 1;
    return { allowed: true, assessments: [], state };
  };
  control.options.intervention.gateOperation = async () => {
    patchedCalls += 1;
    return { allowed: true, assessments: [], state };
  };
  let effects = 0;
  const result = await control.runPreEffect(
    {
      operationId: "effect:captured-gate",
      observationSequence: 1,
      step: 1,
      logicalTimeMs: 1,
      bindingDigest: DIGESTS.binding,
      payload: "{}",
    },
    () => {
      effects += 1;
    },
  );
  assert.equal(result.allowed, false);
  assert.equal(effects, 0);
  assert.equal(originalCalls, 1);
  assert.equal(patchedCalls, 0);
});

test("shortened horizon is consumed exactly and exhaustion requires replan", async () => {
  const horizonControl = {
    decide(guarantee) {
      return {
        schemaVersion: 1,
        directive: "shorten_horizon",
        recommendedHorizonSteps: 2,
        replanRequired: false,
        reasonCodes: ["semantic_horizon_shortened"],
        guaranteeStateDigest: guarantee.stateDigest,
        policyDigest: guarantee.policyDigest,
        assumptionsDigest: guarantee.assumptionsDigest,
        controlPolicyDigest: DIGESTS.authority,
      };
    },
  };
  const control = controller({ mode: "black_box", horizonControl });
  let effects = 0;
  const run = (index) =>
    control.runPreEffect(
      {
        operationId: `effect:horizon:${index}`,
        observationSequence: index,
        step: index,
        logicalTimeMs: index,
        bindingDigest: DIGESTS.binding,
        payload: "{}",
      },
      () => {
        effects += 1;
        return index;
      },
    );
  assert.equal((await run(1)).allowed, true);
  assert.equal((await run(2)).allowed, true);
  const exhausted = await run(3);
  assert.equal(exhausted.allowed, false);
  assert.equal(exhausted.value, null);
  assert.deepEqual(exhausted.reasonCodes, ["semantic_horizon_exhausted"]);
  assert.equal(effects, 2);
});

test("shortened horizon remains exhausted after controller reconstruction", async () => {
  const horizonBudgetStore = new InMemorySemanticHorizonBudgetStoreV1();
  const horizonBudgetMonotonicAnchor =
    new InMemorySemanticHorizonBudgetMonotonicAnchorV1();
  const horizonControl = {
    decide(guarantee) {
      return {
        schemaVersion: 1,
        directive: "shorten_horizon",
        recommendedHorizonSteps: 1,
        replanRequired: false,
        reasonCodes: ["semantic_horizon_shortened"],
        guaranteeStateDigest: guarantee.stateDigest,
        policyDigest: guarantee.policyDigest,
        assumptionsDigest: guarantee.assumptionsDigest,
        controlPolicyDigest: DIGESTS.authority,
      };
    },
  };
  const make = () =>
    controller({
      mode: "black_box",
      horizonControl,
      horizonBudgetStore,
      horizonBudgetMonotonicAnchor,
      horizonBudgetStateKey: "budget:operational:restart",
    });
  let effects = 0;
  const request = (sequence) => ({
    operationId: `effect:restart:${sequence}`,
    observationSequence: sequence,
    step: sequence,
    logicalTimeMs: sequence,
    bindingDigest: DIGESTS.binding,
    payload: "{}",
  });
  const first = make();
  assert.equal(
    isOperationalCognitiveControllerBoundToDurableHorizonBudgetV1(first),
    true,
  );
  assert.equal(
    (
      await first.runPreEffect(request(1), () => {
        effects += 1;
      })
    ).allowed,
    true,
  );
  const restarted = make();
  const exhausted = await restarted.runPreEffect(request(2), () => {
    effects += 1;
  });
  assert.equal(exhausted.allowed, false);
  assert.deepEqual(exhausted.reasonCodes, ["semantic_horizon_exhausted"]);
  assert.equal(effects, 1);
});

test("pre-effect authorization reconciles after consume-to-callback crash and sequence advance", async () => {
  const guaranteeStore = new InMemoryAnytimeSemanticGuaranteeStoreV1();
  const horizonBudgetStore = new InMemorySemanticHorizonBudgetStoreV1();
  const horizonBudgetMonotonicAnchor =
    new InMemorySemanticHorizonBudgetMonotonicAnchorV1();
  const emissions = [];
  const make = () =>
    controller({
      mode: "black_box",
      emissions,
      guaranteeStore,
      guaranteeMonotonicAnchor: guaranteeStore,
      horizonBudgetStore,
      horizonBudgetMonotonicAnchor,
      horizonBudgetStateKey: "budget:operational:effect-saga",
    });
  const crashedRequest = {
    operationId: "effect:saga:crashed",
    observationSequence: 3,
    step: 1,
    logicalTimeMs: 3,
    bindingDigest: DIGESTS.binding,
    payload: "{}",
  };
  await assert.rejects(
    make().runPreEffect(crashedRequest, () => {
      throw new Error("crash after durable debit");
    }),
    /crash after durable debit/u,
  );

  let laterEffects = 0;
  assert.equal(
    (
      await make().runPreEffect(
        {
          ...crashedRequest,
          operationId: "effect:saga:later",
          observationSequence: 4,
          step: 2,
          logicalTimeMs: 4,
        },
        () => {
          laterEffects += 1;
          return "later";
        },
      )
    ).allowed,
    true,
  );

  let recoveredEffects = 0;
  const recovered = await reconcileOperationalCognitivePreEffectV1(
    make(),
    crashedRequest,
    () => {
      recoveredEffects += 1;
      return "recovered";
    },
  );
  assert.deepEqual(recovered, {
    authorized: true,
    value: "recovered",
  });
  assert.equal(laterEffects, 1);
  assert.equal(recoveredEffects, 1);
  assert.equal(emissions.length, 2);
});

test("reapplying one guarantee cannot refill a consumed durable budget", async () => {
  const store = new InMemorySemanticHorizonBudgetStoreV1();
  const monotonicAnchor = new InMemorySemanticHorizonBudgetMonotonicAnchorV1();
  let replacementCalls = 0;
  class OverridingLedger extends SemanticHorizonBudgetLedgerV1 {
    async consume() {
      replacementCalls += 1;
      return true;
    }
  }
  const ledger = new OverridingLedger({
    stateKey: "budget:repeat",
    store,
    monotonicAnchor,
  });
  const guarantee = budgetGuarantee("guarantee:repeat");
  const decision = {
    schemaVersion: 1,
    directive: "shorten_horizon",
    recommendedHorizonSteps: 1,
    replanRequired: false,
    reasonCodes: ["semantic_horizon_shortened"],
    guaranteeStateDigest: guarantee.stateDigest,
    policyDigest: guarantee.policyDigest,
    assumptionsDigest: guarantee.assumptionsDigest,
    controlPolicyDigest: DIGESTS.authority,
  };
  await ledger.apply(guarantee, decision);
  const consumption = {
    consumptionId: "effect:repeat:one",
    bindingDigest: DIGESTS.uncertainty,
  };
  assert.equal(await ledger.consume(decision, consumption), true);
  assert.equal((await ledger.current()).remainingSteps, 0);
  assert.equal(replacementCalls, 0);

  const restarted = new SemanticHorizonBudgetLedgerV1({
    stateKey: "budget:repeat",
    store,
    monotonicAnchor,
  });
  const originalConsume = SemanticHorizonBudgetLedgerV1.prototype.consume;
  SemanticHorizonBudgetLedgerV1.prototype.consume = async () => {
    replacementCalls += 1;
    return true;
  };
  await restarted.apply(guarantee, decision);
  assert.equal((await restarted.current()).remainingSteps, 0);
  const newerGuarantee = {
    ...guarantee,
    stateDigest: DIGESTS.context,
    throughSequence: 2,
    throughLogicalTimeMs: 2,
  };
  const newerDecision = {
    ...decision,
    guaranteeStateDigest: newerGuarantee.stateDigest,
  };
  await restarted.apply(newerGuarantee, newerDecision);
  assert.equal(await restarted.consume(decision, consumption), true);
  assert.equal(
    await restarted.consume(decision, {
      consumptionId: "effect:repeat:two",
      bindingDigest: DIGESTS.uncertainty,
    }),
    false,
  );
  SemanticHorizonBudgetLedgerV1.prototype.consume = originalConsume;
  assert.equal(replacementCalls, 0);

  const { stateDigest: _stateDigest, ...corruptBody } =
    await restarted.current();
  corruptBody.directive = "continue";
  const corrupt = {
    ...corruptBody,
    stateDigest: digestControlJsonV1("state", corruptBody),
  };
  assert.throws(
    () => validateSemanticHorizonBudgetStateV1(corrupt),
    /semantic_horizon_budget_directive_remaining_invalid/u,
  );
});

test("horizon consumption tombstones compact at a guarantee epoch without refilling budget", async () => {
  const store = new InMemorySemanticHorizonBudgetStoreV1();
  const monotonicAnchor = new InMemorySemanticHorizonBudgetMonotonicAnchorV1();
  const ledger = new SemanticHorizonBudgetLedgerV1({
    stateKey: "budget:compaction",
    store,
    monotonicAnchor,
    maximumConsumptions: 2,
  });
  const guarantee = budgetGuarantee("guarantee:compaction");
  const decision = {
    schemaVersion: 1,
    directive: "continue",
    recommendedHorizonSteps: 8,
    replanRequired: false,
    reasonCodes: ["semantic_horizon_nominal"],
    guaranteeStateDigest: guarantee.stateDigest,
    policyDigest: guarantee.policyDigest,
    assumptionsDigest: guarantee.assumptionsDigest,
    controlPolicyDigest: DIGESTS.authority,
  };
  await ledger.apply(guarantee, decision);
  for (const consumptionId of ["effect:compact:1", "effect:compact:2"])
    assert.equal(
      await ledger.consume(decision, {
        consumptionId,
        bindingDigest: DIGESTS.uncertainty,
      }),
      true,
    );
  const newerGuarantee = {
    ...guarantee,
    stateDigest: DIGESTS.context,
    throughSequence: 2,
    throughLogicalTimeMs: 2,
  };
  const newerDecision = {
    ...decision,
    guaranteeStateDigest: newerGuarantee.stateDigest,
  };
  await ledger.apply(newerGuarantee, newerDecision);
  assert.equal(
    await ledger.consume(decision, {
      consumptionId: "effect:compact:1",
      bindingDigest: DIGESTS.uncertainty,
    }),
    true,
  );
  assert.equal(
    await ledger.consume(newerDecision, {
      consumptionId: "effect:compact:3",
      bindingDigest: DIGESTS.uncertainty,
    }),
    true,
  );
  const compacted = await ledger.current();
  assert.equal(compacted.consumptionEpoch, 2);
  assert.equal(compacted.compactedConsumptionCount, 2);
  assert.match(compacted.compactedConsumptionDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(compacted.consumptions.length, 1);
  await assert.rejects(
    ledger.reconcileConsumption({
      consumptionId: "effect:compact:1",
      bindingDigest: DIGESTS.uncertainty,
    }),
    /semantic_horizon_budget_consumption_replay_window_compacted/u,
  );
  assert.equal(
    await ledger.reconcileConsumption({
      consumptionId: "effect:compact:3",
      bindingDigest: DIGESTS.uncertainty,
    }),
    true,
  );
  assert.equal(
    await ledger.consume(decision, {
      consumptionId: "effect:compact:1",
      bindingDigest: DIGESTS.uncertainty,
    }),
    false,
  );
  assert.equal(
    await ledger.consume(newerDecision, {
      consumptionId: "effect:compact:4",
      bindingDigest: DIGESTS.uncertainty,
    }),
    true,
  );
});

test("monotonic horizon anchor rejects durable state rollback", async () => {
  let state = null;
  const history = [];
  const store = {
    async load() {
      return state;
    },
    async compareAndSet(input) {
      if (
        (state?.revision ?? null) !== input.expectedRevision ||
        (state?.stateDigest ?? null) !== input.expectedStateDigest
      )
        return false;
      state = input.next;
      history.push(input.next);
      return true;
    },
  };
  const monotonicAnchor = new InMemorySemanticHorizonBudgetMonotonicAnchorV1();
  const ledger = new SemanticHorizonBudgetLedgerV1({
    stateKey: "budget:rollback",
    store,
    monotonicAnchor,
  });
  const guarantee = budgetGuarantee("guarantee:rollback");
  const decision = {
    schemaVersion: 1,
    directive: "shorten_horizon",
    recommendedHorizonSteps: 1,
    replanRequired: false,
    reasonCodes: ["semantic_horizon_shortened"],
    guaranteeStateDigest: guarantee.stateDigest,
    policyDigest: guarantee.policyDigest,
    assumptionsDigest: guarantee.assumptionsDigest,
    controlPolicyDigest: DIGESTS.authority,
  };
  await ledger.apply(guarantee, decision);
  await ledger.consume(decision, {
    consumptionId: "effect:rollback",
    bindingDigest: DIGESTS.uncertainty,
  });
  assert.equal(state.remainingSteps, 0);
  state = history[0];
  await assert.rejects(
    ledger.current(),
    /semantic_horizon_budget_state_below_anchor/u,
  );
});

test("restart reconciles a consumed budget after its anchor-write crash", async () => {
  const store = new InMemorySemanticHorizonBudgetStoreV1();
  const backingAnchor = new InMemorySemanticHorizonBudgetMonotonicAnchorV1();
  let anchorWrites = 0;
  const faultableAnchor = {
    readAnchor: (stateKey) => backingAnchor.readAnchor(stateKey),
    async compareAndSetAnchor(input) {
      anchorWrites += 1;
      if (anchorWrites === 2) return false;
      return backingAnchor.compareAndSetAnchor(input);
    },
  };
  const guarantee = budgetGuarantee("guarantee:frontier");
  const decision = {
    schemaVersion: 1,
    directive: "shorten_horizon",
    recommendedHorizonSteps: 1,
    replanRequired: false,
    reasonCodes: ["semantic_horizon_shortened"],
    guaranteeStateDigest: guarantee.stateDigest,
    policyDigest: guarantee.policyDigest,
    assumptionsDigest: guarantee.assumptionsDigest,
    controlPolicyDigest: DIGESTS.authority,
  };
  const first = new SemanticHorizonBudgetLedgerV1({
    stateKey: "budget:frontier",
    store,
    monotonicAnchor: faultableAnchor,
  });
  await first.apply(guarantee, decision);
  const consumption = {
    consumptionId: "effect:frontier",
    bindingDigest: DIGESTS.uncertainty,
  };
  await assert.rejects(
    first.consume(decision, consumption),
    /semantic_horizon_budget_anchor_commit_failed/u,
  );

  const restarted = new SemanticHorizonBudgetLedgerV1({
    stateKey: "budget:frontier",
    store,
    monotonicAnchor: faultableAnchor,
  });
  assert.equal((await restarted.current()).remainingSteps, 0);
  assert.equal(await restarted.consume(decision, consumption), true);
  assert.equal((await restarted.current()).remainingSteps, 0);
});

test("structural statistical ports fail closed on an unknown directive", async () => {
  const control = controller({
    mode: "black_box",
    horizonControl: {
      decide(guarantee) {
        return {
          schemaVersion: 1,
          directive: "not_a_directive",
          recommendedHorizonSteps: 1,
          replanRequired: false,
          reasonCodes: ["invalid_directive"],
          guaranteeStateDigest: guarantee.stateDigest,
          policyDigest: guarantee.policyDigest,
          assumptionsDigest: guarantee.assumptionsDigest,
          controlPolicyDigest: DIGESTS.authority,
        };
      },
    },
  });
  assert.equal(
    isOperationalCognitiveControllerBoundToSemanticGuaranteesV1(control),
    false,
  );
  let effects = 0;
  await assert.rejects(
    invokeOperationalCognitiveRunPreEffectV1(
      control,
      {
        operationId: "effect:invalid-directive",
        observationSequence: 1,
        step: 1,
        logicalTimeMs: 1,
        bindingDigest: DIGESTS.binding,
        payload: "{}",
      },
      () => {
        effects += 1;
      },
    ),
    /semantic_horizon_decision_directive_invalid/u,
  );
  assert.equal(effects, 0);
});

test("nominal horizon snapshots accessor-backed policy values", async () => {
  const guaranteePolicy = createAnytimeSemanticGuaranteePolicyV1({
    policyId: "guarantee:accessor-snapshot",
    familywiseErrorBudgetPpm: 60_000,
    minimumInferenceSamples: 1,
    metrics: {
      roleCoherence: metric("higher_is_better", "worst_case_imputation"),
      missionAlignment: metric("higher_is_better", "worst_case_imputation"),
      contextConflict: metric("lower_is_better", "worst_case_imputation"),
      uncertainty: metric("lower_is_better", "fail_closed"),
      courseActionDiversity: metric(
        "higher_is_better",
        "worst_case_imputation",
      ),
      courseActionNovelty: metric("higher_is_better", "worst_case_imputation"),
    },
    assumptions: { assumptionEvidenceDigests: [] },
  });
  const enabled = Object.fromEntries(
    [
      "roleCoherence",
      "missionAlignment",
      "contextConflict",
      "uncertainty",
      "courseActionDiversity",
      "courseActionNovelty",
    ].map((name) => [
      name,
      { thresholdBasisPoints: 5_000, enabled: name === "uncertainty" },
    ]),
  );
  const plain = createSemanticHorizonControlPolicyV1({
    expectedGuaranteePolicyDigest: guaranteePolicy.policyDigest,
    expectedAssumptionsDigest: guaranteePolicy.assumptions.assumptionsDigest,
    nominalHorizonSteps: 8,
    cautionHorizonSteps: 2,
    replanHorizonSteps: 1,
    thresholds: enabled,
  });
  const { thresholds: _thresholds, ...policyBody } = plain;
  let dynamicThresholds = enabled;
  const accessorPolicy = { ...policyBody };
  Object.defineProperty(accessorPolicy, "thresholds", {
    enumerable: true,
    get() {
      return dynamicThresholds;
    },
  });
  const horizon = createSemanticHorizonControlV1(accessorPolicy);
  dynamicThresholds = Object.fromEntries(
    Object.keys(enabled).map((name) => [
      name,
      { thresholdBasisPoints: 5_000, enabled: false },
    ]),
  );
  const guarantee = await new AnytimeSemanticGuaranteeEngineV1({
    policy: guaranteePolicy,
  }).append({
    stateKey: "guarantee:accessor-snapshot",
    sample: {
      sequence: 1,
      logicalTimeMs: 1,
      assessmentDigest: DIGESTS.uncertainty,
      metrics: {
        roleCoherenceBps: 9_000,
        missionAlignmentBps: 9_000,
        contextConflictBps: 0,
        uncertaintyBps: null,
        courseActionDiversityBps: 9_000,
        courseActionNoveltyBps: 9_000,
      },
    },
  });
  assert.equal(horizon.decide(guarantee).directive, "safe_stop");
});

test("representation-aware mode controls activation before inference", async () => {
  let controlledRequest;
  const roleVector = [1, 0];
  const activation = [0, 1];
  const control = controller({
    mode: "representation_aware",
    representationPolicy: createRepresentationControlPolicyV1({
      steeringStrengthBasisPoints: 5_000,
      prohibitedProjectionRemovalBasisPoints: 10_000,
      maximumDeltaNormBasisPoints: 10_000,
      minimumInputNorm: 0.001,
      maximumDimensions: 16,
    }),
    inference: {
      async execute(request) {
        controlledRequest = request;
        return "represented output";
      },
    },
  });

  const turn = await control.runTurn({
    operationId: "turn:representation",
    observationSequence: 1,
    step: 1,
    logicalTimeMs: 200,
    bindingDigest: DIGESTS.binding,
    input: "reason",
    context: [
      contextItem("context:authority", "authority", "policy", 10_000, 0, true),
    ],
    requestedToolNames: [],
    memoryQueryDigest: null,
    representation: {
      activation,
      activationDigest: digestRepresentationVectorV1(activation),
      roleVector,
      roleVectorDigest: digestRepresentationVectorV1(roleVector),
      prohibitedVectors: [],
    },
  });

  assert.equal(turn.status, "completed");
  assert.equal(turn.representationReceipt.result, "applied");
  assert.notDeepEqual(controlledRequest.controlledActivation, activation);
  assert.deepEqual(
    controlledRequest.representationReceipt,
    turn.representationReceipt,
  );
});

test("missing fail-closed observation safe-stops before inference", async () => {
  let executions = 0;
  const control = controller({
    mode: "black_box",
    uncertaintyValue: null,
    failClosedUncertainty: true,
    inference: {
      async execute() {
        executions += 1;
        return "must not run";
      },
    },
  });

  const turn = await control.runTurn({
    operationId: "turn:safe-stop",
    observationSequence: 1,
    step: 1,
    logicalTimeMs: 300,
    bindingDigest: DIGESTS.binding,
    input: "uncertain request",
    context: [
      contextItem("context:authority", "authority", "policy", 10_000, 0, true),
    ],
    requestedToolNames: [],
    memoryQueryDigest: null,
    representation: null,
  });

  assert.equal(turn.status, "safe_stopped");
  assert.equal(turn.output, null);
  assert.equal(turn.horizonDecision.directive, "safe_stop");
  assert.equal(executions, 0);
});

test("unauthorized pre-tool request never reaches intervention or dispatcher", async () => {
  const calls = [];
  const control = controller({ mode: "black_box", calls });
  let dispatches = 0;
  const result = await control.runPreTool(
    {
      operationId: "tool:denied",
      observationSequence: 1,
      step: 1,
      logicalTimeMs: 400,
      bindingDigest: DIGESTS.binding,
      payload: "{}",
      toolName: "shell",
    },
    () => {
      dispatches += 1;
    },
  );

  assert.equal(result.allowed, false);
  assert.deepEqual(result.reasonCodes, ["tool_not_authorized"]);
  assert.equal(dispatches, 0);
  assert.equal(calls.length, 0);
});

function controller(options) {
  const calls = options.calls ?? [];
  const emissions = options.emissions ?? [];
  const guaranteePolicy = createAnytimeSemanticGuaranteePolicyV1({
    policyId: "guarantee:operational-test",
    familywiseErrorBudgetPpm: 60_000,
    minimumInferenceSamples: 1,
    metrics: Object.freeze({
      roleCoherence: metric("higher_is_better", "worst_case_imputation"),
      missionAlignment: metric("higher_is_better", "worst_case_imputation"),
      contextConflict: metric("lower_is_better", "worst_case_imputation"),
      uncertainty: metric(
        "lower_is_better",
        options.failClosedUncertainty ? "fail_closed" : "worst_case_imputation",
      ),
      courseActionDiversity: metric(
        "higher_is_better",
        "worst_case_imputation",
      ),
      courseActionNovelty: metric("higher_is_better", "worst_case_imputation"),
    }),
    assumptions: { assumptionEvidenceDigests: [] },
  });
  const thresholds = Object.fromEntries(
    [
      "roleCoherence",
      "missionAlignment",
      "contextConflict",
      "uncertainty",
      "courseActionDiversity",
      "courseActionNovelty",
    ].map((name) => [
      name,
      {
        thresholdBasisPoints: 5_000,
        enabled:
          name === "uncertainty" && Boolean(options.failClosedUncertainty),
      },
    ]),
  );
  const horizonPolicy = createSemanticHorizonControlPolicyV1({
    expectedGuaranteePolicyDigest: guaranteePolicy.policyDigest,
    expectedAssumptionsDigest: guaranteePolicy.assumptions.assumptionsDigest,
    nominalHorizonSteps: 8,
    cautionHorizonSteps: 2,
    replanHorizonSteps: 1,
    thresholds,
  });
  const stateDigest = digest("intervention-state");
  const intervention = options.intervention ?? {
    async gateCheckpoint(request) {
      calls.push({ type: "checkpoint", ...request });
      return { allowed: true, assessments: [], state: { stateDigest } };
    },
    async gateOperation(request) {
      calls.push({ type: "operation", ...request });
      return { allowed: true, assessments: [], state: { stateDigest } };
    },
  };
  const Controller = options.Controller ?? OperationalCognitiveControllerV1;
  const controllerOptions = {
    controlId: "operational:test",
    mode: options.mode,
    guaranteeStateKey: "guarantee-state:test",
    blackBoxPolicy: createBlackBoxControlPolicyV1({
      maximumContextTokens: 100,
      maximumContextItems: 10,
      maximumContextItemBytes: 1_024,
      minimumTrustBasisPoints: 5_000,
      maximumRiskBasisPoints: 5_000,
      maximumItemsPerIndependenceGroup: 4,
      allowedToolNames: ["search"],
      protectedZones: ["authority"],
      roleReinforcement: "Follow the active role and objective.",
      roleReinforcementDigest: digestBlackBoxContentV1(
        "Follow the active role and objective.",
      ),
    }),
    ...(options.representationPolicy
      ? { representationPolicy: options.representationPolicy }
      : {}),
    observers: observers(
      Object.hasOwn(options, "uncertaintyValue")
        ? options.uncertaintyValue
        : 500,
    ),
    intervention,
    guarantee:
      options.guarantee ??
      new AnytimeSemanticGuaranteeEngineV1({
        policy: guaranteePolicy,
        ...(options.guaranteeStore
          ? {
              store: options.guaranteeStore,
              monotonicAnchor:
                options.guaranteeMonotonicAnchor ?? options.guaranteeStore,
            }
          : {}),
      }),
    horizonControl:
      options.horizonControl ?? createSemanticHorizonControlV1(horizonPolicy),
    ...(options.horizonBudgetStore
      ? {
          horizonBudgetStore: options.horizonBudgetStore,
          horizonBudgetMonotonicAnchor: options.horizonBudgetMonotonicAnchor,
          horizonBudgetStateKey: options.horizonBudgetStateKey,
        }
      : {}),
    inference: options.inference ?? {
      async execute() {
        return "output";
      },
    },
    observationSink: {
      async emit(value) {
        emissions.push(value);
      },
    },
  };
  options.captureOptions?.(controllerOptions);
  return new Controller(controllerOptions);
}

function observers(uncertaintyValue) {
  return {
    coherence: observer("coherence", "coherence", 9_000, DIGESTS.coherence),
    objective: observer(
      "objective",
      "objective_alignment",
      9_000,
      DIGESTS.objective,
    ),
    context: observer("context", "context_conflict", 500, DIGESTS.context),
    uncertainty: observer(
      "uncertainty",
      "uncertainty",
      uncertaintyValue,
      DIGESTS.uncertainty,
    ),
  };
}

function observer(id, kind, valueBasisPoints, evidenceDigest) {
  return Object.freeze({
    observerId: `observer:${id}`,
    observerVersion: 1,
    observerImplementationDigest: digest(`observer:${id}:implementation`),
    kind,
    observe() {
      return {
        valueBasisPoints,
        evidenceDigests: [evidenceDigest],
        reasonCodes: [`${id}_observed`],
      };
    },
  });
}

function contextItem(
  itemId,
  sourceZone,
  content,
  trustBasisPoints,
  riskBasisPoints,
  essential,
) {
  return Object.freeze({
    itemId,
    content,
    contentDigest: digestBlackBoxContentV1(content),
    sourceZone,
    trustBasisPoints,
    riskBasisPoints,
    tokenEstimate: 4,
    essential,
    independenceGroup: `group:${itemId}`,
  });
}

function metric(direction, missingness) {
  return Object.freeze({ direction, errorBudgetPpm: 10_000, missingness });
}

function digest(value) {
  let state = 0x811c9dc5;
  for (const char of value) {
    state ^= char.codePointAt(0);
    state = Math.imul(state, 0x01000193) >>> 0;
  }
  return `sha256:${state.toString(16).padStart(8, "0").repeat(8)}`;
}
