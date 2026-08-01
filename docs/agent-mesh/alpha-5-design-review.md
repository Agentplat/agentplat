# Agent Mesh `0.3.0-alpha.5` design review

Status: accepted design freeze.

This record reviews the Alpha 5 implementation plan, acceptance checklist and
adapter threat model against the public Alpha 4 contracts. It records findings
by boundary so later implementation review can verify that none were reopened.

## Reviewed inputs

- `docs/agent-mesh/alpha-5-implementation-plan.md`;
- `docs/agent-mesh/alpha-5-acceptance-checklist.md`;
- `docs/security/mesh-adapters-threat-model.md`;
- protocol-v0 parser, envelope and payload contracts;
- Mesh loopback, coordination snapshots, replay and fencing contracts;
- Room repository, service, policy, approval and durable event contracts;
- shared PostgreSQL migration and schema-qualification primitives;
- public package catalog, release verifier and pack/registry consumer scripts.

## Review lenses

### Architecture and compatibility

The proposed dependency graph is additive. HTTP depends on protocol types,
PostgreSQL implements Mesh durability contracts, and the Room bridge depends on
the two domains without adding a reverse dependency. Framework remains outside
the graph. Protocol v0 and the four existing Mesh subpaths remain unchanged.

Verdict: pass after resolving the package and subpath ownership finding below.

### Security and failure semantics

The review enumerated every crash window from request receipt through outbox
settlement. It checked separation of HTTP channel identity, signed peer
identity, database work claims, Mesh assignment authority and Room governance.
It also checked response oracles, SSRF, stale claims, transaction partiality,
journal integrity and ambiguous bridge retries.

Verdict: pass after resolving the four P1 findings below.

### Release and operations

The release remains one fixed version and adds three cataloged packages. Every
new adapter is opt-in, migrations are explicit, destructive rollback remains
confirmed, and packed/registry consumer verification grows from 30 to 33
packages. The example is local and does not imply hosted infrastructure.

Verdict: pass with implementation evidence still required by the open
acceptance checklist.

## Findings

### A5-DR-001 — Remote duplicate receipt could become a replay oracle

- Severity: P1.
- State: resolved in design.
- Finding: a response that distinguished first durable receipt from exact
  duplicate receipt would expose remote message retention state.
- Resolution: both return the same accepted remote disposition. Exact duplicate
  detail is local-only. Conflicting message-ID content fails through a coarse
  permanent rejection.

### A5-DR-002 — Worker clocks cannot fence database claims

- Severity: P1.
- State: resolved in design.
- Finding: accepting worker-supplied current time for claim expiry would allow
  skew or a defective worker to extend ownership.
- Resolution: PostgreSQL transaction time determines claim acquisition,
  validity and expiry. Callers supply only bounded lease duration and retry
  policy.

### A5-DR-003 — JSONB reload loses signed-envelope type evidence

- Severity: P1.
- State: resolved in design.
- Finding: JSONB can preserve data but cannot preserve the TypeScript branded
  `SignedMeshEnvelope` boundary.
- Resolution: the adapter stores strict JSON and canonical digest, then runs the
  public strict protocol parser on every load before returning a signed
  envelope. A type assertion alone is forbidden.

### A5-DR-004 — Bridge claim completion cannot make an arbitrary sink exactly once

- Severity: P1.
- State: resolved in design.
- Finding: a sink may commit and then time out before the bridge marks its claim
  complete.
- Resolution: every call receives a stable projection idempotency key and the
  durable no-duplicate guarantee is explicitly conditional on sink support.
  Alpha 5 makes no distributed exactly-once claim.

### A5-DR-005 — Infrastructure contracts need one provider-neutral owner

- Severity: P2.
- State: resolved in design.
- Finding: defining durability contracts inside the PostgreSQL package would
  force alternate stores to depend on a provider package.
- Resolution: semantic records and worker contracts live under
  `@agentplat/mesh/durability`; `@agentplat/mesh-postgres` is one implementation.

### A5-DR-006 — Room events are not a reliable outbound queue

- Severity: P2.
- State: resolved in design.
- Finding: `RoomService` intentionally treats event-publisher failure as an
  observability failure after the Room transaction commits. Registering the
  bridge only as an `EventPublisher` would therefore permit projection loss.
- Resolution: the durable bridge consumes repository-backed Room events or
  explicit aggregate inputs with idempotency. An event publisher may be used
  for best-effort notification only and is not the durable bridge contract.

## Open design findings

P0: 0.

P1: 0.

P2: 0.

Implementation and release findings remain tracked by the Alpha 5 acceptance
checklist. This review does not assert that code or registry artifacts exist.

## Normative commit

The normative design commit is
`0de423c85cc6096a674ce2bc54915de7ea72aa1c`, merged through public PR
[#43](https://github.com/Agentplat/agentplat/pull/43).
