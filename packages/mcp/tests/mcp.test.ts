import assert from 'node:assert/strict';
import test from 'node:test';

import { McpHttpServer, McpRemoteClient } from '../src/index.ts';

test('MCP Streamable HTTP client initializes, lists and calls an allowlisted tool', async () => {
  const definition = {
    id: 'tool-1',
    name: 'echo',
    description: 'Returns the provided message',
    parameters: { type: 'object' as const },
  };
  const registry = {
    register: async () => undefined,
    list: async () => [definition],
    get: async (id: string) =>
      id === definition.id
        ? {
            definition,
            handler: {
              invoke: async (input: Record<string, unknown>) => ({
                ok: true,
                value: { echoed: input.message ?? null },
              }),
            },
          }
        : undefined,
  };
  const server = new McpHttpServer({
    serverInfo: { name: 'test', version: '1.0.0' },
    registry,
    resolveExecutionContext: async () => ({
      tenant: { tenantId: 'tenant-1' },
      allowedToolIds: ['tool-1'],
    }),
  });
  const client = new McpRemoteClient({
    url: 'https://mcp.example/',
    clientInfo: { name: 'test-client', version: '1.0.0' },
    fetch: async (input, init) =>
      server.handle(new Request(String(input), init)),
  });

  assert.deepEqual(await client.listTools(), [
    {
      name: 'echo',
      description: 'Returns the provided message',
      inputSchema: { type: 'object' },
    },
  ]);
  assert.deepEqual(await client.callTool('echo', { message: 'hello' }), {
    content: [{ type: 'text', text: '{"echoed":"hello"}' }],
    structuredContent: { echoed: 'hello' },
  });
});
