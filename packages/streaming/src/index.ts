import type { JsonObject } from '@agentplat/core';
import type { AgentStreamEvent, StreamEvent } from '@agentplat/runtime';

/** Stable version of the public SSE JSON envelope. */
export const AGENTPLAT_SSE_VERSION = 1 as const;

/**
 * JSON body carried in each AgentPlat SSE event.
 *
 * Passing a discriminated event union preserves its event-specific payload
 * types on both the server and browser sides.
 */
export type AgentSseEnvelope<TEvent extends StreamEvent = AgentStreamEvent> =
  TEvent extends StreamEvent
    ? {
        version: typeof AGENTPLAT_SSE_VERSION;
        sequence: number;
        type: TEvent['type'];
      } & Pick<TEvent, Extract<keyof TEvent, 'runId' | 'content' | 'payload'>>
    : never;

/** Shared behavior for Web and Node SSE helpers. */
export interface AgentSseOptions {
  signal?: AbortSignal;
  retryMs?: number;
  headers?: HeadersInit;
  /** Defaults to false so unexpected adapter details are not sent to clients. */
  exposeErrors?: boolean;
}

/** Browser-side parsing and validation behavior. */
export interface ParseAgentSseOptions<TEvent extends StreamEvent> {
  signal?: AbortSignal;
  /** Defaults to true and requires contiguous sequence numbers starting at 1. */
  strictSequence?: boolean;
  /** Optional event-specific runtime validation after envelope validation. */
  validate?: (envelope: AgentSseEnvelope<TEvent>) => void;
}

/** Minimal Node/Express response surface used without a framework dependency. */
export interface NodeSseResponse {
  setHeader(name: string, value: string): void;
  write(chunk: string): boolean;
  end(): void;
  flushHeaders?(): void;
  once?(event: 'drain', listener: () => void): unknown;
}

/** Encode one normalized runtime or orchestration event as a versioned frame. */
export function encodeSseEvent<TEvent extends StreamEvent>(
  event: TEvent,
  sequence: number
): string {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new TypeError('SSE sequence must be a positive integer');
  }
  const envelope: AgentSseEnvelope<TEvent> = {
    version: AGENTPLAT_SSE_VERSION,
    sequence,
    type: event.type,
    ...(event.runId ? { runId: event.runId } : {}),
    ...(event.content !== undefined ? { content: event.content } : {}),
    ...(event.payload ? { payload: event.payload } : {}),
  } as AgentSseEnvelope<TEvent>;
  const id = `${event.runId ?? 'stream'}:${sequence}`;
  return `id: ${id}\nevent: agentplat.${event.type}\ndata: ${JSON.stringify(envelope)}\n\n`;
}

/** Convert events to a Fetch-compatible streaming SSE response. */
export function toSseResponse<TEvent extends StreamEvent>(
  events: AsyncIterable<TEvent>,
  options: AgentSseOptions = {}
): Response {
  const iterator = events[Symbol.asyncIterator]();
  const encoder = new TextEncoder();
  let sequence = 0;
  let closed = false;
  let lastType: string | undefined;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      if (options.retryMs !== undefined) {
        controller.enqueue(encoder.encode(retryFrame(options.retryMs)));
      }
    },
    async pull(controller) {
      if (closed) return;
      if (options.signal?.aborted) {
        closed = true;
        await iterator.return?.();
        controller.close();
        return;
      }
      try {
        const next = await iterator.next();
        if (closed) return;
        if (options.signal?.aborted) {
          closed = true;
          await iterator.return?.();
          controller.close();
          return;
        }
        if (next.done) {
          closed = true;
          controller.close();
          return;
        }
        lastType = next.value.type;
        controller.enqueue(
          encoder.encode(encodeSseEvent(next.value, ++sequence))
        );
      } catch (error) {
        if (!closed && !options.signal?.aborted && !isFailureType(lastType)) {
          controller.enqueue(
            encoder.encode(
              encodeSseEvent(
                errorEvent(error, options.exposeErrors),
                ++sequence
              )
            )
          );
        }
        closed = true;
        controller.close();
      }
    },
    async cancel() {
      closed = true;
      await iterator.return?.();
    },
  });

  return new Response(body, {
    headers: sseHeaders(options.headers),
  });
}

/** Alias with the spelling commonly used in web framework examples. */
export const streamToSSE = toSseResponse;

/**
 * Next.js App Router helper that shares `request.signal` with event creation
 * and SSE transport cancellation, making model abort propagation explicit.
 */
export function toNextSseResponse<TEvent extends StreamEvent>(
  request: Request,
  createEvents: (signal: AbortSignal) => AsyncIterable<TEvent>,
  options: Omit<AgentSseOptions, 'signal'> = {}
): Response {
  return toSseResponse(createEvents(request.signal), {
    ...options,
    signal: request.signal,
  });
}

/** Pipe events to an Express-compatible Node response. */
export async function pipeSse<TEvent extends StreamEvent>(
  events: AsyncIterable<TEvent>,
  response: NodeSseResponse,
  options: AgentSseOptions = {}
): Promise<void> {
  for (const [name, value] of sseHeaders(options.headers)) {
    response.setHeader(name, value);
  }
  response.flushHeaders?.();
  if (options.retryMs !== undefined) {
    await write(response, retryFrame(options.retryMs));
  }

  let sequence = 0;
  let lastType: string | undefined;
  try {
    for await (const event of events) {
      if (options.signal?.aborted) break;
      lastType = event.type;
      await write(response, encodeSseEvent(event, ++sequence));
    }
  } catch (error) {
    if (!options.signal?.aborted && !isFailureType(lastType)) {
      await write(
        response,
        encodeSseEvent(errorEvent(error, options.exposeErrors), ++sequence)
      );
    }
  } finally {
    response.end();
  }
}

