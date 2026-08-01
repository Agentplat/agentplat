# Agent Mesh `0.3.0-alpha.5` implementation audit

Status: candidate audit complete. Release-commit, CI and registry evidence are
pending coordinated publication.

This audit compares the implementation candidate with the normative Alpha 5
design commit `0de423c85cc6096a674ce2bc54915de7ea72aa1c`. It covers architecture,
security/failure semantics and release compatibility. It does not treat a
local candidate run as evidence for a later commit.

## Reviewed surfaces

- `@agentplat/mesh-http` client, handler, receipt and explicit CORS contracts;
- `@agentplat/mesh/durability` records, hash chain and worker orchestration;
- `@agentplat/mesh-postgres` migrations and repository;
- `@agentplat/rooms-mesh` projections, bridge and Room service sink;
- the forced-restart multi-process example;
- public types, package catalog, tarball consumer and registry consumer;
- protocol-v0, allocation/recovery, Inference Control and Trust regressions.

## Resolved findings

### A5-IA-001 — Revision-zero snapshot CAS lacked a row to lock

- Severity: P1.
- State: resolved.
- Finding: two first transitions could both observe no snapshot row and use
  expected revision zero before either inserted the row.
- Resolution: transition commits take a transaction-scoped advisory lock over
  the full tenant/Mesh/peer/instance scope before evaluating the inbox claim or
  snapshot revision. A real PostgreSQL race test requires exactly one commit
  and one `revision_conflict`.

### A5-IA-002 — Valid base64url message IDs were treated as identifiers

- Severity: P1.
- State: resolved.
- Finding: the durable journal rejected valid 128-bit protocol message IDs
  beginning with `-` or `_`.
- Resolution: inbox message references use the exact canonical 16-byte
  base64url domain, including the final unused-bit constraint. A regression
  vector and the randomized batch benchmark cover the complete alphabet.

### A5-IA-003 — PostgreSQL declarations failed under an isolated package graph

- Severity: P1.
- State: resolved.
- Finding: the generated declarations expose `pg` types, but an isolated pnpm
  consumer could not resolve those declarations from a sibling package.
- Resolution: the packages that expose the PostgreSQL surface declare their
  type dependencies, and the Alpha 5 tarball consumer compiles with
  `skipLibCheck: false` and explicit Node types.

### A5-IA-004 — Oversized streams were released without cancellation

- Severity: P2.
- State: resolved.
- Finding: the HTTP reader stopped retaining bytes at the bound but did not
  cancel the underlying request/response stream.
- Resolution: over-limit and non-byte streams are cancelled before returning a
  coarse failure; a stream-cancellation test verifies the behavior.

### A5-IA-005 — Explicit CORS policy from the frozen contract was absent

- Severity: P2.
- State: resolved.
- Finding: the design allowed `OPTIONS` only when a construction-bound CORS
  policy was present, but the initial candidate implemented POST only.
- Resolution: the handler now accepts exact HTTP(S) origin and lowercase
  request-header allowlists with bounded preflight age. Default CORS remains
  absent, wildcard origins fail closed and authentication is not invoked by a
  valid preflight.

## Failure-matrix evidence

| Boundary                                                                                                                                  | Evidence                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| bytes, media, encoding, route, auth, overload, timeout and response bounds                                                                | `tests/mesh-http.test.mjs`                            |
| deterministic digest, invalid output, abort and recoverable claim behavior                                                                | `tests/mesh-durability.test.mjs`                      |
| duplicate/conflicting receipt, restart, stale claim, concurrent initial CAS, atomic rollback, exact outbox retry and destructive rollback | `packages/mesh-postgres/tests/postgres.test.mjs`      |
| direct repository input validation before I/O                                                                                             | `tests/mesh-postgres-validation.test.mjs`             |
| hostile Room role/metadata, cross-scope input, duplicate and sink retry                                                                   | `tests/rooms-mesh.test.mjs`                           |
| two peers, duplicate HTTP delivery, forced receiver termination and durable recovery                                                      | `examples/mesh-multiprocess`                          |
| reorder, timeout and stale assignment authority                                                                                           | existing Mesh scenario and allocation-recovery suites |

The PostgreSQL integration test was executed against PostgreSQL 16 with its
destructive rollback confirmation. The multi-process example accepted a ping,
terminated the receiver with `SIGKILL`, started a replacement process and
completed one causally bound acknowledgement without persisting private keys.

## Bounded benchmark

The reproducible command is `pnpm run benchmark:mesh-adapters` with standard
PostgreSQL connection environment variables. A 64-record local run on Node
20.19.5 and PostgreSQL 16.14 recorded:

| Operation                                           | Batch elapsed | Approximate operations/second |
| --------------------------------------------------- | ------------: | ----------------------------: |
| durable first receipt                               |      93.81 ms |                        682.23 |
| one `SKIP LOCKED` claim batch                       |      34.35 ms |                      1,863.17 |
| claim, snapshot, journal and settlement transitions |     211.23 ms |                        302.99 |
| duplicate HTTP receipt through PostgreSQL           |      65.38 ms |                        978.89 |

These are diagnostic measurements, not service-level guarantees. Normative
bounds remain 262,144 envelope bytes, a default worker batch of 16 and a hard
worker batch ceiling of 256.

## Verdicts

- Architecture: pass; dependency direction is additive and infrastructure
  does not create protocol or Room authority.
- Security and failure semantics: pass; P0 open: 0, P1 open: 0, P2 open: 0.
- Release compatibility: pass as a candidate; protocol `wireVersion` remains
  zero, the catalog contains 33 packages, and 33 tarballs with 45 declared
  exports install/import from an isolated consumer.

Final acceptance still requires exact-commit CI, dry publication, coordinated
npm publication, integrity verification and the annotated release tag.
