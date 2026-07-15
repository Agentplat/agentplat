import { AgentPlatError } from '@agentplat/core';
import type {
  AgentPlatID,
  JsonObject,
  Metadata,
  TenantContext,
} from '@agentplat/core';
import type { ModelAdapter } from '@agentplat/model';
import { chatModel } from '@agentplat/model-openai-compatible';
import type {
  ChatModelOptions,
  ChatModelProvider,
} from '@agentplat/model-openai-compatible';
import { RoomService } from '@agentplat/rooms';
import type { RoomServiceOptions } from '@agentplat/rooms';
import {
  createMultiAgentSession,
  defineSpeaker,
  exportSessionHistory,
  MultiAgentSession,
} from '@agentplat/sessions';
import type { MultiAgentSessionOptions } from '@agentplat/sessions';
import { ChatAgentProvider, DefaultAgentRuntime } from '@agentplat/runtime';
import type {
  AgentDefinition,
  AgentProvider,
  AgentRunInput,
  AgentRunResult,
  AgentRuntime,
  AgentStreamEvent,
} from '@agentplat/runtime';

export {
  createMultiAgentSession,
  createPersonaInputBuilder,
  createSessionEventReducer,
  defineSpeaker,
  exportSessionHistory,
  formatSessionTranscript,
  MultiAgentSession,
  sessionMetrics,
} from '@agentplat/sessions';
export type {
  MultiAgentSessionEvent,
  MultiAgentSessionInput,
  MultiAgentSessionOptions,
  MultiAgentSessionResult,
  SessionCompletedPayload,
  SessionEventRecord,
  SessionEventPayload,
  SessionEventReducer,
  SessionEventSink,
  SessionFailurePayload,
  SessionInputContext,
  SessionMessage,
  SessionMetrics,
  SessionPersona,
  PersonaInputBuilderOptions,
  SessionSpeaker,
  SessionSpeakerRef,
  SessionStartedPayload,
  SessionStopContext,
  SessionStopDecision,
  SessionStopPayload,
  SessionStopReason,
  SessionSinkFailureMode,
  SessionToolPayload,
  SessionTurnCompletedPayload,
  SessionTurnPayload,
  SessionUsage,
  SessionViewState,
  SpeakerDefinitionInput,
  SessionTurnView,
} from '@agentplat/sessions';
export type {
  AgentCompletionPayload,
  AgentRunResult,
  AgentStreamEvent,
  AgentUsage,
  StreamEvent,
} from '@agentplat/runtime';
export type { AgentSseEnvelope } from '@agentplat/streaming';

const quickRunPolicies: JsonObject = {
  mode: 'quick_run',
  tools: 'denied',
  externalWrites: 'denied',
};

/** Options used to assemble a high-level AgentPlat client. */
export interface CreateAgentPlatOptions {
  /** Direct model adapter wrapped in a one-generation ChatAgentProvider. */
  adapter?: ModelAdapter;
  /** Full agent provider for custom loops, handoffs or orchestration. */
  provider?: AgentProvider;
  /** Reuse an existing runtime registry instead of creating one. */
  runtime?: AgentRuntime;
  /** Registry key for the supplied adapter/provider. Defaults to `chat`. */
  platform?: string;
  /** Provider-neutral registrations for applications that use several backends. */
  platforms?: Record<string, AgentPlatPlatform>;
  /** Defaults to the isolated local tenant. */
  tenant?: TenantContext;
  /** Execution-only credentials. They are never placed in result metadata. */
  credentials?: Record<string, string>;
  /** Optional governed Room service configuration using the same runtime. */
  rooms?: Omit<RoomServiceOptions, 'runtime'>;
  idGenerator?: () => AgentPlatID;
  clock?: () => Date;
}

/** One explicit adapter or provider registration in a composed framework client. */
export type AgentPlatPlatform =
  | { adapter: ModelAdapter; provider?: never }
  | { provider: AgentProvider; adapter?: never };

/** Input accepted by the ephemeral quick-run facade. */
export interface QuickRunInput {
  instructions: string;
  input: AgentRunInput['input'];
  name?: string;
  description?: string;
  agentId?: AgentPlatID;
  runId?: AgentPlatID;
  modelName?: string;
  config?: JsonObject;
  metadata?: Metadata;
  signal?: AbortSignal;
}

