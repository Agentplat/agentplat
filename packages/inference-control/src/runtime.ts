import type { JsonObject, JsonValue } from '@agentplat/core';
import type {
  AgentDefinition,
  AgentProvider,
  AgentRunInput,
  AgentStreamEvent,
  RuntimeExecutionContext,
  StreamEvent,
} from '@agentplat/runtime';
import {
  parseAgentSseStream,
  type AgentSseEnvelope,
} from '@agentplat/streaming';

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
  DiagnosticV1,
  InferenceControlPolicyV1,
} from './types.js';
import {
  assertDigest,
  assertExactKeys,
  assertOneOf,
  assertString,
  deepFreeze as freezeControlValue,
} from './validation.js';

const MAX_RENDERED_BYTES = 1_048_576;
const MAX_DEFINITION_CONFIG_BYTES = 65_536;

export interface ControlledAgentDefinitionV1 {
  readonly schemaVersion: 1;
  readonly agentId: string;
  readonly name: string;
  readonly description: string | null;
  readonly platform: string;
  readonly modelName: string | null;
  readonly instructionContextEntryIds: readonly string[];
  readonly config: JsonObject | null;
}

export interface ControlledAgentRequestV1 {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly tenantId: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly capabilityHandleId: string;
  readonly agentDefinition: ControlledAgentDefinitionV1;
  readonly contextEntryIds: readonly string[];
  readonly input: JsonValue;
  readonly scope: ControlScopeV1 | null;
}

export interface RenderedControlledAgentRequestV1 {
  readonly schemaVersion: 1;
  readonly agent: AgentDefinition;
  readonly input: AgentRunInput;
  readonly providerRequestDigest: string;
  readonly contextEntries: readonly ContextEntryV1[];
}

export interface ControlledAgentAssessmentRequestV1 {
  readonly runId: string;
  readonly checkpoint: 'pre_run' | 'stream' | 'post_run';
  readonly targetDigest: string;
  readonly content: string | null;
  readonly sequence: number | null;
}

export interface ControlledAgentAssessorV1 {
  readonly assessorId: string;
  readonly assessorVersion: number;
  readonly assessorBindingDigest: string;
  assess(request: ControlledAgentAssessmentRequestV1): Promise<{
    readonly disposition: 'allow' | 'deny' | 'abstain' | 'escalate';
    readonly reasonCode: string;
  }>;
}

export interface ControlledAgentExecutorOptionsV1 {
  readonly provider: AgentProvider;
  readonly controlBoundary: InferenceControlBoundaryV1;
  readonly contextEntries: (
    ids: readonly string[],
  ) => readonly ContextEntryV1[];
  readonly assessor: ControlledAgentAssessorV1;
  readonly mode: 'observe' | 'buffered' | 'incremental';
  readonly outputRisk: 'low' | 'moderate' | 'high';
}

export interface ControlledAgentRunResultV1 {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly tenantId: string;
  readonly generation: number;
  readonly status:
    'completed' | 'denied' | 'abstained' | 'escalated' | 'failed';
  readonly output: string | null;
  readonly outputDigest: string | null;
  readonly releasedBytes: number;
  readonly terminalReasonCode: string | null;
  readonly diagnostics: readonly DiagnosticV1[];
}

type StartedPayload = JsonObject & {
  schemaVersion: 1;
  generation: number;
  policyId: string;
  policyVersion: number;
};
type ReleasedPayload = JsonObject & {
  schemaVersion: 1;
  generation: number;
  streamId: string;
  sequence: number;
  throughByteExclusive: number;
  contentDigest: string;
};
type WithheldPayload = JsonObject & {
  schemaVersion: 1;
  generation: number;
  actionDigest: string;
  reasonCode: string;
};
type CompletedPayload = JsonObject & {
  schemaVersion: 1;
  generation: number;
  status: 'completed' | 'denied' | 'abstained' | 'escalated';
  releasedBytes: number;
  outputDigest: string;
};
type FailedPayload = JsonObject & {
  schemaVersion: 1;
  generation: number;
  reasonCode: string;
};

