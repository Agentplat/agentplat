import {
  AgentPlatError,
  type AgentPlatID,
  type JsonObject,
  type JsonValue,
  type Metadata,
  type TenantContext,
} from '@agentplat/core';
import type {
  ToolDefinition,
  ToolHandler,
  ToolInvocationContext,
  ToolInvocationResult,
  ToolRegistry,
} from '@agentplat/tools';

/** The latest stable MCP revision supported by this package. */
export const MCP_PROTOCOL_VERSION = '2025-11-25';

export interface McpServerDefinition {
  id: AgentPlatID;
  name: string;
  /** `http` is the Streamable HTTP transport. `sse` is retained for legacy registrations. */
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

export interface McpClientInfo extends JsonObject {
  name: string;
  version: string;
}

export interface McpServerInfo extends JsonObject {
  name: string;
  version: string;
}

export interface McpRemoteTool {
  name: string;
  description?: string;
  inputSchema?: JsonObject;
}

export interface McpToolCallResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: JsonObject;
  isError?: boolean;
}

export type McpRequestHeaders = Record<string, string>;

export interface McpRemoteClientOptions {
  /** Streamable HTTP MCP endpoint. */
  url: string;
  clientInfo: McpClientInfo;
  /** Injected for tests or runtimes that do not expose global fetch. */
  fetch?: typeof globalThis.fetch;
  /** Use this to supply short-lived OAuth tokens; never store them in a server definition. */
  headers?: () => McpRequestHeaders | Promise<McpRequestHeaders>;
}

interface McpJsonRpcError {
  code: number;
  message: string;
  data?: JsonValue;
}

interface McpJsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: JsonObject;
  error?: McpJsonRpcError;
}

/**
 * Small dependency-free Streamable HTTP client for the MCP tool surface.
 *
 * It intentionally owns only protocol framing. Credential acquisition,
 * redirects, SSRF protection and tenant policy belong to the caller's HTTP
 * client or gateway.
 */
export class McpRemoteClient {
  private initialized = false;
  private requestSequence = 0;
  private sessionId?: string;
  private readonly fetchImplementation: typeof globalThis.fetch;

