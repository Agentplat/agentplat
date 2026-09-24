# Optional Jev integration — implementation plan

Status: implementation in progress. ADR 0055, an optional structured decision
client and Controlled Agent Assessor adapter, a local/jev proposal review
example, and a three-arm evaluation runner are present. The adapter is
source-only pending a future coordinated release. A held-out adjudicated data
set and comparative run remain outstanding.
Prepared 2026-09-23.

## Product outcome

Let application developers evaluate work with their chosen implementation and
use those evaluations in governed processes. Jev is one optional implementation.
AgentPlat remains usable without TypeSafe credentials, dependencies or network
calls. The first demonstration reviews a proposal artifact and surfaces
version-bound evaluation signals to its human reviewer.

Success means less integration code for developers and, if measured, less human
review effort without an unacceptable increase in missed problems. Installing
another provider alone is not the product outcome.

## Architecture decisions

- Reuse `ControlledAgentAssessorV1` from
  `packages/inference-control/src/runtime.ts` for the first adapter. It already
  supports `allow`, `deny`, `abstain` and `escalate`.
- Package: `@agentplat/assessor-typesafe`, under
  `packages/assessor-typesafe`. It composes a portable assessor port as required by
  [ADR 0045](../adr/0045-platform-adapter-admission-boundary.md).
- Keep provider request/response types, credentials and transport inside that
  adapter. Do not change the chat-model contract to simulate text generation.
- The application supplies the bounded state projection, typed questions and
  versioned mapping from answers to disposition/reason code. Business rubrics,
  taxonomies and thresholds belong in examples or applications.
- Existing AgentPlat policy, action and Room approval owners retain authority.
  An assessor's `allow` does not grant an action capability or human approval.
- Do not add a second generic decision framework. Any shared convenience helper
  must demonstrate a missing capability in existing ports and work with a local
  deterministic evaluator as well as Jev.
- Keep evaluation optional and activation explicit. No default vendor import
  from core, Rooms, workflows or the framework facade.

## Delivery sequence

### 1. Contract and provider feasibility — initial decision recorded

ADR 0055 records the boundary and the adapter is registered in the public
package catalog and adapter admission record. The TypeScript SDK 0.6.0 is MIT
licensed, supports Node.js 20+, typed questions, injected fetch, per-attempt
timeouts and cancellation. Its retry policy can honor bounded Retry-After
delays. The adapter pins this SDK version, requires an explicit API key and
places a total deadline around the SDK request. Revisit the decision if SDK,
API or license review changes these assumptions.

- Recheck current TypeSafe HTTP API, JavaScript SDK, license, runtime support,
  model selection, cardinality/context limits, error semantics and cancellation.
  The documentation index lists a JavaScript SDK; inspect it before choosing
  between an isolated SDK dependency and a small HTTP implementation.
- Provide a generic structured decision client and compose it into the factory
  implementing `ControlledAgentAssessorV1`; applications supply request and
  mapping policy while transport, credentials, model, timeout and retry budget
  remain in the optional adapter.
- Bind assessor identity/version and binding digest to the rubric, model
  selection and mapping policy. Record the resolved model version when supplied.
  Prefer a fixed supported model version for reproducible evaluations; treat
  moving aliases as a reproducibility limitation.
- Provide an optional content-free success/failure evidence sink with resolved
  model/usage when available, target digest, duration, disposition or safe
  failure code. A configured sink failure rejects the assessment.
- Define validation for each supported primitive: declared answer keys and
  types, selected choices, finite probabilities, valid ranges and distribution
  tolerances. Do not silently repair malformed provider answers.
- Preserve distinction between Choice/Score confidence, probability and Noul.
  Confidence must not be advertised as empirical accuracy or automatically
  translated to AgentPlat statistical confidence guarantees.

Acceptance: an explicit mapping exists for success, uncertainty, invalid output,
timeout and provider failure, without changing the portable assessor contract.
The adapter maps successful results through application code and propagates
transport/mapping errors. Fixture tests cover structured requests, mapped
assessment, provider failure and bounded configuration.

### 2. Optional adapter and focused tests — initial implementation present