export type ControlledAgentRunEventV1 =
  | (StreamEvent<'control_started', StartedPayload> & {
      payload: StartedPayload;
    })
  | (StreamEvent<'control_output_released', ReleasedPayload> & {
      content: string;
      payload: ReleasedPayload;
    })
  | (StreamEvent<'control_action_withheld', WithheldPayload> & {
      payload: WithheldPayload;
    })
  | (StreamEvent<'control_completed', CompletedPayload> & {
      payload: CompletedPayload;
    })
  | (StreamEvent<'control_failed', FailedPayload> & { payload: FailedPayload });

export function renderControlledAgentRequestV1(
  controlled: ControlledAgentRequestV1,
  resolveEntries: (ids: readonly string[]) => readonly ContextEntryV1[],
): RenderedControlledAgentRequestV1 {
  assertControlledAgentRequest(controlled);
  const allIds = [
    ...controlled.agentDefinition.instructionContextEntryIds,
    ...controlled.contextEntryIds,
  ];
  if (new Set(allIds).size !== allIds.length) throw new Error('state_conflict');
  const resolved = resolveEntries(allIds);
  if (resolved.length !== allIds.length)
    throw new Error('context_zone_invalid');
  const byId = new Map(resolved.map((entry) => [entry.contextEntryId, entry]));
  const instructionEntries =
    controlled.agentDefinition.instructionContextEntryIds.map((id) =>
      requireEntry(byId, id, controlled),
    );
  if (
    instructionEntries.some(
      (entry) => !['policy', 'objective', 'local_trusted'].includes(entry.zone),
    )
  ) {
    throw new Error('context_promotion_denied');
  }
  const dataEntries = controlled.contextEntryIds.map((id) =>
    requireEntry(byId, id, controlled),
  );
  if (
    dataEntries.some((entry) =>
      ['policy', 'objective', 'local_trusted'].includes(entry.zone),
    )
  ) {
    throw new Error('context_zone_invalid');
  }
  const trustedContext = tiered(instructionEntries, [
    'policy',
    'objective',
    'local_trusted',
  ]).map((entry) => ({
    contextEntryId: entry.contextEntryId,
    zone: entry.zone,
    sourceId: entry.sourceId,
    sourceVersion: entry.sourceVersion,
    contentDigest: entry.contentDigest,
    content: entry.content,
  }));
  const inputItems: JsonObject[] = [
    {
      schemaVersion: 1,
      kind: 'agentplat.control.input',
      content: controlled.input,
    },
    ...tiered(dataEntries, [
      'user_untrusted',
      'peer_untrusted',
      'tool_untrusted',
      'retrieval_untrusted',
      'provider_untrusted',
      'assessor_untrusted',
    ]).map((entry): JsonObject => ({
      schemaVersion: 1,
      kind: 'agentplat.control.context',
      zone: entry.zone,
      sourceKind: entry.sourceKind,
      sourceId: entry.sourceId,
      sourceVersion: entry.sourceVersion,
      content: entry.content,
      contentDigest: entry.contentDigest,
      provenanceDigest: entry.provenanceDigest,
      createdAtLogicalMs: entry.createdAtLogicalMs,
    })),
  ];
  const definition = controlled.agentDefinition;
  const agent: AgentDefinition = {
    id: definition.agentId,
    tenantId: controlled.tenantId,
    name: definition.name,
    platform: definition.platform,
    ...(definition.description === null
      ? {}
      : { description: definition.description }),
    ...(definition.modelName === null
      ? {}
      : { modelName: definition.modelName }),
    ...(definition.config === null
      ? {}
      : { config: cloneJson(definition.config) as JsonObject }),
    instructions: canonicalizeControlJsonV1({
      schemaVersion: 1,
      trustedContext,
    }),
  };
  const input: AgentRunInput = { input: inputItems, mode: 'invoke' };
  const digestValue = cloneJson({ agent, input });
  if (
    utf8ByteLength(canonicalizeControlJsonV1(digestValue)) > MAX_RENDERED_BYTES
  ) {
    throw new Error('context_limit_exceeded');
  }
  return Object.freeze({
    schemaVersion: 1,
    agent: deepFreeze(agent),
    input: deepFreeze(input),
    providerRequestDigest: digestControlJsonV1('provider-request', digestValue),
    contextEntries: Object.freeze([...instructionEntries, ...dataEntries]),
  });
}

