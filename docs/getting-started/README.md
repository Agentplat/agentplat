# Choose an adoption path

| Goal                                         | Path                                                        | Minimum composition                                                           |
| -------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Generate text or try an ephemeral session    | [First execution](first-execution.md)                       | Framework and a model or mock provider                                        |
| Build an internal platform with human review | **[Persistent collaboration](persistent-collaboration.md)** | Rooms, runtime, Rooms API and PostgreSQL adapter                              |
| Coordinate independent processes             | [Distributed coordination](distributed-coordination.md)     | Collective Runtime first; Mesh and its transport/storage adapters when needed |

Start with the smallest path that meets your application needs. Read the
[component maturity matrix](../component-maturity.md) before relying on a
capability. No path implies general production readiness.

## Solve a specific problem

- [Build persistent human-agent collaboration in TypeScript](persistent-collaboration.md).
- [Add human approval to a multi-agent workflow](human-approval.md).
- [Resume agent coordination after a process failure](recover-agent-coordination.md).

Compare adoption requirements in [when to use AgentPlat](../when-to-use-agentplat.md)
and inspect [evidence for adopters](../evidence-for-adopters.md).

## Validation

See the [development validation record](validation.md) for executed checks and
remaining environment limits. The [external developer pilot](adoption-pilot.md)
is a separate, pending usability evaluation.

## Upgrading to 1.1

See [Adopting AgentPlat 1.1.0](adopting-1.1.md) to keep instruction-driven work or opt into governed purpose execution.

## Historical upgrade: 1.2

The following guide records the 1.2.0 standalone action-controls release. For current package selection see the 1.4.0 release notes.

## Upgrading to 1.2

See [Adopting AgentPlat 1.2.0](adopting-1.2.md) for its historical standalone action-control upgrade notes. The current package release is 1.4.0; see the section below.


## Upgrading to 1.4

See the [verified 1.4.0 distribution and adoption notes](../releases/1.4.0-distribution.md), [Planner migration and activation guide](../releases/room-planner-1.4.0-adoption.md), and [persistent-memory consumer guide](persistent-memory-consumer.md). Planner, memory and artifact profiles are opt-in and require explicit migrations where applicable.
