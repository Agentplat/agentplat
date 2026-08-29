# Governed Durable Workflows V1 acceptance checklist

Status: partially implemented; unchecked items are not implementation claims.

## Architecture and compatibility

- [x] V1 is additive and opt-in; current workflow exports remain source
      compatible for the declared release line.
- [x] Portable packages import no Temporal, PostgreSQL, Room or vendor SDK.
- [x] AgentPlat stores, not workflow-engine history, own canonical state and
      authority.
- [x] The Room bridge and infrastructure adapters live in separate packages.
- [x] Existing Action Gateway and governed-action contracts remain the only
      protected-effect execution boundary.
- [x] Public documentation distinguishes source, conformance, deployment and
      empirical evidence.

## Definitions and pure transitions

- [x] Task, wait, signal and generic gate stages have exact V1 contracts.
- [x] DAG validation rejects duplicates, missing references, impossible
      outcomes, cycles and ambiguous reachability.
- [x] Definition identity binds tenant, process, version and canonical digest.
- [x] Task definitions bind an exact handler version and declare internal or
      protected-external effect posture.
- [x] A protected-external task cannot execute through the reference runner
      without the separately composed protected executor and declared action
      Gateway binding.
- [x] Legacy linear definitions and representable runs upgrade deterministically; ambiguous legacy
      state is refused.
- [x] Every in-memory run transition checks predecessor revision, definition digest,
      state digest and logical time.
- [x] Terminal run and stage outcomes are sticky.
- [x] Size, count, retry, duration, fan-out and retained-state limits are
      explicit and tested.

## Runner and signals

- [x] In-memory `start`, `signal` and `cancel` are exact-replay idempotent and conflicting
      identity reuse is rejected.
- [x] `describe` is read-only and tenant scoped.
- [x] One bounded advance cannot monopolize the local worker.
- [x] The provider-neutral worker uses bounded task leases/heartbeats, fairly advances and
      gracefully drains PostgreSQL-backed runs without Temporal.
- [x] In-memory signals are append-only, source-bound and single-consumption by default.
- [x] A signal cannot target another tenant or implicitly select a latest run.
- [x] Wait and gate stages enter `waiting` without consuming a worker.
- [x] Lost and duplicate wakeups do not alter process semantics.

## Tasks, effects and usage

- [x] In-memory task attempts bind handler, input, policy, model/tool revisions and stable
      idempotency identity.
- [x] Exact in-memory task replay returns retained result metadata; changed input or binding
      conflicts.
- [x] Protected-executor uncertainty remains `indeterminate`; durable crash
      reconciliation remains adapter work.
- [x] Tests and docs do not claim exactly-once external effects without a
      downstream atomic idempotency or fencing sink.
- [x] Token, duration and cost values are non-negative safe integers.
- [x] Currency aggregation never combines distinct currencies.
- [x] Opaque subject types and IDs are stored and grouped but never interpreted
      by platform code.

## Cancellation and compensation

- [x] Accepted cancellation prevents all unclaimed normal stages from starting.
- [x] Running tasks receive cooperative abort on failed heartbeat and lose settlement after their
      lease or authority fence is stale.
- [x] Compensations run only for succeeded target stages and in reverse
      topological order.
- [x] Each compensation has an independent stable idempotency identity.
- [x] Failed compensation cannot produce a successful canceled
      result.
- [x] In-memory cancellation replay cannot schedule duplicate logical compensation.

## PostgreSQL

- [x] Migrations are ordered, packaged and expose status plus explicit rollback
      confirmation.
- [x] Definition, run, operation, signal, task, gate, event, outcome and
      checkpoint records are tenant scoped.
- [x] Run transitions use revision and predecessor-digest CAS.
- [x] Idempotency uniqueness is followed by retained-request digest comparison.
- [x] Task claims have bounded leases, heartbeats, generation takeover and fenced settlement.
- [x] Ready and stuck-run discovery has bounded indexed queries.
- [x] A distinct repository/process instance restores all live state after
      restart.
- [x] Read-time validators reject malformed or substituted JSON records.

## Agent Room gates

- [x] A generic gate request maps to one deterministic Room approval chain.
- [x] Artifact approvals bind the exact artifact version.
- [x] Approve, reject, needs-revision and expiry remain distinct outcomes.
- [x] Human edits create a new artifact version and approval lineage; reviewed
      records are not mutated.
