import { AgentPlatError } from '@agentplat/core';
import type { JsonObject, TenantContext } from '@agentplat/core';
import type {
  AddParticipantInput,
  AgentDefinitionRegistry,
  AgentRoomHandoffCoordinator,
  HumanContributionCoordinator,
  KnowledgeBundleRegistry,
  AgentRoomLiveViewService,
  AgentRoomPlannerBridge,
  RoomParticipantMembershipCoordinator,
  WorkManagementDeliveryRuntime,
  CreateArtifactInput,
  CreateAgentDefinitionRevisionInput,
  CreateRoomInput,
  CreateTaskInput,
  RequestRunInterventionInput,
  RoomExecutionCoordinator,
  RoomService,
} from '@agentplat/rooms';
import { Hono } from 'hono';
import type { Context, MiddlewareHandler } from 'hono';
import { streamToSSE } from '@agentplat/streaming';
import type { StreamEvent } from '@agentplat/runtime';

export const DEFAULT_TENANT_HEADER = 'X-Agentplat-Tenant-Id';

type MaybePromise<T> = T | Promise<T>;
type JsonRecord = Record<string, unknown>;

/**
 * The deliberately small application-service port consumed by the HTTP
 * adapter. Implementations normally delegate these calls to RoomService.
 */
export type RoomsApiService = Pick<
  RoomService,
  | 'createRoom'
  | 'updateRoom'
  | 'transitionRoom'
  | 'listRooms'
  | 'getRoomState'
  | 'addParticipant'
  | 'sendMessage'
  | 'createTask'
  | 'runTask'
  | 'createArtifact'
  | 'createArtifactVersion'
  | 'requestApproval'
  | 'resolveApproval'
  | 'listEvents'
  | 'listEventPage'
>;

type UpdateRoomInput = Parameters<RoomService['updateRoom']>[2];
type SendMessageInput = Parameters<RoomService['sendMessage']>[2];
type CreateArtifactVersionInput = Parameters<
  RoomService['createArtifactVersion']
>[3];
type RequestApprovalInput = Parameters<RoomService['requestApproval']>[2];
type ResolveApprovalInput = Parameters<RoomService['resolveApproval']>[3];
type LifecycleInput = { actorId?: string };

export type RoomsAuthenticator = (
  request: Request
) => MaybePromise<TenantContext | null | undefined>;

export interface HeaderTenantAuthOptions {
  headerName?: string;
}

export interface CreateRoomsAppOptions {
  service: RoomsApiService;
  execution?: Pick<
    RoomExecutionCoordinator,
    'getSession' | 'listSessionEvents' | 'requestIntervention'
  >;
  executionEventStream?: (input: {
    tenantId: string;
    roomId: string;
    sessionId: string;
    afterSequence: number;
    signal: AbortSignal;
  }) => AsyncIterable<StreamEvent>;
  agentRegistry?: Pick<
    AgentDefinitionRegistry,
    | 'createAgent'
    | 'createRevision'
    | 'getRevision'
    | 'listRevisions'
    | 'publishRevision'
    | 'deprecateRevision'
  >;
  handoffs?: Pick<
    AgentRoomHandoffCoordinator,
    'propose' | 'get' | 'accept' | 'reject' | 'bindRun' | 'reconcile'
  >;
  humanContributions?: Pick<
    HumanContributionCoordinator,
    'request' | 'get' | 'assign' | 'start' | 'complete' | 'cancel'
  >;
  workManagement?: Pick<
    WorkManagementDeliveryRuntime,
    'enqueue' | 'synchronize' | 'metrics'
  >;
  knowledge?: Pick<
    KnowledgeBundleRegistry,
    'createRevision' | 'get' | 'readDocument'
  >;
  liveView?: Pick<AgentRoomLiveViewService, 'get' | 'stream'>;
  planner?: Pick<
    AgentRoomPlannerBridge,
    | 'create'
    | 'get'
    | 'materialize'
    | 'replanFromEvent'
    | 'reconcileFromEvent'
  >;
  participantMembership?: Pick<
    RoomParticipantMembershipCoordinator,
    'create' | 'get' | 'list' | 'transition'
  >;
  /** Replaces the trusted development header with an application auth layer. */
  auth?: RoomsAuthenticator;
  /** Intended for local debugging only. Defaults to false to avoid leaking adapter details. */
  exposeErrorDetails?: boolean;
}

