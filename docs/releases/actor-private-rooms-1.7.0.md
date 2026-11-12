# AgentPlat 1.7.0 coordinated release candidate

This cohort adds opt-in actor-private conversations and Room-shared artifacts.
All 70 public packages move together to 1.7.0; unrelated uncommitted source work
is excluded. The release branch starts from the previously published 1.6.0 main.
Publication must use the protected release-level OIDC workflow after required CI
and a dry run; this document is not a registry availability claim.

## Consumer adoption

Install matching registry versions after publication is verified:

```sh
npm install --save-exact @agentplat/rooms@1.7.0 @agentplat/rooms-postgres@1.7.0 @agentplat/artifacts@1.7.0 @agentplat/artifacts-postgres@1.7.0
```

Align any other direct `@agentplat/*` dependencies to 1.7.0 to retain a single
cohort. No `file:`, copied code, or local package links are required.

Room exports: `ActorRoomConversations`, `InMemoryRoomConversationStore`,
`RoomActorAccess`, `RoomAccessAction`, `RoomAccessPolicy`, `RoomConversation`,
`PrivateRoomMessage`, `RoomConversationStore`, and `ActorConversationContext`.
PostgreSQL exports: `PostgresRoomConversationStore`, `roomConversationMigrations`,
`runRoomConversationMigrations`, and `getRoomConversationMigrationStatus`.
Artifact exports: `ArtifactRoomAccessPolicy`, additive
`ArtifactServiceOptions.roomAccess`, and `ArtifactService.listRevisions`.

Run the independent conversation ledger explicitly:

```ts
await runRoomConversationMigrations(pool, { schema: DB_SCHEMA });
const conversations = new ActorRoomConversations(
  new PostgresRoomConversationStore(pool, DB_SCHEMA), liveHostPolicy,
);
await conversations.backfill({
  tenantId, roomId, conversationId, ownerActorId,
  humanParticipantIds, messages,
});
```

The host must verify each legacy audience and grouping before backfill. Unknown
ownership fails closed. This does not migrate or erase the legacy Room transcript.
Artifact schema remains at V2; persisted Room links must be verified before opting
into Room authorization. No retention, identity-provider, email, or billing policy
is installed by the library. See [the host integration contract](../rooms/actor-private-conversations.md).

## Validation

Focused tests cover owner plus two clients, foreign IDs, forged replies and
references, audience-bound context and responses, revocation, explicit backfill,
shared artifact creator/writer attribution, historical revisions, CAS and tenant
isolation. PostgreSQL conformance checks migration idempotency, independent ledger,
restart durability and concurrent CAS. The existing artifact package consumer now
also executes these new contracts against exact packed tarballs and, after
publication, registry-only installations. Full release CI remains required.

These are bounded library and distribution checks, not validation of a consuming
application's authentication, tools, runtime isolation or production workload.
