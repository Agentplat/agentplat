# Agent Mesh `0.3.0-alpha.2` implementation plan

Status: implementation in progress; Increment 0 contracts are being frozen.

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

| Package                    | Alpha 2 responsibility                                                                                                     |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `@agentplat/mesh-protocol` | Closed payload schemas, bounds, validation and conformance fixtures for discovery, Objective, work and lease messages.     |
| `@agentplat/mesh-crypto`   | Signing and verification fixtures for the new payload families; no new trust or key-bootstrap semantics.                   |
| `@agentplat/mesh`          | Partial views, capability projections, Objective and Work Item reducers, allocation, timers, leases, fencing and recovery. |
| `@agentplat/mesh-sim`      | Explicit crash, loss, duplicate, reorder and partition faults plus allocation and recovery invariant suites.               |

Runtime dependencies continue to follow actual imports. Framework must not
depend on or re-export an alpha Mesh package.

## Alpha 2 scope

### Implemented message families

Alpha 2 makes these previously reserved protocol messages structurally and
semantically executable:

- `peer.card` and `peer.goodbye`;
- `capability.advertise` and `capability.withdraw`;
- `objective.announce`, `objective.revise` and `objective.cancel`;
- `work.offer`, `work.bid`, `work.award`, `work.accept` and `work.decline`;
- `work.progress`, `work.checkpoint`, `work.result`, `work.release` and
  `work.cancel`;
- `lease.renew`, `lease.takeover_proposal`, `lease.vote` and
  `lease.certificate`.

Alpha 1 `peer.hello`, `peer.ping` and `peer.ping_ack` behavior remains
unchanged.

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

Duplicate identical records are idempotent. A conflicting document at an
already accepted revision is rejected.

### Work Item state machine

| Current state                             | Accepted input                                | Next state           | Authority                                                              |
| ----------------------------------------- | --------------------------------------------- | -------------------- | ---------------------------------------------------------------------- |
| absent                                    | local `work.create`                           | ready                | current Objective policy and local owner                               |
| ready                                     | local `work.offer` / accepted `work.offer`    | offered              | current owner                                                          |
| offered                                   | accepted bid                                  | offered              | eligible bidder; bid is appended without changing ownership            |
| offered                                   | accepted award                                | award pending        | owner; selected bid and budget reservation are current                 |
| award pending                             | accepted acceptance                           | active               | awarded assignee before acceptance deadline                            |
| award pending                             | decline or acceptance timeout                 | ready                | awarded assignee or trusted timer                                      |
| active                                    | progress or checkpoint                        | active               | current assignee, epoch, token and unexpired lease                     |
| active                                    | result                                        | completed            | current assignee, epoch, token, lease and completion bounds            |
| active                                    | lease renewal                                 | active               | current holder within Objective renewal policy                         |
| active                                    | release                                       | ready or released    | owner or current assignee under policy                                 |
| active                                    | expired lease plus valid takeover certificate | recovering           | threshold witnesses certify exactly the next epoch                     |
| recovering                                | recovery award and acceptance                 | active               | owner selects the certified candidate at the certified epoch and token |
| non-terminal                              | cancellation or Work Item deadline            | cancelled or expired | owner policy or trusted timer                                          |
| completed, cancelled, expired or released | ordinary work transition                      | unchanged/rejected   | terminal state cannot be reopened at the same revision                 |

The reducer records append-only decision events and projects current state from
them. It never treats message arrival order as authority.

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

### Acceptance and decline

Only the selected assignee can accept or decline. Acceptance must arrive before
the signed acceptance deadline and cannot lengthen the lease. The owner and
configured witnesses receive causally bound direct records.

The assignee cannot emit authorized progress, checkpoints or results until it
has accepted the award locally. A decline or acceptance timeout releases the
reservation and permits a later offer attempt.

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
- offer creation and deterministic bid selection;
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
- bids per offer and offer attempts per Work Item;
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

Exit criterion: all Alpha 2 wire shapes are bounded, closed and reviewable;
unimplemented messages still fail explicitly at the runtime boundary.

### Increment 1: partial views and capability discovery

- implement Peer Card refresh and goodbye semantics;
- add bounded topic subscription and sender fanout;
- implement capability advertise, replace, expire and withdraw;
- implement deterministic local matching and view eviction;
- test admission/discovery separation and self-claim handling.

Exit criterion: three peers with different bounded views discover only locally
visible, admitted and unexpired capability declarations.

### Increment 2: Objective and Work Item projections

- implement Objective announce, revision, cancellation and expiry;
- implement local Work Item creation and immutable revision;
- add bounded journals, timers and budget reservations;
- enforce issuer, owner and scope authority before reducers;
- add state-machine model tests.

Exit criterion: no Work Item can be offered outside a current accepted
Objective, its limits or its local owner authority.

### Increment 3: allocation handshake

- implement offer attempts and bounded direct fanout;
- implement bid submission, revision, expiry and deterministic selection;
- implement award preparation, budget reservation, acceptance and decline;
- implement progress, checkpoint, result, release and cancellation;
- add timeout and idempotency component scenarios.

Wire conformance for progress, checkpoint and result covers closed payloads,
sender self-binding, direct audience, Objective-header equality, mandatory
causation, summary/reference XOR, checkpoint-parent sequence rules and the
lesser-of-five-minutes-or-remaining-lease TTL. State-machine tests must
separately cover owner/observer/witness recipient authorization, accepted
causal records, current authority/epoch/token/lease, checkpoint head and result
uniqueness.

Exit criterion: a packed three-peer consumer completes one Work Item and
duplicate or reordered records produce the same projection.

### Increment 4: leases, epochs and fencing

- enforce signed lease and acceptance deadlines;
- implement bounded renewal;
- bind all execution records to epoch and fencing token;
- reject stale, future, conflicting and expired authority;
- expose redacted transition and rejection events.

Exit criterion: no stale or expired executor record changes Work Item, journal
or budget state.

### Increment 5: certified reassignment

- implement proposals, witness votes and certificate assembly;
- enforce witness uniqueness, threshold and quorum policy;
- advance to `recovering` before replacement activation;
- implement recovery award, acceptance and checkpoint resume metadata;
- document owner-unavailable behavior.

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
