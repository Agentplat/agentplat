# Decentralized collective transition plan V1

Status: reusable planning artifact. It defines prospective work and evidence
gates; it does not report measured performance, production readiness or a
commitment by any adopter.

## Purpose

This plan turns the provider-neutral open-source into an adoptable decentralized
collective capability over 36 months. It can be reused as the technical and
transition backbone of a commercial, research or public-sector proposal after
the proposer supplies dates, owners, labor rates, hosting choices, target use
cases and contractual terms.

The plan preserves four separations:

1. source implementation is distinct from empirical validation;
2. coordination evidence is distinct from execution authority;
3. reusable open-source is distinct from deployment-specific integration; and
4. software ownership is distinct from rights in input data, generated data,
   model services and operational evidence.

## Target outcomes

By month 36, a successful transition effort should be able to present evidence
for the following outcomes without asserting them in advance:

- a versioned, provider-neutral decentralized control stack with bounded local
  state and no mandatory global scheduler;
- deployable adapters for the selected identity, membership, persistence,
  transport, model, tool, checkpoint and effect-sink boundaries;
- repeatable comparison against an equivalently constrained centralized
  baseline;
- documented safety, liveness, Byzantine, collusion and statistical
  assumptions linked to machine-readable configuration;
- a staged adoption path from local conformance through shadow operation and
  bounded production use;
- signed, content-minimized operational evidence suitable for independent
  review; and
- a maintainable open-source and data-rights posture with an explicit path for
  contributions, upgrades and deployment-specific extensions.

## Scope boundary

### Included

- collective protocols, peer-local runtimes and provider-neutral adapters;
- durable state, checkpoint, recovery and effect-fencing integration;
- controlled role, strategy, team and agent evolution;
- semantic assessment, intervention and anytime control signals;
- interoperability, observability, reproducibility and supply-chain evidence;
- paired baseline evaluation and cost accounting; and
- adoption, training, operations and support artifacts.

### Excluded unless separately authorized

- acquisition of restricted datasets or model weights;
- operation in a production or safety-critical environment;
- certification under a named regulatory or assurance scheme;
- unbounded simulation or hosted-model spending;
- transfer of private keys, credentials, personal data or proprietary prompts;
- claims of global optimality, semantic truth or universal fault tolerance; and
- ownership conclusions that have not been reviewed against the applicable
  agreements and jurisdictions.

## Transition principles

1. **Evidence before expansion:** each deployment tier has an exit package and
   rollback path before the next tier begins.
2. **Bounded blast radius:** early adopters use observation-only or shadow mode;
   protected effects remain behind existing approvals and fences.
3. **Portable core, replaceable edges:** identity, storage, model, tool,
   transport and effect integrations remain explicit ports.
4. **No hidden subsidy:** model calls, human review, storage, egress, retries and
   failed runs are included in cost accounting.
5. **Reversible adoption:** every policy, schema and adapter change has a
   compatibility, migration and rollback decision.
6. **Content minimization:** durable control records prefer digests, counters,
   reason codes and approved references over prompts, private reasoning or raw
   model content.
7. **Claim discipline:** a source artifact, conformance result, scenario result
   and production observation are labeled as different evidence classes.

## Adoption profiles

The same work packages support three deployment profiles:

| Profile | Initial authority | Typical environment | Transition objective |
| --- | --- | --- | --- |
| evaluation | no external effects | deterministic local or isolated test environment | establish interoperability and falsifiable comparison |
| shadow | observe and recommend only | mirrored operational inputs with redacted or synthetic material | compare decisions, cost and recovery without controlling work |
| bounded operational | explicitly enumerated effects behind current approval and rollback controls | isolated tenant or low-consequence workflow | demonstrate maintainable operation within installed limits |

Movement between profiles is a gate decision. It is not implied by elapsed
calendar time.

## 36-month roadmap

Months are relative to contract or project start. Activities may overlap only
when their dependencies and review capacity permit it.

