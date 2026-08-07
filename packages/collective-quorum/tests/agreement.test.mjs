import assert from "node:assert/strict";
import test from "node:test";
import { createStaticMeshKeyResolver } from "../../mesh-crypto/dist/index.js";
import { MESH_SIGNATURE_ALGORITHM } from "../../mesh-protocol/dist/index.js";
import {
  CollectiveAgreementClientV1,
  CollectiveAgreementHttpTransportV1,
  CollectiveAgreementPeerV1,
  InMemoryCollectiveAgreementRepositoryV1,
  InMemoryCollectiveAgreementTransportV1,
  applyCollectiveAgreementCatchupBundleV1,
  createCollectiveAgreementCatchupBundleV1,
  createCollectiveAgreementEquivocationEvidenceV1,
  createCollectiveAgreementJointReconfigurationCertificateV1,
  createCollectiveAgreementMembershipV1,
  createCollectiveAgreementMembershipReconfigurationValueV1,
  createCollectiveAgreementVoteCertificateV1,
  createCollectiveAgreementValueV1,
  createSignedCollectiveAgreementEnvelopeV1,
  handleCollectiveAgreementHttpRequestV1,
  verifyCollectiveAgreementCatchupBundleV1,
  verifyCollectiveAgreementCommitCertificateV1,
  verifyCollectiveAgreementJointReconfigurationCertificateV1,
  createCollectiveRoleRealignmentCertificationPortV1,
  createCollectiveDecisionAgreementCertificationPortV1,
} from "../dist/agreement.js";
import {
  createCollectiveDecisionCandidateV1,
  createCollectiveDecisionCertificateV1,
  createCollectiveDecisionPolicyV1,
  createCollectiveDecisionScopeV1,
  verifyCollectiveDecisionCertificateV1,
} from "../../collective-runtime/dist/collective-decision.js";
import {
  createRoleAlignmentRoleAnchorV1,
  createRoleAlignmentStateV1,
  observeRoleAlignmentSignalV1,
} from "../../inference-control/dist/role-alignment.js";
import {
  admitRoleCandidateV1,
  createRoleAuthorityCeilingV1,
  createRoleCandidateEvaluationV1,
  createRoleCandidateProposalV1,
  createRoleRealignmentRequestV1,
  createRoleRealignmentStateV1,
  createTrustedRoleDefinitionV1,
  recordRoleCandidateEvaluationV1,
  selectRoleCandidateV1,
} from "../../inference-control/dist/role-realignment.js";
import { digestTrustEligibilityDecisionV1 } from "../../trust/dist/index.js";

const wallTime = "2030-01-01T00:00:00.000Z";

test("seven validators commit with two unavailable participants", async () => {
  const fixture = await createFixture({
    activePeerIds: ["p0", "p1", "p2", "p3", "p4"],
  });
  const value = await createCollectiveAgreementValueV1({
    kind: "planning_slot_head",
    valueId: "slot.value.1",
    payload: {
      semanticSlotKey: "slot.1",
      selectedProposalDigest: digest("a"),
    },
  });
  const commit = await fixture.client("p0").decide({
    membership: fixture.membership,
    policyDomainId: "policy.1",
    slotId: "slot.1",
    height: 1,
    round: 0,
    value,
    logicalTimeMs: 100,
  });
  assert.ok(commit);
  assert.equal(commit.prevoteCertificate.votes.length, 5);
  assert.equal(commit.precommitCertificate.votes.length, 5);
  assert.ok(
    await verifyCollectiveAgreementCommitCertificateV1({
      certificate: commit,
      membership: fixture.membership,
      resolver: fixture.resolver,
      verifiedAt: wallTime,
    }),
  );
  assert.ok(
    await verifyCollectiveAgreementCommitCertificateV1({
      certificate: commit,
      membership: fixture.membership,
      resolver: fixture.resolver,
      verifiedAt: "2030-06-01T00:00:00.000Z",
    }),
  );
  const revokedResolver = createStaticMeshKeyResolver(
    fixture.keyRecords.map((record) => ({
      ...record,
      status: "revoked",
      revokedAt: "2030-01-01T00:00:15.000Z",
    })),
  );
  assert.ok(
    await verifyCollectiveAgreementCommitCertificateV1({
      certificate: commit,
      membership: fixture.membership,
      resolver: revokedResolver,
      verifiedAt: "2030-06-01T00:00:00.000Z",
    }),
  );
  assert.equal(
    await createCollectiveAgreementVoteCertificateV1({
      membership: fixture.membership,
      votes: commit.prevoteCertificate.votes,
      resolver: revokedResolver,
      verifiedAt: "2030-01-01T00:00:20.000Z",
    }),
    null,
  );
  assert.equal(
    await createCollectiveAgreementVoteCertificateV1({
      membership: fixture.membership,
      votes: commit.prevoteCertificate.votes,
      resolver: fixture.resolver,
      verifiedAt: "2030-06-01T00:00:00.000Z",
    }),
    null,
  );
  for (const peerId of ["p0", "p1", "p2", "p3", "p4"])
    assert.equal(
      (
        await fixture.repositories[peerId].getCommit({
          policyDomainId: "policy.1",
          slotId: "slot.1",
          height: 1,
        })
      )?.certificateDigest,
      commit.certificateDigest,
    );
});

