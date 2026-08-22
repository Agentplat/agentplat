# @agentplat/rooms

Infrastructure-neutral Agent Room domain contracts and lifecycle services.

`RoomService` coordinates room state, participants, messages, tasks, artifacts,
approvals, policy checks, bounded context and durable domain events. Storage,
agent execution and event delivery are injected through public interfaces.

```ts
import { InMemoryRoomRepository, RoomService } from "@agentplat/rooms";

const service = new RoomService({
  repository: new InMemoryRoomRepository(),
});

const room = await service.createRoom("tenant-a", {
  title: "Product launch",
  goal: "Prepare a launch brief",
});
```

Use `@agentplat/rooms-postgres` for durable self-hosted deployments. The
in-memory repository is intended for tests and examples.

## Message routing

Agent Rooms can opt into provider-neutral message routing without coupling the
domain to a workflow engine or model provider. Explicit participant references
are resolved deterministically before an injected router is consulted, and a
declared default participant is used only when both earlier stages produce no
assignment.

```ts
import {
  AgentRoomCoordinator,
  PolicyBoundRoomRoutingStrategy,
} from "@agentplat/rooms";

const coordinator = new AgentRoomCoordinator(
  roomService,
  new PolicyBoundRoomRoutingStrategy({
    select: async (request) => chooseEligibleParticipant(request),
  }),
);

const decision = await coordinator.routeMessage({
  tenantId: "tenant-a",
  roomId: room.id,
  messageId: message.id,
  defaultParticipantId: assistant.id,
});
```

Routing returns participant identifiers only. Applications still create and
run ordinary policy-checked Room tasks, so routing cannot grant tool or effect
authority. The router is constrained to the eligible participants supplied by
the Agent Room coordinator.

## Incremental event reads

`RoomService.listEventPage` returns append-only Room events through a
Room-bound cursor with a bounded page size and an explicit `hasMore` flag. The
Rooms API exposes this mode at `GET /rooms/:roomId/events?cursor=...&limit=...`.
Calling the route without either query parameter preserves the original full
event-list response for backward compatibility.

## Execution sessions and human-in-the-loop interventions

`RoomExecutionCoordinator` binds one revisioned execution session to a running
`RoomRun`. Its store uses compare-and-set revisions so concurrent intervention
requests cannot silently overwrite each other. The included in-memory store is
for local development and deterministic tests; durable deployments implement
the same `RoomExecutionSessionStore` port.

```ts
import {
  InMemoryRoomExecutionSessionStore,
  RoomExecutionCoordinator,
} from "@agentplat/rooms";

const execution = new RoomExecutionCoordinator(
  roomService,
  new InMemoryRoomExecutionSessionStore(),
);

const session = await execution.openSession({
  tenantId: "tenant-a",
  roomId: room.id,
  sessionId: "execution-1",
  runId: run.id,
  agentRevisionId: "research-agent@4",
});

await execution.requestIntervention({
  tenantId: "tenant-a",
  roomId: room.id,
  sessionId: session.sessionId,
  expectedRevision: session.revision,
  operationId: "intervention-1",
  requestedByParticipantId: human.id,
  instruction: "Use the approved pricing assumptions.",
});
```

Interventions are accepted only from human participants with the explicit
`run.intervene` permission and only while the bound Room run remains active. Stable operation IDs make exact
replays idempotent and reject conflicting reuse. Resolution records whether an
intervention was applied or rejected; it does not widen participant authority,
tool permissions or Room policy.

A successor execution session may reference a failed predecessor only when it
continues the same Room task. `reconcileSession` projects terminal `RoomRun`
state into the execution session without replaying provider effects.

### Durable intervention dispatch

`RunInterventionDispatcher` claims one pending intervention for a supported
checkpoint under a bounded lease. Concurrent workers use the execution-session
revision as a fencing boundary. If an adapter call fails, the claim remains
leased and another worker can retry it only after expiration; the idempotency
key remains stable across attempts.

