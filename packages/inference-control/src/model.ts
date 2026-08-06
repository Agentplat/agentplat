import type { JsonObject, JsonValue, TenantContext } from '@agentplat/core';
import type {
  ChatMessage,
  ModelAdapter,
  ModelExecutionContext,
  ModelRequest,
  ModelResult,
  ModelStreamEvent,
  ModelToolDefinition,
} from '@agentplat/model';

import {
  assertContextAllowedByPolicyV1,
  resolveControlBoundaryV1,
  type InferenceControlBoundaryV1,
} from './boundary.js';
import {
  canonicalizeControlJsonV1,
  digestControlJsonV1,
  utf8ByteLength,
} from './canonical.js';
import { validateControlScopeV1 } from './scopes.js';
import type {
  ContextEntryV1,
  ControlScopeV1,
  InferenceControlPolicyV1,
} from './types.js';
import {
  assertDigest,
  assertExactKeys,
  assertOneOf,
  assertString,
  deepFreeze as freezeControlValue,
} from './validation.js';

const MAX_CONTEXT_ENTRIES = 256;
const MAX_RENDERED_BYTES = 1_048_576;

export interface ControlledModelOptionsV1 {
  readonly temperature: number | null;
  readonly maxOutputTokens: number | null;
  readonly stop: readonly string[];
  readonly responseFormat: 'text' | 'json' | null;
}

export interface ControlledModelRequestV1 {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly tenantId: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly capabilityHandleId: string;
  readonly contextEntryIds: readonly string[];
  readonly model: string | null;
  readonly tools: readonly ModelToolDefinition[];
  readonly options: ControlledModelOptionsV1 | null;
  readonly scope: ControlScopeV1 | null;
}

export interface RenderedControlledModelRequestV1 {
  readonly schemaVersion: 1;
  readonly request: ModelRequest;
  readonly providerRequestDigest: string;
  readonly contextEntries: readonly ContextEntryV1[];
}

export interface ControlledModelAssessmentRequestV1 {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly checkpoint: 'pre_run' | 'stream' | 'post_run';
  readonly targetKind: 'provider_request' | 'stream_window' | 'final_output';
  readonly targetDigest: string;
  readonly content: string | null;
  readonly sequence: number | null;
  readonly fromByte: number | null;
  readonly throughByteExclusive: number | null;
}

export interface ControlledModelAssessmentResultV1 {
  readonly disposition: 'allow' | 'deny' | 'abstain' | 'escalate';
  readonly reasonCode: string;
}

export interface ControlledModelAssessorV1 {
  readonly assessorId: string;
  readonly assessorVersion: number;
  readonly assessorBindingDigest: string;
  assess(
    request: ControlledModelAssessmentRequestV1,
  ): Promise<ControlledModelAssessmentResultV1>;
}

export interface ControlledModelContextGateResultV1 {
  readonly disposition: 'allow' | 'abstain' | 'deny';
  readonly filterRequired: boolean;
  readonly admittedContextEntryIds: readonly string[];
  readonly decisionDigest: string;
}

/**
 * A pre-provider context gate may only select entries from the immutable input
 * set. The executor, rather than the gate, performs the physical filtering.
 */
export interface ControlledModelContextGateV1 {
  readonly filterBindingDigest: string;
  evaluate(input: {
    readonly request: ControlledModelRequestV1;
    readonly contextEntries: readonly ContextEntryV1[];
  }): Promise<ControlledModelContextGateResultV1>;
}

export interface ControlledModelExecutorOptionsV1 {
  readonly adapter: ModelAdapter;
  readonly controlBoundary: InferenceControlBoundaryV1;
  readonly contextEntries: (
    ids: readonly string[],
  ) => readonly ContextEntryV1[];
  readonly assessor: ControlledModelAssessorV1;
  readonly contextGate?: ControlledModelContextGateV1;
  readonly mode: 'observe' | 'buffered' | 'incremental';
  readonly outputRisk: 'low' | 'moderate' | 'high';
}