interface RoomsApiEnv {
  Variables: {
    tenant: TenantContext;
  };
}

/**
 * Development authentication for self-hosted deployments. Production users
 * should inject an authenticator backed by their identity provider.
 */
export function headerTenantAuth(
  options: HeaderTenantAuthOptions = {}
): RoomsAuthenticator {
  const headerName = options.headerName ?? DEFAULT_TENANT_HEADER;

  return (request) => {
    const tenantId = request.headers.get(headerName)?.trim();
    if (!tenantId) {
      throw new AgentPlatError(
        'BAD_REQUEST',
        `Missing required ${headerName} header`
      );
    }
    return { tenantId };
  };
}

/** Create a transport-only Hono application around an injected room service. */
export function createRoomsApp(
  options: CreateRoomsAppOptions
): Hono<RoomsApiEnv> {
  if (!options?.service) {
    throw new AgentPlatError(
      'VALIDATION_ERROR',
      'A rooms application service is required'
    );
  }

  const app = new Hono<RoomsApiEnv>();
  const authenticate = options.auth ?? headerTenantAuth();

  app.onError((error, context) =>
    errorResponse(context, error, options.exposeErrorDetails ?? false)
  );

  app.get('/health', (context) => context.json({ status: 'ok' }));

  const requireTenant: MiddlewareHandler<RoomsApiEnv> = async (
    context,
    next
  ) => {
    const tenant = await authenticate(context.req.raw);
    if (!tenant?.tenantId?.trim()) {
      throw new AgentPlatError('UNAUTHORIZED', 'Authentication is required');
    }
    context.set('tenant', { ...tenant, tenantId: tenant.tenantId.trim() });
    await next();
  };

  app.use('/rooms', requireTenant);
  app.use('/rooms/*', requireTenant);
  app.use('/approvals/*', requireTenant);
  app.use('/agents', requireTenant);
  app.use('/agents/*', requireTenant);
  app.use('/knowledge-bundles', requireTenant);
  app.use('/knowledge-bundles/*', requireTenant);

  app.post('/rooms', async (context) => {
    const input = await readJsonObject<CreateRoomInput>(context);
    const room = await options.service.createRoom(
      tenantId(context),
      omitReserved(input, 'tenantId')
    );
    return context.json({ data: room }, 201);
  });

  app.get('/rooms', async (context) => {
    const rooms = await options.service.listRooms(tenantId(context));
    return context.json({ data: rooms });
  });

  app.get('/rooms/:roomId', async (context) => {
    const state = await options.service.getRoomState(
      tenantId(context),
      context.req.param('roomId')
    );
    return context.json({ data: state });
  });

  app.patch('/rooms/:roomId', async (context) => {
    const input = await readJsonObject<UpdateRoomInput>(context);
    const room = await options.service.updateRoom(
      tenantId(context),
      context.req.param('roomId'),
      omitReserved(input, 'tenantId', 'id', 'roomId')
    );
    return context.json({ data: room });
  });

  app.post('/rooms/:roomId/pause', async (context) => {
    const input = await readOptionalJsonObject<LifecycleInput>(context);
    const room = await options.service.transitionRoom(
      tenantId(context),
      context.req.param('roomId'),
      'pause',
      input.actorId
    );
    return context.json({ data: room });
  });

  app.post('/rooms/:roomId/resume', async (context) => {
    const input = await readOptionalJsonObject<LifecycleInput>(context);
    const room = await options.service.transitionRoom(
      tenantId(context),
      context.req.param('roomId'),
      'resume',
      input.actorId
    );
    return context.json({ data: room });
  });

  app.post('/rooms/:roomId/complete', async (context) => {
    const input = await readOptionalJsonObject<LifecycleInput>(context);
    const room = await options.service.transitionRoom(
      tenantId(context),
      context.req.param('roomId'),
      'complete',
      input.actorId
    );
    return context.json({ data: room });
  });

  app.post('/rooms/:roomId/archive', async (context) => {
    const input = await readOptionalJsonObject<LifecycleInput>(context);
    const room = await options.service.transitionRoom(
      tenantId(context),
      context.req.param('roomId'),
      'archive',
      input.actorId
    );
    return context.json({ data: room });
  });

  app.post('/rooms/:roomId/participants', async (context) => {
    const input = await readJsonObject<
      AddParticipantInput & { actorId?: string }
    >(context);
    const { actorId, ...participantInput } = omitReserved(
      input,
      'tenantId',
      'roomId'
    );
    const participant = await options.service.addParticipant(
      tenantId(context),
      context.req.param('roomId'),
      participantInput,
      actorId
    );
    return context.json({ data: participant }, 201);
  });

  app.post('/rooms/:roomId/messages', async (context) => {
    const input = await readJsonObject<SendMessageInput>(context);
    const message = await options.service.sendMessage(
      tenantId(context),
      context.req.param('roomId'),
      omitReserved(input, 'tenantId', 'roomId')
    );
    return context.json({ data: message }, 201);
  });

  app.post('/rooms/:roomId/tasks', async (context) => {
    const input = await readJsonObject<CreateTaskInput & { actorId?: string }>(
      context
    );
    const { actorId, ...taskInput } = omitReserved(input, 'tenantId', 'roomId');
    const task = await options.service.createTask(
      tenantId(context),
      context.req.param('roomId'),
      taskInput,
      actorId
    );
    return context.json({ data: task }, 201);
  });

  app.post('/rooms/:roomId/tasks/:taskId/run', async (context) => {
    const run = await options.service.runTask(
      tenantId(context),
      context.req.param('roomId'),
      context.req.param('taskId')
    );
    return context.json({ data: run }, 201);
  });

  app.post('/rooms/:roomId/artifacts', async (context) => {
    const input = await readJsonObject<CreateArtifactInput>(context);
    const artifact = await options.service.createArtifact(
      tenantId(context),
      context.req.param('roomId'),
      omitReserved(input, 'tenantId', 'roomId')
    );
    return context.json({ data: artifact }, 201);
  });

  app.post('/rooms/:roomId/artifacts/:artifactId/versions', async (context) => {
    const input = await readJsonObject<CreateArtifactVersionInput>(context);
    const version = await options.service.createArtifactVersion(
      tenantId(context),
      context.req.param('roomId'),
      context.req.param('artifactId'),
      omitReserved(input, 'tenantId', 'roomId', 'artifactId')
    );
    return context.json({ data: version }, 201);
  });

  app.post('/rooms/:roomId/approvals', async (context) => {
    const input = await readJsonObject<RequestApprovalInput>(context);
    const approval = await options.service.requestApproval(
      tenantId(context),
      context.req.param('roomId'),
      omitReserved(input, 'tenantId', 'roomId')
    );
    return context.json({ data: approval }, 201);
  });

  app.post('/approvals/:approvalId/approve', async (context) => {
    const input = await readJsonObject<ResolveApprovalInput>(context);
    const approval = await options.service.resolveApproval(
      tenantId(context),
      context.req.param('approvalId'),
      'approved',
      trustedApprovalInput(context, input)
    );
    return context.json({ data: approval });
  });

  app.post('/approvals/:approvalId/reject', async (context) => {
    const input = await readJsonObject<ResolveApprovalInput>(context);
    const approval = await options.service.resolveApproval(
      tenantId(context),
      context.req.param('approvalId'),
      'rejected',
      trustedApprovalInput(context, input)
    );
    return context.json({ data: approval });
  });

  app.post('/approvals/:approvalId/request-revision', async (context) => {
    const input = await readJsonObject<ResolveApprovalInput>(context);
    const approval = await options.service.resolveApproval(
      tenantId(context),
      context.req.param('approvalId'),
      'needs_revision',
      trustedApprovalInput(context, input)
    );
    return context.json({ data: approval });
  });

  app.get('/rooms/:roomId/events', async (context) => {
    const cursor = context.req.query('cursor');
    const rawLimit = context.req.query('limit');
    if (cursor !== undefined || rawLimit !== undefined) {
      const page = await options.service.listEventPage(
        tenantId(context),
        context.req.param('roomId'),
        {
          cursor,
          limit: rawLimit === undefined ? undefined : Number(rawLimit),
        }
      );
      return context.json({ data: page });
    }
    const events = await options.service.listEvents(
      tenantId(context),
      context.req.param('roomId')
    );
    return context.json({ data: events });
  });

  if (options.execution) {
    app.get('/rooms/:roomId/execution-sessions/:sessionId', async (context) => {
      const session = await options.execution!.getSession({
        tenantId: tenantId(context),
        roomId: context.req.param('roomId'),
        sessionId: context.req.param('sessionId'),
      });
      return context.json({ data: session });
    });

    app.post(
      '/rooms/:roomId/execution-sessions/:sessionId/interventions',
      async (context) => {
        const input =
          await readJsonObject<RequestRunInterventionInput>(context);
        const authenticatedActorId = context.get('tenant').actor?.actorId;
        const session = await options.execution!.requestIntervention({
          ...omitReserved(
            input,
            'tenantId',
            'roomId',
            'sessionId',
            'requestedByParticipantId'
          ),
          tenantId: tenantId(context),
          roomId: context.req.param('roomId'),
          sessionId: context.req.param('sessionId'),
          requestedByParticipantId:
            authenticatedActorId ?? input.requestedByParticipantId,
        });
        return context.json({ data: session }, 202);
      }
    );

    app.get(
      '/rooms/:roomId/execution-sessions/:sessionId/events',
      async (context) => {
        const after = Number(context.req.query('after') ?? 0);
        const events = await options.execution!.listSessionEvents(
          {
            tenantId: tenantId(context),
            roomId: context.req.param('roomId'),
            sessionId: context.req.param('sessionId'),
          },
          after
        );
        return context.json({ data: events });
      }
    );

    if (options.executionEventStream) {
      app.get(
        '/rooms/:roomId/execution-sessions/:sessionId/events/stream',
        async (context) => {
          const afterSequence = Number(context.req.query('after') ?? 0);
          return streamToSSE(
            options.executionEventStream!({
              tenantId: tenantId(context),
              roomId: context.req.param('roomId'),
              sessionId: context.req.param('sessionId'),
              afterSequence,
              signal: context.req.raw.signal,
            }),
            { signal: context.req.raw.signal }
          );
        }
      );
    }
  }

  if (options.agentRegistry) {
    app.post('/agents', async (context) => {
      const input = await readJsonObject<{
        agentId: string;
        name: string;
        description?: string;
      }>(context);
      const agent = await options.agentRegistry!.createAgent({
        ...omitReserved(input, 'tenantId'),
        tenantId: tenantId(context),
      });
      return context.json({ data: agent }, 201);
    });

    app.post('/agents/:agentId/revisions', async (context) => {
      const input =
        await readJsonObject<CreateAgentDefinitionRevisionInput>(context);
      const revision = await options.agentRegistry!.createRevision({
        ...omitReserved(input, 'tenantId', 'agentId'),
        tenantId: tenantId(context),
        agentId: context.req.param('agentId'),
      });
      return context.json({ data: revision }, 201);
    });

    app.get('/agents/:agentId/revisions', async (context) => {
      const revisions = await options.agentRegistry!.listRevisions(
        tenantId(context),
        context.req.param('agentId')
      );
      return context.json({ data: revisions });
    });

    app.get('/agents/:agentId/revisions/:revisionId', async (context) => {
      const revision = await options.agentRegistry!.getRevision(
        tenantId(context),
        context.req.param('revisionId')
      );
      if (revision.definition.agentId !== context.req.param('agentId')) {
        throw new AgentPlatError('NOT_FOUND', 'Agent revision not found');
      }
      return context.json({ data: revision });
    });

    for (const [action, method] of [
      ['publish', 'publishRevision'],
      ['deprecate', 'deprecateRevision'],
    ] as const) {
      app.post(
        `/agents/:agentId/revisions/:revisionId/${action}`,
        async (context) => {
          const input = await readJsonObject<{
            expectedLifecycleRevision: number;
          }>(context);
          const current = await options.agentRegistry!.getRevision(
            tenantId(context),
            context.req.param('revisionId')
          );
          if (current.definition.agentId !== context.req.param('agentId')) {
            throw new AgentPlatError('NOT_FOUND', 'Agent revision not found');
          }
          const revision = await options.agentRegistry![method](
            tenantId(context),
            context.req.param('revisionId'),
            input.expectedLifecycleRevision
          );
          return context.json({ data: revision });
        }
      );
    }
  }

  if (options.handoffs) {
    app.post('/rooms/:roomId/handoffs', async (context) => {
      const input =
        await readJsonObject<
          Parameters<AgentRoomHandoffCoordinator['propose']>[0]
        >(context);
      const actorId = context.get('tenant').actor?.actorId;
      const handoff = await options.handoffs!.propose({
        ...omitReserved(input, 'tenantId', 'roomId', 'sourceParticipantId'),
        tenantId: tenantId(context),
        roomId: context.req.param('roomId'),
        sourceParticipantId: actorId ?? input.sourceParticipantId,
      });
      return context.json({ data: handoff }, 201);
    });

    app.get('/rooms/:roomId/handoffs/:handoffId', async (context) => {
      const handoff = await options.handoffs!.get({
        tenantId: tenantId(context),
        roomId: context.req.param('roomId'),
        handoffId: context.req.param('handoffId'),
      });
      return context.json({ data: handoff });
    });

    app.post('/rooms/:roomId/handoffs/:handoffId/accept', async (context) => {
      const input = await readJsonObject<{
        expectedRevision: number;
        acceptedByParticipantId: string;
      }>(context);
      const handoff = await options.handoffs!.accept({
        tenantId: tenantId(context),
        roomId: context.req.param('roomId'),
        handoffId: context.req.param('handoffId'),
        expectedRevision: input.expectedRevision,
        acceptedByParticipantId:
          context.get('tenant').actor?.actorId ?? input.acceptedByParticipantId,
      });
      return context.json({ data: handoff });
    });

    app.post('/rooms/:roomId/handoffs/:handoffId/reject', async (context) => {
      const input = await readJsonObject<{
        expectedRevision: number;
        rejectedByParticipantId: string;
        reason?: string;
      }>(context);
      const handoff = await options.handoffs!.reject({
        ...input,
        tenantId: tenantId(context),
        roomId: context.req.param('roomId'),
        handoffId: context.req.param('handoffId'),
        rejectedByParticipantId:
          context.get('tenant').actor?.actorId ?? input.rejectedByParticipantId,
      });
      return context.json({ data: handoff });
    });

    for (const [action, method] of [
      ['bind-run', 'bindRun'],
      ['reconcile', 'reconcile'],
    ] as const) {
      app.post(
        `/rooms/:roomId/handoffs/:handoffId/${action}`,
        async (context) => {
          const input = await readJsonObject<Record<string, unknown>>(context);
          const handoff = await options.handoffs![method]({
            ...input,
            tenantId: tenantId(context),
            roomId: context.req.param('roomId'),
            handoffId: context.req.param('handoffId'),
          } as never);
          return context.json({ data: handoff });
        }
      );
    }
  }

  if (options.humanContributions) {
    app.post('/rooms/:roomId/human-contributions', async (context) => {
      const input = await readJsonObject<Record<string, unknown>>(context);
      const contribution = await options.humanContributions!.request({
        ...input,
        tenantId: tenantId(context),
        roomId: context.req.param('roomId'),
        requestedByParticipantId:
          context.get('tenant').actor?.actorId ??
          String(input.requestedByParticipantId ?? ''),
      } as never);
      return context.json({ data: contribution }, 201);
    });
    app.get(
      '/rooms/:roomId/human-contributions/:contributionId',
      async (context) =>
        context.json({
          data: await options.humanContributions!.get({
            tenantId: tenantId(context),
            roomId: context.req.param('roomId'),
            contributionId: context.req.param('contributionId'),
          }),
        })
    );
    for (const method of ['assign', 'start', 'complete', 'cancel'] as const) {
      app.post(
        `/rooms/:roomId/human-contributions/:contributionId/${method}`,
        async (context) => {
          const input = await readJsonObject<Record<string, unknown>>(context);
          const actorId = context.get('tenant').actor?.actorId;
          const actorField =
            method === 'assign'
              ? {
                  assignedByParticipantId:
                    actorId ?? input.assignedByParticipantId,
                }
              : { participantId: actorId ?? input.participantId };
          const contribution = await options.humanContributions![method]({
            ...input,
            ...actorField,
            tenantId: tenantId(context),
            roomId: context.req.param('roomId'),
            contributionId: context.req.param('contributionId'),
          } as never);
          return context.json({ data: contribution });
        }
      );
    }

    if (options.workManagement) {
      app.post(
        '/rooms/:roomId/human-contributions/:contributionId/deliveries/:providerId',
        async (context) => {
          const contribution = await options.humanContributions!.get({
            tenantId: tenantId(context),
            roomId: context.req.param('roomId'),
            contributionId: context.req.param('contributionId'),
          });
          const delivery = await options.workManagement!.enqueue({
            contribution,
            providerId: context.req.param('providerId'),
          });
          return context.json({ data: delivery }, 202);
        }
      );
      app.post(
        '/rooms/:roomId/human-contributions/:contributionId/deliveries/:providerId/retry',
        async (context) => {
          const input = await readJsonObject<{
            expectedRevision: number;
            leaseToken: string;
          }>(context);
          const contribution = await options.humanContributions!.get({
            tenantId: tenantId(context),
            roomId: context.req.param('roomId'),
            contributionId: context.req.param('contributionId'),
          });
          const delivery = await options.workManagement!.synchronize({
            contribution,
            providerId: context.req.param('providerId'),
            expectedRevision: input.expectedRevision,
            leaseToken: input.leaseToken,
          });
          return context.json({ data: delivery });
        }
      );
      app.get('/rooms/:roomId/work-management/metrics', async (context) =>
        context.json({
          data: await options.workManagement!.metrics(
            tenantId(context),
            context.req.param('roomId')
          ),
        })
      );
    }
  }

  if (options.knowledge) {
    app.post('/knowledge-bundles/:bundleId/revisions', async (context) => {
      const input = await readJsonObject<{
        version: string;
        documents: Array<{
          documentId: string;
          title: string;
          content: string;
          metadata?: JsonObject;
        }>;
      }>(context);
      const bundle = await options.knowledge!.createRevision({
        tenantId: tenantId(context),
        bundleId: context.req.param('bundleId'),
        ...input,
      });
      return context.json({ data: bundle }, 201);
    });
    app.get('/knowledge-bundles/resolve', async (context) =>
      context.json({
        data: await options.knowledge!.get(
          tenantId(context),
          context.req.query('reference') ?? ''
        ),
      })
    );
    app.get('/knowledge-bundles/documents/:documentId', async (context) =>
      context.json({
        data: await options.knowledge!.readDocument(
          tenantId(context),
          context.req.query('reference') ?? '',
          context.req.param('documentId')
        ),
      })
    );
  }

  if (options.liveView) {
    const liveInput = (context: Context<RoomsApiEnv>) => ({
      tenantId: tenantId(context),
      roomId: context.req.param('roomId')!,
      coordinationId: context.req.query('coordinationId'),
      executionSessionIds: csvOptional(context.req.query('executionSessionIds')),
      handoffIds: csvOptional(context.req.query('handoffIds')),
      contributionIds: csvOptional(context.req.query('contributionIds')),
      planIds: csvOptional(context.req.query('planIds')),
      cursor: context.req.query('cursor'),
    });
    app.get('/rooms/:roomId/live', async (context) =>
      context.json({ data: await options.liveView!.get(liveInput(context)) })
    );
    app.get('/rooms/:roomId/live/stream', async (context) =>
      streamToSSE(
        options.liveView!.stream(liveInput(context), {
          signal: context.req.raw.signal,
        }),
        { signal: context.req.raw.signal }
      )
    );
  }

  if (options.planner) {
    app.post('/rooms/:roomId/plans', async (context) => {
      const input = await readJsonObject<Record<string, unknown>>(context);
      const plan = await options.planner!.create({
        ...input,
        tenantId: tenantId(context),
        roomId: context.req.param('roomId'),
      } as never);
      return context.json({ data: plan }, 201);
    });
    app.get('/rooms/:roomId/plans/:planId', async (context) =>
      context.json({
        data: await options.planner!.get({
          tenantId: tenantId(context),
          roomId: context.req.param('roomId'),
          planId: context.req.param('planId'),
        }),
      })
    );
    app.post('/rooms/:roomId/plans/:planId/materialize', async (context) => {
      const input = await readJsonObject<{ expectedRevision: number }>(context);
      return context.json({
        data: await options.planner!.materialize({
          tenantId: tenantId(context),
          roomId: context.req.param('roomId'),
          planId: context.req.param('planId'),
          expectedRevision: input.expectedRevision,
        }),
      });
    });
    app.post('/rooms/:roomId/plans/:planId/replan', async (context) => {
      const input = await readJsonObject<{
        predecessorPlanId: string;
        triggerEventId: string;
        objective: string;
        steps: Parameters<
          AgentRoomPlannerBridge['replanFromEvent']
        >[0]['steps'];
      }>(context);
      return context.json({
        data: await options.planner!.replanFromEvent({
          tenantId: tenantId(context),
          roomId: context.req.param('roomId'),
          planId: context.req.param('planId'),
          ...input,
        }),
      });
    });
    app.post('/rooms/:roomId/plans/reconcile', async (context) => {
      const input = await readJsonObject<{ triggerEventId: string }>(context);
      return context.json({
        data: await options.planner!.reconcileFromEvent({
          tenantId: tenantId(context),
          roomId: context.req.param('roomId'),
          triggerEventId: input.triggerEventId,
        }),
      });
    });
  }

  if (options.participantMembership) {
    app.put(
      '/rooms/:roomId/participants/:participantId/membership',
      async (context) => {
        const input = await readJsonObject<Record<string, unknown>>(context);
        const membership = await options.participantMembership!.create({
          ...input,
          tenantId: tenantId(context),
          roomId: context.req.param('roomId'),
          participantId: context.req.param('participantId'),
        } as never);
        return context.json({ data: membership }, 201);
      }
    );
    app.patch(
      '/rooms/:roomId/participants/:participantId/membership',
      async (context) => {
        const input = await readJsonObject<Record<string, unknown>>(context);
        return context.json({
          data: await options.participantMembership!.transition({
            ...input,
            tenantId: tenantId(context),
            roomId: context.req.param('roomId'),
            participantId: context.req.param('participantId'),
          } as never),
        });
      }
    );
    app.get('/rooms/:roomId/participant-memberships', async (context) =>
      context.json({
        data: await options.participantMembership!.list(
          tenantId(context),
          context.req.param('roomId')
        ),
      })
    );
  }

  app.notFound((context) =>
    context.json(
      { error: { code: 'NOT_FOUND', message: 'Route not found' } },
      404
    )
  );

  return app;
}

