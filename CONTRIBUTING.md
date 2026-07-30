# Contributing

AgentPlat accepts contributions under the Apache License 2.0.

By opening a pull request, you agree that your contribution may be distributed under the same license as this repository.

## Development

```sh
corepack pnpm install
corepack pnpm run check
```

## Public API changes

- Add TSDoc to exported contracts and document behavioral guarantees rather
  than implementation details.
- Keep provider SDKs in adapter packages; public core packages must remain
  usable without installing unrelated providers.
- Add or update tests that consume the public package export, not private
  source paths.
- Add a concise entry under `CHANGELOG.md` → `Unreleased`.
- Keep every publishable package on the fixed workspace SemVer described in
  `RELEASING.md`. Do not bump one package independently.
- Add a public package to `config/public-packages.json`; release, versioning and
  pack-smoke scripts must not maintain separate package lists.
- Record cross-package architectural decisions under `docs/adr`.

The project is in a `0.x` developer preview, but breaking changes still require
an explicit changelog note and migration guidance.

## Safety rule

Do not commit credentials, tenant data, customer-specific code, production logs, signed URLs, or deployment secrets.

Use industry terminology in public code, documentation, tests, fixtures,
commits and pull requests. Every release also uses a non-empty external
terminology denylist. Keep that file outside the checkout and run:

```sh
AGENTPLAT_PUBLIC_DENYLIST_FILE=/absolute/path/to/terms.txt \
  corepack pnpm run audit:public:release
```

The file is newline-delimited and may contain `#` comments. The audit refuses a
denylist stored inside the repository so excluded terminology is not checked in
merely to detect it.
