import assert from "node:assert/strict";
import test from "node:test";
import {
  LocalGrantLedger,
  issueActionGrantV1,
  reconcileActionGrantV1,
  actionDigest,
  actionInputDigest,
  scopeDigest,
  controlDigest,
} from "@agentplat/inference-control/tools";
import {
  InMemoryAgentGovernanceStoreV1,
  InMemoryAgentExecutionStoreV1,
  InMemoryPurposeMissionStoreV1,
  InMemoryAgentInceptionStoreV1,
  InMemoryAttentionSignalStoreV1,
  InMemoryAgentRoomPlanStore,
  InMemoryRoomRepository,
  AgentDefinitionRegistry,
  InMemoryAgentDefinitionRegistryStore,
} from "@agentplat/rooms";
import {
  createAgentGovernanceActionGatewayV1,
  agentGovernanceActionTargetDigestV1,
} from "../dist/index.js";
import { purposeMissionScenarios } from "../../../tests/helpers/purpose-mission-scenarios.mjs";
test("qualified purpose work executes through Action Gateway and unresolved effects block mission success", async () => {
  const governance = new InMemoryAgentGovernanceStoreV1(),
    missions = new InMemoryPurposeMissionStoreV1(governance),
    ledger = new LocalGrantLedger("purpose-gateway");
  let calls = 0;
  await purposeMissionScenarios({
    governance,
    missions,
    execution: new InMemoryAgentExecutionStoreV1(governance, missions),
    plans: new InMemoryAgentRoomPlanStore(),
    repository: new InMemoryRoomRepository(),
    definitions: new AgentDefinitionRegistry(
      new InMemoryAgentDefinitionRegistryStore(),
    ),
    inceptions: new InMemoryAgentInceptionStoreV1(governance),
    signals: new InMemoryAttentionSignalStoreV1(governance),
    effectDriver: async ({
      controller,
      execution,
      binding: governed,
      context,
    }) => {
      const binding = {
        schemaVersion: 1,
        actionBindingId: "purpose-binding",
        actionBindingVersion: 1,
        namespace: "documents",
        toolId: "writer",
        operation: "create",
        dispatcherId: "purpose-dispatcher",
        dispatcherVersion: 1,
        contextResolverId: "purpose-context",
        contextResolverVersion: 1,
        fencingMode: "local_only",
        handlerDigest: controlDigest("handler-binding", { handler: "writer" }),
      };
      const scope = {
          schemaVersion: 1,
          kind: "standalone",
          tenantId: "t",
          agentId: "agent",
          runId: context.runId,
          organizationId: null,
          workspaceId: null,
          policyId: "purpose-policy",
          policyVersion: 1,
        },
        input = { text: "Approved draft" };
      const draft = {
        schemaVersion: 1,
        grantId: "purpose-grant",
        stateGeneration: 1,
        scope,
        scopeDigest: scopeDigest(scope),
        namespace: binding.namespace,
        toolId: "writer",
        operation: "create",
        actionBindingId: binding.actionBindingId,
        actionBindingVersion: 1,
        handlerDigest: binding.handlerDigest,
        inputDigest: actionInputDigest(input),
        actionDigest: controlDigest("action", {}),
        assessmentRequestId: "purpose-assessment-request",
        assessmentId: "purpose-assessment",
        assessmentTargetDigest: agentGovernanceActionTargetDigestV1(
          governed,
          scope,
          binding,
          input,
        ),
        idempotencyKey: "uncertain-outcome",
        issuedAtLogicalMs: 1,
        expiresAtLogicalMs: 1000,
        singleUse: true,
        status: "issued",
        reservation: null,
      };
      await issueActionGrantV1(ledger, {
        ...draft,
        actionDigest: actionDigest(draft, binding),
      });
      const gateway = createAgentGovernanceActionGatewayV1({
        ledger,
        binding,
        controller,
        governance: governed,
        downstream: {
          dispatcherId: "purpose-dispatcher",
          dispatcherVersion: 1,
          fencingMode: "local_only",
          dispatch: async () => {
            calls++;
            throw Error("lost downstream receipt");
          },
        },
        contextResolver: {
          contextResolverId: "purpose-context",
          contextResolverVersion: 1,
          resolve: async () => ({
            tenant: { tenantId: "t" },
            runId: context.runId,
            toolId: "writer",
          }),
        },
        authorityResolver: {
          resolverId: "purpose-authority",
          resolverVersion: 1,
          resolve: async (s, d) => ({
            schemaVersion: 1,
            status: "current",
            resolverId: "purpose-authority",
            resolverVersion: 1,
            scopeDigest: scopeDigest(s),
            actionDigest: d,
            scope: s,
            authorityGeneration: null,
            fencingToken: null,
          }),
        },
        assessmentResolver: {
          assessorId: "purpose-assessor",
          assessorVersion: 1,
          consumeCurrent: async () => true,
        },
        quote: {
          quote: async () => ({
            effectId: "uncertain-outcome",
            destination: null,
            charges: [],
          }),
        },
      });
      await assert.rejects(
        gateway.invoke({
          schemaVersion: 1,
          grantId: "purpose-grant",
          input,
          logicalTimeMs: 2,
        }),
        /lost downstream receipt/,
      );
      const record = await execution.effect("t", "agent", "uncertain-outcome");
      assert.equal(record.status, "indeterminate");
      assert.equal(record.binding.purposeWork.missionId, "mission");
      return record;
    },
  });
  assert.equal(calls, 1);
  const grant = await ledger.loadGrant("purpose-grant");
  assert.equal(grant.status, "indeterminate");
  await reconcileActionGrantV1(ledger, {
    grantId: grant.grantId,
    reservationId: grant.reservation.reservationId,
    dispatchAttemptId: grant.reservation.dispatchAttemptId,
    outcome: "dispatched",
  });
  assert.equal((await ledger.loadGrant("purpose-grant")).status, "dispatched");
});