function tenantId(context: Context<RoomsApiEnv>): string {
  return context.get('tenant').tenantId;
}

function trustedApprovalInput(
  context: Context<RoomsApiEnv>,
  input: ResolveApprovalInput
): ResolveApprovalInput {
  const sanitized = omitReserved(
    input,
    'tenantId',
    'id',
    'approvalId',
    'status'
  );
  const authenticatedActorId = context.get('tenant').actor?.actorId;
  return authenticatedActorId
    ? { ...sanitized, decidedBy: authenticatedActorId }
    : sanitized;
}

async function readJsonObject<T extends object = JsonRecord>(
  context: Context<RoomsApiEnv>
): Promise<T> {
  const body = await context.req.text();
  if (!body.trim()) {
    throw new AgentPlatError('BAD_REQUEST', 'A JSON request body is required');
  }
  return parseJsonObject(body) as T;
}

async function readOptionalJsonObject<T extends object = JsonRecord>(
  context: Context<RoomsApiEnv>
): Promise<T> {
  const body = await context.req.text();
  return (body.trim() ? parseJsonObject(body) : {}) as T;
}

function parseJsonObject(body: string): JsonRecord {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    throw new AgentPlatError('BAD_REQUEST', 'Request body must be valid JSON');
  }

  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new AgentPlatError(
      'VALIDATION_ERROR',
      'Request body must be an object'
    );
  }
  return value as JsonRecord;
}