/** Static quick-run input including its model adapter and local context. */
export interface StaticQuickRunInput extends QuickRunInput {
  adapter: ModelAdapter;
  tenantId?: AgentPlatID;
  credentials?: Record<string, string>;
  platform?: string;
}

/**
 * Smallest useful model call for prototypes and command-style applications.
 *
 * `ask` is intentionally limited to the portable Chat Completions transport.
 * Use `quickRun` with a `ModelAdapter` when an application needs a provider
 * with another wire protocol or wants the normalized run result and metadata.
 */
export interface AskInput extends Omit<
  ChatModelOptions,
  'provider' | 'defaultModel'
> {
  prompt: string;
  model: string;
  provider?: ChatModelProvider;
  system?: string;
  tenantId?: AgentPlatID;
  signal?: AbortSignal;
}

/** Declarative configuration for a reusable portable agent. */
export interface ConfigureAgentInput extends Omit<
  ChatModelOptions,
  'provider' | 'defaultModel'
> {
  model: string;
  instructions: string;
  provider?: ChatModelProvider;
  name?: string;
  description?: string;
  agentId?: AgentPlatID;
  tenantId?: AgentPlatID;
  config?: JsonObject;
  metadata?: Metadata;
}

/** Per-invocation controls for a configured agent. */
export interface ConfiguredAgentRunOptions {
  runId?: AgentPlatID;
  signal?: AbortSignal;
  metadata?: Metadata;
}

/** Session options supplied by a configured framework facade. */
export type FrameworkSessionOptions = Omit<
  MultiAgentSessionOptions,
  'runtime' | 'tenant' | 'credentials'
>;

/** Session options with optional speaker-to-platform overrides for configured agents. */
export interface ConfiguredAgentSessionOptions extends FrameworkSessionOptions {
  platformOverrides?: Record<AgentPlatID, string>;
}

/**
 * Reusable high-level agent assembled from a portable provider preset.
 *
 * It keeps the convenience setup in one place while exposing the normalized
 * run, stream and multi-agent session APIs for progressively advanced use.
 */
export class ConfiguredAgent {
  constructor(
    private readonly framework: AgentPlatFramework,
    private readonly defaults: Omit<QuickRunInput, 'input' | 'runId' | 'signal'>
  ) {}

  run(
    input: AgentRunInput['input'],
    options: ConfiguredAgentRunOptions = {}
  ): Promise<AgentRunResult> {
    return this.framework.quickRun({ ...this.defaults, input, ...options });
  }

  async ask(
    prompt: string,
    options: ConfiguredAgentRunOptions = {}
  ): Promise<string> {
    return textOutput(await this.run(prompt, options));
  }

  stream(
    input: AgentRunInput['input'],
    options: ConfiguredAgentRunOptions = {}
  ): AsyncIterable<AgentStreamEvent> {
    return this.framework.stream({ ...this.defaults, input, ...options });
  }

  createSession(options: ConfiguredAgentSessionOptions): MultiAgentSession {
    const { platformOverrides, speakers, ...sessionOptions } = options;
    return this.framework.createSession({
      ...sessionOptions,
      speakers: speakers.map((speaker) => ({
        ...speaker,
        platform: platformOverrides?.[speaker.id] ?? speaker.platform,
      })),
    });
  }

  /** Add a named live, mock or custom platform for mixed-provider sessions. */
  withPlatform(platform: string, registration: AgentPlatPlatform): this {
    this.framework.registerPlatform(platform, registration);
    return this;
  }
}

/**
 * Lightweight application facade over the public runtime and Room services.
 * Infrastructure objects remain accessible so applications are not locked
 * into this convenience layer.
 */
export class AgentPlatFramework {
  readonly runtime: AgentRuntime;
  readonly rooms?: RoomService;
  readonly tenant: TenantContext;

  private readonly platform: string;
  private readonly configuredPlatforms = new Set<string>();
  private readonly credentials?: Record<string, string>;
  private readonly idGenerator: () => AgentPlatID;
  private readonly clock: () => Date;

