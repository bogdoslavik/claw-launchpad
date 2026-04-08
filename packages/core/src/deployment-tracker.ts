import { launchpadDefaults } from "./defaults.js";
import { NotFoundError } from "./errors.js";
import type {
  Clock,
  Deployment,
  DigitalOceanClient,
  LaunchpadStore,
  TrackDeploymentResult,
} from "./types.js";

function selectPublicIpv4(networks: Array<{ ipAddress: string; type: "public" | "private" }>): string | undefined {
  return networks.find((network) => network.type === "public")?.ipAddress;
}

interface DeploymentTrackerOptions {
  clock: Clock;
  digitalOcean: DigitalOceanClient;
  store: LaunchpadStore;
}

export class DeploymentTracker {
  constructor(private readonly options: DeploymentTrackerOptions) {}

  async trackDeployment(deploymentId: string): Promise<TrackDeploymentResult> {
    const deployment = await this.options.store.findDeploymentById(deploymentId);
    if (!deployment) {
      throw new NotFoundError("Deployment not found");
    }

    if (
      deployment.status === "running" ||
      deployment.status === "failed" ||
      deployment.status === "canceled" ||
      !deployment.dropletId ||
      !deployment.actionId
    ) {
      return { deployment };
    }

    const credential = await this.options.store.findDeploymentCredential(deploymentId);
    if (!credential) {
      return { deployment };
    }

    const nowIso = this.options.clock.now().toISOString();
    const action = await this.options.digitalOcean.getAction(credential.accessToken, deployment.actionId);

    if (action.status === "completed") {
      const droplet = await this.options.digitalOcean.getDroplet(credential.accessToken, deployment.dropletId);
      const publicIpv4 = selectPublicIpv4(droplet.networksV4);

      const updated = await this.options.store.updateDeployment(deploymentId, (current) => ({
        ...current,
        status:
          current.status === "requested" || current.status === "droplet_creating"
            ? "droplet_active"
            : current.status,
        publicIpv4: publicIpv4 ?? current.publicIpv4,
        updatedAt: nowIso,
      }));

      if (deployment.status !== "droplet_active") {
        await this.options.store.appendEvent({
          id: crypto.randomUUID(),
          deploymentId,
          ts: nowIso,
          type: "droplet_action_completed",
          payload: {
            actionId: action.id,
            publicIpv4: publicIpv4 ?? null,
          },
        });
      }

      return { deployment: updated, actionStatus: action.status };
    }

    if (action.status === "errored") {
      const updated = await this.options.store.updateDeployment(deploymentId, (current) => ({
        ...current,
        status: "failed",
        updatedAt: nowIso,
        finishedAt: nowIso,
        lastErrorCode: "droplet_action_errored",
        lastErrorMessage: "DigitalOcean reported an errored action",
      }));
      await this.options.store.appendEvent({
        id: crypto.randomUUID(),
        deploymentId,
        ts: nowIso,
        type: "failed",
        payload: {
          code: "droplet_action_errored",
        },
      });
      await this.options.store.deleteDeploymentCredential(deploymentId);
      return { deployment: updated, actionStatus: action.status };
    }

    const updated = await this.options.store.updateDeployment(deploymentId, (current) => ({
      ...current,
      status: current.status === "requested" ? "droplet_creating" : current.status,
      updatedAt: nowIso,
    }));

    return { deployment: updated, actionStatus: action.status };
  }

  async trackPendingDeployments(): Promise<TrackDeploymentResult[]> {
    const deployments = await this.options.store.listDeploymentsNeedingTracking();
    const results: TrackDeploymentResult[] = [];

    for (const deployment of deployments) {
      if (
        deployment.status === "requested" ||
        deployment.status === "droplet_creating" ||
        deployment.status === "droplet_active" ||
        deployment.status === "bootstrapping"
      ) {
        results.push(await this.trackDeployment(deployment.id));
      }
    }

    return results;
  }
}

