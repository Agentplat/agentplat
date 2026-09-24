import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TypeSafeAssessorV1,
  TypeSafeDecisionClientV1,
} from '../dist/index.js';

function fakeFetch(body, status = 200) {
  const requests = [];
  const fetch = async (url, init) => {
    requests.push({ url, init, body: JSON.parse(init.body) });
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { fetch, requests };
}

const response = {
  model: 'jev-test-version',
  answers: { eligible: { type: 'noul', noul: 0.91 } },
  usage: { input_tokens: 22, output_tokens: 4 },
};

test('decision client submits structured state and returns typed provider metadata', async () => {
  const stub = fakeFetch(response);
  const client = new TypeSafeDecisionClientV1({
    apiKey: 'test-key',
    model: 'jev-pinned-test',
    timeoutMs: 1_000,
    fetch: stub.fetch,
  });
  const result = await client.evaluate({
    state: { artifactVersion: 3, content: 'proposal' },
    questions: { eligible: { type: 'noul', instructions: 'Is it eligible?' } },
  });

  assert.equal(stub.requests.length, 1);
  assert.equal(stub.requests[0].url, 'https://api.typesafe.ai/v1/systemone');
  assert.equal(stub.requests[0].body.model, 'jev-pinned-test');
  assert.deepEqual(stub.requests[0].body.state, { artifactVersion: 3, content: 'proposal' });
  assert.equal(stub.requests[0].init.headers.Authorization, 'Bearer test-key');
  assert.equal(result.model, 'jev-test-version');
  assert.equal(result.answers.eligible.noul, 0.91);
});

test('assessor maps structured answers to the existing assessment port', async () => {
  const stub = fakeFetch(response);
  let evidence;
  const assessor = new TypeSafeAssessorV1({
    assessorId: 'proposal-review',
    assessorVersion: 1,
    assessorBindingDigest: `sha256:${'a'.repeat(64)}`,
    apiKey: 'test-key',
    model: 'jev-pinned-test',
    timeoutMs: 1_000,
    fetch: stub.fetch,
    buildRequest: (request) => ({
      state: { content: request.content, targetDigest: request.targetDigest },
      questions: { eligible: { type: 'noul', instructions: 'Is the output eligible?' } },
    }),
    mapResult: (result) => ({
      disposition: result.answers.eligible.noul >= 0.9 ? 'allow' : 'escalate',
      reasonCode: 'proposal_review_result',
    }),
    evidenceSink: (entry) => { evidence = entry; },
  });

  assert.deepEqual(await assessor.assess({
    runId: 'run:1',
    checkpoint: 'post_run',
    targetDigest: `sha256:${'b'.repeat(64)}`,
    content: 'A bounded proposal.',
    sequence: null,
  }), { disposition: 'allow', reasonCode: 'proposal_review_result' });
  assert.equal(evidence.resolvedModel, 'jev-test-version');
  assert.equal(evidence.inputTokens, 22);
  assert.equal(evidence.targetDigest, `sha256:${'b'.repeat(64)}`);
  assert.equal(evidence.spendReservedUsd, null);
  assert.equal(Object.hasOwn(evidence, 'content'), false);
});

test('evidence sink failures prevent an assessment from being returned', async () => {
  const assessor = new TypeSafeAssessorV1({
    assessorId: 'proposal-review',
    assessorVersion: 1,
    assessorBindingDigest: `sha256:${'a'.repeat(64)}`,
    apiKey: 'test-key',
    model: 'jev-pinned-test',
    timeoutMs: 1_000,
    fetch: fakeFetch(response).fetch,
    buildRequest: () => ({
      state: 'proposal',
      questions: { eligible: { type: 'noul', instructions: 'Is it eligible?' } },
    }),
    mapResult: () => ({ disposition: 'allow', reasonCode: 'proposal_review_result' }),
    evidenceSink: async () => { throw new Error('audit_storage_unavailable'); },
  });
  await assert.rejects(assessor.assess({
    runId: 'run:1',
    checkpoint: 'post_run',
    targetDigest: `sha256:${'b'.repeat(64)}`,
    content: 'proposal',
    sequence: null,
  }), /audit_storage_unavailable/);
});

test('provider failures emit only content-free failure evidence', async () => {
  let evidence;
  const assessor = new TypeSafeAssessorV1({
    assessorId: 'proposal-review',
    assessorVersion: 1,
    assessorBindingDigest: `sha256:${'a'.repeat(64)}`,
    apiKey: 'test-key',
    model: 'jev-pinned-test',
    timeoutMs: 1_000,
    maxSpendUsd: 0.003,
    inputPriceUsdPerMillionTokens: 0.042,
    maxInputTokensPerCall: 64_000,
    fetch: fakeFetch({ error: 'temporary failure with request details' }, 503).fetch,
    buildRequest: (request) => ({
      state: { content: request.content },
      questions: { eligible: { type: 'noul', instructions: 'Is it eligible?' } },
    }),
    mapResult: () => ({ disposition: 'allow', reasonCode: 'eligible' }),
    evidenceSink: (record) => { evidence = record; },
  });

  await assert.rejects(assessor.assess({
    runId: 'run:1',
    checkpoint: 'post_run',
    targetDigest: `sha256:${'b'.repeat(64)}`,
    content: 'private proposal body',
    sequence: null,
  }));
  assert.equal(evidence.status, 'failed');
  assert.equal(evidence.disposition, null);
  assert.equal(evidence.reasonCode, null);
  assert.equal(evidence.spendReservedUsd, 0.002688);
  assert.match(evidence.failureCode, /^(provider_|assessment_)/);
  assert.equal(Object.hasOwn(evidence, 'content'), false);
  assert.doesNotMatch(JSON.stringify(evidence), /private proposal body|temporary failure/);
});

test('provider failures propagate instead of becoming an allow result', async () => {
  const stub = fakeFetch({ error: 'temporarily unavailable' }, 503);
  const client = new TypeSafeDecisionClientV1({
    apiKey: 'test-key',
    model: 'jev-pinned-test',
    timeoutMs: 1_000,
    fetch: stub.fetch,
  });
  await assert.rejects(client.evaluate({
    state: 'bounded input',
    questions: { eligible: { type: 'noul', instructions: 'Is this eligible?' } },
  }));
});

test('invalid application mappings fail closed', async () => {
  const assessor = new TypeSafeAssessorV1({
    assessorId: 'proposal-review',
    assessorVersion: 1,
    assessorBindingDigest: `sha256:${'a'.repeat(64)}`,
    apiKey: 'test-key',
    model: 'jev-pinned-test',
    timeoutMs: 1_000,
    fetch: fakeFetch(response).fetch,
    buildRequest: () => ({
      state: 'proposal',
      questions: { eligible: { type: 'noul', instructions: 'Is it eligible?' } },
    }),
    mapResult: () => ({ disposition: 'allow', reasonCode: '   ' }),
  });

  await assert.rejects(assessor.assess({
    runId: 'run:1',
    checkpoint: 'post_run',
    targetDigest: `sha256:${'b'.repeat(64)}`,
    content: 'proposal',
    sequence: null,
  }), /invalid_typesafe_assessment_mapping/);
});

test('client configuration enforces bounded retries and timeout', () => {
  assert.throws(() => new TypeSafeDecisionClientV1({
    apiKey: 'key', model: 'jev-latest', timeoutMs: 1_000, maxRetries: 3,
  }), /invalid_maxRetries/);
  assert.throws(() => new TypeSafeDecisionClientV1({
    apiKey: 'key', model: 'jev-latest', timeoutMs: 60_001,
  }), /timeoutMs_exceeds_limit/);
  assert.throws(() => new TypeSafeDecisionClientV1({
    apiKey: 'key', model: 'jev-latest', timeoutMs: 1_000, baseURL: 'http://example.test',
  }), /invalid_baseURL/);
  assert.throws(() => new TypeSafeDecisionClientV1({
    apiKey: 'key', model: 'jev-latest', timeoutMs: 1_000, maxSpendUsd: 1,
  }), /incomplete_spend_budget/);
  assert.throws(() => new TypeSafeDecisionClientV1({
    apiKey: 'key', model: 'other-model', timeoutMs: 1_000,
    maxSpendUsd: 1,
    inputPriceUsdPerMillionTokens: 0.042,
    maxInputTokensPerCall: 64_000,
  }), /spend_budget_only_supported_for_jev/);
});

test('assessor requires the canonical AgentPlat SHA-256 binding digest', () => {
  assert.throws(() => new TypeSafeAssessorV1({
    assessorId: 'proposal-review',
    assessorVersion: 1,
    assessorBindingDigest: 'arbitrary-binding',
    apiKey: 'test-key',
    model: 'jev-pinned-test',
    timeoutMs: 1_000,
    buildRequest: () => ({
      state: 'proposal',
      questions: { eligible: { type: 'noul', instructions: 'Is it eligible?' } },
    }),
    mapResult: () => ({ disposition: 'allow', reasonCode: 'eligible' }),
  }), /invalid_assessorBindingDigest/);
});

test('client enforces request and response byte limits', async () => {
  const requestStub = fakeFetch(response);
  const requestLimited = new TypeSafeDecisionClientV1({
    apiKey: 'test-key',
    model: 'jev-pinned-test',
    timeoutMs: 1_000,
    maxRequestBytes: 32,
    fetch: requestStub.fetch,
  });
  await assert.rejects(requestLimited.evaluate({
    state: { content: 'x'.repeat(100) },
    questions: { eligible: { type: 'noul', instructions: 'Is this eligible?' } },
  }), /typesafe_request_exceeds_limit/);
  assert.equal(requestStub.requests.length, 0);

  const responseLimited = new TypeSafeDecisionClientV1({
    apiKey: 'test-key',
    model: 'jev-pinned-test',
    timeoutMs: 1_000,
    maxResponseBytes: 32,
    fetch: fakeFetch(response).fetch,
  });
  await assert.rejects(responseLimited.evaluate({
    state: 'bounded input',
    questions: { eligible: { type: 'noul', instructions: 'Is this eligible?' } },
  }));
});

test('spend cap reserves configured worst-case input and retry cost before a call', async () => {
  const stub = fakeFetch(response);
  const client = new TypeSafeDecisionClientV1({
    apiKey: 'test-key',
    model: 'jev-1.13.0',
    timeoutMs: 1_000,
    maxSpendUsd: 0.003,
    inputPriceUsdPerMillionTokens: 0.042,
    maxInputTokensPerCall: 64_000,
    fetch: stub.fetch,
  });
  const request = {
    state: 'proposal',
    questions: { eligible: { type: 'noul', instructions: 'Is it eligible?' } },
  };

  await client.evaluate(request);
  assert.equal(client.reservedSpendUsd, 0.002688);
  await assert.rejects(client.evaluate(request), /typesafe_spend_limit/);
  assert.equal(stub.requests.length, 1);

  const payloadStub = fakeFetch(response);
  const payloadBound = new TypeSafeDecisionClientV1({
    apiKey: 'test-key',
    model: 'jev-1.13.0',
    timeoutMs: 1_000,
    maxSpendUsd: 0.1,
    inputPriceUsdPerMillionTokens: 0.042,
    maxInputTokensPerCall: 32,
    fetch: payloadStub.fetch,
  });
  await assert.rejects(payloadBound.evaluate(request), /typesafe_request_exceeds_spend_bound/);
  assert.equal(payloadStub.requests.length, 0);

  const retryStub = fakeFetch(response);
  const retryBudget = new TypeSafeDecisionClientV1({
    apiKey: 'test-key',
    model: 'jev-1.13.0',
    timeoutMs: 1_000,
    maxRetries: 1,
    maxSpendUsd: 0.005,
    inputPriceUsdPerMillionTokens: 0.042,
    maxInputTokensPerCall: 64_000,
    fetch: retryStub.fetch,
  });
  await assert.rejects(retryBudget.evaluate(request), /typesafe_spend_limit/);
  assert.equal(retryStub.requests.length, 0);
});

test('client cancellation aborts transport and concurrency is capped', async () => {
  let startedFetch;
  const started = new Promise((resolve) => { startedFetch = resolve; });
  let finishFetch;
  const blockedFetch = (_url, init) => new Promise((resolve, reject) => {
    finishFetch = resolve;
    startedFetch();
    init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
  });
  const client = new TypeSafeDecisionClientV1({
    apiKey: 'test-key',
    model: 'jev-pinned-test',
    timeoutMs: 2_000,
    maxConcurrentCalls: 1,
    fetch: blockedFetch,
  });
  const request = {
    state: 'bounded input',
    questions: { eligible: { type: 'noul', instructions: 'Is this eligible?' } },
  };
  const controller = new AbortController();
  const active = client.evaluate(request, controller.signal);
  await started;
  await assert.rejects(client.evaluate(request), /typesafe_concurrency_limit/);
  controller.abort(new Error('caller_cancelled'));
  await assert.rejects(active);

  const secondStarted = new Promise((resolve) => { startedFetch = resolve; });
  const next = client.evaluate(request);
  await secondStarted;
  finishFetch(new Response(JSON.stringify(response), {
    headers: { 'content-type': 'application/json' },
  }));
  assert.equal((await next).model, response.model);
});