The package uses provider-independent tests with injected HTTP responses and
an integration test through `ControlledAgentExecutorV1` covering `pre_run` and
`post_run` checkpoints. It bounds structured request/response bytes, total
duration, retry count, concurrent calls and optional spend. Add the remaining
security and adversarial cases before release.

- Support Choice, Score and Noul inside the provider boundary. The mapping
  callback determines how answers produce an existing assessor disposition.
- Bound request size, response size, duration, attempts and concurrency.
  Authentication/configuration failures surface as clear errors. Transient
  failures may retry within a total deadline. No failure becomes `allow`.
- On evaluation failure, propagate a typed error or apply an explicitly
  configured abstain/escalate policy. Observation mode preserves the underlying
  workflow behavior while recording evaluation failure.
- Treat source content and model answers as untrusted data. Resolve state only
  through application-authorized context and enforce tenant boundaries.
- Keep keys and raw content out of default logs. Retained evidence includes
  request/target digests, assessor/rubric/policy versions, resolved model,
  disposition, reason code, timing and available usage metadata. Rich answers
  may be stored through an application-owned access-controlled sink; shared
  control records retain references/digests rather than provider payloads.
- Reuse existing durable invocation/receipt ownership when connected to durable
  execution. Test that a committed assessment is reused on replay. A crash before
  commit may require another paid call; do not claim exactly-once inference.
- Test response corruption, missing/extra answers, cancellation, 429/5xx,
  exhausted retries, ambiguous answers, cross-request evidence reuse and
  binding mismatch. Cover malicious content attempting to change policy.

Acceptance: focused tests, package build and public type checks pass. Importing
portable AgentPlat packages requires neither TypeSafe nor credentials. Failure
paths cannot bypass existing authorization.

### 3. Provider-swappable product example — initial implementation present

The existing Room proposal demo creates a review artifact for the current
proposal version. Its deterministic text rules are the default; Jev is selected
explicitly by environment configuration. The report presents provider signals
with their distinct semantics and does not change the existing Room approval
path.

- Run by default with a deterministic evaluator and no external inference.
- Allow explicit Jev selection through documented server-side configuration.
- Evaluate a specific artifact version against application-defined requirements
  and supplied evidence. Show criteria signals with their source semantics.
- Bind every report to the exact artifact version and rubric digest.
- Start in observation mode: evaluations do not grant approval or trigger
  automatic correction. The example displays failures and uncertainty clearly.
- Provide developer instructions for substituting their own evaluator using
  the same portable interface. Demonstrate identical workflow integration for
  deterministic and Jev implementations.
- Keep generated explanations separate from evidence. Human-readable summaries
  may be rendered from fixed application templates and structured results;
  do not imply that Jev generates arbitrary review prose.

Acceptance: deterministic and Jev signals use the same review flow and existing
approval path. The offline reviewer tests prove source version binding. A
Docker/PostgreSQL run of `scripts/proposal-demo.mjs` created the advisory review
artifact, separately approved the review and proposal, and completed the Room.
The temporary database stack and volume were removed afterward. A live Jev
provider smoke test remains outstanding because no TypeSafe API key is
configured. A review artifact names the evaluated artifact id and version, so
it cannot silently inherit an earlier version's evaluation.

The controlled-runtime fixture test also injects TypeSafe wire responses into
`TypeSafeAssessorV1`: both `pre_run` and `post_run` pass through the existing
policy binding, and a low assessment disposition yields a denied result with
zero output bytes. This verifies local adapter/runtime composition only; the
provider transport remains simulated in that test.

### 4. Bounded empirical evaluation

`experiments/jev-artifact-review/` contains the protocol and reproducible
three-arm runner for deterministic rules, Jev, and an OpenAI-compatible
structured LLM, with explicit evidence limits following `experiments/TEMPLATE.md`.

- Compare deterministic rules, a structured-output LLM and Jev on the same
  bounded artifact-review task. Report where rules have narrower coverage.
