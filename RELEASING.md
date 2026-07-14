# Releasing AgentPlat packages

AgentPlat uses a fixed version: every public package is released with the same
semantic version. The initial developer-preview release is `0.1.0`.

## Prepare a version

```sh
corepack pnpm version:set 0.1.0
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
corepack pnpm run release:publish
git tag v0.1.0
git push origin v0.1.0
```

Alternatively, configure an `NPM_TOKEN` repository secret and run the manual
`Release packages` GitHub Actions workflow. Never commit an npm token or place it
in package metadata.
