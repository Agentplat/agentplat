# Protocol v0 cryptographic fixtures

`signed-peer-hello.json` and `peer-a-public.raw.json` form one fixed Ed25519
verification vector. The payload digest and signature cover the exact
canonical protocol documents defined by `@agentplat/mesh-protocol`.

The public key uses the provider-neutral raw 32-byte representation as a JSON
byte array so the fixture remains reviewable text.

The private key used to create the signature was ephemeral and discarded. It
is not included in source, package output, telemetry or documentation. Tests
that exercise signing generate temporary key pairs at runtime and never export
their private components.
