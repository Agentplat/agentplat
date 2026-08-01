# AgentPlat `0.3.0-beta.2` Governed Collective Runtime implementation plan

Status: design candidate. No implementation is authorized until the design
review records zero open P0, P1 and P2 findings.

## Objective

Beta 2 turns the existing coordination, policy, trust and collaboration layers
into an opt-in, end-to-end governed execution path. A local deployment must be
able to prove that each accepted objective, work assignment and external effect
was authorized by a current delegation, stayed within capability and budget
ceilings, survived revision/revocation checks and produced bounded redacted
evidence.

The milestone also adds a reproducible evaluation contract. It must compare a
governed distributed collective with an equivalent centralized scheduler under
the same mission and fault inputs, and produce statistically valid aggregate
results while retaining exact per-seed replay.

The public milestone name is **Governed Collective Runtime**. Its industry
vocabulary is:

- Delegation Mandate;
- Work Contract;
- Local Policy Adapter;
- Governed Action Permit;
- Collective Evaluation Harness;
- Resilience Lab.

## Research hypothesis

For versioned bounded missions, a sparse collective governed by local mandates,
current assignment authority and fenced action permits can preserve mission
success and recover from declared benign and adversarial faults without giving
peers ambient authority, while keeping communication growth below all-to-all
broadcast and remaining competitive with a centralized scheduler under the
same information and interaction budget.

This is a falsifiable engineering hypothesis, not a product promise. Beta 2
tests it at 500 logical agents and 5,000 accounted interactions. Later scale
claims require separate milestones and evidence.

### Primary endpoints

The registered experiment uses these primary endpoints:

1. mission success rate;
2. authorization-safety violation count;
3. external-effect fencing violation count;
4. recovery interactions after the first recoverable fault;
5. communication growth as a function of active agents;
6. role-coherence horizon under context manipulation.

Any non-zero authorization-safety or fencing violation fails the milestone.
Mission success, recovery and role coherence are reported with two-sided 95%
Wilson confidence intervals for proportions or bias-corrected bootstrap
intervals for bounded non-normal measurements. The implementation must not
claim superiority when the pre-registered interval includes the declared
equivalence margin.

### Secondary endpoints

- completed work items per 1,000 interactions;
- useful-to-total interaction ratio;
- p50, p95 and maximum work completion interactions;
- rejected stale/revoked actions;
- budget utilization and stranded reservations;
- reassignment count and duplicate-result suppression;
- challenge, abstain, escalation and denied-action rates;
- trace bytes per interaction in metrics, digest and full recording modes;
- wall-clock and memory diagnostics on the controlled release runner.

Wall-clock and memory measurements are diagnostic, not capacity commitments.

## Release identity and baseline

- release version: `0.3.0-beta.2`;
- npm distribution tag: `next`;
- compatibility baseline: `v0.3.0-beta.1`;
- baseline public merge: `e210387fb4ef4f0e44f85806c9223a9233c98cb9`;
- wire version: `1`, unchanged;
- supported wire versions: `{0, 1}`, unchanged;
- coordinated package count: 36 after adding two packages;
- release source: one reviewed public commit;
- release evidence: separate immutable follow-up commit after registry and tag
  verification.

All existing package versions advance together. Wire, mandate, permit,
snapshot, database migration, evaluation report and conformance report versions
remain independent.

## Verified Beta 1 baseline

The clean design checkout is rooted at the public Beta 1 evidence merge. The
baseline provides:

- signed Mesh discovery, objectives, work allocation, leases, fencing and
  recovery;
- deterministic simulation with crash, loss, duplicate, delay, reorder,
  partition and clock faults;
- local Inference Control, assessments, Action Grants and Action Gateway;
- scoped Trust profiles that never mint authority;
- durable Rooms and a pure Rooms/Mesh projection boundary;
- HTTP and PostgreSQL Mesh adapters;
- wire/persistence fixtures, current/previous compatibility and a public
  conformance package;
- coordinated packing, registry-consumer and release-evidence gates.

The missing capability is not another coordination protocol. It is a portable,
durable composition boundary that proves and enforces the complete local
authority chain and evaluates collective behavior at mission scale.

