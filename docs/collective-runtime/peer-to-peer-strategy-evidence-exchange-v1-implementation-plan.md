# Peer-to-Peer Strategy Evidence Exchange V1 implementation plan

Status: implemented

## Product outcome

Give a peer an opt-in way to share and consume authenticated, content-free
evidence about outcomes from installed local coordination strategies. The
feature improves a peer's local adaptation prior without introducing a global
controller, transmitting sensitive payloads or granting a remote peer control
over local strategy selection.

V1 exchanges strategy outcome attestations only. It does not exchange prompts,
model outputs, strategy implementations, model weights, raw control evidence
or free-form rewards.

## Public package shape

The browser-safe entry point
`@agentplat/collective-runtime/strategy-evidence-exchange` will contain:

- strict contracts and canonical digest factories for attestations, policies,
  aggregate priors, state and handoffs;
- policy and exact-key validation for source eligibility, independence,
  freshness, aggregation and retention limits;
- a pure evidence admission and aggregation reducer;
- bounded sparse-overlay gossip with deterministic deduplication, fanout and
  hop limits;
- a compare-and-swap runtime and reference in-memory store;
- content-free adapters for membership, Trust and local strategy adaptation;
- predecessor-bound export and import; and
- no provider SDK, model prompt, model output or effect executor.

## Evidence boundary

Each producer attestation binds:

- tenant, Mesh, policy-domain, mission, Objective and context-class scope;
- operation, strategy identifier, strategy and implementation digests;
- local catalog, policy, selection and feedback provenance digests;
- producer peer, instance, stream and membership epoch/configuration;
- source sequence, causal predecessor, observed logical time and expiry;
- one closed value for each fixed-point outcome metric and confidence; and
- an Ed25519 signature bound to the complete attestation.

The receiver accepts an attestation only when the exact local policy permits
its source, the membership epoch and identity are current, the scope and
strategy binding are compatible, its sequence is monotonic and its evidence is
fresh. Duplicate identical evidence is idempotent. Reordered evidence is
retained within the same policy bounds and promoted once its predecessor is
admitted. Same-source sequence conflicts quarantine that peer's active
incarnation and remove its retained evidence from aggregation.

One permanent causal head is retained per peer, not per process incarnation.
A newer membership epoch may rotate that peer to a new instance or stream and
replace the existing head, so legitimate restart churn does not consume the
bounded head table.

## Propagation and aggregation

The gossip layer forwards digest-bound envelopes through the existing sparse
overlay. A policy bounds retained identities, per-source heads, outbound
fanout, hop count, envelope age and commit attempts. It must never require a
global membership list or store an unbounded message history.

The reducer groups admissible evidence by exact cohort and strategy binding.
It requires the configured minimum number of independent eligible sources,
applies conservative deterministic medians and produces an optional collective
prior bound to the exact evidence set. Insufficient, stale, out-of-scope or
equivocating sources cannot produce usable positive influence; unsafe,
failure and indeterminate summaries are preserved as evidence but the local
adaptation mixer only applies favorable certified outcomes.

## Local adaptation integration

The adaptation adapter maps a valid aggregate prior to an equal-or-narrower
input for the local strategy adaptation controller. The adapter cannot change
the local catalog, add a strategy, alter learning or exploration limits,
remove quarantine, resume a paused operation or promote an ineligible arm.

The local controller remains authoritative for its strategy decision. Trust,
role, capability-state, context-integrity and authority vetoes remain required
and can only remove choices. A missing exchange runtime or unavailable prior
leaves existing local behavior unchanged.

## Continuity and recovery

State retains only policy-bounded source heads, admitted and pending
attestations, certificates and logical-time high water. Snapshots bind policy,
runtime implementation, source-state digest, state key and export time. Import
requires an empty target or an idempotently matching successor, uses an exact
predecessor digest and drains any newly contiguous pending chain before its
first commit.

## Acceptance

V1 is complete when:

- public records use exact-key validation and canonical digest factories;
- the exchange accepts no sensitive payload and no remote execution request;
- identity, membership epoch, scope, catalog, policy, causal and revision
  mismatches fail closed;
- bounded gossip handles duplicate, stale and reordered envelopes
  deterministically;
- robust aggregation requires independent eligible sources and never converts
  equivocation into a usable prior;
- collective evidence only informs local adaptation and cannot override local
  safety, authority, baseline, quarantine or pause behavior;
- state, restart and predecessor-bound handoff preserve high-water marks and
  cannot roll back admitted evidence;
- retained arrays and propagation are policy bounded;
- package exports, README examples and the public package catalog expose the
  subpath; and
- focused build, public type, unit, audit and packed-consumer checks pass.
