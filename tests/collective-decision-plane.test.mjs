import assert from "node:assert/strict";
import test from "node:test";

import {
  InMemoryCollectiveDecisionStoreV1,
  createCollectiveDecisionCertificateV1,
  createCollectiveDecisionCompactedHeadV1,
  createCollectiveDecisionEvidenceV1,
  createCollectiveDecisionPolicyV1,
  createCollectiveDecisionRuntimeV1,
  createCollectiveDecisionScopeV1,
  createCollectiveDecisionStateV1,
  validateCollectiveDecisionCertificateV1,
} from "../packages/collective-runtime/dist/collective-decision.js";

const digest = (character) => `sha256:${character.repeat(64)}`;

test("certified decision plane binds scope, epoch and membership, then rejects equivocation", async () => {
  const store = new InMemoryCollectiveDecisionStoreV1();
  const issuedCertificateDigests = new Set();
  const policy = createCollectiveDecisionPolicyV1({
    schemaVersion: 1,
    policyId: "policy.decision",
    policyVersion: 1,
    parentPolicyDigest: null,
    certificationModes: modes("byzantine_agreement"),
    minimumTrustedEvidenceByKind: counts(0),
    minimumByzantineAttestersByKind: counts(0, "team_roster", 2),
    trustedEvidenceSources: [],
    maximumCandidateTtlMs: 100,
    maximumCertificateTtlMs: 100,
    maximumAcceptedHeads: 8,
    maximumCompactedHeads: 32,
    maximumCommitAttempts: 3,
  });
  const runtime = createCollectiveDecisionRuntimeV1({
    stateKey: "decision.state",
    decisionPlaneId: "decision.plane",
    decisionPlaneVersion: 1,
    implementationId: "decision.impl",
    policy,
    store,
    certification: {
      async certify({ candidate }) {
        const certificate = createCollectiveDecisionCertificateV1({
          schemaVersion: 1,
          certificateId: `certificate.${candidate.candidateId}`,
          candidateDigest: candidate.candidateDigest,
          scopeDigest: candidate.scope.scopeDigest,
          epoch: candidate.epoch,
          membershipDigest: candidate.membershipDigest,
          certificationMode: "byzantine_agreement",
          issuerId: "member.a",
          attesterIds: ["member.a", "member.b"],
          evidence: [],
          certificationProofDigest: digest("c"),
          issuedAtLogicalMs: candidate.preparedAtLogicalMs + 1,
          expiresAtLogicalMs: candidate.expiresAtLogicalMs,
        });
        issuedCertificateDigests.add(certificate.certificateDigest);
        return certificate;
      },
      async verify({ certificate }) {
        return issuedCertificateDigests.has(certificate.certificateDigest);
      },
    },
  });
  const scope = createCollectiveDecisionScopeV1({
    tenantId: "tenant.1",
    meshId: "mesh.1",
    policyDomainId: "domain.1",
    missionIntentId: "intent.1",
    objectiveId: "objective.1",
    workItemId: null,
    workItemRevision: null,
  });
  const candidate = {
    schemaVersion: 1,
    candidateId: "candidate.1",
    decisionKind: "team_roster",
    scope,
    epoch: 3,
    membershipDigest: digest("a"),
    membershipMemberIds: ["member.a", "member.b", "member.c"],
    proposerId: "member.a",
    payloadDigest: digest("b"),
    preparedAtLogicalMs: 10,
    expiresAtLogicalMs: 60,
  };
  const accepted = await runtime.decide({
    decisionId: "decision.1",
    candidate,
    logicalTimeMs: 20,
  });
  assert.equal(accepted.candidate.scope.scopeDigest, scope.scopeDigest);
  assert.equal(
    accepted.certificate.membershipDigest,
    candidate.membershipDigest,
  );
  assert.equal(accepted.certificate.certificationProofDigest, digest("c"));
  assert.throws(
    () =>
      validateCollectiveDecisionCertificateV1({
        ...accepted.certificate,
        certificationProofDigest: digest("d"),
      }),
    /certificate digest is invalid/,
  );
  assert.equal((await store.load("decision.state")).accepted.length, 1);
  assert.equal(
    (
      await runtime.decide({
        decisionId: "decision.1",
        candidate,
        logicalTimeMs: 20,
      })
    ).decisionDigest,
    accepted.decisionDigest,
  );
  await assert.rejects(
    runtime.decide({
      decisionId: "decision.2",
      candidate: {
        ...candidate,
        candidateId: "candidate.2",
        payloadDigest: digest("c"),
      },
      logicalTimeMs: 21,
    }),
    /conflicting or equivocal/,
  );
  const fabricatedInput = { ...accepted.certificate };
  delete fabricatedInput.certificateDigest;
  fabricatedInput.certificateId = "certificate.fabricated";
  const fabricated = createCollectiveDecisionCertificateV1(fabricatedInput);
  await assert.rejects(
    runtime.commit({
      decisionId: "decision.fabricated",
      candidate: accepted.candidate,
      certificate: fabricated,
      logicalTimeMs: 22,
    }),
    /authenticity verification failed/,
  );
  const replayCandidate = runtime.prepare({
    ...candidate,
    candidateId: "candidate.replay",
    epoch: 4,
    preparedAtLogicalMs: 22,
    expiresAtLogicalMs: 60,
  });
  await assert.rejects(
    runtime.commit({
      decisionId: "decision.replay",
      candidate: replayCandidate,
      certificate: accepted.certificate,
      logicalTimeMs: 23,
    }),
    /certificate binding does not match candidate/,
  );
});

