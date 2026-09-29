import assert from "node:assert/strict";
import {
  AgentGovernanceServiceV1,
  AgentInceptionServiceV1,
} from "@agentplat/rooms";

export async function inceptionScenarios({
  store,
  governance,
  definitions,
  rooms,
}) {
  await definitions.createAgent({
    tenantId: "t",
    agentId: "agent",
    name: "Agent",
  });
  const candidate = await definitions.createRevision({
    tenantId: "t",
    agentId: "agent",
    version: "1.0.0",
    instructions: "Consider contributions",
    runtimeProfile: {},
    interaction: {
      schemaVersion: 1,
      interactionMode: "purpose",
      governanceId: "gov",
    },
  });
  await definitions.publishRevision("t", candidate.definition.revisionId, 0);
  const government = new AgentGovernanceServiceV1(
    governance,
    {
      authenticate: async () => ({ tenantId: "t", subjectId: "owner" }),
      authorize: async () => true,
    },
    definitions,
  );
  await government.execute("owner", {
    agentId: "agent",
    operationId: "create",
    expectedRevision: null,
    command: {
      kind: "create",
      governanceId: "gov",
      ownerId: "owner",
      purpose: "Improve retention",
      definitionRevisionId: candidate.definition.revisionId,
    },
  });
  const room = await rooms.createRoom("t", {
    id: "room",
    title: "Retention",
    goal: "Improve retention",
  });
  await rooms.addParticipant("t", room.id, {
    type: "agent",
    displayName: "Agent",
    role: "analyst",
    runtime: { platform: "mock" },
    metadata: { agentId: "agent" },
  });
  const author = await rooms.addParticipant("t", room.id, {
    type: "human",
    displayName: "Owner",
    role: "owner",
  });
  const source = await rooms.sendMessage("t", room.id, {
    role: "human",
    authorParticipantId: author.id,
    content: "Consider improving onboarding.",
  });
  const evidence = await rooms.sendMessage("t", room.id, {
    role: "human",
    authorParticipantId: author.id,
    content: "Customers report onboarding friction.",
  });
  const artifact = await rooms.createArtifact("t", room.id, {
    type: "research",
    title: "Onboarding evidence",
    content: { finding: "friction" },
    createdBy: author.id,
  });
  const artifactVersion = (
    await rooms.getRoomState("t", room.id)
  ).artifacts.find((a) => a.id === artifact.id).versions[0];
  const access = {
    authenticate: async (token) =>
      ["owner", "evaluator", "other"].includes(token)
        ? { tenantId: token === "other" ? "other" : "t", subjectId: token }
        : null,
    authorize: async (p, r) =>
      r.operation === "read" ||
      (r.operation === "submit" && p.subjectId === "owner") ||
      (r.operation === "assess" && p.subjectId === "evaluator"),
  };
  const service = new AgentInceptionServiceV1(store, governance, rooms, access);
  const scope = { agentId: "agent", roomId: room.id, inceptionId: "idea" };
  const submission = {
    ...scope,
    sourceMessageId: source.id,
    expectedGovernanceRevision: 0,
  };
  await assert.rejects(service.submit("unknown", submission), {
    code: "FORBIDDEN",
  });
  await assert.rejects(service.submit("evaluator", submission), {
    code: "FORBIDDEN",
  });
  const intake = await service.submit("owner", submission);
  assert.equal(intake.submittedBy, "owner");
  assert.equal(intake.sourceAuthorParticipantId, author.id);
  assert.equal(intake.content, source.content);
  assert.deepEqual(await service.submit("owner", submission), intake);
  await assert.rejects(
    service.submit("owner", { ...submission, sourceMessageId: evidence.id }),
    { code: "CONFLICT" },
  );
  await assert.rejects(
    service.submit("owner", {
      ...submission,
      inceptionId: "bad-source",
      sourceMessageId: "missing",
    }),
    { code: "NOT_FOUND" },
  );
  await assert.rejects(service.get("other", scope), { code: "NOT_FOUND" });
  await assert.rejects(
    service.get("owner", { ...scope, roomId: "wrong-room" }),
    { code: "NOT_FOUND" },
  );
  const input = (id, rev, disposition = "adopted", gov = 0) => ({
    ...scope,
    assessmentId: id,
    expectedAssessmentRevision: rev,
    expectedGovernanceRevision: gov,
    evaluatorRef: "evaluator-v1",
    disposition,
    explanation: "The proposal addresses onboarding friction.",
    uncertainty: "Evidence is preliminary.",
    reformulation:
      disposition === "reformulated"
        ? "Run a bounded onboarding review first."
        : null,
    evidence: [
      { kind: "message", id: evidence.id },
      { kind: "artifact", id: artifact.id, versionId: artifactVersion.id },
    ],
    proposedWork: ["adopted", "reformulated"].includes(disposition)
      ? [{ proposalId: "review", description: "Draft an onboarding review" }]
      : [],
  });
  await assert.rejects(service.assess("owner", input("forbidden", -1)), {
    code: "FORBIDDEN",
  });
  await assert.rejects(
    service.assess("evaluator", {
      ...input("bad-evidence", -1),
      evidence: [{ kind: "artifact", id: "missing", versionId: "v1" }],
    }),
    { code: "NOT_FOUND" },
  );
  await assert.rejects(
    service.assess("evaluator", {
      ...input("bad-shape", -1),
      executionAuthorized: true,
    }),
    { code: "VALIDATION_ERROR" },
  );
  await assert.rejects(
    service.assess("evaluator", {
      ...input("bad-state", -1, "rejected"),
      proposedWork: [{ proposalId: "illegal", description: "Do work" }],
    }),
    { code: "VALIDATION_ERROR" },
  );
  const outcomes = [
    "adopted",
    "reformulated",
    "rejected",
    "needs_evidence",
    "deferred",
  ];
  let previous = null;
  for (let n = 0; n < outcomes.length; n++) {
    const assessment = await service.assess(
      "evaluator",
      input(`assessment-${n}`, n - 1, outcomes[n]),
    );
    assert.equal(assessment.disposition, outcomes[n]);
    assert.equal(assessment.executionAuthorized, false);
    assert.equal(assessment.previousAssessmentDigest, previous);
    previous = assessment.assessmentDigest;
    assert.match(assessment.evidence[0].digest, /^sha256:[a-f0-9]{64}$/);
  }
  const first = (await service.history("owner", scope))[0];
  await rooms.createArtifactVersion("t", room.id, artifact.id, {
    content: { finding: "updated" },
  });
  assert.equal(first.evidence[1].reference.versionId, artifactVersion.id);
  assert.deepEqual(
    await service.assess("evaluator", input("assessment-0", -1)),
    first,
  );
  await assert.rejects(
    service.assess("evaluator", {
      ...input("assessment-0", -1),
      explanation: "Changed",
    }),
    { code: "CONFLICT" },
  );
  const race = await Promise.allSettled(
    ["race-a", "race-b"].map((id) => service.assess("evaluator", input(id, 4))),
  );
  assert.equal(race.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(
    race.find((x) => x.status === "rejected").reason.code,
    "CONFLICT",
  );
  assert.equal((await service.history("owner", scope, 3, 1))[0].revision, 4);
  await government.execute("owner", {
    agentId: "agent",
    operationId: "purpose-1",
    expectedRevision: 0,
    command: { kind: "purpose", purpose: "Improve onboarding retention" },
  });
  await assert.rejects(service.assess("evaluator", input("stale", 5)), {
    code: "CONFLICT",
  });
  assert.deepEqual(
    await service.assess("evaluator", input("assessment-0", -1)),
    first,
  );
  const reassessed = await service.assess(
    "evaluator",
    input("new-purpose", 5, "needs_evidence", 1),
  );
  assert.equal(reassessed.governance.revision, 1);
  // Change governance after service reads it but before the adapter commits.
  const racingStore = {
    get: store.get.bind(store),
    assessment: store.assessment.bind(store),
    latest: store.latest.bind(store),
    history: store.history.bind(store),
    insert: store.insert.bind(store),
    append: async (record) => {
      await government.execute("owner", {
        agentId: "agent",
        operationId: "purpose-2",
        expectedRevision: 1,
        command: {
          kind: "purpose",
          purpose: "Improve retention with better evidence",
        },
      });
      return store.append(record);
    },
  };
  const racingService = new AgentInceptionServiceV1(
    racingStore,
    governance,
    rooms,
    access,
  );
  await assert.rejects(
    racingService.assess("evaluator", input("fenced", 6, "adopted", 1)),
    { code: "CONFLICT" },
  );
  assert.equal((await service.history("owner", scope)).length, 7);
  assert.equal(
    await store.assessment("t", "agent", "idea", "fenced"),
    undefined,
  );
  const same = input("same", 6, "adopted", 2);
  assert.deepEqual(
    ...(await Promise.all([
      service.assess("evaluator", same),
      service.assess("evaluator", same),
    ])),
  );
  const state = await rooms.getRoomState("t", room.id);
  assert.equal(state.tasks.length, 0);
  assert.equal(state.runs.length, 0);
  assert.equal(state.approvals.length, 0);
  assert.equal(
    (await governance.load("t", "agent")).configuration.purpose,
    "Improve retention with better evidence",
  );
  assert.equal((await governance.load("t", "agent")).status, "suspended");
  await assert.rejects(
    definitions.resolvePublishedRevision("t", candidate.definition.revisionId),
    /qualified purpose mission execution is required/,
  );
  return {
    intake,
    history: await service.history("owner", scope),
    service,
    scope,
    access,
  };
}
