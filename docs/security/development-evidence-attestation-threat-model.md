# Development evidence attestation threat model

## Protected claims

- source-development closure for one exact commit and source tree;
- the policy-approved public-surface, integration-boundary and threat-model
  manifests for each capability;
- issuer and signing-key provenance; and
- separation between source evidence, empirical validation and execution
  authority.

## Trust boundaries

The policy author decides which manifest digest and issuer/key may attest each
capability. The metadata resolver returns the requested content-addressed
manifest and current issuer record. A separate artifact resolver returns the
complete ordered source-tree snapshot and exact bytes for each entry. The
assessor independently recomputes the tree and file digests. The concrete,
construction-bound Web Crypto verifier resolves the public key and performs
Ed25519 verification internally; the assessment path rejects structural or
caller-authored boolean verifiers. A valid signature authenticates the
attestation; it does not establish empirical performance or grant execution
authority.

## Threats and mitigations

| Threat                                       | Mitigation                                                                                                                         |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Caller supplies arbitrary well-formed hashes | Every evidence digest must occur in the verified source tree, and every tree entry is rehashed from exact resolved bytes.          |
| Receipt is replayed for another revision     | Policy, receipt and manifest bind the exact source commit and independently recomputed source-tree digest.                         |
| Issuer or key substitution                   | Policy binds capability, manifest, issuer and key; resolved issuer and proof must match all four bindings.                         |
| Manifest substitution                        | Content-addressed manifest validation and exact authorization-digest equality fail closed.                                         |
| Forged or altered attestation                | Canonical attestation digest and concrete Web Crypto Ed25519 verification cover the complete receipt and issuer binding.           |
| Verifier returns caller-authored success     | Closure accepts only a verifier instance carrying the library-owned construction binding; the internal verifier ignores overrides. |
| Resolver returns altered source bytes        | Exact byte length and raw SHA-256 are checked for every ordered source-tree entry before attestations are evaluated.               |
| Signature is treated as evaluation           | Assessment fixes `empiricalValidationStatus` to `pending`.                                                                         |
| Source closure grants action authority       | Assessment fixes `executionPermitted` to `false`; no execution port exists in this entry point.                                    |

## Residual risks

A compromised authorized issuer can sign a false interpretation of correctly
hashed source, and a malicious policy author can authorize irrelevant files.
The artifact resolver must read the frozen revision identified by the commit;
the portable package verifies its returned bytes but cannot prove that an
external VCS or release service served the intended repository. Repository
governance, reviewer independence, reproducible checkout and key custody remain
deployment responsibilities. Source attestations do not replace scenario
execution, measured outcomes or operational certification.

The repository release tool narrows these residual risks by refusing a dirty
worktree, checking the commit again after reading the tracked files, rejecting
submodules and requiring snapshot/bundle outputs outside the repository. It has
no key-generation mode. Attestation requires a separately supplied PKCS#8
private key and SPKI public key; verification requires the reviewer to supply
the expected issuer ID, key ID and public key through an external trust
decision. The bundle's issuer metadata and key fingerprint are evidence, not a
self-authorizing trust root.

The AWS KMS signer mode accepts only an `ECC_NIST_EDWARDS25519` key with
`SIGN_VERIFY` usage and `ED25519_SHA_512` signing support. It resolves the
public key and canonical KMS key ID before signing, and binds every signature
request to that ID. This keeps the private release key non-exportable. KMS IAM
and key policies must still restrict `kms:Sign` and `kms:GetPublicKey` to the
release role and produce an auditable signing trail.