  constructor(private readonly options: McpRemoteClientOptions) {
    this.fetchImplementation = options.fetch ?? globalThis.fetch;
    if (!this.fetchImplementation) {
      throw new AgentPlatError(
        'ADAPTER_ERROR',
        'An MCP fetch implementation is required'
      );
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const result = await this.request(
      'initialize',
      {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: this.options.clientInfo,
      },
      false
    );

    const version = result.protocolVersion;
    if (typeof version !== 'string') {
      throw new AgentPlatError(
        'ADAPTER_ERROR',
        'MCP server did not return a protocol version'
      );
    }

    await this.notify('notifications/initialized');
    this.initialized = true;
  }

  async listTools(): Promise<McpRemoteTool[]> {
    await this.initialize();
    const result = await this.request('tools/list', {});
    const tools = result.tools;
    if (!Array.isArray(tools)) {
      throw new AgentPlatError(
        'ADAPTER_ERROR',
        'MCP server returned an invalid tools/list response'
      );
    }

    return tools.map((tool) => parseRemoteTool(tool));
  }

  async callTool(
    name: string,
    arguments_: JsonObject
  ): Promise<McpToolCallResult> {
    await this.initialize();
    const result = await this.request('tools/call', {
      name,
      arguments: arguments_,
    });
    const content = result.content;
    if (!Array.isArray(content)) {
      throw new AgentPlatError(
        'ADAPTER_ERROR',
        'MCP server returned an invalid tools/call response'
      );
    }

    return {
      content: content.map((item) => parseTextContent(item)),
      ...(isJsonObject(result.structuredContent)
        ? { structuredContent: result.structuredContent }
        : {}),
      ...(typeof result.isError === 'boolean'
        ? { isError: result.isError }
        : {}),
    };
  }

  private async request(
    method: string,
    params: JsonObject,
    requireInitialization = true
  ): Promise<JsonObject> {
    if (requireInitialization && !this.initialized) {
      throw new AgentPlatError(
        'ADAPTER_ERROR',
        `MCP client must initialize before calling ${method}`
      );
    }

    const id = ++this.requestSequence;
    const response = await this.send({ jsonrpc: '2.0', id, method, params });
    if (response.status < 200 || response.status >= 300) {
      throw new AgentPlatError(
        'ADAPTER_ERROR',
        `MCP server returned HTTP ${response.status}`,
        {
          statusCode: response.status,
          details: (await response.text()).slice(0, 1_000),
        }
      );
    }

    const payload = await parseJsonRpcResponse(response);
    if (payload.error) {
      throw new AgentPlatError(
        'ADAPTER_ERROR',
        `MCP ${method} failed: ${payload.error.message}`,
        {
          details: payload.error,
        }
      );
    }
    if (!payload.result) {
      throw new AgentPlatError(
        'ADAPTER_ERROR',
        `MCP ${method} returned no result`
      );
    }
    return payload.result;
  }

  private async notify(method: string): Promise<void> {
    const response = await this.send({ jsonrpc: '2.0', method });
    if (response.status < 200 || response.status >= 300) {
      throw new AgentPlatError(
        'ADAPTER_ERROR',
        `MCP notification ${method} returned HTTP ${response.status}`,
        {
          statusCode: response.status,
        }
      );
    }
  }

  private async send(payload: JsonObject): Promise<Response> {
    const extraHeaders = (await this.options.headers?.()) ?? {};
    const headers: McpRequestHeaders = {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'mcp-protocol-version': MCP_PROTOCOL_VERSION,
      ...extraHeaders,
    };
    if (this.sessionId) headers['mcp-session-id'] = this.sessionId;

    const response = await this.fetchImplementation(this.options.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    const returnedSessionId = response.headers.get('mcp-session-id');
    if (returnedSessionId) this.sessionId = returnedSessionId;
    return response;
  }
}

export interface McpToolImporterOptions {
  client: McpRemoteClient;
  registry: ToolRegistry;
  serverId: AgentPlatID;
  /** Namespace imported tools so they cannot collide with local names. */
  namePrefix?: string;
}

/** Registers remote MCP tools as governed AgentPlat tools. */
export class McpToolImporter {
  constructor(private readonly options: McpToolImporterOptions) {}

  async sync(): Promise<McpToolBinding[]> {
    const remoteTools = await this.options.client.listTools();
    const prefix = this.options.namePrefix ?? `${this.options.serverId}.`;
    const bindings: McpToolBinding[] = [];

    for (const remoteTool of remoteTools) {
      const definition: ToolDefinition = {
        id: `${this.options.serverId}:${remoteTool.name}`,
        name: `${prefix}${remoteTool.name}`,
        description:
          remoteTool.description ?? `Remote MCP tool ${remoteTool.name}`,
        parameters: asToolParameterSchema(remoteTool.inputSchema),
        metadata: {
          mcpServerId: this.options.serverId,
          mcpToolName: remoteTool.name,
        },
      };
      await this.options.registry.register(
        definition,
        new McpImportedToolHandler(this.options.client, remoteTool.name)
      );
      bindings.push({
        serverId: this.options.serverId,
        tool: definition,
        externalName: remoteTool.name,
      });
    }

    return bindings;
  }
}

class McpImportedToolHandler implements ToolHandler {
  constructor(
    private readonly client: McpRemoteClient,
    private readonly remoteName: string
  ) {}

  async invoke(
    input: JsonObject,
    _context: ToolInvocationContext
  ): Promise<ToolInvocationResult> {
    const result = await this.client.callTool(this.remoteName, input);
    if (result.isError) {
      return {
        ok: false,
        errorMessage:
          result.content.map((item) => item.text).join('\n') ||
          'Remote MCP tool failed',
      };
    }

    return {
      ok: true,
      value:
        result.structuredContent ??
        result.content.map((item) => item.text).join('\n'),
    };
  }
}

export interface McpServerExecutionContext {
  tenant: TenantContext;
  runId?: AgentPlatID;
  credentials?: Record<string, string>;
  metadata?: Metadata;
  /** Omit to allow every tool; production resolvers should always set this. */
  allowedToolIds?: AgentPlatID[];
}

export interface McpHttpServerOptions {
  serverInfo: McpServerInfo;
  registry: ToolRegistry;
  /**
   * Authentication and tenant resolution are deliberately host-owned. Returning
   * undefined rejects the request before any tool metadata or behavior leaks.
   */
  resolveExecutionContext(
    request: Request
  ): Promise<McpServerExecutionContext | undefined>;
}

/**
 * Fetch-compatible MCP server for the tools surface.
 *
 * Mount `handle` in Hono, Next.js, Lambda adapters or any Web Request runtime.
 * It does not add CORS, authentication or network egress policy on purpose.
 */
export class McpHttpServer {
  constructor(private readonly options: McpHttpServerOptions) {}

  async handle(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: { allow: 'POST' },
      });
    }

