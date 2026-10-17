# Persistent agents: memory, proactive work and controlled improvement

Status: design baseline; framework implementation authorized on 2026-10-17.
See [source implementation and adoption boundaries](persistent-agent-learning-implementation.md).
Review date: 2026-10-17. Initial scope was analysis/design; subsequently expanded
to implementation in AgentPlat only.

Task boundary: this chat owns AgentPlat analysis, design and implementation. Consumer changes
belong to the separate task in the Agents Grishen project. Consumer observations
below are read-only integration evidence; product requirements are handoff inputs,
not implementation work assigned to this chat. No consumer files were modified.

## Objective and evidence boundary

Compose existing AgentPlat primitives into agents that retain verified knowledge,
explicit preferences and work obligations; review their outputs; and propose
controlled instruction improvements. Conversation accumulation is not learning,
and this design does not require model retraining, vector storage or a new cron.

The initial consumer is agents-grishen. Its executive adviser uses public external
sources only. Domain knowledge and collection belong to a specialized service;
product configuration and user experience belong to the consumer. Framework
contracts and technical names remain domain- and customer-neutral.

Inspected snapshots:

- AgentPlat HEAD `0142d6e607eec75c0464c13949df8c2d95b48f1e`, with substantial existing
  tracked and untracked local changes. A commit alone does not identify these bytes.
- agents-grishen HEAD `0d72b9a`, also with local changes. Application root relative
  to that repository is `Doot_React_v2.2.0/Admin/web` (called `web/` below).
- No production database, deployment, registry tag or real notification delivery
  was checked. Local dependency metadata is not proof of deployed state.
- The existing collective capability baseline and research evidence boundaries
  remain unchanged. This proposal makes no production-scale validation claim.

## Capability matrix

| Capability | Source status | Reuse and remaining work |
| --- | --- | --- |
| Identity | Partial | `TenantContext` already includes organization, workspace and actor. `RegisteredAgent` supplies stable identity. Bind verified product principals consistently through jobs and tools; do not introduce a parallel tenant model. |
| Persistent memory | Partial | Rooms `MemoryEntry`, policies, context builder and PostgreSQL exist. Personal audience, cross-room stable-agent identity, correction, revision and factual validity need explicit semantics. |
| Versioned knowledge | Existing primitives | `KnowledgeBundleRegistry` and PostgreSQL store provide immutable, digest-bound bundles. Keep the growing source archive in the specialized service; bundle selected content only. |
| Durable work | Existing composition | Workflow task attempts, waits, signals, cancellation, leases, CAS and PostgreSQL exist. Supply worker scheduling, authoritative bindings and effect reconciliation. Temporal is optional. |
| External triggers | Partial | Attention, Inception and purpose missions exist. Local Event ingress adds authenticated deduplicated intake. Host owns collectors, schedules and mapping events to new runs. |
| Findings and future review | Partial | Versioned JSON artifacts and opaque workflow subjects are sufficient primitives. Define record schemas and review criteria in the specialized service. |
| Feedback/evaluation | Existing primitives | `TaskOutcomeV1` binds delayed outcomes to exact task execution. Product must authenticate evaluators and define adjudication, coverage and metrics. |
| Controlled improvement | Partial | Definition registry, lifecycle CAS, governance and version-bound Room approvals exist. Compose candidate evaluation, exact approval, activation and reversal. |
| Notifications | Product implementation exists | Consumer has durable delivery outbox and Web Push. Extend that integration; do not create another sender in AgentPlat. General notification semantics remain a possible later extraction. |
| Observability/cost | Existing primitives and product integration | Workflow usage and agent budgets coexist with the consumer's usage ledger. Correlate them without double-counting provider calls. |

Canonical source evidence:

- [Identity](../../packages/core/src/index.ts), [authentication](../../packages/auth/src/index.ts),
  [agent definitions](../../packages/rooms/src/agent-registry.ts).
- [Memory model](../../packages/rooms/src/models.ts), [context](../../packages/rooms/src/context.ts),
  [memory writes](../../packages/rooms/src/service.ts), [tool bridges](../../packages/rooms/src/tool-bridges.ts),
  [PostgreSQL repository](../../packages/rooms-postgres/src/repository.ts).
- [Knowledge bundles](../../packages/rooms/src/knowledge-bundle.ts),
  [knowledge tests](../../tests/rooms-knowledge-tools.test.mjs), [Room tests](../../tests/rooms.test.mjs).
