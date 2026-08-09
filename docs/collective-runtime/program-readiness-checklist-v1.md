# Collective program readiness checklist V1

Status: preparation boundary. No deployment, publication or evaluation is
authorized by this document.

Source scope is fixed by baseline `agentplat-collective-capabilities-v1`.
Unchecked readiness work below cannot change its 11-objective/19-capability
denominator; it remains deployment, evidence or organizational work.

## Source and architecture

- [x] Public provider-neutral surfaces are mapped to 19 capability objectives.
- [x] Eleven cross-cutting closure objectives have executable reference
      compositions, an executable bounded model or reusable transition
      artifacts.
- [x] An executable evidence contract distinguishes source completion from
      empirical validation.
- [x] Authority, finality, budget, lineage and monotonic-coordinate invariants
      are enforceable before protected effects.
- [x] Threat boundaries identify application-owned identity, membership, key,
      time, certificate, storage and effect-sink responsibilities.
- [x] Complexity envelopes and falsifiable comparison hypotheses are explicit.
- [ ] Freeze a clean source commit and generate all 19 capability receipts for
      that exact commit and tree.
- [ ] Complete independent architecture and security review of the frozen tree.

## Reproducibility and supply chain

- [ ] Produce an SBOM for every published package and reference container.
- [ ] Sign source, release artifacts and provenance attestations with managed
      release identities.
- [ ] Pin build/runtime dependencies and retain vulnerability-scan evidence.
- [ ] Demonstrate a clean build from a fresh environment using only declared
      inputs.
- [ ] Verify public-package consumers on supported Node.js versions and the
      durable PostgreSQL adapters against the exact release candidates.
- [ ] Publish license inventory, third-party notices and contribution/IP
      provenance.

## Production adapter obligations

- [ ] Install authoritative peer membership and epoch sources.
- [ ] Install managed signing keys, custody, rotation and revocation providers.
- [ ] Install authenticated transport endpoints and rate/backpressure controls.
- [ ] Install trusted logical time and independently protected monotonic
      witnesses for rollback-sensitive state.
- [ ] Install transactional, idempotent and fence-aware effect sinks.
- [ ] Install model/tool adapters with explicit data retention, privacy and
      redaction policies.
- [ ] Configure signed content-free telemetry retention and access controls.
- [ ] Exercise restore, key compromise, membership rotation and incident
      response procedures in the target environment.

## Empirical evaluation

- [ ] Freeze scenarios, seeds, perturbation strata, model/runtime descriptors,
      budgets and comparison baselines before execution.
- [ ] Start with local deterministic conformance, then increase collective size,
      interaction horizon and fault severity in explicit stages.
- [ ] Measure mission success, communication, recovery, agreement, semantic
      coherence, cognitive agility, safe-stop and resource cost together.
- [ ] Report uncertainty, missingness, exclusions and failed runs; do not replace
      them with successful reruns.
- [ ] Bind every report to source, scenario, adapter, policy and trace digests.
- [ ] Keep source receipts, empirical outcomes and release/publication evidence
      in separate namespaces.

## Organizational and hosting controls

- [ ] Select the target hosting boundary and document data classification.
- [ ] Complete the required cybersecurity maturity assessment for that boundary.
- [ ] Document identity/access management, least privilege, audit retention,
      vulnerability management, incident response and personnel responsibilities.
- [ ] Establish cost ceilings and operator approval for compute, hosted models,
      storage, CI and data egress before any large run.
- [ ] Confirm publication rights, data rights, export constraints and handling of
      restricted evaluation material with qualified counsel and program owners.
- [ ] Assign named owners and evidence locations for every unchecked item.

## Claim discipline

The repository may claim **development surface complete** only after the 19
source receipts close against one frozen tree. It may claim measured scale,
resilience, superiority, security compliance or operational readiness only
after the corresponding independent evidence above exists. A source assessment
never sets execution authority and never upgrades empirical validation from
`pending`.
