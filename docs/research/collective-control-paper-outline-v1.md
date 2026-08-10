# Collective control paper outline V1

Status: manuscript scaffold. Result-bearing language is prohibited until the
registered evidence exists.

## Working title

**Bounded Collective Control Under Partial Information: A Reproducible Paired
Evaluation of Decentralized and Centralized Agent Coordination**

The title is descriptive rather than promotional. It may change without
changing the preregistered experiment, provided the research questions,
endpoints and analysis do not change.

## Abstract skeleton

1. **Problem:** coordinating many autonomous agents under partial information,
   bounded communication and faults without converting planning evidence into
   execution authority.
2. **Approach:** a bounded-degree collective-control architecture with causal
   state, governed allocation, agreement, recovery and pre-effect invariants.
3. **Method:** a paired, blocked comparison against a fairness-constrained
   centralized planner across four scales and four fault strata.
4. **Results:** reserved until the signed registration is executed and the
   registered analysis completes.
5. **Limitations:** finite simulator ladder, recorded-response scope, declared
   fault families and no production-readiness claim.

No numerical result or superiority claim belongs in the abstract before the
evidence package closes.

## Research questions

| ID  | Question                                                                                                                       | Registered hypotheses                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| RQ1 | Does bounded-degree coordination remain within the registered sparse communication and state envelope as the collective grows? | H1                                        |
| RQ2 | Does the collective preserve useful progress under localized disruption without violating protected-effect safety?             | H2, H5                                    |
| RQ3 | How does recovery work scale with affected scopes, replicas and total collective size?                                         | H3                                        |
| RQ4 | What safety/utility tradeoff is introduced by semantic-horizon intervention?                                                   | H4                                        |
| RQ5 | Under the fairness contract, how do mission outcomes compare with a centralized planner?                                       | H2 and registered paired-success analysis |

## Candidate contributions

The paper may present the following as technical contributions, subject to
accurate citations to code and artifacts:

1. a provider-neutral collective-control architecture that separates evidence,
   planning, finality and execution authority;
2. bounded local coordination surfaces covering sparse discovery, causal
   recovery, allocation, agreement, adaptation and protected effects;
3. a fail-closed evaluation boundary with equal-information treatments,
   evaluator-owned hidden state and replay-derived accounting;
4. a source-attestation and scientific-preregistration chain binding code,
   hypotheses, analysis and results templates; and
5. empirical results only after completing the registered study.

The first four are design or reproducibility contributions. The fifth is not a
contribution until measurements exist.

The executable study package and its artifact topology are specified in
[Local empirical execution package V2](./local-empirical-execution-package-v2.md).
Its collection outputs should populate the planned tables without manual
transcription from logs.

## Methods structure

### System model

Define local peer state, bounded neighbor view, causal input, local transition,
effect fence and conditional safety/liveness assumptions. Cite the control
model instead of restating assumptions inconsistently.

### Treatments and fairness

Describe `adaptive_collective` and `centralized_planner`, their permitted
observations, shared decision-response tape, equivalent fault realization,
identical protected-effect boundary and interaction accounting.

### Experimental design

Report the 50/100/250/500-agent ladder, nominal/benign/adversarial/mixed strata,
paired seeds, exact replays, ceilings and fixed stopping rule. State that the
hidden evaluator never supplies terminal predicates or future faults to a
runner.

### Statistical analysis

Report Wilson lower bounds, paired bootstrap, Holm family, recovery p95, role
coherence and zero-tolerance safety endpoints exactly as preregistered. Do not
introduce post-hoc primary endpoints. Exploratory analyses must be labeled and
kept outside the confirmatory decision.

## Planned tables

| Table | Content                                                         | Availability      |
| ----- | --------------------------------------------------------------- | ----------------- |
| T1    | Architecture components, authority boundaries and assumptions   | Source-complete   |
| T2    | Treatment fairness and information-access matrix                | Source-complete   |
| T3    | Scale/stratum/seed design and interaction ceilings              | Preregistered     |
| T4    | Per-stratum success, intervals, missing and invalid samples     | Pending execution |
| T5    | Paired treatment deltas and multiplicity-adjusted decisions     | Pending execution |
| T6    | Recovery, communication, coherence, safe-stop and cost outcomes | Pending execution |
| T7    | Safety violations and exact-replay closure                      | Pending execution |

## Planned figures

| Figure | Intended visualization                                           | Claim limitation                            |
| ------ | ---------------------------------------------------------------- | ------------------------------------------- |
| F1     | Architecture and pre-effect authority flow                       | Design only                                 |
| F2     | Registered study topology, treatments and hidden monitor         | Methods only                                |
| F3     | Delivered interactions and retained state versus collective size | Finite-range evidence, not asymptotic proof |
| F4     | Paired mission-outcome differences by stratum                    | Registered samples only                     |
| F5     | Recovery distribution after disruption                           | Declared fault model only                   |
| F6     | Useful decisions, replanning and safe stops                      | Must show safety and utility together       |

## Results writing rules

- Report denominators before percentages.
- Report all missing, failed, invalid and cancelled samples.
- Present effect estimates and uncertainty, not only pass/fail decisions.
- Distinguish safe stop, mission failure and infrastructure invalidity.
- Do not select a successful rerun while hiding its failed predecessor.
- Keep confirmatory and exploratory analyses visibly separate.
- Use “observed under the registered conditions,” not universal language.

## Discussion and limitations

Discuss the architecture tradeoff rather than treating decentralization as
universally superior. Include simulator fidelity, recorded-response limitations,
baseline choice, finite scale, fault-family coverage, evaluator correctness,
implementation maturity and external validity. Negative or inconclusive
results should be used to identify where centralized coordination, stronger
global information or different quorum assumptions are preferable.

## Reproducibility statement skeleton

The final statement should identify the public source commit, release tag,
source-attestation bundle, scientific-registration digest, KMS public-key
fingerprint, exact registrations, result artifacts, analysis implementation
and any material that cannot be published with a reason.

## Metadata still requiring human decisions

- author list, order and contribution taxonomy;
- corresponding author and institutional affiliations;
- venue and formatting requirements;
- funding and conflict-of-interest statements;
- ethics/research-compliance determination;
- acknowledgements and third-party artifact citations; and
- archival repository/DOI for the final reproducibility package.
