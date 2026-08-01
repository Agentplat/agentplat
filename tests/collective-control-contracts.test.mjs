import assert from "node:assert/strict";
import test from "node:test";

import {
  CollectiveControlValidationError,
  acceptDelegationMandateV1,
  acceptDelegationRevocationV1,
  authorizeDelegationMandateAtV1,
  budgetReservationDigestV1,
  canonicalizeCollectiveJsonV1,
  collectiveDecisionRecordDigestV1,
  createCollectiveAuthorityStateV1,
  createCollectiveExecutionStateV1,
  createDelegationMandateV1,
  createDelegationRevocationV1,
  delegationMandateDigestV1,
  delegationRevocationDigestV1,
  digestCollectiveJsonV1,
  governedActionPermitDigestV1,
  issueGovernedActionPermitV1,
  registerWorkContractV1,
  transitionGovernedActionPermitV1,
  validateBudgetReservationV1,
  validateCollectiveAuthorityStateV1,
  validateCollectiveDecisionRecordV1,
  validateCollectiveExecutionStateV1,
  validateDelegationMandateStatementV1,
  validateDelegationMandateV1,
  validateGovernedActionPermitV1,
  validateWorkContractV1,
  workContractDigestV1,
} from "@agentplat/collective-control";
import {
  MemoryCollectiveAuthorityRepositoryV1,
  MemoryCollectiveExecutionRepositoryV1,
} from "@agentplat/collective-control/memory";

const digest = (label) =>
  digestCollectiveJsonV1("state", { label, schemaVersion: 1 });

function statement(overrides = {}) {
  return {
    schemaVersion: 1,
    mandateId: "mandate:alpha",
    tenantId: "tenant:alpha",
    policyDomainId: "policy-domain:alpha",
    issuerId: "issuer:alpha",
    revision: 1,
    predecessorDigest: null,
    subjectPeerIds: ["peer:alpha", "peer:beta"],
    objective: {
      schemaVersion: 1,
      meshId: "mesh:alpha",
      objectiveId: "objective:alpha",
      objectiveDocumentId: "objective-document:alpha",
      minimumObjectiveRevision: 1,
      maximumObjectiveRevision: 4,
    },
    work: {
      schemaVersion: 1,
      workItemIds: [],
      permittedRoleKeys: ["executor", "reviewer"],
      maximumWorkItemRevision: 8,
    },
    permittedCapabilityKeys: ["capability.execute", "capability.review"],
    permittedActions: [
      {
        schemaVersion: 1,
        namespace: "documents",
        toolId: "document-writer",
        operation: "create",
      },
    ],
    budget: {
      schemaVersion: 1,
      totalBudgetUnits: 1_000,
      maximumWorkBudgetUnits: 200,
      maximumActionBudgetUnits: 25,
      maximumConcurrentWorkReservations: 16,
      maximumConcurrentActionReservations: 32,
      reservationLifetimeMs: 60_000,
    },
    validFrom: "2026-08-01T00:00:00.000Z",
    validUntil: "2026-08-02T00:00:00.000Z",
    roomProvenance: null,
    evidence: {
      schemaVersion: 1,
      redactionPolicyId: "redaction:alpha",
      retentionClass: "standard",
      requireDurablePreDispatchEvidence: true,
    },
    ...overrides,
  };
}

function localProof(signedDigest, issuerId = "issuer:alpha") {
  return {
    schemaVersion: 1,
    kind: "local_attestation",
    issuerId,
    attestorId: "attestor:local",
    attestationId: `attestation:${signedDigest.slice(-12)}`,
    signedDigest,
  };
}

function verification(signedDigest, issuerId = "issuer:alpha") {
  return {
    schemaVersion: 1,
    verifierId: "verifier:local",
    verifierVersion: 1,
    issuerId,
    signedDigest,
    verifiedAt: "2026-08-01T00:00:01.000Z",
    status: "verified",
  };
}

function mandate(overrides = {}) {
  const source = statement(overrides);
  const mandateDigest = delegationMandateDigestV1(source);
  return createDelegationMandateV1({
    statement: source,
    proof: localProof(mandateDigest, source.issuerId),
  });
}

