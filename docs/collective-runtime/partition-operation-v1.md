# Partition operation policy v1

AgentPlat now exposes an explicit policy layer for operating with degraded connectivity while preserving the existing fail-closed default.

- `@agentplat/collective-runtime/partition-operation` models `connected`, `degraded`, `partitioned`, `reconciling`, `converged`, and `safe_stopped`, with strict consistency, bounded degradation, availability preference, and reconciliation-required modes.
- `@agentplat/collective-runtime/degraded-effect-budget` classifies effects by impact and reversibility and enforces offline time, action, resource, and risk budgets.
- `@agentplat/collective-runtime/partition-reconciliation` detects causal branch divergence and deterministically chooses convergence, compensation, rollback, retention, or safe stop.

Irreversible effects remain blocked without the required quorum or reconciliation. Degraded decisions carry explicit reason codes and digests; reconciliations bind branch, epoch, resource, and effect identities so stale authority cannot be silently reused.
