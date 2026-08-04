import assert from "node:assert/strict";
import test from "node:test";

import {
  InMemoryMeshAuthorityContinuityStoreV1,
  MeshAuthorityContinuityErrorV1,
  MeshAuthorityContinuityRuntimeV1,
  createMeshAuthorityAcceptanceV1,
  createMeshAuthorityContinuityPolicyV1,
  createMeshAuthorityEndorsementV1,
  createMeshAuthorityHeadV1,
  createMeshAuthorityProposalV1,
  meshAuthorityScopeKeyV1,
  validateMeshAuthorityContinuitySnapshotV1,
} from "@agentplat/mesh/continuity";

const identity = (
  peerId,
  instanceId = `${peerId}:instance`,
  keyId = `${peerId}:key`,
) => ({
  schemaVersion: 1,
  peerId,
  instanceId,
  keyId,
});

const signed = (statement, signer, purpose) => ({
  schemaVersion: 1,
  statement,
  signer,
  proof: {
    schemaVersion: 1,
    algorithm: "test_signature",
    value: `valid:${purpose}:${signer.peerId}`,
  },
});

function runtime() {
  const store = new InMemoryMeshAuthorityContinuityStoreV1();
  const verifier = {
    verifierId: "test-authority-verifier",
    verifierVersion: 1,
    implementationId: "test-authority-verifier-build-1",
    verify: ({ purpose, record }) =>
      record.proof.value === `valid:${purpose}:${record.signer.peerId}`
        ? { verified: true, reasonCode: "verified" }
        : { verified: false, reasonCode: "signature_invalid" },
  };
  const eligibility = {
    eligibilityId: "test-successor-eligibility",
    eligibilityVersion: 1,
    implementationId: "test-successor-eligibility-build-1",
    check: () => ({ eligible: true, reasonCode: "eligible" }),
  };
  return {
    store,
    continuity: new MeshAuthorityContinuityRuntimeV1({
      store,
      verifier,
      eligibility,
    }),
  };
}

function scope(kind) {
  return {
    schemaVersion: 1,
    kind,
    tenantId: "tenant:a",
    meshId: "mesh:a",
    objectiveId: "objective:a",
    workItemId: kind === "work_owner" ? "work-item:a" : null,
  };
}

function policy(revision = 1) {
  return createMeshAuthorityContinuityPolicyV1({
    policyId: "continuity-policy:a",
    policyRevision: revision,
    witnessPeerIds: ["peer:w1", "peer:w2", "peer:w3"],
    witnessThreshold: 2,
    recoveryDelayMs: 100,
    maximumProposalLifetimeMs: 500,
    validUntilLogicalMs: 5_000,
  });
}

function bootstrap(authorityScope, authorityPolicy = policy()) {
  return createMeshAuthorityHeadV1({
    scope: authorityScope,
    generation: 1,
    holder: identity("peer:a"),
    activatedBy: "bootstrap",
    activationId: "bootstrap:a",
    predecessorHeadDigest: null,
    fencingToken: "fence:bootstrap-a",
    activatedAtLogicalMs: 0,
    holderValidUntilLogicalMs: 1_000,
    policy: authorityPolicy,
  });
}

test("current objective issuer can transfer authority without granting the successor implicitly", async () => {
  const { continuity } = runtime();
  const authorityScope = scope("objective_issuer");
  const initial = bootstrap(authorityScope);
  let snapshot = await continuity.initialize({
    head: initial,
    logicalTimeMs: 0,
  });
  const successor = identity("peer:b");
  const successorPolicy = policy(2);
  const proposal = createMeshAuthorityProposalV1({
    proposalId: "proposal:coordinated",
    scope: authorityScope,
    mode: "coordinated_transfer",
    previousHeadDigest: initial.headDigest,
    previousGeneration: 1,
    proposedGeneration: 2,
    previousHolder: initial.holder,
    successor,
    successorValidUntilLogicalMs: 2_000,
    successorPolicy,
    proposedAtLogicalMs: 10,
    notBeforeLogicalMs: 10,
    expiresAtLogicalMs: 200,
  });
  snapshot = await continuity.recordProposal({
    scopeKey: initial.scopeKey,
    expectedRevision: snapshot.revision,
    proposal: signed(proposal, initial.holder, "proposal"),
    logicalTimeMs: 10,
  });
  assert.equal(snapshot.head.holder.peerId, "peer:a");
  snapshot = await continuity.issueCertificate({
    scopeKey: initial.scopeKey,
    expectedRevision: snapshot.revision,
    proposalId: proposal.proposalId,
    logicalTimeMs: 10,
  });
  const acceptance = createMeshAuthorityAcceptanceV1({
    acceptanceId: "acceptance:coordinated",
    scopeKey: initial.scopeKey,
    proposalId: proposal.proposalId,
    proposalDigest: proposal.proposalDigest,
    certificateId: snapshot.certificate.certificateId,
    certificateDigest: snapshot.certificate.certificateDigest,
    successor,
    acceptedAtLogicalMs: 11,
  });
  snapshot = await continuity.accept({
    scopeKey: initial.scopeKey,
    expectedRevision: snapshot.revision,
    acceptance: signed(acceptance, successor, "acceptance"),
    logicalTimeMs: 11,
  });

  assert.equal(snapshot.head.generation, 2);
  assert.equal(snapshot.head.holder.peerId, "peer:b");
  assert.equal(snapshot.head.policy.policyRevision, 2);
  assert.equal(snapshot.transitions.length, 1);
  assert.notEqual(snapshot.head.fencingToken, initial.fencingToken);
  assert.equal(
    (
      await continuity.checkCurrent({
        schemaVersion: 1,
        scopeKey: initial.scopeKey,
        generation: 1,
        holder: initial.holder,
        headDigest: initial.headDigest,
        fencingToken: initial.fencingToken,
        logicalTimeMs: 12,
      })
    ).current,
    false,
  );
  assert.equal(
    (
      await continuity.checkCurrent({
        schemaVersion: 1,
        scopeKey: snapshot.scopeKey,
        generation: snapshot.head.generation,
        holder: snapshot.head.holder,
        headDigest: snapshot.head.headDigest,
        fencingToken: snapshot.head.fencingToken,
        logicalTimeMs: 12,
      })
    ).current,
    true,
  );
  assert.equal(
    validateMeshAuthorityContinuitySnapshotV1(snapshot).snapshotDigest,
    snapshot.snapshotDigest,
  );
});

