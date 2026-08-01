# AgentPlat `0.3.0-beta.3` design review

Status: reviewed design candidate, ready for public freeze. The exact normative
design commit remains pending until this document set is merged into public
`main`.

This record reviews the Adaptive Mission Runtime implementation plan, ADR 0009,
evaluation contract V2, acceptance checklist and threat model against the
published Beta 2 contracts. It covers architecture and compatibility, planning
authority, distributed-state safety, evaluation integrity and release scope.

## Reviewed inputs

- `docs/adr/0009-adaptive-mission-runtime.md`;
- `docs/adaptive-mission/beta-3-implementation-plan.md`;
- `docs/adaptive-mission/evaluation-contract-v2.md`;
- `docs/adaptive-mission/beta-3-acceptance-checklist.md`;
- `docs/security/adaptive-mission-runtime-threat-model.md`;
- the public package catalog, Mesh protocol fixtures and supported-version
  matrix;
- Mesh Objective, Work and allocation reducers;
- Collective Control mandate, Work Contract, governed-action and evaluation
  contracts;
- public release, terminology, pack and compatibility gates.

## Exact baseline

- annotated release: `v0.3.0-beta.2`;
- published Beta 2 release commit:
  `43037e3fa05133377672ef769140912eaf87bcef`;
- public post-release evidence baseline:
  `64478b1dce9f62544a865426faef710fa1f70f49`;
- package version at baseline: `0.3.0-beta.2`;
- coordinated public package count at baseline: `36`;
- Mesh wire version: `1`, with supported versions `{0, 1}`.

The design is additive. It introduces one provider-neutral package and opt-in
adapters while preserving every existing default, signed payload discriminant,
protocol fixture and wire version.

## Findings resolved in design

### B3-DR-001 — A precomputed task graph would bypass collective planning

- Severity: P0.
- State: resolved in design.
- Finding: the prior evaluation shape could create tasks and assignees outside
  the production reducers, then report the resulting execution as distributed
  planning.
- Resolution: V2 starts from `MissionIntentV1`, which cannot contain tasks,
  assignments, hidden state or a terminal predicate. Accepted fragments enter
  actual Mesh `work.offer`, `work.bid`, `work.award` and `work.accept` flows.
  Direct Work Contract construction, direct assignee lookup and synthetic
  interaction ledgers invalidate the sample.

### B3-DR-002 — A proposal or adaptive role could be mistaken for authority

- Severity: P0.
- State: resolved in design.
- Finding: if a plan decision or role label authorized an effect, planning
  peers could bypass mandate, assignment and action-policy checks.
- Resolution: proposals, fragments, plan views and adaptive roles are planning
  evidence only. Executable authority remains the intersection of the current
  mandate, accepted Mesh assignment, derived Work Contract, grant or permit,
  and current downstream fence. The Action Gateway repeats those checks at its
  final effect boundary.

### B3-DR-003 — A new Mesh payload would break the frozen compatibility line

- Severity: P1.
- State: resolved in design.
- Finding: adding a planning discriminant to the closed Mesh union or advancing
  the wire version would invalidate Beta 1 fixtures and older peers.
- Resolution: planning uses the existing `work.offer` payload plus the critical
  extension `agentplat.collective-planning.fragment.v1`. Only verified current
  capability enables it. Unsupported peers reject the critical extension and
  no transport outcome triggers a downgrade retry. Wire version 1 and the
  `{0, 1}` supported set remain unchanged.

### B3-DR-004 — Mutable discovery could mint new planning budget

- Severity: P1.
- State: resolved in design.
- Finding: deriving equal budget shards from the currently visible or eligible
  peer set would let discovery churn, Trust changes or Sybil identities resize
  the aggregate planning allowance.
- Resolution: deterministic planning shards derive from the exact sorted
  subject set frozen by the locally accepted mandate and the intent policy.
  Remote messages, discovery, capability and Trust changes cannot resize that
  set or increase a shard. Beta 3 performs no dynamic shard transfer.

### B3-DR-005 — Free proposal identifiers would permit digest grinding

- Severity: P1.
- State: resolved in design.
- Finding: a proposer could vary a nonce or arbitrary identifier until a digest
  won the deterministic final tie-break.
