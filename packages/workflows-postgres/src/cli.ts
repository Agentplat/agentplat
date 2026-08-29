import { Pool } from "pg";

import {
  getMigrationStatus,
  rollbackConfirmation,
  rollbackMigrations,
  runMigrations,
} from "./migrations.js";

const command = process.argv[2];
const schema = process.env.AGENTPLAT_POSTGRES_SCHEMA;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  if (command === "up") {
    console.log(JSON.stringify(await runMigrations(pool, { schema })));
  } else if (command === "status") {
    console.log(JSON.stringify(await getMigrationStatus(pool, { schema })));
  } else if (command === "confirmation") {
    console.log(rollbackConfirmation(schema));
  } else if (command === "down") {
    const expectedCurrentVersion = Number(
      process.env.AGENTPLAT_EXPECTED_MIGRATION_VERSION,
    );
    const confirm = process.env.AGENTPLAT_ROLLBACK_CONFIRMATION ?? "";
    console.log(
      JSON.stringify(
        await rollbackMigrations(pool, {
          schema,
          expectedCurrentVersion,
          confirm,
          allowDataLoss: process.env.AGENTPLAT_ALLOW_DATA_LOSS === "1",
          verifiedBackup: process.env.AGENTPLAT_VERIFIED_BACKUP === "1",
        }),
      ),
    );
  } else {
    throw new Error(
      "Usage: workflows-postgres migration [up|status|confirmation|down]",
    );
  }
} finally {
  await pool.end();
}
