import assert from "node:assert/strict";
import test from "node:test";

import { digestPlanningJsonV1 } from "@agentplat/collective-planning";
import {
  createLocalStrategyCatalogV1,
  createLocalStrategyDefinitionV1,
} from "@agentplat/collective-runtime/strategy-adaptation";
import {
  InMemoryMorphogenesisStrategyGovernanceStoreV3,
  MorphogenesisStrategyGovernanceRuntimeV3,
  createMorphogenesisStrategyCatalogV3,
  createMorphogenesisStrategyDefinitionV3,
  createMorphogenesisStrategyGovernancePolicyV3,
  createMorphogenesisStrategyReviewV3,
} from "@agentplat/collective-runtime/morphogenesis";

const sha = (value) => digestPlanningJsonV1("morphogenesis-strategy-context-v3", { value });
const operations = ["award_selection", "bid_submission", "offer_routing", "plan_decomposition", "recovery_selection"];

function fixture() {
  const definition = (strategyId) => createLocalStrategyDefinitionV1({
    schemaVersion: 1,
    strategyId,
    strategyVersion: 1,
    implementationDigest: sha(`implementation:${strategyId}`),
    operations,
  });
  const baseline = definition("strategy:baseline");
  const adaptive = definition("strategy:adaptive");
  const localCatalog = createLocalStrategyCatalogV1({
    schemaVersion: 1,
    catalogId: "catalog:local",
    catalogVersion: 1,
    parentCatalogDigest: null,
    strategies: [baseline, adaptive],
    baselines: Object.fromEntries(operations.map((operation) => [operation, baseline.strategyId])),
  });
  const morphogenesisPolicyDigest = sha("morphogenesis-policy");
  const catalog = createMorphogenesisStrategyCatalogV3({
    catalogId: "catalog:morphogenesis:v3",
    catalogVersion: 1,
    parentCatalogDigest: null,
    localCatalog,
    strategies: [baseline, adaptive].map((strategy) =>
      createMorphogenesisStrategyDefinitionV3({
        strategy,
        morphogenesisPolicyDigest,
        blueprintCatalogDigest: sha("blueprints"),
        proposalGeneratorDigest: sha(`generator:${strategy.strategyId}`),
        supportedOperators: ["derive_agent", "replace_agent"],
      })),
  });
  const policy = createMorphogenesisStrategyGovernancePolicyV3({
    schemaVersion: 3,
    policyId: "policy:strategy-governance",
    policyVersion: 1,
    parentPolicyDigest: null,
    allowedActions: ["promote", "degrade", "retire", "rollback"],
    allowedReviewRoutes: ["authorized_agent", "authorized_person", "collective"],
    requireIndependentReviewer: true,
    minimumConfidenceBps: 8_000,
    cooldownMs: 5,
    transitionWindowMs: 20,
    maximumTransitionsPerWindow: 2,
    maximumPendingRecommendations: 4,
    maximumReviewHistory: 16,
    maximumTransitionHistory: 16,
    maximumCommitAttempts: 4,
  });
  return { baseline, adaptive, catalog, policy };
}

function recommendationInput({ action, target, replacement = null, route, time }) {
  return {
    recommendationId: `recommendation:${action}:${time}`,
    action,
    targetStrategyId: target,
    replacementStrategyId: replacement,
    adaptationStateDigest: sha(`adaptation-state:${time}`),
    adaptationStateRevision: time,
    evidenceDigests: [sha(`evidence:${time}`)],
    counterfactualDigest: sha(`counterfactual:${time}`),
    riskDigest: sha(`risk:${time}`),
    costDigest: sha(`cost:${time}`),
    confidenceBps: 9_000,
    proposerId: "agent:strategy-analyst",
    proposerImplementationDigest: sha("strategy-analyst"),
    reviewRoute: route,
    reasonCodes: [`${action}_supported`],
    proposedAtLogicalMs: time,
    expiresAtLogicalMs: time + 20,
  };
}

