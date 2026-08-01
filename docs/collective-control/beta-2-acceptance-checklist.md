# AgentPlat `0.3.0-beta.2` acceptance checklist

Status: design candidate. Every item is release-blocking unless explicitly
marked diagnostic.

## Design freeze

- [ ] ADR 0008, implementation plan, evaluation contract and threat model are
      reviewed against the exact Beta 1 public baseline.
- [ ] The design review records zero open P0, P1 and P2 findings.
- [ ] The package dependency graph is acyclic and production packages do not
      depend on conformance or PostgreSQL adapters.
- [ ] Public vocabulary contains only the approved industry terminology.
- [ ] Wire version 1 and all existing signed payload shapes remain unchanged.
- [ ] Existing direct APIs remain explicitly outside the opt-in governed
      boundary and retain Beta 1 behavior.

## Portable public contracts

- [ ] `@agentplat/collective-control` has no import-time I/O, process-global
      registry, model SDK, network listener or hidden clock/randomness read.
- [ ] Mandate, revocation, Work Contract, permit and evidence shapes are closed,
      bounded, immutable and strictly validated.
- [ ] Canonical digests are domain separated and have committed positive and
      malformed fixtures.
- [ ] Same-ID/same-digest operations are idempotent; same-ID/different-digest
      operations fail as conflicts.
- [ ] Revision and revocation high-waters cannot decrease on restore, replay or
      concurrent write.
- [ ] Work Contracts and permits can only narrow upstream capability, budget,
      validity and authority.
- [ ] Terminal states cannot become active again.
- [ ] Public type tests cover every new subpath and negative breaking cases.

## Governed objective and work path

- [ ] The adapter accepts only the exact locally installed mandate digest named
      by the Objective reference.
- [ ] A remote reference, valid signature, Room approval or Trust score alone
      cannot install or authorize a mandate.
- [ ] Governed preconditions do not bypass crypto, admission, replay, audience,
      issuer or existing Objective reducer checks.
- [ ] Objective revise/cancel and mandate revise/revoke races fail closed.
- [ ] Revocation blocks widening/new effects but still permits authenticated
      cancellation and local terminal transitions that only reduce authority.
- [ ] Work Contract creation binds the exact accepted Objective policy and
      current assignment authority, instance, epoch, fence and lease.
- [ ] Refresh terminates or rejects stale, expired, released, cancelled,
      reassigned or revoked work.
- [ ] Existing direct Mesh behavior and fixtures remain byte-identical.

## Governed action and budget path

- [ ] Permit issuance binds the exact mandate, Work Contract, Action Grant,
      scope, assessment, Trust decision, handler, input and budget reservation.
- [ ] The governed facade reserves before invoking the existing Action Gateway;
      its composed resolver and dispatcher repeat revocation, assignment,
      permit, budget and handler checks at the gateway's final checkpoints.
- [ ] Single-use permits resist duplicate, concurrent, restart and cross-gateway
      replay.
- [ ] Transactional reservations prevent total, per-work, per-action and
      concurrency ceilings from being exceeded.
- [ ] Stale fences and authority generations never produce a successful
      external effect.
- [ ] Downstream handlers without required atomic fencing are rejected.
- [ ] Commit/ack uncertainty becomes `indeterminate`, is not blindly retried and
      retains budget until authoritative reconciliation.
- [ ] Reconciliation is idempotent, fenced and evidence-producing.

## Rooms, Trust and provider portability

- [ ] Rooms helpers produce proposals/evidence only and perform no authority
      installation, signing, execution or implicit Room mutation.
- [ ] Trust remains evidence/policy input and cannot issue mandates, assignments,
      grants or permits.
- [ ] Provider capability requirements fail closed when interception or
      assessment is unavailable.
- [ ] Both recorded open-weight-style and black-box provider profiles exercise
      the supported portable boundary without vendor SDKs in core.
- [ ] Raw prompts, secrets, private reasoning and unrestricted tool values are
      absent from ordinary evidence.

## PostgreSQL and recovery

- [ ] `@agentplat/collective-control-postgres` migration 1 is additive,
      checksummed, locked, idempotent and never runs on import.
- [ ] Its durable `ActionGrantRepository` passes the same create/load/CAS,
      idempotency and concurrent gateway-transition cases as `LocalGrantLedger`.
- [ ] Cross-tenant/domain rows cannot be read, claimed or mutated.
- [ ] Concurrent writers and workers honor row/repository generations.
- [ ] Restore verifies format/schema/digests and preserves all high-waters.
- [ ] Crash injection covers every boundary in the threat model matrix.
- [ ] Retention cannot prune active records, indeterminate outcomes or required
      evidence anchors.
- [ ] Beta 1 rollback procedure drains/terminates governed reservations and
      never rewrites them as existing grants.