- Use held-out cases with human-adjudicated criteria, including incomplete,
  contradictory, Spanish/English and adversarial inputs. Keep threshold tuning
  data separate from the final evaluation set; report the language/challenge
  strata separately when sample counts support it. The paired comparator checks
  and reports those strata as well as aggregate differences.
- Measure missed material problems, false alarms, abstention/escalation rate,
  coverage versus error, probability calibration, p50/p95 latency and total
  cost including retries/fallback. Report uncertainty and sample counts.
- Measure workflow outcomes separately: human review time and correction rounds
  require an actual reviewer study; model agreement cannot substitute for it.
- Before evaluating, freeze application-specific acceptable error margins and
  the required cost/latency benefit. Do not invent universal confidence cutoffs.
- Start with local fixtures. Live runs need configured account access and an
  explicit spend budget; missing access blocks only live evidence, not coding,
  fixture tests or the offline example.

Acceptance: publish results even if Jev underperforms. Distinguish fixture
conformance, live interoperability and domain outcome evidence. The runner and
paired comparison tool are implemented; their tests use synthetic in-memory
data only. The human-adjudicated dataset, live Jev/structured LLM comparison,
and randomized reviewer study remain outstanding. Preserve the frozen
Collective Capability Baseline denominator.

### 5. Admission, documentation and release readiness

- Register the adapter and declared portable port in
  `config/platform-boundaries.json`. The current catalog marks it source-only;
  change it to publishable only as part of a verified coordinated release.
- Document installation, explicit activation, evaluator substitution, payload
  handling, failure policy, supported model versions and evidence limitations.
- Run focused package/example checks during implementation, then required
  repository checks for the changed surfaces. Admission includes
  `pnpm run verify:platform-boundaries`, applicable public audit, package/type
  checks, adapter tests, pack and public-consumer verification. Run required CI
  and release checks before publication.
- Keep operational maturity separate from package API/distribution status.
  Source tests alone do not establish calibrated decisions or production SLAs.

Acceptance: a developer can opt in, replace or remove Jev without changing
authority semantics. Packaging and required CI pass. Publication remains a
separate release action from preparing or implementing this plan.

## Subsequent scope

After the first adapter and evidence are available, consider a
`SemanticAssessorPortV1` bridge with validated metric semantics and an
`AssessorEnsemblePortV1` bridge. All questions to the same Jev deployment count
as one independence group, not independent votes. Do not fabricate categorical
hard-constraint violations from uncalibrated probabilities.

Automatic correction loops, prioritized review queues and policy-controlled
automatic progression are follow-up product features. They require bounded
iterations, budgets and measured behavior. Planner candidate ranking and
AgentPlat Agent Morphogenesis integration are outside the first delivery.

## Suggested change sets

1. ADR, provider contract fixtures and admission design.
2. Optional adapter, failure behavior and focused tests.
3. Provider-swappable artifact-review example and developer guide.
4. Evaluation protocol, harness and separately labeled live results.
5. Catalog/admission updates and release-readiness evidence.

## Sources and evidence boundary

Reviewed the article, SDK API and JavaScript SDK documentation, confidence
documentation and evaluation methodology. Local fixture tests do not establish
live-provider interoperability or outcome quality.

The current TypeSafe model page identifies Jev 1.13 as $0.042 per million input
tokens, with free output and a 64k request context. These values and rate limits
can change; verify the provider page and account terms before any live run.
The adapter can reserve a caller-configured worst-case input amount, multiplying
the per-call input-token bound by price and maximum attempts before sending.
Reservations are not refunded on request failure.

- [TypeSafe announcement](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
- [Primitives overview](https://docs.typesafe.ai/introduction)
- [Quick start](https://docs.typesafe.ai/introduction/quickstart)
- [Confidence semantics](https://docs.typesafe.ai/confidence)
- [Provider evaluation methodology](https://evals.typesafe.ai/)
- [Current documentation index](https://docs.typesafe.ai/llms.txt)
- [Models, price and context limits](https://docs.typesafe.ai/models)
- [AgentPlat workflow evidence boundary](../workflows/README.md)

No live Jev query or empirical comparison was performed while preparing this
plan. Provider performance claims are not AgentPlat guarantees.
