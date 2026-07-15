import { AgentPlatError } from '@agentplat/core';
import type {
  AgentPlatID,
  JsonObject,
  Metadata,
  TenantContext,
} from '@agentplat/core';
import type {
  AgentCompletionPayload,
  AgentDefinition,
  AgentRunInput,
  AgentRuntime,
  AgentUsage,
  StreamEvent,
} from '@agentplat/runtime';

const sessionPolicies: JsonObject = {
  mode: 'multi_agent_session',
  tools: 'denied',
  externalWrites: 'denied',
};

/** One agent that can take turns in an ephemeral session. */
export interface SessionSpeaker {
  id: AgentPlatID;
  name: string;
  instructions: string;
  platform: string;
  description?: string;
  modelName?: string;
  config?: JsonObject;
  metadata?: Metadata;
}

/** One bounded transcript entry produced by a session speaker. */
export interface SessionMessage {
  speakerId: AgentPlatID;
  speakerName: string;
  content: string;
  round: number;
  turn: number;
  createdAt: string;
}

/** Aggregated provider-reported usage across completed turns. */
export interface SessionUsage extends JsonObject {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reportedTurns: number;
}

/** Stable reasons why an ephemeral session stopped. */
export type SessionStopReason =
  'max_rounds' | 'predicate' | 'marker' | 'aborted' | 'failed';

/** State passed to a custom stopping predicate after every completed turn. */
export interface SessionStopContext {
  sessionId: AgentPlatID;
  speaker: SessionSpeaker;
  round: number;
  turn: number;
  history: readonly SessionMessage[];
  latest: SessionMessage;
  usage: Readonly<SessionUsage>;
}

/** Optional structured result returned by a stopping predicate. */
export interface SessionStopDecision {
  stop: boolean;
  detail?: string;
}

/** Context used to customize the runtime input for one speaker turn. */
export interface SessionInputContext {
  sessionId: AgentPlatID;
  scenario: AgentRunInput['input'];
  speaker: SessionSpeaker;
  round: number;
  turn: number;
  history: readonly SessionMessage[];
  metadata?: Metadata;
}

/** Configuration shared by every invocation of a multi-agent session. */
export interface MultiAgentSessionOptions {
  runtime: AgentRuntime;
  speakers: SessionSpeaker[];
  tenant?: TenantContext;
  credentials?: Record<string, string>;
  maxRounds?: number;
  historyLimit?: number;
  stopMarkers?: string[];
  stopWhen?: (
    context: SessionStopContext
  ) => boolean | SessionStopDecision | Promise<boolean | SessionStopDecision>;
  buildInput?: (context: SessionInputContext) => AgentRunInput;
  idGenerator?: () => AgentPlatID;
  clock?: () => Date;
}

/** Input for one independent session execution. */
export interface MultiAgentSessionInput {
  input: AgentRunInput['input'];
  history?: SessionMessage[];
  metadata?: Metadata;
  sessionId?: AgentPlatID;
  signal?: AbortSignal;
}

/** Public result returned after draining a multi-agent session. */
export interface MultiAgentSessionResult {
  sessionId: AgentPlatID;
  status: 'completed' | 'aborted' | 'failed';
  stopReason: SessionStopReason;
  stopDetail?: string;
  roundsCompleted: number;
  turnsCompleted: number;
  history: SessionMessage[];
  usage: SessionUsage;
  durationMs: number;
}

/** Compact speaker identity transported in session event payloads. */
export interface SessionSpeakerRef extends JsonObject {
  id: AgentPlatID;
  name: string;
}

/** Payload common to events scoped to one session. */
export interface SessionEventPayload extends JsonObject {
  sessionId: AgentPlatID;
}

/** Payload common to events scoped to one speaker turn. */
export interface SessionTurnPayload extends SessionEventPayload {
  turnId: AgentPlatID;
  speaker: SessionSpeakerRef;
  round: number;
  turn: number;
}

/** Payload emitted when a session starts. */
export interface SessionStartedPayload extends SessionEventPayload {
  speakers: SessionSpeakerRef[];
  maxRounds: number;
  historyLimit: number;
}

