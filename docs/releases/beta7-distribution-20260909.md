# Beta 7 distribution record — 2026-09-09

All 65 packages in the public catalog were published at `0.3.0-beta.7` with
the `next` tag. Stable `latest` was not promoted.

## Source and immutable artifacts

- Published source: `b7a2a565644550a3b1a1b927eafa664595c219e8`.
- [Preparation and OIDC staging run](https://github.com/Agentplat/agentplat/actions/runs/34386287857): successful.
- Manifest digest: `sha256-IC7G3lj74QAwddoBWDNK/xUZQ7lhr4CV7wsKTX7b2Kg=`.
- All 65 staged tarballs were downloaded and compared byte for byte with the
  originating GitHub artifacts before approval with the owner's 2FA.
- Public registry inspection confirmed 65 versions and 65 aligned `next` tags.

## Verification and tooling correction

The [approved-release verification run](https://github.com/Agentplat/agentplat/actions/runs/34394075544)
passed the registry integrity, signature, provenance and tag checks and the
complete distribution check. The consumer step then failed before installation
because its fixed package list still contained 62 entries. It omitted A2A and
both Agent Registry packages. The workflow as a whole is **not recorded as
passing**.

With that list corrected and a regression assertion binding it to the public
catalog, three independent clean consumers installed exact versions from npm
and verified all 65 packages and 216 export subpaths:

| Consumer | Observed result |
| --- | --- |
| pnpm portable, Node 24.14.0 | Passed imports, declarations and functional scenarios |
| pnpm PostgreSQL, PostgreSQL 16 | Passed; 14 durable conformance cases |
| npm portable, Node 22.22.0 | Passed imports and functional scenarios |

The corrected harness also passed its five unit tests. These consumer results
were obtained locally, separately from the failed CI consumer step. The
correction changes verification tooling, not the immutable published packages.

## Evidence boundary

This record establishes package distribution and bounded consumer behavior.
It does not establish production-scale empirical validation, external adopter
validation, or a new collective capability baseline. Historical observations
and the frozen baseline remain unchanged. Tags are mutable; verify exact
versions and current registry evidence when adopting the packages.
