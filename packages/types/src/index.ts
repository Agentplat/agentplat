// Tipos compartidos para la plataforma

export type TenantStatus = 'active' | 'inactive' | 'suspended';
export type AgentStatus = 'active' | 'inactive' | 'training' | 'error';
export type AgentPlatform = 'openai' | 'google' | 'facebook' | 'anthropic' | 'meta' | 'perplexity';
export type TrainingJobStatus = 'pending' | 'in-progress' | 'completed' | 'failed' | 'cancelled';

export interface Tenant {
  id: string;
  name: string;
  domain?: string;
  status: TenantStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Agent {
  id: string;
  tenantId: string;
  name: string;
  platform: AgentPlatform;
  config: Record<string, unknown>;
  status: AgentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AgentTrainingJob {
  id: string;
  agentId: string;
  tenantId: string;
  status: TrainingJobStatus;
  trainingData?: Record<string, unknown>;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  metrics?: {
    accuracy?: number;
    loss?: number;
    epochs?: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: 'admin' | 'user' | 'viewer';
  cognitoUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  tenantId: string;
  userId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

