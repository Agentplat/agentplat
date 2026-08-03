# `@agentplat/mesh-conformance`

Provider-neutral compatibility runners for Agentplat Mesh implementations and
adapters. The package performs no work on import, reads no ambient credentials
and never creates or destroys resources without a caller factory.

The root export owns the closed capability, case and report contracts.
`./protocol`, `./transport`, `./durability`, `./rooms`, `./control` and
`./planning` expose bounded runners. A passing report describes only the exact
artifact, capabilities, fixtures and cases that were executed; it is not a
security certification.

The planning runner covers closed-record validation, scope narrowing,
dependency cycles, exact replay, snapshot scope/rollback, causal replanning,
stale fencing, assignment binding, public evidence and durable restart
high-waters. Its challenges are public and the supplied adapter owns each
assessment. It is executable adapter conformance, not cryptographic proof that
an implementation cannot special-case a fixture. Report validation recomputes
suite/fixture bindings, complete case coverage, capability disclosure, counts
and verdict.

Runners receive an immutable caller seed and abort signal for every isolated
factory invocation. Case, suite and cleanup timeouts are separate outcomes.
Durability and Rooms cases require explicit destructive-test consent; the
durability receipt case also requires reopening the same scope through a
distinct repository instance so an in-memory acknowledgment cannot stand in
for recovery evidence. Cleanup remains caller-owned and is attempted after
success, failure and abort.

The control runner exercises delegation lookup, work-scope narrowing,
single-use effect permits, retained indeterminate budgets, repository CAS,
grant idempotency, redacted hash-linked evidence and inert Room proposals by
calling the supplied ports directly. Durable implementations may additionally
declare `control.persistence`; that case reopens distinct repository instances
and verifies exact authority, execution, grant and evidence state after a
restart. `inspectEvidence` must be an independent redacted view of persisted
records, not a copy of the input fixture.
