import assert from "node:assert/strict";
import test from "node:test";

import {
  acceptDelegationMandateV1,
  budgetReservationDigestV1,
  createCollectiveAuthorityStateV1,
  createDelegationMandateV1,
  delegationMandateDigestV1,
  digestCollectiveJsonV1,
  governedActionPermitDigestV1,
  workContractDigestV1,
} from "@agentplat/collective-control";
import {
  createLocalCollectiveActionGuardV1,
  createGovernedActionGatewayFactoryV1,
  dispatchGovernedActionV1,
  LocalPolicyAdapterV1,
  reconcileGovernedActionV1,
} from "@agentplat/collective-control/actions";
import {
  MemoryCollectiveEvidenceSinkV1,
  MemoryCollectiveExecutionRepositoryV1,
} from "@agentplat/collective-control/memory";
import {
  LocalGrantLedger,
  actionDigest,
  actionInputDigest,
  controlDigest,
  issueActionGrantV1,
  scopeDigest,
} from "@agentplat/inference-control/tools";

const digest = (label) =>
  digestCollectiveJsonV1("state", { label, schemaVersion: 1 });

function mandate() {
  const statement = {
    schemaVersion: 1,
    mandateId: "mandate:actions",
    tenantId: "tenant:actions",
    policyDomainId: "policy-domain:actions",
    issuerId: "issuer:actions",
    revision: 1,
    predecessorDigest: null,
    subjectPeerIds: ["peer:worker"],
    objective: {
      schemaVersion: 1,
      meshId: "mesh:actions",
      objectiveId: "objective:actions",
      objectiveDocumentId: "objective-document:actions",
      minimumObjectiveRevision: 1,
      maximumObjectiveRevision: 1,
    },
    work: {
      schemaVersion: 1,
      workItemIds: ["work:actions"],
      permittedRoleKeys: ["executor"],
      maximumWorkItemRevision: 1,
    },
    permittedCapabilityKeys: ["documents.write"],
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
      totalBudgetUnits: 100,
      maximumWorkBudgetUnits: 100,
      maximumActionBudgetUnits: 10,
      maximumConcurrentWorkReservations: 1,
      maximumConcurrentActionReservations: 2,
      reservationLifetimeMs: 1_000,
    },
    validFrom: "2026-08-01T00:00:00.000Z",
    validUntil: "2026-08-02T00:00:00.000Z",
    roomProvenance: null,
    evidence: {
      schemaVersion: 1,
      redactionPolicyId: "redaction:actions",
      retentionClass: "standard",
      requireDurablePreDispatchEvidence: true,
    },
  };
  const mandateDigest = delegationMandateDigestV1(statement);
  return createDelegationMandateV1({
    statement,
    proof: {
      schemaVersion: 1,
      kind: "local_attestation",
      issuerId: statement.issuerId,
      attestorId: "attestor:actions",
      attestationId: "attestation:actions",
      signedDigest: mandateDigest,
    },
  });
}

function binding() {
  return {
    schemaVersion: 1,
    actionBindingId: "binding:actions",
    actionBindingVersion: 1,
    namespace: "documents",
    toolId: "writer",
    operation: "create",
    dispatcherId: "dispatcher:actions",
    dispatcherVersion: 1,
    contextResolverId: "context:actions",
    contextResolverVersion: 1,
    fencingMode: "downstream_atomic",
    handlerDigest: controlDigest("handler-binding", {
      schemaVersion: 1,
      handler: "actions",
    }),
  };
}

function coordinatedScope() {
  return {
    schemaVersion: 1,
    kind: "coordinated",
    tenantId: "tenant:actions",
    runId: "run:actions",
    agentId: "agent:worker",
    policyId: "policy:actions",
    policyVersion: 1,
    meshId: "mesh:actions",
    objectiveId: "objective:actions",
    objectiveRevision: 1,
    workItemId: "work:actions",
    workItemRevision: 1,
    peerId: "peer:worker",
    instanceId: "instance:worker:1",
    assignmentAuthorityId: "assignment:actions",
    assignmentEpoch: 1,
    fencingToken: "fence:actions:1",
    leaseExpiresAtLogicalMs: 1_000,
    authorityGeneration: 1,
    objectiveTerminal: false,
    workTerminal: false,
  };
}

