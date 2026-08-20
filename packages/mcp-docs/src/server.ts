import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { handleRequest } from './index.js';

const root = process.env.AGENTPLAT_ROOT;
const server = new McpServer({ name: 'agentplat-docs', version: '0.3.0-beta.3' });

const resources = [
  ['architecture', 'agentplat://docs/architecture'],
  ['agent-rooms', 'agentplat://docs/agent-rooms'],
  ['ai-context', 'agentplat://docs/ai-context'],
  ['examples', 'agentplat://docs/examples'],
  ['agentplat-spec-v1', 'agentplat://spec/agentplat-v1'],
  ['agent-mesh-spec', 'agentplat://spec/agent-mesh'],
  ['capability-evidence', 'agentplat://research/capability-evidence'],
] as const;
for (const [name, uri] of resources) {
  server.registerResource(name, uri, { title: `AgentPlat ${name}`, mimeType: uri.endsWith('evidence') ? 'application/json' : 'text/markdown' }, async () => {
    const response = handleRequest({ method: 'resources/read', params: { uri } }, root);
    if (!response.ok) throw new Error(response.error);
    const result = response.result as { mimeType: string; text: string };
    return { contents: [{ uri, mimeType: result.mimeType, text: result.text }] };
  });
}

function call(name: string, args: Record<string, unknown>) {
  const response = handleRequest({ method: 'tools/call', params: { name, arguments: args } }, root);
  if (!response.ok) return { content: [{ type: 'text' as const, text: response.error }], isError: true };
  return { content: [{ type: 'text' as const, text: JSON.stringify(response.result, null, 2) }] };
}

server.registerTool('search_agentplat_docs', { description: 'Search canonical AgentPlat documentation.', inputSchema: { query: z.string(), limit: z.number().int().min(1).max(50).optional() } }, args => call('search_agentplat_docs', args));
server.registerTool('get_concept', { description: 'Retrieve a canonical AgentPlat concept.', inputSchema: { name: z.string() } }, args => call('get_concept', args));
server.registerTool('get_spec', { description: 'Retrieve the AgentPlat v1 specification.', inputSchema: {} }, args => call('get_spec', args));
server.registerTool('find_code_example', { description: 'Find executable AgentPlat examples.', inputSchema: { topic: z.string().optional() } }, args => call('find_code_example', args));
server.registerTool('get_package_api', { description: 'Locate package API documentation.', inputSchema: { package: z.string() } }, args => call('get_package_api', args));
server.registerTool('map_requirements', { description: 'Map architecture requirements to AgentPlat components.', inputSchema: { requirements: z.array(z.string()) } }, args => call('map_requirements', args));
server.registerTool('get_validation_status', { description: 'Return implementation/evidence boundary information.', inputSchema: {} }, args => call('get_validation_status', args));
server.registerTool('get_citation', { description: 'Return canonical citation metadata.', inputSchema: {} }, args => call('get_citation', args));

export async function startServer() { await server.connect(new StdioServerTransport()); }