export interface ControlledModelResultV1 {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly status: 'completed' | 'denied' | 'abstained' | 'escalated';
  readonly output: string | null;
  readonly outputDigest: string | null;
  readonly releasedBytes: number;
  readonly providerResult: ModelResult | null;
}

export type ControlledModelStreamEventV1 =
  | {
      readonly type: 'control_started';
      readonly runId: string;
      readonly providerRequestDigest: string;
    }
  | {
      readonly type: 'control_output_released';
      readonly runId: string;
      readonly streamId: string;
      readonly sequence: number;
      readonly throughByteExclusive: number;
      readonly content: string;
      readonly contentDigest: string;
    }
  | {
      readonly type: 'control_tool_withheld';
      readonly runId: string;
      readonly callId: string;
      readonly toolName: string;
    }
  | {
      readonly type: 'control_completed';
      readonly runId: string;
      readonly status: ControlledModelResultV1['status'];
      readonly releasedBytes: number;
      readonly outputDigest: string | null;
    }
  | {
      readonly type: 'control_failed';
      readonly runId: string;
      readonly reasonCode: string;
    };

export function renderControlledModelRequestV1(
  controlled: ControlledModelRequestV1,
  resolveEntries: (ids: readonly string[]) => readonly ContextEntryV1[],
): RenderedControlledModelRequestV1 {
  assertControlledModelRequest(controlled);
  const entries = [...resolveEntries(controlled.contextEntryIds)];
  if (entries.length !== controlled.contextEntryIds.length) {
    throw new Error('context_zone_invalid');
  }
  const byId = new Map(entries.map((entry) => [entry.contextEntryId, entry]));
  const ordered = controlled.contextEntryIds.map((id) => {
    const entry = byId.get(id);
    if (
      !entry ||
      entry.runId !== controlled.runId ||
      entry.tenantId !== controlled.tenantId
    ) {
      throw new Error('context_zone_invalid');
    }
    return entry;
  });
  const messages: ChatMessage[] = [];
  for (const zone of [
    'policy',
    'objective',
    'local_trusted',
    'user_untrusted',
    'peer_untrusted',
    'tool_untrusted',
    'retrieval_untrusted',
    'provider_untrusted',
    'assessor_untrusted',
  ] as const) {
    for (const entry of ordered) {
      if (entry.zone !== zone) continue;
      if (
        zone === 'policy' ||
        zone === 'objective' ||
        zone === 'local_trusted'
      ) {
        messages.push({
          role: zone === 'policy' ? 'system' : 'developer',
          content:
            entry.mediaType === 'text'
              ? String(entry.content)
              : canonicalizeControlJsonV1(entry.content as JsonValue),
        });
      } else {
        messages.push({
          role: 'user',
          content: canonicalizeControlJsonV1({
            schemaVersion: 1,
            kind: 'agentplat.control.context',
            zone: entry.zone,
            sourceKind: entry.sourceKind,
            sourceId: entry.sourceId,
            sourceVersion: entry.sourceVersion,
            provenanceDigest: entry.provenanceDigest,
            content: entry.content,
          }),
        });
      }
    }
  }
  const request: ModelRequest = {
    messages,
    ...(controlled.model === null ? {} : { model: controlled.model }),
    ...(controlled.tools.length === 0 ? {} : { tools: [...controlled.tools] }),
    ...(controlled.options === null
      ? {}
      : {
          options: {
            ...(controlled.options.temperature === null
              ? {}
              : { temperature: controlled.options.temperature }),
            ...(controlled.options.maxOutputTokens === null
              ? {}
              : { maxOutputTokens: controlled.options.maxOutputTokens }),
            ...(controlled.options.stop.length === 0
              ? {}
              : { stop: [...controlled.options.stop] }),
            ...(controlled.options.responseFormat === null
              ? {}
              : { responseFormat: controlled.options.responseFormat }),
          },
        }),
  };
  const canonical = modelRequestJson(request);
  if (
    utf8ByteLength(canonicalizeControlJsonV1(canonical)) > MAX_RENDERED_BYTES
  ) {
    throw new Error('context_limit_exceeded');
  }
  return Object.freeze({
    schemaVersion: 1,
    request: deepFreeze(request),
    providerRequestDigest: digestControlJsonV1('provider-request', canonical),
    contextEntries: Object.freeze(ordered),
  });
}