test("role realignment adapter verifies agreement and counts only Trust-eligible witnesses", async () => {
  const fixture = await createFixture({
    activePeerIds: ["p0", "p1", "p2", "p3", "p4"],
  });
  const { state, policy } = selectedRoleRealignmentState();
  const certification = createCollectiveRoleRealignmentCertificationPortV1({
    policyDomainId: "policy.1",
    certifierId: "role.certifier.1",
    certifierVersion: 1,
    certifierBindingDigest: digest("e"),
    agreement: fixture.client("p0"),
    membership: fixture.membershipPort,
    resolver: fixture.resolver,
    clock: { now: () => ({ wallTime, logicalTimeMs: 100 }) },
    coordinates: {
      resolve: () => ({ height: 1, round: 0, previousCommitDigest: null }),
    },
    witnessTrust: {
      evaluate: () => eligibleTrustDecision(100),
    },
  });
  const certificate = await certification.certify({
    state,
    policy,
    logicalTimeMs: 100,
    expiresAtLogicalMs: 500,
  });
  assert.ok(certificate);
  assert.equal(certificate.certificationKind, "collective_agreement");
  assert.equal(certificate.membershipEpoch, fixture.membership.epoch);
  assert.equal(
    certificate.membershipConfigurationDigest,
    fixture.membership.configurationDigest,
  );
  assert.deepEqual(certificate.witnessIds, ["p0", "p1", "p2", "p3", "p4"]);
  assert.match(certificate.sourceCertificateDigest, /^sha256:[0-9a-f]{64}$/u);
});

