import { describe, expect, it } from "vitest";
import { DeploymentService, hashToken } from "../src/index.js";
import { createTestClock, createTestStore, FakeDigitalOceanClient } from "@launchpad/testing";

describe("DeploymentService", () => {
  it("creates a deployment and reuses it for the same idempotency key", async () => {
    const store = createTestStore();
    const digitalOcean = new FakeDigitalOceanClient();
    const service = new DeploymentService({
      callbackBaseUrl: "https://launchpad.example.com",
      clock: createTestClock(),
      digitalOcean,
      store,
    });

    const first = await service.createDeployment({
      userId: "user-1",
      idempotencyKey: "idem-1",
      telegramBotToken: "telegram-token",
      openRouterApiKey: "sk-or-1",
      accessToken: "do-access-token",
      accessTokenExpiresAt: "2026-05-01T00:00:00.000Z",
    });

    const second = await service.createDeployment({
      userId: "user-1",
      idempotencyKey: "idem-1",
      telegramBotToken: "telegram-token",
      openRouterApiKey: "sk-or-1",
      accessToken: "do-access-token",
      accessTokenExpiresAt: "2026-05-01T00:00:00.000Z",
    });

    expect(first.deployment.id).toBe(second.deployment.id);
    expect(first.deployment.status).toBe("droplet_creating");
    expect(digitalOcean.createDropletCalls).toHaveLength(1);

    const callback = await store.findDeploymentCallback(first.deployment.id);
    expect(callback).toBeDefined();
    expect(callback?.bootstrapTokenHash).not.toBe("telegram-token");
    expect(callback?.bootstrapTokenHash).toMatch(/^[a-f0-9]{64}$/u);

    const credential = await store.findDeploymentCredential(first.deployment.id);
    expect(credential?.accessToken).toBe("do-access-token");
  });

  it("marks deployments as running after a valid bootstrap callback and revokes the OAuth token", async () => {
    const store = createTestStore();
    const digitalOcean = new FakeDigitalOceanClient();
    const revoked: string[] = [];
    const service = new DeploymentService({
      callbackBaseUrl: "https://launchpad.example.com",
      clock: createTestClock(),
      digitalOcean,
      oauthClient: {
        createAuthorizeUrl() {
          return "https://cloud.digitalocean.com";
        },
        async exchangeCode() {
          throw new Error("not used");
        },
        async revokeToken(token: string) {
          revoked.push(token);
        },
      },
      store,
    });

    const created = await service.createDeployment({
      userId: "user-1",
      idempotencyKey: "idem-2",
      telegramBotToken: "telegram-token",
      openRouterApiKey: "sk-or-2",
      accessToken: "do-access-token",
      accessTokenExpiresAt: "2026-05-01T00:00:00.000Z",
    });

    const cloudInit = digitalOcean.createDropletCalls[0]?.command.userData ?? "";
    const tokenMatch = cloudInit.match(/token\\":\\"([^"]+)\\"/u);
    const callbackToken = tokenMatch?.[1];

    expect(callbackToken).toBeDefined();
    const callback = await store.findDeploymentCallback(created.deployment.id);
    expect(callback?.bootstrapTokenHash).toBe(hashToken(callbackToken!));

    const deployment = await service.handleCallback({
      deploymentId: created.deployment.id,
      token: callbackToken!,
      stage: "openclaw_started",
    });

    expect(deployment.status).toBe("running");
    expect(revoked).toEqual(["do-access-token"]);
    expect(await store.findDeploymentCredential(created.deployment.id)).toBeUndefined();
  });
});

