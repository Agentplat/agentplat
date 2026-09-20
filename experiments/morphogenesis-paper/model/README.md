# Bounded supersession model

Two proposals share one predecessor and one stable effect identity per proposal.
Each effect can admit one outstanding job. Owner effects are atomic and durable;
acknowledgement loss leaves the coordinator in the prepared phase. The model
abstracts digest/signature checks, multiple epochs, owner failure domains and
real-clock expiry. It does not prove a refinement of the TypeScript code.

Phases: 0 initial, 1 prepared, 2 effect acknowledged, 3 accepted successor,
4 proven loser, 5 checkpointed, 6 fenced, 7 detached, 8 budget released/terminal.
Both terminal dispositions use phase 8; `head` identifies the accepted proposal.

Safety: one accepted successor; at most one effect per proposal; detachment only
after fencing and draining; a terminal transition has an applied effect.
Liveness: both transitions eventually close, under weak fairness of each
proposal's steps, reconciliation and job completion. Unavailable owners or
unending jobs invalidate those progress assumptions, not the safety invariants.

Run with Java and the upstream TLC 1.7.4 `tla2tools.jar`:

```sh
cd experiments/morphogenesis-paper/model
java -cp /path/to/tla2tools.jar tlc2.TLC -workers 2 -metadir /tmp/tlc-supersession -config Supersession.cfg Supersession.tla
```

Three mutation configurations must fail: `unsafe-drain.cfg` violates
SafeTerminal; `fresh-retry.cfg` violates StableEffect; `legacy-loser.cfg`
violates EventuallyClosed. Deadlock checking is disabled because completed
executions intentionally have no outgoing non-stuttering step; the explicit
liveness property still rejects a permanently nonterminal loser.

The v0.5 evidence folder retains complete logs, counts and counterexamples.