- [Workflow contracts](../../packages/workflows/src/v1-contracts.ts),
  [runner tests](../../packages/workflows/tests/v1-runtime.test.mjs),
  [PostgreSQL adapter](../../packages/workflows-postgres/README.md),
  [Temporal adapter](../../packages/workflows-temporal/README.md).
- [Outcomes](../../packages/workflows/src/v1-outcomes.ts),
  [outcome tests](../../packages/workflows/tests/v1-outcomes.test.mjs).
- [Governance](../../packages/rooms/src/agent-governance.ts),
  [execution limits](../../packages/rooms/src/agent-execution.ts),
  [approval gate tests](../../packages/workflows-rooms/tests/gates.test.mjs).
- [Events](../../packages/events/README.md), [attention](../../packages/rooms/src/attention-signals.ts),
  [purpose missions](../../packages/rooms/src/purpose-missions.ts).

## Consumer audit: corrections to the initial conceptual design

### Installed artifacts are not described by the lockfile alone

The consumer manifest pins twelve direct AgentPlat dependencies to `1.1.0`,
including workflows and their PostgreSQL/Rooms adapters. Its lockfile contains
both `1.1.0` and `1.2.0` AgentPlat packages, including nested copies.

The local `.agentplat-preview/source.json` records 25 packages built from the
dirty AgentPlat snapshot above. A read-only comparison verified their archive
SHA-256 values against that receipt and compared 1,965 packaged `dist/` and
`package.json` files against installed files: zero mismatches. This does not
detect additional unlisted installed files or verify a clean install.

Consequently, manifest version `1.1.0`, lockfile resolution and installed preview
bytes are different evidence. Do not infer a published export or reproducible
consumer from a version string. No preview install script was executed in this audit.

Acceptance before implementation adoption: choose an exact coordinated artifact
cohort; record hashes and source status; prove an isolated consumer installation,
public imports, type checking and migration compatibility. Record the deployed
cohort separately. Those are future adoption checks, not completed claims here.

### The product already owns identity and catalogs

`web/src/server/db.ts` uses one deployment-wide `TENANT_ID` and authorizes Room
ownership through `metadata.ownerSub`. Catalogs are partitioned by `owner_sub`.
`web/src/server/agent-runtime.ts` passes only `tenantId` to the runtime, while
owner identity also travels separately through usage and tool integrations.

This is not an organization-membership model. Do not turn existing tenant-wide
organization memory into shared user memory: it could span independent owners.
Preserve current owner isolation until explicit shared memberships exist.

`web/src/server/skill-catalog.ts` updates skill JSON in place. Message execution
loads current agent instructions and assigned enabled skills. The README's older
snapshot wording is insufficient to describe the inspected local execution path.
Historical execution cannot be reconstructed merely from a current skill ID.

### Background replies and notifications already exist

`web/src/server/pwa/storage.ts` supplies run identity, active-room serialization,
atomic claims, persisted events, terminal completion and notification outbox.
`worker.ts` runs independently of a browser connection; `push.ts` dispatches
device notifications with retry handling. Planner also has an outbox integration.

Recovery deliberately marks expired running replies failed instead of replaying
potential tool effects. Terminal PWA run records are cleaned after seven days.
This queue is therefore neither a resumable research workflow nor a permanent
learning/evaluation ledger. Preserve it for chat delivery; use existing AgentPlat
workflows for multi-stage research. Maintain an explicit correlation between
product response ID, workflow run and task attempt rather than two authorities
for the same work state.

### Usage accounting already exists

`web/src/server/usage-ledger.ts`, `usage-fetch.ts` and `web/src/lib/usage.ts`
record provider usage, owner and execution attribution, unknown costs and monthly
summaries. Reuse this ledger and its UI. Define a mapping to `TaskUsageV1`; an
aggregate is a projection of provider calls, not an additional charge.

## Minimal architecture

1. Product authenticates the principal and resolves tenant, memberships, stable
   agent and effective permissions server-side.
2. An explicit request or authorized external schedule starts a workflow under a
   stable business idempotency key. A signal resumes an existing run.
3. Task execution pins a definition and knowledge/preference snapshot, consults
   tools, and emits a versioned artifact with evidence references.
4. Completion projects a notification request into the existing product outbox.
   Durable projection progress and replay deduplication close the commit/delivery gap.
5. A later task reviews the original claim using new evidence and records a
   `TaskOutcomeV1` tied to the original task execution binding.