| Phase | Months | Main objective | Exit package |
| --- | ---: | --- | --- |
| P0 — mobilize and baseline | 0-3 | freeze scope, use cases, assumptions, baseline and evidence rules | charter, architecture baseline, rights inventory, cost ceiling and registered evaluation protocol |
| P1 — harden integration | 4-9 | close deployment adapters and end-to-end authority/effect boundaries | integrated reference deployment, migration/runbook drafts and source evidence bundle |
| P2 — resilience and recovery | 10-15 | complete bounded transport, durable agreement, catch-up, checkpoint and takeover paths | fault-model configuration, recovery evidence package and updated threat model |
| P3 — controlled adaptation | 16-21 | connect semantic feedback to role, strategy, team and agent changes | controlled-adaptation release, assumption register and rollback evidence |
| P4 — interoperability and scale readiness | 22-27 | qualify heterogeneous adapters, protocol compatibility and cost-bounded scale tiers | conformance matrix, capacity model, signed release candidate and operator training package |
| P5 — paired evaluation and shadow adoption | 28-33 | execute registered comparisons and shadow workflows under approved ceilings | paired reports, cost ledger, exceptions, adoption decision and remediation backlog |
| P6 — transition and sustainment | 34-36 | package bounded deployment, support, governance and future roadmap | transition release, operations handbook, rights schedule, support model and final evidence index |

## Work-package structure

Each work package is independently estimable. Deliverable identifiers are
stable proposal references; a project may add contractual document formats
without changing their technical meaning.

### WP0 — program control and evidence governance

**Period:** months 0-36

**Objective:** maintain scope, dependencies, claim discipline, decision logs and
an auditable index of source, evaluation, deployment and release evidence.

**Activities:**

- maintain the integrated schedule, dependency network and risk register;
- freeze evidence schemas, naming and retention classes;
- record assumptions, deviations, waivers and gate decisions;
- operate configuration and release change control; and
- track compute, model, storage, egress and human-review consumption.

**Deliverables:**

- `D0.1` project charter and responsibility matrix;
- `D0.2` integrated master schedule and dependency register;
- `D0.3` evidence-management and claim-classification plan;
- `D0.4` monthly cost/risk/change ledger; and
- `D0.5` final evidence index and unresolved-obligation register.

**Exit evidence:** every reported result resolves to an owner, versioned input,
source revision, configuration digest and evidence class.

### WP1 — formal model, architecture and threat boundaries

**Period:** months 0-6, refreshes at months 15, 27 and 36

**Objective:** make local rules, safety/liveness conditions, fault thresholds,
statistical assumptions and non-claims reviewable before implementation or
evaluation decisions.

**Activities:**

- tailor the decentralized control model to selected use cases;
- define trusted computing, identity, data and effect boundaries;
- register Byzantine, crash, partition and collusion assumptions;
- map safety properties to executable guards and deployment controls; and
- maintain traceability from hazards to requirements and evidence.

**Deliverables:**

- `D1.1` tailored system and adversary model;
- `D1.2` safety/liveness obligation matrix;
- `D1.3` architecture decision and interface baseline;
- `D1.4` threat, privacy and misuse model; and
- `D1.5` assumption-to-evidence traceability report.

**Dependencies:** WP0. **Exit evidence:** no high-consequence effect path lacks
an owner, current-authority check, failure disposition and rollback strategy.

### WP2 — durable decentralized substrate

**Period:** months 3-12

**Objective:** provide authenticated bounded transport, causal synchronization,
durable state, membership/key rotation and rollback-resistant control heads.

**Activities:**

- integrate selected network and database adapters;
- implement tenant/scope isolation, rate limits and queue backpressure;
- bind protocol records to membership epoch, sender instance, key and expiry;
- establish snapshot, migration, backup and restore boundaries; and
- connect catch-up readiness to bidding, agreement and execution eligibility.

**Deliverables:**

