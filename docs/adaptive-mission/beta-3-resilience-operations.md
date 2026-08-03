# Beta 3 resilience conformance operations

This runbook operates the opt-in closed-loop resilience reference surface. It
does not turn the reference campaign into a production scheduler or add cloud
deployment requirements. The operator owns policy admission, identity, durable
storage, monitoring and protected-effect integrations.

## Preconditions

Before enabling any mode, freeze and record the mission, mandate, roster,
decision-policy, environment and fault-matrix binding digests. Use the same
Node release and package tarballs that will run the workload. Keep the output
of the conformance example with the release evidence:

```sh
pnpm --filter @agentplat/mesh-sim build
node examples/collective-planning-resilience-conformance.mjs
```

The report must show `status: "passed"`, a completed adaptive and centralized
run, a committed protected effect, six observed fault records and stable
campaign, fairness, matrix and resilience-result digests. A failed assertion or
changed digest is a release input change, not a result to manually repair.

The `fixtureAdapter` output is deliberately separate. It is an integration and
sensitivity check for the public planning-fixture interpreter: it proves that
the packaged conformance runner can invoke that interpreter and detect its
fixture decisions. It does not execute the resilience runtime through the
adapter, does not certify a runtime implementation and is not campaign
evidence. Use `campaignEvidenceDigest`, together with the trace, matrix and
resilience-result digests, as the campaign evidence boundary.

For an installed package boundary, run `pnpm run verify:pack`. It creates
isolated pnpm and npm consumers from the generated tarballs and runs the same
resilience-conformance flow without workspace dependencies.

## PostgreSQL durable profile

The durable profile is opt-in and requires explicit migrations. Importing or
constructing `@agentplat/mesh-postgres` does not connect, migrate, create a
schema or start a worker. Before admission:

1. create a caller-owned PostgreSQL pool;
2. run `runMigrations(pool, { schema, createSchema: true })` and require
   migration version 3;
3. build a `PlanningRecoveryDurableScopeV1` from the exact tenant, policy
   domain, mission intent revision/digest, selection-policy digest and local
   peer/instance;
4. validate the real planning reducer snapshot and closed recovery state with
   `createPlanningRecoveryDurableStateV1`; and
5. initialize `PostgresPlanningRecoveryDurableRepositoryV1` before processing
   work for that stream.

Every transition uses both `expectedGeneration` and `expectedStateDigest`.
Treat `state_conflict` as a request to reload and re-evaluate, never as
permission to overwrite. Treat `rollback_rejected` as a security event. A
recovery epoch may advance by exactly one and must rotate its fencing token;
logical time, plan/fragment revisions, budget reservations, replay sequence and
revocation high-waters may not decrease.

After a process or pool restart, construct a new repository instance with the
same exact scope and call `read()`. Verify the snapshot and retained journal
head before resuming. `restore()` may seed an empty stream or confirm an
identical existing snapshot; it deliberately refuses to jump an existing
stream to a later head without the intervening verified commits. This prevents
a valid-looking snapshot from creating a journal fork or gap.

Before migration rollback, stop admission, take and verify an external backup,
drain/reconcile protected effects, and generate the exact confirmation for the
current migration version. Rolling back version 3 destroys the opt-in planning
recovery tables and therefore requires `allowDataLoss: true`; it never rewrites
the older Mesh durability tables.

## Rollout modes

### Off

Do not create resilience definitions, issue recovery work or route
replanning-trigger observations to the closed-loop surface. Continue the
existing nominal workload. Preserve any previously collected evidence; do not
delete it to make a later comparison appear clean.

### Shadow

Run the exact frozen definition and fault matrix, but do not connect its
protected-effect receipt to a live downstream effect. Record the complete
trace, fault-matrix records, epoch roots, stale-result rejections and report
digests. Compare only like-for-like, information-equivalent inputs with the
centralized baseline. A mismatch, missing fault record, uncommitted receipt,
stale-result acceptance or digest instability blocks promotion.

### Enforce

Enable only after a successful shadow sample from the exact release artifact.
Allow a live protected effect only through the existing grant, permit and
fencing path. Monitor these conditions for each run:

- all scheduled fault records were injected and observed;
- the resulting epoch sequence is contiguous and has no time regression;
- every replacement assignment has a valid recovery lease;
- stale progress and result envelopes are rejected rather than applied; and
- the report, matrix and fairness bindings match the admitted definition.

Stop new admission on any violation. Do not retry a changed request under an
old identity or fence.

## Crash, restore and reconciliation

On a worker crash, first stop duplicate workers for the same peer/instance and
preserve logs, trace journals and the durable store. Restore only the latest
validated snapshot and evidence chain. Confirm the roster, mission, mandate,
definition, fault-matrix binding and logical-time high-water match the
admitted run before resuming.

Recovery changes the assignment epoch. A prior assignee may emit delayed
progress or result envelopes, but those envelopes must remain evidence-only
and be fenced from state transition or downstream execution. Do not manually
reuse an old lease, receipt, permit or work identity to make recovery faster.

For a protected effect whose outcome is uncertain, reconcile against the
authoritative downstream system using its idempotency identity and receipt.
Classify the outcome as committed, not committed or indeterminate. Keep
indeterminate reservations charged until authoritative proof resolves them;
never infer success from a timeout or restart.

## Rollback

1. Stop new resilience admission and new protected-effect dispatch.
2. Let in-flight work reach a verified terminal state where possible; otherwise
   record it as indeterminate and fence it from further execution.
3. Reconcile all committed and indeterminate protected effects from
   authoritative downstream evidence.
4. Verify evidence-chain integrity, assignment-epoch high-waters and the
   recovery/fencing records before changing mode to `off`.
5. Retain the admitted definitions, report digests and reconciliation evidence
   for the organization’s audit-retention period.

Rollback removes the opt-in routing decision; it must not delete durable
evidence, lower high-waters or reinterpret a governed reservation as an
ordinary unprotected action.

## Incident evidence

For any failed or disputed run, retain the exact package version, source
commit, input digests, runner kind, logical-time bounds, trace digest,
campaign-evidence digest, fault-matrix digest, fairness digest, epoch roots,
stale-result rejections and downstream reconciliation records. This data is
the minimum needed to reproduce a deterministic reference result or identify a
non-deterministic integration boundary.
