import assert from 'node:assert/strict';
import test from 'node:test';
import { AsanaWorkManagementProvider } from '../dist/index.js';

test('Asana provider stores stable external contribution identity', async () => {
  const requests = [];
  let taskCreated = false;
  const provider = new AsanaWorkManagementProvider({
    projectGid: 'project-1',
    accessToken: async () => 'oauth-token',
    fetch: async (url, init) => {
      requests.push({ url, init });
      if (init.method === 'GET' && !taskCreated)
        return new Response('', { status: 404 });
      if (init.method === 'POST') taskCreated = true;
      return new Response(
        JSON.stringify({
          data: {
            gid: 'task-1',
            permalink_url: 'https://app.asana.com/0/task-1',
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    },
  });
  assert.equal(
    await provider.lookupContributionTask({ idempotencyKey: 'stable-key' }),
    null
  );
  const created = await provider.createContributionTask({
    idempotencyKey: 'stable-key',
    contribution: {
      tenantId: 'tenant-1',
      roomId: 'room-1',
      contributionId: 'contribution-1',
      revision: 0,
      instruction: 'Review the brief.',
      expectedOutput: 'A decision',
    },
  });
  assert.equal(created.externalId, 'task-1');
  const body = JSON.parse(requests[1].init.body);
  assert.equal(body.data.external.gid, 'stable-key');
  assert.deepEqual(body.data.projects, ['project-1']);
  assert.equal(requests[1].init.headers.authorization, 'Bearer oauth-token');

  const found = await provider.lookupContributionTask({
    idempotencyKey: 'stable-key',
  });
  assert.equal(found.externalId, 'task-1');
  await provider.updateContributionTask({
    externalId: found.externalId,
    idempotencyKey: 'stable-key',
    contribution: {
      tenantId: 'tenant-1',
      roomId: 'room-1',
      contributionId: 'contribution-1',
      revision: 1,
      instruction: 'Review the revised brief.',
      expectedOutput: 'A revised decision',
    },
  });
  assert.equal(requests[3].init.method, 'PUT');
  assert.match(requests[3].url, /\/tasks\/task-1$/u);
  const updateBody = JSON.parse(requests[3].init.body);
  assert.equal(updateBody.data.external.gid, 'stable-key');
  assert.equal(JSON.parse(updateBody.data.external.data).revision, 1);
});

test('Asana provider errors expose neither OAuth credentials nor response bodies', async () => {
  const provider = new AsanaWorkManagementProvider({
    projectGid: 'project-1',
    accessToken: async () => 'secret-oauth-token',
    fetch: async () =>
      new Response('{"error":"sensitive remote detail"}', { status: 403 }),
  });
  await assert.rejects(
    provider.lookupContributionTask({ idempotencyKey: 'stable-key' }),
    (error) => {
      assert.equal(error.message, 'Asana API request failed (403)');
      assert.doesNotMatch(error.message, /secret|sensitive/u);
      return true;
    }
  );
});

test('Asana provider normalizes long trailing-slash input in linear time', async () => {
  let requestedUrl;
  const provider = new AsanaWorkManagementProvider({
    projectGid: 'project-1',
    accessToken: async () => 'oauth-token',
    baseUrl: `https://asana.example.test/api${'/'.repeat(100_000)}`,
    fetch: async (url) => {
      requestedUrl = url;
      return new Response('', { status: 404 });
    },
  });
  assert.equal(
    await provider.lookupContributionTask({ idempotencyKey: 'stable-key' }),
    null
  );
  assert.match(requestedUrl, /^https:\/\/asana\.example\.test\/api\/tasks/u);
});
