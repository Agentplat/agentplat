# `@agentplat/collective-membership`

Certified dynamic membership and overlapping Ed25519 key rotation for
Agentplat collectives.

The package maintains an ordered chain of immutable configuration epochs. A
transition is accepted only when signed votes contain both:

- a strict majority of the previous configuration; and
- a strict majority of the next configuration.

This joint-quorum rule applies to joins, leaves, and key rotation. It prevents
two disjoint peer sets from independently replacing the same epoch.

## Configuration lifecycle

Every configuration binds tenant, mesh, policy domain, members, stable process
instances, public verification keys, activation time, previous digest, and the
derived majority threshold. Members and keys use canonical ordering, and every
configuration, proposal, envelope, and certificate has a deterministic SHA-256
digest.

Joins require proof that the joining peer controls its advertised private key.
Rotation requires proofs from both the retiring and replacement keys. The
retiring key is shortened to the declared `overlapUntil`; the replacement key
must remain valid beyond that instant. Private key material never enters
configuration state.

```ts
import {
  CollectiveMembershipHostV1,
  InMemoryCollectiveMembershipRegistryV1,
  InMemoryCollectiveMembershipRepositoryV1,
} from "@agentplat/collective-membership";

const registry = await InMemoryCollectiveMembershipRegistryV1.create({
  configurations: [initialConfiguration],
});
const repository = new InMemoryCollectiveMembershipRepositoryV1();
await repository.initialize(initialConfiguration);

const host = new CollectiveMembershipHostV1({
  client: { scope, signing, registry, repository, transport, clock },
  peer: { scope, signing, registry, repository, clock },
});
```

Expose `host.peer` through `handleCollectiveMembershipHttpRequestV1`, or supply
another `CollectiveMembershipTransportV1`. Use
`@agentplat/collective-membership-postgres` when votes and configuration heads
must survive process restarts.

## Quorum continuity

The registry implements the optional membership port in
`@agentplat/collective-quorum`. When supplied as both `resolver` and
`membership`, every assignment or recovery operation is pinned to the
configuration effective at its starting logical time:

```ts
const quorumOptions = {
  scope,
  signing,
  resolver: registry,
  membership: registry,
  repository: quorumRepository,
  clock,
};
```

Later membership commits do not rewrite an active operation's peer set.
Historical configurations remain available, while removed and retiring keys
remain verifiable only through their bounded validity interval.

## Fault model

The protocol fails closed on invalid signatures, expired envelopes, stale or
forked configuration digests, insufficient old or new majorities, conflicting
votes, wrong audiences, and unrecognized peer instances. It tolerates crashes,
restarts, message loss, reordering, and minority partitions under an
authenticated non-Byzantine voter model. It does not discover endpoints,
protect private keys, or claim Byzantine consensus.

See [Dynamic Membership and Key Rotation V1](../../docs/agent-mesh/dynamic-membership-key-rotation-v1.md)
for the state machines and operational rules.
