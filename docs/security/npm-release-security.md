# npm Release Security Boundary

**Defines:** the mandatory security boundary for publishing AgentPlat packages
to npm. **Status:** implemented repository controls plus explicitly identified
external configuration.

## Security invariant

No CI job may make an AgentPlat package publicly installable. CI may only place
the exact reviewed tarballs into npm staged publishing. A maintainer who did not
initiate the release must normally review those staged bytes and approve them
with 2FA. The version-bound owner-approved exceptions below are the only exceptions to
independent npm deployment review; it does not waive byte review or 2FA.

The release uses one artifact set:

1. The unprivileged `prepare` job installs from the frozen lockfile, runs the
   public-surface and production-dependency audits, builds and verifies the
   selected release cohort.
2. `prepare-npm-release-artifacts.mjs` packs every package once, rejects unsafe
   archive entries, audits the extracted trees and records each size and SHA-512
   integrity in `npm-release-artifacts-v1.json`.
3. Consumer verification reads those same tarballs through
   `AGENTPLAT_PREPACKED_TARBALL_DIRECTORY`; it does not repack them.
4. The protected `stage` job downloads that artifact, recomputes every digest,
   checks the commit, cohort and tag, and calls `npm stage publish` using OIDC.
5. Staged packages remain private until a separate human approval with 2FA.

## Required GitHub configuration

The workflow file alone cannot create protected settings. Before enabling a
non-dry run, repository administrators must configure all of the following:

- Create the `npm-production` environment.
- Allow deployments only from the protected `main` branch.
- Require a reviewer other than the release initiator and prevent self-review.
- Store no npm write token in the environment, repository or organization.
- Require the `check` status and CODEOWNERS review for `main`. The standing
  owner exception below permits only `douglas-grishen` to bypass PR review.
  Other administrators and repository roles receive no blanket exception.
- Enable secret scanning and push protection.

If any requirement cannot be enforced, releases remain dry-run only.

## Required npm configuration

For every `@agentplat/*` package:

- Configure GitHub trusted publishing for organization `Agentplat`, repository
  `agentplat`, workflow `release.yml`, environment `npm-production`.
- Allow `npm stage publish` only. Disable direct `npm publish` permission for the
  trust relationship.
- Select **Require two-factor authentication and disallow tokens** for package
  publishing access.
- Remove the legacy `NPM_TOKEN` GitHub secret after all first-time package
  registrations are complete.
- Set the GitHub environment variable `AGENTPLAT_NPM_STAGE_ONLY_CONFIRMED=true`
  only after every package in the selected cohort has the stage-only trusted
  publisher above. The stage job fails closed while it is absent.

Staged publishing cannot create a package name. A new package therefore requires
one exceptional bootstrap performed from a clean machine with interactive 2FA.
Review the exact tarball and its SHA-512 first, publish only the initial version,
then immediately configure the stage-only trusted publisher and disallow tokens.
This exception must never be added to the automated workflow.

## Human review and approval

After a successful non-dry workflow:

1. Download the GitHub artifact named for the exact commit, scope and dist-tag.
2. Recompute SHA-512 for every tarball and compare it with
   `npm-release-artifacts-v1.json`.
3. Use `npm stage list`, `npm stage view` and `npm stage download` or the npm web
   interface to inspect every staged package.
4. Compare each staged download byte-for-byte with the GitHub artifact.
5. Approve with 2FA only after the whole cohort matches. Reject the cohort on
   any difference; never repair a staged release by changing a dist-tag.
6. Run **Verify approved npm release** with the originating release run ID,
   source commit, scope and dist-tag. It rejects registry bytes, signatures,
   provenance or tag state that does not match the prepared manifest, then runs
   the appropriate clean registry consumer before the release is announced.

## Prohibited package behavior

