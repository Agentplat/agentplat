# Agent Morphogenesis local validation — 2026-09-09

Status: local diagnostic checks passed. Active strategy: local execution,
USD 0 external spend, no paid model calls and no minimum elapsed-time gate.
Distributed staging is deferred and is not required for this development check.
Its infrastructure budget is not an authorization to spend on local validation.

## Execution and results

Built the current workspace with `pnpm build`. Used a disposable local
PostgreSQL 16 container and Temporal CLI 1.8.1 / Server 1.31.2 in development
mode with in-memory Temporal persistence. Child processes received a restricted
environment with loopback database/service endpoints and no cloud or LLM keys.
No cloud infrastructure was provisioned. Temporary services were stopped.

- 76 Morphogenesis runtime tests passed (`node --test tests/morphogenesis*.test.mjs`).
- 1,000 deterministic in-memory runs completed in 15.054 seconds, in batches of
  four, across recruit/create and agent/person/quorum decision routes. Every
  run reached `completed` with a receipt digest. These are not 1,000 persistent
  distributed executions.
- Six nominal PostgreSQL/Temporal routes passed, including state reopening.
- All six execution crash boundaries passed, including material-effect recovery.
- PostgreSQL morphology-head and budget concurrency, connection-loss recovery
  and tenant/mission isolation checks passed.
- Four Agent Mesh identities started six local processes. Minority partition
  and dependent-actor collusion were rejected; final inbox/outbox queues were
  empty, with zero correctness violations and duplicate material effects.
- Authorization expiry and key rotation passed, using ephemeral local keys.
- The supervisor CLI lifecycle/replay test passed in a temporary clean Git
  snapshot. This is not a completed readiness-supervisor restart/resume run.

The nine persistent/service probe commands completed in approximately 43
seconds total. Build/setup and separate test commands are additional. Measured
external spend and model token usage were zero in the emitted probe metrics.

## Evidence boundary and remaining work

The probes exercised 21 of the 22 canonical scenario behaviors: 19 are named
in diagnostic receipts, and `mesh-minority-partition` and
`dependent-actor-collusion` are recorded as explicit passing Mesh checks.
`supervisor-restart-resume` was not rerun as an operational scenario. Do not
report this collection as full 22/22 qualification.

This used HEAD `c207f6288a77230e180e7b1569a759a48e5a342e` plus tracked workspace
changes. Authorization/CLI checks used an isolated clean snapshot of scripts
and configuration. The mixed source bindings are retained, not relabeled as a
single signed release bundle. Historical readiness evidence remains unchanged.
Long-duration stability, distributed failure-domain tolerance, persistent
Temporal-server recovery and production readiness are not established here.

Local logs, receipts, runner scripts, source patch and SHA-256 manifest:
`/Users/douglasrodriguez/Dev/agentplat-local-validation/2026-09-09/`.
The runner scripts record the commands used; local services must be started
before rerunning the service probes. No artifact contains retained private keys.

## Follow-up: supervisor restart/resume completed

The remaining operational scenario passed in a separate local coverage run.
The supervisor stopped normally after ten rounds / 60 PostgreSQL-Temporal
iterations, released its lock, and a different OS process resumed from the
persisted state in **174 ms**. It completed all
20 rounds / 120 iterations and six local Mesh cycles in **144676 ms**.
There were 154 resource samples. The receipt records zero duplicate effects,
unauthorized activations, lost receipts and morphology-head forks, and mission
continuity 1.0. External spend and paid model calls were zero.

The event hash chain and receipt digest were independently recomputed. Every
operation had exactly one attempt; completed work was not replayed by the
second supervisor process. This exercises all 22 canonical scenario behaviors
across the local diagnostic checks, without claiming the historical 30-minute
profile or distributed staging qualification.

The new `plan-local` mode derives a separate profile ID/digest and removes only
the wait. The 120 iterations, fault probes, six Mesh cycles, authorization and
resource/recovery checks remain in force. The historical readiness profile and
published bundles still verify unchanged. Local endpoint checks and historical
profile preservation tests passed, together with existing supervisor/gateway
checks (8 tests).

The first attempt stopped before the restart scenario because Temporal's
workflow bundler could not resolve a symlinked build directory in the temporary
snapshot. The successful attempt copied compiled files physically. Both attempts
are retained; no failed attempt was relabeled as passing evidence.

Successful source snapshot: `51529cfa8d4b9b482af366cdbd75e9ddcca3bf77`.
Temporal used a local SQLite development database this time. The snapshot used
current source and compiled packages, with installed dependencies shared from
the workspace. PostgreSQL and Temporal were stopped after execution.

Evidence and independent verification:
`/Users/douglasrodriguez/Dev/agentplat-local-validation/2026-09-09-supervisor/attempt-2/`.
This is a controlled process restart, not arbitrary SIGKILL or host-loss
recovery. Long-duration stability and production readiness remain unestablished.
