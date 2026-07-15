import { Agent, OpenAIProvider, Runner, fileSearchTool } from '@openai/agents';
import type {
  AgentInputItem,
  ModelSettings,
  OpenAIProviderOptions,
} from '@openai/agents';

import { AgentPlatError } from '@agentplat/core';
import type { JsonObject, JsonValue, Metadata } from '@agentplat/core';
import type {
  AgentDefinition,
  AgentProvider,
  AgentRunInput,
  AgentRunResult,
  AgentStreamEvent,
  RuntimeExecutionContext,
} from '@agentplat/runtime';

export type OpenAIApiKeyResolver = (
  context: RuntimeExecutionContext
) => Promise<string | undefined> | string | undefined;

export interface OpenAIAgentProviderOptions {
  /** Static key for single-tenant services. Prefer apiKeyResolver for multi-tenant runtimes. */
  apiKey?: string;
  apiKeyResolver?: OpenAIApiKeyResolver;
  baseURL?: string;
  organization?: string;
  project?: string;
  useResponses?: boolean;
  useResponsesWebSocket?: boolean;
  defaultModel?: string;
  /** Tracing is disabled by default so tenant credentials and data never use global tracing state. */
  tracingDisabled?: boolean;
  traceIncludeSensitiveData?: boolean;
}

export interface OpenAIFileCitation {
  fileId: string;
  filename?: string;
  quote?: string;
}

export interface OpenAIAgentBuildResult {
  agent: Agent;
  model: string | undefined;
}

type OpenAIRunContext = {
  tenantId: string;
  organizationId?: string;
  workspaceId?: string;
  agentId: string;
  runId?: string;
  mode: 'invoke' | 'chat';
  policies?: JsonObject;
  metadata?: Metadata;
  inputMetadata?: Metadata;
};

const DEFAULT_INSTRUCTIONS = 'You are a helpful assistant.';

export class OpenAIAgentProvider implements AgentProvider {
  constructor(private readonly options: OpenAIAgentProviderOptions = {}) {}

  async run(
    definition: AgentDefinition,
    input: AgentRunInput,
    context: RuntimeExecutionContext
  ): Promise<AgentRunResult> {
    const startedAt = performance.now();
    const apiKey = await this.resolveApiKey(context);
    const modelProvider = this.createModelProvider(apiKey);
    const { agent, model } = createOpenAIAgent(definition, {
      defaultModel: this.options.defaultModel,
    });
    const runner = this.createRunner(modelProvider, definition.name);

    try {
      const result = await runner.run(
        agent,
        toAgentInput(input.input),
        buildRunOptions(input, context)
      );
      const citations = extractOpenAIFileCitations(result.rawResponses);
      const responseDetails: JsonObject = {};
      if (result.lastResponseId) {
        responseDetails.lastResponseId = result.lastResponseId;
      }
      if (citations.length > 0) {
        responseDetails.citations = citations.map(toCitationJson);
      }

      return {
        runId: context.runId,
        conversationId: input.conversationId,
        status: 'completed',
        output: stringifyOutput(result.finalOutput),
        result: responseDetails,
        metadata: compactMetadata({
          provider: 'openai',
          model,
          latencyMs: elapsedMilliseconds(startedAt),
        }),
      };
    } catch (error) {
      throw toAdapterError(error);
    } finally {
      await modelProvider.close();
    }
  }

  async *stream(
    definition: AgentDefinition,
    input: AgentRunInput,
    context: RuntimeExecutionContext
  ): AsyncIterable<AgentStreamEvent> {
    const startedAt = performance.now();
    yield { type: 'started', runId: context.runId };

    let modelProvider: OpenAIProvider | undefined;
    try {
      const apiKey = await this.resolveApiKey(context);
      modelProvider = this.createModelProvider(apiKey);
      const { agent } = createOpenAIAgent(definition, {
        defaultModel: this.options.defaultModel,
      });
      const runner = this.createRunner(modelProvider, definition.name);
      const result = await runner.run(agent, toAgentInput(input.input), {
        ...buildRunOptions(input, context),
        stream: true,
      });

      for await (const token of result.toTextStream()) {
        yield { type: 'token', runId: context.runId, content: token };
      }
      await result.completed;

      const citations = extractOpenAIFileCitations(result.rawResponses);
      const payload: JsonObject = {};
      payload.latencyMs = elapsedMilliseconds(startedAt);
      if (result.lastResponseId) payload.lastResponseId = result.lastResponseId;
      if (citations.length > 0) {
        payload.citations = citations.map(toCitationJson);
      }
      yield {
        type: 'completed',
        runId: context.runId,
        content: stringifyOutput(result.finalOutput),
        payload,
      };
    } catch (error) {
      const adapterError = toAdapterError(error);
      yield {
        type: 'failed',
        runId: context.runId,
        content: adapterError.message,
      };
      throw adapterError;
    } finally {
      await modelProvider?.close();
    }
  }