    let message: JsonObject;
    try {
      message = asJsonObject(await request.json());
    } catch {
      return this.jsonRpcError(null, -32700, 'Parse error');
    }

    const id = jsonRpcId(message.id);
    const method =
      typeof message.method === 'string' ? message.method : undefined;
    if (message.jsonrpc !== '2.0' || !method) {
      return this.jsonRpcError(id, -32600, 'Invalid Request');
    }

    if (method === 'notifications/initialized') {
      return new Response(null, { status: 202 });
    }

    try {
      const context = await this.options.resolveExecutionContext(request);
      if (!context) {
        return this.jsonRpcError(id, -32001, 'Unauthorized');
      }

      switch (method) {
        case 'initialize':
          return this.jsonRpcResult(id, {
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities: { tools: { listChanged: false } },
            serverInfo: this.options.serverInfo,
          });
        case 'tools/list':
          return this.listTools(id, context);
        case 'tools/call':
          if (!isJsonObject(message.params)) {
            return this.jsonRpcError(
              id,
              -32602,
              'tools/call requires object params'
            );
          }
          return this.callTool(id, message.params, context);
        default:
          return this.jsonRpcError(id, -32601, `Method not found: ${method}`);
      }
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : 'Internal server error';
      return this.jsonRpcError(id, -32603, messageText);
    }
  }

  private async listTools(
    id: string | number | null,
    context: McpServerExecutionContext
  ): Promise<Response> {
    const tools = await this.options.registry.list();
    const allowed = filterAllowedTools(tools, context.allowedToolIds);
    return this.jsonRpcResult(id, {
      tools: allowed.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: toolSchemaAsJsonObject(tool.parameters),
      })),
    });
  }

  private async callTool(
    id: string | number | null,
    params: JsonObject,
    context: McpServerExecutionContext
  ): Promise<Response> {
    const name = params.name;
    if (typeof name !== 'string' || !name) {
      return this.jsonRpcError(id, -32602, 'tools/call requires a tool name');
    }
    if (params.arguments !== undefined && !isJsonObject(params.arguments)) {
      return this.jsonRpcError(
        id,
        -32602,
        'tools/call arguments must be an object'
      );
    }
    const input = params.arguments ?? {};
    const tool = (await this.options.registry.list()).find(
      (candidate) => candidate.name === name
    );
    if (!tool || !isToolAllowed(tool.id, context.allowedToolIds)) {
      return this.jsonRpcError(id, -32602, `Tool is not available: ${name}`);
    }

    const registered = await this.options.registry.get(tool.id);
    if (!registered) {
      return this.jsonRpcError(id, -32602, `Tool is not available: ${name}`);
    }

    const result = await registered.handler.invoke(input, {
      tenant: context.tenant,
      toolId: tool.id,
      ...(context.runId ? { runId: context.runId } : {}),
      ...(context.credentials ? { credentials: context.credentials } : {}),
      ...(context.metadata ? { metadata: context.metadata } : {}),
    });
    return this.jsonRpcResult(id, toolResultToMcp(result));
  }

  private jsonRpcResult(
    id: string | number | null,
    result: JsonObject
  ): Response {
    return Response.json({ jsonrpc: '2.0', id, result });
  }

  private jsonRpcError(
    id: string | number | null,
    code: number,
    message: string
  ): Response {
    return Response.json({ jsonrpc: '2.0', id, error: { code, message } });
  }
}

