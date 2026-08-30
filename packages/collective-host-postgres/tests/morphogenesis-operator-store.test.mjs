import assert from "node:assert/strict";
import test from "node:test";

import { digestPlanningJsonV1 } from "@agentplat/collective-planning";
import {
  MorphogenesisOperatorExecutionRuntimeV2,
  createMorphogenesisOperatorOutcomeReceiptV2,
} from "@agentplat/collective-runtime/morphogenesis";
import {
  PostgresMorphogenesisOperatorExecutionStoreV2,
  PostgresMorphogenesisOperatorOutcomeStoreV2,
  PostgresMorphogenesisTeamTopologyStateStoreV2,
} from "../dist/morphogenesis-operator.js";
import {
  activateTeamTopologyTransformationV1,
  certifyTeamTopologyTransformationV1,
  createTeamTopologyNodeV1,
  createTeamTopologyStateV1,
  createTeamTopologyTransformationRequestV1,
  teamTopologyDigestV1,
} from "@agentplat/collective-runtime/team-topology-transformation";

const sha = (character) => `sha256:${character.repeat(64)}`;

class FakePool {
  rows = new Map();
  async query(sql, params) {
    const kind = sql.includes("morphogenesis-team-topology")
      ? "morphogenesis-team-topology"
      : sql.includes("morphogenesis-operator-outcome")
      ? "morphogenesis-operator-outcome"
      : "morphogenesis-operator-execution";
    const key = `${params[0]}:${kind}:${params[1]}`;
    if (sql.includes("SELECT revision")) {
      const row = this.rows.get(key);
      return { rowCount: row ? 1 : 0, rows: row ? [structuredClone(row)] : [] };
    }
    if (sql.includes("SELECT state_digest")) {
      const row = this.rows.get(key);
      return { rowCount: row ? 1 : 0, rows: row ? [structuredClone(row)] : [] };
    }
    if (sql.includes("INSERT INTO")) {
      if (this.rows.has(key)) return { rowCount: 0, rows: [] };
      const outcome = kind === "morphogenesis-operator-outcome";
      const topology = kind === "morphogenesis-team-topology";
      this.rows.set(key, {
        revision: outcome || topology ? 0 : params[2],
        logical_time_high_water_ms: topology ? 0 : outcome ? params[2] : params[3],
        state_digest: topology ? params[2] : outcome ? params[3] : params[4],
        state: JSON.parse(topology ? params[3] : outcome ? params[4] : params[5]),
      });
      return { rowCount: 1, rows: [] };
    }
    if (sql.includes("UPDATE")) {
      const row = this.rows.get(key);
      if (kind === "morphogenesis-team-topology") {
        if (!row || Number(row.revision) !== params[2] || row.state_digest !== params[3])
          return { rowCount: 0, rows: [] };
        this.rows.set(key, {
          revision: params[4],
          logical_time_high_water_ms: params[4],
          state_digest: params[5],
          state: JSON.parse(params[6]),
        });
        return { rowCount: 1, rows: [] };
      }
      if (!row || Number(row.revision) !== params[2] ||
          row.state_digest !== params[3] ||
          Number(row.logical_time_high_water_ms) > params[5])
        return { rowCount: 0, rows: [] };
      this.rows.set(key, {
        revision: params[4],
        logical_time_high_water_ms: params[5],
        state_digest: params[6],
        state: JSON.parse(params[7]),
      });
      return { rowCount: 1, rows: [] };
    }
    throw new Error(`unexpected SQL: ${sql}`);
  }
}

class Witness {
  heads = new Map();
  async verify(input) {
    const current = this.heads.get(`${input.scopeId}:${input.stateKind}:${input.stateKey}`);
    return current?.revision === input.revision && current?.digest === input.digest;
  }
  async record(input) {
    const key = `${input.scopeId}:${input.stateKind}:${input.stateKey}`;
    const current = this.heads.get(key);
    if (input.previousRevision === null ? Boolean(current) :
      !current || current.revision !== input.previousRevision || current.digest !== input.previousDigest)
      return false;
    this.heads.set(key, { revision: input.nextRevision, digest: input.nextDigest });
    return true;
  }
}

function emptyPlan() {
  const body = {
    schemaVersion: 2,
    planId: "plan:postgres-operator",
    operator: "realign_role",
    operationDigest: sha("1"),
    policyDigest: sha("2"),
    binding: {
      operator: "realign_role",
      roleRealignmentRequestDigest: sha("3"),
      currentRoleBindingDigest: sha("4"),
    },
    bindingDigest: sha("5"),
    compilerId: "compiler:test",
    compilerVersion: 1,
    compilerImplementationDigest: sha("6"),
    steps: [],
    compiledAtLogicalMs: 10,
    advisoryOnly: true,
  };
  return Object.freeze({
    ...body,
    planDigest: digestPlanningJsonV1("morphogenesis-compiled-operator-plan-v2", body),
  });
}

