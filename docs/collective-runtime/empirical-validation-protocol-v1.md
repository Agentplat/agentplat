# Empirical validation protocol V1

Status: preregistered paper-oriented protocol. It authorizes no execution,
deployment, provider call or spend.

## 1. Research question and claim boundary

This protocol asks whether the AgentPlat collective control architecture has
measurable finite-range advantages over a fairly constrained centralized
planner when both receive equivalent partial observations, decision outputs,
resource limits and fault realizations.

The protocol does **not** presume an advantage. It is designed to distinguish:

- source-development closure, already represented by the signed capability
  attestation;
- deterministic conformance and replay;
- empirical outcomes under a declared simulator and fault model; and
- later operational evidence from a target deployment.

No result from this protocol establishes universal scalability, production
readiness, security certification or authority to perform protected effects.

## 2. Study design

The study is a paired, blocked simulation experiment. For each registered seed
and fault realization, run both treatments with the same public intent,
initial distribution, partial observations, decision-response tape, resource
budget, logical-time ceiling and protected-effect boundary:

| Treatment | Description |
| --- | --- |
| `adaptive_collective` | Bounded-degree peers exchange admitted evidence, construct and revise local planning fragments, allocate work, recover and enforce the installed effect boundary. |
| `centralized_planner` | One planner uses the same admitted observations and decision outputs, but must pay the same accounted boundary interactions and has no hidden-state or future-fault access. |

The hidden environment monitor owns terminal predicates, the full world state,
fault-injection state and canaries. It reveals no hidden information while a
sample is executing. The evaluator must remain a separate port from either
runner.

The authoritative runtime and trace requirements are in the [evaluation
contract V2](../adaptive-mission/evaluation-contract-v2.md); this document
freezes the scientific presentation and decision discipline for paper use.

## 3. Pre-registered hypotheses

The following hypotheses correspond to the falsifiable claims in the
[decentralized control model](./decentralized-control-model-v1.md). Each is
conditional on the registered simulator, topology, workload and fault model.

| ID | Hypothesis | Primary observation | Falsifier |
| --- | --- | --- | --- |
| H1 | With bounded local degree, collective communication and retained peer state grow below a complete-topology representation over the registered scale ladder. | Directed-edge, delivered-message and local-state ledgers at `N = 50, 100, 250, 500`. | A registered ladder point violates its sparse envelope or the accounting cannot be replayed. |
| H2 | Under localized benign disruption, unaffected scopes retain useful progress without unsafe effects. | Success, partial success, safe-stop and invariant outcomes. | An authority, stale-fence, duplicate-effect or evaluation-integrity violation; or the registered success criterion is not met. |
| H3 | Recovery cost follows affected scopes and required replicas more closely than total collective size. | Recovery/replanning interactions and time to a valid post-heal state. | Recovery exceeds the registered ceiling or the result is not reproducible. |
| H4 | The semantic-horizon gate trades unsafe effect attempts for safe stops or replanning rather than hiding risk. | Unsafe-effect count, safe-stop count, replan count and useful-decision rate. | Unsafe executable decision, or a metric is omitted/renamed after registration. |
| H5 | Agreement hardening prevents conflicting committed effects within its declared membership assumptions, while quorum loss produces explicit safe stops. | Finality, conflict, quorum-loss and monitor verdict records. | Any conflicting accepted commit or an unavailable quorum converted into an ordinary allow. |

H1--H5 are research hypotheses, not acceptance claims. Null, negative and
inconclusive outcomes are retained and reported.

## 4. Experimental factors and sample plan

The fixed normative ladder has four sizes and four strata. Seeds are paired
across treatments and exact replay runs are required for each selected sample.

| Factor | Registered values |
| --- | --- |
| Collective size | 50, 100, 250, 500 logical agents |
| Stratum | nominal, benign, adversarial, mixed |
| Topology | directed ring plus seed-derived unique neighbors; `N × ceil(log2(N))` directed edges |
| Paired seeds per stratum | 10 at 50/100/250; 30 at 500 |
| Executions per paired seed | collective, centralized, collective replay, centralized replay |
| Interaction ceilings | 1,000; 1,600; 3,000; 5,000 respectively |

The full design contains 240 paired seeds and 960 executions. The exact seed
list, source commit, package versions, fixtures, policy, environment, monitor,
fault schedule, endpoints, margins and stopping rule must be committed before
the first normative sample. Any change creates a new experiment ID; it cannot
be treated as a rerun or appended invisibly to the prior study.

## 5. Endpoints and analysis

Primary endpoints are mission success, protected-effect safety, exact replay,
recovery/replanning cost, semantic-slot agreement, role coherence and accounted
interactions. Every report must include numerators, denominators, invalid and
missing samples, raw per-seed measurements and trace/ledger digests.

The pre-registered analysis is:

1. no authorization, plan-authority, stale-fence, duplicate-effect,
   evaluation-integrity or replay violation is acceptable;
2. nominal and benign success use one-sided 95% Wilson lower bounds with
   thresholds `0.95` and `0.90` respectively;
3. paired collective-minus-baseline success uses 10,000 deterministic
   percentile-bootstrap resamples, a lower margin of `-0.05`, and the declared
   two-endpoint Holm procedure;
4. benign p95 recovery/replanning is the nearest-rank observation and must not
   exceed 250 accounted interactions;
5. role coherence uses exactly 1,000 evaluator-derived decisions, zero unsafe
   executable decisions and useful-decision rate at least `0.70`; and
6. incomplete closure, changed commitments, omitted cells or failed replay are
   reported as incomplete, not imputed or removed.

The implementation-level definitions and algorithms are fixed in the [Beta 3
campaign operations](../adaptive-mission/beta-3-statistical-campaign-operations.md).
This protocol does not introduce alternate endpoints or discretionary stopping.