export class ControlledModelExecutorV1 {
  readonly #adapter: ModelAdapter;
  readonly #resolveEntries: ControlledModelExecutorOptionsV1['contextEntries'];
  readonly #assessor: ControlledModelAssessorV1;
  readonly #mode: ControlledModelExecutorOptionsV1['mode'];
  readonly #risk: ControlledModelExecutorOptionsV1['outputRisk'];
  readonly #controlBoundary: InferenceControlBoundaryV1;
  readonly #contextGate: ControlledModelContextGateV1 | null;

  constructor(options: ControlledModelExecutorOptionsV1) {
    if (options.outputRisk === 'high' && options.mode !== 'buffered') {
      throw new Error('release_mode_incompatible');
    }
    assertDigest(
      options.assessor.assessorBindingDigest,
      'assessorBindingDigest',
    );
    if (options.contextGate)
      assertDigest(
        options.contextGate.filterBindingDigest,
        'contextGate.filterBindingDigest',
      );
    this.#adapter = options.adapter;
    this.#controlBoundary = options.controlBoundary;
    this.#resolveEntries = options.contextEntries;
    this.#contextGate = options.contextGate
      ? Object.freeze({
          filterBindingDigest: options.contextGate.filterBindingDigest,
          evaluate: options.contextGate.evaluate.bind(options.contextGate),
        })
      : null;
    this.#assessor = Object.freeze({
      assessorId: options.assessor.assessorId,
      assessorVersion: options.assessor.assessorVersion,
      assessorBindingDigest: options.assessor.assessorBindingDigest,
      assess: options.assessor.assess.bind(options.assessor),
    });
    this.#mode = options.mode;
    this.#risk = options.outputRisk;
  }

  async generate(
    controlled: ControlledModelRequestV1,
    context: ModelExecutionContext,
  ): Promise<ControlledModelResultV1> {
    const boundary = this.#resolveBoundary(controlled);
    const rendered = await this.#render(controlled);
    assertContextAllowedByPolicyV1(boundary.policy, rendered.contextEntries);
    await this.#requireAllow(
      {
        schemaVersion: 1,
        runId: controlled.runId,
        checkpoint: 'pre_run',
        targetKind: 'provider_request',
        targetDigest: rendered.providerRequestDigest,
        content: null,
        sequence: null,
        fromByte: null,
        throughByteExclusive: null,
      },
      boundary.policy,
    );
    const result = await this.#adapter.generate(rendered.request, context);
    const outputBytes = utf8ByteLength(result.content);
    if (outputBytes > boundary.policy.limits.maxBufferedOutputBytes)
      throw new Error('release_buffer_exceeded');
    const outputDigest = digestControlJsonV1(
      'assessment-target',
      result.content,
    );
    const assessment = await this.#assess(
      {
        schemaVersion: 1,
        runId: controlled.runId,
        checkpoint: 'post_run',
        targetKind: 'final_output',
        targetDigest: outputDigest,
        content: result.content,
        sequence: null,
        fromByte: 0,
        throughByteExclusive: outputBytes,
      },
      boundary.policy,
    );
    const allowed =
      assessment.disposition === 'allow' || this.#mode === 'observe';
    return Object.freeze({
      schemaVersion: 1,
      runId: controlled.runId,
      status: allowed
        ? 'completed'
        : terminalDisposition(assessment.disposition),
      output: allowed ? result.content : null,
      outputDigest,
      releasedBytes: allowed ? outputBytes : 0,
      providerResult: allowed ? deepFreeze(result) : null,
    });
  }

  async *stream(
    controlled: ControlledModelRequestV1,
    context: ModelExecutionContext,
  ): AsyncIterable<ControlledModelStreamEventV1> {
    if (!this.#adapter.stream) throw new Error('release_mode_incompatible');
    const boundary = this.#resolveBoundary(controlled);
    const rendered = await this.#render(controlled);
    assertContextAllowedByPolicyV1(boundary.policy, rendered.contextEntries);
    await this.#requireAllow(
      {
        schemaVersion: 1,
        runId: controlled.runId,
        checkpoint: 'pre_run',
        targetKind: 'provider_request',
        targetDigest: rendered.providerRequestDigest,
        content: null,
        sequence: null,
        fromByte: null,
        throughByteExclusive: null,
      },
      boundary.policy,
    );
    yield {
      type: 'control_started',
      runId: controlled.runId,
      providerRequestDigest: rendered.providerRequestDigest,
    };
    let streamId = `stream:${controlled.runId}`;
    let sequence = 0;
    let received = '';
    let releasedBytes = 0;
    let completion: ModelResult | undefined;
    let providerTerminal = false;
    const buffered: Array<{
      content: string;
      sequence: number;
      digest: string;
    }> = [];
    try {
      for await (const event of this.#adapter.stream(
        rendered.request,
        context,
      )) {
        if (providerTerminal) throw new Error('stream_terminal_invalid');
        if (event.type === 'started') {
          if (event.id) streamId = `stream:${event.id}`;
          continue;
        }
        if (event.type === 'text_delta') {
          assertChunk(
            event.content,
            boundary.policy.limits.maxOutputChunkBytes,
          );
          if (sequence >= boundary.policy.limits.maxOutputChunksPerRun)
            throw new Error('state_capacity_exceeded');
          const fromByte = utf8ByteLength(received);
          received += event.content;
          if (
            this.#mode === 'buffered' &&
            utf8ByteLength(received) >
              boundary.policy.limits.maxBufferedOutputBytes
          )
            throw new Error('release_buffer_exceeded');
          if (
            this.#mode === 'incremental' &&
            utf8ByteLength(event.content) >
              boundary.policy.limits.maxPendingWindowBytes
          )
            throw new Error('release_buffer_exceeded');
          const digest = digestControlJsonV1(
            'assessment-target',
            event.content,
          );
          const currentSequence = sequence++;
          if (this.#mode === 'buffered') {
            buffered.push({
              content: event.content,
              sequence: currentSequence,
              digest,
            });
            continue;
          }
          const assessment = await this.#assess(
            {
              schemaVersion: 1,
              runId: controlled.runId,
              checkpoint: 'stream',
              targetKind: 'stream_window',
              targetDigest: digestControlJsonV1('stream-window', {
                streamId,
                sequence: currentSequence,
                fromByte,
                throughByteExclusive: utf8ByteLength(received),
                contentDigest: digest,
              }),
              content: event.content,
              sequence: currentSequence,
              fromByte,
              throughByteExclusive: utf8ByteLength(received),
            },
            boundary.policy,
          );
          if (assessment.disposition !== 'allow' && this.#mode !== 'observe') {
            context.signal?.throwIfAborted();
            yield {
              type: 'control_completed',
              runId: controlled.runId,
              status: terminalDisposition(assessment.disposition),
              releasedBytes,
              outputDigest: null,
            };
            return;
          }
          releasedBytes += utf8ByteLength(event.content);
          yield {
            type: 'control_output_released',
            runId: controlled.runId,
            streamId,
            sequence: currentSequence,
            throughByteExclusive: releasedBytes,
            content: event.content,
            contentDigest: digest,
          };
          continue;
        }
        if (event.type === 'tool_call') {
          yield {
            type: 'control_tool_withheld',
            runId: controlled.runId,
            callId: event.call.id,
            toolName: event.call.name,
          };
          continue;
        }
        if (event.type === 'completed') {
          providerTerminal = true;
          completion = event.result;
          continue;
        }
        if (event.type === 'failed') {
          providerTerminal = true;
          throw new Error('assessment_indeterminate');
        }
      }
      if (!completion) throw new Error('stream_terminal_missing');
      const finalText = completion.content;
      if (received && completion.content !== received)
        throw new Error('stream_content_mismatch');
      if (
        utf8ByteLength(finalText) >
        boundary.policy.limits.maxBufferedOutputBytes
      )
        throw new Error('release_buffer_exceeded');
      const outputDigest = digestControlJsonV1('assessment-target', finalText);
      const assessment = await this.#assess(
        {
          schemaVersion: 1,
          runId: controlled.runId,
          checkpoint: 'post_run',
          targetKind: 'final_output',
          targetDigest: outputDigest,
          content: finalText,
          sequence: null,
          fromByte: 0,
          throughByteExclusive: utf8ByteLength(finalText),
        },
        boundary.policy,
      );
      if (assessment.disposition !== 'allow' && this.#mode !== 'observe') {
        yield {
          type: 'control_completed',
          runId: controlled.runId,
          status: terminalDisposition(assessment.disposition),
          releasedBytes,
          outputDigest,
        };
        return;
      }
      if (this.#mode === 'buffered') {
        for (const chunk of buffered) {
          releasedBytes += utf8ByteLength(chunk.content);
          yield {
            type: 'control_output_released',
            runId: controlled.runId,
            streamId,
            sequence: chunk.sequence,
            throughByteExclusive: releasedBytes,
            content: chunk.content,
            contentDigest: chunk.digest,
          };
        }
      } else if (sequence === 0 && finalText) {
        releasedBytes = utf8ByteLength(finalText);
        yield {
          type: 'control_output_released',
          runId: controlled.runId,
          streamId,
          sequence: 0,
          throughByteExclusive: releasedBytes,
          content: finalText,
          contentDigest: outputDigest,
        };
      }
      yield {
        type: 'control_completed',
        runId: controlled.runId,
        status: 'completed',
        releasedBytes,
        outputDigest,
      };
    } catch (error) {
      yield {
        type: 'control_failed',
        runId: controlled.runId,
        reasonCode:
          error instanceof Error ? error.message : 'assessment_indeterminate',
      };
    }
  }

  async #requireAllow(
    request: ControlledModelAssessmentRequestV1,
    policy: InferenceControlPolicyV1,
  ): Promise<void> {
    const assessment = await this.#assess(request, policy);
    if (assessment.disposition !== 'allow' && this.#mode !== 'observe') {
      throw new Error(assessment.reasonCode || 'assessment_required');
    }
  }

  async #assess(
    request: ControlledModelAssessmentRequestV1,
    policy: InferenceControlPolicyV1,
  ): Promise<ControlledModelAssessmentResultV1> {
    const binding = policy.assessmentBindings.find(
      (candidate) => candidate.checkpoint === request.checkpoint,
    );
    if (
      !binding ||
      binding.assessorId !== this.#assessor.assessorId ||
      binding.assessorVersion !== this.#assessor.assessorVersion ||
      binding.assessorBindingDigest !== this.#assessor.assessorBindingDigest
    )
      throw new Error('assessment_assessor_mismatch');
    const result = await this.#assessor.assess(request);
    assertExactKeys(result, ['disposition', 'reasonCode'], 'model assessment');
    assertOneOf(
      result.disposition,
      ['allow', 'deny', 'abstain', 'escalate'],
      'assessment disposition',
    );
    assertString(result.reasonCode, 'assessment reasonCode');
    return freezeControlValue({ ...result });
  }

  #resolveBoundary(controlled: ControlledModelRequestV1) {
    return resolveControlBoundaryV1(this.#controlBoundary, {
      policyId: controlled.policyId,
      policyVersion: controlled.policyVersion,
      capabilityHandleId: controlled.capabilityHandleId,
      expectedMode: this.#mode,
      expectedOutputRisk: this.#risk,
    });
  }

  async #render(
    controlled: ControlledModelRequestV1,
  ): Promise<RenderedControlledModelRequestV1> {
    if (!this.#contextGate)
      return renderControlledModelRequestV1(controlled, this.#resolveEntries);
    assertControlledModelRequest(controlled);
    const original = renderControlledModelRequestV1(
      controlled,
      this.#resolveEntries,
    );
    const originalEntries = [...original.contextEntries];
    const result = await this.#contextGate.evaluate({
      request: controlled,
      contextEntries: Object.freeze(originalEntries),
    });
    assertExactKeys(
      result,
      [
        'admittedContextEntryIds',
        'decisionDigest',
        'disposition',
        'filterRequired',
      ],
      'controlled model context gate result',
    );
    assertOneOf(
      result.disposition,
      ['allow', 'abstain', 'deny'],
      'context gate disposition',
    );
    if (typeof result.filterRequired !== 'boolean')
      throw new TypeError('context_integrity_gate_result_invalid');
    assertDigest(result.decisionDigest, 'context gate decisionDigest');
    if (!Array.isArray(result.admittedContextEntryIds))
      throw new TypeError('context_integrity_gate_result_invalid');
    const originalById = new Map(
      originalEntries.map((entry) => [entry.contextEntryId, entry]),
    );
    const admittedIds = result.admittedContextEntryIds.map((entryId) => {
      assertString(entryId, 'context gate admittedContextEntryId');
      if (!originalById.has(entryId))
        throw new TypeError('context_integrity_gate_scope_invalid');
      return entryId;
    });
    if (new Set(admittedIds).size !== admittedIds.length)
      throw new TypeError('context_integrity_gate_scope_invalid');
    const expectedOrder = controlled.contextEntryIds.filter((entryId) =>
      admittedIds.includes(entryId),
    );
    if (
      expectedOrder.length !== admittedIds.length ||
      admittedIds.some((entryId, index) => entryId !== expectedOrder[index])
    )
      throw new TypeError('context_integrity_gate_order_invalid');
    if (result.disposition !== 'allow')
      throw new Error(`context_integrity_${result.disposition}`);
    if (
      !result.filterRequired &&
      admittedIds.length !== controlled.contextEntryIds.length
    )
      throw new TypeError('context_integrity_filter_binding_invalid');
    if (admittedIds.length === 0)
      throw new Error('context_integrity_empty_context');
    const admittedEntries = admittedIds.map((entryId) =>
      originalById.get(entryId)!,
    );
    const filteredRequest = Object.freeze({
      ...controlled,
      contextEntryIds: Object.freeze(admittedIds),
    });
    return renderControlledModelRequestV1(filteredRequest, () =>
      Object.freeze(admittedEntries),
    );
  }
}

