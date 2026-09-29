# Purpose governance — sequential implementation objectives

Updated: 2026-09-28. Specification status is separate from implementation status.
Work proceeds one objective at a time. Each implementation objective closes with
source, relevant tests, documentation and bounded demonstrable evidence. Never
mark semantic quality or production readiness proven by a unit test.

| # | Objective | Status | Required closure evidence |
| --- | --- | --- | --- |
| 1 | Design and contracts | Complete (design only) | Specification sections 1–9, ADR 0056, package mapping, G01–G15 scenarios and documentation validation. |
| 2 | Configure both modes | Complete (configuration only) | Additive binding/validation, legacy digest and public type fixtures, mixed Room preflight; G01 and configuration/rejection portion of G02; purpose activation is delivered by objective 7. |
| 3 | Persist governed configuration | Complete (suspended configuration) | Verified principal/authorizer ports, owner/delegation rules, CAS operations, transfer and PostgreSQL migrations/reopen; G03–G06. |
| 4 | Process inceptions | Complete (inert intake and assessments) | Durable input and five dispositions, explanations, lineage and retry behavior; G07. |
| 5 | Observe signals and references | Complete (bounded evaluation wakeups) | Quantitative/qualitative ingestion, freshness, references, bounded durable wakeups and recovery; G08–G09. |
| 6 | Enforce limits and suspension | Complete (opt-in instruction execution) | Action Gateway composition, concurrent budgets, epoch fencing, adapter admission and interrupted transitions; G10–G12. |
| 7 | Close purpose/mission/outcome loop | Complete (qualified Room purpose profile) | Governed mission issuance, evaluation and reassessment, uncertainty, recovery and outcome attribution; G04/G13. |
| 8 | Compose autonomy and evolution | Complete (bounded governed continuity) | Evidence scope, mixed-mode delegation, model changes, Genesis and Morphogenesis continuity; G14. |
| 9 | Persistent demonstration | Complete (simulated support, PostgreSQL) | Account-access support example with both modes, inceptions, signals, owner correction, suspension, restart and traceable outcomes; G15. |
| 10 | Compatibility and adoption | Complete (local bounded qualification) | Cross-package conformance, migration verification, public API checks, adoption guide and evidence record; release remains a separate action. |

## Objective 1 evidence

- [Specification](../specification/agent-purpose-governance-v1.md): concepts,
  proposed data contracts, authority matrix, transition protocol, enforcement,
  package ownership and fifteen positive/adversarial acceptance scenarios.
- [ADR 0056](../adr/0056-agent-purpose-governance.md): reuse definition ownership
  and existing execution boundaries; additive opt-in compatibility.
- [Architecture](../architecture.md): discoverable link labelled specified.
- Validation: relative Markdown destinations and package/source paths checked;
  `git diff --check` and `node scripts/verify-agentplat-spec.mjs` passed.
- No runtime files, protocol schemas, frozen capability manifests or release
  records changed. Existing user edits are outside this objective.

## Resolved decisions

The owner alone changes purpose and mode. Scoped mission issuers may include
agents. Identity comes from an authenticated host port, not a message claim.
Ownership transfer needs authenticated acceptance and suspends execution.
Effective configuration changes fence earlier assessments. Pending work is
reevaluated; already admitted external effects are reconciled. Deterministic and
semantic limits declare distinct enforcement, with missing required checks denied.

## Objective 2 evidence

- Optional `interaction: AgentInteractionBindingV1` on creation and immutable
  Agent Definition revisions; strict validation and public mode resolver.
- Legacy omitted-field golden digest retained; explicit bindings participate in
  content addressing and same-version conflicts. PostgreSQL stores the complete
  definition JSON, so this additive field needs no migration; actual database
  reopen/concurrency governance evidence remains objective 3.
- Purpose candidates can be stored/published but cannot resolve for execution.
  Default message dispatch preflights every selected participant before creating
  tasks; accepted Handoff dispatch also checks the exact target revision.
- Tests: `tests/rooms-agent-registry.test.mjs`,
  `tests/rooms-coordination-execution.test.mjs`, and
  `tests/rooms-interaction-public-contracts.test.mts`.
- Checks: Rooms dependency build, 53 Rooms tests, Rooms API suite, public type
  checks and `git diff --check`. These are local source checks, not empirical
  purpose adherence or production evidence.
- G02's future active mixed-mode behavior is still deferred until objectives
  3–7. Unbound direct RoomService/custom execution remains legacy behavior;
  this increment does not claim a global governance enforcement boundary.

## Objective 3 evidence

- `AgentGovernanceServiceV1` authenticates through a host port, applies owner and
  expiring delegation rules, and persists only suspended configuration. Purpose
  execution still rejects. G03–G06 configuration cases are covered; actual
  delegated mission issuance is supplied by objective 7.
