import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import Fastify from "fastify";
import { z } from "zod";
import {
  ConflictError,
  DeploymentService,
  JsonLaunchpadStore,
  LaunchpadError,
  NotFoundError,
  SystemClock,
  UnauthorizedError,
} from "@launchpad/core";
import type {
  Clock,
  Deployment,
  DigitalOceanClient,
  DigitalOceanOAuthClient,
  LaunchpadStore,
} from "@launchpad/core";

import type { ApiConfig } from "./config.js";
import { MemorySessionStore, type ApiSession, type SessionStore } from "./session-store.js";

const SESSION_COOKIE = "lp_session";
const OAUTH_STATE_COOKIE = "lp_oauth_state";

const deploymentBodySchema = z.object({
  telegramBotToken: z.string().min(1),
  openRouterApiKey: z.string().min(1),
  region: z.string().min(1).optional(),
  sizeSlug: z.string().min(1).optional(),
  imageSlug: z.string().min(1).optional(),
  idempotencyKey: z.string().min(1).optional(),
});

const callbackBodySchema = z.object({
  deploymentId: z.string().uuid(),
  token: z.string().min(1),
  stage: z.enum(["cloud_init_started", "docker_installed", "openclaw_started", "failed"]),
  details: z.record(z.string(), z.unknown()).optional(),
});

const callbackQuerySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

export interface ApiDependencies {
  config: ApiConfig;
  clock: Clock;
  digitalOcean: DigitalOceanClient;
  oauthClient: DigitalOceanOAuthClient;
  sessionStore: SessionStore;
  store: LaunchpadStore;
}

