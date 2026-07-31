# Agent Mesh `0.3.0-alpha.2` acceptance checklist

Status: Increment 0 and Increment 1 complete; Increment 2 Objective projection,
authenticated ingress and bounded topic delivery implemented. The owner-side
Allocation handshake is implemented through award, acceptance, decline and
acceptance timeout. The paired assignee-side slice accepts verified direct
awards and prepares one locally recorded accept/decline dispatch. The initial
execution lifecycle implements progress, checkpoint, result, release and
cancellation; lease renewal, reassignment, recovery, resilience simulation and
release publication remain pending.

This checklist is the release contract for allocation and recovery. A box is
checked only when its evidence is reproducible from the reviewed public commit.
Registry and Git mutations are checked only after independent verification.

## Candidate

- version: `0.3.0-alpha.2`;
- distribution tag: `next`;
- Git tag: `v0.3.0-alpha.2`;
- protocol: `agentplat.mesh`;
- wire version: `0`;
- package count: 28 unless the public catalog changes through separate review;
- compatibility baseline: `v0.3.0-alpha.1`;
- release commit: not assigned;
- publication timestamp: not assigned.

## Design baseline

- [x] implementation plan is approved;
- [x] all Alpha 2 payload schemas and domain IDs are closed and bounded;
- [ ] state-machine transitions and terminal states are frozen;
- [ ] authority rules exist for every implemented message;
- [x] lease, epoch, token, quorum and deadline semantics are frozen;
- [x] liveness assumptions and owner-failure limitation are documented;
- [x] no API implies complete membership, capability truth or exactly-once
      delivery;
- [ ] threat model and compatibility policy cover every new trust boundary;
- [x] all deferred message families fail explicitly before reducer invocation.

### Increment 0 evidence

- closed payloads and domain IDs:
  `packages/mesh-protocol/src/contracts.ts`,
  `packages/mesh-protocol/src/validation.ts` and
  `packages/mesh-protocol/fixtures/v0/`;
- structural, signature and public type checks:
  `tests/mesh-protocol.test.mjs`, `tests/mesh-crypto.test.mjs` and
  `tests/mesh-public-contracts.test.mts`;
- fail-closed runtime boundary:
  `Alpha 2 protocol records stop at the runtime boundary until enabled`,
  `signed-valid Alpha 2 Objective records stop before the reducer` and
  `signed-valid Alpha 2 Work and Lease records stop before the reducer` in
  `tests/mesh-reducer.test.mjs`;
- reproducible gate: `pnpm run check`.

### Runtime foundation evidence

- the additive `@agentplat/mesh/coordination` subpath leaves the Alpha 1
  `MeshPeerState`, `MeshPeerLimits`, `MeshPeerInput` and `MeshPeerEffect`
  contracts unchanged;
- `tests/mesh-coordination.test.mjs` verifies strict snapshot restoration,
  immutable null-prototype indexes, hard local ceilings, generation fencing,
  exact and late timer delivery, duplicate rejection and fail-closed journal
  capacity;
- no Alpha 2 message is enabled and no host-timer effect is emitted by this
  foundation.

## Partial views and capabilities

- [x] Peer Card refresh cannot bootstrap admission or extend key validity;
- [x] Peer View and capability state have explicit entry and byte bounds;
- [x] view expiry and eviction are deterministic;
- [x] active-work security state is not evicted with discovery state;
- [x] topic subscriptions and sender fanout are bounded;
- [x] advertisements are signed, expiring self-claims;
- [x] withdrawals require owner, accepted advertisement and current revision;
- [x] capability matching is pure and has stable reason codes and ordering;
- [x] an unadmitted advertiser cannot enter capability state;
- [x] a false capability declaration grants no additional authority.

### Discovery projection evidence

- `packages/mesh/src/coordination-discovery-state.ts` keeps admission, Peer
  Cards, partial views and capability heads in a separately versioned immutable
  snapshot with hard entry and encoded-byte ceilings;
- `packages/mesh/src/coordination-discovery.ts` enforces causal revision heads,
  envelope freshness, admission and instance validity, terminal
  departure/withdrawal, deterministic expiry and eviction, pure bounded
  matching and bounded topic recipients;
