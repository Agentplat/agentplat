import assert from "node:assert/strict";
import test from "node:test";
import {
  CollectivePeerNodeQuorumEvidenceV1,
  CollectiveQuorumClientV1,
  CollectiveQuorumPeerV1,
  InMemoryCollectiveQuorumRepositoryV1,
  InMemoryCollectiveQuorumTransportV1,
} from "../dist/index.js";
import { createStaticMeshKeyResolver } from "../../mesh-crypto/dist/index.js";
import { MESH_SIGNATURE_ALGORITHM } from "../../mesh-protocol/dist/index.js";

const wallTime = "2030-01-01T00:00:00.000Z";
const leaseExpiresAt = "2030-01-01T00:10:00.000Z";
const digest = (character) => `sha256:${character.repeat(64)}`;

test("owner plus witness majority confirms one exact assignment", async () => {
  const fixture = await createFixture();
  const client = fixture.client("assignee");
  const confirmation = await client.confirm({
    workContract: workContract(),
    acceptanceMessageId: "acceptance.message.1",
    latestLeaseRenewalId: null,
    eligibleWitnessPeerIds: ["witness.1", "witness.2", "witness.3"],
    recoveryWitnessThreshold: 2,
    logicalTimeMs: 100,
  });
  assert.ok(confirmation);
  assert.equal(confirmation.ownerPeerId, "owner");
  assert.equal(confirmation.acceptanceId, "acceptance.1");
  assert.equal(confirmation.confirmedLeaseExpiresAt, leaseExpiresAt);
  assert.deepEqual(confirmation.confirmedWitnessPeerIds, [
    "witness.1",
    "witness.2",
  ]);
  const certificate = await fixture.repositories.assignee.getCertificate(
    confirmation.confirmationId,
  );
  assert.equal(certificate?.kind, "assignment_confirmation");
  assert.equal(certificate?.witnessAttestations.length, 2);
  let conflictingCreateCalled = false;
  const conflict = await fixture.repositories.owner.attestAssignment({
    assignmentSlotDigest:
      certificate.ownerAttestation.payload.assignmentSlotDigest,
    valueDigest: digest("f"),
    requestMessageId: "request.assignment.conflict",
    create: async () => {
      conflictingCreateCalled = true;
      return certificate.ownerAttestation;
    },
  });
  assert.equal(conflict, null);
  assert.equal(conflictingCreateCalled, false);
});

test("two-phase recovery carries an accepted value into higher ballots", async () => {
  const fixture = await createFixture();
  const first = await fixture.client("assignee").select(recoveryInput());
  assert.ok(first);
  assert.equal(first.certifiedWitnessPeerIds.length, 2);

  const second = await fixture.client("owner").select({
    ...recoveryInput(),
    proposals: [
      ...recoveryInput().proposals,
      {
        takeoverProposalId: "proposal.c",
        proposedAssigneePeerId: "candidate.c",
        acceptedAtLogicalMs: 92,
      },
    ],
  });
  assert.ok(second);
  assert.equal(second.selectedProposalId, first.selectedProposalId);
  assert.equal(second.selectedAssigneePeerId, first.selectedAssigneePeerId);
  assert.equal(second.scopeDigest, first.scopeDigest);

  for (const peerId of ["witness.1", "witness.2"]) {
    const state = await fixture.repositories[peerId].inspectRecovery(
      digest("3"),
    );
    assert.equal(
      state?.accepted?.value.selectedProposalId,
      first.selectedProposalId,
    );
  }
});

test("a partition without a witness majority fails closed", async () => {
  const fixture = await createFixture();
  fixture.transport.unregister("witness.2");
  fixture.transport.unregister("witness.3");
  const decision = await fixture.client("assignee").select(recoveryInput());
  assert.equal(decision, null);
});

test("quorum acceptors refuse participation until causal state is ready", async () => {
  const operations = [];
  const fixture = await createFixture({
    readiness: {
      check: async (input) => {
        operations.push(input.operation);
        return { ready: false, reasonCode: "sync_certificate_missing" };
      },
    },
  });
  assert.equal(
    await fixture.client("assignee").confirm({
      workContract: workContract(),
      acceptanceMessageId: "acceptance.message.1",
      latestLeaseRenewalId: null,
      eligibleWitnessPeerIds: ["witness.1", "witness.2", "witness.3"],
      recoveryWitnessThreshold: 2,
      logicalTimeMs: 100,
    }),
    null,
  );
  assert.ok(operations.includes("assignment_attestation"));
});

