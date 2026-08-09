# Verified Benchmark Registry Threat Model

## Assets

Benchmark integrity depends on participant descriptors, suite/scenario bindings, source-artifact-build locks, trace evidence, paired baseline evidence, and deterministic ranks.

## Controls

- Exact-key validation rejects unexpected fields, accessors, malformed identifiers, and forged digest envelopes.
- The suite carries the environment descriptor digest, immutable scenario manifest, scale profile, seed, and budget digest.
- Trace evidence is bound to participant, scenario, and artifact lock. The replay digest binds all four values again.
- A locally trusted verifier must authenticate provenance for both candidate and baseline trace evidence; self-consistent digests are insufficient.
- Baseline trace evidence is required to use the suite baseline descriptor and artifact lock and the exact same scenario manifest.
- Metrics are evaluator-derived from trace facts. Submission objects have no accepted score field.
- Candidate and baseline resource counters are bounded by the selected profile and traces exceeding the suite budget are ineligible.
- A leaderboard accepts one exact suite and deterministically excludes duplicate submissions and replayed trace bindings.
- Ineligible records are deliberately outside the ranked set; ties are deterministically ordered and share rank.

## Non-goals

This contract cannot prove that a source digest corresponds to honest source code, that a configured verifier is independent, or that an environment faithfully models the outside world. Those are external review and deployment concerns. The API stores digests rather than source, artifacts, private simulator state, credentials, or network endpoints.