## Non-goals

Beta 2 does not:

- add or change a Mesh message family, payload field, signature profile or wire
  version;
- make a URI, digest reference, Room role, approval, Trust score, model output
  or peer claim authoritative by itself;
- replace Mesh assignment, Inference Control, Trust or Rooms state machines;
- turn the portable package into a hosted coordinator or global control plane;
- require PostgreSQL, a particular transport, model provider or deployment
  platform;
- expose private reasoning, raw prompts, secrets or unredacted tool payloads as
  ordinary evidence;
- promise exactly-once delivery or exactly-once external effects;
- automatically retry an indeterminate external effect;
- permit unobservable provider-native tools when policy requires interception;
- change Runtime, Sessions, Rooms or Framework default behavior;
- re-export the new packages from Framework;
- treat a conformance pass as deployment certification;
- treat one deterministic seed as statistical evidence;
- extrapolate the 500-agent result into an untested capacity claim.

## Architecture and dependency boundaries

### New package: `@agentplat/collective-control`

This provider-neutral collaboration package owns:

- closed JSON contracts for mandates, Work Contracts, governed permits,
  revocations, reservations, decisions and evidence;
- canonicalization, digests, validation and immutable state transitions;
- repository, issuer, verifier, clock, policy, budget and evidence ports;
- the Local Policy Adapter for objective admission, work authorization and
  protected actions;
- in-memory reference repositories for local development and tests;
- provider-neutral experiment/report contracts;
- no import-time I/O, global registry, network listener or model SDK.

The public catalog classifies it as `collaboration`, publishable,
provider-neutral and pack-smoke required. Dependency traversal proves the root
contracts and `./evaluation` graph browser-safe, so those two entrypoints are
declared for browsers; adapters that can dispatch effects remain server-only.

Planned subpaths:

| Subpath        | Responsibility                                                     |
| -------------- | ------------------------------------------------------------------ |
| `.`            | contracts, validation, canonical digests and state transitions     |
| `./mesh`       | governed wrappers around existing Mesh coordination boundaries     |
| `./actions`    | permit issuer, reservation ledger and governed Action Gateway      |
| `./rooms`      | proposal/evidence contracts; no Room mutation or authority minting |
| `./evaluation` | mission, baseline, samples, intervals and report validation        |
| `./memory`     | bounded single-process reference repositories                      |

The package may depend on `@agentplat/mesh`, `@agentplat/mesh-protocol`,
`@agentplat/inference-control`, `@agentplat/trust` and type-only Room contracts.
It must not depend on HTTP, PostgreSQL, provider SDKs, conformance or Framework.

### New package: `@agentplat/collective-control-postgres`

This adapter package owns:

- additive migration 1 for mandates, revision/revocation high-waters, permit
  reservations, budget ledger, effect outcomes and evidence anchors;
- transactionally fenced repository implementations;
- claim/reconcile workers driven explicitly by the application;
- advisory locking and migration checksum history;
- retention/pruning APIs that preserve required chain anchors;
- no import-time migration, worker, timer or network behavior.

It depends on the portable package and `@agentplat/postgres`. Production core
packages never depend on it.

The public catalog classifies it as `adapter`, publishable, provider-neutral,
pack-smoke required and without browser entrypoints.

### Existing package changes

`@agentplat/mesh` remains authoritative for admitted peers, objectives, work,
assignment, leases, epochs and fencing. No existing reducer or signed schema is
weakened. The governed adapter evaluates the existing inbound processor into an
immutable candidate, then publishes that candidate only if the local mandate
binding succeeds. A governed rejection retains only the candidate's advanced
inbound replay state and the original domain state.

`@agentplat/inference-control` remains authoritative for context assessments,
provider capabilities, Action Grants and the existing Action Gateway. It gains
an additive `ActionGrantRepository` compare-and-swap storage port so the current
`LocalGrantLedger` and a durable adapter can store identical immutable grant
generations. The Action Gateway, not the repository, continues to own and
validate issue/reserve/settle transitions. Existing grant shapes, constructor
call sites and direct gateway behavior remain unchanged.

