# Agent Room operational release scope

This release scope is an explicit review boundary for the Agent Room
operational evolution. It prevents unrelated local research and generated
artifacts from entering the publication commit.

## Included

- `packages/rooms/**`
- `packages/rooms-api/**`
- `packages/rooms-postgres/**`
- `packages/rooms-temporal/**`
- `packages/work-management-asana/**`
- `examples/rooms-api/**`
- Agent Room tests under `tests/rooms-*.test.mjs`
- Agent Room sections of `README.md`, `CHANGELOG.md`, `docs/agent-rooms.md`,
  package catalogs, release verification and packed-consumer fixtures
- `docs/adr/0043-agent-room-operational-coordination-boundaries.md`
- `docs/agent-rooms-postgres-migration.md`
- `docs/releases/agent-rooms-operational-api-audit.md`
- `docs/releases/agent-rooms-operational-pr.md`
- `docs/reviews/agent-rooms-final-gap-closure-2026-08-21.md`
- `.github/workflows/agent-room-asana-sandbox.yml` as an optional provider
  validation workflow

## Explicitly excluded

- Unrelated research, study and generated-output directories
- Research document-generation scripts
- Source-comparison reports containing implementation-specific vocabulary
- Superseded completion evidence that covers only the earlier V1–V9 migration
  range

Use explicit paths when staging. Do not use `git add -A` or `git add .` for
this release. The executable pathspec is
`config/agent-rooms-operational-release-files.txt` and can be reviewed before
use with:

```sh
git add --dry-run \
  --pathspec-from-file=config/agent-rooms-operational-release-files.txt
```
