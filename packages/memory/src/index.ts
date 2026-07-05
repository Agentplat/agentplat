import type { AgentPlatID, ISODateTime, JsonObject, Metadata, TenantScoped, Timestamped } from '@agentplat/core';

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface Session extends TenantScoped, Timestamped {
  id: AgentPlatID;
  agentId: AgentPlatID;
  userId?: AgentPlatID;
  title?: string;
  metadata?: Metadata;
}

export interface Message extends TenantScoped {
  id: AgentPlatID;
  sessionId: AgentPlatID;
  role: MessageRole;
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: JsonObject[];
  metadata?: Metadata;
  createdAt: ISODateTime;
}

export interface MemoryStore {
  createSession(session: Session): Promise<Session>;
  getSession(tenantId: AgentPlatID, sessionId: AgentPlatID): Promise<Session | undefined>;
  appendMessage(message: Message): Promise<Message>;
  listMessages(tenantId: AgentPlatID, sessionId: AgentPlatID): Promise<Message[]>;
}

export interface KnowledgeSource extends TenantScoped, Timestamped {
  id: AgentPlatID;
  name: string;
  type: 'file' | 'url' | 'text' | 'external';
  uri?: string;
  metadata?: Metadata;
}

export interface VectorStoreRef {
  provider: string;
  id: string;
  metadata?: Metadata;
}

export interface RetrievalResult {
  sourceId: AgentPlatID;
  content: string;
  score?: number;
  metadata?: Metadata;
}

export interface Retriever {
  search(query: string, options: { tenantId: AgentPlatID; limit?: number; metadata?: Metadata }): Promise<RetrievalResult[]>;
}
