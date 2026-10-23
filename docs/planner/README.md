# AgentPlat Planner for Agent Rooms

Published in AgentPlat 1.4.0 as an opt-in Room coordination profile with multiple objectives, a visible coordinator, versioned plans, specialist proposals, source-bound reviews and a shared budget. This profile is separate from the frozen Collective Capability Baseline V1. Published consumer checks establish bounded integration, not model judgment quality or production readiness.

## Ownership and composition

`createAgentRoomPlanner` is exported from `@agentplat/rooms` and `@agentplat/framework`.
The host supplies a `RoomPlannerReasoner`, authorized context, current identity/admission,
a persistent event resolver, routing, execution, verification, notification delivery and
integer USD-micro reservations. `createRuntimeRoomPlannerReasoner` adapts AgentRuntime
and host-configured prices. Explicit references bypass reasoning. Ordinary answers need
no plan. The reasoner can propose, explain and challenge; only the engine commits work.

Rooms owns tasks, artifacts and human authority. Planner owns objective heads, plan
history, decisions, budget reservations, an inbox and communication outbox. An objective
has one current plan; independent objectives share the Room budget. Plan versions reuse
unchanged completed tasks, and changed or unresolved work needs a fresh task identity.
`AgentRoomPlannerBridge.taskIdentityPrefix` allows stable objective-scoped task identities
while retaining legacy plan-scoped defaults. Historical results remain evidence after a
pause or replan and do not silently acquire authority over a successor plan.

Workflow attempts, lease generations, heartbeat and cancellation remain owned by
`@agentplat/workflows`. `RoomPlannerWorkflowCalls` from `@agentplat/workflows-rooms`
wraps reasoner, specialist and verifier calls in a durable single-task process, using
an injected `WorkflowStoreV1` and result receipts. `PostgresWorkflowStoreV1` makes the
same runner durable. Hosts must connect current authorization at every effect sink.
This pilot permits read/draft work and does not enable arbitrary external-write tools.

## State and recovery

`PostgresRoomPlannerStore` commits the complete Room state with CAS and saves each
accepted revision in history. Room migration 019 adds Planner state, history and workflow
result receipts. The workflow adapter uses its own existing migration ledger. Constructing
adapters performs no migrations. Migration rollback deletes Planner state and requires
the existing explicit destructive-rollback confirmation.

Before invoking a provider the engine persists an operation and an upper-bound cost
reservation. The total Room budget has no automatic renewal. Actual usage is charged,
and uncertain calls retain their reservation. Missing usage cannot be treated as free.
Increasing the total limit grants additional balance; it does not reset historical spend.
Overruns stop new admissions. A host must bound input/output and connector cost so that
reservations are actual upper bounds, rather than expected average costs.

Recovery reads durable receipts; it never silently replays an ambiguous model or tool
call. The host reconciliation port may inspect workflow receipts and confirmed external
or Room state. Absence of evidence leaves the call uncertain and its budget reserved.
Pausing/canceling increments objective control revisions; adapters heartbeat while calls
are active and abort cooperatively when authority is lost. Closing a browser is unrelated
to this cancellation boundary. A result completed after a control change is charged but
requires explicit readmission before use. Three replans without new completed work stop
an objective for user attention.

`acceptEvent` resolves a trusted persisted identity rather than accepting a request body
as authoritative evidence. `recordSpecialistProposal` requires a persisted specialist
contribution and current specialist authorization. Internal events cannot create new user
objectives. Every host notification delivery must deduplicate its stable ID.

Reviewers must be distinct from production-task authors. A successful review binds the
exact report reference, version and source set and covers every criterion once with
`met`, `unmet` or `unknown`. A successful provider response is insufficient. Model review
checks the supplied evidence; it does not independently authenticate web sources.

## Host adoption boundary

A consuming application must independently implement identity and authorization, user-facing controls, source connectors, notifications, model/tool configuration, prices and production rollout. Planner is disabled unless the host explicitly enables it after qualifying the published package set and migrations. The 1.4.0 consumer fixture checks public APIs/types, Rooms migration 019, workflows migration 001 and recovery of completed workflow calls in an isolated PostgreSQL schema; it uses no production database or model credentials. This is bounded package integration evidence, not production-scale qualification.

Any named consumer application integration, including Agents.Grishen, is separate work and is not included or claimed by the 1.4.0 package publication.

## Qualification

- Core: `node --test tests/rooms-room-planner.test.mjs tests/rooms-planner-bridge.test.mjs`.
- Workflow calls: `pnpm --filter @agentplat/workflows-rooms test`.
- PostgreSQL: `AGENTPLAT_POSTGRES_TEST=1 PGDATABASE=... pnpm --filter @agentplat/rooms-postgres test` against an isolated local test database.
- Comparative evaluation: run legacy sessions, selective routing and Planner with matching
  model/tool/permission/budget configurations. Use independent criterion evidence and
  the trace evaluator to compare completion, false completion, human corrections,
  repeated work attempts, duplicate confirmed effects, latency and total cost.

The capability wish list informs extension boundaries, not immediate implementation of
all sixteen capabilities. General external attention, cross-task lesson promotion, Mesh,
Morphogenesis and dynamic team formation are outside this published opt-in profile. Basic memory
provenance and corrections are supported; automatic learning remains disabled.

## Qualification hardening

The reasoner receives engine-owned task progress in addition to the objective and authorized
Room context. Its proposals bind the exact objective/control revisions actually observed.
Whole-plan admission may reject an interpretation with bounded repair feedback. Known
format errors and repairable task-identity conflicts can consume up to three separately
reserved interpretations of the same persisted user event; ambiguous calls are never
silently replayed. JSON object mode preserves the internal API envelope independently of
the user's requested report format.

An internal `wait` acknowledgement cannot stall tasks or final verification that are already
ready under the accepted plan. A real user wait/pause and actual blocked work retain their
control boundary. Internal receipts for terminal objectives are recorded as consumed without
new inference. Only actual owner messages enter the owner-correction history.

A separate application-level qualifier compares legacy sessions, selective routing and a host-owned consumer
composition using the same model and supplied corpus. Before holdout it freezes package
and critical consumer-file hashes. Budget reservations persist across processes and all
campaigns share the owner's USD 5 ceiling. See the dated qualification report for measured
results, failed diagnostic iterations, the final candidate and the exact evidence boundary.

A known unmet review can trigger corrective planning with its criterion evidence. The
successor plan must add production work and create a new report version before another
review; completed unchanged output is never resampled for approval. Three failed report
versions stop automatic repair. An unknown criterion leaves the objective waiting for
intervention. Owner corrections reset this bounded repair cycle. A concurrent review
cannot silently consume an owner correction, and control changes continue to fence it.
