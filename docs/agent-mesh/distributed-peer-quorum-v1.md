# Distributed Peer Quorum V1

## Purpose

The collective peer node already signs allocation, lease and recovery records,
but it intentionally refuses productive execution without two application
ports: semantic assignment confirmation and threshold-certified recovery
selection. Distributed Peer Quorum V1 implements those ports without a global
scheduler, database-derived authority or permanent leader.

## Components

Each peer runs the same four roles:

1. a `CollectivePeerNodeRuntimeV1` holding the admitted Mesh projection;
2. a quorum acceptor that reads that projection as semantic evidence;
3. a durable peer-local quorum repository;
4. a per-operation proposer used when the local node needs a certificate.

The proposer role is temporary. Any peer can retry with a higher ballot after a
timeout or partition. PostgreSQL may be shared operationally, but all locks and
rows are scoped by tenant, mesh, peer, policy domain and decision scope.

## Assignment confirmation

The assignee sends the same signed request to the owner and configured
witnesses. An attester answers only if its durable node projection contains the
exact accepted assignment and current lease:

- objective and Work revisions;
- owner and assignee identities;
- assignment authority and epoch;
- fencing token and acceptance message;
- latest lease renewal and unexpired lease head.

Transport delivery is not acknowledgement. The owner attestation and a strict
majority of matching witness attestations form the certificate. Conflicting
values for the same lease slot are rejected durably.

## Recovery selection

Recovery is a single-decree, two-phase consensus instance keyed by the existing
recovery scope digest.

### Prepare and promise

The proposer obtains a durable ballot `(counter, proposerPeerId)` and sends a
signed prepare request. Each witness atomically persists the highest promised
ballot and returns its previously accepted ballot/value, if one exists. Ballots
are ordered first by counter and then by proposer identity, so concurrent
proposers remain totally ordered without a leader service.

### Accept and accepted

After a strict-majority promise quorum, the proposer must carry forward the
value with the highest accepted ballot. If no value was previously accepted,
it ranks the locally admitted candidates by a deterministic digest of the
scope and candidate identity. Witnesses accept only values present in their own
durable Mesh projection and never accept below their promise or two values in
one ballot.

A strict-majority accepted set is a recovery certificate. Different proposers
may collect different signed proof sets for the same value. The collective node
therefore compares recovery extensions by semantic scope and selected value,
while the configured quorum port validates threshold, membership, freshness
and signatures locally.

## Failure behavior

| Condition                                      | Result                                                    |
| ---------------------------------------------- | --------------------------------------------------------- |
| Invalid signature, key binding or audience     | rejected before evidence lookup                           |
| Expired request or response                    | rejected                                                  |
| Owner acknowledgement without witness majority | no assignment confirmation                                |
| Minority network partition                     | no recovery certificate                                   |
| Acceptor restart                               | promise and accepted value reload from PostgreSQL         |
| Concurrent proposers                           | higher ballot preempts; accepted value is carried forward |
| Conflicting value in the same ballot           | rejected without invoking the signer                      |
| Candidate missing from local Mesh evidence     | witness abstains                                          |

Safety is fail-closed. Availability requires a reachable strict majority and
converged candidate evidence. The protocol does not infer completeness from a
quiet window or prefer the first arrival.

## Trust boundary

V1 addresses crash/restart faults, partitions, duplicate/reordered delivery and
auditable equivocation by correctly operating peers. It does not claim
Byzantine consensus: majority thresholds alone are insufficient for arbitrary
malicious acceptors. Deployments needing Byzantine fault tolerance must use a
different quorum policy and certificate verifier behind the same node ports.

Private keys remain outside repositories. Discovery, membership changes,
transport-channel credentials, key rotation, rate limiting and public endpoint
protection are host responsibilities.
