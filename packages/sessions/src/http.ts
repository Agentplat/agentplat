import type { AgentPlatID } from '@agentplat/core';
import { toNextSseResponse } from '@agentplat/streaming';
import type { StreamEvent } from '@agentplat/runtime';

/** A live session control record owned by an application transport. */
export interface SessionHandle {
  sessionId: AgentPlatID;
  stopSignal: AbortSignal;
  stop(reason?: string): boolean;
}

/** Replaceable store for live session stop controls (in-memory, Redis, etc.). */
export interface SessionRegistry {
  create(sessionId?: AgentPlatID): SessionHandle;
  get(sessionId: AgentPlatID): SessionHandle | undefined;
  stop(sessionId: AgentPlatID, reason?: string): boolean;
  release(sessionId: AgentPlatID): void;
}

/** Options for the local in-memory session registry. */
export interface SessionRegistryOptions {
  idGenerator?: () => AgentPlatID;
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
  return {
    create(sessionId = idGenerator()) {
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
      };
      handles.set(sessionId, handle);
      return handle;
    },
    get(sessionId) {
      return handles.get(sessionId);
    },
    stop(sessionId, reason) {
      return handles.get(sessionId)?.stop(reason) ?? false;
    },
    release(sessionId) {
      handles.delete(sessionId);
    },
  };
}

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
export function toRegisteredSessionSseResponse<TEvent extends StreamEvent>(
  request: Request,
  registry: SessionRegistry,
  events: (input: RegisteredSessionInput) => AsyncIterable<TEvent>,
  sessionId?: AgentPlatID
): Response {
  const handle = registry.create(sessionId);
  return toNextSseResponse(request, async function* (signal) {
    try {
      yield* events({
        sessionId: handle.sessionId,
        signal,
        stopSignal: handle.stopSignal,
      });
    } finally {
      registry.release(handle.sessionId);
    }
  });
}

/**
 * Minimal Fetch handler for `POST /sessions/:sessionId/stop`.
 *
 * Authenticate and authorize before invoking this helper in an application.
 */
export function handleSessionStop(
  request: Request,
  registry: SessionRegistry,
  sessionId: AgentPlatID
): Response {
  if (request.method.toUpperCase() !== 'POST') {
    return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  }
  const stopped = registry.stop(sessionId, 'stopped_by_client');
  return Response.json({ sessionId, stopped }, { status: stopped ? 202 : 404 });
}