- `D2.1` authenticated transport and admission adapter set;
- `D2.2` transactional persistence and migration package;
- `D2.3` membership/key lifecycle integration;
- `D2.4` causal catch-up and readiness integration; and
- `D2.5` restore, rotation and rollback operations runbook.

**Dependencies:** WP1. **Exit evidence:** a restarted or newly admitted peer has
one documented path to current causal state and cannot act before readiness.

### WP3 — planning, allocation and effect authority

**Period:** months 4-15

**Objective:** connect decomposition, allocation, formation and execution so no
planning or model artifact can bypass current Work, budget and effect fences.

**Activities:**

- bind peer proposals and bids to authenticated protocol records;
- implement durable commitment/reveal phases, reservations and settlement;
- connect finalized allocation to team activation and current Work Contracts;
- implement prepare/apply/reconcile state for externally visible effects; and
- expose deterministic rejection and compensation paths.

**Deliverables:**

- `D3.1` distributed planning and allocation protocol integration;
- `D3.2` shared resource-reservation and settlement adapter;
- `D3.3` exact action-authorization manifest;
- `D3.4` idempotent fenced effect-sink reference integration; and
- `D3.5` crash reconciliation and compensation runbook.

**Dependencies:** WP2. **Exit evidence:** every protected effect maps to one
current assignment, final decision, semantic gate, budget coordinate and sink
idempotency record.

### WP4 — resilient agreement, trust and recovery

**Period:** months 7-18

**Objective:** supply the stateful agreement and evidence paths required by the
installed fault model, plus bounded checkpoint recovery after peer loss or
compromise.

**Activities:**

- preserve vote locks, rounds, equivocation evidence and reconfiguration state;
- derive committee eligibility from authoritative membership and unpredictable
  selection material where required;
- authenticate credibility observations and independence evidence;
- replicate and certify planning/execution checkpoints; and
- fence the prior assignee before restore, reauction or replanning.

**Deliverables:**

- `D4.1` fault-model and committee policy package;
- `D4.2` durable agreement and equivocation-response integration;
- `D4.3` authenticated credibility/collusion evidence adapter;
- `D4.4` replicated checkpoint and takeover integration; and
- `D4.5` compromise and quorum-loss response runbook.

**Dependencies:** WP2 and WP3. **Exit evidence:** each declared fault mode has a
bounded safe disposition even when progress is unavailable.

### WP5 — semantic assurance and controlled evolution

**Period:** months 10-23

**Objective:** couple measured semantic signals to enforceable horizon controls
and governed role, strategy, team and agent changes.

**Activities:**

- install assessor independence, calibration and missingness policies;
- maintain anytime-valid metric state and monotonic anchors;
- bind continue/shorten/replan/stop to actual protected execution;
- apply hysteresis, dwell time, change budgets and compensating rollback; and
- migrate or retire affected role and agent bindings without widening authority.

**Deliverables:**

- `D5.1` semantic metric and assumption registry;
- `D5.2` horizon-control integration;
- `D5.3` governed adaptation and rollback workflow;
- `D5.4` role/agent migration and revocation workflow; and
- `D5.5` alignment-agility reporting specification.

**Dependencies:** WP1, WP3 and WP4. **Exit evidence:** a semantic allow is bound
to the exact action and current policy, while uncertainty has an explicit
non-allow path.

### WP6 — heterogeneous interoperability

**Period:** months 9-24

**Objective:** permit selected model, tool, agent and environment implementations
to interoperate without granting provider output implicit authority.

**Activities:**

- implement capability and version handshakes;
- provide black-box, representation-aware and tool-interception adapters;
- bind checkpoint compatibility to adapter and implementation versions;
- publish language-neutral schemas and error taxonomies; and
- define deprecation, compatibility and migration windows.

**Deliverables:**

- `D6.1` interoperability profile and schema bundle;
- `D6.2` selected provider and tool adapters;
- `D6.3` checkpoint portability profile;
- `D6.4` compatibility/deprecation policy; and
- `D6.5` adopter integration kit with minimal reference applications.

