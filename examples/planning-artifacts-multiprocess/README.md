# Certified multi-source planning availability scenario

This local scenario starts five independent Node.js peer processes with five
independently scoped PostgreSQL schemas. A producer persists and signs one
planning fragment, deterministically places it on two replicas, collects two
signed storage receipts, and distributes the resulting replication
certificate. The producer process is then stopped permanently. A peer with no
prior copy resolves the exact artifact from a certified replica and preserves
both the artifact and certificate across restart.

Both replication and exact point resolution use bounded local HTTP with
membership-bound authenticated envelopes. Point resolution intentionally
creates no collective catch-up certificate. No cloud service or package
registry is used.

Run it with:

```sh
DATABASE_URL=postgresql://... pnpm run example:planning-artifacts-multiprocess
```

The PostgreSQL account must be able to create schemas. The scenario removes all
temporary schemas when it exits.
