import type { AgentPlatID, Metadata } from '@agentplat/core';
import type { ToolDefinition } from '@agentplat/tools';

export interface McpServerDefinition {
  id: AgentPlatID;
  name: string;
  transport: 'stdio' | 'http' | 'sse';
  command?: string;
  args?: string[];
  url?: string;
  metadata?: Metadata;
}

export interface McpToolBinding {
  serverId: AgentPlatID;
  tool: ToolDefinition;
  externalName?: string;
}

export interface McpRegistry {
  registerServer(server: McpServerDefinition): Promise<void>;
  listServers(): Promise<McpServerDefinition[]>;
  listTools(serverId: AgentPlatID): Promise<McpToolBinding[]>;
}
