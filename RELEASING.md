# Releasing AgentPlat packages

AgentPlat uses a fixed version: every public package is released with the same
semantic version. Prereleases use the same fixed version and an npm distribution
tag other than `latest`.

`config/public-packages.json` is the intentional publication allowlist.
Versioning, release verification, tarball smoke tests and publishing consume
that catalog. A package directory that is absent from the catalog fails release
verification rather than becoming publishable implicitly.

## Prepare a version

```sh
corepack pnpm version:set 0.3.0-alpha.3
corepack pnpm install
corepack pnpm run check
```

Commit the version and release notes before publishing. `verify:release` rejects
mixed package versions and `verify:pack` installs the exact tarballs in clean,
isolated, non-hoisted package consumers. Pack verification audits the extracted
contents of every tarball, requires internal SemVer ranges that include the
coordinated packed version, imports every declared package export independently,
compiles TypeScript consumers against the packed declarations and runs the
signed three-peer Mesh scenario, the dedicated inference-control scenario over
all five public entrypoints and the unchanged aggregate functional consumer
smoke test.

Every release also requires a non-empty terminology denylist stored outside the
checkout:

```sh
export AGENTPLAT_PUBLIC_DENYLIST_FILE=/absolute/path/to/terms.txt
corepack pnpm run audit:public:release
```

The GitHub release workflow reads the same content from the
`AGENTPLAT_PUBLIC_DENYLIST` repository secret and writes it only to the runner's
temporary directory.

Inference Control Alpha 3 is coordinated across exactly 29 packages. Its
contracts and additional compatibility gates are documented in
`docs/inference-control/alpha-3-implementation-plan.md` and
`docs/inference-control/alpha-3-acceptance-checklist.md`.

## Publish

The `@agentplat` npm organization must exist and the publisher must have access
to it. Authenticate with npm, then publish from a clean `main` checkout:

```sh
npm whoami
corepack pnpm run release:publish:next
corepack pnpm run verify:registry-consumer
git tag v0.3.0-alpha.3
git push public v0.3.0-alpha.3
```

Do not create the Git tag if the exact-version registry consumer fails. The
consumer pins the installer to the public registry, uses a fresh package store,
ignores install scripts, and exposes neither credentials nor host npm
configuration to downloaded code. It compiles the declarations, replays the
signed three-peer scenario and exercises the inference-control exact-version
consumer before the release commit is tagged.

Stable releases use `release:publish`, whose default distribution tag is
`latest`. The release script rejects publishing a prerelease under `latest` and
publishes only packages declared by the public catalog.

Before the first registry mutation, the publisher:

1. audits the complete checkout;
2. packs every package in dependency order;
3. computes each tarball's SHA-512 integrity;
4. checks every version already present in the registry.

Missing versions are uploaded under a commit-specific staging tag. A retry
pins both global and `@agentplat` scope operations to the public npm registry,
then compares registry and local tarball SHA-512 integrity. If archive bytes
differ, the publisher downloads the registry artifact, verifies it against
npm's advertised SHA-512, audits its extracted contents and compares the full
package tree, with every file other than `package.json` checked byte-for-byte.
JSON object key order in `package.json` is canonicalized with strict duplicate
key and exact numeric-token handling; extra files, links, permission modes or
any other content difference fail closed. The requested distribution tag is
applied only after every cataloged package is present and verified. A failed
final tag promotion or staging cleanup is safe to retry. All staging tags that
point at the promoted version are removed afterward, and cleanup failure keeps
the release workflow red.

Missing packages are uploaded in dependency order without waiting for each
individual name to propagate. The final verification polls the public registry
with online-preferred reads and one shared ten-minute deadline for the batch,
allowing independent package visibility to converge in parallel before any
final tag is promoted.

Exercise the same packing, ordering and registry-integrity preflight without
uploading or changing tags:

```sh
NPM_PUBLISH_DRY_RUN=1 NPM_DIST_TAG=next \
  corepack pnpm run release:publish
```

npm may assign `latest` automatically when a package name is published for the
first time, even when an explicit staging tag is supplied. Treat a first
publication as a coordinated maintenance window; subsequent releases do not
move their final tag until the full set is verified.

Alternatively, configure the npm organization and run the manual `Release
packages` GitHub Actions workflow with the intended distribution tag. After the
first publication, configure npm Trusted Publishing for the workflow and remove
long-lived publishing tokens. Never commit a token or place it in package
metadata.

The Alpha 3 promotion state, evidence and rollback baseline are recorded in the
[Alpha 3 acceptance checklist](./docs/inference-control/alpha-3-acceptance-checklist.md).