export class ControlledAgentExecutorV1 {
  readonly #options: ControlledAgentExecutorOptionsV1;

  constructor(options: ControlledAgentExecutorOptionsV1) {
    if (options.outputRisk === 'high' && options.mode !== 'buffered')
      throw new Error('release_mode_incompatible');
    assertDigest(
      options.assessor.assessorBindingDigest,
      'assessorBindingDigest',
    );
    this.#options = Object.freeze({
      provider: Object.freeze({
        run: options.provider.run.bind(options.provider),
        ...(options.provider.stream
          ? { stream: options.provider.stream.bind(options.provider) }
          : {}),
      }),
      contextEntries: options.contextEntries,
      assessor: Object.freeze({
        assessorId: options.assessor.assessorId,
        assessorVersion: options.assessor.assessorVersion,
        assessorBindingDigest: options.assessor.assessorBindingDigest,
        assess: options.assessor.assess.bind(options.assessor),
      }),
      controlBoundary: options.controlBoundary,
      mode: options.mode,
      outputRisk: options.outputRisk,
    });
  }

  async run(
    request: ControlledAgentRequestV1,
    context: RuntimeExecutionContext,
  ): Promise<ControlledAgentRunResultV1> {
    const boundary = this.#resolveBoundary(request);
    const rendered = renderControlledAgentRequestV1(
      request,
      this.#options.contextEntries,
    );
    assertContextAllowedByPolicyV1(boundary.policy, rendered.contextEntries);
    await this.#preRun(
      request.runId,
      rendered.providerRequestDigest,
      boundary.policy,
    );
    const result = await this.#options.provider.run(
      rendered.agent,
      rendered.input,
      context,
    );
    const output = result.output ?? null;
    const outputBytes = output === null ? 0 : utf8ByteLength(output);
    if (outputBytes > boundary.policy.limits.maxBufferedOutputBytes)
      throw new Error('release_buffer_exceeded');
    const digest =
      output === null ? null : digestControlJsonV1('assessment-target', output);
    if (output === null)
      return terminalResult(
        request,
        'failed',
        null,
        null,
        0,
        'assessment_indeterminate',
      );
    const assessment = await this.#assess(
      {
        runId: request.runId,
        checkpoint: 'post_run',
        targetDigest: digest!,
        content: output,
        sequence: null,
      },
      boundary.policy,
    );
    if (
      assessment.disposition !== 'allow' &&
      this.#options.mode !== 'observe'
    ) {
      return terminalResult(
        request,
        terminalDisposition(assessment.disposition),
        null,
        digest,
        0,
        assessment.reasonCode,
      );
    }
    return terminalResult(
      request,
      'completed',
      output,
      digest,
      outputBytes,
      null,
    );
  }

  async *stream(
    request: ControlledAgentRequestV1,
    context: RuntimeExecutionContext,
  ): AsyncIterable<ControlledAgentRunEventV1> {
    if (!this.#options.provider.stream)
      throw new Error('release_mode_incompatible');
    const boundary = this.#resolveBoundary(request);
    const rendered = renderControlledAgentRequestV1(
      request,
      this.#options.contextEntries,
    );
    assertContextAllowedByPolicyV1(boundary.policy, rendered.contextEntries);
    await this.#preRun(
      request.runId,
      rendered.providerRequestDigest,
      boundary.policy,
    );
    const generation = 1;
    yield {
      type: 'control_started',
      runId: request.runId,
      payload: {
        schemaVersion: 1,
        generation,
        policyId: request.policyId,
        policyVersion: request.policyVersion,
      },
    };
    let streamId = `stream:${request.runId}`;
    let sequence = 0;
    let releasedBytes = 0;
    let text = '';
    let completedText: string | undefined;
    let providerTerminal = false;
    const pending: Array<{
      content: string;
      sequence: number;
      digest: string;
    }> = [];
    try {
      for await (const event of this.#options.provider.stream(
        rendered.agent,
        rendered.input,
        context,
      )) {
        if (providerTerminal) throw new Error('stream_terminal_invalid');
        if (event.type === 'started') continue;
        if (event.type === 'token') {
          const content = event.content;
          const bytes = utf8ByteLength(content);
          if (
            bytes < 1 ||
            bytes > boundary.policy.limits.maxOutputChunkBytes ||
            sequence >= boundary.policy.limits.maxOutputChunksPerRun
          )
            throw new Error('release_buffer_exceeded');
          text += content;
          if (
            this.#options.mode === 'buffered' &&
            utf8ByteLength(text) > boundary.policy.limits.maxBufferedOutputBytes
          )
            throw new Error('release_buffer_exceeded');
          if (
            this.#options.mode === 'incremental' &&
            bytes > boundary.policy.limits.maxPendingWindowBytes
          )
            throw new Error('release_buffer_exceeded');
          const digest = digestControlJsonV1('assessment-target', content);
          const current = sequence++;
          if (this.#options.mode === 'buffered') {
            pending.push({ content, sequence: current, digest });
          } else {
            const assessment = await this.#assess(
              {
                runId: request.runId,
                checkpoint: 'stream',
                targetDigest: digestControlJsonV1('stream-window', {
                  streamId,
                  sequence: current,
                  contentDigest: digest,
                }),
                content,
                sequence: current,
              },
              boundary.policy,
            );
            if (
              assessment.disposition !== 'allow' &&
              this.#options.mode !== 'observe'
            ) {
              yield completedEvent(
                request.runId,
                generation,
                terminalDisposition(assessment.disposition),
                releasedBytes,
                digest,
              );
              return;
            }
            releasedBytes += bytes;
            yield releasedEvent(
              request.runId,
              generation,
              streamId,
              current,
              releasedBytes,
              content,
              digest,
            );
          }
          continue;
        }
        if (event.type === 'tool_call') {
          const actionDigest = digestControlJsonV1(
            'action',
            cloneJson(event.payload ?? {}),
          );
          yield {
            type: 'control_action_withheld',
            runId: request.runId,
            payload: {
              schemaVersion: 1,
              generation,
              actionDigest,
              reasonCode: 'assessment_required',
            },
          };
          continue;
        }
        if (event.type === 'tool_result') continue;
        if (event.type === 'completed') {
          providerTerminal = true;
          completedText = event.content;
          continue;
        }
        if (event.type === 'failed') {
          providerTerminal = true;
          throw new Error('assessment_indeterminate');
        }
      }
      if (completedText === undefined)
        throw new Error('stream_terminal_missing');
      if (text && completedText !== text)
        throw new Error('stream_content_mismatch');
      const finalText = completedText;
      if (
        utf8ByteLength(finalText) >
        boundary.policy.limits.maxBufferedOutputBytes
      )
        throw new Error('release_buffer_exceeded');
      const outputDigest = digestControlJsonV1('assessment-target', finalText);
      const assessment = await this.#assess(
        {
          runId: request.runId,
          checkpoint: 'post_run',
          targetDigest: outputDigest,
          content: finalText,
          sequence: null,
        },
        boundary.policy,
      );
      if (
        assessment.disposition !== 'allow' &&
        this.#options.mode !== 'observe'
      ) {
        yield completedEvent(
          request.runId,
          generation,
          terminalDisposition(assessment.disposition),
          releasedBytes,
          outputDigest,
        );
        return;
      }
      if (this.#options.mode === 'buffered') {
        for (const chunk of pending) {
          releasedBytes += utf8ByteLength(chunk.content);
          yield releasedEvent(
            request.runId,
            generation,
            streamId,
            chunk.sequence,
            releasedBytes,
            chunk.content,
            chunk.digest,
          );
        }
      } else if (sequence === 0 && finalText) {
        releasedBytes = utf8ByteLength(finalText);
        yield releasedEvent(
          request.runId,
          generation,
          streamId,
          0,
          releasedBytes,
          finalText,
          outputDigest,
        );
      }
      yield completedEvent(
        request.runId,
        generation,
        'completed',
        releasedBytes,
        outputDigest,
      );
    } catch (error) {
      yield {
        type: 'control_failed',
        runId: request.runId,
        payload: {
          schemaVersion: 1,
          generation,
          reasonCode:
            error instanceof Error ? error.message : 'assessment_indeterminate',
        },
      };
    }
  }

  async #preRun(
    runId: string,
    digest: string,
    policy: InferenceControlPolicyV1,
  ): Promise<void> {
    const assessment = await this.#assess(
      {
        runId,
        checkpoint: 'pre_run',
        targetDigest: digest,
        content: null,
        sequence: null,
      },
      policy,
    );
    if (assessment.disposition !== 'allow' && this.#options.mode !== 'observe')
      throw new Error(assessment.reasonCode);
  }

  async #assess(
    request: ControlledAgentAssessmentRequestV1,
    policy: InferenceControlPolicyV1,
  ): Promise<Awaited<ReturnType<ControlledAgentAssessorV1['assess']>>> {
    const binding = policy.assessmentBindings.find(
      (candidate) => candidate.checkpoint === request.checkpoint,
    );
    if (
      !binding ||
      binding.assessorId !== this.#options.assessor.assessorId ||
      binding.assessorVersion !== this.#options.assessor.assessorVersion ||
      binding.assessorBindingDigest !==
        this.#options.assessor.assessorBindingDigest
    )
      throw new Error('assessment_assessor_mismatch');
    const result = await this.#options.assessor.assess(request);
    assertExactKeys(
      result,
      ['disposition', 'reasonCode'],
      'runtime assessment',
    );
    assertOneOf(
      result.disposition,
      ['allow', 'deny', 'abstain', 'escalate'],
      'assessment disposition',
    );
    assertString(result.reasonCode, 'assessment reasonCode');
    return freezeControlValue({ ...result });
  }

  #resolveBoundary(request: ControlledAgentRequestV1) {
    return resolveControlBoundaryV1(this.#options.controlBoundary, {
      policyId: request.policyId,
      policyVersion: request.policyVersion,
      capabilityHandleId: request.capabilityHandleId,
      expectedMode: this.#options.mode,
      expectedOutputRisk: this.#options.outputRisk,
    });
  }
}

