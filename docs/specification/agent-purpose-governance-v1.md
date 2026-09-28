# Agent purpose governance V1

Status: specified; objectives 2–8 are implemented in source, including the qualified Room purpose
mission profile and bounded [continuity composition](../agent-governance/continuity.md). Standalone purpose execution remains blocked. MUST and SHOULD describe acceptance
requirements for this future opt-in profile, not guarantees of AgentPlat 1.0.0.
`AgentInteractionBindingV1` is now a source export of `@agentplat/rooms` under
the optional definition field `interaction`. The configuration service uses `AgentGovernanceConfigurationV1` within immutable
`AgentGovernanceOperationV1.result` snapshots for revision history, and exports
`AgentGovernanceHeadV1`. `AgentInceptionV1` and `InceptionAssessmentV1` are now
source exports with the bounded behavior described in [inception usage](../agent-governance/inceptions.md).
Signal definitions/references are immutable `AttentionSignalCatalogV1` records;
`AttentionObservationV1` and `AttentionEvaluationWakeupV1` implement the bounded
[signal profile](../agent-governance/signals.md). Other domain names below remain
proposed contracts. [Instruction execution controls](../agent-governance/execution.md)
now implement staged activation, immutable pending-work bindings, limits and budget
reservation. The [purpose mission profile](../agent-governance/missions.md)
now composes those controls with scoped issuance, deliberation and outcome review. This source increment has not been released to npm.

## 1. Concepts and scope

| Concept | Meaning |
| --- | --- |
| Purpose | Persistent direction defined and changed exclusively by the agent owner. |
| Mission | A bounded transformation pursued under a purpose, with outcomes and scope. |
| Signal | A quantitative indicator, event or qualitative external condition receiving particular attention and triggering evaluation. |
| Observation | Timestamped evidence from a source about a signal; not an instruction. |
| Reference | Human-supplied value, range or interpretive criterion; not automatically a limit or action trigger. |
| Limit | Mandatory restriction on admissible actions or outcomes. |
| Guardrail | A mechanism enforcing a limit at an applicable boundary. |
| Inception | An idea, information, proposal or request evaluated without automatic obligation to adopt it. |
| Operational autonomy | Discretion within purpose, authority, limits and applicable supervision. |

Signals do not restrict other information the agent may access under its existing
permissions. Optimizing a signal is not proof of fulfilling purpose. References,
factual beliefs and preferences MUST remain distinguishable from mandatory rules.

## 2. Interaction binding and compatibility

Proposed `AgentInteractionBindingV1` is a discriminated union:

```ts
type AgentInteractionBindingV1 =
  | { schemaVersion: 1; interactionMode: "instruction" }
  | {
      schemaVersion: 1;
      interactionMode: "purpose";
      governanceId: string;
    };
```

The new optional binding belongs to an Agent Definition revision. Omission means
legacy instruction behavior. Unknown modes, malformed bindings and missing
purpose governance MUST fail validation, never fall back silently.
Existing revision bytes/digests MUST remain unchanged; omitted new fields must
not be inserted into legacy canonical payloads. Explicit bindings are covered
by the new revision's digest. Existing `instructions` continue to describe
operational guidance and cannot override governance in purpose mode.

The governance head pins the activated definition revision and mode. A published
revision is only a candidate until activation. A Room participant references this
agent binding; a message, task, runtime profile or Room owner cannot override it.
Purpose agents without registry-backed identity are outside initial V1 support.

Instruction mode interprets ordinary requests as tasks subject to existing
permissions. Purpose mode evaluates them as inceptions before deriving work.
Mixed Rooms are valid. New governance controls apply to opted-in agents in either
mode; omission must not retroactively require ownership enrollment of legacy agents.

## 3. Proposed domain records

All records are tenant/agent scoped. Immutable payloads have schema version,
stable identity and digest; mutable heads use monotonic revision CAS. Sensitive
content stays in access-controlled storage; mesh/audit projections carry bounded
references and digests as appropriate, not unrestricted raw content.

| Contract | Required semantic fields |
| --- | --- |
| `AgentGovernanceRevisionV1` | governance/agent/tenant IDs, revision ID, predecessor, purpose, owner principal ref, signal/reference/limit refs, delegated operation scopes, digest, author and timestamp |
| `AgentGovernanceHeadV1` | active configuration and definition refs, mode, CAS revision, authority epoch, active/suspended/transitioning status |
| `AgentGovernanceOperationV1` | operation ID, verified actor, expected head revision, operation kind, request digest, result/reason and audit event |
| `MissionPurposeBindingV1` | mission ref, purpose revision/digest, issuer authority ref, scope, outcomes, budget and status |
| `AgentInceptionV1` | source message/artifact refs, author attribution, content ref, receipt time and idempotency key |
| `InceptionAssessmentV1` | inception ref, configuration/definition/adapter refs, evidence refs, disposition, explanation, uncertainty and proposed work refs |
| `AttentionSignalDefinitionV1` | source adapter ref, quantitative/qualitative/event kind, evaluation criteria, cadence, freshness, coalescing and evaluation budget |
| `AttentionSignalObservationV1` | source/event ID, signal revision, observed/received times, content ref/digest and quality/provenance |
| `SignalReferenceV1` | signal ref, numeric range/value or qualitative criterion, author, validity and revision |
| `AgentLimitV1` | scope, mandatory rule, enforcement kind/port, unavailable behavior and modifying authority |
| `PurposeEvaluationReceiptV1` | triggering refs, configuration and evidence refs, decision, reason, uncertainty, permitted action refs and later outcome refs |