- Memory and PostgreSQL share CAS/idempotency scenarios. Migration 013 stores
  head plus immutable result/configuration history atomically; ownership transfer
  needs independent acceptance and clears delegations. Intervening changes cancel
  pending offers. No active execution or resume endpoint exists.
- Optional Rooms API governance endpoints independently verify raw-request
  credentials. Ordinary messages cannot invoke governance mutations.
- Verified: dependency builds, 56 Rooms tests, 17 API tests, 9 PostgreSQL adapter
  tests with integration enabled on an isolated PostgreSQL 16 cluster (no skips),
  public type checks, specification verification, documentation links and diff
  whitespace checks. Pool reopen, immutable-history protection, CAS races,
  transaction rollback, and migration 13 rollback/reapply passed.
- Audit history is a durable journal; external event delivery, effect-path epoch
  checks, and operational suspension remain later objectives. This does not
  demonstrate semantic purpose adherence or production readiness.
- [Configuration and integration guide](configuration.md) documents concrete
  exports, commands, authority, storage and current limits.

## Objective 4 evidence

- `AgentInceptionServiceV1` persists attributed Room-message snapshots and five
  dispositions, with explanation, uncertainty, version-bound evidence, evaluator
  reference and inert work proposals. G07 is covered without granting execution.
- Authenticated intake/assessment/read permissions are distinct. Governance is
  checked atomically at persistence; stale evaluations fail after purpose changes.
  Exact retries preserve historical results, and reassessment appends a digest
  link to its predecessor. Memory and PostgreSQL share the same scenarios.
- Migration 014 adds immutable intake/assessment tables and a CAS assessment head.
  PostgreSQL integration covers pool reopen, concurrent updates, receipt-conflict
  rollback and migration rollback/reapply. Optional HTTP endpoints and public
  TypeScript contracts expose the same boundaries.
- Verification: dependency builds, 57 Rooms tests, 18 API tests, 10 PostgreSQL
  tests with integration enabled and no skips, public type checks, spec/link/diff
  checks. These are local software checks, not empirical judgment validation.
- The host supplies assessment judgment; no model invocation or autonomous
  scheduler is installed. Suspended agents can retain inert intake/assessments;
  purpose execution remains disabled. See [inception usage](inceptions.md).

## Objective 5 evidence

- `AttentionSignalServiceV1` supports quantitative/qualitative/event definitions,
  immutable numeric/qualitative references, and authenticated source observations.
  Candidate publication requires owner/delegated authority; activation reuses
  governance reference selection and its epoch. G08–G09 are covered.
- Bounded stream state atomically persists observations and pending evaluation.
  Deduplication, freshness, out-of-order input, unavailable/contradictory sources,
  cadence, quotas, retained capacity, delivery leases and generations are tested.
  References and wakeups never create action authority. Host scheduling is required.
- Migration 015 implements immutable catalog plus governance-fenced stream CAS.
  PostgreSQL tests cover pool reopen, concurrent writers and rollback/reapply.
  Optional HTTP endpoints and a pure existing-workflow signal converter expose
  the integration seams without advancing processes or invoking models.
- Verification: Rooms/PostgreSQL/Workflows-Rooms builds, 58 Rooms tests, 19 API
  tests, 11 PostgreSQL adapter tests with real integration enabled and no skips,
  5 Workflows-Rooms tests, public types, spec/link checks and diff whitespace.
- Per-definition retention is bounded; capacity exhaustion requires an authorized
  operational response. No automatic compaction or production-scale validation is
  claimed. See [signal configuration and recovery](signals.md).

## Objective 6 evidence

- Owner-only `prepare_activation`/`activate` transitions persist a recoverable fence
  and admission profile. Required capabilities/controls must exist. Configuration
  mutations suspend execution. Qualified purpose activation is added by objective 7.
- Immutable agent limit candidates and construction-bound platform limits compose
  tool/operation/destination allowlists, semantic checks and cumulative budgets.
  Admission reserves all resource charges atomically with a current governance
  fence. Budgets survive epoch, mode and owner changes; uncertain effects retain
  reservations until verified reconciliation. G10–G12 are covered.
- The Room execution profile persists immutable task-content/governance bindings,
  verifies runtime-definition compatibility, and checks checkpoints after hooks.
  Old/unbound tasks cannot silently execute under a new epoch. Runtime metadata
  carries the bound scope for trusted Action Gateway integration.
- The existing Action Gateway composition retains base authority/assessments and
  binds assessment targets to governance, action input and handler. Stable logical
  effect IDs protect retries; no new grants or authority plane are introduced.
