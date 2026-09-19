# Morphogenesis publication pilot

This harness uses the existing V1 runtime with a synthetic Team owner and a
single-writer, flushed JSONL test store. It performs no external actions, model
calls or paid work. It deliberately kills its own child worker after recording
an owner effect. Do not use the store or comparator as production adapters.

See [the protocol](protocol.md) for conditions and limits and
[the paper artifact](../../docs/research/morphogenesis-paper-v0.2/README.md)
for build, run, verification and PDF commands. All fixture capability, mandate,
attestation and source digests are synthetic; they are not signed external facts.

The fresh-ID recovery ablation is intended to produce a duplicate synthetic
effect. The losing-head probe is intended to retain a losing proposal's effect.
These expected observations delimit claims; they are not hidden test failures.
Neither is a complete end-to-end race among approved organizational transitions.
