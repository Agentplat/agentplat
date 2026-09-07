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
