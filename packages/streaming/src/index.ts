import type { JsonObject } from '@agentplat/core';
import type { AgentStreamEvent } from '@agentplat/runtime';

/** Stable version of the public SSE JSON envelope. */
export const AGENTPLAT_SSE_VERSION = 1 as const;

/** JSON body carried in each AgentPlat SSE event. */
export interface AgentSseEnvelope {
  version: typeof AGENTPLAT_SSE_VERSION;
  sequence: number;
  type: AgentStreamEvent['type'];
  runId?: string;
  content?: string;
  payload?: JsonObject;
}

/** Shared behavior for Web and Node SSE helpers. */
export interface AgentSseOptions {
  signal?: AbortSignal;
  retryMs?: number;
  headers?: HeadersInit;
  /** Defaults to false so unexpected adapter details are not sent to clients. */
  exposeErrors?: boolean;
}

/** Minimal Node/Express response surface used without a framework dependency. */
export interface NodeSseResponse {
  setHeader(name: string, value: string): void;
  write(chunk: string): boolean;
  end(): void;
  flushHeaders?(): void;
  once?(event: 'drain', listener: () => void): unknown;
}

/** Encode one normalized runtime event as a versioned SSE frame. */
export function encodeSseEvent(
  event: AgentStreamEvent,
  sequence: number
): string {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new TypeError('SSE sequence must be a positive integer');
  }
  const envelope: AgentSseEnvelope = {
    version: AGENTPLAT_SSE_VERSION,
    sequence,
    type: event.type,
    ...(event.runId ? { runId: event.runId } : {}),
    ...(event.content !== undefined ? { content: event.content } : {}),
    ...(event.payload ? { payload: event.payload } : {}),
  };
  const id = `${event.runId ?? 'stream'}:${sequence}`;
  return `id: ${id}\nevent: agentplat.${event.type}\ndata: ${JSON.stringify(envelope)}\n\n`;
}

/** Convert runtime events to a Fetch-compatible streaming SSE response. */
export function toSseResponse(
  events: AsyncIterable<AgentStreamEvent>,
  options: AgentSseOptions = {}
): Response {
  const iterator = events[Symbol.asyncIterator]();
  const encoder = new TextEncoder();
  let sequence = 0;
  let closed = false;
  let lastType: AgentStreamEvent['type'] | undefined;
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
        if (!closed && !options.signal?.aborted && lastType !== 'failed') {
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

/** Pipe runtime events to an Express-compatible Node response. */
export async function pipeSse(
  events: AsyncIterable<AgentStreamEvent>,
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
  let lastType: AgentStreamEvent['type'] | undefined;
  try {
    for await (const event of events) {
      if (options.signal?.aborted) break;
      lastType = event.type;
      await write(response, encodeSseEvent(event, ++sequence));
    }
  } catch (error) {
    if (!options.signal?.aborted && lastType !== 'failed') {
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

async function write(response: NodeSseResponse, chunk: string): Promise<void> {
  if (response.write(chunk) || !response.once) return;
  await new Promise<void>((resolve) => response.once?.('drain', resolve));
}
