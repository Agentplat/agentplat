import { AgentPlatError } from '@agentplat/core';
import type { AgentPlatID, TenantContext } from '@agentplat/core';

export type AuthUserType = 'HUMAN' | 'MACHINE' | 'SYSTEM';
export type AuthScopeType = 'ORG' | 'WORKSPACE' | 'AGENT' | 'TENANT' | 'GLOBAL';

export interface AuthContext {
  userId?: AgentPlatID;
  email?: string;
  appId?: AgentPlatID;
  roles: string[];
  tenantId?: AgentPlatID;
  userType: AuthUserType;
  scopeType?: AuthScopeType;
  scopeValue?: string | string[];
  isAdmin?: boolean;
  permissions: string[];
}

export interface AuthRequest {
  headers: Record<string, string | undefined>;
  path?: string;
  method?: string;
}

export interface AuthProvider {
  authenticate(request: AuthRequest): Promise<AuthContext>;
}

export interface TenantResolver {
  resolveTenant(
    context: AuthContext,
    request: AuthRequest
  ): Promise<TenantContext>;
}

export function hasPermission(
  context: AuthContext,
  permission: string
): boolean {
  return (
    context.permissions.includes('*') ||
    context.permissions.includes(permission)
  );
}

export class StaticAuthProvider implements AuthProvider {
  constructor(private readonly context: AuthContext) {}

  async authenticate(_request: AuthRequest): Promise<AuthContext> {
    return this.context;
  }
}

export class AuthContextTenantResolver implements TenantResolver {
  async resolveTenant(
    context: AuthContext,
    _request: AuthRequest
  ): Promise<TenantContext> {
    if (!context.tenantId) {
      throw new AgentPlatError(
        'UNAUTHORIZED',
        'Authenticated context does not contain a tenant'
      );
    }
    return {
      tenantId: context.tenantId,
      actor: {
        actorId: context.userId,
        actorType:
          context.userType === 'HUMAN'
            ? 'human'
            : context.userType === 'MACHINE'
              ? 'machine'
              : 'system',
        email: context.email,
        roles: context.roles,
      },
    };
  }
}
