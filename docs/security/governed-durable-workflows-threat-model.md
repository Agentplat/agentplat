# Governed Durable Workflows V1 threat model

Status: implemented source/conformance baseline. Deployment assumptions and
residual risks remain non-guarantees.

## Protected assets

- exact process definition and run lineage;
- tenant, subject and Room isolation;
- current run revision and terminality;
- signal, operation, task and outcome idempotency identities;
- task inputs, execution bindings, usage and result references;
- gate target, artifact version and human decision provenance;
- cancellation and compensation state;
- autonomy policy, evidence cursor, level and decision journal;
- current Action Grant, authority, budget and downstream fence; and
- audit and transition-chain integrity.

## Trust boundaries

- application to `ProcessRunnerV1` mutation ingress;
- runner to task executor and downstream effect sink;
- runner/store to PostgreSQL;
- Agent Room operational stream to workflow gate projector;
- workflow store to Temporal client, worker and activity;
- outcome producer to outcome append port;
- outcome evidence to autonomy controller;
- autonomy supervision guard to Action Gateway composition; and
- operator/audit readers to retained diagnostic data.

IDs, source labels, model output, external task state, Temporal history,
outcomes, scores and Room projections are data. None is authority unless an
authenticated, current policy boundary resolves and validates the exact source.

## Assumptions

- hosts authenticate callers and bind them to tenant and permitted operations;
- PostgreSQL provides transactional constraints and a trusted database clock;
- durable deployments protect database credentials, backups and migration
  authority;
- task executors truthfully distinguish provably pre-dispatch failures from
  possibly committed effects;
- downstream sinks that claim exactly-once behavior atomically enforce the
  supplied idempotency key or fence;
- Room approval resolvers authenticate human participants and their permission;
- outcome producers are admitted by deployment policy;
- canonical digest primitives are collision resistant for the deployment
  threat horizon; and
- trusted logical time does not move backwards.

## Threats and required controls

| Threat                                           | Required control                                                                             | Negative evidence                                                 |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| cross-tenant run, signal, gate or outcome access | tenant in every key, lookup and digest; authorization before store call                      | same IDs under two tenants and cross-scope mutation attempts      |
| definition substitution after start              | immutable version plus definition digest in every run                                        | overwrite/re-register conflicting bytes                           |
| DAG cycle or unreachable trap                    | closed validation and bounded reachability analysis                                          | direct, indirect and compensation cycles                          |
| duplicate or conflicting mutation                | scoped idempotency identity plus canonical request digest                                    | exact replay and changed-body replay                              |
| signal spoofing                                  | authenticated ingress, admitted source policy and exact source binding                       | forged source label, wrong correlation and late stale revision    |
| signal loss after commit                         | append before wakeup; ready-run recovery and projector checkpoint                            | committed signal with dropped Temporal notification               |
| signal replay advances twice                     | append-only unique identity and single-consumption record                                    | duplicate wakeup and projector replay                             |
| stale worker overwrites state                    | revision, predecessor digest and lease fence CAS                                             | old revision/lease settlement after takeover                      |
| task retry repeats an external effect            | stable identity, retained indeterminate state and downstream atomic enforcement              | crash before/after downstream commit and lost response            |
| task hides an effect behind an internal posture  | host registration policy, declared protected-external class and sandbox/credential isolation | protected handler registered as internal                          |
| false exactly-once claim                         | explicit conditional guarantee and conformance case that exposes indeterminate state         | non-idempotent fake sink under retry                              |
| cancellation races a task claim                  | atomic cancel transition, no new normal claims and lease/authority recheck                   | cancel before claim, after claim and before settlement            |
| compensation runs twice or out of order          | separate stable identity and reverse-topological scheduling                                  | duplicate cancel, restart and partial compensation failure        |
| gate expires into approval                       | separate expired outcome and revision-checked first terminal winner                          | adversarial timeout/approval interleavings                        |
| wrong artifact version is approved               | approval and gate bind target version; current-version check                                 | edit after request and stale approval event                       |
| Room event projection grants authority           | projector emits only a bound workflow signal; action authority remains separate              | forged/duplicate event without current approval record            |
| Temporal history becomes authoritative           | history contains wakeup coordinates only; activity resolves PostgreSQL state                 | mutated/replayed workflow signal without stored signal            |
| Temporal retry changes action identity           | deterministic operation/task identity retained outside Temporal                              | activity retry and `continueAsNew` rollover                       |
| usage or cost overflow                           | non-negative safe integers, currency partition and checked addition                          | maximum boundary and mixed currency aggregation                   |
| delayed outcome binds a new model/prompt         | immutable execution binding digest checked on append                                         | outcome with correct task ID but substituted binding              |
| outcome producer poisons evidence                | admitted producers, provenance, bounded influence and minimum independent coverage           | unknown producer, duplicate outcome and oversized score influence |
| favorable-outcome cherry picking                 | expected coverage, unresolved denominator and stale/missing detection                        | positives arrive while expected negatives remain absent           |
| critical reason injection                        | exact policy-configured reason set and authorized producer                                   | caller-supplied critical label outside policy set                 |
| retry evades sampled approval                    | deterministic sample from action/policy/segment/epoch digests                                | repeated same action across retries                               |
| autonomy store outage widens access              | deny by default; current trusted cache may only preserve/narrow                              | outage from every level including blocked                         |
| stale autonomy policy keeps executing            | exact policy digest, expiry, cursor and current decision check at action time                | policy replacement after decision                                 |
| approval treated as an Action Grant              | explicit separate bindings and normal gateway verification after approval                    | valid approval with missing/stale grant or fence                  |
| unbounded history exhausts memory/storage        | policy limits, bounded tails and retention that preserves live anchors                       | maximum signals, stages, outcomes and journal entries             |
| sensitive payload leaks through audit            | content-bounded references/digests and redaction policy                                      | canary prompt, credential and payload checks                      |
| domain coupling enters platform packages         | dependency/layer verifier and scoped caller denylist                                         | fixture importing an app or configured domain term                |

## Fail-closed rules

- Unknown or malformed durable state is unusable; it is not repaired from a
  transport history.
- A missing definition, current revision, lease, approval, policy, evidence
  window, authority decision, grant or fence denies the affected transition.
- A gate with no provable approval takes the expiry/rejection path defined by
  the process; it cannot take the approval path.
- A possibly committed effect is `indeterminate`, not automatically failed and
  retried with a new identity.
- Missing outcomes freeze promotion and may trigger policy-configured
  degradation.
- An unavailable autonomy controller denies protected execution unless a
  current trusted cached result can only retain or reduce autonomy.
- Observer, notification and audit-delivery failure cannot reverse an already
  committed transition, but durable outbox backlog remains visible and bounded.

## Residual risks and non-guarantees

- A malicious authorized task handler can misuse the authority it receives.
- A downstream service that ignores idempotency/fencing can duplicate an effect.
- A malicious or colluding set of authorized outcome producers can bias
  supervision evidence.
- A compromised database administrator can alter mutable state unless a
  deployment adds independently protected audit anchors.
- Wall-clock and network failures can delay waits, approvals and outcomes;
  safety does not establish liveness.
- Redacted digests can still reveal equality and timing relationships.
- A passing conformance suite does not prove absence of implementation-specific
  vulnerabilities or validate production performance.

These risks require deployment controls, operational monitoring and empirical
validation. They are not resolved by source contracts alone.
