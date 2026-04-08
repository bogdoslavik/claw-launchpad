import path from "node:path";

import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(3001),
  COOKIE_SECRET: z.string().min(16).default("launchpad-development-cookie-secret"),
  DIGITALOCEAN_CLIENT_ID: z.string().default("digitalocean-client-id"),
  DIGITALOCEAN_CLIENT_SECRET: z.string().default("digitalocean-client-secret"),
  DIGITALOCEAN_REDIRECT_URI: z
    .string()
    .url()
    .default("http://localhost:3001/api/v1/auth/digitalocean/callback"),
  LAUNCHPAD_PUBLIC_API_URL: z.string().url().default("http://localhost:3001"),
  LAUNCHPAD_WEB_URL: z.string().url().default("http://localhost:3000"),
  LAUNCHPAD_STORE_PATH: z
    .string()
    .default(path.resolve(process.cwd(), ".launchpad/store.json")),
  DIGITALOCEAN_OAUTH_SCOPES: z
    .string()
    .default("droplet:create droplet:read regions:read sizes:read actions:read image:read"),
});

export type ApiConfig = ReturnType<typeof loadApiConfig>;

export function loadApiConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.parse(env);

  return {
    nodeEnv: parsed.NODE_ENV,
    host: parsed.HOST,
    port: parsed.PORT,
    cookieSecret: parsed.COOKIE_SECRET,
    cookieSecure: parsed.NODE_ENV === "production",
    digitalOceanClientId: parsed.DIGITALOCEAN_CLIENT_ID,
    digitalOceanClientSecret: parsed.DIGITALOCEAN_CLIENT_SECRET,
    digitalOceanRedirectUri: parsed.DIGITALOCEAN_REDIRECT_URI,
    publicApiUrl: parsed.LAUNCHPAD_PUBLIC_API_URL,
    webUrl: parsed.LAUNCHPAD_WEB_URL,
    storePath: parsed.LAUNCHPAD_STORE_PATH,
    oauthScopes: parsed.DIGITALOCEAN_OAUTH_SCOPES.split(/\s+/u).filter(Boolean),
  };
}

