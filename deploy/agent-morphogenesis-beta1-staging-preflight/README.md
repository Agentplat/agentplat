# Agent Morphogenesis Beta 1 staging preflight

This Compose topology is the non-qualifying, single-host rehearsal for the
distributed staging campaign. It provides separate persistent PostgreSQL data
planes for AgentPlat and Temporal, a real Temporal service, health gates and
isolated container networks. Agent Mesh peers and Morphogenesis workers run as
real local processes against these services so existing fault probes remain
the source of runtime behavior.

Run through the repository commands:

```sh
pnpm preflight:agent-morphogenesis-beta1-staging:up
pnpm preflight:agent-morphogenesis-beta1-staging:status
pnpm preflight:agent-morphogenesis-beta1-staging:down
```

`down` preserves volumes. Destruction of preflight volumes is intentionally
not automated because it is a destructive operation.

This topology shares one Docker host, engine and physical network. It cannot
establish `beta1-distributed-staging-profile-established`, external key
custody, independent rollback witnessing, host-loss tolerance or production
readiness.