/** Payload emitted after one speaker turn completes. */
export type SessionTurnCompletedPayload = SessionTurnPayload & {
  usage: AgentUsage;
  aggregateUsage: SessionUsage;
  latencyMs: number;
  model?: string;
  finishReason?: string;
};

/** Payload that keeps provider tool details scoped to their session turn. */
export type SessionToolPayload = SessionTurnPayload & {
  runtimePayload?: JsonObject;
};

/** Payload explaining why a session stopped. */
export type SessionStopPayload = SessionEventPayload & {
  reason: SessionStopReason;
  detail?: string;
  marker?: string;
  round: number;
  turn: number;
};

/** Payload emitted when one active speaker turn fails. */
export type SessionFailurePayload = SessionTurnPayload & {
  reason: 'failed';
  detail?: string;
};

/** Payload emitted as the final event in a session stream. */
export type SessionCompletedPayload = SessionEventPayload & {
  status: 'completed' | 'aborted' | 'failed';
  stopReason: SessionStopReason;
  stopDetail?: string;
  roundsCompleted: number;
  turnsCompleted: number;
  usage: SessionUsage;
  durationMs: number;
};

/** Typed events emitted by `MultiAgentSession.stream()`. */
export type MultiAgentSessionEvent =
  | SessionPayloadEvent<'session_started', SessionStartedPayload>
  | SessionPayloadEvent<'speaker_changed', SessionTurnPayload>
  | SessionPayloadEvent<'turn_started', SessionTurnPayload>
  | (SessionPayloadEvent<'token', SessionTurnPayload> & { content: string })
  | SessionPayloadEvent<'tool_call', SessionToolPayload>
  | SessionPayloadEvent<'tool_result', SessionToolPayload>
  | (SessionPayloadEvent<'turn_completed', SessionTurnCompletedPayload> & {
      content: string;
    })
  | SessionPayloadEvent<'stop_reason', SessionStopPayload>
  | (SessionPayloadEvent<'session_failed', SessionFailurePayload> & {
      content: string;
    })
  | SessionPayloadEvent<'session_completed', SessionCompletedPayload>;

type SessionPayloadEvent<
  TType extends string,
  TPayload extends JsonObject,
> = StreamEvent<TType, TPayload> & { payload: TPayload };

/**
 * Deterministic, ephemeral round-robin orchestration over an `AgentRuntime`.
 *
 * The session owns turn order and bounded transcript assembly only. It does not
 * persist data, execute tools itself or imply Agent Room governance.
 */
export class MultiAgentSession {
  private readonly speakers: SessionSpeaker[];
  private readonly tenant: TenantContext;
  private readonly credentials?: Record<string, string>;
  private readonly maxRounds: number;
  private readonly historyLimit: number;
  private readonly stopMarkers: string[];
  private readonly idGenerator: () => AgentPlatID;
  private readonly clock: () => Date;

  constructor(private readonly options: MultiAgentSessionOptions) {
    this.speakers = validateSpeakers(options.speakers);
    this.tenant = options.tenant
      ? structuredClone(options.tenant)
      : { tenantId: 'local' };
    required(this.tenant.tenantId, 'tenant.tenantId');
    this.credentials = options.credentials
      ? { ...options.credentials }
      : undefined;
    this.maxRounds = positiveInteger(options.maxRounds ?? 4, 'maxRounds', 100);
    this.historyLimit = positiveInteger(
      options.historyLimit ?? 50,
      'historyLimit',
      1_000
    );
    this.stopMarkers = (options.stopMarkers ?? []).map((marker, index) => {
      required(marker, `stopMarkers[${index}]`);
      return marker;
    });
    this.idGenerator =
      options.idGenerator ?? (() => globalThis.crypto.randomUUID());
    this.clock = options.clock ?? (() => new Date());
  }

  /** Stream one independent multi-agent execution. */
  stream(input: MultiAgentSessionInput): AsyncIterable<MultiAgentSessionEvent> {
    return this.execute(input);
  }