test("collective decision adapter binds a verified agreement proof", async () => {
  const fixture = await createFixture({
    activePeerIds: ["p0", "p1", "p2", "p3", "p4"],
  });
  const kinds = [
    "plan_fragment",
    "team_roster",
    "execution_takeover",
    "team_structure",
    "role_transition",
    "strategy_change",
  ];
  const certificationModes = Object.fromEntries(
    kinds.map((kind) => [kind, "byzantine_agreement"]),
  );
  const zeros = Object.fromEntries(kinds.map((kind) => [kind, 0]));
  const minimumAttesters = Object.fromEntries(kinds.map((kind) => [kind, 5]));
  const policy = createCollectiveDecisionPolicyV1({
    schemaVersion: 1,
    policyId: "collective.policy.1",
    policyVersion: 1,
    parentPolicyDigest: null,
    certificationModes,
    minimumTrustedEvidenceByKind: zeros,
    minimumByzantineAttestersByKind: minimumAttesters,
    trustedEvidenceSources: [],
    maximumCandidateTtlMs: 1_000,
    maximumCertificateTtlMs: 500,
    maximumAcceptedHeads: 16,
    maximumCompactedHeads: 64,
    maximumCommitAttempts: 4,
  });
  const scope = createCollectiveDecisionScopeV1({
    tenantId: "tenant.1",
    meshId: "mesh.1",
    policyDomainId: "policy.1",
    missionIntentId: "mission.1",
    objectiveId: "objective.1",
    workItemId: "work.1",
    workItemRevision: 1,
  });
  const candidate = createCollectiveDecisionCandidateV1({
    schemaVersion: 1,
    candidateId: "candidate.1",
    decisionKind: "team_roster",
    scope,
    epoch: 1,
    membershipDigest: fixture.membership.configurationDigest,
    membershipMemberIds: fixture.membership.validators
      .map((validator) => validator.peerId)
      .sort(),
    proposerId: "p0",
    payloadDigest: digest("a"),
    preparedAtLogicalMs: 90,
    expiresAtLogicalMs: 500,
  });
  const certification = createCollectiveDecisionAgreementCertificationPortV1({
    policyDomainId: "policy.1",
    issuerId: "p0",
    agreement: fixture.client("p0"),
    repository: fixture.repositories.p0,
    membership: fixture.membershipPort,
    resolver: fixture.resolver,
    clock: { now: () => ({ wallTime, logicalTimeMs: 100 }) },
    coordinates: {
      resolve: () => ({ height: 1, round: 0, previousCommitDigest: null }),
    },
  });

  const certificate = await certification.certify({ candidate, policy });
  assert.equal(certificate.certificationMode, "byzantine_agreement");
  assert.equal(
    certificate.certificationProofDigest.startsWith("sha256:"),
    true,
  );
  assert.deepEqual(certificate.attesterIds, ["p0", "p1", "p2", "p3", "p4"]);
  assert.equal(
    verifyCollectiveDecisionCertificateV1({
      candidate,
      certificate,
      policy,
      logicalTimeMs: 100,
    }).certificateDigest,
    certificate.certificateDigest,
  );
  assert.equal(
    await certification.verify({
      candidate,
      certificate,
      policy,
      logicalTimeMs: 100,
    }),
    true,
  );
  const tamperedInput = {
    ...certificate,
    certificationProofDigest: digest("b"),
  };
  delete tamperedInput.certificateDigest;
  const tampered = createCollectiveDecisionCertificateV1(tamperedInput);
  assert.equal(
    await certification.verify({
      candidate,
      certificate: tampered,
      policy,
      logicalTimeMs: 100,
    }),
    false,
  );
  const forgedEnvelopeInput = {
    ...certificate,
    issuerId: "p1",
    expiresAtLogicalMs: certificate.expiresAtLogicalMs + 1,
  };
  delete forgedEnvelopeInput.certificateDigest;
  const forgedEnvelope =
    createCollectiveDecisionCertificateV1(forgedEnvelopeInput);
  assert.equal(
    await certification.verify({
      candidate,
      certificate: forgedEnvelope,
      policy,
      logicalTimeMs: 100,
    }),
    false,
  );
});

test("fewer than 2f+1 validators cannot manufacture a commit", async () => {
  const fixture = await createFixture({
    activePeerIds: ["p0", "p1", "p2", "p3"],
  });
  const value = await createCollectiveAgreementValueV1({
    kind: "application",
    valueId: "value.insufficient",
    payload: { decision: "must-not-commit" },
  });
  assert.equal(
    await fixture.client("p0").decide({
      membership: fixture.membership,
      policyDomainId: "policy.1",
      slotId: "slot.insufficient",
      height: 1,
      round: 0,
      value,
      logicalTimeMs: 100,
    }),
    null,
  );
});

test("a durable lock rejects a conflicting higher-round proposal without justification", async () => {
  const fixture = await createFixture({
    activePeerIds: ["p0", "p1", "p2", "p3", "p4"],
  });
  const firstValue = await createCollectiveAgreementValueV1({
    kind: "application",
    valueId: "value.locked",
    payload: { decision: "alpha" },
  });
  assert.ok(
    await fixture.client("p0").decide({
      membership: fixture.membership,
      policyDomainId: "policy.1",
      slotId: "slot.lock",
      height: 1,
      round: 0,
      value: firstValue,
      logicalTimeMs: 100,
    }),
  );
  const conflictingValue = await createCollectiveAgreementValueV1({
    kind: "application",
    valueId: "value.conflicting",
    payload: { decision: "beta" },
  });
  const coordinate = {
    policyDomainId: "policy.1",
    slotId: "slot.lock",
    height: 1,
    round: 1,
    membershipEpoch: fixture.membership.epoch,
    membershipConfigurationDigest: fixture.membership.configurationDigest,
  };
  const request = await createSignedCollectiveAgreementEnvelopeV1({
    scope: scope("p1"),
    signing: signing(fixture.keys.p1, "p1"),
    audiencePeerId: "p0",
    payload: {
      type: "agreement.proposal",
      proposalId: "proposal.conflicting.round.1",
      coordinate,
      proposerPeerId: "p1",
      value: conflictingValue,
      validRound: null,
      justification: null,
      proposedAtLogicalMs: 101,
    },
    clock: { wallTime, logicalTimeMs: 101 },
  });
  const result = await fixture.peers.p0.handle(request);
  assert.deepEqual(result, { accepted: false, code: "locked" });
  const state = await fixture.repositories.p0.readState({
    policyDomainId: "policy.1",
    slotId: "slot.lock",
    height: 1,
  });
  assert.equal(state.lockedRound, 0);
  assert.equal(state.lockedValueDigest, firstValue.valueDigest);
});

