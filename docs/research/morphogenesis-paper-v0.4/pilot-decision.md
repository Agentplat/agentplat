# Pilot decision record

The engineering pilot retained 96 runs: two seeds, four demand shapes, three fault schedules and four conditions. It is excluded from the held-out run. The first pilot informed one measurement correction: a shared query ceiling and a per-query trace were added so governance persistence is explicitly bounded. The role budget was not tuned to select a winner.

The final pilot and its independent oracle completed. All prescribed fault opportunities were observed. The oracle rejected rehashed wrong arithmetic and obsolete dependencies; the raw verifier rejected changed inputs and missing injection events.

## Observed pilot summary

- durable: 24/24 missions; mean role-phase units 9.5; median SQL calls 96.5; elapsed median 35.341 ms, range 5.828-57.374 ms.
- fixed: 24/24 missions; mean role-phase units 12; median SQL calls 22.0; elapsed median 7.099 ms, range 5.125-8.584 ms.
- minimal: 20/24 missions; mean role-phase units 12; median SQL calls 25.0; elapsed median 7.067 ms, range 5.791-13.003 ms.
- morphogenesis: 24/24 missions; mean role-phase units 9.5; median SQL calls 69.0; elapsed median 44.779 ms, range 5.604-57.951 ms.

## Freeze decision

Use 32 disjoint seeds (101-132) in the same complete 48-condition grid: 1,536 runs. This provides coverage across different input arrays and both burst positions; it is not a power calculation. Timing spread is sufficient to reject fine-grained performance claims; retain descriptive timing only. No exclusion rules, role ceilings or fault definitions are changed after this record. The held-out registration hashes scripts, inputs and plan before execution. It is a local freeze, not a public preregistration or independent timestamp attestation.
