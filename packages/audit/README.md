# @agentplat/audit

Audit contracts and redaction helpers for AgentPlat.

## Installation

Requires Node.js `>=20.19.3` when used alongside the collective runtime. The
current coordinated prerelease is published under `next`; use the explicit
version for a reproducible install:

```sh
npm install @agentplat/audit@0.3.0-beta.4
```

```ts
import { createMemoryAuditSink } from "@agentplat/audit";

const auditSink = createMemoryAuditSink();
```

This package defines audit records, sinks and utility helpers for redacting sensitive details before records are stored, emitted or shared with operational systems.

`InMemoryAuditSink` recursively redacts credential-like fields before retaining records.

`createSessionAuditSink` adapts public `SessionEventRecord` values into
redacted append-only audit records. It is appropriate for observable ephemeral
sessions; use Agent Rooms when approvals and durable work lifecycle are needed.

## Collective telemetry

`@agentplat/audit/collective-telemetry` provides a content-free, signed and
hash-chained evidence stream per peer. Its schema accepts only identifiers,
digests, categorical outcomes and policy-allowlisted non-negative numeric
metrics. It cannot carry prompts, model output, tool payloads or arbitrary
metadata. State is persisted behind a revision-and-digest CAS store and checked
against a required, independently protected monotonic anchor. The in-memory
anchor is a reference implementation only; durable hosts must install their
own rollback-resistant witness. Streams can export a verifiable, bounded
evidence bundle for later analysis. Loading is fail-closed unless the persisted
stream, tenant, collective, signer instance, key and policy exactly match the
runtime configuration. If a state write wins while another writer advances the
anchor, reconciliation accepts only the direct successor proven by the
persisted state's `previousStateDigest`.

Durable producers use one nominal handoff operation rather than public
record/release primitives or retention-window lookup. The telemetry store first
atomically commits the signed event and a bounded receipt keyed by the
producer's delivery digest. The module-owned handoff then requires the source
to mark its envelope `recorded`, privately releases the receipt, and finally
ACKs the source envelope. Consumers cannot independently invoke the runtime's
record or release phases. The receipt lives outside bounded event retention, so
a restart remains idempotent even after the event leaves the state window. An
existing receipt is accepted only after stream and monotonic-anchor
reconciliation plus receipt/input/event/sequence validation. Module-owned
WeakMap invokers bind the full four-phase protocol to a genuine
`CollectiveTelemetryRuntimeV1`, ignoring structural objects and method or
subclass overrides. The durable host bridge is a one-shot capability: the host
adapter claims it during construction, and any later attempt to obtain another
handoff from a retained runtime fails closed.

Events may also carry content-free causal coordinates for a mission, cycle,
decision and effect. `verifyCollectiveTelemetryEvidenceBundleV1` authenticates
each source chain before `createCollectiveTelemetryCausalReplayV1` merges
multiple peer streams into one deterministic replay with category counts and
metric totals. Replay is bound to one tenant and collective, deduplicates exact
overlap, verifies continuity across adjacent bundles from the same stream and
rejects conflicting coordinates, disconnected ranges or signer identity
changes. Membership, recovery, interoperability and simulation are first-class
event categories; replay never treats telemetry as execution authority.