  private async resolveApiKey(
    context: RuntimeExecutionContext
  ): Promise<string> {
    const resolved =
      (await this.options.apiKeyResolver?.(context)) ??
      context.credentials?.openaiApiKey ??
      context.credentials?.apiKey ??
      this.options.apiKey;

    if (!resolved?.trim()) {
      throw new AgentPlatError(
        'UNAUTHORIZED',
        'An OpenAI API key is required for this execution',
        { statusCode: 401 }
      );
    }
    return resolved;
  }

  private createModelProvider(apiKey: string): OpenAIProvider {
    const providerOptions: OpenAIProviderOptions = {
      apiKey,
      baseURL: this.options.baseURL,
      organization: this.options.organization,
      project: this.options.project,
      useResponses: this.options.useResponses,
      useResponsesWebSocket: this.options.useResponsesWebSocket,
    };
    return new OpenAIProvider(providerOptions);
  }

  private createRunner(
    modelProvider: OpenAIProvider,
    workflowName: string
  ): Runner {
    return new Runner({
      modelProvider,
      workflowName,
      tracingDisabled: this.options.tracingDisabled ?? true,
      traceIncludeSensitiveData:
        this.options.traceIncludeSensitiveData ?? false,
    });
  }
}

export function createOpenAIAgent(
  definition: AgentDefinition,
  options: Pick<OpenAIAgentProviderOptions, 'defaultModel'> = {}
): OpenAIAgentBuildResult {
  const model = resolveModel(definition, options.defaultModel);
  const modelSettings = resolveModelSettings(definition);
  const tools = resolveFileSearchTools(definition);

  return {
    model,
    agent: new Agent({
      name: definition.name || 'AgentPlat Agent',
      instructions: definition.instructions || DEFAULT_INSTRUCTIONS,
      ...(definition.description
        ? { handoffDescription: definition.description }
        : {}),
      ...(model ? { model } : {}),
      ...(Object.keys(modelSettings).length > 0 ? { modelSettings } : {}),
      ...(tools.length > 0 ? { tools } : {}),
    }),
  };
}

export function extractOpenAIFileCitations(
  value: unknown
): OpenAIFileCitation[] {
  const citations = new Map<string, OpenAIFileCitation>();
  const seen = new Set<unknown>();

  const visit = (candidate: unknown): void => {
    if (!candidate || typeof candidate !== 'object' || seen.has(candidate)) {
      return;
    }
    seen.add(candidate);

    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item);
      return;
    }

    const object = candidate as Record<string, unknown>;
    if (object.type === 'file_citation') {
      const nested = asRecord(object.file_citation);
      const fileId = firstString(
        object.fileId,
        object.file_id,
        nested?.fileId,
        nested?.file_id
      );
      if (fileId) {
        const citation = compactCitation({
          fileId,
          filename: firstString(object.filename, nested?.filename),
          quote: firstString(object.quote, object.text, nested?.quote),
        });
        citations.set(JSON.stringify(citation), citation);
      }
    }

    for (const nestedValue of Object.values(object)) visit(nestedValue);
  };

  visit(value);
  return [...citations.values()];
}

function buildRunOptions(
  input: AgentRunInput,
  context: RuntimeExecutionContext
): {
  context: OpenAIRunContext;
  conversationId?: string;
  signal?: AbortSignal;
} {
  return {
    context: {
      tenantId: context.tenant.tenantId,
      organizationId: context.tenant.organizationId,
      workspaceId: context.tenant.workspaceId,
      agentId: context.agentId,
      runId: context.runId,
      mode: input.mode ?? 'invoke',
      policies: context.policies,
      metadata: context.metadata,
      inputMetadata: input.metadata,
    },
    ...(context.signal ? { signal: context.signal } : {}),
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
  };
}