The repository port exposes exact create/load/idempotency lookup and
generation/digest compare-and-swap operations that may be synchronous or
asynchronous. It does not expose `markDispatched` or another semantic shortcut.
The gateway validates every loaded record, computes the only legal next state
and retries bounded CAS conflicts. Repository unavailability and exhausted
contention fail closed.

`@agentplat/trust` supplies scoped evidence and policy outcomes. It cannot issue
mandates, permits, grants or assignment authority.

`@agentplat/rooms-mesh` gains pure helpers that create a bounded mandate proposal
from an explicitly accepted Room decision and project governed evidence back to
ordinary Room messages/artifacts. The helpers do not accept, sign or persist a
mandate and do not execute work.

`@agentplat/mesh-conformance` adds a `./control` suite for portable repository,
adapter, permit, revocation and evidence contracts. Production packages do not
depend on it.

`@agentplat/mesh-sim` gains an evaluation driver that runs the production
reducers and local adapter with virtual adapters, plus a centralized runner
backed by the existing deterministic `MultiAgentSession` round-robin scheduler
and recorded/runtime-mock responses. The evaluation driver cannot read global
state to make peer decisions. This preserves the centralized baseline selected
by ADR 0004 instead of introducing a second session scheduler.

## Public contracts

### `DelegationMandateV1`

The closed immutable document contains:

- `schemaVersion: 1` and `mandateId`;
- `tenantId`, `policyDomainId` and `issuerId`;
- `revision`, optional `predecessorDigest` and canonical `mandateDigest`;
- exact sorted subject peer IDs;
- objective selector: exact objective ID, document ID and allowed revision
  range;
- optional work selector: exact IDs/revision range and permitted roles;
- allowed capability keys and action namespace/tool/operation patterns;
- total budget, per-work ceiling, per-action ceiling and reservation lifetime;
- maximum concurrent work and action reservations;
- `validFrom`, `validUntil` and trusted-time verification metadata;
- optional Room proposal provenance, treated only as evidence;
- issuer proof or local attestation reference;
- redaction policy and evidence retention class.

Identifiers, arrays, patterns, times, budgets and canonical bytes have hard
upper bounds. All set-like arrays are sorted and unique. Unknown fields fail
closed. Floating-point numbers, negative zero and non-finite values are
forbidden.

Mandate validity requires an exact construction-bound issuer, proof policy,
tenant/domain scope and trusted time. A proof verifies authenticity; it does not
by itself install or accept the mandate.

### `DelegationRevocationV1`

Revocation is a closed local record binding mandate ID, minimum revoked
revision, mandate digest, issuer, reason code, effective time, proof and
monotonic generation. A repository retains the highest accepted revision and
revocation generation. Restore or replay cannot lower either high-water.

Revision rules are linear per mandate ID. Revision `n + 1` names the exact
digest of revision `n`. Forks at the same revision are conflicts and remain
fail-closed until an operator resolves them through an explicit, audited local
policy action.

### `WorkContractV1`

A Work Contract is a local immutable projection, not a new Mesh wire message.
It binds:

- mandate ID/revision/digest;
- objective ID/document/revision and accepted-message ID;
- work item ID/revision and objective policy snapshot;
- owner peer, selected peer/instance, assignment authority ID, epoch and
  fencing token;
- lease and work deadlines;
- required capabilities, completion criteria and input reference digest;
- reserved budget and maximum action budget;
- policy/Trust/inference requirements;
- contract digest, generation, status and terminal outcome.

It can only be created from already accepted current Mesh state plus a current
mandate. It narrows both; it cannot enlarge capabilities, budget, validity or
assignment lifetime.

Lifecycle:

```text
proposed -> active -> completing -> completed
                 |         |            |
                 +---------+------------+-> revoked
                 +-----------------------> expired
                 +-----------------------> released
```

Only repository-fenced commands may advance lifecycle generation. Terminal
states never return to active.

### `GovernedActionPermitV1`

A permit is short-lived, single-use and local. It binds:

- permit ID, issuer/gateway IDs and schema version;
- exact Work Contract and mandate IDs/revisions/digests;
- exact Action Grant ID and canonical grant digest;
- coordinated Action Scope digest;
- assignment authority, peer instance, epoch, fence and authority generation;
- action binding, handler digest and input digest;
- budget reservation ID/units;
- source assessment and Trust decision digests;
- issue/expiry logical time and idempotency key;
- state generation and status.

