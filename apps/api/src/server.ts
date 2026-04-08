import { createApp } from "./app.js";
import { loadApiConfig } from "./config.js";
import { buildApiDependencies } from "./runtime.js";

function usesLocalCallbackUrl(publicApiUrl: string) {
  const hostname = new URL(publicApiUrl).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

async function main() {
  const config = loadApiConfig();
  const app = await createApp(buildApiDependencies(config));
  await app.listen({
    host: config.host,
    port: config.port,
  });
  app.log.info({ host: config.host, port: config.port }, "API listening");

  if (usesLocalCallbackUrl(config.publicApiUrl)) {
    app.log.warn(
      {
        publicApiUrl: config.publicApiUrl,
      },
      "LAUNCHPAD_PUBLIC_API_URL points to localhost; a real DigitalOcean Droplet will not be able to send bootstrap callbacks here",
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
