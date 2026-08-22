import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  defaultPostgresSchema,
  getPostgresMigrationStatus,
  postgresRollbackConfirmation,
  rollbackPostgresMigration,
  runPostgresMigrations,
} from "@agentplat/postgres";
import type {
  PostgresMigration,
  PostgresMigrationStatus,
} from "@agentplat/postgres";
import type { Pool } from "pg";

const applicationId = "@agentplat/rooms-postgres";
const initialMigrationName = "001_agent_rooms";
const executionSessionsMigrationName = "002_room_execution_sessions";
const agentRegistryMigrationName = "003_agent_definition_registry";
const roomHandoffsMigrationName = "004_room_handoffs";
const roomCoordinationMigrationName = "005_room_coordination";
const humanContributionsMigrationName = "006_human_contributions";
const knowledgeBundlesMigrationName = "007_knowledge_bundles";
const roomPlansMigrationName = "008_room_plans";
const participantMembershipMigrationName = "009_participant_membership";
const operationalOutboxMigrationName = "010_operational_outbox";
const projectionCheckpointsMigrationName = "011_projection_checkpoints";

/** Filesystem directory containing the packaged ordered SQL migrations. */
export const migrationDirectory = fileURLToPath(
  new URL("../migrations/", import.meta.url),
);

/** Schema ownership options shared by Agent Room migration operations. */
export interface RoomPostgresMigrationOptions {
  schema?: string;
  createSchema?: boolean;
}

