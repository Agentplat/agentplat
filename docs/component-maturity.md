# Component maturity

This is the editorial entry point for adoption status. Source availability,
registry distribution, executable checks and operational evidence answer
different questions. None implies another. The source checkout currently
uses a coordinated preview version; it does not prove that version is on npm.

## Source and integration map

| Component                             | Source / available integration                                                                     | Reproducible checks                                             | Operational evidence / adopter obligations                                                             |
| ------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Framework, model adapters, sessions   | Public facade, mock and real-model adapters; optional Redis sessions                               | `example:quick`, `example:sessions`, framework DX tests         | Local examples; choose model endpoint, credentials and session persistence                             |
| Agent Rooms                           | RoomService, Rooms API and PostgreSQL repository; versioned artifacts, approvals and contributions | Proposal demo, `demo:recover`, `demo:controls`, Room tests      | Bounded local scenarios; supply verified identity, actor authorization, backups and effect controls    |
| Governed Durable Workflows            | Core runner, PostgreSQL, Rooms and Temporal adapters exist                                         | Workflow public contract tests, conformance and adapter checks  | In-memory runner has no restart guarantee; configure durable stores, timers and effect reconciliation  |
| Collective Runtime / planning         | Public local collective and opt-in coordination controllers                                        | `example:collective`, capability and evidence catalog verifiers | Frozen baseline separates source completion from empirical and operational validation                  |
| Agent Mesh                            | Mesh, crypto, protocol, HTTP and PostgreSQL adapters                                               | `example:mesh-multiprocess`, Mesh conformance checks            | Four-peer example is bounded; deployment owns key custody, transport and membership                    |
| Inference Control / Trust             | Opt-in public controls and explicit integration subpaths                                           | Inference-control and Trust scenario verifiers                  | Direct calls outside the integration path are not controlled; configure policies and assessor inputs   |
| Agent Morphogenesis                   | Opt-in Collective Runtime composition with host persistence                                        | Existing Morphogenesis release/readiness verifiers              | Signed Beta 1 local/staging profile only; not general production readiness or security certification   |
| A2A / Agent Registry | Opt-in A2A 1.0 client/server, registry and PostgreSQL; Room/Mesh/Morphogenesis bridges | `test:a2a`, `example:a2a`, `verify:a2a-consumer` | Local SDK/PostgreSQL integration evidence; host supplies identity, execution owners and network policy |
| Memory, tools, events, audit and auth | Public contracts and package-specific adapters                                                     | Package tests and public consumer checks                        | In-memory implementations are not durable; choose adapters and define retention, identity and delivery |

See [the package allowlist](../config/public-packages.json) for the complete
component inventory and [the capability catalog](capability-catalog.md) for
advanced surfaces. This table groups packages; it does not certify every
export or every combination of adapters.

## Distribution

On 2026-09-09, all 65 catalog packages were publicly available at
`0.3.0-beta.7` with `next` aligned. Registry integrity, signatures, provenance
and tags passed the release verification job. Independent clean pnpm portable,
pnpm PostgreSQL and npm Node 22.22.0 consumers passed for all 65 packages and
216 export subpaths using the corrected registry-consumer cohort. See the
[Beta 7 distribution record](releases/beta7-distribution-20260909.md) for source,
artifact and verification boundaries. This does not establish production-scale
operational validation.

### Historical observation

Read-only public npm checks on 2026-09-07 returned:

| Package                         | Observed distribution                            | Interpretation                                                |
| ------------------------------- | ------------------------------------------------ | ------------------------------------------------------------- |
| `@agentplat/framework`          | `next`: `0.3.0-beta.5`; `latest`: `0.2.0-beta.1` | Registry preview exists; not proof of current checkout parity |
| `@agentplat/rooms`              | `next`: `0.3.0-beta.5`; `latest`: `0.2.0-beta.1` | Registry preview exists; current source may be ahead          |
| `@agentplat/workflows-postgres` | Public registry request returned E404            | No public package verified; use source for this integration   |
| Other packages                  | Not checked in this adoption pass                | Verify selected package and exact version before installation |

Commands below reproduce the queries; tags are mutable and this is a dated
observation, not a release attestation. An E404 is recorded as the observed
public result, not a claim about private registry access.

[Release channels](release-channels.md) describes the intended coordinated
preview channel. Verify distribution at adoption time:

```sh
npm view @agentplat/framework dist-tags --json
npm view @agentplat/rooms dist-tags --json
npm view @agentplat/workflows-postgres dist-tags --json
```

Until those commands succeed for the selected packages, distribution is
**unverified**, even when source and exports exist. Match exact versions across
packages and run the existing registry consumer verification before release.
Source-clone paths do not depend on registry availability of AgentPlat packages.

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
