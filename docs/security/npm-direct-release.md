# Release-level OIDC publication (prepared, not activated)

The owner requested preparation of this alternative after interactive staged
approval failed to reuse a passkey across the coordinated package cohort.
This document is the reviewable activation proposal. No npm publisher permissions,
GitHub environments or enablement variables are changed by merging the code.

## Change in authority

The existing `release.yml` / `npm-production` relationship remains stage-only.
A separate `release-direct.yml` / `npm-release` relationship would allow public
publication from CI after one protected deployment approval for the exact release.
The package registry would no longer require a separate passkey approval for
each package through this relationship. Account 2FA stays enabled; no long-lived
npm token is created. This deliberately changes the current security boundary:
trusted CI becomes able to publish publicly after release-level authorization.
A compromise of that authorized workflow/environment is therefore a publication
risk; it must not be described as equivalent to per-package human approval.

## Execution and checks

1. Manual dispatch is restricted to the owner's immutable GitHub identity, both
   initial actor and rerun actor, on `main`. Dry-run is the default. Non-dry runs
   also require the repository enablement flag.
2. An unprivileged job installs the frozen lockfile, performs the public and
   dependency audits, builds, tests and checks the selected release scope. Full
   scope retains the existing complete checks, PostgreSQL faults, soak and adapter
   benchmark. The exact packed tarballs are independently consumed before upload.
3. `npm-release` gates publication once for the whole prepared artifact. The owner
   may approve his own requested release, following the standing owner policy;
   no second person is required. Other accounts cannot initiate this profile.
4. The OIDC job installs no project dependencies and executes no build. It verifies
   the source commit, version, cohort, sizes, SHA-512, package identity and absence
   of lifecycle hooks for EVERY archive before publishing any. It refuses symlinks
   and extra or missing files. npm runs from an isolated directory with user/global
   configuration disabled, explicit public registry, `--ignore-scripts` and
   `--provenance`. Only the previously verified tarballs are passed to npm.
5. Existing versions are skipped only when their actual downloaded bytes, registry
   ECDSA signature, distribution tag, workflow provenance and source commit match
   this exact release. Any disagreement or registry uncertainty stops before new
   publication. Dependencies are published first, using the existing topological
   package ordering. A command failure stops before dependent packages.
6. Read-only verification checks public registry bytes, ECDSA signatures, provenance
   fields and tags, then exercises clean pnpm/npm consumers (including the durable
   PostgreSQL profile and Node 22). These results are required before announcing
   a completed release. Provenance fields come from npm's attestation endpoint;
   this verifier is not an independent implementation of Sigstore certificate /
   transparency-log verification.

npm has no atomic transaction spanning 65 packages. A network failure can leave
part of a cohort public. Rerun the SAME original workflow/commit/artifact; the
publisher verifies existing versions rather than rebuilding, republishing or
silently repairing tags. A mismatched existing version requires investigation.
The progress report is diagnostic; registry evidence determines resume behavior.

## Activation proposal — requires owner's final authorization

After the reviewed code is integrated and required CI passes:

- Create `npm-release` with administrator bypass disabled and exactly GitHub user
  `douglas-grishen` (ID `207043696`) as reviewer; allow that owner to approve his own
  release. Use **selected branches and tags**, with exactly one **branch** rule
  named `main`. Do not use a wildcard or a tag rule. The workflow additionally
  requires GitHub to report `main` as protected.
- For each of the 65 already-existing npm packages, add a trusted publisher tied
  to organization `Agentplat`, repository `agentplat`, workflow filename
  `release-direct.yml`, environment `npm-release`, with direct `npm publish`
  permission. Retain the original stage-only publisher as a separate relationship.
  Verify the actual package settings; do not assume that saving a name validates
  the relationship. This initial setup may require npm account authentication.
- Only after those relationships are checked, set the environment variable
  `AGENTPLAT_NPM_DIRECT_PUBLISH_CONFIRMED=true` in `npm-release`.
- Enable last: set repository variable `AGENTPLAT_NPM_DIRECT_RELEASE_ENABLED=true`.
  Run `AGENTPLAT_NPM_RELEASE_MODE=direct node scripts/verify-npm-release-governance.mjs`
  using the authenticated maintainer CLI. It checks the owner, exact main-only
  deployment rule, enablement flags and existing main/Actions protections.
- Prepare a fresh coordinated version and run a dry-run first. Then dispatch the
  same reviewed main source with `dry_run=false`, tag `next`, scope `all`.
  After preparation passes, approve the one environment deployment, or use
  `node scripts/approve-owner-npm-release.mjs RUN_ID --direct` on the owner's
  behalf. It refuses foreign original/rerun actors, failed preparation, another
  workflow, disabled flags or a different environment.

The flags are not proof of npm permissions: a maintainer must verify the package
publisher settings. Only npm's actual OIDC exchange can establish the final
provider configuration works. That live test has not been performed for this
prepared profile, and cannot be claimed from fixture tests.

## Existing beta.9 and migration

Beta.9 is already partially public, and other beta.9 versions remain staged.
Staged and public versions share npm's version uniqueness constraint. The new
publisher must not overwrite them, automatically reject staging, unpublish a
version or move old tags to disguise this partial release.

Use a fresh coordinated version, proposed `0.3.0-beta.10`, after checking current
registry availability. Bump all package manifests through the existing version
script, add the supported release-line entry, regenerate/verify the lockfile if
needed, and produce a NEW manifest from the approved source. No such version
bump or publication is included in this preparation change. Historical paper
and beta.9 artifacts keep their original source references. Handling leftover
private staging is a separate, explicitly authorized cleanup.

## Disable / rollback

Set `AGENTPLAT_NPM_DIRECT_RELEASE_ENABLED=false` to block new direct runs. Cancel
any still-running publication separately: changing a variable cannot undo a job
already underway. Revoke the `release-direct.yml` publisher relationships if
required. Already-public npm versions are immutable and are not rolled back.
The legacy staged workflow remains available for a separately prepared cohort.

## Validation and sources

Tests cover disabled flags, foreign actors/workflows/branches, incomplete archives,
changed bytes, lifecycle scripts, symlinks, dependency order/cycles, publication
failure, exact reruns and altered signatures/provenance/tags. Simulated publisher
calls never contact npm for writes. The cryptographic byte/signature reader was
also checked read-only against already-public beta.9 packages.

- [npm trusted publishing and allowed actions](https://docs.npmjs.com/trusted-publishers/)
- [npm staged publishing](https://docs.npmjs.com/staged-publishing/)
- [npm registry signature format](https://docs.npmjs.com/about-registry-signatures/)