function resolveModel(
  definition: AgentDefinition,
  defaultModel?: string
): string | undefined {
  const provider = asRecord(definition.metadata?.provider);
  return firstString(definition.modelName, provider?.model, defaultModel);
}

function resolveModelSettings(definition: AgentDefinition): ModelSettings {
  const configured = asRecord(definition.config?.modelSettings);
  const provider = asRecord(definition.metadata?.provider);
  const legacyGeneration = asRecord(provider?.generation);

  return compactObject<ModelSettings>({
    temperature: firstNumber(
      configured?.temperature,
      legacyGeneration?.temperature
    ),
    topP: firstNumber(
      configured?.topP,
      configured?.top_p,
      legacyGeneration?.topP,
      legacyGeneration?.top_p
    ),
    frequencyPenalty: firstNumber(
      configured?.frequencyPenalty,
      configured?.frequency_penalty
    ),
    presencePenalty: firstNumber(
      configured?.presencePenalty,
      configured?.presence_penalty
    ),
    maxTokens: firstNumber(
      configured?.maxTokens,
      configured?.max_output_tokens,
      legacyGeneration?.maxTokens,
      legacyGeneration?.max_output_tokens
    ),
    store: firstBoolean(configured?.store),
    parallelToolCalls: firstBoolean(
      configured?.parallelToolCalls,
      configured?.parallel_tool_calls
    ),
  });
}

function resolveFileSearchTools(definition: AgentDefinition) {
  const openAI = asRecord(definition.capabilities?.openai);
  const configured = asRecord(openAI?.fileSearch);
  const configuredIds = stringArray(configured?.vectorStoreIds);
  const metadataKnowledge = asRecord(definition.metadata?.knowledge);
  const legacyId = firstString(metadataKnowledge?.vectorStoreId);
  const vectorStoreIds =
    configuredIds.length > 0 ? configuredIds : legacyId ? [legacyId] : [];

  const enabled = firstBoolean(configured?.enabled, metadataKnowledge?.enabled);
  if (enabled === false || vectorStoreIds.length === 0) return [];

  const retrieval = asRecord(metadataKnowledge?.retrieval);
  const maxNumResults = firstNumber(
    configured?.maxNumResults,
    configured?.max_num_results,
    retrieval?.maxNumResults,
    retrieval?.max_num_results
  );
  return [
    fileSearchTool(
      vectorStoreIds,
      maxNumResults === undefined ? {} : { maxNumResults }
    ),
  ];
}

function toAgentInput(input: string | JsonObject[]): string | AgentInputItem[] {
  return input as string | AgentInputItem[];
}

function stringifyOutput(output: unknown): string {
  if (typeof output === 'string') return output;
  if (output === undefined) return '';
  return JSON.stringify(output);
}

function elapsedMilliseconds(startedAt: number): number {
  return Math.max(0, Math.round((performance.now() - startedAt) * 100) / 100);
}

function toAdapterError(error: unknown): AgentPlatError {
  if (error instanceof AgentPlatError) return error;
  const message =
    error instanceof Error ? error.message : 'Unknown OpenAI error';
  return new AgentPlatError(
    'ADAPTER_ERROR',
    `OpenAI agent run failed: ${message}`,
    {
      details: { provider: 'openai' },
    }
  );
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function firstString(...values: unknown[]): string | undefined {
  return values.find(
    (value): value is string => typeof value === 'string' && value.length > 0
  );
}

function firstNumber(...values: unknown[]): number | undefined {
  return values.find(
    (value): value is number =>
      typeof value === 'number' && Number.isFinite(value)
  );
}

function firstBoolean(...values: unknown[]): boolean | undefined {
  return values.find((value): value is boolean => typeof value === 'boolean');
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string => typeof item === 'string' && item.length > 0
      )
    : [];
}

function compactObject<T extends object>(object: T): T {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== undefined)
  ) as T;
}

function compactMetadata(
  metadata: Record<string, JsonValue | undefined>
): Metadata {
  return compactObject(metadata) as Metadata;
}

function compactCitation(citation: OpenAIFileCitation): OpenAIFileCitation {
  return compactObject(citation);
}

function toCitationJson(citation: OpenAIFileCitation): JsonValue {
  return citation as unknown as JsonObject;
}
