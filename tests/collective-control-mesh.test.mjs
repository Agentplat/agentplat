import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  acceptDelegationMandateV1,
  acceptDelegationRevocationV1,
  createCollectiveAuthorityStateV1,
  createCollectiveExecutionStateV1,
  createDelegationMandateV1,
  createDelegationRevocationV1,
  delegationMandateDigestV1,
  delegationRevocationDigestV1,
  digestCollectiveJsonV1,
  registerWorkContractV1,
} from "@agentplat/collective-control";
import {
  DELEGATION_MANDATE_REFERENCE_PREFIX_V1,
  createGovernedMeshObjectiveInboundProcessorV1,
  createWorkContractFromMeshV1,
  evaluateWorkContractCurrentnessV1,
} from "@agentplat/collective-control/mesh";
import {
  DEFAULT_MESH_CRYPTO_POLICY,
  createStaticMeshKeyResolver,
  createWebCryptoMeshEnvelopeSigner,
} from "@agentplat/mesh-crypto";
import {
  createMeshCoordinationInboundState,
  createMeshCoordinationState,
  createMeshDiscoveryState,
  createMeshObjectiveInboundProcessor,
  createMeshObjectiveInboundRuntimeState,
  createMeshObjectiveWorkState,
} from "@agentplat/mesh/coordination";
import { MESH_SIGNATURE_ALGORITHM } from "@agentplat/mesh-protocol";

const fixtureRoot = new URL(
  "../packages/mesh-protocol/fixtures/v0/",
  import.meta.url,
);
const announceFixture = fixture("objective-announce.json");
const cancelFixture = fixture("objective-cancel.json");
const verifiedAt = "2026-07-30T00:00:01.000Z";
const signer = createWebCryptoMeshEnvelopeSigner({
  signingPolicy: { allowedWireVersions: [0, 1] },
});
let keyPair;
let meshProcessor;

test.before(async () => {
  keyPair = await crypto.subtle.generateKey(MESH_SIGNATURE_ALGORITHM, true, [
    "sign",
    "verify",
  ]);
  const resolver = createStaticMeshKeyResolver([
    {
      tenantId: "tenant-a",
      meshId: "mesh-a",
      peerId: "peer-a",
      keyId: "key-a",
      algorithm: MESH_SIGNATURE_ALGORITHM,
      publicKey: keyPair.publicKey,
      validFrom: "2026-01-01T00:00:00.000Z",
      validUntil: "2027-01-01T00:00:00.000Z",
      status: "active",
    },
  ]);
  meshProcessor = createMeshObjectiveInboundProcessor({
    resolver,
    cryptoPolicy: DEFAULT_MESH_CRYPTO_POLICY,
  });
});

function fixture(name) {
  return JSON.parse(readFileSync(new URL(name, fixtureRoot), "utf8"));
}

function messageId(value) {
  const bytes = new Uint8Array(16);
  new DataView(bytes.buffer).setUint32(12, value);
  return Buffer.from(bytes).toString("base64url");
}

function identity() {
  return {
    tenantId: "tenant-a",
    meshId: "mesh-a",
    peerId: "peer-b",
    instanceId: "instance-b",
    keyId: "key-b",
  };
}

function meshRuntime() {
  const local = identity();
  return createMeshObjectiveInboundRuntimeState(
    createMeshCoordinationState({ identity: local }),
    createMeshDiscoveryState({
      identity: local,
      subscriptions: ["membership", "objective"],
      admittedPeers: [
        {
          peerId: "peer-a",
          instanceIds: ["instance-a"],
          validUntil: "2027-01-01T00:00:00.000Z",
        },
      ],
    }),
    createMeshObjectiveWorkState({
      identity: local,
      issuerAuthorities: [
        {
          peerId: "peer-a",
          keyIds: ["key-a"],
          validUntil: "2027-01-01T00:00:00.000Z",
        },
      ],
    }),
    createMeshCoordinationInboundState({ identity: local }),
  );
}

function localProof(signedDigest) {
  return {
    schemaVersion: 1,
    kind: "local_attestation",
    issuerId: "peer-a",
    attestorId: "attestor:local",
    attestationId: `attestation:${signedDigest.slice(-12)}`,
    signedDigest,
  };
}

