# Governed workflows

**Defines:** the implemented Beta 6 source baseline for long-lived,
human-governed AgentPlat processes. Core execution, task leases, delayed
outcomes, PostgreSQL, Temporal, Agent Room gates, progressive autonomy and
shared conformance are implemented. Deployment and empirical guarantees remain
outside source/conformance evidence.

- [Implementation plan](./governed-durable-workflows-v1-implementation-plan.md)
- [Acceptance checklist](./governed-durable-workflows-v1-acceptance-checklist.md)
- [Threat model](../security/governed-durable-workflows-threat-model.md)
- [Architecture decision](../adr/0044-governed-durable-workflows.md)
- [Adapter admission decision](../adr/0045-platform-adapter-admission-boundary.md)

The design is additive and opt-in. The implemented core makes no restart,
multi-process, production-scale durability, liveness, latency or exactly-once
external-effect claim.