/** Alias with the spelling commonly used in Express examples. */
export const pipeSSE = pipeSse;

/**
 * Parse a Fetch response body into validated, typed AgentPlat SSE envelopes.
 * Frames split across arbitrary network chunks and multi-line data fields are
 * handled without framework-specific browser code.
 */
export async function* parseAgentSseStream<
  TEvent extends StreamEvent = AgentStreamEvent,
>(
  readable: ReadableStream<Uint8Array>,
  options: ParseAgentSseOptions<TEvent> = {}
): AsyncIterable<AgentSseEnvelope<TEvent>> {
  const reader = readable.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let expectedSequence = 1;
  const onAbort = () => {
    void reader.cancel(options.signal?.reason);
  };
  options.signal?.addEventListener('abort', onAbort, { once: true });

  try {
    if (options.signal?.aborted) {
      await reader.cancel(options.signal.reason);
      return;
    }
    while (true) {
      if (options.signal?.aborted) return;
      const { done, value } = await reader.read();
      if (options.signal?.aborted) return;
      if (done) {
        buffer += decoder.decode();
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      let extracted = extractFrame(buffer);
      while (extracted) {
        buffer = extracted.rest;
        const envelope = parseFrame<TEvent>(extracted.frame);
        if (envelope) {
          expectedSequence = validateSequence(
            envelope.sequence,
            expectedSequence,
            options.strictSequence ?? true
          );
          options.validate?.(envelope);
          yield envelope;
        }
        extracted = extractFrame(buffer);
      }
    }
    if (buffer.trim()) {
      const envelope = parseFrame<TEvent>(buffer);
      if (envelope) {
        validateSequence(
          envelope.sequence,
          expectedSequence,
          options.strictSequence ?? true
        );
        options.validate?.(envelope);
        yield envelope;
      }
    }
  } finally {
    options.signal?.removeEventListener('abort', onAbort);
    reader.releaseLock();
  }
}

function parseFrame<TEvent extends StreamEvent>(
  frame: string
): AgentSseEnvelope<TEvent> | undefined {
  const data = frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).replace(/^ /, ''));
  if (data.length === 0) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(data.join('\n'));
  } catch {
    throw new TypeError('Invalid JSON in AgentPlat SSE data');
  }
  if (!isObject(parsed)) {
    throw new TypeError('AgentPlat SSE data must be an object');
  }
  if (parsed.version !== AGENTPLAT_SSE_VERSION) {
    throw new TypeError(`Unsupported AgentPlat SSE version: ${parsed.version}`);
  }
  if (!Number.isInteger(parsed.sequence) || Number(parsed.sequence) < 1) {
    throw new TypeError('AgentPlat SSE sequence must be a positive integer');
  }
  if (typeof parsed.type !== 'string' || !parsed.type) {
    throw new TypeError('AgentPlat SSE event type is required');
  }
  if (parsed.runId !== undefined && typeof parsed.runId !== 'string') {
    throw new TypeError('AgentPlat SSE runId must be a string');
  }
  if (parsed.content !== undefined && typeof parsed.content !== 'string') {
    throw new TypeError('AgentPlat SSE content must be a string');
  }
  if (parsed.payload !== undefined && !isObject(parsed.payload)) {
    throw new TypeError('AgentPlat SSE payload must be an object');
  }
  return parsed as AgentSseEnvelope<TEvent>;
}

function extractFrame(
  buffer: string
): { frame: string; rest: string } | undefined {
  const boundary = /\r?\n\r?\n/.exec(buffer);
  if (!boundary || boundary.index === undefined) return undefined;
  return {
    frame: buffer.slice(0, boundary.index),
    rest: buffer.slice(boundary.index + boundary[0].length),
  };
}

function validateSequence(
  sequence: number,
  expected: number,
  strict: boolean
): number {
  if (strict && sequence !== expected) {
    throw new TypeError(
      `Unexpected AgentPlat SSE sequence ${sequence}; expected ${expected}`
    );
  }
  return sequence + 1;
}

function sseHeaders(additional: HeadersInit | undefined): Headers {
  const headers = new Headers(additional);
  headers.set('Content-Type', 'text/event-stream; charset=utf-8');
  headers.set('Cache-Control', 'no-cache, no-transform');
  headers.set('Connection', 'keep-alive');
  headers.set('X-Accel-Buffering', 'no');
  return headers;
}

function retryFrame(retryMs: number): string {
  if (!Number.isInteger(retryMs) || retryMs < 0) {
    throw new TypeError('retryMs must be a non-negative integer');
  }
  return `retry: ${retryMs}\n\n`;
}

function errorEvent(error: unknown, exposeErrors = false): AgentStreamEvent {
  return {
    type: 'failed',
    content:
      exposeErrors && error instanceof Error ? error.message : 'Stream failed',
  };
}

function isFailureType(type: string | undefined): boolean {
  return type === 'failed' || type?.endsWith('_failed') === true;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function write(response: NodeSseResponse, chunk: string): Promise<void> {
  if (response.write(chunk) || !response.once) return;
  await new Promise<void>((resolve) => response.once?.('drain', resolve));
}
