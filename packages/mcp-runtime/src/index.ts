import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuditSink } from '@agentplat/audit';
import type { JsonObject } from '@agentplat/core';
import type { RoomService } from '@agentplat/rooms';
import { z } from 'zod';

export type RuntimeAction =
  | 'rooms.read' | 'rooms.create' | 'agents.list' | 'tasks.create'
  | 'messages.send' | 'artifacts.read' | 'artifacts.submit'
  | 'approvals.request' | 'audit.read';

export interface McpRuntimePrincipal { tenantId: string; actorId: string; actorType?: 'human' | 'machine' | 'system'; }
export interface McpRuntimeAuthorizer { authorize(principal: McpRuntimePrincipal, action: RuntimeAction, roomId?: string): Promise<void>; }
export interface IdempotencyStore { get(key: string): Promise<unknown | undefined>; set(key: string, value: unknown): Promise<void>; }
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly values = new Map<string, unknown>();
  async get(key: string) { return this.values.get(key); }
  async set(key: string, value: unknown) { this.values.set(key, value); }
}

export interface CreateRuntimeMcpServerOptions {
  service: Pick<RoomService, 'listRooms' | 'createRoom' | 'getRoomState' | 'sendMessage' | 'createTask' | 'createArtifact' | 'requestApproval' | 'listEvents'>;
  principal: McpRuntimePrincipal;
  authorizer: McpRuntimeAuthorizer;
  audit: AuditSink;
  idempotency: IdempotencyStore;
  idGenerator?: () => string;
  clock?: () => Date;
}

const text = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] });

