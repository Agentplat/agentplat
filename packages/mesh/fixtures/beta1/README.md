# Mesh Beta 1 persistence fixtures

This corpus freezes provider-neutral state, durable wrapper and migration
compatibility for `0.3.0-beta.1`. It covers core, coordination, discovery,
inbound, Objective/Work, Allocation, simulator, wrapper-schema and PostgreSQL
migration identities without embedding application data or private keys.

Run `pnpm run verify:mesh-persistence-fixtures` to restore every readable state
version, reproduce simulator output and recompute the manifest digests. Use
`pnpm run fixtures:mesh-persistence:write` only for an intentional reviewed
fixture update.