- `tests/mesh-discovery.test.mjs` covers duplicate/conflict handling, refresh,
  withdrawal/reactivation, goodbye, admission separation, exact expiry,
  equal-time eviction, instance isolation, snapshot/domain binding, matching,
  fanout, scope, subscription and capacity;
- the projection consumes already-verified protocol values; the separate topic
  driver remains coordination-only and does not add reducer authority;
- `packages/mesh/src/coordination-inbound-state.ts` preserves bounded replay
  windows and retained message IDs in a separate non-evictable schema;
- `packages/mesh/src/coordination-inbound.ts` construction-binds trusted crypto
  dependencies and orders context, admission, replay and projection checks;
- `tests/mesh-coordination-inbound.test.mjs` exercises real signatures and
  keys, contextual failures before crypto, admission, replay, domain
  duplicate/conflict behavior and replay-only accounting on domain rejection.
- `packages/mesh/src/coordination-topic.ts` provides the bounded in-memory
  reference driver with sender-local active-view selection, exact-instance route
  joining, atomic bounded FIFO admission, exact signed-envelope copying and
  serialized construction-bound receiver processing;
- `tests/mesh-coordination-topic.test.mjs` proves the signed three-peer path:
  A reaches B, B explicitly publishes to C, and C does not receive A's
  envelope through global fanout or forwarding. It also covers endpoint-snapshot
  unavailability, queue rejection and close/drain behavior.

## Objective and Work Item state

- [x] Objective revision `1` requires an authorized issuer;
- [x] later Objective revisions advance exactly by one and name their parent;
- [x] conflicting content at an accepted revision is rejected;
- [x] cancellation and expiry are terminal for one Objective ID;
- [x] revisions do not rewrite accepted Work Item policy or timer bindings;
- [x] Work Items require a current locally accepted Objective;
- [x] Work Item revision and offer attempt are independent and monotonic;
- [ ] Objective limits bound Work Item count, concurrency and budget units;
- [x] every deadline is driven by injected trusted time;
- [x] journals and timers are bounded and backpressure is fail-closed.

### Objective/Work projection evidence

- `packages/mesh/src/coordination-objective-work-state.ts` defines strict,
  separately restorable issuer, Objective and locally owned Work Item
  projections with null-prototype indexes, deep immutability, exact keys,
  encoded-byte limits, Objective-scoped domain metadata (`objectiveId`),
  bounded non-evicting signed Objective document/policy history, canonical
  immutable Work policy snapshots and cross-projection counters;
- `packages/mesh/src/coordination-objective-work.ts` enforces admitted exact
  instances, provisioned issuer peers and keys, peer-stable key rotation,
  causal Objective heads, terminality, derived Work revisions, local ownership,
  stable generation-fenced timers and aligned sibling clocks;
- an exact historical Objective duplicate is idempotent without restoring an
  old head only after current ingress, admission, issuer-authority and
  freshness validation; a different issuer peer, predecessor, revision, digest
  or domain record cannot mutate state;
- Objective revisions preserve existing Work Item document and timer bindings;
  future Work revisions bind the new Objective head, while restored historical
  Work must exactly equal its retained policy revision; restore recomputes the
  retained envelope's canonical SHA-256 payload digest, re-derives logical
  expiry and binds both to the accepted domain record;
- cancelled heads retain the signed cancellation envelope and bind its payload,
  digest, message, causation and trusted validation time to the terminal
  record; fabricated cancellation and historical document/message ID reuse
  fail closed;
- timer-ID collisions fail closed, and the generic coordination timer evaluator
  refuses Objective/Work workflow-owned timers;
- RFC 3339 differences retain nanosecond precision and round a positive
  remainder up to the next logical millisecond;
- `tests/mesh-objective-work.test.mjs` covers strict restoration, authority and
  key rotation, issuer takeover, duplicate/conflict/terminal behavior, trusted
  time, coherent historical document/policy/Work forgery, stable composite IDs,
  stale timers, full protocol-size identifiers, fail-closed capacity and
  deterministic model-based traces;
- `tests/mesh-sha256.test.mjs` freezes the provider-neutral synchronous digest
  against published SHA-256 vectors at padding boundaries, high-bit binary
  input, multiple blocks and one million bytes; the pack browser-import gate
  verifies that the reachable source graph contains no Node.js builtin;
- `tests/mesh-public-contracts.test.mts` freezes the new coordination-subpath
  exports, including Objective inbound and topic-driver contracts.
