# Collective Trust Consensus V1 threat model

## Protected assets

- exact subject, scope, policy, profile and evidence-set bindings;
- uniqueness and continuity of one certified decision chain;
- validator membership and witness identity for every decision;
- local Trust autonomy when remote peers disagree or are compromised;
- fail-closed consumption by Mesh, planning, role and inference boundaries;
- confidentiality of evidence content and model context.

## Trust and fault assumptions

Collective Agreement runs with exactly `n = 3f + 1` validators and at most `f`
Byzantine validators. At least `2f + 1` validator repositories preserve vote and
lock invariants. Key resolution, membership resolution and cryptographic
primitives behave as documented.

Each correct validator trusts its own Evidence/Trust state, policy registry,
candidate resolver and predecessor resolver. Correct validators may have
different partial evidence. Safety does not require them to accept a proposal;
liveness requires enough correct validators to accept the same candidate after
eventual evidence convergence.

## Boundary controls

| Threat                                  | Control                                                                               | Failure behavior                                          |
| --------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Candidate digest substitution           | Canonical closed candidate and recomputed digest-derived ID                           | Reject before semantic evaluation                         |
| Subject, scope or policy confusion      | Every candidate and certificate binds exact digests and tenant                        | Reject cross-boundary candidate                           |
| Proposer fabricates local evidence      | Peer-local resolver checks the exact profile, fusion input and eligibility projection | Correct validator abstains                                |
| Raw evidence disclosure                 | Agreement payload contains only identifiers, digests, disposition and logical times   | Reject unknown or oversized fields                        |
| Correlated or duplicated evidence       | Trust fusion dependency-group caps produce the bound input-set digest                 | Candidate remains unavailable or restricted               |
| Byzantine validators certify a fork     | `2f + 1` signed precommit under one `3f + 1` membership and durable locks             | Reject invalid or conflicting commit                      |
| Stale certificate replay                | Validity window, current head and dual predecessor chains                             | Reject expired or non-head decision                       |
| Membership substitution                 | Epoch and configuration digest in commit and derived decision                         | Fail closed without exact membership                      |
| Unsafe membership change                | Existing joint reconfiguration certificate                                            | Do not activate one-sided transition                      |
| Collective decision widens local access | Effective gate takes the stricter local/collective result                             | Local restriction remains effective                       |
| Recovery bypass                         | `recovery_candidate` is non-eligible until separate local recovery succeeds           | Keep subject restricted                                   |
| Missing collective state                | Configurable certificate-required policy defaults protected flows to unavailable      | Do not return an eligible decision                        |
| Repository head rewrite                 | CAS head, predecessor binding and deterministic reconstruction from commit            | Reject conflict or rebuild from source commit             |
| Proposer or witness equivocation        | Existing signed vote equivocation proofs map to Trust evidence                        | Reject fork; retain attributable evidence                 |
| More than `f` compromised validators    | Outside the safety assumption                                                         | Documented residual risk; local restriction still applies |

## Safety properties

1. Two conflicting valid collective decisions cannot derive from one agreement
   slot and height while the Collective Agreement fault threshold holds.
2. A certified `eligible` decision cannot turn a locally restricted,
   quarantined or unavailable subject into an eligible consumer result.
3. A candidate cannot be certified by a correct validator unless its local
   semantic resolver accepts the exact content-free bindings.
4. Repository state cannot create a certificate; it can only retain or index a
   decision reconstructible from a verified commit.
5. No agreement artifact carries raw Evidence content or execution authority.

## Residual risks and non-goals

- More than `f` Byzantine validators may certify an undesirable candidate.
- Uniformly poisoned but structurally valid evidence may mislead every local
  Trust resolver; consensus does not establish factual truth.
- Denial of service, partitions or incompatible local evidence may prevent
  progress.
- Traffic analysis can reveal that a subject is under review even though
  evidence content is omitted.
- Key custody, validator admission, tenant authentication and network admission
  remain deployment responsibilities.
- V1 does not attempt confidential consensus, zero-knowledge evidence proofs,
  aggregate signatures or universal identity.

## Required verification

- a valid candidate commits and derives the same certified decision on replay;
- four of seven validators cannot manufacture a decision;
- a forged candidate, profile, input-set, policy or predecessor binding fails;
- expired, stale-head and wrong-membership decisions fail closed;
- a stricter local disposition always wins over collective `eligible`;
- collective `restricted` or `quarantined` blocks a locally eligible subject;
- `recovery_candidate` cannot directly restore eligibility;
- duplicate repository save is idempotent and conflicting head update fails;
- restart reconstructs the exact decision from durable commit plus candidate;
- semantic fallback rejects unsupported values without weakening other adapters;
- package-root imports and existing protocol fixtures remain compatible; and
- public audit finds no secret or restricted terminology.
