# AgentPlat 1.2.0 distribution — 2026-09-30

All **66 coordinated packages** are published at **1.2.0**, with npm `latest`
aligned. Date uses America/Montevideo. Existing applications keep their defaults;
standalone governed external actions are explicitly opt-in.

The [release workflow](https://github.com/Agentplat/agentplat/actions/runs/36791383517)
completed successfully from source
[`5309bd3e15dae06f3aad3333d97d53dc7bdb495b`](https://github.com/Agentplat/agentplat/tree/5309bd3e15dae06f3aad3333d97d53dc7bdb495b),
integrated through [PR #202](https://github.com/Agentplat/agentplat/pull/202).
The [dry-run](https://github.com/Agentplat/agentplat/actions/runs/36789053780)
passed first. The publication artifact manifest was byte-identical to the dry-run:
`sha256-K61f3vF9OudcR4RCDS2JBUWH/7gsRqh7fsZee9kHhtA=`.

Preparation, owner-only protected deployment approval, publication and final
verification passed. Exact-artifact review checked all 66 archives before approval.
Registry verification covered tarball bytes, npm ECDSA signatures, source provenance
fields and tags. Independent consumers passed the new action-control exports/types,
portable and PostgreSQL profiles, and npm under Node 22. A separate local verification
confirmed registry bytes, signatures, provenance and latest for the same cohort.

The first verification query could not see `@agentplat/interop-postgres@1.2.0`.
After the version/tag became visible, only the failed verification job was rerun
in the same original release. Preparation and publication were not repeated.

## Adoption

Update the AgentPlat packages you use together to 1.2.0; installing all 66 is
unnecessary. Start with [the adoption guide](../getting-started/adopting-1.2.md)
and [standalone action integration](../action-control/integration.md).

For The Agent Control, use the public optional approval/admission/effect contracts
and PostgreSQL subpaths. Identity, business policy, exact request display, trusted
quotes/facts, connectors and credential custody remain ACL responsibilities.
Existing installations do not invoke the optional migrations automatically.

The release also patches locked production dependency advisories through the existing
override mechanism. No audit exception, npm write token or protection waiver was added.

These are bounded software/distribution checks, not model-quality, production-scale
or universal external exactly-once guarantees. Provenance field checks are not an
independent full Sigstore certificate/transparency-log verifier. Unsupported destinations
cannot gain atomic conditional-write guarantees from capability declarations alone.