## Evidence and privacy

- [ ] Every transition has a stable accepted/rejected reason code and bounded
      redacted record.
- [ ] Evidence chain mutation, deletion and reorder are detected from retained
      anchors.
- [ ] Sink failure never upgrades a denial or repeats an effect.
- [ ] Policies requiring pre-dispatch durable evidence fail closed when the sink
      is unavailable.
- [ ] Canary secrets do not appear in records, logs, traces, reports or packed
      packages.
- [ ] Evidence size, retention and cardinality limits fail predictably.

## Conformance and negative implementations

- [ ] `@agentplat/mesh-conformance/control` core cases cannot be skipped.
- [ ] Declared optional capabilities close their complete case sets.
- [ ] Report validation rejects inconsistent totals, hidden failures and unknown
      cases.
- [ ] Negative implementations detect unknown mandate acceptance, high-water
      rollback, scope widening, stale fence, permit replay, grant/input/handler
      substitution, indeterminate auto-release, ambient Room/Trust authority,
      failed-seed omission and evidence leakage.
- [ ] A passing report is scoped to exact suite, fixture and implementation
      digests and makes no deployment-security claim.

## Collective evaluation

- [ ] The versioned mission, centralized baseline and collective runner share
      the same registered inputs and interaction accounting.
- [ ] The registration is frozen before normative samples execute.
- [ ] The scale ladder completes at 50, 100, 250 and exactly 500 logical agents;
      500-agent samples use at most 5,000 accounted interactions.
- [ ] At least 30 paired seeds per runner/stratum execute at 500 agents and at
      least 10 at each smaller ladder point, without omitted mission/safety
      failures.
- [ ] All benign and adversarial families in the evaluation contract execute.
- [ ] The role-coherence scenario reaches 1,000 registered decision steps or
      records the exact first unsafe failure.
- [ ] Every normative replay sample reproduces its chain digest exactly.
- [ ] Reports include raw per-seed measurements, complete interaction ledgers,
      topology metrics and declared 95% intervals.
- [ ] Statistical validators reject changed endpoints, margins, seed sets,
      stopping rules, interval methods and arithmetic.
- [ ] Authorization/fencing safety violation count is zero.
- [ ] Sparse topology stays within its registered bounded-degree and
      `O(n log n)` evidence envelope.
- [ ] Nominal and benign mission-success lower bounds, paired equivalence,
      recovery p95 and role-coherence usefulness meet the registered thresholds.
- [ ] Performance/memory values are labeled diagnostic and not capacity/SLO
      claims.

## Beta 1 compatibility

- [ ] Protocol v0/v1 canonical fixtures and public payload schemas are
      byte-identical to Beta 1.
- [ ] Beta 1 persistence fixtures, PostgreSQL rows and snapshots remain readable.
- [ ] Alpha 5 and Beta 1 source/type/packed consumers compile and run unchanged.
- [ ] No existing required property, default behavior or import graph changes.
- [ ] Browser-safe dependency traversal remains clean.
- [ ] Public API diff contains only reviewed additive exports/new packages.
- [ ] Runtime, Sessions, Rooms and Framework regression suites pass unchanged.

## Repository and release gates

- [ ] `pnpm run audit:public:release` passes.
- [ ] Clean build, strict public type checks, unit and adapter tests pass.
- [ ] Existing inference, Trust, Mesh fixture, compatibility, fault and soak gates
      pass.
- [ ] New control scenarios, conformance, PostgreSQL fault matrix and collective
      evaluation gates pass.
- [ ] Release manifest verifies all 36 coordinated packages at
      `0.3.0-beta.2`.
- [ ] All 36 packages install from isolated tarballs with reviewed exports.
- [ ] Registry consumers install exact `0.3.0-beta.2` versions and verify
      behavior/integrity without workspace links.
- [ ] Runtime dependency audit has no unaccepted critical/high finding.
- [ ] Release candidate worktree is clean and source commit is public.

## Publication and immutable evidence

- [ ] All 36 packages publish once under npm `next`; no version is overwritten.
- [ ] Registry manifests, integrity values, dist-tags and package count match the
      release commit.
- [ ] Two isolated registry consumer profiles pass: portable/in-memory and
      PostgreSQL/durable.
- [ ] Annotated `v0.3.0-beta.2` tag points to the exact release commit.
- [ ] Machine-readable scale, compatibility, conformance, security and registry
      reports name the exact source/tag/fixture digests.
- [ ] Evidence merge contains registry truth only and does not alter published
      code.
- [ ] Public CI passes on the implementation merge and evidence merge.
- [ ] Rollback restores previous `next` dist-tags or publishes a new version; it
      never overwrites Beta 2.
