# Actor-private conversations V1: integration contract

Target coordinated npm cohort: **1.7.0**, additive to published 1.6.0 and the
consumer's 1.5.1 baseline. Install matching versions from npmjs; do not use local
paths, workspace links, or copied source in a consuming application. Publication
and registry verification are required before describing this cohort as available.

## Minimum contract (defined before implementation)

`@agentplat/rooms` exports `RoomActorAccess`, `RoomAccessPolicy`,
`RoomConversation`, `PrivateRoomMessage`, `RoomConversationStore`,
`InMemoryRoomConversationStore`, and `ActorRoomConversations`.
The host supplies verified tenant/actor identity and a live policy resolving Room
membership and read/write/execute permission. Room ownership grants no exception
to conversation privacy. Agent identity is separate from the human audience.

`ActorRoomConversations` creates/lists/reads private conversations, appends human
messages, resolves message references, searches, builds bounded execution context,
and executes a trusted callback with only that conversation's messages. Replies,
references, delegation context, and agent responses inherit the persisted audience.
Foreign IDs fail before callbacks execute. No client-provided audience is accepted.
The host must not give callbacks unscoped Room readers, retrieval, memory, or agents
with retained cross-request state. Each delegation uses the supplied context.

Legacy `RoomService`, repository, context builder, tools, live views, planners,
Room events, and memory APIs remain **trusted internal APIs**, not authorized HTTP
endpoints. Existing single-human Rooms retain their behavior. This additive facade
is the private-conversation execution entry point; it does not retrofit existing
background workers. Shared deployments must route all private work through it.

Artifacts use an opt-in `ArtifactServiceOptions.roomAccess` policy: persisted
`links.roomId` is the access scope; `ownerId` stays the creator, revisions record
the actual writer. Room policy is mandatory for every linked-artifact operation
when configured, including creator reads. Room scope cannot change on update.
Unlinked legacy artifacts retain owner access. The host binds artifact tools to a
verified request context and prevents a model from selecting another Room.

## Migration and host responsibilities

Conversations use a separate versioned ledger in `rooms-postgres`;
`runRoomConversationMigrations` installs V1, without changing the existing Room
migration head. `PostgresRoomConversationStore` persists CAS-protected documents.
`backfill` takes an explicit legacy message set and a verified human owner mapping;
missing/ambiguous ownership fails closed. No heuristic owner promotion occurs.
Legacy messages remain internal until explicitly migrated. Backfill is immutable
and records the migration source; repeated imports must use a stable conversation ID.
Artifacts already persist room links and author revisions in JSON, so no artifact
schema migration is necessary. Existing links must be verified before enabling
Room access; the policy must deny unverified links during rollout.

Authentication, invitations, email, sessions, tool authorization, owner connections
and budget, audit delivery, and retention policy belong to the host. Membership
revocation is checked on every operation and again before persisting agent output;
it cannot undo an external effect already performed by a host callback.

## Host web example

```ts
import { ActorRoomConversations } from '@agentplat/rooms';
import { PostgresRoomConversationStore,
  runRoomConversationMigrations } from '@agentplat/rooms-postgres';
import { ArtifactService } from '@agentplat/artifacts';

await runRoomConversationMigrations(pool, { schema: 'app' });
const conversations = new ActorRoomConversations(
  new PostgresRoomConversationStore(pool, 'app'),
  async (access, action) => hostPolicy.isActiveMemberAllowed(access, action),
);
// Construct from server-verified identity and an authorized route Room.
const access = { tenantId: session.tenantId, actorId: session.subject, roomId };
const conversation = await conversations.create(access);
const question = await conversations.append(access, conversation.id, {
  content: request.text,
});
const artifacts = new ArtifactService({
  store: artifactStore,
  // Bind tools to this Room; do not trust a model-supplied roomId.
  roomAccess: async scope => scope.roomId === access.roomId &&
    scope.tenantId === access.tenantId && scope.actorId === access.actorId &&
    hostPolicy.isActiveMemberAllowed(scope, scope.action),
});
await conversations.execute(access, conversation.id, {
  agentId: hostSelectedAgent.id, replyTo: question.id,
}, async context => {
  // Fresh execution state per audience. Delegates receive only this context.
  // Artifact tools use the verified human context; owner billing/connections
  // are separate server-side tool policy, never identity impersonation.
  return hostRuntime.runFresh({ context, artifacts, tools: authorizedOwnerTools });
});
// HTTP state/search routes use these, never RoomService.getRoomState.
await conversations.getRoomState(access);
await conversations.search(access, request.query);
```