test("evidence certification fails closed for an untrusted source", async () => {
  const policy = createCollectiveDecisionPolicyV1({
    schemaVersion: 1,
    policyId: "policy.evidence",
    policyVersion: 1,
    parentPolicyDigest: null,
    certificationModes: modes("evidence"),
    minimumTrustedEvidenceByKind: counts(0, "strategy_change", 1),
    minimumByzantineAttestersByKind: counts(0),
    trustedEvidenceSources: [
      {
        schemaVersion: 1,
        sourceId: "trusted.source",
        sourceVersion: 1,
        sourceImplementationDigest: digest("f"),
      },
    ],
    maximumCandidateTtlMs: 100,
    maximumCertificateTtlMs: 100,
    maximumAcceptedHeads: 8,
    maximumCompactedHeads: 32,
    maximumCommitAttempts: 2,
  });
  const runtime = createCollectiveDecisionRuntimeV1({
    stateKey: "rollback.state",
    decisionPlaneId: "decision.plane",
    decisionPlaneVersion: 1,
    implementationId: "decision.impl",
    policy,
    store: new InMemoryCollectiveDecisionStoreV1(),
    certification: {
      async certify() {
        throw new Error("not used");
      },
      async verify() {
        return true;
      },
    },
  });
  const scope = createCollectiveDecisionScopeV1({
    tenantId: "tenant.2",
    meshId: "mesh.2",
    policyDomainId: "domain.2",
    missionIntentId: "intent.2",
    objectiveId: "objective.2",
    workItemId: null,
    workItemRevision: null,
  });
  const candidate = runtime.prepare({
    schemaVersion: 1,
    candidateId: "candidate.evidence",
    decisionKind: "strategy_change",
    scope,
    epoch: 1,
    membershipDigest: digest("d"),
    membershipMemberIds: ["member.a"],
    proposerId: "member.a",
    payloadDigest: digest("e"),
    preparedAtLogicalMs: 10,
    expiresAtLogicalMs: 50,
  });
  const certificate = createCollectiveDecisionCertificateV1({
    schemaVersion: 1,
    certificateId: "certificate.evidence",
    candidateDigest: candidate.candidateDigest,
    scopeDigest: scope.scopeDigest,
    epoch: 1,
    membershipDigest: candidate.membershipDigest,
    certificationMode: "evidence",
    issuerId: "member.a",
    attesterIds: [],
    evidence: [
      createCollectiveDecisionEvidenceV1({
        schemaVersion: 1,
        evidenceId: "evidence.untrusted",
        candidateDigest: candidate.candidateDigest,
        sourceId: "untrusted.source",
        sourceVersion: 1,
        sourceImplementationDigest: digest("a"),
        observedAtLogicalMs: 11,
        expiresAtLogicalMs: 50,
      }),
    ],
    certificationProofDigest: null,
    issuedAtLogicalMs: 11,
    expiresAtLogicalMs: 50,
  });
  await assert.rejects(
    runtime.verify({ candidate, certificate, logicalTimeMs: 20 }),
    /not trusted by policy/,
  );
});

test("certificate proof requirements are closed by certification mode", () => {
  const base = {
    schemaVersion: 1,
    certificateId: "certificate.mode",
    candidateDigest: digest("a"),
    scopeDigest: digest("b"),
    epoch: 1,
    membershipDigest: digest("c"),
    issuerId: "member.a",
    attesterIds: [],
    evidence: [],
    issuedAtLogicalMs: 1,
    expiresAtLogicalMs: 2,
  };
  assert.throws(
    () =>
      createCollectiveDecisionCertificateV1({
        ...base,
        certificationMode: "local",
        certificationProofDigest: digest("d"),
      }),
    /local certification cannot carry/,
  );
  assert.throws(
    () =>
      createCollectiveDecisionCertificateV1({
        ...base,
        certificationMode: "byzantine_agreement",
        certificationProofDigest: null,
      }),
    /requires a proof digest/,
  );
});

