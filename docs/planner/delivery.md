# Room Planner delivery boundary

This change adds an opt-in AgentPlat Planner to the current 1.3.0 source line.
The already published 1.3.0 packages do **not** contain these exports. A later
compatible cohort is required before an application can adopt registry packages.
No version is overwritten, registry tag changed, release dispatched or pilot deployed
by this source change.

## Review scope

- `@agentplat/rooms`: objective/control revisions, one active plan, admitted specialist
  work, source-bound review, shared reservations and notifications; the host owns identity,
  permissions, model choice, execution and source authorization.
- `@agentplat/framework`: server-side composition exports. Existing browser entrypoints
  and baseline capabilities retain their boundaries.
- `@agentplat/rooms-postgres`: additive migration 019, transactional state/history and
  durable call result receipts. Its constructor does not migrate.
- `@agentplat/workflows-rooms`: the existing durable runner owns attempts, leases and
  recovery. The Planner does not introduce a competing attempt scheduler.

Explicit idempotent message intake is an additive Room service option. The built-in
repositories atomically insert or read the same tenant-scoped identity; replay rejects
changed content, author, Room or metadata and emits no second message event. Legacy
repositories can retain ordinary intake; the opt-in path fails closed when unsupported.

The source was separated from other local event-ingress, action-control, Runner and
research work. The bounded canonical JSON comparison was isolated as a private Rooms
utility; it does not require the unmerged event-ingress API. Current public contracts
and deterministic integration checks must pass independently of the original dirty tree.

## Evidence and compatibility

The dated [qualification report](../research/room-planner-qualification-20261015.md)
and its [manifest](../../config/room-planner-pilot-candidate-v1.json) identify an exact
historical 1.1.0 source-preview cohort. They are retained without relabeling it as a
1.3.0 qualification. That small synthetic study passed ten cases after diagnostic
failures; it did not establish open-web reliability, human time savings or superiority
over the legacy flow. Grishen's newer prompt composer and this source baseline require
their own consumer checks. A new release candidate must be packed and qualified before
its published bytes replace the source-preview installation.

The existing Rooms migration tests now include 019. Historical rollback tests explicitly
remove that additive head before exercising older governed state. Random test schemas
avoid mutation of a default public schema. Destructive rollback still needs the existing
explicit confirmation and is not a safe way to retain Planner history.

## Ordered adoption gates

1. Merge reviewed source only after required CI, typed public contracts, package checks
   and the composed PostgreSQL consumer checks pass.
2. Prepare a fresh coordinated minor cohort after published 1.3.0, through the existing
   protected release workflow. Preserve artifact/provenance checks and npm authentication.
   Do not infer release authorization or operational readiness from this document.
3. Replace the consumer's preview profile with exact published versions and lockfile;
   repeat packed/registry consumer checks, migrations and applicable model qualification.
4. Configure an operator-authorized HTTPS read-only research connector that verifies
   source access and authenticity, honors trusted tenant/Room/owner scope and idempotent
   operation keys, and reports bounded actual cost. Fixture sources are not this connector.
5. Configure model prices and a positive persistent Room monetary ceiling. Start in
   observation, then admit limited pilot execution. Keep unrelated Rooms on their route.
6. To withdraw execution, drain new admissions and reconcile or cancel in-flight work.
   Keep reports and pause controls readable; retain uncertain reservations and receipts.

The consumer PR must remain a draft until its published-cohort gate is satisfied.
A source-only CI pass cannot make a registry-only production build deployable.
