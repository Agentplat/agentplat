# AgentPlat 1.8.0 — host-authorized Planner initiatives

Status: prepared release; registry publication and clean-consumer verification
must complete before this version is announced as available.

This additive cohort lets an application observe source-backed situations without
inference, then explicitly admit bounded read-only initiative objectives under a
host-verified owner policy. Existing owner-message behavior and unadmitted
external events retain their authority boundaries.

## Public surface

- `PlannerInitiativeAdmissionV1`, observation records and the dedicated initiative
  port are exported by `@agentplat/rooms` and the framework facade.
- `AgentRoomPlanner.observeInitiative` records deterministic historical eligibility
  without enqueueing inference. `selectInitiative` admits an explicitly selected
  observation; switching modes never drains observation history.
- `operationCall` restores persisted authority at workflow effect boundaries.
  `assertInitiativePublication` checks the original admission before projecting
  a persisted result.
- `RoomPlannerWorkflowCalls.bindCall` preserves model/read claims across durable
  workflow serialization and rejects missing or mismatched authority.

The existing Planner CAS state holds observations, provenance and consumption;
there is no second scheduler, operation ledger or budget account. Call/read/cost
ceilings survive failures, uncertainty, pause/resume and explicitly targeted
follow-ups. Read-only initiative execution uses dedicated adapters, not generic
agent tools. Native ports remain opt-in; applications must wire current source
and recipient authorization checks at actual effects.

## Adoption

Upgrade the coordinated package cohort together. Existing persisted Planner
records remain readable; additive initiative state is created only when the new
API is invoked. No source is connected, worker installed or policy enabled by
upgrading packages. Retain the separate schema/maintenance requirements of any
older release crossed during adoption, including the actor-private Room upgrade.

Hosts must explicitly configure policy identity/revision, source provenance,
allowed Rooms and reads, freshness, execution duration and cost limits. A
stopped/expired initiative has no automatic allowance-renewal API. A possibly
dispatched call is never replayed merely because a lease expired. Known late
costs remain accounted while stale actionable output is suppressed.

See [the Room package guide](../../packages/rooms/README.md#host-authorized-planner-initiatives-opt-in)
for methods and host obligations. Native, workflow and consumer fixtures verify
bounded software behavior; they do not establish live model effectiveness.

## Release boundary

All 70 cataloged public packages use 1.8.0. Publication follows the existing
protected-main, exact-tarball OIDC release workflow, including a dry run,
owner-authorized environment approval and registry integrity/provenance checks.
No existing version is overwritten and no previous distribution tag is removed.