The governed facade validates in this order:

1. closed permit shape and canonical bindings;
2. current mandate/revision/revocation/validity;
3. active Work Contract and current Mesh assignment authority;
4. current Trust and inference policy requirements;
5. current existing Action Grant and input/action bindings;
6. budget reservation and permit single-use state;
7. downstream handler binding and atomic fencing capability.

It then atomically reserves the permit and delegates to the existing Action
Gateway. The gateway is constructed with a `GovernedActionAuthorityResolver`
that intersects its existing Mesh resolver with the current mandate, Work
Contract, revocation, permit and budget records, and a
`GovernedActionDispatcher` that repeats the governed check at the gateway's
final dispatch boundary before calling the downstream handler. Final outcomes
are `dispatched`, `failed` or `indeterminate`. A crash between external commit
and durable acknowledgement resolves through the downstream idempotency/fencing
record; absence of proof remains indeterminate.

Permit lifecycle is generation fenced:

```text
issued -> reserved -> dispatching -> dispatched
   |         |             +-------> failed
   |         +---------------------> indeterminate
   +-------------------------------> expired
```

The outer repository settles from the durable Action Grant state and downstream
proof, never from an exception class alone. A grant still `issued` after a
pre-reservation denial permits the outer reservation to fail/release. A grant
`failed` releases unused budget exactly once. A grant `dispatched` commits the
budget. A grant `reserved` or `indeterminate` after worker loss forces the outer
permit to `indeterminate`. Contradictory outer/grant/downstream states are a
reconciliation conflict and retain budget while emitting an alert record.

### Local Policy Adapter

Construction-bound dependencies include:

- local identity and policy domain;
- issuer registry and proof verifier;
- trusted wall/logical time source;
- mandate, revocation, Work Contract, budget and permit repositories;
- existing Mesh inbound processors and current state reader;
- existing Trust policy and inference-control boundaries;
- existing Action Gateway;
- evidence sink and redaction policy;
- hard resource limits.

The adapter exposes explicit operations rather than a background singleton:

- `acceptMandate`, `reviseMandate`, `revokeMandate`;
- `processGovernedObjective`;
- `openWorkContract`, `refreshWorkContract`, `terminateWorkContract`;
- `issueGovernedActionPermit`, `dispatchGovernedAction`;
- `reconcileReservation`, `reconcileIndeterminateEffect`;
- `snapshotEvidenceAnchor`.

Every operation returns a closed accepted/rejected decision with a stable reason
code. Exceptions are reserved for programmer/configuration errors and adapter
unavailability. Remote invalid data never becomes an uncaught exception.

## Objective binding without a wire change

The existing objective `contentReference` may contain:

```text
urn:agentplat:delegation-mandate:sha256:<64 lowercase hex characters>
```

The governed adapter requires the exact digest for announce/revise messages. It
first runs the existing Mesh inbound processor against immutable input/state.
If the processor rejects, that decision is returned unchanged. If it accepts,
the adapter resolves the digest from the verified envelope and validates
objective, issuer, peer, revision, capability, budget and validity scope before
exposing the candidate domain state. A mandate rejection returns the original
coordination/discovery/objective state with only the processor's advanced
inbound replay state, so invalid authority cannot mutate the domain or be
replayed without accounting. A caller must issue a new signed message ID after
installing previously missing local authority. Cancellation uses the accepted
objective head's retained binding.

Revocation blocks announce/revise, new work, permit issuance and dispatch, but
does not block an otherwise valid cancellation or local terminal transition
that can only reduce authority. Safe terminal transitions retain the prior
binding and cannot revive, widen or reassign work.

Other content references remain valid for existing direct Mesh APIs but are
rejected by the opt-in governed adapter. The protocol parser and signature
bytes do not change.

## Authority, budget and revocation semantics

### Authority lattice

Authority is an intersection, never a union:

```text
local mandate
  ∩ accepted objective policy
  ∩ current work assignment/lease/fence
  ∩ current Trust policy outcome
  ∩ current inference assessment and Action Grant
  ∩ local handler/downstream fencing policy
= permitted effect
```

