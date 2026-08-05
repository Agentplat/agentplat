# `@agentplat/collective-quorum`

Signed, provider-neutral peer quorum protocols for `CollectivePeerNodeRuntimeV1`.
The package supplies the two production ports that the peer node deliberately
leaves open:

- assignment confirmation requires a semantic attestation from the owner and
  a strict majority of configured witnesses over the same acceptance, lease,
  assignment epoch and fencing token;
- recovery election uses durable `prepare`/`promise` and `accept`/`accepted`
  phases. Every acceptor promises and votes atomically, so a restart cannot
  erase the information that prevents a conflicting decision.

Every request and response is an Ed25519-signed canonical JSON document bound
to tenant, mesh, peer, process instance, audience and expiry. The package
reuses the Mesh key resolver, but has an independent protocol envelope and does
not change the closed Mesh wire-version contract.

## Composition

Create one repository, client and acceptor endpoint per peer. The client is a
per-operation proposer, not a permanent leader.

```ts
import {
  CollectivePeerQuorumHostV1,
  CollectiveQuorumHttpTransportV1,
} from "@agentplat/collective-quorum";

const transport = new CollectiveQuorumHttpTransportV1({
  endpointForPeer: (peerId) => peerEndpoints.get(peerId),
});

const host = CollectivePeerQuorumHostV1.create({
  client: { scope, signing, resolver, repository, transport, clock },
  peer: { scope, signing, resolver, repository, clock },
  createNode: ({ assignmentConfirmation, recoveryElection }) =>
    new CollectivePeerNodeRuntimeV1({
      ...nodeOptions,
      assignmentConfirmation,
      recoveryElection,
    }),
});
```

Expose `host.quorumPeer` with `handleCollectiveQuorumHttpRequestV1`, or provide
another implementation of `CollectiveQuorumTransportV1`. The WHATWG Fetch
adapter is usable in Node and edge runtimes. Authentication of the transport
channel may be added by the host, but it never replaces document signature
verification.

For a durable deployment, use
`PostgresCollectiveQuorumRepositoryV1` from
`@agentplat/collective-quorum-postgres`. The in-memory repository has identical
atomic semantics but loses promises and votes when the process exits.

## Byzantine-resilient agreement (opt in)

Deployments whose admitted-validator fault model includes arbitrary or
malicious behavior can use the separate
`@agentplat/collective-quorum/agreement` entry point. It adds `3f + 1`
membership bindings, `2f + 1` prevote/precommit certificates, durable locks,
equivocation evidence, joint reconfiguration and certified catch-up. Importing
or using the root entry point does not enable or alter this protocol.

See
[Byzantine-resilient collective agreement V1](../../docs/agent-mesh/byzantine-resilient-collective-agreement-v1.md)
for integration and operations guidance.

The `@agentplat/collective-quorum/role-realignment` entry point maps a
content-free role selection to the same agreement protocol. Its certificate
binds membership epoch and configuration, and only Trust-eligible precommit
signers count as role-certification witnesses. Agreement never transports role
instructions or grants action authority. See [Adaptive Role Realignment
V1](../../docs/inference-control/adaptive-role-realignment-v1.md).

The `@agentplat/collective-quorum/role-refinement` entry point certifies both
governed publication and rollback of an exact role revision. Agreement values
carry only action, revision and digest bindings; local validators must resolve
the exact patch and definition before voting. Only Trust-eligible precommit
signers count as certification witnesses. See [Certified Role Refinement
V1](../../docs/inference-control/certified-role-refinement-v1.md).

## Safety and availability

- Witness thresholds must be strict majorities. Duplicate witnesses, owners or
  assignees in the witness set are rejected.
- An acceptor signs at most one value for a ballot and never accepts a ballot
  below its durable promise.
- A new proposer carries forward the value with the highest previously
  accepted ballot returned by its promise quorum.
- Assignment attestations are non-equivocating per lease version.
- Invalid signatures, wrong audiences, expired envelopes, missing semantic
  evidence and minority partitions fail closed.
- When the optional readiness port is configured, an acceptor refuses
  assignment attestations, recovery promises, and recovery acceptances until
  its local causal frontier has a current membership-bound catch-up
  certificate.
- Independent peers may assemble different proof sets for the same selected
  value. The node treats those certificates as semantically equivalent while
  each port validates its own threshold evidence.

The root protocol tolerates crashes, restarts, message loss, reordering and
minority partitions under an authenticated non-Byzantine acceptor model. It is
not itself a Byzantine-fault-tolerant consensus protocol; use the opt-in
agreement entry point for that fault model. Neither protocol discovers peer
endpoints or makes external actions exactly once. Certified dynamic
membership and overlapping key rotation are available through the optional
membership port implemented by `@agentplat/collective-membership`.

See [Distributed Peer Quorum V1](../../docs/agent-mesh/distributed-peer-quorum-v1.md)
for the state machines and operational invariants.