function csv(value: string | undefined): string[] {
  return value
    ? [
        ...new Set(
          value
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
        ),
      ]
    : [];
}

function csvOptional(value: string | undefined): string[] | undefined {
  return value === undefined ? undefined : csv(value);
}

function omitReserved<T extends object>(input: T, ...keys: string[]): T {
  const output = { ...input } as T & Record<string, unknown>;
  for (const key of keys) {
    delete output[key];
  }
  return output;
}

function errorResponse(
  context: Context,
  error: Error,
  exposeDetails: boolean
): Response {
  const normalized = normalizeError(error);
  const payload: {
    error: { code: string; message: string; details?: unknown };
  } = {
    error: {
      code: normalized.code,
      message: normalized.message,
    },
  };
  if (exposeDetails && normalized.details !== undefined) {
    payload.error.details = normalized.details;
  }
  return context.json(payload, normalized.status);
}

function normalizeError(error: unknown): {
  code: string;
  message: string;
  details?: unknown;
  status: 400 | 401 | 403 | 404 | 409 | 422 | 500 | 502;
} {
  if (isAgentPlatError(error)) {
    return {
      code: error.code,
      message: error.message,
      details: error.details,
      status: validStatus(error.statusCode) ?? statusForCode(error.code),
    };
  }
  return {
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
    status: 500,
  };
}

