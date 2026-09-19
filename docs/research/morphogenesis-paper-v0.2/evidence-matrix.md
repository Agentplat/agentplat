# Claim and evidence matrix - v0.2

Source: `e978544915a329387e13883fa352191f6993dcc7` plus the separately hashed
pilot harness. Inspect `pilot/environment.json` for executed module bindings.
The author-provided v0.1 files and historical bundles were not edited.

| Claim | Evidence inspected or executed | Supported boundary | Remaining obligation |
| --- | --- | --- | --- |
| Organizational decision does not replace effect ownership | `morphogenesis-governed-operator.ts`; V1 owner ports; stale-owner pilot | Exact V2 binding checks in source; synthetic owner denial propagated in V1 | Deployment-wide complete mediation and actual owner policy correctness |
| Stable operation recovery | Pilot lost-ack, real V1 runtime, SIGKILL and distinct worker PID; owner ledger | One synthetic Team effect recovered using existing identity | Other effects, distributed owners, delayed request races and host loss |
| Established durable pattern also recovers | Same owner with small write-ahead comparator | One effect under the same prescribed failure | Complete saga/workflow benchmark and all four mission conditions |
| Fresh identities can duplicate semantic work | Fresh-ID ablation: two distinct operation IDs at one semantic Team target | Concrete diagnostic counterexample | Frequency under representative workloads |
| Unknown owner outcome blocks head advancement | Unavailable reconciliation, followed by restoration | V1 retains `activating_team`, then continues | Long outages, expiry during blockage, resource retention |
| Head consistency is not transition atomicity | Two synthetic effects then concurrent commits through real head runtime | One head accepted, one losing effect remains in trace | Full competing approved plans, cleanup/compensation, work admissibility during gap |
| Removal requires the phase fence | Pilot attempts drain before fence and sees rejection | Ordering in the tested V1 path | External Work/Action enforcement and already-admitted activity |
| Room can retain prior artifact and receipt | Real RoomService/in-memory repository; work version created before Team transition, retrieved after detach | Version addressability and receipt projection | Semantic dependency validity, database recovery, participant lifecycle synchronization |
| Room participation grants no operational authority | `rooms-mesh/src/morphogenesis.ts`; existing 42-test suite | Participant creation uses authority zero and empty permissions | End-to-end application wiring |
| Human approval binds exact candidate | Existing test at `tests/morphogenesis.test.mjs`, re-executed in 42-test suite | Fixture approval mismatch rejected | Human study and verified production identity |
| P1-P5 hold conditionally | Paper arguments and obligation allocation | Abstract reasoning plus selected executions | Formal refinement and exhaustive interleavings |
| Historical local results | Existing narrative and source bindings | Context only, not samples in v0.2 | Publish/reverify all original external evidence before stronger use |
| Organizational utility and mission continuity | Future protocol only | Unexecuted research questions | Independent task oracle, adequate static baseline, four-condition study |

## Verification

The bundle verifier checks its file manifest, raw effect counts, stable identities,
process changes, runtime record validators, head bindings and Room artifact
versions. Three verifier tests exercise valid data, raw tampering and a rehashed
malformed record. Hashes are integrity evidence, not signatures or proof of an
independent experiment. No cryptographic trust claim is made for fixture digests.

The 42 existing runtime tests and three new verifier tests passed. These test
counts are not independent empirical mission samples. The pilot is eleven
prescribed cases with one execution each, not a randomized reliability study.

## Attempt history

Attempts 1 and 2 failed in the Room harness because it tried to read version
content from an Artifact metadata object. Attempt 2 also moved the work artifact
creation ahead of the transition, correcting the intended temporal comparison.
Attempt 3 completed and was verified. Attempt 4 also completed after strengthening the verifier. The final retained
bundle was executed after clarifying that the fixed owner-denial fixture probes
rejection propagation, not a real mandate-expiry race.
Failed attempt traces are retained in `development-attempts/`; their scripts were
development versions and are not retroactively assigned the final harness hash.
