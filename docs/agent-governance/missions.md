# Qualified purpose mission cycle (source preview)

Objective 7 provides the first executable `purpose` composition. It is opt-in and
requires owner admission, mission/effect persistence, the existing Room Planner and
Room execution profile, authenticated roles, and host-supplied alignment, decision
and outcome assessors. Publishing a purpose definition alone still grants no
execution authority. Instruction mode and unbound legacy applications are unchanged.

## Reuse and scope

`PurposeMissionServiceV1` adds a purpose/governance envelope around an existing
`AgentRoomPlan`. The Planner remains the owner of plan structure, dependency
materialization and canonical task IDs. RoomService owns runs, leases, artifacts
and policies; Action Gateway owns grants; the objective 6 controller owns narrowed
admission and resource reservations. This is not a replacement for AgentPlat
Collective Runtime, Agent Mesh or their mission/Work authority.

The initial profile supports one agent participant per mission and 1–16
`agent_task` steps in a fresh Room plan. Human-contribution, approval and Handoff
plan nodes are not admitted by this initial profile. Existing Room task policies
and approvals still apply. Mixed-agent delegation and organizational evolution
use the bounded [objective 8 continuity composition](continuity.md); a fuller persistent product demonstration is objective 9.

## Composition and activation

Construct a `PurposeMissionServiceV1` with mission/governance/plan stores, a Room
state reader, inception and attention stores, the execution evidence store,
assessor ports, authentication/authorization, clock and optionally an evaluation
lease duration. Supply `service.control()` as the last argument of
`AgentExecutionControllerV1` (after its clock).

The in-memory execution store must receive the same purpose store as its second
constructor argument. The PostgreSQL adapters must share a schema with migration
017. Admission probes required storage and checks that the execution backend can
atomically enforce mission work. A controller without the purpose composition
cannot activate or execute the profile.

Owner `prepare_activation` and `activate` commands now admit purpose mode only
through this composition. The admission and execution binding retain a purpose
control digest covering protocol, evaluator identities and evaluation lease policy.
Changing those identities requires new admission. The mission service refuses
operations under a different admitted control digest.

Hosts supply verified identity and three intelligence ports:

- `align`: assess whether a proposed plan serves the current purpose. Uncertain or
  conflicting alignment prevents mission issuance/revision.
- `evaluate`: choose `act`, `wait`, `needs_evidence`, `escalate`, `replan` or `complete`,
  with explanation and uncertainty.
- `review`: evaluate each declared success criterion, evidence coverage, contribution
  to purpose and causal support separately from technical task completion.

These ports supply judgment; there is no built-in claim that a model's judgment is
correct. They receive tenant/agent/mission-scoped evaluation IDs and request digests
and must deduplicate retries. Their identities and the control digest are retained
in mission history. Missing ports, invalid outputs or stale authority cannot enable
work. The host still owns provider credentials, scheduling and actual model calls.

## Issuing and revising missions

`issue` requires a verified owner or current `missions` delegate, plus host policy
permission. It binds a fresh canonical plan, participant, immutable plan-content
digest, explicit success criteria, expiry and current governance revision. Delegated
issuers cannot create a mission lasting beyond their delegation. Assignment and
alignment do not modify purpose, signals, limits or ownership.

```ts
await missions.issue(issuerCredentials, {
  agentId: "retention-agent", missionId: "onboarding-retention",
  operationId: "issue-onboarding", roomId, planId, participantId,
  expectedGovernanceRevision: currentHead.revision,
  criteria: [{ criterionId: "retention", description: "Evidence supports the agreed retention improvement" }],
  expiresAt: missionDeadline,
});
```

`revise` requires the same scoped issuer authority and a fresh successor plan whose
`predecessorPlanId` and version extend the current plan. It preserves prior plan
IDs/history, reassesses alignment against current purpose, clears old outcome
qualification and fences old work. Known unresolved external effects block revision.
If an older effect is admitted in a race before revision commits, the execution
store blocks successor-plan work until that effect is settled. Stable logical
business-effect IDs and downstream idempotency remain required across retries and
replans; a new task identity is not permission to repeat an uncertain transaction.

An owner purpose change suspends the agent as before. After readmission, old missions
cannot run automatically: an authorized issuer must bind a reviewed successor plan
to the new governance. A mission delegate still cannot change the agent's purpose.

`cancel` is an authorized control operation, including while the agent is suspended
or the mission has expired. It fences new mission work without asking an evaluator
for agreement. Already-admitted effects retain their objective 6 reconciliation rules.

## Inputs, deliberation and bounded work

The optional `createPurposeRoomInputPortV1` routes ordinary Room messages to the
existing inception service. Pass it as the final argument of
`DefaultAgentRoomCoordinationExecutionPort`. Purpose input routing creates no task
and runs no provider; it can retain inert contributions while paused. Input from an
owner uses the same route. The agent/application first assesses the inception
through the existing assessment interface before using it as a decision trigger.
Do not connect a legacy raw-instruction intervention adapter to this profile without
converting ordinary input to inceptions or explicit authorized governance operations.

`evaluate` accepts a current inception assessment, an existing attention wakeup or
a periodic mission review trigger. Inception assessments must be the latest revision
and bound to current governance. Rejected/deferred/needs-evidence assessments cannot
justify `act` on that trigger. Signal wakeups must belong to the selected definition
and current governance; missing, stale, unavailable or contradictory source coverage
blocks action based on that trigger. Freshness is rechecked at decision completion.

