import type { Pool, PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import {
  getPostgresMigrationStatus,
  qualifyPostgresName,
  runPostgresMigrations,
  type PostgresMigration,
} from "@agentplat/postgres";
import type {
  ArtifactDocument,
  ArtifactRevision,
  ArtifactStore,
} from "@agentplat/artifacts";
import type { AgentPlatEvent, EventPublisher } from "@agentplat/events";

export const artifactMigrations: readonly PostgresMigration[] = [
  {
    version: 1,
    name: "artifacts",
    up: `CREATE TABLE __AGENTPLAT_SCHEMA__.artifacts (
    tenant_id text NOT NULL,
    artifact_id text COLLATE "C" NOT NULL,
    revision integer NOT NULL CHECK (revision > 0),
    document jsonb NOT NULL,
    PRIMARY KEY (tenant_id, artifact_id),
    CHECK (document->'artifact'->>'tenantId' = tenant_id),
    CHECK (document->'artifact'->>'id' = artifact_id),
    CHECK ((document->'artifact'->>'revision')::integer = revision)
  );
  CREATE TABLE __AGENTPLAT_SCHEMA__.artifact_revisions (
    tenant_id text NOT NULL,
    artifact_id text COLLATE "C" NOT NULL,
    revision integer NOT NULL CHECK (revision > 0),
    document jsonb NOT NULL,
    PRIMARY KEY (tenant_id, artifact_id, revision),
    FOREIGN KEY (tenant_id, artifact_id) REFERENCES __AGENTPLAT_SCHEMA__.artifacts (tenant_id, artifact_id) ON DELETE CASCADE,
    CHECK (document->'artifact'->>'tenantId' = tenant_id),
    CHECK (document->'artifact'->>'id' = artifact_id),
    CHECK ((document->'artifact'->>'revision')::integer = revision)
  );`,
    down: `DROP TABLE __AGENTPLAT_SCHEMA__.artifact_revisions; DROP TABLE __AGENTPLAT_SCHEMA__.artifacts;`,
    destructiveDown: true,
  },
  {
    version: 2,
    name: "artifact_event_outbox",
    up: `CREATE TABLE __AGENTPLAT_SCHEMA__.artifact_event_outbox (
    event_id text PRIMARY KEY,
    tenant_id text NOT NULL,
    event jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    lease_until timestamptz,
    lease_token text,
    delivered_at timestamptz,
    CHECK (event->>'id' = event_id),
    CHECK (event->>'tenantId' = tenant_id)
  );
  CREATE INDEX artifact_event_outbox_pending_idx ON __AGENTPLAT_SCHEMA__.artifact_event_outbox (created_at) WHERE delivered_at IS NULL;`,
    down: `DROP INDEX __AGENTPLAT_SCHEMA__.artifact_event_outbox_pending_idx; DROP TABLE __AGENTPLAT_SCHEMA__.artifact_event_outbox;`,
    destructiveDown: true,
  },
];

export function runMigrations(
  pool: Pool,
  options: { schema?: string; createSchema?: boolean } = {},
) {
  return runPostgresMigrations(pool, {
    ...options,
    applicationId: "@agentplat/artifacts-postgres",
    migrations: artifactMigrations,
  });
}
export function getMigrationStatus(
  pool: Pool,
  options: { schema?: string } = {},
) {
  return getPostgresMigrationStatus(pool, {
    ...options,
    applicationId: "@agentplat/artifacts-postgres",
    migrations: artifactMigrations,
  });
}

/** Durable artifact head and immutable revision store with transactionally enforced CAS. */
export class PostgresArtifactStore implements ArtifactStore {
  readonly #heads: string;
  readonly #revisions: string;
  readonly #outbox: string;
  constructor(
    readonly pool: Pool,
    schema = "public",
  ) {
    this.#heads = qualifyPostgresName(schema, "artifacts");
    this.#revisions = qualifyPostgresName(schema, "artifact_revisions");
    this.#outbox = qualifyPostgresName(schema, "artifact_event_outbox");
  }
  async create(input: ArtifactDocument): Promise<boolean> {
    return this.#create(input);
  }
  async createWithEvent(
    input: ArtifactDocument,
    event: AgentPlatEvent,
  ): Promise<boolean> {
    return this.#create(input, event);
  }
  async #create(
    input: ArtifactDocument,
    event?: AgentPlatEvent,
  ): Promise<boolean> {
    assertDocument(input, 1);
    return this.#transaction(async (client) => {
      const result = await client.query(
        `INSERT INTO ${this.#heads} (tenant_id,artifact_id,revision,document) VALUES ($1,$2,1,$3) ON CONFLICT DO NOTHING`,
        [input.artifact.tenantId, input.artifact.id, input],
      );
      if (result.rowCount !== 1) return false;
      await client.query(
        `INSERT INTO ${this.#revisions} (tenant_id,artifact_id,revision,document) VALUES ($1,$2,1,$3)`,
        [input.artifact.tenantId, input.artifact.id, input],
      );
      if (event) await insertOutbox(client, this.#outbox, event);
      return true;
    });
  }
  async get(
    tenantId: string,
    id: string,
    revision?: number,
  ): Promise<ArtifactDocument | undefined> {
    const result =
      revision === undefined
        ? await this.pool.query(
            `SELECT document FROM ${this.#heads} WHERE tenant_id=$1 AND artifact_id=$2`,
            [tenantId, id],
          )
        : await this.pool.query(
            `SELECT document FROM ${this.#revisions} WHERE tenant_id=$1 AND artifact_id=$2 AND revision=$3`,
            [tenantId, id, revision],
          );
    const document = result.rows[0]?.document as ArtifactDocument | undefined;
    return document ? structuredClone(document) : undefined;
  }
  async compareAndSet(
    input: ArtifactDocument,
    expectedRevision: number,
  ): Promise<boolean> {
    return this.#compareAndSet(input, expectedRevision);
  }
  async compareAndSetWithEvent(
    input: ArtifactDocument,
    expectedRevision: number,
    event: AgentPlatEvent,
  ): Promise<boolean> {
    return this.#compareAndSet(input, expectedRevision, event);
  }
  async #compareAndSet(
    input: ArtifactDocument,
    expectedRevision: number,
    event?: AgentPlatEvent,
  ): Promise<boolean> {
    assertDocument(input, expectedRevision + 1);
    if (input.revision.expectedPreviousRevision !== expectedRevision)
      return false;
    return this.#transaction(async (client) => {
      const updated = await client.query(
        `UPDATE ${this.#heads} SET revision=$3,document=$4 WHERE tenant_id=$1 AND artifact_id=$2 AND revision=$5`,
        [
          input.artifact.tenantId,
          input.artifact.id,
          input.artifact.revision,
          input,
          expectedRevision,
        ],
      );
      if (updated.rowCount !== 1) return false;
      await client.query(
        `INSERT INTO ${this.#revisions} (tenant_id,artifact_id,revision,document) VALUES ($1,$2,$3,$4)`,
        [
          input.artifact.tenantId,
          input.artifact.id,
          input.artifact.revision,
          input,
        ],
      );
      if (event) await insertOutbox(client, this.#outbox, event);
      return true;
    });
  }
  async listRevisions(
    tenantId: string,
    id: string,
  ): Promise<ArtifactRevision[]> {
    const result = await this.pool.query(
      `SELECT document FROM ${this.#revisions} WHERE tenant_id=$1 AND artifact_id=$2 ORDER BY revision`,
      [tenantId, id],
    );
    return result.rows.map((row) =>
      structuredClone((row.document as ArtifactDocument).revision),
    );
  }
  async dispatchOutbox(
    publisher: EventPublisher,
    options: { limit?: number } = {},
  ): Promise<number> {
    const limit = options.limit ?? 100;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000)
      throw new TypeError("outbox_limit_invalid");
    const leaseToken = randomUUID();
    const claimed = await this.#transaction(async (client) => {
      const rows = await client.query(
        `SELECT event_id,event FROM ${this.#outbox} WHERE delivered_at IS NULL AND (lease_until IS NULL OR lease_until < now()) ORDER BY created_at,event_id FOR UPDATE SKIP LOCKED LIMIT $1`,
        [limit],
      );
      for (const row of rows.rows)
        await client.query(
          `UPDATE ${this.#outbox} SET lease_until=now()+interval '60 seconds',lease_token=$2,attempts=attempts+1 WHERE event_id=$1`,
          [row.event_id, leaseToken],
        );
      return rows.rows as Array<{ event_id: string; event: AgentPlatEvent }>;
    });
    let delivered = 0;
    for (const row of claimed) {
      try {
        await publisher.publish(row.event);
        await this.pool.query(
          `UPDATE ${this.#outbox} SET delivered_at=now(),lease_until=NULL,lease_token=NULL WHERE event_id=$1 AND lease_token=$2 AND delivered_at IS NULL`,
          [row.event_id, leaseToken],
        );
        delivered += 1;
      } catch {
        await this.pool.query(
          `UPDATE ${this.#outbox} SET lease_until=NULL,lease_token=NULL WHERE event_id=$1 AND lease_token=$2 AND delivered_at IS NULL`,
          [row.event_id, leaseToken],
        );
      }
    }
    return delivered;
  }
  async #transaction<T>(
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

async function insertOutbox(
  client: PoolClient,
  table: string,
  event: AgentPlatEvent,
): Promise<void> {
  if (
    !event.id.trim() ||
    !event.tenantId.trim() ||
    event.tenantId.length > 2048
  )
    throw new TypeError("artifact_event_invalid");
  await client.query(
    `INSERT INTO ${table} (event_id,tenant_id,event) VALUES ($1,$2,$3)`,
    [event.id, event.tenantId, event],
  );
}

function assertDocument(
  document: ArtifactDocument,
  expectedRevision: number,
): void {
  if (
    !document ||
    document.artifact.tenantId !== document.revision.tenantId ||
    document.artifact.id !== document.revision.artifactId ||
    document.artifact.revision !== expectedRevision ||
    document.revision.revision !== expectedRevision ||
    document.artifact.digest !== document.revision.digest ||
    document.artifact.byteLength !== document.revision.byteLength ||
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 1
  )
    throw new TypeError("artifact_document_invalid");
}