export function validateControlledAgentRunEventV1(
  value: unknown,
): asserts value is ControlledAgentRunEventV1 {
  const event = closedRecord(
    value,
    ['type', 'runId', 'content', 'payload'],
    ['type', 'runId', 'payload'],
  );
  if (typeof event.type !== 'string' || typeof event.runId !== 'string')
    throw new TypeError('Invalid controlled event');
  const payload = closedRecord(
    event.payload,
    payloadKeys(event.type),
    payloadKeys(event.type),
  );
  if (payload.schemaVersion !== 1 || !positiveInteger(payload.generation))
    throw new TypeError('Invalid controlled payload');
  if (event.type === 'control_output_released') {
    if (
      typeof event.content !== 'string' ||
      !nonNegativeInteger(payload.sequence) ||
      !positiveInteger(payload.throughByteExclusive) ||
      typeof payload.streamId !== 'string' ||
      typeof payload.contentDigest !== 'string'
    )
      throw new TypeError('Invalid release event');
  } else {
    if ('content' in event)
      throw new TypeError('Unexpected controlled event content');
    if (
      event.type === 'control_started' &&
      (typeof payload.policyId !== 'string' ||
        !positiveInteger(payload.policyVersion))
    )
      throw new TypeError('Invalid controlled start');
    if (
      event.type === 'control_action_withheld' &&
      (typeof payload.actionDigest !== 'string' ||
        typeof payload.reasonCode !== 'string')
    )
      throw new TypeError('Invalid controlled withholding');
    if (
      event.type === 'control_completed' &&
      (!['completed', 'denied', 'abstained', 'escalated'].includes(
        payload.status as string,
      ) ||
        !nonNegativeInteger(payload.releasedBytes) ||
        typeof payload.outputDigest !== 'string')
    )
      throw new TypeError('Invalid controlled completion');
    if (
      event.type === 'control_failed' &&
      typeof payload.reasonCode !== 'string'
    )
      throw new TypeError('Invalid controlled failure');
  }
  if (
    ![
      'control_started',
      'control_output_released',
      'control_action_withheld',
      'control_completed',
      'control_failed',
    ].includes(event.type)
  )
    throw new TypeError('Unknown controlled event type');
}

