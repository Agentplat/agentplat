# Agent Mesh `0.3.0-alpha.2` acceptance checklist

Status: Increment 0 and Increment 1 complete; Increment 2 Objective projection,
authenticated ingress and bounded topic delivery implemented. The owner-side
Allocation handshake is implemented through award, acceptance, decline and
acceptance timeout. The paired assignee-side slice accepts verified direct
awards and prepares one locally recorded accept/decline dispatch. The initial
execution lifecycle implements progress, checkpoint, result, release and
cancellation; bounded lease renewal and deterministic expiry are complete.
Certified reassignment is implemented through proposal, vote, certificate,
fence, owner-issued recovery award and replacement acceptance. The closed
fault model and all nine resilience scenarios are implemented and green.
Release preparation, coordinated publication, independent registry
verification and release tagging are complete.

This checklist is the release contract for allocation and recovery. A box is
checked only when its evidence is reproducible from the reviewed public commit.
Registry and Git mutations are checked only after independent verification.

## Candidate

- version: `0.3.0-alpha.2`;
- distribution tag: `next`;
- Git tag: `v0.3.0-alpha.2`;
- protocol: `agentplat.mesh`;
- wire version: `0`;
- package count: 28;
- compatibility baseline: `v0.3.0-alpha.1`;
- release commit:
  [`675ad40e5c3e2fc4eb1c5a7131db4893f076bc8b`](https://github.com/Agentplat/agentplat/commit/675ad40e5c3e2fc4eb1c5a7131db4893f076bc8b);
- coordinated publication completion: `2026-07-31T09:06:25Z`;
- annotated tag object: `a6c325c9052cfdbdfa60040e15d6aa847aca8c56`.

## Design baseline

- [x] implementation plan is approved;
- [x] all Alpha 2 payload schemas and domain IDs are closed and bounded;
- [x] state-machine transitions and terminal states are frozen;
- [x] authority rules exist for every implemented message;
- [x] lease, epoch, token, quorum and deadline semantics are frozen;
- [x] liveness assumptions and owner-failure limitation are documented;
- [x] no API implies complete membership, capability truth or exactly-once
      delivery;
- [x] threat model and compatibility policy cover every new trust boundary;
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
- [x] Objective limits bound Work Item count, concurrency and budget units;
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
- [x] reassignment reuses the existing commitment without double charging;
- [x] progress, checkpoint and result require accepted assignment authority;
- [x] duplicate and reordered records produce the same final projection;
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
- recovery is implemented by the certified-reassignment slice; owner transfer
  remains explicitly out of scope.

### Execution-lifecycle sub-slice evidence

- `packages/mesh/src/coordination-execution.ts` appends bounded signed
  progress, checkpoint, result, release and cancellation records, derives one
  immutable head per assignment scope, and rejects stale role, audience,
  Objective/Work, epoch, token, causation, sequence and deadline bindings
  before mutation;
- `packages/mesh/src/coordination-allocation-state.ts` now exposes the
  separately restorable Allocation snapshot as schema version 6. Versions 1–5
  migrate deterministically with conservative derived limits and sequence-zero
  lease heads for accepted assignments; strict restore binds execution and
  lease heads, terminal evidence, recovery evidence, timers and coordination
  domain records;
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

### Lease-renewal and expiry sub-slice evidence

- accepted assignments materialize a sequence-zero current lease head and
  generation-fenced expiry timer without rewriting the signed initial lease;
- locally prepared and authenticated inbound `lease.renew` records require the
  exact assignee, owner, Objective/Work revision, assignment authority, current
  expiry, sequence, predecessor and causation before mutation;
- each accepted renewal atomically retains immutable signed evidence, advances
  the current head and replaces the timer generation; exact replay is
  idempotent while causal forks and identifier/content conflicts fail closed;
- execution accepts only the current expiry, expiry removes authority without
  erasing history, release/cancel use the latest renewal as their causal head,
  owner close remains available after expiry, and terminal execution retires
  the current lease timer;
- Allocation schema version 6 strictly validates renewal/domain/timer and
  recovery-graph relations, complete renewal authority, re-derived logical
  deadlines and each historical execution deadline, and deterministically
  migrates versions 1–5 with bounded sequence-zero heads and missing legacy
  initial timers;
- focused assignment and authenticated ingress tests cover chained renewal,
  policy and authority rejection, stale timer generations, current-expiry
  execution, terminality, capacity, migration and adversarial restore.

## Lease, epoch and fencing

- [x] the initial assignment epoch is `1`;
- [x] every later epoch is exactly the preceding epoch plus one;
- [x] one epoch has exactly one stable assignment authority ID and token;
- [x] initial fencing token equals `awardId`;
- [x] recovered fencing token equals `certificateId`;
- [x] renewals preserve assignee, epoch and token;
- [x] renewals stay within Objective duration and count limits;
- [x] the initial expired lease authorizes no new progress;
- [x] a higher accepted epoch permanently fences lower epochs;
- [x] a same-epoch record with a different token is rejected;
- [x] stale rejection does not mutate projection, journal, reservation or
      idempotency decisions beyond normal replay accounting.

## Certified recovery

- [x] witness set is sorted, unique, admitted and fixed for an active
      assignment;
- [x] threshold is greater than half of at least three witnesses;
- [x] proposals target exactly `currentEpoch + 1`;
- [x] no valid proposal is accepted before lease expiry plus recovery grace;
- [x] each witness contributes at most one vote per Work Item, revision and
      proposed epoch;
- [x] duplicate, conflicting and non-witness votes are rejected;
- [x] a certificate contains one accepted proposal and a threshold of distinct
      valid votes;
- [x] certificate acceptance fences the old epoch before replacement
      activation;
- [x] recovery award uses the certified candidate, epoch and token;
- [x] replacement acceptance resumes from the named accepted checkpoint and
      the first later checkpoint sequence is its predecessor sequence plus one;
- [x] insufficient quorum creates no certificate or execution authority;
- [x] owner unavailability fences stale work but does not silently transfer
      ownership.

### Certified-recovery evidence

- `tests/mesh-recovery.test.mjs` test `expired witnessed work is fenced,
recovered once, and resumes from its checkpoint` exercises expiry plus grace,
  recipient-specific proposal fanout, distinct votes, quorum certificate,
  certificate fence, stale-epoch rejection, owner recovery award, replacement
  acceptance, preserved committed budget and the first resumed checkpoint at
  predecessor sequence plus one;
- `packages/mesh/src/coordination-recovery.ts` separates a local recovery
  command (all exact recipient envelopes and fanout are checked together) from
  one received authenticated envelope (its direct audience, role and retained
  causal evidence are checked locally). A received copy is verifiable, but is
  not proof that every fanout recipient received it;
- `packages/mesh/src/coordination-allocation.ts` and
  `packages/mesh/src/coordination-execution.ts` require the certified
  candidate, epoch, `certificateId` authority/token, owner-issued recovery
  award and checkpoint-resume chain before replacement execution;
- `packages/mesh/src/coordination-allocation-state.ts` is Allocation schema
  version 6 and strictly restores recovery graphs, fence heads, witness copies,
  checkpoint resume metadata and bounded retained evidence. Versions 1–5
  migrate deterministically.

## Deterministic fault scenarios

- [x] capability allocation succeeds with partial, non-identical views;
- [x] false capability claim is recoverable without becoming trusted fact;
- [x] lost bid and lost acceptance release state only at their deadlines;
- [x] duplicates are idempotent across every Alpha 2 message family;
- [x] reordering never bypasses causal or authority checks;
- [x] assignee crash after checkpoint completes under a certified next epoch;
- [x] minority partition cannot certify or commit stale work;
- [x] majority side with owner, threshold and candidate can recover;
- [x] healed stale progress and result are rejected;
- [x] no-quorum scenario terminates without unauthorized progress;
- [x] owner-unavailable scenario matches the documented availability limit;
- [x] identical inputs reproduce configuration, trace and chain digests;
- [x] one controlled change reports the first replay divergence;
- [x] every scenario terminates within event, queue, time and internal-step
      bounds.

### Deterministic-fault evidence

- `tests/mesh-alpha2-resilience.test.mjs` runs the nine numbered scenarios
  through `runMeshReducerScenario()` and the public production coordination,
  allocation, execution, timer and recovery reducers. Invariants run after
  every event and enforce bounded queues, non-negative budget and at most one
  authority for the current fence;
- the canonical seed is `0xa12fa017`; checkpoint recovery, partition,
  no-quorum, owner-unavailable and replay variants record fixed per-scenario
  seeds in their versioned configurations and traces;
- scenario 4 compares the complete ordered semantic projection with the
  duplicate/reordered run. Scenarios 5–8 cover checkpoint recovery, majority
  recovery, healed stale progress/result, insufficient quorum and owner
  unavailability. Scenario 9 verifies identical configuration, fault and chain
  digests and one controlled first divergence;
- `tests/mesh-sim.test.mjs` covers the closed fault schema, crash/resume,
  named loss, duplication, delay/reorder, directed partition/heal, clock
  offsets, strict schema-version-2 snapshot restore, replay and event, queue,
  time and internal-step limits;
- focused gate:
  `node --test tests/mesh-alpha2-resilience.test.mjs tests/mesh-sim.test.mjs`.

## Security and isolation

- [x] invalid input cannot reach a domain reducer;
- [x] tenant, Mesh, Objective and audience isolation fail before mutation;
- [x] issuer, owner, assignee and witness authority are resolved from accepted
      local state;
- [x] discovery never performs inbound key-resolution network I/O;
- [x] revoked or expired key state rejects live allocation messages;
- [x] domain ID reuse with different content is rejected;
- [x] queues, views, capabilities, bids, votes, journals and terminal retention
      are bounded;
- [x] resource exhaustion produces bounded rejection or backpressure;
- [x] telemetry failure does not change a decision;
- [x] telemetry contains no private keys, secrets, raw sensitive content or
      private reasoning;
- [x] signatures are not documented as confidentiality or truth guarantees.

### Security and isolation evidence

- the contextual, cryptographic, admission, replay and domain-order tests in
  `tests/mesh-coordination-inbound.test.mjs`,
  `tests/mesh-coordination-objective-inbound.test.mjs` and
  `tests/mesh-coordination-allocation-inbound.test.mjs` prove that invalid
  scope, audience, signature, admission and authority stop before the domain
  reducer. The Allocation integration test explicitly rejects revoked and
  expired keys before replay or domain mutation;
- discovery, Objective, Allocation, Assignment and Recovery suites cover local
  issuer/owner/assignee/witness authority, domain-record conflicts and
  fail-closed capacity across views, capabilities, Work Items, bids, votes,
  journals, timers and terminal evidence;
- `tests/mesh-coordination-topic.test.mjs` and
  `tests/mesh-coordination-objective-topic.test.mjs` freeze the public
  diagnostic shape, prove that receiver errors containing sensitive markers
  are not serialized and prove that a throwing diagnostic sink cannot change
  receipt or state;
- `tests/mesh-security-documentation.test.mjs` fixes the public distinction
  between signature integrity/authentication and confidentiality or truth.

## Compatibility and regression

- [x] all Alpha 1 protocol fixtures remain readable;
- [x] Alpha 1 payload shapes and public entrypoints are unchanged;
- [x] Alpha 1 signed loopback and deterministic scenario remain green;
- [x] `wireVersion` remains `0`;
- [x] persistence and simulation snapshots carry explicit schema versions;
- [x] package import performs no migration, network I/O or global registration;
- [x] Runtime local provider dispatch is unchanged;
- [x] Sessions fixed round-robin defaults are unchanged;
- [x] Rooms durable aggregate behavior is unchanged;
- [x] Framework has no Mesh dependency or Mesh re-export;
- [x] existing browser entrypoint import closures remain valid.

### Compatibility and regression evidence

- `tests/mesh-protocol.test.mjs`, `tests/mesh-crypto.test.mjs`,
  `tests/mesh-public-contracts.test.mts`, `tests/mesh-loopback.test.mjs` and
  `tests/mesh-sim.test.mjs` preserve the Alpha 1 fixtures, payload contracts,
  entrypoints, signed loopback and deterministic scenario at `wireVersion: 0`;
- coordination, inbound, allocation and simulator snapshots restore only
  explicit schema versions and reject open or malformed state;
- `pnpm run verify:release` and `pnpm run verify:pack` exercise import closures,
  dependency boundaries and every declared export from isolated consumers
  without import-time migration or registration;
- the unchanged Runtime, Sessions, Rooms and Framework suites remain part of
  `pnpm run check`; Framework has neither a Mesh dependency nor Mesh re-export.

## Public candidate gates

- [x] all cataloged manifests use fixed version `0.3.0-alpha.2`;
- [x] frozen install and lockfile verification pass;
- [x] public source, generated output and exact tarball audits pass;
- [x] build and public TypeScript checks pass;
- [x] unit, adapter, compatibility and security tests pass;
- [x] all deterministic fault scenarios pass with reported seeds;
- [x] every tarball passes content audit and isolated export import;
- [x] packed TypeScript declarations compile with library checking enabled;
- [x] packed allocation and recovery consumers pass;
- [x] unchanged aggregate functional tarball consumer passes;
- [x] external terminology gate passes with its required non-empty private
      denylist.

## Release-environment gates

- [x] use a repository-scoped npm publisher credential or Trusted Publishing
      workflow;
- [x] run from the reviewed commit on a clean `main` checkout;
- [x] record current `next` rollback targets for all packages;
- [x] complete the no-mutation publish dry run with `NPM_DIST_TAG=next`;
- [x] confirm the candidate is absent or registry-equivalent for every package;
- [x] publish missing packages under the commit-specific staging tag;
- [x] verify SHA-512 registry integrity for every package;
- [x] promote the complete coordinated package set to `next`;
- [x] remove candidate staging tags only after complete promotion;
- [x] install exact versions in an independent clean registry consumer;
- [x] create and push `v0.3.0-alpha.2` at the verified release commit;
- [x] record workflow URL, commit, publication time and registry evidence.

## Release evidence

### Reviewed changes

- resilience implementation and verification:
  [PR #33](https://github.com/Agentplat/agentplat/pull/33), merged as
  `7e82719b6923bf2d320c6c411890e9edc6918b62`;
- release candidate and coordinated publisher:
  [PR #34](https://github.com/Agentplat/agentplat/pull/34), merged as
  `b4e55e3c51a3cc9324eb8877814533284b6d240f`;
- credential-isolated pack verification:
  [PR #35](https://github.com/Agentplat/agentplat/pull/35), merged as release
  commit
  [`675ad40e5c3e2fc4eb1c5a7131db4893f076bc8b`](https://github.com/Agentplat/agentplat/commit/675ad40e5c3e2fc4eb1c5a7131db4893f076bc8b).

The release workflow runs from a clean `main` checkout, pins its third-party
actions by commit and exposes the npm credential only to the real publication
step. Credential-free install, audit, check, dry-run and exact-version consumer
steps use an isolated npm configuration. The repository's `NPM_TOKEN` secret
supplied the publisher credential; no secret value is present in this record.

### Candidate and no-mutation dry-run

The successful
[no-mutation dry-run](https://github.com/Agentplat/agentplat/actions/runs/30618157350)
ran as `douglas-grishen` against release commit
`675ad40e5c3e2fc4eb1c5a7131db4893f076bc8b` from
`2026-07-31T08:57:45Z` through `2026-07-31T09:00:29Z`.

- the non-empty private external-terminology denylist was available to the
  audit without exposing its contents;
- the unit suite completed 364 test entries: 358 passed, six remained explicit
  TODO entries and zero failed; the adapter suites completed 13 tests, left two
  environment-gated integration tests skipped and had zero failures;
- pack verification produced 28 exact-version tarballs and validated 32
  package export paths, packed declarations, signed three-peer delivery,
  allocation and recovery fencing, and the aggregate functional consumer;
- the workflow recorded `0.3.0-alpha.1` as the `next` rollback target for all
  28 packages;
- the candidate version was absent for all 28 packages before publication;
- the dry-run simulated publication and promotion under
  `agentplat-stage-675ad40e5c3e` and completed without registry mutation;
- a separate credential-free registry check immediately afterward confirmed
  all 28 `next` tags still targeted `0.3.0-alpha.1`, the candidate remained
  absent and no package retained a staging tag.

An earlier credential-free preflight stopped before publication when inherited
npm configuration required an unavailable credential. PR #35 isolated that
configuration; the successful execution above is the canonical dry-run. No
registry or Git mutation occurred in the stopped preflight.

### Coordinated publication and clean consumer

The successful
[publication workflow](https://github.com/Agentplat/agentplat/actions/runs/30618368153)
ran as `douglas-grishen` against the same release commit from
`2026-07-31T09:01:07Z` through `2026-07-31T09:06:32Z`.

- it re-ran the full audit and candidate gate before accessing the publisher
  credential;
- at `2026-07-31T09:03:37Z` it recorded all 28 rollback targets as
  `0.3.0-alpha.1`;
- it published all 28 packages under `agentplat-stage-675ad40e5c3e`; the npm
  uploads completed from `2026-07-31T09:03:38.817Z` through
  `2026-07-31T09:04:27.103Z`;
- it read each published version's registry integrity metadata and matched it
  to the locally packed tarball's SHA-512;
- only after the coordinated set passed did it promote every package to
  `next`;
- it removed all 28 commit-specific staging tags after complete promotion and
  reported the coordinated publication at `2026-07-31T09:06:25.642Z`;
- an independent clean consumer installed and exercised four exact registry
  packages at `0.3.0-alpha.2`, completing at
  `2026-07-31T09:06:29.080Z`.

### Independent registry and Git verification

A separate credential-free registry check after publication confirmed that all
28 cataloged packages expose `next=0.3.0-alpha.2`, every published package
version has valid SHA-512 integrity metadata and no staging tag remains. The
ordered integrity ledger below has SHA-256 digest
`552feb184d9bdf416994d424fc666716afbad56962fbe0fffd33314b38fa84fb`:

This result is reproducible without credentials by querying `dist.integrity`
and `dist-tags` from the public npm registry for every publishable entry in
`config/public-packages.json`, sorting by package name and hashing the
newline-terminated ledger.

```text
@agentplat/audit=sha512-ux9asN9J5xc06zgc9SvZpf19fJMTFif4nwIkQ0YGo+YhzIBPrKdKYRZPcz9uV02pK6WoDpOpuQLez4RWhiZw+g==
@agentplat/audit-postgres=sha512-k1TKs0jT3ohrgmXfsily1P+UHCVY1c4wAC1s1lG4b0TUomRpTedIbsDAcGohUIMZ0369SrDFXHr41VTzFpgJRQ==
@agentplat/auth=sha512-Ea0BT3CzkobC33hpfC8I88LxIu+S3kMfm0em63YTkRbQoLE+xZ4tAsHnVsdKyrhL5Y9X2b1eDReaC0ydnV5w7g==
@agentplat/core=sha512-S11rHgUQDIeeORMC1RRknHCIqbiTORNjmJIRrwhQzrSHLJkKHryM/H60m0nbEbS8/kLZBhse00mgHS9NZbDcJQ==
@agentplat/events=sha512-zagRiBBhyCGG2Nj2jRenscsOfw8rz3igoLtsuPJB1tdFMefkw/G5LBVc6XEZ2V177W++MKqki3WAFpBzeVmUnw==
@agentplat/framework=sha512-uLB0A3L7nSI1+5lISL7haOXMKqOiBQdAal7ZqNRFJzi3Ox3LLG5T34BWZl66RkSH4QUP88X5Pd0YD1AJxrSK8Q==
@agentplat/mcp=sha512-/54BkzqhKggfU7oHr62701hV7Fqxr0zWY0xgilCGyxbcqsu8a3+fopKg4lV3VaestIiMiLx6Yl9Luc8X4ao/fg==
@agentplat/memory=sha512-RmR+GEQKEUPsx0WJlZxfzbmxER5kd54y74FKFSZSoFgb64hL+DK4275zsNdTsFkh5IE2kZhVMX4GzzF5XcjQtg==
@agentplat/mesh=sha512-NhNFWJxkYB+GS8bnF800rZG2iXGlBbKnpAlbSSBZKin1H2c4z/qAEZB6msESsYI5rIFbQ8xWWyMUUGOxPdAdfw==
@agentplat/mesh-crypto=sha512-jTw3680j9WAng9CwMeDffPnToVccPEWdRwA4a59IYVgztVvD/GC4nZoqGQZRYW8D3DQdxmUk2kYBYIC4Y+prqA==
@agentplat/mesh-protocol=sha512-MPDK80lGayQnkxyzTrgC2EumjkQa9jV01ESwGpIurijoXAaNH0usNtIpxfrH8Ec+yUuiw5kSM9RnXutQ5sOr4Q==
@agentplat/mesh-sim=sha512-RNe3TLgG41QFZqarR7PaKbBNleKj3SPrta7wVnGRlfwyrdSByA2d7tsULMPE+zhxQ/SjJE42XZOE0QC573+HAA==
@agentplat/model=sha512-uenMGuxJZrgEU25N6wOz2NyaMoO6tb3f6yUg5tiemCtxPmx+DDHpcLhTmFjp4fn0QxAtSyLPfl8l3hzlHQwabQ==
@agentplat/model-anthropic=sha512-2G8sAfsKaVQAoJn8TtoRWkO7OB5UfT9g01n15D0H86AlZ5DMfv7iBzMh2DiNZPrPAOYs7NOkaX8HsQAQ73jHag==
@agentplat/model-gemini=sha512-413SswLxbxZISkEAbxLV0uJvh5HFHMN5oqJifrgGrs4lX1YBLGFzWpf5PNcEByJGVA7BpTCCltFQSRbnUO1EOw==
@agentplat/model-openai-compatible=sha512-P+98R1Tazy++5UQwJUQZELhiDsD6zuWHeOP7PSjglkuyO2jp2LDIrp/QVdCfimDP6NumBIZ7mFknaKwFVHPPbw==
@agentplat/postgres=sha512-FMx9AUN61hFqkPRfOmF8O37asc35IhGPT7AamZ2wonPbOn0zhhTvwpJmOlZcw6O+hPWGudgDbEEbuY3Wu25laQ==
@agentplat/provider-openai=sha512-ue1IJfrrw+m+zW/YuoheShTFK46nE1CkLeoOjZhQUVFky2O9R5jZoyULoP2vQPGAbtGljjEWKPxx7g+UhH31vA==
@agentplat/rooms=sha512-V3QlrR6aT+jN6UapHdTWB1ui3FPJdSgTGxYMiUcLWX0bxB5dRJ0WEAwM6RwYhzOtj7l74Cu7OatSdazXVbA2Mg==
@agentplat/rooms-api=sha512-3BlPZzVjOV+lm0HdG0xhHvhM39bigpTWHcCYpO6BnDPTPu5cOA8aTvH2gbxkHq+IMFAZkgTTSlmaz9mH/Orj9A==
@agentplat/rooms-postgres=sha512-2oZq5SMk2Kygd5p19j/1C7CXwMmyDIH94CBGWURqxeL58GjSy07RuNfNniNJ4dDL/DPjhy/Xq0/YPCtRUPfXjw==
@agentplat/runtime=sha512-ooRHjjVM5GVoiZwwkzLCi2IT8j66314TFBz/s4vxL0S2GzoTiqe3Jj43bB0nMdQSV7z26vszpg2SqwcdrA+l7g==
@agentplat/runtime-mock=sha512-lRsw7dLa9JxmSTLxX6CiWIDH1Ppyk8iFDUAGa1Lhp7ZKoEk+dMW+yiTgKSIx+QKPXWfMppc9xSzQGkgr6cNd2w==
@agentplat/sessions=sha512-UbtjVdM4Aa0UxsHQucG7YcAJiRqnrZPPWF999khT6A3axSLa9lt2MKZVId9zOvAJ36gt40k/8hm0iQbTxUrbVQ==
@agentplat/sessions-redis=sha512-1dxkraPZNK2i65AUd+5bV1Jk5+Icn7g49jfhtV4gE568xAQjqHDDeYk8qnkP10rn3l2DpQ6dov+kA/NgeACuRg==
@agentplat/streaming=sha512-WpaL2fpqfwf1xPgARiosgYG8/D4xGrnlZ0pXjBwKY1IX9iFRH0Cl0pO3lxUa26AWOD94yAdw2QtKzXl4NE7npA==
@agentplat/tools=sha512-m9CG2KnW/CRmgUQ9mGjFK1Um1z576lNuXhqG9XbvzdLuZQVtn5RV7uy+M9BoCu1t9txTj50IkAXdS6OAkQkwRw==
@agentplat/workflows=sha512-EV/GvJdfu0kIJGTqSZNK3phcDWhcqaDjq41EYGj17IbE/UDc3WJrhcwSlj27ljYbEIXo5qFUcLd5pXDl2Gmoow==
```

The annotated
[`v0.3.0-alpha.2`](https://github.com/Agentplat/agentplat/releases/tag/v0.3.0-alpha.2)
tag was created at `2026-07-31T09:07:24Z`. Tag object
`a6c325c9052cfdbdfa60040e15d6aa847aca8c56` peels to the independently verified
release commit `675ad40e5c3e2fc4eb1c5a7131db4893f076bc8b`.

## Definition of accepted

Alpha 2 is accepted only when every applicable item above is checked and linked
to evidence. A failed safety invariant blocks the release. A failed liveness
scenario blocks the release only when its documented liveness assumptions were
present; absence of quorum or owner is an expected bounded outcome, not a
reason to create weaker authority.
