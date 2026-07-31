# Agent Mesh `0.3.0-alpha.2` implementation plan

Status: Increments 0 and 1 are complete. Increment 2 Objective/Work and its
authenticated ingress are complete. The bounded owner and assignee allocation
handshakes are complete, including the initial execution lifecycle for
`work.progress`, `work.checkpoint`, `work.result`, `work.release` and
`work.cancel`. Lease renewal, reassignment, certified recovery, resilience
simulation and release publication remain pending.

This plan turns the allocation and recovery milestone into reviewable,
independently testable increments. It extends the four Agent Mesh packages
released in Alpha 1 without changing the default behavior of Runtime, Sessions,
Rooms or Framework.

## Release outcome

`0.3.0-alpha.2` is complete when a clean consumer can install the coordinated
package tarballs and run both of these deterministic workflows:

1. peers discover bounded capability declarations, allocate one Work Item
   through offer, bid, award and acceptance, and accept a result only from the
   current leased assignee; and
2. a partitioned or crashed assignee loses authority after lease expiry, a
   witness certificate fences the stale epoch, and a replacement completes the
   Work Item without the stale assignee mutating accepted state.

The release keeps:

- fixed version `0.3.0-alpha.2` across every public package;
- npm distribution tag `next`;
- protocol `agentplat.mesh`;
- `wireVersion: 0`;
- at-least-once delivery;
- the Alpha 1 pure reducer and effect boundary;
- deterministic simulation as the executable resilience specification.

## Fixed design decisions

| Area          | Alpha 2 decision                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Membership    | Every peer has a bounded, partial local view. No API reports complete Mesh membership.                                                |
| Admission     | Discovery never grants admission. Key binding and local admission remain prerequisites.                                               |
| Capabilities  | Advertisements are signed, expiring self-claims. Bids and observed results provide separate evidence.                                 |
| Allocation    | Work is allocated by explicit offer, bid, award and acceptance records. There is no global scheduler.                                 |
| Authority     | Exactly one locally accepted assignment epoch and fencing token may authorize progress, checkpoints or results for a Work Item.       |
| Fencing token | The stable assignment authority ID is the token: `awardId` for an initial assignment and `certificateId` for a recovered epoch.       |
| Lease time    | Signed absolute timestamps define deadlines. Drivers supply trusted local time; reducers never read a host clock.                     |
| Recovery      | A fixed Objective witness set and threshold certify a new epoch after lease expiry plus recovery grace.                               |
| Owner failure | Alpha 2 recovers assignee execution. Work Item owner transfer and Objective issuer failover are deferred.                             |
| Persistence   | In-memory journals and simulation snapshots are supported. Production durable inbox, journal and checkpoint adapters remain deferred. |
| Fanout        | Senders select a bounded set from their local view. Protocol envelopes are not relayed transitively.                                  |
| Compatibility | Alpha 2 reads every Alpha 1 protocol and replay fixture and keeps the Alpha 1 public entrypoints.                                     |

## Package impact

No new public package is introduced.