  /** Run a session to completion and return its bounded final state. */
  async run(input: MultiAgentSessionInput): Promise<MultiAgentSessionResult> {
    let result: MultiAgentSessionResult | undefined;
    for await (const _event of this.execute(input, (completed) => {
      result = completed;
    })) {
      // Draining the stream preserves the same execution path as web clients.
    }
    if (!result) {
      throw new AgentPlatError(
        'INTERNAL_ERROR',
        'The multi-agent session ended without a result'
      );
    }
    return result;
  }

  private async *execute(
    input: MultiAgentSessionInput,
    onResult?: (result: MultiAgentSessionResult) => void
  ): AsyncIterable<MultiAgentSessionEvent> {
    validateInput(input.input);
    const sessionId = input.sessionId ?? this.idGenerator();
    required(sessionId, 'sessionId');
    const startedAt = performance.now();
    const history = cloneHistory(input.history ?? []).slice(-this.historyLimit);
    const usage = emptyUsage();
    let turnsCompleted = 0;
    let roundsCompleted = 0;
    let stopReason: SessionStopReason | undefined;
    let stopDetail: string | undefined;
    let stopMarker: string | undefined;

    yield {
      type: 'session_started',
      runId: sessionId,
      payload: {
        sessionId,
        speakers: this.speakers.map(speakerRef),
        maxRounds: this.maxRounds,
        historyLimit: this.historyLimit,
      },
    };

    outer: for (let round = 1; round <= this.maxRounds; round += 1) {
      for (const speaker of this.speakers) {
        if (input.signal?.aborted) {
          stopReason = 'aborted';
          stopDetail = abortMessage(input.signal);
          break outer;
        }

        const turn = turnsCompleted + 1;
        const turnId = this.idGenerator();
        const turnPayload: SessionTurnPayload = {
          sessionId,
          turnId,
          speaker: speakerRef(speaker),
          round,
          turn,
        };
        yield {
          type: 'speaker_changed',
          runId: turnId,
          payload: turnPayload,
        };
        yield { type: 'turn_started', runId: turnId, payload: turnPayload };

        const turnStartedAt = performance.now();
        let output = '';
        let completion: AgentCompletionPayload | undefined;
        let turnFailure: string | undefined;
        const agent = this.agentDefinition(speaker);
        try {
          const runInput = this.buildInput({
            sessionId,
            scenario: input.input,
            speaker,
            round,
            turn,
            history,
            metadata: input.metadata,
          });
          for await (const event of this.options.runtime.stream(
            agent,
            runInput,
            {
              tenant: this.tenant,
              runId: turnId,
              agentId: speaker.id,
              signal: input.signal,
              credentials: this.credentials,
              policies: sessionPolicies,
              metadata: {
                ...(input.metadata ?? {}),
                sessionId,
                speakerId: speaker.id,
                round,
                turn,
              },
            }
          )) {
            switch (event.type) {
              case 'started':
                break;
              case 'token':
                output += event.content;
                yield {
                  type: 'token',
                  runId: turnId,
                  content: event.content,
                  payload: turnPayload,
                };
                break;
              case 'tool_call':
              case 'tool_result':
                yield {
                  type: event.type,
                  runId: turnId,
                  content: event.content,
                  payload: {
                    ...turnPayload,
                    ...(event.payload ? { runtimePayload: event.payload } : {}),
                  },
                };
                break;
              case 'completed':
                output = event.content ?? output;
                completion = event.payload;
                break;
              case 'failed':
                turnFailure = event.content;
                break;
            }
          }
        } catch (error) {
          if (input.signal?.aborted) {
            stopReason = 'aborted';
            stopDetail = abortMessage(input.signal);
          } else {
            stopReason = 'failed';
            stopDetail = turnFailure ?? errorMessage(error);
          }
        }

        if (turnFailure && !stopReason) {
          stopReason = 'failed';
          stopDetail = turnFailure;
        }
        if (stopReason === 'aborted' || stopReason === 'failed') {
          if (stopReason === 'failed') {
            yield {
              type: 'session_failed',
              runId: sessionId,
              content: stopDetail ?? 'Session turn failed',
              payload: {
                ...turnPayload,
                reason: 'failed',
                ...(stopDetail ? { detail: stopDetail } : {}),
              },
            };
          }
          break outer;
        }

        const reportedUsage = normalizedUsage(completion?.usage);
        addUsage(usage, reportedUsage, completion?.usage !== undefined);
        turnsCompleted = turn;
        roundsCompleted = round;
        const message: SessionMessage = {
          speakerId: speaker.id,
          speakerName: speaker.name,
          content: output,
          round,
          turn,
          createdAt: this.clock().toISOString(),
        };
        history.push(message);
        if (history.length > this.historyLimit) history.shift();
        yield {
          type: 'turn_completed',
          runId: turnId,
          content: output,
          payload: {
            ...turnPayload,
            usage: reportedUsage,
            aggregateUsage: { ...usage },
            latencyMs:
              completion?.latencyMs ?? elapsedMilliseconds(turnStartedAt),
            ...(completion?.model ? { model: completion.model } : {}),
            ...(completion?.finishReason
              ? { finishReason: completion.finishReason }
              : {}),
          },
        };

        stopMarker = matchingMarker(output, this.stopMarkers);
        if (stopMarker) {
          stopReason = 'marker';
          stopDetail = `Matched stop marker: ${stopMarker}`;
          break outer;
        }
        if (this.options.stopWhen) {
          try {
            const decision = await this.options.stopWhen({
              sessionId,
              speaker,
              round,
              turn,
              history: cloneHistory(history),
              latest: { ...message },
              usage: { ...usage },
            });
            if (
              decision === true ||
              (typeof decision === 'object' && decision.stop)
            ) {
              stopReason = 'predicate';
              stopDetail =
                typeof decision === 'object' ? decision.detail : undefined;
              break outer;
            }
          } catch (error) {
            stopReason = 'failed';
            stopDetail = errorMessage(error);
            yield {
              type: 'session_failed',
              runId: sessionId,
              content: stopDetail,
              payload: {
                ...turnPayload,
                reason: 'failed',
                detail: stopDetail,
              },
            };
            break outer;
          }
        }
      }
    }

    stopReason ??= input.signal?.aborted ? 'aborted' : 'max_rounds';
    if (stopReason === 'aborted') {
      stopDetail ??= input.signal ? abortMessage(input.signal) : undefined;
    }
    yield {
      type: 'stop_reason',
      runId: sessionId,
      payload: {
        sessionId,
        reason: stopReason,
        ...(stopDetail ? { detail: stopDetail } : {}),
        ...(stopMarker ? { marker: stopMarker } : {}),
        round: roundsCompleted,
        turn: turnsCompleted,
      },
    };

    const status =
      stopReason === 'aborted'
        ? 'aborted'
        : stopReason === 'failed'
          ? 'failed'
          : 'completed';
    const result: MultiAgentSessionResult = {
      sessionId,
      status,
      stopReason,
      stopDetail,
      roundsCompleted,
      turnsCompleted,
      history: cloneHistory(history),
      usage: { ...usage },
      durationMs: elapsedMilliseconds(startedAt),
    };
    onResult?.(result);
    yield {
      type: 'session_completed',
      runId: sessionId,
      payload: {
        sessionId,
        status,
        stopReason,
        ...(stopDetail ? { stopDetail } : {}),
        roundsCompleted,
        turnsCompleted,
        usage: { ...usage },
        durationMs: result.durationMs,
      },
    };
  }

