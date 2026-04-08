import type { Clock } from "@launchpad/core";

export interface ApiSession {
  id: string;
  userId: string;
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresAt: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionStore {
  create(session: ApiSession): Promise<ApiSession>;
  get(sessionId: string): Promise<ApiSession | undefined>;
  delete(sessionId: string): Promise<void>;
}

function isExpired(session: ApiSession, clock: Clock): boolean {
  return new Date(session.expiresAt).getTime() <= clock.now().getTime();
}

export class MemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, ApiSession>();

  constructor(private readonly clock: Clock) {}

  async create(session: ApiSession): Promise<ApiSession> {
    this.sessions.set(session.id, structuredClone(session));
    return structuredClone(session);
  }

  async get(sessionId: string): Promise<ApiSession | undefined> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return undefined;
    }

    if (isExpired(session, this.clock)) {
      this.sessions.delete(sessionId);
      return undefined;
    }

    return structuredClone(session);
  }

  async delete(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }
}

export { isExpired as isApiSessionExpired };
