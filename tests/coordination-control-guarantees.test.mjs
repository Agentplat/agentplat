import assert from "node:assert/strict";
import test from "node:test";

import { digestPlanningJsonV1 } from "@agentplat/collective-planning";
import {
  CoordinationControlGuaranteeRuntimeV1,
  InMemoryCoordinationControlGuaranteeAnchorV1,
  InMemoryCoordinationControlGuaranteeStoreV1,
  createAuthenticatedGuaranteeTeamExecutionControlPortV1,
  createCoordinationControlGuaranteeExecutionReceiptV1,
  createCoordinationControlGuaranteeV1,
  createCoordinationControlGuaranteePolicyV1,
  createCoordinationControlTargetV1,
} from "@agentplat/collective-runtime/coordination-control-guarantees";

const sha = (value) => digestPlanningJsonV1("mission-observation", { value });
const scope = Object.freeze({
  tenantId: "tenant",
  coordinationId: "coordination",
  missionIntentId: "objective",
  teamId: "team",
  workItemId: "work",
});

function guarantee(now, overrides = {}) {
  return createCoordinationControlGuaranteeV1({
    schemaVersion: 1,
    guaranteeId: `guarantee.${now}`,
    scope,
    controlId: "local-control",
    controlVersion: 1,
    implementationId: "local-control.v1",
    sourceRevision: now,
    sourceRecordDigest: sha(`control-record.${now}`),
    coherenceHorizonMs: 50,
    alignmentBps: 8_000,
    coherenceBps: 8_000,
    agilityBps: 8_000,
    confidenceBps: 8_000,
    riskBps: 2_000,
    uncertaintyBps: 2_000,
    contextAssumptionDigests: [sha("context")],
    threatAssumptionDigests: [sha("threat")],
    supportedCheckpointDigests: [sha("checkpoint")],
    supportedActions: ["continue"],
    observedAtLogicalMs: now,
    validUntilLogicalMs: now + 50,
    ...overrides,
  });
}

function target(now, overrides = {}) {
  return createCoordinationControlTargetV1({
    schemaVersion: 1,
    targetId: `target.${now}`,
    scope,
    planningId: "distributed-planner",
    planningRevision: now,
    planningRecordDigest: sha(`plan-record.${now}`),
    plannedHorizonMs: 30,
    minimumAlignmentBps: 7_000,
    minimumCoherenceBps: 7_000,
    minimumAgilityBps: 7_000,
    minimumConfidenceBps: 7_000,
    maximumRiskBps: 3_000,
    maximumUncertaintyBps: 3_000,
    requiredContextAssumptionDigests: [sha("context")],
    requiredThreatAssumptionDigests: [sha("threat")],
    requiredCheckpointDigests: [sha("checkpoint")],
    requiredActions: ["continue"],
    issuedAtLogicalMs: now,
    validUntilLogicalMs: now + 50,
    ...overrides,
  });
}

function runtime(options = {}) {
  return new CoordinationControlGuaranteeRuntimeV1({
    stateKey: "guarantee-state",
    anchorKey: "guarantee-anchor",
    scope,
    policy: createCoordinationControlGuaranteePolicyV1({
      schemaVersion: 1,
      policyId: "guarantee-policy",
      policyVersion: 1,
      maximumGuaranteeAgeMs: 20,
      maximumTargetAgeMs: 20,
      maximumProposalTtlMs: 10,
      maximumOutboxRecords: 8,
      maximumCommitAttempts: 3,
    }),
    verification: {
      async verifyGuarantee() { return true; },
      async verifyTarget() { return true; },
    },
    store: new InMemoryCoordinationControlGuaranteeStoreV1(),
    monotonicAnchor: new InMemoryCoordinationControlGuaranteeAnchorV1(),
    ...options,
  });
}

test("negotiates the minimum verified planning window and produces a dispatch allow", async () => {
  const gate = runtime();
  await gate.publishGuarantee({ logicalTimeMs: 10, guarantee: guarantee(10) });
  const proposal = await gate.publishTarget({ logicalTimeMs: 11, target: target(11) });
  assert.equal(proposal.status, "admitted");
  assert.equal(proposal.disposition, "allow");
  assert.equal(proposal.effectivePlanningWindowMs, 30);
});

