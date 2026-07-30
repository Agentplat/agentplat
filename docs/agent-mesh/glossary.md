# Agent Mesh glossary

This glossary defines the public vocabulary for Agent Mesh code,
documentation, examples, release notes and protocol fixtures.

| Term                     | Meaning                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Agent Mesh               | A set of independently executing peers that coordinate through bounded local state and a versioned protocol. |
| Mesh Peer                | One participating runtime instance with its own identity, policies, peer view and work journal.              |
| Peer Card                | A signed, expiring declaration of protocol versions, addresses and self-claimed capabilities.                |
| Peer View                | The bounded local set of active neighbors and passive candidates known to one peer.                          |
| Capability Advertisement | A signed, expiring self-claim that a peer supports one bounded capability contract.                          |
| Objective                | A signed goal with constraints, success criteria, budgets, risk policy and expiry.                           |
| Work Item                | A bounded unit of work derived locally from an Objective.                                                    |
| Work Offer               | A request for capable peers to propose execution of a Work Item.                                             |
| Work Bid                 | A peer's signed proposal with capability fit, capacity, estimates and assumptions.                           |
| Work Award               | The signed selection of an assignee for one Work Item revision.                                              |
| Assignment Authority     | The accepted award or recovery certificate that binds one assignment epoch and fencing token.                |
| Lease                    | Time-bounded authority to execute or coordinate a Work Item.                                                 |
| Epoch                    | A monotonically increasing generation for assignment and recovery.                                           |
| Fencing Token            | A value that prevents a stale epoch from committing state or external actions.                               |
| Recovery Witness         | A peer named by Objective policy that may vote on one post-expiry takeover proposal.                         |
| Recovery Certificate     | A signed record containing a threshold of valid witness votes that fences an older assignment epoch.         |
| Work Journal             | Append-only local events used to project Work Item state and support recovery.                               |
| Evidence Claim           | A peer's signed statement about an observation or result, with provenance.                                   |
| Attestation              | A peer's independent support, contradiction or inconclusive evaluation of a claim.                           |
| Fusion Decision          | A local result produced from claims, attestations and an explicit evidence policy.                           |
| Trust Profile            | A local, capability-scoped estimate with multiple dimensions, uncertainty and decay.                         |
| Quarantine               | Temporary, scoped isolation after locally verifiable policy conditions are satisfied.                        |
| Inference Control        | Local context, output and action evaluation around an agent execution.                                       |
| Inference Assessment     | A structured allow, revise, retry, abstain, escalate or deny result.                                         |
| Action Gateway           | The local enforcement boundary for tools and other external effects.                                         |
| Action Grant             | Short-lived, scoped authority to execute one action under a valid epoch and policy.                          |
| Control Plane            | Optional services that configure, start or observe a Mesh without owning steady-state coordination.          |
| Observability Plane      | Optional event, audit and metrics consumers that do not determine Mesh behavior.                             |
| Resilience Lab           | The deterministic simulator, fault catalog, invariant suite and benchmark harness.                           |

Avoid language that implies a global brain, global truth, global reputation,
exactly-once delivery or universal safety guarantees.
