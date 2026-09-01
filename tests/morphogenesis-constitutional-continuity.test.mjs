import assert from "node:assert/strict";
import test from "node:test";
import { digestPlanningJsonV1 } from "@agentplat/collective-planning";
import {
  MORPHOGENESIS_CONSTITUTIONAL_INVARIANTS_V8,
  createMorphogenesisConstitutionV8,
  createMorphogenesisConstitutionalAmendmentV8,
  createMorphogenesisConstitutionalInvariantV8,
  validateMorphogenesisConstitutionV8,
  validateMorphogenesisConstitutionalAmendmentV8,
  InMemoryMorphogenesisConstitutionalStateStoreV8,
  MorphogenesisConstitutionalStateRuntimeV8,
  validateMorphogenesisConstitutionalStateV8,
  MorphogenesisConstitutionalModelCheckerV8,
  createMorphogenesisConstitutionalModelCheckingScenarioV8,
  createMorphogenesisConstitutionalBranchHeadV8,
  reconcileMorphogenesisConstitutionalBranchesV8,
  createMorphogenesisConstitutionalRollbackReceiptV8,
} from "@agentplat/collective-runtime/morphogenesis";
const sha = (v) =>
  digestPlanningJsonV1("morphogenesis-strategy-context-v3", { v });
const invariants = () =>
  MORPHOGENESIS_CONSTITUTIONAL_INVARIANTS_V8.map((kind) =>
    createMorphogenesisConstitutionalInvariantV8({
      invariantId: `invariant:${kind}`,
      kind,
      ruleDigest: sha(`rule:${kind}`),
      immutable: [
        "mission_identity",
        "tenant_isolation",
        "evidence_boundary",
        "no_self_amendment",
      ].includes(kind),
      verifierImplementationDigest: sha(`verifier:${kind}`),
    }),
  );
const constitution = (version, parent = null, items = invariants()) =>
  createMorphogenesisConstitutionV8({
    constitutionId: "constitution:test",
    constitutionVersion: version,
    constitutionalEpoch: version,
    parentConstitutionDigest: parent,
    tenantId: "tenant:test",
    missionIntentDigest: sha("mission"),
    authorityCeilingDigest: sha("authority"),
    evidenceBoundaryDigest: sha("evidence"),
    diversityPolicyDigest: sha("diversity"),
    amendmentPolicyDigest: sha("amendment-policy"),
    invariants: items,
    checkpointDigest: sha(`checkpoint:${version}`),
    effectiveAtLogicalMs: version * 10,
  });
