import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createRuntimeMcpServer, InMemoryIdempotencyStore } from '../dist/index.js';

test('runtime MCP exposes guarded room operations', async () => {
  const calls = [];
  const service = {
    async listRooms() { return []; },
    async createRoom(tenantId, input) { calls.push({ tenantId, input }); return { id: 'room-1', ...input }; },
    async getRoomState() { return { participants: [], artifacts: [] }; },
    async sendMessage() {}, async createTask() {}, async createArtifact() {}, async requestApproval() {}, async listEvents() { return []; },
  };
  const server = createRuntimeMcpServer({
    service,
    principal: { tenantId: 'tenant-a', actorId: 'operator-1' },
    authorizer: { async authorize() {} },
    audit: { async write() {} },
    idempotency: new InMemoryIdempotencyStore(),
    idGenerator: () => 'audit-1',
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const tools = await client.listTools();
  assert.ok(tools.tools.some(tool => tool.name === 'create_room'));
  const created = await client.callTool({ name: 'create_room', arguments: { title: 'Architecture', goal: 'Design', idempotencyKey: 'request-1', confirm: true } });
  assert.equal(created.isError, undefined);
  assert.equal(calls.length, 1);
  await client.callTool({ name: 'create_room', arguments: { title: 'Architecture', goal: 'Design', idempotencyKey: 'request-1', confirm: true } });
  assert.equal(calls.length, 1, 'same idempotency key must not create a second room');
  await client.close(); await server.close();
});
