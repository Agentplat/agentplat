# Collective capability closure V1: architecture and threat model

Status: Implemented software contract; runtime validation is tracked separately.

## Scope and composition

This document describes the composed boundary for Operational Sparse Peer Plane
V1, Autonomous Mission Planning Loop V1, Certified Context Fusion V1,
Distributed Team Allocation V2, Compromise-Aware Recovery V1, Semantic
Alignment & Agility Control V1, Coordination-Control Guarantee Contract V1,
and Heterogeneous Agent Composition V1.

The operational extension adds causal collective messaging, distributed
planning and settlement, live sparse agreement, bounded partial-view committee
formation, assurance-coupled effects, autonomous mission adaptation, durable
storage, cryptographic adapters and agent/simulator interoperability.

```text
admitted local peer view
  -> local planning and context fusion
  -> mechanism allocation events -> certified roster decision
  -> team formation -> current Work Contracts -> activation/execution
  -> checkpoint/recovery and control feedback
  -> guarantee gate -> bounded next planning window
```

The arrows are data and control boundaries, not authority transfer. There is no
global graph, global scheduler, universal membership query, or implicit
provider runtime. Peers use bounded local views, explicit transport/admission
ports, and current domain records.

## Public implementation inventory

| Capability                                 | Public entrypoint                                                                                                                 |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Operational Sparse Peer Plane V1           | `@agentplat/mesh/overlay` and `@agentplat/collective-runtime/sparse-peer`                                                         |
| Autonomous Mission Planning Loop V1        | `@agentplat/collective-runtime/autonomous-mission-loop`                                                                           |
| Certified Context Fusion V1                | `@agentplat/collective-quorum/mission-context-fusion`                                                                             |
| Distributed Team Allocation V2             | `@agentplat/collective-runtime/distributed-team-allocation`                                                                       |
| Compromise-Aware Recovery V1               | `@agentplat/collective-runtime/compromise-aware-recovery`                                                                         |
| Semantic Alignment & Agility Control V1    | `@agentplat/inference-control/semantic-alignment`                                                                                 |
| Coordination-Control Guarantee Contract V1 | `@agentplat/collective-runtime/coordination-control-guarantees`                                                                   |
| Heterogeneous Agent Composition V1         | `@agentplat/inference-control/semantic-alignment`                                                                                 |
| Causal Collective Messaging V1             | `@agentplat/collective-host/distributed-protocol`                                                                                 |
| Distributed Planning and Settlement V1     | `@agentplat/collective-host/distributed-planning`                                                                                 |
| Sparse Round/View Agreement V1             | `@agentplat/collective-quorum/sparse-agreement-runtime`                                                                           |
| Partial-View Committee Convergence V1      | `@agentplat/collective-quorum/partial-view-agreement`                                                                             |
| Assurance-Coupled Execution V1             | `@agentplat/collective-host/assurance-coupled-execution`                                                                          |
| Autonomous Collective Adaptation V1        | `@agentplat/collective-host/autonomous-adaptation`                                                                                |
| Controlled Cognitive Adapters V1           | `@agentplat/inference-control/cognitive-adapters`                                                                                 |
| Durable and Cryptographic Adapters V1      | `@agentplat/collective-host-postgres`, `@agentplat/collective-quorum-postgres`, and both `./webcrypto-ports` entrypoints          |
| Agent and Simulator Interoperability V1    | `@agentplat/interop`, `@agentplat/interop/http` and the governed reference composition in `@agentplat/interop/governed-lifecycle` |
| Authenticated Overlay Transport V1         | `@agentplat/mesh/overlay-transport`                                                                                               |
| Anytime Semantic Horizon V1                | `@agentplat/inference-control/semantic-guarantees` and `@agentplat/collective-host/semantic-horizon-coupling`                     |
| Governed Agent Factory V1                  | `@agentplat/collective-membership/agent-factory`                                                                                  |
| Content-Free Collective Telemetry V1       | `@agentplat/audit/collective-telemetry` and `@agentplat/collective-host/collective-telemetry`                                     |
| Cross-Capability Invariant Guard V1        | `@agentplat/collective-runtime/collective-invariants`                                                                             |