function governedExecutionFixture() {
  const authority = mandate();
  const workBody = {
    schemaVersion: 1,
    workContractId: "work-contract:execution",
    generation: 1,
    tenantId: "tenant:alpha",
    policyDomainId: "policy-domain:alpha",
    mandate: {
      schemaVersion: 1,
      mandateId: authority.statement.mandateId,
      mandateRevision: authority.statement.revision,
      mandateDigest: authority.mandateDigest,
    },
    objective: {
      schemaVersion: 1,
      meshId: "mesh:alpha",
      objectiveId: "objective:alpha",
      objectiveDocumentId: "objective-document:alpha",
      objectiveRevision: 1,
      acceptedMessageId: "message:objective:execution",
      acceptedPolicyDigest: digest("objective-policy:execution"),
    },
    assignment: {
      schemaVersion: 1,
      workItemId: "work:execution",
      workItemRevision: 1,
      ownerPeerId: "peer:alpha",
      assignedPeerId: "peer:beta",
      assignedInstanceId: "instance:beta:execution",
      assignmentAuthorityId: "authority:execution",
      assignmentEpoch: 1,
      authorityGeneration: 1,
      fencingToken: "fence:execution:1",
      leaseExpiresAtLogicalMs: 10_000,
      workDeadline: "2026-08-01T01:00:00.000Z",
    },
    roleKey: "executor",
    requiredCapabilityKeys: ["capability.execute"],
    completionCriteria: ["Produce the bounded result"],
    inputReferenceDigest: digest("work-input:execution"),
    reservedBudgetUnits: 100,
    maximumActionBudgetUnits: 25,
    trustPolicyId: "trust-policy:execution",
    inferencePolicyId: "inference-policy:execution",
    createdAtLogicalMs: 10,
    updatedAtLogicalMs: 10,
    status: "active",
    terminalReasonCode: null,
  };
  const workContract = {
    ...workBody,
    workContractDigest: workContractDigestV1(workBody),
  };
  const reservationBody = {
    schemaVersion: 1,
    reservationId: "reservation:execution",
    generation: 1,
    tenantId: "tenant:alpha",
    policyDomainId: "policy-domain:alpha",
    mandateId: authority.statement.mandateId,
    mandateRevision: authority.statement.revision,
    mandateDigest: authority.mandateDigest,
    workContractId: workContract.workContractId,
    permitId: "permit:execution",
    idempotencyKey: "idempotency:execution",
    units: 10,
    reservedAtLogicalMs: 20,
    expiresAtLogicalMs: 1_020,
    status: "reserved",
    outcomeId: null,
  };
  const budgetReservation = {
    ...reservationBody,
    reservationDigest: budgetReservationDigestV1(reservationBody),
  };
  const permitBody = {
    schemaVersion: 1,
    permitId: "permit:execution",
    generation: 1,
    gatewayId: "gateway:execution",
    tenantId: "tenant:alpha",
    policyDomainId: "policy-domain:alpha",
    mandateId: authority.statement.mandateId,
    mandateRevision: authority.statement.revision,
    mandateDigest: authority.mandateDigest,
    workContractId: workContract.workContractId,
    workContractDigest: workContract.workContractDigest,
    actionGrantId: "grant:execution",
    actionGrantDigest: digest("grant:execution"),
    actionScopeDigest: digest("scope:execution"),
    assignmentAuthorityId: workContract.assignment.assignmentAuthorityId,
    assignedPeerId: workContract.assignment.assignedPeerId,
    assignedInstanceId: workContract.assignment.assignedInstanceId,
    assignmentEpoch: workContract.assignment.assignmentEpoch,
    authorityGeneration: workContract.assignment.authorityGeneration,
    fencingToken: workContract.assignment.fencingToken,
    namespace: "documents",
    toolId: "document-writer",
    operation: "create",
    actionBindingId: "binding:execution",
    actionBindingVersion: 1,
    handlerDigest: digest("handler:execution"),
    inputDigest: digest("input:execution"),
    assessmentDigest: digest("assessment:execution"),
    trustDecisionDigest: digest("trust:execution"),
    budgetReservationId: budgetReservation.reservationId,
    budgetUnits: budgetReservation.units,
    idempotencyKey: budgetReservation.idempotencyKey,
    issuedAtLogicalMs: 20,
    expiresAtLogicalMs: 1_020,
    status: "issued",
    outcomeId: null,
  };
  const actionPermit = {
    ...permitBody,
    permitDigest: governedActionPermitDigestV1(permitBody),
  };
  return { authority, workContract, budgetReservation, actionPermit };
}

