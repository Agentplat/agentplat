# Agent Morphogenesis Beta 1 release evidence V1

Status: published local-profile release evidence for source commit
`763b0429bfdb4d931db1ddd605f6ea89ff271767`.

The registered 18-scenario campaign passed its bounded local profile using real
PostgreSQL, real Temporal and a four-peer/six-process Agent Mesh harness. The
bundle contains ordered scenario receipts and metrics for both vertical slices,
agent/person/quorum decision routes, six crash boundaries, minority partition,
concurrency, stale authority, self-approval and dependent-actor collusion.

The authorization and bundle attestation were issued by agents and signed with
Ed25519. Only public keys are published. The ephemeral private key is not part
of this directory or the Git repository.

## Evidence boundary

- source capability: implemented;
- conformance: Beta 1 campaign passed;
- operational diagnostic evidence: collected;
- release evidence: Beta 1 local profile passed;
- experimental evidence: not collected;
- operational readiness: not established;
- production and security-certification claims: prohibited.

This release does not change the frozen collective capability V1 baseline and
does not include profile synthesis, recursive agent creation or Team
split/merge/federation.

Run `pnpm verify:agent-morphogenesis-beta1-release` to verify the authorization,
every receipt and metric binding, both roots, the bundle digest, Ed25519 bundle
attestation, exact source commit and frozen baseline.