test("conflicting signed votes produce portable Trust evidence", async () => {
  const fixture = await createFixture({ activePeerIds: ["p0"] });
  const coordinate = {
    policyDomainId: "policy.1",
    slotId: "slot.equivocation",
    height: 1,
    round: 0,
    membershipEpoch: fixture.membership.epoch,
    membershipConfigurationDigest: fixture.membership.configurationDigest,
  };
  const first = await signedVote(
    fixture,
    "p6",
    coordinate,
    digest("a"),
    "proposal.a",
  );
  const second = await signedVote(
    fixture,
    "p6",
    coordinate,
    digest("b"),
    "proposal.b",
  );
  assert.equal(await fixture.repositories.p0.observeVote(first), null);
  const proof = await fixture.repositories.p0.observeVote(second);
  assert.ok(proof);
  const evidence = await createCollectiveAgreementEquivocationEvidenceV1({
    proof,
    resolver: fixture.resolver,
    tenantId: "tenant.1",
    meshId: "mesh.1",
    reporterPeerId: "p0",
    observedAt: wallTime,
  });
  assert.equal(evidence.subject.peerId, "p6");
  assert.equal(evidence.criterionId, "collective.agreement.no_equivocation");
  assert.equal(evidence.outcome, "violated");
  assert.equal(evidence.basisReferences.length, 2);
  await assert.rejects(
    createCollectiveAgreementEquivocationEvidenceV1({
      proof: { ...proof, proofDigest: digest("c") },
      resolver: fixture.resolver,
      tenantId: "tenant.1",
      meshId: "mesh.1",
      reporterPeerId: "p0",
      observedAt: wallTime,
    }),
    /equivocation proof is invalid/,
  );
});

test("concurrent conflicting local votes are serialized before signing", async () => {
  const fixture = await createFixture({ activePeerIds: [] });
  const repository = new InMemoryCollectiveAgreementRepositoryV1();
  const coordinate = {
    policyDomainId: "policy.1",
    slotId: "slot.concurrent-vote",
    height: 1,
    round: 0,
    membershipEpoch: fixture.membership.epoch,
    membershipConfigurationDigest: fixture.membership.configurationDigest,
  };
  let signaturesCreated = 0;
  const record = (valueDigest, proposalId) =>
    repository.recordLocalVote({
      coordinate,
      phase: "prevote",
      proposalId,
      valueDigest,
      justifiedRound: null,
      create: async () => {
        signaturesCreated += 1;
        await Promise.resolve();
        return signedVote(fixture, "p2", coordinate, valueDigest, proposalId);
      },
    });
  const results = await Promise.all([
    record(digest("a"), "proposal.concurrent.a"),
    record(digest("b"), "proposal.concurrent.b"),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), [
    "conflict",
    "signed",
  ]);
  assert.equal(signaturesCreated, 1);
});

test("membership size must be exactly 3f+1", async () => {
  const fixture = await createFixture({ activePeerIds: [] });
  await assert.rejects(
    createCollectiveAgreementMembershipV1({
      epoch: 2,
      faultThreshold: 2,
      validators: fixture.membership.validators.slice(0, 6),
    }),
    /invalid_value/,
  );
});

test("HTTP boundaries stop reading after the configured byte limit", async () => {
  const oversizedRequest = new Request("https://peer.invalid/agreement", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value: "too-large" }),
  });
  const response = await handleCollectiveAgreementHttpRequestV1(
    { handle: async () => assert.fail("oversized input reached the peer") },
    oversizedRequest,
    { maximumRequestBytes: 8 },
  );
  assert.equal(response.status, 413);

  const transport = new CollectiveAgreementHttpTransportV1({
    endpointForPeer: () => "https://peer.invalid/agreement",
    maximumResponseBytes: 8,
    fetch: async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("123456789"));
            controller.close();
          },
        }),
        { status: 200 },
      ),
  });
  assert.equal(await transport.exchange({ peerId: "p0", request: {} }), null);
});

