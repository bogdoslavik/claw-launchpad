import { loadWorkerConfig } from "./config.js";
import { LaunchpadWorker } from "./worker.js";
import { buildWorkerDependencies } from "./runtime.js";

const config = loadWorkerConfig();
const worker = new LaunchpadWorker(buildWorkerDependencies(config.LAUNCHPAD_STORE_PATH), config.WORKER_POLL_INTERVAL_MS);

worker.start();

process.on("SIGINT", () => {
  worker.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  worker.stop();
  process.exit(0);
});
