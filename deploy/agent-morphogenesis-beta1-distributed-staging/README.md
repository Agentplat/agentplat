# Agent Morphogenesis Beta 1 distributed staging deployment

This directory binds the qualification profile to a real environment. Copy
`inventory.template.json` outside the repository, replace every placeholder
with immutable provider identifiers and set `status` to `bound`. The inventory
is intentionally rejected when it contains loopback addresses, example values,
mutable image tags, duplicate zones or node UIDs, fewer than three failure
domains, exportable keys, disabled rotation or a rollback witness sharing the
cluster/KMS protection domain.

Inspect a bound inventory without executing Morphogenesis:

```sh
node scripts/agent-morphogenesis-beta1-staging-environment.mjs \
  --mode inspect \
  --inventory /external/path/staging-inventory.json \
  --output-directory /external/path/environment-inspection
```

The resulting receipt proves only that declared bindings satisfy the topology
contract. It does not contact providers, inject faults, collect runtime
evidence or establish staging qualification. Provider identity, KMS key state,
node placement, endpoints and alert delivery must subsequently be resolved and
attested by the distributed campaign supervisor.

Resolve Kubernetes and AWS KMS identities read-only after inspection:

```sh
node scripts/agent-morphogenesis-beta1-staging-environment.mjs \
  --mode resolve-provider \
  --inventory /external/path/staging-inventory.json \
  --inspection /external/path/environment-inspection/environment-inspection.json \
  --output-directory /external/path/provider-resolution \
  --aws-region us-east-1
```

Resolution requires the exact kube context, API server, namespace UID, three
declared Ready node UIDs and zone labels. It also resolves the canonical KMS
ARN, enabled state, Ed25519 key spec, signing usage and public-key fingerprint.
It performs no mutation and still produces no runtime qualification evidence.

The Mesh peer used by the multiprocess campaign also supports an opt-in remote
control plane for placement in separate pods or hosts. Set a dedicated
`MESH_CONTROL_TOKEN` and `MESH_LISTEN_HOST`; `/healthz` reports identity, while
authenticated `/agentplat/staging/v1/commands` and `/events` expose bounded
commands and a 4,096-entry content-free event journal. When no control token is
configured, both control routes return 404. Mesh envelope authentication remains
separate and the control plane never grants Morphogenesis authority.

After publishing the peer image and resolving the provider, render an external
deployment directory. The public-key bindings file maps each peer ID to its
opaque Mesh key ID and public Ed25519 JWK; private `d` members are rejected.
Its canonical SHA-256 digest must match the bound inventory.

```sh
pnpm render:agent-morphogenesis-beta1-staging-deployment -- \
  --source-sha COMMIT \
  --inventory /external/inventory.json \
  --inspection /external/inspection/environment-inspection.json \
  --provider-resolution /external/provider/provider-resolution.json \
  --public-key-bindings /external/public-key-bindings.json \
  --output-directory /external/rendered-deployment
```

The renderer replaces the image placeholder only with the inventory's immutable
digest and emits an immutable ConfigMap plus an artifact manifest. It never
renders credentials. Operators must create `morphogenesis-mesh-credentials`
through their secret manager and verify its database, channel and control
bindings before applying the rendered files.

Run the server-side preflight before mutation. It requests only Secret key
names through a Go template, never Secret values. Application requires the
exact confirmation token and emits pod, node, zone, image and health bindings:

```sh
pnpm preflight:agent-morphogenesis-beta1-staging-deploy -- \
  --inventory /external/inventory.json \
  --render-directory /external/rendered-deployment \
  --output-directory /external/deployment-preflight

pnpm apply:agent-morphogenesis-beta1-staging-deploy -- \
  --confirm APPLY_MORPHOGENESIS_DISTRIBUTED_STAGING \
  --inventory /external/inventory.json \
  --render-directory /external/rendered-deployment \
  --preflight /external/deployment-preflight/deployment-preflight.json \
  --output-directory /external/deployment-receipt
```

The apply command still does not establish staging qualification. It proves the
initial four identities are Ready across at least three real zones/nodes and
using external signing custody. Fault cycles must raise cumulative process
starts to six or more before that campaign gate can pass.

The durable supervisor is planned only after deployment. Planning binds the
clean commit, inventory digest, deployment receipt and campaign KMS public key.
It does not permit execution. A policy-eligible agent, person or quorum must
then authorize the exact config digest with KMS for a validity window covering
the target 72-hour soak plus recovery margin.

Drivers submit sequential KMS-signed operation receipts. The supervisor rejects
unsigned, expired, replayed, out-of-order or unsafe receipts. It completes only
after both exact 22-scenario sets, every frozen fault/upgrade/restore/rotation
count, isolation and alert delivery, and a ≥24-hour/1,000-run soak. Completion
still leaves production readiness and production claims disabled.
