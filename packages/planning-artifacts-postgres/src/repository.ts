import {
  validatePlanningFragmentRepositoryRecordV1,
  type PlanningFragmentRepositoryRecordV1,
  type PlanningFragmentRepositoryV1,
} from "@agentplat/collective-planning/mesh";
import { canonicalizeMeshJsonBytes } from "@agentplat/mesh-protocol";
import {
  defaultPostgresSchema,
  normalizePostgresIdentifier,
  quotePostgresIdentifier,
} from "@agentplat/postgres";
import type { Pool } from "pg";

export interface PostgresPlanningFragmentRepositoryOptionsV1 {
  readonly schema?: string;
  readonly tenantId: string;
  readonly meshId: string;
  readonly peerId: string;
  readonly instanceId: string;
  readonly policyDomainId: string;
  readonly maximumArtifactBytes?: number;
}

interface ArtifactRow {
  readonly artifact: unknown;
}

/** Immutable, instance-scoped storage for locally owned and replicated artifacts. */
export class PostgresPlanningFragmentRepositoryV1 implements PlanningFragmentRepositoryV1 {
  readonly #prefix: string;
  readonly #scope: readonly [string, string, string, string, string];
  readonly #maximumArtifactBytes: number;

  constructor(
    readonly pool: Pool,
    readonly options: PostgresPlanningFragmentRepositoryOptionsV1,
  ) {
    if (
      !pool ||
      !options?.tenantId ||
      !options.meshId ||
      !options.peerId ||
      !options.instanceId ||
      !options.policyDomainId
    )
      throw new TypeError("PostgreSQL planning artifact scope is required");
    const maximum = options.maximumArtifactBytes ?? 262_144;
    if (
      !Number.isSafeInteger(maximum) ||
      maximum < 1_024 ||
      maximum > 1_048_576
    )
      throw new RangeError(
        "PostgreSQL planning artifact byte limit is invalid",
      );
    this.#maximumArtifactBytes = maximum;
    this.#prefix = `${quotePostgresIdentifier(
      normalizePostgresIdentifier(
        options.schema ?? defaultPostgresSchema,
        "schema",
      ),
    )}.`;
    this.#scope = Object.freeze([
      options.tenantId,
      options.meshId,
      options.peerId,
      options.instanceId,
      options.policyDomainId,
    ]);
  }

  async put(
    input: PlanningFragmentRepositoryRecordV1,
  ): Promise<PlanningFragmentRepositoryRecordV1> {
    const record = this.#validate(input);
    const result = await this.pool.query(
      `INSERT INTO ${this.#prefix}planning_artifacts
        (tenant_id, mesh_id, peer_id, instance_id, policy_domain_id,
         content_reference, objective_id, mission_intent_id, intent_revision,
         fragment_id, fragment_revision, fragment_digest, artifact)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
       ON CONFLICT DO NOTHING`,
      [
        ...this.#scope,
        record.contentReference,
        record.objectiveId,
        record.missionIntentId,
        record.intentRevision,
        record.fragment.fragmentId,
        record.fragment.fragmentRevision,
        record.fragmentDigest,
        JSON.stringify(record),
      ],
    );
    if ((result.rowCount ?? 0) === 1) return record;

    const existing = await this.get(record.contentReference);
    if (existing) {
      if (!sameArtifact(existing, record))
        throw new Error("planning_artifact_content_address_conflict");
      return existing;
    }
    const identity = await this.pool.query<ArtifactRow>(
      `SELECT artifact FROM ${this.#prefix}planning_artifacts
        WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
          AND instance_id = $4 AND policy_domain_id = $5
          AND objective_id = $6 AND mission_intent_id = $7
          AND intent_revision = $8 AND fragment_id = $9
          AND fragment_revision = $10`,
      [
        ...this.#scope,
        record.objectiveId,
        record.missionIntentId,
        record.intentRevision,
        record.fragment.fragmentId,
        record.fragment.fragmentRevision,
      ],
    );
    if (identity.rows[0])
      throw new Error("planning_artifact_domain_identity_conflict");
    throw new Error("planning_artifact_insert_conflict");
  }

  async get(
    contentReference: string,
  ): Promise<PlanningFragmentRepositoryRecordV1 | null> {
    if (typeof contentReference !== "string" || contentReference.length < 1)
      throw new TypeError("Planning content reference is invalid");
    const result = await this.pool.query<ArtifactRow>(
      `SELECT artifact FROM ${this.#prefix}planning_artifacts
        WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
          AND instance_id = $4 AND policy_domain_id = $5
          AND content_reference = $6`,
      [...this.#scope, contentReference],
    );
    return result.rows[0] ? this.#validate(result.rows[0].artifact) : null;
  }

  #validate(input: unknown): PlanningFragmentRepositoryRecordV1 {
    const record = validatePlanningFragmentRepositoryRecordV1(input);
    if (
      record.tenantId !== this.options.tenantId ||
      record.meshId !== this.options.meshId ||
      record.policyDomainId !== this.options.policyDomainId
    )
      throw new TypeError("planning_artifact_scope_invalid");
    const canonical = canonicalizeMeshJsonBytes(record);
    if (
      !canonical.ok ||
      canonical.value.byteLength > this.#maximumArtifactBytes
    )
      throw new RangeError("planning_artifact_exceeds_byte_limit");
    return record;
  }
}

function sameArtifact(
  left: PlanningFragmentRepositoryRecordV1,
  right: PlanningFragmentRepositoryRecordV1,
): boolean {
  const leftBytes = canonicalizeMeshJsonBytes(left);
  const rightBytes = canonicalizeMeshJsonBytes(right);
  if (!leftBytes.ok || !rightBytes.ok) return false;
  if (leftBytes.value.byteLength !== rightBytes.value.byteLength) return false;
  return leftBytes.value.every(
    (byte, index) => byte === rightBytes.value[index],
  );
}
