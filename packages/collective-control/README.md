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
