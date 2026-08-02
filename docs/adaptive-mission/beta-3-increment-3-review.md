# AgentPlat `0.3.0-beta.3` Increment 3 review

Status: locally accepted. Public pull-request CI and merge remain pending.
Environment, evaluation, campaign and release-publication increments remain
outside this review.

## Reviewed scope

- portable observed Work lifecycle commands and their snapshot high-waters;
- the opt-in `@agentplat/collective-planning/mesh` facade;
- exact capability and critical-extension negotiation;
- bounded content-addressed fragment storage and proposal-to-Work projection;
- inbound fail-closed admission with replay-only rollback;
- Work Contract and adaptive-role derivation from current Mesh assignment;
- Work revision, cancellation and supersession composition;
- the packed three-peer intent-to-assignment consumer and public type surface.

The browser-safe package root remains independent of Mesh. This increment adds
no signed payload discriminant, wire version or downgrade path.

## Closed findings

### B3-I3-001 — Local critical offers were rejected by the generic Mesh gate

- Severity: P0.
- Resolution: local allocation evaluation now accepts an explicit bounded list
  of supported critical extensions. The default is empty and fail-closed. The
  accepted list is retained with the local offer so snapshot restore repeats
  the same verification instead of silently widening support.

### B3-I3-002 — A remote planning decision could be mistaken for local authority

- Severity: P1.
- Resolution: the repository decision is evidence only. Every receiver records
  and evaluates the proposal through its own deterministic reducer, selects its
  own head and derives its own fragment digest before projecting Work.

### B3-I3-003 — Content indirection could substitute executable Work

- Severity: P1.
- Resolution: the extension, immutable repository record, source PlanView,
  current Work mapping and every executable offer field are checked under the
  same tenant, policy domain, Mesh, Objective, intent, proposal, fragment and
  Work revision. Substitution and cross-scope reuse fail before commit.

### B3-I3-004 — Planning rejection could leave partial coordination state

- Severity: P1.
- Resolution: ordinary Mesh evaluation produces a candidate state. Planning
  admission runs before publication. Rejection restores coordination,
  discovery, Objective, Work, allocation and planning projections and retains
  only the inbound replay and message-ID security high-waters.

### B3-I3-005 — Planning-marked Work could be downgraded or split by recipient

- Severity: P1.
- Resolution: all Work offers for the planning-bound Objective require the
  critical extension. Every recipient receives identical critical semantics,
  reoffers preserve earlier critical evidence, and peers lacking the exact
  current profile are not retried through a legacy or non-critical path.

### B3-I3-006 — Generic capability matching rejected a negotiated subset

- Severity: P2.
- Resolution: critical-extension allocation may opt into a bounded exact list
  of eligible peer IDs already selected from verified Peer Cards, Peer Views
  and capability advertisements. Default non-critical allocation retains its
  existing deterministic recipient behavior.

### B3-I3-007 — Work revision could retain stale assignment authority

- Severity: P1.
- Resolution: Work revision is accepted only while the fragment is unassigned
  and offered. It carries no role binding. Assigned or executing Work must
  terminate or drain, then obtain a fresh award, acceptance, Work Contract,
  epoch and fence.

### B3-I3-008 — Snapshot succession did not bind the lifecycle time witness

- Severity: P2.
- Resolution: lifecycle command high-waters retain the first accepted reducer
  logical-time witness. Snapshot validation checks its temporal reachability,
  and succession now requires the witness to remain byte-for-byte unchanged.

### B3-I3-009 — The packed gate stopped before the planning role transition

- Severity: P1.
- Resolution: the tarball consumer follows signed offer, bid, award and accept
  reducers to an active Mesh assignment, derives the Work Contract and adaptive
  role from that real assignment, applies the planning assignment CAS and
  verifies assignee, epoch, generation, fence and assigned planning head.

## Local evidence

- 62 focused contract, reducer, facade and allocation tests pass;
- public TypeScript contracts cover the complete root and `./mesh` exports,
  including negative authority and immutability cases;
- the packed consumer installs the coordinated 37-package tarball cohort and
  executes three signed peers through intent, local planning, Work creation,
  two offers, two bids, deterministic award, acceptance, Work Contract and
  adaptive-role assignment;
- the packed negative path sends a signed downgraded offer through the real
  inbound facade and verifies replay-only rejection with no Work or planning
  commit;
- existing non-planning, compatibility, npm, pnpm and public-surface gates
  remain part of the monorepo check.

## Review verdict

P0: 0.

P1: 0 after remediation.

P2: 0 after remediation. The pure reducer treats observed adapter records as
non-authoritative evidence and intentionally does not import Mesh; executable
authority is revalidated at the Mesh, Collective Control and effect boundaries.

Increment 3 is ready for public CI and merge. This verdict does not claim the
environment adapter, independent monitor, truthful evaluation campaign,
registry publication or final Beta 3 release gates.