test("turns unmet control targets into an actionable replanning denial", async () => {
  const gate = runtime();
  await gate.publishGuarantee({ logicalTimeMs: 1, guarantee: guarantee(1, { agilityBps: 6_000 }) });
  const proposal = await gate.publishTarget({ logicalTimeMs: 2, target: target(2) });
  assert.equal(proposal.status, "replan_required");
  assert.equal(proposal.action, "request_replanning");
  assert.equal(proposal.disposition, "deny");
  assert.deepEqual(proposal.reasonCodes, ["agility_target_unmet"]);
});

test("fails closed when a guarantee is stale or its source rolls back", async () => {
  const gate = runtime();
  await gate.publishGuarantee({ logicalTimeMs: 1, guarantee: guarantee(1) });
  await gate.publishTarget({ logicalTimeMs: 2, target: target(2) });
  const stale = await gate.negotiate({ logicalTimeMs: 22 });
  assert.equal(stale.status, "blocked");
  assert.deepEqual(stale.reasonCodes, ["stale_guarantee"]);
  const rollback = await gate.publishGuarantee({
    logicalTimeMs: 23,
    guarantee: guarantee(23, {
      sourceRevision: 1,
      sourceRecordDigest: sha("equivocal-control-record"),
    }),
  });
  assert.equal(rollback.status, "blocked");
  assert.deepEqual(rollback.reasonCodes, ["source_equivocation"]);
});

test("requires an authenticated delivery receipt before emitting execution evidence", async () => {
  const gate = runtime();
  await gate.publishGuarantee({ logicalTimeMs: 1, guarantee: guarantee(1) });
  const proposal = await gate.publishTarget({ logicalTimeMs: 2, target: target(2) });
  const controlBinding = Object.freeze({
    controlId: "guarantee-gate",
    controlVersion: 1,
    implementationId: "guarantee-gate.v1",
  });
  const receipt = createCoordinationControlGuaranteeExecutionReceiptV1({
    schemaVersion: 1,
    receiptId: `receipt.${proposal.proposalId}`,
    proposalId: proposal.proposalId,
    proposalDigest: proposal.proposalDigest,
    scope: proposal.scope,
    controlBinding,
    deliveredAtLogicalMs: 2,
  });
  const authenticated = new Map([
    [proposal.proposalDigest, { proposal, receipt }],
  ]);
  const adapter = createAuthenticatedGuaranteeTeamExecutionControlPortV1({
    controlBinding,
    receipts: {
      async resolve(input) {
        assert.deepEqual(input.controlBinding, controlBinding);
        return authenticated.get(input.proposalDigest) ?? null;
      },
    },
  });
  const evidence = await adapter.evidence({
    proposalDigest: proposal.proposalDigest,
    logicalTimeMs: 2,
  });
  assert.ok(evidence);
  assert.equal(evidence.disposition, "allow");
  assert.equal(evidence.controlId, "guarantee-gate");
  assert.equal(evidence.sourceEvidenceDigest, receipt.receiptDigest);
  assert.equal(evidence.validUntilLogicalMs, proposal.expiresAtLogicalMs);
  assert.equal(
    await adapter.evidence({
      proposalDigest: sha("caller-authored-proposal"),
      logicalTimeMs: 2,
    }),
    null,
  );
  assert.equal(
    await adapter.evidence({
      proposalDigest: proposal.proposalDigest,
      logicalTimeMs: proposal.expiresAtLogicalMs,
    }),
    null,
  );
  const wrongBindingReceipt =
    createCoordinationControlGuaranteeExecutionReceiptV1({
      schemaVersion: 1,
      receiptId: `receipt.wrong.${proposal.proposalId}`,
      proposalId: proposal.proposalId,
      proposalDigest: proposal.proposalDigest,
      scope: proposal.scope,
      controlBinding: {
        controlId: "attacker-selected-control",
        controlVersion: 1,
        implementationId: "attacker-selected-control.v1",
      },
      deliveredAtLogicalMs: 2,
    });
  const wrongBindingAdapter =
    createAuthenticatedGuaranteeTeamExecutionControlPortV1({
      controlBinding,
      receipts: {
        async resolve() {
          return { proposal, receipt: wrongBindingReceipt };
        },
      },
    });
  assert.equal(
    await wrongBindingAdapter.evidence({
      proposalDigest: proposal.proposalDigest,
      logicalTimeMs: 2,
    }),
    null,
  );
});

