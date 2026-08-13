# AgentPlat `0.3.0-beta.3` acceptance checklist

Status: Increments 0 through 12 are complete at the open-source implementation
boundary. Increment 9 added the bounded diagnostic executor and local durable
adapter; Increment 10 adds the protected, fail-closed normative control plane,
independent analysis and evidence custody; Increment 11 adds a registered
provider-neutral runtime, transactional cross-host custody and a bounded
protected preflight. Increment 12 adds the non-executing campaign-readiness
contract, capacity estimate, exact evidence closure and derived Go/No-Go
recommendation. Their implementation evidence is
recorded in the [Increment 9 review](beta-3-increment-9-review.md) and
[Increment 10 review](beta-3-increment-10-review.md), followed by
[Increment 11](beta-3-increment-11-review.md) and
[Increment 12](beta-3-increment-12-review.md). The protected preflight bound to
the final source, the resulting readiness assessment, execution of the complete
normative statistical campaign and release publication remain open. Every
unchecked item remains release-blocking unless it is explicitly labeled
diagnostic or deferred.

## Design freeze

- [x] ADR 0009, implementation plan, threat model and evaluation V2 contract
      are reviewed against exact public Beta 2 baselines.
- [x] Design review records zero open P0, P1 and P2 findings.
- [x] Public terminology uses only approved industry vocabulary.
- [x] Package dependency graph is acyclic and browser-safe roots remain clean.
- [x] `wireVersion: 1`, protocol fixtures and existing signed payload unions are
      unchanged.
- [x] Existing Runtime, Sessions, Rooms, Mesh, Trust, Inference Control and
      Collective Control defaults remain unchanged.
- [x] Byzantine plan consensus and the 5,000-agent scale step are explicitly
      deferred without weakening Beta 3 safety claims.

## Public package and contracts

- [x] `@agentplat/collective-planning` is cataloged, provider-neutral,
      side-effect free and version-aligned.
- [x] Root, `./mesh` and `./evaluation` exports have the frozen dependency
      boundaries from the plan.
- [x] Mission intent contains no task graph, assignment, hidden predicate,
      global membership or future fault schedule.
- [x] Observation contracts are peer-scoped, cursor-bound, bounded and
      content-addressed.
- [x] Proposal contracts cannot name assignment authority, grants, permits,
      handlers or fencing tokens.
- [x] Intent, proposal, fragment, decision, view, role, snapshot and trace
      digests are domain-separated and fixture-backed.
- [x] All validators reject unknown fields, invalid UTF-8/size boundaries,
      unsafe integers and malformed graph references.
- [x] Same logical ID/same digest is idempotent; same ID/different digest is a
      conflict.
- [x] Public type tests cover every new export and negative authority case.

## Planning reducer

- [x] Proposal evaluation uses only exact intent, policy, retained observations
      and local bounded state.
- [x] Accepted proposals remain non-authoritative planning records.
- [x] Selection is deterministic for identical candidate set and policy.
- [x] Digest tie-break occurs only after frozen policy scoring and proposals
      contain no grinding nonce.
- [x] One semantic slot has at most one active local head.
- [x] Predecessor chains and dependency graphs are valid and acyclic.
- [x] Depth, fanout, cardinality, revision, byte and concurrency limits fail
      before mutation.
- [x] Planning budget shards are deterministic, admitted peer/instance bound
      and cannot increase from remote input.
- [x] Every state prefix conserves planning reservations and terminal usage.
- [x] Rejected input changes no state, timer, budget or effect.
- [x] Terminal intent, fragment and role states never reactivate.
- [x] Self-contained snapshot/restore verifies all relationships, retained
      observation cursors and high-waters.
- [x] Reorder, duplicate and snapshot replay converge to the expected digest.

## Mesh projection

- [x] The exact critical extension key is negotiated through verified current
      peer capability and local support.
- [x] Older/unsupported peers reject planning offers without downgrade retry.
- [x] Extension, fragment repository body and Work offer executable projection
      match exactly.
- [x] Fragment repository substitution, cross-tenant and cross-Objective reads
      fail closed.
- [x] Local planning Work is created only after an accepted current fragment.
- [x] Inbound planning Work is gated before planning state commits.
- [x] Rejected inbound planning Work retains only required replay/message-ID
      high-waters and commits no Objective, Work, allocation, planning, role,
      budget or effect state.
- [x] Nominal allocation uses actual offer, bid, award, acceptance and
      checkpoint paths. Decline, recovery and fault paths remain Increment 6.
- [x] No direct assignee lookup or assignment-authority construction exists in
      the nominal V2 runner.
- [x] Work Contract is derived only from a current accepted Mesh assignment.
- [x] Nominal adaptive-role/action composition binds the current intent,
      fragment, active Work Contract, assignment/fence and accepted mandate at
      the protected-action boundary.
