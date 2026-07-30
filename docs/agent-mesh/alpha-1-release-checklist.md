# Agent Mesh `0.3.0-alpha.1` release checklist

Status: released and independently verified.

This record separates reproducible public evidence from private release
authority. Release-environment gates are checked only after the corresponding
registry mutation or Git tag has been independently verified.

## Candidate

- version: `0.3.0-alpha.1`;
- distribution tag: `next`;
- Git tag: `v0.3.0-alpha.1`;
- protocol: `agentplat.mesh`;
- wire version: `0`;
- deterministic packed-consumer seed: `24301`;
- release commit: `32afe308fbb8945fabff21745e9f9baba5d31d3d`;
- publication timestamp: `2026-07-30T18:31:41Z`.

## Public preparation evidence

Verified on 2026-07-30: the complete `check` pipeline passed with 164 unit
tests, adapter regressions, 28 audited tarballs and 31 isolated public exports.

- [x] all 28 public manifests use the fixed candidate version;
- [x] frozen installation, public audit, build and type checks pass;
- [x] unit, adapter and compatibility regressions pass;
- [x] all 28 tarballs pass content audit and isolated export imports;
- [x] packed TypeScript declarations compile with library checking enabled;
- [x] the signed three-peer tarball consumer and deterministic replay pass;
- [x] the unchanged aggregate functional tarball consumer passes.

## Required release-environment gates

These gates run only from the reviewed commit on a clean `main` checkout:

- [x] supply the non-empty external terminology denylist;
- [x] authenticate the approved npm publisher or Trusted Publishing workflow;
- [x] run the no-mutation publish dry run with `NPM_DIST_TAG=next`;
- [x] confirm `0.3.0-alpha.1` remains absent or has authenticated, equivalent
      package contents for every package;
- [x] record the clean release commit and current rollback targets;
- [x] publish missing packages under the commit-specific staging tag;
- [x] verify SHA-512 registry integrity for all 28 packages;
- [x] promote the complete package set to `next`;
- [x] remove all candidate staging tags only after promotion succeeds;
- [x] validate one independent clean consumer from npm;
- [x] create and push `v0.3.0-alpha.1` at the verified commit.

## Release evidence

The
[successful release workflow](https://github.com/Agentplat/agentplat/actions/runs/30570310896)
ran from the release commit and included the exact-version clean registry
consumer. A separate post-workflow registry query confirmed:

- all 28 cataloged packages expose `0.3.0-alpha.1` with SHA-512 integrity;
- all 28 packages point `next` to `0.3.0-alpha.1`;
- no candidate staging tag remains on any package;
- the four newly introduced Mesh packages retain npm's automatically assigned
  `latest` tag at `0.3.0-alpha.1`;
- `v0.3.0-alpha.1` resolves to the release commit.

## Rollback baseline

Registry state observed on 2026-07-30 before candidate publication:

- the 24 previously published packages in the public catalog pointed `next` to
  `0.2.0-beta.11`;
- `@agentplat/mesh`, `@agentplat/mesh-crypto`,
  `@agentplat/mesh-protocol` and `@agentplat/mesh-sim` did not yet exist in the
  registry and therefore had no previous `next` target.

If promotion fails after registry upload, do not overwrite an immutable
version. Restore `next` to `0.2.0-beta.11` on the 24 existing packages and
remove `next` from newly introduced packages when appropriate. A first package
publication may retain an npm-assigned `latest` tag because npm does not allow
removing the only version's `latest`. Code corrections require a new
prerelease version.