function asToolParameterSchema(
  schema: JsonObject | undefined
): ToolDefinition['parameters'] {
  if (!schema || schema.type !== 'object') return { type: 'object' };
  return schema as unknown as ToolDefinition['parameters'];
}

function toolSchemaAsJsonObject(
  schema: ToolDefinition['parameters']
): JsonObject {
  return schema as unknown as JsonObject;
}

function parseRemoteTool(value: unknown): McpRemoteTool {
  const tool = asJsonObject(value);
  if (typeof tool.name !== 'string' || !tool.name) {
    throw new AgentPlatError('ADAPTER_ERROR', 'MCP tool is missing its name');
  }
  return {
    name: tool.name,
    ...(typeof tool.description === 'string'
      ? { description: tool.description }
      : {}),
    ...(isJsonObject(tool.inputSchema)
      ? { inputSchema: tool.inputSchema }
      : {}),
  };
}

function parseTextContent(value: unknown): { type: 'text'; text: string } {
  const content = asJsonObject(value);
  if (content.type !== 'text' || typeof content.text !== 'string') {
    throw new AgentPlatError(
      'ADAPTER_ERROR',
      'MCP tool content must be a text block'
    );
  }
  return { type: 'text', text: content.text };
}

async function parseJsonRpcResponse(
  response: Response
): Promise<McpJsonRpcResponse> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new AgentPlatError('ADAPTER_ERROR', 'MCP server did not return JSON');
  }
  const value = asJsonObject(payload);
  if (value.jsonrpc !== '2.0' || !('id' in value)) {
    throw new AgentPlatError(
      'ADAPTER_ERROR',
      'MCP server returned an invalid JSON-RPC response'
    );
  }
  return {
    jsonrpc: '2.0',
    id: jsonRpcId(value.id),
    ...(isJsonObject(value.result) ? { result: value.result } : {}),
    ...(isJsonObject(value.error)
      ? { error: parseJsonRpcError(value.error) }
      : {}),
  };
}

function parseJsonRpcError(value: JsonObject): McpJsonRpcError {
  if (typeof value.code !== 'number' || typeof value.message !== 'string') {
    throw new AgentPlatError(
      'ADAPTER_ERROR',
      'MCP server returned an invalid JSON-RPC error'
    );
  }
  return {
    code: value.code,
    message: value.message,
    ...(isJsonValue(value.data) ? { data: value.data } : {}),
  };
}

function toolResultToMcp(result: ToolInvocationResult): JsonObject {
  if (!result.ok) {
    return {
      content: [
        { type: 'text', text: result.errorMessage ?? 'Tool execution failed' },
      ],
      isError: true,
    };
  }

  const value = result.value ?? null;
  return {
    content: [
      {
        type: 'text',
        text: typeof value === 'string' ? value : JSON.stringify(value),
      },
    ],
    ...(isJsonObject(value) ? { structuredContent: value } : {}),
  };
}

function filterAllowedTools(
  tools: ToolDefinition[],
  allowedToolIds: AgentPlatID[] | undefined
): ToolDefinition[] {
  return allowedToolIds
    ? tools.filter((tool) => isToolAllowed(tool.id, allowedToolIds))
    : tools;
}

function isToolAllowed(
  toolId: AgentPlatID,
  allowedToolIds: AgentPlatID[] | undefined
): boolean {
  return !allowedToolIds || allowedToolIds.includes(toolId);
}

function asJsonObject(value: unknown): JsonObject {
  if (!isJsonObject(value)) {
    throw new AgentPlatError('VALIDATION_ERROR', 'Expected a JSON object');
  }
  return value;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
    return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isJsonObject(value) && Object.values(value).every(isJsonValue);
}

function jsonRpcId(value: unknown): string | number | null {
  return typeof value === 'string' ||
    typeof value === 'number' ||
    value === null
    ? value
    : null;
}