function actionGrant(actionBinding, actionInput) {
  const scope = coordinatedScope();
  const draft = {
    schemaVersion: 1,
    grantId: "grant:actions",
    stateGeneration: 1,
    scope,
    scopeDigest: scopeDigest(scope),
    namespace: actionBinding.namespace,
    toolId: actionBinding.toolId,
    operation: actionBinding.operation,
    actionBindingId: actionBinding.actionBindingId,
    actionBindingVersion: actionBinding.actionBindingVersion,
    handlerDigest: actionBinding.handlerDigest,
    inputDigest: actionInputDigest(actionInput),
    actionDigest: digest("pending-action"),
    assessmentRequestId: "assessment-request:actions",
    assessmentId: "assessment:actions",
    assessmentTargetDigest: digest("assessment-target"),
    idempotencyKey: "idempotency:actions",
    issuedAtLogicalMs: 20,
    expiresAtLogicalMs: 1_000,
    singleUse: true,
    status: "issued",
    reservation: null,
  };
  return Object.freeze({
    ...draft,
    actionDigest: actionDigest(draft, actionBinding),
  });
}

function workContract(document) {
  const body = {
    schemaVersion: 1,
    workContractId: "work-contract:actions",
    generation: 1,
    tenantId: "tenant:actions",
    policyDomainId: "policy-domain:actions",
    mandate: {
      schemaVersion: 1,
      mandateId: document.statement.mandateId,
      mandateRevision: document.statement.revision,
      mandateDigest: document.mandateDigest,
    },
    objective: {
      schemaVersion: 1,
      meshId: "mesh:actions",
      objectiveId: "objective:actions",
      objectiveDocumentId: "objective-document:actions",
      objectiveRevision: 1,
      acceptedMessageId: "message:objective:actions",
      acceptedPolicyDigest: digest("objective-policy:actions"),
    },
    assignment: {
      schemaVersion: 1,
      workItemId: "work:actions",
      workItemRevision: 1,
      ownerPeerId: "peer:owner",
      assignedPeerId: "peer:worker",
      assignedInstanceId: "instance:worker:1",
      assignmentAuthorityId: "assignment:actions",
      assignmentEpoch: 1,
      authorityGeneration: 1,
      fencingToken: "fence:actions:1",
      leaseExpiresAtLogicalMs: 1_000,
      workDeadline: "2026-08-01T01:00:00.000Z",
    },
    roleKey: "executor",
    requiredCapabilityKeys: ["documents.write"],
    completionCriteria: ["Create one bounded document"],
    inputReferenceDigest: digest("work-input:actions"),
    reservedBudgetUnits: 100,
    maximumActionBudgetUnits: 10,
    trustPolicyId: "trust-policy:actions",
    inferencePolicyId: "inference-policy:actions",
    createdAtLogicalMs: 10,
    updatedAtLogicalMs: 10,
    status: "active",
    terminalReasonCode: null,
  };
  return { ...body, workContractDigest: workContractDigestV1(body) };
}

