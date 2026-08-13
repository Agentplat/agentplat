# AgentPlat `0.3.0-beta.3` Increment 9 review

## Status

Increment 9 adds the bounded operational boundary for statistical-campaign
diagnostics and expands the coordinated open-source catalog to 38 packages with
the Node-local `@agentplat/mesh-sim-local` adapter. It does not execute a
normative campaign, publish a package,
deploy an AgentPlat service or make a statistical/pass-rate claim. The workflow
calls `scripts/collective-beta3-campaign-executor.mjs`; the executor owns the
strict command-line validation and artifact production described here.

The portable execution contract has deterministic four-slot cells, revision
CAS, fenced leases, monotonic reclaim generations and terminal state per slot.
The simulation executor commits an immutable record before settlement and
resumes that record after a crash. The local adapter durably stores execution
state through revision CAS and supplies SHA-256 content storage, immutable slot
commits, explicit campaign and mutation locks, and verifier-gated bundle
publication. Aggregation refuses anything except exact registered closure and
produces the existing public verifier format.

## Diagnostic-only automation

The `collective-statistical-diagnostic.yml` workflow has a weekday schedule and
`workflow_dispatch`. Its closed matrix contains only 50 and 100 agents and the
four registered strata. Scheduled runs use at most two paired seeds in every
one of eight scale/stratum shards. Manual execution can narrow to one scale,
one stratum or all strata, and one or two seeds. Each paired seed contains both
runners and their exact replays.

The strategy caps concurrency at two shards, gives validation 15 minutes, each
diagnostic shard 25 minutes and collection 20 minutes. A concurrency group per
Git reference cancels an older in-progress diagnostic run when a newer one
starts. Cancellation is observable, not silently repaired: registration and any
files written before termination are uploaded with `if: always()`, and a later
workflow attempt creates a new evidence identity. One explicit execution
identity is shared by all shards in an attempt and is validated again by the
collector.

## Artifact and closure handling

Each shard writes its registration before any sample. Shard artifacts and the
collector result have a 14-day retention period. The collector runs even if a
shard fails or is cancelled, downloads every available shard for that run, and
asks the executor to validate the expected closure. A missing or changed shard
therefore yields a failed diagnostic result rather than a partial success.
Even a manually narrowed run validates every artifact against the registered
cell, expected execution identity, deterministic `runKey`, runner and attempt;
count equality alone is never treated as closure.

Artifacts are limited to the public evidence boundary: registration, manifest,
public traces, interaction ledgers, monitor outcomes and digests. They must not
contain secrets, raw prompts, private reasoning or hidden world state.

## Security and operational scope

The workflow has only `contents: read`; it contains no secrets, cloud-provider
credentials, application deployment, package publication or registry login.
GitHub Actions workers and their artifact store are used only as ephemeral
diagnostic compute and retention. The workflow actions are commit-pinned.

The existing `verify:pack` gate remains the package-consumer proof: it runs the
same resilience conformance consumer against coordinated tarballs in isolated
pnpm and independent npm installations. It remains in ordinary CI rather than
being repeated by every diagnostic shard, which keeps the scheduled cost
bounded.

The new local adapter is included in that coordinated tarball cohort. Its
packed root import and declarations are compiled from an isolated consumer, in
addition to focused store and executor tests.

## Release boundary

The 250- and 500-agent rows, the 240-pair/960-execution ladder, threshold
analysis and release-evidence promotion remain outside this workflow. They need
a distinct, protected release operation and cannot reuse a nightly or manual
diagnostic artifact as acceptance evidence.