test("ordered commit certificates form a verifiable catch-up chain", async () => {
  const fixture = await createFixture({
    activePeerIds: ["p0", "p1", "p2", "p3", "p4"],
  });
  const firstValue = await createCollectiveAgreementValueV1({
    kind: "synchronization_watermark",
    valueId: "watermark.1",
    payload: { headVersion: 1, headDigest: digest("1") },
  });
  const first = await fixture.client("p0").decide({
    membership: fixture.membership,
    policyDomainId: "policy.1",
    slotId: "sync.slot",
    height: 1,
    round: 0,
    value: firstValue,
    logicalTimeMs: 100,
  });
  assert.ok(first);
  const secondValue = await createCollectiveAgreementValueV1({
    kind: "synchronization_watermark",
    valueId: "watermark.2",
    previousCommitDigest: first.certificateDigest,
    payload: { headVersion: 2, headDigest: digest("2") },
  });
  const second = await fixture.client("p1").decide({
    membership: fixture.membership,
    policyDomainId: "policy.1",
    slotId: "sync.slot",
    height: 2,
    round: 0,
    value: secondValue,
    logicalTimeMs: 110,
  });
  assert.ok(second);
  const bundle = await createCollectiveAgreementCatchupBundleV1({
    policyDomainId: "policy.1",
    slotId: "sync.slot",
    fromHeightExclusive: 0,
    commits: [first, second],
  });
  assert.ok(bundle);
  assert.ok(
    await verifyCollectiveAgreementCatchupBundleV1({
      bundle,
      membershipFor: async () => fixture.membership,
      resolver: fixture.resolver,
      verifiedAt: wallTime,
      trustedPreviousCommitDigest: null,
    }),
  );
  assert.equal(bundle.toHeightInclusive, 2);
  const receiver = new InMemoryCollectiveAgreementRepositoryV1();
  assert.deepEqual(
    await applyCollectiveAgreementCatchupBundleV1({
      bundle,
      repository: receiver,
      membershipFor: async () => fixture.membership,
      resolver: fixture.resolver,
      verifiedAt: wallTime,
    }),
    { applied: 2, finalHeight: 2 },
  );
});

test("membership activation requires certificates from both validator sets", async () => {
  const prior = await createFixture({
    activePeerIds: ["p0", "p1", "p2", "p3", "p4"],
  });
  const nextMembership = await createCollectiveAgreementMembershipV1({
    epoch: 2,
    faultThreshold: 2,
    validators: prior.membership.validators,
  });
  const next = createNetwork({
    membership: nextMembership,
    keys: prior.keys,
    resolver: prior.resolver,
    activePeerIds: ["p0", "p1", "p2", "p3", "p4"],
  });
  const value = await createCollectiveAgreementMembershipReconfigurationValueV1(
    {
      valueId: "membership.change.2",
      priorConfigurationDigest: prior.membership.configurationDigest,
      nextConfigurationDigest: nextMembership.configurationDigest,
      activationHeight: 2,
      previousCommitDigest: null,
    },
  );
  const priorCommit = await prior.client("p0").decide({
    membership: prior.membership,
    policyDomainId: "policy.1",
    slotId: "membership.slot",
    height: 1,
    round: 0,
    value,
    logicalTimeMs: 100,
  });
  const nextCommit = await next.client("p0").decide({
    membership: nextMembership,
    policyDomainId: "policy.1",
    slotId: "membership.slot",
    height: 1,
    round: 0,
    value,
    logicalTimeMs: 100,
  });
  assert.ok(priorCommit);
  assert.ok(nextCommit);
  const joint =
    await createCollectiveAgreementJointReconfigurationCertificateV1({
      priorMembership: prior.membership,
      nextMembership,
      priorCertificate: priorCommit,
      nextCertificate: nextCommit,
      resolver: prior.resolver,
      verifiedAt: wallTime,
    });
  assert.ok(joint);
  assert.equal(joint.nextMembership.epoch, 2);
  assert.ok(
    await verifyCollectiveAgreementJointReconfigurationCertificateV1({
      certificate: joint,
      resolver: prior.resolver,
      verifiedAt: "2030-06-01T00:00:00.000Z",
    }),
  );
  assert.equal(
    await verifyCollectiveAgreementJointReconfigurationCertificateV1({
      certificate: { ...joint, certificateDigest: digest("d") },
      resolver: prior.resolver,
      verifiedAt: wallTime,
    }),
    null,
  );
  assert.equal(
    await createCollectiveAgreementJointReconfigurationCertificateV1({
      priorMembership: prior.membership,
      nextMembership,
      priorCertificate: priorCommit,
      nextCertificate: priorCommit,
      resolver: prior.resolver,
      verifiedAt: wallTime,
    }),
    null,
  );
});

