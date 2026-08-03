# AgentPlat `0.3.0-beta.3` Increment 10 review

## Status

Increment 10 adds the public, fail-closed control plane for the complete
statistical campaign. It fixes 240 paired cells, 960 first/replay execution
slots, 48 consecutive five-cell shards and a maximum registered interaction
ceiling of 3,296,000. The library can execute one authorized shard through
trusted, injected boundaries; this repository registers no real normative
adapter and has not run the costly campaign.

No package is published, no service is deployed, no release tag is created and
no campaign result is claimed by this increment.

## Authorization and adapter resolution

The operation plan binds the exact registration, source commit/tree and
adapter descriptor. Detached Ed25519 authorization additionally binds issuer,
audience, credential identity, plan, registration, source, adapter, operator
execution ID, exact shard set, validity interval and exactly five cells per
authorized shard. A verifier receives the issuer and audience as explicit trust
policy inputs.

Runner and evaluator functions cannot be supplied directly to the operation.
A trusted registry resolver receives the authorized descriptor,
implementation, evaluator, plan and authorization digests and returns the
registered pair. The returned commitments and every evaluator-owned projection
are checked before durable mutation. Diagnostic and synthetic-conformance
descriptors are rejected before registry resolution or runner execution.

The durable state, run-key and artifact namespace is derived from the plan and
stable authenticated authorization digest. Credential identity is statement
content, while the detached signature is verification evidence rather than
namespace entropy. Another plan, credential or workflow attempt cannot absorb
commits from the current operation; re-verifying the same statement remains
idempotent.

## Evidence custody and analysis

The streaming verifier requires exact logical-index closure and verifies each
artifact's logical ID, kind, path, byte length, SHA-256 content hash and
canonical domain digest. Its non-overridable ceilings are 16,384 artifacts,
16 MiB per artifact and 256 MiB total. Arrays are copied from validated data
descriptors rather than caller-controlled iterators; empty chunks and streams
above the fixed chunk count fail closed.

The independent analyzer accepts only evaluator-owned projections bound to the
registration and derived execution namespace. It maps exactly 960 projections
to 240 paired rows, rejects duplicate, missing, extra, misbound and divergent
replay evidence, and returns `incomplete` before bootstrap when closure is not
exact. Acceptance uses registered one-sided Wilson bounds, descriptive
two-sided Wilson intervals, exactly 10,000 deterministic paired bootstrap
resamples and the fixed nominal/benign Holm family.

An `eligible` attestation can be derived only from an authenticated verified
closure proof. The generic attestation constructor cannot create that status,
and serialized attestations are re-authenticated and re-derived during
verification.

## Protected operation workflow

`collective-statistical-normative.yml` is `workflow_dispatch` only, has
`contents: read`, pins every action by commit and checks out only the exact
dispatched protected `main` commit. Shell inputs enter commands through quoted
environment variables. The execution gate fails its job when adapter
validation fails, uploads the immutable rejection receipt with `always()`, and
cannot expose a runnable matrix unless both plan registration and gate
validation succeed.

The repository plan always records `adapter_registered: false`; therefore the
48-shard matrix is suppressed. Future execution is additionally protected by
the `normative-campaign-protected` environment, a one-or-two shard concurrency
cap and a workflow execution identity containing `run_attempt`. Plan and
receipt artifacts are retained for 90 days.

## Verification

Focused positive and negative tests cover authorization expiry and signature
identity, exact shard budgeting, trusted adapter resolution, source mismatch,
diagnostic rejection, evaluator substitution, replay divergence, immutable
receipts, hard streaming limits, hostile arrays/chunks, semantic binding,
missing projections, extra bindings and deterministic analysis. Public type
contracts and the packed runtime consumer exercise the new exports without
allocating campaign runners.

The full repository `check` gate, public audit, type checks, unit and adapter
suites, compatibility fixtures, campaign consumers and isolated package
consumers are required to pass before integration. Independent architecture,
statistics, operations and adversarial-security reviews are part of the same
gate. The final adversarial pass reports zero open P0, P1 or P2 findings after
verifying the trusted adapter resolver, signed credential identity, durable
namespace, exact shard budget, evaluator binding, streaming hard caps, hostile
array/chunk defenses and protected workflow gate.

## Remaining release boundary

The next increment must implement and register the actual provider-neutral
runner/evaluator adapter and cross-job durable custody, then execute the
protected 240-cell campaign. Only a complete independently verified result can
close the still-unchecked statistical acceptance items. Package publication and
release promotion remain separate, explicitly authorized objectives.