export interface ControlledAgentSseValidatorV1 {
  validate(envelope: AgentSseEnvelope<ControlledAgentRunEventV1>): void;
  finish(): void;
}

export function createControlledAgentSseValidatorV1(): ControlledAgentSseValidatorV1 {
  let expectedSequence = 1;
  let runId: string | undefined;
  let generation: number | undefined;
  let releasedSequence = -1;
  let releasedBytes = 0;
  let releasedContent = '';
  let started = false;
  let terminal = false;
  return Object.freeze({
    validate(envelope: AgentSseEnvelope<ControlledAgentRunEventV1>) {
      if (terminal) throw new TypeError('Controlled event follows terminal');
      if (envelope.sequence !== expectedSequence++)
        throw new TypeError('Non-contiguous controlled SSE sequence');
      const event = {
        type: envelope.type,
        ...('runId' in envelope ? { runId: envelope.runId } : {}),
        ...('content' in envelope ? { content: envelope.content } : {}),
        ...('payload' in envelope ? { payload: envelope.payload } : {}),
      };
      validateControlledAgentRunEventV1(event);
      const payload = event.payload;
      if (!started) {
        if (event.type !== 'control_started')
          throw new TypeError('Controlled SSE must start with control_started');
        started = true;
      } else if (event.type === 'control_started') {
        throw new TypeError('Duplicate controlled SSE start');
      }
      runId ??= event.runId;
      generation ??= payload.generation as number;
      if (event.runId !== runId || payload.generation !== generation)
        throw new TypeError('Cross-run controlled SSE event');
      if (event.type === 'control_output_released') {
        const released = event.payload;
        if (
          released.sequence !== releasedSequence + 1 ||
          released.throughByteExclusive !==
            releasedBytes + utf8ByteLength(event.content) ||
          released.contentDigest !==
            digestControlJsonV1('assessment-target', event.content)
        )
          throw new TypeError('Invalid controlled release head');
        releasedSequence = released.sequence;
        releasedBytes = released.throughByteExclusive;
        releasedContent += event.content;
      }
      if (event.type === 'control_completed') {
        if (event.payload.releasedBytes !== releasedBytes)
          throw new TypeError('Controlled completion release mismatch');
        if (
          event.payload.status === 'completed' &&
          event.payload.outputDigest !==
            digestControlJsonV1('assessment-target', releasedContent)
        )
          throw new TypeError('Controlled completion digest mismatch');
      }
      terminal =
        event.type === 'control_completed' || event.type === 'control_failed';
    },
    finish() {
      if (!terminal)
        throw new TypeError('Controlled SSE ended without one terminal event');
    },
  });
}

