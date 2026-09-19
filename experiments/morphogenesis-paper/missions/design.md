# Four-condition local mission study: engineering design

Recorded before the engineering pilot. This is a controlled synthetic workload
study, not an LLM benchmark or an estimate of production improvement.

## Question

Compare mission completion, preserved dependencies, residual effects, blocked
transitions, role reservations, persistence operations and elapsed local time.
Separate the utility of adapting from integrity of the transition mechanism.

## Conditions

- `fixed`: the minimal fixed role set sufficient for all actual tasks is available
  from the start (generalist, plus statistics specialist when any task needs it).
  This gives the fixed baseline advance knowledge of its required capability set.
- `minimal`: the same adaptive proposal policy, with fresh-identity retries.
- `durable`: the same policy implemented by the real AgentPlat workflow runner
  over its PostgreSQL store; owner reconciliation uses stable operation IDs.
- `morphogenesis`: the same policy routed through the real V1 execution runtime
  and PostgreSQL execution/head adapters, with typed decision/budget bindings.

All conditions use the same deterministic workers, task inputs, immutable
artifact store, owner-side admission, role catalog and reservation ceiling.
The fixed condition is capable of every task. When needed, it reserves the
specialist for the whole horizon. The adaptive conditions activate it on a declared need/forecast
and release it when the remaining workload no longer needs it. The same explicit
proposal schedule is shared by all adaptive conditions; no condition receives
better task intelligence. The schedule is part of the input, not an LLM policy.

## Work and fault cells

Eight phases contain integer-array summary and exact population-variance tasks.
Four demand shapes: stable general work, a specialist burst, shrinking demand,
and a false specialization forecast. An input revision requires replacement of
one earlier artifact; the final report depends on the correct versions.
A separate Python oracle computes expected answers and validates the dependency
DAG from raw input and output, without importing controller or worker code.

Faults: none, lost role-activation acknowledgement, and unavailable reconciliation
after activation. The unavailable endpoint recovers after two phases. A fixed
team has no later activation opportunity; report this exposure difference.
Owner-side authorization checks and durable effect identity are identical in
all four conditions. Minimal coordination is an ablation, not a recommended
deployment baseline. Unknown role activation does not authorize protected work
in either durable condition.

The study has a ceiling of 16 reserved role-phase units (two roles for eight
phases) and a ceiling of three simultaneously active role reservations. A base
role counts toward the ceiling in every condition. Actual materialized duplicate
roles also count. Productive tasks and protocol persistence are reported separately
and are not converted into dollars or invented token counts. Query counts include
controller persistence during a mission; common one-time schema/definition setup
is outside the measured interval. Following the first engineering pilot, an
explicit common ceiling of 512 database queries was added so that governance
persistence also consumes a bounded resource dimension. Two queries are reserved
for emergency rollback. No dollar conversion or cross-resource weight is used.
The measured role budget is enforced before
each phase; no credit is awarded to work from phases beyond exhaustion.

## Pilot, freeze, and analysis

Pilot seeds 9001 and 9002 are excluded from the later held-out run. Use the pilot
to check fault exposure, oracle validity, persistence counts and runtime spread.
Freeze code, input generator, held-out seeds, budget, exclusions and analysis in
a hashed registration before the held-out run. Do not claim statistical power
from an arbitrary repetition count. Outcomes are descriptive paired comparisons
over the declared finite workload grid, not a population reliability estimate.

Keep unexpected errors and failed attempts. Do not tune the reservation ceiling
to manufacture a preferred winner. Publish raw artifacts and ledgers, coverage
of fault injection, denied/budget-blocked work, per-case results and verification.
Small local timing differences are diagnostic only. No model calls, paid services
or external actions are used. Discovery and capability identities are fixtures.
