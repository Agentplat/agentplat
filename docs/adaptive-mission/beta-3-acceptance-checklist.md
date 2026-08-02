# AgentPlat `0.3.0-beta.3` acceptance checklist

Status: Increment 0 design freeze and Increment 1 portable contracts complete.
Every unchecked item remains release-blocking unless it is explicitly labeled
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
- [ ] Root, `./mesh` and `./evaluation` exports have the frozen dependency
      boundaries from the plan.
- [x] Mission intent contains no task graph, assignment, hidden predicate,
      global membership or future fault schedule.
- [x] Observation contracts are peer-scoped, cursor-bound, bounded and
      content-addressed.
- [x] Proposal contracts cannot name assignment authority, grants, permits,
      handlers or fencing tokens.
- [ ] Intent, proposal, fragment, decision, view, role, snapshot and trace
      digests are domain-separated and fixture-backed.
- [x] All validators reject unknown fields, invalid UTF-8/size boundaries,
      unsafe integers and malformed graph references.
- [ ] Same logical ID/same digest is idempotent; same ID/different digest is a
      conflict.
- [x] Public type tests cover every new export and negative authority case.

## Planning reducer

- [ ] Proposal evaluation uses only exact intent, policy, observations and
      local bounded state.
- [ ] Accepted proposals remain non-authoritative planning records.
- [ ] Selection is deterministic for identical candidate set and policy.
- [ ] Digest tie-break occurs only after frozen policy scoring and proposals
      contain no grinding nonce.
- [ ] One semantic slot has at most one active local head.
- [ ] Predecessor chains and dependency graphs are valid and acyclic.
- [ ] Depth, fanout, cardinality, revision, byte and concurrency limits fail
      before mutation.
- [ ] Planning budget shards are deterministic, peer/instance bound and cannot
      increase from remote input.
- [ ] Every state prefix conserves planning reservations and terminal usage.
- [ ] Rejected input changes no state, timer, budget or effect.
- [ ] Terminal intent, fragment and role states never reactivate.
- [ ] Snapshot/restore verifies all relationships and preserves high-waters.
- [ ] Reorder, duplicate and snapshot replay converge to the expected digest.

## Mesh projection

- [ ] The exact critical extension key is negotiated through verified current
      peer capability and local support.
- [ ] Older/unsupported peers reject planning offers without downgrade retry.
- [ ] Extension, fragment repository body and Work offer executable projection
      match exactly.
- [ ] Fragment repository substitution, cross-tenant and cross-Objective reads
      fail closed.
- [ ] Local planning Work is created only after an accepted current fragment.
- [ ] Inbound planning Work is gated before planning state commits.
- [ ] Rejected inbound planning Work retains only required replay/message-ID
      high-waters and commits no Objective, Work, allocation, planning, role,
      budget or effect state.
- [ ] Normative allocation uses actual offer, bid, award, accept/decline, lease
      and recovery paths.
- [ ] No direct assignee lookup or assignment-authority construction exists in
      the V2 runner.
- [ ] Work Contract is derived only from a current accepted Mesh assignment.
- [ ] Adaptive role binding cannot outlive intent, fragment, Work Contract,
      assignment, lease or mandate.
- [ ] Planning can only narrow upstream capability, budget, validity and action
      scope.
- [ ] Existing non-planning Mesh behavior remains byte/behavior compatible.

## Replanning

- [ ] Replanning requires an explicit observation, result, fault, capability,
      Trust, deadline or intent input.
- [ ] Every replacement names its exact causal predecessor and basis digests.
- [ ] Supersession explicitly revises/cancels prior Work or leaves it terminal;
      it never rewrites history.
- [ ] Dependency failure and contradictory observations can challenge, abstain
      or produce bounded alternate fragments.
- [ ] Capability withdrawal/expiry triggers actual eligibility and planning
      changes.
- [ ] Plan revision racing offer/bid/award/accept resolves deterministically.
- [ ] Plan revision racing result/effect cannot accept a stale fence.
- [ ] A completed effect is observed and never undone by plan rewrite.
- [ ] An indeterminate effect remains charged until authoritative
      reconciliation.
- [ ] At least one valid benign/mixed sample causally revises its graph and
      changes a role or assignment.

## Environment boundary

- [ ] Runner-visible port exposes only peer observations, protected effect
      attempts/receipts, logical advancement and strict snapshot/restore.
- [ ] Runner cannot enumerate hidden world state, global membership, expected
      tasks, terminal predicate or future faults.
- [ ] Independent monitor is the only component deriving success and safety.
- [ ] Hidden-state canaries detect accidental or malicious boundary leakage.
- [ ] Environment cursors are exact-idempotent and conflicting reuse fails.
- [ ] Effect sink atomically validates idempotency and current fencing where
      required.
- [ ] Failure before and after effect commit produces distinct, tested
      outcomes.
- [ ] Environment snapshot/restore reproduces observations, effects and hidden
      monitor state exactly.

## Truthful evaluation

- [ ] Every accounted interaction maps to one immutable trace event.
- [ ] Replaying the trace reproduces the report ledger exactly.
- [ ] V2 contains no interaction padding, constant success or constant safety
      counters.
- [ ] Every claimed fault has scheduled, injected and observed events.
- [ ] Missing/extra events, seeds or fault records invalidate the report.
- [ ] Mission/safety failure cannot be reclassified as infrastructure invalid.
- [ ] Collective and centralized runners receive the same public intent,
      observations, policy outputs, protected effects and applicable faults.
- [ ] Centralized baseline receives no hidden state or free communication.
- [ ] Runner, environment, monitor, policy and fixtures have independent
      registered digests.
- [ ] Exact replay and snapshot/restore match uninterrupted execution.

## Negative implementations

- [ ] Hidden-task/global-state oracle is detected.
- [ ] Direct assignee lookup is detected.
- [ ] Proposal/role-as-authority implementation is detected.
- [ ] Widened or cyclic plan implementation is detected.
- [ ] Critical-extension downgrade implementation is detected.
- [ ] Fragment/Work substitution implementation is detected.
- [ ] Stale-plan/stale-fence implementation is detected.
- [ ] Declared-only fault implementation is detected.
- [ ] Constant-success/zero-violation implementation is detected.
- [ ] Synthetic-ledger padding/omission implementation is detected.
- [ ] Failed-seed omission implementation is detected.
- [ ] Hidden-state/secret-canary leak is detected.

## Scale and statistical campaign

- [ ] Registrations are frozen before normative execution.
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

- [ ] Raw prompts, private reasoning, secrets, hidden world values and
      unrestricted observations are absent from ordinary evidence.
- [ ] Canary scans cover logs, traces, reports, snapshots and tarballs.
- [ ] Required pre-dispatch evidence failure never upgrades denial or repeats an
      effect.
- [ ] Durable readers bind exact tenant/domain/intent/policy identity.
- [ ] Restore cannot lower intent, fragment, budget, replay, epoch or revocation
      high-waters.
- [ ] Retention cannot prune current heads, unresolved dependencies,
      indeterminate effects or required anchors.
- [ ] Runtime dependency audit has no unaccepted critical/high finding.
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

- [x] Root and all 37 public packages use exactly `0.3.0-beta.3`.
- [x] Clean build, type, unit, adapter, conformance and campaign gates pass.
- [x] All 37 isolated tarballs and public export subpaths install under pnpm and
      npm without workspace links.
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
