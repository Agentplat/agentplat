# Agent Room proposal review: rules, Jev and structured LLM

Status: three-arm runner implemented; no model-comparison run has been performed.
Evidence class: planned empirical evaluation; runner tests are synthetic.

## Question

For a bounded proposal-review rubric in the Agent Rooms example, does Jev
provide useful quality/cost/latency tradeoffs against local deterministic rules
and a structured-output LLM? Does presenting version-bound signals reduce
human review time without increasing missed material issues?

This evaluates one example workflow. It cannot establish that Jev is generally
more reliable, cheaper, or faster in AgentPlat deployments.

## Method

Use the same application-owned requirements and artifact versions for all three
evaluators. Build a held-out set of proposal drafts spanning explicit positives
and negatives, paraphrases, negation, contradiction, missing evidence, Spanish
and English, and prompt-injection attempts embedded in artifact text. At least
two independent human reviewers label each criterion and adjudicate conflicts;
record agreement and exclude or separately analyze cases without a stable label.
Do not use synthetic tests from the implementation as empirical test cases.

Freeze the dataset, exact rubric, model identifiers, scoring rules, acceptable
miss/false-alarm margins, latency and cost goals before the held-out run. For
Noul probabilities use a preregistered 0.5 classification threshold for
diagnostic accuracy only; do not use that threshold to authorize actions.
Report continuous calibration separately with Brier score and reliability
bins. Treat Jev's Choice/Score `confidence` as its own provider statistic, not
as calibrated accuracy.

Record per evaluator: confusion counts by criterion, coverage/abstention,
missed material issues, false alarms, p50/p95 latency and total provider cost
including retries. Record human review time and correction rounds in a separate
randomized reviewer study; model agreement is not a substitute for that study.
Report sample counts and uncertainty intervals, including failed requests and
excluded cases.

## Reproduce

The integration points are `examples/rooms-api/scripts/proposal-reviewer.mjs`,
`@agentplat/assessor-typesafe`, and the bounded runner in `run.mjs`. Local
contract tests run with:

```sh
pnpm --dir examples/rooms-api test:proposal-review
pnpm --filter @agentplat/assessor-typesafe test
node --test experiments/jev-artifact-review/run.test.mjs
```

Those commands verify deterministic fixture behavior and adapter transport
contracts only. They do not run an empirical model evaluation.

Prepare an access-controlled dataset outside the repository with this schema;
the rubric digest must match the checked-in review rubric:

```json
{
  "schemaVersion": 1,
  "rubricVersion": 1,
  "rubricDigest": "sha256:bcbefde8e4681a8109edbe3b97c5322e5bf9b7b4fd6bd2515678dca13a7603cd",
  "adjudication": {
    "status": "adjudicated",
    "reviewerCount": 2,
    "conflictsResolved": true
  },
  "cases": [
    {
      "id": "deidentified-case-1",
      "version": 1,
      "content": "<proposal text kept outside this repository>",
      "strata": { "language": "en", "challenge": "direct" },
      "expected": {
        "weekly_human_review": true,
        "stop_after_four_weeks": false
      }
    },
    {
      "id": "deidentified-case-2",
      "version": 2,
      "content": "<second proposal text kept outside this repository>",
      "strata": { "language": "es", "challenge": "paraphrase" },
      "expected": {
        "weekly_human_review": false,
        "stop_after_four_weeks": true
      }
    }
  ]
}
```

Run separate arms against the same file and save outputs to a secure directory.
The runner refuses datasets without the rubric digest, adjudication metadata,
language and challenge strata. It reserves a new output path before any provider
request, writes a `running` marker, and atomically replaces it with either a
completed or failed record. Existing output files are never overwritten.
It records dataset digest, per-case labels/signals, model, usage, p50/p95
latency, confusion metrics, Brier/reliability-bin output for Jev, approximate
95% intervals, per-language/challenge summaries, observed usage cost and spend
reservation; it never copies proposal text into results. Dataset and output
case IDs must be deidentified.

```sh
node experiments/jev-artifact-review/run.mjs \
  --dataset /secure/path/heldout.json \
  --output /secure/path/rules.json \
  --provider rules
```

