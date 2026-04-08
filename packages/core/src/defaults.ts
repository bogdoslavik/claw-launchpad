import type { LaunchpadDefaults } from "./types.js";

export const launchpadDefaults: LaunchpadDefaults = {
  callbackTokenTtlHours: 24,
  dropletImage: "ubuntu-24-04-x64",
  dropletRegion: "nyc1",
  dropletSize: "s-1vcpu-2gb",
  gatewayPort: 18789,
  openclawImage: "ghcr.io/openclaw/openclaw:2026.4.8",
  openclawModel: "openrouter/auto",
};