`create(access)`, `list(access)`, `read(access, conversationId)`,
`append(access, conversationId, { content, replyTo?, references? })`,
`resolveReferences(access, conversationId, messageIds)`, `search(access, query)`,
`context(access, conversationId, limit = 20)`, and `getRoomState(access)` are
application APIs. `execute(access, conversationId, { agentId, replyTo?, references? },
run)` is a trusted host execution bridge. `getRoomState` deliberately returns only
`tenantId`, `roomId`, `actorId`, and authorized `conversations`; no raw Room state
is spread into a response. `context` is bounded; `execute` passes the authorized
conversation transcript, which the host may bound further before inference.

`backfill({ tenantId, roomId, conversationId, ownerActorId, humanParticipantIds,
messages })` is migration-only. The host certifies the participant-to-human mapping
and groups legacy agent replies with their human conversation; the library rejects
unmapped human participants, unsupported message roles, cross-Room/tenant inputs,
and duplicate IDs. If a mixed transcript cannot be split with verified provenance,
do not import it. An unknown audience has no readable shared representation.
A repeated backfill raises `CONFLICT`, without rewriting its original audience.

`ArtifactService.create/read/update/listRevisions` honor `roomAccess` when configured.
All revisions retain their original `authorId`; event payloads include `creatorId`,
`actorId`, and `roomId`. `ownerId` is legacy creator attribution, not a privileged
read grant in this profile. Historical revisions require current-head authorization and matching persisted
Room scope; historical scope mismatches fail closed. Verify historical links as
well as heads before opting in. Update rejects scope
changes. Private conversation text must only enter an artifact through an explicit
host-approved publication action: every Room member can read shared artifacts.

## Adoption checklist and evidence boundary

Before enabling sharing, migrate verified legacy conversation groups, verify artifact
Room links, wire live host policy, replace raw Room endpoints/retrieval and background
workers for private work, and use fresh runtime/delegate state. Never publish raw
Room events, task instructions, snapshots, memory, or tool logs to members. The
existing participant-membership coordinator governs agent routing, not authenticated
human membership; `RoomAccessPolicy` intentionally delegates that authority to the host.

The source tests cover owner plus two clients, foreign conversation/message IDs,
reply/reference forging, context, revocation, CAS, explicit backfill, artifacts,
PostgreSQL migration/restart and ledger isolation. They establish these library
boundaries, not production validation of a consuming web application. No fixed
retention period, transport authentication, invitation workflow or owner tool grant
is introduced here.

Verified locally on 2026-11-12: TypeScript checks for the four packages and public
consumer contract; 139 Rooms tests; 17 focused/conformance/artifact tests including
live PostgreSQL (the two conversation tests occur in both commands). Commands:

```sh
node node_modules/typescript/bin/tsc -p packages/rooms/tsconfig.json
node node_modules/typescript/bin/tsc -p packages/rooms-postgres/tsconfig.json
node node_modules/typescript/bin/tsc -p packages/artifacts/tsconfig.json
node node_modules/typescript/bin/tsc -p packages/artifacts-postgres/tsconfig.json
node node_modules/typescript/bin/tsc --noEmit --module NodeNext --moduleResolution NodeNext --target ES2022 --strict --skipLibCheck tests/rooms-actor-conversations-public-contracts.test.mts
node --test tests/rooms*.test.mjs
AGENTPLAT_POSTGRES_TEST=1 PGDATABASE=postgres node --test packages/artifacts-postgres/tests/*.test.mjs packages/rooms-postgres/tests/actor-conversations.test.mjs tests/rooms-actor-conversations.test.mjs packages/artifacts/tests/*.test.mjs
```

The local pnpm launcher tried to install dependencies and rejected an ignored
esbuild build script; verification used the already installed TypeScript compiler.
No dependency/script approval settings were changed.