test("expired decisions compact without reopening their certified slots", async () => {
  const store = new InMemoryCollectiveDecisionStoreV1();
  const issuedCertificateDigests = new Set();
  const policy = createCollectiveDecisionPolicyV1({
    schemaVersion: 1,
    policyId: "policy.compaction",
    policyVersion: 1,
    parentPolicyDigest: null,
    certificationModes: modes("local"),
    minimumTrustedEvidenceByKind: counts(0),
    minimumByzantineAttestersByKind: counts(0),
    trustedEvidenceSources: [],
    maximumCandidateTtlMs: 100,
    maximumCertificateTtlMs: 100,
    maximumAcceptedHeads: 1,
    maximumCompactedHeads: 1,
    maximumCommitAttempts: 2,
  });
  const runtime = createCollectiveDecisionRuntimeV1({
    stateKey: "compaction.state",
    decisionPlaneId: "decision.plane",
    decisionPlaneVersion: 1,
    implementationId: "decision.impl",
    policy,
    store,
    certification: {
      async certify({ candidate }) {
        const certificate = createCollectiveDecisionCertificateV1({
          schemaVersion: 1,
          certificateId: `certificate.${candidate.candidateId}`,
          candidateDigest: candidate.candidateDigest,
          scopeDigest: candidate.scope.scopeDigest,
          epoch: candidate.epoch,
          membershipDigest: candidate.membershipDigest,
          certificationMode: "local",
          issuerId: candidate.proposerId,
          attesterIds: [],
          evidence: [],
          certificationProofDigest: null,
          issuedAtLogicalMs: candidate.preparedAtLogicalMs,
          expiresAtLogicalMs: candidate.expiresAtLogicalMs,
        });
        issuedCertificateDigests.add(certificate.certificateDigest);
        return certificate;
      },
      async verify({ certificate }) {
        return issuedCertificateDigests.has(certificate.certificateDigest);
      },
    },
  });
  const scope = createCollectiveDecisionScopeV1({
    tenantId: "tenant.compaction",
    meshId: "mesh.compaction",
    policyDomainId: "domain.compaction",
    missionIntentId: "intent.compaction",
    objectiveId: "objective.compaction",
    workItemId: null,
    workItemRevision: null,
  });
  const base = {
    schemaVersion: 1,
    scope,
    epoch: 1,
    membershipDigest: digest("a"),
    membershipMemberIds: ["member.a"],
    proposerId: "member.a",
  };
  await runtime.decide({
    decisionId: "decision.old",
    logicalTimeMs: 10,
    candidate: {
      ...base,
      candidateId: "candidate.old",
      decisionKind: "plan_fragment",
      payloadDigest: digest("b"),
      preparedAtLogicalMs: 9,
      expiresAtLogicalMs: 20,
    },
  });
  await runtime.decide({
    decisionId: "decision.current",
    logicalTimeMs: 31,
    candidate: {
      ...base,
      candidateId: "candidate.current",
      decisionKind: "team_roster",
      payloadDigest: digest("c"),
      preparedAtLogicalMs: 30,
      expiresAtLogicalMs: 60,
    },
  });
  const compactedState = await store.load("compaction.state");
  assert.equal(compactedState.revision, 2);
  assert.equal(compactedState.accepted.length, 1);
  assert.equal(compactedState.compacted.length, 1);
  assert.equal(compactedState.compacted[0].decisionId, "decision.old");
  const reopenedCandidate = {
    ...base,
    candidateId: "candidate.reopened",
    decisionKind: "plan_fragment",
    payloadDigest: digest("d"),
    preparedAtLogicalMs: 32,
    expiresAtLogicalMs: 60,
  };
  await assert.rejects(
    runtime.decide({
      decisionId: "decision.reopened",
      candidate: reopenedCandidate,
      logicalTimeMs: 33,
    }),
    /previously accepted and compacted/,
  );
  const overflowCandidate = {
    ...base,
    candidateId: "candidate.overflow",
    decisionKind: "strategy_change",
    payloadDigest: digest("e"),
    preparedAtLogicalMs: 61,
    expiresAtLogicalMs: 90,
  };
  await assert.rejects(
    runtime.decide({
      decisionId: "decision.overflow",
      candidate: overflowCandidate,
      logicalTimeMs: 62,
    }),
    /compacted head limit is reached/,
  );
  const unchangedState = await store.load("compaction.state");
  assert.equal(unchangedState.revision, 2);
  assert.equal(unchangedState.compacted.length, 1);

  const retainedDecision = unchangedState.accepted[0];
  const overLimitHead = createCollectiveDecisionCompactedHeadV1({
    schemaVersion: 1,
    decisionId: retainedDecision.decisionId,
    scopeDigest: retainedDecision.candidate.scope.scopeDigest,
    decisionKind: retainedDecision.candidate.decisionKind,
    epoch: retainedDecision.candidate.epoch,
    candidateDigest: retainedDecision.candidate.candidateDigest,
    certificateDigest: retainedDecision.certificate.certificateDigest,
    certificationProofDigest:
      retainedDecision.certificate.certificationProofDigest,
    decisionDigest: retainedDecision.decisionDigest,
    committedStateRevision: retainedDecision.committedStateRevision,
  });
  const overLimitStateInput = {
    ...unchangedState,
    accepted: [],
    compacted: [...unchangedState.compacted, overLimitHead],
  };
  delete overLimitStateInput.stateDigest;
  const overLimitState = createCollectiveDecisionStateV1(overLimitStateInput);
  assert.equal(
    await store.save({ state: overLimitState, expectedRevision: 2 }),
    true,
  );
  await assert.rejects(
    runtime.decide({
      decisionId: "decision.restore-limit",
      candidate: {
        ...overflowCandidate,
        candidateId: "candidate.restore-limit",
      },
      logicalTimeMs: 62,
    }),
    /state exceeds compacted head limit/,
  );
});

