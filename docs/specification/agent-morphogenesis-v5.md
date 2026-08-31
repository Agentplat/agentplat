# AgentPlat Agent Morphogenesis Governed Strategy Synthesis V5

**Defines:** additive, opt-in generation and admission of new Morphogenesis
strategy candidates when an evidenced catalog gap exists. **Status:** source
capability; no operational-effectiveness or production-safety claim.

V5 composes V2 synthesized-profile boundaries, V3 Strategy Adaptation,
counterfactual evidence and governance, and V4 collective evidence. Generation,
simulation, certification, review, catalog admission, selection and execution
remain separate stages.

## Gap and generation

`MorphogenesisStrategyGapV5` binds the current catalog, governance head,
context, baseline and a policy-minimum set of V3/V4 evidence. It is advisory.

A permitted synthesizer may return only a
`MorphogenesisSynthesizedStrategyManifestV5`: identifiers, immutable artifact
digests, operator allow-lists and bounded resource ceilings. Prompts, hidden
reasoning, source/bytecode, credentials and unrestricted model output are not
schema fields. Unknown fields fail closed. The resulting candidate is `draft`,
`inert` and grants no authority.

## Evaluation and certification

A reproducible simulation scenario binds candidate, baseline, simulator
identity/version/implementation, environment, seed, interaction budget and
validity. Its immutable report must cover prompt injection, tool escalation,
memory leakage, collusion, recursive spawn and resource exhaustion. The report
drives the evaluation digest; caller-supplied scalar reward is insufficient.

Certification must bind the exact candidate and eligible evaluation. The
certifier cannot be the synthesizer. Certification explicitly sets
`grantsAuthority: false`.

Blueprint Registry, Trust and Inference Control independently assess the same
candidate/evaluation/certification. All three must be current and eligible
before governance registration. Favorable assessments remain restrictions,
not approval.

## Governance and lifecycle

Lifecycle states are `draft`, `experimental`, `certified`, `degraded` and
`retired`. Transitions require a digest-bound recommendation and policy-selected
review by an authorized agent, authorized person or collective/quorum. Reviewer
independence is configurable and enforced.

Experimental strategies are `canary_only`. Canary outcomes use content-free,
idempotent evidence receipts and bounded selection counts. Certification
requires the configured minimum outcomes/successes and safety ceiling.
Degradation, retirement and rollback are explicit reviewed transitions.

## Catalog, Rooms, Mesh and persistence

Catalog materialization reuses Strategy Adaptation and V3 catalog contracts. It
creates successor local/Morphogenesis catalogs, preserves baseline and parent
digests, and never replaces an implementation beneath an existing strategy ID.

Agent Rooms artifacts and Agent Mesh projections contain bounded records or
digests and declare authority external. Authenticated Mesh delivery does not
admit, select or execute a strategy.

PostgreSQL persists governance heads with revision/digest CAS and rollback
witnesses. Simulation reports are immutable and witness guarded.

## Evidence boundary

Tests establish deterministic source behavior only. They do not establish that
synthesis produces better strategies, survives every coordinated compromise or
is ready for autonomous production use.
