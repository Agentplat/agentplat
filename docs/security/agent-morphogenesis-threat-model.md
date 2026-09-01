# Agent Morphogenesis V1/V2 threat model

Status: source implementation threat model. Tests exercise the listed local
controls; operational effectiveness remains outside source evidence.

## Assets

Agent Morphogenesis protects:

- tenant, Mesh, Room, mission, Objective and Work scope bindings;
- authenticated morphology source heads and freshness;
- current and target morphology digests and epochs;
- exact need, proposal, operator graph and decision bindings;
- instantiation-profile provenance and certification;
- population, descendant, resource, token, time and cost reservations;
- stable Workflow, task and subsystem operation identities;
- membership, Team, Work, role, authority and fencing currentness;
- lifecycle, compensation, lineage and termination receipts; and
- the accepted morphology head, predecessor chain and evidence record.

Raw prompts, hidden reasoning, credentials, private keys, unrestricted memory,
full model output and large artifacts are excluded from Morphogenesis control
state. They remain behind their owning content-addressed or ephemeral ports.

## Trust boundaries

- authenticated source systems to `MorphologyObservationPortV1`;
- strategy implementations to bounded need, target and proposal validators;
- proposal to policy-selected decision gate;
- Workflow gate outcome to exact decision verification;
- Morphogenesis process tasks to existing lifecycle, membership, Team, Work,
  role and action boundaries;
- instantiation profile to certification and governed factory;
- Workflow Task Run to external idempotent/fenced subsystem operation;
- current morphology to `MorphologyHeadStoreV1` CAS and rollback witness;
- Agent Room and Agent Mesh projections to their explicit application sinks;
- delayed outcomes to evaluation and future strategy evidence; and
- PostgreSQL or Temporal adapters to authoritative AgentPlat state.

## Threats and controls