test("an operation stays pinned to its starting membership epoch", async () => {
  const first = {
    epoch: 1,
    configurationDigest: digest("8"),
    memberPeerIds: ["assignee", "owner", "witness.1", "witness.2", "witness.3"],
    memberInstances: [
      "assignee",
      "owner",
      "witness.1",
      "witness.2",
      "witness.3",
    ].map((peerId) => ({ peerId, instanceId: `instance.${peerId}` })),
  };
  const second = {
    epoch: 2,
    configurationDigest: digest("9"),
    memberPeerIds: ["owner", "witness.1", "witness.2", "witness.3"],
    memberInstances: ["owner", "witness.1", "witness.2", "witness.3"].map(
      (peerId) => ({ peerId, instanceId: `instance.${peerId}` }),
    ),
  };
  let current = first;
  const history = new Map([
    [first.epoch, first],
    [second.epoch, second],
  ]);
  const membership = {
    currentBinding: async () => current,
    resolveBinding: async ({ epoch, configurationDigest }) => {
      const binding = history.get(epoch);
      return binding?.configurationDigest === configurationDigest
        ? binding
        : null;
    },
  };
  const fixture = await createFixture({ membership });
  const exchange = fixture.transport.exchange.bind(fixture.transport);
  const observed = [];
  fixture.transport.exchange = async (input) => {
    observed.push(input.request.payload);
    current = second;
    return exchange(input);
  };
  const confirmation = await fixture.client("assignee").confirm({
    workContract: workContract(),
    acceptanceMessageId: "acceptance.message.1",
    latestLeaseRenewalId: null,
    eligibleWitnessPeerIds: ["witness.1", "witness.2", "witness.3"],
    recoveryWitnessThreshold: 2,
    logicalTimeMs: 100,
  });
  assert.ok(confirmation);
  assert.equal(observed.length > 0, true);
  assert.equal(
    observed.every(
      (payload) =>
        payload.membershipEpoch === 1 &&
        payload.membershipConfigurationDigest === first.configurationDigest,
    ),
    true,
  );
});

test("tampering with a signed request is rejected before semantic evidence", async () => {
  const fixture = await createFixture();
  const client = fixture.client("assignee");
  const originalExchange = fixture.transport.exchange.bind(fixture.transport);
  let observed;
  fixture.transport.exchange = async (input) => {
    observed = input.request;
    return originalExchange(input);
  };
  await client.select(recoveryInput());
  assert.ok(observed);
  const tampered = structuredClone(observed);
  tampered.payload.objectiveRevision = 99;
  const rejected =
    await fixture.peers[observed.audiencePeerId].handle(tampered);
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.code, "invalid_envelope");
});

test("node evidence confirms only the exact durable lease projection", async () => {
  const request = {
    type: "assignment.confirm.request",
    scopeDigest: digest("1"),
    assignmentSlotDigest: digest("2"),
    workContractId: "contract.1",
    workContractDigest: digest("3"),
    policyDomainId: "policy.1",
    objectiveId: "objective.1",
    objectiveRevision: 1,
    workItemId: "work.1",
    workItemRevision: 1,
    ownerPeerId: "owner",
    assignedPeerId: "assignee",
    assignedInstanceId: "instance.assignee",
    assignmentAuthorityId: "authority.1",
    assignmentEpoch: 1,
    fencingToken: "fence.1",
    acceptanceMessageId: "acceptance.message.1",
    latestLeaseRenewalId: null,
    eligibleWitnessPeerIds: ["witness.1", "witness.2", "witness.3"],
    recoveryWitnessThreshold: 2,
    requestedAtLogicalMs: 100,
  };
  const lease = {
    objectiveId: "objective.1",
    objectiveRevision: 1,
    workItemId: "work.1",
    workItemRevision: 1,
    ownerPeerId: "owner",
    assigneePeerId: "assignee",
    assignmentAuthorityId: "authority.1",
    assignmentEpoch: 1,
    fencingToken: "fence.1",
    acceptanceId: "acceptance.1",
    acceptanceMessageId: "acceptance.message.1",
    currentLeaseExpiresAt: leaseExpiresAt,
    currentLeaseExpiresAtLogical: 1_000,
    status: "active",
  };
  const evidence = new CollectivePeerNodeQuorumEvidenceV1({
    scope: scope("owner"),
    readState: async () => ({
      scope: scope("owner"),
      runtime: {
        mesh: {
          allocation: {
            leaseHeads: { lease },
            witnessAssignments: {},
            assignmentResponses: {
              award: {
                envelope: {
                  messageId: "acceptance.message.1",
                  sender: {
                    peerId: "assignee",
                    instanceId: "instance.assignee",
                  },
                  payload: { type: "work.accept" },
                },
              },
            },
            takeoverProposals: {},
          },
        },
      },
    }),
  });
  assert.deepEqual(
    await evidence.confirmAssignment({
      request,
      localPeerId: "owner",
      logicalTimeMs: 100,
    }),
    {
      acceptanceId: "acceptance.1",
      confirmedLeaseExpiresAt: leaseExpiresAt,
      attesterRole: "owner",
    },
  );
  assert.equal(
    await evidence.confirmAssignment({
      request: { ...request, fencingToken: "fence.stale" },
      localPeerId: "owner",
      logicalTimeMs: 100,
    }),
    null,
  );
});

