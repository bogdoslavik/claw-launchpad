import { DeploymentTracker } from "@launchpad/core";
import type { Clock, DigitalOceanClient, LaunchpadStore } from "@launchpad/core";

export interface WorkerDependencies {
  clock: Clock;
  digitalOcean: DigitalOceanClient;
  store: LaunchpadStore;
}

export class LaunchpadWorker {
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly dependencies: WorkerDependencies,
    private readonly pollIntervalMs: number,
  ) {}

  async runOnce() {
    const tracker = new DeploymentTracker(this.dependencies);
    return tracker.trackPendingDeployments();
  }

  start() {
    this.timer = setInterval(() => {
      void this.runOnce();
    }, this.pollIntervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