- [x] Planning can only narrow upstream capability, budget, validity and action
      scope.
- [x] Existing non-planning Mesh behavior remains byte/behavior compatible.

## Replanning

- [x] Replanning requires an explicit observation, result, fault, capability,
      Trust, deadline or intent input.
- [x] Every replacement names its exact causal predecessor and basis digests.
- [x] Supersession explicitly revises/cancels prior Work or leaves it terminal;
      it never rewrites history.
- [x] Dependency failure and contradictory observations can challenge, abstain
      or produce bounded alternate fragments.
- [x] Capability withdrawal/expiry triggers actual eligibility and planning
      changes.
- [x] Plan revision racing offer/bid/award/accept resolves deterministically.
- [x] Plan revision racing result/effect cannot accept a stale fence.
- [x] A completed effect is observed and never undone by plan rewrite.
- [x] An indeterminate effect remains charged until authoritative
      reconciliation.
- [x] At least one valid benign/mixed sample causally revises its graph and
      changes a role or assignment.

## Environment boundary

- [x] Runner-visible port exposes only peer observations, protected effect
      attempts/receipts, logical advancement and strict snapshot/restore.
- [x] Runner cannot enumerate hidden world state, global membership, expected
      tasks, terminal predicate or future faults.
- [x] Independent monitor is the only component deriving success and safety.
- [x] Hidden-state canaries detect accidental or malicious boundary leakage.
- [x] Environment cursors are exact-idempotent and conflicting reuse fails.
- [x] Effect sink atomically validates idempotency and current fencing where
      required.
- [x] Failure before and after effect commit produces distinct, tested
      outcomes.
- [x] Environment snapshot/restore reproduces observations, effects and hidden
      monitor state exactly.

## Truthful evaluation

- [x] Every accounted interaction maps to one immutable trace event.
- [x] Replaying the trace reproduces the report ledger exactly.
- [x] V2 contains no interaction padding, constant success or constant safety
      counters.
- [x] Every claimed fault has scheduled, injected and observed events.
- [x] Missing/extra fault records invalidate the bounded resilience result and
      campaign evidence; full multi-seed campaign validation remains open.
- [x] Mission/safety failure cannot be reclassified as infrastructure invalid.
- [x] Nominal collective and centralized runners bind the same public intent,
      per-peer observations, policy, protected-effect boundary and no faults.
- [x] Centralized nominal mode receives no evaluator hidden state and accounts
      delivered observations as directives, then executes one bounded central
      decision instead of the peer-local decision loop. The compact resilience
      pair separately enforces exact fault parity; the full statistical ladder
      remains deferred.
- [x] Runner, environment, monitor, policy and fixtures have independent
      registered digests.
- [x] Exact replay and snapshot/restore match uninterrupted execution.

## Negative implementations

- [x] Hidden-task/global-state oracle is detected.
- [x] Nominal closed-loop contract/runtime rejects direct-assignment authority
      construction.
- [x] Proposal/role-as-authority negative: the nominal closed-loop action path
      does not accept either planning record as action authority.
- [x] Widened or cyclic plan implementation is detected.
- [x] Critical-extension downgrade implementation is detected.
- [x] Fragment/Work substitution implementation is detected.
- [x] Stale-plan/stale-fence implementation is detected.
- [x] Declared-only fault implementation is detected.
- [x] Constant-success/zero-violation implementation is detected.
- [x] Synthetic-ledger padding/omission implementation is detected.
- [x] Failed-seed omission implementation is detected.
- [x] Hidden-state/secret-canary leak is detected.

## Scale and statistical campaign

Increment 10 provides the public, fail-closed control-plane capability for this
campaign. It fixes a 240-cell / 960 first-and-replay-slot closure in 48 shards
of five cells, with a registered total interaction ceiling of 3,296,000. It is
not execution evidence: no real campaign has been run, no cloud work is
started, and no package is published or released by this capability.

- [x] Public control-plane plan fixes the 240-cell / 960-slot / 48-shard
      campaign shape before execution.
- [x] Public evaluator-owned projections, streaming custody verification and
      deterministic analysis fail closed for incomplete evidence.
- [x] Manual operation surface is confirmation-gated and cannot select a
      diagnostic or synthetic adapter for eligibility.
- [x] Detached authorization plus a trusted adapter registry bind the exact
      plan, source, runner implementation and evaluator commitments before
      durable mutation; direct runner/projector injection is unavailable.
- [x] Durable namespaces isolate plan, authorization, credential and workflow
      attempt; exact shard authorization cannot reuse `maximumCells` as a
      cross-call budget bypass.
