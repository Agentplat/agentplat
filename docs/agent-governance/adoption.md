# Adopting instruction and purpose governance

This guide covers the instruction/purpose governance composition published in
AgentPlat 1.1.0. Start with the [brief adoption guide](../getting-started/adopting-1.1.md)
and the [verified distribution record](../releases/stable1-1-distribution-20260929.md).
Publication does not establish production qualification; installed 1.0.0 packages
do not contain these additions.

## Choose the supported composition

| Configuration | What changes | What remains your responsibility |
| --- | --- | --- |
| Existing definition without `interaction` | Nothing: it remains instruction-driven, including its historical digest. No implicit enrollment. | Existing runtime and application security. |
| Explicit `interactionMode: "instruction"` | Makes the mode explicit; the optional field participates in the new revision's digest. | Opt into governed Room execution if you need owner configuration, limits and suspension. |
| `interactionMode: "purpose"` with `governanceId` | Published candidate can receive inceptions; qualified activation and mission work are required for execution. | Verified identity, assessors, scheduling, Room/Planner composition and effect controls. |

```ts
// Optional field on AgentDefinitionRegistry.createRevision input.
interaction: { schemaVersion: 1, interactionMode: "instruction" }

// Alternative for a purpose revision of the same agent.
interaction: {
  schemaVersion: 1,
  interactionMode: "purpose",
  governanceId: "support-governance",
}
```

Mode is part of an immutable Agent Definition revision. Runtime metadata, message
text and an ordinary owner message cannot change it. The authenticated owner
selects a published revision through the governance `mode` command, which suspends
execution. Publish/resolve is not activation; standalone purpose resolution denies.

## Adopt incrementally

1. Keep existing instruction agents unchanged while applying the coordinated
   migration. The 012-to-018 test preserves legacy Room data and exact definition
   records, executes before and after migration, and verifies no implicit governance
   enrollment. Keep all stores and the migration runner on the same explicit schema.
2. Enroll one instruction agent with `AgentGovernanceServiceV1`. Its configuration
   starts suspended. Install immutable tools/operations limits and any budgets;
   references express interpretation and are not mandatory limits.
3. Register `AgentExecutionControllerV1` with the actual adapter capabilities.
   For a fully governed Room use `executionGovernance` and
   `requireGovernedExecution: true`. Qualify every participant in that Room; use a
   trusted dispatcher selecting each participant's controller. Do not expose a
   second ungoverned execution route for the same governed identity.
4. Prepare and activate through owner commands. Verify rejection of unavailable
   controls, stale tasks, revoked authority and missing semantic guards. Execution
   admission is separate from an Action Gateway grant and external success.
5. Add a purpose revision only after wiring the existing Planner, mission store,
   inception store, signal store and `PurposeMissionServiceV1.control()`. Ordinary
   inputs use `createPurposeRoomInputPortV1`; missions require owner/scoped issuer
   permission and assessor alignment. Evaluate, materialize and run bounded work.
6. Add signals and a host worker. Observe, tick, claim and complete wakeups using
   the exact lease token/generation. Persist operational cursors; retry receipts
   with identical operation IDs. A wakeup schedules evaluation, never direct action.
7. If needed, add [continuity](continuity.md) and progressive autonomy. A permanent
   origin preserves ancestor policies/budgets. New models and children need their
   own evidence segment; higher capability never grants broader authority.

The [support demonstration](../../examples/agent-purpose-support/README.md) is a
runnable PostgreSQL assembly of both modes, owner correction, suspension and
separate-process recovery. It uses deterministic assessors, a local output journal
and a simulated account source. Replace those ports only after validating their
real evidence and authority boundaries.

## Host integration responsibilities