## 6. Low-cost staged execution

No cloud service, hosted model or production adapter is necessary for the first
two stages. The recorded-response/simulator path must be used until a separate
budget and data-governance decision authorizes any provider-backed experiment.

| Stage | Purpose | Execution scope | Incremental infrastructure cost |
| --- | --- | --- | --- |
| 0 | Freeze protocol and evidence identity | This document, release attestation and exact source commitments | $0 |
| 1 | Local reproducibility pilot | One 50-agent nominal paired seed plus exact replays, run on an operator workstation | $0 |
| 2 | Local fault pilot | One 50-agent seed for each closed stratum, with all failures retained | $0 |
| 3 | Public diagnostic only | Bounded 50/100-agent diagnostic workflow using standard GitHub-hosted runners | $0 for a public repository using standard runners |
| 4 | Normative study | Full registered 240-pair/960-execution ladder with a registered adapter | Requires an explicit budget, environment and operator authorization |

Stages 1--3 are feasibility and reproducibility evidence, not a substitute for
the full normative study. Stage 4 must not start merely because a preceding
stage passes.

## 7. Cost, safety and stop rules

Before any stage executes, the operator records a hard monetary ceiling,
maximum wall-clock time, maximum storage, maximum artifact count and the exact
source/release identity. A zero budget means local recorded-response execution
only; it excludes paid model calls, cloud compute, managed databases and
egress-dependent workloads.

Terminate a sample, retain its evidence and classify it according to the
registered rules when it exceeds an interaction, queue, memory, event,
wall-clock or monetary ceiling; observes an invariant failure; loses required
quorum; or cannot reproduce its trace. A mission failure is not an
infrastructure-invalid run. A failed or cancelled run is never silently rerun
until successful.

## 8. Reproducibility package

For each study result, preserve or publish, subject to the registered redaction
policy:

- source commit, source-tree digest and release-attestation bundle;
- registration, campaign plan and deterministic seed set;
- runner, evaluator, environment, monitor, fixture and policy digests;
- topology and fault-matrix commitments;
- per-sample chained trace root, interaction ledger and terminal monitor
  verdict;
- exact replay result and first-divergence location when replay fails;
- analysis code version, aggregation seed and generated tables; and
- all exclusions, cancellations, invalidity records and cost-cap events.

Do not publish secrets, raw prompts, private reasoning, personal data or hidden
environment values. A digest alone is not a substitute for a documented
redaction rationale.

## 9. Threats to validity

The simulator may not represent real network, provider, operator or adversary
behavior. Recorded responses control variance but limit conclusions about live
models. The centralized baseline is intentionally fairness-constrained, so
results apply to that declared baseline rather than every centralized design.
Finite ladder measurements do not prove asymptotic behavior. Fault schedules
exercise registered families but cannot exhaust adversarial possibilities.

The paper must report these limitations prominently and must separate observed
results from architecture assumptions, local conformance and source evidence.

## 10. Paper-ready reporting outline

1. **Introduction:** bounded decentralized control problem and explicit claim
   boundary.
2. **System:** architecture, authority boundary and threat model.
3. **Methods:** this protocol, preregistration, treatments, fairness controls
   and independent monitor.
4. **Results:** per-stratum outcomes, confidence intervals, paired deltas,
   recovery, communication, coherence and all failed/invalid runs.
5. **Reproducibility:** release tag, source digest, evidence bundle, public
   key, registrations and artifact availability.
6. **Limitations and ethics:** simulator scope, model/provider scope,
   data handling, cost limits and non-production claim boundary.

No abstract, conclusion or figure may claim a result until the corresponding
registered evidence exists.

## 11. Executable preregistration

The repository provides a planning-only command that wraps the existing
normative operation plan and binds it to this protocol. It writes all artifacts
outside the checkout and always records `executionPermitted: false`:

```sh
pnpm run evidence:empirical-preregistration:plan -- \
  --campaign-id paper-study-v1 \
  --source-sha COMMIT_SHA \
  --output-directory /absolute/external/preregistration
```

The resulting `scientific-registration.json` can be signed with the managed
release KMS identity. The signing action does not execute a campaign:

```sh
pnpm run evidence:empirical-preregistration:attest -- \
  --registration /absolute/external/preregistration/scientific-registration.json \
  --output /absolute/external/preregistration/scientific-registration-attestation.json \
  --issuer-id agentplat-release \
  --kms-key-id alias/agentplat-release-attestation-v1 \
  --aws-profile grishen \
  --aws-region us-east-1
```

An external reviewer verifies the signature with the published PEM key and can
then create a results skeleton whose initial state is `not_executed` and whose
empirical claim permission is false:

```sh
pnpm run verify:empirical-preregistration -- \
  --attestation /absolute/external/preregistration/scientific-registration-attestation.json \
  --issuer-id agentplat-release \
  --key-id CANONICAL_KMS_KEY_ARN \
  --public-key /trusted/agentplat-release-ed25519-public.pem

pnpm run evidence:empirical-results-template -- \
  --attestation /absolute/external/preregistration/scientific-registration-attestation.json \
  --output /absolute/external/preregistration/results-template.json \
  --issuer-id agentplat-release \
  --key-id CANONICAL_KMS_KEY_ARN \
  --public-key /trusted/agentplat-release-ed25519-public.pem
```

The CLI intentionally has no experiment execution mode.

## 12. Paper preparation records

The [research package index](../research/README.md) links a manuscript outline,
data dictionary and pre-results decision ledger. Those documents preserve
paper-relevant context that is not appropriate inside the executable protocol,
including planned figures/tables, wording constraints, endpoint semantics,
authorship placeholders and threats-to-validity prompts.
