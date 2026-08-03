# Beta 3 statistical campaign operations

This runbook defines the registered scale campaign for the opt-in planning and
resilience surfaces. It does not make a production-capacity claim and does not
turn the compact three-peer package consumer into a 500-peer runtime test.

## Registered ladder

Every campaign registration fixes the source revision, package versions,
environment, monitor, policy, seed set, topology seed, scale, stratum, fault
matrix and stopping rule before its first sample. The closed ladder is:

| Agents | Directed outdegree | Directed edges | Interaction ceiling | Paired seeds per stratum |
| -----: | -----------------: | -------------: | ------------------: | -----------------------: |
|     50 |                  6 |            300 |               1,000 |                       10 |
|    100 |                  7 |            700 |               1,600 |                       10 |
|    250 |                  8 |          2,000 |               3,000 |                       10 |
|    500 |                  9 |          4,500 |               5,000 |                       30 |

The topology always includes a directed ring, then uses the registered seed to
select unique additional directed neighbors. It has exactly
`N × ceil(log2(N))` edges and no self edge. A seed change is a new registered
topology, not a retry of an old sample.

The strata are closed: `nominal`, `benign`, `adversarial` and `mixed`.
Nominal registers no injected resilience fault. Every non-nominal row registers
the exact six-family matrix: capability withdrawal, assignment decline, peer
crash, peer restart, directed network partition and directed network heal.
Observed coverage must exactly equal the registered row. A missing, extra or
substituted family invalidates the sample; failures remain in the manifest and
are never omitted.

## Daily smoke and package consumers

The daily gate is deliberately small: it materializes two registered 50-agent
seeds for each of the four strata (eight cells). Unit fixtures close the four
expected execution slots per cell (adaptive and centralized, first and replay)
and reject an omitted or relabeled slot. The command validates registration,
deterministic topology, scale-specific budget and registered fault coverage
without running 50 agents. It is a contract smoke, not execution evidence or a
statistical result. Its source and package commitments come from the current
Git commit/tree, lockfile blob and package version; a dirty local run is
reported as such and is never release evidence.

The pnpm/npm tarball consumer remains the compact three-peer conformance smoke.
It may import and validate scale configuration, but it must not allocate or run
the 50/100/250/500 campaign ladder. This keeps package-install coverage quick
and independent from expensive campaign evidence.

## Diagnostic workflow and release execution

`collective-statistical-diagnostic.yml` is a bounded GitHub Actions diagnostic,
not a platform deployment or a release trigger. It runs on weekdays and can be
started manually. It has only `contents: read` permission; it does not receive
publish, registry, cloud-provider or application credentials.

The scheduled path runs eight independent shards: the 50- and 100-agent rows
times all four closed strata. Each shard has at most two paired seeds, and a
paired seed has adaptive and centralized first/replay executions. That caps a
scheduled run at 16 paired seeds, 64 executions and 83,200 registered
event-derived interactions. The matrix has `max-parallel: 2` and each shard has
a 25-minute timeout. A manual run selects only one of 50 or 100 agents, one
closed stratum or all four, and one or two paired seeds. The executor rejects
any other scale, stratum, seed count or mode; workflow inputs are not the
security boundary.

Every shard writes its registration before execution. Its output is uploaded
after a caught failure and retained for 14 days. A hard cancellation or timeout
can stop before a shard summary is written, but the prewritten registration and
any immutable local commits remain uploadable. The collector always runs, uses
the registered expected-cell closure to reject a missing, duplicate or changed
shard, and uploads its diagnostic result for the same 14 days. A later workflow
attempt has a new evidence identity and never fills or relabels a cancelled
attempt. Within one surviving shard process, rerunning the same command resumes
committed slots and its revision-CAS execution state by deterministic `runKey`.
Every workflow attempt supplies one explicit execution identity shared by all
of its shards; retries use a different identity and cannot absorb old commits.

