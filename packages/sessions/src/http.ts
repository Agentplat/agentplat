import type { AgentPlatID } from '@agentplat/core';
import { toNextSseResponse } from '@agentplat/streaming';
import type { StreamEvent } from '@agentplat/runtime';

/** A live session control record owned by an application transport. */
export interface SessionHandle {
  sessionId: AgentPlatID;
  stopSignal: AbortSignal;
  stop(reason?: string): boolean;
  /** Timestamp used by local registries to reap abandoned controls. */
  expiresAt?: number;
}

export type SessionRegistryResult<T> = T | Promise<T>;

/** Replaceable store for live session stop controls (in-memory, Redis, etc.). */
export interface SessionRegistry {
  create(sessionId?: AgentPlatID): SessionRegistryResult<SessionHandle>;
  get(sessionId: AgentPlatID): SessionRegistryResult<SessionHandle | undefined>;
  stop(sessionId: AgentPlatID, reason?: string): SessionRegistryResult<boolean>;
  release(sessionId: AgentPlatID): SessionRegistryResult<void>;
  /** Remove expired local controls and return the number removed. */
  reap(): SessionRegistryResult<number>;
  /** Release adapter-owned subscriptions or timers without closing app-owned clients. */
  close?(): SessionRegistryResult<void>;
}

/** Options for the local in-memory session registry. */
export interface SessionRegistryOptions {
  idGenerator?: () => AgentPlatID;
  /** Idle lifetime for a local handle. Defaults to 30 minutes. */
  ttlMs?: number;
  clock?: () => number;
}

/**
 * In-memory registry for local and single-process deployments.
 *
 * Multi-instance deployments should implement `SessionRegistry` with their
 * own shared control channel; never expose the stop endpoint without auth.
 */
export function createSessionRegistry(
  options: SessionRegistryOptions = {}
): SessionRegistry {
  const handles = new Map<AgentPlatID, SessionHandle>();
  const idGenerator =
    options.idGenerator ?? (() => globalThis.crypto.randomUUID());
  const ttlMs = positiveTtl(options.ttlMs ?? 30 * 60 * 1_000);
  const clock = options.clock ?? Date.now;
  const reap = () => {
    const now = clock();
    let removed = 0;
    for (const [sessionId, handle] of handles) {
      if (handle.expiresAt !== undefined && handle.expiresAt <= now) {
        handles.delete(sessionId);
        removed += 1;
      }
    }
    return removed;
  };
  return {
    create(sessionId = idGenerator()) {
      reap();
      const existing = handles.get(sessionId);
      if (existing) return existing;
      const controller = new AbortController();
      const handle: SessionHandle = {
        sessionId,
        stopSignal: controller.signal,
        stop(reason) {
          if (controller.signal.aborted) return false;
          controller.abort(reason);
          return true;
        },
        expiresAt: clock() + ttlMs,
      };
      handles.set(sessionId, handle);
      return handle;
    },
    get(sessionId) {
      reap();
      return handles.get(sessionId);
    },
    stop(sessionId, reason) {
      reap();
      return handles.get(sessionId)?.stop(reason) ?? false;
    },
    release(sessionId) {
      handles.delete(sessionId);
    },
    reap,
  };
}

/** Explicit alias for deployments that want local/TTL semantics called out in code. */
export const createMemorySessionRegistry = createSessionRegistry;

/** Inputs passed to a registered session SSE event factory. */
export interface RegisteredSessionInput {
  sessionId: AgentPlatID;
  signal: AbortSignal;
  stopSignal: AbortSignal;
}

/**
 * Create a Next App Router-compatible SSE response with a registered,
 * server-owned cooperative stop control. The registry entry is removed when
 * the stream finishes or the client disconnects.
 */
export async function toRegisteredSessionSseResponse<
  TEvent extends StreamEvent,
>(
  request: Request,
  registry: SessionRegistry,
  events: (input: RegisteredSessionInput) => AsyncIterable<TEvent>,
  sessionId?: AgentPlatID
): Promise<Response> {
  const handle = await registry.create(sessionId);
  return toNextSseResponse(request, async function* (signal) {
    try {
      yield* events({
        sessionId: handle.sessionId,
        signal,
        stopSignal: handle.stopSignal,
      });
    } finally {
      await registry.release(handle.sessionId);
    }
  });
}

/**
 * Minimal Fetch handler for `POST /sessions/:sessionId/stop`.
 *
 * Authorize through `options.authorize` before a cooperative stop is applied.
 */
export interface SessionStopOptions {
  /** Return false for 403, or return a custom Response such as 401/404. */
  authorize?: (
    request: Request,
    sessionId: AgentPlatID
  ) => boolean | Response | Promise<boolean | Response>;
}

export async function handleSessionStop(
  request: Request,
  registry: SessionRegistry,
  sessionId: AgentPlatID,
  options: SessionStopOptions = {}
): Promise<Response> {
  if (request.method.toUpperCase() !== 'POST') {
    return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  }
  if (options.authorize) {
    const authorization = await options.authorize(request, sessionId);
    if (authorization instanceof Response) return authorization;
    if (!authorization) {
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }
  }
  const stopped = await registry.stop(sessionId, 'stopped_by_client');
  return Response.json({ sessionId, stopped }, { status: stopped ? 202 : 404 });
}

function positiveTtl(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError('ttlMs must be a positive finite number');
  }
  return value;
}
