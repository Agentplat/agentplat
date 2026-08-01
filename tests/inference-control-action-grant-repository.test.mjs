import assert from "node:assert/strict";
import test from "node:test";

import {
  ActionGateway,
  LocalGrantLedger,
  actionDigest,
  actionInputDigest,
  controlDigest,
  issueActionGrantV1,
  scopeDigest,
} from "@agentplat/inference-control/tools";

const binding = {
  schemaVersion: 1,
  actionBindingId: "binding:repository",
  actionBindingVersion: 1,
  namespace: "documents",
  toolId: "writer",
  operation: "create",
  dispatcherId: "dispatcher:repository",
  dispatcherVersion: 1,
  contextResolverId: "context:repository",
  contextResolverVersion: 1,
  fencingMode: "local_only",
  handlerDigest: controlDigest("handler-binding", {
    schemaVersion: 1,
    value: "repository",
  }),
};

function grant(grantId = "grant:repository") {
  const scope = {
    schemaVersion: 1,
    kind: "standalone",
    tenantId: "tenant:repository",
    runId: "run:repository",
    agentId: "agent:repository",
    organizationId: null,
    workspaceId: null,
    policyId: "policy:repository",
    policyVersion: 1,
  };
  const draft = {
    schemaVersion: 1,
    grantId,
    stateGeneration: 1,
    scope,
    scopeDigest: scopeDigest(scope),
    namespace: binding.namespace,
    toolId: binding.toolId,
    operation: binding.operation,
    actionBindingId: binding.actionBindingId,
    actionBindingVersion: binding.actionBindingVersion,
    handlerDigest: binding.handlerDigest,
    inputDigest: actionInputDigest({}),
    actionDigest: controlDigest("action", { pending: true }),
    assessmentRequestId: "assessment-request:repository",
    assessmentId: "assessment:repository",
    assessmentTargetDigest: controlDigest("message", { target: grantId }),
    idempotencyKey: `idempotency:${grantId}`,
    issuedAtLogicalMs: 1,
    expiresAtLogicalMs: 1_001,
    singleUse: true,
    status: "issued",
    reservation: null,
  };
  return Object.freeze({
    ...draft,
    actionDigest: actionDigest(draft, binding),
  });
}

class AsyncGrantRepository {
  constructor(gatewayId) {
    this.inner = new LocalGrantLedger(gatewayId);
    this.gatewayId = gatewayId;
  }
  async observeLogicalTime(value) {
    await Promise.resolve();
    return this.inner.observeLogicalTime(value);
  }
  async loadGrant(id) {
    await Promise.resolve();
    return this.inner.loadGrant(id);
  }
  async loadIdempotency(scope, key) {
    await Promise.resolve();
    return this.inner.loadIdempotency(scope, key);
  }
  async createGrant(input) {
    await Promise.resolve();
    return this.inner.createGrant(input);
  }
  async compareAndSwapGrant(input) {
    await Promise.resolve();
    return this.inner.compareAndSwapGrant(input);
  }
}

function createGateway(repository, dispatch) {
  return new ActionGateway(
    repository,
    binding,
    {
      dispatcherId: binding.dispatcherId,
      dispatcherVersion: binding.dispatcherVersion,
      fencingMode: binding.fencingMode,
      dispatch,
    },
    {
      contextResolverId: binding.contextResolverId,
      contextResolverVersion: binding.contextResolverVersion,
      async resolve(scope) {
        return {
          tenant: { tenantId: scope.tenantId },
          toolId: binding.toolId,
          runId: scope.runId,
        };
      },
    },
    {
      resolverId: "authority:repository",
      resolverVersion: 1,
      async resolve(scope, actionDigestValue) {
        return {
          schemaVersion: 1,
          status: "current",
          resolverId: "authority:repository",
          resolverVersion: 1,
          scopeDigest: scopeDigest(scope),
          actionDigest: actionDigestValue,
          scope,
          authorityGeneration: null,
          fencingToken: null,
        };
      },
    },
    {
      assessorId: "assessor:repository",
      assessorVersion: 1,
      async consumeCurrent() {
        return true;
      },
    },
  );
}

test("async Action Grant repository preserves create idempotency and CAS", async () => {
  const repository = new AsyncGrantRepository("gateway:repository");
  const issued = await issueActionGrantV1(repository, grant());
  assert.equal(issued.status, "issued");
  assert.deepEqual(await issueActionGrantV1(repository, grant()), issued);

  const altered = grant("grant:other");
  const equivalentDraft = {
    ...altered,
    scope: issued.scope,
    scopeDigest: issued.scopeDigest,
    idempotencyKey: issued.idempotencyKey,
  };
  const equivalent = Object.freeze({
    ...equivalentDraft,
    actionDigest: actionDigest(equivalentDraft, binding),
  });
  assert.deepEqual(await issueActionGrantV1(repository, equivalent), issued);

  const conflictDraft = {
    ...altered,
    scope: issued.scope,
    scopeDigest: issued.scopeDigest,
    idempotencyKey: issued.idempotencyKey,
    inputDigest: actionInputDigest({ changed: true }),
  };
  const conflict = Object.freeze({
    ...conflictDraft,
    actionDigest: actionDigest(conflictDraft, binding),
  });
  await assert.rejects(
    issueActionGrantV1(repository, conflict),
    /grant_idempotency_conflict/,
  );

  let dispatches = 0;
  const gateway = createGateway(repository, async () => {
    dispatches += 1;
    await Promise.resolve();
    return { ok: true, value: { written: true } };
  });
  const outcomes = await Promise.allSettled([
    gateway.invoke({
      schemaVersion: 1,
      grantId: issued.grantId,
      logicalTimeMs: 2,
    }),
    gateway.invoke({
      schemaVersion: 1,
      grantId: issued.grantId,
      logicalTimeMs: 2,
    }),
  ]);
  assert.equal(
    outcomes.filter((outcome) => outcome.status === "fulfilled").length,
    1,
  );
  assert.equal(dispatches, 1);
  assert.equal(
    (await repository.loadGrant(issued.grantId)).status,
    "dispatched",
  );
});

test("repository CAS rejects a stale generation without changing state", async () => {
  const repository = new AsyncGrantRepository("gateway:cas");
  const issued = await issueActionGrantV1(repository, grant("grant:cas"));
  const idempotency = await repository.loadIdempotency(
    issued.scopeDigest,
    issued.idempotencyKey,
  );
  const result = await repository.compareAndSwapGrant({
    grantId: issued.grantId,
    expectedStateGeneration: issued.stateGeneration + 1,
    expectedGrantDigest: controlDigest("grant", issued),
    nextGrant: issued,
    nextIdempotency: idempotency,
  });
  assert.equal(result.status, "conflict");
  assert.deepEqual(await repository.loadGrant(issued.grantId), issued);
});
