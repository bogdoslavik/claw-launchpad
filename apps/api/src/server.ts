import { createApp } from "./app.js";
import { loadApiConfig } from "./config.js";
import { buildApiDependencies } from "./runtime.js";

async function main() {
  const config = loadApiConfig();
  const app = await createApp(buildApiDependencies(config));
  await app.listen({
    host: config.host,
    port: config.port,
  });
  app.log.info({ host: config.host, port: config.port }, "API listening");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
