import { describe, expect, it } from "vitest";

import { buildCloudInit } from "../src/cloud-init.js";

describe("buildCloudInit", () => {
  it("renders a loopback-only OpenClaw bootstrap for the approved V1 scope", () => {
    const cloudInit = buildCloudInit({
      callbackUrl: "https://launchpad.example.com/api/v1/deployments/callback",
      deploymentId: "8ac1d3cb-ec53-4699-b1ca-09a6a6c76477",
      bootstrapToken: "bootstrap-token",
      gatewayToken: "gateway-token",
      telegramBotToken: "123456:ABCDEF",
      openRouterApiKey: "sk-or-123",
      openclawImage: "ghcr.io/openclaw/openclaw:2026.4.8",
      openclawModel: "openrouter/auto",
    });

    expect(cloudInit).toContain("#cloud-config");
    expect(cloudInit).toContain("\"primary\": \"openrouter/auto\"");
    expect(cloudInit).toContain("\"botToken\": \"123456:ABCDEF\"");
    expect(cloudInit).toContain("\"OPENROUTER_API_KEY\": \"sk-or-123\"");
    expect(cloudInit).toContain("\"127.0.0.1:18789:18789\"");
    expect(cloudInit).toContain("\"--bind\",");
    expect(cloudInit).toContain("\"loopback\",");
    expect(cloudInit).toContain("fallocate -l 4G /swapfile");
    expect(cloudInit).toContain("swapon /swapfile");
    expect(cloudInit).toContain("cloud_init_started");
    expect(cloudInit).toContain("openclaw_started");
    expect(cloudInit).not.toContain("0.0.0.0:18789");
  });
});