- `packages/mesh/src/coordination-inbound.ts` shares discovery and Objective
  replay accounting and processes Objective messages in context, crypto, exact
  admission/issuer-authority, replay, then domain order; post-replay domain
  rejections retain security accounting only.
- `packages/mesh/src/coordination-inbound-state.ts` composes aligned immutable
  coordination, discovery, Objective and inbound-security snapshots.
- `packages/mesh/src/coordination-objective-topic.ts` supplies bounded
  sender-local Objective delivery with exact-instance route snapshots, FIFO
  processing, coarse receipts and local-only diagnostics; it provides neither
  forwarding, global membership nor durability.
- `tests/mesh-coordination-objective-inbound.test.mjs` covers real signed
  Objective ingress, shared replay behavior and post-replay rejection
  accounting;
- `tests/mesh-coordination-objective-topic.test.mjs` covers exact-instance route
  snapshots, unavailable endpoints, bounded atomic queues, coarse diagnostics
  and explicit non-forwarding delivery.

## Allocation

- [x] first local offers bind the current Objective, Work Item revision, owner
      epoch, first attempt,
      requirements, deadline and reservation;
- [x] first-offer candidates use only the bounded local capability view;
- [x] bids require a current open offer, exact recipient-specific offer
      causation and an admitted eligible bidder;
- [x] bid replacement is causal and monotonic;
- [x] bid deadlines close the offer; expired bids cannot be selected;
- [x] selection is deterministic and exposes stable local reason codes;
- [x] owner-side awards bind a stable domain ID, selected bid, initial epoch,
      lease and token;
- [x] a declined or timed-out award consumes its epoch, and the initial-award
      reducer rejects a different authority/token at that same epoch;
- [x] only the awarded assignee may accept or decline at the owner;
- [x] acceptance after its deadline is rejected;
- [x] decline or acceptance timeout releases the reservation exactly once;
- [x] one first Work Item offer reserves budget once regardless of fanout or
      bid count, and its bid deadline releases it exactly once;
- [x] acceptance moves reserved units to committed units exactly once;
- [x] an assignee accepts only a verified direct award that proves its own
      prepared bid and recipient-specific offer causation;
- [x] local accept/decline preparation has exact idempotency, conflict
      rejection and an exclusive response deadline;
- [ ] reassignment reuses the existing commitment without double charging;
- [x] progress, checkpoint and result require accepted assignment authority;
- [ ] duplicate and reordered records produce the same final projection;
- [x] result completion retains committed units as consumed Objective capacity;
- [x] release and cancellation create terminal execution heads; active terminal
      accounting does not uncommit Objective budget;
- [x] first-offer budget arithmetic rejects a limit breach before mutation.

### First Allocation sub-slice evidence

- `packages/mesh/src/coordination-allocation-contracts.ts` defines the bounded,
  separately versioned allocation snapshot, recipient-specific prepared offer
  evidence, bid heads, reservations and read-only selection contract;
- `packages/mesh/src/coordination-allocation-state.ts` strictly restores the
  immutable projection and binds allocation records to aligned coordination,
  discovery and Objective/Work snapshots;
- `packages/mesh/src/coordination-allocation.ts` opens only a local first
  offer from exact prepared direct envelopes, reserves budget immediately,
  accepts verified causal bid replacements, selects a current bid purely and
  releases the reservation only when the due bid timer fires;
- `tests/mesh-allocation.test.mjs` covers offer envelope binding, bounded local
  recipient matching, immediate reservation, verified bid causation and
  replacement, deterministic selection, duplicate/conflict behavior and
  exactly-once bid-deadline release;
- `tests/mesh-public-contracts.test.mts` freezes the public allocation
  constructors, evaluators, timer, selection and projection contracts.

### Owner-side award and response sub-slice evidence

- `packages/mesh/src/coordination-allocation-contracts.ts` extends the
  separately restorable allocation snapshot with bounded local awards,
  assignment responses and committed reservations; version-1 snapshots migrate
  deterministically to version 2;
- `packages/mesh/src/coordination-allocation.ts` accepts one locally prepared,
  recipient-specific signed award only for the current deterministic bid,
  closes its bid window atomically, verifies causal direct accept/decline
  responses and drives an exclusive acceptance deadline with trusted time;
