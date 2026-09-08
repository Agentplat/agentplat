# npm distribution recovery

Status: **Beta 7 candidate preparation; public release incomplete**.

## Observed starting point

Public registry queries on 2026-09-07 found 56 of 62 cataloged package names.
Those 56 used `next=0.3.0-beta.5`; 19 had an immutable Beta 6 version.
Default installation of framework selected `0.2.0-beta.1`, which lacks the
current `AgentPlat.ask` and `AgentPlat.configure` APIs. An external Beta 5
`next` consumer installed and executed a deterministic run successfully.

Missing names:

- `@agentplat/autonomy`
- `@agentplat/autonomy-postgres`
- `@agentplat/workflows-conformance`
- `@agentplat/workflows-postgres`
- `@agentplat/workflows-rooms`
- `@agentplat/workflows-temporal`

Authenticated, SHA-512-checked registry tarballs were compared with local Beta 6
tarballs using the existing strict package-tree comparator. Core and Rooms
matched; workflows differed in README contents. Therefore the current source
cannot complete Beta 6 without an immutable-version conflict. Candidate Beta 7
is selected for the full cohort; it is not represented as already published.

## Ordered recovery

1. Preserve a clean Beta 6 source snapshot for reviewed initial registration of
   the six names. Require the real external terminology denylist, audit and
   manifest-bound bootstrap tarballs. Publish only those previously unregistered
   names interactively with 2FA. Do not publish existing Beta 6 names again.
2. Configure each new name for stage-only OIDC publishing, disallow tokens and
   verify the independent-review GitHub environment. Resolve all governance
   findings without weakening the security boundary.
3. Build and verify a clean Beta 7 release commit containing all 62 package
   versions and the required release/adoption changes. Run the full release
   workflow with `scope=all`, first as a dry run.
4. Stage the exact Beta 7 artifacts, review and approve with 2FA, and run the
   approved-release verification against the originating source commit.
5. Require 62/62 exact versions, aligned `next` tags, matching bytes/provenance,
   resolvable dependencies and passing clean consumers before announcing.

Bootstrap Beta 6 versions are registration artifacts, not proof that the full
Beta 6 cohort is coherent. They cannot satisfy the final Beta 7 provenance check.
The clean Beta 7 artifact set is built separately after all names are registered.

## Preconditions observed during preparation

- The owner has multiple npm accounts. The isolated login must not be used for
  publishing until the owner supplies the exact expected npm username and the
  identity check matches it. GitHub identity does not establish npm identity.
- Initial GitHub governance failed. The owner subsequently authorized a single
  self-reviewed Beta 7 release. Preparation configures the protected owner-review
  environment, SHA-pinned Actions and CODEOWNERS review, and replaces the permanent
  bypass with a temporary PR-only owner exception while an independent ruleset
  continues requiring `check`. Remove the temporary exception after the PR merge.
- The legacy `NPM_TOKEN` cannot be removed until initial package registrations
  and stage-only trusted publishing are complete. The stage-only confirmation
  remains unset until the actual npm settings are verified.
- The `AGENTPLAT_PUBLIC_DENYLIST` GitHub secret exists. Its contents were not
  retrieved; local preparation still needs the actual external file, or the
  audited preparation must run in GitHub from the reviewed main commit.
- npm staged publishing requires an existing name and explicit 2FA approval;
  neither can be replaced by source tests or a successful tarball build.

The local source version and publication workflows remain a candidate until
these prerequisites and the post-publication checks pass. Keep the goal open.

## Reproduce and retain evidence

```sh
corepack pnpm run verify:npm-distribution -- --version 0.3.0-beta.7 --output /tmp/agentplat-beta7-readiness.json
corepack pnpm run release:verify:governance
```

Retain the read-only inventory, approved artifact manifest, source commit,
workflow run ID and final registry consumer logs outside mutable source claims.
See [RELEASING.md](../../RELEASING.md) and the
[security boundary](../security/npm-release-security.md).

## Bind the intended npm account

Ask the owner for the exact npm username; never infer it from GitHub, a browser
profile or an already-open npm session. Use a dedicated userconfig outside the
repository and verify the identity immediately before any bootstrap operation:

```sh
node scripts/verify-npm-publisher-identity.mjs --expected-user "$EXPECTED_NPM_USER" --userconfig "$NPM_MAINTAINER_USERCONFIG"
```

The guard requires both explicit values and fails if `npm whoami` differs.
Then separately verify access to `@agentplat` before publishing. Identity match
alone is not proof of organization permissions or artifact approval. A login
session by itself is not authorization to use that account.
