# Releasing AgentPlat packages

AgentPlat uses a fixed version: every public package is released with the same
semantic version. Prereleases use the same fixed version and an npm distribution
tag other than `latest`.

## Prepare a version

```sh
corepack pnpm version:set 0.2.0-beta.9
corepack pnpm install
corepack pnpm run check
```

Commit the version and release notes before publishing. `verify:release` rejects
mixed package versions and `verify:pack` installs the exact tarballs in a clean,
isolated consumer project.

## Publish

The `@agentplat` npm organization must exist and the publisher must have access
to it. Authenticate with npm, then publish from a clean `main` checkout:

```sh
npm whoami
corepack pnpm run release:publish:next
git tag v0.2.0-beta.9
git push origin v0.2.0-beta.9
```

Stable releases use `release:publish`, whose default distribution tag is
`latest`. The release script rejects publishing a prerelease under `latest`.

Alternatively, configure the npm organization and run the manual `Release
packages` GitHub Actions workflow with the intended distribution tag. After the
first publication, configure npm Trusted Publishing for the workflow and remove
long-lived publishing tokens. Never commit a token or place it in package
metadata.