- `tests/mesh-allocation.test.mjs` covers signed award to acceptance, decline,
  deadline timeout, exact causation/authority/deadline rejection, duplicate and
  conflict behavior, early bid-window closure, exactly-once reserve-to-commit
  or release accounting, migration and adversarial restored snapshots;
- assignee-side award intake, response preparation/delivery, execution,
  lease and recovery were delivered by later slices; this owner-side evidence
  remains scoped to award and response handling.

### Assignee-side award and response sub-slice evidence

- the allocation runtime retains a bounded, independently restorable local
  assignee award/response projection, including prepared-bid provenance and
  local deadline metadata;
- verified `work.award` intake requires direct local audience, exact prepared
  bid and offer-envelope causation, Objective/Work revision, epoch, authority,
  token and unexpired lease/deadline binding before state mutation;
- received later offers require the exact predecessor ID and envelope
  causation, preserve immutable Work terms and wait for predecessor closure;
- a local prepared `work.accept` or `work.decline` is recorded before its one
  dispatch effect; exact replay is idempotent and conflicting IDs/content are
  rejected without mutation;
- the shared authenticated allocation boundary verifies context and signatures
  before admission, advances replay security before domain evaluation and
  retains that replay accounting when a validly signed domain record is
  rejected;
- `tests/mesh-assignment.test.mjs` covers causal offer chains, intake, dispatch,
  exclusive deadline, capacity/restore/migration, mismatch rejection and exact
  idempotency;
- lease renewal, reassignment and recovery remain explicitly out of scope.

### Execution-lifecycle sub-slice evidence

- `packages/mesh/src/coordination-execution.ts` appends bounded signed
  progress, checkpoint, result, release and cancellation records, derives one
  immutable head per assignment scope, and rejects stale role, audience,
  Objective/Work, epoch, token, causation, sequence and deadline bindings
  before mutation;
- `packages/mesh/src/coordination-allocation-state.ts` moves the separately
  restorable Allocation snapshot to schema version 4. Versions 1–3 migrate
  deterministically with empty execution indexes and conservative derived
  limits; strict restore binds heads, terminal evidence and coordination domain
  records;
- `packages/mesh/src/coordination-inbound.ts` enables authenticated Allocation
  ingress, ordering context, cryptographic verification, admission and
  instance checks, replay accounting, then execution domain evaluation;
- `tests/mesh-allocation.test.mjs` and `tests/mesh-assignment.test.mjs` cover
  progress/checkpoint/result causality, exact idempotency and conflicts,
  terminal result/release/cancellation behavior, stale authority and expiry,
  bounded retention, migration and adversarial restore checks;
- `tests/mesh-coordination-allocation-inbound.test.mjs` covers authenticated
  inbound progress and replay accounting retained after an execution-domain
  rejection.

## Lease, epoch and fencing

- [x] the initial assignment epoch is `1`;
- [ ] every later epoch is exactly the preceding epoch plus one;
- [x] one epoch has exactly one stable assignment authority ID and token;
- [x] initial fencing token equals `awardId`;
- [ ] recovered fencing token equals `certificateId`;
- [ ] renewals preserve assignee, epoch and token;
- [ ] renewals stay within Objective duration and count limits;
- [x] the initial expired lease authorizes no new progress;
- [ ] a higher accepted epoch permanently fences lower epochs;
- [x] a same-epoch record with a different token is rejected;
- [ ] stale rejection does not mutate projection, journal, reservation or
      idempotency decisions beyond normal replay accounting.

## Certified recovery

- [ ] witness set is sorted, unique, admitted and fixed for an active
      assignment;
- [ ] threshold is greater than half of at least three witnesses;
- [ ] proposals target exactly `currentEpoch + 1`;
- [ ] no valid proposal is accepted before lease expiry plus recovery grace;
- [ ] each witness contributes at most one vote per Work Item, revision and
      proposed epoch;
- [ ] duplicate, conflicting and non-witness votes are rejected;
- [ ] a certificate contains one accepted proposal and a threshold of distinct
      valid votes;
- [ ] certificate acceptance fences the old epoch before replacement
      activation;
- [ ] recovery award uses the certified candidate, epoch and token;
- [ ] replacement acceptance resumes from the named accepted checkpoint;
- [ ] insufficient quorum creates no certificate or execution authority;
- [ ] owner unavailability fences stale work but does not silently transfer
      ownership.

