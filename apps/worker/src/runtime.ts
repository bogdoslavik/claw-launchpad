import { PrismaClient } from "@prisma/client";
import { JsonLaunchpadStore, PrismaLaunchpadStore, SystemClock } from "@launchpad/core";
import { DoTsDigitalOceanClient } from "@launchpad/core/digitalocean";

export function buildWorkerDependencies(options: { databaseUrl?: string; storePath: string }) {
  const prisma = options.databaseUrl ? new PrismaClient() : undefined;

  return {
    clock: new SystemClock(),
    digitalOcean: new DoTsDigitalOceanClient(),
    store: prisma ? new PrismaLaunchpadStore(prisma) : new JsonLaunchpadStore(options.storePath),
  };
}
