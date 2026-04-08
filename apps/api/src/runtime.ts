import { JsonLaunchpadStore, SystemClock } from "@launchpad/core";
import { DigitalOceanOAuthFetchClient, DoTsDigitalOceanClient } from "@launchpad/core/digitalocean";

import type { ApiConfig } from "./config.js";
import { MemorySessionStore } from "./session-store.js";

export function buildApiDependencies(config: ApiConfig) {
  return {
    config,
    clock: new SystemClock(),
    digitalOcean: new DoTsDigitalOceanClient(),
    oauthClient: new DigitalOceanOAuthFetchClient({
      clientId: config.digitalOceanClientId,
      clientSecret: config.digitalOceanClientSecret,
    }),
    sessionStore: new MemorySessionStore(),
    store: new JsonLaunchpadStore(config.storePath),
  };
}

