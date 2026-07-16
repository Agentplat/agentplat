# ECS/Fargate + existing RDS example

This example reuses an existing VPC, ECS cluster, RDS/Aurora PostgreSQL cluster
and optional Redis endpoint. It does not provision DynamoDB or require Agent
Rooms.

Files:

- `task-definition.json`: application service using RDS IAM authentication.
- `github-actions-migrate.yml`: deploy gate that runs the same image once with
  a migration command before updating the service.

Replace every `111122223333`, Region, subnet, security group, image and role
placeholder. The application task role needs only its runtime permissions and
the exact `rds-db:connect` database user ARN. The migration task role is passed
as a task override and maps to a PostgreSQL login that owns the application
schema.

The image must include the RDS global CA bundle at
`/app/certs/rds-global-bundle.pem` and provide:

```json
{
  "scripts": {
    "start": "node dist/server.js",
    "db:migrate": "pnpm --filter @agentplat/audit-postgres migrate"
  }
}
```

The sample injects no database password. The Node pool uses an RDS Signer
password callback and credentials from the ECS task role. For Secrets Manager
instead, add a task-definition `secrets` entry for a specific JSON key and plan
a forced service deployment after rotation.