- Migration 016 adds limit/task-binding records, budgets, effects and activation
  statuses. PostgreSQL tests cover races, reopen, verified refunds and safe rollback
  refusal with activation history. The direct inference-control dependency added
  to Workflows-Rooms is a workspace-only dependency, with lockfile updated.
- Verification: affected package builds, 61 Rooms tests, 20 API tests, 12 PostgreSQL
  adapter tests with integration enabled, 6 Workflows-Rooms tests, public types,
  platform boundaries, specification and documentation/diff checks. Local evidence
  does not establish arbitrary external adapter correctness or semantic guarantees.
- [Execution guide](execution.md) documents required host wiring, admission versus
  external completion, explicit profile scope and recovery of unknown outcomes.

## Objective 7 evidence

- `PurposeMissionServiceV1` binds existing Room plans to owner/delegate-issued
  missions, purpose/governance, criteria and alignment judgments. The existing
  Planner/RoomService/Action Gateway retain execution ownership. G04 and G13 are
  covered by the qualified single-agent Room-plan composition.
- Purpose activation now requires the registered purpose control composition,
  its assessor/policy digest and a backend capable of atomic mission-work fences.
  Ordinary messages become inceptions, including inert intake while suspended;
  publication and standalone resolution still grant no execution authority.
- Deliberation supports act/wait/evidence/escalation/replanning/completion. It
  consumes current inception/signal evidence, persists prepared assessments with
  leases, preserves successor-plan lineage and blocks stale/canceled work.
- Outcome review distinguishes technical completion, governed work identity,
  proxy changes, external-effect settlement and assessed contribution/causal
  support. Imported completed tasks and unresolved effects cannot prove success.
- Migration 017 persists mission heads/history/plan ownership. PostgreSQL covers
  pool reopen, cancellation-at-admission and immutable history; memory shares the
  same scenarios. An actual Action Gateway integration exercises qualified purpose
  work and reconciles an indeterminate effect/grant.
- Verification: affected builds, 62 Rooms tests, 21 API tests, 13 PostgreSQL adapter
  tests with integration enabled, 7 Workflows-Rooms tests, public types, architecture,
  specification, link and diff checks. Deterministic test assessors are not evidence
  of general semantic fidelity, production readiness or AGI capability.
- Initial limits: one agent per mission, fresh plans with 1–16 agent-task steps,
  bounded history and host-supplied assessors/scheduling. See the
  [mission cycle guide](missions.md) for wiring, recovery and remaining boundaries.

## Objective 8 evidence

- Immutable single-parent origin and independently authenticated continuity consent
  preserve owner/purpose boundaries across Genesis and operational delegation.
  Descendants intersect ancestor limits and atomically charge ancestor budgets;
  uncertain effects retain reservations through suspension and model replacement.
- Native Handoffs retain Room execution ownership. Instruction receivers execute
  the exact delegated instruction; purpose receivers receive an inception and
  require an adopted source-bound mission decision before a qualified run. Native
  lifecycle fences block unrelated/terminal work. Parent outcome evidence includes
  delegated effects and pending Handoffs; technical completion alone is insufficient.
- Existing Autonomy Controller supervision is scoped to agent, definition,
  configuration, profile, lineage and policy issuer. Ancestor policies also narrow
  effects. Promotion never grants Action Gateway authority or bypasses a budget.
- Canonical Genesis V6 and organizational Morphogenesis V7 receipt adapters verify
  exact enrollment, digest, owner, expiry and absence of work/action grants.
  Existing owner model replacement preserves permanent origin and budget accounts,
  suspends execution and requires new admission, consent and evidence scope.
- Migration 018 persists immutable continuity receipts; PostgreSQL shared scenarios
  exercise sibling budget races, reopen, native source/target Room runs, unknown
  child effects, refunds and rollback refusal with existing origins.
- Verified: affected package builds, 66 Rooms tests, 21 Rooms API tests,
  9 Workflows-Rooms tests, 15 PostgreSQL tests with integration enabled and no skips,
  public TypeScript contracts, platform boundaries, specification and doc/diff checks.
  These are local source checks with deterministic assessors, not production-scale
  or semantic judgment evidence.
- G14 is covered within the documented first profile: one parent, ancestry depth
  eight, operational delegation leaves and one-step delegated purpose plans.
  Hosts retain scheduling, authentic receipt loading and native lifecycle recovery.
  See [continuity integration](continuity.md). No release was performed.

## Next objective entry criteria

Objective 9 builds a persistent account-access support demonstration with both
interaction modes. This scenario replaces LTV/CAC at the owner's request.

Owner-approved replacement scenario (the app goal text may still say LTV/CAC):

> Completar objetivo 9: construir y verificar una demostración persistente de
> soporte para recuperación de acceso a una cuenta, comparando modos instruction
> y purpose ante el mismo problema, con inceptions, señales, corrección del
> propietario, suspensión, reinicio y resultados trazables; reutilizar la
> composición gobernada y documentar los límites de la simulación.

