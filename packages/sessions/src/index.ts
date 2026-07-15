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
  | 'max_rounds'
  | 'predicate'
  | 'marker'
  | 'aborted'
  | 'stopped'
  | 'timeout'
  | 'token_budget'
  | 'cost_budget'
  | 'failed';

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

/** Optional private persona details used only while assembling one turn input. */
export interface SessionPersona {
  role?: string;
  goals?: string[];
  constraints?: string[];
  peerDescription?: string;
}

/** Templates for the optional generic persona turn-input builder. */
export interface PersonaInputBuilderOptions {
  personas?: Record<AgentPlatID, SessionPersona>;
  openingTurn?: string;
  replyTurn?: string;
}

/** One append-only record delivered to an optional session event sink. */
export interface SessionEventRecord {
  eventId: AgentPlatID;
  tenantId: AgentPlatID;
  sessionId: AgentPlatID;
  sequence: number;
  occurredAt: string;
  event: MultiAgentSessionEvent;
}

/** Durable or observational destination for an ephemeral session event trail. */
export interface SessionEventSink {
  append(record: SessionEventRecord): Promise<void>;
}

/** Behavior when a configured event sink cannot accept an event. */
export type SessionSinkFailureMode = 'best_effort' | 'required';

/** Configuration shared by every invocation of a multi-agent session. */
export interface MultiAgentSessionOptions {
  runtime: AgentRuntime;
  speakers: SessionSpeaker[];
  tenant?: TenantContext;
  credentials?: Record<string, string>;
  maxRounds?: number;
  historyLimit?: number;
  /** Maximum whole-session duration. A timeout stops the active provider run. */
  sessionTimeoutMs?: number;
  /** Maximum duration of one speaker turn. */
  turnTimeoutMs?: number;
  /** Switch all remaining turns to this registered platform after one provider failure. */
  fallbackPlatform?: string | SessionFallbackOptions;
  /** Soft cap for total reported tokens. The completing turn is preserved. */
  maxTokens?: number;
  /** Soft caps for total reported tokens by speaker id. */
  maxTokensBySpeaker?: Record<AgentPlatID, number>;
  /** Soft cap for estimated session cost. Requires `estimateCostUsd`. */
  maxCostUsd?: number;
  /** Converts one completed provider turn into a USD estimate. */
  estimateCostUsd?: (context: SessionCostContext) => number;
  stopMarkers?: string[];
  stopWhen?: (
    context: SessionStopContext
  ) => boolean | SessionStopDecision | Promise<boolean | SessionStopDecision>;
  buildInput?: (context: SessionInputContext) => AgentRunInput;
  /** Optional append-only event destination; it does not make a session a Room. */
  eventSink?: SessionEventSink;
  /** Defaults to best_effort. Required sinks fail the session stream on write errors. */
  sinkFailureMode?: SessionSinkFailureMode;
  idGenerator?: () => AgentPlatID;
  clock?: () => Date;
}

/** Explicit fallback behavior for a session whose live provider becomes unavailable. */
export interface SessionFallbackOptions {
  platform: string;
  /** Kept for self-documenting configurations; session history is always retained. */
  retainHistory?: true;
}

/** Provider usage available to a cost estimator after a turn completes. */
export interface SessionCostContext {
  speaker: SessionSpeaker;
  usage: AgentUsage;
  aggregateUsage: SessionUsage;
  round: number;
  turn: number;
}

/** Input for one independent session execution. */
export interface MultiAgentSessionInput {
  input: AgentRunInput['input'];
  history?: SessionMessage[];
  metadata?: Metadata;
  sessionId?: AgentPlatID;
  /** Overrides the configured session timeout for one execution. */
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Stops only after the active speaker turn completes cleanly. */
  stopSignal?: AbortSignal;
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
  /** Sum returned by `estimateCostUsd`, when configured. */
  estimatedCostUsd?: number;
  durationMs: number;
}

/** A UI-oriented projection derived from the public session event stream. */
export interface SessionTurnView {
  turnId: AgentPlatID;
  speaker: SessionSpeakerRef;
  round: number;
  turn: number;
  createdAt: string;
  content: string;
  status: 'running' | 'completed' | 'failed';
  usage?: AgentUsage;
  latencyMs?: number;
  model?: string;
  finishReason?: string;
}