test("collective JSON is canonical, bounded and domain separated", () => {
  assert.equal(
    canonicalizeCollectiveJsonV1({ b: 2, a: [true, null] }),
    '{"a":[true,null],"b":2}',
  );
  assert.notEqual(
    digestCollectiveJsonV1("mandate", { value: 1 }),
    digestCollectiveJsonV1("revocation", { value: 1 }),
  );
  assert.throws(
    () => canonicalizeCollectiveJsonV1({ value: Number.POSITIVE_INFINITY }),
    CollectiveControlValidationError,
  );
  const sparse = [];
  sparse.length = 1;
  assert.throws(() => canonicalizeCollectiveJsonV1(sparse), /sparse/);
});

test("mandates bind a strict statement to one proof and digest", () => {
  const created = mandate();
  assert.equal(created.proof.signedDigest, created.mandateDigest);
  assert.deepEqual(validateDelegationMandateV1(created), created);
  assert.ok(Object.isFrozen(created));
  assert.ok(Object.isFrozen(created.statement.subjectPeerIds));

  const altered = structuredClone(created);
  altered.statement.budget.totalBudgetUnits += 1;
  assert.throws(() => validateDelegationMandateV1(altered), /binding/);

  const extra = statement();
  extra.unreviewedAuthority = true;
  assert.throws(
    () => validateDelegationMandateStatementV1(extra),
    /invalid shape/,
  );

  assert.throws(
    () => mandate({ subjectPeerIds: ["peer:beta", "peer:alpha"] }),
    /sorted and unique/,
  );
  assert.throws(
    () => mandate({ validFrom: "2026-02-30T00:00:00.000Z" }),
    /RFC 3339/,
  );
  assert.throws(
    () =>
      mandate({
        budget: {
          ...statement().budget,
          maximumActionBudgetUnits: 201,
        },
      }),
    /inconsistent/,
  );
});

test("authority state enforces linear revision and monotonic replay-safe time", () => {
  const first = mandate();
  const initial = createCollectiveAuthorityStateV1({
    tenantId: "tenant:alpha",
    policyDomainId: "policy-domain:alpha",
  });
  const accepted = acceptDelegationMandateV1(initial, {
    mandate: first,
    verification: verification(first.mandateDigest),
    acceptedAtLogicalMs: 10,
  });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.duplicate, false);

  const duplicate = acceptDelegationMandateV1(accepted.state, {
    mandate: first,
    verification: verification(first.mandateDigest),
    acceptedAtLogicalMs: 11,
  });
  assert.equal(duplicate.accepted, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.state.highWaterLogicalMs, 11);

  const revision = mandate({
    revision: 2,
    predecessorDigest: first.mandateDigest,
    objective: {
      ...statement().objective,
      maximumObjectiveRevision: 5,
    },
  });
  const revised = acceptDelegationMandateV1(duplicate.state, {
    mandate: revision,
    verification: verification(revision.mandateDigest),
    acceptedAtLogicalMs: 12,
  });
  assert.equal(revised.accepted, true);

  const fork = mandate({
    revision: 2,
    predecessorDigest: first.mandateDigest,
    permittedCapabilityKeys: [
      "capability.audit",
      "capability.execute",
      "capability.review",
    ],
  });
  const conflicted = acceptDelegationMandateV1(revised.state, {
    mandate: fork,
    verification: verification(fork.mandateDigest),
    acceptedAtLogicalMs: 13,
  });
  assert.deepEqual(
    { accepted: conflicted.accepted, code: conflicted.code },
    { accepted: false, code: "mandate_revision_conflict" },
  );
  assert.deepEqual(conflicted.state, revised.state);

  const regressed = acceptDelegationMandateV1(revised.state, {
    mandate: revision,
    verification: verification(revision.mandateDigest),
    acceptedAtLogicalMs: 9,
  });
  assert.equal(regressed.accepted, false);
  assert.equal(regressed.code, "logical_time_regressed");
  assert.deepEqual(
    validateCollectiveAuthorityStateV1(revised.state),
    revised.state,
  );
});

