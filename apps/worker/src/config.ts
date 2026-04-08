import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnvFile } from "@launchpad/core";
import { z } from "zod";

import type { WorkerLogLevel } from "./logger.js";

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

const workerDefaults = {
  logLevel: "info" as const,
  pollIntervalMs: 10_000,
  storePath: path.resolve(process.cwd(), ".launchpad/store.json"),
};

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().optional(),
});

export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.parse(env);
  const logLevel: WorkerLogLevel = parsed.NODE_ENV === "test" ? "silent" : workerDefaults.logLevel;

  return {
    DATABASE_URL: parsed.DATABASE_URL,
    LOG_LEVEL: logLevel,
    WORKER_POLL_INTERVAL_MS: workerDefaults.pollIntervalMs,
    LAUNCHPAD_STORE_PATH: workerDefaults.storePath,
  };
}
