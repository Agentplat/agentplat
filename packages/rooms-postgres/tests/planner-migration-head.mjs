import {
  getMigrationStatus,
  rollbackMigrations as rollbackAtVersion,
  rollbackConfirmation,
} from "../dist/index.js";
/** Legacy governance tests target a historical rollback after removing newer additive schemas. */
export async function rollbackMigrations(pool, options) {
  let current = (await getMigrationStatus(pool, { schema: options.schema }))
    .currentVersion;
  while (current > options.expectedCurrentVersion && current >= 19) {
    await rollbackAtVersion(pool, {
      schema: options.schema,
      expectedCurrentVersion: current,
      confirm: rollbackConfirmation(options.schema, current),
      allowDataLoss: true,
    });
    current--;
  }
  return rollbackAtVersion(pool, options);
}
