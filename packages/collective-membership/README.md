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

## Governed agent creation

`./agent-lineage` defines certified parent/child lineage, attenuated authority,
capability and budget inheritance, bounded generations, enrollment, and
cascading termination. `./agent-factory` supplies a reference material factory
that revalidates those bindings against current lineage before provisioning.

The factory writes a content-digested CAS reservation before crossing external
boundaries. Portable identity and Ed25519 custody ports receive the stable
request digest as their idempotency operation ID; private key material never
enters factory or lineage state. A completed ledger record binds the runtime
attestation, public key, creation certificate, parent lineage and factory
implementation into the standard `AgentFactoryReceiptV1`.

The reservation also retains the original authorized logical time and exact
wall-clock key interval. An exact retry may finish with that plan only while
both the authorization and resulting key material remain valid; it never
re-certifies at a later time or extends the interval. Once either boundary has
expired, the factory CAS-fences the reservation, reconciles identity and key
custody by the original operation ID, and records a terminal cancellation in
both the factory ledger and lineage creation saga. Cleanup ports must therefore
fence an operation even when no material handle was journaled: a concurrent or
previously unobserved provision cannot materialize after cancellation wins.

Production embeddings must provide a durable `GovernedAgentFactoryStoreV1`, a
durable `AgentLineageStoreV1`, an authenticated certification verifier, and
idempotent identity/key-custody implementations. The in-memory store is only a
single-process reference; `@agentplat/collective-membership-postgres` provides
both durable stores. `expireReservations()` fences expired work before asking
the idempotent ports to clean up partial material. Termination revokes key
custody before terminating the runtime identity. Key rotation remains on the
certified membership transition path; the factory deliberately does not mutate
lineage or membership keys independently.

`./governed-agent-lifecycle` provides the reference composition for that
boundary. `ReferenceAgentMembershipEnrollmentPortV1` converts lineage joins and
removals into quorum-certified membership transitions, while
`GovernedAgentLifecycleRuntimeV1` exposes create-and-enroll, idempotent
retirement, and an eligibility decision that requires both active lineage and
current membership. The membership configuration in an agent-creation
certificate is the quorum configuration that authorized creation; the joined
agent becomes active in its certified successor epoch.

Both lineage and lifecycle runtimes use capability authenticity rather than
structural typing at the closed composition boundary. A module-private nominal
brand identifies instances constructed by the package, and module-owned
invokers address their retained implementations directly. Store, factory,
certification, enrollment, registry and telemetry method capabilities are
captured with their exact receiver at construction. Subsequent monkey-patching,
subclass dispatch, object substitution or property rebinding therefore cannot
alter lineage/lifecycle authority or create a time-of-check/time-of-use gap.
Lifecycle construction rejects a structurally similar lineage object and all
nominal accessors fail closed for clones and prototype-only instances.

Termination persists the exact configuration digest and epoch of the certified
successor that first excluded each active peer in its lineage record. Later
retries return that stable binding even if unrelated membership transitions
advance the collective. Before crossing the membership or factory boundary,
the lineage runtime persists a CAS-fenced `retiring` reservation. Concurrent
retirement attempts therefore cannot repeat those effects or replace the
receipt written by the reservation owner. A suspended or revoked agent whose
runtime material was already disabled uses `completeRetirement()` to finish its
certified membership exclusion without invoking factory cleanup again.

If a process stops after reserving retirement, or after membership removal but
before lineage finalization, later attempts fail closed and require
reconciliation with the original transition evidence. The runtime never
guesses whether an external effect ran and never substitutes a newer epoch as
the retirement receipt.
