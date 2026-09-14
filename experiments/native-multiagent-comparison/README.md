# AgentPlat versus native multiagent coordination

**Status: proposed design, not executed.** No evaluation adapters have been
implemented, technical pilots performed, or results collected for this study.
The budget is a proposal, not spending authorization. Design date: 2026-09-14.

This study addresses Federico Moreno's request for a falsifiable question,
public tasks, verifiable outcomes, and analyzable traces for a data science
presentation related to TrafiFlow, without using internal data.

**Question:** with the same Claude model, task tools, and budget, does a team
coordinated by AgentPlat improve success or cost per success compared with
Claude Code Agent Teams and individual Claude Code?

| Element            | Proposal                                                                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Benchmark          | Terminal-Bench 2.0; distribution and files still to be frozen                                                                       |
| Selection          | The entire `data-processing` category; four candidate tasks confirmed in the inspected repository metadata                          |
| Systems            | Individual Claude Code; Claude Code Agent Teams; Claude Code with AgentPlat coordination                                            |
| Size               | Four tasks × three systems × three repetitions = 36 evaluated runs                                                                  |
| Future preparation | Three technical runs, one per system, on the same task outside the evaluation set                                                   |
| Proposed budget    | USD 180 for evaluation + USD 15 for technical pilots; optional USD 15 reserve for up to three replacements after external incidents |
| Deliverables       | Frozen configuration, traces, per-task results, costs, timings, and interpretation of negative or inconclusive outcomes             |

- [Detailed protocol](protocol.md): configuration, isolation, study design,
  accounting, analysis, and decision rules.
- [Readiness checklist](readiness.md): conditions required before any evaluated run.
- [Proposed prompts](prompts.md): shared instructions and system-specific appendices.

The AgentPlat arm would reuse Claude Code as its task execution engine and use
Agent Rooms to coordinate tasks and messages. That bridge still requires
implementation design and readiness checks. Replacing it with a custom loop
against the Anthropic API would require an explicit protocol change.

The documentation and metadata review performed for this design did not run
the benchmark. The [context economics experiment](../context-economics/README.md)
is a separate synthetic study and provides no outcome evidence for this protocol.

[Back to experiments](../README.md)
