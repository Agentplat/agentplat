# Outcome-Driven Team Structure Adaptation V1 implementation plan

Status: implemented

## Product outcome

Close the peer-local loop from approved team structure through formation and
execution outcome to a bounded preference for the next structure.

## Public surface

`@agentplat/collective-runtime/team-structure-adaptation` provides:

- immutable template catalog and adaptation policy contracts;
- validated, content-free execution observations;
- deterministic integer learning with bounded exploration;
- CAS state, replay protection and portable handoff;
- advisory selection for the next adaptation cycle; and
- adapters to ordinary team-formation positions and requests.

## Invariants

- only exact approved catalog templates are selectable;
- templates are bounded DAGs of permitted roles and capabilities;
- unsafe or failed execution never increases preference;
- quarantine, cooldown, minimum evidence and hysteresis cannot be bypassed;
- active teams never change in place; and
- final authority and eligibility remain with team formation and Work Contracts.

## Integration sequence

1. Define catalogs, policies, observations and deterministic digests.
2. Implement bounded reduction, CAS runtime and handoff.
3. Derive observations from validated team-execution state.
4. Materialize the selected template into a fresh team-formation request at
   team epoch 1.
5. Expose the optional learner through the integrated peer host.

## Completion criteria

Identical state and evidence produce identical decisions, while peers may retain
different local preferences. Replays are idempotent, conflicts and rollback fail
closed, and all materialized positions pass the normal formation validators.
