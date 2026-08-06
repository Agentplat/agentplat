# Collective Trust Consensus V1 acceptance checklist

## Architecture

- [x] The feature is opt-in through a dedicated package subpath.
- [x] Existing Trust, Mesh, planning, role and inference defaults are unchanged.
- [x] Consensus is documented as agreement over a scoped decision, not truth.
- [x] Collective decisions can narrow but never mint or widen authority.
- [x] Public artifacts use provider-neutral industry terminology.

## Contracts

- [x] Candidate identity binds subject, scope, policy, profile, fusion,
      eligibility, evidence set, disposition, predecessor and validity.
- [x] Candidate payloads contain no prompts, instructions or raw evidence.
- [x] Candidate and certified-decision IDs derive from canonical digests.
- [x] Unknown fields, malformed identifiers, unsafe integers and invalid windows
      fail closed.
- [x] Certified decisions bind exact agreement commit and membership.
- [x] Consecutive decisions preserve both commit and decision predecessor chains.

## Agreement and trust

- [x] `trust_decision` is a closed Collective Agreement value kind.
- [x] Every correct validator performs peer-local semantic resolution before
      voting.
- [x] Validators without the semantic adapter abstain.
- [x] A verified `2f + 1` precommit certificate is required.
- [x] Correlated evidence remains bounded by local Trust dependency policy.
- [x] Key rotation and membership reconfiguration preserve historical proof.

## Consumption

- [x] Effective disposition always preserves the stricter local result.
- [x] Missing or expired collective state fails closed when required.
- [x] `recovery_candidate` cannot directly produce eligibility.
- [x] The reusable filter returns the original local decision only on complete
      admission and never fabricates Trust state.
- [x] The filter can satisfy the existing async eligibility-port shape used by
      Mesh, planning, role and inference integrations.

## Durability and recovery

- [x] Repository save is CAS-safe, idempotent and chain-validating.
- [x] Conflicting, stale and gap writes leave the exact prior head unchanged.
- [x] A certified decision can be reconstructed after restart from a durable
      commit and exact candidate.
- [x] Repository heads are not accepted without cryptographic reconstruction.

## Security and delivery

- [x] Positive, negative, Byzantine, expiry, replay and restart fixtures pass.
- [x] Existing agreement and Trust tests remain green.
- [x] Public TypeScript declarations compile from the packed subpath.
- [x] Documentation and an executable example cover the complete workflow.
- [x] Workspace build, type-check, audit, release verification and pack smoke
      pass.
- [x] The final PR contains only this objective and is ready for review.
