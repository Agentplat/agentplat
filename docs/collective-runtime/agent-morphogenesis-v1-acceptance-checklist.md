# Agent Morphogenesis V1 acceptance checklist

Status: future-baseline proposal; unchecked items are not implementation
claims.

## Architecture and compatibility

- [x] Capability is opt-in under
      `@agentplat/collective-runtime/morphogenesis`.
- [x] Existing Collective Runtime, Mission Lifecycle, Agent Mesh, membership,
      Team, Work, role and action defaults remain unchanged.
- [x] Frozen V1 capability baseline is not edited or semantically expanded.
- [x] Morphogenesis introduces no second factory, lineage, membership, Work,
      decision, Workflow or audit implementation.
- [x] Portable source imports no PostgreSQL, Temporal, Room or provider SDK.
- [x] Public docs separate source behavior, conformance, deployment and
      empirical evidence.

## Contracts and bounded state

- [x] Scope binds tenant, mission and applicable Mesh, Room, Objective and Work
      coordinates.
- [x] Source heads bind authenticated source, implementation, revision, record,
      scope, observation time and expiry.
- [x] Snapshot declares its bounded view and cannot represent global candidate
      absence.
- [x] Need, target, proposal, process binding and receipt are strictly
      versioned, content-minimized and digest-bound.
- [x] Target distinguishes retain, recruit, instantiate, rebind, drain, detach
      and retire intent.
- [x] Proposal binds current and target morphology, closed intent operators,
      compiled process definition, dependencies, estimates, decision route,
      compensation intent and validity.
- [x] Validators reject unknown fields, malformed IDs/digests, oversized
      collections, duplicate identities, invalid DAGs and content-bearing
      control payloads.
- [x] `MorphologyHeadStoreV1` enforces revision/digest CAS, predecessor lineage,
      logical-time monotonicity and one successor per epoch.
- [x] In-memory state documents its lack of cross-process durability and
      rollback resistance.

## Instantiation profile and lineage

- [x] `AgentInstantiationProfileV1` references an existing certified governed
      role definition rather than redefining role authority.
- [x] Instruction, tool-set, memory and contract content remains externally
      referenced by digest.
- [x] Profile certification verifies provenance, expiry, adapter/runtime
      compatibility, assessors and every authority/resource ceiling.
- [x] Profile compilation produces the exact existing
      `AgentCreationRequestV1` inputs without bypassing its policy.
- [x] `AgentLineageRecordV1` remains authoritative for parent/child lineage.
- [x] `MorphogenesisLineageLinkV1` cannot activate, suspend, enroll or retire an
      agent.
- [x] Artifact/profile substitution, revocation and unresolved references fail
      closed.

## Decision routes

- [x] Local-policy, authorized-agent, authorized-person, collective and
      composite routes share one normalized decision binding.
- [x] Policy selects the permitted route for the exact operator, risk and
      budget.
- [x] Authorized-agent decisions require a current explicit decision mandate.
- [x] Membership, role, Trust, capability or proposal authorship alone cannot
      authorize a decision.
- [x] Prohibited self-approval and proposer/decider conflicts fail closed.
- [x] Independent or composite review is enforceable for configured sensitive
      transformations.
- [x] Every decision binds exact current morphology, proposal, target, policy,
      budget, relevant subsystem epochs, actor/certifier and expiry.
- [x] Exact replay is idempotent; changed input under a retained decision
      identity conflicts.
- [x] A stale, expired, revoked, cross-scope or wrong-epoch decision fails
      closed.
- [x] No decision becomes membership, Work or action authority.

## Governed Durable Workflows composition

- [x] First release uses the fixed
      `agentplat.morphogenesis.catalog-lifecycle.v1` process definition.
- [x] Proposal binds the exact registered process definition digest.
- [x] Caller cannot register or select an arbitrary execution DAG through a
      proposal.
- [x] Workflow Task definitions bind exact handler, policy, runtime and action
      identities.
- [x] Protected external tasks use the existing Action Gateway composition.
- [x] Workflow task identity and subsystem operation identity remain distinct
      and deterministically related.
- [x] Gate approval only selects a branch; `verify_decision` resolves the exact
      current Morphogenesis decision before prepare.
- [x] Authorized-person route reuses `@agentplat/workflows-rooms` without a
      second Room approval aggregate.
- [x] Agent/local/collective/composite gate routes fail closed on unavailable
      decision state.
- [x] One `advance()` is transition-bounded and dispatches at most the Workflow
      contract allowance.
- [x] Cancellation prevents unclaimed normal stages and schedules only valid
      reverse-order compensation.
- [x] Failed or indeterminate compensation cannot produce a successful result.

## Observation and proposal engine

- [x] Observation accepts only authenticated registered source projections.
- [x] Required missing, stale, rolled-back or equivocal source state fails
      closed.
- [x] Identical current state and evidence produce the same snapshot, need,
      target and proposal digests.
- [x] `missing_capability` detection records the bounded search view and limits.
- [x] Eligible existing agents are preferred when policy requires recruitment.
- [x] Creation is rejected when policy disallows it or bounded discovery is
      incomplete.
- [x] Population, concurrency, descendant, resource, token, time, cost, TTL,
      cooldown, hysteresis and churn limits are enforced.
- [x] Model-assisted assessment output remains untrusted proposal data.

## Budget reservation

- [x] Reservation binds tenant, mission, proposal, morphology epoch, operation,
      typed envelope and expiry.
- [x] Concurrent reservations cannot double-spend one configured envelope.
- [x] Exact retry returns the retained reservation; changed reuse conflicts.
- [x] Currency values use safe integer micros and distinct currencies never
      aggregate together.
