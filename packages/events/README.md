# @agentplat/events

Event contracts for agentic platform operations.

## Installation (developer preview)

Install the coordinated preview explicitly:

```sh
npm install @agentplat/events@next
```

Keep all `@agentplat/*` packages on the same release version. npm's default
`latest` tag can point to an older preview. See the
[release channels](https://github.com/Agentplat/agentplat/blob/main/docs/release-channels.md)
for distribution status and version selection.

This package defines event envelopes, publishers, subscribers and webhook sinks. Use it to connect runtime activity, workflow state, audit pipelines and operational integrations.

`InMemoryEventBus` supports typed and wildcard subscriptions for local development and tests.

The opt-in incremental-evidence source API adds atomic event/evidence/checkpoint
intake, fenced analysis receipts, recovery of unapplied results and compaction
with retained deduplication identities. It does not connect providers or invoke
models. See [contracts, authorization and SQL adoption](../../docs/planner/incremental-followup.md).
