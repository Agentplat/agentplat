import { type A2AHttpServer } from '@agentplat/a2a';
import { type McpHttpServer } from '@agentplat/mcp';

export interface InteroperabilityRoute {
  /** Absolute path prefix, for example `/interop/a2a`. */
  path: string;
}

export interface InteroperabilityHandlerOptions {
  a2a?: InteroperabilityRoute & { server: A2AHttpServer };
  mcp?: InteroperabilityRoute & { server: McpHttpServer };
}

/**
 * One Fetch-compatible mount point for the framework's protocol adapters.
 * Authentication, tenant resolution and authorization remain inside each
 * supplied server's resolver, so this router never trusts request headers.
 */
export function createInteroperabilityHandler(
  options: InteroperabilityHandlerOptions
): (request: Request) => Promise<Response> {
  const a2aPath = options.a2a ? normalizePath(options.a2a.path) : undefined;
  const mcpPath = options.mcp ? normalizePath(options.mcp.path) : undefined;

  return async (request: Request): Promise<Response> => {
    const path = new URL(request.url).pathname;
    if (options.mcp && path === mcpPath)
      return options.mcp.server.handle(request);
    if (options.a2a && (path === a2aPath || path.startsWith(`${a2aPath}/`))) {
      return options.a2a.server.handle(request);
    }
    return Response.json(
      {
        error: { code: 'INTEROP_ROUTE_NOT_FOUND', message: 'Route not found' },
      },
      { status: 404 }
    );
  };
}

function normalizePath(path: string): string {
  if (!path.startsWith('/'))
    throw new Error('Interoperability route must start with /');
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}
