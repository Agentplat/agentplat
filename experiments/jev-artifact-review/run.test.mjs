import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { aggregateMetrics, runEvaluation } from './run.mjs';
import { compareEvaluations } from './compare.mjs';
import { StructuredLlmEvaluatorV1 } from './structured-llm-evaluator.mjs';

test('rules runner writes aggregate results without copying proposal contents', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'agentplat-jev-eval-'));
  try {
    const datasetPath = path.join(directory, 'heldout.json');
    const outputPath = path.join(directory, 'result.json');
    await writeFile(datasetPath, JSON.stringify({
      schemaVersion: 1,
      rubricVersion: 1,
      rubricDigest: 'sha256:bcbefde8e4681a8109edbe3b97c5322e5bf9b7b4fd6bd2515678dca13a7603cd',
      adjudication: { status: 'adjudicated', reviewerCount: 2, conflictsResolved: true },
      cases: [
        {
          id: 'case-1', version: 1,
          content: 'A weekly human review and a stop decision after four weeks are required.',
          strata: { language: 'en', challenge: 'direct' },
          expected: { weekly_human_review: true, stop_after_four_weeks: true },
        },
        {
          id: 'case-2', version: 3,
          content: 'There is no weekly human review and no stop decision after four weeks.',
          strata: { language: 'en', challenge: 'negation' },
          expected: { weekly_human_review: false, stop_after_four_weeks: false },
        },
      ],
    }));

    const result = await runEvaluation({
      datasetPath,
      outputPath,
      provider: 'rules',
      env: {},
    });
    const saved = await readFile(outputPath, 'utf8');

    assert.equal(result.status, 'completed');
    assert.match(result.datasetDigest, /^sha256:[0-9a-f]{64}$/);
    assert.equal(result.metrics.weekly_human_review.n, 2);
    assert.equal(result.metrics.weekly_human_review.fp, 1);
    assert.equal(result.metrics.stop_after_four_weeks.fn, 0);
    assert.equal(result.metrics.byStratum['language:en'].weekly_human_review.n, 2);
    assert.equal(result.metrics.byStratum['challenge:negation'].weekly_human_review.fp, 1);
    assert.equal(saved.includes('A weekly human review'), false);
    assert.deepEqual(Object.keys(result.cases[0]).sort(), [
      'artifactVersion', 'caseId', 'evaluator', 'expected', 'providerModel',
      'signals', 'strata', 'usage', 'elapsedMs',
    ].sort());
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Jev runner requires credentials before attempting any provider request', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'agentplat-jev-eval-'));
  try {
    const datasetPath = path.join(directory, 'heldout.json');
    const outputPath = path.join(directory, 'result.json');
    await writeFile(datasetPath, JSON.stringify({
      schemaVersion: 1,
      rubricVersion: 1,
      rubricDigest: 'sha256:bcbefde8e4681a8109edbe3b97c5322e5bf9b7b4fd6bd2515678dca13a7603cd',
      adjudication: { status: 'adjudicated', reviewerCount: 2, conflictsResolved: true },
      cases: [
        { id: 'case-1', version: 1, content: 'A', strata: { language: 'en', challenge: 'direct' }, expected: { weekly_human_review: true, stop_after_four_weeks: false } },
        { id: 'case-2', version: 1, content: 'B', strata: { language: 'es', challenge: 'paraphrase' }, expected: { weekly_human_review: false, stop_after_four_weeks: true } },
      ],
    }));

    await assert.rejects(
      runEvaluation({ datasetPath, outputPath, provider: 'jev', env: {} }),
      /TYPESAFE_API_KEY_required/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('structured LLM evaluator returns validated binary signals with spend accounting', async () => {
  let requestBody;
  const evaluator = new StructuredLlmEvaluatorV1({
    apiKey: 'test-key',
    baseURL: 'https://llm.example/v1',
    model: 'test-structured-model',
    maxSpendUsd: 0.01,
    inputPriceUsdPerMillionTokens: 1,
    outputPriceUsdPerMillionTokens: 2,
    maxInputTokensPerCall: 2_000,
    maxOutputTokensPerCall: 100,
    maxRequestBytes: 2_000,
    maxResponseBytes: 16_384,
    timeoutMs: 2_000,
    fetch: async (_input, init) => {
      requestBody = JSON.parse(init.body);
      return new Response(JSON.stringify({
        id: 'test-id',
        model: 'test-structured-model-v2',
        choices: [{
          message: {
            role: 'assistant',
            content: JSON.stringify({ weekly_human_review: true, stop_after_four_weeks: false }),
          },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 },
      }), { headers: { 'content-type': 'application/json' } });
    },
  });
  const result = await evaluator.evaluate({
    artifact: { id: 'case:1', version: 2, content: 'Proposal text.' },
    rubric: [{ id: 'weekly_human_review' }, { id: 'stop_after_four_weeks' }],
  });

  assert.equal(requestBody.response_format.type, 'json_object');
  assert.deepEqual(result.signals, {
    weekly_human_review: { kind: 'structured_llm_binary', satisfied: true },
    stop_after_four_weeks: { kind: 'structured_llm_binary', satisfied: false },
  });
  assert.equal(result.spendReservedUsd, 0.0022);
  assert.equal(result.observedCostUsd, 0.000036);
});

test('structured LLM evaluator rejects calls past its cumulative spend cap', async () => {
  let calls = 0;
  const evaluator = new StructuredLlmEvaluatorV1({
    apiKey: 'test-key',
    baseURL: 'https://llm.example/v1',
    model: 'test-structured-model',
    maxSpendUsd: 0.003,
    inputPriceUsdPerMillionTokens: 1,
    outputPriceUsdPerMillionTokens: 0,
    maxInputTokensPerCall: 2_000,
    maxOutputTokensPerCall: 100,
    maxRequestBytes: 2_000,
    maxResponseBytes: 16_384,
    timeoutMs: 2_000,
    fetch: async () => {
      calls += 1;
      return new Response(JSON.stringify({
        model: 'test-model',
        choices: [{ message: { content: '{"weekly_human_review":true,"stop_after_four_weeks":false}' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }), { headers: { 'content-type': 'application/json' } });
    },
  });
  const input = {
    artifact: { id: 'case:1', version: 1, content: 'text' },
    rubric: [],
  };
  await evaluator.evaluate(input);
  await assert.rejects(evaluator.evaluate(input), /structured_llm_spend_limit/);
  assert.equal(calls, 1);
});

test('structured LLM invalid JSON retains its reservation and fails closed', async () => {
  const evaluator = new StructuredLlmEvaluatorV1({
    apiKey: 'test-key',
    baseURL: 'https://llm.example/v1',
    model: 'test-structured-model',
    maxSpendUsd: 0.01,
    inputPriceUsdPerMillionTokens: 1,
    outputPriceUsdPerMillionTokens: 1,
    maxInputTokensPerCall: 2_000,
    maxOutputTokensPerCall: 100,
    maxRequestBytes: 2_000,
    maxResponseBytes: 16_384,
    timeoutMs: 2_000,
    fetch: async () => new Response(JSON.stringify({
      model: 'test-model',
      choices: [{ message: { content: 'malformed private answer' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 15, completion_tokens: 5, total_tokens: 20 },
    }), { headers: { 'content-type': 'application/json' } }),
  });

  await assert.rejects(evaluator.evaluate({
    artifact: { id: 'case:1', version: 1, content: 'private text' },
    rubric: [],
  }), /structured_llm_invalid_json/);
  assert.equal(evaluator.reservedSpendUsd, 0.0021);
});

test('structured LLM response body size is bounded', async () => {
  const evaluator = new StructuredLlmEvaluatorV1({
    apiKey: 'test-key',
    baseURL: 'https://llm.example/v1',
    model: 'test-structured-model',
    maxSpendUsd: 1,
    inputPriceUsdPerMillionTokens: 1,
    outputPriceUsdPerMillionTokens: 1,
    maxInputTokensPerCall: 2_000,
    maxOutputTokensPerCall: 100,
    maxRequestBytes: 2_000,
    maxResponseBytes: 64,
    timeoutMs: 2_000,
    fetch: async () => new Response(JSON.stringify({ output: 'x'.repeat(200) }), {
      headers: { 'content-type': 'application/json' },
    }),
  });
  await assert.rejects(evaluator.evaluate({
    artifact: { id: 'case:1', version: 1, content: 'private text' },
    rubric: [],
  }), /structured_llm_response_exceeds_limit/);
});

test('structured LLM timeout aborts the provider call and retains reserved spend', async () => {
  let observedSignal;
  const evaluator = new StructuredLlmEvaluatorV1({
    apiKey: 'test-key',
    baseURL: 'https://llm.example/v1',
    model: 'test-structured-model',
    maxSpendUsd: 0.01,
    inputPriceUsdPerMillionTokens: 1,
    outputPriceUsdPerMillionTokens: 1,
    maxInputTokensPerCall: 2_000,
    maxOutputTokensPerCall: 100,
    maxRequestBytes: 2_000,
    maxResponseBytes: 1_000,
    timeoutMs: 20,
    fetch: async (_input, init) => new Promise((_resolve, reject) => {
      observedSignal = init.signal;
      init.signal.addEventListener('abort', () => reject(new Error('request_aborted')), { once: true });
    }),
  });

  await assert.rejects(evaluator.evaluate({
    artifact: { id: 'case:1', version: 1, content: 'private text' },
    rubric: [],
  }));
  assert.equal(observedSignal.aborted, true);
  assert.equal(evaluator.reservedSpendUsd, 0.0021);
});

test('Jev metrics exclude unresolved labels and report calibration bins', () => {
  const metrics = aggregateMetrics([
    {
      expected: { weekly_human_review: true, stop_after_four_weeks: null },
      signals: {
        weekly_human_review: { kind: 'jev_noul', yesProbability: 0.9 },
        stop_after_four_weeks: { kind: 'jev_noul', yesProbability: 0.2 },
      },
    },
    {
      expected: { weekly_human_review: false, stop_after_four_weeks: true },
      signals: {
        weekly_human_review: { kind: 'jev_noul', yesProbability: 0.8 },
        stop_after_four_weeks: { kind: 'jev_noul', yesProbability: 0.7 },
      },
    },
  ]);

  assert.equal(metrics.weekly_human_review.n, 2);
  assert.equal(metrics.weekly_human_review.excludedUnresolved, 0);
  assert.equal(metrics.weekly_human_review.tp, 1);
  assert.equal(metrics.weekly_human_review.fp, 1);
  assert.ok(Math.abs(metrics.weekly_human_review.brierScore - 0.325) < 1e-12);
  assert.ok(Math.abs(metrics.weekly_human_review.expectedCalibrationError - 0.45) < 1e-12);
  assert.equal(metrics.stop_after_four_weeks.n, 1);
  assert.equal(metrics.stop_after_four_weeks.excludedUnresolved, 1);
});

test('structured LLM runner shares the human-adjudicated dataset and emits cost metrics', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'agentplat-jev-eval-'));
  try {
    const datasetPath = path.join(directory, 'heldout.json');
    const outputPath = path.join(directory, 'structured-llm.json');
    await writeFile(datasetPath, JSON.stringify({
      schemaVersion: 1,
      rubricVersion: 1,
      rubricDigest: 'sha256:bcbefde8e4681a8109edbe3b97c5322e5bf9b7b4fd6bd2515678dca13a7603cd',
      adjudication: { status: 'adjudicated', reviewerCount: 2, conflictsResolved: true },
      cases: [
        { id: 'case-1', version: 1, content: 'proposal private one', strata: { language: 'en', challenge: 'direct' }, expected: { weekly_human_review: true, stop_after_four_weeks: false } },
        { id: 'case-2', version: 1, content: 'proposal private two', strata: { language: 'es', challenge: 'paraphrase' }, expected: { weekly_human_review: false, stop_after_four_weeks: true } },
      ],
    }));
    const output = await runEvaluation({
      datasetPath,
      outputPath,
      provider: 'structured-llm',
      env: {
        STRUCTURED_LLM_INPUT_PRICE_USD_PER_MILLION_TOKENS: '1',
        STRUCTURED_LLM_OUTPUT_PRICE_USD_PER_MILLION_TOKENS: '2',
      },
      structuredEvaluator: {
        reservedSpendUsd: 0.003,
        async evaluate() {
          return {
            providerModel: 'mock-structured-model',
            usage: { input_tokens: 15, output_tokens: 6 },
            observedCostUsd: 0.00003,
            spendReservedUsd: 0.003,
            elapsedMs: 4,
            signals: {
              weekly_human_review: { kind: 'structured_llm_binary', satisfied: true },
              stop_after_four_weeks: { kind: 'structured_llm_binary', satisfied: true },
            },
          };
        },
      },
    });

    assert.equal(output.status, 'completed');
    assert.equal(output.providerModel, 'mock-structured-model');
    assert.equal(output.observedProviderCostUsd, 0.000054);
    assert.equal(output.spendReservedUsd, 0.003);
    assert.equal(output.metrics.stop_after_four_weeks.fp, 1);
    assert.equal((await readFile(outputPath, 'utf8')).includes('proposal private'), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('runner refuses an occupied output path before calling an evaluator', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'agentplat-jev-eval-'));
  try {
    const datasetPath = path.join(directory, 'heldout.json');
    const outputPath = path.join(directory, 'existing.json');
    await writeFile(datasetPath, JSON.stringify({
      schemaVersion: 1,
      rubricVersion: 1,
      rubricDigest: 'sha256:bcbefde8e4681a8109edbe3b97c5322e5bf9b7b4fd6bd2515678dca13a7603cd',
      adjudication: { status: 'adjudicated', reviewerCount: 2, conflictsResolved: true },
      cases: [
        { id: 'case-1', version: 1, content: 'A', strata: { language: 'en', challenge: 'direct' }, expected: { weekly_human_review: true, stop_after_four_weeks: false } },
        { id: 'case-2', version: 1, content: 'B', strata: { language: 'es', challenge: 'paraphrase' }, expected: { weekly_human_review: false, stop_after_four_weeks: true } },
      ],
    }));
    await writeFile(outputPath, 'existing output');
    let calls = 0;
    await assert.rejects(runEvaluation({
      datasetPath,
      outputPath,
      provider: 'structured-llm',
      env: {
        STRUCTURED_LLM_INPUT_PRICE_USD_PER_MILLION_TOKENS: '1',
        STRUCTURED_LLM_OUTPUT_PRICE_USD_PER_MILLION_TOKENS: '1',
      },
      structuredEvaluator: {
        async evaluate() { calls += 1; throw new Error('should_not_be_called'); },
      },
    }), /EEXIST/);
    assert.equal(calls, 0);
    assert.equal(await readFile(outputPath, 'utf8'), 'existing output');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('runner atomically records a failed run without copying source content', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'agentplat-jev-eval-'));
  try {
    const datasetPath = path.join(directory, 'heldout.json');
    const outputPath = path.join(directory, 'failed.json');
    await writeFile(datasetPath, JSON.stringify({
      schemaVersion: 1,
      rubricVersion: 1,
      rubricDigest: 'sha256:bcbefde8e4681a8109edbe3b97c5322e5bf9b7b4fd6bd2515678dca13a7603cd',
      adjudication: { status: 'adjudicated', reviewerCount: 2, conflictsResolved: true },
      cases: [
        { id: 'case-1', version: 1, content: 'secret proposal text', strata: { language: 'en', challenge: 'direct' }, expected: { weekly_human_review: true, stop_after_four_weeks: false } },
        { id: 'case-2', version: 1, content: 'another secret proposal text', strata: { language: 'es', challenge: 'paraphrase' }, expected: { weekly_human_review: false, stop_after_four_weeks: true } },
      ],
    }));
    await assert.rejects(runEvaluation({
      datasetPath,
      outputPath,
      provider: 'structured-llm',
      env: {
        STRUCTURED_LLM_INPUT_PRICE_USD_PER_MILLION_TOKENS: '1',
        STRUCTURED_LLM_OUTPUT_PRICE_USD_PER_MILLION_TOKENS: '1',
      },
      structuredEvaluator: {
        reservedSpendUsd: 0.001,
        async evaluate() { throw new Error('structured_llm_timeout'); },
      },
    }), /structured_llm_timeout/);
    const saved = await readFile(outputPath, 'utf8');
    assert.match(saved, /"status": "failed"/);
    assert.equal(saved.includes('secret proposal text'), false);
    assert.match(saved, /"failureCode": "structured_llm_timeout"/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('paired comparison requires identical datasets and returns reproducible deltas', () => {
  const baseline = {
    schemaVersion: 1,
    status: 'completed',
    provider: 'rules',
    providerModel: null,
    datasetDigest: `sha256:${'a'.repeat(64)}`,
    rubricVersion: 1,
    rubricDigest: `sha256:${'b'.repeat(64)}`,
    latencyMs: { p50: 2, p95: 3 },
    observedProviderCostUsd: null,
    spendReservedUsd: null,
    metrics: {
      weekly_human_review: { accuracy: 0.5 },
      stop_after_four_weeks: { accuracy: 0.5 },
    },
    cases: [
      {
        caseId: '1',
        expected: { weekly_human_review: true, stop_after_four_weeks: false },
        strata: { language: 'en', challenge: 'direct' },
        signals: {
          weekly_human_review: { kind: 'deterministic_text_match', matched: true },
          stop_after_four_weeks: { kind: 'deterministic_text_match', matched: false },
        },
      },
      {
        caseId: '2',
        expected: { weekly_human_review: false, stop_after_four_weeks: true },
        strata: { language: 'es', challenge: 'paraphrase' },
        signals: {
          weekly_human_review: { kind: 'deterministic_text_match', matched: true },
          stop_after_four_weeks: { kind: 'deterministic_text_match', matched: true },
        },
      },
    ],
  };
  const candidate = structuredClone(baseline);
  candidate.provider = 'jev';
  candidate.providerModel = 'jev-1.13.0';
  candidate.cases[1].signals.weekly_human_review = {
    kind: 'jev_noul', yesProbability: 0.1,
  };
  candidate.cases[1].signals.stop_after_four_weeks = {
    kind: 'jev_noul', yesProbability: 0.8,
  };

  const first = compareEvaluations(baseline, candidate);
  const second = compareEvaluations(baseline, candidate);
  assert.equal(first.byCriterion.weekly_human_review.accuracyDifference, 0.5);
  assert.equal(first.byStratum['language:es'].weekly_human_review.accuracyDifference, 1);
  assert.deepEqual(first.byCriterion, second.byCriterion);
  assert.throws(
    () => compareEvaluations(baseline, { ...candidate, datasetDigest: `sha256:${'c'.repeat(64)}` }),
    /comparison_dataset_or_rubric_mismatch/,
  );
});
