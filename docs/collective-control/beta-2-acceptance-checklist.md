# AgentPlat `0.3.0-beta.2` acceptance checklist

Status: accepted. Every release-blocking item is verified by the exact public
commits, annotated tag, workflows, reports and registry records linked below.

## Design freeze

- [x] ADR 0008, implementation plan, evaluation contract and threat model are
      reviewed against the exact Beta 1 public baseline.
- [x] The design review records zero open P0, P1 and P2 findings.
- [x] The package dependency graph is acyclic and production packages do not
      depend on conformance or PostgreSQL adapters.
- [x] Public vocabulary contains only the approved industry terminology.
- [x] Wire version 1 and all existing signed payload shapes remain unchanged.
- [x] Existing direct APIs remain explicitly outside the opt-in governed
      boundary and retain Beta 1 behavior.

## Portable public contracts

- [x] `@agentplat/collective-control` has no import-time I/O, process-global
      registry, model SDK, network listener or hidden clock/randomness read.
- [x] Mandate, revocation, Work Contract, permit and evidence shapes are closed,
      bounded, immutable and strictly validated.
- [x] Canonical digests are domain separated and have committed positive and
      malformed fixtures.
- [x] Same-ID/same-digest operations are idempotent; same-ID/different-digest
      operations fail as conflicts.
- [x] Revision and revocation high-waters cannot decrease on restore, replay or
      concurrent write.
- [x] Work Contracts and permits can only narrow upstream capability, budget,
      validity and authority.
- [x] Terminal states cannot become active again.
- [x] Public type tests cover every new subpath and negative breaking cases.

## Governed objective and work path

- [x] The adapter accepts only the exact locally installed mandate digest named
      by the Objective reference.
- [x] A remote reference, valid signature, Room approval or Trust score alone
      cannot install or authorize a mandate.
- [x] Governed preconditions do not bypass crypto, admission, replay, audience,
      issuer or existing Objective reducer checks.
- [x] Objective revise/cancel and mandate revise/revoke races fail closed.
- [x] Revocation blocks widening/new effects but still permits authenticated
      cancellation and local terminal transitions that only reduce authority.
- [x] Work Contract creation binds the exact accepted Objective policy and
      current assignment authority, instance, epoch, fence and lease.
- [x] Refresh terminates or rejects stale, expired, released, cancelled,
      reassigned or revoked work.
- [x] Existing direct Mesh behavior and fixtures remain byte-identical.

## Governed action and budget path

- [x] Permit issuance binds the exact mandate, Work Contract, Action Grant,
      scope, assessment, Trust decision, handler, input and budget reservation.
- [x] The governed facade reserves before invoking the existing Action Gateway;
      its composed resolver and dispatcher repeat revocation, assignment,
      permit, budget and handler checks at the gateway's final checkpoints.
- [x] Single-use permits resist duplicate, concurrent, restart and cross-gateway
      replay.
- [x] Transactional reservations prevent total, per-work, per-action and
      concurrency ceilings from being exceeded.
- [x] Stale fences and authority generations never produce a successful
      external effect.
- [x] Downstream handlers without required atomic fencing are rejected.
- [x] Commit/ack uncertainty becomes `indeterminate`, is not blindly retried and
      retains budget until authoritative reconciliation.
- [x] Reconciliation is idempotent, fenced and evidence-producing.

## Rooms, Trust and provider portability

- [x] Rooms helpers produce proposals/evidence only and perform no authority
      installation, signing, execution or implicit Room mutation.
- [x] Trust remains evidence/policy input and cannot issue mandates, assignments,
      grants or permits.
- [x] Provider capability requirements fail closed when interception or
      assessment is unavailable.
- [x] Both recorded open-weight-style and black-box provider profiles exercise
      the supported portable boundary without vendor SDKs in core.
- [x] Raw prompts, secrets, private reasoning and unrestricted tool values are
      absent from ordinary evidence.

## PostgreSQL and recovery

- [x] `@agentplat/collective-control-postgres` migration 1 is additive,
      checksummed, locked, idempotent and never runs on import.
- [x] Its durable `ActionGrantRepository` passes the same create/load/CAS,
      idempotency and concurrent gateway-transition cases as `LocalGrantLedger`.
- [x] Cross-tenant/domain rows cannot be read, claimed or mutated.
- [x] Concurrent writers and workers honor row/repository generations.
- [x] Restore verifies format/schema/digests and preserves all high-waters.
- [x] Crash injection covers every boundary in the threat model matrix.
- [x] Retention cannot prune active records, indeterminate outcomes or required
      evidence anchors.
- [x] Beta 1 rollback procedure drains/terminates governed reservations and
      never rewrites them as existing grants.

## Evidence and privacy

- [x] Every transition has a stable accepted/rejected reason code and bounded
      redacted record.
- [x] Evidence chain mutation, deletion and reorder are detected from retained
      anchors.
- [x] Sink failure never upgrades a denial or repeats an effect.
- [x] Policies requiring pre-dispatch durable evidence fail closed when the sink
      is unavailable.
- [x] Canary secrets do not appear in records, logs, traces, reports or packed
      packages.