`act` makes the exact reviewed plan runnable; it creates no Action Grant. Materialize
through the existing Planner, then advance one ready task at a time:

```ts
const decision = await missions.evaluate(agentCredentials, evaluationRequest);
if (!("pending" in decision) && decision.result.disposition === "act") {
  await missions.materialize(agentCredentials, materializationRequest, planner);
  await missions.runOne(agentCredentials, missionScope, { rooms, planner });
}
```

`runOne` is a bounded polling/advance operation, not an idempotent external-effect
endpoint. Canonical task identities, native Room run leases, immutable work bindings
and stable logical effect IDs prevent blindly repeating work. Running or failed
tasks return a reconciliation-required state rather than being automatically rerun.
A caller recovers facts through existing run/effect owners. Plan reconciliation is
filtered to the mission's plan; use this path instead of an unfiltered automatic
materializer for qualified purpose work.

The controller permits only tasks matching an approved plan step: participant,
identity, instruction, expected output/artifact, action level, tools and dependencies.
Each execution binding adds mission ID, work epoch, decision digest, plan and step.
Native provider input receives purpose and mission context alongside the task.
Protected effects must use tools declared by that step and a currently running
matching Room run, as well as every existing grant, assessment, limit and budget check.

Both memory and PostgreSQL atomically compare mission work state together with the
governance fence when binding tasks and admitting effects. A cancellation or changed
work epoch committed first denies admission. Stopping materialized work requires a
successor plan before it can be made runnable again; old task/grant bindings are
never silently revived. A continued `act` for an unchanged runnable plan does not
create another copy of its work.

## Outcome review and completion

A Room task completing is only a technical fact. Review additionally verifies that
its immutable execution binding belongs to this mission, plan, governance and task
content. Imported/unbound completed tasks cannot satisfy the mission. Lifecycle
fields such as status and completion timestamps do not alter the operative-content
digest, but changing instructions, permissions or metadata does.

`review` resolves exact Room artifact versions as evidence, reads canonical tasks,
runs and their governed effect receipts, and invokes the outcome assessor. It records
an immutable result. No evidence, incomplete/unbound tasks or admitted/indeterminate
effects force insufficient coverage even if the assessor claims success.

A `complete` decision is accepted only when the current plan's reviewed evidence is
sufficient, every success criterion is met, contribution to purpose and causal
support are explicitly assessed as supported, and current work/effect state confirms
completion. Proxy improvement alone, an ungrounded positive score or task completion
alone is insufficient. Causal support is a scoped assessor judgment, not proof of
causality supplied by the framework. Completed/canceled missions are terminal;
later developments can motivate a successor mission without rewriting old claims.

## Durability and recovery

Mission mutations use governance-fenced CAS. Revision history retains issuer,
assessor identity, plan lineage, explanations and operation receipts. A plan can
belong to only one mission for a given tenant/agent. Exact operation retries return
the retained receipt; changed reuse conflicts. Historical receipts do not authorize
current execution.

Evaluation/review input is persisted before calling an assessor. A live lease returns
`pending` to duplicate callers. After expiry, a new service instance can resume the
same request and scoped evaluation ID; generation checks reject stale completions.
The default lease is 30 seconds, configurable from 1 to 300 seconds and included in
the admission digest. If the original evidence has become unusable, an authorized
worker can `abandonEvaluation` after lease expiry and start a new assessment. Roles
are rechecked after assessor calls. Exceptions retain pending state without inventing
a decision or releasing resources.

Planner materialization retains stable plan/step IDs. A crash after task creation
can resume against the existing task; a later run remains subject to the current
mission work fence. Reconciliation of facts does not create authority. This does
not claim exactly-once model calls or arbitrary external effects.

The initial envelope is bounded to 64 operation receipts, 256 revisions and a 1 MiB
state payload per mission. Exhaustion requires an operational response; history is
not silently truncated. Global owner suspension remains separate from these bounds.
There is no automatic archival, universal long-horizon readiness score or empirical
judgment guarantee in this increment.

## API and persistence

`createRoomsApp({ service, purposeMissions })` exposes independently authenticated
mission issue/read/history, `evaluate`, `review`, `revise`, `cancel` and
`abandon-evaluation` operations beneath
`/agents/:agentId/purpose-missions/:missionId`. Client JSON cannot supply the assessor's
decision or outcome verdict. Work execution remains an internal composition with the
existing Planner and RoomService, not a new effect endpoint.

Use `InMemoryPurposeMissionStoreV1` with the paired memory execution store, or
`PostgresPurposeMissionStoreV1` and `PostgresAgentExecutionStoreV1` in the same schema.
Migration 017 adds mission heads, immutable revision history and plan ownership, plus
an index for effect evidence by run. Mutation and effect admission serialize against
the same governance row. Rollback refuses purpose activation history that older code
cannot interpret. No previously released migration bytes were changed.

## Evidence

Shared memory/PostgreSQL scenarios cover qualified activation, issuer/delegate bounds,
inception-only message routing (including pause), stale/rejected inputs, governed
execution, outcome review, unresolved effects, successor plans, owner purpose changes,
evaluation restart/abandonment, cancellation races and unbound-work rejection.
PostgreSQL tests reopen connections and verify history immutability and rollback.
A separate integration executes through the actual Action Gateway and reconciles its
indeterminate grant. Public-type and HTTP tests verify the exposed contract. These
are local software checks with deterministic assessors, not production or AGI evidence.
