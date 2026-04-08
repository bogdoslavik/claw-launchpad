export interface ApiSession {
  id: string;
  userId: string;
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionStore {
  create(session: ApiSession): Promise<ApiSession>;
  get(sessionId: string): Promise<ApiSession | undefined>;
  delete(sessionId: string): Promise<void>;
}

export class MemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, ApiSession>();

  async create(session: ApiSession): Promise<ApiSession> {
    this.sessions.set(session.id, structuredClone(session));
    return structuredClone(session);
  }

  async get(sessionId: string): Promise<ApiSession | undefined> {
    return structuredClone(this.sessions.get(sessionId));
  }

  async delete(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }
}