- [x] Expiry can only move `requested` to `expired` and never auto-approves.
- [x] The approval/expiry race has one transactionally selected terminal winner.
- [x] Room operational event replay emits idempotent workflow wakeup signals
      behind a CAS projection checkpoint.
- [x] A stale, cross-Room, cross-tenant, wrong-action or wrong-version approval
      cannot satisfy the exact gate/action binding.

## Temporal

- [x] The adapter implements the public runner without exposing Temporal to
      application code.
- [x] The workflow calls one bounded `advanceProcess` activity.
- [x] Signals and timers are wakeup hints after AgentPlat state is committed.
- [x] A committed run is recoverably started/notified when the immediate
      Temporal client notification fails.
- [x] A real worker restart during a durable wait resumes the authoritative run.
- [x] Activity retry reuses an exact total-cycle operation identity.
- [x] `continueAsNew` preserves the AgentPlat revision and the real
      restart/signal scenario loses no committed
      signal.
- [x] A disposable Temporal service CI job covers restart and history rollover.
- [x] No API reconstructs run state or authority from Temporal history.

## Delayed outcomes

- [x] In-memory outcome identity is exact-replay idempotent and conflicting reuse fails.
- [x] Every outcome binds an existing immutable task execution binding.
- [x] Opaque outcome/reason values have no platform-defined business semantics.
- [x] Queries expose sample counts, missing values and explicit denominators.
- [x] Generic queries do not label a distribution as accuracy without a
      caller-supplied classification policy.
- [x] Outcome evidence can arrive after definition, prompt or model revisions
      change and still resolves the original execution.
- [x] Coverage monitor distinguishes healthy, insufficient, stale and
      unavailable evidence.
- [x] Missing or stale evidence never counts as success and the autonomy
      controller cannot promote from it.

## Progressive autonomy

- [x] A new segment starts at `blocked` or `propose_only`, never autonomous.
- [x] Segment keys and reason codes are caller-supplied opaque values.
- [x] Promotion requires minimum sample, coverage, window, cooldown and
      consecutive healthy evidence.
- [x] Promotion advances at most one level per eligible window.
- [x] Degradation is asymmetric and configured critical evidence can drop to
      the policy floor immediately.
- [x] Deterministic sampling is stable for the same action within one level
      epoch.
- [x] Policy substitution, evidence replay/reorder and logical-time rollback fail
      closed.
- [x] An unavailable store denies; no cache can silently widen supervision.
- [x] Autonomy decisions never create approval, authority, grants or effects.
- [x] All eligible effects still pass current authority, assessment, grant,
      idempotency and fencing checks.

## Boundary hygiene

- [x] Governed workflow/autonomy portable sources cannot import applications,
      examples or provider
      adapters.
- [x] Package and source dependency rules are machine checked in CI.
- [x] Neutral governed-workflow fixtures contain no configured application-domain
      vocabulary.
- [x] Deployments can add a private terminology denylist without modifying
      AgentPlat.
- [x] Admitted provider adapters implement a portable port and preserve AgentPlat as
      authoritative state.
- [x] The adapter admission rule is documented and applied to the existing
      work-management adapter and the next proposed connector.

## Verification and release

- [x] Memory and PostgreSQL stores/runners pass the same declared-capability
      conformance cases, including a distinct PostgreSQL reopen.
- [x] Memory, PostgreSQL-worker and Temporal client runners pass the same runner
      semantics suite.
- [x] Fault cases cover duplicates, conflicts, ambiguous effects, lease expiry, late
      signals, expiry races, indeterminate effects and stale autonomy evidence.
- [x] Public TypeScript contracts cover current workflow, outcomes,
      conformance and PostgreSQL exports.
- [x] Package manifests, public-package registry/release guards and the
      production dependency audit pass for the coordinated Beta 6 cohort.
- [x] Packed consumers import all 62 packages and 200 declared API surfaces;
      functional consumers and compatibility scenarios pass.
- [x] Focused tests, workspace build, type-check, unit/adapters suite and pack
      smoke pass on the current source; public audit, platform boundaries and
      release verification also pass on one isolated clean validation commit.
- [x] Any long-duration or scale result is recorded separately as empirical
      evidence rather than inferred from conformance.
