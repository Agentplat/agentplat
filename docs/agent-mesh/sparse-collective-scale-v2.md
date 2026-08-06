# Sparse collective scale V2

## Capability

Sparse collective scale V2 adds a production-facing overlay planner to
`@agentplat/mesh`. It lets independently executing peers derive bounded local
views, replace unavailable neighbors, and disseminate content-free update
references without materializing a global membership or edge list.

The overlay is additive. Existing Mesh peer, discovery, coordination, wire and
simulation contracts remain byte-for-byte V1 compatible. The public API is
available from `@agentplat/mesh/overlay` and uses only industry terminology.

## Scale profiles

The closed profiles bind the population and collective interaction ceiling:

| Profile           |   Peers | Interactions | Active neighbors | Reserve neighbors |
| ----------------- | ------: | -----------: | ---------------: | ----------------: |
| `standard-500`    |     500 |        5,000 |   `ceil(log2 N)` |    `ceil(log2 N)` |
| `large-5000`      |   5,000 |       50,000 |   `ceil(log2 N)` |    `ceil(log2 N)` |
| `frontier-100000` | 100,000 |    1,000,000 |   `ceil(log2 N)` |    `ceil(log2 N)` |

Each peer receives an exact local outbound share of the collective interaction
ceiling. When every peer uses one construction-bound routing state, the sum of
all possible outbound deliveries cannot exceed the profile ceiling. This bound
applies to conformant overlay output; an authenticated transport must separately
rate-limit hostile peers that ignore the runtime.

## Local views

`createMeshSparsePeerViewV2()` derives only the calling peer's active and
reserve neighbors from its index, the profile and a topology seed. The view
contains no peer array, edge array, route registry or complete membership
projection. A ring successor plus deterministic affine jumps provides a
connected sparse base without allocating `O(N)` state.

`refreshMeshSparsePeerViewV2()` accepts a bounded, locally decided exclusion
set. Advancing the deterministic view window promotes eligible reserve
candidates ahead of newly derived candidates and fills the remaining capacity.
Every accepted view is reconstructed exactly from its profile, seed, revision
and exclusions; its digest alone is not treated as proof of a valid topology.
The function does not decide whether a peer failed or is malicious; callers
must supply that decision from authenticated liveness, Trust or quorum
evidence.

## Incremental dissemination

`createMeshSparseRoutingStateV2()` binds one view to:

- a monotonic origin sequence;
- a bounded recent-update window;
- a monotonic logical clock; and
- the peer's exact outbound interaction budget.

`publishMeshSparseUpdateV2()` creates a digest-only update and a bounded set of
delivery plans. `receiveMeshSparseDeliveryV2()` validates the update and
delivery chain, deduplicates it, records it under a hard capacity limit and
prepares the next bounded fanout. Every forward hop binds the previous delivery
digest and the sender's exact local-view digest.

The overlay never transports raw payloads, invokes a network, verifies a
signature or grants authority. A host must carry every planned delivery through
an authenticated Mesh transport and apply the referenced content through its
normal domain reducer. An overlay update is routing evidence only: it cannot
install a role, Trust decision, lease, mandate, certificate or protected
action.

## Complexity and bounds

- local neighbor state is `O(log N)`;
- topology derivation is on demand and never allocates the global graph;
- fanout is bounded per accepted update;
- hop count and update retention are bounded by the selected profile;
- duplicate deliveries do not forward again; and
- outbound interaction accounting is enforced locally and sums to the closed
  collective ceiling.

The reference surface is deterministic and side-effect free. Persistence,
transport retry, authenticated admission, rate limiting and scheduling remain
explicit host responsibilities.

## Security boundaries

| Threat                             | Boundary                                                                                       |
| ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| Global membership oracle           | No API returns a peer or edge collection; one view is derived on demand.                       |
| Gossip amplification               | Fanout, hop count, recent-update capacity and outbound quota are hard profile bounds.          |
| Replay and forwarding cycles       | Content-bound update IDs are retained locally; duplicates never forward.                       |
| Delivery-chain rewriting           | Every hop binds the update, sender view and previous delivery digest.                          |
| Arbitrary hashed topology          | Validation reconstructs the exact deterministic view before accepting it.                      |
| Raw-content or authority injection | Updates carry a payload digest only and cannot authorize any domain transition.                |
| Quota reset after restart          | Hosts must restore and validate the durable routing state instead of constructing a fresh one. |
| Malicious peer bypass              | Mesh admission, authenticated transport and ingress rate limits remain mandatory.              |

Peer indexes and topology seeds must be bound to the authenticated membership
epoch by the host. A peer may not select a new index, seed or routing state to
obtain another quota. The overlay state digest is a deterministic integrity
binding, not a signature or storage rollback defense.

## Acceptance evidence

- Existing Mesh and progressive-scale V1 contracts are unchanged.
- All three profiles derive exactly `O(log N)` active and reserve views.
- Excluded neighbors cannot remain active or reserve after a revision.
- A valid update is accepted once per peer and duplicate cycles stop locally.
- A 5,000-peer deterministic propagation reaches every local view with 10,000
  accounted deliveries, below the 50,000-interaction profile ceiling.
- Progressive execution tiers bind exactly to their production overlay
  population, interaction and topology-degree limits.
