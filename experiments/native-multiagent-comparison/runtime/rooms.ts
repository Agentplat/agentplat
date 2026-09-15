import { createInterface } from 'node:readline';
import { RoomService, InMemoryRoomRepository, BoundedContextBuilder } from '@agentplat/rooms';
import { DefaultAgentRuntime, type AgentProvider } from '@agentplat/runtime';

type Actor = 'coordinator' | 'worker-1' | 'worker-2';
type Operation =
  | { op: 'init'; goal: string }
  | { op: 'assign'; actor: Actor; recipient: Actor; instruction: string; expected_output: string }
  | { op: 'message'; actor: Actor; recipient: Actor; content: string }
  | { op: 'state'; actor: Actor }
  | { op: 'snapshot' };

const actors = ['coordinator', 'worker-1', 'worker-2'];
const tenant = 'native-eval';
const roomId = 'trial';
const active = new Set<string>();
const runtime = new DefaultAgentRuntime();
async function controller(body: object, signal?: AbortSignal) {
  const response = await fetch(`${process.env.STUDY_CONTROLLER}/provider`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal,
  });
  if (!response.ok) throw new Error(`Controller returned ${response.status}`);
  return await response.json() as { output: string; session_id: string };
}
const provider: AgentProvider = {
  async run(agent, input, context) {
    const assembled = typeof input.input === 'string' ? null : input.input[0];
    const result = await controller({ actor: agent.id, task: assembled?.task,
      run_id: context.runId }, context.signal);
    return { status: 'completed', output: result.output, conversationId: result.session_id };
  },
};
runtime.registerProvider('claude-pty', provider);
const rooms = new RoomService({ repository: new InMemoryRoomRepository(), runtime,
  contextBuilder: new BoundedContextBuilder({ transcriptLimit: 0, artifactLimit: 0, memoryLimit: 0 }),
  runTimeoutMs: Number(process.env.STUDY_TIMEOUT_MS ?? 1200000) });

async function operate(request: Operation) {
  if (request.op === 'init') {
    await rooms.createRoom(tenant, { id: roomId, title: 'Harbor trial', goal: request.goal });
    for (const id of actors) await rooms.addParticipant(tenant, roomId, {
      id, type: 'agent', displayName: id, role: id,
      permissions: ['task.run'],
      runtime: { platform: 'claude-pty', modelName: 'claude-sonnet-4-6' },
    });
    return { participants: actors };
  }
  if (request.op === 'snapshot') return {
    state: await rooms.getRoomState(tenant, roomId), events: await rooms.listEvents(tenant, roomId),
  };
  if (!actors.includes(request.actor)) throw new Error('Unknown participant');
  if (request.op === 'state') {
    const state = await rooms.getRoomState(tenant, roomId);
    return { tasks: state.tasks, artifacts: state.artifacts, participants: actors };
  }
  if (!actors.includes(request.recipient)) throw new Error('Unknown recipient');
  if (request.op === 'message') {
    const message = await rooms.sendMessage(tenant, roomId, {
      authorParticipantId: request.actor, role: 'agent', content: request.content,
      metadata: { recipient: request.recipient },
    });
    await controller({ message, recipient: request.recipient });
    return { message_id: message.id };
  }
  if (request.actor !== 'coordinator' || request.recipient === 'coordinator')
    throw new Error('Only the coordinator can assign the two workers');
  if (active.has(request.recipient)) throw new Error('Worker already has an active task');
  active.add(request.recipient);
  const task = await rooms.createTask(tenant, roomId, {
    stepId: crypto.randomUUID(), assignedParticipantId: request.recipient,
    instruction: request.instruction, expectedOutput: request.expected_output,
    expectedArtifactKind: 'report',
  }, request.actor).catch(error => { active.delete(request.recipient); throw error; });
  void rooms.runTask(tenant, roomId, task.id)
    .catch(async error => { await controller({ incident: String(error), task_id: task.id }); })
    .finally(() => { active.delete(request.recipient); });
  return { task_id: task.id };
}

// Correlated JSON lines allow a long provider call and independent room messages.
const lines = createInterface({ input: process.stdin });
for await (const line of lines) {
  const request = JSON.parse(line) as Operation & { id: string };
  void operate(request).then(
    result => process.stdout.write(JSON.stringify({ id: request.id, result }) + '\n'),
    error => process.stdout.write(JSON.stringify({ id: request.id, error: String(error) }) + '\n'),
  );
}