| Threat | Control |
| --- | --- |
| Model output or strategy proposal is treated as authority | Need, target and proposal are inert validated data; an exact current decision and every downstream authority boundary remain required. |
| Agent approves without a decision mandate | Authorized-agent adapter verifies current scope, operator, risk, budget, issuer and expiry bindings; membership, role, Trust or capability alone is insufficient. |
| Agent approves its own creation, promotion or authority expansion | Policy-enforced proposer/decider separation and prohibited-interest rules fail closed; sensitive routes require independent or composite decision. |
| Proposer, assessor and decider collude | Policy can require independent identity groups, trusted evidence and collective/person review; retained identities make the dependency auditable. No universal collusion resistance is claimed. |
| Room approval or Workflow gate outcome becomes execution authority | Gate outcome only selects a branch; `verify_decision` resolves the exact proposal-bound decision before prepare. Normal Work/action/lifecycle authority remains required. |
| Stale or substituted proposal is enacted | Decision binds current morphology, target, policy, budget, subsystem epochs and validity; use-time currentness is rechecked before every protected stage. |
| Two concurrent proposals create different successors | `MorphologyHeadStoreV1` revision-and-digest CAS accepts at most one successor for the expected epoch; loser reloads and cannot merge automatically. |
| Snapshot pretends to be globally complete | Snapshot declares bounded source heads, local view and required freshness; absence is never encoded as global non-existence. |
| Stale, missing or equivocal source evidence is used | Source registry authentication, revision high-water marks, record digests, expiry and policy-required source classes fail closed. |
| Partition creates conflicting births or retirements | Membership and morphology currentness, quorum/certification requirements and CAS heads reject conflicting successors; unavailable required state pauses rather than forks. |
| Recursive spawn exhausts population or budget | V1 excludes derivation/synthesis. V2 requires explicit derived/synthesized/recursive capability flags and independently limits creation depth, population, descendants, concurrency, churn and reserved resources before provisioning. |
| Synthesizer certifies its own profile or widens parent authority | Synthesis requires a distinct independent certifier; parent lineage, capability additions, tool/action removals, budgets and child authority ceiling are bound by evolution and attenuation receipts. |
| Factory material substitutes a verified evolved profile | V2 material binding covers operation, scope, proposal, profile, creation request and certificate; the host compares role, capabilities, rules, authority and budgets before factory invocation. |
| Advanced plan swaps an effect between steps | Every step binds plan, proposal, boundary, target and stable operation ID; attestation and Team activation consume exact predecessor result digests. |
| Caller supplies arbitrary decision or authorization digests to the low-level operator journal | The governed V2 entry point reconstructs the compiled plan from the exact proposal operation and policy, validates an approved agent/person/quorum decision, then requires a separately bound execution authorization and authority fence. The lower runtime is a journal primitive, not an admission API. |
| Team split loses or duplicates a member | Split partitions the source member set exactly once; merge preserves the complete source union; federation preserves source Teams and adds one complete federation node. Unaffected Teams must remain byte-identical by digest. |
| Suspension leaves stale Work authority usable | Checkpoint and Work/action fence precede certified Membership exclusion; lineage changes only after the membership successor exists. |
| Resume admits a substituted identity | Resume requires a fresh active-key proof and the same peer, instance and public-key material; Membership epoch/digest must be a certified successor before lineage becomes active. |
| Mission Lifecycle silently treats ordinary Team adaptation as general Morphogenesis | `request_morphogenesis` is an explicit opt-in extension with its own request digest and durable action; `request_team_adaptation` retains its prior meaning. |
| Interop request manufactures Morphogenesis authority | `morphogenesis.enact` requires an exact stateful admission grant and pre-authorized Mission/Morphogenesis digests; Interop transports the outcome but cannot issue a decision, authorization, fence or morphology commit. |
| Operator or outcome store is rolled back | Execution and outcome records validate their content digest, revision/logical time and external rollback witness; divergent reopen fails closed. |
| Compensation repeats an external rollback after acknowledgement loss | A separate execution-bound compensation journal prepares each reverse-order operation before invocation; reconciliation uses the same operation ID and the owning subsystem's retained rollback evidence. Ambiguity becomes `indeterminate`. |
| A completed successor is falsely treated as a pre-commit rollback | Compensation initialization rejects a completed operator execution; post-commit problems require a successor recovery transition. |
| Concurrent proposals double-spend resources | Application-owned budget reservation is proposal-, epoch-, operation- and expiry-bound with CAS/idempotency; downstream subsystem budgets recheck independently. |
| Instantiation profile injects prompts or widens tools/memory | Profile is content-addressed, provenance-bound and independently certified; instruction/tool/memory content remains referenced; attenuation and context-integrity checks reject expansion or hostile content. |
| Artifact or profile changes after approval | Decision and factory compilation bind exact artifact/profile digests; unresolved, revoked or substituted content fails closed. |
| False capability self-attestation admits a new agent | Capability claims are not evidence; independent assessment, runtime attestation, Trust/Inference Control eligibility and Team candidate validation are required. |
| Factory receipt is used as membership or Work authority | Receipt proves material creation only; governed membership enrollment, Team activation and individual Work Contracts remain separate mandatory steps. |
| Factory succeeds and local acknowledgement is lost | Existing factory and Workflow task retain stable but distinct operation identities; retry reconciles the original receipt and never provisions a duplicate. |
| Orphan instance remains after failed enrollment | Prepared compensation resolves the factory operation, fences materialization and requests governed termination; indeterminate cleanup remains visible and blocks success. |
| Workflow retry duplicates an external effect | Protected task uses stable task identity plus the subsystem operation ID; the downstream port must be idempotent/fenced and ambiguous commit remains `indeterminate`. |
| Temporal history or wakeup reconstructs state | AgentPlat Workflow and morphology stores remain authoritative; Temporal supplies wakeups only and cannot derive a decision, head or receipt. |
| Workflow task handler is substituted | Task definition and execution binding retain handler, policy, tool, runtime and action digests; changed binding conflicts rather than retries. |
| Successor activates before readiness | Activation requires policy-declared attestation, membership, Team, Work, budget and decision receipt set plus current morphology-head CAS. |
| Old agent continues work after replacement | New assignment stops before drain; predecessor Work leases, action grants and fences expire or revoke; stale progress/effects fail at owning boundaries. |
| Retirement terminates resources before preserving work/evidence | Ordered DAG checkpoints permitted work, preserves artifacts, fences authority and retires membership before governed termination. |
| Checkpoint transfers memory or authority too broadly | Only content-addressed permitted artifacts/checkpoints transfer; destination scope, lineage, adapter compatibility and authority are revalidated. |
| Compensation pretends to undo committed activation | Activation is the commit point; post-commit failure produces an explicit successor recovery transition, never an atomic rollback claim. |
| Create/retire oscillation consumes resources | Cooldown, hysteresis, minimum evidence, maximum transformations per window and churn counters bound repeated changes. |
| Outcome manipulation silently widens autonomy | Outcomes bind exact Task Runs and declared measures; missing/stale coverage cannot count as success; outcome evidence never changes operator or authority policy directly. |
| Cross-tenant or cross-mission replay | Every artifact, decision, run, task, reservation and receipt binds exact tenant and mission scope; optional Mesh/Room/Objective/Work bindings must agree. |
| Credentials, prompts or hidden reasoning enter control state | Closed validators accept bounded identifiers, counters, enums, references and digests only; recursive redaction tests cover events and receipts. |
| Rollback of Workflow or morphology store reopens an operation | Revision/digest CAS, predecessor lineage, logical-time high-water and external monotonic heads reject rollback; operation tombstones prevent replay after compaction. |
| Compromised decision issuer remains trusted forever | Decisions have bounded validity and current mandate/policy checks; revocation or epoch advancement prevents new use. Previously committed effects require explicit recovery. |

