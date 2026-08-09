import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";

import {
  migrationDirectory,
  rollbackConfirmation,
} from "../dist/index.js";

const migrationNames = [
  "001_collective_host_runtime",
  "002_collective_host_interop",
  "003_collective_host_assurance",
  "004_anytime_semantic_guarantees",
  "005_collective_host_telemetry_outbox",
  "006_semantic_horizon_budgets",
  "007_assurance_effect_checkpoints",
  "008_autonomous_node_advances",
];

test("package ships the complete eight-migration host chain", async () => {
  await Promise.all(
    migrationNames.flatMap((name) =>
      ["up", "down"].map((direction) =>
        access(`${migrationDirectory}/${name}.${direction}.sql`),
      ),
    ),
  );
});

test("rollback confirmation defaults to migration head 008", () => {
  assert.equal(
    rollbackConfirmation("agentplat_release"),
    "ROLLBACK @agentplat/collective-host-postgres VERSION 8 FROM agentplat_release",
  );
});
