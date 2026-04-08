import { existsSync } from "node:fs";

import { config as loadDotenv } from "dotenv";

export function loadEnvFile(path: string, options?: { override?: boolean }) {
  if (!existsSync(path)) {
    return;
  }

  loadDotenv({
    path,
    override: options?.override ?? false,
  });
}
