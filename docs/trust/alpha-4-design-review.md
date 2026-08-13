# Evidence and Trust Alpha 4 design review

Status: accepted for implementation.

## Reviewed material

- normative commit:
  `e08e43beecf913e6e0a650c29625371ea1a29a4b`;
- public baseline: `083824407e87f0c58d5f7d70194d061e8848caf6`;
- branch: `codex/evidence-trust-alpha4-design`;
- implementation plan: `docs/trust/alpha-4-implementation-plan.md`;
- acceptance contract: `docs/trust/alpha-4-acceptance-checklist.md`;
- threat model: `docs/security/evidence-trust-threat-model.md`;
- compatibility and wire contracts under `docs/agent-mesh/`.

The three final reviews inspected Git objects from the normative commit, not a
later working tree. `git show --check` and `git diff --check` reported no patch
errors.

## Independent verdicts

| Review                         |  P0 |  P1 |  P2 | Verdict  |
| ------------------------------ | --: | --: | --: | -------- |
| architecture and determinism   |   0 |   0 |   0 | accepted |
| security and adversarial model |   0 |   0 |   0 | accepted |
| compatibility and release      |   0 |   0 |   0 | accepted |

Review roles were independent and read-only. No reviewer changed the normative
commit.

## Findings closed before freeze

The review rounds required and verified these corrections:

- criterion-specific Claim source-to-subject and historical Work authority;
- one shared wire-to-root normalizer with explicit causation and exact foreign
  digest encodings;
- typed content references, immutable content-resolution records and historical
  resolver rotation semantics;
- permanent relationship equivocation, typed root-basis traversal and aggregate
  anti-amplification caps across Claims, roots and identities;
- positive attestation thresholds, exact integer uncertainty and deterministic
  multidimensional status rules;
- criterion-specific Challenge authority, resolved bases, canonical same-group
  aggregation and reorder-stable causal cutoffs;
- policy-bound profile/quarantine keys and disjoint post-activation recovery;
- cryptographically protected snapshots, an external rollback anchor and
  historical Mesh ingress-to-verifier-to-proof validation;
- bounded pending expiry, legacy route rejection and a two-cohort Alpha 3/4
  release sentinel.

## Reproducible validation

The normative tree completed:

- `pnpm run check` with exit code zero, including clean build, public type
  checks, unit and adapter tests, legacy scenarios, release verification and
  tarball smoke;
- `pnpm run audit:public`, covering 770 public files with no secret or
  restricted-terminology finding;
- Prettier checks for every changed document;
- `git diff --check` and the repository pre-commit checks.

No production source, package manifest, lockfile or release version changed in
the design-freeze commit.

## Freeze decision

The Alpha 4 Evidence and Trust design is frozen for open-source implementation.
Implementation must follow the ordered increments and cannot weaken a closed
contract without a new documented review. All implementation, adversarial,
packaging, registry and publication items remain open in the acceptance
checklist until supported by reproducible evidence.
