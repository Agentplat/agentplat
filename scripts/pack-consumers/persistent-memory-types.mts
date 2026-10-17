import type { createPostgresPool } from "@agentplat/rooms-postgres";
import {
  MemoryRevisionServiceV1,
  resolveMemoryRevisionSnapshotV1,
  registerMemoryRevisionReadToolV1,
  AgentDefinitionChangeServiceV1,
  type MemoryRevisionAccessV1,
  type MemoryRevisionInputV1,
} from "@agentplat/rooms";
import {
  PostgresMemoryRevisionStoreV1,
  runMemoryRevisionMigrations,
  getMemoryRevisionMigrationStatus,
  rollbackMemoryRevisionMigrations,
  memoryRevisionRollbackConfirmation,
} from "@agentplat/rooms-postgres";
import { PostgresWorkflowStoreV1 } from "@agentplat/workflows-postgres";
declare const pool: ReturnType<typeof createPostgresPool>;
const access: MemoryRevisionAccessV1<Request> = {
  authenticate: async () => null,
  authorize: async () => false,
};
const memory = new MemoryRevisionServiceV1(
  new PostgresMemoryRevisionStoreV1(pool),
  access,
);
declare const request: Request;
declare const input: MemoryRevisionInputV1;
void memory.append(request, input);
void resolveMemoryRevisionSnapshotV1(memory, request, ["preference"]);
void registerMemoryRevisionReadToolV1;
void AgentDefinitionChangeServiceV1;
void runMemoryRevisionMigrations;
void getMemoryRevisionMigrationStatus;
void rollbackMemoryRevisionMigrations;
void memoryRevisionRollbackConfirmation;
void PostgresWorkflowStoreV1;

// The wider consumer surface must type-check with the same coordinated cohort.
import { createAgentplat } from "@agentplat/framework";
import { chatModel } from "@agentplat/model-openai-compatible";
import { AgentRoomGateProviderV1 } from "@agentplat/workflows-rooms";
void createAgentplat;
void chatModel;
void AgentRoomGateProviderV1;