export async function* consumeControlledAgentSseV1(
  readable: ReadableStream<Uint8Array>,
  options: { readonly signal?: AbortSignal } = {},
): AsyncIterable<AgentSseEnvelope<ControlledAgentRunEventV1>> {
  const validator = createControlledAgentSseValidatorV1();
  let complete = false;
  try {
    for await (const envelope of parseAgentSseStream<ControlledAgentRunEventV1>(
      readable,
      {
        signal: options.signal,
        validate: validator.validate,
      },
    )) {
      yield envelope;
    }
    complete = true;
  } finally {
    if (complete) validator.finish();
  }
}

function assertControlledAgentRequest(request: ControlledAgentRequestV1): void {
  if (
    request.schemaVersion !== 1 ||
    request.agentDefinition.schemaVersion !== 1
  )
    throw new TypeError('assessment_invalid');
  if (request.scope !== null) validateControlScopeV1(request.scope);
  if (
    !positiveInteger(request.policyVersion) ||
    request.contextEntryIds.length > 256 ||
    request.agentDefinition.instructionContextEntryIds.length > 64
  )
    throw new TypeError('context_limit_exceeded');
  if (
    utf8ByteLength(request.agentDefinition.name) < 1 ||
    utf8ByteLength(request.agentDefinition.name) > 256
  )
    throw new TypeError('context_limit_exceeded');
  if (
    request.agentDefinition.config &&
    utf8ByteLength(canonicalizeControlJsonV1(request.agentDefinition.config)) >
      MAX_DEFINITION_CONFIG_BYTES
  )
    throw new TypeError('context_limit_exceeded');
}

