import assert from "node:assert/strict";
import test from "node:test";

import { digestPlanningJsonV1 } from "@agentplat/collective-planning";
import {
  InMemoryTeamStructureAdaptationStoreV1,
  InMemoryTeamStructureObservationAdmissionPortV1,
  TeamStructureAdaptationRuntimeV1,
  createTeamStructureAdaptationPolicyV1,
  createTeamStructureAdaptationRequestV1,
  createTeamStructureMaterializationV1,
  createTeamStructureObservationV1,
  createTeamStructureTemplateCatalogV1,
  createTeamStructureTemplatePositionV1,
  createTeamStructureTemplateV1,
  validateTeamStructureMaterializationV1,
} from "../packages/collective-runtime/dist/team-structure-adaptation.js";

const sha = (character = "a") => `sha256:${character.repeat(64)}`;

function position(
  templatePositionId,
  roleKey,
  dependsOnTemplatePositionIds = [],
) {
  return createTeamStructureTemplatePositionV1({
    schemaVersion: 1,
    templatePositionId,
    roleKey,
    requiredCapabilityKeys: [roleKey],
    completionCriteria: [`${roleKey}-complete`],
    dependsOnTemplatePositionIds,
    budgetUnits: 10,
    maximumActionBudgetUnits: 5,
  });
}

function template(id, role) {
  return createTeamStructureTemplateV1({
    schemaVersion: 1,
    templateId: id,
    templateVersion: 1,
    positions: [position(`${id}.position`, role)],
  });
}

function fixture(policyOverrides = {}, runtimeOverrides = {}) {
  const baseline = template("template.baseline", "research");
  const alternate = template("template.alternate", "review");
  const catalog =
    runtimeOverrides.catalog ??
    createTeamStructureTemplateCatalogV1({
      schemaVersion: 1,
      catalogId: "catalog",
      catalogVersion: 1,
      parentCatalogDigest: null,
      baselineTemplateId: baseline.templateId,
      templates: [baseline, alternate],
    });
  const { limits: limitOverrides = {}, ...topLevelOverrides } = policyOverrides;
  const policy =
    runtimeOverrides.policy ??
    createTeamStructureAdaptationPolicyV1({
      schemaVersion: 1,
      policyId: "policy",
      policyVersion: 1,
      parentPolicyDigest: null,
      learningStepMicros: 10,
      minimumObservationCount: 2,
      initialWeightMicros: 100,
      minimumWeightMicros: 10,
      maximumWeightMicros: 200,
      baselineProbabilityFloorBps: 0,
      explorationCapBps: 0,
      cooldownEpochs: 0,
      hysteresisMicros: 0,
      quarantineEpochs: 3,
      limits: {
        maximumTemplates: 4,
        maximumPositionsPerTemplate: 4,
        maximumDependenciesPerPosition: 3,
        maximumObservations: 16,
        maximumDecisions: 8,
        maximumCommitAttempts: 3,
        maximumDecisionTtlMs: 100,
        ...limitOverrides,
      },
      ...topLevelOverrides,
    });
  const admission =
    runtimeOverrides.admission ??
    new InMemoryTeamStructureObservationAdmissionPortV1({
      admissionId: "admission",
      admissionVersion: 1,
      implementationId: "admission.memory",
    });
  const runtime = new TeamStructureAdaptationRuntimeV1({
    stateKey: runtimeOverrides.stateKey ?? "state",
    adaptationId: "adaptation",
    adaptationVersion: 1,
    implementationId: "implementation",
    catalog,
    policy,
    observationAdmission: admission,
    store:
      runtimeOverrides.store ?? new InMemoryTeamStructureAdaptationStoreV1(),
  });
  return { baseline, alternate, catalog, policy, admission, runtime };
}

function request(id, currentAdaptationEpoch, logicalTimeMs, overrides = {}) {
  return createTeamStructureAdaptationRequestV1({
    schemaVersion: 1,
    requestId: id,
    currentAdaptationEpoch,
    nextAdaptationEpoch: currentAdaptationEpoch + 1,
    logicalTimeMs,
    validUntilLogicalMs: logicalTimeMs + 10,
    eligibleTemplateIds: ["template.baseline", "template.alternate"],
    explorationDrawBps: 9_999,
    entropyEvidenceDigest: sha(),
    ...overrides,
  });
}

