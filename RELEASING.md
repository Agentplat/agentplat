# Releasing AgentPlat packages

AgentPlat uses one exact version for every publishable package in
`config/public-packages.json`. The current candidate is
`0.3.0-beta.8` across 65 packages, targeting **`next`**. It is not a stable
release, and the tooling rejects preparing a prerelease for `latest`.

The [npm release security boundary](docs/security/npm-release-security.md) is
mandatory. Public staging tags from the legacy publisher are not private
staging. The supported path prepares immutable tarballs, stages those exact
bytes through OIDC, and requires separate maintainer review with 2FA.

## Check public distribution first

```sh
corepack pnpm run verify:npm-distribution -- --output /tmp/agentplat-distribution.json
```

The read-only report distinguishes unregistered names, missing versions,
misaligned tags, unresolved internal dependencies and unavailable registry
reads. Use `--require-complete` after approval. This checks metadata; the clean
registry consumers must also execute successfully.

Beta 7 was published as the complete 65-package cohort on 2026-09-09.
Beta 8 requires a fresh immutable version for the reconciliation changes.
The [Beta 7 distribution record](docs/releases/beta7-distribution-20260909.md)
and [historical recovery runbook](docs/releases/npm-distribution-recovery.md)
preserve the earlier partial Beta 6 publication and its resolution.

## Prepare reviewed source

Requirements: Node.js 24.20.0 in CI, Corepack with the repository-pinned pnpm,
and npm >=11.15.0 for staged publishing. Local source development requires
Node.js 22.13+; npm staged publishing additionally requires Node.js 22.14+.

Use a clean source commit. Preserve unrelated work and review the release diff
before merging it into protected `main`. The release-line guard retains historical cohorts and admits the complete
65-package Beta 8 cohort, including A2A and Agent Registry. Beta 7 is already
published. The security boundary records the owner-authorized Beta 8 exception, limited
to this version, scope all and tag next. It retains tarball review and npm 2FA.

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm run check
corepack pnpm run verify:adoption-docs
```

Provide `AGENTPLAT_PUBLIC_DENYLIST_FILE` as the path to the real, non-empty
terminology denylist outside the checkout. Never invent a placeholder list or
copy its terms into the repository. In GitHub, the prepare job obtains it from
the `AGENTPLAT_PUBLIC_DENYLIST` secret without exposing its contents.

```sh
corepack pnpm run audit:public:release
NPM_PACKAGE_SCOPE=all NPM_DIST_TAG=next corepack pnpm run release:prepare
```

`release-artifacts` must start empty. The resulting
`npm-release-artifacts-v1.json` binds source commit, cohort, tag, tarball sizes
and SHA-512 digests. Verify that exact set without repacking:

```sh
AGENTPLAT_PREPACKED_TARBALL_DIRECTORY=release-artifacts corepack pnpm run verify:pack
```

The full consumer audits extracted files, imports package exports independently,
compiles public declarations and exercises the existing functional scenarios.
A tarball built from a dirty working tree is not an approved release artifact.

## Existing package cohort

All 65 package names already exist from the verified Beta 7 publication.
Beta 8 does not need a bootstrap publication. If the distribution check reports
an unregistered name, investigate the catalog or registry access before staging.
Do not reuse the historical Beta 6 bootstrap instructions for this candidate.

## Stage the complete candidate

Before a non-dry run, validate repository governance and complete the npm
settings listed in the security boundary:

```sh
corepack pnpm run release:verify:governance
```

Run the GitHub **Release packages** workflow from protected `main`, choosing:

- `scope=all` (the partial `public-consumer` scope cannot complete this release);
- `dist_tag=next`;
- `dry_run=true` first, then `false` only once all required configuration passes.

The protected stage job requires OIDC and the confirmed stage-only publisher;
it rejects npm write tokens. Local `release:publish` is not a shortcut around
that boundary. Neither staging nor workflow success means the release is public.

## Approve, verify and announce

A maintainer reviews the whole staged cohort against the originating
GitHub artifact, downloads staged bytes and compares hashes before approving
with 2FA. The owner-authorized Beta 8 exception permits douglas-grishen to
review this release, with the exact environment flags documented in the security
boundary. Then run **Verify approved npm
release** with the originating run ID,
exact source commit, `scope=all` and `dist_tag=next`. Keep that reviewed release
commit at `main` HEAD until verification finishes. The verifier executes only
the trusted `main` checkout and rejects a supplied commit that differs; it never
checks out code selected by workflow input.

```sh
corepack pnpm run verify:npm-distribution -- --require-complete
corepack pnpm run verify:registry-consumer
```

The approval verifier checks integrity, registry signatures, provenance and tag
state before running exact-version registry consumers. Announce only when all
65 packages and checks pass. Update the maturity matrix with dated observations
and preserve historical evidence. Do not equate publication with production
readiness or external developer validation.

A Git release tag and any stable `latest` promotion are separate release-owner
steps after verification. Do not announce an incomplete cohort or repair byte
mismatches by changing a tag.

## Evidence and historical references

For a release claiming frozen collective source-development closure, follow
the [source attestation runbook](docs/collective-runtime/source-attestation-runbook-v1.md)
and attach its source snapshot, signed attestation and public key. These are
separate from npm provenance and do not establish empirical validation.

[Release channels](docs/release-channels.md),
[historical Alpha 4 acceptance](docs/trust/alpha-4-acceptance-checklist.md), and
[legacy staging-tag cleanup](docs/security/npm-release-security.md#legacy-staging-tag-cleanup)
remain available. Preserve `latest`, `next` and package versions during cleanup.