This inventory asserts source/API coverage, not empirical performance. Builds,
consumer checks, fault-injection scenarios and scale evaluation are separate
release gates.

## Capability responsibilities

| Capability                                 | Input boundary                                                                                  | Output                                                     | Fail-closed behavior                                                                                                                  |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Operational Sparse Peer Plane V1           | authenticated peer/discovery records and local exclusions                                       | bounded active/reserve peer view                           | stale, unauthenticated or capacity-exhausted records are excluded                                                                     |
| Autonomous Mission Planning Loop V1        | admitted observations, mission policy and Work state                                            | proposals, plan heads and replanning inputs                | stale/head-conflicting inputs cannot create or revive Work                                                                            |
| Certified Context Fusion V1                | validated Trust fusion/profile/eligibility projections plus authenticated mission-scope binding | certified planning context or unresolved result            | missing coverage, scope mismatch, expiry or conflicting projections are unresolved                                                    |
| Distributed Team Allocation V2             | planning positions, admitted allocation events, current auction fence and roster certificate    | formed/activated team or reallocation request              | retired/wrong-round plans, incomplete allocation, roster mismatch, rejected formation or expired activation block, cancel or withdraw |
| Compromise-Aware Recovery V1               | verified compromise verdict, takeover proposals and current authority/membership/availability   | fenced checkpoint restore, reauction or replanning result  | uncertain provenance, invalid election or stale fence requires recovery halt                                                          |
| Semantic Alignment & Agility Control V1    | bounded assessment signals                                                                      | continue/restrict/adapt/replan recommendation              | insufficient or degraded evidence restricts dispatch                                                                                  |
| Coordination-Control Guarantee Contract V1 | verified guarantee and planning target                                                          | allow/deny gate and effective window                       | missing, stale, incompatible or equivocal input denies dispatch                                                                       |
| Heterogeneous Agent Composition V1         | portable agent, assessor and intervention adapters                                              | controlled execution evidence                              | unsupported surface, unresolved assessment or intervention denial blocks the operation                                                |
| Causal Collective Messaging V1             | signed member message and content-addressed artifact                                            | admitted causal stream and durable delivery record         | wrong scope, sequence conflict, equivocation or invalid signature rejects the message                                                 |
| Distributed Planning and Settlement V1     | admitted decomposition, commitments, reveals and outcomes                                       | reconciled graph, allocation plan and settlement           | late, mismatched or unrevealed bids cannot receive an award                                                                           |
| Sparse Round/View Agreement V1             | membership-bound proposal and signed validator shares                                           | commit, reconciliation and finality certificates           | insufficient shares, lock conflict, equivocation or coordinate mismatch prevents finality                                             |
| Partial-View Committee Convergence V1      | bounded signed validator claims and independent witnesses                                       | certified sparse membership                                | insufficient diversity, witnesses or candidate capacity leaves the view uncertified                                                   |
| Assurance-Coupled Execution V1             | exact task/award/finality plus measured cognitive result                                        | certified result/effect receipt                            | any plan, guarantee, assessment, finality or effect-binding mismatch blocks commit                                                    |
| Autonomous Collective Adaptation V1        | bounded causal mission signals                                                                  | finalized and applied mission/strategy/role/team change    | threshold, cooldown, safety, finality or saga failure prevents or compensates the change                                              |
| Agent and Simulator Interoperability V1    | complete validated manifest/role plus signed request and scoped lifecycle grant                 | fenced effect commit and content-bound idempotent response | unsupported operations, changed retries, invalid envelope, stale effect fence or oversized response fail closed                       |

## Trust boundaries

### Local policy and configuration

The application installs identities, policy digests, capability bindings,
membership source, logical clock, limits, storage, monotonic anchor, certificate
verifier, and provider adapters. Remote records cannot widen these values. A
configuration change requires a new bound policy/state generation; it is not an
in-place remote update.

### Network, peer and planning boundary

Transport may delay, duplicate, reorder, omit or replay messages. Peers may
provide false capability, bid, context or planning claims. Admission,
signature/key verification, replay protection, digest binding, expiry and
local policy checks occur before a record affects a local projection. Planning
and allocation data do not create assignment, lease, budget or effect
authority.

