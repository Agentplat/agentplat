# Distributed rollback

Rollback is authorized by the campaign controller or another policy-eligible
agent, person or quorum; it is not intrinsically human-only. Capture the
incident time, current image digests, database migration, Temporal workflow
versions, morphology heads, KMS key ID and independent witness heads before
changing deployment state.

Fence new Morphogenesis decisions and protected effects. Drain workers without
discarding committed receipts, then restore the last compatible image by exact
digest one failure domain at a time. Database rollback is prohibited unless the
matching migration runbook explicitly proves backward restoration from a fresh
backup. Reconcile Temporal workflows and Mesh inbox/outbox state before
releasing fences. Compare every durable head against the external monotonic
witness and reject any lower revision even if PostgreSQL accepts it.

Success requires restored quorum, zero pending unauthorized effects, continuous
mission checkpoints and identical receipt roots. Record rollback duration,
trigger, actor type and ID, predecessor/successor digests, witness checks and
post-rollback scenarios. If reconciliation is indeterminate, keep effects
fenced and escalate through incident response. Rollback evidence cannot be
relabelled as production readiness.