export function createRuntimeMcpServer(options: CreateRuntimeMcpServerOptions): McpServer {
  const server = new McpServer({ name: 'agentplat-runtime', version: '0.3.0-beta.3' });
  const now = options.clock ?? (() => new Date());
  const id = options.idGenerator ?? (() => globalThis.crypto.randomUUID());
  const authorize = (action: RuntimeAction, roomId?: string) => options.authorizer.authorize(options.principal, action, roomId);
  const audit = async (action: RuntimeAction, resourceType: string, resourceId: string, details: JsonObject = {}) => options.audit.write({ id: id(), tenantId: options.principal.tenantId, actorId: options.principal.actorId, actorType: options.principal.actorType ?? 'machine', action: `mcp.${action}`, resource: { type: resourceType, id: resourceId }, details, createdAt: now().toISOString() });
  const mutate = async <T>(key: string, action: RuntimeAction, roomId: string | undefined, resourceType: string, work: () => Promise<T>) => {
    const scopedKey = `${options.principal.tenantId}:${options.principal.actorId}:${action}:${key}`;
    const previous = await options.idempotency.get(scopedKey); if (previous !== undefined) return previous as T;
    await authorize(action, roomId); const value = await work(); await options.idempotency.set(scopedKey, value); await audit(action, resourceType, roomId ?? 'collection', { idempotencyKey: key }); return value;
  };

  server.registerTool('list_rooms', { description: 'List rooms visible to the authenticated tenant.', inputSchema: {} }, async () => { await authorize('rooms.read'); const rooms = await options.service.listRooms(options.principal.tenantId); await audit('rooms.read', 'room', 'collection'); return text(rooms); });
  server.registerTool('get_room', { description: 'Get a room and its scoped state.', inputSchema: { roomId: z.string().min(1) } }, async ({ roomId }) => { await authorize('rooms.read', roomId); const state = await options.service.getRoomState(options.principal.tenantId, roomId); await audit('rooms.read', 'room', roomId); return text(state); });
  server.registerTool('list_agents', { description: 'List participants in an authorized room.', inputSchema: { roomId: z.string().min(1) } }, async ({ roomId }) => { await authorize('agents.list', roomId); const state = await options.service.getRoomState(options.principal.tenantId, roomId); await audit('agents.list', 'room', roomId); return text(state.participants); });
  server.registerTool('create_room', { description: 'Create a room after explicit confirmation.', inputSchema: { title: z.string().min(1), goal: z.string().min(1), idempotencyKey: z.string().min(1), confirm: z.literal(true) } }, async ({ title, goal, idempotencyKey }) => text(await mutate(idempotencyKey, 'rooms.create', undefined, 'room', () => options.service.createRoom(options.principal.tenantId, { title, goal, createdBy: options.principal.actorId }))));
  server.registerTool('send_message', { description: 'Append a scoped room message after explicit confirmation.', inputSchema: { roomId: z.string().min(1), content: z.string().min(1), role: z.enum(['human','agent','system','tool']).default('human'), idempotencyKey: z.string().min(1), confirm: z.literal(true) } }, async ({ roomId, content, role, idempotencyKey }) => text(await mutate(idempotencyKey, 'messages.send', roomId, 'room', () => options.service.sendMessage(options.principal.tenantId, roomId, { role, content, authorParticipantId: options.principal.actorId }))));
  server.registerTool('create_task', { description: 'Create a room task after explicit confirmation.', inputSchema: { roomId: z.string().min(1), stepId: z.string().min(1), instruction: z.string().min(1), expectedOutput: z.string().min(1), expectedArtifactKind: z.string().min(1), idempotencyKey: z.string().min(1), confirm: z.literal(true) } }, async ({ roomId, stepId, instruction, expectedOutput, expectedArtifactKind, idempotencyKey }) => text(await mutate(idempotencyKey, 'tasks.create', roomId, 'task', () => options.service.createTask(options.principal.tenantId, roomId, { stepId, instruction, expectedOutput, expectedArtifactKind }, options.principal.actorId))));
  server.registerTool('get_artifact', { description: 'Get one artifact from an authorized room.', inputSchema: { roomId: z.string().min(1), artifactId: z.string().min(1) } }, async ({ roomId, artifactId }) => { await authorize('artifacts.read', roomId); const state = await options.service.getRoomState(options.principal.tenantId, roomId); const artifact = state.artifacts.find(candidate => candidate.id === artifactId); if (!artifact) return { content: [{ type: 'text' as const, text: `Artifact not found: ${artifactId}` }], isError: true }; await audit('artifacts.read', 'artifact', artifactId); return text(artifact); });
  server.registerTool('submit_artifact', { description: 'Create an artifact after explicit confirmation.', inputSchema: { roomId: z.string().min(1), type: z.string().min(1), title: z.string().min(1), content: z.unknown(), contentType: z.string().optional(), idempotencyKey: z.string().min(1), confirm: z.literal(true) } }, async ({ roomId, type, title, content, contentType, idempotencyKey }) => text(await mutate(idempotencyKey, 'artifacts.submit', roomId, 'artifact', () => options.service.createArtifact(options.principal.tenantId, roomId, { type, title, content: content as any, contentType, createdBy: options.principal.actorId }))));
  server.registerTool('request_approval', { description: 'Request an approval after explicit confirmation.', inputSchema: { roomId: z.string().min(1), targetType: z.enum(['room','task','artifact','action']), targetId: z.string().min(1), action: z.string().optional(), idempotencyKey: z.string().min(1), confirm: z.literal(true) } }, async ({ roomId, targetType, targetId, action, idempotencyKey }) => text(await mutate(idempotencyKey, 'approvals.request', roomId, 'approval', () => options.service.requestApproval(options.principal.tenantId, roomId, { targetType, targetId, action, requestedBy: options.principal.actorId }))));
  server.registerTool('get_audit_log', { description: 'Read room lifecycle events visible to the authenticated tenant.', inputSchema: { roomId: z.string().min(1) } }, async ({ roomId }) => { await authorize('audit.read', roomId); const events = await options.service.listEvents(options.principal.tenantId, roomId); await audit('audit.read', 'room', roomId); return text(events); });
  return server;
}
