# Five-peer distributed quorum example

This example starts five independent Node.js processes: two proposers and three
witnesses. Protocol traffic goes directly between peer HTTP endpoints. The
launcher triggers operations and observes results; it does not route messages
or choose a value.

The scenario proves three behaviors:

1. a proposer obtains a signed majority certificate;
2. one witness is killed and restarted, then a different proposer carries the
   previously accepted value into its higher ballot using PostgreSQL state;
3. two witnesses are stopped and the remaining minority fails closed.

Start the same temporary PostgreSQL container used by the Mesh examples:

```sh
docker compose -f examples/mesh-multiprocess/compose.yaml up -d --wait
pnpm run example:collective-quorum-multiprocess
docker compose -f examples/mesh-multiprocess/compose.yaml down
```

`DATABASE_URL` or the standard `PG*` variables override the local defaults.
The launcher creates a random schema and removes only that schema on exit.
Ephemeral private keys are passed only to their owning child processes and are
never stored in PostgreSQL.
