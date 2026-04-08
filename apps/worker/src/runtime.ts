import { JsonLaunchpadStore, SystemClock } from "@launchpad/core";
import { DoTsDigitalOceanClient } from "@launchpad/core/digitalocean";

export function buildWorkerDependencies(storePath: string) {
  return {
    clock: new SystemClock(),
    digitalOcean: new DoTsDigitalOceanClient(),
    store: new JsonLaunchpadStore(storePath),
  };
}
