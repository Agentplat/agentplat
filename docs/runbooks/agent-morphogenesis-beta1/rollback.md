# Agent Morphogenesis Beta 1 rollback runbook

Rollback never means undoing an activated distributed morphology. Stop new
admission, let an in-flight protected operation reconcile, fence predecessor
and successor Work/Action authority, preserve receipts, and enter explicit
successor recovery.

Database migration rollback is destructive. It requires the exact
`rollbackConfirmation(schema)` for head 009, `allowDataLoss`, and an externally
verified backup. Never reuse a token for another schema or migration head.

If no morphology was activated, cancel the fixed Workflow and execute its
declared compensations in reverse order. If activation occurred, retain the
new head and follow incident recovery; do not rewrite the head to its parent.
