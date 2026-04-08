import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createTestClock, createTestStore, FakeDigitalOceanClient, FakeDigitalOceanOAuthClient } from "@launchpad/testing";
import { MemorySessionStore } from "../src/session-store.js";

describe("api integration", () => {
  let digitalOcean: FakeDigitalOceanClient;
  let oauthClient: FakeDigitalOceanOAuthClient;
  let sessionStore: MemorySessionStore;
  let store: ReturnType<typeof createTestStore>;
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeEach(async () => {
    digitalOcean = new FakeDigitalOceanClient();
    oauthClient = new FakeDigitalOceanOAuthClient();
    sessionStore = new MemorySessionStore();
    store = createTestStore();
    oauthClient.exchangedCodes.set("oauth-code", {
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: "2026-05-01T00:00:00.000Z",
      scope: ["droplet:create", "droplet:read"],
      identity: {
        uuid: "do-user-1",
        teamUuid: "do-team-1",
        email: "user@example.com",
      },
    });

    app = await createApp({
      config: {
        nodeEnv: "test",
        host: "127.0.0.1",
        port: 3001,
        cookieSecret: "test-cookie-secret-test-cookie-secret",
        cookieSecure: false,
        digitalOceanClientId: "test-client-id",
        digitalOceanClientSecret: "test-client-secret",
        digitalOceanRedirectUri: "http://localhost:3001/api/v1/auth/digitalocean/callback",
        publicApiUrl: "http://localhost:3001",
        webUrl: "http://localhost:3000",
        storePath: "/tmp/not-used.json",
        oauthScopes: ["droplet:create", "droplet:read", "regions:read", "sizes:read", "actions:read", "image:read"],
      },
      clock: createTestClock(),
      digitalOcean,
      oauthClient,
      sessionStore,
      store,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it("runs the OAuth -> deploy -> callback flow", async () => {
    const authStart = await app.inject({
      method: "GET",
      url: "/api/v1/auth/digitalocean/start",
    });

    expect(authStart.statusCode).toBe(302);
    const authUrl = new URL(authStart.headers.location!);
    const state = authUrl.searchParams.get("state");
    const stateCookie = authStart.cookies.find((cookie) => cookie.name === "lp_oauth_state");

    expect(state).toBeTruthy();
    expect(stateCookie?.value).toBeTruthy();

    const authCallback = await app.inject({
      method: "GET",
      url: `/api/v1/auth/digitalocean/callback?code=oauth-code&state=${state}`,
      cookies: {
        lp_oauth_state: stateCookie!.value,
      },
    });

    expect(authCallback.statusCode).toBe(302);
    expect(authCallback.headers.location).toBe("http://localhost:3000/?auth=success");

    const sessionCookie = authCallback.cookies.find((cookie) => cookie.name === "lp_session");
    expect(sessionCookie?.value).toBeTruthy();

    const session = await app.inject({
      method: "GET",
      url: "/api/v1/session",
      cookies: {
        lp_session: sessionCookie!.value,
      },
    });

    expect(session.statusCode).toBe(200);
    expect(session.json()).toMatchObject({
      authenticated: true,
      user: {
        email: "user@example.com",
      },
    });

    const createDeployment = await app.inject({
      method: "POST",
      url: "/api/v1/deployments",
      cookies: {
        lp_session: sessionCookie!.value,
      },
      payload: {
        telegramBotToken: "telegram-token",
        openRouterApiKey: "sk-or-123",
      },
    });

    expect(createDeployment.statusCode).toBe(202);
    const deployment = createDeployment.json() as { id: string; status: string };
    expect(deployment.status).toBe("droplet_creating");
    expect(digitalOcean.createDropletCalls).toHaveLength(1);

    const cloudInit = digitalOcean.createDropletCalls[0]?.command.userData ?? "";
    const tokenMatch = cloudInit.match(/token\\":\\"([^"]+)\\"/u);
    const callbackToken = tokenMatch?.[1];
    expect(callbackToken).toBeTruthy();

    const callback = await app.inject({
      method: "POST",
      url: "/api/v1/deployments/callback",
      payload: {
        deploymentId: deployment.id,
        token: callbackToken,
        stage: "openclaw_started",
      },
    });

    expect(callback.statusCode).toBe(200);
    expect(callback.json()).toMatchObject({
      id: deployment.id,
      status: "running",
      uiIncludedInV1: false,
    });
    expect(oauthClient.revokedTokens).toEqual(["access-token"]);
  });
});