function requireEntry(
  entries: Map<string, ContextEntryV1>,
  id: string,
  request: ControlledAgentRequestV1,
): ContextEntryV1 {
  const entry = entries.get(id);
  if (
    !entry ||
    entry.runId !== request.runId ||
    entry.tenantId !== request.tenantId
  )
    throw new Error('context_zone_invalid');
  return entry;
}

function tiered(
  entries: readonly ContextEntryV1[],
  zones: readonly string[],
): ContextEntryV1[] {
  return zones.flatMap((zone) =>
    entries.filter((entry) => entry.zone === zone),
  );
}

function terminalResult(
  request: ControlledAgentRequestV1,
  status: ControlledAgentRunResultV1['status'],
  output: string | null,
  digest: string | null,
  releasedBytes: number,
  reason: string | null,
): ControlledAgentRunResultV1 {
  return Object.freeze({
    schemaVersion: 1,
    runId: request.runId,
    tenantId: request.tenantId,
    generation: 1,
    status,
    output,
    outputDigest: digest,
    releasedBytes,
    terminalReasonCode: reason,
    diagnostics: Object.freeze([]),
  });
}

function releasedEvent(
  runId: string,
  generation: number,
  streamId: string,
  sequence: number,
  throughByteExclusive: number,
  content: string,
  contentDigest: string,
): ControlledAgentRunEventV1 {
  return {
    type: 'control_output_released',
    runId,
    content,
    payload: {
      schemaVersion: 1,
      generation,
      streamId,
      sequence,
      throughByteExclusive,
      contentDigest,
    },
  };
}

function completedEvent(
  runId: string,
  generation: number,
  status: CompletedPayload['status'],
  releasedBytes: number,
  outputDigest: string,
): ControlledAgentRunEventV1 {
  return {
    type: 'control_completed',
    runId,
    payload: {
      schemaVersion: 1,
      generation,
      status,
      releasedBytes,
      outputDigest,
    },
  };
}

function payloadKeys(type: string): string[] {
  switch (type) {
    case 'control_started':
      return ['schemaVersion', 'generation', 'policyId', 'policyVersion'];
    case 'control_output_released':
      return [
        'schemaVersion',
        'generation',
        'streamId',
        'sequence',
        'throughByteExclusive',
        'contentDigest',
      ];
    case 'control_action_withheld':
      return ['schemaVersion', 'generation', 'actionDigest', 'reasonCode'];
    case 'control_completed':
      return [
        'schemaVersion',
        'generation',
        'status',
        'releasedBytes',
        'outputDigest',
      ];
    case 'control_failed':
      return ['schemaVersion', 'generation', 'reasonCode'];
    default:
      throw new TypeError('Unknown controlled event type');
  }
}

function closedRecord(
  value: unknown,
  allowed: readonly string[],
  required: readonly string[],
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    throw new TypeError('Expected closed object');
  const keys = Object.keys(value);
  if (
    keys.some((key) => !allowed.includes(key)) ||
    required.some((key) => !Object.hasOwn(value, key))
  )
    throw new TypeError('Unexpected or missing object field');
  return value as Record<string, unknown>;
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}
function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
function cloneJson<T>(value: T): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
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
  disposition: 'allow' | 'deny' | 'abstain' | 'escalate',
): Exclude<CompletedPayload['status'], 'completed'> {
  if (disposition === 'deny' || disposition === 'allow') return 'denied';
  return disposition === 'abstain' ? 'abstained' : 'escalated';
}

export type { AgentStreamEvent };
