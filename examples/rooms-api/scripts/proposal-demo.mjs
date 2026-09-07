import assert from "node:assert/strict";

const base = (process.env.API_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);
const tenant = process.env.AGENTPLAT_TENANT_ID ?? "proposal-demo";
async function request(method, path, body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      "X-Agentplat-Tenant-Id": tenant,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(`${method} ${path}: ${JSON.stringify(result)}`);
  return result.data;
}
if (process.argv[2] === "inspect") {
  if (!process.argv[3])
    throw new Error("Usage: node scripts/proposal-demo.mjs inspect ROOM_ID");
  console.log(
    JSON.stringify(
      await request("GET", `/rooms/${encodeURIComponent(process.argv[3])}`),
      null,
      2,
    ),
  );
} else {
  assert.equal(
    process.argv[2],
    undefined,
    "Expected no argument or inspect ROOM_ID",
  );
  const room = await request("POST", "/rooms", {
    title: "Internal proposal",
    goal: "Research, draft, revise and approve an internal proposal",
  });
  const path = `/rooms/${room.id}`;
  console.log(`Room: ${room.id}`);
  const human = await request("POST", `${path}/participants`, {
    type: "human",
    displayName: "Proposal reviewer",
    role: "owner",
    permissions: ["approve"],
  });
  const agents = [];
  for (const role of ["researcher", "writer"]) {
    agents.push(
      await request("POST", `${path}/participants`, {
        type: "agent",
        displayName: role,
        role,
        permissions: ["task.run.draft"],
        runtime: {
          platform: "proposal",
          instructions: "Use only the supplied facts; mark assumptions.",
        },
      }),
    );
  }
  async function run(agent, stepId, instruction, dependencies = []) {
    const task = await request("POST", `${path}/tasks`, {
      stepId,
      assignedParticipantId: agent.id,
      instruction,
      dependencies,
      expectedOutput: "Reviewable proposal material",
      expectedArtifactKind: stepId,
      actionLevel: "draft",
    });
    const execution = await request("POST", `${path}/tasks/${task.id}/run`, {});
    assert.equal(execution.status, "completed");
    const state = await request("GET", path);
    const artifact = state.artifacts.find(
      (a) => a.provenance.runId === execution.id,
    );
    assert.ok(artifact);
    return { task, artifact };
  }
  async function decide(artifact, decision, comment) {
    const approval = await request("POST", `${path}/approvals`, {
      targetType: "artifact",
      targetId: artifact.id,
      requestedBy: agents[1].id,
    });
    return request("POST", `/approvals/${approval.id}/${decision}`, {
      decidedBy: human.id,
      comment,
    });
  }
  const research = await run(
    agents[0],
    "research",
    "Facts: the internal pilot has two teams and a four-week review period. Identify scope and assumptions.",
  );
  console.log(`Research artifact: ${research.artifact.id}`);
  await decide(research.artifact, "approve", "Research accepted.");
  const draft = await run(
    agents[1],
    "proposal",
    `Draft from research artifact ${research.artifact.id}: ${JSON.stringify(research.artifact.versions.at(-1).content)}`,
    [research.task.id],
  );
  await decide(
    draft.artifact,
    "request-revision",
    "Add a weekly human review and an explicit stop decision after four weeks.",
  );
  const revised = await run(
    agents[1],
    "revision",
    `Revise proposal ${draft.artifact.id}: ${JSON.stringify(draft.artifact.versions.at(-1).content)}. Human feedback: add a weekly human review and an explicit stop decision after four weeks.`,
    [draft.task.id],
  );
  await request("POST", `${path}/artifacts/${draft.artifact.id}/versions`, {
    content: revised.artifact.versions.at(-1).content,
    contentType: "text/plain",
    createdBy: agents[1].id,
  });
  await decide(revised.artifact, "approve", "Revision output accepted.");
  await decide(
    draft.artifact,
    "approve",
    "Version 2 approved for the internal pilot.",
  );
  await request("POST", `${path}/complete`, {});
  const state = await request("GET", path);
  assert.equal(state.room.status, "completed");
  assert.equal(
    state.artifacts.find((a) => a.id === draft.artifact.id).currentVersion,
    2,
  );
  assert.ok(state.approvals.some((a) => a.status === "needs_revision"));
  console.log(
    JSON.stringify(
      {
        room: { id: state.room.id, status: state.room.status },
        tasks: state.tasks.map(({ id, stepId, status }) => ({
          id,
          stepId,
          status,
        })),
        artifacts: state.artifacts.map(
          ({ id, type, status, currentVersion, versions }) => ({
            id,
            type,
            status,
            currentVersion,
            versions: versions.map(({ version, createdBy }) => ({
              version,
              createdBy,
            })),
          }),
        ),
        approvals: state.approvals.map(({ targetId, status, comment }) => ({
          targetId,
          status,
          comment,
        })),
        events: (await request("GET", `${path}/events`)).map(
          ({ type }) => type,
        ),
      },
      null,
      2,
    ),
  );
  console.log(`Inspect: node scripts/proposal-demo.mjs inspect ${room.id}`);
}