| Boundary | Required host behavior |
| --- | --- |
| Identity | Authenticate independent credentials into tenant/subject; authorize initial owner assignment. Request-body IDs and development tenant headers are not proof. |
| Governance | Route owner/delegate commands through the service with CAS revision and stable operation ID; keep history access authorized. |
| Definitions and runtime | Match the exact configured published revision, runtime profile and instructions. Publication of a newer revision does not silently replace active work. |
| Inception and mission assessors | Supply attributable, current evidence and idempotent judgments. Adoption creates no action permission. Missing/uncertain judgment must not silently become approval. |
| External effects | Compose the existing Action Gateway with `createAgentGovernanceActionGatewayV1`; retain base authority, exact input/handler assessment, stable business effect IDs and trusted quotes. |
| Reconciliation | Verify terminal downstream receipts before settling uncertain reservations. Never refund an unknown effect merely because a run failed or the owner changed. |
| Persistence | Use one coordinated PostgreSQL schema and stores. Memory adapters are test-only when restart guarantees matter. Back up history, budgets, task bindings and mission state together. |
| Scheduler | Bound work, expire leases, reconcile native Handoffs and resume prepared assessments. The library does not install a background scheduler or invoke an LLM automatically. |
| Evidence | Separate completed tasks, observed proxy changes, settled effects and supported purpose contribution. Model judgment quality is an operational evaluation, not proven by these tests. |

The HTTP package exposes optional configuration/inception/signal/limit/mission
services. Their raw-request authentication is independent of ordinary Room auth.
Execution, reconciliation, continuity consent and evolution receipt loading remain
trusted host integrations; there is no public endpoint that refunds arbitrary
budgets or grants work by changing a JSON flag.

## Operations and recovery

| Situation | Safe next step |
| --- | --- |
| Owner corrects purpose, limits or mode | Expect suspension and epoch advance. Reconcile already admitted effects; prepare/activate the qualified profile, reevaluate pending work and create a fresh plan where needed. |
| Process dies during activation | Read current head. Repeat the identical operation or continue the persisted transitioning state. Do not infer activation from a published definition. |
| Process restarts while suspended | Keep execution blocked; preserved pending tasks are evidence, not permission. Resume only through current owner commands. |
| Worker loses an evaluation | Use the prepared assessment's stable evaluation ID. After lease expiry, authorized abandonment allows recovery without fabricating a result. |
| External result is unknown | Keep reservation and budget usage. Trusted reconciliation can record success or verified absence; retries do not create new business effect IDs. |
| Handoff is rejected/failed/completed | Admit no further child effects. Parent outcome review includes child settlement; technical Handoff completion alone is not purpose success. |
| Owner or model changes | Keep budgets and origin; invalidate old authority. New definition/profile/consent and autonomy evidence are required. |
| Retained capacity is exhausted | Escalate to an authorized operator. Current records/history are bounded and do not promise automatic compaction or unbounded missions. |

## Migration and fallback

Migrations 013–018 add governance, inceptions, signals, execution, missions and
continuity. Earlier SQL bytes remain unchanged. Apply all through 018 before using
the composition. Take a backup and stop older workers first. See the
[PostgreSQL migration guide](../agent-rooms-postgres-migration.md).

A supported behavioral fallback is an owner-selected instruction revision of the
same governed agent, retaining limits, budget usage and origin. It still requires
suspension and qualified reactivation. Removing governance from a live governed
agent or starting an older ungoverned worker is not a safe fallback.

Prefer a forward fix over a schema rollback. Migration 018 refuses rollback while
origins exist; 017 refuses purpose admission history; 016 refuses activation history.
Those refusals preserve enforcement state. Do not bypass them by deleting receipts.
Earlier down migrations are destructive and require explicit opt-in; test restoring
backups separately before operating a production system.

## Verification and supported limits

Run `pnpm run verify:purpose-governance` with a disposable PostgreSQL database and
`AGENTPLAT_POSTGRES_TEST=1`; the gate refuses to present skipped integration tests
as qualification. Run `pnpm run verify:purpose-consumer` after building to check
packed exports, TypeScript consumers and packaged migrations outside the workspace.
The [evidence matrix](evidence.md) maps the G01–G15 contracts to their tests and
records broader compatibility checks separately from this bounded profile.

Supported: single-agent purpose missions with 1–16 agent-task steps, one parent per
origin, ancestry depth eight and single-step operational purpose delegation to a
leaf. Hosts supply semantic judgments, scheduling and authenticated receipt loaders.
Not established: arbitrary federation, multi-parent budgets, unbounded evolution,
production-scale validation, semantic reliability, or AGI. Publication, deployment
and release authorization are separate from completing this source plan.
