# Collective sync multiprocess scenario

This local scenario starts three independent Node.js processes and one shared
PostgreSQL database. It demonstrates:

1. an empty joining peer recovering a two-record causal chain;
2. a network partition failing closed below the frontier threshold;
3. partition healing and selective one-record catch-up;
4. membership-epoch and signing-key rotation invalidating old readiness;
5. recertification under the new epoch; and
6. process restart restoring both reducer projection and readiness evidence.

Run migrations and the scenario with:

```sh
DATABASE_URL=postgresql://... pnpm run example:collective-sync-multiprocess
```

It creates and removes a unique schema. No cloud service or package registry is
used. The PostgreSQL account must be allowed to create schemas.