test("decide authenticates evidence certification", async () => {
  const trustedSource = {
    schemaVersion: 1,
    sourceId: "trusted.source",
    sourceVersion: 1,
    sourceImplementationDigest: digest("f"),
  };
  const policy = createCollectiveDecisionPolicyV1({
    schemaVersion: 1,
    policyId: "policy.evidence.decide",
    policyVersion: 1,
    parentPolicyDigest: null,
    certificationModes: modes("evidence"),
    minimumTrustedEvidenceByKind: counts(1),
    minimumByzantineAttestersByKind: counts(0),
    trustedEvidenceSources: [trustedSource],
    maximumCandidateTtlMs: 100,
    maximumCertificateTtlMs: 100,
    maximumAcceptedHeads: 2,
    maximumCompactedHeads: 8,
    maximumCommitAttempts: 2,
  });
  const issuedCertificateDigests = new Set();
  const runtime = createCollectiveDecisionRuntimeV1({
    stateKey: "evidence.state",
    decisionPlaneId: "decision.plane",
    decisionPlaneVersion: 1,
    implementationId: "decision.impl",
    policy,
    store: new InMemoryCollectiveDecisionStoreV1(),
    certification: {
      async certify({ candidate }) {
        const item = createCollectiveDecisionEvidenceV1({
          schemaVersion: 1,
          evidenceId: "evidence.accepted",
          candidateDigest: candidate.candidateDigest,
          ...trustedSource,
          observedAtLogicalMs: 10,
          expiresAtLogicalMs: 50,
        });
        const certificate = createCollectiveDecisionCertificateV1({
          schemaVersion: 1,
          certificateId: "certificate.evidence.accepted",
          candidateDigest: candidate.candidateDigest,
          scopeDigest: candidate.scope.scopeDigest,
          epoch: candidate.epoch,
          membershipDigest: candidate.membershipDigest,
          certificationMode: "evidence",
          issuerId: candidate.proposerId,
          attesterIds: [],
          evidence: [item],
          certificationProofDigest: digest("e"),
          issuedAtLogicalMs: 10,
          expiresAtLogicalMs: 50,
        });
        issuedCertificateDigests.add(certificate.certificateDigest);
        return certificate;
      },
      async verify({ certificate }) {
        return issuedCertificateDigests.has(certificate.certificateDigest);
      },
    },
  });
  const scope = createCollectiveDecisionScopeV1({
    tenantId: "tenant.evidence",
    meshId: "mesh.evidence",
    policyDomainId: "domain.evidence",
    missionIntentId: "intent.evidence",
    objectiveId: "objective.evidence",
    workItemId: null,
    workItemRevision: null,
  });
  const decision = await runtime.decide({
    decisionId: "decision.evidence",
    logicalTimeMs: 11,
    candidate: {
      schemaVersion: 1,
      candidateId: "candidate.evidence.accepted",
      decisionKind: "strategy_change",
      scope,
      epoch: 1,
      membershipDigest: digest("a"),
      membershipMemberIds: ["member.a"],
      proposerId: "member.a",
      payloadDigest: digest("b"),
      preparedAtLogicalMs: 9,
      expiresAtLogicalMs: 50,
    },
  });
  assert.equal(decision.certificate.certificationMode, "evidence");
});

function modes(mode) {
  return Object.freeze({
    plan_fragment: mode,
    team_roster: mode,
    execution_takeover: mode,
    team_structure: mode,
    role_transition: mode,
    strategy_change: mode,
  });
}

function counts(defaultValue, overrideKind = null, overrideValue = null) {
  const values = {
    plan_fragment: defaultValue,
    team_roster: defaultValue,
    execution_takeover: defaultValue,
    team_structure: defaultValue,
    role_transition: defaultValue,
    strategy_change: defaultValue,
  };
  if (overrideKind !== null) values[overrideKind] = overrideValue;
  return Object.freeze(values);
}