function buildSession(clock: Clock, userId: string, tokenSet: ApiSession): ApiSession {
  const nowIso = clock.now().toISOString();
  return {
    id: crypto.randomUUID(),
    userId,
    accessToken: tokenSet.accessToken,
    refreshToken: tokenSet.refreshToken,
    accessTokenExpiresAt: tokenSet.accessTokenExpiresAt,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

function sessionCookieOptions(config: ApiConfig) {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: config.cookieSecure,
    signed: true,
  };
}

function readSignedCookie(
  request: {
    cookies: Record<string, string | undefined>;
    unsignCookie: (value: string) => { valid: boolean; value: string | null };
  },
  name: string,
) {
  const raw = request.cookies[name];
  if (!raw) {
    return undefined;
  }

  const unsigned = request.unsignCookie(raw);
  if (!unsigned.valid) {
    return undefined;
  }

  return unsigned.value ?? undefined;
}

async function loadSession(request: any, sessionStore: SessionStore) {
  const sessionId = readSignedCookie(request, SESSION_COOKIE);
  if (!sessionId) {
    return undefined;
  }
  return sessionStore.get(sessionId);
}

function buildDeploymentView(deployment: Deployment, events: Awaited<ReturnType<LaunchpadStore["listDeploymentEvents"]>>) {
  return {
    ...deployment,
    uiIncludedInV1: false,
    sshTunnelCommand: deployment.publicIpv4
      ? `ssh -L 18789:127.0.0.1:18789 root@${deployment.publicIpv4}`
      : null,
    events,
  };
}

export async function createApp(dependencies: ApiDependencies) {
  const app = Fastify({
    logger: false,
  });

  await app.register(cookie, {
    secret: dependencies.config.cookieSecret,
  });

  await app.register(cors, {
    origin: dependencies.config.webUrl,
    credentials: true,
  });

  const deploymentService = new DeploymentService({
    callbackBaseUrl: dependencies.config.publicApiUrl,
    clock: dependencies.clock,
    digitalOcean: dependencies.digitalOcean,
    oauthClient: dependencies.oauthClient,
    store: dependencies.store,
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof LaunchpadError) {
      return reply.status(error.statusCode).send({
        error: error.code,
        message: error.message,
      });
    }

    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        error: "validation_error",
        message: error.issues.map((issue) => issue.message).join("; "),
      });
    }

    request.log.error(error);
    return reply.status(500).send({
      error: "internal_error",
      message: "Unexpected server error",
    });
  });

  app.get("/healthz", async () => ({ status: "ok" }));
  app.get("/readyz", async () => ({ status: "ok" }));

  app.get("/api/v1/session", async (request) => {
    const session = await loadSession(request, dependencies.sessionStore);
    if (!session) {
      return { authenticated: false };
    }

    const user = await dependencies.store.findUserById(session.userId);
    if (!user) {
      return { authenticated: false };
    }

    return {
      authenticated: true,
      user,
    };
  });

  app.get("/api/v1/auth/digitalocean/start", async (_request, reply) => {
    const state = crypto.randomUUID();
    reply.setCookie(OAUTH_STATE_COOKIE, state, sessionCookieOptions(dependencies.config));
    const url = dependencies.oauthClient.createAuthorizeUrl({
      state,
      redirectUri: dependencies.config.digitalOceanRedirectUri,
      scopes: dependencies.config.oauthScopes,
    });
    return reply.redirect(url);
  });

  app.get("/api/v1/auth/digitalocean/callback", async (request, reply) => {
    const query = callbackQuerySchema.parse(request.query);
    const expectedState = readSignedCookie(request, OAUTH_STATE_COOKIE);

    if (!expectedState || expectedState !== query.state) {
      throw new ConflictError("OAuth state mismatch");
    }

    const tokenSet = await dependencies.oauthClient.exchangeCode({
      code: query.code,
      redirectUri: dependencies.config.digitalOceanRedirectUri,
    });

    const user = await dependencies.store.upsertUser(tokenSet.identity, dependencies.clock.now().toISOString());
    const session = await dependencies.sessionStore.create(
      buildSession(dependencies.clock, user.id, {
        accessToken: tokenSet.accessToken,
        refreshToken: tokenSet.refreshToken,
        accessTokenExpiresAt: tokenSet.expiresAt,
        id: "",
        userId: user.id,
        createdAt: "",
        updatedAt: "",
      }),
    );

    reply.clearCookie(OAUTH_STATE_COOKIE, sessionCookieOptions(dependencies.config));
    reply.setCookie(SESSION_COOKIE, session.id, sessionCookieOptions(dependencies.config));
    return reply.redirect(`${dependencies.config.webUrl}/?auth=success`);
  });

  app.post("/api/v1/auth/digitalocean/disconnect", async (request, reply) => {
    const session = await loadSession(request, dependencies.sessionStore);
    if (!session) {
      throw new UnauthorizedError("No active session");
    }

    await dependencies.oauthClient.revokeToken(session.accessToken);
    await dependencies.sessionStore.delete(session.id);
    reply.clearCookie(SESSION_COOKIE, sessionCookieOptions(dependencies.config));
    return reply.status(204).send();
  });

  app.get("/api/v1/deployments", async (request) => {
    const session = await loadSession(request, dependencies.sessionStore);
    if (!session) {
      return { deployments: [] };
    }

    const deployments = await dependencies.store.listDeploymentsByUser(session.userId);
    const views = await Promise.all(
      deployments.map(async (deployment) =>
        buildDeploymentView(deployment, await dependencies.store.listDeploymentEvents(deployment.id)),
      ),
    );

    return {
      deployments: views.sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    };
  });

  app.get("/api/v1/deployments/:id", async (request) => {
    const session = await loadSession(request, dependencies.sessionStore);
    if (!session) {
      throw new NotFoundError("Deployment not found");
    }

    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const deployment = await dependencies.store.findDeploymentById(params.id);
    if (!deployment || deployment.userId !== session.userId) {
      throw new NotFoundError("Deployment not found");
    }

    const events = await dependencies.store.listDeploymentEvents(deployment.id);
    return buildDeploymentView(deployment, events);
  });

  app.post("/api/v1/deployments", async (request, reply) => {
    const session = await loadSession(request, dependencies.sessionStore);
    if (!session) {
      throw new UnauthorizedError("No active session");
    }

    const body = deploymentBodySchema.parse(request.body);
    const idempotencyKey =
      body.idempotencyKey ??
      z.string().optional().parse(request.headers["idempotency-key"]) ??
      crypto.randomUUID();

    const result = await deploymentService.createDeployment({
      userId: session.userId,
      idempotencyKey,
      telegramBotToken: body.telegramBotToken,
      openRouterApiKey: body.openRouterApiKey,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      accessTokenExpiresAt: session.accessTokenExpiresAt,
      region: body.region,
      sizeSlug: body.sizeSlug,
      imageSlug: body.imageSlug,
    });

    const events = await dependencies.store.listDeploymentEvents(result.deployment.id);
    return reply.status(202).send(buildDeploymentView(result.deployment, events));
  });

  app.post("/api/v1/deployments/:id/cancel", async (request) => {
    const session = await loadSession(request, dependencies.sessionStore);
    if (!session) {
      throw new NotFoundError("Deployment not found");
    }

    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const deployment = await deploymentService.cancelDeployment(params.id, session.userId);
    const events = await dependencies.store.listDeploymentEvents(deployment.id);
    return buildDeploymentView(deployment, events);
  });

  app.post("/api/v1/deployments/callback", async (request) => {
    const body = callbackBodySchema.parse(request.body);
    const deployment = await deploymentService.handleCallback(body);
    const events = await dependencies.store.listDeploymentEvents(deployment.id);
    return buildDeploymentView(deployment, events);
  });

  return app;
}