**Dependencies:** WP2, WP3 and WP5. **Exit evidence:** each supported adapter
advertises enforceable bounds and fails explicitly on an incompatible surface.

### WP7 — measurement, baseline and reproducibility

**Period:** months 3-33

**Objective:** turn the scientific hypotheses into paired, independently
recomputable evidence without letting the runner set success or safety results.

**Activities:**

- freeze scenarios, paired seeds, baselines, strata, estimands and stopping
  rules before execution;
- account for all messages, observations, decisions, model calls and effects;
- separate deterministic conformance from stochastic evaluation;
- report missingness, exclusions and invalid-run reasons; and
- retain signed manifests, traces and aggregation inputs under approved rights.

**Deliverables:**

- `D7.1` registered paired-evaluation protocol;
- `D7.2` centralized baseline and fairness manifest;
- `D7.3` trace, accounting and independent-monitor package;
- `D7.4` reproducible aggregation package; and
- `D7.5` paired technical and cost comparison report.

**Dependencies:** WP0-WP6 as applicable. **Exit evidence:** every comparison can
be recomputed from retained permitted artifacts, and unsupported hypotheses are
reported as unresolved or contradicted.

### WP8 — security, privacy and supply chain

**Period:** months 0-36

**Objective:** produce deployment-appropriate assurance evidence while keeping
open-source and adopter responsibilities explicit.

**Activities:**

- threat modeling, secret scanning, dependency governance and vulnerability
  response;
- SBOM, provenance, release signing and reproducible build procedures;
- data classification, minimization, retention and deletion workflows;
- access control, key custody, incident response and audit retention; and
- independent review at frozen release and deployment gates.

**Deliverables:**

- `D8.1` security and privacy plan;
- `D8.2` SBOM, license inventory and signed provenance bundle;
- `D8.3` key, identity and access operations handbook;
- `D8.4` incident, vulnerability and disclosure process; and
- `D8.5` independent findings and remediation register.

**Dependencies:** all technical packages. **Exit evidence:** unresolved findings
are classified, owned and included in the deployment decision rather than
silently omitted.

### WP9 — adoption, operations and sustainment

**Period:** months 18-36

**Objective:** move from engineering ownership to adopter-operated capability
with bounded authority, observable service levels and a maintainable upgrade
path.

**Activities:**

- define evaluation, shadow and bounded-operational deployment topologies;
- prepare installation, configuration, monitoring and rollback procedures;
- train developers, operators, security reviewers and decision owners;
- establish support, triage, release and long-term maintenance processes; and
- execute the final go/no-go and backlog prioritization process.

**Deliverables:**

- `D9.1` deployment and operations handbook;
- `D9.2` role-based training and exercise package;
- `D9.3` shadow-operation and bounded-adoption plan;
- `D9.4` support, maintenance and upgrade model; and
- `D9.5` transition release and 24-month follow-on roadmap.

**Dependencies:** WP2-WP8. **Exit evidence:** the adopter can identify who may
change policy, membership, keys, adapters, effect authority and release state,
and can restore or disable the capability without its original developers.

## Work-package dependency map

```text
WP0 program/evidence governance
 ├── WP1 model and boundaries
 │    ├── WP2 durable substrate
 │    │    ├── WP3 planning/allocation/effects
 │    │    │    ├── WP4 agreement/trust/recovery
 │    │    │    └── WP5 semantic assurance/evolution
 │    │    └── WP6 interoperability
 │    └── WP7 baseline/evaluation
 ├── WP8 security/privacy/supply chain (cross-cutting)
 └── WP9 adoption/operations (consumes WP2-WP8)
```

## Milestone gates