function observation({
  id,
  executionId,
  executionEpoch = 1,
  template,
  teamEpoch,
  observedAtLogicalMs,
  outcome = "completed",
  completedPositionCount = outcome === "completed"
    ? template.positions.length
    : 0,
  adaptationEpoch = teamEpoch,
  decisionDigest = sha("3"),
}) {
  return createTeamStructureObservationV1({
    schemaVersion: 1,
    observationId: id,
    executionStateDigest: sha("e"),
    executionId,
    executionEpoch,
    executionRecordDigest: sha("f"),
    terminalExecutionStatus:
      outcome === "completed" ? "completed" : "recovery_required",
    proposalDigest: sha("1"),
    jointWorkContractDigest: sha("2"),
    adaptationEpoch,
    decisionDigest,
    teamId: "team",
    teamEpoch,
    templateId: template.templateId,
    templateDigest: template.templateDigest,
    outcome,
    completedPositionCount,
    failedPositionCount: outcome === "failed" ? 1 : 0,
    unsafePositionCount: outcome === "unsafe" ? 1 : 0,
    observedAtLogicalMs,
  });
}

async function admitAndObserve(fixtureValue, value) {
  fixtureValue.admission.admit(value);
  return fixtureValue.runtime.observe(value);
}

test("template DAG validation and canonical materialization reject translated-edge tampering", () => {
  const first = position("template.graph.first", "research");
  const second = position("template.graph.second", "review", [
    first.templatePositionId,
  ]);
  const graph = createTeamStructureTemplateV1({
    schemaVersion: 1,
    templateId: "template.graph",
    templateVersion: 1,
    positions: [second, first],
  });
  const catalog = createTeamStructureTemplateCatalogV1({
    schemaVersion: 1,
    catalogId: "graph.catalog",
    catalogVersion: 1,
    parentCatalogDigest: null,
    baselineTemplateId: graph.templateId,
    templates: [graph],
  });
  const materialization = createTeamStructureMaterializationV1({
    templateId: graph.templateId,
    catalog,
    bindings: [
      {
        templatePositionId: second.templatePositionId,
        positionId: "position.second",
        workItemId: "work.second",
        workItemRevision: 1,
      },
      {
        templatePositionId: first.templatePositionId,
        positionId: "position.first",
        workItemId: "work.first",
        workItemRevision: 1,
      },
    ],
  });
  assert.deepEqual(
    materialization.bindings.map((binding) => binding.templatePositionId),
    [first.templatePositionId, second.templatePositionId],
  );
  assert.deepEqual(
    materialization.positions.find(
      (value) => value.positionId === "position.second",
    ).dependsOnPositionIds,
    ["position.first"],
  );

  const tamperedPositions = materialization.positions.map((value) => {
    if (value.positionId !== "position.second") return value;
    const { positionDigest: ignored, ...positionBody } = value;
    void ignored;
    const changedBody = { ...positionBody, dependsOnPositionIds: [] };
    return {
      ...changedBody,
      positionDigest: digestPlanningJsonV1("team-position", changedBody),
    };
  });
  const tamperedBody = {
    schemaVersion: 1,
    templateId: materialization.templateId,
    templateDigest: materialization.templateDigest,
    bindings: materialization.bindings,
    positions: tamperedPositions,
  };
  const tampered = {
    ...tamperedBody,
    materializationDigest: digestPlanningJsonV1(
      "team-structure-materialization",
      tamperedBody,
    ),
  };
  assert.throws(
    () => validateTeamStructureMaterializationV1(tampered, { catalog }),
    /translated graph/,
  );

  const cyclicFirst = position("cycle.first", "one", ["cycle.second"]);
  const cyclicSecond = position("cycle.second", "two", ["cycle.first"]);
  assert.throws(
    () =>
      createTeamStructureTemplateV1({
        schemaVersion: 1,
        templateId: "cycle",
        templateVersion: 1,
        positions: [cyclicFirst, cyclicSecond],
      }),
    /must be a DAG/,
  );
});

test("only terminal, provenance-admitted observations can learn", async () => {
  const value = fixture();
  assert.throws(
    () =>
      createTeamStructureObservationV1({
        schemaVersion: 1,
        observationId: "active",
        executionStateDigest: sha(),
        executionId: "execution.active",
        executionEpoch: 1,
        executionRecordDigest: sha("b"),
        terminalExecutionStatus: "active",
        proposalDigest: sha("c"),
        jointWorkContractDigest: sha("d"),
        adaptationEpoch: 1,
        decisionDigest: sha("3"),
        teamId: "team",
        teamEpoch: 1,
        templateId: value.baseline.templateId,
        templateDigest: value.baseline.templateDigest,
        outcome: "incomplete",
        completedPositionCount: 0,
        failedPositionCount: 0,
        unsafePositionCount: 0,
        observedAtLogicalMs: 1,
      }),
    /terminal execution status/,
  );
  const provenanceDecision = await value.runtime.recommend(
    request("provenance.one", 0, 1, {
      eligibleTemplateIds: [value.baseline.templateId],
    }),
  );
  const revisionBeforeRejectedObservations = (await value.runtime.loadState())
    .revision;
  const unverified = observation({
    id: "unverified",
    executionId: "execution.unverified",
    template: value.baseline,
    teamEpoch: 1,
    decisionDigest: provenanceDecision.decisionDigest,
    observedAtLogicalMs: 2,
  });
  await assert.rejects(
    value.runtime.observe(unverified),
    /provenance was not admitted/,
  );
  const inconsistent = observation({
    id: "inconsistent",
    executionId: "execution.inconsistent",
    template: value.baseline,
    teamEpoch: 1,
    decisionDigest: provenanceDecision.decisionDigest,
    observedAtLogicalMs: 3,
    completedPositionCount: 0,
  });
  value.admission.admit(inconsistent);
  await assert.rejects(
    value.runtime.observe(inconsistent),
    /does not cover the template/,
  );
  assert.equal(
    (await value.runtime.loadState()).revision,
    revisionBeforeRejectedObservations,
  );
});

