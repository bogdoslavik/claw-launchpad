import { describe, expect, it } from "vitest";

import { DeploymentTracker } from "../src/deployment-tracker.js";
import { createTestClock, createTestStore, FakeDigitalOceanClient } from "@launchpad/testing";

describe("DeploymentTracker", () => {
  it("promotes droplets to droplet_active once the DO action completes", async () => {
    const store = createTestStore();
    const digitalOcean = new FakeDigitalOceanClient();
    const tracker = new DeploymentTracker({
      clock: createTestClock("2026-04-08T12:00:00.000Z"),
      digitalOcean,
      store,
    });

    await store.createDeployment({
      id: "42ceee2a-5777-49e4-bf52-d2b4e824bd65",
      userId: "user-1",
      status: "droplet_creating",
      idempotencyKey: "idem-tracker",
      dropletId: 1001,
      dropletName: "openclaw-tracker",
      actionId: 5001,
      region: "nyc1",
      sizeSlug: "s-1vcpu-1gb",
      imageSlug: "ubuntu-24-04-x64",
      openclawImage: "ghcr.io/openclaw/openclaw:2026.4.8",
      openclawModel: "openrouter/auto",
      createdAt: "2026-04-08T11:00:00.000Z",
      updatedAt: "2026-04-08T11:00:00.000Z",
    });
    await store.saveDeploymentCredential({
      deploymentId: "42ceee2a-5777-49e4-bf52-d2b4e824bd65",
      accessToken: "do-token",
      expiresAt: "2026-05-01T00:00:00.000Z",
      createdAt: "2026-04-08T11:00:00.000Z",
      updatedAt: "2026-04-08T11:00:00.000Z",
    });

    digitalOcean.actions.set(5001, { id: 5001, status: "completed" });

    const result = await tracker.trackDeployment("42ceee2a-5777-49e4-bf52-d2b4e824bd65");

    expect(result.actionStatus).toBe("completed");
    expect(result.deployment.status).toBe("droplet_active");
    expect(result.deployment.publicIpv4).toBe("203.0.113.10");

    const events = await store.listDeploymentEvents("42ceee2a-5777-49e4-bf52-d2b4e824bd65");
    expect(events.at(-1)?.type).toBe("droplet_action_completed");
  });
});

