# Agent Mesh `0.3.0-alpha.2` acceptance checklist

Status: Increment 0 and Increment 1 complete; later runtime increments pending.

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
- [ ] active-work security state is not evicted with discovery state;
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

- [ ] Objective revision `1` requires an authorized issuer;
- [ ] later Objective revisions advance exactly by one and name their parent;
- [ ] conflicting content at an accepted revision is rejected;
- [ ] cancellation and expiry are terminal for one Objective ID;
- [ ] revisions do not rewrite prior allocation or budget decisions;
- [ ] Work Items require a current locally accepted Objective;
- [ ] Work Item revision and offer attempt are independent and monotonic;
- [ ] Objective limits bound Work Item count, concurrency and budget units;
- [ ] every deadline is driven by injected trusted time;
- [ ] journals and timers are bounded and backpressure is fail-closed.

## Allocation

- [ ] offers bind current Objective, Work Item revision, owner epoch, attempt,
      requirements, deadline and reservation;
- [ ] candidate selection uses only the bounded local Peer View;
- [ ] bids require a current offer and admitted eligible bidder;
- [ ] bid replacement is causal and monotonic;
- [ ] expired, stale and conflicting bids cannot be selected;
- [ ] selection is deterministic and emits stable reason codes;
- [ ] awards bind a stable domain ID, selected bid, epoch, lease and token;
- [ ] only the awarded assignee may accept or decline;
- [ ] acceptance after its deadline is rejected;
- [ ] decline or timeout releases the reservation exactly once;
- [ ] one Work Item reserves budget once regardless of fanout or bid count;
- [ ] acceptance moves reserved units to committed units exactly once;
- [ ] reassignment reuses the existing commitment without double charging;
- [ ] progress, checkpoint and result require accepted assignment authority;
- [ ] duplicate and reordered records produce the same final projection;
- [ ] result completion retains committed units as consumed Objective capacity;
- [ ] budget arithmetic rejects negative values, unsafe integers and overflow.

## Lease, epoch and fencing

- [ ] the initial assignment epoch is `1`;
- [ ] every later epoch is exactly the preceding epoch plus one;
- [ ] one epoch has exactly one stable assignment authority ID and token;
- [ ] initial fencing token equals `awardId`;
- [ ] recovered fencing token equals `certificateId`;
- [ ] renewals preserve assignee, epoch and token;
- [ ] renewals stay within Objective duration and count limits;
- [ ] expired leases authorize no new progress, checkpoint or result;
- [ ] a higher accepted epoch permanently fences lower epochs;
- [ ] a same-epoch record with a different token is rejected;
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
