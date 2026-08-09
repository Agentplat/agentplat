# Source capability attestation runbook V1

Status: release procedure for the frozen source-development baseline.

This procedure creates cryptographic evidence for exactly the 19 capabilities
in `agentplat-collective-capabilities-v1`. It does not change that denominator,
claim empirical performance or grant execution authority.

## Preconditions

- `pnpm run check` has passed on the candidate commit;
- `git status --porcelain=v1 --untracked-files=all` is empty;
- the release owner has assigned a stable issuer ID and key ID; and
- either an owner-controlled Ed25519 PKCS#8/SPKI key pair is available outside
  the repository, or an AWS KMS `ECC_NIST_EDWARDS25519` key with `SIGN_VERIFY`
  usage is available to the release role.

The tooling deliberately has no key-generation mode and never writes key
material. Release identity creation, access policy, rotation and revocation
belong to the release owner or its managed signing service.

## 1. Freeze the source snapshot

Create an output directory outside the repository and run:

```sh
pnpm run evidence:capability-source:snapshot -- \
  --output /absolute/evidence/path/source-snapshot.json
```

The command refuses a dirty repository, rejects submodules, binds `HEAD`,
hashes every tracked file, resolves the three evidence classes declared in
`config/collective-capability-evidence-v1.json` and emits 19 content-addressed
manifests. It checks the repository a second time after reading the files to
detect a moving worktree.

## 2. Issue the attestations

For an owner-controlled PEM key:

```sh
pnpm run evidence:capability-source:attest -- \
  --snapshot /absolute/evidence/path/source-snapshot.json \
  --output /absolute/evidence/path/source-attestation.json \
  --issuer-id YOUR_RELEASE_ISSUER \
  --key-id YOUR_RELEASE_KEY_ID \
  --private-key /secure/path/release-ed25519-private.pem \
  --public-key /secure/path/release-ed25519-public.pem
```

For AWS KMS, use the canonical KMS key as the attestation key identity. The
private key remains inside KMS; do not create a Secrets Manager copy.

```sh
pnpm run evidence:capability-source:attest -- \
  --snapshot /absolute/evidence/path/source-snapshot.json \
  --output /absolute/evidence/path/source-attestation.json \
  --issuer-id agentplat-release \
  --kms-key-id alias/agentplat-release-attestation-v1 \
  --aws-profile grishen \
  --aws-region us-east-1
```

The AWS identity needs only `kms:GetPublicKey` and `kms:Sign` for the selected
key. The tool rejects every key type except
`ECC_NIST_EDWARDS25519`, requires `SIGN_VERIFY`, signs the exact attestation
digest with `ED25519_SHA_512` and records the canonical key ID returned by KMS.

Before freezing a release, validate access and key configuration without
signing:

```sh
node scripts/collective-capability-evidence.mjs --mode kms-preflight \
  --kms-key-id alias/agentplat-release-attestation-v1 \
  --aws-profile grishen \
  --aws-region us-east-1
```

This creates one policy, 19 receipts and 19 detached Ed25519 attestations. The
tool immediately verifies every signature with the separately supplied public
key, resolves and re-hashes every source-tree entry, and stores the resulting
`development_complete` assessment. A mismatched key pair, catalog path,
manifest, receipt, source byte, commit or policy fails closed.

## 3. Export the public verification key

The KMS public key is not a secret. Export it as a PEM file alongside the
snapshot and attestation bundle, then publish those three files as release
assets. This gives independent reviewers a stable verification input without
granting them AWS credentials or KMS access.

```sh
pnpm run export:capability-source-kms-public-key -- \
  --output /absolute/evidence/path/agentplat-release-ed25519-public.pem \
  --kms-key-id alias/agentplat-release-attestation-v1 \
  --aws-profile grishen \
  --aws-region us-east-1
```

The command writes only a DER-SPKI public key encoded as PEM, refuses to write
inside the repository and fails if the target already exists. Record the
printed KMS key ID and public-key fingerprint in the release notes.

## 4. Verify with an external trust decision

Reviewers must obtain the expected issuer ID, key ID and public key through a
trusted channel rather than trusting the values embedded in the bundle.

```sh
pnpm run verify:capability-source-attestation -- \
  --bundle /absolute/evidence/path/source-attestation.json \
  --issuer-id EXPECTED_RELEASE_ISSUER \
  --key-id EXPECTED_RELEASE_KEY_ID \
  --public-key /trusted/path/release-ed25519-public.pem
```

Or verify against the public key independently resolved from KMS:

```sh
pnpm run verify:capability-source-attestation -- \
  --bundle /absolute/evidence/path/source-attestation.json \
  --issuer-id agentplat-release \
  --kms-key-id alias/agentplat-release-attestation-v1 \
  --aws-profile grishen \
  --aws-region us-east-1
```

Verification requires a clean checkout at the attested commit. It validates
the frozen baseline and evidence catalog, bundle and snapshot digests,
externally supplied trust binding, 19 signed receipts, complete source bytes
and the stored assessment.

## Interpretation

A successful result establishes source-development closure for the named
commit under the named release issuer. The assessment intentionally remains:

- `empiricalValidationStatus: pending`; and
- `executionPermitted: false`.

Provider installation, scenario execution, measured scale, operational
certification and deployment approval remain separate readiness obligations.
