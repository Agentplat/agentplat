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
import {
  MorphogenesisStrategyMeshPublisherV3,
  projectMorphogenesisStrategyRecommendationToMeshV3,
  projectMorphogenesisStrategyRecommendationToRoomArtifactV3,
  projectMorphogenesisStrategyReviewToRoomMessageV3,
  projectMorphogenesisStrategyTransitionToRoomArtifactV3,
} from "@agentplat/rooms-mesh/morphogenesis";

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
          recommendationId: recommendation.recommendationId,
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

  const promoteInput = recommendationInput({
    action: "promote", target: adaptive.strategyId,
    route: "authorized_agent", time: 10,
  });
  const promote = await runtime.recommend(promoteInput);
  assert.equal(promote.advisoryOnly, true);
  assert.equal("reviewDigest" in promote, false);
  let state = await runtime.reviewAndApply({ recommendation: promote, logicalTimeMs: 12 });
  assert.equal(state.activeStrategyId, adaptive.strategyId);
  assert.equal(state.entries.find(({ strategyId }) => strategyId === adaptive.strategyId).status, "promoted");
  assert.equal((await runtime.reviewAndApply({ recommendation: promote, logicalTimeMs: 13 })).stateDigest, state.stateDigest);
  await assert.rejects(runtime.recommend(promoteInput), /already terminal/);

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

  const room = { tenantId: "tenant:test", id: "room:test", status: "active" };
  const scope = {
    tenantId: room.tenantId,
    roomId: room.id,
    meshId: "mesh:test",
    missionId: "mission:test",
    objectiveId: "objective:test",
    morphologyId: "morphology:test",
  };
  const roomRecommendation = projectMorphogenesisStrategyRecommendationToRoomArtifactV3({
    room, scope, recommendation: promote,
  });
  assert.equal(roomRecommendation.input.metadata.advisoryOnly, true);
  const roomReview = projectMorphogenesisStrategyReviewToRoomMessageV3({
    room, scope, review: state.reviews[0], createdAt: "2030-01-01T00:00:00.000Z",
  });
  assert.equal(roomReview.input.metadata.authorityGranted, false);
  const roomTransition = projectMorphogenesisStrategyTransitionToRoomArtifactV3({
    room, scope, transition: state.transitions[0],
  });
  assert.equal(roomTransition.input.risks.includes("authority-remains-external"), true);
  const meshProjection = await projectMorphogenesisStrategyRecommendationToMeshV3({
    scope, recommendation: promote,
  });
  assert.equal(meshProjection.unsigned, true);
  let sends = 0;
  await new MorphogenesisStrategyMeshPublisherV3({
    async send(projection) {
      sends += 1;
      return {
        schemaVersion: 1,
        projectionDigest: projection.projectionDigest,
        senderPeerId: "peer:test",
        senderInstanceId: "instance:test",
        membershipConfigurationDigest: sha("membership"),
        membershipEpoch: 1,
        envelopeDigest: sha("envelope"),
        sentAtLogicalMs: 60,
      };
    },
    async verify() { return true; },
  }).publish(meshProjection);
  assert.equal(sends, 1);

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
          recommendationId: recommendation.recommendationId,
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
          recommendationId: recommendation.recommendationId,
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
