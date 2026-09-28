import assert from "node:assert/strict";
import {
  AgentGovernanceServiceV1,
  AgentExecutionControllerV1,
  AgentContinuityServiceV1,
} from "@agentplat/rooms";
import { setupAgentExecution } from "./agent-execution-scenarios.mjs";
export async function continuityScenarios({
  governance,
  execution,
  continuity,
  definitions,
}) {
  const root = await setupAgentExecution({
    governance,
    store: execution,
    definitions,
  });
  const evidence = {
    verify: async ({ reference, parent, child }) => ({
      compatible:
        reference === "verified-genesis" &&
        parent.configuration.purpose === child.configuration.purpose,
      parentConfigurationDigest: parent.configurationDigest,
      childConfigurationDigest: child.configurationDigest,
      evidenceDigest: `sha256:${"a".repeat(64)}`,
      explanation: "Verified owner receipt and inherited purpose",
      permittedTools: null,
    }),
  };
  const links = new AgentContinuityServiceV1(
      continuity,
      governance,
      root.access,
      evidence,
      root.clock,
    ),
    children = [];
  for (const agentId of ["child-a", "child-b"]) {
    await definitions.createAgent({ tenantId: "t", agentId, name: agentId });
    const draft = await definitions.createRevision({
      tenantId: "t",
      agentId,
      version: "1.0.0",
      instructions: "Perform bounded work",
      runtimeProfile: { platform: "mock" },
    });
    await definitions.publishRevision("t", draft.definition.revisionId, 0);
    const controller = new AgentExecutionControllerV1(
      execution,
      governance,
      definitions,
      { ...root.profile, definitionRevisionId: draft.definition.revisionId },
      [],
      root.semantic,
      root.clock,
    );
    const government = new AgentGovernanceServiceV1(
      governance,
      root.access,
      definitions,
      root.clock,
      controller,
    );
    const origin = {
      parentAgentId: "agent",
      continuityId: `origin:${agentId}`,
      kind: "genesis",
    };
    await government.execute("owner", {
      agentId,
      operationId: "create",
      expectedRevision: null,
      command: {
        kind: "create",
        governanceId: `gov:${agentId}`,
        ownerId: "owner",
        purpose: "Complete permitted work",
        definitionRevisionId: draft.definition.revisionId,
        origin,
      },
    });
    await government.execute("owner", {
      agentId,
      operationId: "prepare",
      expectedRevision: 0,
      command: { kind: "prepare_activation" },
    });
    await assert.rejects(
      government.execute("owner", {
        agentId,
        operationId: "too-early",
        expectedRevision: 1,
        command: { kind: "activate" },
      }),
    );
    const proposal = {
      continuityId: origin.continuityId,
      parentAgentId: "agent",
      childAgentId: agentId,
      operationId: "propose",
      expectedRevision: null,
      expiresAt: "2099-01-01T00:00:00.000Z",
      evidenceKind: "genesis",
      evidenceRef: "verified-genesis",
    };
    await assert.rejects(links.propose("intruder", proposal), {
      code: "FORBIDDEN",
    });
    await assert.rejects(
      links.propose("owner", { ...proposal, evidenceRef: "forged-receipt" }),
      { code: "FORBIDDEN" },
    );
    const proposed = await links.propose("owner", proposal);
    assert.deepEqual(await links.propose("owner", proposal), proposed);
    await assert.rejects(
      links.accept("intruder", {
        continuityId: origin.continuityId,
        operationId: "wrong-accept",
        expectedRevision: 0,
      }),
      { code: "FORBIDDEN" },
    );
    await links.accept("owner", {
      continuityId: origin.continuityId,
      operationId: "accept",
      expectedRevision: 0,
    });
    await government.execute("owner", {
      agentId,
      operationId: "activate",
      expectedRevision: 1,
      command: { kind: "activate" },
    });
    const binding = await controller.open("t", agentId);
    assert.equal(binding.continuity[0].parentAgentId, "agent");
    children.push({
      agentId,
      controller,
      government,
      binding,
      origin,
      proposal,
      definition: draft.definition,
    });
  }
  const results = await Promise.all(
    children.map((c) =>
      c.controller.reserve(c.binding, {
        ...root.descriptor(`effect:${c.agentId}`, 7),
      }),
    ),
  );
  assert.equal(results.filter((r) => r.status === "created").length, 1);
  assert.equal(results.filter((r) => r.status === "denied").length, 1);
  const winner = results.find((r) => r.status === "created").record,
    child = children.find((c) => c.agentId === winner.binding.agentId);
  assert.ok(
    winner.budgetAccounts.some(
      (a) => a.agentId === "agent" && a.charges[0].units === 7,
    ),
  );
  assert.equal(
    (
      await root.controller.reserve(
        root.binding,
        root.descriptor("parent-over-budget", 4),
      )
    ).code,
    "budget_exhausted_or_unbound",
  );
  await child.controller.recordOutcome(
    winner,
    "indeterminate",
    "unknown:child",
  );
  assert.equal(
    (
      await root.controller.reserve(
        root.binding,
        root.descriptor("still-held", 4),
      )
    ).status,
    "denied",
  );
  await child.controller.reconcile("t", child.agentId, winner.effect.effectId, {
    lookup: async (r) => ({
      requestDigest: r.requestDigest,
      outcome: "not_applied",
      proofRef: "verified:absent",
    }),
  });
  const spent = await root.controller.reserve(
    root.binding,
    root.descriptor("parent-spend", 6),
  );
  assert.equal(spent.status, "created");
  await root.controller.recordOutcome(
    spent.record,
    "succeeded",
    "verified:parent",
  );
  assert.equal(
    (
      await children[0].controller.reserve(
        children[0].binding,
        root.descriptor("child-over-budget", 5),
      )
    ).status,
    "denied",
  );
  assert.equal(
    (
      await children[0].controller.reserve(children[0].binding, {
        ...root.descriptor("wrong-target", 1),
        destination: "unapproved",
      })
    ).code,
    "destination_limit",
  );
  await root.govern({ kind: "suspend" });
  await assert.rejects(
    children[0].controller.reserve(
      children[0].binding,
      root.descriptor("parent-paused", 1),
    ),
  );
  await root.govern({ kind: "prepare_activation" });
  await root.govern({ kind: "activate" });
  await assert.rejects(children[0].controller.open("t", children[0].agentId));
  const renewed = children[0];
  await links.propose("owner", {
    ...renewed.proposal,
    operationId: "renew",
    expectedRevision: 1,
  });
  await links.accept("owner", {
    continuityId: renewed.origin.continuityId,
    operationId: "renew-accept",
    expectedRevision: 2,
  });
  const current = await renewed.controller.open("t", renewed.agentId);
  await assert.rejects(
    renewed.controller.reserve(
      renewed.binding,
      root.descriptor("old-consent", 1),
    ),
  );
  assert.equal(
    (
      await renewed.controller.reserve(
        current,
        root.descriptor("renewed-still-budgeted", 5),
      )
    ).status,
    "denied",
  );
  // A replacement stays the same governed agent and cannot escape its origin or budget.
  const nextDef = await definitions.createRevision({
    tenantId: "t",
    agentId: renewed.agentId,
    version: "2.0.0",
    instructions: "Perform bounded work",
    runtimeProfile: { platform: "mock", modelName: "new-model" },
  });
  await definitions.publishRevision("t", nextDef.definition.revisionId, 0);
  const before = await governance.load("t", renewed.agentId);
  await renewed.government.execute("owner", {
    agentId: renewed.agentId,
    operationId: "model-replacement",
    expectedRevision: before.revision,
    command: {
      kind: "mode",
      definitionRevisionId: nextDef.definition.revisionId,
    },
  });
  const replaced = await governance.load("t", renewed.agentId);
  assert.deepEqual(replaced.configuration.origin, before.configuration.origin);
  assert.equal(replaced.configuration.purpose, before.configuration.purpose);
  assert.equal(replaced.status, "suspended");
  const controller = new AgentExecutionControllerV1(
    execution,
    governance,
    definitions,
    { ...root.profile, definitionRevisionId: nextDef.definition.revisionId },
    [],
    root.semantic,
    root.clock,
  );
  const government = new AgentGovernanceServiceV1(
    governance,
    root.access,
    definitions,
    root.clock,
    controller,
  );
  await government.execute("owner", {
    agentId: renewed.agentId,
    operationId: "new-model-prepare",
    expectedRevision: replaced.revision,
    command: { kind: "prepare_activation" },
  });
  await assert.rejects(
    government.execute("owner", {
      agentId: renewed.agentId,
      operationId: "new-model-too-early",
      expectedRevision: replaced.revision + 1,
      command: { kind: "activate" },
    }),
  );
  await links.propose("owner", {
    ...renewed.proposal,
    operationId: "new-model-review",
    expectedRevision: 3,
  });
  await links.accept("owner", {
    continuityId: renewed.origin.continuityId,
    operationId: "new-model-accept",
    expectedRevision: 4,
  });
  await government.execute("owner", {
    agentId: renewed.agentId,
    operationId: "new-model-activate",
    expectedRevision: replaced.revision + 1,
    command: { kind: "activate" },
  });
  const newBinding = await controller.open("t", renewed.agentId);
  assert.notEqual(
    newBinding.definitionRevisionId,
    current.definitionRevisionId,
  );
  assert.equal(
    (
      await controller.reserve(
        newBinding,
        root.descriptor("new-model-no-reset", 5),
      )
    ).status,
    "denied",
  );
  await links.revoke("owner", {
    continuityId: renewed.origin.continuityId,
    operationId: "revoke",
    expectedRevision: 5,
  });
  await assert.rejects(controller.open("t", renewed.agentId));
  return { root, children, links, winner, newBinding };
}