/** Reducer state suitable for browser UI bubbles and session dashboards. */
export interface SessionViewState {
  sessionId?: AgentPlatID;
  status: 'idle' | 'running' | 'completed' | 'aborted' | 'failed';
  speakers: SessionSpeakerRef[];
  turns: Record<AgentPlatID, SessionTurnView>;
  turnOrder: AgentPlatID[];
  /** The active turn, so UIs do not need to scan every turn. */
  activeTurnId?: AgentPlatID;
  usage: SessionUsage;
  /** Sum of provider-reported completed-turn latency. */
  totalLatencyMs: number;
  /** Stable live metrics snapshot for dashboards and transport controllers. */
  metrics: SessionMetrics;
  /** Sum of estimates supplied by the configured cost estimator. */
  estimatedCostUsd: number;
  stopReason?: SessionStopReason;
  stopDetail?: string;
  durationMs?: number;
  /** True while a server-side cooperative stop can affect the active session. */
  canSoftStop: boolean;
  /** True once at least one completed turn can be exported as history. */
  canResume: boolean;
  /** Convenience alias for a live stream; false after a terminal event. */
  isLive: boolean;
}

/** Pure reducer for `MultiAgentSessionEvent` values received over SSE or in-process. */
export interface SessionEventReducer {
  initialState: SessionViewState;
  reduce(
    state: SessionViewState,
    event: MultiAgentSessionEvent
  ): SessionViewState;
}

/** Stable, dependency-free metrics for any metrics backend. */
export interface SessionMetrics extends JsonObject {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reportedTurns: number;
  turnsCompleted: number;
  durationMs: number;
  estimatedCostUsd: number;
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
  createdAt: string;
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
  estimatedCostUsd?: number;
  totalEstimatedCostUsd?: number;
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

/** Payload emitted before a failed provider turn is retried or terminates. */
export type SessionTurnFailedPayload = SessionFailurePayload & {
  platform: string;
};

/** Payload emitted when the session changes all remaining turns to a fallback platform. */
export type SessionProviderFallbackPayload = SessionTurnPayload & {
  fromPlatform: string;
  toPlatform: string;
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
  estimatedCostUsd?: number;
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
  | SessionPayloadEvent<'turn_failed', SessionTurnFailedPayload>
  | SessionPayloadEvent<'provider_fallback', SessionProviderFallbackPayload>
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
  private readonly sessionTimeoutMs?: number;
  private readonly turnTimeoutMs?: number;
  private readonly fallbackPlatform?: string;
  private readonly maxTokens?: number;
  private readonly maxTokensBySpeaker: Record<AgentPlatID, number>;
  private readonly maxCostUsd?: number;
  private readonly stopMarkers: string[];
  private readonly sinkFailureMode: SessionSinkFailureMode;
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
    this.sessionTimeoutMs = optionalTimeout(
      options.sessionTimeoutMs,
      'sessionTimeoutMs'
    );
    this.turnTimeoutMs = optionalTimeout(
      options.turnTimeoutMs,
      'turnTimeoutMs'
    );
    this.fallbackPlatform = normalizeFallbackPlatform(options.fallbackPlatform);
    this.maxTokens = optionalPositiveNumber(options.maxTokens, 'maxTokens');
    this.maxTokensBySpeaker = normalizeSpeakerBudgets(
      options.maxTokensBySpeaker
    );
    this.maxCostUsd = optionalPositiveNumber(options.maxCostUsd, 'maxCostUsd');
    if (this.maxCostUsd !== undefined && !options.estimateCostUsd) {
      throw new AgentPlatError(
        'VALIDATION_ERROR',
        'maxCostUsd requires estimateCostUsd'
      );
    }
    this.stopMarkers = (options.stopMarkers ?? []).map((marker, index) => {
      required(marker, `stopMarkers[${index}]`);
      return marker;
    });
    this.idGenerator =
      options.idGenerator ?? (() => globalThis.crypto.randomUUID());
    this.clock = options.clock ?? (() => new Date());
    this.sinkFailureMode = options.sinkFailureMode ?? 'best_effort';
    if (
      this.sinkFailureMode !== 'best_effort' &&
      this.sinkFailureMode !== 'required'
    ) {
      throw new AgentPlatError(
        'VALIDATION_ERROR',
        'sinkFailureMode must be best_effort or required'
      );
    }
  }

