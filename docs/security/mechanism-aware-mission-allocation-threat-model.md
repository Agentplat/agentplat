# Mechanism-aware mission allocation threat model

## Protected assets

- semantic work-slot constraints and causal dependencies;
- sealed commitments, reveals and deterministic clearing inputs;
- bounded cost, budget, resource and concentration policy; and
- separation between allocation advice and assignment authority.

## Trust boundaries

Identity and membership are supplied by the host environment. Declared utility,
cost, capacity and budget are claims, not measured truth. Team formation and Work
Contracts remain the authority boundary after allocation. The production store
is trusted to keep a monotonic head outside the replaceable snapshot.

## Threats and mitigations

| Threat                                             | Mitigation                                                                                                      |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Caller acts as another peer                        | Required admission verifier binds the event to peer, instance, group, membership and capabilities.              |
| Bid changed after observing another reveal         | Slot-bound commitment hash and separate logical commit/reveal windows.                                          |
| Same bidder submits alternatives                   | One commitment and reveal per bidder, slot and round; conflicts record equivocation.                            |
| One peer or group captures the plan                | Per-peer, resource and independence-group concentration limits.                                                 |
| Dependency order ignored                           | Clearing selects only iteratively ready slots and preserves dependency bindings.                                |
| Withdrawal resets unrelated work                   | A new causal round reopens only the withdrawing peer's affected selected slots.                                 |
| Advisory result starts execution                   | Projection re-enters normal team formation and still requires individual Work Contracts.                        |
| Snapshot rollback changes the clear                | Revision-and-digest CAS, replay validation and a required external monotonic head.                              |
| Fabricated digest-valid snapshot reaches formation | Exact events and admissions are retained, reauthenticated and checked against allocation plus formation policy. |

## Residual risks

Authenticated peers can misreport utility or capacity, collude, or operate through
multiple admitted identities. Deadline consistency depends on the deployment's
logical-time discipline. A store without its required external monotonic head
can restore an older internally valid prefix. V1 is anti-front-running, not
strategy-proof.
