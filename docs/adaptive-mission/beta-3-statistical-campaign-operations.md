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

That future workflow must write each shard registration before execution and
emit an expected-cell
manifest. The final evidence merge refuses a missing cell, a changed digest, a
failed replay or a sample relabeled as infrastructure-invalid. Evidence includes
the public trace, interaction ledger, monitor verdict, topology and fault
matrix digests; it excludes raw prompts, private reasoning, secrets and hidden
world values.

## Acceptance analysis

The release evidence must show no authorization, plan-authority, stale-fence,
duplicate-effect, evaluation-integrity or exact-replay violations. Every sample
must stay within its registered interaction ceiling and the 500-agent row must
not exceed 5,000 event-derived interactions.

For nominal samples, the Wilson lower bound for mission success is at least
`0.95`; for benign samples it is at least `0.90`. The paired
collective-minus-baseline interval lower bound is at least `-0.05` for nominal
and benign strata. Benign p95 recovery/replanning is at most 250 interactions,
and healthy affected participants reach at least 95% semantic-slot agreement
within `min(1,000, 2N)` event-derived interactions after the registered heal or
quiescence point.

Adversarial and mixed strata report safety, failure and recovery outcomes. They
do not support an unqualified performance or superiority claim.
