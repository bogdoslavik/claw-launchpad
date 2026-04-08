import path from "node:path";

import { loadEnvFile } from "@launchpad/core";
import { defineConfig } from "prisma/config";

loadEnvFile(path.resolve(process.cwd(), ".env"));
loadEnvFile(path.resolve(process.cwd(), ".env.local"), { override: true });
loadEnvFile(path.resolve(process.cwd(), "apps/api/.env"));
loadEnvFile(path.resolve(process.cwd(), "apps/api/.env.local"), { override: true });
loadEnvFile(path.resolve(process.cwd(), "apps/worker/.env"));
loadEnvFile(path.resolve(process.cwd(), "apps/worker/.env.local"), { override: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