GitHub-hosted execution and Actions artifact storage are used only for bounded
diagnostic data. No AgentPlat service, cloud workload or registry package is
deployed. Diagnostic artifacts must contain public traces, interaction ledgers,
monitor verdicts and registered digests only; they exclude raw prompts, private
reasoning, secrets and hidden world values. A cancelled, partial or failed
diagnostic run is not release evidence and cannot satisfy any acceptance
threshold.

The diagnostic executor uses the real nominal and resilience reference
runtimes at the selected peer count. Its first/replay slots retain public trace
events, replay-derived interaction ledgers, public observations, invariant
monitor verdicts and digest-only protected evidence. This reference runner is
explicitly marked `diagnosticReferenceRunner: true`: it exercises orchestration,
resumption and evidence closure, but it is not the normative registered
statistical runner and every output keeps `releaseEvidence: false`.

The local adapter stores execution records and collected artifacts in a bounded
SHA-256 content-addressed directory. Slot commits are immutable and
idempotent, execution and lease transitions use a durable revision CAS,
conflicting commits fail closed, and the collector accepts a full scheduled
closure only if the source lock is clean. A complete scheduled
diagnostic can produce a verifier-compatible bundle, but the bundle remains
diagnostic and cannot cross the release boundary.

The local root must be private to the running operator. All fixed directory
segments are rechecked against symbolic links on every operation. A process
never steals a campaign or mutation lock by age. After proving that no writer
still owns a stranded mutation lock, an operator first calls
`inspectMutationLockV1()` and then supplies that exact `lockId` to
`recoverMutationLockV1(lockId)`; a missing or changed identity fails closed.

The normative campaign remains a separate release operation, sharded by the
4 scales and 4 strata. A paired seed runs adaptive and centralized
configurations, then exact replay for both. The full ladder therefore contains
240 paired seeds and 960 executions:

- `3 smaller scales × 4 strata × 10 paired seeds = 120 pairs`;
- `500 agents × 4 strata × 30 paired seeds = 120 pairs`; and
- every pair has four executions: adaptive, centralized and both replays.

When its real adapter is registered, the workflow must write each shard
registration before execution and
emit an expected-cell
manifest. The final evidence merge refuses a missing cell, a changed digest, a
failed replay or a sample relabeled as infrastructure-invalid. Evidence includes
the public trace, interaction ledger, monitor verdict, topology and fault
matrix digests; it excludes raw prompts, private reasoning, secrets and hidden
world values.

Increment 10 adds a separate protected control-plane workflow,
`collective-statistical-normative.yml`. It is manual only and requires the
exact `RUN_NORMATIVE_240X4` confirmation for execution plus immutable source
commitments; its safe plan mode accepts `DO_NOT_RUN`. The plan mode writes the
public-contract-valid 240-cell/960-slot registration, operation plan, expected manifest and the
3,296,000-interaction ceiling before any adapter lookup, retaining that record
for 90 days. Its execute, collection, analysis and attestation modes are
deliberately fail-closed until a real normative adapter is registered. A
single protected gate records that condition before the 48-shard matrix, so a
blocked request does not allocate 48 runners. The
diagnostic and synthetic runners are explicitly unacceptable. The protected
environment gates those future stages, but does not grant deploy, publish, tag,
cloud or secret authority.

Execution authorization is detached Ed25519 evidence bound to the exact plan,
source, adapter, audience, expiry, shard set and five-cells-per-shard budget.
The adapter commits separate runner-implementation and evaluator digests; a
trusted registry resolves both ports by those exact commitments and every
projection must match the evaluator. The authorization statement commits its
credential identity but excludes the detached signature from execution
identity. Durable execution identity is derived from the plan and stable
authenticated authorization digest, while workflow reruns
also include `run_attempt`, preventing evidence from another plan, credential
or attempt from filling current closure. Artifact custody has hard public caps
of 16 MiB per artifact, 256 MiB total and 16,384 artifacts.

## Campaign readiness

`collective-campaign-readiness.yml` is the non-executing decision gate for the
complete campaign. Its `plan` mode accepts only `DO_NOT_RUN`, validates an
exact main-branch commit and writes a registered operation plan, a capacity
estimate and three repository-owned planning receipts. It cannot invoke the
campaign runner.