  constructor(options: CreateAgentPlatOptions = {}) {
    if (options.adapter && options.provider) {
      throw new AgentPlatError(
        'VALIDATION_ERROR',
        'Configure either a model adapter or an agent provider, not both'
      );
    }
    this.platform = normalizedPlatform(options.platform ?? 'chat');
    this.tenant = options.tenant ?? { tenantId: 'local' };
    if (!this.tenant.tenantId?.trim()) {
      throw new AgentPlatError(
        'VALIDATION_ERROR',
        'tenant.tenantId is required'
      );
    }
    this.runtime = options.runtime ?? new DefaultAgentRuntime();
    this.credentials = options.credentials
      ? { ...options.credentials }
      : undefined;
    this.idGenerator =
      options.idGenerator ?? (() => globalThis.crypto.randomUUID());
    this.clock = options.clock ?? (() => new Date());

    if (options.platforms) {
      for (const [platform, registration] of Object.entries(
        options.platforms
      )) {
        this.registerPlatform(platform, registration);
      }
    }
    const provider = options.adapter
      ? new ChatAgentProvider(options.adapter)
      : options.provider;
    if (provider) {
      if (this.configuredPlatforms.has(this.platform)) {
        throw new AgentPlatError(
          'CONFLICT',
          `Platform "${this.platform}" is configured more than once`
        );
      }
      this.runtime.registerProvider(this.platform, provider);
      this.configuredPlatforms.add(this.platform);
    }
    if (options.rooms) {
      this.rooms = new RoomService({
        ...options.rooms,
        runtime: this.runtime,
      });
    }
  }

  /** Register one additional named platform after framework construction. */
  registerPlatform(platform: string, registration: AgentPlatPlatform): void {
    const normalized = normalizedPlatform(platform);
    if (!registration || (registration.adapter && registration.provider)) {
      throw new AgentPlatError(
        'VALIDATION_ERROR',
        `Configure exactly one adapter or provider for platform "${platform}"`
      );
    }
    if (this.configuredPlatforms.has(normalized)) {
      throw new AgentPlatError(
        'CONFLICT',
        `Platform "${normalized}" is configured more than once`
      );
    }
    const provider = registration.adapter
      ? new ChatAgentProvider(registration.adapter)
      : registration.provider;
    if (!provider) {
      throw new AgentPlatError(
        'VALIDATION_ERROR',
        `A provider or adapter is required for platform "${platform}"`
      );
    }
    this.runtime.registerProvider(normalized, provider);
    this.configuredPlatforms.add(normalized);
  }

  /** Execute a single ephemeral agent run with safe, tool-free defaults. */
  async quickRun(input: QuickRunInput): Promise<AgentRunResult> {
    const execution = this.execution(input);
    return this.runtime.run(
      execution.agent,
      execution.input,
      execution.context
    );
  }

  /** Stream a single ephemeral agent run as normalized runtime events. */
  stream(input: QuickRunInput): AsyncIterable<AgentStreamEvent> {
    const execution = this.execution(input);
    return this.runtime.stream(
      execution.agent,
      execution.input,
      execution.context
    );
  }

  /** Create an ephemeral multi-agent session over this facade's runtime. */
  createSession(options: FrameworkSessionOptions): MultiAgentSession {
    for (const speaker of options.speakers) {
      const platform = normalizedPlatform(speaker.platform);
      const known = this.runtime.hasProvider?.(platform);
      if (
        known === false ||
        (!known &&
          this.configuredPlatforms.size > 0 &&
          !this.configuredPlatforms.has(platform))
      ) {
        throw new AgentPlatError(
          'VALIDATION_ERROR',
          `No provider is configured for session speaker platform "${platform}"`
        );
      }
    }
    return createMultiAgentSession({
      ...options,
      runtime: this.runtime,
      tenant: this.tenant,
      credentials: this.credentials,
      idGenerator: options.idGenerator ?? this.idGenerator,
      clock: options.clock ?? this.clock,
    });
  }