The instruction agent sends recovery instructions and records task completion.
The purpose agent pursues legitimate access recovery, evaluates evidence and
rejects a suggestion to skip identity verification. Both modes preserve the same
execution safeguards. Sending a message is distinct from resolving the incident.

Required demonstration sequence:

1. A simulated customer reports an access failure to both modes.
2. Recovery instructions are sent, but a signal shows the incident persists.
3. The purpose agent evaluates an inception suggesting bypass of identity checks
   and rejects it with a traceable explanation.
4. The authenticated owner changes a restriction and suspends execution.
5. Separate process restart recovers decisions, configuration and pending work.
6. After owner-authorized reactivation, qualified work either demonstrates
   restored access through simulated verification or explicitly escalates.
7. Export evidence linking messages, assessments, governance revisions, signals,
   task/run identities and outcome review. Assert that task completion alone
   cannot establish incident resolution.

Use a simulated account service and reproducible assessors. Do not change real
credentials, send real support messages or claim empirical semantic competence.
Reuse the qualified composition; persistence and recovery must be verified
against actual storage, not inferred from an in-memory replay.

## Objective 9 evidence

- [Persistent support demonstration](../../examples/agent-purpose-support/README.md)
  replaces LTV/CAC with the owner-approved account-access scenario. Instruction
  and purpose agents operate in one Room with qualified governed execution.
- Native messages/inceptions preserve adoption and rejection. A signal observation,
  reference and wakeup cause mission reassessment without granting authority.
  Owner correction narrows limits and suspends the purpose agent; forged owner
  identity is rejected.
- Separate prepare/resume/verify processes use the existing PostgreSQL adapters.
  Restart checks exact suspended configuration and task binding, rejects work while
  suspended, and keeps old work fenced after owner reactivation. Fresh plans use
  the new governance revision; old pending work is retained and missions canceled.
- Both variants are executed: `recovered` completes only with versioned synthetic
  identity/access evidence; `unresolved` rejects completion and explicitly records
  an escalated mission. The initial completed tasks cannot establish resolution.
- `report.md` explains the story; `evidence.json` contains canonical Room, definition,
  governance, inception, signal and mission records, plus the demonstrator's journal.
  Nine invariants are recomputed from persisted evidence. Verification rejects
  altered disposition, restart PID, signals, limits or missing outcome evidence.
- Verified: two PostgreSQL end-to-end tests, both with no skips; four existing
  execution/purpose regression tests; dependency build, public contracts, platform
  boundaries, specification, documentation links and diff whitespace checks.
- Explicit limits: fixed assessors, local response journal and synthetic account
  service. No model, real credentials, external messages or empirical recovery
  claim. Restart concerns the consumer process, not PostgreSQL server failure or
  recovery of an unknown external effect. No runtime package API or migration
  changes were needed for this objective.

## Next objective

Objective 10 closes compatibility and adoption: cross-package conformance, migration
verification, public API checks, adoption documentation and a bounded evidence
record. Publication and deployment remain separate actions.

## Objective 10 evidence

- [Adoption guide](adoption.md) covers coexistence, staged enrollment, qualified
  purpose activation, verified host ports, suspension/reconciliation, model/owner
  changes, retained budgets, migration rollout and safe instruction fallback.
- [Evidence matrix](evidence.md) maps G01–G15 to behavioral/public-contract tests
  and separates source guarantees from simulated judgment and production evidence.
- A real 012-to-018 upgrade test preserves legacy Room/definition records and exact
  digests, exercises instruction execution before/after and proves no automatic
  governance enrollment. Historical migration SQL is unchanged.
- The reproducible focused gate runs 114 tests with no skips and records commands,
  TAP output and source hashes. The isolated tarball consumer checks four governance
  packages, seven public type fixtures, legacy resolution, guarded purpose access
  and packaged migrations. Existing CI gains these gates without changing release
  permissions or required existing checks.
- Full build and type-check passed. Root suite: 1,451 passed, no failures, one
  infrastructure skip and six pre-existing TODOs. Adapter suite: 379 passed,
  no failures/skips. Stale catalog/admission counts and rejection-message tests in the original
  optional-Jev development checkout were corrected against its existing policy.
  Those unrelated adjustments are excluded from the isolated main-based delivery.
- Remaining publication boundary: unrelated pre-existing multimedia artifacts fail
  the default whole-worktree audit. They were preserved and the limitation is
  recorded explicitly; this source qualification is not a release approval.

All ten source-plan objectives are complete within their stated evidence boundaries.
Review/PR, clean release qualification, publication and deployment are separate work.
