<p align="center">
  <a href="https://agentplat.com">
    <img src="https://agentplat.com/assets/agentplat-logo.png" alt="AgentPlat" width="76" height="76">
  </a>
</p>

<h1 align="center">AgentPlat</h1>

<p align="center">
  <strong>Open-core framework for building production-grade agentic platforms.</strong>
</p>

<p align="center">
  <a href="https://agentplat.com">Website</a>
  ·
  <a href="https://doc.agentplat.com">Documentation</a>
  ·
  <a href="https://github.com/Agentplat/agentplat">GitHub</a>
  ·
  <a href="https://agentplat.com/#contact">Contact</a>
</p>

AgentPlat helps teams move from isolated agent demos to durable, governed and enterprise-ready agentic systems. It gives product and platform teams shared contracts for runtime, workflows, memory, tools, MCP, events, audit and human review.

Calling a model is easy. Operating agents as production software is the hard part.

## Why AgentPlat

Most agent frameworks focus on prompts, chains and local prototypes. AgentPlat starts one layer lower: the platform boundary where autonomy needs lifecycle, identity, policy, observability and accountability.

Use AgentPlat when you need to:

- run agents inside explicit lifecycle and policy boundaries
- orchestrate long-running workflows with retries, artifacts and review points
- keep memory, context and tool access scoped to a tenant or workspace
- integrate tools and MCP servers without coupling product code to every provider
- capture audit trails for runs, decisions, tool calls, approvals and outcomes
- build many agentic products on top of one shared control plane

## Framework Layers

```text
Product Surfaces
Human Interface
Workflow Engine
Memory
Agent Runtime
Model Providers
Infrastructure
```

AgentPlat is designed to sit between product teams and infrastructure teams. Products can move fast while the platform keeps execution, governance and observability consistent.

## Packages

| Package | Purpose |
| --- | --- |
| `@agentplat/core` | Shared primitives: IDs, metadata, lifecycle states, tenant context, envelopes and errors. |
| `@agentplat/runtime` | Contracts for agent definitions, providers, execution context, run results and streaming events. |
| `@agentplat/workflows` | Durable process, task, stage, artifact and workflow-store contracts. |
| `@agentplat/memory` | Session, message, knowledge-source and retrieval interfaces. |
| `@agentplat/tools` | Tool definitions, credential requirements, invocation context and registries. |
| `@agentplat/mcp` | MCP server definitions, tool bindings and registry contracts. |
| `@agentplat/events` | Event publisher, subscriber and webhook sink interfaces. |
| `@agentplat/audit` | Audit records, sinks and redaction helpers. |
| `@agentplat/cli` | CLI contract surface for AgentPlat project tooling. |
| `@agentplat/api-client` | TypeScript client for AgentPlat APIs. |
| `@agentplat/types` | Shared application-facing TypeScript types. |
| `@agentplat/utils` | Lightweight shared utilities. |

## Example

```ts
import type { TenantContext } from "@agentplat/core";
import type { AgentDefinition, AgentRuntime } from "@agentplat/runtime";

const agent: AgentDefinition = {
  id: "agent_claims_review",
  tenantId: "tenant_acme",
  name: "Claims Review Agent",
  platform: "openai",
  modelName: "gpt-4.1",
  instructions: "Review the claim, collect missing evidence, and escalate exceptions.",
  memoryEnabled: true,
  capabilities: {
    approvals: true,
    audit: "full"
  }
};

const tenant: TenantContext = {
  tenantId: "tenant_acme",
  actor: {
    actorType: "human",
    actorId: "user_123",
    roles: ["claims_operator"]
  }
};

async function runClaim(runtime: AgentRuntime) {
  return runtime.run(
    agent,
    { input: "Review claim CLM-2026-1042", mode: "invoke" },
    { tenant, agentId: agent.id, policies: { approval: "required" } }
  );
}
```

## Development

```sh
corepack pnpm install
corepack pnpm run type-check
```

## Project Status

AgentPlat is in an early open-core release. The public contracts are intentionally small and dependency-light so teams can build around stable platform concepts before adopting heavier runtime integrations.

## License

AgentPlat open-core code is licensed under the Apache License 2.0.

The AgentPlat name, logo and brand assets are covered by separate trademark and brand guidelines.
