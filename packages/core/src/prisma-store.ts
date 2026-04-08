import { Prisma, PrismaClient } from "@prisma/client";

import type {
  Deployment,
  DeploymentCallbackRecord,
  DeploymentCredential,
  DeploymentEvent,
  DigitalOceanIdentity,
  LaunchpadStore,
  User,
} from "./types.js";

function toIso(value: Date): string {
  return value.toISOString();
}

function fromIso(value: string | undefined): Date | undefined {
  return value ? new Date(value) : undefined;
}

function toUser(record: {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  doUserUuid: string;
  doTeamUuid: string;
  email: string | null;
}): User {
  return {
    id: record.id,
    createdAt: toIso(record.createdAt),
    updatedAt: toIso(record.updatedAt),
    doUserUuid: record.doUserUuid,
    doTeamUuid: record.doTeamUuid,
    email: record.email ?? undefined,
  };
}

function toDeployment(record: {
  id: string;
  userId: string;
  status: string;
  idempotencyKey: string;
  dropletId: number | null;
  dropletName: string;
  actionId: number | null;
  region: string;
  sizeSlug: string;
  imageSlug: string;
  publicIpv4: string | null;
  openclawImage: string;
  openclawModel: string;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  updatedAt: Date;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
}): Deployment {
  return {
    id: record.id,
    userId: record.userId,
    status: record.status as Deployment["status"],
    idempotencyKey: record.idempotencyKey,
    dropletId: record.dropletId ?? undefined,
    dropletName: record.dropletName,
    actionId: record.actionId ?? undefined,
    region: record.region,
    sizeSlug: record.sizeSlug,
    imageSlug: record.imageSlug,
    publicIpv4: record.publicIpv4 ?? undefined,
    openclawImage: record.openclawImage,
    openclawModel: record.openclawModel,
    createdAt: toIso(record.createdAt),
    startedAt: record.startedAt ? toIso(record.startedAt) : undefined,
    finishedAt: record.finishedAt ? toIso(record.finishedAt) : undefined,
    updatedAt: toIso(record.updatedAt),
    lastErrorCode: record.lastErrorCode ?? undefined,
    lastErrorMessage: record.lastErrorMessage ?? undefined,
  };
}

function toCallback(record: {
  deploymentId: string;
  bootstrapTokenHash: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}): DeploymentCallbackRecord {
  return {
    deploymentId: record.deploymentId,
    bootstrapTokenHash: record.bootstrapTokenHash,
    expiresAt: toIso(record.expiresAt),
    createdAt: toIso(record.createdAt),
    updatedAt: toIso(record.updatedAt),
  };
}

function toCredential(record: {
  deploymentId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}): DeploymentCredential {
  return {
    deploymentId: record.deploymentId,
    accessToken: record.accessToken,
    refreshToken: record.refreshToken ?? undefined,
    expiresAt: toIso(record.expiresAt),
    createdAt: toIso(record.createdAt),
    updatedAt: toIso(record.updatedAt),
  };
}

function toEvent(record: {
  id: string;
  deploymentId: string;
  ts: Date;
  type: string;
  payload: Prisma.JsonValue | null;
}): DeploymentEvent {
  return {
    id: record.id,
    deploymentId: record.deploymentId,
    ts: toIso(record.ts),
    type: record.type as DeploymentEvent["type"],
    payload: (record.payload as Record<string, unknown> | null) ?? undefined,
  };
}

export class PrismaLaunchpadStore implements LaunchpadStore {
  constructor(private readonly prisma: PrismaClient) {}

  async upsertUser(identity: DigitalOceanIdentity, nowIso: string): Promise<User> {
    const record = await this.prisma.user.upsert({
      where: {
        doUserUuid_doTeamUuid: {
          doUserUuid: identity.uuid,
          doTeamUuid: identity.teamUuid,
        },
      },
      create: {
        id: crypto.randomUUID(),
        createdAt: new Date(nowIso),
        updatedAt: new Date(nowIso),
        doUserUuid: identity.uuid,
        doTeamUuid: identity.teamUuid,
        email: identity.email,
      },
      update: {
        updatedAt: new Date(nowIso),
        email: identity.email,
      },
    });

    return toUser(record);
  }

  async findUserById(userId: string): Promise<User | undefined> {
    const record = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    return record ? toUser(record) : undefined;
  }

  async createDeployment(deployment: Deployment): Promise<Deployment> {
    const record = await this.prisma.deployment.create({
      data: {
        id: deployment.id,
        userId: deployment.userId,
        status: deployment.status,
        idempotencyKey: deployment.idempotencyKey,
        dropletId: deployment.dropletId,
        dropletName: deployment.dropletName,
        actionId: deployment.actionId,
        region: deployment.region,
        sizeSlug: deployment.sizeSlug,
        imageSlug: deployment.imageSlug,
        publicIpv4: deployment.publicIpv4,
        openclawImage: deployment.openclawImage,
        openclawModel: deployment.openclawModel,
        createdAt: new Date(deployment.createdAt),
        startedAt: fromIso(deployment.startedAt),
        finishedAt: fromIso(deployment.finishedAt),
        updatedAt: new Date(deployment.updatedAt),
        lastErrorCode: deployment.lastErrorCode,
        lastErrorMessage: deployment.lastErrorMessage,
      },
    });
    return toDeployment(record);
  }

