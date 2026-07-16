import assert from 'node:assert/strict';
import test from 'node:test';

import { A2AHttpServer } from '@agentplat/a2a';
import { McpHttpServer } from '@agentplat/mcp';

import { createInteroperabilityHandler } from '../src/index.ts';

test('routes MCP and a base-path A2A Agent Card without owning auth', async () => {
  const a2a = new A2AHttpServer({
    basePath: '/interop/a2a',
    card: {
      name: 'Agent',
      description: 'Test',
      version: '1.0.0',
      supportedInterfaces: [
        {
          url: 'https://agent.example/interop/a2a',
          protocolBinding: 'HTTP+JSON',
          protocolVersion: '1.0',
        },
      ],
      skills: [],
      defaultInputModes: ['text/plain'],
      defaultOutputModes: ['text/plain'],
    },
    runtime: { run: async () => ({ status: 'completed' }) } as never,
    resolveExecutionContext: async () => undefined,
    resolveAgent: async () => undefined,
  });
  const mcp = new McpHttpServer({
    serverInfo: { name: 'MCP', version: '1.0.0' },
    registry: {
      register: async () => undefined,
      list: async () => [],
      get: async () => undefined,
    },
    resolveExecutionContext: async () => undefined,
  });
  const handle = createInteroperabilityHandler({
    a2a: { path: '/interop/a2a', server: a2a },
    mcp: { path: '/interop/mcp', server: mcp },
  });

  const card = await handle(
    new Request('https://agent.example/interop/a2a/.well-known/agent-card.json')
  );
  assert.equal(card.status, 200);
  assert.equal((await card.json()).name, 'Agent');

  const mcpResponse = await handle(
    new Request('https://agent.example/interop/mcp', {
      method: 'POST',
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })
  );
  assert.equal(mcpResponse.status, 200);
  assert.equal((await mcpResponse.json()).error.code, -32001);
  assert.equal(
    (await handle(new Request('https://agent.example/nope'))).status,
    404
  );
});