Missing, stale, conflicting or broader inputs reject. No layer can compensate
for a denial in another layer.

### Budget accounting

Budget uses non-negative safe-integer units defined by the application policy.
The core does not assign currency or token semantics. The ledger records:

- mandate total ceiling;
- committed completed units;
- active work reservations;
- active action reservations;
- released units;
- indeterminate units retained against the ceiling.

Reservation is compare-and-set/transactional. The same idempotency key with the
same digest returns the existing record; the same key with a different digest
is a conflict. Indeterminate units are not automatically released.

### Revocation propagation

Revocation is checked on objective announce/revise admission, Work Contract
open/refresh, permit issuance, permit reservation and immediately before
dispatch. Durable reconciliation terminates active contracts and expires
unreserved permits. It still permits authenticated cancellations and local
terminal transitions that strictly reduce authority. Already committed effects
remain evidence; revocation cannot undo them.

The acceptance target is zero successful post-effective-time dispatches after
the local repository has durably accepted a revocation. The report separately
measures propagation interactions before each node observes a newly distributed
revocation; remote propagation is not represented as instantaneous.

## Evidence contract

Every accepted/rejected governed transition emits or returns a bounded
`CollectiveDecisionRecordV1` containing:

- stable event/reason code and logical time;
- tenant/policy/mandate/work/permit identifiers and canonical digests;
- peer, assignment authority, epoch and fence where applicable;
- budget delta and reservation/outcome IDs;
- input/action/assessment/Trust digests, never unrestricted raw values;
- previous record digest and current chain digest;
- implementation, contract and configuration versions.

Evidence sinks receive already-redacted records. Sink failure cannot turn a
denial into approval. Policies may require durable evidence before dispatch; if
so, sink unavailability fails closed. Chain anchors are snapshot/exportable and
bound into evaluation and release reports.

## Provider portability

The adapter relies on declared `ProviderControlCapabilities`. Policy selects
the minimum capabilities required for each work/action class. Black-box models
remain eligible for controls observable at input/output/tool boundaries.
Policies requiring stream interruption, provider-native tool interception or
representation access reject providers that cannot supply them.

No provider brand, SDK or hidden model state is part of a mandate or evaluation
contract. Deterministic release scenarios use recorded/runtime-mock responses;
optional live-provider experiments are non-normative and excluded from the
release gate.

## Collective evaluation contract

The normative details live in [the evaluation contract](./evaluation-contract.md).
At minimum, Beta 2 includes:

- one versioned resource-allocation/recovery mission with multiple roles;
- a governed sparse-collective runner using production reducers;
- an equivalent `MultiAgentSession` centralized baseline;
- a required scale ladder at 50, 100, 250 and 500 agents, with the 500-agent
  sample capped at 5,000 accounted interactions;
- benign fault families: crash/resume, loss, duplicate, delay, reorder,
  partition/heal and bounded clock offset;
- adversarial families: stale/replayed mandate, revision fork, forged reference,
  context manipulation, capability inflation, budget replay, stale assignment,
  grant substitution and colluding evidence claims;
- exact per-seed replay and aggregate statistical reports;
- a 1,000-step context-manipulation scenario for role-coherence measurement;
- sparse topology and observed edge/message growth reporting.

## Conformance and negative implementations

`@agentplat/mesh-conformance/control` declares capabilities for mandate,
repository, adapter, permit, evidence and reconciliation cases. Core portable
cases are mandatory. Declaring PostgreSQL or Rooms closes their complete
associated case sets.

Negative implementations must prove suite sensitivity to at least:

- accepting an unknown mandate digest;
- lowering revision or revocation high-water on restore;
- widening capability/budget during Work Contract creation;
- dispatching with a stale assignment fence;
- reusing a permit or budget reservation;
- substituting an Action Grant/input/handler binding;
- auto-releasing an indeterminate reservation;
- trusting Room or Trust data as authority;
- omitting failed seeds or altering registered experiment inputs;
- leaking a canary secret into evidence or reports.

## Compatibility strategy

Beta 2 is additive:

- all Beta 1 exports and direct behaviors remain available;
- no existing public property becomes required;
- protocol v0/v1 fixtures remain byte-identical;
- all Beta 1 snapshots and database rows remain readable;
- new snapshots have explicit format/schema identifiers and are never inferred;
- new PostgreSQL tables/migration are additive and migration never runs on
  import;
- Alpha 5 and Beta 1 packed consumers still compile and run unchanged;
- governed behavior is reached only through new packages/subpaths or explicit
  adapter construction;
- browser-safe packages retain their dependency constraints.

Rollback drains or terminates governed reservations before running a Beta 1
binary. Additive tables may remain. A Beta 1 binary cannot continue a governed
reservation and must not rewrite it into an existing Action Grant.

## Implementation increments

### Increment 0 — accepted design freeze

- ADR, implementation plan, acceptance checklist, evaluation contract and
  threat model;
- architecture/API/security/evaluation review with zero open P0/P1/P2;
- exact public baseline and package graph recorded.

### Increment 1 — portable contracts and memory references

- new portable package and subpaths;
- mandate/revocation/Work Contract/permit/evidence contracts;
- canonical digests, strict validation and limits;
- in-memory repositories and exhaustive state-machine tests;
- public type tests and negative compile fixtures.

### Increment 2 — governed Mesh admission and work lifecycle

- objective mandate-reference resolver;
- immutable candidate gate around the existing Objective inbound processor,
  retaining replay-only state on governed rejection;
- Work Contract creation/refresh/termination from accepted Mesh state;
- revision/revocation/high-water and recovery tests;
- no wire or existing reducer changes.

### Increment 3 — governed actions and reconciliation

- budget reservations and permit issuance;
- additive durable `ActionGrantRepository` CAS port plus governed
  authority-resolver and dispatcher wrappers around the existing Action
  Gateway;
- durable indeterminate-effect semantics;
- exact authority/fence/grant/handler/input substitution tests;
- redacted evidence chain.

### Increment 4 — Rooms and PostgreSQL adapters

- pure Room proposal/evidence helpers;
- additive PostgreSQL migration and repositories;
- transactional fencing, concurrent-worker and crash-boundary fault matrix;
- migration/restore/rollback documentation.

### Increment 5 — evaluation and conformance

- versioned mission and `MultiAgentSession` baseline adapter;
- production-reducer collective driver;
- deterministic seeded fault/adversary matrix;
- statistical aggregation and report validator;
- control conformance suite and negative implementations.

### Increment 6 — scale evidence

- preflight small/medium runs;
- registered 500-agent/5,000-interaction experiment;
- 1,000-step role-coherence scenario;
- reproducibility replay, confidence intervals and resource diagnostics;
- checked-in machine-readable report tied to an exact commit.

### Increment 7 — release candidate and publication

- full public, build, type, unit, adapter, compatibility, conformance, pack and
  registry-consumer gates;
- public API diff and dependency/security audit;
- coordinated `0.3.0-beta.2` versioning and `next` publication;
- exact-integrity ledger, annotated tag and rollback verification;
- immutable release evidence merged from registry truth.

## Required review disciplines

Before implementation:

- architecture and dependency graph;
- authority composition and confused-deputy analysis;
- revision/revocation/budget state-machine analysis;
- crash consistency and indeterminate effects;
- API/source/browser compatibility;
- experimental fairness and statistical validity;
- privacy, redaction and public terminology.

Before release:

- implementation-to-design traceability;
- adversarial and negative-test sensitivity;
- exact packed/registry consumer behavior;
- reproducibility on a clean controlled runner;
- tag, registry integrity and evidence-commit consistency.

## Stop conditions

Implementation or release stops on:

- any open P0, P1 or P2 design/release finding;
- any authorization or fencing safety violation;
- any Beta 1 fixture or packed-consumer regression;
- nondeterministic replay for a registered seed;
- experiment input drift, failed-seed omission or invalid interval calculation;
- evidence containing a secret canary or unrestricted sensitive content;
- migration ambiguity, revision high-water rollback or indeterminate-effect
  auto-retry;
- package/version/integrity/tag mismatch;
- public terminology audit failure.