test("epoch high-water is exact and future epoch skips are rejected", async () => {
  const value = fixture();
  await value.runtime.recommend(request("request.one", 0, 10));
  await assert.rejects(
    value.runtime.recommend(request("request.future", 3, 20)),
    /does not match state high-water/,
  );
  const next = await value.runtime.recommend(request("request.two", 1, 30));
  assert.equal(next.adaptationEpoch, 2);
});

test("observations require a stored selection and late unsafe evidence quarantines current cycles", async () => {
  const value = fixture();
  const boundDecision = await value.runtime.recommend(
    request("bound.one", 0, 10, {
      eligibleTemplateIds: [value.baseline.templateId],
    }),
  );

  const wrongTemplate = observation({
    id: "wrong-template",
    executionId: "execution.wrong-template",
    template: value.alternate,
    teamEpoch: 1,
    adaptationEpoch: 1,
    decisionDigest: boundDecision.decisionDigest,
    observedAtLogicalMs: 11,
  });
  value.admission.admit(wrongTemplate);
  await assert.rejects(
    value.runtime.observe(wrongTemplate),
    /not bound to a stored decision/u,
  );

  await value.runtime.recommend(
    request("bound.two", 1, 20, {
      eligibleTemplateIds: [value.alternate.templateId],
    }),
  );
  await value.runtime.recommend(
    request("bound.three", 2, 30, {
      eligibleTemplateIds: [value.alternate.templateId],
    }),
  );
  const lateUnsafe = observation({
    id: "late-unsafe",
    executionId: "execution.late-unsafe",
    template: value.baseline,
    teamEpoch: 1,
    adaptationEpoch: 1,
    decisionDigest: boundDecision.decisionDigest,
    observedAtLogicalMs: 40,
    outcome: "unsafe",
  });
  value.admission.admit(lateUnsafe);
  const learned = await value.runtime.observe(lateUnsafe);
  assert.equal(
    learned.arms.find((arm) => arm.templateId === value.baseline.templateId)
      .quarantinedUntilEpoch,
    6,
  );
  assert.equal(
    (await value.runtime.recommend(request("bound.four", 3, 50)))
      .selectedTemplateId,
    value.alternate.templateId,
  );
});

test("categorical outcomes must match terminal execution facts", () => {
  const value = fixture();
  assert.throws(
    () =>
      createTeamStructureObservationV1({
        schemaVersion: 1,
        observationId: "cancelled-completed",
        executionStateDigest: sha("e"),
        executionId: "execution.cancelled-completed",
        executionEpoch: 1,
        executionRecordDigest: sha("f"),
        terminalExecutionStatus: "cancelled",
        proposalDigest: sha("1"),
        jointWorkContractDigest: sha("2"),
        adaptationEpoch: 1,
        decisionDigest: sha("3"),
        teamId: "team",
        teamEpoch: 1,
        templateId: value.baseline.templateId,
        templateDigest: value.baseline.templateDigest,
        outcome: "completed",
        completedPositionCount: 1,
        failedPositionCount: 0,
        unsafePositionCount: 0,
        observedAtLogicalMs: 1,
      }),
    /contradicts terminal execution facts/u,
  );
});

test("old exact replay succeeds while request ID and target epoch conflicts fail", async () => {
  const value = fixture();
  const firstRequest = request("request.one", 0, 10);
  const first = await value.runtime.recommend(firstRequest);
  await value.runtime.recommend(request("request.two", 1, 20));
  const beforeReplay = await value.runtime.loadState();
  const replay = await value.runtime.recommend(firstRequest);
  assert.equal(replay.decisionDigest, first.decisionDigest);
  assert.equal(
    (await value.runtime.loadState()).revision,
    beforeReplay.revision,
  );
  await assert.rejects(
    value.runtime.recommend(request("request.one", 2, 30)),
    /request ID conflicts/,
  );
  await assert.rejects(
    value.runtime.recommend(request("request.other", 0, 30)),
    /target epoch conflicts/,
  );
});

