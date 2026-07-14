import { AgentPlatError } from '@agentplat/core';
import type {
  AgentPlatID,
  JsonObject,
  JsonValue,
  Metadata,
} from '@agentplat/core';
import type {
  Approval,
  Artifact,
  ArtifactProvenance,
  ArtifactVersion,
  AssembledTaskContext,
  ContextSnapshot,
  DomainEvent,
  MemoryEntry,
  MemoryScope,
  Participant,
  Policy,
  Room,
  RoomMessage,
  RoomParticipant,
  RoomRepository,
  RoomRepositoryTransaction,
  RoomRun,
  RoomState,
  RoomTask,
  ToolCall,
} from '@agentplat/rooms';
import type { Pool, PoolClient, QueryResultRow } from 'pg';

type Database = Pool | PoolClient;
type Row = QueryResultRow & Record<string, unknown>;

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function optionalIso(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : iso(value);
}

function optionalString(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : String(value);
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

function metadata(row: Row): Metadata | undefined {
  const value = row.metadata as Metadata | null | undefined;
  return value && Object.keys(value).length > 0 ? value : undefined;
}

function mapRoom(row: Row): Room {
  return {
    tenantId: String(row.tenant_id),
    id: String(row.id),
    parentRoomId: optionalString(row.parent_room_id),
    title: String(row.title),
    goal: String(row.goal),
    status: row.status as Room['status'],
    metadata: metadata(row),
    createdBy: optionalString(row.created_by),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    completedAt: optionalIso(row.completed_at),
    archivedAt: optionalIso(row.archived_at),
  };
}

function mapParticipant(row: Row): Participant {
  return {
    tenantId: String(row.tenant_id),
    id: String(row.id),
    type: row.type as Participant['type'],
    displayName: String(row.display_name),
    role: String(row.role),
    authorityLevel: Number(row.authority_level),
    permissions: row.permissions as string[],
    boundaries: row.boundaries as string[],
    memoryScope: row.memory_scope as MemoryScope | undefined,
    runtime: row.runtime as Participant['runtime'],
    metadata: metadata(row),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapMessage(row: Row): RoomMessage {
  return {
    tenantId: String(row.tenant_id),
    id: String(row.id),
    roomId: String(row.room_id),
    authorParticipantId: optionalString(row.author_participant_id),
    role: row.role as RoomMessage['role'],
    content: String(row.content),
    metadata: metadata(row),
    createdAt: iso(row.created_at),
  };
}

function mapTask(row: Row): RoomTask {
  return {
    tenantId: String(row.tenant_id),
    id: String(row.id),
    roomId: String(row.room_id),
    stepId: String(row.step_id),
    assignedParticipantId: optionalString(row.assigned_participant_id),
    assignedRole: optionalString(row.assigned_role),
    instruction: String(row.instruction),
    expectedOutput: String(row.expected_output),
    expectedArtifactKind: String(row.expected_artifact_kind),
    dependencies: row.dependencies as string[],
    acceptanceCriteria: row.acceptance_criteria as string[],
    actionLevel: row.action_level as RoomTask['actionLevel'],
    approvalRequired: Boolean(row.approval_required),
    toolIds: row.tool_ids as string[],
    status: row.status as RoomTask['status'],
    errorMessage: optionalString(row.error_message),
    metadata: metadata(row),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    completedAt: optionalIso(row.completed_at),
  };
}

function mapArtifact(row: Row): Artifact {
  return {
    tenantId: String(row.tenant_id),
    id: String(row.id),
    roomId: String(row.room_id),
    type: String(row.type),
    title: String(row.title),
    status: row.status as Artifact['status'],
    currentVersion: Number(row.current_version),
    authors: row.authors as string[],
    provenance: row.provenance as unknown as ArtifactProvenance,
    assumptions: row.assumptions as string[],
    risks: row.risks as string[],
    metadata: metadata(row),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapArtifactVersion(row: Row): ArtifactVersion {
  return {
    tenantId: String(row.tenant_id),
    id: String(row.id),
    artifactId: String(row.artifact_id),
    version: Number(row.version),
    content: row.content as JsonValue,
    contentType: String(row.content_type),
    createdBy: optionalString(row.created_by),
    createdAt: iso(row.created_at),
  };
}

function mapApproval(row: Row): Approval {
  return {
    tenantId: String(row.tenant_id),
    id: String(row.id),
    roomId: String(row.room_id),
    targetType: row.target_type as Approval['targetType'],
    targetId: String(row.target_id),
    targetVersion:
      row.target_version === null || row.target_version === undefined
        ? undefined
        : Number(row.target_version),
    action: optionalString(row.action),
    status: row.status as Approval['status'],
    requestedBy: optionalString(row.requested_by),
    decidedBy: optionalString(row.decided_by),
    comment: optionalString(row.comment),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    decidedAt: optionalIso(row.decided_at),
  };
}

function mapPolicy(row: Row): Policy {
  return {
    tenantId: String(row.tenant_id),
    id: String(row.id),
    roomId: String(row.room_id),
    name: String(row.name),
    allowedActions: row.allowed_actions as string[],
    deniedActions: row.denied_actions as string[],
    requiredApprovals: row.required_approvals as string[],
    escalationRules: row.escalation_rules as JsonObject[],
    toolPermissions: row.tool_permissions as string[],
    memoryAccessRules: row.memory_access_rules as MemoryScope[],
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapMemory(row: Row): MemoryEntry {
  return {
    tenantId: String(row.tenant_id),
    id: String(row.id),
    roomId: optionalString(row.room_id),
    scope: row.scope as MemoryScope,
    scopeId: optionalString(row.scope_id),
    content: row.content as JsonValue,
    source: String(row.source),
    confidence: Number(row.confidence),
    retention: row.retention as MemoryEntry['retention'],
    retainUntil: optionalIso(row.retain_until),
    provenance: row.provenance as JsonObject,
    createdAt: iso(row.created_at),
  };
}

function mapContextSnapshot(row: Row): ContextSnapshot {
  return {
    tenantId: String(row.tenant_id),
    id: String(row.id),
    roomId: String(row.room_id),
    taskId: String(row.task_id),
    runId: String(row.run_id),
    context: row.context as unknown as AssembledTaskContext,
    createdAt: iso(row.created_at),
  };
}

function mapRun(row: Row): RoomRun {
  return {
    tenantId: String(row.tenant_id),
    id: String(row.id),
    roomId: String(row.room_id),
    taskId: String(row.task_id),
    participantId: String(row.participant_id),
    runtime: String(row.runtime),
    status: row.status as RoomRun['status'],
    output: optionalString(row.output),
    errorMessage: optionalString(row.error_message),
    tokenUsage: row.token_usage as JsonObject | undefined,
    latencyMs:
      row.latency_ms === null || row.latency_ms === undefined
        ? undefined
        : Number(row.latency_ms),
    startedAt: iso(row.started_at),
    leaseExpiresAt: iso(row.lease_expires_at),
    completedAt: optionalIso(row.completed_at),
  };
}

function mapToolCall(row: Row): ToolCall {
  return {
    tenantId: String(row.tenant_id),
    id: String(row.id),
    roomId: String(row.room_id),
    runId: String(row.run_id),
    toolId: String(row.tool_id),
    input: row.input as JsonObject,
    output: row.output as JsonValue | undefined,
    status: row.status as ToolCall['status'],
    latencyMs:
      row.latency_ms === null || row.latency_ms === undefined
        ? undefined
        : Number(row.latency_ms),
    createdAt: iso(row.created_at),
    completedAt: optionalIso(row.completed_at),
  };
}

function mapEvent(row: Row): DomainEvent {
  return {
    tenantId: String(row.tenant_id),
    id: String(row.id),
    roomId: String(row.room_id),
    type: row.type as DomainEvent['type'],
    source: String(row.source),
    subject: row.subject as DomainEvent['subject'],
    payload: row.payload as JsonObject,
    metadata: metadata(row),
    occurredAt: iso(row.occurred_at),
    actorId: optionalString(row.actor_id),
  };
}

function translatePostgresError(error: unknown): unknown {
  if (error instanceof AgentPlatError) return error;
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : undefined;
  if (code === '23505') {
    return new AgentPlatError('CONFLICT', 'The resource already exists', {
      statusCode: 409,
      details: error,
    });
  }
  if (
    code === '23502' ||
    code === '23503' ||
    code === '23514' ||
    code === '22P02'
  ) {
    return new AgentPlatError(
      'VALIDATION_ERROR',
      'The persisted room data is invalid',
      {
        statusCode: 400,
        details: error,
      }
    );
  }
  return error;
}

class PostgresRoomReader {
  constructor(
    protected readonly database: Database,
    private readonly transactionTenantId?: AgentPlatID,
    private readonly lockRows = false
  ) {}

  private get rowLock(): string {
    return this.lockRows ? ' FOR UPDATE' : '';
  }

  protected assertTenant(tenantId: AgentPlatID): void {
    if (
      this.transactionTenantId !== undefined &&
      tenantId !== this.transactionTenantId
    ) {
      throw new AgentPlatError(
        'FORBIDDEN',
        'A room transaction cannot access another tenant',
        { statusCode: 403 }
      );
    }
  }

  async getRoom(
    tenantId: AgentPlatID,
    roomId: AgentPlatID
  ): Promise<Room | undefined> {
    this.assertTenant(tenantId);
    const result = await this.database.query<Row>(
      `SELECT * FROM public.rooms WHERE tenant_id = $1 AND id = $2${this.rowLock}`,
      [tenantId, roomId]
    );
    return result.rows[0] ? mapRoom(result.rows[0]) : undefined;
  }

  async listRooms(tenantId: AgentPlatID): Promise<Room[]> {
    this.assertTenant(tenantId);
    const result = await this.database.query<Row>(
      'SELECT * FROM public.rooms WHERE tenant_id = $1 ORDER BY created_at DESC, id',
      [tenantId]
    );
    return result.rows.map(mapRoom);
  }

  async getParticipant(
    tenantId: AgentPlatID,
    participantId: AgentPlatID
  ): Promise<Participant | undefined> {
    this.assertTenant(tenantId);
    const result = await this.database.query<Row>(
      `SELECT * FROM public.participants WHERE tenant_id = $1 AND id = $2${this.rowLock}`,
      [tenantId, participantId]
    );
    return result.rows[0] ? mapParticipant(result.rows[0]) : undefined;
  }

  async getTask(
    tenantId: AgentPlatID,
    taskId: AgentPlatID
  ): Promise<RoomTask | undefined> {
    this.assertTenant(tenantId);
    const result = await this.database.query<Row>(
      `SELECT * FROM public.tasks WHERE tenant_id = $1 AND id = $2${this.rowLock}`,
      [tenantId, taskId]
    );
    return result.rows[0] ? mapTask(result.rows[0]) : undefined;
  }

  async getArtifact(
    tenantId: AgentPlatID,
    artifactId: AgentPlatID
  ): Promise<Artifact | undefined> {
    this.assertTenant(tenantId);
    const result = await this.database.query<Row>(
      `SELECT * FROM public.artifacts WHERE tenant_id = $1 AND id = $2${this.rowLock}`,
      [tenantId, artifactId]
    );
    return result.rows[0] ? mapArtifact(result.rows[0]) : undefined;
  }

  async getApproval(
    tenantId: AgentPlatID,
    approvalId: AgentPlatID
  ): Promise<Approval | undefined> {
    this.assertTenant(tenantId);
    const result = await this.database.query<Row>(
      `SELECT * FROM public.approvals WHERE tenant_id = $1 AND id = $2${this.rowLock}`,
      [tenantId, approvalId]
    );
    return result.rows[0] ? mapApproval(result.rows[0]) : undefined;
  }

  async listEvents(
    tenantId: AgentPlatID,
    roomId: AgentPlatID
  ): Promise<DomainEvent[]> {
    this.assertTenant(tenantId);
    const result = await this.database.query<Row>(
      `SELECT * FROM public.events
       WHERE tenant_id = $1 AND room_id = $2
       ORDER BY sequence`,
      [tenantId, roomId]
    );
    return result.rows.map(mapEvent);
  }

  async getRoomState(
    tenantId: AgentPlatID,
    roomId: AgentPlatID
  ): Promise<RoomState | undefined> {
    this.assertTenant(tenantId);
    const room = await this.getRoom(tenantId, roomId);
    if (!room) return undefined;

    const participants = await this.database.query<Row>(
      `SELECT participant.*
       FROM public.room_participants link
       JOIN public.participants participant
         ON participant.tenant_id = link.tenant_id
        AND participant.id = link.participant_id
       WHERE link.tenant_id = $1 AND link.room_id = $2
       ORDER BY link.joined_at, participant.id`,
      [tenantId, roomId]
    );
    const messages = await this.database.query<Row>(
      `SELECT * FROM public.messages
       WHERE tenant_id = $1 AND room_id = $2
       ORDER BY created_at, id`,
      [tenantId, roomId]
    );
    const tasks = await this.database.query<Row>(
      `SELECT * FROM public.tasks
       WHERE tenant_id = $1 AND room_id = $2
       ORDER BY created_at, id`,
      [tenantId, roomId]
    );
    const artifacts = await this.database.query<Row>(
      `SELECT * FROM public.artifacts
       WHERE tenant_id = $1 AND room_id = $2
       ORDER BY created_at, id`,
      [tenantId, roomId]
    );
    const versions = await this.database.query<Row>(
      `SELECT version.*
       FROM public.artifact_versions version
       JOIN public.artifacts artifact
         ON artifact.tenant_id = version.tenant_id
        AND artifact.id = version.artifact_id
       WHERE artifact.tenant_id = $1 AND artifact.room_id = $2
       ORDER BY artifact.created_at, artifact.id, version.version`,
      [tenantId, roomId]
    );
    const approvals = await this.database.query<Row>(
      `SELECT * FROM public.approvals
       WHERE tenant_id = $1 AND room_id = $2
       ORDER BY created_at, id`,
      [tenantId, roomId]
    );
    const policies = await this.database.query<Row>(
      `SELECT * FROM public.policies
       WHERE tenant_id = $1 AND room_id = $2
       ORDER BY created_at, id`,
      [tenantId, roomId]
    );
    const memory = await this.database.query<Row>(
      `SELECT * FROM public.memory_entries
       WHERE tenant_id = $1
         AND (room_id = $2 OR (scope = 'organization' AND scope_id = $1))
       ORDER BY created_at, id`,
      [tenantId, roomId]
    );
    const snapshots = await this.database.query<Row>(
      `SELECT * FROM public.context_snapshots
       WHERE tenant_id = $1 AND room_id = $2
       ORDER BY created_at, id`,
      [tenantId, roomId]
    );
    const runs = await this.database.query<Row>(
      `SELECT * FROM public.runs
       WHERE tenant_id = $1 AND room_id = $2
       ORDER BY started_at, id`,
      [tenantId, roomId]
    );
    const toolCalls = await this.database.query<Row>(
      `SELECT * FROM public.tool_calls
       WHERE tenant_id = $1 AND room_id = $2
       ORDER BY created_at, id`,
      [tenantId, roomId]
    );
    const childRooms = await this.database.query<Row>(
      `SELECT * FROM public.rooms
       WHERE tenant_id = $1 AND parent_room_id = $2
       ORDER BY created_at, id`,
      [tenantId, roomId]
    );
    const roomEvents = await this.listEvents(tenantId, roomId);
    const mappedVersions = versions.rows.map(mapArtifactVersion);

    return {
      room,
      participants: participants.rows.map(mapParticipant),
      messages: messages.rows.map(mapMessage),
      tasks: tasks.rows.map(mapTask),
      artifacts: artifacts.rows.map((row) => {
        const artifact = mapArtifact(row);
        return {
          ...artifact,
          versions: mappedVersions.filter(
            (version) => version.artifactId === artifact.id
          ),
        };
      }),
      approvals: approvals.rows.map(mapApproval),
      policies: policies.rows.map(mapPolicy),
      memory: memory.rows.map(mapMemory),
      contextSnapshots: snapshots.rows.map(mapContextSnapshot),
      runs: runs.rows.map(mapRun),
      toolCalls: toolCalls.rows.map(mapToolCall),
      events: roomEvents,
      childRooms: childRooms.rows.map(mapRoom),
    };
  }
}

class PostgresRoomTransaction
  extends PostgresRoomReader
  implements RoomRepositoryTransaction
{
  constructor(
    client: PoolClient,
    private readonly tenantId: AgentPlatID
  ) {
    super(client, tenantId, true);
  }

  private assertEntityTenant(entity: { tenantId: AgentPlatID }): void {
    this.assertTenant(entity.tenantId);
  }

  private async assertUpdated(
    result: { rowCount: number | null },
    label: string,
    id: AgentPlatID
  ): Promise<void> {
    if ((result.rowCount ?? 0) === 0) {
      throw new AgentPlatError('NOT_FOUND', `${label} "${id}" was not found`, {
        statusCode: 404,
      });
    }
  }

  async insertRoom(room: Room): Promise<void> {
    this.assertEntityTenant(room);
    await this.database.query(
      `INSERT INTO public.rooms (
         tenant_id, id, parent_room_id, title, goal, status, metadata,
         created_by, created_at, updated_at, completed_at, archived_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12)`,
      [
        room.tenantId,
        room.id,
        room.parentRoomId ?? null,
        room.title,
        room.goal,
        room.status,
        json(room.metadata ?? {}),
        room.createdBy ?? null,
        room.createdAt,
        room.updatedAt,
        room.completedAt ?? null,
        room.archivedAt ?? null,
      ]
    );
  }

  async updateRoom(room: Room): Promise<void> {
    this.assertEntityTenant(room);
    const result = await this.database.query(
      `UPDATE public.rooms SET
         parent_room_id = $3, title = $4, goal = $5, status = $6,
         metadata = $7::jsonb, created_by = $8, created_at = $9,
         updated_at = $10, completed_at = $11, archived_at = $12
       WHERE tenant_id = $1 AND id = $2`,
      [
        room.tenantId,
        room.id,
        room.parentRoomId ?? null,
        room.title,
        room.goal,
        room.status,
        json(room.metadata ?? {}),
        room.createdBy ?? null,
        room.createdAt,
        room.updatedAt,
        room.completedAt ?? null,
        room.archivedAt ?? null,
      ]
    );
    await this.assertUpdated(result, 'Room', room.id);
  }

  async insertParticipant(participant: Participant): Promise<void> {
    this.assertEntityTenant(participant);
    await this.database.query(
      `INSERT INTO public.participants (
         tenant_id, id, type, display_name, role, authority_level,
         permissions, boundaries, memory_scope, runtime, metadata,
         created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10::jsonb,$11::jsonb,$12,$13)`,
      [
        participant.tenantId,
        participant.id,
        participant.type,
        participant.displayName,
        participant.role,
        participant.authorityLevel,
        json(participant.permissions),
        json(participant.boundaries),
        participant.memoryScope ?? null,
        participant.runtime ? json(participant.runtime) : null,
        json(participant.metadata ?? {}),
        participant.createdAt,
        participant.updatedAt,
      ]
    );
  }

  async addRoomParticipant(link: RoomParticipant): Promise<void> {
    this.assertEntityTenant(link);
    await this.database.query(
      `INSERT INTO public.room_participants (
         tenant_id, room_id, participant_id, joined_at
       ) VALUES ($1,$2,$3,$4)`,
      [link.tenantId, link.roomId, link.participantId, link.joinedAt]
    );
  }

  async insertMessage(message: RoomMessage): Promise<void> {
    this.assertEntityTenant(message);
    await this.database.query(
      `INSERT INTO public.messages (
         tenant_id, id, room_id, author_participant_id, role,
         content, metadata, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
      [
        message.tenantId,
        message.id,
        message.roomId,
        message.authorParticipantId ?? null,
        message.role,
        message.content,
        json(message.metadata ?? {}),
        message.createdAt,
      ]
    );
  }

  async insertTask(task: RoomTask): Promise<void> {
    this.assertEntityTenant(task);
    await this.database.query(
      `INSERT INTO public.tasks (
         tenant_id, id, room_id, step_id, assigned_participant_id,
         assigned_role, instruction, expected_output, expected_artifact_kind,
         dependencies, acceptance_criteria, action_level, approval_required,
         tool_ids, status, error_message, metadata, created_at, updated_at,
         completed_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13,
         $14::jsonb,$15,$16,$17::jsonb,$18,$19,$20
       )`,
      this.taskValues(task)
    );
  }

  async updateTask(task: RoomTask): Promise<void> {
    this.assertEntityTenant(task);
    const values = this.taskValues(task);
    const result = await this.database.query(
      `UPDATE public.tasks SET
         room_id = $3, step_id = $4, assigned_participant_id = $5,
         assigned_role = $6, instruction = $7, expected_output = $8,
         expected_artifact_kind = $9, dependencies = $10::jsonb,
         acceptance_criteria = $11::jsonb, action_level = $12,
         approval_required = $13, tool_ids = $14::jsonb, status = $15,
         error_message = $16, metadata = $17::jsonb, created_at = $18,
         updated_at = $19, completed_at = $20
       WHERE tenant_id = $1 AND id = $2`,
      values
    );
    await this.assertUpdated(result, 'Task', task.id);
  }

  private taskValues(task: RoomTask): unknown[] {
    return [
      task.tenantId,
      task.id,
      task.roomId,
      task.stepId,
      task.assignedParticipantId ?? null,
      task.assignedRole ?? null,
      task.instruction,
      task.expectedOutput,
      task.expectedArtifactKind,
      json(task.dependencies),
      json(task.acceptanceCriteria),
      task.actionLevel,
      task.approvalRequired,
      json(task.toolIds),
      task.status,
      task.errorMessage ?? null,
      json(task.metadata ?? {}),
      task.createdAt,
      task.updatedAt,
      task.completedAt ?? null,
    ];
  }

  async insertArtifact(
    artifact: Artifact,
    version: ArtifactVersion
  ): Promise<void> {
    this.assertEntityTenant(artifact);
    this.assertEntityTenant(version);
    if (
      version.artifactId !== artifact.id ||
      version.version !== artifact.currentVersion
    ) {
      throw new AgentPlatError(
        'VALIDATION_ERROR',
        'The initial artifact version must match the artifact current version',
        { statusCode: 400 }
      );
    }
    await this.database.query(
      `INSERT INTO public.artifacts (
         tenant_id, id, room_id, type, title, status, current_version,
         authors, provenance, assumptions, risks, metadata, created_at, updated_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,
         $11::jsonb,$12::jsonb,$13,$14
       )`,
      this.artifactValues(artifact)
    );
    await this.insertArtifactVersion(version);
  }

  async updateArtifact(artifact: Artifact): Promise<void> {
    this.assertEntityTenant(artifact);
    const values = this.artifactValues(artifact);
    const result = await this.database.query(
      `UPDATE public.artifacts SET
         room_id = $3, type = $4, title = $5, status = $6,
         current_version = $7, authors = $8::jsonb, provenance = $9::jsonb,
         assumptions = $10::jsonb, risks = $11::jsonb,
         metadata = $12::jsonb, created_at = $13, updated_at = $14
       WHERE tenant_id = $1 AND id = $2`,
      values
    );
    await this.assertUpdated(result, 'Artifact', artifact.id);
  }

  private artifactValues(artifact: Artifact): unknown[] {
    return [
      artifact.tenantId,
      artifact.id,
      artifact.roomId,
      artifact.type,
      artifact.title,
      artifact.status,
      artifact.currentVersion,
      json(artifact.authors),
      json(artifact.provenance),
      json(artifact.assumptions),
      json(artifact.risks),
      json(artifact.metadata ?? {}),
      artifact.createdAt,
      artifact.updatedAt,
    ];
  }

  async insertArtifactVersion(version: ArtifactVersion): Promise<void> {
    this.assertEntityTenant(version);
    await this.database.query(
      `INSERT INTO public.artifact_versions (
         tenant_id, id, artifact_id, version, content, content_type,
         created_by, created_at
       ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)`,
      [
        version.tenantId,
        version.id,
        version.artifactId,
        version.version,
        json(version.content),
        version.contentType,
        version.createdBy ?? null,
        version.createdAt,
      ]
    );
  }

  async insertApproval(approval: Approval): Promise<void> {
    this.assertEntityTenant(approval);
    await this.database.query(
      `INSERT INTO public.approvals (
         tenant_id, id, room_id, target_type, target_id, target_version,
         action, status, requested_by, decided_by, comment, created_at,
         updated_at, decided_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      this.approvalValues(approval)
    );
  }

  async updateApproval(approval: Approval): Promise<void> {
    this.assertEntityTenant(approval);
    const values = this.approvalValues(approval);
    const result = await this.database.query(
      `UPDATE public.approvals SET
         room_id = $3, target_type = $4, target_id = $5,
         target_version = $6, action = $7, status = $8,
         requested_by = $9, decided_by = $10, comment = $11,
         created_at = $12, updated_at = $13, decided_at = $14
       WHERE tenant_id = $1 AND id = $2`,
      values
    );
    await this.assertUpdated(result, 'Approval', approval.id);
  }

  private approvalValues(approval: Approval): unknown[] {
    return [
      approval.tenantId,
      approval.id,
      approval.roomId,
      approval.targetType,
      approval.targetId,
      approval.targetVersion ?? null,
      approval.action ?? null,
      approval.status,
      approval.requestedBy ?? null,
      approval.decidedBy ?? null,
      approval.comment ?? null,
      approval.createdAt,
      approval.updatedAt,
      approval.decidedAt ?? null,
    ];
  }

  async insertPolicy(policy: Policy): Promise<void> {
    this.assertEntityTenant(policy);
    await this.database.query(
      `INSERT INTO public.policies (
         tenant_id, id, room_id, name, allowed_actions, denied_actions,
         required_approvals, escalation_rules, tool_permissions,
         memory_access_rules, created_at, updated_at
       ) VALUES (
         $1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,
         $9::jsonb,$10::jsonb,$11,$12
       )`,
      [
        policy.tenantId,
        policy.id,
        policy.roomId,
        policy.name,
        json(policy.allowedActions),
        json(policy.deniedActions),
        json(policy.requiredApprovals),
        json(policy.escalationRules),
        json(policy.toolPermissions),
        json(policy.memoryAccessRules),
        policy.createdAt,
        policy.updatedAt,
      ]
    );
  }

  async insertMemory(entry: MemoryEntry): Promise<void> {
    this.assertEntityTenant(entry);
    await this.database.query(
      `INSERT INTO public.memory_entries (
         tenant_id, id, room_id, scope, scope_id, content, source,
         confidence, retention, retain_until, provenance, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11::jsonb,$12)`,
      [
        entry.tenantId,
        entry.id,
        entry.roomId ?? null,
        entry.scope,
        entry.scopeId ?? null,
        json(entry.content),
        entry.source,
        entry.confidence,
        entry.retention,
        entry.retainUntil ?? null,
        json(entry.provenance),
        entry.createdAt,
      ]
    );
  }

  async insertContextSnapshot(snapshot: ContextSnapshot): Promise<void> {
    this.assertEntityTenant(snapshot);
    await this.database.query(
      `INSERT INTO public.context_snapshots (
         tenant_id, id, room_id, task_id, run_id, context, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)`,
      [
        snapshot.tenantId,
        snapshot.id,
        snapshot.roomId,
        snapshot.taskId,
        snapshot.runId,
        json(snapshot.context),
        snapshot.createdAt,
      ]
    );
  }

  async insertRun(run: RoomRun): Promise<void> {
    this.assertEntityTenant(run);
    await this.database.query(
      `INSERT INTO public.runs (
         tenant_id, id, room_id, task_id, participant_id, runtime, status,
         output, error_message, token_usage, latency_ms, started_at,
         lease_expires_at, completed_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14)`,
      this.runValues(run)
    );
  }

  async updateRun(run: RoomRun): Promise<void> {
    this.assertEntityTenant(run);
    const values = this.runValues(run);
    const result = await this.database.query(
      `UPDATE public.runs SET
         room_id = $3, task_id = $4, participant_id = $5, runtime = $6,
         status = $7, output = $8, error_message = $9,
         token_usage = $10::jsonb, latency_ms = $11, started_at = $12,
         lease_expires_at = $13, completed_at = $14
       WHERE tenant_id = $1 AND id = $2`,
      values
    );
    await this.assertUpdated(result, 'Run', run.id);
  }

  private runValues(run: RoomRun): unknown[] {
    return [
      run.tenantId,
      run.id,
      run.roomId,
      run.taskId,
      run.participantId,
      run.runtime,
      run.status,
      run.output ?? null,
      run.errorMessage ?? null,
      run.tokenUsage ? json(run.tokenUsage) : null,
      run.latencyMs ?? null,
      run.startedAt,
      run.leaseExpiresAt,
      run.completedAt ?? null,
    ];
  }

  async insertToolCall(call: ToolCall): Promise<void> {
    this.assertEntityTenant(call);
    await this.database.query(
      `INSERT INTO public.tool_calls (
         tenant_id, id, room_id, run_id, tool_id, input, output,
         status, latency_ms, created_at, completed_at
       ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11)`,
      this.toolCallValues(call)
    );
  }

  async updateToolCall(call: ToolCall): Promise<void> {
    this.assertEntityTenant(call);
    const values = this.toolCallValues(call);
    const result = await this.database.query(
      `UPDATE public.tool_calls SET
         room_id = $3, run_id = $4, tool_id = $5, input = $6::jsonb,
         output = $7::jsonb, status = $8, latency_ms = $9,
         created_at = $10, completed_at = $11
       WHERE tenant_id = $1 AND id = $2`,
      values
    );
    await this.assertUpdated(result, 'Tool call', call.id);
  }

  private toolCallValues(call: ToolCall): unknown[] {
    return [
      call.tenantId,
      call.id,
      call.roomId,
      call.runId,
      call.toolId,
      json(call.input),
      call.output === undefined ? null : json(call.output),
      call.status,
      call.latencyMs ?? null,
      call.createdAt,
      call.completedAt ?? null,
    ];
  }

  async appendEvent(event: DomainEvent): Promise<void> {
    this.assertEntityTenant(event);
    if (event.roomId.length === 0) {
      throw new AgentPlatError('VALIDATION_ERROR', 'Event roomId is required', {
        statusCode: 400,
      });
    }
    await this.database.query(
      `INSERT INTO public.events (
         tenant_id, id, room_id, type, source, subject, payload,
         metadata, occurred_at, actor_id
       ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10)`,
      [
        event.tenantId,
        event.id,
        event.roomId,
        event.type,
        event.source,
        event.subject ? json(event.subject) : null,
        json(event.payload),
        json(event.metadata ?? {}),
        event.occurredAt,
        event.actorId ?? null,
      ]
    );
  }
}

export class PostgresRoomRepository
  extends PostgresRoomReader
  implements RoomRepository
{
  constructor(private readonly pool: Pool) {
    super(pool);
  }

  override async getRoomState(
    tenantId: AgentPlatID,
    roomId: AgentPlatID
  ): Promise<RoomState | undefined> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const state = await new PostgresRoomReader(client, tenantId).getRoomState(
        tenantId,
        roomId
      );
      await client.query('COMMIT');
      return state;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async transaction<T>(
    tenantId: AgentPlatID,
    work: (transaction: RoomRepositoryTransaction) => Promise<T>
  ): Promise<T> {
    if (!tenantId.trim()) {
      throw new AgentPlatError('VALIDATION_ERROR', 'tenantId is required');
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(new PostgresRoomTransaction(client, tenantId));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw translatePostgresError(error);
    } finally {
      client.release();
    }
  }
}