  async updateDeployment(
    deploymentId: string,
    updater: (current: Deployment) => Deployment,
  ): Promise<Deployment> {
    const current = await this.findDeploymentById(deploymentId);
    if (!current) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }

    const next = updater(current);
    const record = await this.prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        status: next.status,
        dropletId: next.dropletId,
        dropletName: next.dropletName,
        actionId: next.actionId,
        region: next.region,
        sizeSlug: next.sizeSlug,
        imageSlug: next.imageSlug,
        publicIpv4: next.publicIpv4,
        openclawImage: next.openclawImage,
        openclawModel: next.openclawModel,
        startedAt: fromIso(next.startedAt),
        finishedAt: fromIso(next.finishedAt),
        updatedAt: new Date(next.updatedAt),
        lastErrorCode: next.lastErrorCode,
        lastErrorMessage: next.lastErrorMessage,
      },
    });
    return toDeployment(record);
  }

  async findDeploymentById(deploymentId: string): Promise<Deployment | undefined> {
    const record = await this.prisma.deployment.findUnique({
      where: { id: deploymentId },
    });
    return record ? toDeployment(record) : undefined;
  }

  async findDeploymentByIdempotencyKey(userId: string, idempotencyKey: string): Promise<Deployment | undefined> {
    const record = await this.prisma.deployment.findUnique({
      where: {
        userId_idempotencyKey: {
          userId,
          idempotencyKey,
        },
      },
    });
    return record ? toDeployment(record) : undefined;
  }

  async listDeploymentsByUser(userId: string): Promise<Deployment[]> {
    const records = await this.prisma.deployment.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return records.map(toDeployment);
  }

  async listDeploymentsNeedingTracking(): Promise<Deployment[]> {
    const records = await this.prisma.deployment.findMany({
      where: {
        status: {
          notIn: ["running", "failed", "canceled"],
        },
      },
      orderBy: { createdAt: "asc" },
    });
    return records.map(toDeployment);
  }

  async saveDeploymentCallback(record: DeploymentCallbackRecord): Promise<DeploymentCallbackRecord> {
    const saved = await this.prisma.deploymentCallback.upsert({
      where: { deploymentId: record.deploymentId },
      create: {
        deploymentId: record.deploymentId,
        bootstrapTokenHash: record.bootstrapTokenHash,
        expiresAt: new Date(record.expiresAt),
        createdAt: new Date(record.createdAt),
        updatedAt: new Date(record.updatedAt),
      },
      update: {
        bootstrapTokenHash: record.bootstrapTokenHash,
        expiresAt: new Date(record.expiresAt),
        updatedAt: new Date(record.updatedAt),
      },
    });
    return toCallback(saved);
  }

  async findDeploymentCallback(deploymentId: string): Promise<DeploymentCallbackRecord | undefined> {
    const record = await this.prisma.deploymentCallback.findUnique({
      where: { deploymentId },
    });
    return record ? toCallback(record) : undefined;
  }

  async saveDeploymentCredential(record: DeploymentCredential): Promise<DeploymentCredential> {
    const saved = await this.prisma.deploymentCredential.upsert({
      where: { deploymentId: record.deploymentId },
      create: {
        deploymentId: record.deploymentId,
        accessToken: record.accessToken,
        refreshToken: record.refreshToken,
        expiresAt: new Date(record.expiresAt),
        createdAt: new Date(record.createdAt),
        updatedAt: new Date(record.updatedAt),
      },
      update: {
        accessToken: record.accessToken,
        refreshToken: record.refreshToken,
        expiresAt: new Date(record.expiresAt),
        updatedAt: new Date(record.updatedAt),
      },
    });
    return toCredential(saved);
  }

  async findDeploymentCredential(deploymentId: string): Promise<DeploymentCredential | undefined> {
    const record = await this.prisma.deploymentCredential.findUnique({
      where: { deploymentId },
    });
    return record ? toCredential(record) : undefined;
  }

  async deleteDeploymentCredential(deploymentId: string): Promise<void> {
    await this.prisma.deploymentCredential.deleteMany({
      where: { deploymentId },
    });
  }

  async appendEvent(event: DeploymentEvent): Promise<DeploymentEvent> {
    const saved = await this.prisma.deploymentEvent.create({
      data: {
        id: event.id,
        deploymentId: event.deploymentId,
        ts: new Date(event.ts),
        type: event.type,
        payload: (event.payload as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
      },
    });
    return toEvent(saved);
  }

  async listDeploymentEvents(deploymentId: string): Promise<DeploymentEvent[]> {
    const records = await this.prisma.deploymentEvent.findMany({
      where: { deploymentId },
      orderBy: { ts: "asc" },
    });
    return records.map(toEvent);
  }
}