`CognitiveRunInterventionAdapter` maps delivery to the Runtime V2 cognitive
`intervention` operation. It binds the request to the cognitive session
revision, tenant, agent, Room run, checkpoint, authority digest and role binding
digest. A completed cognitive operation marks the intervention applied;
refused, abstained or failed outcomes are recorded as rejected.

Execution-session events are stored in revision order and can be read after a
sequence number. The execution session limits interventions to 256, bounding
the associated event history.

## Versioned agent definitions

`AgentDefinitionRegistry` separates a stable agent identity from immutable,
content-addressed definition revisions. A revision binds instructions,
capabilities, tools, knowledge references and a Runtime profile to a SHA-256
digest. Lifecycle state is stored separately and advances by compare-and-set:

```text
draft → published → deprecated
```

Reusing a semantic version with different content is rejected. Exact creation
replays return the existing revision. New execution sessions can be configured
to require a published revision; the registry then verifies the assigned Room
participant, registered agent identity and Runtime platform before storing both
the revision ID and digest in the session.

The in-memory registry store supports local development and tests.
`@agentplat/rooms-postgres` provides the durable multi-process adapter.

## Unified live view

`AgentRoomLiveViewService` combines the Room aggregate, coordination state,
active runs, execution sessions, Handoffs, human contributions, external
deliveries and incremental events. Its composite cursor tracks each append-only
source independently, while the API exposes both bounded polling and a
versioned SSE stream. When stores provide Room-scoped listing, execution
sessions, Handoffs, plans, contributions, memberships and deliveries are
discovered automatically; callers do not need to maintain identifier lists.

PostgreSQL deployments can use the unified operational event reader as the
incremental source. The stream is written transactionally with each source
transition, while a separate durable checkpoint records projector progress.

## Durable coordination failures

Coordination failures are persisted on the claimed item with a stable error
code, category, redacted message, retryability and next-attempt timestamp.
Transient/internal failures use bounded exponential backoff and retain the same
operation ID across attempts. Policy, validation and configuration failures do
not retry automatically.

## Typed planning and participant membership

`AgentRoomPlannerBridge` materializes ordered typed plans into Room tasks,
human contributions, approvals and AgentPlat Handoffs. Deterministic IDs make
restart recovery idempotent, while replans must extend an exact predecessor
version. Steps are materialized progressively only after their dependencies
complete; event-driven reconciliation updates step status, unlocks newly ready
work and records terminal completion or failure.

`RoomParticipantMembershipCoordinator` adds revisioned `invited`, `enabled`,
`suspended` and `left` states, routing eligibility, Handoff eligibility and
allowed agent revisions without changing historical participant records.

## AgentPlat Handoff

`AgentRoomHandoffCoordinator` transfers bounded work context and ownership
between agent participants without relying on free-form delegation text. A
Handoff binds source and target participants, source run/task, published agent
revisions, selected message/artifact references and a non-expanding authority
ceiling.

The target must explicitly accept with `handoff.accept` permission before an
application can bind a running target `RoomRun`. Revision-checked transitions,
maximum depth, self-delegation rejection, participant-path cycle detection and
Room-scoped context validation keep delegation bounded. Terminal target runs
reconcile the Handoff to `completed` or `failed`; recovery may reference only a
failed predecessor.

## Durable coordination loop

`AgentRoomCoordinationRuntime` provides a revisioned inbox for persisted Room
messages and accepted AgentPlat Handoffs. Workers claim one item under a
bounded lease, reuse a stable operation ID across retries, route messages to
eligible participants and dispatch accepted work through an injected
provider-neutral execution port.

Set `automaticCoordination: {}` on `RoomService` to persist a human or agent
message, its Room domain event and its initial coordination item in one
repository transaction. The default coordination identity is `room:<roomId>`;
applications may provide a deterministic `coordinationId` function. If the
repository cannot store the coordination item, the complete message
transaction rolls back.

The runtime fences stale revisions and lost lease ownership. Adapter failure
leaves the claimed item recoverable after lease expiration; successful
dispatch records run IDs and transitions the Room coordination projection to
`executing`, `waiting_for_human` or `completed`. Applications resolve active
items after their bound runs or human contribution complete.

