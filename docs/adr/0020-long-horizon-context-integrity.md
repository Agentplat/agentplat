# ADR 0020: Context integrity requires an enforcement-bound filter

- Status: accepted
- Date: 2026-08-06

## Context

Inference Control already separates trusted instructions from untrusted data,
assesses provider requests, outputs and actions, and tracks longitudinal role
coherence. Those boundaries can deny unsafe work, but an application-provided
assessor remains responsible for semantic context integrity.

Detecting a hostile or contradictory context entry is insufficient when the
same entry is still sent to the model or agent. Conversely, globally deleting
untrusted inputs destroys partial-observation and creative problem-solving
behavior.

## Decision

Add a local, content-free Context Integrity controller with explicit
per-entry decisions and an exact filter binding.

The controller evaluates the full original set and returns `admit`, `restrict`,
`isolate`, `require_corroboration` or `deny` for every item. A protected model
or adapter wrapper may continue with only `admit` and `restrict`. If a decision
withholds any item but the request lacks an allowed filter-binding digest, the
overall decision is not `allow`.

The reducer retains digests, scores and monotonic heads, not content. It uses
trusted logical time, CAS persistence, bounded windows, sticky degradation and
recovery hysteresis. Conflicting claims are compared only through local claim
and corroboration digests.

The built-in analyzer is deliberately explainable and portable. Applications
may compose semantic entropy, model, classifier or representation-probe
analyzers, but every result is strictly bound and reduced conservatively.

## Consequences

- Quarantine is an enforceable data-flow change rather than a diagnostic label.
- Closed and open model providers share the same outer control contract.
- Partial context can continue when the exact filter wrapper is installed.
- Safety may reduce availability under missing or contradictory information.
- The controller cannot establish truth or authorize work/effects.
- Existing applications remain unchanged until they install the feature.

## Alternatives considered

### Assess only the final output

Rejected because poisoned context can alter planning, tool selection and
internal state before an output is assessed.

### Deny every step containing suspicious input

Rejected because a local agent should be able to proceed with independently
safe context when policy permits bounded filtering.

### Rewrite untrusted content into trusted instructions

Rejected because transformation does not establish provenance or authority.

### Store full context for future analysis

Rejected because it expands secret, prompt and hidden-reasoning exposure and
makes long-horizon state unbounded.
