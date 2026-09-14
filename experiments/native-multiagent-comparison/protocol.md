# Proposed protocol: AgentPlat versus native coordination

Design version: 0.1, 2026-09-14. Status: **proposal for review, neither frozen nor
executed**. This document reports no results and authorizes no model calls,
infrastructure, or spending. It builds on Federico's protocol dated 2026-09-10;
the clarifications below require review before the protocol is frozen.

## 1. Question and claim boundary

Compare three complete systems using the same model, task tools, initial data,
and aggregate limits. The primary comparison is AgentPlat versus Agent Teams;
the individual agent tests whether coordination helps within this scope.

Practical hypothesis: AgentPlat achieves more successes within budget, or a
materially lower cost per success without losing successes on any task. Neither
outcome is presumed. Section 10 determines whether a second evaluation is warranted.

The generalization scope is four tasks, with three repetitions per system.
These are not 36 independent problems or a representative sample of Trafilea's
work. The study does not measure human collaboration, approval, failure recovery,
or specific Agent Mesh or Agent Morphogenesis capabilities. A system-level
difference does not causally identify the mechanism responsible for it.

## 2. Benchmark and external selection rule

Use all four tasks whose category is exactly `data-processing` in the frozen
Terminal-Bench 2.0 distribution. Do not adapt their instructions, inputs,
solutions, or verifiers. Do not filter by outcomes, convenience, or difficulty.

Inspection of 89 `task.toml` files in the official repository at commit
`2fd12b88aafdd04a52c298e3940bcb189f9766d6` found exactly these four IDs:

| Task                           | Work                                               | Agent timeout | Environment CPU / memory |
| ------------------------------ | -------------------------------------------------- | ------------: | ------------------------ |
| `multi-source-data-merger`     | Integration and conflict resolution across sources |         900 s | 1 CPU / 2048 MB          |
| `financial-document-processor` | Document classification and extraction             |        1200 s | 1 CPU / 4096 MB          |
| `log-summary-date-ranges`      | Event aggregation over date ranges                 |         900 s | 1 CPU / 2048 MB          |
| `regex-log`                    | Extraction using a regular expression              |         900 s | 1 CPU / 2048 MB          |

These values describe inspected metadata, **not a validated installation**.
The correspondence between this revision and the registered Terminal-Bench 2.0
distribution still requires confirmation. Record and resolve any discrepancy
before freezing the study; do not run `latest` or change tasks during the campaign.

