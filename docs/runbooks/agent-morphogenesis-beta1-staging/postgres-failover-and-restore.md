# PostgreSQL failover and restore

Confirm TLS `verify-full`, immutable database resource ID, backup status,
point-in-time recovery and replica placement across the declared failure
domains. Capture morphology heads, execution receipts, workflow runs, Mesh
inbox/outbox counts and independent witness heads before injecting failure.

Trigger provider failover without modifying AgentPlat state directly. Workers
must surface connection loss, retry bounded idempotent operations and never
commit a second material effect. After recovery, compare every database head
with the rollback witness and verify zero lost receipts or forks. Run at least
three failovers during qualification.

For restore, create a clean database resource, restore the selected backup or
point, apply only compatible migrations and compare canonical rows and roots
before attaching workers. Never overwrite the source instance. Reject a restore
behind the independent witness, with missing Temporal correlations or with
cross-tenant rows. Record provider events, recovery and restore durations,
backup digest, source/target roots and reconciliation results. Keep protected
effects fenced until all checks pass; restoration success remains staging-only
evidence and cannot establish production readiness.