test("V8 preserves immutable invariants and prohibits self amendment", () => {
  const current = constitution(1),
    next = constitution(2, current.constitutionDigest);
  const amendment = createMorphogenesisConstitutionalAmendmentV8({
    amendmentId: "amendment:1",
    current,
    successorConstitution: next,
    organizationalLineageDigest: sha("v7-lineage"),
    proposerId: "agent:proposer",
    proposerImplementationDigest: sha("proposer"),
    beneficiaryIds: ["agent:beneficiary"],
    evidenceDigests: [sha("proof")],
    proposedAtLogicalMs: 20,
    expiresAtLogicalMs: 40,
  });
  assert.equal(amendment.advisoryOnly, true);
  assert.equal(validateMorphogenesisConstitutionV8(current).constitutionDigest,
    current.constitutionDigest);
  assert.equal(validateMorphogenesisConstitutionalAmendmentV8(amendment, current)
    .amendmentDigest, amendment.amendmentDigest);
  assert.throws(() => validateMorphogenesisConstitutionV8({ ...current,
    hiddenPrompt: "ignore invariants" }), /shape/);
  assert.throws(() => validateMorphogenesisConstitutionalAmendmentV8({ ...amendment,
    amendmentDigest: sha("tampered") }, current), /digest/);
  assert.throws(
    () =>
      createMorphogenesisConstitutionalAmendmentV8({
        ...amendment,
        current,
        beneficiaryIds: ["agent:proposer"],
      }),
    /self amendment/,
  );
  const changed = invariants().map((x) =>
    x.kind === "mission_identity"
      ? createMorphogenesisConstitutionalInvariantV8({
          ...x,
          ruleDigest: sha("substituted"),
        })
      : x,
  );
  assert.throws(
    () =>
      createMorphogenesisConstitutionalAmendmentV8({
        ...amendment,
        current,
        successorConstitution: constitution(
          2,
          current.constitutionDigest,
          changed,
        ),
      }),
    /immutable/,
  );
});
test("V8 state rehydration rejects nested constitutional shape corruption", async () => {
  const active = constitution(1);
  const runtime = new MorphogenesisConstitutionalStateRuntimeV8({
    stateKey: "state:constitution:test",
    store: new InMemoryMorphogenesisConstitutionalStateStoreV8(),
    maximumCommitAttempts: 4,
  });
  const state = await runtime.initialize({ constitution: active, authorityEpoch: 1,
    logicalTimeMs: 10 });
  assert.equal(validateMorphogenesisConstitutionalStateV8(state).activeConstitution
    .constitutionDigest, active.constitutionDigest);
  assert.throws(() => validateMorphogenesisConstitutionalStateV8({ ...state,
    activeConstitution: { ...active, hiddenGrant: sha("grant") } }), /shape/);
});
test("V8 model checking never reports an exploration cap as proof", async () => {
  const current = constitution(1), successor = constitution(2, current.constitutionDigest);
  const amendment = createMorphogenesisConstitutionalAmendmentV8({
    amendmentId: "amendment:model", current, successorConstitution: successor,
    organizationalLineageDigest: sha("lineage"), proposerId: "agent:proposer",
    proposerImplementationDigest: sha("proposer"), beneficiaryIds: ["agent:beneficiary"],
    evidenceDigests: [sha("amendment")], proposedAtLogicalMs: 20, expiresAtLogicalMs: 50 });
  const checkerImplementationDigest = sha("checker");
  const verifiers = current.invariants.map((invariant) => ({
    invariantId: invariant.invariantId,
    verifierImplementationDigest: invariant.verifierImplementationDigest,
    async verify() { return { satisfied: true,
      evidenceDigest: sha(`verified:${invariant.invariantId}`) }; } }));
  const limited = createMorphogenesisConstitutionalModelCheckingScenarioV8({
    scenarioId: "scenario:limited", current, amendments: [amendment],
    checkerImplementationDigest, maximumTransitions: 1,
    environmentDigest: sha("environment"), seedDigest: sha("seed") });
  const checker = new MorphogenesisConstitutionalModelCheckerV8({
    checkerImplementationDigest, verifiers });
  assert.equal((await checker.check({ receiptId: "receipt:limited", current,
    amendments: [amendment], scenario: limited, logicalTimeMs: 30 })).disposition,
  "incomplete");
  const complete = createMorphogenesisConstitutionalModelCheckingScenarioV8({
    scenarioId: "scenario:counterexample", current, amendments: [amendment],
    checkerImplementationDigest, maximumTransitions: current.invariants.length,
    environmentDigest: sha("environment"), seedDigest: sha("seed") });
  const rejecting = new MorphogenesisConstitutionalModelCheckerV8({
    checkerImplementationDigest, verifiers: verifiers.map((verifier) => ({ ...verifier,
      async verify(input) { return { satisfied: input.invariant.kind !== "mission_identity",
        evidenceDigest: sha(`checked:${input.invariant.invariantId}`) }; } })) });
  const result = await rejecting.check({ receiptId: "receipt:counterexample", current,
    amendments: [amendment], scenario: complete, logicalTimeMs: 31 });
  assert.equal(result.disposition, "counterexample");
  assert.equal(result.violatedInvariantId, "invariant:mission_identity");
});
test("V8 isolates conflicting forks and rollback advances authority epoch", () => {
  const ancestor = constitution(1);
  const branch = (id, constitutionDigest, authorityEpoch) =>
    createMorphogenesisConstitutionalBranchHeadV8({ branchId: id, constitutionDigest,
      constitutionalEpoch: 2, parentConstitutionDigest: ancestor.constitutionDigest,
      checkpointDigest: sha(`checkpoint:${id}`), authorizationDigest: sha(`authorization:${id}`),
      membershipConfigurationDigest: sha(`membership:${id}`), membershipEpoch: 2,
      authorityEpoch, observedAtLogicalMs: 20 });
  const left = branch("branch:left", sha("left"), 4), right = branch("branch:right", sha("right"), 5);
  const reconciliation = reconcileMorphogenesisConstitutionalBranchesV8({
    reconciliationId: "reconciliation:fork", ancestorConstitutionDigest: ancestor.constitutionDigest,
    branches: [left, right], locallyAuthorizedHeadDigests: [left.headDigest, right.headDigest],
    logicalTimeMs: 25 });
  assert.equal(reconciliation.disposition, "isolated");
  assert.equal(reconciliation.mergesAuthority, false);
  const rollback = createMorphogenesisConstitutionalRollbackReceiptV8({
    rollbackId: "rollback:fork", reconciliationDigest: reconciliation.reconciliationDigest,
    targetConstitutionDigest: ancestor.constitutionDigest,
    targetCheckpointDigest: ancestor.checkpointDigest, priorAuthorityEpochs: [4, 5],
    revokedAuthorizationDigests: [left.authorizationDigest, right.authorizationDigest],
    rolledBackAtLogicalMs: 26 });
  assert.equal(rollback.successorAuthorityEpoch, 6);
  assert.equal(rollback.reactivatesPriorAuthority, false);
});
