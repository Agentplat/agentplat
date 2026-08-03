# Beta 3 increment 10: normative campaign control plane

This increment adds a fail-closed operational control plane for the registered
normative campaign. The public library can execute an authorized shard through
an injected runner, evaluator and durable store; this repository does not
register a real normative runner, execute samples, publish packages, deploy
software, or make a release claim.

The manual workflow accepts a closed `plan|execute` operation, immutable
campaign/source commitments, and an explicit concurrency choice of one or two
shards. Safe planning accepts only the default `DO_NOT_RUN` confirmation; any
execution path requires the exact `RUN_NORMATIVE_240X4` confirmation. It has no schedule,
secrets, cloud credentials, write permission, publication step, tag step, or
deployment step. All checkouts disable persisted credentials.

`plan` creates a public-contract-valid registration, operation plan,
expected-cell/slot manifest and cost estimate before any runner adapter can be
selected. Its descriptor is explicitly unregistered and diagnostic, so the
plan itself grants no execution or eligibility authority. The frozen shape is 240 cells,
48 five-cell shards, and 960 adaptive/centralized × first/replay slots. Its
maximum registered interaction ceiling is 3,296,000.

The workflow's `execute-shard`, `collect`, `analyze`, `verify` and `attest`
modes are intentional stubs. They reject a missing adapter with
`normative_adapter_unregistered`, and explicitly reject `diagnostic` and
`synthetic` adapters. Before creating the 48-job matrix, one protected gate
writes the rejection receipt and suppresses all shards while the plan reports
`adapterRegistered: false`. A future operational adapter must supply durable
cross-host CAS, fenced attempt isolation, immutable public evidence,
full-closure validation and an independent verifier before these workflow
modes may be enabled.

The library boundary is already usable for such an adapter. It requires an
Ed25519 detached authorization bound to audience, plan, registration, source,
adapter, execution, shard set, expiry and an exact five-cells-per-shard budget.
The registered adapter descriptor commits independent implementation and
evaluator digests; a trusted registry resolver must return the runner/evaluator
pair for those exact commitments, and every metric projection must match them
before durable state can change. Ports cannot be injected directly into the
operation. The authorization statement also commits its credential identity,
while the detached signature remains evidence rather than execution identity.
The state, slot and evidence
namespace is derived from the complete plan plus the authenticated
authorization digest, so another plan or credential cannot absorb a prior
attempt while re-verifying the same signed statement remains idempotent. It
persists each evaluator-owned projection immutably and derives
analysis rows from the verified first/replay projection closure. A diagnostic
or synthetic-conformance adapter is rejected before runner code can execute.

Streaming custody has non-overridable ceilings of 16,384 artifacts, 16 MiB per
artifact and 256 MiB total, plus a bounded non-empty chunk count. The local
adapter commits artifact ID, kind, logical path, byte length, content hash and
canonical digest as one immutable semantic binding.

The gate, execution, collection, analysis, verification and attestation jobs
are bound to the protected `normative-campaign-protected` environment. The gate
cannot expose `adapter_registered: true` unless both plan registration and the
adapter-validation step succeed; a failed validation fails the job after its
receipt is uploaded. Direct dependencies carry the exact plan source through
every stage, and each workflow rerun receives a distinct attempt identity. The
plan and all receipts are immutable and retained for 90 days.