Assessment dispositions are `adopted`, `reformulated`, `rejected`,
`needs_evidence`, `deferred`. Receipts are immutable; reassessment appends a new
receipt referencing the predecessor. Adoption conveys no execution authority.
Explanations describe evidence and decision grounds, not private chain of thought.

## 4. Authority and identity

Hosts supply authenticated principals through a trusted authorizer port. Actor
IDs, display names, metadata, model output and plain `TenantContext` fields alone
MUST NOT establish identity. The owner is one stable human or organization
principal; organization representatives are verified by the host identity system.

| Operation | Required authority |
| --- | --- |
| Create governed agent | Authenticated creator authorized to assign the initial owner; record ownership before activation. |
| Change purpose or mode | Current owner only, through the governance API. |
| Change signals, references or agent limits | Owner or expressly scoped delegate; no platform-limit override. |
| Issue/revise/close mission | Owner or scoped mission issuer, including an explicitly authorized agent. |
| Submit inception | Participant/input permission; grants no configuration rights. |
| Propose configuration change | Permitted agent/human; proposal has no effect until authorized mutation. |
| Suspend | Owner, scoped suspension delegate or applicable platform control. |
| Resume | Owner or explicit resume delegate after validation; cannot clear an independent platform suspension. |
| Transfer ownership | Current owner initiates, target authenticates and accepts; atomic CAS commit. |

Delegation MUST specify operation, agent/tenant scope, validity and revocation.
Purpose and mode authority cannot be delegated to an ordinary user or agent.
Ownership transfer increments the epoch, revokes old delegations, invalidates
pending decisions and leaves the agent suspended. Abandoned transfers expire
without changing ownership. V1 has no automatic lost-owner recovery or tenant
administrator bypass. Hosting administrators retain their infrastructure powers;
these contracts do not claim protection against a compromised host.

Missions MUST bind to the current purpose and authorized scope. Semantic fit is
assessed with recorded evidence, not claimed as a deterministic theorem. Ambiguous
fit is deferred/escalated. A mission MUST NOT amend purpose or expand permissions.

## 5. Controlled mutations and transitions

Commands carry expected revision and an idempotency key bound to the complete
request digest. An exact replay returns its durable result; key reuse with new
bytes conflicts. Head update, operation result and audit/outbox entry commit
atomically. Competing mutations permit one CAS winner. Missing state denies.

Every effective governance mutation advances the authority epoch. This
conservative V1 rule invalidates pending action assessments even for reference
changes; future optimizations require dependency evidence. Before dispatch,
execution MUST compare the pinned revision/epoch to current authoritative state.

Mode/configuration activation follows a durable procedure:

1. Authenticate and authorize; validate candidate configuration, definition and
   required enforcement capabilities before changing the live head.
2. CAS the head to `transitioning`, increment the epoch and fence new dispatch.
3. Reconcile active effects (retaining budget for indeterminate results) and invalidate unstarted work. Request cooperative
   cancellation of computation; it cannot authorize further effects.
4. Reevaluate pending missions/work under the candidate configuration. Preserve
   original inputs and lineage; never reinterpret old tasks silently as inceptions.
5. Activate the bound configuration/definition atomically and record the outcome.
   A failed/interrupted transition stays fenced and is resumed idempotently;
   authorized abandonment restores a validated prior configuration under a new epoch.

Switching to instruction mode retains applicable limits, revocations and budgets.
Purpose-mode activation requires all mandatory services. Candidate bindings alone
MUST NOT enable execution; the objective 7 Room profile requires qualified mission
control and atomic work fencing in addition to the base execution controls.

Suspension fences new dispatch without cognitive consent. In-flight external
effects may complete: cancellation is best effort, unknown outcomes remain
indeterminate, and reconciliation precedes retry. Dispatch authorization has a
defined linearization point; an already admitted effect cannot be retroactively
revoked. Stronger cancellation requires adapter cooperation. No external
exactly-once or universal rollback guarantee is made.

## 6. Evaluation and execution

Ordinary input becomes an inception in purpose mode, including input from the
owner and incoming delegated work. Internal work derived from an adopted plan
retains its assessment lineage; it need not recursively create inceptions.
Observation, scheduled review and inception intake can wake the same bounded
evaluation loop. Waiting or seeking evidence are valid decisions.

Signal ingestion records observations durably before scheduling evaluations.
Deduplication uses source identity plus payload digest; conflicting replays are
rejected. Processing uses leases/checkpoints and durable outbox delivery, with
coalescing and quotas. Stale, out-of-order, unavailable and contradictory sources
remain visible; absent evidence is never healthy evidence. Qualitative assessments
retain the interpreting adapter and source evidence. Reference deviation is not
automatic authority to act or a mandatory violation.