async function migrations(): Promise<PostgresMigration[]> {
  const [
    initialUp,
    initialDown,
    executionSessionsUp,
    executionSessionsDown,
    agentRegistryUp,
    agentRegistryDown,
    roomHandoffsUp,
    roomHandoffsDown,
    roomCoordinationUp,
    roomCoordinationDown,
    humanContributionsUp,
    humanContributionsDown,
    knowledgeBundlesUp,
    knowledgeBundlesDown,
    roomPlansUp,
    roomPlansDown,
    participantMembershipUp,
    participantMembershipDown,
    operationalOutboxUp,
    operationalOutboxDown,
    projectionCheckpointsUp,
    projectionCheckpointsDown,
  ] = await Promise.all([
    readFile(
      new URL(`../migrations/${initialMigrationName}.up.sql`, import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        `../migrations/${initialMigrationName}.down.sql`,
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        `../migrations/${executionSessionsMigrationName}.up.sql`,
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        `../migrations/${executionSessionsMigrationName}.down.sql`,
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        `../migrations/${agentRegistryMigrationName}.up.sql`,
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        `../migrations/${agentRegistryMigrationName}.down.sql`,
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        `../migrations/${roomHandoffsMigrationName}.up.sql`,
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        `../migrations/${roomHandoffsMigrationName}.down.sql`,
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        `../migrations/${roomCoordinationMigrationName}.up.sql`,
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        `../migrations/${roomCoordinationMigrationName}.down.sql`,
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        `../migrations/${humanContributionsMigrationName}.up.sql`,
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        `../migrations/${humanContributionsMigrationName}.down.sql`,
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        `../migrations/${knowledgeBundlesMigrationName}.up.sql`,
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        `../migrations/${knowledgeBundlesMigrationName}.down.sql`,
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        `../migrations/${roomPlansMigrationName}.up.sql`,
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        `../migrations/${roomPlansMigrationName}.down.sql`,
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        `../migrations/${participantMembershipMigrationName}.up.sql`,
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        `../migrations/${participantMembershipMigrationName}.down.sql`,
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        `../migrations/${operationalOutboxMigrationName}.up.sql`,
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        `../migrations/${operationalOutboxMigrationName}.down.sql`,
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        `../migrations/${projectionCheckpointsMigrationName}.up.sql`,
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        `../migrations/${projectionCheckpointsMigrationName}.down.sql`,
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  return [
    {
      version: 1,
      name: initialMigrationName,
      up: initialUp,
      down: initialDown,
      destructiveDown: true,
      adoptIf: `
        SELECT
          to_regclass('__AGENTPLAT_SCHEMA__.rooms') IS NOT NULL
          AND to_regclass('__AGENTPLAT_SCHEMA__.events') IS NOT NULL
          AND to_regclass('__AGENTPLAT_SCHEMA__.artifact_versions') IS NOT NULL
          AND to_regclass('__AGENTPLAT_SCHEMA__.agentplat_schema_migrations') IS NOT NULL
          AS present
      `,
    },
    {
      version: 2,
      name: executionSessionsMigrationName,
      up: executionSessionsUp,
      down: executionSessionsDown,
      destructiveDown: true,
    },
    {
      version: 3,
      name: agentRegistryMigrationName,
      up: agentRegistryUp,
      down: agentRegistryDown,
      destructiveDown: true,
    },
    {
      version: 4,
      name: roomHandoffsMigrationName,
      up: roomHandoffsUp,
      down: roomHandoffsDown,
      destructiveDown: true,
    },
    {
      version: 5,
      name: roomCoordinationMigrationName,
      up: roomCoordinationUp,
      down: roomCoordinationDown,
      destructiveDown: true,
    },
    {
      version: 6,
      name: humanContributionsMigrationName,
      up: humanContributionsUp,
      down: humanContributionsDown,
      destructiveDown: true,
    },
    {
      version: 7,
      name: knowledgeBundlesMigrationName,
      up: knowledgeBundlesUp,
      down: knowledgeBundlesDown,
      destructiveDown: true,
    },
    {
      version: 8,
      name: roomPlansMigrationName,
      up: roomPlansUp,
      down: roomPlansDown,
      destructiveDown: true,
    },
    {
      version: 9,
      name: participantMembershipMigrationName,
      up: participantMembershipUp,
      down: participantMembershipDown,
      destructiveDown: true,
    },
    {
      version: 10,
      name: operationalOutboxMigrationName,
      up: operationalOutboxUp,
      down: operationalOutboxDown,
      destructiveDown: true,
    },
    {
      version: 11,
      name: projectionCheckpointsMigrationName,
      up: projectionCheckpointsUp,
      down: projectionCheckpointsDown,
      destructiveDown: true,
    },
  ];
}

/** Applies every pending Agent Room migration under an advisory lock. */
export async function runMigrations(
  pool: Pool,
  options: RoomPostgresMigrationOptions = {},
): Promise<PostgresMigrationStatus> {
  return runPostgresMigrations(pool, {
    applicationId,
    schema: options.schema,
    createSchema: options.createSchema,
    migrations: await migrations(),
  });
}

/** Reads and verifies the current Agent Room migration head and checksums. */
export async function getMigrationStatus(
  pool: Pool,
  options: RoomPostgresMigrationOptions = {},
): Promise<PostgresMigrationStatus> {
  return getPostgresMigrationStatus(pool, {
    applicationId,
    schema: options.schema,
    migrations: await migrations(),
  });
}

/** Returns the exact confirmation required for one destructive rollback. */
export function rollbackConfirmation(
  schema = defaultPostgresSchema,
  version = 11,
): string {
  return postgresRollbackConfirmation(applicationId, schema, version);
}

/** Roll back one version only after explicit version and data-loss confirmation. */
export async function rollbackMigrations(
  pool: Pool,
  options: RoomPostgresMigrationOptions & {
    expectedCurrentVersion: number;
    confirm: string;
    allowDataLoss?: boolean;
  },
): Promise<PostgresMigrationStatus> {
  return rollbackPostgresMigration(pool, {
    applicationId,
    schema: options.schema,
    createSchema: false,
    migrations: await migrations(),
    expectedCurrentVersion: options.expectedCurrentVersion,
    confirm: options.confirm,
    allowDataLoss: options.allowDataLoss,
  });
}