- [x] Evidence size, retention and cardinality limits fail predictably.

## Conformance and negative implementations

- [x] `@agentplat/mesh-conformance/control` core cases cannot be skipped.
- [x] Declared optional capabilities close their complete case sets.
- [x] Report validation rejects inconsistent totals, hidden failures and unknown
      cases.
- [x] Negative implementations detect unknown mandate acceptance, high-water
      rollback, scope widening, stale fence, permit replay, grant/input/handler
      substitution, indeterminate auto-release, ambient Room/Trust authority,
      failed-seed omission and evidence leakage.
- [x] A passing report is scoped to exact suite, fixture and implementation
      digests and makes no deployment-security claim.

## Collective evaluation

- [x] The versioned mission, centralized baseline and collective runner share
      the same registered inputs and interaction accounting.
- [x] The registration is frozen before normative samples execute.
- [x] The scale ladder completes at 50, 100, 250 and exactly 500 logical agents;
      500-agent samples use at most 5,000 accounted interactions.
- [x] At least 30 paired seeds per runner/stratum execute at 500 agents and at
      least 10 at each smaller ladder point, without omitted mission/safety
      failures.
- [x] All benign and adversarial families in the evaluation contract execute.
- [x] The role-coherence scenario reaches 1,000 registered decision steps or
      records the exact first unsafe failure.
- [x] Every normative replay sample reproduces its chain digest exactly.
- [x] Reports include raw per-seed measurements, complete interaction ledgers,
      topology metrics and declared 95% intervals.
- [x] Statistical validators reject changed endpoints, margins, seed sets,
      stopping rules, interval methods and arithmetic.
- [x] Authorization/fencing safety violation count is zero.
- [x] Sparse topology stays within its registered bounded-degree and
      `O(n log n)` evidence envelope.
- [x] Nominal and benign mission-success lower bounds, paired equivalence,
      recovery p95 and role-coherence usefulness meet the registered thresholds.
- [x] Performance/memory values are labeled diagnostic and not capacity/SLO
      claims.

## Beta 1 compatibility

- [x] Protocol v0/v1 canonical fixtures and public payload schemas are
      byte-identical to Beta 1.
- [x] Beta 1 persistence fixtures, PostgreSQL rows and snapshots remain readable.
- [x] Alpha 5 and Beta 1 source/type/packed consumers compile and run unchanged.
- [x] No existing required property, default behavior or import graph changes.
- [x] Browser-safe dependency traversal remains clean.
- [x] Public API diff contains only reviewed additive exports/new packages.
- [x] Runtime, Sessions, Rooms and Framework regression suites pass unchanged.

## Repository and release gates

- [x] `pnpm run audit:public:release` passes.
- [x] Clean build, strict public type checks, unit and adapter tests pass.
- [x] Existing inference, Trust, Mesh fixture, compatibility, fault and soak gates
      pass.
- [x] New control scenarios, conformance, PostgreSQL fault matrix and collective
      evaluation gates pass.
- [x] Release manifest verifies all 36 coordinated packages at
      `0.3.0-beta.2`.
- [x] All 36 packages install from isolated tarballs with reviewed exports.
- [x] Registry consumers install exact `0.3.0-beta.2` versions and verify
      behavior/integrity without workspace links.
- [x] Runtime dependency audit has no unaccepted critical/high finding.
- [x] Release candidate worktree is clean and source commit is public.

## Publication and immutable evidence

- [x] All 36 packages publish once under npm `next`; no version is overwritten.
- [x] Registry manifests, integrity values, dist-tags and package count match the
      release commit.
- [x] Two isolated registry consumer profiles pass: portable/in-memory and
      PostgreSQL/durable.
- [x] Annotated `v0.3.0-beta.2` tag points to the exact release commit.
- [x] Machine-readable scale, compatibility, conformance, security and registry
      reports name the exact source/tag/fixture digests.
- [x] Evidence merge contains registry truth only and does not alter published
      code.
- [x] Public CI passes on the implementation merge and evidence merge.
- [x] Rollback restores previous `next` dist-tags or publishes a new version; it
      never overwrites Beta 2.

## Closure evidence

- The normative design is public commit
  `36d5571748fb8818ecf5a1bf925c8af392ad13f0`, merged by
  [PR #50](https://github.com/Agentplat/agentplat/pull/50).
- The immutable release tree is
  `43037e3fa05133377672ef769140912eaf87bcef`, merged by
  [PR #58](https://github.com/Agentplat/agentplat/pull/58) and named by annotated
  tag `v0.3.0-beta.2`.
- The registry-consumer fixture correction is public commit
  `e22dc419aade875418741994ba50287ac14e8b06`, merged by
  [PR #59](https://github.com/Agentplat/agentplat/pull/59); it changes no
  published package.
- The successful idempotent
  [publication workflow](https://github.com/Agentplat/agentplat/actions/runs/30707363847)
  verifies all 36 immutable packages plus the pnpm/Node 20 portable,
  PostgreSQL/durable and npm/Node 22 registry consumers.
- Exact package integrities, dist-tags, timestamps and report digests are frozen
  in [Beta 2 release evidence](../governed-collectives/beta-2-release-evidence.json).
