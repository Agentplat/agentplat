import {
  getMigrationStatus,
  rollbackMigrations as rollbackAtVersion,
  rollbackConfirmation,
} from "../dist/index.js";
/** Legacy governance tests target a particular historical rollback. First remove the additive Planner schema. */
export async function rollbackMigrations(pool, options) {
  if (
    options.expectedCurrentVersion === 18 &&
    (await getMigrationStatus(pool, { schema: options.schema }))
      .currentVersion === 19
  ) {
    await rollbackAtVersion(pool, {
      schema: options.schema,
      expectedCurrentVersion: 19,
      confirm: rollbackConfirmation(options.schema, 19),
      allowDataLoss: true,
    });
  }
  return rollbackAtVersion(pool, options);
}
