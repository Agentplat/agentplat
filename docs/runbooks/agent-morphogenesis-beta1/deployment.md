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