function assertControlledModelRequest(request: ControlledModelRequestV1): void {
  if (request.schemaVersion !== 1) throw new TypeError('assessment_invalid');
  if (request.scope !== null) validateControlScopeV1(request.scope);
  if (
    request.contextEntryIds.length < 1 ||
    request.contextEntryIds.length > MAX_CONTEXT_ENTRIES
  )
    throw new Error('context_limit_exceeded');
  if (new Set(request.contextEntryIds).size !== request.contextEntryIds.length)
    throw new Error('state_conflict');
  if (!Number.isSafeInteger(request.policyVersion) || request.policyVersion < 1)
    throw new TypeError('assessment_invalid');
  const options = request.options;
  if (options) {
    if (
      options.temperature !== null &&
      (!Number.isFinite(options.temperature) ||
        options.temperature < 0 ||
        options.temperature > 2)
    )
      throw new TypeError('assessment_invalid');
    if (
      options.maxOutputTokens !== null &&
      (!Number.isSafeInteger(options.maxOutputTokens) ||
        options.maxOutputTokens < 1)
    )
      throw new TypeError('assessment_invalid');
    if (
      options.stop.length > 16 ||
      options.stop.some((stop) => utf8ByteLength(stop) > 256)
    )
      throw new TypeError('assessment_invalid');
  }
}

function assertChunk(content: string, maximumBytes: number): void {
  if (utf8ByteLength(content) < 1 || utf8ByteLength(content) > maximumBytes)
    throw new Error('release_buffer_exceeded');
}

function modelRequestJson(request: ModelRequest): JsonValue {
  return JSON.parse(JSON.stringify(request)) as JsonValue;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>))
      deepFreeze(child);
  }
  return value;
}

function terminalDisposition(
  disposition: ControlledModelAssessmentResultV1['disposition'],
): Exclude<ControlledModelResultV1['status'], 'completed'> {
  if (disposition === 'deny' || disposition === 'allow') return 'denied';
  return disposition === 'abstain' ? 'abstained' : 'escalated';
}

export type { ModelExecutionContext, ModelStreamEvent, TenantContext };
