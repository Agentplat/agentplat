# Unified compromise lifecycle v1

AgentPlat exposes one incident lifecycle across credibility assessment, restriction, isolation, recovery, expulsion, authority revocation, and forensic preservation.

## Public surfaces

- `@agentplat/collective-runtime/compromise-lifecycle` defines the `healthy`, `suspicious`, `restricted`, `isolated`, `recovered`, and `expelled` state machine, evidence thresholds, epoch transitions, and adapters for existing quarantine and recovery APIs.
- `@agentplat/collective-runtime/compromise-authority-lifecycle` coordinates transactional revocation of sessions, keys, roles, mandates, and effects. Reentry requires a new epoch and credential generation, approval, evidence, and strictly attenuated authority.
- `@agentplat/collective-runtime/forensic-preservation` provides content-addressed evidence, hash-linked custody records, signed manifests, export bundles, retention policy, legal hold, and controlled disposition.

All records share a stable incident identity and deterministic digests. Epoch and credential-generation fences prevent reuse of pre-incident authority. Recovery and expulsion require explicit receipts, and forensic evidence remains provider-neutral: applications supply signing and durable storage while the library owns canonicalization and verification.
