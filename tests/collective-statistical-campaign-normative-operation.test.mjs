import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  COLLECTIVE_EVALUATION_NORMATIVE_CAMPAIGN_PROFILE_V1,
  collectiveEvaluationCampaignProfileCellsV1,
  createCollectiveEvaluationCampaignRegistrationV1,
  createNormativeMetricProjectionV1,
  createNormativeOperationAuthorizationV1,
  createNormativeOperationPlanV1,
  createNormativeRunnerDescriptorV1,
  normativeProjectedEventIdsDigestV1,
} from "../packages/collective-planning/dist/evaluation.js";
import {
  collectiveStatisticalCampaignNormativeExecutionIdV1,
  createMemoryCollectiveStatisticalCampaignExecutionStoreV1,
  digestCollectiveStatisticalCampaignArtifactV1,
  runCollectiveStatisticalCampaignNormativeOperationV1,
} from "../packages/mesh-sim/dist/index.js";

const d = (x) => `sha256:${x.repeat(64)}`;
const encoder = new TextEncoder();
function registration() {
  const id = "campaign:normative-operation-executor";
  return createCollectiveEvaluationCampaignRegistrationV1({
    schemaVersion: 1,
    campaignId: id,
    profile: COLLECTIVE_EVALUATION_NORMATIVE_CAMPAIGN_PROFILE_V1,
    sourceDigest: d("1"),
    packageDigest: d("2"),
    fixtureManifestDigest: d("3"),
    policyDigest: d("4"),
    environmentDigest: d("5"),
    observationPolicyDigest: d("6"),
    monitorDigest: d("7"),
    hiddenCanaryDigest: d("8"),
    runners: ["adaptive_collective", "centralized_planner"],
    maximumInteractions: 5000,
    cells: collectiveEvaluationCampaignProfileCellsV1(
      COLLECTIVE_EVALUATION_NORMATIVE_CAMPAIGN_PROFILE_V1,
      id,
    ).map((c) => ({
      schemaVersion: 1,
      ...c,
      maximumInteractions:
        c.peerCount === 50
          ? 1000
          : c.peerCount === 100
            ? 1600
            : c.peerCount === 250
              ? 3000
              : 5000,
      scaleConfigurationDigest: d("9"),
      adaptiveDefinitionDigest: d("a"),
      centralizedDefinitionDigest: d("b"),
      faultPlanDigest: d("c"),
      faultMatrixBindingDigest: d("d"),
    })),
  });
}
function descriptor(runnerClass = "normative_candidate") {
  return createNormativeRunnerDescriptorV1({
    schemaVersion: 1,
    adapterId: "adapter:conformance",
    adapterVersion: "1",
    runnerClass,
    capabilities: {
      schemaVersion: 1,
      runners: ["adaptive_collective", "centralized_planner"],
      scales: [50, 100, 250, 500],
      strata: ["nominal", "benign", "adversarial", "mixed"],
      traceSchemaVersion: 2,
      accountingVersion: "interaction-accounting-v2",
      environmentPortVersion: 1,
      monitorPortVersion: 1,
      exactReplay: true,
      evaluatorOwnedMetrics: true,
    },
    digests: {
      schemaVersion: 1,
      implementationDigest: d("1"),
      evaluatorDigest: d("e"),
      scenarioDefinitionDigest: d("2"),
      fixtureDigest: d("3"),
      policyDigest: d("4"),
      environmentDigest: d("5"),
      observationPolicyDigest: d("6"),
      monitorDigest: d("7"),
    },
    limits: {
      schemaVersion: 1,
      maximumAgents: 500,
      maximumOutdegree: 32,
      maximumInteractionsPerExecution: 5000,
      maximumTraceEventsPerExecution: 100000,
      maximumArtifactBytesPerExecution: 67108864,
      maximumConcurrentCells: 2,
    },
  });
}
function writer(onWrite = () => undefined) {
  const values = new Map();
  const put = async ({ artifactId, kind, bytes }) => {
    onWrite(artifactId);
      const parts = [];
      for await (const p of bytes) parts.push(p);
      const raw = Buffer.concat(parts);
      const previous = values.get(artifactId);
      if (previous && !previous.equals(raw)) throw new TypeError("conflict");
      values.set(artifactId, raw);
      const value = JSON.parse(raw);
      return Object.freeze({
        schemaVersion: 1,
        artifactId,
        kind,
        path: `artifacts/${artifactId}.json`,
        byteLength: raw.byteLength,
        sha256: createHash("sha256").update(raw).digest("hex"),
        canonicalDigest: digestCollectiveStatisticalCampaignArtifactV1(
          kind,
          value,
        ),
      });
  };
  return {
    schemaVersion: 1,
    putArtifactV1: put,
    async putArtifactBeforeDeadlineV1(input) {
      const { operationExpiresAtMs: _operationExpiresAtMs, ...artifact } =
        input;
      return put(artifact);
    },
  };
}
function projection(execution, registration, change = {}) {
  const ids = ["event:first", "event:terminal"];
  return createNormativeMetricProjectionV1({
    schemaVersion: 1,
    projectionOwner: "evaluator",
    evaluatorDigest: d("e"),
    executionId: execution.executionId,
    runKey: execution.runKey,
    attempt: execution.attempt,
    registrationDigest: registration.registrationDigest,
    cellId: execution.cellId,
    seed: execution.seed,
    runner: execution.runner,
    executionStatus: "completed",
    validity: "valid",
    missionOutcome: "success",
    reasonCode: null,
    interactionTotal: 1,
    interactionCeiling: registration.cells.find(
      (c) => c.cellId === execution.cellId,
    ).maximumInteractions,
    eventBinding: {
      schemaVersion: 1,
      boundaryEvidenceDigest: d("3"),
      traceDigest: execution.trace.traceDigest,
      traceRoot: d("4"),
      monitorVerdictDigest: d("5"),
      firstEventId: ids[0],
      lastEventId: ids[1],
      terminalEventId: ids[1],
      eventCount: 2,
      projectedEventIds: ids,
      projectedEventIdsDigest: normativeProjectedEventIdsDigestV1(ids),
    },
    safety: {
      schemaVersion: 1,
      authorizationViolations: 0,
      planAuthorityViolations: 0,
      staleFenceViolations: 0,
      duplicateEffectViolations: 0,
      hiddenStateViolations: 0,
      globalMembershipViolations: 0,
      directAssignmentViolations: 0,
      directContractViolations: 0,
      syntheticLedgerViolations: 0,
      constantMetricViolations: 0,
      canaryLeakViolations: 0,
      evaluationIntegrityViolations: 0,
    },
    faults: { schemaVersion: 1, registeredFamilies: [], events: [] },
    recovery: {
      schemaVersion: 1,
      disruptionEventId: null,
      replanEventId: null,
      assignmentChangeEventId: null,
      recoveryEventId: null,
      interactionsToReplan: null,
      interactionsToRecovery: null,
    },
    convergence: {
      schemaVersion: 1,
      healOrQuiescenceEventId: null,
      agreementEventId: null,
      healthyParticipantCount: 0,
      agreeingParticipantCount: 0,
      interactionsToAgreement: null,
    },
    roleCoherence: {
      schemaVersion: 1,
      firstDecisionEventId: null,
      lastDecisionEventId: null,
      firstUnsafeEventId: null,
      decisionCount: 0,
      coherentDecisionCount: 0,
      usefulDecisionCount: 0,
      unsafeExecutableCount: 0,
    },
    ...change,
  });
}
function fixture(change = {}) {
  const r = registration(),
    adapter = descriptor();
  const plan = createNormativeOperationPlanV1({
    schemaVersion: 1,
    registration: r,
    sourceCommit: "a".repeat(40),
    sourceTreeDigest: d("f"),
    adapter,
  });
  const auth = createNormativeOperationAuthorizationV1({
    schemaVersion: 1,
    authorizationId: "auth:normative",
    issuerId: "operator:test",
    audience: "agentplat:normative",
    credentialId: "credential:test",
    signatureAlgorithm: "ed25519",
    planDigest: plan.planDigest,
    registrationDigest: r.registrationDigest,
    sourceCommit: "a".repeat(40),
    sourceTreeDigest: d("f"),
    adapterDigest: adapter.descriptorDigest,
    executionId: "execution:normative",
    shardIndices: [0],
    authorizedAt: "2026-08-03T00:00:00Z",
    expiresAt: "2026-08-04T00:00:00Z",
    maximumCells: 5,
    authentication: {
      schemaVersion: 1,
      credentialId: "credential:test",
      algorithm: "ed25519",
      signature: Buffer.alloc(64, 1).toString("base64url"),
    },
  });
  return { r, adapter, plan, auth, ...change };
}
async function run(change = {}) {
  const x = fixture(change);
  const now = change.now || (() => Date.parse("2026-08-03T01:00:00Z"));
  return runCollectiveStatisticalCampaignNormativeOperationV1({
    schemaVersion: 1,
    registration: x.r,
    descriptor: x.adapter,
    plan: x.plan,
    authorization: x.auth,
    authorizationAudience: "agentplat:normative",
    authorizationVerifier: {
      schemaVersion: 1,
      verifyDetachedAuthorizationV1: () => true,
    },
    source: change.source || {
      commit: "a".repeat(40),
      treeDigest: d("f"),
      clean: true,
    },
    shardIndex: change.shardIndex ?? 0,
    workerId: "worker:test",
    leaseDurationMs: 1000,
    store:
      change.store ||
      createMemoryCollectiveStatisticalCampaignExecutionStoreV1(now),
    artifacts: change.artifacts || writer(),
    now,
    adapterResolver: change.adapterResolver || {
      schemaVersion: 1,
      resolveRegisteredAdapterV1: (binding) => {
        change.onResolve?.(binding);
        return {
          schemaVersion: 1,
          descriptorDigest: x.adapter.descriptorDigest,
          implementationDigest: x.adapter.digests.implementationDigest,
          evaluatorDigest: x.adapter.digests.evaluatorDigest,
          runner: {
            schemaVersion: 1,
            executeV1: ({ runner }) => ({
              schemaVersion: 1,
              status: "passed",
              reasonCode: null,
              outcome: { runner },
              traceRecords: change.traceRecords || [{ event: "terminal" }],
              ledgerRecords: [],
              observations: [],
            }),
          },
          projector: {
            schemaVersion: 1,
            projectV1: ({ execution }) => {
              change.onProject?.(execution);
              return projection(
                execution,
                x.r,
                change.projectionChange?.(execution) || {},
              );
            },
          },
        };
      },
    },
  });
}

