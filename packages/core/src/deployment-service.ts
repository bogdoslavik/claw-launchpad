import { createOpaqueToken, hashToken } from "./crypto.js";
import { launchpadDefaults } from "./defaults.js";
import { NotFoundError, UnauthorizedError, ValidationError } from "./errors.js";
import { buildCloudInit } from "./cloud-init.js";
import type {
  Clock,
  CreateDeploymentRequest,
  CreateDeploymentResult,
  Deployment,
  DeploymentCallbackInput,
  DeploymentCallbackStage,
  DeploymentEventType,
  DigitalOceanClient,
  DigitalOceanOAuthClient,
  LaunchpadStore,
} from "./types.js";

function buildEvent(
  deploymentId: string,
  ts: string,
  type: DeploymentEventType,
  payload?: Record<string, unknown>,
) {
  return {
    id: crypto.randomUUID(),
    deploymentId,
    ts,
    type,
    payload,
  };
}

function mapStageToStatus(stage: DeploymentCallbackStage): Deployment["status"] {
  switch (stage) {
    case "cloud_init_started":
    case "docker_installed":
      return "bootstrapping";
    case "openclaw_started":
      return "running";
    case "failed":
      return "failed";
  }
}

interface DeploymentServiceOptions {
  callbackBaseUrl: string;
  clock: Clock;
  digitalOcean: DigitalOceanClient;
  store: LaunchpadStore;
  oauthClient?: DigitalOceanOAuthClient;
  debugSshUser?: string;
  debugSshPublicKey?: string;
}

export class DeploymentService {
  constructor(private readonly options: DeploymentServiceOptions) {}

