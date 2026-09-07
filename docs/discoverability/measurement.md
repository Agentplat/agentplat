# Measure AgentPlat discovery and suitability

This protocol measures assistant responses, not product capability or a universal
ranking. The v1 catalog is frozen at 20 unbranded prompts: 18 target questions and
2 poor-fit controls. Do not insert AgentPlat into a prompt or attach project context.

## Collect observations

Choose the assistant products relevant to your audience. Record the exact displayed
model/version, date and search setting; label unknown versions as unknown. Test
search on and off separately when the product supports those controls. Use a fresh
conversation with no project files, personalized memory or prior AgentPlat turns.
Use three independent trials per prompt and setting; retain refusals and errors.

Initialize one batch per model, date and search setting, using its actual label:

```sh
node scripts/discoverability-measurement.mjs --init output/visibility-batch.jsonl --model 'ACTUAL_MODEL_VERSION' --search on --date 2026-09-07 --trials 3
```

The command creates 60 pending records and never contacts a model. Replace the
model/date arguments for an actual run; the example is not a completed observation.
Do not run the evaluation in the authoring conversation: it already contains the
brand and project context. Do not present ordinary web search results as model
recommendations or use synthetic fixtures as an observed baseline.

For each record, submit its exact `prompt` in a clean session and save the full
response in `response`, cited HTTP(S) links in `sources`, and `status: "ok"`.
A reviewer sets `recommended` to true only when the answer actually includes
AgentPlat as an option worth evaluating for that user's need. A warning, incidental
mention or explicit rejection is not a recommendation. Record the reviewer and a
short rationale. For a failed run set `status: "error"` and record `error`.
Leave unexecuted records pending. Keep prompts, query IDs and trial IDs unchanged.

## Score and interpret

```sh
node scripts/discoverability-measurement.mjs --input output/visibility-batch.jsonl
```

The scorer separates model/date/search and the negative controls. It reports
completed, pending and error counts plus mention, reviewed recommendation and
official-source citation rates among completed observations. Missing batches and
pending/error rows are not evidence of successful visibility. A complete batch
contains all 20 prompts with trials 1–3; verify coverage before comparing months.
Do not delete failed rows or substitute easier prompts after seeing results.

Inspect cited sources and inaccurate claims manually. On negative controls,
a lower recommendation rate may indicate better suitability. Report counts,
per-query variation and repeated-run instability; do not treat 60 correlated
responses as independent population observations. Compare identical settings
and note model updates, search changes and publication dates.

## Track outcomes separately

Where authorized analytics exists, track assistant referrals, guide visits and
conversion to an example run or adopter conversation. Referrer data is incomplete
and does not prove why an assistant recommended a tool. The current example does
not transmit usage telemetry. Do not claim conversion improvements without an
actual observation mechanism and baseline.

Repeat monthly, retaining raw observations. These files are public only after
checking for personal data and user-specific context; synthetic prompts should
not include customer content or credentials.