test("revocation high-water blocks effects but preserves prior evidence", () => {
  const repository = new MemoryCollectiveAuthorityRepositoryV1({
    tenantId: "tenant:alpha",
    policyDomainId: "policy-domain:alpha",
  });
  const first = mandate();
  assert.equal(
    repository.acceptMandate({
      mandate: first,
      verification: verification(first.mandateDigest),
      acceptedAtLogicalMs: 1,
    }).accepted,
    true,
  );
  assert.equal(
    repository.authorize({
      mandateId: first.statement.mandateId,
      mandateDigest: first.mandateDigest,
      at: "2026-08-01T00:00:02.000Z",
    }).authorized,
    true,
  );

  const revocationStatement = {
    schemaVersion: 1,
    revocationId: "revocation:alpha:1",
    tenantId: "tenant:alpha",
    policyDomainId: "policy-domain:alpha",
    issuerId: "issuer:alpha",
    mandateId: first.statement.mandateId,
    mandateDigest: first.mandateDigest,
    minimumRevokedRevision: 1,
    generation: 1,
    effectiveAt: "2026-08-01T00:00:10.000Z",
    reasonCode: "operator_revoked",
  };
  const revocationDigest = delegationRevocationDigestV1(revocationStatement);
  const revocation = createDelegationRevocationV1({
    statement: revocationStatement,
    proof: localProof(revocationDigest),
  });
  const accepted = repository.acceptRevocation({
    revocation,
    verification: {
      ...verification(revocationDigest),
      verifiedAt: "2026-08-01T00:00:05.000Z",
    },
    acceptedAtLogicalMs: 2,
  });
  assert.equal(accepted.accepted, true);
  assert.equal(
    authorizeDelegationMandateAtV1(accepted.state, {
      mandateId: first.statement.mandateId,
      mandateDigest: first.mandateDigest,
      at: "2026-08-01T00:00:09.999Z",
    }).authorized,
    true,
  );
  assert.deepEqual(
    authorizeDelegationMandateAtV1(accepted.state, {
      mandateId: first.statement.mandateId,
      mandateDigest: first.mandateDigest,
      at: "2026-08-01T00:00:10.000Z",
    }),
    { authorized: false, code: "mandate_revoked" },
  );
  assert.equal(accepted.state.mandates.length, 1);

  const laterRevision = mandate({
    revision: 2,
    predecessorDigest: first.mandateDigest,
  });
  const deniedRevision = repository.acceptMandate({
    mandate: laterRevision,
    verification: verification(laterRevision.mandateDigest),
    acceptedAtLogicalMs: 3,
  });
  assert.equal(deniedRevision.accepted, false);
  assert.equal(deniedRevision.code, "mandate_revoked");
});