## Deterministic fault scenarios

- [ ] capability allocation succeeds with partial, non-identical views;
- [ ] false capability claim is recoverable without becoming trusted fact;
- [ ] lost bid and lost acceptance release state only at their deadlines;
- [ ] duplicates are idempotent across every Alpha 2 message family;
- [ ] reordering never bypasses causal or authority checks;
- [ ] assignee crash after checkpoint completes under a certified next epoch;
- [ ] minority partition cannot certify or commit stale work;
- [ ] majority side with owner, threshold and candidate can recover;
- [ ] healed stale progress and result are rejected;
- [ ] no-quorum scenario terminates without unauthorized progress;
- [ ] owner-unavailable scenario matches the documented availability limit;
- [ ] identical inputs reproduce configuration, trace and chain digests;
- [ ] one controlled change reports the first replay divergence;
- [ ] every scenario terminates within event, queue, time and internal-step
      bounds.

## Security and isolation

- [ ] invalid input cannot reach a domain reducer;
- [ ] tenant, Mesh, Objective and audience isolation fail before mutation;
- [ ] issuer, owner, assignee and witness authority are resolved from accepted
      local state;
- [ ] discovery never performs inbound key-resolution network I/O;
- [ ] revoked or expired key state rejects live allocation messages;
- [ ] domain ID reuse with different content is rejected;
- [ ] queues, views, capabilities, bids, votes, journals and terminal retention
      are bounded;
- [ ] resource exhaustion produces bounded rejection or backpressure;
- [ ] telemetry failure does not change a decision;
- [ ] telemetry contains no private keys, secrets, raw sensitive content or
      private reasoning;
- [ ] signatures are not documented as confidentiality or truth guarantees.

## Compatibility and regression

- [ ] all Alpha 1 protocol fixtures remain readable;
- [ ] Alpha 1 payload shapes and public entrypoints are unchanged;
- [ ] Alpha 1 signed loopback and deterministic scenario remain green;
- [ ] `wireVersion` remains `0`;
- [ ] persistence and simulation snapshots carry explicit schema versions;
- [ ] package import performs no migration, network I/O or global registration;
- [ ] Runtime local provider dispatch is unchanged;
- [ ] Sessions fixed round-robin defaults are unchanged;
- [ ] Rooms durable aggregate behavior is unchanged;
- [ ] Framework has no Mesh dependency or Mesh re-export;
- [ ] existing browser entrypoint import closures remain valid.

## Public candidate gates

- [ ] all cataloged manifests use fixed version `0.3.0-alpha.2`;
- [ ] frozen install and lockfile verification pass;
- [ ] public source, generated output and exact tarball audits pass;
- [ ] build and public TypeScript checks pass;
- [ ] unit, adapter, compatibility and security tests pass;
- [ ] all deterministic fault scenarios pass with reported seeds;
- [ ] every tarball passes content audit and isolated export import;
- [ ] packed TypeScript declarations compile with library checking enabled;
- [ ] packed allocation and recovery consumers pass;
- [ ] unchanged aggregate functional tarball consumer passes;
- [ ] external terminology gate passes with its required non-empty private
      denylist.

## Release-environment gates

- [ ] use an approved npm publisher or Trusted Publishing workflow;
- [ ] run from the reviewed commit on a clean `main` checkout;
- [ ] record current `next` rollback targets for all packages;
- [ ] complete the no-mutation publish dry run with `NPM_DIST_TAG=next`;
- [ ] confirm the candidate is absent or registry-equivalent for every package;
- [ ] publish missing packages under the commit-specific staging tag;
- [ ] verify SHA-512 registry integrity for every package;
- [ ] promote the complete coordinated package set to `next`;
- [ ] remove candidate staging tags only after complete promotion;
- [ ] install exact versions in an independent clean registry consumer;
- [ ] create and push `v0.3.0-alpha.2` at the verified release commit;
- [ ] record workflow URL, commit, publication time and registry evidence.

## Definition of accepted

Alpha 2 is accepted only when every applicable item above is checked and linked
to evidence. A failed safety invariant blocks the release. A failed liveness
scenario blocks the release only when its documented liveness assumptions were
present; absence of quorum or owner is an expected bounded outcome, not a
reason to create weaker authority.
