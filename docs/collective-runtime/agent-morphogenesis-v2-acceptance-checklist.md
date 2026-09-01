# Agent Morphogenesis V2 source acceptance checklist

Status: source-complete on `codex/agent-morphogenesis-v1`. This checklist is a
code, API and deterministic-test assessment. It does not establish operational
readiness, production safety, scale, cost or improved organizational outcomes.

## Mission-driven lifecycle

- [x] Authenticated bounded observations produce a need, target and inert proposal through `MorphogenesisProposalEngineV1`.
- [x] Agent, person, local-policy, collective and composite routes normalize to one exact decision binding; no route inherently requires a person.
- [x] `GovernedMorphogenesisOperatorExecutionRuntimeV2` binds an approved decision to the exact proposal operation, Policy V2, compiled plan, scope, epoch, execution authorization and fence.
- [x] Forward effects are journaled and reconciled by stable operation ID.
- [x] Completed execution is evaluated into an immutable outcome and advances one morphology epoch through CAS.

## Profiles, factories and agents

- [x] Catalog, derived and synthesized profiles are represented and validated.
- [x] Evolution binds parent profiles and parent-agent lineage.
- [x] Authority, tool, action, resource and interaction attenuation fail closed.
- [x] Synthesis requires an independent certifier distinct from the synthesizer.
- [x] Evolved material binds operation, scope, proposal, profile, creation request and certificate before the provider-neutral factory is invoked.
- [x] `derive_agent` executes profile verification, governed lifecycle/factory, Trust attestation and Team Formation using exact predecessor receipts.

## Organizational operators

- [x] Governed role realignment delegates to Inference Control.
- [x] Work reassignment delegates to Mission Lifecycle and exact Work receipts.
- [x] Replacement orders successor creation/selection, attestation, Team activation, continuity, authority fencing, drain and retirement/detach.
- [x] Suspension checkpoints and fences before certified Membership exclusion.
- [x] Resume requires active-key proof, certified Membership readmission and Work rebinding.
- [x] Standalone drain, detach and retirement remain in the V1 durable saga.
- [x] Split, merge and federation use Dynamic Topology successor epochs with member conservation and unaffected-Team preservation.

## Recovery and persistence

- [x] Operator execution, outcomes, compensation and Dynamic Topology have in-memory reference stores and PostgreSQL CAS stores.
- [x] PostgreSQL reopen validates state digests, logical/revision heads and the external rollback witness.
- [x] Pre-commit compensation runs applied steps in reverse, journals before effects, reconciles acknowledgement loss and stops on ambiguity.
- [x] Dynamic Topology rollback is concrete and idempotent.
- [x] Completed execution is excluded from pre-commit rollback; post-commit problems use successor recovery.

## Integrations

- [x] Mission Lifecycle exposes explicit opt-in `request_morphogenesis`/`enact_morphogenesis` actions.
- [x] Agent Rooms and Agent Mesh expose bounded authority-neutral plan, status and outcome projections.
- [x] Membership, Team Formation, Work, Trust and Inference Control retain their existing authority boundaries.
- [x] Interop exposes `morphogenesis.enact` only behind an exact stateful admission grant and cannot create authority.

## Public delivery

- [x] Runtime, host, PostgreSQL, Rooms/Mesh, Mission and Interop entry points are exercised by public TypeScript consumer contracts.
- [x] V1 and V2 specifications, threat model and package documentation describe the implemented boundary without widening compatibility claims.
- [x] The baseline and advanced reference examples execute locally and identify themselves as examples rather than operational evidence.
- [x] `pnpm test`, workspace type-check, public audit and `pnpm check` pass.

## Evidence boundary

The source acceptance above proves only the behavior covered by repository
artifacts and deterministic tests. Existing Beta 1 operational records do not
cover the additive V2 operators. Any operational, empirical or production
claim for V2 requires a separately preregistered campaign and evidence bundle.
