# AgentPlat `0.3.0-beta.2` design review

Status: accepted. The review has zero open P0, P1 or P2 findings. The design
freeze is normative at the public commit recorded below.

This record reviews ADR 0008, the Beta 2 implementation plan, acceptance
checklist, evaluation contract and threat model against the exact Beta 1 public
baseline `e210387fb4ef4f0e44f85806c9223a9233c98cb9`.

## Reviewed inputs

- `docs/adr/0008-governed-collective-runtime.md`;
- `docs/collective-control/beta-2-implementation-plan.md`;
- `docs/collective-control/beta-2-acceptance-checklist.md`;
- `docs/collective-control/evaluation-contract.md`;
- `docs/security/governed-collective-runtime-threat-model.md`;
- ADRs 0004, 0006 and 0007;
- Beta 1 compatibility plan, threat model, API report and evidence;
- Mesh Objective inbound, Objective/Work, allocation and simulation contracts;
- Inference Control Action Grant/Gateway implementation;
- Trust authority boundaries;
- Rooms approvals and Rooms/Mesh projection contracts;
- public package catalog, release verifier, packed consumers and conformance
  package.

## Baseline verdict

The baseline already provides signed/admitted coordination, assignments,
leases, fencing, Trust evidence, local inference/action controls, durable
adapters, deterministic simulation and compatibility evidence. It intentionally
does not compose those layers into one local delegation authority.

The reviewed Beta 2 design is additive. It introduces two packages, one
provider-neutral repository port in Inference Control, opt-in adapters and
testing-layer extensions. It changes no wire payload, signature bytes,
wire-version support, existing required property or default execution path.

## Findings resolved in design

### B2-DR-001 — A mandate lookup before cryptographic verification would expose a local authorization oracle

- Severity: P1.
- State: resolved in design.
- Finding: inspecting a raw Objective reference and consulting the local
  mandate repository before the existing inbound processor could let an
  unauthenticated sender probe installed mandate digests and consume repository
  work.
- Resolution: the existing processor first produces an immutable verified and
  accepted candidate. Only that candidate reaches mandate lookup. The governed
  adapter publishes domain state only after authorization; rejection preserves
  only advanced replay state.

### B2-DR-002 — Discarding the whole candidate would make rejected signed messages free to replay

- Severity: P1.
- State: resolved in design.
- Finding: returning the original state after mandate rejection would discard
  replay/message-ID accounting and allow repeated expensive verification.
- Resolution: reconstruct the original coordination/discovery/objective state
  with the candidate's inbound replay state. A later authority installation
  requires a newly signed message ID.

### B2-DR-003 — A durable permit around an in-memory Action Grant cannot provide crash-safe evidence

- Severity: P1.
- State: resolved in design.
- Finding: the existing Action Gateway is bound to `LocalGrantLedger`; an outer
  PostgreSQL permit alone cannot reconcile a process crash against durable
  grant state.
- Resolution: Inference Control gains an additive
  `ActionGrantRepository` create/load/idempotency/CAS storage port. The Action
  Gateway retains all semantic transitions. `LocalGrantLedger` remains source
  compatible; the new PostgreSQL package implements the same immutable
  generation contract.

### B2-DR-004 — Checking revocation only before invoking Action Gateway leaves a final race

- Severity: P1.
- State: resolved in design.
- Finding: the existing gateway performs asynchronous assessment, authority and
  context work before dispatch, so a mandate can be revoked after an outer check
  but before the handler call.
- Resolution: the governed facade supplies a composed authority resolver and
  dispatcher to the existing gateway. Both intersect current mandate, Work
  Contract, permit and budget state at the gateway's own final authority and
  dispatch checkpoints.

### B2-DR-005 — Two independently settled state machines can disagree after a crash

- Severity: P1.
- State: resolved in design.
- Finding: permit, budget, Action Grant and downstream outcome cannot be assumed
  atomic across every adapter.
- Resolution: staged generation-fenced states settle from durable grant and
  downstream proof, never an exception class alone. Unknown or contradictory
  states become `indeterminate`, retain budget and require explicit
  reconciliation; no blind retry/release exists.

### B2-DR-006 — A new centralized scheduler would contradict the accepted session boundary

- Severity: P1.
- State: resolved in design.
- Finding: ADR 0004 already names `MultiAgentSession` as the deterministic
  centralized baseline. A second scheduler would duplicate semantics and weaken
  comparison credibility.
- Resolution: the evaluation runner adapts the existing deterministic
  `MultiAgentSession` round-robin scheduler with recorded/runtime-mock
  responses. It changes no Session API or behavior.

### B2-DR-007 — One 500-agent point cannot support a growth claim

- Severity: P1.
- State: resolved in design.
- Finding: comparing 500-agent edge count with one formula does not provide even
  bounded finite-range complexity evidence.
- Resolution: a required 50/100/250/500 scale ladder uses one versioned topology
  generator and normalized mission density. Reports compare observed edges and
  messages to `n`, `n log2(n)` and `n²` at every point and explicitly avoid a
  universal asymptotic claim.

### B2-DR-008 — Statistical language without fixed strata and thresholds permits cherry-picking

- Severity: P1.
- State: resolved in design.
- Finding: a generic multi-seed report could change fault mix, stop early or
  claim success from favorable endpoints.
