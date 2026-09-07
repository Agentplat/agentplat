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

## First contribution

Read the [adoption paths](docs/getting-started/README.md) and try the deterministic
quick example. A useful first documentation contribution corrects a command,
expected result or integration limit you can reproduce. Keep public prose in
English and link to the component maturity matrix for availability claims.

Use Node.js 22.13+ for the pnpm 11 source workspace. Published runtime packages
may support older Node versions; that does not change the package-manager requirement.
Use the repository's `packageManager` through Corepack rather than selecting an
unrelated pnpm version. Preserve existing local work.

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm run example:quick
corepack pnpm run verify:adoption-docs
```

## Focused verification

Build the affected package and dependencies first, then run its existing tests.
For example, when changing Rooms behavior:

```sh
corepack pnpm --filter @agentplat/rooms... build
node --test tests/rooms.test.mjs tests/rooms-checkpoints.test.mjs
```

For proposal integration changes, run `verify:adoption-integration` with the
PostgreSQL environment documented in the collaboration guide. It starts its
own local API and runs proposal, recovery and protected-effect scenarios.
For API/export changes also run `type-check:public` and `verify:public-consumer`.
Before final integration, run the required `check` command above. Record failed
checks and environment prerequisites honestly; do not substitute source review
for execution evidence.

## Add an adapter through an existing contract

Start with a small public `AgentProvider` implementation in your application:

```ts
import { DefaultAgentRuntime, type AgentProvider } from "@agentplat/runtime";

const provider: AgentProvider = {
  async run(_agent, _input, context) {
    context.signal?.throwIfAborted();
    return { status: "completed", output: "Deterministic local response" };
  },
};
const runtime = new DefaultAgentRuntime();
runtime.registerProvider("local", provider);
```

Test output and failure behavior through `runtime.run`, not private source
imports. This minimal provider neither persists state nor implements protected
effects. Follow [integration controls](docs/getting-started/integration-controls.md)
when adding tools or external actions. Prefer extending an adapter package to
adding a parallel abstraction. Follow the public API and release rules above.
