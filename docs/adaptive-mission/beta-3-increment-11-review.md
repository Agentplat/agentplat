# Beta 3 increment 11 review: registered runtime custody

Date: 2026-08-03

## Decision

Increment 11 is accepted at the open-source implementation boundary. The
provider-neutral statistical runtime now resolves through a closed registry,
executes under an exact signed operation authorization, stores resumable state
in PostgreSQL and derives projections through an evaluator-owned replay path.

Acceptance covers one bounded preflight of five cells and twenty logical
slots. It does not authorize the complete 240-cell campaign, a release,
deployment, package publication or paid-provider traffic.

## Delivered boundary

### Closed runtime registration

- An immutable registration binds the descriptor, runner implementation,
  evaluator implementation, plan and authorization digests.
- Resolution has no module path, URL, mutable tag or late-registration input.
- Runner and projector are separate frozen ports. Descriptor, implementation,
  evaluator, plan and authorization substitution fails before mutation.
- The registered runner uses the existing governed closed-loop runtime. The
  projector independently reconstructs trace succession, interaction
  accounting, monitor verdict and boundary evidence.
- Mission and safety failures remain evaluated terminal outcomes. Only
  malformed, incomplete or misbound evidence is infrastructure-invalid.

### Cross-host custody

- The public `@agentplat/mesh-sim-postgres` adapter provides namespaced
  execution state, immutable logical artifact bindings, content-addressed
  bytes and immutable slot commits.
- Every registered execution commit binds execution, registration, cell, run
  key, lease generation/token/worker and operation deadline.
- State CAS, artifact publication and slot commits acquire PostgreSQL locks
  before sampling `clock_timestamp()`. A worker that expires while waiting
  cannot mutate durable state.
- Fence checks precede duplicate detection. Identical bytes from an expired or
  superseded worker are rejected rather than treated as a successful retry.
- The local and memory adapters implement the same complete-provenance
  behavior for deterministic testing. Historical unfenced adapters remain
  compatible but cannot satisfy the registered operation port.

### Protected preflight

- Planning is safe under `DO_NOT_RUN`; execution requires the exact
  `RUN_REGISTERED_PREFLIGHT_5X4` confirmation.
- The manual workflow selects one fixed five-cell shard and its four slots per
  cell. It has no complete-campaign branch, schedule, deployment or publication
  step.
- Authorization uses an Ed25519 private key plus a separately configured
  trusted public key. Issuer, audience, fingerprint, signature, source, plan,
  adapter and shard bindings are verified before mutation.
- Database credentials are used to construct the custody pool and then removed
  from the process environment.
- The runner executes in a digest-pinned container with no network, read-only
  root filesystem, read-only workspace, no Linux capabilities, no privilege
  escalation and bounded CPU, memory, process count and temporary storage.
- The runner worker accepts bounded JSON lines only. It imports no database,
  networking, environment or child-process interfaces.

## Verification evidence

The following gates were executed from an isolated worktree based on
`86f6ddefbfb578183f3f7429cdf0f38e8a40164f`:

| Gate | Result |
| --- | --- |
| Public source/terminology/secret audit | Passed: 1,615 files, zero findings |
| TypeScript build and public type contracts | Passed for 39 public packages |
| Registered runtime, registry and evaluator tests | Passed |
| Memory and local fenced-store tests | Passed |
| PostgreSQL integration against a local digest-pinned service | Passed: 6/6 |
| Isolated Docker runner integration | Passed: 1/1 |
| Protected workflow and CLI static boundary tests | Passed: 4/4 |
| Independent security review | Passed: 0 P0 and 0 P1 findings |
| Root `pnpm run check` | Passed after the final static-test correction |

The PostgreSQL integration includes competing clients, stale and replaced
fences, operation expiry after a row-lock wait, immutable artifact binding and
response-loss/idempotency behavior. The isolated-runner integration executes
the real registered runner with network and credential access removed.

## Security disposition

The final independent review found no open P0 or P1 issue. Two earlier risks
were closed before acceptance:

1. Deadline enforcement moved inside PostgreSQL transactions and occurs after
   the relevant advisory/row locks for state, artifacts and slot commits.
2. Runner execution moved behind a constrained container proxy that receives
   no custody credential and has no network route to PostgreSQL.

Public artifacts retain only bounded identifiers, digests, counts and reason
codes. Raw prompts, private reasoning, secrets, hidden world values,
unrestricted observations and process environments are outside the evidence
schema.

## Deferred, still fail-closed

- Complete 240-cell / 960-slot campaign execution.
- Multi-host production infrastructure and long-lived credentials.
- Statistical eligibility or comparative performance claims.
- Package publication, release tagging or distribution-tag promotion.
- Deployment of any service or workflow.
- Paid model/provider calls.

Those actions require a separate objective, cost estimate, externally operated
durable backend and explicit operator approval. Their absence does not weaken
the Increment 11 implementation result; it intentionally preserves the next
authorization boundary.