test("agent, person and quorum reviews govern promotion, rollback and retirement durably", async () => {
  const { baseline, adaptive, catalog, policy } = fixture();
  const reviewCalls = [];
  const runtime = new MorphogenesisStrategyGovernanceRuntimeV3({
    stateKey: "state:strategy-governance",
    policy,
    catalog,
    reviews: {
      async review({ recommendation, logicalTimeMs }) {
        reviewCalls.push(recommendation.reviewRoute);
        const actorType = recommendation.reviewRoute === "authorized_agent"
          ? "agent" : recommendation.reviewRoute === "authorized_person" ? "person" : "collective";
        return createMorphogenesisStrategyReviewV3({
          reviewId: `review:${recommendation.recommendationId}`,
          recommendationDigest: recommendation.recommendationDigest,
          route: recommendation.reviewRoute,
          actorType,
          actorId: `${actorType}:reviewer`,
          actorMandateDigest: sha(`mandate:${actorType}`),
          independenceGroupId: `independence:${actorType}`,
          disposition: "approved",
          proofDigest: sha(`proof:${actorType}`),
          reviewedAtLogicalMs: logicalTimeMs,
          expiresAtLogicalMs: logicalTimeMs + 10,
        });
      },
    },
    store: new InMemoryMorphogenesisStrategyGovernanceStoreV3(),
  });

  const promote = await runtime.recommend(recommendationInput({
    action: "promote", target: adaptive.strategyId,
    route: "authorized_agent", time: 10,
  }));
  assert.equal(promote.advisoryOnly, true);
  assert.equal("reviewDigest" in promote, false);
  let state = await runtime.reviewAndApply({ recommendation: promote, logicalTimeMs: 12 });
  assert.equal(state.activeStrategyId, adaptive.strategyId);
  assert.equal(state.entries.find(({ strategyId }) => strategyId === adaptive.strategyId).status, "promoted");
  assert.equal((await runtime.reviewAndApply({ recommendation: promote, logicalTimeMs: 13 })).stateDigest, state.stateDigest);

  const rollback = await runtime.recommend(recommendationInput({
    action: "rollback", target: adaptive.strategyId, replacement: baseline.strategyId,
    route: "authorized_person", time: 30,
  }));
  state = await runtime.reviewAndApply({ recommendation: rollback, logicalTimeMs: 32 });
  assert.equal(state.activeStrategyId, baseline.strategyId);
  assert.equal(state.entries.find(({ strategyId }) => strategyId === adaptive.strategyId).status, "degraded");

  const retire = await runtime.recommend(recommendationInput({
    action: "retire", target: adaptive.strategyId,
    route: "collective", time: 50,
  }));
  state = await runtime.reviewAndApply({ recommendation: retire, logicalTimeMs: 52 });
  assert.equal(state.entries.find(({ strategyId }) => strategyId === adaptive.strategyId).status, "retired");
  assert.deepEqual(reviewCalls, ["authorized_agent", "authorized_person", "collective"]);
  assert.equal(state.transitions.length, 3);

  await assert.rejects(runtime.recommend(recommendationInput({
    action: "promote", target: adaptive.strategyId,
    route: "authorized_agent", time: 70,
  })), /target is unavailable/);
});

test("governance rejects self-review, low confidence and oscillation", async () => {
  const { adaptive, catalog, policy } = fixture();
  const runtime = new MorphogenesisStrategyGovernanceRuntimeV3({
    stateKey: "state:strategy-guard",
    policy,
    catalog,
    reviews: {
      async review({ recommendation, logicalTimeMs }) {
        return createMorphogenesisStrategyReviewV3({
          reviewId: "review:self",
          recommendationDigest: recommendation.recommendationDigest,
          route: recommendation.reviewRoute,
          actorType: "agent",
          actorId: recommendation.proposerId,
          actorMandateDigest: sha("mandate"),
          independenceGroupId: "independence:self",
          disposition: "approved",
          proofDigest: sha("proof"),
          reviewedAtLogicalMs: logicalTimeMs,
          expiresAtLogicalMs: logicalTimeMs + 10,
        });
      },
    },
    store: new InMemoryMorphogenesisStrategyGovernanceStoreV3(),
  });
  await assert.rejects(runtime.recommend({
    ...recommendationInput({ action: "promote", target: adaptive.strategyId,
      route: "authorized_agent", time: 10 }),
    confidenceBps: 7_999,
  }), /confidence is insufficient/);
  const recommendation = await runtime.recommend(recommendationInput({
    action: "promote", target: adaptive.strategyId,
    route: "authorized_agent", time: 20,
  }));
  await assert.rejects(
    runtime.reviewAndApply({ recommendation, logicalTimeMs: 21 }),
    /not independent/,
  );

  const guard = new MorphogenesisStrategyGovernanceRuntimeV3({
    stateKey: "state:strategy-oscillation",
    policy,
    catalog,
    reviews: {
      async review({ recommendation, logicalTimeMs }) {
        return createMorphogenesisStrategyReviewV3({
          reviewId: `review:${recommendation.recommendationId}`,
          recommendationDigest: recommendation.recommendationDigest,
          route: "authorized_agent",
          actorType: "agent",
          actorId: "agent:independent-reviewer",
          actorMandateDigest: sha("mandate:independent"),
          independenceGroupId: "independence:reviewer",
          disposition: "approved",
          proofDigest: sha("proof:independent"),
          reviewedAtLogicalMs: logicalTimeMs,
          expiresAtLogicalMs: logicalTimeMs + 10,
        });
      },
    },
    store: new InMemoryMorphogenesisStrategyGovernanceStoreV3(),
  });
  const first = await guard.recommend(recommendationInput({
    action: "promote", target: adaptive.strategyId,
    route: "authorized_agent", time: 10,
  }));
  await guard.reviewAndApply({ recommendation: first, logicalTimeMs: 11 });
  const second = await guard.recommend(recommendationInput({
    action: "degrade", target: adaptive.strategyId,
    route: "authorized_agent", time: 16,
  }));
  const degraded = await guard.reviewAndApply({ recommendation: second, logicalTimeMs: 17 });
  assert.equal(degraded.entries.find(({ strategyId }) => strategyId === adaptive.strategyId).status, "degraded");
  await assert.rejects(guard.recommend(recommendationInput({
    action: "promote", target: adaptive.strategyId,
    route: "authorized_agent", time: 20,
  })), /oscillation guard/);
});