| Gate | Target | Decision question | Minimum evidence class |
| --- | ---: | --- | --- |
| G1 architecture baseline | month 3 | Are scope, assumptions, baseline, rights and ceilings explicit? | reviewed documents and signed configuration manifests |
| G2 integrated substrate | month 9 | Can independently hosted peers authenticate, persist, recover and fail closed? | source receipts plus adapter conformance |
| G3 authority closure | month 15 | Is every protected effect bound to current authority, budget and idempotency? | executable invariant and crash-reconciliation evidence |
| G4 controlled adaptation | month 21 | Can feedback change behavior without widening authority or hiding uncertainty? | bounded scenario and rollback evidence |
| G5 release candidate | month 27 | Are selected adapters interoperable, supportable and inside cost/security limits? | signed release, SBOM, compatibility and operations package |
| G6 shadow adoption | month 33 | Do registered paired results and operational observations support expansion? | paired reports, cost ledger and exception register |
| G7 transition | month 36 | Can the adopter operate, update, disable and sustain the bounded capability? | final evidence index, training, support and rights schedules |

A gate may be delayed, narrowed or rejected. Calendar completion is not a
substitute for evidence.

## Compute and cost model

No fixed cost claim is made. Estimates should use adopter-supplied rates and a
versioned workload manifest.

### Cost equation

For period `p`:

```text
C_p = C_engineering
    + C_ci
    + C_simulation
    + C_model
    + C_database
    + C_object_storage
    + C_network_egress
    + C_observability
    + C_security_review
    + C_human_approval
    + C_support
    + C_contingency
```

Model and simulation cost must be derived from counted units rather than a
single blended estimate:

```text
C_model = sum(provider, model, region)
  input_units * rate_input
  + output_units * rate_output
  + cached_units * rate_cached
  + request_count * rate_request

C_simulation = cpu_seconds * rate_cpu
  + accelerator_seconds * rate_accelerator
  + peak_memory_time * rate_memory
  + persisted_bytes_time * rate_storage
  + transferred_bytes * rate_egress
```

### Required cost controls

- hard monthly, scenario, model and tenant ceilings;
- preflight estimation before high-scale or long-horizon runs;
- automatic stop at a declared spend or interaction boundary;
- separate accounting for retries, failures and invalid runs;
- approval for new providers, regions, accelerators or data-egress paths;
- retention and compaction budgets for traces, checkpoints and artifacts; and
- a reserve category that cannot be consumed without a recorded change.

### Build-versus-buy decision record

Every external service should be compared on portability, lock-in, key and data
custody, observability, failure semantics, egress, unit cost, support, licensing
and exit cost. Price alone is not a sufficient transition criterion.

## Risk register

Probability and impact are assigned by the project; this template intentionally
does not pre-score them.

| Risk | Leading indicator | Preventive control | Contingency/exit |
| --- | --- | --- | --- |
| authority bypass across package boundaries | action receipt lacks exact Work/fence/payload binding | executable pre-effect manifest and invariant guard | disable effect route; revert to observation-only mode |
| ambiguous external effect after timeout | no atomic sink receipt at retry | idempotent fenced sink and prepare/apply/reconcile saga | stop affected scope and reconcile manually |
| quorum or committee concentration | reduced independent groups or repeated round failure | membership governance, selection review and bounded rotation | safe stop or switch to approved stronger agreement profile |
| hidden collusion or Sybil admission | correlated evidence and unexplained synchronized behavior | provenance, challenge evidence and scoped limits | restrict authority; require independent re-admission |
| semantic estimator assumptions fail | missingness, drift or calibration evidence expires | assumption registry and conservative missingness policy | shorten horizon, replan or safe stop |
| uncontrolled adaptation churn | role/plan change rate exceeds budget | hysteresis, dwell time and change budgets | rollback certified predecessor and freeze adaptation |
| state rollback or partial restore | state and monotonic witness diverge | atomic persistence and independent anchor | refuse startup; restore complete protected backup |
| provider incompatibility or lock-in | unsupported control/checkpoint surface | portable handshake and capability profile | route to compatible adapter or reduce supported surface |
| cost escalation | unit consumption departs from workload manifest | hard ceilings and per-unit ledger | stop campaign, lower tier or change provider |
| sensitive-data retention | raw content appears in control or telemetry state | content-minimized schemas and scanning | quarantine artifact, rotate access and apply deletion process |
| open-source license incompatibility | dependency or contribution lacks approved provenance | automated inventory and contribution checks | replace component or isolate under reviewed terms |
| adoption ownership gap | no trained owner for policy, keys or incidents | role-based training and operational acceptance | retain shadow mode and extend transition support |

