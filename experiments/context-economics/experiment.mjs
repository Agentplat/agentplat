import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { InMemoryEventBus } from "@agentplat/events";
import {
  BoundedContextBuilder,
  InMemoryRoomRepository,
  RoomService,
} from "@agentplat/rooms";
import { createMockRuntime } from "@agentplat/runtime-mock";

const tenant = "context-experiment";
const bytes = (value) => Buffer.byteLength(JSON.stringify(value));

// Fixtures are created through the real Room service; no model calls or effects.
export async function fixture(historyLength, scenario) {
  let sequence = 0;
  let time = Date.parse("2026-09-14T00:00:00Z");
  const service = new RoomService({
    repository: new InMemoryRoomRepository(),
    eventPublisher: new InMemoryEventBus(),
    runtime: createMockRuntime(),
    idGenerator: () => `context-${++sequence}`,
    clock: () => new Date(time++),
  });
  const room = await service.createRoom(tenant, {
    title: "Proposal review",
    goal: "Prepare the current proposal for human review",
  });
  await service.addParticipant(tenant, room.id, {
    id: "human",
    type: "human",
    displayName: "Reviewer",
    role: "owner",
    permissions: ["*"],
    authorityLevel: 10,
  });
  const participant = await service.addParticipant(tenant, room.id, {
    id: "writer",
    type: "agent",
    displayName: "Writer",
    role: "writer",
    memoryScope: "agent",
    runtime: { platform: "mock", instructions: "Draft only" },
  });
  const critical = await service.sendMessage(tenant, room.id, {
    authorParticipantId: "human",
    role: "human",
    content:
      "The budget ceiling is USD 12000, excluding tax. Never publish without approval of the current artifact version.",
  });
  const artifact = await service.createArtifact(tenant, room.id, {
    type: "proposal",
    title: "Proposal",
    content: "Version 1: budget USD 11000; scope A.",
  });
  const approval = await service.requestApproval(tenant, room.id, {
    targetType: "artifact",
    targetId: artifact.id,
    ...(scenario === "expired"
      ? { expiresAt: new Date(time + 1000).toISOString() }
      : {}),
  });
  if (scenario === "expired") {
    time += 2000;
    await service.expireApproval(tenant, approval.id, {
      expiredBy: "expiry-worker",
      expectedExpiresAt: approval.expiresAt,
    });
  } else {
    await service.resolveApproval(tenant, approval.id, "approved", {
      decidedBy: "human",
    });
  }
  if (scenario === "revised")
    await service.createArtifactVersion(tenant, room.id, artifact.id, {
      content: "Version 2: budget USD 11500; scope B. Requires new review.",
    });
  for (let i = 0; i < historyLength; i++) {
    await service.sendMessage(tenant, room.id, {
      authorParticipantId: "writer",
      role: "agent",
      content: `Progress ${i}: ${"Routine background observation. ".repeat(40)}`,
    });
  }
  // Displace the relevant artifact from the default ten-artifact window.
  for (let i = 0; i < 12; i++)
    await service.createArtifact(tenant, room.id, {
      type: "note",
      title: `Background ${i}`,
      content: "Unrelated notes. ".repeat(60),
    });
  await service.addParticipant(tenant, room.id, {
    id: "other-agent",
    type: "agent",
    displayName: "Other agent",
    role: "researcher",
    runtime: { platform: "mock" },
  });
  await service.writeMemory(tenant, room.id, {
    scope: "agent",
    scopeId: "other-agent",
    content: "PRIVATE_SENTINEL",
    source: "fixture",
  });
  await service.writeMemory(tenant, room.id, {
    scope: "room",
    content: "EXPIRED_SENTINEL",
    source: "fixture",
    retention: "until",
    retainUntil: "2020-01-01T00:00:00Z",
  });
  const task = await service.createTask(tenant, room.id, {
    stepId: "review",
    assignedParticipantId: participant.id,
    instruction: `Review artifact ${artifact.id}, recover the budget constraint and determine whether the current version has an approval.`,
    expectedOutput: "Draft and review status",
    expectedArtifactKind: "note",
  });
  return {
    state: await service.getRoomState(tenant, room.id),
    task,
    participant,
    now: time,
    manifest: { messageIds: [critical.id], artifactIds: [artifact.id] },
    scenario,
  };
}

