# When to use AgentPlat

AgentPlat is an open-source TypeScript framework for persistent human-agent
collaboration, with shared artifacts, human approvals and controlled execution
on your infrastructure. It is an Apache-2.0 developer preview. Review exact
package versions and integration obligations before adopting it.

## Good starting problems

- An internal proposal workflow where agents research and draft, a person
  requests revisions, and the application retains artifacts and decisions.
- Work shared across people and agents that needs persistent tasks, participants
  and versioned outputs in an AgentPlat Agent Room.
- Coordination that must recover completed work at documented crash boundaries.
- Applications that need explicit approval and provider checkpoint integration
  before protected effects.

Start with [persistent collaboration](getting-started/persistent-collaboration.md),
[human approval](getting-started/human-approval.md) or
[recovery](getting-started/recover-agent-coordination.md).

## When a smaller solution may fit

For one model call, a provider SDK may be sufficient. For a short conversation
without shared durable work, the [ephemeral execution path](getting-started/first-execution.md)
can avoid Room infrastructure. If you require a fully managed application,
ready-made business UI or general production guarantees, the preview framework
does not supply those requirements by itself.

## Compare the work model

Documentation review: 2026-09-07. This is a qualitative selection aid based on
the linked official documentation, not a comparative benchmark. Other products
were not installed or performance-tested for this review. Pin and validate
their actual package versions in your own pilot.

| Option | Documented starting abstraction | Selection question |
| --- | --- | --- |
| AgentPlat | Persistent Room participants, tasks, artifacts and decisions, with optional collective coordination | Does your application need a shared human-agent work model and can you operate its adapters? |
| LangGraph | Low-level graph orchestration for stateful agents, with persistence and human intervention | Do you want to define execution and state transitions directly as a graph? |
| Mastra workflows | Schema-defined steps and explicit workflow composition, with suspension and resumption | Does a structured sequence of application steps fit your workflow? |

Sources: [LangGraph overview](https://docs.langchain.com/oss/javascript/langgraph/overview)
and [Mastra workflows](https://mastra.ai/docs/workflows/overview).
Human review and persistence overlap across these tools; neither is an
exclusive AgentPlat feature. Compare how each represents your actual task,
including data ownership, review UI, recovery and operational requirements.

## What your application must supply

Your deployment owns models, storage, verified identity, actor authorization,
UI, policies and external connectors. Protected checkpoints are opt-in and
must be awaited by the provider. External effects need their own idempotency
and reconciliation. See [integration controls](getting-started/integration-controls.md).

Use the [maturity matrix](component-maturity.md), [release channels](release-channels.md)
and [evidence for adopters](evidence-for-adopters.md) together. A source example
does not establish published package parity or general production readiness.

For a bounded evaluation, follow the [developer adoption pilot](getting-started/adoption-pilot.md).
Record failed setup and assisted completion as well as successful runs.