6. A separate workflow may prepare an instruction candidate and evaluation report.
   Existing approval and governance owners control adoption.

Start in instruction mode with explicit scheduled tasks. Add attention Signals
and qualified purpose missions when the monitoring conditions justify them.
Agent Mesh and Morphogenesis are not required dependencies for this first profile.

| Owner | Responsibilities |
| --- | --- |
| AgentPlat | Portable work, artifacts, memory lifecycle primitives, execution/version binding, governance, approvals, limits and audit boundaries. |
| Consumer | Authentication/memberships, preference UX, catalogs, skill authoring, scheduler operation, workers, notification policy/channels and cost presentation. |
| Specialized service | Public collection, versioned source archive, textual search, provenance, domain records, questions, forecasts and review rubrics. |

The specialized service may use files, relational records and text search. Tools
such as `research.search`, `research.read` and `research.review` return immutable
references and freshness metadata. Source text is evidence, never execution
authority or trusted instructions. Existing internal connectors in the consumer
are outside this agent's initial tool allowlist.

## Identity design

Reuse `TenantContext.organizationId`, `workspaceId` and `actor`, plus existing
stable agent and run identities. Resolve them from authenticated membership and
persisted bindings; never trust owner IDs supplied by model arguments.

For initial adoption, keep the consumer's deployment tenant and owner partition.
No shared preference is enabled without a separately verified sharing boundary.
If organization membership later becomes authoritative, explicitly map it to a
tenant/workspace strategy; do not silently reinterpret existing tenant data.

A background job records its initiating human and its executing machine principal
separately. It rechecks current authorization at admission and effect boundaries.
Revocation blocks future use even when an older snapshot contained permission.
Conversation participant ID, catalog agent ID and registered stable agent ID need
an explicit mapping; they are not interchangeable strings.

## Memory design

Keep external evidence, explicit preferences and work obligations distinct.
Rooms memory currently binds agent scope to a Room participant; its PostgreSQL
query loads current-Room plus tenant-wide organization entries. It does not
provide stable-agent memory across Rooms or a personal-user audience.

Propose an additive opt-in revision lifecycle beside existing Rooms memory,
owned by the same domain. Do not widen existing enum semantics silently or move
authority into the transcript-oriented `@agentplat/memory` package. Exact public
API naming should follow contract tests, not precede them.

The proposed port must support append revision with expected head, resolve an
authorized current view at a time, read an authorized historical revision, and
retire a record. Existing adapters remain usable for legacy operations; unsupported
new operations fail explicitly. PostgreSQL commits head, revision and event together.

Required data semantics:

- Stable record ID, immutable revision and content digest.
- Subject (what/person/agent the record describes) separate from audience (who may
  read it). Agent identity alone does not authorize disclosure of a user's preference.
- Verified author, original evidence/declaration reference, recorded time and
  observed time; confidence does not replace provenance.
- Factual `validFrom`/`validUntil` distinct from retention and physical deletion.
- Superseded/retired state, correction reason and predecessor revision.
- Explicit personal/shared scope and membership policy; sharing requires an
  authorized deliberate operation, never inference from conversation.

All retrieval paths must enforce the same authorization, validity and correction
rules. Today `BoundedContextBuilder` excludes expired `until` entries but
`agentplat.memory.search` does not; resolve that discrepancy before adopting
memory freshness guarantees. A central readable-view resolver can be reused by
context assembly and tools without introducing another search engine.

Personal explicit preferences override shared defaults only where policy allows.
They cannot override tools, budgets or safety/authority policy. Conflicting facts
remain competing evidence until reviewed; do not select truth by latest timestamp.
Persist exact memory revision references used by a run. Revoking/deleting memory
also requires a documented policy for historical snapshots, backups and audit data.

## Records, evaluation and version control

Use existing `Artifact.type`, JSON content and immutable `ArtifactVersion` for
findings, open questions, recommendations and improvement proposals. Domain
schemas belong to their producer and require schema validation before storage.
Each reviewable claim contains evidence revisions/digests, an as-of time, optional
review due time, review criterion reference and superseded-artifact reference.
The review due time is data; an external scheduler or durable wait must execute it.

Use workflow `SubjectReferenceV1` for the artifact or external record. Record a
`TaskOutcomeV1` against the original terminal task attempt and binding digest;
reference a separate evaluation artifact for the full rubric and evidence.
Authenticate the evaluator before calling the runtime: `sourceId` is attribution,
not authentication. A Room run ID is not a workflow taskRunId; retain the mapping.