test("work owner recovery waits for the configured witness threshold and fences the prior owner", async () => {
  const { continuity } = runtime();
  const authorityScope = scope("work_owner");
  const initial = bootstrap(authorityScope);
  let snapshot = await continuity.initialize({
    head: initial,
    logicalTimeMs: 0,
  });
  const successor = identity("peer:b");
  const proposal = createMeshAuthorityProposalV1({
    proposalId: "proposal:recovery",
    scope: authorityScope,
    mode: "witness_recovery",
    previousHeadDigest: initial.headDigest,
    previousGeneration: 1,
    proposedGeneration: 2,
    previousHolder: initial.holder,
    successor,
    successorValidUntilLogicalMs: 2_000,
    successorPolicy: initial.policy,
    proposedAtLogicalMs: 100,
    notBeforeLogicalMs: 200,
    expiresAtLogicalMs: 400,
  });
  snapshot = await continuity.recordProposal({
    scopeKey: initial.scopeKey,
    expectedRevision: snapshot.revision,
    proposal: signed(proposal, successor, "proposal"),
    logicalTimeMs: 100,
  });
  for (const [index, witnessPeerId] of ["peer:w1", "peer:w2"].entries()) {
    const endorsement = createMeshAuthorityEndorsementV1({
      endorsementId: `endorsement:${index + 1}`,
      scopeKey: initial.scopeKey,
      proposalId: proposal.proposalId,
      proposalDigest: proposal.proposalDigest,
      witnessPeerId,
      observedUnavailableSinceLogicalMs: 0,
      endorsedAtLogicalMs: 150 + index,
    });
    snapshot = await continuity.recordEndorsement({
      scopeKey: initial.scopeKey,
      expectedRevision: snapshot.revision,
      endorsement: signed(endorsement, identity(witnessPeerId), "endorsement"),
      logicalTimeMs: 150 + index,
    });
  }
  await assert.rejects(
    continuity.issueCertificate({
      scopeKey: initial.scopeKey,
      expectedRevision: snapshot.revision,
      proposalId: proposal.proposalId,
      logicalTimeMs: 199,
    }),
    (error) =>
      error instanceof MeshAuthorityContinuityErrorV1 &&
      error.code === "TRANSITION_NOT_READY",
  );
  snapshot = await continuity.issueCertificate({
    scopeKey: initial.scopeKey,
    expectedRevision: snapshot.revision,
    proposalId: proposal.proposalId,
    logicalTimeMs: 200,
  });
  assert.deepEqual(snapshot.certificate.witnessPeerIds, ["peer:w1", "peer:w2"]);
  const acceptance = createMeshAuthorityAcceptanceV1({
    acceptanceId: "acceptance:recovery",
    scopeKey: initial.scopeKey,
    proposalId: proposal.proposalId,
    proposalDigest: proposal.proposalDigest,
    certificateId: snapshot.certificate.certificateId,
    certificateDigest: snapshot.certificate.certificateDigest,
    successor,
    acceptedAtLogicalMs: 201,
  });
  snapshot = await continuity.accept({
    scopeKey: initial.scopeKey,
    expectedRevision: snapshot.revision,
    acceptance: signed(acceptance, successor, "acceptance"),
    logicalTimeMs: 201,
  });
  assert.equal(snapshot.head.holder.peerId, "peer:b");
  assert.equal(snapshot.head.generation, 2);
  assert.equal(meshAuthorityScopeKeyV1(authorityScope), snapshot.scopeKey);
  assert.equal(
    validateMeshAuthorityContinuitySnapshotV1(snapshot).snapshotDigest,
    snapshot.snapshotDigest,
  );
});