async function harness({ guard, dispatch }) {
  const document = mandate();
  const actionBinding = binding();
  const actionInput = Object.freeze({ documentId: "document:actions" });
  const grant = actionGrant(actionBinding, actionInput);
  const grantRepository = new LocalGrantLedger("gateway:actions");
  await issueActionGrantV1(grantRepository, grant);
  const work = workContract(document);
  const executionRepository = new MemoryCollectiveExecutionRepositoryV1({
    tenantId: "tenant:actions",
    policyDomainId: "policy-domain:actions",
  });
  const opened = executionRepository.registerWork({
    mandate: document,
    workContract: work,
    authorizedAt: "2026-08-01T00:00:01.000Z",
    acceptedAtLogicalMs: 10,
  });
  assert.equal(opened.accepted, true);
  const reservationBody = {
    schemaVersion: 1,
    reservationId: "reservation:actions",
    generation: 1,
    tenantId: "tenant:actions",
    policyDomainId: "policy-domain:actions",
    mandateId: document.statement.mandateId,
    mandateRevision: document.statement.revision,
    mandateDigest: document.mandateDigest,
    workContractId: work.workContractId,
    permitId: "permit:actions",
    idempotencyKey: "idempotency:actions",
    units: 10,
    reservedAtLogicalMs: 20,
    expiresAtLogicalMs: 1_000,
    status: "reserved",
    outcomeId: null,
  };
  const reservation = {
    ...reservationBody,
    reservationDigest: budgetReservationDigestV1(reservationBody),
  };
  const permitBody = {
    schemaVersion: 1,
    permitId: "permit:actions",
    generation: 1,
    gatewayId: "gateway:actions",
    tenantId: "tenant:actions",
    policyDomainId: "policy-domain:actions",
    mandateId: document.statement.mandateId,
    mandateRevision: document.statement.revision,
    mandateDigest: document.mandateDigest,
    workContractId: work.workContractId,
    workContractDigest: work.workContractDigest,
    actionGrantId: grant.grantId,
    actionGrantDigest: controlDigest("grant", grant),
    actionScopeDigest: grant.scopeDigest,
    assignmentAuthorityId: grant.scope.assignmentAuthorityId,
    assignedPeerId: grant.scope.peerId,
    assignedInstanceId: grant.scope.instanceId,
    assignmentEpoch: grant.scope.assignmentEpoch,
    authorityGeneration: grant.scope.authorityGeneration,
    fencingToken: grant.scope.fencingToken,
    namespace: actionBinding.namespace,
    toolId: actionBinding.toolId,
    operation: actionBinding.operation,
    actionBindingId: actionBinding.actionBindingId,
    actionBindingVersion: actionBinding.actionBindingVersion,
    handlerDigest: actionBinding.handlerDigest,
    inputDigest: grant.inputDigest,
    assessmentDigest: digest("assessment:actions"),
    trustDecisionDigest: digest("trust:actions"),
    budgetReservationId: reservation.reservationId,
    budgetUnits: reservation.units,
    idempotencyKey: reservation.idempotencyKey,
    issuedAtLogicalMs: 20,
    expiresAtLogicalMs: 1_000,
    status: "issued",
    outcomeId: null,
  };
  const permit = {
    ...permitBody,
    permitDigest: governedActionPermitDigestV1(permitBody),
  };
  const issued = executionRepository.issuePermit({
    mandate: document,
    budgetReservation: reservation,
    actionPermit: permit,
    authorizedAt: "2026-08-01T00:00:02.000Z",
    acceptedAtLogicalMs: 20,
  });
  assert.equal(issued.accepted, true);
  const acceptedAuthority = acceptDelegationMandateV1(
    createCollectiveAuthorityStateV1({
      tenantId: "tenant:actions",
      policyDomainId: "policy-domain:actions",
    }),
    {
      mandate: document,
      verification: {
        schemaVersion: 1,
        verifierId: "verifier:actions",
        verifierVersion: 1,
        issuerId: document.statement.issuerId,
        signedDigest: document.mandateDigest,
        verifiedAt: "2026-08-01T00:00:01.000Z",
        status: "verified",
      },
      acceptedAtLogicalMs: 1,
    },
  );
  assert.equal(acceptedAuthority.accepted, true);
  const guardBinding =
    typeof guard === "function"
      ? guard({
          authorityState: acceptedAuthority.state,
          executionRepository,
        })
      : guard;
  const boundGuard = guardBinding.guard ?? guardBinding;
  const gatewayFactory = createGovernedActionGatewayFactoryV1({
    grantRepository,
    binding: actionBinding,
    downstream: {
      dispatcherId: actionBinding.dispatcherId,
      dispatcherVersion: actionBinding.dispatcherVersion,
      fencingMode: "downstream_atomic",
      dispatch,
    },
    contextResolver: {
      contextResolverId: actionBinding.contextResolverId,
      contextResolverVersion: actionBinding.contextResolverVersion,
      async resolve(scope) {
        return {
          tenant: { tenantId: scope.tenantId },
          toolId: actionBinding.toolId,
          runId: scope.runId,
        };
      },
    },
    baseAuthorityResolver: {
      resolverId: "mesh-authority:actions",
      resolverVersion: 1,
      async resolve(scope, actionDigestValue) {
        return {
          schemaVersion: 1,
          status: "current",
          resolverId: "mesh-authority:actions",
          resolverVersion: 1,
          scopeDigest: scopeDigest(scope),
          actionDigest: actionDigestValue,
          scope,
          authorityGeneration: scope.authorityGeneration,
          fencingToken: scope.fencingToken,
        };
      },
    },
    assessmentResolver: {
      assessorId: "assessor:actions",
      assessorVersion: 1,
      async consumeCurrent() {
        return true;
      },
    },
    guard: boundGuard,
  });
  return {
    actionInput,
    executionRepository,
    gatewayFactory,
    grantRepository,
    permit,
    adapter: guardBinding.adapter ?? null,
  };
}