  /** Stream one independent multi-agent execution. */
  stream(input: MultiAgentSessionInput): AsyncIterable<MultiAgentSessionEvent> {
    return this.recordEvents(this.execute(input));
  }

  /** Run a session to completion and return its bounded final state. */
  async run(input: MultiAgentSessionInput): Promise<MultiAgentSessionResult> {
    let result: MultiAgentSessionResult | undefined;
    for await (const _event of this.recordEvents(
      this.execute(input, (completed) => {
        result = completed;
      })
    )) {
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
    const sessionTimeout = createTimeout(
      optionalTimeout(input.timeoutMs, 'timeoutMs') ?? this.sessionTimeoutMs,
      'Session timed out'
    );
    const history = cloneHistory(input.history ?? []).slice(-this.historyLimit);
    const usage = emptyUsage();
    let turnsCompleted = 0;
    let roundsCompleted = 0;
    let stopReason: SessionStopReason | undefined;
    let stopDetail: string | undefined;
    let stopMarker: string | undefined;
    let activePlatform: string | undefined;
    let estimatedCostUsd = 0;
    const tokensBySpeaker = new Map<AgentPlatID, number>();

    try {
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
          if (sessionTimeout.timedOut) {
            stopReason = 'timeout';
            stopDetail = 'Session timed out';
            break outer;
          }
          if (input.stopSignal?.aborted) {
            stopReason = 'stopped';
            stopDetail = cooperativeStopMessage(input.stopSignal);
            break outer;
          }
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
            createdAt: this.clock().toISOString(),
          };
          yield {
            type: 'speaker_changed',
            runId: turnId,
            payload: turnPayload,
          };
          yield { type: 'turn_started', runId: turnId, payload: turnPayload };

          const turnStartedAt = performance.now();
          const turnTimeout = createTimeout(
            this.turnTimeoutMs,
            'Turn timed out'
          );
          const executionSignal = combineSignals(
            input.signal,
            sessionTimeout.signal,
            turnTimeout.signal
          );
          let output = '';
          let completion: AgentCompletionPayload | undefined;
          let turnFailure: string | undefined;
          try {
            for (let attempt = 0; attempt < 2; attempt += 1) {
              const platform = activePlatform ?? speaker.platform;
              const agent = this.agentDefinition(speaker, platform);
              output = '';
              completion = undefined;
              turnFailure = undefined;
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
                    signal: executionSignal.signal,
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
                          ...(event.payload
                            ? { runtimePayload: event.payload }
                            : {}),
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
                if (sessionTimeout.timedOut || turnTimeout.timedOut) {
                  stopReason = 'timeout';
                  stopDetail = sessionTimeout.timedOut
                    ? 'Session timed out'
                    : 'Turn timed out';
                }
              } catch (error) {
                if (sessionTimeout.timedOut || turnTimeout.timedOut) {
                  stopReason = 'timeout';
                  stopDetail = sessionTimeout.timedOut
                    ? 'Session timed out'
                    : 'Turn timed out';
                } else if (input.signal?.aborted) {
                  stopReason = 'aborted';
                  stopDetail = abortMessage(input.signal);
                } else {
                  turnFailure ??= errorMessage(error);
                }
              }
              if (!turnFailure || stopReason) break;
              yield {
                type: 'turn_failed',
                runId: turnId,
                payload: {
                  ...turnPayload,
                  reason: 'failed',
                  platform,
                  detail: turnFailure,
                },
              };
              if (
                this.fallbackPlatform &&
                this.fallbackPlatform !== platform &&
                attempt === 0
              ) {
                activePlatform = this.fallbackPlatform;
                yield {
                  type: 'provider_fallback',
                  runId: turnId,
                  payload: {
                    ...turnPayload,
                    fromPlatform: platform,
                    toPlatform: activePlatform,
                    detail: turnFailure,
                  },
                };
                continue;
              }
              stopReason = 'failed';
              stopDetail = turnFailure;
              break;
            }
          } finally {
            executionSignal.dispose();
            turnTimeout.dispose();
          }

          if (turnFailure && !stopReason) {
            stopReason = 'failed';
            stopDetail = turnFailure;
          }
          if (
            stopReason === 'aborted' ||
            stopReason === 'timeout' ||
            stopReason === 'failed'
          ) {
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
          const speakerTokens =
            (tokensBySpeaker.get(speaker.id) ?? 0) +
            (reportedUsage.totalTokens ?? 0);
          tokensBySpeaker.set(speaker.id, speakerTokens);
          const turnCostUsd = this.options.estimateCostUsd
            ? normalizedCost(
                this.options.estimateCostUsd({
                  speaker,
                  usage: reportedUsage,
                  aggregateUsage: { ...usage },
                  round,
                  turn,
                })
              )
            : undefined;
          if (turnCostUsd !== undefined) estimatedCostUsd += turnCostUsd;
          turnsCompleted = turn;
          roundsCompleted = round;
          const message: SessionMessage = {
            speakerId: speaker.id,
            speakerName: speaker.name,
            content: output,
            round,
            turn,
            createdAt: turnPayload.createdAt,
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
              ...(turnCostUsd !== undefined
                ? { estimatedCostUsd: turnCostUsd }
                : {}),
              ...(this.options.estimateCostUsd
                ? { totalEstimatedCostUsd: estimatedCostUsd }
                : {}),
            },
          };

          if (
            this.maxTokens !== undefined &&
            usage.totalTokens >= this.maxTokens
          ) {
            stopReason = 'token_budget';
            stopDetail = `Session token budget reached: ${this.maxTokens}`;
            break outer;
          }
          const speakerBudget = this.maxTokensBySpeaker[speaker.id];
          if (speakerBudget !== undefined && speakerTokens >= speakerBudget) {
            stopReason = 'token_budget';
            stopDetail = `Token budget reached for speaker ${speaker.id}: ${speakerBudget}`;
            break outer;
          }
          if (
            this.maxCostUsd !== undefined &&
            estimatedCostUsd >= this.maxCostUsd
          ) {
            stopReason = 'cost_budget';
            stopDetail = `Session cost budget reached: $${this.maxCostUsd}`;
            break outer;
          }

          if (input.stopSignal?.aborted) {
            stopReason = 'stopped';
            stopDetail = cooperativeStopMessage(input.stopSignal);
            break outer;
          }

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

      stopReason ??= sessionTimeout.timedOut
        ? 'timeout'
        : input.signal?.aborted
          ? 'aborted'
          : input.stopSignal?.aborted
            ? 'stopped'
            : 'max_rounds';
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
          : stopReason === 'failed' || stopReason === 'timeout'
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
        ...(this.options.estimateCostUsd ? { estimatedCostUsd } : {}),
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
          ...(this.options.estimateCostUsd ? { estimatedCostUsd } : {}),
          durationMs: result.durationMs,
        },
      };
    } finally {
      sessionTimeout.dispose();
    }
  }

  private async *recordEvents(
    events: AsyncIterable<MultiAgentSessionEvent>
  ): AsyncIterable<MultiAgentSessionEvent> {
    let sequence = 0;
    for await (const event of events) {
      sequence += 1;
      if (this.options.eventSink) {
        const sessionId = event.payload.sessionId;
        const record: SessionEventRecord = {
          eventId: `${sessionId}:${sequence}`,
          tenantId: this.tenant.tenantId,
          sessionId,
          sequence,
          occurredAt: this.clock().toISOString(),
          event: structuredClone(event),
        };
        try {
          await this.options.eventSink.append(record);
        } catch (error) {
          if (this.sinkFailureMode === 'required') {
            throw new AgentPlatError(
              'ADAPTER_ERROR',
              `Session event sink failed: ${errorMessage(error)}`
            );
          }
        }
      }
      yield event;
    }
  }

  private agentDefinition(
    speaker: SessionSpeaker,
    platform = speaker.platform
  ): AgentDefinition {
    const now = this.clock().toISOString();
    return {
      id: speaker.id,
      tenantId: this.tenant.tenantId,
      name: speaker.name,
      description: speaker.description,
      instructions: speaker.instructions,
      platform,
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

/** Format a bounded transcript without making its presentation a prompt DSL. */
export function formatSessionTranscript(
  history: readonly SessionMessage[]
): string {
  return history.length
    ? history
        .map((message) => `${message.speakerName}: ${message.content}`)
        .join('\n')
    : '(no previous turns)';
}

/** Build a generic, overwriteable input mapper for persona-based turns. */
export function createPersonaInputBuilder(
  options: PersonaInputBuilderOptions = {}
): (context: SessionInputContext) => AgentRunInput {
  return (context) => {
    const persona = options.personas?.[context.speaker.id];
    const scenario =
      typeof context.scenario === 'string'
        ? context.scenario
        : JSON.stringify(context.scenario);
    const transcript = formatSessionTranscript(context.history);
    const turnTemplate =
      context.history.length === 0
        ? (options.openingTurn ??
          'Open the conversation in character and move the scenario forward.')
        : (options.replyTurn ??
          'Reply to the conversation so far in character and move it forward.');
    return {
      input: [
        {
          role: 'user',
          content: [
            `Scenario:\n${scenario}`,
            formatPersona(context.speaker, persona),
            `Conversation so far:\n${transcript}`,
            `Your turn:\n${turnTemplate}`,
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
  };
}

/** Create a pure reducer that maps streamed events into UI-friendly state. */
export function createSessionEventReducer(): SessionEventReducer {
  return { initialState: emptySessionViewState(), reduce: reduceSessionEvent };
}

/** Convert a completed session into stable numeric metrics for any backend. */
export function sessionMetrics(
  result: Pick<
    MultiAgentSessionResult,
    'usage' | 'turnsCompleted' | 'durationMs' | 'estimatedCostUsd'
  >
): SessionMetrics {
  return {
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    totalTokens: result.usage.totalTokens,
    reportedTurns: result.usage.reportedTurns,
    turnsCompleted: result.turnsCompleted,
    durationMs: result.durationMs,
    estimatedCostUsd: result.estimatedCostUsd ?? 0,
  };
}

/** Export reducer state as lossless session history for a later invocation. */
export function exportSessionHistory(
  state: Pick<SessionViewState, 'turnOrder' | 'turns'>
): SessionMessage[] {
  return state.turnOrder.flatMap((turnId) => {
    const turn = state.turns[turnId];
    if (!turn || turn.status !== 'completed') return [];
    return [
      {
        speakerId: turn.speaker.id,
        speakerName: turn.speaker.name,
        content: turn.content,
        round: turn.round,
        turn: turn.turn,
        createdAt: turn.createdAt,
      },
    ];
  });
}

/** Create a speaker and aligned persona from a form-friendly configuration DTO. */
export interface SpeakerDefinitionInput {
  id: AgentPlatID;
  name: string;
  platform: string;
  instructions?: string;
  role?: string;
  goals?: string[];
  constraints?: string[];
  peerDescription?: string;
  description?: string;
  modelName?: string;
  config?: JsonObject;
  metadata?: Metadata;
}

export function defineSpeaker(input: SpeakerDefinitionInput): {
  speaker: SessionSpeaker;
  persona: SessionPersona;
} {
  required(input.id, 'speaker.id');
  required(input.name, 'speaker.name');
  required(input.platform, 'speaker.platform');
  const instructions = input.instructions?.trim() || input.role?.trim();
  required(instructions, 'speaker.instructions or speaker.role');
  return {
    speaker: {
      id: input.id,
      name: input.name,
      instructions,
      platform: input.platform,
      ...(input.description ? { description: input.description } : {}),
      ...(input.modelName ? { modelName: input.modelName } : {}),
      ...(input.config ? { config: structuredClone(input.config) } : {}),
      ...(input.metadata ? { metadata: structuredClone(input.metadata) } : {}),
    },
    persona: {
      ...(input.role ? { role: input.role } : {}),
      ...(input.goals ? { goals: [...input.goals] } : {}),
      ...(input.constraints ? { constraints: [...input.constraints] } : {}),
      ...(input.peerDescription
        ? { peerDescription: input.peerDescription }
        : {}),
    },
  };
}

/** Portable, form-friendly scenario DTO for sessions that do not need a domain model. */
export interface ScenarioInput {
  topic: string;
  title?: string;
  metadata?: JsonObject;
}

/** Format a structured scenario consistently before it becomes a session prompt. */
export function buildScenarioInput(input: ScenarioInput): string {
  required(input.topic, 'scenario.topic');
  const parts = [
    input.title ? `Scenario: ${input.title}` : undefined,
    `Topic:\n${input.topic}`,
    input.metadata && Object.keys(input.metadata).length
      ? `Metadata:\n${JSON.stringify(input.metadata)}`
      : undefined,
  ].filter((part): part is string => Boolean(part));
  return parts.join('\n\n');
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
  const transcript = formatSessionTranscript(context.history);
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

function emptySessionViewState(): SessionViewState {
  return {
    status: 'idle',
    speakers: [],
    turns: {},
    turnOrder: [],
    usage: emptyUsage(),
    totalLatencyMs: 0,
    metrics: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      reportedTurns: 0,
      turnsCompleted: 0,
      durationMs: 0,
      estimatedCostUsd: 0,
    },
    estimatedCostUsd: 0,
    canSoftStop: false,
    canResume: false,
    isLive: false,
  };
}

function reduceSessionEvent(
  state: SessionViewState,
  event: MultiAgentSessionEvent
): SessionViewState {
  const next: SessionViewState = {
    ...state,
    speakers: [...state.speakers],
    turns: { ...state.turns },
    turnOrder: [...state.turnOrder],
    usage: { ...state.usage },
  };
  switch (event.type) {
    case 'session_started':
      next.sessionId = event.payload.sessionId;
      next.status = 'running';
      next.speakers = event.payload.speakers.map((speaker) => ({ ...speaker }));
      next.canSoftStop = true;
      next.canResume = false;
      next.isLive = true;
      return next;
    case 'speaker_changed':
    case 'turn_started': {
      const { turnId, speaker, round, turn } = event.payload;
      if (!next.turns[turnId]) {
        next.turns[turnId] = {
          turnId,
          speaker: { ...speaker },
          round,
          turn,
          createdAt: event.payload.createdAt,
          content: '',
          status: 'running',
        };
        next.turnOrder.push(turnId);
      }
      next.activeTurnId = turnId;
      return next;
    }
    case 'token': {
      const current = ensureTurn(next, event.payload);
      current.content += event.content;
      return next;
    }
    case 'turn_completed': {
      const current = ensureTurn(next, event.payload);
      current.content = event.content;
      current.status = 'completed';
      current.usage = { ...event.payload.usage };
      current.latencyMs = event.payload.latencyMs;
      current.model = event.payload.model;
      current.finishReason = event.payload.finishReason;
      next.totalLatencyMs += event.payload.latencyMs;
      if (next.activeTurnId === current.turnId) next.activeTurnId = undefined;
      next.usage = { ...event.payload.aggregateUsage };
      next.metrics = metricsFromState(next);
      next.estimatedCostUsd =
        event.payload.totalEstimatedCostUsd ?? next.estimatedCostUsd;
      next.metrics.estimatedCostUsd = next.estimatedCostUsd;
      next.canResume = true;
      return next;
    }
    case 'turn_failed':
      return next;
    case 'provider_fallback':
      return next;
    case 'session_failed': {
      const current = ensureTurn(next, event.payload);
      current.status = 'failed';
      current.content ||= event.content;
      if (next.activeTurnId === current.turnId) next.activeTurnId = undefined;
      next.status = 'failed';
      next.stopDetail = event.content;
      next.canSoftStop = false;
      next.canResume = next.turnOrder.some(
        (turnId) => next.turns[turnId]?.status === 'completed'
      );
      next.isLive = false;
      return next;
    }
    case 'stop_reason':
      next.stopReason = event.payload.reason;
      next.stopDetail = event.payload.detail;
      return next;
    case 'session_completed':
      next.sessionId = event.payload.sessionId;
      next.usage = { ...event.payload.usage };
      next.stopReason = event.payload.stopReason;
      next.stopDetail = event.payload.stopDetail;
      next.durationMs = event.payload.durationMs;
      next.activeTurnId = undefined;
      next.metrics = {
        inputTokens: event.payload.usage.inputTokens,
        outputTokens: event.payload.usage.outputTokens,
        totalTokens: event.payload.usage.totalTokens,
        reportedTurns: event.payload.usage.reportedTurns,
        turnsCompleted: event.payload.turnsCompleted,
        durationMs: event.payload.durationMs,
        estimatedCostUsd: event.payload.estimatedCostUsd ?? 0,
      };
      next.estimatedCostUsd = event.payload.estimatedCostUsd ?? 0;
      next.status = event.payload.status;
      next.canSoftStop = false;
      next.canResume = next.turnOrder.some(
        (turnId) => next.turns[turnId]?.status === 'completed'
      );
      next.isLive = false;
      return next;
    case 'tool_call':
    case 'tool_result':
      return next;
  }
}

function ensureTurn(
  state: SessionViewState,
  payload: SessionTurnPayload
): SessionTurnView {
  const current = state.turns[payload.turnId];
  if (current) return current;
  const created: SessionTurnView = {
    turnId: payload.turnId,
    speaker: { ...payload.speaker },
    round: payload.round,
    turn: payload.turn,
    createdAt: payload.createdAt,
    content: '',
    status: 'running',
  };
  state.turns[payload.turnId] = created;
  state.turnOrder.push(payload.turnId);
  return created;
}

function metricsFromState(state: SessionViewState): SessionMetrics {
  return {
    inputTokens: state.usage.inputTokens,
    outputTokens: state.usage.outputTokens,
    totalTokens: state.usage.totalTokens,
    reportedTurns: state.usage.reportedTurns,
    turnsCompleted: state.turnOrder.filter(
      (turnId) => state.turns[turnId]?.status === 'completed'
    ).length,
    durationMs: state.durationMs ?? state.totalLatencyMs,
    estimatedCostUsd: state.estimatedCostUsd,
  };
}

function normalizeFallbackPlatform(
  value: MultiAgentSessionOptions['fallbackPlatform']
): string | undefined {
  if (!value) return undefined;
  const platform = typeof value === 'string' ? value : value.platform;
  required(platform, 'fallbackPlatform');
  return platform.trim();
}

function optionalPositiveNumber(
  value: number | undefined,
  name: string
): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value <= 0) {
    throw new AgentPlatError('VALIDATION_ERROR', `${name} must be positive`);
  }
  return value;
}

function normalizeSpeakerBudgets(
  budgets: Record<AgentPlatID, number> | undefined
): Record<AgentPlatID, number> {
  if (!budgets) return {};
  return Object.fromEntries(
    Object.entries(budgets).map(([speakerId, budget]) => [
      speakerId,
      optionalPositiveNumber(budget, `maxTokensBySpeaker.${speakerId}`)!,
    ])
  );
}

function normalizedCost(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new AgentPlatError(
      'VALIDATION_ERROR',
      'estimateCostUsd must return a non-negative finite number'
    );
  }
  return value;
}

function formatPersona(
  speaker: SessionSpeaker,
  persona: SessionPersona | undefined
): string {
  const details = [
    `You are ${speaker.name}.`,
    speaker.instructions ? `Instructions: ${speaker.instructions}` : undefined,
    persona?.role ? `Role: ${persona.role}` : undefined,
    persona?.goals?.length
      ? `Private goals: ${persona.goals.join('; ')}`
      : undefined,
    persona?.constraints?.length
      ? `Private constraints: ${persona.constraints.join('; ')}`
      : undefined,
    persona?.peerDescription ? `Peer: ${persona.peerDescription}` : undefined,
  ].filter((part): part is string => Boolean(part));
  return details.join('\n');
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

function cooperativeStopMessage(signal: AbortSignal): string {
  return signal.reason instanceof Error
    ? signal.reason.message
    : 'Session stop requested';
}

function optionalTimeout(
  value: number | undefined,
  field: string
): number | undefined {
  if (value === undefined) return undefined;
  return positiveInteger(value, field, 86_400_000);
}

function createTimeout(
  timeoutMs: number | undefined,
  message: string
): { signal?: AbortSignal; timedOut: boolean; dispose(): void } {
  if (timeoutMs === undefined) {
    return { signal: undefined, timedOut: false, dispose() {} };
  }
  const controller = new AbortController();
  const state = {
    timedOut: false,
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
    },
  };
  const timer = setTimeout(() => {
    state.timedOut = true;
    controller.abort(new Error(message));
  }, timeoutMs);
  return state;
}

function combineSignals(...signals: Array<AbortSignal | undefined>): {
  signal: AbortSignal;
  dispose(): void;
} {
  const controller = new AbortController();
  const listeners: Array<readonly [AbortSignal, () => void]> = [];
  const abort = (signal: AbortSignal) => {
    if (!controller.signal.aborted) controller.abort(signal.reason);
  };
  for (const signal of signals) {
    if (!signal) continue;
    if (signal.aborted) {
      abort(signal);
      continue;
    }
    const listener = () => abort(signal);
    signal.addEventListener('abort', listener, { once: true });
    listeners.push([signal, listener]);
  }
  return {
    signal: controller.signal,
    dispose() {
      for (const [signal, listener] of listeners) {
        signal.removeEventListener('abort', listener);
      }
    },
  };
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