## Intellectual property and open-source strategy

This section is a planning framework, not legal advice.

### Layering

| Layer | Preferred treatment | Rationale |
| --- | --- | --- |
| provider-neutral protocols, contracts and reference runtimes | public open-source under the repository's declared license | supports interoperability, inspection and community maintenance |
| generic conformance fixtures and schemas | public where data rights permit | allows independent implementation and comparison |
| deployment configuration, identity policy and topology | adopter-controlled | may reveal architecture, keys, endpoints or operational constraints |
| proprietary provider adapters or workflow logic | separate optional modules with explicit interfaces | preserves portability and avoids contaminating the core rights boundary |
| evaluation datasets, model weights and prompts | governed by their source-specific terms | code licensing does not grant rights in these assets |
| operational telemetry and incident records | adopter-controlled with minimized content | may contain security, customer or regulated information |

### Required IP controls

- verify the declared license for every published package and generated
  distribution;
- maintain dependency licenses, notices, SBOM and source provenance;
- select and publish a contribution sign-off or contributor-agreement process;
- require contributors to identify generated code and third-party source where
  policy requires it;
- document ownership and maintenance of deployment-specific adapters;
- separate trademarks, service names and endorsement from software license;
- review patent and export considerations for cryptography, model artifacts and
  target jurisdictions; and
- retain a clean interface boundary so an adopter can replace a proprietary
  service without forking the protocol.

## Data-rights and retention matrix

Each deployment completes this matrix with owner, permitted use, residency,
retention, deletion, onward-transfer and publication fields.

| Data/artifact class | Default control posture | Must not be inferred |
| --- | --- | --- |
| open-source source and public schemas | governed by their declared repository licenses | rights in third-party data or hosted services |
| adopter configuration and policy | adopter-controlled; publish only by explicit decision | permission to disclose topology, thresholds or endpoints |
| input datasets and observations | source-specific agreement and classification | right to train, redistribute or publish |
| prompts, context and tool inputs | ephemeral by default; persist only an approved minimized form | right to retain private reasoning or credentials |
| model output and generated plans | terms of the selected model/data sources plus adopter policy | guaranteed copyright status, accuracy or exclusivity |
| checkpoints and state artifacts | encrypted, access-controlled and content-reviewed | portability across providers or permission to export |
| content-free receipts and telemetry | scoped retention with access and deletion controls | absence of sensitive metadata merely because payload text is omitted |
| evaluation traces and aggregate reports | retain raw permitted inputs for recomputation; publish only approved derivatives | right to expose proprietary baselines, incidents or participant identities |
| keys, tokens and credentials | never part of replicated or evaluation data; managed by custody systems | transferability under any software or data license |

Dataset and model-service changes require a new rights and reproducibility
review. A public source release does not require public release of adopter data,
and a private dataset does not justify making protocol behavior unverifiable.

## Security and deployment readiness

Before shadow or bounded operational adoption, the deployment package should
identify:

- authoritative membership, identity, key rotation and revocation sources;
- trusted logical time and independent rollback witnesses;
- transactional state, backup, restore and migration owners;
- transport authentication, ingress quotas and denial-of-service controls;
- exact effect sinks, approval paths and compensation limits;
- data classification, residency, retention and incident-reporting rules;
- telemetry consumers and minimum necessary access;
- vulnerability response, release signing and dependency-update process; and
- safe-disable behavior when a provider, quorum, model or database is
  unavailable.

Readiness for one environment does not transfer automatically to another.