test("work, reservation, permit and evidence digests reject substitution", () => {
  const first = mandate();
  const workBody = {
    schemaVersion: 1,
    workContractId: "work-contract:alpha",
    generation: 1,
    tenantId: "tenant:alpha",
    policyDomainId: "policy-domain:alpha",
    mandate: {
      schemaVersion: 1,
      mandateId: first.statement.mandateId,
      mandateRevision: 1,
      mandateDigest: first.mandateDigest,
    },
    objective: {
      schemaVersion: 1,
      meshId: "mesh:alpha",
      objectiveId: "objective:alpha",
      objectiveDocumentId: "objective-document:alpha",
      objectiveRevision: 1,
      acceptedMessageId: "message:objective:alpha",
      acceptedPolicyDigest: digest("objective-policy"),
    },
    assignment: {
      schemaVersion: 1,
      workItemId: "work:alpha",
      workItemRevision: 1,
      ownerPeerId: "peer:alpha",
      assignedPeerId: "peer:beta",
      assignedInstanceId: "instance:beta:1",
      assignmentAuthorityId: "authority:alpha",
      assignmentEpoch: 1,
      authorityGeneration: 1,
      fencingToken: "fence:alpha:1",
      leaseExpiresAtLogicalMs: 10_000,
      workDeadline: "2026-08-01T01:00:00.000Z",
    },
    roleKey: "executor",
    requiredCapabilityKeys: ["capability.execute"],
    completionCriteria: ["Create the bounded result"],
    inputReferenceDigest: digest("work-input"),
    reservedBudgetUnits: 100,
    maximumActionBudgetUnits: 25,
    trustPolicyId: "trust-policy:alpha",
    inferencePolicyId: "inference-policy:alpha",
    createdAtLogicalMs: 10,
    updatedAtLogicalMs: 10,
    status: "active",
    terminalReasonCode: null,
  };
  const work = {
    ...workBody,
    workContractDigest: workContractDigestV1(workBody),
  };
  assert.ok(validateWorkContractV1(work));

  const reservationBody = {
    schemaVersion: 1,
    reservationId: "reservation:alpha",
    generation: 1,
    tenantId: "tenant:alpha",
    policyDomainId: "policy-domain:alpha",
    mandateId: first.statement.mandateId,
    mandateRevision: 1,
    mandateDigest: first.mandateDigest,
    workContractId: work.workContractId,
    permitId: "permit:alpha",
    idempotencyKey: "idempotency:alpha",
    units: 10,
    reservedAtLogicalMs: 20,
    expiresAtLogicalMs: 1_020,
    status: "reserved",
    outcomeId: null,
  };
  const reservation = {
    ...reservationBody,
    reservationDigest: budgetReservationDigestV1(reservationBody),
  };
  assert.ok(validateBudgetReservationV1(reservation));

  const permitBody = {
    schemaVersion: 1,
    permitId: "permit:alpha",
    generation: 1,
    gatewayId: "gateway:alpha",
    tenantId: "tenant:alpha",
    policyDomainId: "policy-domain:alpha",
    mandateId: first.statement.mandateId,
    mandateRevision: 1,
    mandateDigest: first.mandateDigest,
    workContractId: work.workContractId,
    workContractDigest: work.workContractDigest,
    actionGrantId: "grant:alpha",
    actionGrantDigest: digest("grant"),
    actionScopeDigest: digest("scope"),
    assignmentAuthorityId: "authority:alpha",
    assignedPeerId: "peer:beta",
    assignedInstanceId: "instance:beta:1",
    assignmentEpoch: 1,
    authorityGeneration: 1,
    fencingToken: "fence:alpha:1",
    namespace: "documents",
    toolId: "document-writer",
    operation: "create",
    actionBindingId: "binding:alpha",
    actionBindingVersion: 1,
    handlerDigest: digest("handler"),
    inputDigest: digest("input"),
    assessmentDigest: digest("assessment"),
    trustDecisionDigest: digest("trust"),
    budgetReservationId: reservation.reservationId,
    budgetUnits: 10,
    idempotencyKey: "idempotency:alpha",
    issuedAtLogicalMs: 20,
    expiresAtLogicalMs: 1_020,
    status: "issued",
    outcomeId: null,
  };
  const permit = {
    ...permitBody,
    permitDigest: governedActionPermitDigestV1(permitBody),
  };
  assert.ok(validateGovernedActionPermitV1(permit));
  assert.throws(
    () =>
      validateGovernedActionPermitV1({
        ...permit,
        inputDigest: digest("other"),
      }),
    /permit digest/,
  );

  const recordBody = {
    schemaVersion: 1,
    recordId: "record:alpha",
    tenantId: "tenant:alpha",
    policyDomainId: "policy-domain:alpha",
    kind: "permit.issue",
    accepted: true,
    reasonCode: "permit_issued",
    logicalTimeMs: 20,
    mandateId: first.statement.mandateId,
    mandateDigest: first.mandateDigest,
    workContractId: work.workContractId,
    workContractDigest: work.workContractDigest,
    permitId: permit.permitId,
    permitDigest: permit.permitDigest,
    assignmentAuthorityId: "authority:alpha",
    assignmentEpoch: 1,
    fencingToken: "fence:alpha:1",
    budgetDeltaKind: "reserve",
    budgetDeltaUnits: 10,
    inputDigest: permit.inputDigest,
    actionDigest: permit.actionGrantDigest,
    assessmentDigest: permit.assessmentDigest,
    trustDecisionDigest: permit.trustDecisionDigest,
    previousRecordDigest: null,
  };
  const record = {
    ...recordBody,
    recordDigest: collectiveDecisionRecordDigestV1(recordBody),
  };
  assert.ok(validateCollectiveDecisionRecordV1(record));
});