`verify-release.mjs` rejects package lifecycle hooks, bundled dependencies,
unapproved `files` entries, unreviewed executables, mutable tags and git, URL,
tarball, file or alias dependency sources. pnpm additionally blocks exotic
transitive sources and allows dependency build scripts only for the reviewed
entries in `pnpm-workspace.yaml`.

## Legacy staging-tag cleanup

Tags named `agentplat-stage-*` were public aliases from the retired release
process; they were never private staging. Inventory them before removal and
preserve `latest`, `next` and every package version. Removing an obsolete
dist-tag does not unpublish its version.

Use the cleanup tool in inventory mode first:

```sh
node scripts/npm-staging-tag-hygiene.mjs
```

The authenticated GitHub-side governance preflight must also pass:

```sh
pnpm run release:verify:governance
```

Review and archive the JSON output. Apply the exact reviewed plan only from an
interactive maintainer session with 2FA:

```sh
node scripts/npm-staging-tag-hygiene.mjs \
  --apply \
  --confirm REMOVE_AGENTPLAT_LEGACY_STAGING_TAGS
```

The tool targets only the fixed `agentplat-stage-` prefix and verifies that each
removed tag is absent. Never provide an automation token for cleanup.

## Owner-authorized Beta 7 review exception

On 2026-09-07, the owner explicitly authorized approving this release of his
own code. The exception is limited to `douglas-grishen`, `0.3.0-beta.7`, scope
`all` and tag `next`. It is not a standing self-review policy.

For this release only, `npm-production` has that single required reviewer,
`prevent_self_review=false`, protected-branch deployment and no administrator
bypass. The environment variables `AGENTPLAT_NPM_OWNER_REVIEW_VERSION` and
`AGENTPLAT_NPM_OWNER_REVIEW_LOGIN` bind the exception to that version and owner.
The stage script rejects any other version, scope, tag, initiator or rerun actor
while these flags are present. npm approval still requires the owner's 2FA.

The temporary Beta 7 PR-review exception was superseded by the standing owner
PR exception below. The Beta 7 npm environment exception remains release-specific:
after that release, restore independent environment review and remove both
owner-exception variables. Do not clear the variables while leaving self-review
enabled.

## Standing owner PR-review exception — 2026-09-11

The owner explicitly requested a permanent exception for his account.
`douglas-grishen` (GitHub user ID `207043696`) may use a `pull_request` bypass
on **Require review for contributors** (ruleset `20820479`). This permits
administrator integration through a PR without a separate approval; GitHub
still does not permit authors to submit an approval on their own PR.

The exception remains configured after integration. It is not limited to Beta 7
or Beta 8. The separate **Protect main** ruleset (`20819947`) has no bypass
actors and continues to require `check`. No direct-push/`always` bypass,
repository-role exception, npm environment self-review exception or npm 2FA
waiver is authorized by this PR policy. The governance verifier binds the
allowance to the exact user, mode and review ruleset.

## Owner-authorized Beta 8 review exception — 2026-09-12

The owner explicitly authorized self-review for `douglas-grishen`, version
`0.3.0-beta.8`, scope `all` (65 packages), and tag `next`. The existing helper
now binds the active exception to Beta 8, rejecting Beta 7 and other versions,
actors, scopes and tags. Historical Beta 7 evidence is unchanged.

For this release, `npm-production` retains the owner as its single required
reviewer with `prevent_self_review=false`, no administrator environment bypass,
and protected-main deployments. Set `AGENTPLAT_NPM_OWNER_REVIEW_VERSION` to
`0.3.0-beta.8` and `AGENTPLAT_NPM_OWNER_REVIEW_LOGIN` to `douglas-grishen`.
OIDC stage-only publishing, byte-for-byte review and npm 2FA remain required.
After publication, restore independent npm deployment review and remove both
exception variables. The standing owner PR-review exception remains configured.

Prepare a fresh artifact cohort from this approved source. Earlier Beta 8 dry
runs remain historical checks and must not be relabeled with the new commit.