function verification(signedDigest, at = verifiedAt) {
  return {
    schemaVersion: 1,
    verifierId: "verifier:local",
    verifierVersion: 1,
    issuerId: "peer-a",
    signedDigest,
    verifiedAt: at,
    status: "verified",
  };
}

function mandate() {
  const statement = {
    schemaVersion: 1,
    mandateId: "mandate:mesh-a",
    tenantId: "tenant-a",
    policyDomainId: "policy-domain:a",
    issuerId: "peer-a",
    revision: 1,
    predecessorDigest: null,
    subjectPeerIds: ["peer-b"],
    objective: {
      schemaVersion: 1,
      meshId: "mesh-a",
      objectiveId: "objective-a",
      objectiveDocumentId: "objective-document-a",
      minimumObjectiveRevision: 1,
      maximumObjectiveRevision: 2,
    },
    work: {
      schemaVersion: 1,
      workItemIds: [],
      permittedRoleKeys: ["executor"],
      maximumWorkItemRevision: 4,
    },
    permittedCapabilityKeys: ["summarize"],
    permittedActions: [
      {
        schemaVersion: 1,
        namespace: "documents",
        toolId: "writer",
        operation: "create",
      },
    ],
    budget: {
      schemaVersion: 1,
      totalBudgetUnits: 1_000,
      maximumWorkBudgetUnits: 1_000,
      maximumActionBudgetUnits: 25,
      maximumConcurrentWorkReservations: 10,
      maximumConcurrentActionReservations: 20,
      reservationLifetimeMs: 60_000,
    },
    validFrom: "2026-07-29T00:00:00.000Z",
    validUntil: "2026-09-01T00:00:00.000Z",
    roomProvenance: null,
    evidence: {
      schemaVersion: 1,
      redactionPolicyId: "redaction:a",
      retentionClass: "standard",
      requireDurablePreDispatchEvidence: true,
    },
  };
  const mandateDigest = delegationMandateDigestV1(statement);
  return createDelegationMandateV1({
    statement,
    proof: localProof(mandateDigest),
  });
}

function installedAuthority(document = mandate()) {
  const decision = acceptDelegationMandateV1(
    createCollectiveAuthorityStateV1({
      tenantId: "tenant-a",
      policyDomainId: "policy-domain:a",
    }),
    {
      mandate: document,
      verification: verification(document.mandateDigest),
      acceptedAtLogicalMs: 1,
    },
  );
  assert.equal(decision.accepted, true);
  return decision.state;
}

async function signedObjective(
  source,
  sequence,
  id,
  mandateDigest,
  overrides = {},
) {
  const envelope = structuredClone(source);
  envelope.sequence = sequence;
  envelope.messageId = messageId(id);
  if (envelope.payload.type !== "objective.cancel") {
    delete envelope.payload.summary;
    envelope.payload.contentReference = `${DELEGATION_MANDATE_REFERENCE_PREFIX_V1}${mandateDigest}`;
  }
  Object.assign(envelope, overrides);
  return signer.sign({ envelope, privateKey: keyPair.privateKey });
}

test("governed Objective accepts only the exact installed mandate", async () => {
  const document = mandate();
  let authorityState = installedAuthority(document);
  const governed = createGovernedMeshObjectiveInboundProcessorV1({
    processor: meshProcessor,
    authority: { read: () => authorityState },
  });
  const initial = meshRuntime();
  const accepted = await governed.process(initial, {
    envelope: await signedObjective(
      announceFixture,
      6,
      1,
      document.mandateDigest,
    ),
    receivedAt: 1_000,
    verifiedAt,
  });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.mandateDigest, document.mandateDigest);
  assert.equal(
    accepted.state.objectives.objectives["objective-a"].contentReference,
    `${DELEGATION_MANDATE_REFERENCE_PREFIX_V1}${document.mandateDigest}`,
  );

  const revocationStatement = {
    schemaVersion: 1,
    revocationId: "revocation:mesh-a:1",
    tenantId: "tenant-a",
    policyDomainId: "policy-domain:a",
    issuerId: "peer-a",
    mandateId: document.statement.mandateId,
    mandateDigest: document.mandateDigest,
    minimumRevokedRevision: 1,
    generation: 1,
    effectiveAt: "2026-07-30T00:00:02.000Z",
    reasonCode: "operator_revoked",
  };
  const revocationDigest = delegationRevocationDigestV1(revocationStatement);
  const revoked = acceptDelegationRevocationV1(authorityState, {
    revocation: createDelegationRevocationV1({
      statement: revocationStatement,
      proof: localProof(revocationDigest),
    }),
    verification: verification(revocationDigest, "2026-07-30T00:00:02.000Z"),
    acceptedAtLogicalMs: 2,
  });
  assert.equal(revoked.accepted, true);
  authorityState = revoked.state;

  const cancellationSource = structuredClone(cancelFixture);
  cancellationSource.payload.objectiveRevision = 1;
  cancellationSource.payload.objectiveDocumentId = "objective-document-a";
  const cancelled = await governed.process(accepted.state, {
    envelope: await signedObjective(
      cancellationSource,
      7,
      2,
      document.mandateDigest,
      { causationId: messageId(1) },
    ),
    receivedAt: 1_001,
    verifiedAt: "2026-07-30T00:00:03.000Z",
  });
  assert.equal(cancelled.accepted, true, cancelled.code);
  assert.equal(
    cancelled.state.objectives.objectives["objective-a"].status,
    "cancelled",
  );
});