  private agentDefinition(speaker: SessionSpeaker): AgentDefinition {
    const now = this.clock().toISOString();
    return {
      id: speaker.id,
      tenantId: this.tenant.tenantId,
      name: speaker.name,
      description: speaker.description,
      instructions: speaker.instructions,
      platform: speaker.platform,
      modelName: speaker.modelName,
      config: speaker.config,
      metadata: speaker.metadata,
      createdAt: now,
      updatedAt: now,
    };
  }

  private buildInput(context: SessionInputContext): AgentRunInput {
    return (
      this.options.buildInput?.({
        ...context,
        history: cloneHistory(context.history),
      }) ?? defaultInput(context)
    );
  }
}

/** Create a reusable ephemeral multi-agent session. */
export function createMultiAgentSession(
  options: MultiAgentSessionOptions
): MultiAgentSession {
  return new MultiAgentSession(options);
}

function validateSpeakers(speakers: SessionSpeaker[]): SessionSpeaker[] {
  if (!Array.isArray(speakers) || speakers.length < 2) {
    throw new AgentPlatError(
      'VALIDATION_ERROR',
      'A multi-agent session requires at least two speakers'
    );
  }
  const ids = new Set<string>();
  return speakers.map((speaker, index) => {
    required(speaker.id, `speakers[${index}].id`);
    required(speaker.name, `speakers[${index}].name`);
    required(speaker.instructions, `speakers[${index}].instructions`);
    required(speaker.platform, `speakers[${index}].platform`);
    if (ids.has(speaker.id)) {
      throw new AgentPlatError(
        'VALIDATION_ERROR',
        `Duplicate session speaker id: ${speaker.id}`
      );
    }
    ids.add(speaker.id);
    return structuredClone(speaker);
  });
}

