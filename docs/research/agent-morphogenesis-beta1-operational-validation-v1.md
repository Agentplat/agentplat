# Agent Morphogenesis Beta 1 operational validation V1

Status: planned, not executed. This document authorizes no deployment, paid
provider call, protected external effect or production-readiness claim.

## Objective

Validate the first bounded AgentPlat Agent Morphogenesis vertical slice against
real PostgreSQL durability, real Temporal wakeups and retries, and a
multi-process AgentPlat Agent Mesh. The campaign covers both `recruit_existing`
and `catalog_created`, with decisions made by an authorized agent, an
authorized person, or a certified collective. A person is therefore one valid
decision route, not a mandatory approver.

The machine-readable contract is
`config/agent-morphogenesis-beta1-campaign-v1.json`. A generated campaign must
bind it to one exact clean commit before any scenario receipt is admitted.

## Evidence ladder

The campaign keeps these states separate:

1. source capability: the APIs, adapters and deterministic tests exist;
2. conformance: the registered scenarios pass their exact invariants;
3. experimental evidence: measurements were actually collected;
4. operational readiness: the declared local topology met its release gates;
5. production claims: remain forbidden by this campaign.

A successful local run cannot be reported as production scalability, security
certification or universal organizational improvement.

## Campaign matrix

Every vertical slice runs through all three decision routes in a nominal case.
Fault scenarios then exercise every material boundary named in the contract,
plus partition, concurrent proposals, stale authority, attempted self-approval
and colluding decision actors. The campaign must retain rejected and incomplete
runs; it cannot report only successful samples.

The independence rule is actor-neutral. When policy requires independence, the
decider may be an agent, person or collective, but cannot be the prohibited
proposer, beneficiary or equivalent independence group. The self-approval and
collusion cases must fail closed without advancing the morphology head.

## System composition

- PostgreSQL owns Workflow state, morphology heads and Morphogenesis execution
  records through the existing stores. A reopened process must observe the same
  digest and revision.
- Temporal owns wakeups, activity retries, timers and history rollover. It does
  not reconstruct authority or become the canonical state store.
- Agent Mesh carries authority-neutral projections and collective decision
  evidence across separate peer processes. Partition recovery must not create a
  second accepted morphology head.

No parallel factory, membership protocol, Workflow runner or global scheduler
may be introduced for the campaign.

## Measurements and acceptance

Each scenario records wall time, provider-reported input/output tokens,
estimated cost, morphology churn, mission continuity and duplicate material
effects. No model use is required for the local reference campaign; absent
model calls must be recorded as zero, not inferred.

Acceptance requires zero duplicate material effects, zero unauthorized
activations, exact replay of completed scenarios, fail-closed stale authority,
and enforced decision independence. External spend is capped at USD 0.

## Evidence custody

Before execution, generate a source lock, registration, scenario manifest and
environment manifest outside the checkout. During execution, append immutable
scenario receipts and metric records. Closure produces a content-addressed
bundle and report. Signing is optional, but a signed bundle must bind the exact
source commit, contract digest, environment digest and complete receipt root.

The planning command is intentionally non-executing:

```sh
pnpm run plan:agent-morphogenesis-beta1-campaign -- \
  --source-sha <clean-commit> \
  --output-directory <absolute-directory-outside-checkout> \
  --confirm DO_NOT_RUN
```

It accepts an exact clean tracked tree, excludes untracked files from the Git
source binding, writes every file with create-only semantics and retains no
credentials. Planning always records `authorizationStatus: not-issued`,
`executionPermitted: false` and `resultsStatus: not-collected`.

The frozen collective capability V1 baseline remains unchanged. Profile
synthesis, recursive agent creation and Team split/merge/federation are outside
Beta 1.

## Diagnostic preflight

After building the relevant packages, run `pnpm run
preflight:agent-morphogenesis-beta1`. It checks the exact commit, clean-tree
requirement, PostgreSQL and Temporal TCP reachability, and the required built
adapters and example harnesses. It is read-only and emits neither a campaign
authorization nor empirical evidence. `--diagnostic-only` reports all gaps
without a non-zero readiness exit.

`pnpm run verify:agent-morphogenesis-beta1-postgres-nominal` runs the six
branch/decision-route combinations against disposable schemas on a real
PostgreSQL server. It reopens and revalidates each completed execution record,
then removes only its randomly named schema. This is diagnostic conformance:
it deliberately emits no registered receipt bundle and does not claim exact
scenario replay, Temporal composition or Agent Mesh behavior.

When a local Temporal development server is already running, `pnpm run
verify:agent-morphogenesis-beta1-temporal-postgres-nominal` executes the same
six cases through `TemporalProcessRunnerV1`. PostgreSQL remains authoritative;
each Temporal Workflow invokes the bounded advance activity and reaches its
terminal state before the disposable schema is removed. This command remains
diagnostic until a clean-commit registration admits its receipts.

The existing `pnpm run example:mesh-multiprocess` harness also carries the
content-addressed Morphogenesis need projection over the signed Mesh Evidence
family. One peer publishes an `evidence.claim`; three independent peer processes
publish supporting attestations for a four-validator BFT profile. Delivery is duplicated deliberately and the
same run exercises forced and rolling restarts, timeout after remote commit,
overload retry and message reordering. These records are evidence inputs only:
the harness asserts `morphogenesisAuthorityGrantedByTransport: false`; a
separate current decision mandate or collective certificate remains required.
The harness then maps a separately verified application certificate through
`CollectiveAgreementMorphogenesisDecisionIssuerV1`; three distinct supporters
produce an inert collective authorization, while a simulated minority
partition exposing only one supporter produces no authorization.

`pnpm run verify:agent-morphogenesis-beta1-adversarial` executes the twelve
non-nominal scenario bindings as source-conformance diagnostics. With
`--output-directory <external-directory>` it writes create-only
`scenario-receipts.jsonl`, `metrics.jsonl` and
`adversarial-diagnostic-summary.json`. Receipts distinguish direct from
indirect evidence. Indirect evidence is reported as `coverage-gap`; churn,
continuity and duplicate-effect values are explicitly marked as derived
source-conformance measurements rather than operational observations. A failed
test retains `null` where no valid measurement exists. The summary is never
eligible for campaign closure or a readiness claim.

`pnpm run verify:agent-morphogenesis-beta1-early-crashes` requires running
PostgreSQL and Temporal endpoints. It stops and replaces the Temporal worker
while the PostgreSQL-backed fixed Workflow is (a) waiting at the decision gate
after proposal and (b) holding an approved decision with `prepare` ready but
unexecuted. The replacement worker reopens the exact state digest and completes
the same Morphogenesis receipt without duplicate material effects. This closes
the direct diagnostic coverage gaps but remains non-registered evidence.

`scripts/agent-morphogenesis-beta1-bundle.mjs --mode assemble-diagnostic`
replaces the two weak crash receipts and the source-only partition receipt with
their PostgreSQL/Temporal and multiprocess Mesh counterparts. It rejects a
missing, duplicate or unexpected scenario, non-numeric required metrics,
duplicate material effects and mixed source commits. Closure writes exactly 18
ordered receipts, 18 metric records, an unsigned-but-firmable content-addressed
bundle and a Markdown report. `--mode verify` recomputes every receipt digest,
both roots, the scenario order and the bundle digest.
