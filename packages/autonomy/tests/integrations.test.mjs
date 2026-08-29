import assert from "node:assert/strict";
import test from "node:test";

import {
  InMemoryWorkflowStoreV1,
  createTaskDefinitionV1,
  createTaskExecutionBindingV1,
  createTaskRunV1,
  digestWorkflowJsonV1,
  transitionTaskRunV1,
} from "@agentplat/workflows";
import {
  InMemoryTaskOutcomeStoreV1,
  WorkflowOutcomeRuntimeV1,
} from "@agentplat/workflows/outcomes";

import {
  AutonomyControllerV1,
  InMemoryAutonomyStoreV1,
  createAutonomyEvidenceWindowV1,
  createAutonomyPolicyV1,
  digestAutonomyJsonV1,
} from "../dist/index.js";
import { createAutonomyGovernedActionGuardV1 } from "../dist/actions.js";
import { WorkflowAutonomyEvidenceAdapterV1 } from "../dist/workflows.js";

const at = "2026-08-28T12:00:00.000Z";

test("workflow outcomes derive an exact healthy autonomy evidence window", async () => {
  const workflows = new InMemoryWorkflowStoreV1();
  const outcomes = new InMemoryTaskOutcomeStoreV1();
  const definition = createTaskDefinitionV1({
    taskDefinitionId: "task:evaluate",
    version: "1",
    name: "Evaluate",
    handlerKey: "handler:evaluate",
    handlerDigest: digestWorkflowJsonV1("test-handler", "evaluate"),
    effectClass: "internal",
  });
  const binding = createTaskExecutionBindingV1(definition, {
    promptRevision: "prompt:1",
    promptDigest: digestWorkflowJsonV1("test-prompt", "prompt:1"),
  });
  const claimed = createTaskRunV1({
    tenantId: "tenant-a",
    taskRunId: "task-run:a",
    processRunId: "process-run:a",
    stageId: "evaluate",
    attempt: 1,
    idempotencyKey: "task-run:a",
    inputDigest: digestWorkflowJsonV1("test-input", "a"),
    binding,
    leaseOwnerId: "worker:a",
    leaseToken: "lease:a:0",
    leaseGeneration: 0,
    leaseExpiresAt: "2026-08-28T12:01:00.000Z",
    logicalTime: at,
  });
  await workflows.createTaskRun(claimed);
  const running = transitionTaskRunV1(claimed, {
    status: "running",
    logicalTime: "2026-08-28T12:00:01.000Z",
  });
  await workflows.compareAndSetTaskRun({
    expectedRevision: claimed.revision,
    expectedStateDigest: claimed.stateDigest,
    run: running,
  });
  const completed = transitionTaskRunV1(running, {
    status: "completed",
    logicalTime: "2026-08-28T12:00:02.000Z",
  });
  await workflows.compareAndSetTaskRun({
    expectedRevision: running.revision,
    expectedStateDigest: running.stateDigest,
    run: completed,
  });
  await new WorkflowOutcomeRuntimeV1(workflows, outcomes).record({
    tenantId: "tenant-a",
    outcomeId: "outcome:a",
    taskRunId: completed.taskRunId,
    taskExecutionBindingDigest: binding.bindingDigest,
    outcomeType: "quality.verdict",
    verdict: "positive",
    reasonCode: "accepted",
    sourceType: "human",
    sourceId: "reviewer:a",
    observedAt: "2026-08-28T12:00:03.000Z",
    recordedAt: "2026-08-28T12:00:03.000Z",
    evidenceReferenceIds: [],
  });
  const window = await new WorkflowAutonomyEvidenceAdapterV1(
    workflows,
    outcomes,
  ).derive({
    tenantId: "tenant-a",
    policyDomainId: "policy-domain-a",
    segmentNamespace: "risk-band",
    segmentKey: "segment-a",
    actionType: "effect.apply",
    sourceId: "workflow-outcomes",
    sourceRevision: 1,
    windowSequence: 1,
    observedFrom: at,
    observedThrough: "2026-08-28T12:00:04.000Z",
    outcomeType: "quality.verdict",
    taskRunIds: ["task-run:a"],
    coveragePolicy: {
      outcomeType: "quality.verdict",
      windowMs: 60_000,
      minimumConcludedOutcomes: 1,
      maximumObservationLagMs: 10_000,
      maximumUnresolvedBasisPoints: 0,
    },
  });
  assert.equal(window.coverageStatus, "healthy");
  assert.equal(window.positive, 1);
  assert.equal(window.reasonCounts.accepted, 1);
  assert.deepEqual(window.evidenceReferenceIds, ["outcome:a"]);
});