async function createFixture({ activePeerIds }) {
  const peerIds = ["p0", "p1", "p2", "p3", "p4", "p5", "p6"];
  const keys = Object.create(null);
  const records = [];
  for (const peerId of peerIds) {
    const pair = await crypto.subtle.generateKey(
      MESH_SIGNATURE_ALGORITHM,
      true,
      ["sign", "verify"],
    );
    keys[peerId] = pair;
    records.push({
      tenantId: "tenant.1",
      meshId: "mesh.1",
      peerId,
      keyId: `key.${peerId}`,
      algorithm: MESH_SIGNATURE_ALGORITHM,
      publicKey: pair.publicKey,
      validFrom: "2029-01-01T00:00:00.000Z",
      validUntil: "2031-01-01T00:00:00.000Z",
      status: "active",
    });
  }
  const membership = await createCollectiveAgreementMembershipV1({
    epoch: 1,
    faultThreshold: 2,
    validators: peerIds.map((peerId) => ({
      peerId,
      instanceId: `instance.${peerId}`,
      keyId: `key.${peerId}`,
    })),
  });
  const resolver = createStaticMeshKeyResolver(records);
  const network = createNetwork({
    membership,
    keys,
    resolver,
    activePeerIds,
  });
  return {
    membership,
    keys,
    keyRecords: records,
    resolver,
    ...network,
  };
}

function createNetwork({ membership, keys, resolver, activePeerIds }) {
  const peerIds = membership.validators.map((validator) => validator.peerId);
  const membershipPort = {
    current: async () => membership,
    resolve: async (input) =>
      input.epoch === membership.epoch &&
      input.configurationDigest === membership.configurationDigest
        ? membership
        : null,
  };
  const repositories = Object.create(null);
  const peers = Object.create(null);
  const transport = new InMemoryCollectiveAgreementTransportV1();
  const clock = { now: () => ({ wallTime, logicalTimeMs: 100 }) };
  for (const peerId of peerIds) {
    repositories[peerId] = new InMemoryCollectiveAgreementRepositoryV1();
    if (!activePeerIds.includes(peerId)) continue;
    peers[peerId] = new CollectiveAgreementPeerV1({
      scope: scope(peerId),
      signing: signing(keys[peerId], peerId),
      resolver,
      membership: membershipPort,
      repository: repositories[peerId],
      semantics: {
        evaluate: async () => ({ accepted: true, reasonCode: "accepted" }),
      },
      clock,
    });
    transport.register(peerId, peers[peerId]);
  }
  return {
    membershipPort,
    repositories,
    peers,
    transport,
    client(peerId) {
      return new CollectiveAgreementClientV1({
        scope: scope(peerId),
        signing: signing(keys[peerId], peerId),
        resolver,
        membership: membershipPort,
        repository: repositories[peerId],
        transport,
        clock,
        requestTimeoutMs: 100,
      });
    },
  };
}

function scope(peerId) {
  return {
    tenantId: "tenant.1",
    meshId: "mesh.1",
    peerId,
    instanceId: `instance.${peerId}`,
  };
}

function signing(pair, peerId) {
  return {
    privateKey: pair.privateKey,
    keyId: `key.${peerId}`,
    algorithm: MESH_SIGNATURE_ALGORITHM,
  };
}

function signedVote(fixture, peerId, coordinate, valueDigest, proposalId) {
  return createSignedCollectiveAgreementEnvelopeV1({
    scope: scope(peerId),
    signing: signing(fixture.keys[peerId], peerId),
    audiencePeerId: "p0",
    payload: {
      type: "agreement.vote",
      coordinate,
      phase: "prevote",
      proposalId,
      voterPeerId: peerId,
      valueDigest,
      votedAtLogicalMs: 100,
    },
    clock: { wallTime, logicalTimeMs: 100 },
  });
}