test("persists the authenticated receipt returned by the dispatch sink", async () => {
  const controlBinding = Object.freeze({
    controlId: "guarantee-gate",
    controlVersion: 1,
    implementationId: "guarantee-gate.v1",
  });
  const store = new InMemoryCoordinationControlGuaranteeStoreV1();
  const gate = runtime({
    store,
    dispatch: {
      async dispatch({ proposal }) {
        return {
          status: "delivered",
          receipt: createCoordinationControlGuaranteeExecutionReceiptV1({
            schemaVersion: 1,
            receiptId: `receipt.${proposal.proposalId}`,
            proposalId: proposal.proposalId,
            proposalDigest: proposal.proposalDigest,
            scope: proposal.scope,
            controlBinding,
            deliveredAtLogicalMs: proposal.evaluatedAtLogicalMs,
          }),
        };
      },
    },
  });
  await gate.publishGuarantee({ logicalTimeMs: 1, guarantee: guarantee(1) });
  const proposal = await gate.publishTarget({ logicalTimeMs: 2, target: target(2) });
  await gate.dispatchPending(2);
  assert.equal(
    (await gate.dispatchPending(2))?.proposalDigest,
    proposal.proposalDigest,
  );
  const state = await store.load("guarantee-state");
  const delivered = state?.outbox.find(
    (entry) => entry.proposal.proposalDigest === proposal.proposalDigest,
  );
  assert.equal(delivered?.status, "delivered");
  assert.equal(delivered?.receipt?.proposalDigest, proposal.proposalDigest);
  assert.deepEqual(delivered?.receipt?.controlBinding, controlBinding);
});

test("repairs only the interrupted initial state-to-anchor commit before reuse", async () => {
  const store = new InMemoryCoordinationControlGuaranteeStoreV1();
  const anchor = new InMemoryCoordinationControlGuaranteeAnchorV1();
  let rejectOnce = true;
  const gate = runtime({
    store,
    monotonicAnchor: {
      load: (input) => anchor.load(input),
      save: async (input) => {
        if (rejectOnce) {
          rejectOnce = false;
          return false;
        }
        return anchor.save(input);
      },
    },
  });
  await assert.rejects(
    gate.publishGuarantee({ logicalTimeMs: 1, guarantee: guarantee(1) }),
    /monotonic anchor update failed/,
  );
  const proposal = await gate.publishTarget({ logicalTimeMs: 2, target: target(2) });
  assert.equal(proposal.status, "admitted");
});

test("fails closed when the replaceable state is rolled back behind its anchor", async () => {
  const backing = new InMemoryCoordinationControlGuaranteeStoreV1();
  const anchor = new InMemoryCoordinationControlGuaranteeAnchorV1();
  const snapshots = [];
  const store = {
    load: (stateKey) => backing.load(stateKey),
    async save(input) {
      const saved = await backing.save(input);
      if (saved) snapshots.push(structuredClone(input.state));
      return saved;
    },
  };
  const gate = runtime({ store, monotonicAnchor: anchor });
  await gate.publishGuarantee({ logicalTimeMs: 1, guarantee: guarantee(1) });
  await gate.publishTarget({ logicalTimeMs: 2, target: target(2) });

  const rolledBack = runtime({
    store: {
      async load() { return structuredClone(snapshots[0]); },
      async save() { throw new Error("rolled-back state must not be saved"); },
    },
    monotonicAnchor: anchor,
  });
  const proposal = await rolledBack.negotiate({ logicalTimeMs: 3 });
  assert.equal(proposal.status, "blocked");
  assert.deepEqual(proposal.reasonCodes, ["monotonic_state_unavailable"]);
});
