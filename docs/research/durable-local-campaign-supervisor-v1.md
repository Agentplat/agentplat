# Durable local campaign supervisor V1

Status: implemented operational control surface. Starting a supervisor requires
a separately registered campaign and signed shard authorization.

## Purpose

The supervisor keeps a long-running local empirical campaign independent from
the terminal or automation client that started it. It does not create a study,
authorize execution, change a registered shard, interpret a result or grant an
empirical claim. It repeatedly invokes the one-shard campaign boundary and
stops on the first rejected or incomplete shard.

The supervisor is deliberately outside the immutable scientific store. Its
heartbeat, requested state and draft report are mutable operational metadata.
Shard receipts, projection indexes and content-addressed artifacts remain the
scientific authority.

## Process model

`start` validates and stores one immutable supervisor configuration, requests
the `running` state and launches a detached Node.js worker. The worker:

1. acquires an exclusive local process lock;
2. validates the hash-chained event journal;
3. verifies campaign closure through the registered campaign status command;
4. selects the first authorized shard without an immutable receipt;
5. executes exactly that shard with the registered confirmation boundary;
6. records its wall time, executed/resumed slot counts, projection count,
   receipt digest and bounded host/store samples;
7. refreshes the draft execution report; and
8. repeats only when the requested state remains `running`.

A worker recovery recomputes closure from immutable shard receipts. It does not
trust a mutable completed-shard counter.

On macOS the worker starts `caffeinate` bound to its own PID on a best-effort
basis. Other operating systems retain their normal operator-owned power policy.
A reboot or forced process termination still requires `resume`.

## Control semantics

- `pause` takes effect no later than the next shard boundary. It never kills a
  shard that is already producing evidence.
- `resume` updates the requested state and starts a replacement worker when no
  live lock owner exists.
- `stop` is graceful and also takes effect at a shard boundary.
- `status` reports live-process state, heartbeat age, the current shard and
  closure recomputed from verified receipts.
- `report` regenerates the paper-oriented Markdown report from the event chain
  and campaign closure.

There is no force-kill command. Operating-system process termination remains an
explicit incident and may leave an unclosed shard to be resumed.

## Files

The external supervisor directory contains:

- `supervisor-config.json`: immutable paths, source, shard scope and policy;
- `supervisor-control.json`: atomic requested state and monotonic revision;
- `supervisor-state.json`: atomic PID, heartbeat and observed state;
- `supervisor-events.jsonl`: fsync-backed hash-chained operational events;
- `supervisor.lock`: exclusive live-worker claim;
- `supervisor.stdout.log` and `supervisor.stderr.log`: detached process logs;
- `execution-report.md`: atomic in-progress report; and
- `execution-report-final.md`: immutable report created only at exact shard
  closure.

The event journal and the latest state anchor detect accidental truncation,
uncoordinated deletion, reordering, mutation and broken predecessor links. A
same-account attacker who can rewrite the journal and its mutable anchor can
recompute this operational chain. It is therefore not an authentication
mechanism or a substitute for the separately signed registration,
authorization or final result attestation.

## Start example

All directories must be absolute and outside the source checkout.

```sh
pnpm run evidence:empirical-supervisor:start -- \
  --campaign-id paper-study-v3 \
  --source-sha <40-hex-commit> \
  --registration-directory <registration-directory> \
  --authorization-directory <authorization-directory> \
  --output-directory <campaign-output-directory> \
  --store-directory <content-addressed-store-directory> \
  --supervisor-directory <supervisor-directory> \
  --shard-indices 0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47 \
  --worker-id-prefix local-paper-v3 \
  --heartbeat-seconds 15 \
  --confirm START_DURABLE_LOCAL_CAMPAIGN
```

Control commands require their exact confirmation:

```sh
pnpm run evidence:empirical-supervisor:status -- \
  --supervisor-directory <supervisor-directory>

pnpm run evidence:empirical-supervisor:pause -- \
  --supervisor-directory <supervisor-directory> \
  --confirm PAUSE_DURABLE_LOCAL_CAMPAIGN

pnpm run evidence:empirical-supervisor:resume -- \
  --supervisor-directory <supervisor-directory> \
  --confirm RESUME_DURABLE_LOCAL_CAMPAIGN

pnpm run evidence:empirical-supervisor:stop -- \
  --supervisor-directory <supervisor-directory> \
  --confirm STOP_DURABLE_LOCAL_CAMPAIGN
```

## Paper record

The generated report includes only public environment attributes: operating
system family/release, architecture, Node.js version, CPU model, logical CPU
count and total memory. Host names, user names, hardware identifiers, serial
numbers, credentials, private keys and configured private paths are excluded.

Each completed shard row binds:

- shard index;
- wall-clock duration;
- best-effort peak resident memory sampled from the child process on supported
  hosts;
- executed and resumed slot counts;
- projection count; and
- immutable receipt digest.

Supervisor restarts and shard failures remain visible as interruptions. An
interrupted shard is never counted before its immutable receipt exists.
An unavailable process-memory sampler is reported as unavailable rather than
being inferred from whole-host free memory.

## Source revision rule

Adding or changing this supervisor changes the source tree. Evidence produced
under an earlier source registration cannot be mixed with a campaign created
from the new revision. Earlier receipts remain valid evidence of their original
revision, but a paper campaign using the supervisor must be preregistered and
authorized again from shard zero.
