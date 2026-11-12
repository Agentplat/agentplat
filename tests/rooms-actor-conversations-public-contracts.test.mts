import {
  ActorRoomConversations,
  InMemoryRoomConversationStore,
  type RoomActorAccess,
  type RoomAccessPolicy,
  type RoomConversation,
  type PrivateRoomMessage,
  type RoomConversationStore,
  type ActorConversationContext,
} from "@agentplat/rooms";
import {
  PostgresRoomConversationStore,
  runRoomConversationMigrations,
  getRoomConversationMigrationStatus,
  roomConversationMigrations,
} from "@agentplat/rooms-postgres";
import {
  ArtifactService,
  InMemoryArtifactStore,
  type ArtifactRoomAccessPolicy,
} from "@agentplat/artifacts";
const access: RoomActorAccess = { tenantId: "t", roomId: "r", actorId: "a" };
const policy: RoomAccessPolicy = async (_access, action) => action === "read";
const store: RoomConversationStore = new InMemoryRoomConversationStore();
const service = new ActorRoomConversations(store, policy);
async function contracts() {
  const d: RoomConversation = await service.create(access);
  const m: PrivateRoomMessage = await service.append(access, d.id, {
    content: "hello",
  });
  const c: ActorConversationContext = await service.context(access, d.id);
  await service.resolveReferences(access, d.id, [m.id]);
  return { c, view: await service.getRoomState(access) };
}
const roomAccess: ArtifactRoomAccessPolicy = async (a) => a.action === "read";
const artifacts = new ArtifactService({
  store: new InMemoryArtifactStore(),
  roomAccess,
});
void artifacts.listRevisions;
void contracts;
void [
  PostgresRoomConversationStore,
  runRoomConversationMigrations,
  getRoomConversationMigrationStatus,
  roomConversationMigrations,
];
