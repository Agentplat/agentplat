# Completion audit - preparation objective

Date: 2026-09-19. The preceding goal turns made concrete progress: v0.2 added
the revised argument and boundary pilot; v0.3 added PostgreSQL integration;
v0.4 added the frozen four-condition evaluation and clean-checkout reproduction.

The objective is preparation of a publishable, evidence-bounded manuscript and
reproducible local artifact. It does not require public submission, DOI deposit,
production qualification, open-ended LLM superiority or repairing every research
limitation uncovered by the experiments.

| Requirement | Authoritative evidence inspected | Audit conclusion |
| --- | --- | --- |
| Precise V1/V2 contribution | Manuscript Sections 1, 3-6; core/V2 source mapping and capability table | Complete: transition composition and conditional properties are separated from inherited techniques and advanced extensions |
| Integrate Agent Room with bounded authority | Sections 1, 4.6, 6.1, Figures 1/3; Room projections, participation and approval adapters; v0.2 Room case and existing runtime tests | Complete at declared scope: persistence/approval integration, not an alternate authority plane or universal protocol dependency |
| Strengthen primary antecedents | Section 2, references.bib and source-register.md; JaCaMo/ParaMoise primary sections and versioned MorphAgent | Complete: positive mechanism comparison; no unsupported absence, priority or superiority claims |
| Reproducible critical-boundary evaluation | v0.2 pilot/manifest and verifier | Complete: eleven retained cases, including SIGKILL after owner receipt and strong stable-ID comparator |
| Real Team/Work and durable integration | v0.3 integration/race.json, expiry.json, drain.json and verifier | Complete at declared local scope: two approvals, real owner reducers/adapters, PostgreSQL, expiry and adapter draining; pending loser state explicitly retained |
| Pertinent four-condition comparison | Registration and all 1,536 v0.4 evaluation cases | Complete: capable fixed baseline, minimal ablation, actual durable workflow, actual Morphogenesis runtime; matched adaptive schedules/inputs and budgets |
| Pilot and pre-run freeze | Pilot data, pilot-decision.md, registration hashes and recorded timestamps | Complete: disjoint pilot/evaluation seeds, locally frozen before final execution, no held-out exclusions |
| Useful work and dependency correctness | Independent Python oracle, exact-arithmetic tests, analysis/scores.json | Complete for defined tasks: current versions, exact values and report dependencies checked independently of controller code |
| Costs and blocked progress | Query traces, role occupancy reconstruction, per-cell and paired summaries | Complete: role reservations, client SQL, logical blocking and elapsed time reported with their units and limitations |
| Claim/evidence matrix | evidence-matrix.md plus prior version matrices | Complete: every retained empirical claim has a source; deployment/LLM claims excluded |
| Manuscript and rendered PDF | manuscript.md; output/pdf/agent-morphogenesis-paper-v0.4.pdf | Complete: 15 pages, four figures, 12 references, corrected formulas, complete comparison table and page numbering; pages visually inspected |
| Portable artifact and reproduction | README commands, package.py full-entry checksums, reproduction/verification.json | Complete: code/lockfile install in a clean temporary checkout, required packages rebuilt, all verifiers passed and 1,536 cases rerun |
| Preserve prior evidence and work | Tracked git diff remains empty; v0.1 remains in place; v0.2/v0.3 artifacts and historical release paths retained; baseline/staging verifiers | Complete: new files are separate; historical results are not relabeled or pooled |

## Reproduction findings

The reference commit is publicly accessible on GitHub. A temporary checkout of
that commit received the artifact overlay and installed dependencies with the
frozen lockfile. Initial setup attempts exposed an old Node 20/Corepack shim and
missing offline pnpm metadata. The successful run used Node 24.20.0, pnpm 11.25.0
and normal online metadata lookup; the README now states the Node requirement.
All setup logs are retained under reproduction/.

Required dependencies were rebuilt without using the original workspace's dist
files. All 537 compiled modules common to the executed dependency closures had
identical hashes. All three retained evidence verifiers passed. The clean
checkout reran the full 1,536-case grid: every non-timing score, including SQL
counts, matched the primary run. That rerun is an installation/reproduction
check on the same host, not an independent laboratory sample; it is not pooled
with the paper's primary cohort.

## Checks

- 50 existing Morphogenesis/Collective Control tests passed in v0.3.
- 15 workflow runtime tests passed for the added durable baseline.
- Boundary and integration verifiers passed, including their prior negative tests.
- Mission raw verifier: 3 tests passed; independent oracle: 4 tests passed.
- Frozen source/input/lockfile bindings and executed module hashes matched.
- Frozen capability baseline and disabled staging registration checks passed.
- Temporary database containers were removed; no paid model calls were made.
- The archive builder validates every packaged file against its SHA-256 manifest.

## Explicit research limits, not hidden completion claims

The manuscript remains a systems preprint with local, partly synthetic evidence.
The mission workload is deterministic and its policy is supplied. It establishes
no LLM intelligence advantage, production reliability, monetary savings,
independent-host tolerance or unique recovery superiority. The losing V1 execution
remaining nonterminal after owner cleanup is a published finding, not a completed
automatic recovery feature. Formal refinement, broader workloads, an independent
replication, target-venue formatting and public publication are subsequent work.
