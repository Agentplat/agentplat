import test from "node:test";
import assert from "node:assert/strict";
import {
  PostgresAgentRegistryStore,
  registryMigrations,
} from "../dist/index.js";
test("scoped SQL, CAS and migration integrity", async () => {
  const calls = [];
  const pool = {
    query: async (sql, args) => {
      calls.push({ sql, args });
      return { rowCount: 1, rows: [] };
    },
  };
  const store = new PostgresAgentRegistryStore(pool, "registry_test");
  await store.get("tenant", "x' OR true --");
  await store.list("tenant", undefined, 20);
  assert.deepEqual(calls[0].args, ["tenant", "x' OR true --"]);
  assert.match(calls[0].sql, /tenant_id=\$1 AND entry_id=\$2/);
  assert.match(calls[1].sql, /ORDER BY entry_id LIMIT \$3/);
  assert.throws(
    () => new PostgresAgentRegistryStore(pool, "bad;DROP"),
    /identifier/,
  );
  assert.ok(
    registryMigrations[0].up.includes("PRIMARY KEY (tenant_id, entry_id)"),
  );
  assert.equal(registryMigrations[0].destructiveDown, true);
});
