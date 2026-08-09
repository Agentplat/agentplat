# Multi-domain environment adapter threat model

## Protected properties

- Scenario, implementation, schema, seed and scale bindings cannot be silently
  substituted.
- Runner-visible observations do not expose evaluator or private environment
  state.
- Undeclared actions and over-budget inputs are rejected before adapter state is
  allocated or mutated.
- The existing execution epoch, fence, checkpoint anchor and cross-shard replay
  protections remain authoritative.

## Untrusted inputs

Treat descriptors, manifests, payloads, cursors, adapter responses and external
transport data as untrusted. Validation requires plain exact-key JSON values,
closed domains and modalities, bounded identifiers, registered schemas,
canonical order and digest equality.

## Failure behavior

- Unknown schema, capability or domain: fail closed.
- Descriptor or manifest mismatch: do not open the scenario.
- A manifest differing from the exact requested definition: fail conformance.
- Entity, byte, interaction or checkpoint limit exceeded: reject before
  allocation.
- Checkpoint restore must also restore adapter-owned budget and idempotency
  state; restoring only the delegated simulator snapshot is non-conformant.
- Stale execution fence: return a rejected effect receipt through the existing
  bridge.
- Replay divergence: fail conformance and preserve the evidence digest.

## Residual boundaries

The kit does not prove simulator fidelity, semantic truth, wall-clock
determinism, isolation of a remote process or successful execution at scale.
Deployments must authenticate transports, protect private state, operate
durable anchors and validate domain-specific semantics independently.
Black-box conformance exercises the published boundary; it cannot prove that a
remote implementation has no hidden bypass. Production registration should
therefore require both conformance evidence and authenticated deployment
identity.