| Package                    | Alpha 2 responsibility                                                                                                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@agentplat/mesh-protocol` | Closed payload schemas, bounds, validation and conformance fixtures for discovery, Objective, work and lease messages.                                                        |
| `@agentplat/mesh-crypto`   | Signing and verification fixtures for the new payload families; no new trust or key-bootstrap semantics.                                                                      |
| `@agentplat/mesh`          | Partial views, capability projections, Objective and Work Item reducers, allocation and initial execution lifecycle; lease renewal, reassignment and recovery remain pending. |
| `@agentplat/mesh-sim`      | Planned crash, loss, duplicate, reorder and partition faults plus allocation and recovery invariant suites.                                                                   |

Runtime dependencies continue to follow actual imports. Framework must not
depend on or re-export an alpha Mesh package.

## Alpha 2 scope

### Defined protocol message families

Alpha 2 defines these payload families as closed, bounded, structurally
validated and cryptographically signable. Runtime support is enabled only where
the corresponding increment has local state, authority and reducer support:

- `peer.card` and `peer.goodbye`;
- `capability.advertise` and `capability.withdraw`;
- `objective.announce`, `objective.revise` and `objective.cancel`;
- `work.offer`, `work.bid`, `work.award`, `work.accept` and `work.decline`;
- `work.progress`, `work.checkpoint`, `work.result`, `work.release` and
  `work.cancel`;
- `lease.renew`, `lease.takeover_proposal`, `lease.vote` and
  `lease.certificate` remain unsupported at the runtime boundary.

Alpha 1 `peer.hello`, `peer.ping` and `peer.ping_ack` behavior remains
unchanged.

At the runtime foundation commit, only those three Alpha 1 messages are
accepted. Every Alpha 2 payload listed above is rejected as
`unsupported_message_type` before replay mutation, causation consumption or
reducer invocation. Structural validity, signature verification and an
accepted sender admission do not constitute execution authority.

The following reserved families remain unsupported and fail before reducer
invocation:

- `peer.digest`, `peer.sync_request` and `peer.sync_response`;
- `evidence.*` and `trust.observation`.

Inference assessment, Action Grants and external action enforcement remain
assigned to Alpha 3.

### Stable domain records

One logical record may be sent in several direct envelopes. The payload
therefore carries a stable domain ID independent of each envelope `messageId`.

Alpha 2 introduces bounded identifiers for:

- Peer Card and capability advertisement;
- Objective document;
- Work Item and offer attempt;
- bid, award and assignment authority;
- progress, checkpoint and result;
- release and cancellation;
- lease renewal;
- takeover proposal, vote and recovery certificate.

Receivers deduplicate envelopes by `messageId` and logical records by their
domain ID. Reusing a domain ID with different canonical content is a conflict,
not a revision or duplicate.

### Partial peer views

Admission state and discovery state remain separate:

- admission determines whose signed messages may enter the inbound boundary;
- a Peer View contains only locally observed, bounded routing and liveness
  information;
- a capability index contains only unexpired, locally accepted self-claims;
- evicting a view or capability entry never removes key, revocation, replay or
  fencing state still needed for security decisions.

A Peer Card refresh may update the subject's protocol versions, instance,
transport hints and capability references. It cannot add its own key binding,
admit a new identity or extend its admission validity.

View maintenance is deterministic:

1. remove expired capability declarations;
2. remove expired or departed passive candidates;
3. prefer responsive admitted neighbors required by active work;
4. evict the least recently observed passive entry;
5. break equal-time ties by canonical peer ID order.

Every view, capability collection and sender fanout has a configured maximum.
No discovery response or topic delivery bypasses those limits.

### Capability declarations

An advertisement contains at least:

- `capabilityId`, `revision` and capability owner;
- a stable capability key and bounded version or variant labels;
- bounded input and output media types;
- bounded attributes used for deterministic local matching;
- validity interval and declaration expiry;
- optional concurrency and payload-size claims.

Mutable availability, price, duration and reservation terms belong in a bid,
not in the capability declaration. A withdrawal references the accepted
advertisement and revision. Reactivation requires a strictly higher revision.

Capability matching is a pure local function. It returns eligible peer IDs and
reason codes, orders matches deterministically, and applies the configured
fanout limit. A match is not proof that the peer can perform the work.

### Objective document

An Objective is an immutable signed revision with:

- Objective ID, revision, issuer and expiry;
- bounded summary or authorized content reference;
- success criteria and permitted capability keys;
- maximum Work Items, concurrent assignments and integer budget units;
- bid, acceptance, lease and recovery timing bounds;
- maximum lease renewals;
- fixed recovery witness peer IDs and threshold;
- optional authorized observer peer IDs.

Objective issuer authority is preprovisioned or separately enrolled. Revision
`1` announces the Objective. Every later revision is exactly the previous
revision plus one and names the preceding Objective document ID.

A revision governs future offers and renewals. It does not rewrite an accepted
award, result or budget decision. Cancellation and expiry stop new allocation
and renewal; active work is closed through explicit Work Item transitions.

### Work Item document

A Work Item is owned locally and contains:

- Work Item ID, revision, Objective ID and current owner;
- owner epoch, fixed to `1` while owner transfer is out of scope;
- required capability keys and bounded matching attributes;
- bounded input or authorized content reference;
- completion criteria, work deadline and budget reservation;
- monotonically increasing offer attempt;
- current assignment epoch and authority ID when assigned;
- latest accepted checkpoint ID when one exists.

Work Item revisions are immutable. A material change to requirements,
completion criteria, deadline or budget creates exactly the next revision.
Reopening unchanged work after a decline or timeout increments the offer
attempt without rewriting the Work Item revision.

### Budget accounting

Alpha 2 uses non-negative safe-integer allocation units rather than
provider-specific currency:

- one Work Item reserves its requested units once when its first current offer
  opens, regardless of fanout or bid count;
- decline, award timeout, offer expiry or cancellation before acceptance
  releases that reservation exactly once;
- acceptance moves the units from reserved to committed;
- completion retains committed units as consumed Objective capacity;
- release, cancellation or failure after acceptance does not recreate spent
  capacity;
- a certified reassignment reuses the Work Item's existing commitment and
  cannot charge it a second time;
- Objective revision cannot reduce its limit below already committed units.

Every transition records the previous and next reserved and committed totals.
Arithmetic overflow, negative totals or a limit breach rejects the transition
before reducer invocation.

### Objective state machine

| Current state        | Accepted input                       | Next state              | Required checks                                                                  |
| -------------------- | ------------------------------------ | ----------------------- | -------------------------------------------------------------------------------- |
| absent               | `objective.announce` revision `1`    | active                  | issuer, scope, bounds, witness policy and expiry are valid                       |
| active revision `n`  | `objective.revise` revision `n + 1`  | active revision `n + 1` | causation names revision `n`; budgets cannot fall below already committed values |
| active               | `objective.cancel`                   | cancelled               | issuer and current revision match                                                |
| active               | Objective expiry timer               | expired                 | trusted logical time is at or after signed expiry                                |
| cancelled or expired | any later ordinary Objective message | unchanged/rejected      | terminal state cannot be reopened under the same Objective ID                    |

An exact historical Objective record is idempotent only after current ingress,
admission, authority and freshness validation. It cannot bypass those checks or
restore an older head. A conflicting document at an already accepted revision
is rejected.

### Work Item state machine

| Current state                             | Accepted input                             | Next state         | Authority                                                               |
| ----------------------------------------- | ------------------------------------------ | ------------------ | ----------------------------------------------------------------------- |
| absent                                    | local `work.create`                        | ready              | current Objective policy and local owner                                |
| ready                                     | local `work.offer` / accepted `work.offer` | offered            | current owner                                                           |
| offered                                   | accepted bid                               | offered            | eligible bidder; bid is appended without changing ownership             |
| offered                                   | accepted award                             | award pending      | owner; selected bid and budget reservation are current                  |
| award pending                             | accepted acceptance                        | active             | awarded assignee before acceptance deadline                             |
| award pending                             | decline or acceptance timeout              | ready              | awarded assignee or trusted timer                                       |
| active                                    | progress or checkpoint                     | active             | current assignee, epoch, token and unexpired lease                      |
| active                                    | result                                     | completed          | current assignee, epoch, token, lease and completion bounds             |
| active                                    | release                                    | released           | current owner or assignee; disposition is retained as terminal evidence |
| active                                    | cancellation                               | cancelled          | current owner under Work policy                                         |
| non-terminal                              | Work Item deadline                         | expired            | trusted timer                                                           |
| completed, cancelled, expired or released | ordinary work transition                   | unchanged/rejected | terminal state cannot be reopened at the same revision                  |

The reducer records append-only decision events and projects current state from
them. It never treats message arrival order as authority.

Lease renewal and certified-reassignment transitions are not enabled in this
state machine; their protocol records remain unsupported at the runtime
boundary.

## Allocation protocol

### Offer

The owner creates a stable `offerId` bound to the Objective, Work Item
revision, owner epoch, offer attempt, bid deadline, capability requirements and
budget reservation. Candidate selection uses only the owner's bounded local
view.

The reference driver emits one direct signed envelope per selected peer.
Topic-audience parsing and subscription are supported, but the canonical
allocation scenario uses explicit direct fanout so every intended recipient is
visible in the trace.

#### Implemented first-offer foundation

The first executable Allocation component established the offer/bid boundary
before the later award component described below. A local Work Item owner
supplies one already-signed direct offer envelope for each candidate. Each
envelope has its own recipient and `messageId`; a later bid from that recipient
must name that exact `messageId` as its causation ID. The reducer verifies the
prepared envelopes' closed structure, canonical payload equality, local
sender/key binding, direct audience and recipient set against the owner's
bounded local capability match. Signing and transport remain outside the
reducer's trusted local driver boundary.

Opening the offer immediately reserves the Work Item's budget units and starts
the generation-fenced bid-deadline timer. The reservation is attached to the
Objective, Work Item and offer, not to a bidder or a selection. A due bid
deadline closes the offer and releases that reservation exactly once. Award,
acceptance and their deadline are implemented by the subsequent owner-side
component; later attempts reuse the same bounded offer rules with an exact
causal predecessor.

### Bid

A bidder may submit at most one current bid per `offerId`. A replacement bid
uses a higher bid revision and names the preceding bid. The bid binds:

- bidder and advertised capability revision;
- offered Work Item revision and owner epoch;
- capacity reservation, integer budget units and expected completion time;
- assumptions and a bid expiry no later than the offer deadline.

An owner does not trust the capability claim merely because the bid is signed.
Local policy scores only structurally valid bids and records deterministic
selection reason codes. The reference policy filters required capability keys,
then orders by lowest budget units, earliest expected completion, canonical
peer ID and canonical bid ID. Applications may inject another pure,
version-identified policy; its identifier and configuration participate in the
simulation digest.

In the implemented sub-slice, the owner accepts only already-verified,
admitted, direct bids from a selected recipient. The bid must bind the current
offer, Objective, Work Item, capability declaration and that recipient's exact
offer-envelope causation ID. A replacement keeps that exact envelope
causation, names the bidder's current bid in `previousBidId` and advances its
revision. Accepted signed evidence is retained under bounded limits. Selection
is a pure read-only operation while the bid window and the chosen bid are both
still valid: it chooses by budget units, expected completion timestamp, peer ID
and bid ID. Expiry is exclusive. Selection creates neither an award nor a new
reservation.

### Award

The owner selects a current bid and emits a stable `awardId`. The initial
assignment epoch is `1`; a later ordinary reassignment is exactly the current
epoch plus one. The award binds:

- selected offer and bid;
- Work Item revision and assignment epoch;
- assignee, lease start, lease expiry and acceptance deadline;
- budget reservation;
- fencing token equal to the stable assignment authority ID.

For an initial assignment, the authority ID and fencing token are `awardId`.
For recovery, both remain the accepted `certificateId` and the award references
that certificate.

The owner-side runtime implements the initial-award path as one local
`allocation.award` command containing one prepared, signed direct envelope for
the deterministically selected assignee. It accepts an award only while the bid
window and selected bid are still valid, then atomically closes that window:
the bid-deadline timer is removed, an acceptance-deadline timer is installed,
and the existing reservation remains reserved. This slice deliberately does
not prepare or deliver an award on the assignee, send copies to witnesses, or
activate execution.

### Acceptance and decline

Only the selected assignee can accept or decline. Acceptance must arrive before
the signed acceptance deadline and cannot lengthen the lease. The owner and
configured witnesses receive causally bound direct records.

The assignee cannot emit authorized progress, checkpoints or results until it
has accepted the award locally. A decline or acceptance timeout releases the
reservation and permits a later offer attempt.

Issuing an award consumes its assignment epoch even when the assignee declines
or the acceptance deadline expires. A later offer therefore cannot be awarded
with another authority ID at that same epoch; ordinary reassignment must advance
exactly to the next epoch. Until that reassignment transition is implemented,
the initial-award reducer fails closed instead of reusing epoch `1`.

The owner-side runtime accepts already-verified direct `work.accept` and
`work.decline` records only from the awarded assignee, with exact award-envelope
causation, Objective/Work binding, epoch, authority, fencing token and deadline.
The acceptance deadline is exclusive. Acceptance atomically moves the Work Item
to `active` and the budget from reserved to committed; decline or the trusted
acceptance timer moves it to `ready` and releases the reservation exactly once.

#### Assignee-side intake and response preparation

The complementary assignee projection accepts an already-verified, direct
`work.offer` only under the current accepted Objective document and its
capability, budget and timing limits. A direct `work.award` must address the
local peer, remain within that policy, and exactly bind the locally prepared
bid and its recipient-specific offer-envelope causation. The projection
retains the signed award under hard count and byte limits, records the initial
epoch, assignment authority, fencing token, lease and exclusive acceptance
deadline, and installs a generation-fenced local response-deadline timer.
Replaying the exact signed award is idempotent; reuse of an award or message ID
with different signed content is a conflict. Invalid scope, audience,
causation, Objective/Work binding, epoch, token, lease or deadline inputs leave
the assignee projection unchanged.

Later offers for an unchanged Work revision form one exact predecessor chain.
They retain every immutable Work term, advance `offerAttempt` by one, name and
causally reference the previous offer, and arrive only after its bid window
closes or its award becomes terminal.

Before that deadline, the local assignee may commit exactly one prepared,
signed direct `work.accept` or `work.decline` envelope. The reducer validates
the response's self-binding, award-envelope causation and complete assignment
binding, then emits one dispatch effect. The response is locally recorded
before delivery and exact retry is idempotent; a conflicting response cannot
replace it. A due response deadline closes the local award without emitting a
response. Signing and transport remain trusted driver boundaries; this slice
does not infer receipt by the owner.

This assignee-side increment establishes award intake and response
preparation/dispatch, and records the resulting initial local assignment
authority. The execution-lifecycle slice uses that authority for progress,
checkpoints, results, release and cancellation. It does not renew a lease,
transfer external-action authority, or perform reassignment or recovery.

### Progress, checkpoint and result

Every progress, checkpoint and result record binds:

- Objective and Work Item revision;
- assignment epoch;
- fencing token;
- accepted award or recovery certificate;
- current checkpoint parent when applicable.

These records are accepted only while the lease is valid. A checkpoint is
bounded metadata plus an optional authorized content reference; it is not a
promise of production durability. A result completes the local Work Item
projection but does not establish evidence truth, which remains an Alpha 4
concern.

## Lease and recovery protocol

### Lease rules

- Lease start, expiry and acceptance deadlines are signed RFC 3339 instants.
- The driver converts trusted time into the reducer's monotonic logical time.
- Expiry never depends on message arrival order or sender-provided local time.
- A renewal retains the same epoch and fencing token.
- Renewal must arrive before expiry and remain within Objective duration and
  renewal-count bounds.
- Expiry removes execution authority; it does not erase history.
- A late message from the expired epoch cannot become valid because no
  replacement has yet been selected.
- Acceptance and execution records are timely only when trusted local
  verification time is strictly before the signed deadline or lease expiry.
- A timer fires at or after its deadline. Witness recovery becomes eligible at
  or after lease expiry plus recovery grace.

### Recovery policy

The accepted Objective revision fixes a sorted, unique witness set and
threshold for future assignments. Alpha 2 requires:

- at least three witnesses;
- threshold greater than half of the witness set;
- the local peer to know admitted key bindings for every counted witness;
- witness policy unchanged for an already active assignment.

These rules provide quorum intersection for the documented fault model. They do
not tolerate a compromised witness majority.

### Recovery sequence

1. The current lease reaches expiry.
2. Witnesses wait until expiry plus the signed recovery grace.
3. An eligible candidate or witness emits one takeover proposal for exactly
   `currentEpoch + 1`.
4. Each witness may sign at most one vote for a Work Item, revision and proposed
   epoch.
5. An assembler creates a certificate containing the proposal and a threshold
   of distinct valid witness votes.
6. Accepting the certificate immediately moves the Work Item to `recovering`,
   advances the epoch and sets `certificateId` as the fencing token.
7. The owner issues a recovery award to the certified candidate using that
   exact epoch and token.
8. The candidate accepts and resumes from the latest checkpoint named by the
   recovery award.

A conflicting vote is rejected and emits a bounded equivocation event. Evidence
claims and trust penalties remain deferred.

If the owner is unavailable, a certificate may fence the old assignee, but
Alpha 2 does not activate a replacement without an owner-issued recovery award.
That availability limit is explicit in documentation and tests.

### Fencing invariants

For each tenant, Mesh, Objective, Work Item and Work Item revision:

- assignment epoch starts at `1` and advances exactly by one;
- one epoch has one stable assignment authority ID;
- a higher accepted epoch permanently fences every lower epoch;
- same-epoch records with another fencing token are rejected;
- lease renewal cannot change epoch, assignee or token;
- progress, checkpoint and result require the current unexpired lease;
- rejected stale records leave projection, journal and budget state unchanged;
- external action authority is not inferred from a Work Item lease.

## Reducer and effect model

The Alpha 1 contract remains:

```text
state + accepted input + logical time -> next state + ordered effects
```

Alpha 2 adds typed local inputs for:

- Objective and Work Item creation or cancellation;
- offer creation, deterministic bid selection and owner-side award preparation;
- trusted timer firing;
- crash/restart lifecycle events supplied by a driver;
- effect results for signed record preparation and delivery.

The reducer receives no clocks, randomness, storage, transport, model or tool
callbacks. Any generation of message IDs or signed bytes remains a typed driver
effect. Effects follow prepare, commit, then deliver so a failed preparation
cannot leave projected authority without the corresponding signed record.

Inbound processing extends the Alpha 1 boundary with message-specific
authorization and causal validation before reducer invocation. A semantic
failure has an explicit bounded rejection code and no stateful effect.

## Bounded state

Alpha 2 adds explicit limits for:

- active and passive Peer View entries;
- capability advertisements per peer and across the local Mesh;
- active Objectives and Work Items per Objective;
- bids per offer, offer attempts per Work Item, and globally retained awards
  and assignment responses;
- witnesses and votes per recovery proposal;
- journal events and canonical bytes per Work Item;
- pending timers, preparations and deliveries;
- retained terminal Work Items and expired declarations.

Security state is never silently evicted. If replay, fencing, revocation,
idempotency or current-work state cannot be retained, the peer applies
backpressure or rejects new work. Journal compaction preserves a versioned
projection, previous segment digest and retention metadata.

## Deterministic fault model

`@agentplat/mesh-sim` gains serialized fault events rather than hidden test
hooks:

| Fault     | Simulator behavior                                                                                   |
| --------- | ---------------------------------------------------------------------------------------------------- |
| crash     | stop one peer driver and drop later volatile deliveries to that instance                             |
| restart   | start an explicitly configured new instance from a supplied initial state or snapshot                |
| loss      | discard a named scheduled delivery and record the discard in the trace                               |
| duplicate | enqueue the same signed envelope more than once with distinct simulation event IDs                   |
| reorder   | change delivery time or priority while preserving the original signed envelope                       |
| partition | disable a declared set of directed links; deliveries crossing disabled links are recorded as dropped |
| heal      | re-enable links; only newly sent or explicitly retried envelopes are delivered                       |

Fault schedules, topology changes, PRNG version, seed, logical times and limits
participate in the configuration digest. Simulation never silently retries or
heals a fault.

### Required resilience scenarios

1. **Capability allocation:** three peers with different partial views discover
   a matching declaration and complete offer through result.
2. **False capability claim:** an admitted peer advertises a match but declines
   or fails; the owner reallocates without promoting the claim to trusted fact.
3. **Lost bid or acceptance:** a named record is dropped; deadline handling
   releases reservations and a later offer attempt succeeds.
4. **Duplicate and reorder:** every allocation record is duplicated and selected
   records arrive out of order; the final projection matches the ordered run.
5. **Assignee crash:** the active assignee crashes after a checkpoint; a
   certified next epoch resumes from that checkpoint and completes.
6. **Minority partition:** the stale assignee remains isolated without witness
   threshold while the owner side certifies a new epoch; stale progress and
   result are rejected after healing.
7. **No quorum:** fewer than the required witnesses are connected; no
   certificate or new execution authority is created.
8. **Owner unavailable:** witnesses fence the old epoch, but no replacement
   becomes active until the owner returns and issues the recovery award.
9. **Deterministic replay:** every scenario produces the same semantic trace and
   chain digest under identical versioned inputs.

### Liveness assumptions

Recovery progress is claimed only when:

- the accepted Objective and required key/admission state remain locally
  available;
- trusted local time advances;
- a witness threshold, owner and eligible candidate can communicate after
  expiry and grace;
- the transport eventually delivers newly emitted records;
- configured resource and budget limits permit reassignment.

No progress is promised to a minority partition, with no witness threshold, or
after required local state has been lost.

## Implementation increments

Each increment is a reviewable pull request and keeps the full public check
green.

### Increment 0: freeze contracts and executable fixtures

- approve this plan and the Alpha 2 acceptance checklist;
- add closed payload contracts and stable domain identifiers;
- specify bounds and rejection codes;
- add valid and invalid protocol fixtures for every Alpha 2 family;
- preserve all Alpha 1 fixtures and parser behavior;
- add compile-only public type tests before reducer implementation.

Exit criterion: all Alpha 2 wire shapes are bounded, closed and reviewable; all
Alpha 2 messages still fail explicitly at the runtime boundary.

### Increment 1: partial views and capability discovery

- add the `@agentplat/mesh/coordination` subpath for schema-versioned,
  independently bounded coordination snapshots without extending the closed
  Alpha 1 state, input or effect contracts;
- validate restoration explicitly and provide pure generation-fenced timer
  evaluation before any workflow or driver is allowed to create a timer;
- implement Peer Card refresh and goodbye semantics;
- add bounded topic subscription and sender fanout;
- implement capability advertise, replace, expire and withdraw;
- implement deterministic local matching and view eviction;
- test admission/discovery separation and self-claim handling.

The foundation sub-slice intentionally does not accept Alpha 2 envelopes,
schedule host timers or compact its decision journal. Those behaviors land only
with their complete workflow and driver support. A full journal rejects a due
timer without consuming it; later compaction requires explicit retention and
digest metadata.

The discovery-projection sub-slice is implemented as a separately restorable
state composed with that foundation. It enforces admission separation, causal
Peer Card and capability heads, explicit entry and encoded-byte ceilings,
logical expiry, deterministic passive-view eviction, pure matching reason codes
and bounded local topic-recipient selection. Its input is already-verified
protocol data; the later authenticated-inbound and topic-driver sub-slices add
the trust boundary and actual topic delivery.

The authenticated-inbound sub-slice is also implemented under the coordination
subpath. Context and message-family checks run before cryptographic work; the
reference verifier and a construction-bound synchronous local resolver run
before admission; admission and instance ownership run before replay; and
domain projection runs only after non-evictable sequence and message-ID
accounting. Remote requests cannot substitute cryptographic dependencies or
protocol policy. A signed, authenticated record that fails a domain predecessor
or capacity check retains only normal replay accounting. Composite logical time
uses the maximum of coordination, discovery and replay-security snapshots, and
restored message-ID retention must remain inside its exact configured window.

The final Increment 1 slice is an additive coordination-only, bounded
in-memory reference topic driver. Its process-local endpoint registry is a
route table rather than a membership service. For each publication it snapshots
recipients exclusively from the sender's local active Peer View and joins them
to registered endpoints for the exact current peer instances. It does not use a
global registry as a recipient oracle, infer complete membership, fan out beyond
that local snapshot, forward received envelopes, or claim production durability.

The driver atomically admits the whole selected batch only if its FIFO queue and
byte limits permit it, copying the exact signed envelope per recipient. FIFO
serialization invokes a receiver only through its construction-bound trusted
clock and authenticated inbound processor. Public delivery receipts coarsen all
rejections to `rejected` or `unavailable`; exact codes remain local-only
diagnostics. The evidence includes a real signed three-peer scenario: A delivers
to B, while B separately publishes to C; C never receives A's envelope through
implicit forwarding.

Exit criterion: three peers with different bounded views discover only locally
visible, admitted and unexpired capability declarations.

### Increment 2: Objective and Work Item projections

- implement Objective announce, revision, cancellation and expiry;
- implement local Work Item creation and immutable revision;
- add bounded journals, timers and budget reservations;
- enforce issuer, owner and scope authority before reducers;
- add state-machine model tests.

Implementation status: the pure, separately restorable Objective/Work core is
implemented. It includes provisioned issuer peer/key authority, causal and
terminal Objective heads, locally owned immutable Work Item revisions,
generation-fenced Objective and Work deadlines, strict composite restoration,
bounded projection/policy-history/journal/timer capacity and deterministic
model-based traces. Restoration binds Objective-scoped coordination metadata
through `objectiveId`, retains every accepted signed Objective envelope and
derived policy under a hard non-evicting limit, recomputes the canonical
SHA-256 payload digest and re-derives logical expiry during restore, and
requires each Work Item's immutable policy snapshot to equal that authenticated
document projection. Cancelled heads retain and validate their signed
cancellation evidence, while all accepted historical document and message IDs
remain globally unique. An Objective revision preserves prior Work Item timer
bindings and accounting heads instead of rewriting accepted history. Timer-ID
collisions fail closed, the generic coordination timer evaluator refuses
Objective/Work workflow-owned timers, and exact nanosecond timestamp
differences round up to logical milliseconds.

The authenticated Objective ingress sub-slice is implemented. It composes four
immutable identity-aligned snapshots (coordination, discovery, Objective and
inbound security) and shares the non-evictable replay/message-ID state with
discovery. The Objective projection may lag a discovery-only logical-time
advance; the processor creates an ephemeral clock-aligned view before Objective
evaluation without rewriting that projection. For each Objective message,
processing orders context checks, cryptographic verification, exact admission
and issuer authority, replay accounting, then the domain transition. A
post-replay domain rejection retains normal replay security accounting but does
not change the Objective projection.

The bounded Objective topic delivery sub-slice is also implemented as an
explicit in-memory reference driver. It snapshots recipients from the sender's
local active Peer View, joins only registered routes for exact current peer
instances, atomically enqueues exact signed-envelope copies, and serializes
delivery through construction-bound clocks and Objective inbound processors.
Public receipts are intentionally coarse and detailed codes stay local. This
driver supplies neither forwarding, a global membership view, nor durability.
Budget reservation starts with the first offer, and concurrency enforcement
starts with assignment, so those exit-criterion parts remain pending with
allocation.

Exit criterion: no Work Item can be offered outside a current accepted
Objective, its limits or its local owner authority.

### Increment 3: allocation handshake

- [complete] implement the first local offer attempt with bounded direct
  recipient-specific signed envelopes and immediate budget reservation;
- [complete] implement verified bid submission, causal replacement, bounded
  evidence retention, pure deterministic selection and bid-deadline release;
- [complete] implement owner-side initial award preparation, accepted direct
  acceptance/decline, exclusive acceptance-deadline handling, atomic early
  bid-window close and exactly-once reservation accounting;
- [complete] implement causal, monotonic later offer attempts after a released
  reservation;
- [complete] implement assignee-side verified direct award intake, bounded
  prepared-bid provenance, local accept/decline preparation and dispatch, and
  exclusive local response-deadline closure;
- [complete] implement bounded, retained `work.progress`, `work.checkpoint`,
  `work.result`, `work.release` and `work.cancel` records with terminal heads,
  exact duplicate handling and terminal budget accounting;
- [complete] authenticate inbound Allocation records before replay and domain
  evaluation, retaining replay accounting for signed domain rejections;
- [complete] migrate Allocation snapshots from schema versions 1–3 to schema
  version 4 with empty execution evidence indexes and conservative limits.

Wire conformance for progress, checkpoint and result covers closed payloads,
sender self-binding, direct audience, Objective-header equality, mandatory
causation, summary/reference XOR, checkpoint-parent sequence rules and the
lesser-of-five-minutes-or-remaining-lease TTL. State-machine tests must
separately cover owner/observer/witness recipient authorization, accepted
causal records, current authority/epoch/token/lease, checkpoint head and result
uniqueness.

The packed-consumer, reordered-delivery and release gates remain pending.

### Increment 4: leases, epochs and fencing

- enforce signed initial-lease and acceptance deadlines for the execution
  lifecycle;
- implement bounded renewal;
- retain the implemented initial epoch/token binding and stale/expired
  authority rejection;
- expose redacted transition and rejection events.

Wire conformance for renewal covers a closed accepted-assignment payload,
stable renewal IDs and predecessor sequences, assignee self-binding, direct
audience, Objective-header equality, mandatory causation, a positive bounded
lease extension and the lesser-of-30-seconds-or-current-lease TTL. Stateful
tests must separately cover recipient authorization, accepted causal records,
the exact current lease/authority/sequence, Work and Objective deadlines,
Objective duration/count policy, terminality and idempotency.

Exit criterion: no stale or expired executor record changes Work Item, journal
or budget state.

### Increment 5: certified reassignment

- implement proposals, witness votes and certificate assembly;
- enforce witness uniqueness, threshold and quorum policy;
- advance to `recovering` before replacement activation;
- implement recovery award, acceptance and checkpoint resume metadata;
- document owner-unavailable behavior.

Wire conformance for takeover proposals covers a closed accepted-assignment
payload, stable proposal identity, candidate/witness role consistency, exact
next declared epoch, current renewal-head representation, direct audience,
Objective-header equality, mandatory causation and a one-minute TTL. Stateful
tests must separately cover trusted expiry-plus-grace time, current lease head,
proposer/candidate eligibility, witness recipients, proposal conflicts,
terminality and the invariant that a proposal grants no execution authority.

Wire conformance for witness votes covers a closed affirmative endorsement with
a stable vote ID, logical takeover proposal ID, self-bound witness, direct
audience, Objective-header equality, mandatory proposal causation and a
one-minute TTL. Candidate, Work Item, assignment, lease, epoch and fencing
snapshots remain canonical in the accepted proposal rather than being copied
into each vote. Stateful tests must separately cover proposal resolution,
witness-set and recipient authorization, idempotency, one vote per witness and
proposed epoch, conflicting proposal evidence, terminality and the invariant
that a vote grants no authority.

Wire conformance for recovery certificates covers a closed record with a stable
certificate ID, self-bound assembler, logical takeover proposal ID, two to 32
sorted unique vote IDs, direct audience, Objective-header equality, mandatory
proposal causation and a one-minute TTL. Candidate, assignment, lease, epoch,
witness policy and fencing snapshots remain canonical in the accepted proposal
and Objective. Stateful tests must separately resolve every vote to the same
proposal and distinct configured witness, enforce the accepted threshold,
authorize assembler and recipients, reject stale or conflicting certificates,
and prove fencing occurs before any replacement activation.

Exit criterion: a threshold can fence and reassign exactly the next epoch, while
a minority cannot create execution authority.

### Increment 6: fault injection and resilience suite

- add explicit crash, restart, loss, duplicate, reorder, partition and heal
  events;
- add invariant monitors after every simulation event;
- implement all required resilience scenarios;
- report seed, configuration digest, fault schedule and first divergence;
- run canonical scenarios from packed tarballs.

Exit criterion: all safety invariants hold under the fault catalog, and liveness
holds only under the documented assumptions.

### Increment 7: release preparation and publication

- set the coordinated version only in the release candidate change;
- update README, changelog, release channels and package documentation;
- run the external terminology audit;
- run the full clean build, type, test, pack and isolated-consumer gates;
- publish under a commit-specific staging tag;
- verify registry integrity before promoting all packages to `next`;
- run one independent exact-version registry consumer;
- tag the verified commit as `v0.3.0-alpha.2`.

Exit criterion: every cataloged package exposes integrity-verified Alpha 2
artifacts and the public release record contains reproducible evidence.

## Test strategy

### Protocol and type tests

- one canonical valid fixture per implemented message;
- unknown field, invalid identifier, invalid timestamp and structural-bound
  failures;
- payload type mismatch and unsupported message families;
- domain ID collision with different canonical content;
- old Alpha 1 fixtures parsed without migration;
- public TypeScript exhaustiveness for every closed union.

### Reducer model tests

- every allowed state transition;
- every forbidden state transition;
- immutable input and output graphs;
- monotonic Objective revision, Work Item revision, offer attempt and epoch;
- timer at one tick before, exactly at and after each deadline;
- deterministic tie breaking for views, matching and bids;
- budget reserve, release and completion accounting;
- journal and queue backpressure.

### Security and authority tests

- unknown, self-signed, expired and revoked identities;
- cross-tenant, cross-Mesh and cross-Objective records;
- issuer, owner, bidder, assignee and witness impersonation;
- capability advertisement without admission;
- award for a stale offer, bid or Objective revision;
- acceptance by a non-assignee or after deadline;
- stale epoch, wrong token, expired lease and conflicting same-epoch token;
- duplicate witness, non-witness vote and insufficient threshold;
- certificate before expiry or grace;
- rejection before reducer invocation and without decision-state mutation.

### Component tests

- sign, deliver, verify, admit, authorize and reduce every implemented family;
- bounded topic subscription and direct fanout;
- prepare-before-deliver failure recovery;
- telemetry sink failure without decision changes;
- checkpoint causation and result completion;
- recovery proposal through accepted replacement result.

### Scenario and regression tests

- all nine resilience scenarios;
- repeated replay with the same configuration;
- controlled divergence after one fault or policy change;
- maximum event, logical-time, queue and internal-step termination;
- Alpha 1 signed three-peer scenario unchanged;
- Runtime, Sessions, Rooms and Framework behavior and public types unchanged;
- existing 28-package functional and isolated tarball consumers unchanged.

## Compatibility and migration

- Alpha 2 retains `wireVersion: 0`.
- Payload unions expand only inside the alpha Mesh packages.
- Existing Alpha 1 discriminants keep identical payload shapes.
- Alpha 2 reads Alpha 1 canonical protocol and simulation fixtures.
- Unknown Alpha 2 messages still fail explicitly in an Alpha 1 runtime; no
  downgrade or generic payload fallback is introduced.
- Any Alpha 2 persistence projection carries a new explicit schema version.
- Importing a package performs no migration or network I/O.
- Feature defaults continue to leave distributed coordination disabled unless
  the application constructs and starts a Mesh peer explicitly.

## Non-goals

Alpha 2 does not claim or implement:

- a complete global directory or complete membership view;
- capability truth, universal reputation or automatic trust;
- Work Item owner transfer or Objective issuer failover;
- production durable inbox, outbox, journal or checkpoint storage;
- HTTP, WebSocket, broker or other production transport;
- inference assessment, prompt filtering or model-output control;
- Action Grants, tool interception or external effectively-once execution;
- evidence fusion, Trust Profiles or automated quarantine;
- payload encryption;
- exactly-once delivery or exactly-once external effects;
- Byzantine tolerance beyond the documented witness-threshold assumptions.

## Pull request gates

Every increment must pass:

- complete public checkout and built-output audit;
- clean build and public type checks;
- all unit, adapter, compatibility and scenario tests;
- deterministic scenarios with reported seeds;
- release catalog and manifest verification;
- tarball content audit and isolated export imports;
- existing functional tarball consumer;
- no Runtime, Sessions, Rooms or Framework behavior regression;
- terminology scan with no restricted program or source-specific language.

## Definition of done

`0.3.0-alpha.2` is done only when:

1. bounded partial views and expiring capability declarations are public;
2. Objective and Work Item state machines are executable and model-tested;
3. offer, bid, award and acceptance complete from packed tarballs;
4. every execution record requires the current epoch, token and lease;
5. a witness threshold can certify exactly the next epoch after expiry;
6. a minority or stale assignee cannot create accepted execution authority;
7. crash, loss, duplicate, reorder and partition scenarios preserve all safety
   invariants;
8. deterministic replay and Alpha 1 compatibility remain green;
9. all public package, security, release and clean-consumer gates pass;
10. the release commit, registry integrity, rollback targets and Git tag are
    independently recorded.
