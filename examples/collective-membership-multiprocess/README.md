# Five-peer dynamic membership example

This scenario starts five independent Node.js peer processes with direct HTTP
protocol traffic and peer-scoped PostgreSQL state. It demonstrates:

1. a fifth peer joining through old-and-new joint majorities;
2. one peer rotating to a replacement Ed25519 key with an overlap window;
3. that peer restarting and voting with the replacement key;
4. the joined peer leaving through another joint-majority certificate;
5. historical quorum bindings remaining pinned to their original epochs; and
6. a later transition failing closed after the available old set loses its
   majority.

Run it against the temporary PostgreSQL container used by the other distributed
examples:

```sh
docker compose -f examples/mesh-multiprocess/compose.yaml up -d --wait
pnpm run example:collective-membership-multiprocess
docker compose -f examples/mesh-multiprocess/compose.yaml down
```

`DATABASE_URL` or standard `PG*` variables override the local defaults. The
launcher creates a random schema and removes only that schema on exit. Private
keys are ephemeral and passed only to their owning child processes, except for
the launcher-held key proofs needed to construct this self-contained demo.
