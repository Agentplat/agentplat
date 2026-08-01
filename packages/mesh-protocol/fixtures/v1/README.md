# Mesh wire-v1 fixtures

These fixtures freeze the Beta 1 wire contract. Their payload shapes match the
wire-v0 compatibility fixtures; the signed `wireVersion` is `1`, and the Peer
Card fixture advertises both supported versions.

Run `pnpm run fixtures:mesh-protocol:write` only when intentionally generating
the reviewed fixture cohort. CI uses `pnpm run verify:mesh-protocol-fixtures` to
recompute every raw, canonical-envelope, canonical-payload and signing-document
digest without modifying files.

Every fixture is signed by the public test identity in
`public-key.raw.json`, and verification is part of the fixture gate. No private
key is stored or published. Intentional key rotation is a maintainer operation
(`--rotate-test-key`); deterministic regeneration otherwise preserves the
reviewed signatures while recomputing and checking every signed byte.