function selectedRoleRealignmentState() {
  const alignmentPolicy = {
    schemaVersion: 1,
    policyId: "alignment.policy.1",
    policyVersion: 1,
    parentPolicyDigest: null,
    thresholds: {
      healthyCoherenceBps: 8_000,
      reinforceCoherenceBelowBps: 7_000,
      pauseCoherenceAtOrBelowBps: 3_000,
      denyCoherenceAtOrBelowBps: 1_000,
      challengeContextAtOrAboveBps: 8_000,
      maximumUncertaintyBps: 6_000,
    },
    consecutiveBreachLimit: 1,
    recoverySignalsRequired: 2,
    reinforcementCooldownSignals: 0,
    denyActionsWhileDegraded: true,
    budgets: {
      maximumReinforcements: 8,
      maximumContextChallenges: 4,
      maximumPauses: 2,
    },
    limits: {
      rollingWindowSignals: 16,
      maximumSignals: 1_000,
      maximumRetainedEvents: 256,
      maximumReasonCodesPerSignal: 8,
      maximumEvidenceReferencesPerSignal: 8,
      maximumAssessmentTtlMs: 1_000,
      maximumStateBytes: 16_777_216,
    },
  };
  const rolePolicy = {
    schemaVersion: 1,
    policyId: "role.policy.1",
    policyVersion: 1,
    parentPolicyDigest: null,
    minimumIndependentEvaluations: 1,
    minimumCertificationWitnesses: 5,
    thresholds: {
      minimumRoleFitBps: 7_000,
      minimumMissionContributionBps: 6_000,
      maximumUncertaintyBps: 3_000,
      maximumTransitionRiskBps: 3_000,
    },
    scoringWeights: {
      roleFitBps: 4_000,
      missionContributionBps: 3_000,
      uncertaintyPenaltyBps: 1_500,
      transitionRiskPenaltyBps: 1_500,
    },
    limits: {
      maximumProposers: 4,
      maximumCandidates: 8,
      maximumEvaluationsPerCandidate: 4,
      maximumReasonCodes: 8,
      maximumEvidenceReferences: 8,
      maximumCapabilities: 8,
      maximumResourceClasses: 8,
      maximumInstructions: 8,
      maximumInstructionBytes: 4_096,
      maximumConstraintsBytes: 16_384,
      maximumRequestTtlMs: 2_000,
      maximumEvaluationTtlMs: 1_000,
      maximumCertificationTtlMs: 1_000,
      maximumRetainedEvents: 256,
      maximumStateBytes: 16_777_216,
    },
  };
  const anchor = createRoleAlignmentRoleAnchorV1({
    tenantId: "tenant.1",
    sessionId: "session.1",
    agentId: "agent.1",
    objectiveId: "objective.1",
    roleBindingId: "role.1",
    roleRevision: 1,
    predecessorRoleBindingId: null,
    roleKey: "observer",
    roleContent: {
      instructions: ["Inspect evidence."],
      constraints: { externalWrites: false },
    },
  });
  let alignment = createRoleAlignmentStateV1({
    controllerId: "alignment.1",
    controllerVersion: 1,
    implementationId: "alignment.build.1",
    policy: alignmentPolicy,
    roleAnchor: anchor,
    createdAtLogicalMs: 0,
  });
  alignment = observeRoleAlignmentSignalV1(
    alignment,
    {
      expectedRevision: alignment.revision,
      signal: {
        schemaVersion: 1,
        signalId: "signal.1",
        assessmentRequestId: "assessment.1",
        assessorId: "assessor.1",
        assessorVersion: 1,
        assessorBindingDigest: digest("a"),
        tenantId: "tenant.1",
        sessionId: "session.1",
        agentId: "agent.1",
        stepId: "step.1",
        checkpoint: "pre_step",
        roleAnchorDigest: anchor.anchorDigest,
        roleRevision: 1,
        targetDigest: digest("1"),
        coherenceBps: 6_000,
        uncertaintyBps: 1_000,
        contextInconsistencyBps: 500,
        hardViolation: false,
        reasonCodes: ["role_drift"],
        evidenceReferenceIds: ["evidence.1"],
        observedAtLogicalMs: 1,
        expiresAtLogicalMs: 500,
      },
    },
    alignmentPolicy,
  ).state;
  const authority = createRoleAuthorityCeilingV1({
    mandateDigest: digest("b"),
    capabilityKeys: ["evidence.read"],
    resourceClasses: ["local.evidence"],
    maximumActionBudgetUnits: 10,
    validUntilLogicalMs: 1_000,
  });
  const request = createRoleRealignmentRequestV1({
    requestId: "request.1",
    policy: rolePolicy,
    alignmentPolicy,
    alignmentState: alignment,
    authorityCeiling: authority,
    createdAtLogicalMs: 2,
    expiresAtLogicalMs: 1_000,
  });
  const definition = createTrustedRoleDefinitionV1({
    catalogId: "catalog.1",
    definitionId: "reviewer.1",
    definitionRevision: 1,
    predecessorDefinitionDigest: null,
    roleKey: "reviewer",
    instructions: ["Review inconsistent evidence."],
    constraints: { externalWrites: false },
    requiredCapabilityKeys: ["evidence.read"],
    requiredResourceClasses: ["local.evidence"],
    maximumActionBudgetUnits: 5,
    validFromLogicalMs: 0,
    validUntilLogicalMs: 1_000,
  });
  const proposal = createRoleCandidateProposalV1({
    proposalId: "proposal.1",
    requestDigest: request.requestDigest,
    proposerId: "proposer.1",
    proposerVersion: 1,
    proposerBindingDigest: digest("c"),
    definitionId: definition.definitionId,
    definitionRevision: definition.definitionRevision,
    definitionDigest: definition.definitionDigest,
    reasonCodes: ["catalog_match"],
    evidenceReferenceIds: ["evidence.role.1"],
    proposedAtLogicalMs: 3,
    expiresAtLogicalMs: 900,
  });
  let state = createRoleRealignmentStateV1({
    controllerId: "realignment.1",
    controllerVersion: 1,
    implementationId: "realignment.build.1",
    policy: rolePolicy,
    request,
    createdAtLogicalMs: 2,
  });
  state = admitRoleCandidateV1(
    state,
    {
      expectedRevision: state.revision,
      proposal,
      proposerEligibilityDecisionDigest: digest("d"),
      definition,
      logicalTimeMs: 3,
    },
    rolePolicy,
  ).state;
  const candidate = state.candidates[0];
  state = recordRoleCandidateEvaluationV1(
    state,
    {
      expectedRevision: state.revision,
      evaluation: createRoleCandidateEvaluationV1({
        evaluationId: "evaluation.1",
        requestDigest: request.requestDigest,
        candidateDigest: candidate.candidateDigest,
        definitionDigest: candidate.proposal.definitionDigest,
        evaluatorId: "evaluator.1",
        evaluatorVersion: 1,
        evaluatorBindingDigest: digest("e"),
        eligibilityDecisionDigest: digest("f"),
        eligible: true,
        roleFitBps: 9_000,
        missionContributionBps: 8_500,
        uncertaintyBps: 1_000,
        transitionRiskBps: 1_000,
        reasonCodes: ["candidate_supported"],
        evidenceReferenceIds: ["evidence.candidate.1"],
        evaluatedAtLogicalMs: 4,
        expiresAtLogicalMs: 900,
      }),
      logicalTimeMs: 4,
    },
    rolePolicy,
  ).state;
  state = selectRoleCandidateV1(
    state,
    {
      expectedRevision: state.revision,
      selectionId: "selection.1",
      logicalTimeMs: 5,
    },
    rolePolicy,
  ).state;
  return { state, policy: rolePolicy };
}

function eligibleTrustDecision(logicalTimeMs) {
  const trustDigest = (character) => character.repeat(64);
  const decision = {
    schemaVersion: 1,
    eligibilityDecisionId: "pending",
    requestDigest: trustDigest("1"),
    subjectDigest: trustDigest("2"),
    scopeDigest: trustDigest("3"),
    policyDigest: trustDigest("4"),
    profileId: `profile:${trustDigest("5")}`,
    profileDigest: trustDigest("5"),
    quarantineRecordIds: [],
    evaluatedAtLogicalMs: logicalTimeMs,
    disposition: "eligible",
    requirementResults: [],
    reasonCodes: [],
  };
  return {
    ...decision,
    eligibilityDecisionId: `eligibility-decision:${digestTrustEligibilityDecisionV1(decision)}`,
  };
}

function digest(character) {
  return `sha256:${character.repeat(64)}`;
}
