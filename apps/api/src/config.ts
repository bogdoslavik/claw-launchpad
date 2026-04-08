import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnvFile } from "@launchpad/core";
import { z } from "zod";

const configDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(configDir, "..");
const repoRoot = path.resolve(appDir, "../..");

loadEnvFile(path.resolve(repoRoot, ".env"));
loadEnvFile(path.resolve(repoRoot, ".env.local"), { override: true });
loadEnvFile(path.resolve(appDir, ".env"));
loadEnvFile(path.resolve(appDir, ".env.local"), { override: true });

const apiDefaults = {
  host: "0.0.0.0",
  port: 3001,
  logLevel: "info" as const,
  sessionTtlHours: 24,
  storePath: path.resolve(process.cwd(), ".launchpad/store.json"),
  oauthScopes: ["droplet:create", "droplet:read", "regions:read", "sizes:read", "actions:read", "image:read"],
  debugSshUser: "launchpad",
};

function loadLocalSshPublicKey() {
  const candidates = ["id_ed25519.pub", "id_rsa.pub", "id_ecdsa.pub"].map((name) => path.join(os.homedir(), ".ssh", name));

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) {
      continue;
    }

    const key = fs.readFileSync(candidate, "utf8").trim();
    if (key.length > 0) {
      return key;
    }
  }

  return undefined;
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  COOKIE_SECRET: z.string().min(16).default("launchpad-development-cookie-secret"),
  DATABASE_URL: z.string().optional(),
  DIGITALOCEAN_CLIENT_ID: z.string().default("digitalocean-client-id"),
  DIGITALOCEAN_CLIENT_SECRET: z.string().default("digitalocean-client-secret"),
  DIGITALOCEAN_REDIRECT_URI: z
    .string()
    .url()
    .default("http://localhost:3001/api/v1/auth/digitalocean/callback"),
  LAUNCHPAD_PUBLIC_API_URL: z.string().url().default("http://localhost:3001"),
  LAUNCHPAD_WEB_URL: z.string().url().default("http://localhost:3000"),
});

export type ApiConfig = ReturnType<typeof loadApiConfig>;

export function loadApiConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.parse(env);
  const debugSshPublicKey = parsed.NODE_ENV === "production" ? undefined : loadLocalSshPublicKey();

  return {
    nodeEnv: parsed.NODE_ENV,
    host: apiDefaults.host,
    port: apiDefaults.port,
    logLevel: parsed.NODE_ENV === "test" ? "silent" : apiDefaults.logLevel,
    cookieSecret: parsed.COOKIE_SECRET,
    cookieSecure: parsed.NODE_ENV === "production",
    sessionTtlHours: apiDefaults.sessionTtlHours,
    databaseUrl: parsed.DATABASE_URL,
    digitalOceanClientId: parsed.DIGITALOCEAN_CLIENT_ID,
    digitalOceanClientSecret: parsed.DIGITALOCEAN_CLIENT_SECRET,
    digitalOceanRedirectUri: parsed.DIGITALOCEAN_REDIRECT_URI,
    publicApiUrl: parsed.LAUNCHPAD_PUBLIC_API_URL,
    webUrl: parsed.LAUNCHPAD_WEB_URL,
    storePath: apiDefaults.storePath,
    oauthScopes: apiDefaults.oauthScopes,
    debugSshUser: apiDefaults.debugSshUser,
    debugSshPublicKey,
    sshTunnelUser: debugSshPublicKey ? apiDefaults.debugSshUser : "root",
  };
}
