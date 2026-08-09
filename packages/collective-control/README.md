# `@agentplat/collective-control`

Opt-in, provider-neutral contracts for locally governed delegation, work,
budgets, revocation and protected effects.

```sh
pnpm add @agentplat/collective-control@next
```

The package composes existing AgentPlat boundaries without making remote
references, Room approvals, Trust decisions or model output authoritative by
themselves. Existing Mesh, Inference Control, Trust, Rooms and Runtime APIs keep
their direct behavior outside this opt-in boundary.

## Entry points

- `@agentplat/collective-control` — closed contracts, canonical digests,
  validation and pure authority state transitions;
- `./bounded-model` — executable finite-state specification and checker for
  finality-bound effects, monotonic authority, budgets, attenuation, fencing
  and fail-closed transitions;
- `./bounded-progress-model` — executable finite fair-scheduler abstraction for
  conditional causal delivery, quorum finality, successor recovery and
  persistent-signal adaptation;
- `./mesh` — governed Objective and Work adapters;
- `./actions` — governed permits, budget reservations and Action Gateway
  composition;
- `./rooms` — authority-neutral Room proposal and evidence contracts;
- `./evaluation` — registered mission, interaction and report contracts;
- `./memory` — bounded single-process reference repositories.

The initial package has no import-time I/O, process-global registry, hosted
service or vendor model dependency. Remote data never installs a mandate.

Evaluation contracts freeze missions, registrations, per-seed samples,
interaction ledgers, Wilson intervals, paired bootstrap comparisons and
1,000-step role-coherence reports. Validators reject omitted seeds, changed
digests, inconsistent totals and samples outside their registration.

## Security boundary

A Delegation Mandate is locally accepted authority. A digest reference is only
a binding hint until the exact current mandate is resolved and verified by the
local application policy. Every governed effect is an intersection of current
mandate, Objective policy, Mesh assignment, Trust/inference decisions, Action
Grant, budget and downstream fencing.

In-memory repositories are intended for local use and deterministic tests.
They do not make cross-process or crash-durability claims.

The bounded model checker exhausts only the state values, commands and trace
depth declared in its input. A completed proof receipt is reproducible evidence
for that finite space, not a proof of a production deployment or its adapters.
Receipts bind the transition implementation, malformed-input command corpus,
bounded-space definition and actual explored state set. Active reservations and
cumulative child consumption share one delegated budget ceiling. Custom pure
transitions must declare a content digest and match reference-valid transitions;
a reject-all implementation cannot produce proof.

Protected effects additionally require an exact finalized allocation binding:
membership epoch, assignment epoch/fence, assignee, capability/role and effect
sink must all match. The checker covers the complete bounded Cartesian product
of that tuple plus per-field malformed and boundary forms. A proof also requires
positive effect-authorization coverage witnesses. The separate progress checker
returns proof, counterexample or incomplete receipts for its four explicit
antecedent-true scenarios. Its result is evidence about that finite abstraction,
not a claim that a production network, quorum, successor, signal or scheduler
is available.