The fixed capacity estimate is deliberately conservative:

| Resource                   | Registered ceiling |
| -------------------------- | -----------------: |
| Cells / slots / shards     |     240 / 960 / 48 |
| Concurrent shards          |                  2 |
| Event-derived interactions |          3,296,000 |
| Trace events               |         96,000,000 |
| Execution artifact bytes   |             15 GiB |
| Shard runner-minutes       |              8,640 |
| Readiness runner-minutes   |                170 |
| Paid model calls           |                  0 |

These are capacity and timeout ceilings, not forecasts. The public estimate
does not contain a currency or monetary value. A later operator must bind a
rate card to the exact estimate before granting execution authority.

The `assess` mode requires `RUN_READINESS_CHECKS` and the run ID of a completed
`collective-statistical-registered-preflight.yml` operation for the same source
and campaign ID. It downloads only that run's public receipts with the
workflow's read-only Actions token. The verifier requires exactly one initial
twenty-slot execution and one twenty-slot recovery/resume receipt, identical
projection roots and exact source, registration, plan, adapter and
authorization commitments. Unit tests cannot substitute for this protected
closure.

The remaining jobs verify locally packed Node 20 and Node 22 consumers, a
locally packed PostgreSQL conformance consumer, privacy/canary boundaries,
pre-dispatch evidence behavior, retention/indeterminate safety, causal
replanning and a live production dependency audit. They upload digest-only
receipts, not raw command logs. The final assessment accepts exactly one
receipt for every closed control ID and derives one of:

- `no_go` when any required receipt is absent or failed; or
- `ready_for_operator_authorization` when all repository-owned prerequisites
  and the protected preflight closure pass.

Neither result contains execution authority. Both retain
`executionPermitted: false` and `fullCampaignPermitted: false`. Statistical
outcomes remain pending until the campaign runs, and registry/tag outcomes
remain pending until publication.

For a main commit, run the protected preflight first with the same campaign ID
and source SHA. Then dispatch the readiness workflow in `assess` mode with that
preflight workflow run ID. A cross-source or differently planned preflight is
rejected even if its workflow concluded successfully.

## Acceptance analysis

The release evidence must show no authorization, plan-authority, stale-fence,
duplicate-effect, evaluation-integrity or exact-replay violations. Every sample
must stay within its registered interaction ceiling and the 500-agent row must
not exceed 5,000 event-derived interactions.

The registered analysis policy is `collective-normative-analysis-v1`. Each of
the nominal and benign endpoints has the fixed 60-seed denominator. Acceptance
uses the one-sided 95% Wilson lower bound (`z = 1.6448536269514722`): at least
`0.95` for nominal and `0.90` for benign. The ordinary two-sided 95% Wilson
interval (`z = 1.959963984540054`) is reported only as a descriptive interval;
this distinction is necessary because its lower bound for 60/60 is below
`0.95`.

The paired collective-minus-baseline success delta uses exactly 10,000
domain-separated xorshift32-v1 percentile-bootstrap resamples. Its 2.5th
percentile must be at least `-0.05`. The one-sided add-one p-value tests the
registered null `mean delta <= -0.05`; the fixed Holm family is exactly
`nominal.pairedSuccess` and `benign.pairedSuccess`, ordered by p-value then
ASCII endpoint ID, and both nulls must be rejected under sequential alpha
`0.05`. Failure of either the interval gate or Holm gate is ineligible.

Benign p95 recovery/replanning uses the nearest-rank observation at
`ceil(0.95n)` and must be at most 250 interactions. Healthy affected
participants must reach at least 95% semantic-slot agreement within
`min(1,000, 2N)` event-derived interactions after the registered heal or
quiescence point. Role coherence requires exactly 1,000 evaluator-derived
decisions, no unsafe executable decision and a useful-decision rate of at
least `0.70`. Missing first/replay projection closure returns `incomplete`
before bootstrapping; no runner-supplied score or boolean enters this decision
path.

Adversarial and mixed strata report safety, failure and recovery outcomes. They
do not support an unqualified performance or superiority claim.
