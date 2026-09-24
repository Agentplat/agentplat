import { createHash, randomUUID } from 'node:crypto';
import { open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { reviewProposal } from '../../examples/rooms-api/scripts/proposal-reviewer.mjs';

const CRITERIA = Object.freeze([
  'weekly_human_review',
  'stop_after_four_weeks',
]);
const RUBRIC_VERSION = 1;
const RUBRIC_DIGEST = 'sha256:bcbefde8e4681a8109edbe3b97c5322e5bf9b7b4fd6bd2515678dca13a7603cd';

export async function runEvaluation({
  datasetPath,
  outputPath,
  provider,
  env = process.env,
  structuredEvaluator: suppliedStructuredEvaluator,
}) {
  if (!datasetPath || !outputPath) throw new Error('dataset_and_output_required');
  if (!['rules', 'jev', 'structured-llm'].includes(provider))
    throw new Error('unsupported_provider');

  const datasetBytes = await readFile(datasetPath);
  const datasetDigest = `sha256:${createHash('sha256').update(datasetBytes).digest('hex')}`;
  const dataset = parseAdjudicatedDataset(JSON.parse(datasetBytes.toString('utf8')));
  let decisionClient;
  if (provider === 'jev') decisionClient = await createBudgetedJevClient(env);
  let structuredEvaluator = suppliedStructuredEvaluator;
  if (provider === 'structured-llm' && !structuredEvaluator)
    structuredEvaluator = await createBudgetedStructuredLlmEvaluator(env);
  const inputPriceUsdPerMillionTokens = provider === 'jev'
    ? positiveNumber(env.TYPESAFE_INPUT_PRICE_USD_PER_MILLION_TOKENS, 'TYPESAFE_INPUT_PRICE_USD_PER_MILLION_TOKENS')
    : null;
  const structuredInputPrice = provider === 'structured-llm'
    ? positiveNumber(env.STRUCTURED_LLM_INPUT_PRICE_USD_PER_MILLION_TOKENS, 'STRUCTURED_LLM_INPUT_PRICE_USD_PER_MILLION_TOKENS')
    : null;
  const structuredOutputPrice = provider === 'structured-llm'
    ? nonNegativeNumber(env.STRUCTURED_LLM_OUTPUT_PRICE_USD_PER_MILLION_TOKENS, 'STRUCTURED_LLM_OUTPUT_PRICE_USD_PER_MILLION_TOKENS')
    : 0;

  const cases = [];
  const startedAt = new Date().toISOString();
  await reserveOutputPath(outputPath, {
    schemaVersion: 1,
    status: 'running',
    provider,
    datasetDigest,
    rubricVersion: RUBRIC_VERSION,
    rubricDigest: RUBRIC_DIGEST,
    startedAt,
  });
  try {
    for (const item of dataset.cases) {
      const report = await reviewProposal({
        artifact: {
          id: item.id,
          currentVersion: item.version,
          versions: [{ version: item.version, content: item.content }],
        },
        env: { PROPOSAL_REVIEWER: provider },
        decisionClient,
        structuredEvaluator,
      });
      cases.push({
        caseId: item.id,
        artifactVersion: item.version,
        expected: item.expected,
        strata: item.strata,
        signals: Object.fromEntries(report.criteria.map(({ id, signal }) => [id, signal])),
        evaluator: report.evaluator,
        providerModel: report.providerModel,
        usage: report.usage,
        elapsedMs: report.elapsedMs,
      });
    }
    const output = buildResult({
      status: 'completed',
      provider,
      providerModel: cases.find((item) => item.providerModel)?.providerModel ?? null,
      datasetDigest,
      adjudication: dataset.adjudication,
      cases,
      spendReservedUsd: decisionClient?.reservedSpendUsd ??
        structuredEvaluator?.reservedSpendUsd ?? null,
      inputPriceUsdPerMillionTokens: inputPriceUsdPerMillionTokens ?? structuredInputPrice,
      outputPriceUsdPerMillionTokens: structuredOutputPrice,
      startedAt,
      completedAt: new Date().toISOString(),
    });
    await writeResult(outputPath, output);
    return output;
  } catch (error) {
    const output = buildResult({
      status: 'failed',
      provider,
      providerModel: cases.find((item) => item.providerModel)?.providerModel ?? null,
      datasetDigest,
      adjudication: dataset.adjudication,
      cases,
      spendReservedUsd: decisionClient?.reservedSpendUsd ??
        structuredEvaluator?.reservedSpendUsd ?? null,
      inputPriceUsdPerMillionTokens: inputPriceUsdPerMillionTokens ?? structuredInputPrice,
      outputPriceUsdPerMillionTokens: structuredOutputPrice,
      failureCode: safeFailureCode(error),
      startedAt,
      completedAt: new Date().toISOString(),
    });
    try {
      await writeResult(outputPath, output);
    } catch {
      throw new Error('evaluation_failed_and_result_recording_failed', { cause: error });
    }
    throw error;
  }
}

export function aggregateMetrics(cases, includeStrata = true) {
  const byCriterion = {};
  for (const criterion of CRITERIA) {
    const totals = { tp: 0, fp: 0, tn: 0, fn: 0, brierSum: 0, brierErrors: [] };
    const calibrationBins = Array.from({ length: 10 }, () => ({ n: 0, probabilitySum: 0, positiveSum: 0 }));
    for (const item of cases) {
      const expected = item.expected[criterion];
      if (expected === null) continue;
      const signal = item.signals[criterion];
      const probability = signal.kind === 'jev_noul'
        ? signal.yesProbability
        : signal.kind === 'deterministic_text_match'
          ? Number(signal.matched)
          : signal.kind === 'structured_llm_binary'
            ? Number(signal.satisfied)
            : null;
      if (probability === null || !Number.isFinite(probability) || probability < 0 || probability > 1)
        throw new Error(`invalid_signal:${criterion}`);
      const predicted = probability >= 0.5;
      if (predicted && expected) totals.tp += 1;
      else if (predicted && !expected) totals.fp += 1;
      else if (!predicted && !expected) totals.tn += 1;
      else totals.fn += 1;
      if (signal.kind === 'jev_noul') {
        const error = (probability - Number(expected)) ** 2;
        totals.brierSum += error;
        totals.brierErrors.push(error);
        const bin = calibrationBins[Math.min(9, Math.floor(probability * 10))];
        bin.n += 1;
        bin.probabilitySum += probability;
        bin.positiveSum += Number(expected);
      }
    }
    const n = totals.tp + totals.fp + totals.tn + totals.fn;
    const usedBins = calibrationBins.filter((bin) => bin.n > 0).map((bin, index) => ({
      bin: index,
      n: bin.n,
      meanProbability: bin.probabilitySum / bin.n,
      observedPositiveRate: bin.positiveSum / bin.n,
    }));
    const expectedCalibrationError = totals.brierErrors.length
      ? usedBins.reduce((sum, bin) => sum + bin.n * Math.abs(bin.meanProbability - bin.observedPositiveRate), 0) /
        totals.brierErrors.length
      : null;
    byCriterion[criterion] = {
      n,
      excludedUnresolved: cases.filter((item) => item.expected[criterion] === null).length,
      tp: totals.tp,
      fp: totals.fp,
      tn: totals.tn,
      fn: totals.fn,
      accuracy: ratio(totals.tp + totals.tn, n),
      precision: ratio(totals.tp, totals.tp + totals.fp),
      recall: ratio(totals.tp, totals.tp + totals.fn),
      f1: ratio(2 * totals.tp, 2 * totals.tp + totals.fp + totals.fn),
      brierScore: totals.brierErrors.length
        ? totals.brierSum / totals.brierErrors.length
        : null,
      brierN: totals.brierErrors.length,
      reliabilityBins: usedBins.map((bin) => ({
        ...bin,
        confidenceInterval95: wilsonInterval(bin.positiveSum, bin.n),
      })),
      expectedCalibrationError,
      confidenceIntervals95: {
        accuracy: wilsonInterval(totals.tp + totals.tn, n),
        precision: wilsonInterval(totals.tp, totals.tp + totals.fp),
        recall: wilsonInterval(totals.tp, totals.tp + totals.fn),
        brierScore: normalMeanInterval(totals.brierErrors),
      },
    };
  }
  if (!includeStrata) return byCriterion;
  const byStratum = {};
  for (const field of ['language', 'challenge']) {
    const values = [...new Set(cases.map((item) => item.strata?.[field]).filter(Boolean))].sort();
    for (const value of values) {
      const group = cases.filter((item) => item.strata?.[field] === value);
      byStratum[`${field}:${value}`] = aggregateMetrics(group, false);
    }
  }
  return { ...byCriterion, byStratum };
}

function parseAdjudicatedDataset(value) {
  if (
    value?.schemaVersion !== 1 ||
    value?.rubricVersion !== RUBRIC_VERSION ||
    value?.rubricDigest !== RUBRIC_DIGEST ||
    value?.adjudication?.status !== 'adjudicated' ||
    !Number.isSafeInteger(value.adjudication.reviewerCount) ||
    value.adjudication.reviewerCount < 2 ||
    value.adjudication.conflictsResolved !== true ||
    !Array.isArray(value.cases) ||
    value.cases.length < 2
  ) throw new TypeError('dataset_must_be_human_adjudicated_v1');

  const ids = new Set();
  const cases = value.cases.map((item) => {
    if (typeof item?.id !== 'string' || item.id.length === 0 || ids.has(item.id))
      throw new TypeError('dataset_case_id_invalid');
    ids.add(item.id);
    if (typeof item.content !== 'string' || item.content.length === 0)
      throw new TypeError(`dataset_case_content_invalid:${item.id}`);
    if (!Number.isSafeInteger(item.version) || item.version < 1)
      throw new TypeError(`dataset_case_version_invalid:${item.id}`);
    const expected = {};
    for (const criterion of CRITERIA) {
      const label = item.expected?.[criterion];
      if (label !== true && label !== false && label !== null)
        throw new TypeError(`dataset_label_invalid:${item.id}:${criterion}`);
      expected[criterion] = label;
    }
    if (
      !['en', 'es', 'other'].includes(item.strata?.language) ||
      !['direct', 'paraphrase', 'negation', 'contradiction', 'missing_evidence', 'prompt_injection'].includes(item.strata?.challenge)
    ) throw new TypeError(`dataset_strata_invalid:${item.id}`);
    return {
      id: item.id,
      version: item.version,
      content: item.content,
      expected,
      strata: { language: item.strata.language, challenge: item.strata.challenge },
    };
  });
  return {
    adjudication: {
      reviewerCount: value.adjudication.reviewerCount,
      conflictsResolved: true,
    },
    cases,
  };
}

async function createBudgetedJevClient(env) {
  if (!env.TYPESAFE_API_KEY) throw new Error('TYPESAFE_API_KEY_required');
  const model = env.TYPESAFE_MODEL;
  if (!model || !/^jev-\d+\.\d+\.\d+$/.test(model))
    throw new Error('TYPESAFE_MODEL_must_be_pinned');
  const budget = {
    maxSpendUsd: positiveNumber(env.TYPESAFE_MAX_SPEND_USD, 'TYPESAFE_MAX_SPEND_USD'),
    inputPriceUsdPerMillionTokens: positiveNumber(
      env.TYPESAFE_INPUT_PRICE_USD_PER_MILLION_TOKENS,
      'TYPESAFE_INPUT_PRICE_USD_PER_MILLION_TOKENS',
    ),
    maxInputTokensPerCall: positiveInteger(
      env.TYPESAFE_MAX_INPUT_TOKENS_PER_CALL,
      'TYPESAFE_MAX_INPUT_TOKENS_PER_CALL',
    ),
  };
  const { TypeSafeDecisionClientV1 } = await import('@agentplat/assessor-typesafe');
  return new TypeSafeDecisionClientV1({
    apiKey: env.TYPESAFE_API_KEY,
    model,
    timeoutMs: 10_000,
    maxRetries: 0,
    maxConcurrentCalls: 1,
    ...budget,
  });
}

async function createBudgetedStructuredLlmEvaluator(env) {
  if (!env.STRUCTURED_LLM_API_KEY) throw new Error('STRUCTURED_LLM_API_KEY_required');
  const { createStructuredLlmEvaluatorV1 } = await import('./structured-llm-evaluator.mjs');
  return createStructuredLlmEvaluatorV1({
    apiKey: env.STRUCTURED_LLM_API_KEY,
    baseURL: requiredString(env.STRUCTURED_LLM_BASE_URL, 'STRUCTURED_LLM_BASE_URL'),
    model: requiredString(env.STRUCTURED_LLM_MODEL, 'STRUCTURED_LLM_MODEL'),
    maxSpendUsd: positiveNumber(env.STRUCTURED_LLM_MAX_SPEND_USD, 'STRUCTURED_LLM_MAX_SPEND_USD'),
    inputPriceUsdPerMillionTokens: positiveNumber(
      env.STRUCTURED_LLM_INPUT_PRICE_USD_PER_MILLION_TOKENS,
      'STRUCTURED_LLM_INPUT_PRICE_USD_PER_MILLION_TOKENS',
    ),
    outputPriceUsdPerMillionTokens: nonNegativeNumber(
      env.STRUCTURED_LLM_OUTPUT_PRICE_USD_PER_MILLION_TOKENS,
      'STRUCTURED_LLM_OUTPUT_PRICE_USD_PER_MILLION_TOKENS',
    ),
    maxInputTokensPerCall: positiveInteger(
      env.STRUCTURED_LLM_MAX_INPUT_TOKENS_PER_CALL,
      'STRUCTURED_LLM_MAX_INPUT_TOKENS_PER_CALL',
    ),
    maxOutputTokensPerCall: positiveInteger(
      env.STRUCTURED_LLM_MAX_OUTPUT_TOKENS_PER_CALL,
      'STRUCTURED_LLM_MAX_OUTPUT_TOKENS_PER_CALL',
    ),
    maxRequestBytes: positiveInteger(
      env.STRUCTURED_LLM_MAX_REQUEST_BYTES,
      'STRUCTURED_LLM_MAX_REQUEST_BYTES',
    ),
    maxResponseBytes: 262_144,
    timeoutMs: 10_000,
  });
}

function buildResult(input) {
  const callsExpected = input.provider !== 'rules';
  const casesWithUsage = input.cases.filter((item) => item.usage !== null).length;
  const inputTokens = input.cases.reduce((sum, item) => sum + (item.usage?.input_tokens ?? 0), 0);
  const outputTokens = input.cases.reduce((sum, item) => sum + (item.usage?.output_tokens ?? 0), 0);
  const latency = input.cases.map((item) => item.elapsedMs).sort((left, right) => left - right);
  return {
    schemaVersion: 1,
    status: input.status,
    provider: input.provider,
    providerModel: input.providerModel,
    datasetDigest: input.datasetDigest,
    adjudication: input.adjudication,
    rubricVersion: RUBRIC_VERSION,
    rubricDigest: RUBRIC_DIGEST,
    classificationThreshold: 0.5,
    cases: input.cases,
    metrics: aggregateMetrics(input.cases),
    latencyMs: {
      p50: quantileNearestRank(latency, 0.5),
      p95: quantileNearestRank(latency, 0.95),
    },
    usage: {
      inputTokens,
      outputTokens,
      casesWithUsage,
      casesMissingUsage: callsExpected ? input.cases.length - casesWithUsage : 0,
    },
    observedProviderCostUsd: !callsExpected || input.status !== 'completed' ||
      casesWithUsage !== input.cases.length
      ? null
      : (inputTokens * input.inputPriceUsdPerMillionTokens +
          outputTokens * (input.outputPriceUsdPerMillionTokens ?? 0)) /
        1_000_000,
    spendReservedUsd: input.spendReservedUsd,
    failureCode: input.failureCode ?? null,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
  };
}

function quantileNearestRank(sorted, percentile) {
  if (sorted.length === 0) return null;
  return sorted[Math.max(0, Math.ceil(percentile * sorted.length) - 1)];
}

async function reserveOutputPath(outputPath, result) {
  const handle = await open(outputPath, 'wx', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(result, null, 2)}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function writeResult(outputPath, result) {
  const temporaryPath = path.join(
    path.dirname(outputPath),
    `.${path.basename(outputPath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    const handle = await open(temporaryPath, 'wx', 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(result, null, 2)}\n`);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporaryPath, outputPath);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}

function safeFailureCode(error) {
  const message = error instanceof Error ? error.message : '';
  if (/^(?:typesafe|structured_llm)_[a-z0-9_]+$/.test(message)) return message;
  if (message === 'TYPESAFE_API_KEY_required') return 'typesafe_api_key_required';
  if (message === 'STRUCTURED_LLM_API_KEY_required') return 'structured_llm_api_key_required';
  if (error instanceof TypeError) return 'validation_error';
  if (error?.name === 'AbortError' || error?.name === 'APITimeoutError') return 'provider_timeout';
  return 'evaluation_failed';
}

function ratio(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
}

function wilsonInterval(successes, count) {
  if (count === 0) return null;
  const z = 1.959963984540054;
  const p = successes / count;
  const z2 = z ** 2;
  const denominator = 1 + z2 / count;
  const center = (p + z2 / (2 * count)) / denominator;
  const margin = (z * Math.sqrt(p * (1 - p) / count + z2 / (4 * count ** 2))) / denominator;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

function normalMeanInterval(values) {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  const margin = 1.959963984540054 * Math.sqrt(variance / values.length);
  return [Math.max(0, mean - margin), Math.min(1, mean + margin)];
}

function positiveNumber(value, name) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name}_must_be_positive`);
  return parsed;
}

function positiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${name}_must_be_positive_integer`);
  return parsed;
}

function nonNegativeNumber(value, name) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${name}_must_be_non_negative`);
  return parsed;
}

function requiredString(value, name) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${name}_required`);
  return value;
}

async function main(argv) {
  const options = parseArgs(argv);
  const result = await runEvaluation(options);
  process.stdout.write(`${JSON.stringify({
    status: result.status,
    provider: result.provider,
    providerModel: result.providerModel,
    datasetDigest: result.datasetDigest,
    metrics: result.metrics,
    latencyMs: result.latencyMs,
    usage: result.usage,
    observedProviderCostUsd: result.observedProviderCostUsd,
    spendReservedUsd: result.spendReservedUsd,
    outputPath: options.outputPath,
  })}\n`);
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!['--dataset', '--output', '--provider'].includes(key))
      throw new Error('usage: run.mjs --dataset FILE --output FILE --provider rules|jev|structured-llm');
    result[key.slice(2) === 'output' ? 'outputPath' : key.slice(2)] = argv[++index];
  }
  if (!result.dataset || !result.outputPath || !result.provider)
    throw new Error('usage: run.mjs --dataset FILE --output FILE --provider rules|jev|structured-llm');
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${safeFailureCode(error)}\n`);
    process.exitCode = 1;
  });