test("governed action composes permit, budget, grant and final checks", async () => {
  const stages = [];
  let dispatches = 0;
  const built = await harness({
    guard: ({ authorityState, executionRepository }) =>
      createLocalCollectiveActionGuardV1({
        authority: { read: () => authorityState },
        execution: executionRepository,
        trustedTime: {
          wallTimeForLogical: () => "2026-08-01T00:00:03.000Z",
        },
        currentness: {
          check(input) {
            stages.push(input.stage);
            return { allowed: true, code: "allowed" };
          },
        },
      }),
    async dispatch({ permit }) {
      dispatches += 1;
      assert.equal(permit.fencingToken, "fence:actions:1");
      return { ok: true, value: { documentId: "document:actions" } };
    },
  });
  const decision = await dispatchGovernedActionV1({
    executionRepository: built.executionRepository,
    gatewayFactory: built.gatewayFactory,
    permitId: built.permit.permitId,
    actionInput: built.actionInput,
    logicalTimeMs: 21,
  });
  assert.equal(decision.dispatched, true);
  assert.equal(decision.permit.status, "dispatched");
  assert.equal(decision.state.budgetReservations[0].status, "committed");
  assert.equal(built.grantRepository.get("grant:actions").status, "dispatched");
  assert.equal(dispatches, 1);
  assert.deepEqual(stages, ["permit", "authority", "authority", "dispatch"]);

  const replay = await dispatchGovernedActionV1({
    executionRepository: built.executionRepository,
    gatewayFactory: built.gatewayFactory,
    permitId: built.permit.permitId,
    actionInput: built.actionInput,
    logicalTimeMs: 22,
  });
  assert.equal(replay.dispatched, false);
  assert.equal(replay.code, "permit_not_issued");
  assert.equal(dispatches, 1);
});

test("final guard denial releases budget without calling downstream", async () => {
  let dispatches = 0;
  const built = await harness({
    guard: {
      async check(input) {
        return input.stage === "dispatch"
          ? { allowed: false, code: "mandate_revoked" }
          : { allowed: true, code: "allowed" };
      },
    },
    async dispatch() {
      dispatches += 1;
      return { ok: true };
    },
  });
  const decision = await dispatchGovernedActionV1({
    executionRepository: built.executionRepository,
    gatewayFactory: built.gatewayFactory,
    permitId: built.permit.permitId,
    actionInput: built.actionInput,
    logicalTimeMs: 21,
  });
  assert.equal(decision.dispatched, false);
  assert.equal(decision.code, "downstream_failed");
  assert.equal(decision.permit.status, "failed");
  assert.equal(decision.state.budgetReservations[0].status, "released");
  assert.equal(dispatches, 0);
});

