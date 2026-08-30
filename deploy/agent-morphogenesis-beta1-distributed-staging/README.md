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