## Safety invariants

1. A proposal, gate, profile, capability claim, factory receipt or outcome never
   grants membership, Work or action authority.
2. One accepted morphology epoch has at most one successor.
3. A child or created agent receives no automatic authority inheritance and
   cannot exceed current ceilings.
4. No protected stage runs without the exact current decision, reservation,
   authority and subsystem prerequisites declared by policy.
5. Required stale, missing, rolled-back, conflicting or unavailable evidence
   fails closed.
6. Work/action authority is fenced and evidence is preserved before external
   resource termination.
7. Workflow and subsystem operation identities are deterministic and related,
   but one never substitutes for the other.
8. Post-commit recovery is a successor transition, not an unsupported atomic
   rollback.
9. Control state remains bounded and content-minimized.
10. Source behavior and tests are not evidence of production improvement.

## Assumptions and residual risk

- Cryptographic digests, trusted clocks, key custody, authenticated ingress and
  configured issuers behave according to their declared trust boundary.
- External providers honor idempotency or fencing where exactly-once effects
  matter. Otherwise an ambiguous result can remain indeterminate.
- Sparse local discovery cannot prove global candidate absence or global
  optimality.
- Byzantine or colluding majorities, compromised human accounts and malicious
  provider infrastructure remain deployment risks beyond local source
  guarantees.
- Network partitions can reduce liveness because required currentness fails
  closed.
- Terminated external resources may be irreversible; recovery creates a new
  successor rather than recreating unrecorded state.
- Production safety, organizational fitness, latency, cost and scale require
  separate operational and empirical evidence.

## Required adversarial scenarios

- unauthorized or self-interested agent approval;
- stale approval after morphology, membership, policy or budget advancement;
- colluding proposer/assessor/decider identities;
- recursive creation and cross-proposal budget exhaustion;
- self-certified synthesis, parent-authority widening and evolved-profile material substitution;
- profile prompt injection, tool escalation and memory-scope expansion;
- false capability self-attestation and forged runtime attestation;
- factory success followed by timeout and conflicting retry;
- membership partition during enrollment or retirement;
- two proposals racing for one morphology epoch;
- Workflow gate approval without an exact decision binding;
- task-handler, artifact or profile substitution after approval;
- crash at every protected task and compensation boundary;
- compensation acknowledgement loss, reverse-order replay and indeterminate rollback;
- stale agent progress/effect after successor activation;
- termination requested before Work/action fencing;
- create/retire oscillation and churn-bound exhaustion;
- split member loss/duplication, invalid merge union and federation source replacement;
- crash after suspension/removal or resumption/readmission but before lineage commit;
- Mission action, Interop admission or advanced-step substitution;
- delayed or manipulated outcome evidence; and
- credential, raw prompt, raw output or hidden-reasoning persistence attempts.