async function createFixture(options = {}) {
  const peerIds = ["owner", "assignee", "witness.1", "witness.2", "witness.3"];
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
  const resolver = createStaticMeshKeyResolver(records);
  const repositories = Object.create(null);
  const peers = Object.create(null);
  const transport = new InMemoryCollectiveQuorumTransportV1();
  const clock = { now: () => ({ wallTime, logicalTimeMs: 100 }) };
  for (const peerId of peerIds) {
    repositories[peerId] = new InMemoryCollectiveQuorumRepositoryV1();
    if (peerId === "assignee") continue;
    peers[peerId] = new CollectiveQuorumPeerV1({
      scope: scope(peerId),
      signing: {
        privateKey: keys[peerId].privateKey,
        keyId: `key.${peerId}`,
        algorithm: MESH_SIGNATURE_ALGORITHM,
      },
      resolver,
      membership: options.membership,
      readiness: options.readiness,
      repository: repositories[peerId],
      evidence: {
        confirmAssignment: async ({ request, localPeerId }) => ({
          acceptanceId: "acceptance.1",
          confirmedLeaseExpiresAt: leaseExpiresAt,
          attesterRole:
            localPeerId === request.ownerPeerId ? "owner" : "witness",
        }),
        acceptsRecoveryValue: async ({ request, selected }) =>
          request.proposals.some(
            (proposal) =>
              proposal.takeoverProposalId === selected.selectedProposalId &&
              proposal.proposedAssigneePeerId ===
                selected.selectedAssigneePeerId,
          ),
      },
      clock,
    });
    transport.register(peerId, peers[peerId]);
  }
  return {
    repositories,
    peers,
    transport,
    client(peerId) {
      return new CollectiveQuorumClientV1({
        scope: scope(peerId),
        signing: {
          privateKey: keys[peerId].privateKey,
          keyId: `key.${peerId}`,
          algorithm: MESH_SIGNATURE_ALGORITHM,
        },
        resolver,
        membership: options.membership,
        repository: repositories[peerId],
        transport,
        clock,
        maximumAttempts: 2,
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
    policyDomainId: "policy.1",
  };
}

function workContract() {
  return {
    schemaVersion: 1,
    workContractId: "contract.1",
    generation: 1,
    tenantId: "tenant.1",
    policyDomainId: "policy.1",
    mandate: {
      schemaVersion: 1,
      mandateId: "mandate.1",
      mandateRevision: 1,
      mandateDigest: digest("a"),
    },
    objective: {
      schemaVersion: 1,
      meshId: "mesh.1",
      objectiveId: "objective.1",
      objectiveDocumentId: "objective.document.1",
      objectiveRevision: 1,
      acceptedMessageId: "objective.message.1",
      acceptedPolicyDigest: digest("b"),
    },
    assignment: {
      schemaVersion: 1,
      workItemId: "work.1",
      workItemRevision: 1,
      ownerPeerId: "owner",
      assignedPeerId: "assignee",
      assignedInstanceId: "instance.assignee",
      assignmentAuthorityId: "authority.1",
      assignmentEpoch: 1,
      authorityGeneration: 1,
      fencingToken: "fence.1",
      leaseExpiresAtLogicalMs: 1000,
      workDeadline: "2030-01-01T01:00:00.000Z",
    },
    roleKey: "worker",
    requiredCapabilityKeys: ["capability.1"],
    completionCriteria: ["done"],
    inputReferenceDigest: null,
    reservedBudgetUnits: 1,
    maximumActionBudgetUnits: 1,
    trustPolicyId: "trust.1",
    inferencePolicyId: "inference.1",
    createdAtLogicalMs: 1,
    updatedAtLogicalMs: 1,
    status: "active",
    terminalReasonCode: null,
    workContractDigest: digest("c"),
  };
}

function recoveryInput() {
  return {
    scopeDigest: digest("3"),
    objectiveId: "objective.1",
    objectiveRevision: 1,
    objectiveExpiresAtLogicalMs: 500,
    workItemId: "work.1",
    workItemRevision: 1,
    priorAssignmentEpoch: 1,
    proposedAssignmentEpoch: 2,
    proposals: [
      {
        takeoverProposalId: "proposal.a",
        proposedAssigneePeerId: "candidate.a",
        acceptedAtLogicalMs: 90,
      },
      {
        takeoverProposalId: "proposal.b",
        proposedAssigneePeerId: "candidate.b",
        acceptedAtLogicalMs: 91,
      },
    ],
    eligibleWitnessPeerIds: ["witness.1", "witness.2", "witness.3"],
    recoveryWitnessThreshold: 2,
    logicalTimeMs: 100,
  };
}
