# AgentPlat experiments and evaluations

Start here to find exploratory experiments, benchmarks and local validation
records. Each entry states its evidence class, available artifacts and limits.
This index is not a capability certification or a claim of production readiness.

## Completed runs and recorded diagnostics

| Study | Evidence class | Recorded outcome | Artifacts |
| --- | --- | --- | --- |
| [Agent Room context economics](context-economics/README.md) | Synthetic selection experiment | Nine fixtures × three policies; explicit references preserve required context with smaller envelopes in distractor-heavy fixtures | Runner, tests and 27 result rows in the repository |
| [Agent Mesh adapter benchmarks](mesh-adapters/README.md) | Local performance diagnostic | Historical Beta 1 report records ten workloads and zero correctness violations | Runner, workload configuration and historical JSON report |
| [Agent Morphogenesis local validation](morphogenesis-local/README.md) | Local integration and recovery diagnostics | September 9 report records deterministic runs, persistent service probes and a subsequent supervisor restart/resume | Report in repository; raw September logs are external local files |
| [Convergence instrumentation](convergence-instrumentation/README.md) | Synthetic instrumentation validation | Local checks documented; revised full registered campaign remains pending | Verification script, tests and scope report |

Historical outcomes above summarize the linked records; indexing them does not
rerun or freshly attest their results. See each entry before comparing numbers.

## Related evidence and planned studies

- [AgentPlat versus native multiagent coordination](native-multiagent-comparison/README.md):
  proposed Terminal-Bench 2.0 data-processing comparison for Federico's study;
  36 planned runs across individual Claude Code, Agent Teams and AgentPlat.
  Design only: adapters, technical pilots, model budget and evaluation remain pending.
- [Morphogenesis Beta 1 release evidence](../docs/research/agent-morphogenesis-beta1-release-v1/README.md):
  signed 18-scenario local release profile. Experimental evidence is explicitly
  uncollected; this is release evidence.
- [Morphogenesis Beta 1 readiness V2](../docs/research/agent-morphogenesis-beta1-readiness-v2/README.md):
  signed, bounded 22-scenario local/staging readiness profile. The
  [superseded V1 record](../docs/research/agent-morphogenesis-beta1-readiness-v1/README.md)
  remains an incident record, not a successful qualification.
- [Registered collective empirical study](../docs/research/local-empirical-execution-package-v2.md):
  execution tooling and study geometry; this document does not claim completed
  empirical samples. Follow the [protocol](../docs/collective-runtime/empirical-validation-protocol-v1.md)
  and [research records](../docs/research/README.md) for registration and evidence custody.

## Add an experiment

Create `experiments/<descriptive-name>/README.md` using the
[entry template](TEMPLATE.md), and add it to the appropriate table or section.
Use an explicit evidence class: synthetic experiment, local benchmark,
integration diagnostic, registered empirical study, or release/readiness evidence.
Keep planned, executed, failed, superseded and externally stored results explicit.

New self-contained experiments may keep their runner and compact public results
in their directory. Existing package tests, scripts and historical evidence stay
at their canonical paths and are linked from an entry. In particular, preserve
signed bundles and their relative paths. Do not duplicate historical results.

Record the question, baseline, workload, source/environment, reproduction steps,
measurements, failures and interpretation limits. Distinguish measured values
from proxies and unmeasured outcomes. Keep large raw traces outside Git with an
artifact location and digest when available; never commit credentials or private
keys. Changes to an experiment should update its tests and result interpretation.

The [AgentPlat Evidence Boundary](../docs/ai/context.md) and existing registered
study requirements continue to apply. This directory introduces no new public
runtime contracts or capability-baseline entries.
