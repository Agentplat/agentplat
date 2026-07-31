# Inference Control Alpha 3 design review record

Date: 2026-07-31

Scope:

- `alpha-3-implementation-plan.md`;
- `alpha-3-acceptance-checklist.md`;
- `inference-control-threat-model.md`;
- Agent Mesh compatibility, glossary and release-plan updates;
- the existing public Runtime, Model, Tools, Streaming, Mesh, packaging and
  publication contracts against which the design must compile.

## Review method

Three independent passes covered architecture/contracts, adversarial security
and release/compatibility. Findings were assigned P0/P1/P2, corrected in the
design and re-reviewed until each blocking reviewer returned zero P0/P1.

## Blocking findings closed

- replaced false transparent wrappers with controlled request executors and
  explicit action/message gateways;
- aligned coordinated scopes to the real Mesh `workItemId` and string fencing
  token;
- froze normative renderers for model and runtime input roles;
- separated final and incremental assessment capabilities and bound assurance
  to exact wrapper/descriptor digests;
- made assessor request/result correlation, streaming sequence/UTF-8 windows,
  grants, message attempts and dependency rebinding exact;
- split pre-reservation `issued` checks from post-reservation `reserved`
  checks and specified crash-to-indeterminate behavior;
- made action arguments mandatory JSON-object digests, including canonical
  `{}` for no-argument calls;
- added construction-bound dispatch/context/credential contracts and limited
  strong stale-effect claims to downstream atomic fencing;
- classified strict snapshots as sensitive and separated quiescent equivalence
  from fail-closed in-flight restore;
- added stateful controlled-SSE validation with an explicit EOF/terminal check;
- made the 29-package release line Alpha3-first and specified a shared tested
  release sentinel before packaging or registry access.

## Final verdict

- architecture/contracts: 0 P0, 0 P1;
- adversarial security/scenarios: 0 P0, 0 P1;
- release/compatibility: 0 P0, 0 P1.

Non-blocking follow-up: the Alpha-3-specific release sentinel must be advanced
or retired when the next coordinated release line is opened.