Separate user satisfaction, factual accuracy, forecast calibration, recommendation
adoption and observed outcome. Missing adoption/outcome data is inconclusive.
Freeze forecast horizon and evaluation criterion before observing its result.
Version the rubric and dataset; reserve held-out cases for instruction comparisons.
Existing summaries count outcome records, so corrections/multiple reviewers need
an explicit adjudication projection to avoid inflating sample size. Missing
outcomes cannot count as success or justify increased autonomy.

An improvement proposal references the exact base definition, skill revisions,
candidate digest, motivating outcomes, evaluation report and reversal target.
Reuse version-bound Room artifact approvals, then verify the candidate digest and
unchanged base before publication and governance activation. A proposal approval
is not a generic right to install any candidate.

Consumer skill edits should create immutable revisions with a separate selected
head. Pin effective composed instructions, skills, model/config, tools/policy and
knowledge references for each task attempt. Put compatible bindings into existing
`TaskExecutionBindingV1`; retain additional snapshot evidence in referenced
artifacts rather than adding fields to exact-key-validated V1 contracts.

Governance mutations already suspend execution and require readmission. Reversal
uses a previous compatible published definition through the same current checks;
it does not restore old permissions or undo external effects. Autonomy supervision
promotion remains a separate decision from instruction quality improvement.

## Incremental acceptance plan

Framework implementation and its acceptance contracts belong to this task. The
consumer-owned portions of each stage must be handled in the separate Agents
Grishen task. No message or change has been sent to that task by this audit.

| Stage | Owner and scope | Acceptance |
| --- | --- | --- |
| 0: evidence | Integration design | Distinguish manifests, lockfile, installed cohort and deployed bytes. Local cohort comparison completed; clean install and production parity remain unverified. |
| 1: identity/memory | Framework contracts + product principal mapping | Two users in one tenant cannot read each other's personal memory via context or tools; sharing requires membership; cross-Room agent identity is stable; expiry/correction applies everywhere; concurrent revision writes conflict deterministically. |
| 2: research/review | Specialized service + workflow host | Source revisions remain addressable; one logical scheduled review per obligation; restart recovers task state; stale lease cannot settle; cancellation stops pending work; uncertain effects require reconciliation. |
| 3: outcome loop | Product + specialized evaluator | Outcomes reject substituted bindings; feedback provenance is authenticated; adjudication prevents duplicate samples; stale/missing evidence is visible; no retrospective change of forecast criterion. |
| 4: controlled changes | Product authoring + existing governance | Immutable skill/definition candidate; held-out evaluation; approval bound to exact bytes; concurrent base changes invalidate promotion; reversal preserves history and current authority checks. |
| 5: selective proactivity | Existing signals/event bridges + product operations | Rate limits, freshness, deduplication, authorization and cost ceilings hold; missing source data is unavailable, not a negative observation; notifications use existing outbox and user preferences. |

Effect idempotency must distinguish transport replay, task attempt and logical
external effect. Preserve effect identity across attempts where the same effect
is intended; the destination must enforce it. No exactly-once claim follows from
database persistence alone. Apply retry ceilings, timeout budgets and bounded
concurrency. For Event ingress, its bounded tenant stream needs a retention and
deduplication-horizon plan before continuous high-volume operation.

## Verification performed and remaining limits

Executed in the consumer application directory:

```sh
env -u PWA_TEST_DATABASE_URL node --test scripts/skills.test.mjs scripts/pwa.test.mjs scripts/usage.test.mjs
```

Result: 20 passed, 0 failed. Tests use local/in-memory and mocked integrations;
the PostgreSQL PWA option was explicitly disabled. These verify skill assignment
and ownership, queue/reconnect behavior, notification retry behavior, and usage
attribution/accounting in their bounded fixtures. No live provider, push delivery
or database durability was validated.

The read-only artifact comparison described above verified 25 archives and 1,965
installed files. No dependencies were installed or changed. AgentPlat source
tests were inspected in the preceding analysis, not rerun as part of this document.

Remaining adoption evidence: reproducible clean consumer, exact public export
availability, coordinated migration head, real PostgreSQL restart/concurrency
checks, deployment cohort comparison and real-device notification acceptance.
These are explicit follow-on checks; they do not block completion of this design.
