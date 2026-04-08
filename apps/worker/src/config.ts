import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnvFile } from "@launchpad/core";
import { z } from "zod";

const configDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(configDir, "..");
const repoRoot = path.resolve(appDir, "../..");
const apiDir = path.resolve(repoRoot, "apps/api");

loadEnvFile(path.resolve(repoRoot, ".env"));
loadEnvFile(path.resolve(repoRoot, ".env.local"), { override: true });
loadEnvFile(path.resolve(apiDir, ".env"));
loadEnvFile(path.resolve(apiDir, ".env.local"), { override: true });
loadEnvFile(path.resolve(appDir, ".env"));
loadEnvFile(path.resolve(appDir, ".env.local"), { override: true });

const envSchema = z.object({
  DATABASE_URL: z.string().optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(10_000),
  LAUNCHPAD_STORE_PATH: z
    .string()
    .default(path.resolve(process.cwd(), ".launchpad/store.json")),
});

export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env) {
  return envSchema.parse(env);
}
