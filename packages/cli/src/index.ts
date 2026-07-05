import type { JsonObject } from '@agentplat/core';

export type AgentPlatCommandName =
  | 'new'
  | 'dev'
  | 'add'
  | 'generate'
  | 'doctor';

export interface AgentPlatCommandContext {
  cwd: string;
  env: Record<string, string | undefined>;
  options?: JsonObject;
}

export interface AgentPlatCommandResult {
  ok: boolean;
  message?: string;
  details?: JsonObject;
}

export interface AgentPlatCommand {
  name: AgentPlatCommandName;
  run(context: AgentPlatCommandContext): Promise<AgentPlatCommandResult>;
}