  private execution(input: QuickRunInput) {
    required(input.instructions, 'instructions');
    if (
      typeof input.input !== 'string' &&
      (!Array.isArray(input.input) || input.input.length === 0)
    ) {
      throw new AgentPlatError('VALIDATION_ERROR', 'input is required');
    }
    const now = this.clock().toISOString();
    const agentId = input.agentId ?? this.idGenerator();
    const runId = input.runId ?? this.idGenerator();
    const agent: AgentDefinition = {
      id: agentId,
      tenantId: this.tenant.tenantId,
      name: input.name?.trim() || 'AgentPlat quick agent',
      description: input.description,
      instructions: input.instructions.trim(),
      platform: this.platform,
      modelName: input.modelName,
      config: input.config,
      metadata: input.metadata,
      createdAt: now,
      updatedAt: now,
    };
    return {
      agent,
      input: {
        input: input.input,
        mode: 'invoke' as const,
        metadata: input.metadata,
      },
      context: {
        tenant: this.tenant,
        runId,
        agentId,
        signal: input.signal,
        credentials: this.credentials,
        policies: quickRunPolicies,
        metadata: input.metadata,
      },
    };
  }
}

/** Create a reusable framework facade. */
export function createAgentplat(
  options: CreateAgentPlatOptions = {}
): AgentPlatFramework {
  return new AgentPlatFramework(options);
}

/** Minimal stateless entry point for prototypes and examples. */
export const AgentPlat = {
  create: createAgentplat,
  /**
   * Configure a reusable agent once, then run, stream or compose sessions
   * without repeating provider, model, tenant or instruction setup.
   */
  configure(input: ConfigureAgentInput): ConfiguredAgent {
    const {
      model,
      provider = 'openai',
      tenantId = 'local',
      instructions,
      name,
      description,
      agentId,
      config,
      metadata,
      ...adapterOptions
    } = input;
    return new ConfiguredAgent(
      createAgentplat({
        adapter: chatModel({
          ...adapterOptions,
          provider,
          defaultModel: model,
        }),
        tenant: { tenantId },
      }),
      {
        instructions,
        ...(name ? { name } : {}),
        ...(description ? { description } : {}),
        ...(agentId ? { agentId } : {}),
        modelName: model,
        ...(config ? { config } : {}),
        ...(metadata ? { metadata } : {}),
      }
    );
  },
  /** Send one prompt and receive plain text using a named provider preset. */
  async ask(input: AskInput): Promise<string> {
    const {
      prompt,
      model,
      provider = 'openai',
      system = 'You are a helpful assistant.',
      tenantId,
      signal,
      ...adapterOptions
    } = input;
    const result = await AgentPlat.quickRun({
      adapter: chatModel({
        ...adapterOptions,
        provider,
        defaultModel: model,
      }),
      ...(tenantId ? { tenantId } : {}),
      instructions: system,
      input: prompt,
      modelName: model,
      signal,
    });
    return textOutput(result);
  },
  async quickRun(input: StaticQuickRunInput): Promise<AgentRunResult> {
    const {
      adapter,
      tenantId = 'local',
      credentials,
      platform,
      ...run
    } = input;
    return createAgentplat({
      adapter,
      tenant: { tenantId },
      credentials,
      platform,
    }).quickRun(run);
  },
  stream(input: StaticQuickRunInput): AsyncIterable<AgentStreamEvent> {
    const {
      adapter,
      tenantId = 'local',
      credentials,
      platform,
      ...run
    } = input;
    return createAgentplat({
      adapter,
      tenant: { tenantId },
      credentials,
      platform,
    }).stream(run);
  },
};

function normalizedPlatform(value: string): string {
  const platform = value.trim().toLowerCase();
  if (!platform) {
    throw new AgentPlatError('VALIDATION_ERROR', 'platform is required');
  }
  return platform;
}

function required(value: unknown, field: string): void {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AgentPlatError('VALIDATION_ERROR', `${field} is required`);
  }
}

function textOutput(result: AgentRunResult): string {
  if (typeof result.output !== 'string') {
    throw new AgentPlatError(
      'ADAPTER_ERROR',
      result.errorMessage ?? 'The model did not return a text response'
    );
  }
  return result.output;
}