Enforcement reuses the existing Action Gateway and governed action guards.
Deterministic limits (allowlists, access scopes, budget reservations) are enforced
outside model judgment. Semantic restrictions require a declared assessment port
and uncertainty policy; unavailable required assessment blocks affected effects.
Budget checks reserve cumulatively and atomically across concurrent actions.
Adapters lacking required enforcement capabilities cannot activate this profile.
Governance does not make unrestricted external tool credentials safe by itself.

Execution binds configuration, mission, evidence, action input and authority.
Outcome review distinguishes task completion, observed metric change and evidence
of purpose contribution. Correlation alone is not causal proof. Reuse existing
workflow outcome and assurance records rather than inventing a second executor.

## 7. Composition and package ownership

| Existing component | Planned change / retained responsibility |
| --- | --- |
| `packages/rooms/src/agent-registry.ts` | Add optional versioned interaction binding; retain stable identity and immutable definitions. |
| `packages/rooms` | Own governance records/services/ports, inceptions and signal attention semantics; provide in-memory test stores. |
| `packages/rooms-postgres` | Add migrations, atomic CAS/journal/outbox persistence and reopen/concurrency tests. |
| `packages/rooms-api` | Expose separately authenticated governance commands and ordinary input endpoints. |
| `packages/runtime` | Consume neutral context/guard ports and adapter capability checks; no Rooms dependency. |
| `packages/workflows`, `packages/workflows-rooms` | Reuse durable wakeups, work lineage, gates and outcome integration. |
| `packages/inference-control`, `packages/collective-control` | Retain Action Gateway, assessments, authority and protected effect ownership. |
| `packages/collective-runtime`, `packages/collective-host` | Compose mission-purpose binding, assurance and governed evolution through existing owners. |
| `packages/autonomy` | Retain supervision decisions; scope evidence by governed configuration and evaluated capability. |
| `packages/agent-registry`, `packages/a2a`, `packages/rooms-mesh` | Publish/transport advisory capabilities and references only; no remote governance authority. |

Avoid a new package in the first increment. Extract shared portable contracts
only if an actual dependency requires it, preserving acyclic imports. Published
entry points and strict wire codecs require additive/versioned changes; do not
append fields to closed V1 protocols without their compatibility verification.

Delegation intersects sender authority with recipient permission. A purpose
recipient may decline; an instruction recipient executes an admitted bounded
task. Room approval is not purpose mutation. New models do not gain permissions
or inherit unqualified evidence. Genesis must explicitly assign owner/governance;
children cannot receive authority their creator lacks. Morphogenesis proposals
preserve existing Membership, Work and Action owners and constitutional controls.

## 8. Acceptance scenarios

These are required future tests, not passed tests. IDs map to the implementation plan.

| ID | Scenario and expected result |
| --- | --- |
| G01 | Legacy omitted binding retains behavior and exact digest; unknown mode fails. |
| G02 | Mixed Room routes each agent correctly; incomplete purpose configuration cannot activate. |
| G03 | Ordinary owner message cannot change purpose; authorized owner command can; tenant spoofing fails. |
| G04 | Delegate changes only authorized fields; agent mission issuance cannot change purpose. |
| G05 | Concurrent governance writes have one winner; exact retry is replayed, altered retry conflicts; reopen retains results. |
| G06 | Two-party ownership transfer revokes old grants and remains suspended; stale acceptance fails. |
| G07 | All five inception dispositions preserve evidence; adoption alone cannot dispatch. |
| G08 | CAC or qualitative market observation wakes evaluation; human reference alone is neither a limit nor an action order. |
| G09 | Duplicate/out-of-order/stale/conflicting signals and worker restart preserve bounded processing and evidence quality. |
| G10 | Concurrent spending cannot evade aggregate limits; missing required guard denies effects. |
| G11 | Purpose change, mode transition or suspension fences stale work; already admitted/unknown external effects are reconciled. |
| G12 | Crashes at each activation boundary recover or remain fenced; instruction fallback never removes limits. |
| G13 | Completed tasks and improved proxy metrics alone do not assert purpose fulfillment; insufficient evidence permits waiting. |
| G14 | Delegation, model replacement and Genesis cannot amplify permissions; governance survives reorganization. |
| G15 | Account-access support persistent demonstration (replacing LTV/CAC by owner choice) covers both modes, correction, suspension, reopen and outcome review. |

## 9. Evidence boundary and deferred choices

V1 does not prescribe a consulting methodology, universal maturity score, model
provider or definition of AGI. It specifies interoperable software behavior.
Semantic judgment quality needs empirical evaluation beyond conformance tests.
The frozen Collective Capability Baseline V1 remains unchanged.

Application choices: concrete identity provider, external signal connectors,
domain-specific limits/assessment policy, mission success criteria and retention.
Implementation choices: exact exported names, endpoint paths and migration numbers
are finalized with each objective and documented before publication. These do not
change the authority/invariant decisions above. Lost-owner recovery, cross-tenant
ownership transfer and unconstrained self-modification are outside this V1.
