// Deterministic transport fixtures exercise real RoomService; no LLM requests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createInterface } from 'node:readline';

test('RoomService preserves participants, assignments and recipient messages', async () => {
  const received = [];
  const server = createServer(async (req, res) => {
    let body = ''; for await (const part of req) body += part;
    received.push(JSON.parse(body));
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ output: 'software fixture', session_id: 'fixture-session' }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const process = spawn('node', ['runtime/dist/rooms.js'], {
    env: { ...globalThis.process.env, STUDY_CONTROLLER: `http://127.0.0.1:${server.address().port}` },
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  const pending = new Map();
  createInterface({ input: process.stdout }).on('line', line => {
    const row = JSON.parse(line), callback = pending.get(row.id);
    pending.delete(row.id); callback(row);
  });
  const rpc = body => new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    pending.set(id, row => row.error ? reject(new Error(row.error)) : resolve(row.result));
    process.stdin.write(JSON.stringify({ id, ...body }) + '\n');
  });
  try {
    assert.deepEqual((await rpc({ op:'init', goal:'software fixture' })).participants,
      ['coordinator','worker-1','worker-2']);
    await assert.rejects(rpc({ op:'assign', actor:'worker-1', recipient:'worker-2',
      instruction:'fixture', expected_output:'fixture' }), /Only the coordinator/);
    await assert.rejects(rpc({ op:'message', actor:'coordinator', recipient:'worker-3', content:'fixture' }), /Unknown recipient/);
    await rpc({ op:'message', actor:'worker-1', recipient:'worker-2', content:'recipient-only fixture' });
    await rpc({ op:'assign', actor:'coordinator', recipient:'worker-1', instruction:'fixture', expected_output:'fixture' });
    let snapshot;
    for (let i=0; i<50; i++) {
      snapshot = await rpc({ op:'snapshot' });
      if (snapshot.state.tasks[0]?.status === 'completed') break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(snapshot.state.tasks[0].status, 'completed', JSON.stringify(received));
    assert.equal(snapshot.state.messages[0].metadata.recipient, 'worker-2');
    assert.equal(received.find(r => r.actor)?.task.instruction, 'fixture');
    assert.equal('transcript' in received.find(r => r.actor), false);
    assert.ok(snapshot.events.some(e => e.type === 'task_run_completed'));
  } finally {
    process.kill(); await new Promise(resolve => process.once('exit', resolve));
    await new Promise(resolve => server.close(resolve));
  }
});