### Certification and evidence boundary

Context fusion, roster certification and control guarantees trust only their
configured verification ports. A digest demonstrates identity of bytes, not
truth, freshness, independence or authorization. Production verifiers must
authenticate the relevant membership, source implementation, scope, epoch and
validity interval.

Planning consumes certified context by opaque resolution digest. The adapter
reloads the current repository head and exact Trust decision, recomputes both
content bindings and reauthenticates the certificate immediately before
projection. Team execution consumes a coordination-control guarantee only after
an authenticated lookup returns a durable delivery receipt bound to the exact
proposal and locally configured control identity. Neither boundary accepts
caller-authored records as proof of certification or delivery.

### Execution and recovery boundary

Team activation validates exact current Work Contracts. Execution continues
through the existing assignment, lease, generation and fencing checks.
Recovery validates checkpoint lineage and current authority before restore.
Neither a roster certificate, a guarantee, a checkpoint, nor a provider result
can bypass these boundaries.

The governed interoperability reference path separates pure effect preparation
from effect commit. It revalidates the exact session grant after preparation
and supplies the commit port with a content-bound intent plus scope revision,
membership epoch, scope digest and admission-binding digest. Production commit
ports must compare and consume that fence atomically with the external effect;
preparers are not an effect boundary.

## Durable-control requirements

State snapshots bind identity, scope, policy/proposal/plan digests, revision,
logical-time high-water and predecessor digest. Writers use revision-and-digest
CAS. Stable operation identifiers make retries idempotent; reuse with changed
content is equivocation and is rejected. Where a monotonic anchor is configured,
an older restored snapshot cannot advance past the independent witness.
The autonomous mission loop reads state and anchor as one consistent pair and
advances them atomically. Its production anchor is independently keyed on a
monotonic protection boundary outside the replaceable Mesh snapshot. Missing
or divergent halves fail closed; neither the runtime nor its durable adapter
derives or repairs the anchor from snapshot contents.
Compromise-aware recovery applies the same strict rule: its store must commit the
state and rollback-resistant anchor atomically, and any mismatch fails closed
without attempting anchor repair. Reads return one consistent state/anchor
pair, while the production anchor resides on a monotonic protection boundary
that is independent of ordinary snapshot rollback.

Fencing is end-to-end: allocation state, auction digest, round and plan digest
form one durable allocation fence; the formation authorization commits that
fence together with the certified decision and exact request. The activation
boundary atomically consumes it and exposes idempotent reconciliation and
cancellation so a crash cannot leave an untracked active team. Decision scope
and epoch fence certification; Work Contract assignment epoch, generation,
lease and token fence activation/effects; checkpoint lineage and authority
coordinates fence recovery. An adapter must read current durable coordinates
rather than serve a cached predecessor. Formation proposals are accepted only
when their members correspond one-to-one to the exact retained bids, which are
themselves reconstructed from the current allocation plan. Initial team,
member and selection identities are reconstructed canonically at epoch 1 with
no predecessor. A formation commit that precedes a coordinator crash is
reconciled from the current Team proposal by exact request/proposal digest;
`lastDecision` is not an ownership signal because another request may overwrite
it while that Team remains non-terminal. It is used only to compare a direct
formation response when no Team proposal exists to reconcile. Cleanup uses
proposal-conditional CAS cancellation so it cannot cancel a concurrently
installed replacement.

Cleanup also commits a request tombstone, bound to the formation authorization
and request validity window, before authorization is cleared or withdrawal is
emitted. Team Formation checks it within the Team-creation CAS, closing the
empty-read versus late-form race. Unexpired tombstones are retained across
handoff; only validity-expired entries below the logical-time high-water may be
compacted, and a full configured tombstone capacity fails closed.

Activation cleanup is ordered: revoke the exact activation-boundary contract
first, then invalidate the formation request, then close the exact Formation
Team. Authorization state is cleared only after all idempotent operations
succeed.

## Required production adapter responsibilities

