import { AgentPlatError } from '@agentplat/core';
import type { TenantContext } from '@agentplat/core';
import type {
  AddParticipantInput,
  CreateArtifactInput,
  CreateRoomInput,
  CreateTaskInput,
  RoomService,
} from '@agentplat/rooms';
import { Hono } from 'hono';
import type { Context, MiddlewareHandler } from 'hono';

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
    const events = await options.service.listEvents(
      tenantId(context),
      context.req.param('roomId')
    );
    return context.json({ data: events });
  });

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
