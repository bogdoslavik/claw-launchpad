import path from "node:path";

import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().optional(),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(10_000),
  LAUNCHPAD_STORE_PATH: z
    .string()
    .default(path.resolve(process.cwd(), ".launchpad/store.json")),
});

export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env) {
  return envSchema.parse(env);
}
