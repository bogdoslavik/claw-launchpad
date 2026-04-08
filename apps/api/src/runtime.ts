import { PrismaClient } from "@prisma/client";
import { JsonLaunchpadStore, PrismaLaunchpadStore, SystemClock } from "@launchpad/core";
import { DigitalOceanOAuthFetchClient, DoTsDigitalOceanClient } from "@launchpad/core/digitalocean";

import type { ApiConfig } from "./config.js";
import { MemorySessionStore } from "./session-store.js";
import { PrismaSessionStore } from "./prisma-session-store.js";

export function buildApiDependencies(config: ApiConfig) {
  const clock = new SystemClock();
  const prisma = config.databaseUrl ? new PrismaClient() : undefined;

  return {
    config,
    clock,
    digitalOcean: new DoTsDigitalOceanClient(),
    oauthClient: new DigitalOceanOAuthFetchClient({
      clientId: config.digitalOceanClientId,
      clientSecret: config.digitalOceanClientSecret,
    }),
    sessionStore: prisma ? new PrismaSessionStore(prisma, clock) : new MemorySessionStore(clock),
    store: prisma ? new PrismaLaunchpadStore(prisma) : new JsonLaunchpadStore(config.storePath),
  };
}
