# Agent Mesh `0.3.0-alpha.1` release checklist

Status: release candidate prepared; registry promotion pending.

This record separates reproducible public evidence from private release
authority. A checked preparation gate does not imply that a registry mutation
or Git tag has occurred.

## Candidate

- version: `0.3.0-alpha.1`;
- distribution tag: `next`;
- Git tag after verification: `v0.3.0-alpha.1`;
- protocol: `agentplat.mesh`;
- wire version: `0`;
- deterministic packed-consumer seed: `24301`;
- release commit: record the reviewed `main` commit before dry run;
- publication timestamp: record after registry verification.

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

- [ ] supply the non-empty external terminology denylist;
- [ ] authenticate the approved npm publisher or Trusted Publishing workflow;
- [ ] run the no-mutation publish dry run with `NPM_DIST_TAG=next`;
- [ ] confirm `0.3.0-alpha.1` remains absent or has authenticated, equivalent
      package contents for every package;
- [ ] record the clean release commit and current rollback targets;
- [ ] publish missing packages under the commit-specific staging tag;
- [ ] verify SHA-512 registry integrity for all 28 packages;
- [ ] promote the complete package set to `next`;
- [ ] remove all candidate staging tags only after promotion succeeds;
- [ ] validate one independent clean consumer from npm;
- [ ] create and push `v0.3.0-alpha.1` at the verified commit.

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
