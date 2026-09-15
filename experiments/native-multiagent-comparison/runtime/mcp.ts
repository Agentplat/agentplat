// Same SDK and schema library as @agentplat/mcp-runtime; no custom MCP protocol.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({ name: 'native-eval', version: '0.1.0' });
const schemas = {
  finish: {}, state: {}, report: { content: z.string().min(1) },
  message: { recipient: z.enum(['coordinator','worker-1','worker-2']), content: z.string().min(1) },
  assign: { recipient: z.enum(['worker-1','worker-2']), instruction: z.string().min(1), expected_output: z.string().min(1) },
};
for (const [name, inputSchema] of Object.entries(schemas)) {
  if (process.env.STUDY_ARM === 'agent-teams' && name !== 'finish') continue;
  server.registerTool(name, { description: `Study coordination: ${name}`, inputSchema }, async (args: Record<string, unknown>) => {
    const response = await fetch(`${process.env.STUDY_CONTROLLER}/tool`, {
      method: 'POST', headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ actor: process.env.STUDY_ACTOR, name, arguments: args }),
    });
    return { content: [{ type:'text' as const, text: await response.text() }], isError: !response.ok };
  });
}
await server.connect(new StdioServerTransport());