test("governed Objective rejection retains replay state but no domain mutation", async () => {
  const document = mandate();
  const authorityState = installedAuthority(document);
  const governed = createGovernedMeshObjectiveInboundProcessorV1({
    processor: meshProcessor,
    authority: { read: () => authorityState },
  });
  const initial = meshRuntime();
  const unknownDigest = digestCollectiveJsonV1("mandate", {
    schemaVersion: 1,
    unknown: true,
  });
  const rejected = await governed.process(initial, {
    envelope: await signedObjective(announceFixture, 6, 10, unknownDigest),
    receivedAt: 1_000,
    verifiedAt,
  });
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.code, "mandate_not_installed");
  assert.deepEqual(rejected.state.coordination, initial.coordination);
  assert.deepEqual(rejected.state.objectives, initial.objectives);
  assert.equal(rejected.state.inbound.lastLogicalTime, 1_000);

  const widenedEnvelope = await signedObjective(
    announceFixture,
    7,
    11,
    document.mandateDigest,
  );
  const widened = structuredClone(widenedEnvelope);
  widened.payload.permittedCapabilityKeys = ["admin", "summarize"];
  const resigned = await signer.sign({
    envelope: widened,
    privateKey: keyPair.privateKey,
  });
  const capabilityRejected = await governed.process(rejected.state, {
    envelope: resigned,
    receivedAt: 1_001,
    verifiedAt,
  });
  assert.equal(capabilityRejected.accepted, false);
  assert.equal(capabilityRejected.code, "mandate_capability_mismatch");
  assert.deepEqual(capabilityRejected.state.objectives, initial.objectives);
  assert.equal(capabilityRejected.state.inbound.lastLogicalTime, 1_001);
});

