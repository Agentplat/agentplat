import assert from "node:assert/strict";
import test from "node:test";
import { digestPlanningJsonV1 } from "@agentplat/collective-planning";
import {
  MORPHOGENESIS_CONSTITUTIONAL_INVARIANTS_V8,
  createMorphogenesisConstitutionV8,
  createMorphogenesisConstitutionalAmendmentV8,
  createMorphogenesisConstitutionalInvariantV8,
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
