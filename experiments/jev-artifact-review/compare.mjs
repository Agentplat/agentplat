import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { aggregateMetrics } from './run.mjs';

const CRITERIA = ['weekly_human_review', 'stop_after_four_weeks'];
const BOOTSTRAP_SAMPLES = 5_000;

export function compareEvaluations(baseline, candidate) {
  validateComparableResults(baseline, candidate);
  const baselineMetrics = aggregateMetrics(baseline.cases);
  const candidateMetrics = aggregateMetrics(candidate.cases);
  const byCriterion = pairedAccuracyDeltas(
    baseline.cases,
    candidate.cases,
    baseline.datasetDigest,
    'all',
  );
  const byStratum = {};
  for (const key of Object.keys(baselineMetrics.byStratum ?? {}).sort()) {
    const separator = key.indexOf(':');
    const dimension = key.slice(0, separator);
    const value = key.slice(separator + 1);
    const left = baseline.cases.filter((item) => item.strata?.[dimension] === value);
    const right = candidate.cases.filter((item) => item.strata?.[dimension] === value);
    byStratum[key] = pairedAccuracyDeltas(left, right, baseline.datasetDigest, key);
  }
  return {
    schemaVersion: 1,
    datasetDigest: baseline.datasetDigest,
    rubricVersion: baseline.rubricVersion,
    rubricDigest: baseline.rubricDigest,
    baseline: {
      provider: baseline.provider,
      model: baseline.providerModel,
      accuracy: Object.fromEntries(CRITERIA.map((name) => [name, baselineMetrics[name].accuracy])),
      p50Ms: baseline.latencyMs.p50,
      p95Ms: baseline.latencyMs.p95,
      observedProviderCostUsd: baseline.observedProviderCostUsd,
      spendReservedUsd: baseline.spendReservedUsd,
    },
    candidate: {
      provider: candidate.provider,
      model: candidate.providerModel,
      accuracy: Object.fromEntries(CRITERIA.map((name) => [name, candidateMetrics[name].accuracy])),
      p50Ms: candidate.latencyMs.p50,
      p95Ms: candidate.latencyMs.p95,
      observedProviderCostUsd: candidate.observedProviderCostUsd,
      spendReservedUsd: candidate.spendReservedUsd,
    },
    candidateMinusBaseline: {
      p50Ms: difference(candidate.latencyMs.p50, baseline.latencyMs.p50),
      p95Ms: difference(candidate.latencyMs.p95, baseline.latencyMs.p95),
      observedProviderCostUsd: difference(candidate.observedProviderCostUsd, baseline.observedProviderCostUsd),
      spendReservedUsd: difference(candidate.spendReservedUsd, baseline.spendReservedUsd),
    },
    byCriterion,
    byStratum,
    limits: 'Paired bootstrap intervals are descriptive; sample size and task selection determine interpretation.',
  };
}

function pairedAccuracyDeltas(baselineCases, candidateCases, datasetDigest, scope) {
  const byCriterion = {};
  for (const criterion of CRITERIA) {
    const paired = [];
    for (let index = 0; index < baselineCases.length; index += 1) {
      const left = baselineCases[index];
      const right = candidateCases[index];
      const expected = left.expected[criterion];
      if (expected === null) continue;
      paired.push(
        Number(predict(right.signals[criterion]) === expected) -
        Number(predict(left.signals[criterion]) === expected),
      );
    }
    byCriterion[criterion] = {
      pairedCases: paired.length,
      accuracyDifference: paired.length
        ? paired.reduce((sum, item) => sum + item, 0) / paired.length
        : null,
      accuracyDifference95CI: paired.length >= 2
        ? bootstrapMeanInterval(paired, datasetDigest, `${scope}:${criterion}`)
        : null,
    };
  }
  return byCriterion;
}

function validateComparableResults(left, right) {
  for (const result of [left, right]) {
    if (
      result?.schemaVersion !== 1 ||
      result.status !== 'completed' ||
      !Array.isArray(result.cases) ||
      result.cases.length < 2 ||
      typeof result.datasetDigest !== 'string' ||
      !/^sha256:[0-9a-f]{64}$/.test(result.datasetDigest)
    )
      throw new TypeError('comparison_requires_completed_v1_results');
  }
  if (
    left.datasetDigest !== right.datasetDigest ||
    left.rubricVersion !== right.rubricVersion ||
    left.rubricDigest !== right.rubricDigest
  )
    throw new TypeError('comparison_dataset_or_rubric_mismatch');
  if (left.cases.length !== right.cases.length)
    throw new TypeError('comparison_case_set_mismatch');
  for (let index = 0; index < left.cases.length; index += 1) {
    const a = left.cases[index];
    const b = right.cases[index];
    if (
      a.caseId !== b.caseId ||
      a.artifactVersion !== b.artifactVersion ||
      JSON.stringify(a.strata) !== JSON.stringify(b.strata) ||
      JSON.stringify(a.expected) !== JSON.stringify(b.expected)
    )
      throw new TypeError('comparison_case_set_mismatch');
  }
}

function predict(signal) {
  if (signal?.kind === 'jev_noul') return signal.yesProbability >= 0.5;
  if (signal?.kind === 'deterministic_text_match') return signal.matched;
  if (signal?.kind === 'structured_llm_binary') return signal.satisfied;
  throw new TypeError('comparison_signal_invalid');
}

function difference(candidate, baseline) {
  return typeof candidate === 'number' && typeof baseline === 'number'
    ? candidate - baseline
    : null;
}

function bootstrapMeanInterval(values, datasetDigest, criterion) {
  let state = Number.parseInt(datasetDigest.slice(7, 15), 16) ^ hashString(criterion);
  if (state === 0) state = 0x9e3779b9;
  const sampleMeans = new Array(BOOTSTRAP_SAMPLES);
  for (let sample = 0; sample < BOOTSTRAP_SAMPLES; sample += 1) {
    let sum = 0;
    for (let draw = 0; draw < values.length; draw += 1) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      const index = (state >>> 0) % values.length;
      sum += values[index];
    }
    sampleMeans[sample] = sum / values.length;
  }
  sampleMeans.sort((a, b) => a - b);
  return [sampleMeans[Math.floor(0.025 * BOOTSTRAP_SAMPLES)], sampleMeans[Math.floor(0.975 * BOOTSTRAP_SAMPLES)]];
}

function hashString(value) {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

async function main(args) {
  const options = parseArgs(args);
  const baseline = JSON.parse(await readFile(options.baseline, 'utf8'));
  const candidate = JSON.parse(await readFile(options.candidate, 'utf8'));
  const comparison = compareEvaluations(baseline, candidate);
  await writeFile(options.output, `${JSON.stringify(comparison, null, 2)}\n`, {
    flag: 'wx',
    mode: 0o600,
  });
  process.stdout.write(`${JSON.stringify({
    datasetDigest: comparison.datasetDigest,
    baseline: comparison.baseline.provider,
    candidate: comparison.candidate.provider,
    byCriterion: comparison.byCriterion,
    output: options.output,
  })}\n`);
}

function parseArgs(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!['--baseline', '--candidate', '--output'].includes(key))
      throw new Error('usage: compare.mjs --baseline FILE --candidate FILE --output FILE');
    result[key.slice(2)] = args[++index];
  }
  if (!result.baseline || !result.candidate || !result.output)
    throw new Error('usage: compare.mjs --baseline FILE --candidate FILE --output FILE');
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof TypeError ? 'invalid_comparison_input' : 'comparison_failed'}\n`);
    process.exitCode = 1;
  });