function isAgentPlatError(error: unknown): error is AgentPlatError {
  const knownCodes = new Set([
    'BAD_REQUEST',
    'UNAUTHORIZED',
    'FORBIDDEN',
    'NOT_FOUND',
    'CONFLICT',
    'VALIDATION_ERROR',
    'INTERNAL_ERROR',
    'ADAPTER_ERROR',
  ]);
  return (
    error instanceof AgentPlatError ||
    (!!error &&
      typeof error === 'object' &&
      typeof (error as { code?: unknown }).code === 'string' &&
      knownCodes.has((error as { code: string }).code) &&
      typeof (error as { message?: unknown }).message === 'string')
  );
}

function validStatus(
  status: number | undefined
): 400 | 401 | 403 | 404 | 409 | 422 | 500 | 502 | undefined {
  const supported = [400, 401, 403, 404, 409, 422, 500, 502] as const;
  return supported.find((candidate) => candidate === status);
}

function statusForCode(
  code: string
): 400 | 401 | 403 | 404 | 409 | 422 | 500 | 502 {
  switch (code) {
    case 'BAD_REQUEST':
    case 'VALIDATION_ERROR':
      return 400;
    case 'UNAUTHORIZED':
      return 401;
    case 'FORBIDDEN':
      return 403;
    case 'NOT_FOUND':
      return 404;
    case 'CONFLICT':
      return 409;
    case 'ADAPTER_ERROR':
      return 502;
    default:
      return 500;
  }
}
