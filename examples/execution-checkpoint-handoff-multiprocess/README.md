# Replicated execution checkpoint handoff scenario

This local scenario starts five independent Node.js peer processes with five
independently scoped PostgreSQL schemas. A source peer publishes portable
application state to a deterministic replica set and obtains signed storage and
certificate-custody evidence. The source is then stopped permanently. A peer
outside the replica set discovers the certificate, resolves the exact artifact
from a receipt holder and preserves both across restart.

Communication uses bounded local HTTP with membership-bound signed envelopes.
No cloud service, external model or package registry is used.

Run it with:

```sh
DATABASE_URL=postgresql://... \
  pnpm run example:execution-checkpoint-handoff-multiprocess
```

The PostgreSQL account must be able to create schemas. The scenario removes all
temporary schemas when it exits.