function validateInput(input: AgentRunInput['input']): void {
  if (
    (typeof input === 'string' && !input.trim()) ||
    (Array.isArray(input) && input.length === 0)
  ) {
    throw new AgentPlatError('VALIDATION_ERROR', 'Session input is required');
  }
}

function defaultInput(context: SessionInputContext): AgentRunInput {
  const scenario =
    typeof context.scenario === 'string'
      ? context.scenario
      : JSON.stringify(context.scenario);
  const transcript = context.history.length
    ? context.history
        .map((message) => `${message.speakerName}: ${message.content}`)
        .join('\n')
    : '(no previous turns)';
  return {
    input: [
      {
        role: 'user',
        content: [
          `Scenario:\n${scenario}`,
          `Conversation so far:\n${transcript}`,
          `It is now your turn as ${context.speaker.name}. Respond in character.`,
        ].join('\n\n'),
      },
    ],
    mode: 'chat',
    metadata: {
      ...(context.metadata ?? {}),
      sessionId: context.sessionId,
      speakerId: context.speaker.id,
      round: context.round,
      turn: context.turn,
    },
  };
}

function speakerRef(speaker: SessionSpeaker): SessionSpeakerRef {
  return { id: speaker.id, name: speaker.name };
}

function emptyUsage(): SessionUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    reportedTurns: 0,
  };
}

function normalizedUsage(usage: AgentUsage | undefined): AgentUsage {
  return {
    inputTokens: normalizedCount(usage?.inputTokens),
    outputTokens: normalizedCount(usage?.outputTokens),
    totalTokens: normalizedCount(usage?.totalTokens),
  };
}

function addUsage(
  total: SessionUsage,
  usage: AgentUsage,
  providerReported: boolean
): void {
  total.inputTokens += usage.inputTokens ?? 0;
  total.outputTokens += usage.outputTokens ?? 0;
  total.totalTokens += usage.totalTokens ?? 0;
  if (providerReported) total.reportedTurns += 1;
}

function normalizedCount(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}

function matchingMarker(output: string, markers: string[]): string | undefined {
  const normalized = output.toLocaleLowerCase();
  return markers.find((marker) =>
    normalized.includes(marker.toLocaleLowerCase())
  );
}

function cloneHistory(history: readonly SessionMessage[]): SessionMessage[] {
  return history.map((message) => ({ ...message }));
}

function elapsedMilliseconds(startedAt: number): number {
  return Math.max(0, Math.round((performance.now() - startedAt) * 100) / 100);
}

function abortMessage(signal: AbortSignal): string {
  return signal.reason instanceof Error
    ? signal.reason.message
    : 'Session aborted';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Session execution failed';
}

function required(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AgentPlatError('VALIDATION_ERROR', `${field} is required`);
  }
}

function positiveInteger(
  value: number,
  field: string,
  maximum: number
): number {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new AgentPlatError(
      'VALIDATION_ERROR',
      `${field} must be an integer between 1 and ${maximum}`
    );
  }
  return value;
}
