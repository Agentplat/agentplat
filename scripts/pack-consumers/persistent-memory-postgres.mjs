import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  MemoryRevisionServiceV1,
  resolveMemoryRevisionSnapshotV1,
  AgentDefinitionRegistry,
  RoomService,
} from "@agentplat/rooms";
import {
  createPostgresPool,
  PostgresMemoryRevisionStoreV1,
  PostgresAgentDefinitionRegistryStore,
  PostgresRoomRepository,
  runMemoryRevisionMigrations,
  getMemoryRevisionMigrationStatus,
  runMigrations as runRoomMigrations,
} from "@agentplat/rooms-postgres";
import {
  createTaskDefinitionV1,
  createProcessDefinitionV1,
  InMemoryProcessRunnerV1,
  digestWorkflowJsonV1,
} from "@agentplat/workflows";
import {
  PostgresWorkflowStoreV1,
  runMigrations as runWorkflowMigrations,
} from "@agentplat/workflows-postgres";

// Explicit test opt-in; only a fresh random schema is touched and removed.
assert.equal(
  process.env.AGENTPLAT_POSTGRES_TEST,
  "1",
  "Set AGENTPLAT_POSTGRES_TEST=1 for an isolated test database",
);
const schema = "memory_consumer_" + randomUUID().replaceAll("-", "");
const tenantId = "consumer-test",
  agentId = "stable-adviser";
