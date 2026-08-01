import { createPostgresPool, defaultPostgresSchema } from "@agentplat/postgres";
import {
  getMigrationStatus,
  rollbackConfirmation,
  rollbackMigrations,
  runMigrations,
} from "./migrations.js";

const command = process.argv[2] ?? "up";
const schema = process.env.AGENTPLAT_POSTGRES_SCHEMA ?? defaultPostgresSchema;
const pool = createPostgresPool();

try {
  if (command === "up") {
    console.log(
      JSON.stringify(
        await runMigrations(pool, {
          schema,
          createSchema: process.env.AGENTPLAT_POSTGRES_CREATE_SCHEMA === "1",
        }),
      ),
    );
  } else if (command === "status") {
    console.log(JSON.stringify(await getMigrationStatus(pool, { schema })));
  } else if (command === "down") {
    const expectedCurrentVersion = Number(
      process.env.AGENTPLAT_POSTGRES_EXPECTED_VERSION,
    );
    const confirm = process.env.AGENTPLAT_POSTGRES_ROLLBACK_CONFIRM ?? "";
    if (!Number.isSafeInteger(expectedCurrentVersion)) {
      throw new Error("AGENTPLAT_POSTGRES_EXPECTED_VERSION is required");
    }
    console.log(
      JSON.stringify(
        await rollbackMigrations(pool, {
          schema,
          expectedCurrentVersion,
          confirm,
          allowDataLoss: process.env.AGENTPLAT_POSTGRES_ALLOW_DATA_LOSS === "1",
        }),
      ),
    );
  } else if (command === "confirmation") {
    console.log(rollbackConfirmation(schema));
  } else {
    throw new Error(`Unsupported migration command: ${command}`);
  }
} finally {
  await pool.end();
}
