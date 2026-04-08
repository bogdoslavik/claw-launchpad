import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { deploymentStatuses } from "./types.js";
import type {
  Deployment,
  DeploymentCallbackRecord,
  DeploymentCredential,
  DeploymentEvent,
  DigitalOceanIdentity,
  LaunchpadStore,
  User,
} from "./types.js";

interface LaunchpadDatabase {
  users: User[];
  deployments: Deployment[];
  callbacks: DeploymentCallbackRecord[];
  credentials: DeploymentCredential[];
  events: DeploymentEvent[];
}

function createEmptyDatabase(): LaunchpadDatabase {
  return {
    users: [],
    deployments: [],
    callbacks: [],
    credentials: [],
    events: [],
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function terminal(status: Deployment["status"]): boolean {
  return status === "running" || status === "failed" || status === "canceled";
}

function upsertUserInDatabase(db: LaunchpadDatabase, identity: DigitalOceanIdentity, nowIso: string): User {
  const existing = db.users.find((user) => user.doUserUuid === identity.uuid && user.doTeamUuid === identity.teamUuid);
  if (existing) {
    existing.updatedAt = nowIso;
    existing.email = identity.email;
    return clone(existing);
  }

  const user: User = {
    id: crypto.randomUUID(),
    createdAt: nowIso,
    updatedAt: nowIso,
    doUserUuid: identity.uuid,
    doTeamUuid: identity.teamUuid,
    email: identity.email,
  };

  db.users.push(user);
  return clone(user);
}

function ensureDeployment(db: LaunchpadDatabase, deploymentId: string): Deployment {
  const deployment = db.deployments.find((item) => item.id === deploymentId);
  if (!deployment) {
    throw new Error(`Deployment ${deploymentId} not found`);
  }
  return deployment;
}

export class MemoryLaunchpadStore implements LaunchpadStore {
  private readonly db = createEmptyDatabase();

  async upsertUser(identity: DigitalOceanIdentity, nowIso: string): Promise<User> {
    return upsertUserInDatabase(this.db, identity, nowIso);
  }

  async findUserById(userId: string): Promise<User | undefined> {
    return clone(this.db.users.find((user) => user.id === userId));
  }

  async createDeployment(deployment: Deployment): Promise<Deployment> {
    this.db.deployments.push(clone(deployment));
    return clone(deployment);
  }

  async updateDeployment(
    deploymentId: string,
    updater: (current: Deployment) => Deployment,
  ): Promise<Deployment> {
    const current = ensureDeployment(this.db, deploymentId);
    const next = updater(clone(current));
    Object.assign(current, next);
    return clone(current);
  }

  async findDeploymentById(deploymentId: string): Promise<Deployment | undefined> {
    return clone(this.db.deployments.find((deployment) => deployment.id === deploymentId));
  }

  async findDeploymentByIdempotencyKey(
    userId: string,
    idempotencyKey: string,
  ): Promise<Deployment | undefined> {
    return clone(
      this.db.deployments.find(
        (deployment) => deployment.userId === userId && deployment.idempotencyKey === idempotencyKey,
      ),
    );
  }

  async listDeploymentsByUser(userId: string): Promise<Deployment[]> {
    return clone(this.db.deployments.filter((deployment) => deployment.userId === userId));
  }

  async listDeploymentsNeedingTracking(): Promise<Deployment[]> {
    return clone(this.db.deployments.filter((deployment) => !terminal(deployment.status)));
  }

  async saveDeploymentCallback(record: DeploymentCallbackRecord): Promise<DeploymentCallbackRecord> {
    const existing = this.db.callbacks.find((item) => item.deploymentId === record.deploymentId);
    if (existing) {
      Object.assign(existing, clone(record));
      return clone(existing);
    }

    this.db.callbacks.push(clone(record));
    return clone(record);
  }

  async findDeploymentCallback(deploymentId: string): Promise<DeploymentCallbackRecord | undefined> {
    return clone(this.db.callbacks.find((callback) => callback.deploymentId === deploymentId));
  }

  async saveDeploymentCredential(record: DeploymentCredential): Promise<DeploymentCredential> {
    const existing = this.db.credentials.find((item) => item.deploymentId === record.deploymentId);
    if (existing) {
      Object.assign(existing, clone(record));
      return clone(existing);
    }

    this.db.credentials.push(clone(record));
    return clone(record);
  }

  async findDeploymentCredential(deploymentId: string): Promise<DeploymentCredential | undefined> {
    return clone(this.db.credentials.find((credential) => credential.deploymentId === deploymentId));
  }

  async deleteDeploymentCredential(deploymentId: string): Promise<void> {
    const index = this.db.credentials.findIndex((credential) => credential.deploymentId === deploymentId);
    if (index >= 0) {
      this.db.credentials.splice(index, 1);
    }
  }

  async appendEvent(event: DeploymentEvent): Promise<DeploymentEvent> {
    this.db.events.push(clone(event));
    return clone(event);
  }

  async listDeploymentEvents(deploymentId: string): Promise<DeploymentEvent[]> {
    return clone(
      this.db.events
        .filter((event) => event.deploymentId === deploymentId)
        .sort((left, right) => left.ts.localeCompare(right.ts)),
    );
  }
}

export class JsonLaunchpadStore implements LaunchpadStore {
  private writeQueue = Promise.resolve();

  constructor(private readonly filePath: string) {}

  private async readDatabase(): Promise<LaunchpadDatabase> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as LaunchpadDatabase;
      return {
        users: parsed.users ?? [],
        deployments: parsed.deployments ?? [],
        callbacks: parsed.callbacks ?? [],
        credentials: parsed.credentials ?? [],
        events: parsed.events ?? [],
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return createEmptyDatabase();
      }

      throw error;
    }
  }

  private async writeDatabase(db: LaunchpadDatabase): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(db, null, 2), "utf8");
  }

  private async mutate<T>(mutator: (db: LaunchpadDatabase) => Promise<T> | T): Promise<T> {
    const task = this.writeQueue.then(async () => {
      const db = await this.readDatabase();
      const result = await mutator(db);
      await this.writeDatabase(db);
      return clone(result);
    });
    this.writeQueue = task.then(() => undefined, () => undefined);
    return task;
  }

  private async inspect<T>(reader: (db: LaunchpadDatabase) => Promise<T> | T): Promise<T> {
    const db = await this.readDatabase();
    return clone(await reader(db));
  }

  async upsertUser(identity: DigitalOceanIdentity, nowIso: string): Promise<User> {
    return this.mutate((db) => upsertUserInDatabase(db, identity, nowIso));
  }

  async findUserById(userId: string): Promise<User | undefined> {
    return this.inspect((db) => db.users.find((user) => user.id === userId));
  }

  async createDeployment(deployment: Deployment): Promise<Deployment> {
    return this.mutate((db) => {
      db.deployments.push(clone(deployment));
      return deployment;
    });
  }

  async updateDeployment(
    deploymentId: string,
    updater: (current: Deployment) => Deployment,
  ): Promise<Deployment> {
    return this.mutate((db) => {
      const current = ensureDeployment(db, deploymentId);
      const next = updater(clone(current));
      Object.assign(current, next);
      return current;
    });
  }

  async findDeploymentById(deploymentId: string): Promise<Deployment | undefined> {
    return this.inspect((db) => db.deployments.find((deployment) => deployment.id === deploymentId));
  }

  async findDeploymentByIdempotencyKey(
    userId: string,
    idempotencyKey: string,
  ): Promise<Deployment | undefined> {
    return this.inspect((db) =>
      db.deployments.find(
        (deployment) => deployment.userId === userId && deployment.idempotencyKey === idempotencyKey,
      ),
    );
  }

  async listDeploymentsByUser(userId: string): Promise<Deployment[]> {
    return this.inspect((db) => db.deployments.filter((deployment) => deployment.userId === userId));
  }

  async listDeploymentsNeedingTracking(): Promise<Deployment[]> {
    return this.inspect((db) => db.deployments.filter((deployment) => !terminal(deployment.status)));
  }

  async saveDeploymentCallback(record: DeploymentCallbackRecord): Promise<DeploymentCallbackRecord> {
    return this.mutate((db) => {
      const existing = db.callbacks.find((callback) => callback.deploymentId === record.deploymentId);
      if (existing) {
        Object.assign(existing, clone(record));
        return existing;
      }

      db.callbacks.push(clone(record));
      return record;
    });
  }

  async findDeploymentCallback(deploymentId: string): Promise<DeploymentCallbackRecord | undefined> {
    return this.inspect((db) => db.callbacks.find((callback) => callback.deploymentId === deploymentId));
  }

  async saveDeploymentCredential(record: DeploymentCredential): Promise<DeploymentCredential> {
    return this.mutate((db) => {
      const existing = db.credentials.find((credential) => credential.deploymentId === record.deploymentId);
      if (existing) {
        Object.assign(existing, clone(record));
        return existing;
      }

      db.credentials.push(clone(record));
      return record;
    });
  }

  async findDeploymentCredential(deploymentId: string): Promise<DeploymentCredential | undefined> {
    return this.inspect((db) => db.credentials.find((credential) => credential.deploymentId === deploymentId));
  }

  async deleteDeploymentCredential(deploymentId: string): Promise<void> {
    return this.mutate((db) => {
      const index = db.credentials.findIndex((credential) => credential.deploymentId === deploymentId);
      if (index >= 0) {
        db.credentials.splice(index, 1);
      }
    });
  }

  async appendEvent(event: DeploymentEvent): Promise<DeploymentEvent> {
    return this.mutate((db) => {
      db.events.push(clone(event));
      return event;
    });
  }

  async listDeploymentEvents(deploymentId: string): Promise<DeploymentEvent[]> {
    return this.inspect((db) =>
      db.events
        .filter((event) => event.deploymentId === deploymentId)
        .sort((left, right) => left.ts.localeCompare(right.ts)),
    );
  }
}

export function isDeploymentStatus(value: string): value is (typeof deploymentStatuses)[number] {
  return deploymentStatuses.includes(value as (typeof deploymentStatuses)[number]);
}