test("runs only the exact contiguous five-cell shard and closes twenty evaluator projections", async () => {
  const result = await run();
  assert.equal(result.selectedCellCount, 5);
  assert.equal(result.projectionCount, 20);
  assert.equal(result.projectionArtifactIndexes.length, 20);
});
test("replay validation accepts bounded execution evidence above the generic JSON limit", async () => {
  const traceRecords = Array.from({ length: 2_000 }, (_, index) => ({
    event: `terminal:${String(index).padStart(4, "0")}:${"x".repeat(128)}`,
  }));
  assert.ok(JSON.stringify(traceRecords).length > 262_144);

  const result = await run({ traceRecords });
  assert.equal(result.projectionCount, 20);
  assert.equal(result.executedSlotCount, 20);
});
test("resolves the signed adapter through the trusted registry before mutation", async () => {
  let lookup;
  const result = await run({
    onResolve(value) {
      lookup = value;
    },
  });
  assert.match(result.executionId, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(result.authorizationExecutionId, "execution:normative");
  assert.equal(
    lookup.purpose,
    "collective-statistical-campaign-normative-adapter-v1",
  );
  assert.match(lookup.authorizationDigest, /^sha256:[a-f0-9]{64}$/u);
  const stable = fixture();
  const { authorizationDigest: _digest, ...authorizationInput } = stable.auth;
  const resigned = createNormativeOperationAuthorizationV1({
    ...authorizationInput,
    authentication: {
      ...authorizationInput.authentication,
      signature: Buffer.alloc(64, 2).toString("base64url"),
    },
  });
  assert.equal(
    collectiveStatisticalCampaignNormativeExecutionIdV1({
      schemaVersion: 1,
      registration: stable.r,
      descriptor: stable.adapter,
      plan: stable.plan,
      authorization: resigned,
    }),
    result.executionId,
  );
  await assert.rejects(
    run({
      adapterResolver: {
        schemaVersion: 1,
        resolveRegisteredAdapterV1: () => ({
          schemaVersion: 1,
          descriptorDigest: d("0"),
          implementationDigest: d("1"),
          evaluatorDigest: d("e"),
          runner: {
            schemaVersion: 1,
            executeV1: () => {
              throw new Error("must not run");
            },
          },
          projector: {
            schemaVersion: 1,
            projectV1: () => {
              throw new Error("must not project");
            },
          },
        }),
      },
    }),
    /adapter_resolution_invalid/u,
  );
});
test("rejects non-normative adapters before runner execution", async () => {
  const x = fixture({ adapter: descriptor("synthetic_conformance") });
  const plan = createNormativeOperationPlanV1({
    schemaVersion: 1,
    registration: x.r,
    sourceCommit: "a".repeat(40),
    sourceTreeDigest: d("f"),
    adapter: x.adapter,
  });
  await assert.rejects(run({ ...x, plan }), /adapter_not_normative/u);
});
test("rejects a legacy execution store before resolving the normative adapter", async () => {
  const memory = createMemoryCollectiveStatisticalCampaignExecutionStoreV1();
  const legacy = {
    schemaVersion: 1,
    readExecutionStateV1: memory.readExecutionStateV1,
    compareAndSwapExecutionStateV1: memory.compareAndSwapExecutionStateV1,
    readExecutionsV1: memory.readExecutionsV1,
    commitExecutionV1: memory.commitExecutionV1,
  };
  let resolved = false;
  await assert.rejects(
    run({
      store: legacy,
      onResolve() {
        resolved = true;
      },
    }),
    /port_invalid/u,
  );
  assert.equal(resolved, false);
});
test("rejects authorization/source expiry, wrong shard, invalid projection, and replay divergence", async () => {
  const x = fixture();
  const { authorizationDigest, ...body } = x.auth;
  const expired = createNormativeOperationAuthorizationV1({
    ...body,
    expiresAt: "2026-08-03T00:30:00Z",
  });
  await assert.rejects(
    run({ auth: expired }),
    /not valid|authorization_invalid/u,
  );
  const { authorizationDigest: _activeDigest, ...activeBody } = x.auth;
  const expiresDuringExecution = createNormativeOperationAuthorizationV1({
    ...activeBody,
    expiresAt: "2026-08-03T01:00:00.003Z",
  });
  let logicalNow = Date.parse("2026-08-03T01:00:00.000Z");
  await assert.rejects(
    run({
      auth: expiresDuringExecution,
      now: () => logicalNow++,
    }),
    /operation_authorization_expired|operation_expiry|stale_fence/u,
  );
  let projectionStarted = false;
  let artifactWrites = 0;
  await assert.rejects(
    run({
      now: () =>
        Date.parse(
          projectionStarted
            ? "2026-08-04T00:00:00.000Z"
            : "2026-08-03T01:00:00.000Z",
        ),
      onProject() {
        projectionStarted = true;
      },
      artifacts: writer(() => {
        artifactWrites += 1;
      }),
    }),
    /authorization_expired/u,
  );
  assert.equal(artifactWrites, 0);
  await assert.rejects(
    run({
      source: { commit: "b".repeat(40), treeDigest: d("f"), clean: true },
    }),
    /source_or_plan_binding_invalid/u,
  );
  await assert.rejects(run({ shardIndex: 1 }), /authorization_invalid/u);
  await assert.rejects(
    run({
      projectionChange: (e) =>
        e.attempt === "replay" ? { missionOutcome: "partial_success" } : {},
    }),
    /replay_diverged/u,
  );
  await assert.rejects(
    run({ projectionChange: () => ({ registrationDigest: d("0") }) }),
    /projection_binding_invalid/u,
  );
  await assert.rejects(
    run({ projectionChange: () => ({ evaluatorDigest: d("0") }) }),
    /projection_binding_invalid/u,
  );
});
