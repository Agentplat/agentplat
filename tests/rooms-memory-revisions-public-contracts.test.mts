import {
  MemoryRevisionServiceV1,
  InMemoryMemoryRevisionStoreV1,
  resolveMemoryRevisionSnapshotV1,
  registerMemoryRevisionReadToolV1,
  AgentDefinitionChangeServiceV1,
  type MemoryRevisionAccessV1,
  type MemoryRevisionInputV1,
  type MemoryRevisionStoreV1,
} from "@agentplat/rooms";
import {
  PostgresMemoryRevisionStoreV1,
  runMemoryRevisionMigrations,
} from "@agentplat/rooms-postgres";
const access: MemoryRevisionAccessV1<Request> = {
  authenticate: async () => null,
  authorize: async () => false,
};
const store: MemoryRevisionStoreV1 = new InMemoryMemoryRevisionStoreV1();
const service = new MemoryRevisionServiceV1(store, access);
void service;
void PostgresMemoryRevisionStoreV1;
void runMemoryRevisionMigrations;
void resolveMemoryRevisionSnapshotV1;
void registerMemoryRevisionReadToolV1;
void AgentDefinitionChangeServiceV1;
declare const input: MemoryRevisionInputV1;
const audience: MemoryRevisionInputV1["audience"] = {
  kind: "personal",
  // @ts-expect-error personal memory requires a verified subject, not legacy Room scope
  scopeId: "agent",
};
void audience;
void input;
