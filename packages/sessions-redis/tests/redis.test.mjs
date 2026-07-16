import assert from 'node:assert/strict';
import test from 'node:test';
import { createRedisSessionRegistry } from '../dist/index.js';

function redisFixture() {
  const values = new Map();
  const listeners = new Map();
  const command = {
    async get(key) {
      return values.get(key) ?? null;
    },
    async set(key, value, options) {
      if (options.NX && values.has(key)) return null;
      if (options.XX && !values.has(key)) return null;
      values.set(key, value);
      return 'OK';
    },
    async del(key) {
      return values.delete(key) ? 1 : 0;
    },
    async publish(channel, message) {
      const channelListeners = listeners.get(channel) ?? [];
      for (const listener of channelListeners) listener(message, channel);
      return channelListeners.length;
    },
    async eval(_script, { keys, arguments: args }) {
      if (values.get(keys[0]) !== args[0]) return 0;
      values.delete(keys[0]);
      return 1;
    },
  };
  const subscriber = {
    async subscribe(channel, listener) {
      listeners.set(channel, [...(listeners.get(channel) ?? []), listener]);
    },
    async unsubscribe(channel) {
      listeners.delete(channel);
    },
  };
  return { command, subscriber, values };
}

test('routes a stop to the owner without storing AbortController in Redis', async () => {
  const redis = redisFixture();
  const owner = await createRedisSessionRegistry({
    ...redis,
    prefix: 'agentplat:test',
    instanceId: 'task-a',
  });
  const remote = await createRedisSessionRegistry({
    ...redis,
    prefix: 'agentplat:test',
    instanceId: 'task-b',
  });

  const handle = await owner.create('session-a');
  assert.deepEqual([...redis.values.values()], ['task-a']);
  assert.equal(await remote.stop('session-a', 'operator_stop'), true);
  assert.equal(handle.stopSignal.aborted, true);
  assert.equal(handle.stopSignal.reason, 'operator_stop');

  await owner.release('session-a');
  assert.equal(await remote.stop('session-a'), false);
  await Promise.all([owner.close(), remote.close()]);
});
