# Replicated execution checkpoint handoff V1

## Purpose

This profile lets a replacement peer continue accepted Work from portable
application state after the prior assignee is unavailable. It does not migrate
process memory, credentials, prompts, provider sessions, hidden reasoning or
authority. Assignment recovery and action authorization remain separate,
fail-closed protocols.

## Composition

- `@agentplat/runtime/adapter` exports and imports application checkpoints only
  between sessions bound to the exact adapter ID, version and implementation.
- `@agentplat/collective-runtime/checkpoints` creates content-addressed
  artifacts, selects replicas deterministically, obtains signed receipts and
  certificate-custody acknowledgements, and resolves certified state over
  bounded authenticated HTTP.
- `@agentplat/collective-sync-postgres/checkpoints` persists one independent
  peer instance's artifacts and evidence.
- `@agentplat/collective-runtime/node` gates recovered assignment acceptance on
  resolution and imports the artifact before execution.

## Required ordering

1. The active assignee creates and exports a portable checkpoint.
2. The artifact is stored by the deterministic replica set.
3. At least `writeThreshold` current members return valid signed receipts.
4. The resulting certificate is stored by at least
   `certificateCustodyThreshold` receipt holders.
5. Only then may the producer publish the checkpoint reference in Mesh Work
   evidence or begin external actions for that step.
6. A replacement resolves and verifies the exact artifact before it accepts a
   recovered assignment, imports it into an unused session, and restores it
   before the first step.

No successful threshold means no certified checkpoint and no recovered
execution. The source peer is tried only as another current member; its loss is
not a special trusted path.

## Production defaults

- Use at least five independent peers, `replicaCount: 3`,
  `writeThreshold: 2`, and `certificateCustodyThreshold: 2` when the intended
  fault model allows one unavailable replica. Raise thresholds with the member
  count and documented failure assumptions.
- Give every peer its own PostgreSQL schema or database and its own signing key.
- Authenticate and encrypt HTTP transport below the signed protocol envelope.
- Keep `maximumArtifactBytes` small enough for bounded memory and request-body
  handling.
- Set `evidenceLifetimeMs` longer than the maximum assignment lease, recovery
  grace and expected recovery duration, while retaining expired records for
  audit according to policy.

## Failure handling

- A digest, scope, binding, membership, signature or adapter mismatch is
  terminal for that artifact and must not fall back to unverified state.
- Missing current membership, insufficient replica receipts, insufficient
  certificate custody and unresolved certified content all withhold progress.
- Publishing and importing the same exact checkpoint are idempotent. Reusing a
  checkpoint ID with different content is a conflict.
- If state contains secret-like or hidden-reasoning keys, export fails before
  replication. Applications should export a narrow, schema-versioned state
  object rather than filtering a general process snapshot.

## Local evidence scenario

Run:

```sh
DATABASE_URL=postgresql://... \
  pnpm run example:execution-checkpoint-handoff-multiprocess
```

The scenario starts five independent peer processes and PostgreSQL schemas,
publishes a checkpoint, stops its source, resolves it on a non-replica, then
restarts that receiver and verifies that both artifact and certificate remain
available. It creates no cloud resources and removes its schemas on exit.
