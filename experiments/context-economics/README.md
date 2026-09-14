# Agent Room context economics experiment

[Back to experiments](../README.md)

Status: research-only, deterministic synthetic selection experiment. This is
outside the registered collective empirical study and capability baseline.
It adds no public API or runtime authorization behavior.

## Question and implementation

Can explicit application references preserve old constraints and current
artifacts with less serialized context than the existing recency window?

The runner creates real in-memory Agent Room records through `RoomService`.
It compares the actual `BoundedContextBuilder` defaults (20 messages, 10
artifacts, 20 memory entries), a full-history builder, and an experimental
selector retaining two recent messages plus exact referenced messages and
current artifact versions. Memory scope and expiry filtering use the existing
builder. No summary generation or automatic relevance classification is tested.

All arms receive identical supplemental approval records. The existing builder
does not include approvals in `AssembledTaskContext`; this envelope is exclusive
to the experiment. A deterministic evaluator checks whether the context contains
the expected current artifact and an approved record bound to that version.
It reports missing artifacts as unknown, not as an unsafe approval. The evaluator
is not an action gate and confers no execution authority.

## Reproduce

From the repository root:

```sh
pnpm --filter @agentplat/rooms... --filter @agentplat/runtime-mock... build
node --test tests/context-economics.test.mjs tests/rooms.test.mjs
node experiments/context-economics/experiment.mjs > experiments/context-economics/results.json
```

The committed `results.json` records nine fixtures and three policies (27 rows):
20, 100 and 300 background messages, each with a current approved version, a
revision after approval, or an expired approval request. Twelve newer background
artifacts displace the target from the default artifact window. The fixtures
also contain another participant's private memory and expired room memory.
IDs and fixture clocks are deterministic. Assembly timings vary by machine/run.

## Observed local result

| Policy              | Serialized envelope bytes | Exact constraint present | Current artifact / correct review status |
| ------------------- | ------------------------: | -----------------------: | ---------------------------------------: |
| Default bounded     |             44,651–44,788 |                      0/9 |                            0/9 (unknown) |
| Full history        |            48,236–462,587 |                      9/9 |                                      9/9 |
| Explicit references |               4,558–4,619 |                      9/9 |                                      9/9 |

The selective envelope is approximately 90% smaller than the default window in
these deliberately distractor-heavy fixtures. None of the arms exposes the
private or expired memory. This demonstrates a selection tradeoff under supplied
references, not a general advantage over recency selection or model quality.

Tests also check missing originals, missing current versions, cross-tenant
references, byte-budget overflow, unchanged source state, corrupted evidence,
and an incomplete manifest. The last case deliberately loses the unmarked
constraint: the policy cannot discover relevance by itself.

## Accounting and evidence limits

- `serializedBytes` measures the UTF-8 JSON envelope, including retrieved content
  and approval evidence. It is not a provider prompt or storage footprint.
- `tokenProxyBytesDiv4` is only bytes divided by four, not a tokenizer count.
- `retrievalBytes` counts selected originals copied from already loaded local
  state. It does not measure network traffic, database reads or retrieval cost.
- `localAssemblyMs` includes selection, in-memory retrieval and serialization;
  it excludes fixture loading and inference. Single samples are diagnostic only.
- Actual tokens, inference cost, end-to-end latency, answer quality and repeated
  work are explicitly null. There are zero model calls and no external spend.

This is a snapshot experiment over service-generated lifecycle states, not a
long-running agent trial. References are an application-supplied relevance oracle;
the synthetic workload favors selective retrieval. No summarization, cache
promotion/demotion, concurrent version change, revoked approval, remote failure,
or production-scale behavior is established. A memory tier in the existing
Inference Control contracts is not replaced by this experimental selector.

## Next decision

The result supports investigating explicit required-context references at the
existing Room context boundary. It does not justify three new capabilities.
Before integration, evaluate held-out tasks with incomplete and changing
references, genuinely relevant long histories, remote retrieval, and exact model
token accounting. Run paired model trials with fixed model/settings, randomized
arm order, and independent scoring of output quality, constraints, version
confusion and rework; include retrieval and summary costs in the total. Preserve
existing action gates and reject missing mandatory context or budget overflow.
Actual quality/cost claims require that follow-on evidence.