test("ambiguous downstream retains budget and input substitution reserves nothing", async () => {
  const built = await harness({
    guard: {
      async check() {
        return { allowed: true, code: "allowed" };
      },
    },
    async dispatch() {
      throw new Error("timeout_after_dispatch_start");
    },
  });
  const substitution = await dispatchGovernedActionV1({
    executionRepository: built.executionRepository,
    gatewayFactory: built.gatewayFactory,
    permitId: built.permit.permitId,
    actionInput: { documentId: "document:other" },
    logicalTimeMs: 21,
  });
  assert.equal(substitution.code, "grant_binding_mismatch");
  assert.equal(
    built.executionRepository.snapshot().actionPermits[0].status,
    "issued",
  );

  const ambiguous = await dispatchGovernedActionV1({
    executionRepository: built.executionRepository,
    gatewayFactory: built.gatewayFactory,
    permitId: built.permit.permitId,
    actionInput: built.actionInput,
    logicalTimeMs: 22,
  });
  assert.equal(ambiguous.dispatched, false);
  assert.equal(ambiguous.code, "effect_indeterminate");
  assert.equal(ambiguous.permit.status, "indeterminate");
  assert.equal(ambiguous.state.budgetReservations[0].status, "indeterminate");

  let reconcilerCalls = 0;
  const reconciled = await reconcileGovernedActionV1({
    executionRepository: built.executionRepository,
    gatewayFactory: built.gatewayFactory,
    permitId: built.permit.permitId,
    logicalTimeMs: 1_100,
    effectResolver: {
      async resolve() {
        reconcilerCalls += 1;
        return {
          status: "dispatched",
          outcomeId: "downstream-proof:actions",
        };
      },
    },
  });
  assert.equal(reconciled.reconciled, true);
  assert.equal(reconciled.permit.status, "dispatched");
  assert.equal(reconciled.state.budgetReservations[0].status, "committed");
  assert.equal(built.grantRepository.get("grant:actions").status, "dispatched");
  assert.equal(reconcilerCalls, 1);

  const replay = await reconcileGovernedActionV1({
    executionRepository: built.executionRepository,
    gatewayFactory: built.gatewayFactory,
    permitId: built.permit.permitId,
    logicalTimeMs: 1_101,
    effectResolver: {
      async resolve() {
        throw new Error("must_not_repeat_reconciliation");
      },
    },
  });
  assert.equal(replay.reconciled, true);
  assert.equal(replay.code, "already_reconciled");
});

test("Local Policy Adapter writes durable redacted evidence before dispatch", async () => {
  const evidence = new MemoryCollectiveEvidenceSinkV1(
    "tenant:actions",
    "policy-domain:actions",
  );
  let dispatches = 0;
  const built = await harness({
    guard: ({ authorityState, executionRepository }) => {
      const adapter = new LocalPolicyAdapterV1(
        { read: () => authorityState },
        executionRepository,
        { wallTimeForLogical: () => "2026-08-01T00:00:03.000Z" },
        {
          check: () => ({ allowed: true, code: "allowed" }),
        },
        evidence,
      );
      return { guard: adapter.guard, adapter };
    },
    async dispatch() {
      dispatches += 1;
      return { ok: true, value: { documentId: "document:actions" } };
    },
  });
  const decision = await built.adapter.dispatchGovernedAction({
    gatewayFactory: built.gatewayFactory,
    permitId: built.permit.permitId,
    actionInput: built.actionInput,
    logicalTimeMs: 21,
    decisionId: "decision:actions",
  });
  assert.equal(decision.code, "completed");
  assert.equal(decision.action.dispatched, true);
  assert.equal(dispatches, 1);
  assert.equal(evidence.anchor().recordCount, 2);
  assert.equal(
    JSON.stringify(evidence.snapshot()).includes("document:actions"),
    false,
  );
});

test("required pre-dispatch evidence failure produces zero external effects", async () => {
  let dispatches = 0;
  const unavailableEvidence = {
    anchor() {
      return {
        schemaVersion: 1,
        tenantId: "tenant:actions",
        policyDomainId: "policy-domain:actions",
        recordCount: 0,
        latestRecordDigest: null,
      };
    },
    append() {
      return {
        accepted: false,
        durable: false,
        code: "capacity_exceeded",
        anchor: this.anchor(),
      };
    },
  };
  const built = await harness({
    guard: ({ authorityState, executionRepository }) => {
      const adapter = new LocalPolicyAdapterV1(
        { read: () => authorityState },
        executionRepository,
        { wallTimeForLogical: () => "2026-08-01T00:00:03.000Z" },
        { check: () => ({ allowed: true, code: "allowed" }) },
        unavailableEvidence,
      );
      return { guard: adapter.guard, adapter };
    },
    async dispatch() {
      dispatches += 1;
      return { ok: true };
    },
  });
  const decision = await built.adapter.dispatchGovernedAction({
    gatewayFactory: built.gatewayFactory,
    permitId: built.permit.permitId,
    actionInput: built.actionInput,
    logicalTimeMs: 21,
    decisionId: "decision:evidence-failure",
  });
  assert.equal(decision.code, "predispatch_evidence_unavailable");
  assert.equal(decision.action, null);
  assert.equal(dispatches, 0);
  assert.equal(
    built.executionRepository.snapshot().actionPermits[0].status,
    "issued",
  );
});
