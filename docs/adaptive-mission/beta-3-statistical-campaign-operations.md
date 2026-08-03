# Beta 3 statistical campaign operations

This runbook defines the registered scale campaign for the opt-in planning and
resilience surfaces. It does not make a production-capacity claim and does not
turn the compact three-peer package consumer into a 500-peer runtime test.

## Registered ladder

Every campaign registration fixes the source revision, package versions,
environment, monitor, policy, seed set, topology seed, scale, stratum, fault
matrix and stopping rule before its first sample. The closed ladder is:

| Agents | Directed outdegree | Directed edges | Interaction ceiling | Paired seeds per stratum |
| ---: | ---: | ---: | ---: | ---: |
| 50 | 6 | 300 | 1,000 | 10 |
| 100 | 7 | 700 | 1,600 | 10 |
| 250 | 8 | 2,000 | 3,000 | 10 |
| 500 | 9 | 4,500 | 5,000 | 30 |

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

## Planned nightly, manual and release execution

The repository does not yet claim that this workflow exists or that the
normative campaign has run. A future scheduled/manual workflow may run the 50-
and 100-agent registered cells with exact replay and publish only diagnostic
artifacts. The future normative campaign is a release operation, sharded by the
4 scales and 4 strata. A paired seed runs
adaptive and centralized configurations, then exact replay for both. The full
ladder therefore contains 240 paired seeds and 960 executions:

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
