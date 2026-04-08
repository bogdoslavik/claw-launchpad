import type { ApiSession as PrismaApiSession } from "@prisma/client";
import { PrismaClient } from "@prisma/client";
import type { Clock } from "@launchpad/core";

import { isApiSessionExpired, type ApiSession, type SessionStore } from "./session-store.js";

function toApiSession(record: PrismaApiSession): ApiSession {
  return {
    id: record.id,
    userId: record.userId,
    accessToken: record.accessToken,
    refreshToken: record.refreshToken ?? undefined,
    accessTokenExpiresAt: record.accessTokenExpiresAt.toISOString(),
    expiresAt: record.expiresAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export class PrismaSessionStore implements SessionStore {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly clock: Clock,
  ) {}

  async create(session: ApiSession): Promise<ApiSession> {
    const record = await this.prisma.apiSession.create({
      data: {
        id: session.id,
        userId: session.userId,
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        accessTokenExpiresAt: new Date(session.accessTokenExpiresAt),
        expiresAt: new Date(session.expiresAt),
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
    if (!record) {
      return undefined;
    }

    const session = toApiSession(record);
    if (isApiSessionExpired(session, this.clock)) {
      await this.delete(sessionId);
      return undefined;
    }

    return session;
  }

  async delete(sessionId: string): Promise<void> {
    await this.prisma.apiSession.deleteMany({
      where: { id: sessionId },
    });
  }
}
