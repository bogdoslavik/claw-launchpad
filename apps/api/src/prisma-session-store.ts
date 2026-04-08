import { PrismaClient } from "@prisma/client";

import type { ApiSession, SessionStore } from "./session-store.js";

function toApiSession(record: {
  id: string;
  userId: string;
  accessToken: string;
  refreshToken: string | null;
  accessTokenExpiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}): ApiSession {
  return {
    id: record.id,
    userId: record.userId,
    accessToken: record.accessToken,
    refreshToken: record.refreshToken ?? undefined,
    accessTokenExpiresAt: record.accessTokenExpiresAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export class PrismaSessionStore implements SessionStore {
  constructor(private readonly prisma: PrismaClient) {}

  async create(session: ApiSession): Promise<ApiSession> {
    const record = await this.prisma.apiSession.create({
      data: {
        id: session.id,
        userId: session.userId,
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        accessTokenExpiresAt: new Date(session.accessTokenExpiresAt),
        createdAt: new Date(session.createdAt),
        updatedAt: new Date(session.updatedAt),
      },
    });
    return toApiSession(record);
  }

  async get(sessionId: string): Promise<ApiSession | undefined> {
    const record = await this.prisma.apiSession.findUnique({
      where: { id: sessionId },
    });
    return record ? toApiSession(record) : undefined;
  }

  async delete(sessionId: string): Promise<void> {
    await this.prisma.apiSession.deleteMany({
      where: { id: sessionId },
    });
  }
}