test("autonomy guard requires approval and still preserves the base governed guard", async () => {
  const { controller } = await fixture();
  const actionDigest = digestAutonomyJsonV1("test-action", "apply");
  const decision = await controller.evaluate({
    ...evaluationInput(actionDigest),
    evidence: window(1),
  });
  assert.equal(decision.level, "approve_all");
  const noApproval = createAutonomyGovernedActionGuardV1({ decision });
  assert.deepEqual(await noApproval.check(checkInput(actionDigest)), {
    allowed: false,
    code: "autonomy_approval_evidence_unavailable",
  });

  let approvalChecks = 0;
  let baseChecks = 0;
  const allowed = createAutonomyGovernedActionGuardV1({
    decision,
    approval: {
      async check() {
        approvalChecks += 1;
        return { allowed: true, code: "allowed" };
      },
    },
    base: {
      async check() {
        baseChecks += 1;
        return { allowed: false, code: "ordinary_authority_denied" };
      },
    },
  });
  assert.deepEqual(await allowed.check(checkInput(actionDigest)), {
    allowed: false,
    code: "ordinary_authority_denied",
  });
  assert.equal(approvalChecks, 1);
  assert.equal(baseChecks, 1);
  assert.equal(
    (
      await allowed.check(
        checkInput(digestAutonomyJsonV1("test-action", "substituted")),
      )
    ).code,
    "autonomy_action_digest_mismatch",
  );
});

test("an autonomous decision only makes the normal action path eligible", async () => {
  const { controller } = await fixture();
  let decision;
  for (let sequence = 1; sequence <= 3; sequence += 1) {
    const action = digestAutonomyJsonV1("test-action", `action:${sequence}`);
    decision = await controller.evaluate({
      ...evaluationInput(action),
      evidence: window(sequence),
      logicalTime: `2026-08-28T12:00:0${sequence}.000Z`,
    });
  }
  assert.equal(decision.level, "autonomous");
  const guard = createAutonomyGovernedActionGuardV1({
    decision,
    base: {
      async check() {
        return { allowed: false, code: "action_grant_stale" };
      },
    },
  });
  assert.deepEqual(
    await guard.check({
      ...checkInput(decision.actionProposalDigest),
      logicalTimeMs: Date.parse(decision.decidedAt),
    }),
    { allowed: false, code: "action_grant_stale" },
  );
});

async function fixture() {
  const store = new InMemoryAutonomyStoreV1();
  const policy = createAutonomyPolicyV1({
    tenantId: "tenant-a",
    policyDomainId: "policy-domain-a",
    policyId: "policy-a",
    policyVersion: 1,
    segmentNamespace: "risk-band",
    initialLevel: "propose_only",
    maximumLevel: "autonomous",
    minimumConcludedOutcomes: 1,
    minimumPositiveBasisPoints: 10_000,
    maximumNegativeBasisPoints: 0,
    maximumCorrectedBasisPoints: 0,
    maximumUnresolvedBasisPoints: 0,
    consecutiveHealthyWindows: 1,
    promotionCooldownMs: 0,
    sampleApprovalBasisPoints: 10_000,
    criticalReasonCodes: [],
    criticalDegradationLevel: "blocked",
    coverageFailureLevel: "blocked",
    maximumDecisionHistory: 16,
  });
  await store.registerPolicy(policy);
  return { controller: new AutonomyControllerV1(store) };
}

function window(sequence) {
  return createAutonomyEvidenceWindowV1({
    tenantId: "tenant-a",
    policyDomainId: "policy-domain-a",
    segmentNamespace: "risk-band",
    segmentKey: "segment-a",
    actionType: "effect.apply",
    sourceId: "outcomes",
    sourceRevision: sequence,
    windowSequence: sequence,
    observedFrom: at,
    observedThrough: `2026-08-28T12:00:0${sequence}.000Z`,
    coverageStatus: "healthy",
    eligibleTaskRuns: 1,
    concludedOutcomes: 1,
    positive: 1,
    negative: 0,
    corrected: 0,
    inconclusive: 0,
    unresolvedTaskRuns: 0,
    reasonCounts: {},
    cursor: {
      recordedAt: `2026-08-28T12:00:0${sequence}.000Z`,
      outcomeId: `outcome:${sequence}`,
    },
    evidenceReferenceIds: [],
  });
}

function evaluationInput(actionProposalDigest) {
  return {
    tenantId: "tenant-a",
    policyDomainId: "policy-domain-a",
    policyId: "policy-a",
    policyVersion: 1,
    segmentNamespace: "risk-band",
    segmentKey: "segment-a",
    actionType: "effect.apply",
    actionProposalDigest,
    logicalTime: "2026-08-28T12:00:01.000Z",
  };
}

function checkInput(actionDigest) {
  return {
    stage: "dispatch",
    permit: {},
    scope: null,
    actionDigest,
    logicalTimeMs: Date.parse("2026-08-28T12:00:01.000Z"),
  };
}
