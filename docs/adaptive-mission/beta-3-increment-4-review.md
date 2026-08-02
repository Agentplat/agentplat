# AgentPlat `0.3.0-beta.3` Increment 4 review

Status: locally accepted. Public pull-request CI and merge remain pending.
Closed-loop runners, fault campaigns and release publication remain outside
this review.

## Reviewed scope

- browser-safe `@agentplat/collective-planning/evaluation` contracts;
- strict runner-visible initialization, observation, protected-effect,
  logical-time and opaque snapshot ports;
- append-only `CollectiveTraceEventV2` and replay-only interaction ledger;
- evaluator-only invariant-monitor event chain, verdict and snapshot;
- deterministic `@agentplat/mesh-sim` reference world with hidden canaries;
- exact observation cursors, effect idempotency, authority generation and
  fencing;
- before-commit and after-commit timeout reconciliation;
- boundary evidence, canary scanning and negative evaluator controls; and
- unchanged Collective Control evaluation V1 behavior.

The portable package contains no environment implementation. The reference
world lives only in `mesh-sim`; its runner receives the exact frozen environment
port, never the harness or monitor.

## Closed findings

### B3-I4-001 — Registration and monitor content addresses could be circular

- Severity: P0.
- Resolution: a pre-existing immutable `registrationDigest` binds monitor
  policy and monitor events. The later evaluation `bindingDigest` binds the
  complete environment, policy digest, runner, seed and limits and is used by
  environment requests and trace events. Neither digest depends recursively on
  itself.

### B3-I4-002 — A runner port could smuggle evaluator-only state

- Severity: P0.
- Resolution: the public audit requires a frozen object with exactly seven
  enumerable data properties and no symbols or accessors. Extra oracle,
  hidden-state, membership, monitor, ledger or direct-assignment members are
  rejected. The reference port stores all hidden data in closures.

### B3-I4-003 — Report code could supply success or interaction totals

- Severity: P0.
- Resolution: accounted kind and units are a fixed function of the closed trace
  event kind. The ledger is rebuilt from every validated event. Mission success,
  partial success, objective value and violation counters are rebuilt from the
  independent monitor event chain. Boundary evidence compares both replays and
  rejects recomputed but synthetic values.

### B3-I4-004 — Observation cursor reuse could disclose or skip peer state

- Severity: P1.
- Resolution: cursor identity binds peer, peer instance and exact request
  digest. Same cursor and same digest is idempotent; different content is a
  conflict. Only observations already scoped to that peer and instance can be
  returned, and exhausted cursors do not create accounted padding events.

### B3-I4-005 — Effect retry could duplicate a commit or hide a stale executor

- Severity: P0.
- Resolution: the sink binds idempotency key, complete attempt digest, Work and
  contract revisions, assignment epoch, authority generation, fence, action
  class and input digest. Exact retry resolves the stored result. Conflicting
  reuse, stale fence and a second commit for one effect fail and emit independent
  monitor evidence.

### B3-I4-006 — Timeout timing could be inferred from one ambiguous outcome

- Severity: P1.
- Resolution: before-commit timeout retains no committed effect. After-commit
  timeout records the hidden commit and returns an indeterminate first receipt;
  exact retry resolves to the committed receipt without committing twice.

### B3-I4-007 — Snapshots could serialize hidden state or permit history rewrite

- Severity: P1.
- Resolution: public handles contain only registration, seed, logical time,
  event count and digests. Hidden state is retained in evaluator-owned opaque
  storage. Restore rejects unknown handles, cross-registration/seed handles and
  rollback over a longer current trace or monitor chain. Both current chains
  must be exact prefixes of the snapshot, so a shorter divergent branch cannot
  be rewritten. A fresh identically registered harness restores the handle and
  produces the uninterrupted trace digest.

### B3-I4-008 — Canary transformations could evade a literal scan

- Severity: P2.
- Resolution: public artifact scanning uses canonical JSON and checks the raw
  canary plus UTF-8 hexadecimal and padded or unpadded Base64 forms. Boundary
  evidence cannot be created when any supplied public artifact contains one of
  those forms.

### B3-I4-009 — Interaction ceiling could remain a diagnostic metric

- Severity: P1.
- Resolution: the ceiling is derived during trace replay. Finalization appends a
  terminal monitor event and forces mission failure when the ceiling is
  exceeded; it cannot be reclassified as infrastructure-invalid.

### B3-I4-010 — A caller could scan a decoy canary

- Severity: P0.
- Resolution: both evidence creation and validation recompute the supplied
  hidden-canary digest and require an exact match with the registered digest.
  Scanning also recognizes canonical JSON escaping in addition to raw, UTF-8
  hexadecimal, Base64 and Base64URL forms.

### B3-I4-011 — A monitor could claim an unwitnessed successful effect

- Severity: P0.
- Resolution: monitor success, delivered-observation and terminal events require
  a trace witness at the same logical time. A committed-effect witness must be a
  committed trace event or an explicitly after-commit indeterminate event. The
  harness exposes one monitor facade whose events are exactly those finalized
  into boundary evidence.

### B3-I4-012 — Replay helpers could accept disconnected valid events

- Severity: P1.
- Resolution: interaction-ledger replay now verifies chain succession, causal
  parents, unique event identities and non-regressing logical time before
  accounting any event.

## Local evidence

- focused tests cover successful replay, disconnected and synthetic ledgers,
  constant verdict, unwitnessed monitor success, global oracle, direct
  assignment, cursor conflict, stale fence, raw/encoded/escaped canary leaks,
  wrong-canary binding, idempotent retry, timeout timing, opaque restore,
  divergent-history rejection and interaction ceiling;
- public TypeScript contracts cover the evaluation subpath and prove that the
  runner port has no monitor, hidden-state, membership or verdict setter;
- the packed planning consumer imports and executes evaluation accounting and
  port audit from the tarball subpath;
- the existing evaluation V1 suite, including the 500-agent 5,000-interaction
  case, passes unchanged; and
- browser-safe catalog traversal includes `./evaluation` while the environment
  implementation remains in `mesh-sim`.

## Review verdict

P0: 0 after remediation.

P1: 0 after remediation.

P2: 0 after remediation.

Increment 4 is ready for public CI and merge. This verdict does not claim a
closed-loop runner, complete fault injection, normative statistical campaign,
durable adapter validation or package publication.
