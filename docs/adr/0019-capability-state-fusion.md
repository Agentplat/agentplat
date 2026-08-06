# ADR 0019: Capability-state fusion is a local narrowing boundary

- Status: accepted
- Date: 2026-08-06

## Context

The productive peer node already retains bounded discovery, planning,
allocation, continuity and recovery state. Separate opt-in components can also
project Trust, longitudinal role alignment, execution capacity, sparse-overlay
reachability and checkpoint availability.

Those signals previously met only at application-specific seams. Recipient
selection used current capability advertisements; bidding and acceptance used
local registrations; award selection used capability evidence, price and
completion time. A consumer could manually filter one of those paths while
leaving another path open. This made it difficult to express one conservative
local eligibility policy across the complete peer lifecycle.

## Decision

Add the browser-safe opt-in
`@agentplat/collective-runtime/capability-state` entry point and an optional
construction-bound port on `CollectivePeerNodeRuntimeV1`.

The feature has three layers:

1. strict content-free candidates, signals, policies, requests, decisions and
   snapshots with canonical SHA-256 digests;
2. a pure fusion reducer plus a revision-checked runtime/store boundary; and
3. an optional peer-node adapter that consults fusion before offering, bidding,
   awarding, accepting/executing or entering recovery.

Capability-state fusion is not a selector. It returns `eligible`, `restricted`,
`ineligible` or `unavailable` for every supplied candidate. The peer node
passes only `eligible` candidates to its existing deterministic selection,
allocation and certified recovery algorithms.

The exact required dimensions are policy-bound per operation. Missing,
expired, future-dated or rolled-back signals produce `unavailable`. A
same-revision digest conflict produces `ineligible`. Restricted state is
retained for diagnosis but is not promoted by the node.

The state reducer preserves a high-water logical time and one bounded head per
candidate, dimension and source. The head carries only source binding,
revision, signal digest and expiry. It carries no prompts, outputs, private
model state, credentials or raw Trust evidence.

## Consequences

- One policy can close every candidate-selection path of a productive peer.
- Trust, role, capacity, route and recovery sources remain independently
  replaceable and provider neutral.
- The port can only remove candidates; it cannot create Work, authority,
  leases, fences, grants or effects.
- Safety may reduce availability when a required projection is missing or
  contradictory.
- Durable deployments must provide a CAS store that retains the high-water
  state across restart. The in-memory store is for local use and tests.
- Existing peer nodes retain their previous behavior unless the port is
  installed.
- Sparse overlay remains responsible for bounding the local peer view; fusion
  never accepts global membership state.

## Alternatives considered

### Put Trust checks only in allocation

Rejected because offer routing, local bidding, acceptance and recovery could
still bypass the same eligibility policy.

### Replace allocation with a global fusion scheduler

Rejected because it would introduce a coordinator and global state, and would
discard the existing peer-local selection and consensus boundaries.

### Let the model choose from raw signals

Rejected because model output is not a currentness, Trust or authority proof,
and provider prompts are neither durable nor rollback protected.

### Treat missing information as neutral

Rejected for protected coordination because partial observability must not
silently widen eligibility.
