# Adopting AgentPlat 1.1.0

AgentPlat 1.1.0 adds governed agent autonomy without automatically changing how
existing agents work. All 66 packages are [published and verified](../releases/stable1-1-distribution-20260929.md).
Upgrade the AgentPlat packages your application already uses together to 1.1.0;
installing every package is unnecessary.

## Choose how each agent works

| Mode | Typical use | Configuration |
| --- | --- | --- |
| Instruction | A person or application requests a bounded task. | Keep an existing definition without `interaction`, or explicitly select instruction mode on a new revision. |
| Purpose | An agent evaluates work toward an owner-defined purpose within enforced limits. | Publish a purpose revision, connect governance and mission services, then qualify and activate it through owner commands. |

Both modes can coexist. A purpose flag alone does not start a worker, grant tool
permission or prove that a purpose has been achieved.

## Keep the traditional workflow

1. Upgrade your existing coordinated dependencies and run your application tests.
2. Leave definitions without `interaction` unchanged. They retain instruction
   behavior and their historical definition digest.
3. Keep existing application authentication, approvals and effect controls.

For example, if your application already uses these packages:

```sh
npm install @agentplat/framework@1.1.0 @agentplat/sessions@1.1.0
```

## Enable governed autonomy gradually

Start with one agent and a bounded purpose, such as assessing a support request,
collecting evidence and proposing a response for approval.

1. For PostgreSQL, back up the database, stop older workers and apply migrations
   through 018 using the same explicit schema for all stores. Follow the
   [migration guide](../agent-rooms-postgres-migration.md).
2. Enroll the agent through `AgentGovernanceServiceV1` with authenticated owner
   identity, explicit tool limits and budgets. The configuration starts suspended.
3. Create a definition revision with the appropriate interaction field:

```ts
// Fields on AgentDefinitionRegistry.createRevision input, not a complete agent.
interaction: { schemaVersion: 1, interactionMode: "instruction" }

// Use this alternative for a purpose revision.
interaction: {
  schemaVersion: 1,
  interactionMode: "purpose",
  governanceId: "support-governance",
}
```

4. Connect the execution controller, Room/Planner mission composition, assessors,
   persistent stores, scheduler and external-effect controls. Use
   `requireGovernedExecution: true` for a fully governed Room and qualify every
   participant. Publish the revision, then prepare and activate it through the
   authenticated owner commands.
5. Verify suspension, owner correction, restart and uncertain-effect reconciliation
   before connecting real business actions. Follow the
   [detailed integration guide](../agent-governance/adoption.md) and runnable
   [support demonstration](../../examples/agent-purpose-support/README.md).

To switch a governed agent back to instruction mode, select a compatible published
instruction revision through the owner `mode` command, then qualify and reactivate.
Keep limits, consumed budgets and origin history. Do not bypass governance by
starting an older worker or removing enforcement records.

## Optional Jev integration

Keep your existing assessor unless you choose Jev. The optional
[adapter setup](../../packages/assessor-typesafe/README.md) requires explicit
server-side credentials and request/result mapping. It neither grants execution
authority nor installs a scheduler. In the Rooms source example, the default
`PROPOSAL_REVIEWER=rules` remains available; selecting `jev` is explicit.

The support demonstration uses deterministic assessors and simulated inputs.
Validate your own model judgments and operational boundaries before production;
release verification is not a claim of semantic reliability or AGI.