## Adoption and sustainment model

### Roles to transition

- **product/use-case owner:** defines useful outcomes and acceptable safe-stop
  behavior;
- **collective policy owner:** controls membership, thresholds, budgets and
  adaptation ceilings;
- **platform operator:** owns transport, state, capacity, backups and upgrades;
- **security owner:** owns keys, access, incident and vulnerability response;
- **data steward:** owns input/output rights, retention and disclosure;
- **model/tool owner:** qualifies adapter behavior, cost and provider changes;
- **evaluation owner:** freezes baselines and protects comparison integrity; and
- **release maintainer:** owns source provenance, compatibility and support.

### Operational handoff sequence

1. developer-led local evaluation;
2. joint operator installation and failure exercises;
3. operator-led restore, rotation, rollback and safe-disable exercise;
4. time-bounded shadow operation with weekly exception review;
5. bounded authority for an enumerated workflow and effect class;
6. adopter-owned release and incident drill; and
7. documented support escalation and maintenance cadence.

Each step can return to the prior one without data or authority ambiguity.

## Proposal reuse checklist

Before incorporating this plan into a proposal, replace or complete:

- project start date, milestone dates and target deployment profile;
- selected use cases and explicitly excluded effects;
- named work-package and deliverable owners;
- staffing assumptions, loaded rates and external-service unit prices;
- target cloud, edge, database, model, network and key-custody providers;
- required security, privacy, accessibility and assurance frameworks;
- dataset, model, background-IP and generated-artifact rights schedules;
- acceptance margins, scenarios, paired baseline and evidence retention;
- support period, release cadence and long-term maintenance funding; and
- the process for changes that affect cost, rights, risk or scientific claims.

Do not delete the non-claims, unsuccessful-result reporting or baseline-fairness
language merely to shorten a proposal. Those clauses protect the credibility of
the resulting evidence.

## Deliverable acceptance template

Every contractual deliverable can use the following acceptance record:

```text
Deliverable ID and version:
Source revision and configuration digest:
Work-package owner and reviewer:
Required inputs and rights confirmed:
Scope completed:
Scope explicitly not completed:
Interfaces and compatibility profile:
Security/privacy review status:
Cost against authorized ceiling:
Evidence class (source/conformance/evaluation/deployment/release):
Reproduction or inspection instructions:
Known limitations and unresolved risks:
Rollback or replacement procedure:
Acceptance decision and date:
```

Acceptance confirms the stated artifact and evidence class only. It does not
upgrade source completion into empirical or operational proof.

## Traceability to the control model

| Control-model question | Primary work packages | Principal deliverables |
| --- | --- | --- |
| Are local rules and assumptions explicit? | WP1 | D1.1-D1.5 |
| Are safety and effect authority enforceable? | WP2, WP3, WP8 | D2.2, D3.3-D3.5, D8.5 |
| Are liveness limits and recovery paths bounded? | WP2, WP4 | D2.4-D2.5, D4.1-D4.5 |
| Are Byzantine and collusion assumptions installed rather than implied? | WP1, WP4 | D1.2, D4.1-D4.3 |
| Are semantic guarantees statistically qualified? | WP5, WP7 | D5.1-D5.5, D7.1-D7.5 |
| Is alignment balanced against useful agility? | WP5, WP7 | D5.3-D5.5, D7.5 |
| Is comparison with a centralized baseline falsifiable and fair? | WP7 | D7.1-D7.5 |
| Are compute and lifecycle costs visible? | WP0, WP7, WP9 | D0.4, D7.5, D9.4 |
| Are IP, open-source and data rights explicit? | WP0, WP8, WP9 | D0.5, D8.2, D9.4-D9.5 |
| Can an adopter operate and sustain the capability? | WP8, WP9 | D8.3-D8.5, D9.1-D9.5 |

The scientific rules and hypotheses referenced by this plan are defined in the
[decentralized collective control model](../collective-runtime/decentralized-control-model-v1.md).
