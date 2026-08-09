import assert from "node:assert/strict";
import test from "node:test";

import { digestControlJsonV1 } from "../../inference-control/dist/canonical.js";
import { PostgresSemanticHorizonBudgetRepositoryV1 } from "../dist/repositories.js";

const sha = (character) => `sha256:${character.repeat(64)}`;

test("semantic horizon PostgreSQL CAS rejects a mismatched predecessor before SQL", async () => {
  let queries = 0;
  const pool = {
    async query() {
      queries += 1;
      return { rowCount: 1, rows: [] };
    },
  };
  const body = {
    format: "agentplat.inference-control.semantic-horizon-budget-state.v1",
    schemaVersion: 1,
    stateKey: "budget:one",
    revision: 2,
    guaranteeStateDigest: sha("1"),
    guaranteeSequence: 1,
    guaranteeLogicalTimeMs: 10,
    policyDigest: sha("2"),
    assumptionsDigest: sha("3"),
    controlPolicyDigest: sha("4"),
    directive: "shorten_horizon",
    decisionBindingDigest: sha("5"),
    remainingSteps: 1,
    consumptionEpoch: 1,
    compactedConsumptionCount: 0,
    compactedConsumptionDigest: null,
    consumptions: [],
    predecessorStateDigest: sha("6"),
  };
  const next = {
    ...body,
    stateDigest: digestControlJsonV1("state", body),
  };
  const repository = new PostgresSemanticHorizonBudgetRepositoryV1(
    pool,
    "scope:one",
  );
  assert.equal(
    await repository.compareAndSet({
      stateKey: "budget:one",
      expectedRevision: 1,
      expectedStateDigest: sha("7"),
      next,
    }),
    false,
  );
  assert.equal(queries, 0);
});
