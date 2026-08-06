# Capability-State Fusion V1 implementation plan

Status: implemented

## Product outcome

Capability-State Fusion V1 gives each productive peer one bounded, local and
provider-neutral answer to a narrow question: which currently visible
candidate remains eligible for a concrete coordination operation?

The feature does not create a global scheduler, global reputation score or
authoritative world model. It narrows candidates that the existing discovery,
planning, allocation and recovery protocols already admitted. Existing
selection rules continue to rank the remaining candidates.

## Operations

The closed V1 operation set is:

- `offer_recipient`;
- `bid`;
- `award`;
- `assignment_acceptance`; and
- `recovery`.

Every operation binds tenant, Mesh, policy domain, mission intent, Objective,
optional Work revision, required capabilities, trusted logical time and the
complete bounded candidate set into one request digest.

## Candidate boundary

A candidate is either a visible peer or a concrete local agent. It contains
only content-free identity and binding data:

- candidate, peer, instance and optional agent identifiers;
- sorted required and advertised capability keys;
- the digest of the discovery, registration, bid or recovery evidence that
  admitted the candidate; and
- an optional source record identifier and revision.

The fusion runtime cannot add a candidate. A decision must cover the request's
candidate IDs exactly once and preserve their request bindings.

## Dimensions

Capability compatibility is construction-bound by the candidate record. V1
then fuses five independent state dimensions:

- `trust`;
- `role`;
- `capacity`;
- `reachability`; and
- `recovery`.

Each operation has an exact policy-defined set of required dimensions. This
allows a remote offer recipient to require Trust, capacity and reachability
without pretending the local node can inspect the remote model's private role
state. A local bid or acceptance can additionally require role coherence.

Every dimension signal is content-free and binds:

- candidate and dimension;
- source identity, version and implementation digest;
- monotonic source revision;
- disposition: `eligible`, `restricted`, `ineligible` or `unavailable`;
- bounded reason codes;
- observation and exclusive expiry logical times; and
- a canonical signal digest.

## Conservative fusion

For each candidate:

1. missing required signal -> `unavailable`;
2. expired or future-dated signal -> `unavailable`;
3. source revision rollback -> `unavailable`;
4. same source revision with a different digest -> `ineligible`;
5. any required `ineligible` signal -> `ineligible`;
6. otherwise any required `unavailable` signal -> `unavailable`;
7. otherwise any required `restricted` signal -> `restricted`;
8. otherwise the candidate is `eligible`.

The node consumes only `eligible` candidates. Restricted state is preserved
for diagnostics but never silently promoted.

## Stateful anti-rollback boundary

The pure reducer stores one high-water logical time and one head per
candidate/dimension/source tuple. A head contains only revision, digest and
expiry. State and decisions use canonical SHA-256 digests.

The productive runtime composes the reducer with:

- an observation resolver;
- a revision-checked state store; and
- bounded compare-and-swap retries.

The reference in-memory store is for tests and local applications. Durable
deployments implement the same load/save contract. A restart cannot accept an
older signal revision when the durable state is retained.

## Peer-node integration

`CollectivePeerNodeRuntimeV1` receives an optional construction-bound fusion
port. When installed, it is consulted before:

1. sending initial or repeated Work offers;
2. submitting a local bid;
3. selecting among received bids;
4. accepting a Work award; and
5. submitting recovery proposals to the certified election port.

The integration fails closed on port exceptions, malformed decisions,
binding mismatches, expired decisions or incomplete candidate coverage. The
port may only remove candidates. It cannot mint capability evidence,
assignment authority, a lease, a fence or an Action Grant.

Existing nodes without the port retain V1 behavior.

## Scale and privacy limits

- candidate count is policy bounded and cannot exceed 256;
- dimension count is closed and constant;
- reason-code count and signal size are bounded;
- the reducer performs linear work in the supplied local candidate set;
- no global membership enumeration is accepted;
- signals contain digests and status, never prompts, model reasoning,
  credentials, private context or raw Trust evidence.

Sparse overlay selection remains responsible for producing a bounded local
peer view before fusion.

## Compatibility

- new public opt-in subpath:
  `@agentplat/collective-runtime/capability-state`;
- additive optional node configuration only;
- no wire-protocol or frozen V1 persistence change;
- no provider-specific model APIs;
- no change to Runtime, Rooms, Sessions or high-level collective defaults.

## Acceptance

V1 is complete when:

- strict contract and tamper tests pass;
- missing, expired, restricted, negative, rollback and equivocation cases fail
  closed;
- all five peer-node decision points use the port when configured;
- the native selector still ranks only the eligible subset;
- state survives export/import through a durable store implementation;
- bounded local-state tests cover a 100,000-peer profile without constructing
  global candidate state;
- public type, browser traversal, audit, release and packed-consumer checks
  pass; and
- documentation and source use industry terminology only.