- perform authenticated ingress and certificate/evidence verification;
- persist CAS state atomically and retain rollback-resistant anchors where the
  contract requires them;
- supply trusted monotonic logical time and enforce record expiry;
- preserve stable idempotency keys across retries, bind authorization to the
  exact sink identity/key, make effect sinks fencing aware and ensure replicas
  of one sink identity share the same atomic idempotency store;
- implement the distributed-team activation boundary with an atomic current-
  allocation-fence check plus strongly consistent, idempotent reconcile/cancel;
- resolve current membership, Work Contracts, capabilities and provider
  identities from authoritative sources;
- enforce bounded queues, byte/cardinality limits, redaction and rate limits;
- treat provider/model output as untrusted input and retain only permitted
  references, digests, counters and reason codes in durable control state.

## Threats and required controls

| Threat                                                                                | Control                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stale or replayed peer/context/allocation record                                      | expiry, replay high-water, canonical digest and scope/epoch binding                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Fabricated certified context or guarantee gate                                        | opaque digest lookup, current-head validation, certificate reauthentication and authenticated delivery receipt bound to configured consumer identity                                                                                                                                                                                                                                                                                                                                                          |
| Crash after certified sparse exclusion                                                | certificate-keyed duplicate recognition before the original revision fence, sparse-view reconciliation and retention of the original application receipt                                                                                                                                                                                                                                                                                                                                                      |
| Conflicting source revision or mutable retry                                          | source head plus idempotency record; conflict fails closed                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Allocation or roster substitution                                                     | retained certified decision, reauthentication before effects, plan/decision/request authorization digest, selection-to-candidate checks and Work Contract activation checks                                                                                                                                                                                                                                                                                                                                   |
| Late Team Formation CAS after coordinator cleanup                                     | authorization-bound request tombstone checked inside the formation CAS; unexpired retention across handoff; bounded capacity fails closed                                                                                                                                                                                                                                                                                                                                                                     |
| Rejected or expired team member                                                       | authenticated withdrawal, new allocation round and fresh formation/activation                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Rollback after restart/failover                                                       | CAS predecessor chain, logical high-water and monotonic anchor where required                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Late effect after reassignment                                                        | current assignment/lease/generation/fencing validation at the effect boundary                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Provider adapter overreach                                                            | narrow provider-neutral port; adapter output is evidence, never authority                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Semantic decision replay, fabricated/stale action permit or duplicate external effect | material plus bounded full-action payload digests in the request; fail-closed external verdict validation; an authenticated authority lookup binding allow decision, policy, assessor set, consumer, exact sink identity/key, revision and expiry; direct and heterogeneous dispatch use trusted monotonic effect time independent of request time plus the configured authenticated sink, whose replicas share one atomic store keyed by authorization digest and return the original receipt on exact retry |
| Portable lifecycle churn exhausts a control clock                                     | control sequences derive from bounded execution step ordinals; composition proves policy capacity before accepting a route                                                                                                                                                                                                                                                                                                                                                                                    |
| Capacity flood or global-view extraction                                              | hard limits, backpressure, bounded local views and no global graph API                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| False consensus inference                                                             | explicit round/view, membership and certificate verification; unresolved or insufficient evidence never becomes an agreement claim                                                                                                                                                                                                                                                                                                                                                                            |
| Compromised recovery source                                                           | checkpoint provenance, current authority/membership verification and fenced restore                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Limits and non-promises

The architecture does not promise a complete global topology, a globally
optimal allocation, universal semantic correctness, truthful capability claims,
partition availability, collusion resistance, Byzantine safety outside the
configured membership, threshold, independence and key-custody assumptions,
atomic recovery of an
ambiguous external effect, or safety from a compromised production adapter.
Exactly-once external action effects are conditional on an effect sink that
atomically co-locates its authorization-digest idempotency record with the
effect; a gateway cannot add that atomicity to an arbitrary downstream service.

It does not include a central or global scheduler. Peer hosts and the autonomous
adaptation runtime decide when to invoke bounded local ports; the contracts
require that duplicate, delayed and restarted invocations remain bounded,
idempotent where supported, and conservatively rejected when current
coordinates cannot be established.
