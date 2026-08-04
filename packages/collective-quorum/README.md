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
- Independent peers may assemble different proof sets for the same selected
  value. The node treats those certificates as semantically equivalent while
  each port validates its own threshold evidence.

This protocol tolerates crashes, restarts, message loss, reordering and
minority partitions under an authenticated non-Byzantine acceptor model. It is
not a Byzantine-fault-tolerant consensus protocol, does not discover peer
endpoints, and does not make external actions exactly once. Certified dynamic
membership and overlapping key rotation are available through the optional
membership port implemented by `@agentplat/collective-membership`.

See [Distributed Peer Quorum V1](../../docs/agent-mesh/distributed-peer-quorum-v1.md)
for the state machines and operational invariants.