// Research-only selection policy. References are supplied by the application,
// not inferred from text. The existing builder remains responsible for memory.
export function assemble(input, policy, maxBytes = 32000) {
  const { state, task, participant, now, manifest } = input;
  if (!["bounded", "full", "selective"].includes(policy))
    throw new Error("unknown policy");
  if (
    state.room.tenantId !== participant.tenantId ||
    !state.participants.some((item) => item.id === participant.id) ||
    task.tenantId !== state.room.tenantId
  )
    throw new Error("scope mismatch");
  const options = { clock: () => new Date(now) };
  if (policy === "full")
    Object.assign(options, {
      transcriptLimit: state.messages.length,
      artifactLimit: state.artifacts.length,
      memoryLimit: state.memory.length,
    });
  if (policy === "selective")
    Object.assign(options, { transcriptLimit: 2, artifactLimit: 0 });
  const context = new BoundedContextBuilder(options).build(
    state,
    task,
    participant,
  );
  let retrievalBytes = 0;
  if (policy === "selective") {
    for (const id of manifest.messageIds) {
      const message = state.messages.find(
        (item) =>
          item.id === id &&
          item.roomId === state.room.id &&
          item.tenantId === state.room.tenantId,
      );
      if (!message) throw new Error("required message unavailable");
      if (!context.transcript.some((item) => item.id === id)) {
        context.transcript.unshift(message);
        retrievalBytes += bytes(message);
      }
    }
    const selected = state.artifacts.filter(
      (item) =>
        manifest.artifactIds.includes(item.id) &&
        item.roomId === state.room.id &&
        item.tenantId === state.room.tenantId,
    );
    if (selected.length !== new Set(manifest.artifactIds).size)
      throw new Error("required artifact unavailable");
    for (const artifact of selected)
      if (
        !artifact.versions.some(
          (version) => version.version === artifact.currentVersion,
        )
      )
        throw new Error("current version unavailable");
    context.artifacts = new BoundedContextBuilder({
      ...options,
      artifactLimit: selected.length,
    }).build({ ...state, artifacts: selected }, task, participant).artifacts;
    retrievalBytes += bytes(context.artifacts);
    context.provenance.messageIds = context.transcript.map((item) => item.id);
    context.provenance.artifactIds = context.artifacts.map((item) => item.id);
  }
  // Identical supplemental records for every arm. These are contextual evidence,
  // never execution permission, and do not change AssembledTaskContext's API.
  const approvalEvidence = state.approvals.filter(
    (item) =>
      item.tenantId === state.room.tenantId &&
      item.roomId === state.room.id &&
      item.targetType === "artifact" &&
      manifest.artifactIds.includes(item.targetId),
  );
  const envelope = { context, approvalEvidence };
  if (policy === "selective" && bytes(envelope) > maxBytes)
    throw new Error("required context exceeds budget");
  return { envelope, retrievalBytes };
}

export function score(input, envelope) {
  const { context, approvalEvidence } = envelope;
  const constraintOmissions = input.manifest.messageIds.filter((id) => {
    const original = input.state.messages.find((item) => item.id === id);
    return !context.transcript.some(
      (item) => item.id === id && item.content === original?.content,
    );
  }).length;
  const original = input.state.artifacts.find(
    (item) => item.id === input.manifest.artifactIds[0],
  );
  const selected = context.artifacts.find((item) => item.id === original.id);
  const current = original.versions.find(
    (item) => item.version === original.currentVersion,
  );
  const currentArtifactAvailable =
    !!selected &&
    selected.currentVersion === current.version &&
    JSON.stringify(selected.content) === JSON.stringify(current.content);
  const reviewStatus = !currentArtifactAvailable
    ? "unknown"
    : approvalEvidence.some(
          (item) =>
            item.targetId === original.id &&
            item.targetVersion === selected.currentVersion &&
            item.status === "approved" &&
            (!item.expiresAt || Date.parse(item.expiresAt) > input.now),
        )
      ? "approved"
      : "needs-review";
  const expectedStatus =
    input.scenario === "approved" ? "approved" : "needs-review";
  return {
    constraintOmissions,
    currentArtifactAvailable,
    reviewStatus,
    reviewStatusCorrect: reviewStatus === expectedStatus,
    privateOrExpiredMemoryExposed: /PRIVATE_SENTINEL|EXPIRED_SENTINEL/.test(
      JSON.stringify(envelope),
    ),
  };
}

export async function run() {
  const rows = [];
  for (const historyLength of [20, 100, 300])
    for (const scenario of ["approved", "revised", "expired"]) {
      const input = await fixture(historyLength, scenario);
      for (const policy of ["bounded", "full", "selective"]) {
        const start = performance.now();
        const { envelope, retrievalBytes } = assemble(input, policy);
        const serializedBytes = bytes(envelope);
        rows.push({
          historyLength,
          scenario,
          policy,
          serializedBytes,
          tokenProxyBytesDiv4: Math.ceil(serializedBytes / 4),
          retrievalBytes,
          localAssemblyMs: performance.now() - start,
          ...score(input, envelope),
        });
      }
    }
  return {
    evidenceClass: "deterministic synthetic context-selection experiment",
    modelCalls: 0,
    actualTokens: null,
    inferenceCost: null,
    endToEndLatencyMs: null,
    answerQuality: null,
    repeatedWork: null,
    rows,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.log(JSON.stringify(await run(), null, 2));
