# ADR 0008: Collective control is local, explicit and compositional

- Status: Proposed
- Date: 2026-08-01

## Context

AgentPlat already separates distributed coordination, inference policy, local
trust assessment and collaborative Rooms. Each layer intentionally refuses to
mint authority owned by another layer. This prevents ambient authority, but it
also means that an application must currently assemble and prove the complete
chain from an approved objective to an externally visible effect.

A useful collective runtime needs one portable integration boundary that can
answer, before each protected transition:

1. which local policy authorized this objective and revision;
2. which budget and capability ceilings remain;
3. which current Mesh assignment owns the work;
4. whether Trust and inference policy permit this action now;
5. whether the delegation or action was revoked, expired or superseded;
6. which immutable evidence binds the decision to the resulting effect.

Putting those decisions in the wire protocol would couple remote coordination
to local policy and make protocol compatibility depend on deployment-specific
authorization. Putting them in Rooms or Trust would incorrectly allow a
collaboration record or confidence score to mint execution authority.

## Decision

Introduce an opt-in Governed Collective Runtime composed from two new public
packages:

- `@agentplat/collective-control` owns provider-neutral contracts, pure
  validation, a Local Policy Adapter, state-machine ports and redacted evidence;
- `@agentplat/collective-control-postgres` implements the durable repositories,
  fencing and reconciliation contract without changing the portable core.

The portable package introduces a signed or locally attested
`DelegationMandateV1`. A mandate is a local authorization document, not a Mesh
message and not a new identity primitive. It binds tenant, local policy domain,
issuer, subject peers, objective/work selectors, capabilities, budgets,
validity, revision and revocation lineage. A remote objective may carry the
mandate digest in its existing `contentReference`, but that reference has no
authority by itself. The receiver must resolve an exact, current, locally
accepted mandate before admitting the objective through the governed adapter.

The Local Policy Adapter composes existing boundaries without bypassing them:

```text
local mandate repository + trusted time
                  |
                  v
signed Mesh input -> existing Mesh inbound processor -> uncommitted candidate
                                              |
                             local mandate gate + replay-only rejection state
                                              |
current assignment + Trust + inference assessment
                                              |
                                              v
                                  existing Action Grant
                                              |
current mandate + governed permit + fencing -> existing Action Gateway
                                              |
                                              v
                                    downstream effect
```

The adapter is the only new authority-composition boundary. It may narrow an
existing decision but never upgrades a failed Mesh, Trust, inference-control or
Room decision. Existing direct APIs remain available and retain Beta 1
semantics outside the opt-in governed boundary.

`GovernedActionPermitV1` binds the exact current mandate digest and revision to
an existing Action Grant digest, assignment authority, epoch, fencing token,
action binding, input digest, budget reservation and expiry. The governed
facade reserves the permit, then invokes the existing Action Gateway with a
composed authority resolver and dispatcher. Those wrappers revalidate mandate,
revocation, budget and Work Contract state at the Action Gateway's own final
authority and dispatch checkpoints. Coordinated effects still require atomic
downstream fencing.

Revocation and revision use durable local high-water marks. A stale cache,
restart, replayed mandate or remote reference cannot lower the accepted
revision or erase a revocation. Failures after an uncertain external dispatch
produce an `indeterminate` terminal outcome; they are never silently retried as
if no effect occurred.

Rooms may produce a mandate proposal and display governed evidence. Room
participants, roles, messages, tasks and approvals are contextual inputs only.
An application-supplied mandate issuer decides whether a proposal becomes a
locally accepted mandate. Trust supplies scoped evidence and policy outcomes;
it never supplies authority. Inference Control continues to own assessments
and Action Grants. Mesh continues to own distributed assignment, lease and
fencing authority.

The evaluation layer compares the governed collective runtime with the existing
`MultiAgentSession` deterministic centralized baseline under the same versioned
mission, seed, resources, agent policy, interaction accounting and applicable
fault schedule. Individual runs remain exactly replayable. Aggregate
conclusions are statistical and include confidence intervals, sample counts
and declared stopping rules.

No wire-version, signed payload or existing persistence schema is changed.
Beta 1 `wireVersion: 1` fixtures remain byte-identical.

## Invariants

1. Remote data never installs a mandate or lowers a local authority high-water.
2. A mandate digest reference is not authorization without an exact local
   current record.
3. Room approval, Trust score, inference assessment, Mesh assignment and Action
   Grant remain independent decisions.
4. Every governed effect binds one current mandate, assignment and Action Grant
   at reservation and dispatch time.
5. Revocation, expiry, terminal assignment and exhausted budget fail closed.
6. Budget is reserved before dispatch and reconciled exactly once to a
   committed, released or indeterminate terminal record.
7. Existing APIs and direct execution paths do not silently become governed.
8. Raw prompts, secrets, private reasoning and unrestricted tool inputs are not
   required evidence.
9. Evaluation peers cannot read simulator-global state; only invariant monitors
   may do so.
10. Statistical success claims include the complete registered experiment
    contract and cannot discard failed seeds.

## Consequences

- Applications gain one auditable local boundary for authority, budget,
  revocation and effects without requiring a hosted control plane.
- Open-weight and black-box model providers can participate when their declared
  provider capabilities satisfy the selected policy.
- Existing integrations stay source and behavior compatible unless they opt in.
- Local operators remain responsible for installing mandate issuers, trusted
  time, durable repositories and downstream fencing.
- A passing conformance or evaluation report proves only the exercised
  contracts and experiment; it is not a deployment authorization or capacity
  promise.
- Cross-host consistency still depends on the selected durable adapter and
  application deployment model; the portable package performs no import-time
  I/O and runs no control plane.
