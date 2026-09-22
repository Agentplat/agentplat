# Stability and maintenance

Version 1.0.0 is the first coordinated stable release, published on npm under
`latest`. This policy applies to published 1.x versions. See the
[verified distribution record](releases/stable1-distribution-20260922.md).

## Public compatibility contract

The 65 packages in `config/public-packages.json` share one release version.
The supported API consists of their package.json export entry points, exported
TypeScript contracts and documented behavior. Internal source paths, examples,
research scripts and undocumented implementation details are outside that API.

Within 1.x, patches fix defects without intentionally breaking supported
contracts. Minor releases add compatible functionality and deprecations.
Removing exports, incompatible type or behavior changes, or requiring an
incompatible persistence/protocol migration requires a new major release.
Deprecations include an alternative and migration instructions before removal.
Security fixes describe any necessary behavior changes in release notes.

Persisted data and protocol versions retain their documented compatibility
rules. Back up before migrations; a successful package install does not prove
that a database downgrade is safe. Consumers should upgrade the coordinated
package set together and retain a lockfile.

## Experimental capabilities

AgentPlat Agent Morphogenesis, including its V1–V8 entry points and associated
opt-in integrations, remains experimental in operational maturity. Simulation,
research evaluation and features explicitly marked experimental or research-only
are not promises of production reliability. Their public exports still receive
the 1.x compatibility protection above; experimental status is not permission
to silently break a stable package.

The component maturity matrix and frozen evidence baseline continue to describe
what has actually been exercised. Stable versioning is a maintainer commitment
to compatibility, not a claim that every adapter combination or deployment scale
has been validated.

## Maintenance and support

Report reproducible defects through repository issues and follow SECURITY.md
for security reports. Fixes target the current 1.x release; support for older
patch versions and prereleases is not promised. There is no response-time SLA
or implied commercial support. Release notes identify migrations and supported
runtime changes. Future retirement of the 1.x line will be announced explicitly.

See [production deployment](production.md), [component maturity](component-maturity.md)
and [release channels](release-channels.md).