- [x] Workflow usage measures consumption but cannot create or widen a
      reservation.
- [x] Agent creation, Team, Work, Inference Control and action budgets recheck
      independently at their own boundaries.
- [x] Reservation release, expiry and compensation are idempotent and
      auditable.

## Recruitment, creation and activation

- [x] Bounded discovery can recruit an eligible existing peer without creating
      an agent.
- [x] Catalog creation occurs only after exact profile certification, decision
      verification and budget reservation.
- [x] Existing governed factory is invoked with a stable subsystem operation
      ID and current creation certificate.
- [x] Factory success followed by local timeout reconciles without duplicate
      materialization.
- [x] Factory receipt cannot satisfy membership, Team, Work or action gates.
- [x] New agent passes runtime/profile attestation and current Trust,
      capability and Inference Control eligibility.
- [x] Mesh enrollment advances through the governed membership successor epoch.
- [x] Agent Room participation is explicitly applied and grants no Mesh or Work
      authority.
- [x] Successor Team activation requires exact active individual Work Contracts
      for every position.
- [x] Morphology activation requires the complete policy-declared readiness
      receipt set and current-head CAS.

## Continuity, drain and retirement

- [x] Unaffected completed causal work and permitted artifacts survive successor
      activation.
- [x] Affected downstream causal closure is explicitly rebound or invalidated.
- [x] No new Work is assigned to an agent after drain begins.
- [x] Permitted checkpoints and artifacts transfer by exact reference and
      digest.
- [x] Work leases, action grants and assignment fences revoke or expire before
      material termination.
- [x] Detach does not retire a reusable external identity unless policy says so.
- [x] Created temporary agent leaves membership through a certified successor
      epoch.
- [x] Governed termination occurs only after authority fencing and evidence
      preservation.
- [x] Post-activation failure creates an explicit successor recovery
      transition, not an atomic rollback claim.
- [x] Stale predecessor agent or coordinator cannot commit progress or effects.

## Crash, concurrency and partitions

- [x] Restart succeeds after every pure, gate, protected task, membership, Team,
      Work, activation, drain and termination boundary.
- [x] Prepared effects reuse their original operation identities after restore.
- [x] Possibly committed effects remain `indeterminate` until explicit
      reconciliation.
- [x] Two proposals racing for one morphology epoch retain one accepted
      successor.
- [x] Membership or network partition cannot produce conflicting accepted
      births, retirements or morphology heads.
- [x] Missing rollback-resistant head prevents durable progress.
- [x] Compaction retains sufficient tombstones to reject old operation,
      decision and proposal replay.
- [x] Temporal loss, duplication or history rollover cannot alter authoritative
      Workflow or morphology state.

## Agent Room and Agent Mesh projections

- [x] Room displays bounded current morphology, need and before/after diff.
- [x] Room displays selected decision route, status, progress and final receipt.
- [x] Room projection does not complete a task, approve an artifact, install
      membership or issue Work automatically.
- [x] Agent-authorized and person-authorized variants produce equivalent exact
      decision bindings for the same admitted route.
- [x] Mesh dissemination is authenticated, scope-bounded, causal and sparse.
- [x] No peer must receive the complete collective topology or morphology.
- [x] Projection retries use deterministic IDs and idempotency keys.

## Evidence and adversarial safety

- [x] Every material decision and side-effect boundary emits a bounded event or
      receipt with relevant scope, predecessor and result digests.
- [x] Recursive redaction removes credentials, private keys, raw prompts, raw
      model output and hidden reasoning.
- [x] Recursive spawn, profile injection, tool escalation, memory expansion,
      false capability, forged attestation and collusion scenarios fail safely.
- [x] Create/retire oscillation is bounded by cooldown, hysteresis and churn
      policy.
- [x] Delayed outcomes bind the exact immutable Workflow Task Run.
- [x] Missing, stale or manipulated outcomes cannot count as success or widen
      authority/operator policy.
- [x] Evaluation records success, partial success, failure, indeterminate or
      successor recovery against declared measures and coverage.
- [x] No source, test, example or conformance result claims global optimality,
      organizational fitness or production improvement.

## Persistence and adapters

- [x] `PostgresMorphologyHeadStoreV1` lives in
      `@agentplat/collective-host-postgres` and follows ordered migration rules.
- [x] PostgreSQL save compares revision, predecessor digest and expected current
      head in one transaction.
- [x] Durable adapter validates all stored JSON at read time and requires an
      external monotonic rollback witness where policy demands it.
- [x] Workflow process state reuses `@agentplat/workflows-postgres` rather than
      a Morphogenesis copy.
- [x] Temporal composition reuses `@agentplat/workflows-temporal` as wakeup and
      retry transport only.
- [x] Adapter dependency and admission records pass platform-boundary checks.
- [x] Memory and PostgreSQL morphology-head stores pass the same conformance
      suite, including distinct-process reopen.

## Delivery

- [x] ADR, threat model and this checklist remain synchronized with public
      contracts.
- [x] Public exports, type contracts, package catalog and browser entry point
      are registered.
- [x] Reference example covers recruit-existing and catalog-create branches.
- [x] Example includes authorized-agent and authorized-person decision variants.
- [x] Example crashes after factory success and reconciles without duplicate
      creation.
- [x] Focused unit, integration, fault and adversarial tests pass.
- [x] Workflow memory, PostgreSQL and Temporal composition cases pass their
      declared conformance profiles.
- [x] Workspace build, type-check, tests, public audit, platform boundaries,
      pack smoke and release verification pass on one clean commit.
- [x] README, architecture, AI context and changelog describe exact maturity and
      Evidence Boundary.
- [x] Future-baseline owner decision is recorded without editing frozen V1 in
      place.
