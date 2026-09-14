# Agent Morphogenesis local validation

Status: September 9, 2026 local diagnostics recorded, with a separate completed
supervisor follow-up. Evidence class: integration and recovery diagnostics.

## Question and method

Exercise governed creation/recruitment, decision routes, persistence, crash
recovery, concurrency, isolation and local Agent Mesh fault handling. The source
report distinguishes deterministic in-memory runs from PostgreSQL/Temporal and
multi-process checks.

## Results and reproduction records

The [canonical report](../../docs/research/agent-morphogenesis-local-validation-2026-09-09.md)
records 76 runtime tests, 1,000 deterministic in-memory runs and persistent
service probes. The subsequent controlled supervisor restart/resume run completes
coverage of all 22 scenario behaviors across these local checks. Paid model
calls and external spend were zero.

The report records commands, source bindings, dependencies, failed attempts and
external local evidence paths. Raw logs and follow-up runner snapshots are outside
this repository; a clone alone does not contain that full evidence. Reproduction
requires the documented PostgreSQL/Temporal services and referenced runner files.

## Limits and related evidence

The initial checks used mixed source bindings; the follow-up names its separate
successful snapshot. They are not one signed release bundle. The process restart
is not arbitrary host-loss recovery, the 1,000 in-memory runs are not persistent
distributed executions, and the local checks do not establish production readiness.

The historical [release bundle](../../docs/research/agent-morphogenesis-beta1-release-v1/README.md)
and [readiness V2 bundle](../../docs/research/agent-morphogenesis-beta1-readiness-v2/README.md)
are separate source-bound records with their own verification commands. Their
signed artifacts remain at their canonical paths.

[Back to experiments](../README.md)
