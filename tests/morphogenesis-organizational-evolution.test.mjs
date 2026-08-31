import assert from "node:assert/strict";
import test from "node:test";
import { digestPlanningJsonV1 } from "@agentplat/collective-planning";
import {
  InMemoryMorphogenesisOrganizationalGovernanceStoreV7,
  InMemoryMorphogenesisOrganizationalExecutionStoreV7,
  MorphogenesisOrganizationalGovernanceRuntimeV7,
  MorphogenesisOrganizationalExecutionRuntimeV7,
  createMorphogenesisOrganizationalGovernancePolicyV7,
  createMorphogenesisOrganizationalReviewV7,
  validateMorphogenesisOrganizationalEvolutionPlanV7,
  createMorphogenesisOrganizationalOwnerHandoffV7,
} from "@agentplat/collective-runtime/morphogenesis";
import {
  MorphogenesisOrganizationalMeshPublisherV7,
  projectMorphogenesisOrganizationalHandoffToMeshV7,
  projectMorphogenesisOrganizationalHandoffToRoomArtifactV7,
} from "@agentplat/rooms-mesh/morphogenesis";
const sha = (v) =>
  digestPlanningJsonV1("morphogenesis-strategy-context-v3", { v });
function plan() {
  const sb = {
    schemaVersion: 7,
    stepId: "step:replace",
    operator: "replace_agent",
    artifactKind: "governed_operation_v1",
    artifactDigest: sha("operation"),
    authorityOwner: "morphogenesis",
    dependsOnStepIds: [],
    compensationRequired: true,
  };
  const step = Object.freeze({
    ...sb,
    stepDigest: digestPlanningJsonV1(
      "morphogenesis-organizational-plan-step-v7",
      sb,
    ),
  });
  const b = {
    schemaVersion: 7,
    planId: "plan:org",
    candidateDigest: sha("candidate"),
    sourceTopologyDigest: sha("topology"),
    sourceEpoch: 1,
    successorEpoch: 2,
    steps: [step],
    continuityPlanDigest: sha("continuity"),
    rollbackPlanDigest: sha("rollback"),
    compiledAtLogicalMs: 10,
    advisoryOnly: true,
  };
  return Object.freeze({
    ...b,
    planDigest: digestPlanningJsonV1(
      "morphogenesis-organizational-evolution-plan-v7",
      b,
    ),
  });
}
const recommendation = (route, id, time, action = "start_canary") => ({
  recommendationId: `recommendation:${route}:${id}`,
  action,
  proposerId: "agent:proposer",
  proposerImplementationDigest: sha("proposer"),
  reviewRoute: route,
  evidenceDigests: [sha(id)],
  proposedAtLogicalMs: time,
  expiresAtLogicalMs: time + 20,
});
test("V7 governs canary and stabilization through agent, person or quorum", async () => {
  const p = plan();
  assert.equal(
    validateMorphogenesisOrganizationalEvolutionPlanV7(p).successorEpoch,
    2,
  );
  const policy = createMorphogenesisOrganizationalGovernancePolicyV7({
    schemaVersion: 7,
    policyId: "policy:org",
    policyVersion: 1,
    allowedActions: ["start_canary", "stabilize", "isolate", "rollback"],
    allowedReviewRoutes: [
      "authorized_agent",
      "authorized_person",
      "collective",
    ],
    requireIndependentReviewer: true,
    maximumCanaryObservations: 4,
    minimumCanaryObservations: 2,
    minimumStableObservations: 2,
    maximumUnsafeObservations: 0,
    maximumPendingRecommendations: 8,
    maximumHistory: 16,
    maximumCommitAttempts: 4,
  });
  for (const [route, actorType] of [
    ["authorized_agent", "agent"],
    ["authorized_person", "person"],
    ["collective", "collective"],
  ]) {
    let n = 0;
    const runtime = new MorphogenesisOrganizationalGovernanceRuntimeV7({
      stateKey: `state:${route}`,
      policy,
      plan: p,
      store: new InMemoryMorphogenesisOrganizationalGovernanceStoreV7(),
      reviews: {
        async review({ recommendation, logicalTimeMs }) {
          n++;
          return createMorphogenesisOrganizationalReviewV7({
            reviewId: `review:${route}:${n}`,
            recommendationDigest: recommendation.recommendationDigest,
            route,
            actorType,
            actorId: `${actorType}:reviewer`,
            actorMandateDigest: sha("mandate"),
            independenceGroupId: `group:${route}`,
            disposition: "approved",
            proofDigest: sha(`proof:${n}`),
            reviewedAtLogicalMs: logicalTimeMs,
            expiresAtLogicalMs: logicalTimeMs + 10,
          });
        },
      },
    });
    let r = await runtime.recommend(recommendation(route, "start", 20));
    const auth = await runtime.reviewAndApply({
      recommendationId: r.recommendationId,
      logicalTimeMs: 21,
    });
    assert.match(auth, /^sha256:/);
    const state = await runtime.state(21),
      handoff = createMorphogenesisOrganizationalOwnerHandoffV7({
        handoffId: `handoff:${route}`,
        governance: state,
        stepId: "step:replace",
        logicalTimeMs: 21,
        expiresAtLogicalMs: 40,
      });
    assert.equal(handoff.workGranted, false);
    const scope = {
        tenantId: "tenant:test",
        roomId: "room:test",
        meshId: "mesh:test",
        missionId: "mission:test",
        objectiveId: "objective:test",
        morphologyId: "morphology:test",
      },
      room = { tenantId: "tenant:test", id: "room:test", status: "active" };
    assert.equal(
      projectMorphogenesisOrganizationalHandoffToRoomArtifactV7({
        room,
        scope,
        handoff,
      }).input.metadata.morphogenesisStrategySchemaVersion,
      7,
    );
    const projection = await projectMorphogenesisOrganizationalHandoffToMeshV7({
      scope,
      handoff,
    });
    await new MorphogenesisOrganizationalMeshPublisherV7({
      async send(x) {
        return {
          schemaVersion: 1,
          projectionDigest: x.projectionDigest,
          senderPeerId: "peer:test",
          senderInstanceId: "instance:test",
          membershipConfigurationDigest: sha("membership"),
          membershipEpoch: 1,
          envelopeDigest: sha("envelope"),
          sentAtLogicalMs: 21,
        };
      },
      async verify() {
        return true;
      },
    }).publish(projection);
    for (let i = 1; i <= 2; i++)
      await runtime.observe({
        observationId: `observation:${route}:${i}`,
        outcome: "stable",
        capabilityEvidenceDigest: sha(`cap:${i}`),
        continuityEvidenceDigest: sha(`cont:${i}`),
        diversityEvidenceDigest: sha(`div:${i}`),
        authorityEvidenceDigest: sha(`auth:${i}`),
        logicalTimeMs: 21 + i,
      });
    r = await runtime.recommend(
      recommendation(route, "stable", 24, "stabilize"),
    );
    await runtime.reviewAndApply({
      recommendationId: r.recommendationId,
      logicalTimeMs: 25,
    });
    assert.equal((await runtime.state(25)).status, "stable");
  }
});
test("V7 executes one owner effect and compensates it with stable operation IDs", async () => {
  const p = plan(),
    applied = new Map(),
    compensated = new Map();
  const boundary = {
    async apply({ operationId, plan, step, logicalTimeMs }) {
      const b = {
        schemaVersion: 7,
        operationId,
        planDigest: plan.planDigest,
        stepDigest: step.stepDigest,
        ownerReceiptDigest: sha("owner"),
        appliedAtLogicalMs: logicalTimeMs,
      };
      const r = {
        ...b,
        receiptDigest: digestPlanningJsonV1(
          "morphogenesis-organizational-step-receipt-v7",
          b,
        ),
      };
      applied.set(operationId, r);
      return r;
    },
    async reconcileApply({ operationId }) {
      return applied.get(operationId);
    },
    async compensate({ operationId, plan, receipt, logicalTimeMs }) {
      const b = {
        schemaVersion: 7,
        operationId,
        planDigest: plan.planDigest,
        stepReceiptDigest: receipt.receiptDigest,
        ownerReceiptDigest: sha("comp"),
        compensatedAtLogicalMs: logicalTimeMs,
      };
      const r = {
        ...b,
        receiptDigest: digestPlanningJsonV1(
          "morphogenesis-organizational-compensation-receipt-v7",
          b,
        ),
      };
      compensated.set(operationId, r);
      return r;
    },
    async reconcileCompensation({ operationId }) {
      return compensated.get(operationId);
    },
  };
  const runtime = new MorphogenesisOrganizationalExecutionRuntimeV7({
    store: new InMemoryMorphogenesisOrganizationalExecutionStoreV7(),
    boundaries: {
      morphogenesis: boundary,
      dynamic_topology: boundary,
      membership: boundary,
      work: boundary,
      action: boundary,
    },
    maximumCommitAttempts: 4,
  });
  await runtime.initialize({
    stateKey: "state:execution",
    plan: p,
    authorizationDigest: sha("authorization"),
    logicalTimeMs: 30,
  });
  let s = await runtime.advance({
    stateKey: "state:execution",
    logicalTimeMs: 31,
  });
  assert.equal(s.appliedReceipts.length, 1);
  s = await runtime.failAndCompensate({
    stateKey: "state:execution",
    failureEvidenceDigest: sha("failure"),
    logicalTimeMs: 32,
  });
  s = await runtime.compensate({
    stateKey: "state:execution",
    logicalTimeMs: 33,
  });
  s = await runtime.compensate({
    stateKey: "state:execution",
    logicalTimeMs: 34,
  });
  assert.equal(s.status, "rolled_back");
  assert.equal(compensated.size, 1);
});
