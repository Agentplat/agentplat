# Component maturity

This is the editorial entry point for adoption status. Source availability,
registry distribution, executable checks and operational evidence answer
different questions. None implies another. All 70 packages are published at 1.4.0
under npm `latest`; see the [verified distribution record](releases/1.4.0-distribution.md).
The [stability contract](stability.md) governs API compatibility independently of
operational evidence.

## Source and integration map

| Component                             | Source / available integration                                                                     | Reproducible checks                                             | Operational evidence / adopter obligations                                                             |
| ------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Framework, model adapters, sessions   | Public facade, mock and real-model adapters; optional Redis sessions                               | `example:quick`, `example:sessions`, framework DX tests         | Local examples; choose model endpoint, credentials and session persistence                             |
| Agent Rooms and Planner | Rooms, PostgreSQL persistence, Planner objectives/reports/budgets/review and workflow bridge | Published registry consumers for Planner and PostgreSQL | Opt-in; explicit Rooms 019/workflows 001 migrations; host owns identity, admission, prices and operational recovery |
| Persistent memory and reviewed definitions | Stable-agent memory revisions, reviewed definition coordinates and optional PostgreSQL ledger | Published npm consumer, strict public types and isolated PostgreSQL scenarios | Separate opt-in memory ledger; host owns identity mapping, audience authorization, retention and private snapshot handling |
| Application artifacts | Tenant-scoped immutable revisions, PostgreSQL CAS/outbox and optional agent tools | Published registry consumer, migrations, CAS and outbox retry | Tools are opt-in; host owns authorization, delivery, retention and HTML isolation. No PDF/XLSX/PPTX generator is published |
| Governed Durable Workflows            | Core runner, PostgreSQL, Rooms and Temporal adapters exist                                         | Workflow public contract tests, conformance and adapter checks  | In-memory runner has no restart guarantee; configure durable stores, timers and effect reconciliation  |
| Collective Runtime / planning         | Public local collective and opt-in coordination controllers                                        | `example:collective`, capability and evidence catalog verifiers | Frozen baseline separates source completion from empirical and operational validation                  |
| Agent Mesh                            | Mesh, crypto, protocol, HTTP and PostgreSQL adapters                                               | `example:mesh-multiprocess`, Mesh conformance checks            | Four-peer example is bounded; deployment owns key custody, transport and membership                    |
| Inference Control / Trust             | Opt-in public controls and explicit integration subpaths                                           | Inference-control and Trust scenario verifiers                  | Direct calls outside the integration path are not controlled; configure policies and assessor inputs   |
| Standalone governed actions | Optional exact-target approval, transactional budgets/fences and PostgreSQL stores | `verify:action-control`, independent registry consumers | Bounded software evidence; trusted host ports, destination guarantees and tenant-state scaling remain deployment obligations |
| Agent Morphogenesis                   | Opt-in Collective Runtime composition with host persistence                                        | Existing Morphogenesis release/readiness verifiers              | Signed Beta 1 local/staging profile only; not general production readiness or security certification   |
| A2A / Agent Registry | Opt-in A2A 1.0 client/server, registry and PostgreSQL; Room/Mesh/Morphogenesis bridges | `test:a2a`, `example:a2a`, `verify:a2a-consumer` | Local SDK/PostgreSQL integration evidence; host supplies identity, execution owners and network policy |
| Memory, tools, events, audit and auth | Public contracts and package-specific adapters                                                     | Package tests and public consumer checks                        | In-memory implementations are not durable; choose adapters and define retention, identity and delivery |

See [the package allowlist](../config/public-packages.json) for the complete
component inventory and [the capability catalog](capability-catalog.md) for
advanced surfaces. This table groups packages; it does not certify every
export or every combination of adapters.

## Distribution

The protected 1.4.0 workflow published 70/70 packages under `latest`. It published
68 through OIDC and verified two interactive bootstrap packages. Byte, signature,
provenance and registry-consumer checks passed, including Planner and artifacts
with PostgreSQL, portable/durable consumers and npm on Node 22. See the
[workflow run](https://github.com/Agentplat/agentplat/actions/runs/39893775787)
and [release record](releases/1.4.0-distribution.md). Consumer checks establish
bounded integration, not validation at production scale or general readiness.

The `@agentplat/artifacts` packages support inert Markdown, text, code, CSV, HTML
and syntactically validated JSON. They do not generate PDF, XLSX or PPTX.

Historical Beta distribution observations below are retained as historical evidence.
They do not supersede the stable 1.4.0 release record.

## Evidence sources and maintenance

- [Current frozen baseline](../config/collective-capability-baseline-current.json)
  and [V1 capability evidence catalog](../config/collective-capability-evidence-v1.json).
- [Morphogenesis hardening evidence](../config/agent-morphogenesis-hardening-evidence-v1.json).
- [Signed local/staging readiness profile](research/agent-morphogenesis-beta1-readiness-v2/README.md):
  22 scenarios over a bounded 30-minute profile at its recorded source commit.
- [Research evidence classes](research/README.md): implementation, deterministic
  conformance, local operational profiles and empirical study results stay separate.

Update this matrix when an integration's documented status changes and link
its exact evidence. Do not silently expand the baseline or relabel historical
evidence as validation of the current checkout. Run `verify:adoption-docs` to
check adoption links, referenced exports and executable commands. Passing that
structural check does not establish usability, security or production readiness.
