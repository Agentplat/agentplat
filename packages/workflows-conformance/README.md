# `@agentplat/workflows-conformance`

Provider-neutral compatibility runner for Governed Durable Workflows V1.

The suite exercises definition registration, DAG execution, operation
idempotency, signals, waits, gate expiry, cancellation/compensation, task
bindings/usage, delayed outcomes and optional persistence across a distinct
reopened runtime instance.

Factories own isolated scopes, executors, clocks and cleanup. Persistence cases
require explicit destructive-test consent because an adapter may create and
drop a disposable database schema.

A passing report binds the declared implementation, capabilities, complete
case set and results. It is executable adapter conformance for the exact tested
artifact, not a security certification, production-scale durability result,
latency claim or exactly-once external-effect guarantee.
