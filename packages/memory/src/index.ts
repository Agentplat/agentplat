import { AgentPlatError } from '@agentplat/core';
import type {
  AgentPlatID,
  ISODateTime,
  JsonObject,
  Metadata,
  TenantScoped,
  Timestamped,
} from '@agentplat/core';

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
  getSession(
    tenantId: AgentPlatID,
    sessionId: AgentPlatID
  ): Promise<Session | undefined>;
  appendMessage(message: Message): Promise<Message>;
  listMessages(
    tenantId: AgentPlatID,
    sessionId: AgentPlatID
  ): Promise<Message[]>;
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
  search(
    query: string,
    options: { tenantId: AgentPlatID; limit?: number; metadata?: Metadata }
  ): Promise<RetrievalResult[]>;
}

export class InMemoryMemoryStore implements MemoryStore {
  private readonly sessions = new Map<string, Session>();
  private readonly messages = new Map<string, Message[]>();

  async createSession(session: Session): Promise<Session> {
    const key = this.sessionKey(session.tenantId, session.id);
    if (this.sessions.has(key)) {
      throw new AgentPlatError(
        'CONFLICT',
        `Session "${session.id}" already exists`
      );
    }
    this.sessions.set(key, session);
    this.messages.set(key, []);
    return session;
  }

  async getSession(
    tenantId: AgentPlatID,
    sessionId: AgentPlatID
  ): Promise<Session | undefined> {
    return this.sessions.get(this.sessionKey(tenantId, sessionId));
  }

  async appendMessage(message: Message): Promise<Message> {
    const key = this.sessionKey(message.tenantId, message.sessionId);
    if (!this.sessions.has(key)) {
      throw new AgentPlatError(
        'NOT_FOUND',
        `Session "${message.sessionId}" was not found`
      );
    }
    this.messages.get(key)?.push(message);
    return message;
  }

  async listMessages(
    tenantId: AgentPlatID,
    sessionId: AgentPlatID
  ): Promise<Message[]> {
    const key = this.sessionKey(tenantId, sessionId);
    if (!this.sessions.has(key)) {
      throw new AgentPlatError(
        'NOT_FOUND',
        `Session "${sessionId}" was not found`
      );
    }
    return [...(this.messages.get(key) ?? [])].sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt)
    );
  }

  private sessionKey(tenantId: AgentPlatID, sessionId: AgentPlatID): string {
    return `${tenantId}:${sessionId}`;
  }
}
