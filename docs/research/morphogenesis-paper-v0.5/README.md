# Agent Morphogenesis paper v0.5

The manuscript separates historical v0.4 results from the new opt-in runtime and
its evidence. PDF: `output/pdf/agent-morphogenesis-paper-v0.5.pdf`.

## Evidence index

- `manuscript.md`, `references.bib`: editable paper and citation metadata.
- `historical-cells.md`: all 48 historical condition/shape/fault cells, computed
  from the unchanged v0.4 oracle scores. Seeds are not independent reliability trials.
- `governance/`: 36 prescribed authority/recovery cells with four real controllers,
  PostgreSQL and a common experimental signed admission envelope. The registration
  retains the issuer trust anchor, code hashes and the explicitly bounded design.
- `persistent/`: PostgreSQL Room/Team/Work integration, competing successors,
  terminal supersession, lost fence acknowledgement, pending work and real mandate
  expiry. The environment records compiled module hashes and fixture limitations.
- `model/`: TLC logs for the two-proposal finite model and three failing mutations.
- `verifier-tests.txt`: independent verifier's positive and negative controls.
- `development-attempts/`: engineering pilots and failed integration attempts,
  excluded from the final observations.
- `review-response.md`: addressed feedback and remaining research limitations.

The v0.4 frozen artifact is available at the
[paper publication revision](https://github.com/Agentplat/agentplat/tree/22b60bdae0411496a5295021d8a3988118721a82/docs/research/morphogenesis-paper-v0.4).
Its experiment source baseline remains
[the original source revision](https://github.com/Agentplat/agentplat/tree/e978544915a329387e13883fa352191f6993dcc7).
Do not run that frozen registration against the new runtime and relabel the result
as the historical execution. New runtime evidence has its own source manifests.

The new runtime, paper and evidence are pinned together by the
[paper-v0.5 source tag](https://github.com/Agentplat/agentplat/tree/paper-v0.5).
Use that tag for reproduction; the separate environment manifests retain the
pre-commit working-tree and compiled-module hashes recorded during execution.

## Reproduce the new extension

From the `paper-v0.5` checkout, Node.js 22.13+, pnpm 11.25 and Docker:

```sh
pnpm install --frozen-lockfile
pnpm --filter @agentplat/workflows-postgres... --filter @agentplat/collective-host-postgres... --filter @agentplat/collective-control-postgres... --filter @agentplat/rooms-mesh... --filter @agentplat/workflows-rooms... --filter @agentplat/runtime-mock... build
node experiments/morphogenesis-paper/governance/run-local.mjs /tmp/governance-new
node experiments/morphogenesis-paper/governance/verify.mjs /tmp/governance-new
MORPHOGENESIS_GOVERNANCE_EVIDENCE=/tmp/governance-new node --test experiments/morphogenesis-paper/governance/verify.test.mjs
node examples/agent-morphogenesis/persistent-local.mjs /tmp/persistent-new
node experiments/morphogenesis-paper/governance/verify-persistent.mjs /tmp/persistent-new
node --test tests/morphogenesis-supersession.test.mjs tests/morphogenesis.test.mjs
```

Output directories must be new. Both wrappers create and remove dedicated
loopback PostgreSQL containers. No model keys or external inference are needed.
Signatures, UUIDs, timings and the identity of the race winner can differ between
runs; compare validated invariants and per-cell outcomes, not random bytes.

For retained evidence, use the same verifiers with this directory's `governance`
and `persistent` subdirectories. `model/` corresponds to
`experiments/morphogenesis-paper/model/Supersession.tla`; follow that folder's
README to repeat TLC with Java and the upstream TLC 1.7.4 jar. The tool and Java
runtime are development dependencies, not vendored binaries or npm dependencies.

Render with ReportLab and Times New Roman/Arial/Arial Unicode fonts:

```sh
python3 -B experiments/morphogenesis-paper/render-v05.py
```

## Evidence limits

The new authority matrix measures the common owner's admission contract, not a
security feature unique to the Morphogenesis core. The strongest workflow
baseline ties on admission safety and terminal controller-chain reconstruction.
The fixed controller has no organizational transition denominator. The minimal
controller's retained admission chains do not imply successful cleanup.

The persistent contention test is Morphogenesis-specific; comparative full P5
coverage across contending workflows is not established. Identity/catalog inputs
and scripted reviewers are fixtures; the rollback witness is process-local.
TLC explores a bounded abstraction under stated fairness and owner assumptions,
not the full TypeScript implementation. No LLM-quality or production-reliability
claim is made. This preprint has not been submitted to a venue by this task.

## Subsequent stable distribution

AgentPlat 1.0.0 is now distributed on npm under `latest`; see the
[distribution record](../../releases/stable1-distribution-20260922.md) for the
exact release source and successful verification workflow. This is a subsequent
software distribution, not the source of the experiments in paper v0.5.
Reproduce those experiments with the original pinned sources above. The frozen
paper-v0.5 manuscript, PDF and evidence references are unchanged.
