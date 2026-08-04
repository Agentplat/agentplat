# Replicated planning artifacts multiprocess scenario

This local scenario starts three independent Node.js peer processes with three
independently scoped PostgreSQL schemas. A producer persists and signs one
planning fragment, two receivers resolve only the artifact named by the offer,
and one receiver restarts and restores the artifact from durable storage.

The point fetch intentionally creates no collective readiness certificate. The
transport is local HTTP with authenticated protocol envelopes; no cloud service
or package registry is used.

Run it with:

```sh
DATABASE_URL=postgresql://... pnpm run example:planning-artifacts-multiprocess
```

The PostgreSQL account must be able to create schemas. The scenario removes all
temporary schemas when it exits.