`DefaultAgentRoomCoordinationExecutionPort` is the standard bridge from the
coordination loop to `RoomService`. It creates deterministic tasks from stable
operation IDs, selects a published agent revision, invokes the ordinary
policy-checked `RoomRun`, opens an execution session before provider dispatch,
and reconciles the session after completion. Exact retries reuse completed
tasks and runs. Accepted Handoffs are converted to target tasks, bound while
their run is active and reconciled at terminal state.

`RoomService.runTask` accepts an optional backward-compatible `onStarted` hook
after the run lease is durably renewed and before the provider is invoked. This
is the boundary used to persist execution-session and Handoff bindings before
external computation begins.

`AgentRoomCoordinationWorker` continuously discovers ready coordination state
from stores that implement `listReady`. It supports bounded concurrency,
polling plus explicit wakeup, lease heartbeat renewal, graceful stop and drain,
and aggregate cycle metrics. Its optional `beforePoll` hook can advance the
operational projector before claiming newly accepted Handoffs.

### Checkpoint-aware execution

Room runs invoke `pre_step` before provider execution and `post_output` before
committing a successful result. Providers that execute tools or external
effects must declare and invoke `pre_action`; protected tasks fail before
provider dispatch when that capability is absent and
`requireProtectedActionCheckpoints` is enabled. The enforcement option defaults
to false for backward compatibility in the current release line.

`InterventionAwareRoomRunCheckpointHandler` drains durable interventions for
the current checkpoint through `RunInterventionDispatcher`. Applied
interventions advance the execution-session revision before work continues. A
rejected intervention or checkpoint decision fails closed without widening
authority, tools or policy.

## Human contributions

`HumanContributionCoordinator` models durable human work separately from an
Approval. Requests carry instructions, expected output, dependencies, blocking
behavior, optional assignment and deadline. Revision-checked transitions cover
`requested`, `assigned`, `in_progress`, `completed`, `canceled` and `expired`.

Explicit permissions govern request, assignment, completion and cancellation.
Only the assigned human participant can start or complete work, and referenced
artifacts must belong to the Agent Room. A completed contribution can requeue a
coordination item previously in `waiting_for_human`.

`WorkManagementProvider` and the delivery-store contracts keep external task
systems behind a provider-neutral outbox boundary. External status is a
projection; completion of the AgentPlat human contribution remains the
authoritative coordination signal.

`WorkManagementDeliveryRuntime` operationalizes that boundary with idempotent
enqueue, CAS claims, bounded leases, exponential retry backoff, attempt limits,
provider lookup reconciliation and stable idempotency keys. A provider task is
created once and updated for later contribution revisions. Metrics report queue
counts and the oldest pending delivery. `LocalWorkManagementProvider` is a
deterministic reference adapter for tests and local development.

## Knowledge and Room tool bridges

`KnowledgeBundleRegistry` stores immutable, content-addressed knowledge bundle
revisions. Each semantic version is bound to one SHA-256 digest, documents are
size/count bounded and exact retries return the existing revision. Published
agent definitions reference bundles through `knowledgeRefs`.

`registerAgentRoomToolBridges` installs provider-neutral tools for listing and
reading authorized knowledge, saving/searching scoped memory and emitting
versioned artifacts. Memory and artifacts pass through `RoomService`, retaining
tenant isolation, policy boundaries and provenance. The standard knowledge
resolver reads references from the published agent revision rather than model
input.

## Promote a Session

`promoteSessionToRoom` atomically turns a completed ephemeral simulation into a
governed Room through `RoomService`. Session speakers become Room participants
and the bounded Session transcript becomes ordinary Room messages; no second
durable simulation model is introduced.

```ts
import { promoteSessionToRoom } from "@agentplat/rooms";

const promotion = await promoteSessionToRoom(service, {
  tenantId: "tenant-a",
  session: sessionResult,
  speakers,
  room: {
    title: "Approved negotiation",
    goal: "Review and operationalize the simulated agreement",
  },
});
```

Incomplete sessions require `allowIncomplete: true`. Promotion records source
session, turn and timestamp metadata so consumers do not mistake the imported
transcript for messages originally authored inside the Room lifecycle.
