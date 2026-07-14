import assert from 'node:assert/strict';
import test from 'node:test';
import { RoomService } from '@agentplat/rooms';
import {
  createPostgresPool,
  PostgresRoomRepository,
  rollbackMigrations,
  runMigrations,
} from '../dist/index.js';

const enabled = process.env.AGENTPLAT_POSTGRES_TEST === '1';

test(
  'persists a tenant-scoped room aggregate and its durable events atomically',
  {
    skip: enabled
      ? false
      : 'set AGENTPLAT_POSTGRES_TEST=1 for PostgreSQL integration tests',
  },
  async () => {
    const pool = createPostgresPool({ options: '-c search_path=pg_catalog' });
    const searchPath = await pool.query('SHOW search_path');
    assert.equal(searchPath.rows[0].search_path, 'pg_catalog');
    await runMigrations(pool);
    const repository = new PostgresRoomRepository(pool);
    const at = '2026-07-14T12:00:00.000Z';

    const roomFor = (tenantId, title) => ({
      tenantId,
      id: 'room-1',
      title,
      goal: `Goal for ${title}`,
      status: 'active',
      createdAt: at,
      updatedAt: at,
    });
    const eventFor = (tenantId, id, type, payload = {}) => ({
      tenantId,
      id,
      roomId: 'room-1',
      type,
      source: '@agentplat/rooms',
      payload,
      occurredAt: at,
    });

    try {
      await repository.transaction('tenant-a', async (transaction) => {
        await transaction.insertRoom(roomFor('tenant-a', 'Tenant A'));
        await transaction.appendEvent(
          eventFor('tenant-a', 'event-a-1', 'room_created', {
            roomId: 'room-1',
          })
        );
      });
      await repository.transaction('tenant-b', async (transaction) => {
        await transaction.insertRoom(roomFor('tenant-b', 'Tenant B'));
        await transaction.appendEvent(
          eventFor('tenant-b', 'event-b-1', 'room_created', {
            roomId: 'room-1',
          })
        );
      });

      assert.equal(
        (await repository.getRoom('tenant-a', 'room-1'))?.title,
        'Tenant A'
      );
      assert.equal(
        (await repository.getRoom('tenant-b', 'room-1'))?.title,
        'Tenant B'
      );
      assert.equal(
        (await repository.listEvents('tenant-a', 'room-1')).length,
        1
      );

      await assert.rejects(
        repository.transaction('tenant-a', async (transaction) => {
          await transaction.insertParticipant({
            tenantId: 'tenant-a',
            id: 'rolled-back',
            type: 'human',
            displayName: 'Rolled back',
            role: 'reviewer',
            authorityLevel: 1,
            permissions: [],
            boundaries: [],
            createdAt: at,
            updatedAt: at,
          });
          await transaction.appendEvent(
            eventFor('tenant-a', 'event-rolled-back', 'participant_added')
          );
          throw new Error('force rollback');
        }),
        /force rollback/
      );
      assert.equal(
        await repository.getParticipant('tenant-a', 'rolled-back'),
        undefined
      );
      assert.equal(
        (await repository.listEvents('tenant-a', 'room-1')).length,
        1
      );

      await repository.transaction('tenant-a', async (transaction) => {
        const participant = {
          tenantId: 'tenant-a',
          id: 'agent-1',
          type: 'agent',
          displayName: 'Writer',
          role: 'writer',
          authorityLevel: 1,
          permissions: ['task.run'],
          boundaries: [],
          memoryScope: 'room',
          runtime: { platform: 'mock' },
          createdAt: at,
          updatedAt: at,
        };
        const task = {
          tenantId: 'tenant-a',
          id: 'task-1',
          roomId: 'room-1',
          stepId: 'write',
          assignedParticipantId: participant.id,
          instruction: 'Write a draft',
          expectedOutput: 'A document',
          expectedArtifactKind: 'document',
          dependencies: [],
          acceptanceCriteria: ['Clear'],
          actionLevel: 'draft',
          approvalRequired: false,
          toolIds: [],
          status: 'completed',
          createdAt: at,
          updatedAt: at,
          completedAt: at,
        };
        const artifact = {
          tenantId: 'tenant-a',
          id: 'artifact-1',
          roomId: 'room-1',
          type: 'document',
          title: 'Draft',
          status: 'pending_approval',
          currentVersion: 1,
          authors: [participant.id],
          provenance: {
            sourceMessageIds: ['message-1'],
            sourceArtifactIds: [],
            sourceMemoryIds: ['memory-1'],
            runId: 'run-1',
          },
          assumptions: [],
          risks: [],
          createdAt: at,
          updatedAt: at,
        };
        const context = {
          agentIdentity: {
            participantId: participant.id,
            displayName: participant.displayName,
            role: participant.role,
            authorityLevel: participant.authorityLevel,
            boundaries: [],
          },
          room: { id: 'room-1', goal: 'Goal for Tenant A' },
          task: {
            id: task.id,
            instruction: task.instruction,
            expectedOutput: task.expectedOutput,
            acceptanceCriteria: task.acceptanceCriteria,
          },
          transcript: [],
          artifacts: [],
          memory: [],
          policies: [],
          provenance: { messageIds: [], artifactIds: [], memoryIds: [] },
        };

        await transaction.insertParticipant(participant);
        await transaction.addRoomParticipant({
          tenantId: 'tenant-a',
          roomId: 'room-1',
          participantId: participant.id,
          joinedAt: at,
        });
        await transaction.insertMessage({
          tenantId: 'tenant-a',
          id: 'message-1',
          roomId: 'room-1',
          authorParticipantId: participant.id,
          role: 'agent',
          content: 'Draft ready',
          createdAt: at,
        });
        await transaction.insertTask(task);
        await transaction.insertArtifact(artifact, {
          tenantId: 'tenant-a',
          id: 'artifact-version-1',
          artifactId: artifact.id,
          version: 1,
          content: { body: 'Draft' },
          contentType: 'application/json',
          createdBy: participant.id,
          createdAt: at,
        });
        await transaction.insertApproval({
          tenantId: 'tenant-a',
          id: 'approval-1',
          roomId: 'room-1',
          targetType: 'artifact',
          targetId: artifact.id,
          status: 'requested',
          requestedBy: participant.id,
          createdAt: at,
          updatedAt: at,
        });
        await transaction.insertPolicy({
          tenantId: 'tenant-a',
          id: 'policy-1',
          roomId: 'room-1',
          name: 'Local drafts',
          allowedActions: ['task.run.draft'],
          deniedActions: [],
          requiredApprovals: [],
          escalationRules: [],
          toolPermissions: [],
          memoryAccessRules: ['room'],
          createdAt: at,
          updatedAt: at,
        });
        await transaction.insertMemory({
          tenantId: 'tenant-a',
          id: 'memory-1',
          roomId: 'room-1',
          scope: 'room',
          scopeId: 'room-1',
          content: { fact: 'Use a concise style' },
          source: 'message-1',
          confidence: 0.9,
          retention: 'durable',
          provenance: { messageId: 'message-1' },
          createdAt: at,
        });
        await transaction.insertRun({
          tenantId: 'tenant-a',
          id: 'run-1',
          roomId: 'room-1',
          taskId: task.id,
          participantId: participant.id,
          runtime: 'mock',
          status: 'completed',
          output: 'Draft',
          latencyMs: 1,
          startedAt: at,
          leaseExpiresAt: '2026-07-14T12:05:00.000Z',
          completedAt: at,
        });
        await transaction.insertContextSnapshot({
          tenantId: 'tenant-a',
          id: 'context-1',
          roomId: 'room-1',
          taskId: task.id,
          runId: 'run-1',
          context,
          createdAt: at,
        });
        await transaction.insertToolCall({
          tenantId: 'tenant-a',
          id: 'tool-call-1',
          roomId: 'room-1',
          runId: 'run-1',
          toolId: 'local-draft',
          input: { title: 'Draft' },
          output: { ok: true },
          status: 'completed',
          latencyMs: 1,
          createdAt: at,
          completedAt: at,
        });
        await transaction.appendEvent(
          eventFor('tenant-a', 'event-a-2', 'artifact_created', {
            artifactId: artifact.id,
          })
        );
      });

      const state = await repository.getRoomState('tenant-a', 'room-1');
      assert.ok(state);
      assert.equal(state.participants.length, 1);
      assert.equal(state.messages.length, 1);
      assert.equal(state.tasks.length, 1);
      assert.equal(state.artifacts[0].versions.length, 1);
      assert.equal(state.approvals.length, 1);
      assert.equal(state.policies.length, 1);
      assert.equal(state.memory.length, 1);
      assert.equal(state.contextSnapshots.length, 1);
      assert.equal(state.runs.length, 1);
      assert.equal(state.toolCalls.length, 1);
      assert.deepEqual(
        state.events.map((event) => event.id),
        ['event-a-1', 'event-a-2']
      );

      await assert.rejects(
        pool.query(
          'UPDATE public.artifact_versions SET content = $1::jsonb WHERE tenant_id = $2 AND id = $3',
          ['{}', 'tenant-a', 'artifact-version-1']
        ),
        /immutable/
      );
      await assert.rejects(
        pool.query(
          'DELETE FROM public.events WHERE tenant_id = $1 AND id = $2',
          ['tenant-a', 'event-a-2']
        ),
        /append-only/
      );
      await assert.rejects(
        repository.transaction('tenant-a', (transaction) =>
          transaction.getRoom('tenant-b', 'room-1')
        ),
        /cannot access another tenant/
      );

      let sequence = 0;
      let now = new Date('2026-07-14T13:00:00.000Z');
      let runtimeCalls = 0;
      let reportFirstPublish;
      let releaseFirstPublish;
      const firstPublishStarted = new Promise((resolve) => {
        reportFirstPublish = resolve;
      });
      const firstPublishRelease = new Promise((resolve) => {
        releaseFirstPublish = resolve;
      });
      const runtime = {
        registerProvider: () => undefined,
        run: async () => {
          runtimeCalls += 1;
          return { status: 'completed', output: 'One PostgreSQL result' };
        },
        stream: async function* () {},
      };
      const commonOptions = {
        repository,
        runtime,
        idGenerator: () => `concurrent-${++sequence}`,
        clock: () => now,
        runTimeoutMs: 20,
      };
      const firstService = new RoomService({
        ...commonOptions,
        eventPublisher: {
          publish: async (event) => {
            if (event.type === 'task_run_started') {
              reportFirstPublish();
              await firstPublishRelease;
            }
          },
        },
      });
      const secondService = new RoomService(commonOptions);
      const concurrentRoom = await firstService.createRoom(
        'tenant-concurrency',
        { title: 'Concurrent room', goal: 'Fence one runtime execution' }
      );
      const agent = await firstService.addParticipant(
        'tenant-concurrency',
        concurrentRoom.id,
        {
          type: 'agent',
          displayName: 'PostgreSQL agent',
          role: 'writer',
          runtime: { platform: 'mock' },
        }
      );
      const concurrentTask = await firstService.createTask(
        'tenant-concurrency',
        concurrentRoom.id,
        {
          stepId: 'concurrent-run',
          assignedParticipantId: agent.id,
          instruction: 'Execute only once',
          expectedOutput: 'One result',
          expectedArtifactKind: 'note',
        }
      );

      const firstRun = firstService.runTask(
        'tenant-concurrency',
        concurrentRoom.id,
        concurrentTask.id
      );
      try {
        await firstPublishStarted;
        now = new Date('2026-07-14T13:00:00.021Z');
        const secondRun = await secondService.runTask(
          'tenant-concurrency',
          concurrentRoom.id,
          concurrentTask.id
        );
        releaseFirstPublish();
        assert.equal(secondRun.status, 'completed');
        await assert.rejects(firstRun, (error) => error.code === 'CONFLICT');
        assert.equal(runtimeCalls, 1);
      } finally {
        releaseFirstPublish();
        await firstRun.catch(() => undefined);
      }
    } finally {
      await rollbackMigrations(pool);
      await pool.end();
    }
  }
);