- Resolution: the proposal ID is deterministic from the intent, proposer,
  semantic slot, predecessor and revision. There is no proposal nonce, and one
  proposer may emit at most one proposal for that exact tuple. Digest ordering
  occurs only after the registered semantic scoring policy.

### B3-DR-006 — A fixed 250-interaction convergence bound was impossible at scale

- Severity: P1.
- State: resolved in design.
- Finding: a universal 250-interaction bound cannot establish 95 percent
  agreement across 500 healthy planning participants when information must
  traverse sparse peer links.
- Resolution: recovery and plan convergence are separate endpoints. Benign p95
  recovery remains at most 250 interactions. Affected-slot plan-head agreement
  must reach at least 95 percent of healthy planning participants within
  `min(1,000, 2N)` event-derived interactions after registered heal and
  quiescence. Failure falsifies the milestone hypothesis rather than changing
  the threshold after execution.

### B3-DR-007 — A rejected planning offer could partially mutate Mesh state

- Severity: P1.
- State: resolved in design.
- Finding: running the ordinary Mesh processor before the planning gate could
  commit Objective, Work or allocation state even when the critical planning
  binding failed.
- Resolution: ordinary processing produces a candidate transition. The
  planning gate validates against that candidate before commit. On rejection,
  only the non-evictable replay and message-ID high-waters needed to keep the
  rejected envelope inadmissible may advance. Objective, Work, allocation,
  planning, role, budget and effect state do not commit.

### B3-DR-008 — Fragment indirection could substitute different executable Work

- Severity: P1.
- State: resolved in design.
- Finding: a valid fragment digest attached to a different Work projection or
  repository body would let planning evidence approve one action while Mesh
  allocates another.
- Resolution: `inputReference` identifies the content-addressed fragment. The
  critical extension, repository body and every executable Work field must
  match exactly under tenant, Objective, intent, proposal and fragment digests.
  Missing, widened, cross-scope or conflicting content fails before state
  commit.

### B3-DR-009 — Local plan views could be overstated as global consensus

- Severity: P2.
- State: resolved in design.
- Finding: matching local heads after a bounded heal does not prove Byzantine
  agreement, global completeness or optimality.
- Resolution: Beta 3 reports peer-local plan views, causal frontiers, observed
  coverage and measured healthy-participant agreement only. It explicitly
  defers Byzantine consensus and makes no global-state or optimality claim.

### B3-DR-010 — Runner-owned success and accounting could fabricate evidence

- Severity: P1.
- State: resolved in design.
- Finding: a runner that knows the hidden terminal predicate or emits arbitrary
  counters could report mission success, faults or efficiency without executed
  evidence.
- Resolution: only the independent monitor derives success and safety from the
  hidden environment plus the immutable event trace. Each accounted boundary
  event has one fixed accounting kind and units; bookkeeping events have none
  and zero. Trace replay must reproduce the report ledger exactly, and every
  declared fault requires scheduled, injected and observed events.

## Review verdicts

### Architecture and compatibility

Pass. `@agentplat/collective-planning` is additive, its root remains browser
safe and its Mesh/evaluation adapters are explicit subpaths. Existing roots,
defaults, signed payload unions, protocol fixtures and wire negotiation remain
unchanged.

### Authority and distributed state

Pass. Planning can narrow but cannot mint execution authority. Budget
membership, proposal identity, selection, graph bounds, ingress rejection,
snapshot high-waters and Work projection all have deterministic fail-closed
rules.

### Evaluation integrity

Pass. High-level intent, peer-scoped observations, actual production reducers,
an independent hidden-state monitor, event-derived accounting, exact replay and
deliberately broken implementations make the primary claims falsifiable.

### Release scope

Pass. Beta 3 is limited to 500 logical agents and 5,000 interactions, adds one
coordinated package for an expected total of 37 and defers larger scale and
Byzantine agreement. Implementation and release evidence remain open in the
acceptance checklist.

## Open design findings

P0: 0.

P1: 0.

P2: 0.

## Freeze decision

The design is ready to freeze by public merge. Package implementation must
follow the ordered increments and cannot weaken a closed contract without a
new documented review. The public merge commit becomes the exact normative
design baseline; package code, acceptance evidence, publication and release
tag remain outside this design-only change.