test("handoff preserves bounded decision history and old replay identity", async () => {
  const source = fixture();
  const firstRequest = request("request.one", 0, 10);
  const first = await source.runtime.recommend(firstRequest);
  await source.runtime.recommend(request("request.two", 1, 20));
  const handoff = await source.runtime.exportHandoff({
    targetStateKey: "state.target",
    logicalTimeMs: 30,
  });
  const target = fixture(
    {},
    {
      stateKey: "state.target",
      catalog: source.catalog,
      policy: source.policy,
    },
  );
  const restored = await target.runtime.importHandoff({
    handoff,
    logicalTimeMs: 30,
  });
  assert.equal(restored.decisions.length, 2);
  assert.equal(
    restored.lastDecision.decisionDigest,
    handoff.sourceState.lastDecision.decisionDigest,
  );
  assert.equal(
    (await target.runtime.recommend(firstRequest)).decisionDigest,
    first.decisionDigest,
  );
});

test("minimum samples are enforced per arm and unsafe baseline uses explicit fallback", async () => {
  const value = fixture();
  const firstAlternateDecision = await value.runtime.recommend(
    request("request.one", 0, 10, {
      eligibleTemplateIds: [value.alternate.templateId],
    }),
  );
  assert.equal(
    firstAlternateDecision.selectedTemplateId,
    value.alternate.templateId,
  );
  await admitAndObserve(
    value,
    observation({
      id: "alternate.one",
      executionId: "execution.one",
      template: value.alternate,
      teamEpoch: 1,
      decisionDigest: firstAlternateDecision.decisionDigest,
      observedAtLogicalMs: 20,
    }),
  );
  const secondAlternateDecision = await value.runtime.recommend(
    request("request.two", 1, 30, {
      eligibleTemplateIds: [value.alternate.templateId],
    }),
  );
  assert.equal(
    secondAlternateDecision.selectedTemplateId,
    value.alternate.templateId,
  );
  await admitAndObserve(
    value,
    observation({
      id: "alternate.two",
      executionId: "execution.two",
      template: value.alternate,
      teamEpoch: 1,
      adaptationEpoch: 2,
      decisionDigest: secondAlternateDecision.decisionDigest,
      observedAtLogicalMs: 40,
    }),
  );
  const mature = await value.runtime.recommend(request("request.three", 2, 50));
  assert.equal(mature.selectedTemplateId, value.alternate.templateId);
  assert.equal(mature.selectionMode, "exploit");

  const unsafe = fixture();
  const unsafeBaselineDecision = await unsafe.runtime.recommend(
    request("unsafe.one", 0, 10, {
      eligibleTemplateIds: [unsafe.baseline.templateId],
    }),
  );
  await admitAndObserve(
    unsafe,
    observation({
      id: "baseline.unsafe",
      executionId: "execution.unsafe",
      template: unsafe.baseline,
      teamEpoch: 1,
      decisionDigest: unsafeBaselineDecision.decisionDigest,
      observedAtLogicalMs: 20,
      outcome: "unsafe",
    }),
  );
  const fallback = await unsafe.runtime.recommend(request("unsafe.two", 1, 30));
  assert.equal(fallback.selectedTemplateId, unsafe.alternate.templateId);
  assert.equal(fallback.selectionMode, "safe_fallback");
});

test("catalog position/dependency and decision-history limits fail closed", async () => {
  const first = position("large.first", "research");
  const second = position("large.second", "review", [first.templatePositionId]);
  const large = createTeamStructureTemplateV1({
    schemaVersion: 1,
    templateId: "template.large",
    templateVersion: 1,
    positions: [first, second],
  });
  const catalog = createTeamStructureTemplateCatalogV1({
    schemaVersion: 1,
    catalogId: "large.catalog",
    catalogVersion: 1,
    parentCatalogDigest: null,
    baselineTemplateId: large.templateId,
    templates: [large],
  });
  await assert.rejects(
    fixture(
      { limits: { maximumPositionsPerTemplate: 1 } },
      { catalog },
    ).runtime.loadState(),
    /position limit/,
  );
  await assert.rejects(
    fixture(
      { limits: { maximumDependenciesPerPosition: 0 } },
      { catalog },
    ).runtime.loadState(),
    /dependency limit/,
  );

  const bounded = fixture({ limits: { maximumDecisions: 1 } });
  await bounded.runtime.recommend(request("bounded.one", 0, 10));
  await assert.rejects(
    bounded.runtime.recommend(request("bounded.two", 1, 20)),
    /history is full/,
  );
});
