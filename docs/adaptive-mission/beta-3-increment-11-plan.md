# Beta 3 increment 11: registered runtime preflight

## Objective

Increment 11 converts the protected statistical control plane from an
unregistered execution boundary into a registered, provider-neutral runtime
preflight. It adds a closed adapter registry, shared PostgreSQL custody,
fence-aware execution commits, an evaluator-owned projection adapter and one
manual five-cell/twenty-slot preflight.

This increment does not execute the 240-cell campaign, make an eligibility or
performance claim, publish packages, deploy infrastructure or call a paid
model provider. The complete 48-shard fan-out remains fail-closed.

## Fixed operation boundary

The preflight uses one registered shard containing exactly five cells and four
logical slots per cell: adaptive and centralized runners, each with first and
exact-replay attempts. Its purpose is to certify registration, authorization,
durability, recovery, projection and evidence closure before a complete
campaign can be authorized.

The following limits remain non-overridable:

- five cells and twenty slots per preflight;
- at most 5,000 event-derived interactions per execution;
- at most 100,000 trace events per execution;
- 16 MiB per streamed artifact, 256 MiB per verified closure and 16,384
  artifacts;
- one or two concurrent campaign shards only; and
- no automatic, scheduled or pull-request-triggered execution.

## Architecture

### Closed adapter registry

The registry is built from an explicit allowlist of immutable descriptors and
separate runner/projector ports. Resolution requires the exact descriptor,
implementation, evaluator, plan and authorization commitments. It accepts no
module path, mutable tag, URL, credential or late registration call.

The descriptor class is `normative_candidate`; diagnostic and synthetic
implementations remain ineligible. Registration proves only that the selected
ports match the committed candidate. It does not establish campaign
eligibility.

### Fence-aware execution

The registered path requires a fenced execution store. A durable execution
commit includes the current execution, registration, cell, run key, operation
deadline and lease fence. The store validates the complete provenance and its
expiry atomically before considering an identical commit a duplicate. A late
worker therefore cannot publish a result after another worker has taken over,
even when both results contain identical bytes.

The historical unfenced store remains available to diagnostic consumers for
compatibility. It cannot satisfy the registered operation port.

### Shared PostgreSQL custody

The PostgreSQL adapter stores campaign state, immutable slot commits,
content-addressed artifact bytes and immutable logical artifact bindings under
an explicit namespace. SQL identifiers are normalized, logical identifiers
are parameters rather than paths, and the caller owns connection lifecycle
and migrations.

State compare-and-swap, fence validation and slot publication occur under one
database transaction. PostgreSQL wall-clock time is sampled after the state
row lock is acquired, so time spent waiting for the lock cannot preserve an
expired lease. Same logical identity, canonical content and complete
provenance is idempotent; any divergent binding is a conflict.

The adapter is self-hostable and requires no managed service. Tests use local
or fake infrastructure and ordinary CI makes no external network or model
calls.

### Runner and evaluator separation

The registered runner executes only through public observation and protected
effect boundaries. A distinct evaluator port derives metric projections from
the immutable execution artifacts. The evaluator digest differs from the
runner implementation digest, and the registry cannot substitute either
port.

The evaluator and custody adapter remain in the protected process. Runner code
executes in a digest-pinned, read-only container with no network, no Linux
capabilities and no custody environment. The CLI constructs the PostgreSQL
pool and removes the URL, user and password from its environment before the
isolated runner starts. Loading arbitrary third-party code remains outside the
closed registry.

Mission and safety failures are valid evaluated outcomes; they cannot be
relabeled as infrastructure failures. Only malformed, incomplete or
cryptographically misbound evidence is infrastructure-invalid.

## Manual preflight

The protected preflight is a separate manual operation. Planning remains safe
under `DO_NOT_RUN`; execution requires an exact preflight confirmation and a
protected environment approval. The protected environment supplies an Ed25519
signing key and its independently configured trusted public key; execution
recomputes the credential fingerprint and rejects self-issued replacements.
The signing key is present only in the protected authorization step. The
unprotected planning job receives neither key. The job uses an ephemeral,
digest-pinned PostgreSQL service and no cloud credentials. It writes a cost
ceiling before resolving the adapter and cannot start the complete 48-shard
matrix.

### Protected environment provisioning

Generate one Ed25519 pair offline and keep the private material out of the
repository and workflow artifacts:

```sh
openssl genpkey -algorithm ED25519 -out preflight-private.pem
openssl pkey -in preflight-private.pem -pubout -out preflight-public.pem
base64 < preflight-private.pem | tr -d '\n'
base64 < preflight-public.pem | tr -d '\n'
openssl rand -base64 32
```

Configure the first value as the protected-environment secret
`AGENTPLAT_PREFLIGHT_SIGNING_PRIVATE_KEY_B64` and the second as the
protected-environment variable
`AGENTPLAT_PREFLIGHT_TRUSTED_PUBLIC_KEY_B64`. Require an environment reviewer
before execution. Configure the random third value as the independent
protected-environment secret `AGENTPLAT_PREFLIGHT_DATABASE_PASSWORD`; it is
used only by the ephemeral PostgreSQL service and custody process. Rotation of
the signing pair replaces both key values as one change; a mismatched pair
fails before authorization is written.

The preflight produces:

1. immutable source, adapter, registration and plan commitments;
2. a detached operation authorization bound to the selected shard;
3. twenty immutable slot executions and twenty evaluator projections;
4. a restart/recovery result using the same durable namespace;
5. a verified artifact closure and registration receipt; and
6. a generic fail-closed status when any gate rejects the operation.

Receipts contain identifiers, digests, counts and reason codes only. Raw
prompts, private reasoning, secrets, hidden world values, unrestricted
observations and process environments are excluded.

## Acceptance criteria

- A valid allowlisted candidate resolves the exact runner and evaluator; all
  descriptor, implementation, evaluator, plan and authorization substitutions
  fail before execution.
- A five-cell shard closes exactly twenty first/replay projections and a fresh
  process can resume it without executing a completed slot again.
- A worker with an expired or superseded fence cannot publish a slot,
  projection or settlement, including when its bytes match the winner.
- PostgreSQL state CAS, immutable slot commits and artifact bindings remain
  correct under two competing clients and a response-loss retry.
- Evaluator projection is trace-bound, respects interaction ceilings and maps
  mission/safety failure to an evaluated terminal outcome.
- All evidence reads revalidate byte length, SHA-256 content and canonical
  domain digest; missing, extra, corrupt or cross-namespace content fails
  closed.
- The manual workflow has read-only repository permission, pinned actions,
  disabled persisted checkout credentials, no schedule, no deployment and no
  publication step.
- The public audit, types, unit tests, adapter tests, packed consumers and full
  repository check pass without changing existing defaults or wire formats.

## Deferred boundary

Increment 12 will decide whether to authorize and execute the complete
240-cell/960-slot campaign using an externally operated durable backend. That
decision requires a separate cost estimate, credentials and explicit operator
approval. Statistical eligibility, release publication and package promotion
remain outside Increment 11.