The Jev arm also requires a pinned model, TypeSafe key, and explicit token and
spend limits. Export these variables through the evaluation host's secret
manager, review current model pricing, then build the source-only adapter:
`TYPESAFE_API_KEY`, `TYPESAFE_MODEL`, `TYPESAFE_MAX_SPEND_USD`,
`TYPESAFE_INPUT_PRICE_USD_PER_MILLION_TOKENS`, and
`TYPESAFE_MAX_INPUT_TOKENS_PER_CALL`. The client shares one cumulative cap over
the whole run.

```sh
pnpm --filter @agentplat/assessor-typesafe build
node experiments/jev-artifact-review/run.mjs \
  --dataset /secure/path/heldout.json \
  --output /secure/path/jev.json \
  --provider jev
```

Build the model adapter before its first run:

```sh
pnpm --filter @agentplat/model-openai-compatible build
```

The structured LLM arm uses AgentPlat's OpenAI-compatible Model Adapter with
`STRUCTURED_LLM_API_KEY`, `STRUCTURED_LLM_BASE_URL`, `STRUCTURED_LLM_MODEL`,
`STRUCTURED_LLM_MAX_SPEND_USD`,
`STRUCTURED_LLM_INPUT_PRICE_USD_PER_MILLION_TOKENS`,
`STRUCTURED_LLM_OUTPUT_PRICE_USD_PER_MILLION_TOKENS`,
`STRUCTURED_LLM_MAX_INPUT_TOKENS_PER_CALL`,
`STRUCTURED_LLM_MAX_OUTPUT_TOKENS_PER_CALL`, and
`STRUCTURED_LLM_MAX_REQUEST_BYTES`. It requests JSON mode, sets a completion
token ceiling, and validates exactly two boolean answers. Its cumulative spend
cap reserves the configured input and output cost before sending. This estimate
assumes the endpoint honors its completion-token limit and supplied rates;
over-limit usage is detected after response but cannot reverse a provider
charge. Keep this arm on the same held-out data and rubric:

```sh
node experiments/jev-artifact-review/run.mjs \
  --dataset /secure/path/heldout.json \
  --output /secure/path/structured-llm.json \
  --provider structured-llm
```

Compare completed arms pairwise. The comparison tool refuses different dataset,
rubric, case order or labels; it reports candidate-minus-baseline latency/cost
and paired bootstrap accuracy intervals globally and by language/challenge
stratum. Positive accuracy difference favors the candidate; negative latency
or cost difference favors the candidate.

```sh
node experiments/jev-artifact-review/compare.mjs \
  --baseline /secure/path/rules.json \
  --candidate /secure/path/jev.json \
  --output /secure/path/rules-vs-jev.json
```

No Jev calls may be made until a TypeSafe key is configured on the evaluation
host and an explicit spend cap is recorded. The adapter's client reserves a
configured maximum input-token limit times the current per-million-token price
and maximum attempt count before each call; failed attempts consume the local
reservation. It also rejects payloads whose UTF-8 byte length exceeds that
token bound; this is conservative and does not model provider-side overhead.
Recheck the model's current context size and pricing first and configure
headroom. Use the smallest pilot batch; do not place real customer artifacts or
credentials in repository fixtures.
Archive raw outputs in access-controlled storage and commit only de-identified,
aggregate results with provenance and digests.

At protocol preparation on 2026-09-23, TypeSafe documented Jev 1.13 at
$0.042 per million input tokens, with output tokens free, a 64k total request
context, and English as its strongest language. Limits may change; verify the
[current model and pricing page](https://docs.typesafe.ai/models) and the account
terms before setting a spend cap. Record the resolved model id and observed
usage from each response. The vendor price is a planning input, not an AgentPlat
cost guarantee.

## Results and artifacts

No adjudicated dataset has been supplied; no model scores, latency distributions,
reviewer results or quality claims have been collected. Runner tests use
synthetic cases to exercise serialization, redaction, metrics and spend limits;
they are not evidence of model quality. No data should be inferred from the
Docker integration run, TypeSafe's vendor benchmarks, or the demo output.

## Interpretation and limits

The proposal review report is advisory and version-bound. The existing Room
approval remains a separate human decision. A passing pilot may justify a
product experiment; it cannot support a general AgentPlat production guarantee.

[Back to experiments](../README.md)
