# Pluggable collective strategies v1

AgentPlat exposes interchangeable, deterministic strategy seams while retaining the existing runtime algorithms as reference implementations.

## Strategy domains

- **Allocation**: `MechanismAllocationStrategyV1` and `MechanismAllocationStrategyRegistryV1` in `@agentplat/collective-runtime/mechanism-allocation`.
- **Team formation and negotiation**: `TeamFormationStrategyV1` and `TeamFormationStrategyRegistryV1` in `@agentplat/collective-runtime/team-formation-strategies`.
- **Evidence fusion**: `EvidenceFusionStrategyV1` and `EvidenceFusionStrategyRegistryV1` in `@agentplat/trust/evidence-fusion-strategy`.

Each descriptor carries a stable identifier, integer version, sorted capability list, and implementation digest. Registries reject conflicting definitions for the same identifier/version and provide deterministic lookup. Implementations must be deterministic for identical canonical inputs and remain subject to the domain policy and validation contracts.

The default strategies preserve the behavior of the existing algorithms: utility/cost ordering for allocation, budget- and independence-aware greedy formation, and weighted-threshold evidence fusion. Consumers can register an alternative implementation and select it explicitly by identifier and version without changing the surrounding state machine.

This seam makes algorithm choice auditable and reproducible: a decision record can retain the selected strategy identity, version, capabilities, and digest alongside the normal policy and evidence digests.
