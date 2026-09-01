# Agent Morphogenesis Beta 1 local-profile release report

Source commit: `763b0429bfdb4d931db1ddd605f6ea89ff271767`
Bundle digest: `sha256:74013cf6cc47de4581999b83f9a8971a14043fd46d0bad89cb2aff308efe92fc`
Scenarios: 18

The registered Beta 1 local-profile release evidence passed. Experimental evidence remains not collected, operational readiness is not established, and no production or security-certification claim is permitted.

| Scenario | Status | Evidence class | Wall ms | Churn | Continuity |
|---|---|---|---:|---:|---:|
| nominal-recruit-agent | passed | diagnostic-operational-conformance | 800 | 1 | 1 |
| nominal-recruit-person | passed | diagnostic-operational-conformance | 375 | 1 | 1 |
| nominal-recruit-quorum | passed | diagnostic-operational-conformance | 344 | 1 | 1 |
| nominal-create-agent | passed | diagnostic-operational-conformance | 335 | 1 | 1 |
| nominal-create-person | passed | diagnostic-operational-conformance | 377 | 1 | 1 |
| nominal-create-quorum | passed | diagnostic-operational-conformance | 358 | 1 | 1 |
| crash-after-proposal-before-decision | passed | diagnostic-operational-conformance | 10627 | 1 | 1 |
| crash-after-decision-before-prepare | passed | diagnostic-operational-conformance | 10341 | 1 | 1 |
| crash-after-provision-before-attestation | conformant | source-conformance | 190 | 1 | 1 |
| crash-after-enrollment-before-activation | conformant | source-conformance | 189 | 1 | 1 |
| crash-after-activation-before-outcome | conformant | source-conformance | 189 | 1 | 1 |
| crash-after-fence-before-terminal-agent | conformant | source-conformance | 190 | 1 | 1 |
| mesh-minority-partition | passed | diagnostic-operational-conformance | 3970 | 0 | 1 |
| concurrent-morphology-head | conformant | source-conformance | 180 | 1 | 1 |
| concurrent-budget-reservation | conformant | source-conformance | 172 | 0 | 1 |
| stale-decision-authority | conformant | source-conformance | 173 | 0 | 1 |
| agent-self-approval | conformant | source-conformance | 197 | 0 | 1 |
| dependent-actor-collusion | conformant | source-conformance | 185 | 0 | 1 |

External spend: USD 0. Profile synthesis, recursive creation and Team split/merge/federation were excluded.
