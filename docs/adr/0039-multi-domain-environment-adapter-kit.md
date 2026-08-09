# ADR 0039: Multi-domain environment adapter kit

- Status: accepted
- Date: 2026-08-07

## Context

The sharded simulation boundary scales logical peers and interactions and keeps
evaluator state separate, but its observation and action payloads are
intentionally opaque JSON. External environments need a portable way to
describe physical, social, cyber and hybrid semantics without coupling the
runtime to a simulator SDK.

## Decision

Add a provider-neutral adapter descriptor, immutable scenario manifest and
conformance runner. Descriptors bind implementation identity, supported domain
families, observation schemas, action capabilities and hard resource limits.
Scenario manifests bind one descriptor to a scale profile, seed, domain set,
entity count, topology, transition, visibility and fault policies and explicit
budgets.

Runner-visible observations use one closed envelope. Actions use a separate
closed envelope and remain inside the existing execution-epoch and fencing
request. Adapter factories return the established sharded environment bridge;
the kit does not create a competing simulation transport. Reference physical,
social and cyber adapters are coarse local fixtures that exercise the same
contract and are not fidelity claims.

The public conformance runner reconstructs the exact expected manifest from the
requested definition, then checks deterministic replay, observation replay,
capability denial, stale-fence rejection, a post-checkpoint mutation and
restore, out-of-population actions, oversized actions and observed byte bounds.
It never receives the evaluator port or a success metric.

The reference bridge enforces scenario interaction and byte budgets in
addition to descriptor ceilings, and rejects observation, action and
cross-shard peer indexes outside the manifest population. Observation, action
and cross-shard calls for the same peer and logical time consume one logical
interaction slot. Checkpoints preflight their public-envelope bound before
mutating delegate state, and restore also restores the adapter's private budget
and idempotency snapshot.

## Consequences

- External simulators can be registered without changing runtime enums or
  importing vendor SDKs.
- A schema or implementation change produces a different descriptor and
  scenario identity.
- Private environment state remains behind opaque checkpoint handles.
- Constructing a frontier-scale manifest or passing contract conformance is not
  evidence that a frontier-scale experiment ran.