  async createDeployment(request: CreateDeploymentRequest): Promise<CreateDeploymentResult> {
    const existing = await this.options.store.findDeploymentByIdempotencyKey(
      request.userId,
      request.idempotencyKey,
    );

    if (existing) {
      return { deployment: existing };
    }

    if (!request.telegramBotToken.trim()) {
      throw new ValidationError("telegramBotToken is required");
    }

    if (!request.openRouterApiKey.trim()) {
      throw new ValidationError("openRouterApiKey is required");
    }

    const nowIso = this.options.clock.now().toISOString();
    const deploymentId = crypto.randomUUID();
    const dropletName = `openclaw-${deploymentId.slice(0, 12)}`;
    const bootstrapToken = createOpaqueToken();
    const gatewayToken = createOpaqueToken();

    const cloudInit = buildCloudInit({
      callbackUrl: `${this.options.callbackBaseUrl}/api/v1/deployments/callback`,
      deploymentId,
      bootstrapToken,
      gatewayToken,
      debugSshUser: this.options.debugSshUser,
      debugSshPublicKey: this.options.debugSshPublicKey,
      openclawImage: launchpadDefaults.openclawImage,
      openclawModel: launchpadDefaults.openclawModel,
      openRouterApiKey: request.openRouterApiKey,
      telegramBotToken: request.telegramBotToken,
      telegramUserId: request.telegramUserId,
    });

    const deployment: Deployment = {
      id: deploymentId,
      userId: request.userId,
      status: "requested",
      idempotencyKey: request.idempotencyKey,
      dropletName,
      region: request.region ?? launchpadDefaults.dropletRegion,
      sizeSlug: request.sizeSlug ?? launchpadDefaults.dropletSize,
      imageSlug: request.imageSlug ?? launchpadDefaults.dropletImage,
      openclawImage: launchpadDefaults.openclawImage,
      openclawModel: launchpadDefaults.openclawModel,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await this.options.store.createDeployment(deployment);
    await this.options.store.saveDeploymentCallback({
      deploymentId,
      bootstrapTokenHash: hashToken(bootstrapToken),
      expiresAt: new Date(
        this.options.clock.now().getTime() + launchpadDefaults.callbackTokenTtlHours * 60 * 60 * 1000,
      ).toISOString(),
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    await this.options.store.saveDeploymentCredential({
      deploymentId,
      accessToken: request.accessToken,
      refreshToken: request.refreshToken,
      expiresAt: request.accessTokenExpiresAt,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    await this.options.store.appendEvent(
      buildEvent(deploymentId, nowIso, "droplet_create_requested", {
        dropletName,
        region: deployment.region,
        sizeSlug: deployment.sizeSlug,
        imageSlug: deployment.imageSlug,
      }),
    );

    try {
      const droplet = await this.options.digitalOcean.createDroplet(request.accessToken, {
        name: dropletName,
        region: deployment.region,
        size: deployment.sizeSlug,
        image: deployment.imageSlug,
        userData: cloudInit,
      });

      const updated = await this.options.store.updateDeployment(deploymentId, (current) => ({
        ...current,
        status: "droplet_creating",
        dropletId: droplet.dropletId,
        actionId: droplet.actionId,
        startedAt: nowIso,
        updatedAt: nowIso,
      }));

      return { deployment: updated };
    } catch (error) {
      const failedAt = this.options.clock.now().toISOString();
      const failed = await this.options.store.updateDeployment(deploymentId, (current) => ({
        ...current,
        status: "failed",
        updatedAt: failedAt,
        finishedAt: failedAt,
        lastErrorCode: "droplet_create_failed",
        lastErrorMessage: error instanceof Error ? error.message : "Unknown error",
      }));
      await this.options.store.appendEvent(
        buildEvent(deploymentId, failedAt, "failed", {
          code: "droplet_create_failed",
          message: failed.lastErrorMessage,
        }),
      );
      throw error;
    }
  }

  async handleCallback(input: DeploymentCallbackInput): Promise<Deployment> {
    const deployment = await this.options.store.findDeploymentById(input.deploymentId);
    if (!deployment) {
      throw new NotFoundError("Deployment not found");
    }

    const callback = await this.options.store.findDeploymentCallback(input.deploymentId);
    if (!callback) {
      throw new NotFoundError("Deployment callback registration not found");
    }

    if (callback.expiresAt < this.options.clock.now().toISOString()) {
      throw new UnauthorizedError("Bootstrap token expired");
    }

    if (callback.bootstrapTokenHash !== hashToken(input.token)) {
      throw new UnauthorizedError("Invalid bootstrap token");
    }

    const nowIso = this.options.clock.now().toISOString();
    const nextStatus = mapStageToStatus(input.stage);

    const updated = await this.options.store.updateDeployment(input.deploymentId, (current) => {
      const result: Deployment = {
        ...current,
        status: nextStatus,
        updatedAt: nowIso,
      };
      if (nextStatus === "running" || nextStatus === "failed" || nextStatus === "canceled") {
        result.finishedAt = nowIso;
      }
      if (nextStatus === "failed") {
        result.lastErrorCode = "bootstrap_failed";
        result.lastErrorMessage = typeof input.details?.reason === "string" ? input.details.reason : "Bootstrap failed";
      }
      return result;
    });

    await this.options.store.appendEvent(buildEvent(input.deploymentId, nowIso, input.stage, input.details));

    if ((nextStatus === "running" || nextStatus === "failed") && this.options.oauthClient) {
      const credential = await this.options.store.findDeploymentCredential(input.deploymentId);
      if (credential) {
        try {
          await this.options.oauthClient.revokeToken(credential.accessToken);
        } finally {
          await this.options.store.deleteDeploymentCredential(input.deploymentId);
        }
      }
    }

    return updated;
  }

  async cancelDeployment(deploymentId: string, userId: string): Promise<Deployment> {
    const deployment = await this.options.store.findDeploymentById(deploymentId);
    if (!deployment || deployment.userId !== userId) {
      throw new NotFoundError("Deployment not found");
    }

    const nowIso = this.options.clock.now().toISOString();
    const updated = await this.options.store.updateDeployment(deploymentId, (current) => ({
      ...current,
      status: "canceled",
      updatedAt: nowIso,
      finishedAt: nowIso,
    }));

    await this.options.store.appendEvent(buildEvent(deploymentId, nowIso, "canceled"));
    await this.options.store.deleteDeploymentCredential(deploymentId);
    return updated;
  }
}