let pool = createPostgresPool();
let now = "2026-10-17T12:00:00.000Z";
try {
  await runRoomMigrations(pool, { schema, createSchema: true });
  await runMemoryRevisionMigrations(pool, { schema });
  await runWorkflowMigrations(pool, { schema });
  const rooms = new RoomService({
    repository: new PostgresRoomRepository(pool, { schema }),
    clock: () => new Date(now),
  });
  const definitions = new AgentDefinitionRegistry(
    new PostgresAgentDefinitionRegistryStore(pool, { schema }),
  );
  await definitions.createAgent({ tenantId, agentId, name: "Adviser" });
  const { definition } = await definitions.createRevision({
    tenantId,
    agentId,
    version: "1.0.0",
    instructions:
      "Use verified evidence. Respect explicit response preferences.",
    runtimeProfile: {},
  });
  await definitions.publishRevision(tenantId, definition.revisionId, 0);
  const roomA = await rooms.createRoom(tenantId, {
    title: "First conversation",
    goal: "Declare preference",
  });
  const roomB = await rooms.createRoom(tenantId, {
    title: "Another conversation",
    goal: "Use stable-agent preference",
  });
  const human = await rooms.addParticipant(tenantId, roomA.id, {
    type: "human",
    displayName: "Owner",
    role: "owner",
  });
  const participantA = await rooms.addParticipant(tenantId, roomA.id, {
    type: "agent",
    displayName: "Adviser",
    role: "adviser",
    runtime: { platform: "mock" },
    metadata: { agentId },
  });
  const participantB = await rooms.addParticipant(tenantId, roomB.id, {
    type: "agent",
    displayName: "Adviser",
    role: "adviser",
    runtime: { platform: "mock" },
    metadata: { agentId },
  });
  assert.notEqual(participantA.id, participantB.id);
  const declaration = await rooms.sendMessage(tenantId, roomA.id, {
    role: "human",
    authorParticipantId: human.id,
    content: "Please answer concisely in Spanish.",
  });
  const credentials = {
    ownerA: { user: "owner", roomId: roomA.id },
    ownerB: { user: "owner", roomId: roomB.id },
    otherB: { user: "other", roomId: roomB.id },
  };
  const access = {
    authenticate: async (token) =>
      credentials[token]
        ? {
            tenantId,
            actor: { actorId: credentials[token].user, actorType: "human" },
          }
        : null,
    authorize: async (_principal, request) =>
      request.subject.type === "agent" &&
      request.subject.id === agentId &&
      request.audience.kind === "personal",
  };
  const memory = () =>
    new MemoryRevisionServiceV1(
      new PostgresMemoryRevisionStoreV1(pool, { schema }),
      access,
      { clock: () => new Date(now) },
    );
  const input = {
    memoryId: "preference:style",
    operationId: "declare",
    expectedRevision: null,
    subject: { type: "agent", id: agentId },
    audience: { kind: "personal", subjectId: "owner" },
    content: { language: "es", style: "concise" },
    evidenceRefs: [`message:${declaration.id}`],
    observedAt: now,
    validFrom: now,
    status: "active",
    reason: "Explicit user declaration",
  };
  const first = await memory().append("ownerA", input);
  await pool.end();
  pool = createPostgresPool(); // A new pool/service recovers persisted state.
  const recoveredDefinition = await new AgentDefinitionRegistry(
    new PostgresAgentDefinitionRegistryStore(pool, { schema }),
  ).resolvePublishedRevision(tenantId, definition.revisionId);
  assert.deepEqual(recoveredDefinition, definition);
  const snapshot = await resolveMemoryRevisionSnapshotV1(memory(), "ownerB", [
    input.memoryId,
  ]);
  assert.equal(snapshot.entries[0].digest, first.digest);
  assert.equal(snapshot.entries[0].subject.id, agentId);
  await assert.rejects(memory().read("otherB", input.memoryId), {
    code: "FORBIDDEN",
  });
  await assert.rejects(memory().read("unverified", input.memoryId), {
    code: "FORBIDDEN",
  });

  const reopenedRooms = new RoomService({
    repository: new PostgresRoomRepository(pool, { schema }),
    clock: () => new Date(now),
  });
  const prompt =
    definition.instructions +
    "\n" +
    JSON.stringify(snapshot.entries.map((r) => r.content));
  const promptDigest = digestWorkflowJsonV1("effective-prompt", prompt);
  const executionEvidence = {
    schemaVersion: 1,
    roomId: roomB.id,
    participantId: participantB.id,
    agentId,
    definition: {
      revisionId: definition.revisionId,
      digest: definition.digest,
    },
    prompt: { digest: promptDigest, content: prompt },
    memory: snapshot.references,
  };
  const artifact = await reopenedRooms.createArtifact(tenantId, roomB.id, {
    type: "execution.context.v1",
    title: "Exact execution input",
    content: executionEvidence,
    provenance: { sourceMessageIds: [declaration.id] },
    createdBy: participantB.id,
  });
  const artifactReference = `artifact:${artifact.id}@1`;
  const workflows = new PostgresWorkflowStoreV1(pool, { schema });
  const runner = new InMemoryProcessRunnerV1(workflows, {
    taskBindingResolver: {
      resolve: async () => ({
        promptRevision: definition.revisionId,
        promptDigest,
      }),
    },
    taskExecutor: {
      execute: async (request) => {
        assert.equal(request.binding.promptDigest, promptDigest);
        assert.equal(request.processInput.evidenceReference, artifactReference);
        return {
          status: "completed",
          result: {
            answer: "Respuesta breve.",
            evidenceReference: artifactReference,
          },
          resultReference: artifactReference,
        };
      },
    },
  });
  await runner.registerTaskDefinition(
    tenantId,
    createTaskDefinitionV1({
      taskDefinitionId: "answer",
      version: "1",
      name: "Answer",
      handlerKey: "answer",
      handlerDigest: digestWorkflowJsonV1("handler", "deterministic-answer-v1"),
      effectClass: "internal",
    }),
  );
  await runner.registerProcessDefinition(
    tenantId,
    createProcessDefinitionV1({
      processId: "answer",
      version: "1",
      name: "Answer with evidence",
      stages: [
        {
          schemaVersion: 1,
          stageId: "answer",
          name: "Answer",
          kind: "task",
          taskDefinitionId: "answer",
          taskDefinitionVersion: "1",
          dependsOn: [],
        },
      ],
    }),
  );
  await runner.start({
    tenantId,
    runId: "run:conversation-b",
    processId: "answer",
    processVersion: "1",
    operationId: "start",
    idempotencyKey: "answer:conversation-b",
    logicalTime: now,
    input: { evidenceReference: artifactReference },
    subject: { subjectType: "room", subjectId: roomB.id },
  });
  const [task] = await workflows.listTaskRuns({ tenantId });
  assert.equal(task.status, "completed");
  assert.equal(task.binding.promptDigest, promptDigest);
  assert.equal(task.binding.promptRevision, definition.revisionId);

  const correction = await memory().append("ownerB", {
    ...input,
    operationId: "correct",
    expectedRevision: 1,
    content: { language: "es", style: "detailed" },
    reason: "Explicit correction",
  });
  assert.equal(correction.revision, 2);
  assert.equal(
    (await memory().read("ownerA", input.memoryId)).content.style,
    "detailed",
  );
  assert.equal(
    (await memory().read("ownerB", input.memoryId, 1)).digest,
    first.digest,
  );
  await assert.rejects(
    memory().append("ownerB", {
      ...input,
      operationId: "stale-write",
      expectedRevision: 1,
    }),
    { code: "CONFLICT" },
  );
  await memory().append("ownerB", {
    ...input,
    operationId: "retire",
    expectedRevision: 2,
    status: "retired",
    reason: "User withdrew preference",
  });
  assert.equal(await memory().read("ownerB", input.memoryId), undefined);
  await assert.rejects(memory().read("otherB", input.memoryId, 1), {
    code: "FORBIDDEN",
  });
  const raceInput = { ...input, memoryId: "preference:race" };
  await memory().append("ownerA", raceInput);
  const race = await Promise.allSettled(
    ["left", "right"].map((operationId) =>
      memory().append("ownerB", {
        ...raceInput,
        operationId,
        expectedRevision: 1,
        content: operationId,
      }),
    ),
  );
  assert.equal(
    race.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    race.find((result) => result.status === "rejected").reason.code,
    "CONFLICT",
  );
  const timed = {
    ...input,
    memoryId: "preference:temporary",
    operationId: "temporary",
    validUntil: "2026-10-17T13:00:00.000Z",
  };
  await memory().append("ownerA", timed);
  now = timed.validUntil;
  assert.equal(await memory().read("ownerB", timed.memoryId), undefined); // Expiry is filtered, not an exception.
  await assert.rejects(
    memory().append("ownerB", {
      ...timed,
      memoryId: "invalid",
      validUntil: timed.validFrom,
    }),
    { code: "VALIDATION_ERROR" },
  );

  await pool.end();
  pool = createPostgresPool();
  const persistedTask = await new PostgresWorkflowStoreV1(pool, {
    schema,
  }).getTaskRun(tenantId, task.taskRunId);
  const persistedRoom = await new PostgresRoomRepository(pool, {
    schema,
  }).getRoomState(tenantId, roomB.id);
  const persistedEvidence = persistedRoom.artifacts.find(
    (a) => a.id === artifact.id,
  ).versions[0].content;
  assert.deepEqual(persistedEvidence, executionEvidence);
  assert.equal(
    persistedTask.binding.promptDigest,
    persistedEvidence.prompt.digest,
  );
  assert.equal(persistedEvidence.memory[0].revision, 1); // Later correction/retirement cannot rewrite execution evidence.
  assert.equal(
    (await getMemoryRevisionMigrationStatus(pool, { schema })).currentVersion,
    1,
  );
  console.log(
    JSON.stringify({
      passed: true,
      database: "postgresql",
      checks: [
        "cross-conversation-stable-agent",
        "personal-isolation",
        "correction",
        "retirement",
        "expiry",
        "stale-write",
        "competing-writes",
        "exact-definition-and-prompt",
        "immutable-execution-evidence",
        "pool-reopen",
      ],
      memoryDigest: first.digest,
      definitionDigest: definition.digest,
      promptDigest,
      taskBindingDigest: task.binding.bindingDigest,
    }),
  );
} finally {
  await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await pool.end();
}
