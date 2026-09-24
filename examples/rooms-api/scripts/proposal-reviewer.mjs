import { createHash } from "node:crypto";

const RUBRIC_VERSION = 1;
const RUBRIC = Object.freeze([
  {
    id: "weekly_human_review",
    text: "Does the proposal require a weekly human review?",
  },
  {
    id: "stop_after_four_weeks",
    text: "Does the proposal include an explicit stop decision after four weeks?",
  },
]);

export async function reviewProposal({
  artifact,
  env = process.env,
  decisionClient: suppliedDecisionClient,
  structuredEvaluator,
}) {
  const startedAt = performance.now();
  const version = artifact.currentVersion;
  const contentValue = artifact.versions.find((item) => item.version === version)?.content;
  if (contentValue === undefined) throw new Error("proposal_review_version_missing");
  const content = typeof contentValue === "string" ? contentValue : JSON.stringify(contentValue);
  const rubricDigest = `sha256:${createHash("sha256")
    .update(`agentplat.proposal-review-rubric/v1\0${JSON.stringify(RUBRIC)}`)
    .digest("hex")}`;
  const provider = env.PROPOSAL_REVIEWER ?? "rules";
  let criteria;
  let providerModel = null;
  let usage = null;
  let spendReservedUsd = null;
  let observedCostUsd = null;

  if (provider === "rules") {
    criteria = [
      {
        id: RUBRIC[0].id,
        signal: {
          kind: "deterministic_text_match",
          matched: /weekly.{0,24}human review|human review.{0,24}weekly/i.test(content),
        },
      },
      {
        id: RUBRIC[1].id,
        signal: {
          kind: "deterministic_text_match",
          matched: /stop.{0,48}four weeks|four weeks.{0,48}stop/i.test(content),
        },
      },
    ];
  } else if (provider === "jev") {
    let client = suppliedDecisionClient;
    if (!client) {
      if (!env.TYPESAFE_API_KEY) throw new Error("TYPESAFE_API_KEY_required_for_jev_review");
      const budget = {
        maxSpendUsd: parsePositiveNumber(env.TYPESAFE_MAX_SPEND_USD, "TYPESAFE_MAX_SPEND_USD"),
        inputPriceUsdPerMillionTokens: parsePositiveNumber(
          env.TYPESAFE_INPUT_PRICE_USD_PER_MILLION_TOKENS,
          "TYPESAFE_INPUT_PRICE_USD_PER_MILLION_TOKENS",
        ),
        maxInputTokensPerCall: parsePositiveInteger(
          env.TYPESAFE_MAX_INPUT_TOKENS_PER_CALL,
          "TYPESAFE_MAX_INPUT_TOKENS_PER_CALL",
        ),
      };
      const { TypeSafeDecisionClientV1 } = await import("@agentplat/assessor-typesafe");
      client = new TypeSafeDecisionClientV1({
        apiKey: env.TYPESAFE_API_KEY,
        model: env.TYPESAFE_MODEL ?? "jev-latest",
        timeoutMs: 10_000,
        ...budget,
      });
    }
    const result = await client.evaluate({
      state: {
        artifact: { id: artifact.id, version, content },
        rubric: RUBRIC.map(({ id, text }) => ({ id, requirement: text })),
      },
      questions: {
        weekly_human_review: {
          type: "noul",
          instructions: RUBRIC[0].text,
        },
        stop_after_four_weeks: {
          type: "noul",
          instructions: RUBRIC[1].text,
        },
      },
    });
    criteria = [
      {
        id: RUBRIC[0].id,
        signal: { kind: "jev_noul", yesProbability: result.answers.weekly_human_review.noul },
      },
      {
        id: RUBRIC[1].id,
        signal: { kind: "jev_noul", yesProbability: result.answers.stop_after_four_weeks.noul },
      },
    ];
    providerModel = result.model;
    usage = result.usage;
    spendReservedUsd = client.reservedSpendUsd ?? null;
    const inputPrice = Number(env.TYPESAFE_INPUT_PRICE_USD_PER_MILLION_TOKENS);
    observedCostUsd = Number.isFinite(inputPrice) && inputPrice > 0
      ? (result.usage.input_tokens * inputPrice) / 1_000_000
      : null;
  } else if (provider === "structured-llm") {
    if (!structuredEvaluator) throw new Error("structured_llm_evaluator_required");
    const result = await structuredEvaluator.evaluate({
      artifact: { id: artifact.id, version, content },
      rubric: RUBRIC.map(({ id, text }) => ({ id, requirement: text })),
    });
    criteria = RUBRIC.map(({ id }) => ({ id, signal: result.signals[id] }));
    providerModel = result.providerModel;
    usage = result.usage;
    spendReservedUsd = result.spendReservedUsd;
    observedCostUsd = result.observedCostUsd;
  } else {
    throw new Error("PROPOSAL_REVIEWER_must_be_rules_or_jev");
  }

  return Object.freeze({
    schemaVersion: 1,
    sourceArtifactId: artifact.id,
    sourceArtifactVersion: version,
    reviewerVersion: 1,
    rubricVersion: RUBRIC_VERSION,
    rubricDigest,
    evaluator: provider,
    providerModel,
    usage,
    spendReservedUsd,
    observedCostUsd,
    criteria,
    elapsedMs: Math.round(performance.now() - startedAt),
    authority: "advisory_only_human_approval_required",
  });
}

function parsePositiveNumber(value, name) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name}_must_be_positive`);
  return parsed;
}

function parsePositiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${name}_must_be_positive_integer`);
  return parsed;
}
