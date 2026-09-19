# Final claim/evidence matrix - v0.4

Library source: `e978544915a329387e13883fa352191f6993dcc7`. New harness sources
are separately hashed. The matrices in v0.2/v0.3 retain their original scope.

| Paper claim | Authoritative evidence | Status and limit |
| --- | --- | --- |
| Organizational decision and effect-owner authority are distinct | Core/V2 source; v0.3 signed decisions and real Work mandate-expiry rejection | Source mapping plus bounded integration; not complete mediation across all deployments |
| Room integrates persistent work and exact human decisions without granting effect authority | `rooms-mesh`/`workflows-rooms` source, existing tests and v0.2 Room artifact case | Implemented integration and addressability; mission study does not use the Room API |
| Stable operation recovery is shared with a durable pattern | v0.2 lost-ack process-termination cases | Both stable-ID conditions recover one synthetic effect |
| One head does not imply atomic cross-owner transition | v0.3 `integration/race.json` | Two approved Team/Work effects, one accepted head, owner cleanup and pending losing V1 execution |
| Fencing and draining are different | v0.3 `integration/drain.json` and ordered events | Work revocation plus explicit application drain contract; not an external ActionGateway test |
| Four mission conditions have matched tasks, policy inputs and budgets | `registration.json`, verifier and raw cases | Fixed is sufficiently capable, with advance knowledge of its required role set; adaptive schedules are identical |
| Final code/inputs were frozen before evaluation | Registration SHA-256 in `evaluation/environment.json`, timestamps and source hashes | Local freeze, not public preregistration or independent timestamp attestation |
| 1,536 runs, 384 per condition | `evaluation/summary.json`; complete case grid verified | No cases excluded; pilot seeds are disjoint |
| Correct reports: 384 fixed, 320 minimal, 384 durable, 384 Morphogenesis | `analysis/scores.json`, independent Python oracle | Exact arithmetic and input/version/dependency correctness on synthetic tasks |
| 192 duplicate reservations and 64 budget failures in minimal adaptation | Raw owner events, active-role reconstruction and per-case scores | Prescribed response-loss schedules; not production failure probabilities |
| Mean role-phase units: 12, 12, 9.5, 9.5 | Reconstructed role occupancy in oracle; `analysis/summary.json` | Reservation units, not dollar costs; failed ablation runs retained |
| Median client SQL calls: 22, 25, 96.5, 69 | Per-query traces and summary | Includes client transaction control, excludes common setup/evidence export; not physical I/O |
| All accepted artifacts remained addressable | Raw artifact dumps, digests and acceptance events | Does not imply every mission had a valid complete final report |
| No superiority over competent durable baseline in quality or reservation use | Paired results in `analysis/paired.json` | Equal on those outcomes; timings are local diagnostics, not a general ranking |

## Measurement verification

The JavaScript verifier checks manifest coverage, matched inputs, all prescribed
fault opportunities, execution/workflow records and query traces. The Python
oracle independently computes exact answers, verifies revision dependencies,
reconstructs role-phase charges and checks the final report. Three raw-verifier
tests and four oracle tests passed, including rehashed tampering. Scores are not
assertions copied from the controllers.

The fixed condition has zero runtime activation-fault exposure; each adaptive
condition has 192 exposed missions. This difference is visible in both raw and
aggregate results. Both durable adaptive conditions block for 192 total logical
phases under the prescribed outage and subsequently complete all reports.

## Excluded claims

No LLM improvement, money savings, independent-host fault tolerance, universal
exactly-once effects, automatic V1 loser termination, cryptographic external
identity attestation, security certification or production readiness is claimed.
No new evidence was inserted into historical release bundles or the frozen
Collective Capability Baseline V1 denominator.