- [x] Streaming custody applies non-overridable artifact, byte and chunk caps
      and commits each logical path as part of its immutable semantic binding.
- [x] Readiness derives its recommendation from the exact closed receipt set;
      callers cannot select `ready_for_operator_authorization`.
- [x] The capacity envelope fixes 3,296,000 interactions, 96,000,000 trace
      events, 15 GiB of artifact capacity and bounded runner-minutes while
      requiring an operator rate card for monetary cost.
- [x] The readiness workflow is manual, read-only and has no campaign,
      deployment, publication or paid-provider execution path.
- [ ] One protected five-cell/twenty-slot preflight and fresh-process resume for
      the exact release-candidate source are verified by the readiness gate.
- [ ] The final readiness assessment is
      `ready_for_operator_authorization`; this remains non-authoritative and
      keeps full campaign execution disabled.

- [x] Registrations are frozen before normative execution.
- [ ] Ladder completes at 50, 100, 250 and exactly 500 agents.
- [ ] Every sample stays at or below 5,000 event-derived interactions.
- [ ] At least 30 paired seeds per runner/stratum run at 500 agents.
- [ ] At least 10 paired seeds per runner/stratum run at smaller ladder points.
- [ ] Nominal, benign, adversarial and mixed strata complete without omitted
      mission/safety failures.
- [ ] Sparse topology stays inside the registered finite-range `O(n log n)`
      envelope.
- [ ] Authorization, plan-authority, stale-fence and duplicate-effect
      violations are zero.
- [ ] Evaluation-integrity violations are zero.
- [ ] Exact replay failures are zero.
- [ ] Nominal mission-success Wilson lower bound is at least `0.95`.
- [ ] Benign mission-success Wilson lower bound is at least `0.90`.
- [ ] Paired collective-minus-baseline interval lower bound is at least `-0.05`
      for nominal and benign strata.
- [ ] Benign p95 recovery/replanning is at most 250 interactions.
- [ ] Healthy planning participants reach at least 95% agreement for affected
      semantic slots within `min(1,000, 2N)` event-derived interactions after
      registered heal/quiescence.
- [ ] Role-coherence reaches 1,000 decisions with zero unsafe executable
      decision/action and useful-decision rate at least `0.70`.
- [ ] Adversarial/mixed results avoid unsupported superiority claims.

## Privacy, security and durability

- [x] Raw prompts, private reasoning, secrets, hidden world values and
      unrestricted observations are absent from ordinary evidence.
- [x] Canary scans cover logs, traces, reports, snapshots and tarballs.
- [x] Required pre-dispatch evidence failure never upgrades denial or repeats an
      effect.
- [x] Durable readers bind exact tenant/domain/intent/policy identity.
- [x] Restore cannot lower intent, fragment, budget, replay, epoch or revocation
      high-waters.
- [x] Retention cannot prune current heads, unresolved dependencies,
      indeterminate effects or required anchors.
- [x] Runtime dependency audit has no unaccepted critical/high finding.
- [x] Public-release terminology and secret audit passes.

## Compatibility

- [x] All Beta 2 protocol v0/v1 fixtures remain byte-identical.
- [x] All Beta 2 persistence fixtures, rows and snapshots remain readable.
- [x] V1 evaluation contracts/reports retain historical validation behavior.
- [x] Existing public API diff is additive and reviewed.
- [x] No existing required field, default behavior or closed union changes.
- [x] Alpha 5, Beta 1 and Beta 2 source/type/packed consumers pass unchanged.
- [x] Browser-safe dependency traversal remains clean.
- [x] Package dependency graph remains acyclic.

## Packaging and release

- [x] Root and all 39 public packages use exactly `0.3.0-beta.3`.
- [x] Clean build, type, unit, adapter, conformance and campaign gates pass.
- [x] All 39 isolated tarballs and public export subpaths install under pnpm and
      npm without workspace links.
- [x] Prepublication packed Node 20, packed Node 22 and PostgreSQL durable
      consumers are readiness-gated without reading AgentPlat packages from a
      registry.
- [ ] Portable Node 20, portable Node 22 and PostgreSQL durable registry
      consumers pass.
- [x] Release manifest and public package catalog agree exactly.
- [ ] Annotated `v0.3.0-beta.3` points to the immutable release commit.
- [ ] All packages publish once under a staging tag, then atomically promote
      `next`; no version is overwritten.
- [ ] Staging tags are removed after successful promotion.
- [ ] Registry versions, integrities, timestamps and dist-tags match the release
      evidence.
- [ ] Evidence merge changes no published package source or manifest.
- [ ] Public CI passes on implementation, release and evidence merges.
- [ ] Rollback drains/cancels planning-owned Work and reconciles indeterminate
      effects without rewriting Beta 3.
