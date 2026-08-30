# Agent Morphogenesis Beta 1 operational readiness V1

Status: frozen profile, execution pending. This document establishes no
production-readiness or security-certification claim.

## Objective

Promote the published Beta 1 local-profile release evidence into a sustained,
recoverable operational profile. Every scenario must execute through real
PostgreSQL, real Temporal or the multiprocess Agent Mesh surface declared by
its binding. Source-only conformance can support diagnosis but cannot close an
operational scenario.

The normative machine-readable profile is
`config/agent-morphogenesis-beta1-operational-readiness-v1.json`.

## Fixed profile

The release soak lasts 30 minutes and must complete at least 120 iterations,
split evenly between `recruit_existing` and `catalog_created`. Up to four
Morphogenesis runs may execute concurrently. The schedule includes Temporal
worker replacement, Mesh partition/heal, PostgreSQL connection loss, two
authorization rotations, rejection of expired authority and supervisor
restart/resume.

No provider or paid model call is required. Tokens and cost are recorded as
zero only when no model boundary was invoked.

## Terminal gates

All scenarios must pass. Mission continuity must remain one, and unauthorized
activation, duplicate material effects, lost committed receipts and morphology
head forks must remain zero. Nominal p95 wall time is capped at five seconds;
recovery p95 at fifteen seconds; supervisor resume at thirty seconds.

The profile also caps process RSS, aggregate CPU, PostgreSQL and Temporal
storage growth, and pending Mesh inbox/outbox rows. Missing resource samples
are failures rather than inferred values.

## Operations package

Readiness requires deployment, rollback, authorization rotation, incident,
PostgreSQL recovery, Temporal recovery, Mesh partition recovery and evidence
verification runbooks. A detached supervisor must maintain heartbeat and
hash-chained operational events, recover closure from immutable receipts and
never infer completion from mutable counters.

## Public audit repair

Historical research and pilot artifacts may be isolated only through an exact
per-file SHA-256 exception ledger. Directory or glob exceptions are forbidden.
Every entry requires a reason and remains subject to the existing 20,000,000
byte ceiling. This
preserves the evidence without deleting it or weakening secret and terminology
scanning for ordinary source files.

## Evidence boundary

Passing this profile may establish
`operationalReadiness: beta1-local-profile-established`. It does not collect the
registered scientific experiment, establish production readiness, certify
security or authorize production effects. The frozen collective capability V1
baseline remains unchanged. Profile synthesis, recursive agent creation and
Team split/merge/federation remain excluded.