Per-task metadata sources:
[integration](https://github.com/harbor-framework/terminal-bench-2/blob/2fd12b88aafdd04a52c298e3940bcb189f9766d6/multi-source-data-merger/task.toml),
[documents](https://github.com/harbor-framework/terminal-bench-2/blob/2fd12b88aafdd04a52c298e3940bcb189f9766d6/financial-document-processor/task.toml),
[events](https://github.com/harbor-framework/terminal-bench-2/blob/2fd12b88aafdd04a52c298e3940bcb189f9766d6/log-summary-date-ranges/task.toml),
[regex](https://github.com/harbor-framework/terminal-bench-2/blob/2fd12b88aafdd04a52c298e3940bcb189f9766d6/regex-log/task.toml).

Before execution, retain the distribution revision, complete category listing,
SHA-256 hashes of every file in the four tasks, and image digests. Metadata hashes
alone do not freeze a task.

## 3. Treatments: what each system means

| Arm             | Task execution engine        | Coordination                              | Agent limit             |
| --------------- | ---------------------------- | ----------------------------------------- | ----------------------- |
| A — individual  | Claude Code                  | One session; delegation disabled          | 1                       |
| B — native team | The same Claude Code version | Native Agent Teams                        | Coordinator + 2 workers |
| C — AgentPlat   | The same Claude Code version | AgentPlat Agent Room, tasks, and messages | Coordinator + 2 workers |

C proposes a new Room per run, with three agent participants and trial-isolated
local state. A transport bridge would connect Claude Code sessions to
`RoomService` and existing Room coordination contracts. The coordinator decides
how to divide the work; the two workers are generic. The bridge only translates
and delivers operations, preserves identities, and records outcomes: it does not
plan, write solution code, summarize through another model, or repair outputs.
The queue delivers tasks to explicit recipients; any automatic assignment or
wake-up policy must be specified before the protocol is frozen.

Proposed responsibilities in C:

- Claude Code retains its model loop and terminal/file tools.
- AgentPlat maintains participants, tasks, states, messages, and artifact
  references; deliverable files live in the task's official environment.
- A per-session bridge exposes coordination operations through typed tools.
  Access is bound to that session's identity and cannot create additional agents.
- Workers receive the original instruction and the coordinator's assignment.
  Message visibility, context assembly, and history limits are explicitly frozen;
  the experimental context selector is not included.
- In-memory state is exported at the end of this uninterrupted-execution study.
  This is not presented as evidence of persistence or recovery.

This evaluation adapter does not exist yet. Available integration points include
[RoomService](../../packages/rooms/src/service.ts),
[Room coordination](../../packages/rooms/src/coordination-runtime.ts), and the
[runtime contract](../../packages/runtime/README.md). Their existence does not
establish that Claude Code/Harbor integration is complete.

Using the same engine removes an important difference that would arise from
comparing Claude Code with a new Anthropic API loop. This remains a comparison
of complete systems: coordination prompts, coordination tools, and context
handling differ and form part of the treatment.

### Execution mode and evidence of team participation

The inspected [Agent Teams documentation](https://code.claude.com/docs/en/agent-teams)
requires interactive mode: `-p` does not create native teammates. A pseudoterminal
controller is therefore proposed for all three arms. No person will interact
during task resolution. The controller delivers the prompt, transports events,
and stops processes; it does not interpret the task or generate advice.

The pinned version must expose identities and sessions, creation of both
teammates, actual calls, and messages. Processes or a visual panel alone are
insufficient. Each worker must receive an assignment and emit at least one model
response; record separately whether it also invoked tools. Do not enforce an
equal contribution quota or invent a task-specific division of work.

Native delegation is disabled in A and C. B may create only its two teammates:
no nested teams, subagents, or replacements with new identities. Verify limits
through controls and traces, not instructions alone. If the selected version
cannot enforce them, preparation is blocked. A deviation during evaluation is
recorded as a compliance failure.

## 4. Shared model, tools, and environment

- Select and record one exact Claude model ID, API provider, and Claude Code
  version. Choose the model for availability and budget before evaluating the
  four tasks, not by inspecting their scores.
- Use the same reasoning effort where configurable, output limit, and cache
  policy. Check the effective model on every call; reject silent substitutions.
  Record settings that cannot be controlled.
- Use measurable API billing; do not assign zero cost to a subscription. Do not
  introduce different auxiliary models. Every auxiliary call contributes to cost
  and must follow the frozen model policy.
- Use the same base image and terminal/file tools. The only different extensions
  are those needed to coordinate each system. No inherited plugins, personal
  memories, skills, or global instructions are permitted.
- Evaluate one run at a time on the same host type. A team's three agents share
  the task's CPU, memory, and storage; they do not receive three times the resource
  budget. Include C's coordination process in the limit. Account separately for
  shared external instrumentation.
- Create fresh environments, Rooms, sessions, and configuration directories for
  every trial. Do not share learning, results, or histories across repetitions.
  Apply the same cache policy and record hits; a new directory does not prove a
  cold cache. The policy must prevent reuse of previous answers.

If three sessions cannot run within official resources, do not increase only
B/C's allocation. Report the incompatibility. A common resource change requires
a new protocol version and an explicitly adapted comparison.

### Separation of solving and evaluation

Harbor controls environments and verifiers. Use its
[custom agent interfaces](https://www.harborframework.com/docs/agents) for
transport; built-in Claude Code support does not establish Agent Teams support.

Agents see only instructions and inputs. Keep official solutions and tests out
of their processes and mounts, including during installation. At termination,
stop all agents, freeze deliverables, and run the verifier. Its result is not
returned to the agents and cannot be used to repair the solution.

Do not search for public benchmark answers. The inspected metadata permits
internet access: freeze a common network policy that permits required dependencies
and blocks access to the benchmark repository/solutions. Record that restriction
as a study-specific condition. If it prevents the official task from working,
resolve it before freezing; do not relax it for one arm. Prior model exposure to
the public benchmark remains a limitation that this isolation cannot eliminate.

## 5. Instructions and termination

Retain the original task text unchanged, followed by a fixed appendix for each
arm. The [proposed text](prompts.md) makes these appendices reviewable now; its
technical placeholders must be resolved before freezing the protocol.

| Arm | Appendix content, to be frozen literally before execution                                                                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------- |
| A   | Solve individually; do not delegate or create other agents                                                                    |
| B   | Create exactly two generic teammates through Agent Teams; freely decide the division and consolidate deliverables             |
| C   | Use exactly the Room's two workers; freely divide work through available coordination operations and consolidate deliverables |

Shared text states the aggregate time and budget, prohibits consulting solutions,
and explains the completion signal. It adds no specialized roles, algorithms,
business procedures, or verifier knowledge. Subsequent coordinator messages are
system decisions and remain in the traces.

Propose a common completion signal recorded by the controller: the final response
of A's sole agent or B/C's coordinator, with workers inactive. Do not interpret
silence as success. Preparation must demonstrate that the controller distinguishes
this signal from an intermediate turn or waiting for workers. If it cannot do so
without another model semantically interpreting the response, it is not ready.
Freeze the concrete adapter and stopping rule.

The clock starts when the instruction is delivered to the system, before creating
teammates or the Room. It ends when the whole system is stopped and files are
frozen. Coordination and treatment-specific startup count. Image preparation and
verification are measured separately. The deadline applies to the system, not to
each agent individually.

## 6. Design, ordering, and sample size

There are 36 runs: four tasks × three arms × three repetitions. Each block contains
all three arms for one task and repetition, in clean environment copies.

Fix seed `20260910` and publish the complete order before the first evaluation.
Use this algorithm to avoid depending on a particular random-number library:

1. For each task, sort A/B/C by the SHA-256 digest of UTF-8
   `20260910|arms|<task-id>|<arm>`; this is its base permutation.
2. In repetitions 1, 2, and 3, rotate that permutation left by 0, 1, and 2 places,
   respectively. Each arm occupies each position once within each task.
3. Sort the 12 blocks by SHA-256 of
   `20260910|blocks|<task-id>|<repetition>`. Break ties lexicographically by ID.
4. Retain this schedule in the manifest; do not reorder based on results.

Counterbalancing controls position, not every possible carryover effect.
Isolation removes shared local state; service and cache variation remain recorded
limitations. The seed does not make the model deterministic.

The future technical pilot consists of three separate runs, one per arm, on the
same preparation task outside the four-task set. It checks transport and
measurement and is excluded from evaluation results. Freeze that task's name and
hash before the pilot. Verifier checks using an official solution take place in
separate disposable environments.

## 7. Budget and usage control

| Item                                    | Calculation       | Proposed model-call ceiling |
| --------------------------------------- | ----------------- | --------------------------: |
| Evaluation                              | 36 × USD 5        |                     USD 180 |
| Technical preparation                   | 3 × USD 5         |                      USD 15 |
| Optional reserve for external incidents | Up to 3 × USD 5   |                      USD 15 |
| Total with reserve                      | Up to 42 attempts |                     USD 210 |

Without the reserve, the proposal is USD 195 with no additional replacement
allowance. Infrastructure and integration labor are budgeted separately. These
are proposed limits, not spending predictions or authorization. Further paid
preparation requires its own budget and is not counted as part of the original
three technical runs.

The USD 5 limit is shared across coordinator, workers, internal retries, and
auxiliary calls. Independent per-process limits are not a team limit. The same
external controller accounts for all three arms.

Control design: a common provider gateway records request IDs and usage and
atomically reserves a maximum cost before admitting a call. Settled spending plus
reservations must never exceed the available budget. When a call finishes,
reconcile its reservation with actual usage. Do not blindly release reservations
for requests with unknown outcomes. Cover input, output, cache writes/reads, and
any additional applicable charges. Do not alter content or treatment by arm.

Preparation must prove that all sessions, including native teammates, pass through
this control. If aggregate cost cannot be observed and bounded, do not claim a
strict budget. Record actual overruns; a correct result outside the limit is not
a success within budget.

Freeze prices and their date. Retain both cost calculated at frozen prices and
effective cost where it can be reconciled; explain discounts. Do not invent an
effective cost when only an estimate exists. Missing usage is incomplete
measurement and prevents cost conclusions; it is not zero.

### Provisional spending estimate, distinct from the budget ceiling

For planning, allow approximately **USD 80 in model calls for the complete
36-run evaluation plus three technical pilots**, with a provisional range of
**USD 50–120**. This is a judgment-based planning range, not a measured forecast,
confidence interval, or guarantee. Infrastructure, integration labor, and taxes
are excluded. No pilot or evaluated run has been performed.

The calculation uses Claude Sonnet 4.6 as a pricing reference, not as a frozen
model selection. Its published base rates are USD 3 per million input tokens and
USD 15 per million output tokens, checked on 2026-09-14:
[official model pricing](https://platform.claude.com/docs/en/models/sonnet-4-6/overview).
Recheck applicable rates and the exact model before freezing the study.

| Run type                           | Assumed aggregate input tokens | Assumed aggregate output tokens | Illustrative cost per run |
| ---------------------------------- | -----------------------------: | ------------------------------: | ------------------------: |
| Individual session (A)             |                        100,000 |                          20,000 |                  USD 0.60 |
| Complete three-agent team (B or C) |                        400,000 |                          60,000 |                  USD 2.10 |

Tokens above are summed across every call in a run and, for teams, across all
three participants. They are not context-window sizes, per-call allowances, or
observed consumption. The estimate applies the same assumptions to B and C; it
does not presume an AgentPlat cost advantage. Chargeable reasoning/output usage
must be included in the output total under the selected provider's accounting.

The simplified formula is
`cost_usd = input_tokens / 1_000_000 * 3 + output_tokens / 1_000_000 * 15`.
It prices all input at the base rate and does not model cache reads, cache-write
premiums, discounts, or additional charges. Actual consumption and caching can
move spending in either direction.

| Scope                                              | Calculation                  | Illustrative subtotal |
| -------------------------------------------------- | ---------------------------- | --------------------: |
| Full evaluation: 12 individual + 24 team runs      | `12 * 0.60 + 24 * 2.10`      |             USD 57.60 |
| Three technical pilots: 1 individual + 2 team runs | `0.60 + 2 * 2.10`            |              USD 4.80 |
| Full evaluation plus technical pilots              | `57.60 + 4.80`               |             USD 62.40 |
| Smaller 12-run evaluation plus technical pilots    | `4 * 0.60 + 8 * 2.10 + 4.80` |             USD 24.00 |

Rounding the full-study subtotal upward for greater consumption and incidents
gives the approximately USD 80 planning figure. For a smaller 12-run evaluation
plus three technical pilots, the corresponding provisional allowance is
**USD 25–40**. That smaller scope has only one repetition per task/system and
would require an explicit protocol amendment; this cost illustration does not
replace the planned 36-run study or introduce outcome-dependent stopping.

These numbers do not establish likely token use on the selected tasks. Long
debugging loops or repeated coordination can drive spending toward the existing
USD 195 ceiling, or USD 210 with the optional external-incident reserve. The
ceilings and aggregate enforcement requirements remain unchanged. Refine the
estimate using measured technical-pilot usage before freezing, without tuning
configuration against results from the four evaluated tasks.

## 8. Data for Federico's analysis

Publish tables with stable keys and traces of tools, messages, and state changes.
Private model reasoning and internal TrafiFlow data are not required. Harbor
provides [ATIF](https://www.harborframework.com/docs/agents/trajectory-format)
for normalized trajectories; also preserve native records and their session
links so conversions and usage totals can be audited.

| Proposed file    | Unit and minimum fields                                                                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `manifest.json`  | Study ID; versions; commits; hashes; model; configuration; budgets; resources; network; cache; schedule; exclusion rules                                              |
| `runs.csv`       | One row per attempt: slot, task, arm, repetition, order, start/end, status, official reward, within-limit success, mode compliance, cost, tokens, duration, incidents |
| `calls.jsonl`    | One row per request: trial, agent/session, request ID, timestamps, effective model, usage by category, cost, status, retry                                            |
| `events.jsonl`   | Events with per-sender sequence, timestamp, trial/agent, type, delegated task, correlation; distinguish creation, assignment, message, tool, completion, error        |
| `artifacts.json` | Paths, sizes, and hashes of frozen deliverables and traces; reward and complete verifier output                                                                       |
| `incidents.csv`  | Incident, evidence, classification, affected attempt, replacement, retained cost                                                                                      |
| `analysis.md`    | Per-task tables, differences, costs, limits, and decision; no selection of only the best attempts                                                                     |

Separate session IDs, actual requests, and streaming events: multiple response
fragments are not multiple billed calls. Preserve links to all child sessions
and detect missing logs. Record analyzer versions.

For process-mining analysis, reconstruct assignment, work, exchange, and
consolidation sequences; count calls, messages, tools, and worker activity.
Per-trial timelines and cost-versus-success plots can expose observed overhead.
Additional calls or messages alone do not establish duplicate work or causality.
Manual failure labeling is exploratory, with published criteria and original
records preserved.

## 9. Metrics, failures, and replacements

**Primary outcome:** complete success according to the official verifier, within
time and spending limits, with no model, tool, or team-size deviations. Store
official reward and eligible success separately; an agent's completion statement
is insufficient. A mode deviation during evaluation counts as zero and is
explicitly reported, even if the final file is correct.

**Secondary outcomes:** total cost including failures; cost per success; time to
frozen deliverables; tokens; actual participation. For comparative timing, primarily
show pairs where both arms succeeded within a block, including their count, plus
the complete distribution with timeouts. Failing quickly is not a speed advantage.

For each arm, `cost_per_success = sum(costs) / sum(successes)`; with zero successes,
report it as undefined and show total cost. Separately report primary spending
for the 36 slots and operational spending including externally failed attempts
and replacements, preparation, and infrastructure. Invalidating an attempt does
not remove its charge.

Frozen classification:

| Situation                                                                                                                        | Treatment                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Incorrect/incomplete solution, timeout, exhausted budget, team not formed, additional agent, or the system's own adapter failure | System failure; zero; no rescue rerun                                            |
| Verifiable external provider/host failure or verifier failure independent of the deliverable                                     | Retain attempt and incident; apply only the replacement rule below               |
| Required usage/cost/trace missing                                                                                                | Incomplete measurement; do not impute zero; the affected metric cannot be closed |

Proposed replacements: at most one per slot and three for the campaign, only if
the reserve was budgeted. Wait at least 60 seconds and confirm service availability,
then repeat in a new environment with identical configuration before the next
slot. If the incident persists, stop for diagnosis. Record both attempts; selection
must not depend on reward. If the incident is discovered later, pause and document
the deviation rather than inserting discretionary reruns. Once the reserve is
exhausted, report the study as incomplete.

All 36 slots remain visible in the table. Distinguish measured slots, system
failures, and slots without a valid measurement because of an external incident.
Do not claim the practical decision rules are satisfied while required slots or
cost measurements remain missing.

Do not change prompts or adapters after starting. A defect requiring correction
closes that campaign as interrupted; a new version receives a new ID, records
prior exposure, and preserves the previous data.

## 10. Prespecified analysis and decision

First show, for each task, A/B/C successes out of three, C−B difference, total
cost, cost per success, and timings with observation counts. Give each task equal
weight. The total is successes out of 12 per arm. Show losses even if C wins overall.
Do not treat 36 rows as independent observations to prove general superiority.
Do not interpret a tie as equivalence. Explain partial tests within each task;
do not average them as though they shared a common scale across tasks.

Retain Federico's practical rule: proceed to another study if C:

1. Achieves at least two more successes than B out of 12, improves on at least two
   tasks, and costs no more than 25% extra per success; or
2. Loses no successes on any task, achieves at least one success, and reduces
   overall cost per success by at least 20%.

If B has zero successes, its cost per success is undefined: success improvement
may motivate another evaluation, but the first rule's relative-cost condition
cannot be assessed. State that explicitly rather than claiming all criteria were
met. As a robustness check, show whether the cost decision changes when incident
spending is included; if it does, label the recommendation accounting-sensitive.

If A matches or exceeds both teams on every task and has lower cost per success
than both where those ratios exist, recommend starting individually within this
scope. If all fail or limits prevent useful outcomes, report inconclusive results.
If all succeed, quality is not distinguished, although cost/time remain comparable.
Do not make a general production recommendation.

## 11. Future preparation and exit criteria

Do not execute now. The [readiness checklist](readiness.md) identifies blockers.
The future sequence is: resolve integration without evaluated results; validate
environments/verifiers; perform three technical pilots; fix all variables; freeze
the manifest and schedule; execute the complete campaign; analyze and publish.

Initially timebox integration investigation to one working day as a proposed
management rule, not a guaranteed effort estimate. If native teamwork, resource
control, measurement, or termination cannot be demonstrated, deliver the technical
blocker. Do not replace B with subagents while retaining its name. A reduced A/C
study or a different execution engine requires another explicit protocol.

Using the inspected timeouts, the theoretical maximum agent time for the 36 slots
is `9 × (900 + 1200 + 900 + 900) = 35,100 s`, or 9 h 45 min when run sequentially.
This excludes preparation, verifiers, retries, and analysis; it is not a prediction
of actual duration. Do not promise results for a presentation date before readiness
is established.

Federico's deliverable will be the reviewed protocol, auditable data and traces,
a per-task table, and success/cost/time plots. Until results exist, an abstract
must describe the question and method prospectively without anticipating an advantage.

## 12. Decisions still open before freezing

Exact model ID and billable access; Claude Code/Harbor/AgentPlat versions; official
distribution and complete hashes; preparation task; verifiable automated interactive
mode; Room/session bridge; literal prompts; context visibility; completion signal;
resource and agent-limit enforcement; aggregate spending control; cache and network
policy; prices; approved model/infrastructure/labor budgets; trace storage; and
protocol review.

These variables remain explicitly pending: the design defines what must be checked
and frozen without presenting unimplemented compatibility or integrations as facts.

[Back to overview](README.md)