test("PostgreSQL operator execution store preserves CAS and reopens validated state", async () => {
  const pool = new FakePool();
  const witness = new Witness();
  const options = { scopeId: "tenant:operator", rollbackWitness: witness };
  const store = new PostgresMorphogenesisOperatorExecutionStoreV2(pool, options);
  const runtime = new MorphogenesisOperatorExecutionRuntimeV2({
    store,
    boundaries: {
      async execute() { throw new Error("empty plan"); },
      async reconcile() { throw new Error("empty plan"); },
    },
  });
  const initial = await runtime.initialize({
    stateKey: "operator-execution:postgres",
    plan: emptyPlan(),
    scopeDigest: sha("7"),
    proposalDigest: sha("8"),
    decisionDigest: sha("9"),
    authorizationDigest: sha("a"),
    authorityFenceDigest: sha("b"),
    expectedMorphologyEpoch: 1,
    logicalTimeMs: 20,
  });
  const completed = await runtime.advance({ stateKey: initial.stateKey, logicalTimeMs: 30 });
  assert.equal(completed.status, "completed");
  const reopened = new PostgresMorphogenesisOperatorExecutionStoreV2(pool, options);
  assert.equal((await reopened.load(initial.stateKey)).stateDigest, completed.stateDigest);
  assert.equal(await reopened.save({
    state: completed,
    expectedRevision: initial.revision,
    expectedStateDigest: initial.stateDigest,
  }), true, "an exact retained state is idempotent");
  witness.heads.clear();
  await assert.rejects(reopened.load(initial.stateKey), /witness diverged/);
});

test("PostgreSQL operator outcomes are immutable, idempotent, and witness guarded", async () => {
  const pool = new FakePool();
  const witness = new Witness();
  const options = { scopeId: "tenant:outcome", rollbackWitness: witness };
  const store = new PostgresMorphogenesisOperatorOutcomeStoreV2(pool, options);
  const receipt = createMorphogenesisOperatorOutcomeReceiptV2({
    receiptId: "operator-outcome:postgres",
    operatorExecutionStateDigest: sha("1"),
    planDigest: sha("2"),
    proposalDigest: sha("3"),
    decisionDigest: sha("4"),
    authorizationDigest: sha("5"),
    authorityFenceDigest: sha("6"),
    stepReceiptRoot: sha("7"),
    disposition: "success",
    outcomeEvidenceDigests: [sha("8")],
    resultingSnapshotDigest: sha("9"),
    resultingMorphologyEpoch: 2,
    evaluatedAtLogicalMs: 40,
  });
  assert.equal(await store.save(receipt), true);
  assert.equal(await new PostgresMorphogenesisOperatorOutcomeStoreV2(pool, options).save(receipt), true);
  assert.equal((await store.load(receipt.planDigest)).receiptDigest, receipt.receiptDigest);
  const conflicting = createMorphogenesisOperatorOutcomeReceiptV2({
    ...receipt,
    receiptId: "operator-outcome:conflict",
  });
  assert.equal(await store.save(conflicting), false);
  witness.heads.clear();
  await assert.rejects(store.load(receipt.planDigest), /witness diverged/);
});

test("PostgreSQL Dynamic Topology reopens certification and activation through CAS", async () => {
  const pool = new FakePool();
  const witness = new Witness();
  const options = { scopeId: "tenant:topology", rollbackWitness: witness };
  const source = createTeamTopologyNodeV1({
    teamId: "team:source", parentTeamIds: [], memberIds: ["agent:a", "agent:b"],
    coordinatorId: "agent:a", membershipEpoch: 1,
    membershipConfigurationDigest: sha("1"),
  });
  const initial = createTeamTopologyStateV1({
    topologyId: "topology:postgres", epoch: 1, topology: [source],
  });
  const targets = ["a", "b"].map((suffix) => createTeamTopologyNodeV1({
    teamId: `team:target:${suffix}`, parentTeamIds: [source.teamId],
    memberIds: [`agent:${suffix}`], coordinatorId: `agent:${suffix}`,
    membershipEpoch: 2, membershipConfigurationDigest: sha("2"),
  }));
  const request = createTeamTopologyTransformationRequestV1({
    transformationId: "transformation:postgres:split", operation: "split",
    sourceTeamIds: [source.teamId], targetTeams: targets,
    priorTopologyDigest: teamTopologyDigestV1(initial.topology),
    policyDigest: sha("3"), quorumDigest: sha("4"),
    requestedAtLogicalMs: 10, validUntilLogicalMs: 100,
  });
  const store = new PostgresMorphogenesisTeamTopologyStateStoreV2(pool, options);
  assert.equal(await store.initialize(initial), true);
  const certified = certifyTeamTopologyTransformationV1({ state: initial, request });
  assert.equal(await store.save({ state: certified, expectedStateDigest: initial.stateDigest }), true);
  const activated = activateTeamTopologyTransformationV1({
    state: certified, transformationId: request.transformationId,
  });
  assert.equal(await store.save({ state: activated, expectedStateDigest: certified.stateDigest }), true);
  const reopened = new PostgresMorphogenesisTeamTopologyStateStoreV2(pool, options);
  assert.equal((await reopened.load(initial.topologyId)).stateDigest, activated.stateDigest);
  assert.equal(await reopened.save({ state: certified, expectedStateDigest: initial.stateDigest }), false);
  witness.heads.clear();
  await assert.rejects(reopened.load(initial.topologyId), /witness diverged/);
});
