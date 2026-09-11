# Agent Morphogenesis Beta 1 deployment runbook

Deploy only the commit and profile digests named by the signed readiness
registration. PostgreSQL migrations must report head 009 before any worker is
started. Temporal must report `SERVING`, and all four Mesh identities must have
current keys and membership epoch bindings.

1. Verify `pnpm verify:agent-morphogenesis-beta1-operational-readiness`.
2. Apply PostgreSQL migrations with a verified backup and record the status.
3. Start Temporal workers with one immutable task queue configuration.
4. Start Mesh peers and wait for durable inbox/outbox quiescence.
5. Verify the active execution authorization against the installed public-key
   SHA-256 and trusted logical time.
6. Start the readiness supervisor with the exact source SHA and zero-spend
   confirmation.

Success requires a fresh heartbeat, zero pending startup recovery, and no
authority or morphology mutation before the first authorized scenario.

## Local coverage without elapsed-time waiting

For development checks with zero external spend, use
`pnpm plan:agent-morphogenesis-beta1-local-coverage` with the same arguments as
`plan:agent-morphogenesis-beta1-readiness-soak`. This creates a distinct profile
ID and digest, preserves 120 completed iterations, six Mesh cycles and all
auxiliary fault checks, and removes only the minimum duration. Use explicit
loopback `PGHOST` / `TEMPORAL_ADDRESS`; `DATABASE_URL` is rejected in this mode.
Run with an environment that does not contain cloud or model credentials.

Start local PostgreSQL and a Temporal development server with `--db-filename`
pointing to a local file. Obtain zero-spend authorization for a clean source
snapshot, then plan with `--temporal-db-file` referencing that file. Invoke the
existing `run:agent-morphogenesis-beta1-readiness-soak` command. After it exits
with `awaiting-supervisor-restart` at round ten, invoke
`resume:agent-morphogenesis-beta1-readiness-soak` in a new process promptly
(within the 30-second resume SLO).

The receipt is labeled `validationScope: local-coverage` and does not establish
historical time-based readiness or long-duration stability. A controlled
supervisor restart proves continuation from persisted state; it does not prove
recovery from arbitrary SIGKILL or host failure. Stop local services after the
check. Historical profiles and signed bundles remain unchanged.