- Resolution: the registration freezes four strata, seeds, sample counts,
  stopping, endpoints, margins and interval methods. The validator requires all
  samples and raw measurements. Nominal/benign success, paired equivalence,
  recovery and role-coherence thresholds are explicit.

### B2-DR-009 — Revocation could accidentally block authority-reducing cleanup

- Severity: P1.
- State: resolved in design.
- Finding: applying one blanket revocation check to every Objective command
  could reject cancellation and leave stale active projections.
- Resolution: revocation blocks announce/revise, new work and effects but
  permits authenticated cancellation and local terminal transitions that only
  reduce authority under the retained binding.

### B2-DR-010 — A mutable subject-set reference would make mandate scope ambiguous

- Severity: P1.
- State: resolved in design.
- Finding: a locally resolved subject-set reference could change membership
  without changing the mandate digest.
- Resolution: `DelegationMandateV1` contains exact sorted subject peer IDs. A
  future compressed/set-proof representation requires a separately versioned
  contract.

### B2-DR-011 — Rooms or Trust could become a confused deputy

- Severity: P1.
- State: resolved in design.
- Finding: a convenient bridge might treat a Room approval or positive Trust
  profile as execution authority.
- Resolution: Rooms emit proposals/evidence only; Trust emits scoped evidence
  and policy outcomes only. The construction-bound local mandate issuer is the
  sole installation authority, and every later permission remains an
  intersection of independent decisions.

### B2-DR-012 — New package dependencies could invert production and testing layers

- Severity: P2.
- State: resolved in design.
- Finding: putting evaluation or PostgreSQL implementations inside the portable
  package could make production core depend on Sessions/testing or database
  code.
- Resolution: `collective-control` is a provider-neutral collaboration package;
  PostgreSQL is a separate adapter; evaluation runners live in `mesh-sim`;
  conformance remains testing-only. No production package depends on
  conformance or simulation.

### B2-DR-013 — Reusing `contentReference` could silently redefine the Mesh wire contract

- Severity: P1.
- State: resolved in design.
- Finding: making the mandate reference universally authoritative would change
  existing Objective semantics without a new wire version.
- Resolution: the URI is interpreted only by the opt-in governed adapter. It is
  never authority without an exact local record. Existing direct Mesh APIs and
  all v0/v1 fixtures retain their Beta 1 behavior and bytes.

### B2-DR-014 — Evidence and evaluation could leak prompts or secrets

- Severity: P1.
- State: resolved in design.
- Finding: an end-to-end trace can accidentally capture unrestricted context,
  tool inputs, credentials or private reasoning.
- Resolution: evidence is allowlisted and redacted before the sink; ordinary
  records use bounded identifiers/digests. Canary scans cover evidence, traces,
  reports, logs and packed artifacts. Sink failure never upgrades a denial or
  repeats an effect.

### B2-DR-015 — Provider portability could overclaim unavailable control points

- Severity: P2.
- State: resolved in design.
- Finding: a black-box provider cannot guarantee internal representation checks
  or provider-native tool interception it does not expose.
- Resolution: every policy declares minimum provider control capabilities and
  fails closed when absent. Release evidence uses recorded profiles and makes no
  unobservable-control claim.

## Review verdicts

### Architecture and API

Pass. The two new packages have explicit catalog layers and dependency
directions. Existing source paths remain compatible. The only existing-package
contract addition broadens Action Gateway storage behind a provider-neutral CAS
port while preserving `LocalGrantLedger` and call sites.

### Authority and security

Pass. Local authority remains explicit and is always intersected with existing
Mesh, Trust, inference and downstream decisions. Candidate-state gating,
replay-only rejection, revision/revocation high-waters, final checkpoint
wrappers and indeterminate reconciliation close the identified confused-deputy,
replay and crash windows.

### Persistence and operations

Pass. Portable contracts own no I/O. PostgreSQL uses additive migrations,
generations, CAS/fencing and explicit workers. Unknown external effects retain
budget and cannot be retried automatically. Rollback cannot reinterpret new
reservations as Beta 1 grants.

### Evaluation validity

Pass. The existing centralized Session baseline and collective runner share a
registered mission, decision fixtures, interaction ledger and applicable fault
realizations. Exact per-seed replay is separate from fixed-sample statistical
aggregation. Scale, success, equivalence, recovery, role coherence and safety
gates are explicit.

### Compatibility and release

Pass. No wire/payload change is planned. New behavior is opt-in and all existing
fixtures/consumers remain release gates. Package, source, registry, tag and
evidence identity remain coordinated and immutable.

## Open design findings

P0: 0.

P1: 0.

P2: 0.

Implementation and release review is closed by the accepted checklist and
machine-readable evidence for release commit
`43037e3fa05133377672ef769140912eaf87bcef`.

## Normative commit

The normative design-freeze commit is
`36d5571748fb8818ecf5a1bf925c8af392ad13f0`, merged by
[PR #50](https://github.com/Agentplat/agentplat/pull/50). The cumulative
implementation and release tree is
`43037e3fa05133377672ef769140912eaf87bcef`, merged by
[PR #58](https://github.com/Agentplat/agentplat/pull/58) and named by annotated
tag `v0.3.0-beta.2`.
