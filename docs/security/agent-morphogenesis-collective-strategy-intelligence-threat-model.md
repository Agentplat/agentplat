# Agent Morphogenesis Collective Strategy Intelligence V4 threat model

Status: source implementation threat model; operational effectiveness is not
established.

| Threat | Control |
| --- | --- |
| Replay or duplicate delivery | Issuer stream/sequence/predecessor heads and idempotent admission. |
| Same-sequence equivocation | Conflicting signed head is rejected. |
| Sybil amplification | Epoch membership, local Trust, distinct peers and independently classified groups. |
| Colluding identities | Minimum independence groups; one peer/group contribution per certificate. Residual classifier compromise remains. |
| Poisoned extreme metric | Bounded values and robust lower-median aggregation. |
| Unsafe minority hidden as success | Unsafe evidence remains available to convergence; deployments must set conservative cohort thresholds. Robust aggregation trades single-source veto for poisoning resistance. |
| Catalog, generator or policy substitution | Exact V4 binding is included in the signed signal set and reconstructed locally on Mesh admission. |
| Cross-tenant/context contamination | Tenant, mesh, policy domain and admitted context-class gates. |
| Expired or future evidence | Bounded TTL, logical-time and future-skew checks. |
| Remote evidence changes local weights | Certificates map only to capped priors with no weight or authorization field. |
| Herd convergence removes fallback diversity | Sustained-cycle and near-leader diversity holds. |
| Partition causes premature adoption | Partition and recovery states hold locally; no stable adoption. |
| Collective result executes Morphogenesis | It can only form an inert V3 recommendation; agent, person or quorum review and ordinary execution remain required. |
| Database rollback reopens old intelligence | State digest/revision CAS plus external rollback witness. |

Residual risks include compromised measurement sources, incorrect independence
classification, sufficiently broad collusion, correlated model errors and poor
deployment thresholds. These require operational controls and empirical
validation outside source completion.
