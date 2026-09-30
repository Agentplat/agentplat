# Coordinated delivery and publication plan

Publication was authorized by the owner on 2026-09-30. The next coordinated
candidate is 1.2.0; see ../releases/1.2.0-preparation.md. The source qualification
record refers to the preceding 7dc725db increment, before version/workflow changes.

## Release boundary

The additions are opt-in source APIs, not npm 1.1.0 functionality. Never attempt
to overwrite published 1.1.0 bytes. A fresh coordinated minor release is the
proposed vehicle because these are additive public capabilities. Resolve the
actual version through the existing release process and registry availability
checks when publication is authorized.

Changes stay in existing packages: inference-control (tools builder, approval
and admission subpaths) and collective-control-postgres (approval and admission
adapters). No new package cohort entry or default runtime activation is needed.
The Agent Control must keep using published APIs until it can install the new
coordinated version. Prepared tarballs qualify consumption but are not a registry
release and must not be described as one.

## Reviewable delivery requirements

1. Complete contracts for external preconditions, capability limitations and
   reconciliation; verify their composed persistent scenarios.
2. Inspect all newly added public inputs and persistence transitions, especially
   caller-supplied scope, clock, payload substitution and revocation ordering.
3. Run full builds, type checks, unit/adapter suites and existing compatibility,
   platform, specification and public audits. Report skips/TODOs separately.
4. Run `pnpm run verify:action-control-consumer`: install prepared tarballs in an
   external directory, execute public APIs, compile public types, verify migrations
   and retain existing Collective Runtime/Audit consumers.
5. Isolate only this feature and its docs/tests from unrelated research/output
   work. Preserve those files; do not include them in a release or weaken gates.
6. Prepare a focused branch/PR or equivalent reviewable diff with exact validation
   evidence and remaining host obligations. Check migrations from the old version
   to the opt-in profile; existing installations do not invoke the new migrations.

## Publication after authorization

Use the existing `scripts/set-version.mjs`, approved-source verification,
artifact preparation and release-level deployment approval processes described
in `docs/security/npm-direct-release.md` and `docs/security/npm-release-security.md`.
Preserve protected main, exact staged-byte checks, OIDC and npm authentication
boundaries. The original source-support goal did not authorize publication. The subsequent
owner request now authorizes the coordinated npm release; ACL cloud deployment
remains outside this release.

After actual publication, verify registry bytes and public consumption, then
update ACL to the published coordinated dependency version and run its gateway
integration suite. Version pinning, migration invocation, durable grant/approval
mapping, trusted quote/fact ports and idempotency guarantees are explicit adoption
steps. No old application is automatically enrolled.