test("Work Contract binds current objective, work, assignment and fence", () => {
  const document = mandate();
  const authorityState = installedAuthority(document);
  const objective = {
    objectiveId: "objective-a",
    objectiveDocumentId: "objective-document-a",
    objectiveRevision: 1,
    issuerPeerId: "peer-a",
    issuerKeyId: "key-a",
    contentReference: `${DELEGATION_MANDATE_REFERENCE_PREFIX_V1}${document.mandateDigest}`,
    successCriteria: ["A result is produced"],
    permittedCapabilityKeys: ["summarize"],
    maximumWorkItems: 10,
    maximumConcurrentAssignments: 2,
    maximumBudgetUnits: 1_000,
    bidWindowMs: 100,
    acceptanceWindowMs: 100,
    maximumLeaseDurationMs: 2_000,
    recoveryGraceMs: 100,
    maximumLeaseRenewals: 1,
    recoveryWitnessPeerIds: ["peer-c"],
    recoveryWitnessThreshold: 1,
    validFrom: "2026-07-30T00:00:00.000Z",
    validUntil: "2026-08-29T00:00:00.000Z",
    validityVerifiedAt: verifiedAt,
    acceptedMessageId: "message:objective",
    acceptedAt: 100,
    expiresAt: 10_000,
    workItemCount: 1,
    reservedBudgetUnits: 100,
    committedBudgetUnits: 0,
    status: "active",
  };
  const workItem = {
    objectiveId: "objective-a",
    objectiveDocumentId: "objective-document-a",
    objectiveRevision: 1,
    objectivePolicy: {
      objectiveId: "objective-a",
      objectiveDocumentId: "objective-document-a",
      objectiveRevision: 1,
      acceptedMessageId: "message:objective",
      acceptedAt: 100,
      expiresAt: 10_000,
      permittedCapabilityKeys: ["summarize"],
      maximumBudgetUnits: 1_000,
      acceptanceWindowMs: 100,
      maximumLeaseDurationMs: 2_000,
      recoveryGraceMs: 100,
      maximumLeaseRenewals: 1,
      recoveryWitnessPeerIds: ["peer-c"],
      recoveryWitnessThreshold: 1,
      validUntil: "2026-08-29T00:00:00.000Z",
    },
    workItemId: "work:item-a",
    workItemRevision: 1,
    ownerPeerId: "peer-a",
    ownerEpoch: 1,
    requiredCapabilityKeys: ["summarize"],
    matchingAttributes: {},
    completionCriteria: ["Produce the bounded summary"],
    inputReference: "urn:input:a",
    budgetReservationUnits: 100,
    workDeadline: "2026-07-30T01:00:00.000Z",
    workDeadlineAt: 8_000,
    offerAttempt: 1,
    status: "ready",
    createdAt: 200,
    updatedAt: 200,
  };
  const execution = {
    executionScopeKey: "scope:a",
    objectiveId: "objective-a",
    objectiveDocumentId: "objective-document-a",
    objectiveRevision: 1,
    workItemId: "work:item-a",
    workItemRevision: 1,
    ownerPeerId: "peer-a",
    ownerEpoch: 1,
    assigneePeerId: "peer-b",
    awardId: "award:a",
    assignmentEpoch: 1,
    assignmentAuthorityId: "assignment:a",
    fencingToken: "fence:a:1",
    acceptanceId: "acceptance:a",
    acceptanceMessageId: "message:acceptance",
    workDeadline: "2026-07-30T01:00:00.000Z",
    workDeadlineAt: 8_000,
    leaseExpiresAt: "2026-07-30T00:30:00.000Z",
    leaseExpiresAtLogical: 5_000,
    phase: "active",
  };
  const fenceHead = {
    assignmentFenceKey: "fence-key:a",
    objectiveId: "objective-a",
    objectiveRevision: 1,
    workItemId: "work:item-a",
    workItemRevision: 1,
    ownerPeerId: "peer-a",
    ownerEpoch: 1,
    assignmentEpoch: 1,
    assignmentAuthorityId: "assignment:a",
    fencingToken: "fence:a:1",
    assigneePeerId: "peer-b",
    activeAwardId: "award:a",
    phase: "active",
  };
  const contract = createWorkContractFromMeshV1({
    workContractId: "work-contract:mesh-a",
    identity: identity(),
    objective,
    workItem,
    execution,
    fenceHead,
    mandate: document,
    roleKey: "executor",
    trustPolicyId: "trust-policy:a",
    inferencePolicyId: "inference-policy:a",
    maximumActionBudgetUnits: 25,
    createdAtLogicalMs: 300,
  });
  const opened = registerWorkContractV1(
    createCollectiveExecutionStateV1({
      tenantId: "tenant-a",
      policyDomainId: "policy-domain:a",
    }),
    {
      mandate: document,
      workContract: contract,
      authorizedAt: verifiedAt,
      acceptedAtLogicalMs: 300,
    },
  );
  assert.equal(opened.accepted, true);
  assert.deepEqual(
    evaluateWorkContractCurrentnessV1({
      workContract: contract,
      authorityState,
      objective,
      workItem,
      execution,
      fenceHead,
      wallTime: verifiedAt,
      logicalTimeMs: 400,
    }),
    { current: true, code: "current" },
  );
  const stale = evaluateWorkContractCurrentnessV1({
    workContract: contract,
    authorityState,
    objective,
    workItem,
    execution,
    fenceHead: { ...fenceHead, fencingToken: "fence:a:2" },
    wallTime: verifiedAt,
    logicalTimeMs: 400,
  });
  assert.deepEqual(stale, {
    current: false,
    code: "assignment_not_current",
    terminalStatus: "released",
  });
});
