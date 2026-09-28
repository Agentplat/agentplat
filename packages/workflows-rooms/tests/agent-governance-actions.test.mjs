import assert from "node:assert/strict";
import test from "node:test";
import {
  LocalGrantLedger,
  actionDigest,
  actionInputDigest,
  scopeDigest,
  controlDigest,
  issueActionGrantV1,
} from "@agentplat/inference-control/tools";
import {
  AgentDefinitionRegistry,
  InMemoryAgentDefinitionRegistryStore,
  InMemoryAgentGovernanceStoreV1,
  InMemoryAgentExecutionStoreV1,
} from "@agentplat/rooms";
import {
  createAgentGovernanceActionGatewayV1,
  agentGovernanceActionTargetDigestV1,
} from "../dist/index.js";
import { setupAgentExecution } from "../../../tests/helpers/agent-execution-scenarios.mjs";

test("Action Gateway retains existing authority and binds actual input to governed cumulative reservations", async () => {
  const governance = new InMemoryAgentGovernanceStoreV1(),
    store = new InMemoryAgentExecutionStoreV1(governance);
  const f = await setupAgentExecution({
    governance,
    store,
    definitions: new AgentDefinitionRegistry(
      new InMemoryAgentDefinitionRegistryStore(),
    ),
  });
  const binding = {
    schemaVersion: 1,
    actionBindingId: "binding",
    actionBindingVersion: 1,
    namespace: "documents",
    toolId: "writer",
    operation: "create",
    dispatcherId: "dispatcher",
    dispatcherVersion: 1,
    contextResolverId: "context",
    contextResolverVersion: 1,
    fencingMode: "local_only",
    handlerDigest: controlDigest("handler", { name: "writer" }),
  };
  const scope = {
    schemaVersion: 1,
    kind: "standalone",
    tenantId: "t",
    runId: "run",
    agentId: "agent",
    organizationId: null,
    workspaceId: null,
    policyId: "policy",
    policyVersion: 1,
  };
  const ledger = new LocalGrantLedger("gateway");
  let effectCalls = 0,
    beforeQuote,
    downstreamBehavior,
    effectAlias,
    baseAllowed = true;
  const issue = async (id, amount) => {
    const draft = {
      schemaVersion: 1,
      grantId: id,
      stateGeneration: 1,
      scope,
      scopeDigest: scopeDigest(scope),
      namespace: binding.namespace,
      toolId: binding.toolId,
      operation: binding.operation,
      actionBindingId: binding.actionBindingId,
      actionBindingVersion: 1,
      handlerDigest: binding.handlerDigest,
      inputDigest: actionInputDigest({ amount }),
      actionDigest: controlDigest("pending", {}),
      assessmentRequestId: `request:${id}`,
      assessmentId: `assessment:${id}`,
      assessmentTargetDigest: agentGovernanceActionTargetDigestV1(
        await f.controller.open("t", "agent"),
        scope,
        binding,
        { amount },
      ),
      idempotencyKey: id,
      issuedAtLogicalMs: Math.max(1, ledger.snapshot().highWaterLogicalMs),
      expiresAtLogicalMs: 10000,
      singleUse: true,
      status: "issued",
      reservation: null,
    };
    return issueActionGrantV1(ledger, {
      ...draft,
      actionDigest: actionDigest(draft, binding),
    });
  };
  const make = async () =>
    createAgentGovernanceActionGatewayV1({
      ledger,
      binding,
      controller: f.controller,
      governance: await f.controller.open("t", "agent"),
      downstream: {
        dispatcherId: "dispatcher",
        dispatcherVersion: 1,
        fencingMode: "local_only",
        dispatch: async (request) => {
          effectCalls++;
          if (downstreamBehavior) await downstreamBehavior(request);
          return { ok: true, value: { written: true } };
        },
      },
      contextResolver: {
        contextResolverId: "context",
        contextResolverVersion: 1,
        resolve: async (s) => ({
          tenant: { tenantId: s.tenantId },
          runId: s.runId,
          toolId: "writer",
        }),
      },
      authorityResolver: {
        resolverId: "authority",
        resolverVersion: 1,
        resolve: async (s, d) => ({
          schemaVersion: 1,
          status: baseAllowed ? "current" : "stale",
          resolverId: "authority",
          resolverVersion: 1,
          scopeDigest: scopeDigest(s),
          actionDigest: d,
          ...(baseAllowed
            ? { scope: s, authorityGeneration: null, fencingToken: null }
            : {}),
        }),
      },
      assessmentResolver: {
        assessorId: "assessor",
        assessorVersion: 1,
        consumeCurrent: async () => baseAllowed,
      },
      quote: {
        quote: async ({ input, grant }) => {
          if (beforeQuote) await beforeQuote();
          return {
            effectId: effectAlias ?? grant.idempotencyKey,
            destination: "approved-vendor",
            charges: [
              { budgetId: "spend", unit: "USD_cent", units: input.amount },
            ],
          };
        },
      },
    });
  const gateway = await make();
  await issue("a", 7);
  await issue("b", 7);
  const outcomes = await Promise.all(
    ["a", "b"].map((grantId) =>
      gateway.invoke({
        schemaVersion: 1,
        grantId,
        input: { amount: 7 },
        logicalTimeMs: 2,
      }),
    ),
  );
  assert.equal(outcomes.filter((x) => x.ok).length, 1);
  assert.equal(effectCalls, 1);
  const success = outcomes[0].ok ? "a" : "b";
  assert.equal((await store.effect("t", "agent", success)).status, "succeeded");
  effectAlias = success;
  await issue("same-logical-effect", 7);
  assert.equal(
    (
      await gateway.invoke({
        schemaVersion: 1,
        grantId: "same-logical-effect",
        input: { amount: 7 },
        logicalTimeMs: 2,
      })
    ).error.code,
    "effect_identity_conflict",
  );
  assert.equal(effectCalls, 1);
  effectAlias = undefined;
  await issue("tampered", 1);
  await assert.rejects(
    gateway.invoke({
      schemaVersion: 1,
      grantId: "tampered",
      input: { amount: 2 },
      logicalTimeMs: 3,
    }),
    /grant_action_mismatch/,
  );
  assert.equal(effectCalls, 1);
  beforeQuote = async () => {
    baseAllowed = false;
  };
  await issue("base-revoked", 1);
  assert.equal(
    (
      await gateway.invoke({
        schemaVersion: 1,
        grantId: "base-revoked",
        input: { amount: 1 },
        logicalTimeMs: 4,
      })
    ).error.code,
    "base_action_authority_stale",
  );
  assert.equal(effectCalls, 1);
  baseAllowed = true;
  beforeQuote = async () => {
    await f.govern({ kind: "suspend" });
  };
  await issue("old-epoch", 1);
  await issue("suspended", 1);
  await assert.rejects(
    gateway.invoke({
      schemaVersion: 1,
      grantId: "suspended",
      input: { amount: 1 },
      logicalTimeMs: 5,
    }),
    { code: "FORBIDDEN" },
  );
  assert.equal(effectCalls, 1);
  beforeQuote = undefined;
  await f.govern({ kind: "prepare_activation" });
  await f.govern({ kind: "activate" });
  const resumed = await make();
  assert.equal(
    (
      await resumed.invoke({
        schemaVersion: 1,
        grantId: "old-epoch",
        input: { amount: 1 },
        logicalTimeMs: 6,
      })
    ).error.code,
    "agent_governance_binding_mismatch",
  );
  assert.equal(effectCalls, 1);
  downstreamBehavior = async () => {
    throw Error("unknown external outcome");
  };
  await issue("unknown", 3);
  await assert.rejects(
    resumed.invoke({
      schemaVersion: 1,
      grantId: "unknown",
      input: { amount: 3 },
      logicalTimeMs: 6,
    }),
    /unknown external/,
  );
  assert.equal(effectCalls, 2);
  assert.equal(
    (await store.effect("t", "agent", "unknown")).status,
    "indeterminate",
  );
  downstreamBehavior = undefined;
  await issue("budget-held", 1);
  assert.equal(
    (
      await resumed.invoke({
        schemaVersion: 1,
        grantId: "budget-held",
        input: { amount: 1 },
        logicalTimeMs: 7,
      })
    ).error.code,
    "budget_exhausted_or_unbound",
  );
  assert.equal(effectCalls, 2);
  await f.controller.reconcile("t", "agent", "unknown", {
    lookup: async (record) => ({
      requestDigest: record.requestDigest,
      outcome: "not_applied",
      proofRef: "verified:no-effect",
    }),
  });
  downstreamBehavior = async () => {
    await f.govern({ kind: "suspend" });
  };
  await issue("already-admitted", 3);
  assert.equal(
    (
      await resumed.invoke({
        schemaVersion: 1,
        grantId: "already-admitted",
        input: { amount: 3 },
        logicalTimeMs: 8,
      })
    ).ok,
    true,
  );
  assert.equal(
    (await store.effect("t", "agent", "already-admitted")).status,
    "succeeded",
  );
  assert.equal((await governance.load("t", "agent")).status, "suspended");
  assert.equal(effectCalls, 3);
});