test("execution state narrows work, accounts budget and fences permit lifecycle", () => {
  const { authority, workContract, budgetReservation, actionPermit } =
    governedExecutionFixture();
  const repository = new MemoryCollectiveExecutionRepositoryV1({
    tenantId: "tenant:alpha",
    policyDomainId: "policy-domain:alpha",
  });
  const opened = repository.registerWork({
    mandate: authority,
    workContract,
    authorizedAt: "2026-08-01T00:00:02.000Z",
    acceptedAtLogicalMs: 10,
  });
  assert.equal(opened.accepted, true);

  const issued = repository.issuePermit({
    mandate: authority,
    budgetReservation,
    actionPermit,
    authorizedAt: "2026-08-01T00:00:03.000Z",
    acceptedAtLogicalMs: 20,
  });
  assert.equal(issued.accepted, true);
  assert.equal(issued.state.budgetReservations[0].status, "reserved");

  const duplicate = issueGovernedActionPermitV1(issued.state, {
    mandate: authority,
    budgetReservation,
    actionPermit,
    authorizedAt: "2026-08-01T00:00:03.000Z",
    acceptedAtLogicalMs: 20,
  });
  assert.deepEqual(
    { accepted: duplicate.accepted, code: duplicate.code },
    { accepted: true, code: "permit_idempotent" },
  );

  let current = issued;
  for (const [nextStatus, logicalTimeMs, outcomeId] of [
    ["reserved", 21, null],
    ["dispatching", 22, null],
    ["indeterminate", 23, "outcome:unknown"],
  ]) {
    current = transitionGovernedActionPermitV1(current.state, {
      permitId: current.actionPermit.permitId,
      expectedGeneration: current.actionPermit.generation,
      expectedDigest: current.actionPermit.permitDigest,
      nextStatus,
      outcomeId,
      logicalTimeMs,
    });
    assert.equal(current.accepted, true);
  }
  assert.equal(current.actionPermit.status, "indeterminate");
  assert.equal(current.budgetReservation.status, "indeterminate");

  const terminalReplay = transitionGovernedActionPermitV1(current.state, {
    permitId: current.actionPermit.permitId,
    expectedGeneration: current.actionPermit.generation,
    expectedDigest: current.actionPermit.permitDigest,
    nextStatus: "dispatched",
    outcomeId: "outcome:late",
    logicalTimeMs: 24,
  });
  assert.equal(terminalReplay.accepted, false);
  assert.equal(terminalReplay.code, "permit_transition_invalid");
  assert.deepEqual(
    validateCollectiveExecutionStateV1(current.state),
    current.state,
  );
});

test("execution state rejects scope widening, idempotency substitution and rollback", () => {
  const { authority, workContract, budgetReservation, actionPermit } =
    governedExecutionFixture();
  const initial = createCollectiveExecutionStateV1({
    tenantId: "tenant:alpha",
    policyDomainId: "policy-domain:alpha",
  });
  const widenedBody = {
    ...workContract,
    workContractId: "work-contract:widened",
    requiredCapabilityKeys: ["capability.admin", "capability.execute"],
  };
  delete widenedBody.workContractDigest;
  const widened = {
    ...widenedBody,
    workContractDigest: workContractDigestV1(widenedBody),
  };
  const denied = registerWorkContractV1(initial, {
    mandate: authority,
    workContract: widened,
    authorizedAt: "2026-08-01T00:00:02.000Z",
    acceptedAtLogicalMs: 10,
  });
  assert.equal(denied.accepted, false);
  assert.equal(denied.code, "work_scope_widened");

  const opened = registerWorkContractV1(initial, {
    mandate: authority,
    workContract,
    authorizedAt: "2026-08-01T00:00:02.000Z",
    acceptedAtLogicalMs: 10,
  });
  const issued = issueGovernedActionPermitV1(opened.state, {
    mandate: authority,
    budgetReservation,
    actionPermit,
    authorizedAt: "2026-08-01T00:00:03.000Z",
    acceptedAtLogicalMs: 20,
  });
  const alteredReservationBody = {
    ...budgetReservation,
    reservationId: "reservation:substitution",
    permitId: "permit:substitution",
  };
  delete alteredReservationBody.reservationDigest;
  const alteredReservation = {
    ...alteredReservationBody,
    reservationDigest: budgetReservationDigestV1(alteredReservationBody),
  };
  const alteredPermitBody = {
    ...actionPermit,
    permitId: "permit:substitution",
    budgetReservationId: "reservation:substitution",
    actionGrantDigest: digest("grant:substitution"),
  };
  delete alteredPermitBody.permitDigest;
  const alteredPermit = {
    ...alteredPermitBody,
    permitDigest: governedActionPermitDigestV1(alteredPermitBody),
  };
  const conflict = issueGovernedActionPermitV1(issued.state, {
    mandate: authority,
    budgetReservation: alteredReservation,
    actionPermit: alteredPermit,
    authorizedAt: "2026-08-01T00:00:03.000Z",
    acceptedAtLogicalMs: 20,
  });
  assert.equal(conflict.accepted, false);
  assert.equal(conflict.code, "reservation_conflict");

  const rolledBack = structuredClone(issued.state);
  rolledBack.highWaterLogicalMs = 9;
  assert.throws(
    () => validateCollectiveExecutionStateV1(rolledBack),
    /logical time|digest/,
  );
});
