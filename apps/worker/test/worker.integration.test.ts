import { describe, expect, it } from "vitest";

import { LaunchpadWorker } from "../src/worker.js";
import { createTestClock, createTestStore, FakeDigitalOceanClient } from "@launchpad/testing";

describe("worker integration", () => {
  it("tracks pending deployments and enriches them with public IPs", async () => {
    const store = createTestStore();
    const digitalOcean = new FakeDigitalOceanClient();
    const worker = new LaunchpadWorker(
      {
        clock: createTestClock("2026-04-08T09:00:00.000Z"),
        digitalOcean,
        store,
      },
      5_000,
    );

    await store.createDeployment({
      id: "84e21ad4-8865-4ebd-a2bb-3c86b627c635",
      userId: "user-1",
      status: "droplet_creating",
      idempotencyKey: "worker-idem",
      dropletId: 1001,
      dropletName: "openclaw-worker",
      actionId: 5001,
      region: "nyc1",
      sizeSlug: "s-1vcpu-1gb",
      imageSlug: "ubuntu-24-04-x64",
      openclawImage: "ghcr.io/openclaw/openclaw:2026.4.8",
      openclawModel: "openrouter/auto",
      createdAt: "2026-04-08T08:30:00.000Z",
      updatedAt: "2026-04-08T08:30:00.000Z",
    });
    await store.saveDeploymentCredential({
      deploymentId: "84e21ad4-8865-4ebd-a2bb-3c86b627c635",
      accessToken: "access-token",
      expiresAt: "2026-05-01T00:00:00.000Z",
      createdAt: "2026-04-08T08:30:00.000Z",
      updatedAt: "2026-04-08T08:30:00.000Z",
    });

    digitalOcean.actions.set(5001, { id: 5001, status: "completed" });

    const results = await worker.runOnce();

    expect(results).toHaveLength(1);
    expect(results[0]?.deployment.publicIpv4).toBe("203.0.113.10");
    expect(results[0]?.deployment.status).toBe("droplet_active");
  });
});
