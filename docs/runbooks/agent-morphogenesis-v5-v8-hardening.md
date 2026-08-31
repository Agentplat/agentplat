# Agent Morphogenesis V5–V8 hardening runbook

Status: controlled staging reference. It does not authorize production changes.

## Alerts

- `vertical_stalled`: inspect pending stage, owner health and stable operation ID;
  restart with reconciliation, never allocate a new ID.
- `compensation_active`: allow reverse compensation to finish; escalate any
  indeterminate owner receipt.
- `vertical_rolled_back`: preserve evidence and prevent automatic retry until a
  new reviewed root input exists.
- `constitutional_isolated`: block successor application and inspect conflicting
  branch heads; never merge authorization sets.
- `constitutional_recovery`: verify checkpoint, revoked authorizations and fresh
  authority epoch before resuming.

## PostgreSQL recovery

Restore the runtime-state row and its external rollback witness as one logical
head. If revision, logical time or digest diverges, keep the capability blocked.
Do not regenerate a witness from restored database contents.

## Evidence preservation

Retain state, stage receipts, compensation receipts, Membership/configuration
digests, constitutional proofs and alert digests. Do not store prompts,
credentials, hidden reasoning or unrestricted model output.

## Safe retry

Use the existing state key and stage-derived operation ID. Invoke `reconcile`
when a stage was persisted as pending. A new operation ID represents a new
reviewed attempt, not a retry.
