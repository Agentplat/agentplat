import type { AgentPlatID } from '@agentplat/core';
import type { SessionHandle, SessionRegistry } from '@agentplat/sessions/http';

/** Minimal node-redis-compatible command surface used by the adapter. */
export interface RedisSessionCommandClient {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    options: { PX: number; NX?: boolean; XX?: boolean }
  ): Promise<string | null>;
  del(key: string): Promise<number>;
  publish(channel: string, message: string): Promise<number>;
  eval(
    script: string,
    options: { keys: string[]; arguments: string[] }
  ): Promise<unknown>;
}

/** Use a duplicated Redis connection for subscriptions. */
export interface RedisSessionSubscriberClient {
  subscribe(
    channel: string,
    listener: (message: string, channel: string) => void
  ): Promise<unknown>;
  unsubscribe(channel: string): Promise<unknown>;
}

export interface RedisSessionRegistryOptions {
  command: RedisSessionCommandClient;
  subscriber: RedisSessionSubscriberClient;
  /** Unique application namespace. Never share a prefix across trust boundaries. */
  prefix: string;
  instanceId?: string;
  idGenerator?: () => AgentPlatID;
  /** Ownership TTL. Defaults to 30 minutes and is renewed while locally active. */
  ttlMs?: number;
  clock?: () => number;
  onError?: (error: unknown) => void;
}

interface LocalHandle {
  handle: SessionHandle;
  controller: AbortController;
  heartbeat?: ReturnType<typeof setInterval>;
}

interface StopCommand {
  version: 1;
  sessionId: string;
  reason?: string;
}

const releaseOwnedKey = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

/**
 * Create a distributed registry whose Redis values contain only owner IDs.
 * AbortController and AbortSignal remain process-local; stop commands cross
 * instances as small pub/sub messages addressed to the owning process.
 */
export async function createRedisSessionRegistry(
  options: RedisSessionRegistryOptions
): Promise<SessionRegistry> {
  const prefix = normalizePrefix(options.prefix);
  const instanceId = options.instanceId ?? globalThis.crypto.randomUUID();
  const idGenerator =
    options.idGenerator ?? (() => globalThis.crypto.randomUUID());
  const ttlMs = positiveTtl(options.ttlMs ?? 30 * 60 * 1_000);
  const clock = options.clock ?? Date.now;
  const onError = options.onError ?? (() => undefined);
  const handles = new Map<AgentPlatID, LocalHandle>();
  const instanceChannel = channelKey(prefix, instanceId);
  let closed = false;

  const renew = async (sessionId: AgentPlatID): Promise<boolean> => {
    const local = handles.get(sessionId);
    if (!local || closed) return false;
    const result = await options.command.set(
      ownerKey(prefix, sessionId),
      instanceId,
      { PX: ttlMs, XX: true }
    );
    if (result === null) {
      local.controller.abort('session_registry_ownership_lost');
      return false;
    }
    local.handle.expiresAt = clock() + ttlMs;
    return true;
  };

  const release = async (sessionId: AgentPlatID): Promise<void> => {
    const local = handles.get(sessionId);
    if (local) {
      if (local.heartbeat) clearInterval(local.heartbeat);
      handles.delete(sessionId);
    }
    await options.command
      .eval(releaseOwnedKey, {
        keys: [ownerKey(prefix, sessionId)],
        arguments: [instanceId],
      })
      .catch(onError);
  };

  const listener = (message: string): void => {
    try {
      const command = JSON.parse(message) as Partial<StopCommand>;
      if (command.version !== 1 || typeof command.sessionId !== 'string') {
        return;
      }
      const local = handles.get(command.sessionId);
      if (!local || local.controller.signal.aborted) return;
      local.controller.abort(
        typeof command.reason === 'string' ? command.reason : 'stopped'
      );
    } catch (error) {
      onError(error);
    }
  };

  await options.subscriber.subscribe(instanceChannel, listener);

  const registry: SessionRegistry = {
    async create(sessionId = idGenerator()) {
      if (closed) throw new Error('Redis SessionRegistry is closed');
      await registry.reap();
      const existing = handles.get(sessionId);
      if (existing) return existing.handle;
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
      const local: LocalHandle = { handle, controller };
      handles.set(sessionId, local);
      let claimed: string | null;
      try {
        claimed = await options.command.set(
          ownerKey(prefix, sessionId),
          instanceId,
          { PX: ttlMs, NX: true }
        );
      } catch (error) {
        handles.delete(sessionId);
        throw error;
      }
      if (claimed === null) {
        handles.delete(sessionId);
        throw new Error(`Session "${sessionId}" is already registered`);
      }
      const heartbeat = setInterval(
        () => {
          void renew(sessionId).catch(onError);
        },
        Math.max(1_000, Math.floor(ttlMs / 3))
      );
      heartbeat.unref?.();
      local.heartbeat = heartbeat;
      return handle;
    },
    async get(sessionId) {
      await registry.reap();
      return handles.get(sessionId)?.handle;
    },
    async stop(sessionId, reason) {
      if (closed) return false;
      const local = handles.get(sessionId);
      if (local) return local.handle.stop(reason);
      const owner = await options.command.get(ownerKey(prefix, sessionId));
      if (!owner) return false;
      const command: StopCommand = {
        version: 1,
        sessionId,
        ...(reason ? { reason: reason.slice(0, 512) } : {}),
      };
      return (
        (await options.command.publish(
          channelKey(prefix, owner),
          JSON.stringify(command)
        )) > 0
      );
    },
    release,
    async reap() {
      const now = clock();
      const expired = [...handles.entries()]
        .filter(([, local]) => (local.handle.expiresAt ?? Infinity) <= now)
        .map(([sessionId]) => sessionId);
      await Promise.all(expired.map(release));
      return expired.length;
    },
    async close() {
      if (closed) return;
      closed = true;
      await Promise.all([...handles.keys()].map(release));
      await options.subscriber.unsubscribe(instanceChannel);
    },
  };
  return registry;
}

function ownerKey(prefix: string, sessionId: string): string {
  return `${prefix}:session:${sessionId}:owner`;
}

function channelKey(prefix: string, instanceId: string): string {
  return `${prefix}:instance:${instanceId}:commands`;
}

function normalizePrefix(value: string): string {
  const normalized = value.trim().replace(/:+$/g, '');
  if (!normalized || /\s/.test(normalized)) {
    throw new TypeError('prefix must be non-empty and contain no whitespace');
  }
  return normalized;
}

function positiveTtl(value: number): number {
  if (!Number.isFinite(value) || value < 3_000) {
    throw new RangeError('ttlMs must be a finite number of at least 3000ms');
  }
  return value;
}
