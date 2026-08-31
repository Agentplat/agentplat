# Agent Morphogenesis Constitutional Continuity V8 threat model

| Threat | Control |
| --- | --- |
| Mission/tenant substitution | Invariantes inmutables y observaciones longitudinales. |
| Authority creep | Ceiling digest, threshold y authority epochs monotónicos. |
| Provider/model/group/lineage capture | Métricas separadas con límites locales. |
| Self-amendment | Proponente/beneficiarios excluidos de review. |
| Reviewer collusion | Rutas y grupos independientes mínimos. |
| Incomplete exploration claimed as proof | Model checker devuelve `incomplete`. |
| Partition forks merge grants | Ramas conflictivas se aíslan; `mergesAuthority:false`. |
| Rollback revives stale grants | Autorizaciones revocadas y successor authority epoch. |
| Remote Mesh message changes constitution | Proyección unsigned/non-operational; gates locales. |
| Database rollback reopens head | CAS, digest validation y rollback witness. |

Riesgos residuales: verificadores comprometidos, colusión multidentidad,
clasificación errónea y políticas mal configuradas. Requieren controles
operativos y evidencia externa.
