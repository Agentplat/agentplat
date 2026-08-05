# Seven-process collective agreement

This example starts seven independent validator processes, each with its own
HTTP endpoint and PostgreSQL-scoped durable state. Two validators deliberately
return unavailable responses. The remaining five complete a `2f + 1` prevote
and precommit for `f = 2`. The proposer is then stopped and restarted with the
same identity; its durable lock and commit certificate must still be present.

Run against an isolated PostgreSQL database:

```sh
DATABASE_URL=postgresql://127.0.0.1:5432/agentplat \
  pnpm run example:byzantine-agreement-multiprocess
```

The script creates and removes a unique schema. It performs no cloud deployment
and does not create a database server.
